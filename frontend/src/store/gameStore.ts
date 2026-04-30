import { create } from 'zustand'
import {
  type CellState,
  type GamePhase,
  type PlacedShip,
  type ServerMessage,
  type ClientMessage,
  emptyBoard,
} from '../types/game'

const WS_URL = 'ws://localhost:8080/ws'

interface GameStore {
  ws:               WebSocket | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  phase:            GamePhase
  pseudo:           string
  roomId:           string | null
  playerIdx:        number | null
  isMyTurn:         boolean
  myBoard:          CellState[][]
  enemyBoard:       CellState[][]
  placedShips:      PlacedShip[]
  youWin:           boolean | null

  connect:         () => void
  setPseudo:       (pseudo: string) => void
  createRoom:      () => void
  joinRoom:        (roomId: string) => void
  submitPlacement: (ships: PlacedShip[]) => void
  fire:            (x: number, y: number) => void
  reset:           () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  ws:               null,
  connectionStatus: 'disconnected',
  phase:            'home',
  pseudo:           '',
  roomId:           null,
  playerIdx:        null,
  isMyTurn:         false,
  myBoard:          emptyBoard(),
  enemyBoard:       emptyBoard(),
  placedShips:      [],
  youWin:           null,

  connect() {
    if (get().ws?.readyState === WebSocket.OPEN) return

    set({ connectionStatus: 'connecting' })
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => set({ ws, connectionStatus: 'connected' })

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        handleMessage(msg, set, get)
      } catch {
        console.error('Invalid message from server')
      }
    }

    ws.onclose = () => {
      set({ ws: null, connectionStatus: 'disconnected' })
    }

    ws.onerror = () => ws.close()

    set({ ws })
  },

  setPseudo(pseudo: string) {
    set({ pseudo })
  },

  createRoom() {
    const { ws, pseudo } = get()
    if (pseudo) send(ws, { type: 'set_pseudo', pseudo })
    send(ws, { type: 'create_room' })
  },

  joinRoom(roomId: string) {
    const { ws, pseudo } = get()
    if (pseudo) send(ws, { type: 'set_pseudo', pseudo })
    send(ws, { type: 'join_room', room_id: roomId.toUpperCase() })
  },

  submitPlacement(ships: PlacedShip[]) {
    send(get().ws, { type: 'place_ships', ships })
    set({ placedShips: ships, phase: 'waiting' })
  },

  fire(x: number, y: number) {
    if (!get().isMyTurn) return
    send(get().ws, { type: 'fire', x, y })
    set({ isMyTurn: false })
  },

  reset() {
    get().ws?.close()
    set({
      ws: null, connectionStatus: 'disconnected',
      phase: 'home', pseudo: '', roomId: null, playerIdx: null,
      isMyTurn: false, myBoard: emptyBoard(), enemyBoard: emptyBoard(),
      placedShips: [], youWin: null,
    })
  },
}))

function handleMessage(
  msg: ServerMessage,
  set: (s: Partial<GameStore>) => void,
  get: () => GameStore,
) {
  switch (msg.type) {
    case 'room_created':
      set({ phase: 'lobby', roomId: msg.room_id, playerIdx: msg.player_idx })
      break
    case 'room_joined':
      set({ phase: 'lobby', roomId: msg.room_id, playerIdx: msg.player_idx })
      break
    case 'placement_phase':
      set({ phase: 'placing', myBoard: emptyBoard(), enemyBoard: emptyBoard() })
      break
    case 'game_start':
      set({ phase: 'playing', isMyTurn: msg.your_turn })
      break
    case 'fire_result': {
      const enemy = get().enemyBoard.map(row => [...row])
      if (msg.result === 'sunk' && msg.ship_cells) {
        msg.ship_cells.forEach(c => { enemy[c.y][c.x] = 'sunk' })
      } else {
        enemy[msg.y][msg.x] = msg.result === 'hit' ? 'hit' : 'miss'
      }
      set({ enemyBoard: enemy })
      if (msg.game_over) set({ phase: 'game_over', youWin: true })
      break
    }
    case 'opponent_fired': {
      const my = get().myBoard.map(row => [...row])
      if (msg.result === 'sunk' && msg.ship_cells) {
        msg.ship_cells.forEach(c => { my[c.y][c.x] = 'sunk' })
      } else {
        my[msg.y][msg.x] = msg.result === 'hit' ? 'hit' : 'miss'
      }
      set({ myBoard: my })
      if (msg.game_over) set({ phase: 'game_over', youWin: false })
      break
    }
    case 'your_turn':
      set({ isMyTurn: true })
      break
    case 'opponent_disconnected':
      set({ phase: 'game_over', youWin: true })
      break
    case 'error':
      console.error('Server:', msg.message)
      break
  }
}

function send(ws: WebSocket | null, msg: ClientMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(msg))
}
