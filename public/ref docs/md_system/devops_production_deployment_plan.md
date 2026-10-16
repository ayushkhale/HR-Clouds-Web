# HRMS DevOps & Production Deployment Master Plan

**Document Version:** 3.0.0 - IMPLEMENTED (code landed 2026-10-01; see section 0)
**Target Architecture:** Two-environment CI/CD (`development` branch → Dev server, `production` branch → Production server)
**Standard Compliance:** 12-Factor App (config in environment, immutable build artifact, stateless processes)

> **What changed in v3.0.0.** The plan was implemented. Section 0 records the decisions taken, what was verified and how, the four places the implementation deviated from the analysis below and why, five findings that only surfaced during implementation, and the work that still needs a database, a Docker host or GitHub settings. Everything from section 1 onwards is the original analysis, kept as written.

> **What changed in v2.0.0.** v1.0.0 listed 12 issues. All 12 were re-verified against the tree: **9 are accurate, 3 need correction**, and **11 additional blockers were found** — one of which (§3.13) means the CI quality gate in v1.0.0 would have failed on *every* push. Two explicit user requirements are now folded in: the attendance simulator stays runnable in dev, and dev/prod get **separate workflow files**. Original analysis that survived review is kept verbatim; corrections are marked **[CORRECTED v2]** and new findings **[NEW v2]**.

---

## 0. Implementation status — 2026-10-01

Stages 1–5 of §8 are **implemented on `development`**. This section is the record of what was decided and what actually shipped; the analysis below is unchanged except where a decision overrode it, and those points are marked **[DECIDED 2026-10-01]**.

### 0.1 Decisions taken by the user

| Question | Decision | Effect on this plan |
| :--- | :--- | :--- |
| §3.9 migration policy — Option A or B | **Neither: fully automatic.** Migrations *and* seeders run unattended on every deploy, in both environments. | §3.9 is superseded. A new mechanism was required to make the seeder half safe — see §0.3. |
| Production host port | **4545**, mapped `4545:4500`. Port 4500 is already held by another process on that EC2 instance. | `HOST_PORT` defaults to 4545; §6 nginx proxies 4545. Development is unchanged at 4501. |
| Redis | **Same URL in both environments** (`redis://hrms-redis:6379`, the compose service address). | Each environment still gets its own container, network and volume via `COMPOSE_PROJECT_NAME`, so the identical string resolves to a different Redis. No shared state. |
| Attendance simulator | **Retained in development.** | §3.2 as written: flag-gated, env-addressed, hard-blocked when `NODE_ENV=production`. See §0.4 for the one deviation. |
| Workflow files | **Separate per environment.** | §5.4 and §5.5 as written. |

### 0.2 Verification performed

* `npm test` → **2525 passing / 0 failing** (baseline was 2490; 35 tests added under `tests/unit/system/`).
* **The §3.13 blocker is fixed, and proven fixed.** Re-running the suite with `dotenv` stubbed to a no-op — an exact simulation of a runner with no `.env` on disk — supplying only the placeholder variables from the workflow's `test` job: **exit 0, 2525/2525**. Before the fix the same command produced 280 `ERR_INVALID_ARG_TYPE` failures and aborted with no summary.
* `src/app.js` was booted for real with `NODE_ENV=production`: `/api/v1/health/live` and `/api/v1/health` both returned 200, `Strict-Transport-Security` and `X-Content-Type-Options` were present, and health probes were absent from the access log.
* The missing-configuration path was exercised: both `connection.pgsqldb.js` and `migration.config.js` now fail with a named error instead of an opaque driver `TypeError`.
* **Not verified, and cannot be from here:** anything requiring the remote database or a Docker daemon — migration `00064` execution, `docker build`, `docker compose up`, `nginx -t`, and a live pipeline run. Those are listed in §0.6.

### 0.3 [DECIDED 2026-10-01] Automatic seeding, and why it needed a migration

`db:seed:all` is now a pipeline step. By default `seederStorage` is `'none'`, meaning sequelize-cli keeps **no record of seeders** and re-runs all twelve on every invocation. Six of the twelve are not re-runnable — they use a bare `bulkInsert` with no conflict clause:

```
002-seed-subscription-plans    004-seed-features          005-seed-plan-features
006-seed-attendance-features   007-seed-leave-feature     008-seed-document-feature
```

An automated re-run would duplicate rows or trip a unique constraint. Two changes make it safe:

1. **`migration.config.js` sets `seederStorage: 'sequelize'`** with table `SequelizeData`, so each seeder is recorded and runs exactly once — the requested "1 seeder runs 1 time no matter how many times we try".
2. **Migration `00064-create-seeder-meta-table.js`** creates that table and pre-marks the six unsafe seeders as already executed — **but only where the database proves they ran**, probed by the sentinel row each one creates (`subscription_plans.code = 'free'`, `features.key = 'employee.access'`, and so on). On the existing dev and production databases all six match and are skipped. On a brand-new database nothing matches, nothing is recorded, and all twelve seed normally.

The other six seeders (001, 003, 009, 010, 011, 012) are written as `INSERT … ON CONFLICT DO NOTHING` and are deliberately **left unrecorded**: a harmless re-run self-heals a missing row, which is worth more than skipping the work. Seeders 010–012 have never run and will apply on the first deploy.

`tests/unit/system/deployment_config.test.js` fails the build if a future seeder uses `bulkInsert` without a conflict clause and is not listed in `00064`. That is the invariant most likely to be broken by someone who has not read this section.

> **Migration `00064` is handed back UNRUN**, per the standing rule that the operator runs migrations. It must be applied **before** the first deploy that includes the `db:seed` step, or that deploy re-runs the six unsafe seeders.

### 0.4 Deviations from the plan as written

| § | Plan said | What shipped | Why |
| :--- | :--- | :--- | :--- |
| 3.3 | Default `DB_REJECT_UNAUTHORIZED` to `false` | Defaults to **`true`**, matching `config.database.ssl` | The app has always run with chain verification on and the provider's certificate satisfies it. Defaulting to `false` would silently weaken TLS for no reason. The migration runner is raised to match the app rather than the app lowered to match it; `DB_REJECT_UNAUTHORIZED=false` stays available. |
| 3.8 | Exclude `src/code_dump` from the image | **Not excluded**; only `src/code_dump/code/users.json` is | Excluding the directory is incompatible with keeping the simulator runnable inside the dev container. The code is inert in production (double-gated in `src/server.js`) and the credential file — the part that actually mattered — is out of both git and the image. Marked as a temporary exception in `.dockerignore`, with the removal trigger written next to it. |
| 3.21 | PM2 log rotation via an `app-logs` volume | PM2 writes to `/dev/stdout` and `/dev/stderr`; **no log volume** | Makes `docker logs` authoritative and lets Docker's json-file driver rotate (already capped at 10 MB × 3). Simpler, and removes a volume that would need its own rotation policy. |
| 5.4 / 5.5 | `npx sequelize-cli db:migrate` | `npm run db:migrate` | Same binary, resolved from `node_modules/.bin` rather than risking an `npx` download inside a non-root container. |

### 0.5 New findings from implementation

* **`ecosystem.config.js` was forcing `NODE_ENV=production` in every environment.** PM2 merges `env_production` on top of the inherited environment and the Dockerfile passed `--env production`, so PM2's value won over the compose `NODE_ENV=development`. **The development container has been running in production mode.** Both the `env`/`env_production` blocks and the `--env` flag are removed; `.env` is now the only place the mode is decided.
* **`PAYROLL_ENCRYPTION_KEY` is boot-fatal** (`bank_encryption.utils.js:19`, requires 64 hex characters) and was missing from §7's matrix. It is in `.env.example` now. The unit suite never loads `payroll.index.js`, which is why CI passes without it — but a container will not start without it.
* **`morgan`'s health-probe exclusion cannot use `req.path`.** Express rewrites `req.url` while inside a mounted router, so at response-finish time `req.path` is `/health/live` and a `/api/v1/health` prefix test never matches. Found by booting the app and watching every probe get logged. It reads `req.originalUrl` now, with a regression test.
* **`DUMMY_HASH` is read by no code** anywhere in `src/`, despite being set in both env files. Flagged in `.env.example`, not removed.
* **The env file must now be written *after* the rsync, not before.** The old `deploy-dev.yml` wrote it first, which was safe only because its rsync had no `--delete`. Both new workflows use `--delete` to keep the server tree identical to the repo, so the old ordering would have deleted `.env` on every deploy. The write step is therefore sequenced after the sync, and `simulator/` is excluded from `--delete` for the same reason. *(Corrected 2026-10-01: an earlier revision of this section claimed the old workflow never wrote the env file at all — it did; the `> $APP_DIR/.env` redirect was present.)*

### 0.6 Remaining work — needs a database, a Docker host, or GitHub settings

