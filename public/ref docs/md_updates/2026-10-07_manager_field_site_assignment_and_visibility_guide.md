# Frontend Integration Guide: Manager Field Site Assignment & Cross-Manager Visibility Rules

**Document Date:** October 7, 2026  
**Status:** Implemented & Verified in Backend  
**Module:** Attendance & Field Geofencing (`src/modules/attendance`)  
**Audience:** Frontend Engineers building Manager & HR Field Management screens, Team Management modals, and Employee Assignment UI.

---

## Executive Summary & Direct Answers

### 1. Are we allowing Managers to assign a person to a site?
**YES.**
* Managers have dedicated endpoints (`/api/v1/attendance/manager/field-assignments`) to assign employees to field locations.
* **Hierarchy Scope (Strict 1-Level):** A manager can **only** assign their **active direct reports** (resolved dynamically via company hierarchy).
* **Self-Assignment Blocked:** A manager **cannot** assign themselves to a field site (`403 HIERARCHY_VIOLATION`). If a manager requires a field assignment, an HR admin must assign it.
* **Non-Report Blocked:** Attempting to assign an employee from another department or a skip-level report returns `403 HIERARCHY_VIOLATION`.

### 2. Can a Manager assign a person to a site created by someone else (another Manager or HR)?
**YES, by design (Architecture Decision 7).**
* Field locations represent **physical client sites, factories, or customer locations** (e.g., "Tata Steel Pune Plant", "Adani Port Mundra").
* Sites are scoped **organization-wide** (`org_id`). Any active field site registered in the organization can be selected by **any Manager** to assign their direct reports.
* The backend does **NOT** restrict assignments based on `created_by`. 
* **Site Mutation vs. Assignment:**
  * Only the creator (`created_by === requester.id`) or an `HR` admin can **edit** (`PUT`) or **retire/delete** (`DELETE`) a site.
  * **Any Manager** can assign their own team members to **any active site**, regardless of whether HR or Manager B originally registered that site.

### 3. If a person is assigned by HR or Manager 'B' to a site, will that assignment be visible to another Manager or HR?
Visibility depends on which endpoint/screen is being queried:

| Perspective / Screen | Who is Querying | Target / Context | Is It Visible? | Exact Behavior & Fields |
| :--- | :--- | :--- | :--- | :--- |
| **A. Site Details Screen**<br>`GET /field-locations/:id` | **HR Admin** | Any site | **YES** | Receives `assigned_user_count` AND full `assignments: [...]` array with employee names and details. |
| **A. Site Details Screen**<br>`GET /field-locations/:id` | **Site Creator** (Manager A) | Site created by Manager A | **YES** | Receives `assigned_user_count` AND full `assignments: [...]` array (including any employee assigned to this site by HR or Manager B). |
| **A. Site Details Screen**<br>`GET /field-locations/:id` | **Other Manager** (Manager B) | Site created by HR or Manager A | **Count ONLY** (Names Hidden) | Receives `assigned_user_count: <number>`, but `assignments: null`.<br>*Rationale:* Prevents cross-department roster/employee enumeration leaks. |
| **B. Employee Assignments Screen**<br>`GET /field-assignments/user/:user_id` | **HR Admin** | Any employee in org | **YES** | Returns all active assignments for that user, including site details and `assigner` identity. |
| **B. Employee Assignments Screen**<br>`GET /field-assignments/user/:user_id` | **Manager** (Manager A) | Direct report of Manager A | **YES** | If HR or Manager B previously assigned Manager A's direct report, Manager A **CAN see it** in `records`. |
| **B. Employee Assignments Screen**<br>`GET /field-assignments/user/:user_id` | **Manager** (Manager A) | Employee outside direct reports | **NO (403)** | Throws `403 HIERARCHY_VIOLATION`. Managers cannot view non-report assignment lists. |
| **C. Employee Self Punch Screen**<br>`GET /my-field-assignments` | **Employee (Self)** | The logged-in user | **YES** | Employees always see all active client sites assigned to them, regardless of who assigned them. |

---

## Supported APIs & Endpoints for Frontend

Both **Manager** and **HR** routes are identical in structure and payloads, differing only in hierarchy authorization:
* **Manager Base URL:** `/api/v1/attendance/manager`
* **HR Base URL:** `/api/v1/attendance/hr`
* **Employee Base URL:** `/api/v1/attendance`

---

### 1. Populate Site Selection Dropdown (List All Active Sites)

Use this endpoint to populate the dropdown/modal when a manager assigns an employee to a site:

