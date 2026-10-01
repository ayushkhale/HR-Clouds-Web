# Frontend Guide — Connecting to the Production API

**Date:** 2026-10-01
**For:** the HRMS frontend team
**Status:** the production backend is being stood up now. Nothing below is live yet; read this before it is.

---

## 1. The short version

| | Development | Production |
| :--- | :--- | :--- |
| API base URL | `https://development.hrclouds.in/api/v1` | `https://api.hrclouds.in/api/v1` |
| Frontend origin | `https://frontend.dev.hrclouds.in` | `https://hrclouds.in` |

Two things you must do:

1. **Stop hardcoding the base URL.** Section 2 is the pattern — one change now, no code change at any future merge.
2. **Tell us your exact production origin(s), including scheme and port.** Section 3 explains why this is now a blocking dependency rather than something that just works.

Everything else is unchanged. No request shape, response shape, field name, status code or auth mechanism has changed.

---

## 2. Making dev → production merges require zero code changes

This is the part worth getting right once.

### 2.1 The rule

**No URL, origin or environment name appears anywhere in `src/` except in one module, and that module reads it from the environment.** If a reviewer sees `hrclouds.in` in a component, a service, or an axios call, that is the bug.

### 2.2 Build-time configuration (recommended)

If you are on Vite, this is already supported and costs about twenty minutes.

Create two files at the project root. **Commit both** — they hold no secrets, only public URLs.

`.env.development`
```
VITE_API_BASE_URL=https://development.hrclouds.in/api/v1
VITE_ENVIRONMENT=development
```

`.env.production`
```
VITE_API_BASE_URL=https://api.hrclouds.in/api/v1
VITE_ENVIRONMENT=production
```

Vite selects the file by build mode automatically: `vite build` uses `.env.production`, `vite build --mode development` uses `.env.development`. Nothing in your code branches on it.

> CRA equivalent: same filenames, `REACT_APP_` prefix. Next.js: `NEXT_PUBLIC_` prefix, same file names.

Then one module — the **only** place in the codebase that knows a URL exists:

`src/config/env.js`
```js
// The single source of truth for environment configuration.
// Nothing else in src/ may reference a URL, a hostname, or an environment name.
const required = (key) => {
  const value = import.meta.env[key]
  if (!value) {
    // Fail at boot, not at the first API call. A blank screen with a clear
    // console error beats a deployed app that 404s against `undefined/auth/login`.
    throw new Error(`Missing build-time config: ${key}`)
  }
  return value
}

export const API_BASE_URL = required('VITE_API_BASE_URL').replace(/\/+$/, '')
export const ENVIRONMENT  = import.meta.env.VITE_ENVIRONMENT ?? 'development'
export const IS_PRODUCTION = ENVIRONMENT === 'production'
```

And one HTTP client that every call goes through:

`src/lib/apiClient.js`
```js
import axios from 'axios'
import { API_BASE_URL } from '../config/env'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 110_000,          // see §5.1 — stay under the gateway's 120s
  headers: { 'Content-Type': 'application/json' }
})
```

A merge from your dev branch to your release branch then changes **no source file**. The build mode changes; the code does not.

### 2.3 Enforce it with a lint rule

