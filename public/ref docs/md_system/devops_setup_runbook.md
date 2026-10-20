# HRMS DevOps Setup Runbook

**Audience:** an engineer who has never deployed this system before.
**Last updated:** 2026-10-01
**Companion document:** `devops_production_deployment_plan.md` — that one explains *why* each decision was made and lists the problems that were found. This one tells you *what to do*. Read this to get a server running; read that one before changing any of it.

---

## 1. What you are building

Two environments, each a self-contained Docker Compose stack on its own EC2 instance, fronted by nginx and deployed by GitHub Actions.

```
 git push development                 git push production
         │                                    │
         ▼                                    ▼
  deploy-development.yml              deploy-production.yml
    test gate (npm test)                test gate (npm test)
         │                                    │
         │                             [approval gate]
         ▼                                    ▼
   DEV EC2                              PROD EC2
   nginx :80/:443                       nginx :80/:443
     └─> 127.0.0.1:4501                   └─> 127.0.0.1:4545
           └─> container :4500                   └─> container :4500
                 ├─ pm2-runtime (1 fork)               ├─ pm2-runtime (1 fork)
                 └─ redis (internal only)              └─ redis (internal only)
   development.hrclouds.in              api.hrclouds.in
   DB: neon…/hrms                       DB: neon…/hrms-production
```

Three facts that explain most of the configuration:

1. **The container always listens on 4500.** Only the *host* port differs — 4501 on dev, 4545 on prod. Port 4500 is already occupied on the production instance by an unrelated process, which is the whole reason 4545 exists.
2. **PostgreSQL is Neon (managed, external).** It is not in the Compose file and is never created, destroyed or reset by any deployment. Both environments use the same Neon host with different database names.
3. **Redis is in the Compose file** and holds only ephemeral data — token blacklist, OTPs, rate-limit counters, caches, all with TTLs. No business records live there.

---

## 2. Prerequisites

| Thing | Requirement |
| :--- | :--- |
| EC2 instance | **2 GB RAM minimum.** `npm ci` during the image build gets OOM-killed on 1 GB. Ubuntu 22.04/24.04 assumed below. |
| Elastic IP | Required. A stop/start changes an auto-assigned IP and breaks both DNS and the `SERVER_IP` secret. |
| DNS | `development.hrclouds.in` and `api.hrclouds.in` must resolve to the matching Elastic IP **before** you run certbot. |
| Repo access | Admin on `RishiGaneshe/HrClouds-Backend` — you need to create GitHub Environments. |
| Neon credentials | The connection URL for the environment you are setting up. |

If the instance has less than 2 GB, add swap first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Server setup

Do this on each instance. The only differences between dev and prod are called out inline.

### 3.1 Packages

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg rsync nginx

# Docker from Docker's repo — the distro package predates `docker compose` v2
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Verify:

```bash
docker compose version      # must be v2.x — "docker-compose" (hyphen) is not used
```

The host needs **no PostgreSQL client at all.** The production backup step runs `pg_dump`
from a pinned container (`postgres:18-alpine`, set as `PG_DUMP_IMAGE` in
`deploy-production.yml`), so the client version lives in git rather than in whatever `apt`
happened to install. `pg_dump` refuses to dump a server newer than itself -- Ubuntu 24.04
ships client 16 and Neon runs 18, which is exactly how the backup step failed on
2026-10-01 (`aborting because of server version mismatch`). Bump `PG_DUMP_IMAGE` when the
server's major version goes past it; a newer client can always dump an older server, never
the reverse.

### 3.2 Passwordless sudo for docker

The workflows run `sudo -E docker compose` over a non-interactive SSH session. A password prompt hangs the deploy until the job times out.

```bash
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/docker" | sudo tee /etc/sudoers.d/90-hrms-docker
sudo chmod 440 /etc/sudoers.d/90-hrms-docker
sudo visudo -c                                   # must print "parsed OK"
```

Test it the way CI will, from your laptop — `-n` fails instead of prompting:

```bash
ssh <user>@<ip> 'sudo -n docker ps'
```

### 3.3 Directories

