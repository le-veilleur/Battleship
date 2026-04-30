import { useState, useCallback } from 'react'
import Board from './Board'
import { FLEET, type Cell, type CellState, type Orientation, type PlacedShip } from '../types/game'

interface Props {
  onConfirm: (ships: PlacedShip[]) => void
}

function buildCells(x: number, y: number, length: number, orientation: Orientation): Cell[] {
  return Array.from({ length }, (_, i) => ({
    x: orientation === 'h' ? x + i : x,
    y: orientation === 'v' ? y + i : y,
  }))
}

function isValid(cells: Cell[], placed: PlacedShip[]): boolean {
  const occupied = new Set(placed.flatMap(s => s.cells.map(c => `${c.x},${c.y}`)))
  return cells.every(c => c.x >= 0 && c.x <= 9 && c.y >= 0 && c.y <= 9 && !occupied.has(`${c.x},${c.y}`))
}

export default function ShipPlacer({ onConfirm }: Props) {
  const [placed, setPlaced]           = useState<PlacedShip[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [orientation, setOrientation] = useState<Orientation>('h')
  const [hovered, setHovered]         = useState<Cell | null>(null)

  const remaining = FLEET.filter(s => !placed.find(p => p.id === s.id))
  const current   = remaining[selectedIdx] ?? null

  const preview = current && hovered
    ? { cells: buildCells(hovered.x, hovered.y, current.length, orientation), valid: false }
    : undefined
  if (preview) preview.valid = isValid(preview.cells, placed)

  const displayBoard: CellState[][] = Array.from({ length: 10 }, (_, y) =>
    Array.from({ length: 10 }, (_, x) =>
      placed.some(s => s.cells.some(c => c.x === x && c.y === y)) ? 'ship' : 'empty'
    )
  )

  const handleClick = useCallback((x: number, y: number) => {
    if (!current) return
    const cells = buildCells(x, y, current.length, orientation)
    if (!isValid(cells, placed)) return
    const updated = [...placed, { id: current.id, cells }]
    setPlaced(updated)
    setSelectedIdx(0)
  }, [current, orientation, placed])

  return (
    <div className="flex gap-10 items-start">
      {/* grille */}
      <div>
        <p className="text-slate-300 text-sm mb-2 text-center font-semibold">Ta grille</p>
        <div
          className="grid grid-cols-10 gap-0.5"
          onMouseLeave={() => setHovered(null)}
        >
          {displayBoard.map((row, y) =>
            row.map((state, x) => {
              const inPrev = preview?.cells.some(c => c.x === x && c.y === y)
              let bg = state === 'ship' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'
              if (inPrev) bg = preview?.valid ? 'bg-green-400/70' : 'bg-red-400/70'
              return (
                <div
                  key={`${x}-${y}`}
                  onMouseEnter={() => setHovered({ x, y })}
                  onClick={() => handleClick(x, y)}
                  className={`w-8 h-8 border border-slate-600 cursor-crosshair transition-colors ${bg}`}
                />
              )
            })
          )}
        </div>
      </div>

      {/* panneau latéral */}
      <div className="flex flex-col gap-4 min-w-[180px]">
        <div>
          <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Orientation</p>
          <button
            onClick={() => setOrientation(o => o === 'h' ? 'v' : 'h')}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-sm transition-colors"
          >
            {orientation === 'h' ? '→ Horizontal' : '↓ Vertical'}
          </button>
        </div>

        <div>
          <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Bateaux restants</p>
          <ul className="space-y-1">
            {remaining.map((ship, i) => (
              <li
                key={ship.id}
                onClick={() => setSelectedIdx(i)}
                className={`px-3 py-2 rounded cursor-pointer text-sm transition-colors
                  ${i === selectedIdx
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
              >
                {ship.name} <span className="opacity-60">({ship.length})</span>
              </li>
            ))}
            {remaining.length === 0 && (
              <li className="text-green-400 text-sm">Tous placés ✓</li>
            )}
          </ul>
        </div>

        {placed.length > 0 && (
          <button
            onClick={() => { setPlaced([]); setSelectedIdx(0) }}
            className="text-xs text-slate-500 hover:text-slate-300 underline"
          >
            Recommencer
          </button>
        )}

        {remaining.length === 0 && (
          <button
            onClick={() => onConfirm(placed)}
            className="px-4 py-3 bg-green-600 hover:bg-green-500 rounded font-semibold transition-colors"
          >
            Confirmer
          </button>
        )}
      </div>
    </div>
  )
}
