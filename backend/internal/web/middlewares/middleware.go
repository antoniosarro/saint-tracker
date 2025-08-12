package middlewares

import (
	"net/http"
	"time"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/jmoiron/sqlx"
)

type Middleware struct {
	conf        *config.Config
	log         *logger.Log
	db          *sqlx.DB
	deviceCache *DeviceCache
}

type MiddlewareFunc func(h http.Handler) http.Handler

func New(conf *config.Config, log *logger.Log, db *sqlx.DB, cacheTTL time.Duration) *Middleware {
	return &Middleware{
		conf:        conf,
		log:         log,
		db:          db,
		deviceCache: NewDeviceCache(cacheTTL),
	}
}
