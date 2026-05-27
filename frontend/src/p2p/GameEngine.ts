import type { Cell, PlacedShip } from '../types/game'

const BOARD_SIZE = 10
type GridCell = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk'

export interface FireResult {
  result: 'hit' | 'miss' | 'sunk'
  shipCells?: Cell[]
  gameOver: boolean
}

class BoardEngine {
  private grid: GridCell[][]
  private ships: PlacedShip[] = []

  constructor() {
    this.grid = Array.from({ length: BOARD_SIZE }, () => Array<GridCell>(BOARD_SIZE).fill('empty'))
  }

  placeShip(ship: PlacedShip): void {
    for (const c of ship.cells) {
      if (c.x < 0 || c.x >= BOARD_SIZE || c.y < 0 || c.y >= BOARD_SIZE)
        throw new Error(`ship ${ship.id}: cell (${c.x},${c.y}) out of bounds`)
      if (this.grid[c.y][c.x] !== 'empty')
        throw new Error(`ship ${ship.id}: cell (${c.x},${c.y}) already occupied`)
    }
    for (const c of ship.cells) this.grid[c.y][c.x] = 'ship'
    this.ships.push(ship)
  }

  fire(x: number, y: number): { result: 'hit' | 'miss' | 'sunk'; sunkShip?: PlacedShip } {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE)
      throw new Error(`cell (${x},${y}) out of bounds`)
    const state = this.grid[y][x]
    if (state === 'hit' || state === 'miss' || state === 'sunk')
      throw new Error(`cell (${x},${y}) already targeted`)
    if (state === 'ship') {
      this.grid[y][x] = 'hit'
      const ship = this.shipAt(x, y)
      if (ship && this.isSunk(ship)) {
        for (const c of ship.cells) this.grid[c.y][c.x] = 'sunk'
        return { result: 'sunk', sunkShip: ship }
      }
      return { result: 'hit' }
    }
    this.grid[y][x] = 'miss'
    return { result: 'miss' }
  }

  allSunk(): boolean {
    return this.ships.length > 0 && this.ships.every(s => this.isSunk(s))
  }

  private shipAt(x: number, y: number): PlacedShip | undefined {
    return this.ships.find(s => s.cells.some(c => c.x === x && c.y === y))
  }

  private isSunk(ship: PlacedShip): boolean {
    return ship.cells.every(c => this.grid[c.y][c.x] !== 'ship')
  }
}

export class GameEngine {
  private boards: [BoardEngine, BoardEngine]
  private phase: 'lobby' | 'placing' | 'playing' | 'over' = 'lobby'
  private turn: 0 | 1 = 0
  private placed: [boolean, boolean] = [false, false]

  constructor() {
    this.boards = [new BoardEngine(), new BoardEngine()]
  }

  startPlacement(): void {
    this.phase = 'placing'
  }

  placeShips(playerIdx: 0 | 1, ships: PlacedShip[]): boolean {
    if (this.phase !== 'placing') throw new Error('not in placement phase')
    if (this.placed[playerIdx]) throw new Error('ships already placed')
    for (const ship of ships) this.boards[playerIdx].placeShip(ship)
    this.placed[playerIdx] = true
    const bothReady = this.placed[0] && this.placed[1]
    if (bothReady) { this.phase = 'playing'; this.turn = 0 }
    return bothReady
  }

  fire(playerIdx: 0 | 1, x: number, y: number): FireResult {
    if (this.phase !== 'playing') throw new Error('not in playing phase')
    if (this.turn !== playerIdx) throw new Error('not your turn')
    const opponentIdx = (1 - playerIdx) as 0 | 1
    const { result, sunkShip } = this.boards[opponentIdx].fire(x, y)
    const fr: FireResult = { result, shipCells: sunkShip?.cells, gameOver: false }
    if (this.boards[opponentIdx].allSunk()) {
      fr.gameOver = true
      this.phase = 'over'
    } else {
      this.turn = opponentIdx
    }
    return fr
  }
}