- [ ] **Rotate every credential in `src/code_dump/code/users.json`, then `git rm --cached` it.** It is still tracked. `.gitignore` now covers it, but that does not untrack an already-tracked file, and rotation has to come first regardless (§3.18).
- [ ] Run migration `00064` — and reconcile the rest of the unrun backlog — **before** the first deploy that seeds.
- [ ] Create the `development` and `production` GitHub Environments with the four same-named secrets, and generate a **separate** SSH keypair per server (§5.2).
- [ ] Place the simulator's `users.json` at `<app dir>/simulator/users.json` on the dev host. The rsync excludes that directory so it survives `--delete`, and compose mounts it read-only at `/application/simulator`.
- [x] ~~Install `postgresql-client` on the production host~~ — **no longer needed.** The backup step runs `pg_dump` from the pinned `PG_DUMP_IMAGE` container (`postgres:18-alpine`). The host client was 16 against a server on 18, which aborts with "server version mismatch".
- [ ] `docker build`, then confirm `public/pages` and `configs` are present in the image while `.env*` and `tests` are not.
- [ ] Install `nginx/production.hrclouds.backend.nginx.config`, run `nginx -t`, then `certbot --nginx -d api.hrclouds.in`.
- [ ] Confirm the firewall exposes only 80/443 — **4501 and 4545 must not be reachable from the internet**.
- [ ] First production deploy via `workflow_dispatch`, not via a merge.

### 0.7 Files changed

| File | Change |
| :--- | :--- |
| `src/common/utilities/app_url.utils.js` | NEW — §3.1 |
| `src/common/routes/health.routes.js` | NEW — §3.14 |
| `src/app.js` | helmet, morgan, env-driven CORS + production assertion, parser reorder, health mount, `DOTENV_CONFIG_PATH` |
| `src/server.js` | simulator gate, `ENABLE_CRON_JOBS`, graceful-shutdown rewrite, `DOTENV_CONFIG_PATH` |
| `src/infrastructure/postgres-sql/connection.pgsqldb.js` | `DATABASE_URL`, explicit throw, `DB_SSL` / `DB_REJECT_UNAUTHORIZED` |
| `src/infrastructure/postgres-sql/migration.config.js` | same URL as the app; `seederStorage` |
| `src/infrastructure/postgres-sql/migrations/00064-create-seeder-meta-table.js` | NEW — §0.3, **handed back unrun** |
| `src/infrastructure/aws-ses/aws-ses.config.js` | conditional credentials — §3.4 |
| `src/code_dump/code/attendanceCron.js` | env-addressed target and users file |
| `src/modules/{document,payroll,organization}/services/…` | three call sites moved onto `getFrontendBaseUrl()` |
| `package.json`, `package-lock.json` | scripts, `sequelize-cli` dependency, `engines` |
| `docker-compose.yml`, `Dockerfile`, `ecosystem.config.js`, `.dockerignore`, `.gitignore` | §3.7, §3.8, §3.21, §0.5 |
| `.env.example` | NEW — §3.19 |
| `.github/workflows/deploy-development.yml`, `deploy-production.yml` | NEW; `deploy-dev.yml` deleted |
| `nginx/production.hrclouds.backend.nginx.config` | NEW; health locations added to the dev backend config |
| `tests/unit/system/{app_url.utils,health_routes,deployment_config}.test.js` | NEW — 35 tests |
| `public/md_updates/2026-10-01_devops_production_readiness_api_changes.md` | frontend-facing change record |

---

## 1. Objective

### 1.1 Target flow

* **`development` branch** — push → test gate → build → deploy to the **Development server** (`development.hrclouds.in`).
* **`production` branch** — merge from `development` → test gate → build → **manual approval** → deploy to the **Production server** (`api.hrclouds.in`).
* **Zero future code changes for environment transitions.** After this plan lands, moving between environments — or adding a third — must be achievable by changing environment variables and GitHub secrets only. No source edit, no config-file commit, no rebuild of intent.

### 1.2 What "zero future code changes" actually requires

It is not enough to remove hardcoded strings. Three properties must hold, and each drives a work item below:

1. **Every environment-varying value is read from `process.env` with a safe default**, and every one of them is listed in a committed `.env.example` (§3.16). If it isn't in that file, the next environment will break on it.
2. **The build artifact is identical across environments.** Today the server builds from rsynced source, so dev and prod run different images built at different times from different trees. §5.3 replaces this with a tagged image.
3. **The app boots and fails loudly on missing config**, rather than half-starting. Several modules already throw at require-time (`razorpay.config.js`, `pdf-renderer.config.js`); that is correct behaviour and the env matrix (§7) must be exhaustive enough to make it a non-event.

---

## 2. Audit Summary

23 items. Severity reflects impact on a production rollout.

### 2.1 v1.0.0 findings — re-verified

| # | Category | File(s) | Severity | Status |
| :- | :--- | :--- | :--- | :--- |
| 1 | App logic | `payslip_dispatch.service.js:98`, `document_notification.service.js:96` | HIGH | **Confirmed** — plus a third call site already correct; see §3.1 |
| 2 | Background jobs | `src/server.js:46` | CRITICAL | **Confirmed, fix rescoped** — user wants it retained in dev; see §3.2 |
| 3 | DB driver | `connection.pgsqldb.js` | MEDIUM | **Confirmed, understated** — the real defect is dual config; see §3.3 |
| 4 | Cloud services | `aws-ses.config.js` | HIGH | **Confirmed** |
| 5 | CORS | `src/app.js:17`, `configs/default.json` | MEDIUM | **Confirmed** |
| 6 | Config loader | `src/server.js:3`, `src/app.js:2` | MEDIUM | **Confirmed, lowered to LOW** — see §3.6 |
| 7 | Containerization | `docker-compose.yml` | CRITICAL | **Confirmed, incomplete** — see §3.7 |
| 8 | Container security | `.dockerignore` | HIGH | **Confirmed, incomplete** — see §3.8 |
| 9 | CI/CD migrations | `.github/workflows/deploy-dev.yml` | CRITICAL | **Confirmed, but the proposed fix cannot work** — see §3.9 |
| 10 | Reverse proxy | `nginx/` | HIGH | **Confirmed** — `production.hrclouds.backend.nginx.config` is absent |
| 11 | Build scripts | `package.json` | LOW | **Confirmed** |
| 12 | Concurrency | `src/server.js`, `ecosystem.config.js` | MEDIUM | **Confirmed, reframed** — see §3.12 |

### 2.2 New findings [NEW v2]

| # | Category | File(s) | Severity | Issue |
| :- | :--- | :--- | :--- | :--- |
| **13** | CI/CD | `connection.pgsqldb.js:16` | **BLOCKER** | **The test suite cannot run on a clean CI runner.** `new Sequelize(undefined)` throws at module load when no `.env` exists. Proven: 280 module-load failures, process exit 1. The v1 quality gate would abort every deployment. |
| **14** | Observability | `src/app.js` | **CRITICAL** | **No health endpoint exists.** v1's nginx config and CI diagram both proxy/probe `/api/v1/health`, which returns 404. Nothing can verify a deploy, gate a container, or drive a load balancer. |
| **15** | Security | `src/app.js` | HIGH | **`helmet` is installed and never used.** No HSTS, no `X-Content-Type-Options`, no `X-Frame-Options` at the app layer. |
| **16** | Observability | `src/app.js` | MEDIUM | **`morgan` is installed and never used.** No HTTP access log from the application; only nginx has one. |
| **17** | Correctness | `src/app.js:33-35` | HIGH | **`express.json()` is registered *before* `express.raw()` for `/webhooks/razorpay`**, so the webhook route can never receive a raw body — Razorpay signature verification is impossible as wired. |
| **18** | Secrets | `src/code_dump/code/users.json` | **CRITICAL** | **Plaintext login credentials for ~6 real accounts are committed to git** and copied into every Docker image. |
| **19** | Config contract | repo root | HIGH | **No `.env.example`.** There is no committed, reviewable list of required variables — the single artifact "no future code changes" depends on. 10 variables the code reads are already absent from `.env.production`. |
| **20** | Resilience | `src/server.js:81-106` | MEDIUM | **Graceful shutdown is inverted and unbounded** — DB/Redis close *before* the HTTP server stops accepting, with no timeout. `unhandledRejection` tears down the whole process. |
| **21** | Ops | `docker-compose.yml`, `Dockerfile` | MEDIUM | **No container healthcheck, no log volume, no resource limits.** PM2 writes to `./logs` inside the container; every rebuild discards them. |
| **22** | CI/CD | `.github/workflows/deploy-dev.yml` | HIGH | **No deploy verification, no rollback, no concurrency guard, shared credentials for both environments.** |
| **23** | Build | deployment model | HIGH | **No immutable artifact.** Building from rsynced source on each server means dev and prod run different images and there is nothing to roll back *to*. |

---

## 3. Detailed Findings & Fixes

---

### 3.1 Frontend URL precedence in emails and notifications

* **Severity:** HIGH · **Status:** confirmed, fix upgraded
* **Locations:**
  * `src/modules/document/services/document_notification.service.js:96`
  * `src/modules/payroll/services/payslip_dispatch.service.js:98`
  * `src/modules/organization/services/invitation.service.js:352` — **already correct**

```javascript
// document_notification.service.js:96   — config wins, env never reached, no trailing-slash strip
const base = (config.urls && config.urls.frontendBaseUrl) || process.env.FRONTEND_URL || 'https://hrclouds.in'

// payslip_dispatch.service.js:98        — config wins, env never reached
const base = (config.urls?.frontendBaseUrl || process.env.FRONTEND_URL || 'https://hrclouds.in').replace(/\/$/, '')

// invitation.service.js:352             — correct precedence already
const frontendBase = (process.env.FRONTEND_URL || 'https://hrclouds.in').replace(/\/$/, '')
```

