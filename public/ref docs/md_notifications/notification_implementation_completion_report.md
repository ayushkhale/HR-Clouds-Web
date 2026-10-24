# Notification Engine — Tier 1 Implementation Completion Report

**Date:** 2026-10-24
**Scope:** Multi-channel notification engine (in-app + push FCM/WebPush + email SES), Tier 1 events.
**Source of truth:** `notification_system_implementation_plan.md` (+ `notification_event_catalog.md`,
`notification_api_contract.md`, `notification_rollout_runbook.md`).

---

## 1. What shipped

### Engine core (`src/modules/notification/`)
- **Catalog-as-code** (`constants/notification_catalog.js`) — `defineEvent()` factory + 8 load-time
  invariants that throw at `require` time. **18 Tier 1 events** (5 leave, 5 attendance, 3 payroll,
  5 task). `CATALOG_VERSION` stamped.
- **Repository** (`repositories/notification.repository.js`) — scoped reads (feed, unread cap,
  mark-read/all, delete), writes (`createOne`, `bulkInsertIgnoreDuplicates` ON CONFLICT DO NOTHING),
  and the drain surface (`claimBatch` with `FOR UPDATE SKIP LOCKED`, attempts consumed at claim;
  `markDispatched`/`markSkipped`/`recordFailure`; `resetStaleProcessing`; bounded `purgeOlderThan`).
- **Dispatcher** (`services/notification_dispatcher.service.js`) — `send()` and `sendBulk()`,
  **post-commit, fire-and-forget, never throws**. Per-recipient fan-out with dedupe; actor
  suppression; one `UserProfile` read resolves `actor_name` / `employee_name`.
- **Recipient resolver**, **renderer** (plain-text, missing var → `''`, lock-screen-safe push data),
  **drain** (CLAIM→SEND→RECORD, per-channel idempotency via `push_sent_at`/`email_sent_at`,
  backoff `min(2^attempts,60)` min, startup catch-up, retention sweep).
- **Read service + controller + routes + validator** — 5 inbox endpoints under
  `/api/v1/notifications` (feed, unread-count, mark-read, mark-all-read, dismiss), kill-switch 503,
  foreign-id → 404.
- **Transports** — `fcm.transport` / `webpush.transport` gained an optional `notification` arg:
  present ⇒ *visible* shape, absent ⇒ original *data-only* (location) shape unchanged.
- **Crons** — `notification_dispatch.cron` (every 60s, overlap-guarded) and
  `notification_retention_sweeper.cron` (04:20 IST); `runStartupCatchUp` wired in `server.js`.
- **Email** — `email.utils.sendNotificationEmail` + `notification_generic.html` template.
- **Config** — 10 `NOTIFICATION_*` env vars (all in `.env.example`, engine/push/email default off).
- **Migration** — `00086-create-notifications.js` (**UNRUN — handed back to the operator**).

### Domain hooks (Tier 1, all post-commit, all no-op while the engine is off)
| Module | Event(s) | Site |
|--------|----------|------|
| Leave | `leave.applied`, `leave.approved`, `leave.rejected`, `leave.cancellation_requested`, `leave.cancelled` | `leave_application.service`, `leave_approval.service` |
| Attendance | `attendance.regularization_requested/approved/rejected` | `regularization.service` |
| Attendance | `attendance.anomaly_flagged` (HR plane, in-app only, deduped per user/day) | `clock.service` (post-commit of a web/app punch whose geofence outcome is `out_of_bounds`/`missing_coordinates`/`unresolved`) |
| Attendance | `attendance.location_requested` (in-app only; the feature already pushes synchronously) | `location_tracking.service` (non-coalesced path) |
| Payroll | `payroll.payslip_published` (bulk fan-out to visible recipients) | `payslip.service.publish` |
| Payroll | `payroll.reimbursement_approved/rejected` (terminal decision only) | `reimbursement_approval.service` (`approveLevel` final level + `reject`) |
| Task | `task.assigned/submitted_for_review/approved/reopened/reassigned` (in-app+push; email stays owned by the task outbox) | `task.service` |

### Tests
- `tests/unit/notification/`: `notification_catalog.test.js`, `notification_dispatcher.test.js`,
  `notification_drain.test.js`, `notification_read_api.test.js`, `notification_transport_shapes.test.js`
  (**42 tests, green**). Existing `push_dispatch.test.js` + the touched domain suites (task 92,
  leave/reimbursement/attendance 305) stay green.

### Frontend change record
- `public/md_updates/2026-10-24_notification_inbox_apis_and_push_payload.md` — the 5 endpoints and
  the new `type:'NOTIFICATION'` Web Push / visible-FCM payload the service worker must branch on.

---

## 2. Deliberate plan deviations (read before extending)

1. **`enqueue()` (in-transaction, savepoint-wrapped) was NOT shipped.** No Tier 1 event needs the
   in-app row to be atomic with the business write — a missed in-app row is recoverable from the
   entity's own status. Every hook uses post-commit `send()`. The savepoint pattern stays documented
   in the plan for the first consumer that genuinely needs atomicity.
2. **Generic email template**, not per-event HTML. The stored `message` is the single source of
   truth; the email helper escapes it at send time. No second, divergent HTML copy to drift.
3. **Dispatcher resolves display names** (`actor_name`/`employee_name`) with one `UserProfile` read
   rather than threading names through every call site.
4. **`attendance.anomaly_flagged` fires on the geofence outcome**, not on every `createAnomaly`
   type. `work_mode_claim_mismatch` and `punch_photo_stale` do not notify HR; only the three
   location outcomes do, deduped to one HR notification per employee per business day.
5. **`attendance.location_requested` is in-app only** (no push/email channel in the catalog) because
   the location feature already sends its own synchronous push — the engine must not double-push.

---

## 3. Operator hand-back (DB-gated remainder)

- **Run migration `00086-create-notifications.js`** (VARCHAR/TEXT[] + CHECK constraints, partial
  unique dedupe index, partial unread index). Until it runs, the endpoints and drain have no table.
- **Flip the kill switches** when ready to go live: `NOTIFICATION_ENGINE_ENABLED=true`, then
  `NOTIFICATION_PUSH_ENABLED` / `NOTIFICATION_EMAIL_ENABLED` once FCM/WebPush/SES are configured.
  Follow `notification_rollout_runbook.md`.
- The engine stays fully inert (dispatchers no-op, endpoints 503, crons idle) until the switch is on,
  so the migration can land ahead of go-live with zero behavioral change.
