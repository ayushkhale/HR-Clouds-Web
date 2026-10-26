# Backend Specification: Unified Categorical Badge & Queue Counts API (`GET /api/v1/inbox/badges`)

**Document Location:** `public/ref docs/md_updates/unified_badge_counts_api_specification.md`  
**Target Audience:** Backend Engineering Team (Node.js / Express / PostgreSQL)  
**Related Ticket:** `REQ-INBOX-001` (recorded in `public/ref docs/md_updates/frontend_requests_to_backend.md`)  
**Status:** Ready for Backend Implementation  

---

## 1. Executive Summary & Purpose

The HR Clouds frontend application renders counters and badges in two key places:
1. **Sidebar Navigation Badges:**
   * **Inbox Badge:** Total number of pending items waiting for the logged-in user's approval.
   * **Bank Verification Badge:** Count of employee bank accounts needing HR verification before payroll runs.
   * **Document Verification Badge:** Count of uploaded employee documents waiting in the HR verification queue.
   * **Notifications Badge:** Count of unread system notifications.
2. **In-Page Subtabs & Metric Headline Tiles:**
   * **Inbox Cards:** 11 distinct category cards on `/dashboard/hr/inbox` and 6 cards on `/dashboard/manager/requests/inbox`.
   * **Task Review Tabs:** Counts for `Waiting for review`, `In progress`, `Overdue`, `Changes requested`, `Done`.
   * **Bank Verification Tiles:** Counts for `Unverified`, `Verified`, and `Missing Account`.
   * **Document Requests Tiles:** Counts for `Outstanding`, `Overdue`, and `Fulfilled`.
   * **Device Trust Tabs:** Counts for `Waiting for HR`, `Ready`, `Blocked`, and `Shut off`.

### Current Problem
Currently, the backend has no single endpoint for this summary. To calculate these counts, the frontend must fire **13 to 17 separate HTTP requests** on mount (`getTeamPendingRequests`, `getManagerPendingRegularizations`, `getManagerPendingOvertime`, `getManagerCompOffs`, `getManagerAnomalies`, `getTeamTasks`, `getProposals`, `getReimbursementClaims`, `getLoans`, `getDeclarationQueue`, `getTrustedDevices`, `getLetterProposals`, `getBankAccounts`, `getVerificationQueue`, etc.).

Because executing 17 requests on every screen navigation is prohibitive, the frontend only fetches counts once on initial load. When records update, the sidebar numbers remain **stale and out of sync**.

**Solution:** Provide a single, lightweight, fast-executing endpoint (`GET /api/v1/inbox/badges`) that aggregates all top-level badges and nested tab category counts into a structured tree.

---

## 2. Complete Folder-Like UI & Tab Hierarchy

Below is the folder-style structure showing how screens, tabs, and counts map to the application UI:

