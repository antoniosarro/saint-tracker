#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <time.h>
#include <LiquidCrystal.h>
#include <Preferences.h>

// ===========================
// ====== CONFIGURATION ======
// ===========================

// --- GPS Module Pins (GT-U7) ---
#define RXD2 34  // ESP32 RX pin connected to GT-U7 TX
#define TXD2 35  // ESP32 TX pin connected to GT-U7 RX

// --- LCD Configuration (Parallel Connection) ---
// LCD pins connected to ESP32
#define LCD_RS 13  // Register Select pin
#define LCD_EN 12  // Enable pin
#define LCD_D4 14  // Data pin 4
#define LCD_D5 27  // Data pin 5
#define LCD_D6 26  // Data pin 6
#define LCD_D7 25  // Data pin 7

#define LCD_COLUMNS 16
#define LCD_ROWS 2

// --- Operation Mode ---
const bool USE_SIMULATED_GPS = false;

// --- WiFi Credentials ---
const char* ssid = "Saint Tracker";
const char* password = "BkRJxGYCqNau";

// --- Server Endpoint ---
const char* serverUrl = "https://backend.saintracker.it/api/v1/waypoint/register";

// --- Authentication Headers ---
const char* headerToken = "DRDAfZO4HIeyAdgOqfZk7CYGudfZS4Yz1SaFKxypUXXUSljlcJvqkTVzmXk9DvMg";
const char* headerDevice = "esptest";

// --- NTP Configuration ---
const char* ntpServer1 = "0.it.pool.ntp.org";
const char* ntpServer2 = "1.it.pool.ntp.org";
const char* ntpServer3 = "2.it.pool.ntp.org";
const long gmtOffset_sec = 3600;      // GMT+1 for Italy
const int daylightOffset_sec = 3600;  // Daylight saving time offset

// --- Device Settings ---
const char* DEVICE_ID = "ESP32-Tracker-01";
const unsigned long sendInterval = 5000;       // Send data every 5 seconds
const unsigned long gpsTimeout = 5000;         // GPS fix timeout in milliseconds
const unsigned long lcdUpdateInterval = 2000;  // Update LCD every 2 seconds
const unsigned long wifiCheckInterval = 5000;  // Check WiFi every 5 seconds
const unsigned long ntpCheckInterval = 60000;  // Check NTP every 5 minutes

// --- Cache Configuration ---
const int MAX_CACHE_SIZE = 100;

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

// Cache structure for Preferences
struct LocationData {
  double latitude;
  double longitude;
  float speed;
  unsigned long timestamp;
};

// ==============================
// ====== GLOBAL VARIABLES ======
// ==============================
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
LiquidCrystal lcd(LCD_RS, LCD_EN, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
Preferences preferences;

unsigned long lastSendTime = 0;
unsigned long lastLCDUpdate = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastNTPCheck = 0;
unsigned long startGetFixmS;
unsigned long endFixmS;
bool ntpTimeSet = false;
bool wifiConnected = false;
bool wasConnectedBefore = false;
bool hasValidGPSFix = false;
int totalDataSent = 0;
int cachedDataCount = 0;

LocationData dataCache[MAX_CACHE_SIZE];

// LCD Display modes
enum LCDDisplayMode {
  LCD_GPS_INFO,
  LCD_WIFI_STATUS,
  LCD_DATA_STATS,
  LCD_TIME_INFO,
  LCD_MODES_COUNT
};

LCDDisplayMode currentLCDMode = LCD_GPS_INFO;
unsigned long lastModeChange = 0;
const unsigned long modeChangeInterval = 5000;

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

  // Initialize LCD
  lcd.begin(LCD_COLUMNS, LCD_ROWS);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("GPS Tracker");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  delay(2000);

  // Initialize GPS serial only if using real GPS
  if (!USE_SIMULATED_GPS) {
    gpsSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);
    Serial.println("GPS Serial initialized on pins RX=34, TX=35");
  }

  // Initialize Preferences for caching
  if (!preferences.begin("gps_cache", false)) {
    Serial.println("Failed to initialize Preferences");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Prefs Error!");
    delay(3000);
  } else {
    Serial.println("Preferences initialized successfully");
    loadCacheFromPreferences();
  }

  // Connect to WiFi
  connectWiFi();

  // Initial LCD display
  updateLCD();
}

