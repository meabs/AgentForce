import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cursorLiveApi } from './plugins/cursorLiveApi.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cursorLiveApi()],
  server: {
    // Bridge file churn shouldn't trigger reloads; the app polls the JSON itself.
    watch: { ignored: ['**/.cursor-bridge/**', '**/public/cursor-live.json'] },
  },
})
