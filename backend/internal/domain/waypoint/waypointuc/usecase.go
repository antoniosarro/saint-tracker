package waypointuc

import (
	"context"
	"fmt"
	"time"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"
	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/httperrors"
	"github.com/antoniosarro/saint-tracker/backend/internal/websocket"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/google/uuid"
)

type iDBRepository interface {
	GetList(ctx context.Context) ([]*waypoint.WaypointDTO, error)
	CreateBatch(ctx context.Context, waypoints []*waypoint.WaypointDTO) error
}

type UseCase struct {
	conf        *config.Config
	log         *logger.Log
	dbRepo      iDBRepository
	broadcaster websocket.Broadcaster
}

func New(conf *config.Config, log *logger.Log, dbRepo iDBRepository, broadcaster websocket.Broadcaster) *UseCase {
	return &UseCase{
		conf:        conf,
		log:         log,
		dbRepo:      dbRepo,
		broadcaster: broadcaster,
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

func (uc *UseCase) Register(ctx context.Context, wcs []*waypoint.NewWaypointDTO) ([]*waypoint.WaypointDTO, error) {
	var waypoints []*waypoint.WaypointDTO

	for _, wc := range wcs {
		w := &waypoint.WaypointDTO{
			ID:        uuid.New(),
			Latitude:  wc.Latitude,
			Longitude: wc.Longitude,
			Speed:     wc.Speed,
			CreatedAt: time.Unix(wc.CreatedAt, 0),
		}
		waypoints = append(waypoints, w)
	}

	if err := uc.dbRepo.CreateBatch(ctx, waypoints); err != nil {
		fmt.Println(err)
		return nil, httperrors.New(httperrors.Internal, "Error inserting waypoints")
	}

	// Broadcast the new waypoints to WebSocket clients
	if uc.broadcaster != nil {
		go func() {
			clientCount := uc.broadcaster.GetClientCount()
			if clientCount > 0 {
				uc.log.Infof("Broadcasting %d new waypoints to %d WebSocket clients", len(waypoints), clientCount)
				uc.broadcaster.BroadcastWaypoints(waypoints)
			}
		}()
	}

	return waypoints, nil
}
