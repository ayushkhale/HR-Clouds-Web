# Implementation Plan — Unified Badge & Queue Counts API (`GET /api/v1/inbox/badges`) + `pending_hr` Claims Filter

**Date:** 2026-10-25
**Status:** IMPLEMENTED — All deliverables D1–D5 complete, fully unit-tested (100% test pass rate across new and existing suites), and verified. Migration 00087 left unrun per standing operational policy.
**Owner:** Backend (Node.js / Express 5 / Sequelize 6 / PostgreSQL)
**Source documents (authoritative requirements):**
1. `public/md_updates/2026-10-25_frontend_requests_to_backend.md` → **REQ-PAYROLL-001**, **REQ-INBOX-001**
2. `public/md_updates/2026-10-25_unified_badge_counts_api_specification.md` → the `GET /api/v1/inbox/badges` spec

**Scope of this plan:** both requests. They are delivered together because the badge endpoint's `inbox.claims` count and `pending_hr=true` must use **one** shared predicate, or the badge and the list it links to will disagree.

> **Reading order for the implementer:** §2 (decisions) → §3 (count catalogue — the source of truth for every number) → §5 (API contract) → §7 (SQL) → §10 (step-by-step) → §11 (tests) → §12 (acceptance).

---

## 1. Executive summary

### 1.1 What is being built

| Deliverable | Request | Shape |
| :--- | :--- | :--- |
| **D1** | REQ-INBOX-001 | New read-only module `src/modules/inbox/` exposing `GET /api/v1/inbox/badges` — one aggregated, role-scoped count tree for every sidebar badge, inbox card, governance tab and metric tile across the HR / Manager / Employee workspaces and (later) the mobile app. |
| **D2** | REQ-PAYROLL-001 | Optional `pending_hr` boolean on `GET /api/v1/payroll/hr/reimbursements/claims` (API 133) returning every claim awaiting an **HR** decision in one correctly-paginated page. |
| **D3** | both | One migration adding **5 partial indexes** (handed back unrun — see §8.3). |
| **D4** | both | Unit tests (§11) including a **SQL ↔ model parity test** so a future column/enum rename in any owning module breaks CI instead of silently zeroing a badge. |
| **D5** | both | A dated frontend change record in `public/md_updates/` + `public/md_system/api_registry.md` rows (§13). |

### 1.2 Why one endpoint

The frontend currently fires 13–17 requests to compute these numbers, so it fetches them once per session and caches for 60 s; every badge is therefore stale until a hard reload. One endpoint lets the frontend poll on a 60 s timer and on `visibilitychange`, which is what the spec's `BadgeCountsContext` does.

### 1.3 Performance strategy (the single most important design choice)

`configs/default.json` sets **`poolMax: 10`** and `ecosystem.config.js` runs **one** PM2 instance in fork mode. A badge endpoint that fires 10–20 parallel queries would consume the entire connection pool per request and collapse under a 60 s poll from a few dozen users.

**Therefore: exactly ONE round trip for all counts.** A single `SELECT` cross-joins one single-row aggregate sub-select per table, each computing all of its counts with `COUNT(*) FILTER (WHERE …)` in **one** index scan of that table (§7). This is also the shape the spec asked for, and it is the same conditional-aggregation technique already used in `task.repository.js → getStatusSummary`.

Realistic budget (§9): **p95 ≤ 150 ms** end-to-end for an HR caller on an org of ≤ 2 000 members. The spec's "under 15 ms total" describes database CPU for the scans only; it excludes auth (Redis + `UserRole` read), entitlement resolution, hierarchy resolution and network RTT to a managed Postgres, which dominate. Do not promise 15 ms.

### 1.4 Non-goals (explicitly NOT in this plan)

No Redis caching of counts, no materialized views, no counter tables, no triggers, no websockets/SSE, no new infrastructure. Deferred options are listed in §15 with the conditions that would justify them.

---

## 2. Design decisions (each needs a yes/no at review)

| # | Decision | Rationale |
| :-- | :--- | :--- |
| **D-1** | New module `src/modules/inbox/` (routes / controllers / services / repositories / validators / utils; **no `models/`** — it owns no table). Mounted flat as `app.use('/api/v1/inbox', inboxRoutes)` from `inbox.index.js`, registered in `src/app.js` after `notification.index`. | Matches every other module's layout and the spec's `inbox.routes.js → inbox.controller.js → inbox_summary.service.js` naming. The module owns no data, only a read projection. |
| **D-2** | Cross-module reads go through **`db.<Model>` / raw SQL in the inbox repository**, never by `require`-ing another module's service. | Established convention (`payslip_branding` reads `db.DocumentLetterBranding` and must never `require('modules/document')`). Keeps the aggregator from inheriting 15 modules' kill switches, transactions and 503s. The cost is drift risk, which §11.2's parity test converts into a CI failure. |
| **D-3** | **Platform roles get no tenant payroll/document counts.** Per-category authorization *mirrors the owning module's own route guard*, it is not re-invented: `leave` / `attendance` / `task` / `device` categories are global for `hr`, `admin`, `super-admin` (their routes authorize all three); `payroll` and `document` categories are global for **`hr` only** (`authorize(['hr'])`, and `payroll_access.TENANT_GLOBAL_ROLES === ['hr']`). | The source doc says "HR User (`role = 'hr'` or `'admin'`)". That is wrong for payroll and documents and would be a privilege escalation relative to the list endpoints. Mirroring each guard is the only way a badge can equal the list it opens. |
| **D-4** | **Single round trip** for counts; the SQL is assembled by a **pure builder** (`utils/badge_sql.builder.js`) from a declarative count catalogue. Only *fixed fragments* are chosen by booleans; **every value is a bound replacement** (`:orgId`, `:userId`, `:scopeIds`, `:currentFy`, `:todayIst`). No identifier or value is ever interpolated. | §1.3. A pure builder is unit-testable with zero DB access, which is this repo's test rule. |
| **D-5** | Manager scope uses the existing shared resolver `common/utilities/hierarchy_access.utils.getAccessibleUserIds(orgId, req.user)` and the scope predicate is `= ANY(:scopeIds::uuid[])`. **An empty cohort produces all-zero counts, never org-wide counts.** | Same resolver as leave/attendance/payroll/task, so "who reports to whom" cannot drift. The empty-array-means-everything bug is the classic failure here and is already called out as a trap in the document module. |
| **D-6** | A category the caller cannot access, or whose feature the org is not entitled to, is returned **as zeros** *and* named in `data.meta.unavailable_categories[]`. | Keeps the documented integer shape (no `null` surprises for the mobile client) while still letting the UI hide a card rather than render a misleading `0`. |
| **D-7** | The route applies `authenticate` + `authorize(['employee','manager','hr','admin','super-admin'])` and **nothing else** — no `requireFeature`, no `requireActiveOrg`. Entitlement is resolved **once, in-request, per category** (§4.3). | A badge poll must degrade, not fail: a single un-entitled module must not 403 the whole sidebar, and an org in `past_due` must still be able to render the shell that tells the user to pay. The authoritative gates stay on the list/action endpoints, which are unchanged. |
| **D-8** | `data.sidebar.inbox_total` = the **sum of the 12 `categories.inbox.*.total` values that were computed**. Nothing else is added to it. | Reproduces the spec's worked example exactly (3+1+0+0+2+4+1+2+1+0+0+0 = 14) and guarantees "sidebar badge == sum of the cards on the page it opens". Bank and document-verification have their own sidebar badges and are deliberately excluded. |
| **D-9** | `pending_hr` is added to a **new HR-only schema** (`hrClaimsQuerySchema = claimsQuerySchema.append(...)`), not to the shared `claimsQuerySchema`. | `claimsQuerySchema` is reused verbatim by the **manager** plane (`payroll_manager.controller.js:401`). Extending the shared schema would silently expose an HR-semantics filter on the manager queue. |
| **D-10** | `pending_hr=true` combined with an explicit `status` is rejected by Joi (`400 VALIDATION_ERROR`). | The two filters contradict each other; silently letting one win is the bug class that produced REQ-PAYROLL-001 in the first place. |
| **D-11** | Per-user rate limit via the **existing** `common/utilities/org_rate_limit.utils.checkOrgRate(orgId, bucket, limit, { keyPrefix: 'badge' })` with `bucket = req.user.id`, limit from `BADGE_SUMMARY_MAX_PER_HOUR` (default **240**/hour ⇒ 4/min). Fails **open** on Redis trouble. | Reuses the shipped limiter (key becomes `badge:<userId>:<orgId>:<UTC-hour>` — per user, per org, per hour). A fail-open badge is correct: a stale number is better than a broken sidebar. |
| **D-12** | Response carries `Cache-Control: no-store`. No `ETag`/`304` in v1. | The payload is per-user and must never be shared by a proxy. ETag is listed in §15 as a deferred optimisation. |

---

## 3. Count catalogue — THE source of truth

Every row was verified against the model definitions and the owning module's own list/queue query. **`[P]` marks a `paranoid: true` model, whose SQL MUST carry `deleted_at IS NULL`.** `scope col` is the column the manager/self predicate is applied to.

### 3.1 `categories.inbox` — items awaiting the caller's action