// =======================
// ====== MAIN LOOP ======
// =======================
void loop() {
  // Check WiFi connection status periodically
  if (millis() - lastWiFiCheck >= wifiCheckInterval) {
    checkWiFiConnection();
    lastWiFiCheck = millis();
  }

  bool hasValidData = false;

  if (USE_SIMULATED_GPS) {
    // In simulation mode, we always have valid data
    hasValidData = true;
    hasValidGPSFix = true;
  } else {
    // Read from real GPS module
    startGetFixmS = millis();

    // Try to get GPS fix with timeout
    if (gpsWaitFix(gpsTimeout)) {
      // Check validity once and store the result
      hasValidData = gps.location.isValid();
      hasValidGPSFix = hasValidData;

      if (hasValidData) {
        Serial.println("GPS Fix obtained!");
      }
    } else {
      hasValidGPSFix = false;
      Serial.print(F("Timeout - No GPS Fix after "));
      Serial.print((millis() - startGetFixmS) / 1000);
      Serial.println(F(" seconds"));
    }
  }

  // Check if it's time to send data
  if (millis() - lastSendTime >= sendInterval && hasValidData) {
    lastSendTime = millis();
    sendLocationData();

    // If using simulated GPS, cycle through the data points
    if (USE_SIMULATED_GPS) {
      simulatedIndex = (simulatedIndex + 1) % simulatedDataPoints;
    }
  }

  // Update LCD display
  if (millis() - lastLCDUpdate >= lcdUpdateInterval) {
    updateLCD();
    lastLCDUpdate = millis();
  }

  // Change LCD display mode automatically
  if (millis() - lastModeChange >= modeChangeInterval) {
    currentLCDMode = (LCDDisplayMode)((currentLCDMode + 1) % LCD_MODES_COUNT);
    lastModeChange = millis();
  }

  // Periodic NTP check if connected
  if (wifiConnected && (millis() - lastNTPCheck >= ntpCheckInterval)) {
    checkNTPSync();
    lastNTPCheck = millis();
  }
}

/**
 * @brief Sends a single location data point to the server
 * @param lat Latitude
 * @param lng Longitude  
 * @param speed Speed in km/h
 * @param timestamp Unix timestamp
 * @return True if successful, false otherwise
 */
