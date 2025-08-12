package websocket

import (
	"context"
	"net/http"
	"sync"

	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/gorilla/websocket"
)

// Message types
const (
	MessageTypeWaypoint = "waypoint"
	MessageTypeError    = "error"
	MessageTypePing     = "ping"
	MessageTypePong     = "pong"
)

// WebSocket message structure
type Message struct {
	Type    string      `json:"type"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	EventID string      `json:"event_id,omitempty"`
}

// Client represents a WebSocket connection
type Client struct {
	ID     string
	Conn   *websocket.Conn
	Send   chan Message
	Hub    *Hub
	Logger *logger.Log
}

// Hub maintains active clients and broadcasts messages
type Hub struct {
	clients    map[*Client]bool
	Broadcast  chan Message
	Register   chan *Client
	Unregister chan *Client
	mu         sync.RWMutex
	logger     *logger.Log
	upgrader   websocket.Upgrader
	ctx        context.Context
	cancel     context.CancelFunc
}

// NewHub creates a new WebSocket hub
func NewHub(log *logger.Log, allowedOrigins []string) *Hub {
	ctx, cancel := context.WithCancel(context.Background())

	return &Hub{
		clients:    make(map[*Client]bool),
		Broadcast:  make(chan Message, 256),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		logger:     log,
		ctx:        ctx,
		cancel:     cancel,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow all origins if none specified (development)
				if len(allowedOrigins) == 0 {
					return true
				}

				origin := r.Header.Get("Origin")
				for _, allowedOrigin := range allowedOrigins {
					if origin == allowedOrigin || allowedOrigin == "*" {
						return true
					}
				}
				return false
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// Start runs the hub
func (h *Hub) Start(ctx context.Context) {

	// Run the main loop
	for {
		select {
		case <-ctx.Done():
			h.logger.Info("WebSocket hub shutting down due to context cancellation")
			h.shutdown()
			return
		case <-h.ctx.Done():
			h.logger.Info("WebSocket hub shutting down")
			return
		case client := <-h.Register:
			h.registerClient(client)
		case client := <-h.Unregister:
			h.unregisterClient(client)
		case message := <-h.Broadcast:
			h.broadcastMessage(message)
		}
	}
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	h.clients[client] = true
	clientCount := len(h.clients)
	h.mu.Unlock()

	h.logger.Infof("Client %s connected. Total clients: %d", client.ID, clientCount)

	// Send welcome message
	select {
	case client.Send <- Message{
		Type: "connected",
		Data: map[string]interface{}{
			"client_id": client.ID,
			"message":   "WebSocket connection established",
		},
	}:
	default:
		h.mu.Lock()
		delete(h.clients, client)
		h.mu.Unlock()
		close(client.Send)
	}
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.Send)
		clientCount := len(h.clients)
		h.mu.Unlock()
		h.logger.Infof("Client %s disconnected. Total clients: %d", client.ID, clientCount)
	} else {
		h.mu.Unlock()
	}
}

func (h *Hub) broadcastMessage(message Message) {
	h.mu.RLock()
	clientCount := len(h.clients)
	clientsCopy := make([]*Client, 0, clientCount)
	for client := range h.clients {
		clientsCopy = append(clientsCopy, client)
	}
	h.mu.RUnlock()

	h.logger.Infof("Broadcasting message type '%s' to %d clients", message.Type, clientCount)

	for _, client := range clientsCopy {
		select {
		case client.Send <- message:
			// Message sent successfully
		default:
			// Client's send channel is full, close it
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastWaypoints broadcasts new waypoints to all connected clients
func (h *Hub) BroadcastWaypoints(waypoints []*waypoint.WaypointDTO) {
	message := Message{
		Type: MessageTypeWaypoint,
		Data: map[string]interface{}{
			"waypoints": waypoints,
			"count":     len(waypoints),
		},
	}

	select {
	case h.Broadcast <- message:
		h.logger.Infof("Waypoint broadcast message queued for %d waypoints", len(waypoints))
	default:
		h.logger.Warn("Broadcast channel is full, dropping message")
	}
}

// GetClientCount returns the number of connected clients
func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Upgrade upgrades HTTP connection to WebSocket
func (h *Hub) Upgrade(w http.ResponseWriter, r *http.Request, clientID string) (*Client, error) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, err
	}

	client := &Client{
		ID:     clientID,
		Conn:   conn,
		Send:   make(chan Message, 256),
		Hub:    h,
		Logger: h.logger,
	}

	return client, nil
}

// Stop gracefully stops the hub
func (h *Hub) Stop() {
	h.logger.Info("Stopping WebSocket hub...")
	h.cancel()
}

func (h *Hub) shutdown() {
	// Close all client connections
	h.mu.Lock()
	for client := range h.clients {
		close(client.Send)
		client.Conn.Close()
	}
	h.clients = make(map[*Client]bool)
	h.mu.Unlock()
}

// ReadPump handles reading from the WebSocket connection
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	// Set read limits and timeouts
	c.Conn.SetReadLimit(512)

	for {
		var msg Message
		err := c.Conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.Logger.Errorf("WebSocket read error for client %s: %v", c.ID, err)
			}
			break
		}

		// Handle ping messages
		if msg.Type == MessageTypePing {
			select {
			case c.Send <- Message{Type: MessageTypePong}:
			default:
				return
			}
		}
	}
}

// WritePump handles writing to the WebSocket connection
func (c *Client) WritePump() {
	defer c.Conn.Close()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				// The hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteJSON(message); err != nil {
				c.Logger.Errorf("WebSocket write error for client %s: %v", c.ID, err)
				return
			}
		}
	}
}
