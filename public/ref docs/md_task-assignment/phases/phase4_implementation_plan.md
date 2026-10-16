# Phase 4 Implementation Plan — Task Assignment Module: Contextual Discussions, Audit Trail & Discussion Concurrency Controls

**Document Path:** `public/md_task-assignment/phases/phase4_implementation_plan.md`  
**Author:** Senior/Principal Backend Engineer & System Architect  
**Status:** Ready for Implementation  
**Baseline Test Suite Status:** **3,421 / 3,421 Passing (100% Green)** across entire HRMS codebase (42 / 42 passing in Task Assignment module suites)  
**Target Completion:** Task Assignment Module Phase 4 (APIs `#253`, `#254`, `#264`, Discussion Rate Limiting, Formalized Audit Service, and Administrative Lifecycle System Comments)  

---

## 1. Goal & Boundary

### 1.0 Goal
Deliver **Phase 4** of the Task Assignment Module: implement contextual in-task discussion threads, chronological comment feeds, Redis sliding-window spam protection, formalized append-only domain audit logging, and administrative lifecycle system comment automation.

Phase 4 enables cross-functional collaboration between assignees, managers, and HR administrators directly on active task records while strictly preventing denial-of-service spam, broken object-level authorization (BOLA) leaks, or state corruption across concurrent operations.

### 1.1 Explicitly in Scope for Phase 4

1. **Contextual In-Task Discussion Endpoints:**
   * **API `#253` (`POST /api/v1/tasks/me/:id/comments`):** Assignee posts an operational progress message or milestone update to their assigned task.
   * **API `#254` (`GET /api/v1/tasks/me/:id/comments`):** Paginated chronological discussion feed retrieval for the task.
   * **API `#264` (`POST /api/v1/tasks/manager/:id/comments`):** People Manager, direct line manager, or HR administrator posts guidance, instructions, or feedback to a team task thread.
   * **Companion Managerial Read Route (`GET /api/v1/tasks/manager/:id/comments`):** High-convenience route on the managerial plane providing identical paginated chronological comment feed access for reporting managers and HR personnel without requiring assignee masquerading.
2. **Contextual Discussion Service (`task_comment.service.js`):**
   * Encapsulates domain logic for validating task state, authorization boundaries, attachment associations, and external link security.
   * Supports `is_progress_update: boolean` milestones, distinguishing general conversational messages from work progress tracking.
   * Enforces BOLA protection: ensures only authenticated participants with verifiable business rights on the task can post or inspect comments.
   * Terminal state protection: blocks new user comments on `cancelled` tasks (`409 TASK_TERMINATED`).
3. **Redis Sliding-Window Rate Limiting (`task_comment_rate_limit.utils.js` / `EC-T12`):**
   * Restricts comment frequency to a maximum of **30 comments per user per task per hour**.
   * Implemented via Redis sliding window or hourly bucket counter (`rate:task_comment:{taskId}:{userId}:{YYYYMMDDHH}`).
   * **Fail-Open Behavior:** If Redis is offline or encounters connection failures, the rate limiter fails open to allow legitimate business comments to proceed without blocking user workflows.
   * Exceeding the rate cap throws `429 Too Many Requests` (`TOO_MANY_COMMENTS`) with a standard `Retry-After` header.
4. **Formalized Domain Audit Service (`task_audit.service.js`):**
   * Wraps `TaskAuditRepository` to establish a centralized domain service for recording non-repudiable audit events (`COMMENT_ADDED`, `TASK_CREATED`, `STATUS_CHANGED`, `TASK_SUBMITTED`, `TASK_COMPLETED`, `TASK_REOPENED`, `TASK_REASSIGNED`, `TASK_CANCELLED`, `DUE_DATE_EXTENDED`, `ATTACHMENT_CONFIRMED`).
   * Standardizes IP address extraction (handling `X-Forwarded-For` proxy headers without VARCHAR(45) overflow) and HTTP User-Agent truncation.
   * Exposes clean query methods for retrieving structured audit trails (`getTaskAuditTrail`).
5. **System-Generated Discussion Comments:**
   * Automatically records system comments (`system_generated = true`) for critical administrative lifecycle transitions:
     * **Task Reopening (`D-T6`):** Injects `"TASK REOPENED: " + reopen_reason` (already wired in Phase 3; formalized in Phase 4).
     * **Task Cancellation:** Injects `"TASK CANCELLED: " + cancellation_reason` into the discussion thread so all parties understand the termination rationale.
     * **Task Reassignment:** Injects `"TASK REASSIGNED: Reassigned to {new_assignee_name}. Reason: {reason}"` to establish chronological hand-off continuity.
6. **Attachment & Link Binding in Discussions:**
   * Validates referenced `attachment_ids` against `task_attachments` table, ensuring files belong to the parent task and tenant organization.
   * Validates `external_links` against strict HTTPS requirements and Server-Side Request Forgery (SSRF) checks (`EC-T11`).
7. **Joi Validation Schemas (`task_comment.validator.js`):**
   * Validates message constraints (1 to 2,000 characters), link arrays ($\le 5$ objects), attachment UUID arrays ($\le 10$), and pagination parameters.
   * Adheres to Express 5 safety requirements (`EC-T13`) by performing query string validation inside controllers via `validateOrThrow`.
8. **Automated Unit & Integration Test Suite (`tests/unit/task/task_phase4_comments_and_audit.test.js`):**
   * 15 exhaustive automated tests covering authorization matrices, rate limiting, system comment generation, BOLA defenses, pagination, and transaction rollbacks.

