DROP TRIGGER IF EXISTS update_esp32_timestamp;

DROP INDEX IF EXISTS idx_esp32_token;
DROP INDEX IF EXISTS idx_esp32_serial;
DROP INDEX IF EXISTS idx_esp32_active;
DROP INDEX IF EXISTS idx_esp32_last_seen;

DROP TABLE IF EXISTS esp32_devices;