import { create } from 'zustand'
import {
  type CellState,
  type GamePhase,
  type PlacedShip,
  type ServerMessage,
  type ClientMessage,
  emptyBoard,
} from '../types/game'
import { WebRTCPeer } from '../transport/WebRTCPeer'
import { BluetoothPeer, type BleDevice } from '../transport/BluetoothPeer'
import { P2PHostGame } from '../p2p/P2PHostGame'

// Option A : URL dynamique basée sur window.location.hostname
// Permet de jouer en LAN sans changer le code (si VITE_WS_URL n'est pas défini)
const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = (import.meta.env['VITE_WS_URL'] as string | undefined)
  ?? `${wsProto}//${window.location.hostname}:8080/ws`

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'p2p' | 'bluetooth'
type ConnectionMode = 'ws' | 'p2p-host' | 'p2p-guest' | 'bt-host' | 'bt-guest' | null

interface GameStore {
  ws:               WebSocket | null
  connectionStatus: ConnectionStatus
  connectionMode:   ConnectionMode
  p2pPeer:          WebRTCPeer | null
  p2pHostGame:      P2PHostGame | null
  btPeer:           BluetoothPeer | null
  bleDevices:       BleDevice[]
  phase:            GamePhase
  pseudo:           string
  roomId:           string | null
  playerIdx:        number | null
  isMyTurn:         boolean
  myBoard:          CellState[][]
  enemyBoard:       CellState[][]
  placedShips:      PlacedShip[]
  youWin:           boolean | null

  connect:            () => void
  setPseudo:          (pseudo: string) => void
  createRoom:         () => void
  joinRoom:           (roomId: string) => void
  submitPlacement:    (ships: PlacedShip[]) => void
  fire:               (x: number, y: number) => void
  reset:              () => void
  startP2PHost:       () => Promise<string>
  acceptP2PAnswer:    (answerBlob: string) => Promise<void>
  startP2PGuest:      (offerBlob: string) => Promise<string>
  scanBluetooth:      () => Promise<void>
  startBluetoothHost: () => Promise<void>
  startBluetoothGuest:(deviceId: string) => Promise<void>
}

