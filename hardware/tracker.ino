#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include "FS.h"
#include "SPIFFS.h"
#include <ArduinoJson.h>
#include <time.h>

// ===========================
// ====== CONFIGURATION ======
// ===========================

// --- GPS Module Pins (GT-U7) ---
#define RXD2 25  // ESP32 RX pin connected to GT-U7 TX
#define TXD2 26  // ESP32 TX pin connected to GT-U7 RX

// --- Operation Mode ---
const bool USE_SIMULATED_GPS = true;

// --- WiFi Credentials ---
const char* ssid = "HOTSPOT_SSID";
const char* password = "HOTSPOT_PASSWORD";

// --- Server Endpoint ---
const char* serverUrl = "http://server.com/api";

// --- Authentication Headers ---
const char* headerToken = "YOUR_SECRET_TOKEN_HERE";
const char* headerDevice = "ESP32-GPS-001";

// --- NTP Configuration ---
const char* ntpServer1 = "0.it.pool.ntp.org";
const char* ntpServer2 = "1.it.pool.ntp.org";
const char* ntpServer3 = "2.it.pool.ntp.org";
const long gmtOffset_sec = 3600;      // GMT+1 for Italy
const int daylightOffset_sec = 3600;  // Daylight saving time offset

// --- Device Settings ---
const char* DEVICE_ID = "ESP32-Tracker-01";
const unsigned long sendInterval = 10000;  // Send data every 10 seconds
const unsigned long gpsTimeout = 5000;     // GPS fix timeout in milliseconds

// --- Simulated GPS Data ---
struct SimulatedPoint {
  float latitude;
  float longitude;
  float speed;
  unsigned long long created_at;
};

const SimulatedPoint simulatedData[] = {
  { 40.95951, 14.87893, 7.8, 1754742432646ULL },
  { 40.959554660829376, 14.878881194115975, 7.0, 1754742442646ULL },
  { 40.9596, 14.87883, 20.8, 1754742447646ULL },
  { 40.959672206829644, 14.878781536503997, 20.6, 1754742457646ULL },
  { 40.95974107174528, 14.87872655789003, 2.3, 1754742462646ULL },
  { 40.95973800832335, 14.878723074320316, 0.2, 1754742472646ULL },
  { 40.959738977176315, 14.878721970989172, 3.1, 1754742482646ULL },
  { 40.95981, 14.87859, 9.5, 1754742492646ULL },
  { 40.95989296148769, 14.878507968605433, 9.5, 1754742502646ULL },
  { 40.95997, 14.87842, 22.7, 1754742507646ULL },
  { 40.96004433256157, 14.878356454287065, 22.4, 1754742517646ULL },
  { 40.96011, 14.87829, 9.9, 1754742522646ULL },
  { 40.9602141342081, 14.878230661960636, 10.0, 1754742532646ULL },
  { 40.96031, 14.87818, 15.2, 1754742537646ULL },
  { 40.960425901741424, 14.87818425896965, 15.8, 1754742547646ULL },
  { 40.96054269261987, 14.878181273845671, 0.7, 1754742552646ULL },
  { 40.96055896222725, 14.878180892112818, 3.7, 1754742562646ULL },
  { 40.960555802484414, 14.87818919676916, 3.1, 1754742572646ULL },
  { 40.960558189628756, 14.87818320346915, 2.1, 1754742582646ULL },
  { 40.960552363551976, 14.878184338460738, 1.5, 1754742592646ULL }
};

const int simulatedDataPoints = sizeof(simulatedData) / sizeof(simulatedData[0]);
int simulatedIndex = 0;

// ==============================
// ====== GLOBAL VARIABLES ======
// ==============================
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
unsigned long lastSendTime = 0;
unsigned long startGetFixmS;
unsigned long endFixmS;
bool ntpTimeSet = false;

// =======================
// ====== SETUP ==========
// =======================
void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("=================================");
  Serial.println("ESP32 GPS Tracker Starting...");
  Serial.print("Mode: ");
  Serial.println(USE_SIMULATED_GPS ? "SIMULATED GPS" : "REAL GPS");
  Serial.println("=================================");

  // Initialize GPS serial only if using real GPS
  if (!USE_SIMULATED_GPS) {
    gpsSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);
    Serial.println("GPS Serial initialized on pins RX=25, TX=26");
  }

  // Initialize SPIFFS for caching
  if (!SPIFFS.begin(true)) {
    Serial.println("An Error has occurred while mounting SPIFFS");
    return;
  }
  Serial.println("SPIFFS mounted successfully");

  // Clear cache on startup (remove old cached data)
  if (SPIFFS.exists("/cache.txt")) {
    if (SPIFFS.remove("/cache.txt")) {
      Serial.println("Previous cache file deleted");
    } else {
      Serial.println("Failed to delete cache file");
    }
  }

  // Connect to WiFi
  connectWiFi();

  // Initialize NTP if WiFi is connected
  if (WiFi.status() == WL_CONNECTED) {
    initNTP();
  }
}

