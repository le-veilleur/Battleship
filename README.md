# ⚓ Battleship — Multijoueur en temps réel

Un jeu de bataille navale en ligne, jouable à deux dans le navigateur. Projet réalisé pour explorer la communication temps réel entre un backend Go et un frontend React, avec une architecture serveur autoritaire.

## 🎯 Objectifs du projet

- **WebSocket** pour la communication bidirectionnelle entre le serveur et les clients
- **Architecture serveur autoritaire** : toute la logique de jeu vit côté Go, le client n'est qu'une vue
- **Concurrence en Go** avec le pattern goroutine-par-client et communication par channels
- **State management React** propre et typé avec Zustand + TypeScript
- **Gestion de la reconnexion**, du matchmaking et du cycle de vie d'une partie multijoueur

## 📦 Choix de la librairie WebSocket

Deux options existent en Go pour gérer les WebSockets :

| | `golang.org/x/net/websocket` | `github.com/coder/websocket` |
|---|---|---|
| Statut | **Déprécié** (abandonné) | Actif, maintenu |
| API | Bas niveau, peu pratique | Simple, moderne |
| Context Go | ❌ Non supporté | ✅ Supporté (timeout, annulation) |
| Ping / Pong | ❌ Gestion manuelle et incomplète | ✅ Automatique |
| Compression | ❌ Non | ✅ Oui |
| Recommandé | ❌ | ✅ |

**Pourquoi `coder/websocket` ?**
La doc officielle de `golang.org/x/net/websocket` indique elle-même de ne plus l'utiliser. `coder/websocket` (anciennement `nhooyr.io/websocket`) respecte entièrement la spec WebSocket, s'intègre naturellement avec les `context` Go, et gère proprement la déconnexion des clients.

---

## 🛠️ Stack technique

**Backend**
- Go 1.26+
- `github.com/coder/websocket` pour les connexions WebSocket
- `github.com/go-chi/chi/v5` pour le routing HTTP
- Stockage en mémoire (pas de base de données)

**Frontend**
- React 18 + TypeScript
- Vite
- Zustand pour le state global (gestion du WebSocket incluse)
- TailwindCSS pour le style
- React Router v6

## 📡 Protocole WebSocket

Tous les échanges sont en JSON sur un seul endpoint `GET /ws`.

**Client → Serveur**
```json
{ "type": "create_room" }
{ "type": "join_room",   "room_id": "ABCD" }
{ "type": "place_ships", "ships": [{ "id": "carrier", "cells": [{"x":0,"y":0}, ...] }] }
{ "type": "fire",        "x": 3, "y": 5 }
```

**Serveur → Client**
```json
{ "type": "room_created",        "room_id": "ABCD", "player_idx": 0 }
{ "type": "room_joined",         "room_id": "ABCD", "player_idx": 1 }
{ "type": "opponent_joined" }
{ "type": "placement_phase" }
{ "type": "placement_confirmed" }
{ "type": "game_start",          "your_turn": true }
{ "type": "fire_result",         "x": 3, "y": 5, "result": "sunk", "ship_cells": [...], "game_over": false }
{ "type": "opponent_fired",      "x": 3, "y": 5, "result": "hit",  "game_over": false }
{ "type": "your_turn" }
{ "type": "opponent_disconnected" }
{ "type": "error",               "message": "..." }
```

## 🏗️ Architecture

```
┌─────────────┐         WebSocket          ┌──────────────────────────────┐
│  React      │ ◄────────────────────────► │  Go Server                   │
│  Client A   │                            │                              │
└─────────────┘                            │  Hub                         │
                                           │  ├── Room ABCD               │
┌─────────────┐         WebSocket          │  │   ├── game.Room (état)    │
│  React      │ ◄────────────────────────► │  │   ├── Client A (conn+chan)│
│  Client B   │                            │  │   └── Client B (conn+chan)│
└─────────────┘                            └──────────────────────────────┘
```

- **Hub** : registre thread-safe de toutes les rooms actives
- **Room** : état de jeu protégé par un mutex, tourne côté serveur
- **Client** : connexion WebSocket + canal `Send` pour l'écriture asynchrone

## 🚀 Lancer le projet

### Backend

```bash
cd backend
go mod tidy      # télécharge les dépendances
go run ./cmd/server
```

Le serveur écoute sur `:8080`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Le client est accessible sur `http://localhost:5173`.

## 📋 Règles du jeu

Chaque joueur place 5 bateaux sur sa grille 10×10 :
- 1 porte-avions (5 cases)
- 1 cuirassé (4 cases)
- 2 croiseurs (3 cases)
- 1 destroyer (2 cases)

À tour de rôle, chaque joueur tire sur une case adverse. Le serveur annonce si le tir est manqué, touché ou s'il a coulé un bateau. Le premier joueur à couler toute la flotte adverse gagne.

## 📁 Structure du projet

```
Battleship/
├── backend/
│   ├── cmd/server/main.go          ← point d'entrée, routing HTTP
│   ├── internal/
│   │   ├── game/
│   │   │   ├── types.go            ← types partagés (Ship, Cell, Fleet…)
│   │   │   ├── board.go            ← logique de grille (placement, tir)
│   │   │   └── room.go             ← machine à états de la partie
│   │   ├── ws/
│   │   │   ├── client.go           ← connexion WebSocket + canal d'écriture
│   │   │   └── hub.go              ← registre des rooms actives
│   │   └── handler/
│   │       └── handler.go          ← dispatch des messages WebSocket
│   └── go.mod
└── frontend/
    ├── src/
    │   ├── types/game.ts           ← types TypeScript + protocole
    │   ├── store/gameStore.ts      ← Zustand store (état + WebSocket)
    │   ├── components/
    │   │   ├── Board.tsx           ← grille 10×10
    │   │   ├── ShipPlacer.tsx      ← UI de placement des bateaux
    │   │   └── ConnectionStatus.tsx
    │   └── pages/
    │       ├── Home.tsx            ← créer / rejoindre une partie
    │       └── Game.tsx            ← toutes les phases de jeu
    ├── package.json
    └── vite.config.ts
```

## 🗺️ Roadmap

- [x] Logique de jeu (placement, tirs, fin de partie)
- [x] Serveur WebSocket et gestion des rooms
- [x] Interface de placement des bateaux
- [x] Phase de jeu et résolution des tirs
- [x] Reconnexion automatique en cas de coupure
- [ ] Tests unitaires côté Go
- [ ] Mode spectateur
- [ ] Classement / historique des parties
- [ ] Mode IA pour jouer en solo
- [ ] Exploration WebTransport (HTTP/3)