```text
📁 APPLICATION WORKSPACES
│
├── 📂 1. MAIN / INBOX (Approval Central)
│   ├── 📄 HR Inbox (`/dashboard/hr/inbox`) [SIDEBAR BADGE: Total Actionable Items]
│   │   ├── 📁 Time & Leave
│   │   │   ├── 📑 Leave Requests ───────────► `inbox.leaves`: `pending`, `cancellation_pending`
│   │   │   ├── 📑 Regularizations ──────────► `inbox.regularizations`: `pending`
│   │   │   ├── 📑 Overtime ─────────────────► `inbox.overtime`: `pending`
│   │   │   ├── 📑 Comp-Offs ────────────────► `inbox.comp_offs`: `earned` (waiting approval)
│   │   │   └── 📑 Attendance Flags ─────────► `inbox.anomalies`: `open` (unresolved geofence/punch flags)
│   │   ├── 📁 Tasks
│   │   │   └── 📑 Task Deliverables ────────► `inbox.tasks`: `in_review` (submitted deliverables)
│   │   ├── 📁 Payroll & Tax
│   │   │   ├── 📑 Salary Structure Approvals ► `inbox.salary_proposals`: `proposed`
│   │   │   ├── 📑 Reimbursement Claims ─────► `inbox.claims`: `under_review` (HR L2) + `submitted` (HR L1 direct)
│   │   │   ├── 📑 Loans & Advances ─────────► `inbox.loans`: `pending`
│   │   │   └── 📑 Tax Declarations ─────────► `inbox.tax_declarations`: `submitted` (current FY)
│   │   ├── 📁 Devices
│   │   │   └── 📑 Employee Devices ─────────► `inbox.devices`: `pending` (awaiting HR approval)
│   │   └── 📁 Documents
│   │       └── 📑 Letter Proposals ─────────► `inbox.letter_proposals`: `pending` (manager requests to issue letters)
│   │
│   └── 📄 Manager Inbox (`/dashboard/manager/requests/inbox`) [SIDEBAR BADGE: Total Team Actionable]
│       ├── 📑 Leave Requests ───────────────► `inbox.leaves`: `pending`, `cancellation_pending` (direct reports)
│       ├── 📑 Regularizations ──────────────► `inbox.regularizations`: `pending` (direct reports)
│       ├── 📑 Overtime ─────────────────────► `inbox.overtime`: `pending` (direct reports)
│       ├── 📑 Comp-Offs ────────────────────► `inbox.comp_offs`: `earned` (direct reports)
│       ├── 📑 Attendance Flags ─────────────► `inbox.anomalies`: `open` (direct reports)
│       └── 📑 Task Deliverables ────────────► `inbox.tasks`: `in_review` (direct reports)
│
├── 📂 2. TASKS
│   ├── 📄 Task Governance / Review (`/tasks/assigned` & `/tasks/all`)
│   │   ├── 📑 Tab: Waiting for review ──────► `tasks.in_review`
│   │   ├── 📑 Tab: Not started ─────────────► `tasks.pending`
│   │   ├── 📑 Tab: In progress ─────────────► `tasks.in_progress`
│   │   ├── 📑 Tab: Overdue ─────────────────► `tasks.overdue` (`due_date < now` and not completed)
│   │   ├── 📑 Tab: Changes requested ───────► `tasks.reopened`
│   │   └── 📑 Tab: Done ────────────────────► `tasks.completed`
│   └── 📄 Employee My Tasks (`/dashboard/employee/tasks`)
│       ├── 📑 Subtab: My Tasks ─────────────► `tasks.my_open_tasks`
│       └── 📑 Subtab: Overdue Tasks ────────► `tasks.my_overdue_tasks`
│
├── 📂 3. PAYROLL
│   ├── 📄 Bank Verification (`/payroll/bank-verification`) [SIDEBAR BADGE: Unverified Accounts]
│   │   ├── 📑 Stat Tile: Unverified ────────► `bank_verification.unverified`
│   │   ├── 📑 Stat Tile: Verified ──────────► `bank_verification.verified`
│   │   └── 📑 Stat Tile: No account ────────► `bank_verification.missing_account`
│   └── 📄 Loans & Advances (`/payroll/loans`)
│       ├── 🔍 Filter: Pending ──────────────► `loans.pending`
│       ├── 🔍 Filter: Active ───────────────► `loans.active`
│       └── 🔍 Filter: Closed ───────────────► `loans.closed`
│
├── 📂 4. DOCUMENTS WE COLLECT
│   ├── 📄 Verification Queue (`/documents/verification`) [SIDEBAR BADGE: Waiting Verification]
│   │   ├── 📑 Tile: Waiting for decision ───► `document_verification.waiting_decision`
│   │   ├── 📑 Tile: Manager recommends verify► `document_verification.manager_approved`
│   │   └── 📑 Tile: Manager recommends reject► `document_verification.manager_rejected`
│   └── 📄 Document Requests (`/documents/requests`) [SIDEBAR BADGE: Outstanding Document Requests]
│       ├── 📑 Tile: Still open ─────────────► `document_requests.outstanding`
│       ├── 📑 Tile: Overdue ────────────────► `document_requests.overdue`
│       └── 📑 Tile: Fulfilled ──────────────► `document_requests.fulfilled`
│
├── 📂 5. DOCUMENTS WE ISSUE
│   └── 📄 Letter Proposals (`/documents/letter-proposals`)
│       ├── 📑 Tab: Waiting on HR ───────────► `letter_proposals.pending`
│       ├── 📑 Tab: Issued ──────────────────► `letter_proposals.approved`
│       └── 📑 Tab: Turned down ─────────────► `letter_proposals.rejected`
│
├── 📂 6. REGISTERED DEVICES & TRUST
│   └── 📄 Employee Devices (`/attendance/trusted-devices`)
│       ├── 📑 Tab: Waiting for HR ──────────► `devices.pending`
│       ├── 📑 Tab: Ready ───────────────────► `devices.active`
│       ├── 📑 Tab: Blocked ─────────────────► `devices.suspended`
│       └── 📑 Tab: Shut off ────────────────► `devices.revoked`
│
└── 📂 7. NOTIFICATIONS
    └── 📄 Notifications (`/notifications`) [SIDEBAR BADGE: Unread Notifications]
        ├── 📑 Tab: Unread ──────────────────► `notifications.unread`
        └── 📑 Tab: All ─────────────────────► `notifications.total`
```