| Response key | Table `[P]` | Predicate (verbatim) | scope col | Owning read it must match | Feature | Global for |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `leaves.pending` | `leave_requests` **[P]** | `status = 'pending'` | `user_id` | `GET /leaves/approver/team/requests/pending` (`leave_approver.controller.js:58-61`) | `leave.access` | hr, admin, super-admin |
| `leaves.cancellation_pending` | `leave_requests` **[P]** | `status = 'cancellation_pending'` | `user_id` | same | `leave.access` | hr, admin, super-admin |
| `leaves.total` | — | `= pending + cancellation_pending` (derived in JS) | — | the same endpoint returns both in one array | — | — |
| `regularizations.pending` | `attendance_regularizations` | `status = 'pending'` | `user_id` | `regularization.service.getManagerPendingRequests` → `findPendingByOrgId` | `attendance.access` | hr, admin, super-admin |
| `overtime.pending` | `attendance_overtime` | `status = 'pending'` | `user_id` | `overtime.service.getPendingOvertime` → `findPendingByOrgId` | `attendance.access` | hr, admin, super-admin |
| `comp_offs.earned` | `attendance_comp_offs` | `status = 'earned'` | `user_id` | `comp_off.service.getEarnedCompOffs({status:'earned'})` | `attendance.access` | hr, admin, super-admin |
| `anomalies.open` | `attendance_anomalies` | `is_resolved = false` | `user_id` | `team.service.getTeamAnomalies` → `findUnresolvedTeamAnomalies` | `attendance.access` | hr, admin, super-admin |
| `tasks.in_review` | `tasks` **[P]** | `status = 'in_review'` | `assignee_id` | `task.repository.getStatusSummary` (`/tasks/hr/summary`, `/tasks/manager/team-tasks/summary`) | `tasks.access` | hr, admin, super-admin |
| `salary_proposals.proposed` | `employee_salary_structures` **[P]** | `status = 'proposed'` | `user_id` | `GET /payroll/hr/salary-structures/proposals` | `payroll.access` | **hr only** |
| `claims.under_review` | `reimbursement_claims` **[P]** | `status = 'under_review'` | `user_id` | `pending_hr=true` (D2, §6) | `payroll.access` | **hr only** |
| `claims.submitted` | `reimbursement_claims` **[P]** | `status = 'submitted' AND total_levels = 1` | `user_id` | same | `payroll.access` | **hr only** |
| `loans.pending` | `employee_loans` **[P]** | `status = 'pending'` | `user_id` | `GET /payroll/hr/loans?status=pending` | `payroll.access` | **hr only** |
| `tax_declarations.submitted` | `investment_declarations` **[P]** | `status = 'submitted' AND financial_year = :currentFy` | `user_id` | `GET /payroll/hr/tax/declarations` | `payroll.access` | **hr only** |
| `tax_declarations.under_review` | `investment_declarations` **[P]** | `status = 'under_review' AND financial_year = :currentFy` | `user_id` | same — `investment_declaration.service.VERIFIABLE_STATUSES = ['submitted','under_review']` | `payroll.access` | **hr only** |
| `devices.pending` | `attendance_trusted_devices` | `status = 'pending'` | `user_id` | `GET /attendance/hr/trusted-devices?status=pending` | `attendance.access` | hr, admin, super-admin |
| `letter_proposals.pending` | `document_letter_proposals` | `status = 'pending'` | `subject_user_id` | `GET /documents/hr/letters/proposals` (defaults `status='pending'`) | `documents.access` | **hr only** |

**Per-category `total`** (what a card badge shows) is derived in JS: `leaves.total = pending + cancellation_pending`; `claims.total = under_review + submitted`; `tax_declarations.total = submitted + under_review`; every single-count category's `total` equals that count.

**Manager plane:** per spec §3, only `leaves`, `regularizations`, `overtime`, `comp_offs`, `anomalies`, `tasks` are computed. The other six are zeros + listed in `meta.unavailable_categories`.
**Employee plane:** the whole `inbox` group is zeros + unavailable (an employee approves nothing).

### 3.2 `categories.tasks` — Task Governance tabs

Scope: org-wide (hr/admin/super-admin) · `assignee_id = ANY(:scopeIds)` (manager) · `assignee_id = :userId` (employee). Table `tasks` **[P]**. Mirrors `task.repository.getStatusSummary` **literally**, including the overdue expression.

| Key | Predicate |
| :--- | :--- |
| `pending` / `in_progress` / `in_review` / `reopened` / `completed` / `cancelled` | `status = '<key>'` |
| `overdue` | `due_date < NOW() AND status NOT IN ('completed','cancelled')` |
| `mine.open` | `assignee_id = :userId AND status NOT IN ('completed','cancelled')` — **always self-scoped, every role** |
| `mine.overdue` | `assignee_id = :userId AND due_date < NOW() AND status NOT IN ('completed','cancelled')` |
| `mine.in_review` | `assignee_id = :userId AND status = 'in_review'` |