The pattern only holds if it is checked. Add to `.eslintrc`:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "Literal[value=/hrclouds\\.in|localhost:\\d+|\\d+\\.\\d+\\.\\d+\\.\\d+/]",
        "message": "No hardcoded hosts. Import API_BASE_URL from src/config/env."
      }
    ]
  }
}
```

Add an exception for `src/config/env.js` itself. Without a rule like this, the first hardcoded URL reappears within a sprint.

### 2.4 If you deploy one build artifact to several environments

Build-time variables are baked in at `npm run build`, so a single artifact cannot serve two environments. If your pipeline promotes the *same* bundle from staging to production, use runtime config instead:

Serve `public/config.json` next to `index.html` — **not bundled**, replaced per environment by your deploy:

```json
{ "apiBaseUrl": "https://api.hrclouds.in/api/v1", "environment": "production" }
```

Fetch it before mounting the app:

```js
const res = await fetch('/config.json', { cache: 'no-store' })
window.__APP_CONFIG__ = await res.json()
```

`cache: 'no-store'` matters — a cached `config.json` pointing at the dev API is a confusing outage.

This costs one request before first paint. Only adopt it if you genuinely promote artifacts; otherwise §2.2 is simpler.

### 2.5 Where the values live per host

| Host | Where to set it |
| :--- | :--- |
| Vercel | Project → Settings → Environment Variables, scoped Production / Preview / Development |
| Netlify | Site settings → Environment variables, with branch-specific overrides |
| S3 + CloudFront / manual | pass them in the CI build step: `VITE_API_BASE_URL=… npm run build` |

Backend convention, for reference: the production branch is named **`production`**, not `main`. If you mirror our branch naming, be aware of that.

---

## 3. CORS — now configured per environment

CORS used to be a committed list in the backend repo. It is now an environment variable, which means **the production allowlist is set when we build the production environment file, and your origin has to be in it.**

The old committed list included things that will not carry over:

```
http://192.168.29.37:5173      http://192.168.29.159:5173     (LAN addresses)
http://13.204.143.182:4500     http://13.201.135.88:4500      (bare EC2 IPs)
http://localhost:5173/5174     http://127.0.0.1:5500/5501     (local dev)
https://hrclouds.vercel.app    http://hrclouds.in             (preview / plain HTTP)
```

Development keeps all of these. **Production will allow only the real frontend origins.**

### Action required

Reply with the exact origin strings you need in production. Exact means scheme, host and port, no trailing slash, no path:

```
https://hrclouds.in
https://www.hrclouds.in
```

Specifically tell us if any of these apply, because each needs its own entry:

- `www.` as well as the apex domain
- Vercel/Netlify **preview deployments** — these get a new hostname per deploy and cannot be allowlisted individually. If you need previews to hit the production API, say so and we will find another approach. Pointing previews at the dev API is the usual answer.
- any admin or marketing site on a different subdomain that calls the API

### What a missing origin looks like

The request is served normally but **without** the `Access-Control-Allow-Origin` header, and the browser blocks it. You will see a CORS error in the console and a network entry with **no status code**. There is no JSON error body and nothing in your error handler fires. If that happens on launch day, this is why.

### Constraints that already apply but are easy to trip over

| | Allowed |
| :--- | :--- |
| Methods | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` — note **no `HEAD`** |
| Request headers | `Content-Type`, `Authorization` — **nothing else** |
| Readable response headers | `Content-Disposition` only |
| Credentials | enabled, though auth is `Authorization: Bearer`; no cookies are set or read |

Any custom request header — `X-Requested-With`, `X-Org-Id`, `X-Correlation-Id`, a tracing header injected by an SDK — fails preflight. Tell us before adding one.

Likewise, you cannot read a response header unless it is in the exposed list. If you need pagination totals or a rate-limit header, ask and we will expose it; `Content-Disposition` is there so downloads can recover the filename.

---

## 4. New endpoints

Three unauthenticated health endpoints, mounted outside auth and rate limiting.

| Endpoint | Returns |
| :--- | :--- |
| `GET /api/v1/health/live` | `200` always while the process is up — `{"status":"ok","uptime_s":132}` |
| `GET /api/v1/health/ready` | `200` when Postgres and Redis both answer, `503` otherwise — `{"status":"ok","checks":{"postgres":"up","redis":"up"}}` |
| `GET /api/v1/health` | back-compat alias, always `200` |

You do not need to call these. They are documented so that a status page or uptime monitor targets `/health/ready` rather than a real business endpoint that would need credentials.

---

## 5. Production behaves differently from development

These are infrastructure differences, not API changes. Each one is something that works in dev and can fail in production.

### 5.1 Request timeout: 120 seconds, not one hour

Development nginx allows **one hour** per request. Production allows **120 seconds**.

Any request that currently takes longer than two minutes in dev — a large payroll run, a bulk export — will be cut off in production with a **504**.

Set your client timeout *below* the gateway's so you produce your own error rather than parsing nginx's:

```js
timeout: 110_000
```

If you know of a call that legitimately runs past 120s, tell us now. The answer is almost certainly to make it asynchronous (kick off a job, poll for status) rather than to raise the timeout.

### 5.2 Gateway errors are HTML, not JSON

This is the one most likely to produce a confusing bug report.

