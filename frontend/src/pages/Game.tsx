import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import Board from '../components/Board'
import ShipPlacer from '../components/ShipPlacer'
import ConnectionStatus from '../components/ConnectionStatus'
import Leaderboard from '../components/Leaderboard'
import type { CellState, PlacedShip } from '../types/game'

export default function Game() {
  const navigate = useNavigate()
  const { phase, roomId, isMyTurn, myBoard, enemyBoard, placedShips, youWin, submitPlacement, fire, reset } = useGameStore()

  useEffect(() => {
    if (phase === 'home') navigate('/')
  }, [phase, navigate])

  // superpose les bateaux placés sur la grille "ma flotte"
  const myBoardWithShips: CellState[][] = myBoard.map((row, y) =>
    row.map((cell, x) => {
      if (cell !== 'empty') return cell
      return placedShips.some(s => s.cells.some(c => c.x === x && c.y === y)) ? 'ship' : 'empty'
    })
  )

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <h1 className="font-bold text-lg">⚓ Battleship</h1>
        <div className="flex items-center gap-6">
          {roomId && (
            <span className="text-slate-400 text-sm">
              Room : <span className="text-white font-mono font-bold">{roomId}</span>
            </span>
          )}
          <ConnectionStatus />
          <button onClick={() => { reset(); navigate('/') }} className="text-sm text-slate-500 hover:text-slate-300">
            Quitter
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">

        {/* attente adversaire */}
        {phase === 'lobby' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xl font-semibold">En attente d'un adversaire…</p>
            <p className="text-slate-400 text-sm">Partage ce code :</p>
            <div className="text-4xl font-mono font-bold tracking-widest text-blue-400">{roomId}</div>
          </div>
        )}

        {/* placement */}
        {phase === 'placing' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-center">Place tes bateaux</h2>
            <ShipPlacer onConfirm={(ships: PlacedShip[]) => submitPlacement(ships)} />
          </div>
        )}

        {/* attente placement adversaire */}
        {phase === 'waiting' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xl font-semibold">Bateaux placés ✓</p>
            <p className="text-slate-400">En attente de l'adversaire…</p>
          </div>
        )}

        {/* partie en cours */}
        {phase === 'playing' && (
          <div className="space-y-6">
            <div className={`text-center py-2 px-6 rounded-full text-sm font-semibold ${isMyTurn ? 'bg-green-600' : 'bg-slate-700 text-slate-400'}`}>
              {isMyTurn ? 'À toi — clique sur la grille adverse' : 'Tour de l\'adversaire…'}
            </div>
            <div className="flex gap-12 items-start">
              <Board cells={myBoardWithShips} label="Ta flotte" />
              <Board cells={enemyBoard} label="Grille adverse" onCellClick={isMyTurn ? fire : undefined} />
            </div>
          </div>
        )}

        {/* fin de partie */}
        {phase === 'game_over' && (
          <div className="text-center space-y-6">
            <div className="text-6xl">{youWin ? '🏆' : '💀'}</div>
            <h2 className="text-3xl font-bold">{youWin ? 'Victoire !' : 'Défaite…'}</h2>
            <div className="flex gap-10 justify-center">
              <Board cells={myBoardWithShips} label="Ta flotte" />
              <Board cells={enemyBoard} label="Grille adverse" />
            </div>
            <Leaderboard />
            <button
              onClick={() => { reset(); navigate('/') }}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors"
            >
              Rejouer
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
