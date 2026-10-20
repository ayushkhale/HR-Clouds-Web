# Combined API Analysis: Task Assignment Module (Phases 1, 2, 3 & 4)

# Phase 1: Persistence Foundation, Models & Repositories (0 HTTP APIs Shipped)

Phase 1 established the multi-tenant relational database schema (Migration `00075`), subscription entitlement mappings (Seeder `014`), Sequelize models (`Task`, `TaskAttachment`, `TaskComment`, `TaskAuditLog`, `TaskNotification`), and transaction-aware repository Service Provider Interfaces (SPI). In accordance with the Phase 1 Implementation Plan, exactly **0 public HTTP APIs** were exposed in Phase 1. All public HTTP endpoints are delivered in subsequent phases.

---

# Phase 2: Core Task Delegation, Hierarchy Engine & Self-Service Views (APIs #249–#251, #255–#258, #265–#267)

## 1. Employee Self-Service APIs (`/api/v1/tasks/me`)

### 249. GET /api/v1/tasks/me

* **API Number / Name:** `#249` / List Tasks Assigned to Caller
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/me`
* **Purpose / Business Problem Solved:** Provides employees with a centralized, filterable, and paginated work execution queue. Solves the operational challenge of fragmented email/chat requests by delivering a single source of truth for personal tasks, sorted by urgency and status.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token (`Authorization: Bearer <token>`).
* **Tenant Scoping:** `requireActiveOrg` ensures the user's organization is active. Hard-scoped to `org_id = req.user.orgId`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`. Organizations without this feature receive HTTP `403 Forbidden` (`FEATURE_NOT_AVAILABLE`).
* **Permitted Roles:** Accessible by any active tenant user (`employee`, `manager`, `hr`, `admin`, `super-admin`).
* **Resource Ownership:** Strictly scoped to the authenticated caller (`assignee_id = req.user.id`). Users cannot inspect tasks assigned to others through this endpoint.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
* **Path Parameters:** None.
* **Query Parameters:**
  * `status` (String, Optional): Filter by task status. Allowed values: `'pending'`, `'in_progress'`, `'in_review'`, `'reopened'`, `'completed'`, `'cancelled'`.
  * `priority` (String, Optional): Filter by priority. Allowed values: `'low'`, `'medium'`, `'high'`, `'urgent'`.
  * `category` (String, Optional): Filter by operational category. Allowed values: `'operational'`, `'compliance'`, `'onboarding'`, `'administrative'`, `'general'`.
  * `is_viewed` (Boolean, Optional): Filter by read-receipt status (`true` for viewed, `false` for unread).
  * `is_overdue` (Boolean, Optional): Filter by dynamic overdue state (`true` for tasks where `due_date < NOW()` and status is not terminal).
  * `search` (String, Optional): Case-insensitive search on task title (1–100 characters, trimmed).
  * `page` (Integer, Optional): Page number for pagination. Default: `1`. Minimum: `1`.
  * `limit` (Integer, Optional): Number of records per page. Default: `20`. Minimum: `1`, Maximum: `100`.

#### Request JSON Payload
* None (`GET` request).

#### Detailed API Function & Business Behavior
1. Validates query parameters using `listMyTasksQuerySchema` inside the controller (Express 5 safe).
2. Sets filter conditions: `org_id = req.user.orgId`, `assignee_id = req.user.id`.
3. If `is_overdue === true`, filters for `due_date < NOW()` and `status NOT IN ('completed', 'cancelled')`. If `false`, filters for `due_date >= NOW()` or `status IN ('completed', 'cancelled')`.
4. Eager-loads assigner summary (`User` + `UserProfile`) and assignee summary, sanitizing password hashes and auth internals.
5. Sorts tasks in descending order of creation (`created_at DESC`).
6. Dynamically projects `is_overdue: boolean` on each task DTO via `formatTaskDto()`.
7. Returns a paginated envelope containing task DTOs and pagination metadata.

#### Database Impact & Concurrency
* **Database Operations:** Read-only `SELECT` query on `tasks` joined with `users` and `user_profiles`.
* **Indexes Utilized:** `tasks_org_assignee_status_idx` `(org_id, assignee_id, status)` and `tasks_overdue_sweep_idx`.
* **Transactions:** None (Read-only).
* **Concurrency & Locks:** Non-locking query.
* **Side Effects:** None.

#### Exact Success Response Contract (HTTP 200 OK)
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
          "email": "sarah.jenkins@company.com",
          "avatar_url": "https://bucket.s3.region.amazonaws.com/org/.../avatars/...?X-Amz-Signature=...",
          "profile_image": "https://bucket.s3.region.amazonaws.com/org/.../avatars/...?X-Amz-Signature=..."
        },
        "assignee": {
          "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
          "name": "Alex Mercer",
          "email": "alex.mercer@company.com",
          "avatar_url": null,
          "profile_image": null
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

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `success` | Boolean | Execution success indicator (`true`). |
| `message` | String | Human-readable result message. |
| `data.tasks` | Array | Array of task objects assigned to the caller. |
| `data.tasks[].id` | UUID | Unique task identifier. |
| `data.tasks[].title` | String | Task summary heading (max 200 chars). |
| `data.tasks[].category` | String | Operational classification (`operational`, `compliance`, etc.). |
| `data.tasks[].priority` | String | Priority rating (`low`, `medium`, `high`, `urgent`). |
| `data.tasks[].status` | String | Lifecycle state (`pending`, `in_progress`, etc.). |
| `data.tasks[].due_date` | String | Active ISO 8601 UTC deadline. |
| `data.tasks[].original_due_date` | String | Baseline ISO 8601 UTC deadline recorded at creation. |
| `data.tasks[].is_viewed` | Boolean | True if the assignee has opened this task's detail view. |
| `data.tasks[].is_overdue` | Boolean | Dynamically evaluated flag: true if past due and unfinished. |
| `data.tasks[].assigner` | Object | Summary DTO `{ id, name, email }` of the user who assigned the task. |
| `data.tasks[].assignee` | Object | Summary DTO `{ id, name, email }` of the assigned employee. |
| `data.pagination.total` | Integer | Total matching records across all pages. |
| `data.pagination.totalPages` | Integer | Calculated page count (`ceil(total / limit)`). |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `limit must be less than or equal to 100` | Query validation fails (e.g., negative page, invalid enum). |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FEATURE_NOT_AVAILABLE` | `Feature tasks.access is not available for this organization` | Subscription plan lacks `tasks.access`. |

---

### 250. GET /api/v1/tasks/me/:id

* **API Number / Name:** `#250` / Task Detail View with Atomic Read Receipt
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/me/:id`
* **Purpose / Business Problem Solved:** Retrieves complete briefing details, reference links, and attachments for an assigned task while atomically logging non-repudiable read receipts. Eliminates the "I never saw the task" deniability excuse.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Any active tenant user.
* **Resource Ownership & BOLA Protection:** The task must exist in the tenant and `task.assignee_id === req.user.id`. If the task belongs to another employee or does not exist, returns a uniform HTTP `404 Not Found` (`TASK_NOT_FOUND`) to prevent ID enumeration.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier. Must be a valid UUID v4.
* **Query Parameters:** None.
* **Request JSON Payload:** None (`GET` request).

#### Detailed API Function & Business Behavior
1. Validates `id` path parameter format via Joi UUID validator.
2. Queries the task with tenant scoping (`org_id = req.user.orgId`).
3. Confirms caller is the designated assignee (`task.assignee_id === req.user.id`).
4. **Atomic Read Receipt Stamping (`D-T4`):**
   * If `task.is_viewed === false`: Executes `taskRepository.recordFirstView(taskId, orgId, userId)`.
   * Atomically stamps `first_viewed_at = NOW()`, `last_viewed_at = NOW()`, and `is_viewed = true`.
   * Appends an audit log record with `action = 'FIRST_VIEWED'`, recording client IP address and User-Agent.
   * If `task.is_viewed === true`: Updates `last_viewed_at = NOW()`.
5. Eager-loads attached files from `task_attachments`.
6. Formats and returns the DTO with dynamic `is_overdue` evaluation.

#### Database Impact & Concurrency
* **Database Operations:** 
  * `SELECT` on `tasks`, `users`, `user_profiles`, and `task_attachments`.
  * Conditional `UPDATE tasks SET is_viewed = true, first_viewed_at = NOW(), last_viewed_at = NOW() WHERE id = :id AND org_id = :org_id AND is_viewed = false`.
  * `INSERT` into `task_audit_logs` (`action = 'FIRST_VIEWED'`).
* **Concurrency:** The atomic conditional `WHERE is_viewed = false` update guarantees that multiple simultaneous detail fetches only stamp `first_viewed_at` once.

#### Exact Success Response Contract (HTTP 200 OK)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Task ID must be a valid UUID` | Provided `:id` is not a valid UUID format. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in the tenant, or belongs to another user. |

---

### 251. PATCH /api/v1/tasks/me/:id/status

* **API Number / Name:** `#251` / Transition Task Execution Status
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/tasks/me/:id/status`
* **Purpose / Business Problem Solved:** Enables employees to transition task execution between `pending` and `in_progress`, broadcasting active progress to managers while preventing race conditions through Optimistic Concurrency Control (`If-Match`).

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Any active tenant user.
* **Resource Ownership:** The authenticated caller must be `assignee_id`.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional/Recommended): Revision match token. Accepts either the integer `version` (e.g., `"1"`) or the exact ISO 8601 `updated_at` timestamp.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.

#### Request JSON Payload
```json
{
  "status": "in_progress"
}
```

##### Request Field Specifications
| Field | Type | Required | Allowed Values | Description |
|---|---|:---:|---|---|
| `status` | String | Yes | `'pending'`, `'in_progress'` | Desired execution status. |

#### Detailed API Function & Business Behavior
1. Validates path and body schemas.
2. Retrieves task with tenant scoping. Confirms `task.assignee_id === req.user.id`.
3. **Terminal Invariant:** If `task.status` is `'completed'` or `'cancelled'`, aborts with HTTP `409 Conflict` (`TASK_TERMINATED`).
4. **Review Gate Invariant:** If `task.status` is `'in_review'`, aborts with HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`) as submitted tasks cannot be moved without assigner review.
5. **Optimistic Concurrency Control (`D-T8`):**
   * If `If-Match` header is supplied: checks if trimmed value matches `String(task.version)` OR `new Date(task.updated_at).toISOString()`.
   * If neither matches, aborts with HTTP `412 Precondition Failed` (`PRECONDITION_FAILED`) and returns current `{ current_version, current_updated_at }`.
6. If target status matches current status, returns current DTO idempotently without database update.
7. **Database Transaction:**
   * Updates task status to `targetStatus` and marks `is_viewed = true`.
   * Increments `version` counter by 1.
   * Records audit log with `action = 'STATUS_CHANGED'`, capturing previous and new status values.

