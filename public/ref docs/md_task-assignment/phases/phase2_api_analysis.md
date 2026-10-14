# Phase 2 Complete API Analysis Documentation: Task Assignment Module (Core Delegation, Hierarchy Engine & Self-Service Views)

**Document File:** `public/md_task-assignment/phases/phase2_api_analysis.md`  
**Author:** Senior/Principal Backend Engineer, API Architect & Technical Documentation Engineer  
**Date:** 2026-10-12  
**Status:** Shipped, Verified & Green (`node --test tests/unit/task/task_phase2_service_and_api.test.js tests/unit/task/task_models_and_repos.test.js` — 28 passing assertions, 0 failures)  

---

## Codebase Sources of Truth

* **Module Aggregator:** [task.index.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/task.index.js)
* **Application Wire:** [src/app.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/app.js#L86) (Mounted via `require('./modules/task/task.index')(app)`)
* **Express Routers:**
  * [user_task.routes.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/routes/user_task.routes.js) (`/api/v1/tasks/me`)
  * [manager_task.routes.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/routes/manager_task.routes.js) (`/api/v1/tasks/manager`)
  * [hr_task.routes.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/routes/hr_task.routes.js) (`/api/v1/tasks/hr`)
* **Controllers:**
  * [user_task.controller.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/controllers/user_task.controller.js)
  * [manager_task.controller.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/controllers/manager_task.controller.js)
  * [hr_task.controller.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/controllers/hr_task.controller.js)
* **Domain Service:** [task.service.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/services/task.service.js)
* **Joi Validation Schemas:**
  * [user_task.validator.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/validators/user_task.validator.js)
  * [manager_task.validator.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/validators/manager_task.validator.js)
  * [hr_task.validator.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/validators/hr_task.validator.js)
* **Presentation & Utility Modules:**
  * [task_formatter.utils.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/utils/task_formatter.utils.js)
  * [task_idempotency.utils.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/utils/task_idempotency.utils.js)
* **Underlying Repositories (Phase 1):**
  * [task.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task.repository.js)
  * [task_audit.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task_audit.repository.js)
  * [task_notification.repository.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/task/repositories/task_notification.repository.js)
* **Test Suite:** [task_phase2_service_and_api.test.js](file:///C:/Users/91930/Desktop/Vs_Code/HRMS/tests/unit/task/task_phase2_service_and_api.test.js) (15 passing tests)

---

## 1. Executive Architectural Premise & Scope Boundary

Phase 2 builds directly upon the Phase 1 persistence and repository foundation to deliver the **live HTTP API surface, hierarchical delegation engine, self-service execution views, and organizational oversight registry** across three dedicated architectural planes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TASK ASSIGNMENT THREE-PLANE ARCHITECTURE               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. EMPLOYEE SELF-SERVICE PLANE (/api/v1/tasks/me)                          │
│     • #249: GET    /api/v1/tasks/me             (List assigned tasks)       │
│     • #250: GET    /api/v1/tasks/me/:id         (Detail + Atomic First-View)│
│     • #251: PATCH  /api/v1/tasks/me/:id/status  (Status toggle + OCC Guard) │
│                                                                             │
│  2. MANAGERIAL DELEGATION & OVERSIGHT PLANE (/api/v1/tasks/manager)         │
│     • #255: POST   /api/v1/tasks/manager        (Delegate to Subordinate)   │
│     • #256: GET    /api/v1/tasks/manager/assigned-by-me (Tasks I delegated) │
│     • #257: GET    /api/v1/tasks/manager/team-tasks     (Team work roster)  │
│     • #258: GET    /api/v1/tasks/manager/:id    (Subordinate Task Detail)   │
│                                                                             │
│  3. HR & ADMINISTRATIVE GOVERNANCE PLANE (/api/v1/tasks/hr)                 │
│     • #265: POST   /api/v1/tasks/hr             (Org-wide Task Delegation)  │
│     • #266: GET    /api/v1/tasks/hr             (Org-wide Task Registry)    │
│     • #267: GET    /api/v1/tasks/hr/:id         (Full Audit Governance View)│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Strict Phase Boundary Audit
* **Total Phase 2 HTTP APIs Shipped:** **10 Endpoints** (#249–#251, #255–#258, #265–#267).
* **Existing Phase 1 APIs Modified:** **0** (Phase 1 was strictly the database persistence and SPI foundation, exposing zero HTTP routes).
* **Existing HRMS Platform APIs Modified:** **0** (No changes to `auth`, `leave`, `payrolls`, `documents`, or `attendance`).
* **Deferred to Phase 3:** Deliverable submissions (`#252`), Review gates (`#259`, `#260`), Reassignment (`#261`), Cancellations (`#262`), Deadline extensions (`#263`), and S3 Presigned URL upload handshakes (`#268`–`#270`).
* **Deferred to Phase 4:** Contextual task discussion threads (`#253`, `#254`, `#264`) and Redis sliding-window rate limiters.
* **Deferred to Phase 5:** Background outbox notification dispatchers and temporal overdue sweepers.

### 1.2 Binding Architectural Guarantees Implemented
* **`D-T1` Single Unified Work Ledger:** All tasks reside in the single `tasks` table with role-scoping applied at the query level.
* **`D-T2` Strict Reporting Hierarchy Enforcement:** People managers can only assign tasks to active subordinates confirmed via `user_reporting_mappings`. Managers cannot delegate to peers, senior leaders, or subordinates holding global approver roles (`hr`, `admin`, `super-admin`).
* **`D-T3` Zero Self-Assignment Invariant:** The system rejects self-delegation at both the API service layer (`SELF_ASSIGNMENT_NOT_ALLOWED`) and the physical PostgreSQL check constraint (`chk_tasks_no_self_assign`).
* **`D-T4` Atomic Non-Repudiable Read Receipts:** When an assignee fetches task details via `#250`, the system conditionally updates `first_viewed_at = NOW()` and `is_viewed = true` in a single query (`WHERE is_viewed = false`), simultaneously recording a `FIRST_VIEWED` audit entry. Manager inspections via `#258` and HR audits via `#267` are strictly read-only and never mutate read receipts.
* **`D-T5` Dynamic Temporal Overdue Evaluation:** The boolean flag `is_overdue` is computed dynamically on the fly during presentation formatting (`isTaskOverdue`). It is never stored as a mutable static enum or column.
* **`D-T8` Optimistic Concurrency Control (OCC):** Status transitions via `#251` check the client's `If-Match` header against both integer `version` and ISO 8601 `updated_at`. Mismatches throw standard HTTP `412 PRECONDITION_FAILED`.
* **`D-T9` Distributed Idempotency Guard:** Creation endpoints (`#255`, `#265`) accept an optional `Idempotency-Key` header. Requests are protected via Redis claim/store guards with a 120-second TTL, automatically failing open if Redis is offline.
* **`D-T10` Transactional Outbox Pattern:** Task creation enqueues a `TASK_ASSIGNED` event inside the primary database transaction with a deterministic deduplication key (`task_assigned:${task.id}:${task.assignee_id}`).
* **Express 5 Invariant (`EC-T13`):** Because Express 5 implements `req.query` as a getter-only property, all query parameter validation is executed inside controllers via `validateOrThrow(schema, req.query)` to prevent runtime crashes.

---

## 2. Authentication, Authorization & Feature Gate Matrix

Every Phase 2 endpoint is protected by three layers of defense-in-depth:

```
Request ──► [1. authenticate] ──► [2. requireActiveOrg] ──► [3. requireFeature('tasks.access')] ──► [4. authorize(roles)] ──► Handler
```

| Plane | Mount Path | Authentication | Feature Flag | Permitted Roles | Hierarchy Enforcement |
|---|---|:---:|:---:|---|---|
| **Self-Service** | `/api/v1/tasks/me` | JWT Bearer | `tasks.access` | Any active organization user (`employee`, `manager`, `hr`, `admin`, `super-admin`) | Scoped strictly to caller (`assignee_id = req.user.id`) |
| **Managerial** | `/api/v1/tasks/manager` | JWT Bearer | `tasks.access` | `['manager', 'hr', 'admin', 'super-admin']` | Dynamically resolved via `HierarchyAccess.getAccessibleUserIds()` |
| **HR Governance** | `/api/v1/tasks/hr` | JWT Bearer | `tasks.access` | `['hr', 'admin', 'super-admin']` | Global tenant scope (`org_id = req.user.orgId`) |

---

## 3. Detailed Specification of Phase 2 APIs

---

### Endpoint #249: List Tasks Assigned to Caller (Self-Service)

* **API Number / Identifier:** `#249`
* **Route Name:** `getMyTasks`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/me`
* **Target Audience:** Employee Self-Service (Individual Contributor execution hub)
* **Purpose:** Retrieves a paginated list of tasks delegated to the authenticated caller.
* **Business Problem Solved:** Eliminates fragmented email requests by providing employees with a single, prioritized operational to-do list with real-time status and deadline indicators.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT in `Authorization: Bearer <token>`).
* **Tenant Check:** `requireActiveOrg` (Organization must be active).
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Allowed Roles:** Any active tenant user (`employee`, `manager`, `hr`, `admin`, `super-admin`).
* **Data Isolation:** Hard-scoped to `assignee_id = req.user.id` and `org_id = req.user.orgId`.

#### Request Parameters
* **Headers:**
  * `Authorization: Bearer <jwt>` (Required)
* **Path Parameters:** None
* **Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  |---|---|:---:|:---:|---|
  | `status` | String | No | — | Filter by lifecycle status (`pending`, `in_progress`, `in_review`, `reopened`, `completed`, `cancelled`). |
  | `priority` | String | No | — | Filter by priority (`low`, `medium`, `high`, `urgent`). |
  | `category` | String | No | — | Filter by category (`operational`, `compliance`, `onboarding`, `administrative`, `general`). |
  | `is_viewed` | Boolean | No | — | Filter by read-receipt status (`true` = viewed, `false` = unviewed). |
  | `is_overdue` | Boolean | No | — | Filter by dynamic overdue status (`true` = overdue, `false` = not overdue). |
  | `search` | String | No | — | Case-insensitive title search (1–100 characters). |
  | `page` | Integer | No | `1` | Pagination page number (min: 1). |
  | `limit` | Integer | No | `20` | Items per page (min: 1, max: 100). |

#### Request Body
* None (`GET` request).

#### Domain & Business Behavior
1. Validates query parameters using `listMyTasksQuerySchema` inside the controller.
2. Constructs the repository filter with `org_id = req.user.orgId` and `assignee_id = req.user.id`.
3. If `is_overdue === true`, repository matches `due_date < NOW()` AND `status NOT IN ('completed', 'cancelled')`.
4. If `is_overdue === false`, repository matches `due_date >= NOW()` OR `status IN ('completed', 'cancelled')`.
5. Eager-loads assigner and assignee summaries (`id`, `name`, `email`) while omitting password hashes.
6. Orders results by `created_at DESC`.
7. Formats DTOs via `formatPaginatedTasks`, dynamically injecting `is_overdue: boolean`.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Tasks retrieved successfully",
  "data": {
    "tasks": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
        "title": "Prepare Q3 Regional Sales Variance Analysis",
        "category": "operational",
        "description": "Reconcile revenue figures against budgeted targets for the Western region.",
        "priority": "high",
        "status": "pending",
        "due_date": "2026-10-15T18:00:00.000Z",
        "original_due_date": "2026-10-15T18:00:00.000Z",
        "extension_count": 0,
        "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
        "is_viewed": false,
        "first_viewed_at": null,
        "last_viewed_at": null,
        "external_links": [
          {
            "label": "Western Region Sales Sheet",
            "url": "https://docs.google.com/spreadsheets/d/xyz"
          }
        ],
        "rework_count": 0,
        "reassignment_count": 0,
        "submitted_at": null,
        "completed_at": null,
        "completed_by": null,
        "is_completed_on_time": null,
        "cancelled_at": null,
        "cancelled_by": null,
        "cancellation_reason": null,
        "version": 1,
        "created_at": "2026-10-12T10:00:00.000Z",
        "updated_at": "2026-10-12T10:00:00.000Z",
        "deleted_at": null,
        "is_overdue": false,
        "attachments": [],
        "comments_count": 0,
        "assigner": {
          "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "name": "Sarah Jenkins",
          "email": "sarah.jenkins@company.com"
        },
        "assignee": {
          "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
          "name": "Alex Mercer",
          "email": "alex.mercer@company.com"
        }
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

#### Error Handling
* **HTTP `400 Bad Request` (`VALIDATION_ERROR`):** Invalid query parameter (e.g. `limit > 100` or invalid enum string).
* **HTTP `401 Unauthorized` (`UNAUTHORIZED`):** Missing or expired JWT token.
* **HTTP `403 Forbidden` (`FEATURE_NOT_AVAILABLE`):** Organization does not have active `tasks.access` entitlement.

---

### Endpoint #250: Task Detail View with Atomic Read Receipt Stamping (Self-Service)

* **API Number / Identifier:** `#250`
* **Route Name:** `getMyTaskDetail`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/me/:id`
* **Target Audience:** Employee Self-Service
* **Purpose:** Retrieves complete task details for the assignee, atomically recording the first-view timestamp.
* **Business Problem Solved:** Eliminates the "unread deniability" excuse by providing non-repudiable audit evidence of when an employee opened and acknowledged a delegated task.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Allowed Roles:** Any active tenant user.
* **Resource Ownership:** The authenticated user MUST be the task's `assignee_id`. If the task belongs to another employee or does not exist, the API returns a uniform HTTP `404 Not Found` (`TASK_NOT_FOUND`) to prevent ID enumeration.

#### Request Parameters
* **Headers:**
  * `Authorization: Bearer <jwt>` (Required)
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.
* **Query Parameters:** None.
* **Request Body:** None.

#### Domain & Business Behavior
1. Validates `id` path parameter as a valid UUID.
2. Queries the task with tenant scoping (`org_id = req.user.orgId`).
3. Confirms `task.assignee_id === req.user.id`.
4. **Atomic First-View Stamping (`D-T4`):**
   * If `task.is_viewed === false`: Executes `taskRepository.recordFirstView(taskId, orgId, userId)`.
   * Atomically sets `is_viewed = true`, `first_viewed_at = NOW()`, and `last_viewed_at = NOW()`.
   * Appends a non-repudiable entry to `task_audit_logs` with `action = 'FIRST_VIEWED'`, capturing the client IP and User-Agent.
   * If `task.is_viewed === true`: Updates `last_viewed_at = NOW()`.
5. Eager-loads attached files from `task_attachments`.
6. Formats and returns the DTO with dynamic `is_overdue` evaluation.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Task details retrieved successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "pending",
    "due_date": "2026-10-15T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 0,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:14:22.128Z",
    "last_viewed_at": "2026-10-12T10:14:22.128Z",
    "external_links": [
      {
        "label": "Western Region Sales Sheet",
        "url": "https://docs.google.com/spreadsheets/d/xyz"
      }
    ],
    "rework_count": 0,
    "reassignment_count": 0,
    "submitted_at": null,
    "completed_at": null,
    "completed_by": null,
    "is_completed_on_time": null,
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "version": 1,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T10:14:22.128Z",
    "deleted_at": null,
    "is_overdue": false,
    "attachments": [],
    "comments_count": 0,
    "assigner": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Sarah Jenkins",
      "email": "sarah.jenkins@company.com"
    },
    "assignee": {
      "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      "name": "Alex Mercer",
      "email": "alex.mercer@company.com"
    }
  }
}
```

#### Error Handling
* **HTTP `404 Not Found` (`TASK_NOT_FOUND`):** Task does not exist in the tenant organization, or caller is not the assignee.
* **HTTP `400 Bad Request` (`VALIDATION_ERROR`):** Malformed UUID path parameter.

---

### Endpoint #251: Transition Execution Status (Self-Service)

* **API Number / Identifier:** `#251`
* **Route Name:** `updateTaskStatus`
* **HTTP Method:** `PATCH`
* **Endpoint:** `/api/v1/tasks/me/:id/status`
* **Target Audience:** Employee Self-Service
* **Purpose:** Allows the assignee to transition task execution between `pending` and `in_progress`.
* **Business Problem Solved:** Enables employees to formally signal work commencement, updating manager dashboards with real-time operational status while guarding against conflicting concurrent updates.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Allowed Roles:** Any active tenant user.
* **Resource Ownership:** Caller must be the task's `assignee_id`.

#### Request Parameters
* **Headers:**
  * `Authorization: Bearer <jwt>` (Required)
  * `If-Match: <version | updated_at>` (Recommended / Optional): Optimistic Concurrency Control revision token (e.g. `"1"` or `"2026-10-12T10:00:00.000Z"`).
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.

#### Request Body Schema
```json
{
  "status": "in_progress"
}
```
* `status` (String, Required): Must strictly be either `'pending'` or `'in_progress'`. (Transitions to `'in_review'` are handled via Phase 3 deliverable submission `#252`).

#### Domain & Business Behavior
1. Validates path and body schemas.
2. Retrieves task; enforces tenant scoping and ownership (`assignee_id === req.user.id`).
3. **Terminal Invariant:** If task status is `'completed'` or `'cancelled'`, throws HTTP `409 Conflict` (`TASK_TERMINATED`).
4. **Review Gate Invariant:** If task status is `'in_review'`, throws HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`) as pending review tasks cannot be arbitrarily reverted without assigner intervention.
5. **Optimistic Concurrency Control (`D-T8`):**
   * If `If-Match` header is present, strips whitespace and weak entity tag wrappers (`W/`).
   * Validates against both integer `task.version` and ISO 8601 `task.updated_at`.
   * If neither matches, aborts with HTTP `412 Precondition Failed` (`PRECONDITION_FAILED`), returning `{ current_version, current_updated_at }`.
6. If target status matches current status, returns current DTO as an idempotent no-op.
7. **Database Transaction:**
   * Updates task status to target state and marks `is_viewed = true`.
   * Increments `version` by 1.
   * Records audit log with `action = 'STATUS_CHANGED'`, capturing previous and new statuses.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Task status updated successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "status": "in_progress",
    "version": 2,
    "updated_at": "2026-10-12T10:20:00.000Z",
    "is_viewed": true,
    "is_overdue": false
  }
}
```

#### Error Handling
* **HTTP `404 Not Found` (`TASK_NOT_FOUND`):** Task does not exist or caller is not assignee.
* **HTTP `409 Conflict` (`TASK_TERMINATED`):** Task is in terminal state `completed` or `cancelled`.
* **HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`):** Task is currently `in_review`.
* **HTTP `412 Precondition Failed` (`PRECONDITION_FAILED`):** `If-Match` revision does not match current task version.
* **HTTP `400 Bad Request` (`VALIDATION_ERROR`):** Invalid target status provided.

---

### Endpoint #255: Delegate Task to Direct Subordinate (Managerial Delegation)

* **API Number / Identifier:** `#255`
* **Route Name:** `createTask`
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/tasks/manager`
* **Target Audience:** People Managers (`manager`, `hr`, `admin`, `super-admin`)
* **Purpose:** Delegates an operational task to an active direct reporting subordinate.
* **Business Problem Solved:** Enforces organizational reporting integrity, preventing managers from assigning unauthorized work to peers, senior leaders, or members of other departments.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Role Gate:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Hierarchy Gate:** Dynamically validated via `HierarchyAccess.getAccessibleUserIds(orgId, req.user)`.

#### Request Parameters
* **Headers:**
  * `Authorization: Bearer <jwt>` (Required)
  * `Idempotency-Key: <unique-client-key>` (Optional): Replay protection key.

#### Request Body Schema
```json
{
  "title": "Quarterly Sales Commission Reconciliation",
  "description": "Review and verify Q3 sales commission calculations against CRM closed-won deal receipts.",
  "category": "operational",
  "priority": "high",
  "due_date": "2026-10-16T17:00:00.000Z",
  "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "external_links": [
    {
      "label": "CRM Closed-Won Report",
      "url": "https://company.crm.com/reports/closed-won-q3"
    }
  ],
  "attachment_tokens": []
}
```

#### Request Field Specifications
| Field | Type | Required | Default | Validation & Constraints |
|---|---|:---:|:---:|---|
| `title` | String | Yes | — | 1–200 characters, trimmed, non-empty. |
| `description` | String | Yes | — | 1–5,000 characters, trimmed, non-empty. |
| `category` | String | No | `'operational'` | Enum: `operational`, `compliance`, `onboarding`, `administrative`, `general`. |
| `priority` | String | No | `'medium'` | Enum: `low`, `medium`, `high`, `urgent`. |
| `due_date` | String | Yes | — | ISO 8601 UTC timestamp. Must be at least 15 minutes into future (`EC-T6`). |
| `assignee_id` | UUID | Yes | — | Target employee UUID. Must be an active direct reporting subordinate. |
| `external_links`| Array | No | `[]` | Max 10 items. Each item must have `label` (1–100 chars) and `url` (`https://` only, max 1,000 chars). |
| `attachment_tokens` | Array | No | `[]` | Max 10 items. Array of staged upload tokens. |

#### Domain & Business Behavior
1. **Idempotency Guard (`D-T9`):** If `Idempotency-Key` is provided, checks Redis. Replays cached response on hit; claims execution lock on miss.
2. **Zero Self-Delegation (`D-T3`):** Validates `req.user.id !== payload.assignee_id`. Throws HTTP `400 Bad Request` (`SELF_ASSIGNMENT_NOT_ALLOWED`) on match.
3. **Due Date Temporal Rule (`EC-T6`):** Validates `due_date >= NOW() + 15 minutes`. Throws HTTP `400 Bad Request` (`INVALID_DUE_DATE`) on violation.
4. **Target Assignee Existence:** Confirms `assignee_id` exists in tenant with an active role (`UserRole.is_active = true`). Throws HTTP `404 Not Found` (`ASSIGNEE_NOT_FOUND`) if missing.
5. **Hierarchy Resolution (`D-T2`):**
   * If caller role is `'manager'`, invokes `HierarchyAccess.getAccessibleUserIds(orgId, req.user)`.
   * Rejects with HTTP `403 Forbidden` (`CANNOT_ASSIGN_OUTSIDE_HIERARCHY`) if `assignee_id` is not in accessible subordinate list.
   * Defense-in-depth: Rejects with HTTP `403 Forbidden` (`FORBIDDEN`) if subordinate holds `GLOBAL_APPROVER_ROLES` (`hr`, `admin`, `super-admin`).
6. **Atomic Database Transaction:**
   * Inserts row in `tasks` with status `'pending'`, `version = 1`, `extension_count = 0`, `rework_count = 0`, `is_viewed = false`, `original_due_date = due_date`.
   * Inserts row in `task_audit_logs` with `action = 'CREATED'`.
   * Enqueues notification in `task_notifications` with `event_type = 'TASK_ASSIGNED'` and deterministic deduplication key `task_assigned:${task.id}:${task.assignee_id}`.
7. Stores DTO in Redis idempotency cache (TTL: 120s) if key was provided.

#### Success Response Contract (HTTP `201 Created`)
```json
{
  "success": true,
  "message": "Task delegated successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Quarterly Sales Commission Reconciliation",
    "category": "operational",
    "description": "Review and verify Q3 sales commission calculations against CRM closed-won deal receipts.",
    "priority": "high",
    "status": "pending",
    "due_date": "2026-10-16T17:00:00.000Z",
    "original_due_date": "2026-10-16T17:00:00.000Z",
    "extension_count": 0,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": false,
    "first_viewed_at": null,
    "last_viewed_at": null,
    "external_links": [
      {
        "label": "CRM Closed-Won Report",
        "url": "https://company.crm.com/reports/closed-won-q3"
      }
    ],
    "version": 1,
    "created_at": "2026-10-12T10:30:00.000Z",
    "updated_at": "2026-10-12T10:30:00.000Z",
    "is_overdue": false,
    "attachments": [],
    "comments_count": 0,
    "assigner": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Sarah Jenkins",
      "email": "sarah.jenkins@company.com"
    },
    "assignee": {
      "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      "name": "Alex Mercer",
      "email": "alex.mercer@company.com"
    }
  }
}
```

#### Error Handling
* **HTTP `400 Bad Request` (`SELF_ASSIGNMENT_NOT_ALLOWED`):** Assigner and assignee IDs are identical.
* **HTTP `400 Bad Request` (`INVALID_DUE_DATE`):** Due date is in the past or within 15 minutes of current time.
* **HTTP `403 Forbidden` (`CANNOT_ASSIGN_OUTSIDE_HIERARCHY`):** Target assignee does not report to the calling manager.
* **HTTP `403 Forbidden` (`FORBIDDEN`):** Calling manager attempted to assign a task to an HR/Admin user.
* **HTTP `404 Not Found` (`ASSIGNEE_NOT_FOUND`):** Target assignee does not exist or is inactive in the organization.

---

### Endpoint #256: List Tasks Delegated by Caller (Managerial Delegation)

* **API Number / Identifier:** `#256`
* **Route Name:** `getAssignedByMe`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/manager/assigned-by-me`
* **Target Audience:** People Managers
* **Purpose:** Retrieves a paginated list of tasks created and delegated by the calling manager.
* **Business Problem Solved:** Gives managers instant visibility into the execution status of all deliverables they have delegated across their team.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Role Gate:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Filter Scope:** Hard-scoped to `assigner_id = req.user.id` and `org_id = req.user.orgId`.

#### Request Parameters
* **Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  |---|---|:---:|:---:|---|
  | `assignee_id` | UUID | No | — | Filter by specific subordinate assignee. |
  | `status` | String | No | — | Filter by lifecycle status. |
  | `priority` | String | No | — | Filter by priority. |
  | `category` | String | No | — | Filter by category. |
  | `is_overdue` | Boolean | No | — | Filter by dynamic overdue state. |
  | `search` | String | No | — | Case-insensitive title search. |
  | `page` | Integer | No | `1` | Pagination page number. |
  | `limit` | Integer | No | `20` | Items per page (max 100). |

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Assigned tasks retrieved successfully",
  "data": {
    "tasks": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "title": "Quarterly Sales Commission Reconciliation",
        "status": "pending",
        "priority": "high",
        "due_date": "2026-10-16T17:00:00.000Z",
        "is_viewed": true,
        "first_viewed_at": "2026-10-12T10:45:00.000Z",
        "is_overdue": false,
        "assignee": {
          "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
          "name": "Alex Mercer",
          "email": "alex.mercer@company.com"
        }
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

---

### Endpoint #257: List Tasks Assigned to Reporting Team (Managerial Delegation)

* **API Number / Identifier:** `#257`
* **Route Name:** `getTeamTasks`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/manager/team-tasks`
* **Target Audience:** People Managers
* **Purpose:** Retrieves a unified task list across all employees reporting directly to the calling manager (regardless of whether the manager or HR assigned the task).
* **Business Problem Solved:** Enables managers to oversee overall team workload, detect overdue work delegated by HR, and balance team bandwidth.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Role Gate:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Hierarchy Enforcement:** Resolves direct subordinates via `HierarchyAccess.getAccessibleUserIds()`.

#### Request Parameters
* **Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  |---|---|:---:|:---:|---|
  | `subordinate_id`| UUID | No | — | Filter by a single direct subordinate. Validated against reporting tree. |
  | `status` | String | No | — | Filter by lifecycle status. |
  | `priority` | String | No | — | Filter by priority. |
  | `category` | String | No | — | Filter by category. |
  | `is_overdue` | Boolean | No | — | Filter by dynamic overdue state. |
  | `search` | String | No | — | Title search string. |
  | `page` | Integer | No | `1` | Page number. |
  | `limit` | Integer | No | `20` | Page limit (max 100). |

#### Domain & Business Behavior
1. If caller is `'manager'`, fetches `accessibleUserIds`.
2. If manager has zero reporting subordinates, immediately returns `{ tasks: [], pagination: { total: 0, page, limit, totalPages: 1 } }`.
3. If `subordinate_id` is supplied:
   * Verifies `accessibleUserIds.includes(query.subordinate_id)`.
   * Throws HTTP `403 Forbidden` (`CANNOT_ACCESS_OUTSIDE_HIERARCHY`) if subordinate is outside reporting tree.
4. Filters repository query with `assignee_ids = accessibleUserIds`.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Team tasks retrieved successfully",
  "data": {
    "tasks": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "title": "Annual Information Security Certification",
        "category": "compliance",
        "priority": "urgent",
        "status": "pending",
        "due_date": "2026-10-31T23:59:59.000Z",
        "assigner_id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
        "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
        "is_overdue": false,
        "assigner": {
          "id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
          "name": "HR Compliance Dept",
          "email": "hr@company.com"
        },
        "assignee": {
          "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
          "name": "Alex Mercer",
          "email": "alex.mercer@company.com"
        }
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

#### Error Handling
* **HTTP `403 Forbidden` (`CANNOT_ACCESS_OUTSIDE_HIERARCHY`):** `subordinate_id` does not report to caller.

---

### Endpoint #258: Detail View for Subordinate Task (Managerial Delegation)

* **API Number / Identifier:** `#258`
* **Route Name:** `getManagerTaskDetail`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/manager/:id`
* **Target Audience:** People Managers
* **Purpose:** Inspects detailed specifications and progress of a subordinate's task without mutating read receipts.
* **Business Problem Solved:** Allows managers to check task status and read receipts without accidentally overwriting the employee's genuine first-view timestamp.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Role Gate:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Access Rule:** Caller must be either the task's `assigner_id` OR the direct manager of the `assignee_id`.

#### Request Parameters
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.

#### Domain & Business Behavior
1. Retrieves task with tenant scoping.
2. If task does not exist, throws HTTP `404 Not Found` (`TASK_NOT_FOUND`).
3. If caller is not a global approver and not the assigner:
   * Resolves `accessibleUserIds` for caller.
   * If `task.assignee_id` is not in accessible subordinate list, throws HTTP `403 Forbidden` (`FORBIDDEN`).
4. **Read-Only Invariant (`D-T4`):** Does NOT modify `is_viewed`, `first_viewed_at`, or `last_viewed_at`.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Task details retrieved successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "title": "Quarterly Sales Commission Reconciliation",
    "status": "pending",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:45:00.000Z",
    "last_viewed_at": "2026-10-12T11:10:00.000Z",
    "is_overdue": false,
    "attachments": []
  }
}
```

#### Error Handling
* **HTTP `404 Not Found` (`TASK_NOT_FOUND`):** Task does not exist in tenant.
* **HTTP `403 Forbidden` (`FORBIDDEN`):** Caller is neither the assigner nor the assignee's direct manager.

---

### Endpoint #265: Organization-Wide Task Delegation (HR Governance)

* **API Number / Identifier:** `#265`
* **Route Name:** `createTask` (HR Plane)
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/tasks/hr`
* **Target Audience:** HR Administrators (`hr`, `admin`, `super-admin`)
* **Purpose:** Delegates tasks globally across any department or hierarchy level in the organization.
* **Business Problem Solved:** Enables HR leaders to assign mandatory statutory, compliance, onboarding, and administrative tasks across the entire company without managerial hierarchy roadblocks.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Role Gate:** `authorize(['hr', 'admin', 'super-admin'])`.
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Hierarchy Scope:** Global tenant delegation (can assign to any active user in the organization).

#### Request Parameters & Body
* **Headers:** `Authorization: Bearer <jwt>`, `Idempotency-Key` (Optional).
* **Request Body:** Identical to `#255` (`createHrTaskSchema`).

#### Domain & Business Behavior
* Enforces Zero Self-Assignment (`D-T3`).
* Enforces minimum 15-minute future due date (`EC-T6`).
* Bypasses manager hierarchy checks; validates target assignee exists and has active role in tenant.
* Atomically persists task, audit log (`CREATED`), and transactional outbox notification (`TASK_ASSIGNED`).

#### Success Response Contract (HTTP `201 Created`)
```json
{
  "success": true,
  "message": "Task created and assigned successfully",
  "data": {
    "id": "5cb85f64-5717-4562-b3fc-2c963f66afb7",
    "title": "Annual Information Security Certification",
    "category": "compliance",
    "priority": "urgent",
    "status": "pending",
    "due_date": "2026-10-31T23:59:59.000Z",
    "assigner": {
      "id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
      "name": "HR Admin",
      "email": "hr.admin@company.com"
    },
    "assignee": {
      "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      "name": "Alex Mercer",
      "email": "alex.mercer@company.com"
    }
  }
}
```

---

### Endpoint #266: Organization-Wide Task Registry (HR Governance)

* **API Number / Identifier:** `#266`
* **Route Name:** `getHrTasks`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/hr`
* **Target Audience:** HR Administrators
* **Purpose:** Provides a centralized, multi-parameter search and audit registry across all company tasks.
* **Business Problem Solved:** Gives executive leadership complete operational visibility to track company-wide delivery, identify bottlenecks, and audit compliance.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Role Gate:** `authorize(['hr', 'admin', 'super-admin'])`.
* **Feature Gate:** `requireFeature('tasks.access')`.

#### Request Parameters
* **Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  |---|---|:---:|:---:|---|
  | `department_id` | UUID | No | — | Filter by organizational department. Resolves to employee user IDs via `EmployeeProfile`. |
  | `assigner_id` | UUID | No | — | Filter by specific delegator. |
  | `assignee_id` | UUID | No | — | Filter by specific assignee. |
  | `status` | String | No | — | Filter by lifecycle status. |
  | `priority` | String | No | — | Filter by priority rating. |
  | `category` | String | No | — | Filter by operational category. |
  | `is_overdue` | Boolean | No | — | Filter by dynamic overdue status. |
  | `search` | String | No | — | Case-insensitive title search. |
  | `page` | Integer | No | `1` | Page number. |
  | `limit` | Integer | No | `20` | Page limit (max 100). |

#### Domain & Business Behavior
* If `department_id` is supplied: Queries `db.EmployeeProfile` to resolve all user IDs belonging to that department within the tenant. If no profiles match, returns an empty paginated envelope immediately.
* Performs paginated search across all tasks in tenant with user profile hydration.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Organization tasks retrieved successfully",
  "data": {
    "tasks": [
      {
        "id": "5cb85f64-5717-4562-b3fc-2c963f66afb7",
        "title": "Annual Information Security Certification",
        "category": "compliance",
        "priority": "urgent",
        "status": "pending",
        "due_date": "2026-10-31T23:59:59.000Z",
        "is_overdue": false,
        "assigner": {
          "id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
          "name": "HR Admin",
          "email": "hr.admin@company.com"
        },
        "assignee": {
          "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
          "name": "Alex Mercer",
          "email": "alex.mercer@company.com"
        }
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

---

### Endpoint #267: Organization-Wide Task Governance & Full Audit View (HR Governance)

* **API Number / Identifier:** `#267`
* **Route Name:** `getHrTaskDetail`
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/tasks/hr/:id`
* **Target Audience:** HR Administrators
* **Purpose:** Retrieves complete governance view for any task in the tenant, including full historical audit logs and notification dispatch history.
* **Business Problem Solved:** Provides legally defensible, non-repudiable proof of task lifecycle events, modifications, notifications, and actor provenance for regulatory and compliance audits.

#### Authentication & Authorization
* **Authentication:** Required (Valid JWT).
* **Role Gate:** `authorize(['hr', 'admin', 'super-admin'])`.
* **Feature Gate:** `requireFeature('tasks.access')`.
* **Tenant Isolation:** Scoped to `org_id = req.user.orgId`.

#### Request Parameters
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.

#### Domain & Business Behavior
1. Queries task with tenant scoping.
2. Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if task does not exist.
3. Eager-loads full relational context:
   * Assigner summary and Assignee summary
   * Attached files from `task_attachments`
   * Audit trail entries from `task_audit_logs` ordered by `created_at DESC`, including actor name and email
   * Notification queue entries from `task_notifications` ordered by `created_at DESC`
4. Read-only: Does NOT mutate read receipts.

#### Success Response Contract (HTTP `200 OK`)
```json
{
  "success": true,
  "message": "Task governance details retrieved successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Quarterly Sales Commission Reconciliation",
    "category": "operational",
    "priority": "high",
    "status": "pending",
    "due_date": "2026-10-16T17:00:00.000Z",
    "original_due_date": "2026-10-16T17:00:00.000Z",
    "extension_count": 0,
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:45:00.000Z",
    "last_viewed_at": "2026-10-12T11:10:00.000Z",
    "version": 1,
    "is_overdue": false,
    "attachments": [],
    "comments_count": 0,
    "assigner": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Sarah Jenkins",
      "email": "sarah.jenkins@company.com"
    },
    "assignee": {
      "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      "name": "Alex Mercer",
      "email": "alex.mercer@company.com"
    },
    "audit_logs": [
      {
        "id": "7f8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        "action": "FIRST_VIEWED",
        "from_status": "pending",
        "to_status": "pending",
        "details": {
          "first_viewed_at": "2026-10-12T10:45:00.000Z"
        },
        "ip_address": "192.168.1.45",
        "user_agent": "Mozilla/5.0 Chrome/124.0",
        "created_at": "2026-10-12T10:45:00.000Z",
        "actor": {
          "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
          "name": "Alex Mercer",
          "email": "alex.mercer@company.com"
        }
      },
      {
        "id": "6e7f8a9b-0c1d-2e3f-4a5b-6c7d8e9f0a1b",
        "action": "CREATED",
        "from_status": null,
        "to_status": "pending",
        "details": {
          "title": "Quarterly Sales Commission Reconciliation",
          "category": "operational",
          "priority": "high",
          "due_date": "2026-10-16T17:00:00.000Z",
          "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e"
        },
        "ip_address": "192.168.1.10",
        "user_agent": "Mozilla/5.0 macOS",
        "created_at": "2026-10-12T10:30:00.000Z",
        "actor": {
          "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "name": "Sarah Jenkins",
          "email": "sarah.jenkins@company.com"
        }
      }
    ],
    "notifications": [
      {
        "id": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
        "event_type": "TASK_ASSIGNED",
        "dedupe_key": "task_assigned:3fa85f64-5717-4562-b3fc-2c963f66afa6:b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
        "status": "pending",
        "attempts": 0,
        "max_attempts": 5,
        "next_retry_at": "2026-10-12T10:30:00.000Z",
        "sent_at": null,
        "created_at": "2026-10-12T10:30:00.000Z"
      }
    ]
  }
}
```

---

## 4. Security, Isolation & Production Verification

### 4.1 Multi-Tenant Isolation
* Every repository query enforces non-nullable `org_id = req.user.orgId`.
* Database foreign keys strictly enforce `ON DELETE CASCADE` back to `organizations(id)`.
* Zero cross-tenant data leakage is physically guaranteed.

### 4.2 Broken Object Level Authorization (BOLA) Protection
* **Self-Service Plane (`/api/v1/tasks/me`):** Calls to `/:id` or `/:id/status` verify `task.assignee_id === req.user.id`. Requests for other users' tasks return uniform HTTP `404 Not Found` rather than `403 Forbidden`, preventing attacker enumeration of valid task UUIDs.
* **Manager Plane (`/api/v1/tasks/manager`):** Managers attempting to view tasks outside their reporting branch are rejected with HTTP `403 Forbidden` (`FORBIDDEN`).
* **Subordinate Filter Tampering:** Filtering `team-tasks?subordinate_id=<id>` validates that the target subordinate is in the caller's reporting tree (`HierarchyAccess.getAccessibleUserIds`). If not, the request is rejected with HTTP `403 Forbidden` (`CANNOT_ACCESS_OUTSIDE_HIERARCHY`).

### 4.3 Sensitive Data Exposure Sanitization
* User references attached to tasks (`assigner`, `assignee`, `completer`, `canceller`, `actor`) are formatted via `formatUserSummary()`.
* Strips `password_hash`, `mfa_secret`, `refresh_tokens`, and internal auth tokens.
* Projects clean user summary objects: `{ id, name, email }`.

### 4.4 Idempotency Replay Protection & Fail-Open Resilience
* Create endpoints (`#255`, `#265`) inspect `Idempotency-Key`.
* Redis key pattern: `idemp:tasks:{orgId}:{key}` with a 120-second expiration.
* If Redis goes offline or connection fails, `task_idempotency.utils.js` catches errors and gracefully fails open, allowing the business transaction to proceed without disruption.

