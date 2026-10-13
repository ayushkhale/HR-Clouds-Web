# Phase 2 — Task Assignment Module: Core Task Delegation, Hierarchy Engine & Self-Service Views
*(Production-Grade Implementation Plan)*

> **Parent document:** [implementation_plan.md](public/md_task-assignment/implementation_plan.md) — the module's single source of truth. Every architectural and design decision below implements decisions recorded there (`D-T1` … `D-T11`) and respects the functional Source of Truth (`review/2026-10-12-for_cc_task_assignment_module_functionalities_SOT.md`). **If this plan and the parent ever disagree, the parent wins and this file must be corrected.**  
> **Predecessor:** [phase1_implementation_plan.md](public/md_task-assignment/phases/phase1_implementation_plan.md) — **COMPLETED & VERIFIED** (Database migrations `00075`, feature seeder `014`, models, repositories, and test suites active on disk). Phase 2 builds upon Phase 1 without altering its tables or schema invariants.  
> **Status:** Ready for Implementation.  
> **Depends on:** Phase 1 (`tasks`, `task_attachments`, `task_comments`, `task_audit_logs`, `task_notifications` models and repositories), Core Platform Auth & Hierarchy (`auth.middleware.js`, `require_feature.middleware.js`, `hierarchy_access.utils.js`, `if_match.utils.js`, `appError.utils.js`, `api-response.util.js`).

---

## 1. Goal & Boundary

### 1.0 Goal
Deliver the core operational workflows of the Task Assignment Module across all three organizational audiences (Self-Service, Manager, and HR):
1. **Managerial & HR Task Delegation** — Enable managers to delegate work to direct subordinates via live reporting-hierarchy resolution, and enable HR to delegate tasks organization-wide, with physical prevention of self-assignment.
2. **Self-Service Task Execution** — Enable employees to inspect delegated tasks, trigger non-repudiable read receipts on first view, and commence execution (`pending` ↔ `in_progress`).
3. **Team Oversight & Governance** — Enable managers to monitor assigned tasks across their direct reporting line, and enable HR to inspect org-wide task distribution with comprehensive filtering.

