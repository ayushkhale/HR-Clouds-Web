import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `public/ref docs/` is the API contract source of truth for developers — 6 MB
// of markdown that nothing in the app ever fetches (it appears only in header
// comments). Vite copies `public/` verbatim with no ignore list, so the folder
// is deleted again once the bundle is written rather than shipped to every
// visitor. Keep it here, not moved out of `public/`: CLAUDE.md §9 and every
// "source of truth" comment in `src/` point at that path.
function excludeRefDocsFromBuild() {
  let outDir
  return {
    name: 'exclude-ref-docs-from-build',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      rmSync(resolve(outDir, 'ref docs'), { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), excludeRefDocsFromBuild()],
  server: {
    host: true,
    proxy: {
      '/api/v1': {
        target: 'https://development.hrclouds.in',
        changeOrigin: true,
        secure: false,
      }
    }
  },
})
