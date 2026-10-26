# Backend API Update: Organization Setup & Operational Readiness Checklist

**Date:** 2026-10-21  
**Author:** Principal Backend Software Engineer  
**Scope:** New Endpoint in `src/modules/organization` & PostgreSQL Migration `00079`

---

## 1. Overview & Context

To resolve the operational challenge where operating HRs forget essential configuration steps (such as creating attendance policies, creating shifts, assigning shifts to employees, defining leave policies, or configuring statutory settings), the backend now provides a unified **Organization Operational Setup Checklist API**.

* **New Endpoint:** `GET /api/v1/organizations/setup-checklist`
* **Access Control:** `HR_ONLY` (`hr`, `super-admin`)
* **State Storage:** PostgreSQL table `organization_setup_tasks` (Migration `00079`)
* **Completion Criteria:** Strictly **"at least 1"** valid record per feature.
* **Extensibility:** Schema-agnostic design. New features or deprecated features can be added or removed dynamically via code registry `SETUP_TASK_REGISTRY` without database migrations.

---

## 2. API Contract

### `GET /api/v1/organizations/setup-checklist`

#### Query Parameters:
* `recheck` (boolean, optional, default `false`): Force re-evaluation of all registered tasks.

#### Response Structure:
```json
{
  "success": true,
  "message": "Organization setup checklist retrieved successfully",
  "data": {
    "readiness_percentage": 68,
    "summary": {
      "total_tasks": 22,
      "completed_tasks": 15,
      "pending_tasks": 7,
      "core_tasks_total": 15,
      "core_tasks_completed": 13,
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
            "task_key": "shift_assigned",
            "title": "Assign Shift to at least 1 Employee",
            "description": "Assign employees to a shift so their punches and work hours can be calculated.",
            "is_core": true,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/attendance/shifts/assign",
            "order": 8
          }
        ]
      }
    ]
  }
}
```

---

## 3. Frontend Guidance

1. **Dashboard Setup Card**: Render a checklist widget on the HR overview dashboard whenever `readiness_percentage < 100` or `is_operational === false`.
2. **Deep Action Links**: Use the `action_url` returned on each task to link HR directly to the relevant setup page (e.g. `/dashboard/attendance/shifts/assign`).
3. **Automatic Progress Update**: No extra API calls needed when saving a shift or policy; calling `GET /setup-checklist` automatically synchronizes the database state.
