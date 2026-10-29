import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Στο `npm run dev` το API τρέχει από το `wrangler pages dev` (πόρτα 8788).
    proxy: { '/api': 'http://localhost:8788' },
  },
})