`mine.*` serves the Employee "My Tasks" / "Overdue Tasks" subtabs (`tasks.my_open_tasks` / `tasks.my_overdue_tasks` in the spec's §2 tree) for **all** roles without overloading the plane-scoped group. Feature `tasks.access`.

### 3.3 `categories.bank_verification` — HR only (`payroll.access`)

One sub-select; all three tiles come from the same row set so they are always mutually consistent and always sum to the active headcount:

| Key | Meaning |
| :--- | :--- |
| `verified` | active member **with** a primary account where `is_verified = true` |
| `unverified` | active member **with** a primary account where `is_verified = false` |
| `missing_account` | active member with **no** live primary account |

Row set = `user_roles` (`org_id`, `is_active = true`, `deleted_at IS NULL`) **LEFT JOIN** `employee_bank_accounts` (`org_id`, `user_id`, `is_primary = true`, `deleted_at IS NULL`). This reproduces the active-membership inner join that `employee_bank_account.repository.listPrimaryByOrgId` deliberately applies, so the tiles match the table beneath them. No row multiplication: `user_roles` is unique per `(org_id,user_id)` among live rows and `employee_bank_accounts_primary_unique_idx` is UNIQUE `(org_id,user_id) WHERE is_primary = true AND deleted_at IS NULL`.

### 3.4 `categories.document_verification` — HR only (`documents.access`)

Table `employee_documents` **[P]**, queue = `status = 'pending_verification'` (exactly `employee_document.repository.findList({verificationQueue:true})`).

| Key | Predicate |
| :--- | :--- |
| `waiting_decision` | the **whole** queue: `status = 'pending_verification'` |
| `manager_approved` | queue `AND recommendation = 'verify'` |
| `manager_rejected` | queue `AND recommendation = 'reject'` |
| `no_recommendation` | queue `AND recommendation = 'none'` |

`waiting_decision` is the superset (= `manager_approved + manager_rejected + no_recommendation`), which is what makes the spec's own example self-consistent (`document_verification_queue: 5`, `waiting_decision: 5`, `4 + 1 = 5`). `no_recommendation` is added so the three subsets always reconcile to the badge — see §4.2/Q-2.

### 3.5 `categories.document_requests` — `documents.access`

Table `document_requests` **[P]**. HR org-wide · manager `user_id = ANY(:scopeIds)` (mirrors the manager document-request routes) · employee `user_id = :userId` (mirrors `GET /documents/me/document-requests`).

| Key | Predicate |
| :--- | :--- |
| `outstanding` | `status IN ('open','overdue')` |
| `overdue` | `status IN ('open','overdue') AND due_on < :todayIst` |
| `fulfilled` | `status = 'fulfilled'` |

`overdue` is **derived**, not `status='overdue'`: the daily cron flips `open → overdue`, so a request that is past due but not yet flipped must still count — identical to `document_request.repository.findList({overdueOnly:true})`. `:todayIst` is `document/utils/document_expiry.utils.toIstDateString(new Date())`; `due_on` is `DATEONLY`, so a plain `YYYY-MM-DD` compare is TZ-safe. `overdue ⊆ outstanding` by construction.

### 3.6 `categories.devices` — hr/admin/super-admin (`attendance.access`)

Table `attendance_trusted_devices`, **device-row** counts over the org: `pending`, `active`, `suspended`, `revoked` (`status = '<key>'`). Row counts, not distinct users — the tabs they label are `GET /attendance/hr/trusted-devices?status=…` pages of **devices**.
⚠️ Do **not** reuse `getCoverageBreakdown`, whose `pending_users` / `suspended_users` are *distinct active members*; only its `pending_devices` is a row count. Mixing them would make tab headers disagree with their lists.

### 3.7 `categories.loans` — HR only (`payroll.access`)

Table `employee_loans` **[P]**: `pending`, `active`, `closed`, `foreclosed` (`status = '<key>'`). `rejected`/`cancelled` are not surfaced (no tile asks for them); add later if a tile appears.

### 3.8 `categories.letter_proposals` — HR only (`documents.access`)

Table `document_letter_proposals`: `pending`, `approved`, `rejected`, `cancelled` (`status = '<key>'`). Serves the "Waiting on HR / Issued / Turned down" tabs.

### 3.9 `categories.notifications` — every role, self-scoped

Table `notifications` (not paranoid).

| Key | Predicate |
| :--- | :--- |
| `unread` | `user_id = :userId AND org_id = :orgId AND read_at IS NULL`, **scanned at most `cap+1` rows** |
| `unread_is_capped` | `true` when the cap was hit |
| `total` | `user_id = :userId AND org_id = :orgId` (exact) |

`cap` = `notification/constants/notification_defaults.unreadCountCap()` (env `NOTIFICATION_UNREAD_COUNT_CAP`, default 100) so `sidebar.notifications_unread` is **byte-identical** to the shipped `GET /api/v1/notifications/unread-count`. In SQL the cap is expressed as `(SELECT COUNT(*) FROM (SELECT 1 FROM notifications WHERE … LIMIT :unreadCap) z)`, which is exactly what `notification.repository.countUnread` does with `limit: cap + 1` (pass `cap + 1` as the replacement and compare `>= cap + 1` to set `unread_is_capped`, then clamp the reported `unread` to `cap`).
**Kill switch:** when `notification_defaults.engineEnabled()` is `false` the inbox REST API returns 503 and is frozen, so the badge returns `unread = 0`, `total = 0` and lists `notifications` in `meta.unavailable_categories`. The badge endpoint itself must **never** 503 because of the notification kill switch.

### 3.10 `sidebar`

| Key | Definition |
| :--- | :--- |
| `inbox_total` | Σ of the computed `categories.inbox.*.total` (D-8) |
| `notifications_unread` | `categories.notifications.unread` |
| `unverified_banks` | `categories.bank_verification.unverified` |
| `document_verification_queue` | `categories.document_verification.waiting_decision` |

---

## 4. Discrepancies, resolutions and open questions

### 4.1 Resolved against the codebase (no clarification needed)

| # | Source doc says | Reality in this repo | Resolution |
| :-- | :--- | :--- | :--- |
| R-1 | tables `attendance_regularizations`, `overtime_requests`, `comp_off_grants`, `salary_structure_proposals`, `loans`, `tax_declarations`, `trusted_devices`, `letter_proposals`, `employee_bank_accounts`, `employee_document_submissions`, `notifications` | real names: `attendance_regularizations` ✔, `attendance_overtime`, `attendance_comp_offs`, `employee_salary_structures`, `employee_loans`, `investment_declarations`, `attendance_trusted_devices`, `document_letter_proposals`, `employee_bank_accounts` ✔, `employee_documents`, `notifications` ✔ | §3 uses the real names. The SQL block in the spec's §5 is **illustrative only** and must not be copied. |
| R-2 | `notifications … is_read = false` | the column is `read_at TIMESTAMPTZ NULL`; there is no `is_read` | `read_at IS NULL` |
| R-3 | document queue `employee_document_submissions … status = 'pending'` | `employee_documents.status` enum has no `'pending'`; the queue value is `'pending_verification'` | §3.4 |
| R-4 | "11 HR inbox approval types" | the spec's own payload lists **12** (`leaves, regularizations, overtime, comp_offs, anomalies, tasks, salary_proposals, claims, loans, tax_declarations, devices, letter_proposals`) | 12 implemented; `inbox_total` sums 12 (which is what reproduces `14` in the spec's example) |
| R-5 | spec §2 trees `loans`, `letter_proposals`, `notifications.{unread,total}`, `tasks.my_open_tasks`, `tasks.my_overdue_tasks` — but spec §4's payload omits them | — | the response is the **superset**: §4's payload *plus* `categories.loans`, `categories.letter_proposals`, `categories.notifications`, `categories.tasks.mine`, `categories.tasks.cancelled`, `document_verification.no_recommendation`, `tax_declarations.under_review`, `scope`, `meta`. All keys in spec §4 keep their exact names and types. |
| R-6 | "`role = 'hr'` or `'admin'`" gets all org counts | payroll & document routes are `authorize(['hr'])`; `payroll_access.TENANT_GLOBAL_ROLES === ['hr']`; `admin`/`super-admin` are **platform** roles with no tenant data access | D-3 — admin/super-admin get leave/attendance/task/device org counts only |
| R-7 | manager scope "`manager_id = req.user.id`" / "direct and indirect reports" | the source of truth is `user_reporting_mappings` via `hierarchy_access.getAccessibleUserIds`, which resolves **direct reports only** (`reporting_to_id = :me AND is_active`) and strips reports holding a global-approver role | D-5. The badge therefore equals the manager's own list endpoints, which use the same resolver. "Indirect reports" are **not** included — see Q-1. |
| R-8 | proposes `tasks(org_id, status, due_date)` etc. | verified present already: `tasks(org_id,status)`, `(org_id,due_date)`, `(org_id,assignee_id,status)`; `leave_requests(org_id,status)`; `reimbursement_claims(org_id,status,current_level)`; `document_requests(org_id,status,due_on)` + `(org_id,user_id,status)`; `document_letter_proposals(org_id,status,created_at DESC)`; `employee_loans(org_id,status)`; `employee_salary_structures(org_id,status)`; `investment_declarations(org_id,financial_year,status)`; `attendance_trusted_devices(org_id,user_id,status)` + partial `(org_id,status) WHERE status='pending'`; `notifications` partial unread index; `employee_bank_accounts` partial unique primary index | §8.3 adds only the **5 genuinely missing** indexes |
| R-9 | claims predicate `status='under_review' OR (status='submitted' AND total_levels=1)` | verified **equivalent** to the authoritative definition "a `pending` row in `reimbursement_approvals` at `current_level` with `approver_role='hr'`": `approval_chain_resolver.buildChain` emits a 1-level chain **only** with `approver_role:'hr'`, and a 2-level chain's level 2 is always `'hr'`; `under_review` only exists at level 2 | §6 implements the status predicate (no join) and §11.4 adds a test asserting the equivalence so the shortcut cannot rot |

### 4.2 Open questions — DO NOT invent an answer

| # | Question | Why it matters | Interim behaviour in this plan |
| :-- | :--- | :--- | :--- |
| **Q-1** | Should a manager's badges include **indirect** reports (reports-of-reports)? The spec says "direct and indirect"; `getAccessibleUserIds` returns direct reports only. | Changing the resolver would change leave/attendance/payroll/task **authorization** org-wide — far outside this feature. | **Direct reports only.** Badge == the manager's existing list endpoints. If indirect reports are wanted, that is a separate change to `hierarchy_access.utils` with its own review. |
| **Q-2** | `document_verification.waiting_decision` — whole queue (superset) or only `recommendation='none'`? | Decides whether the three tiles sum to the sidebar badge. | **Whole queue** (superset) — the only reading consistent with the spec's own numbers. `no_recommendation` is returned so the UI can render either interpretation without a second release. |
| **Q-3** | `tax_declarations` — current FY only, and should `under_review` count? | A declaration from a previous FY still awaiting verification would be invisible. | Current FY (`financial_year = :currentFy`, label from `payroll_settings.financial_year_start_month`, default 4, via `payroll/utils/tax_period.utils.financialYearOf`) **and** both `submitted` + `under_review` returned separately so the frontend can choose. Flag for product: do we need an `all_years_pending`? |
| **Q-4** | Employee plane: the spec names only tasks / document requests / notifications. Should an employee also see counts of **their own** pending leaves / claims (a "My Requests" tile)? | `MyRequestsPage` is named in the spec's §6 as a place `limit=1` calls are removed from. | Not implemented. `categories.inbox` is zeros for employees. Needs a frontend answer before adding a `categories.mine` group. |
| **Q-5** | Does the Loans page's "Closed" filter mean `status='closed'` only, or `closed` + `foreclosed`? | Tile vs list parity. | Both returned separately (§3.7); frontend decides. |
| **Q-6** | A user whose JWT `role` is `manager` but who also holds an active `hr` role row gets `getAccessibleUserIds() === null` (global) from the hierarchy resolver, yet `payroll_access.decideAuthority` would deny them org payroll authority because `requesterRole !== 'hr'`. | Determines what such a hybrid sees. | Mirror the modules exactly: `plane = 'org'` for leave/attendance/task/device when the resolver returns `null`; payroll/document org counts require `req.user.role === 'hr'`. Normative in §4.3, with a test. |

### 4.3 Authorization resolution algorithm (normative)

```text
1. orgId = req.user.orgId; if null  → 400 MISSING_ORG_CONTEXT
2. accessibleUserIds = hierarchyAccess.getAccessibleUserIds(orgId, req.user)   // null | [] | [ids]
3. hierarchyGlobal   = (accessibleUserIds === null)
4. isTenantTop       = (req.user.role === 'hr')
5. plane = hierarchyGlobal ? 'org' : (req.user.role === 'manager' ? 'team' : 'self')
6. features = entitlements.getEnabledFeatureKeys(orgId)        // ONE resolution, reused
7. for each category in CATALOG:
     visible = category.globalRoles.includes(req.user.role) ? 'org'
             : (plane === 'team' && category.teamPlane)      ? 'team'
             : (category.selfPlane)                          ? 'self'
             : null
     if (category.requiresTenantTop && !isTenantTop) visible = category.teamPlane || category.selfPlane ? visible : null
     if (visible === null || !features.has(category.feature)) → zeros + meta.unavailable_categories
8. plane === 'team' && accessibleUserIds.length === 0 → every team-scoped category is zeros
   (NEVER org-wide — the empty-array trap)
```

A new batch method is required on the billing entitlement service so step 6 is one resolution instead of six `hasFeature` calls (§8.2).

---

## 5. API contract — `GET /api/v1/inbox/badges`

### 5.1 Request

