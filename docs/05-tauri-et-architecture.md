# Tauri V2 & Architecture — app desktop + web avec un seul codebase

> Concepts utilisés dans : `frontend/src-tauri/`, `frontend/src/store/gameStore.ts`, `frontend/src/transport/`

---

## 1. Pourquoi Tauri plutôt qu'Electron ?

| | Electron | Tauri V2 |
|---|---|---|
| Runtime JS | Node.js embarqué | WebView natif de l'OS |
| Taille bundle | ~120MB | ~5–10MB |
| Mémoire | ~200MB | ~30MB |
| Langage backend | JavaScript | Rust |
| BLE Peripheral | Possible (node-ble) | Via subprocess natif |
| Temps de build | Rapide | Plus lent (compilation Rust) |

**WebView natif** = sur macOS, c'est WKWebView (le même que Safari). Sur Windows, WebView2 (Edge Chromium). Tauri ne distribue pas un Chromium entier.

---

## 2. Architecture Tauri

```
┌─────────────────────────────────────────────────────┐
│                Application Tauri                      │
│                                                       │
│  ┌─────────────────────┐    ┌──────────────────────┐ │
│  │   Frontend (React)  │    │   Backend (Rust)      │ │
│  │   WebView / HTML    │◄──►│   src-tauri/src/      │ │
│  │   TypeScript        │    │   bluetooth.rs        │ │
│  │   Vite build        │    │   lib.rs              │ │
│  └─────────────────────┘    └──────────────────────┘ │
│         invoke() / emit()                             │
└─────────────────────────────────────────────────────┘
         │
         │ sidecar (subprocess)
         ▼
┌─────────────────────┐
│ battleship-ble-host │  (binaire Swift, CoreBluetooth)
└─────────────────────┘
```

**IPC Tauri** (Inter-Process Communication) :
- **`invoke()`** : TypeScript → Rust (appel de commande, retourne un résultat)
- **`emit()`** : Rust → TypeScript (événement push, pas de retour)

```typescript
// TypeScript → Rust : appel de commande
const devices = await invoke<BleDevice[]>('ble_scan')

// Rust → TypeScript : écoute d'événement
await listen('ble-data', (e) => { dispatch(e.payload) })
await listen('ble-connection', (e) => { /* open/closed */ })
```

```rust
// Rust : définition d'une commande
#[tauri::command]
pub async fn ble_scan(state: State<'_, Arc<Mutex<BluetoothState>>>) 
    -> Result<Vec<BleDevice>, String> { ... }

// Enregistrement
.invoke_handler(tauri::generate_handler![ble_scan, ble_connect, ...])

// Rust : émettre vers le frontend
app.emit("ble-data", payload).ok();
```

---

## 3. State management Rust — Arc<Mutex<T>>

```rust
pub struct BluetoothState {
    adapter:    Option<Adapter>,
    scanned:    Vec<Device>,
    device:     Option<Device>,
    game_char:  Option<Characteristic>,
    is_host:    bool,
    host_child: Option<CommandChild>,
}

// Dans lib.rs
.manage(Arc::new(Mutex::new(BluetoothState::default())))
```

**`Mutex<T>`** : verrou mutual exclusion. Une seule tâche async peut accéder à l'état à la fois.  
**`Arc<T>`** : Atomic Reference Counting = pointeur partagé thread-safe. Plusieurs commandes Tauri (dans des threads différents) peuvent toutes tenir un `Arc` vers le même Mutex.

```rust
// Usage dans une commande
let mut s = state.lock().unwrap();  // acquiert le verrou
s.is_host = true;                   // modification exclusive
// verrou relâché automatiquement à la fin du bloc
```

**Règle** : ne jamais `.await` un futur **pendant** qu'on tient un `Mutex::lock()`. Deadlock garanti car le runtime async ne peut pas progresser.

---

## 4. State management TypeScript — Zustand

```typescript
// gameStore.ts — store Zustand
export const useGameStore = create<GameStore>((set, get) => ({
  connectionStatus: 'disconnected',
  connectionMode: null,
  bleDevices: [],
  
  scanBluetooth: async () => {
    try {
      const devices = await invoke<BleDevice[]>('ble_scan')
      set({ bleDevices: devices })
    } catch (e) {
      set({ error: String(e) })
    }
  },
  
  fire: (x, y) => {
    const { connectionMode, ws, btPeer, p2pPeer } = get()
    const msg = JSON.stringify({ type: 'fire', x, y })
    
    if (connectionMode === 'ws') ws?.send(msg)
    else if (connectionMode === 'bt-host' || connectionMode === 'bt-guest') btPeer?.send(msg)
    else if (connectionMode === 'p2p-host' || connectionMode === 'p2p-guest') p2pPeer?.send(msg)
  }
}))
```

