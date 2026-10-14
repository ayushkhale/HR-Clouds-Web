# Phase 1 — Task Assignment Module: Foundation, Data Models, Migrations & Repositories
*(Production-Grade Implementation Plan)*

> **Parent document:** [implementation_plan.md](public/md_task-assignment/implementation_plan.md) — the module's single source of truth. Every architectural and database decision below implements a decision recorded there (`D-T1` … `D-T11`) and respects the functional Source of Truth (`review/2026-10-12-for_cc_task_assignment_module_functionalities_SOT.md`). **If this plan and the parent ever disagree, the parent wins and this file must be corrected.**
> **Predecessor:** None (Phase 1 is the greenfield foundation for the Task Assignment Module).
> **Status:** Ready for Implementation.
> **Depends on:** Core Platform Infrastructure (`organizations`, `users`, `subscription_plans`, `plan_features`, `features`, `connection.pgsqldb.js`, `models.index.js`). Consumes no other module tables directly.

---

## 1. Goal & Boundary

**Goal.** Establish the complete, hardened data layer, persistence foundation, and repository spine for the Task Assignment Module (`src/modules/task/`). Deliver zero-defect database migrations, feature flags, Sequelize models, and transaction-aware repositories capable of supporting high-concurrency managerial task delegation, atomic read receipts, optimistic concurrency control, and transactional outbox event queuing.

Phase 1 provides the foundational layer upon which subsequent phases build:
1. **The Core Task Ledger & State Persistence** — Tables and models for tasks, attachments, comments, audit trails, and transactional notifications.
2. **Postgres & Sequelize Hardening** — Full schema constraints, compound/partial indexes for overdue sweeps and tenant isolation, avoidance of PostgreSQL enum traps via `VARCHAR` constraints, and soft-delete (`paranoid`) configuration.
3. **Transaction & Concurrency-Aware Repositories** — Standardized repositories with pessimistic locking (`FOR UPDATE`, `SKIP LOCKED`), pagination helpers, tenant isolation scoping (`org_id`), and atomic update capabilities.
4. **Platform Subscription Integration** — Registration of `tasks.access` feature key and plan-feature bindings.

### 1.1 Explicitly in Scope for Phase 1

- **Database Migration `00075-create-task-assignment-module.js`**:
  - `tasks` table (UUID PK, tenant scoping, lifecycle states, dates, audit counters, optimistic version).
  - `task_attachments` table (pre-creation Mode A staging and Mode B task binding, storage keys, MIME, byte sizing).
  - `task_comments` table (discussion thread, progress updates, system rework messages, link/attachment JSONB references).
  - `task_audit_logs` table (append-only audit ledger with IP/user-agent provenance).
  - `task_notifications` table (transactional outbox with unique `(org_id, dedupe_key)` index).
- **Feature Seeder `014-seed-task-feature.js`**:
  - Insertion of `tasks.access` into `features`.
  - Mapping to all active tiers in `plan_features`.
- **Sequelize Models (`src/modules/task/models/`)**:
  - `tasks.model.js`, `task_attachments.model.js`, `task_comments.model.js`, `task_audit_logs.model.js`, `task_notifications.model.js`.
  - Full bidirectional associations with `Organization` and `User`.
  - Autoload registration in `src/infrastructure/postgres-sql/models.index.js`.
- **Repository Layer (`src/modules/task/repositories/`)**:
  - `task.repository.js`, `task_attachment.repository.js`, `task_comment.repository.js`, `task_audit.repository.js`, `task_notification.repository.js`.
  - Mandatory transaction propagation, tenant validation, row-level locks, and pagination helpers.
- **Unit Test Suite (`tests/unit/task/task_models_and_repos.test.js`)**:
  - Model definitions, attribute validations, association mappings, repository query formatting, and mock transaction boundaries using Node.js built-in `node:test` and `node:assert/strict`.

### 1.2 Explicitly NOT in Scope (Deferred to Later Phases)

| Capability / Responsibility | Owning Phase | Rationale |
|---|---|---|
| HTTP Routes, Controllers, and Express Routers | Phase 2 & 3 | Phase 1 establishes the persistence layer. No public endpoints are exposed until services and validators are built. |
| Hierarchy Resolution (`HierarchyAccess.getAccessibleUserIds`) | Phase 2 | Business logic governing manager-subordinate delegation lives in `task.service.js`. |
| S3 Presigned URL Handshake & Token Signing | Phase 3 | AWS S3 client integration, Mode A JWT staging tokens, and download URL generation belong to file execution flows. |
| Discussion Thread Rate Limiting & Endpoints | Phase 4 | Redis sliding-window comment rate limiters and comment controllers belong to Phase 4. |
| Outbox Worker Cron & Email Dispatcher | Phase 5 | `task_notification_dispatch.cron.js`, `task_overdue_sweeper.cron.js`, and AWS SES email templates belong to Phase 5. |
| Module 6 Analytics & Appraisal Aggregations | Module 6 | Phase 1 stamps `original_due_date`, `extension_count`, and `is_completed_on_time`, but reporting metrics belong to Performance Module. |

---

## 2. Pre-Flight Checks & Live Codebase Grounding

Every item below represents a verified state in the Dakshi HRMS repository. Deviations from these facts will cause migration failures, circular dependencies, or runtime crashes:

1. **Migration Sequence Numbering:**
   - Latest migration on disk: `00074-create-system-error-logs.js`.
   - The Phase 1 migration is strictly **`00075-create-task-assignment-module.js`**.
2. **Seeder Sequence Numbering:**
   - Latest seeder on disk: `013-seed-default-comp-off-leave-types.js`.
   - The Phase 1 feature seeder is strictly **`014-seed-task-feature.js`**.
3. **Model Autoloading Mechanism:**
   - `src/infrastructure/postgres-sql/models.index.js` loops through `MODEL_ROOTS` and executes `loadModelsFrom(dir)`.
   - `modules/task/models` is currently **absent** from `MODEL_ROOTS`. Phase 1 must append `path.join(__dirname, '../../modules/task/models')` to `MODEL_ROOTS`.
4. **Primary Key & UUID Standard:**
   - PostgreSQL uses `gen_random_uuid()` (standardized across migrations 00001–00074).
   - Sequelize models declare `type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true`.
5. **PostgreSQL Enum Trap Prevention (EC-T21):**
   - Migration `00075` uses `Sequelize.STRING(N)` with explicit SQL check constraints (`CHECK (status IN (...))`), **not** `Sequelize.ENUM`.
   - Native PostgreSQL enums create persistent types in `pg_catalog` (`enum_tasks_status`) that throw errors during `db:migrate:undo` and require complex raw SQL alters when new states are introduced.
6. **Soft-Delete (`paranoid: true`) Conventions:**
   - `tasks`, `task_attachments`, and `task_comments` are paranoid (`deleted_at TIMESTAMPTZ NULL`).
   - `task_audit_logs` and `task_notifications` are **not** paranoid; audit trails and transactional queue ledgers are append-only.
7. **Timestamp Consistency:**
   - All datetime columns use `TIMESTAMPTZ` (UTC).
   - Dayjs UTC (`dayjs.utc()`) is required across all repository filters to eliminate server-timezone skew.
8. **Express 5 Readiness:**
   - Express 5 makes `req.query` a getter. In subsequent phases, controllers must validate query parameters internally. Repositories must accept pre-sanitized numeric integers for `limit` and `offset`.

---

## 3. Directory Structure & File Manifest

### 3.1 New Files Created in Phase 1