`configs/default.json` sets `urls.frontendBaseUrl` to `"https://hrclouds.in"`, which is truthy, so two of the three call sites can never reach `FRONTEND_URL`. Dev payslip and document emails link to production.

**[CORRECTED v2] — don't patch three expressions, extract one helper.** Three call sites already disagree on precedence and on trailing-slash handling; a fourth will be added by the billing module's notification service. Patching each in place leaves the same trap for the next author, which contradicts the goal of this document.

```javascript
// src/common/utilities/app_url.utils.js  [NEW FILE]
'use strict'
const config = require('../../../configs/default.json')

// Environment always wins. configs/default.json is the last-resort default for
// local runs, never an override. Returns with any trailing slash removed.
function getFrontendBaseUrl () {
  const raw = process.env.FRONTEND_URL || config.urls?.frontendBaseUrl || 'https://hrclouds.in'
  return String(raw).trim().replace(/\/+$/, '')
}

function buildFrontendUrl (pathname) {
  const p = String(pathname || '')
  return `${getFrontendBaseUrl()}${p.startsWith('/') ? p : `/${p}`}`
}

module.exports = { getFrontendBaseUrl, buildFrontendUrl }
```

Replace all three call sites with `getFrontendBaseUrl()`. **Test:** `app_url.utils.test.js` — env wins over config; trailing slashes stripped; falls back when env is unset.

---

### 3.2 Attendance simulator in production

* **Severity:** CRITICAL · **Status:** confirmed; **fix rescoped to the user's requirement that the simulator keep working in dev**

`src/server.js:46-50` currently reads:

```javascript
require('./code_dump/code/attendanceCron') // this is a development server so do not remove it

if (process.env.ENABLE_ATTENDANCE_SIMULATOR === 'true') {

}
```

The guard was started and left **empty** — the require above it is unconditional. On a production container (Linux, so inside the `os.platform() === 'linux'` block) this module loads and starts simulating clock-ins.

Three separate problems, all of which must be fixed for the simulator to be safely *kept*:

1. **Unconditional load.** Fix: move the require inside the existing flag check.
2. **Hardcoded target.** `attendanceCron.js:12` is `const API_BASE_URL = 'https://development.hrclouds.in/api/v1'`. Even in dev this is a hardcoding, and it means a simulator accidentally enabled anywhere on earth writes to the dev tenant. Fix: read from env, and **refuse to start without it**.
3. **Committed credentials.** See §3.18 — this is the file that reads `users.json`.

```javascript
// src/server.js — replace lines 46-50
// Development-only attendance simulator. Off unless explicitly enabled, and never
// in production regardless of the flag. Retained deliberately for dev data seeding.
if (process.env.ENABLE_ATTENDANCE_SIMULATOR === 'true' && process.env.NODE_ENV !== 'production') {
  require('./code_dump/code/attendanceCron')
}
```

```javascript
// src/code_dump/code/attendanceCron.js — replace line 12
const API_BASE_URL = process.env.ATTENDANCE_SIMULATOR_BASE_URL
if (!API_BASE_URL) {
  throw new Error('[Simulator] ATTENDANCE_SIMULATOR_BASE_URL is required when ENABLE_ATTENDANCE_SIMULATOR=true')
}
const USERS_FILE_PATH = process.env.ATTENDANCE_SIMULATOR_USERS_FILE
  || path.join(__dirname, 'users.json')
```

**Belt and braces:** the production `.env` sets `ENABLE_ATTENDANCE_SIMULATOR=false` **and** `NODE_ENV=production`. Either alone is sufficient; both are cheap. When you are finished with the simulator, delete `src/code_dump/code/` entirely — until then it is excluded from the image by §3.8.

---

### 3.3 Database configuration — two incompatible mechanisms

* **Severity:** **HIGH** (v1 said MEDIUM) · **Status:** **[CORRECTED v2] — the real defect is larger than v1 described**

v1 correctly flagged the `PostGre_DATABASE_URL` naming and the SSL setting. It missed that **the application and the migration runner read completely different variables for the same database**:

| | Runtime app (`connection.pgsqldb.js:6`) | Migration runner (`migration.config.js`) |
| :--- | :--- | :--- |
| Connection | `process.env.PostGre_DATABASE_URL` | `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST` |
| Port | from the URL | **absent** — silently defaults to 5432 |
| `rejectUnauthorized` | `config.database.ssl` → **`true`** | `false` |

So `npm run db:migrate` and the running application can point at **different databases** with no error anywhere. With CI about to run migrations automatically (§3.9), that is a data-loss-shaped risk, not a tidiness issue. It also explains why the app's stricter `rejectUnauthorized: true` has not yet caused visible failures — the migration path never exercised it.

Fix — one variable, one SSL policy, for both files:

```javascript
// src/infrastructure/postgres-sql/connection.pgsqldb.js
const DATABASE_URL = process.env.DATABASE_URL || process.env.PostGre_DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('[Postgres] DATABASE_URL (or legacy PostGre_DATABASE_URL) is required')
}

// Managed Postgres (Neon, RDS, Railway) terminates TLS with an intermediate root the
// container does not carry. Default to not verifying the chain; set DB_REJECT_UNAUTHORIZED=true
// once a CA bundle is mounted.
const rejectUnauthorized = process.env.DB_REJECT_UNAUTHORIZED === 'true'
const sslEnabled = process.env.DB_SSL ? process.env.DB_SSL === 'true' : config.database.ssl

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: sslEnabled ? { ssl: { require: true, rejectUnauthorized } } : {},
  define: { schema: 'public' },
  pool: { /* unchanged */ }
})
```

```javascript
// src/infrastructure/postgres-sql/migration.config.js — same source of truth as the app
require('dotenv').config()

const url = process.env.DATABASE_URL || process.env.PostGre_DATABASE_URL
const common = {
  url,
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED === 'true' }
  }
}
module.exports = { development: common, production: common, test: common }
```

**Keep `PostGre_DATABASE_URL` as a fallback for one release** so the current dev server keeps working before its env is updated, then drop it.
**Note the explicit `throw`:** it converts §3.13's silent `new Sequelize(undefined)` crash into a readable boot error.

---

### 3.4 AWS SES credentials vs IAM roles

* **Severity:** HIGH · **Status:** confirmed exactly as written in v1

```javascript
// src/infrastructure/aws-ses/aws-ses.config.js — current
const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
})
```

On EC2/ECS with an instance role and no static keys, this passes `{accessKeyId: undefined, secretAccessKey: undefined}` and the SDK throws `CredentialsProviderError` instead of falling through to the provider chain. `src/infrastructure/aws-s3/aws-s3.config.js:38` already solves this correctly — copy its shape verbatim:

```javascript
const credentials = (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
  : undefined

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  ...(credentials ? { credentials } : {})
})
```

---

### 3.5 CORS origins from environment

* **Severity:** MEDIUM · **Status:** confirmed

`configs/default.json` currently whitelists 15 origins including `http://192.168.29.37:5173`, `http://192.168.29.159:5173`, `http://13.204.143.182:4500`, `http://13.201.135.88:4500` and several `localhost` ports. Shipping developer LAN addresses and bare IPs to production is both a (minor) attack surface and a guarantee that the next frontend domain requires a code commit.

```javascript
// src/app.js
const envOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
  : null
const allowedOrigins = envOrigins || config.cors.allowedOrigins
```

Keep the rest of the `cors()` block as-is — `credentials: true`, the explicit method list, and `exposedHeaders: ['Content-Disposition']` (load-bearing for payslip/document downloads) all stay.

**[NEW v2] Add a boot-time assertion.** `credentials: true` combined with a wildcard or a `localhost` entry in production is the classic CORS mistake:

```javascript
if (process.env.NODE_ENV === 'production') {
  const bad = allowedOrigins.filter(o => o === '*' || /localhost|127\.0\.0\.1|192\.168\.|^http:\/\//i.test(o))
  if (bad.length) console.error(`[CORS] Non-production origins allowed in production: ${bad.join(', ')}`)
}
```

---

### 3.6 `.env` loading

* **Severity:** **LOW** (v1 said MEDIUM) · **Status:** **[CORRECTED v2] — v1's proposed fix makes this worse**

v1 proposed choosing the dotenv path from `NODE_ENV`:

```javascript
const envPath = process.env.DOTENV_CONFIG_PATH || (process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env')
```

**Do not do this.** In the target architecture the CI pipeline writes the environment file to `$APP_DIR/.env` on the server and `docker-compose` injects it via `env_file:`; **inside the container there is no `.env` file at all** (it is excluded by `.dockerignore`, correctly). Adding a `NODE_ENV`-dependent path means production looks for a file that does not and must not exist, and it introduces a second place where "which env am I" is decided — exactly the coupling this document is trying to remove.

The current behaviour is already right for containers: `dotenv` finds nothing, silently does nothing, and the real values come from the container environment. The only genuine improvement is supporting the standard override for local multi-env testing:

```javascript
// src/server.js and src/app.js — identical in both
require('dotenv').config({
  debug: false,
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env')
})
```

Note `src/app.js:2` and `src/server.js:3` both call `dotenv.config()`, as do `connection.pgsqldb.js:1`, `connection.redis.js:1` and `migration.config.js:1`. That is harmless (dotenv does not overwrite existing `process.env` keys) and not worth churning.

---

### 3.7 `docker-compose.yml`

