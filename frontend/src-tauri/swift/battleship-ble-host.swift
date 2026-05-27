// battleship-ble-host.swift
// Helper CoreBluetooth pour le mode Hôte (Peripheral / GATT server).
// Lancé en sous-processus par Tauri. Communique via stdin/stdout en JSON.
//
// Protocole stdin  (Rust → Swift) :
//   {"type":"send","payload":"<json-string>"}   envoie une notification au guest
//   {"type":"stop"}                             arrête le processus
//
// Protocole stdout (Swift → Rust) :
//   {"type":"advertising"}                      BLE advertising démarré
//   {"type":"connected"}                        un guest s'est connecté
//   {"type":"data","payload":"<json-string>"}   message reçu du guest
//   {"type":"disconnected"}                     le guest s'est déconnecté
//   {"type":"error","message":"..."}            erreur

import CoreBluetooth
import Foundation

let SERVICE_UUID = CBUUID(string: "ba771e56-4e57-4e57-8000-424154544c45")
let CHAR_UUID    = CBUUID(string: "ba771e57-4e57-4e57-8000-424154544c45")

// Émet une ligne JSON sur stdout (lecture par Rust)
func emit(_ dict: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let str  = String(data: data, encoding: .utf8) else { return }
    print(str)
    fflush(stdout)
}

// ── Peripheral Manager ────────────────────────────────────────────────────────

class BLEHost: NSObject, CBPeripheralManagerDelegate {
    private var manager:     CBPeripheralManager!
    private var gameChar:    CBMutableCharacteristic?
    private var centrals:    [CBCentral] = []

    override init() {
        super.init()
        // nil queue → utilise le main run loop (cohérent avec RunLoop.main.run())
        manager = CBPeripheralManager(delegate: self, queue: nil)
    }

    // ── Delegate ──────────────────────────────────────────────────────────────

    func peripheralManagerDidUpdateState(_ pm: CBPeripheralManager) {
        switch pm.state {
        case .poweredOn:
            buildGATT()
        case .poweredOff:
            emit(["type": "error", "message": "Bluetooth est désactivé sur cet appareil."])
        case .unauthorized:
            emit(["type": "error", "message": "Accès Bluetooth refusé. Autorise l'app dans Réglages > Confidentialité > Bluetooth."])
        case .unsupported:
            emit(["type": "error", "message": "Bluetooth non supporté sur cet appareil."])
        default:
            break
        }
    }

    private func buildGATT() {
        let char = CBMutableCharacteristic(
            type:        CHAR_UUID,
            properties:  [.notify, .writeWithoutResponse],
            value:       nil,
            permissions: [.writeable]
        )
        gameChar = char

        let service = CBMutableService(type: SERVICE_UUID, primary: true)
        service.characteristics = [char]
        manager.add(service)
    }

    func peripheralManager(_ pm: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let e = error {
            emit(["type": "error", "message": e.localizedDescription]); return
        }
        // Service enregistré → on s'annonce
        manager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [SERVICE_UUID],
            CBAdvertisementDataLocalNameKey:    "Battleship"
        ])
    }

    func peripheralManagerDidStartAdvertising(_ pm: CBPeripheralManager, error: Error?) {
        if let e = error {
            emit(["type": "error", "message": e.localizedDescription])
        } else {
            emit(["type": "advertising"])
        }
    }

    // Le guest s'est abonné aux notifications → connexion établie
    func peripheralManager(_ pm: CBPeripheralManager, central: CBCentral,
                           didSubscribeTo _: CBCharacteristic) {
        if !centrals.contains(where: { $0.identifier == central.identifier }) {
            centrals.append(central)
        }
        emit(["type": "connected"])
    }

    // Le guest s'est désabonné → déconnexion
    func peripheralManager(_ pm: CBPeripheralManager, central: CBCentral,
                           didUnsubscribeFrom _: CBCharacteristic) {
        centrals.removeAll { $0.identifier == central.identifier }
        if centrals.isEmpty { emit(["type": "disconnected"]) }
    }

    // Message reçu du guest (write without response)
    func peripheralManager(_ pm: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for req in requests {
            if let value = req.value, let text = String(data: value, encoding: .utf8) {
                emit(["type": "data", "payload": text])
            }
            pm.respond(to: req, withResult: .success)
        }
    }

    // ── API publique ──────────────────────────────────────────────────────────

    // Envoie une notification à tous les guests connectés
    func send(_ data: Data) {
        guard let char = gameChar, !centrals.isEmpty else { return }
        _ = manager.updateValue(data, for: char, onSubscribedCentrals: nil)
    }

    func stop() {
        manager.stopAdvertising()
        manager.removeAllServices()
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let host = BLEHost()

// Lecture stdin dans un thread dédié (RunLoop.main est occupé par CoreBluetooth)
Thread {
    while let line = readLine(strippingNewline: true), !line.isEmpty {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type_ = json["type"] as? String
        else { continue }

        switch type_ {
        case "send":
            guard let payload  = json["payload"] as? String,
                  let sendData = payload.data(using: .utf8) else { break }
            DispatchQueue.main.async { host.send(sendData) }

        case "stop":
            DispatchQueue.main.async {
                host.stop()
                exit(0)
            }
        default:
            break
        }
    }
}.start()

RunLoop.main.run()