* **Endpoint:** `GET /api/v1/attendance/manager/field-locations`
* **Query Parameters:**
  * `search` (optional string): Case-insensitive partial search by `name`, `client_name`, or `city`.
  * `page` (optional integer, default `1`): Page number.
  * `limit` (optional integer, default `20`, max `100`): Items per page.
  * `include_inactive` (optional boolean, default `false`): Keep `false` so retired sites are excluded.

#### Sample Response (`200 OK`):
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
        "id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
        "name": "Tata Steel Pune Plant",
        "client_name": "Tata Steel Ltd",
        "latitude": "18.52043000",
        "longitude": "73.85674300",
        "geofence_radius_meters": 300,
        "city": "Pune",
        "is_active": true,
        "created_by": "7b02c842-1234-4a8e-9087-8e6f1a2b3c4d",
        "creator": {
          "id": "7b02c842-1234-4a8e-9087-8e6f1a2b3c4d",
          "identifier": "hr.admin@company.com",
          "profile": {
            "first_name": "Sunita",
            "last_name": "Sharma",
            "display_name": "Sunita Sharma"
          }
        }
      }
    ]
  }
}
```

---

### 2. Assign Employee to a Field Site

Use this endpoint when a manager submits the "Assign Site" modal/dialog for a team member:

* **Endpoint:** `POST /api/v1/attendance/manager/field-assignments`
* **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
* **Request Payload:**
```json
{
  "user_id": "aa11bb22-cccc-dddd-eeee-ffff00001111",
  "field_location_id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
  "effective_from": "2026-11-01",
  "effective_to": "2026-11-30"
}
```

#### Payload Field Specifications:
| Field | Type | Required | Rules & Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | `UUID` | **Yes** | Must be an **active direct report** of the calling manager. |
| `field_location_id` | `UUID` | **Yes** | Must be an **active** field location in the organization (can be created by HR, another manager, or the caller). |
| `effective_from` | `String` | No | Plain **`YYYY-MM-DD`** string (defaults to today's date in IST). **Do NOT send ISO timestamps.** |
| `effective_to` | `String` or `null` | No | Plain **`YYYY-MM-DD`** string or `null` for open-ended assignments. Must be `>= effective_from`. |

> [!IMPORTANT]
> **Date Format Requirement:** Send dates strictly as `YYYY-MM-DD` (e.g., `"2026-11-01"`). Sending ISO timestamps with timezones (e.g. `"2026-11-01T00:00:00Z"`) will trigger a **400 `VALIDATION_ERROR`**.

#### Sample Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Field location assigned successfully",
  "data": {
    "assignment": {
      "id": "c4de5f6a-1122-3344-5566-778899aabbcc",
      "org_id": "2a44bb55-6677-8899-0011-223344556677",
      "user_id": "aa11bb22-cccc-dddd-eeee-ffff00001111",
      "field_location_id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
      "assigned_by": "manager-user-id",
      "is_active": true,
      "effective_from": "2026-11-01",
      "effective_to": "2026-11-30"
    },
    "work_mode_warning": null
  }
}
```

#### Handling `work_mode_warning`:
If the assigned employee's contractual work mode is currently `'office'`, the assignment is created successfully, but `work_mode_warning` will be populated:
```json
"work_mode_warning": "Note: this employee's work mode is 'office', not 'field', so field geofencing will not apply until HR changes it."
```
* **Frontend Action:** Render an amber/warning notification banner in the UI alerting the manager: *"Site assigned, but employee is contracted as Office. Please ask HR to change their work mode to 'Field' for site geofencing to take effect."*

#### Error Scenarios:
| Status Code | Error Code (`errorCode`) | Cause | UI Guidance |
| :--- | :--- | :--- | :--- |
| **403** | `HIERARCHY_VIOLATION` | Manager trying to assign themselves | Display: *"You cannot assign a field location to yourself. Ask an HR admin to assign it."* |
| **403** | `HIERARCHY_VIOLATION` | Manager trying to assign an employee outside direct reports | Display: *"Hierarchy Violation: You can only assign field locations to your direct reports."* |
| **409** | `FIELD_ASSIGNMENT_DUPLICATE` | Employee already has an active assignment for this site | Display error message and offer to edit the existing assignment dates. |
| **400** | `FIELD_LOCATION_INACTIVE` | Field location has been retired/deleted | Refresh dropdown list to remove inactive sites. |
| **404** | `FIELD_LOCATION_NOT_FOUND` | Invalid site ID | Alert user site does not exist. |

---

### 3. View a Direct Report's Active Field Assignments

Use this endpoint when viewing an employee's profile or assignment drawer:

* **Endpoint:** `GET /api/v1/attendance/manager/field-assignments/user/:user_id`
* **Route Params:** `user_id` (UUID of the direct report)

