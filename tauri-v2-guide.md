# Tauri V2 — Guide complet de A à Z

## Sommaire

1. [C'est quoi Tauri ?](#1-cest-quoi-tauri-)
2. [Architecture fondamentale](#2-architecture-fondamentale)
3. [Installation et prérequis](#3-installation-et-prérequis)
4. [Créer un projet Tauri V2](#4-créer-un-projet-tauri-v2)
5. [Structure du projet](#5-structure-du-projet)
6. [Les commandes Tauri (JS ↔ Rust)](#6-les-commandes-tauri-js--rust)
7. [Les événements (Events)](#7-les-événements-events)
8. [Les plugins officiels](#8-les-plugins-officiels)
9. [Bluetooth avec Tauri V2](#9-bluetooth-avec-tauri-v2)
10. [Sécurité et permissions (CSP)](#10-sécurité-et-permissions-csp)
11. [Build et distribution](#11-build-et-distribution)
12. [Bonnes pratiques](#12-bonnes-pratiques)
13. [Pièges à éviter](#13-pièges-à-éviter)
14. [Comparaison Tauri V1 vs V2](#14-comparaison-tauri-v1-vs-v2)

---

## 1. C'est quoi Tauri ?

Tauri est un **framework pour créer des applications desktop** (Windows, macOS, Linux) avec des technologies web (HTML/CSS/JS/React/Vue…) côté UI, et **Rust** pour la couche système native.

### Ce qu'il fait

```
┌──────────────────────────────────────────────────────┐
│                   Application Tauri                   │
│                                                       │
│  ┌─────────────────────┐   ┌───────────────────────┐ │
│  │   Frontend (WebView) │   │   Backend (Rust)       │ │
│  │                     │   │                       │ │
│  │  React / Vue / TS   │◄──►   Système natif       │ │
│  │  Ton code existant  │   │   Bluetooth, FS, etc. │ │
│  └─────────────────────┘   └───────────────────────┘ │
│                                                       │
│  WebView OS (WKWebView/WebView2/WebKitGTK)            │
│  Pas de Chromium embarqué → ~10MB seulement           │
└──────────────────────────────────────────────────────┘
```

### Différences clés avec Electron

| Critère | Electron | Tauri V2 |
|---------|----------|----------|
| Poids binaire | ~150MB | ~10MB |
| Moteur JS | Node.js | Rust |
| WebView | Chromium embarqué | WebView du système |
| Sécurité | Faible par défaut | Restrictive par défaut |
| Bluetooth | Via Node.js | Via plugin Rust |
| Maturité | Très mature | Mature (v2 stable 2024) |

---

## 2. Architecture fondamentale

### Le pont IPC (Inter-Process Communication)

Tauri utilise un **pont IPC** pour la communication entre le frontend JS et le backend Rust. Ce n'est pas de la mémoire partagée — c'est de la **sérialisation JSON** via un canal sécurisé.

```
Frontend (JS)          IPC Bridge          Backend (Rust)
     │                                          │
     │  invoke("ma_commande", { param: 42 })   │
     │─────────────────────────────────────────►│
     │                                          │  fn ma_commande(param: i32)
     │                                          │  → logique Rust
     │◄─────────────────────────────────────────│
     │  { result: "ok" }                        │
```

### Les deux processus

- **WebView Process** : ton React/Vue/TS, exactement comme dans un navigateur
- **Core Process** : le runtime Rust, accès au système, aux fichiers, au Bluetooth, etc.

---

## 3. Installation et prérequis

### Prérequis système

```bash
# macOS
xcode-select --install
brew install rustup
rustup-init

# Windows
# Installer Microsoft C++ Build Tools
# Installer Rust depuis https://rustup.rs

# Linux (Debian/Ubuntu)
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  file libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Vérifier l'installation

```bash
rustc --version    # rust 1.77+
cargo --version    # cargo 1.77+
node --version     # node 18+
```

### Installer le CLI Tauri

```bash
npm install -g @tauri-apps/cli@latest
# ou
cargo install tauri-cli
```

---

## 4. Créer un projet Tauri V2

### Nouveau projet from scratch

```bash
npm create tauri-app@latest mon-projet
# Choisir : React + TypeScript
cd mon-projet
npm install
npm run tauri dev
```

### Intégrer dans un projet existant (ton cas — React/TS déjà là)

```bash
# Dans le dossier frontend existant
npm install @tauri-apps/api@latest
npm install --save-dev @tauri-apps/cli@latest

# Initialiser Tauri dans le projet existant
npx tauri init
```

Le CLI pose 5 questions :
- Nom de l'app → `Battleship`
- Nom de la fenêtre → `Battleship`
- Dossier des assets web → `../dist` (ton build Vite)
- URL de dev → `http://localhost:5173`
- Commande de dev → `npm run dev`
- Commande de build → `npm run build`

---

## 5. Structure du projet

```
mon-projet/
├── src/                    ← Ton frontend React (inchangé)
│   ├── App.tsx
│   └── ...
├── src-tauri/              ← Tout le code Rust Tauri
│   ├── src/
│   │   ├── main.rs         ← Point d'entrée Rust
│   │   ├── lib.rs          ← Logique principale
│   │   └── bluetooth.rs    ← Ex: module Bluetooth
│   ├── Cargo.toml          ← Dépendances Rust (équiv. package.json)
│   ├── tauri.conf.json     ← Config Tauri (permissions, fenêtre, etc.)
│   └── capabilities/       ← Fichiers de permissions V2
│       └── default.json
├── package.json
└── vite.config.ts
```

### `tauri.conf.json` — la configuration centrale

```json
{
  "productName": "Battleship",
  "version": "0.1.0",
  "identifier": "com.nws.battleship",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Battleship",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png"]
  }
}
```

---

## 6. Les commandes Tauri (JS ↔ Rust)

C'est le mécanisme principal pour appeler du code Rust depuis ton React.

### Côté Rust — déclarer une commande

```rust
// src-tauri/src/lib.rs

use tauri::command;

// Commande simple
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Bonjour, {}!", name)
}

// Commande async (pour les opérations longues : Bluetooth, FS...)
#[tauri::command]
async fn scan_bluetooth_devices() -> Result<Vec<String>, String> {
    // logique async...
    Ok(vec!["Device A".to_string(), "Device B".to_string()])
}

// Enregistrer les commandes au démarrage
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            scan_bluetooth_devices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Côté Frontend — appeler depuis React/TS

```typescript
// src/lib/tauri.ts
import { invoke } from "@tauri-apps/api/core";

// Appel simple
const message = await invoke<string>("greet", { name: "Maxime" });

// Appel avec gestion d'erreur
try {
  const devices = await invoke<string[]>("scan_bluetooth_devices");
  console.log(devices);
} catch (error) {
  console.error("Erreur Bluetooth:", error);
}
```

### Typage TypeScript — bonne pratique

Crée un fichier de types pour tes commandes :

```typescript
// src/types/tauri-commands.ts
export interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number;
}

export async function scanBluetoothDevices(): Promise<BluetoothDevice[]> {
  return invoke<BluetoothDevice[]>("scan_bluetooth_devices");
}

export async function connectToDevice(deviceId: string): Promise<void> {
  return invoke<void>("connect_to_device", { deviceId });
}
```

---

## 7. Les événements (Events)

Les événements permettent au Rust d'**envoyer des données au frontend sans que le frontend ait demandé** — parfait pour le Bluetooth (données reçues en temps réel).

### Rust → Frontend (émission depuis Rust)

```rust
use tauri::{AppHandle, Emitter};

#[tauri::command]
async fn start_bluetooth_listen(app: AppHandle) -> Result<(), String> {
    // Simuler la réception de données Bluetooth
    tokio::spawn(async move {
        loop {
            // Données reçues via Bluetooth...
            let data = GameMove { x: 3, y: 5 };

            app.emit("bluetooth-move-received", &data)
               .expect("failed to emit event");

            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    });
    Ok(())
}
```

### Frontend — écouter un événement

```typescript
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";

interface GameMove {
  x: number;
  y: number;
}

function GameBoard() {
  useEffect(() => {
    let unlisten: UnlistenFn;

    listen<GameMove>("bluetooth-move-received", (event) => {
      console.log("Coup reçu:", event.payload);
      // Mettre à jour le state du jeu
    }).then((fn) => {
      unlisten = fn;
    });

    // Cleanup obligatoire au démontage du composant
    return () => {
      unlisten?.();
    };
  }, []);
}
```

### Frontend → Rust (émission depuis le frontend)

```typescript
import { emit } from "@tauri-apps/api/event";

// Envoyer un coup au backend Rust
await emit("player-move", { x: 2, y: 7 });
```

```rust
// Écouter côté Rust
use tauri::Listener;

app.listen("player-move", |event| {
    let payload: GameMove = serde_json::from_str(event.payload()).unwrap();
    // Traiter le coup reçu
});
```

---

## 8. Les plugins officiels

Tauri V2 a un système de plugins modulaire. Tu n'embarques que ce dont tu as besoin.

### Plugins disponibles

| Plugin | Rôle | Install |
|--------|------|---------|
| `tauri-plugin-fs` | Accès fichiers | `cargo add tauri-plugin-fs` |
| `tauri-plugin-shell` | Lancer des processus | `cargo add tauri-plugin-shell` |
| `tauri-plugin-notification` | Notifications OS | `cargo add tauri-plugin-notification` |
| `tauri-plugin-dialog` | Boîtes de dialogue | `cargo add tauri-plugin-dialog` |
| `tauri-plugin-http` | Requêtes HTTP | `cargo add tauri-plugin-http` |
| `tauri-plugin-store` | Stockage persistant | `cargo add tauri-plugin-store` |
| `tauri-plugin-bluetooth` | Bluetooth BLE | Voir section 9 |

### Ajouter un plugin (exemple : store)

```bash
# Côté Rust
cargo add tauri-plugin-store

# Côté JS
npm install @tauri-apps/plugin-store
```

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![...])
        .run(tauri::generate_context!())
        .unwrap();
}
```

```typescript
// Utilisation dans React
import { load } from "@tauri-apps/plugin-store";

const store = await load("settings.json", { autoSave: false });
await store.set("player-name", "Maxime");
await store.save();
```

---

## 9. Bluetooth avec Tauri V2

C'est la raison principale pour laquelle tu utilises Tauri. Voilà comment ça s'articule.

### Option A — Plugin communautaire `tauri-plugin-bluetooth`

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-blec = "0.5"   # BLE Client
# ou
btleplug = "0.11"           # Lib BLE bas niveau, plus de contrôle
```

### Option B — `btleplug` (recommandé, plus mature)

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2" }
btleplug = "0.11"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Exemple complet : scan + connexion + envoi de données

```rust
// src-tauri/src/bluetooth.rs
use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time;

#[derive(Serialize, Deserialize, Clone)]
pub struct BleDevice {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GameMove {
    pub x: u8,
    pub y: u8,
}

// Scanner les appareils BLE à portée
#[tauri::command]
pub async fn scan_devices() -> Result<Vec<BleDevice>, String> {
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    let adapter = adapters.into_iter().next().ok_or("Pas d'adaptateur Bluetooth")?;

    adapter.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
    time::sleep(Duration::from_secs(3)).await;
    adapter.stop_scan().await.map_err(|e| e.to_string())?;

    let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
    let mut devices = Vec::new();

    for p in peripherals {
        let props = p.properties().await.map_err(|e| e.to_string())?;
        if let Some(props) = props {
            devices.push(BleDevice {
                id: p.id().to_string(),
                name: props.local_name.unwrap_or("Inconnu".to_string()),
            });
        }
    }

    Ok(devices)
}

// Envoyer un coup au joueur distant via BLE
#[tauri::command]
pub async fn send_move(device_id: String, game_move: GameMove) -> Result<(), String> {
    // Logique de connexion et d'envoi...
    // En pratique, garder la connexion dans un state global Tauri
    Ok(())
}
```

### Enregistrer les commandes Bluetooth

```rust
// src-tauri/src/lib.rs
mod bluetooth;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            bluetooth::scan_devices,
            bluetooth::send_move,
        ])
        .run(tauri::generate_context!())
        .unwrap();
}
```

### Permissions macOS (obligatoire)

```xml
<!-- src-tauri/Info.plist -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Battleship utilise le Bluetooth pour jouer avec un adversaire à proximité</string>
```

### Permissions Windows

Tauri gère automatiquement le manifest Windows pour Bluetooth.

---

## 10. Sécurité et permissions (CSP)

C'est la grande nouveauté de Tauri V2 : un système de **capabilities** granulaire.

### Fichier de capabilities

```json
// src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions par défaut",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:default",
    "shell:allow-open",
    "fs:allow-read-text-file",
    "notification:default"
  ]
}
```

### Principe du moindre privilège

Ne donne que les permissions nécessaires. Exemple pour une app qui n'a besoin que du Bluetooth et du store :

```json
{
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "store:allow-load",
    "store:allow-set",
    "store:allow-save"
  ]
}
```

### CSP (Content Security Policy)

```json
// tauri.conf.json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

---

## 11. Build et distribution

### Développement

```bash
npm run tauri dev
# Lance Vite + le backend Rust en mode watch
# Hot reload pour le frontend, recompilation pour le Rust
```

### Build de production

```bash
npm run tauri build
# Produit : src-tauri/target/release/bundle/
# ├── dmg/          (macOS)
# ├── msi/ et nsis/ (Windows)
# └── deb/ et rpm/  (Linux)
```

### Signer l'application (requis pour distribution)

```bash
# macOS — nécessite un compte Apple Developer
export APPLE_CERTIFICATE="..."
export APPLE_CERTIFICATE_PASSWORD="..."
export APPLE_ID="ton@email.com"
export APPLE_PASSWORD="app-specific-password"

npm run tauri build
```

### Auto-update (mise à jour automatique)

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://ton-serveur.com/updates/{{target}}/{{current_version}}"],
      "dialog": true,
      "pubkey": "ta-clé-publique"
    }
  }
}
```

---

## 12. Bonnes pratiques

### Rust

**Gérer l'état partagé avec `State`**

```rust
// Ne pas créer de globaux mutable → utiliser Tauri State
use std::sync::Mutex;
use tauri::State;

struct BluetoothState {
    connected_device: Option<String>,
}

#[tauri::command]
fn get_connected_device(state: State<Mutex<BluetoothState>>) -> Option<String> {
    state.lock().unwrap().connected_device.clone()
}

pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(BluetoothState { connected_device: None }))
        .invoke_handler(tauri::generate_handler![get_connected_device])
        .run(tauri::generate_context!())
        .unwrap();
}
```

**Toujours retourner `Result<T, String>` depuis les commandes**

```rust
// ✅ Bien — l'erreur remonte proprement au frontend
#[tauri::command]
async fn connect(device_id: String) -> Result<(), String> {
    do_connect(&device_id).await.map_err(|e| e.to_string())
}

// ❌ Éviter — panic visible uniquement dans les logs Rust
#[tauri::command]
async fn connect(device_id: String) {
    do_connect(&device_id).await.unwrap(); // crash silencieux côté JS
}
```

**Séparer les modules**

```
src-tauri/src/
├── main.rs          ← 5 lignes max, juste le point d'entrée
├── lib.rs           ← Builder Tauri, enregistrement des plugins/commandes
├── bluetooth.rs     ← Tout ce qui touche au Bluetooth
├── game.rs          ← Logique métier du jeu
└── state.rs         ← Structures de state partagé
```

### Frontend

**Hook pour les commandes Tauri**

```typescript
// src/hooks/useTauriCommand.ts
import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback } from "react";

export function useTauriCommand<T, P = void>(command: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (params?: P) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<T>(command, params as Record<string, unknown>);
      setData(result);
      return result;
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [command]);

  return { data, loading, error, execute };
}

// Utilisation
function BluetoothPanel() {
  const { data: devices, loading, execute: scan } = useTauriCommand<BleDevice[]>("scan_devices");

  return (
    <button onClick={() => scan()} disabled={loading}>
      {loading ? "Scan..." : "Scanner"}
    </button>
  );
}
```

**Détecter si on est dans Tauri ou dans un navigateur**

```typescript
// src/lib/platform.ts
export const isTauri = () => "__TAURI_INTERNALS__" in window;

// Utilisation — pour fallback WebRTC si pas dans Tauri
export async function sendMove(move: GameMove) {
  if (isTauri()) {
    await invoke("send_move", { gameMove: move });
  } else {
    await webRTCPeer.sendMove(move);
  }
}
```

---

## 13. Pièges à éviter

### Piège 1 — Bloquer le thread principal Rust

```rust
// ❌ Bloque l'UI
#[tauri::command]
fn scan() -> Vec<String> {
    std::thread::sleep(Duration::from_secs(5)); // bloque tout
    vec![]
}

// ✅ Toujours async pour les opérations longues
#[tauri::command]
async fn scan() -> Vec<String> {
    tokio::time::sleep(Duration::from_secs(5)).await;
    vec![]
}
```

### Piège 2 — Oublier le cleanup des listeners

```typescript
// ❌ Fuite mémoire — le listener reste après démontage du composant
useEffect(() => {
  listen("bluetooth-data", handler);
}, []);

// ✅ Toujours cleanup
useEffect(() => {
  let unlisten: UnlistenFn;
  listen("bluetooth-data", handler).then(fn => { unlisten = fn; });
  return () => unlisten?.();
}, []);
```

### Piège 3 — Sérialisation Rust ↔ JS

```rust
// ❌ Rust snake_case pas automatiquement converti
#[derive(Serialize)]
struct GameMove {
    player_id: String,    // reçu comme "player_id" en JS
}

// ✅ Renommer pour le frontend
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GameMove {
    player_id: String,    // reçu comme "playerId" en JS
}
```

### Piège 4 — CORS en mode dev

En mode `tauri dev`, le frontend tourne sur `localhost:5173`. Configure Vite pour proxyer les appels vers ton backend Go :

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
```

### Piège 5 — Permissions manquantes (V2)

Si une commande ne répond pas sans erreur visible, vérifie d'abord que la permission correspondante est dans `capabilities/default.json`. L'erreur est souvent silencieuse.

---

## 14. Comparaison Tauri V1 vs V2

| Aspect | V1 | V2 |
|--------|----|----|
| Système de permissions | `allowlist` dans `tauri.conf.json` | `capabilities/*.json` séparés |
| Multi-fenêtre | Basique | Complet avec webviews |
| Plugins | Intégrés dans le core | Modulaires, opt-in |
| Mobile | Non | iOS/Android expérimental |
| API JS | `@tauri-apps/api` v1 | `@tauri-apps/api` v2 (breaking changes) |
| `invoke` | `import { invoke } from "@tauri-apps/api/tauri"` | `import { invoke } from "@tauri-apps/api/core"` |

### Migration V1 → V2 en un coup d'œil

```bash
npm install @tauri-apps/api@2
npm install --save-dev @tauri-apps/cli@2
```

```typescript
// V1
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

// V2
import { invoke } from "@tauri-apps/api/core";    // ← changé
import { listen } from "@tauri-apps/api/event";   // ← inchangé
```

---

## Ressources officielles

- [Documentation Tauri V2](https://v2.tauri.app)
- [Tauri V2 — Migration depuis V1](https://v2.tauri.app/start/migrate/from-tauri-1)
- [btleplug — Bluetooth Rust](https://github.com/deviceplug/btleplug)
- [Awesome Tauri](https://github.com/tauri-apps/awesome-tauri)
- [Tauri Discord](https://discord.com/invite/tauri)
