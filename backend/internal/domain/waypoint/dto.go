package waypoint

import (
	"time"

	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/validate"
	"github.com/google/uuid"

	validation "github.com/go-ozzo/ozzo-validation"
)

type WaypointDTO struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Latitude  float32   `db:"latitude" json:"latitude"`
	Longitude float32   `db:"longitude" json:"longitude"`
	Speed     int       `db:"speed" json:"speed"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

type NewWaypointDTO struct {
	Latitude  float32 `json:"latitude"`
	Longitude float32 `json:"longitude"`
	Speed     int     `json:"speed"`
	CreatedAt int64   `json:"created_at"`
}

func (w NewWaypointDTO) Validate() error {
	return validation.ValidateStruct(
		&w,
		validation.Field(&w.Latitude, validation.Required, validation.Min(-90.0), validation.Max(90.0)),
		validation.Field(&w.Longitude, validation.Required, validation.Min(-180.0), validation.Max(180.0)),
		validation.Field(&w.Speed, validation.Min(0)),
		validation.Field(&w.CreatedAt, validation.Required, validate.Timestamp),
	)
}
