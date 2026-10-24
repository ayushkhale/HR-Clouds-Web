# HRMS Notification System — Senior Review & Implementation Plan

| | |
|---|---|
| **Status** | PLAN ONLY — no code, no migration, no model has been written |
| **Authored** | 2026-10-24 |
| **Module** | `src/modules/notification/` (extends the existing device registry) |
| **Migration** | `00086-create-notifications.js` (next free number; **not written, not run**) |
| **Companion docs** | [`notification_event_catalog.md`](notification_event_catalog.md) · [`notification_api_contract.md`](notification_api_contract.md) · [`notification_rollout_runbook.md`](notification_rollout_runbook.md) |

---

## Part 0 — Executive summary

### 0.1 What already exists (verified in the tree, not assumed)

| Asset | Path | State |
|---|---|---|
| Push-device registry | `src/modules/notification/models/notification_devices.model.js` | Shipped. Table created by migration `00081` (**unrun**). |
| FCM HTTP v1 transport | `src/modules/notification/transports/fcm.transport.js` | Shipped. **Data-only messages, `apns-priority: 5`.** |
| Web Push transport | `src/modules/notification/transports/webpush.transport.js` | Shipped. **Payload hard-codes `type: 'LOCATION_REQUEST'`.** |
| Per-user push fan-out | `src/modules/notification/services/push_dispatch.service.js` | Shipped. `dispatchToUser(orgId, userId, { data })`. |
| Module mount | `src/modules/notification/notification.index.js` | Mounted at `/api/v1/notifications`, device routes only. |
| Model auto-loading | `src/infrastructure/postgres-sql/models.index.js:23` | `modules/notification/models` is **already** a MODEL_ROOT — a new `*.model.js` there is picked up with **zero** change to `models.index.js`. |
| SES email | `src/common/utilities/email.utils.js` | `TEMPLATE_MAP` + `sendTemplatedEmail({ to, event, data })`. |
| Outbox precedent | `src/modules/task/services/task_notification.service.js`, `src/modules/document/services/document_notification.service.js` | Two independent, working CLAIM→SEND→RECORD outboxes with `SKIP LOCKED`. |

The engine described here is **the fourth** notification mechanism in this codebase. That is the
central fact the plan has to deal with, and §A.1 D-8 is where it is dealt with.

### 0.2 What this plan changes versus the brief

| # | Brief said | Plan says | Why |
|---|---|---|---|
| 1 | `channels` is `ARRAY(ENUM('in_app','push','email'))` | `TEXT[]` + SQL `CHECK` | Repo convention (migrations `00078`, `00081` headers): *"VARCHAR + explicit SQL CHECK constraints, never native ENUM (avoids rollback/lock pain)"*. Sequelize `ARRAY(ENUM)` additionally needs the PG enum type hand-created and breaks `queryInterface.changeColumn`. |
| 2 | "Centralized model export in `models.index.js`" | **No change to `models.index.js`** | It already recursively auto-loads `modules/notification/models`. Editing it would be a no-op touch of an unrelated file. |
| 3 | Dispatch strictly after `txn.commit()` | Two entry points: `send()` (post-commit, default) **and** `enqueue(…, { transaction })` (in-transaction, savepoint-wrapped) | Post-commit dispatch loses the notification if the process dies in the window between `commit()` and the insert. For `leave.applied` that is tolerable; for `payslip.published` it is not. See D-5 — this is **decision 1 for you**. |
| 4 | Exactly the 13 listed columns | 13 + 7 dispatch-state columns | Without `dispatch_status / attempts / next_retry_at / last_error` a failed push can never be retried and `delivered_at` can never be explained. Mirrors `task_notifications` exactly, so it is the repo's own shape. |
| 5 | Feed index `(user_id, org_id, read_at, created_at DESC)` | `(user_id, org_id, created_at DESC)` + a **partial** index `WHERE read_at IS NULL` | `read_at` in the middle of the key makes the chronological feed scan two ranges; the badge wants a partial index, not a composite one. See B.4.3. |
| 6 | `setImmediate` / microtask OR Redis queue | `setImmediate` nudge + **60 s cron safety net**, no Redis queue | The repo has six working cron-drained outboxes and `node-cron` already installed. A Redis queue is a new failure domain and a new dependency for a problem already solved here. |
| 7 | Task events in Tier 1 | Task events get **`in_app` + `push` only** | `task_notification.service` already emails `task_assigned` / `task_submitted` / `task_reopened` / `task_completed` / `task_overdue`. Routing email through the new engine too sends every assignee **two** emails. Same for document, billing and payslip events. See D-8. |
| 8 | `GET /notifications` with a `validate(schema, 'query')` middleware | Validate query **in the controller** | Express 5 makes `req.query` a getter. `req.query = validateOrThrow(...)` is a silent no-op (or throws in a strict-mode file). The repo already learned this — see `src/modules/attendance/validators/schedule_agenda.validator.js:9` and every `task` controller. |

### 0.3 Decisions I need from you before Phase 2

1. **D-5 — durability model.** Default `send()` after commit (lossy on crash, zero risk to the
   business transaction), or make Tier-1 approval/payroll events use the in-transaction savepoint
   `enqueue()`? **My recommendation: ship both, use `send()` everywhere in Phase 2, and promote only
   `payroll.payslip_published`, `leave.approved` and `leave.rejected` to `enqueue()` in Phase 3**
   once the savepoint behaviour has a test around it.
2. **D-8 — email ownership.** Confirm the new engine does **not** send email for any event a module
   outbox already emails (my recommendation), i.e. the engine is `in_app` + `push` for
   task/document/payroll/billing events and owns email only for events that have no email today
   (leave, attendance, shift).
3. **D-7 — the Web Push payload shape is a frontend-visible change.** Parameterising
   `type: 'LOCATION_REQUEST'` out of `webpush.transport.js` changes what the deployed service worker
   receives. Confirm the web client can ship in the same release, or I keep `LOCATION_REQUEST` as the
   default `type` and notifications carry `type: 'NOTIFICATION'` additively (this is what the plan
   assumes).
4. **Pagination key casing.** The `document` module returns
   `pagination: { page, limit, total, total_pages }`; `task` returns `{ total, page, limit, totalPages }`.
   New API — I propose `total_pages` (snake_case, consistent with every other field in the payload).
   Say if the mobile app already assumes `totalPages`.
5. **Platform-plane roles.** `org_id` is `NOT NULL`, so `admin` / `super-admin` will always see an
   empty inbox (correct — they hold no tenant data). Confirm they should still be *allowed* on the
   routes (returning an empty list) rather than 403'd.

---

## Part A — Review of the supplied brief

Graded. **BLOCKER** = would ship a defect or fail to build. **RISK** = would work, then hurt.
**NOTE** = worth knowing.

