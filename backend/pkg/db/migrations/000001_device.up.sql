CREATE TABLE IF NOT EXISTS esp32_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number VARCHAR(64) NOT NULL UNIQUE,
    token VARCHAR(128) NOT NULL UNIQUE,
    device_name VARCHAR(100),
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_esp32_token ON esp32_devices(token);
CREATE INDEX IF NOT EXISTS idx_esp32_serial ON esp32_devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_esp32_active ON esp32_devices(is_active);
CREATE INDEX IF NOT EXISTS idx_esp32_last_seen ON esp32_devices(last_seen);

CREATE TRIGGER IF NOT EXISTS update_esp32_timestamp
    AFTER UPDATE ON esp32_devices
    FOR EACH ROW
BEGIN
    UPDATE esp32_devices SET update_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

INSERT INTO esp32_devices ("serial_number", "token") VALUES ('esptest', 'DRDAfZO4HIeyAdgOqfZk7CYGudfZS4Yz1SaFKxypUXXUSljlcJvqkTVzmXk9DvMg');