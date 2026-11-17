import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyPdfjsDecoders } from './scripts/copy-pdfjs.js'

// pdf.js's decoders for scanned PDFs go in public/ before every dev server and
// build, however Vite is started (scripts/copy-pdfjs.js).
const pdfjsDecoders = {
  name: 'rams-pdfjs-decoders',
  buildStart() {
    copyPdfjsDecoders()
  },
}

// RAMS runs beside ROMS locally: UI on 5174 (ROMS 5173), API on 5001 (ROMS 5000).
export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsDecoders],
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5001',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
