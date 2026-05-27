import { useGameStore, type ConnectionStatus } from '../store/gameStore'

const config: Record<ConnectionStatus, { dot: string; label: string }> = {
  connected:    { dot: 'bg-green-400',                label: 'Connecté' },
  p2p:          { dot: 'bg-purple-400',               label: 'P2P Local' },
  bluetooth:    { dot: 'bg-cyan-400',                 label: 'Bluetooth' },
  connecting:   { dot: 'bg-yellow-400 animate-pulse', label: 'Connexion…' },
  disconnected: { dot: 'bg-red-500',                  label: 'Déconnecté' },
}

export default function ConnectionStatus() {
  const status = useGameStore(s => s.connectionStatus)
  const { dot, label } = config[status]

  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  )
}