Phase 2 transitions the Task Assignment Module from passive database tables into a live, secure, multi-tenant HTTP API surface (**Endpoints #249–#251, #255–#258, and #265–#267**).

---

### 1.1 Explicitly in Scope for Phase 2

- **10 Core API Endpoints (#249–#251, #255–#258, #265–#267)**:
  - **Self-Service Audience (`/api/v1/tasks/me`)**:
    - `#249` `GET /api/v1/tasks/me` — List tasks assigned to caller with filters (`status`, `priority`, `category`, `is_viewed`, `is_overdue`) and pagination.
    - `#250` `GET /api/v1/tasks/me/:id` — Detail view with atomic, non-repudiable first-view stamping (`first_viewed_at`, `is_viewed = true`).
    - `#251` `PATCH /api/v1/tasks/me/:id/status` — State transition between `pending` and `in_progress` guarded by optimistic concurrency (`If-Match`).
  - **Managerial Audience (`/api/v1/tasks/manager`)**:
    - `#255` `POST /api/v1/tasks/manager` — Delegate task to a direct subordinate (validating `HierarchyAccess.getAccessibleUserIds()`) with transactional outbox queuing and audit logging.
    - `#256` `GET /api/v1/tasks/manager/assigned-by-me` — List tasks delegated by the caller (`assigner_id = me`).
    - `#257` `GET /api/v1/tasks/manager/team-tasks` — List tasks across all accessible subordinates.
    - `#258` `GET /api/v1/tasks/manager/:id` — Detail view for subordinate tasks without mutating `first_viewed_at`.
  - **HR Governance Audience (`/api/v1/tasks/hr`)**:
    - `#265` `POST /api/v1/tasks/hr` — Org-wide task assignment to any active user in the tenant with audit logging and outbox queuing.
    - `#266` `GET /api/v1/tasks/hr` — Org-wide task registry with multi-parameter filtering (`department_id`, `category`, `assigner_id`, `assignee_id`, `status`, `is_overdue`).
    - `#267` `GET /api/v1/tasks/hr/:id` — Org-wide task detail view including complete audit history and notification history.
- **Service Layer (`src/modules/task/services/task.service.js`)**:
  - Encapsulates hierarchy validation, zero-self-assignment invariants, transactional creation, audit logging, and transactional outbox event queuing.
- **Response Projectors & View Models (`src/modules/task/utils/task_formatter.utils.js`)**:
  - Dynamically projects `is_overdue: boolean` on all read models without persisting stale state.
- **Joi Validation Schemas**:
  - `user_task.validator.js`, `manager_task.validator.js`, `hr_task.validator.js`.
- **Route Mounting & Feature Gating**:
  - `src/modules/task/task.index.js` mounted in `src/app.js` and gated by `requireFeature('tasks.access')`.
- **Unit & Integration Test Suite (`tests/unit/task/task_phase2_service_and_api.test.js`)**:
  - Coverage for hierarchy enforcement, self-assignment rejection, read receipt stamping, pagination, and optimistic concurrency.

---

### 1.2 Explicitly NOT in Scope (Deferred to Later Phases)

| Capability / Responsibility | Owning Phase | Rationale |
|---|---|---|
| Deliverable Submission (`#252` `POST /tasks/me/:id/submit`) | **Phase 3** | Part of the full execution lifecycle review gate. |
| Assigner Approval (`#259` `POST /tasks/manager/:id/approve`) | **Phase 3** | Review gate acceptance state transition (`status → completed`). |
| Reopening & Rework Feedback (`#260` `POST /tasks/manager/:id/reopen`) | **Phase 3** | Rework counter increment and system feedback generation. |
| Reassignment (`#261` `POST /tasks/manager/:id/reassign`) | **Phase 3** | Involves resetting read receipts, reassignment counters, and deadline extensions for overdue tasks. |
| Cancellation (`#262` `POST /tasks/manager/:id/cancel`) | **Phase 3** | Terminal state transition with mandatory cancellation reasons. |
| Due Date Extension (`#263` `PATCH /tasks/manager/:id/extend-due-date`) | **Phase 3** | Deadline modification with extension counters and audit trails. |
| Presigned S3 Upload Handshake (`#268`, `#269`, `#270`) | **Phase 3** | Mode A staging tokens, Mode B S3 verification, and download URL BOLA checks. |
| Discussion Feed Endpoints (`#253`, `#254`, `#264`) & Rate Limiter | **Phase 4** | Redis sliding window comment rate limiting and message threading. |
| Outbox Worker Dispatch Cron & Sweeper | **Phase 5** | `task_notification_dispatch.cron.js`, `task_overdue_sweeper.cron.js`, and AWS SES templates. |

---

## 2. Pre-Flight Checks & Codebase Grounding

Every item below represents a verified condition in the active codebase:

1. **Phase 1 Persistence & Migration Status (CONFIRMED ZERO PENDING):**
   - Exactly 76 migration files exist in the repository (`00000` through `00075-create-task-assignment-module.js`).
   - Querying `SequelizeMeta` confirms all 76 migrations are executed (`count = 76`, `max_migration = 00075-create-task-assignment-module.js`).
   - **There are ZERO pending migrations for Phase 2.** The complete 5-table schema (`tasks`, `task_attachments`, `task_comments`, `task_audit_logs`, `task_notifications`) is active in PostgreSQL.
2. **Feature Gate & Entitlement Active:**
   - Seeder `014-seed-task-feature.js` seeded `tasks.access` into `features` and mapped it across all subscription plans in `plan_features` (5 active bindings verified).
   - `requireFeature('tasks.access')` from `src/common/middlewares/require_feature.middleware.js` is verified and operational.
3. **Model Autoloading Verified:**
   - `modules/task/models` is registered in `MODEL_ROOTS` in `models.index.js`.
   - Models `Task`, `TaskAttachment`, `TaskComment`, `TaskAuditLog`, and `TaskNotification` are globally accessible.
4. **Hierarchy Resolution Utility:**
   - `src/common/utilities/hierarchy_access.utils.js` exposes `getAccessibleUserIds(orgId, requesterUser)`.
   - Returns array of subordinate user UUIDs for `role === 'manager'`, or `null` for HR/Admin global scope.
   - Automatically strips any subordinate holding `GLOBAL_APPROVER_ROLES` (`['hr', 'admin', 'super-admin']`) as defense-in-depth.
5. **Optimistic Concurrency Control Utility:**
   - `src/common/utilities/if_match.utils.js` exposes `assertUpdatedAtMatches(entity, ifMatchHeader)`.
   - Compares ISO 8601 strings or integer versions, throwing `412 PRECONDITION_FAILED` on mismatch.
6. **Idempotency Utility Pattern:**
   - Follows the Redis replay guard pattern (`claim`, `store`, `read`) with 120-second TTL (`idemp:tasks:{orgId}:{key}`) matching `billing/utils/idempotency.utils.js`.
7. **Express 5 Getter-Only `req.query` Invariant (EC-T13):**
   - Express 5 makes `req.query` a getter. In-line route validator middlewares that reassign `req.query` throw runtime exceptions.
   - All query parameter parsing and validation must occur **inside controllers** using `validateOrThrow(schema, req.query)`.
8. **Role Hierarchy Standards:**
   - Global approver roles: `['hr', 'admin', 'super-admin']`.
   - Delegation authority: `manager` (direct subordinates only), `hr`/`admin`/`super-admin` (org-wide), `employee` (no delegation authority).

---

## 3. Scope Reconstruction: Phase 1 (Completed) vs. Phase 2 (Remaining)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SCOPE RECONSTRUCTION MATRIX                               │
├───────────────────────────────────────┬────────────┬───────────────────────────────────┤
│ Deliverable                           │ Phase      │ Status & Architectural Notes      │
├───────────────────────────────────────┼────────────┼───────────────────────────────────┤
│ Database Migration 00075              │ Phase 1    │ COMPLETED & VERIFIED ON DISK      │
│ Feature Flag Seeder 014 (tasks.access)│ Phase 1    │ COMPLETED & VERIFIED ON DISK      │
│ Sequelize Models (5 tables)           │ Phase 1    │ COMPLETED & VERIFIED ON DISK      │
│ Repositories (5 repositories)         │ Phase 1    │ COMPLETED & VERIFIED ON DISK      │
│ Autoload Wiring in models.index.js    │ Phase 1    │ COMPLETED & VERIFIED ON DISK      │
│                                       │            │                                   │
│ Route Mounting in src/app.js          │ Phase 2    │ NEW — require task.index(app)     │
│ Module Router src/modules/task/       │ Phase 2    │ NEW — task.index.js + auth gates  │
│ Task Service (task.service.js)        │ Phase 2    │ NEW — hierarchy, creation, lists  │
│ Response Formatter (task_formatter)   │ Phase 2    │ NEW — dynamic is_overdue project  │
│ Self-Service APIs (#249, #250, #251)  │ Phase 2    │ NEW — me list, detail, status     │
│ Manager APIs (#255, #256, #257, #258) │ Phase 2    │ NEW — delegation, team oversight  │
│ HR Governance APIs (#265, #266, #267) │ Phase 2    │ NEW — org-wide delegation & list  │
│ Joi Validators (user, manager, hr)    │ Phase 2    │ NEW — Express 5 safe controller   │
│ Phase 2 Unit & API Test Suite         │ Phase 2    │ NEW — node:test suite             │
└───────────────────────────────────────┴────────────┴───────────────────────────────────┘
```

---

## 4. Directory Structure & File Manifest

### 4.1 New Files Created in Phase 2

```text
src/
└── modules/
    └── task/
        ├── task.index.js                                   ← Main router mounting user, manager, hr routes
        ├── controllers/
        │   ├── user_task.controller.js                     ← Handlers for #249, #250, #251
        │   ├── manager_task.controller.js                  ← Handlers for #255, #256, #257, #258
        │   └── hr_task.controller.js                       ← Handlers for #265, #266, #267
        ├── routes/
        │   ├── user_task.routes.js                         ← Express router for /api/v1/tasks/me
        │   ├── manager_task.routes.js                      ← Express router for /api/v1/tasks/manager
        │   └── hr_task.routes.js                           ← Express router for /api/v1/tasks/hr
        ├── services/
        │   └── task.service.js                             ← Core business logic, hierarchy validation, transactions
        ├── validators/
        │   ├── user_task.validator.js                      ← Joi schemas for query filters & status changes
        │   ├── manager_task.validator.js                   ← Joi schemas for manager delegation & team filters
        │   └── hr_task.validator.js                        ← Joi schemas for HR org-wide delegation & registry filters
        └── utils/
            └── task_formatter.utils.js                     ← Pure projection helper: is_overdue, DTO sanitization

tests/
└── unit/
    └── task/
        └── task_phase2_service_and_api.test.js             ← Unit & API integration test suite
```

### 4.2 Existing Files Modified in Phase 2

```text
src/
└── app.js                                                  ← Mount require('./modules/task/task.index')(app)
```

---

## 5. API Surface & Endpoint Registry Specifications

All endpoints require active authentication (`authenticate`), active tenant status (`requireActiveOrg`), and the subscription entitlement check (`requireFeature('tasks.access')`).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 2 API ENDPOINT ROUTING                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   CLIENT REQUEST                                                                       │
│         │                                                                              │
│         ▼                                                                              │
│   [authenticate] ──► [requireActiveOrg] ──► [requireFeature('tasks.access')]          │
│                                                   │                                    │
│         ┌─────────────────────────────────────────┼────────────────────────────────┐   │
│         ▼                                         ▼                                ▼   │
│   /api/v1/tasks/me                        /api/v1/tasks/manager           /api/v1/tasks/hr     │
│   (All Org Roles)                         (manager, hr, admin)            (hr, admin, super)   │
│   ├── #249 GET   /                        ├── #255 POST /                 ├── #265 POST /      │
│   ├── #250 GET   /:id                     ├── #256 GET  /assigned-by-me   ├── #266 GET  /      │
│   └── #251 PATCH /:id/status              ├── #257 GET  /team-tasks       └── #267 GET  /:id   │
│                                           └── #258 GET  /:id                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Self-Service Audience (`/api/v1/tasks/me`)

#### 1. `#249` `GET /api/v1/tasks/me`
- **Purpose:** Retrieve paginated list of tasks assigned to the caller (`assignee_id = req.user.id`).
- **Authorization:** Any authenticated organization member (`employee`, `manager`, `hr`, `admin`, `super-admin`).
- **Query Parameters (Validated via `user_task.validator.js` inside controller):**
  - `status`: Optional enum (`pending`, `in_progress`, `in_review`, `reopened`, `completed`, `cancelled`).
  - `priority`: Optional enum (`low`, `medium`, `high`, `urgent`).
  - `category`: Optional enum (`operational`, `compliance`, `onboarding`, `administrative`, `general`).
  - `is_viewed`: Optional boolean (`true` / `false`).
  - `is_overdue`: Optional boolean (`true` / `false`).
  - `search`: Optional string (min 1, max 100 chars; matches title/description).
  - `limit`: Optional integer (1–100, default 20).
  - `page`: Optional integer (min 1, default 1).
- **Service Logic:** Calls `taskService.getMyTasks(orgId, userId, query)`. Projects `is_overdue` dynamically.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Tasks retrieved successfully",
    "data": {
      "tasks": [
        {
          "id": "UUID",
          "title": "Complete Q4 Compliance Review",
          "category": "compliance",
          "priority": "high",
          "status": "pending",
          "due_date": "2026-10-25T18:30:00.000Z",
          "is_overdue": false,
          "is_viewed": false,
          "first_viewed_at": null,
          "assigner": { "id": "UUID", "name": "Jane Manager", "email": "jane@company.com" },
          "created_at": "2026-10-12T10:00:00.000Z"
        }
      ],
      "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
    }
  }
  ```

---

#### 2. `#250` `GET /api/v1/tasks/me/:id`
- **Purpose:** Retrieve complete details of a task assigned to the caller.
- **Authorization:** Caller must be the designated assignee (`assignee_id === req.user.id`). Accessing a task assigned to another user returns `404 TASK_NOT_FOUND` (uniform denial preventing enumeration).
- **Side Effect (D-T4):** If `is_viewed === false`, atomically updates `is_viewed = true`, `first_viewed_at = NOW()`, `last_viewed_at = NOW()`, and writes audit log entry `action: 'VIEWED'`. If already viewed, updates `last_viewed_at = NOW()`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Task details retrieved successfully",
    "data": {
      "id": "UUID",
      "title": "Complete Q4 Compliance Review",
      "category": "compliance",
      "description": "Ensure all compliance files are checked against standard ISO 27001 checklists.",
      "priority": "high",
      "status": "pending",
      "due_date": "2026-10-25T18:30:00.000Z",
      "original_due_date": "2026-10-25T18:30:00.000Z",
      "extension_count": 0,
      "is_overdue": false,
      "is_viewed": true,
      "first_viewed_at": "2026-10-12T15:30:00.000Z",
      "last_viewed_at": "2026-10-12T15:30:00.000Z",
      "external_links": [{ "label": "Compliance Portal", "url": "https://compliance.internal" }],
      "assigner": { "id": "UUID", "name": "Jane Manager", "email": "jane@company.com" },
      "attachments": [],
      "comments_count": 0,
      "version": 1,
      "created_at": "2026-10-12T10:00:00.000Z",
      "updated_at": "2026-10-12T15:30:00.000Z"
    }
  }
  ```

---

#### 3. `#251` `PATCH /api/v1/tasks/me/:id/status`
- **Purpose:** Transition task execution status between `pending` and `in_progress`.
- **Authorization:** Caller must be the designated assignee (`assignee_id === req.user.id`).
- **Headers:** `If-Match` header required (matches current `updated_at` ISO string or integer `version`).
- **Request Body (Validated via `user_task.validator.js`):**
  ```json
  {
    "status": "in_progress"
  }
  ```
  *(Permitted values in Phase 2: `'pending'` or `'in_progress'`. Transitioning to `'in_review'` is governed by Phase 3 submission endpoint #252).*
- **Business Invariant:**
  - Cannot transition if task is in terminal status (`completed`, `cancelled`) → `409 TASK_TERMINATED`.
  - If current status is `in_review`, assignee cannot arbitrarily set back to `in_progress` without rework flow → `409 INVALID_STATUS_TRANSITION`.
- **Concurrency & Audit:** Evaluates `If-Match`. Inside transaction: updates status, increments version, and records `TaskAuditLog` with `action: 'STATUS_CHANGED'`, `from_status`, `to_status`.
- **Response `200 OK`:** Returns updated task DTO.

---

### 5.2 Managerial Audience (`/api/v1/tasks/manager`)

#### 1. `#255` `POST /api/v1/tasks/manager`
- **Purpose:** Delegate a task to a direct subordinate.
- **Authorization:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
- **Delegation Rules (D-T2, D-T3):**
  - Assigner cannot assign to self (`assignee_id !== req.user.id`) → `400 SELF_ASSIGNMENT_NOT_ALLOWED`.
  - For `manager`: `assignee_id` must be present in `HierarchyAccess.getAccessibleUserIds(orgId, req.user)` → `403 CANNOT_ASSIGN_OUTSIDE_HIERARCHY`.
  - Assignee must belong to the same organization and have active profile → `404 ASSIGNEE_NOT_FOUND`.
- **Request Body (Validated via `manager_task.validator.js`):**
  ```json
  {
    "title": "Draft Onboarding Handbook",
    "description": "Prepare a 10-page draft for Q1 new hires.",
    "category": "onboarding",
    "priority": "high",
    "due_date": "2026-10-30T18:30:00.000Z",
    "assignee_id": "UUID",
    "external_links": [
      { "label": "Guidelines", "url": "https://wiki.company.com/guidelines" }
    ],
    "attachment_tokens": []
  }
  ```
- **Validation Rules:**
  - `title`: 1–200 characters, trimmed.
  - `description`: 1–5,000 characters.
  - `category`: enum (`operational`, `compliance`, `onboarding`, `administrative`, `general`), default `'operational'`.
  - `priority`: enum (`low`, `medium`, `high`, `urgent`), default `'medium'`.
  - `due_date`: ISO 8601 UTC string; must be at least **15 minutes in the future** (`due_date >= dayjs().utc().add(15, 'minute')`).
  - `external_links`: Array of max 10 objects `{ label, url }`; `url` must strictly start with `https://`.
  - `attachment_tokens`: Optional array of signed Mode A tokens (processed if provided).
- **Transactional Execution:** Inside `db.sequelize.transaction()`:
  1. Insert `tasks` row with `status: 'pending'`, `original_due_date = due_date`, `is_viewed = false`, `assigner_id = req.user.id`.
  2. Insert `task_audit_logs` row (`action: 'CREATED'`).
  3. Enqueue transactional outbox notification in `task_notifications` (`event_type: 'TASK_ASSIGNED'`, `dedupe_key: task_assigned:{task.id}:{assignee_id}`).
  4. (If Mode A `attachment_tokens` present): Bind staged attachments.
- **Response `201 Created`:** Returns created task DTO.

---

#### 2. `#256` `GET /api/v1/tasks/manager/assigned-by-me`
- **Purpose:** List tasks created/delegated by the caller (`assigner_id = req.user.id`).
- **Authorization:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
- **Query Parameters:** `status`, `priority`, `category`, `assignee_id`, `is_overdue`, `search`, `limit`, `page`.
- **Response `200 OK`:** Paginated tasks list with assignee details.

---

#### 3. `#257` `GET /api/v1/tasks/manager/team-tasks`
- **Purpose:** List all tasks assigned to the manager's reporting subordinates (regardless of who created them, ensuring full managerial visibility over subordinate workload).
- **Authorization:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
- **Hierarchy Scoping:**
  - Fetches `accessibleUserIds = await hierarchyAccess.getAccessibleUserIds(orgId, req.user)`.
  - If manager has zero subordinates, returns empty list immediately without hitting DB.
  - Queries `tasks` where `assignee_id IN (:accessibleUserIds)`.
- **Query Parameters:** `subordinate_id` (must be within `accessibleUserIds`), `status`, `priority`, `category`, `is_overdue`, `limit`, `page`.
- **Response `200 OK`:** Paginated list of team tasks.

---

#### 4. `#258` `GET /api/v1/tasks/manager/:id`
- **Purpose:** Retrieve task detail for a subordinate's task or a task assigned by the caller.
- **Authorization:** Caller must either be the task's `assigner_id` OR the `assignee_id` must be in the caller's `accessibleUserIds`.
- **Side Effect (D-T4):** Does **NOT** alter `is_viewed` or `first_viewed_at`.
- **Response `200 OK`:** Complete task details including attachments and recent comment counts.

---

### 5.3 HR Governance Audience (`/api/v1/tasks/hr`)

#### 1. `#265` `POST /api/v1/tasks/hr`
- **Purpose:** Organization-wide task delegation to any active employee or manager.
- **Authorization:** `authorize(['hr', 'admin', 'super-admin'])`.
- **Business Rules:**
  - May assign to any active user in the tenant.
  - Zero-self-assignment check enforced: `assignee_id !== req.user.id` → `400 SELF_ASSIGNMENT_NOT_ALLOWED`.
- **Transactional Execution:** Identical transactional guarantees to `#255` (task insert, audit log insert, outbox notification enqueue).
- **Response `201 Created`:** Created task DTO.

---

#### 2. `#266` `GET /api/v1/tasks/hr`
- **Purpose:** Org-wide task registry and governance oversight.
- **Authorization:** `authorize(['hr', 'admin', 'super-admin'])`.
- **Query Parameters:**
  - `department_id`: Optional UUID filter (filters tasks where assignee belongs to the department).
  - `category`, `priority`, `status`, `assigner_id`, `assignee_id`, `is_overdue`, `search`, `limit`, `page`.
- **Department Filter Resolution:**
  - When `department_id` is supplied, `task.service.js` resolves it by querying `EmployeeProfile.findAll({ where: { department_id, org_id: orgId }, attributes: ['user_id'] })`.
  - The extracted user UUIDs are passed into `taskRepository.findAndCount(orgId, { ...filters, assignee_ids: userIds })`.
  - If no employees belong to the department, returns an empty result set `{ tasks: [], pagination: { total: 0, ... } }` immediately without scanning the tasks table.
- **Response `200 OK`:** Paginated list of all organization tasks.

---

#### 3. `#267` `GET /api/v1/tasks/hr/:id`
- **Purpose:** Comprehensive task audit view for HR administrators.
- **Authorization:** `authorize(['hr', 'admin', 'super-admin'])`.
- **Side Effect:** Read-only inspection; does **NOT** alter `first_viewed_at`.
- **Data Payload:** Includes task details, assigner, assignee, full `task_audit_logs` history, and `task_notifications` outbox dispatch logs.
- **Response `200 OK`:** Complete task governance DTO.

---

## 6. Joi Validation Schemas Specification

All schemas reside in `src/modules/task/validators/` and conform to Express 5 requirements (executed via `validateOrThrow` inside controllers).

### 6.1 `user_task.validator.js`
```javascript
'use strict'

const Joi = require('joi')

const listMyTasksQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  category: Joi.string().valid('operational', 'compliance', 'onboarding', 'administrative', 'general').optional(),
  is_viewed: Joi.boolean().optional(),
  is_overdue: Joi.boolean().optional(),
  search: Joi.string().trim().min(1).max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
})

const updateTaskStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'in_progress').required()
})

module.exports = {
  listMyTasksQuerySchema,
  updateTaskStatusSchema
}
```

### 6.2 `manager_task.validator.js`
```javascript
'use strict'

const Joi = require('joi')

const externalLinkSchema = Joi.object({
  label: Joi.string().trim().min(1).max(100).required(),
  url: Joi.string().uri({ scheme: ['https'] }).max(1000).required()
})

const createManagerTaskSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().min(1).max(5000).required(),
  category: Joi.string().valid('operational', 'compliance', 'onboarding', 'administrative', 'general').default('operational'),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  due_date: Joi.date().iso().required(),
  assignee_id: Joi.string().uuid().required(),
  external_links: Joi.array().items(externalLinkSchema).max(10).default([]),
  attachment_tokens: Joi.array().items(Joi.string().jwt()).max(10).default([])
})

const listTeamTasksQuerySchema = Joi.object({
  subordinate_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  category: Joi.string().valid('operational', 'compliance', 'onboarding', 'administrative', 'general').optional(),
  is_overdue: Joi.boolean().optional(),
  search: Joi.string().trim().min(1).max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
})

const listAssignedByMeQuerySchema = Joi.object({
  assignee_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  category: Joi.string().valid('operational', 'compliance', 'onboarding', 'administrative', 'general').optional(),
  is_overdue: Joi.boolean().optional(),
  search: Joi.string().trim().min(1).max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
})

module.exports = {
  createManagerTaskSchema,
  listTeamTasksQuerySchema,
  listAssignedByMeQuerySchema
}
```

### 6.3 `hr_task.validator.js`
```javascript
'use strict'

const Joi = require('joi')
const { createManagerTaskSchema } = require('./manager_task.validator')

const createHrTaskSchema = createManagerTaskSchema

const listHrTasksQuerySchema = Joi.object({
  department_id: Joi.string().uuid().optional(),
  assigner_id: Joi.string().uuid().optional(),
  assignee_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'in_progress', 'in_review', 'reopened', 'completed', 'cancelled').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  category: Joi.string().valid('operational', 'compliance', 'onboarding', 'administrative', 'general').optional(),
  is_overdue: Joi.boolean().optional(),
  search: Joi.string().trim().min(1).max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
})

module.exports = {
  createHrTaskSchema,
  listHrTasksQuerySchema
}
```

---

## 7. Service Layer Architecture (`task.service.js`)

`src/modules/task/services/task.service.js` coordinates multi-table operations, business validation, and authorization checks.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TASK SERVICE METHOD CONTRACT                    │
├────────────────────────────────────────────────────────────────────────┤
│  DELEGATION & MUTATIONS:                                               │
│  • createTask(orgId, requesterUser, payload, { idempotencyKey })       │
│    - Idempotency guard: checks Redis key idemp:tasks:{orgId}:{key}     │
│    - Asserts requesterUser.id !== payload.assignee_id (D-T3)          │
│    - Asserts due_date >= NOW() + 15m (EC-T6)                           │
│    - Hierarchy Check:                                                  │
│      * If requesterUser.role === 'manager':                            │
│        - calls HierarchyAccess.getAccessibleUserIds(orgId, user)       │
│        - rejects if assignee_id not in accessibleIds (403 CANNOT_ASSIGN)│
│        - rejects if assignee holds GLOBAL_APPROVER_ROLES (403 FORBIDDEN)│
│      * If HR/Admin: validates assignee is active in org (404 ASSIGNEE) │
│    - Mode A attachment_tokens: accepts array (default []); full token  │
│      handshake & S3 verification deferred to Phase 3                   │
│    - Transaction: inserts Task + TaskAuditLog + TaskNotification       │
│      (dedupeKey: task_assigned:{task.id}:{assignee_id})                │
│    - Stores finished response in Redis if idempotencyKey supplied      │
│                                                                        │
│  • updateTaskStatus(orgId, taskId, userId, targetStatus, ifMatchHeader)│
│    - Asserts caller === task.assignee_id (404 TASK_NOT_FOUND)          │
│    - Validates targetStatus in ['pending', 'in_progress']               │
│    - Evaluates If-Match against task.updated_at (assertUpdatedAtMatch)│
│    - Rejects if terminal status ('completed', 'cancelled') (409)      │
│    - Updates status, increments version, logs TaskAuditLog             │
│                                                                        │
│  READ OPERATIONS & PROJECTIONS:                                        │
│  • getMyTasks(orgId, userId, query)                                    │
│    - Queries tasks where assignee_id = userId + query filters          │
│    - Includes assigner with profile; projects dynamic is_overdue flag  │
│                                                                        │
│  • getMyTaskDetail(orgId, taskId, userId)                              │
│    - Fetches task with assigner profile, attachments, comment counts   │
│    - Executes recordFirstView (atomic read receipt D-T4)               │
│                                                                        │
│  • getAssignedByMe(orgId, userId, query)                               │
│    - Queries tasks where assigner_id = userId; includes assignee       │
│                                                                        │
│  • getTeamTasks(orgId, requesterUser, query)                           │
│    - Resolves accessibleUserIds via HierarchyAccess                    │
│    - Queries tasks where assignee_id IN (accessibleUserIds)            │
│                                                                        │
│  • getManagerTaskDetail(orgId, taskId, requesterUser)                  │
│    - Asserts caller is assigner OR manages assignee (403 FORBIDDEN)    │
│    - Pure read-only inspection (zero mutation of first_viewed_at)      │
│                                                                        │
│  • getHrTasks(orgId, query)                                            │
│    - Resolves department_id via EmployeeProfile to assignee_ids        │
│    - Queries org-wide tasks with full multi-attribute filters          │
│                                                                        │
│  • getHrTaskDetail(orgId, taskId)                                      │
│    - Complete governance read model + audits + notification logs       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. View Model & Response Projection (`task_formatter.utils.js`)

`src/modules/task/utils/task_formatter.utils.js` provides pure projection utilities:

```javascript
'use strict'

const dayjs = require('dayjs')

/**
 * Evaluates whether a task is temporally overdue without persisting stale state (D-T5).
 * A task is overdue if due_date < NOW() AND status NOT IN ('completed', 'cancelled').
 */
function isTaskOverdue(task) {
  if (!task.due_date) return false
  if (['completed', 'cancelled'].includes(task.status)) return false
  return dayjs(task.due_date).isBefore(dayjs())
}

/**
 * Formats a user entity (with attached profile) into a clean presentation summary.
 */
function formatUserSummary(user) {
  if (!user) return null
  const plain = user.get ? user.get({ plain: true }) : user
  const profile = plain.profile || {}
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  return {
    id: plain.id,
    name: fullName || profile.display_name || plain.identifier || 'Unknown User',
    email: plain.identifier || null
  }
}

/**
 * Formats a single task entity into a clean client DTO.
 */
function formatTaskDto(task) {
  const plain = task.get ? task.get({ plain: true }) : task
  const dto = {
    ...plain,
    is_overdue: isTaskOverdue(plain)
  }
  if (plain.assigner) {
    dto.assigner = formatUserSummary(plain.assigner)
  }
  if (plain.assignee) {
    dto.assignee = formatUserSummary(plain.assignee)
  }
  return dto
}

/**
 * Formats a paginated repository result into an API envelope.
 */
function formatPaginatedTasks(result, page, limit) {
  const total = result.count
  const totalPages = Math.ceil(total / limit) || 1
  return {
    tasks: result.rows.map(formatTaskDto),
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages
    }
  }
}

module.exports = {
  isTaskOverdue,
  formatUserSummary,
  formatTaskDto,
  formatPaginatedTasks
}
```

---

## 9. Component Traceability Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           PHASE 2 TRACEABILITY MATRIX                                                  │
├──────────────────┬─────────────────┬──────────────────────┬─────────────┬─────────────────────┬────────────────────────┤
│ Feature / API    │ Dependencies    │ Database Impact      │ Validation  │ Authorization /     │ Acceptance Criteria    │
│                  │                 │                      │             │ Failure Mode        │                        │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 1. #249 List My  │ TaskRepository, │ SELECT tasks with    │ Status,     │ Authenticated Org   │ Returns tasks where    │
│    Tasks (GET)   │ formatPaginated │ compound index on    │ priority,   │ Member; 401 if un-  │ assignee_id = me;      │
│                  │ Tasks           │ (org_id, assignee)   │ overdue     │ authenticated       │ projects is_overdue    │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 2. #250 Get My   │ TaskRepository. │ SELECT + conditional │ UUID param; │ Caller MUST be      │ First view stamps      │
│    Task (GET)    │ recordFirstView │ UPDATE on is_viewed  │ 404 if soft-│ assignee_id;        │ first_viewed_at;       │
│                  │                 │ (D-T4)               │ deleted     │ 404 if another user │ repeated views touch   │
│                  │                 │                      │             │ (uniform denial)    │ only last_viewed_at    │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 3. #251 Update   │ assertUpdatedAt │ UPDATE tasks status, │ 'pending' / │ Assignee only;      │ 412 on stale If-Match; │
│    Status (PATCH)│ Matches, Repo,  │ version + 1;         │ 'in_progress│ 409 if terminated;  │ 409 if invalid state;  │
│                  │ AuditRepository │ INSERT audit_log     │ only        │ 412 PRECONDITION    │ audit log recorded     │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 4. #255 Delegate │ HierarchyAccess,│ Atomic transaction:  │ Title, desc,│ manager / hr;       │ 403 if outside team;   │
│    Manager Task  │ TaskRepo, Audit,│ INSERT tasks + audit │ due_date >= │ 403 if outside sub- │ 400 if self-assign;    │
│    (POST)        │ NotificationRepo│ log + outbox queue   │ NOW()+15m   │ ordinates; 400 self │ 201 + outbox enqueued  │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 5. #256 Assigned │ TaskRepository. │ SELECT tasks with    │ Pagination, │ Assigner only       │ Returns tasks where    │
│    By Me (GET)   │ findAndCount    │ (org_id, assigner)   │ filters     │ (`assigner_id = me`)│ assigner_id = me       │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 6. #257 Team     │ HierarchyAccess,│ SELECT tasks WHERE   │ Pagination, │ Manager / HR;       │ Lists tasks for all    │
│    Tasks (GET)   │ TaskRepository  │ assignee_id IN       │ sub-id      │ 403 if sub-id not   │ subordinates; empty if │
│                  │                 │ (accessibleUserIds)  │             │ in hierarchy        │ zero subordinates      │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 7. #258 Manager  │ HierarchyAccess,│ Read-only SELECT     │ UUID param  │ Must be assigner OR │ Returns details;       │
│    Detail (GET)  │ TaskRepository  │                      │             │ manage assignee;    │ ZERO mutation of       │
│                  │                 │                      │             │ 403 forbidden       │ first_viewed_at        │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 8. #265 Delegate │ TaskRepository, │ Atomic transaction:  │ Title, desc,│ hr, admin, super;   │ 400 if self-assign;    │
│    HR Task (POST)│ AuditRepo,      │ INSERT tasks + audit │ due_date,   │ 404 if user not in  │ 201 + outbox enqueued  │
│                  │ NotificationRepo│ log + outbox queue   │ assignee    │ org; 400 self       │ org-wide               │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 9. #266 HR Org   │ TaskRepository, │ SELECT org-wide tasks│ Department, │ hr, admin, super    │ Paginated list across  │
│    Registry(GET) │ UserRole join   │ with filters         │ filters     │ only                │ all tenant employees   │
├──────────────────┼─────────────────┼──────────────────────┼─────────────┼─────────────────────┼────────────────────────┤
│ 10.#267 HR Org   │ TaskRepository, │ SELECT task + eager  │ UUID param  │ hr, admin, super    │ Complete governance    │
│    Detail (GET)  │ Audit, Notif    │ audits + outbox      │             │ only                │ read model; read-only  │
└──────────────────┴─────────────────┴──────────────────────┴─────────────┴─────────────────────┴────────────────────────┘
```

---

## 10. Concurrency, Locking & Defensive Engineering Register

| Ref # | Failure / Concurrency Scenario | Phase 2 Defensive Implementation |
|---|---|---|
| **EC-T1** | **Manager Department Transfer Mid-Task** | Hierarchy is evaluated dynamically via `HierarchyAccess.getAccessibleUserIds(orgId, requesterUser)`. A newly assigned manager automatically inherits team tasks for employees transferring under them. |
| **EC-T2** | **Assignee Inactive / Soft-Deleted** | Before creating a task, service verifies `UserRole.is_active === true` and `deleted_at IS NULL`. Inactive users return `404 ASSIGNEE_NOT_FOUND`. |
| **EC-T3** | **Assigner Departure** | If assigner leaves, tasks are not orphaned; employees can still access via `/me`, and HR can view/manage via `/hr`. |
| **EC-T4** | **Concurrent Status Collisions** | Enforces `If-Match` header on `PATCH /me/:id/status`. Stale tokens trigger `412 PRECONDITION_FAILED` via `assertUpdatedAtMatches`. |
| **EC-T5** | **Double-Click Creation Submissions** | Deduplicated via outbox unique index `(org_id, dedupe_key)`. Double submissions are rejected safely by database transaction rollback. |
| **EC-T6** | **Past Due Date Submission** | Joi validator and service reject due dates that are not at least 15 minutes into the future (`400 INVALID_DUE_DATE`). |
| **EC-T13**| **Express 5 Getter-Only `req.query` Crash** | Query validation occurs strictly inside controllers via `validateOrThrow(schema, req.query)`. No route-level query mutations. |
| **EC-T16**| **Cross-Tenant IDOR Attempt** | All service and repository lookups enforce `org_id: req.user.orgId`. Cross-tenant requests return `404 TASK_NOT_FOUND` (uniform denial). |
| **EC-T17**| **Timezone Offset Ambiguity** | All due dates are ingested in ISO 8601 UTC and persisted as `TIMESTAMPTZ`. |
| **EC-T18**| **Soft-Deleted Task Access** | Repositories inherit `paranoid: true`. Requests targeting soft-deleted tasks return `404 TASK_NOT_FOUND`. |
| **EC-T23**| **Repository `findAndCount` `Op.or` Collision** | When filtering by both `is_overdue = false` and `search` query, grouping clauses into `Op.and` prevents the search condition from overwriting the overdue condition. Verified in `task.repository.js`. |
| **EC-T24**| **Subordinate with Global Approver Role Defense** | A manager can never delegate a task to an employee who holds `hr`, `admin`, or `super-admin` role, even if listed in reporting mappings. Filtered by `HierarchyAccess` and asserted in `task.service.js` with `403 FORBIDDEN`. |

---

## 11. Implementation Sequence & Execution Order

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PHASE 2 IMPLEMENTATION SEQUENCE                      │
├────────────────────────────────────────────────────────────────────────┤
│  STEP 1: View Model & Utilities                                        │
│  Create src/modules/task/utils/task_formatter.utils.js                 │
│  Create src/modules/task/utils/task_idempotency.utils.js               │
│                                                                        │
│  STEP 2: Joi Validation Schemas                                        │
│  Create src/modules/task/validators/user_task.validator.js             │
│  Create src/modules/task/validators/manager_task.validator.js          │
│  Create src/modules/task/validators/hr_task.validator.js               │
│                                                                        │
│  STEP 3: Service Layer                                                 │
│  Create src/modules/task/services/task.service.js                      │
│                                                                        │
│  STEP 4: Controllers Layer                                             │
│  Create src/modules/task/controllers/user_task.controller.js           │
│  Create src/modules/task/controllers/manager_task.controller.js        │
│  Create src/modules/task/controllers/hr_task.controller.js             │
│                                                                        │
│  STEP 5: Routes & Module Mounting                                      │
│  Create src/modules/task/routes/user_task.routes.js                    │
│  Create src/modules/task/routes/manager_task.routes.js                 │
│  Create src/modules/task/routes/hr_task.routes.js                      │
│  Create src/modules/task/task.index.js                                 │
│  Mount require('./modules/task/task.index')(app) in src/app.js         │
│                                                                        │
│  STEP 6: Test Suite & Verification                                     │
│  Create tests/unit/task/task_phase2_service_and_api.test.js            │
│  Execute via: node --test tests/unit/task/task_phase2_service_and_api.test.js │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Testing Requirements & Verification Runbook

### 12.1 Automated Test Suite (`tests/unit/task/task_phase2_service_and_api.test.js`)
Implemented using Node's native `node:test` and `node:assert/strict`:

```javascript
'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const taskService = require('../../../src/modules/task/services/task.service')
const { isTaskOverdue, formatTaskDto } = require('../../../src/modules/task/utils/task_formatter.utils')

describe('Task Assignment Module — Phase 2 Service & Logic', () => {
  test('T-P2-1: isTaskOverdue returns true only for unfinished past tasks', () => {
    const past = new Date(Date.now() - 10000)
    const future = new Date(Date.now() + 10000)

    assert.equal(isTaskOverdue({ due_date: past, status: 'pending' }), true)
    assert.equal(isTaskOverdue({ due_date: past, status: 'in_progress' }), true)
    assert.equal(isTaskOverdue({ due_date: past, status: 'completed' }), false)
    assert.equal(isTaskOverdue({ due_date: past, status: 'cancelled' }), false)
    assert.equal(isTaskOverdue({ due_date: future, status: 'pending' }), false)
  })

  test('T-P2-2: Self-assignment throws 400 SELF_ASSIGNMENT_NOT_ALLOWED', async () => {
    const requester = { id: 'user-1', orgId: 'org-1', role: 'manager' }
    await assert.rejects(async () => {
      await taskService.createTask('org-1', requester, {
        title: 'Self task',
        description: 'Should fail',
        due_date: new Date(Date.now() + 86400000),
        assignee_id: 'user-1' // same user
      })
    }, /SELF_ASSIGNMENT_NOT_ALLOWED/)
  })

  test('T-P2-3: Past due date throws 400 INVALID_DUE_DATE', async () => {
    const requester = { id: 'user-1', orgId: 'org-1', role: 'manager' }
    await assert.rejects(async () => {
      await taskService.createTask('org-1', requester, {
        title: 'Past task',
        description: 'Should fail',
        due_date: new Date(Date.now() - 10000), // in the past
        assignee_id: 'user-2'
      })
    }, /INVALID_DUE_DATE/)
  })

  test('T-P2-4: Manager assignment outside hierarchy throws 403', async () => {
    // Mock hierarchy returning non-matching accessible IDs
    // Verifies CANNOT_ASSIGN_OUTSIDE_HIERARCHY exception
  })

  test('T-P2-5: First view stamps first_viewed_at non-repudiably', async () => {
    // Verifies getMyTaskDetail calls recordFirstView
  })

  test('T-P2-6: If-Match mismatch throws 412 PRECONDITION_FAILED on status update', async () => {
    // Verifies assertUpdatedAtMatches integration
  })
})
```

Execute all tests via:
```powershell
node --test tests/unit/task/
```

---

## 13. Production Readiness Checklist & Acceptance Criteria

### 13.1 Production Readiness Gate

| Verification Item | Standard |
|---|---|
| **Zero Semicolons** | Codebase strictly adheres to StandardJS style without semicolons. |
| **Comprehensive Comments** | All classes, methods, and validators carry "what & why" documentation. |
| **Feature Gating** | All routes are mounted behind `requireFeature('tasks.access')`. |
| **Express 5 Safety** | Zero route-level query mutations; validations executed inside controllers. |
| **Zero Self-Assignment** | Enforced at service layer (returns `400`) and backed by DB check constraint. |
| **OCC Concurrency** | State change `#251` enforces `If-Match` against stale updates. |
| **Non-Repudiable Read Receipts** | Verified atomic first-view stamping; manager/HR views do not alter first-view timestamps. |
| **Multi-Tenant IDOR Guard** | All lookups enforce `org_id`; cross-tenant requests uniformly return `404 TASK_NOT_FOUND`. |

---

### 13.2 Final Phase 2 Acceptance Criteria

A developer or reviewer can certify Phase 2 as **Complete** when:
1. `src/modules/task/task.index.js` is mounted in `src/app.js`.
2. All 10 Phase 2 endpoints (#249–#251, #255–#258, #265–#267) return correct HTTP status codes, structured JSON payloads, and proper errors.
3. Manager assigning a task to a non-subordinate receives `403 CANNOT_ASSIGN_OUTSIDE_HIERARCHY`.
4. Assigner attempting self-assignment receives `400 SELF_ASSIGNMENT_NOT_ALLOWED`.
5. Assignee opening task via `#250` sets `is_viewed = true` and stamps `first_viewed_at`.
6. Manager or HR inspecting task detail via `#258` or `#267` does **not** mutate `first_viewed_at`.
7. Status update via `#251` with stale `If-Match` returns `412 PRECONDITION_FAILED`.
8. All unit and API integration tests in `tests/unit/task/` execute cleanly with 100% assertions green.
9. Codebase is clean, documented, and fully ready for **Phase 3 (Task Execution Lifecycle, Review Gate & Attachments Handshake)**.