### A.1 Blockers

| # | Finding | Why it blocks |
|---|---|---|
| **D-1** | Reference schema is camelCase (`userId`, `businessId`) and references `business_profiles` | No `business_profiles` table is in scope for tenancy; the tenant column across all 85 migrations is `org_id → organizations.id`. The model must use `underscored: true` with `createdAt: 'created_at'`, like `notification_devices.model.js`. |
| **D-2** | `channels: ARRAY(ENUM(...))` | See §0.2(1). Also: Sequelize emits the array-of-enum type as `"enum_notifications_channels"[]`, which `queryInterface.createTable` cannot create in the same statement — the migration fails on a clean database. |
| **D-3** | "Failures … must NEVER abort the core HR transaction" and "dispatch after commit" are given as one requirement, but they are two different mechanisms | Post-commit dispatch satisfies "never aborts" **by construction** — there is no transaction left to abort. In-transaction enqueue does **not**: in PostgreSQL a single failed statement aborts the whole transaction (`current transaction is aborted, commands ignored until end of transaction block`), and catching the JavaScript error does **not** rescue it. If any in-transaction enqueue is wanted it **must** be wrapped in a SAVEPOINT (`db.sequelize.transaction({ transaction: parent })`). This is the single most important correctness note in this plan. |
| **D-4** | `delivered_at` is one column for a three-channel row | Unanswerable: "the push failed but the email went — is this row delivered?" Needs `push_sent_at` / `email_sent_at` plus `delivered_at` defined as *first successful out-of-app delivery*. |
| **D-5** | No durability story: a post-commit `send()` that dies mid-flight loses the notification with no trace | For `payslip.published` the employee is told "your payslip is ready" by contract. Needs either in-transaction enqueue or explicit acceptance of the loss window. |
| **D-6** | "notify manager" is listed as the dispatcher's job but no recipient contract is given | If the call site resolves the manager it is no longer 1 line, and the `leave` service grows a `UserReportingMapping` read. Recipient resolution must be **catalog-declared** (`to: 'reporting_manager'`) and executed inside the notification module. |
| **D-7** | The brief assumes the existing push transports can carry a user-visible notification | They cannot, today. `fcm.transport.js:_buildMessage` builds a **data-only** message at `apns-priority: 5` with `content-available: 1` — deliberately, so the location feature's background JS handler wakes. A data-only message at priority 5 is **not displayed** by iOS and is throttled; it will not produce a visible alert. `webpush.transport.js` hard-codes `{ type: 'LOCATION_REQUEST', ...data }` and sends no title/body. Both need an additive `notification` parameter (§B.7). |
| **D-8** | The brief routes `task.*`, `payslip_published`, document and billing events through the new engine's `email` channel | Those four already have working email outboxes (`task_notification.service`, `document_notification.service`, `payslip_dispatch.service`, `billing_notification.service`) wired into `TEMPLATE_MAP` and drained by five crons. Adding the engine's email channel on the same events **double-sends**. |
| **D-9** | `publishPayslip` is given as a 1-line `send()` call site | `payslip.service.js:579 publish()` releases a whole run — up to several thousand payslips in one call. A per-recipient `send()` means N inserts and N push fan-outs inside one HTTP request. Needs a `sendBulk()` path (one chunked `bulkCreate`, one drain nudge). Same for shift-roster publish, org broadcast, and the birthday cron. |

### A.2 Risks

| # | Finding | Consequence | Mitigation (in this plan) |
|---|---|---|---|
| **D-10** | No retention policy | 1 000 employees × ~8 notifications/day ≈ **2.9 M rows/year/org**. The feed index degrades and `mark-all-read` becomes a long write. | §B.11: retention sweeper cron, `NOTIFICATION_RETENTION_DAYS` (default 180). |
| **D-11** | `GET /unread-count` as `COUNT(*) WHERE read_at IS NULL` | Unbounded count over a user who never opens the app. | §B.4.3 + API contract: capped count (`LIMIT 100` subselect) returning `{ unread_count, is_capped }`. Badge UIs render `99+` anyway. |
| **D-12** | Templates interpolate employee-controlled strings (`{{employee_name}}`, `{{task_title}}`, leave reason, comment text) and the same rendered string is reused for email | `sendTemplatedEmail` substitutes into an **HTML** template. An employee named `<img onerror=...>`, or a leave reason containing markup, is HTML injection into every manager's inbox. | §B.5.4: the renderer returns **two** shapes — plain text for in-app/push, HTML-escaped for email. Values are escaped at the email boundary, never trusted. |
| **D-13** | `metadata` (JSONB) is described as going into the push `data` payload | Push payloads transit Google/Apple/Mozilla infrastructure and render on a **lock screen**. `metadata` holding a net-pay figure or a medical leave reason leaks it. | §B.10: `metadata` is routing-only; the catalog declares an explicit `push_data_keys` whitelist and a separate short `push_body`. A unit test asserts no catalog entry whitelists a value-bearing key. |
| **D-14** | The dedupe key is described purely as retry protection | It is also a **suppression** mechanism. `task.reopened` legitimately fires twice for one task; a dedupe of `task_reopened:{task_id}` silently drops the second. | §B.9: the catalog declares `dedupe: 'entity' \| 'entity_day' \| 'occurrence' \| null` per event, and the default is `'occurrence'` (never suppress) — suppression is opt-in. |
| **D-15** | No actor suppression | The manager who approves a leave gets "Your leave was approved"; the HR who flags an anomaly gets their own alert. | §B.6.3: `actor_id === user_id` is dropped unless the catalog sets `notify_actor: true`. |
| **D-16** | Nothing excludes deactivated members | A removed employee keeps receiving notifications and keeps a live push token. | §B.6.4: the resolver joins `user_roles` and requires `is_active = true AND deleted_at IS NULL` — the single tenant-membership signal. |
| **D-17** | `PATCH /mark-all-read` as an unbounded `UPDATE … WHERE read_at IS NULL` | Non-deterministic (swallows rows inserted mid-statement) and an unbounded write on a stale account. | API contract: a `created_at <= :now` watermark, and the response reports `updated_count`. |
| **D-18** | No org-level or per-user mute | First support ticket after Tier 3 ships ("stop the birthday emails"). | Explicitly **out of scope** for Phases 1–3; §B.13 sizes it as Phase 6 (`notification_preferences` + a `notifications.*` settings-catalog group, which **will** be caught by the T-S2 parity test). |

### A.3 Notes