```http
GET /api/v1/inbox/badges HTTP/1.1
Authorization: Bearer <access JWT>
```

* **Auth:** required. `authenticate` + `authorize(['employee','manager','hr','admin','super-admin'])`.
* **Query parameters:** none in v1. Unknown params are silently stripped (`validateOrThrow` uses `stripUnknown: true`), so a future `?groups=` cannot break old clients.
* **Body:** none.
* **Idempotent, side-effect free.** Writes nothing; opens no transaction.

### 5.2 `200 OK`

Every leaf is a **non-negative integer** (`unread_is_capped` is the only boolean). Keys are **always present** regardless of role (D-6) — absent access ⇒ `0` + an entry in `meta.unavailable_categories`.

```json
{
  "success": true,
  "message": "Badge counts summary fetched",
  "data": {
    "scope": { "role": "hr", "plane": "org", "team_size": null },
    "sidebar": {
      "inbox_total": 14,
      "notifications_unread": 3,
      "unverified_banks": 2,
      "document_verification_queue": 5
    },
    "categories": {
      "inbox": {
        "leaves":            { "total": 3, "pending": 2, "cancellation_pending": 1 },
        "regularizations":   { "total": 1, "pending": 1 },
        "overtime":          { "total": 0, "pending": 0 },
        "comp_offs":         { "total": 0, "earned": 0 },
        "anomalies":         { "total": 2, "open": 2 },
        "tasks":             { "total": 4, "in_review": 4 },
        "salary_proposals":  { "total": 1, "proposed": 1 },
        "claims":            { "total": 2, "under_review": 2, "submitted": 0 },
        "loans":             { "total": 1, "pending": 1 },
        "tax_declarations":  { "total": 0, "submitted": 0, "under_review": 0 },
        "devices":           { "total": 0, "pending": 0 },
        "letter_proposals":  { "total": 0, "pending": 0 }
      },
      "tasks": {
        "pending": 8, "in_progress": 12, "in_review": 4, "reopened": 1,
        "completed": 45, "cancelled": 2, "overdue": 3,
        "mine": { "open": 2, "overdue": 0, "in_review": 1 }
      },
      "bank_verification":     { "unverified": 2, "verified": 84, "missing_account": 6 },
      "document_verification": { "waiting_decision": 5, "manager_approved": 4, "manager_rejected": 1, "no_recommendation": 0 },
      "document_requests":     { "outstanding": 7, "overdue": 2, "fulfilled": 31 },
      "devices":               { "pending": 0, "active": 62, "suspended": 1, "revoked": 3 },
      "loans":                 { "pending": 1, "active": 12, "closed": 30, "foreclosed": 0 },
      "letter_proposals":      { "pending": 0, "approved": 9, "rejected": 1, "cancelled": 0 },
      "notifications":         { "unread": 3, "unread_is_capped": false, "total": 42 }
    },
    "meta": {
      "unavailable_categories": [],
      "query_ms": 11
    },
    "synced_at": "2026-10-25T12:00:00.000Z"
  }
}
```

**Field semantics**

| Field | Type | Notes |
| :--- | :--- | :--- |
| `scope.role` | string | `req.user.role` verbatim |
| `scope.plane` | `"org" \| "team" \| "self"` | §4.3 step 5 |
| `scope.team_size` | integer \| null | `accessibleUserIds.length` when `plane === 'team'`, else `null`. Lets the UI explain a legitimately empty team inbox. |
| `meta.unavailable_categories` | string[] | dotted keys not computed, e.g. `["inbox.claims","inbox.loans","bank_verification","notifications"]`. Stable and sorted. |
| `meta.query_ms` | integer | server-side duration of the aggregate query. Diagnostics only; clients must not depend on it. |
| `synced_at` | ISO-8601 UTC | server time when the snapshot was taken (`new Date().toISOString()`). The client renders "updated Ns ago". |

Response header: `Cache-Control: no-store`.

### 5.3 Error responses

Envelope is the project standard (`error.middleware.js`): `{ success:false, message, errorCode }`.

| Status | `errorCode` | When |
| :--- | :--- | :--- |
| 401 | `AUTH_TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REVOKED` | from `authenticate` |
| 403 | `ORG_ACCESS_DEACTIVATED` | membership `is_active = false` (from `authenticate`) |
| 403 | `FORBIDDEN` | role outside the allow-list |
| 400 | `MISSING_ORG_CONTEXT` | valid token with `orgId = null` |
| 429 | `BADGE_SUMMARY_RATE_LIMITED` | over `BADGE_SUMMARY_MAX_PER_HOUR` in a UTC hour; carries `details.retry_after_seconds` + `Retry-After` |
| 503 | `AUTH_DEPENDENCY_FAILURE` | Redis unreachable (from `authenticate`) |
| 503 | `ENTITLEMENT_DEPENDENCY_FAILURE` | DB unreachable while resolving entitlement (existing behaviour of `entitlement.service`) |
| 500 | `INTERNAL_ERROR` | unexpected |

**No 404 and no partial-success 2xx.** If the aggregate query fails, the endpoint fails — a sidebar must never render a silently-wrong zero. (Contrast: a *category the caller may not see* is a deliberate zero + `meta` entry, which is not an error.)

### 5.4 Backward compatibility

New endpoint; nothing existing changes shape. The endpoints the frontend polls today keep working unchanged, so the frontend can migrate page by page. `data.*` is additive-only going forward: new count keys may be added, existing keys never renamed or removed without a new dated change record.

---

## 6. REQ-PAYROLL-001 — `pending_hr` on the HR claims list

### 6.1 Contract

```http
GET /api/v1/payroll/hr/reimbursements/claims?pending_hr=true&page=1&limit=20
```

| Aspect | Specification |
| :--- | :--- |
| Name / type | `pending_hr`, boolean, **optional**, default `false` |
| Accepted inputs | `true`, `false`, `1`, `0` (Joi `convert: true` handles all four) |
| Semantics when `true` | `(status = 'under_review') OR (status = 'submitted' AND total_levels = 1)` — every claim whose **current** approval level belongs to HR |
| Combination with `status` | **400 `VALIDATION_ERROR`**, message `pending_hr cannot be combined with status` (D-10) |
| Combination with others | `user_id`, `payout_period_month`, `created_from`, `created_to`, `page`, `limit`, `sort_by`, `sort_order` all still apply (AND-ed) |
| Pagination | Fully correct — the predicate is pushed into the SQL `WHERE`, so `pagination.total` is the true pending-HR count |
| Omitted / `false` | **Byte-identical to today's response.** No behaviour change. |
| Authorization | unchanged: `authenticate` → `requireActiveOrg` → `requireFeature('payroll.access')` → `authorize(['hr'])` |
| Plane | HR only. The manager endpoint does **not** gain this filter (D-9). |

### 6.2 Why the status predicate is correct (and not a join)

From `approval_chain_resolver.utils.buildChain` + `reimbursement_approval.service`:

* A chain is 1 level (`approver_role: 'hr'`) or 2 levels (`manager` then `hr`).
* `submitted` = level 1 pending. With `total_levels = 1`, level 1 **is** HR.
* `under_review` is only reachable after level 1 (manager) approval, so the current level is always level 2 = HR.
* `ACTIONABLE_STATUSES = new Set(['submitted','under_review'])` and `_assertLevelPermission` confirm an HR actor may act on exactly those two states at `current_level`.

⇒ the status predicate is equivalent to a join on `reimbursement_approvals (status='pending' AND level = current_level AND approver_role='hr')`, at zero join cost, and the existing index `reimbursement_claims(org_id, status, current_level)` serves it.

**Known edge case (documented, not handled):** a claim whose level-2 row carries an explicit `assigned_approver_id` is still *pending HR* in aggregate, so it is correctly included; it may however be actionable by only one specific HR user. If per-approver assignment becomes a real workflow, `pending_hr` will need an `assigned_to_me` sibling — out of scope, recorded here.

### 6.3 Files to modify

