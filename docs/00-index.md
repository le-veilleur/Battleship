# Documentation technique — Battleship NWS

Projet : jeu de bataille navale multijoueur avec trois modes de connexion (WebSocket, P2P, Bluetooth).  
Stack : Go (backend), React + TypeScript (frontend), Tauri V2 (desktop), Rust + Swift (BLE), Docker + Traefik (déploiement).

---

## Fichiers de documentation

| Fichier | Concepts couverts |
|---|---|
| [01 — Réseau & WebSocket](./01-reseau-et-websocket.md) | Modèle OSI, TCP, HTTP vs WebSocket, handshake, goroutines, JSON protocol |
| [02 — P2P & WebRTC](./02-p2p-et-webrtc.md) | NAT traversal, SDP, ICE/STUN/TURN, RTCDataChannel, signaling |
| [03 — Bluetooth BLE](./03-bluetooth-ble.md) | GATT, Central/Peripheral, CoreBluetooth, subprocess IPC, UUID |
| [04 — Docker & Déploiement](./04-docker-et-deploiement.md) | Multi-stage build, layer cache, nginx WebSocket proxy, Traefik, 12-factor |
| [05 — Tauri & Architecture](./05-tauri-et-architecture.md) | invoke/emit, Arc<Mutex>, Zustand, pattern Strategy, capabilities |

---

## Architecture globale

```
┌─── MODES DE JEU ──────────────────────────────────────────────────┐
│                                                                     │
│  Mode WebSocket          Mode P2P              Mode Bluetooth       │
│  ─────────────           ────────              ───────────────      │
│  React ←→ Go             React ←→ React        Tauri ←→ Tauri      │
│  (via serveur)           (WebRTC direct)       (BLE direct)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                      │                       │
         ▼                      ▼                       ▼
  Nécessite Internet      Nécessite Internet      Fonctionne sans
  + serveur Go            (signaling) puis         réseau (~10m)
                          connexion directe
```

## Flux d'une partie (mode WebSocket)

```
Joueur A (navigateur)           Serveur Go              Joueur B (navigateur)
        │                           │                           │
        │── set_pseudo ────────────►│                           │
        │── create_room ───────────►│── room_created ──────────►│ (broadcast)
        │                           │                           │── join_room ──►│
        │◄──────────────────────────│── player_joined ──────────│
        │── place_ships ───────────►│                           │
        │                           │◄───────────────────────── │── place_ships
        │◄──────────────────────────│── game_start ─────────────►│
        │── fire {x,y} ────────────►│── fire_result ────────────►│
        │◄──────────────────────────│── your_turn ───────────────│
        │                    ...    │                    ...     │
        │◄──────────────────────────│── game_over ───────────────►│
```

## Structure du repository

```
Battleship/
├── backend/                    # Serveur Go
│   ├── cmd/server/main.go      # Point d'entrée, routing HTTP
│   ├── internal/
│   │   ├── handler/handler.go  # WebSocket + REST handlers
│   │   ├── game/               # Logique métier (placement, tirs)
│   │   └── ws/                 # Hub, Client, WritePump
│   └── Dockerfile              # Multi-stage, FROM scratch
│
├── frontend/                   # App React (web + Tauri)
│   ├── src/
│   │   ├── pages/Home.tsx      # UI principale (tabs WS/P2P/BT)
│   │   ├── store/gameStore.ts  # State global Zustand
│   │   ├── p2p/                # WebRTC (offer/answer/ICE)
│   │   └── transport/          # BluetoothPeer, interface commune
│   ├── src-tauri/              # Backend Rust (Tauri)
│   │   ├── src/bluetooth.rs    # Commandes BLE (scan, connect, send)
│   │   ├── swift/              # Helper CoreBluetooth (Peripheral)
│   │   ├── binaries/           # Binaire Swift pré-compilé
│   │   └── build.rs            # Compilation Swift automatique
│   ├── Dockerfile              # Node build + nginx
│   └── nginx.conf              # SPA + proxy /ws + /api
│
├── docker-compose.yml          # Orchestration prod (Traefik)
└── docs/                       # Cette documentation
```

---

## Concepts clés à maîtriser pour l'exam / entretien

1. **TCP vs UDP** — pourquoi TCP pour les jeux au tour par tour
2. **WebSocket handshake** — comment HTTP devient WebSocket (101 Switching Protocols)
3. **NAT traversal** — pourquoi le P2P est difficile, comment STUN/TURN aident
4. **GATT BLE** — Service, Characteristic, Central, Peripheral
5. **Multi-stage Docker** — séparer compilation et runtime
6. **Traefik labels** — configuration déclarative du routing
7. **Arc<Mutex<T>>** — partage de state en concurrent programming
8. **Pattern Strategy** — remplacer un algorithme sans changer le code appelant