bool sendSingleLocationData(double lat, double lng, float speed, unsigned long timestamp) {
  if (!wifiConnected) return false;

  HTTPClient http;
  http.begin(serverUrl);

  // Add required headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Header-Token", headerToken);
  http.addHeader("X-Header-Device", headerDevice);

  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["latitude"] = lat;
  doc["longitude"] = lng;
  doc["speed"] = (int)speed;
  doc["created_at"] = timestamp;

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.printf("Sending to %s\n", serverUrl);
  Serial.printf("Payload: %s\n", jsonString.c_str());

  int httpResponseCode = http.POST(jsonString);

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
 * @brief Main function to send location data (online or cache offline)
 */
void sendLocationData() {
  double lat, lng;
  float speed;
  unsigned long timestamp = getCurrentTimestamp();

  if (USE_SIMULATED_GPS) {
    lat = simulatedData[simulatedIndex].latitude;
    lng = simulatedData[simulatedIndex].longitude;
    speed = simulatedData[simulatedIndex].speed;
  } else {
    lat = gps.location.lat();
    lng = gps.location.lng();
    speed = gps.speed.kmph();
  }

  if (wifiConnected) {
    // Send data immediately
    bool success = sendSingleLocationData(lat, lng, speed, timestamp);

    if (success) {
      totalDataSent++;
    } else {
      // If sending failed, cache the data only if we have NTP time
      if (ntpTimeSet) {
        cacheLocationData(lat, lng, speed, timestamp);
        Serial.println("Send failed - data cached with NTP timestamp");
      } else {
        Serial.println("Send failed - data discarded (no NTP timestamp)");
      }
    }
  } else {
    // Cache data when offline only if we have NTP time
    if (ntpTimeSet) {
      cacheLocationData(lat, lng, speed, timestamp);
      Serial.println("No WiFi - data cached with NTP timestamp");
    } else {
      Serial.println("No WiFi - data discarded (no valid NTP timestamp)");
    }
  }
}

/**
 * @brief Connects to the configured WiFi network
 */
void connectWiFi() {
  Serial.printf("Connecting to %s ", ssid);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  lcd.setCursor(0, 1);
  lcd.print(ssid);

  WiFi.begin(ssid, password);

  // Wait for connection with timeout
  unsigned long start = millis();
  int dots = 0;
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");

    // Show progress on LCD
    if (dots < 16) {
      lcd.setCursor(dots, 1);
      lcd.print(".");
      dots++;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(3000);

    // Try to sync NTP time
    initNTP();

    // Send cached data if available and this is a reconnection
    if (cachedDataCount > 0) {
      sendCachedData();
    }

    wasConnectedBefore = true;
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi connection failed.");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    delay(2000);
  }
}

/**
 * @brief Gets current Unix timestamp in seconds
 * @return Unix timestamp in seconds
 */
unsigned long getCurrentTimestamp() {
  if (ntpTimeSet) {
    time_t now;
    time(&now);
    return (unsigned long)now;
  } else {
    // If NTP not set, return millis converted to seconds
    return millis() / 1000;
  }
}

/**
 * @brief Checks NTP synchronization status
 */
void checkNTPSync() {
  if (!wifiConnected) return;

  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    if (!ntpTimeSet) {
      ntpTimeSet = true;
      Serial.println("NTP re-synchronized!");
    }
  } else {
    ntpTimeSet = false;
    Serial.println("NTP sync lost, re-initializing...");
    initNTP();
  }
}

/**
 * @brief Checks WiFi connection status and handles reconnection
 */
void checkWiFiConnection() {
  bool currentStatus = (WiFi.status() == WL_CONNECTED);

  // WiFi status changed
  if (currentStatus != wifiConnected) {
    wifiConnected = currentStatus;

    if (wifiConnected) {
      Serial.println("WiFi reconnected!");

      // Re-initialize NTP after reconnection
      initNTP();

      // Send cached data if available
      if (cachedDataCount > 0) {
        sendCachedData();
      }

      wasConnectedBefore = true;
    } else {
      Serial.println("WiFi disconnected!");
      ntpTimeSet = false;  // Reset NTP sync status
    }
  }

  // If disconnected and was connected before, try to reconnect
  if (!wifiConnected && wasConnectedBefore) {
    Serial.println("Attempting WiFi reconnection...");
    connectWiFi();
  }
}


/**
 * @brief Initializes NTP time synchronization
 */
void initNTP() {
  if (!wifiConnected) return;

  Serial.println("Initializing NTP time synchronization...");

  // Show NTP sync on LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Syncing NTP...");

  // Configure NTP with Italian pool servers
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer1, ntpServer2, ntpServer3);

  // Wait for time to be set
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 10) {
    Serial.print(".");
    lcd.setCursor(attempts, 1);
    lcd.print(".");
    delay(1000);
    attempts++;
  }

  if (getLocalTime(&timeinfo)) {
    Serial.println("\nNTP time synchronized!");
    Serial.printf("Current time: %02d:%02d:%02d %02d/%02d/%04d\n",
                  timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec,
                  timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900);
    ntpTimeSet = true;

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("NTP Synced!");
    lcd.setCursor(0, 1);
    lcd.printf("%02d:%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    delay(2000);
  } else {
    Serial.println("\nFailed to obtain NTP time");
    ntpTimeSet = false;

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("NTP Failed!");
    delay(2000);
  }
}

