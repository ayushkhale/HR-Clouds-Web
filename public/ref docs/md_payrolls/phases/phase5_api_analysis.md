# Phase 5: Reimbursements & Benefits (Claims, Approvals, S3 Attachments & Benefit Plans) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint technical and architectural analysis of the **39 APIs (#128–#166)** implemented in Phase 5 of the Payroll module.

> [!IMPORTANT]
> **Architectural Premise:** Payroll is strictly a **tenant-plane** module. Platform administrative roles (`admin`, `super-admin`) are categorically locked out (`403 FORBIDDEN`, **D-14**). Every request requires an organizational context (`orgId` extracted from the authenticated JWT) and an active `payroll.access` feature entitlement flag.
> 
> **Reimbursement Payout Invariant (D-31):** A reimbursement payout is **not an earning**. It never appears in `gross_earnings`, `taxable_earnings`, `pf_wage`, `esi_wage`, the Professional Tax (PT) base, or `ctc_cost`. It sits outside the negative-net wage clamp (**Step 8f**), entering only `net_pay` and the new `reimbursement_amount` column. Emitting a reimbursement as an earning line is strictly prevented because it would corrupt statutory withholdings and violate labor law by treating an expense reimbursement as taxable income.
>
> **Benefit Deduction & Contribution Invariant (D-33, D-36, D-37):** Benefit plans carry flat monthly contributions for employee deductions (**Step 8a′**, prioritized before discretionary loan EMI recovery) and/or employer contributions (**Step 6c**, factored into CTC). Benefits carry no mid-month proration (**D-36**); an active enrollment charges a full month's premium if it touches any calendar day of the month. Dual-layer month-overlap protection (PostgreSQL `btree_gist` EXCLUDE constraint + serialised service assertion under `payroll:benefit:{userId}`) guarantees an employee is never double-deducted.
>
> **Binary-Free Polymorphic S3 Storage (D-30):** The API process never buffers, parses, or streams document binaries. Attachment lifecycles operate strictly through short-lived pre-signed AWS S3 URLs: pre-signed `PUT` (10-minute TTL) binding exact `Content-Type` and `Content-Length`, `HeadObject` verification prior to confirmation, and pre-signed `GET` (5-minute TTL) with inline browser rendering or download disposition. Serves reimbursement receipts, Chapter VI-A investment declaration proofs, and Form 16 Part A certificates under a unified schema.

---

## Architectural Pillars & Cross-Cutting Behaviors

### 1. Unified Concurrency & Lock Hierarchy (§7.1)
All state-modifying operations strictly adhere to a deterministic, global lock order to guarantee zero deadlocks across parallel payroll runs, claim approvals, and variable pay adjustments:
1. `payroll:run:{orgId}:{period_month}` (Rank 1 — acquired first whenever a live run is modified or targeted).
2. `payroll:lock:{orgId}` (Rank 2 — reserved for period-lock resolution during run approval).
3. `payroll:claim:{claimId}` / `payroll:benefit:{userId}` / `payroll:tax:{userId}:{fy}` / `payroll:loan:{userId}` / `payroll:structure:{userId}` (Rank 3 — entity/subject level advisory locks).
4. Row-level pessimistic locks (`SELECT ... FOR UPDATE`), parents locked before child records.

> [!WARNING]
> **Claim Final Approval Lock Ordering:** The final approval level resolves the payout period forward (§6.4), acquiring the Rank-1 run advisory lock on the target month. The Rank-3 `payroll:claim:{claimId}` lock is acquired *after* the Rank-1 run lock. Reversing this sequence creates a deadlock against concurrent run approval processes walking run → claim.

### 2. Payout Period Lookahead Resolution (§6.4, EC-23)
When a reimbursement claim receives final approval, its payout period is resolved automatically:
- Evaluates the current calendar month and walks forward up to `reimbursement_payout_lookahead_months` (configured in `payroll_settings`, range `0–6`, default `2`).
- Identifies the earliest month whose regular payroll run is open (`draft`, `calculated`, `failed`, or not yet created).
- Marks the target run with `requires_recalculation = true` under the Rank-1 run advisory lock, preventing premature finalization without the approved claim (**D-18**).
- If a candidate month's run is `approved` or `paid`, it is recognized as closed and skipped forward without error (**EC-23**).
- If a candidate month is `calculating`, it yields retryable `409 RUN_CALCULATION_IN_PROGRESS`.
- If all months within the lookahead window are closed, the approval aborts cleanly with `422 NO_OPEN_PAYOUT_PERIOD`, rolling back all state changes and leaving the claim actionable.

### 3. Claim State Machine Lifecycle (§6.5)
Claims progress through a multi-stage deterministic state transition graph:
- `draft`: Editable authoring state. Line items can be replaced; receipts attached/deleted. Unsubmitted claims do not consume limit headroom.
- `submitted`: Submitted by claimant. Chain is materialized; sequential human reference `RC-YYYYMM-NNNN` assigned; category limits and receipt requirements server-enforced.
- `under_review`: Active when `total_levels = 2` and Level 1 (Manager) has approved. Claimant retains the right to cancel at this stage (**§7.4a**).
- `approved`: All approval levels satisfied. `payout_period_month` is stamped; `approved_amount` is finalized. Stamped with `applied_run_id` upon run approval (**D-35**).
- `processed`: Final terminal state reached when the associated payroll run transitions to `paid`.
- `rejected`: Terminal state triggered if any level rejects or if all line items are approved at ₹0.00.
- `cancelled`: Terminal claimant withdrawal from `draft`, `submitted`, or `under_review`.

---

## 1. HR Administration APIs — `/api/v1/payroll/hr`
*Auth Stack:* `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`

---

### API 128: Create Reimbursement Category
* **API Name:** Create Reimbursement Category
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/categories`
* **Purpose:** Defines an organizational reimbursement expense category along with its policy constraints, receipt requirements, limit periods, and taxability rules.
* **Business Problem Solved:** Eliminates ad-hoc, untracked employee expense claims by establishing structured organizational expense policies with strict server-enforced spending limits.
* **Why the API Exists:** HR and finance administrators need full control over what categories of business expenses employees can claim, whether receipts are required above specific thresholds, and how expenses should be treated under statutory tax rules.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR sets up a "Travel & Conveyance" category with a per-claim cap of ₹10,000, an annual FY cap of ₹100,000, mandatory receipts for claims above ₹500, and non-taxable reimbursement treatment.
* **Request Structure and Parameters:** URL contains no path or query parameters.
* **Request Payload and Field Meanings:**
  ```json
  {
    "name": "Travel & Conveyance",
    "code": "TRAVEL",
    "description": "Local travel, cab fares, and outstation conveyance",
    "is_taxable": false,
    "requires_receipt": true,
    "receipt_required_above_amount": "500.00",
    "max_amount_per_claim": "10000.00",
    "max_amount_per_period": "100000.00",
    "limit_period": "financial_year",
    "component_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "is_active": true
  }
  ```
  - `name` (String, Required): Human-readable category name (max 150 chars).
  - `code` (String, Required): Unique alphanumeric identifier per organization, automatically normalized to uppercase.
  - `description` (String, Optional): Explanatory guidance for employees.
  - `is_taxable` (Boolean, Optional, Default: `false`): Governs whether payouts land as tax-exempt reimbursement lines or taxable earnings.
  - `requires_receipt` (Boolean, Optional, Default: `true`): Mandatory proof requirement toggle.
  - `receipt_required_above_amount` (Decimal/Null, Optional): Exemption ceiling below which receipts are not enforced. `null` means receipts are mandatory for all amounts when `requires_receipt = true`.
  - `max_amount_per_claim` (Decimal/Null, Optional): Hard ceiling per single claim. `null` denotes uncapped.
  - `max_amount_per_period` (Decimal/Null, Optional): Cumulative approved ceiling across a rolling window. `null` denotes uncapped.
  - `limit_period` (Enum: `'month'` | `'financial_year'`, Default: `'financial_year'`): Time window for `max_amount_per_period`.
  - `component_id` (UUID/Null, Optional): Foreign key link to `salary_components` for reporting joins. Cannot point to a statutory component (**D-23**).
  - `is_active` (Boolean, Optional, Default: `true`): Availability flag for employee submissions.
* **Backend Processing Flow:**
  1. Normalizes `code` to uppercase.
  2. Begins unmanaged database transaction.
  3. Verifies `component_id`: ensures component exists and `is_statutory !== true`.
  4. Inserts new row into `reimbursement_categories`.
  5. Records audit log `reimbursement_category.created`.
  6. Commits transaction and returns the created category record.
* **Database Impact:** Inserts 1 row into `reimbursement_categories`; inserts 1 row into `payroll_audit_logs`.
* **Validation Rules:** `code` matches `^[A-Za-z0-9_]+$`; money fields must be non-negative numeric strings or numbers; `limit_period` must match enum.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement category created",
    "data": {
      "id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
      "org_id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "name": "Travel & Conveyance",
      "code": "TRAVEL",
      "description": "Local travel, cab fares, and outstation conveyance",
      "is_taxable": false,
      "requires_receipt": true,
      "receipt_required_above_amount": "500.00",
      "max_amount_per_claim": "10000.00",
      "max_amount_per_period": "100000.00",
      "limit_period": "financial_year",
      "component_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "is_active": true,
      "created_by": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
      "created_at": "2026-09-12T08:00:00.000Z",
      "updated_at": "2026-09-12T08:00:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `409 CATEGORY_CODE_EXISTS`: Category code already exists within the tenant org.
  - `422 STATUTORY_COMPONENT_NOT_ASSIGNABLE`: Attempted to map category to an engine-calculated statutory component (e.g., PF, ESI).
  - `422 COMPONENT_NOT_FOUND`: Referenced `component_id` does not exist.
* **HTTP Status Codes:** `201 Created`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Tenant-scoped via `req.user.orgId`. Requires `hr` role and `payroll.access`.
* **Idempotency and Retry Behavior:** Non-idempotent insert; duplicate attempts with the same code return `409 CATEGORY_CODE_EXISTS`.
* **Transactions and Concurrency Behavior:** Executed inside a dedicated transaction; partial unique index on `(org_id, code) WHERE deleted_at IS NULL` guarantees code uniqueness under concurrent writes.
* **Side Effects:** Makes the category immediately available in the catalog.
* **Important Edge Cases:** Creating a category does not seed past claims; limit caps apply strictly forward.
* **Related APIs / Dependencies:** API 129 (List Categories), API 131 (Update Category), API 155 (Employee Draft Claim).
* **What the API Gives / Does:** Creates and returns a new organizational reimbursement category configuration.

---

### API 129: List Reimbursement Categories
* **API Name:** List Reimbursement Categories
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/categories`
* **Purpose:** Retrieves all reimbursement categories configured for the organization, with optional filtering by active status.
* **Business Problem Solved:** Provides HR administrators with complete visibility into the organization's expense policy catalog.
* **Why the API Exists:** Needed by the HR management portal to render category administration tables and manage active/inactive expense heads.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR admin loads the Expense Policy Dashboard to view all active categories and their assigned limits.
* **Request Structure and Parameters:**
  - Query Parameter: `is_active` (Boolean, Optional): Filter by active status (`true` or `false`).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates query parameters inside controller via `validateOrThrow`.
  2. Queries `reimbursement_categories` filtered by `org_id` and optional `is_active`.
  3. Returns category array and total count.
