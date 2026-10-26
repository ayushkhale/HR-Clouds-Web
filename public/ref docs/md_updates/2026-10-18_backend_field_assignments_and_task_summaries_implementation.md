# Backend Implementation: Field Assignments & Per-Person Task Summaries

**Date:** 2026-10-18  
**To:** Frontend Engineering Team (HR Clouds Web)  
**From:** Principal Senior Backend Engineer  
**Reference Document:** `public/md_updates/2026-10-18_frontend_requests_field_assignments_and_person_task_counts.md`  
**Updated Contracts:**  
- `public/md_attendance/7_work_mode_and_field_geofencing_api.md`  
- `public/md_system/api_registry.md`  
**Status:** **Fully Implemented & Verified (Tests Passing)**

---

## Executive Summary

All requests outlined by the frontend team in `2026-10-18_frontend_requests_field_assignments_and_person_task_counts.md` have been fully engineered, tested, and documented into production contracts:

1. **`assigned_user_count` on Field Locations List:** Delivered per-row on `GET /api/v1/attendance/{hr|manager}/field-locations` along with a root `assigned_user_counts` map.
2. **Assignment Window Modification:** Delivered via `PUT /api/v1/attendance/{hr|manager}/field-assignments/:assignment_id` accepting `effective_from` and `effective_to` without mutating original assigner attribution or dropping historical punch validity.
3. **Flat Paginated "Who Is Assigned Where" Read:** Delivered via `GET /api/v1/attendance/{hr|manager}/field-assignments` with filtering (`field_location_id`, `user_id`, `is_active`, `page`, `limit`), hierarchy scoping, and nested client site, user, and assigner profiles.
4. **API Registry Coverage:** All 21 field-location, field-assignment, and task-summary endpoints have been formally registered in `public/md_system/api_registry.md`.
5. **Per-Person Task Status & Overdue Summaries:** Implemented `GET /api/v1/tasks/manager/team-tasks/summary?subordinate_id=...` and `GET /api/v1/tasks/hr/summary?assignee_id=...` returning `{ by_status: { ... }, overdue: N }` in a single high-performance conditional aggregation query.

---

## 1. `assigned_user_count` on Field Locations List

### Endpoints
- `GET /api/v1/attendance/hr/field-locations`
- `GET /api/v1/attendance/manager/field-locations`

### Implementation Details
- In `field_location.service.js`, the service performs batch active assignment aggregation using `employee_field_assignments.repository.countActiveByLocationIds(locationIds)`.
- It executes a single `GROUP BY field_location_id` query over `is_active: true` rows, preventing N+1 queries and avoiding Sequelize `findAndCountAll({ distinct: true })` subquery syntax breakage.
- Each record in `records[]` now includes `assigned_user_count: <number>`.
- Additionally, the response root echoes `assigned_user_counts: { "<location_id>": count, ... }` for bulk client-side lookup if needed.

### Sample Response (`200 OK`)
```json
{
  "success": true,
  "message": "Field locations fetched successfully",
  "data": {
    "total": 12,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "records": [
      {
        "id": "9f1c7d2e-3b4a-4c5d-6e7f-8a9b0c1d2e3f",
        "name": "Tata Steel Pune Plant",
        "client_name": "Tata Steel Ltd",
        "city": "Pune",
        "is_active": true,
        "assigned_user_count": 6,
        "creator": {
          "id": "7b02c3d4-...",
          "identifier": "manager@acme.com",
          "profile": { "first_name": "Asha", "last_name": "Rao", "display_name": "Asha Rao" }
        }
      }
    ],
    "assigned_user_counts": {
      "9f1c7d2e-3b4a-4c5d-6e7f-8a9b0c1d2e3f": 6
    }
  }
}
```

---

## 2. Assignment Window Modification (`PUT`)

### Endpoints
- `PUT /api/v1/attendance/hr/field-assignments/:assignment_id`
- `PUT /api/v1/attendance/manager/field-assignments/:assignment_id`