### 1.2 Explicitly NOT in Scope (Deferred to Phase 5)

* **Asynchronous Outbox Notification Drain Worker (`task_notification_dispatch.cron.js`):** Scheduled polling, SKIP LOCKED worker loops, and batching of outbox events are deferred to Phase 5.
* **Scheduled Overdue Task Sweeper (`task_overdue_sweeper.cron.js`):** Background cron job identifying overdue tasks is deferred to Phase 5.
* **Email Rendering & Transports:** HTML email templates (`task_notification.html`) and AWS SES integration via `src/common/utilities/email.utils.js` are deferred to Phase 5.
* **Settings Catalog Registration:** Registering task module configuration keys in `src/modules/settings/catalog/task.catalog.js` is deferred to Phase 5.
* **WebSocket / SSE Live Streaming:** Real-time push updates for comments are not part of the core HTTP API contract; polling via `#254` is the defined standard.

---

## 2. Pre-Flight Checks & Live Codebase Grounding

Prior to defining Phase 4 specifications, the existing codebase was thoroughly audited to verify architectural readiness:

* **Migration `00075-create-task-assignment-module.js`:**
  * Verified table `task_comments` exists with columns `id`, `org_id`, `task_id`, `author_id`, `message`, `is_progress_update`, `system_generated`, `external_links`, `attachment_ids`, `created_at`, `updated_at`, `deleted_at`.
  * Verified index `task_comments_task_id_created_at_idx` on `(task_id, created_at ASC)`.
  * Verified table `task_audit_logs` exists with columns `id`, `org_id`, `task_id`, `actor_id`, `action`, `from_status`, `to_status`, `details`, `ip_address`, `user_agent`, `created_at`.
  * Verified index `task_audit_logs_task_id_created_at_idx` on `(task_id, created_at DESC)`.
* **Sequelize Models:**
  * Verified `TaskComment` (`src/modules/task/models/task_comments.model.js`) properly wired to `Organization`, `Task`, and `User` (as `author`).
  * Verified `TaskAuditLog` (`src/modules/task/models/task_audit_logs.model.js`) configured as immutable ledger (`paranoid: false`, `updatedAt: false`).
* **Repositories:**
  * Verified `TaskCommentRepository` (`src/modules/task/repositories/task_comment.repository.js`) provides `create`, `findByTaskId`, and `countByTaskId`.
  * Verified `TaskAuditRepository` (`src/modules/task/repositories/task_audit.repository.js`) provides `record`, `create`, and `findByTaskId`.
* **Hierarchy Resolution:**
  * Verified `src/common/utilities/hierarchy_access.utils.js` exposes `getAccessibleUserIds(orgId, requesterUser)`.
* **Redis Infrastructure:**
  * Verified `src/infrastructure/redis/config.redis.js` exports `{ redisClient }` with established patterns in `task_idempotency.utils.js`.
* **Regression Baseline:**
  * Verified all 3,421 tests across 23 test suites pass cleanly with 0 failures (`npm test`).

---

## 3. Scope Reconstruction: Completed vs. Remaining

| Functional Area | Planned Phase | Status | Architectural Impact & Concrete Implementation Details |
|---|---|---|---|
| **Database Schema (`task_comments`, `task_audit_logs`)** | Phase 1 | **COMPLETED** | Tables, indexes, and constraints created in Migration `00075`. No new DDL migrations required for Phase 4. |
| **Sequelize Models & Repositories** | Phase 1 | **COMPLETED** | `TaskComment`, `TaskAuditLog`, `TaskCommentRepository`, and `TaskAuditRepository` operational. |
| **Atomic Read Receipt Tracking (`D-T4`)** | Phase 2 | **COMPLETED** | Atomically stamped on `GET /api/v1/tasks/me/:id` (`#250`) and reset on reassignment (`#261`). |
| **Audit Log Recording in Core Mutations** | Phase 2 & 3 | **PARTIALLY COMPLETED** | Direct `taskAuditRepository.record(...)` calls exist in `task.service.js`. Phase 4 formalizes this into `task_audit.service.js`. |
| **HR Detail View Audit Eager-Loading (`#267`)** | Phase 2 | **COMPLETED** | `GET /api/v1/tasks/hr/:id` already includes `audit_logs` array. |
| **System Comment on Task Reopening (`D-T6`)** | Phase 3 | **COMPLETED** | Injects `"TASK REOPENED: " + reopen_reason` within `task.service.js#reopenTask`. |
| **Assignee Discussion Comment API (`#253`)** | Phase 4 | **REMAINING** | `POST /api/v1/tasks/me/:id/comments` — To be built in Phase 4. |
| **Discussion Chronological Feed API (`#254`)** | Phase 4 | **REMAINING** | `GET /api/v1/tasks/me/:id/comments` — To be built in Phase 4. |
| **Managerial Discussion Comment API (`#264`)** | Phase 4 | **REMAINING** | `POST /api/v1/tasks/manager/:id/comments` — To be built in Phase 4. |
| **Managerial Feed Companion Route** | Phase 4 | **REMAINING** | `GET /api/v1/tasks/manager/:id/comments` — To be built in Phase 4. |
| **Redis Sliding-Window Rate Limiter (`EC-T12`)** | Phase 4 | **REMAINING** | Maximum 30 comments/user/task/hour with fail-open safety. |
| **System Comment on Cancellation** | Phase 4 | **REMAINING** | Injects `"TASK CANCELLED: " + cancellation_reason` on `cancelTask`. |
| **System Comment on Reassignment** | Phase 4 | **REMAINING** | Injects `"TASK REASSIGNED: Reassigned to {name}. Reason: {reason}"` on `reassignTask`. |
| **Terminal State Comment Block** | Phase 4 | **REMAINING** | Rejects user comment posting on `cancelled` tasks (`409 TASK_TERMINATED`). |
| **Formalized `task_audit.service.js`** | Phase 4 | **REMAINING** | Centralizes append-only ledger insertions, IP normalization, and query interfaces. |
| **Automated Unit Test Suite** | Phase 4 | **REMAINING** | `task_phase4_comments_and_audit.test.js` covering all Phase 4 features. |