```bash
# dev
mkdir -p ~/hrms-dev/simulator
# prod
mkdir -p ~/hrms-prod/simulator
```

`simulator/` must exist on **both**: `docker-compose.yml` mounts `./simulator:/application/simulator:ro` unconditionally, and Compose fails to start the container if the source path is missing.

On **each environment that runs the simulator** (both now do), place its login file at `~/hrms-dev/simulator/users.json` (dev) or `~/hrms-prod/simulator/users.json` (prod). The file is keyed by environment (`{ development: {…}, production: {…} }`) and the cron selects the group by `NODE_ENV`. It is deliberately untracked and excluded from both the rsync and the Docker image. The deploy's `rsync --delete` excludes `simulator/` so this file survives every deployment.

### 3.4 Confirm the host port is free

```bash
sudo ss -lntp | grep -E ':(4500|4501|4545)\b'
```

Dev expects 4501 free; prod expects 4545 free (4500 will show the unrelated process). If the port you need is taken, change `HOST_PORT` in that environment's `.env` **and** the `proxy_pass` lines in the matching nginx config. A unit test asserts those two agree.

---

## 4. nginx

Configs live in the repo under `nginx/` and arrive on the host with the first rsync. Before the first deploy, copy them manually.

### 4.1 Install

```bash
# production
sudo cp ~/hrms-prod/nginx/production.hrclouds.backend.nginx.config \
        /etc/nginx/sites-available/api.hrclouds.in
sudo ln -sf /etc/nginx/sites-available/api.hrclouds.in /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default        # stops nginx answering on the bare IP
sudo nginx -t
sudo systemctl reload nginx
```

The production config defines a rate-limit zone named `hrms_api` at file top level. If another site on the box already defines that name, `nginx -t` fails with *"duplicate zone"* — rename it in both the `limit_req_zone` and `limit_req` lines.

### 4.2 TLS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.hrclouds.in
sudo certbot renew --dry-run
```

Certbot edits the file in place, adding `listen 443 ssl`, the certificate paths and a port-80 redirect. Your `location` blocks, headers and rate limit are preserved.

A **502** from `curl https://api.hrclouds.in/api/v1/health/live` at this point is correct — nothing is listening on the app port yet.

### 4.3 Updating the dev config

> The committed `development.hrclouds.backend.nginx.config` is the **pre-certbot** version and has no `listen 443` block. Do not overwrite the live file with it — you will drop the TLS configuration. Copy in only the specific blocks you need, then `nginx -t && systemctl reload nginx`.

---

## 5. Firewall

Security group inbound rules, both instances:

| Port | Source | Why |
| :--- | :--- | :--- |
| 22 | your IP, not `0.0.0.0/0` | SSH |
| 80 | `0.0.0.0/0` | certbot HTTP-01 and the redirect |
| 443 | `0.0.0.0/0` | the API |

**4501 and 4545 must not be listed.** Compose publishes them on the host, so allowing them in the security group makes the container reachable directly — bypassing nginx, the rate limit and TLS. Verify from outside the VPC:

```bash
curl -m 5 http://<ip>:4501/api/v1/health/live    # must TIME OUT
curl -m 5 http://<ip>:4545/api/v1/health/live    # must TIME OUT
```

Note that `ufw` **does not** filter Docker's published ports — Docker inserts its own iptables rules ahead of ufw's chain. The security group is the control that actually works.

---

## 6. GitHub setup

### 6.1 One SSH keypair per server

```bash
ssh-keygen -t ed25519 -C "gh-actions-hrms-dev"  -f ~/.ssh/hrms_deploy_dev  -N ""
ssh-keygen -t ed25519 -C "gh-actions-hrms-prod" -f ~/.ssh/hrms_deploy_prod -N ""

ssh-copy-id -i ~/.ssh/hrms_deploy_dev.pub  <user>@<dev-ip>
ssh-copy-id -i ~/.ssh/hrms_deploy_prod.pub <user>@<prod-ip>
```

No passphrase — the `webfactory/ssh-agent` action cannot prompt for one. Do not reuse one key for both servers: if the dev key leaks it must not open production.

