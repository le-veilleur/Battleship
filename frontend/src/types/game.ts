export type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk'
export type Orientation = 'h' | 'v'
export type GamePhase = 'home' | 'lobby' | 'placing' | 'waiting' | 'playing' | 'game_over'

export interface Cell {
  x: number
  y: number
}

export interface ShipDef {
  id: string
  name: string
  length: number
}

export interface PlacedShip {
  id: string
  cells: Cell[]
}

export const FLEET: ShipDef[] = [
  { id: 'carrier',    name: 'Porte-avions', length: 5 },
  { id: 'battleship', name: 'Cuirassé',     length: 4 },
  { id: 'cruiser1',   name: 'Croiseur 1',   length: 3 },
  { id: 'cruiser2',   name: 'Croiseur 2',   length: 3 },
  { id: 'destroyer',  name: 'Destroyer',    length: 2 },
]

// Messages reçus du serveur
export type ServerMessage =
  | { type: 'room_created';          room_id: string; player_idx: number }
  | { type: 'room_joined';           room_id: string; player_idx: number }
  | { type: 'opponent_joined' }
  | { type: 'placement_phase' }
  | { type: 'placement_confirmed' }
  | { type: 'game_start';            your_turn: boolean }
  | { type: 'fire_result';           x: number; y: number; result: 'hit' | 'miss' | 'sunk'; ship_cells?: Cell[]; game_over: boolean }
  | { type: 'opponent_fired';        x: number; y: number; result: 'hit' | 'miss' | 'sunk'; ship_cells?: Cell[]; game_over: boolean }
  | { type: 'your_turn' }
  | { type: 'opponent_disconnected' }
  | { type: 'error';                 message: string }

// Messages envoyés au serveur
export type ClientMessage =
  | { type: 'set_pseudo';  pseudo: string }
  | { type: 'create_room' }
  | { type: 'join_room';   room_id: string }
  | { type: 'place_ships'; ships: PlacedShip[] }
  | { type: 'fire';        x: number; y: number }

export function emptyBoard(): CellState[][] {
  return Array.from({ length: 10 }, () => Array(10).fill('empty') as CellState[])
}