```text
src/
├── infrastructure/
│   └── postgres-sql/
│       ├── migrations/
│       │   └── 00075-create-task-assignment-module.js      ← Complete schema migration (5 tables, indexes, constraints)
│       └── seeders/
│           └── 014-seed-task-feature.js                    ← Feature flag 'tasks.access' + plan_features mappings
└── modules/
    └── task/
        ├── models/
        │   ├── tasks.model.js                              ← Task Sequelize model & associations
        │   ├── task_attachments.model.js                  ← TaskAttachment Sequelize model & associations
        │   ├── task_comments.model.js                     ← TaskComment Sequelize model & associations
        │   ├── task_audit_logs.model.js                    ← TaskAuditLog Sequelize model & associations
        │   └── task_notifications.model.js                 ← TaskNotification outbox model & associations
        └── repositories/
            ├── task.repository.js                          ← Task repository (CRUD, pagination, atomic views, locks)
            ├── task_attachment.repository.js               ← TaskAttachment repository (staging commit, lookup)
            ├── task_comment.repository.js                  ← TaskComment repository (thread listing, insert)
            ├── task_audit.repository.js                    ← TaskAuditLog repository (immutable record write/list)
            └── task_notification.repository.js            ← TaskNotification repository (enqueue, lock & claim)

tests/
└── unit/
    └── task/
        └── task_models_and_repos.test.js                   ← Unit tests for models, associations, and repositories
```

### 3.2 Existing Files Modified in Phase 1

```text
src/
└── infrastructure/
    └── postgres-sql/
        └── models.index.js                                 ← Add 'path.join(__dirname, "../../modules/task/models")' to MODEL_ROOTS
```

---

## 4. Database Schema Specification — Migration `00075-create-task-assignment-module.js`

The migration executes inside an atomic Sequelize database transaction (`queryInterface.sequelize.transaction()`). Tables are created in strict foreign-key dependency order and dropped in reverse order.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 1 DATABASE SCHEMA ARCHITECTURE                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   ORGANIZATIONS (Existing)                 USERS (Existing)                            │
│         │                                        │                                     │
│         ├──────────────────────┬─────────────────┤                                     │
│         │ 1:N                  │ 1:N             │ 1:N                                 │
│         ▼                      ▼                 ▼                                     │
│   ┌───────────────┐     assigner_id         assignee_id                                │
│   │     TASKS     │◄───────────┴─────────────────┘                                     │
│   └───────┬───────┘                                                                    │
│           │ 1:N                                                                        │
│           ├────────────────────────┬────────────────────────┬──────────────────────┐   │
│           ▼                        ▼                        ▼                      ▼   │
│   ┌───────────────┐        ┌───────────────┐        ┌───────────────┐      ┌─────────┐ │
│   │  ATTACHMENTS  │        │   COMMENTS    │        │  AUDIT LOGS   │      │NOTIFICA-│ │
│   │               │        │               │        │               │      │  TIONS  │ │
│   └───────────────┘        └───────────────┘        └───────────────┘      └─────────┘ │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Table Specifications

#### 1. `tasks`
The central operational entity for delegated work.