---

## 4. Directory Structure & File Manifest

### 4.1 New Files Created in Phase 4

```text
src/
└── modules/
    └── task/
        ├── controllers/
        │   └── task_comment.controller.js              # HTTP request handling for APIs #253, #254, #264
        ├── services/
        │   ├── task_comment.service.js                 # Domain logic for comments, BOLA, rate limiting, links
        │   └── task_audit.service.js                   # Domain service wrapping audit logging and provenance
        ├── utils/
        │   └── task_comment_rate_limit.utils.js        # Redis sliding-window rate limiter (30 comments/hr, fail-open)
        └── validators/
            └── task_comment.validator.js               # Joi schemas for comment creation and feed pagination
tests/
└── unit/
    └── task/
        └── task_phase4_comments_and_audit.test.js      # Complete test suite for Phase 4 (15 automated assertions)
```

### 4.2 Existing Files Modified / Extended in Phase 4

```text
src/
└── modules/
    └── task/
        ├── routes/
        │   ├── user_task.routes.js                     # Mount POST /:id/comments (#253) and GET /:id/comments (#254)
        │   └── manager_task.routes.js                  # Mount POST /:id/comments (#264) and GET /:id/comments
        ├── services/
        │   └── task.service.js                         # Integrate system comments on cancelTask and reassignTask
        └── repositories/
            └── task_comment.repository.js              # Extend findByTaskId to eager-load author profile & attachments
```

---

## 5. Discussion Architecture, Contextual Comments & Invariants

### 5.1 Comment Domain Model & Relationship Graph

```text
  ┌────────────────────────────────────────────────────────┐
  │                         Task                           │
  │  (id, org_id, title, status, assignee_id, assigner_id)  │
  └───────────────────────────┬────────────────────────────┘
                              │ 1:N
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                      TaskComment                       │
  │  - id: UUID (PK)                                       │
  │  - org_id: UUID (Tenant Scoping)                       │
  │  - task_id: UUID (FK -> tasks.id)                      │
  │  - author_id: UUID (FK -> users.id)                    │
  │  - message: TEXT (1 - 2,000 characters)                │
  │  - is_progress_update: BOOLEAN (Default: false)        │
  │  - system_generated: BOOLEAN (Default: false)          │
  │  - external_links: JSONB [{ label, url }]              │
  │  - attachment_ids: JSONB [UUID]                        │
  │  - created_at / updated_at / deleted_at                │
  └───────────────────────────┬────────────────────────────┘
                              │ N:1
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │                         User                           │
  │  (id, name, email, avatar, role)                       │
  └────────────────────────────────────────────────────────┘
```

### 5.2 Rate Limiting Architecture (Redis Sliding Window / 30 per Hour)

To prevent spam flooding and Denial of Service (`EC-T12`), every user-initiated comment is rate-limited:
1. **Key Format:** `rate:task_comment:{orgId}:{taskId}:{userId}:{YYYYMMDDHH}`
2. **Algorithm:**
   * Atomically increment the key: `INCR key`.
   * On first call (value returns `1`), set TTL to 3,900 seconds (`EXPIRE key 3900`) ensuring the key covers the full hour plus clock skew.
   * If the incremented value exceeds **30**, throw `AppError(429, 'Rate limit exceeded: maximum 30 comments per hour allowed per task', 'TOO_MANY_COMMENTS')`.
   * Set response header `Retry-After: <seconds_until_next_hour>`.
3. **Fail-Open Guarantee:**
   * If `redisClient` is null, disconnected, or throws a network error, catch the exception, log a warning, and proceed with the operation. An infrastructure cache failure must never prevent legitimate operational communication.
4. **System Comments Exemption:**
   * Automated system comments (`system_generated = true`) generated by workflow transitions bypass the rate limiter entirely.

### 5.3 BOLA Authorization & Hierarchy Access Matrix

| Caller Persona | Endpoint | Access Condition & Business Rule | Non-Compliance Error |
|---|---|---|---|
| **Designated Assignee** | `POST /me/:id/comments` (`#253`) | Must match `task.assignee_id === req.user.id`. | `404 TASK_NOT_FOUND` (Uniform denial) |
| **Assignee / Reviewer / HR** | `GET /me/:id/comments` (`#254`) | Caller is task assignee, task assigner, direct manager in hierarchy, or HR/admin. | `404 TASK_NOT_FOUND` (if stranger) |
| **Task Assigner** | `POST /manager/:id/comments` (`#264`) | Matches `task.assigner_id === req.user.id`. Allowed across all lifecycle states except cancelled. | `403 FORBIDDEN` (if not assigner or manager) |
| **Direct Line Manager** | `POST /manager/:id/comments` (`#264`) | `task.assignee_id` is present in `HierarchyAccess.getAccessibleUserIds()`. | `403 FORBIDDEN` |
| **HR / Admin / Super-Admin** | `POST /manager/:id/comments` (`#264`) | Role in `['hr', 'admin', 'super-admin']`. Allowed org-wide. | Allowed |
| **Unrelated Employee** | Any Comment Endpoint | Not assignee, not assigner, not line manager, not HR. | `404 TASK_NOT_FOUND` or `403 FORBIDDEN` |

