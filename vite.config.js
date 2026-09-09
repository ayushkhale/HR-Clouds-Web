import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api/v1': {
        target: 'https://development.hrclouds.in',
        changeOrigin: true,
        secure: false,
      },
      '/docmind-api': {
        target: 'https://api.codewithrishi.fun',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/docmind-api/, '/api/public')
      }
    }
  },
})
