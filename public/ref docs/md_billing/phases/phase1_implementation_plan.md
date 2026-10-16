# Organization Module — Phase 1 Implementation Plan
### Subscription, Payments, Invoicing & Plan Lifecycle

> **Status:** Source of truth for the subscription/billing build. Plan only — no code is written by this document.
> **Module:** `src/modules/billing/` (models already exist there) + two touch-points in `src/modules/organization/`.
> **Predecessor docs:** `public/md_organization/1_org_registration_api.md` (the only live purchase path today), `public/md_core-workflows/billing-and-entitlements.md` (aspirational — see §2 fact 12).
> **Structural reference:** `public/md_payrolls/phases/phase6_implementation_plan.md`, `public/md_documents/phases/phase4_implementation_plan.md`, `public/md_pdf-generation/phases/phase1_implementation_plan.md`. Naming, section shape, decision/edge-case numbering and the operator hand-back convention are copied from those. **Technical decisions are not.**

**Why this file is `phase1_*` in a module that already has six shipped API docs:** the numbered files in `public/md_organization/` (`1_org_registration_api.md` … `6_org_profile_management_api.md`) are **API contract documents**, the peer of `public/md_payrolls/combined_api_analysis.md`. They are not phases. `public/md_organization/phases/` is created by this document and follows the payroll/documents/pdf convention exactly: `phases/phase{N}_implementation_plan.md`. This is the org module's first *phased* build, so it is Phase 1. Internally it is sequenced as Steps 0–6 (§24).

**Counters at plan time (verified against the tree, not the docs):**

| Counter | Value | Verified from |
|---|---|---|
| Next endpoint number | **#225** | `public/md_system/api_registry.md` highest row is `224`; PDF Phase-5 statutory/bank-advice/F&F closed at #224 |
| Next migration | **`00065`** | last on disk is `00064-create-seeder-meta-table.js` (DevOps, 2026-10-01). *Renumbered from 00064 on 2026-10-01 - the DevOps work took that slot.* |
| Next org-settings registry entry | **#97** | `public/md_settings/org_settings_registry.md` ends at #96 |
| Decision IDs | **D-B1 …** | new `D-B*` namespace; payroll owns `D-1…D-x`, documents owns its own. No collision. |
| Edge-case IDs | **EC-B1 …** | same reasoning |
| Test baseline | **2490 passing / 0 failing** | `npm test` (`node --test "tests/unit/**/*.test.js"`), 70.2 s, run at plan time |
| New dependencies | **zero** | `razorpay@2.9.8`, `redis`, `node-cron`, `joi`, `dayjs`, `sequelize` are all present |

---

## 0. How this plan was derived (scope reconstruction)

The prompt asked for "complete subscription lifecycle management." The tree already contains **six billing tables, six repositories, one service, two middlewares, a Razorpay provider and a raw-body webhook mount** — but only **one** lifecycle transition is implemented end to end: *first purchase, during organization registration*. Everything else (renewal, upgrade, downgrade, cancellation, expiry, refund, invoice, history, webhooks) is absent.

So this is **not** a greenfield build. It is:

1. a **repair** of the existing purchase path, which contains four defects that make it unsafe to extend (§3);
2. an **extension** of the three existing tables into a real lifecycle spine, plus three new tables;
3. a **new read plane and money plane** on top, in the module where the models already live.

The scope-reconstruction table:

| Capability asked for | State in the tree today | This plan's action |
|---|---|---|
| Plan purchase | **Exists**, but only bundled inside org registration (`organization.service.initiateRegistration`), and only for a brand-new org | **Repair + generalise.** Extract settlement into `billing`; registration calls it. Existing paths and response shapes preserved. |
| Active-plan details | Nothing. `requireSubscription` builds a `req.subscription` object nobody reads | **New** — #226 |
| Subscription history | `org_subscriptions` rows accumulate but are never read back; old rows are set to `canceled` with no reason, no `ended_at` | **New table column set + #227 / #228** |
| Payment history | `transactions` rows exist; no read API at all | **New** — #229 / #230 |
| Renewal | Absent. `current_period_end` is **written as NULL** on every row, so nothing has ever expired | **New** — #232 + expiry cron + backfill |
| Upgrade / downgrade | Absent | **New** — #232 (upgrade, prorated) / #237 (downgrade, scheduled) |
| Cancellation | `cancel_at_period_end` column exists, is never set and never read | **New** — #235 / #236 |
| Expiry | `expired` / `past_due` enum values exist and are unreachable | **New** — `subscription_expiry.cron` |
| Failed / pending payments | `failed` enum value exists; **no code path ever writes it** | **New** — webhook + reconciler |
| Refunds | `createRefund()` exists in the provider, is called by nothing, and **under-refunds by 100×** (§3, D-crit-3) | **Partial by design (D-B14):** fix the bug, ingest refunds via webhook + reconciler. **No refund-initiation API in this phase.** |
| Transaction / payment detail | No read surface | **New** — #230 |
| Invoice information | Nothing | **New** — invoice number + snapshot on the settled transaction, projected by #231. **No invoice table** (D-B7). |
| Subscription start/end dates | `current_period_start` defaults to `NOW()`; `current_period_end` is NULL everywhere | **Repaired + backfilled** (§22) |
| Complete historical records | Price is read live off `subscription_plans`; deactivating a plan **breaks every org on it** (D-crit-4) | **New `plan_snapshot` on subscription + transaction; new `subscription_events` ledger** |
| Webhooks | `app.js:36` mounts `express.raw()` on `/webhooks/razorpay`. **No route is registered there.** A POST to it 404s. | **New** — #239 + `billing_webhook_events` inbox + drain cron |

