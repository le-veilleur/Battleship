import type { ServerMessage, PlacedShip } from '../types/game'
import type { WebRTCPeer } from '../transport/WebRTCPeer'
import { GameEngine } from './GameEngine'

type GuestMessage =
  | { type: 'p2p_ready'; pseudo: string }
  | { type: 'place_ships'; ships: PlacedShip[] }
  | { type: 'fire'; x: number; y: number }

export class P2PHostGame {
  private engine = new GameEngine()
  onSelfMessage: ((msg: ServerMessage) => void) | null = null

  constructor(private peer: WebRTCPeer) {
    peer.onChannelMessage = (data) => {
      try {
        this.dispatch(JSON.parse(data) as GuestMessage)
      } catch (e) {
        console.error('P2P parse error:', e)
      }
    }
  }

  placeShips(ships: PlacedShip[]): void {
    try {
      const bothReady = this.engine.placeShips(0, ships)
      this.self({ type: 'placement_confirmed' })
      if (bothReady) this.broadcastGameStart()
    } catch (e) { console.error('Host placement:', e) }
  }

  fire(x: number, y: number): void {
    try {
      const fr = this.engine.fire(0, x, y)
      this.self({ type: 'fire_result', x, y, result: fr.result, ship_cells: fr.shipCells, game_over: fr.gameOver })
      this.peer.send({ type: 'opponent_fired', x, y, result: fr.result, ship_cells: fr.shipCells, game_over: fr.gameOver })
      if (!fr.gameOver) this.peer.send({ type: 'your_turn' })
    } catch (e) { console.error('Host fire:', e) }
  }

  private dispatch(msg: GuestMessage): void {
    switch (msg.type) {
      case 'p2p_ready':
        this.engine.startPlacement()
        this.self({ type: 'placement_phase' })
        this.peer.send({ type: 'placement_phase' })
        break

      case 'place_ships':
        try {
          const bothReady = this.engine.placeShips(1, msg.ships)
          this.peer.send({ type: 'placement_confirmed' })
          if (bothReady) this.broadcastGameStart()
        } catch (e) { this.peer.send({ type: 'error', message: String(e) }) }
        break

      case 'fire':
        try {
          const fr = this.engine.fire(1, msg.x, msg.y)
          this.peer.send({ type: 'fire_result', x: msg.x, y: msg.y, result: fr.result, ship_cells: fr.shipCells, game_over: fr.gameOver })
          this.self({ type: 'opponent_fired', x: msg.x, y: msg.y, result: fr.result, ship_cells: fr.shipCells, game_over: fr.gameOver })
          if (!fr.gameOver) this.self({ type: 'your_turn' })
        } catch (e) { this.peer.send({ type: 'error', message: String(e) }) }
        break
    }
  }

  private broadcastGameStart(): void {
    this.self({ type: 'game_start', your_turn: true })
    this.peer.send({ type: 'game_start', your_turn: false })
  }

  private self(msg: ServerMessage): void {
    this.onSelfMessage?.(msg)
  }
}
