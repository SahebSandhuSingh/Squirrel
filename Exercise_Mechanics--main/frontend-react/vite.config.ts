import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// FitSync Pose-Coach frontend.
// - base './' so built assets resolve under the FastAPI StaticFiles mount.
// - build into ../frontend-dist, which backend/main.py serves at "/".
// - dev: proxy the /ws WebSocket AND the /api REST routes to the uvicorn backend
//   on :8000 so `npm run dev` (Vite on :5173) talks to the real pipeline + the
//   onboarding POST /api/users endpoint.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../frontend-dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
