import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TAURI_DEV_HOST est injecté par Tauri quand on lance `tauri dev`
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],

  // Évite que Vite vide le terminal partagé avec la sortie Rust
  clearScreen: false,

  server: {
    port: 5175,
    strictPort: true,                // Tauri suppose que le port ne change pas
    host: host ?? '0.0.0.0',
    hmr: host
      ? { protocol: 'ws', host, port: 5183 }
      : undefined,
    watch: {
      // Ne pas re-déclencher Vite quand Rust recompile
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws':  { target: 'ws://localhost:8080', ws: true },
    },
  },
})