### 5.4 System-Generated Discussion Invariants

System comments bridge administrative actions with conversational context:
1. **Reopening Review Feedback (`D-T6`):**
   * Triggered when manager/HR calls `POST /tasks/manager/:id/reopen`.
   * Message: `"TASK REOPENED: " + reopen_reason`.
   * `system_generated: true`, `is_progress_update: false`, `author_id: req.user.id`.
2. **Task Cancellation Feedback:**
   * Triggered when manager/HR calls `POST /tasks/manager/:id/cancel`.
   * Message: `"TASK CANCELLED: " + cancellation_reason`.
   * `system_generated: true`, `is_progress_update: false`, `author_id: req.user.id`.
3. **Task Reassignment Notice:**
   * Triggered when manager/HR calls `POST /tasks/manager/:id/reassign`.
   * Message: `"TASK REASSIGNED: Reassigned to {new_assignee_name}. Reason: {reason}"`.
   * `system_generated: true`, `is_progress_update: false`, `author_id: req.user.id`.

### 5.5 Terminal State Invariant (`EC-T23`)
* If `task.status === 'cancelled'`, all new user comment insertions via `#253` and `#264` are strictly rejected with `409 Conflict` (`TASK_TERMINATED`, message: `'Cannot post comments on a cancelled task'`).
* Reading comments via `#254` remains permitted on cancelled tasks for historical reference.


---

## 6. API Surface & Detailed Endpoint Contracts

### 6.1 API #253: POST /api/v1/tasks/me/:id/comments

* **API Number / Name:** `#253` / Post Assignee Discussion Comment or Progress Update
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/me/:id/comments`
* **Purpose / Business Problem Solved:** Enables the task assignee to post messages, operational questions, progress milestone announcements, external links, and uploaded deliverables to the in-task discussion thread.
* **Plane / Mount:** Employee Self-Service (`/api/v1/tasks/me`)
* **Authentication:** Mandatory via JWT Bearer Token (`Authorization: Bearer <token>`).
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId` via `requireActiveOrg`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Role Authorization:** Accessible to any active tenant role (`employee`, `manager`, `hr`, `admin`, `super-admin`).
* **Resource Ownership (BOLA):** Strict check `task.assignee_id === req.user.id`. If task belongs to another user or does not exist, returns `404 Not Found` (`TASK_NOT_FOUND`).
* **Terminal State Guard:** If `task.status === 'cancelled'`, throws `409 Conflict` (`TASK_TERMINATED`).
* **Spam Rate Limit:** Maximum 30 comments per user per task per hour (`EC-T12`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): `Bearer <JWT>`
  * `Idempotency-Key` (String, Optional): Client-generated UUID for replay protection.
* **Path Parameters:**
  * `id` (UUID, Required): Parent task identifier.

#### Request JSON Payload
| Field | Type | Required / Optional | Constraints & Validation | Description |
|---|---|---|---|---|
| `message` | String | **Required** | Min 1, Max 2,000 characters, trimmed | Message content or discussion body. |
| `is_progress_update` | Boolean | Optional | Default: `false` | When `true`, flags this comment as an explicit work milestone. |
| `attachment_ids` | Array\<UUID\> | Optional | Max 10 UUIDs, default: `[]` | Array of confirmed `task_attachments.id` belonging to this task. |
| `external_links` | Array\<Object\> | Optional | Max 5 objects, default: `[]` | Array of HTTPS reference objects `[{ label, url }]`. |
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

#### Exact Success Response Contract (HTTP 201 Created)
```json
{
  "status": "success",
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

#### Exact Error Responses
* `400 Bad Request` (`VALIDATION_ERROR`): Missing `message`, message $> 2,000$ chars, invalid attachment UUID, non-HTTPS external link, or SSRF attempt.
* `404 Not Found` (`TASK_NOT_FOUND`): Task does not exist in tenant or caller is not assignee.
* `409 Conflict` (`TASK_TERMINATED`): Task status is `cancelled`.
* `429 Too Many Requests` (`TOO_MANY_COMMENTS`): User has posted $> 30$ comments on this task in the current hour.

---

### 6.2 API #254: GET /api/v1/tasks/me/:id/comments

* **API Number / Name:** `#254` / List Task Discussion Comments (Chronological Feed)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/tasks/me/:id/comments`
* **Purpose / Business Problem Solved:** Retrieves the paginated chronological conversation feed for a task, returning author profiles, system-generated rework/cancellation notes, progress updates, and supporting attachments.
* **Plane / Mount:** Employee Self-Service (`/api/v1/tasks/me`)
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Role Authorization:** Accessible to any active tenant user participating in the task.
* **Resource Ownership (BOLA):** Caller must be task assignee, task assigner, direct line manager of assignee, or HR/admin. Strangers receive `404 Not Found` (`TASK_NOT_FOUND`).

#### Request Parameters
* **Path Parameters:**
  * `id` (UUID, Required): Parent task identifier.