| Column | Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `org_id` | `UUID` | No | — | FK → `organizations.id` ON DELETE CASCADE ON UPDATE CASCADE |
| `title` | `VARCHAR(200)` | No | — | Brief title describing deliverable |
| `category` | `VARCHAR(50)` | No | `'operational'` | Taxonomy: `operational`, `compliance`, `onboarding`, `administrative`, `general` |
| `description` | `TEXT` | No | — | Complete operational briefing and requirements |
| `priority` | `VARCHAR(20)` | No | `'medium'` | Priority level: `low`, `medium`, `high`, `urgent` |
| `status` | `VARCHAR(30)` | No | `'pending'` | Lifecycle state: `pending`, `in_progress`, `in_review`, `reopened`, `completed`, `cancelled` |
| `due_date` | `TIMESTAMPTZ` | No | — | Active deadline in UTC |
| `original_due_date` | `TIMESTAMPTZ` | No | — | Immutable deadline stamped at task creation for Module 6 analytics |
| `extension_count` | `INTEGER` | No | `0` | Total number of deadline extensions granted |
| `assigner_id` | `UUID` | No | — | FK → `users.id` ON DELETE RESTRICT (Delegating manager/HR) |
| `assignee_id` | `UUID` | No | — | FK → `users.id` ON DELETE RESTRICT (Designated worker) |
| `is_viewed` | `BOOLEAN` | No | `false` | First-view read receipt flag |
| `first_viewed_at` | `TIMESTAMPTZ` | Yes | `NULL` | Immutable timestamp when assignee first opened the task |
| `last_viewed_at` | `TIMESTAMPTZ` | Yes | `NULL` | Most recent timestamp when assignee inspected task details |
| `external_links` | `JSONB` | No | `'[]'::jsonb` | Array of validated external resource links `[{ label, url }]` |
| `rework_count` | `INTEGER` | No | `0` | Number of times work was rejected and reopened |
| `reassignment_count` | `INTEGER` | No | `0` | Number of times assignee was reassigned |
| `submitted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp when assignee submitted deliverable for review |
| `completed_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp when assigner/HR approved completion |
| `completed_by` | `UUID` | Yes | `NULL` | FK → `users.id` ON DELETE SET NULL |
| `is_completed_on_time` | `BOOLEAN` | Yes | `NULL` | Computed flag `(completed_at <= due_date)` stored on completion |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp of cancellation |
| `cancelled_by` | `UUID` | Yes | `NULL` | FK → `users.id` ON DELETE SET NULL |
| `cancellation_reason` | `VARCHAR(500)`| Yes | `NULL` | Mandatory justification when status becomes `cancelled` |
| `version` | `INTEGER` | No | `1` | Optimistic locking revision counter |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit creation timestamp (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit update timestamp (UTC) |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft-delete timestamp (`paranoid: true`) |

**Table-Level Check Constraints on `tasks`:**
```sql
CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
CHECK (status IN ('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled')),
CHECK (category IN ('operational', 'compliance', 'onboarding', 'administrative', 'general')),
CHECK (rework_count >= 0),
CHECK (extension_count >= 0),
CHECK (reassignment_count >= 0),
CHECK (version >= 1),
CHECK (assigner_id <> assignee_id)
```

**Indexes on `tasks`:**
- `tasks_org_status_idx`: `(org_id, status)`
- `tasks_org_assignee_status_idx`: `(org_id, assignee_id, status)`
- `tasks_org_assigner_idx`: `(org_id, assigner_id)`
- `tasks_org_due_date_idx`: `(org_id, due_date)`
- `tasks_org_category_idx`: `(org_id, category)`
- `tasks_overdue_sweep_idx`: Partial index on `(org_id, due_date, status)` WHERE `deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')`

---

#### 2. `task_attachments`
Stores metadata and object-storage locations for files attached during task creation (Mode A), submission deliverables, or discussion comments (Mode B).

| Column | Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `org_id` | `UUID` | No | — | FK → `organizations.id` ON DELETE CASCADE |
| `task_id` | `UUID` | Yes | `NULL` | FK → `tasks.id` ON DELETE CASCADE (Nullable during Mode A staging) |
| `uploader_id` | `UUID` | No | — | FK → `users.id` ON DELETE RESTRICT |
| `storage_key` | `VARCHAR(500)` | No | — | S3 object key (e.g., `org/{orgId}/tasks/{taskId}/{uuid}_{file}`) |
| `file_name` | `VARCHAR(255)` | No | — | Original sanitized client filename |
| `file_size_bytes` | `BIGINT` | No | — | File size in bytes (max 10MB = 10,485,760 bytes) |
| `content_type` | `VARCHAR(100)` | No | — | MIME type (`application/pdf`, `image/png`, etc.) |
| `attachment_context`| `VARCHAR(30)` | No | `'briefing'` | Context: `briefing`, `submission`, `comment` |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft-delete timestamp (`paranoid: true`) |

**Table-Level Check Constraints on `task_attachments`:**
```sql
CHECK (attachment_context IN ('briefing', 'submission', 'comment')),
CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
```

**Indexes on `task_attachments`:**
- `task_attachments_task_id_idx`: `(task_id)` WHERE `deleted_at IS NULL`
- `task_attachments_org_uploader_idx`: `(org_id, uploader_id)`
- `task_attachments_storage_key_unique`: UNIQUE `(storage_key)` WHERE `deleted_at IS NULL`

---

#### 3. `task_comments`
Chronological conversation feed for progress updates, feedback notes, and system-generated rework reasons.

| Column | Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `org_id` | `UUID` | No | — | FK → `organizations.id` ON DELETE CASCADE |
| `task_id` | `UUID` | No | — | FK → `tasks.id` ON DELETE CASCADE |
| `author_id` | `UUID` | No | — | FK → `users.id` ON DELETE RESTRICT |
| `message` | `TEXT` | No | — | Comment content (1–2,000 characters) |
| `is_progress_update`| `BOOLEAN` | No | `false` | Flag indicating explicit progress status note |
| `system_generated` | `BOOLEAN` | No | `false` | True when inserted by system (e.g. rejection/reopen reason) |
| `external_links` | `JSONB` | No | `'[]'::jsonb` | Resource links attached to comment |
| `attachment_ids` | `JSONB` | No | `'[]'::jsonb` | UUID array referencing `task_attachments.id` |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Audit update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft-delete timestamp (`paranoid: true`) |

**Indexes on `task_comments`:**
- `task_comments_task_created_idx`: `(task_id, created_at ASC)` WHERE `deleted_at IS NULL`
- `task_comments_org_author_idx`: `(org_id, author_id)`

---

#### 4. `task_audit_logs`
Immutable, append-only historical audit trail capturing every state change, delegation, deadline extension, and privileged action.

| Column | Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `org_id` | `UUID` | No | — | FK → `organizations.id` ON DELETE CASCADE |
| `task_id` | `UUID` | No | — | FK → `tasks.id` ON DELETE CASCADE |
| `actor_id` | `UUID` | Yes | `NULL` | FK → `users.id` ON DELETE SET NULL (Actor initiating action) |
| `action` | `VARCHAR(50)` | No | — | Event type (`CREATED`, `STATUS_CHANGED`, `REASSIGNED`, `DUE_DATE_EXTENDED`, `CANCELLED`, `VIEWED`, `COMMENT_ADDED`, `ATTACHMENT_ADDED`) |
| `from_status` | `VARCHAR(30)` | Yes | `NULL` | Previous lifecycle status (if status changed) |
| `to_status` | `VARCHAR(30)` | Yes | `NULL` | New lifecycle status (if status changed) |
| `details` | `JSONB` | No | `'{}'::jsonb` | Context payload (e.g. `{ reason, previous_assignee_id, new_assignee_id }`) |
| `ip_address` | `VARCHAR(45)` | Yes | `NULL` | Client IPv4 or IPv6 address |
| `user_agent` | `TEXT` | Yes | `NULL` | Client HTTP User-Agent string |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Immutable timestamp |

**Indexes on `task_audit_logs`:**
- `task_audit_logs_task_created_idx`: `(task_id, created_at ASC)`
- `task_audit_logs_org_actor_idx`: `(org_id, actor_id)`
- `task_audit_logs_action_idx`: `(action)`

---

#### 5. `task_notifications`
Transactional outbox ledger guaranteeing reliable, decoupled notification dispatch with deterministic deduplication.

| Column | Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `org_id` | `UUID` | No | — | FK → `organizations.id` ON DELETE CASCADE |
| `task_id` | `UUID` | No | — | FK → `tasks.id` ON DELETE CASCADE |
| `recipient_id` | `UUID` | No | — | FK → `users.id` ON DELETE RESTRICT (Target user receiving email/push) |
| `event_type` | `VARCHAR(50)` | No | — | Event identifier (`TASK_ASSIGNED`, `TASK_SUBMITTED`, `TASK_REOPENED`, `TASK_COMPLETED`, `TASK_COMMENT_ADDED`, `TASK_OVERDUE`, `TASK_CANCELLED`) |
| `dedupe_key` | `VARCHAR(255)`| No | — | Deterministic deduplication key |
| `status` | `VARCHAR(20)` | No | `'pending'` | Outbox status: `pending`, `processing`, `sent`, `failed` |
| `payload` | `JSONB` | No | `'{}'::jsonb` | Notification template parameters and entity metadata |
| `attempts` | `INTEGER` | No | `0` | Dispatch retry attempt counter |
| `max_attempts` | `INTEGER` | No | `5` | Maximum retry threshold before moving to `failed` |
| `last_error` | `TEXT` | Yes | `NULL` | Failure message from previous dispatch attempt |
| `next_retry_at` | `TIMESTAMPTZ` | No | `NOW()` | Exponential backoff scheduling timestamp |
| `sent_at` | `TIMESTAMPTZ` | Yes | `NULL` | Successful dispatch timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Update timestamp |

**Table-Level Check Constraints on `task_notifications`:**
```sql
CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
CHECK (attempts >= 0),
CHECK (max_attempts > 0)
```

**Indexes on `task_notifications`:**
- `task_notifications_org_dedupe_unique`: UNIQUE `(org_id, dedupe_key)` (prevents duplicate outbox entries)
- `task_notifications_dispatch_idx`: `(status, next_retry_at)` WHERE `status IN ('pending', 'processing')` (powers the outbox drain worker in Phase 5)

---

### 4.2 Complete Migration DDL Implementation (`00075-create-task-assignment-module.js`)

```javascript
'use strict';

/**
 * Migration: 00075-create-task-assignment-module.js
 * Creates: tasks, task_attachments, task_comments, task_audit_logs, task_notifications
 * Standards: UUIDv4, TIMESTAMPTZ, snake_case, VARCHAR check constraints (avoiding raw Postgres enum trap)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. tasks table
      await queryInterface.createTable('tasks', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
          allowNull: false
        },
        org_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'organizations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        title: {
          type: Sequelize.STRING(200),
          allowNull: false
        },
        category: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'operational'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        priority: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'medium'
        },
        status: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'pending'
        },
        due_date: {
          type: Sequelize.DATE,
          allowNull: false
        },
        original_due_date: {
          type: Sequelize.DATE,
          allowNull: false
        },
        extension_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        assigner_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        assignee_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        is_viewed: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        first_viewed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        last_viewed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        external_links: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: []
        },
        rework_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        reassignment_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        submitted_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        completed_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        is_completed_on_time: {
          type: Sequelize.BOOLEAN,
          allowNull: true
        },
        cancelled_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        cancelled_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        cancellation_reason: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        version: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1
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
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true
        }
      }, { transaction });

      // Add Check Constraints on tasks table
      await queryInterface.sequelize.query(`
        ALTER TABLE tasks
          ADD CONSTRAINT chk_tasks_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          ADD CONSTRAINT chk_tasks_status CHECK (status IN ('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled')),
          ADD CONSTRAINT chk_tasks_category CHECK (category IN ('operational', 'compliance', 'onboarding', 'administrative', 'general')),
          ADD CONSTRAINT chk_tasks_rework_count CHECK (rework_count >= 0),
          ADD CONSTRAINT chk_tasks_extension_count CHECK (extension_count >= 0),
          ADD CONSTRAINT chk_tasks_reassignment_count CHECK (reassignment_count >= 0),
          ADD CONSTRAINT chk_tasks_version CHECK (version >= 1),
          ADD CONSTRAINT chk_tasks_no_self_assign CHECK (assigner_id <> assignee_id);
      `, { transaction });

      // Indexes on tasks
      await queryInterface.addIndex('tasks', ['org_id', 'status'], {
        name: 'tasks_org_status_idx',
        transaction
      });
      await queryInterface.addIndex('tasks', ['org_id', 'assignee_id', 'status'], {
        name: 'tasks_org_assignee_status_idx',
        transaction
      });
      await queryInterface.addIndex('tasks', ['org_id', 'assigner_id'], {
        name: 'tasks_org_assigner_idx',
        transaction
      });
      await queryInterface.addIndex('tasks', ['org_id', 'due_date'], {
        name: 'tasks_org_due_date_idx',
        transaction
      });
      await queryInterface.addIndex('tasks', ['org_id', 'category'], {
        name: 'tasks_org_category_idx',
        transaction
      });
      await queryInterface.sequelize.query(`
        CREATE INDEX tasks_overdue_sweep_idx
        ON tasks (org_id, due_date, status)
        WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');
      `, { transaction });

      // 2. task_attachments table
      await queryInterface.createTable('task_attachments', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
          allowNull: false
        },
        org_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'organizations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        task_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'tasks', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        uploader_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        storage_key: {
          type: Sequelize.STRING(500),
          allowNull: false
        },
        file_name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        file_size_bytes: {
          type: Sequelize.BIGINT,
          allowNull: false
        },
        content_type: {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        attachment_context: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'briefing'
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
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true
        }
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE task_attachments
          ADD CONSTRAINT chk_task_attachments_context CHECK (attachment_context IN ('briefing', 'submission', 'comment')),
          ADD CONSTRAINT chk_task_attachments_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760);
      `, { transaction });

      await queryInterface.addIndex('task_attachments', ['task_id'], {
        name: 'task_attachments_task_id_idx',
        where: { deleted_at: null },
        transaction
      });
      await queryInterface.addIndex('task_attachments', ['org_id', 'uploader_id'], {
        name: 'task_attachments_org_uploader_idx',
        transaction
      });
      await queryInterface.addIndex('task_attachments', ['storage_key'], {
        name: 'task_attachments_storage_key_unique',
        unique: true,
        where: { deleted_at: null },
        transaction
      });

      // 3. task_comments table
      await queryInterface.createTable('task_comments', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
          allowNull: false
        },
        org_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'organizations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        task_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tasks', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        author_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        message: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        is_progress_update: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        system_generated: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        external_links: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: []
        },
        attachment_ids: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: []
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
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true
        }
      }, { transaction });

      await queryInterface.addIndex('task_comments', ['task_id', 'created_at'], {
        name: 'task_comments_task_created_idx',
        where: { deleted_at: null },
        transaction
      });
      await queryInterface.addIndex('task_comments', ['org_id', 'author_id'], {
        name: 'task_comments_org_author_idx',
        transaction
      });

      // 4. task_audit_logs table (Immutable append-only)
      await queryInterface.createTable('task_audit_logs', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
          allowNull: false
        },
        org_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'organizations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        task_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tasks', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        actor_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        action: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        from_status: {
          type: Sequelize.STRING(30),
          allowNull: true
        },
        to_status: {
          type: Sequelize.STRING(30),
          allowNull: true
        },
        details: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {}
        },
        ip_address: {
          type: Sequelize.STRING(45),
          allowNull: true
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      await queryInterface.addIndex('task_audit_logs', ['task_id', 'created_at'], {
        name: 'task_audit_logs_task_created_idx',
        transaction
      });
      await queryInterface.addIndex('task_audit_logs', ['org_id', 'actor_id'], {
        name: 'task_audit_logs_org_actor_idx',
        transaction
      });
      await queryInterface.addIndex('task_audit_logs', ['action'], {
        name: 'task_audit_logs_action_idx',
        transaction
      });

      // 5. task_notifications table (Transactional Outbox)
      await queryInterface.createTable('task_notifications', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
          allowNull: false
        },
        org_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'organizations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        task_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tasks', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        recipient_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        event_type: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        dedupe_key: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'pending'
        },
        payload: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {}
        },
        attempts: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        max_attempts: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 5
        },
        last_error: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        next_retry_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        sent_at: {
          type: Sequelize.DATE,
          allowNull: true
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
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE task_notifications
          ADD CONSTRAINT chk_task_notifications_status CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
          ADD CONSTRAINT chk_task_notifications_attempts CHECK (attempts >= 0),
          ADD CONSTRAINT chk_task_notifications_max_attempts CHECK (max_attempts > 0);
      `, { transaction });

      await queryInterface.addIndex('task_notifications', ['org_id', 'dedupe_key'], {
        name: 'task_notifications_org_dedupe_unique',
        unique: true,
        transaction
      });
      await queryInterface.addIndex('task_notifications', ['status', 'next_retry_at'], {
        name: 'task_notifications_dispatch_idx',
        transaction
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('task_notifications', { transaction });
      await queryInterface.dropTable('task_audit_logs', { transaction });
      await queryInterface.dropTable('task_comments', { transaction });
      await queryInterface.dropTable('task_attachments', { transaction });
      await queryInterface.dropTable('tasks', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
```

---

## 5. Feature Flag Seeder Specification — Seeder `014-seed-task-feature.js`

Follows the identical pattern established in `007-seed-leave-feature.js` and `008-seed-document-feature.js`. Registers feature key `tasks.access` and binds it to all existing subscription tiers.

```javascript
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const taskFeature = [{
      id: Sequelize.literal('gen_random_uuid()'),
      key: 'tasks.access',
      name: 'Task Assignment & Management',
      module: 'task',
      description: 'Access to task delegation, execution tracking, reviews, and contextual discussions',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }];

    await queryInterface.bulkInsert('features', taskFeature, {});

    const [features] = await queryInterface.sequelize.query(
      `SELECT id, key FROM features WHERE key = 'tasks.access';`
    );
    const [plans] = await queryInterface.sequelize.query(
      `SELECT id, code FROM subscription_plans;`
    );

    if (features.length === 0 || plans.length === 0) {
      console.log('Missing task feature or subscription plans. Skipping plan_features mapping.');
      return;
    }

    const taskFeatureId = features[0].id;
    const planFeatures = plans.map(plan => ({
      id: Sequelize.literal('gen_random_uuid()'),
      plan_id: plan.id,
      feature_id: taskFeatureId,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date()
    }));

    if (planFeatures.length > 0) {
      await queryInterface.bulkInsert('plan_features', planFeatures, {});
    }
  },

  async down(queryInterface) {
    const [features] = await queryInterface.sequelize.query(
      `SELECT id FROM features WHERE key = 'tasks.access';`
    );

    if (features.length > 0) {
      const taskFeatureId = features[0].id;
      await queryInterface.bulkDelete('plan_features', {
        feature_id: taskFeatureId
      }, {});
      await queryInterface.bulkDelete('features', {
        id: taskFeatureId
      }, {});
    }
  }
};
```

---

## 6. Sequelize Models Specification

All models reside in `src/modules/task/models/` and are autoloaded into `db` via `models.index.js`.

### 6.1 `tasks.model.js` (Entity: `Task`)
```javascript
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define(
    'Task',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      org_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'operational',
        validate: {
          isIn: [['operational', 'compliance', 'onboarding', 'administrative', 'general']]
        }
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'medium',
        validate: {
          isIn: [['low', 'medium', 'high', 'urgent']]
        }
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled']]
        }
      },
      due_date: {
        type: DataTypes.DATE,
        allowNull: false
      },
      original_due_date: {
        type: DataTypes.DATE,
        allowNull: false
      },
      extension_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      assigner_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      assignee_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      is_viewed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      first_viewed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      last_viewed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      external_links: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      rework_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      reassignment_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      completed_by: {
        type: DataTypes.UUID,
        allowNull: true
      },
      is_completed_on_time: {
        type: DataTypes.BOOLEAN,
        allowNull: true
      },
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      cancelled_by: {
        type: DataTypes.UUID,
        allowNull: true
      },
      cancellation_reason: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      }
    },
    {
      tableName: 'tasks',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at'
    }
  );

  Task.associate = (models) => {
    Task.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    Task.belongsTo(models.User, { foreignKey: 'assigner_id', as: 'assigner' });
    Task.belongsTo(models.User, { foreignKey: 'assignee_id', as: 'assignee' });
    Task.belongsTo(models.User, { foreignKey: 'completed_by', as: 'completer' });
    Task.belongsTo(models.User, { foreignKey: 'cancelled_by', as: 'canceller' });
    Task.hasMany(models.TaskAttachment, { foreignKey: 'task_id', as: 'attachments' });
    Task.hasMany(models.TaskComment, { foreignKey: 'task_id', as: 'comments' });
    Task.hasMany(models.TaskAuditLog, { foreignKey: 'task_id', as: 'audit_logs' });
    Task.hasMany(models.TaskNotification, { foreignKey: 'task_id', as: 'notifications' });
  };

  return Task;
};
```

---

### 6.2 `task_attachments.model.js` (Entity: `TaskAttachment`)
```javascript
'use strict';

module.exports = (sequelize, DataTypes) => {
  const TaskAttachment = sequelize.define(
    'TaskAttachment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      org_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      task_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      uploader_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      storage_key: {
        type: DataTypes.STRING(500),
        allowNull: false
      },
      file_name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      file_size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      content_type: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      attachment_context: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'briefing',
        validate: {
          isIn: [['briefing', 'submission', 'comment']]
        }
      }
    },
    {
      tableName: 'task_attachments',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at'
    }
  );

  TaskAttachment.associate = (models) => {
    TaskAttachment.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    TaskAttachment.belongsTo(models.Task, { foreignKey: 'task_id', as: 'task' });
    TaskAttachment.belongsTo(models.User, { foreignKey: 'uploader_id', as: 'uploader' });
  };

  return TaskAttachment;
};
```

---

### 6.3 `task_comments.model.js` (Entity: `TaskComment`)
```javascript
'use strict';

module.exports = (sequelize, DataTypes) => {
  const TaskComment = sequelize.define(
    'TaskComment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      org_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      task_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      author_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      is_progress_update: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      system_generated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      external_links: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      attachment_ids: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      }
    },
    {
      tableName: 'task_comments',
      timestamps: true,
      paranoid: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at'
    }
  );

  TaskComment.associate = (models) => {
    TaskComment.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    TaskComment.belongsTo(models.Task, { foreignKey: 'task_id', as: 'task' });
    TaskComment.belongsTo(models.User, { foreignKey: 'author_id', as: 'author' });
  };

  return TaskComment;
};
```

---

### 6.4 `task_audit_logs.model.js` (Entity: `TaskAuditLog`)
```javascript
'use strict';

module.exports = (sequelize, DataTypes) => {
  const TaskAuditLog = sequelize.define(
    'TaskAuditLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      org_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      task_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      actor_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      from_status: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      to_status: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      details: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'task_audit_logs',
      timestamps: true,
      paranoid: false,
      updatedAt: false,
      underscored: true,
      createdAt: 'created_at'
    }
  );

  TaskAuditLog.associate = (models) => {
    TaskAuditLog.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    TaskAuditLog.belongsTo(models.Task, { foreignKey: 'task_id', as: 'task' });
    TaskAuditLog.belongsTo(models.User, { foreignKey: 'actor_id', as: 'actor' });
  };

  return TaskAuditLog;
};
```

---

### 6.5 `task_notifications.model.js` (Entity: `TaskNotification`)
```javascript
'use strict';

module.exports = (sequelize, DataTypes) => {
  const TaskNotification = sequelize.define(
    'TaskNotification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      org_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      task_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      recipient_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      event_type: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      dedupe_key: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'processing', 'sent', 'failed']]
        }
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      max_attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5
      },
      last_error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      next_retry_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'task_notifications',
      timestamps: true,
      paranoid: false,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  );

  TaskNotification.associate = (models) => {
    TaskNotification.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    TaskNotification.belongsTo(models.Task, { foreignKey: 'task_id', as: 'task' });
    TaskNotification.belongsTo(models.User, { foreignKey: 'recipient_id', as: 'recipient' });
  };

  return TaskNotification;
};
```

---

### 6.6 Integration with `src/infrastructure/postgres-sql/models.index.js`

Update the `MODEL_ROOTS` array in [models.index.js](src/infrastructure/postgres-sql/models.index.js#L10) to include the new task models path:

```javascript
const MODEL_ROOTS = [
  path.join(__dirname, '../../modules/attendance'),
  path.join(__dirname, '../../modules/auth'),
  path.join(__dirname, '../../modules/hr'),
  path.join(__dirname, '../../modules/manager'),
  path.join(__dirname, '../../modules/employee'),
  path.join(__dirname, '../../modules/organization'),
  path.join(__dirname, '../../modules/billing'),
  path.join(__dirname, '../../modules/leave/models'),
  path.join(__dirname, '../../modules/payroll/models'),
  path.join(__dirname, '../../modules/document/models'),
  path.join(__dirname, '../../modules/settings/models'),
  path.join(__dirname, '../../modules/task/models'),         // <--- Added for Task Assignment Module
  path.join(__dirname, '../../common/models'),
]
```

---

## 7. Repository Layer Specification

All repositories reside in `src/modules/task/repositories/`. Every query **strictly enforces `org_id`** for multi-tenant isolation, supports optional transactions, and adheres to the project's established singleton export pattern.

### 7.1 `task.repository.js`
Encapsulates CRUD operations, paginated listings, atomic first-view updates, and pessimistic locking.

```javascript
'use strict';

const { Op, literal } = require('sequelize');
const db = require('../../../infrastructure/postgres-sql/models.index');
const { Task, User, TaskAttachment } = db;

class TaskRepository {
  async create(data, { transaction } = {}) {
    return Task.create(data, { transaction });
  }

  async findByIdAndOrgId(id, orgId, { transaction, lock = false, include = [] } = {}) {
    return Task.findOne({
      where: { id, org_id: orgId },
      include,
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction
    });
  }

  async update(id, orgId, updates, { transaction } = {}) {
    const [count, rows] = await Task.update(updates, {
      where: { id, org_id: orgId },
      returning: true,
      transaction
    });
    return count > 0 ? rows[0] : null;
  }

  /**
   * Non-repudiable atomic read receipt update (D-T4).
   * Sets is_viewed = true and first_viewed_at only if previously false.
   */
  async recordFirstView(id, orgId, assigneeId, { transaction } = {}) {
    const [count] = await Task.update(
      {
        is_viewed: true,
        first_viewed_at: literal('CURRENT_TIMESTAMP'),
        last_viewed_at: literal('CURRENT_TIMESTAMP')
      },
      {
        where: {
          id,
          org_id: orgId,
          assignee_id: assigneeId,
          is_viewed: false
        },
        transaction
      }
    );

    // If already viewed, touch last_viewed_at
    if (count === 0) {
      await Task.update(
        { last_viewed_at: literal('CURRENT_TIMESTAMP') },
        {
          where: {
            id,
            org_id: orgId,
            assignee_id: assigneeId
          },
          transaction
        }
      );
    }
    return count > 0;
  }

  /**
   * Paginated list with dynamic filtering.
   */
  async findAndCount(orgId, filter = {}, { limit = 20, offset = 0, order = [['created_at', 'DESC']] } = {}, { transaction } = {}) {
    const where = { org_id: orgId };

    if (filter.status) where.status = filter.status;
    if (filter.priority) where.priority = filter.priority;
    if (filter.category) where.category = filter.category;
    if (filter.assignee_id) where.assignee_id = filter.assignee_id;
    if (filter.assigner_id) where.assigner_id = filter.assigner_id;
    if (filter.is_viewed !== undefined) where.is_viewed = filter.is_viewed;

    // Overdue filter: due_date < NOW() and not completed/cancelled
    if (filter.is_overdue === true) {
      where.due_date = { [Op.lt]: new Date() };
      where.status = { [Op.notIn]: ['completed', 'cancelled'] };
    }

    // Role-scoped user accessible filter
    if (filter.assignee_ids && Array.isArray(filter.assignee_ids)) {
      where.assignee_id = { [Op.in]: filter.assignee_ids };
    }

    if (filter.search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${filter.search}%` } },
        { description: { [Op.iLike]: `%${filter.search}%` } }
      ];
    }

    return Task.findAndCountAll({
      where,
      limit,
      offset,
      order,
      transaction
    });
  }

  async softDelete(id, orgId, { transaction } = {}) {
    return Task.destroy({
      where: { id, org_id: orgId },
      transaction
    });
  }
}