* **Severity:** CRITICAL · **Status:** confirmed; **[CORRECTED v2] v1's replacement is necessary but not sufficient**

v1 correctly identified that `environment: - NODE_ENV=development` **overrides** `env_file`, forcing development mode in production, and that `container_name: hrms-server` / port `4501:4500` collide if both environments share a host. Its parameterised version is right as far as it goes. Missing: an app healthcheck (§3.14 depends on it), log persistence, resource limits, and a project name.

```yaml
# docker-compose.yml  [REPLACE]
name: ${COMPOSE_PROJECT_NAME:-hrms}

services:
  hrms-app:
    build:
      context: .
      dockerfile: Dockerfile
    image: ${IMAGE_NAME:-hrms-backend}:${IMAGE_TAG:-local}
    container_name: ${CONTAINER_NAME:-hrms-server}
    restart: unless-stopped
    ports:
      - "${HOST_PORT:-4501}:4500"
    env_file:
      - .env
    environment:
      # Only values that must be derived from the compose topology belong here.
      # NODE_ENV is NOT set: it comes from .env, so one file decides the mode.
      - REDIS_URL=redis://hrms-redis:6379
      - TZ=${TZ:-Asia/Kolkata}
    depends_on:
      hrms-redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:4500/api/v1/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s
    volumes:
      - app-logs:/application/logs
    networks:
      - hrms-network
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          memory: ${APP_MEMORY_LIMIT:-1g}

  hrms-redis:
    image: redis:7-alpine
    container_name: ${REDIS_CONTAINER_NAME:-hrms-redis}
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory ${REDIS_MAXMEMORY:-256mb} --maxmemory-policy allkeys-lru --loglevel warning
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s
    networks:
      - hrms-network

volumes:
  redis-data:
    driver: local
  app-logs:
    driver: local

networks:
  hrms-network:
    driver: bridge
```

Two points worth stating explicitly:

* **`NODE_ENV` is deliberately absent from `environment:`.** v1 kept it as `${NODE_ENV:-production}`, which re-introduces the same class of bug in a subtler form: compose would read `NODE_ENV` from the *shell*, not from `.env`, so a stray shell export on the server silently changes app mode. Letting it come only from `.env` means one file decides.
* **Redis is not port-mapped** and has no password. That is acceptable *only* because it stays on the internal bridge network. Do not add a `ports:` entry for it. With distinct `COMPOSE_PROJECT_NAME` values, dev and prod get separate networks and separate `redis-data` volumes on a shared host.

---

### 3.8 `.dockerignore`

* **Severity:** HIGH · **Status:** confirmed; **[CORRECTED v2] two additional defects**

v1 caught that only `.env` is ignored while `.env.production` is not, so `COPY . .` bakes production secrets into an image layer. Two more:

1. **The comment syntax is invalid.** The file uses `// # Tests, mocks …`. `.dockerignore` only recognises `#`. Those lines are currently parsed as *patterns* (matching nothing) — harmless today, but every "commented" section is silently non-functional to a reader who trusts it.
2. **`src/code_dump/` is not excluded**, so the simulator and `users.json` (§3.18) ship inside the production image. Nor are `analysis/`, `handoffs/`, `scripts/`, `public/HRMS/`.

```dockerignore
# [REPLACE] --- Dependencies & VCS
node_modules
.git
.gitignore
.github

# --- Secrets: every variant, no exceptions
.env
.env.*
!.env.example

# --- Tests & fixtures
tests

# --- Documentation, AI agents, reviews, scratch analysis
README.md
CLAUDE.md
AI_DEVELOPER_INSTRUCTIONS.md
review
analysis
handoffs
.agents
.claude
public/md_*
public/HRMS

# --- Dev-only tooling that must never reach a production image
src/code_dump
scripts

# --- Docker & orchestration
Dockerfile*
docker-compose*.yml
.dockerignore
nginx

# --- Logs & coverage
logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
coverage
.nyc_output

# --- Editor & OS
.vscode
.idea
.DS_Store
Thumbs.db
```

> **Check before applying:** `public/pages/` **must stay** — `src/app.js:40` serves it with `express.static`. `configs/default.json` **must stay** — it is required by `app.js`, `server.js` and both connection modules. Neither is excluded above; verify with `docker build` then `docker run --rm <img> ls public/pages configs`.
>
> **Excluding `src/code_dump` is incompatible with running the simulator inside the container.** Since you want to keep the simulator for now, run it on the dev host *outside* the container (`node src/code_dump/code/attendanceCron.js` from the rsynced source, which is not subject to `.dockerignore`), or temporarily drop that one line from the dev image only. Do not ship it to production either way.

---

### 3.9 Database migrations in the pipeline

* **Severity:** CRITICAL · **Status:** confirmed; **[CORRECTED v2] the proposed fix cannot work, and the policy needs a decision first**

v1 proposed:

```bash
sudo docker compose exec -T hrms-app npx sequelize-cli db:migrate
```

This fails for four independent reasons:

1. **`sequelize-cli` is not a dependency.** It appears nowhere in `package.json` and is not in `node_modules/.bin`.
2. **Even as a devDependency it would be absent** — the Dockerfile runs `npm ci --omit=dev`.
3. **`npx` would try to download it at runtime**, inside a container running as the non-root `hrms_user` with no writable npm cache.
4. **`migration.config.js` reads different variables than the app** (§3.3), so even a successful run could migrate the wrong database.

Fix 1–3 by adding the CLI as a real dependency (justified: it is the only supported runner for the 64 migration files already in the tree) and giving it a script:

```jsonc
// package.json
"dependencies": {
  "sequelize-cli": "^6.6.2"   // runtime dep on purpose: migrations run inside the deployed image
}
```

```bash
docker compose exec -T hrms-app npx sequelize-cli db:migrate
```

**[NEW v2] — the policy question that must be answered before automating this.**

There is a standing project rule that **migrations are run by the operator, not by tooling**, and there is a real backlog: 64 migration files exist and at least a dozen (00047, 00048, 00050–00053, 00055, 00056, 00060–00063) were handed back unrun, plus seeders 010–012. `00051`'s `down()` destroys evidence tables.

**Turning on auto-migrate would apply that entire backlog in one unattended step on the first deploy.** That is the single riskiest line in this plan.

Choose one, explicitly:

* **Option A — Gated auto-migrate (recommended).** The workflow runs `db:migrate:status` and prints the pending list, then applies migrations **only when the deploy is manually approved** (production is behind a GitHub Environment with a required reviewer — §5.2). Dev auto-migrates freely.
* **Option B — Manual, verified.** The workflow runs `db:migrate:status` and **fails the deploy if anything is pending**, forcing you to migrate by hand first. Safest, slowest, and keeps the current rule intact.

Whichever you choose, **before the first production deploy the backlog must be reconciled by hand**, and `pg_dump` must run immediately before any migration step:

```bash
# on the server, before migrating
pg_dump "$DATABASE_URL" --format=custom --file="/var/backups/hrms-$(date +%F-%H%M).dump"
```

---

### 3.10 Production nginx configuration

* **Severity:** HIGH · **Status:** confirmed — `nginx/` holds dev backend, dev frontend and prod frontend, but no **prod backend** config. See §6 for the corrected file.

---

### 3.11 NPM scripts

* **Severity:** LOW · **Status:** confirmed; extended in §4.

---

### 3.12 Cron concurrency

* **Severity:** MEDIUM · **Status:** confirmed; **[CORRECTED v2] reframed — the stated risk is not the live one**

v1 warned about duplicate cron runs under horizontal scaling. Today that cannot happen: `ecosystem.config.js` sets `instances: 1, exec_mode: 'fork'`, and all 20 jobs in `src/cron-jobs/` are registered once, Linux-only, each pinned to `timezone: 'Asia/Kolkata'`. Most also use per-row atomic claims. **So the scaling risk is real but latent.**

The live risk is different and immediate: **if the dev and production containers are ever pointed at the same database, all 20 crons run twice** — two auto-clock-outs, two payslip dispatches, two document sweepers. Given that dev and prod may share a host (§3.7), this is a configuration mistake away.

Mitigations, in order of value:

1. **Guarantee separate databases per environment.** This is a `.env` discipline, enforced by the deploy checklist (§8), and it is the actual fix.
2. **Add a run-guard to the cron registration** so an operator can disable all scheduled work on one instance without a code change:
   ```javascript
   // src/server.js
   const cronsEnabled = process.env.ENABLE_CRON_JOBS !== 'false'   // default ON, opt-out
   if (os.platform() === 'linux' && cronsEnabled) { /* ...20 requires... */ }
   ```
   This also makes it possible to scale the API horizontally later by running exactly one instance with `ENABLE_CRON_JOBS=true`.
3. **Defer distributed locks.** `pg_try_advisory_lock` per job is the right answer *when* you scale past one instance; adding it now is unjustified complexity. Record the trigger: **the first time `instances` exceeds 1, advisory locks become mandatory.**

---

### 3.13 [NEW v2] — The CI test gate fails on a clean runner · **BLOCKER**

This is the finding that would have stopped the v1 pipeline on its first run, and it was verified by execution rather than by reading.

**Root cause.** `src/infrastructure/postgres-sql/connection.pgsqldb.js:16` constructs `new Sequelize(DATABASE_URL, …)` at **module load**. On a GitHub runner there is no `.env` (it is gitignored), so `DATABASE_URL` is `undefined` and Sequelize throws `TypeError [ERR_INVALID_ARG_TYPE]: The "url" argument must be of type string`. Every test file that transitively requires a model, repository or service fails at import.

