package server

import (
	"context"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/internal/web"
	"github.com/antoniosarro/saint-tracker/backend/internal/websocket"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
)

type Options struct {
	DB        *sqlx.DB
	Log       *logger.Log
	ServerCfg *config.Config
}

type Server struct {
	Echo *echo.Echo
	hub  *websocket.Hub
	log  *logger.Log
}

func Init(opts *Options) *Server {
	// Initialize WebSocket hub
	hub := websocket.NewHub(opts.Log, opts.ServerCfg.Server.AllowedOrigins)

	// Start the hub in a goroutine
	go hub.Start(context.Background())

	// Initialize web server
	w := web.New(opts.Log, opts.DB)
	w.Echo.HideBanner = true
	w.Echo.HidePort = true

	w.InitCustomMiddleware(opts.ServerCfg)
	w.EnableCORSMiddleware(opts.ServerCfg.Server.AllowedOrigins)
	w.EnableRecoverMiddleware()
	w.EnableGlobalMiddleware()

	// Setup routes with WebSocket hub
	router(w, opts, hub)

	return &Server{
		Echo: w.Echo,
		hub:  hub,
		log:  opts.Log,
	}
}

func (s *Server) Shutdown(ctx context.Context) error {
	s.log.Info("Shutting down WebSocket hub...")
	// The hub will stop when its context is cancelled
	// You might want to add a proper shutdown mechanism here
	return s.Echo.Shutdown(ctx)
}

func (s *Server) Close() error {
	return s.Echo.Close()
}