* **Query Parameters:**
  * `page` (Integer, Optional, Default: `1`, Min: `1`): Page number.
  * `limit` (Integer, Optional, Default: `50`, Min: `1`, Max: `100`): Results per page.
  * `order` (String, Optional, Default: `'ASC'`, Valid: `'ASC'`, `'DESC'`): Sort order by `created_at`.
  * `is_progress_update` (Boolean, Optional): Filter for progress milestone comments only.

#### Exact Success Response Contract (HTTP 200 OK)
```json
{
  "status": "success",
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
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total_items": 2,
      "total_pages": 1,
      "has_next_page": false,
      "has_prev_page": false
    }
  }
}
```

---

### 6.3 API #264: POST /api/v1/tasks/manager/:id/comments

* **API Number / Name:** `#264` / Post Managerial Discussion Comment or Review Feedback
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/tasks/manager/:id/comments`
* **Purpose / Business Problem Solved:** Enables People Managers, assigning supervisors, or HR administrators to post guidance, mid-flight review feedback, requests for clarification, or milestone sign-offs on a subordinate's task.
* **Plane / Mount:** Manager Delegation & Oversight (`/api/v1/tasks/manager`)
* **Authentication:** Mandatory via JWT Bearer Token.
* **Tenant Scoping:** Hard-scoped to `org_id = req.user.orgId`.
* **Feature Entitlement:** Gated by `requireFeature('tasks.access')`.
* **Role Authorization:** Gated by `authorize(['manager', 'hr', 'admin', 'super-admin'])`.
* **Hierarchy Access Verification:** Caller must be:
  1. The task assigner (`task.assigner_id === req.user.id`), OR
  2. Direct line manager of the assignee (`task.assignee_id in HierarchyAccess.getAccessibleUserIds()`), OR
  3. In HR/Admin governance roles (`['hr', 'admin', 'super-admin']`).
  If caller fails all three criteria, returns `403 Forbidden` (`FORBIDDEN_TASK_ACCESS`).
* **Terminal State Guard:** If `task.status === 'cancelled'`, throws `409 Conflict` (`TASK_TERMINATED`).
* **Spam Rate Limit:** Maximum 30 comments per user per task per hour (`EC-T12`).

#### Request Parameters
* **Headers:**
  * `Authorization` (String, Required): `Bearer <JWT>`
  * `Idempotency-Key` (String, Optional): Client-generated UUID for replay protection.
* **Path Parameters:**
  * `id` (UUID, Required): Parent task identifier.

#### Request JSON Payload
Identical to API `#253` schema (`message`, optional `is_progress_update`, optional `attachment_ids`, optional `external_links`).

#### Exact Success Response Contract (HTTP 201 Created)
Identical to API `#253` schema, returning the persisted comment record with the manager's author profile.

#### Exact Error Responses
* `400 Bad Request` (`VALIDATION_ERROR`): Message invalid, attachment UUID unverified, or link invalid.
* `403 Forbidden` (`FORBIDDEN_TASK_ACCESS`): Manager does not assign or manage the assignee and is not HR.
* `404 Not Found` (`TASK_NOT_FOUND`): Task does not exist in tenant organization.
* `409 Conflict` (`TASK_TERMINATED`): Task status is `cancelled`.
* `429 Too Many Requests` (`TOO_MANY_COMMENTS`): Exceeded 30 comments/user/task/hour cap.

---

### 6.4 Companion Route: GET /api/v1/tasks/manager/:id/comments

* **Purpose:** High-convenience companion feed route mounted on `manager_task.routes.js`.
* **Behavior:** Identical to API `#254`, allowing managers and HR inspecting subordinate tasks via `/manager` routes to retrieve the discussion feed without needing to switch route prefixes.
* **Implementation:** Shares `taskCommentController.getComments` handler and `task_comment.service.js#getTaskComments` domain method.

---

## 7. Service & Domain Architecture

### 7.1 `task_comment.service.js` Detailed Specifications

```javascript
/**
 * task_comment.service.js
 * 
 * Domain service managing in-task discussion threads, BOLA access validation,
 * spam rate limiting, external link sanitization, and system feedback injection.
 */
class TaskCommentService {
  /**
   * Posts a new user-authored comment on a task (#253 / #264).
   * 
   * @param {string} orgId - Tenant organization UUID.
   * @param {string} taskId - Target task UUID.
   * @param {Object} requesterUser - Authenticated caller { id, role, orgId }.
   * @param {Object} payload - Validated body { message, is_progress_update, external_links, attachment_ids }.
   * @param {Object} context - Metadata { ipAddress, userAgent, plane: 'self' | 'manager' }.
   * @returns {Promise<Object>} Created comment DTO.
   */
  async postComment(orgId, taskId, requesterUser, payload, context = {})

  /**
   * Retrieves paginated chronological comments for a task (#254).
   * 
   * @param {string} orgId - Tenant organization UUID.
   * @param {string} taskId - Target task UUID.
   * @param {Object} requesterUser - Authenticated caller { id, role, orgId }.
   * @param {Object} query - Validated query { page, limit, order, is_progress_update }.
   * @returns {Promise<Object>} Paginated comments collection DTO.
   */
  async getTaskComments(orgId, taskId, requesterUser, query = {})

  /**
   * Posts an automated system comment for administrative transitions (D-T6, cancel, reassign).
   * Bypasses user rate limits and authorization checks.
   * 
   * @param {string} orgId - Tenant organization UUID.
   * @param {string} taskId - Target task UUID.
   * @param {string} authorId - Actor UUID who triggered the transition.
   * @param {string} message - Formatted system message.
   * @param {Object} options - Options { transaction }.
   * @returns {Promise<TaskComment>} Created system comment instance.
   */
  async postSystemComment(orgId, taskId, authorId, message, { transaction } = {})
}
```

