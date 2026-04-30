package handler

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"battleship/internal/game"
	"battleship/internal/ws"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func allowedOrigins() []string {
	if v := os.Getenv("ALLOWED_ORIGINS"); v != "" {
		return strings.Split(v, ",")
	}
	return []string{"localhost:5173", "localhost"}
}

// ServeWS upgrade la connexion HTTP en WebSocket, crée un Client,
// lance WritePump dans une goroutine, puis boucle en lecture jusqu'à déconnexion.
func ServeWS(w http.ResponseWriter, r *http.Request) {
	// accepte c'est ce qui fait le handshake et upgrade la connexion HTTP en WebSocket
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: allowedOrigins(),
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}

	addr := r.RemoteAddr
	connectedAt := time.Now()
	log.Printf("✔ %s  connected   goroutines=%d", addr, runtime.NumGoroutine())

	client := ws.NewClient(conn, addr)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go client.WritePump(ctx)

	var roomID string
	var playerIdx int

	// read messages from the client
	for {
		var msg game.ClientMsg
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			log.Printf("✕ %s  disconnected  duration=%s  goroutines=%d  (room=%s player=%d)",
				addr, time.Since(connectedAt).Round(time.Millisecond),
				runtime.NumGoroutine(), roomID, playerIdx,
			)
			if roomID != "" {
				onDisconnect(roomID, playerIdx)
			}
			break
		}
		log.Printf("→ %s  %s", addr, msg.Type)
		dispatch(client, &roomID, &playerIdx, msg)
	}
}

func ServeRooms(w http.ResponseWriter, r *http.Request) {
	rooms := ws.Global.List()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rooms)
}

func ServeLeaderboard(w http.ResponseWriter, r *http.Request) {
	scores := ws.GlobalLeaderboard.List()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scores)
}

func dispatch(client *ws.Client, roomID *string, playerIdx *int, msg game.ClientMsg) {
	switch msg.Type {

	case "set_pseudo":
		if msg.Pseudo == "" {
			client.Send <- map[string]any{"type": "error", "message": "pseudo cannot be empty"}
			return
		}
		client.Pseudo = msg.Pseudo
		client.Send <- map[string]any{"type": "pseudo_set", "pseudo": msg.Pseudo}

	case "create_room":
		rid := newRoomID()
		room := &ws.Room{Game: game.NewRoom(rid)}
		room.Players[0] = client
		ws.Global.Set(rid, room)
		*roomID = rid
		*playerIdx = 0
		client.Send <- map[string]any{"type": "room_created", "room_id": rid, "player_idx": 0}

	case "join_room":
		room, ok := ws.Global.Get(msg.RoomID)
		if !ok || room.Players[1] != nil {
			client.Send <- map[string]any{"type": "error", "message": "room not found or full"}
			return
		}
		room.Players[1] = client
		*roomID = msg.RoomID
		*playerIdx = 1

		client.Send <- map[string]any{"type": "room_joined", "room_id": msg.RoomID, "player_idx": 1}
		room.Players[0].Send <- map[string]any{"type": "opponent_joined"}

		room.Game.StartPlacement()
		broadcast(room, map[string]any{"type": "placement_phase"})

	case "place_ships":
		room, ok := ws.Global.Get(*roomID)
		if !ok {
			return
		}
		bothReady, err := room.Game.PlaceShips(*playerIdx, msg.Ships)
		if err != nil {
			client.Send <- map[string]any{"type": "error", "message": err.Error()}
			return
		}
		client.Send <- map[string]any{"type": "placement_confirmed"}
		if bothReady {
			room.Players[0].Send <- map[string]any{"type": "game_start", "your_turn": true}
			room.Players[1].Send <- map[string]any{"type": "game_start", "your_turn": false}
		}

	case "fire":
		room, ok := ws.Global.Get(*roomID)
		if !ok {
			return
		}
		fr, err := room.Game.Fire(*playerIdx, msg.X, msg.Y)
		if err != nil {
			client.Send <- map[string]any{"type": "error", "message": err.Error()}
			return
		}
		opponentIdx := 1 - *playerIdx

		fireResult := map[string]any{
			"type": "fire_result", "x": msg.X, "y": msg.Y,
			"result": fr.Result, "game_over": fr.GameOver,
		}
		if fr.ShipCells != nil {
			fireResult["ship_cells"] = fr.ShipCells
		}
		if fr.GameOver && client.Pseudo != "" {
			ws.GlobalLeaderboard.AddWin(client.Pseudo)
		}
		client.Send <- fireResult

		if room.Players[opponentIdx] != nil {
			opponentFired := map[string]any{
				"type": "opponent_fired", "x": msg.X, "y": msg.Y,
				"result": fr.Result, "game_over": fr.GameOver,
			}
			if fr.ShipCells != nil {
				opponentFired["ship_cells"] = fr.ShipCells
			}
			room.Players[opponentIdx].Send <- opponentFired
			if !fr.GameOver {
				room.Players[opponentIdx].Send <- map[string]any{"type": "your_turn"}
			}
		}
	}
}

func onDisconnect(roomID string, playerIdx int) {
	room, ok := ws.Global.Get(roomID)
	if !ok {
		return
	}
	opponentIdx := 1 - playerIdx
	if room.Players[opponentIdx] != nil {
		room.Players[opponentIdx].Send <- map[string]any{"type": "opponent_disconnected"}
	}
	ws.Global.Delete(roomID)
}

func broadcast(room *ws.Room, msg map[string]any) {
	for _, p := range room.Players {
		if p != nil {
			p.Send <- msg
		}
	}
}

func newRoomID() string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, 4)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
