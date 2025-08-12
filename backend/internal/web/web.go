package web

import (
	"net/http"
	"time"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/internal/web/middlewares"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/jmoiron/sqlx"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Web struct {
	Echo *echo.Echo
	log  *logger.Log
	db   *sqlx.DB
	Mid  *middlewares.Middleware
}

func New(log *logger.Log, db *sqlx.DB) *Web {
	return &Web{
		Echo: echo.New(),
		log:  log,
		db:   db,
	}
}

func (w *Web) InitCustomMiddleware(serverCfg *config.Config) {
	w.Mid = middlewares.New(serverCfg, w.log, w.db, time.Hour)
}

func (w *Web) EnableCORSMiddleware(origins []string) {
	w.Echo.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: origins,
		AllowMethods: []string{
			http.MethodOptions,
			http.MethodGet,
			http.MethodPost,
		},
		AllowHeaders:     []string{"Accept", "Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
}

func (w *Web) EnableRecoverMiddleware() {
	w.Echo.Use(middleware.RecoverWithConfig(middleware.RecoverConfig{
		StackSize:         1 << 10,
		DisablePrintStack: true,
		DisableStackAll:   true,
	}))
}

func (w *Web) EnableGlobalMiddleware() {
	w.Echo.Use(middleware.RequestID())
	w.Echo.Use(middleware.Secure())
	w.Echo.Use(middleware.BodyLimit("10M"))
	w.Echo.Use(w.Mid.RequestLogMiddleware)
	w.Echo.Use(w.Mid.ErrorLogMiddleware)
}