| # | Note |
|---|---|
| **D-19** | `Notification` is free as a Sequelize model name (`DocumentNotification`, `TaskNotification`, `NotificationDevices` are taken). `models.index.js` throws on a duplicate, so this was worth checking. |
| **D-20** | Express 5: validate `req.query` **in the controller** with `validateOrThrow`, as every `task` controller does. The `validate(schema, source)` route helper in `notification_device.routes.js` is safe for `body` and `params` only. |
| **D-21** | The brief's "On-demand live location ping dispatched" Tier-1 event must **not** go through this engine's push channel. `location_tracking.service` calls `pushDispatchService.dispatchToUser` **synchronously inside the request** because its SLA is 60 s end to end, and the fastest drain here is 60 s. Location keeps its direct call; the engine may write an `in_app` **audit** row for the employee (which is also the DPDP notice obligation) and nothing else. |
| **D-22** | Migration numbering: `00086` is next (`00085-create-employee-location-consents.js` is the highest today). It must be **handed back unrun** — the operator runs migrations, never the build. |

---

## Part B — Design

### B.1 Shape of the solution

```text
src/modules/notification/
├── constants/
│   ├── notification_catalog.js        NEW  ← the one registry: event_key → channels, category,
│   │                                           templates, recipients, dedupe, deep link
│   └── notification_defaults.js       NEW  ← batch sizes, timeouts, retention, max attempts
├── models/
│   ├── notification_devices.model.js       (exists)
│   └── notifications.model.js         NEW
├── repositories/
│   ├── notification_device.repository.js   (exists)
│   └── notification.repository.js     NEW  ← insert / bulkInsert / claim / record + feed reads
├── services/
│   ├── notification_device.service.js      (exists)
│   ├── push_dispatch.service.js            MODIFIED — additive `notification` passthrough
│   ├── notification_dispatcher.service.js  NEW  ← THE 1-LINE INTERFACE
│   ├── notification_recipient.service.js   NEW  ← target_user | reporting_manager | hr_plane | actor
│   ├── notification_render.service.js      NEW  ← {{var}} → plain text + escaped HTML
│   ├── notification_drain.service.js       NEW  ← CLAIM → SEND → RECORD (push + email)
│   └── notification_read.service.js        NEW  ← feed, badge, mark-read, dismiss
├── transports/
│   ├── fcm.transport.js                    MODIFIED — additive `notification` block
│   └── webpush.transport.js                MODIFIED — additive title/body, `type` parameterised
├── controllers/notification.controller.js      NEW
├── routes/notification.routes.js               NEW
├── validators/notification.validator.js        NEW
└── notification.index.js                       MODIFIED — mount one more router

src/cron-jobs/
├── notification_dispatch.cron.js          NEW  (every 60 s — drain safety net)
└── notification_retention_sweeper.cron.js NEW  (04:20 IST — retention purge)

src/infrastructure/postgres-sql/migrations/
└── 00086-create-notifications.js          NEW  (handed back UNRUN)
```

No file outside `src/modules/notification/`, `src/cron-jobs/`, `src/server.js` and the migrations
directory is touched in Phases 1–2. Phase 3's domain hooks add **one line each** to existing
services, listed exhaustively in the [event catalog](notification_event_catalog.md).

### B.2 The 1-line interface

```js
// notification_dispatcher.service.js — the ONLY thing a domain service ever imports.

/**
 * Fire-and-forget. Call AFTER txn.commit(). Never throws, never rejects, never awaits a transport.
 * Resolves to { enqueued, skipped, reason } — ignore it unless you are a test.
 */
send(eventKey, ctx)

/**
 * Durable. Call INSIDE the caller's transaction. Wrapped in a SAVEPOINT, so a failure here
 * rolls back only the notification row and leaves the caller's transaction usable.
 */
enqueue(eventKey, ctx, { transaction })

/**
 * Bulk. One chunked bulkCreate + one drain nudge. For run-level publishes and crons.
 */
sendBulk(eventKey, { org_id, actor_id, recipients: [{ user_id, data }] })
```

`ctx` is the whole contract:

```js
{
  org_id:         'uuid',   // required
  actor_id:       'uuid',   // nullable — who did it; used for actor suppression + attribution
  target_user_id: 'uuid',   // the SUBJECT of the event (the employee whose leave it is)
  data:           { ... }   // template variables + deep-link ids; plain values only
}
```

The call site never names a recipient, a channel, a title, a table or a transport. Everything else is
the catalog's job. **That is what keeps it one line.**

Guarantees, in order of importance:

1. `send()` **cannot throw**. The whole body is one `try/catch` that logs and swallows. It is not
   `await`ed by the caller (`void dispatcher.send(...)`), so even an unhandled rejection cannot
   surface — and `src/server.js` already keeps the process alive on `unhandledRejection`.
2. `send()` **cannot add latency**. It does no work in the caller's tick: it `setImmediate`s the
   insert. The HTTP response is already serialising by then.
3. `enqueue()` **cannot poison the caller's transaction**, because of the savepoint (D-3).
4. Both are **idempotent** when the catalog declares a dedupe mode, via `ON CONFLICT DO NOTHING` on
   the partial unique index (Sequelize `ignoreDuplicates: true`).

### B.3 Lifecycle

```text
                       ┌─ HTTP request ─────────────────────────────────────────────┐
                       │                                                            │
 leave_approval.service.approveRequest()                                            │
   ├ txn = await db.sequelize.transaction()                                          │
   ├ … business writes (leave row, balance, attendance footprint) …                  │
   ├ await txn.commit()                            ← business durability ends here   │
   ├ void notificationDispatcher.send('leave.approved', { org_id, actor_id,          │
   │                                   target_user_id, data })   ← 1 LINE            │
   └ return request                                                                  │
                       │                                                            │
                       └─ response flushed (no notification work has run yet) ──────┘

 setImmediate tick (same process, outside the request)
   1. catalog.resolve('leave.approved')   → channels, category, recipients, dedupe, templates
      └─ unknown key? log [notify.unknown_event] + return. Never throw.
   2. recipient.resolve(spec, ctx)        → [user_id…]  (active members only, actor dropped)
      └─ empty? return { skipped: 'no_recipients' }
   3. render(templates, ctx.data)         → { text: {title,message,push_body}, html: {...} }
   4. dedupe_key = catalog.dedupe(ctx)    → 'leave.approved:<leave_id>' | null
   5. repository.insert(rows, { ignoreDuplicates: true })
      ├─ channels === ['in_app']  → dispatch_status = 'sent'   (nothing to fan out)
      └─ else                     → dispatch_status = 'pending', next_retry_at = now()
   6. if any row is 'pending' → setImmediate(drain.nudge())

 drain (nudge, or notification_dispatch.cron every 60 s — whichever gets there first)
   CLAIM   one txn:  SELECT … WHERE dispatch_status IN ('pending','processing')
                       AND next_retry_at <= now() AND attempts < max_attempts
                     ORDER BY created_at ASC LIMIT :batch
                     FOR UPDATE SKIP LOCKED            ← multi-instance safe
                   → UPDATE … SET dispatch_status='processing', attempts = attempts + 1
                     (attempts consumed AT CLAIM, so a worker that dies mid-send still burns one
                      and a poison row cannot loop forever — the document-outbox rule)
   SEND    no txn, under timeout:
             push  → push_dispatch.dispatchToUser(org_id, user_id, { notification, data })
             email → emailUtils.sendTemplatedEmail({ to, event, data })   (only where the engine
                                                                           owns email — D-8)
   RECORD  one txn:  dispatch_status = 'sent' | 'failed',
                     push_sent_at / email_sent_at / delivered_at / last_error,
                     next_retry_at = now() + min(2^attempts, 60) minutes
```