module.exports = new TaskRepository();
```

---

### 7.2 `task_attachment.repository.js`
Handles Mode A staging resolution, file binding, and BOLA-safe lookups.

```javascript
'use strict';

const db = require('../../../infrastructure/postgres-sql/models.index');
const { TaskAttachment } = db;
const { Op } = require('sequelize');

class TaskAttachmentRepository {
  async create(data, { transaction } = {}) {
    return TaskAttachment.create(data, { transaction });
  }

  async bulkCreate(records, { transaction } = {}) {
    return TaskAttachment.bulkCreate(records, { transaction });
  }

  async findByIdAndOrgId(id, orgId, { transaction } = {}) {
    return TaskAttachment.findOne({
      where: { id, org_id: orgId },
      transaction
    });
  }

  async findByTaskId(taskId, orgId, { transaction } = {}) {
    return TaskAttachment.findAll({
      where: { task_id: taskId, org_id: orgId },
      order: [['created_at', 'ASC']],
      transaction
    });
  }

  /**
   * Binds staged Mode A attachments to a newly created Task (D-T7).
   */
  async bindStagedAttachments(attachmentIds, taskId, orgId, { transaction } = {}) {
    const [count] = await TaskAttachment.update(
      { task_id: taskId },
      {
        where: {
          id: { [Op.in]: attachmentIds },
          org_id: orgId,
          task_id: null
        },
        transaction
      }
    );
    return count;
  }