---

## 3. Detailed Endpoint Specification

* **Route:** `GET /api/v1/inbox/badges`
* **Controller:** `inbox.controller.js` -> `getBadgeSummary`
* **Authentication:** `Bearer <JWT_TOKEN>` (Standard auth middleware)
* **Rate Limit Recommendation:** Standard 60 req/min per user (frontend polls at 60s intervals).

### Scoping Rules by Role:
* **HR / Admin (`role = 'hr'` or `'admin'`):**
  * Evaluates all counts across `organization_id = req.user.organization_id`.
  * Computes organization-wide queues for Bank Verification, Document Verification, and Document Requests (`categories.document_requests` powers `DOCUMENTS WE COLLECT > Document Requests` and its sidebar badge).
  * If HR personal document requests are tracked in the "ME" dropdown, backend may optionally provide `categories.document_requests.mine = { open, overdue }` (analogous to `tasks.mine`).
* **Manager (`role = 'manager'`):**
  * Evaluates counts for team members reporting to `req.user.id` (`manager_id = req.user.id` or via organization reporting hierarchy).
  * Excludes organization-wide admin queues (e.g. Bank Verification).
* **Employee (`role = 'employee'`):**
  * Evaluates self-scoped tasks (`assignee_id = req.user.id`), self-scoped document requests (`categories.document_requests.outstanding` powers `MY DOCUMENTS > My Document Requests`), and self unread notifications.

---

## 4. Expected JSON Response Payload

```json
{
  "success": true,
  "message": "Badge counts summary fetched",
  "data": {
    "sidebar": {
      "inbox_total": 14,
      "notifications_unread": 3,
      "unverified_banks": 2,
      "document_verification_queue": 5
    },
    "categories": {
      "inbox": {
        "leaves": { "total": 3, "pending": 2, "cancellation_pending": 1 },
        "regularizations": { "total": 1, "pending": 1 },
        "overtime": { "total": 0, "pending": 0 },
        "comp_offs": { "total": 0, "earned": 0 },
        "anomalies": { "total": 2, "open": 2 },
        "tasks": { "total": 4, "in_review": 4 },
        "salary_proposals": { "total": 1, "proposed": 1 },
        "claims": { "total": 2, "under_review": 2, "submitted": 0 },
        "loans": { "total": 1, "pending": 1 },
        "tax_declarations": { "total": 0, "submitted": 0 },
        "devices": { "total": 0, "pending": 0 },
        "letter_proposals": { "total": 0, "pending": 0 }
      },
      "tasks": {
        "in_review": 4,
        "pending": 8,
        "in_progress": 12,
        "overdue": 3,
        "reopened": 1,
        "completed": 45
      },
      "bank_verification": {
        "unverified": 2,
        "verified": 84,
        "missing_account": 6
      },
      "document_verification": {
        "waiting_decision": 5,
        "manager_approved": 4,
        "manager_rejected": 1
      },
      "document_requests": {
        "outstanding": 7,
        "overdue": 2,
        "fulfilled": 31
      },
      "devices": {
        "pending": 0,
        "active": 62,
        "suspended": 1,
        "revoked": 3
      }
    },
    "synced_at": "2026-10-25T12:00:00.000Z"
  }
}
```

---

## 5. Backend Database Query Architecture & High Performance

To ensure this endpoint executes in **under 20 milliseconds**, do **not** run full table scans. Use parallel index-only `COUNT(*)` queries within a single database connection/pool:

