package websocketweb

import (
	"net/http"

	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/httperrors"
	"github.com/antoniosarro/saint-tracker/backend/internal/websocket"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

type controller struct {
	hub *websocket.Hub
	log *logger.Log
}

func newController(hub *websocket.Hub, log *logger.Log) *controller {
	return &controller{
		hub: hub,
		log: log,
	}
}

// handleWebSocket upgrades HTTP connection to WebSocket
func (c *controller) handleWebSocket(ctx echo.Context) error {
	// Generate unique client ID
	clientID := uuid.New().String()

	// Upgrade connection
	client, err := c.hub.Upgrade(ctx.Response(), ctx.Request(), clientID)
	if err != nil {
		c.log.Errorf("Failed to upgrade connection: %v", err)
		return httperrors.New(httperrors.Internal, "Failed to establish WebSocket connection")
	}

	// Register client
	c.hub.Register <- client

	// Start client pumps
	go client.WritePump()
	go client.ReadPump()

	return nil
}

// getStats returns WebSocket connection statistics
func (c *controller) getStats(ctx echo.Context) error {
	stats := map[string]interface{}{
		"connected_clients": c.hub.GetClientCount(),
		"status":            "active",
	}

	return ctx.JSON(http.StatusOK, stats)
}