### Route Alias Compatibility
Both `:assignment_id` and legacy `:id` path params are accepted by the validator.

### Request Body Schema
```json
{
  "effective_from": "2026-11-01",
  "effective_to": "2027-01-31"
}
```
- At least one of `effective_from` or `effective_to` is required.
- Dates must be ISO `YYYY-MM-DD` strings.
- `effective_to` can be explicitly passed as `null` to make the assignment open-ended.
- Enforces `effective_to >= effective_from` whether both are sent or one is merged with the existing database record.

### Security & Business Logic
- **Hierarchy Scoping:** HR can update any assignment in the tenant. A manager can only update assignments for direct subordinates (`user_reporting_mappings`). Cross-team modification returns `403 HIERARCHY_VIOLATION`.
- **Preserved Attribution:** The original `assigned_by` UUID is **never** overwritten; audit logs and punch defense history remain intact.
- **Active State Guard:** Calling `PUT` on an already unassigned/soft-deleted record returns `400 FIELD_ASSIGNMENT_INACTIVE`.

### Sample Response (`200 OK`)
```json
{
  "success": true,
  "message": "Field assignment updated successfully",
  "data": {
    "id": "c4de1a2b-...",
    "organization_id": "9b1deb4d-...",
    "user_id": "aa11bb22-...",
    "field_location_id": "9f1c7d2e-...",
    "assigned_by": "7b02c3d4-...",
    "effective_from": "2026-11-01",
    "effective_to": "2027-01-31",
    "is_active": true,
    "created_at": "2026-10-05T09:00:00.000Z",
    "updated_at": "2026-10-18T18:40:00.000Z"
  }
}
```

---

## 3. Flat Paginated "Who Is Assigned Where" Read (`GET`)

### Endpoints
- `GET /api/v1/attendance/hr/field-assignments`
- `GET /api/v1/attendance/manager/field-assignments`

### Query Parameters
| Parameter | Type | Default | Validation / Behavior |
| :--- | :--- | :--- | :--- |
| `field_location_id` | UUID | optional | Filters assignments for a specific site |
| `user_id` | UUID | optional | Filters assignments for a specific employee |
| `is_active` | boolean / string | `true` | Coerced safely; `true` (active only), `false` (inactive only), or `all` / `include_inactive=true` |
| `include_inactive` | boolean | `false` | When `true`, returns both active and inactive assignments |
| `page` | integer | `1` | Page number (>= 1) |
| `limit` | integer | `20` | Page size (1 to 100) |

### Authorization Scoping
- **HR:** Scoped org-wide. Can filter by any employee or client site in the tenant.
- **Manager:** Strictly bounded to direct reports.
  - If no `user_id` is supplied, returns assignments for all direct reports. If manager has no subordinates, returns `{ total: 0, records: [] }`.
  - If a manager passes `?user_id=<UUID>`, the server checks if that UUID reports to the manager. If not, it immediately rejects with `403 HIERARCHY_VIOLATION`.

### Eager-Loaded Relations
The response includes full nested models matching API 8:
- `field_location`: `{ id, name, client_name, latitude, longitude, geofence_radius_meters, city, is_active }`
- `user`: `{ id, email, profile: { first_name, last_name, display_name } }`
- `assigner`: `{ id, email, profile: { first_name, last_name, display_name } }`

---

## 4. Per-Person Task Status Summary (Task Module)

### Endpoints
- **Manager Dashboard:** `GET /api/v1/tasks/manager/team-tasks/summary?subordinate_id=...`
- **HR Dashboard:** `GET /api/v1/tasks/hr/summary?assignee_id=...`

### Route Ordering & Collision Prevention
Mounted strictly **before** `/:id` routes in `manager_task.routes.js` and `hr_task.routes.js` to prevent Express from treating literal `summary` as an invalid UUID `:id`.

### Query Parameters
- `subordinate_id` (Manager route): Optional UUIDv4. If supplied, must be a direct subordinate of the calling manager (validated via `HierarchyAccess.getAccessibleUserIds`). Out-of-scope IDs return `403 CANNOT_ACCESS_OUTSIDE_HIERARCHY`.
- `assignee_id` (HR route): Optional UUIDv4. Scoped to the organization.

