package server

import (
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint/waypointrepo"
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint/waypointuc"
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint/waypointweb"
	"github.com/antoniosarro/saint-tracker/backend/internal/web"
)

func router(w *web.Web, cfg *Options) {
	waypointDBRepository := waypointrepo.NewDB(cfg.DB)
	waypointUseCase := waypointuc.New(cfg.ServerCfg, cfg.Log, waypointDBRepository)
	waypointweb.Route(w, &waypointweb.Options{
		Log:             cfg.Log,
		WaypointUseCase: waypointUseCase,
	})
}
