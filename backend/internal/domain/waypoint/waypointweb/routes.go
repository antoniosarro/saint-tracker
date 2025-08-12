package waypointweb

import (
	"github.com/antoniosarro/saint-tracker/backend/internal/web"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
)

type Options struct {
	Log             *logger.Log
	WaypointUseCase iUseCase
}

func Route(web *web.Web, opts *Options) {
	con := newController(opts.WaypointUseCase, opts.Log)

	g := web.Echo.Group("/api/v1/waypoint")
	g.GET("/list", con.list)
	g.POST("/register", con.register, web.Mid.Authenticated)
}
