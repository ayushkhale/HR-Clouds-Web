# Phase 6: Payslips, Reporting, Exports & Bank Advice (Delivery Layer) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint technical and architectural analysis of the **28 APIs (#167–#194)** implemented in Phase 6 of the Payroll module.

> [!IMPORTANT]
> **Architectural Premise:** Phase 6 is the "Delivery Layer". It performs **no new payroll arithmetic**. It surfaces the math already derived by the engine in Phases 2–5. The core invariant is **safety**: engine output remains identical.
>
> **Payslip Snapshot Isolation (D-39):** A payslip is frozen at issue. `payslips.snapshot` captures identity, department, bank account, and the run item's figures exactly as they stood at approval. A subsequent profile rename, department transfer, or bank change NEVER mutates a published payslip. The document an employee downloads in December is byte-identical to the one they saw in March.
>
> **Audited Export Lifecycle (D-48):** Every PDF, ZIP, and CSV stream opens an audit row in `payroll_report_exports` BEFORE the first byte is transmitted. Stream failure mid-flight fails the row. The system always leaves an indelible record of who exported what data, over what scope, and whether it succeeded.
>
> **Binary-Free Storage:** Phase 6 stores no PDFs or ZIPs. Every document is rendered on the fly from the frozen JSON snapshot (payslips) or live SQL aggregates (reports). 

---

## Architectural Pillars & Cross-Cutting Behaviors

### 1. Payslip Release Gate & Auto-Publish (D-44)
Payslips are generated at run approval but are subject to a release gate: `visible_to_employee`. 
- HR sees every row (held, superseded, revoked).
- Employees and Managers see **nothing** until the row is released. A held payslip behaves byte-identically to a missing one (403 or 404 depending on the plane) to prevent the error code from becoming an oracle.
- `payslip_auto_publish` configuration dictates if rows are released instantly at approval or held for manual HR release via `#171 Publish`.

### 2. Live Fallback (D-45 / EC-57)
Runs approved before Phase 6 possess no `payslips` rows. The API transparently falls back to "live projection" for these runs, using current profile dimensions and the immutable run item figures. This ensures historical runs never 404 and continue rendering identically. Backfill (`#172`) can explicitly persist these into snapshots.

### 3. Reissue & Honesty Guards (§5.2, §6.3)
A payslip can be reissued (e.g., to correct a misspelt name) creating version N+1. The service asserts the financial figures are identical; a reissue cannot mutate the money. Every payslip also includes a `statutory_note` (the honesty guard) clarifying exactly what taxes/withholdings were applied given the engine version that computed it.

### 4. Queue-Based Email Dispatch (§7.6, D-42, D-43)
Approval and publishing never send emails synchronously to avoid holding the Rank-1 run advisory lock over network I/O. They mark rows as `pending`. A stateless cron (or manual HR dispatch `#175`) drains the queue. Emails contain deep links, never PDF attachments.

---

## 1. HR Administration APIs — `/api/v1/payroll/hr`
*Auth Stack:* `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`

---