### Aggregation Architecture
The counts are executed in a single high-performance SQL query via `TaskRepository.getStatusSummary(whereClause)` using conditional aggregation:
```sql
COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
...
COUNT(CASE WHEN status NOT IN ('completed', 'cancelled') AND due_date < NOW() THEN 1 END) AS overdue
```

### Sample Response (`200 OK`)
```json
{
  "success": true,
  "message": "Team tasks summary retrieved successfully",
  "data": {
    "by_status": {
      "pending": 3,
      "in_progress": 1,
      "in_review": 2,
      "reopened": 0,
      "completed": 9,
      "cancelled": 1
    },
    "overdue": 2
  }
}
```

---

## 5. API Registry Updates (`public/md_system/api_registry.md`)

All field endpoints and task summary endpoints are now indexed in the central registry:
- **Employee Self-Service:**
  - #21: `GET /api/v1/attendance/my-field-assignments`
- **Manager Operations:**
  - #19: `POST /api/v1/attendance/manager/field-locations`
  - #20: `GET /api/v1/attendance/manager/field-locations`
  - #21: `GET /api/v1/attendance/manager/field-locations/:id`
  - #22: `PUT /api/v1/attendance/manager/field-locations/:id`
  - #23: `DELETE /api/v1/attendance/manager/field-locations/:id`
  - #24: `POST /api/v1/attendance/manager/field-assignments`
  - #25: `GET /api/v1/attendance/manager/field-assignments`
  - #26: `GET /api/v1/attendance/manager/field-assignments/user/:user_id`
  - #27: `PUT /api/v1/attendance/manager/field-assignments/:assignment_id`
  - #28: `DELETE /api/v1/attendance/manager/field-assignments/:assignment_id`
  - #257a: `GET /api/v1/tasks/manager/team-tasks/summary`
- **HR Administration:**
  - #64: `POST /api/v1/attendance/hr/field-locations`
  - #65: `GET /api/v1/attendance/hr/field-locations`
  - #66: `GET /api/v1/attendance/hr/field-locations/:id`
  - #67: `PUT /api/v1/attendance/hr/field-locations/:id`
  - #68: `DELETE /api/v1/attendance/hr/field-locations/:id`
  - #69: `POST /api/v1/attendance/hr/field-assignments`
  - #70: `GET /api/v1/attendance/hr/field-assignments`
  - #71: `GET /api/v1/attendance/hr/field-assignments/user/:user_id`
  - #72: `PUT /api/v1/attendance/hr/field-assignments/:assignment_id`
  - #73: `DELETE /api/v1/attendance/hr/field-assignments/:assignment_id`
  - #266a: `GET /api/v1/tasks/hr/summary`

---

## 6. Verification & Test Suite Parity

Comprehensive automated unit test suites cover all new paths and security constraints:
- `tests/unit/attendance/field_location_service.test.js`:
  - Verified `assigned_user_count` batch computation on list.
  - Verified `updateFieldAssignment` date validation, transactional commits, and hierarchy checks.
  - Verified `getFieldAssignments` org and subordinate scoping, custom filtering, and BOLA rejection.
  - Result: **32 / 32 tests passing**.
- `tests/unit/attendance/field_location_validator.test.js`:
  - Verified `updateFieldAssignmentSchema`, date format regex, and `fieldAssignmentsQuerySchema`.
  - Result: **13 / 13 tests passing**.
- `tests/unit/task/task_status_summary.test.js`:
  - Verified Manager & HR query validation.
  - Verified Manager hierarchy scoping (valid subordinate, cross-hierarchy 403, and empty subordinate list returning zero counts).
  - Verified HR global and single-user scoping.
  - Result: **7 / 7 tests passing**.
- `tests/unit/task/task_phase2_service_and_api.test.js`:
  - Verified router wiring and zero regression on existing endpoints.
  - Result: **Passing**.
