# Bluetooth & BLE — jouer sans réseau

> Concepts utilisés dans : `frontend/src-tauri/src/bluetooth.rs`, `frontend/src-tauri/swift/battleship-ble-host.swift`, `frontend/src/transport/BluetoothPeer.ts`

---

## 1. Bluetooth Classic vs BLE

| | Bluetooth Classic (BR/EDR) | BLE (Bluetooth Low Energy) |
|---|---|---|
| Usage | Audio, transfert de fichiers | IoT, capteurs, appareils médicaux, jeux |
| Débit | Jusqu'à 3 Mbps | Jusqu'à 2 Mbps (BLE 5.0) |
| Consommation | Élevée | Très faible |
| Latence | ~100ms | ~6ms (connection interval min) |
| API navigateur | ❌ Non standard | ✅ Web Bluetooth (limité) |
| API desktop | CoreBluetooth (macOS) | CoreBluetooth (macOS) |

Ce projet utilise **BLE** parce que les APIs modernes (CoreBluetooth, bluest) ciblent BLE, et la latence convient pour un jeu au tour par tour.

---

## 2. Architecture GATT — comment BLE organise les données

GATT (Generic Attribute Profile) est le modèle de données de BLE.

```
Device (Peripheral / Serveur GATT)
└── Service UUID: ba771e56-...          ← regroupement logique
    └── Characteristic UUID: ba771e57-... ← la donnée elle-même
        ├── Properties: Notify + WriteWithoutResponse
        └── Value: bytes (nos messages JSON)
```

**Service** : namespace logique (comme une "table" dans une BDD).  
**Characteristic** : la donnée elle-même, avec des propriétés :
- `Notify` : le Peripheral envoie des mises à jour au Central sans que celui-ci demande (push)
- `WriteWithoutResponse` : le Central écrit sans attendre d'ACK (plus rapide, moins fiable)
- `Read` / `Write` : lecture/écriture avec acquittement

**UUID** : identifiant 128 bits. Les UUID standards sont définis par Bluetooth SIG. Les UUID custom (comme les nôtres) évitent les conflits avec les standards.

```
ba771e56-4e57-4e57-8000-424154544c45
           ↑    ↑              ↑
          "NW" "NW"         "BATTLE" en ASCII hex
```

---

## 3. Rôles Central vs Peripheral

```
Peripheral (Hôte / Serveur)          Central (Guest / Client)
┌─────────────────────────┐          ┌─────────────────────────┐
│ CBPeripheralManager     │          │ CBCentralManager        │
│ (Swift / CoreBluetooth) │          │ (bluest / Rust)         │
│                         │          │                         │
│ ► Advertise le service  │ ────────►│ Scan pour UUID          │
│ ► Accepte connexions    │◄────────►│ Connect au device       │
│ ► Envoie Notifications  │ ────────►│ Subscribe Notify        │
│ ► Reçoit Writes         │◄─────────│ Write sans response     │
└─────────────────────────┘          └─────────────────────────┘
```

**Problème fondamental** : ni `btleplug` ni `bluest` (Rust) ne supportent le rôle Peripheral sur desktop. Seul CoreBluetooth (framework natif macOS) le supporte côté desktop.

**Solution** : un binaire Swift qui gère CoreBluetooth Peripheral, lancé comme subprocess par Tauri, communiquant via stdin/stdout JSON.

---

## 4. Communication Rust ↔ Swift via stdin/stdout

```
Rust (Tauri)                     Swift (battleship-ble-host)
     │                                        │
     │── {"type":"send","payload":"..."}  ───►│ stdin
     │                                        │ (envoie notification BLE)
     │◄── {"type":"data","payload":"..."} ────│ stdout
     │◄── {"type":"connected"}            ────│
     │◄── {"type":"advertising"}          ────│
     │── {"type":"stop"}               ───►│
```

C'est le pattern **subprocess IPC** (Inter-Process Communication) via des pipes UNIX (stdin/stdout). Simple, cross-language, pas de socket supplémentaire.