### 7.2 `task_audit.service.js` Detailed Specifications

```javascript
/**
 * task_audit.service.js
 * 
 * Domain service providing centralized provenance recording and audit querying
 * for all lifecycle state mutations across the Task Assignment subsystem.
 */
class TaskAuditService {
  /**
   * Records an immutable audit log row in task_audit_logs.
   * 
   * @param {Object} params
   * @param {string} params.orgId - Tenant organization UUID.
   * @param {string} params.taskId - Task UUID.
   * @param {string} params.actorId - User UUID who performed the mutation.
   * @param {string} params.action - Action constant (e.g., 'COMMENT_ADDED', 'TASK_CANCELLED').
   * @param {string} [params.fromStatus] - Previous status.
   * @param {string} [params.toStatus] - New status.
   * @param {Object} [params.details] - Metadata context payload.
   * @param {Object} [params.req] - Express request object for IP and User-Agent extraction.
   * @param {Object} [options] - Options { transaction }.
   * @returns {Promise<TaskAuditLog>} Created audit log row.
   */
  async recordAction({ orgId, taskId, actorId, action, fromStatus, toStatus, details, req }, { transaction } = {})

  /**
   * Retrieves paginated audit history for a task.
   * 
   * @param {string} orgId - Tenant organization UUID.
   * @param {string} taskId - Target task UUID.
   * @param {Object} requesterUser - Authenticated caller.
   * @param {Object} pagination - { page, limit }.
   * @returns {Promise<Object>} Chronological audit trail.
   */
  async getTaskAuditTrail(orgId, taskId, requesterUser, pagination = {})
}
```

### 7.3 Integration with `task.service.js`
In `src/modules/task/services/task.service.js`:
1. **In `cancelTask`:** After updating status to `cancelled` and recording the audit log, invoke:
   ```javascript
   await taskCommentService.postSystemComment(
     orgId,
     taskId,
     requesterUser.id,
     `TASK CANCELLED: ${cancellationReason}`,
     { transaction }
   )
   ```
2. **In `reassignTask`:** After updating assignee and resetting read receipts, invoke:
   ```javascript
   await taskCommentService.postSystemComment(
     orgId,
     taskId,
     requesterUser.id,
     `TASK REASSIGNED: Reassigned to ${newAssignee.name || 'new employee'}. Reason: ${reason}`,
     { transaction }
   )
   ```
3. **In `reopenTask`:** Replace direct repository insert with `taskCommentService.postSystemComment` for unified architectural encapsulation.

---

## 8. Joi Validation Schemas Specification

Created in `src/modules/task/validators/task_comment.validator.js`:

```javascript
'use strict'

const Joi = require('joi')

const taskIdParamSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    'string.guid': 'Task ID must be a valid UUID',
    'any.required': 'Task ID is required'
  })
})

const externalLinkSchema = Joi.object({
  label: Joi.string().trim().min(1).max(100).required().messages({
    'string.empty': 'Link label is required',
    'string.max': 'Link label cannot exceed 100 characters',
    'any.required': 'Link label is required'
  }),
  url: Joi.string().trim().uri({ scheme: ['https'] }).max(1000).required().messages({
    'string.uri': 'Link URL must be a valid secure https:// URI',
    'string.max': 'Link URL cannot exceed 1000 characters',
    'any.required': 'Link URL is required'
  })
})

const postCommentSchema = Joi.object({
  message: Joi.string().trim().min(1).max(2000).required().messages({
    'string.empty': 'Comment message cannot be empty',
    'string.min': 'Comment message must contain at least 1 character',
    'string.max': 'Comment message cannot exceed 2000 characters',
    'any.required': 'Comment message is required'
  }),
  is_progress_update: Joi.boolean().default(false),
  attachment_ids: Joi.array().items(Joi.string().uuid()).max(10).default([]),
  external_links: Joi.array().items(externalLinkSchema).max(5).default([])
}).required()

const listCommentsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  order: Joi.string().valid('ASC', 'DESC').default('ASC'),
  is_progress_update: Joi.boolean().optional()
})

module.exports = {
  taskIdParamSchema,
  externalLinkSchema,
  postCommentSchema,
  listCommentsQuerySchema
}
```

---

## 9. Concurrency, OCC, Idempotency & Rate Limiting Controls

1. **Append-Only Concurrency Independence:**
   * Unlike task status transitions which mutate the `tasks` row and increment `_version`, comment posting inserts an independent child row into `task_comments`.
   * Multiple team members (e.g., Assignee and Manager) posting comments simultaneously do **not** encounter optimistic concurrency conflicts (`412 Precondition Failed`). Active conversations proceed without locking or blocking.
2. **Idempotency Replay Protection (`EC-T5`):**
   * Both `POST /api/v1/tasks/me/:id/comments` and `POST /api/v1/tasks/manager/:id/comments` accept `Idempotency-Key`.
   * Integrates `task_idempotency.utils.js`: duplicate submissions within 120 seconds return the cached HTTP 201 response with `{ reused: true }`.
3. **Spam & Flooding Protection (`EC-T12`):**
   * Enforced via `task_comment_rate_limit.utils.js`: maximum 30 comments per user per task per hour.
   * Uses Redis `INCR` + `EXPIRE 3900` on the first increment.
   * If Redis is unavailable, fails open safely.