/**
 * @brief Waits for GPS fix with timeout
 * @param waitmS Maximum time to wait in milliseconds
 * @return True if fix obtained, false if timeout
 */
bool gpsWaitFix(uint16_t waitmS) {
  uint32_t startmS = millis();
  uint8_t GPSchar;
  bool locationUpdated = false;

  Serial.print(F("Waiting for GPS Fix (max "));
  Serial.print(waitmS / 1000);
  Serial.println(F(" seconds)..."));

  while ((uint32_t)(millis() - startmS) < waitmS) {
    while (gpsSerial.available() > 0) {
      GPSchar = gpsSerial.read();
      gps.encode(GPSchar);

      // Check if location was just updated
      if (gps.location.isUpdated()) {
        locationUpdated = true;
      }
    }

    // Check if we have valid location data and it was recently updated
    if (gps.location.isValid() && locationUpdated) {
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
    Serial.println(F(" km/h"));
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
    Serial.print(gps.speed.kmph(), 1);
    Serial.println(F(" km/h"));
  }
}

/**
 * @brief Updates the LCD display with current information
 */
void updateLCD() {
  lcd.clear();

  switch (currentLCDMode) {
    case LCD_GPS_INFO:
      displayGPSOnLCD();
      break;
    case LCD_WIFI_STATUS:
      displayWiFiOnLCD();
      break;
    case LCD_DATA_STATS:
      displayDataStatsOnLCD();
      break;
    case LCD_TIME_INFO:
      displayTimeOnLCD();
      break;
  }
}

/**
 * @brief Displays GPS information on LCD
 */
void displayGPSOnLCD() {
  lcd.setCursor(0, 0);
  lcd.print("GPS:");

  if (hasValidGPSFix) {
    lcd.print(" FIXED");
    lcd.setCursor(0, 1);
    if (USE_SIMULATED_GPS) {
      lcd.print("S:");
      lcd.print(simulatedData[simulatedIndex].speed, 1);
      lcd.print("km/h");
    } else {
      lcd.print("S:");
      lcd.print(gps.speed.kmph(), 1);
      lcd.print("km/h ");
      lcd.print(gps.satellites.value());
      lcd.print("sat");
    }
  } else {
    lcd.print(" NO FIX");
    lcd.setCursor(0, 1);
    lcd.print("Searching...");
  }

  // Show cache info if there's cached data
  if (cachedDataCount > 0) {
    lcd.setCursor(10, 1);
    lcd.print("C:");
    lcd.print(cachedDataCount);
  }
}

/**
 * @brief Displays WiFi status on LCD
 */
void displayWiFiOnLCD() {
  lcd.setCursor(0, 0);
  lcd.print("WiFi: ");

  if (wifiConnected) {
    lcd.print("OK");
    lcd.setCursor(0, 1);
    lcd.print("RSSI:");
    lcd.print(WiFi.RSSI());
    lcd.print("dBm");
  } else {
    lcd.print("DOWN");
    lcd.setCursor(0, 1);
    lcd.print("Reconnecting...");
  }
}

/**
 * @brief Displays data transmission statistics on LCD
 */
void displayDataStatsOnLCD() {
  lcd.setCursor(0, 0);
  lcd.print("Sent:");
  lcd.print(totalDataSent);

  lcd.setCursor(0, 1);
  if (ntpTimeSet) {
    lcd.print("Cached:");
    lcd.print(cachedDataCount);
  } else {
    lcd.print("No NTP-NoCache");
  }
}

/**
 * @brief Displays current time on LCD
 */
void displayTimeOnLCD() {
  lcd.setCursor(0, 0);
  if (ntpTimeSet) {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
      lcd.printf("%02d:%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
      lcd.setCursor(0, 1);
      lcd.printf("%02d/%02d/%04d", timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900);
    } else {
      lcd.print("Time: ERROR");
      lcd.setCursor(0, 1);
      lcd.print("NTP Failed");
    }
  } else {
    lcd.print("Time: NO NTP");
    lcd.setCursor(0, 1);
    lcd.print("Uptime:");
    lcd.print(millis() / 1000);
    lcd.print("s");
  }
}

/**
 * @brief Caches location data when offline or sending fails
 * @param lat Latitude
 * @param lng Longitude
 * @param speed Speed in km/h  
 * @param timestamp Unix timestamp
 */
void cacheLocationData(double lat, double lng, float speed, unsigned long timestamp) {
  if (cachedDataCount >= MAX_CACHE_SIZE) {
    Serial.println("Cache full, removing oldest entry");
    // Shift array to remove oldest entry
    for (int i = 0; i < MAX_CACHE_SIZE - 1; i++) {
      dataCache[i] = dataCache[i + 1];
    }
    cachedDataCount = MAX_CACHE_SIZE - 1;
  }

  // Add new data to cache
  dataCache[cachedDataCount].latitude = lat;
  dataCache[cachedDataCount].longitude = lng;
  dataCache[cachedDataCount].speed = speed;
  dataCache[cachedDataCount].timestamp = timestamp;
  cachedDataCount++;

  // Save cache to preferences
  saveCacheToPreferences();

  Serial.println("Data cached (" + String(cachedDataCount) + " items)");
}

/**
 * @brief Saves the cache to ESP32 Preferences (flash storage)
 */
void saveCacheToPreferences() {
  preferences.putInt("cacheCount", cachedDataCount);
  for (int i = 0; i < cachedDataCount; i++) {
    String key = "cache_" + String(i);
    preferences.putBytes(key.c_str(), &dataCache[i], sizeof(LocationData));
  }
}

/**
 * @brief Sends all cached data to the server
 */
void sendCachedData() {
  if (!wifiConnected || cachedDataCount == 0) return;

  Serial.println("Sending cached data (" + String(cachedDataCount) + " items)...");

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Header-Token", headerToken);
  http.addHeader("X-Header-Device", headerDevice);

  // Create JSON array for multiple items
  DynamicJsonDocument doc(8192);  // Larger buffer for array
  JsonArray dataArray = doc.to<JsonArray>();

  for (int i = 0; i < cachedDataCount; i++) {
    JsonObject item = dataArray.createNestedObject();
    item["latitude"] = dataCache[i].latitude;
    item["longitude"] = dataCache[i].longitude;
    item["speed"] = (int)dataCache[i].speed;
    item["created_at"] = dataCache[i].timestamp;
  }

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("Sending cached data: " + jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Cached data HTTP Response: " + String(httpResponseCode));
    Serial.println("Response: " + response);

    if (httpResponseCode >= 200 && httpResponseCode < 300) {
      // Clear cache on successful send
      clearCache();
      totalDataSent += cachedDataCount;
      Serial.println("Cache cleared after successful send");
    }
  } else {
    Serial.println("Failed to send cached data: " + String(httpResponseCode));
  }

  http.end();
}

/**
 * @brief Loads the cache from ESP32 Preferences (flash storage)
 */
void loadCacheFromPreferences() {
  cachedDataCount = preferences.getInt("cacheCount", 0);
  if (cachedDataCount > MAX_CACHE_SIZE) {
    cachedDataCount = 0;
  }

  for (int i = 0; i < cachedDataCount; i++) {
    String key = "cache_" + String(i);
    size_t bytesRead = preferences.getBytes(key.c_str(), &dataCache[i], sizeof(LocationData));
    if (bytesRead != sizeof(LocationData)) {
      // If we can't read the data properly, reset cache
      Serial.println("Cache data corruption detected, clearing cache");
      clearCache();
      break;
    }
  }
  Serial.println("Loaded " + String(cachedDataCount) + " cached items from preferences");
}

/**
 * @brief Clears the data cache
 */
void clearCache() {
  cachedDataCount = 0;
  preferences.clear();
  Serial.println("Cache cleared");
}