---

## 5. Phase 1 → Phase 2 Consistency & Impact Analysis

| Dimension | Phase 1 Foundation | Phase 2 Live Implementation | Architectural Consistency |
|---|---|---|:---:|
| **Public HTTP APIs** | 0 Shipped | **10 Shipped** (#249–#251, #255–#258, #265–#267) | Verified & Expected |
| **Existing Phase 1 Routes Modified** | None | None | 100% Backward Compatible |
| **Database Tables** | 5 Tables Active (`00075`) | 0 New Migrations (Reuses 5 tables) | Unchanged & Stable |
| **Zero Self-Assignment** | DB Check Constraint | Service + Validator Enforcement | Strictly Maintained |
| **Read Receipts** | DB Columns (`first_viewed_at`) | Implemented in Service on #250 | Strictly Maintained |
| **Dynamic Overdue State** | Overdue Sweep Index | Real-time DTO Evaluation (`isTaskOverdue`) | Strictly Maintained |
| **Transactional Outbox** | Table & Repository | Enqueued atomically on #255 & #265 | Strictly Maintained |
| **Optimistic Concurrency** | `version` Column | Implemented via `If-Match` on #251 | Strictly Maintained |

---

## 6. Final Coverage & Verification Audit

```text
================================================================================
               TASK ASSIGNMENT MODULE — PHASE 2 API ANALYSIS AUDIT
================================================================================

Total Phase 2 APIs Discovered:                  10 Endpoints
Total Phase 2 APIs Documented:                  10 Endpoints
New APIs Added:                                 10 Endpoints
Existing APIs Modified by Phase 2:              0 Endpoints
Phase 1 APIs Modified by Phase 2:               0 Endpoints
APIs Still Missing:                             0 Endpoints

Request Contracts Verified:                     10 / 10 (100%)
Success Responses Verified:                     10 / 10 (100%)
Error Handling Verified:                        10 / 10 (100%)
Security & Authorization Verified:              10 / 10 (100%)
Database Behavior & Transactions Verified:      10 / 10 (100%)
Side Effects & Dependencies Verified:           10 / 10 (100%)

Cross-Phase Impact:
• Phase 1 APIs Reviewed for Phase 2 Impact:     0 (Phase 1 had 0 HTTP APIs)
• Phase 1 APIs Actually Changed by Phase 2:     0
• APIs Incorrectly Assumed as Changed:          0
================================================================================
```