### 6.2 Environments

`Settings → Environments → New environment`. Create **`development`** and **`production`** — lowercase, exactly matching the `environment:` key in each workflow.

Add these four secrets to **each** environment. The names are identical on both sides; the `environment:` binding is what selects the right values, which is why there is no `DEV_`/`PROD_` prefix to mistype.

| Secret | `development` | `production` |
| :--- | :--- | :--- |
| `SERVER_IP` | dev Elastic IP | prod Elastic IP |
| `SERVER_USER` | dev SSH user | prod SSH user |
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/hrms_deploy_dev` | contents of `~/.ssh/hrms_deploy_prod` |
| `ENV_FILE` | the complete dev `.env` | the complete prod `.env` |

For `SSH_PRIVATE_KEY`, paste the whole private key including the `BEGIN`/`END` lines **and a trailing newline**. A missing trailing newline is the most common cause of `Error loading key: invalid format`.

### 6.3 Delete the repository-level secrets

> **This step is not optional.**

GitHub resolves `${{ secrets.X }}` as *environment secret → repository secret*, falling back **silently**. If a repo-level `SERVER_IP` exists pointing at dev, and you forget to set it on the `production` environment, the production deploy will quietly target the dev server — with `rsync --delete` and automatic migrations — and report success.

After both environments are populated, delete the legacy repo-level secrets at `Settings → Secrets and variables → Actions`:

```
SERVER_IP   SERVER_USER   SSH_PRIVATE_KEY   ENV_FILE_DEV
```

With no fallback, a missing secret makes `TARGET` resolve to `@`, and the first SSH step fails immediately — before anything is synced or migrated.

### 6.4 Protect production

In the `production` environment:

* **Required reviewers** → add yourself. Migrations run unattended once approved, so this is the only human gate before the schema changes.
* **Deployment branches and tags** → *Selected branches* → `production`.

### 6.5 Create the `production` branch

It does not exist yet. `deploy-production.yml` triggers on pushes to `production` (there is no `main` branch on this remote).

```bash
git checkout -b production development
git push -u origin production
```

---

## 7. Environment files

`.env.example` in the repo root is the authoritative contract — it annotates every key with `[BOOT]` (required at startup), `[REQ]` (required for a feature) or `[DEF]` (has a default). Build each environment's file from it and paste the whole thing into the `ENV_FILE` secret.

Values that **must differ** between the two:

| Key | development | production |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | `production` |
| `HOST_PORT` | `4501` | `4545` |
| `COMPOSE_PROJECT_NAME` | `hrms-dev` | `hrms-prod` |
| ~~`CONTAINER_NAME`~~ | *removed — derived from `COMPOSE_PROJECT_NAME`* | *same* |
| `DATABASE_URL` | Neon `…/hrms` | Neon `…/hrms-production` |
| `FRONTEND_URL` | `https://frontend.dev.hrclouds.in` | `https://hrclouds.in` |
| `CORS_ALLOWED_ORIGINS` | dev origins + localhost | the real frontend origins only |
| `ATTENDANCE_SIMULATOR_BASE_URL` | `https://development.hrclouds.in/api/v1` | `https://api.hrclouds.in/api/v1` (or omit — defaults by `NODE_ENV`) |

Keys that are **the same** in both:

* `REDIS_URL=redis://hrms-redis:6379` — Compose overrides this anyway. Isolation comes from `COMPOSE_PROJECT_NAME` giving each environment its own network and volume, not from the string.
* ~~`REDIS_CONTAINER_NAME`~~ — **removed, and the reasoning that kept it was wrong.** The claim was that the URL above resolves by container name, so both environments had to use the identical literal `hrms-redis`. It resolves by *service* name: Compose always registers the service (`hrms-redis`) as a network alias, whatever the container is called. Setting the same container name in both env files did nothing for DNS and broke the first production deploy outright — container names are global to the Docker daemon, not scoped to the compose project, so prod could not create a container named `hrms-redis` while dev already held it. Both container names are now derived as `<COMPOSE_PROJECT_NAME>-server` and `<COMPOSE_PROJECT_NAME>-redis`, so the collision cannot be configured back in.