#### Sample Response (`200 OK`):
```json
{
  "success": true,
  "message": "Field assignments fetched successfully",
  "data": {
    "user_id": "aa11bb22-cccc-dddd-eeee-ffff00001111",
    "work_mode": "field",
    "assigned_office": {
      "id": "4d9a1111-2222-3333-4444-555566667777",
      "name": "Headquarters - Indore"
    },
    "total": 2,
    "records": [
      {
        "id": "c4de5f6a-1122-3344-5566-778899aabbcc",
        "effective_from": "2026-11-01",
        "effective_to": "2026-11-30",
        "is_active": true,
        "field_location": {
          "id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
          "name": "Tata Steel Pune Plant",
          "client_name": "Tata Steel Ltd",
          "latitude": "18.52043000",
          "longitude": "73.85674300",
          "geofence_radius_meters": 300
        },
        "assigner": {
          "id": "hr-user-id",
          "identifier": "hr.lead@company.com",
          "profile": {
            "display_name": "Sunita Sharma"
          }
        }
      }
    ]
  }
}
```
* **Key Point:** Even if `assigner` was HR or Manager B, the calling manager (Manager A) **sees this assignment** because the employee is Manager A's direct report.

---

### 4. Remove / Unassign Employee from a Site

* **Endpoint:** `DELETE /api/v1/attendance/manager/field-assignments/:assignment_id`
* **Authorization Check:** Permission is evaluated against the **assignee** (employee), not the creator of the assignment. If the employee is currently your direct report, you have full authority to unassign them, even if HR originally assigned them.

#### Sample Response (`200 OK`):
```json
{
  "success": true,
  "message": "Field assignment removed successfully",
  "data": {
    "id": "c4de5f6a-1122-3344-5566-778899aabbcc",
    "already_inactive": false
  }
}
```

---

### 5. View Field Site Details (`GET /field-locations/:id`)

* **Endpoint:** `GET /api/v1/attendance/manager/field-locations/:id`

#### Response Shape:
```json
{
  "success": true,
  "message": "Field location fetched successfully",
  "data": {
    "location": {
      "id": "9f1c7d31-4b2a-4a8e-9087-8e6f1a2b3c4d",
      "name": "Tata Steel Pune Plant",
      "client_name": "Tata Steel Ltd",
      "latitude": "18.52043000",
      "longitude": "73.85674300",
      "geofence_radius_meters": 300,
      "address": "Plot 14, MIDC Industrial Area",
      "city": "Pune",
      "state": "Maharashtra",
      "country": "India",
      "pincode": "411019",
      "is_active": true,
      "created_by": "creator-uuid"
    },
    "assigned_user_count": 5,
    "can_modify": false,
    "assignments": null
  }
}
```

#### Frontend Guard Rules for `GET /field-locations/:id`:
1. **`can_modify` (Boolean):**
   * Use `can_modify` to enable or disable the "Edit Site" and "Delete Site" buttons.
   * `true` for HR admins and the manager who originally registered the site (`created_by`).
   * `false` for any other manager.
2. **`assignments` vs `assigned_user_count`:**
   * **`assigned_user_count` is ALWAYS returned as an integer.** Use this to display "5 employees assigned" and in delete confirmation dialogs.
   * **`assignments` is `null` for non-creator managers.** Guard any table rendering or `.map()` calls with `assignments?.map(...)` to avoid frontend `TypeError: Cannot read properties of null`.

---

## Frontend UI/UX Recommendations

1. **Manager Team Roster Screen:**
   * In the team member list, add a column or badge: `Work Mode: Field` and a button `Assign Client Site`.
   * Opening the modal should query `GET /api/v1/attendance/manager/field-locations` to populate the site selection dropdown.
   * Any site in the dropdown can be selected, whether created by HR or another manager.

2. **Site Selection Component:**
   * Display `Site Name` + `Client Name` + `City` in the dropdown options (e.g., *"Tata Steel Pune Plant (Tata Steel Ltd - Pune)"*).
   * Include a search filter within the dropdown to allow fast filtering across large lists of client sites.

3. **Date Pickers:**
   * Default `effective_from` to today's date (`format(new Date(), 'yyyy-MM-dd')`).
   * `effective_to` can be optional (checkbox for "Open-ended assignment" that sets `effective_to: null`).

4. **Delete / Unassign Confirmations:**
   * When unassigning a single employee from a site, call `DELETE /field-assignments/:assignment_id`.
   * When retiring an entire site (`DELETE /field-locations/:id`), use `assigned_user_count` to warn: *"Retiring this site will automatically deactivate site access for 5 assigned employees. Continue?"*
