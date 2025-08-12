package waypointrepo

import (
	"time"

	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"
	"github.com/google/uuid"
)

type Model struct {
	ID        uuid.UUID `db:"id"`
	Latitude  float32   `db:"latitude"`
	Longitude float32   `db:"longitude"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

func (m *Model) intoDTO() *waypoint.WaypointDTO {
	return &waypoint.WaypointDTO{
		ID:        m.ID,
		Latitude:  m.Latitude,
		Longitude: m.Longitude,
	}
}

func intoModel(w *waypoint.WaypointDTO) *Model {
	return &Model{
		ID:        w.ID,
		Latitude:  w.Latitude,
		Longitude: w.Longitude,
		CreatedAt: w.CreatedAt,
	}
}