Nothing below the request block can reach back into the business transaction. There is no shared
transaction, no shared lock, and no `await` on the request path.

### B.4 Database

#### B.4.1 Migration `00086-create-notifications.js`

Follows `00081` exactly: one transaction, `gen_random_uuid()` default, `VARCHAR` + `CHECK` never
native enum, CASCADE FKs, explicit index names.

```sql
CREATE TABLE notifications (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id           UUID         NOT NULL REFERENCES users(id)         ON DELETE CASCADE ON UPDATE CASCADE,
  actor_id          UUID         NULL     REFERENCES users(id)         ON DELETE SET NULL ON UPDATE CASCADE,
  event_key         VARCHAR(100) NOT NULL,
  category          VARCHAR(50)  NOT NULL,
  channels          TEXT[]       NOT NULL DEFAULT ARRAY['in_app']::text[],
  title             VARCHAR(255) NOT NULL,
  message           TEXT         NOT NULL,
  push_body         VARCHAR(240) NULL,          -- lock-screen-safe short form (D-13)
  metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  read_at           TIMESTAMPTZ  NULL,
  delivered_at      TIMESTAMPTZ  NULL,          -- first successful OUT-OF-APP delivery (D-4)
  deduplication_key VARCHAR(150) NULL,
  -- dispatch state (D-4 / D-5); mirrors task_notifications so the pattern is the repo's own
  dispatch_status   VARCHAR(20)  NOT NULL DEFAULT 'pending',
  attempts          SMALLINT     NOT NULL DEFAULT 0,
  max_attempts      SMALLINT     NOT NULL DEFAULT 5,
  next_retry_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error        TEXT         NULL,
  push_sent_at      TIMESTAMPTZ  NULL,
  email_sent_at     TIMESTAMPTZ  NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notifications
  ADD CONSTRAINT chk_notif_category CHECK (
    category IN ('leave','attendance','payroll','task','document','shift','employee','system')),
  ADD CONSTRAINT chk_notif_channels CHECK (
    array_length(channels, 1) BETWEEN 1 AND 3
    AND channels <@ ARRAY['in_app','push','email']::text[]),
  ADD CONSTRAINT chk_notif_dispatch_status CHECK (
    dispatch_status IN ('pending','processing','sent','failed','skipped')),
  ADD CONSTRAINT chk_notif_attempts CHECK (attempts >= 0 AND max_attempts > 0);
```

`actor_id` is `ON DELETE SET NULL`, not CASCADE: deleting the manager who approved a leave must not
delete the employee's notification about it. `user_id` is CASCADE — a notification cannot outlive its
recipient.

`down()` drops the table. That is **destructive** (every unread notification is discarded) and the
migration header must say so, in the style of `00081`.

#### B.4.2 `channels` as `TEXT[]`

Model side: `channels: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: ['in_app'] }`.
Validity is the database's job (the CHECK above) plus a catalog load-time assertion — not a Sequelize
`validate.isIn`, which does not work element-wise on arrays anyway.

#### B.4.3 Indexes

| Name | Definition | Serves |
|---|---|---|
| `notif_feed_idx` | `(user_id, org_id, created_at DESC)` | `GET /notifications` — the chronological feed and its `category` filter (category is filtered in the heap; the selectivity that matters is the user). |
| `notif_unread_idx` | `(user_id, org_id, created_at DESC) WHERE read_at IS NULL` | `GET /unread-count` and `?is_read=false`. A **partial** index: it holds only unread rows, so it stays small forever while the table grows. Strictly better than the brief's `(user_id, org_id, read_at, created_at DESC)`, which indexes every read row too. |
| `notif_dedup_unique` | `UNIQUE (user_id, org_id, deduplication_key) WHERE deduplication_key IS NOT NULL` | Idempotency. Partial, so the majority of rows (no dedupe key) pay nothing. |
| `notif_drain_idx` | `(next_retry_at) WHERE dispatch_status IN ('pending','processing')` | The drain's CLAIM. Partial — terminal rows leave the index, so the claim stays O(queue depth), not O(table). |
| `notif_retention_idx` | `(created_at)` | The retention sweeper. |

Deliberately **not** indexed: `event_key`, `category`, `org_id` alone. The brief's reference schema
indexes all three. None is ever queried without `user_id` leading, and three extra indexes on a
2.9 M-row/year table is write amplification for nothing.

### B.5 The event catalog

One file, `constants/notification_catalog.js`, authored exactly like the settings catalog
(`src/modules/settings/catalog/define_entry.js`): a `defineEvent()` factory with required fields,
conservative defaults, that **throws at require time** on a malformed entry — so a bad event fails
the boot, not a production dispatch.

```js
defineEvent({
  key: 'leave.approved',
  category: 'leave',                       // must be in the CHECK set
  channels: ['in_app', 'push'],            // default ['in_app']
  to: 'target_user',                       // target_user | reporting_manager | hr_plane | actor
  fallback: null,                          // e.g. 'hr_plane' when there is no manager
  notify_actor: false,                     // D-15
  dedupe: 'entity',                        // D-14: entity | entity_day | occurrence | null
  dedupe_entity: 'leave_id',               // which data key forms the dedupe key
  email_owner: null,                       // D-8: null = engine owns email; 'task_outbox' = don't
  hydrate: 'leave_request',                // which hydrator fills the template vars from data ids
  title: 'Leave approved',
  message: 'Your {{leave_type}} leave from {{from_date}} to {{to_date}} was approved by {{actor_name}}.',
  push_body: 'Your {{leave_type}} leave was approved.',        // short, lock-screen safe
  vars: ['leave_type', 'from_date', 'to_date', 'actor_name'],  // declared → testable
  deep_link: { screen: 'LeaveDetails', params: { id: '{{leave_id}}' } },
  push_data_keys: ['screen', 'id', 'event_key'],               // D-13 whitelist
})
```

#### B.5.1 Load-time invariants (asserted in the catalog's `index.js`, like the settings loader)