---

## 10. Transaction Boundaries, Non-Repudiation & Audit Trail

1. **User Comment Posting Transaction:**
   ```text
   BEGIN TRANSACTION
     1. Verify task exists, org_id matches, and task.status != 'cancelled'
     2. Verify BOLA authorization (Assignee or Manager hierarchy)
     3. Verify referenced attachment_ids belong to task and tenant
     4. INSERT INTO task_comments (...)
     5. INSERT INTO task_audit_logs (action = 'COMMENT_ADDED', details = { comment_id, is_progress_update })
   COMMIT
   ```
2. **Administrative System Comment Transaction:**
   * Reopen, cancel, and reassign workflows wrap their status change, audit log, and system comment inside the single database transaction.
   * If any step fails, the entire transaction rolls back cleanly, preventing phantom system comments or detached status transitions.
3. **Non-Repudiation Logging:**
   * Audit logs record `actor_id`, `ip_address`, and `user_agent`.
   * `task_audit_logs` model has `updatedAt: false` and `paranoid: false`, guaranteeing immutable write-once provenance.


---

## 11. Comprehensive Edge Cases & Defensive Engineering Register

| # | Edge Case / Attack Vector | Defensive Engineering Safeguard | Expected Error / Status |
|---|---|---|---|
| **EC-T5** | **Rapid Double-Click Submission** | Client double-submits comment form with identical `Idempotency-Key`. Replay guard detects duplicate in Redis cache within 120s and replays cached response. | HTTP 201 (`reused: true`) |
| **EC-T11** | **Server-Side Request Forgery (SSRF) via Links** | Malicious actor attaches metadata or private IP link (e.g. `https://169.254.169.254/`). Joi schema and `isSafeReferenceUrl` utility reject non-HTTPS URLs, private IPv4/IPv6 ranges, loopbacks, and internal DNS suffixes. | HTTP 400 (`VALIDATION_ERROR`) |
| **EC-T12** | **Comment Flooding / Spam Denial of Service** | Script attempts to post 1,000 comments in rapid succession. Redis sliding window limiter throttles caller once 30 comments per user per task per hour is reached. | HTTP 429 (`TOO_MANY_COMMENTS`, `Retry-After: <sec>`) |
| **EC-T13** | **Express 5 Getter-Only `req.query` Crash** | Validating query params at route middleware layer in Express 5 causes runtime crash. Query schema validation executes inside `taskCommentController.getComments` using `validateOrThrow(listCommentsQuerySchema, req.query)`. | Safe HTTP 400 on invalid query; no server crash |
| **EC-T16** | **Cross-Tenant IDOR Attempt** | User in Organization A attempts to post or read comments on a task belonging to Organization B by guessing UUID. Database queries enforce `where: { id: taskId, org_id: req.user.orgId }`. | HTTP 404 (`TASK_NOT_FOUND`, uniform denial) |
| **EC-T18** | **Soft-Deleted Task Access** | User attempts to post or view comments on a soft-deleted task (`deleted_at IS NOT NULL`). Sequelize `paranoid: true` automatically filters out deleted task. | HTTP 404 (`TASK_NOT_FOUND`) |
| **EC-T23** | **Commenting on Terminal Cancelled Task** | User attempts to post comment on a task with `status === 'cancelled'`. Domain service inspects status before comment insertion and rejects mutation. | HTTP 409 (`TASK_TERMINATED`) |
| **EC-T24** | **Unverified Attachment Reference** | User references an attachment UUID in `attachment_ids` that does not exist, belongs to another task, or belongs to another tenant. Domain service validates each UUID against `task_attachments` table. | HTTP 400 (`INVALID_ATTACHMENT`) |
| **EC-T25** | **Redis Outage During Commenting** | Redis cache cluster is offline or unreachable when rate limit is checked. Rate limiter wraps Redis call in try/catch and fails open, allowing business discussion to proceed. | Graceful pass-through |

---

## 12. Implementation Sequence & Dependency Order