// =======================
// ====== MAIN LOOP ======
// =======================
void loop() {
  bool hasValidData = false;

  if (USE_SIMULATED_GPS) {
    // In simulation mode, we always have valid data
    hasValidData = true;
  } else {
    // Read from real GPS module
    startGetFixmS = millis();

    // Try to get GPS fix with timeout
    if (gpsWaitFix(gpsTimeout)) {
      hasValidData = gps.location.isValid() && gps.location.isUpdated();
      if (hasValidData) {
        Serial.println("GPS Fix obtained!");
      }
    } else {
      Serial.print(F("Timeout - No GPS Fix after "));
      Serial.print((millis() - startGetFixmS) / 1000);
      Serial.println(F(" seconds"));
    }
  }

  // Check if it's time to send data
  if (millis() - lastSendTime >= sendInterval && hasValidData) {
    lastSendTime = millis();

    String jsonData = createDataJson();

    if (WiFi.status() == WL_CONNECTED) {
      // First, try to send any cached data
      sendCachedData();

      // Then, send the current data point
      if (!sendToServer(jsonData)) {
        saveToCache(jsonData);  // Save current data if sending fails
      }
    } else {
      // If no WiFi, cache the data and try to reconnect
      saveToCache(jsonData);
      Serial.println("No WiFi connection. Data cached. Attempting to reconnect...");
      connectWiFi();
    }

    // If using simulated GPS, cycle through the data points
    if (USE_SIMULATED_GPS) {
      simulatedIndex = (simulatedIndex + 1) % simulatedDataPoints;
    }
  }
}

// =======================
// ====== FUNCTIONS ======
// =======================

/**
 * @brief Waits for GPS fix with timeout
 * @param waitmS Maximum time to wait in milliseconds
 * @return True if fix obtained, false if timeout
 */
bool gpsWaitFix(uint16_t waitmS) {
  uint32_t startmS = millis();
  uint8_t GPSchar;

  Serial.print(F("Waiting for GPS Fix (max "));
  Serial.print(waitmS / 1000);
  Serial.println(F(" seconds)..."));

  while ((uint32_t)(millis() - startmS) < waitmS) {
    while (gpsSerial.available() > 0) {
      GPSchar = gpsSerial.read();
      gps.encode(GPSchar);
    }

    // Check if we have valid location data
    if (gps.location.isValid() && gps.location.isUpdated()) {
      endFixmS = millis();
      Serial.print(F("GPS Fix obtained in "));
      Serial.print(endFixmS - startmS);
      Serial.println(F(" ms"));
      displayGPSInfo();
      return true;
    }
  }
  return false;
}

/**
 * @brief Displays current GPS information
 */
void displayGPSInfo() {
  if (USE_SIMULATED_GPS) {
    Serial.print(F("Simulated GPS - Lat: "));
    Serial.print(simulatedData[simulatedIndex].latitude, 6);
    Serial.print(F(", Lon: "));
    Serial.print(simulatedData[simulatedIndex].longitude, 6);
    Serial.print(F(", Speed: "));
    Serial.print(simulatedData[simulatedIndex].speed, 1);
    Serial.println(F(" m/s"));
  } else {
    Serial.print(F("GPS Fix - Lat: "));
    Serial.print(gps.location.lat(), 6);
    Serial.print(F(", Lon: "));
    Serial.print(gps.location.lng(), 6);
    Serial.print(F(", Alt: "));
    Serial.print(gps.altitude.meters(), 1);
    Serial.print(F(" m, Sats: "));
    Serial.print(gps.satellites.value());
    Serial.print(F(", Speed: "));
    Serial.println(gps.speed.kmph(), 1);  // Speed in m/s
  }
}

/**
 * @brief Initializes NTP time synchronization
 */
void initNTP() {
  Serial.println("Initializing NTP time synchronization...");

  // Configure NTP with Italian pool servers
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer1, ntpServer2, ntpServer3);

  // Wait for time to be set
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 10) {
    Serial.print(".");
    delay(1000);
    attempts++;
  }

  if (getLocalTime(&timeinfo)) {
    Serial.println("\nNTP time synchronized!");
    Serial.printf("Current time: %02d:%02d:%02d %02d/%02d/%04d\n",
                  timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec,
                  timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900);
    ntpTimeSet = true;
  } else {
    Serial.println("\nFailed to obtain NTP time");
    ntpTimeSet = false;
  }
}

/**
 * @brief Gets current Unix timestamp in milliseconds
 * @return Unix timestamp in milliseconds
 */