When nginx rejects a request itself, the response never reaches the application and the body is an **HTML error page**:

| Status | Cause |
| :--- | :--- |
| `413` | request body over 16 MB |
| `429` | rate limit (§5.3) |
| `502` | the app container is down or restarting |
| `504` | request exceeded 120s |

If your error interceptor does `JSON.parse(response.data)` or reads `response.data.message` unconditionally, it will throw on these and mask the real status. Guard it:

```js
const isJson = (res) => (res?.headers?.['content-type'] || '').includes('application/json')

// in the response interceptor
const message = isJson(error.response)
  ? error.response.data?.message
  : `Request failed (${error.response?.status ?? 'network error'})`
```

Worth adding before launch regardless — a `502` during any deploy will hit this path.

### 5.3 Rate limiting: 20 requests/second per IP

Production applies **20 r/s per client IP, with a burst of 40**. Development has no rate limit at all.

Over the limit returns **`429`** with an HTML body. Normal interactive use will never reach it. What does reach it:

- a dashboard firing 50+ parallel requests on mount
- a `useEffect` without a dependency array, retrying in a loop
- an un-debounced search-as-you-type
- polling every few hundred milliseconds

If you poll, keep it to one request every 5 seconds or slower, and back off on failure. A retry loop that does not back off will trip this and keep itself tripped.

Note that the limit is **per IP**, so users behind one corporate NAT share a budget.

### 5.4 Responses are buffered

Production sets `proxy_buffering on`; development has it off. nginx collects the full response before forwarding it.

Nothing today streams, so nothing breaks. But it means **Server-Sent Events and chunked progress streaming will not work in production**, and the production config has no WebSocket upgrade path. If a feature needs either, raise it before you build it — not after.

### 5.5 Upload size

| Layer | Limit |
| :--- | :--- |
| nginx | 16 MB per request |
| application JSON body | 10 MB |

Large files do not go through the API at all — documents, payslips, avatars and org logos use **presigned S3 URLs**, so the upload goes browser → S3 directly and these limits do not apply. The limits bind on JSON payloads: a very large bulk-import array is the realistic way to hit `413`.

### 5.6 Security headers

Every production response now carries:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
```

Two consequences:

- **The API cannot be embedded in an iframe from another origin.** If anything embeds an API-served page cross-origin, it will stop rendering. Raise it rather than working around it.
- **HSTS makes HTTPS sticky in the browser for a year.** Once a browser has seen `api.hrclouds.in` over HTTPS it will refuse plain HTTP to that host. Never construct an `http://` URL to the API.

Content-Security-Policy is deliberately **not** set, so it will not interfere with your app.

---

## 6. Email links

Links in outbound email (invitation accept, document notification CTA, payslip deep link) now resolve from the backend's `FRONTEND_URL` for that environment.

Previously two of the three always pointed at `https://hrclouds.in` regardless of environment, so **invitations sent from the dev backend linked into production**. That is fixed. Dev-sent email now lands on the dev frontend.

The paths themselves are unchanged — only the host. If you rename or move a route that an email links to (for example `/invitation/accept`), tell us, because the path is composed on the backend.

---

## 7. Pre-launch checklist

- [ ] `VITE_API_BASE_URL` (or equivalent) is set for every environment in your host's dashboard, and nothing in `src/` contains a hostname.
- [ ] The lint rule from §2.3 is active and the build passes with it.
- [ ] You have sent us the exact production origin list (§3).
- [ ] No custom request headers beyond `Content-Type` and `Authorization` (§3).
- [ ] Client timeout is set below 120s (§5.1).
- [ ] The error interceptor survives a non-JSON response body (§5.2).
- [ ] No polling faster than once per 5s; retries back off (§5.3).
- [ ] No feature depends on SSE, WebSockets, or streamed responses (§5.4).
- [ ] No `http://` URL is ever constructed for the API (§5.6).

---

## 8. Questions we need answered

1. Exact production origin(s) — scheme, host, port, no trailing slash.
2. Do preview deployments need to reach the production API? (Default answer: no, point them at dev.)
3. Any request that can legitimately exceed 120 seconds?
4. Any custom request header you rely on today?
5. Anything that reads a response header other than `Content-Disposition`?

Answers to 1 and 2 are blocking — we cannot finalise the production environment file without them.
