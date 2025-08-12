package device

import (
	"time"

	"github.com/google/uuid"
)

type DeviceDTO struct {
	ID           uuid.UUID `db:"id"`
	SerialNumber string    `db:"serial_number"`
	Token        string    `db:"serial"`
	DeviceName   string    `db:"device_name"`
	IsActive     bool      `db:"is_active"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
	LastSeen     time.Time `db:"last_seen"`
	Notes        string    `db:"notes"`
}
