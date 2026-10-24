# Notification System — Rollout Runbook

| | |
|---|---|
| **Status** | PLAN ONLY — nothing here is executable yet |
| **Authored** | 2026-10-24 |
| **Parent plan** | [`notification_system_implementation_plan.md`](notification_system_implementation_plan.md) |

Written for whoever deploys this. Order matters: every step below is safe to stop at, and the
feature is invisible until the last switch is flipped.

---

## 1. Environment variables

All go in `.env.example` with these defaults at implementation time. **Every one defaults to the
safe/off value**, so deploying the code changes nothing until you act.

| Env var | Default | Meaning |
|---|---|---|
| `NOTIFICATION_ENGINE_ENABLED` | `false` | Global kill switch, checked before any DB read. Off ⇒ dispatchers no-op, all five REST endpoints `503 FEATURE_DISABLED`, both crons no-op. |
| `NOTIFICATION_PUSH_ENABLED` | `false` | Fan out to FCM / Web Push. Off ⇒ in-app rows only (`dispatch_status = 'skipped'`). |
| `NOTIFICATION_EMAIL_ENABLED` | `false` | Fan out to SES for the events the engine owns (leave, attendance). Never for task / document / payroll / billing events — those modules own their own email. |
| `NOTIFICATION_DISPATCH_BATCH` | `50` | Rows claimed per drain pass. |
| `NOTIFICATION_DISPATCH_TIMEOUT_MS` | `8000` | Hard bound per channel send. |
| `NOTIFICATION_MAX_ATTEMPTS` | `5` | Retry ceiling; back-off `min(2^attempts, 60)` minutes. |
| `NOTIFICATION_MAX_FANOUT` | `50` | Ceiling on `hr_plane` recipients for one event. |
| `NOTIFICATION_PUSH_PER_USER_PER_MINUTE` | `20` | Storm brake — drops **push only**, the in-app row is always written. |
| `NOTIFICATION_RETENTION_DAYS` | `180` | Retention sweeper horizon. |
| `NOTIFICATION_UNREAD_COUNT_CAP` | `100` | Capped badge count. |

Push credentials (`PUSH_FCM_*`, `PUSH_WEBPUSH_*`) are **already** documented in `.env.example` from
the location-tracking work. The notification engine reuses them and adds none.

---

## 2. Prerequisites — do these first

| # | Step | Why it blocks |
|---|---|---|
| 1 | Run migration **`00081-create-notification-devices.js`** if `npm run db:migrate:status` shows it pending | The push-device registry table. Without it **every push silently reaches nobody** — `dispatchToUser` returns `attempted: 0` and the drain records success. This is the quietest way for the whole feature to appear broken. |
| 2 | Run migration **`00086-create-notifications.js`** (handed back unrun) | The engine's table. |
| 3 | Confirm `PUSH_FCM_*` and `PUSH_WEBPUSH_*` are populated in the target environment | Only needed before step 4.3 below. The engine boots without them. |

Migrations are run by you, not by the build. Nothing in this project connects to the database to
check.

---

## 3. Deploy order

```text
3.1  Deploy code with ALL notification env vars at their defaults (everything off)
       → verify: the app boots; `GET /api/v1/notifications` returns 503 FEATURE_DISABLED;
         no notification cron logs appear
3.2  Run migration 00086
       → verify: `npm run db:migrate:status` shows 00086 up; the five indexes exist
3.3  NOTIFICATION_ENGINE_ENABLED=true, restart
       → verify: the five REST endpoints return 200 with an empty feed and unread_count 0;
         `[notification.dispatch]` cron logs appear every 60 s with claimed=0
3.4  NOTIFICATION_PUSH_ENABLED=true, restart
       → verify: register a device, trigger one leave approval, confirm the push lands AND
         the in-app row exists
3.5  NOTIFICATION_EMAIL_ENABLED=true, restart   (last, and only after 3.4 is clean)
       → verify: exactly ONE email per event. Two emails means an email_owner was mis-set.
```

Each step is independently reversible by flipping its variable back and restarting. No migration
needs undoing to turn the feature off.

---

## 4. Verification

### 4.1 After 3.1 — code deployed, everything off

