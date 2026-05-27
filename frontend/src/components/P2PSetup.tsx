import { useState } from 'react'
import { useGameStore } from '../store/gameStore'

type Role = 'host' | 'guest'
type HostStep = 'idle' | 'generating' | 'show_offer' | 'connecting'
type GuestStep = 'idle' | 'generating' | 'show_answer' | 'connecting'

export default function P2PSetup() {
  const { startP2PHost, acceptP2PAnswer, startP2PGuest, pseudo } = useGameStore()
  const [role, setRole] = useState<Role | null>(null)

  const [hostStep, setHostStep] = useState<HostStep>('idle')
  const [offerBlob, setOfferBlob] = useState('')
  const [answerInput, setAnswerInput] = useState('')

  const [guestStep, setGuestStep] = useState<GuestStep>('idle')
  const [offerInput, setOfferInput] = useState('')
  const [answerBlob, setAnswerBlob] = useState('')

  const [copied, setCopied] = useState(false)
  const canProceed = pseudo.trim().length > 0

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleCreateHost = async () => {
    setHostStep('generating')
    try {
      const blob = await startP2PHost()
      setOfferBlob(blob)
      setHostStep('show_offer')
    } catch (e) {
      console.error(e)
      setHostStep('idle')
    }
  }

  const handleAcceptAnswer = async () => {
    if (!answerInput.trim()) return
    setHostStep('connecting')
    try {
      await acceptP2PAnswer(answerInput.trim())
    } catch (e) {
      console.error(e)
      setHostStep('show_offer')
    }
  }

  const handleJoinGuest = async () => {
    if (!offerInput.trim()) return
    setGuestStep('generating')
    try {
      const blob = await startP2PGuest(offerInput.trim())
      setAnswerBlob(blob)
      setGuestStep('show_answer')
    } catch (e) {
      console.error(e)
      setGuestStep('idle')
    }
  }

  if (!role) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-slate-400 text-sm text-center">Qui crée la connexion ?</p>
        <button
          onClick={() => setRole('host')}
          disabled={!canProceed}
          className="py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          Hôte — créer la partie
        </button>
        <button
          onClick={() => setRole('guest')}
          disabled={!canProceed}
          className="py-2.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          Invité — rejoindre
        </button>
        {!canProceed && <p className="text-slate-500 text-xs text-center">Entre ton pseudo d'abord</p>}
      </div>
    )
  }

  if (role === 'host') {
    if (hostStep === 'idle') {
      return (
        <div className="flex flex-col gap-3">
          <button onClick={() => setRole(null)} className="text-slate-500 text-xs hover:text-slate-300 text-left">← Retour</button>
          <button
            onClick={handleCreateHost}
            className="py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition-colors"
          >
            Générer le code de connexion
          </button>
        </div>
      )
    }
    if (hostStep === 'generating') {
      return <p className="text-slate-400 text-sm text-center animate-pulse">Génération en cours…</p>
    }
    if (hostStep === 'show_offer') {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-slate-300 text-sm font-medium">① Copie ce code et envoie-le à l'invité</p>
          <div className="relative">
            <textarea
              readOnly
              value={offerBlob}
              rows={4}
              className="w-full px-3 py-2 bg-slate-800 rounded-lg text-xs font-mono resize-none border border-slate-700"
            />
            <button
              onClick={() => copy(offerBlob)}
              className="absolute top-2 right-2 px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs transition-colors"
            >
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
          <p className="text-slate-300 text-sm font-medium">② Colle la réponse de l'invité</p>
          <textarea
            value={answerInput}
            onChange={e => setAnswerInput(e.target.value)}
            placeholder="Colle la réponse ici…"
            rows={4}
            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-xs font-mono resize-none placeholder-slate-500 border border-slate-600 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={handleAcceptAnswer}
            disabled={!answerInput.trim()}
            className="py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            Connecter
          </button>
        </div>
      )
    }
    return (
      <div className="text-center space-y-2 py-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">En attente de l'invité…</p>
      </div>
    )
  }

  // role === 'guest'
  if (guestStep === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => setRole(null)} className="text-slate-500 text-xs hover:text-slate-300 text-left">← Retour</button>
        <p className="text-slate-300 text-sm font-medium">① Colle le code reçu de l'hôte</p>
        <textarea
          value={offerInput}
          onChange={e => setOfferInput(e.target.value)}
          placeholder="Colle le code ici…"
          rows={4}
          className="w-full px-3 py-2 bg-slate-700 rounded-lg text-xs font-mono resize-none placeholder-slate-500 border border-slate-600 focus:outline-none focus:border-slate-400"
        />
        <button
          onClick={handleJoinGuest}
          disabled={!offerInput.trim()}
          className="py-2.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          Générer la réponse
        </button>
      </div>
    )
  }
  if (guestStep === 'generating') {
    return <p className="text-slate-400 text-sm text-center animate-pulse">Génération en cours…</p>
  }
  if (guestStep === 'show_answer') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-slate-300 text-sm font-medium">② Copie cette réponse et envoie-la à l'hôte</p>
        <div className="relative">
          <textarea
            readOnly
            value={answerBlob}
            rows={4}
            className="w-full px-3 py-2 bg-slate-800 rounded-lg text-xs font-mono resize-none border border-slate-700"
          />
          <button
            onClick={() => copy(answerBlob)}
            className="absolute top-2 right-2 px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs transition-colors"
          >
            {copied ? '✓ Copié' : 'Copier'}
          </button>
        </div>
        <div className="text-center space-y-2 py-2">
          <div className="w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">En attente que l'hôte confirme…</p>
        </div>
      </div>
    )
  }
  return (
    <div className="text-center space-y-2 py-4">
      <div className="w-8 h-8 border-2 border-slate-500 border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-slate-400 text-sm">Connexion en cours…</p>
    </div>
  )
}