Traps worth knowing:

* **`PAYROLL_ENCRYPTION_KEY` must be exactly 64 hex characters** or the process exits at boot. It is not optional.
* **The attendance simulator now runs in production too**, gated solely by `ENABLE_ATTENDANCE_SIMULATOR=true` (the old `NODE_ENV=production` hard-block is gone, so it is `true` in both environments). `ATTENDANCE_SIMULATOR_BASE_URL` now **defaults by `NODE_ENV`** (prod → `api.hrclouds.in`, else `development.hrclouds.in`) and no longer throws when unset. In production it drives a small set of monitoring dummy accounts; by design ~20% of its marks land outside the office geofence to exercise the rejection path.
* **`CORS_ALLOWED_ORIGINS` completely overrides** the committed list in `configs/default.json`. The committed list contains LAN addresses and bare EC2 IPs; those will stop working in production, by design.
* `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` are **dead** — no code reads them. Safe to drop.
* **The env file contains `$` characters, and that broke the first deploy.** The `ENV_FILE` secret holds an argon2 hash (`DUMMY_HASH=$argon2id$v=19$…`). The workflow originally interpolated the secret straight into the step's shell with `${{ secrets.ENV_FILE }}`; GitHub substitutes expressions into the **script source before bash parses it**, so bash expanded `$argon2id`, `set -u` reported `argon2id: unbound variable`, and the deploy died — and the secret's newlines additionally broke the `\` line continuation. The secret is now passed via a step-level `env:` block and read as `"$ENV_FILE"`, so bash never parses its content. `tests/unit/system/deployment_config.test.js` fails the build if any `run:` block regains a `${{ }}` expression. **Never interpolate a secret into a `run:` script** — a password containing a backtick would be *executed*, not just expanded.
* **Docker Compose interpolates `$` inside the env file, and the corrupted value reaches the container.** Every `docker compose` call prints `The "argon2id" variable is not set. Defaulting to a blank string.` five times over, because Compose expands `$argon2id`, `$v`, `$m` and the two base64 segments of `DUMMY_HASH` while reading `.env`. This is **not** a cosmetic warning — verified with `docker compose config`, the container actually receives `DUMMY_HASH==19=65536,t=3,p=4`. It is harmless *only* because `DUMMY_HASH` is read by no code (the deployment plan flags it), so the one variable being silently corrupted is the one nothing uses. **Any used secret containing a `$` would be corrupted the same way, with no error** — check with `grep -nE '^[A-Za-z_][A-Za-z0-9_]*=' .env | grep '\$'` before adding a secret. Two ways out: delete `DUMMY_HASH` from the `ENV_FILE` secret, or escape each `$` as `$$`. Prefer deleting it — it is dead config.
* **A per-environment container name collided and killed the first production deploy.** `REDIS_CONTAINER_NAME` was set to the literal `hrms-redis` in *both* env files. Container names are global to the Docker daemon — `COMPOSE_PROJECT_NAME` isolates networks and volumes, but **not names** — so with dev already running, production got `Conflict. The container name "/hrms-redis" is already in use`, Redis never started, `hrms-app` never started behind its `depends_on`, and the job failed into the rollback step. Both container names are now derived (`<COMPOSE_PROJECT_NAME>-server`, `<COMPOSE_PROJECT_NAME>-redis`) and a test enforces it, so the value can no longer be set wrong.
* **`HOST_PORT` was 4501 in both env files too.** Production must publish **4545** (4500 and 4501 are taken on that host) and nginx + the workflow's `HEALTH_PORT` both assume 4545. Had the Redis collision not stopped the deploy first, production would have failed to bind 4501 against dev, and the health probe would have polled 4545 against nothing. Unlike the container name this *cannot* be derived — it is genuinely per-environment — so it stays a value you must get right. A test now pins `HEALTH_PORT` to 4545.
* **The same `$` broke the production backup step, which is production-only.** `Back up database` used to do `set -a; . $APP_DIR/.env; set +a` to read the connection string. Sourcing treats `.env` as a shell script, so it hit `argon2id: unbound variable` too — and it would have aborted *before* the backup was written, on the one step whose whole job is to protect the data. It now parses the file with `sed` and reads `DATABASE_URL`, falling back to `PostGre_DATABASE_URL` (the only one the current env files define), and exits non-zero if neither is present rather than running `pg_dump` against an empty string. A second test fails the build if any workflow sources `.env` again. Note that **a `.env` file is not a shell script** — treat it as data everywhere.

---

## 8. First deploy

Dev first, always.

```bash
git push origin development
```

Watch the Actions run and confirm in the log that `Add host key` prints the **dev** IP and that `Verify health` polls **4501**.

Then:

```bash
curl -s https://development.hrclouds.in/api/v1/health/ready
# {"status":"ok","checks":{"postgres":"up","redis":"up"}}
```

For production, trigger the **first** run manually — `Actions → Deploy — Production → Run workflow` — rather than by merging. Then:

```bash
# readiness
curl -s https://api.hrclouds.in/api/v1/health/ready

