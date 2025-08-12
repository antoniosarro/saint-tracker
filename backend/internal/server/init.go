package server

import (
	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/internal/web"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
)

type Options struct {
	DB        *sqlx.DB
	Log       *logger.Log
	ServerCfg *config.Config
}

func Init(opts *Options) *echo.Echo {
	w := web.New(opts.Log, opts.DB)

	w.Echo.HideBanner = true
	w.Echo.HidePort = true

	w.InitCustomMiddleware(opts.ServerCfg)
	w.EnableCORSMiddleware(opts.ServerCfg.Server.AllowedOrigins)
	w.EnableRecoverMiddleware()
	w.EnableGlobalMiddleware()

	router(w, opts)

	return w.Echo
}