**Zustand vs Redux** : Zustand est plus simple (pas d'actions/reducers séparés), suffit pour ce projet. Redux brille sur des apps avec des centaines de reducers et des middlewares complexes.

**Pourquoi un store global ?** L'état de connexion (WebSocket, Bluetooth, P2P) est utilisé par de nombreux composants (Home, GameBoard, ConnectionStatus). Passer les props à travers 5 niveaux de composants serait du "prop drilling" — le store évite ça.

---

## 5. Le pattern Strategy — interchanger les transports

```typescript
// interface commune
interface GameTransport {
  send(data: string): void
  onMessage(cb: (data: string) => void): void
  close(): void
}

// Implémentations
class WebRTCPeer implements GameTransport { ... }
class BluetoothPeer implements GameTransport { ... }

// Utilisation dans l'engine (ne sait pas quel transport)
class P2PHostGame {
  constructor(private transport: GameTransport) {}
  
  fire(x: number, y: number) {
    this.transport.send(JSON.stringify({ type: 'fire', x, y }))
  }
}

// Instanciation avec le bon transport selon le mode
const game = new P2PHostGame(new BluetoothPeer())  // ou WebRTCPeer
```

**Pattern Strategy** : l'algorithme (le jeu) est séparé de son "transport" (comment les données arrivent). Ajouter un nouveau transport (ex: WebSocket LAN) = créer une classe qui implémente l'interface, sans toucher à l'engine.

---

## 6. Le sidecar — processus natif depuis Tauri

```toml
# Cargo.toml
[dependencies]
tauri-plugin-shell = "2.3.5"

# tauri.conf.json
"bundle": {
  "externalBin": ["binaries/battleship-ble-host"]
}
```

Le binaire est nommé `battleship-ble-host-aarch64-apple-darwin` (avec le triple architecture). Tauri résout automatiquement le bon binaire selon l'architecture au runtime.

```rust
app.shell()
   .sidecar("battleship-ble-host")  // Tauri ajoute le triple auto
   .spawn()                          // lance le processus
```

En développement, Tauri cherche dans `src-tauri/binaries/`. En production (bundle), le binaire est embarqué dans l'app.

---

## 7. `build.rs` — script de build Cargo

`build.rs` s'exécute avant la compilation Rust. Il peut générer du code, compiler des ressources, vérifier des prérequis.

```rust
// build.rs
fn main() {
    tauri_build::build();        // obligatoire pour Tauri
    compile_swift_helper();      // notre ajout
}
```

**`cargo:rerun-if-changed=swift/battleship-ble-host.swift`** : directive Cargo pour ne relancer `build.rs` que si ce fichier change. Sans ça, `build.rs` tourne à chaque `cargo build`.

---

## 8. Les permissions Tauri V2 — capabilities

```json
// capabilities/default.json
{
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "shell:allow-execute",
    "shell:allow-kill"
  ]
}
```

Tauri V2 adopte un modèle de permissions **opt-in** : aucune permission par défaut. Chaque API utilisable depuis le frontend doit être explicitement autorisée. C'est le principe du **moindre privilège** : l'app n'a que les droits dont elle a besoin.

`shell:allow-execute` + `shell:allow-kill` = nécessaires pour lancer et arrêter le sidecar Swift.

---

## 9. Ce que tu dois retenir

- **Tauri = WebView + Rust** : léger, sécurisé, accès aux APIs natives
- **`invoke`/`emit`** : pont TypeScript ↔ Rust (appel de fonction vs événement)
- **`Arc<Mutex<T>>`** : partage de state thread-safe en Rust
- **Zustand** : store global React, alternative légère à Redux
- **Pattern Strategy** : séparer l'algorithme de son implémentation → extensible sans modification
- **Capabilities** : modèle de permissions opt-in = sécurité par défaut
- **Sidecar** : processus natif embarqué dans l'app Tauri, communication via stdin/stdout
