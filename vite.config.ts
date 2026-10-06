import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cursorLiveApi } from './plugins/cursorLiveApi.ts'
import { cursorAgentsApi } from './plugins/cursorAgentsApi.ts'

// https://vite.dev/config/
export default defineConfig({
  // cursorAgentsApi reads CURSOR_API_KEY server-side only (process env or .env.local).
  // envPrefix stays VITE_, so nothing CURSOR_* is ever bundled into the client.
  plugins: [react(), cursorLiveApi(), cursorAgentsApi()],
  server: {
    // Bridge file churn shouldn't trigger reloads; the app polls the JSON itself.
    watch: { ignored: ['**/.cursor-bridge/**', '**/public/cursor-live.json'] },
  },
})
