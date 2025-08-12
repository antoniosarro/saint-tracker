package websocket

import "github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"

// Broadcaster interface for broadcasting waypoints
type Broadcaster interface {
	BroadcastWaypoints(waypoints []*waypoint.WaypointDTO)
	GetClientCount() int
}