1. `key` is unique, ≤ 100 chars, and matches `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`.
2. `category` ∈ the CHECK set.
3. `channels` ⊆ `['in_app','push','email']`, non-empty, and **contains `in_app`** — a push-only
   notification that misses is unrecoverable.
4. `email` ∈ `channels` ⇒ `email_owner === null` **and** a `TEMPLATE_MAP` entry exists in
   `email.utils.js` for the event. Conversely `email_owner !== null` ⇒ `email ∉ channels` (D-8).
5. Every `{{var}}` in `title`, `message`, `push_body` or `deep_link` is declared in `vars`.
6. `push_data_keys` contains no key the catalog marks `sensitive` (D-13).
7. `dedupe !== 'occurrence'` ⇒ `dedupe_entity` is declared.
8. The longest possible rendered `deduplication_key` is ≤ 150 chars, and `push_body` ≤ 240.

Invariants 4, 5 and 6 are the ones that catch real mistakes, and all three are pure functions of the
catalog — so they are unit tests with no database (§F.1).

#### B.5.2 `CATALOG_VERSION`

A date-stamped constant (`'2026-10-24.1'`), exported and logged at boot, exactly as the settings
catalog does. It is what lets you tell which template a six-month-old row was rendered from.

#### B.5.3 Rendering

`notification_render.service.js`: one `interpolate(template, vars)` doing
`template.replace(/\{\{(\w+)\}\}/g, …)`. A missing variable does **not** render `{{employee_name}}`
to a user: it substitutes the declared fallback (default `''`), logs
`[notify.missing_var] event_key=… var=…`, and the §F.1 test asserts no shipped event can reach that
path with correctly-populated `data`.

#### B.5.4 Escaping (D-12)

`render()` returns **two** shapes and the caller cannot mix them up:

```js
{
  text: { title, message, push_body },   // raw — for the notifications row, in-app and push
  html: { title, message }               // every interpolated VALUE HTML-escaped — email only
}
```

The email leg of the drain uses `html` exclusively. `& < > " '` are escaped on the **values**, never
on the template, so template markup still works.

### B.6 Recipient resolution

`notification_recipient.service.js`. One function, four specs:

| `to` | Resolves to |
|---|---|
| `'target_user'` | `[ctx.target_user_id]` |
| `'reporting_manager'` | `UserReportingMapping.findAll({ user_id: target_user_id, org_id, is_active: true })` → `reporting_to_id[]`. Multiple active mappings all get notified. |
| `'hr_plane'` | Every user holding the `hr` role in the org (`UserRole` ⋈ `Role.key = 'hr'`). **Never** `admin` / `super-admin` — platform-plane roles hold no tenant data. |
| `'actor'` | `[ctx.actor_id]` — for "your bulk import finished" style confirmations. |

Rules, in order:

1. **Fallback, never silence (B.6.1).** `'reporting_manager'` with no mapping falls back to
   `'hr_plane'` when the catalog sets `fallback: 'hr_plane'`. A leave request with no manager must
   still reach somebody or it sits unapproved forever. Events without a declared fallback that
   resolve empty return `{ skipped: 'no_recipients' }` and log it.
2. **Bounded (B.6.2).** `'hr_plane'` is capped at `NOTIFICATION_MAX_FANOUT` (default 50). Beyond
   that the event is logged and truncated — a 500-HR org broadcast is `sendBulk`, a different path.
3. **Actor suppression (B.6.3 / D-15).** `user_id === ctx.actor_id` is dropped unless
   `notify_actor: true`.
4. **Active membership only (B.6.4 / D-16).** Every resolved id is filtered through
   `user_roles WHERE org_id = :org AND is_active = true AND deleted_at IS NULL` — the one tenant
   membership signal. A deactivated member receives nothing and no row is written.
5. **Deduplicated**, with **lowercased UUID comparison** — the letter-type work already hit a
   UUID-case `Set` mismatch; don't repeat it.

### B.7 Channel fan-out — the required transport changes

All three changes are **additive**: with the new parameter absent, byte-for-byte current behaviour.

**`fcm.transport.js`** — `send({ pushToken, data, notification, timeoutMs })`:

```js
// data-only (location wake-up) — UNCHANGED when `notification` is absent.
// with `notification` present:
{
  message: {
    token, data: stringData,
    notification: { title, body },
    android: { priority: 'high', notification: { channel_id: 'hrms_default' } },
    apns: {
      headers: { 'apns-priority': '10' },                   // 10, not 5 — a visible alert
      payload: { aps: { alert: { title, body }, sound: 'default', badge: <unread> } }
      // and NO `content-available: 1` — Apple throttles/rejects the combination
    }
  }
}
```

**`webpush.transport.js`** — currently `JSON.stringify({ type: 'LOCATION_REQUEST', ...data })`.
Becomes `JSON.stringify({ type: data.type || 'LOCATION_REQUEST', title, body, ...data })`, and the
location caller passes `type: 'LOCATION_REQUEST'` explicitly in its `data`. **Keeping
`'LOCATION_REQUEST'` as the default is what makes this non-breaking for the already-deployed service
worker** (decision 3 in §0.3). `urgency` stays `'high'` for location, `'normal'` for notifications.

**`push_dispatch.service.js`** — `dispatchToUser(orgId, userId, message, opts)` already takes
`message.data`; it starts forwarding `message.notification` to the transports. No other change.
`assertPushConfigured()` is **not** touched: push for notifications is gated by
`NOTIFICATION_PUSH_ENABLED`, and the engine degrades to in-app-only when the transports are
unconfigured. A notification system that refuses to boot because FCM is unset is worse than one that
writes in-app rows.

### B.8 Asynchronous execution and multi-instance safety

- **No new dependency.** `setImmediate` for the nudge, `node-cron` (already installed, already
  driving 28 crons) for the safety net.
- **Nudge, not queue.** `drain.nudge()` is debounced by an in-process flag: if a drain is already
  running, the nudge returns immediately. Concurrency is therefore 1 drain per process, bounded by
  `NOTIFICATION_DISPATCH_BATCH` rows per pass.
- **Multi-instance safe.** The CLAIM uses `lock: transaction.LOCK.UPDATE, skipLocked: true` —
  identical to `task_notification.repository.js:29-36`. Two app instances draining simultaneously
  claim disjoint row sets. This is not optional: production runs under PM2.
- **Crash recovery.** `notification_drain.service.runStartupCatchUp()` registered in the existing
  `setTimeout(…, 30000)` block in `src/server.js`, resetting `processing` rows older than 10 minutes
  back to `pending` — the exact query `task_notification.service.runStartupCatchUp` uses. Because
  attempts are consumed at claim, this cannot resurrect a poison row indefinitely.
