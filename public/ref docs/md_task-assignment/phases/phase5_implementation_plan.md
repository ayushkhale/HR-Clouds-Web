# Phase 5 Implementation Plan — Task Assignment Module: Notification Outbox Engine, Scheduled Workers, Email Transports & Settings Catalog

**Document Path:** `public/md_task-assignment/phases/phase5_implementation_plan.md`  
**Author:** Senior/Principal Backend Engineer & System Architect  
**Date:** October 14, 2026  
**Status:** Ready for Implementation  
**Baseline Codebase Status:** 3,421 / 3,421 Passing (100% Green) across entire HRMS codebase (42 / 42 passing in Task Assignment module suites)  
**Parent Source of Truth:** [`C:\Users\91930\Desktop\Vs_Code\HRMS\public\md_task-assignment\implementation_plan.md`](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/implementation_plan.md)  
**Predecessors:**
- [Phase 1 Implementation Plan — Completed](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/phases/phase1_implementation_plan.md) (Foundation, Schema, Repositories)
- [Phase 2 Implementation Plan — Completed](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/phases/phase2_implementation_plan.md) (Hierarchy, Core Assignment, Self-Service Views #249–#251, #255–#258, #265–#267)
- [Phase 3 Implementation Plan — Completed](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/phases/phase3_implementation_plan.md) (Lifecycle, Review Gate, Attachments Handshake #252, #259–#263, #268–#270)
- [Phase 4 Implementation Plan — Completed](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/phases/phase4_implementation_plan.md) (Contextual Discussions, Audit Ledger #253, #254, #264)
**Target Completion:** Task Assignment Module Phase 5 (Transactional Outbox Dispatcher, Overdue Sweeper Cron, AWS SES HTML Email Transports, Settings Catalog Integration & Startup Recovery)  

---

## 1. Goal, Scope & Scope Reconstruction Analysis

### 1.0 Phase Goal
Deliver **Phase 5** of the Task Assignment Module: implement the **Asynchronous Outbox Notification Engine**, the **Temporal Overdue Sweeper**, **AWS SES Email Transports with Responsive HTML Rendering**, **Server Startup Recovery Hooks**, and full **Settings Catalog Integration** with load-time invariant drift guards.

Phase 5 completes the Task Assignment subsystem by transforming transactional domain events generated across Phases 1–4 into reliable, deduplicated, out-of-band email notifications and automated deadline escalations, while providing organization administrators with granular control over task thresholds and notification policies via the unified HRMS Settings Gateway.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                       TASK ASSIGNMENT PHASE 5 ARCHITECTURAL TOPOLOGY                        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  DOMAIN TRANSACTIONS (Phases 1–4)                                                           │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐          │
│  │  task.service.js      │   │  task_comment.service │   │  Overdue Sweeper Cron │          │
│  │  (assign, submit,     │   │  (contextual comments │   │  (hourly scan of past │          │
│  │   reopen, reassign,   │   │   & progress updates) │   │   due active tasks)   │          │
│  │   cancel, extend)     │   │                       │   │                       │          │
│  └──────────┬────────────┘   └───────────┬───────────┘   └───────────┬───────────┘          │
│             │                            │                           │                      │
│             ▼                            ▼                           ▼                      │
│    ┌─────────────────────────────────────────────────────────────────────────┐              │
│    │ TRANSACTIONAL OUTBOX TABLE: `task_notifications` (Dedupe-Key Indexed)   │              │
│    │ (Status: pending | processing | sent | failed; max_attempts = 5)        │              │
│    └────────────────────────────────────┬────────────────────────────────────┘              │
│                                         │                                                   │
│                                         ▼ (Every 60s: FOR UPDATE SKIP LOCKED)               │
│    ┌─────────────────────────────────────────────────────────────────────────┐              │
│    │ OUTBOX WORKER: `task_notification_dispatch.cron.js`                     │              │
│    │ 1. Claims batch (LIMIT 50) using row-level SKIP LOCKED                  │              │
│    │ 2. Evaluates Org Policy via `task_settings` / `taskSettingsService`     │              │
│    │ 3. Hydrates Recipient (`User` + `UserProfile`)                          │              │
│    │ 4. Renders HTML Template: `task_notification.html`                      │              │
│    │ 5. Dispatches via AWS SES (`emailUtils.sendTemplatedEmail`)             │              │
│    │ 6. On Success: `status = sent`, `sent_at = NOW()`                       │              │
│    │ 7. On Error: Exponential Backoff (2^attempts * 1m), max 5 attempts      │              │
│    └─────────────────────────────────────────────────────────────────────────┘              │
│                                                                                             │
│  SETTINGS GOVERNANCE (Store: `task_settings`, Group: `tasks.governance`)                     │
│  ┌─────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐  │
│  │ `task.catalog.js`       │   │ `task_settings.adapter`  │   │ Settings Invariant 9/11  │  │
│  │ (9 typed org knobs)     │──►│ (Settings Gateway Wire)  │──►│ (Boot-time Drift Guards) │  │
│  └─────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘  │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.1 Scope Reconstruction Requirement: Downward Comparison Analysis

To determine the **actual remaining Phase 5 scope**, we compare the Main Implementation Plan through the four completed phases:

```
Main Task Assignment Implementation Plan (§1.1, §10, §12 Phase 5, §14)
  │
  ├─► Phase 1 Plan (Completed): Created `tasks`, `task_attachments`, `task_comments`, `task_audit_logs`,
  │                             and `task_notifications` tables in Migration `00075`. Models & repos built.
  │                             Seeder `014-seed-task-feature.js` seeded `tasks.access`.
  │
  ├─► Phase 2 Plan (Completed): Built Core Task Delegation & Hierarchy Engine. Mounted routes #249–#251,
  │                             #255–#258, #265–#267. Added transactional outbox enqueue for `TASK_ASSIGNED`.
  │                             Enforced read-receipt tracking (`is_viewed`, `first_viewed_at`).
  │
  ├─► Phase 3 Plan (Completed): Built Task Lifecycle & Review Gate. Mounted routes #252, #259–#263,
  │                             #268–#270. Added transactional outbox enqueues for `TASK_SUBMITTED`,
  │                             `TASK_COMPLETED`, `TASK_REOPENED`, `TASK_CANCELLED`, `TASK_DUE_DATE_EXTENDED`.
  │                             Implemented S3 staged attachment handshake & `If-Match` concurrency.
  │
  ├─► Phase 4 Plan (Completed): Built Contextual Discussions & Formalized Audit Trail. Mounted routes
  │                             #253, #254, #264. Added 30 comment/hr rate limiting. Added system comments.
  │
  ▼
Actual Remaining Phase 5 Scope:
  1. Multi-Tenant `task_settings` table & Migration `00076`.
  2. Settings Catalog integration: group `tasks.governance` in `groups.js`, 9 typed keys (#114–#122) in `task.catalog.js`, and `task_settings.adapter.js`.
  3. Transactional Outbox Engine: `task_notification.service.js` with `SKIP LOCKED` batch claiming, tenant gating, exponential backoff, and recipient hydration.
  4. Responsive HTML Email template: `src/common/templates/task_notification.html` and 9 event registrations in `email.utils.js` `TEMPLATE_MAP`.
  5. Temporal Overdue Sweeper: `runOverdueSweeper` utilizing partial index `tasks_overdue_sweep_idx` with 24h deterministic deduplication keys.
  6. Scheduled Cron Workers: `task_notification_dispatch.cron.js` (every 60s) and `task_overdue_sweeper.cron.js` (hourly) registered in `src/server.js`.
  7. Server Startup Recovery Hook: `runStartupCatchUp()` in `src/server.js` recovering orphaned `processing` records.
  8. In-Task Discussion Outbox Integration: Hooking `TASK_COMMENT_ADDED` into `task_comment.service.js`.
  9. Automated Test Suite: `task_phase5_notifications_and_crons.test.js`.
```

---

### 1.2 Completed vs. Remaining Scope Matrix

| Subsystem Component | Planned Phase | Current Implementation Status | Phase 5 Concrete Responsibility |
|---|:---:|:---:|---|
| **`tasks` Table & Model** | Phase 1 | **COMPLETED** (Migration `00075`, `tasks.model.js`) | Read-only target for overdue sweeper queries; consumed without DDL changes. |
| **`task_attachments` Table & Model** | Phase 1, 3 | **COMPLETED** (Migration `00075`, `task_attachments.model.js`) | Enforce tenant quota settings (`task_max_attachments_per_task`, `task_max_attachment_size_mb`). |
| **`task_comments` Table & Model** | Phase 1, 4 | **COMPLETED** (Migration `00075`, `task_comments.model.js`) | Enforce rate limit setting (`task_comment_rate_limit_hourly`); hook outbox event on comment creation. |
| **`task_audit_logs` Table & Model** | Phase 1, 4 | **COMPLETED** (Migration `00075`, `task_audit_logs.model.js`) | Audit tenant settings mutations (`entityType: 'task_settings'`). |
| **`task_notifications` Table & Model** | Phase 1 | **COMPLETED** (Migration `00075`, `task_notifications.model.js`) | Primary execution table for outbox queueing, batch claiming, and state transitions. |
| **`task_notification.repository.js`** | Phase 1 | **COMPLETED** (`src/modules/task/repositories/`) | Consume `claimPendingBatches`, `markSent`, `recordFailure`. Add count helpers. |
| **HTTP APIs #249–#270** | Phases 2–4 | **COMPLETED** (100% Pass in Postman Master Suite) | Fully operational. Zero wire changes to existing request/response contracts. |
| **Transactional Outbox Enqueues** | Phases 2–3 | **PARTIALLY COMPLETED** (In `task.service.js`) | Already enqueuing 6 events; Phase 5 adds comment notice in `task_comment.service.js`. |
| **Outbox Service (`task_notification.service.js`)** | Phase 5 | **REMAINING (NEW)** | Central service orchestrating claiming, recipient hydration, gating, backoff, and dispatch. |
| **`task_settings` Table & Migration** | Phase 5 | **REMAINING (NEW)** | Create migration `00076-create-task-settings.js`, model, repository, and service. |
| **Settings Catalog (`task.catalog.js`)** | Phase 5 | **REMAINING (NEW)** | Register group `tasks.governance` in `groups.js` & define 9 keys (#114–#122). |
| **Settings Adapter (`task_settings.adapter.js`)** | Phase 5 | **REMAINING (NEW)** | Implement adapter satisfying Invariant 9 (bijection) & Invariant 11 (disjoint keys). |
| **HTML Email Template (`task_notification.html`)** | Phase 5 | **REMAINING (NEW)** | Create unified responsive email template in `src/common/templates/`. |
| **Email Map Registration (`email.utils.js`)** | Phase 5 | **REMAINING (NEW)** | Register 9 task event types in `TEMPLATE_MAP` to prevent SES dispatch exceptions. |
| **Outbox Drain Cron (`task_notification_dispatch.cron.js`)** | Phase 5 | **REMAINING (NEW)** | 60-second cron worker with `SKIP LOCKED` batch claiming and concurrency lock. |
| **Overdue Sweeper Cron (`task_overdue_sweeper.cron.js`)** | Phase 5 | **REMAINING (NEW)** | Hourly cron worker scanning past-due tasks with 24-hour calendar deduplication. |
| **Server Startup Catch-Up Hook** | Phase 5 | **REMAINING (NEW)** | Wire `runStartupCatchUp()` in `src/server.js` 30s post-boot hook to recover orphaned rows. |
| **Phase 5 Automated Test Suite** | Phase 5 | **REMAINING (NEW)** | Author `tests/unit/task/task_phase5_notifications_and_crons.test.js` using `node:test`. |

---

### 1.3 Explicitly In Scope for Phase 5

1. **Database Migration `00076-create-task-settings.js` & Model `task_settings.model.js`:**
   - Multi-tenant configuration table storing org-wide quotas, toggles, and intervals.
   - Domain check constraints enforcing valid integer ranges at the database layer.
   - Lazy default hydration via `task_settings.repository.js#getOrCreate(orgId)`.
2. **Settings Catalog Integration (`task.catalog.js` & `task_settings.adapter.js`):**
   - Register group `tasks.governance` in `groups.js` under store `task_settings`.
   - Author `task.catalog.js` specifying 9 typed entries (#114–#122) with validation metadata.
   - Author `task_settings.adapter.js` satisfying Settings Invariants 9 and 11.
   - Register entries in `public/md_settings/org_settings_registry.md`.
3. **Transactional Outbox Notification Engine (`task_notification.service.js`):**
   - Batch claimer executing `SELECT ... FOR UPDATE SKIP LOCKED` (batch size 50).
   - Recipient hydration from `User` and `UserProfile`.
   - Settings gating: skips email dispatch if disabled by tenant policy, marking record `sent`.
   - Exponential backoff: $\Delta t_{\text{retry}} = 2^{\text{attempts}} \times 60\text{ seconds}$, capping at 5 attempts before marking `failed`.
4. **Responsive HTML Email Template & AWS SES Transports:**
   - Unified template `src/common/templates/task_notification.html` supporting dynamic event types, priority badges, action CTAs, and feedback boxes.
   - Complete registration of all 9 event types in `src/common/utilities/email.utils.js` `TEMPLATE_MAP`.
5. **Scheduled Background Cron Workers:**
   - `src/cron-jobs/task_notification_dispatch.cron.js` (every 60 seconds IST).
   - `src/cron-jobs/task_overdue_sweeper.cron.js` (hourly IST at minute 0).
   - Server registration in `src/server.js` under Linux platform guard.
6. **Server Startup Recovery Hook:**
   - Startup catch-up scanner executing 30 seconds post-boot in `src/server.js` to reset orphaned `processing` records older than 10 minutes to `pending`.
7. **Discussion Outbox Integration:**
   - Atomically enqueuing `TASK_COMMENT_ADDED` within `task_comment.service.js#createComment`.
8. **Automated Test Suite:**
   - Comprehensive test coverage in `tests/unit/task/task_phase5_notifications_and_crons.test.js`.

---

### 1.4 Explicitly NOT in Scope (Post-Phase 5 / Future Modules)

* **Real-time WebSockets / SSE Live Push:** Browser-based push updates and typing indicators belong to an infrastructure-wide WebSocket gateway, not the task outbox engine. Polling via `#254` remains the established standard.
* **Mobile Push Notifications (FCM / APNS):** Mobile push delivery is decoupled from backend HTTP services. Transactional outbox records can be consumed by future mobile dispatchers without altering the PostgreSQL schema.
* **Module 6 (Performance & Appraisal Integration):** OKRs, performance ratings, KPI weighting, and annual appraisal cycles remain strictly in Module 6. The Task Assignment module provides the read-only operational performance columns (`original_due_date`, `extension_count`, `is_completed_on_time`, `rework_count`) established in Phase 1.

---

## 2. Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 Dependency Analysis

Phase 5 represents the asynchronous, event-driven, and governance layer that completes the Task Assignment Module. It relies directly on the architectural assets built across all preceding phases:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                       CROSS-PHASE DEPENDENCY CHAIN OF CUSTODY                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  PHASE 1 FOUNDATION                                                                         │
│  ├── `task_notifications` table (schema, status enum, dedupe_key unique index)              │
│  ├── `task_notification.repository.js` (`claimPendingBatches`, `markSent`, `recordFailure`)  │
│  ├── `tasks_overdue_sweep_idx` partial index on `(org_id, due_date, status)`                │
│  └── Feature flag `tasks.access` seeded in `014-seed-task-feature.js`                       │
│           │                                                                                 │
│           ▼ (Furnishes operational entities & outbox tables)                                │
│  PHASE 2 DELEGATION PLANE                                                                   │
│  ├── Task creation transaction enqueues `TASK_ASSIGNED` outbox record                       │
│  ├── Hierarchy engine (`HierarchyAccess`) validates assigner/assignee relationships         │
│  └── Dynamic `is_overdue` evaluation model established (§D-T5)                             │
│           │                                                                                 │
│           ▼ (Furnishes state transitions & lifecycle mutations)                             │
│  PHASE 3 LIFECYCLE & EXECUTION PLANE                                                        │
│  ├── Submit deliverable enqueues `TASK_SUBMITTED`                                           │
│  ├── Approve task enqueues `TASK_COMPLETED`                                                 │
│  ├── Reopen task enqueues `TASK_REOPENED` with mandatory reason                             │
│  ├── Reassign task enqueues `TASK_REASSIGNED` with new assignee & deadline                  │
│  ├── Cancel task enqueues `TASK_CANCELLED` with mandatory reason                            │
│  ├── Extend deadline enqueues `TASK_DUE_DATE_EXTENDED`                                      │
│  └── Presigned S3 attachment uploads governed by attachment quota settings                  │
│           │                                                                                 │
│           ▼ (Furnishes discussion feed & domain audit logging)                              │
│  PHASE 4 DISCUSSION & AUDIT PLANE                                                           │
│  ├── In-task comment feeds governed by comment rate limit setting                           │
│  ├── Comment creation hooked in Phase 5 to enqueue `TASK_COMMENT_ADDED`                     │
│  └── Immutable `task_audit_logs` records settings modifications (`task_settings`)            │
│           │                                                                                 │
│           ▼ (Asynchronously drains, enforces settings, sweeps deadlines)                    │
│  PHASE 5 ASYNCHRONOUS ENGINE & GOVERNANCE PLANE                                             │
│  ├── Outbox Worker claims batches from Phase 1 `task_notifications` table                   │
│  ├── Sweeper scans active tasks via Phase 1 `tasks_overdue_sweep_idx`                       │
│  ├── Settings Adapter links `task_settings` to HRMS Settings Gateway                        │
│  └── Crons & Catch-Up hooks execute scheduled tasks reliably under Linux                    │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Pre-Flight Checks & Verified Codebase Facts

Every architectural decision and file reference in this plan is grounded in verified repository facts:

1. **Latest Migration Number is `00075`:** The highest numbered migration in `src/infrastructure/postgres-sql/migrations/` is `00075-create-task-assignment-module.js`. The Phase 5 migration is strictly **`00076-create-task-settings.js`**.
2. **Latest Seeder Number is `014`:** The most recent seeder is `014-seed-task-feature.js` (seeding `tasks.access`). Phase 5 requires no new feature flag because `tasks.access` already governs all task capabilities.
3. **Latest Setting Registry Number is `113`:** The highest numbered setting in `public/md_settings/org_settings_registry.md` is `#113` (Leave module). Task module settings are strictly assigned numbers **#114 through #122**.
4. **Settings Catalog Invariant 9 is a Strict Bijection:** In `src/modules/settings/adapters/index.js`, Invariant 9 asserts that every store referenced by any group in `groups.js` has exactly one adapter in `ADAPTERS`, and vice versa. Registering store `task_settings` requires authoring `task_settings.adapter.js` and registering it in `ADAPTERS`. A failure here **crashes process boot**.
5. **Settings Catalog Invariant 11 (Disjoint Keys):** `catalogKeys ∩ nonSettingKeys == ∅`. All 9 task setting keys defined in `task.catalog.js` must match the model columns and Joi schema without colliding with `nonSettingKeys`.
6. **Partial Index `tasks_overdue_sweep_idx` Already Exists:** Migration `00075` line 215 created:
   ```sql
   CREATE INDEX tasks_overdue_sweep_idx
   ON tasks (org_id, due_date, status)
   WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');
   ```
   Phase 5 overdue queries must match this index structure precisely (`WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled') AND due_date < NOW()`) for $O(\log N)$ scan efficiency.
7. **Outbox Deduplication Unique Index Already Exists:** Migration `00075` created a unique index on `task_notifications(org_id, dedupe_key)`. Duplicate enqueues with identical `(orgId, dedupeKey)` reject with unique constraint violations or can use `ON CONFLICT (org_id, dedupe_key) DO NOTHING`.
8. **Email Transports Delegate to AWS SES:** `emailProviderFactory.getProvider().sendMail()` in `src/common/utilities/email.utils.js` reads `TEMPLATE_MAP`. If an event type is not in `TEMPLATE_MAP`, `sendTemplatedEmail` throws an error. All 9 task event types must be registered.
9. **Cron Execution Platform Guard:** In `src/server.js:29`, background crons only execute when `os.platform() === 'linux' && cronJobsEnabled`. Under local development on Windows, crons are safely dormant while unit tests and manual service triggers execute reliably.
10. **Zero External Dependencies:** Node.js native `node:test`, `node:assert`, `node-cron`, `dayjs`, and `sequelize` satisfy all Phase 5 requirements. No new npm packages may be installed.

---

## 4. Directory Structure & File Map

### 4.1 New Files to Create

```text
src/
├── infrastructure/
│   └── postgres-sql/
│       └── migrations/
│           └── 00076-create-task-settings.js              ← NEW: Migration for task_settings table
├── common/
│   └── templates/
│       └── task_notification.html                         ← NEW: Responsive HTML email template
├── cron-jobs/
│   ├── task_notification_dispatch.cron.js                 ← NEW: 60s outbox drain worker
│   └── task_overdue_sweeper.cron.js                       ← NEW: Hourly overdue task scanner
└── modules/
    ├── settings/
    │   ├── adapters/
    │   │   └── task_settings.adapter.js                   ← NEW: Settings gateway adapter for task_settings
    │   └── catalog/
    │       └── task.catalog.js                            ← NEW: 9 typed catalog entries (#114–#122)
    └── task/
        ├── models/
        │   └── task_settings.model.js                     ← NEW: Sequelize model for task_settings
        ├── repositories/
        │   └── task_settings.repository.js                ← NEW: Data access layer for task_settings
        ├── services/
        │   ├── task_notification.service.js               ← NEW: Central outbox engine & sweeper
        │   └── task_settings.service.js                   ← NEW: Business service for task settings
        └── validators/
            └── task_settings.validator.js                 ← NEW: Joi schema for settings mutations

tests/
└── unit/
    └── task/
        └── task_phase5_notifications_and_crons.test.js    ← NEW: Comprehensive Phase 5 test suite
```

### 4.2 Existing Files to Modify

```text
src/
├── server.js                                              ← MODIFY: Register crons & startup catch-up hook
├── common/
│   └── utilities/
│       └── email.utils.js                                 ← MODIFY: Register 9 task events in TEMPLATE_MAP
├── modules/
│   ├── settings/
│   │   ├── adapters/
│   │   │   └── index.js                                   ← MODIFY: Register task_settings adapter in ADAPTERS
│   │   └── catalog/
│   │       ├── groups.js                                  ← MODIFY: Register `tasks.governance` group
│   │       └── index.js                                   ← MODIFY: Import & spread `task.catalog.js`
│   └── task/
│       ├── repositories/
│       │   └── task.repository.js                         ← MODIFY: Add `findOverdueSweepCandidates` query
│       └── services/
│           └── task_comment.service.js                    ← MODIFY: Enqueue TASK_COMMENT_ADDED outbox event

public/
└── md_settings/
    └── org_settings_registry.md                           ← MODIFY: Append task settings #114–#122
```

---

## 5. Implementation-Ready Feature Breakdown (The 11-Field Standard)

In accordance with system architect standards, every significant feature of Phase 5 is analyzed across 11 architectural dimensions:

```text
Requirement → Existing Dependency → Database Impact → API Impact → Business Logic → Validation → Authorization → Task/Assignment Impact → Failure Handling → Testing → Acceptance Criteria
```

---

### Feature 1: Multi-Tenant `task_settings` Storage, Model & Migration `00076`

* **1. Requirement:** Provide a persistent, multi-tenant configuration store for task module governance knobs (attachment quotas, file size boundaries, overdue reminder intervals, notification email toggles, and discussion rate limits).
* **2. Existing Dependency:** `organizations` table (Migration `00001`), Sequelize connection pool (`src/infrastructure/postgres-sql/models.index.js`).
* **3. Database Impact:** New table `task_settings` created via migration `00076-create-task-settings.js` with check constraints on numerical ranges and unique index `task_settings_org_id_uq` on `org_id`.
* **4. API Impact:** None direct. Served through the HRMS Settings Gateway (`/api/v1/settings/group/tasks.governance`).
* **5. Business Logic:** Provides `getOrCreate(orgId)` lazy default initialization: if an organization accesses or checks settings before explicitly saving them, system returns standard defaults without requiring manual seeding per tenant.
* **6. Validation:** Check constraints enforce: `task_max_attachments_per_task` (1–50), `task_max_attachment_size_mb` (1–50), `task_overdue_reminder_hours` (1–168), `task_comment_rate_limit_hourly` (5–100).
* **7. Authorization:** Scoped strictly by `org_id`. Internal service access requires tenant context.
* **8. Task/Assignment Impact:** Governs downstream task operations: upload size caps in `task_attachment.service.js`, rate limiting in `task_comment.service.js`, and email notification dispatch in `task_notification.service.js`.
* **9. Failure Handling:** Unhandled DB errors rollback migration transaction cleanly. Stale reads fallback to defaults.
* **10. Testing:** Migration up/down tests, model validation tests, lazy `getOrCreate` creation assertions.
* **11. Acceptance Criteria:** Table created cleanly, unique constraint prevents duplicate rows per org, invalid numbers rejected by check constraints.

---

### Feature 2: Settings Catalog Definition (`task.catalog.js`, `groups.js`, Registry #114–#122)

* **1. Requirement:** Expose task configuration knobs to the platform Settings UI and API while maintaining Settings Catalog Invariants 1–11.
* **2. Existing Dependency:** `src/modules/settings/catalog/define_entry.js`, `groups.js`, `org_settings_registry.md`.
* **3. Database Impact:** None. Metadata configuration only.
* **4. API Impact:** Exposes group `tasks.governance` under `GET /api/v1/settings/group/tasks.governance`.
* **5. Business Logic:** Defines typed metadata (data type, default value, UI label, description, risk level, effect timing, allowed ranges) for settings #114 through #122.
* **6. Validation:** Catalog loader asserts load-time invariants (type consistency, range boundaries, unique registry refs).
* **7. Authorization:** `read_roles: ['hr', 'manager']`, `write_roles: ['hr']`. Managers can view governance policies; HR can modify them.
* **8. Task/Assignment Impact:** Allows tenant HR administrators to customize task module rules without modifying application code.
* **9. Failure Handling:** Invariant mismatch throws at process start, halting deployment before serving invalid contracts.
* **10. Testing:** `tests/unit/settings/settings_catalog.test.js` parity execution.
* **11. Acceptance Criteria:** All 9 entries pass catalog loader freeze without throwing invariant exceptions.

---

### Feature 3: Settings Adapter (`task_settings.adapter.js`) & Boot-Time Invariant 9/11 Enforcement

* **1. Requirement:** Bridge the platform Settings Gateway to the `task_settings` store while satisfying Invariant 9 (store bijection) and Invariant 11 (disjoint non-setting keys).
* **2. Existing Dependency:** `task_settings.service.js`, `task_settings.validator.js`, `src/modules/settings/adapters/index.js`.
* **3. Database Impact:** Mutates `task_settings` and records entries in `task_audit_logs`.
* **4. API Impact:** Powers `PATCH /api/v1/settings/group/tasks.governance` with optimistic locking (`If-Match`).
* **5. Business Logic:** Implements `read(orgId)` and `update(orgId, patch, actor, options)`. Strips non-catalog fields, extracts audit metadata, validates against Joi schema.
* **6. Validation:** `taskSettingsValidator.updateSettingsSchema` enforces strict Joi validation matching catalog constraints.
* **7. Authorization:** Gateway checks `write_roles: ['hr']` before invoking `update()`.
* **8. Task/Assignment Impact:** Updates take effect immediately (`effect_timing: 'immediate'` or `'next_record'`).
* **9. Failure Handling:** Concurrency collision throws `412 Precondition Failed` if `updated_at` does not match `If-Match`.
* **10. Testing:** Unit tests verifying `read`, `update`, `ownerWritableKeys`, and invariant validation.
* **11. Acceptance Criteria:** `src/modules/settings/adapters/index.js` boots with `task_settings` registered in `ADAPTERS`.

---

### Feature 4: Transactional Outbox Notification Engine (`task_notification.service.js`)

* **1. Requirement:** Provide reliable, asynchronous, deduplicated outbox draining and email dispatch with exponential backoff and policy gating.
* **2. Existing Dependency:** `task_notifications` table (Migration `00075`), `task_notification.repository.js`, `email.utils.js`.
* **3. Database Impact:** Updates `task_notifications` status (`pending` → `processing` → `sent` / `failed`), sets `sent_at`, increments `attempts`, updates `next_retry_at`.
* **4. API Impact:** None direct. Operates asynchronously in background.
* **5. Business Logic:** 
   1. Claims batch (LIMIT 50) using `FOR UPDATE SKIP LOCKED`.
   2. Evaluates tenant notification toggles via `task_settings`. If disabled, marks `sent` with skip notation.
   3. Hydrates recipient user and email.
   4. Renders and dispatches email via AWS SES.
   5. Applies exponential backoff on failure: $\Delta t_{\text{retry}} = 2^{\text{attempts}} \times 60\text{s}$, max 5 attempts.
* **6. Validation:** Validates recipient email existence; verifies event type against supported catalog.
* **7. Authorization:** System-level background execution; tenant boundaries enforced by `org_id` on all queries.
* **8. Task/Assignment Impact:** Delivers email alerts for task assignments, submissions, approvals, rejections, cancellations, extensions, comments, and overdues.
* **9. Failure Handling:** Transient SES errors trigger backoff retry; permanent failures transition to `failed` without crashing worker or blocking subsequent items.
* **10. Testing:** Mocked SES unit tests for batch claiming, gating, backoff calculation, and failure recording.
* **11. Acceptance Criteria:** Enqueued outbox items transition to `sent` upon dispatch; disabled toggles advance cleanly without sending emails.

---

### Feature 5: Multi-Event HTML Email Rendering (`task_notification.html` & `email.utils.js`)

* **1. Requirement:** Render professional, responsive, high-aesthetic HTML emails for 9 distinct task assignment events.
* **2. Existing Dependency:** `src/common/utilities/email.utils.js`, Handlebars templating engine, AWS SES client.
* **3. Database Impact:** None. Template rendering only.
* **4. API Impact:** None direct.
* **5. Business Logic:** Renders `src/common/templates/task_notification.html` with dynamic context: recipient name, task title, assigner name, deadline, priority badge, action URL, feedback/reopen reason, and comment excerpt.
* **6. Validation:** `email.utils.js` verifies recipient email format and ensures template file exists.
* **7. Authorization:** None (system email generator).
* **8. Task/Assignment Impact:** Delivers clear, branded visual communication to employees, managers, and HR administrators.
* **9. Failure Handling:** Missing template file throws explicit error caught by outbox service, triggering retry backoff.
* **10. Testing:** Template rendering unit tests verifying variable interpolation, conditional blocks, and HTML structure.
* **11. Acceptance Criteria:** All 9 task event types defined in `TEMPLATE_MAP` render valid HTML without unparsed placeholders.

---

### Feature 6: Temporal Overdue Task Sweeper Engine

* **1. Requirement:** Periodically scan active tasks that have passed their UTC deadline and enqueue overdue notification alerts without spamming recipients.
* **2. Existing Dependency:** Partial index `tasks_overdue_sweep_idx`, `task.repository.js`, `task_notification.service.js`.
* **3. Database Impact:** Inserts overdue notification records into `task_notifications` with 24-hour deterministic deduplication keys.
* **4. API Impact:** None direct.
* **5. Business Logic:** Executes hourly. Scans tasks `WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled') AND due_date < NOW()`. Formulates 24-hour deduplication keys: `task_overdue:{recipientType}:{taskId}:{recipientId}:{YYYY-MM-DD}`. Enqueues alerts for assignee and assigner.
* **6. Validation:** Verifies task is active before enqueuing.
* **7. Authorization:** Background process scoped by tenant `org_id`.
* **8. Task/Assignment Impact:** Escalates overdue work to assignees and assigners. Does **NOT** alter `tasks.status` (overdue is dynamically computed per §D-T5).
* **9. Failure Handling:** Deduplication key collision on `(org_id, dedupe_key)` throws `SequelizeUniqueConstraintError`, which is cleanly caught and ignored (silencing duplicate runs within the same calendar day).
* **10. Testing:** Sweeper scan tests verifying candidate selection, deduplication key format, and duplicate suppression.
* **11. Acceptance Criteria:** Past-due tasks generate exactly one overdue alert per recipient per calendar day.

---

### Feature 7: Scheduled Cron Workers (`task_notification_dispatch.cron.js`, `task_overdue_sweeper.cron.js`)

* **1. Requirement:** Automate recurring execution of outbox draining (every 60s) and overdue sweeping (hourly).
* **2. Existing Dependency:** `node-cron`, `src/server.js`, `task_notification.service.js`.
* **3. Database Impact:** Periodic background read/write transactions.
* **4. API Impact:** None direct.
* **5. Business Logic:**
   - `task_notification_dispatch.cron.js`: Schedules `* * * * *` (IST). Contains in-process boolean lock `isDrainRunning` to prevent overlap.
   - `task_overdue_sweeper.cron.js`: Schedules `0 * * * *` (IST). Contains in-process boolean lock `isSweeperRunning` to prevent overlap.
* **6. Validation:** Validates execution platform: strictly dormant on non-Linux OS unless manually invoked.
* **7. Authorization:** System-level background processes.
* **8. Task/Assignment Impact:** Ensures prompt delivery of notifications (<60s latency) and hourly deadline compliance checks.
* **9. Failure Handling:** Unhandled errors inside cron tick are caught and logged without crashing the Node.js process.
* **10. Testing:** Cron registration assertions and execution mock tests.
* **11. Acceptance Criteria:** Crons schedule with valid cron expressions and execute bounded batches safely.

---

### Feature 8: Server Startup Catch-Up & Orphan Recovery Hook

* **1. Requirement:** Recover notifications stuck in `processing` status due to unexpected node server restarts or crashes, and trigger an immediate drain pass.
* **2. Existing Dependency:** `src/server.js`, `task_notification.service.js`.
* **3. Database Impact:** Updates `task_notifications` `SET status = 'pending', next_retry_at = CURRENT_TIMESTAMP WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'`.
* **4. API Impact:** None direct.
* **5. Business Logic:** Executes 30 seconds after server startup via `setTimeout` in `src/server.js`. Recovers orphaned rows and runs an initial drain pass.
* **6. Validation:** Only resets rows older than 10 minutes, avoiding interference with active workers on other cluster nodes.
* **7. Authorization:** Internal system startup hook.
* **8. Task/Assignment Impact:** Eliminates lost notifications caused by infrastructure restarts or deployment recycling.
* **9. Failure Handling:** Startup hook errors are logged as warnings and do not interrupt HTTP server initialization.
* **10. Testing:** Unit tests verifying recovery query logic and threshold filtering.
* **11. Acceptance Criteria:** Stale `processing` rows reset to `pending` upon startup catch-up execution.

---

### Feature 9: In-Task Discussion Outbox Integration

* **1. Requirement:** Automatically notify discussion participants via email when a new comment or progress milestone is posted.
* **2. Existing Dependency:** `task_comment.service.js`, `task_notification.service.js`.
* **3. Database Impact:** Inserts `TASK_COMMENT_ADDED` record into `task_notifications` within the comment creation transaction.
* **4. API Impact:** Affects `#253` (`POST /tasks/me/:id/comments`) and `#264` (`POST /tasks/manager/:id/comments`).
* **5. Business Logic:** Determines counterpart recipient:
   - If comment authored by assignee $\to$ notify assigner.
   - If comment authored by assigner or HR $\to$ notify assignee.
   - Author is never notified of their own comment.
   - Dedupe key: `task_comment:{commentId}`.
* **6. Validation:** Requires active task and valid counterpart recipient.
* **7. Authorization:** Inherits comment endpoint authorization.
* **8. Task/Assignment Impact:** Keeps stakeholders informed of discussion updates in real time.
* **9. Failure Handling:** Notification enqueue is committed atomically with comment creation; if comment fails, no notification is enqueued.
* **10. Testing:** Unit tests asserting counterpart resolution and outbox enqueue on comment creation.
* **11. Acceptance Criteria:** Posting comment enqueues `TASK_COMMENT_ADDED` outbox row addressed to the opposite party.

---

## 6. Database Design & Migration Specification

### 6.1 Migration File: `00076-create-task-settings.js`

```javascript
'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.createTable('task_settings', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
          allowNull: false
        },
        org_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true,
          references: { model: 'organizations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        task_max_attachments_per_task: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 20
        },
        task_max_attachment_size_mb: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10
        },
        task_overdue_reminder_hours: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 24
        },
        task_notify_email_on_assignment: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        task_notify_email_on_reopen: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        task_notify_email_on_overdue: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        task_notify_email_on_submission: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        task_notify_email_on_completion: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        task_comment_rate_limit_hourly: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 30
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction })

      // Domain check constraints
      await queryInterface.sequelize.query(`
        ALTER TABLE task_settings
          ADD CONSTRAINT chk_task_settings_max_attachments CHECK (task_max_attachments_per_task BETWEEN 1 AND 50),
          ADD CONSTRAINT chk_task_settings_max_size_mb CHECK (task_max_attachment_size_mb BETWEEN 1 AND 50),
          ADD CONSTRAINT chk_task_settings_overdue_hours CHECK (task_overdue_reminder_hours BETWEEN 1 AND 168),
          ADD CONSTRAINT chk_task_settings_rate_limit CHECK (task_comment_rate_limit_hourly BETWEEN 5 AND 100);
      `, { transaction })

      // Unique tenant index
      await queryInterface.addIndex('task_settings', ['org_id'], {
        unique: true,
        name: 'task_settings_org_id_uq',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('task_settings')
  }
}
```

---

### 6.2 Sequelize Model: `task_settings.model.js`

```javascript
'use strict'

module.exports = (sequelize, DataTypes) => {
  const TaskSetting = sequelize.define(
    'TaskSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      org_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },
      task_max_attachments_per_task: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 20,
        validate: { min: 1, max: 50 }
      },
      task_max_attachment_size_mb: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        validate: { min: 1, max: 50 }
      },
      task_overdue_reminder_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 24,
        validate: { min: 1, max: 168 }
      },
      task_notify_email_on_assignment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      task_notify_email_on_reopen: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      task_notify_email_on_overdue: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      task_notify_email_on_submission: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      task_notify_email_on_completion: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      task_comment_rate_limit_hourly: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
        validate: { min: 5, max: 100 }
      }
    },
    {
      tableName: 'task_settings',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  )

  TaskSetting.associate = (models) => {
    TaskSetting.belongsTo(models.Organization, {
      foreignKey: 'org_id',
      as: 'organization'
    })
  }

  return TaskSetting
}
```

---

### 6.3 Repository: `task_settings.repository.js`

```javascript
'use strict'

const db = require('../../../infrastructure/postgres-sql/models.index')

class TaskSettingsRepository {
  async findByOrgId(orgId, { transaction } = {}) {
    return db.TaskSetting.findOne({
      where: { org_id: orgId },
      transaction
    })
  }

  async createDefault(orgId, { transaction } = {}) {
    return db.TaskSetting.create(
      { org_id: orgId },
      { transaction }
    )
  }

  async getOrCreate(orgId, { transaction } = {}) {
    const existing = await this.findByOrgId(orgId, { transaction })
    if (existing) return existing
    try {
      return await this.createDefault(orgId, { transaction })
    } catch (err) {
      // Concurrency safety: if created concurrently, return existing
      if (err.name === 'SequelizeUniqueConstraintError') {
        return this.findByOrgId(orgId, { transaction })
      }
      throw err
    }
  }

  async updateByOrgId(orgId, patch, { transaction } = {}) {
    await db.TaskSetting.update(patch, {
      where: { org_id: orgId },
      transaction
    })
    return this.findByOrgId(orgId, { transaction })
  }
}

module.exports = new TaskSettingsRepository()
```

---

## 7. Settings Catalog Integration & Drift Guard

### 7.1 Settings Registry Entries (#115–#123)

Continuing from entry #114 (Attendance Shift Templates) in `public/md_settings/org_settings_registry.md`:

| # | Setting Key | Data Type | Default | Risk | Purpose & Impact |
|:---:|---|:---:|:---:|:---:|---|
| **115** | `task_max_attachments_per_task` | Integer | `20` | `low` | Caps the total number of active attachments permitted across a single task's lifecycle. |
| **116** | `task_max_attachment_size_mb` | Integer (MB) | `10` | `low` | Enforces the maximum permissible file size for presigned S3 upload requests. |
| **117** | `task_overdue_reminder_hours` | Integer (Hrs) | `24` | `low` | Determines the minimum cooldown window before generating recurring overdue notifications. |
| **118** | `task_notify_email_on_assignment` | Boolean | `true` | `low` | Master toggle controlling email alerts to assignees upon new task delegation. |
| **119** | `task_notify_email_on_reopen` | Boolean | `true` | `low` | Master toggle controlling email alerts to assignees when rework is requested. |
| **120** | `task_notify_email_on_overdue` | Boolean | `true` | `low` | Master toggle controlling email alerts when an active task crosses its UTC due date. |
| **121** | `task_notify_email_on_submission` | Boolean | `true` | `low` | Master toggle controlling email alerts to assigners upon deliverable submission. |
| **122** | `task_notify_email_on_completion` | Boolean | `true` | `low` | Master toggle controlling email alerts to assignees when a task is approved/completed. |
| **123** | `task_comment_rate_limit_hourly` | Integer | `30` | `low` | Sliding window capacity capping comments per user per task per hour. |

---

### 7.2 Group Registration: `src/modules/settings/catalog/groups.js`

Add the `tasks.governance` group to `GROUPS` in `src/modules/settings/catalog/groups.js`:

```javascript
  // ---- task_settings (1 group) ----
  {
    key: 'tasks.governance',
    label: 'Task Assignment',
    module_key: 'task',
    store: 'task_settings',
    featureKey: 'tasks.access',
    read_roles: HR_MANAGER_READ,
    write_roles: HR_WRITE,
    order: 270
  }
```

---

### 7.3 Catalog Definition: `src/modules/settings/catalog/task.catalog.js`

```javascript
'use strict'

const defineEntry = require('./define_entry')

module.exports = [
  defineEntry({
    key: 'task_max_attachments_per_task',
    registry_ref: 114,
    group_key: 'tasks.governance',
    label: 'Maximum attachments per task',
    description: 'Total active attachments permitted across a single task lifetime.',
    unit: 'files',
    data_type: 'INTEGER',
    default: 20,
    nullable: false,
    effect_timing: 'immediate',
    risk: 'low',
    range: { min: 1, max: 50 }
  }),
  defineEntry({
    key: 'task_max_attachment_size_mb',
    registry_ref: 115,
    group_key: 'tasks.governance',
    label: 'Maximum attachment file size',
    description: 'Upper boundary for individual attachment uploads in megabytes.',
    unit: 'MB',
    data_type: 'INTEGER',
    default: 10,
    nullable: false,
    effect_timing: 'immediate',
    risk: 'low',
    range: { min: 1, max: 50 }
  }),
  defineEntry({
    key: 'task_overdue_reminder_hours',
    registry_ref: 116,
    group_key: 'tasks.governance',
    label: 'Overdue reminder interval',
    description: 'Minimum interval in hours between recurring overdue notification reminders.',
    unit: 'hours',
    data_type: 'INTEGER',
    default: 24,
    nullable: false,
    effect_timing: 'next_cron_pass',
    risk: 'low',
    range: { min: 1, max: 168 }
  }),
  defineEntry({
    key: 'task_notify_email_on_assignment',
    registry_ref: 117,
    group_key: 'tasks.governance',
    label: 'Notify on assignment',
    description: 'Send email notification to assignee when a task is delegated.',
    data_type: 'BOOLEAN',
    default: true,
    nullable: false,
    effect_timing: 'next_record',
    risk: 'low'
  }),
  defineEntry({
    key: 'task_notify_email_on_reopen',
    registry_ref: 118,
    group_key: 'tasks.governance',
    label: 'Notify on rework request',
    description: 'Send email notification to assignee when a deliverable is rejected.',
    data_type: 'BOOLEAN',
    default: true,
    nullable: false,
    effect_timing: 'next_record',
    risk: 'low'
  }),
  defineEntry({
    key: 'task_notify_email_on_overdue',
    registry_ref: 119,
    group_key: 'tasks.governance',
    label: 'Notify on overdue',
    description: 'Send email alert to assignee and assigner when task deadline elapses.',
    data_type: 'BOOLEAN',
    default: true,
    nullable: false,
    effect_timing: 'next_cron_pass',
    risk: 'low'
  }),
  defineEntry({
    key: 'task_notify_email_on_submission',
    registry_ref: 120,
    group_key: 'tasks.governance',
    label: 'Notify on submission',
    description: 'Send email notification to assigner when deliverable is submitted for review.',
    data_type: 'BOOLEAN',
    default: true,
    nullable: false,
    effect_timing: 'next_record',
    risk: 'low'
  }),
  defineEntry({
    key: 'task_notify_email_on_completion',
    registry_ref: 121,
    group_key: 'tasks.governance',
    label: 'Notify on completion',
    description: 'Send email notification to assignee when deliverable is approved.',
    data_type: 'BOOLEAN',
    default: true,
    nullable: false,
    effect_timing: 'next_record',
    risk: 'low'
  }),
  defineEntry({
    key: 'task_comment_rate_limit_hourly',
    registry_ref: 122,
    group_key: 'tasks.governance',
    label: 'Discussion hourly rate limit',
    description: 'Maximum comments allowed per user per task within an hourly sliding window.',
    unit: 'comments/hr',
    data_type: 'INTEGER',
    default: 30,
    nullable: false,
    effect_timing: 'immediate',
    risk: 'low',
    range: { min: 5, max: 100 }
  })
]
```

---

### 7.4 Settings Adapter: `src/modules/settings/adapters/task_settings.adapter.js`

Satisfies **Settings Invariant 9** (store bijection) and **Invariant 11** (nonSettingKeys disjointness):

```javascript
'use strict'

const taskSettingsService = require('../../task/services/task_settings.service')
const taskSettingsValidator = require('../../task/validators/task_settings.validator')
const { groupsForStore, catalogKeysForStore, pick } = require('./adapter_helpers')

const STORE = 'task_settings'

module.exports = Object.freeze({
  store: STORE,
  groups: groupsForStore(STORE),
  featureKey: 'tasks.access',

  async read(orgId) {
    const row = await taskSettingsService.getOrCreate(orgId)
    const plain = row.get ? row.get({ plain: true }) : row
    return {
      values: pick(plain, catalogKeysForStore(STORE)),
      updatedAt: plain.updated_at
    }
  },

  async update(orgId, patch, actor = {}, { ifMatch = null } = {}) {
    const row = await taskSettingsService.update(orgId, patch, {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      ipAddress: actor.ipAddress,
      requestId: actor.requestId,
      ifMatch
    })
    const plain = row.get ? row.get({ plain: true }) : row
    return {
      values: pick(plain, catalogKeysForStore(STORE)),
      updatedAt: plain.updated_at
    }
  },

  ownerWritableKeys() {
    return [...taskSettingsService.MUTABLE_FIELDS]
  },
  ownerSchema: taskSettingsValidator.updateSettingsSchema,
  nonSettingKeys: Object.freeze([]),

  concurrencyField: 'updated_at',
  auditSource: Object.freeze({ table: 'task_audit_logs', entityType: 'task_settings' })
})
```

Register `task_settings.adapter.js` in `ADAPTERS` in `src/modules/settings/adapters/index.js`.

---

## 8. Asynchronous Outbox Notification Engine

### 8.1 Service Specification: `task_notification.service.js`

```javascript
'use strict'

const db = require('../../../infrastructure/postgres-sql/models.index')
const taskNotificationRepo = require('../repositories/task_notification.repository')
const taskRepo = require('../repositories/task.repository')
const taskSettingsService = require('./task_settings.service')
const emailUtils = require('../../../common/utilities/email.utils')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

class TaskNotificationService {
  /**
   * Enqueues an outbox record inside the caller's active Sequelize transaction.
   * Enforces D-T10 deduplication key.
   */
  async enqueueNotification(orgId, taskId, recipientId, eventType, dedupeKey, payload, { transaction } = {}) {
    return taskNotificationRepo.enqueue({
      org_id: orgId,
      task_id: taskId,
      recipient_id: recipientId,
      event_type: eventType,
      dedupe_key: dedupeKey,
      status: 'pending',
      payload: payload || {},
      attempts: 0,
      next_retry_at: new Date()
    }, { transaction })
  }

  /**
   * Drains a batch of ready notifications from the outbox (CLAIM → GATING → SEND → RECORD).
   * Scheduled every 60s via task_notification_dispatch.cron.js.
   */
  async runNotificationDispatch({ batchSize = 50, orgId = null } = {}) {
    const summary = { claimed: 0, sent: 0, skipped: 0, failed: 0, errors: [] }

    // Step 1: Claim batch using row-level SKIP LOCKED
    const claimedRows = await taskNotificationRepo.claimPendingBatches(batchSize)
    if (!claimedRows || claimedRows.length === 0) {
      return summary
    }
    summary.claimed = claimedRows.length

    // Step 2: Process each claimed notification independently
    for (const notification of claimedRows) {
      try {
        await this._dispatchSingleNotification(notification)
        summary.sent++
      } catch (err) {
        summary.failed++
        summary.errors.push({ id: notification.id, error: err.message })
      }
    }

    return summary
  }

  /**
   * Dispatches an individual notification with exponential backoff and settings gating.
   */
  async _dispatchSingleNotification(notification) {
    const { id, org_id, recipient_id, event_type, payload, attempts } = notification

    try {
      // 1. Resolve organization notification toggles
      const settings = await taskSettingsService.getSettings(org_id)
      const isEnabled = this._isNotificationEnabled(event_type, settings)

      if (!isEnabled) {
        // Gated off by tenant policy: Mark sent to prevent queue clog
        await taskNotificationRepo.markSent(id)
        return
      }

      // 2. Hydrate recipient user
      const recipient = await db.User.findOne({
        where: { id: recipient_id, org_id },
        include: [{ model: db.UserProfile, as: 'profile', attributes: ['first_name', 'last_name'] }]
      })

      if (!recipient || !recipient.identifier) {
        throw new Error(`Recipient ${recipient_id} not found or has no email identifier`)
      }

      const recipientName = recipient.profile
        ? [recipient.profile.first_name, recipient.profile.last_name].filter(Boolean).join(' ')
        : recipient.identifier

      // 3. Assemble email payload
      const emailData = {
        RECIPIENT_NAME: recipientName,
        TASK_TITLE: payload.task_title || 'Untitled Task',
        ASSIGNER_NAME: payload.assigner_name || 'System Administrator',
        DUE_DATE: payload.due_date ? dayjs(payload.due_date).format('YYYY-MM-DD HH:mm UTC') : 'Not specified',
        PRIORITY: (payload.priority || 'medium').toUpperCase(),
        STATUS: (payload.status || 'pending').toUpperCase(),
        REASON: payload.reason || payload.reopen_reason || payload.cancellation_reason || '',
        ACTION_URL: payload.task_id
          ? `https://app.hrclouds.in/tasks/${payload.task_id}`
          : 'https://app.hrclouds.in/tasks',
        COMMENT_MESSAGE: payload.comment_message || ''
      }

      // 4. Dispatch via AWS SES
      await emailUtils.sendTemplatedEmail({
        to: recipient.identifier,
        event: event_type.toLowerCase(),
        data: emailData
      })

      // 5. Mark as sent on success
      await taskNotificationRepo.markSent(id)
    } catch (dispatchError) {
      // 6. Record failure and compute exponential backoff: 2^attempts * 1 minute
      const nextAttempt = attempts + 1
      const backoffMinutes = Math.pow(2, nextAttempt)
      const nextRetryAt = dayjs().add(backoffMinutes, 'minute').toDate()

      await taskNotificationRepo.recordFailure(id, nextAttempt, dispatchError.message, nextRetryAt)
      throw dispatchError
    }
  }

  /**
   * Evaluates organization notification toggles for a given event type.
   */
  _isNotificationEnabled(eventType, settings) {
    if (!settings) return true
    switch (eventType) {
      case 'TASK_ASSIGNED':
        return settings.task_notify_email_on_assignment !== false
      case 'TASK_SUBMITTED':
        return settings.task_notify_email_on_submission !== false
      case 'TASK_REOPENED':
        return settings.task_notify_email_on_reopen !== false
      case 'TASK_COMPLETED':
        return settings.task_notify_email_on_completion !== false
      case 'TASK_OVERDUE':
        return settings.task_notify_email_on_overdue !== false
      default:
        return true
    }
  }

  /**
   * Sweeper: Scans active past-due tasks and enqueues overdue alerts.
   * Runs hourly via task_overdue_sweeper.cron.js.
   */
  async runOverdueSweeper({ limit = 100 } = {}) {
    const summary = { scanned: 0, enqueued: 0, errors: [] }

    try {
      const overdueTasks = await taskRepo.findOverdueSweepCandidates({ limit })
      summary.scanned = overdueTasks.length

      const todayWatermark = dayjs.utc().format('YYYY-MM-DD')

      for (const task of overdueTasks) {
        try {
          // Enqueue assignee notice with 24h deduplication key
          const assigneeDedupeKey = `task_overdue:assignee:${task.id}:${task.assignee_id}:${todayWatermark}`
          await this.enqueueNotification(
            task.org_id,
            task.id,
            task.assignee_id,
            'TASK_OVERDUE',
            assigneeDedupeKey,
            {
              task_id: task.id,
              task_title: task.title,
              due_date: task.due_date,
              priority: task.priority,
              status: task.status,
              recipient_type: 'assignee'
            }
          )
          summary.enqueued++

          // Enqueue assigner notice with 24h deduplication key
          if (task.assigner_id) {
            const assignerDedupeKey = `task_overdue:assigner:${task.id}:${task.assigner_id}:${todayWatermark}`
            await this.enqueueNotification(
              task.org_id,
              task.id,
              task.assigner_id,
              'TASK_OVERDUE',
              assignerDedupeKey,
              {
                task_id: task.id,
                task_title: task.title,
                due_date: task.due_date,
                priority: task.priority,
                status: task.status,
                recipient_type: 'assigner'
              }
            )
            summary.enqueued++
          }
        } catch (enqueueErr) {
          // Unique index collision means already enqueued today for this task: ignore cleanly
          if (!enqueueErr.name || enqueueErr.name !== 'SequelizeUniqueConstraintError') {
            summary.errors.push({ taskId: task.id, error: enqueueErr.message })
          }
        }
      }
    } catch (err) {
      summary.errors.push({ error: err.message })
    }

    return summary
  }

  /**
   * Startup Recovery: Recovers orphaned 'processing' tasks after node crashes.
   */
  async runStartupCatchUp() {
    console.log('[Startup] TaskNotificationService: Running catch-up scan...')
    const [recoveredCount] = await db.sequelize.query(`
      UPDATE task_notifications
      SET status = 'pending', next_retry_at = CURRENT_TIMESTAMP
      WHERE status = 'processing' AND updated_at < (CURRENT_TIMESTAMP - INTERVAL '10 minutes');
    `)
    if (recoveredCount > 0) {
      console.log(`[Startup] TaskNotificationService: Reset ${recoveredCount} orphaned processing notifications to pending.`)
    }
    // Run an initial drain pass
    await this.runNotificationDispatch({ batchSize: 50 })
  }
}

module.exports = new TaskNotificationService()
```

---

## 9. Email Templates & Transport Registration

### 9.1 HTML Template: `src/common/templates/task_notification.html`

A responsive, high-aesthetic HTML email template matching HRClouds platform styling:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Notification</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 28px 32px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; border-radius: 9999px; margin-top: 8px; }
    .badge-urgent { background: #fee2e2; color: #991b1b; }
    .badge-high { background: #ffedd5; color: #9a3412; }
    .badge-medium { background: #e0f2fe; color: #075985; }
    .badge-low { background: #f1f5f9; color: #475569; }
    .content { padding: 32px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    .row:last-child { margin-bottom: 0; }
    .label { color: #64748b; font-weight: 500; }
    .val { font-weight: 600; color: #0f172a; }
    .reason-box { background: #fff1f2; border-left: 4px solid #e11d48; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #881337; }
    .cta-btn { display: block; width: fit-content; margin: 28px auto 0; padding: 12px 32px; background: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; text-align: center; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HRClouds Task Notification</h1>
      <span class="badge badge-{{PRIORITY}}">{{PRIORITY}} Priority</span>
    </div>
    <div class="content">
      <p>Hello <strong>{{RECIPIENT_NAME}}</strong>,</p>
      <p>There is an update regarding a task assigned to you or under your supervision:</p>
      <div class="card">
        <div class="row"><span class="label">Task Title</span><span class="val">{{TASK_TITLE}}</span></div>
        <div class="row"><span class="label">Assigner</span><span class="val">{{ASSIGNER_NAME}}</span></div>
        <div class="row"><span class="label">Deadline</span><span class="val">{{DUE_DATE}}</span></div>
        <div class="row"><span class="label">Current Status</span><span class="val">{{STATUS}}</span></div>
      </div>
      {{#if REASON}}
      <div class="reason-box"><strong>Note / Feedback:</strong> {{REASON}}</div>
      {{/if}}
      {{#if COMMENT_MESSAGE}}
      <div class="reason-box" style="background:#f0fdf4; border-left-color:#16a34a; color:#14532d;">
        <strong>New Comment:</strong> "{{COMMENT_MESSAGE}}"
      </div>
      {{/if}}
      <a href="{{ACTION_URL}}" class="cta-btn">View Task in HRClouds</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from HRClouds Task Assignment Subsystem.</p>
    </div>
  </div>
</body>
</html>
```

---

### 9.2 Transport Registration: `src/common/utilities/email.utils.js`

Append all 9 task notification event entries into `TEMPLATE_MAP`:

```javascript
  // Task Assignment Module Phase 5 (REQ-9, D-T10, §10)
  task_assigned: {
    file: 'task_notification.html',
    subject: 'New task assigned: {{TASK_TITLE}}'
  },
  task_submitted: {
    file: 'task_notification.html',
    subject: 'Task deliverable submitted for review: {{TASK_TITLE}}'
  },
  task_reopened: {
    file: 'task_notification.html',
    subject: 'Revisions requested on task: {{TASK_TITLE}}'
  },
  task_completed: {
    file: 'task_notification.html',
    subject: 'Task deliverable approved: {{TASK_TITLE}}'
  },
  task_reassigned: {
    file: 'task_notification.html',
    subject: 'Task reassigned to you: {{TASK_TITLE}}'
  },
  task_cancelled: {
    file: 'task_notification.html',
    subject: 'Task cancelled: {{TASK_TITLE}}'
  },
  task_due_date_extended: {
    file: 'task_notification.html',
    subject: 'Deadline extended on task: {{TASK_TITLE}}'
  },
  task_comment_added: {
    file: 'task_notification.html',
    subject: 'New comment on task: {{TASK_TITLE}}'
  },
  task_overdue: {
    file: 'task_notification.html',
    subject: 'URGENT: Task deadline has passed: {{TASK_TITLE}}'
  }
```

---

## 10. Scheduled Cron Workers & Server Bootstrap

### 10.1 Outbox Drain Worker: `src/cron-jobs/task_notification_dispatch.cron.js`

```javascript
const cron = require('node-cron')
const taskNotificationService = require('../modules/task/services/task_notification.service')

let isDrainRunning = false

// Runs every 60 seconds (Linux production).
// Claims bounded batches (LIMIT 50) using row-level SKIP LOCKED.
cron.schedule('* * * * *', async () => {
  if (isDrainRunning) {
    return // Prevent overlapping execution if previous pass is active
  }
  isDrainRunning = true
  try {
    const summary = await taskNotificationService.runNotificationDispatch({ batchSize: 50 })
    if (summary.claimed > 0 || summary.failed > 0) {
      console.log(`[Cron] task_notification_dispatch: claimed=${summary.claimed} sent=${summary.sent} failed=${summary.failed} errors=${summary.errors.length}`)
    }
  } catch (error) {
    console.error('[Cron] Error executing task notification dispatch:', error)
  } finally {
    isDrainRunning = false
  }
}, {
  timezone: 'Asia/Kolkata'
})

console.log('[Cron] Registered task_notification_dispatch.cron.js (every 60 sec IST)')
```

---

### 10.2 Overdue Sweeper Cron: `src/cron-jobs/task_overdue_sweeper.cron.js`

```javascript
const cron = require('node-cron')
const taskNotificationService = require('../modules/task/services/task_notification.service')

let isSweeperRunning = false

// Runs every hour at minute 0 (Linux production).
// Scans active past-due tasks and enqueues TASK_OVERDUE alerts with 24h dedupe keys.
cron.schedule('0 * * * *', async () => {
  if (isSweeperRunning) {
    return
  }
  isSweeperRunning = true
  try {
    const summary = await taskNotificationService.runOverdueSweeper({ limit: 100 })
    if (summary.scanned > 0 || summary.enqueued > 0) {
      console.log(`[Cron] task_overdue_sweeper: scanned=${summary.scanned} enqueued=${summary.enqueued} errors=${summary.errors.length}`)
    }
  } catch (error) {
    console.error('[Cron] Error executing task overdue sweeper:', error)
  } finally {
    isSweeperRunning = false
  }
}, {
  timezone: 'Asia/Kolkata'
})

console.log('[Cron] Registered task_overdue_sweeper.cron.js (every hour IST)')
```

---

### 10.3 Server Registration: `src/server.js`

In `src/server.js:29-53`, inside `if (os.platform() === 'linux' && cronJobsEnabled)`:

```javascript
  require('./cron-jobs/task_notification_dispatch.cron') // Task Phase 5: outbox drain (every 60 sec IST)
  require('./cron-jobs/task_overdue_sweeper.cron')       // Task Phase 5: hourly overdue task scanner (hourly IST)
```

In `src/server.js:59-75`, inside `setTimeout(..., 30000)`:

```javascript
    const taskNotificationService = require('./modules/task/services/task_notification.service')
    taskNotificationService.runStartupCatchUp().catch(err =>
      console.error('[Startup] Task notification catch-up error:', err))
```

---

## 11. Comprehensive Edge Case & Defensive Engineering Register

| # | Edge Case / Production Failure Scenario | Architectural Defense & Mitigation Strategy |
|---|---|---|
| **EC-T23** | **Mail Transport Outage (AWS SES Transient Downtime)** | Worker catches SES transport error, increments `attempts`, writes `last_error = err.message`, computes exponential retry timestamp ($2^{\text{attempts}}\text{ minutes}$), and keeps status `processing`. Other notifications in the batch continue processing without aborting the tick. |
| **EC-T24** | **Poison Notification (Permanent 500 / Dead Recipient)** | If an email fails 5 consecutive times, status transitions permanently to `failed`. The row will no longer be claimed by `claimPendingBatches` (`attempts < max_attempts`), preventing infinite retry loops from clogging the queue. |
| **EC-T25** | **Concurrent Outbox Workers Contention** | Multiple node processes execute the 60-second cron simultaneously. Repository executes `lock: transaction.LOCK.UPDATE, skipLocked: true`. Process A locks rows 1–50; Process B immediately skips rows 1–50 and claims rows 51–100 without blocking or deadlocking. |
| **EC-T26** | **24-Hour Overdue Notification Spamming** | Overdue sweeper runs every hour. To prevent spamming employees 24 times a day, deduplication key is formulated as `task_overdue:{recipientType}:{taskId}:{recipientId}:{YYYY-MM-DD}`. Because `(org_id, dedupe_key)` has a unique index, subsequent hourly runs within the same UTC calendar day fail cleanly with `SequelizeUniqueConstraintError` and are swallowed. |
| **EC-T27** | **Worker Crash During Batch Processing** | If the node process crashes while notifications are in `processing` status, `taskNotificationService.runStartupCatchUp()` runs on boot after 30s, scanning `WHERE status = 'processing' AND updated_at < NOW() - 10 minutes`, resetting them to `pending` with `next_retry_at = NOW()`. |
| **EC-T28** | **Settings Gating without Queue Clogging** | If an org admin disables `task_notify_email_on_assignment = false`, the outbox row is NOT discarded or left in `pending`. The worker marks it `sent` immediately, advancing the queue cleanly while preserving email silence. |
| **EC-T29** | **Settings Catalog Drift (T-S2 CI Violation)** | If an engineer changes a setting range or type in `task_settings.model.js` without updating `task.catalog.js` and `org_settings_registry.md`, the Settings Parity test suite crashes the CI build before deployment. |
| **EC-T30** | **Recipient Deleted / Inactivated Mid-Queue** | If a user is deactivated while an outbox notification is pending, `recipient` query returns null. Worker marks failure `Recipient not found or deactivated` and exhausts attempts without throwing unhandled exceptions. |

---

## 12. Phased Implementation Sequence

To ensure zero downtime, strict transactional integrity, and passing tests at every step, implementation must proceed in the following ordered sequence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      PHASE 5 IMPLEMENTATION SEQUENCE                   │
├────────────────────────────────────────────────────────────────────────┤
│  STEP 1: Database Migration & Model Scaffold                           │
│  • Create migration 00076-create-task-settings.js                      │
│  • Create model task_settings.model.js & repository                    │
│  • Run npx sequelize-cli db:migrate                                    │
│                                                                        │
│  STEP 2: Settings Catalog & Adapter Wire                               │
│  • Register group tasks.governance in groups.js                        │
│  • Create task.catalog.js (entries #114–#122)                          │
│  • Create task_settings.adapter.js & wire in adapters/index.js         │
│  • Verify Settings Parity test passes: npm test settings               │
│                                                                        │
│  STEP 3: Email Templates & Transports                                 │
│  • Author src/common/templates/task_notification.html                  │
│  • Register all 9 task event types in email.utils.js TEMPLATE_MAP      │
│                                                                        │
│  STEP 4: Outbox Service & Sweeper Engine                               │
│  • Author src/modules/task/services/task_notification.service.js       │
│  • Add findOverdueSweepCandidates to task.repository.js                │
│  • Hook TASK_COMMENT_ADDED in task_comment.service.js                  │
│                                                                        │
│  STEP 5: Cron Workers & Server Bootstrap                               │
│  • Create task_notification_dispatch.cron.js (every 60s)               │
│  • Create task_overdue_sweeper.cron.js (hourly)                        │
│  • Register crons & 30s catch-up hook in src/server.js                 │
│                                                                        │
│  STEP 6: Automated Test Verification & Documentation                   │
│  • Author tests/unit/task/task_phase5_notifications_and_crons.test.js  │
│  • Execute full module test suite: 100% green verification             │
│  • Create dated change record in public/md_updates/                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Automated Testing & Verification Strategy

### 13.1 Test Suite Specification: `task_phase5_notifications_and_crons.test.js`

Author using Node.js native test runner (`node:test` and `node:assert`):

```javascript
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
```

### 13.2 Key Test Scenarios Matrix

| Scenario Group | Specific Test Case | Expected Assertion |
|---|---|---|
| **Outbox Claiming** | Claim pending rows with `SKIP LOCKED` | Returns batch of $\le 50$ rows; excludes rows with `next_retry_at > NOW()`. |
| **Outbox Drain** | Dispatch valid `TASK_ASSIGNED` row | Calls `sendTemplatedEmail`; transitions status `pending` → `sent`; populates `sent_at`. |
| **Exponential Backoff** | Simulate AWS SES transport failure | Increments `attempts: 1`; sets `last_error`; schedules `next_retry_at` to $2^1 = 2$ minutes in future. |
| **Max Retry Exhaustion** | Notification fails on 5th attempt | Transitions status from `processing` to `failed`; logs poison warning. |
| **Deduplication** | Insert identical `(org_id, dedupe_key)` | Database rejects with `SequelizeUniqueConstraintError`. |
| **Overdue Sweeping** | Task past due date scanned by sweeper | Enqueues `TASK_OVERDUE` with key `task_overdue:assignee:{taskId}:{userId}:{date}`. |
| **24h Overdue Silence** | Sweeper runs twice on same calendar day | Second run attempts enqueue, catches unique constraint, and ignores duplicate alert. |
| **Settings Gating** | Org sets `task_notify_email_on_assignment = false` | Outbox row is marked `sent` without calling `sendTemplatedEmail`. |
| **Catalog Parity** | Settings loader boots with `task.catalog.js` | Invariants 1–11 pass; `task_settings.adapter.js` matches catalog bijection. |
| **Startup Catch-Up** | Run catch-up with stale `processing` row | Row updated back to `pending` with `next_retry_at = CURRENT_TIMESTAMP`. |

---

## 14. Production Readiness Checklist & Acceptance Criteria

Before certifying Task Assignment Module Phase 5 as complete, verify:

- [ ] **Migration 00076 Applied:** Table `task_settings` created with check constraints and unique `org_id` index.
- [ ] **Zero Model Registration Errors:** `models.index.js` boots with `TaskSetting` registered cleanly.
- [ ] **Settings Catalog Parity:** Invariant 9 and Invariant 11 pass at boot time without throwing exceptions.
- [ ] **Outbox Drain Concurrency:** Row-level `SKIP LOCKED` verified under concurrent execution.
- [ ] **SES Email Registration:** All 9 task event types in `TEMPLATE_MAP` render valid HTML without missing placeholders.
- [ ] **Overdue Deduplication:** Overdue sweeper enforces 24-hour calendar watermark deduplication keys.
- [ ] **Server Bootstrap:** Crons registered under `os.platform() === 'linux'` guard; 30-second catch-up hook wired.
- [ ] **Unit Tests Passing:** `node --test tests/unit/task/task_phase5_notifications_and_crons.test.js` passes with 100% green assertions.
- [ ] **Full Regression Suite Green:** `node --test tests/unit/task/*.test.js` passes without a single failure across Phases 1–5.
- [ ] **Frontend Changelog Created:** Dated record in `public/md_updates/` documenting Phase 5 settings and background capabilities.

**Approved for Development:**  
*Senior/Principal Backend Engineer & System Architect*  
*October 14, 2026*
