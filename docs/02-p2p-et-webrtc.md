# P2P & WebRTC — jouer sans serveur

> Concepts utilisés dans : `frontend/src/p2p/`, `frontend/src/transport/`, `frontend/src/store/gameStore.ts`

---

## 1. Le problème : pourquoi le P2P est difficile

Deux navigateurs veulent se connecter directement, sans passer par un serveur. Le problème : ils sont tous les deux **derrière un NAT** (le routeur de leur box Internet).

```
Alice                     Internet                    Bob
[192.168.1.10]  →  [82.64.12.3:XXXXX]  ↔  [93.12.44.8:YYYYY]  ←  [192.168.0.5]
   IP privée              IP publique           IP publique            IP privée
```

Alice ne connaît pas l'IP privée de Bob, et vice-versa. Pire : les NAT bloquent les connexions entrantes non sollicitées.

**NAT traversal** = l'ensemble des techniques pour contourner ce problème.

---

## 2. WebRTC — la solution du navigateur

WebRTC est une **API navigateur** (W3C + IETF) qui gère :
- La négociation de connexion (ICE, STUN, TURN)
- La traversée de NAT
- Le transport chiffré (DTLS + SRTP)
- Les canaux de données (`RTCDataChannel`)

```
Alice                  Serveur de signaling            Bob
  │── offer SDP ──────────────────────────────→ │
  │                                              │
  │ ←────────────────────────── answer SDP ─────│
  │── ICE candidate ───────────────────────────→│
  │←──────────────────────────── ICE candidate ─│
  │                                              │
  ╔══════════════════════════════════════════════╗
  ║      Connexion P2P directe (UDP ou TCP)      ║
  ╚══════════════════════════════════════════════╝
```

---

## 3. Les 3 étapes pour établir une connexion WebRTC

### Étape 1 — Échange de SDP (Session Description Protocol)

Alice crée une **offer** : un document JSON qui décrit ses capacités (codecs, types de médias, adresses réseau possibles).

```javascript
// src/p2p/ — côté hôte
const pc = new RTCPeerConnection({ iceServers: [...] })
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
// → envoyer offer.sdp au guest via WebSocket (signaling)
```

Bob reçoit l'offer, crée une **answer** :
```javascript
await pc.setRemoteDescription(offer)
const answer = await pc.createAnswer()
await pc.setLocalDescription(answer)
// → envoyer answer.sdp à l'hôte via WebSocket
```

### Étape 2 — ICE candidates (traversée de NAT)

ICE (Interactive Connectivity Establishment) génère des **candidats** : toutes les adresses IP/port possibles par lesquelles la connexion pourrait passer.

```
candidate:1 UDP 192.168.1.10:54321    ← IP privée (LAN)
candidate:2 UDP 82.64.12.3:54321     ← IP publique (STUN)
candidate:3 TCP relay.example.com    ← TURN relay (si NAT symétrique)
```

Les deux pairs s'échangent leurs candidats, testent toutes les combinaisons, gardent la meilleure route.

**STUN** (Session Traversal Utilities for NAT) : serveur externe qui dit à Alice "ton IP publique est 82.64.12.3". Gratuit, léger, fonctionne pour ~85% des NAT.

**TURN** (Traversal Using Relays around NAT) : si STUN échoue (NAT symétrique), un serveur relaie le trafic. Coûteux en bande passante, mais garantit la connexion.

### Étape 3 — RTCDataChannel

Une fois connectés, les pairs communiquent via `RTCDataChannel` :

```javascript
// Hôte crée le channel
const channel = pc.createDataChannel('game', { ordered: true })
channel.onmessage = (e) => dispatch(JSON.parse(e.data))

// Guest reçoit le channel
pc.ondatachannel = (e) => {
  const channel = e.channel
  channel.onmessage = (e) => dispatch(JSON.parse(e.data))
}
```

`ordered: true` = garantit l'ordre des messages (comme TCP). Pour un jeu au tour par tour, c'est important.

---

## 4. Le signaling — le seul endroit où le serveur intervient

WebRTC a besoin d'un **canal de signaling** pour échanger SDP et ICE candidates. N'importe quel transport fonctionne : WebSocket, HTTP, email, QR code...

Dans ce projet, le WebSocket existant est réutilisé comme canal de signaling :

```typescript
// gameStore.ts — mode p2p-host
ws.send(JSON.stringify({ type: 'webrtc_offer', sdp: offer.sdp }))

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.type === 'webrtc_answer') { /* ... */ }
  if (msg.type === 'webrtc_ice')    { /* ... */ }
}
```

Une fois la connexion P2P établie, le serveur n'est plus nécessaire pour le gameplay — seulement pour le classement.

---

## 5. Sécurité intégrée à WebRTC

WebRTC **chiffre obligatoirement** toutes les communications :
- **DTLS** (Datagram TLS) pour le canal de données
- Chaque pair vérifie le certificat de l'autre (basé sur le fingerprint dans le SDP)

Tu ne peux pas désactiver le chiffrement. C'est imposé par le standard.

---

## 6. Ce que `BluetoothPeer` et `WebRTCPeer` ont en commun

```typescript
// Les deux implémentent la même interface
interface GameTransport {
  send(data: string): void
  onMessage(cb: (data: string) => void): void
  close(): void
}
```

C'est le **patron Stratégie** (Strategy pattern) : l'engine de jeu (`P2PHostGame`) ne sait pas si le transport est WebRTC ou Bluetooth. Il appelle `transport.send(...)` et c'est tout. Changer de transport = changer une ligne dans le store.

---

## 7. Limitations P2P dans ce projet

| Limitation | Raison | Solution future |
|---|---|---|
| Signaling via le serveur WS existant | Simplicité | Canal de signaling dédié |
| Pas de TURN server configuré | Coût | Coturn self-hosted ou Twilio |
| Pas de reconnexion automatique | Complexité | ICE restart |
| Le classement ne fonctionne pas en P2P | Le serveur ne voit pas la fin de partie | Envoyer le résultat au serveur après la partie |

---

## 8. Ce que tu dois retenir

- **WebRTC ≠ serverless** : il faut un serveur de signaling pour initier la connexion, mais le gameplay passe ensuite de pair à pair
- **NAT traversal** : STUN découvre l'IP publique, TURN relaie si nécessaire, ICE orchestre tout ça
- **SDP** : format texte qui décrit une session multimédia (comme une carte de visite des capacités réseau)
- **RTCDataChannel** : l'équivalent WebSocket entre deux navigateurs, sans serveur intermédiaire
- **Chiffrement obligatoire** : DTLS, pas désactivable