- **Bounded sends.** Every transport call is wrapped in the `withTimeout` guard from
  `document_notification.service.js`, with `.unref()`'d timers, so a hung provider cannot stop Node
  exiting.

### B.9 Deduplication semantics (D-14)

| `dedupe` | Key | Use |
|---|---|---|
| `'entity'` | `{event_key}:{entity_id}` | Fires at most **once ever** per entity. `leave.approved`, `payroll.payslip_published`. |
| `'entity_day'` | `{event_key}:{entity_id}:{YYYY-MM-DD}` | At most once per entity per day. Reminders, overdue sweeps, expiry warnings. |
| `'occurrence'` | `NULL` | **Default.** Never suppressed. `task.reopened`, `task.comment_added`, anomalies. |
| `null` | `NULL` | Same as `'occurrence'`; spelled differently for readability. |

Dedupe is **per recipient**, because `user_id` leads the unique index. A fan-out to three managers
writes three rows with the same key — correct, and each is independently idempotent.

On conflict, `ignoreDuplicates: true` inserts nothing and raises nothing. `bulkCreate` returns rows
with a null `id` for the skipped ones; the dispatcher counts them as `skipped`, not `enqueued`.

### B.10 Payload hygiene (D-13)

1. `metadata` holds **routing only**: `{ screen, id, event_key }` plus declared ids. No amounts, no
   reasons, no third-party names, no document contents.
2. `push_body` is a separate, deliberately vaguer string. `payroll.payslip_published` may say in-app
   "Your payslip for September 2026 is ready"; no event's push body ever carries a figure, and §F.1
   asserts it by scanning every `push_body` and `push_data_keys` for value-bearing words.
3. The push `data` sent to FCM / Web Push is `pick(metadata, catalog.push_data_keys)` — a whitelist,
   not the whole JSONB.
4. The API never returns another user's row, and `actor_id` is projected as a **name** resolved at
   read time, never as a raw id a client could enumerate.

### B.11 Retention and volume (D-10)

`notification_retention_sweeper.cron.js`, **04:20 IST** (free: `pdf_cache_purge` is 04:15,
`attendance_punch_photo_sweeper` 04:40):

```sql
DELETE FROM notifications
 WHERE created_at < now() - (:retention_days || ' days')::interval
   AND (read_at IS NOT NULL OR dispatch_status IN ('sent','failed','skipped'))
```

Deleted in bounded chunks (`LIMIT 5000` in a loop with a per-pass ceiling) so it never takes a long
lock. Unread, undispatched rows are **never** purged by age alone. `NOTIFICATION_RETENTION_DAYS`
default 180.

### B.12 Environment variables

Every one goes into `.env.example` with its explanation and default, per the project rule.

| Variable | Default | Meaning |
|---|---|---|
| `NOTIFICATION_ENGINE_ENABLED` | `false` | Global kill switch. Off ⇒ `send()`/`enqueue()` return `{ skipped: 'disabled' }` immediately, the REST routes 503 `FEATURE_DISABLED`, the crons no-op. The engine is absent until this is on. |
| `NOTIFICATION_PUSH_ENABLED` | `false` | Fan out to push. Off (or transports unconfigured) ⇒ in-app rows only, `dispatch_status = 'skipped'`. |
| `NOTIFICATION_EMAIL_ENABLED` | `false` | Fan out to email for the events the engine owns (D-8). |
| `NOTIFICATION_DISPATCH_BATCH` | `50` | Rows claimed per drain pass. |
| `NOTIFICATION_DISPATCH_TIMEOUT_MS` | `8000` | Hard bound per channel send. |
| `NOTIFICATION_MAX_ATTEMPTS` | `5` | Column default; back-off `min(2^attempts, 60)` minutes. |
| `NOTIFICATION_MAX_FANOUT` | `50` | Ceiling on `'hr_plane'` recipients for one event (B.6.2). |
| `NOTIFICATION_PUSH_PER_USER_PER_MINUTE` | `20` | Storm brake. Over the ceiling the **push** is skipped; the in-app row is still written and still readable. |
| `NOTIFICATION_RETENTION_DAYS` | `180` | Retention sweeper horizon. |
| `NOTIFICATION_UNREAD_COUNT_CAP` | `100` | Capped badge count (D-11). |

### B.13 Explicitly out of scope

| Not in this plan | Why / when |
|---|---|
| Per-user mute / digest / quiet hours | Needs a `notification_preferences` table **and** a `notifications.*` settings-catalog group under `src/modules/settings/catalog/` — which the T-S2 parity test will require to match the owning Joi schema and model. Phase 6, separately planned. |
| WebSocket / SSE live feed | `nginx` in this repo sets `proxy_buffering on` and `Connection ""`, and auth is Bearer-only (`EventSource` cannot send a header). This was already a blocker on the location spec. Polling `unread-count` is the shipping answer. |
| Consolidating the task / document / payroll / billing email outboxes into the engine | Would change behaviour in four shipped modules. A follow-up project, not a prerequisite. |
| Platform-plane (`admin`/`super-admin`) notifications | `org_id` is `NOT NULL` by design. Would need a nullable-org variant and a separate inbox. |
| In-app grouping / threading / notification centre | Product has not asked. |
| SMS | `sms.utils.js` exists but no event in the catalog needs it. |

---

## Part C — REST API surface

Five endpoints, all under the existing `/api/v1/notifications` mount. Full request/response,
validation, error codes and examples are in
[`notification_api_contract.md`](notification_api_contract.md). Summary:

| # | Method & path | Notes |
|---|---|---|
| 1 | `GET /api/v1/notifications` | Paginated, `created_at DESC, id DESC` (a tiebreaker, or pagination over equal timestamps repeats rows — the lesson `task.service.js:59` already records). Filters `is_read`, `category`. |
| 2 | `GET /api/v1/notifications/unread-count` | Capped count, `{ unread_count, is_capped }`. |
| 3 | `PATCH /api/v1/notifications/:id/read` | Idempotent; already-read returns 200 unchanged. |
| 4 | `PATCH /api/v1/notifications/mark-all-read` | Watermarked, returns `updated_count`. |
| 5 | `DELETE /api/v1/notifications/:id` | Hard delete (table is `paranoid: false`). 404 on a foreign id. |

Route ordering: `GET /unread-count` and `PATCH /mark-all-read` are literal paths that **must** be
registered before any `/:id` route the module ever grows, or `/:id` captures them. There is no
collision today — note it in the routes file so there never is one.

Authorisation on all five: `authenticate` + `authorize(['employee','manager','hr','admin','super-admin'])`,
then **every** query is scoped `WHERE user_id = req.user.id AND org_id = req.user.orgId`. There is no
endpoint, parameter or filter by which one user can name another user's notification. A row that does
not match returns **404**, not 403 — consistent with the payroll HR-plane convention.

