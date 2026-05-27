import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface BleDevice {
  id:   string
  name: string
  rssi: number | null
}

/**
 * Transport Bluetooth pour le mode guest (Central BLE).
 * Expose la même interface que WebRTCPeer pour être utilisé
 * directement dans P2PHostGame sans modifier la logique de jeu.
 */
export class BluetoothPeer {
  private unlistenData: UnlistenFn | null = null
  private unlistenConn: UnlistenFn | null = null

  onChannelOpen:    (() => void)          | null = null
  onChannelClose:   (() => void)          | null = null
  onChannelMessage: ((data: string) => void) | null = null

  /** Démarre le mode hôte : annonce l'app en BLE et attend le guest. */
  async startHost(): Promise<void> {
    this.unlistenData = await listen<string>('ble-data', (event) => {
      this.onChannelMessage?.(event.payload)
    })
    this.unlistenConn = await listen<string>('ble-connection', (event) => {
      if (event.payload === 'open') this.onChannelOpen?.()
      else                          this.onChannelClose?.()
    })
    await invoke('ble_start_host')
  }

  /** Scanne les appareils BLE à portée (~4 secondes). */
  async scan(): Promise<BleDevice[]> {
    return invoke<BleDevice[]>('ble_scan')
  }

  /**
   * Connecte au périphérique Bluetooth identifié par son id.
   * Installe les listeners Tauri avant d'invoquer la connexion Rust,
   * pour ne rater aucun événement d'ouverture/fermeture.
   */
  async connect(deviceId: string): Promise<void> {
    this.unlistenData = await listen<string>('ble-data', (event) => {
      this.onChannelMessage?.(event.payload)
    })

    this.unlistenConn = await listen<string>('ble-connection', (event) => {
      if (event.payload === 'open') this.onChannelOpen?.()
      else                          this.onChannelClose?.()
    })

    await invoke('ble_connect', { deviceId })
  }

  /** Envoie un message JSON sérialisé à l'hôte. */
  send(data: unknown): void {
    invoke('ble_send', { data: JSON.stringify(data) }).catch(console.error)
  }

  /** Déconnecte et nettoie les listeners. */
  close(): void {
    invoke('ble_disconnect').catch(console.error)
    this.unlistenData?.()
    this.unlistenConn?.()
    this.unlistenData = null
    this.unlistenConn = null
  }
}
