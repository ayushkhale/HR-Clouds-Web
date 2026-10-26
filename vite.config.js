import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// This file's own folder, which is where the env files live. Not `process.cwd()`:
// the lint config gives these files browser globals only, and cwd would depend on
// where the command was typed from.
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

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

// The ORIGIN of whatever `.env.<mode>` points the app at, for the dev proxy.
// Returns '' for a missing or malformed value rather than throwing: a bad URL
// should fail where the requests are, with the config error from
// `src/config/env.js` beside it, not by refusing to start the dev server.
function apiOrigin(apiBaseUrl) {
  try {
    return apiBaseUrl ? new URL(apiBaseUrl).origin : ''
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `.env.development` and `.env.production` ARE THE SOURCE OF TRUTH for which
  // API this build talks to (user decision, 15 Oct 2026). Nothing in this file
  // may name an API host: the proxy target used to be hardcoded at the deployed
  // dev gateway, so a `/api/v1` request went there no matter what the env file
  // said, and the only symptom was a WebAuthn `rp.id` from the wrong server.
  // It now follows the same variable the app reads.
  const env = loadEnv(mode, projectRoot, '')
  const target = apiOrigin(env.VITE_API_BASE_URL)
  // Printed before the first request, because "which API am I on?" is the
  // question every environment-specific bug starts with.
  console.log(`[vite] mode=${mode} · API → ${env.VITE_API_BASE_URL || `NOT SET — add VITE_API_BASE_URL to .env.${mode}`}`)

  return {
    plugins: [react(), excludeRefDocsFromBuild()],
    server: {
      host: true,
      // Only for a RELATIVE base (`/api/v1/...`). With an absolute one, which
      // both env files use, the browser goes straight to the host above and
      // this never fires — it is here so a relative base still obeys the file.
      ...(target
        ? { proxy: { '/api/v1': { target, changeOrigin: true, secure: false } } }
        : {}),
    },
  }
})