---

## Part D — Phases

### Phase 0 — Decisions and prerequisites (you)

| Step | Owner |
|---|---|
| Answer the five questions in §0.3 | You |
| Run migration `00081` (`notification_devices`) if still unrun — a **hard prerequisite** for any push | You |
| Decide whether the web service worker ships in the same release as the `webpush.transport` change | You |

**Verify:** §0.3 answered in writing; `npm run db:migrate:status` shows `00081` up.

### Phase 1 — Table, model, catalog, in-app REST APIs

No domain module is touched. The engine can be exercised end to end by seeding rows.

1. Migration `00086-create-notifications.js` → **handed back unrun**.
2. `models/notifications.model.js` (no `models.index.js` edit — §0.2(2)).
3. `constants/notification_catalog.js` + `notification_defaults.js`, Tier 1 events only, with the
   load-time invariants.
4. `repositories/notification.repository.js` — feed reads, capped count, scoped mark/dismiss.
5. `services/notification_read.service.js`, controller, validator, routes; mount in
   `notification.index.js`.
6. `.env.example` entries for all of §B.12.

**Verify:** `npm test` green, including the new catalog-invariant tests and a model-shape test — the
pattern `tests/unit/notification/notification_device_model_shape.test.js` already establishes, which
asserts the model's columns against the migration **without a database**.

### Phase 2 — Dispatcher, recipients, rendering, drain, push

1. `notification_recipient.service.js`, `notification_render.service.js`.
2. `notification_dispatcher.service.js` — `send` / `enqueue` / `sendBulk`.
3. `notification_drain.service.js` — CLAIM/SEND/RECORD + `runStartupCatchUp`.
4. Additive `notification` support in `fcm.transport.js`, `webpush.transport.js`,
   `push_dispatch.service.js`; `type` parameterised with the `LOCATION_REQUEST` default.
5. `cron-jobs/notification_dispatch.cron.js` (60 s) + registration in `src/server.js`.
6. **Zero** domain hooks yet. The dispatcher is exercised by unit tests only — not by a real HR flow.

**Verify:** unit tests prove (a) `send()` with a throwing repository does not reject; (b) `enqueue()`
with a failing insert leaves the parent transaction committable; (c) a duplicate dedupe key inserts
nothing and raises nothing; (d) the claim passes `skipLocked`; (e) `fcm.transport` with no
`notification` argument emits a message byte-identical to today's.

### Phase 3 — Tier 1 hooks

One line per call site, listed exhaustively with file and function in the
[event catalog](notification_event_catalog.md) §T1. Leave → attendance → payroll → task, in that
order, each a separate commit so a regression is bisectable.

**Verify:** the existing suites for each touched module stay green (`leave`, `attendance`, `payroll`,
`task` under `tests/unit/`), plus one new test per hook asserting the hook is called **after**
`commit` and that a dispatcher throw does not fail the business call.

### Phase 4 — Tier 2 hooks

Overtime, comp-off, shift/roster, bank-detail verification, profile-change approval.

### Phase 5 — Tier 3 crons

Punch reminders, document expiry, org broadcast, birthday/anniversary — all `sendBulk`, all
`dedupe: 'entity_day'`, all behind the engine kill switch. Plus the retention sweeper.

### Phase 6 — Follow-ups (separately planned)

Per-user preferences + settings-catalog group; outbox consolidation; an `md_updates` change record
for every frontend-visible contract change made along the way.

---

## Part E — Before and after

### E.1 `leave_approval.service.js` → `rejectRequest` (lines 254-288 today)

**Before**

```js
    } else {
      throw new BadRequestError(`Cannot reject a request with status: ${request.status}`)
    }

    await transaction.commit()
    return request
  } catch (error) {
    await transaction.rollback()
    throw error
  }
```

**After** — two lines, one of them the `require` at the top of the file.

```js
    } else {
      throw new BadRequestError(`Cannot reject a request with status: ${request.status}`)
    }

    await transaction.commit()
    void notificationDispatcher.send('leave.rejected', { org_id: orgId, actor_id: approverId, target_user_id: request.user_id, data: { leave_id: request.id, rejection_reason: rejectionReason } })
    return request
  } catch (error) {
    await transaction.rollback()
    throw error
  }
```

No recipient lookup, no template, no channel, no `await`, no `try/catch`. The `void` is deliberate and
is the whole safety argument: the promise is never awaited, so nothing it does can delay or fail the
response, and `send()` cannot throw synchronously either.

Note what is **not** in `data`: no employee name, no leave type, no dates. The renderer hydrates
those from `leave_id` via the catalog's declared `hydrate: 'leave_request'` — which is what keeps the
call site at one line and keeps the business service free of presentation concerns. The hydrators
live in the notification module.

### E.2 `payslip.service.js` → `publish` (D-9, bulk)

After `await t.commit()` (line 614 today):

```js
      await t.commit()
      void notificationDispatcher.sendBulk('payroll.payslip_published', { org_id: orgId, actor_id: actor.actorId, recipients: publishedUserIds.map(user_id => ({ user_id, data: { period_month: run.period_month } })) })
      return { run_id: run.id, ... }
```

`publishRun` already knows which users it released; returning the id list alongside the count is a
one-line repository change **inside the payroll module**, not a notification concern. One
`bulkCreate` chunked at 500, one nudge — not 3 000 round trips.

### E.3 `regularization.service.js` → `submitRequest` (notify the manager)

```js
      await transaction.commit()
      void notificationDispatcher.send('attendance.regularization_requested', { org_id: orgId, actor_id: userId, target_user_id: userId, data: { request_id: request.id, date: data.date } })
```

`target_user_id` is the **employee** even though the recipient is the manager: `target_user_id` names
the *subject* of the event, and the catalog's `to: 'reporting_manager'` is what turns the subject into
recipients. The call site never reads `UserReportingMapping`.

---

## Part F — Test strategy

Node's built-in runner (`node --test`, `tests/unit/**/*.test.js`), no database, following the existing
`tests/unit/notification/*` seams.

### F.1 Catalog (pure, no DB, no mocks) — `notification_catalog.test.js`

| Test | Asserts |
|---|---|
| T-N1 | Every event satisfies all eight load-time invariants of §B.5.1. |
| T-N2 | Every `{{var}}` in every template is declared in `vars` (invariant 5). |
| T-N3 | No event with `email` in `channels` has a non-null `email_owner`, and every one has a `TEMPLATE_MAP` entry in `email.utils.js` (D-8). **This is the double-send guard.** |
| T-N4 | No `push_body` or `push_data_keys` entry matches `/amount\|net\|gross\|salary\|reason\|ctc/i` (D-13). |
| T-N5 | The longest possible `deduplication_key` for every event is ≤ 150 chars. |
| T-N6 | Every event's `category` is in the migration's CHECK set — the catalog↔DDL drift guard. |
| T-N7 | `CATALOG_VERSION` matches `^\d{4}-\d{2}-\d{2}\.\d+$`. |