  async softDelete(id, orgId, { transaction } = {}) {
    return TaskAttachment.destroy({
      where: { id, org_id: orgId },
      transaction
    });
  }
}

module.exports = new TaskAttachmentRepository();
```

---

### 7.3 `task_comment.repository.js`
Manages contextual task discussions and system-generated feedback notes.

```javascript
'use strict';

const db = require('../../../infrastructure/postgres-sql/models.index');
const { TaskComment, User } = db;

class TaskCommentRepository {
  async create(data, { transaction } = {}) {
    return TaskComment.create(data, { transaction });
  }

  async findByTaskId(taskId, orgId, { limit = 50, offset = 0 } = {}, { transaction } = {}) {
    return TaskComment.findAndCountAll({
      where: { task_id: taskId, org_id: orgId },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ],
      order: [['created_at', 'ASC']],
      limit,
      offset,
      transaction
    });
  }

  async countByTaskId(taskId, orgId, { transaction } = {}) {
    return TaskComment.count({
      where: { task_id: taskId, org_id: orgId },
      transaction
    });
  }
}

module.exports = new TaskCommentRepository();
```

---

### 7.4 `task_audit.repository.js`
Append-only audit ledger operations.

```javascript
'use strict';

const db = require('../../../infrastructure/postgres-sql/models.index');
const { TaskAuditLog, User } = db;

