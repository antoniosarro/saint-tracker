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

func (dbrepo *repository) CreateBatch(ctx context.Context, waypoints []*waypoint.WaypointDTO) error {
	if len(waypoints) == 0 {
		return nil
	}

	tx, err := dbrepo.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	query := `
		INSERT INTO waypoint
			(id, latitude, longitude, speed, created_at, updated_at)
		VALUES
			(:id, :latitude, :longitude, :speed, :created_at, :updated_at)
	`

	for _, w := range waypoints {
		if _, err := tx.NamedExecContext(ctx, query, intoModel(w)); err != nil {
			return err
		}
	}

	return tx.Commit()
}