- App boots. No new boot assertion was added, so a missing FCM key cannot stop the process.
- `GET /api/v1/notifications` → `503` `FEATURE_DISABLED`.
- **The on-demand location feature still works.** This is the regression that matters most: the
  transport changes are additive, and tests T-N26/T-N28 pin today's wire shape, but confirm one real
  locate request end to end before going further.

### 4.2 After 3.3 — in-app only

- Approve one leave request. Within the same second the employee's
  `GET /api/v1/notifications` shows the row, `unread-count` returns 1.
- `PATCH /:id/read` twice → `200` both times, `read_at` unchanged on the second.
- `DELETE /:id` twice → `200` then `404`.
- Another user's notification id → `404`, not `403`.

### 4.3 After 3.4 — push on

- Register a device (`POST /api/v1/notifications/devices`), approve a leave, confirm the push is
  **displayed** (not just received). On iOS a data-only message at `apns-priority: 5` is *not*
  displayed — if nothing appears, the `notification` block is not reaching the transport.
- Confirm the push body carries **no figure and no reason text**.
- De-register the device, approve another leave: the drain must record `skipped`/`failed` without
  retrying forever (`attempts` stops at `max_attempts`).

### 4.4 After 3.5 — email on

- One event ⇒ exactly one email. Check a task event specifically: the task module already emails it,
  so the engine must send nothing. Two task emails means `email_owner: 'task_outbox'` was dropped.

---

## 5. What to watch in the logs

| Log line | Means |
|---|---|
| `[notification.dispatch] claimed=N sent=N failed=N` | The 60 s drain, one line per pass. `claimed` persistently equal to `NOTIFICATION_DISPATCH_BATCH` means the queue is growing faster than it drains — raise the batch or shorten the interval. |
| `[notify.unknown_event] event_key=…` | A hook is calling an `event_key` the catalog does not define. The notification was dropped. A code bug, not an ops problem. |
| `[notify.no_recipients] event_key=…` | Resolved to nobody — usually an employee with no reporting manager and an event with no `fallback`. Worth a look: somebody's request may be sitting unapproved with nobody told. |
| `[notify.missing_var] event_key=… var=…` | A template variable was not supplied. The notification went out with a blank. Code bug. |
| `[notify.fanout_truncated] event_key=… resolved=N cap=50` | An `hr_plane` event hit `NOTIFICATION_MAX_FANOUT`. Some HR users were not notified. |
| `attempted=0` from `push_dispatch` | **Nobody has a registered device** — or migration `00081` was never run. Check §2 step 1 first. |
| `[notification.retention] deleted=N` | The 04:20 IST sweeper. `deleted=0` forever with a large table means the predicate is not matching — unread rows are never purged by age, which is intended, so check how many rows are unread. |

---

## 6. Rollback

| Symptom | Action |
|---|---|
| Notifications are wrong, noisy, or leaking | `NOTIFICATION_ENGINE_ENABLED=false`, restart. Dispatchers no-op, endpoints 503, crons idle. **The table is left intact** — nothing is lost, and re-enabling resumes from where it stopped. |
| Push specifically is misbehaving | `NOTIFICATION_PUSH_ENABLED=false`. In-app notifications keep working. |
| Duplicate emails | `NOTIFICATION_EMAIL_ENABLED=false`. This is the fastest fix; then correct the `email_owner` on the offending event. |
| **Location tracking broke after this deploy** | This is the one scenario that warrants a code rollback rather than a flag. The transport change is the only shared surface. Roll back the release; the engine's table and env vars are harmless left behind. |

Do **not** run `down()` on migration `00086` as a rollback step. It drops the table and discards
every unread notification, and no flag requires it.

---

## 7. Cron schedule — placement check

| Cron | Schedule (IST) | Neighbour conflict |
|---|---|---|
| `notification_dispatch.cron.js` | every 60 s | Shares the minute with `task_notification_dispatch` (also 60 s). Both are bounded-batch and `SKIP LOCKED`; they do not contend on the same table. |
| `notification_retention_sweeper.cron.js` | `04:20` | Free. `pdf_cache_purge` is 04:15, `attendance_punch_photo_sweeper` 04:40. |

Both are registered inside the existing `os.platform() === 'linux' && cronJobsEnabled` block in
`src/server.js`, so they do not run on a developer's Windows machine. `runStartupCatchUp` goes in the
existing `setTimeout(…, 30000)` block alongside the five services already there.
