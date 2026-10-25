# Frontend → Backend: API Enhancement & Change Requests

**Document Location:** `public/ref docs/md_updates/frontend_requests_to_backend.md`  
**Purpose:** Central consolidated registry of all backend API requirements, query parameter additions, schema enhancements, and behavioral fixes requested by the Frontend team.  
**Rule:** Any frontend engineer identifying a backend gap or requiring an API change must log the request here using the standard template below, so the backend team receives a single, unified reference file.

---

## Index of Requests

| Request ID | Target API | Module | Priority | Status | Title |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-PAYROLL-001** | `GET /api/v1/payroll/hr/reimbursements/claims` | Payroll / Reimbursements | High | **Pending Backend** | Add `pending_hr=true` filter to return all claims currently awaiting HR action |
| **REQ-INBOX-001** | `GET /api/v1/inbox/badges` | Core / Navigation & Approvals | High | **Pending Backend** | Unified Categorical Badge Counts & Inbox Summary Endpoint |

---

## REQ-PAYROLL-001: Add `pending_hr=true` Filter for Unified Actionable Claims Queue

### 1. Target API & Route
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/claims`
* **HTTP Method:** `GET`
* **API Registry Reference:** API 133 (`payroll_hr.routes.js` → `payroll_hr.controller.js` → `reimbursement_claim.service.js`)
* **Current Supported Query Parameters:** `status`, `user_id`, `category_id`, `payout_period_month`, `current_level`, `created_from`, `created_to`, `page`, `limit`

---

### 2. Business Problem & Why This Is Needed
In the Reimbursement approval hierarchy (documented in `2026-10-11_reimbursement_claim_approval_chain_hierarchy_fix.md`):
1. **2-Level Approval Chains** (Employee → Manager → HR):
   - Claim submission initializes status as `submitted` (`current_level: 1`, `total_levels: 2`).
   - The direct **Manager** performs Level 1 approval.
   - Upon Level 1 approval, the claim advances to `status: 'under_review'` (`current_level: 2`, `total_levels: 2`).
   - **HR** then performs Level 2 final financial approval on claims in `under_review`.
2. **Collapsed 1-Level Approval Chains** (Direct Reports to HR or Users without a Manager):
   - The approval chain collapses to 1 level (`total_levels: 1`, `approver_role: 'hr'`).
   - Claim submission leaves the claim in `status: 'submitted'` (`current_level: 1`, `total_levels: 1`).
   - **HR** is the immediate and only approver.

#### The Problem:
HR needs a single queue in the **HR Inbox** showing **all claims requiring HR action right now**.
Currently, the API only accepts a single `status` enum string filter:
- If frontend queries `?status=under_review`, it fetches 2-level manager-approved claims, but **omits** 1-level claims from HR's direct reports (which remain in `status: 'submitted'`).
- If frontend queries `?status=submitted`, it fetches claims still waiting on Level 1 Managers (which HR is barred from approving: `403 NOT_YOUR_APPROVAL_LEVEL`).
- Frontend cannot cleanly merge two separate paginated queries (`?status=under_review` and `?status=submitted`) into a single table without breaking server-side pagination offsets and page counts.

---

### 3. Requested Backend Changes
Add an optional boolean query parameter `pending_hr` to `GET /api/v1/payroll/hr/reimbursements/claims`:

#### Query Parameter Specification:
* **Parameter Name:** `pending_hr`
* **Type:** `Boolean` (accepts `true`, `false`, `1`, `0`)
* **Default:** `false` (when omitted, preserves existing behavior)

#### Backend Controller & Query Logic:
In `reimbursement_claim.service.js` (or repository layer):
When `pending_hr === true` (or truthy string `"true"` / `"1"`):
Filter the claims query with the following condition:
```sql
WHERE org_id = :orgId
  AND (
    (status = 'under_review')
    OR
    (status = 'submitted' AND total_levels = 1)
  )
