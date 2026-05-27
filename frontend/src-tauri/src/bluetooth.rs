use bluest::{Adapter, AdvertisingDevice, Characteristic, Device, Uuid};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};
use tokio::time;

const SERVICE_UUID: &str = "ba771e56-4e57-4e57-8000-424154544c45";
const CHAR_UUID: &str    = "ba771e57-4e57-4e57-8000-424154544c45";

fn svc_uuid()  -> Uuid { SERVICE_UUID.parse().unwrap() }
fn char_uuid() -> Uuid { CHAR_UUID.parse().unwrap() }

// ── State ─────────────────────────────────────────────────────────────────────

pub struct BluetoothState {
    // Mode guest (Central)
    adapter:    Option<Adapter>,
    scanned:    Vec<Device>,
    device:     Option<Device>,
    game_char:  Option<Characteristic>,
    // Mode host (Peripheral via subprocess Swift)
    is_host:    bool,
    host_child: Option<CommandChild>,
}

impl Default for BluetoothState {
    fn default() -> Self {
        Self {
            adapter: None, scanned: vec![], device: None, game_char: None,
            is_host: false, host_child: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BleDevice {
    pub id:   String,
    pub name: String,
    pub rssi: Option<i16>,
}

fn device_id_str(d: &Device) -> String { format!("{:?}", d.id()) }

// ── Host : Peripheral via helper Swift ────────────────────────────────────────
//
// Le binaire Swift `battleship-ble-host` gère CoreBluetooth côté Peripheral :
//   - Crée un GATT service + characteristic (même UUIDs)
//   - S'annonce en BLE (advertising) avec le service UUID Battleship
//   - Accepte les connexions des guests (subscribe aux notifications)
//   - Reçoit les messages des guests (write without response)
//   - Envoie des notifications aux guests
//
// Communication Rust ↔ Swift : JSON via stdin/stdout (une ligne = un message)

#[tauri::command]
pub async fn ble_start_host(
    state: State<'_, Arc<Mutex<BluetoothState>>>,
    app:   AppHandle,
) -> Result<(), String> {
    // Lancer le sidecar Swift (chemin résolu automatiquement par Tauri)
    let (mut rx, child) = app
        .shell()
        .sidecar("battleship-ble-host")
        .map_err(|e| format!("Sidecar introuvable : {e}"))?
        .spawn()
        .map_err(|e| format!("Impossible de lancer le helper Bluetooth : {e}"))?;

    {
        let mut s   = state.lock().unwrap();
        s.is_host   = true;
        s.host_child = Some(child);
    }

    // Lire stdout du helper Swift et émettre les événements Tauri correspondants
    let app_bg = app.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let Ok(text) = String::from_utf8(line) else { continue };
                    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { continue };

                    match json["type"].as_str() {
                        Some("advertising")  => { /* BLE advertising actif, rien à faire */ }
                        Some("connected")    => { app_bg.emit("ble-connection", "open").ok(); }
                        Some("disconnected") => { app_bg.emit("ble-connection", "closed").ok(); }
                        Some("data") => {
                            if let Some(payload) = json["payload"].as_str() {
                                app_bg.emit("ble-data", payload).ok();
                            }
                        }
                        Some("error") => {
                            let msg = json["message"].as_str().unwrap_or("Erreur Bluetooth");
                            app_bg.emit("ble-error", msg).ok();
                        }
                        _ => {}
                    }
                }
                CommandEvent::Terminated(_) => {
                    app_bg.emit("ble-connection", "closed").ok();
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

// ── Scan (Central) ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ble_scan(
    state: State<'_, Arc<Mutex<BluetoothState>>>,
) -> Result<Vec<BleDevice>, String> {
    let adapter = Adapter::default().await
        .ok_or("Aucun adaptateur Bluetooth — vérifie que le Bluetooth est activé")?;

    adapter.wait_available().await.map_err(|e| e.to_string())?;

    let uuid_list = vec![svc_uuid()];
    let mut scan  = adapter.scan(&uuid_list).await.map_err(|e| e.to_string())?;

    let mut found: Vec<(Device, Option<i16>)> = vec![];
    let deadline = time::Instant::now() + Duration::from_secs(4);

    loop {
        tokio::select! {
            advert = scan.next() => {
                let Some(AdvertisingDevice { device, rssi, .. }) = advert else { break };
                let id = device_id_str(&device);
                if !found.iter().any(|(d, _)| device_id_str(d) == id) {
                    found.push((device, rssi));
                }
            }
            _ = time::sleep_until(deadline) => break,
        }
    }

    drop(scan); // libère le borrow de adapter

    let devices: Vec<BleDevice> = found.iter().map(|(d, rssi)| BleDevice {
        id:   device_id_str(d),
        name: d.name().unwrap_or_else(|_| "Inconnu".to_string()),
        rssi: *rssi,
    }).collect();

    let scanned = found.into_iter().map(|(d, _)| d).collect();
    {
        let mut s = state.lock().unwrap();
        s.adapter = Some(adapter);
        s.scanned = scanned;
    }

    Ok(devices)
}

// ── Connexion (Central / Guest) ───────────────────────────────────────────────

#[tauri::command]
pub async fn ble_connect(
    device_id: String,
    state:     State<'_, Arc<Mutex<BluetoothState>>>,
    app:       AppHandle,
) -> Result<(), String> {
    let (adapter, device) = {
        let s   = state.lock().unwrap();
        let adp = s.adapter.clone().ok_or("Lance d'abord un scan")?;
        let dev = s.scanned.iter()
            .find(|d| device_id_str(d) == device_id)
            .cloned()
            .ok_or("Appareil introuvable — relance un scan")?;
        (adp, dev)
    };

    adapter.connect_device(&device).await.map_err(|e| e.to_string())?;

    let services = device
        .discover_services_with_uuid(svc_uuid())
        .await
        .map_err(|e| e.to_string())?;

    let service = services.into_iter().next()
        .ok_or("Service Battleship introuvable — l'hôte doit avoir cliqué sur « Héberger »")?;

    let chars = service
        .discover_characteristics_with_uuid(char_uuid())
        .await
        .map_err(|e| e.to_string())?;

    let game_char = chars.into_iter().next()
        .ok_or("Caractéristique GATT introuvable")?;

    {
        let mut s  = state.lock().unwrap();
        s.device    = Some(device);
        s.game_char = Some(game_char.clone());
    }

    let app_bg    = app.clone();
    let char_task = game_char;
    tokio::spawn(async move {
        app_bg.emit("ble-connection", "open").ok();
        if let Ok(mut stream) = char_task.notify().await {
            while let Some(Ok(data)) = stream.next().await {
                if let Ok(text) = String::from_utf8(data) {
                    app_bg.emit("ble-data", text).ok();
                }
            }
        }
        app_bg.emit("ble-connection", "closed").ok();
    });

    Ok(())
}

// ── Envoi (host ou guest) ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn ble_send(
    data:  String,
    state: State<'_, Arc<Mutex<BluetoothState>>>,
) -> Result<(), String> {
    let is_host = state.lock().unwrap().is_host;

    if is_host {
        // Envoie au helper Swift via stdin
        let json = serde_json::json!({ "type": "send", "payload": data });
        let line = format!("{}\n", json);
        let mut s = state.lock().unwrap();
        s.host_child.as_mut()
            .ok_or("Helper Bluetooth non démarré")?
            .write(line.as_bytes())
            .map_err(|e| e.to_string())
    } else {
        // Écrit sur la caractéristique GATT (mode guest)
        let ch = state.lock().unwrap().game_char.clone()
            .ok_or("Non connecté en Bluetooth")?;
        ch.write(data.as_bytes()).await.map_err(|e| e.to_string())
    }
}

// ── Déconnexion ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ble_disconnect(
    state: State<'_, Arc<Mutex<BluetoothState>>>,
) -> Result<(), String> {
    let (adapter, device, host_child, is_host) = {
        let mut s = state.lock().unwrap();
        let adp  = s.adapter.clone();
        let dev  = s.device.take();
        let child = s.host_child.take();
        let host  = s.is_host;
        s.game_char = None;
        s.is_host   = false;
        (adp, dev, child, host)
    };

    if is_host {
        if let Some(mut child) = host_child {
            // Demande d'arrêt propre au helper Swift
            let stop = "{\"type\":\"stop\"}\n";
            child.write(stop.as_bytes()).ok();
            tokio::time::sleep(Duration::from_millis(200)).await;
            child.kill().ok();
        }
    } else if let (Some(adp), Some(dev)) = (adapter, device) {
        adp.disconnect_device(&dev).await.map_err(|e| e.to_string())?;
    }

    Ok(())
}
