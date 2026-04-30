import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import ConnectionStatus from '../components/ConnectionStatus'
import Leaderboard from '../components/Leaderboard'

export default function Home() {
  const navigate = useNavigate()
  const { connect, createRoom, joinRoom, setPseudo, pseudo, phase, connectionStatus } = useGameStore()
  const [code, setCode] = useState('')

  useEffect(() => { connect() }, [connect])

  useEffect(() => {
    if (phase !== 'home') navigate('/game')
  }, [phase, navigate])

  const ready = connectionStatus === 'connected' && pseudo.trim().length > 0

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-2">⚓ Battleship</h1>
        <p className="text-slate-400">Bataille navale multijoueur en temps réel</p>
      </div>

      <div className="flex flex-col gap-4 w-80">
        <input
          value={pseudo}
          onChange={e => setPseudo(e.target.value)}
          placeholder="Ton pseudo"
          maxLength={20}
          className="px-3 py-2 bg-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
        />

        <button
          onClick={createRoom}
          disabled={!ready}
          className="py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          Créer une partie
        </button>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && ready && joinRoom(code)}
            placeholder="Code room (ex : ABCD)"
            maxLength={4}
            className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 uppercase"
          />
          <button
            onClick={() => joinRoom(code)}
            disabled={!code.trim() || !ready}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
          >
            Rejoindre
          </button>
        </div>
      </div>

      <Leaderboard />

      <div className="absolute bottom-4 right-4">
        <ConnectionStatus />
      </div>
    </div>
  )
}
