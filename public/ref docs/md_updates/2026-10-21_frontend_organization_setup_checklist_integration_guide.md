# Frontend Integration Guide: Organization Setup & Operational Readiness Checklist

**Date:** 2026-10-21  
**Target Audience:** Frontend Web & Mobile Engineers, UI/UX Designers  
**Backend Module:** `src/modules/organization`  
**Endpoint:** `GET /api/v1/organizations/setup-checklist`  

---

## 1. Problem Statement & Background

### The Operational Challenge
When an organization signs up or an operating HR takes over, they are faced with configuring over 20+ interconnected features across 6 distinct modules (Organization Structure, Attendance, Leave Management, Payroll, Documents, and Tasks). 

In practice, operating HRs frequently forget critical prerequisite steps:
* They create an **Attendance Policy**, but forget to **create a Shift**.
* They create a **Shift Template**, but forget to **assign shifts to employees**.
* They create an **Employee**, but forget to map their **Reporting Manager** (leaving leave requests with no approver).
* They onboard the team, but forget to configure **Statutory Settings (PF/ESI)** or assign **Salary Structures** (causing month-end payroll to fail).

### The Solution: The "At Least 1" Readiness Engine
To eliminate guesswork, the backend now provides an **Organization Operational Readiness Engine** built on the **"At least 1"** rule:
> For any module or operational milestone, the backend evaluates whether at least 1 valid, active record exists for that organization.
> * *Did HR create at least 1 shift?* **Done ✅**
> * *Did HR assign that shift to at least 1 employee?* **Done ✅**

The backend computes an aggregate **Readiness Percentage (0% to 100%)**, separates **Core Operational Milestones** from **Advanced Settings**, and pairs every pending task with an exact `action_url` (direct link) so HR can complete setup with 1 click.

---

## 2. How It Was Implemented (Backend Architecture)

1. **Persistent Relational State (`organization_setup_tasks` in PostgreSQL)**:
   - Migration `00079` creates a dedicated PostgreSQL table tracking `(org_id, task_key, category, is_completed, completed_at)`.
   - State is stored per tenant, making it instant to query without expensive multi-table joins.

2. **Self-Healing Reconciliation (Zero Stale States)**:
   - When HR completes a step (e.g. creates a shift), the next check automatically updates the task to `is_completed: true` with a timestamp.
   - **Bidirectional Recovery:** If HR deletes their only shift or only department, the engine automatically reverts the task to `is_completed: false` and clears `completed_at`, immediately alerting HR on their dashboard.

3. **Dynamic Extensibility (Zero Frontend Hardcoding)**:
   - All tasks are registered in backend code (`SETUP_TASK_REGISTRY`). 
   - When new features are introduced in the future, the backend auto-seeds and evaluates them. **The frontend does not need to maintain hardcoded task lists or completion rules.** Simply render the categories and tasks returned by the API.

4. **High-Performance Concurrent Execution (< 5ms)**:
   - All 22 checks run concurrently via `Promise.all` using indexed `SELECT 1 ... LIMIT 1` queries. Total latency is negligible.

---

## 3. API Specification

### Endpoint: `GET /api/v1/organizations/setup-checklist`

* **Method:** `GET`
* **URL:** `/api/v1/organizations/setup-checklist`
* **Authentication:** Required (`Bearer <jwt_token>`)
* **Role Plane:** `HR_ONLY` (Roles: `hr`, `super-admin`)
* **Active Org:** Required (`requireActiveOrg`)

#### Query Parameters:
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `recheck` | `boolean` | No | `false` | When `true`, forces explicit re-evaluation of all tasks against domain tables. |

#### Request Headers:
```http
GET /api/v1/organizations/setup-checklist HTTP/1.1
Host: api.yourhrms.com
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
```

---

