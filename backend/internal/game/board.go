package game

import "fmt"

const BoardSize = 10

type CellState int

const (
	Empty CellState = iota
	ShipPresent
	Hit
	Miss
	Sunk
)

type Board struct {
	grid  [BoardSize][BoardSize]CellState
	ships []*Ship
}

func NewBoard() *Board {
	return &Board{}
}

func (b *Board) PlaceShip(ship Ship) error {
	for _, c := range ship.Cells {
		if c.X < 0 || c.X >= BoardSize || c.Y < 0 || c.Y >= BoardSize {
			return fmt.Errorf("ship %s: cell (%d,%d) out of bounds", ship.ID, c.X, c.Y)
		}
		if b.grid[c.Y][c.X] != Empty {
			return fmt.Errorf("ship %s: cell (%d,%d) already occupied", ship.ID, c.X, c.Y)
		}
	}
	for _, c := range ship.Cells {
		b.grid[c.Y][c.X] = ShipPresent
	}
	s := ship
	b.ships = append(b.ships, &s)
	return nil
}

func (b *Board) Fire(x, y int) (result string, sunk *Ship, err error) {
	if x < 0 || x >= BoardSize || y < 0 || y >= BoardSize {
		return "", nil, fmt.Errorf("cell (%d,%d) out of bounds", x, y)
	}
	switch b.grid[y][x] {
	case Hit, Miss, Sunk:
		return "", nil, fmt.Errorf("cell (%d,%d) already targeted", x, y)
	case ShipPresent:
		b.grid[y][x] = Hit
		ship := b.shipAt(x, y)
		if ship != nil && b.isSunk(ship) {
			for _, c := range ship.Cells {
				b.grid[c.Y][c.X] = Sunk
			}
			return "sunk", ship, nil
		}
		return "hit", nil, nil
	default:
		b.grid[y][x] = Miss
		return "miss", nil, nil
	}
}

func (b *Board) AllSunk() bool {
	if len(b.ships) == 0 {
		return false
	}
	for _, s := range b.ships {
		if !b.isSunk(s) {
			return false
		}
	}
	return true
}

// shipAt retrouve le bateau qui occupe la cellule (x,y) par coordonnées.
func (b *Board) shipAt(x, y int) *Ship {
	for _, s := range b.ships {
		for _, c := range s.Cells {
			if c.X == x && c.Y == y {
				return s
			}
		}
	}
	return nil
}

// isSunk retourne vrai si aucune cellule du bateau n'est encore ShipPresent.
func (b *Board) isSunk(ship *Ship) bool {
	for _, c := range ship.Cells {
		if b.grid[c.Y][c.X] == ShipPresent {
			return false
		}
	}
	return true
}
