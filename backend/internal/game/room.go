package game

import (
	"fmt"
	"sync"
)

type Phase int

const (
	PhaseLobby Phase = iota
	PhasePlacing
	PhasePlaying
	PhaseOver
)

type FireResult struct {
	Result    string
	ShipCells []Cell
	GameOver  bool
}

type Room struct {
	mu     sync.Mutex
	ID     string
	boards [2]*Board
	phase  Phase
	turn   int    // 0 ou 1, joueur dont c'est le tour
	placed [2]bool
}

func NewRoom(id string) *Room {
	return &Room{
		ID:     id,
		boards: [2]*Board{NewBoard(), NewBoard()},
		phase:  PhaseLobby,
	}
}

func (r *Room) StartPlacement() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.phase = PhasePlacing
}

func (r *Room) PlaceShips(playerIdx int, ships []Ship) (bothReady bool, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if playerIdx != 0 && playerIdx != 1 {
		return false, fmt.Errorf("invalid player index")
	}
	if r.phase != PhasePlacing {
		return false, fmt.Errorf("not in placement phase")
	}
	if r.placed[playerIdx] {
		return false, fmt.Errorf("ships already placed")
	}

	for _, ship := range ships {
		if err := r.boards[playerIdx].PlaceShip(ship); err != nil {
			return false, err
		}
	}

	r.placed[playerIdx] = true
	bothReady = r.placed[0] && r.placed[1]
	if bothReady {
		r.phase = PhasePlaying
		r.turn = 0
	}
	return bothReady, nil
}

func (r *Room) PhaseName() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch r.phase {
	case PhaseLobby:
		return "lobby"
	case PhasePlacing:
		return "placing"
	case PhasePlaying:
		return "playing"
	case PhaseOver:
		return "over"
	default:
		return "unknown"
	}
}

func (r *Room) Fire(playerIdx, x, y int) (FireResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if playerIdx != 0 && playerIdx != 1 {
		return FireResult{}, fmt.Errorf("invalid player index")
	}
	if r.phase != PhasePlaying {
		return FireResult{}, fmt.Errorf("not in playing phase")
	}
	if r.turn != playerIdx {
		return FireResult{}, fmt.Errorf("not your turn")
	}

	opponentIdx := 1 - playerIdx
	result, sunkShip, err := r.boards[opponentIdx].Fire(x, y)
	if err != nil {
		return FireResult{}, err
	}

	fr := FireResult{Result: result}
	if sunkShip != nil {
		fr.ShipCells = sunkShip.Cells
	}
	if r.boards[opponentIdx].AllSunk() {
		fr.GameOver = true
		r.phase = PhaseOver
	} else {
		r.turn = opponentIdx
	}
	return fr, nil
}