### Response Payload Structure (`200 OK`)

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
        "tasks": [
          {
            "task_key": "leave_type_created",
            "title": "Create at least 1 Leave Type",
            "description": "Define categories such as Casual Leave, Sick Leave, or Earned Leave.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T12:00:00.000Z",
            "action_url": "/dashboard/leave/types",
            "order": 11
          },
          {
            "task_key": "leave_policy_created",
            "title": "Create at least 1 Leave Policy Template",
            "description": "Configure yearly quotas, accrual rules, and carry forward limits.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T12:15:00.000Z",
            "action_url": "/dashboard/leave/policies",
            "order": 12
          },
          {
            "task_key": "leave_policy_assigned",
            "title": "Assign Leave Policy to at least 1 Employee",
            "description": "Grant leave policy allowances to employees so they can submit leave requests.",
            "is_core": true,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/leave/assign",
            "order": 13
          }
        ]
      },
      {
        "category_key": "payroll",
        "category_title": "Payroll & Statutory",
        "category_description": "Statutory compliance (PF/ESI/PT), salary components, templates, and bank details.",
        "total_tasks": 6,
        "completed_tasks": 3,
        "is_category_complete": false,
        "tasks": [
          {
            "task_key": "statutory_config_saved",
            "title": "Configure Statutory Settings (EPF / ESI / PT)",
            "description": "Set mandatory government compliance and provident fund settings.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T13:00:00.000Z",
            "action_url": "/dashboard/payroll/statutory",
            "order": 14
          },
          {
            "task_key": "salary_component_created",
            "title": "Create at least 1 Salary Component",
            "description": "Define earnings and deductions (Basic, HRA, Special Allowance).",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T13:10:00.000Z",
            "action_url": "/dashboard/payroll/salary-components",
            "order": 15
          },
          {
            "task_key": "salary_structure_created",
            "title": "Create at least 1 Salary Structure Template",
            "description": "Set standard CTC breakdown templates for salary computation.",
            "is_core": true,
            "is_completed": true,
            "completed_at": "2026-10-20T13:20:00.000Z",
            "action_url": "/dashboard/payroll/salary-templates",
            "order": 16
          },
          {
            "task_key": "salary_structure_assigned",
            "title": "Assign Salary Structure to at least 1 Employee",
            "description": "Map employee compensation so payroll runs can compute net pay.",
            "is_core": true,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/payroll/salary-assign",
            "order": 17
          },
          {
            "task_key": "employee_bank_account_added",
            "title": "Add at least 1 Employee Bank Account",
            "description": "Bank details are required to generate bank advice payout sheets.",
            "is_core": true,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/payroll/bank-accounts",
            "order": 18
          },
          {
            "task_key": "payroll_settings_saved",
            "title": "Configure Payroll Settings",
            "description": "Set your pay period cycle (e.g. 1st to 30th) and salary calculation days.",
            "is_core": false,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/payroll/settings",
            "order": 19
          }
        ]
      },
      {
        "category_key": "document",
        "category_title": "Documents & Letters",
        "category_description": "Employee document requirements and official letter templates.",
        "total_tasks": 2,
        "completed_tasks": 1,
        "is_category_complete": false,
        "tasks": [
          {
            "task_key": "document_type_created",
            "title": "Create at least 1 Document Type",
            "description": "Define employee document requirements (e.g. ID Proof, Experience Letter).",
            "is_core": false,
            "is_completed": true,
            "completed_at": "2026-10-20T14:00:00.000Z",
            "action_url": "/dashboard/documents/types",
            "order": 20
          },
          {
            "task_key": "document_template_created",
            "title": "Create at least 1 Letter Template",
            "description": "Set up automated offer letters, appointment letters, or relieving letters.",
            "is_core": false,
            "is_completed": false,
            "completed_at": null,
            "action_url": "/dashboard/documents/templates",
            "order": 21
          }
        ]
      },
      {
        "category_key": "task",
        "category_title": "Tasks & Workflows",
        "category_description": "Operational task assignments and reminder settings.",
        "total_tasks": 1,
        "completed_tasks": 1,
        "is_category_complete": true,
        "tasks": [
          {
            "task_key": "task_settings_saved",
            "title": "Configure Task Settings",
            "description": "Configure task attachment limits and overdue reminder policies.",
            "is_core": false,
            "is_completed": true,
            "completed_at": "2026-10-20T14:30:00.000Z",
            "action_url": "/dashboard/tasks/settings",
            "order": 22
          }
        ]
      }
    ]
  }
}
```

---

## 4. Complete Milestone Registry & Action URLs

| Category | Task Key | Title | Is Core? | Action URL |
| :--- | :--- | :--- | :---: | :--- |
| **Organization** | `org_profile_completed` | Complete Company Profile | Yes | `/dashboard/organization/profile` |
| | `department_created` | Create at least 1 Department | Yes | `/dashboard/organization/departments` |
| | `location_created` | Create at least 1 Office Location | Yes | `/dashboard/organization/locations` |
| | `employee_onboarded` | Onboard at least 1 Team Member | Yes | `/dashboard/organization/employees/invite` |
| | `reporting_hierarchy_mapped` | Map Reporting Manager | Yes | `/dashboard/organization/hierarchy` |
| **Attendance** | `attendance_policy_created` | Create Attendance Policy | Yes | `/dashboard/attendance/policies` |
| | `shift_template_created` | Create Shift Template | Yes | `/dashboard/attendance/shifts` |
| | `shift_assigned` | Assign Shift to Employee | Yes | `/dashboard/attendance/shifts/assign` |
| | `weekly_off_configured` | Configure Weekly Offs | Yes | `/dashboard/attendance/weekly-offs` |
| | `holiday_calendar_created` | Add Company Holidays | No | `/dashboard/attendance/holidays` |
| **Leave** | `leave_type_created` | Create Leave Type | Yes | `/dashboard/leave/types` |
| | `leave_policy_created` | Create Leave Policy Template | Yes | `/dashboard/leave/policies` |
| | `leave_policy_assigned` | Assign Leave Policy | Yes | `/dashboard/leave/assign` |
| **Payroll** | `statutory_config_saved` | Configure Statutory (PF/ESI/PT) | Yes | `/dashboard/payroll/statutory` |
| | `salary_component_created` | Create Salary Component | Yes | `/dashboard/payroll/salary-components` |
| | `salary_structure_created` | Create Salary Template | Yes | `/dashboard/payroll/salary-templates` |
| | `salary_structure_assigned` | Assign Salary Structure | Yes | `/dashboard/payroll/salary-assign` |
| | `employee_bank_account_added` | Add Employee Bank Account | Yes | `/dashboard/payroll/bank-accounts` |
| | `payroll_settings_saved` | Configure Payroll Settings | No | `/dashboard/payroll/settings` |
| **Documents** | `document_type_created` | Create Document Type | No | `/dashboard/documents/types` |
| | `document_template_created` | Create Letter Template | No | `/dashboard/documents/templates` |
| **Tasks** | `task_settings_saved` | Configure Task Settings | No | `/dashboard/tasks/settings` |

---

## 5. Recommended Frontend Implementation Patterns

We recommend implementing this across **3 UI surfaces**:

### Pattern A: Persistent Dashboard Setup Banner (Top of HR Overview)
Place a card at the top of the HR Dashboard whenever `summary.is_fully_setup === false`.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  🚀 Setup in Progress: 68% Complete                           [15 of 22 steps done]     │
│  ██████████████████████████████████████░░░░░░░░░░░░░░░                                 │
│                                                                                        │
│  ⚠️ Next Action: Assign Shift to at least 1 Employee                                  │
│  Assign employees to a shift so their punches and work hours can be calculated.        │
│                                                                                        │
│  [👉 Complete Step Now] ───────────────────────► Navigates to action_url                │
│  [View Full Checklist (7 pending)] ────────────► Opens Setup Drawer                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

* **When to show:** When `readiness_percentage < 100`.
* **When to hide:** Once `is_fully_setup === true`, replace with a collapsed "All Systems Ready" badge or hide automatically.
* **Auto-Discovery of Next Step:** Find the first item where `is_completed === false` and `is_core === true`. Render its `title`, `description`, and button bound to `action_url`.

---

### Pattern B: Full Setup Checklist Drawer / Page (`/dashboard/organization/setup`)
A dedicated slide-over drawer or page displaying all 6 categories:

* **Category Accordion:** Each category shows its progress (e.g. `Attendance & Shifts (3/5 Complete)`).
* **Task Item Checklist:**
  * Completed items render with a green checkmark `✅` and completion date.
  * Incomplete items render with a warning badge `⏳ Action Required`, description, and a button `[Set Up Now]` linking directly to `action_url`.
* **Category Badge:** Display a green "Complete" chip when `is_category_complete === true`.

---

### Pattern C: Invalidation & State Management

Use React Query, SWR, or RTK Query with the key: `['organization', 'setup-checklist']`.

1. **Automatic Refetching:**
   - Invalidate the setup checklist query whenever the user navigates back to the Dashboard.
   - When HR submits a form on any `action_url` page (e.g. after creating a shift at `/dashboard/attendance/shifts` or saving statutory settings), trigger:
     ```javascript
     queryClient.invalidateQueries({ queryKey: ['organization', 'setup-checklist'] })
     ```
2. **Recheck Button:**
   - On the full checklist page, provide a subtle `"Refresh Checklist"` button that calls:
     `GET /api/v1/organizations/setup-checklist?recheck=true`

---

## 6. Ready-to-Use Frontend Code (TypeScript & React)

### TypeScript Data Contracts
```typescript
export interface SetupTask {
  task_key: string
  title: string
  description: string
  is_core: boolean
  is_completed: boolean
  completed_at: string | null
  action_url: string
  order: number
}

