# 2026-10-01 — DevOps production-readiness: API and environment changes

**Scope:** infrastructure and deployment hardening from
`public/md_system/devops_production_deployment_plan.md` (Stages 1–5).
**Branch:** `development`
**Frontend impact:** LOW — two new public endpoints, one behavioural change to
CORS configuration, one change to the host of links in outbound email. No
existing request or response shape changed.

---

## 1. New endpoints

Both are **unauthenticated by design** (the container healthcheck, nginx and the
deploy pipeline probe them before any token exists) and are mounted outside the
auth, CORS and rate-limit layers. They deliberately expose nothing beyond status.

### `GET /api/v1/health/live`

Liveness. Answers only *"is the process up?"*. No dependency can turn it red —
restarting a healthy container because the database blinked makes an outage
worse.

* **200** always, while the process is running.

```json
{ "status": "ok", "uptime_s": 132 }
```

### `GET /api/v1/health/ready`

Readiness. Answers *"can it serve traffic?"* by checking Postgres (`SELECT 1`)
and Redis (`PING`). This is what the deploy verifies against.

* **200** when every dependency answers
* **503** when any dependency is down

```json
{ "status": "ok",       "checks": { "postgres": "up",   "redis": "up" } }
{ "status": "degraded", "checks": { "postgres": "down", "redis": "up" } }
```

### `GET /api/v1/health`

Back-compat alias. Always **200**, `{ "status": "ok" }`. Prefer `/health/live`
or `/health/ready` — this one distinguishes nothing.

> **For the frontend:** nothing needs to call these. They are listed so that a
> status page or uptime monitor points at `/health/ready` rather than at a real
> business endpoint that would need credentials.

---

## 2. CORS is now configured from the environment

`CORS_ALLOWED_ORIGINS` (comma-separated) now **overrides**
`configs/default.json` entirely. When it is unset, the previous committed list
still applies, so nothing changes until the variable is set.

**Consequence for the frontend team:** the production allowlist will be narrowed
to the real frontend origin only. The committed list currently includes LAN
addresses (`http://192.168.29.37:5173`, `http://192.168.29.159:5173`), bare EC2
IPs (`http://13.204.143.182:4500`, `http://13.201.135.88:4500`) and several
`localhost` ports. Those keep working in development but **will not be allowed
in production**. If a frontend deployment relies on one of them, say so before
the production env file is finalised.

Adding a new frontend domain is now an environment change, not a code change.

Rejected origins behave exactly as before: the request is served without
`Access-Control-Allow-Origin`, so the browser blocks it. No new status code.

---

## 3. Links in outbound email now honour the environment

The precedence used to be reversed in two of three places: `configs/default.json`
was consulted first and is always truthy, so `FRONTEND_URL` was never reached and
**development emails linked to production**.

All three call sites now go through `getFrontendBaseUrl()`, where the environment
always wins:

| Email | Was | Now |
| :--- | :--- | :--- |
| Document notification CTA | always `https://hrclouds.in` | `FRONTEND_URL` |
| Payslip deep link | always `https://hrclouds.in` | `FRONTEND_URL` |
| Invitation accept link | already `FRONTEND_URL` | unchanged |

Trailing slashes on `FRONTEND_URL` are now stripped consistently, so
`https://x.test/` and `https://x.test` produce identical links. Paths and query
strings are unchanged.

---

## 4. Security headers now sent by the API

`helmet` was a dependency with no usages. It is now applied, so every response
carries `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`
and — in production only — `Strict-Transport-Security`.

* **Content-Security-Policy is deliberately OFF.** The API serves a small static
  page directory and enabling a CSP blind would break it. Tracked as a follow-up.
* `Cross-Origin-Resource-Policy` is set to `cross-origin` so presigned
  download flows (payslips, documents) keep working.

No frontend change expected. If an embedded view breaks, `X-Frame-Options:
SAMEORIGIN` is the likely cause — raise it rather than working around it.

---

## 5. Webhook raw body ordering (billing, not yet live)

`express.raw()` for `/webhooks/razorpay` is now registered **before**
`express.json()`. Previously the global JSON parser ran first and set
`req._body`, which made the raw parser short-circuit — so `req.body` arrived as a
parsed object and HMAC signature verification over the exact signed bytes was
impossible.

No route is mounted at that path yet, so there is no behavioural change today.
This unblocks the billing phase; see
`public/md_organization/phases/phase1_implementation_plan.md` §2 fact 5.

---

## 6. Behaviour changes with no API surface

Listed because they change what you will observe, not what you call.

* **An unhandled promise rejection no longer restarts the process.** It is
  logged and the API keeps serving. Previously one stray rejection anywhere
  across 20 crons took down the whole API, which read as random 502s under load.
* **Graceful shutdown drains first.** On redeploy the server stops accepting,
  lets in-flight requests finish, and only then closes Postgres and Redis —
  bounded by `SHUTDOWN_TIMEOUT_MS` (default 15s). Previously the database closed
  first, so every request in flight failed with a connection error. Expect fewer
  spurious errors during a deploy.
* **Request access logging** is on (`morgan`, `combined` in production) to
  container stdout. Bodies and headers are never logged — payment callbacks,
  invitation tokens and password payloads pass through this middleware.
  Health probes are excluded.

---

## 7. Environment variables

`.env.example` is now committed and is the authoritative contract. New or
renamed keys that matter beyond the backend team:

| Variable | Notes |
| :--- | :--- |
| `DATABASE_URL` | Replaces `PostGre_DATABASE_URL`, which stays as a fallback for one release. The migration runner previously read `DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_HOST` with no port — it could migrate a different database than the app was using. Both now read this one value. |
| `CORS_ALLOWED_ORIGINS` | See §2. |
| `FRONTEND_URL` | See §3. |
| `HOST_PORT` | Published host port. **Production is 4545**, not 4500 — 4500 is already taken on that instance. Development stays 4501. |
| `ENABLE_CRON_JOBS` | Defaults on. Set `false` for an API-only instance. |
| `ENABLE_ATTENDANCE_SIMULATOR` | Now genuinely gates the simulator, and it is additionally blocked whenever `NODE_ENV=production`. |
| `ATTENDANCE_SIMULATOR_BASE_URL` | Required when the simulator is on; it has no default and refuses to start without one. |
| `SHUTDOWN_TIMEOUT_MS` | Drain budget, default 15000. |

---

## 8. Deployment mechanics that affect API availability

* **Migrations and seeders now run automatically on every deploy.** Seeders are
  recorded in `SequelizeData`, so each one runs exactly once however often the
  pipeline runs. Migration `00064` pre-marks the six seeders that already ran on
  the live databases and are not re-runnable.
* **The container restarts after migrating**, so expect a brief drain-and-restart
  window on each deploy rather than a hard cut.
* **Production deploys take a `pg_dump` before migrating** and verify
  `/health/ready` afterwards; a failed verification triggers a restart of the
  previous container. That cannot undo a migration — see the plan's §5.5.
