# Combined API Analysis: Payroll Module (Phases 1–7: Foundation, Run Engine, Variable Pay, Statutory/Tax, Reimbursements/Benefits, Delivery, & Automation/Corrections/F&F)

This document is the authoritative request/response contract for **every endpoint shipped across Phases 1 through 7** of the Payroll module: the salary-component catalog, salary-structure templates, per-employee versioned effective-dated salary structures (with the D-13 maker-checker chain), org payroll settings, encrypted bank accounts, the append-only audit trail, the core calculation and run execution engine, the complete variable-pay suite (bonuses, ad-hoc adjustments, bulk CSV batches, employee loans, EMI schedules, foreclosures, and shortfall carry-forwards), the **Phase 4 statutory & tax layer** (the `statutory_configs` singleton, professional-tax slabs, income-tax regimes/slabs, investment declarations, per-employee tax summaries & Form 16, and the self-service tax surface), the **Phase 5 suite** covering expense reimbursement categories, live budget headroom, claims authoring, multi-tier approvals with line-item trimming, out-of-pocket payout protection (Step 8f injection), corporate benefit plans and enrollments (Step 8a' deductions without proration), Form 16 Part A distribution, and the binary-free pre-signed S3 document vault, the **Phase 6 delivery layer** (payslip generation/publishing, manager/employee payslip and tax downloads, bank advice and register exports), and the **Phase 7 suite** (full & final settlements, employee exits, arrears drift & reconciliation, comp-off/leave balance encashments, and automated scheduler cron runners).

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
* **API name / purpose**: Evaluate a template against a CTC **for a specific employee, without persisting anything** — the safety valve that lets HR see both the component split **and the full statutory breakdown / take-home figures** before committing a salary. Output mirrors `GET /api/v1/payroll/me/salary-structure` so the pre-assignment panel matches the post-assignment one.
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/structure-templates/:id/preview` · **Roles**: `hr`.
* **Request JSON Payload**: `{ "annual_ctc": "1200000", "user_id": "936dfc38-4c48-469c-8e88-f3f2604b2a9e" }`
* **Request Fields**: `id` (Path, UUID); `annual_ctc` (Positive money-like, Required); `user_id` (UUID, **Required**) — the employee the breakdown is for. PT (work state) and TDS (declarations) are employee-specific, and the lookup is org-scoped (tenant isolation).
* **Detailed API Function**: Resolves `user_id` within the caller's org (404s a foreign id), runs the §5.2 evaluator over the template's components for the given CTC, then projects the dynamic `statutory_breakdown` (PF/ESI/PT/TDS + `figures`) off the org's **live** statutory config + the employee's tax projection. **Persists nothing.** The reconciliation assert runs here too, so an unbalanced template surfaces its `422` at preview time.
* **Error handling**: `404 EMPLOYEE_NOT_FOUND` (user_id not in org); `404 TEMPLATE_NOT_FOUND`; `422 TEMPLATE_HAS_NO_COMPONENTS` / `STATUTORY_COMPONENT_NOT_ASSIGNABLE`; any evaluator `422` (`NO_BASIC_COMPONENT`, `INVALID_PERCENTAGE`, `CTC_BELOW_FIXED_COMPONENTS`, `CTC_RECONCILIATION_FAILED`, `MULTIPLE_BALANCING_COMPONENTS`, `NO_EARNING_COMPONENTS`).
* **What This API Gives/Does**: `{ template_id, user_id, annual_ctc, annual_gross, monthly_gross, annual_ctc_check, reconciled, gross_definition, lines: [ { code, name, component_type, calculation_type, value, is_part_of_ctc, annual_amount, monthly_amount, display_order } ], statutory_breakdown: { status: "estimated", pf_wage, esi_wage, taxable_earnings, esi_covered, pf_employee_amount, pf_employer_amount, eps_amount, esi_employee_amount, esi_employer_amount, professional_tax_amount, income_tax_amount, statutory_snapshot, figures: { monthly_gross, total_deductions, total_employer_contributions, net_pay, ctc_cost } } }`. The `statutory_breakdown` is an **estimate** from live config, not a frozen run snapshot. See the definitional note above for how `percent_of_gross` is computed.

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

## 26a. List Audit Logs
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
* **What This API Gives/Does**: The caller's current **approved** structure with its component breakdown, plus a dynamically projected `statutory_breakdown` object, or `null`. A pending proposal is never shown.
* **Why Statutory PF & Tax are Dynamically Projected (Not Hardcoded)**:
  - Regulatory withholdings (EPF, ESI, PT, and TDS) are not static contractual earnings. Hardcoding them into base database structures violates statutory wage ceiling caps, LOP proration rules, and Section 192 tax true-ups.
  - The backend dynamically computes `statutory_breakdown` on the fly using the organization's active `statutory_configs` and tax engine, providing the frontend with real-time employee/employer contributions and estimated take-home net pay.
* **Response JSON Payload**:
  ```json
  {
    "success": true,
    "message": "Salary structure fetched",
    "data": {
      "id": "27567ff1-67ea-4a25-91e5-44124ea5a833",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "template_id": "d8d0c3b7-2e9c-46bb-ab21-5415d4bd1d87",
      "annual_ctc": "350000.00",
      "monthly_gross": "29166.67",
      "currency": "INR",
      "effective_from": "2026-09-15",
      "effective_to": null,
      "version": 3,
      "revision_type": "correction",
      "revision_reason": "Correction",
      "status": "approved",
      "components": [
        {
          "id": "14f24efb-8afb-47e0-af84-482a47291a2e",
          "component_name": "Basic",
          "component_type": "earning",
          "monthly_amount": "14583.33",
          "pf_applicable": true,
          "esi_applicable": true,
          "is_taxable": true
        },
        {
          "id": "c869966b-4e14-419b-b5d1-fe14581f1ba4",
          "component_name": "HRA",
          "component_type": "earning",
          "monthly_amount": "5833.33",
          "pf_applicable": false,
          "esi_applicable": true,
          "is_taxable": true
        },
        {
          "id": "3e981320-a7d5-455b-bfb4-d5f0b5d5cf38",
          "component_name": "Conveyance",
          "component_type": "earning",
          "monthly_amount": "1600.00",
          "pf_applicable": false,
          "esi_applicable": true,
          "is_taxable": true
        },
        {
          "id": "67fdbdc5-520e-4a6c-9411-cf0da0a6f443",
          "component_name": "Special Allowance",
          "component_type": "earning",
          "monthly_amount": "7150.01",
          "pf_applicable": false,
          "esi_applicable": true,
          "is_taxable": true
        }
      ],
      "statutory_breakdown": {
        "status": "estimated",
        "pf_wage": "14583.33",
        "esi_wage": "0.00",
        "taxable_earnings": "29166.67",
        "esi_covered": false,
        "pf_employee_amount": "1750.00",
        "pf_employer_amount": "1750.00",
        "eps_amount": "1214.79",
        "esi_employee_amount": "0.00",
        "esi_employer_amount": "0.00",
        "professional_tax_amount": "0.00",
        "income_tax_amount": "0.00",
        "statutory_snapshot": {
          "v": 4,
          "pf": {
            "enabled": true,
            "wage": "14583.33",
            "employee": "1750.00",
            "employer": "1750.00",
            "eps": "1214.79",
            "epf_employer": "535.21",
            "edli": "72.92",
            "admin_charges": "500.00",
            "restricted": true,
            "ceiling_applied": false,
            "lop_reduces_ceiling": true,
            "employee_rate": "12.00",
            "employer_rate": "12.00"
          },
          "esi": {
            "enabled": false,
            "wage": "0.00",
            "employee": "0.00",
            "employer": "0.00",
            "covered": false
          },
          "pt": {
            "enabled": false,
            "state_code": null,
            "amount": "0.00"
          },
          "tax": {
            "enabled": true,
            "regime": "new",
            "annual_taxable_estimate": "350000.00",
            "annual_tax_liability": "0.00",
            "monthly_tds": "0.00"
          },
          "warnings": []
        },
        "figures": {
          "monthly_gross": "29166.67",
          "total_deductions": "1750.00",
          "total_employer_contributions": "1750.00",
          "net_pay": "27416.67",
          "ctc_cost": "30916.67"
        }
      }
    }
  }
  ```

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

## HR Administration APIs (Engine Operations) — `/api/v1/payroll/hr/runs`

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

## Manager APIs — `/api/v1/payroll/manager`

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

## Employee Self-Service APIs — `/api/v1/payroll/me`

### 55. List My Payslips
* **Endpoint**: `GET /api/v1/payroll/me/payslips` · **Roles**: `all`
* **What This API Gives/Does**: Employees fetch their own finalized payslips. Only approved or paid runs are returned. Draft runs are hidden.

### 56. Get My Payslip
* **Endpoint**: `GET /api/v1/payroll/me/payslips/:runId` · **Roles**: `all`
* **What This API Gives/Does**: Employees fetch a specific finalized payslip containing the full breakdown and day ledger.

---

# Phase 3: Variable Pay (Bonuses, Incentives, Adjustments, Loans & Advances)

## HR Administration APIs — `/api/v1/payroll/hr`

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
* **Request JSON Payload**:
  ```json
  {
    "loan_type": "loan",
    "principal_amount": 60000,
    "interest_rate": 10,
    "interest_method": "flat",
    "tenure_months": 6,
    "start_period_month": "2026-10",
    "disbursed_on": "2026-09-25",
    "reason": "Personal medical requirement"
  }
  ```
* **Request Fields**:
  * `loan_type` (Enum, Optional, default `'loan'`): `'loan'` | `'salary_advance'`.
  * `principal_amount` (Money-like, Required): Principal amount (> 0).
  * `interest_rate` (Number, Optional, 0–100): Annual percentage interest rate (e.g. `10` or `12.5`). Defaults to `payroll_settings.loan_default_interest_rate` (`0.00`).
  * `interest_method` (Enum, Optional): `'flat'` | `'reducing_balance'`. Defaults to `payroll_settings.loan_interest_method` (`'reducing_balance'`).
  * `tenure_months` (Integer, Required, 1–600): Number of repayment months.
  * `start_period_month` (String, Required): Month of the first installment (`YYYY-MM`).
  * `disbursed_on` (Date string, Optional, nullable): Disbursal date (`YYYY-MM-DD`).
  * `reason` (String, Required): Mandatory reason for the loan.
* **Validation Rules**: `principal_amount > 0`, `tenure_months >= 1`, `start_period_month` format `YYYY-MM`. Field names must strictly match schema (`interest_rate`, `interest_method`, `disbursed_on`).
* **What This API Gives/Does**: Grants a company loan or salary advance. Generates full monthly EMI schedule in `loan_installments`. Lands in `active` status directly (schedule generated) unless `payroll_require_separate_checker` is enabled.

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

## Manager APIs — `/api/v1/payroll/manager`

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
* **Request JSON Payload**: Uses the same schema as API 75 (`principal_amount`, `interest_rate`, `interest_method`, `tenure_months`, `start_period_month`, `disbursed_on`, `reason`).
* **What This API Gives/Does**: Manager recommends a loan or emergency advance for a direct report. Lands in `pending` status awaiting HR review and approval (schedule is only generated upon HR approval).

### 89. List Team Loans
* **Endpoint**: `GET /api/v1/payroll/manager/loans` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Lists loans granted to direct reports with BOLA hierarchy verification.

### 90. Get Team Loan Details
* **Endpoint**: `GET /api/v1/payroll/manager/loans/:id` · **Roles**: `manager, hr`
* **What This API Gives/Does**: Fetches installment schedule and repayment status for a subordinate's loan.

---

## Employee Self-Service APIs — `/api/v1/payroll/me`

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

> **Phase 5 Invariants & Architectural Principles:**
> 1. **Reimbursement Payout Invariant (D-31):** A reimbursement payout is **not an earning**. It never appears in `gross_earnings`, `taxable_earnings`, `pf_wage`, `esi_wage`, PT base, or `ctc_cost`. It sits outside the negative-net wage clamp (Step 8f), entering only `net_pay` and `reimbursement_amount`.
> 2. **Benefit Deduction & Contribution Invariant (D-33, D-36, D-37):** Benefit plans carry flat monthly contributions for employee deductions (Step 8a', prioritized before loan EMI recovery) and employer contributions (Step 6c). Benefits carry no mid-month proration (D-36). Dual-layer month-overlap protection (btree_gist EXCLUDE + serialised advisory lock) prevents double-deductions.
> 3. **Binary-Free Polymorphic S3 Storage (D-30):** The API process never buffers binaries. Pre-signed PUT URLs (10-min TTL), HeadObject confirmation, and short-lived pre-signed GET URLs (5-min TTL) manage all document lifecycles securely.

---

# HR Administration APIs — Reimbursements, Benefits & Documents — `/api/v1/payroll/hr`

*Auth stack for HR routes: `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`.*

## 128. Create Reimbursement Category
* **API Name / Purpose:** Defines an organizational reimbursement expense category along with its policy constraints, receipt requirements, limit periods, and taxability rules.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/categories`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 129. List Reimbursement Categories
* **API Name / Purpose:** Retrieves all reimbursement categories configured for the organization, with optional filtering by active status.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/categories`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 130. Get Reimbursement Category
* **API Name / Purpose:** Fetches full configuration details for a specific reimbursement category.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 131. Update Reimbursement Category
* **API Name / Purpose:** Updates category metadata, spending ceilings, receipt rules, taxability flags, or active status.
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
```json
  {
    "name": "Business Travel & Lodging",
    "max_amount_per_claim": "15000.00",
    "max_amount_per_period": "150000.00",
    "receipt_required_above_amount": "1000.00"
  }
  ```
  Accepts any subset of editable fields defined in API 128. Requires at least 1 field.
* **Response Structure:**
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

## 132. Deactivate Reimbursement Category
* **API Name / Purpose:** Soft-deactivates an expense category, preventing new claims from referencing it.
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/categories/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 133. List Org Reimbursement Claims Queue
* **API Name / Purpose:** Lists all employee reimbursement claims across the entire organization with multi-dimensional filtering and pagination.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/claims`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 134. Get Org Reimbursement Claim Detail
* **API Name / Purpose:** Retrieves full claim detail including line items, attachments, multi-level approval history, and server-calculated category limit headroom.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/claims/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 135. Approve Reimbursement Claim (HR Level / Final Level)
* **API Name / Purpose:** Executes an HR-tier approval on a reimbursement claim, optionally adjusting line item amounts downward, validating limits, and (on the final level) resolving the payout payroll period.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/claims/:id/approve`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 136. Reject Reimbursement Claim (HR Level)
* **API Name / Purpose:** Permanently rejects a reimbursement claim at the HR review stage.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/reimbursements/claims/:id/reject`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
```json
  {
    "rejection_reason": "Receipts dated >60 days prior to submission violate company travel policy clause 4.2."
  }
  ```
  - `rejection_reason` (String, Required): Mandatory textual justification (max 1000 chars).
* **Response Structure:**
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

## 137. Get Attachment View URL (HR Scope)
* **API Name / Purpose:** Generates a secure, temporary pre-signed S3 URL to view or download any attachment across the organization.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/attachments/:attachmentId/view-url`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 138. Create Benefit Plan
* **API Name / Purpose:** Creates an organizational employee benefit plan (e.g., group health insurance, meal vouchers, accidental coverage) specifying monthly employee and employer contribution amounts.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 139. List Benefit Plans
* **API Name / Purpose:** Returns all benefit plans configured for the organization with optional filtering by active status and benefit type.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 140. Get Benefit Plan Detail
* **API Name / Purpose:** Retrieves detailed configuration for a benefit plan alongside real-time active enrollment counts and aggregated monthly company/employee cost totals.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 141. Update Benefit Plan
* **API Name / Purpose:** Modifies benefit plan attributes, provider details, contribution amounts, or validity dates.
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
```json
  {
    "employee_contribution_amount": "1320.00",
    "employer_contribution_amount": "1980.00",
    "coverage_amount": "600000.00"
  }
  ```
  Accepts any subset of editable plan fields.
* **Response Structure:**
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

## 142. Deactivate Benefit Plan
* **API Name / Purpose:** Deactivates a benefit plan, preventing new enrollments from being created.
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 143. Enroll Employee in Benefit Plan
* **API Name / Purpose:** Enrolls an employee into a benefit plan starting from a specified effective date, optionally specifying customized contribution overrides.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans/:id/enrollments`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 144. List Plan Enrollments
* **API Name / Purpose:** Lists all employees enrolled in a specific benefit plan with status filtering and pagination.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/benefit-plans/:id/enrollments`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 145. List Employee Benefit Enrollments
* **API Name / Purpose:** Retrieves all benefit plan enrollments (active, ended, cancelled) for a specific employee.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/benefit-enrollments`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 146. End Employee Benefit Enrollment
* **API Name / Purpose:** Terminates an active employee benefit enrollment on a specified end date.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/benefit-enrollments/:enrollmentId/end`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
```json
  {
    "enrolled_to": "2026-09-30",
    "end_reason": "Employee submitted voluntary opt-out request"
  }
  ```
  - `enrolled_to` (Date `YYYY-MM-DD`, Required): Termination date (must be `>= enrolled_from`).
  - `end_reason` (String, Optional): Administrative explanation (max 500 chars).
* **Response Structure:**
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

## 147. Attach Form 16 Part A Document (Upload URL / Reference Link)
* **API Name / Purpose:** Links or uploads the TRACES-issued Form 16 Part A certificate for an employee, completing statutory annual tax certification (D-29).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/part-a/attachment`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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

---

# Manager APIs — Reimbursements & Benefits — `/api/v1/payroll/manager`

*Auth stack for Manager routes: `authenticate` → `authorize(['manager', 'hr'])` → `requireFeature('payroll.access')`.*

## 148. List Team Reimbursement Claims
* **API Name / Purpose:** Lists reimbursement claims submitted by a manager's direct and indirect reporting lines, as well as claims currently awaiting this manager's review.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/reimbursements/claims`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 149. Get Team Reimbursement Claim Detail
* **API Name / Purpose:** Retrieves itemized claim details, receipts, and category limit headroom for a specific team member's claim.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/reimbursements/claims/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.

## 150. Approve Team Reimbursement Claim (Manager Level 1)
* **API Name / Purpose:** Authorizes Level 1 managerial approval on a reporting employee's claim, optionally trimming non-compliant line items (Tier A, D-13).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/manager/reimbursements/claims/:id/approve`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 151. Reject Team Reimbursement Claim (Manager Level 1)
* **API Name / Purpose:** Rejects a team member's claim at Level 1, terminating the claim permanently.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/manager/reimbursements/claims/:id/reject`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
```json
  {
    "rejection_reason": "Weekend lunch was personal and not pre-approved for client entertainment."
  }
  ```
* **Response Structure:**
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

## 152. Get Team Reimbursement Receipt View URL
* **API Name / Purpose:** Issues a temporary pre-signed S3 URL for a manager to view an expense receipt attached to a team member's claim.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/attachments/:attachmentId/view-url`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 153. List Team Benefit Enrollments
* **API Name / Purpose:** Lists benefit plan enrollments for team members, with dynamic privacy masking when compensation viewing is disabled.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/team/benefit-enrollments`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.

---

# Employee Self-Service APIs — Reimbursements, Benefits & Documents — `/api/v1/payroll/me`

*Auth stack for Self routes: `authenticate` → `requireFeature('payroll.access')` (Self-scoped to `req.user.id`, no role gate).*

## 154. Get My Reimbursement Categories & Limit Headroom
* **API Name / Purpose:** Returns the active category catalog augmented with the employee's personal consumed amount and remaining policy limit headroom for the current window.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/categories`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 155. Create My Draft Reimbursement Claim
* **API Name / Purpose:** Creates a new reimbursement claim in draft status, optionally adding initial expense line items.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 156. List My Reimbursement Claims
* **API Name / Purpose:** Retrieves a paginated history of all reimbursement claims filed by the authenticated employee.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 157. Get My Reimbursement Claim Detail
* **API Name / Purpose:** Retrieves full details for a specific claim owned by the caller, including line items, attachments, approval chain progress, and payout settlement state.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 158. Replace My Draft Claim Items
* **API Name / Purpose:** Completely replaces the item set of an existing draft claim and optionally updates the claim title.
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims/:id`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 159. Submit My Draft Reimbursement Claim
* **API Name / Purpose:** Submits a draft claim into the formal approval workflow, freezing the approval chain, assigning a sequential human claim number, and strictly enforcing receipt requirements and category limits.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims/:id/submit`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 160. Cancel My Reimbursement Claim
* **API Name / Purpose:** Allows a claimant to withdraw their claim while in draft, submitted, or under_review status (§7.4a).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims/:id/cancel`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
```json
  {
    "cancellation_reason": "Attached wrong invoice; will re-submit with correct billing"
  }
  ```
  - `cancellation_reason` (String, Optional): Explanation for withdrawal (max 500 chars).
* **Response Structure:**
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

## 161. Request Receipt Upload URL for Claim Item
* **API Name / Purpose:** Generates a pre-signed AWS S3 PUT URL for uploading an expense receipt document directly to S3 against a draft claim item (§5.4).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/me/reimbursements/claims/:id/items/:itemId/attachments`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:**
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
* **Response Structure:**
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

## 162. Request Investment Proof Upload URL for Declaration Item
* **API Name / Purpose:** Generates a pre-signed S3 PUT URL for uploading Section 80C/80D investment proofs against a declaration item (D-29, Phase 4/5 integration).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/me/tax/declarations/items/:itemId/attachments`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.

## 163. Confirm My Attachment Upload
* **API Name / Purpose:** Verifies that a file was successfully uploaded to S3 and transitions its status from pending to available (§5.4).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/me/attachments/:attachmentId/confirm`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 164. Delete My Attachment
* **API Name / Purpose:** Soft-deletes an uploaded attachment (status = 'deleted') owned by the caller.
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/payroll/me/attachments/:attachmentId`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 165. Get My Attachment View URL
* **API Name / Purpose:** Issues a 5-minute pre-signed GET URL for an employee to view their own confirmed attachment in the browser or download it.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/attachments/:attachmentId/view-url`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

## 166. Get My Benefit Enrollments & Deductions Breakdown
* **API Name / Purpose:** Retrieves all active and historical benefit plan enrollments for the authenticated employee, alongside the cumulative year-to-date (YTD) benefit deductions withheld in the current financial year.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/benefits`
* **Authentication / Authorization:** Bearer Token
* **Required Roles:** Any tenant role (self)
* **Required Feature / Permission:** `payroll.access`
* **Request JSON Payload:** None.
* **Response Structure:**
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

# Employee Self-Service Delivery APIs — `/api/v1/payroll/me`

## 191. Download Own Payslip PDF
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/payslips/:runId/pdf`
* **Authentication / Authorization:** Token.
* **Detailed API Function:** Rejects with `403` if `visible_to_employee = false`.
* **Response Structure:** Binary PDF stream.

## 192. Get Own Annual Statement (JSON)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/annual-statement`
* **Authentication / Authorization:** Token.
* **Response Structure:** See #183.

## 193. Download Own Annual Statement (PDF)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/annual-statement/pdf`
* **Authentication / Authorization:** Token.
* **Response Structure:** Binary PDF stream.

## 194. Download Own Form 16 PDF
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/tax/form16/:financialYear/pdf`
* **Authentication / Authorization:** Token.
* **Detailed API Function:** Employee downloads Form 16 Part B. Rejects with `404` if the FY is not finalized by HR.
* **Response Structure:** Binary PDF stream.

---

# Phase 7 APIs — Automation, Corrections (Arrears · Off-Cycle · F&F) & Hardening

> **Phase 7 Invariants & Architectural Principles:**
> 1. **Single Full Structure Run per Month (INV-P7-1 / D-56):** An employee may have at most one approved payroll run item carrying full structure earnings per calendar month. Off-cycle runs operate strictly in `supplementary_only` mode, suppressing base salary and fixed allowances.
> 2. **Immutability of Closed Runs (INV-P7-2 / D-12 & D-53):** Closed payroll runs (`approved` or `paid`) are never recalculated or mutated. All retrospective corrections (attendance regularizations, backdated salary revisions, late overtime) reconcile as forward-settling arrear adjustment lines into the earliest open active period.
> 3. **Atomic Full & Final Settlement (INV-P7-3 / D-59):** F&F settlement preparation freezes notice shortfall deductions, leave balance encashments, and outstanding loan foreclosures in a single atomic database transaction. Mutating exit dates or notice terms is blocked while prepared; HR must explicitly reset the settlement first.
> 4. **Atomic Dual-Debit Encashment Guarantee (INV-P7-4 / EC-27):** Approving a comp-off encashment marks the attendance comp-off record as `encashed` and simultaneously debits the employee's compensatory off (`CO`) leave balance wallet for the year the comp-off was earned, preventing time-off and cash double-spending.
> 5. **Same-Period Statutory Netting (INV-P7-5 / D-56):** Off-cycle disbursements evaluate cumulative monthly earnings against prior closed runs in the same calendar month, netting statutory deductions (Provident Fund, ESI, Professional Tax, and TDS) to prevent double-charging statutory wage ceilings or monthly tax slabs.
> 6. **Phase 7 Extensions to Prior Endpoints:**
>    * **#38 Create Payroll Run (`POST /api/v1/payroll/hr/runs`):** Widened to accept `run_type` (`'regular'`, `'off_cycle'`, `'final_settlement'`). When `'off_cycle'`, requires `user_ids` (1–500 UUIDs) and locks `earnings_mode` to `'supplementary_only'`. When `'final_settlement'`, requires `user_ids` (1–50 UUIDs), permits `earnings_mode` (`'full'` | `'supplementary_only'`), and accepts optional `exit_id`. When `'regular'`, cohort fields are forbidden. `#39 List Payroll Runs` adds query filter `run_type`.
>    * **#138 Create Benefit Plan & #141 Update Benefit Plan:** Extended with `employer_contribution_taxable` (Boolean, default `false`, accumulates taxable perquisite pool without inflating gross/PF/ESI wages) and `employee_premium_tax_section` (Enum: `'80D'`, nullable, automatically projects employee insurance deductions under Section 80D for Old Tax Regime).
>    * **#23 Update Payroll Settings:** Widened with settings #55 (F&F policies), #56 (automation & document retention), and #57 (comp-off encashment policies).

---

# HR Administration APIs — Exits & Separations — `/api/v1/payroll/hr`

*Auth stack for every HR route: `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`.*

## 195. Create Employee Exit
* **API Name / Purpose:** Record an employee exit record establishing their Last Working Day (LWD), separation type, and notice period obligations.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:**
  ```json
  {
    "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "exit_type": "resignation",
    "last_working_day": "2026-03-31",
    "resignation_date": "2026-03-10",
    "notice_period_days": 60,
    "notice_served_days": 21,
    "notice_recovery_waived": false,
    "notice_recovery_days_override": null,
    "exit_reason": "Relocating abroad"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `user_id` | UUID | Required | No | Target employee departing | Valid active tenant employee UUID | None |
  | `exit_type` | Enum | Required | No | Nature of separation | `'resignation'`, `'termination'`, `'retirement'`, `'end_of_contract'`, `'death'`, `'absconding'` | None |
  | `last_working_day` | String | Required | No | Binding last day of employment | Format `YYYY-MM-DD`; must be $\ge$ employee joining date | None |
  | `resignation_date` | String | Optional | Yes | Date resignation was formally tendered | Format `YYYY-MM-DD` | `null` |
  | `notice_period_days` | Integer | Optional | No | Contractual notice period required | Integer between 0 and 3650 | `settings.fnf_default_notice_period_days` |
  | `notice_served_days` | Integer | Optional | No | Actual notice days served | Integer between 0 and 3650 | `0` |
  | `notice_recovery_waived` | Boolean | Optional | No | Whether organization waives notice deficit recovery | `true` or `false` | `false` |
  | `notice_recovery_days_override` | Integer | Optional | Yes | HR override of computed shortfall days | Integer between 0 and 3650, or `null` | `null` |
  | `exit_reason` | String | Optional | Yes | Administrative notes explaining departure | Trimmed string, maximum 2000 characters | `null` |
* **Validation Rules:**
  - `user_id`, `exit_type`, and `last_working_day` are strictly required.
  - `last_working_day` cannot precede the employee's official `joining_date` (`422 LWD_BEFORE_JOINING`).
  - Only one active/live exit record (`status IN ('recorded', 'prepared')`) may exist per employee (`409 EXIT_ALREADY_RECORDED`).
* **Detailed API Function:**
  1. Validates caller org context and verifies target employee profile exists within the tenant.
  2. Ensures `last_working_day` is on or after the employee's joining date.
  3. Checks partial unique constraint on `employee_exits` for live records under an advisory row lock.
  4. Defaults `notice_period_days` from org settings (`fnf_default_notice_period_days`) if omitted.
  5. Inserts new record into `employee_exits` in `recorded` status.
  6. Emits audit log entry `exit.recorded` with full separation parameters.
* **Business/User-Facing Behavior:** Formally establishes an employee's separation date and notice terms. Permanently resolves missing exit date warnings in monthly payroll calculations.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Exit recorded",
    "data": {
      "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "org_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "exit_type": "resignation",
      "resignation_date": "2026-03-10",
      "last_working_day": "2026-03-31",
      "notice_period_days": 60,
      "notice_served_days": 21,
      "notice_recovery_waived": false,
      "notice_recovery_days_override": null,
      "exit_reason": "Relocating abroad",
      "status": "recorded",
      "settlement_prepared_at": null,
      "settlement_period_month": null,
      "notice_adjustment_id": null,
      "encashment_ids": [],
      "loan_adjustment_ids": [],
      "fnf_run_id": null,
      "settled_at": null,
      "recorded_by": "f1f2f3f4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "cancelled_by": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "created_at": "2026-03-10T10:00:00.000Z",
      "updated_at": "2026-03-10T10:00:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.id` | UUID | No | Exit record identifier | Primary key of `employee_exits` |
  | `data.org_id` | UUID | No | Organization identifier | Tenant identifier |
  | `data.user_id` | UUID | No | Departing employee ID | Linked user profile |
  | `data.exit_type` | String | No | Classification of exit | Resignation, termination, etc. |
  | `data.last_working_day` | String | No | Final employment date | Clamps attendance and calculation windows |
  | `data.status` | String | No | Lifecycle status | `'recorded'`, `'prepared'`, `'settled'`, `'cancelled'` |
  | `data.recorded_by` | UUID | Yes | Actor user ID | The HR admin who submitted the exit |
* **Success Scenarios:** HR successfully logs a departing team member's separation details.
* **Error Handling:**
  - `400 MISSING_ORG_CONTEXT`: Invocation missing organization context.
  - `404 EMPLOYEE_NOT_FOUND`: Target `user_id` does not exist within the tenant organization.
  - `409 EXIT_ALREADY_RECORDED`: A live exit record already exists for this employee.
  - `422 LWD_BEFORE_JOINING`: Specified Last Working Day precedes employee joining date.
* **Idempotency / Retry Behavior:** Non-idempotent insert; retrying with same `user_id` while live record exists returns `409 EXIT_ALREADY_RECORDED`.
* **Important Edge Cases:** Past, current, and future Last Working Days are supported as long as $LWD \ge joining\_date$.
* **Side Effects:** Eliminates `EXIT_DATE_REQUIRED` errors during regular monthly payroll calculations for months after LWD.
* **Audit/Logging Behavior:** Emits audit event `exit.recorded` with separation terms.
* **Dependencies:** Requires active tenant profile in `EmployeeProfile`, `ManagerProfile`, or `HrProfile`.

---

## 196. List Employee Exits
* **API Name / Purpose:** Retrieve a paginated list of employee exit records with optional status, employee, and date filters.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `status` (Query, Enum: `'recorded'`, `'prepared'`, `'settled'`, `'cancelled'`, Optional)
  - `user_id` (Query, UUID, Optional): Filter by specific employee.
  - `page` (Query, Integer, Optional, default `1`, min `1`)
  - `limit` (Query, Integer, Optional, default `20`, min `1`, max `100`)
* **Request JSON Payload:** None.
* **Validation Rules:** Query parameters validated inside controller (Express 5 safe pattern).
* **Detailed API Function:** Queries `employee_exits` table scoped to caller's `org_id`, applying status and user filters with pagination.
* **Business/User-Facing Behavior:** HR uses this endpoint to monitor upcoming departures, review pending settlements, and audit past leavers.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Exits fetched",
    "data": [
      {
        "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
        "org_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "exit_type": "resignation",
        "resignation_date": "2026-03-10",
        "last_working_day": "2026-03-31",
        "notice_period_days": 60,
        "notice_served_days": 21,
        "notice_recovery_waived": false,
        "notice_recovery_days_override": null,
        "exit_reason": "Relocating abroad",
        "status": "recorded",
        "settlement_prepared_at": null,
        "settlement_period_month": null,
        "notice_adjustment_id": null,
        "encashment_ids": [],
        "loan_adjustment_ids": [],
        "fnf_run_id": null,
        "settled_at": null,
        "recorded_by": "f1f2f3f4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "created_at": "2026-03-10T10:00:00.000Z",
        "updated_at": "2026-03-10T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "total_pages": 1
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data` | Array | No | Array of exit records | Matching rows from `employee_exits` |
  | `pagination.total` | Integer | No | Total record count | Count of matching records |
  | `pagination.total_pages` | Integer | No | Total pages | Calculated as $\lceil \text{total} / \text{limit} \rceil$ |
* **Success Scenarios:** HR views active separation pipelines.
* **Error Handling:** Standard 400 Joi validation on query parameters.
* **Idempotency / Retry Behavior:** Idempotent safe read.

---

## 197. Get Exit Detail
* **API Name / Purpose:** Retrieve complete separation details, frozen settlement parameters, and linked settlement run IDs for a single exit record.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Unique identifier of the exit record.
* **Request JSON Payload:** None.
* **Detailed API Function:** Fetches the exit record from `employee_exits` by primary key and caller `org_id`.
* **Business/User-Facing Behavior:** HR inspects separation milestones, shortfall days, and prepared settlement identifiers for an individual leaver.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Exit fetched",
    "data": {
      "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "org_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "exit_type": "resignation",
      "resignation_date": "2026-03-10",
      "last_working_day": "2026-03-31",
      "notice_period_days": 60,
      "notice_served_days": 21,
      "notice_recovery_waived": false,
      "notice_recovery_days_override": null,
      "exit_reason": "Relocating abroad",
      "status": "prepared",
      "settlement_prepared_at": "2026-03-25T14:30:00.000Z",
      "settlement_period_month": "2026-03",
      "notice_adjustment_id": "a1b2c3d4-1111-2222-3333-444455556666",
      "encashment_ids": ["c1c2c3c4-1111-2222-3333-444455556666"],
      "loan_adjustment_ids": ["d1d2d3d4-1111-2222-3333-444455556666"],
      "fnf_run_id": null,
      "settled_at": null,
      "recorded_by": "f1f2f3f4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "created_at": "2026-03-10T10:00:00.000Z",
      "updated_at": "2026-03-25T14:30:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:** Returns the complete row including `settlement_prepared_at`, `settlement_period_month`, and linked adjustment IDs.
* **Error Handling:** `404 EXIT_NOT_FOUND` if exit does not exist or belongs to another organization.
* **Idempotency / Retry Behavior:** Idempotent safe read.

---

## 198. Correct Employee Exit
* **API Name / Purpose:** Modify separation dates, notice days served, shortfall waiver, or exit reasons on an active exit record before settlement.
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Unique identifier of the exit record.
* **Request JSON Payload:**
  ```json
  {
    "last_working_day": "2026-04-05",
    "resignation_date": "2026-03-10",
    "notice_period_days": 60,
    "notice_served_days": 26,
    "notice_recovery_waived": false,
    "notice_recovery_days_override": 34,
    "exit_type": "resignation",
    "exit_reason": "Handover extended by mutual agreement"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `last_working_day` | String | Optional | No | Updated last day of employment | Format `YYYY-MM-DD`; must be $\ge$ joining date | Unchanged |
  | `resignation_date` | String | Optional | Yes | Updated date of resignation | Format `YYYY-MM-DD` | Unchanged |
  | `notice_period_days` | Integer | Optional | No | Updated contractual notice days | Integer 0 to 3650 | Unchanged |
  | `notice_served_days` | Integer | Optional | No | Updated served notice days | Integer 0 to 3650 | Unchanged |
  | `notice_recovery_waived` | Boolean | Optional | No | Waiver toggle | `true` or `false` | Unchanged |
  | `notice_recovery_days_override` | Integer | Optional | Yes | Manual shortfall override | Integer 0 to 3650, or `null` | Unchanged |
  | `exit_type` | Enum | Optional | No | Updated separation classification | One of the 6 allowed exit type enums | Unchanged |
  | `exit_reason` | String | Optional | Yes | Updated administrative justification | Max 2000 characters | Unchanged |
* **Validation Rules:**
  - Request body must provide at least one correctable field (`Joi.object().min(1)`).
  - Edits are strictly rejected if `status === 'settled'` (`409 EXIT_ALREADY_SETTLED`).
  - Edits are strictly rejected if `status === 'prepared'` (`409 SETTLEMENT_ALREADY_PREPARED`); HR must reset settlement first.
  - Edits are strictly rejected if `status === 'cancelled'` (`409 EXIT_CANCELLED`).
* **Detailed API Function:**
  1. Acquires row lock on `employee_exits` record.
  2. Enforces status lifecycle guardrails (only `recorded` status permits in-place correction).
  3. Verifies new LWD is on or after employee joining date.
  4. Identifies affected calendar months (old LWD month and new LWD month).
  5. Acquires rank-1 run advisory locks for affected periods and asserts periods are open for variable pay.
  6. Updates `employee_exits` record with provided delta.
  7. Emits audit log entry `exit.corrected` with `oldValues` and `newValues`.
* **Business/User-Facing Behavior:** HR adjusts last working dates when handovers are extended or notice obligations are renegotiated.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Exit corrected",
    "data": {
      "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "exit_type": "resignation",
      "last_working_day": "2026-04-05",
      "notice_period_days": 60,
      "notice_served_days": 26,
      "notice_recovery_waived": false,
      "notice_recovery_days_override": 34,
      "exit_reason": "Handover extended by mutual agreement",
      "status": "recorded",
      "updated_at": "2026-03-22T09:15:00.000Z"
    }
  }
  ```
* **Error Handling:**
  - `404 EXIT_NOT_FOUND`: Exit record does not exist.
  - `409 EXIT_ALREADY_SETTLED`: Separation already finalized and paid.
  - `409 SETTLEMENT_ALREADY_PREPARED`: Settlement prepared; reset required before correcting dates.
  - `409 EXIT_CANCELLED`: Cannot correct a cancelled exit record.
  - `422 NO_CHANGES`: Empty request payload.
  - `422 LWD_BEFORE_JOINING`: Corrected LWD precedes joining date.
  - `409 PERIOD_CLOSED`: The pay period for the LWD is already approved or paid.
* **Idempotency / Retry Behavior:** Idempotent updates when sending identical values.
* **Side Effects:** Flags live draft/calculated runs in affected periods as requiring recalculation.

---

## 199. Cancel Employee Exit
* **API Name / Purpose:** Revoke an employee exit record (for employee retention, resignation withdrawal, or clerical correction) and restore active payroll status.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits/:id/cancel`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Unique identifier of the exit record.
* **Request JSON Payload:**
  ```json
  {
    "cancellation_reason": "Resignation retracted; counter-offer accepted"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `cancellation_reason` | String | Required | No | Mandatory justification for cancelling separation | Trimmed string between 1 and 1000 characters | None |
* **Validation Rules:** `cancellation_reason` is strictly required. Rejects cancellation if status is `settled` (`409 EXIT_ALREADY_SETTLED`) or already `cancelled` (`409 EXIT_ALREADY_CANCELLED`). Rejects if an approved or paid F&F run references this exit (`409 FNF_RUN_REFERENCES_EXIT`).
* **Detailed API Function:**
  1. Acquires row lock on `employee_exits` record.
  2. If status is `prepared`, automatically calls `fnfSettlementService.resetInTxn` inside the transaction, reversing leave encashments, restoring leave wallets, and cancelling un-applied adjustments.
  3. Verifies no approved/paid payroll run references this exit as its settling source.
  4. Verifies the LWD pay period is open for variable pay.
  5. Updates status to `cancelled`, stamps `cancelled_by`, `cancelled_at`, and `cancellation_reason`.
  6. Emits audit log entry `exit.cancelled`.
* **Business/User-Facing Behavior:** Reinstates employee in regular active payroll population, removing exit boundaries and clearing pending settlement adjustments.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Exit cancelled",
    "data": {
      "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "org_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "cancelled",
      "cancelled_by": "f1f2f3f4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "cancelled_at": "2026-03-24T16:00:00.000Z",
      "cancellation_reason": "Resignation retracted; counter-offer accepted",
      "settlement_prepared_at": null,
      "settlement_period_month": null,
      "notice_adjustment_id": null,
      "encashment_ids": [],
      "loan_adjustment_ids": [],
      "updated_at": "2026-03-24T16:00:00.000Z"
    }
  }
  ```
* **Error Handling:**
  - `404 EXIT_NOT_FOUND`: Exit record does not exist.
  - `409 EXIT_ALREADY_SETTLED`: Cannot cancel an exit that has already been settled and paid.
  - `409 EXIT_ALREADY_CANCELLED`: Exit is already cancelled.
  - `409 FNF_RUN_REFERENCES_EXIT`: An approved or paid F&F run is linked to this exit.
  - `409 SETTLEMENT_ARTEFACT_APPLIED`: One of the prepared settlement lines has already been paid.
* **Idempotency / Retry Behavior:** Retrying on already cancelled record returns `409 EXIT_ALREADY_CANCELLED`.
* **Side Effects:** Restores employee to regular monthly payroll run aggregation.

---

# HR Administration APIs — Full & Final (F&F) Settlements — `/api/v1/payroll/hr`

## 200. Settlement Preview
* **API Name / Purpose:** Generate a live, read-only simulation of an exiting employee's Full & Final settlement obligations and payouts without persisting financial adjustments.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits/:id/settlement-preview`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Unique identifier of the exit record.
  - `period_month` (Query, String, Optional): Target settlement pay period (`YYYY-MM`). If omitted, defaults to the calendar month of the Last Working Day.
* **Request JSON Payload:** None.
* **Validation Rules:** `period_month` query param must be in valid `YYYY-MM` format. Express 5 controller-validated.
* **Detailed API Function:**
  1. Loads exit record by ID and verifies tenant organization ownership.
  2. Resolves target F&F period month (`period_month` query override or month of LWD).
  3. Evaluates notice shortfall days ($shortfall = notice\_required - notice\_served$) or manual override. If notice recovery is enabled and not waived, derives daily recovery rate from employee's approved structure (e.g., Basic / Divisor) and computes projected penalty.
  4. Inspects org encashment settings (#55). For eligible leave types, reads live available balances, caps by `fnf_encashment_max_days`, resolves frozen daily encashment rate, and calculates projected cash additions.
  5. Inspects active employee loans. Identifies outstanding principal and flags proposed foreclosure recovery amount.
  6. Returns simulation plan without database writes.
* **Business/User-Facing Behavior:** HR reviews projected financial numbers with management and the employee before committing formal adjustments into the payroll ledger.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Settlement preview",
    "data": {
      "idempotent": false,
      "persisted": false,
      "exit_id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "recorded",
      "settlement_period_month": "2026-03",
      "last_working_day": "2026-03-31",
      "notice_recovery": {
        "enabled": true,
        "waived": false,
        "days": 39,
        "per_day_amount": "1000.00",
        "amount": "39000.00"
      },
      "encashments": [
        {
          "leave_type_code": "EL",
          "balance_year": 2026,
          "available_balance": 12.5,
          "days": 12.5,
          "per_day_amount": "1000.00",
          "amount": "12500.00"
        }
      ],
      "skipped_encashments": [],
      "loan_recovery": {
        "mode": "recover_via_payroll",
        "loans": [
          {
            "loan_id": "l1l2l3l4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
            "action": "foreclosed",
            "outstanding_principal": "15000.00",
            "recovery_adjustment_id": null
          }
        ]
      }
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.idempotent` | Boolean | No | Idempotency indicator | Always `false` for previews |
  | `data.persisted` | Boolean | No | Persistence indicator | Always `false` for preview simulation |
  | `data.settlement_period_month` | String | No | Target payout month | Resolved `YYYY-MM` pay period |
  | `data.notice_recovery` | Object | No | Notice recovery assessment | Shortfall days, daily rate, and total penalty |
  | `data.encashments` | Array | No | Eligible leave encashments | Payout per leave type with daily rate and cash value |
  | `data.skipped_encashments` | Array | No | Ineligible leave types | Leave types skipped due to 0 balance or policy rules |
  | `data.loan_recovery` | Object | No | Outstanding loan treatment | Active loans and proposed foreclosure principal |
* **Success Scenarios:** HR verifies settlement preview prior to freezing adjustments.
* **Error Handling:** `404 EXIT_NOT_FOUND` if exit record does not exist.
* **Idempotency / Retry Behavior:** Idempotent read-only simulation.

---

## 201. Prepare Settlement
* **API Name / Purpose:** Materialize and freeze Full & Final settlement variable pay lines, debit eligible leave balances, foreclose company loans, and transition exit record to `prepared` status.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits/:id/prepare-settlement`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Unique identifier of the exit record.
* **Request JSON Payload:**
  ```json
  {
    "period_month": "2026-03"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `period_month` | String | Optional | Yes | Target settlement payroll month | Format `YYYY-MM` | Defaults to month of Last Working Day |
* **Validation Rules:**
  - Cannot prepare settlement if exit is `settled` (`409 EXIT_ALREADY_SETTLED`) or `cancelled` (`409 EXIT_CANCELLED`).
  - Target pay period must be open for variable pay (`409 PERIOD_CLOSED`).
  - Configured notice recovery component must exist and be active (`422 NOTICE_COMPONENT_NOT_CONFIGURED`).
* **Detailed API Function:**
  1. Idempotency Check (D-59): If exit is already `prepared`, returns existing frozen plan (`idempotent: true`) without duplicating adjustments.
  2. Resolves target settlement pay period and verifies period is open.
  3. Notice Recovery: If enabled and shortfall $> 0$, creates an approved deduction adjustment (`category: 'recovery'`, `source_kind: 'notice_recovery'`).
  4. Leave Encashment: For eligible leave types, calculates cash value, creates approved earning adjustment (`category: 'ad_hoc_earning'`, `source_kind: 'encashment'`), and atomically debits employee's leave balance.
  5. Loan Foreclosure (D-61): If `fnf_loan_recovery_mode = 'recover_via_payroll'`, forecloses active loans, cancels upcoming installments, and creates an approved loan recovery deduction adjustment.
  6. Watermarking: Stamps `settlement_prepared_at`, `settlement_period_month`, `notice_adjustment_id`, `encashment_ids`, `loan_adjustment_ids`, and transitions exit status to `prepared`.
  7. Emits audit log entry `exit.settlement_prepared`.
* **Business/User-Facing Behavior:** Locks the financial exit calculation into the system. Prepares the employee for inclusion in a Final Settlement payroll run.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Settlement prepared",
    "data": {
      "idempotent": false,
      "persisted": true,
      "exit_id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "prepared",
      "settlement_period_month": "2026-03",
      "notice_recovery": {
        "enabled": true,
        "waived": false,
        "days": 39,
        "per_day_amount": "1000.00",
        "amount": "39000.00",
        "adjustment_id": "a1b2c3d4-1111-2222-3333-444455556666"
      },
      "encashments": [
        {
          "leave_type_code": "EL",
          "balance_year": 2026,
          "days": 12.5,
          "per_day_amount": "1000.00",
          "amount": "12500.00",
          "encashment_id": "c1c2c3c4-1111-2222-3333-444455556666",
          "adjustment_id": "a2b3c4d5-1111-2222-3333-444455556666"
        }
      ],
      "skipped_encashments": [],
      "loan_recovery": {
        "mode": "recover_via_payroll",
        "loans": [
          {
            "loan_id": "l1l2l3l4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
            "action": "foreclosed",
            "settlement_mode": "recover_via_payroll",
            "recovered_principal": "15000.00",
            "recovery_adjustment_id": "d1d2d3d4-1111-2222-3333-444455556666"
          }
        ]
      },
      "exit": {
        "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
        "status": "prepared",
        "settlement_prepared_at": "2026-03-25T14:30:00.000Z",
        "settlement_period_month": "2026-03"
      }
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.idempotent` | Boolean | No | Idempotency indicator | `false` on first commit; `true` on subsequent calls |
  | `data.notice_recovery.adjustment_id` | UUID | Yes | Notice recovery adjustment | Created `payroll_adjustments` row ID |
  | `data.encashments[].adjustment_id` | UUID | No | Leave encashment adjustment | Created `payroll_adjustments` row ID |
  | `data.loan_recovery.loans[].recovery_adjustment_id` | UUID | Yes | Loan recovery adjustment | Created `payroll_adjustments` row ID |
* **Success Scenarios:** HR commits settlement plan; numbers are frozen and ready for the F&F run.
* **Error Handling:**
  - `404 EXIT_NOT_FOUND`: Exit record does not exist.
  - `409 EXIT_ALREADY_SETTLED`: Exit has already been paid and settled.
  - `409 EXIT_CANCELLED`: Cannot prepare settlement for a cancelled exit.
  - `422 NOTICE_COMPONENT_NOT_CONFIGURED`: Notice recovery component is not configured in settings.
  - `409 PERIOD_CLOSED`: Target settlement month is not open for variable pay.
* **Idempotency / Retry Behavior:** Idempotent by return (D-59); repeated calls return the existing plan safely with status 200 and message `"Settlement already prepared"`.
* **Side Effects:** Debits employee leave balances, forecloses company loans, creates approved adjustment records.

---

## 202. Reset Settlement
* **API Name / Purpose:** Discard a prepared Full & Final settlement, reversing leave encashments, restoring leave wallets, cancelling un-applied adjustments, and returning the exit record to `recorded` status.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/exits/:id/settlement/reset`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Unique identifier of the exit record.
* **Request JSON Payload:**
  ```json
  {
    "reason": "Renegotiated Last Working Day to 2026-04-15"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `reason` | String | Required | No | Mandatory justification for resetting settlement | Trimmed string between 1 and 1000 characters | None |
* **Validation Rules:**
  - `reason` is strictly required.
  - Exit must currently be in `prepared` status (`409 SETTLEMENT_NOT_PREPARED`).
  - Refused if a settling F&F run has reached `approved` or `paid` status (`409 SETTLEMENT_ARTEFACT_APPLIED`).
  - Refused if any prepared adjustment has been applied to a closed payroll run (`409 ADJUSTMENT_ALREADY_APPLIED`).
* **Detailed API Function:**
  1. Acquires rank-1 advisory lock on `settlement_period_month` and row lock on exit record.
  2. Asserts exit status is `prepared`.
  3. Verifies no approved/paid payroll run references this exit as source.
  4. Encashment Reversal: For each prepared encashment, reverses wallet debit (restores leave balance wallet and flips comp-off rows back to `approved`), cancels the ad-hoc earning adjustment, and marks encashment `cancelled`.
  5. Recovery Cancellation: Cancels notice recovery and loan recovery adjustments.
  6. Clears settlement timestamps and artifact IDs from `employee_exits`, setting status back to `recorded`.
  7. Emits audit log entry `exit.settlement_reset`.
* **Business/User-Facing Behavior:** Allows HR to undo a prepared settlement when exit dates change or terms are renegotiated, restoring all balances so corrections can be made.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Settlement reset",
    "data": {
      "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "org_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "recorded",
      "settlement_prepared_at": null,
      "settlement_period_month": null,
      "notice_adjustment_id": null,
      "encashment_ids": [],
      "loan_adjustment_ids": [],
      "updated_at": "2026-03-26T11:00:00.000Z"
    }
  }
  ```
* **Error Handling:**
  - `404 EXIT_NOT_FOUND`: Exit record does not exist.
  - `409 SETTLEMENT_NOT_PREPARED`: Exit does not have a prepared settlement.
  - `409 SETTLEMENT_ARTEFACT_APPLIED`: Settlement lines have already been processed in an approved or paid payroll run.
* **Idempotency / Retry Behavior:** Non-idempotent; once reset, exit is in `recorded` status and subsequent calls fail with `409 SETTLEMENT_NOT_PREPARED`.
* **Side Effects:** Restores leave balances and cancels pending adjustments.

---

# HR Administration APIs — Arrears & Retroactive Pay — `/api/v1/payroll/hr`

## 203. Arrear Drift
* **API Name / Purpose:** Compute a read-only discrepancy report between a closed historical payroll run and live operational records (attendance, approved leave, retroactive salary increments, and overtime).
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/arrears/drift`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `period_month` (Query, String, Required): The closed source payroll period (`YYYY-MM`) being audited.
  - `user_id` (Query, UUID, Optional): Optional filter to inspect drift for a specific employee.
* **Request JSON Payload:** None.
* **Validation Rules:** `period_month` is required and must match `YYYY-MM` format. Query validated in controller (Express 5).
* **Detailed API Function:**
  1. Finds the closed regular payroll run (`status IN ('approved', 'paid')`) for `period_month`.
  2. Admissibility Gate 1 (D-66 / F-3): Verifies the closed run was computed by an arithmetically compatible engine version (`engine_version IN (5, 6)`). If earlier, halts with `422 ENGINE_VERSION_NOT_RECONCILABLE`.
  3. Admissibility Gate 2 (F-3): Verifies that all required configuration keys are present in the closed run's `settings_snapshot`. Missing keys throw `422 SNAPSHOT_INCOMPLETE`.
  4. Loads baseline frozen earnings component lines from `payroll_run_item_components`.
  5. Queries all previously committed arrear adjustments for this source period to ensure idempotency.
  6. Re-executes `aggregate()` using the **frozen policy snapshot** but on **live operational facts** (updated attendance logs, approved leave requests, active structures, overtime).
  7. Recomputes earnings per employee using `computePayrollItem()` in `full` earnings mode.
  8. Computes net deltas per earning component (`Basic`, `HRA`, `Overtime`, etc.) minus already-raised arrears.
  9. Safety Brake Check (F-4): If a net clawback $\ge 99\%$ of frozen gross pay, flags the employee as `FULL_REVERSAL_SUSPECTED` in `skipped` instead of returning an automatic clawback.
  10. Skips employees whose recomputation is unavailable (e.g. joined after period) with `RECOMPUTE_UNAVAILABLE`.
* **Business/User-Facing Behavior:** Allows HR to audit historical payroll months and review upcoming arrear credits or clawbacks before committing them to the ledger.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Arrear drift computed",
    "data": {
      "source_period_month": "2026-03",
      "source_run_id": "r1r2r3r4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "target_period_month": "2026-04",
      "skipped": [],
      "employees": [
        {
          "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "employee_code": "EMP-001",
          "source_run_item_id": "i1i2i3i4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "net_delta": "6000.00",
          "reason_codes": [
            "ledger_changed"
          ],
          "deltas": [
            {
              "component_code": "BASIC",
              "direction": "earning",
              "amount": 400000,
              "frozen": 4600000,
              "recomputed": 5000000,
              "already_raised": 0,
              "source_line": "structure"
            },
            {
              "component_code": "HRA",
              "direction": "earning",
              "amount": 200000,
              "frozen": 2300000,
              "recomputed": 2500000,
              "already_raised": 0,
              "source_line": "structure"
            }
          ]
        }
      ]
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.source_period_month` | String | No | Audited payroll month | The historical closed month evaluated |
  | `data.target_period_month` | String | Yes | Proposed paying month | The earliest open payroll month available |
  | `data.skipped` | Array | No | Excluded employees | Employees flagged for safety reasons |
  | `data.employees[].net_delta` | String | No | Net financial difference | Total net rupee difference to pay/recover |
  | `data.employees[].reason_codes` | Array | No | Operational causes | `'structure_changed'`, `'ledger_changed'`, `'overtime_changed'` |
  | `data.employees[].deltas` | Array | No | Line-by-line head deltas | Detailed variance per earning head |
* **Success Scenarios:** HR verifies that late-approved medical leave or increment backdating produces the exact expected arrear figures.
* **Error Handling:**
  - `404 NO_CLOSED_RUN_FOR_PERIOD`: No approved or paid regular run exists for `period_month`.
  - `422 ENGINE_VERSION_NOT_RECONCILABLE`: Run was computed with legacy engine ($<5$); manual adjustment required.
  - `422 SNAPSHOT_INCOMPLETE`: Historical settings snapshot is missing required calculation keys.
* **Idempotency / Retry Behavior:** Idempotent read-only audit report.

---

## 204. Reconcile Arrears
* **API Name / Purpose:** Commit computed salary drift as approved arrear adjustments routed into the earliest open payroll month.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/arrears/reconcile`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:**
  ```json
  {
    "period_month": "2026-03",
    "target_period_month": "2026-04",
    "user_ids": [
      "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
    ],
    "reason": "Approved medical leave regularization for hospitalization",
    "allow_full_reversal": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `period_month` | String | Required | No | Closed source period | Format `YYYY-MM` | None |
  | `target_period_month` | String | Optional | Yes | Target open paying month | Format `YYYY-MM` | Earliest open month |
  | `user_ids` | Array[UUID] | Optional | Yes | Sub-cohort employee filter | Array of 1–500 unique employee UUIDs | All eligible employees |
  | `reason` | String | Required | No | Mandatory justification for money movement | Trimmed string between 1 and 500 characters | None |
  | `allow_full_reversal` | Boolean | Optional | No | Safety brake override for $\ge 99\%$ gross clawback | `true` or `false` | `false` |
* **Validation Rules:**
  - `period_month` and `reason` are strictly required.
  - `user_ids` if supplied must contain 1 to 500 unique UUIDs.
  - Source month must have a closed regular run; target month must be open.
* **Detailed API Function:**
  1. Opens single database transaction.
  2. Resolves target paying period (defaults to earliest open month via `periodGuard.arrearTargetFor`).
  3. Acquires rank-1 run advisory locks in strict total order: `target_period_month` then `source_period_month`.
  4. Asserts target period is open for variable pay, flagging active runs as `requires_recalculation`.
  5. Computes live drift inside the transaction, guaranteeing zero concurrency drift.
  6. Evaluates maker-checker policy: if `payroll_require_separate_checker` is false, adjustments land in `approved` status; otherwise `pending`.
  7. Generates a unique `arrear_batch_id` (UUIDv4).
  8. For each employee delta, generates `payroll_adjustments` records (`category: 'arrear'`), copying `is_taxable`, `pf_applicable`, and `esi_applicable` flags from the frozen line.
  9. Emits audit log entries `arrear.reconciled` (per employee) and `arrear.batch_reconciled` (batch-level).
* **Business/User-Facing Behavior:** Translates past changes into current pay adjustments without touching or invalidating closed historical pay periods or past payslips.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Arrears reconciled",
    "data": {
      "source_period_month": "2026-03",
      "source_run_id": "r1r2r3r4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "target_period_month": "2026-04",
      "arrear_batch_id": "b1b2b3b4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "nothing_to_settle": false,
      "adjustments_created": 2,
      "status": "approved",
      "skipped": [],
      "employees": [
        {
          "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "employee_code": "EMP-001",
          "net_delta": "6000.00",
          "reason_codes": [
            "ledger_changed"
          ]
        }
      ]
    }
  }
  ```
* **Zero-Drift Response (Idempotency in Action):**
  If no delta remains to settle, the API returns status `200 OK` with message `"No arrears to settle"`, `nothing_to_settle: true`, `adjustments_created: 0`, and `arrear_batch_id: null`.
* **Error Handling:**
  - `404 NO_CLOSED_RUN_FOR_PERIOD`: No closed regular run exists for source month.
  - `422 ENGINE_VERSION_NOT_RECONCILABLE`: Closed run engine version cannot be reconciled.
  - `422 SNAPSHOT_INCOMPLETE`: Required settings snapshot keys missing.
  - `409 NO_OPEN_ARREAR_TARGET`: No open payroll month exists to receive the arrear adjustments.
* **Idempotency / Retry Behavior:** Strictly idempotent. Re-running immediately results in zero deltas and creates zero duplicate adjustment records.
* **Side Effects:** Schedules new variable pay adjustments into the target open month and marks any existing calculated run as requiring recalculation.

---

## 205. List Arrears
* **API Name / Purpose:** Retrieve a paginated list of created salary arrear adjustments with complete provenance tracking (source period, source run, batch ID, applied run ID).
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/arrears`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `source_period_month` (Query, String, Optional): Filter by source historical period (`YYYY-MM`).
  - `arrear_batch_id` (Query, UUID, Optional): Filter by reconciliation batch.
  - `applied_run_id` (Query, UUID, Optional): Filter by the paying payroll run.
  - `user_id` (Query, UUID, Optional): Filter by employee.
  - `status` (Query, Enum: `'pending'`, `'approved'`, `'applied'`, `'rejected'`, `'cancelled'`, Optional)
  - `page` (Query, Integer, Optional, default `1`, min `1`)
  - `limit` (Query, Integer, Optional, default `20`, min `1`, max `100`)
* **Request JSON Payload:** None.
* **Validation Rules:** Query parameters validated inside controller (Express 5).
* **Detailed API Function:** Queries `payroll_adjustments` table scoped to `category = 'arrear'` and caller's `org_id`, joining provenance metadata columns.
* **Business/User-Facing Behavior:** HR audits all past and pending arrear lines, tracking when they were created, why they were raised, and which payroll run disbursed them.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Arrears fetched",
    "data": [
      {
        "id": "a1a2a3a4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "period_month": "2026-04",
        "adjustment_type": "earning",
        "category": "arrear",
        "component_code": "BASIC",
        "component_name": "Basic Salary",
        "amount": "4000.00",
        "is_taxable": true,
        "pf_applicable": true,
        "esi_applicable": false,
        "status": "approved",
        "source_kind": "retro_leave",
        "source_period_month": "2026-03",
        "source_run_id": "r1r2r3r4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "arrear_batch_id": "b1b2b3b4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "source_component_code": "BASIC",
        "applied_run_id": null,
        "reason": "Approved medical leave regularization (BASIC)",
        "created_at": "2026-04-10T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "total_pages": 1
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data[].source_period_month` | String | No | Origin month | The historical closed month where drift occurred |
  | `data[].period_month` | String | No | Target month | The active month paying out the adjustment |
  | `data[].arrear_batch_id` | UUID | No | Batch identifier | Connects all deltas generated in the same reconciliation run |
  | `data[].applied_run_id` | UUID | Yes | Disbursing run | The payroll run that included and paid this line (`null` if unpaid) |
* **Success Scenarios:** HR filters arrear adjustments by employee or batch ID.
* **Error Handling:** Standard 400 Joi validation on query parameters.
* **Idempotency / Retry Behavior:** Idempotent safe read.

---

# HR Administration APIs — Leave & Comp-Off Encashments — `/api/v1/payroll/hr`

## 206. Create Encashment (HR direct)
* **API Name / Purpose:** Directly create and process a compensatory off or leave balance cash-out for an employee (HR Tier C authority).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/employees/:userId/encashments`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `userId` (Path, UUID, Required): Target employee identifier.
* **Request JSON Payload (Comp-Off Encashment):**
  ```json
  {
    "source_kind": "comp_off",
    "comp_off_ids": [
      "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
    ],
    "period_month": "2026-03",
    "exit_id": null
  }
  ```
* **Request JSON Payload (Leave Balance Encashment):**
  ```json
  {
    "source_kind": "leave_balance",
    "leave_type_code": "EL",
    "days": 5.0,
    "period_month": "2026-03",
    "exit_id": null
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `source_kind` | Enum | Required | No | Type of encashment entitlement | `'comp_off'` or `'leave_balance'` | None |
  | `comp_off_ids` | Array[UUID] | Conditional | No | Comp-off register record IDs | Required when `source_kind='comp_off'`; forbidden otherwise. 1–366 unique UUIDs | None |
  | `leave_type_code` | String | Conditional | No | Leave type code to encash | Required when `source_kind='leave_balance'`; forbidden otherwise. Max 20 chars | None |
  | `days` | Number | Conditional | No | Number of days to cash out | Required when `source_kind='leave_balance'`; optional when `comp_off` (defaults to count of IDs). Min 0.01, max 365 | None |
  | `period_month` | String | Required | No | Target payroll disbursement month | Format `YYYY-MM` | None |
  | `exit_id` | UUID | Optional | Yes | Associated exit record if part of F&F | Valid exit UUID or `null` | `null` |
* **Validation Rules:**
  - `source_kind` dictates conditional fields. Passing `comp_off_ids` with `leave_balance` or vice versa causes validation failure.
  - Policy toggle must be enabled (`compoff_encashment_enabled` or `fnf_leave_encashment_enabled`).
  - For comp-offs, checks annual cap `compoff_encashment_max_days_per_fy`.
* **Detailed API Function:**
  1. Validates encashment policy is enabled for the source kind.
  2. Resolves daily payout rate from employee's latest approved structure overlapping the payout period.
  3. Divisor calculation: derives daily divisor based on policy setting (`fixed_30`, `calendar_days`, or `standard_working_days` derived from attendance calendar rules).
  4. Freezes per-day rate and total amount.
  5. If separate checker is disabled (`payroll_require_separate_checker = false`), immediately acquires rank-1 run lock and rank-3 encashment lock, atomically debits the source wallet (marking comp-off rows `encashed` and debiting `CO` leave wallet, or debiting leave balance), creates an approved ad-hoc earning adjustment, and sets status to `approved`.
  6. If separate checker is required, inserts row in `pending` status.
  7. Emits audit log entries `encashment.proposed` and (if settled) `encashment.approved`.
* **Business/User-Facing Behavior:** HR pays out unutilized comp-off days or leave days directly to employees as a payroll adjustment.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashment created",
    "data": {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "source_kind": "comp_off",
      "comp_off_ids": [
        "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
      ],
      "leave_type_id": null,
      "leave_type_code": null,
      "balance_year": 2026,
      "days": "1.00",
      "rate_basis": "basic",
      "divisor_basis": "fixed_30",
      "divisor_days": 30,
      "per_day_amount": "1000.00",
      "amount": "1000.00",
      "period_month": "2026-03",
      "component_id": "s1s2s3s4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "component_code": "COMPOFF_ENCASH",
      "status": "approved",
      "proposed_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "approved_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "actioned_at": "2026-03-15T10:00:00.000Z",
      "adjustment_id": "a1a2a3a4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "exit_id": null,
      "created_at": "2026-03-15T10:00:00.000Z",
      "updated_at": "2026-03-15T10:00:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.id` | UUID | No | Encashment ID | Primary key of `comp_off_encashments` |
  | `data.per_day_amount` | String | No | Frozen daily rate | Calculated daily rate in rupees |
  | `data.amount` | String | No | Total cash payout | $Days \times Per\_Day\_Amount$ |
  | `data.status` | String | No | Lifecycle status | `'pending'` or `'approved'` |
  | `data.adjustment_id` | UUID | Yes | Earning adjustment ID | Created `payroll_adjustments` row ID |
* **Success Scenarios:** HR creates encashment; wallet is immediately debited and adjustment scheduled.
* **Error Handling:**
  - `403 ENCASHMENT_DISABLED`: Policy toggle for this source kind is turned off in settings.
  - `404 EMPLOYEE_NOT_FOUND`: Employee has no active tenant profile.
  - `422 NO_SALARY_STRUCTURE`: No approved salary structure overlaps payout period.
  - `409 ENCASHMENT_CAP_EXCEEDED`: Requested days exceed annual comp-off cap.
  - `409 COMP_OFF_NOT_ENCASHABLE`: Comp-off is expired, already used, or not approved.
  - `409 INSUFFICIENT_LEAVE_BALANCE`: Requested days exceed current available balance.
* **Idempotency / Retry Behavior:** Non-idempotent creation.
* **Side Effects:** Debits employee leave balance wallet and marks comp-off records `encashed`.
* **Audit/Logging Behavior:** Emits audit event `encashment.proposed` and `encashment.approved`.
* **Dependencies:** Relies on attendance comp-off repository and leave balance repository.

---

## 207. List Encashments
* **API Name / Purpose:** Retrieve a paginated list of all comp-off and leave encashments across the organization.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/encashments`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `status` (Query, Enum: `'pending'`, `'approved'`, `'rejected'`, `'cancelled'`, Optional)
  - `user_id` (Query, UUID, Optional): Filter by employee.
  - `period_month` (Query, String, Optional): Filter by payout month (`YYYY-MM`).
  - `source_kind` (Query, Enum: `'comp_off'`, `'leave_balance'`, Optional)
  - `page` (Query, Integer, Optional, default `1`, min `1`)
  - `limit` (Query, Integer, Optional, default `20`, min `1`, max `100`)
* **Request JSON Payload:** None.
* **Validation Rules:** Query parameters validated inside controller (Express 5 safe pattern).
* **Detailed API Function:** Queries the `comp_off_encashments` repository scoped strictly to the caller's `org_id`, applying provided filters and sorting by `created_at DESC`.
* **Business/User-Facing Behavior:** HR inspects encashment submissions across the company, filtering by status or target month.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashments fetched",
    "data": [
      {
        "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "source_kind": "comp_off",
        "comp_off_ids": [
          "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
        ],
        "leave_type_id": null,
        "leave_type_code": null,
        "balance_year": 2026,
        "days": "1.00",
        "rate_basis": "basic",
        "divisor_basis": "fixed_30",
        "divisor_days": 30,
        "per_day_amount": "1000.00",
        "amount": "1000.00",
        "period_month": "2026-03",
        "component_id": "s1s2s3s4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "component_code": "COMPOFF_ENCASH",
        "status": "approved",
        "proposed_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "approved_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "actioned_at": "2026-03-15T10:00:00.000Z",
        "rejection_reason": null,
        "adjustment_id": "a1a2a3a4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "exit_id": null,
        "created_at": "2026-03-15T10:00:00.000Z",
        "updated_at": "2026-03-15T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "total_pages": 1
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data` | Array | No | Array of encashment records | Rows matching query filters |
  | `pagination.total` | Integer | No | Total count | Count of matching rows |
  | `pagination.total_pages` | Integer | No | Total pages | Paging total |
* **Success Scenarios:** HR views paginated list of company encashment requests.
* **Error Handling:** Standard 400 Joi query validation failure.
* **Idempotency / Retry Behavior:** Idempotent safe read.

---

## 208. Get Encashment Detail
* **API Name / Purpose:** Retrieve complete details of a single encashment record by ID.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/encashments/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Encashment unique identifier.
* **Request JSON Payload:** None.
* **Detailed API Function:** Fetches the encashment row by ID and caller `org_id` from `comp_off_encashments`.
* **Business/User-Facing Behavior:** HR inspects rate bases, divisor calculations, adjustment links, and proposer details for a specific encashment.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashment fetched",
    "data": {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "source_kind": "comp_off",
      "comp_off_ids": [
        "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
      ],
      "leave_type_id": null,
      "leave_type_code": null,
      "balance_year": 2026,
      "days": "1.00",
      "rate_basis": "basic",
      "divisor_basis": "fixed_30",
      "divisor_days": 30,
      "per_day_amount": "1000.00",
      "amount": "1000.00",
      "period_month": "2026-03",
      "component_id": "s1s2s3s4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "component_code": "COMPOFF_ENCASH",
      "status": "approved",
      "proposed_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "approved_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "actioned_at": "2026-03-15T10:00:00.000Z",
      "rejection_reason": null,
      "adjustment_id": "a1a2a3a4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "exit_id": null,
      "created_at": "2026-03-15T10:00:00.000Z",
      "updated_at": "2026-03-15T10:00:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:** Returns the complete row from `comp_off_encashments`.
* **Error Handling:** `404 ENCASHMENT_NOT_FOUND` if ID does not exist in caller's organization.
* **Idempotency / Retry Behavior:** Idempotent safe read.

---

## 209. Approve Encashment
* **API Name / Purpose:** Approve a manager-proposed pending encashment, atomically debiting the source leave wallet and materializing an approved earning adjustment.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/encashments/:id/approve`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Encashment unique identifier.
* **Request JSON Payload:** None.
* **Validation Rules:** Encashment must be in `pending` status (`409 ENCASHMENT_NOT_ACTIONABLE`). Approver must satisfy separate checker rule if enabled (`403 SEPARATE_CHECKER_REQUIRED`).
* **Detailed API Function:**
  1. Acquires rank-1 run advisory lock on `period_month` and rank-3 advisory lock on employee ID.
  2. Acquires row lock on encashment record and verifies status is `pending`.
  3. Verifies separate checker policy: proposer cannot approve their own proposal if separate checker is required.
  4. Calls internal `_settle`:
     * For comp-offs: marks each comp-off record as `encashed` and debits `CO` leave wallet for the year earned.
     * For leave balances: debits employee leave balance wallet.
     * Creates approved earning adjustment in `payroll_adjustments`.
  5. Updates encashment record to `approved`, linking `adjustment_id`.
  6. Emits audit log entry `encashment.approved`.
* **Business/User-Facing Behavior:** HR finalizes approval of team encashment requests; employee leave balance is deducted and cash adjustment is booked.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashment approved",
    "data": {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "approved",
      "approved_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "actioned_at": "2026-03-18T14:00:00.000Z",
      "adjustment_id": "a1a2a3a4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "updated_at": "2026-03-18T14:00:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.status` | String | No | Updated status | Set to `'approved'` |
  | `data.approved_by` | UUID | No | Approver user ID | Caller HR administrator ID |
  | `data.adjustment_id` | UUID | No | Earning adjustment | The generated `payroll_adjustments` row ID |
* **Error Handling:**
  - `404 ENCASHMENT_NOT_FOUND`
  - `409 ENCASHMENT_NOT_ACTIONABLE`: Record is not in `pending` status.
  - `403 SEPARATE_CHECKER_REQUIRED`: Approver is same as proposer when separate checker required.
  - `409 COMP_OFF_NOT_ENCASHABLE`: Comp-off expired while sitting in pending queue.
  - `409 INSUFFICIENT_LEAVE_BALANCE`: Employee spent leave balance while request was pending.
* **Idempotency / Retry Behavior:** Non-idempotent; only callable once while in `pending` status.
* **Side Effects:** Debits leave wallet and creates approved earning adjustment.

---

## 210. Reject Encashment
* **API Name / Purpose:** Decline a pending encashment proposal with a mandatory justification reason.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/encashments/:id/reject`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Encashment unique identifier.
* **Request JSON Payload:**
  ```json
  {
    "rejection_reason": "Encashment requests must be deferred to Q4 per policy"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `rejection_reason` | String | Required | No | Mandatory justification for rejection | Trimmed string between 1 and 1000 characters | None |
* **Validation Rules:** Encashment must be in `pending` status (`409 ENCASHMENT_NOT_ACTIONABLE`). `rejection_reason` is required.
* **Detailed API Function:** Updates record status to `rejected`, stamps `approved_by` with rejecting user, records `rejection_reason` and `actioned_at`. No wallets or comp-off records are touched. Emits audit log `encashment.rejected`.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashment rejected",
    "data": {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "rejected",
      "approved_by": "h1h2h3h4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "actioned_at": "2026-03-18T15:00:00.000Z",
      "rejection_reason": "Encashment requests must be deferred to Q4 per policy"
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.status` | String | No | Terminal status | Set to `'rejected'` |
  | `data.rejection_reason` | String | No | Explanation | Recorded HR justification |
* **Error Handling:** `404 ENCASHMENT_NOT_FOUND`, `409 ENCASHMENT_NOT_ACTIONABLE`.
* **Idempotency / Retry Behavior:** Non-idempotent; only callable while in `pending` status.
* **Side Effects:** None on leave wallets or attendance records.

---

## 211. Cancel Encashment
* **API Name / Purpose:** Cancel a pending encashment request or reverse an approved-but-unpaid encashment, restoring leave balances.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/encashments/:id/cancel`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `id` (Path, UUID, Required): Encashment unique identifier.
* **Request JSON Payload:** None.
* **Validation Rules:** Cannot cancel an encashment whose adjustment has already been applied to an approved or paid payroll run (`409 ADJUSTMENT_ALREADY_APPLIED`). Cannot cancel already `rejected` or `cancelled` rows.
* **Detailed API Function:**
  1. If status is `pending`: transitions status directly to `cancelled`.
  2. If status is `approved`:
     * Verifies adjustment is unpaid (`applied_run_id is null`).
     * Re-credits employee leave balance wallet.
     * If comp-off: restores comp-off records from `encashed` back to `approved`.
     * Cancels the linked `payroll_adjustments` row.
     * Sets encashment status to `cancelled`.
  3. Emits audit log entry `encashment.reversed` or `encashment.cancelled`.
* **Business/User-Facing Behavior:** Allows HR to cleanly undo an approved encashment before payroll pays out, restoring the employee's time-off entitlements.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashment cancelled",
    "data": {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "status": "cancelled",
      "actioned_at": "2026-03-19T10:00:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.status` | String | No | Terminal status | Set to `'cancelled'` |
  | `data.actioned_at` | String | No | Action timestamp | Timestamp when cancellation was processed |
* **Error Handling:**
  - `404 ENCASHMENT_NOT_FOUND`
  - `409 ENCASHMENT_NOT_ACTIONABLE`
  - `409 ADJUSTMENT_ALREADY_APPLIED`: Payout has already been disbursed in a closed run.
* **Idempotency / Retry Behavior:** Retrying on already cancelled row returns `409 ENCASHMENT_NOT_ACTIONABLE`.
* **Side Effects:** Restores leave balance wallet and cancels pending earning adjustment.

---

# HR Administration APIs — Payroll Automation & Background Jobs — `/api/v1/payroll/hr`

> **Manual Trigger Design (F-13 / D-70):** Endpoints #212–#215 allow HR Administrators to trigger background automation passes on-demand. Every manual trigger is strictly scoped to the caller's organization (`req.user.orgId`) — never accepting client-supplied org IDs. Each job is watermark-idempotent: running a trigger twice on the same day performs a proven no-op.

## 212. Run Calendar Reminders (manual)
* **API Name / Purpose:** Manually execute the four payroll calendar reminder checks (attendance cut-off, payday, declaration window, and proof deadline) for the caller's organization.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/jobs/calendar-reminders/run`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:** None.
* **Detailed API Function:**
  1. Checks attendance cut-off reminder: If today equals `attendance_cutoff_day` and `payroll_cutoff_reminder_enabled` is true, claims watermark `last_cutoff_reminder_on` and sends notification emails to HR team.
  2. Checks payday reminder: If today equals `pay_day` and `payroll_payday_reminder_enabled` is true, claims watermark `last_payday_reminder_on`, checks for unapproved payroll runs and unreconciled arrear drift across the last 3 closed months, and sends reminder emails to HR.
  3. Checks declaration opening reminder: If today is 1st day of declaration window, claims watermark and notifies active employees who have not submitted declarations.
  4. Checks proof submission deadline reminder: If today is exactly 14 days before `tax_proof_deadline`, claims watermark and notifies employees with unverified declaration items.
* **Business/User-Facing Behavior:** Allows HR to force immediate processing of payroll calendar alerts if scheduled cron jobs were delayed.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Calendar reminders processed",
    "data": {
      "orgs": 1,
      "failed": 0,
      "sent": {
        "cutoff": 1,
        "payday": 0,
        "declaration": 0,
        "proof": 0
      }
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.orgs` | Integer | No | Count of orgs evaluated | Always 1 for manual HR trigger |
  | `data.failed` | Integer | No | Failures encountered | Count of failed reminder passes |
  | `data.sent.cutoff` | Integer | No | Cut-off emails sent | 1 if sent; 0 if already claimed or not due |
  | `data.sent.payday` | Integer | No | Payday alerts sent | 1 if sent; 0 if already claimed or not due |
  | `data.sent.declaration` | Integer | No | Declaration alerts sent | Count of declaration notification batches sent |
  | `data.sent.proof` | Integer | No | Proof deadline alerts sent | Count of proof reminder batches sent |
* **Success Scenarios:** HR triggers reminders; due notices are dispatched without double-sending.
* **Error Handling:** Returns standard 500 on unexpected mail provider failure; individual email errors are caught and logged without aborting other reminders.
* **Idempotency / Retry Behavior:** Strictly watermark-idempotent. Calling twice on the same day returns 0 sent for all reminders.

---

## 213. Run Auto-Draft (manual)
* **API Name / Purpose:** Manually execute automated payroll draft creation for the caller's organization.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/jobs/auto-draft/run`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:** None.
* **Detailed API Function:**
  1. Verifies `payroll_auto_draft_enabled` is true in org settings.
  2. Verifies current date is on or after `payroll_auto_draft_day`.
  3. Resolves the most recent closed period whose end date precedes today.
  4. Asserts that no live regular run exists for that period.
  5. Creates a regular payroll run in `draft` status. Never calculates or approves automatically (human-in-the-loop safety).
* **Business/User-Facing Behavior:** Creates the monthly draft payroll run automatically if it has not yet been drafted by HR.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Auto-draft processed",
    "data": {
      "orgs": 1,
      "failed": 0,
      "created": 1
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.created` | Integer | No | Draft runs created | 1 if new draft was created; 0 if already exists or not due |
* **Success Scenarios:** HR clicks trigger; shell draft run is initialized and ready for attendance review.
* **Error Handling:** Standard global envelope; returns `created: 0` if draft already exists.
* **Idempotency / Retry Behavior:** Idempotent; protected by partial unique index on active runs.

---

## 214. Run Sweeper (manual)
* **API Name / Purpose:** Manually sweep and recover stale payroll runs stranded in `calculating` status due to server crashes or calculation timeouts.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/jobs/run-sweeper/run`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:** None.
* **Detailed API Function:**
  1. Scans `payroll_runs` for records in caller's org with `status = 'calculating'` and `updated_at < (now - 30 minutes)`.
  2. Transitions stranded runs to `failed` status with reason `calculation_stale_swept`.
  3. Emits audit log entry `run.stale_swept`.
* **Business/User-Facing Behavior:** Unlocks stuck payroll calculations without requiring engineering intervention or database resets, allowing HR to recalculate safely.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Stale-run sweep processed",
    "data": {
      "orgs": 1,
      "failed": 0,
      "swept": 1
    }
  }
  ```
* **Response Fields & Meaning:** `data.swept` indicates the number of crashed runs recovered to failed status.
* **Success Scenarios:** HR clears a stuck calculation job and re-runs calculation cleanly.
* **Error Handling:** Standard global error envelope.
* **Idempotency / Retry Behavior:** Idempotent safe sweep.

---

## 215. Run Attachment Sweeper (manual)
* **API Name / Purpose:** Manually sweep abandoned temporary attachment uploads and purge soft-deleted receipts past the legal document retention window.
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/hr/jobs/attachment-sweeper/run`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:** None.
* **Detailed API Function:**
  1. Abandoned Uploads: Identifies `pending` attachment records older than 24 hours. Deletes S3 object and deletes database pointer row.
  2. Retention Purge: Reads `payroll_attachment_retention_days` (default 2555 days / 7 years). Identifies soft-deleted attachment records past the retention cutoff.
  3. Statutory Document Protection: Form 16 Part A certificates (`owner_type = 'form16_part_a'`) are **strictly excluded** from retention purges.
  4. Safe Deletion Order: S3 storage object is deleted FIRST; only if deletion succeeds is the database row removed.
* **Business/User-Facing Behavior:** Maintains legal data hygiene and controls cloud storage costs while protecting statutory compliance documents.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Attachment sweep processed",
    "data": {
      "orgs": 1,
      "failed": 0,
      "pending_deleted": 3,
      "retained_purged": 12,
      "kept": 0,
      "has_more": false
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.pending_deleted` | Integer | No | Unconfirmed uploads purged | Upload drafts $>24$h old deleted |
  | `data.retained_purged` | Integer | No | Expired documents deleted | Soft-deleted files past retention window purged |
  | `data.kept` | Integer | No | Objects held | Rows kept because S3 deletion failed |
  | `data.has_more` | Boolean | No | Batch indicator | `true` if more items remain to sweep in next batch |
* **Success Scenarios:** HR triggers storage maintenance.
* **Error Handling:** Standard global error envelope.
* **Idempotency / Retry Behavior:** Idempotent safe sweep.

---

# Manager Plane APIs — Encashments — `/api/v1/payroll/manager`

*Auth stack for Manager routes: `authenticate` → `authorize(['manager', 'hr'])` → `requireFeature('payroll.access')`.*

## 216. Propose Encashment (manager)
* **API Name / Purpose:** Propose a compensatory off or leave balance cash-out on behalf of a direct or indirect reporting team member (Manager Tier B authority).
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/payroll/manager/employees/:userId/encashments`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `userId` (Path, UUID, Required): Reporting employee identifier.
* **Request JSON Payload:**
  ```json
  {
    "source_kind": "comp_off",
    "comp_off_ids": [
      "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
    ],
    "period_month": "2026-03"
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `source_kind` | Enum | Required | No | Type of encashment entitlement | `'comp_off'` or `'leave_balance'` | None |
  | `comp_off_ids` | Array[UUID] | Conditional | No | Comp-off register record IDs | Required when `source_kind='comp_off'`; forbidden otherwise. 1–366 unique UUIDs | None |
  | `leave_type_code` | String | Conditional | No | Leave type code to encash | Required when `source_kind='leave_balance'`; forbidden otherwise. Max 20 chars | None |
  | `days` | Number | Conditional | No | Number of days to cash out | Required when `source_kind='leave_balance'`; optional when `comp_off` (defaults to count of IDs). Min 0.01, max 365 | None |
  | `period_month` | String | Required | No | Target payroll disbursement month | Format `YYYY-MM` | None |
  | `exit_id` | UUID | Optional | Yes | Associated exit record if part of F&F | Valid exit UUID or `null` | `null` |
* **Validation Rules:**
  - Target employee must belong to the caller's reporting tree (`403 FORBIDDEN`).
  - Self-proposal is strictly blocked (`403 SELF_ACTION_FORBIDDEN`); a manager cannot propose encashment for themselves.
  - Policy must be active in settings (`403 ENCASHMENT_DISABLED`).
* **Detailed API Function:**
  1. Resolves caller's accessible user IDs via reporting hierarchy.
  2. Asserts target employee is within accessible hierarchy and is not the caller.
  3. Resolves and freezes daily encashment rate and total amount.
  4. If `manager_direct_compensation_authority` is true, immediately settles (debits leave wallet and creates approved adjustment); otherwise, lands in `pending` status for HR review.
  5. Emits audit log entry `encashment.proposed`.
* **Business/User-Facing Behavior:** People managers reward holiday work or assist departing reports by recommending cash conversion of unused entitlements.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashment proposed for HR approval",
    "data": {
      "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "org_id": "o1o2o3o4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "source_kind": "comp_off",
      "comp_off_ids": [
        "c1c2c3c4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
      ],
      "days": "1.00",
      "rate_basis": "basic",
      "divisor_basis": "fixed_30",
      "divisor_days": 30,
      "per_day_amount": "1000.00",
      "amount": "1000.00",
      "period_month": "2026-03",
      "status": "pending",
      "proposed_by": "m1m2m3m4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "created_at": "2026-03-12T10:00:00.000Z"
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data.id` | UUID | No | Encashment ID | Primary key of `comp_off_encashments` |
  | `data.status` | String | No | Workflow status | `'pending'` (awaiting HR review) or `'approved'` |
  | `data.proposed_by` | UUID | No | Proposing manager | Caller's user ID |
* **Success Scenarios:** Manager proposes comp-off cash-out for a direct report.
* **Error Handling:**
  - `403 FORBIDDEN`: Target user is outside manager's reporting hierarchy.
  - `403 SELF_ACTION_FORBIDDEN`: Manager attempted to propose encashment for themselves.
  - `403 ENCASHMENT_DISABLED`: Encashment disabled in org settings.
  - `409 ENCASHMENT_CAP_EXCEEDED`: Exceeds annual comp-off day limit.
  - `409 COMP_OFF_NOT_ENCASHABLE`: Comp-off record not valid or already spent.
* **Idempotency / Retry Behavior:** Non-idempotent creation.
* **Side Effects:** Locks comp-off IDs into a pending encashment request.

---

## 217. List Team Encashments (manager)
* **API Name / Purpose:** Retrieve a paginated list of encashment requests for direct and indirect reports with compensation privacy masking.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/manager/encashments`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:**
  - `status` (Query, Enum: `'pending'`, `'approved'`, `'rejected'`, `'cancelled'`, Optional)
  - `user_id` (Query, UUID, Optional): Narrows list within manager's hierarchy.
  - `period_month` (Query, String, Optional): Filter by payout month (`YYYY-MM`).
  - `source_kind` (Query, Enum: `'comp_off'`, `'leave_balance'`, Optional)
  - `page` (Query, Integer, Optional, default `1`, min `1`)
  - `limit` (Query, Integer, Optional, default `20`, min `1`, max `100`)
* **Request JSON Payload:** None.
* **Validation Rules:** Query parameters validated inside controller (Express 5).
* **Detailed API Function:**
  1. Resolves manager's accessible reporting hierarchy.
  2. Queries encashment rows restricted strictly to accessible team members.
  3. Compensation Privacy Gate (EC-25): Inspects `manager_can_view_team_compensation` setting. If false, strips monetary figures (`amount = null`, `per_day_amount = null`, `rate_basis = null`, `divisor_days = null`), preserving days count and approval status.
* **Business/User-Facing Behavior:** Managers track the progress of team cash-out proposals without exposing private employee salary figures.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashments fetched",
    "data": [
      {
        "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "source_kind": "comp_off",
        "days": "1.00",
        "rate_basis": null,
        "divisor_days": null,
        "per_day_amount": null,
        "amount": null,
        "period_month": "2026-03",
        "status": "pending",
        "proposed_by": "m1m2m3m4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "total_pages": 1
    }
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data[].days` | String | No | Encashment days | Number of days requested |
  | `data[].amount` | String | Yes | Payout amount | Masked to `null` when compensation view is disabled |
  | `data[].status` | String | No | Approval state | `'pending'`, `'approved'`, `'rejected'`, `'cancelled'` |
* **Success Scenarios:** Manager views pending team proposals.
* **Error Handling:** Standard 400 Joi query validation.
* **Idempotency / Retry Behavior:** Idempotent safe read.

---

# Employee Self-Service APIs — Encashments — `/api/v1/payroll`

*Auth stack for Self routes: `authenticate` → `requireFeature('payroll.access')` (Self-scoped to `req.user.id`, no role gate).*

## 218. List Own Encashments
* **API Name / Purpose:** Retrieve the authenticated employee's personal history of compensatory off and leave encashments.
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/me/encashments`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any active tenant role (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `payroll.access`
* **Request Parameters:** None.
* **Request JSON Payload:** None.
* **Validation Rules:** None (self-scoped).
* **Detailed API Function:** Queries `comp_off_encashments` scoped strictly to caller's `org_id` and `req.user.id`. Returns up to 200 records sorted chronologically.
* **Business/User-Facing Behavior:** Employees monitor their leave and comp-off cash-out requests, checking whether their request is pending review, approved, or paid.
* **Response Structure:**
  ```json
  {
    "success": true,
    "message": "Encashments fetched",
    "data": [
      {
        "id": "e1e2e3e4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "user_id": "b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "source_kind": "comp_off",
        "days": "1.00",
        "per_day_amount": "1000.00",
        "amount": "1000.00",
        "period_month": "2026-03",
        "status": "approved",
        "rejection_reason": null,
        "created_at": "2026-03-12T10:00:00.000Z"
      }
    ]
  }
  ```
* **Response Fields & Meaning:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :--- | :--- | :--- |
  | `data[].source_kind` | String | No | Payout source | `'comp_off'` or `'leave_balance'` |
  | `data[].days` | String | No | Encashment days | Days cashed out |
  | `data[].amount` | String | No | Rupee cash value | Total payout credited to employee |
  | `data[].status` | String | No | Request state | `'pending'`, `'approved'`, `'rejected'`, `'cancelled'` |
  | `data[].period_month` | String | No | Payout month | Payroll month receiving the payout line |
* **Success Scenarios:** Employee reviews personal encashment history on their self-service dashboard.
* **Error Handling:** Standard 401 unauthenticated or 403 feature not available.
* **Idempotency / Retry Behavior:** Idempotent safe read.