#### Database Impact & Concurrency
* **Database Operations:**
  * `UPDATE tasks SET status = :targetStatus, is_viewed = true, version = version + 1, updated_at = NOW() WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `INSERT INTO task_audit_logs`.
* **Transaction:** Atomic Sequelize transaction.

#### Exact Success Response Contract (HTTP 200 OK)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Status must be either "pending" or "in_progress"` | Invalid status passed in request body. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task not found or caller is not the assignee. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot change status of a completed task` | Task is in terminal state `completed` or `cancelled`. |
| `409 Conflict` | `INVALID_STATUS_TRANSITION` | `Task is currently under review by the assigner. Status cannot be modified directly.` | Task is currently in `in_review` status. |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | Supplied `If-Match` revision does not match current task version. |

---

## 2. Managerial Task Delegation & Oversight APIs (`/api/v1/tasks/manager`)

### 255. POST /api/v1/tasks/manager

* **API Number / Name:** `#255` / Delegate Task to Direct Subordinate
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager`
* **Purpose / Business Problem Solved:** Enables People Managers to delegate operational tasks to verified direct reports, enforcing the organizational reporting hierarchy and blocking self-assignment.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** Requires managerial or higher role: `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Reporting Hierarchy Enforcement (`D-T2`):** Dynamically validated via `HierarchyAccess.getAccessibleUserIds(orgId, req.user)`. The target `assignee_id` MUST be an active direct subordinate of the calling manager. Managers cannot delegate to peers, superiors, or users outside their reporting branch.
* **Approver Exclusion Safeguard:** A manager cannot delegate a task to an employee who holds global approver roles (`hr`, `admin`, `super-admin`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `Idempotency-Key` (String, Optional): Client UUID to prevent duplicate task creation on network retries.

#### Request JSON Payload
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

##### Request Field Specifications
| Field | Type | Required | Default | Validation & Constraints |
|---|---|:---:|:---:|---|
| `title` | String | Yes | — | 1–200 characters, trimmed, non-empty. |
| `description` | String | Yes | — | 1–5,000 characters, trimmed, non-empty. |
| `category` | String | No | `'operational'` | Enum: `'operational'`, `'compliance'`, `'onboarding'`, `'administrative'`, `'general'`. |
| `priority` | String | No | `'medium'` | Enum: `'low'`, `'medium'`, `'high'`, `'urgent'`. |
| `due_date` | String | Yes | — | ISO 8601 UTC timestamp. Must be at least 15 minutes into the future (`EC-T6`). |
| `assignee_id` | UUID | Yes | — | Target subordinate user UUID. |
| `external_links` | Array | No | `[]` | Max 10 items. Each item must have `label` (1–100 chars) and `url` (`https://` only, max 1,000 chars). |
| `attachment_tokens` | Array | No | `[]` | Max 10 staged upload tokens. |

#### Detailed API Function & Business Behavior
1. **Idempotency Guard (`D-T9`):** Checks Redis for `Idempotency-Key`. Replays cached response on hit; claims execution lock on miss.
2. **Zero Self-Delegation (`D-T3`):** Validates `req.user.id !== payload.assignee_id`. Throws HTTP `400 Bad Request` (`SELF_ASSIGNMENT_NOT_ALLOWED`) on match.
3. **Due Date Temporal Rule (`EC-T6`):** Validates `due_date >= NOW() + 15 minutes`. Throws HTTP `400 Bad Request` (`INVALID_DUE_DATE`) on violation.
4. **Target Assignee Existence:** Confirms `assignee_id` exists in tenant with an active role (`UserRole.is_active = true`). Throws HTTP `404 Not Found` (`ASSIGNEE_NOT_FOUND`) if missing.
5. **Hierarchy Resolution (`D-T2`):**
   * If caller role is `'manager'`, invokes `HierarchyAccess.getAccessibleUserIds(orgId, req.user)`.
   * Rejects with HTTP `403 Forbidden` (`CANNOT_ASSIGN_OUTSIDE_HIERARCHY`) if `assignee_id` is not in accessible subordinate list.
   * Defense-in-depth: Rejects with HTTP `403 Forbidden` (`FORBIDDEN`) if subordinate holds `GLOBAL_APPROVER_ROLES` (`hr`, `admin`, `super-admin`).
6. **Atomic Database Transaction:**
   * Inserts row into `tasks` with status `'pending'`, `version = 1`, `extension_count = 0`, `rework_count = 0`, `is_viewed = false`, `original_due_date = due_date`.
   * Inserts row into `task_audit_logs` with `action = 'CREATED'`.
   * Enqueues notification into `task_notifications` with `event_type = 'TASK_ASSIGNED'` and deterministic deduplication key `task_assigned:${task.id}:${task.assignee_id}`.
7. Caches DTO in Redis (TTL: 120s) if idempotency key was supplied.

#### Database Impact & Concurrency
* **Database Operations:** Single atomic transaction writing to `tasks`, `task_audit_logs`, and `task_notifications`.
* **Idempotency:** Managed via Redis key `idemp:tasks:{orgId}:{key}` (120-second TTL). Fails open if cache is offline.

#### Exact Success Response Contract (HTTP 201 Created)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `SELF_ASSIGNMENT_NOT_ALLOWED` | `Self-assignment is not permitted. Tasks represent managerial delegation.` | `assigner_id === assignee_id`. |
| `400 Bad Request` | `INVALID_DUE_DATE` | `Task due date must be at least 15 minutes into the future` | Due date is in the past or within 15 minutes. |
| `400 Bad Request` | `VALIDATION_ERROR` | `Task title is required` | Missing mandatory field. |
| `403 Forbidden` | `CANNOT_ASSIGN_OUTSIDE_HIERARCHY` | `You can only assign tasks to your direct active subordinates` | Target assignee is not a subordinate of the manager. |
| `403 Forbidden` | `FORBIDDEN` | `Managers cannot assign tasks to HR or Administrative personnel` | Subordinate holds global approver roles. |
| `404 Not Found` | `ASSIGNEE_NOT_FOUND` | `Assignee not found in this organization` | Assignee does not exist or has inactive user role. |

---

### 256. GET /api/v1/tasks/manager/assigned-by-me

* **API Number / Name:** `#256` / List Tasks Delegated by Caller
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/manager/assigned-by-me`
* **Purpose / Business Problem Solved:** Provides managers with a dedicated tracking dashboard of all tasks they have delegated, highlighting unread tasks and pending submissions.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Filter Scope:** Hard-scoped to `assigner_id = req.user.id` and `org_id = req.user.orgId`.

#### Request Parameters
* **Query Parameters:**
  * `assignee_id` (UUID, Optional): Filter by specific subordinate assignee.
  * `status` (String, Optional): Filter by status.
  * `priority` (String, Optional): Filter by priority.
  * `category` (String, Optional): Filter by category.
  * `is_overdue` (Boolean, Optional): Filter by dynamic overdue state.
  * `search` (String, Optional): Title search query.
  * `page` (Integer, Optional): Page number. Default: `1`.
  * `limit` (Integer, Optional): Page size. Default: `20`.

#### Exact Success Response Contract (HTTP 200 OK)
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

### 257. GET /api/v1/tasks/manager/team-tasks

* **API Number / Name:** `#257` / List Tasks Assigned to Reporting Team
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/manager/team-tasks`
* **Purpose / Business Problem Solved:** Enables managers to monitor total team workload across all direct reports (including tasks delegated by HR or other senior stakeholders).

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Hierarchy Enforcement:** Resolves direct subordinates via `HierarchyAccess.getAccessibleUserIds()`.

#### Request Parameters
* **Query Parameters:**
  * `subordinate_id` (UUID, Optional): Filter by a specific direct subordinate. Validated against caller's hierarchy.
  * `status`, `priority`, `category`, `is_overdue`, `search`, `page`, `limit`: Standard filters.

#### Detailed API Function & Business Behavior
1. If caller is `'manager'`, fetches `accessibleUserIds`.
2. If manager has zero reporting subordinates, returns `{ tasks: [], pagination: { total: 0, page, limit, totalPages: 1 } }`.
3. If `subordinate_id` is supplied: confirms `accessibleUserIds.includes(subordinate_id)`. Rejects with HTTP `403 Forbidden` (`CANNOT_ACCESS_OUTSIDE_HIERARCHY`) if subordinate is outside reporting tree.
4. Filters repository query with `assignee_ids = accessibleUserIds`.

#### Exact Success Response Contract (HTTP 200 OK)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `403 Forbidden` | `CANNOT_ACCESS_OUTSIDE_HIERARCHY` | `You do not have permission to view tasks for this employee` | `subordinate_id` is not in caller's direct reporting line. |

---

### 258. GET /api/v1/tasks/manager/:id

* **API Number / Name:** `#258` / Subordinate Task Detail View
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id`
* **Purpose / Business Problem Solved:** Allows managers to inspect full specifications and progress of a subordinate's task without mutating read receipts.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Access Boundary:** Caller must be either the task's `assigner_id` OR the direct manager of the `assignee_id`.

#### Request Parameters
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.

#### Detailed API Function & Business Behavior
1. Queries task with tenant scoping. If not found, throws HTTP `404 Not Found` (`TASK_NOT_FOUND`).
2. If caller is not a global approver and `task.assigner_id !== req.user.id`:
   * Resolves caller's `accessibleUserIds`.
   * Rejects with HTTP `403 Forbidden` (`FORBIDDEN`) if `task.assignee_id` is not in accessible list.
3. **Read-Only Invariant (`D-T4`):** Does NOT modify `is_viewed`, `first_viewed_at`, or `last_viewed_at`.

#### Exact Success Response Contract (HTTP 200 OK)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to view this task` | Caller is neither the assigner nor the assignee's direct manager. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in the organization. |

---

## 3. HR & Administrative Governance APIs (`/api/v1/tasks/hr`)

### 265. POST /api/v1/tasks/hr

* **API Number / Name:** `#265` / Organization-Wide Task Delegation
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/hr`
* **Purpose / Business Problem Solved:** Enables HR Administrators to assign mandatory statutory, compliance, onboarding, and administrative tasks organization-wide without reporting hierarchy boundaries.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** `authorize(['hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Delegation Scope:** Global tenant delegation (can delegate to any active employee or manager in the organization).

#### Request Parameters & Body
* **Headers:** `Authorization: Bearer <jwt>`, `Idempotency-Key` (Optional).
* **Request JSON Payload:** Identical to `#255`.

#### Detailed API Function & Business Behavior
* Bypasses manager hierarchy checks; confirms target assignee exists in the tenant with an active role.
* Enforces Zero Self-Assignment (`D-T3`) and minimum 15-minute future due date (`EC-T6`).
* Atomically persists task, audit log (`CREATED`), and transactional outbox notification (`TASK_ASSIGNED`).

#### Exact Success Response Contract (HTTP 201 Created)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `SELF_ASSIGNMENT_NOT_ALLOWED` | `Self-assignment is not permitted. Tasks represent managerial delegation.` | HR user attempted to assign a task to themselves. |
| `400 Bad Request` | `INVALID_DUE_DATE` | `Task due date must be at least 15 minutes into the future` | Due date is in the past or within 15 minutes. |
| `403 Forbidden` | `FORBIDDEN` | `Forbidden: insufficient permissions` | Caller role is not `hr`, `admin`, or `super-admin`. |
| `404 Not Found` | `ASSIGNEE_NOT_FOUND` | `Assignee not found in this organization` | Target user does not exist in the tenant. |

---

### 266. GET /api/v1/tasks/hr

* **API Number / Name:** `#266` / Organization-Wide Task Registry
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/hr`
* **Purpose / Business Problem Solved:** Centralized governance search registry across all company tasks with departmental filtering.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** `authorize(['hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.

#### Request Parameters
* **Query Parameters:**
  * `department_id` (UUID, Optional): Filter by organizational department. Resolves to employee user IDs via `EmployeeProfile`.
  * `assigner_id` (UUID, Optional): Filter by delegating user.
  * `assignee_id` (UUID, Optional): Filter by assigned employee.
  * `status`, `priority`, `category`, `is_overdue`, `search`, `page`, `limit`: Standard filters.

#### Detailed API Function & Business Behavior
* If `department_id` is supplied: Queries `db.EmployeeProfile` to resolve all user IDs belonging to that department. If no profiles match, returns an empty paginated envelope immediately.
* Performs paginated search across all tasks in tenant with user profile hydration.

#### Exact Success Response Contract (HTTP 200 OK)
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

### 267. GET /api/v1/tasks/hr/:id

* **API Number / Name:** `#267` / Full Governance Task Detail with Audit & Notification History
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/hr/:id`
* **Purpose / Business Problem Solved:** Provides HR Administrators with complete operational and legal auditability, displaying all task specifications, full chronological audit log entries, and transactional notification dispatch logs.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** `authorize(['hr', 'admin', 'super-admin'])`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Tenant Isolation:** Scoped to `org_id = req.user.orgId`.

#### Request Parameters
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.

#### Detailed API Function & Business Behavior
1. Queries task with tenant scoping. Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if missing.
2. Eager-loads full relational context:
   * Assigner summary and Assignee summary
   * Attached files from `task_attachments`
   * Audit trail entries from `task_audit_logs` ordered by `created_at DESC`, including actor name and email
   * Notification queue entries from `task_notifications` ordered by `created_at DESC`
3. Read-only: Does NOT mutate read receipts.

#### Exact Success Response Contract (HTTP 200 OK)
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

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in the tenant organization. |

---

## 4. Existing APIs Modified / Extended by Phase 2

* **No Existing APIs Were Modified:** Phase 1 established the database models, tables, and internal repository SPI with zero public HTTP routes. Phase 2 introduces 10 completely new HTTP endpoints without altering any existing contracts in other modules (`auth`, `organization`, `leave`, `payrolls`, `documents`, `attendance`, or `settings`).

---

# Phase 3: Task Lifecycle Transitions, Deliverable Review Gates, Administrative Workflows & Two-Mode S3 Attachments (APIs #252, #259–#263, #268–#270)

## 1. Employee Self-Service Deliverable Submission APIs (`/api/v1/tasks/me`)

### 252. POST /api/v1/tasks/me/:id/submit

* **API Number / Name:** `#252` / Submit Task Deliverables for Review
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/me/:id/submit`
* **Purpose / Business Problem Solved:** Enables an assigned employee to submit completed deliverables, explanatory work notes, external links (e.g., Pull Requests, Figma designs, Google Docs), and uploaded files for manager/HR review. Transitions the task from active execution (`in_progress` or `reopened`) into the review queue (`in_review`), establishing a non-repudiable timestamped submission record.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token (`Authorization: Bearer <token>`).
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId` via `requireActiveOrg`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Accessible by any active tenant user (`employee`, `manager`, `hr`, `admin`, `super-admin`).
* **Resource Ownership & BOLA Protection:** The caller must be the designated assignee of the task (`task.assignee_id === req.user.id`). If the task belongs to another employee or does not exist within the tenant, returns HTTP `404 Not Found` (`TASK_NOT_FOUND`) to prevent ID enumeration.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional): Client-provided ETag version (e.g., `"1"`, `W/"1"`, or ISO timestamp `"2026-10-12T10:00:00.000Z"`). Required for strict Optimistic Concurrency Control (`D-T8`).
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier. Must be a valid UUID v4.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `submission_note` | String | **Required** | Min 10, Max 2000 chars, trimmed | Summary of deliverables completed and notes for the reviewer. |
| `attachment_ids` | Array\<UUID\> | Optional | Max 10 UUIDs, default `[]` | Array of confirmed attachment IDs uploaded for this task deliverable. |
| `external_links` | Array\<Object\> | Optional | Max 5 objects, default `[]` | Supporting external reference links. |
| `external_links[].label` | String | **Required** | Min 1, Max 100 chars, trimmed | Descriptive name of the link (e.g., "Pull Request"). |
| `external_links[].url` | String | **Required** | Valid `https://` URI, Max 1000 chars | Secure URL pointing to external work product. |

##### Example Request Payload
```json
{
  "submission_note": "Completed Q3 Regional Variance analysis. Reconciled western sales figures against budgeted targets and documented discrepancies in attached sheet.",
  "attachment_ids": [
    "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b"
  ],
  "external_links": [
    {
      "label": "Western Region Reconciled Sheet",
      "url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
    }
  ]
}
```

#### Detailed API Function & Business Behavior
1. Validates `id` path parameter format via `taskIdParamSchema`.
2. Validates request body using `submitTaskSchema`.
3. Queries task with tenant scoping (`org_id = req.user.orgId`). Confirms caller is assignee (`task.assignee_id === req.user.id`).
4. **Lifecycle State Transition Validation:**
   * If task is in terminal status (`completed` or `cancelled`): Throws HTTP `409 Conflict` (`TASK_TERMINATED`).
   * If task is `pending`: Throws HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`) with message `"Cannot submit deliverables for a task in pending status. Please start work on the task first."`.
   * If task is `in_review`: Throws HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`) with message `"Task is already under review"`.
   * Allowed source statuses: `'in_progress'`, `'reopened'`.
5. **Optimistic Concurrency Control Guard (`D-T8`):** Compares `If-Match` header against `task.version` or `task.updated_at`. Throws HTTP `412 Precondition Failed` (`PRECONDITION_FAILED`) if stale.
6. **Atomic Sequelize Database Transaction:**
   * Appends any new external links to `task.external_links`.
   * Updates task: `status = 'in_review'`, `submitted_at = NOW()`, `external_links`. Atomic SQL `WHERE version = expectedVersion` increments `version = version + 1`.
   * If `attachment_ids` provided: Updates matching rows in `task_attachments` table with `attachment_context = 'submission'`. Verifies all IDs exist and belong to the task and tenant.
   * Records audit trail entry in `task_audit_logs`: `action = 'SUBMITTED'`, `from_status = previousStatus`, `to_status = 'in_review'`, capturing IP and User-Agent.
   * Enqueues transactional outbox notification in `task_notifications`: `event_type = 'TASK_SUBMITTED'`, `recipient_id = task.assigner_id`, `dedupe_key = task_submitted:{taskId}:{newVersion}`.
7. Eager-loads user associations and attachments, returning formatted task DTO (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:**
  * `SELECT` on `tasks` (scoped by `id` and `org_id`).
  * `UPDATE tasks SET status = 'in_review', submitted_at = NOW(), external_links = :links, version = version + 1 WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `UPDATE task_attachments SET attachment_context = 'submission' WHERE id IN (:attachmentIds) AND task_id = :id AND org_id = :org_id`.
  * `INSERT INTO task_audit_logs` (`action = 'SUBMITTED'`).
  * `INSERT INTO task_notifications` (`event_type = 'TASK_SUBMITTED'`).
* **Concurrency & Locks:** Atomic version check prevents concurrent lost updates.
* **Side Effects:** Transactional outbox notification dispatch to assigner.

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Task deliverables submitted for review successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "in_review",
    "due_date": "2026-10-15T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 0,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:15:00.000Z",
    "last_viewed_at": "2026-10-12T14:30:00.000Z",
    "external_links": [
      {
        "label": "Western Region Reconciled Sheet",
        "url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
      }
    ],
    "rework_count": 0,
    "reassignment_count": 0,
    "submitted_at": "2026-10-12T15:00:00.000Z",
    "completed_at": null,
    "completed_by": null,
    "is_completed_on_time": null,
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "version": 2,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T15:00:00.000Z",
    "deleted_at": null,
    "is_overdue": false,
    "attachments": [
      {
        "id": "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
        "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
        "task_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "uploader_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
        "storage_key": "org/7ca642c2-8097-40c2-9013-176313ef0101/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6/8c9d0e1f_deliverable.pdf",
        "file_name": "deliverable.pdf",
        "file_size_bytes": 1048576,
        "content_type": "application/pdf",
        "attachment_context": "submission",
        "created_at": "2026-10-12T14:55:00.000Z",
        "updated_at": "2026-10-12T15:00:00.000Z",
        "deleted_at": null
      }
    ],
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

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `success` | Boolean | Execution success indicator (`true`). |
| `message` | String | Human-readable result message. |
| `data.id` | UUID | Unique task identifier. |
| `data.status` | String | Updated lifecycle state: `'in_review'`. |
| `data.submitted_at` | String | ISO 8601 UTC timestamp of deliverable submission. |
| `data.version` | Integer | Incremented OCC record version. |
| `data.attachments` | Array | Hydrated array of attachments bound to this task. |
| `data.attachments[].attachment_context` | String | Context updated to `'submission'`. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Submission note must be at least 10 characters long` | Payload fails schema validation. |
| `400 Bad Request` | `INVALID_ATTACHMENT_ID` | `One or more attachment IDs do not exist or belong to this task` | Attachment ID not found or not bound to this task. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FEATURE_NOT_AVAILABLE` | `Feature tasks.access is not available for this organization` | Plan lacks task entitlement. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant or caller is not assignee. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot submit deliverables for a completed task` | Task is in terminal status (`completed` or `cancelled`). |
| `409 Conflict` | `INVALID_STATUS_TRANSITION` | `Cannot submit deliverables for a task in pending status. Please start work on the task first.` | Task is still in `pending` status. |
| `409 Conflict` | `INVALID_STATUS_TRANSITION` | `Task is already under review` | Task is already in `in_review` status. |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | OCC `If-Match` version mismatch. |

---

## 2. Manager & Review Plane Administrative Workflows (`/api/v1/tasks/manager`)

### 259. POST /api/v1/tasks/manager/:id/approve

* **API Number / Name:** `#259` / Approve Task Deliverable & Complete Task
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/approve`
* **Purpose / Business Problem Solved:** Formally accepts submitted deliverables for a task in review, transitions the task into the terminal `completed` status, computes whether work was delivered on time (`is_completed_on_time`), stamps completion timestamps, and notifies the assignee.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Hierarchy Access Verification (`D-T2`):**
  * Global Approvers (`hr`, `admin`, `super-admin`) can approve tasks across the tenant organization.
  * Managers can approve if they are the direct `assigner_id` OR if the task's assignee is in their active direct reporting line (`hierarchyAccess.getAccessibleUserIds`).
  * Other callers receive HTTP `403 Forbidden` (`FORBIDDEN`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional): ETag version for Optimistic Concurrency Control.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `approval_note` | String | Optional | Max 1000 chars, nullable | Optional manager feedback or acceptance commentary. |

##### Example Request Payload
```json
{
  "approval_note": "Excellent variance breakdown. Western sales reconciling models are approved for executive presentation."
}
```

#### Detailed API Function & Business Behavior
1. Validates `id` path parameter and `approveTaskSchema`.
2. Queries task with tenant scoping (`org_id = req.user.orgId`). Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if missing.
3. **Status Validation:**
   * If `task.status === 'completed'`: Throws HTTP `409 Conflict` (`TASK_COMPLETED`).
   * If `task.status !== 'in_review'`: Throws HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`) with message `"Task must be in review status to be approved"`.
4. Evaluates caller hierarchy authority.
5. Verifies OCC `If-Match` header.
6. Evaluates on-time completion: `is_completed_on_time = dayjs().isBefore(task.due_date) || dayjs().isSame(task.due_date)`.
7. **Atomic Sequelize Database Transaction:**
   * Updates task: `status = 'completed'`, `completed_at = NOW()`, `completed_by = req.user.id`, `is_completed_on_time = isCompletedOnTime`, increments `version`.
   * Records audit log in `task_audit_logs`: `action = 'COMPLETED'`, `from_status = 'in_review'`, `to_status = 'completed'`, details `{ approval_note, is_completed_on_time }`.
   * Enqueues transactional outbox notification in `task_notifications`: `event_type = 'TASK_COMPLETED'`, `recipient_id = task.assignee_id`, `dedupe_key = task_completed:{taskId}:{newVersion}`.
8. Returns formatted task DTO (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:**
  * `UPDATE tasks SET status = 'completed', completed_at = NOW(), completed_by = :userId, is_completed_on_time = :bool, version = version + 1 WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `INSERT INTO task_audit_logs` (`action = 'COMPLETED'`).
  * `INSERT INTO task_notifications` (`event_type = 'TASK_COMPLETED'`).
* **Concurrency:** Guaranteed single-completion via OCC version check.

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Task approved and marked as completed successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "completed",
    "due_date": "2026-10-15T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 0,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:15:00.000Z",
    "last_viewed_at": "2026-10-12T14:30:00.000Z",
    "external_links": [],
    "rework_count": 0,
    "reassignment_count": 0,
    "submitted_at": "2026-10-12T15:00:00.000Z",
    "completed_at": "2026-10-12T16:00:00.000Z",
    "completed_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "is_completed_on_time": true,
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "version": 3,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T16:00:00.000Z",
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
    },
    "completer": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Sarah Jenkins",
      "email": "sarah.jenkins@company.com"
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.status` | String | Terminal completed state: `'completed'`. |
| `data.completed_at` | String | ISO 8601 UTC timestamp when manager accepted deliverables. |
| `data.completed_by` | UUID | User ID of the manager or HR administrator who approved. |
| `data.is_completed_on_time` | Boolean | True if `completed_at <= due_date`; false if approved past deadline. |
| `data.completer` | Object | Sanitized user summary `{ id, name, email }` of the approver. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `approval_note must be a string` | Payload validation failure. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to approve this task` | Caller does not manage assignee or have global approval role. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant organization. |
| `409 Conflict` | `TASK_COMPLETED` | `Task is already completed` | Task has already been approved and completed. |
| `409 Conflict` | `INVALID_STATUS_TRANSITION` | `Task must be in review status to be approved` | Task is in `pending`, `in_progress`, or `reopened`. |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | OCC version conflict. |

---

### 260. POST /api/v1/tasks/manager/:id/reopen

* **API Number / Name:** `#260` / Reject Deliverable & Request Rework / Privileged HR Reopen
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/reopen`
* **Purpose / Business Problem Solved:** Rejects substandard work submitted for review and returns the task to the assignee in `reopened` status with mandatory structured feedback. Automatically posts the rework reason to the task discussion board, increments the rework counter, and flags an alert if excessive rework ($\ge 5$ cycles) is detected. Also enables HR Administrators to perform privileged reopens on previously completed tasks with audited justification.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Privileged HR Reopen Gating (`EC-T8`):**
  * When task is currently `completed`: Plain managers are rejected with HTTP `409 Conflict` (`TASK_TERMINATED`). Only Global Approvers (`hr`, `admin`, `super-admin`) are permitted to reopen completed tasks, requiring a justification of at least 15 characters.
  * When task is `in_review`: Permitted for the task assigner, direct line manager of the assignee, or HR/Admin.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional): ETag version for OCC.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `reopen_reason` | String | **Required** | Min 10 (Min 15 if privileged), Max 2000 chars, trimmed | Required operational feedback detailing why rework is needed. |

##### Example Request Payload
```json
{
  "reopen_reason": "The Western region sales figures do not reconcile with the updated July tax returns. Please adjust rows 45-60 and resubmit."
}
```

#### Detailed API Function & Business Behavior
1. Validates `id` and `reopenTaskSchema`.
2. Queries task with tenant scoping. Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if missing.
3. If `task.status === 'cancelled'`: Throws HTTP `409 Conflict` (`TASK_TERMINATED`).
4. **Status & Role Branching:**
   * If `task.status === 'completed'`:
     * If caller role is not in `GLOBAL_APPROVER_ROLES`: Throws HTTP `409 Conflict` (`TASK_TERMINATED`) with message `"Task is completed and cannot be reopened by a manager. Only HR or Admin can reopen completed tasks."`.
     * Validates `payload.reopen_reason.length >= 15`. Throws HTTP `400 Bad Request` (`VALIDATION_ERROR`) if under 15 characters.
   * If `task.status !== 'completed'`:
     * Must be in `in_review`. If not, throws HTTP `409 Conflict` (`INVALID_STATUS_TRANSITION`) with message `"Task must be in review status to request rework"`.
     * Evaluates caller hierarchy access.
5. Computes `newReworkCount = (task.rework_count || 0) + 1` and `isExcessiveRework = newReworkCount >= 5`.
6. Verifies OCC `If-Match` header.
7. **Atomic Sequelize Database Transaction:**
   * Updates task: `status = 'reopened'`, `rework_count = newReworkCount`, nullifies `completed_at`, `completed_by`, `is_completed_on_time`, increments `version`.
   * Injects system-generated comment in `task_comments`: `message = 'REWORK REQUESTED: ' + reopen_reason`, `author_id = req.user.id`, `system_generated = true`.
   * Records audit log in `task_audit_logs`: `action = (previousStatus === 'completed' ? 'PRIVILEGED_REOPEN' : 'REOPENED')`, details `{ reopen_reason, rework_count, excessive_rework_alert }`.
   * Enqueues notification in `task_notifications`: `event_type = 'TASK_REOPENED'`, `recipient_id = task.assignee_id`, `dedupe_key = task_reopened:{taskId}:{newReworkCount}`.
8. Returns formatted task DTO (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:**
  * `UPDATE tasks SET status = 'reopened', rework_count = rework_count + 1, completed_at = NULL, completed_by = NULL, is_completed_on_time = NULL, version = version + 1 WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `INSERT INTO task_comments` (`message = 'REWORK REQUESTED: ...'`, `system_generated = true`).
  * `INSERT INTO task_audit_logs` (`action = 'REOPENED'` or `'PRIVILEGED_REOPEN'`).
  * `INSERT INTO task_notifications` (`event_type = 'TASK_REOPENED'`).

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Task deliverable rejected and rework requested successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "reopened",
    "due_date": "2026-10-15T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 0,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:15:00.000Z",
    "last_viewed_at": "2026-10-12T14:30:00.000Z",
    "external_links": [],
    "rework_count": 1,
    "reassignment_count": 0,
    "submitted_at": "2026-10-12T15:00:00.000Z",
    "completed_at": null,
    "completed_by": null,
    "is_completed_on_time": null,
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "version": 4,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T16:30:00.000Z",
    "deleted_at": null,
    "is_overdue": false,
    "attachments": [],
    "comments_count": 1,
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

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.status` | String | Reopened lifecycle state: `'reopened'`. |
| `data.rework_count` | Integer | Incremented rework cycle count (e.g., `1`). |
| `data.completed_at` | Null | Reset to null when task is reopened. |
| `data.comments_count` | Integer | Incremented due to auto-injected system rework comment. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Reopen reason must be at least 10 characters long` | Payload validation failure. |
| `400 Bad Request` | `VALIDATION_ERROR` | `Privileged reopen of a completed task requires a detailed justification (minimum 15 characters)` | HR reopen on completed task has reason shorter than 15 chars. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to request rework on this task` | Caller does not manage assignee or have global approval role. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant organization. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot reopen a cancelled task` | Task is in `cancelled` status. |
| `409 Conflict` | `TASK_TERMINATED` | `Task is completed and cannot be reopened by a manager. Only HR or Admin can reopen completed tasks.` | Regular manager attempts to reopen a completed task. |
| `409 Conflict` | `INVALID_STATUS_TRANSITION` | `Task must be in review status to request rework` | Task is in `pending` or `in_progress`. |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | OCC version conflict. |

---

### 261. POST /api/v1/tasks/manager/:id/reassign

* **API Number / Name:** `#261` / Reassign Task to New Assignee
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/reassign`
* **Purpose / Business Problem Solved:** Transfers operational accountability of an active task to another eligible employee within the reporting line (e.g., in cases of sudden illness, leave, emergency reallocation, or workload rebalancing). Atomically resets the read-receipt receipt (`is_viewed = false`), increments reassignment tracking, enforces overdue deadline adjustments (`EC-T7`), and preserves complete audit continuity.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Zero Self-Delegation Guard (`D-T3`):** Callers cannot reassign a task to themselves (`new_assignee_id !== req.user.id`). Throws HTTP `400 Bad Request` (`SELF_ASSIGNMENT_NOT_ALLOWED`).
* **Hierarchy Access Verification (`D-T1, D-T2`):**
  * Managers can only reassign to active employees within their direct subordinate subtree (`hierarchyAccess.getAccessibleUserIds`).
  * Managers cannot reassign tasks to HR or Administrative personnel (throws HTTP `403 Forbidden`).
  * Global Approvers (`hr`, `admin`, `super-admin`) can reassign across the organization.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional): ETag version for OCC.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `new_assignee_id` | UUID | **Required** | Valid UUID v4 | Identifier of the new active employee receiving the task. |
| `reason` | String | **Required** | Min 10, Max 1000 chars, trimmed | Operational explanation for reassigning the task. |
| `new_due_date` | String | Conditional | Valid ISO 8601 UTC date string | Mandatory if task is overdue (`EC-T7`); must be $\ge 15$ min in future. |

##### Example Request Payload
```json
{
  "new_assignee_id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
  "reason": "Alex Mercer is out on unplanned medical leave. Reassigning Western variance analysis to Jordan for completion.",
  "new_due_date": "2026-10-18T18:00:00.000Z"
}
```

#### Detailed API Function & Business Behavior
1. Validates `id` and `reassignTaskSchema`.
2. Queries task with tenant scoping. Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if missing.
3. If task is in terminal status (`completed` or `cancelled`): Throws HTTP `409 Conflict` (`TASK_TERMINATED`).
4. Rejects self-reassignment: If `payload.new_assignee_id === req.user.id`, throws HTTP `400 Bad Request` (`SELF_ASSIGNMENT_NOT_ALLOWED`).
5. Rejects redundant reassignment: If `payload.new_assignee_id === task.assignee_id`, throws HTTP `400 Bad Request` (`INVALID_REASSIGNMENT`) with message `"Task is already assigned to this user"`.
6. Validates that `new_assignee_id` exists and has an active role in `org_id`. Throws HTTP `404 Not Found` (`ASSIGNEE_NOT_FOUND`) if missing.
7. Evaluates manager hierarchy boundaries.
8. **Overdue Reassignment Policy (`EC-T7`):**
   * Computes dynamic overdue state via `isTaskOverdue(task)`.
   * If task is overdue: `new_due_date` is strictly mandatory. If omitted, throws HTTP `400 Bad Request` (`OVERDUE_REASSIGNMENT_REQUIRES_NEW_DUE_DATE`).
   * Validates `new_due_date` is at least 15 minutes into the future.
9. Verifies OCC `If-Match` header.
10. **Atomic Sequelize Database Transaction:**
    * Updates task:
      * `assignee_id = new_assignee_id`
      * Resets read receipt: `is_viewed = false`, `first_viewed_at = null`, `last_viewed_at = null`
      * `reassignment_count = (task.reassignment_count || 0) + 1`
      * If `new_due_date` provided: updates `due_date` and increments `extension_count = (task.extension_count || 0) + 1`
      * If task was in `in_review`: resets status to `in_progress` to allow new assignee to review and modify deliverables
      * Increments `version = version + 1`
    * Records audit log in `task_audit_logs`: `action = 'REASSIGNED'`, details `{ previous_assignee_id, new_assignee_id, reason, new_due_date }`.
    * Enqueues notification in `task_notifications`: `event_type = 'TASK_ASSIGNED'`, `recipient_id = new_assignee_id`, `dedupe_key = task_assigned:{taskId}:{new_assignee_id}`.
11. Returns formatted task DTO (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:**
  * `UPDATE tasks SET assignee_id = :newId, is_viewed = false, first_viewed_at = NULL, last_viewed_at = NULL, reassignment_count = reassignment_count + 1, version = version + 1 WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `INSERT INTO task_audit_logs` (`action = 'REASSIGNED'`).
  * `INSERT INTO task_notifications` (`event_type = 'TASK_ASSIGNED'`).
* **Concurrency:** Guarded by OCC version check.

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Task reassigned successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "in_progress",
    "due_date": "2026-10-18T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 1,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
    "is_viewed": false,
    "first_viewed_at": null,
    "last_viewed_at": null,
    "external_links": [],
    "rework_count": 0,
    "reassignment_count": 1,
    "submitted_at": null,
    "completed_at": null,
    "completed_by": null,
    "is_completed_on_time": null,
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "version": 5,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T17:00:00.000Z",
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
      "id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
      "name": "Jordan Hayes",
      "email": "jordan.hayes@company.com"
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.assignee_id` | UUID | Updated assignee identifier. |
| `data.is_viewed` | Boolean | Reset to `false` for new assignee. |
| `data.reassignment_count` | Integer | Incremented reassignment counter. |
| `data.assignee` | Object | User summary `{ id, name, email }` of new assignee. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `reason must be at least 10 characters long` | Payload validation failure. |
| `400 Bad Request` | `SELF_ASSIGNMENT_NOT_ALLOWED` | `Self-assignment is not permitted` | Caller specifies own user ID as `new_assignee_id`. |
| `400 Bad Request` | `INVALID_REASSIGNMENT` | `Task is already assigned to this user` | Target is already current assignee. |
| `400 Bad Request` | `OVERDUE_REASSIGNMENT_REQUIRES_NEW_DUE_DATE` | `Reassigning an overdue task requires specifying a new future due date` | Reassigning overdue task without new due date. |
| `400 Bad Request` | `INVALID_DUE_DATE` | `New due date must be at least 15 minutes into the future` | Due date in past or under 15 minutes. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `CANNOT_ASSIGN_OUTSIDE_HIERARCHY` | `You can only reassign tasks to your direct active subordinates` | Target employee not in manager's reporting line. |
| `403 Forbidden` | `FORBIDDEN` | `Managers cannot assign tasks to HR or Administrative personnel` | Manager delegating upward to admin/HR. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant organization. |
| `404 Not Found` | `ASSIGNEE_NOT_FOUND` | `New assignee not found in this organization` | Target user ID does not exist or inactive. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot reassign a completed task` | Task is in terminal status (`completed` or `cancelled`). |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | OCC version conflict. |

---

### 262. POST /api/v1/tasks/manager/:id/cancel

* **API Number / Name:** `#262` / Cancel Active Task
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/cancel`
* **Purpose / Business Problem Solved:** Terminates an unneeded or obsolete task, recording mandatory cancellation justification, cancellation timestamp, and user accountability. Protects data integrity by preventing completed tasks from being cancelled (`EC-T4`).

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Hierarchy Access Verification:** Permitted for the task assigner, direct line manager of the assignee, or HR/Admin.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional): ETag version for OCC.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `cancellation_reason` | String | **Required** | Min 10, Max 500 chars, trimmed | Required operational justification for cancelling the task. |

##### Example Request Payload
```json
{
  "cancellation_reason": "Regional sales division targets restructured following executive board meeting. Task requirements superseded by national initiative."
}
```

#### Detailed API Function & Business Behavior
1. Validates `id` and `cancelTaskSchema`.
2. Queries task with tenant scoping. Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if missing.
3. **Terminal State Protection (`EC-T4`):**
   * If `task.status === 'completed'`: Throws HTTP `409 Conflict` (`TASK_COMPLETED`) with message `"Cannot cancel a completed task"`.
   * If `task.status === 'cancelled'`: Throws HTTP `409 Conflict` (`TASK_TERMINATED`) with message `"Task is already cancelled"`.
4. Evaluates caller hierarchy access.
5. Verifies OCC `If-Match` header.
6. **Atomic Sequelize Database Transaction:**
   * Updates task: `status = 'cancelled'`, `cancelled_at = NOW()`, `cancelled_by = req.user.id`, `cancellation_reason = payload.cancellation_reason.trim()`, increments `version`.
   * Records audit log in `task_audit_logs`: `action = 'CANCELLED'`, `from_status = previousStatus`, `to_status = 'cancelled'`, details `{ cancellation_reason }`.
   * Enqueues notification in `task_notifications`: `event_type = 'TASK_CANCELLED'`, `recipient_id = task.assignee_id`, `dedupe_key = task_cancelled:{taskId}:{newVersion}`.
7. Returns formatted task DTO (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:**
  * `UPDATE tasks SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = :userId, cancellation_reason = :reason, version = version + 1 WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `INSERT INTO task_audit_logs` (`action = 'CANCELLED'`).
  * `INSERT INTO task_notifications` (`event_type = 'TASK_CANCELLED'`).

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Task cancelled successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "cancelled",
    "due_date": "2026-10-15T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 0,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:15:00.000Z",
    "last_viewed_at": "2026-10-12T14:30:00.000Z",
    "external_links": [],
    "rework_count": 0,
    "reassignment_count": 0,
    "submitted_at": null,
    "completed_at": null,
    "completed_by": null,
    "is_completed_on_time": null,
    "cancelled_at": "2026-10-12T17:30:00.000Z",
    "cancelled_by": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "cancellation_reason": "Regional sales division targets restructured following executive board meeting. Task requirements superseded by national initiative.",
    "version": 6,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T17:30:00.000Z",
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
    },
    "canceller": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Sarah Jenkins",
      "email": "sarah.jenkins@company.com"
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.status` | String | Terminal cancelled state: `'cancelled'`. |
| `data.cancelled_at` | String | ISO 8601 UTC timestamp of cancellation. |
| `data.cancelled_by` | UUID | Identifier of user who cancelled the task. |
| `data.cancellation_reason` | String | Operational reason explaining termination. |
| `data.canceller` | Object | Sanitized user summary `{ id, name, email }` of canceller. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `cancellation_reason must be at least 10 characters long` | Payload validation failure. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to cancel this task` | Caller does not manage assignee or have global approval role. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant organization. |
| `409 Conflict` | `TASK_COMPLETED` | `Cannot cancel a completed task` | Attempt to cancel an already completed task (`EC-T4`). |
| `409 Conflict` | `TASK_TERMINATED` | `Task is already cancelled` | Task is already in `cancelled` status. |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | OCC version conflict. |

---

### 263. PATCH /api/v1/tasks/manager/:id/extend-due-date

* **API Number / Name:** `#263` / Extend Task Due Date
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/extend-due-date`
* **Purpose / Business Problem Solved:** Formally grants a deadline extension on an active task while strictly preserving the immutable `original_due_date` baseline. Enables analytical visibility into schedule variance and project planning accuracy without overwriting historical baselines.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Role Authorization:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Hierarchy Access Verification:** Permitted for the task assigner, direct line manager of the assignee, or HR/Admin.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `If-Match` (String, Optional): ETag version for OCC.
* **Path Parameters:**
  * `id` (UUID, Required): Task identifier.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `new_due_date` | String | **Required** | ISO 8601 UTC date string | Must be strictly after current `due_date` and $\ge 15$ min in future. |
| `reason` | String | **Required** | Min 10, Max 500 chars, trimmed | Operational reason explaining the extension grant. |

##### Example Request Payload
```json
{
  "new_due_date": "2026-10-20T18:00:00.000Z",
  "reason": "Client dependencies delayed by 4 business days. Extending deadline to accommodate new vendor data feeds."
}
```

#### Detailed API Function & Business Behavior
1. Validates `id` and `extendDueDateSchema`.
2. Queries task with tenant scoping. Throws HTTP `404 Not Found` (`TASK_NOT_FOUND`) if missing.
3. If task is in terminal status (`completed` or `cancelled`): Throws HTTP `409 Conflict` (`TASK_TERMINATED`).
4. **Due Date Validation Rules:**
   * Validates `new_due_date` is strictly after `task.due_date`. If not, throws HTTP `400 Bad Request` (`INVALID_DUE_DATE`) with message `"New due date must be strictly after the current due date"`.
   * Validates `new_due_date` is at least 15 minutes into the future (`dayjs().add(15, 'minute')`). If not, throws HTTP `400 Bad Request` (`INVALID_DUE_DATE`).
5. Evaluates caller hierarchy access.
6. Verifies OCC `If-Match` header.
7. Computes `newExtensionCount = (task.extension_count || 0) + 1`.
8. **Atomic Sequelize Database Transaction:**
   * Updates task: `due_date = newDueDate.toISOString()`, `extension_count = newExtensionCount`, increments `version`. **Critical invariant:** `original_due_date` remains strictly unchanged.
   * Records audit log in `task_audit_logs`: `action = 'DUE_DATE_EXTENDED'`, details `{ previous_due_date, new_due_date, reason, extension_count: newExtensionCount }`.
   * Enqueues notification in `task_notifications`: `event_type = 'TASK_DUE_DATE_EXTENDED'`, `recipient_id = task.assignee_id`, `dedupe_key = task_extended:{taskId}:{newExtensionCount}`.
9. Returns formatted task DTO (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:**
  * `UPDATE tasks SET due_date = :newDate, extension_count = extension_count + 1, version = version + 1 WHERE id = :id AND org_id = :org_id AND version = :expectedVersion`.
  * `INSERT INTO task_audit_logs` (`action = 'DUE_DATE_EXTENDED'`).
  * `INSERT INTO task_notifications` (`event_type = 'TASK_DUE_DATE_EXTENDED'`).

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Task due date extended successfully",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
    "title": "Prepare Q3 Regional Sales Variance Analysis",
    "category": "operational",
    "description": "Reconcile revenue figures against budgeted targets for the Western region.",
    "priority": "high",
    "status": "in_progress",
    "due_date": "2026-10-20T18:00:00.000Z",
    "original_due_date": "2026-10-15T18:00:00.000Z",
    "extension_count": 1,
    "assigner_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "assignee_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "is_viewed": true,
    "first_viewed_at": "2026-10-12T10:15:00.000Z",
    "last_viewed_at": "2026-10-12T14:30:00.000Z",
    "external_links": [],
    "rework_count": 0,
    "reassignment_count": 0,
    "submitted_at": null,
    "completed_at": null,
    "completed_by": null,
    "is_completed_on_time": null,
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "version": 7,
    "created_at": "2026-10-12T10:00:00.000Z",
    "updated_at": "2026-10-12T18:00:00.000Z",
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

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.due_date` | String | Updated active due date. |
| `data.original_due_date` | String | Preserved immutable baseline due date established at task creation. |
| `data.extension_count` | Integer | Incremented extension counter (e.g., `1`). |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `reason must be at least 10 characters long` | Payload validation failure. |
| `400 Bad Request` | `INVALID_DUE_DATE` | `New due date must be strictly after the current due date` | Proposed due date is earlier than or equal to active due date. |
| `400 Bad Request` | `INVALID_DUE_DATE` | `New due date must be at least 15 minutes into the future` | Due date under 15 minutes in future. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to extend due date for this task` | Caller does not manage assignee or have global approval role. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant organization. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot extend due date of a completed task` | Task is in terminal status (`completed` or `cancelled`). |
| `412 Precondition Failed` | `PRECONDITION_FAILED` | `Task was modified by another request. Please reload and retry.` | OCC version conflict. |

---

## 3. Two-Mode Object Storage Handshake & Attachments (`/api/v1/tasks/attachments`)

### 268. POST /api/v1/tasks/attachments/upload-url

* **API Number / Name:** `#268` / Generate Presigned S3 Upload URL & Staging Token
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/attachments/upload-url`
* **Purpose / Business Problem Solved:** Implements Architectural Decision `D-T7` two-mode file upload handshake. Offloads binary data ingestion directly to AWS S3 storage via presigned `PUT` URLs, eliminating heavy payload memory overhead on backend application servers while generating cryptographically signed staging tokens for binding.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** Scoped to `org_id = req.user.orgId` via `requireActiveOrg`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Accessible by any active tenant user (`employee`, `manager`, `hr`, `admin`, `super-admin`).
* **Handshake Mode & BOLA Enforcement (`D-T7`):**
  * **Mode A (Pre-Creation Staging, `task_id` omitted):** Used when creating new tasks. Staged S3 key `org/{orgId}/tasks/staged/{uuid}_{safeName}` is minted. Accessible by any user holding task creation privileges.
  * **Mode B (In-Task Attachment, `task_id` provided):** S3 key `org/{orgId}/tasks/{taskId}/{uuid}_{safeName}` is minted. Verifies caller is assignee, assigner, direct line manager of assignee, or HR/Admin. Rejects cancelled tasks (HTTP `409 Conflict`).
  * **Attachment Quota Enforcement (`EC-T20`):** In Mode B, if the target task already possesses 20 attachments, rejects request with HTTP `409 Conflict` (`ATTACHMENT_LIMIT_EXCEEDED`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
* **Path Parameters:** None.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `file_name` | String | **Required** | Min 1, Max 255 chars, trimmed | Name of the file being uploaded (e.g., `"specifications.pdf"`). |
| `content_type` | String | **Required** | Allowed MIME type list | File MIME type. Allowed: PDF, Images (JPEG, PNG, WebP), and MS Office (DOCX, XLSX). |
| `file_size_bytes` | Integer | **Required** | Min 1, Max 10,485,760 bytes (10MB) | Declared file size in bytes. Strictly capped at 10MB (`CHK_TASK_ATTACHMENTS_SIZE`). |
| `attachment_context` | String | Optional | `'briefing'`, `'submission'`, `'comment'`, default `'briefing'` | Functional domain context of the attachment. |
| `task_id` | UUID | Optional | Valid UUID v4 | Task identifier. If omitted, initiates Mode A pre-creation staging. |

##### Allowed MIME Types
* `application/pdf` (.pdf)
* `image/jpeg` (.jpg, .jpeg)
* `image/png` (.png)
* `image/webp` (.webp)
* `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
* `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)

##### Example Request Payload
```json
{
  "file_name": "q3_audit_reconciliation.pdf",
  "content_type": "application/pdf",
  "file_size_bytes": 1048576,
  "attachment_context": "briefing",
  "task_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

#### Detailed API Function & Business Behavior
1. Validates request body using `uploadUrlSchema`.
2. Sanitizes filename with safe fallback: `objectStorageUtils.sanitizeFileName(payload.file_name) || 'attachment'`.
3. Evaluates Mode:
   * **Mode B:** If `task_id` provided, queries task with tenant isolation. Validates status is not `cancelled`. Checks 20-attachment cap (`EC-T20`). Evaluates hierarchy permissions. Key: `org/${orgId}/tasks/${task.id}/${uuid}_${safeName}`.
   * **Mode A:** If `task_id` omitted, Key: `org/${orgId}/tasks/staged/${uuid}_${safeName}`.
4. Calls AWS S3 Provider `getUploadUrl()` with 900-second (15-minute) expiration and explicit `Content-Type` / `Content-Length` headers.
5. Issues signed JWT staging token (`jwtUtils.generateTaskAttachmentToken()`) containing cryptographic claims (`org_id`, `task_id`, `storage_key`, `file_name`, `file_size_bytes`, `content_type`, `attachment_context`, `uploader_id`, `purpose = 'task_attachment_upload'`).
6. Returns S3 presigned PUT URL and staging token (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:** Read-only `SELECT` on `tasks` (Mode B). No rows created at this stage.
* **Side Effects:** Presigned AWS S3 PUT URL generated.
* **Infrastructure Resilience:** Maps object storage connection or configuration failures to HTTP `503 Service Unavailable` (`STORAGE_SERVICE_UNAVAILABLE`).

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Upload URL generated successfully",
  "data": {
    "upload_url": "https://hrms-storage.s3.us-east-1.amazonaws.com/org/7ca642c2-8097-40c2-9013-176313ef0101/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6/8c9d0e1f-4a5b-6c7d-8e9f-0a1b2c3d4e5f_q3_audit_reconciliation.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...",
    "attachment_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwdXJwb3NlIjoidGFza19hdHRhY2htZW50X3VwbG9hZCIsIm9yZ19pZCI6IjdjYTY0MmMyLTgwOTctNDBjMi05MDEzLTE3NjMxM2VmMDEwMSIsInRhc2tfaWQiOiIzZmE4NWY2NC01NzE3LTQ1NjItYjNmYy0yYzk2M2Y2NmFmYTYiLCJzdG9yYWdlX2tleSI6Im9yZy83Y2E2NDJjMi04MDk3LTQwYzItOTAxMy0xNzYzMTNlZjAxMDEvdGFza3MvM2ZhODVmNjQtNTcxNy00NTYyLWIzZmMtMmM5NjNmNjZhZmE2LzhjOWQwZTFmLTRhNWItNmM3ZC04ZTlmLTBhMWIyYzNkNGU1Zl9xM19hdWRpdF9yZWNvbmNpbGlhdGlvbi5wZGYiLCJmaWxlX25hbWUiOiJxM19hdWRpdF9yZWNvbmNpbGlhdGlvbi5wZGYiLCJmaWxlX3NpemVfYnl0ZXMiOjEwNDg1NzYsImNvbnRlbnRfdHlwZSI6ImFwcGxpY2F0aW9uL3BkZiIsImF0dGFjaG1lbnRfY29udGV4dCI6ImJyaWVmaW5nIiwidXBsb2FkZXJfaWQiOiJhMWIyYzNkNC1lNWY2LTdhOGItOWMwZC0xZTJmM2E0YjVjNmQiLCJpYXQiOjE3NjAzNTIwMDAsImV4cCI6MTc2MDM1MjkwMH0.Signature...",
    "expires_in_seconds": 900,
    "storage_key": "org/7ca642c2-8097-40c2-9013-176313ef0101/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6/8c9d0e1f-4a5b-6c7d-8e9f-0a1b2c3d4e5f_q3_audit_reconciliation.pdf",
    "required_headers": {
      "Content-Type": "application/pdf",
      "Content-Length": "1048576"
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.upload_url` | String | Presigned AWS S3 PUT URL for direct client binary upload. |
| `data.attachment_token` | String | Cryptographically signed staging JWT token required for confirmation. |
| `data.expires_in_seconds` | Integer | Presigned URL validity duration (900 seconds / 15 minutes). |
| `data.storage_key` | String | Generated multi-tenant AWS S3 storage path. |
| `data.required_headers` | Object | Mandatory HTTP headers client must transmit in S3 PUT request. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `File size cannot exceed 10MB (10,485,760 bytes)` | File size exceeds 10MB or payload invalid. |
| `400 Bad Request` | `VALIDATION_ERROR` | `Unsupported file content type. Allowed types: PDF, Images (JPEG, PNG, WebP), and MS Office (DOCX, XLSX)` | Unsupported MIME type. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to attach files to this task` | Caller lacks access to target task. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Target task ID does not exist in tenant organization. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot attach files to a cancelled task` | Target task is cancelled. |
| `409 Conflict` | `ATTACHMENT_LIMIT_EXCEEDED` | `Task attachment limit reached (maximum 20 attachments allowed)` | Task already has 20 attachments (`EC-T20`). |
| `503 Service Unavailable` | `STORAGE_SERVICE_UNAVAILABLE` | `Object storage service is currently unavailable` | AWS S3 service offline or unconfigured. |

---

### 269. POST /api/v1/tasks/attachments/confirm

* **API Number / Name:** `#269` / Confirm S3 Upload & Commit Task Attachment
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/attachments/confirm`
* **Purpose / Business Problem Solved:** Completes the two-mode upload handshake by cryptographically validating the signed staging token, performing an out-of-band `HeadObject` check against AWS S3 storage to verify binary presence and actual size, and persisting the attachment record in PostgreSQL. Engineered with idempotent replay protection against network retries.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** The token claims must match `org_id === req.user.orgId`.
* **Token Purpose Verification:** Token purpose must be `'task_attachment_upload'`. Expired or forged tokens are rejected with HTTP `400 Bad Request`.

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
* **Path Parameters:** None.
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `attachment_token` | String | **Required** | Signed JWT string, non-empty | Signed staging token issued by `#268`. |

##### Example Request Payload
```json
{
  "attachment_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwdXJwb3NlIjoidGFza19hdHRhY2htZW50X3VwbG9hZCIsIm9yZ19pZCI6IjdjYTY0MmMyLTgwOTctNDBjMi05MDEzLTE3NjMxM2VmMDEwMSIsInRhc2tfaWQiOiIzZmE4NWY2NC01NzE3LTQ1NjItYjNmYy0yYzk2M2Y2NmFmYTYiLCJzdG9yYWdlX2tleSI6Im9yZy83Y2E2NDJjMi04MDk3LTQwYzItOTAxMy0xNzYzMTNlZjAxMDEvdGFza3MvM2ZhODVmNjQtNTcxNy00NTYyLWIzZmMtMmM5NjNmNjZhZmE2LzhjOWQwZTFmLTRhNWItNmM3ZC04ZTlmLTBhMWIyYzNkNGU1Zl9xM19hdWRpdF9yZWNvbmNpbGlhdGlvbi5wZGYiLCJmaWxlX25hbWUiOiJxM19hdWRpdF9yZWNvbmNpbGlhdGlvbi5wZGYiLCJmaWxlX3NpemVfYnl0ZXMiOjEwNDg1NzYsImNvbnRlbnRfdHlwZSI6ImFwcGxpY2F0aW9uL3BkZiIsImF0dGFjaG1lbnRfY29udGV4dCI6ImJyaWVmaW5nIiwidXBsb2FkZXJfaWQiOiJhMWIyYzNkNC1lNWY2LTdhOGItOWMwZC0xZTJmM2E0YjVjNmQiLCJpYXQiOjE3NjAzNTIwMDAsImV4cCI6MTc2MDM1MjkwMH0.Signature..."
}
```

#### Detailed API Function & Business Behavior
1. Validates `confirmUploadSchema`.
2. Verifies and decodes JWT `attachment_token` using secret key. Validates purpose and organization context (`claims.org_id === req.user.orgId`).
3. **Idempotent Replay Protection:** Queries `taskAttachmentRepository.findByStorageKey(claims.storage_key, orgId)`. If an attachment row already exists with this storage key, immediately returns the existing record with HTTP `201 Created`, preventing duplicate key errors on network retries.
4. Executes AWS S3 `HeadObject` check via `awsS3Provider.headObject({ key: claims.storage_key })`. If the file was not uploaded to S3 or has not finished, throws HTTP `400 Bad Request` (`ATTACHMENT_NOT_FOUND_IN_STORAGE`).
5. If `claims.task_id` is present, validates task exists and is not `cancelled` (HTTP `409 Conflict`).
6. Inserts a new row into `task_attachments` table with `org_id`, `task_id`, `uploader_id = req.user.id`, `storage_key`, `file_name`, actual verified `file_size_bytes`, `content_type`, `attachment_context`.
7. Returns created attachment record (HTTP 201 Created).

#### Database Impact & Concurrency
* **Database Operations:**
  * `SELECT` on `task_attachments` (idempotency check via unique index `task_attachments_storage_key_unique`).
  * `INSERT INTO task_attachments (id, org_id, task_id, uploader_id, storage_key, file_name, file_size_bytes, content_type, attachment_context, created_at, updated_at)`.
* **Idempotency:** Unique storage key constraint prevents double-insertions.

#### Exact Success Response Contract (HTTP 201 Created)
```json
{
  "success": true,
  "message": "Attachment confirmed successfully",
  "data": {
    "attachment": {
      "id": "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
      "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
      "task_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "uploader_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "storage_key": "org/7ca642c2-8097-40c2-9013-176313ef0101/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6/8c9d0e1f-4a5b-6c7d-8e9f-0a1b2c3d4e5f_q3_audit_reconciliation.pdf",
      "file_name": "q3_audit_reconciliation.pdf",
      "file_size_bytes": 1048576,
      "content_type": "application/pdf",
      "attachment_context": "briefing",
      "created_at": "2026-10-12T10:10:00.000Z",
      "updated_at": "2026-10-12T10:10:00.000Z",
      "deleted_at": null
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.attachment.id` | UUID | Unique attachment identifier. |
| `data.attachment.task_id` | UUID / Null | Associated task ID, or `null` for Mode A staged attachments. |
| `data.attachment.uploader_id` | UUID | User ID of the uploader. |
| `data.attachment.storage_key` | String | Immutable AWS S3 object key. |
| `data.attachment.file_size_bytes` | Integer | Actual verified binary size in bytes. |
| `data.attachment.attachment_context` | String | Context (`'briefing'`, `'submission'`, or `'comment'`). |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Attachment token is required` | Payload validation failure. |
| `400 Bad Request` | `INVALID_ATTACHMENT_TOKEN` | `Invalid or expired attachment token. Please request a new upload URL.` | JWT verification failure or expired token. |
| `400 Bad Request` | `ATTACHMENT_NOT_FOUND_IN_STORAGE` | `File was not uploaded to storage or upload has not completed yet` | S3 HeadObject returns 404. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `Invalid token claims for this organization context` | Token org_id does not match active tenant. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Associated task not found` | Target task ID in token does not exist in tenant. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot attach files to a cancelled task` | Target task is cancelled. |
| `503 Service Unavailable` | `STORAGE_SERVICE_UNAVAILABLE` | `Object storage service is currently unavailable` | AWS S3 connectivity failure. |

---

### 270. GET /api/v1/tasks/attachments/:attachmentId/download-url

* **API Number / Name:** `#270` / Generate Presigned S3 Download URL with BOLA Protection
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/attachments/:attachmentId/download-url`
* **Purpose / Business Problem Solved:** Generates a secure, short-lived (15-minute) presigned `GET` download URL for an attachment, preventing direct public exposure of sensitive corporate documents while enforcing strict Broken Object Level Authorization (BOLA).

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** Scoped to `org_id = req.user.orgId` via `requireActiveOrg`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Broken Object Level Authorization (BOLA) Protection:**
  * When attachment is bound to a task: Caller must be the task assignee, task assigner, direct line manager of the assignee (`hierarchyAccess.getAccessibleUserIds`), or Global Approver (`hr`, `admin`, `super-admin`).
  * When attachment is staged (`task_id === null`): Caller must be the original uploader (`uploader_id === req.user.id`) or Global Approver.
  * All unauthorized requests receive HTTP `403 Forbidden` (`FORBIDDEN`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
* **Path Parameters:**
  * `attachmentId` (UUID, Required): Unique identifier of the attachment.
* **Query Parameters:** None.
* **Request JSON Payload:** None (`GET` request).

#### Detailed API Function & Business Behavior
1. Validates `attachmentId` path parameter format via `downloadUrlParamsSchema`.
2. Queries attachment with tenant scoping (`org_id = req.user.orgId`). Throws HTTP `404 Not Found` (`ATTACHMENT_NOT_FOUND`) if missing.
3. **BOLA Authorization Check:**
   * If `attachment.task_id` is present, queries task. Verifies caller is assignee, assigner, direct manager, or HR/Admin.
   * If `attachment.task_id` is null, verifies caller is original uploader or HR/Admin.
4. Builds RFC 6266 `Content-Disposition: attachment; filename="<safeName>"` header via `objectStorageUtils.buildContentDisposition()`.
5. Calls AWS S3 Provider `getViewUrl()` with 900-second (15-minute) TTL and explicit Content-Disposition.
6. Returns presigned download URL and metadata (HTTP 200 OK).

#### Database Impact & Concurrency
* **Database Operations:** Read-only `SELECT` queries on `task_attachments` and `tasks`.
* **Concurrency:** Non-locking queries.

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Download URL generated successfully",
  "data": {
    "download_url": "https://hrms-storage.s3.us-east-1.amazonaws.com/org/7ca642c2-8097-40c2-9013-176313ef0101/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6/8c9d0e1f-4a5b-6c7d-8e9f-0a1b2c3d4e5f_q3_audit_reconciliation.pdf?response-content-disposition=attachment%3B%20filename%3D%22q3_audit_reconciliation.pdf%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
    "expires_in_seconds": 900,
    "file_name": "q3_audit_reconciliation.pdf",
    "content_type": "application/pdf",
    "file_size_bytes": 1048576
  }
}
```

##### Response Field Meanings
| Field | Type | Description |
|---|---|---|
| `data.download_url` | String | Presigned AWS S3 GET download URL. |
| `data.expires_in_seconds` | Integer | Validity window in seconds (900 seconds / 15 minutes). |
| `data.file_name` | String | Clean, original filename for download disposition. |
| `data.content_type` | String | Stored MIME content type. |
| `data.file_size_bytes` | Integer | Binary file size in bytes. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Attachment ID must be a valid UUID` | Invalid UUID path parameter. |
| `401 Unauthorized` | `UNAUTHORIZED` | `Authentication required` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FORBIDDEN` | `You do not have permission to access this attachment` | BOLA access control rejection. |
| `404 Not Found` | `ATTACHMENT_NOT_FOUND` | `Attachment not found` | Attachment does not exist in tenant organization. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Parent task not found` | Associated task does not exist in tenant organization. |
| `503 Service Unavailable` | `STORAGE_SERVICE_UNAVAILABLE` | `Object storage service is currently unavailable` | AWS S3 connectivity failure. |

---

## 4. Existing APIs Modified / Extended by Phase 3

### 4.1 POST /api/v1/tasks/manager (#255) & POST /api/v1/tasks/hr (#265) — Pre-Creation Staged Attachment Binding (Mode A)

* **Endpoints Affected:**
  * `POST /api/v1/tasks/manager` (`#255`)
  * `POST /api/v1/tasks/hr` (`#265`)
* **Contract Extension:**
  Both task creation endpoints now accept an optional array of signed JWT attachment tokens in the request body:
  ```json
  {
    "attachment_tokens": [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    ]
  }
  ```
* **Validation Rules:**
  * `attachment_tokens`: Array of Strings (Optional, max 10 tokens).
* **Behavioral Change:**
  During task creation, inside the primary database transaction (`db.sequelize.transaction`), `taskAttachmentService.bindStagedTokens(orgId, task.id, requesterUser.id, payload.attachment_tokens, t)` validates each token's cryptographic claims, verifies binary existence in AWS S3 storage via `HeadObject`, and bulk-creates `TaskAttachment` rows atomically bound to the newly created `task.id`. If any staged token is invalid or missing in S3, the entire task creation transaction rolls back atomically.
* **New Error Responses:**
  * `400 Bad Request` / `INVALID_ATTACHMENT_TOKEN`: Staging token is malformed, expired, or tampered.
  * `400 Bad Request` / `ATTACHMENT_NOT_FOUND_IN_STORAGE`: Upload binary was not found in S3 bucket.

### 4.2 GET /api/v1/tasks/me/:id (#250), GET /api/v1/tasks/manager/:id (#258) & GET /api/v1/tasks/hr/:id (#267) — Attachment Object Hydration

* **Endpoints Affected:**
  * `GET /api/v1/tasks/me/:id` (`#250`)
  * `GET /api/v1/tasks/manager/:id` (`#258`)
  * `GET /api/v1/tasks/hr/:id` (`#267`)
* **Contract Extension:**
  In Phase 2, the `attachments` array in task detail responses returned an empty array `[]`. With Phase 3 delivery of the attachment domain, these endpoints now eager-load and return full arrays of `TaskAttachment` objects populated with:
  ```json
  "attachments": [
    {
      "id": "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
      "org_id": "7ca642c2-8097-40c2-9013-176313ef0101",
      "task_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "uploader_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "storage_key": "org/7ca642c2-8097-40c2-9013-176313ef0101/tasks/3fa85f64-5717-4562-b3fc-2c963f66afa6/spec.pdf",
      "file_name": "spec.pdf",
      "file_size_bytes": 1048576,
      "content_type": "application/pdf",
      "attachment_context": "briefing",
      "created_at": "2026-10-12T10:10:00.000Z",
      "updated_at": "2026-10-12T10:10:00.000Z",
      "deleted_at": null
    }
  ]
  ```

---

# Phase 4: Contextual Discussions, Audit Trail & Concurrency Controls (APIs #253, #254, #264)

## 1. Employee Self-Service Discussion APIs (`/api/v1/tasks/me`)

### 253. POST /api/v1/tasks/me/:id/comments

* **API Number / Name:** `#253` / Post Assignee Discussion Comment or Progress Update
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/me/:id/comments`
* **Purpose / Business Problem Solved:** Enables the designated task assignee to post contextual progress notes, milestone achievements, questions, external links, and uploaded deliverables to the in-task discussion thread. Solves the operational problem of fragmented external communication by anchoring all work discussions to the immutable task record.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token (`Authorization: Bearer <token>`).
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId` via `requireActiveOrg`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Accessible by any active tenant role (`employee`, `manager`, `hr`, `admin`, `super-admin`).
* **Resource Ownership (BOLA):** Strict check `task.assignee_id === req.user.id`. If the task belongs to another employee or does not exist in the tenant, the API returns a uniform HTTP `404 Not Found` (`TASK_NOT_FOUND`) to prevent IDOR enumeration.
* **Terminal State Guard:** If `task.status === 'cancelled'`, throws HTTP `409 Conflict` (`TASK_TERMINATED`, `EC-T23`).
* **Anti-Spam Rate Limit:** Maximum 30 comments per user per task per hour (`EC-T12`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `Idempotency-Key` (String, Optional): Client-generated UUID for double-click replay protection (`EC-T5`).
* **Path Parameters:**
  * `id` (UUID, Required): Unique identifier of the target task (`tasks.id`).
* **Query Parameters:** None.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `message` | String | **Required** | Min 1, Max 2,000 characters, trimmed | Message body or operational progress note. |
| `is_progress_update` | Boolean | Optional | Default: `false` | When `true`, flags this comment as an explicit work milestone. |
| `attachment_ids` | Array\<UUID\> | Optional | Max 10 UUIDs, default: `[]` | Array of confirmed `task_attachments.id` belonging to this task (`EC-T24`). |
| `external_links` | Array\<Object\> | Optional | Max 5 objects, default: `[]` | Array of reference objects `[{ label, url }]` (`EC-T11`). |
| `external_links[].label` | String | Required | Min 1, Max 100 characters, trimmed | Link descriptor (e.g., "Draft Design"). |
| `external_links[].url` | String | Required | Valid `https://` URI, Max 1,000 chars, SSRF-validated | Secure link to external resource. |

##### Example Request Payload
```json
{
  "message": "Completed initial draft of Western Region Q3 sales analysis. Discrepancies have been reconciled.",
  "is_progress_update": true,
  "attachment_ids": [
    "c8a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c"
  ],
  "external_links": [
    {
      "label": "Western Region Reconciled Sheet",
      "url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
    }
  ]
}
```

#### Detailed API Function & Business Behavior
1. Validates `req.params.id` using `taskIdParamSchema`. Validates `req.body` using `postCommentSchema`.
2. **Idempotency Guard (`EC-T5`):** If `Idempotency-Key` header is present, checks Redis. Replays cached HTTP 201 response with `{ reused: true }` if found. Claims the key atomically if not present, with an in-flight retry loop to resolve concurrent identical requests.
3. **Task Resolution & BOLA Check:** Queries `tasks` where `id = taskId AND org_id = req.user.orgId`. If null or `task.assignee_id !== req.user.id`, throws HTTP `404 TASK_NOT_FOUND`.
4. **Terminal State Inspection (`EC-T23`):** If `task.status === 'cancelled'`, throws HTTP `409 TASK_TERMINATED`.
5. **Rate Limit Inspection (`EC-T12`):** Increments Redis hourly bucket counter `rate:task_comment:{orgId}:{taskId}:{userId}:{YYYYMMDDHH}`. If count $> 30$, throws HTTP `429 TOO_MANY_COMMENTS` with `details.retry_after_seconds` and advertises standard `Retry-After` header. Fails open gracefully if Redis is offline (`EC-T25`).
6. **SSRF Link Inspection (`EC-T11`):** Validates all `external_links` URLs via `_isSafeExternalUrl()`, blocking non-HTTPS, loopbacks (`localhost`, `127.0.0.1`, `::1`), metadata IPs (`169.254.169.254`), and RFC 1918 private IPv4/IPv6 ranges with HTTP `400 VALIDATION_ERROR`.
7. **Attachment Association Check (`EC-T24`):** For each ID in `attachment_ids`, verifies existence in `task_attachments` with matching `org_id` and `task_id === taskId`. Rejects unconfirmed, missing, or cross-task attachments with HTTP `400 INVALID_ATTACHMENT`.
8. **Transactional Persistence:**
   * Inserts row into `task_comments` (`system_generated = false`, `author_id = req.user.id`).
   * Records immutable audit log in `task_audit_logs` (`action = 'COMMENT_ADDED'`) capturing normalized client IP (truncated to 45 chars) and user-agent.
9. **Hydration & Presentation:** Reloads comment eager-loading `User` and `UserProfile` (`first_name`, `last_name`, `display_name`, `avatar_url`).
10. **Cache & Respond:** Stores response in Redis idempotency cache (TTL: 120s) and returns HTTP 201 Created.

#### Database Impact, Transactions & Concurrency
* **Database Operations:** 
  * `SELECT` on `tasks` (tenant-scoped).
  * `SELECT` on `task_attachments` (association validation).
  * `INSERT` into `task_comments`.
  * `INSERT` into `task_audit_logs`.
* **Transaction Boundary:** `db.sequelize.transaction` wraps comment insertion and audit logging atomically. If either fails, the transaction rolls back cleanly.
* **Concurrency & OCC Independence:** Unlike task status transitions that mutate `tasks.version` under `If-Match` OCC, comment posting is an append-only operation in child table `task_comments`. Multiple team members can converse simultaneously without triggering `412 PRECONDITION_FAILED` conflicts.
* **Side Effects:** Emits audit event `COMMENT_ADDED`. Updates Redis rate limiting counter.

#### Exact Success Response Contract (HTTP 201 Created)
```json
{
  "success": true,
  "message": "Comment posted successfully",
  "data": {
    "comment": {
      "id": "f1e2d3c4-b5a6-4f7e-8d9c-0b1a2c3d4e5f",
      "task_id": "a1b2c3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d",
      "message": "Completed initial draft of Western Region Q3 sales analysis. Discrepancies have been reconciled.",
      "is_progress_update": true,
      "system_generated": false,
      "external_links": [
        {
          "label": "Western Region Reconciled Sheet",
          "url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
        }
      ],
      "attachment_ids": [
        "c8a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c"
      ],
      "created_at": "2026-10-14T09:30:00.000Z",
      "author": {
        "id": "e5f6a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
        "name": "Jordan Hayes",
        "email": "jordan.hayes@example.com",
        "avatar": "https://cdn.example.com/avatars/jordan.png"
      }
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Nullable | Description |
|---|---|:---:|---|
| `success` | Boolean | No | Standard API success indicator (`true`). |
| `message` | String | No | Confirmation message (`'Comment posted successfully'`). |
| `data.comment.id` | UUID | No | Unique identifier of the created comment. |
| `data.comment.task_id` | UUID | No | Parent task identifier. |
| `data.comment.message` | String | No | Sanitized message body. |
| `data.comment.is_progress_update` | Boolean | No | Milestone flag indicator. |
| `data.comment.system_generated` | Boolean | No | Always `false` for user-authored comments. |
| `data.comment.external_links` | Array\<Object\> | No | Array of validated external reference links. |
| `data.comment.attachment_ids` | Array\<UUID\> | No | Array of associated task attachment IDs. |
| `data.comment.created_at` | ISO 8601 String | No | UTC timestamp of comment creation. |
| `data.comment.author.id` | UUID | No | Comment author's user ID. |
| `data.comment.author.name` | String | No | Resolved full name, display name, or identifier. |
| `data.comment.author.email` | String | Yes | Author's email address / login identifier. |
| `data.comment.author.avatar` | String | Yes | Author's avatar image URL or null. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Comment message is required` / `Comment message cannot exceed 2000 characters` | Message is missing, empty, or exceeds 2,000 characters. |
| `400 Bad Request` | `VALIDATION_ERROR` | `Invalid external link: URL must be a valid, secure public HTTPS address` | Non-HTTPS scheme, loopback (`127.0.0.1`), metadata IP (`169.254.169.254`), or private IP address (`EC-T11`). |
| `400 Bad Request` | `INVALID_ATTACHMENT` | `One or more referenced attachments are invalid or do not belong to this task: <uuid>` | Referenced attachment does not exist, belongs to another task, or belongs to another tenant (`EC-T24`). |
| `401 Unauthorized` | `UNAUTHORIZED` / `AUTH_TOKEN_MISSING` | `Authentication token is required` / `Session time out` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FEATURE_NOT_AVAILABLE` | `This feature is not available on your current subscription plan.` | Organization lacks the `tasks.access` feature flag entitlement. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task does not exist in tenant or caller is not the task assignee (uniform BOLA denial). |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot post comments on a cancelled task` | Task is in `cancelled` status (`EC-T23`). |
| `429 Too Many Requests` | `TOO_MANY_COMMENTS` | `Rate limit exceeded: maximum 30 comments per hour allowed per task. Please wait <sec> seconds.` | User has posted $> 30$ comments on this task in the current UTC hour (`EC-T12`). Emits `Retry-After: <sec>` header. |

---

### 254. GET /api/v1/tasks/me/:id/comments

* **API Number / Name:** `#254` / List Task Discussion Comments (Chronological Feed)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/me/:id/comments`
* **Purpose / Business Problem Solved:** Retrieves the paginated conversation feed for a task. Returns chronological user comments, milestone progress announcements, and automated administrative system comments (`REWORK REQUESTED`, `TASK REASSIGNED`, `TASK CANCELLED`) with eager-loaded author user profiles.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Accessible by any active tenant user participating in the task.
* **Resource Ownership (BOLA):** Caller must be task assignee, task assigner, direct line manager of assignee in hierarchy, or HR/admin. Strangers receive a uniform HTTP `404 Not Found` (`TASK_NOT_FOUND`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
* **Path Parameters:**
  * `id` (UUID, Required): Target task UUID (`tasks.id`).
* **Query Parameters:**
  * `page` (Integer, Optional, Default: `1`, Min: `1`): Page number.
  * `limit` (Integer, Optional, Default: `50`, Min: `1`, Max: `100`): Results per page.
  * `order` (String, Optional, Default: `'ASC'`, Valid: `'ASC'`, `'DESC'`, `'asc'`, `'desc'`): Chronological sort order by `created_at`. Case-insensitive.
  * `is_progress_update` (Boolean, Optional): When specified (`true` or `false`), filters comments strictly by milestone flag.
* **Request JSON Payload:** None (`GET` request).

#### Detailed API Function & Business Behavior
1. Validates `req.params.id` using `taskIdParamSchema`. Validates `req.query` inside controller handler via `validateOrThrow(listCommentsQuerySchema, req.query)`, avoiding Express 5 getter-only mutation errors (`EC-T13`).
2. Looks up `tasks` where `id = taskId AND org_id = req.user.orgId`. Verifies caller is assignee, assigner, direct line manager in hierarchy, or Global Approver (`hr`, `admin`, `super-admin`). If not authorized, throws HTTP `404 TASK_NOT_FOUND`.
3. Executes `TaskComment.findAndCountAll` filtering by `task_id` and `org_id`, eager-loading `User` (as `author`) and `UserProfile` (as `profile`). Applies limit, offset, and sort direction (`created_at ASC` or `created_at DESC`).
4. Projects rows via `_formatCommentDto` and computes pagination envelope (`total_items`, `total_pages`, `has_next_page`, `has_prev_page`). Returns HTTP 200 OK.

#### Database Impact, Transactions & Concurrency
* **Database Operations:** Read-only `SELECT` query on `tasks` followed by `findAndCountAll` on `task_comments` joined with `users` and `user_profiles`.
* **Indexes Utilized:** `task_comments_task_id_created_at_idx` `(task_id, created_at ASC)`.
* **Transactions:** None (Read-only).
* **Concurrency:** Non-locking query.
* **Side Effects:** None.

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Comments retrieved successfully",
  "data": {
    "comments": [
      {
        "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "task_id": "a1b2c3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d",
        "message": "Please make sure to reconcile against both regional and national sales targets.",
        "is_progress_update": false,
        "system_generated": false,
        "external_links": [],
        "attachment_ids": [],
        "created_at": "2026-10-13T10:15:00.000Z",
        "author": {
          "id": "d4e5f6a1-b2c3-4d5e-8f9a-0b1c2d3e4f5a",
          "name": "Sarah Jenkins",
          "email": "sarah.jenkins@example.com",
          "avatar": null
        }
      },
      {
        "id": "f1e2d3c4-b5a6-4f7e-8d9c-0b1a2c3d4e5f",
        "task_id": "a1b2c3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d",
        "message": "Completed initial draft of Western Region Q3 sales analysis. Discrepancies have been reconciled.",
        "is_progress_update": true,
        "system_generated": false,
        "external_links": [
          {
            "label": "Western Region Reconciled Sheet",
            "url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
          }
        ],
        "attachment_ids": [
          "c8a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c"
        ],
        "created_at": "2026-10-14T09:30:00.000Z",
        "author": {
          "id": "e5f6a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b",
          "name": "Jordan Hayes",
          "email": "jordan.hayes@example.com",
          "avatar": "https://cdn.example.com/avatars/jordan.png"
        }
      },
      {
        "id": "a9b8c7d6-e5f4-4a3b-2c1d-0e9f8a7b6c5d",
        "task_id": "a1b2c3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d",
        "message": "REWORK REQUESTED: Missing regional variance sheet reconciliation",
        "is_progress_update": false,
        "system_generated": true,
        "external_links": [],
        "attachment_ids": [],
        "created_at": "2026-10-14T11:00:00.000Z",
        "author": {
          "id": "d4e5f6a1-b2c3-4d5e-8f9a-0b1c2d3e4f5a",
          "name": "Sarah Jenkins",
          "email": "sarah.jenkins@example.com",
          "avatar": null
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total_items": 3,
      "total_pages": 1,
      "has_next_page": false,
      "has_prev_page": false
    }
  }
}
```

##### Response Field Meanings
| Field | Type | Nullable | Description |
|---|---|:---:|---|
| `success` | Boolean | No | Standard API success indicator (`true`). |
| `message` | String | No | Confirmation message (`'Comments retrieved successfully'`). |
| `data.comments` | Array\<Object\> | No | Chronological list of discussion comments. |
| `data.comments[].id` | UUID | No | Unique comment identifier. |
| `data.comments[].task_id` | UUID | No | Parent task identifier. |
| `data.comments[].message` | String | No | Message text or system announcement body. |
| `data.comments[].is_progress_update` | Boolean | No | True if comment was flagged as a progress milestone. |
| `data.comments[].system_generated` | Boolean | No | True if generated by administrative workflow transitions (reopen, cancel, reassign). |
| `data.comments[].external_links` | Array\<Object\> | No | Array of external reference links. |
| `data.comments[].attachment_ids` | Array\<UUID\> | No | Array of attached task attachment UUIDs. |
| `data.comments[].created_at` | ISO 8601 String | No | UTC timestamp when comment was posted. |
| `data.comments[].author` | Object | Yes | Author user summary profile (null for system notes where author is omitted). |
| `data.comments[].author.id` | UUID | No | User ID of the comment author. |
| `data.comments[].author.name` | String | No | Full display name of the author. |
| `data.comments[].author.email` | String | Yes | Email/identifier of the author. |
| `data.comments[].author.avatar` | String | Yes | Profile avatar URL or null. |
| `data.pagination.page` | Integer | No | Current page number. |
| `data.pagination.limit` | Integer | No | Page size limit applied. |
| `data.pagination.total_items` | Integer | No | Total comment records matching filters. |
| `data.pagination.total_pages` | Integer | No | Total calculated pages. |
| `data.pagination.has_next_page` | Boolean | No | True if subsequent page exists. |
| `data.pagination.has_prev_page` | Boolean | No | True if prior page exists. |

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Task ID must be a valid UUID` / `limit must be less than or equal to 100` | Non-UUID path param, invalid `page`, `limit` $> 100$, or invalid `order` string. |
| `401 Unauthorized` | `UNAUTHORIZED` / `AUTH_TOKEN_MISSING` | `Authentication token is required` / `Session time out` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FEATURE_NOT_AVAILABLE` | `This feature is not available on your current subscription plan.` | Organization lacks the `tasks.access` feature flag entitlement. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Task not found in tenant or caller is an unrelated employee with no business relationship to the task. |

---

## 2. Managerial Discussion & Team Oversight APIs (`/api/v1/tasks/manager`)

### 264. POST /api/v1/tasks/manager/:id/comments

* **API Number / Name:** `#264` / Post Managerial Discussion Comment or Review Feedback
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/comments`
* **Purpose / Business Problem Solved:** Enables People Managers, assigning supervisors, or HR administrators to post guidance, mid-flight review feedback, requests for clarification, or milestone sign-offs on a subordinate's task thread.

#### Authentication & Authorization
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Permitted Roles:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Hierarchy Access Verification:** Caller must be:
  1. The task assigner (`task.assigner_id === req.user.id`), OR
  2. Direct line manager of the assignee (`task.assignee_id in hierarchyAccess.getAccessibleUserIds()`), OR
  3. In global HR/Admin governance roles (`['hr', 'admin', 'super-admin']`).
  If caller fails all three criteria, returns HTTP `403 Forbidden` (`FORBIDDEN_TASK_ACCESS`).
* **Terminal State Guard:** If `task.status === 'cancelled'`, throws `409 Conflict` (`TASK_TERMINATED`, `EC-T23`).
* **Anti-Spam Rate Limit:** Maximum 30 comments per user per task per hour (`EC-T12`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): Format `Bearer <JWT>`.
  * `Idempotency-Key` (String, Optional): Client UUID for duplicate prevention (`EC-T5`).
* **Path Parameters:**
  * `id` (UUID, Required): Target task UUID (`tasks.id`).
* **Query Parameters:** None.

#### Request JSON Payload
Identical to API `#253` schema (`message`, optional `is_progress_update`, optional `attachment_ids`, optional `external_links`).

##### Example Request Payload
```json
{
  "message": "Reviewed the draft slides. Please align slide 4 with national targets before submitting for final review.",
  "is_progress_update": false,
  "external_links": [
    {
      "label": "Corporate Target Guidelines",
      "url": "https://wiki.corporate.example.com/finance/guidelines"
    }
  ]
}
```

#### Detailed API Function & Business Behavior
1. Validates `req.params.id` using `taskIdParamSchema`. Validates `req.body` using `postCommentSchema`.
2. Inspects optional `Idempotency-Key` header via Redis idempotency utility. Replays cached response if previously processed.
3. Queries task with tenant scoping. Throws HTTP `404 TASK_NOT_FOUND` if task does not exist in tenant organization.
4. If `task.status === 'cancelled'`, throws HTTP `409 TASK_TERMINATED`.
5. **Hierarchy Access Enforcement:** Checks if caller is HR/Admin, the task assigner, or direct manager of the assignee via `hierarchyAccess.getAccessibleUserIds()`. If not authorized, throws HTTP `403 FORBIDDEN_TASK_ACCESS`.
6. Checks hourly rate limit via `checkCommentRate()`. Throws HTTP `429 TOO_MANY_COMMENTS` with `Retry-After` if $> 30$ comments/hr.
7. Validates external links against SSRF rules via `_isSafeExternalUrl()`.
8. Validates `attachment_ids` against `task_attachments` table for matching `task_id` and `org_id`.
9. Persists comment row and audit log (`COMMENT_ADDED`) inside atomic database transaction.
10. Eager-loads manager profile and returns HTTP 201 Created.

#### Database Impact, Transactions & Concurrency
* **Database Operations:** `SELECT` on `tasks`, `SELECT` on `task_attachments`, `INSERT` into `task_comments`, `INSERT` into `task_audit_logs`.
* **Transaction Boundary:** Atomic transaction wraps comment insertion and audit recording.
* **Concurrency:** Append-only concurrency independence.

#### Exact Success Response Contract (HTTP 201 Created)
```json
{
  "success": true,
  "message": "Managerial comment posted successfully",
  "data": {
    "comment": {
      "id": "b7c8d9e0-1a2b-4c3d-8e4f-5a6b7c8d9e0f",
      "task_id": "a1b2c3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d",
      "message": "Reviewed the draft slides. Please align slide 4 with national targets before submitting for final review.",
      "is_progress_update": false,
      "system_generated": false,
      "external_links": [
        {
          "label": "Corporate Target Guidelines",
          "url": "https://wiki.corporate.example.com/finance/guidelines"
        }
      ],
      "attachment_ids": [],
      "created_at": "2026-10-14T10:00:00.000Z",
      "author": {
        "id": "d4e5f6a1-b2c3-4d5e-8f9a-0b1c2d3e4f5a",
        "name": "Sarah Jenkins",
        "email": "sarah.jenkins@example.com",
        "avatar": null
      }
    }
  }
}
```

##### Response Field Meanings
Identical to API `#253` response field dictionary.

#### Exact Error Contract
| HTTP Status | Error Code | Error Message | Trigger Condition |
|---|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | `Comment message is required` / `Invalid external link` | Validation rule failure or SSRF link attempt. |
| `400 Bad Request` | `INVALID_ATTACHMENT` | `One or more referenced attachments are invalid or do not belong to this task` | Attachment ID unverified or cross-task reference (`EC-T24`). |
| `401 Unauthorized` | `UNAUTHORIZED` / `AUTH_TOKEN_MISSING` | `Authentication token is required` / `Session time out` | Missing or invalid JWT bearer token. |
| `403 Forbidden` | `FEATURE_NOT_AVAILABLE` | `This feature is not available on your current subscription plan.` | Organization lacks the `tasks.access` feature flag entitlement. |
| `403 Forbidden` | `FORBIDDEN` | `Forbidden: insufficient permissions` | Caller role is `employee` (rejected at route authorization layer). |
| `403 Forbidden` | `FORBIDDEN_TASK_ACCESS` | `You do not have permission to comment on this task` | Manager caller is not the task assigner, does not manage the assignee, and is not HR. |
| `404 Not Found` | `TASK_NOT_FOUND` | `Task not found` | Target task does not exist in tenant organization. |
| `409 Conflict` | `TASK_TERMINATED` | `Cannot post comments on a cancelled task` | Target task is in `cancelled` status (`EC-T23`). |
| `429 Too Many Requests` | `TOO_MANY_COMMENTS` | `Rate limit exceeded: maximum 30 comments per hour allowed per task. Please wait <sec> seconds.` | Manager has posted $> 30$ comments on this task in the current hour (`EC-T12`). Emits `Retry-After: <sec>`. |

---

### Companion Route: GET /api/v1/tasks/manager/:id/comments

* **API Number / Name:** Companion Route / List Task Discussion Comments (Managerial Feed)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/comments`
* **Purpose / Business Problem Solved:** Provides People Managers and HR Administrators inspecting subordinate tasks with identical chronological conversation feed retrieval directly on the `/manager` route prefix, eliminating the need to switch client routes.
* **Plane / Mount:** Manager Delegation & Oversight (`/api/v1/tasks/manager`)
* **Authentication & Authorization:** Mandatory JWT Bearer Token, active tenant, `tasks.access` feature entitlement, role in `['manager', 'hr', 'admin', 'super-admin']`.
* **Hierarchy Verification:** Caller must be assigner, direct line manager, or HR/admin. Strangers receive HTTP `404 TASK_NOT_FOUND`.
* **Request Parameters, Success Response & Error Contract:** Fully identical to API `#254`.

---

## 3. Existing APIs Modified / Extended by Phase 4

### 3.1 POST /api/v1/tasks/manager/:id/reopen (#260) — Automated System Rework Note Injection

* **Endpoint Affected:** `POST /api/v1/tasks/manager/:id/reopen` (`#260`)
* **Contract Extension:**
  During task rejection and rework initiation, inside the atomic status transition database transaction (`db.sequelize.transaction`), `task.service.js` automatically invokes:
  ```javascript
  await taskCommentService.postSystemComment(
    orgId,
    taskId,
    requesterUser.id,
    `REWORK REQUESTED: ${payload.reopen_reason.trim()}`,
    { transaction: t }
  )
  ```
* **Behavioral Change:**
  The manager's mandatory `reopen_reason` justification is now permanently recorded in the task's discussion feed as an indelible system note (`system_generated: true`). When the assignee inspects the task, they see the exact rework instructions at the top of the discussion feed without needing to inspect raw audit logs.
* **Backward Compatibility:**
  The HTTP response contract for API `#260` remains 100% backward compatible, returning the updated task DTO with status `reopened` and incremented `rework_count`.

---

### 3.2 POST /api/v1/tasks/manager/:id/reassign (#261) — Automated System Reassignment Notice Injection

* **Endpoint Affected:** `POST /api/v1/tasks/manager/:id/reassign` (`#261`)
* **Contract Extension:**
  During task reallocation to another subordinate report, inside the atomic update transaction, `task.service.js` automatically invokes:
  ```javascript
  await taskCommentService.postSystemComment(
    orgId,
    taskId,
    requesterUser.id,
    `TASK REASSIGNED: Reassigned to ${newAssigneeName}. Reason: ${payload.reason.trim()}`,
    { transaction: t }
  )
  ```
* **Behavioral Change:**
  A system-generated comment (`system_generated: true`) is inserted into `task_comments` establishing complete hand-off provenance. When the incoming assignee opens the task, they immediately see why the task was reassigned to them and who previously held ownership.
* **Backward Compatibility:**
  The HTTP response contract for API `#261` remains 100% backward compatible, returning the updated task DTO with updated `assignee_id` and incremented `reassignment_count`.

---

### 3.3 POST /api/v1/tasks/manager/:id/cancel (#262) — Automated System Cancellation Note Injection & Discussion Lock

* **Endpoint Affected:** `POST /api/v1/tasks/manager/:id/cancel` (`#262`)
* **Contract Extension:**
  During task termination, inside the atomic cancellation transaction, `task.service.js` automatically invokes:
  ```javascript
  await taskCommentService.postSystemComment(
    orgId,
    taskId,
    requesterUser.id,
    `TASK CANCELLED: ${payload.cancellation_reason.trim()}`,
    { transaction: t }
  )
  ```
* **Behavioral Change:**
  1. The manager's mandatory `cancellation_reason` is immutably recorded in the discussion feed as a system comment (`system_generated: true`).
  2. The cancellation status immediately locks the task's conversation thread: any subsequent attempts to submit comments via `#253` or `#264` are rejected with HTTP `409 Conflict` (`TASK_TERMINATED`, `EC-T23`). Reading existing comments via `#254` remains permitted.
* **Backward Compatibility:**
  The HTTP response contract for API `#262` remains 100% backward compatible, returning the updated task DTO with status `cancelled` and recorded `cancellation_reason`.
