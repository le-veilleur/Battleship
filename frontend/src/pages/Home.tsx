import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import ConnectionStatus from '../components/ConnectionStatus'
import Leaderboard from '../components/Leaderboard'
import P2PSetup from '../components/P2PSetup'

type Mode = 'online' | 'p2p' | 'bluetooth'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function BluetoothDownloadPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Explication */}
      <div className="bg-cyan-900/20 border border-cyan-700/40 rounded-xl p-4 text-center">
        <div className="text-3xl mb-2">📱</div>
        <p className="text-cyan-300 font-semibold text-sm mb-1">App desktop requise</p>
        <p className="text-slate-400 text-xs leading-relaxed">
          Le Bluetooth utilise CoreBluetooth, une API native macOS. Le navigateur n'y a pas accès.
          Il faut installer l'application desktop Battleship.
        </p>
      </div>

      {/* Étapes */}
      <div className="flex flex-col gap-2">
        {[
          { n: '1', label: 'Télécharger', desc: 'Clique le bouton ci-dessous pour télécharger le .dmg macOS' },
          { n: '2', label: 'Installer', desc: 'Glisse Battleship.app dans ton dossier Applications' },
          { n: '3', label: 'Autoriser', desc: 'Si macOS bloque l\'app : Terminal → xattr -cr /Applications/Battleship.app' },
          { n: '4', label: 'Ouvrir', desc: 'Lance l\'app → onglet "Bluetooth" disponible' },
          { n: '5', label: 'Jouer', desc: 'Les deux joueurs lancent l\'app → Héberger / Scanner' },
        ].map(({ n, label, desc }) => (
          <div key={n} className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-700 text-white text-xs font-bold flex items-center justify-center mt-0.5">
              {n}
            </span>
            <div>
              <p className="text-white text-sm font-medium">{label}</p>
              <p className="text-slate-400 text-xs">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bouton download */}
      <a
        href="https://github.com/le-veilleur/Battleship/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-semibold text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Télécharger Battleship.dmg
      </a>

      <p className="text-slate-500 text-xs text-center">macOS uniquement · Bluetooth 4.0+ requis</p>

      {/* Gatekeeper warning */}
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 flex gap-2 items-start">
        <span className="text-base leading-none mt-0.5">⚠️</span>
        <div>
          <p className="text-yellow-300 text-xs font-medium mb-1">macOS bloque l'app ?</p>
          <p className="text-slate-400 text-xs leading-relaxed mb-1.5">
            L'app n'est pas signée (certificat Apple = 99€/an). Si tu vois "endommagé", ouvre le Terminal et colle :
          </p>
          <code className="block bg-slate-900 text-cyan-300 text-xs px-2 py-1.5 rounded font-mono select-all">
            xattr -cr /Applications/Battleship.app
          </code>
        </div>
      </div>

      {/* Note iPhone */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 flex gap-2 items-start">
        <span className="text-lg leading-none mt-0.5"></span>
        <div>
          <p className="text-slate-300 text-xs font-medium mb-0.5">iPhone non supporté</p>
          <p className="text-slate-500 text-xs leading-relaxed">
            Apple bloque l'accès Bluetooth depuis Safari et interdit les apps tierces sans passer par l'App Store (99€/an). Le mode Bluetooth est réservé aux Macs.
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Sur iPhone → utilise les modes <span className="text-slate-300">En ligne</span> ou <span className="text-slate-300">Local (P2P)</span> depuis le navigateur.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const {
    connect, createRoom, joinRoom, setPseudo, pseudo,
    phase, connectionStatus,
    bleDevices, scanBluetooth, startBluetoothHost, startBluetoothGuest,
  } = useGameStore()

  const [code, setCode] = useState('')
  const [mode, setMode] = useState<Mode>('online')
  const [bleError, setBleError] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'online') connect()
  }, [mode, connect])

  useEffect(() => {
    if (phase !== 'home') navigate('/game')
  }, [phase, navigate])

  const ready = connectionStatus === 'connected' && pseudo.trim().length > 0

  async function handleBleScan() {
    setBleError(null)
    try {
      await scanBluetooth()
    } catch (e) {
      setBleError(String(e))
    }
  }

  async function handleBleHost() {
    setBleError(null)
    if (!pseudo.trim()) { setBleError('Saisis ton pseudo avant de démarrer.'); return }
    try {
      await startBluetoothHost()
    } catch (e) {
      setBleError(String(e))
    }
  }

  async function handleBleConnect(deviceId: string) {
    setBleError(null)
    if (!pseudo.trim()) { setBleError('Saisis ton pseudo avant de te connecter.'); return }
    try {
      await startBluetoothGuest(deviceId)
    } catch (e) {
      setBleError(String(e))
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-2">⚓ Battleship</h1>
        <p className="text-slate-400">Bataille navale multijoueur en temps réel</p>
      </div>

      <div className="flex flex-col gap-4 w-80">
        {/* Sélecteur de mode */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => setMode('online')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'online' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            En ligne
          </button>
          <button
            onClick={() => setMode('p2p')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'p2p' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Local (P2P)
          </button>
          <button
            onClick={() => setMode('bluetooth')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'bluetooth' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Bluetooth
          </button>
        </div>

        {/* Pseudo — commun aux trois modes */}
        <input
          value={pseudo}
          onChange={e => setPseudo(e.target.value)}
          placeholder="Ton pseudo"
          maxLength={20}
          className="px-3 py-2 bg-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
        />

        {/* Mode En ligne */}
        {mode === 'online' && (
          <>
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
          </>
        )}

        {/* Mode P2P WebRTC */}
        {mode === 'p2p' && <P2PSetup />}

        {/* Mode Bluetooth */}
        {mode === 'bluetooth' && (
          isTauri ? (
            <div className="flex flex-col gap-3">
              <div className="bg-cyan-900/30 border border-cyan-700/50 rounded-lg p-3 text-xs text-cyan-300">
                Fonctionne sans WiFi ni internet. Les deux appareils doivent avoir l'app installée.
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleBleHost}
                  disabled={connectionStatus === 'connecting' || connectionStatus === 'bluetooth'}
                  className="flex-1 py-2.5 bg-cyan-800 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors"
                >
                  {connectionStatus === 'bluetooth' ? '📡 En attente…' : 'Héberger'}
                </button>
                <button
                  onClick={handleBleScan}
                  disabled={connectionStatus === 'connecting' || connectionStatus === 'bluetooth'}
                  className="flex-1 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors"
                >
                  {connectionStatus === 'connecting' ? 'Scan…' : 'Scanner'}
                </button>
              </div>

              {bleError && (
                <p className="text-red-400 text-xs bg-red-950/40 border border-red-800/50 rounded p-2">
                  {bleError}
                </p>
              )}

              {bleDevices.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-slate-400 text-xs">{bleDevices.length} appareil(s) trouvé(s)</p>
                  {bleDevices.map(device => (
                    <button
                      key={device.id}
                      onClick={() => handleBleConnect(device.id)}
                      className="flex items-center justify-between px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                    >
                      <span>{device.name}</span>
                      <span className="text-slate-400 text-xs">
                        {device.rssi != null ? `${device.rssi} dBm` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {bleDevices.length === 0 && connectionStatus !== 'connecting' && (
                <p className="text-slate-500 text-xs text-center">
                  Lance un scan pour trouver l'hôte.
                </p>
              )}
            </div>
          ) : (
            <BluetoothDownloadPage />
          )
        )}
      </div>

      <Leaderboard />

      <div className="absolute bottom-4 right-4">
        <ConnectionStatus />
      </div>
    </div>
  )
}