The implementation must be executed strictly in the following 6-step dependency order:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Step 1: Utility & Validators                                           │
│ - Create task_comment_rate_limit.utils.js (Redis sliding window / open)│
│ - Create task_comment.validator.js (Joi schemas)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Step 2: Formalized Domain Audit Service                                │
│ - Create task_audit.service.js (Standardized recording & queries)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Step 3: Contextual Discussion Service                                  │
│ - Create task_comment.service.js (BOLA checks, link/attachment verify) │
│ - Extend task_comment.repository.js for eager-loaded author joins      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Step 4: Controller & Route Aggregation                                 │
│ - Create task_comment.controller.js (Express 5 safe query handling)    │
│ - Mount POST /:id/comments (#253) & GET /:id/comments (#254) in user   │
│ - Mount POST /:id/comments (#264) & GET /:id/comments in manager routes│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Step 5: System Comment Automation in Task Mutations                    │
│ - Update task.service.js#cancelTask to inject system comment           │
│ - Update task.service.js#reassignTask to inject system comment         │
│ - Verify task.service.js#reopenTask system comment integration         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Step 6: Automated Testing & Verification                               │
│ - Create tests/unit/task/task_phase4_comments_and_audit.test.js        │
│ - Run full regression: node --test tests/unit/task/*.test.js           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Testing & Verification Strategy

All automated testing must use the native Node.js test runner (`node:test`) without adding third-party dependencies, adhering to HRMS standards.

### 13.1 Phase 4 Test Suite Manifest (`tests/unit/task/task_phase4_comments_and_audit.test.js`)

| Test ID | Test Scenario & Verification Target | Key Assertions |
|---|---|---|
| **`T-P4-1`** | Joi validation: `postCommentSchema` rejects empty message, message $> 2,000$ chars, and invalid links | Throws 400 on empty message; throws 400 on non-HTTPS link. |
| **`T-P4-2`** | Assignee can post a comment with valid text on active task via `#253` | Returns HTTP 201, persists `TaskComment` with `system_generated = false`. |
| **`T-P4-3`** | Assignee posting comment with `is_progress_update = true` persists milestone flag | `is_progress_update` is `true` in response and database. |
| **`T-P4-4`** | Stranger/unrelated employee attempting to post comment via `#253` receives uniform 404 | Throws HTTP 404 (`TASK_NOT_FOUND`), zero data leak. |
| **`T-P4-5`** | Commenting on a cancelled task throws 409 conflict (`EC-T23`) | Throws HTTP 409 (`TASK_TERMINATED`). |
| **`T-P4-6`** | Referencing unverified or cross-task attachment ID in comment throws 400 (`EC-T24`) | Throws HTTP 400 (`INVALID_ATTACHMENT`). |
| **`T-P4-7`** | Redis sliding window rate limiter throttles user after 30 comments per hour (`EC-T12`) | Throws HTTP 429 (`TOO_MANY_COMMENTS`) with `Retry-After`. |
| **`T-P4-8`** | Rate limiter gracefully fails open when Redis is offline | When Redis client throws, operation succeeds cleanly. |
| **`T-P4-9`** | Assigned manager and direct line manager can post comment via `#264` | Returns HTTP 201; verifies `task.assigner_id` and line hierarchy. |
| **`T-P4-10`** | Manager outside assignee reporting chain attempting `#264` receives 403 Forbidden | Throws HTTP 403 (`FORBIDDEN_TASK_ACCESS`). |
| **`T-P4-11`** | HR administrator can post comment on any task org-wide via `#264` | Returns HTTP 201 regardless of department hierarchy. |
| **`T-P4-12`** | Feed retrieval (`#254`) returns chronological comments with eager-loaded author profile | Comments ordered `created_at ASC`, author `name` and `email` populated. |
| **`T-P4-13`** | Reopening a task automatically injects system-generated rework comment | Injects `"TASK REOPENED: ..."`, `system_generated = true`. |
| **`T-P4-14`** | Cancelling a task automatically injects system-generated cancellation comment | Injects `"TASK CANCELLED: ..."`, `system_generated = true`. |
| **`T-P4-15`** | Express application correctly mounts `#253`, `#254`, and `#264` across routers | Validates Express router stack matches API specifications. |

---

## 14. Migration, Backward Compatibility & Deployment Considerations

* **Database Migrations:** Zero schema migrations required. Migration `00075` already established `task_comments` and `task_audit_logs` in Phase 1.
* **Backward Compatibility:**
  * All Phase 1, Phase 2, and Phase 3 routes (`#249`–`#252`, `#255`–`#263`, `#265`–`#270`) continue operating without breaking changes.
  * System comment injection during `reopenTask`, `cancelTask`, and `reassignTask` is purely additive and enhances thread visibility without altering existing status transition response schemas.
* **Zero Runtime Overhead on Status Mutations:**
  * System comments participate in existing active transactions, maintaining atomic consistency without introducing distributed lock overhead.

---

## 15. Production Readiness Checklist & Acceptance Criteria

1. [ ] **No Schema Drift:** All database operations utilize tables created in Migration `00075`.
2. [ ] **Strict BOLA Enforcement:** Only authorized task participants (Assignee, Assigner, Hierarchy Manager, HR) can participate in discussions.
3. [ ] **Spam & Flooding Prevention:** Redis sliding window limiter throttles $> 30$ comments/user/task/hour with fail-open fallback.
4. [ ] **SSRF Defense:** All external links are validated for HTTPS and private IP/cloud metadata rejections (`EC-T11`).
5. [ ] **Terminal State Integrity:** Cancelled tasks reject new comments (`EC-T23`).
6. [ ] **Administrative Traceability:** System comments capture rework reasons, cancellation rationales, and reassignment hand-offs.
7. [ ] **Express 5 Compatibility:** All query schemas validated safely inside controller handlers (`EC-T13`).
8. [ ] **Complete Test Coverage:** All 15 automated test assertions pass cleanly in `task_phase4_comments_and_audit.test.js`.
9. [ ] **Zero Global Test Regressions:** All 3,421 existing repository tests pass with zero failures.
10. [ ] **Documentation Synchronization:** APIs `#253`, `#254`, and `#264` ready for immediate documentation in `phase4_api_analysis.md`, `combined_api_analysis.md`, and `api_registry.md`.

---

## 16. Final Sign-Off & Verification Summary

Upon completion of Phase 4, the Task Assignment Module will possess:
* 3 architectural planes supporting contextual collaboration: Self-Service (`/me`), Managerial Oversight (`/manager`), and Global Governance (`/hr`).
* Exactly **22 out of 22 planned HTTP APIs** implemented across Phases 2, 3, and 4 (`#249` through `#270`).
* Non-repudiable audit logging across all state transitions and conversational interactions.
* Full protection against concurrency conflicts, spam flooding, and multi-tenant IDOR vulnerabilities.