```rust
// bluetooth.rs — lancement du helper Swift
let (mut rx, child) = app
    .shell()
    .sidecar("battleship-ble-host")
    .map_err(|e| format!("Sidecar introuvable : {e}"))?
    .spawn()?;

tokio::spawn(async move {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => { /* parse JSON, émettre event Tauri */ }
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }
});
```

`tauri-plugin-shell` gère automatiquement les pipes et expose les événements via un channel async Rust.

---

## 5. Le code Swift — CBPeripheralManager

```swift
// battleship-ble-host.swift (simplifié)

class BLEHost: NSObject, CBPeripheralManagerDelegate {
    var manager: CBPeripheralManager!
    var characteristic: CBMutableCharacteristic!
    var connectedCentral: CBCentral?

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        guard peripheral.state == .poweredOn else { return }
        
        // Créer le service GATT
        let char = CBMutableCharacteristic(
            type: CBUUID(string: CHAR_UUID),
            properties: [.notify, .writeWithoutResponse],
            value: nil,
            permissions: [.readable, .writeable]
        )
        let service = CBMutableService(type: CBUUID(string: SERVICE_UUID), primary: true)
        service.characteristics = [char]
        peripheral.add(service)
        
        // Démarrer l'advertising
        peripheral.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [CBUUID(string: SERVICE_UUID)],
            CBAdvertisementDataLocalNameKey: "Battleship"
        ])
    }
    
    // Envoi d'une notification au Central connecté
    func send(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        manager.updateValue(data, for: characteristic, onSubscribedCentrals: nil)
    }
}
```

**Bonne pratique** : CoreBluetooth doit tourner sur le **main thread** (ou un RunLoop dédié). Le subprocess Swift utilise `RunLoop.main.run()` pour que CoreBluetooth reçoive ses callbacks, et lit stdin dans un thread séparé pour ne pas bloquer le RunLoop.

---

## 6. Découverte et connexion côté Rust (guest)

```rust
// bluetooth.rs — ble_scan()
let adapter = Adapter::default().await
    .ok_or("Bluetooth non disponible")?;   // Option, pas Result !

adapter.wait_available().await?;

let uuid_list = vec![svc_uuid()];           // stocké avant le scan
let mut scan = adapter.scan(&uuid_list).await?;

// timeout 4 secondes
let deadline = time::Instant::now() + Duration::from_secs(4);
loop {
    tokio::select! {
        advert = scan.next() => {
            let Some(AdvertisingDevice { device, rssi, .. }) = advert else { break };
            // dédoublonner par ID
            found.push((device, rssi));
        }
        _ = time::sleep_until(deadline) => break,
    }
}
drop(scan);  // libère le borrow sur adapter AVANT de le stocker
```

**Piège subtle** : `scan` emprunte `adapter` par référence. On ne peut pas stocker `adapter` dans le state tant que `scan` est vivant → `drop(scan)` explicite avant d'accéder à `adapter`.

---

## 7. La boucle de recompilation évitée avec `build.rs`

```rust
// build.rs
if let (Ok(src_meta), Ok(bin_meta)) = (metadata(&swift_src), metadata(&binary_out)) {
    if let (Ok(src_t), Ok(bin_t)) = (src_meta.modified(), bin_meta.modified()) {
        if bin_t >= src_t {
            return;  // binaire plus récent que la source → skip
        }
    }
}
```

Sans cette vérification : Tauri voit le binaire recompilé, déclenche un rebuild Rust, qui recompile le Swift, qui modifie le binaire → boucle infinie.

---

## 8. Ce que tu dois retenir

- **BLE = GATT** : service → characteristic → propriétés (notify, write, read)
- **Central = scanner/connecteur** ; **Peripheral = advertiser/serveur**
- **CoreBluetooth** est l'API macOS native, obligatoire pour le rôle Peripheral sur desktop
- **Subprocess IPC** : stdin/stdout JSON = façon simple de faire communiquer deux langages (Rust ↔ Swift)
- **Bluetooth ≠ WiFi** : fonctionne sans réseau, portée ~10m intérieur, pas d'Internet nécessaire
