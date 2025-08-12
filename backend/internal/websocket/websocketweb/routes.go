package websocketweb

import (
	"github.com/antoniosarro/saint-tracker/backend/internal/web"
	"github.com/antoniosarro/saint-tracker/backend/internal/websocket"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
)

type Options struct {
	Log *logger.Log
	Hub *websocket.Hub
}

func Route(web *web.Web, opts *Options) {
	con := newController(opts.Hub, opts.Log)

	g := web.Echo.Group("/api/v1/ws")
	g.GET("/connect", con.handleWebSocket)
	g.GET("/stats", con.getStats)
}