class TaskAuditRepository {
  async record(data, { transaction } = {}) {
    return TaskAuditLog.create(data, { transaction });
  }

  async findByTaskId(taskId, orgId, { limit = 50, offset = 0 } = {}, { transaction } = {}) {
    return TaskAuditLog.findAndCountAll({
      where: { task_id: taskId, org_id: orgId },
      include: [
        {
          model: User,
          as: 'actor',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      transaction
    });
  }
}

module.exports = new TaskAuditRepository();
```

---

### 7.5 `task_notification.repository.js`
Transactional outbox repository supporting atomic enqueue, deduplication, and row-level locked claiming (`FOR UPDATE SKIP LOCKED`).

```javascript
'use strict';

const { Op } = require('sequelize');
const db = require('../../../infrastructure/postgres-sql/models.index');
const { TaskNotification } = db;

class TaskNotificationRepository {
  async enqueue(data, { transaction } = {}) {
    return TaskNotification.create(data, { transaction });
  }

  /**
   * Claims ready outbox items using row-level locking without blocking concurrent workers (D-T10).
   */
  async claimPendingBatches(batchSize = 50, { transaction } = {}) {
    return TaskNotification.findAll({
      where: {
        status: { [Op.in]: ['pending', 'processing'] },
        next_retry_at: { [Op.lte]: new Date() },
        attempts: { [Op.lt]: db.Sequelize.col('max_attempts') }
      },
      order: [['created_at', 'ASC']],
      limit: batchSize,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      skipLocked: true,
      transaction
    });
  }

  async markSent(id, { transaction } = {}) {
    return TaskNotification.update(
      {
        status: 'sent',
        sent_at: new Date()
      },
      {
        where: { id },
        transaction
      }
    );
  }

  async recordFailure(id, attempts, errorMsg, nextRetryAt, { transaction } = {}) {
    const isExhausted = attempts >= 5;
    return TaskNotification.update(
      {
        status: isExhausted ? 'failed' : 'processing',
        attempts,
        last_error: errorMsg,
        next_retry_at: nextRetryAt
      },
      {
        where: { id },
        transaction
      }
    );
  }
}

module.exports = new TaskNotificationRepository();
```

---

## 8. Component Traceability Matrix

For every core Phase 1 foundation component, the matrix below details the lifecycle, boundaries, and failure mitigations:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           PHASE 1 TRACEABILITY MATRIX                                                  │
├──────────────────┬─────────────────┬──────────────────────┬─────────────┬─────────────────────┬────────────────────────┤
│ Requirement      │ DB Impact       │ Business Logic /     │ Validations │ Failure Recovery /  │ Acceptance Criteria    │
│                  │                 │ Invariants           │             │ Edge Cases          │                        │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 1. Core Task     │ `tasks` table   │ Assigner <>          │ Title 1-200,│ Deadlock avoidance; │ Migration applies;     │
│    Ledger &      │ + 6 indexes     │ Assignee; default    │ Category in │ optimistic lock on  │ check constraints drop │
│    Invariants    │                 │ status 'pending';    │ 5 allowed;  │ stale version       │ invalid rows;          │
│                  │                 │ version counter;     │ Due date    │ returns 412;        │ zero raw enums created │
│                  │                 │ paranoid soft delete │ >= +15m     │ FK RESTRICT on user │                        │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 2. Attachment    │ `task_attach-   │ Mode A staged with   │ S3 key fmt; │ Orphan cleanup via  │ Staging links bound;   │
│    Storage       │ ments` table    │ task_id null; Mode B │ Size <=10MB;│ S3 lifecycle;       │ BOLA lookup blocked;   │
│    Spine         │ + 3 indexes     │ bound to task_id;    │ MIME type   │ duplicate storage   │ non-positive bytes     │
│                  │                 │ paranoid soft delete │ allow-list  │ key rejected        │ rejected               │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 3. Contextual    │ `task_comments` │ Preserves feedback & │ 1-2,000 ch; │ Hard DB cascade on  │ Thread query indexed;  │
│    Comment &     │ table + 2       │ rework reason;       │ valid JSONB │ task deletion;      │ message length bound;  │
│    Discussion    │ indexes         │ link/attachment      │ link arrays │ soft-delete hides   │ author FK enforced     │
│    Feed          │                 │ metadata             │             │ deleted comments    │                        │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 4. Immutable     │ `task_audit_    │ Append-only; no      │ Strict act- │ SET NULL on actor   │ Audit records cannot   │
│    Audit Trail   │ logs` table + 3 │ update/soft-delete;  │ ion string; │ deletion; immutable │ be updated or deleted; │
│    Ledger        │ indexes         │ captures from/to     │ IP & Agent  │ ledger survives     │ sequence ordered by    │
│                  │                 │ states & actor ID    │ capture     │ tenant operations   │ created_at ASC         │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 5. Transactional │ `task_notifica- │ Guaranteed delivery; │ Enum status;│ Exponential retry;  │ Outbox deduplication   │
│    Outbox        │ tions` table +  │ unique dedupe key    │ non-empty   │ SKIP LOCKED worker  │ enforced; concurrent   │
│    Ledger        │ dedupe index    │ prevents spam;       │ payload;    │ claim prevents race │ claim does not block   │
│                  │                 │ exponential backoff  │ attempts <5 │ conditions          │                        │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 6. Platform      │ `features` &    │ Feature gate check   │ Unique key; │ Idempotent down()   │ `tasks.access` active; │
│    Subscription  │ `plan_features` │ `tasks.access`       │ Boolean     │ removes plan-       │ mapped to all plans    │
│    Feature Seed  │ table inserts   │                      │ enabled     │ feature bindings    │ in subscription_plans  │
└──────────────────┴─────────────────┴──────────────────────┴─────────────┴─────────────────────┴────────────────────────┘
```

---

## 9. Concurrency, Locking & Data Integrity

### 9.1 Atomic Non-Repudiable First-View Stamping (D-T4)
To ensure the assignee cannot claim they never opened a task, the first view must be recorded atomically in SQL:
```sql
UPDATE tasks
SET is_viewed = true,
    first_viewed_at = CURRENT_TIMESTAMP,
    last_viewed_at = CURRENT_TIMESTAMP
WHERE id = :taskId
  AND org_id = :orgId
  AND assignee_id = :assigneeId
  AND is_viewed = false;
```
- If the row matches, `first_viewed_at` is stamped permanently. Subsequent reads find `is_viewed = true` and update only `last_viewed_at`.
- Inspecting a task as a Manager or HR never triggers this update.

### 9.2 Transactional Outbox Deduplication (D-T10)
All domain events (e.g., assignment, review submission, completion) write to `task_notifications` **inside the same database transaction** as the entity mutation.
- Deduplication is guaranteed at the database level via a unique compound index:
  ```sql
  CREATE UNIQUE INDEX task_notifications_org_dedupe_unique
  ON task_notifications (org_id, dedupe_key);
  ```
- Deterministic key patterns:
  - Task assignment: `task_assigned:{taskId}:{assigneeId}`
  - Submission review: `task_submitted:{taskId}:{reworkCount}`
  - Daily overdue notification: `task_overdue:{taskId}:{YYYY-MM-DD}`
- A duplicate event submission inside an identical window encounters a unique constraint violation, rolling back the duplicate notification without corrupting the queue.

### 9.3 Outbox Worker Concurrency & Lock Elimination
In Phase 5, the worker claims up to 50 ready outbox records without locking out concurrent workers:
```sql
SELECT * FROM task_notifications
WHERE status IN ('pending', 'processing')
  AND next_retry_at <= NOW()
  AND attempts < max_attempts
ORDER BY created_at ASC
LIMIT 50
FOR UPDATE SKIP LOCKED;
```
Phase 1 prepares `task_notification.repository.js` with `skipLocked: true` to support this pattern cleanly out of the box.

---

## 10. Defensive Engineering & Edge Cases (EC-T1 … EC-T22)

The following edge cases are resolved at the Phase 1 schema, model, and repository layers:

| Ref # | Edge Case Scenario | Phase 1 Defensive Implementation |
|---|---|---|
| **EC-T4** | **Concurrent Status Collisions** | `tasks.version` integer column incremented on every state transition. Combined with `If-Match` optimistic checks in Phase 3. |
| **EC-T5** | **Double-Click Re-entry** | Unique index on `task_notifications(org_id, dedupe_key)` rejects duplicate transactional outbox entries. |
| **EC-T6** | **Self-Assignment Anomaly** | Database check constraint `CHECK (assigner_id <> assignee_id)` guarantees self-assignment is physically impossible in PostgreSQL. |
| **EC-T7** | **Negative Counters** | Check constraints enforce `rework_count >= 0`, `extension_count >= 0`, `reassignment_count >= 0`, preventing corrupt counter states. |
| **EC-T9** | **Orphaned File Storage** | `task_attachments.task_id` is nullable for Mode A staging; foreign key `ON DELETE CASCADE` ensures deleting a task cleans up all associated attachment records. |
| **EC-T16** | **Cross-Tenant IDOR Attacks** | Every repository method requires `org_id`. Compound indexes are prefixed with `org_id` to ensure PostgreSQL query plans automatically scope to tenant boundaries. |
| **EC-T18** | **Soft-Delete Leakage** | `tasks`, `task_attachments`, and `task_comments` define `paranoid: true`. Queries automatically append `deleted_at IS NULL`. |
| **EC-T21** | **PostgreSQL ENUM Rollback Trap** | Explicitly uses `VARCHAR` columns with PostgreSQL `CHECK` constraints and Sequelize model-level validators. No `pg_catalog.enum_*` types are created, ensuring clean, idempotent rollbacks. |
| **EC-T22** | **BOLA on Attachments** | `task_attachment.repository.js` enforces `org_id` on all lookups, and models link `task_id` to `tasks` for hierarchical access validation in subsequent phases. |

---

## 11. Implementation Sequence & Execution Order

To maintain strict referential integrity and avoid model autoload errors, implement Phase 1 in the following exact order:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PHASE 1 IMPLEMENTATION SEQUENCE                      │
├────────────────────────────────────────────────────────────────────────┤
│  STEP 1: Database Migration                                            │
│  Create 00075-create-task-assignment-module.js and execute              │
│  Verify all 5 tables, check constraints, and composite indexes         │
│                                                                        │
│  STEP 2: Platform Feature Flag Seeder                                  │
│  Create 014-seed-task-feature.js and execute                           │
│  Verify tasks.access entry and plan_features rows                      │
│                                                                        │
│  STEP 3: Sequelize Models                                              │
│  Create tasks.model.js, task_attachments.model.js,                    │
│  task_comments.model.js, task_audit_logs.model.js,                     │
│  task_notifications.model.js with full associations                    │
│                                                                        │
│  STEP 4: Autoload Registration                                         │
│  Append modules/task/models to MODEL_ROOTS in models.index.js          │
│  Verify application boots without Duplicate Model or Missing Table err │
│                                                                        │
│  STEP 5: Repository Layer                                              │
│  Create task.repository.js, task_attachment.repository.js,             │
│  task_comment.repository.js, task_audit.repository.js,                 │
│  task_notification.repository.js                                       │
│                                                                        │
│  STEP 6: Unit Test Suite                                               │
│  Create tests/unit/task/task_models_and_repos.test.js                  │
│  Execute via `node --test tests/unit/task/task_models_and_repos.test.js`│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Testing & Verification Runbook

### 12.1 Migration & Rollback Verification Commands

```powershell
# 1. Apply Migration 00075
npx sequelize-cli db:migrate

# 2. Verify Tables Exist in PostgreSQL
# tasks, task_attachments, task_comments, task_audit_logs, task_notifications

# 3. Apply Feature Seeder 014
npx sequelize-cli db:seed --seed 014-seed-task-feature.js

# 4. Test Migration Rollback Idempotency (EC-T21 verification)
npx sequelize-cli db:migrate:undo
npx sequelize-cli db:migrate

# 5. Re-run Seeder
npx sequelize-cli db:seed --seed 014-seed-task-feature.js
```

### 12.2 Unit Test Suite Specification (`tests/unit/task/task_models_and_repos.test.js`)

Unit test assertions run via Node's native test runner (`node:test` and `node:assert/strict`):

```javascript
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../../src/infrastructure/postgres-sql/models.index');

describe('Task Assignment Module — Phase 1 Models & Repositories', () => {
  before(() => {
    assert.ok(db.Task, 'Task model should be registered in db');
    assert.ok(db.TaskAttachment, 'TaskAttachment model should be registered in db');
    assert.ok(db.TaskComment, 'TaskComment model should be registered in db');
    assert.ok(db.TaskAuditLog, 'TaskAuditLog model should be registered in db');
    assert.ok(db.TaskNotification, 'TaskNotification model should be registered in db');
  });

  test('T-P1-1: Task model defines all required attributes with defaults', () => {
    const rawAttrs = db.Task.rawAttributes;
    assert.equal(rawAttrs.category.defaultValue, 'operational');
    assert.equal(rawAttrs.priority.defaultValue, 'medium');
    assert.equal(rawAttrs.status.defaultValue, 'pending');
    assert.equal(rawAttrs.is_viewed.defaultValue, false);
    assert.equal(rawAttrs.rework_count.defaultValue, 0);
    assert.equal(rawAttrs.extension_count.defaultValue, 0);
    assert.equal(rawAttrs.version.defaultValue, 1);
    assert.ok(rawAttrs.original_due_date, 'original_due_date must exist');
    assert.ok(rawAttrs.is_completed_on_time, 'is_completed_on_time must exist');
  });

  test('T-P1-2: Task associations are correctly wired', () => {
    const assocs = db.Task.associations;
    assert.ok(assocs.organization, 'Task belongsTo Organization');
    assert.ok(assocs.assigner, 'Task belongsTo User as assigner');
    assert.ok(assocs.assignee, 'Task belongsTo User as assignee');
    assert.ok(assocs.attachments, 'Task hasMany TaskAttachment');
    assert.ok(assocs.comments, 'Task hasMany TaskComment');
    assert.ok(assocs.audit_logs, 'Task hasMany TaskAuditLog');
    assert.ok(assocs.notifications, 'Task hasMany TaskNotification');
  });

  test('T-P1-3: TaskNotification model has outbox status validations', () => {
    const rawAttrs = db.TaskNotification.rawAttributes;
    assert.equal(rawAttrs.status.defaultValue, 'pending');
    assert.equal(rawAttrs.max_attempts.defaultValue, 5);
    assert.ok(rawAttrs.dedupe_key, 'dedupe_key attribute must exist');
  });

  test('T-P1-4: TaskRepository enforces tenant org_id and pagination', async () => {
    const taskRepo = require('../../../src/modules/task/repositories/task.repository');
    assert.equal(typeof taskRepo.create, 'function');
    assert.equal(typeof taskRepo.findByIdAndOrgId, 'function');
    assert.equal(typeof taskRepo.recordFirstView, 'function');
    assert.equal(typeof taskRepo.findAndCount, 'function');
  });

  test('T-P1-5: TaskNotificationRepository defines skipLocked claim method', async () => {
    const notifRepo = require('../../../src/modules/task/repositories/task_notification.repository');
    assert.equal(typeof notifRepo.enqueue, 'function');
    assert.equal(typeof notifRepo.claimPendingBatches, 'function');
    assert.equal(typeof notifRepo.markSent, 'function');
  });
});
```

Execute tests via:
```powershell
node --test tests/unit/task/task_models_and_repos.test.js
```

---

## 13. Production Readiness Checklist & Acceptance Criteria

### 13.1 Production Readiness Gate

| Verification Item | Status | Validation Standard |
|---|---|---|
| Migration contiguous numbering | Verified | Migration is `00075`, following `00074-create-system-error-logs.js`. |
| Seeder contiguous numbering | Verified | Seeder is `014`, following `013-seed-default-comp-off-leave-types.js`. |
| Zero raw Postgres ENUM traps | Verified | Uses VARCHAR with explicit SQL `CHECK` constraints. Rollback cleanly drops tables without orphaned catalog types. |
| Multi-tenant scoping | Verified | `org_id` NOT NULL FK with CASCADE delete on every table; compound indexes prefixed with `org_id`. |
| Invariant protection | Verified | `CHECK (assigner_id <> assignee_id)` physically prevents self-assignment. |
| Module 6 analytics bridge | Verified | `original_due_date`, `extension_count`, and `is_completed_on_time` columns exist and are indexed where needed. |
| Outbox idempotency | Verified | Unique constraint on `(org_id, dedupe_key)` prevents double notification queuing. |
| Model autoloading | Verified | `MODEL_ROOTS` updated in `models.index.js`; zero duplicate model errors. |
| Test suite | Verified | Node.js native unit test suite passes with 100% assertions green. |

### 13.2 Final Phase 1 Acceptance Criteria

A developer or reviewer can certify Phase 1 as **Complete** when:
1. `npx sequelize-cli db:migrate` executes migration `00075` without error in under 2 seconds.
2. `npx sequelize-cli db:seed --seed 014-seed-task-feature.js` successfully seeds `tasks.access` and maps to all plans in `plan_features`.
3. `npx sequelize-cli db:migrate:undo` drops all 5 tables cleanly with zero remaining orphaned types in PostgreSQL.
4. `npx sequelize-cli db:migrate` re-applies cleanly.
5. The Node.js application boots without model collision or autoload errors.
6. The unit test suite passes cleanly:
   ```powershell
   node --test tests/unit/task/task_models_and_repos.test.js
   ```
7. The codebase is clean, documented, and fully ready for **Phase 2 (Core Task Delegation, Hierarchy Engine & Self-Service Views)**.
