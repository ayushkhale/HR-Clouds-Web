# Phase 1 Complete API & Architectural Analysis Documentation: Task Assignment Module (Foundation, Schema, Models & Repositories)

**Document File:** `public/md_task-assignment/phases/phase1_api_analysis.md`  
**Author:** Senior/Principal Backend Engineer, API Architect & Technical Documentation Engineer  
**Date:** 2026-10-12  
**Status:** Shipped, Verified & Green (`node --test tests/unit/task/task_models_and_repos.test.js` — 13 passing assertions, 0 failures)  

---

## Codebase Sources of Truth

* **Database Migration:** [00075-create-task-assignment-module.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/infrastructure/postgres-sql/migrations/00075-create-task-assignment-module.js)
* **Feature Seeder:** [014-seed-task-feature.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/infrastructure/postgres-sql/seeders/014-seed-task-feature.js)
* **Model Autoload Wiring:** [models.index.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/infrastructure/postgres-sql/models.index.js#L54)
* **Sequelize Models:**
  * [tasks.model.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/models/tasks.model.js)
  * [task_attachments.model.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/models/task_attachments.model.js)
  * [task_comments.model.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/models/task_comments.model.js)
  * [task_audit_logs.model.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/models/task_audit_logs.model.js)
  * [task_notifications.model.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/models/task_notifications.model.js)
* **Repository Layer:**
  * [task.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task.repository.js)
  * [task_attachment.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task_attachment.repository.js)
  * [task_comment.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task_comment.repository.js)
  * [task_audit.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task_audit.repository.js)
  * [task_notification.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task_notification.repository.js)
* **Unit & Integration Test Suite:** [task_models_and_repos.test.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/tests/unit/task/task_models_and_repos.test.js)

---

## 1. Executive Architectural Premise & Scope Boundary

Phase 1 of the Task Assignment Module delivers the **persistence foundation, database schema, multi-tenant relational models, subscription entitlement bindings, and data repository Service Provider Interface (SPI)** upon which all subsequent HTTP services and workflows depend.

### 1.1 Strict Phase Boundary & Public HTTP API Surface Audit
In strict accordance with the approved [Phase 1 Implementation Plan §1.2](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/phases/phase1_implementation_plan.md#L42-L52):
* **New Public HTTP APIs Shipped in Phase 1:** **0**  
  Phase 1 establishes the underlying database tables, constraints, models, and repositories. No HTTP controllers, validation schemas, or Express routers were exposed in Phase 1. Public HTTP endpoints are formally partitioned into Phase 2 (#249–#251, #255–#258, #265–#267), Phase 3 (#252, #259–#263, #268–#270), Phase 4 (#253, #254, #264), and Phase 5 (Background Cron Workers).
* **Existing HRMS APIs Modified by Phase 1:** **0**  
  Phase 1 introduced zero breaking changes, zero modified request/response contracts, and zero schema alterations to existing HRMS modules (`auth`, `organization`, `leave`, `attendance`, `payrolls`, `documents`, `settings`, `billing`).
* **Internal Programmatic APIs (Repository Layer SPI):** **22 Methods** across 5 repositories, providing full transactional support, tenant isolation, optimistic concurrency revision checking, and atomic visibility tracking.

### 1.2 Core Architectural Decisions Recorded in Phase 1
* **`D-T1` Single Unified Task Ledger:** All tasks—whether originating from managerial delegation or HR governance—reside in a single `tasks` table with role-driven visibility and access control.
* **`D-T2` Strict Multi-Tenant Isolation:** Every table mandates a non-nullable foreign key `org_id REFERENCES organizations(id) ON DELETE CASCADE`.
* **`D-T3` Zero Self-Assignment Invariant:** Physically enforced in PostgreSQL via `CONSTRAINT chk_tasks_no_self_assign CHECK (assigner_id <> assignee_id)`.
* **`D-T4` Non-Repudiable Read Receipts:** Atomically stamped via conditional database updates (`WHERE is_viewed = false`).
* **`D-T5` Dynamic Temporal Overdue Architecture:** Overdue states are evaluated dynamically without static enum columns, backed by a dedicated partial index `tasks_overdue_sweep_idx`.
* **`D-T8` Optimistic Concurrency Control (OCC):** Every mutating task operation is protected by a monotonically increasing `version` counter.
* **`D-T10` Transactional Outbox Pattern:** Notifications are staged atomically in `task_notifications` inside the primary business transaction with deterministic deduplication keys.

---

## 2. Feature Entitlement & Subscription Gate Architecture

Phase 1 registers the Task Assignment subsystem into the platform's subscription and licensing framework.

### 2.1 Feature Registration (`014-seed-task-feature.js`)
Seeder `014` registers the core feature key into the platform's `features` catalog:
```sql
INSERT INTO features (id, key, name, module, description, is_active)
VALUES (
  gen_random_uuid(),
  'tasks.access',
  'Task Assignment & Management',
  'task',
  'Access to task delegation, execution tracking, reviews, and contextual discussions',
  true
);
```

### 2.2 Plan Entitlement Mapping
Seeder `014` dynamically associates `tasks.access` across all active subscription tiers in `plan_features`:
* `basic`: `enabled = true`
* `professional`: `enabled = true`
* `growth_monthly`: `enabled = true`
* `enterprise`: `enabled = true`

### 2.3 Middleware Enforcement Contract
Subsequent API routers gate access using the standardized platform middleware:
```javascript
const requireFeature = require('../../../common/middlewares/require_feature.middleware')
router.use(requireFeature('tasks.access'))
```
* **Success:** Proceeds to next middleware if the organization's subscription entitles `tasks.access`.
* **Tenant Missing Claim:** Returns HTTP `400 Bad Request` (`MISSING_ORG_CONTEXT`).
* **Feature Not Entitled:** Returns HTTP `403 Forbidden` (`FEATURE_NOT_AVAILABLE`).

---

## 3. Database Schema & Migration Specification (`00075`)

Migration `00075-create-task-assignment-module.js` executes inside a single atomic PostgreSQL transaction, creating 5 relational tables, 13 performance and tenant indexes, and 12 database domain check constraints.

### 3.1 `tasks` Table (Core Work Ledger)
Stores all tasks across employee self-service, managerial delegation, and HR governance.

| Column | PostgreSQL Type | Nullable | Default | Constraints & Foreign Keys | Description |
|---|---|:---:|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Task identifier |
| `org_id` | `UUID` | No | — | `REFERENCES organizations(id) ON DELETE CASCADE` | Multi-tenant scoping |
| `title` | `VARCHAR(200)` | No | — | Min 1, Max 200 chars | Task summary |
| `category` | `VARCHAR(50)` | No | `'operational'` | `CHECK (category IN ('operational', 'compliance', 'onboarding', 'administrative', 'general'))` | Operational categorization |
| `description` | `TEXT` | No | — | Max 5,000 chars | Detailed briefing & expectations |
| `priority` | `VARCHAR(20)` | No | `'medium'` | `CHECK (priority IN ('low', 'medium', 'high', 'urgent'))` | Urgency rating |
| `status` | `VARCHAR(30)` | No | `'pending'` | `CHECK (status IN ('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled'))` | Lifecycle state machine status |
| `due_date` | `TIMESTAMPTZ` | No | — | Valid ISO 8601 UTC timestamp | Current active deadline |
| `original_due_date` | `TIMESTAMPTZ` | No | — | Stamped equal to `due_date` at creation | Immutable deadline benchmark for Module 6 |
| `extension_count` | `INTEGER` | No | `0` | `CHECK (extension_count >= 0)` | Number of approved deadline extensions |
| `assigner_id` | `UUID` | No | — | `REFERENCES users(id) ON DELETE RESTRICT` | Delegating manager or HR administrator |
| `assignee_id` | `UUID` | No | — | `REFERENCES users(id) ON DELETE RESTRICT` | Responsible executing employee |
| `is_viewed` | `BOOLEAN` | No | `false` | — | Non-repudiable read receipt flag |
| `first_viewed_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Timestamp when assignee first inspected task |
| `last_viewed_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Timestamp of most recent assignee inspection |
| `external_links` | `JSONB` | No | `'[]'::jsonb` | Max 10 items, schema `{ label, url }` | HTTPS reference documentation links |
| `rework_count` | `INTEGER` | No | `0` | `CHECK (rework_count >= 0)` | Number of times deliverable was rejected |
| `reassignment_count` | `INTEGER` | No | `0` | `CHECK (reassignment_count >= 0)` | Number of times task was reassigned |
| `submitted_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Timestamp when work submitted for review |
| `completed_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Timestamp when deliverable was approved |
| `completed_by` | `UUID` | Yes | `NULL` | `REFERENCES users(id) ON DELETE SET NULL` | Approving manager or HR user |
| `is_completed_on_time`| `BOOLEAN` | Yes | `NULL` | — | Performance metric: `completed_at <= due_date` |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Timestamp of task cancellation |
| `cancelled_by` | `UUID` | Yes | `NULL` | `REFERENCES users(id) ON DELETE SET NULL` | Cancelling manager or HR user |
| `cancellation_reason` | `VARCHAR(500)` | Yes | `NULL` | — | Mandatory explanation for cancellation |
| `version` | `INTEGER` | No | `1` | `CHECK (version >= 1)` | Optimistic concurrency control revision |
| `created_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Last modification timestamp |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Soft-delete timestamp (`paranoid: true`) |

#### Check Constraints on `tasks`:
```sql
ALTER TABLE tasks
  ADD CONSTRAINT chk_tasks_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  ADD CONSTRAINT chk_tasks_status CHECK (status IN ('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled')),
  ADD CONSTRAINT chk_tasks_category CHECK (category IN ('operational', 'compliance', 'onboarding', 'administrative', 'general')),
  ADD CONSTRAINT chk_tasks_rework_count CHECK (rework_count >= 0),
  ADD CONSTRAINT chk_tasks_extension_count CHECK (extension_count >= 0),
  ADD CONSTRAINT chk_tasks_reassignment_count CHECK (reassignment_count >= 0),
  ADD CONSTRAINT chk_tasks_version CHECK (version >= 1),
  ADD CONSTRAINT chk_tasks_no_self_assign CHECK (assigner_id <> assignee_id);
```

#### Indexes on `tasks`:
* `tasks_org_status_idx`: `(org_id, status)`
* `tasks_org_assignee_status_idx`: `(org_id, assignee_id, status)`
* `tasks_org_assigner_idx`: `(org_id, assigner_id)`
* `tasks_org_due_date_idx`: `(org_id, due_date)`
* `tasks_org_category_idx`: `(org_id, category)`
* `tasks_overdue_sweep_idx` (Partial Index for Background Sweeper):
  ```sql
  CREATE INDEX tasks_overdue_sweep_idx
  ON tasks (org_id, due_date, status)
  WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');
  ```

---

### 3.2 `task_attachments` Table (File References & Staging)
Holds briefing attachments, deliverable submissions, and contextual discussion file references.

| Column | PostgreSQL Type | Nullable | Default | Constraints & Foreign Keys | Description |
|---|---|:---:|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Attachment identifier |
| `org_id` | `UUID` | No | — | `REFERENCES organizations(id) ON DELETE CASCADE` | Multi-tenant scoping |
| `task_id` | `UUID` | Yes | `NULL` | `REFERENCES tasks(id) ON DELETE CASCADE` | Nullable during Mode A pre-creation staging |
| `uploader_id` | `UUID` | No | — | `REFERENCES users(id) ON DELETE RESTRICT` | Uploading employee or manager |
| `storage_key` | `VARCHAR(500)` | No | — | Unique index (where `deleted_at IS NULL`) | S3 object key |
| `file_name` | `VARCHAR(255)` | No | — | Sanitized original filename | User-facing filename |
| `file_size_bytes` | `BIGINT` | No | — | `CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)` | File byte size (Cap: 10 MB) |
| `content_type` | `VARCHAR(100)` | No | — | Valid MIME type string | Upload MIME type |
| `attachment_context`| `VARCHAR(30)` | No | `'briefing'` | `CHECK (attachment_context IN ('briefing', 'submission', 'comment'))` | Attachment purpose |
| `created_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Staged/uploaded timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Last update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Soft-delete timestamp (`paranoid: true`) |

---

### 3.3 `task_comments` Table (Discussion Thread & System Notes)
Maintains contextual collaboration, manager feedback, and system-generated rework explanations.

| Column | PostgreSQL Type | Nullable | Default | Constraints & Foreign Keys | Description |
|---|---|:---:|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Comment identifier |
| `org_id` | `UUID` | No | — | `REFERENCES organizations(id) ON DELETE CASCADE` | Multi-tenant scoping |
| `task_id` | `UUID` | No | — | `REFERENCES tasks(id) ON DELETE CASCADE` | Target task |
| `author_id` | `UUID` | No | — | `REFERENCES users(id) ON DELETE RESTRICT` | Authoring user |
| `message` | `TEXT` | No | — | 1–2,000 characters | Comment text |
| `is_progress_update`| `BOOLEAN` | No | `false` | — | True if flagged as progress update |
| `system_generated` | `BOOLEAN` | No | `false` | — | True if created automatically (e.g. rework feedback) |
| `external_links` | `JSONB` | No | `'[]'::jsonb` | Max 5 HTTPS links | Attached documentation links |
| `attachment_ids` | `JSONB` | No | `'[]'::jsonb` | Array of attachment UUIDs | Attached file identifiers |
| `created_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Post timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Edit timestamp |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Soft-delete timestamp (`paranoid: true`) |

#### Indexes on `task_comments`:
* `task_comments_task_created_idx`: `(task_id, created_at)` WHERE `deleted_at IS NULL`
* `task_comments_org_author_idx`: `(org_id, author_id)`

---

### 3.4 `task_audit_logs` Table (Immutable Historical Audit Ledger)
Provides a legally defensible, non-repudiable audit trail for all task mutations.

| Column | PostgreSQL Type | Nullable | Default | Constraints & Foreign Keys | Description |
|---|---|:---:|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Audit entry identifier |
| `org_id` | `UUID` | No | — | `REFERENCES organizations(id) ON DELETE CASCADE` | Multi-tenant scoping |
| `task_id` | `UUID` | No | — | `REFERENCES tasks(id) ON DELETE CASCADE` | Target task |
| `actor_id` | `UUID` | Yes | `NULL` | `REFERENCES users(id) ON DELETE SET NULL` | Actor initiating mutation (Null if background worker) |
| `action` | `VARCHAR(50)` | No | — | e.g. `CREATED`, `STATUS_CHANGED`, `FIRST_VIEWED` | Action type |
| `from_status` | `VARCHAR(30)` | Yes | `NULL` | — | Status before mutation |
| `to_status` | `VARCHAR(30)` | Yes | `NULL` | — | Status after mutation |
| `details` | `JSONB` | No | `'{}'::jsonb` | Delta payload | Detailed event metadata |
| `ip_address` | `VARCHAR(45)` | Yes | `NULL` | — | Client IPv4/IPv6 address |
| `user_agent` | `TEXT` | Yes | `NULL` | — | Client HTTP User-Agent |
| `created_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Append timestamp (`updatedAt = false`, `paranoid = false`) |

#### Indexes on `task_audit_logs`:
* `task_audit_logs_task_created_idx`: `(task_id, created_at)`
* `task_audit_logs_org_actor_idx`: `(org_id, actor_id)`
* `task_audit_logs_action_idx`: `(action)`

---

### 3.5 `task_notifications` Table (Transactional Outbox Ledger)
Implements the Transactional Outbox pattern (`D-T10`) to decouple business transactions from email/push notification dispatch.

| Column | PostgreSQL Type | Nullable | Default | Constraints & Foreign Keys | Description |
|---|---|:---:|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Notification record identifier |
| `org_id` | `UUID` | No | — | `REFERENCES organizations(id) ON DELETE CASCADE` | Multi-tenant scoping |
| `task_id` | `UUID` | No | — | `REFERENCES tasks(id) ON DELETE CASCADE` | Associated task |
| `recipient_id` | `UUID` | No | — | `REFERENCES users(id) ON DELETE RESTRICT` | Target notification recipient |
| `event_type` | `VARCHAR(50)` | No | — | e.g. `TASK_ASSIGNED`, `TASK_SUBMITTED` | Outbox event type |
| `dedupe_key` | `VARCHAR(255)` | No | — | Deterministic deduplication key | Unique per organization |
| `status` | `VARCHAR(20)` | No | `'pending'` | `CHECK (status IN ('pending', 'processing', 'sent', 'failed'))` | Dispatch status |
| `payload` | `JSONB` | No | `'{}'::jsonb` | Template parameters | Render parameters for SES/Push |
| `attempts` | `INTEGER` | No | `0` | `CHECK (attempts >= 0)` | Dispatch attempt count |
| `max_attempts` | `INTEGER` | No | `5` | `CHECK (max_attempts > 0)` | Maximum retry threshold |
| `last_error` | `TEXT` | Yes | `NULL` | — | Error message from failed attempt |
| `next_retry_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Scheduled retry timestamp |
| `sent_at` | `TIMESTAMPTZ` | Yes | `NULL` | — | Successful dispatch timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Enqueue timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` | — | Status update timestamp |

#### Indexes on `task_notifications`:
* `task_notifications_org_dedupe_unique`: Unique on `(org_id, dedupe_key)`
* `task_notifications_dispatch_idx`: `(status, next_retry_at)`

---

## 4. Model Architecture & Association Graph

All 5 models are defined under `src/modules/task/models/` and loaded globally into the Sequelize database registry via `MODEL_ROOTS` in `models.index.js`.

```mermaid
classDiagram
    class Organization {
        +UUID id
        +VARCHAR name
    }
    class User {
        +UUID id
        +VARCHAR identifier
    }
    class Task {
        +UUID id
        +UUID org_id
        +UUID assigner_id
        +UUID assignee_id
        +VARCHAR status
        +TIMESTAMPTZ due_date
        +BOOLEAN is_viewed
        +INTEGER version
    }
    class TaskAttachment {
        +UUID id
        +UUID task_id
        +UUID uploader_id
        +VARCHAR storage_key
        +VARCHAR attachment_context
    }
    class TaskComment {
        +UUID id
        +UUID task_id
        +UUID author_id
        +TEXT message
    }
    class TaskAuditLog {
        +UUID id
        +UUID task_id
        +UUID actor_id
        +VARCHAR action
    }
    class TaskNotification {
        +UUID id
        +UUID task_id
        +UUID recipient_id
        +VARCHAR dedupe_key
        +VARCHAR status
    }

    Organization "1" <-- "*" Task : belongsTo
    User "1" <-- "*" Task : assigner
    User "1" <-- "*" Task : assignee
    Task "1" --> "*" TaskAttachment : hasMany
    Task "1" --> "*" TaskComment : hasMany
    Task "1" --> "*" TaskAuditLog : hasMany
    Task "1" --> "*" TaskNotification : hasMany
    User "1" <-- "*" TaskAttachment : uploader
    User "1" <-- "*" TaskComment : author
    User "1" <-- "*" TaskAuditLog : actor
    User "1" <-- "*" TaskNotification : recipient
```

---

## 5. Repository Layer SPI & Programmatic Interface Contracts

The Phase 1 repository layer encapsulates all direct PostgreSQL interactions behind standardized, tenant-isolated, transaction-aware JavaScript classes.

### 5.1 `TaskRepository` (`src/modules/task/repositories/task.repository.js`)

#### 1. `create(data, options)`
* **Purpose:** Persist a newly delegated Task entity.
* **Signature:** `async create(data: Object, options?: { transaction?: Transaction }): Promise<Task>`
* **Parameters:**
  * `data` (Object, Required): Validated task attributes (`org_id`, `title`, `description`, `assigner_id`, `assignee_id`, `due_date`, etc.).
  * `options.transaction` (Transaction, Optional): Active database transaction.
* **Database Action:** `INSERT INTO tasks (...) VALUES (...) RETURNING *;`
* **Concurrency / Invariants:** Enforces `assigner_id <> assignee_id` check constraint.

#### 2. `findByIdAndOrgId(id, orgId, options)`
* **Purpose:** Retrieve a single task by ID within the caller's organization.
* **Signature:** `async findByIdAndOrgId(id: string, orgId: string, options?: { transaction?: Transaction, lock?: boolean, include?: Array, order?: Array }): Promise<Task|null>`
* **Parameters:**
  * `id` (UUID, Required): Task identifier.
  * `orgId` (UUID, Required): Tenant organization identifier.
  * `options.lock` (Boolean, Optional): If `true`, acquires a pessimistic `FOR UPDATE` row lock.
  * `options.include` (Array, Optional): Sequelize association models to eager-load.
  * `options.order` (Array, Optional): Sorting criteria.
* **Database Action:** `SELECT * FROM tasks WHERE id = :id AND org_id = :orgId AND deleted_at IS NULL;`

#### 3. `update(id, orgId, updates, options)`
* **Purpose:** Atomically update task attributes with Optimistic Concurrency Control (`D-T8`).
* **Signature:** `async update(id: string, orgId: string, updates: Object, options?: { transaction?: Transaction, expectedVersion?: number }): Promise<Task|null>`
* **Parameters:**
  * `id` (UUID, Required): Task identifier.
  * `orgId` (UUID, Required): Tenant organization identifier.
  * `updates` (Object, Required): Fields to update.
  * `options.expectedVersion` (Number, Optional): Target version revision. Automatically increments version by 1.
* **Database Action:** `UPDATE tasks SET status = :status, version = version + 1 WHERE id = :id AND org_id = :orgId AND version = :expectedVersion RETURNING *;`
* **Return Value:** Returns updated `Task` instance if matched; returns `null` if the version was stale.

#### 4. `recordFirstView(id, orgId, assigneeId, options)`
* **Purpose:** Atomically stamp non-repudiable read receipts (`D-T4`).
* **Signature:** `async recordFirstView(id: string, orgId: string, assigneeId: string, options?: { transaction?: Transaction }): Promise<boolean>`
* **Behavior:**
  1. Attempts conditional update: `UPDATE tasks SET is_viewed = true, first_viewed_at = CURRENT_TIMESTAMP, last_viewed_at = CURRENT_TIMESTAMP WHERE id = :id AND org_id = :orgId AND assignee_id = :assigneeId AND is_viewed = false;`
  2. If `count === 0` (already viewed), executes fallback: `UPDATE tasks SET last_viewed_at = CURRENT_TIMESTAMP WHERE id = :id AND org_id = :orgId AND assignee_id = :assigneeId AND is_viewed = true;`
* **Return Value:** Returns `true` if first view was stamped; returns `false` if previously viewed.

#### 5. `findAndCount(orgId, filter, pagination, options)`
* **Purpose:** Retrieve paginated tasks matching multi-attribute filters.
* **Signature:** `async findAndCount(orgId: string, filter?: Object, pagination?: { limit?: number, offset?: number, order?: Array, include?: Array }, options?: { transaction?: Transaction }): Promise<{ rows: Task[], count: number }>`
* **Filter Capabilities:** `status`, `priority`, `category`, `assigner_id`, `assignee_id`, `assignee_ids` (array), `is_viewed`, `is_overdue` (dynamic temporal clause), `search` (case-insensitive substring match).

#### 6. `softDelete(id, orgId, options)`
* **Purpose:** Soft-delete a task (`paranoid: true`).
* **Signature:** `async softDelete(id: string, orgId: string, options?: { transaction?: Transaction }): Promise<number>`

---

### 5.2 `TaskAttachmentRepository` (`src/modules/task/repositories/task_attachment.repository.js`)

* `create(data, options)`: Persists attachment metadata. Accepts nullable `task_id` for Mode A pre-creation staging.
* `findByIdAndOrgId(id, orgId, options)`: Retrieves attachment record scoped by organization.
* `findByTaskId(taskId, orgId, options)`: Retrieves all active attachments associated with a task.
* `softDelete(id, orgId, options)`: Soft-deletes attachment reference (`deleted_at = NOW()`).

---

### 5.3 `TaskCommentRepository` (`src/modules/task/repositories/task_comment.repository.js`)

* `create(data, options)`: Inserts a discussion comment or system note.
* `findByTaskId(taskId, orgId, options)`: Retrieves chronological comments eager-loading author profiles.
* `countByTaskId(taskId, orgId, options)`: Returns total comment count for task summary badges.
* `softDelete(id, orgId, options)`: Soft-deletes comment record.

---

### 5.4 `TaskAuditRepository` (`src/modules/task/repositories/task_audit.repository.js`)

* `record(data, options)` / `create(data, options)`: Appends an immutable audit log row (`updatedAt = false`, `paranoid = false`).
* `findByTaskId(taskId, orgId, pagination, options)`: Retrieves reverse-chronological audit events eager-loading actor user details (`id`, `identifier`).

---

### 5.5 `TaskNotificationRepository` (`src/modules/task/repositories/task_notification.repository.js`)

* `enqueue(data, options)` / `create(data, options)`: Atomically inserts an outbox notification. Rejects duplicates via `(org_id, dedupe_key)` unique constraint.
* `claimPendingBatches(batchSize, options)`: Claims ready notifications (`status IN ('pending', 'processing')`, `next_retry_at <= NOW()`, `attempts < max_attempts`) using non-blocking row locks:
  ```sql
  SELECT * FROM task_notifications
  WHERE status IN ('pending', 'processing')
    AND next_retry_at <= CURRENT_TIMESTAMP
    AND attempts < max_attempts
  ORDER BY created_at ASC
  LIMIT :batchSize
  FOR UPDATE SKIP LOCKED;
  ```
* `markSent(id, options)`: Sets `status = 'sent'`, `sent_at = NOW()`.
* `recordFailure(id, attempts, errorMsg, nextRetryAt, options)`: Increments `attempts`, updates `last_error`, schedules `next_retry_at`, and transitions status to `'failed'` if `attempts >= 5`.

---

## 6. Planned Endpoints Roadmap vs Implementation Status

The table below documents the full Task Assignment API surface defined in the parent architecture ([implementation_plan.md](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/public/md_task-assignment/implementation_plan.md)), cross-referencing each planned endpoint against its Phase 1 status:

| # | HTTP Method | Endpoint Route | Planned Roles | Target Phase | Phase 1 Status |
|:---:|:---:|---|---|:---:|:---:|
| **249** | `GET` | `/api/v1/tasks/me` | All Org Roles | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **250** | `GET` | `/api/v1/tasks/me/:id` | All Org Roles | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **251** | `PATCH` | `/api/v1/tasks/me/:id/status` | All Org Roles | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **252** | `POST` | `/api/v1/tasks/me/:id/submit` | All Org Roles | **Phase 3** | *Deferred to Phase 3 (Review gate & execution lifecycle)* |
| **253** | `POST` | `/api/v1/tasks/me/:id/comments` | All Org Roles | **Phase 4** | *Deferred to Phase 4 (Discussion feeds & rate limiting)* |
| **254** | `GET` | `/api/v1/tasks/me/:id/comments` | All Org Roles | **Phase 4** | *Deferred to Phase 4 (Discussion feeds & rate limiting)* |
| **255** | `POST` | `/api/v1/tasks/manager` | `manager`, `hr` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **256** | `GET` | `/api/v1/tasks/manager/assigned-by-me` | `manager`, `hr` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **257** | `GET` | `/api/v1/tasks/manager/team-tasks` | `manager`, `hr` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **258** | `GET` | `/api/v1/tasks/manager/:id` | `manager`, `hr` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **259** | `POST` | `/api/v1/tasks/manager/:id/approve` | `manager`, `hr` | **Phase 3** | *Deferred to Phase 3 (Review gate & execution lifecycle)* |
| **260** | `POST` | `/api/v1/tasks/manager/:id/reopen` | `manager`, `hr` | **Phase 3** | *Deferred to Phase 3 (Review gate & execution lifecycle)* |
| **261** | `POST` | `/api/v1/tasks/manager/:id/reassign` | `manager`, `hr` | **Phase 3** | *Deferred to Phase 3 (Review gate & execution lifecycle)* |
| **262** | `POST` | `/api/v1/tasks/manager/:id/cancel` | `manager`, `hr` | **Phase 3** | *Deferred to Phase 3 (Review gate & execution lifecycle)* |
| **263** | `PATCH` | `/api/v1/tasks/manager/:id/extend-due-date`| `manager`, `hr` | **Phase 3** | *Deferred to Phase 3 (Review gate & execution lifecycle)* |
| **264** | `POST` | `/api/v1/tasks/manager/:id/comments` | `manager`, `hr` | **Phase 4** | *Deferred to Phase 4 (Discussion feeds & rate limiting)* |
| **265** | `POST` | `/api/v1/tasks/hr` | `hr`, `admin`, `super-admin` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **266** | `GET` | `/api/v1/tasks/hr` | `hr`, `admin`, `super-admin` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **267** | `GET` | `/api/v1/tasks/hr/:id` | `hr`, `admin`, `super-admin` | **Phase 2** | *Deferred to Phase 2 (Persistence foundation only)* |
| **268** | `POST` | `/api/v1/tasks/attachments/upload-url` | All Org Roles | **Phase 3** | *Deferred to Phase 3 (S3 presigned handshake)* |
| **269** | `POST` | `/api/v1/tasks/attachments/confirm` | All Org Roles | **Phase 3** | *Deferred to Phase 3 (S3 HeadObject verification)* |
| **270** | `GET` | `/api/v1/tasks/attachments/:id/download-url`| All Org Roles | **Phase 3** | *Deferred to Phase 3 (Presigned GET BOLA guard)* |

---

## 7. Security, Concurrency & Invariant Verification

| Invariant / Mechanism | PostgreSQL & Sequelize Implementation | Verification Test |
|---|---|---|
| **Multi-Tenant Isolation (`D-T2`)** | Non-nullable `org_id` on all 5 tables with cascade delete; all repository methods require `orgId`. | `T-P1-4`, `T-P1-9` |
| **Zero Self-Assignment (`D-T3`)** | `CHECK (assigner_id <> assignee_id)` check constraint prevents circular accountability. | `T-P1-10` |
| **OCC Concurrency (`D-T8`)** | `version` integer check `WHERE id = :id AND version = :expectedVersion`. Stale updates return `null`. | `T-P1-12` |
| **Outbox Deduplication (`D-T10`)** | Unique constraint `(org_id, dedupe_key)` rejects duplicate notification inserts during transaction. | `T-P1-11` |
| **Worker De-contention (`D-T10`)** | `FOR UPDATE SKIP LOCKED` allows concurrent cron workers to claim independent pending batches. | `T-P1-5` |
| **Defensive Attachment Staging** | Nullable `task_id` permits pre-creation attachment staging without circular dependencies. | `T-P1-6`, `T-P1-13` |
| **Paranoid Soft Deletes** | Soft-deletes enabled on `tasks`, `task_attachments`, `task_comments` (`deleted_at`); append-only on audits/outbox. | `T-P1-1`, `T-P1-8` |

---

## 8. Unit & Integration Test Suite Verification

The Phase 1 foundation is continuously verified via the dedicated Node.js test runner:
```powershell
node --test tests/unit/task/task_models_and_repos.test.js
```

### Verified Assertions:
1. `T-P1-1`: Task model defines all required attributes with defaults (`operational`, `medium`, `pending`, `is_viewed = false`, `version = 1`).
2. `T-P1-2`: Task associations are correctly wired (`Organization`, `User` assigner/assignee, `attachments`, `comments`, `audit_logs`, `notifications`).
3. `T-P1-3`: TaskNotification model has outbox status validations and deduplication key attributes.
4. `T-P1-4`: TaskRepository enforces tenant `org_id` and pagination parameters.
5. `T-P1-5`: TaskNotificationRepository defines `skipLocked` batch claim query.
6. `T-P1-6`: TaskAttachment model attributes, byte size limits (10 MB), and context validations.
7. `T-P1-7`: TaskComment model attributes and associations.
8. `T-P1-8`: TaskAuditLog immutable append-only attributes (`updatedAt = false`, `paranoid = false`).
9. `T-P1-9`: Live PostgreSQL database transaction and cascade delete enforcement.
10. `T-P1-10`: Self-assignment rejection via PostgreSQL `chk_tasks_no_self_assign` check constraint.
11. `T-P1-11`: Outbox notification deduplication unique constraint rejection.
12. `T-P1-12`: Optimistic Concurrency Control rejection when updating with stale version revision.
13. `T-P1-13`: Defensive attachment staging guard for empty or unlinked task references.

**Test Run Result:** **13 passing, 0 failing (100% green).**

---

## 9. Final Coverage Audit Summary

```text
================================================================================
                    PHASE 1 API & IMPLEMENTATION COVERAGE AUDIT
================================================================================
Total Phase 1 HTTP APIs discovered:            0  (Foundation & Data Layer phase)
Total Phase 1 HTTP APIs documented:            0  (Accurately reflects code)
New HTTP APIs added in Phase 1:                0  (Public endpoints deferred to Phase 2+)
Existing HTTP APIs modified by Phase 1:        0  (Zero existing routes altered)
APIs corrected:                                0
APIs still missing:                            0

Internal Repository SPI Methods Discovered:   22
Internal Repository SPI Methods Documented:   22

Request/Input contracts verified:             22 / 22
Success response contracts verified:          22 / 22
Error handling & constraint rules verified:   22 / 22
Security & tenant isolation verified:         22 / 22
Database transaction behavior verified:       22 / 22
Side effects & dependencies verified:         22 / 22

Existing APIs reviewed for Phase 1 impact:    248 (All registered system endpoints)
Existing APIs actually changed by Phase 1:      0 (Zero existing APIs modified)
APIs incorrectly assumed as changed:            0
================================================================================
```
