package waypointuc

import (
	"context"
	"fmt"
	"time"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"
	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/httperrors"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/google/uuid"
)

type iDBRepository interface {
	GetList(ctx context.Context) ([]*waypoint.WaypointDTO, error)
	Create(ctx context.Context, w *waypoint.WaypointDTO) error
}

type UseCase struct {
	conf   *config.Config
	log    *logger.Log
	dbRepo iDBRepository
}

func New(conf *config.Config, log *logger.Log, dbRepo iDBRepository) *UseCase {
	return &UseCase{
		conf:   conf,
		log:    log,
		dbRepo: dbRepo,
	}
}

func (uc *UseCase) GetList(ctx context.Context) ([]*waypoint.WaypointDTO, error) {
	res, err := uc.dbRepo.GetList(ctx)
	if err != nil {
		fmt.Println(err)
		return nil, httperrors.New(httperrors.Internal, "Could not retrieve waypoints data from db")
	}
	return res, nil
}

func (uc *UseCase) Register(ctx context.Context, wc *waypoint.NewWaypointDTO) (*waypoint.WaypointDTO, error) {
	w := &waypoint.WaypointDTO{
		ID:        uuid.New(),
		Latitude:  wc.Latitude,
		Longitude: wc.Longitude,
		CreatedAt: time.Unix(wc.CreatedAt, 0),
	}

	if err := uc.dbRepo.Create(ctx, w); err != nil {
		return nil, httperrors.New(httperrors.Internal, "Error inserting a new waypoint")
	}

	return w, nil
}
