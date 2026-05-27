# Réseau & WebSocket — du modèle OSI à la partie en temps réel

> Concepts utilisés dans : `backend/internal/handler/handler.go`, `frontend/src/store/gameStore.ts`

---

## 1. Le modèle OSI en pratique

Le modèle OSI découpe la communication réseau en **7 couches**. Dans ce projet tu traverses toutes les couches sans t'en rendre compte :

```
7 — Application   : WebSocket (le protocole que tu codes)
6 — Présentation  : JSON (sérialisation des messages)
5 — Session       : connexion WebSocket maintenue
4 — Transport     : TCP (fiabilité, ordre, sans perte)
3 — Réseau        : IP (routage entre machines)
2 — Liaison       : Ethernet / Wi-Fi (accès au médium)
1 — Physique      : câble, ondes radio
```

**Pourquoi TCP et pas UDP ?** TCP garantit l'ordre et la livraison. Un coup de canon qui arrive avant le placement des bateaux = partie brisée. UDP est plus rapide mais non fiable — bon pour la vidéo, mauvais pour un jeu au tour par tour.

---

## 2. HTTP vs WebSocket — le problème du pull vs push

### HTTP classique (Request/Response)
```
Client → [GET /data]  → Serveur
Client ← [200 + data] ← Serveur
```
À chaque donnée voulue, le client **doit demander**. Pour un jeu en temps réel, il faudrait polluer le serveur de requêtes toutes les 100ms → **polling** : inefficace, coûteux.

### WebSocket — une connexion persistante bidirectionnelle
```
Client → [GET /ws] + Upgrade: websocket → Serveur
         [101 Switching Protocols]        ←
═══════════════════════ connexion ouverte ══════════════════
Client ↔ [frame binaire / texte]         ↔ Serveur
         [frame]                          ↔
         ...                              ↔ (jusqu'au close)
```

Le **handshake** WebSocket est une requête HTTP normale avec deux headers spéciaux :
```http
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
```
Le serveur répond `101 Switching Protocols` et la connexion TCP reste ouverte indéfiniment.

---

## 3. Ce que fait `handler.go` ligne par ligne

```go
// handler.go — ServeWS

conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
    OriginPatterns: allowedOrigins(),
})
```
**`websocket.Accept`** fait le handshake HTTP→WebSocket. `OriginPatterns` est la protection CORS : seuls les domaines listés peuvent initier la connexion. Sans ça, n'importe quel site malveillant pourrait se connecter à ton serveur depuis le navigateur d'un utilisateur.

```go
client := ws.NewClient(conn, addr)
go client.WritePump(ctx)
```
Deux goroutines par client : une pour lire, une pour écrire. Pourquoi séparer ? Parce que WebSocket **interdit les écritures concurrentes** sur la même connexion. Le `WritePump` sérialise toutes les écritures via un channel.

```go
for {
    var msg game.ClientMsg
    if err := wsjson.Read(ctx, conn, &msg); err != nil { break }
    dispatch(client, &roomID, &playerIdx, msg)
}
```
La boucle de lecture bloque jusqu'à un message. Quand le client se déconnecte, `wsjson.Read` retourne une erreur → sortie de boucle → nettoyage.

---

## 4. La gestion des rooms — state distribué en mémoire

```go
// ws/hub.go (simplifié)
type Hub struct {
    rooms sync.Map   // map[string]*Room
}
```

`sync.Map` est une map thread-safe. Plusieurs goroutines (une par client) lisent/écrivent simultanément → sans synchronisation, race condition garantie → données corrompues ou crash.

**Alternative au `sync.Map`** : un channel central ("hub goroutine") qui serialise toutes les opérations. Plus facile à raisonner, un peu moins performant sous très forte charge.

---

## 5. Le client TypeScript — même principe, API différente

```typescript
// gameStore.ts
const WS_URL = import.meta.env.VITE_WS_URL
  ?? `${wsProto}//${window.location.hostname}:8080/ws`

const ws = new WebSocket(WS_URL)

ws.onopen    = () => { /* connexion établie */ }
ws.onmessage = (e) => { dispatch(JSON.parse(e.data)) }
ws.onclose   = () => { /* reconnexion si besoin */ }
ws.onerror   = (e) => { /* log */ }
```

`window.location.hostname` permet au frontend de se connecter automatiquement au même serveur qui l'héberge — pas besoin de coder en dur l'IP. En développement (Tauri), il fallait un `VITE_WS_URL` explicite parce que le frontend tourne sur `localhost:5175` mais le backend sur `localhost:8080`.

---

## 6. Les messages — protocole applicatif JSON

Le protocole est **custom** : pas de standard imposé, juste du JSON avec un champ `type` :

```typescript
// Exemples de messages client → serveur
{ "type": "set_pseudo",   "pseudo": "Alice" }
{ "type": "create_room" }
{ "type": "join_room",    "room_id": "X7K2" }
{ "type": "place_ships",  "ships": [...] }
{ "type": "fire",         "x": 3, "y": 5 }

// Serveur → client
{ "type": "room_created", "room_id": "X7K2", "player_idx": 0 }
{ "type": "game_start" }
{ "type": "fire_result",  "hit": true, "sunk": false }
{ "type": "game_over",    "winner": 0 }
```

**Bonne pratique** : le champ discriminant `type` (ou `event`) en premier est un pattern très commun dans les protocoles custom (Socket.io, Phoenix Channels, etc.).

---

## 7. Bonnes pratiques retenues dans ce projet

| Pratique | Où | Pourquoi |
|---|---|---|
| `OriginPatterns` sur Accept | `handler.go` | Empêche le CSRF WebSocket |
| Channel dédié aux écritures | `ws/client.go` WritePump | Évite la race condition sur conn |
| `sync.Map` pour les rooms | `ws/hub.go` | Thread-safe sans lock manuel |
| Contexte avec cancel | `handler.go` | Propagation propre de la déconnexion |
| `VITE_WS_URL` avec fallback dynamique | `gameStore.ts` | Fonctionne en dev ET en prod sans recompiler |

---

## 8. Ce que tu dois retenir pour ton cours réseau

- **TCP = fiabilité** (acquittements, retransmissions, ordre) au prix de la latence
- **WebSocket = HTTP upgradé** en connexion persistante full-duplex sur la même connexion TCP
- **Handshake** = 1 aller-retour HTTP, puis la connexion TCP devient WebSocket
- **Goroutines/async** = chaque client a son propre "fil d'exécution" côté serveur
- **JSON sur WebSocket** = protocole applicatif custom (couche 7 du modèle OSI)
