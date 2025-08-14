package server

import (
	"time"

	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint/waypointrepo"
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint/waypointuc"
	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint/waypointweb"
	"github.com/antoniosarro/saint-tracker/backend/internal/web"
	"github.com/antoniosarro/saint-tracker/backend/internal/websocket"
	"github.com/antoniosarro/saint-tracker/backend/internal/websocket/websocketweb"
	"github.com/labstack/echo/v4"
)

var startTime = time.Now()

func router(w *web.Web, cfg *Options, hub *websocket.Hub) {
	// Backend details endpoint on root path
	w.Echo.GET("/", func(c echo.Context) error {

		backendDetails := map[string]interface{}{
			"service":     "saint-tracker-backend",
			"version":     "1.0.1",
			"started_at":  startTime.Format(time.RFC3339),
			"environment": cfg.ServerCfg.App,
			"timestamp":   time.Now().Format(time.RFC3339),
		}

		return c.JSON(200, backendDetails)
	})

	// Add a simple health check route for testing
	w.Echo.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok"})
	})

	// Initialize waypoint components with WebSocket broadcaster
	waypointDBRepository := waypointrepo.NewDB(cfg.DB)
	waypointUseCase := waypointuc.New(cfg.ServerCfg, cfg.Log, waypointDBRepository, hub)

	// Setup waypoint routes
	waypointweb.Route(w, &waypointweb.Options{
		Log:             cfg.Log,
		WaypointUseCase: waypointUseCase,
	})

	// Setup WebSocket routes
	websocketweb.Route(w, &websocketweb.Options{
		Log: cfg.Log,
		Hub: hub,
	})
}