export const useGameStore = create<GameStore>((set, get) => ({
  ws:               null,
  connectionStatus: 'disconnected',
  connectionMode:   null,
  p2pPeer:          null,
  p2pHostGame:      null,
  btPeer:           null,
  bleDevices:       [],
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
    ws.onclose = () => set({ ws: null, connectionStatus: 'disconnected' })
    ws.onerror = () => ws.close()
    set({ ws })
  },

  setPseudo(pseudo) { set({ pseudo }) },

  createRoom() {
    const { ws, pseudo } = get()
    if (pseudo) send(ws, { type: 'set_pseudo', pseudo })
    send(ws, { type: 'create_room' })
  },

  joinRoom(roomId) {
    const { ws, pseudo } = get()
    if (pseudo) send(ws, { type: 'set_pseudo', pseudo })
    send(ws, { type: 'join_room', room_id: roomId.toUpperCase() })
  },

  submitPlacement(ships) {
    const { connectionMode, p2pHostGame, p2pPeer, btPeer } = get()
    set({ placedShips: ships })
    if (connectionMode === 'p2p-host') {
      p2pHostGame?.placeShips(ships)
      if (get().phase === 'placing') set({ phase: 'waiting' })
    } else if (connectionMode === 'p2p-guest') {
      p2pPeer?.send({ type: 'place_ships', ships })
      set({ phase: 'waiting' })
    } else if (connectionMode === 'bt-guest') {
      btPeer?.send({ type: 'place_ships', ships })
      set({ phase: 'waiting' })
    } else {
      send(get().ws, { type: 'place_ships', ships })
      set({ phase: 'waiting' })
    }
  },

  fire(x, y) {
    if (!get().isMyTurn) return
    const { connectionMode, p2pHostGame, p2pPeer, btPeer } = get()
    if (connectionMode === 'p2p-host') {
      p2pHostGame?.fire(x, y)
      set({ isMyTurn: false })
    } else if (connectionMode === 'p2p-guest') {
      p2pPeer?.send({ type: 'fire', x, y })
      set({ isMyTurn: false })
    } else if (connectionMode === 'bt-guest') {
      btPeer?.send({ type: 'fire', x, y })
      set({ isMyTurn: false })
    } else {
      send(get().ws, { type: 'fire', x, y })
      set({ isMyTurn: false })
    }
  },

  reset() {
    get().ws?.close()
    get().p2pPeer?.close()
    get().btPeer?.close()
    set({
      ws: null, connectionStatus: 'disconnected', connectionMode: null,
      p2pPeer: null, p2pHostGame: null, btPeer: null, bleDevices: [],
      phase: 'home', pseudo: '', roomId: null, playerIdx: null,
      isMyTurn: false, myBoard: emptyBoard(), enemyBoard: emptyBoard(),
      placedShips: [], youWin: null,
    })
  },

  async startP2PHost() {
    const peer = new WebRTCPeer()
    const offerBlob = await peer.createOffer()

    const hostGame = new P2PHostGame(peer)
    hostGame.onSelfMessage = (msg) => handleMessage(msg, set, get)

    peer.onChannelOpen = () => {
      set({ connectionStatus: 'p2p', connectionMode: 'p2p-host', phase: 'lobby', playerIdx: 0 })
    }
    peer.onChannelClose = () => {
      if (get().phase !== 'home') handleMessage({ type: 'opponent_disconnected' }, set, get)
    }

    set({ p2pPeer: peer, p2pHostGame: hostGame, connectionMode: 'p2p-host', connectionStatus: 'connecting' })
    return offerBlob
  },

  async acceptP2PAnswer(answerBlob) {
    const { p2pPeer } = get()
    if (!p2pPeer) return
    await p2pPeer.acceptAnswer(answerBlob)
  },

  async startBluetoothHost() {
    const peer = new BluetoothPeer()
    const hostGame = new P2PHostGame(peer as unknown as import('../transport/WebRTCPeer').WebRTCPeer)
    hostGame.onSelfMessage = (msg) => handleMessage(msg, set, get)

    peer.onChannelOpen = () => {
      set({ connectionStatus: 'bluetooth', connectionMode: 'bt-host', phase: 'lobby', playerIdx: 0 })
    }
    peer.onChannelClose = () => {
      if (get().phase !== 'home') handleMessage({ type: 'opponent_disconnected' }, set, get)
    }

    set({ btPeer: peer, p2pHostGame: hostGame, connectionStatus: 'connecting', connectionMode: 'bt-host' })
    await peer.startHost()
  },

  async scanBluetooth() {
    const peer = new BluetoothPeer()
    set({ connectionStatus: 'connecting' })
    try {
      const devices = await peer.scan()
      set({ bleDevices: devices, connectionStatus: 'disconnected' })
    } catch (e) {
      set({ connectionStatus: 'disconnected' })
      throw e
    }
  },

  async startBluetoothGuest(deviceId) {
    const peer = new BluetoothPeer()

    peer.onChannelMessage = (data) => {
      try {
        const msg = JSON.parse(data) as ServerMessage
        handleMessage(msg, set, get)
      } catch {
        console.error('Invalid BLE message')
      }
    }

    peer.onChannelOpen = () => {
      set({ connectionStatus: 'bluetooth', connectionMode: 'bt-guest', phase: 'lobby', playerIdx: 1 })
      peer.send({ type: 'p2p_ready', pseudo: get().pseudo })
    }

    peer.onChannelClose = () => {
      if (get().phase !== 'home') handleMessage({ type: 'opponent_disconnected' }, set, get)
    }

    set({ btPeer: peer, connectionStatus: 'connecting', connectionMode: 'bt-guest' })
    await peer.connect(deviceId)
  },

  async startP2PGuest(offerBlob) {
    const peer = new WebRTCPeer()
    const answerBlob = await peer.createAnswer(offerBlob)

    peer.onChannelMessage = (data) => {
      try {
        const msg = JSON.parse(data) as ServerMessage
        handleMessage(msg, set, get)
      } catch {
        console.error('Invalid P2P message')
      }
    }

    peer.onChannelOpen = () => {
      set({ connectionStatus: 'p2p', connectionMode: 'p2p-guest', phase: 'lobby', playerIdx: 1 })
      peer.send({ type: 'p2p_ready', pseudo: get().pseudo })
    }

    peer.onChannelClose = () => {
      if (get().phase !== 'home') handleMessage({ type: 'opponent_disconnected' }, set, get)
    }

    set({ p2pPeer: peer, connectionMode: 'p2p-guest', connectionStatus: 'connecting' })
    return answerBlob
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