```sql
-- Sample SQL aggregation query block for HR Role:
SELECT
  -- 1. Leave Requests
  (SELECT COUNT(*) FROM leave_requests WHERE org_id = :orgId AND status IN ('pending', 'cancellation_pending')) AS leaves_total,
  (SELECT COUNT(*) FROM leave_requests WHERE org_id = :orgId AND status = 'pending') AS leaves_pending,
  (SELECT COUNT(*) FROM leave_requests WHERE org_id = :orgId AND status = 'cancellation_pending') AS leaves_cancel_pending,

  -- 2. Attendance Regularizations
  (SELECT COUNT(*) FROM attendance_regularizations WHERE org_id = :orgId AND status = 'pending') AS reg_pending,

  -- 3. Overtime Requests
  (SELECT COUNT(*) FROM overtime_requests WHERE org_id = :orgId AND status = 'pending') AS ot_pending,

  -- 4. Comp-off Requests
  (SELECT COUNT(*) FROM comp_off_grants WHERE org_id = :orgId AND status = 'earned') AS comp_off_pending,

  -- 5. Attendance Anomalies
  (SELECT COUNT(*) FROM attendance_anomalies WHERE org_id = :orgId AND is_resolved = false) AS anomalies_open,

  -- 6. Tasks
  (SELECT COUNT(*) FROM tasks WHERE org_id = :orgId AND status = 'in_review') AS tasks_in_review,
  (SELECT COUNT(*) FROM tasks WHERE org_id = :orgId AND status NOT IN ('completed', 'cancelled') AND due_date < NOW()) AS tasks_overdue,

  -- 7. Salary Proposals
  (SELECT COUNT(*) FROM salary_structure_proposals WHERE org_id = :orgId AND status = 'proposed') AS salary_proposals,

  -- 8. Reimbursement Claims (Actionable by HR)
  (SELECT COUNT(*) FROM reimbursement_claims WHERE org_id = :orgId AND (status = 'under_review' OR (status = 'submitted' AND total_levels = 1))) AS claims_pending_hr,

  -- 9. Loans
  (SELECT COUNT(*) FROM loans WHERE org_id = :orgId AND status = 'pending') AS loans_pending,

  -- 10. Tax Declarations (Current FY)
  (SELECT COUNT(*) FROM tax_declarations WHERE org_id = :orgId AND financial_year = :currentFY AND status = 'submitted') AS tax_declarations_pending,

  -- 11. Devices Waiting Approval
  (SELECT COUNT(*) FROM trusted_devices WHERE org_id = :orgId AND status = 'pending') AS devices_pending,

  -- 12. Letter Proposals
  (SELECT COUNT(*) FROM letter_proposals WHERE org_id = :orgId AND status = 'pending') AS letter_proposals_pending,

  -- 13. Bank Account Verification
  (SELECT COUNT(*) FROM employee_bank_accounts WHERE org_id = :orgId AND is_verified = false) AS bank_unverified,

  -- 14. Document Verification Queue
  (SELECT COUNT(*) FROM employee_document_submissions WHERE org_id = :orgId AND status = 'pending') AS doc_verification_waiting,

  -- 15. Notifications Unread
  (SELECT COUNT(*) FROM notifications WHERE user_id = :userId AND is_read = false) AS notifications_unread;
```

### Required PostgreSQL Indexes:
To make the above query instantaneous (index-only scans):
* `CREATE INDEX IF NOT EXISTS idx_leave_req_org_status ON leave_requests (org_id, status);`
* `CREATE INDEX IF NOT EXISTS idx_reimburse_org_status ON reimbursement_claims (org_id, status);`
* `CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due ON tasks (org_id, status, due_date);`
* `CREATE INDEX IF NOT EXISTS idx_bank_acct_org_verified ON employee_bank_accounts (org_id, is_verified);`
* `CREATE INDEX IF NOT EXISTS idx_doc_sub_org_status ON employee_document_submissions (org_id, status);`
* `CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);`

---

## 6. Frontend Integration Blueprint

Once this endpoint is available, the frontend will integrate it as follows:

1. **New API Method (`src/shared/api/inbox.api.js`):**
   ```javascript
   export const inboxAPI = {
     getBadgeSummary: () => request('/inbox/badges')
   };
   ```
2. **Context Provider (`src/shared/contexts/BadgeCountsContext.jsx`):**
   * Stores `badgeData`.
   * Automatically polls every 60s when the browser tab is focused.
   * Catches up on `visibilitychange` when returning to the tab.
   * Uses `BroadcastChannel` to synchronize changes across tabs instantly.
3. **Sidebar Consumption (`src/shared/components/DashboardSidebar.jsx`):**
   * Replaces 3 disparate fetch states with single:
     ```javascript
     const { sidebar } = useBadgeCounts();
     const inboxCount = sidebar.inbox_total;
     const unverifiedBankCount = sidebar.unverified_banks;
     const pendingDocsCount = sidebar.document_verification_queue;
     ```
4. **Elimination of Boilerplate `limit=1` Calls:**
   * Removes repeated `limit: 1` count fetches from `BankVerificationPage`, `DocumentVerificationPage`, `DocumentRequestsPage`, and `MyRequestsPage`.