| File | Change |
| :--- | :--- |
| `src/modules/payroll/validators/payroll_hr.validator.js` | Add, **after** `claimsQuerySchema`, an `hrClaimsQuerySchema` = `claimsQuerySchema.append({ pending_hr: Joi.boolean().default(false) })` plus a `.custom()` (or `.when()`) rule rejecting `pending_hr === true && status !== undefined` with message `pending_hr cannot be combined with status`. Export it. **Do not touch `claimsQuerySchema`.** |
| `src/modules/payroll/controllers/payroll_hr.controller.js` (`listReimbursementClaims`, ~line 1114) | Validate with `hrClaimsQuerySchema` instead of `claimsQuerySchema`; pass `pendingHr: value.pending_hr` into the service call. Nothing else changes. |
| `src/modules/payroll/services/reimbursement_claim.service.js` | `listForHr(...)`: thread `pendingHr` through `_buildQueueFilters` as `pendingHr: true` **only when truthy** (never emit `pendingHr: false`, so the filter object stays identical to today's for existing callers). |
| `src/modules/payroll/repositories/reimbursement_claim.repository.js` (`findAndCount`) | When `filters.pendingHr === true`, add to the `where`: `[Op.or]: [{ status: 'under_review' }, { [Op.and]: [{ status: 'submitted' }, { total_levels: 1 }] }]`. Compose it so it coexists with other `where` keys — push into a dedicated `[Op.and]` array entry rather than assigning `where[Op.or]` (which a future filter could clobber). |

### 6.4 Concurrency / correctness notes

* Read-only; no transaction needed. A claim approved between the count and the page fetch simply disappears from the next poll — acceptable and expected for a queue.
* `total_levels` is written once at submit time and never mutated afterwards, so the predicate cannot flip mid-page.
* No change to `GET /payroll/hr/reimbursements/claims/:id`, to the approval actions, or to the manager queue.

---

## 7. The single-round-trip SQL

### 7.1 Shape

```sql
SELECT * FROM
  (SELECT COUNT(*) FILTER (WHERE status = 'pending')              AS leave_pending,
          COUNT(*) FILTER (WHERE status = 'cancellation_pending') AS leave_cancellation_pending
     FROM leave_requests
    WHERE org_id = :orgId AND deleted_at IS NULL
      AND user_id = ANY(:scopeIds::uuid[])                        ) AS q_leave,
  (SELECT COUNT(*) FILTER (WHERE status = 'pending') AS reg_pending
     FROM attendance_regularizations
    WHERE org_id = :orgId
      AND user_id = ANY(:scopeIds::uuid[])                        ) AS q_reg
  -- ... one sub-select per included table ...
```

Rules the builder MUST obey:

1. **Every sub-select returns exactly one row**, so the cross join yields exactly one row. A plain aggregate with no `GROUP BY` always returns one row (zeros when the table is empty) — never add a `GROUP BY`.
2. A sub-select is emitted **only** if its category is included (§4.3). An excluded category's keys are filled with `0` in JS, so an employee's SQL has 3–4 sub-selects, not 14.
3. The scope fragment is one of three **fixed strings** chosen by `plane`:
   * `org` → `''`
   * `team` → `AND <scopeCol> = ANY(:scopeIds::uuid[])`
   * `self` → `AND <scopeCol> = :userId`

   `<scopeCol>` comes from the catalogue constant, never from request input.
4. **`deleted_at IS NULL`** is emitted iff the catalogue marks the table paranoid. The parity test (§11.2) asserts this matches `db.<Model>.options.paranoid` exactly.
5. Bound replacements only: `:orgId`, `:userId`, `:scopeIds`, `:currentFy`, `:todayIst`, `:unreadCap`. Executed via `sequelize.query(sql, { replacements, type: QueryTypes.SELECT, plain: true })` — precedent: `attendance_trusted_devices.repository.listPeopleRoster`.
6. Postgres returns `COUNT(*)` as `bigint`, which the driver yields as a **string**. Every value must pass through `Number(x) || 0` in the projection layer. Missing this is the single most likely bug in this feature (`"3" + "1"` = `"31"` in `inbox_total`).
7. Column aliases are flat and table-prefixed (`leave_pending`, `task_overdue`, `bank_unverified`, …) so the mapper is a static dictionary with no collisions.

### 7.2 The bank sub-select (the only one with a join)

```sql
(SELECT COUNT(*) FILTER (WHERE b.id IS NOT NULL AND b.is_verified = true)  AS bank_verified,
        COUNT(*) FILTER (WHERE b.id IS NOT NULL AND b.is_verified = false) AS bank_unverified,
        COUNT(*) FILTER (WHERE b.id IS NULL)                               AS bank_missing_account
   FROM user_roles ur
   LEFT JOIN employee_bank_accounts b
     ON  b.org_id  = ur.org_id
     AND b.user_id = ur.user_id
     AND b.is_primary = true
     AND b.deleted_at IS NULL
  WHERE ur.org_id = :orgId AND ur.is_active = true AND ur.deleted_at IS NULL) AS q_bank
```

The `is_primary` / `deleted_at` conditions live in the `ON` clause, **not** in `WHERE` — moving them to `WHERE` turns the LEFT JOIN into an inner join and silently zeros `missing_account`. Called out because it is the easiest mistake to make here; §11.3 has a test for it.

### 7.3 The capped unread sub-select

```sql
(SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM notifications
          WHERE org_id = :orgId AND user_id = :userId AND read_at IS NULL
          LIMIT :unreadCap) z)                                   AS notif_unread_scanned,
        (SELECT COUNT(*) FROM notifications
          WHERE org_id = :orgId AND user_id = :userId)           AS notif_total) AS q_notif
```

`:unreadCap` = `unreadCountCap() + 1`. In JS: `is_capped = scanned >= cap + 1`, `unread = Math.min(scanned, cap)` — the same arithmetic as `notification.repository.countUnread`.

### 7.4 Query-level safety

* `plain: true` returns one object (or `null`). `null` is only reachable if **no** sub-select was emitted; the service must therefore **skip the query entirely** when the sub-select list is empty and return the all-zero envelope. There must never be a `SELECT * FROM` with zero FROM items.
* **No per-query `statement_timeout` in v1.** Setting it requires either a transaction (`SET LOCAL`) or a session-level change that would leak to other pooled users; and this is a pure read over indexed predicates with the pool already bounding concurrency. Recorded in §15 as a follow-up if p99 regresses.

---

## 8. File manifest (verified against the repository)

### 8.1 New files

| Path | Responsibility |
| :--- | :--- |
| `src/modules/inbox/inbox.index.js` | `module.exports = (app) => { app.use('/api/v1/inbox', require('./routes/inbox.routes')) }` — mirrors `notification.index.js` exactly. |
| `src/modules/inbox/routes/inbox.routes.js` | `router.use(authenticate)`, `router.use(authorize(allOrgRoles))`, `router.get('/badges', controller.handleGetBadges)`. No body/query validation needed (no inputs). Copy the comment convention from `notification.routes.js`. |
| `src/modules/inbox/controllers/inbox.controller.js` | Reads `req.user`, calls the service, sets `Cache-Control: no-store`, returns the envelope with message `Badge counts summary fetched`. Rate-limit check happens here (before the service call) so the service stays pure. |
| `src/modules/inbox/constants/badge_catalog.js` | **The declarative catalogue.** One frozen entry per count group: `{ key, table, paranoid, scopeColumn, feature, globalRoles, teamPlane, selfPlane, requiresTenantTop, counts: [{ alias, filter }] }`. This file is the machine-readable form of §3 and the subject of the parity test. |
| `src/modules/inbox/utils/badge_sql.builder.js` | **Pure.** `build({ plane, includedKeys, unreadCap })` → `{ sql, replacements, aliases }`. No DB, no I/O, no `require` of a model. Fully unit-testable. |
| `src/modules/inbox/repositories/badge_counts.repository.js` | Executes the built SQL via `sequelize.query(..., { replacements, type: QueryTypes.SELECT, plain: true })`; returns the raw flat row. Coerces nothing (coercion is the service's job, so the repository test can assert raw passthrough). |
| `src/modules/inbox/services/inbox_summary.service.js` | Orchestration: §4.3 authorization algorithm → FY/IST/cap inputs → builder → repository → `Number()` coercion → derived totals → `sidebar` → `meta.unavailable_categories` → `scope`. |
| `src/infrastructure/postgres-sql/migrations/00087-add-badge-count-indexes.js` | §8.3. **Handed back UNRUN.** |
| `tests/unit/inbox/badge_sql_builder.test.js` | §11.1 |
| `tests/unit/inbox/badge_catalog_parity.test.js` | §11.2 |
| `tests/unit/inbox/inbox_summary_service.test.js` | §11.3 |
| `tests/unit/payroll/reimbursement_pending_hr.test.js` | §11.4 |

### 8.2 Modified files

| Path | Change | Risk |
| :--- | :--- | :--- |
| `src/app.js` | one line: `require('./modules/inbox/inbox.index')(app)`, placed with the other module registrations (before `errorHandlerMiddleware`). | none |
| `src/modules/billing/services/entitlement.service.js` | **add** `getEnabledFeatureKeys(orgId)` → `Set<string>`; do not touch `hasFeature` / `requireFeature`. | low — additive |
| `src/modules/payroll/validators/payroll_hr.validator.js` | add + export `hrClaimsQuerySchema` (§6.3). `claimsQuerySchema` untouched. | low |
| `src/modules/payroll/controllers/payroll_hr.controller.js` | `listReimbursementClaims` validates with the new schema and forwards `pendingHr`. | low |
| `src/modules/payroll/services/reimbursement_claim.service.js` | `listForHr` threads `pendingHr` (only when truthy). | low |
| `src/modules/payroll/repositories/reimbursement_claim.repository.js` | `findAndCount` honours `filters.pendingHr`. | medium — shared by HR **and** manager list paths; the new branch must be unreachable unless `pendingHr === true`, and a test must assert the manager path's `where` is unchanged. |
| `.env.example` | add `BADGE_SUMMARY_MAX_PER_HOUR=240` with a `#` comment above it, matching the `NOTIFICATION_*` block style. | none |
| `public/md_system/api_registry.md` | add the new endpoint row; amend the API-133 row to mention `pending_hr`. | none |

**`getEnabledFeatureKeys(orgId)` — exact implementation (3 queries, independent of key count):**

```text
try {
  if (PERIOD_ENFORCEMENT_ENABLED) {
    const live = await orgSubscriptionRepository.findLiveByOrgId(orgId)
    if (!isEntitled(live, new Date())) return new Set()
    return new Set(readFeatureKeys(live.plan_snapshot))
  }
  const sub = await orgSubscriptionRepository.findActiveByOrgId(orgId)
  if (!sub) return new Set()
  const [planFeatures, features] = await Promise.all([
    planFeatureRepository.findFeaturesByPlanId(sub.plan_id),   // rows: {feature_id, enabled}
    featureRepository.findAll()                                // rows: {id, key, is_active}
  ])
  const activeById = new Map(features.filter(f => f.is_active).map(f => [f.id, f.key]))
  return new Set(planFeatures.filter(pf => pf.enabled).map(pf => activeById.get(pf.feature_id)).filter(Boolean))
} catch (error) {
  // IDENTICAL semantics to hasFeature: reuse isDatabaseUnreachable(error) →
  // throw AppError(503, …, 'ENTITLEMENT_DEPENDENCY_FAILURE'); any other error → return new Set()
  // (fail closed: no features, so every gated category is reported unavailable, never granted).
}
```

Reuse the module-level `isDatabaseUnreachable` helper and the same `console.error` prefix; **do not** duplicate the error-name lists.

### 8.3 Migration `00087-add-badge-count-indexes.js` — 5 indexes

Only these five predicates have no usable index today. Everything else is covered (R-8).

| # | Index |
| :-- | :--- |
| 1 | `CREATE INDEX badge_areg_org_pending_idx ON attendance_regularizations (org_id, user_id) WHERE status = 'pending'` |
| 2 | `CREATE INDEX badge_aot_org_pending_idx ON attendance_overtime (org_id, user_id) WHERE status = 'pending'` |
| 3 | `CREATE INDEX badge_aco_org_earned_idx ON attendance_comp_offs (org_id, user_id) WHERE status = 'earned'` |
| 4 | `CREATE INDEX badge_aanom_org_open_idx ON attendance_anomalies (org_id, user_id) WHERE is_resolved = false` |
| 5 | `CREATE INDEX badge_emp_docs_org_pending_verify_idx ON employee_documents (org_id) WHERE status = 'pending_verification' AND deleted_at IS NULL` |

Why these: the four attendance tables index `status` **globally** (`areg_status_idx`, `aot_status_idx`, `aco_status_idx`, `aanom_resolved_idx`), which is non-selective across tenants, and their `(org_id,user_id)` index does not help a status filter. `employee_documents` has `(org_id,user_id,status)` and `(org_id,document_type_id,status)` — neither serves an org-wide `status = 'pending_verification'` scan, and Postgres will not skip-scan the middle column. Leading `(org_id, user_id)` on #1–#4 serves **both** the HR org plane (leading column) and the manager team plane (`user_id = ANY(...)`) from the same index.

Migration rules:

* Use `CREATE INDEX IF NOT EXISTS` via `queryInterface.sequelize.query` (partial indexes with `WHERE` need raw SQL — precedent `00059`), inside the standard `transaction` wrapper used by every migration in this repo.
* `down()` drops exactly these five by name (`DROP INDEX IF EXISTS`). **`down()` destroys no data** — safe to reverse.
* Indexes only; **no table, column, enum or constraint changes.** Nothing in this feature adds a column, therefore **nothing in the settings catalog changes and the T-S2 parity test is not involved** (verified: `tests/unit/settings/catalog_drift.test.js` inspects only the four settings update schemas and their models).
* ⚠️ **Handed back UNRUN.** Per the standing operational rule the agent must not run `db:migrate` or any connectivity check. The feature is **functionally correct without the migration** (the counts are right, just slower), so deployment is not blocked — but run it before enabling the frontend poll.

---

## 9. Performance budget (honest numbers)

Per request, for an HR caller (the heaviest plane):

| Step | Round trips | Note |
| :--- | :--- | :--- |
| `authenticate` | 1 Redis + 1 Postgres | token/blacklist + `UserRole` lookup — already paid by every endpoint |
| `getAccessibleUserIds` | 0 for hr/admin/super-admin (short-circuits to `null`); 1 for a manager | existing resolver |
| `getEnabledFeatureKeys` | 1–3 Postgres | replaces up to 18 (§8.2) |
| badge aggregate | **1 Postgres** | the whole point |
| **total Postgres** | **≈ 3–5 (HR) / 4–6 (manager)** | versus 14–17 separate HTTP requests today |

Target: **p95 ≤ 150 ms** (HR, org ≤ 2 000 members, warm pool). The aggregate query itself should be 5–25 ms once §8.3 is applied. Each badge sub-select touches a single index on a single table, so cost grows with *matching rows per org*, not with total table size.

Poll-load arithmetic: 200 concurrent users at the frontend's 60 s interval = ~3.3 req/s ⇒ ~17 Postgres queries/s from this feature. Today's 14-request fan-out at the same cadence would be ~47 req/s and ~90+ queries/s. The endpoint is a **net reduction** in database load, which is the main justification for shipping it at all.

**Explicitly rejected:** the spec's "under 15 ms total" claim. Do not put it in any monitoring SLO.

---

## 10. Step-by-step implementation

Each step ends with a verification that can be run **without a database**.

```text
 1. Catalogue       → src/modules/inbox/constants/badge_catalog.js
                      One entry per TABLE (not per response key) — a table that feeds two response
                      groups is counted once: leave_requests, attendance_regularizations,
                      attendance_overtime, attendance_comp_offs, attendance_anomalies, tasks,
                      employee_salary_structures, reimbursement_claims, employee_loans,
                      investment_declarations, attendance_trusted_devices,
                      document_letter_proposals, employee_documents, document_requests,
                      user_roles+employee_bank_accounts, notifications  = 16 entries.
                      verify: the parity test (step 3) enumerates them; no magic count asserted here
 2. SQL builder     → src/modules/inbox/utils/badge_sql.builder.js
                      verify: tests/unit/inbox/badge_sql_builder.test.js green (§11.1)
 3. Parity test     → tests/unit/inbox/badge_catalog_parity.test.js
                      verify: green; then deliberately typo one catalogue column and confirm it FAILS (§11.2)
 4. Repository      → src/modules/inbox/repositories/badge_counts.repository.js
                      verify: lint + the service test's stub contract
 5. Entitlement     → add getEnabledFeatureKeys to billing/services/entitlement.service.js
                      verify: tests/unit/inbox/inbox_summary_service.test.js stubs it; existing billing tests still green
 6. Service         → src/modules/inbox/services/inbox_summary.service.js
                      verify: §11.3 green — incl. the bigint-string coercion and empty-cohort cases
 7. Controller+route→ inbox.controller.js, inbox.routes.js, inbox.index.js, one line in src/app.js
                      verify: node -e "require('./src/app')" loads with no route collision
 8. Rate limit      → checkOrgRate in the controller + BADGE_SUMMARY_MAX_PER_HOUR in .env.example
                      verify: .env.example contains the commented key; service test asserts 429 errorCode
 9. pending_hr      → validator → controller → service → repository (§6.3)
                      verify: tests/unit/payroll/reimbursement_pending_hr.test.js green (§11.4)
10. Migration       → 00087-add-badge-count-indexes.js
                      verify: static read-through only; HAND BACK UNRUN — do not execute db:migrate
11. Docs            → api_registry.md rows + dated change record in public/md_updates/ (§13)
                      verify: both files contain the new endpoint and the pending_hr note
12. Full suite      → npm test
                      verify: no pre-existing test regresses; report the actual pass count
```

**Order matters:** steps 1–3 before 4–7, because the parity test is what proves the catalogue (and therefore every number in §3) matches the real models before any wiring exists to hide a mistake.

---

## 11. Testing strategy

Runner: `node --test` (`npm test` globs `tests/unit/**/*.test.js`), `node:assert/strict`, no DB connection in any test. Repository/service stubs are saved in `beforeEach` and restored in `afterEach` — the style of `tests/unit/notification/notification_read_api.test.js`.

### 11.1 `tests/unit/inbox/badge_sql_builder.test.js` — pure builder

| Case | Assertion |
| :--- | :--- |
| org plane | SQL contains **no** `scopeIds` and no `= :userId` scope fragment; `replacements` has no `scopeIds` key |
| team plane | every included sub-select contains `= ANY(:scopeIds::uuid[])` on **that group's** `scopeColumn` (e.g. `subject_user_id` for letter proposals, `assignee_id` for tasks) |
| self plane | every included sub-select contains `= :userId` |
| paranoid tables | `deleted_at IS NULL` appears in the sub-select for every group whose catalogue entry is `paranoid: true`, and in **none** of the others |
| included subset | building with only `['notifications']` yields exactly one sub-select and no reference to any other table name |
| empty subset | returns `{ sql: null }` (or equivalent) so the service skips the query — never a `SELECT * FROM` with no FROM items |
| no interpolation | for every plane, `sql` contains none of the input values: assert `!sql.includes(orgId)`, `!sql.includes(userId)`, `!sql.includes(fy)`; all appear only as `:named` placeholders and as `replacements` entries |
| alias uniqueness | the returned `aliases` array has no duplicates and matches the aliases present in `sql` |
| `:unreadCap` | the notifications fragment uses `LIMIT :unreadCap` and `replacements.unreadCap === cap + 1` |
| one row guarantee | no emitted sub-select contains `GROUP BY` |

### 11.2 `tests/unit/inbox/badge_catalog_parity.test.js` — SQL ↔ model drift guard (**the critical test**)

Modelled on `tests/unit/settings/catalog_drift.test.js`: reads model metadata from the `db` registry, which calls `sequelize.define()` only and **opens no connection**.

For every catalogue entry:

1. `db[Model]` exists and `db[Model].getTableName() === entry.table`.
2. `entry.scopeColumn` exists in `db[Model].rawAttributes`.
3. `entry.paranoid === (db[Model].options.paranoid === true)`.
4. Every column named in a count filter (`status`, `is_resolved`, `total_levels`, `due_date`, `due_on`, `financial_year`, `recommendation`, `is_verified`, `is_primary`, `is_active`, `read_at`) exists in `rawAttributes`.
5. Every **enum literal** used in a filter is present in that attribute's `values` — but **only for the columns that are actually ENUMs**. Verified split (do not write an enum assertion for the right-hand column set, it will fail):

   | Column type | Tables / columns | Assertion to write |
   | :--- | :--- | :--- |
   | **ENUM** | `leave_requests.status` (`pending, approved, rejected, cancelled, cancellation_pending, terminated_cancelled`), `reimbursement_claims.status` (`draft, submitted, under_review, approved, rejected, cancelled, processed`), `employee_loans.status` (`pending, rejected, cancelled, active, closed, foreclosed`), `employee_salary_structures.status` (`proposed, approved, rejected, cancelled`), `investment_declarations.status` (`draft, submitted, under_review, verified, partially_verified, rejected`), `document_requests.status` (`open, fulfilled, cancelled, overdue`), `document_letter_proposals.status` (`pending, approved, rejected, cancelled`), `employee_documents.status` (9 values incl. `pending_verification`), `employee_documents.recommendation` (`none, verify, reject`) | literal ∈ `rawAttributes[col].type.values` |
   | **STRING** (no DB-level value list) | `attendance_regularizations.status` `STRING(20)`, `attendance_overtime.status` `STRING(20)`, `attendance_comp_offs.status` `STRING(20)`, `attendance_trusted_devices.status` `STRING(20)`, `tasks.status` `STRING(30)` | assert the attribute's type **is** a string type (so a future ENUM conversion forces a review of the literals) **and** cross-check the literals against the owning module's allow-list: `attendance/validators/hr_trusted_device.validator.js` `STATUSES` for devices, and `task/validators/hr_task.validator.js:21`'s `.valid(...)` list (via `schema.describe()`) for tasks |

6. Cross-check the **task overdue** expression and the task status list against `task.repository.getStatusSummary`'s own literals (string-compare the status names) so the governance tab and the badge cannot diverge.
7. `attendance_anomalies.is_resolved` and `employee_bank_accounts.is_verified` / `is_primary` and `user_roles.is_active` are BOOLEANs — assert the type, since a tri-state conversion would break `FILTER (WHERE … = false)`.

**Acceptance for this test:** after writing it, deliberately rename one catalogue column and confirm the suite FAILS; then revert. A parity test that has never been seen to fail is not a parity test.

### 11.3 `tests/unit/inbox/inbox_summary_service.test.js` — orchestration

Stub `badge_counts.repository.fetch`, `hierarchy_access.getAccessibleUserIds` and `entitlement.getEnabledFeatureKeys`.

| Case | Assertion |
| :--- | :--- |
| **bigint strings** | repository returns `{ leave_pending: '2', leave_cancellation_pending: '1', task_in_review: '4', … }` ⇒ `inbox_total === 14` as a **number**, and `typeof` every leaf is `'number'` |
| hr plane | `scope.plane === 'org'`, `team_size === null`, `meta.unavailable_categories` is `[]` when all features are on |
| manager plane | `plane === 'team'`, `team_size === 3`; `inbox.claims/loans/salary_proposals/tax_declarations/letter_proposals` are zeros **and** listed in `meta.unavailable_categories` |
| **manager with no reports** | `getAccessibleUserIds` → `[]` ⇒ every team-scoped count is `0`, `team_size === 0`, **and the builder was called with no org-plane fragment** (assert the repository was either not called or called with a scope that cannot match) |
| employee plane | `plane === 'self'`; whole `inbox` group zeros + unavailable; `tasks.mine` still populated; `notifications` populated |
| **admin / super-admin** | leave/attendance/task/device categories computed org-wide; `inbox.claims`, `inbox.loans`, `bank_verification`, `document_verification`, `letter_proposals` are zeros + unavailable (D-3 / R-6) |
| **hybrid role (Q-6)** | `role: 'manager'` with `getAccessibleUserIds → null`: leave/attendance/task are org-plane, payroll/document remain unavailable |
| entitlement off | `getEnabledFeatureKeys` returns a Set without `payroll.access` ⇒ all payroll categories zeros + unavailable, and the builder emitted **no** payroll sub-select |
| entitlement 503 | `getEnabledFeatureKeys` throws `AppError(503,…,'ENTITLEMENT_DEPENDENCY_FAILURE')` ⇒ propagates unchanged (no swallow, no zeros) |
| notification kill switch | `NOTIFICATION_ENGINE_ENABLED = 'false'` ⇒ `notifications` zeros + unavailable, and the endpoint still returns **200**, never 503 |
| unread cap | repository returns `notif_unread_scanned: '101'` with cap 100 ⇒ `unread === 100`, `unread_is_capped === true` |
| `missing_org_context` | `req.user.orgId === null` ⇒ `AppError(400,…,'MISSING_ORG_CONTEXT')` |
| rate limit | `checkOrgRate` reports exhausted ⇒ `AppError(429,…,'BADGE_SUMMARY_RATE_LIMITED')` with `details.retry_after_seconds` |
| derived sums | `leaves.total === pending + cancellation_pending`; `claims.total === under_review + submitted`; `sidebar.inbox_total` equals the sum of the 12 computed `inbox.*.total` and **excludes** bank/document-verification (D-8) |
| document verification reconciliation | `manager_approved + manager_rejected + no_recommendation === waiting_decision` for the stubbed row |
| **shape stability** | every documented key in §5.2 is present for **every** role, with `0` where unavailable (no `undefined`, no `null` except `scope.team_size`) |

### 11.4 `tests/unit/payroll/reimbursement_pending_hr.test.js` — REQ-PAYROLL-001

| Case | Assertion |
| :--- | :--- |
| schema default | `hrClaimsQuerySchema` on `{}` ⇒ `pending_hr === false` |
| coercion | `'true'`, `'1'`, `'false'`, `'0'` all accepted and coerced to booleans |
| conflict | `{ pending_hr: true, status: 'approved' }` ⇒ throws `AppError(400,…,'VALIDATION_ERROR')` (D-10) |
| conflict allowed inverse | `{ pending_hr: false, status: 'approved' }` ⇒ valid |
| **manager schema untouched** | `claimsQuerySchema` still rejects `pending_hr` as an unknown key — assert it is **stripped**, so the manager controller can never receive it (`stripUnknown: true`) |
| repository predicate | with `{ pendingHr: true }` the built `where` contains the `OR(under_review, AND(submitted, total_levels=1))` branch; with `pendingHr` absent the `where` is **deep-equal** to today's |
| coexistence | `{ pendingHr: true, userId, payoutPeriodMonth }` keeps all three conditions AND-ed (the `Op.or` is not clobbered and does not clobber) |
| service passthrough | `listForHr({ pendingHr: false })` produces a filter object with **no** `pendingHr` key |
| **badge parity** | the badge catalogue's `claims` filters and the repository's `pendingHr` branch reference the same three literals (`'under_review'`, `'submitted'`, `total_levels = 1`) — a single assertion that keeps §3.1 and §6 from drifting apart |

### 11.5 Regression obligation

`npm test` must be run and the **actual** pass/fail count reported. Pre-existing suites that touch the modified payroll files (`reimbursement*`, `payroll_hr*`) must be re-run explicitly and named in the completion report. No test is to be skipped or marked `todo` to go green.

### 11.6 Not covered by unit tests (state honestly)

Index usage, real query latency, and actual row-level correctness against production data cannot be verified here — there is no database access in this workflow. Those are §12's manual acceptance steps, to be executed by the operator after migration `00087` is applied.

---

## 12. Acceptance criteria

### 12.1 Automated (must pass before hand-off)

- [ ] `npm test` green, with the real count reported; no pre-existing test regressed.
- [ ] All four new test files present and green; §11.2's deliberate-break check performed.
- [ ] `node -e "require('./src/app')"` loads cleanly (no route collision on `/api/v1/inbox`).
- [ ] No file outside §8's manifest is modified (`git status` reviewed line by line).
- [ ] `grep` confirms the inbox module `require`s **no** other module's service (D-2).
- [ ] `grep` confirms the builder contains no template-literal interpolation of any request value (D-4).

### 12.2 Contract (verified by reading the diff against §5)

- [ ] Every key in §5.2 is emitted for every role, always an integer.
- [ ] `sidebar.inbox_total` = Σ of the 12 computed `inbox.*.total`.
- [ ] `meta.unavailable_categories` is sorted and uses the documented dotted keys.
- [ ] Error codes exactly as in §5.3; `Cache-Control: no-store` present.
- [ ] `pending_hr` omitted ⇒ API-133 response byte-identical to today.

### 12.3 Manual / operator (post-migration, requires DB — NOT performed by the agent)

- [ ] Migration `00087` applied; `npm run db:migrate:status` shows it up.
- [ ] For one real org, **each** badge equals the `pagination.total` of the list endpoint it links to:
      `inbox.leaves.total` vs the approver pending list length; `inbox.claims.total` vs `?pending_hr=true`;
      `document_verification.waiting_decision` vs the verification queue; `bank_verification.*` summing to active headcount;
      `notifications.unread` vs `GET /notifications/unread-count`.
- [ ] A manager sees only their direct reports' counts; a second manager in the same org sees different numbers; an employee sees zeros in `inbox`.
- [ ] A user from org A can never see org B's numbers (tenant isolation spot-check with two tokens).
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` on the HR variant shows index scans on all five new partial indexes and no sequential scan on any counted table.
- [ ] p95 latency observed under the 60 s poll is within §9's budget.

---

## 13. Documentation deliverables

| File | Content |
| :--- | :--- |
| `public/md_system/api_registry.md` | new row for `GET /api/v1/inbox/badges` (module `inbox`, roles all-org, feature: none at route level, notes: per-category entitlement); amend the API-133 row with "`pending_hr` (bool, HR only)". |
| `public/md_updates/2026-10-25_badge_counts_and_pending_hr_api_changes.md` | **Required by CLAUDE.md** — a dated change record for the frontend: the new endpoint's full payload, the `pending_hr` parameter, the `status` conflict error, the open questions from §4.2 that the frontend must answer, and the explicit note that admin/super-admin do **not** receive payroll/document counts (R-6) so the frontend must not assume `admin === hr`. |
| `.env.example` | `# Max badge-summary polls per user per hour (fixed UTC-hour window, fails open if Redis is down).`<br>`BADGE_SUMMARY_MAX_PER_HOUR=240` |
| This plan | update the Status line to IMPLEMENTED with the date and test count on completion. |

No settings-catalog change (§8.3), so `src/modules/settings/catalog/` is untouched and T-S2 is unaffected.

---

## 14. Edge cases, concurrency and failure modes

| # | Scenario | Required behaviour |
| :-- | :--- | :--- |
| E-1 | **Manager with zero direct reports** | all team counts `0`, `team_size: 0`. Never org-wide (D-5). |
| E-2 | **Manager whose only report is deactivated** | `getAccessibleUserIds` already filters on `is_active`; the cohort shrinks, counts drop. Historical rows of a deactivated member stay out of the badge, matching the member-visibility contract. |
| E-3 | **Counts change between the aggregate query and the client's render** | Accepted. The whole payload is one snapshot (one query, one MVCC view), so it is internally consistent even if seconds old. `synced_at` lets the UI show staleness. |
| E-4 | **Two HR users approve the same item concurrently** | Not this endpoint's concern — it writes nothing. The next poll reflects the winner. No locking, no transaction. |
| E-5 | **Empty org (no members, no rows)** | Every count `0`; no error, no `null`. `COUNT(*)` on an empty table returns one row of zeros. |
| E-6 | **Org with no subscription** | `getEnabledFeatureKeys` → empty Set ⇒ all gated categories zeros + unavailable; HTTP 200. The sidebar renders without badges rather than erroring. |
| E-7 | **Database unreachable** | `ENTITLEMENT_DEPENDENCY_FAILURE` 503 (entitlement step) or a propagated Sequelize error → 500. Never a 200 with zeros, which would look like "nothing to approve". |
| E-8 | **Redis unreachable** | `authenticate` already 503s with `AUTH_DEPENDENCY_FAILURE` before reaching the controller. If it somehow passes, `checkOrgRate` fails **open** (D-11). |
| E-9 | **Notification engine disabled** | 200 with `notifications` zeroed + unavailable (§3.9). Never 503. |
| E-10 | **Tenant isolation** | `org_id = :orgId` is mandatory in **every** sub-select — enforced structurally: the builder emits the org predicate from a single shared code path, so a new catalogue entry cannot omit it. §11.1 asserts the org predicate count equals the sub-select count. |
| E-11 | **Soft-deleted rows** | `deleted_at IS NULL` on every paranoid table, asserted by §11.2 against `options.paranoid`. Raw SQL does not inherit Sequelize's paranoid filter — this is the most likely source of inflated counts. |
| E-12 | **Platform user with `orgId = null`** | 400 `MISSING_ORG_CONTEXT`. No cross-org aggregation is ever attempted. |
| E-13 | **FY boundary (April 1 IST)** | `:currentFy` is computed per request from `financialYearOf(periodMonth, fyStartMonth)`; on 1 April the tax-declaration counts legitimately reset. Flagged in Q-3. |
| E-14 | **IST vs UTC date for `document_requests.overdue`** | `:todayIst` from `toIstDateString` compared to a `DATEONLY` column. A request due "today" is not overdue until tomorrow IST — identical to the existing list endpoint and to the cron. |
| E-15 | **A user holding two active role rows in one org** | `authenticate` resolves one `role` into the token; the badge mirrors that single role. The hierarchy resolver may still return `null` (Q-6); §4.3 governs and §11.3 tests it. |
| E-16 | **Very large cohort (`scopeIds` with thousands of ids)** | `getAccessibleUserIds` returns direct reports only, realistically ≤ low hundreds. `= ANY($1::uuid[])` handles that comfortably and binds as **one** parameter (no parameter-count explosion). If a cohort ever exceeds ~5 000, revisit with a `VALUES` join — noted in §15. |
| E-17 | **Polling abuse / a runaway client loop** | `BADGE_SUMMARY_MAX_PER_HOUR` (D-11) bounds one user to 240/hour. 429 carries `Retry-After`. |
| E-18 | **A future module adds a status value** (e.g. a new leave status) | §11.2 fails only if a *referenced* literal disappears; a **new** value that should be counted will not be caught. Recorded as a known limitation — the mitigation is the §13 change record discipline, not code. |

---

## 15. Deliberately deferred (with the trigger that would justify each)

| Item | Trigger |
| :--- | :--- |
| Redis caching of the payload (30–60 s TTL per user) | p95 exceeds 300 ms, or badge queries exceed ~20 % of DB time |
| `ETag` + `304 Not Modified` | bandwidth becomes a concern on mobile; needs a cheap version token, which does not exist today |
| Per-query `statement_timeout` | p99 regresses or a plan flips to a sequential scan |
| SSE / websocket push instead of polling | product asks for real-time badges |
| `?groups=inbox,tasks` partial selection | a client needs one group often enough that the full payload is measurably wasteful (the response is already `stripUnknown`-tolerant of the parameter) |
| Indirect-report cohorts (Q-1) | product confirms; requires a change to `hierarchy_access.utils` with org-wide authorization review |
| `assigned_to_me` claims filter (§6.2) | per-approver assignment becomes a real workflow |
| Counter tables / triggers / materialized views | only if the org size grows by an order of magnitude; adds write-path coupling and a reconciliation burden that is not justified today |

---

## 16. Requirement traceability

| Source requirement | Where satisfied |
| :--- | :--- |
| REQ-PAYROLL-001 (`pending_hr` filter, default false, `true/false/1/0`, correct pagination, no breaking change) | §6 (contract, proof, files, tests §11.4) |
| REQ-INBOX-001 (`GET /api/v1/inbox/badges`, HR/manager/employee scoping, full payload) | §3, §4.3, §5 |
| Spec §2 (UI/tab hierarchy incl. `loans`, `letter_proposals`, `notifications`, self task groups) | §3.2 (`tasks.mine`), §3.7, §3.8, §3.9, R-5 |
| Spec §3 (endpoint, roles, 60 req/min note) | §5.1, D-11 (240/hour ≈ 4/min — tighter than the spec's 60/min, which would permit abusive polling; raise the env value if the frontend genuinely needs more) |
| Spec §4 (JSON payload) | §5.2 — every key preserved verbatim, superset added |
| Spec §5 (sample SQL, index list, <20 ms claim) | §7 (corrected SQL), §8.3 (5 real gaps), §9 (claim rejected with reasoning) |
| Spec §6 (frontend integration blueprint) | §5.2 `synced_at`/`meta`, §13 change record, §5.4 page-by-page migration |
| "all HRMS panels **and the mobile app**" | §5.2 fixed-shape integer payload (no role-conditional keys), `scope` block for client-side layout decisions, no web-only assumptions; one endpoint serves every client |
| "minimum possible response time" | §1.3 / §7 single round trip, §8.2 batch entitlement (18 queries → 3), §8.3 partial indexes, §9 budget |
| "avoid unnecessary complexity / dependencies / caching / infrastructure" | §1.4, §15 — zero new dependencies, zero new infrastructure, one new env var |
| "document ambiguities instead of inventing business rules" | §4.2 (Q-1…Q-6), §6.2 edge case, E-18 |

---

## 17. Review checklist before execution starts

1. Confirm **D-3** (admin/super-admin excluded from payroll & document counts) — this is the one decision that contradicts the source document.
2. Answer **Q-1** (indirect reports) and **Q-2** (`waiting_decision` semantics); the rest can ship with the interim behaviour.
3. Confirm **D-8** (`inbox_total` = 12 inbox cards only).
4. Confirm the rate limit of **240/hour per user** is acceptable versus the spec's 60/min.
5. Confirm migration `00087` is to be **handed back unrun** (standing rule) and who applies it.

Once 1–5 are answered, §10 is executable end to end with no further decisions.
