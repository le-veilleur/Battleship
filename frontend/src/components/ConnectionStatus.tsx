import { useGameStore } from '../store/gameStore'

export default function ConnectionStatus() {
  const status = useGameStore(s => s.connectionStatus)

  const config = {
    connected:    { dot: 'bg-green-400',                  label: 'Connecté' },
    connecting:   { dot: 'bg-yellow-400 animate-pulse',   label: 'Connexion…' },
    disconnected: { dot: 'bg-red-500',                    label: 'Déconnecté' },
  }[status]

  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  )
}
