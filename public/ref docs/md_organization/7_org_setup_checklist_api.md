# Organization Setup & Operational Readiness API

Provides a unified operational health and readiness checklist for operating HRs and administrators to track which organizational configuration steps are completed versus still pending before the organization can run smoothly.

---

## 1. Get Organization Setup Checklist

* **URL:** `/api/v1/organizations/setup-checklist`
* **Method:** `GET`
* **Authentication:** Required (`Bearer <jwt_token>`)
* **Role Plane:** `HR_ONLY` (`hr`, `super-admin`)
* **Active Org:** Required (`requireActiveOrg`)

### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `recheck` | `boolean` | No | `false` | When `true`, forces explicit re-evaluation of all tasks against domain tables. |

### Request Headers
```http
Authorization: Bearer <token>
Content-Type: application/json
```

---

### Response Body (`200 OK`)

```json
{
  "success": true,
  "message": "Organization setup checklist retrieved successfully",
  "data": {
    "readiness_percentage": 59,
    "summary": {
      "total_tasks": 22,
      "completed_tasks": 13,
      "pending_tasks": 9,
      "core_tasks_total": 15,
      "core_tasks_completed": 11,
      "is_operational": false,
      "is_fully_setup": false
    },
    "categories": [
      {
        "category_key": "organization",
        "category_title": "Organization Structure",
        "category_description": "Company profile, office locations, departments, and reporting hierarchy.",
        "total_tasks": 5,
        "completed_tasks": 5,
        "is_category_complete": true,
        "tasks": [
          {
            "task_key": "org_profile_completed",
            "title": "Complete Company Profile",
            "description": "Provide organization contact details, address, and legal entity info.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T10:15:00.000Z",
            "action_url": "/dashboard/organization/profile",
            "order": 1
          },
          {
            "task_key": "department_created",
            "title": "Create at least 1 Department",
            "description": "Add departments (e.g. Engineering, Sales, HR) to structure your workforce.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T10:20:00.000Z",
            "action_url": "/dashboard/organization/departments",
            "order": 2
          },
          {
            "task_key": "location_created",
            "title": "Create at least 1 Office Location",
            "description": "Set up physical office branches and geofence anchors.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T10:22:00.000Z",
            "action_url": "/dashboard/organization/locations",
            "order": 3
          },
          {
            "task_key": "employee_onboarded",
            "title": "Onboard at least 1 Team Member",
            "description": "Invite or add employees to your organization roster.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T10:45:00.000Z",
            "action_url": "/dashboard/organization/employees/invite",
            "order": 4
          },
          {
            "task_key": "reporting_hierarchy_mapped",
            "title": "Configure Reporting Manager Mapping",
            "description": "Map at least one manager-employee reporting relationship for approval workflows.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T11:00:00.000Z",
            "action_url": "/dashboard/organization/hierarchy",
            "order": 5
          }
        ]
      },
      {
        "category_key": "attendance",
        "category_title": "Attendance & Shifts",
        "category_description": "Attendance policies, shift timings, shift assignments, and holiday rules.",
        "total_tasks": 5,
        "completed_tasks": 3,
        "is_category_complete": false,
        "tasks": [
          {
            "task_key": "attendance_policy_created",
            "title": "Create at least 1 Attendance Policy",
            "description": "Define working hours, late mark grace periods, and half-day thresholds.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T11:15:00.000Z",
            "action_url": "/dashboard/attendance/policies",
            "order": 6
          },
          {
            "task_key": "shift_template_created",
            "title": "Create at least 1 Shift Template",
            "description": "Configure standard work shifts with shift timings.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T11:30:00.000Z",
            "action_url": "/dashboard/attendance/shifts",
            "order": 7
          },
          {
            "task_key": "shift_assigned",
            "title": "Assign Shift to at least 1 Employee",
            "description": "Assign employees to a shift so their punches and work hours can be calculated.",
            "is_core": true,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/attendance/shifts/assign",
            "order": 8
          },
          {
            "task_key": "weekly_off_configured",
            "title": "Configure Weekly Off Rules",
            "description": "Set weekend rules (e.g. Sat/Sun off) to prevent false absence anomalies.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T11:45:00.000Z",
            "action_url": "/dashboard/attendance/weekly-offs",
            "order": 9
          },
          {
            "task_key": "holiday_calendar_created",
            "title": "Add at least 1 Company Holiday",
            "description": "Publish holidays for the calendar year.",
            "is_core": false,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/attendance/holidays",
            "order": 10
          }
        ]
      },
      {
        "category_key": "leave",
        "category_title": "Leave Management",
        "category_description": "Leave categories, policy quotas, and employee leave assignments.",
        "total_tasks": 3,
        "completed_tasks": 2,
        "is_category_complete": false,
        "tasks": [...]
      },
      {
        "category_key": "payroll",
        "category_title": "Payroll & Statutory",
        "category_description": "Statutory compliance (PF/ESI/PT), salary components, templates, and bank details.",
        "total_tasks": 6,
        "completed_tasks": 2,
        "is_category_complete": false,
        "tasks": [...]
      },
      {
        "category_key": "document",
        "category_title": "Documents & Letters",
        "category_description": "Employee document requirements and official letter templates.",
        "total_tasks": 2,
        "completed_tasks": 1,
        "is_category_complete": false,
        "tasks": [...]
      },
      {
        "category_key": "task",
        "category_title": "Tasks & Workflows",
        "category_description": "Operational task assignments and reminder settings.",
        "total_tasks": 1,
        "completed_tasks": 0,
        "is_category_complete": false,
        "tasks": [...]
      }
    ]
  }
}
```

---

## 2. Frontend Integration Guidelines

1. **Dashboard Setup Progress Banner**:
   - Render a progress card on the HR Overview Dashboard when `readiness_percentage < 100` or `is_operational === false`.
   - Displays `readiness_percentage`, `completed_tasks` out of `total_tasks`.
2. **Direct Action Navigation**:
   - Each checklist item returns a guaranteed `action_url`. Clicking the task or a "Set Up Now" button navigates the HR user directly to that setting page.
3. **Dynamic Re-evaluation**:
   - The checklist is self-healing. Whenever HR visits the page or creates a shift/policy, calling `GET /api/v1/organizations/setup-checklist` automatically updates and persists the completion state.