### API 167: Get Run Payslip Index
* **API Name:** Get Run Payslip Index
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/payslips`
* **Purpose:** Retrieves a paginated index of payslips for a specific payroll run.
* **Business Problem Solved:** Provides HR with a control panel to view payslip statuses, email delivery states, and versions for a given run before or after release.
* **Why the API Exists:** HR must be able to review the payslip generation outcome, identify held or failed emails, and track superseded versions without downloading thousands of PDFs.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** After a 3000-employee run is approved, HR opens the index to confirm all payslips are generated and checks the `email_status` column.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required) - The Payroll Run ID.
  - Query Parameter: `status` (Enum: `active`, `superseded`, `revoked`, Optional).
  - Query Parameter: `visible_to_employee` (Boolean, Optional).
  - Query Parameter: `email_status` (Enum: `not_requested`, `pending`, `sending`, `sent`, `failed`, Optional).
  - Query Parameter: `department_id` (UUID, Optional) - Filters on the **frozen** snapshot department, not the live profile.
  - Query Parameter: `q` (String, Optional) - Free-text search on employee name/code.
  - Query Parameter: `page` (Integer, Default: 1).
  - Query Parameter: `limit` (Integer, Default: 50).
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Validates the run `id` (must exist in the tenant org).
  2. Parses and validates query filters.
  3. Queries `payslips` table where `run_id = :id`.
  4. Returns the mapped HR metadata + snapshot-derived columns (gross_earnings, net_pay).
* **Database Impact:** Read-only query on `payslips` joined with `payroll_runs`.
* **Validation Rules:** Valid UUIDs; standard pagination bounds (max 200).
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslip index fetched",
    "data": [
      {
        "payslip_id": "c1f1f9e0-3d71-4a8b-9e4a-5f5c3e7b1a2d",
        "run_id": "a9a8f4b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
        "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "employee_code": "EMP-001",
        "full_name": "Alice Smith",
        "department_id": "d1d2e3f4-g5h6-7i8j-9k0l-1m2n3o4p5q6r",
        "department_name": "Engineering",
        "period_month": "2026-03",
        "version": 1,
        "status": "active",
        "visible_to_employee": true,
        "gross_earnings": "150000.00",
        "net_pay": "115000.00",
        "email_status": "sent",
        "email_attempts": 1,
        "email_last_error": null,
        "published_at": "2026-03-28T10:00:00.000Z",
        "created_at": "2026-03-28T09:00:00.000Z"
      }
    ],
    "run": {
      "run_id": "a9a8f4b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
      "period_month": "2026-03",
      "status": "approved",
      "approved_at": "2026-03-28T09:00:00.000Z"
    },
    "pagination": { "page": 1, "limit": 50, "total": 3000, "total_pages": 60 }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 RUN_NOT_FOUND`: The payroll run does not exist.
* **HTTP Status Codes:** `200 OK`, `400 Bad Request`, `403 Forbidden`, `404 Not Found`.
* **Security / Authorization Behavior:** Org-scoped. HR ignores `visible_to_employee` release gates and sees all rows.
* **Idempotency and Retry Behavior:** Safe read.
* **Transactions and Concurrency Behavior:** Standard unblocked read.
* **What the API Gives / Does:** Gives a list of payslips for a run.

---

### API 168: Get Employee Payslip History
* **API Name:** Get Employee Payslip History
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/payslips`
* **Purpose:** Retrieves the complete payslip issuance history for an employee across all runs.
* **Business Problem Solved:** Enables HR to track how many times a payslip was issued, reissued, or revoked for an employee.
* **Why the API Exists:** Auditability. HR needs to see superseded and revoked versions alongside active ones for compliance and support queries.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR investigates why an employee claims their March payslip changed. HR checks this API and sees a `superseded` version 1 and an `active` version 2 with a reissue reason "Corrected spelling of last name".
* **Request Structure and Parameters:**
  - Path Parameter: `userId` (UUID, Required) - Target employee's User ID.
  - Query Parameter: `run_id` (UUID, Optional) - Filter to a specific run.
  - Query Parameter: `active_only` (Boolean, Default: false) - If true, hides superseded/revoked versions.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Validates params.
  2. Calls `payslipReadService.hrHistoryForUser` which queries `payslips` joined with `payroll_runs` for the target `userId`.
  3. Maps results, keeping HR-only metadata (superseded timestamps, reissue reasons, etc).
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslip history fetched",
    "data": {
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "payslips": [
        {
          "payslip_id": "c1f1f9e0-3d71-4a8b-9e4a-5f5c3e7b1a2d",
          "run_id": "a9a8f4b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
          "period_month": "2026-03",
          "run_status": "approved",
          "version": 2,
          "status": "active",
          "visible_to_employee": true,
          "email_status": "sent",
          "published_at": "2026-03-28T10:00:00.000Z",
          "superseded_at": null,
          "revoked_at": null,
          "reissue_reason": "Corrected name spelling",
          "engine_version": 4,
          "created_at": "2026-03-29T11:00:00.000Z"
        }
      ]
    }
  }
  ```
