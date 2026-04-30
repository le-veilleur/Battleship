import { useEffect, useState } from 'react'

interface Score {
  pseudo: string
  wins:   number
}

const API_URL = (import.meta.env.VITE_WS_URL as string | undefined)
  ?.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '')
  ?? 'http://localhost:8080'

export default function Leaderboard() {
  const [scores, setScores] = useState<Score[]>([])

  useEffect(() => {
    fetch(`${API_URL}/leaderboard`)
      .then(r => r.json())
      .then(setScores)
      .catch(() => {})
  }, [])

  return (
    <div className="w-80">
      <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3 text-center">Classement</h3>
      {scores.length === 0 ? (
        <p className="text-slate-600 text-sm text-center">Aucune victoire pour l'instant</p>
      ) : (
        <ol className="space-y-2">
          {scores.map((s, i) => (
            <li key={s.pseudo} className="flex items-center justify-between px-4 py-2 bg-slate-800 rounded-lg">
              <span className="flex items-center gap-3">
                <span className="text-slate-500 text-sm w-4">{i + 1}</span>
                <span className="font-medium">{s.pseudo}</span>
              </span>
              <span className="text-yellow-400 font-bold text-sm">{s.wins} {s.wins > 1 ? 'victoires' : 'victoire'}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
