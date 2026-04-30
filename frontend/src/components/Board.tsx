import type { Cell, CellState } from '../types/game'

interface BoardProps {
  cells:        CellState[][]
  label?:       string
  onCellClick?: (x: number, y: number) => void
  preview?:     { cells: Cell[]; valid: boolean }
}

const CELL_COLOR: Record<CellState, string> = {
  empty: 'bg-slate-700 hover:bg-slate-600',
  ship:  'bg-blue-600',
  hit:   'bg-red-500',
  miss:  'bg-slate-400',
  sunk:  'bg-red-900',
}

export default function Board({ cells, label, onCellClick, preview }: BoardProps) {
  const previewSet = new Set(preview?.cells.map(c => `${c.x},${c.y}`) ?? [])

  return (
    <div>
      {label && (
        <p className="text-slate-300 text-sm mb-2 text-center font-semibold">{label}</p>
      )}
      <div className="grid grid-cols-10 gap-0.5">
        {cells.map((row, y) =>
          row.map((state, x) => {
            const inPreview = previewSet.has(`${x},${y}`)
            const clickable = onCellClick && state === 'empty'

            let bg = CELL_COLOR[state]
            if (inPreview) bg = preview?.valid ? 'bg-green-400/70' : 'bg-red-400/70'

            return (
              <div
                key={`${x}-${y}`}
                onClick={() => clickable && onCellClick(x, y)}
                className={`w-8 h-8 border border-slate-600 transition-colors flex items-center justify-center
                  ${bg} ${clickable ? 'cursor-crosshair' : 'cursor-default'}`}
              >
                {state === 'miss' && <span className="text-slate-500 text-xs font-bold">·</span>}
                {(state === 'hit' || state === 'sunk') && <span className="text-white text-xs font-bold">✕</span>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
