package ws

import (
	"context"
	"log"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// Client encapsule une connexion WebSocket et un canal d'envoi asynchrone.
type Client struct {
	Conn   *websocket.Conn
	Send   chan any
	Addr   string
	Pseudo string
}

func NewClient(conn *websocket.Conn, addr string) *Client {
	return &Client{
		Conn: conn,
		Send: make(chan any, 32),
		Addr: addr,
	}
}

// WritePump draine Send et pousse chaque message sur la connexion WebSocket.
// Doit tourner dans une goroutine dédiée (go client.WritePump(ctx)).
func (c *Client) WritePump(ctx context.Context) {
	defer c.Conn.CloseNow()
	for {
		select {
		case msg, ok := <-c.Send:
			if !ok {
				return
			}
			if m, ok := msg.(map[string]any); ok {
				log.Printf("← %s  %s", c.Addr, m["type"])
			}
			if err := wsjson.Write(ctx, c.Conn, msg); err != nil {
				log.Printf("ws write error %s: %v", c.Addr, err)
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