# headers — HSTS proves NODE_ENV=production actually took effect inside the container
curl -sI https://api.hrclouds.in/api/v1/health/live | grep -iE 'strict-transport|x-content-type|x-frame'

# on the host
cd ~/hrms-prod && sudo docker compose ps
sudo docker compose logs --tail 50 hrms-app
```

If `Strict-Transport-Security` is absent, `NODE_ENV` is not `production` inside the container:

```bash
sudo docker compose exec hrms-app printenv NODE_ENV
```

---

## 9. What a deploy actually does

Both workflows run the same sequence; production adds three steps, marked ★.

| # | Step | Notes |
| :--- | :--- | :--- |
| 1 | `npm test` | Full unit suite on a clean runner. Nothing proceeds if it fails. |
| 2 | ssh-agent + `ssh-keyscan` | |
| 3 | `rsync -az --delete` | Excludes `.git`, `node_modules`, `.github`, `tests`, `analysis`, `handoffs`, `review`, `simulator`, `.env*`. |
| 4 | Write `.env` | **After** the rsync, so `--delete` cannot remove it. `chmod 600`. |
| 5 | `docker compose up -d --build` | |
| 6 ★ | `db:migrate:status` | Visibility only. Logs what is about to be applied. |
| 7 ★ | `pg_dump --format=custom` | To `/var/backups/hrms`, keeping the 14 most recent. |
| 8 | `npm run db:migrate` | Runs pending `up()` migrations. |
| 9 | `npm run db:seed` | Runs pending seeders. See §10. |
| 10 | `docker compose restart hrms-app` | The container booted before the schema changed; this makes models see the migrated database. |
| 11 | Health loop | 30 attempts, 10s apart, against `/api/v1/health/ready`. |
| 12 ★ | Rollback on failure | Restarts the last image still on the host. **Cannot undo a migration.** |
| 13 | Prune | Only on success, so a failed deploy keeps the previous image. |

---

## 10. Why seeders run exactly once

`db:seed:all` is automated, and sequelize-cli's default `seederStorage: 'none'` keeps **no record** — it re-runs every seeder on every invocation. Six of the twelve use a bare `bulkInsert` with no conflict clause and would duplicate rows or trip a unique constraint:

```
002-seed-subscription-plans   004-seed-features          005-seed-plan-features
006-seed-attendance-features  007-seed-leave-feature     008-seed-document-feature
```

Two things make automation safe:

1. **`migration.config.js` sets `seederStorage: 'sequelize'`**, table `SequelizeData`. Each seeder is recorded and runs once.
2. **Migration `00064-create-seeder-meta-table.js`** creates that table and pre-marks those six as already executed — **but only where the database proves they ran**, by probing the sentinel row each one creates (`subscription_plans.code = 'free'`, `features.key = 'employee.access'`, …). An existing database skips them; a brand-new database matches nothing, records nothing, and seeds all twelve normally.

The other six (001, 003, 009, 010, 011, 012) use `INSERT … ON CONFLICT DO NOTHING` and are deliberately **left unrecorded**, so a re-run self-heals a missing row.

> **If you add a seeder that uses `bulkInsert` without a conflict clause, you must add it to the list in `00064`.** `tests/unit/system/deployment_config.test.js` fails the build if you don't.

---

## 11. Database safety audit

Reviewed on 2026-10-01 against both workflow files, with the question *"can CI destroy data?"*

### 11.1 What CI never does

Confirmed absent from both workflows:

| Not present | Would have been |
| :--- | :--- |
| `db:migrate:undo` | runs a migration's `down()` — several drop tables |
| `db:seed:undo` / `--seed` undo | deletes seeded rows |
| `docker compose down` | stops and removes containers |
| `-v` / `--volumes` on any compose or prune command | **deletes the Redis volume** |
| `docker system prune` | the `--volumes` variant deletes named volumes |
| `psql`, raw `DROP`, `TRUNCATE`, `DELETE FROM` | direct data loss |
| any database create/drop | |

The commands that *are* present and their effect on data:

| Command | Effect |
| :--- | :--- |
| `npm run db:migrate` | runs `up()` only — never `down()` |
| `npm run db:seed` | `INSERT` only, guarded by `SequelizeData` |
| `pg_dump` | read-only |
| `docker container prune -f` | removes **stopped containers**; volumes untouched |
| `docker image prune -af --filter 'until=24h'` | removes **unused images**; volumes untouched |
| `rsync --delete` | filesystem only — and excludes `.env` and `simulator/` |
| `ls -t /var/backups/hrms/*.dump \| tail -n +15 \| xargs -r rm` | deletes backup dumps beyond the newest 14 |

**The managed PostgreSQL database is never created, dropped, reset or truncated by any pipeline step.** `docker compose up -d --build` recreates containers, but named volumes (`redis-data`) survive container recreation — only `down -v` would remove them, and it is not used.

### 11.2 Residual risks — read these

**R1 — the pending backlog is 28 migrations, `00037` through `00064`.**

Verified against the **development** database on 2026-10-01 with `npm run db:migrate:status`: everything up to and including `00036` is applied; **nothing from `00037` onward has ever run.** That is the entire payroll, document and PDF-generation schema. Re-run the same check against production before deploying there — do not assume the two match.

Of those 28, only six touch a table that already holds data. The rest create new tables and cannot fail on existing rows.

| Migration | Touches live data | Risk |
| :--- | :--- | :--- |
| `00039` | `addColumn attendance_regularizations.work_mode` | none — `allowNull: true` |
| `00041` | rebuilds unique indexes on `user_roles`, `employee_profiles`, `manager_profiles`, `hr_profiles` as partial | none — a partial index is a strict subset of the full index it replaces, so no live row can newly conflict |
| `00042` | creates `(org_id, lower(name))` unique indexes on `organization_departments` and `organization_locations` | **can fail** — see below |
| `00046` | drops seven dead columns from `shift_templates` | destructive, but archives all seven to `shift_templates_dead_columns_archive` in the same transaction first |
| `00061` | `addColumn user_profiles.avatar_storage_key` | none — `allowNull: true` |
| `00062` | `addColumn organization_profiles.logo_storage_key` | none — `allowNull: true` |

**`00042` is the one realistic stopping point.** It refuses to run if any organization has two departments or two locations whose names differ only by case. It fails cleanly: an explicit pre-flight inside the migration's transaction throws a message naming the table and the offending rows, and the schema is left untouched. Check for the condition before you migrate:

```sql
SELECT 'departments' AS t, org_id, lower(name) AS name, count(*)
  FROM organization_departments GROUP BY org_id, lower(name) HAVING count(*) > 1
UNION ALL
SELECT 'locations', org_id, lower(name), count(*)
  FROM organization_locations GROUP BY org_id, lower(name) HAVING count(*) > 1;
```

Zero rows means `00042` will pass.

**R2 — 28 migrations apply in one unattended step.** sequelize-cli runs them in order, each in its own transaction, and stops at the first failure. A stop at `00042` leaves `00037`–`00041` applied and the rest pending — recoverable by fixing the data and re-running, not a corrupt state. Still, applying this backlog by hand once, watching each step, is the safer first move; let automation take over from a clean baseline afterwards.

> The payroll, document and PDF modules have never had their schema applied to any database. Their test suites are unit tests with mocked persistence. The first migration run is also the first time that schema meets a real PostgreSQL server.

**R3 — rollback cannot undo a migration.** The `Roll back on failure` step restarts the previous container image. If the failure occurred *after* step 8, the schema has already changed and the only options are restoring the dump from step 7 or rolling forward. The step name overstates what it does; the workflow comment says so explicitly.

**R4 — backups are local to the instance.** `/var/backups/hrms` is on the EC2 root volume. Instance loss loses the backups with it. Shipping them to S3 with lifecycle expiry is the obvious follow-up. Also watch disk: 14 custom-format dumps are not free.

**R5 — losing the Redis volume has a security consequence, not a data one.** Redis holds only TTL'd values: the revoked-token blacklist (`bl:*`), OTPs, rate-limit counters, caches. Wiping it would make already-revoked JWTs valid again until their natural expiry. Changing `COMPOSE_PROJECT_NAME` orphans the old volume and creates an empty one, which has the same effect — so do not change it casually.

**R6 — `SequelizeData` is the only thing preventing duplicate seed rows.** Deleting rows from it, or dropping the table, re-arms the six unsafe seeders on the next deploy. Treat it as schema, not scratch.

**R7 — a mistyped `DATABASE_URL` is unguarded.** `npm run db:migrate` from a laptop targets whatever is in the local `.env` (or `DOTENV_CONFIG_PATH`), with no confirmation prompt and no environment check — `migration.config.js` exports the same config object for `development`, `production` and `test`, so `NODE_ENV` selects nothing. Check which database you are pointed at before running anything:

```bash
node -e "require('dotenv').config();const u=new URL(process.env.DATABASE_URL||process.env.PostGre_DATABASE_URL);console.log(u.hostname,u.pathname)"
```

---

## 12. Operational reference

```bash
cd ~/hrms-prod                                  # or ~/hrms-dev

sudo docker compose ps                          # status
sudo docker compose logs -f --tail 100 hrms-app # follow logs
sudo docker compose restart hrms-app            # restart app only
sudo docker compose exec hrms-app printenv      # what the container actually sees
sudo docker compose exec -T hrms-app npm run db:migrate:status

curl -s localhost:4545/api/v1/health/ready      # 4501 on dev
```

Logs go to container stdout/stderr and are rotated by Docker's json-file driver at 10 MB × 3. There is no log volume and no PM2 log file; `docker compose logs` is authoritative.

### Restoring a backup

`pg_restore` carries the same version rule as `pg_dump`, so run it from the same pinned
image rather than from a host package:

```bash
ls -lt /var/backups/hrms/
sudo docker run --rm -v /var/backups/hrms:/backups \
  -e PGCONNSTR="$DATABASE_URL" \
  -e DUMPFILE=/backups/pre-deploy-YYYY-MM-DD-HHMMSS.dump \
  postgres:18-alpine \
  sh -c 'pg_restore --clean --if-exists --no-owner --dbname="$PGCONNSTR" "$DUMPFILE"'
```

`--clean` drops objects before recreating them. Stop the application first, and be certain you have the right dump and the right `DATABASE_URL`.

---

## 13. Known gaps

Carried from the plan document's §0.6. None of these block a deploy; all are worth closing.

- [ ] `src/code_dump/code/users.json` is still tracked in git with plaintext credentials. Rotate them, then `git rm --cached`.
- [ ] The attendance simulator directory is kept in the Docker image as a temporary exception. When the simulator is retired, add `src/code_dump` to `.dockerignore` and delete the double gate in `src/server.js`.
- [ ] Content-Security-Policy is deliberately disabled in helmet — the API serves a small static page directory and enabling it blind would break it.
- [ ] Backups are instance-local (R4).
- [ ] Server setup is manual; nothing in §3 is reproducible from code.