```
*(If any other tenant-specific status indicates a claim awaiting HR decision, include that as well).*

#### Response Structure:
Standard API 133 pagination envelope (no breaking schema changes):
```json
{
  "success": true,
  "message": "Reimbursement claims fetched",
  "data": [
    {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "claim_number": "RC-202610-0042",
      "status": "under_review",
      "current_level": 2,
      "total_levels": 2,
      "total_amount": "4500.00",
      ...
    },
    {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "claim_number": "RC-202610-0043",
      "status": "submitted",
      "current_level": 1,
      "total_levels": 1,
      "total_amount": "1200.00",
      ...
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "limit": 20,
    "total_pages": 1
  }
}
```

#### Inbox Badge Count Efficiency:
Support standard `limit=1` with `pending_hr=true`:
`GET /api/v1/payroll/hr/reimbursements/claims?pending_hr=true&limit=1`
Returns `pagination.total` representing the exact count of all claims awaiting HR action across the entire organization.

---

### 4. Frontend Developer Hint & Context (For Review & Integration)

> [!NOTE]
> **Bug History**:
> Previously, the HR Inbox rendered `<PayrollReimbursementsPage embedded />`, which hardcoded default filter `seedStatus = "submitted"`. This called `GET .../claims?page=1&limit=20&status=submitted`, causing HR to see claims still waiting for their managers to review.
>
> **Current Frontend Workaround (October 2026)**:
> 1. `PayrollReimbursementsPage.jsx` now defaults embedded status to `"under_review"`.
> 2. `hrInboxCounts.js` now queries `{ status: "under_review", limit: 1 }` so badge count and list count match.
> 3. *Limitation of workaround*: Direct-report 1-level claims in `submitted` status are not visible by default unless the user manually selects "Submitted" in the filter dropdown.

#### Exact Integration Steps When Backend Delivers `pending_hr=true`:
1. In [src/roles/hr/payroll/screens/PayrollReimbursementsPage.jsx](file:///c:/Users/91930/Downloads/Archive/HR-Clouds-Web/src/roles/hr/payroll/screens/PayrollReimbursementsPage.jsx):
   - In `fetchPage`, pass `pending_hr: true` when viewing the actionable inbox queue:
     ```javascript
     const fetchPage = useCallback(({ page, limit }) => {
       const params = { page, limit };
       if (filters.actionableOnly) params.pending_hr = true;
       else Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
       return payrollAPI.getReimbursementClaims(params);
     }, [filters]);
     ```
   - Update `CLAIM_STATUS_FILTERS.hr` or add a top toggle for `"Waiting on HR"` that sends `pending_hr=true`.
2. In [src/shared/utils/hrInboxCounts.js](file:///c:/Users/91930/Downloads/Archive/HR-Clouds-Web/src/shared/utils/hrInboxCounts.js):
   - Change line 41 to:
     ```javascript
     key: "claims",
     load: () => payrollAPI.getReimbursementClaims({ pending_hr: true, limit: 1 }).then(total(["claims", "records"])),
     ```
3. Remove manual status toggling workaround.

---

## REQ-INBOX-001: Unified Categorical Badge Counts & Inbox Summary Endpoint

### 1. Target API & Route
* **Endpoint:** `/api/v1/inbox/badges`
* **HTTP Method:** `GET`
* **API Registry Reference:** New Route (`inbox.routes.js` → `inbox.controller.js` → `inbox_summary.service.js`)
* **Authentication:** Required (Bearer JWT). Scoped automatically by `req.user.id`, `req.user.organization_id`, and `req.user.role`.

---

### 2. Business Problem & Why This Is Needed
Across all three workspaces (HR, Manager, Employee), the frontend displays dynamic badges and counter chips in two primary tiers:
1. **Tier 1 (Sidebar Navigation Badges):**
   * HR / Manager: `Inbox` (total actionable items waiting on the user)
   * HR: `Bank Verification` (unverified employee bank accounts)
   * HR: `Verification Queue` (pending employee document uploads)
   * All: `Notifications` (unread notification count)
2. **Tier 2 (In-Page Tabs, Filter Headers & Metric Tiles):**
   * HR & Manager Inbox Cards (11 separate approval queue cards)
   * Task Governance Tabs (`Waiting for review`, `In progress`, `Overdue`, `Changes requested`, `Done`)
   * Bank Verification Tiles (`Unverified`, `Verified`, `No account on file`)
   * Document Verification Tiles (`Waiting for decision`, `Manager says verify`, `Manager says reject`)
   * Document Requests Tiles (`Outstanding`, `Overdue`, `Fulfilled`)
   * Device Trust Tabs (`Waiting for HR`, `Ready`, `Blocked`, `Shut off`)

#### The Problem:
* Currently, computing Tier 1 and Tier 2 counts requires the frontend to fire **13 to 17 separate HTTP requests** (`leaveAPI.getTeamPendingRequests`, `attendanceAPI.getManagerPendingRegularizations`, `attendanceAPI.getManagerPendingOvertime`, `attendanceAPI.getManagerCompOffs`, `attendanceAPI.getManagerAnomalies`, `tasksAPI.getTeamTasks`, `payrollAPI.getProposals`, `payrollAPI.getReimbursementClaims`, `payrollAPI.getLoans`, `payrollAPI.getDeclarationQueue`, `attendanceAPI.getTrustedDevices`, `documentsAPI.getLetterProposals`, `payrollAPI.getBankAccounts`, `documentsAPI.getVerificationQueue`, etc.).
* Because firing 17 HTTP requests on every page navigation causes severe backend load and browser network storms, the frontend was forced to fetch counts **only once on initial sidebar mount** and cache them for 60 seconds.
* Consequently, when employees or other managers submit/update records, the sidebar badge counts remain **stale and frozen** until a hard page reload.
* Furthermore, on pages like `DocumentRequestsPage`, `DocumentVerificationPage`, and `BankVerificationPage`, the frontend must execute 3–4 extra `limit=1` count requests just to render headline metric numbers above the tables.

---

### 3. Requested Backend Changes
Create a unified, aggregated summary endpoint: `GET /api/v1/inbox/badges`.

#### Endpoint Logic & Scoping:
1. When called by an **HR User** (`role = 'hr'` or `'admin'`):
   * Scopes counts to `organization_id = req.user.organization_id`.
   * Queries pending queues across all 11 actionable HR approval types.
   * Includes organization-wide bank verification and document verification queues.
2. When called by a **Manager** (`role = 'manager'`):
   * Scopes counts to direct and indirect reports (`manager_id = req.user.id`).
   * Queries pending queues for `leaves`, `regularizations`, `overtime`, `compOffs`, `anomalies`, and `tasks`.
3. When called by an **Employee** (`role = 'employee'`):
   * Scopes to `user_id = req.user.id` (open tasks, requested documents, unread notifications).

#### Expected 200 OK Response Payload:
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

#### SQL / Query Optimization Note:
* Use index-only scans on status columns:
  * `leave_requests(org_id, status)`
  * `attendance_regularization_requests(org_id, status)`
  * `reimbursement_claims(org_id, status)`
  * `tasks(org_id, status, due_date)`
  * `payroll_loans(org_id, status)`
  * `user_bank_accounts(org_id, is_verified)`
  * `document_submissions(org_id, status)`
* Under PostgreSQL, these 10 index-only counts execute within a single transaction in **under 15 milliseconds total**.

---

### 4. Frontend Developer Hint & Context

> [!NOTE]
> **Observed UI Bug / Gap:**
> In `DashboardSidebar.jsx`, `fetchHrInboxCounts` and `fetchManagerInboxCounts` only run once per session because running 13 calls flooded screens on route changes. Furthermore, mutations in `BankVerificationPage` and `DocumentVerificationPage` do not emit in-memory events, leaving the bank and document sidebar badges permanently stuck until manual browser refresh.

#### Integration Steps Once API Is Delivered:
1. In `src/shared/api/`:
   Add `inboxAPI.getBadgeSummary: () => request('/inbox/badges')`.
2. In `src/shared/contexts/BadgeCountsContext.jsx`:
   Create a dedicated Provider that polls `getBadgeSummary()` every 60s and refreshes on tab visibility (`document.visibilityState === "visible"`).
3. In `DashboardSidebar.jsx`:
   Replace individual state variables (`inboxCount`, `unverifiedBankCount`, `pendingDocsCount`) with `useBadgeCounts()`.
4. In `BankVerificationPage.jsx` and `DocumentVerificationPage.jsx`:
   Replace manual `limit=1` tally fetches with the pre-calculated categories from `useBadgeCounts()`.

---

## Instructions for Adding Future Backend Requests
When working on the frontend and discovering an API gap, do not create fragmented markdown files. Append new requests to this document following this template:

```markdown
## REQ-[MODULE]-[NUMBER]: [Short Descriptive Title]

### 1. Target API & Route
* **Endpoint:** [e.g. /api/v1/payroll/hr/...]
* **HTTP Method:** [GET / POST / PUT / PATCH / DELETE]
* **API Registry Reference:** [API number / route file if known]

### 2. Business Problem & Why This Is Needed
[Detailed explanation of the user journey, UI symptom, and why frontend cannot resolve it alone]

### 3. Requested Backend Changes
[Exact query parameters, request body schemas, status codes, SQL logic, or response fields required]

### 4. Frontend Developer Hint & Context
* **Observed UI Bug / Gap:** [What happened in the UI]
* **Temporary Workaround Applied:** [What frontend did in the interim]
* **Integration Steps:** [Exact files and lines to update once backend delivers]
```
