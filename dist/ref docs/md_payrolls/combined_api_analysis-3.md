# Combined API Analysis: Payroll Module (Phases 1–5: Foundation, Run Engine, Variable Pay, Statutory/Tax & Reimbursements/Benefits)

This document is the request/response contract for **every endpoint shipped across Phases 1, 2, 3, 4, and 5** of the Payroll module: the salary-component catalog, salary-structure templates, per-employee versioned effective-dated salary structures (with the D-13 maker-checker chain), org payroll settings, encrypted bank accounts, the append-only audit trail, the core calculation and run execution engine, the complete variable-pay suite (bonuses, ad-hoc adjustments, bulk CSV batches, employee loans, EMI schedules, foreclosures, and shortfall carry-forwards), the **Phase 4 statutory & tax layer** (the `statutory_configs` singleton, professional-tax slabs, income-tax regimes/slabs, investment declarations, per-employee tax summaries & Form 16, and the self-service tax surface), and the **Phase 5 suite** covering expense reimbursement categories, live budget headroom, claims authoring, multi-tier approvals with line-item trimming, out-of-pocket payout protection (Step 8f injection), corporate benefit plans and enrollments (Step 8a' deductions without proration), Form 16 Part A distribution, and the binary-free pre-signed S3 document vault.

> **Global envelope.** Success: `{ "success": true, "message": "...", "data": ... }`. Error: `{ "success": false, "message": "...", "errorCode": "..." }` via `AppError(status, message, errorCode)`. Every handler is `async (req, res, next)` with `try/catch → next(error)`.

> **Two authority planes (§6.0).** Payroll is **tenant-plane only**. `hr` is the top of the org tree; `manager` and `employee` operate within it. Platform roles (`admin`, `super-admin`, `worker`) are **deliberately excluded** — their tokens carry `org_id = NULL` and are stopped by `requireFeature('payroll.access')` with `400 MISSING_ORG_CONTEXT` before any role gate. This makes Payroll the strictest module in the product; the `['hr']`-only HR stack is an intentional divergence from Attendance/Leave and must not be "harmonized."

> **Feature flag.** Every route requires the `payroll.access` feature. An org without the flag receives `403 FEATURE_NOT_AVAILABLE` (or `400 MISSING_ORG_CONTEXT` for a platform token).

> **Money & dates.** Money-bearing fields (`value`, `annual_ctc`) accept **either a number or a numeric string**; the string form is preferred because `money.utils` parses it losslessly (integer-paise arithmetic, no float round-trip). All amounts are stored and reconciled in integer minor units (paise). Effective dates are `YYYY-MM-DD` strings to keep `DATEONLY` free of timezone drift.

> **`ctc_cost` semantic change in Phase 4 (engine 4).** On a run item, `ctc_cost` is the true employer cost of employment for the period. Through engine 3 it was earnings plus employer variable-pay contributions; from **engine 4 it additionally includes the employer statutory contributions** — PF-employer, EPS, EDLI, the PF admin charge, and ESI-employer — because those are real employer outlays. Frozen engine-2/-3 runs are unaffected (D-12); their `ctc_cost` keeps the old meaning, and the item's `engine_version` disambiguates which definition applies. Consumers aggregating employer cost across mixed-engine periods must not assume a single formula — read `engine_version`.

> **Honesty guard on every payslip/figure endpoint.** Each run item carries `statutory_status` (`applied` | `disabled` | `not_applied`) and its run carries `engine_version`, so a reader can never mistake a pre-statutory `net_pay` for a real post-withholding take-home. Engine-4 items are `applied` (org withholds) or `disabled` (org opted out); engine-2/-3 items are `not_applied`. The self/manager payslip exposes the employee's own statutory heads and wage bases but **never** `statutory_snapshot` (HR-only diagnostics carrying declaration-derived figures — D-28).

> **Reimbursement Payout Invariant (D-31).** A reimbursement payout is **not an earning**. It never appears in `gross_earnings`, `taxable_earnings`, `pf_wage`, `esi_wage`, the Professional Tax (PT) base, or `ctc_cost`. It sits outside the negative-net wage clamp (**Step 8f**), entering only `net_pay` and the new `reimbursement_amount` column. Emitting a reimbursement as an earning line is strictly prevented because it would corrupt statutory withholdings and violate labor law by treating an expense reimbursement as taxable income.

> **Benefit Deduction & Contribution Invariant (D-33, D-36, D-37).** Benefit plans carry flat monthly contributions for employee deductions (**Step 8a′**, prioritized before discretionary loan EMI recovery) and/or employer contributions (**Step 6c**, factored into CTC). Benefits carry no mid-month proration (**D-36**); an active enrollment charges a full month's premium if it touches any calendar day of the month. Dual-layer month-overlap protection (PostgreSQL `btree_gist` EXCLUDE constraint + serialised service assertion under `payroll:benefit:{userId}`) guarantees an employee is never double-deducted.

> **Binary-Free Polymorphic S3 Storage (D-30).** The API process never buffers, parses, or streams document binaries. Attachment lifecycles operate strictly through short-lived pre-signed AWS S3 URLs: pre-signed `PUT` (10-minute TTL) binding exact `Content-Type` and `Content-Length`, `HeadObject` verification prior to confirmation, and pre-signed `GET` (5-minute TTL) with inline browser rendering or download disposition. Serves reimbursement receipts, Chapter VI-A investment declaration proofs, and Form 16 Part A certificates under a unified schema.

> **Component-evaluation definitional note (§5.2 — must not be re-derived differently).** When a structure is evaluated (on assignment, revision, and **preview**), components resolve in a fixed, deterministic order — within each tier by `display_order`, then `code` as a stable tiebreak:
> 1. `flat` — the given amount.
> 2. `percent_of_ctc` — a percentage of `annual_ctc`.
> 3. `percent_of_basic` — a percentage of the resolved `is_basic` component (`NO_BASIC_COMPONENT` if a `percent_of_basic` exists with no basic).
> 4. `percent_of_gross` — a percentage of the **subtotal of all earnings resolved in tiers 1–3 only**, *excluding* the balancing component and *excluding* other `percent_of_gross` components. **This is a deliberate definitional choice** to break the otherwise-circular dependency (gross would otherwise include the balancing component, which is itself derived from gross). Any consumer computing "gross" must use this same definition.
> 5. `balancing` — `annual_ctc − Σ(annual_amount of every other is_part_of_ctc component)`. It absorbs all rounding drift, which is exactly why component sums always reconcile to the CTC **to the paise**.
>
> Before returning, the evaluator asserts (each a typed `422`): `MULTIPLE_BALANCING_COMPONENTS`, `NO_BASIC_COMPONENT`, `INVALID_PERCENTAGE` (outside 0–100), `CTC_BELOW_FIXED_COMPONENTS` (balancing goes negative), `CTC_RECONCILIATION_FAILED` (no balancing and `Σ ≠ annual_ctc`), `NO_EARNING_COMPONENTS`. The reconciliation assert runs on **every** evaluate, previews included — it is the guarantee that later phases can trust `annual_ctc` as the exact sum of its parts.

---

# HR Administration APIs — `/api/v1/payroll/hr`

*Auth stack for every route below: `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`.*

## 1. Bootstrap Default Component Catalog
* **API name / purpose**: Idempotently seed the default salary-component catalog for the org.
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/payroll/hr/components/bootstrap`
* **Authentication / authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**: None.
* **Detailed API Function**: Inserts only the default `code`s (Basic, HRA, Special Allowance, PF, etc.) that do **not** already exist for the org; it never overwrites an HR-edited row. Runs in a transaction and is audit-logged.
* **Error handling**: `400 MISSING_ORG_CONTEXT` (platform token), `403 FEATURE_NOT_AVAILABLE`.
* **What This API Gives/Does**: Returns `{ created: [...], skipped: [...] }` — the component `code`s newly inserted and those already present. **Idempotent**: calling it twice creates nothing the second time.

## 2. Create a Salary Component
* **API name / purpose**: Create a custom salary component (a behavioural catalog entry).
* **HTTP method**: `POST`
* **Endpoint / route**: `/api/v1/payroll/hr/components`
* **Authentication / authorization**: Token. Roles: `hr`.
* **Request JSON Payload**:
  ```json
  {
    "name": "Special Allowance",
    "code": "SPECIAL_ALLOWANCE",
    "component_type": "earning",
    "calculation_type": "balancing",
    "value": 0,
    "is_basic": false,
    "is_part_of_ctc": true,
    "is_taxable": true,
    "is_lop_applicable": true,
    "is_prorated_on_joining": true,
    "pf_applicable": false,
    "esi_applicable": false,
    "is_statutory": false,
    "display_order": 100,
    "description": "Absorbs the CTC balance"
  }
  ```
* **Request Fields**:
  * `name` (String, Required): Max 150 chars.
  * `code` (String, Required): `^[A-Za-z0-9_]+$`, max 50. Unique within the org.
  * `component_type` (Enum, Required): `earning` | `deduction` | `employer_contribution` | `reimbursement`.
  * `calculation_type` (Enum, Required): `flat` | `percent_of_basic` | `percent_of_gross` | `percent_of_ctc` | `balancing`.
  * `value` (Money-like, Optional, default `0`): amount for `flat`, or percentage for the `percent_*` types.
  * `is_basic`, `is_part_of_ctc` (default `true`), `is_taxable` (default `true`), `is_lop_applicable` (default `true`), `is_prorated_on_joining` (default `true`), `pf_applicable`, `esi_applicable`, `is_statutory` (Booleans, Optional).
  * `display_order` (Integer ≥ 0, Optional, default `0`), `description` (String, Optional), `is_active` (Boolean, default `true`).
* **Detailed API Function**: Forces `is_system = false` (custom rows can never masquerade as system rows), validates the `code` is unique for the org, and inserts the catalog row.
* **Error handling**: `409 COMPONENT_CODE_EXISTS`, `400/422` validation.
* **What This API Gives/Does**: Returns the created component with its generated UUID.

## 3. List Salary Components
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/components` · **Roles**: `hr`.
* **Request Fields (query — validated inside the controller, Express 5)**:
  * `is_active` (Boolean, Optional): filter by active state.
  * `component_type` (Enum, Optional): one of the four component types.
* **Detailed API Function**: Returns the org's components, optionally filtered. Query params are validated **inside the controller** because Express 5's `req.query` is a read-only getter.
* **What This API Gives/Does**: An array of component rows for catalog UIs and dropdowns.

## 4. Get a Salary Component
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/components/:id` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID, Required).
* **Error handling**: `404 COMPONENT_NOT_FOUND`.
* **What This API Gives/Does**: One component row.

## 5. Update a Salary Component
* **HTTP method**: `PUT` · **Endpoint**: `/api/v1/payroll/hr/components/:id` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID). Body accepts any subset of the create fields (**min 1** field required).
* **Detailed API Function**: Updates the component. For **system** rows (`is_system = true`), `code` / `component_type` / `calculation_type` are immutable — attempting to change them is rejected. Behavioural flags remain editable so an org can tune tax/PF treatment.
* **Error handling**: `404 COMPONENT_NOT_FOUND`, `409 SYSTEM_COMPONENT_IMMUTABLE`, `409 COMPONENT_CODE_EXISTS`.
* **What This API Gives/Does**: The updated component.

## 6. Deactivate a Salary Component
* **HTTP method**: `DELETE` · **Endpoint**: `/api/v1/payroll/hr/components/:id` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID).
* **Detailed API Function**: Sets `is_active = false` — **never hard-deletes**. Refuses if the component is referenced by an active template or by **any** approved structure (history must stay reproducible).
* **Error handling**: `404 COMPONENT_NOT_FOUND`, `409 COMPONENT_IN_USE`.
* **What This API Gives/Does**: Confirms the component is deactivated; historical structures that snapshotted it are unaffected.

## 7. Create a Structure Template
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/structure-templates` · **Roles**: `hr`.
* **Request JSON Payload**:
  ```json
  {
    "name": "Engineering — Full Time",
    "code": "ENG_FT",
    "definition_mode": "ctc_driven",
    "currency": "INR",
    "department_id": null,
    "designation": "Software Engineer",
    "employment_type": "full_time"
  }
  ```
* **Request Fields**:
  * `name` (String, Required, max 150), `code` (String, Required, `^[A-Za-z0-9_]+$`, max 50, unique).
  * `description` (String, Optional).
  * `department_id` (UUID, Optional/nullable), `designation` (String, Optional/nullable), `employment_type` (Enum `full_time`|`part_time`|`contract`|`intern`, Optional/nullable).
  * `definition_mode` (Enum `ctc_driven`|`component_driven`, default `ctc_driven`), `currency` (3-letter, uppercase, default `INR`), `is_active` (Boolean, default `true`).
* **Detailed API Function**: Creates an empty template blueprint (components are added via #12).
* **Error handling**: `409 TEMPLATE_CODE_EXISTS`, `400/422` validation.
* **What This API Gives/Does**: The created template.

## 8. List Structure Templates
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/structure-templates` · **Roles**: `hr`.
* **Detailed API Function**: Returns all templates with their component lines and catalog component names eager-loaded in one call.
* **What This API Gives/Does**: An array of templates, each with its component list.

## 9. Get a Structure Template
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID).
* **Error handling**: `404 TEMPLATE_NOT_FOUND`.
* **What This API Gives/Does**: One template with its components.

## 10. Update a Structure Template
* **HTTP method**: `PUT` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID). Body accepts any subset of the create fields (**min 1**).
* **Error handling**: `404 TEMPLATE_NOT_FOUND`, `409 TEMPLATE_CODE_EXISTS`.
* **What This API Gives/Does**: The updated template.

## 11. Deactivate a Structure Template
* **HTTP method**: `DELETE` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID).
* **Detailed API Function**: Sets `is_active = false`.
* **Error handling**: `404 TEMPLATE_NOT_FOUND`.
* **What This API Gives/Does**: Confirms deactivation.

## 12. Add a Component to a Template
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id/components` · **Roles**: `hr`.
* **Request JSON Payload**:
  ```json
  { "component_id": "…uuid…", "value": "50", "calculation_type": "percent_of_ctc", "display_order": 10 }
  ```
* **Request Fields**:
  * `id` (Path, UUID): the template.
  * `component_id` (UUID, Required): the catalog component to attach.
  * `value` (Money-like, Optional/nullable): override the catalog value.
  * `calculation_type` (Enum, Optional/nullable): override the catalog calculation.
  * `display_order` (Integer ≥ 0, Optional/nullable).
* **Detailed API Function**: Attaches a component to the template; rejects a duplicate `component_id` on the same template.
* **Error handling**: `404 TEMPLATE_NOT_FOUND`, `404 COMPONENT_NOT_FOUND`, `409 TEMPLATE_COMPONENT_EXISTS`.
* **What This API Gives/Does**: The created template-component line.

## 13. Update a Template Component
* **HTTP method**: `PUT` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id/components/:componentId` · **Roles**: `hr`.
* **Request Fields**: `id`, `componentId` (Path, UUID). Body: any subset of `value` / `calculation_type` / `display_order` (**min 1**).
* **Error handling**: `404 TEMPLATE_COMPONENT_NOT_FOUND`.
* **What This API Gives/Does**: The updated line.

## 14. Remove a Template Component
* **HTTP method**: `DELETE` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id/components/:componentId` · **Roles**: `hr`.
* **Request Fields**: `id`, `componentId` (Path, UUID).
* **Detailed API Function**: Soft-removes the component from the template.
* **Error handling**: `404 TEMPLATE_COMPONENT_NOT_FOUND`.
* **What This API Gives/Does**: Confirms removal.

## 15. Preview a Template Evaluation
* **API name / purpose**: Evaluate a template against a CTC **without persisting anything** — the safety valve that lets HR see the split before committing a salary.
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id/preview` · **Roles**: `hr`.
* **Request JSON Payload**: `{ "annual_ctc": "1200000" }`
* **Request Fields**: `id` (Path, UUID); `annual_ctc` (Positive money-like, Required).
* **Detailed API Function**: Runs the §5.2 evaluator over the template's components for the given CTC and returns the full breakdown. **Persists nothing.** The reconciliation assert runs here too, so an unbalanced template surfaces its `422` at preview time.
* **Error handling**: `404 TEMPLATE_NOT_FOUND`; any evaluator `422` (`NO_BASIC_COMPONENT`, `INVALID_PERCENTAGE`, `CTC_BELOW_FIXED_COMPONENTS`, `CTC_RECONCILIATION_FAILED`, `MULTIPLE_BALANCING_COMPONENTS`, `NO_EARNING_COMPONENTS`).
* **What This API Gives/Does**: `{ annual_ctc, annual_gross, monthly_gross, reconciled, lines: [ { code, name, component_type, calculation_type, value, is_part_of_ctc, annual_amount, monthly_amount, display_order } ] }`. See the definitional note above for how `percent_of_gross` is computed.

## 16. Assign / Revise an Employee Salary Structure
* **API name / purpose**: HR assigns a new salary structure or revises the current one (effective-dated, versioned).
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/salary-structures` · **Roles**: `hr`.
* **Request JSON Payload** (template-driven **or** explicit components — never both):
  ```json
  {
    "annual_ctc": "1500000",
    "effective_from": "2026-09-01",
    "currency": "INR",
    "revision_type": "increment",
    "revision_reason": "Annual appraisal",
    "template_id": "…uuid…"
  }
  ```
  or
  ```json
  {
    "annual_ctc": "1500000",
    "effective_from": "2026-09-01",
    "components": [ { "component_id": "…uuid…", "calculation_type": "percent_of_ctc", "value": "40" } ]
  }
  ```
* **Request Fields**:
  * `userId` (Path, UUID): the employee.
  * `annual_ctc` (Positive money-like, Required).
  * `effective_from` (`YYYY-MM-DD`, Required): must be `≥ joining_date` and, for a revision, strictly `>` the current version's `effective_from`.
  * `currency` (3-letter, default `INR`).
  * `revision_type` (Enum `initial`|`increment`|`correction`|`promotion`|`restructure`, Optional).
  * `revision_reason` (String ≤ 1000, **required for every version after the first**).
  * `template_id` (UUID) **XOR** `components` (array, min 1) — supplying both, or neither, is `422 INVALID_STRUCTURE_INPUT`.
* **Detailed API Function** (§7.1): Resolves settings → runs the authority chokepoint (`getAccessibleUserIds` + `decideAuthority`) **before** any existence lookup → resolves the target employee profile → resolves and evaluates components. It **always inserts the row as `proposed` first**, then — if the actor has landing authority — promotes it to `approved` inside the same transaction under a `pg_advisory_xact_lock` on the user. For HR this normally lands **`approved` directly** (Tier C); but when `payroll_require_separate_checker` is ON it lands **`proposed`** and needs a **different** HR user to approve (EC-30). On approval it closes the current version (`effective_to = effective_from − 1 day`), assigns the next `version`, and snapshots each component's behavioural flags onto the structure lines (reproducibility, §4.5).
* **Error handling**: `403 FORBIDDEN` (out of scope), `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_STRUCTURE_INPUT`, `422 COMPONENT_NOT_FOUND_OR_INACTIVE`, `400 EFFECTIVE_BEFORE_JOINING`, `400 RETRO_REVISION_NOT_SUPPORTED`, `400 REVISION_REASON_REQUIRED`, plus any evaluator `422`.
* **What This API Gives/Does**: The persisted structure with its component lines and its landing `status` (`approved` or `proposed`).

## 17. Get Employee Structure History
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/salary-structures` · **Roles**: `hr`.
* **Request Fields**: `userId` (Path, UUID).
* **What This API Gives/Does**: The full version history for the employee, **including** `rejected` and `cancelled` rows (HR needs the complete audit picture).

## 18. Get Employee Current Structure
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/salary-structures/current` · **Roles**: `hr`.
* **Request Fields**: `userId` (Path, UUID).
* **What This API Gives/Does**: The single current approved open-ended structure (`status = approved`, `effective_to = null`) with its component snapshot, or `null`.

## 18a. Get Current Salary Structures (Bulk)
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/salary-structures/current` · **Roles**: `hr`.
* **Request Fields (query)**: `page` (Integer ≥ 1, default 1), `limit` (Integer 1–100, default 50).
* **What This API Gives/Does**: A paginated list of all current approved open-ended structures for the organization, complete with component snapshots. Replaces N+1 calls to #18 on the HR dashboard.

## 19. List Salary-Structure Proposals (HR Checker Queue)
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/salary-structures/proposals` · **Roles**: `hr`.
* **Request Fields (query — validated in the controller)**:
  * `status` (Enum `proposed`|`approved`|`rejected`|`cancelled`, Optional).
  * `proposed_by` (UUID, Optional), `user_id` (UUID, Optional).
  * `page` (Integer ≥ 1, default 1), `limit` (Integer 1–100, default 20).
* **What This API Gives/Does**: A paginated list of proposals — the queue HR works from to approve/reject manager and HR submissions.

## 20. Approve a Salary-Structure Proposal
* **API name / purpose**: The maker-checker approval — the critical section (§7.2).
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/salary-structures/:id/approve` · **Roles**: `hr`.
* **Request Fields**: `id` (Path, UUID).
* **Detailed API Function** (§7.2, in order): peek the row org-scoped (`404 STRUCTURE_NOT_FOUND`) → take `pg_advisory_xact_lock` on the target user (serializes concurrent approvals) → reload `FOR UPDATE` → `409 PROPOSAL_NOT_PENDING` if it is no longer `proposed` → load settings → **`403 SEPARATE_CHECKER_REQUIRED`** if the approver equals the proposer while separate-checker is ON (EC-30; the message names both remedies) → **re-verify the proposer still has scope** over the target (`409 PROPOSAL_SCOPE_STALE`, EC-29 — a manager who lost the report cannot have their stale proposal approved) → plan the revision → close the current version, promote this one to `approved` with the next `version`, and **supersede** any competing pending proposals for the same user (`rejection_reason: "Superseded by an approved revision"`). Audit-logged with both `proposedBy` and `approvedBy`.
* **Error handling**: `404 STRUCTURE_NOT_FOUND`, `409 PROPOSAL_NOT_PENDING`, `403 SEPARATE_CHECKER_REQUIRED`, `409 PROPOSAL_SCOPE_STALE`, plus versioning errors.
* **What This API Gives/Does**: The now-`approved` structure. **Retry-safe**: a duplicate approve after success returns `409 PROPOSAL_NOT_PENDING`, never a double promotion.

## 21. Reject a Salary-Structure Proposal
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/salary-structures/:id/reject` · **Roles**: `hr`.
* **Request JSON Payload**: `{ "rejection_reason": "CTC exceeds band" }`
* **Request Fields**: `id` (Path, UUID); `rejection_reason` (String, Required, trimmed, 1–1000).
* **Detailed API Function**: Under advisory lock + `FOR UPDATE`, sets `status = rejected` with the reason and the acting HR as `approved_by`; `409 PROPOSAL_NOT_PENDING` if not currently `proposed`.
* **What This API Gives/Does**: The rejected proposal. No version is opened or closed.

## 22. Get Payroll Settings
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/settings` · **Roles**: `hr`.
* **Detailed API Function**: Lazily `getOrCreate`s the org's `payroll_settings` singleton (creating the default row on first read).
* **What This API Gives/Does**: The settings object (see Org Settings Registry #35–#40).

## 23. Update Payroll Settings
* **HTTP method**: `PUT` · **Endpoint**: `/api/v1/payroll/hr/settings` · **Roles**: `hr`.
* **Request Fields (any subset, min 1)**: `payroll_cycle` (`monthly`), `period_start_day` (1–28), `attendance_cutoff_day` (1–31), `pay_day` (1–31), `pay_day_in_next_month` (Boolean), `currency` (3-letter), `financial_year_start_month` (1–12), `manager_can_view_team_compensation` (Boolean), `payroll_require_separate_checker` (Boolean), `manager_direct_compensation_authority` (Boolean).
* **Detailed API Function**: Partial update, audit-logged old→new. Enabling `payroll_require_separate_checker` with **fewer than 2 active HR users** is rejected so the control can never deadlock all payroll changes.
* **Error handling**: `409 INSUFFICIENT_CHECKERS`.
* **What This API Gives/Does**: The updated settings.

## 24. List Bank Accounts (HR view)
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/bank-accounts` · **Roles**: `hr`.
* **Request Fields (query)**: `page` (default 1), `limit` (1–100, default 20).
* **Detailed API Function**: Fetches a paginated list of primary bank accounts for all employees in the organization. The full account numbers are AES-256-GCM encrypted at rest and are **never** returned; the service maps over the list applying `toMasked(row)`.
* **What This API Gives/Does**: `{ success: true, message: "Bank accounts fetched", data: [ { account_holder_name, masked_account_number: "••••1234", ifsc_code, bank_name, branch_name, account_type, is_verified, ... } ], pagination: { total, page, limit, total_pages } }`.

## 25. Get Employee Bank Account (HR view)
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/bank-account` · **Roles**: `hr`.
* **Request Fields**: `userId` (Path, UUID).
* **Detailed API Function**: Returns the employee's primary account **masked** — the full number is AES-256-GCM encrypted at rest and is **never** returned.
* **What This API Gives/Does**: `{ account_holder_name, masked_account_number: "••••1234", ifsc_code, bank_name, branch_name, account_type, is_verified, ... }` or `null`.

## 26. Verify an Employee Bank Account
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/bank-account/verify` · **Roles**: `hr`.
* **Request Fields**: `userId` (Path, UUID).
* **Detailed API Function**: Sets `is_verified = true`, `verified_by`, `verified_at`. **Idempotent** — verifying an already-verified account is a no-op success.
* **Error handling**: `404 BANK_ACCOUNT_NOT_FOUND`.
* **What This API Gives/Does**: The masked, now-verified account.

## 27. List Audit Logs
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/audit-logs` · **Roles**: `hr`.
* **Request Fields (query — validated in the controller)**: `entity_type` (String), `entity_id` (UUID), `target_user_id` (UUID), `action` (String), `from`/`to` (`YYYY-MM-DD`), `page` (default 1), `limit` (1–100, default 20).
* **Detailed API Function**: Reads the append-only `payroll_audit_logs`. Sensitive fields (`account_number`, `payroll_encryption_key`) are redacted by a deny-list backstop and can never appear in a log record.
* **What This API Gives/Does**: A paginated audit trail of every payroll state change.

---

# Manager APIs — `/api/v1/payroll/manager`

*Auth stack: `authenticate` → `authorize(['manager','hr'])` → `requireFeature('payroll.access')`. `hr` is admitted so an HR user can use the manager views without a second token (`decideAuthority` resolves them to `scope: 'global'`).*

> **BOLA rule (non-negotiable).** Every handler resolves hierarchy scope **before** any existence lookup, so "not your report" and "does not exist" both return an identical **`403 FORBIDDEN`** — never `404`, which would be an employee-enumeration oracle.

## 27. Get Team Salary Structures
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/manager/team/salary-structures` · **Roles**: `manager, hr`.
* **Detailed API Function**: Lists the caller's direct reports with each one's current CTC. Compensation visibility is gated by `manager_can_view_team_compensation` (global HR always sees figures). When it is **OFF**, the response contains **aggregates only** — headcount, team CTC total, team CTC average — and **never** per-head figures (EC-25).
* **What This API Gives/Does**: `{ headcount, team_ctc_total, team_ctc_average, members?: [ { user, current_ctc, ... } ] }` — `members[]` present only when compensation viewing is allowed.

## 28. Get a Report's Structure History
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/manager/employees/:userId/salary-structures` · **Roles**: `manager, hr`.
* **Request Fields**: `userId` (Path, UUID).
* **Detailed API Function**: Scope-checked first. A cross-team `userId` returns `403 FORBIDDEN`; `403 COMPENSATION_VIEW_DISABLED` if the manager may not view compensation.
* **What This API Gives/Does**: The report's structure history (scoped).

## 29. Get a Report's Current Structure
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/manager/employees/:userId/salary-structures/current` · **Roles**: `manager, hr`.
* **Request Fields**: `userId` (Path, UUID). Same scope/visibility guards as #28.
* **What This API Gives/Does**: The report's current approved structure (scoped), or `null`.

## 30. Propose a Salary Structure for a Report
* **API name / purpose**: Tier-B maker-checker proposal — a manager proposes a compensation change for a direct report.
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/manager/employees/:userId/salary-structures/propose` · **Roles**: `manager, hr`.
* **Request JSON Payload**: Same wire shape as #16 (`annual_ctc`, `effective_from`, `currency?`, `revision_type?`, `revision_reason?`, and `template_id` **XOR** `components`).
* **Request Fields**: `userId` (Path, UUID) + the #16 body fields.
* **Detailed API Function**: Delegates to the same service chokepoint as #16 with `proposed_by = req.user.id`. It normally lands **`proposed`** (into the HR checker queue). If `manager_direct_compensation_authority` is ON, the manager holds approval authority over their own reports and the full §7.2 approval runs in the **same transaction**, landing **`approved`**. Scope is resolved before existence, so a cross-team `userId` is `403 FORBIDDEN`.
* **Error handling**: `403 FORBIDDEN`, `404 EMPLOYEE_NOT_FOUND` (only for in-scope users), `422 INVALID_STRUCTURE_INPUT`, plus the #16 versioning/evaluator errors.
* **What This API Gives/Does**: The persisted structure with its landing `status`.

## 31. List My Proposals
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/manager/salary-structures/proposals` · **Roles**: `manager, hr`.
* **Request Fields (query — validated in the controller)**: `status` (Enum), `page`, `limit`.
* **What This API Gives/Does**: The caller's **own** proposals with status/outcome — a manager sees only what they submitted.

## 32. Cancel My Proposal
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/manager/salary-structures/:id/cancel` · **Roles**: `manager, hr`.
* **Request Fields**: `id` (Path, UUID).
* **Detailed API Function**: Cancels the caller's own proposal, only while it is still `proposed`. **Ownership is the BOLA guard**: if the proposal is not the caller's (or does not exist), the response is `403 FORBIDDEN`; if it exists and is owned but no longer `proposed`, `409 PROPOSAL_NOT_PENDING`.
* **What This API Gives/Does**: The cancelled proposal.

---

# Employee Self-Service APIs — `/api/v1/payroll` (all under `/me`)

*Auth stack: `authenticate` → `requireFeature('payroll.access')`. **No `authorize()`** (D-1): the target is always `req.user.id`, so there is no object-level authorization to break; the guard is the presence of `orgId` (a platform token → `400 MISSING_ORG_CONTEXT`).*

> **Employee visibility rule.** An employee sees **only `approved`** structures. A `proposed` increment is never surfaced — doing so would leak an in-flight HR decision and set an expectation the checker may reject. Enforced in the service.

## 33. Get My Current Salary Structure
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/me/salary-structure`.
* **What This API Gives/Does**: The caller's current **approved** structure with its component breakdown, or `null`. A pending proposal is never shown.

## 34. Get My Salary Structure History
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/me/salary-structure/history`.
* **What This API Gives/Does**: The caller's **approved** version history only (no `proposed`/`rejected`/`cancelled`).

## 35. Get My Bank Account
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/me/bank-account`.
* **What This API Gives/Does**: The caller's own primary account, **masked** (`••••1234`), or `null`.

## 36. Upsert My Bank Account
* **HTTP method**: `PUT` · **Endpoint**: `/api/v1/payroll/me/bank-account`.
* **Request JSON Payload**:
  ```json
  {
    "account_holder_name": "Asha Rao",
    "account_number": "123456789012",
    "ifsc_code": "HDFC0001234",
    "bank_name": "HDFC Bank",
    "branch_name": "MG Road",
    "account_type": "savings"
  }
  ```
* **Request Fields**:
  * `account_holder_name` (String, Required, max 150).
  * `account_number` (String, Required, `^\d{6,20}$`).
  * `ifsc_code` (String, Required, `^[A-Z]{4}0[A-Z0-9]{6}$`, uppercased).
  * `bank_name` (String, Required, max 150), `branch_name` (String, Optional), `account_type` (Enum `savings`|`current`, default `savings`).
* **Detailed API Function**: Creates or updates the caller's primary account. The number is **AES-256-GCM encrypted** and only the last four digits are stored in the clear; the plaintext is never returned or logged. The service re-validates the IFSC and account number (defense in depth, `422 INVALID_IFSC` / `422 INVALID_ACCOUNT_NUMBER`). **Any edit resets `is_verified = false`** (and clears `verified_by`/`verified_at`), re-triggering HR verification — an anti-fraud measure so a changed payment instrument cannot inherit prior trust. Transactional + audited (audit stores only non-secret fields).
* **What This API Gives/Does**: The saved account, **masked**, with `is_verified: false`.

---

## Appendix — Cross-cutting guarantees

* **Concurrency.** Every approval path (HR direct-assign, manager-direct, and explicit approve) takes a `pg_advisory_xact_lock` on the target user **before** any row lock, serializing concurrent writes. The partial unique index `emp_salary_struct_current_unique_idx` (one open-ended `approved` structure per user, `WHERE deleted_at IS NULL`) is the last line of defense — the service always closes the current version *before* promoting the new one, so two rows never simultaneously hold `approved` + `effective_to = null`.
* **Retries / duplicate requests.** Approve/reject/cancel are all status-guarded (`409 PROPOSAL_NOT_PENDING`), so a retried state-change after success is a safe no-op error rather than a double action. Bank-account verify is idempotent. Component bootstrap is idempotent by `code`.
* **Single write path.** Structures are always inserted `proposed` first and promoted by a shared finalizer, so the §7.2 close-out logic is identical whether the write originated from HR direct-assign, a manager with direct authority, or an explicit approve — there is no second, divergent approval code path to drift.
* **Secret hygiene.** `PAYROLL_ENCRYPTION_KEY` and full account numbers never appear in responses, logs, or audit records; the module fails closed at boot if the key is missing or malformed.

---

# Phase 2: Payroll Engine & Calculation Module

## 1. HR Administration APIs (Engine Operations) — `/api/v1/payroll/hr/runs`

### 37. Get Run Eligibility
* **Endpoint**: `GET /api/v1/payroll/hr/runs/eligibility` · **Roles**: `hr`
* **What This API Gives/Does**: A pre-flight readiness check for a month. Returns blocking factors (like unlocked attendance) that prevent creating a run.

### 38. Create Payroll Run
* **Endpoint**: `POST /api/v1/payroll/hr/runs` · **Roles**: `hr`
* **What This API Gives/Does**: Creates a draft payroll run for a specific month and year. It locks the month preventing duplicate runs. Returns 201 Created with the run header object.

### 39. List Payroll Runs
* **Endpoint**: `GET /api/v1/payroll/hr/runs` · **Roles**: `hr`
* **What This API Gives/Does**: Paginated list of payroll runs.

### 40. Get Payroll Run Header
* **Endpoint**: `GET /api/v1/payroll/hr/runs/:id` · **Roles**: `hr`
* **What This API Gives/Does**: Fetches the header details of a specific run.

### 41. Calculate Run
* **Endpoint**: `POST /api/v1/payroll/hr/runs/:id/calculate` · **Roles**: `hr`
* **What This API Gives/Does**: Triggers the synchronous engine to calculate all run items (or recalculates them). Overwrites all existing draft `run_items` with newly calculated data.

### 42. Get Run Preview
* **Endpoint**: `GET /api/v1/payroll/hr/runs/:id/preview` · **Roles**: `hr`
* **What This API Gives/Does**: Fetches full aggregates of a run (total gross, net, taxes, deductions, department breakdowns).

### 43. List Run Items
* **Endpoint**: `GET /api/v1/payroll/hr/runs/:id/items` · **Roles**: `hr`
* **What This API Gives/Does**: Lists the calculated payslips (items) with pagination.

### 44. Get Run Item Details
* **Endpoint**: `GET /api/v1/payroll/hr/runs/:id/items/:itemId` · **Roles**: `hr`
* **What This API Gives/Does**: Fetches a single employee's payslip for the run, including component lines and day ledger.

### 45. Exclude Item
* **Endpoint**: `POST /api/v1/payroll/hr/runs/:id/items/:itemId/exclude` · **Roles**: `hr`
* **What This API Gives/Does**: Manually excludes an employee from a run (e.g., hold pay), forcing a run recalculation.

### 46. Include Item
* **Endpoint**: `POST /api/v1/payroll/hr/runs/:id/items/:itemId/include` · **Roles**: `hr`
* **What This API Gives/Does**: Re-includes a previously excluded employee.

### 47. Override Item Period
* **Endpoint**: `PATCH /api/v1/payroll/hr/runs/:id/items/:itemId/period` · **Roles**: `hr`
* **What This API Gives/Does**: Overrides the calculation period window for an item (e.g., mid-month leaver adjustment).

### 48. Approve Run
* **Endpoint**: `POST /api/v1/payroll/hr/runs/:id/approve` · **Roles**: `hr`
* **What This API Gives/Does**: The critical state change. Locks the run, prevents further calculations, generates the PDF payslips, and creates an attendance lock. Changes status to `approved`.

### 49. Cancel Run
* **Endpoint**: `POST /api/v1/payroll/hr/runs/:id/cancel` · **Roles**: `hr`
* **What This API Gives/Does**: Cancels an approved run (only if unpaid). Changes status to `cancelled`, unlocks attendance.

### 50. Pay Run
* **Endpoint**: `POST /api/v1/payroll/hr/runs/:id/pay` · **Roles**: `hr`
* **What This API Gives/Does**: Terminal state. Marks an approved run as `paid`. Cannot be undone.

---

## 2. Manager APIs — `/api/v1/payroll/manager`

### 51. Get Team Run Summary
* **Endpoint**: `GET /api/v1/payroll/manager/runs/:runId/team-summary` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Aggregated team cost for one approved/paid run. Respects `manager_can_view_team_compensation` BOLA.

### 52. Get Team Run Items
* **Endpoint**: `GET /api/v1/payroll/manager/runs/:runId/team-items` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Paginated items (payslips) for direct reports. Drops financial data if the BOLA toggle is disabled.

### 53. List Report's Payslips
* **Endpoint**: `GET /api/v1/payroll/manager/employees/:userId/payslips` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Fetches historical payslips for a specific report. Only shows approved or paid runs.

### 54. Get Report's Payslip
* **Endpoint**: `GET /api/v1/payroll/manager/employees/:userId/payslips/:runId` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Fetches a detailed payslip for a specific report.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`

### 55. List My Payslips
* **Endpoint**: `GET /api/v1/payroll/me/payslips` · **Roles**: `all`
* **What This API Gives/Does**: Employees fetch their own finalized payslips. Only approved or paid runs are returned. Draft runs are hidden.

### 56. Get My Payslip
* **Endpoint**: `GET /api/v1/payroll/me/payslips/:runId` · **Roles**: `all`
* **What This API Gives/Does**: Employees fetch a specific finalized payslip containing the full breakdown and day ledger.

---

# Phase 3: Variable Pay (Bonuses, Incentives, Adjustments, Loans & Advances)

## 1. HR Administration APIs — `/api/v1/payroll/hr`

### 57. Create Payroll Adjustment
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments` · **Roles**: `hr`
* **What This API Gives/Does**: Creates an ad-hoc one-off variable pay line (earning or deduction) for an employee. Lands in `approved` status (or `pending` if separate-checker is enabled).

### 58. List Payroll Adjustments
* **Endpoint**: `GET /api/v1/payroll/hr/adjustments` · **Roles**: `hr`
* **What This API Gives/Does**: Paginated list of adjustments across the organization with filters for `period_month`, `user_id`, `status`, `category`, and `batch_id`.

### 59. Get Adjustment Details
* **Endpoint**: `GET /api/v1/payroll/hr/adjustments/:id` · **Roles**: `hr`
* **What This API Gives/Does**: Fetches full details of a specific adjustment, including audit and creation metadata.

### 60. Approve Adjustment
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments/:id/approve` · **Roles**: `hr`
* **What This API Gives/Does**: Approves a pending adjustment proposal. Enforces Maker-Checker separation of duties (`403 SEPARATE_CHECKER_REQUIRED`).

### 61. Reject Adjustment
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments/:id/reject` · **Roles**: `hr`
* **What This API Gives/Does**: Rejects a pending adjustment proposal with a mandatory rejection reason.

### 62. Cancel Adjustment
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments/:id/cancel` · **Roles**: `hr`
* **What This API Gives/Does**: Cancels a `pending` or `approved`-and-unapplied adjustment. Cannot cancel once applied to an approved/paid run.

### 63. Preview Bulk Adjustments CSV
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments/bulk/preview` · **Roles**: `hr`
* **What This API Gives/Does**: Pre-flight validation dry-run for bulk variable pay CSV uploads. Parses and validates every row without writing any database records.

### 64. Commit Bulk Adjustments Batch
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments/bulk` · **Roles**: `hr`
* **What This API Gives/Does**: Atomically inserts up to 5,000 adjustment rows in a single transaction linked by a shared `batch_id`.

### 65. Cancel Bulk Adjustments Batch
* **Endpoint**: `POST /api/v1/payroll/hr/adjustments/batches/:batchId/cancel` · **Roles**: `hr`
* **What This API Gives/Does**: Cancels all unapplied adjustment rows belonging to a specific bulk batch.

### 66. Create Bonus Rule
* **Endpoint**: `POST /api/v1/payroll/hr/bonus-rules` · **Roles**: `hr`
* **What This API Gives/Does**: Creates a declarative rule for automated bonus distributions based on tenure, department, and salary component percentages.

### 67. List Bonus Rules
* **Endpoint**: `GET /api/v1/payroll/hr/bonus-rules` · **Roles**: `hr`
* **What This API Gives/Does**: Paginated list of bonus distribution rules.

### 68. Get Bonus Rule Details
* **Endpoint**: `GET /api/v1/payroll/hr/bonus-rules/:id` · **Roles**: `hr`
* **What This API Gives/Does**: Fetches header and eligibility criteria for a specific bonus rule.

### 69. Update Bonus Rule
* **Endpoint**: `PUT /api/v1/payroll/hr/bonus-rules/:id` · **Roles**: `hr`
* **What This API Gives/Does**: Updates an unapproved bonus rule (allowed only while in `pending` status).

### 70. Approve Bonus Rule
* **Endpoint**: `POST /api/v1/payroll/hr/bonus-rules/:id/approve` · **Roles**: `hr`
* **What This API Gives/Does**: Approves a bonus rule, enabling it for application to payroll.

### 71. Reject Bonus Rule
* **Endpoint**: `POST /api/v1/payroll/hr/bonus-rules/:id/reject` · **Roles**: `hr`
* **What This API Gives/Does**: Rejects a bonus rule proposal with mandatory justification.

### 72. Preview Bonus Rule Impact
* **Endpoint**: `POST /api/v1/payroll/hr/bonus-rules/:id/preview-impact` · **Roles**: `hr`
* **What This API Gives/Does**: Evaluates eligibility and computes exact payouts for all matching employees. Returns total liability without persisting any data.

### 73. Apply Bonus Rule
* **Endpoint**: `POST /api/v1/payroll/hr/bonus-rules/:id/apply` · **Roles**: `hr`
* **What This API Gives/Does**: Materializes the bonus rule by creating individual `payroll_adjustments` rows for all eligible employees with a shared `batch_id`.

### 74. Cancel Bonus Rule
* **Endpoint**: `POST /api/v1/payroll/hr/bonus-rules/:id/cancel` · **Roles**: `hr`
* **What This API Gives/Does**: Cancels an unapplied bonus rule.

### 75. Grant Employee Loan
* **Endpoint**: `POST /api/v1/payroll/hr/employees/:userId/loans` · **Roles**: `hr`
* **What This API Gives/Does**: Grants a company loan or salary advance. Generates full monthly EMI schedule in `loan_installments`.

### 76. List Loans
* **Endpoint**: `GET /api/v1/payroll/hr/loans` · **Roles**: `hr`
* **What This API Gives/Does**: Paginated list of company loans with status and type filters.

### 77. Get Loan Details
* **Endpoint**: `GET /api/v1/payroll/hr/loans/:id` · **Roles**: `hr`
* **What This API Gives/Does**: Fetches loan metadata, principal, interest, recovered amount, and outstanding balance.

### 78. Get Loan Installments Schedule
* **Endpoint**: `GET /api/v1/payroll/hr/loans/:id/installments` · **Roles**: `hr`
* **What This API Gives/Does**: Lists all scheduled, deducted, skipped, and cancelled installments for a loan.

### 79. Approve Loan
* **Endpoint**: `POST /api/v1/payroll/hr/loans/:id/approve` · **Roles**: `hr`
* **What This API Gives/Does**: Approves a pending loan proposal and generates its installment schedule.

### 80. Reject Loan
* **Endpoint**: `POST /api/v1/payroll/hr/loans/:id/reject` · **Roles**: `hr`
* **What This API Gives/Does**: Rejects a pending loan proposal with mandatory reason.

### 81. Cancel Loan
* **Endpoint**: `POST /api/v1/payroll/hr/loans/:id/cancel` · **Roles**: `hr`
* **What This API Gives/Does**: Cancels a pending loan, or an active loan that has had zero deducted installments.

### 82. Foreclose Loan
* **Endpoint**: `POST /api/v1/payroll/hr/loans/:id/foreclose` · **Roles**: `hr`
* **What This API Gives/Does**: Performs early closure of an active loan. Cancels remaining installments (forgiving interest) and optionally creates a recovery adjustment for outstanding principal.

---

## 2. Manager APIs — `/api/v1/payroll/manager`

### 83. Propose Team Adjustment
* **Endpoint**: `POST /api/v1/payroll/manager/employees/:userId/adjustments/propose` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Manager proposes a variable pay earning/deduction for a direct report. Lands in `pending` for HR review.

### 84. List Team Adjustments
* **Endpoint**: `GET /api/v1/payroll/manager/adjustments` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Lists adjustments for direct reports. Masks financial amounts if `manager_can_view_team_compensation` is disabled.

### 85. Cancel Own Adjustment Proposal
* **Endpoint**: `POST /api/v1/payroll/manager/adjustments/:id/cancel` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Manager cancels their own pending adjustment proposal.

### 86. Propose Team Bonus Rule
* **Endpoint**: `POST /api/v1/payroll/manager/bonus-rules/propose` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Manager proposes a bonus rule strictly targeting direct reports with `eligibility_source: 'manual'`.

### 87. List Team Bonus Proposals
* **Endpoint**: `GET /api/v1/payroll/manager/bonus-rules` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Lists bonus rule proposals submitted by the manager.

### 88. Recommend Team Loan
* **Endpoint**: `POST /api/v1/payroll/manager/employees/:userId/loans/recommend` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Manager recommends a loan or emergency advance for a direct report.

### 89. List Team Loans
* **Endpoint**: `GET /api/v1/payroll/manager/loans` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Lists loans granted to direct reports with BOLA hierarchy verification.

### 90. Get Team Loan Details
* **Endpoint**: `GET /api/v1/payroll/manager/loans/:id` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Fetches installment schedule and repayment status for a subordinate's loan.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`

### 91. Get My Bonuses
* **Endpoint**: `GET /api/v1/payroll/me/bonuses` · **Roles**: `all`
* **What This API Gives/Does**: Returns the employee's approved bonuses, categorized into earned (paid) and upcoming (scheduled).

### 92. Get My Adjustments
* **Endpoint**: `GET /api/v1/payroll/me/adjustments` · **Roles**: `all`
* **What This API Gives/Does**: Lists all approved variable pay additions and deductions for the employee.

### 93. Get My Loans
* **Endpoint**: `GET /api/v1/payroll/me/loans` · **Roles**: `all`
* **What This API Gives/Does**: Lists the employee's active and closed loans, including total principal, recovered amount, and outstanding balance.

### 94. Get My Loan Installment Schedule
* **Endpoint**: `GET /api/v1/payroll/me/loans/:id/installments` · **Roles**: `all`
* **What This API Gives/Does**: Returns the employee's monthly EMI repayment schedule and deduction history.

---

# Phase 4 — Statutory & Tax APIs

*Numbering continues the registry (`api_registry.md` #95–#127). **No manager surface exists for Phase 4 (D-28)** — there are no manager tax or declaration endpoints, and `payroll_manager.routes.js` is untouched.*

## HR Administration APIs — `/api/v1/payroll/hr` (Phase 4)

*Auth stack for every route below: `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`.*

### 95. Get Statutory Config
* **API Name / Purpose**: Fetch the organization's global statutory configurations.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/statutory/config`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**: None.
* **Detailed API Function**: Lazily uses `getOrCreate` for the org's `statutory_configs` singleton, which contains PF/ESI/PT/TDS enablement, rates, and wage ceilings. Returns `updated_at` and `updated_by` tracking.
* **Error Handling**: Standard auth errors.
* **What This API Gives/Does**: The single active statutory configuration record for the organization.

### 96. Update Statutory Config
* **API Name / Purpose**: Update the organization's statutory configurations.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/statutory/config`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**: Accepts any subset of configuration flags/rates.
  * Fields: `pf_enabled`, `pf_employee_rate`, `pf_employer_rate`, `pf_wage_ceiling`, `pf_restrict_to_ceiling`, `pf_lop_reduces_ceiling`, `pf_include_overtime`, `eps_enabled`, `eps_rate`, `eps_wage_ceiling`, `pf_admin_charge_rate`, `pf_admin_charge_min`, `edli_enabled`, `edli_rate`, `edli_wage_ceiling`, `esi_enabled`, `esi_employee_rate`, `esi_employer_rate`, `esi_wage_threshold`, `esi_include_overtime`, `pt_enabled`, `income_tax_enabled`, `tds_no_pan_rate`, `tds_no_pan_enforced`, `cess_rate`.
* **Detailed API Function**: Performs a partial update on the singleton configuration. It is audit-logged (old to new values). Modifying configurations affects newly calculated runs; already frozen/calculated runs must be cancelled and re-created to pick up changes. Enabling a statutory head activates its corresponding component catalog rows.
* **Error Handling**: `400/422` validation for unknown or invalid keys.
* **What This API Gives/Does**: Returns the updated statutory configuration object.

### 97. List Professional-Tax Slabs
* **API Name / Purpose**: List professional tax (PT) slabs.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/statutory/pt-slabs`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `state_code` (String, Optional), `is_active` (Boolean, Optional).
* **Request JSON Payload**: None.
* **Detailed API Function**: Fetches active PT slabs, optionally filtered by state code. Query parameters are validated in the controller.
* **Error Handling**: Standard auth errors (`401 Unauthorized`, `403 Forbidden`); `400/422` query validation errors on invalid filters.
* **What This API Gives/Does**: An array of PT slabs.

### 98. Replace a State's PT Slab Set
* **API Name / Purpose**: Atomically replace a state's entire professional tax slab set.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/statutory/pt-slabs/states/:stateCode`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `stateCode` (Path, String).
* **Request JSON Payload**: 
  * `state_name` (String, Optional)
  * `slabs` (Array of objects): `from_amount` (Money), `to_amount` (Money or null), `monthly_amount` (Money), `gender` ('any'|'male'|'female'), `month_overrides` (Object mapping '1'-'12' to Money).
* **Detailed API Function**: Atomically replaces the state's PT slab set. Performs a soft-delete of existing active slabs and inserts the new set. Validates the contiguous, half-open `[from, to)` intervals to prevent gaps or overlaps per gender. Uses `pg_advisory_xact_lock` to prevent concurrent replacement race conditions.
* **Error Handling**: `422 PT_SLAB_RANGE_INVALID` (naming the exact gap or overlap), `422 PT_SLAB_STATE_REQUIRED`.
* **What This API Gives/Does**: Returns the newly inserted slab set.

### 99. Deactivate a State's PT Slabs
* **API Name / Purpose**: Soft-delete a state's active professional tax slabs.
* **HTTP Method**: `DELETE`
* **Endpoint / Route**: `/api/v1/payroll/hr/statutory/pt-slabs/states/:stateCode`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `stateCode` (Path, String).
* **Request JSON Payload**: None.
* **Detailed API Function**: Soft-deletes (sets `deleted_at`) all currently active PT slabs for the specified state.
* **Error Handling**: `404 PT_SLAB_STATE_NOT_FOUND` when no active slabs exist for the state, `422 PT_SLAB_STATE_REQUIRED`.
* **What This API Gives/Does**: Confirms deactivation of the slabs.

### 100. Bootstrap Tax Tables
* **API Name / Purpose**: Idempotently seed default income-tax regimes and slabs.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/bootstrap`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**: `{ "financial_year": "YYYY-YY" }`
* **Detailed API Function**: Seeds the default old and new income-tax regimes along with their corresponding slabs for the specified financial year. Only inserts missing `(financial_year, code)` pairs, never overwriting HR-edited regimes. It is audit-logged.
* **Error Handling**: `400/422` validation errors for invalid financial year format.
* **What This API Gives/Does**: Returns `{ created: [...], skipped: [...] }` to indicate newly added versus pre-existing regimes.

### 101. List Tax Regimes
* **API Name / Purpose**: List tax regimes available for a financial year.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/regimes`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns the tax regimes available in the given financial year along with their slab counts.
* **Error Handling**: Standard auth errors; `422 INVALID_FINANCIAL_YEAR` if query param format is invalid.
* **What This API Gives/Does**: An array of regimes.

### 102. Update a Tax Regime
* **API Name / Purpose**: Update tax regime parameters.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/regimes/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: Accepts fields to update (min 1): `name`, `standard_deduction`, `allows_chapter_via`, `allows_hra_exemption`, `chapter_via_limits` (Object map), `rebate_87a_income_limit`, `rebate_87a_max_amount`, `surcharge_slabs` (Array of objects), `is_default`, `is_active`.
* **Detailed API Function**: Partially updates the tax regime. If `is_default` is set to true, it atomically clears the default flag from sibling regimes. Note that `chapter_via_limits` and `surcharge_slabs` are wholesale replacements.
* **Error Handling**: `404 TAX_REGIME_NOT_FOUND` if regime ID does not exist, `422` validation errors.
* **What This API Gives/Does**: Returns the updated tax regime.

### 103. Get a Regime's Slabs
* **API Name / Purpose**: List the tax slabs for a specific regime.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/regimes/:id/slabs`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: None.
* **Detailed API Function**: Fetches all tax slabs associated with the regime, optionally grouped by `age_band`.
* **Error Handling**: `404 TAX_REGIME_NOT_FOUND` if regime ID does not exist or belongs to another tenant.
* **What This API Gives/Does**: An array of tax slabs.

### 104. Replace a Regime's Slabs
* **API Name / Purpose**: Atomically replace a tax regime's slabs.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/regimes/:id/slabs`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: 
  * `slabs` (Array of objects): `age_band`, `from_amount`, `to_amount`, `rate_percent`, `display_order`.
* **Detailed API Function**: Replaces the entire slab set for one or more age bands atomically. Validates half-open `[from, to)` contiguity per age band to ensure no gaps or overlaps exist.
* **Error Handling**: `404 TAX_REGIME_NOT_FOUND`, `422 TAX_SLAB_RANGE_INVALID` (if range is not contiguous or has gaps/overlaps).
* **What This API Gives/Does**: Returns the newly inserted slab set.

### 105. Declaration Verification Queue
* **API Name / Purpose**: Fetch the queue of employee investment declarations.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/declarations`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `financial_year` (`YYYY-YY`), `status` (Enum: draft, submitted, under_review, verified, partially_verified, rejected), `user_id` (UUID), `page`, `limit`.
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns paginated declaration headers. To maintain PAN secrecy, sensitive items like landlord PANs/rents do not surface in this list view.
* **Error Handling**: Standard auth errors; `400/422` query validation errors on invalid filters.
* **What This API Gives/Does**: An array of declaration headers for the verification queue.

### 106. Get a Declaration
* **API Name / Purpose**: Get a detailed investment declaration.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/declarations/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: None.
* **Detailed API Function**: Fetches the declaration header along with all its specific declared items and the employee's current tax regime.
* **Error Handling**: `404 DECLARATION_NOT_FOUND`.
* **What This API Gives/Does**: Detailed declaration record including all line items.

### 107. Verify a Declaration
* **API Name / Purpose**: HR verification of an employee's investment declaration.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/declarations/:id/verify`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: 
  * `items` (Array): `{ item_id, verified_amount, proof_status, proof_reference, verifier_remarks }`
  * `remarks` (String, Optional)
* **Detailed API Function**: Applies verification decisions item-by-item. `verified_amount` is checked to not exceed `declared_amount`. Uses an advisory lock. If a proof is rejected, the amount is coerced to zero. Changes the declaration header status to `verified` if all items are verified, otherwise `partially_verified`.
* **Error Handling**: `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_NOT_VERIFIABLE` (if declaration is not in submitted or under_review status), `403 DECLARATION_ITEM_FORBIDDEN` (if item does not belong to declaration), `422 VERIFIED_EXCEEDS_DECLARED`, `422 INVALID_PROOF_STATUS`.
* **What This API Gives/Does**: Returns the verified declaration.

### 108. Reject a Declaration
* **API Name / Purpose**: Reject a declaration entirely.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/declarations/:id/reject`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: `{ "rejection_reason": "string" }`
* **Detailed API Function**: Sets the declaration header to `rejected`. Automatically updates every line item to `verified_amount = 0` and `proof_status = 'rejected'`. Protected by an advisory lock.
* **Error Handling**: `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_NOT_VERIFIABLE` (must be in submitted or under_review status), `422 REJECTION_REASON_REQUIRED`.
* **What This API Gives/Does**: Returns the rejected declaration.

### 109. Reopen a Declaration
* **API Name / Purpose**: Reopen a submitted or verified declaration for editing.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/declarations/:id/reopen`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID).
* **Request JSON Payload**: `{ "reason": "string" }`
* **Detailed API Function**: Returns the declaration to `draft` status so the employee can edit it. Preserves `submitted_at` and `proof_deadline` (EC-43). Increments `reopened_count`.
* **Error Handling**: `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_ALREADY_DRAFT`, `422 REOPEN_REASON_REQUIRED`.
* **What This API Gives/Does**: Returns the reopened declaration.

### 110. Employee Tax Summary
* **API Name / Purpose**: View an employee's tax summary for a financial year.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/summary`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID); `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: None.
* **Detailed API Function**: Fetches the employee's chosen regime, previous employer figures, YTD actuals (derived from calculation engine), declaration status, and finalization state.
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: Detailed tax overview payload.

### 111. Override Employee Regime
* **API Name / Purpose**: HR forcibly overrides an employee's tax regime.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/regime`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID); `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: `{ "regime_code": "old" | "new" }`
* **Detailed API Function**: Sets the employee's regime with `regime_source = 'hr'`. Blocked once the financial year is finalized.
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `409 FINANCIAL_YEAR_FINALIZED`, `422 TAX_REGIME_UNAVAILABLE`, `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: The updated regime setting.

### 112. Set Previous-Employer Figures
* **API Name / Purpose**: Update Form 12B previous-employer financial figures.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/previous-employer`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID); `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: Optional money fields: `previous_employer_gross`, `previous_employer_taxable`, `previous_employer_tds`, `previous_employer_pf`, `previous_employer_pt`.
* **Detailed API Function**: Records income and tax deducted by previous employers. Any unspecified fields default to zero. Blocked once the financial year is finalized.
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `409 FINANCIAL_YEAR_FINALIZED`, `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: The updated previous-employer record.

### 113. Employee Tax Projection
* **API Name / Purpose**: Trace and debug an employee's tax projection.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/projection`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID); `financial_year` (Query, Optional, `YYYY-YY`), `as_of_period` (Query, Optional, `YYYY-MM`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Computes and returns the full calculation trace detailing how TDS and tax liabilities are generated. Does not persist any data.
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`, `422 PERIOD_OUTSIDE_FINANCIAL_YEAR` (if as_of_period falls outside the FY).
* **What This API Gives/Does**: A deep calculation trace payload.

### 114. Form 16 Part-B Dataset
* **API Name / Purpose**: Fetch the dataset for Form 16 Part-B.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID), `financialYear` (Path, `YYYY-YY`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns the finalized `form16_snapshot` if the FY is finalized. Otherwise, returns a provisional assembly dynamically generated and marked `is_provisional: true`.
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`, `422 NO_PAYROLL_IN_FINANCIAL_YEAR` (if no payroll exists to build provisional).
* **What This API Gives/Does**: Form 16 Part-B data structure.

### 115. Set Form 16 Part-A Reference
* **API Name / Purpose**: Record the acknowledgment for Form 16 Part-A.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/part-a`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID), `financialYear` (Path, `YYYY-YY`).
* **Request JSON Payload**: `{ "ack_number": "...", "issued_on": "YYYY-MM-DD", "reference_url": "..." }`
* **Detailed API Function**: Records the Part-A reference acknowledgment metadata. Does not store a file (D-29).
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `422 FORM16_PART_A_ACK_REQUIRED` (if ack_number is missing or empty), `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: Updated reference tracking metadata.

### 116. Finalize One Employee's FY
* **API Name / Purpose**: Finalize tax records for a single employee.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/employees/:userId/tax/financial-years/:financialYear/finalize`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `userId` (Path, UUID), `financialYear` (Path, `YYYY-YY`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Freezes the Form 16 snapshot, locking it permanently. Secured under a per-employee advisory lock (`payroll:tax:{userId}:{fy}`). Idempotent (returns `already_finalized: true` on repeated call).
* **Error Handling**: `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`, `422 NO_PAYROLL_IN_FINANCIAL_YEAR` (zero closed payroll items in FY), `422 TAX_TABLES_MISSING`, `422 FORM16_RECONCILIATION_FAILED`.
* **What This API Gives/Does**: The finalized tax record.

### 117. Finalize FY Org-Wide
* **API Name / Purpose**: Bulk finalize tax records organization-wide.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/financial-years/:financialYear/finalize`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `financialYear` (Path, `YYYY-YY`).
* **Request JSON Payload**: `{ "acknowledge_missing_months": false, "reason": "string" }`
* **Detailed API Function**: Batches finalization across all eligible employees in the org. If gaps exist in the FY (missing closed payroll months), it requires `acknowledge_missing_months: true` and a non-empty `reason` to proceed. Resumable and per-employee error-isolated.
* **Error Handling**: `409 FINANCIAL_YEAR_INCOMPLETE` (if missing closed payroll months without acknowledgment), `422 ACKNOWLEDGE_REASON_REQUIRED` (if acknowledge_missing_months is true but reason is empty), `422 TAX_TABLES_MISSING`, `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: Summary of successful and failed finalizations.

### 118. Statutory Summary (Challan View)
* **API Name / Purpose**: Retrieve the organization-wide statutory challan summary.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/tax/financial-years/:financialYear/statutory-summary`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `financialYear` (Path, `YYYY-YY`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Aggregates month-by-month PF, ESI, PT, and TDS alongside headcount figures using only approved/paid items.
* **Error Handling**: Standard auth errors; `422 INVALID_FINANCIAL_YEAR` if parameter format is invalid.
* **What This API Gives/Does**: Comprehensive statutory aggregation payload.

---

## Employee Self-Service APIs — `/api/v1/payroll/me` (Phase 4)

*Auth stack: `authenticate` → `requireFeature('payroll.access')`. No `authorize()` wrapper; these APIs always execute against the authenticated user token (`req.user.id`).*

### 119. My Tax Summary
* **API Name / Purpose**: Employee views their own tax summary.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/summary`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: None.
* **Detailed API Function**: Displays the employee's tax regime, YTD aggregated TDS/PF/ESI/PT, projected liability, and declaration statuses.
* **Error Handling**: Standard auth errors (`401 Unauthorized`); `422 INVALID_FINANCIAL_YEAR` if query param format is invalid.
* **What This API Gives/Does**: Tax overview payload.

### 120. My Tax Projection
* **API Name / Purpose**: Employee views their own tax projection trace.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/projection`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`), `as_of_period` (Query, Optional, `YYYY-MM`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Similar to #113, gives the employee full visibility into how their current tax liabilities are calculated.
* **Error Handling**: `422 INVALID_FINANCIAL_YEAR`, `422 PERIOD_OUTSIDE_FINANCIAL_YEAR` (if as_of_period falls outside the FY).
* **What This API Gives/Does**: Complete, deep calculation trace.

### 121. My Monthly Tax Breakup
* **API Name / Purpose**: Employee views their monthly tax statement data.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/monthly`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: None.
* **Detailed API Function**: Month-by-month breakdown of taxes (TDS, PF, ESI, PT) collected over the fiscal year based strictly on approved payroll runs.
* **Error Handling**: Standard auth errors; `422 INVALID_FINANCIAL_YEAR` if query param format is invalid.
* **What This API Gives/Does**: Array of monthly statutory deductions.

### 122. My Declaration
* **API Name / Purpose**: Employee fetches their own investment declaration.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/declarations`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns the investment declaration draft or submitted copy, specific items, proof deadlines, and the status of the declaration window.
* **Error Handling**: Standard auth errors; `422 INVALID_FINANCIAL_YEAR` if query param format is invalid.
* **What This API Gives/Does**: Declaration items and state.

### 123. Upsert My Declaration
* **API Name / Purpose**: Employee creates or updates their investment declaration items.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/declarations`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: 
  * `items`: Array of items. Max 150 items. Fields per item: `item_id` (UUID, Optional), `section` (String, Required), `sub_category` (String, Optional), `declared_amount` (Money, Required), `proof_reference` (String, Optional), `metadata` (Object, Optional).
* **Detailed API Function**: A wholesale replace-set operation. Validates while in `draft` state and within the submission window. Prevents editing auto-synchronized items like EPF (`sub_category: 'EPF_AUTO'`). Preserves existing verifications on unchanged items.
* **Error Handling**: `409 DECLARATION_NOT_DRAFT`, `422 DECLARATION_WINDOW_CLOSED`, `422 RESERVED_DECLARATION_SUB_CATEGORY` (if sub_category is EPF_AUTO), `422 INVALID_DECLARATION_ITEM` (max 150 items constraint, missing section).
* **What This API Gives/Does**: The updated declaration.

### 124. Submit My Declaration
* **API Name / Purpose**: Employee submits their declaration for HR review.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/declarations/submit`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: None.
* **Detailed API Function**: Transitions the declaration from `draft` to `submitted`. Freezes the `proof_deadline` upon the first submission. 
* **Error Handling**: `404 DECLARATION_NOT_FOUND` (no draft exists for the FY), `409 DECLARATION_NOT_DRAFT` (if called while already submitted or under review), `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: The submitted declaration.

### 125. Switch My Regime
* **API Name / Purpose**: Employee chooses between old/new tax regimes.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/regime`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: `{ "regime_code": "old" | "new" }`
* **Detailed API Function**: Sets the tax regime. Denied if `allow_employee_regime_switch` is disabled by the organization, or if the FY is finalized.
* **Error Handling**: `403 REGIME_SWITCH_NOT_ALLOWED`, `409 FINANCIAL_YEAR_FINALIZED`, `422 TAX_REGIME_UNAVAILABLE`, `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: The selected regime context.

### 126. My Form 16
* **API Name / Purpose**: Employee downloads their Form 16 dataset.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/form16/:financialYear`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financialYear` (Path, `YYYY-YY`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Exposes the Part-B Form 16 data to the employee. It will return a 404 until the FY is fully finalized by HR.
* **Error Handling**: `404 FORM16_NOT_FINALIZED` (employee never receives provisional Form 16), `422 INVALID_FINANCIAL_YEAR`.
* **What This API Gives/Does**: The Form 16 data payload.

### 127. Record My Declaration Proofs
* **API Name / Purpose**: Employee uploads proofs against submitted declaration items.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/me/tax/declarations/proofs`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `financial_year` (Query, Optional, `YYYY-YY`, defaults to current FY).
* **Request JSON Payload**: `{ "items": [{ "item_id": "uuid", "proof_reference": "string" }] }`
* **Detailed API Function**: Records proof references for specific items and transitions their status to `submitted`. Executed without reopening the entire declaration. Allowed while status is `submitted` or `under_review`, provided the item is not `rejected`. Cannot touch `declared_amount`.
* **Error Handling**: `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_NOT_SUBMITTED` (only allowed while submitted or under_review), `403 DECLARATION_ITEM_FORBIDDEN` (item must belong to declaration), `422 INVALID_DECLARATION_ITEM`.
* **What This API Gives/Does**: Updates specific proof references in the declaration.

---

# Phase 5: Reimbursements, Benefits & Secure Documents

## 1. HR Administration APIs — `/api/v1/payroll/hr` (Phase 5)

*Auth stack for every route below: `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`.*

### 128. Create Reimbursement Category
* **API Name / Purpose**: Define an organizational expense reimbursement category with limits and tax treatment.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/categories`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**:
  ```json
  {
    "code": "TRAVEL",
    "name": "Travel & Conveyance",
    "description": "Client site travel, airfare, local transit",
    "max_claim_amount": 1500000,
    "monthly_limit": 3000000,
    "annual_limit": 15000000,
    "requires_receipt": true,
    "is_taxable": false,
    "is_active": true
  }
  ```
* **Request Fields**:
  * `code` (String, Required): Unique category identifier (`^[A-Z0-9_]+$`, max 50 chars).
  * `name` (String, Required): Category display name (max 100 chars).
  * `description` (String, Optional): Operational policy description.
  * `max_claim_amount` (Money, Optional): Maximum amount per single line item.
  * `monthly_limit` (Money, Optional): Monthly budget cap per employee.
  * `annual_limit` (Money, Optional): Annual financial year budget cap per employee.
  * `requires_receipt` (Boolean, Optional, default `true`): Mandatory receipt attachment flag.
  * `is_taxable` (Boolean, Optional, default `false`): Non-taxable reimbursement vs. taxable perquisite.
  * `is_active` (Boolean, Optional, default `true`): Active status flag.
* **Detailed API Function**: Inserts a new reimbursement category for the tenant. Validates uniqueness of `code` and verifies the limit hierarchy constraint (`max_claim_amount <= monthly_limit <= annual_limit`). Audit-logged.
* **Error Handling**: `409 REIMBURSEMENT_CATEGORY_EXISTS`, `422 INVALID_LIMIT_HIERARCHY`, `400/422` validation errors.
* **What This API Gives/Does**: Returns the created category record (201 Created).

### 129. List Reimbursement Categories
* **API Name / Purpose**: Retrieve all reimbursement categories for the organization.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/categories`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `is_active` (Boolean, Optional), `is_taxable` (Boolean, Optional), `requires_receipt` (Boolean, Optional), `search` (String, Optional).
* **Request JSON Payload**: None.
* **Detailed API Function**: Lists all reimbursement categories scoped to the authenticated tenant, with optional filtering.
* **Error Handling**: Standard auth errors; `422` validation for invalid query parameters.
* **What This API Gives/Does**: Array of category objects.

### 130. Get Reimbursement Category
* **API Name / Purpose**: Fetch detailed configuration of a single reimbursement category.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns the category entity matching `:id` within the organization.
* **Error Handling**: `404 CATEGORY_NOT_FOUND`.
* **What This API Gives/Does**: Single category object.

### 131. Update Reimbursement Category
* **API Name / Purpose**: Update an existing reimbursement category's parameters.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: Accepts any subset of `name`, `description`, `max_claim_amount`, `monthly_limit`, `annual_limit`, `requires_receipt`, `is_taxable`, `is_active` (`code` is immutable). Min 1 field required.
* **Detailed API Function**: Partially updates the category. Re-evaluates limit hierarchy assertions against new and existing limits. Affects subsequent claim authoring and validations. Audit-logged.
* **Error Handling**: `404 CATEGORY_NOT_FOUND`, `409 IMMUTABLE_CATEGORY_CODE`, `422 INVALID_LIMIT_HIERARCHY`.
* **What This API Gives/Does**: Returns the updated category entity.

### 132. Deactivate Reimbursement Category
* **API Name / Purpose**: Soft-delete / deactivate a reimbursement category.
* **HTTP Method**: `DELETE`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Sets `is_active = false`. Rejects deactivation if there are active, unfinalized claims currently referencing this category. Never hard-deletes.
* **Error Handling**: `404 CATEGORY_NOT_FOUND`, `409 CATEGORY_HAS_ACTIVE_CLAIMS`.
* **What This API Gives/Does**: Returns the deactivated category record.

### 133. List Organization Reimbursement Claims
* **API Name / Purpose**: List all employee reimbursement claims across the organization.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/claims`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `status` (Enum: `draft`, `submitted`, `under_review`, `approved`, `rejected`, `paid`, `cancelled`), `user_id` (UUID), `period_month` (`YYYY-MM`), `payout_period_month` (`YYYY-MM`), `page` (Integer, default 1), `limit` (Integer, default 20).
* **Request JSON Payload**: None.
* **Detailed API Function**: Retrieves paginated list of claims with eager-loaded claimant summaries, line-item counts, total amounts, and current approval statuses.
* **Error Handling**: Standard auth errors; `422` on invalid query filters.
* **What This API Gives/Does**: Paginated `{ rows: [...], count, page, total_pages }`.

### 134. Get Claim Details (HR View)
* **API Name / Purpose**: View full details, items, receipts, and audit trail of a reimbursement claim.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/claims/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns full claim record: line items, expense dates, merchants, receipt references, attached document IDs, complete approval history with reviewer names, timestamps, trimming notes, and linked payroll run ID.
* **Error Handling**: `404 CLAIM_NOT_FOUND`.
* **What This API Gives/Does**: Full claim object with nested items, approvals, and attachments.

### 135. Approve Reimbursement Claim (HR Level 2 / Final)
* **API Name / Purpose**: Grant final Level 2 approval, trim line items, and schedule claim into a payroll run.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/claims/:id/approve`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**:
  ```json
  {
    "notes": "Verified invoices and approved for October payroll",
    "payout_period_month": "2026-10",
    "item_approvals": [
      {
        "item_id": "c7a8b9d0-1234-4567-89ab-cdef01234567",
        "approved_amount": 750000,
        "remarks": "Approved in full"
      }
    ]
  }
  ```
* **Detailed API Function**: Acquires Rank-1 run advisory lock on target payout month, followed by Rank-3 claim advisory lock (`payroll:claim:{claimId}`). Blocks self-approval (`acted_by !== claimant`). Validates trimming (`0 <= approved_amount <= claimed_amount`). If all lines trimmed to ₹0.00, auto-transitions claim to `rejected`. Automatically looks ahead up to `reimbursement_payout_lookahead_months` (default 2) to find the earliest open regular payroll run if `payout_period_month` is omitted. Marks target run as `requires_recalculation = true` (D-18). Transitions claim status to `approved`.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `409 CLAIM_NOT_SUBMITTED`, `403 SELF_APPROVAL_FORBIDDEN`, `422 INVALID_TRIMMED_AMOUNT`, `422 NO_OPEN_PAYOUT_PERIOD`, `409 RUN_CALCULATION_IN_PROGRESS`.
* **What This API Gives/Does**: Returns the approved claim with stamped `payout_period_month` and finalized `approved_amount`.

### 136. Reject Reimbursement Claim (HR Review)
* **API Name / Purpose**: Reject a reimbursement claim with a mandatory justification.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/claims/:id/reject`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: `{ "rejection_reason": "Receipts do not comply with company travel policy" }` (Required, min 5 chars).
* **Detailed API Function**: Transitions claim to `rejected`. Restores claimant's monthly/annual category headroom budget. Prohibits self-approval/rejection. Records reviewer identity and timestamp.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `409 CLAIM_NOT_ACTIONABLE` (if already approved/paid/cancelled), `403 SELF_APPROVAL_FORBIDDEN`, `422 REJECTION_REASON_REQUIRED`.
* **What This API Gives/Does**: Returns claim in `rejected` status.

### 137. Mark Reimbursement Claim Paid (Direct Payout)
* **API Name / Purpose**: Disburse reimbursement directly off-cycle outside regular payroll.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/reimbursements/claims/:id/mark-paid`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**:
  ```json
  {
    "payment_method": "bank_transfer",
    "payment_reference": "NEFT-HDFC-994827104",
    "paid_at": "2026-10-15T10:30:00Z",
    "notes": "Off-cycle direct disbursement via treasury"
  }
  ```
* **Detailed API Function**: Transitions an `approved` claim to `paid` status without waiting for monthly payroll execution. Records payment method, reference number, and disbursement timestamp. Prevents payroll run from double-injecting the claim into payslips.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `409 CLAIM_NOT_APPROVED`, `422 INVALID_PAYMENT_METHOD`.
* **What This API Gives/Does**: Stamped claim in `paid` terminal status.

### 138. Create Benefit Plan
* **API Name / Purpose**: Create a corporate benefit, health, or life insurance plan.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/plans`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**:
  ```json
  {
    "code": "GMC_500K",
    "name": "Group Medical Cover ₹5L",
    "benefit_type": "health_insurance",
    "provider_name": "Star Health Insurance",
    "policy_number": "SH-CORP-2026-001",
    "employee_monthly_deduction": 150000,
    "employer_monthly_contribution": 300000,
    "coverage_details": {
      "sum_insured": 500000,
      "room_rent_cap": 5000,
      "copay": 0
    },
    "is_active": true
  }
  ```
* **Request Fields**:
  * `code` (String, Required): Unique identifier (`^[A-Z0-9_]+$`).
  * `name` (String, Required): Plan title.
  * `benefit_type` (Enum, Required): `health_insurance` | `life_insurance` | `accidental_insurance` | `wellness` | `retirement` | `other`.
  * `provider_name` (String, Required): Insurance company or carrier name.
  * `policy_number` (String, Optional): Master agreement policy number.
  * `employee_monthly_deduction` (Money, Required, default 0): Fixed monthly amount deducted from employee net pay (Step 8a').
  * `employer_monthly_contribution` (Money, Required, default 0): Fixed monthly subsidy paid by employer (tracked in CTC).
  * `coverage_details` (Object, Optional): JSON metadata of policy rules.
  * `is_active` (Boolean, Optional, default `true`).
* **Detailed API Function**: Inserts new corporate benefit plan. Asserts code uniqueness within tenant. Validates non-negative amounts. Audit-logged.
* **Error Handling**: `409 BENEFIT_PLAN_EXISTS`, `422 INVALID_BENEFIT_TYPE`, `400/422` validation.
* **What This API Gives/Does**: Returns created benefit plan object (201 Created).

### 139. List Benefit Plans
* **API Name / Purpose**: Retrieve organizational benefit and insurance catalog.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/plans`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `benefit_type` (Enum, Optional), `is_active` (Boolean, Optional), `search` (String, Optional).
* **Request JSON Payload**: None.
* **Detailed API Function**: Lists all benefit plans configured for the organization with active enrollment counts.
* **What This API Gives/Does**: Array of benefit plan objects.

### 140. Get Benefit Plan
* **API Name / Purpose**: View details of a specific benefit plan.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/plans/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns single benefit plan with full coverage metadata.
* **Error Handling**: `404 PLAN_NOT_FOUND`.
* **What This API Gives/Does**: Benefit plan object.

### 141. Update Benefit Plan
* **API Name / Purpose**: Update parameters of an existing benefit plan.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/plans/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: Accepts any subset of `name`, `provider_name`, `policy_number`, `employee_monthly_deduction`, `employer_monthly_contribution`, `coverage_details`, `is_active`. (`code` and `benefit_type` are immutable). Min 1 field required.
* **Detailed API Function**: Partially updates the benefit plan. Rate modifications take effect in future payroll runs. Audit-logged.
* **Error Handling**: `404 PLAN_NOT_FOUND`, `409 IMMUTABLE_PLAN_FIELD`.
* **What This API Gives/Does**: Updated benefit plan object.

### 142. Deactivate Benefit Plan
* **API Name / Purpose**: Soft-delete / deactivate a benefit plan.
* **HTTP Method**: `DELETE`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/plans/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Sets `is_active = false`. Rejects deactivation if active employee enrollments exist.
* **Error Handling**: `404 PLAN_NOT_FOUND`, `409 PLAN_HAS_ACTIVE_ENROLLMENTS`.
* **What This API Gives/Does**: Deactivated plan record.

### 143. Enroll Employee in Benefit Plan
* **API Name / Purpose**: Enroll an employee in a corporate benefit plan with coverage tier and dependents.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/enrollments`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**:
  ```json
  {
    "user_id": "c7a8b9d0-1234-4567-89ab-cdef01234567",
    "plan_id": "b1a2c3d4-5678-90ab-cdef-1234567890ab",
    "policy_number": "IND-MBR-9842",
    "start_date": "2026-10-01",
    "end_date": null,
    "coverage_tier": "family_floater",
    "dependents": [
      { "name": "Pooja Sharma", "relationship": "spouse", "dob": "1992-05-14" }
    ]
  }
  ```
* **Detailed API Function**: Creates employee enrollment. Acquires advisory lock `payroll:benefit:{userId}`. Validates plan is active. Enforces PostgreSQL `btree_gist` EXCLUDE constraint and service assertion to prevent concurrent overlapping enrollments in the same plan. Triggers full monthly premium in any month touching the enrollment window (no mid-month proration, D-36).
* **Error Handling**: `404 PLAN_NOT_FOUND`, `404 USER_NOT_FOUND`, `409 ENROLLMENT_PERIOD_OVERLAP`, `422 INVALID_COVERAGE_TIER`.
* **What This API Gives/Does**: Created enrollment entity (201 Created).

### 144. List Organization Benefit Enrollments
* **API Name / Purpose**: List employee benefit enrollments across the organization.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/enrollments`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `user_id` (UUID), `plan_id` (UUID), `status` (`active`, `cancelled`, `expired`), `page`, `limit`.
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns paginated list of enrollments with employee details, plan codes, deduction amounts, and status.
* **What This API Gives/Does**: Paginated `{ rows, count, page, total_pages }`.

### 145. Get Benefit Enrollment Details
* **API Name / Purpose**: Fetch full details of an employee's benefit enrollment.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/enrollments/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns enrollment record including policy number, coverage tier, full dependent roster, and historical payroll deduction timestamps.
* **Error Handling**: `404 ENROLLMENT_NOT_FOUND`.
* **What This API Gives/Does**: Enrollment object with nested plan and dependents.

### 146. Update Benefit Enrollment
* **API Name / Purpose**: Update an existing benefit enrollment (tier, policy ID, dependents, end date).
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/enrollments/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: Accepts any subset of `policy_number`, `end_date`, `coverage_tier`, `dependents`, `status`.
* **Detailed API Function**: Updates enrollment parameters. If `end_date` is updated, verifies no overlap with sibling enrollments. Does not retroactively alter closed payroll runs.
* **Error Handling**: `404 ENROLLMENT_NOT_FOUND`, `409 ENROLLMENT_PERIOD_OVERLAP`, `422 INVALID_DATE_RANGE`.
* **What This API Gives/Does**: Updated enrollment object.

### 147. Cancel Benefit Enrollment
* **API Name / Purpose**: Cancel / terminate an employee's benefit enrollment.
* **HTTP Method**: `DELETE`
* **Endpoint / Route**: `/api/v1/payroll/hr/benefits/enrollments/:id`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Sets status to `cancelled`. Premium deductions cease in subsequent payroll runs. Historical deductions remain intact.
* **Error Handling**: `404 ENROLLMENT_NOT_FOUND`, `409 ENROLLMENT_ALREADY_INACTIVE`.
* **What This API Gives/Does**: Cancelled enrollment entity.

### 148. Request Pre-Signed Document Upload URL (HR Context)
* **API Name / Purpose**: Obtain a pre-signed S3 PUT URL for uploading attachments (Form 16 Part A, tax proofs, receipts).
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/documents/upload-url`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**:
  ```json
  {
    "entity_type": "form16_part_a",
    "entity_id": "c7a8b9d0-1234-4567-89ab-cdef01234567",
    "file_name": "FORM16A_2025-26.pdf",
    "mime_type": "application/pdf",
    "file_size_bytes": 1048576
  }
  ```
* **Detailed API Function**: Generates pre-signed S3 `PUT` URL with 10-minute expiration. Validates allowed MIME types (PDF, JPEG, PNG, WebP; SVG and executables strictly rejected, D-30). Size capped at 10 MB. Pre-registers document row in `pending` status.
* **Error Handling**: `422 DISALLOWED_FILE_TYPE`, `422 FILE_SIZE_EXCEEDED`, `422 INVALID_ENTITY_TYPE`.
* **What This API Gives/Does**: Returns `{ upload_url, document_id, key, expires_in_seconds }`.

### 149. Confirm Document Upload (HR Context)
* **API Name / Purpose**: Confirm an uploaded document after client successfully transmits to S3.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/hr/documents/confirm`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request JSON Payload**: `{ "document_id": "uuid" }`
* **Detailed API Function**: Performs S3 `HeadObject` check to verify the object exists in the storage bucket with expected Content-Length. Transitions document status from `pending` to `active`.
* **Error Handling**: `404 DOCUMENT_NOT_FOUND`, `422 S3_OBJECT_MISSING`, `409 DOCUMENT_ALREADY_CONFIRMED`.
* **What This API Gives/Does**: Confirmed document object with active status.

### 150. Get Pre-Signed Document Download/View URL (HR Context)
* **API Name / Purpose**: Generate an expiring pre-signed S3 GET URL to download or view an attachment.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/hr/documents/:id/url`
* **Authentication / Authorization**: Token. Roles: `hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required). Query: `disposition` (`inline` | `attachment`, default `inline`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Generates secure pre-signed S3 `GET` URL valid for 5 minutes. Binaries never flow through the application server.
* **Error Handling**: `404 DOCUMENT_NOT_FOUND`.
* **What This API Gives/Does**: `{ download_url, expires_at }`.

---

## 2. Manager APIs — `/api/v1/payroll/manager` (Phase 5)

*Auth stack for every route below: `authenticate` → `authorize(['manager', 'hr'])` → `requireFeature('payroll.access')`.*

### 151. List Team Reimbursement Claims
* **API Name / Purpose**: View pending reimbursement claims submitted by direct reports.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/manager/reimbursements/claims`
* **Authentication / Authorization**: Token. Roles: `manager, hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `status` (Enum), `period_month` (`YYYY-MM`), `page`, `limit`.
* **Request JSON Payload**: None.
* **Detailed API Function**: Enforces BOLA boundary. Only returns claims where `claimant.reporting_person_id == manager.user_id`.
* **What This API Gives/Does**: Paginated list of team claims.

### 152. Get Team Claim Details
* **API Name / Purpose**: Review items, receipts, and justification of a direct report's claim.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/manager/reimbursements/claims/:id`
* **Authentication / Authorization**: Token. Roles: `manager, hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: BOLA verification. Returns full line items, merchant details, bill references, and attached document IDs for review.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `403 FORBIDDEN_NOT_TEAM_MEMBER`.
* **What This API Gives/Does**: Team claim object with nested items.

### 153. Approve Team Reimbursement Claim (Manager Level 1)
* **API Name / Purpose**: Grant Level 1 approval on a direct report's claim with optional line-item trimming.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/manager/reimbursements/claims/:id/approve`
* **Authentication / Authorization**: Token. Roles: `manager, hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**:
  ```json
  {
    "notes": "Verified client travel bills. Approved minus non-compliant dinner.",
    "item_approvals": [
      {
        "item_id": "c7a8b9d0-1234-4567-89ab-cdef01234567",
        "approved_amount": 350000,
        "remarks": "Approved taxi travel"
      }
    ]
  }
  ```
* **Detailed API Function**: BOLA check. Prohibits self-approval (`acted_by !== claimant`). Supports line item trimming downward. If all lines trimmed to ₹0.00, transitions claim to `rejected`. Otherwise, transitions claim to `under_review` (Level 1 Approved) and routes to HR Level 2.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `403 SELF_APPROVAL_FORBIDDEN`, `403 FORBIDDEN_NOT_TEAM_MEMBER`, `409 CLAIM_NOT_IN_LEVEL1`, `422 INVALID_TRIMMED_AMOUNT`.
* **What This API Gives/Does**: Claim updated to `under_review` status.

### 154. Reject Team Reimbursement Claim
* **API Name / Purpose**: Reject a direct report's claim with mandatory justification.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/manager/reimbursements/claims/:id/reject`
* **Authentication / Authorization**: Token. Roles: `manager, hr`. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: `{ "rejection_reason": "Travel was not pre-authorized by department director" }` (Required, min 5 chars).
* **Detailed API Function**: BOLA check. Transitions claim to `rejected`. Restores employee's budget headroom. Logs manager comments.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `403 FORBIDDEN_NOT_TEAM_MEMBER`, `409 CLAIM_NOT_ACTIONABLE`, `422 REJECTION_REASON_REQUIRED`.
* **What This API Gives/Does**: Claim transitioned to `rejected`.

### 155. List Team Benefit Enrollments
* **API Name / Purpose**: View active insurance and benefit enrollments of direct reports.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/manager/benefits/enrollments`
* **Authentication / Authorization**: Token. Roles: `manager, hr`. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `status` (Optional).
* **Request JSON Payload**: None.
* **Detailed API Function**: BOLA check. Lists benefit coverages for direct reports. If `manager_can_view_team_compensation` is disabled, monetary deduction amounts are masked (`****`), but policy numbers and coverage tiers remain visible for emergency reference.
* **What This API Gives/Does**: Array of team benefit enrollment objects.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me` (Phase 5)

*Auth stack for every route below: `authenticate` → `authorize(['employee', 'manager', 'hr'])` → `requireFeature('payroll.access')`.*

### 156. Get Category Limit Headroom (Employee Self-Service)
* **API Name / Purpose**: Calculate real-time remaining spending budget in a category before claiming.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/headroom`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `category_id` (UUID, Required), `period_month` (`YYYY-MM`, Optional, default current month).
* **Request JSON Payload**: None.
* **Detailed API Function**: Aggregates all submitted, under_review, and approved claims for the employee. Returns remaining monthly limit, remaining annual limit, per-claim cap, and count of active claims.
* **Error Handling**: `404 CATEGORY_NOT_FOUND`, `422 INVALID_PERIOD_MONTH`.
* **What This API Gives/Does**: `{ remaining_monthly_limit, remaining_annual_limit, max_claim_amount, active_claims_count }`.

### 157. Create Reimbursement Claim (Draft)
* **API Name / Purpose**: Author an expense reimbursement claim draft with line items.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/claims`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request JSON Payload**:
  ```json
  {
    "title": "Mumbai Client Meeting - Oct 2026",
    "period_month": "2026-10",
    "notes": "Flights, hotel stay, and client business lunch",
    "items": [
      {
        "category_id": "c7a8b9d0-1234-4567-89ab-cdef01234567",
        "description": "Flight BLR to BOM",
        "expense_date": "2026-10-02",
        "amount": 650000,
        "merchant_name": "IndiGo Airlines",
        "receipt_reference": "INV-66291"
      }
    ]
  }
  ```
* **Detailed API Function**: Inserts claim header in `draft` status and nested claim items. Drafts do not consume budget headroom until submitted.
* **Error Handling**: `422 INVALID_PERIOD_MONTH`, `422 EMPTY_CLAIM_ITEMS`, `404 CATEGORY_NOT_FOUND`.
* **What This API Gives/Does**: Returns created draft claim object (201 Created).

### 158. List My Reimbursement Claims
* **API Name / Purpose**: View personal reimbursement claims history and progress.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/claims`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: Query parameters: `status` (Optional), `period_month` (`YYYY-MM`, Optional), `page`, `limit`.
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns paginated claims authored by the authenticated employee with item counts, approved amounts, and payout status.
* **What This API Gives/Does**: Paginated `{ rows, count, page, total_pages }`.

### 159. Get My Claim Details
* **API Name / Purpose**: View detailed line items, receipts, and approval timeline of own claim.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/claims/:id`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Ownership validation (`claim.user_id == req.user.id`). Returns items, receipts, approval progress, and scheduled payout run information.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `403 FORBIDDEN`.
* **What This API Gives/Does**: Full claim entity with nested items and timeline.

### 160. Update My Reimbursement Claim (Draft)
* **API Name / Purpose**: Modify an unsubmitted reimbursement claim draft.
* **HTTP Method**: `PUT`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/claims/:id`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: Accepts any subset of `title`, `period_month`, `notes`, `items`.
* **Detailed API Function**: Modifies claim while in `draft` status. Replaces or updates items. Blocked if claim has been submitted or processed.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `409 CLAIM_NOT_DRAFT`, `403 FORBIDDEN`.
* **What This API Gives/Does**: Updated draft claim entity.

### 161. Submit My Reimbursement Claim
* **API Name / Purpose**: Submit a draft claim into the multi-tier review queue.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/claims/:id/submit`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Verifies claim has at least one item, amounts are positive, category limits and headroom are respected, and receipts are attached for mandatory categories. Materializes approval chain (Level 1 Manager + Level 2 HR, or direct HR). Assigns human reference number `RC-YYYYMM-NNNN`. Transitions status from `draft` to `submitted`.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `409 CLAIM_NOT_DRAFT`, `422 CATEGORY_LIMIT_EXCEEDED`, `422 RECEIPT_REQUIRED`.
* **What This API Gives/Does**: Submitted claim object.

### 162. Cancel My Reimbursement Claim
* **API Name / Purpose**: Withdraw an expense claim.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/me/reimbursements/claims/:id/cancel`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required).
* **Request JSON Payload**: None.
* **Detailed API Function**: Claimant cancellation rights (§7.4a). Permitted while in `draft`, `submitted`, or `under_review` (even after Level 1 Manager approval, provided HR has not granted final approval). Forbidden once `approved` or `paid`. Releases budget headroom. Transitions status to `cancelled`.
* **Error Handling**: `404 CLAIM_NOT_FOUND`, `409 CLAIM_CANNOT_BE_CANCELLED`, `403 FORBIDDEN`.
* **What This API Gives/Does**: Cancelled claim record.

### 163. List My Active & Past Benefit Enrollments
* **API Name / Purpose**: View personal group insurance plans, policy IDs, and covered dependents.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/benefits/enrollments`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: None.
* **Request JSON Payload**: None.
* **Detailed API Function**: Returns caller's benefit coverages, policy numbers, dependent roster, coverage tier, employee monthly deduction, and employer subsidy.
* **What This API Gives/Does**: Array of personal benefit enrollments.

### 164. Request Pre-Signed Document Upload URL (Employee Self-Service)
* **API Name / Purpose**: Obtain a pre-signed S3 PUT URL for uploading receipts or tax proofs.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/me/documents/upload-url`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request JSON Payload**:
  ```json
  {
    "entity_type": "reimbursement_receipt",
    "entity_id": "c7a8b9d0-1234-4567-89ab-cdef01234567",
    "file_name": "taxi_bill.pdf",
    "mime_type": "application/pdf",
    "file_size_bytes": 524288
  }
  ```
* **Detailed API Function**: S3 pre-signed `PUT` URL (10-minute TTL). Validates caller owns the target entity (`entity_id`). Blocks SVG/executables. Max 10 MB. Pre-registers document in `pending` status.
* **Error Handling**: `403 FORBIDDEN_NOT_ENTITY_OWNER`, `422 DISALLOWED_FILE_TYPE`, `422 FILE_SIZE_EXCEEDED`.
* **What This API Gives/Does**: `{ upload_url, document_id, key, expires_in_seconds }`.

### 165. Confirm Document Upload (Employee Self-Service)
* **API Name / Purpose**: Finalize uploaded receipt or proof after browser transmits to S3.
* **HTTP Method**: `POST`
* **Endpoint / Route**: `/api/v1/payroll/me/documents/confirm`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request JSON Payload**: `{ "document_id": "uuid" }`
* **Detailed API Function**: Verifies S3 `HeadObject` for uploaded file. Ownership check. Transitions document record to `active`.
* **Error Handling**: `404 DOCUMENT_NOT_FOUND`, `403 FORBIDDEN`, `422 S3_OBJECT_MISSING`.
* **What This API Gives/Does**: Confirmed document object.

### 166. Get Pre-Signed Document Download/View URL (Employee Self-Service)
* **API Name / Purpose**: Generate a temporary pre-signed URL to view own receipt, tax proof, or Form 16 Part A.
* **HTTP Method**: `GET`
* **Endpoint / Route**: `/api/v1/payroll/me/documents/:id/url`
* **Authentication / Authorization**: Token. Feature: `payroll.access`.
* **Request Parameters**: `id` (Path, UUID, Required). Query: `disposition` (`inline` | `attachment`).
* **Request JSON Payload**: None.
* **Detailed API Function**: Generates expiring pre-signed S3 `GET` URL (5-minute TTL). Caller must be owner of the document or have authorized role.
* **Error Handling**: `404 DOCUMENT_NOT_FOUND`, `403 FORBIDDEN`.
* **What This API Gives/Does**: `{ download_url, expires_at }`.

---

# Phase 6 APIs — Delivery Layer (Payslips, Reports, Exports, Bank Advice)

> **Phase 6 Invariants:** 
> **1. Delivery Layer Only:** Phase 6 performs no payroll math. It surfaces figures calculated by earlier phases.
> **2. Payslip Immutability (D-39):** A generated payslip freezes the employee's profile, dimensions, and financial numbers as they stood at approval. Subsequent profile mutations never alter a published payslip.
> **3. Safe Export Lifecycle (D-48):** Every PDF, ZIP, and CSV stream opens an audit row in `payroll_report_exports` BEFORE the first byte is transmitted. Stream failure marks the row as failed.
> **4. The Release Gate (D-44):** Auto-publish configurations dictate if payslips are immediately visible or held for HR review. A held payslip behaves byte-identically to a missing one (403/404) for unauthorized viewers.

## 167. Get Run Payslip Index
* **API Name / Purpose:** Get Run Payslip Index. Retrieves a paginated index of all payslips for a specific payroll run.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/payslips`
* **Authentication / Authorization:** Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  * `id` (Path, UUID, Required): The Payroll Run ID.
  * `status` (Query, Enum: `active`, `superseded`, `revoked`, Optional)
  * `visible_to_employee` (Query, Boolean, Optional)
  * `email_status` (Query, Enum: `not_requested`, `pending`, `sending`, `sent`, `failed`, Optional)
  * `department_id` (Query, UUID, Optional)
  * `q` (Query, String, Optional): Search term against employee code/name in the snapshot.
  * `page` (Query, Integer, Optional, default `1`, min `1`)
  * `limit` (Query, Integer, Optional, default `50`, max `200`)
* **Request JSON Payload:** None
* **Detailed API Function:** Queries the `payslips` table filtered by the run ID. HR ignores `visible_to_employee` gates and sees all rows (including held and superseded).
* **Business/User-Facing Behavior:** HR uses this to review payslips generated by an approved run before deciding to release them, or to track delivery status.
* **Response Structure:**
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
      "engine_version": 4,
      "approved_at": "2026-03-28T09:00:00.000Z",
      "paid_at": null
    },
    "pagination": { "page": 1, "limit": 50, "total": 3000, "total_pages": 60 }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | ----- | ---- | -------- | ----------- | ---------------- |
  | `data[].payslip_id` | UUID | No | Payslip ID | Unique identifier for the payslip row |
  | `data[].gross_earnings` | String | No | Gross earnings | Derived directly from the frozen snapshot |
  | `data[].email_status` | String | No | Email delivery state | `not_requested`, `pending`, `sending`, `sent`, `failed` |
  | `run` | Object | No | Run Context | Status and metadata of the parent run |
  | `pagination` | Object | No | Paging Info | Standard pagination wrapper |
* **Error Handling:**
  - `404 RUN_NOT_FOUND`: The payroll run does not exist.
  - `400 Validation Error`: Standard Joi failure.
* **Idempotency / Retry Behavior:** Idempotent safe read.

## 168. Get Employee Payslip History
* **API Name / Purpose:** Get Employee Payslip History. Retrieves the complete payslip issuance history for an employee across all runs.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/payslips`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request Parameters:**
  * `userId` (Path, UUID, Required)
  * `run_id` (Query, UUID, Optional)
  * `active_only` (Query, Boolean, Optional, default `false`): If true, hides superseded and revoked versions.
* **Request JSON Payload:** None
* **Detailed API Function:** Queries the `payslips` table across all runs for a specific user.
* **Response Structure:**
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
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | ----- | ---- | -------- | ----------- | ---------------- |
  | `data.payslips[].reissue_reason` | String | Yes | Reason | Why this specific version was created (if version > 1) |
  | `data.payslips[].run_status` | String | No | Parent run status | Live status of the payroll run (`approved` / `paid`) |

## 169. Get Employee Payslip Detail
* **API Name / Purpose:** Get Employee Payslip Detail. Retrieves the full JSON representation of an employee's payslip for a specific run.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/payslips/:runId`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request Parameters:**
  * `userId` (Path, UUID, Required)
  * `runId` (Path, UUID, Required)
  * `version` (Query, Integer, Optional): Target superseded versions; if absent, fetches active.
* **Request JSON Payload:** None
* **Detailed API Function:** Merges the frozen payslip snapshot with the live calculation mechanism (like `calculation_type` from the immutable run item) and attaches an HR-only metadata block. Falls back to a live projection if the run predates Phase 6.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslip detail fetched",
    "data": {
      "run": { "run_id": "...", "period_month": "2026-03", "status": "approved" },
      "employee": { "user_id": "..." },
      "period": { "start": "2026-03-01", "end": "2026-03-31" },
      "status": "calculated",
      "statutory_status": "applied",
      "statutory_note": "Statutory withholding is applied: net_pay is the take-home after PF, ESI, professional tax and TDS.",
      "statutory": {
        "status": "applied", "pf_wage": "100000.00", "income_tax_amount": "15000.00", "pf_employee_amount": "1800.00"
      },
      "figures": {
        "gross_earnings": "150000.00", "net_pay": "115000.00", "payable_days": "31", "lop_days": 0, "ctc_cost": "160000.00"
      },
      "components": [
        {
          "component_code": "BASIC", "component_name": "Basic", "component_type": "earning",
          "calculation_type": "percent_of_ctc", "full_month_amount": "75000.00", "amount": "75000.00",
          "is_taxable": true, "source": "payroll", "display_order": 1
        }
      ],
      "reimbursements": [],
      "benefits": [],
      "reimbursement_note": "A reimbursement payout is included in net_pay but is not part of gross_earnings (it is a payout, not an earning).",
      "warnings": [],
      "day_ledger": null,
      "snapshot_source": "snapshot",
      "payslip_version": 1,
      "hr": {
        "payslip_id": "...", "version": 1, "payslip_status": "active",
        "visible_to_employee": true, "email_status": "sent", "email_attempts": 1, "email_last_error": null,
        "published_at": "2026-03-28T10:00:00.000Z", "published_by": "...", "superseded_at": null, "reissue_reason": null,
        "snapshot_hash": "abcd1234efgh5678"
      }
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | ----- | ---- | -------- | ----------- | ---------------- |
  | `data.snapshot_source` | String | No | Origin | `snapshot` or `live_projection` |
  | `data.payslip_version` | Integer | Yes | Version | `null` on `live_projection` |
  | `data.hr` | Object | Yes | HR Metadata | Omitted on employee/manager planes; contains delivery state and hashes |
* **Error Handling:** `404 PAYSLIP_NOT_FOUND`, `404 RUN_NOT_FOUND`.

## 170. Download Payslip PDF (HR)
* **API Name / Purpose:** Download Payslip PDF. Generates and streams the PDF version of a payslip.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/payslips/:runId/pdf`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request Parameters:**
  * `userId` (Path, UUID, Required)
  * `runId` (Path, UUID, Required)
  * `version` (Query, Integer, Optional)
* **Request JSON Payload:** None
* **Detailed API Function:** Resolves the snapshot (falling back to ephemeral composition if pre-Phase 6). Creates an export audit row in `payroll_report_exports`. Renders the PDF via `payslipPdf.render`, pinning the `CreationDate` to `published_at` for determinism. Streams the buffer.
* **Response Structure:** Binary PDF Stream (`Content-Type: application/pdf`).
* **Error Handling:** `404 PAYSLIP_NOT_FOUND`. Stream failure triggers `reportService.failExport()`.
* **Audit/Logging Behavior:** Inserts `payroll_report_exports` row (`report_type: 'payslip_single'`).

## 171. Publish Run Payslips
* **API Name / Purpose:** Publish Run Payslips. Releases held payslips to employees, making them visible and enqueueing them for email dispatch.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/payslips/publish`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request Parameters:** `id` (Path, UUID, Required)
* **Request JSON Payload:**
  ```json
  {
    "user_ids": ["b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"]
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | ----- | ---- | -------- | -------- | ----------- | --------------------------- | ------- |
  | `user_ids` | Array(UUID) | No | No | Specific employees | Max 5000 | `[]` (entire run) |
* **Detailed API Function:** Takes the Rank-1 run lock. Executes a conditional UPDATE to flip `visible_to_employee` to true, stamps `published_at = NOW()`, and flips `email_status` to `pending` if `payslip_auto_email` is enabled.
* **Response Structure:**
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
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | ----- | ---- | -------- | ----------- | ---------------- |
  | `data.payslips_published` | Integer | No | Count | Number of rows flipped |
  | `data.payslips_queued` | Integer | No | Count | Number of rows added to email queue |
* **Idempotency / Retry Behavior:** Idempotent by WHERE clause (updates `where visible_to_employee = false`).

## 172. Backfill Run Payslips
* **API Name / Purpose:** Backfill Run Payslips. Composes and persists payslip snapshots for historical runs approved before Phase 6.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/payslips/backfill`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:**
  ```json
  {
    "user_ids": ["b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"]
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | ----- | ---- | -------- | -------- | ----------- | --------------------------- | ------- |
  | `user_ids` | Array(UUID) | No | No | Target employees | Max 5000 | `[]` (entire run) |
* **Detailed API Function:** Iterates in cohorts of 200, taking the Rank-1 run lock per cohort. Computes and inserts `payslips` rows exactly matching the live fallback (D-45). Inherits the run's `approved_at` as the `published_at` to preserve rendering immutability.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslips backfilled",
    "data": {
      "run_id": "a9a8f4b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
      "period_month": "2026-03",
      "payslips_created": 200
    }
  }
  ```
* **Idempotency / Retry Behavior:** Reads a skip set per cohort to ignore already-persisted rows. Safe to retry mid-flight crashes.

## 173. Reissue Payslip
* **API Name / Purpose:** Reissue Payslip. Supersedes an active payslip with version N+1 to correct presentation errors.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/payslips/:id/reissue`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:**
  ```json
  {
    "reason": "Corrected spelling of employee's last name"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | ----- | ---- | -------- | -------- | ----------- | --------------------------- | ------- |
  | `reason` | String | Yes | No | Justification | Non-empty string | - |
* **Detailed API Function:** Takes the Rank-3 payslip lock. Asserts row is active. Composes a new snapshot. Asserts `hashMoney(newSnapshot) === hashMoney(oldSnapshot)`. Supercedes old row and inserts new.
* **Error Handling:** 
  - `409 PAYSLIP_FIGURES_CHANGED`: Reissue is blocked if financial calculations have changed (requires run cancel/recalc).
  - `409 PAYSLIP_ALREADY_SUPERSEDED`: Target is no longer active.
  - `409 PAYSLIP_REVOKED`: Target run was cancelled.

## 174. Download Run Payslips (Bulk ZIP)
* **API Name / Purpose:** Download Bulk Payslips. Streams a ZIP archive of all PDFs for an approved run.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/payslips/download`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:** None
* **Detailed API Function:** Fetches all active payslips. Pre-flight checks size bounds. Opens `payslip_bulk` export audit row. Composes the ZIP stream.
* **Error Handling:** `409 RUN_NOT_PAYABLE`, `422 EXPORT_TOO_LARGE` (max entries 5000).
* **Side Effects:** Streams binary (`application/zip`).

## 175. Dispatch Run Payslips
* **API Name / Purpose:** Dispatch Run Payslips. Drains a bounded batch of the payslip notification email queue synchronously.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/payslips/dispatch`
* **Authentication / Authorization:** Token, `hr`, `payroll.access`.
* **Request JSON Payload:**
  ```json
  {
    "limit": 200,
    "user_ids": null,
    "include_failed": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | ----- | ---- | -------- | -------- | ----------- | --------------------------- | ------- |
  | `limit` | Integer | No | No | Batch bound | `1-500` | `200` |
  | `user_ids` | Array(UUID) | No | Yes | Restrict to | Max 500 | `null` |
  | `include_failed` | Boolean | No | No | Retry hard-failed | `true/false` | `false` |
* **Detailed API Function:** Executes the 3-transaction queue loop (`CLAIM`, `SEND` via SES with timeout, `RECORD`).
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Payslip dispatch batch processed",
    "data": {
      "run_id": "a9a8f4b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
      "period_month": "2026-03",
      "candidates": 50,
      "sent": 48,
      "failed": 2,
      "skipped": 0
    }
  }
  ```

## 176. Get Run Dispatch Status
* **API Name / Purpose:** Get Run Dispatch Status. Surfaces queue state and recent failures for a run.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/runs/:id/payslips/dispatch-status`
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Dispatch status fetched",
    "data": {
      "run_id": "...",
      "period_month": "2026-03",
      "max_attempts": 5,
      "counts": { "not_requested": 0, "pending": 50, "sending": 10, "sent": 2900, "failed": 40 },
      "recent_failures": [
        { "payslip_id": "...", "user_id": "...", "attempts": 5, "last_error": "NO_EMAIL_ADDRESS", "retryable": false }
      ]
    }
  }
  ```


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