export interface SetupCategory {
  category_key: string
  category_title: string
  category_description: string
  total_tasks: number
  completed_tasks: number
  is_category_complete: boolean
  tasks: SetupTask[]
}

export interface SetupSummary {
  total_tasks: number
  completed_tasks: number
  pending_tasks: number
  core_tasks_total: number
  core_tasks_completed: number
  is_operational: boolean
  is_fully_setup: boolean
}

export interface SetupChecklistResponse {
  success: boolean
  message: string
  data: {
    readiness_percentage: number
    summary: SetupSummary
    categories: SetupCategory[]
  }
}
```

### React Custom Hook (`useOrganizationSetup.ts`)
```typescript
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { SetupChecklistResponse } from './types'

export function useOrganizationSetup() {
  return useQuery({
    queryKey: ['organization', 'setup-checklist'],
    queryFn: async () => {
      const { data } = await axios.get<SetupChecklistResponse>(
        '/api/v1/organizations/setup-checklist'
      )
      return data.data
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true
  })
}
```

### React Dashboard Banner Component (`SetupProgressBanner.tsx`)
```tsx
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrganizationSetup } from './useOrganizationSetup'

export const SetupProgressBanner: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useOrganizationSetup()

  if (isLoading || !data || data.summary.is_fully_setup) {
    return null
  }

  // Find the next critical pending task
  const allTasks = data.categories.flatMap((cat) => cat.tasks)
  const nextPendingTask =
    allTasks.find((t) => !t.is_completed && t.is_core) ||
    allTasks.find((t) => !t.is_completed)

  return (
    <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-6 mb-6 shadow-lg border border-blue-700/50">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-400/30">
            {data.summary.is_operational ? 'Operational • Additional Steps Pending' : 'Initial Setup Required'}
          </span>
          <h2 className="text-xl font-bold mt-2">
            Organization Setup: {data.readiness_percentage}% Complete
          </h2>
          <p className="text-sm text-blue-200 mt-0.5">
            {data.summary.completed_tasks} of {data.summary.total_tasks} milestones completed.
          </p>
        </div>

        {nextPendingTask && (
          <button
            onClick={() => navigate(nextPendingTask.action_url)}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm rounded-lg shadow-md transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <span>Next: {nextPendingTask.title}</span>
            <span>&rarr;</span>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-blue-950/60 rounded-full h-2.5 overflow-hidden border border-blue-800">
        <div
          className="bg-blue-400 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${data.readiness_percentage}%` }}
        />
      </div>

      {nextPendingTask && (
        <p className="text-xs text-blue-300/80 mt-3">
          <strong className="text-blue-200">Pending:</strong> {nextPendingTask.description}
        </p>
      )}
    </div>
  )
}
```

---

## 7. Summary for Frontend Engineers

1. **One Endpoint Does It All:** `GET /api/v1/organizations/setup-checklist` provides categories, tasks, progress percentages, and direct deep-links.
2. **Zero Hardcoded Logic:** Rely entirely on the returned `tasks` array and their `action_url` values.
3. **Self-Updating:** Whenever HR creates a shift, adds an employee, or completes an action on an `action_url` page, navigating back to the dashboard will automatically show the updated progress.