* **Security / Authorization Behavior:** HR is not bound by `visible_to_employee`.

---

### API 169: Get Employee Payslip Detail
* **API Name:** Get Employee Payslip Detail
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/payslips/:runId`
* **Purpose:** Retrieves the full JSON representation of an employee's payslip for a specific run.
* **Business Problem Solved:** Renders the frontend web-view of a payslip, showing earnings, deductions, day ledger, and HR metadata.
* **Why the API Exists:** A programmatic way to view the document without generating a PDF.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR clicks "View" on a payslip from the run index to inspect the component breakdown.
* **Request Structure and Parameters:**
  - Path Parameter: `userId` (UUID, Required)
  - Path Parameter: `runId` (UUID, Required)
  - Query Parameter: `version` (Integer, Optional) - Reaches a superseded copy; absent = active version.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Loads the run (404 if not found).
  2. Queries `payslips` for the exact `version` (or active).
  3. Loads the live `payroll_run_items` and `payroll_run_item_components` for math basis fields not carried in the snapshot (like `calculation_type`).
  4. Merges the frozen snapshot with HR metadata.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslip detail fetched",
    "data": {
      "run": {
        "run_id": "...", "period_month": "2026-03", "status": "approved"
      },
      "employee": { "user_id": "..." },
      "period": { "start": "2026-03-01", "end": "2026-03-31" },
      "status": "calculated",
      "statutory_status": "applied",
      "statutory_note": "Statutory withholding is applied...",
      "statutory": {
        "pf_wage": "100000.00", "income_tax_amount": "15000.00", "status": "applied"
      },
      "figures": {
        "gross_earnings": "150000.00", "net_pay": "115000.00", "payable_days": "31"
      },
      "components": [
        {
          "component_code": "BASIC",
          "component_type": "earning",
          "amount": "75000.00",
          "is_taxable": true
        }
      ],
      "snapshot_source": "snapshot",
      "payslip_version": 1,
      "hr": {
        "payslip_id": "...",
        "version": 1,
        "payslip_status": "active",
        "visible_to_employee": true,
        "email_status": "sent"
      }
    }
  }
  ```

---