**Net:** 3 new tables, 3 altered tables, 1 migration, 15 new endpoints (#225–#239), 3 crons, 2 org-settings entries, 4 security fixes, 0 new dependencies.

---

## 1. Goal & Boundary

### 1.1 Goal

Make an organization's commercial relationship with the platform **deterministic, auditable and impossible to forge from the client**, and make it survive the failure modes a payment system actually sees: a user who closes the tab after paying, a webhook that arrives twice, a webhook that arrives before the client callback, a gateway that times out after charging, and a plan whose price changes two years after a customer bought it.

Four properties define "done":

1. **Money is never trusted from the client.** Amount, plan, entitlement and payment outcome are all derived server-side and cross-checked against the gateway. A forged request cannot activate a subscription. *(Today it can — §3, D-crit-1.)*
2. **A settled payment always produces exactly one subscription extension**, whichever of the three concurrent settlement sources (client callback, webhook, reconciler) wins the race.
3. **A historical financial record is immutable and self-describing.** Reading a 2024 payment must not require joining to a 2026 `subscription_plans` row.
4. **No transition is implicit.** Every status change is written to `subscription_events` with actor, reason and `from → to`, inside the same transaction as the change.

### 1.2 Explicitly in scope

* Repair of the four defects in §3, which are prerequisites, not nice-to-haves.
* Migration `00065`: alter `transactions`, `org_subscriptions`, `organization_profiles`; create `subscription_events`, `subscription_refunds`, `billing_webhook_events`, `billing_invoice_sequences`.
* One settlement service used by **all three** entry points (registration verify, checkout verify, webhook) and the reconciler.
* Purchase / renewal / upgrade via one `checkout` endpoint; downgrade as a scheduled change; cancellation with period-end and immediate modes.
* Read plane: current subscription, subscription history, event ledger, payment history, payment detail, invoice.
* Razorpay webhook receiver with signature verification, an at-least-once-safe inbox, and a drain worker.
* Reconciliation cron (the safety net for "the user paid and closed the tab").
* Expiry / grace / scheduled-change cron, with expiry-warning emails.
* Entitlement evaluation that actually respects the subscription period.

### 1.3 Explicitly NOT in scope — and why

| Deferred | Why |
|---|---|
| **Refund-initiation API** | A refund is a *seller* action, and the tenant plane must never hold it. A platform plane for it does not exist (`admin`/`super-admin` are deliberately excluded from all tenant data — see `role_planes.js` and memory `role-planes-tenant-vs-platform`). Finance issues refunds from the Razorpay dashboard; we **ingest** them. **D-B14.** |
| **Razorpay Subscriptions API / auto-debit mandates (eMandate, UPI Autopay)** | We integrate `orders` + `payments` only. Every renewal is therefore *customer-initiated*. This single fact removes an entire class of states (`past_due`, dunning, retry schedules) — see D-B5. Adding auto-debit is a separate phase with its own webhook set. |
| **Invoice PDF** | The PDF module (`src/infrastructure/pdf-renderer/`, `src/common/services/pdf_render.service.js`) can render one from the #231 JSON with a new template. Out of scope here; #231 returns the complete dataset a template would need. |
| **Multi-currency** | `createRazorpayOrder` hard-rejects anything but INR. Every plan seeded is INR. Currency stays a column, not a feature. |
| **Coupons / discounts / credit balances** | Not requested. `discount_amount` is provisioned as a column so a later phase does not need a second migration, but it is always `0.00` in this phase and no code writes it. **D-B8.** |
| **Per-seat / metered billing** | Plans are flat-rate with seat *ceilings* (`max_employees` / `max_managers` / `max_hrs`). Nothing in the tree meters usage. |
| **Self-serve plan CRUD** | Plans are seeded (`002-seed-subscription-plans.js`). A plan admin UI is a platform-plane concern. |
| **Dunning emails / card-expiry notices** | No stored instrument. Nothing to dun. |
| **Changing `organizations.status` on expiry** | Deliberate and load-bearing — see D-B4. |

### 1.4 Boundary statements

* **This plan does not change the two existing onboarding endpoints' request or response shapes** (`POST /register/initiate`, `POST /register/verify-payment`). It changes what they *enforce* (signature verification becomes real) and what they *write* (period end, snapshot, event rows). Both are announced in the change record (§23).
* **This plan does not touch the payroll, document, attendance or leave modules.** It touches `entitlement.service.js` and `subscription.middleware.js`, which every one of those modules depends on. That is the largest blast radius in the plan and is handled in §22.
* **Engine/no-op guarantee:** no endpoint outside `/api/v1/billing` changes its response body.

---

## 2. Pre-Flight Checks

Twenty-two facts established by reading the tree at plan time. Each is load-bearing below. **Re-verify 1, 2, 3 and 21 immediately before Step 0; the rest are structural.**

1. **Endpoint numbering ends at #224.** `public/md_system/api_registry.md`, highest `#` column value. This phase numbers **#225–#239**.
2. **Latest migration is `00064`.** This phase is **`00065`**. Note the unrun backlog recorded in project memory (00047, 00048, 00050, 00051, 00052, 00053, 00055, 00056, 00060, 00061, 00062, 00063, 00064 and seeders 010/011/012 are handed back but not confirmed applied). **`00065` must be authored so it is order-independent of every unrun migration above it** — it touches only `transactions`, `org_subscriptions`, `organization_profiles` (all created by `00003`/`00007`/`00008`/`00010`) and creates four new tables. It has no dependency on any migration after `00014`.
3. **`npm test` → 2490 passing / 0 failing.** This phase must not reduce that number.
4. **The billing module has models, repositories and one service — and no controllers, routes, validators or `billing.index.js`.** `src/modules/billing/` contains `models/` (6), `repositories/` (6), `services/entitlement.service.js`. It is **not mounted in `src/app.js`**. Adding `require('./modules/billing/billing.index')(app)` is a new line, not a refactor.
5. **`src/app.js` mounts `app.use('/webhooks/razorpay', express.raw({ type: 'application/json' }))` — no router is ever attached to that path, AND the mount is in the wrong position.** `express.json()` is registered on line 33, the raw parser on line 35. Because `express.json()` is global and runs first, it consumes the stream and sets `req._body = true`, so `express.raw()` short-circuits and `req.body` arrives as a parsed object, never a `Buffer`. **Signature verification over the raw payload is therefore impossible as currently wired**, and re-serialising with `JSON.stringify` does not reproduce the signed bytes. Step 4 must move the raw mount **above** `express.json()`. *(Corrected 2026-10-01 — an earlier revision of this plan asserted the ordering was already correct. See `public/md_system/devops_production_deployment_plan.md` §3.17.)*
6. **`verifyRazorpaySignature` returns `true` unconditionally.** `src/infrastructure/razorpay/razorpay.functions.js` — the comparison line is commented out and replaced by `return true`. See §3.
7. **The caller does not enforce the result either.** `organization.service.verifyPayment` computes `isValidSignature` and the entire `if (!isValidSignature) { … }` block is commented out. The variable is assigned and never read.
8. **`transactions.provider_order_id` is indexed but NOT unique** (`00008`, `addIndex` without `unique: true`). `findByProviderOrderId` does `findOne` and will return an arbitrary row if two ever collide.
9. **There is no constraint limiting an org to one active subscription.** `00010` indexes `org_id` and `status` separately, neither unique. `deactivateActiveSubscriptions` + `createSubscription` is a read-modify-write with no lock on the org.
10. **`current_period_end` is written as NULL on every code path.** Free plan: `createSubscription({org_id, plan_id, transaction_id: null, status:'active'})`. Paid plan: the same four keys. The column defaults to nothing. **Every subscription in production today has `current_period_end IS NULL`.** This is the single most important fact for §22.
11. **`org_subscriptions.status` enum is `('active','past_due','canceled','expired')`** — American single-`l` `canceled`. `past_due` and `expired` are written by nothing. `canceled` is written only by `deactivateActiveSubscriptions`.
12. **`public/md_core-workflows/billing-and-entitlements.md` §3 describes webhook signature verification and idempotency as if implemented.** It is aspirational. The doc must be corrected as part of §28 — a future reader will otherwise assume the protection exists.
13. **`entitlement.service.hasFeature` reads `findActiveByOrgId` (status `'active'` only) and never looks at dates.** A subscription whose period ended in 2024 still entitles today. Its DB-unreachable → 503 handling (added 2026-09-24) is correct and is **preserved verbatim**.
14. **`subscription.middleware.requireSubscription` calls `subscriptionPlanRepository.findById(planId)`, which filters `is_active: true`, and throws `500 PLAN_NOT_FOUND` when it misses.** Deactivating any plan therefore 500s every `POST /organizations/users/invite` for every org on that plan. See §3, D-crit-4.
15. **`requireSubscription` is used on exactly three routes**, all in `invitation.routes.js`: invite (with `checkLimit`), revoke, resend. Nothing else in the tree uses it.
16. **`requireFeature` is used on ~30 routes** across attendance and documents (`router.use(requireFeature('attendance.access'))`, `requireFeature('documents.access')`). Payroll uses `requireFeature('payroll.access')`. Any change to entitlement semantics reaches all of them.
17. **Money elsewhere in the codebase is `DECIMAL(n,2)` rupees, not paise.** `payroll_run_items` uses `DECIMAL(14,2)` throughout; `subscription_plans.amount` and `transactions.amount` are `DECIMAL(10,2)`. Razorpay is paise-native. → **D-B6.**
18. **`AppError(status, message, errorCode, details)`** and `errorHandlerMiddleware` already: guard `res.headersSent`, emit `details`, and set `Retry-After` when `details.retry_after_seconds` is an integer. A 429 from `checkOrgRate` therefore already carries a correct `Retry-After`. Nothing new is needed.
19. **`checkOrgRate(orgId, bucket, limit, opts)`** (`src/common/utilities/org_rate_limit.utils.js`) is a generic fixed-window Redis limiter that **fails open** — but its key is hard-coded as `` `pdf:${bucket}:…` ``. Reusing it for billing would write billing counters under a `pdf:` namespace. → **D-B13.**
20. **The cron pattern is `cron.schedule(expr, fn, { timezone: 'Asia/Kolkata' })`**, one bare module per job in `src/cron-jobs/`, `require`d from `src/server.js` **only when `os.platform() === 'linux'`**. Twenty jobs are registered today. Startup catch-up is a separate `runStartupCatchUp()` called from a 30 s `setTimeout`. None of the existing crons takes a distributed lock; they rely on per-row atomic claims.
21. **`RAZORPAY_WEBHOOK_SECRET` does not exist.** Env vars present: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. The webhook secret is a *different* secret configured in the Razorpay dashboard and must be added. `razorpay.config.js` already throws at module load if the key pair is missing — the same guard extends to the webhook secret.
22. **Static migration verification is an established test pattern.** `tests/unit/organization/invitation_ledger_migration.test.js` drives `up()`/`down()` against a recording `queryInterface` that touches no database, and asserts model↔migration column parity plus the presence of a named partial unique index. This is how `00065`'s constraints are verified given that **the operator runs migrations and this environment has no DB access** (memory: `user-runs-migrations-no-db-access`).

---

## 3. Defects in the existing billing path — found, and fixed by this phase

These are not future work. Each one makes the lifecycle unsafe to extend, so each is a **Step 0 / Step 1** item.

### D-crit-1 — payment signature verification is disabled (CRITICAL, exploitable today)

`src/infrastructure/razorpay/razorpay.functions.js`:

```js
const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')

// return expectedSignature === signature
  return true
```

The HMAC is computed and discarded. **And** `organization.service.verifyPayment` has its rejection branch commented out, so even restoring the function would change nothing.

**Impact:** any authenticated `guest` who calls `POST /organizations/register/initiate` receives a real `order_id`, then calls `POST /organizations/register/verify-payment` with `{ razorpay_order_id: <that id>, razorpay_payment_id: "anything", razorpay_signature: "anything", org_id: <theirs> }` and receives an **activated organization, an HR role and an HR-context JWT — without paying**. Two HTTP calls. No rate limit on the path.

**Fix (Step 0):** restore the comparison using `crypto.timingSafeEqual` over equal-length buffers (a plain `===` on a hex string is a timing oracle, and `timingSafeEqual` throws on length mismatch, so compare lengths first and return `false`). Restore the caller's rejection branch **and** its `payment_verification_audits` write. Then go further: the signature is necessary but not sufficient — §11.3 adds a mandatory gateway cross-check.

### D-crit-2 — refunds are issued at 1/100th of the requested amount (CRITICAL, latent)

```js
const amountInPaise = Math.round(Number(amount) * 100)
if (amountInPaise < 100) { throw … }
const refund = await razorpayClient.payments.refund(paymentId, {
  amount,            // ← rupees, not amountInPaise
  speed: 'optimum', …
})
```

`amountInPaise` is computed, used for the floor check, then **not passed**. Razorpay interprets `amount` as paise. A ₹990 refund refunds ₹9.90.

Latent only because nothing calls `createRefund` yet. **Fix (Step 0):** pass `amountInPaise`. Add a unit test asserting the value handed to the client is `Math.round(rupees * 100)`.

### D-crit-3 — no uniqueness on `provider_order_id` / `provider_payment_id`

Settlement is keyed on `findByProviderOrderId → findOne`. With a non-unique index, two rows sharing an order id make settlement pick one arbitrarily; the other stays `pending` forever and its subscription is never created. Nothing today *creates* a duplicate, but `00065` adds three new writers (checkout, webhook, reconciler), and hope is not a constraint.

**Fix (Step 1, migration `00065`):** partial unique indexes on `provider_order_id` and `provider_payment_id` where not null. **Operator pre-flight:** the migration must first run a duplicate check and abort with a readable message rather than failing on index creation (§22.1).

### D-crit-4 — deactivating a plan 500s every org on it

`subscriptionPlanRepository.findById` filters `is_active: true`. `requireSubscription` treats a miss as `500 PLAN_NOT_FOUND`. So the moment the platform retires `starter_monthly`, every org still on it gets a 500 on invite/revoke/resend — a *historical-integrity* failure surfacing as an outage.

**Fix (Step 1):** split into `findById(id)` (unfiltered — for historical resolution) and `findActiveById(id)` / `findActiveByCode(code)` (for purchase). `requireSubscription` and every historical read use the unfiltered one. Independently, §5.2 removes the dependency entirely for reads by snapshotting the plan onto the subscription.

### D-crit-5 (observation, **not fixed here**) — floating-point money

`Number(plan.amount) * 100` on a `DECIMAL(10,2)` string is float arithmetic. At the current price points it is exact; at ₹1,00,000.05 it would not be. D-B6 confines all rupee→paise conversion to one audited pure function with integer rounding and an exactness assertion, which removes the hazard for new code. **Pre-existing call sites elsewhere in the codebase are left alone** (CLAUDE.md: do not modify unrelated files).

---

## 4. Directory Structure

### 4.1 New files

```
src/modules/billing/
├── billing.index.js                              NEW  (mounts /api/v1/billing; registered in app.js)
├── controllers/
│   ├── subscription.controller.js                NEW  (#225–#228, #232–#238)
│   ├── payment.controller.js                     NEW  (#229–#231)
│   └── webhook.controller.js                     NEW  (#239 — raw body, no auth)
├── routes/
│   ├── plan.routes.js                            NEW  (#225)
│   ├── subscription.routes.js                    NEW  (#226–#228, #232–#238)
│   ├── payment.routes.js                         NEW  (#229–#231)
│   └── webhook.routes.js                         NEW  (#239 — mounted separately at /webhooks/razorpay)
├── validators/
│   ├── subscription.validator.js                 NEW
│   └── payment.validator.js                      NEW
├── models/
│   ├── subscription_events.model.js              NEW
│   ├── subscription_refunds.model.js             NEW
│   ├── billing_webhook_events.model.js           NEW
│   └── billing_invoice_sequences.model.js        NEW
├── repositories/
│   ├── subscription_event.repository.js          NEW
│   ├── subscription_refund.repository.js         NEW
│   ├── billing_webhook_event.repository.js       NEW
│   └── invoice_sequence.repository.js            NEW
├── services/
│   ├── subscription.service.js                   NEW  (read plane + cancel + schedule-change + preview)
│   ├── checkout.service.js                       NEW  (quote → order → pending transaction)
│   ├── settlement.service.js                     NEW  ★ the single settlement chokepoint
│   ├── billing_webhook.service.js                NEW  (ingest + drain)
│   ├── billing_reconciliation.service.js         NEW  (pending sweep, refund sweep)
│   ├── subscription_lifecycle.service.js         NEW  (expiry / grace / scheduled change; cron entry)
│   └── billing_notification.service.js           NEW  (email emit, deduped on subscription_events)
└── utils/
    ├── money.utils.js                            NEW  PURE  (toPaise / fromPaise / assertExact)
    ├── billing_period.utils.js                   NEW  PURE  (period end from cycle; grace; renewal anchor)
    ├── proration.utils.js                        NEW  PURE  (upgrade delta)
    ├── subscription_state.utils.js               NEW  PURE  (both transition tables + guards)
    ├── plan_snapshot.utils.js                    NEW  PURE  (plan row → frozen snapshot)
    ├── invoice_number.utils.js                   NEW  PURE  (format + FY derivation)
    └── billing_defaults.js                       NEW       (constants: grace, TTLs, batch sizes, events)

src/common/utilities/
└── idempotency.utils.js                          NEW  (Redis SETNX replay guard — §12.1)

src/cron-jobs/
├── subscription_lifecycle.cron.js                NEW  (daily 00:20 IST)
├── billing_webhook_drain.cron.js                 NEW  (every 5 min)
└── billing_reconciliation.cron.js                NEW  (hourly, :10)

src/common/templates/
└── billing_notification.html                     NEW  (one shell, per-event subject — document_notification.html pattern)

src/infrastructure/postgres-sql/migrations/
└── 00065-subscription-lifecycle.js               NEW
```

### 4.2 Extended files

| File | Change | Why |
|---|---|---|
| `infrastructure/razorpay/razorpay.functions.js` | **restore signature comparison (timing-safe)**; **pass `amountInPaise` to refund**; add `verifyWebhookSignature`, `fetchOrder`, `fetchOrderPayments`, `fetchPayment`, `fetchRefund` | D-crit-1, D-crit-2, §11 |
| `infrastructure/razorpay/razorpay.config.js` | require `RAZORPAY_WEBHOOK_SECRET` at module load, same shape as the existing key guard | fact 21 |
| `modules/billing/models/transactions.model.js` | +9 columns, +2 statuses, +3 indexes | §5.3 |
| `modules/billing/models/org_subscriptions.model.js` | +11 columns, status enum swap, +2 partial uniques | §5.2 |
| `modules/billing/models/subscription_plans.model.js` | +3 columns (`grace_period_days`, `is_public`, `sort_order`) | §5.1 |
| `modules/organization/models/organization_profiles.model.js` | +2 columns (`billing_notification_emails`, `billing_reminder_lead_days`) | registry #97/#98 |
| `modules/billing/repositories/subscription_plan.repository.js` | split `findById` / `findActiveById`; add `findAllActive` | D-crit-4, #225 |
| `modules/billing/repositories/org_subscription.repository.js` | `findLiveByOrgId` (locking), `listByOrgId`, `findDueForExpiry`, `updateStatus` with a `WHERE status = <expected>` guard | §7 |
| `modules/billing/repositories/transaction.repository.js` | `findPendingSubscriptionTx`, `listByOrgId`, `findByProviderPaymentId`, `findByIdempotencyKey`, `findStalePending` | §7 |
| `modules/billing/services/entitlement.service.js` | period-aware entitlement; DB-503 behaviour preserved byte-for-byte | fact 13, D-B4 |
| `common/middlewares/subscription.middleware.js` | read the subscription's `plan_snapshot`, not a live plan row; period-aware | D-crit-4, D-B4 |
| `common/utilities/email.utils.js` | `sendBillingNotificationEmail()`; 8 `TEMPLATE_MAP` entries over one file | §17 |
| `common/utilities/org_rate_limit.utils.js` | optional 5th option `keyPrefix`, **defaulting to `'pdf'`** so every existing caller's key is byte-identical | D-B13 |
| `modules/organization/services/organization.service.js` | `initiateRegistration` / `verifyPayment` delegate to `checkout.service` / `settlement.service` | §10.3 |
| `src/app.js` | `require('./modules/billing/billing.index')(app)` | fact 4 |
| `src/server.js` | register 3 crons + `subscriptionLifecycleService.runStartupCatchUp()` in the existing 30 s block | fact 20 |

### 4.3 Layer responsibilities

| Layer | Owns | Must not |
|---|---|---|
| **Route** | path, auth stack, `validate()` on `params`/`body` | hold logic; read `req.query` directly |
| **Controller** | `validateOrThrow` on body/query (Express 5 `req.query` is a getter — see the Express-5 gotcha in memory `manager-panel-authz-backbone`), envelope shaping, `try/catch → next(err)` | build SQL; decide state transitions; talk to Razorpay |
| **Service** | transaction boundaries, lock order, state-machine enforcement, event writes, gateway calls | emit HTTP headers; know about `res` |
| **Repository** | query construction, `transaction` passthrough, `WHERE`-guarded updates returning `affectedCount` | hold business rules |
| **Pure util** | deterministic transforms: money, periods, proration, transition legality, snapshot shaping, invoice formatting | import `db`; call `Date.now()` (the clock is always an argument); reach the network |
| **Provider** | Razorpay HTTP only | know about our tables |

**`settlement.service.js` is the only module in the codebase permitted to move a `transactions` row to `success`.** Three callers (registration verify, checkout verify, webhook drain) and one sweeper (reconciler) all funnel through it. This is the plan's central structural rule.

---

## 5. Database Schema — migration `00065-subscription-lifecycle.js`

Single managed transaction, `up` and `down` both reversible, following the `00052`/`00053` shape. **The operator runs migrations; this plan hands the file back and verifies it statically plus by unit test (fact 22).**

Order inside `up`:
1. duplicate pre-flight guards (§22.1) — abort with a readable error, do not create indexes over dirty data
2. `subscription_plans` columns
3. `transactions` columns → status enum swap → indexes
4. `org_subscriptions` columns → status enum swap → **backfill** → NOT NULL / CHECK → partial uniques
5. `organization_profiles` columns
6. `subscription_events`, `subscription_refunds`, `billing_webhook_events`, `billing_invoice_sequences` + indexes
7. seed the current-FY invoice sequence row

`down` is the exact inverse. **`down` drops `subscription_events`, which is the audit ledger — the file header must say so explicitly** (precedent: migration `00051`'s destructive `down`, recorded in memory).

### 5.1 `subscription_plans` — ALTER (3 columns)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `grace_period_days` | `INTEGER` | no | `3` | Days of retained access after `current_period_end`. Seller-controlled, **not** an org setting. `CHECK BETWEEN 0 AND 30`. |
| `is_public` | `BOOLEAN` | no | `true` | `false` hides a plan from #225 while leaving existing subscribers untouched — the correct way to retire a plan (contrast `is_active=false`, which is now reserved for "cannot be purchased *and* is historical only"). |
| `sort_order` | `INTEGER` | no | `0` | Display order for the pricing page. |

**Not added:** nothing that would let a plan's price be edited in place. **Rule (D-B9): a plan's `amount`, `currency`, `billing_cycle` and limits are immutable once any subscription references it.** A price change creates a *new* plan row with a new `code` (e.g. `growth_monthly_v2`) and sets `is_public=false` on the old one. This is enforced by convention plus §21's test over the seeder, not by a DB trigger — and it is *backstopped* by `plan_snapshot` (§5.2), so even a violation cannot corrupt history.

### 5.2 `org_subscriptions` — ALTER (11 columns + enum swap + 2 partial uniques)

This table becomes the lifecycle spine. Existing columns keep their meaning.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `plan_snapshot` | `JSONB` | **no** | `'{}'::jsonb` then backfilled, then no default | **The historical-integrity mechanism.** Frozen at activation: `{ plan_id, code, name, amount, currency, billing_cycle, max_employees, max_managers, max_hrs, feature_keys: [...], grace_period_days, captured_at }`. Every read path (#226, #227, `requireSubscription`, `entitlement.service`) uses this, **never a live `subscription_plans` join**. This is what makes D-crit-4 structurally impossible to recur. |
| `change_type` | `ENUM('initial','renewal','upgrade','downgrade','reactivation')` | no | `'initial'` | How this row came to exist. Drives #227's history rendering. |
| `previous_subscription_id` | `UUID` | yes | — | FK → `org_subscriptions(id)` `ON DELETE SET NULL`. Forms the chain. |
| `grace_ends_at` | `TIMESTAMPTZ` | yes | — | `current_period_end + grace_period_days`, materialised at activation so the expiry cron never recomputes policy. |
| `canceled_at` | `TIMESTAMPTZ` | yes | — | When cancellation was *requested*. |
| `cancel_reason` | `TEXT` | yes | — | Free text, ≤ 500 chars, validated at the API. |
| `cancel_effective` | `ENUM('period_end','immediate')` | yes | — | Non-null iff `canceled_at` is non-null. `CHECK` pairs them. |
| `ended_at` | `TIMESTAMPTZ` | yes | — | When the row actually stopped entitling. Set on `expired`, `canceled`, and on supersession by an upgrade. |
| `scheduled_plan_id` | `UUID` | yes | — | FK → `subscription_plans(id)` `ON DELETE RESTRICT`. A downgrade scheduled for period end (#237). |
| `activated_by_user_id` | `UUID` | yes | — | FK → `users(id)` `ON DELETE SET NULL`. Who paid / who the system acted for. |
| `invoice_number` | *(not here)* | — | — | lives on `transactions` — see D-B7 |

**Status enum swap.** Postgres cannot `ALTER TYPE … ADD VALUE` inside a transaction block on all supported versions, and every migration in this repo runs inside one. So: create `enum_org_subscriptions_status_v2` with `('active','in_grace','past_due','canceled','expired','suspended')`, `ALTER COLUMN … TYPE … USING status::text::enum_…_v2`, drop the old type, rename. Reversible.

**Live status set (D-B5):** `active`, `in_grace`, `expired`, `canceled`, `suspended`.
* **`past_due` is retained in the enum and is unreachable by design.** It models "an automatic renewal charge failed", and we have no auto-debit mandate (§1.3). Dropping the value would require a second type swap for zero benefit; leaving it un-writable is documented here and asserted by a test (`subscription_state.utils` never returns it as a target).
* **There is no `pending` subscription status.** A subscription row is created **only at settlement**. A checkout in flight exists solely as a `pending` `transactions` row. This removes an entire category of orphaned rows and makes the "one live subscription per org" index total. **D-B3.**

**Constraints:**

```sql
-- at most one live subscription per org, ever
CREATE UNIQUE INDEX org_subscriptions_one_live_uidx
  ON org_subscriptions (org_id)
  WHERE status IN ('active','in_grace','past_due');

-- a perpetual period is only legal for a lifetime-cycle plan
ALTER TABLE org_subscriptions ADD CONSTRAINT org_subscriptions_period_chk
  CHECK (current_period_end IS NULL OR current_period_end > current_period_start);

ALTER TABLE org_subscriptions ADD CONSTRAINT org_subscriptions_cancel_chk
  CHECK ((canceled_at IS NULL) = (cancel_effective IS NULL));

ALTER TABLE org_subscriptions ADD CONSTRAINT org_subscriptions_grace_chk
  CHECK (grace_ends_at IS NULL OR current_period_end IS NULL OR grace_ends_at >= current_period_end);
```

**`current_period_end IS NULL` means perpetual** (the free / `lifetime` plan). This is the single decision that makes the backfill non-breaking — see §22.2 and **D-B2**.

New indexes: `(org_id, created_at DESC)` for #227; `(status, grace_ends_at)` and `(status, current_period_end)` for the expiry cron; `(scheduled_plan_id) WHERE scheduled_plan_id IS NOT NULL`.

### 5.3 `transactions` — ALTER (9 columns + enum extension + 3 indexes)

`transactions` **is** the payment entity. No `PaymentAttempt` table is introduced: a failed payment is a terminal row, and a retry is a new row with a new order (D-B10). The order/payment distinction Razorpay draws is carried by `provider_order_id` / `provider_payment_id`, which are already columns.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `subscription_id` | `UUID` | yes | — | FK → `org_subscriptions(id)` `ON DELETE SET NULL`. The subscription this payment produced. Nullable both ways with `org_subscriptions.transaction_id`; no cycle at insert time because the transaction is always written first. |
| `plan_id` | `UUID` | yes | — | FK → `subscription_plans(id)` `ON DELETE RESTRICT`. |
| `plan_snapshot` | `JSONB` | yes | — | The plan **as priced at checkout**. Not null for every row this phase creates; nullable only for the legacy rows (§22.3). |
| `intent` | `ENUM('initial','renewal','upgrade','downgrade','reactivation')` | yes | — | Server-derived, never client-supplied. Null on legacy rows. |
| `idempotency_key` | `VARCHAR(100)` | yes | — | Client-supplied `Idempotency-Key`. |
| `base_amount` | `DECIMAL(12,2)` | yes | — | Pre-tax, pre-discount. For an upgrade this is the **prorated** amount. |
| `discount_amount` | `DECIMAL(12,2)` | no | `0.00` | Always `0.00` in this phase (D-B8). |
| `tax_amount` | `DECIMAL(12,2)` | no | `0.00` | GST is included in the seeded prices today; the column exists so a tax-exclusive future does not need a migration. `amount = base_amount - discount_amount + tax_amount` is asserted by a pure util and by a CHECK where all three are non-null. |
| `refunded_amount` | `DECIMAL(12,2)` | no | `0.00` | Running total across `subscription_refunds`. `CHECK (refunded_amount >= 0 AND refunded_amount <= amount)`. |
| `invoice_number` | `VARCHAR(40)` | yes | — | Allocated at settlement. **Unique.** |
| `invoice_date` | `TIMESTAMPTZ` | yes | — | |
| `invoice_snapshot` | `JSONB` | yes | — | Seller block + buyer block (org legal name, address, GSTIN, PAN as of settlement) + line item. Frozen (D-B7). |
| `settled_at` / `failed_at` | `TIMESTAMPTZ` | yes | — | |
| `settled_via` | `ENUM('client_callback','webhook','reconciler')` | yes | — | Which of the three settlement sources actually won the race. Directly observable proof of §12's correctness in production. |
| `gateway_fee` / `gateway_tax` | `DECIMAL(12,2)` | yes | — | From `payment.captured`, when present. Reporting only. |

**Status enum** gains `partially_refunded`. Final set: `pending | success | failed | cancelled | partially_refunded | refunded`. Same type-swap technique as §5.2.

**Deliberately not added:** `created`, `processing`, `expired`, `authorized`. See **D-B11** — a state no code path can enter or observe is a liability, not documentation. `payment_capture: 1` is already set on every order, so `authorized` is never a resting state for us.

**Constraints:**

```sql
CREATE UNIQUE INDEX transactions_provider_order_id_uidx
  ON transactions (provider, provider_order_id) WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX transactions_provider_payment_id_uidx
  ON transactions (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX transactions_idem_uidx
  ON transactions (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ★ the anti-double-checkout invariant
CREATE UNIQUE INDEX transactions_one_pending_subscription_uidx
  ON transactions (org_id) WHERE status = 'pending' AND type = 'subscription';

CREATE UNIQUE INDEX transactions_invoice_number_uidx
  ON transactions (invoice_number) WHERE invoice_number IS NOT NULL;
```

The fourth index is what makes "user clicks Pay in three tabs" a database-level impossibility rather than an application-level hope. Its cost: a genuine second checkout is blocked while a stale pending row exists, which is why the reconciler (§16.3) must cancel abandoned checkouts promptly, and why #234 lets the user void one explicitly.

### 5.4 `subscription_events` — NEW (the append-only ledger)

Answers "complete historical records", "plan-change history" and "who did what". **Append-only. No update path exists in the repository. No soft delete.**

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `UUID` PK | no | `gen_random_uuid()` |
| `org_id` | `UUID` | no | FK → `organizations` `ON DELETE CASCADE` |
| `subscription_id` | `UUID` | yes | FK → `org_subscriptions` `ON DELETE SET NULL` — the ledger outlives the row |
| `transaction_id` | `UUID` | yes | FK → `transactions` `ON DELETE SET NULL` |
| `event_type` | `VARCHAR(50)` | no | see the closed list in `billing_defaults.js` |
| `from_status` | `VARCHAR(30)` | yes | |
| `to_status` | `VARCHAR(30)` | yes | |
| `actor_type` | `ENUM('user','system','webhook','cron')` | no | |
| `actor_user_id` | `UUID` | yes | FK → `users` `ON DELETE SET NULL` |
| `reason` | `TEXT` | yes | ≤ 500 chars at the API |
| `dedupe_key` | `VARCHAR(200)` | yes | **Doubles as the notification dedupe surface (D-B12).** |
| `payload` | `JSONB` | no `DEFAULT '{}'` | Non-secret context only — never a signature, never a raw webhook body |
| `occurred_at` | `TIMESTAMPTZ` | no | `CURRENT_TIMESTAMP` |

`UNIQUE (org_id, dedupe_key) WHERE dedupe_key IS NOT NULL` — enables `ON CONFLICT DO NOTHING` enqueues (`ignoreDuplicates: true`, the `document_notification.repository` pattern) so a cron re-run never double-sends an expiry warning.
Indexes: `(org_id, occurred_at DESC)`, `(subscription_id, occurred_at DESC)`, `(event_type, occurred_at DESC)`.

Event types (closed list): `subscription.activated`, `subscription.renewed`, `subscription.upgraded`, `subscription.downgrade_scheduled`, `subscription.downgrade_applied`, `subscription.downgrade_cleared`, `subscription.cancel_scheduled`, `subscription.cancel_reverted`, `subscription.canceled`, `subscription.entered_grace`, `subscription.expired`, `subscription.suspended`, `subscription.reactivated`, `payment.initiated`, `payment.succeeded`, `payment.failed`, `payment.abandoned`, `payment.flagged`, `refund.recorded`, `refund.failed`, `notice.expiring`, `notice.expired`.

### 5.5 `subscription_refunds` — NEW

One payment may be refunded in parts, each with its own gateway id and state. That is the only reason this is a table and not columns.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `UUID` PK | no | |
| `org_id` | `UUID` | no | FK → `organizations` CASCADE. Denormalised **deliberately** so every tenant-scoped read filters on one column without a join (§15). |
| `transaction_id` | `UUID` | no | FK → `transactions` RESTRICT — a refunded payment can never be deleted |
| `provider` | `VARCHAR(50)` | no | `'razorpay'` |
| `provider_refund_id` | `VARCHAR(255)` | no | **`UNIQUE (provider, provider_refund_id)`** — the webhook idempotency key |
| `provider_payment_id` | `VARCHAR(255)` | no | |
| `amount` | `DECIMAL(12,2)` | no | `CHECK (amount > 0)` |
| `currency` | `VARCHAR(10)` | no | |
| `status` | `ENUM('pending','processed','failed')` | no | |
| `reason` | `TEXT` | yes | |
| `credit_note_number` | `VARCHAR(40)` | yes | `UNIQUE` where not null; allocated from the same sequence family as invoices, prefix `CN` |
| `initiated_by` | `ENUM('dashboard','api','system')` | no | `'dashboard'` for every row this phase creates (D-B14) |
| `processed_at` | `TIMESTAMPTZ` | yes | |
| `metadata` | `JSONB` | yes | |

Index: `(transaction_id)`, `(org_id, created_at DESC)`.

### 5.6 `billing_webhook_events` — NEW (the at-least-once inbox)

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `UUID` PK | no | |
| `provider` | `VARCHAR(50)` | no | |
| `provider_event_id` | `VARCHAR(255)` | no | **`UNIQUE (provider, provider_event_id)`** — the whole point of the table |
| `event_type` | `VARCHAR(100)` | no | e.g. `payment.captured` |
| `signature_verified` | `BOOLEAN` | no | always `true` for stored rows; the column exists so a future non-verifying provider is representable |
| `payload` | `JSONB` | no | the parsed body, **redacted** by a deny-list before write (§18) |
| `payload_sha256` | `CHAR(64)` | no | integrity check for replay investigation |
| `status` | `ENUM('received','processing','processed','ignored','failed')` | no | default `'received'` |
| `outcome` | `VARCHAR(50)` | yes | `settled` / `no_op` / `unknown_order` / `amount_mismatch` / … |
| `attempts` | `INTEGER` | no | default `0`, consumed **at claim** |
| `last_error` | `TEXT` | yes | redacted |
| `related_transaction_id` | `UUID` | yes | FK → `transactions` SET NULL, filled on processing |
| `received_at` / `claimed_at` / `processed_at` | `TIMESTAMPTZ` | | |

Indexes: `(status, received_at)` for the drain; `(related_transaction_id)`; `(event_type, received_at DESC)`.

**`provider_event_id` comes from Razorpay's `X-Razorpay-Event-Id` header. Its presence must be confirmed in the target account's webhook configuration during Step 0** (pre-flight item §24.0-4). Fallback if absent: `sha256(rawBody)` as the dedupe id, which is correct for identical redeliveries — Razorpay's retries are byte-identical — and is what the implementation uses when the header is missing.

### 5.7 `billing_invoice_sequences` — NEW

| Column | Type | Null | Notes |
|---|---|---|---|
| `scope` | `VARCHAR(20)` PK | no | `'INV-2026-27'`, `'CN-2026-27'` — financial year, Indian April–March |
| `last_value` | `BIGINT` | no | default `0` |
| `updated_at` | `TIMESTAMPTZ` | no | |

Allocation: `SELECT … FOR UPDATE` on the scope row, `last_value + 1`, format `INV-2026-27-000123`. Gapless — an Indian GST invoice serial is required to be consecutive, and a Postgres `SEQUENCE` gaps on every rollback. The cost is that all settlements serialize on one row; at this volume (a handful of purchases per day) the lock is held for a few milliseconds and is **acquired last in the settlement transaction, immediately before commit** (§13.2 lock order).

### 5.8 `organization_profiles` — ALTER (2 columns)

| Column | Type | Null | Default | Registry |
|---|---|---|---|---|
| `billing_notification_emails` | `JSONB` | no | `'[]'::jsonb` | #97 — up to 5 extra recipients for billing mail |
| `billing_reminder_lead_days` | `JSONB` | no | `'[7,1]'::jsonb` | #98 — days before expiry to warn |

The invoice's buyer block draws on the columns already present: `org_name`, `address_line_1/2`, `city`, `state`, `country`, `zip_code`, `gst_number`, `company_pan_number`. Nothing new is needed for that.

---

## 6. Models

Four new Sequelize models mirroring §5.4–§5.7, following the module's existing shape: `underscored: true`, `timestamps` mapped to `created_at`/`updated_at`, `paranoid: false`, guarded `associate` (`if (models.X)`).

**Model↔migration parity is a test, not a hope** — §21 extends the `invitation_ledger_migration.test.js` pattern to `00065`, asserting `Object.keys(migrationCols).sort()` equals `Object.keys(Model.rawAttributes).sort()` for each new table, and that each named partial unique index in §5 appears in the recorded `addIndex`/raw-SQL log. This is the whole defence against model drift given no DB access.

`subscription_events` and `billing_webhook_events` are registered under `src/modules/billing/`, which `models.index.js` already scans (`MODEL_ROOTS` includes `modules/billing`), so no loader change is needed.

---

## 7. Core Logic — pure, DB-free utilities

Every one of these takes its clock as an argument and has no imports beyond `dayjs` and local constants. They carry the bulk of the test value.

### 7.1 `money.utils.js`

```
toPaise(rupeesDecimalString) -> integer            // string/Decimal in, integer out; rejects > 2dp
fromPaise(paise)             -> '1234.50'
assertGatewayAmount(rupees, gatewayPaise)          // throws AMOUNT_MISMATCH unless exactly equal
addRupees(a, b) / subRupees(a, b)                  // integer-paise internally, string out
```

Rule: **no rupee value is ever multiplied, divided or compared as a JS number.** Conversions happen once, at the gateway boundary, through `toPaise`. This confines D-crit-5.

### 7.2 `billing_period.utils.js`

```
periodEnd(startISO, billing_cycle)                 // 'monthly' -> +1 month, 'yearly' -> +1 year,
                                                   // 'lifetime' -> null (perpetual, D-B2)
graceEnd(periodEndISO, graceDays)                  // null when periodEnd is null
renewalAnchor(current, nowISO)                     // before expiry -> old period_end (no lost days)
                                                   // after expiry  -> now
isWithinRenewalWindow(periodEndISO, nowISO, days)
```

Month arithmetic uses `dayjs().add(1,'month')`, which clamps 31 Jan → 28/29 Feb. **That clamp is the intended behaviour** and is a named test case (EC-B14): a customer who buys on the 31st renews on the 28th and stays on the 28th thereafter. The alternative (anchor-day memory) is more surprising and is not built.

### 7.3 `proration.utils.js`

Upgrade only. Downgrades are never prorated (D-B16).

```
quoteUpgrade({ current, targetPlan, nowISO }) -> {
  eligible, reason,
  remaining_days, period_days,
  unused_credit,        // current plan's unconsumed value
  target_prorated,      // target plan's value for the same remaining window
  amount_due,           // max(target_prorated - unused_credit, 0)
  new_period_end        // === current.current_period_end, unchanged
}
```

Rules, chosen for determinism over cleverness:
* Day-granular, not second-granular: `remaining_days = ceil(diff(period_end, now, 'day'))`, floor 0.
* An upgrade **never extends the period.** The customer buys a better plan for the time they already own. Extending would make "upgrade" and "renew" the same button with different prices.
* `amount_due` is floored at 0 and, if `0 < amount_due < ₹1.00`, rounded **up to ₹1.00** — Razorpay rejects orders under 100 paise (the provider already throws). If `amount_due == 0` (e.g. upgrading from a free plan with 0 remaining days) the change is applied **without a payment** and recorded as `change_type='upgrade'` with a null transaction.
* A perpetual (`lifetime`, free) source plan has `unused_credit = 0` — a free plan has no monetary value to credit, and the target period starts fresh at `now`.

### 7.4 `subscription_state.utils.js`

Holds **both** transition tables as frozen maps plus `assertTransition(entity, from, to, actor)`, which throws `AppError(409, …, 'INVALID_SUBSCRIPTION_STATE' | 'INVALID_PAYMENT_STATE', { from, to })`. No service is allowed to write a status without going through it. The tables are §8.

### 7.5 `plan_snapshot.utils.js`

`buildPlanSnapshot(planRow, featureKeys, nowISO)` → the frozen object of §5.2, with a `snapshot_version: 1` field so a future shape change is detectable. Also `readLimits(snapshot)` and `readFeatureKeys(snapshot)`, the **only** accessors the middleware and entitlement service may use — so a snapshot-shape change has one place to update.

### 7.6 `invoice_number.utils.js`

`financialYearScope(dateISO)` → `'INV-2026-27'` (April–March). `format(scope, n)` → `'INV-2026-27-000123'`. Pure; the sequence read/increment is the repository's job.

---

## 8. State Machines

### 8.1 Payment — `transactions.status`

```
                    ┌──────────────────────────► partially_refunded ─────┐
                    │                                    ▲               ▼
   (insert) ─► pending ─────► success ────────────────────┴──────────► refunded
                  │  │           (terminal except refunds)
                  │  └────────► failed      (terminal)
                  └───────────► cancelled   (terminal)
```

| From | To | Owner (who may perform it) | Guard |
|---|---|---|---|
| — | `pending` | `checkout.service` | one-pending-per-org unique index |
| `pending` | `success` | `settlement.service` **only**, driven by client callback / webhook / reconciler | signature verified **and** gateway cross-check passed; `UPDATE … WHERE status='pending'` must report `affectedCount = 1` |
| `pending` | `failed` | webhook `payment.failed`; reconciler observing a failed gateway payment | — |
| `pending` | `cancelled` | #234 (user abandons); reconciler after order TTL with no gateway payment | reconciler only when the gateway reports no captured payment |
| `success` | `partially_refunded` | refund ingestion | `0 < refunded_amount < amount` |
| `success` \| `partially_refunded` | `refunded` | refund ingestion | `refunded_amount = amount` |
| **`failed`** | **anything** | **nobody** | A retry is a **new row with a new order** (D-B10). This is the anti-double-charge rule. |
| `cancelled` | anything | nobody | as above |

**Late/out-of-order webhooks:** a `payment.failed` for a row already `success` is recorded with `outcome='no_op'` and **never demotes**. A `payment.captured` for a row already `success` is a no-op unless its `provider_payment_id` differs from the stored one, which is an `amount_mismatch`-class anomaly → `payment.flagged` event + error log, no state change (EC-B9).

### 8.2 Subscription — `org_subscriptions.status`

```
  (created only at settlement)
         │
         ▼
      active ──────────► in_grace ──────► expired
         │  │                │               ▲
         │  │                └── renewal ────┤ (renewal from expired = reactivation)
         │  │                                │
         │  └── renewal/upgrade ─► (new row; this row → canceled/ended)
         │
         ├── cancel(period_end)  → stays active, cancel_at_period_end = true → canceled at period end
         ├── cancel(immediate)   → canceled (ended_at = now)
         └── platform action     → suspended ──► active (unsuspend) | expired
```

| From | To | Owner | Notes |
|---|---|---|---|
| — | `active` | `settlement.service` | the only creator |
| `active` | `in_grace` | `subscription_lifecycle` cron | `now >= current_period_end` and `grace_period_days > 0` |
| `active` | `expired` | cron | `now >= current_period_end` and `grace_period_days = 0` |
| `in_grace` | `expired` | cron | `now >= grace_ends_at` |
| `active` \| `in_grace` | `canceled` | cron (period-end cancellation maturing) or #235 immediate | sets `ended_at` |
| `active` \| `in_grace` | `canceled` | `settlement.service`, on supersession by an upgrade | `ended_at = now`, `cancel_reason = 'superseded_by_upgrade'` |
| `active` \| `in_grace` \| `expired` | — | renewal produces a **new row**; the old one is closed | never an in-place plan swap |
| any live | `suspended` | platform/manual (no API in this phase; a documented SQL runbook) | |
| `expired` \| `canceled` | anything | nobody — terminal. A later purchase creates a new row with `change_type='reactivation'`. |

**Entitlement predicate (the one definition, in `subscription_state.utils`):**

```
isEntitled(sub, now) =
     sub.status IN ('active','in_grace')
  && (sub.current_period_end IS NULL            // perpetual — free/lifetime plans
      || now < (sub.grace_ends_at ?? sub.current_period_end))
```

Both `entitlement.service.hasFeature` and `subscription.middleware.requireSubscription` call it. Nothing else computes entitlement. **This is the change with the widest blast radius in the plan** — §22.

---

## 9. Services

| Service | Responsibility | Never |
|---|---|---|
| `subscription.service` | #226–#228, #235–#238. Reads the snapshot, computes seat usage, enforces cancel/schedule rules, writes events. | touches Razorpay |
| `checkout.service` | #232. Derives intent server-side, quotes, creates the Razorpay order **outside** the DB transaction, inserts the `pending` row inside it. | settles anything |
| **`settlement.service`** | The chokepoint. `settle({ orderId, paymentId, signature?, source, actorUserId })`. Verifies, cross-checks the gateway, locks, transitions the payment, creates/closes subscriptions, allocates the invoice number, writes events. Idempotent by construction. | be bypassed |
| `billing_webhook.service` | `ingest(rawBody, headers)` → verify + insert inbox row + 200. `drain(batch)` → claim, dispatch to `settlement.service` / refund ingestion, record outcome. | perform business logic itself |
| `billing_reconciliation.service` | Sweep stale `pending` rows against the gateway; sweep refunds whose webhook never arrived. | create orders |
| `subscription_lifecycle.service` | `runExpirySweep()`, `runStartupCatchUp()`. Grace, expiry, maturing cancellations, free-target downgrades, expiry notices. | take payments |
| `billing_notification.service` | Emit billing email for an event, deduped on `subscription_events.dedupe_key`. | fail a business transaction |

**Containment rule (copied from the documents module):** a notification failure, an audit-log failure or a metrics failure **never** fails the money path. They are inside `try/catch` with a redacted `console.error`. The inverse is false: a `subscription_events` write is **inside** the business transaction and *does* fail it, because a state change with no ledger row is exactly what this plan exists to prevent.

---

## 10. API Surface — #225 … #239

### 10.1 Mount and auth stacks

`billing.index.js`:

```js
app.use('/api/v1/billing', planRoutes)          // #225
app.use('/api/v1/billing', subscriptionRoutes)  // #226-#228, #232-#238
app.use('/api/v1/billing', paymentRoutes)       // #229-#231
app.use('/webhooks/razorpay', webhookRoutes)    // #239  (raw body already mounted in app.js:36)
```

Flat mount with unique `(method, path)` pairs across the three tenant files — the same discipline as `organization.index.js` (memory: `org-routes-domain-split-flat-mount`).

Three stacks:

| Stack | Middleware | Used by |
|---|---|---|
| **Catalogue** | `authenticate` | #225 only — a `guest` mid-registration must be able to see plans, so no `authorize()` and no org context |
| **Billing HR** | `authenticate, authorize(HR_ONLY)` | #226–#238 |
| **Webhook** | none (signature-gated) | #239 |

Three deliberate omissions, each load-bearing:

* **No `requireFeature(...)`.** Billing must work when entitlements are dead — that is precisely when a customer needs to pay.
* **No `requireActiveOrg`.** An org whose subscription expired must still be able to renew. (`requireActiveOrg` reads `organizations.status`, which expiry does *not* change — D-B4 — but omitting it also covers the half-registered `inactive` org.)
* **`authorize(HR_ONLY)`, not `HR_OR_MANAGER`.** Commercial data is HR's. `admin`/`super-admin` are platform roles and get no tenant data (`role_planes.js`; memory `role-planes-tenant-vs-platform`).

### 10.2 The endpoints

Every response uses the project envelope: `{ success, message, data }`; errors go through `AppError` → `errorHandlerMiddleware` → `{ success:false, message, errorCode, details? }`.

---

#### `#225 — GET /api/v1/billing/plans`
* **Purpose:** the purchase catalogue.
* **Roles:** any authenticated user (`guest` included — this is the pricing page mid-registration).
* **Query:** none.
* **Flow:** `subscription_plans WHERE is_active AND is_public ORDER BY sort_order, amount` + their enabled `plan_features` keys.
* **Response:** `{ plans: [{ code, name, description, amount, currency, billing_cycle, limits:{max_employees,max_managers,max_hrs}, feature_keys, grace_period_days, is_current }] }`. `is_current` is set only when the caller has an org context.
* **DB / transaction / gateway:** two reads / none / none.
* **Security:** no org data leaves; nothing tenant-specific except `is_current`.
* **Edge:** zero public plans → `200` with `plans: []`, not 404.

---

#### `#226 — GET /api/v1/billing/subscription`
* **Purpose:** the "your plan" panel.
* **Roles:** HR.
* **Flow:** `findLiveByOrgId(orgId)`; if none, the most recent terminal row.
* **Response:**
  ```json
  { "subscription": { "id", "status", "change_type", "plan": {…plan_snapshot…},
      "current_period_start", "current_period_end", "grace_ends_at",
      "days_remaining", "is_entitled", "cancel_at_period_end", "canceled_at",
      "cancel_effective", "cancel_reason",
      "scheduled_change": { "plan_code", "effective_at" } | null },
    "usage": { "employees": {"used","limit"}, "managers": {…}, "hrs": {…} },
    "last_payment": { "transaction_id","amount","currency","status","settled_at","invoice_number" } | null }
  ```
  `plan` is read **from `plan_snapshot`**, never from a live join (D-crit-4).
* **Edge:** an org that has never subscribed (impossible today — registration always creates one — but possible after a future hard-delete) → `subscription: null`, `usage` still computed.

---

#### `#227 — GET /api/v1/billing/subscription/history`
* **Roles:** HR. **Query:** `limit` (1–100, default 20), `offset`, `status`.
* **Response:** `{ count, rows: [{ id, status, change_type, plan:{code,name,amount,currency,billing_cycle}, current_period_start, current_period_end, ended_at, canceled_at, cancel_reason, transaction:{id, invoice_number, amount, status} | null }] }`, newest first.
* **Tenant isolation:** `WHERE org_id = req.user.orgId`, always, at the repository.

---

#### `#228 — GET /api/v1/billing/subscription/events`
* **Roles:** HR. **Query:** `limit`, `offset`, `event_type` (repeatable), `from`, `to`.
* **Response:** the ledger rows with `actor` resolved to a display name where `actor_user_id` is set. `payload` is returned **allow-listed**, never raw (§18.2).

---

#### `#229 — GET /api/v1/billing/payments`
* **Roles:** HR. **Query:** `status` (repeatable), `from`, `to`, `limit`, `offset`.
* **Response:** `{ count, rows: [{ id, intent, status, amount, currency, base_amount, tax_amount, refunded_amount, plan:{code,name}, provider_payment_id, payment_method, invoice_number, created_at, settled_at, failed_at }] }`.
* **Note:** `provider_order_id` and `provider_payment_id` are **not secrets** (they are shown in the customer's own Razorpay receipt) and are returned. Signatures never are.

---

#### `#230 — GET /api/v1/billing/payments/:transactionId`
* **Roles:** HR. **Params:** UUID.
* **Authorization:** `WHERE id = :id AND org_id = :orgId`. A miss is **404, not 403** — the same posture the payroll HR plane takes for held rows (memory `phase6-payroll-progress`); a 403 would confirm the id exists in another tenant.
* **Response:** the payment + `refunds: [...]` + `subscription: {id, status, period}` + `invoice: {number, date} | null` + `events: [...]` for that transaction.

---

#### `#231 — GET /api/v1/billing/payments/:transactionId/invoice`
* **Roles:** HR. **Precondition:** `status IN ('success','partially_refunded','refunded')` and `invoice_number IS NOT NULL`; otherwise `409 INVOICE_NOT_AVAILABLE`.
* **Response:** `invoice_snapshot` verbatim — seller block, buyer block (org legal name/address/GSTIN/PAN **as of settlement**), line item, tax breakup, totals, `credit_notes: [...]` derived from `subscription_refunds`.
* **Why frozen:** an org that changes its registered address in 2027 must not retroactively alter a 2026 tax invoice. This is the concrete reason `invoice_snapshot` exists rather than a live join.

---

#### `#232 — POST /api/v1/billing/subscription/checkout` ★
* **Purpose:** the single money-taking entry point — purchase, renewal, upgrade and reactivation are all this call. **The client never says which.**
* **Roles:** HR. **Headers:** `Idempotency-Key` (required, 16–100 chars).
* **Body:** `{ "plan_code": "growth_yearly" }` — **and nothing else. No amount. No intent. No org_id.**
* **Validation:** `plan_code` trimmed, 1–100, must resolve via `findActiveByCode`.
* **Flow:**
  1. `checkOrgRate(orgId, 'billing_checkout', 10/hour)` → `429 BILLING_RATE_EXCEEDED` with `Retry-After`.
  2. Idempotency replay check (§12.1) → replay returns the stored response, `200`.
  3. Load the live subscription **without** a lock (read-only quote).
  4. **Derive intent** (D-B15):
     | Live state | Target | Intent |
     |---|---|---|
     | none, or `expired`/`canceled` | any | `reactivation` (or `initial` if the org never had one) |
     | `active`/`in_grace`, same plan | same | `renewal` |
     | `active`/`in_grace`, target amount **>** current | higher | `upgrade` (prorated) |
     | `active`/`in_grace`, target amount **<** current | lower | `409 USE_SCHEDULED_DOWNGRADE` → directs to #237 |
     | `active`/`in_grace`, different plan, equal amount | — | `409 PLAN_CHANGE_NOT_SUPPORTED` |
  5. Renewal window: if intent is `renewal` and `now < period_end - renewal_window_days` → `409 RENEWAL_TOO_EARLY` with `details.earliest_at`.
  6. **Seat check:** current headcount per role vs the target plan's limits. Over → `409 SEAT_LIMIT_EXCEEDED` with `details: { employees:{used,limit}, … }`. Selling a plan the org cannot legally occupy is a support ticket, not a sale.
  7. Amount: renewal/reactivation → plan amount; upgrade → `proration.quoteUpgrade().amount_due`. **Zero-amount upgrade** (§7.3) short-circuits: apply the change in one transaction, no order, respond `{ requires_payment: false }`.
  8. `createRazorpayOrder({ amount, currency, orderId: <pre-generated transaction UUID> })` — **outside** the DB transaction, exactly as `initiateRegistration` already does, so no DB connection is held across an external round-trip.
  9. `BEGIN` → insert the `pending` transaction (id = the pre-generated UUID, `plan_snapshot`, `intent`, `base_amount`, `idempotency_key`) → write `payment.initiated` → `COMMIT`.
* **Idempotency:** three layers — the `Idempotency-Key` unique index, the one-pending-per-org unique index, and the Redis replay guard. A unique-violation on the pending index is caught and converted to `409 CHECKOUT_ALREADY_PENDING` with `details: { transaction_id, order_id, plan_code, amount, created_at }` so the UI can resume or void it.
* **Response 200:** `{ transaction_id, intent, requires_payment, amount, currency, order: { id, amount, currency, receipt }, razorpay_key_id, quote: { base_amount, unused_credit, new_period_end } }`.
* **Race:** two tabs → one wins the unique index, the other gets 409 **with the winner's order**, so both tabs can complete the same payment. Two *different* plans → the second is refused; the user must void (#234) first.
* **Failure:** order created, DB insert fails → the unpaid Razorpay order is orphaned and expires. Strictly better than holding locks across the network (the existing `initiateRegistration` comment says the same; the reasoning is preserved).
* **Related:** #238 (quote first), #233 (settle), #234 (void).

---

#### `#233 — POST /api/v1/billing/subscription/checkout/verify`
* **Purpose:** the client-side callback from the Razorpay checkout modal. **A convenience fast-path, not the source of truth** — #239 and the reconciler settle the same payment if this never arrives.
* **Roles:** HR. **Body:** `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`. `org_id` is **not** accepted — it comes from the token.
* **Flow:** `settlement.service.settle({ orderId, paymentId, signature, source:'client_callback', actorUserId })`. See §11.3 for the full settlement sequence.
* **Idempotency:** re-calling after success returns `200` with the settled state and `already_settled: true`.
* **Errors:** `400 PAYMENT_VERIFICATION_FAILED` (bad signature — and a `payment_verification_audits` row is written **before** throwing), `404 TX_NOT_FOUND`, `403 UNAUTHORIZED_TX` (tx belongs to another org), `409 INVALID_PAYMENT_STATE`, `409 AMOUNT_MISMATCH`, `503 GATEWAY_UNAVAILABLE`.
* **Security:** signature verification is necessary and **not sufficient** — §11.3 step 3.

---

#### `#234 — POST /api/v1/billing/subscription/checkout/cancel`
* **Purpose:** void an abandoned checkout so the org can start a different one.
* **Roles:** HR. **Body:** `{}`.
* **Flow:** lock the org's pending subscription transaction; **re-check the gateway** (`fetchOrderPayments`) before voiding — if a payment was captured, do **not** cancel; settle instead and return `409 PAYMENT_ALREADY_CAPTURED` with the settled state. Otherwise `pending → cancelled`, event `payment.abandoned`.
* **Why the gateway check:** cancelling a locally-pending row that the gateway has already captured would strand a real payment. This endpoint is the one place a user can race the webhook deliberately.
* **Edge:** no pending checkout → `404 NO_PENDING_CHECKOUT`.

---

#### `#235 — POST /api/v1/billing/subscription/cancel`
* **Roles:** HR. **Body:** `{ effective: 'period_end' | 'immediate', reason?: string(≤500), confirm?: boolean }`.
* **Rules:**
  * `period_end` (default): `cancel_at_period_end = true`, `canceled_at = now`, `cancel_effective='period_end'`, status **unchanged**. Access runs to `current_period_end`. Matured by the cron.
  * `immediate`: requires `confirm: true`. Status → `canceled`, `ended_at = now`. **Access ends immediately.** **No automatic refund** — the response says so explicitly in `message`, and a `refund_policy_note` field carries the contact path.
  * Free/perpetual plan → `409 CANNOT_CANCEL_FREE_PLAN`. There is no billing to stop, and cancelling would brick the tenant.
  * Already cancelled with the **same** `effective` → `200`, idempotent, returns the existing cancellation.
  * Already cancelled with a **different** `effective` → `409 ALREADY_CANCELLED` with `details.cancel_effective`. (Escalating `period_end` → `immediate` is done by undo-then-cancel, which leaves two honest ledger entries.)
  * Status `expired`/`canceled` → `409 SUBSCRIPTION_NOT_ACTIVE`.
  * A pending checkout exists → it is voided in the same transaction (gateway re-check as in #234); if the gateway has captured it, the cancel is refused with `409 PAYMENT_ALREADY_CAPTURED`.
* **Events:** `subscription.cancel_scheduled` or `subscription.canceled`.

---

#### `#236 — POST /api/v1/billing/subscription/cancel/undo`
* **Roles:** HR. **Body:** `{}`.
* **Rules:** only for a `period_end` cancellation on a still-live subscription. Clears `cancel_at_period_end`, `canceled_at`, `cancel_effective`, `cancel_reason`. Event `subscription.cancel_reverted`.
* **An `immediate` cancellation is not reversible** → `409 CANCELLATION_NOT_REVERSIBLE`. The org purchases again (`reactivation`). Making termination reversible would make `ended_at` a lie.
* No scheduled cancellation → `409 NO_SCHEDULED_CANCELLATION`.

---

#### `#237 — POST /api/v1/billing/subscription/schedule-change`
* **Purpose:** downgrade, recorded now, effective at period end.
* **Roles:** HR. **Body:** `{ plan_code: string | null }` — `null` clears a scheduled change.
* **Rules:**
  * Target must be **strictly cheaper** than the current plan; otherwise `400 NOT_A_DOWNGRADE` (pointing to #232).
  * **Seat check against the target plan.** Over → `409 SEAT_LIMIT_EXCEEDED` with the excess per role. This is the single most common real-world downgrade failure and it must be refused *now*, not silently at period end.
  * Requires a live, non-cancelled subscription with a non-null `current_period_end`.
  * Sets `scheduled_plan_id`; event `subscription.downgrade_scheduled` / `…_cleared`.
* **What happens at period end** (cron, §16.1): if the target plan's `amount = 0`, the downgrade is **applied automatically** — a new `active` subscription on the free plan, `change_type='downgrade'`, no payment. If the target costs money, the scheduled plan becomes the **default** offered by #226/#238 and the subscription expires normally until the org pays. **D-B16**: a paid downgrade cannot be auto-applied because we hold no payment mandate; pretending otherwise would be the "unnecessary billing complexity" the brief warns against.

---

#### `#238 — GET /api/v1/billing/subscription/preview-change?plan_code=`
* **Purpose:** the server-computed quote the UI must render before #232. Read-only, no side effects, no rate limit.
* **Roles:** HR.
* **Response:** `{ intent, requires_payment, amount_due, currency, proration: { remaining_days, period_days, unused_credit, target_prorated } | null, new_period_start, new_period_end, seat_check: { ok, violations: [...] }, blocked_reason: null | 'RENEWAL_TOO_EARLY' | 'SEAT_LIMIT_EXCEEDED' | 'USE_SCHEDULED_DOWNGRADE' }`.
* **Contract:** #238 and #232 share the same quote function. `blocked_reason` here maps 1:1 to the `errorCode` #232 would raise. **A UI that shows #238 and then calls #232 must never be surprised** — that equivalence is a test (T-B31).
* **Express 5 note:** `req.query` is a getter; validate via `validateOrThrow(schema, req.query)` and use the returned value. Assigning to `req.query` throws.

---

#### `#239 — POST /webhooks/razorpay`
* **Auth:** none. Signature only. **Never** behind `authenticate`.
* **Body:** `Buffer` (raw). **Requires the Step-4 reordering of `src/app.js`** so `express.raw()` for this path is registered *before* `express.json()` — today it is registered after, which silently defeats it (fact 5). Without that one-line move, every signature check fails or, worse, passes against re-serialised bytes.
* **Flow (§11.4):** verify HMAC over the exact raw bytes → derive `provider_event_id` → insert into `billing_webhook_events` with `ON CONFLICT (provider, provider_event_id) DO NOTHING` → **respond `200 {"received":true}`**. Processing happens in the drain (§16.2).
* **Responses:** `200` on accept **and on duplicate** (a duplicate is a success from Razorpay's point of view). `400 INVALID_WEBHOOK_SIGNATURE` on HMAC failure — logged with the source IP, **never** with the body. `503` if the insert fails, so Razorpay retries.
* **Why respond before processing:** Razorpay's timeout is short, our provisioning is not trivial, and a slow 200 causes retries that we would then have to de-duplicate under load. Persist-then-ack is the standard shape and our inbox makes it safe.
* **Ordering:** none assumed. Every handler is written against current DB state, not against event order.
* **Replay:** an attacker replaying a *captured* body cannot forge the signature (it is HMAC'd with a secret they lack) and, even with a genuine replayed body, `provider_event_id` uniqueness makes it a no-op.

### 10.3 Modified existing endpoints (no new numbers)

| # | Endpoint | Change | Breaking? |
|---|---|---|---|
| 2 | `POST /organizations/register/initiate` | delegates to `checkout.service`; writes `plan_snapshot`, `intent='initial'`, `base_amount`; response gains `transaction_id` and `razorpay_key_id` | **No** — additive |
| 3 | `POST /organizations/register/verify-payment` | delegates to `settlement.service`; **signature is now enforced**; gateway cross-check added; writes `current_period_end`, `grace_ends_at`, `plan_snapshot`, invoice number and events | **Yes, behaviourally.** A caller sending an invalid signature previously succeeded and now gets `400 PAYMENT_VERIFICATION_FAILED`. Response shape unchanged. Change record mandatory. |
| 4/5/6 | `/organizations/users/invite{,/revoke,/resend}` | `requireSubscription` reads `plan_snapshot` and the period predicate | **Yes, behaviourally** — an expired subscription now yields `402 NO_ACTIVE_SUBSCRIPTION`. §22. |
| — | ~30 `requireFeature(...)` routes | period-aware entitlement | **Yes, behaviourally** — same cause. §22. |

---

## 11. Payment Gateway Integration

### 11.1 What exists

`razorpayClient` (`razorpay@2.9.8`) constructed from `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`, throwing at module load if absent. `createRazorpayOrder` (INR only, ≥ 100 paise, `payment_capture: 1`, `receipt = <our uuid>`). `verifyRazorpaySignature` (broken, §3). `createRefund` (broken, §3). **No webhook, no order fetch, no payment fetch.**

### 11.2 Provider additions

```
verifyWebhookSignature({ rawBody: Buffer, signature, secret }) -> boolean   // timing-safe
fetchOrder(orderId)             -> { id, amount, amount_paid, status, receipt, notes }
fetchOrderPayments(orderId)     -> [{ id, status, amount, method, error_code, error_description }]
fetchPayment(paymentId)         -> { id, order_id, status, amount, currency, method, fee, tax }
fetchRefund(paymentId, refundId)-> { id, status, amount, speed_processed }
```

All wrapped with a timeout (`BILLING_GATEWAY_TIMEOUT_MS`, default 10 000) and mapped to `AppError(503, …, 'GATEWAY_UNAVAILABLE')` on network failure — distinct from `502 GATEWAY_REJECTED` for a 4xx from Razorpay, so an operator can tell "they are down" from "we sent rubbish".

### 11.3 Settlement — the one sequence (`settlement.service.settle`)

Called by #233 (`client_callback`), the webhook drain (`webhook`) and the reconciler (`reconciler`). Signature parameter is present only for `client_callback`.

1. **Signature** (client path only). `sha256_hmac(order_id + '|' + payment_id, RAZORPAY_KEY_SECRET)`, `timingSafeEqual`. Failure → write `payment_verification_audits` (`result:'invalid_signature'`, `user_id`, `ip`) → `400 PAYMENT_VERIFICATION_FAILED`. **This restores D-crit-1.**
2. **Locate** the transaction by `(provider, provider_order_id)` — now unique. Miss → `404 TX_NOT_FOUND`. Wrong org (for authenticated callers) → `403 UNAUTHORIZED_TX`.
3. **Gateway cross-check — mandatory on every path, including the client callback.**
   `fetchPayment(paymentId)` and assert **all** of:
   * `payment.order_id === tx.provider_order_id`
   * `payment.status ∈ ('captured','authorized')` — `authorized` only transiently, since `payment_capture: 1`
   * `assertGatewayAmount(tx.amount, payment.amount)` — exact paise equality
   * `payment.currency === tx.currency`

   Any failure → **no activation**. Write a `payment.flagged` event with the mismatch, log at error, and return `409 AMOUNT_MISMATCH` / `409 PAYMENT_NOT_CAPTURED`. **This is what makes a valid signature over a manipulated amount useless**, and it is the reason the signature alone is not treated as proof.
4. **`BEGIN`.** `SELECT … FOR UPDATE` the transaction row.
5. If `status === 'success'` → **idempotent re-entry.** Skip to step 10, ensuring provisioning is complete (the existing `verifyPayment` already has this shape; it is preserved).
   If `status ∈ ('failed','cancelled','refunded','partially_refunded')` → `409 INVALID_PAYMENT_STATE`.
6. `UPDATE transactions SET status='success', provider_payment_id, payment_method, settled_at=now, settled_via=<source>, gateway_fee, gateway_tax WHERE id=:id AND status='pending'`. `affectedCount !== 1` → raise; the row is locked, so this means a genuine anomaly.
7. **`SELECT … FOR UPDATE`** the org's live subscription (`status IN ('active','in_grace','past_due')`), if any.
8. Compute the new period from `intent`:
   * `initial` / `reactivation` → start `now`
   * `renewal` → start `renewalAnchor(current, now)` (old `period_end` if not yet expired, else `now`)
   * `upgrade` → start `now`, **end = the current row's `current_period_end`** (unchanged)
   Then `current_period_end = periodEnd(start, snapshot.billing_cycle)`, `grace_ends_at = graceEnd(end, snapshot.grace_period_days)`.
9. Close the old row (`canceled` for an upgrade supersession, `expired` when a renewal follows an already-expired row — in which case there is no live row to close) and insert the new one with `plan_snapshot`, `change_type`, `previous_subscription_id`, `activated_by_user_id`. The **partial unique index** is the final arbiter: a concurrent duplicate raises a unique violation, which is caught and retried once as the idempotent re-entry of step 5.
10. **Provisioning** (registration path only): activate the org, assign the HR role, create the HR profile, copy the global user profile. Lifted verbatim from today's `verifyPayment`, still `if (!existingRole)`-guarded.
11. `UPDATE transactions SET subscription_id = <new id>`.
12. **Allocate the invoice number — last.** `SELECT … FOR UPDATE` the FY sequence row, increment, format, write `invoice_number`, `invoice_date`, `invoice_snapshot`. Held for microseconds before commit.
13. Write `payment.succeeded` + `subscription.activated|renewed|upgraded` to `subscription_events`.
14. **`COMMIT`.**
15. **Post-commit only:** token issue/blocklist (registration path — already post-commit today, and this plan does not move it), notification enqueue, structured log.

### 11.4 Webhook ingest

`X-Razorpay-Signature` = `HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)` — **the webhook secret, not the API key secret.** Compared with `timingSafeEqual` over equal-length buffers. The body used for the HMAC is the exact `Buffer` from `express.raw`; it is parsed with `JSON.parse` **only after** verification.

Handled events → action:

| Event | Action |
|---|---|
| `payment.captured` | `settlement.service.settle({ source:'webhook' })` |
| `order.paid` | same (redundant with `payment.captured`; the inbox makes the pair idempotent) |
| `payment.failed` | `pending → failed`, store redacted `error_code`/`error_description`, event `payment.failed`, notification |
| `refund.created` | upsert `subscription_refunds` as `pending` |
| `refund.processed` | upsert as `processed`, bump `transactions.refunded_amount`, transition `success → partially_refunded → refunded`, allocate a credit-note number, event `refund.recorded` |
| `refund.failed` | mark `failed`, event `refund.failed` |
| anything else | row → `ignored`, `outcome='unhandled_event_type'` |

### 11.5 Reconciliation (the answer to "gateway timeout → state unknown")

Hourly (§16.3). For each `pending` subscription transaction older than `BILLING_PENDING_GRACE_MINUTES` (default 20):

1. `fetchOrderPayments(order_id)`.
2. A `captured` payment → `settle({ source:'reconciler' })`. **This is what rescues the user who paid and closed the tab**, independent of webhooks.
3. Only `failed` payments → `pending → failed`.
4. No payments and the order is older than `BILLING_ORDER_TTL_HOURS` (default 24) → `pending → cancelled`, event `payment.abandoned`. This is what frees the one-pending-per-org index.
5. Gateway unreachable → leave the row alone, count an error, retry next hour. **Never** infer failure from our own inability to ask.

Separately: `subscription_refunds` stuck in `pending` for > 48 h are re-fetched with `fetchRefund`.

---

## 12. Idempotency & Concurrency

### 12.1 The five mechanisms

| # | Mechanism | Covers |
|---|---|---|
| 1 | **`Idempotency-Key` + `transactions (org_id, idempotency_key)` partial unique** | client retry of #232 after a timeout |
| 2 | **`transactions (org_id) WHERE status='pending' AND type='subscription'` partial unique** | duplicate clicks, multiple tabs, double-submit |
| 3 | **`transactions (provider, provider_order_id)` / `(provider, provider_payment_id)` partial uniques** | the same gateway payment settling twice or two orders |
| 4 | **`billing_webhook_events (provider, provider_event_id)` unique** | at-least-once webhook delivery |
| 5 | **`subscription_events (org_id, dedupe_key)` partial unique** | duplicate notifications from a cron re-run |

Plus `SELECT … FOR UPDATE` on the transaction row and the live subscription row inside settlement, and `UPDATE … WHERE status = <expected>` returning `affectedCount` on every status write (compare-and-set even under a lock).

**`idempotency.utils.js`** is deliberately small: `claim(key, ttl)` → Redis `SET key <pending> NX EX ttl`; `store(key, response)`; `read(key)`. Used for #235–#237, which produce no `transactions` row. **It fails closed on a Redis error** (returns "not a replay" and lets the DB constraints arbitrate) — the opposite of `checkOrgRate`, because a missed replay-guard on a cancel is recoverable while a blocked cancel during a Redis outage is not.

### 12.2 The duplicate-request matrix

| Scenario | Outcome |
|---|---|
| Two `#232` in flight, same plan | one order; the loser gets `409 CHECKOUT_ALREADY_PENDING` **carrying the winner's order**, so both tabs can pay it |
| Two `#232`, different plans | second refused; user voids (#234) first |
| `#232` retried with the same `Idempotency-Key` after a timeout | same stored response, `200`, no second order |
| `#233` called twice | second returns `already_settled: true`, `200` |
| Webhook delivered twice | second insert is `ON CONFLICT DO NOTHING`; `200` |
| Webhook + `#233` concurrently | both call `settle`; the row lock serialises them; one performs the transition, the other takes the idempotent re-entry branch. `settled_via` records who won. |
| Webhook arrives **before** the client returns | webhook settles; `#233` re-enters idempotently and returns the settled state |
| Reconciler races a late webhook | identical to the row above |
| `#235` twice, same `effective` | `200`, idempotent |
| Cron runs twice in a day | every sweep is `WHERE status = <expected> AND <time predicate>`; the second pass matches nothing |
| Two app instances run the same cron | `pg_try_advisory_lock(<job hash>)` per job; the loser exits immediately (§16.4) |

### 12.3 Lock order — total, acquired top-down, never reversed

```
1. transactions            (FOR UPDATE, by id)
2. org_subscriptions       (FOR UPDATE, the org's live row)
3. organizations           (FOR UPDATE, registration path only)
4. billing_invoice_sequences (FOR UPDATE, the FY row)   ← always last, immediately before COMMIT
```

Every service that takes more than one of these takes them in this order. Deadlock is then impossible between billing paths. The invoice sequence is last because it is the one globally-contended row.

### 12.4 Race conditions explicitly handled

* **Settlement vs settlement** — row lock + compare-and-set (§12.2).
* **Settlement vs expiry cron** — the cron's update is `WHERE status='active' AND current_period_end < now`; a settlement that just moved the period forward makes the predicate false. The cron never holds a subscription lock across a gateway call.
* **Upgrade vs expiry** — both take the live-subscription lock; the partial unique index guarantees the second sees the first's result.
* **Cancel vs settlement** — `#235` takes the transaction lock first (to void the pending checkout), so it cannot interleave with a settlement of that same row.
* **Seat check vs invitation** — the seat check in #232/#237 is advisory and **not** locked against concurrent invitations; an org can cross a limit between quote and settle. Accepted: `requireSubscription`'s `checkLimit` is the enforcing gate at invite time, and over-limit is a soft state, not a corruption. **Stated rather than silently hoped.**

---

## 13. Transactions & Failure Handling

### 13.1 Transaction inventory

| Operation | Boundary | External calls inside? |
|---|---|---|
| `#232` checkout | insert-only, one transaction **after** the Razorpay order call | **No** |
| `#233`/webhook/reconciler settlement | one transaction, steps 4–14 of §11.3 | **No** — the gateway cross-check is step 3, before `BEGIN` |
| `#234` void | one transaction; the gateway re-check precedes it | No |
| `#235`/`#236`/`#237` | one transaction each | No |
| Webhook ingest | one insert | No |
| Webhook drain | three transactions per row: claim → (process) → record — the payroll/document drain pattern | the process step's gateway calls sit **between** transactions |
| Expiry sweep | one transaction **per subscription**, not per batch | No |

**Rule:** no external HTTP call ever happens inside an open database transaction. This is already the discipline in `initiateRegistration` and it is preserved everywhere.

### 13.2 The scenarios the brief names

| Scenario | Behaviour |
|---|---|
| **Payment succeeds → DB update fails** | The transaction rolls back; the `transactions` row stays `pending`. The webhook (minutes) or the reconciler (≤ 1 h) settles it. The customer is never charged twice because a retry of #232 hits the one-pending index and resumes the *same* order. |
| **DB succeeds → API response lost** | Committed. The client retries #233 → idempotent re-entry → `200 already_settled`. Or it retries #232 with the same `Idempotency-Key` → the stored response. |
| **Gateway timeout, payment state unknown** | The order exists; the local row stays `pending`. The reconciler asks the gateway the authoritative question. We **never** infer "failed" from a timeout (§11.5 step 5). |
| **Webhook received twice** | `provider_event_id` unique → the second insert is a no-op; both get `200`. |
| **Subscription created → payment-row update fails** | Impossible: both happen in the same transaction (§11.3 steps 6, 9, 11). The old code did **not** have this property for the status flip — the current comment in `verifyPayment` describes fixing exactly this, and settlement preserves the fix. |
| **Invoice number allocated → commit fails** | The sequence increment rolls back with everything else; no gap. That is the whole reason for the table rather than a Postgres sequence. |
| **Two settlements, one from each of two app instances** | Row lock serialises; `affectedCount` arbitrates. |
| **Email send fails after commit** | Contained. The state is correct; the notice is retried by the next cron pass, deduped on `subscription_events.dedupe_key`. |

---

## 14. Security Requirements

| Control | Implementation |
|---|---|
| **Authentication** | `authenticate` on #225–#238. #239 is signature-only and must **never** gain `authenticate`. |
| **Authorization** | `authorize(HR_ONLY)` on #226–#238. Platform roles excluded by construction (`role_planes.js`). |
| **Tenant isolation** | §15. |
| **Payment verification** | HMAC (restored, timing-safe) **plus** the mandatory gateway cross-check of §11.3 step 3. Neither alone activates anything. |
| **Webhook signature** | `RAZORPAY_WEBHOOK_SECRET`, HMAC over the raw bytes, `timingSafeEqual`. Boot fails without the secret. |
| **Replay** | `provider_event_id` unique + the signature (an attacker cannot mint a new body). |
| **Price manipulation** | The client sends `plan_code` only. Amount is read from `subscription_plans` server-side, frozen into `plan_snapshot`, sent to Razorpay by us, and re-asserted against `payment.amount` at settlement. There is no request field in which a price can travel. |
| **Plan manipulation** | `plan_code` must resolve via `findActiveByCode`; intent is derived, not supplied; downgrade-by-checkout is refused (#232 step 4). |
| **org_id manipulation** | Never read from the body on authenticated routes. `#233` deliberately **drops** the `org_id` body field the legacy `verify-payment` accepts. The legacy endpoint keeps it (guest tokens carry no `orgId`) but cross-checks it against `tx.org_id`, as today. |
| **Broken access control / IDOR** | `#230`/`#231` filter `id AND org_id`; a miss is **404**. |
| **Privilege escalation** | The registration path's role assignment is unchanged and still `if (!existingRole)`-guarded. Settlement never grants a role outside the registration path. |
| **Rate limiting** | `checkOrgRate` on #232 (10/h), #235 (5/h), #237 (10/h). Fails open (documented) — DB constraints remain the correctness boundary. |
| **Audit** | `subscription_events` (in-transaction) + `payment_verification_audits` (existing, on every verification attempt, success and failure — today it is written on neither). |
| **Sensitive data** | We store **no** card data, no VPA, no bank account, no token. `payment_method` is a coarse string (`card`/`upi`/`netbanking`). Razorpay ids are stored; signatures and secrets are not. The webhook payload is deny-list redacted before it reaches `billing_webhook_events.payload` (§18.2). |

**Four things the frontend is never trusted for:** price, payment status, organization ownership, subscription status. Each is re-derived server-side; §10.2 shows the request bodies contain none of them.

---

## 15. Multi-Tenant Isolation

Three enforcement layers, all required:

1. **Controller** — `orgId` comes from `req.user.orgId` (frozen object, set by `authenticate` after verifying the user's `user_roles` row and reading the org status). It is never read from the body, query or a header on an authenticated billing route.
2. **Service** — every read and write passes `orgId` explicitly; no service method resolves an entity by id alone.
3. **Repository** — every billing query carries `where: { org_id }`. `subscription_refunds` denormalises `org_id` specifically so this holds without a join. A single-entity fetch is `findOne({ where: { id, org_id } })`, **never** `findByPk(id)` followed by a check.

Cross-tenant probes return **404**, not 403 (§10.2 #230).

`billing_webhook_events` is the one table with **no** `org_id` — a webhook arrives before we know whose it is. It is never exposed through a tenant endpoint; `related_transaction_id` is the only link, and it is resolved server-side.

A test asserts that every method on the four new repositories either takes an `orgId` parameter or is explicitly listed in a small allow-list of org-agnostic methods (webhook inbox, invoice sequence) — the drift guard.

---

## 16. Background Jobs

Three jobs. Registered in `src/server.js` inside the existing `os.platform() === 'linux'` block, following the bare-module pattern of the other twenty.

### 16.1 `subscription_lifecycle.cron.js` — daily 00:20 IST

Five bounded passes, each idempotent, one transaction per subscription:

1. `active` and `now >= current_period_end` → `in_grace` (or `expired` when `grace_period_days = 0`).
2. `in_grace` and `now >= grace_ends_at` → `expired`.
3. `cancel_at_period_end` and `now >= current_period_end` → `canceled`, `ended_at`.
4. Expiring soon: for each org, for each lead day in `billing_reminder_lead_days`, enqueue `notice.expiring` with `dedupe_key = expiring:{subscriptionId}:{leadDays}`.
5. Scheduled **free** downgrades whose period has ended → create the new free subscription, `change_type='downgrade'`, event `subscription.downgrade_applied`.

Batch cap `BILLING_LIFECYCLE_BATCH` (default 500 subscriptions/pass). `runStartupCatchUp()` runs passes 1–3 and 5 on boot (state whose omission has ongoing consequences) and **not** pass 4 (a reminder for a date already past is noise) — the same discrimination the document module makes.

### 16.2 `billing_webhook_drain.cron.js` — every 5 minutes

CLAIM (`received`/`failed` with backoff due, attempts consumed at claim) → PROCESS (outside a transaction; may call the gateway) → RECORD. Batch `BILLING_WEBHOOK_BATCH` (default 100). Max attempts 8, backoff `min(2^attempts, 60)` minutes — the `document_notification.service` shape. A poison row lands in `failed` and is surfaced by the metric in §18.3, not retried forever.

### 16.3 `billing_reconciliation.cron.js` — hourly at :10

§11.5. Batch `BILLING_RECONCILE_BATCH` (default 200). Bounded gateway calls; a gateway outage is counted, not acted on.

### 16.4 Multi-instance safety

The twenty existing crons rely on per-row atomic claims and would double-fire on a multi-instance deploy. #16.2 inherits that protection for free. **#16.1 and #16.3 additionally take `pg_try_advisory_lock(hashtext('billing:<job>'))` for the duration of the run and exit immediately if they do not get it.** Cheap, no new dependency, and it makes a future horizontal scale-out safe rather than merely lucky.

---

## 17. Notifications

**No new outbox table.** Volume is a handful of messages per org per year, every emitter is a cron or a post-commit hook, and `subscription_events` already provides the exact dedupe surface an outbox would (`UNIQUE (org_id, dedupe_key)`). Adding a fifth table to re-implement `document_notifications` would be duplicated architecture for no gain. **D-B12.**

Mechanism: `billing_notification.service.emit(event)` inserts the `subscription_events` row with `ignoreDuplicates: true`; if the insert created a row, it sends; the send result is recorded by a **second** event (`payload.notified_at`) rather than by mutating the ledger (which is append-only). A send failure is contained and retried by the next cron pass, at which point the dedupe key already exists — so retry is handled by an explicit "sent-marker missing" query rather than by re-insert. Bounded, no infinite retry.

Recipients: the org's HR users, plus `billing_notification_emails` (registry #97, ≤ 5).

Events → template subject (one shell file `billing_notification.html`, per-event subject in `TEMPLATE_MAP`, exactly like `document_notification.html`):

| Event | Subject |
|---|---|
| `payment.succeeded` (initial/reactivation) | Your subscription is active |
| `payment.succeeded` (renewal) | Your subscription has been renewed |
| `payment.succeeded` (upgrade) | Your plan has been upgraded |
| `payment.failed` | Your payment could not be completed |
| `notice.expiring` | Your subscription expires in {{DAYS}} days |
| `subscription.expired` | Your subscription has expired |
| `subscription.cancel_scheduled` | Your subscription will not renew |
| `refund.recorded` | A refund has been processed |

`{{CTA_URL}}` is always an application route (`/settings/billing`), **never** a signed URL and never a Razorpay link — the same rule the document module states.

---

## 18. Observability

### 18.1 Structured logs

The codebase uses `console` with a bracketed prefix; billing follows. One line per lifecycle transition:

```
[billing] event=payment.settled org=<uuid> tx=<uuid> order=<order_id> payment=<pay_id>
          intent=renewal via=webhook amount=990.00 INR sub=<uuid> period_end=2027-04-01 dur_ms=142
```

Also logged: checkout created, checkout abandoned, settlement rejected (with the reject reason code), webhook received/duplicate/failed, subscription status transitions with `from→to`, cron pass summaries (the `[Cron] …: scanned=… changed=… errors=…` shape the other twenty use).

### 18.2 Redaction — a deny-list, not a hope

Never logged and never persisted: `razorpay_signature`, `X-Razorpay-Signature`, `RAZORPAY_*` secrets, `Idempotency-Key`, any `card`, `token`, `vpa`, `bank_account`, `contact`, `email` sub-object inside a webhook payload. `billing_webhook_events.payload` is passed through `redactWebhookPayload()` before insert, which keeps `{ event, payload.payment.entity: { id, order_id, status, amount, currency, method, fee, tax, error_code, error_description } }` and drops everything else — an **allow-list**, which is the only redaction that stays correct when the provider adds a field. `#228` applies the same allow-list to `subscription_events.payload`.

### 18.3 Metrics (counters emitted as structured log lines; no metrics dependency exists in the repo)

`billing.checkout.created{intent}`, `billing.payment.settled{intent,via}`, `billing.payment.failed`, `billing.payment.flagged` (**the one that should page** — it means a signature-valid request carried a wrong amount), `billing.webhook.received{type}`, `billing.webhook.duplicate`, `billing.webhook.failed`, `billing.reconciler.settled` (a non-zero value means webhooks are unhealthy), `billing.subscription.transition{from,to}`, `billing.invoice.allocated`.

### 18.4 Correlation

No request-id middleware exists. `payroll_audit.service` already accepts `requestId` from its controllers. Billing follows: the controller reads `X-Request-Id` when present, generates a UUID otherwise, puts it on `subscription_events.payload.request_id` and in every log line for that request. No new middleware.

---

## 19. Org Settings Registry

Two entries. Most billing knobs are **seller**-controlled (price, grace, renewal window, order TTL) and therefore belong in code/plan rows, not in a registry of org-configurable decisions — a distinction the registry's own preamble draws.

Registry entries are written as `### 97. Title (`key`)` headings with the six mandated fields, continuing the document's numbering (it currently ends at 96).

**#97 — Billing Notification Recipients (`billing_notification_emails`)**
Configuration Level: Organizational (`organization_profiles`). Data Type: Array of email strings, ≤ 5. Default: `[]`. Enforcement: `billing_notification.service` recipient resolution; validated in `organization.validator`. Explanation: extra addresses (finance, accounts payable) copied on every billing notice alongside the org's HR users. Empty means HR users only. ON: an org whose finance team must receive invoices. OFF: default.

**#98 — Billing Reminder Lead Days (`billing_reminder_lead_days`)**
Configuration Level: Organizational. Data Type: Array of integers 1–60, ≤ 4 entries, distinct. Default: `[7, 1]`. Enforcement: `subscription_lifecycle.service` pass 4; DB CHECK on cardinality. Explanation: how many days before `current_period_end` expiry warnings are sent; one email per listed lead day, deduped on `subscription_events`. `[]` disables warnings (expiry itself is still notified). ON: an org with a procurement cycle sets `[30, 14, 7, 1]`. OFF: `[]`.

Both are surfaced through the existing `PATCH /organizations/profile` (HR-only) — **no new settings endpoint**, and its validator gains the two keys.

---

## 20. Edge-Case Discharge

| ID | Case | Resolution |
|---|---|---|
| EC-B1 | Org registers, pays, closes the tab before the callback | Webhook settles within minutes; the reconciler within the hour. Both are the same `settle()` call. |
| EC-B2 | Razorpay is down during #232 | `503 GATEWAY_UNAVAILABLE`; no DB row is written (the order call precedes `BEGIN`). |
| EC-B3 | Razorpay is down during #233 | The cross-check cannot complete → `503`. The row stays `pending`; the reconciler finishes it. Never activate on an unverifiable payment. |
| EC-B4 | Signature valid, amount tampered upstream | Cross-check catches it → `payment.flagged`, no activation, `409 AMOUNT_MISMATCH`. |
| EC-B5 | Two orgs, one HR user | `orgId` comes from the token; switching org context switches everything. Already true of the whole system. |
| EC-B6 | Upgrade on the last day of the period | `remaining_days = 0` → `amount_due = 0` → applied free of charge, period end unchanged. Correct: they are buying nothing. |
| EC-B7 | Upgrade from a free perpetual plan | `unused_credit = 0`; a full-price new period starting now. |
| EC-B8 | Renewal attempted 6 months early | `409 RENEWAL_TOO_EARLY`, `details.earliest_at`. |
| EC-B9 | Second `payment.captured` with a different `payment_id` for one order | Cannot both settle (`provider_payment_id` unique). The second is `payment.flagged`; finance refunds manually. |
| EC-B10 | `payment.failed` arrives after `success` | Recorded, `outcome='no_op'`, no demotion. |
| EC-B11 | Webhook arrives for an order we have no row for | `outcome='unknown_order'`, status `ignored`, error log. Almost always a shared-account/misconfiguration signal. |
| EC-B12 | Plan deactivated while orgs are on it | Reads use `plan_snapshot`; `findById` is unfiltered. Nothing 500s. (This is D-crit-4, now structurally impossible.) |
| EC-B13 | Plan price changed in place despite D-B9 | Existing subscriptions and payments are unaffected — they carry snapshots. Only *new* purchases see the new price. |
| EC-B14 | Purchased 31 Jan, monthly | `dayjs.add(1,'month')` → 28/29 Feb, and stays on the 28th. Documented, tested, intentional. |
| EC-B15 | Downgrade scheduled, then the org hires past the target limit | The period-end application of a **free** downgrade re-checks seats; over-limit → the downgrade is **not** applied, an event `subscription.downgrade_cleared` with `reason='seat_limit'` is written, HR is emailed, and the subscription expires normally. Never silently strand an over-limit tenant on a smaller plan. |
| EC-B16 | Cancel (period_end), then renew | `#232` is refused with `409 CANCELLATION_SCHEDULED` pointing to `#236`. Undo first — otherwise "renewed" and "will not renew" are both true. |
| EC-B17 | Cancel (immediate) on the last paid day | Allowed. `ended_at = now`. No refund. |
| EC-B18 | Refund larger than the payment | `CHECK (refunded_amount <= amount)` rejects; the webhook row goes `failed`, error log, manual investigation. |
| EC-B19 | Partial refund then full refund | `refunded_amount` accumulates; status walks `success → partially_refunded → refunded`. |
| EC-B20 | Refund on a subscription that is still active | Recorded only. **A refund does not cancel a subscription** — cancellation is an explicit act (D-B14). |
| EC-B21 | Clock skew / DST | All periods are `TIMESTAMPTZ` and all comparisons are UTC. Crons are scheduled in IST for human-friendly timing only; no business rule reads a local date. |
| EC-B22 | Org deleted while a pending payment exists | `transactions.org_id` is `ON DELETE SET NULL` (existing). The orphan row survives for accounting and is invisible to every tenant read. |
| EC-B23 | Redis down during #232 | `checkOrgRate` fails open; `idempotency.utils` fails closed → the DB constraints arbitrate. Checkout still works. |
| EC-B24 | The DB is down during a feature check | Unchanged — `entitlement.service` already maps it to `503 ENTITLEMENT_DEPENDENCY_FAILURE` (2026-09-24). **This plan does not weaken that.** |
| EC-B25 | `grace_period_days = 0` | `grace_ends_at = current_period_end`; `active → expired` directly. |
| EC-B26 | Legacy subscription with `current_period_end IS NULL` on a *paid* plan | Backfilled in `00065` (§22.2). The `NULL = perpetual` rule only applies to `lifetime` plans thereafter. |
| EC-B27 | An org with two `active` rows today (possible — no constraint existed) | The migration's pre-flight detects it and **aborts with the org ids listed** (§22.1). Fixing data is an operator decision, not a migration's. |

---

## 21. Testing Requirements

`node --test`, no database, repositories stubbed — the project's existing model. **Concurrency and constraint behaviour cannot be executed here** (no DB access, per memory `user-runs-migrations-no-db-access`), so they are covered *statically* by the migration-recorder pattern (fact 22) and *logically* by interleaved-call service tests against a fake row with a simulated lock. That limitation is stated, not papered over.

### 21.1 Pure-utility suites — the bulk of the value

| Suite | Key assertions |
|---|---|
| `money.test.js` | `toPaise('990.00') === 99000`; rejects 3dp; `assertGatewayAmount` throws on off-by-one paise; no float drift across 10 000 random 2dp values |
| `billing_period.test.js` | monthly/yearly/lifetime; the 31 Jan clamp (EC-B14); `renewalAnchor` before vs after expiry; `graceEnd` with 0 days |
| `proration.test.js` | mid-period upgrade arithmetic; `amount_due` floor at 0; the ₹1 minimum; period end never moves; free-source credit is 0 |
| `subscription_state.test.js` | every legal transition accepted; **every illegal one rejected**, enumerated exhaustively over the cross-product; `past_due` is never a target (D-B5); `isEntitled` truth table incl. NULL period |
| `plan_snapshot.test.js` | snapshot completeness vs the model's attribute list (drift guard); accessors tolerate a v1 snapshot |
| `invoice_number.test.js` | FY boundary 31 Mar / 1 Apr; zero-padding; the credit-note prefix |
| `razorpay_signature.test.js` | a known-vector HMAC verifies; one flipped bit fails; **length mismatch returns false rather than throwing**; a regression test that asserts the function does **not** return `true` for a wrong signature (the D-crit-1 guard) |
| `razorpay_refund.test.js` | the client receives `Math.round(rupees*100)` (the D-crit-2 guard) |
| `webhook_redaction.test.js` | the allow-list drops an unknown field; card/VPA/contact never survive |

### 21.2 Service suites (stubbed repositories)

* `settlement_idempotency.test.js` — re-entry on `success`; `affectedCount = 0` handling; unique-violation-on-subscription-insert retried as re-entry; `settled_via` recorded per source.
* `settlement_crosscheck.test.js` — amount mismatch, wrong `order_id`, uncaptured payment, currency mismatch: **none activates**, each emits `payment.flagged`.
* `checkout_intent.test.js` — the full intent-derivation table of #232 step 4, including the downgrade refusal and the zero-amount upgrade.
* `checkout_pending_conflict.test.js` — the unique violation becomes `409 CHECKOUT_ALREADY_PENDING` **with the existing order in `details`**.
* `cancel_rules.test.js` — idempotent same-mode; conflicting mode; free plan refusal; immediate-not-reversible; pending-checkout voiding with the gateway re-check.
* `schedule_change.test.js` — not-a-downgrade; seat violation; clearing.
* `webhook_ingest.test.js` — bad signature → 400 and **nothing persisted**; duplicate event id → 200, one row; missing event-id header falls back to the body hash.
* `webhook_drain.test.js` — claim consumes an attempt; out-of-order `payment.failed` after success is a no-op; unhandled type → `ignored`; backoff schedule.
* `reconciliation.test.js` — captured → settle; only-failed → failed; none + past TTL → cancelled; **gateway error → untouched**.
* `lifecycle_sweep.test.js` — the five passes; running twice changes nothing the second time; startup catch-up skips pass 4; EC-B15.
* `entitlement_period.test.js` — the `isEntitled` matrix through the real service; **the existing DB-503 test must still pass unmodified** (it is the acceptance criterion for not regressing that fix).
* `billing_notification.test.js` — dedupe; a send failure never throws to the caller.

### 21.3 Authorization / isolation suites

* `billing_authz.test.js` — every route's middleware stack asserted by introspecting the router: `authorize(HR_ONLY)` present on #226–#238, `requireFeature` absent everywhere, `authenticate` absent on #239.
* `billing_tenant_isolation.test.js` — every new repository method takes `orgId` or is on the allow-list; `#230` returns 404 (not 403) for a foreign id.

### 21.4 Migration suite

`billing_migration_00065.test.js`, extending `invitation_ledger_migration.test.js`:
* `up()` runs in one transaction and commits once; `down()` is the inverse.
* Column parity between the migration and each of the four new models, and for the three ALTERed tables between added columns and added model attributes.
* **Each named partial unique index of §5 appears** — `org_subscriptions_one_live_uidx`, `transactions_one_pending_subscription_uidx`, `transactions_provider_order_id_uidx`, `transactions_provider_payment_id_uidx`, `transactions_idem_uidx`, `transactions_invoice_number_uidx`, `subscription_events` dedupe, `subscription_refunds` provider-refund, `billing_webhook_events` provider-event.
* The backfill statements of §22.2 are present and ordered **before** the NOT NULL/CHECK they enable.
* The duplicate pre-flight guards are present and run first.

### 21.5 Coverage bar

Every pure util ≥ 95 % branch. Every state transition (legal and illegal) has a named test. Every `errorCode` in §25 is raised by at least one test. **Target: +180 tests, ending at ≥ 2670 passing, 0 failing.**

---

## 22. Migration, Backfill & Backward Compatibility

### 22.1 Operator pre-flight (runs inside `up()`, before any DDL)

```sql
-- abort with a readable message rather than failing on CREATE UNIQUE INDEX
SELECT provider, provider_order_id, count(*) FROM transactions
 WHERE provider_order_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;

SELECT provider, provider_payment_id, count(*) FROM transactions
 WHERE provider_payment_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;

SELECT org_id, count(*) FROM org_subscriptions
 WHERE status IN ('active','past_due') GROUP BY 1 HAVING count(*) > 1;

SELECT count(*) FROM transactions WHERE status='pending' AND type='subscription'
 GROUP BY org_id HAVING count(*) > 1;
```

Any hit → `throw new Error('00065 pre-flight: <table> has duplicates; resolve before migrating: <ids>')`. **Resolving production data is an operator decision and this migration must not make it.**

### 22.2 The backfill — the riskiest step in the plan

Fact 10: **every `org_subscriptions` row in production has `current_period_end IS NULL`.** Introducing a period-aware entitlement predicate without a backfill would mark every tenant as entitled-forever *or* — depending on the predicate's null handling — lock every tenant out on deploy. Neither is acceptable, which is why **D-B2 defines `NULL = perpetual`**: the *unsafe* direction is impossible by construction, and the backfill only needs to give paid plans a real end date.

Ordered statements inside `00065`:

1. `plan_snapshot` ← built by joining each subscription to its `subscription_plans` row **and** its enabled `plan_features` keys, in SQL. Then `SET NOT NULL`, then `DROP DEFAULT`.
2. `grace_period_days` on plans ← default 3 (free/lifetime gets 0; it never expires anyway).
3. `current_period_end` ← for rows whose plan cycle is `monthly`/`yearly`:
   `GREATEST(created_at + interval, now() + interval '30 days')`.
   **The `GREATEST` is the whole safety story:** no existing paid customer can be expired by the deploy; the earliest possible expiry is 30 days out, which is more than enough for finance to contact anyone whose date looks wrong. Rows on a `lifetime` cycle keep `NULL`.
4. `grace_ends_at` ← `current_period_end + grace_period_days` where non-null.
5. `change_type` ← `'initial'` for the oldest row per org, `'renewal'` for the rest (best-effort; the real history begins now, and #227 labels pre-migration rows `is_backfilled: true` from `plan_snapshot.captured_at < migration_time`).
6. `transactions.plan_snapshot`/`plan_id`/`intent` ← from `metadata->>'plan_id'` and `metadata->'order'`, which today's `initiateRegistration` already writes. Rows where it is absent stay NULL and are rendered by #229/#230 with `plan: null` — honest, not fabricated.
7. `transactions.base_amount` ← `amount`; `tax_amount`/`discount_amount` ← `0.00`.
8. **No invoice numbers are backfilled.** A retroactively-minted tax invoice number is a compliance problem, not a feature. #231 returns `409 INVOICE_NOT_AVAILABLE` for pre-migration payments, and the change record says so.

### 22.3 Breaking vs non-breaking

**Non-breaking (additive):** all 15 new endpoints; new columns; new tables; `#2`'s extra response fields; the new org-profile settings keys.

**Behaviourally breaking — all three announced in the change record:**

1. **`#3 /register/verify-payment` now rejects an invalid signature.** Any client (or test harness, or Postman collection) relying on the bypass breaks. This is a security fix and ships regardless.
2. **Entitlement becomes period-aware.** Post-backfill nobody expires for ≥ 30 days, but from then on `requireFeature` and `requireSubscription` can deny an org that previously passed. `402 NO_ACTIVE_SUBSCRIPTION` / `403 FEATURE_NOT_AVAILABLE` gain a real trigger.
3. **`requireSubscription` stops 500ing on a deactivated plan** (D-crit-4) and returns correct limits instead. A client asserting the 500 breaks; none should.

**Rollout order** (each step independently revertible):
`00065` (operator) → deploy code with the period predicate behind `BILLING_PERIOD_ENFORCEMENT` (env, default **`false`**) → verify #226 reports sane periods for a sample of real orgs → flip the flag → enable the crons → configure the Razorpay webhook → announce.

The flag exists for exactly one reason: the backfill's correctness cannot be verified from this environment (no DB access), so the first production check must be a **read**, not an enforcement. Remove the flag one release after the flip.

### 22.4 Rollback

* Code rollback is safe at any point — the new tables are additive and the old code ignores the new columns.
* **Migration rollback destroys `subscription_events`.** The `down()` header must say so. Prefer rolling code back and leaving `00065` applied.
* Webhook rollback: disable the endpoint in the Razorpay dashboard first, otherwise deliveries 404 and retry.

---

## 23. Frontend Impact

A dated change record is **mandatory** per the project rule (CLAUDE.md): `public/md_updates/2026-10-01_org_subscription_and_billing_apis.md`, written in Step 6.

What it must contain:

| Area | Contract |
|---|---|
| **Pricing page** | #225. `is_current` marks the org's plan. `amount` is a rupee string, not a number — parse, do not multiply. |
| **Billing dashboard** | #226 → status pill, plan card, period bar, `days_remaining`, seat usage meters, the cancellation/scheduled-change banner. |
| **Purchase / renew / upgrade** | **#238 first, always.** Render `amount_due`, `proration`, `new_period_end`, and disable the button when `blocked_reason` is set. Then #232 → open the Razorpay modal with `order.id` + `razorpay_key_id` → in the modal `handler`, call #233. **On any failure of #233, do not show an error — show "payment received, confirming…" and poll #226**, because the webhook or reconciler will complete it. This is the single most important frontend behaviour change in the document. |
| **`Idempotency-Key`** | The client must generate one UUID per user-initiated checkout attempt and **reuse it across retries of that same attempt**. |
| **Abandoned checkout** | A `409 CHECKOUT_ALREADY_PENDING` carries the pending order in `details` — offer "resume payment" or "cancel and start over" (#234). |
| **Cancellation** | #235 with `effective`; `immediate` requires `confirm: true` and must show the no-refund copy. #236 to undo. |
| **Downgrade** | #237, not #232. Surface `SEAT_LIMIT_EXCEEDED.details` as "remove N employees first". |
| **History** | #227 (subscriptions), #229/#230 (payments), #228 (audit trail). |
| **Invoice** | #231. **PDF is not available in this phase**; render the JSON or offer print. Pre-migration payments return `409 INVOICE_NOT_AVAILABLE` — show "contact support". |
| **Expiry UX** | `in_grace` must be visually distinct from `active`: access still works, but it is a warning state. |
| **New error codes** | The full table in §25 with the recommended user-facing copy for each. |
| **Registration flow** | Unchanged paths. **`register/verify-payment` now genuinely fails on a bad signature** — any dev fixture passing a dummy signature must be updated. |

---

## 24. Implementation Sequence

Seven steps. Each is independently shippable and leaves the tree green.

### Step 0 — Security fixes and pre-flight (no schema, no endpoints)
**Objective:** stop the bleeding and confirm the environment.
* Restore the signature comparison (timing-safe) and the caller's rejection branch + `payment_verification_audits` write. *(D-crit-1)*
* Fix the refund paise bug. *(D-crit-2)*
* Add `RAZORPAY_WEBHOOK_SECRET` to the config guard and to the deployment env.
* Confirm the Razorpay dashboard sends `X-Razorpay-Event-Id` and note the exact enabled event list.
* Run the §22.1 duplicate queries as **read-only** checks and hand the results to the operator.
**Verify:** `razorpay_signature.test.js` + `razorpay_refund.test.js` pass; `npm test` still 2490+.
**Completion:** a forged `verify-payment` returns 400.

### Step 1 — Schema, models, historical integrity
**Objective:** the lifecycle spine exists and history is self-describing.
* Migration `00065` (all of §5, including the backfill and pre-flight guards) — **authored, tested statically, handed back unrun.**
* Four new models; three model ALTERs; `subscription_plan.repository` split (D-crit-4); repository additions.
* `plan_snapshot.utils`, `money.utils`, `billing_period.utils`, `invoice_number.utils`, `billing_defaults.js`.
* Period-aware `entitlement.service` + `subscription.middleware`, **behind `BILLING_PERIOD_ENFORCEMENT`**.
**Verify:** `billing_migration_00065.test.js` green; the existing entitlement-503 test passes **unmodified**.
**Completion:** the migration is handed back with a written pre-flight checklist; no behaviour has changed with the flag off.

### Step 2 — Read plane (#225–#231, #238)
**Objective:** HR can see everything before anything can move.
* `billing.index.js`, three route files, two controllers, two validators, `subscription.service` read methods, `proration.utils`, `subscription_state.utils`.
* Mount in `app.js`.
**Verify:** authz and tenant-isolation suites; #238 ≡ #232-quote equivalence test (T-B31) against the not-yet-built #232 quote function, which Step 2 therefore writes.
**Completion:** the billing dashboard is buildable end to end with no money path live.

### Step 3 — Checkout and settlement (#232–#234)
**Objective:** one chokepoint, three callers.
* `checkout.service`, **`settlement.service`**, `idempotency.utils`, rate-limit buckets (D-B13).
* Refactor `organization.service.initiateRegistration` / `verifyPayment` onto them — **paths and response shapes unchanged**.
* Invoice number allocation.
**Dependencies:** Steps 0, 1, 2.
**Verify:** the six settlement/checkout suites; a manual end-to-end purchase in the Razorpay test account.
**Completion:** purchase, renewal and upgrade work through the modal; the registration flow is unchanged from the client's perspective.

### Step 4 — Webhooks and reconciliation (#239)
**Objective:** the client is no longer load-bearing.
* **Move the `/webhooks/razorpay` `express.raw()` mount above `express.json()` in `src/app.js` (fact 5) — do this first; nothing else in Step 4 works without it.**
* `webhook.controller`/`routes` at the raw path, `billing_webhook.service`, `billing_reconciliation.service`, two crons.
* Configure the webhook in the Razorpay dashboard (ops).
**Verify:** webhook suites; deliberately abandon a paid checkout in test and confirm the reconciler settles it.
**Completion:** killing the browser mid-payment still activates the subscription.

### Step 5 — Cancellation, scheduled change, expiry, notifications (#235–#237)
* `subscription_lifecycle.service` + cron + startup catch-up, `billing_notification.service`, the email template, registry #97/#98 and the two profile columns' validator entries.
**Verify:** lifecycle-sweep and cancel-rule suites; a forced-clock dry run of the sweep.
**Completion:** a subscription expires, warns, grace-periods and cancels without human involvement.

### Step 6 — Refund ingestion, docs, enablement
* Refund webhook handlers, the stuck-refund sweep, credit-note numbering.
* `public/md_updates/2026-10-01_org_subscription_and_billing_apis.md` (§23).
* `public/md_system/api_registry.md` — 15 rows, #225–#239.
* `public/md_settings/org_settings_registry.md` — #97, #98.
* `public/md_organization/7_org_subscription_and_billing_api.md` — the contract doc, in the module's existing numbered series.
* **Correct `public/md_core-workflows/billing-and-entitlements.md`** (fact 12) so it describes what exists.
* Flip `BILLING_PERIOD_ENFORCEMENT` after the §22.3 verification read.

---

## 25. Error Code Reference

| Code | Status | Raised by | Meaning |
|---|---|---|---|
| `PLAN_NOT_FOUND` | 404 | #232, #237, #2 | unknown or non-purchasable `plan_code` |
| `NO_ACTIVE_SUBSCRIPTION` | 402 | `requireSubscription` | no entitling subscription (**now reachable by expiry**) |
| `FEATURE_NOT_AVAILABLE` | 403 | `requireFeature` | plan lacks the feature, or the subscription has lapsed |
| `ENTITLEMENT_DEPENDENCY_FAILURE` | 503 | `entitlement.service` | **existing** — DB unreachable; unchanged |
| `CHECKOUT_ALREADY_PENDING` | 409 | #232 | a pending checkout exists; `details` carries it |
| `USE_SCHEDULED_DOWNGRADE` | 409 | #232 | target is cheaper; use #237 |
| `PLAN_CHANGE_NOT_SUPPORTED` | 409 | #232 | equal-price lateral move |
| `RENEWAL_TOO_EARLY` | 409 | #232 | outside the renewal window; `details.earliest_at` |
| `SEAT_LIMIT_EXCEEDED` | 409 | #232, #237 | headcount exceeds the target plan; `details` per role |
| `CANCELLATION_SCHEDULED` | 409 | #232 | undo the cancellation first (#236) |
| `NO_PENDING_CHECKOUT` | 404 | #234 | nothing to void |
| `PAYMENT_ALREADY_CAPTURED` | 409 | #234, #235 | the gateway captured it; it will settle |
| `PAYMENT_VERIFICATION_FAILED` | 400 | #233, #3 | signature invalid |
| `PAYMENT_NOT_CAPTURED` | 409 | settlement | gateway says the payment is not captured |
| `AMOUNT_MISMATCH` | 409 | settlement | gateway amount ≠ our amount |
| `INVALID_PAYMENT_STATE` | 409 | settlement | illegal payment transition; `details {from,to}` |
| `INVALID_SUBSCRIPTION_STATE` | 409 | lifecycle | illegal subscription transition |
| `TX_NOT_FOUND` | 404 | settlement, #230 | **existing code, reused** |
| `UNAUTHORIZED_TX` | 403 | settlement | transaction belongs to another actor/org |
| `ORG_MISMATCH` | 400 | #3 | **existing, preserved** |
| `SUBSCRIPTION_NOT_ACTIVE` | 409 | #235, #237 | terminal subscription |
| `ALREADY_CANCELLED` | 409 | #235 | cancelled with a different `effective` |
| `CANNOT_CANCEL_FREE_PLAN` | 409 | #235 | nothing to stop billing |
| `CANCELLATION_NOT_REVERSIBLE` | 409 | #236 | `immediate` cancellations are final |
| `NO_SCHEDULED_CANCELLATION` | 409 | #236 | nothing to undo |
| `NOT_A_DOWNGRADE` | 400 | #237 | target is not cheaper |
| `INVOICE_NOT_AVAILABLE` | 409 | #231 | unsettled, or pre-migration |
| `INVALID_WEBHOOK_SIGNATURE` | 400 | #239 | HMAC mismatch |
| `GATEWAY_UNAVAILABLE` | 503 | any gateway call | network/timeout — retry |
| `GATEWAY_REJECTED` | 502 | any gateway call | Razorpay returned 4xx |
| `BILLING_RATE_EXCEEDED` | 429 | #232, #235, #237 | with `Retry-After` |

---

## 26. Decisions

| ID | Decision | Reason |
|---|---|---|
| **D-B1** | Build in `src/modules/billing/`, mounted at `/api/v1/billing`; the two onboarding endpoints keep their paths and delegate inward. | The models already live there. Moving the onboarding paths would break the frontend for zero benefit; leaving the logic duplicated would mean two settlement implementations, which is exactly the failure this plan exists to prevent. |
| **D-B2** | `current_period_end IS NULL` means **perpetual**, legal only for a `lifetime` cycle. | Makes the backfill of ~every existing row non-breaking in the safe direction. The dangerous direction (null ⇒ expired) cannot occur. |
| **D-B3** | No `pending` subscription status. A subscription row exists only once paid. | Removes orphaned rows, makes the one-live-per-org index total, and matches what the code already does. |
| **D-B4** | Expiry changes the **subscription**, never `organizations.status`. | `requireActiveOrg` reads org status. Flipping it on expiry would lock a tenant out of the very endpoints they need to pay. |
| **D-B5** | `past_due` stays in the enum and is unreachable; no dunning. | We integrate Orders, not Subscriptions — there is no auto-debit mandate, so no charge can fail unattended. Removing the value costs a second type swap for nothing. |
| **D-B6** | Money stays `DECIMAL(n,2)` rupees; **all** paise conversion goes through `money.utils`. | Matches `payroll_run_items` (`DECIMAL(14,2)`) and the existing billing columns. Switching to paise would fork the codebase's money convention for one module. |
| **D-B7** | **No invoice table.** Invoice number/date/snapshot are columns on the settled `transactions` row. | One payment ⇄ one invoice, always, in this model. A table would add a join and a second lifecycle for no expressive gain. Split it when an invoice needs multiple line items or partial payments — and not before. |
| **D-B8** | `discount_amount` and `tax_amount` exist and are always `0.00`. | Two nullable-safe columns now versus a migration on the largest financial table later. The alternative — computing GST — is out of scope and the seeded prices are tax-inclusive. |
| **D-B9** | A plan's price is **immutable once referenced**; a price change is a new plan row. | The only design in which "what did this customer actually agree to" is answerable. Backstopped by `plan_snapshot` so a violation still cannot corrupt history. |
| **D-B10** | A failed payment is terminal. A retry is a new transaction with a new order. | `failed → pending` is the transition that produces double charges. Removing it removes the class. |
| **D-B11** | The payment enum gains only `partially_refunded`. No `created`/`processing`/`authorized`/`expired`. | The brief's example list is not our reality: `payment_capture: 1` means `authorized` is never a resting state, and we have no signal that distinguishes `created` from `pending`. A state nothing can enter is a liability. |
| **D-B12** | No billing notification outbox table; `subscription_events` is the dedupe surface. | Its `(org_id, dedupe_key)` unique gives exactly what an outbox gives, at this volume, with one fewer table and one fewer drain. |
| **D-B13** | `checkOrgRate` gains an optional `keyPrefix` defaulting to `'pdf'`. | Billing counters under a `pdf:` namespace would mislead the next operator. A default-preserving optional param keeps every existing key byte-identical — asserted by the existing preview-limit tests, which must pass unmodified. |
| **D-B14** | **No refund-initiation API.** Refunds are issued in the Razorpay dashboard and ingested by webhook + reconciler. A refund never cancels a subscription. | A refund is a seller action and no platform plane exists to hold it (`role_planes.js`). Ingestion gives complete records without inventing an authorization plane. |
| **D-B15** | The client sends `plan_code` only; the server derives the intent. | Intent is a function of current state, which the client cannot be trusted to know and has no reason to compute. It also collapses four endpoints into one. |
| **D-B16** | Downgrades are scheduled, never prorated, and auto-applied only when the target is free. | We hold no payment mandate, so a paid downgrade cannot be charged unattended. Refund-on-downgrade is the "unnecessary billing complexity" the brief warns against. |
| **D-B17** | Webhook: persist-then-ack, drain on a 5-minute cron. | Razorpay's timeout is short and our provisioning is not. The inbox makes late processing safe; the client callback covers the interactive case. |
| **D-B18** | The gateway cross-check is mandatory on **every** settlement path, including the signed client callback. | A signature proves the message came from us round-tripping through Razorpay; it does not prove the amount captured. One is authentication, the other is reconciliation, and a payment system needs both. |
| **D-B19** | `BILLING_PERIOD_ENFORCEMENT` env flag, default off, removed one release after the flip. | The backfill's correctness cannot be verified from this environment. The first production check must be a read. |

---

## 27. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The backfill produces a wrong `current_period_end` for a real paying customer | Medium | High | `GREATEST(…, now + 30 days)` floor; the enforcement flag; a #226 read across real orgs before the flip |
| Duplicate `provider_order_id` rows exist in production and block the migration | Low | Medium | §22.1 pre-flight aborts with the ids listed; the operator decides |
| Razorpay does not send `X-Razorpay-Event-Id` in this account's configuration | Low | Low | body-hash fallback, already specified; confirmed in Step 0 |
| The one-pending-per-org index blocks a legitimate second checkout while a stale row lingers | Medium | Low | #234 voids explicitly; the reconciler cancels after 24 h; the 409 returns the pending order so the UI can resume |
| The webhook is configured before the endpoint ships, or after — either way a gap | Medium | Medium | Step 4 sequences code first, dashboard second; the reconciler covers the gap regardless |
| The invoice sequence row becomes a global serialization point | Low | Low | Acquired last, held for microseconds; if volume ever justifies it, shard the scope per financial year (already the PK) |
| Enforcement flips and an org is denied because of an unrelated data problem | Medium | High | Flip during business hours; `#226` is always readable (never feature-gated); `subscription_events` shows exactly why |
| The crons double-fire on a future multi-instance deploy | Low | Medium | `pg_try_advisory_lock` on the two non-claim-based jobs (§16.4) |
| Scope creep into auto-debit / Razorpay Subscriptions | Medium | Medium | Explicitly out of scope (§1.3); D-B5 records what would have to change |

---

## 28. Documentation Deliverables

| Artifact | Action |
|---|---|
| `public/md_updates/2026-10-01_org_subscription_and_billing_apis.md` | **New** — the frontend change record (§23). Mandatory per CLAUDE.md. |
| `public/md_system/api_registry.md` | **Append** a `## Billing Module` section, 15 rows (#225–#239), with the Dashboard column set to `hr` throughout. |
| `public/md_settings/org_settings_registry.md` | **Append** #97, #98 in the exact field structure its preamble mandates. |
| `public/md_organization/7_org_subscription_and_billing_api.md` | **New** — the contract doc, matching the style of `1_org_registration_api.md`…`6_*`. |
| `public/md_organization/1_org_registration_api.md` | **Amend** — signature verification is now enforced; `#2`'s response gains `transaction_id`. Its "Internal Working" step 4 currently describes an enforcement that does not exist; after Step 0 it becomes true. |
| `public/md_core-workflows/billing-and-entitlements.md` | **Correct** — §3 describes webhook verification and idempotency as implemented (fact 12). Rewrite against reality. |
| `public/md_system/background-jobs.md` | **Append** the three crons. |
| `public/md_system/configuration.md` | **Append** `RAZORPAY_WEBHOOK_SECRET`, `BILLING_PERIOD_ENFORCEMENT`, and the seven `BILLING_*` tunables. |
| `public/md_system/database.md` | **Append** the four new tables and the three ALTERs. |
| `public/md_organization/md_rag/org_registration_and_subscription_qa.md` | **Amend** — it predates all of this. |

---

## 29. Final Acceptance Criteria

The feature is complete when **all** of the following are demonstrably true:

1. A forged `verify-payment` or `checkout/verify` call — valid session, invalid signature — returns `400 PAYMENT_VERIFICATION_FAILED`, writes a `payment_verification_audits` row, and activates nothing.
2. A signature-valid call whose gateway amount differs from ours activates nothing and emits `payment.flagged`.
3. Paying and then killing the browser before the callback still results in an active subscription — via the webhook within minutes, or the reconciler within the hour — with exactly **one** `transactions` row in `success` and exactly **one** new `org_subscriptions` row.
4. The same webhook delivered five times produces one `billing_webhook_events` row and one state change.
5. Clicking Pay in three tabs produces one Razorpay order and one charge.
6. `subscription_events` contains a row, with actor and `from → to`, for every status change of every subscription and payment — and the ledger has no update path.
7. Deactivating a plan changes nothing for the orgs on it: #226, #227, `requireSubscription` and `requireFeature` all keep working from `plan_snapshot`.
8. A subscription reaches `current_period_end`, enters `in_grace`, warns at each configured lead day, and expires — with no human involvement and no duplicate emails across repeated cron runs.
9. An upgrade charges the prorated difference, does not move the period end, and leaves the superseded row `canceled` with `ended_at` set.
10. A downgrade that would breach seat limits is refused at schedule time with the excess enumerated per role.
11. Every tenant-scoped read filters on `org_id` at the repository; a cross-tenant id returns 404.
12. Amount, plan price, payment status, subscription status and organization ownership appear in **no** request body on any authenticated billing endpoint.
13. Migration `00065` is authored, statically verified by `billing_migration_00065.test.js`, and handed back to the operator with the §22.1 pre-flight checklist. **It is not run from this environment.**
14. `npm test` ≥ 2670 passing, 0 failing; every existing test passes unmodified, including the entitlement DB-503 suite and the PDF preview rate-limit suite.
15. Every code path that could move money is reachable only through `settlement.service`, and a test asserts no other module imports `transaction.repository.updateTransactionStatus`.
16. The frontend change record, the API registry rows, the settings registry entries and the corrected workflow doc are all committed.