**Evidence.** Running the suite with `dotenv` stubbed to a no-op (an exact simulation of "no `.env` on disk"):

```
280 × TypeError [ERR_INVALID_ARG_TYPE]  at new Sequelize (connection.pgsqldb.js:16)
process exit code: 1        # no summary emitted — the run aborts
```

Re-running the identical command with eight dummy variables supplied:

```
ℹ tests 2490   ℹ pass 2490   ℹ fail 0   ℹ duration_ms 41951
process exit code: 0
```

**Fix — both halves, they solve different problems.**

**(a) Give the CI test job a dummy environment.** Nothing in `tests/unit/**` opens a socket; the variables only need to be *parseable*. Put this in both workflows' `test` job:

```yaml
env:
  NODE_ENV: test
  DATABASE_URL: postgres://ci:ci@127.0.0.1:5432/ci
  REDIS_URL: redis://127.0.0.1:6379
  RAZORPAY_KEY_ID: rzp_test_ci
  RAZORPAY_KEY_SECRET: ci_secret
  AWS_REGION: ap-south-1
  AWS_SES_FROM_EMAIL: no-reply@example.com
  APP_S3_BUCKET: ci-bucket
  JWT_SECRET: ci_jwt_secret
  FRONTEND_URL: http://localhost:5173
```

These are **not secrets** — they are syntactically valid placeholders and belong in the workflow file in plain sight, so that a future contributor can reproduce CI locally.

**(b) Make the failure legible.** The explicit `throw` added in §3.3 turns an opaque `url must be of type string` into `[Postgres] DATABASE_URL is required`. Do both: (a) unblocks the pipeline, (b) means the next person who hits it loses a minute instead of an afternoon.

> **Keep (a) and §7's matrix in sync.** Whenever a new module throws at require-time on a missing variable (`razorpay.config.js` and `pdf-renderer.config.js` already do), the CI env block needs the placeholder too, or the gate breaks again. This is the one recurring maintenance cost of boot-time validation, and it is worth paying.

---

### 3.14 [NEW v2] — No health endpoint · **CRITICAL**

`grep` for `/health`, `/healthz`, `/ready` across `src/` returns nothing. Yet v1's nginx config proxies `/api/v1/health` and its CI diagram ends with "Healthcheck Probe". Both would 404 today, so:

* the compose healthcheck in §3.7 has nothing to call,
* the deploy cannot be verified and therefore cannot be rolled back on failure,
* nginx/uptime monitoring has to probe a real business endpoint, which requires auth.

**Two endpoints, not one** — they answer different questions and must behave differently:

| Endpoint | Question | Dependencies checked | On dependency failure |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/health/live` | *Is the process up?* | none | still **200** — never restart a container because Postgres blinked |
| `GET /api/v1/health/ready` | *Can it serve traffic?* | Postgres `SELECT 1`, Redis `PING` | **503** with a per-dependency breakdown |

```javascript
// src/common/routes/health.routes.js  [NEW FILE]
'use strict'
const express = require('express')
const router = express.Router()
const { sequelize } = require('../../infrastructure/postgres-sql/connection.pgsqldb')
const { redisClient } = require('../../infrastructure/redis/connection.redis')

const startedAt = Date.now()

// Liveness: process-only. No dependency may turn this red.
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok', uptime_s: Math.floor((Date.now() - startedAt) / 1000) })
})

// Readiness: dependency-aware. Drives deploy verification and the load balancer.
router.get('/health/ready', async (req, res) => {
  const checks = { postgres: 'down', redis: 'down' }
  await Promise.allSettled([
    sequelize.query('SELECT 1').then(() => { checks.postgres = 'up' }),
    redisClient.ping().then(() => { checks.redis = 'up' })
  ])
  const ok = Object.values(checks).every(v => v === 'up')
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks })
})

// Back-compat alias for anything already pointed at /api/v1/health.
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }))

