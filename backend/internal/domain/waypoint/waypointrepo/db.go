package waypointrepo

import (
	"context"

	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"
	"github.com/jmoiron/sqlx"
)

type repository struct {
	*sqlx.DB
}

func NewDB(db *sqlx.DB) *repository {
	return &repository{db}
}

func (dbrepo *repository) GetList(ctx context.Context) ([]*waypoint.WaypointDTO, error) {
	var models []*Model
	query := `SELECT * FROM waypoint`

	rows, err := dbrepo.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		model := new(Model)
		if err := rows.StructScan(model); err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var dtos []*waypoint.WaypointDTO
	for _, model := range models {
		dtos = append(dtos, model.intoDTO())
	}
	return dtos, nil
}

func (dbrepo *repository) Create(ctx context.Context, w *waypoint.WaypointDTO) error {
	query := `
		INSERT INTO waypoint
			(id, latitude, longitude, created_at, updated_at)
		VALUES
			(:id, :latitude, :longitude, :created_at, :updated_at)
	`

	_, err := dbrepo.NamedExecContext(ctx, query, intoModel(w))
	return err
}
