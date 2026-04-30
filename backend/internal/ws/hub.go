package ws

import (
	"sync"

	"battleship/internal/game"
)

// Room regroupe les deux connexions WebSocket et l'état de jeu d'une session.
type Room struct {
	Players [2]*Client
	Game    *game.Room
}

// Hub est le registre thread-safe de toutes les rooms actives.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

// Global est l'instance unique du Hub partagée par tous les handlers.
var Global = &Hub{rooms: make(map[string]*Room)}

func (h *Hub) Get(id string) (*Room, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.rooms[id]
	return r, ok
}

func (h *Hub) Set(id string, room *Room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rooms[id] = room
}

func (h *Hub) Delete(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, id)
}

type RoomSummary struct {
	ID      string `json:"id"`
	Players int    `json:"players"`
	Phase   string `json:"phase"`
}

func (h *Hub) List() []RoomSummary {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]RoomSummary, 0, len(h.rooms))
	for id, room := range h.rooms {
		players := 0
		for _, p := range room.Players {
			if p != nil {
				players++
			}
		}
		out = append(out, RoomSummary{ID: id, Players: players, Phase: room.Game.PhaseName()})
	}
	return out
}