module.exports = router
```

Mount it in `src/app.js` **before** the module routers, and deliberately **outside** any auth, rate-limit or CORS restriction:

```javascript
app.use('/api/v1', require('./common/routes/health.routes'))
```

**Never return version, commit SHA, env var names or dependency hostnames from these endpoints** — they are unauthenticated. `status` and `checks` only.

---

### 3.15 [NEW v2] — `helmet` installed but never applied · HIGH

`helmet@^8.3.0` is a dependency; `grep -rn "helmet" src/` returns nothing. The API currently sends no `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` or `Referrer-Policy` of its own.

v1's nginx config adds three of these at the proxy, which is a reasonable second layer but not a substitute: anything that reaches the container directly (another service on the bridge network, a misrouted port, a future ALB) gets none of them.

```javascript
// src/app.js — immediately after `const app = express()`
const helmet = require('helmet')
app.use(helmet({
  // The API serves JSON plus a small static page directory (src/app.js:40).
  // CSP is left off until those pages are inventoried — enabling it blind
  // would break them. Track as a follow-up, do not enable speculatively.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },  // presigned/download flows
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: false }
    : false
}))
```

`app.set('trust proxy', 1)` at `src/app.js:32` is already correct and required for HSTS and for real client IPs behind nginx.

---

### 3.16 [NEW v2] — `morgan` installed but never applied · MEDIUM

Same situation: a dependency with zero usages. Without it, the container's stdout has no request log, so `docker logs` shows only ad-hoc `console` output and nginx is the sole source of request truth — useless for correlating an application error with the request that caused it.

```javascript
// src/app.js — after the body parsers, before the routers
const morgan = require('morgan')
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.path.startsWith('/api/v1/health')   // healthchecks every 30s would drown the log
}))
```

**Do not log request bodies.** Payment callbacks, invitation tokens and password payloads all pass through this middleware. `combined` logs method, path, status, size, referrer and user-agent — no body, no headers beyond those. That is the correct boundary, and it matches the redaction rule already adopted by the billing plan.

---

### 3.17 [NEW v2] — Webhook raw body is consumed by the JSON parser · HIGH

```javascript
// src/app.js — current order
33: app.use(express.json({ limit: '10mb' }))
34: app.use(express.urlencoded({ extended: true, limit: '10mb' }))
35: app.use('/webhooks/razorpay', express.raw({ type: 'application/json' }))
```

`express.json()` is global and registered **first**, so for a `POST /webhooks/razorpay` with `Content-Type: application/json` it parses the stream and sets `req._body = true`. The `express.raw()` on line 35 then short-circuits — `req.body` is a parsed object, never a `Buffer`.

**Consequence:** HMAC signature verification over the raw payload — the only thing that makes a payment webhook trustworthy — cannot be implemented as currently wired. Re-serialising `req.body` with `JSON.stringify` does **not** reproduce the bytes Razorpay signed (key order, unicode escaping, whitespace) and must not be used as a workaround.

```javascript
// src/app.js — [REPLACE lines 33-35]  raw first, scoped to the webhook path
app.use('/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
```

This is a DevOps-adjacent find but it belongs to the billing work. It is recorded here because it was discovered during this audit and because it **invalidates one stated premise of `public/md_organization/phases/phase1_implementation_plan.md` (§2, fact 5)**, which asserts the raw-body plumbing is correctly ordered. That plan has been annotated accordingly.

---

### 3.18 [NEW v2] — Plaintext credentials committed to the repository · **CRITICAL**

`src/code_dump/code/users.json` is **tracked in git** and contains real login identifiers with plaintext passwords for roughly six accounts, including personal Gmail addresses. `.dockerignore` does not exclude `src/code_dump`, so it is also baked into every image built to date.

Remediation, in order — **treat the credentials as compromised, because they are**:

1. **Rotate every password in that file now.** Anyone with repository read access, and anyone who has pulled any image, has them. Rotation comes first because the steps below do not un-leak anything.
2. `git rm --cached src/code_dump/code/users.json` and add `src/code_dump/code/users.json` to `.gitignore`.
3. Point the simulator at an ignored path via `ATTENDANCE_SIMULATOR_USERS_FILE` (§3.2) and keep the file only on the dev host.
4. Exclude `src/code_dump` in `.dockerignore` (§3.8).
5. **History still contains it.** Purging requires `git filter-repo` and a force-push that rewrites shared history. Given step 1, this is a judgement call: rotate always, rewrite history only if the repository is or may become public.

---

### 3.19 [NEW v2] — No `.env.example` · HIGH

Nothing in the repository records which variables the application needs. `.env` and `.env.production` are correctly gitignored and untracked, which means the contract exists only in two files on one laptop. A new environment is then assembled by guesswork, and boot-time throws (`razorpay.config.js`) turn a missing line into a crash loop.

**This file is the deliverable that makes "zero future code changes" true.** Create `.env.example` with every key, no values, grouped and annotated — `.gitignore` already has the `!.env.example` negation for it.

Measured drift today — variables the code reads that are **absent from `.env.production`**:

| Variable | Impact if left unset |
| :--- | :--- |
| `PDF_BULK_GENERATION_ENABLED` | Bulk PDF (letter bulk, payslip ZIP) returns **503** — intentional default, but must be a deliberate choice, not an omission |
| `APP_S3_BUCKET` | Falls back to `PAYROLL_S3_BUCKET`; works, but the fallback is undocumented |
| `APP_S3_KMS_KEY_ID`, `PAYROLL_S3_KMS_KEY_ID` | No KMS key → server-side encryption relies on the bucket default |
| `PAYROLL_ATTACHMENT_UPLOAD_TTL_SECONDS`, `PAYROLL_ATTACHMENT_VIEW_TTL_SECONDS` | Defaults 600 s / 300 s |
| `PAYROLL_ATTACHMENT_SWEEP_BATCH` | Default batch size |
| `PDF_BRANDING_ASSET_REUSE_MS` | Default reuse window |
| `PORT` | Falls back to `configs/default.json` → 4500 |
| `Login_PlACEHOLDER` | Appears in code; note the typo — verify whether it is dead and remove it if so |

Every one has a safe default *today*. The point is that nobody can tell that without reading the source, which is precisely the failure mode `.env.example` prevents.

---

### 3.20 [NEW v2] — Graceful shutdown is inverted and unbounded · MEDIUM

```javascript
// src/server.js:81-106 — current
const gracefulShutdown = async () => {
  await sequelize.close()          // ← closes the DB while requests are still arriving
  await redisClient.quit()
  server.close(() => process.exit(0))   // ← only now stops accepting
}
process.on('uncaughtException', err => { gracefulShutdown() })
process.on('unhandledRejection', err => { gracefulShutdown() })   // ← any stray rejection kills the process
```

Three problems on a `docker compose up -d` redeploy, when SIGTERM arrives while requests are in flight:

1. **Order is backwards.** Closing Sequelize first makes every in-flight request fail with a connection error instead of completing. `server.close()` must come first.
2. **No timeout.** If a single long-lived connection never closes, `server.close()` never calls back and the container hangs until Docker's 10 s SIGKILL — mid-transaction.
3. **`unhandledRejection` triggers a full shutdown.** One unhandled promise anywhere in 20 crons and dozens of services takes down the API. PM2 restarts it, so this reads as random restarts under load.

```javascript
// src/server.js — [REPLACE]
let shuttingDown = false
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 15000

const gracefulShutdown = async (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[Shutdown] ${signal} received — draining`)

  const forceExit = setTimeout(() => {
    console.error('[Shutdown] Drain timed out — forcing exit')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  try {
    await new Promise(resolve => server.close(resolve))   // 1. stop accepting, let in-flight finish
    await sequelize.close()                               // 2. then release resources
    await redisClient.quit()
    clearTimeout(forceExit)
    console.log('[Shutdown] Clean exit')
    process.exit(0)
  } catch (err) {
    console.error('[Shutdown] Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// An uncaught exception leaves unknown state — exiting is correct.
process.on('uncaughtException', err => {
  console.error('[Fatal] Uncaught exception:', err)
  gracefulShutdown('uncaughtException')
})

// An unhandled rejection does NOT justify killing a healthy process. Log it,
// keep serving, and fix the offending call site. Revisit only if these are rare.
process.on('unhandledRejection', err => {
  console.error('[Warning] Unhandled rejection (process kept alive):', err)
})
```

Pair with `stop_grace_period: 30s` on the app service in compose so Docker waits longer than `SHUTDOWN_TIMEOUT_MS`.

---

### 3.21 [NEW v2] — Container operations gaps · MEDIUM

| Gap | Consequence | Fix |
| :--- | :--- | :--- |
| No app healthcheck | Docker reports a crash-looping container as "up" | §3.7 + §3.14 |
| No log volume | PM2 writes `./logs/{out,error}.log` inside the container; every `--build` discards them | `app-logs` volume in §3.7 |
| No log rotation for PM2 files | The volume grows unbounded | `pm2 install pm2-logrotate` in the image, **or** set `error_file`/`out_file` to `/dev/stderr` and `/dev/stdout` and let Docker's json-file driver rotate (already capped at 10 MB × 3) — **prefer this, it is simpler and makes `docker logs` authoritative** |
| No memory limit | One runaway PDF job can OOM the host and take Redis with it | `deploy.resources.limits.memory` in §3.7 |
| No `TZ` in the container | `node:22-alpine` is UTC. All 20 crons pin `Asia/Kolkata` explicitly and business logic is timezone-aware, so this is defensive only — but 13 `new Date()`-style local-date expressions exist in `src/` | `TZ=Asia/Kolkata` in §3.7 |
| `.dockerignore` excludes `Dockerfile*` but the image still runs `npm ci --omit=dev` before `COPY . .` | Correct and cache-friendly — no change | — |

For the PM2 log change:

```javascript
// ecosystem.config.js
error_file: '/dev/stderr',
out_file: '/dev/stdout',
```

---

### 3.22 [NEW v2] — Pipeline gaps in `deploy-dev.yml` · HIGH

The existing workflow works, and the following are missing rather than wrong:

| Gap | Consequence |
| :--- | :--- |
| **No test gate** | A failing build deploys |
| **No deploy verification** | Nothing confirms the new container answers; a crash-looping deploy looks successful and green |
| **No rollback** | With no tagged image there is nothing to roll back to (§3.23) |
| **No `concurrency` group** | Two quick pushes run two `rsync` + `docker build` passes over the same directory simultaneously |
| **Shared `SSH_PRIVATE_KEY` / `SERVER_USER` across both environments** | One compromised key reaches production. Dev and prod need separate keys and separate GitHub Environments |
| **No manual approval for production** | A merge to `production` deploys instantly, with no window to abort |
| **`rsync --delete` over the whole repo** | Ships `tests/`, `public/md_*`, `analysis/`, `handoffs/`, `src/code_dump/` to the server, and `--delete` removes anything the server had that the repo does not — including, on a bad day, `.env` if the ordering ever changes. **Write the env file *after* rsync, not before** (the current workflow writes it first) |
| **`sudo docker` without a pinned context** | Works, but means the deploy user has root; acceptable if the host is single-purpose |

All addressed in §5.

---

### 3.23 [NEW v2] — No immutable build artifact · HIGH

Both environments `rsync` source and run `docker compose up -d --build` on the server. Consequences:

* **Dev and prod run different images.** Each is built at a different time on a different host; a base-image or transitive-dependency update between the two builds silently changes production.
* **Nothing to roll back to.** "Redeploy the previous version" means "check out the old commit and rebuild", which is slow and not guaranteed to reproduce.
* **Build load lands on the production host**, competing with live traffic.
* **The whole source tree lives on the production filesystem**, including tests and internal documentation.

**Fix — build once, promote the digest.** Build in CI, push to GHCR (free for private repos, authenticates with the built-in `GITHUB_TOKEN`), and have the server pull a tag.

This is the largest structural change in this plan and it is **optional for the first cut**. §5 gives both: §5.4 keeps the current build-on-server model with the gaps of §3.22 closed, and §5.5 is the registry upgrade. **Recommendation: ship §5.4 now, move to §5.5 before the customer count makes a bad production deploy expensive.**

---

## 4. `package.json` scripts

```jsonc
"scripts": {
  "start": "node src/server.js",
  "start:prod": "pm2-runtime start ecosystem.config.js --env production",
  "test": "node --test \"tests/unit/**/*.test.js\"",
  "test:watch": "node --test --watch \"tests/unit/**/*.test.js\"",
  "db:migrate": "sequelize-cli db:migrate",
  "db:migrate:status": "sequelize-cli db:migrate:status",
  "db:migrate:undo": "sequelize-cli db:migrate:undo",
  "db:seed": "sequelize-cli db:seed:all",
  "health": "node -e \"require('http').get('http://127.0.0.1:'+(process.env.PORT||4500)+'/api/v1/health/ready',r=>{r.pipe(process.stdout);process.exitCode=r.statusCode===200?0:1})\""
},
"engines": { "node": ">=22 <23" }
```

`engines` matters: the Dockerfile pins `node:22-alpine` while local development is on Node 24. Both CI workflows must use `node-version: 22` so the gate tests the runtime that actually ships.

---

## 5. CI/CD — two separate workflow files

Per the requirement, **dev and production are separate files**, not one workflow with `if:` branches. They can then diverge (production gets approval, backup and verification) without risking the dev path, and a production change cannot be made accidentally while editing dev.

### 5.1 File layout

```
.github/workflows/
├── deploy-development.yml     # replaces deploy-dev.yml  — trigger: push to `development`
└── deploy-production.yml      # NEW                      — trigger: push to `production` + manual dispatch
```

Delete `deploy-dev.yml` once `deploy-development.yml` is proven.

### 5.2 GitHub configuration

**Environments** (Settings → Environments) — this is what gives production its approval gate:

| Environment | Protection | Secrets |
| :--- | :--- | :--- |
| `development` | none | `SSH_PRIVATE_KEY`, `SERVER_USER`, `SERVER_IP`, `ENV_FILE` |
| `production` | **Required reviewers: 1+**, restrict to `production` | `SSH_PRIVATE_KEY`, `SERVER_USER`, `SERVER_IP`, `ENV_FILE` |

Same secret **names** in both environments, different **values**. The workflow then never mentions `DEV_` or `PROD_` prefixes, and the environment binding alone decides the target — one less place to make a fatal typo.

**Generate a separate SSH keypair per server.** Do not reuse one key.

### 5.3 Shared test gate

Identical in both files (a reusable workflow is possible but the duplication is ~15 lines and keeps each file readable):

```yaml
  test:
    name: Test Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Unit tests
        # Placeholders only — no secrets. Required because several modules construct
        # clients at require-time; without these the suite aborts (§3.13).
        env:
          NODE_ENV: test
          DATABASE_URL: postgres://ci:ci@127.0.0.1:5432/ci
          REDIS_URL: redis://127.0.0.1:6379
          RAZORPAY_KEY_ID: rzp_test_ci
          RAZORPAY_KEY_SECRET: ci_secret
          AWS_REGION: ap-south-1
          AWS_SES_FROM_EMAIL: no-reply@example.com
          APP_S3_BUCKET: ci-bucket
          JWT_SECRET: ci_jwt_secret
          FRONTEND_URL: http://localhost:5173
        run: npm test
```

### 5.4 `deploy-development.yml`

```yaml
name: Deploy — Development

on:
  push:
    branches: [development]
  workflow_dispatch:

concurrency:
  group: deploy-development
  cancel-in-progress: false      # never interrupt a deploy mid-flight

jobs:
  test:
    name: Test Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - env:
          NODE_ENV: test
          DATABASE_URL: postgres://ci:ci@127.0.0.1:5432/ci
          REDIS_URL: redis://127.0.0.1:6379
          RAZORPAY_KEY_ID: rzp_test_ci
          RAZORPAY_KEY_SECRET: ci_secret
          AWS_REGION: ap-south-1
          AWS_SES_FROM_EMAIL: no-reply@example.com
          APP_S3_BUCKET: ci-bucket
          JWT_SECRET: ci_jwt_secret
          FRONTEND_URL: http://localhost:5173
        run: npm test

  deploy:
    name: Deploy to Development
    needs: test
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: actions/checkout@v4

      - uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}

      - name: Add host key
        run: ssh-keyscan -H ${{ secrets.SERVER_IP }} >> ~/.ssh/known_hosts

      - name: Sync source
        env:
          TARGET: ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_IP }}
          APP_DIR: /home/${{ secrets.SERVER_USER }}/hrms-dev
        run: |
          set -euo pipefail
          ssh "$TARGET" "mkdir -p $APP_DIR"
          # --delete keeps the server tree identical to the repo. The env file is
          # written AFTER this step so it can never be deleted by the sync.
          rsync -az --delete \
            --exclude '.git' --exclude 'node_modules' --exclude '.github' \
            --exclude 'tests' --exclude 'analysis' --exclude 'handoffs' \
            --exclude 'review' --exclude '.env' --exclude '.env.*' \
            -e ssh ./ "$TARGET:$APP_DIR"

      - name: Write environment file
        env:
          TARGET: ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_IP }}
          APP_DIR: /home/${{ secrets.SERVER_USER }}/hrms-dev
        run: |
          printf '%s' "${{ secrets.ENV_FILE }}" \
            | ssh "$TARGET" "umask 077 && cat > $APP_DIR/.env && chmod 600 $APP_DIR/.env"

      - name: Build and start
        env:
          TARGET: ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_IP }}
          APP_DIR: /home/${{ secrets.SERVER_USER }}/hrms-dev
        run: |
          ssh "$TARGET" bash -euo pipefail -c "'
            cd $APP_DIR
            export COMPOSE_PROJECT_NAME=hrms-dev
            sudo -E docker compose up -d --build
          '"

      - name: Run migrations
        env:
          TARGET: ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_IP }}
          APP_DIR: /home/${{ secrets.SERVER_USER }}/hrms-dev
        run: |
          ssh "$TARGET" bash -euo pipefail -c "'
            cd $APP_DIR
            export COMPOSE_PROJECT_NAME=hrms-dev
            sudo -E docker compose exec -T hrms-app npx sequelize-cli db:migrate
          '"

      - name: Verify health
        env:
          TARGET: ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_IP }}
        run: |
          ssh "$TARGET" bash -euo pipefail -c "'
            for i in \$(seq 1 30); do
              if curl -fsS http://127.0.0.1:4501/api/v1/health/ready > /dev/null; then
                echo \"Healthy after \${i}0s\"; exit 0
              fi
              sleep 10
            done
            echo \"Health check failed\"
            sudo docker compose -p hrms-dev logs --tail 100 hrms-app
            exit 1
          '"

      - name: Prune
        if: always()
        env:
          TARGET: ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_IP }}
        run: ssh "$TARGET" "sudo docker container prune -f && sudo docker image prune -af --filter 'until=24h'"
```

### 5.5 `deploy-production.yml`

Same skeleton, with five differences — each one is the reason the files are separate:

```yaml
name: Deploy — Production

on:
  push:
    branches: [production]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  test:
    # ...identical to §5.3...

  deploy:
    name: Deploy to Production
    needs: test
    runs-on: ubuntu-latest
    environment: production          # (1) required reviewer — the run pauses here
    steps:
      # ...checkout, ssh-agent, known_hosts, rsync, env file — same as dev,
      #    with APP_DIR=/home/$SERVER_USER/hrms-prod and COMPOSE_PROJECT_NAME=hrms-prod...

      - name: Show pending migrations          # (2) visibility before anything changes
        run: |
          ssh "$TARGET" bash -euo pipefail -c "'
            cd $APP_DIR && export COMPOSE_PROJECT_NAME=hrms-prod
            sudo -E docker compose exec -T hrms-app npx sequelize-cli db:migrate:status || true
          '"

      - name: Back up database                 # (3) NEVER migrate production unbacked
        run: |
          ssh "$TARGET" bash -euo pipefail -c "'
            set -a; . $APP_DIR/.env; set +a
            mkdir -p /var/backups/hrms
            pg_dump \"\$DATABASE_URL\" --format=custom \
              --file=/var/backups/hrms/pre-deploy-\$(date +%F-%H%M%S).dump
            ls -t /var/backups/hrms/*.dump | tail -n +15 | xargs -r rm   # keep 14
          '"

      - name: Build and start
        # ...same as dev, COMPOSE_PROJECT_NAME=hrms-prod...

      - name: Run migrations
        # ...same as dev...

      - name: Verify health                    # (4) port 4500, and it gates the rollback below
        # ...same loop against http://127.0.0.1:4500/api/v1/health/ready...

      - name: Roll back on failure             # (5) previous image, same compose file
        if: failure()
        run: |
          ssh "$TARGET" bash -euo pipefail -c "'
            cd $APP_DIR && export COMPOSE_PROJECT_NAME=hrms-prod
            echo \"Deploy failed — restarting previous container\"
            sudo -E docker compose up -d --no-build
            sudo -E docker compose ps
          '"
```

> **Honest limitation of step (5).** Without a registry (§3.23), "roll back" can only restart the last successfully built image if it still exists on the host — and it cannot undo a migration. **A failed production deploy that has already migrated requires a manual decision: restore the §3 backup, or roll forward.** Say so out loud in the runbook rather than letting the step's name imply a safety that is not there. Moving to §5.6 removes half of this problem.

### 5.6 Optional upgrade — GHCR image promotion

Replaces build-on-server with build-once-promote-digest:

```yaml
  build:
    needs: test
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}:production
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

The server then needs only `docker-compose.yml`, `.env` and `nginx/`: set `image: ghcr.io/<owner>/<repo>:${IMAGE_TAG}`, drop the `build:` block, and deploy with `docker compose pull && docker compose up -d`. Rollback becomes `IMAGE_TAG=<previous-sha> docker compose up -d`. No source on the production filesystem at all.

---

## 6. Production nginx — `nginx/production.hrclouds.backend.nginx.config`

Corrections to v1's version: the port must match the production `HOST_PORT`, the health location must point at the endpoint that now exists, `proxy_buffering off` from the dev config is deliberately **not** carried over, a rate limit is added, and HSTS is left to certbot's TLS block.

```nginx
# /etc/nginx/sites-available/api.hrclouds.in
# Certbot adds the listen 443 / ssl_certificate lines and the port-80 redirect:
#   sudo certbot --nginx -d api.hrclouds.in

limit_req_zone $binary_remote_addr zone=hrms_api:10m rate=20r/s;

server {
    listen 80;
    listen [::]:80;
    server_name api.hrclouds.in;

    # Must be >= the app's express.json limit (10mb) plus multipart overhead.
    client_max_body_size 16M;
    client_body_timeout 60s;

    # Belt-and-braces alongside helmet (§3.15).
    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    server_tokens off;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location / {
        limit_req zone=hrms_api burst=40 nodelay;

        # Production HOST_PORT. Dev uses 4501; these must not collide on a shared host.
        proxy_pass http://127.0.0.1:4500;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Connection "";     # keepalive to upstream; no WebSockets in this app

        # PDF generation and payroll runs are the long poles.
        proxy_connect_timeout 10s;
        proxy_send_timeout    120s;
        proxy_read_timeout    120s;

        # Buffering stays ON in production (unlike the dev config) so nginx absorbs
        # slow clients instead of holding a Node connection open for each one.
        proxy_buffering on;
        proxy_buffers 16 16k;
        proxy_busy_buffers_size 32k;
    }

    # Unauthenticated, cheap, and excluded from the rate limit and the access log.
    location = /api/v1/health/live  { proxy_pass http://127.0.0.1:4500; access_log off; }
    location = /api/v1/health/ready { proxy_pass http://127.0.0.1:4500; access_log off; }

    access_log /var/log/nginx/hrms_prod_access.log;
    error_log  /var/log/nginx/hrms_prod_error.log warn;
}
```

**Also update** `nginx/development.hrclouds.backend.nginx.config`: it proxies `http://localhost:4501` (correct for dev) but sets `proxy_read_timeout 1h` and disables buffering — fine for debugging, and it should stay dev-only. Add the two health locations there too.

---

## 7. Environment variable matrix

Legend — **B** = boot-fatal if missing/invalid · **D** = safe default exists · **R** = required for correct behaviour but degrades gracefully.

| Variable | | Development | Production | Notes |
| :--- | :-: | :--- | :--- | :--- |
| `NODE_ENV` | R | `development` | `production` | **Only from `.env`** — never from compose `environment:` (§3.7) |
| `PORT` | D | `4500` | `4500` | Container-internal; host mapping is `HOST_PORT` |
| `TZ` | D | `Asia/Kolkata` | `Asia/Kolkata` | Defensive; crons already pin IST |
| `COMPOSE_PROJECT_NAME` | D | `hrms-dev` | `hrms-prod` | Isolates networks/volumes on a shared host |
| ~~`CONTAINER_NAME`~~ | — | *removed* | *removed* | Container names are now `<COMPOSE_PROJECT_NAME>-server` / `-redis`. Daemon-global names set per-environment collided and broke the first production deploy |
| `HOST_PORT` | D | `4501` | `4500` | Must match the nginx `proxy_pass` |
| `DATABASE_URL` | **B** | dev Postgres | **separate** prod Postgres | §3.3. **Never the same DB as dev** (§3.12) |
| `DB_REJECT_UNAUTHORIZED` | D | `false` | `false` | `true` only with a mounted CA bundle |
| `REDIS_URL` | **B** | `redis://hrms-redis:6379` | `redis://hrms-redis:6379` | Internal bridge; do not expose |
| `JWT_SECRET` | **B** | dev secret | **distinct** prod secret | Sharing it lets a dev token authenticate in prod |
| `FRONTEND_URL` | R | `https://frontend.dev.hrclouds.in` | `https://hrclouds.in` | §3.1 |
| `CORS_ALLOWED_ORIGINS` | D | dev origins + localhost | `https://hrclouds.in` only | §3.5 |
| `ENABLE_ATTENDANCE_SIMULATOR` | D | `true` | **`false`** | §3.2 |
| `ATTENDANCE_SIMULATOR_BASE_URL` | R* | `https://development.hrclouds.in/api/v1` | *(unset)* | Required only when the simulator is on |
| `ATTENDANCE_SIMULATOR_USERS_FILE` | D | host path outside the repo | *(unset)* | §3.18 |
| `ENABLE_CRON_JOBS` | D | `true` | `true` | §3.12 |
| `SHUTDOWN_TIMEOUT_MS` | D | `15000` | `15000` | §3.20 |
| `AWS_REGION` | R | `ap-south-1` | `ap-south-1` | |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | D | static keys | **omit — use an IAM role** | §3.4 makes omission work |
| `AWS_SES_FROM_EMAIL` | **B** | verified sender | verified sender | Throws in `aws-ses.provider.js:9` |
| `APP_S3_BUCKET` | R | `hrclouds-developmet` *(sic)* | `hr-clouds-production` | **Separate buckets.** Logs an error, does not throw |
| `APP_S3_KMS_KEY_ID` | D | — | prod KMS key | Falls back to bucket default encryption |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **B** | `rzp_test_…` | `rzp_live_…` | `razorpay.config.js:5` throws |
| `RAZORPAY_WEBHOOK_SECRET` | **B*** | test webhook secret | live webhook secret | **Not yet in code** — required by the billing phase plan |
| `PDF_RENDERER_BASE_URL` | R | renderer URL | renderer URL | Must be `https` outside development |
| `PDF_RENDERER_API_KEY` | R | dev key | prod key | |
| `PDF_RENDERER_TIMEOUT_MS` | D | `20000` | `20000` | **Throws if ≤ 10000** |
| `PDF_BULK_GENERATION_ENABLED` | D | `false` | `false` | Missing from `.env.production` today (§3.19) |
| `DOTENV_CONFIG_PATH` | D | *(unset)* | *(unset)* | Local multi-env testing only |

`*` Boot-fatal once the billing module lands.

---

## 8. Implementation roadmap

Six stages. Each leaves the tree green and is independently revertible.

### Stage 0 — Secrets and pre-flight (do first, no deploy involved)
- [ ] **Rotate every credential in `src/code_dump/code/users.json`**, then untrack it (§3.18).
- [ ] Decide the migration policy — **Option A or Option B in §3.9**. Everything downstream depends on this.
- [ ] Reconcile the unrun migration backlog (00047–00063 + seeders 010–012) by hand, with a `pg_dump` first.
- [ ] Generate **two** SSH keypairs; create the `development` and `production` GitHub Environments with a required reviewer on production (§5.2).

### Stage 1 — Application code (no infrastructure change; each item independently testable)
- [ ] `app_url.utils.js` + three call sites (§3.1)
- [ ] Simulator guard + env-driven base URL and users file (§3.2)
- [ ] `DATABASE_URL` unification across `connection.pgsqldb.js` and `migration.config.js` (§3.3)
- [ ] SES credential fallback (§3.4)
- [ ] `CORS_ALLOWED_ORIGINS` + the production-origin assertion (§3.5)
- [ ] `DOTENV_CONFIG_PATH` support (§3.6)
- [ ] **Health endpoints** (§3.14) ← everything downstream depends on these
- [ ] `helmet` (§3.15) and `morgan` (§3.16)
- [ ] **Body-parser reordering for the webhook path** (§3.17)
- [ ] Graceful-shutdown rewrite (§3.20)
- [ ] `ENABLE_CRON_JOBS` guard (§3.12)
- [ ] **Verify:** `npm test` still reports **2490 passing / 0 failing**, plus new tests for `app_url.utils` and the two health routes.

### Stage 2 — Config contract
- [ ] Write `.env.example` covering every row in §7 (§3.19)
- [ ] Add the 10 missing keys to `.env.production`
- [ ] Add `sequelize-cli` to dependencies and the scripts from §4
- [ ] **Verify:** `node -e "require('./src/app')"` boots with only the `.env.example` keys populated with placeholders.

### Stage 3 — Containerization
- [ ] Rewrite `.dockerignore` (§3.8) — then `docker build` and confirm `public/pages` and `configs` are present and `.env*`, `tests`, `src/code_dump` are not
- [ ] Rewrite `docker-compose.yml` (§3.7)
- [ ] PM2 logs to stdout/stderr (§3.21)
- [ ] **Verify:** `docker compose up -d`, then `docker compose ps` shows `healthy`, and `curl :4501/api/v1/health/ready` returns 200.

### Stage 4 — Pipelines
- [ ] `deploy-development.yml` (§5.4); confirm the test gate passes on a clean runner — **this is the §3.13 fix in action**
- [ ] Merge to `development`, watch a full green run end to end
- [ ] `deploy-production.yml` (§5.5) with approval, backup, verification and rollback
- [ ] Delete `deploy-dev.yml`

### Stage 5 — Server & network
- [ ] `nginx/production.hrclouds.backend.nginx.config` (§6); `nginx -t`; `certbot --nginx -d api.hrclouds.in`
- [ ] Add health locations to the dev backend config
- [ ] Confirm firewall exposes only 80/443 — **4500 and 4501 must not be reachable from the internet**
- [ ] Schedule `pg_dump` on a cron independent of deploys
- [ ] First production deploy via `workflow_dispatch`, not via a merge

### Stage 6 — Follow-ups (post-launch, not blockers)
- [ ] GHCR image promotion (§5.6 / §3.23)
- [ ] `pg_try_advisory_lock` on crons — **required before `instances` ever exceeds 1** (§3.12)
- [ ] Enable a CSP once `public/pages` is inventoried (§3.15)
- [ ] Error tracking / uptime monitoring against `/api/v1/health/ready`
- [ ] Purge `users.json` from git history if the repo may become public (§3.18)

---

## 9. Answering the question directly: does v1 cover everything?

**No — it covers roughly half, and one of its own recommendations could not have worked.**

What v1 got right and this version keeps: the `FRONTEND_URL` precedence bug, the attendance simulator, the SES credential shape, CORS from env, the `docker-compose` `NODE_ENV` override, the `.dockerignore` secret leak, the missing production nginx config, the missing npm scripts, and the observation that migrations are absent from the pipeline. That is a genuinely useful audit and the analysis above builds on it rather than replacing it.

What would have broken on the first run:

1. **The test gate could never pass** (§3.13) — proven by execution, not inference. Every deploy would have aborted at stage one.
2. **`npx sequelize-cli db:migrate` could never run** (§3.9) — the CLI is not installed, and `--omit=dev` would strip it even if it were.
3. **The health probe had nothing to probe** (§3.14) — both the nginx config and the CI diagram referenced an endpoint that returns 404.
4. **Migrations and the app read different env vars** (§3.3), so an automated migration could have targeted a different database than the one the app uses.

And what no amount of config could have fixed later, because it is a secret already in the open: **plaintext credentials committed to the repository** (§3.18).

Both of your stated requirements are now in the plan: the attendance simulator stays available in development — flag-gated, env-addressed, and hard-blocked in production (§3.2) — and dev and production have **separate workflow files** with genuinely different behaviour, not one file with branch conditionals (§5).