### API 170: Download Payslip PDF (HR)
* **API Name:** Download Employee Payslip PDF (HR)
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/payslips/:runId/pdf`
* **Purpose:** Generates and streams a PDF version of the payslip.
* **Business Problem Solved:** Provides a printable, standardized legal record of payment.
* **Why the API Exists:** PDF generation is a core delivery requirement for payroll. HR needs the ability to draw PDFs even for held rows.
* **Who / Roles are Allowed:** `hr` only.
* **Request Structure and Parameters:**
  - Path Parameter: `userId` (UUID, Required)
  - Path Parameter: `runId` (UUID, Required)
  - Query Parameter: `version` (Integer, Optional) - Target superseded versions.
* **Backend Processing Flow:**
  1. Resolves the snapshot for render (HR sees held/superseded rows).
  2. Sets `CreationDate` to the pinned `published_at` (or `approved_at` if held) to guarantee byte-stability (D-40).
  3. Initiates a `payslip_single` export audit row.
  4. Renders the PDF via `payslipPdf.render`.
  5. Streams the buffer using `download.sendBuffer`.
* **Database Impact:** Inserts 1 row into `payroll_report_exports`.
* **Success Response:** Binary PDF stream (Content-Type: `application/pdf`).
* **Failure / Error Scenarios:** `404 PAYSLIP_NOT_FOUND` if it doesn't exist.
* **Idempotency and Retry Behavior:** Re-renders the PDF. Given the pinned timestamp and frozen snapshot, the PDF output is byte-stable across retries.

---

### API 171: Publish Run Payslips
* **API Name:** Publish Run Payslips
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/payslips/publish`
* **Purpose:** Releases held payslips to employees, making them visible and enqueueing them for email dispatch.
* **Business Problem Solved:** Supports the "review before release" workflow (D-44) where payslips are generated but kept hidden until HR manually clears them.
* **Why the API Exists:** When `payslip_auto_publish` is false, payslips are generated as `visible_to_employee = false`. This endpoint flips them to `true` and sets the `published_at` timestamp.
* **Who / Roles are Allowed:** `hr` only.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required) - The Payroll Run ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "user_ids": ["b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"]
  }
  ```
  - `user_ids` (Array of UUIDs, Optional, Max 5000): Narrows the release to a specific cohort. Absent means release the whole run.
* **Backend Processing Flow:**
  1. Validates the run exists and is approved/paid.
  2. Takes the Rank-1 run advisory lock (`payroll:run:{orgId}:{period_month}`).
  3. Updates `payslips` where `run_id = :id` and `visible_to_employee = false` (idempotent WHERE clause).
  4. Sets `visible_to_employee = true`, `published_at = NOW()`, and `published_by = actor`.
  5. Enqueues emails (sets `email_status = 'pending'`) if `payslip_auto_email` is true.
  6. Writes audit log `run.payslips_published`.
* **Database Impact:** Mass UPDATE on `payslips`; INSERT into `payroll_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslips published",
    "data": {
      "run_id": "a9a8f4b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
      "period_month": "2026-03",
      "payslips_published": 1,
      "payslips_queued": 1
    }
  }
  ```
* **Idempotency and Retry Behavior:** Fully idempotent. Calling it again on already published rows yields `payslips_published: 0` and does not alter the `published_at` timestamp, ensuring PDF determinism.

---

### API 172: Backfill Run Payslips
* **API Name:** Backfill Run Payslips
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/payslips/backfill`
* **Purpose:** Composes and persists payslip snapshots for historical runs approved before Phase 6.
* **Business Problem Solved:** Ensures historical runs can benefit from frozen snapshots (for API speed and absolute immutability) without breaking existing workflows.
* **Why the API Exists:** Runs before Phase 6 rely on live fallback (D-45). This explicitly generates their missing `payslips` rows. It also repairs runs that crashed during approval's payslip generation.
* **Who / Roles are Allowed:** `hr` only.
* **Request Payload:** Same as API 171 (`user_ids` array, optional).
* **Backend Processing Flow:**
  1. Reads the list of payable `calculated` items.
  2. Chunks the targets into batches of 200 (Snapshot Cohort Size).
  3. For each batch, takes the Rank-1 run lock, generates the snapshot, and inserts rows.
  4. Skips already-persisted rows (idempotency set).
  5. Inherits the run's `approved_at` as the `published_at` timestamp.
* **Database Impact:** Batched INSERTs into `payslips` (~200 per transaction).
* **Idempotency and Retry Behavior:** A crash halfway leaves committed cohorts intact. Re-running it only processes the remainder.

---

### API 173: Reissue Payslip
* **API Name:** Reissue Payslip
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/payslips/:id/reissue`
* **Purpose:** Supersedes an active payslip with version N+1 to correct presentation errors (e.g., misspelled name).
* **Business Problem Solved:** Handles the inevitable reality of data entry errors discovered after a payslip is published, without mutating the closed payroll figures.
* **Why the API Exists:** A payslip is immutable. To fix a name, we issue a new version explicitly linked to the old one.
* **Who / Roles are Allowed:** `hr` only.
* **Request Payload:**
  ```json
  {
    "reason": "Corrected spelling of employee's last name"
  }
  ```
* **Backend Processing Flow:**
  1. Takes the Rank-3 payslip lock (`payroll:payslip:{id}`).
  2. Asserts the payslip is `active`.
  3. Composes the new snapshot from live data.
  4. **CRITICAL GUARD:** Asserts `hashMoney(newSnapshot) === hashMoney(oldSnapshot)`. If the math changed, it throws `409 PAYSLIP_FIGURES_CHANGED`.
  5. Updates old row to `status = 'superseded'`. Inserts new row as `active`.
* **Idempotency and Retry Behavior:** Non-idempotent. Superseding an already superseded row yields a `409` conflict.

---

### API 174: Download Run Payslips (Bulk ZIP)
* **API Name:** Download Run Payslips
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/payslips/download`
* **Purpose:** Streams a ZIP archive of all PDFs for an approved run.
* **Backend Processing Flow:**
  1. Fetches all active payslips for the run.
  2. Asserts count > 0 and count <= `ZIP_MAX_ENTRIES` (e.g., 5000).
  3. Opens `payslip_bulk` export audit row.
  4. Invokes `buildRunZip` to compose the chunks.
  5. Streams chunks via `download.streamChunks`.