### F.2 Dispatcher — `notification_dispatcher.test.js`

| Test | Asserts |
|---|---|
| T-N8 | `send('nope.nope', ctx)` resolves `{ skipped: 'unknown_event' }` and does not throw. |
| T-N9 | `send()` with a repository that throws resolves and does not reject (**transaction decoupling, part 1**). |
| T-N10 | `enqueue()` whose inner insert throws leaves the parent transaction usable — a subsequent write on the parent succeeds and the parent commits (**part 2, the savepoint proof**). |
| T-N11 | `send()` performs no work in the caller's tick: the repository is untouched before the next `setImmediate` turn. |
| T-N12 | A second `send()` with the same dedupe key reports `skipped`, and `ignoreDuplicates` is passed. |
| T-N13 | `actor_id === target_user_id` with `notify_actor: false` ⇒ `{ skipped: 'no_recipients' }`, no row. |
| T-N14 | A deactivated member (`user_roles.is_active = false`) is dropped from the recipient set. |
| T-N15 | `'reporting_manager'` with no mapping and `fallback: 'hr_plane'` resolves to HR; without a fallback it skips and logs. |
| T-N16 | `'hr_plane'` resolving 80 users is truncated to `NOTIFICATION_MAX_FANOUT`. |
| T-N17 | `sendBulk` with 1 200 recipients issues 3 chunked `bulkCreate` calls, not 1 200 inserts. |
| T-N18 | `NOTIFICATION_ENGINE_ENABLED=false` ⇒ `{ skipped: 'disabled' }`, no repository call. |

### F.3 Drain — `notification_drain.test.js`

| Test | Asserts |
|---|---|
| T-N19 | CLAIM passes `lock: LOCK.UPDATE` **and** `skipLocked: true`. |
| T-N20 | Attempts are incremented **at claim**, before the send. |
| T-N21 | A send timeout records `failed` with a back-off of `min(2^attempts, 60)` minutes and never throws out of the drain. |
| T-N22 | Rows with `attempts >= max_attempts` are not claimed. |
| T-N23 | `channels === ['in_app']` rows are inserted as `sent` and never claimed. |
| T-N24 | Push disabled ⇒ `dispatch_status = 'skipped'`, `delivered_at` null, in-app row intact. |
| T-N25 | `last_error` is sanitised — no provider token, no email address, no stack (the `redactError` discipline from the document outbox). |

### F.4 Transports (regression guard) — extends `push_dispatch.test.js`

| Test | Asserts |
|---|---|
| T-N26 | `fcm.transport.send` with no `notification` argument produces a message deep-equal to today's data-only shape (`apns-priority: '5'`, `content-available: 1`). **Protects the location feature.** |
| T-N27 | With `notification`, `apns-priority` is `'10'`, `aps.alert` is set, and `content-available` is absent. |
| T-N28 | `webpush.transport.send` with no `type` in `data` still emits `type: 'LOCATION_REQUEST'`. |

### F.5 Read APIs — `notification_read_api.test.js`

| Test | Asserts |
|---|---|
| T-N29 | Feed order is `created_at DESC, id DESC`. |
| T-N30 | Every read/write is scoped by both `user_id` and `org_id`; a foreign id 404s. |
| T-N31 | Query params are validated in the **controller** (`validateOrThrow(schema, req.query)`) and `req.query` is never assigned (Express 5 — D-20). |
| T-N32 | `unread-count` caps at `NOTIFICATION_UNREAD_COUNT_CAP` and sets `is_capped`. |
| T-N33 | `mark-all-read` applies a `created_at <= :now` watermark and returns `updated_count`. |

### F.6 Hook tests (Phase 3, one per call site)

For each hooked service: the dispatcher is called exactly once, **after** `commit`, with the right
`event_key` and `target_user_id`; and a dispatcher that rejects does not change the method's return
value or leave a rolled-back business transaction.

---

## Part G — Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | The transport change breaks the deployed on-demand location feature | **CRITICAL** | T-N26 / T-N28 pin today's exact wire shape; `LOCATION_REQUEST` stays the default `type`; the change is additive-only. |
| R-2 | Double emails to employees for task/document/payroll events | **HIGH** | D-8 + T-N3 makes it a build failure, not a production surprise. |
| R-3 | A notification bug rolls back a payroll or leave transaction | **HIGH** | `void send()` after commit (nothing left to roll back) + savepoint on `enqueue()` + T-N9/T-N10. |
| R-4 | Lock-screen leak of pay or medical data | **HIGH** | Whitelisted `push_data_keys`, separate `push_body`, T-N4. |
| R-5 | `publish()` on a 3 000-employee run times out the HTTP request | **HIGH** | `sendBulk` + chunked `bulkCreate` + T-N17. |
| R-6 | Two PM2 instances double-send every push | **HIGH** | `FOR UPDATE SKIP LOCKED` claim + T-N19. |
| R-7 | Table growth degrades the feed | MEDIUM | Partial indexes + retention sweeper + capped badge count. |
| R-8 | Notifications silently lost on a crash between commit and insert | MEDIUM | Accepted for Tier 2/3; `enqueue()` available for the Tier 1 events you promote (§0.3 decision 1). |
| R-9 | HTML injection into manager inboxes via employee-controlled strings | MEDIUM | Two-shape renderer, escaping at the email boundary, T-N2. |
| R-10 | Notification storm from a bulk HR action | MEDIUM | `NOTIFICATION_PUSH_PER_USER_PER_MINUTE` drops push only; the in-app row is always written. |
| R-11 | Catalog / DDL drift (a new category that fails the CHECK) | MEDIUM | T-N6, in the spirit of the settings T-S2 parity test. |
| R-12 | `00081` never run ⇒ push silently reaches nobody | MEDIUM | Phase 0 gate; the engine logs `attempted: 0` per dispatch, which the runbook tells the operator to look for. |

---

## Appendix — rules this plan is bound by

- Migrations are **handed back unrun**; no connectivity check is run against the remote database.
  Correctness is established statically and by unit tests.
- Any frontend-visible contract change (the five new endpoints, the Web Push payload shape) needs a
  dated change record in `public/md_updates/` **at implementation time**, not now.
- Every new environment variable goes into `.env.example` with an explanation and a default.
- Phases 1–5 add **no** key to `src/modules/settings/catalog/`, so the T-S2 parity test is
  unaffected. Phase 6's preferences work **will** need a catalog file and a group.