* **Database Impact:** Read-only query against `reimbursement_categories`.
* **Validation Rules:** `is_active` must parse as boolean if supplied.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement categories fetched",
    "data": {
      "count": 3,
      "rows": [
        {
          "id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
          "name": "Travel & Conveyance",
          "code": "TRAVEL",
          "is_taxable": false,
          "requires_receipt": true,
          "max_amount_per_claim": "10000.00",
          "max_amount_per_period": "100000.00",
          "limit_period": "financial_year",
          "is_active": true
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:** Standard authorization failures.
* **HTTP Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`.
* **Security / Authorization Behavior:** Scoped to tenant org.
* **Idempotency and Retry Behavior:** Fully idempotent safe read.
* **Transactions and Concurrency Behavior:** Standard unblocked read query.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array `{ count: 0, rows: [] }` when no categories match the query.
* **Related APIs / Dependencies:** API 128 (Create Category), API 130 (Get Category Detail).
* **What the API Gives / Does:** Returns an array of category records with their associated policy attributes.

---

### API 130: Get Reimbursement Category
* **API Name:** Get Reimbursement Category
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Purpose:** Fetches full configuration details for a specific reimbursement category.
* **Business Problem Solved:** Enables detailed inspection of category limits, tax rules, and receipt requirements.
* **Why the API Exists:** Necessary for populating category edit forms and viewing mapped component relations.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR clicks on "Edit Category" to view its current limits and audit details before modifying.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Category unique identifier.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates UUID path parameter.
  2. Queries `reimbursement_categories` by `id` and `org_id`.
  3. Returns category or throws `404 CATEGORY_NOT_FOUND`.
* **Database Impact:** Read-only query.
* **Validation Rules:** `id` must be valid UUID v4.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement category fetched",
    "data": {
      "id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
      "name": "Travel & Conveyance",
      "code": "TRAVEL",
      "description": "Local travel, cab fares, and outstation conveyance",
      "is_taxable": false,
      "requires_receipt": true,
      "receipt_required_above_amount": "500.00",
      "max_amount_per_claim": "10000.00",
      "max_amount_per_period": "100000.00",
      "limit_period": "financial_year",
      "component_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "is_active": true
    }
  }
  ```
* **Failure / Error Scenarios:** `404 CATEGORY_NOT_FOUND` if category does not exist or belongs to another tenant.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`.
* **Security / Authorization Behavior:** Tenant-isolated query.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Cross-tenant access attempts return `404 CATEGORY_NOT_FOUND` rather than exposing existence.
* **Related APIs / Dependencies:** API 131 (Update Category).
* **What the API Gives / Does:** Returns the full single category object.

---

### API 131: Update Reimbursement Category
* **API Name:** Update Reimbursement Category
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Purpose:** Updates category metadata, spending ceilings, receipt rules, taxability flags, or active status.
* **Business Problem Solved:** Allows HR to adjust corporate reimbursement policies in response to revised company budgets or tax guidelines.
* **Why the API Exists:** Policies evolve over time; HR must be able to revise per-claim and per-period caps without invalidating historical records.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** Due to inflation, HR raises the `max_amount_per_claim` for the "Meals & Entertainment" category from ₹1,500 to ₹2,500.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Category ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "name": "Business Travel & Lodging",
    "max_amount_per_claim": "15000.00",
    "max_amount_per_period": "150000.00",
    "receipt_required_above_amount": "1000.00"
  }
  ```
  Accepts any subset of editable fields defined in API 128. Requires at least 1 field.
* **Backend Processing Flow:**
  1. Opens transaction; loads existing category with row lock (`FOR UPDATE`).
  2. If `component_id` is updated, re-validates that component is non-statutory.
  3. Updates category attributes in `reimbursement_categories`.
  4. Records audit log `reimbursement_category.updated` with field diff (`oldValues` vs `newValues`).
  5. Commits transaction and returns updated category record.
* **Database Impact:** Updates 1 row in `reimbursement_categories`; inserts 1 row into `payroll_audit_logs`.
* **Validation Rules:** At least one editable field required; code uniqueness enforced if `code` is changed.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement category updated",
    "data": {
      "id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
      "name": "Business Travel & Lodging",
      "code": "TRAVEL",
      "max_amount_per_claim": "15000.00",
      "max_amount_per_period": "150000.00",
      "updated_at": "2026-09-12T08:30:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 CATEGORY_NOT_FOUND`: Category does not exist.
  - `409 CATEGORY_CODE_EXISTS`: New code collides with another existing category.
  - `422 STATUTORY_COMPONENT_NOT_ASSIGNABLE`: Target component is statutory.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Tenant-scoped.
* **Idempotency and Retry Behavior:** Idempotent for identical payloads.
* **Transactions and Concurrency Behavior:** Pessimistic row locking on category ensures serialized updates.
* **Side Effects (Critical Snapshot Invariant, §4.3):** Modifying category limits or taxability flags **never affects existing claim items**. Claim lines snapshot `category_code`, `category_name`, `is_taxable`, and `component_id` at authoring time.
* **Important Edge Cases:** Altering `is_taxable` from `false` to `true` applies only to draft claims authored *after* the update.
* **Related APIs / Dependencies:** API 129, API 130, API 132.
* **What the API Gives / Does:** Updates category settings and returns the modified record.

---

### API 132: Deactivate Reimbursement Category
* **API Name:** Deactivate Reimbursement Category
* **HTTP Method:** `DELETE`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Purpose:** Soft-deactivates an expense category, preventing new claims from referencing it.
* **Business Problem Solved:** Retires obsolete expense policies safely without breaking historical or ongoing claim audits.
* **Why the API Exists:** Hard-deleting a financial category corrupts data integrity and foreign key constraints. This API sets `is_active: false` while safeguarding in-flight claims.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** An organization disbands a "Mobile Handset Reimbursement" program and deactivates the category.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Category ID.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Opens transaction; locks category row `FOR UPDATE`.
  2. Queries `reimbursement_claim_items` joined to `reimbursement_claims`: counts items referencing this category whose claim status is not in terminal states (`['rejected', 'cancelled', 'processed']`).
  3. If active non-terminal claims reference this category, aborts with `409 CATEGORY_IN_USE`.
  4. If already `is_active === false`, commits and returns (idempotent).
  5. Updates `is_active: false`.
  6. Records audit log `reimbursement_category.deactivated`.
  7. Commits transaction.
* **Database Impact:** Updates `reimbursement_categories.is_active = false`; inserts 1 audit log.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement category deactivated",
    "data": {
      "id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
      "is_active": false
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 CATEGORY_NOT_FOUND`: Category does not exist.
  - `409 CATEGORY_IN_USE`: One or more non-terminal claims (`draft`, `submitted`, `under_review`, `approved`) reference this category.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `409 Conflict`.
* **Security / Authorization Behavior:** Tenant-isolated.
* **Idempotency and Retry Behavior:** Fully idempotent. Calling on an already-deactivated category returns 200 without error.
* **Transactions and Concurrency Behavior:** Atomic check and update under database transaction.
* **Side Effects:** Prevents selection of this category in API 155 / API 158.
* **Important Edge Cases:** Claims already finalized (`processed`, `rejected`, `cancelled`) do not block deactivation because they only preserve snapshotted data.
* **Related APIs / Dependencies:** API 129, API 131.
* **What the API Gives / Does:** Deactivates the category and guarantees no active in-flight claims are orphaned.

---

### API 133: List Org Reimbursement Claims Queue
* **API Name:** List Org Reimbursement Claims Queue
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/claims`
* **Purpose:** Lists all employee reimbursement claims across the entire organization with multi-dimensional filtering and pagination.
* **Business Problem Solved:** Centralizes organizational expense visibility, enabling HR and Finance to monitor company-wide spend, track pending approval queues, and inspect payout batches.
* **Why the API Exists:** HR oversees all reimbursement claims regardless of reporting hierarchy and requires a unified filtering surface.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR filters the queue for claims with `status: 'under_review'` and `current_level: 2` to identify all claims awaiting HR sign-off for the current month.
* **Request Structure and Parameters:**
  Query parameters (validated in controller):
  - `status` (Enum, Optional): Filter by claim status (`draft`, `submitted`, `under_review`, `approved`, `processed`, `rejected`, `cancelled`).
  - `user_id` (UUID, Optional): Filter claims submitted by a specific employee.
  - `category_id` (UUID, Optional): Filter claims containing at least one item from this category.
  - `payout_period_month` (String `YYYY-MM`, Optional): Target payout payroll month.
  - `current_level` (Integer `0–10`, Optional): Current pending approval level.
  - `created_from` (Date `YYYY-MM-DD`, Optional): Submission range start date.
  - `created_to` (Date `YYYY-MM-DD`, Optional): Submission range end date.
  - `page` (Integer, Default: 1): Pagination page number.
  - `limit` (Integer, Default: 20, Max: 100): Results per page.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates query parameters against Joi schema.
  2. If `category_id` filter is present, performs sub-query on `reimbursement_claim_items` to resolve matching claim IDs.
  3. Queries `reimbursement_claims` for `org_id` with applied filters, paginated and ordered by `created_at DESC`.
  4. Returns standard pagination envelope.
* **Database Impact:** Read-only query against `reimbursement_claims` (and `reimbursement_claim_items` if category filtered).
* **Validation Rules:** All dates must match `YYYY-MM-DD`; month must match `YYYY-MM`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claims fetched",
    "data": [
      {
        "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
        "org_id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
        "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
        "claim_number": "RC-202609-0012",
        "title": "Client Visit - Bangalore",
        "status": "under_review",
        "total_amount": "8500.00",
        "approved_amount": "0.00",
        "current_level": 2,
        "total_levels": 2,
        "submitted_at": "2026-09-10T14:30:00.000Z",
        "payout_period_month": null,
        "applied_run_id": null,
        "created_at": "2026-09-10T14:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "total_pages": 3
    }
  }
  ```
* **Failure / Error Scenarios:** Validation error on invalid query parameters (`422`).
* **HTTP Status Codes:** `200 OK`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Tenant-scoped global access for `hr`.
* **Idempotency and Retry Behavior:** Safe read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Filter by `category_id` correctly includes multi-item claims that contain the category alongside other categories.
* **Related APIs / Dependencies:** API 134 (Get Claim Detail), API 135 (Approve Claim).
* **What the API Gives / Does:** Returns a paginated list of organizational reimbursement claims.

---

### API 134: Get Org Reimbursement Claim Detail
* **API Name:** Get Org Reimbursement Claim Detail
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/claims/:id`
* **Purpose:** Retrieves full claim detail including line items, attachments, multi-level approval history, and server-calculated category limit headroom.
* **Business Problem Solved:** Eliminates guesswork during review by providing approvers with complete visibility into receipts, prior approvals, and exactly how much budget/limit headroom remains for the claimant.
* **Why the API Exists:** Approvers must see the itemized receipts, previous manager remarks, and verified remaining policy balance *before* approving or trimming line item amounts.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR opens Claim `RC-202609-0012` to verify attached hotel receipts and inspect the remaining FY limit for travel before issuing final approval.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Loads claim by `id` and `org_id`. Returns `404 CLAIM_NOT_FOUND` if absent.
  2. Loads line items from `reimbursement_claim_items`.
  3. Loads confirmed `available` attachments for these items.
  4. Loads approval chain records from `reimbursement_approvals`.
  5. Computes `category_limits[]` using `priorSpendMap`: performs the exact same bucketed prior-spend evaluation as the approval gate, showing `remaining` headroom to the paise.
  6. Assembles and returns comprehensive detail payload.
* **Database Impact:** Read-only queries across 4 tables (`reimbursement_claims`, `reimbursement_claim_items`, `reimbursement_approvals`, `payroll_attachments`).
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim fetched",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "claim_number": "RC-202609-0012",
      "title": "Client Visit - Bangalore",
      "status": "under_review",
      "total_amount": "8500.00",
      "approved_amount": "0.00",
      "current_level": 2,
      "total_levels": 2,
      "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
      "items": [
        {
          "id": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
          "category_code": "TRAVEL",
          "category_name": "Travel & Conveyance",
          "expense_date": "2026-09-08",
          "amount": "6500.00",
          "approved_amount": "6500.00",
          "merchant": "Indigo Airlines",
          "description": "Flight BLR-DEL",
          "item_status": "approved",
          "attachments": [
            {
              "id": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
              "file_name": "flight_ticket.pdf",
              "content_type": "application/pdf",
              "size_bytes": 154200,
              "status": "available"
            }
          ]
        }
      ],
      "approvals": [
        {
          "level": 1,
          "approver_role": "manager",
          "assigned_approver_id": "5a6b7c8d-9e0f-1a2b-3c4d-5e6f7a8b9c0d",
          "status": "approved",
          "acted_by": "5a6b7c8d-9e0f-1a2b-3c4d-5e6f7a8b9c0d",
          "acted_at": "2026-09-11T10:00:00.000Z",
          "remarks": "Verified client travel schedule. Approved."
        },
        {
          "level": 2,
          "approver_role": "hr",
          "assigned_approver_id": null,
          "status": "pending"
        }
      ],
      "category_limits": [
        {
          "category_code": "TRAVEL",
          "period_key": "2026-27",
          "limit_period": "financial_year",
          "limit": "100000.00",
          "prior_approved": "24000.00",
          "claimed_in_this_claim": "6500.00",
          "remaining": "69500.00"
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:** `404 CLAIM_NOT_FOUND` if claim ID does not exist in org.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`.
* **Security / Authorization Behavior:** S3 `storage_key` is strictly stripped; never returned in payload.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** Read-only queries without locking.
* **Side Effects:** None.
* **Important Edge Cases:** `category_limits[].remaining` is accurately null when a category has no period cap. Straddling claims (e.g., items in March and April) return distinct period keys.
* **Related APIs / Dependencies:** API 135 (Approve), API 136 (Reject), API 137 (View Receipt URL).
* **What the API Gives / Does:** Returns complete claim details including line items, attachments, approval logs, and real-time limit headroom figures.

---

### API 135: Approve Reimbursement Claim (HR Level / Final Level)
* **API Name:** Approve Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/claims/:id/approve`
* **Purpose:** Executes an HR-tier approval on a reimbursement claim, optionally adjusting line item amounts downward, validating limits, and (on the final level) resolving the payout payroll period.
* **Business Problem Solved:** Enforces dual-control financial governance before organizational funds are disbursed to an employee.
* **Why the API Exists:** Provides HR with the definitive approval authority over claims, ensuring budget limits are respected, non-compliant line items are trimmed or rejected, and approved disbursements are locked into an open payroll run.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR reviews a manager-approved claim of ₹8,500. Finding that a ₹2,000 dinner receipt is alcohol-related and non-reimbursable, HR trims that line to ₹0 and approves the remaining ₹6,500 into the next open payroll run.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "items": [
      {
        "item_id": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
        "approved_amount": "6500.00",
        "item_status": "approved",
        "approver_remarks": "Flight fare approved"
      },
      {
        "item_id": "4e5f6a7b-8c9d-0e1f-2a3b-4c5d6e7f8a9b",
        "approved_amount": "0.00",
        "item_status": "rejected",
        "approver_remarks": "Alcohol not covered per company expense policy"
      }
    ],
    "remarks": "Approved with disallowed dinner expense trimmed"
  }
  ```
  - `items` (Array of Objects, Required): Decisions per line item.
    - `item_id` (UUID, Required): Line item ID.
    - `approved_amount` (Decimal, Required): Approved amount in Rupees (`<= amount`).
    - `item_status` (Enum: `'approved'` | `'rejected'`, Required): Line disposition.
    - `approver_remarks` (String, Optional): Explanation for adjustment.
  - `remarks` (String, Optional): Overarching approver notes.
* **Backend Processing Flow:**
  1. Opens database transaction.
  2. Authority check: verifies caller is tenant `hr`.
  3. Peeks claim unlocked to determine if this action represents the final level.
  4. If final level: calls `_resolvePayoutPeriod` (§6.4) to acquire the **Rank-1 run advisory lock** (`payroll:run:{orgId}:{month}`) and sets `requires_recalculation = true` on target run.
  5. Acquires **Rank-3 claim advisory lock** (`payroll:claim:{claimId}`) and loads claim `FOR UPDATE`.
  6. Asserts `claim.status ∈ {'submitted', 'under_review'}` (else `409 CLAIM_NOT_ACTIONABLE`).
  7. Validates current level cursor: pending approval row must have `approver_role === 'hr'`.
  8. Hard invariant: verifies claimant is not approving own claim (`requester.id !== claim.user_id` else `403 SELF_APPROVAL_FORBIDDEN`).
  9. Validates item decisions: `approved_amount <= amount` (`422 APPROVED_EXCEEDS_CLAIMED`). Unnamed items retain prior decisions.
  10. Re-runs limit check (`checkClaimLimits`) on the approved amounts under transaction. Throws `422 CATEGORY_LIMIT_EXCEEDED` with violation breakdown if cap breached.
  11. Updates current approval row to `status: 'approved'`. Updates line item rows.
  12. If more levels remain: increments `current_level += 1`, `status: 'under_review'`.
  13. If final level and `approved_amount > 0`: sets `status: 'approved'`, `payout_period_month`, and `finalized_at`. If all lines rejected: sets `status: 'rejected'`.
  14. Records audit events (`reimbursement_claim.level_approved`, `reimbursement_claim.approved`).
  15. Commits transaction and returns full updated claim.
* **Database Impact:** Updates `reimbursement_claims`, `reimbursement_claim_items`, `reimbursement_approvals`; inserts audit logs; updates `payroll_runs.requires_recalculation = true`.
* **Validation Rules:** Approved amount cannot exceed claimed amount; `approver_remarks` max 1000 chars.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim approved",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "claim_number": "RC-202609-0012",
      "status": "approved",
      "total_amount": "8500.00",
      "approved_amount": "6500.00",
      "current_level": 2,
      "total_levels": 2,
      "payout_period_month": "2026-09",
      "finalized_at": "2026-09-12T09:15:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 SELF_APPROVAL_FORBIDDEN`: HR user submitted the claim and attempted self-approval.
  - `403 NOT_YOUR_APPROVAL_LEVEL`: Claim is currently waiting for Manager Level 1 action.
  - `409 CLAIM_NOT_ACTIONABLE`: Claim already acted upon or cancelled.
  - `422 APPROVED_EXCEEDS_CLAIMED`: An item approved amount exceeds original expense.
  - `422 CATEGORY_LIMIT_EXCEEDED`: Approved amount exceeds claimant's remaining category cap.
  - `422 NO_OPEN_PAYOUT_PERIOD`: No open payroll run exists within lookahead window.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Dual-control enforced; self-approval strictly blocked even for HR admins.
* **Idempotency and Retry Behavior:** Cursor-protected. Double-clicking or retrying returns `409 CLAIM_NOT_ACTIONABLE`.
* **Transactions and Concurrency Behavior:** Enforces strict total order (Rank 1 run lock before Rank 3 claim lock).
* **Side Effects:** Automatically flags target payroll run for recalculation (**D-18**).
* **Important Edge Cases:** If HR zeroes out all line items, the claim automatically terminates as `rejected` with `approved_amount = 0.00` and `payout_period_month = null`.
* **Related APIs / Dependencies:** API 133, API 134, API 136, API 42 (Preview Run).
* **What the API Gives / Does:** Finalizes approval of the claim, sets approved disbursement amount, and locks it into the target payroll run.

---

### API 136: Reject Reimbursement Claim (HR Level)
* **API Name:** Reject Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/reimbursements/claims/:id/reject`
* **Purpose:** Permanently rejects a reimbursement claim at the HR review stage.
* **Business Problem Solved:** Prevents illegitimate or non-compliant expense claims from entering company accounts or payroll runs.
* **Why the API Exists:** Provides HR with terminal rejection capability with mandatory documentation of reasons.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR rejects an expense claim because the employee failed to submit invoices within the mandatory 60-day policy window.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "rejection_reason": "Receipts dated >60 days prior to submission violate company travel policy clause 4.2."
  }
  ```
  - `rejection_reason` (String, Required): Mandatory textual justification (max 1000 chars).
* **Backend Processing Flow:**
  1. Opens transaction; checks HR tenant authorization.
  2. Takes Rank-3 `payroll:claim:{claimId}` advisory lock and loads claim `FOR UPDATE`.
  3. Asserts claim status is `submitted` or `under_review` (else `409`).
  4. Checks that current pending approval row is assigned to `hr` role.
  5. Verifies caller is not claimant (`403 SELF_APPROVAL_FORBIDDEN`).
  6. Marks current approval row as `rejected` with timestamp and remarks.
  7. Marks all remaining pending levels as `skipped`.
  8. Updates all claim items: `approved_amount = 0`, `item_status = 'rejected'`.
  9. Updates claim header: `status = 'rejected'`, `approved_amount = 0`, `finalized_at = NOW()`, `payout_period_month = null`.
  10. Records audit event `reimbursement_claim.rejected`.
  11. Commits transaction and returns rejected record.
* **Database Impact:** Updates `reimbursement_claims`, all child `reimbursement_claim_items`, and `reimbursement_approvals`. Inserts audit log.
* **Validation Rules:** `rejection_reason` must be non-empty string.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim rejected",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "status": "rejected",
      "approved_amount": "0.00",
      "payout_period_month": null,
      "rejection_reason": "Receipts dated >60 days prior to submission violate company travel policy clause 4.2.",
      "finalized_at": "2026-09-12T09:30:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 SELF_APPROVAL_FORBIDDEN`: Claimant attempted self-rejection.
  - `409 CLAIM_NOT_ACTIONABLE`: Claim already finalized or cancelled.
  - `422 REJECTION_REASON_REQUIRED`: Reason omitted or blank.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Tenant-scoped HR authority.
* **Idempotency and Retry Behavior:** Cursor-protected. Repeat calls yield `409 CLAIM_NOT_ACTIONABLE`.
* **Transactions and Concurrency Behavior:** Claim lock serializes concurrent approval/rejection attempts.
* **Side Effects:** Permanently removes the claim from all future payroll calculation pipelines.
* **Important Edge Cases:** Rejected claims are permanently terminal; cannot be reopened or edited.
* **Related APIs / Dependencies:** API 133, API 135.
* **What the API Gives / Does:** Terminates the claim with prejudice, zeroes all items, and preserves the rejection reason for employee review.

---

### API 137: Get Attachment View URL (HR Scope)
* **API Name:** Get Attachment View URL
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/attachments/:attachmentId/view-url`
* **Purpose:** Generates a secure, temporary pre-signed S3 URL to view or download any attachment across the organization.
* **Business Problem Solved:** Enables HR and payroll auditors to inspect proof documents securely without storing binaries on the web server or exposing public S3 buckets.
* **Why the API Exists:** Generic document retrieval endpoint serving reimbursement receipts, Section 80C/80D investment proofs, and Form 16 Part A files under strict organizational scoping.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** While verifying tax declarations, HR opens an employee's life insurance premium receipt to validate the declared ₹50,000 exemption.
* **Request Structure and Parameters:**
  - Path Parameter: `attachmentId` (UUID, Required): Unique ID of the attachment.
  - Query Parameter: `disposition` (Enum: `'inline'` | `'attachment'`, Optional, Default: `'inline'`).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates query parameter (`disposition`).
  2. Queries `payroll_attachments` by `id` and `orgId`. Returns `404` if not found or if `status !== 'available'`.
  3. Screens authority: HR holds global tenant authority over all three owner types (`reimbursement_claim_item`, `investment_declaration_item`, `form16_part_a`).
  4. If `storage_backend === 'reference'`, returns external TRACES HTTPS URL directly with `expires_at: null`.
  5. If `storage_backend === 's3'`, generates pre-signed S3 GET URL with 300-second (5-minute) TTL, setting `ResponseContentDisposition` and `ResponseContentType`.
  6. Logs audit event `attachment.view_url_issued` (never logging the signed URL or bucket key).
  7. Returns signed URL.
* **Database Impact:** Inserts 1 audit log (`attachment.view_url_issued`).
* **Validation Rules:** `disposition` must be `'inline'` or `'attachment'`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Attachment view URL issued",
    "data": {
      "view_url": "https://payroll-secure-attachments.s3.ap-south-1.amazonaws.com/org/4a5b6c.../flight.pdf?X-Amz-Signature=...",
      "expires_at": "2026-09-12T09:35:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 ATTACHMENT_NOT_FOUND`: Attachment does not exist, belongs to another org, or is in `pending`/`deleted` status.
  - `503 ATTACHMENT_STORAGE_UNAVAILABLE`: S3 service outage or configuration failure.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `503 Service Unavailable`.
* **Security / Authorization Behavior:** URL is short-lived (5 min), unguessable, and never exposes bucket credentials.
* **Idempotency and Retry Behavior:** Safe idempotent operation; generates fresh signed URL on each request.
* **Transactions and Concurrency Behavior:** Atomic audit log write.
* **Side Effects:** None on domain records.
* **Important Edge Cases:** Returns `404` for attachments in `pending` status, preventing access to abandoned or unconfirmed uploads.
* **Related APIs / Dependencies:** API 134, API 106 (Tax Declarations), API 147.
* **What the API Gives / Does:** Issues a 5-minute pre-signed GET URL for secure in-browser viewing or downloading.

---

### API 138: Create Benefit Plan
* **API Name:** Create Benefit Plan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans`
* **Purpose:** Creates an organizational employee benefit plan (e.g., group health insurance, meal vouchers, accidental coverage) specifying monthly employee and employer contribution amounts.
* **Business Problem Solved:** Eliminates manual offline salary deductions for recurring company benefit schemes by defining systematic benefit plans that automatically calculate contributions during payroll runs.
* **Why the API Exists:** HR needs a formal master catalog of corporate insurance and benefit plans that can be assigned to employee cohorts.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR creates a "Gold Health Insurance Plan" provided by Star Health, requiring a monthly employee payroll deduction of ₹1,200 and an employer co-contribution of ₹1,800.
* **Request Structure and Parameters:** None.
* **Request Payload and Field Meanings:**
  ```json
  {
    "name": "Gold Family Health Insurance",
    "code": "GHI_GOLD",
    "benefit_type": "health_insurance",
    "provider_name": "Star Health & Allied Insurance",
    "description": "Comprehensive family floater covering employee, spouse, and up to 2 children",
    "employee_contribution_amount": "1200.00",
    "employer_contribution_amount": "1800.00",
    "employee_component_id": "8b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
    "employer_component_id": "9c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f",
    "coverage_amount": "500000.00",
    "effective_from": "2026-04-01",
    "effective_to": null,
    "is_active": true
  }
  ```
  - `name` (String, Required): Plan title (max 150 chars).
  - `code` (String, Required): Unique identifier per org, normalized to uppercase.
  - `benefit_type` (Enum, Required): `'health_insurance'`, `'life_insurance'`, `'accident_insurance'`, `'meal'`, `'travel'`, `'other'`.
  - `provider_name` (String, Optional): Insurance carrier or vendor name.
  - `description` (String, Optional): Coverage details.
  - `employee_contribution_amount` (Decimal, Optional, Default: `0.00`): Flat monthly employee deduction.
  - `employer_contribution_amount` (Decimal, Optional, Default: `0.00`): Flat monthly employer contribution.
  - `employee_component_id` / `employer_component_id` (UUID, Optional): Links to non-statutory salary components for payslip reporting.
  - `coverage_amount` (Decimal, Optional): Total sum insured (informational).
  - `effective_from` (Date `YYYY-MM-DD`, Required): Start validity date.
  - `effective_to` (Date `YYYY-MM-DD`/Null, Optional): End validity date (`null` = open-ended).
  - `is_active` (Boolean, Optional, Default: `true`): Active status.
* **Backend Processing Flow:**
  1. Opens transaction. Normalizes `code` to uppercase.
  2. Asserts mapped component IDs exist and are not statutory (**D-23**).
  3. Inserts new row into `benefit_plans`.
  4. Records audit log `benefit_plan.created`.
  5. Commits transaction and returns created plan.
* **Database Impact:** Inserts 1 row into `benefit_plans`; inserts 1 row into `payroll_audit_logs`.
* **Validation Rules:** Code matches alphanumeric format; contributions must be non-negative money values; `effective_from` must be valid date.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefit plan created",
    "data": {
      "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
      "org_id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "name": "Gold Family Health Insurance",
      "code": "GHI_GOLD",
      "benefit_type": "health_insurance",
      "employee_contribution_amount": "1200.00",
      "employer_contribution_amount": "1800.00",
      "effective_from": "2026-04-01",
      "effective_to": null,
      "is_active": true
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `409 PLAN_CODE_EXISTS`: Benefit plan code already exists in org.
  - `422 STATUTORY_COMPONENT_NOT_ASSIGNABLE`: Linked component is statutory.
* **HTTP Status Codes:** `201 Created`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Scoped to tenant. Requires `hr` role.
* **Idempotency and Retry Behavior:** Non-idempotent insert; code collisions reject with `409`.
* **Transactions and Concurrency Behavior:** Atomic creation with audit logging.
* **Side Effects (D-37 Compliance):** Plans carry **no direct tax semantics** in Phase 5: employer contribution does not count as a taxable perquisite, and employee deduction does not automatically feed Section 80D (employees declare 80D via Phase 4 declaration APIs).
* **Important Edge Cases:** Contributions are strictly flat monthly rupee amounts. Percentage-of-salary premiums are intentionally excluded from Phase 5 architecture.
* **Related APIs / Dependencies:** API 139 (List Plans), API 141 (Update Plan), API 143 (Enroll).
* **What the API Gives / Does:** Creates a benefit plan definition for employee enrollments.

---

### API 139: List Benefit Plans
* **API Name:** List Benefit Plans
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans`
* **Purpose:** Returns all benefit plans configured for the organization with optional filtering by active status and benefit type.
* **Business Problem Solved:** Provides HR with an overview of all active and retired company benefit programs.
* **Why the API Exists:** Necessary for rendering benefit administration views and populating employee enrollment selection dropdowns.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR filters for `benefit_type: 'health_insurance'` to view all active medical coverage tiers.
* **Request Structure and Parameters:**
  - Query Parameter: `is_active` (Boolean, Optional).
  - Query Parameter: `benefit_type` (Enum, Optional): Filter by benefit type.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates query filters in controller.
  2. Queries `benefit_plans` for `org_id` with applied filters.
  3. Returns array of matching plan records.
* **Database Impact:** Read-only query against `benefit_plans`.
* **Validation Rules:** `benefit_type` must be valid enum if provided.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefit plans fetched",
    "data": {
      "count": 2,
      "rows": [
        {
          "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
          "name": "Gold Family Health Insurance",
          "code": "GHI_GOLD",
          "benefit_type": "health_insurance",
          "employee_contribution_amount": "1200.00",
          "employer_contribution_amount": "1800.00",
          "is_active": true
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:** Standard authorization errors.
* **HTTP Status Codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`.
* **Security / Authorization Behavior:** Tenant-scoped.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array when no plans match.
* **Related APIs / Dependencies:** API 138, API 140.
* **What the API Gives / Does:** Returns an array of benefit plans meeting filter criteria.

---

### API 140: Get Benefit Plan Detail
* **API Name:** Get Benefit Plan Detail
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans/:id`
* **Purpose:** Retrieves detailed configuration for a benefit plan alongside real-time active enrollment counts and aggregated monthly company/employee cost totals.
* **Business Problem Solved:** Delivers immediate financial visibility into the recurring liability and employee participation of a specific benefit plan.
* **Why the API Exists:** HR and finance need to know how many employees are currently enrolled in a plan and what the combined monthly cash outflow is before revising plan rates.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR opens the "Executive Health Cover" plan details to see that 42 employees are enrolled, generating a monthly payroll cost of ₹126,000.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Plan ID.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Fetches plan from `benefit_plans` by `id` and `org_id`.
  2. Queries `employee_benefit_enrollments` for all rows with `plan_id = id` and `status = 'active'`.
  3. Evaluates contribution amounts live: applies per-employee overrides where present, falling back to plan base amounts (`override != null ? override : plan_amount`).
  4. Sums combined monthly cost (employee deductions + employer contributions) in paise.
  5. Returns plan detail, active enrollment count, and formatted monthly cost total.
* **Database Impact:** Read-only queries against `benefit_plans` and `employee_benefit_enrollments`.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefit plan fetched",
    "data": {
      "plan": {
        "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
        "name": "Gold Family Health Insurance",
        "code": "GHI_GOLD",
        "benefit_type": "health_insurance",
        "employee_contribution_amount": "1200.00",
        "employer_contribution_amount": "1800.00",
        "is_active": true
      },
      "active_enrollment_count": 42,
      "monthly_cost_total": "126000.00"
    }
  }
  ```
* **Failure / Error Scenarios:** `404 PLAN_NOT_FOUND` if plan does not exist.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`.
* **Security / Authorization Behavior:** Tenant-scoped.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** A ₹0.00 override takes precedence over a non-zero plan base amount (`!= null` check, not truthiness), correctly modeling subsidized cover for specific executives.
* **Related APIs / Dependencies:** API 141 (Update Plan), API 144 (List Plan Enrollments).
* **What the API Gives / Does:** Returns plan attributes augmented with live participation metrics and monthly financial totals.

---

### API 141: Update Benefit Plan
* **API Name:** Update Benefit Plan
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans/:id`
* **Purpose:** Modifies benefit plan attributes, provider details, contribution amounts, or validity dates.
* **Business Problem Solved:** Enables HR to adjust benefit premiums and coverage limits in alignment with annual insurance policy renewals.
* **Why the API Exists:** Insurers frequently update annual premium tables; HR must update plan contribution figures seamlessly.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** At annual renewal, the insurer increases premiums by 10%. HR updates employee contributions from ₹1,200 to ₹1,320 and employer contributions from ₹1,800 to ₹1,980.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Plan ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "employee_contribution_amount": "1320.00",
    "employer_contribution_amount": "1980.00",
    "coverage_amount": "600000.00"
  }
  ```
  Accepts any subset of editable plan fields.
* **Backend Processing Flow:**
  1. Opens transaction; loads plan `FOR UPDATE`.
  2. If component mappings are modified, verifies they are non-statutory.
  3. Updates plan record in `benefit_plans`.
  4. Records audit log `benefit_plan.updated` with field diff.
  5. Commits transaction and returns updated plan.
* **Database Impact:** Updates 1 row in `benefit_plans`; inserts 1 audit log.
* **Validation Rules:** Code uniqueness enforced if changed; contributions must be valid money values.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefit plan updated",
    "data": {
      "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
      "employee_contribution_amount": "1320.00",
      "employer_contribution_amount": "1980.00",
      "coverage_amount": "600000.00",
      "updated_at": "2026-09-12T10:00:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 PLAN_NOT_FOUND`: Plan does not exist.
  - `409 PLAN_CODE_EXISTS`: Code collides with another plan.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `409 Conflict`.
* **Security / Authorization Behavior:** Tenant-scoped.
* **Idempotency and Retry Behavior:** Idempotent for duplicate payloads.
* **Transactions and Concurrency Behavior:** Pessimistic lock prevents concurrent update anomalies.
* **Side Effects (§5.7):** Premium updates take effect **from the next payroll calculation**. Already frozen or closed runs are untouched. Recalculating a draft/calculated run dynamically picks up the new rate.
* **Important Edge Cases:** Employees with custom overrides (`employee_contribution_override`) continue to pay their custom override amount, ignoring the revised plan base amount.
* **Related APIs / Dependencies:** API 139, API 140.
* **What the API Gives / Does:** Updates plan settings and returns the revised plan object.

---

### API 142: Deactivate Benefit Plan
* **API Name:** Deactivate Benefit Plan
* **HTTP Method:** `DELETE`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans/:id`
* **Purpose:** Deactivates a benefit plan, preventing new enrollments from being created.
* **Business Problem Solved:** Discontinues deprecated benefit programs while safeguarding existing enrolled employees from premature termination.
* **Why the API Exists:** Guarantees that HR cannot deactivate an insurance policy while employees are actively enrolled in it.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** An organization switches health insurers. HR must first end all employee enrollments before deactivating the old insurer's plan.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Plan ID.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Opens transaction; locks plan `FOR UPDATE`.
  2. Queries `employee_benefit_enrollments`: counts rows with `plan_id = id` and `status = 'active'`.
  3. If active enrollments exist, aborts with `409 PLAN_HAS_ACTIVE_ENROLLMENTS`.
  4. If already inactive, commits and returns (idempotent).
  5. Updates `is_active = false`.
  6. Records audit log `benefit_plan.deactivated`.
  7. Commits transaction.
* **Database Impact:** Updates `benefit_plans.is_active = false`; inserts 1 audit log.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefit plan deactivated",
    "data": {
      "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
      "is_active": false
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 PLAN_NOT_FOUND`: Plan does not exist.
  - `409 PLAN_HAS_ACTIVE_ENROLLMENTS`: Plan still has active employee enrollments. HR must invoke API 146 to end enrollments first.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `409 Conflict`.
* **Security / Authorization Behavior:** Tenant-scoped.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions and Concurrency Behavior:** Locked read prevents enrollment-deactivation race conditions.
* **Side Effects:** Prevents new enrollments via API 143.
* **Important Edge Cases:** Ended and cancelled enrollments do not block deactivation.
* **Related APIs / Dependencies:** API 140, API 146 (End Enrollment).
* **What the API Gives / Does:** Safely deactivates a plan with zero active participants.

---

### API 143: Enroll Employee in Benefit Plan
* **API Name:** Enroll Employee in Benefit Plan
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans/:id/enrollments`
* **Purpose:** Enrolls an employee into a benefit plan starting from a specified effective date, optionally specifying customized contribution overrides.
* **Business Problem Solved:** Automates recurring monthly benefit deductions and employer contributions directly on the employee's payroll run.
* **Why the API Exists:** Provides HR with the mechanism to bind employees to corporate benefit plans with full protection against duplicate or overlapping coverage periods.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** A new employee joins the company; HR enrolls them into the Gold Health Insurance plan starting on `2026-09-01`.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Benefit plan ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
    "enrolled_from": "2026-09-01",
    "overrides": {
      "employee_contribution_override": "1000.00",
      "employer_contribution_override": "2000.00"
    }
  }
  ```
  - `user_id` (UUID, Required): Target employee ID.
  - `enrolled_from` (Date `YYYY-MM-DD`, Required): Start date of coverage.
  - `overrides` (Object, Optional): Customized per-head contributions.
    - `employee_contribution_override` (Decimal/Null, Optional): Custom employee deduction. `null` inherits plan base amount; `0.00` makes it free for the employee.
    - `employer_contribution_override` (Decimal/Null, Optional): Custom employer contribution.
* **Backend Processing Flow:**
  1. Opens database transaction.
  2. Acquires Rank-1 run advisory lock on `enrolled_from` month (`payroll:run:{orgId}:{month}`) via `assertPeriodOpenForVariablePay`: verifies period is open and flags `requires_recalculation = true`.
  3. Acquires Rank-3 subject advisory lock: `payroll:benefit:{userId}`.
  4. Loads plan `FOR UPDATE`: asserts plan exists, `is_active === true`, and `enrolled_from` falls within plan's `effective_from` / `effective_to`.
  5. Evaluates month-level overlap: loads all non-cancelled, non-deleted enrollments for `(user_id, plan_id)`. Checks if any enrollment touches the same calendar month. Throws `409 ENROLLMENT_PERIOD_OVERLAP` if conflict found.
  6. Inserts row into `employee_benefit_enrollments` with `status: 'active'`. (Backed up by PostgreSQL GiST EXCLUDE constraint).
  7. Records audit log `employee_benefit_enrollment.created`.
  8. Commits transaction and returns enrollment.
* **Database Impact:** Inserts 1 row into `employee_benefit_enrollments`; inserts 1 audit log; flags target run for recalculation.
* **Validation Rules:** `enrolled_from` must be valid `YYYY-MM-DD`; overrides must be valid money values.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Employee enrolled in benefit plan",
    "data": {
      "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
      "org_id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
      "plan_id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
      "plan_code": "GHI_GOLD",
      "plan_name": "Gold Family Health Insurance",
      "enrolled_from": "2026-09-01",
      "enrolled_to": null,
      "status": "active",
      "employee_contribution_override": "1000.00",
      "employer_contribution_override": "2000.00",
      "created_at": "2026-09-12T10:15:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `409 ALREADY_ENROLLED`: Employee already holds an active enrollment in this plan.
  - `409 ENROLLMENT_PERIOD_OVERLAP`: Requested start month collides with an existing active or ended enrollment.
  - `422 PERIOD_CLOSED_FOR_ADJUSTMENT`: The payroll run for `enrolled_from` month is already `approved` or `paid`.
  - `422 PLAN_NOT_ENROLLABLE`: Plan is inactive or date falls outside plan validity window.
* **HTTP Status Codes:** `201 Created`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Tenant-scoped HR authority.
* **Idempotency and Retry Behavior:** Protected by unique and exclusion constraints; duplicate requests fail safely with 409.
* **Transactions and Concurrency Behavior:** Strict lock order (Rank-1 run lock before Rank-3 subject lock). Serialized per employee.
* **Side Effects (D-36 No-Proration Rule):** Enrolling on the final day of a month (e.g., September 30) charges the **full monthly premium** for September.
* **Important Edge Cases:** Re-enrolling an employee into a previously ended plan requires setting `enrolled_from` to the 1st of a subsequent, non-overlapping month.
* **Related APIs / Dependencies:** API 140, API 145, API 146.
* **What the API Gives / Does:** Creates an active enrollment, tying the employee to recurring payroll benefit deductions.

---

### API 144: List Plan Enrollments
* **API Name:** List Plan Enrollments
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/benefit-plans/:id/enrollments`
* **Purpose:** Lists all employees enrolled in a specific benefit plan with status filtering and pagination.
* **Business Problem Solved:** Enables policy-level audits, insurer roster reconciliation, and active headcount verification.
* **Why the API Exists:** HR and insurance coordinators need to extract complete member lists for specific insurance policies.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR downloads the member roster for the corporate life insurance policy to reconcile monthly insurance premium invoices.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Plan ID.
  - Query Parameter: `status` (Enum: `'active'` | `'ended'` | `'cancelled'`, Optional).
  - Query Parameter: `page` (Integer, Default: 1).
  - Query Parameter: `limit` (Integer, Default: 20).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Verifies plan exists in org (else `404 PLAN_NOT_FOUND`).
  2. Queries `employee_benefit_enrollments` for `plan_id` and optional `status`.
  3. Returns paginated list of enrollment records.
* **Database Impact:** Read-only query.
* **Validation Rules:** Valid UUID in path; valid status enum if supplied.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Plan enrollments fetched",
    "data": [
      {
        "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
        "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
        "plan_code": "GHI_GOLD",
        "status": "active",
        "enrolled_from": "2026-09-01",
        "enrolled_to": null,
        "employee_contribution_override": null,
        "employer_contribution_override": null
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 20, "total_pages": 1 }
  }
  ```
* **Failure / Error Scenarios:** `404 PLAN_NOT_FOUND` if plan does not exist.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`.
* **Security / Authorization Behavior:** Tenant-scoped.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Preserves history of ended enrollments for audit purposes.
* **Related APIs / Dependencies:** API 140, API 143.
* **What the API Gives / Does:** Returns a paginated roster of employee enrollments for a plan.

---

### API 145: List Employee Benefit Enrollments
* **API Name:** List Employee Benefit Enrollments
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/benefit-enrollments`
* **Purpose:** Retrieves all benefit plan enrollments (active, ended, cancelled) for a specific employee.
* **Business Problem Solved:** Provides HR with an employee-centric view of all corporate benefit coverage and payroll deduction history.
* **Why the API Exists:** Necessary when reviewing an employee's total compensation package or preparing for exit clearance.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR reviews an employee's profile to see all insurance and meal benefit plans they are currently subscribed to.
* **Request Structure and Parameters:**
  - Path Parameter: `userId` (UUID, Required): Employee user ID.
  - Query Parameter: `status` (Enum, Optional).
  - Query Parameter: `plan_id` (UUID, Optional).
  - Query Parameter: `page` (Integer, Default: 1).
  - Query Parameter: `limit` (Integer, Default: 20).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates `userId` parameter.
  2. Queries `employee_benefit_enrollments` for `org_id` and `user_id`.
  3. Returns paginated enrollment records including associated plan metadata.
* **Database Impact:** Read-only query.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Employee benefit enrollments fetched",
    "data": [
      {
        "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
        "plan_id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
        "plan_code": "GHI_GOLD",
        "plan_name": "Gold Family Health Insurance",
        "status": "active",
        "enrolled_from": "2026-09-01",
        "enrolled_to": null
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 20, "total_pages": 1 }
  }
  ```
* **Failure / Error Scenarios:** Validation errors on UUID format.
* **HTTP Status Codes:** `200 OK`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Scoped to tenant.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array if employee has never enrolled in any plan.
* **Related APIs / Dependencies:** API 143, API 146, API 166 (Self View).
* **What the API Gives / Does:** Returns all benefit plan memberships for a specific employee.

---

### API 146: End Employee Benefit Enrollment
* **API Name:** End Employee Benefit Enrollment
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/benefit-enrollments/:enrollmentId/end`
* **Purpose:** Terminates an active employee benefit enrollment on a specified end date.
* **Business Problem Solved:** Enables scheduled or immediate discontinuation of employee benefit coverage due to employee opt-out, policy cancellation, or employee resignation.
* **Why the API Exists:** Provides a formal lifecycle termination endpoint that records termination reasons, audits actors, and ensures deductions cease in future payroll periods.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** An employee opts out of corporate gym membership; HR ends their enrollment effective `2026-09-30`.
* **Request Structure and Parameters:**
  - Path Parameter: `userId` (UUID, Required): Employee ID.
  - Path Parameter: `enrollmentId` (UUID, Required): Enrollment ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "enrolled_to": "2026-09-30",
    "end_reason": "Employee submitted voluntary opt-out request"
  }
  ```
  - `enrolled_to` (Date `YYYY-MM-DD`, Required): Termination date (must be `>= enrolled_from`).
  - `end_reason` (String, Optional): Administrative explanation (max 500 chars).
* **Backend Processing Flow:**
  1. Opens transaction.
  2. Extracts month from `enrolled_to` and acquires Rank-1 run advisory lock (`payroll:run:{orgId}:{month}`) via `assertPeriodOpenForVariablePay`.
  3. Acquires Rank-3 subject advisory lock: `payroll:benefit:{userId}`.
  4. Loads enrollment `FOR UPDATE`: asserts `status === 'active'` and `user_id === userId`.
  5. Asserts `enrolled_to >= enrolled_from` (else `422 INVALID_ENROLLMENT_DATES`).
  6. Updates enrollment: `status = 'ended'`, `enrolled_to`, `ended_by = actorId`, `end_reason`.
  7. Records audit log `employee_benefit_enrollment.ended`.
  8. Commits transaction and returns updated record.
* **Database Impact:** Updates `employee_benefit_enrollments`; inserts 1 audit log; flags boundary run for recalculation.
* **Validation Rules:** `enrolled_to` cannot precede `enrolled_from`; `enrolled_to` month cannot belong to a closed run.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefit enrollment ended",
    "data": {
      "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
      "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
      "status": "ended",
      "enrolled_from": "2026-09-01",
      "enrolled_to": "2026-09-30",
      "end_reason": "Employee submitted voluntary opt-out request"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 ENROLLMENT_NOT_FOUND`: Enrollment does not exist or does not belong to `userId`.
  - `409 ENROLLMENT_NOT_ACTIVE`: Enrollment is already `ended` or `cancelled`.
  - `422 PERIOD_CLOSED_FOR_ADJUSTMENT`: The payroll run for `enrolled_to` month is closed (`approved`/`paid`).
  - `422 INVALID_ENROLLMENT_DATES`: `enrolled_to` is before `enrolled_from`.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Tenant-scoped HR authority.
* **Idempotency and Retry Behavior:** Status-guarded. Repeat calls return `409 ENROLLMENT_NOT_ACTIVE`.
* **Transactions and Concurrency Behavior:** Locked sequence prevents concurrent modification during run calculation.
* **Side Effects (D-36 No-Proration Rule):** An enrollment ended mid-month (e.g., September 15) **still charges the full monthly premium for September**. Zero deductions are made starting October.
* **Important Edge Cases:** Ending an enrollment frees future months from collision, allowing re-enrollment from October 1st onward.
* **Related APIs / Dependencies:** API 143, API 145.
* **What the API Gives / Does:** Terminates the benefit enrollment, establishes coverage close-out, and halts future payroll deductions.

---

### API 147: Attach Form 16 Part A Document (Upload URL / Reference Link)
* **API Name:** Attach Form 16 Part A Document
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/part-a/attachment`
* **Purpose:** Links or uploads the TRACES-issued Form 16 Part A certificate for an employee, completing statutory annual tax certification (**D-29**).
* **Business Problem Solved:** Enables employers to fulfill Indian Income Tax Section 203 statutory obligations by attaching certified TRACES TDS certificates (Part A) alongside system-generated Part B payroll deductions.
* **Why the API Exists:** Part A is generated externally by the government TRACES portal. This endpoint allows HR to either upload the TRACES PDF to S3 or record a secure HTTPS reference URL.
* **Who / Roles are Allowed:** `hr` only.
* **Real-World Usage Scenario:** HR receives signed Form 16 Part A PDFs from the TRACES portal in July and uploads them for each employee to complete their annual tax certificate package.
* **Request Structure and Parameters:**
  - Path Parameter: `userId` (UUID, Required): Employee ID.
  - Path Parameter: `financialYear` (String `YYYY-YY`, Required): Target fiscal year (e.g., `'2025-26'`).
* **Request Payload and Field Meanings:**
  Variant A (S3 Upload Pre-Signed URL):
  ```json
  {
    "file_name": "FORM16_PARTA_PAN_202526.pdf",
    "content_type": "application/pdf",
    "size_bytes": 452100
  }
  ```
  Variant B (External TRACES Reference Link):
  ```json
  {
    "file_name": "FORM16_PARTA_PAN_202526.pdf",
    "reference_url": "https://traces.incometax.gov.in/downloads/parta/doc123.pdf"
  }
  ```
  - Mutually exclusive: requires either `reference_url` OR (`file_name` + `content_type` + `size_bytes`).
  - `reference_url` must be absolute `https://` URL.
* **Backend Processing Flow:**
  1. Validates financial year format and parameters.
  2. Calls `employeeTaxService.ensurePartASummaryId`: gets or creates `employee_tax_summaries` row for `(org_id, user_id, financialYear)`.
  3. If `reference_url` provided: creates `payroll_attachments` row with `storage_backend = 'reference'`, `status = 'available'`, and `confirmed_at = NOW()`.
  4. If S3 upload requested: creates `payroll_attachments` row with `status = 'pending'` and issues pre-signed S3 PUT URL (10-min TTL).
  5. Records audit event (`attachment.reference_linked` or `attachment.upload_url_issued`).
  6. Returns upload instructions or confirmed reference.
* **Database Impact:** Inserts 1 row into `payroll_attachments`; inserts 1 audit log; may insert/update `employee_tax_summaries`.
* **Validation Rules:** Content type must be `'application/pdf'`; size `<= 10MB`; URL must be HTTPS.
* **Success Response Structure (S3 Upload Variant):**
  ```json
  {
    "success": true,
    "message": "Form 16 Part A upload URL issued",
    "data": {
      "attachment_id": "f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c",
      "upload_url": "https://payroll-secure-attachments.s3.ap-south-1.amazonaws.com/org/.../parta.pdf?X-Amz-Signature=...",
      "expires_at": "2026-09-12T10:40:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "452100"
      }
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `422 INVALID_FINANCIAL_YEAR`: FY does not match `YYYY-YY`.
  - `422 ATTACHMENT_TYPE_NOT_ALLOWED`: Non-PDF file submitted.
  - `422 INVALID_ATTACHMENT_REFERENCE_URL`: Non-HTTPS reference URL.
* **HTTP Status Codes:** `201 Created`, `422 Unprocessable Entity`, `503 Service Unavailable`.
* **Security / Authorization Behavior:** HR-only endpoint. Reference URLs must use TLS (`https://`).
* **Idempotency and Retry Behavior:** Upload issuance is non-idempotent (creates new attachment ID). Reference link creation updates pointer.
* **Transactions and Concurrency Behavior:** Atomic creation under transaction.
* **Side Effects:** Form 16 Part B view endpoints (API 114 / API 126) automatically surface `part_a_attachment` metadata once confirmed.
* **Important Edge Cases:** If an existing Part A was previously attached, uploading a new one replaces the active attachment pointer for Form 16 views.
* **Related APIs / Dependencies:** API 114, API 126 (Form 16 View), API 163 (Confirm Upload).
* **What the API Gives / Does:** Completes statutory tax filing compliance by attaching TRACES Form 16 Part A documentation.

---

## 2. Manager Operations APIs — `/api/v1/payroll/manager`
*Auth Stack:* `authenticate` → `authorize(['manager', 'hr'])` → `requireFeature('payroll.access')`

---

### API 148: List Team Reimbursement Claims
* **API Name:** List Team Reimbursement Claims
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/reimbursements/claims`
* **Purpose:** Lists reimbursement claims submitted by a manager's direct and indirect reporting lines, as well as claims currently awaiting this manager's review.
* **Business Problem Solved:** Empowers operational managers to oversee team expense filing, review pending tasks, and verify budget utilization.
* **Why the API Exists:** Implements Tier-A managerial review (**D-13**). Managers need an inbox view of team claims awaiting Level 1 approval.
* **Who / Roles are Allowed:** `manager` (scoped to reporting team) and `hr` (resolves to global scope).
* **Real-World Usage Scenario:** An engineering manager logs into the managerial portal and views 3 pending claims submitted by team members for conference expenses.
* **Request Structure and Parameters:**
  Query parameters (identical filters to API 133):
  - `status`, `user_id`, `category_id`, `payout_period_month`, `current_level`, `created_from`, `created_to`, `page`, `limit`.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Resolves caller's accessible report IDs via `payrollAccess.getAccessibleUserIds`.
  2. If caller is HR on manager route, grants global access; otherwise strictly restrains query to `user_id IN (accessibleUserIds)`.
  3. Queries `reimbursement_claims` for tenant org and report IDs.
  4. Returns paginated team claims envelope.
* **Database Impact:** Read-only query.
* **Validation Rules:** Standard query parameter schema validation.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Team reimbursement claims fetched",
    "data": [
      {
        "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
        "claim_number": "RC-202609-0012",
        "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
        "title": "Client Visit - Bangalore",
        "status": "submitted",
        "total_amount": "8500.00",
        "current_level": 1,
        "total_levels": 2
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 20, "total_pages": 1 }
  }
  ```
* **Failure / Error Scenarios:** Unauthorized role (`403`).
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`.
* **Security / Authorization Behavior:** Enforces reporting hierarchy boundaries server-side.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** A manager with zero direct reports receives `{ total: 0, rows: [] }` without error.
* **Related APIs / Dependencies:** API 149 (Team Claim Detail), API 150 (Approve Claim).
* **What the API Gives / Does:** Returns a paginated queue of team expense claims awaiting managerial action.

---

### API 149: Get Team Reimbursement Claim Detail
* **API Name:** Get Team Reimbursement Claim Detail
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/reimbursements/claims/:id`
* **Purpose:** Retrieves itemized claim details, receipts, and category limit headroom for a specific team member's claim.
* **Business Problem Solved:** Gives managers the necessary evidentiary detail to approve, adjust, or reject team expenses responsibly.
* **Why the API Exists:** Managers must verify receipt validity and view remaining team budget headroom before acting.
* **Who / Roles are Allowed:** `manager` (direct reporting line only) and `hr`.
* **Real-World Usage Scenario:** A manager inspects a team member's hotel bill and verifies that the employee has ₹45,000 remaining in their annual travel limit before approving Level 1.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Resolves caller's accessible user IDs.
  2. Queries claim. If caller is manager, asserts `claim.user_id ∈ accessibleUserIds` (else throws `403 FORBIDDEN`, **EC-24**).
  3. Out-of-scope and non-existent IDs return an identical `403 FORBIDDEN` to prevent ID enumeration.
  4. Loads line items, available attachments, and approval history.
  5. Computes `category_limits[]` headroom.
  6. Returns detail payload.
* **Database Impact:** Read-only queries across claim, items, approvals, and attachments.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  Payload matches API 134 identically, including items, confirmed attachments, approvals, and `category_limits[]`.
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claim belongs to an employee outside the manager's reporting line or does not exist (**EC-24**).
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`.
* **Security / Authorization Behavior:** Scope check precedes existence check; never leaks whether an ID exists outside scope.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** No compensation or salary data is exposed in this payload; managers only see expense receipts and policy limits.
* **Related APIs / Dependencies:** API 150, API 151, API 152.
* **What the API Gives / Does:** Returns full claim inspection payload for a reporting employee.

---

### API 150: Approve Team Reimbursement Claim (Manager Level 1)
* **API Name:** Approve Team Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/manager/reimbursements/claims/:id/approve`
* **Purpose:** Authorizes Level 1 managerial approval on a reporting employee's claim, optionally trimming non-compliant line items (**Tier A, D-13**).
* **Business Problem Solved:** Ensures direct line supervisors validate the business necessity of expenses before claims escalate to HR or finance.
* **Why the API Exists:** Core workflow step in multi-level approval chains. Level 1 approval is manager-authoritative and does not require prior HR sign-off.
* **Who / Roles are Allowed:** `manager` (direct reporting line only) and `hr`.
* **Real-World Usage Scenario:** A manager approves a ₹4,500 software subscription claim submitted by a direct report, advancing the claim to HR review.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:**
  Payload matches API 135:
  ```json
  {
    "items": [
      {
        "item_id": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
        "approved_amount": "4500.00",
        "item_status": "approved",
        "approver_remarks": "Necessary project tool"
      }
    ],
    "remarks": "Verified business use; approved."
  }
  ```
* **Backend Processing Flow:**
  1. Opens transaction. Checks manager authority over claimant (`scope === 'report'`).
  2. Acquires Rank-3 `payroll:claim:{claimId}` lock; loads claim `FOR UPDATE`.
  3. Verifies claim is in `submitted` status and `current_level === 1`.
  4. Verifies pending approval row specifies `approver_role: 'manager'`.
  5. Enforces hard self-approval bar (`acted_by !== claim.user_id`).
  6. Validates approved amounts (`approved_amount <= amount`).
  7. Re-runs category limits against approved amounts.
  8. Updates Level 1 approval row to `status: 'approved'`.
  9. Advances claim: `current_level = 2`, `status = 'under_review'`.
  10. Records audit event `reimbursement_claim.level_approved`.
  11. Commits transaction and returns updated claim.
* **Database Impact:** Updates `reimbursement_claims`, `reimbursement_claim_items`, `reimbursement_approvals`. Inserts audit log.
* **Validation Rules:** Approved amounts cannot exceed claimed amounts.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim approved",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "status": "under_review",
      "current_level": 2,
      "total_levels": 2
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claimant does not report to caller.
  - `403 SELF_APPROVAL_FORBIDDEN`: Manager attempted to approve their own claim.
  - `403 NOT_YOUR_APPROVAL_LEVEL`: Claim is not awaiting Level 1 manager action.
  - `409 CLAIM_NOT_ACTIONABLE`: Claim already approved, rejected, or cancelled.
  - `422 APPROVED_EXCEEDS_CLAIMED`: Item approved amount exceeds expense amount.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Live authority re-resolution (**D-32**). If reporting line shifted after submission, current manager is authorized.
* **Idempotency and Retry Behavior:** Cursor-protected; repeat requests fail safely with `409`.
* **Transactions and Concurrency Behavior:** Locked under claim advisory lock.
* **Side Effects:** Transitions claim to `under_review` and makes it visible in the HR approval queue (API 133).
* **Important Edge Cases:** If `total_levels === 1` (configured in org settings), Level 1 is HR-only and this manager endpoint returns `403 NOT_YOUR_APPROVAL_LEVEL`.
* **Related APIs / Dependencies:** API 149, API 151, API 135 (HR Approval).
* **What the API Gives / Does:** Approves Level 1 and advances the claim to Level 2 (HR).

---

### API 151: Reject Team Reimbursement Claim (Manager Level 1)
* **API Name:** Reject Team Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/manager/reimbursements/claims/:id/reject`
* **Purpose:** Rejects a team member's claim at Level 1, terminating the claim permanently.
* **Business Problem Solved:** Allows direct supervisors to halt non-work-related expenses immediately without escalating to HR.
* **Why the API Exists:** Provides managers with filtering authority to reject unauthorized expense requests.
* **Who / Roles are Allowed:** `manager` (direct reporting line only) and `hr`.
* **Real-World Usage Scenario:** A manager rejects a team member's weekend lunch claim because it was not an authorized client engagement.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "rejection_reason": "Weekend lunch was personal and not pre-approved for client entertainment."
  }
  ```
* **Backend Processing Flow:**
  1. Opens transaction; verifies caller has manager authority over claimant.
  2. Takes Rank-3 `payroll:claim:{claimId}` lock; loads claim `FOR UPDATE`.
  3. Verifies `current_level === 1` and `approver_role === 'manager'`.
  4. Marks Level 1 approval row as `rejected`; marks subsequent levels as `skipped`.
  5. Sets claim items: `approved_amount = 0`, `item_status = 'rejected'`.
  6. Sets claim header: `status = 'rejected'`, `approved_amount = 0`, `finalized_at = NOW()`.
  7. Records audit log `reimbursement_claim.rejected`.
  8. Commits transaction and returns rejected record.
* **Database Impact:** Updates `reimbursement_claims`, child items, and approval rows; inserts audit log.
* **Validation Rules:** `rejection_reason` required.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim rejected",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "status": "rejected",
      "rejection_reason": "Weekend lunch was personal and not pre-approved for client entertainment."
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Out of reporting scope or non-existent claim (**EC-24**).
  - `409 CLAIM_NOT_ACTIONABLE`: Claim already acted upon.
  - `422 REJECTION_REASON_REQUIRED`: Reason omitted.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Scope verification precedes existence check.
* **Idempotency and Retry Behavior:** Cursor-protected.
* **Transactions and Concurrency Behavior:** Locked under claim advisory lock.
* **Side Effects:** Permanently terminates the claim.
* **Important Edge Cases:** A manager rejection is terminal; the claim does not reach HR.
* **Related APIs / Dependencies:** API 149, API 150.
* **What the API Gives / Does:** Rejects the claim at Level 1 and records the justification.

---

### API 152: Get Team Reimbursement Receipt View URL
* **API Name:** Get Team Reimbursement Receipt View URL
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/attachments/:attachmentId/view-url`
* **Purpose:** Issues a temporary pre-signed S3 URL for a manager to view an expense receipt attached to a team member's claim.
* **Business Problem Solved:** Enables managers to inspect receipts attached to expense claims submitted by their reporting staff.
* **Why the API Exists:** Necessary for evidentiary review during managerial approval. Strictly restricted to reimbursement receipts.
* **Who / Roles are Allowed:** `manager` (scoped to report's claim) and `hr`.
* **Real-World Usage Scenario:** A manager clicks "View Receipt" on a travel claim to inspect a taxi fare invoice.
* **Request Structure and Parameters:**
  - Path Parameter: `attachmentId` (UUID, Required): Attachment ID.
  - Query Parameter: `disposition` (Enum: `'inline'` | `'attachment'`, Optional, Default: `'inline'`).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates query parameter. Loads attachment row.
  2. **Strict Secrecy Control (D-28, §6.7):** If `owner_type !== 'reimbursement_claim_item'`, **immediately rejects with `403 FORBIDDEN`**. A manager is categorically locked out of Section 80C investment proofs and Form 16 Part A files.
  3. Loads owning claim item. Verifies claimant is in manager's reporting line or manager is assigned approver.
  4. Generates 5-minute pre-signed S3 GET URL.
  5. Records audit event `attachment.view_url_issued`.
  6. Returns view URL.
* **Database Impact:** Inserts 1 audit log (`attachment.view_url_issued`).
* **Validation Rules:** Valid UUID in path; valid disposition enum.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Attachment view URL issued",
    "data": {
      "view_url": "https://payroll-secure-attachments.s3.ap-south-1.amazonaws.com/org/.../taxi.jpg?X-Amz-Signature=...",
      "expires_at": "2026-09-12T10:45:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Attachment belongs to a non-report, or attachment is an investment proof or Form 16 Part A (**D-28**).
  - `404 ATTACHMENT_NOT_FOUND`: Attachment does not exist or status is not `available`.
  - `503 ATTACHMENT_STORAGE_UNAVAILABLE`: S3 outage.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `404 Not Found`, `503 Service Unavailable`.
* **Security / Authorization Behavior (D-28):** Tax attachments return `403` before existence checks, eliminating side-channel enumeration leaks.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** If a manager tries to view an attachment for an employee who has transferred to another team, access is rejected (`403`).
* **Related APIs / Dependencies:** API 149, API 150.
* **What the API Gives / Does:** Returns a 5-minute pre-signed GET URL for team reimbursement receipts only.

---

### API 153: List Team Benefit Enrollments
* **API Name:** List Team Benefit Enrollments
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/manager/team/benefit-enrollments`
* **Purpose:** Lists benefit plan enrollments for team members, with dynamic privacy masking when compensation viewing is disabled.
* **Business Problem Solved:** Enables managers to track team benefit participation (e.g., health insurance coverage) without violating employee salary privacy policies.
* **Why the API Exists:** Provides team-level visibility into benefit plans. Respects organizational privacy configuration (`manager_can_view_team_compensation`).
* **Who / Roles are Allowed:** `manager` and `hr`.
* **Real-World Usage Scenario:** A manager checks team participation in the company health insurance program. If salary privacy is enforced, the API returns aggregate counts instead of individual contribution amounts.
* **Request Structure and Parameters:**
  - Query Parameter: `status` (Enum: `'active'` | `'ended'`, Optional).
  - Query Parameter: `plan_id` (UUID, Optional).
  - Query Parameter: `page` (Integer, Default: 1).
  - Query Parameter: `limit` (Integer, Default: 20).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Resolves manager's accessible user IDs.
  2. Reads `payroll_settings.manager_can_view_team_compensation` (**D-8**).
  3. **Privacy Masking Flow (EC-25):** If `manager_can_view_team_compensation === false` and caller is not HR:
     - Aggregates enrollments across reports.
     - Returns aggregate headcounts and plan distribution mix. Per-employee contribution amounts are **strictly omitted**.
  4. If compensation view is enabled: returns standard paginated array of employee enrollment records.
* **Database Impact:** Read-only query.
* **Validation Rules:** Valid query parameters.
* **Success Response Structure (Privacy Masked Variant — EC-25):**
  ```json
  {
    "success": true,
    "message": "Team benefit enrollments fetched",
    "data": {
      "aggregates_only": true,
      "headcount": 14,
      "plan_mix": [
        {
          "plan_id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
          "plan_code": "GHI_GOLD",
          "plan_name": "Gold Family Health Insurance",
          "benefit_type": "health_insurance",
          "enrollment_count": 14,
          "employee_count": 14
        }
      ]
    }
  }
  ```
* **Success Response Structure (Full Detail Variant):**
  ```json
  {
    "success": true,
    "message": "Team benefit enrollments fetched",
    "data": {
      "aggregates_only": false,
      "count": 14,
      "rows": [
        {
          "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
          "user_id": "1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c",
          "plan_code": "GHI_GOLD",
          "status": "active",
          "enrolled_from": "2026-09-01",
          "employee_contribution_override": null,
          "employer_contribution_override": null
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:** Unauthorized role (`403`).
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`.
* **Security / Authorization Behavior:** Scoped to manager's reports. Enforces compensation privacy.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Unlike reimbursement claims (which are expense refunds), benefit contributions represent compensation; hence `manager_can_view_team_compensation` strictly gates this endpoint.
* **Related APIs / Dependencies:** API 140, API 145.
* **What the API Gives / Does:** Returns team benefit enrollment details or privacy-preserving aggregated plan mix metrics.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`
*Auth Stack:* `authenticate` → `requireFeature('payroll.access')`  
*(Self-scoped: operations strictly target `req.user.id`; unauthorized access attempts return `403 FORBIDDEN`)*

---

### API 154: Get My Reimbursement Categories & Limit Headroom
* **API Name:** Get My Reimbursement Categories with Limit Headroom
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/categories`
* **Purpose:** Returns the active category catalog augmented with the employee's personal consumed amount and remaining policy limit headroom for the current window.
* **Business Problem Solved:** Eliminates uncertainty and rejected claims by showing employees exactly how much budget they have left to claim in each category *before* they file an expense.
* **Why the API Exists:** Provides real-time self-service limit awareness.
* **Who / Roles are Allowed:** Any authenticated employee with `payroll.access`.
* **Real-World Usage Scenario:** An employee opens the Expense Claim portal to check if they have enough balance left under "Broadband & Mobile" before submitting a ₹2,000 internet bill.
* **Request Structure and Parameters:** None.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Loads all active categories for caller's `orgId`.
  2. Determines current date and financial year boundary using `tax_period.utils.financialYearOf`.
  3. Computes prior approved spend across current month and FY windows for `req.user.id` using `priorSpendMap`.
  4. Runs `computeCategoryLimits` to calculate `consumed` and `remaining` headroom per category.
  5. Returns enriched category catalog.
* **Database Impact:** Read-only queries against `reimbursement_categories` and `reimbursement_claim_items`.
* **Validation Rules:** None.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement categories fetched",
    "data": [
      {
        "category": {
          "id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
          "code": "TRAVEL",
          "name": "Travel & Conveyance",
          "description": "Local and outstation travel",
          "is_taxable": false,
          "requires_receipt": true,
          "receipt_required_above_amount": "500.00",
          "max_amount_per_claim": "10000.00",
          "max_amount_per_period": "100000.00",
          "limit_period": "financial_year"
        },
        "period_key": "2026-27",
        "consumed": "24000.00",
        "remaining": "76000.00"
      },
      {
        "category": {
          "id": "8d9e0f1a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
          "code": "MEALS",
          "name": "Team Meals",
          "limit_period": "month",
          "max_amount_per_period": "5000.00"
        },
        "period_key": "2026-09",
        "consumed": "1500.00",
        "remaining": "3500.00"
      }
    ]
  }
  ```
* **Failure / Error Scenarios:** Auth token missing or expired (`401`).
* **HTTP Status Codes:** `200 OK`, `401 Unauthorized`.
* **Security / Authorization Behavior:** Scoped strictly to `req.user.id`.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** `remaining` is `null` when a category has no period cap. Pending claims are excluded from consumed spend (**§5.1**).
* **Related APIs / Dependencies:** API 155 (Create Claim).
* **What the API Gives / Does:** Returns categories with the employee's personal consumed spend and remaining headroom.

---

### API 155: Create My Draft Reimbursement Claim
* **API Name:** Create My Draft Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims`
* **Purpose:** Creates a new reimbursement claim in `draft` status, optionally adding initial expense line items.
* **Business Problem Solved:** Allows employees to initiate expense filings incrementally, saving line items and attaching receipts over several days before final submission.
* **Why the API Exists:** Provides an authoring workspace where claims can be assembled without triggering immediate approval workflows or policy limit locks.
* **Who / Roles are Allowed:** Any authenticated employee.
* **Real-World Usage Scenario:** An employee returns from a 3-day business trip and creates a draft claim titled "Delhi Client Conference", adding travel and lodging expenses.
* **Request Structure and Parameters:** None.
* **Request Payload and Field Meanings:**
  ```json
  {
    "title": "Delhi Client Conference",
    "items": [
      {
        "category_id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
        "expense_date": "2026-09-08",
        "amount": "4500.00",
        "merchant": "Air India",
        "description": "Flight DEL-BOM",
        "display_order": 0
      }
    ]
  }
  ```
  - `title` (String, Required): Purpose of claim (max 200 chars).
  - `items` (Array of Objects, Optional, Default: `[]`, Max: 100): Initial expense items.
    - `category_id` (UUID, Required): Valid active category.
    - `expense_date` (Date `YYYY-MM-DD`, Required): Date expense was incurred.
    - `amount` (Decimal, Required): Positive expense amount.
    - `merchant` (String, Optional): Vendor name.
    - `description` (String, Optional): Expense explanation.
    - `display_order` (Integer, Optional): UI rendering order.
* **Backend Processing Flow:**
  1. Opens transaction.
  2. Generates new UUID for claim and derives placeholder `DRAFT-{uuid}` claim number.
  3. Loads referenced categories; validates they are active.
  4. Snapshots category attributes (`category_code`, `category_name`, `is_taxable`, `component_id`) onto each line item (**D-31**).
  5. Sums total amount in integer paise.
  6. Inserts `reimbursement_claims` row with `status: 'draft'`, `current_level: 0`, `total_levels: 0`.
  7. Bulk-creates `reimbursement_claim_items`.
  8. Records audit log `reimbursement_claim.created`.
  9. Commits transaction and returns created draft.
* **Database Impact:** Inserts 1 row into `reimbursement_claims`; inserts N rows into `reimbursement_claim_items`; inserts 1 audit log.
* **Validation Rules:** Amounts must be positive numbers; dates must match `YYYY-MM-DD`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim created",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "claim_number": "DRAFT-e4f5a6b7c8d90e1f2a3b4c5d",
      "title": "Delhi Client Conference",
      "status": "draft",
      "total_amount": "4500.00",
      "items": [
        {
          "id": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
          "category_code": "TRAVEL",
          "amount": "4500.00",
          "expense_date": "2026-09-08"
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `422 CATEGORY_NOT_FOUND_OR_INACTIVE`: Referenced category does not exist or is inactive.
  - `422 INVALID_CLAIM_AMOUNT`: Amount is zero or negative.
* **HTTP Status Codes:** `201 Created`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Claimant is automatically assigned as `req.user.id`.
* **Idempotency and Retry Behavior:** Non-idempotent insert; each call creates a new draft.
* **Transactions and Concurrency Behavior:** Atomic creation under transaction.
* **Side Effects:** None on external workflows. Draft claims do not notify managers or consume caps.
* **Important Edge Cases:** Items are optional at creation; employees can create an empty draft and populate lines later via API 158.
* **Related APIs / Dependencies:** API 158 (Replace Items), API 161 (Attach Receipt), API 159 (Submit).
* **What the API Gives / Does:** Initializes a draft claim workspace for the employee.

---

### API 156: List My Reimbursement Claims
* **API Name:** List My Reimbursement Claims
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims`
* **Purpose:** Retrieves a paginated history of all reimbursement claims filed by the authenticated employee.
* **Business Problem Solved:** Enables employees to track the review status, approved amounts, and payout periods of their expense claims.
* **Why the API Exists:** Core self-service tracking view.
* **Who / Roles are Allowed:** Any authenticated employee.
* **Real-World Usage Scenario:** An employee logs in to verify whether their travel claim from last week has been approved by HR.
* **Request Structure and Parameters:**
  - Query Parameter: `status` (Enum, Optional): Filter by status.
  - Query Parameter: `payout_period_month` (String `YYYY-MM`, Optional).
  - Query Parameter: `page` (Integer, Default: 1).
  - Query Parameter: `limit` (Integer, Default: 20).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates query parameters in controller.
  2. Queries `reimbursement_claims` where `org_id = req.user.orgId` AND `user_id = req.user.id`.
  3. Returns paginated list.
* **Database Impact:** Read-only query.
* **Validation Rules:** Valid enum and period parameters.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claims fetched",
    "data": [
      {
        "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
        "claim_number": "RC-202609-0012",
        "title": "Delhi Client Conference",
        "status": "approved",
        "total_amount": "4500.00",
        "approved_amount": "4500.00",
        "payout_period_month": "2026-09",
        "created_at": "2026-09-09T08:00:00.000Z"
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 20, "total_pages": 1 }
  }
  ```
* **Failure / Error Scenarios:** Auth token failure (`401`).
* **HTTP Status Codes:** `200 OK`, `401 Unauthorized`.
* **Security / Authorization Behavior:** Strict self-scoping (`WHERE user_id = req.user.id`).
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Employees can never see claims filed by other employees.
* **Related APIs / Dependencies:** API 157 (Get Claim Detail).
* **What the API Gives / Does:** Returns the employee's personal expense claim history.

---

### API 157: Get My Reimbursement Claim Detail
* **API Name:** Get My Reimbursement Claim Detail
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims/:id`
* **Purpose:** Retrieves full details for a specific claim owned by the caller, including line items, attachments, approval chain progress, and payout settlement state.
* **Business Problem Solved:** Gives employees detailed visibility into approver remarks, trimmed amounts, and receipt attachments for their claim.
* **Why the API Exists:** Provides complete transparency regarding expense claim review status and reasons for line item adjustments.
* **Who / Roles are Allowed:** Any authenticated employee (own claims only).
* **Real-World Usage Scenario:** An employee opens an approved claim to check why their payout amount was ₹500 less than claimed, reading the manager's line-item remark.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Queries `reimbursement_claims` with `id = :id`, `org_id = req.user.orgId`, and `user_id = req.user.id`.
  2. If absent or owned by another user, **immediately throws `403 FORBIDDEN`** (**EC-24**), preventing enumeration.
  3. Loads items, confirmed attachments, and approval progress.
  4. Returns assembled detail payload.
* **Database Impact:** Read-only queries.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim fetched",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "claim_number": "RC-202609-0012",
      "title": "Delhi Client Conference",
      "status": "approved",
      "total_amount": "5000.00",
      "approved_amount": "4500.00",
      "payout_period_month": "2026-09",
      "items": [
        {
          "id": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a",
          "category_name": "Travel & Conveyance",
          "amount": "5000.00",
          "approved_amount": "4500.00",
          "item_status": "approved",
          "approver_remarks": "Trimmed ₹500 personal taxi surcharge",
          "attachments": [
            {
              "id": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
              "file_name": "taxi_bill.pdf",
              "status": "available"
            }
          ]
        }
      ],
      "approvals": [
        {
          "level": 1,
          "approver_role": "manager",
          "status": "approved",
          "remarks": "Approved with personal surcharge trimmed"
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claim does not exist or belongs to another user (**EC-24**).
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`.
* **Security / Authorization Behavior:** Scope resolved in WHERE clause; foreign IDs return indistinguishable 403.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** Category limit headroom (`category_limits[]`) is omitted from the employee view to keep response concise; limit awareness is served via API 154.
* **Related APIs / Dependencies:** API 156, API 158, API 160.
* **What the API Gives / Does:** Returns complete claim status, itemized decisions, and attached receipts for an employee's claim.

---

### API 158: Replace My Draft Claim Items
* **API Name:** Replace My Draft Claim Items
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims/:id`
* **Purpose:** Completely replaces the item set of an existing `draft` claim and optionally updates the claim title.
* **Business Problem Solved:** Allows employees to edit, reorder, add, or remove line items while preparing an expense filing.
* **Why the API Exists:** Standard draft editing mechanism. Employs wholesale replacement (matching the tax declaration pattern) to prevent partial update inconsistencies.
* **Who / Roles are Allowed:** Any authenticated employee (own draft claims only).
* **Real-World Usage Scenario:** An employee realizes they entered an incorrect amount on a draft claim line; they submit the corrected item array before finalizing.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "title": "Delhi Conference & Client Dinner",
    "items": [
      {
        "category_id": "7c8e9f0a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
        "expense_date": "2026-09-08",
        "amount": "4500.00",
        "merchant": "Air India"
      },
      {
        "category_id": "8d9e0f1a-2b3c-4d5e-6f7a-8b9c0d1e2f3a",
        "expense_date": "2026-09-09",
        "amount": "1800.00",
        "merchant": "Barbeque Nation"
      }
    ]
  }
  ```
  - `items` (Array of Objects, Required, Max: 100): Complete replacement set of items.
* **Backend Processing Flow:**
  1. Opens transaction. Acquires Rank-3 `payroll:claim:{claimId}` advisory lock.
  2. Queries claim where `id = :id` AND `user_id = req.user.id` `FOR UPDATE`. Throws `403` if not owned/absent.
  3. Asserts `claim.status === 'draft'` (else `409 CLAIM_NOT_DRAFT`).
  4. Loads existing claim items; soft-deletes them.
  5. **Orphaned Receipt Clean-up:** Marks existing attachments belonging to the deleted items as `deleted` in `payroll_attachments` to prevent orphaned available attachments (§11 item 6).
  6. Loads referenced categories; validates active status and snapshots behavior.
  7. Inserts new line items; recomputes `total_amount`. Updates claim header.
  8. Records audit log `reimbursement_claim.items_replaced`.
  9. Commits transaction and returns updated claim.
* **Database Impact:** Soft-deletes previous items; soft-deletes attached receipts; inserts new items; updates claim header; inserts audit log.
* **Validation Rules:** `items` array must be provided; amounts must be positive numbers.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim items replaced",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "title": "Delhi Conference & Client Dinner",
      "status": "draft",
      "total_amount": "6300.00",
      "items": [
        { "id": "uuid-1", "category_code": "TRAVEL", "amount": "4500.00" },
        { "id": "uuid-2", "category_code": "MEALS", "amount": "1800.00" }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claim not found or not owned by caller (**EC-24**).
  - `409 CLAIM_NOT_DRAFT`: Attempted to modify a claim that has already been `submitted` or `approved`.
  - `422 CATEGORY_NOT_FOUND_OR_INACTIVE`: One or more categories do not exist or are inactive.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Scoped to owner. Only draft claims can be edited.
* **Idempotency and Retry Behavior:** Replaces entire item collection under claim advisory lock.
* **Transactions and Concurrency Behavior:** Locked under `payroll:claim:{claimId}`.
* **Side Effects:** Replaced items take their previous receipt attachments with them (marked `deleted`). The claimant re-uploads receipts against the new line item IDs.
* **Important Edge Cases:** Sending an empty items array `{ "items": [] }` wipes all items and resets `total_amount` to `0.00`.
* **Related APIs / Dependencies:** API 155, API 161 (Attach Receipt), API 159 (Submit).
* **What the API Gives / Does:** Replaces the draft claim's items and recalculates total amount.

---

### API 159: Submit My Draft Reimbursement Claim
* **API Name:** Submit My Draft Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims/:id/submit`
* **Purpose:** Submits a `draft` claim into the formal approval workflow, freezing the approval chain, assigning a sequential human claim number, and strictly enforcing receipt requirements and category limits.
* **Business Problem Solved:** Serves as the critical integrity checkpoint ensuring incomplete, undocumented, or over-budget claims cannot enter the managerial approval pipeline.
* **Why the API Exists:** Transitions a draft workspace into an active financial claim, materializing the immutable approval chain and locking the claim number.
* **Who / Roles are Allowed:** Any authenticated employee (own draft claims only).
* **Real-World Usage Scenario:** After attaching all required flight and hotel invoices, an employee clicks "Submit Claim". The system verifies receipts, confirms budget headroom, assigns `RC-202609-0012`, and routes it to their manager.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Opens transaction. Acquires Rank-3 `payroll:claim:{claimId}` advisory lock.
  2. Queries claim where `id = :id` AND `user_id = req.user.id` `FOR UPDATE`.
  3. Asserts `claim.status === 'draft'` (else `409 CLAIM_NOT_DRAFT`).
  4. Loads line items: asserts `items.length > 0` (else `422 CLAIM_HAS_NO_ITEMS`).
  5. **Receipt Enforcement (§7.2):** For every item whose live category has `requires_receipt = true` and `amount > receipt_required_above_amount` (or always if threshold is null), queries `payroll_attachments`. Asserts item has ≥ 1 attachment with `status = 'available'`. Throws `422 RECEIPT_REQUIRED` naming the item if missing.
  6. **Limit Enforcement (§5.1):** Reads prior approved spend under transaction via `priorSpendMap`. Runs `checkClaimLimits` across per-claim caps and bucketed `(category, period_key)` per-period caps. Throws `422 CATEGORY_LIMIT_EXCEEDED` with violation breakdown if cap breached.
  7. **Approval Chain Materialization (D-32, §5.2):** Calls `approval_chain.utils.resolveApprover` and pure `buildChain`:
     - Normalizes any escalated role to `hr`.
     - Collapses chain to 1 level (`hr`) if no manager exists or manager is claimant.
     - Freezes `total_levels` and bulk-creates `reimbursement_approvals` rows.
  8. **Sequential Claim Number Assignment:** Queries monthly count for `RC-YYYYMM-` prefix and assigns `RC-YYYYMM-NNNN`. Retries once on unique collision.
  9. Updates claim: `status = 'submitted'`, `current_level = 1`, `total_levels`, `submitted_at = NOW()`.
  10. Records audit event `reimbursement_claim.submitted`.
  11. Commits transaction and returns submitted claim.
* **Database Impact:** Inserts N rows into `reimbursement_approvals`; updates `reimbursement_claims`; inserts audit log.
* **Validation Rules:** Must have at least 1 item; all receipt and limit policies must pass.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim submitted",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "claim_number": "RC-202609-0012",
      "status": "submitted",
      "total_amount": "6300.00",
      "current_level": 1,
      "total_levels": 2,
      "submitted_at": "2026-09-12T11:00:00.000Z",
      "approvals": [
        {
          "level": 1,
          "approver_role": "manager",
          "assigned_approver_id": "5a6b7c8d-9e0f-1a2b-3c4d-5e6f7a8b9c0d",
          "status": "pending"
        },
        {
          "level": 2,
          "approver_role": "hr",
          "assigned_approver_id": null,
          "status": "pending"
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claim not found or not owned by caller.
  - `409 CLAIM_NOT_DRAFT`: Claim already submitted or cancelled.
  - `422 CLAIM_HAS_NO_ITEMS`: Attempted to submit a claim with zero items.
  - `422 RECEIPT_REQUIRED`: One or more items lack a confirmed (`available`) attachment.
  - `422 CATEGORY_LIMIT_EXCEEDED`: Claim breaches category per-claim or per-period spending cap.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Self-approval is structurally prevented; chain never assigns claimant as approver.
* **Idempotency and Retry Behavior:** Status-guarded. Bounded single retry on claim number race.
* **Transactions and Concurrency Behavior:** Locked under `payroll:claim:{claimId}`.
* **Side Effects:** Enters the claim into the manager's pending queue (API 148).
* **Important Edge Cases:** Unconfirmed (`pending`) attachments do **not** satisfy receipt enforcement. Attachments must be confirmed via API 163 prior to submission.
* **Related APIs / Dependencies:** API 155, API 158, API 161, API 163, API 148.
* **What the API Gives / Does:** Submits the claim, assigns human reference number, materializes the approval chain, and advances status to `submitted`.

---

### API 160: Cancel My Reimbursement Claim
* **API Name:** Cancel My Reimbursement Claim
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims/:id/cancel`
* **Purpose:** Allows a claimant to withdraw their claim while in `draft`, `submitted`, or `under_review` status (**§7.4a**).
* **Business Problem Solved:** Eliminates administrative friction by enabling employees to retract mistaken submissions without requiring managers or HR to formally reject them.
* **Why the API Exists:** Provides employees with a self-service cancellation mechanism that preserves audit history without leaving zombie claims in approver queues.
* **Who / Roles are Allowed:** Any authenticated employee (own claims only).
* **Real-World Usage Scenario:** An employee submits a claim and immediately notices they attached the wrong hotel bill. They cancel the claim, edit it, and re-file.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "cancellation_reason": "Attached wrong invoice; will re-submit with correct billing"
  }
  ```
  - `cancellation_reason` (String, Optional): Explanation for withdrawal (max 500 chars).
* **Backend Processing Flow:**
  1. Opens transaction. Acquires Rank-3 `payroll:claim:{claimId}` advisory lock.
  2. Loads claim `FOR UPDATE` asserting `user_id === req.user.id`.
  3. Asserts `claim.status ∈ {'draft', 'submitted', 'under_review'}` (else `409 CLAIM_NOT_CANCELLABLE`).
  4. Updates pending approval rows in `reimbursement_approvals` to `status: 'skipped'`. Approved level rows are preserved for audit integrity.
  5. Updates claim header: `status = 'cancelled'`, `cancellation_reason`, `finalized_at = NOW()`.
  6. Records audit log `reimbursement_claim.cancelled`.
  7. Commits transaction and returns cancelled record.
* **Database Impact:** Updates `reimbursement_claims`; updates pending rows in `reimbursement_approvals`; inserts audit log.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reimbursement claim cancelled",
    "data": {
      "id": "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
      "status": "cancelled",
      "cancellation_reason": "Attached wrong invoice; will re-submit with correct billing",
      "finalized_at": "2026-09-12T11:15:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claim not owned by caller or absent.
  - `409 CLAIM_NOT_CANCELLABLE`: Claim is already `approved`, `processed`, `rejected`, or `cancelled`.
* **HTTP Status Codes:** `200 OK`, `403 Forbidden`, `409 Conflict`.
* **Security / Authorization Behavior:** Self-scoped.
* **Idempotency and Retry Behavior:** Status-guarded.
* **Transactions and Concurrency Behavior:** Claim advisory lock serializes cancel-vs-approve races. If manager approves concurrently, winner commits and loser receives 409.
* **Side Effects:** Removes the claim from manager and HR review queues.
* **Important Edge Cases:** Cancelling from `under_review` (after Level 1 has approved) is safe and supported: Level 1 approval records are preserved for audit, but the claim never reaches a payroll run (**§7.4a**).
* **Related APIs / Dependencies:** API 155, API 157, API 159.
* **What the API Gives / Does:** Cancels the claim, marks pending approval levels as skipped, and terminates workflow.

---

### API 161: Request Receipt Upload URL for Claim Item
* **API Name:** Request Receipt Upload URL for Claim Item
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/reimbursements/claims/:id/items/:itemId/attachments`
* **Purpose:** Generates a pre-signed AWS S3 `PUT` URL for uploading an expense receipt document directly to S3 against a draft claim item (**§5.4**).
* **Business Problem Solved:** Enables high-performance, secure binary uploads without loading file data into the Node.js API memory or blocking the event loop.
* **Why the API Exists:** First step in the three-stage attachment protocol (Issue URL → Client Upload to S3 → Confirm).
* **Who / Roles are Allowed:** Any authenticated employee (own draft claims only).
* **Real-World Usage Scenario:** An employee selects a flight expense item on a draft claim and uploads the airline PDF ticket from their local machine.
* **Request Structure and Parameters:**
  - Path Parameter: `id` (UUID, Required): Claim ID.
  - Path Parameter: `itemId` (UUID, Required): Claim line item ID.
* **Request Payload and Field Meanings:**
  ```json
  {
    "file_name": "indigo_flight_receipt.pdf",
    "content_type": "application/pdf",
    "size_bytes": 245000
  }
  ```
  - `file_name` (String, Required): Original filename (max 255 chars).
  - `content_type` (Enum, Required): `'image/jpeg'`, `'image/png'`, `'image/webp'`, `'application/pdf'`. **`image/svg+xml` is strictly forbidden to prevent stored XSS.**
  - `size_bytes` (Integer, Required): Exact file size in bytes (`1–10485760`, max 10MB).
* **Backend Processing Flow:**
  1. Validates payload against content-type allow-list.
  2. Opens transaction. Asserts claim item belongs to caller and parent claim is in `draft` status (else `409 CLAIM_NOT_DRAFT`).
  3. Generates attachment UUID and constructs isolated S3 key: `org/{orgId}/reimbursement_claim_item/{itemId}/{attachmentId}` (**§5.4**).
  4. Inserts row into `payroll_attachments` with `status: 'pending'`.
  5. Generates pre-signed S3 PUT URL (600s / 10-min TTL) cryptographically binding `Content-Type` and `Content-Length`.
  6. Records audit event `attachment.upload_url_issued`.
  7. Commits transaction and returns upload URL and required headers.
* **Database Impact:** Inserts 1 row into `payroll_attachments`; inserts 1 audit log.
* **Validation Rules:** Content type allow-list strictly enforced; size <= 10MB.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Receipt upload URL issued",
    "data": {
      "attachment_id": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
      "upload_url": "https://payroll-secure-attachments.s3.ap-south-1.amazonaws.com/org/4a5b.../8a9b...pdf?X-Amz-Signature=...",
      "expires_at": "2026-09-12T11:25:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "245000"
      }
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Claim item does not exist or belongs to another user.
  - `409 CLAIM_NOT_DRAFT`: Parent claim is already submitted or approved.
  - `422 ATTACHMENT_TYPE_NOT_ALLOWED`: Invalid or disallowed MIME type (e.g., SVG, EXE, ZIP).
  - `503 ATTACHMENT_STORAGE_UNAVAILABLE`: S3 service failure.
* **HTTP Status Codes:** `201 Created`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`, `503 Service Unavailable`.
* **Security / Authorization Behavior:** S3 signature enforces exact file size and MIME type. Tampering with headers on PUT causes S3 to reject upload.
* **Idempotency and Retry Behavior:** Issues fresh pre-signed URL on each invocation.
* **Transactions and Concurrency Behavior:** Atomic row insertion under transaction.
* **Side Effects:** Row remains `pending` and is invisible to receipt rules until confirmed via API 163.
* **Important Edge Cases:** `file_name` is never used as an S3 key path component, neutralizing directory traversal attacks.
* **Related APIs / Dependencies:** API 158, API 163 (Confirm Upload).
* **What the API Gives / Does:** Issues a 10-minute pre-signed PUT URL binding size and MIME type for client-to-S3 upload.

---

### API 162: Request Investment Proof Upload URL for Declaration Item
* **API Name:** Request Investment Proof Upload URL for Declaration Item
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/tax/declarations/items/:itemId/attachments`
* **Purpose:** Generates a pre-signed S3 PUT URL for uploading Section 80C/80D investment proofs against a declaration item (**D-29, Phase 4/5 integration**).
* **Business Problem Solved:** Closes the longstanding Phase 4 document capability gap, allowing employees to attach supporting PDFs/images directly to submitted tax declaration lines without reopening the declaration.
* **Why the API Exists:** Parallels API 161 for the tax declaration domain (`owner_type: 'investment_declaration_item'`).
* **Who / Roles are Allowed:** Any authenticated employee.
* **Real-World Usage Scenario:** An employee receives their annual LIC premium receipt in February and uploads it against their Phase 4 tax declaration Section 80C line.
* **Request Structure and Parameters:**
  - Path Parameter: `itemId` (UUID, Required): Tax declaration line item ID.
* **Request Payload and Field Meanings:**
  Payload matches API 161 (`file_name`, `content_type`, `size_bytes`).
* **Backend Processing Flow:**
  1. Validates content type against allow-list.
  2. Opens transaction. Verifies `itemId` belongs to caller and parent declaration is in `draft`, `submitted`, or `under_review` status (else `409 DECLARATION_NOT_OPEN_FOR_PROOF`).
  3. Rejects upload if declaration item is already `verified` or `rejected`.
  4. Generates attachment ID and S3 key: `org/{orgId}/investment_declaration_item/{itemId}/{attachmentId}`.
  5. Inserts `pending` row into `payroll_attachments`.
  6. Generates pre-signed S3 PUT URL (10-min TTL).
  7. Records audit log `attachment.upload_url_issued`.
  8. Commits transaction and returns URL.
* **Database Impact:** Inserts 1 row into `payroll_attachments`; inserts 1 audit log.
* **Validation Rules:** Content type must be allowed MIME type; size <= 10MB.
* **Success Response Structure:**
  Matches API 161 (`attachment_id`, `upload_url`, `expires_at`, `required_headers`).
* **Failure / Error Scenarios:**
  - `403 FORBIDDEN`: Declaration item does not belong to caller.
  - `409 DECLARATION_NOT_OPEN_FOR_PROOF`: Declaration is closed, finalized, or verified.
  - `422 ATTACHMENT_TYPE_NOT_ALLOWED`: Invalid MIME type.
* **HTTP Status Codes:** `201 Created`, `403 Forbidden`, `409 Conflict`, `422 Unprocessable Entity`.
* **Security / Authorization Behavior:** Self-scoped. Enforces declaration status window (**Phase 4 API 127 precedent**).
* **Idempotency and Retry Behavior:** Issues fresh signed URL.
* **Transactions and Concurrency Behavior:** Atomic insert under transaction.
* **Side Effects:** Does not alter declared money amounts or declaration status.
* **Important Edge Cases:** Proofs can be uploaded while declaration is in `submitted` status without forcing HR to reopen the declaration.
* **Related APIs / Dependencies:** Phase 4 API 123 (Declarations), API 163 (Confirm Upload), API 137 (HR View).
* **What the API Gives / Does:** Issues a pre-signed upload URL for tax declaration proof documents.

---

### API 163: Confirm My Attachment Upload
* **API Name:** Confirm My Attachment Upload
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/attachments/:attachmentId/confirm`
* **Purpose:** Verifies that a file was successfully uploaded to S3 and transitions its status from `pending` to `available` (**§5.4**).
* **Business Problem Solved:** Prevents ghost or unverified uploads from fulfilling receipt requirements by independently querying AWS S3 `HeadObject` before marking documents active.
* **Why the API Exists:** Crucial second step in the pre-signed upload protocol. Guarantees that clients cannot claim a receipt exists without actually transmitting the file to S3.
* **Who / Roles are Allowed:** Any authenticated employee (own attachments only).
* **Real-World Usage Scenario:** Immediately after the client browser finishes the direct S3 `PUT` upload of an expense receipt, the web app calls this endpoint to confirm and activate the document.
* **Request Structure and Parameters:**
  - Path Parameter: `attachmentId` (UUID, Required): Attachment ID.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Loads attachment by `id` and `orgId`. Asserts `user_id === req.user.id` (else `404 ATTACHMENT_NOT_FOUND`, **EC-24**).
  2. If already `status === 'available'`, returns existing row immediately (idempotent retry).
  3. Asserts `status === 'pending'`.
  4. Calls AWS S3 `headObject` (with 3-second timeout, no retries) outside transaction:
     - Verifies object exists in bucket.
     - Verifies S3 `ContentLength === size_bytes`.
     - Verifies S3 `ContentType` matches declared `content_type`.
  5. If verification fails (size/type mismatch or missing object): records audit log `attachment.verification_failed` and throws `422 ATTACHMENT_VERIFICATION_FAILED`. Row remains `pending`.
  6. Opens database transaction; acquires pessimistic row lock `FOR UPDATE`.
  7. Extracts ETag: if single-part MD5 (no `-N` multipart suffix), stores as `checksum_sha256`; otherwise stores `null`.
  8. Updates attachment: `status = 'available'`, `confirmed_at = NOW()`, `checksum_sha256`.
  9. Records audit log `attachment.confirmed`.
  10. Commits transaction and returns confirmed record.
* **Database Impact:** Updates `payroll_attachments.status = 'available'`; inserts 1 audit log.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Attachment confirmed",
    "data": {
      "id": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
      "file_name": "indigo_flight_receipt.pdf",
      "content_type": "application/pdf",
      "size_bytes": 245000,
      "status": "available",
      "confirmed_at": "2026-09-12T11:26:30.000Z",
      "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 ATTACHMENT_NOT_FOUND`: Attachment does not exist or belongs to another employee.
  - `422 ATTACHMENT_VERIFICATION_FAILED`: S3 `HeadObject` comparison failed (wrong size, mismatched MIME type, or file never uploaded).
  - `503 ATTACHMENT_STORAGE_UNAVAILABLE`: Network timeout or S3 service failure.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `422 Unprocessable Entity`, `503 Service Unavailable`.
* **Security / Authorization Behavior:** Verification independent of client assertions; inspects actual S3 metadata.
* **Idempotency and Retry Behavior:** Fully idempotent. Calling confirm on an already-available attachment returns 200 without re-running `HeadObject`.
* **Transactions and Concurrency Behavior:** Row-level lock prevents race conditions during concurrent confirmations.
* **Side Effects:** Enables the attachment to satisfy claim receipt enforcement (API 159).
* **Important Edge Cases:** Multipart uploads with `-N` ETags store `checksum_sha256 = null` rather than storing an invalid non-MD5 checksum.
* **Related APIs / Dependencies:** API 161, API 162, API 159.
* **What the API Gives / Does:** Validates upload against S3 and marks the document `available`.

---

### API 164: Delete My Attachment
* **API Name:** Delete My Attachment
* **HTTP Method:** `DELETE`
* **Endpoint:** `/api/v1/payroll/me/attachments/:attachmentId`
* **Purpose:** Soft-deletes an uploaded attachment (`status = 'deleted'`) owned by the caller.
* **Business Problem Solved:** Enables employees to remove incorrect or accidental document uploads while preserving audit trails and S3 versioning recovery.
* **Why the API Exists:** Provides self-service cleanup while enforcing strict lifecycle gates based on the owning entity's review status.
* **Who / Roles are Allowed:** Any authenticated employee (own attachments only).
* **Real-World Usage Scenario:** An employee accidentally uploads an electric bill instead of a travel receipt and deletes it while their claim is still in `draft`.
* **Request Structure and Parameters:**
  - Path Parameter: `attachmentId` (UUID, Required): Attachment ID.
* **Request Payload and Field Meanings:** None.
* **Backend Processing Flow:**
  1. Opens transaction. Loads attachment row `FOR UPDATE` asserting `user_id === req.user.id`. Throws `404` if absent or not owned.
  2. If already `status === 'deleted'`, returns immediately (idempotent).
  3. **Lifecycle State Gate (§5.4):**
     - If `owner_type === 'reimbursement_claim_item'`: verifies parent claim is in `draft` status (else `409 CLAIM_NOT_DRAFT`).
     - If `owner_type === 'investment_declaration_item'`: verifies parent declaration is not `verified` or `rejected` (else `409 ATTACHMENT_NOT_DELETABLE`).
     - If `owner_type === 'form16_part_a'`: **always rejects with `409 ATTACHMENT_NOT_DELETABLE`** (employees cannot delete HR-issued Form 16 documents).
  4. Updates `payroll_attachments.status = 'deleted'`.
  5. Records audit log `attachment.deleted`.
  6. Commits transaction.
* **Database Impact:** Updates `payroll_attachments.status = 'deleted'`; inserts 1 audit log.
* **Validation Rules:** Valid UUID in path.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Attachment deleted",
    "data": {
      "id": "8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
      "status": "deleted"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 ATTACHMENT_NOT_FOUND`: Attachment does not exist or belongs to another user.
  - `409 CLAIM_NOT_DRAFT`: Attempted to delete a receipt for a claim that has already been submitted or approved.
  - `409 ATTACHMENT_NOT_DELETABLE`: Document cannot be deleted due to lock rules.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `409 Conflict`.
* **Security / Authorization Behavior:** Self-scoped.
* **Idempotency and Retry Behavior:** Idempotent; duplicate deletes return 200.
* **Transactions and Concurrency Behavior:** Locked under attachment row lock.
* **Side Effects:** Deleted attachment can no longer satisfy receipt enforcement.
* **Important Edge Cases:** Soft deletion does not immediately issue an S3 `DeleteObject`; files remain in S3 under versioning for compliance and are swept during Phase 7 retention cycles.
* **Related APIs / Dependencies:** API 161, API 163.
* **What the API Gives / Does:** Soft-deletes the attachment row and terminates its availability.

---

### API 165: Get My Attachment View URL
* **API Name:** Get My Attachment View URL
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/attachments/:attachmentId/view-url`
* **Purpose:** Issues a 5-minute pre-signed GET URL for an employee to view their own confirmed attachment in the browser or download it.
* **Business Problem Solved:** Allows employees to inspect their uploaded receipts, declaration proofs, and Form 16 Part A certificates securely.
* **Why the API Exists:** Self-service document retrieval endpoint.
* **Who / Roles are Allowed:** Any authenticated employee (own attachments only).
* **Real-World Usage Scenario:** An employee clicks on an attached receipt in their claim history to verify that the uploaded image is clear and legible.
* **Request Structure and Parameters:**
  - Path Parameter: `attachmentId` (UUID, Required): Attachment ID.
  - Query Parameter: `disposition` (Enum: `'inline'` | `'attachment'`, Optional, Default: `'inline'`).
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Validates `disposition` parameter. Loads attachment by ID and org.
  2. Asserts `status === 'available'` (else `404 ATTACHMENT_NOT_FOUND`).
  3. Asserts owning entity belongs to `req.user.id` (else `404 ATTACHMENT_NOT_FOUND`, **EC-24**).
  4. If `storage_backend === 'reference'`, returns external HTTPS URL directly.
  5. Generates pre-signed S3 GET URL with 300-second (5-min) TTL, pinning `ResponseContentType` and sanitizing `ResponseContentDisposition`.
  6. Records audit event `attachment.view_url_issued`.
  7. Returns view URL.
* **Database Impact:** Inserts 1 audit log (`attachment.view_url_issued`).
* **Validation Rules:** Valid UUID; valid disposition enum.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Attachment view URL issued",
    "data": {
      "view_url": "https://payroll-secure-attachments.s3.ap-south-1.amazonaws.com/org/.../ticket.pdf?X-Amz-Signature=...",
      "expires_at": "2026-09-12T11:35:00.000Z"
    }
  }
  ```
* **Failure / Error Scenarios:**
  - `404 ATTACHMENT_NOT_FOUND`: Attachment does not exist, belongs to another employee, or is not in `available` status.
  - `503 ATTACHMENT_STORAGE_UNAVAILABLE`: S3 service failure.
* **HTTP Status Codes:** `200 OK`, `404 Not Found`, `503 Service Unavailable`.
* **Security / Authorization Behavior:** Out-of-scope and non-existent IDs return identical 404s.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** If the attachment is a Form 16 Part A document attached by HR (API 147), the employee is authorized to view it here via `owner_type: 'form16_part_a'`.
* **Related APIs / Dependencies:** API 157, API 163, API 164.
* **What the API Gives / Does:** Returns a 5-minute pre-signed S3 view URL for an employee's personal document.

---

### API 166: Get My Benefit Enrollments & Deductions Breakdown
* **API Name:** Get My Benefit Enrollments & Deductions Breakdown
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/benefits`
* **Purpose:** Retrieves all active and historical benefit plan enrollments for the authenticated employee, alongside the cumulative year-to-date (YTD) benefit deductions withheld in the current financial year.
* **Business Problem Solved:** Delivers total transparency regarding employee benefit subscriptions, monthly premium deductions, employer contributions, and cumulative fiscal year withholdings.
* **Why the API Exists:** Employees need a dedicated view to check their corporate insurance policies and verify how much has been deducted from their paychecks across the year.
* **Who / Roles are Allowed:** Any authenticated employee.
* **Real-World Usage Scenario:** An employee logs into the benefits portal in January to review their health and accident insurance coverage and see that ₹9,600 has been deducted year-to-date.
* **Request Structure and Parameters:** None.
* **Request Payload and Field Meanings:** None (GET request).
* **Backend Processing Flow:**
  1. Resolves current fiscal year based on org settings (`financial_year_start_month`).
  2. Queries `employee_benefit_enrollments` for `req.user.id` joined to `benefit_plans`.
  3. Calculates effective monthly contributions per enrollment (applying overrides where present).
  4. Queries `payroll_run_items` joined to `payroll_runs`: sums `benefit_employee_amount` across all `approved` and `paid` runs for this employee in the current FY months. (Calculated WIP runs are strictly excluded).
  5. Returns enrollment list and cumulative FY deducted total.
* **Database Impact:** Read-only queries against `employee_benefit_enrollments` and `payroll_run_items`.
* **Validation Rules:** None.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Benefits fetched",
    "data": {
      "financial_year": "2026-27",
      "fy_total_employee_deducted": "9600.00",
      "enrollment_count": 1,
      "enrollments": [
        {
          "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
          "plan": {
            "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
            "code": "GHI_GOLD",
            "name": "Gold Family Health Insurance",
            "benefit_type": "health_insurance"
          },
          "status": "active",
          "enrolled_from": "2026-04-01",
          "enrolled_to": null,
          "employee_contribution": "1200.00",
          "employer_contribution": "1800.00",
          "contribution_is_overridden": false
        }
      ]
    }
  }
  ```
* **Failure / Error Scenarios:** Auth failure (`401`).
* **HTTP Status Codes:** `200 OK`, `401 Unauthorized`.
* **Security / Authorization Behavior:** Scoped strictly to `req.user.id`.
* **Idempotency and Retry Behavior:** Safe idempotent read.
* **Transactions and Concurrency Behavior:** None.
* **Side Effects:** None.
* **Important Edge Cases:** `fy_total_employee_deducted` reads strictly from finalized (`approved` or `paid`) payroll runs. A recalculating or draft run never leaks into this figure.
* **Related APIs / Dependencies:** API 143, API 145, API 56 (Self Payslip).
* **What the API Gives / Does:** Returns an itemized breakdown of personal benefit enrollments and verified year-to-date payroll deduction totals.

---

## 4. Cross-Phase Augmented Endpoints (No New Numbers)

Phase 5 additively extends several existing endpoints from Phases 2, 3, and 4 to incorporate reimbursement and benefit data without breaking backwards compatibility:

| API # | Existing Endpoint | Phase 5 Additive Enhancements |
|---|---|---|
| **#37** | `GET /api/v1/payroll/hr/runs/eligibility` | Returns a new `payouts` block: `{ approved_claims_count, approved_claims_total, claims_awaiting_approval_count, benefit_deductions_enabled, active_enrollment_count, benefit_employee_total, benefit_employer_total }`. Serves as the pre-flight readiness check before executing a run. |
| **#42** | `GET /api/v1/payroll/hr/runs/:id/preview` | Returns aggregated run payouts: `{ reimbursement_total, reimbursement_item_count, taxable_reimbursement_total, benefit_employee_total, benefit_employer_total }`. |
| **#44** | `GET /api/v1/payroll/hr/runs/:id/items/:itemId` | Carries the 3 new engine-owned columns (`reimbursement_amount`, `benefit_employee_amount`, `benefit_employer_amount`) and component breakdown lines for `reimbursement` and `benefit`. |
| **#53–#56** | Payslip List & Detail (Manager & Self) | `reimbursement_amount` appears on list rows. Payslip detail includes dedicated `reimbursements[]` (category, claim number, amount) and `benefits[]` (plan name, employee deduction, employer contribution) itemized blocks. Net pay explanations clearly indicate reimbursements are included in net credit but excluded from gross earnings. |
| **#106** | `GET /api/v1/payroll/hr/tax/declarations/:id` | Each Chapter VI-A declaration item gains an `attachments[]` array containing confirmed (`available`) investment proof documents, allowing HR verifiers to open proofs via API 137 during verification. |
| **#114 / #126** | Form 16 Part B Payloads | Automatically surfaces `part_a_attachment: { attachment_id, file_name, storage_backend }` when HR has linked or uploaded a TRACES Part A document via API 147. |

---

## 5. Summary Coverage Audit & Master Matrix

### Master Endpoint Registry Matrix (APIs #128–#166)

| # | HTTP Method | Endpoint Route | Allowed Roles | Lock Order | Idempotent | Primary Database Impact |
|:---:|:---:|---|:---:|:---:|:---:|---|
| **128** | `POST` | `/reimbursements/categories` | `hr` | DB Txn | No | `reimbursement_categories` (Insert) |
| **129** | `GET` | `/reimbursements/categories` | `hr` | None | Yes | Read-only |
| **130** | `GET` | `/reimbursements/categories/:id` | `hr` | None | Yes | Read-only |
| **131** | `PUT` | `/reimbursements/categories/:id` | `hr` | Row Lock | Yes | `reimbursement_categories` (Update) |
| **132** | `DELETE` | `/reimbursements/categories/:id` | `hr` | Row Lock | Yes | `reimbursement_categories.is_active = false` |
| **133** | `GET` | `/reimbursements/claims` | `hr` | None | Yes | Read-only |
| **134** | `GET` | `/reimbursements/claims/:id` | `hr` | None | Yes | Read-only |
| **135** | `POST` | `/reimbursements/claims/:id/approve` | `hr` | Rank 1 → Rank 3 | Cursor | `reimbursement_claims`, `approvals`, `items` (Update) |
| **136** | `POST` | `/reimbursements/claims/:id/reject` | `hr` | Rank 3 | Cursor | `reimbursement_claims`, `approvals` (Rejected) |
| **137** | `GET` | `/attachments/:attachmentId/view-url` | `hr` | None | Yes | `payroll_audit_logs` (Insert) |
| **138** | `POST` | `/benefit-plans` | `hr` | DB Txn | No | `benefit_plans` (Insert) |
| **139** | `GET` | `/benefit-plans` | `hr` | None | Yes | Read-only |
| **140** | `GET` | `/benefit-plans/:id` | `hr` | None | Yes | Read-only |
| **141** | `PUT` | `/benefit-plans/:id` | `hr` | Row Lock | Yes | `benefit_plans` (Update) |
| **142** | `DELETE` | `/benefit-plans/:id` | `hr` | Row Lock | Yes | `benefit_plans.is_active = false` |
| **143** | `POST` | `/benefit-plans/:id/enrollments` | `hr` | Rank 1 → Rank 3 | No | `employee_benefit_enrollments` (Insert) |
| **144** | `GET` | `/benefit-plans/:id/enrollments` | `hr` | None | Yes | Read-only |
| **145** | `GET` | `/employees/:userId/benefit-enrollments` | `hr` | None | Yes | Read-only |
| **146** | `POST` | `/employees/:userId/benefit-enrollments/:enrollmentId/end` | `hr` | Rank 1 → Rank 3 | Status | `employee_benefit_enrollments.status = 'ended'` |
| **147** | `POST` | `/employees/:userId/tax/form16/:financialYear/part-a/attachment` | `hr` | DB Txn | No | `payroll_attachments` (Insert) |
| **148** | `GET` | `/reimbursements/claims` | `manager`, `hr` | None | Yes | Read-only |
| **149** | `GET` | `/reimbursements/claims/:id` | `manager`, `hr` | None | Yes | Read-only |
| **150** | `POST` | `/reimbursements/claims/:id/approve` | `manager`, `hr` | Rank 3 | Cursor | `reimbursement_claims`, `approvals` (Level 1) |
| **151** | `POST` | `/reimbursements/claims/:id/reject` | `manager`, `hr` | Rank 3 | Cursor | `reimbursement_claims`, `approvals` (Rejected) |
| **152** | `GET` | `/attachments/:attachmentId/view-url` | `manager`, `hr` | None | Yes | `payroll_audit_logs` (Insert) |
| **153** | `GET` | `/team/benefit-enrollments` | `manager`, `hr` | None | Yes | Read-only (Privacy Masked if Comp OFF) |
| **154** | `GET` | `/me/reimbursements/categories` | Self (`all`) | None | Yes | Read-only |
| **155** | `POST` | `/me/reimbursements/claims` | Self (`all`) | DB Txn | No | `reimbursement_claims`, `items` (Insert Draft) |
| **156** | `GET` | `/me/reimbursements/claims` | Self (`all`) | None | Yes | Read-only |
| **157** | `GET` | `/me/reimbursements/claims/:id` | Self (`all`) | None | Yes | Read-only |
| **158** | `PUT` | `/me/reimbursements/claims/:id` | Self (`all`) | Rank 3 | Yes | `reimbursement_claim_items` (Wholesale Replace) |
| **159** | `POST` | `/me/reimbursements/claims/:id/submit` | Self (`all`) | Rank 3 | Status | `reimbursement_claims`, `approvals` (Submitted) |
| **160** | `POST` | `/me/reimbursements/claims/:id/cancel` | Self (`all`) | Rank 3 | Status | `reimbursement_claims.status = 'cancelled'` |
| **161** | `POST` | `/me/reimbursements/claims/:id/items/:itemId/attachments` | Self (`all`) | DB Txn | No | `payroll_attachments` (Insert Pending) |
| **162** | `POST` | `/me/tax/declarations/items/:itemId/attachments` | Self (`all`) | DB Txn | No | `payroll_attachments` (Insert Pending) |
| **163** | `POST` | `/me/attachments/:attachmentId/confirm` | Self (`all`) | Row Lock | Yes | `payroll_attachments.status = 'available'` |
| **164** | `DELETE` | `/me/attachments/:attachmentId` | Self (`all`) | Row Lock | Yes | `payroll_attachments.status = 'deleted'` |
| **165** | `GET` | `/me/attachments/:attachmentId/view-url` | Self (`all`) | None | Yes | `payroll_audit_logs` (Insert) |
| **166** | `GET` | `/me/benefits` | Self (`all`) | None | Yes | Read-only |

---

### Final Coverage Audit

* **Phase 5 APIs discovered:** **39**
* **Fully documented:** **39**
* **Missing:** **0**

*(End of Phase 5 API Analysis Document)*
