import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // exceljs (~940 kB) solo se descarga al abrir la carga por Excel
  build: { chunkSizeWarningLimit: 1000 },
})