* **Security / Authorization Behavior:** HR downloads the *full* approved set, including rows that are held (`visible_to_employee = false`), as HR is reviewing the run.

---

### API 175: Dispatch Run Payslips
* **API Name:** Dispatch Run Payslips
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/payslips/dispatch`
* **Purpose:** Drains a bounded batch of the payslip notification email queue synchronously.
* **Why the API Exists:** Normally drained by a stateless cron, but HR may want to force a send immediately or retry explicitly failed addresses.
* **Request Payload:**
  ```json
  {
    "limit": 200,
    "user_ids": null,
    "include_failed": false
  }
  ```
* **Backend Processing Flow (The 3-Transaction Loop):**
  1. Identifies candidates based on `email_status IN ('pending', 'failed')`, bounded by `limit`.
  2. For each row:
     a. **CLAIM**: Conditional UPDATE `email_status = 'sending'` under its own transaction.
     b. **SEND**: Calls SES out-of-band with a timeout.
     c. **RECORD**: Conditional UPDATE to `sent` or `failed` under its own transaction.
* **Concurrency Behavior:** Highly concurrent. No advisory locks. Multiple workers or HR admins can hit this simultaneously; the `CLAIM` UPDATE safely partitions the work.

---

### API 176: Get Run Dispatch Status
* **API Name:** Get Run Dispatch Status
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/runs/:id/payslips/dispatch-status`
* **Purpose:** Surfaces queue state and recent failures for a run.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Dispatch status fetched",
    "data": {
      "run_id": "...",
      "period_month": "2026-03",
      "max_attempts": 5,
      "counts": {
        "not_requested": 0, "pending": 50, "sending": 10, "sent": 2900, "failed": 40
      },
      "recent_failures": [
        {
          "payslip_id": "...",
          "user_id": "...",
          "attempts": 5,
          "last_error": "NO_EMAIL_ADDRESS: user has no email identifier",
          "retryable": false
        }
      ]
    }
  }
  ```

---


## 177. Get Payroll Register Report
* **API Name / Purpose:** Get Payroll Register. Detailed employee-level financial data across a period.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reports/payroll-register`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:** None
* **Detailed API Function:** Returns employee-level report rows, computing aggregated amounts across all closed runs within the specified window. Uses pure paise arithmetic. Dimensions (department/location) are read from the frozen snapshots.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payroll Register report generated",
    "data": {
      "columns": [
        { "key": "earning::BASIC", "code": "BASIC", "name": "Basic", "type": "earning", "label": "BASIC" }
      ],
      "rows": [
        {
          "run_id": "uuid", "period_month": "2026-03", "user_id": "uuid",
          "employee_code": "EMP-01", "full_name": "Alice", "department_id": "uuid", "department_name": "Engineering",
          "location_id": "uuid", "location_name": "HQ", "paid_days": "31", "lop_days": "0",
          "components": { "earning::BASIC": "75000.00" },
          "gross_earnings": "150000.00", "net_pay": "115000.00", "ctc_cost": "160000.00", "total_deductions": "10000.00",
          "total_employer_contributions": "5000.00", "reimbursement_amount": "0.00"
        }
      ],
      "totals": {
        "gross_earnings": "1500000.00", "net_pay": "1150000.00", "components": { "earning::BASIC": "750000.00" }
      },
      "row_count": 10
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | ----- | ---- | -------- | ----------- | ---------------- |
  | `data.columns` | Array | No | Dynamic columns | Unique component codes present in the result set |
  | `data.rows` | Array | No | Data rows | One row per employee per run |
  | `data.totals` | Object | No | Grand totals | Aggregated sums over all rows |
* **Error Handling:** `422 EXPORT_TOO_LARGE`, `422 REPORT_RANGE_TOO_LARGE`.

## 178. Get Department Distribution Report
* **API Name / Purpose:** Get Department Distribution. Aggregated financial totals bucketed by department (and optionally location).
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reports/department-distribution`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:** None
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Department Distribution report generated",
    "data": {
      "rows": [
        {
          "department_id": "uuid", "department_name": "Engineering",
          "location_id": null, "location_name": null,
          "headcount": 50,
          "gross_earnings": "7500000.00", "net_pay": "6000000.00", "ctc_cost": "8000000.00",
          "total_deductions": "500000.00", "total_employer_contributions": "500000.00",
          "reimbursement_amount": "0.00"
        }
      ],
      "totals": { "gross_earnings": "7500000.00", "net_pay": "6000000.00" },
      "row_count": 1
    }
  }
  ```

## 179. Get Deduction Summary Report
* **API Name / Purpose:** Get Deduction Summary. Aggregated totals for deductions and employer contributions, bucketed by component code.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reports/deduction-summary`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Deduction Summary report generated",
    "data": {
      "rows": [
        {
          "component_code": "PF_EMPLOYEE", "component_name": "PF (Employee)", "component_type": "deduction",
          "headcount": 50, "total_amount": "90000.00"
        }
      ],
      "totals": { "total_amount": "90000.00" },
      "row_count": 1
    }
  }
  ```

## 180. Get Component Report
* **API Name / Purpose:** Get Component Report. Employee-level breakdown isolated to specific requested component codes.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reports/components`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Component report generated",
    "data": {
      "rows": [
        {
          "run_id": "uuid", "period_month": "2026-03", "user_id": "uuid",
          "employee_code": "EMP-01", "full_name": "Alice", "department_id": "uuid", "department_name": "Engineering",
          "location_id": "uuid", "location_name": "HQ",
          "component_code": "SPECIAL_ALLOWANCE", "component_name": "Special", "component_type": "earning",
          "amount": "15000.00"
        }
      ],
      "totals": { "amount": "15000.00" },
      "row_count": 1
    }
  }
  ```

## 181. Get Run Bank Advice
* **API Name / Purpose:** Get Run Bank Advice. Streams a NEFT-compatible CSV containing decrypted employee bank details and net pay.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/bank-advice`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Detailed API Function:** Rejects any run not in `paid` status. Resolves the payable cohort and decrypts bank account numbers instantly inside a local loop (secrecy invariant). Initiates `bank_advice` export audit row.
* **Response Structure:** Binary CSV stream (`Content-Type: text/csv`).
* **Error Handling:** `409 RUN_NOT_PAYABLE` (if run is draft/approved).

## 182. List Exports
* **API Name / Purpose:** List Exports. Retrieves a paginated list of all export audit logs generated by the organization.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/exports`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Exports fetched",
    "data": {
      "count": 100,
      "rows": [
        {
          "id": "uuid", "org_id": "uuid", "report_type": "payroll_register", "format": "csv",
          "scope": "org", "run_id": null, "window_start": "2026-01", "window_end": "2026-03",
          "status": "completed", "row_count": 500, "requested_by": "uuid", "created_at": "...", "completed_at": "..."
        }
      ]
    }
  }
  ```

## 183. Get Employee Annual Statement (JSON)
* **API Name / Purpose:** Get Employee Annual Statement (JSON). Retrieves the FY salary grid for an employee.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/annual-statement`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:** None
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Annual statement fetched",
    "data": {
      "financial_year": "2026-27",
      "employee": { "user_id": "uuid", "full_name": "Alice", "pan": "ABCDE1234F" },
      "employer": { "name": "Acme Corp", "tan": "XYZ1234567" },
      "months": [
        {
          "period_month": "2026-04", "status": "present", "source": "snapshot",
          "gross_earnings": "150000.00", "net_pay": "115000.00", "total_deductions": "10000.00",
          "earnings": [{ "code": "BASIC", "amount": "75000.00" }],
          "deductions": [{ "code": "PF_EMPLOYEE", "amount": "1800.00" }]
        }
      ],
      "ytd_totals": {
        "gross_earnings": "150000.00", "net_pay": "115000.00",
        "earnings": [{ "code": "BASIC", "amount": "75000.00" }]
      }
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | ----- | ---- | -------- | ----------- | ---------------- |
  | `data.months[].status` | String | No | Presence | `present` (has data) or `empty` (no run or held) |
  | `data.months[].source` | String | Yes | Origin | `snapshot` or `live_projection` |

## 184. Get Employee Annual Statement (PDF)
* **API Name / Purpose:** Download Employee Annual Statement PDF.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/annual-statement/pdf`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Detailed API Function:** Uses the exact dataset from #183 but streams it as a formatted PDF and logs an `annual_statement` export.
* **Response Structure:** Binary PDF stream (`Content-Type: application/pdf`).

## 185. Get Employee Form 16 PDF
* **API Name / Purpose:** Download Employee Form 16 PDF.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/pdf`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Detailed API Function:** Generates the Form 16 Part B tax certificate. Streams binary. Audited export.
* **Response Structure:** Binary PDF stream (`Content-Type: application/pdf`).

---

# Manager Plane APIs — `/api/v1/payroll/manager`

## 186. Download Report's Payslip PDF
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/employees/:userId/payslips/:runId/pdf`
* **Authentication / Authorization:** Token, `manager`, `payroll.access`.
* **Detailed API Function:** Identical to #170 but enforces manager hierarchy and the D-44 release gate. If `visible_to_employee = false`, rejects with `403`.
* **Response Structure:** Binary PDF stream.

## 187. Get Manager Payroll Register
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/reports/payroll-register`
* **Authentication / Authorization:** Token, `manager`, `payroll.access`.
* **Detailed API Function:** Scope is strictly constrained to the manager's hierarchy. Format identical to #177.
* **Response Structure:** See #177.

## 188. Get Manager Department Distribution
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/reports/department-distribution`
* **Response Structure:** See #178.

## 189. Get Manager Deduction Summary
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/reports/deduction-summary`
* **Response Structure:** See #179.

## 190. Get Manager Component Report
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/reports/components`
* **Response Structure:** See #180.

---

# Self Plane APIs — `/api/v1/payroll/self`

## 191. Download Own Payslip PDF
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/self/me/payslips/:runId/pdf`
* **Authentication / Authorization:** Token.
* **Detailed API Function:** Rejects with `403` if `visible_to_employee = false`.
* **Response Structure:** Binary PDF stream.

## 192. Get Own Annual Statement (JSON)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/self/me/annual-statement`
* **Authentication / Authorization:** Token.
* **Response Structure:** See #183.

## 193. Download Own Annual Statement (PDF)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/self/me/annual-statement/pdf`
* **Authentication / Authorization:** Token.
* **Response Structure:** Binary PDF stream.

## 194. Download Own Form 16 PDF
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/self/me/tax/form16/:financialYear/pdf`
* **Authentication / Authorization:** Token.
* **Detailed API Function:** Employee downloads Form 16 Part B. Rejects with `404` if the FY is not finalized by HR.
* **Response Structure:** Binary PDF stream.