unsigned long long getCurrentTimestamp() {
    if (ntpTimeSet) {
        struct tm timeinfo;
        if (!getLocalTime(&timeinfo)) {
            Serial.println("Failed to obtain time");
            return millis() / 1000; // Fallback to millis converted to seconds
        }
        time_t now;
        time(&now);
        // Return timestamp in seconds (last 3 digits removed)
        return (unsigned long long)now;
    } else {
        // If NTP not set, return millis converted to seconds
        return millis() / 1000;
    }
}

/**
 * @brief Connects to the configured WiFi network
 */
void connectWiFi() {
  Serial.printf("Connecting to %s ", ssid);
  WiFi.begin(ssid, password);

  // Wait for connection with timeout
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    // Try to sync NTP time if not already synced
    if (!ntpTimeSet) {
      initNTP();
    }
  } else {
    Serial.println("\nWiFi connection failed.");
  }
}

/**
 * @brief Creates a JSON string for a single data point matching Go backend NewWaypointDTO
 * @return A String containing the JSON payload
 */
String createDataJson() {
  String json = "{";

  if (USE_SIMULATED_GPS) {
    // Use simulated data matching your Go backend structure
    json += "\"latitude\":" + String(simulatedData[simulatedIndex].latitude, 6) + ",";
    json += "\"longitude\":" + String(simulatedData[simulatedIndex].longitude, 6) + ",";
    json += "\"speed\":" + String((int)simulatedData[simulatedIndex].speed) + ",";

    unsigned long long timestamp = getCurrentTimestamp();

    // Convert to string properly for large numbers
    char timestampStr[20];
    sprintf(timestampStr, "%llu", timestamp);
    json += "\"created_at\":" + String(timestampStr);
  } else {
    // Use real GPS data
    json += "\"latitude\":" + String(gps.location.lat(), 6) + ",";
    json += "\"longitude\":" + String(gps.location.lng(), 6) + ",";

    // Convert GPS speed to int (m/s)
    int speed = (int)gps.speed.kmph();
    json += "\"speed\":" + String(speed) + ",";

    // Use NTP synchronized timestamp
    unsigned long long timestamp = getCurrentTimestamp();
    char timestampStr[20];
    sprintf(timestampStr, "%llu", timestamp);
    json += "\"created_at\":" + String(timestampStr);
  }

  json += "}";

  Serial.print("Data prepared: ");
  Serial.println(json);

  return json;
}

/**
 * @brief Sends a JSON payload to the server
 * @param jsonPayload The JSON string to send
 * @return True if the server responded with a success code (2xx), false otherwise
 */
bool sendToServer(String jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot send - WiFi not connected");
    return false;
  }

  HTTPClient http;
  http.begin(serverUrl);

  // Add required headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Header-Token", headerToken);
  http.addHeader("X-Header-Device", headerDevice);

  Serial.printf("Sending to %s\n", serverUrl);
  Serial.printf("Headers: X-Header-Token: %s, X-Header-Device: %s\n", headerToken, headerDevice);
  Serial.printf("Payload: %s\n", jsonPayload.c_str());

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.printf("HTTP Response code: %d\n", httpResponseCode);
    String response = http.getString();
    Serial.printf("Response: %s\n", response.c_str());
  } else {
    Serial.printf("Error on sending POST: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();

  // Consider codes in the 200-299 range as success
  return (httpResponseCode >= 200 && httpResponseCode < 300);
}

/**
 * @brief Saves a data point to the cache file on SPIFFS
 * @param json The JSON string to save
 */
void saveToCache(String json) {
  File file = SPIFFS.open("/cache.txt", FILE_APPEND);
  if (!file) {
    Serial.println("Failed to open cache file for writing.");
    return;
  }

  if (file.println(json)) {
    Serial.println("Data saved to cache.");
  } else {
    Serial.println("Failed to write to cache.");
  }
  file.close();
}

/**
 * @brief Reads all cached data, batches it into a JSON array, and sends it
 */
void sendCachedData() {
  File file = SPIFFS.open("/cache.txt", FILE_READ);
  if (!file || !file.available()) {
    if (file) file.close();
    return;
  }

  Serial.println("Found cached data. Attempting to send...");

  // Count lines first to check if worth sending
  int lineCount = 0;
  while (file.available()) {
    file.readStringUntil('\n');
    lineCount++;
  }

  if (lineCount == 0) {
    file.close();
    return;
  }

  // Reset file position
  file.close();
  file = SPIFFS.open("/cache.txt", FILE_READ);

  String payload = "[";
  bool first = true;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (!first) {
        payload += ",";
      }
      payload += line;
      first = false;
    }
  }
  payload += "]";

  file.close();

  Serial.printf("Sending %d cached data points...\n", lineCount);

  if (sendToServer(payload)) {
    SPIFFS.remove("/cache.txt");
    Serial.println("Cached data sent successfully and cache cleared.");
  } else {
    Serial.println("Failed to send cached data. Will retry next time.");
  }
}