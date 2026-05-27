mod bluetooth;

use bluetooth::BluetoothState;
use std::sync::{Arc, Mutex};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(Mutex::new(BluetoothState::default())))
        .invoke_handler(tauri::generate_handler![
            bluetooth::ble_start_host,
            bluetooth::ble_scan,
            bluetooth::ble_connect,
            bluetooth::ble_send,
            bluetooth::ble_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
