import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cursorLiveApi } from './plugins/cursorLiveApi.ts'
import { cursorAgentsApi } from './plugins/cursorAgentsApi.ts'

// The demo-only build (VITE_STATIC_DEMO=1, `npm run build:demo`) is published to GitHub Pages
// under https://meabs.github.io/AgentForce/, so it needs a subpath base. Override with DEMO_BASE
// (e.g. DEMO_BASE=/ for root hosting). Dev and the normal build always use '/'.
const STATIC_DEMO = process.env.VITE_STATIC_DEMO === '1'
const base = STATIC_DEMO ? (process.env.DEMO_BASE ?? '/AgentForce/') : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  // cursorAgentsApi reads CURSOR_API_KEY server-side only (process env or .env.local).
  // envPrefix stays VITE_, so nothing CURSOR_* is ever bundled into the client.
  plugins: [react(), cursorLiveApi(), cursorAgentsApi()],
  server: {
    // Bridge file churn shouldn't trigger reloads; the app polls the JSON itself.
    watch: { ignored: ['**/.cursor-bridge/**', '**/public/cursor-live.json'] },
  },
})
