# Architecture WebSocket

Je travaille sur un projet de WebSocket, qui est une interface du protocole HTTP, lui-même au-dessus de TCP. Pour établir une connexion WebSocket, je dois partir d'une requête HTTP/1.1 et faire une upgrade grâce à la lib `github.com/coder/websocket`. Dans cette lib, `Accept()` gère le handshake : c'est le client (le navigateur) qui envoie la demande d'upgrade avec les headers `Upgrade: websocket` et `Connection: Upgrade`, et le serveur répond avec un `101 Switching Protocols` pour confirmer le switch.

Pour la lecture des messages en Go, j'utilise un `for` qui garde la connexion ouverte et bloque la goroutine courante en attente de messages entrants. C'est pour ça que je lance `WritePump` dans une goroutine séparée avec `go client.WritePump(ctx)` : pour pouvoir lire et écrire sur la même connexion en parallèle.

---

## Hub

Le **Hub** est l'endroit où toutes les connexions se regroupent avec les différentes rooms. Dans une room, on a deux joueurs qui vont envoyer des informations au back à partir du front. Il utilise un `sync.RWMutex` — le `sync.Mutex` sert à verrouiller et déverrouiller des sections critiques. Le `RWMutex` va plus loin : il permet à plusieurs goroutines de lire en même temps (`RLock`), mais bloque tout le monde dès qu'une goroutine écrit (`Lock`). C'est plus performant qu'un `Mutex` classique qui bloquerait même les lectures.

---

## Room

Dans `game/room.go`, on a l'état complet d'une partie — le début, le milieu, la fin — pour que les deux joueurs partagent le même état en même temps, avec la gestion des tours. Le `mu` est un mutex qui sert à la synchronisation : il protège les ressources partagées pour éviter les conditions de course. Sans lui, les deux goroutines pourraient modifier `phase` ou `turn` en même temps et corrompre l'état de la partie.

---

## WritePump

Le **WritePump** sert à écrire les messages sur la connexion WebSocket de manière séquentielle. La lib `coder/websocket` n'est pas thread-safe pour écrire depuis plusieurs goroutines en même temps, donc je centralise tous les envois dans une seule goroutine dédiée. Le canal `Send` est la boîte aux lettres : n'importe quelle goroutine dépose un message avec `client.Send <- msg`, et `WritePump` les envoie un par un dans l'ordre. C'est le principe Go : *"Don't communicate by sharing memory, share memory by communicating."*

---

## Dispatch

Le **dispatch** est un aiguilleur de messages. On a un `case` pour créer une room, un pour rejoindre une room, un pour le placement des bateaux en début de partie, et un pour les tirs. Les 4 étapes dans l'ordre d'une partie :

1. **`create_room`** — le joueur 0 crée la room
2. **`join_room`** — le joueur 1 rejoint, ce qui déclenche automatiquement la `placement_phase`
3. **`place_ships`** — chaque joueur pose ses bateaux, quand les deux ont fini ça déclenche `game_start`
4. **`fire`** — les joueurs tirent à tour de rôle jusqu'au `game_over`
