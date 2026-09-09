# Combined API Analysis: Payroll Module (Phases 1–4: Foundation, Run Engine, Variable Pay & Statutory/Tax)

This document is the request/response contract for **every endpoint shipped across Phases 1, 2, 3, and 4** of the Payroll module: the salary-component catalog, salary-structure templates, per-employee versioned effective-dated salary structures (with the D-13 maker-checker chain), org payroll settings, encrypted bank accounts, the append-only audit trail, the core calculation and run execution engine, the complete variable-pay suite (bonuses, ad-hoc adjustments, bulk CSV batches, employee loans, EMI schedules, foreclosures, and shortfall carry-forwards), and the **Phase 4 statutory & tax layer** (the `statutory_configs` singleton, professional-tax slabs, income-tax regimes/slabs, investment declarations, per-employee tax summaries & Form 16, and the self-service tax surface).

> **Global envelope.** Success: `{ "success": true, "message": "...", "data": ... }`. Error: `{ "success": false, "message": "...", "errorCode": "..." }` via `AppError(status, message, errorCode)`. Every handler is `async (req, res, next)` with `try/catch → next(error)`.

> **Two authority planes (§6.0).** Payroll is **tenant-plane only**. `hr` is the top of the org tree; `manager` and `employee` operate within it. Platform roles (`admin`, `super-admin`, `worker`) are **deliberately excluded** — their tokens carry `org_id = NULL` and are stopped by `requireFeature('payroll.access')` with `400 MISSING_ORG_CONTEXT` before any role gate. This makes Payroll the strictest module in the product; the `['hr']`-only HR stack is an intentional divergence from Attendance/Leave and must not be "harmonized."

> **Feature flag.** Every route requires the `payroll.access` feature. An org without the flag receives `403 FEATURE_NOT_AVAILABLE` (or `400 MISSING_ORG_CONTEXT` for a platform token).

> **Money & dates.** Money-bearing fields (`value`, `annual_ctc`) accept **either a number or a numeric string**; the string form is preferred because `money.utils` parses it losslessly (integer-paise arithmetic, no float round-trip). All amounts are stored and reconciled in integer minor units (paise). Effective dates are `YYYY-MM-DD` strings to keep `DATEONLY` free of timezone drift.

> **`ctc_cost` semantic change in Phase 4 (engine 4).** On a run item, `ctc_cost` is the true employer cost of employment for the period. Through engine 3 it was earnings plus employer variable-pay contributions; from **engine 4 it additionally includes the employer statutory contributions** — PF-employer, EPS, EDLI, the PF admin charge, and ESI-employer — because those are real employer outlays. Frozen engine-2/-3 runs are unaffected (D-12); their `ctc_cost` keeps the old meaning, and the item's `engine_version` disambiguates which definition applies. Consumers aggregating employer cost across mixed-engine periods must not assume a single formula — read `engine_version`.

> **Honesty guard on every payslip/figure endpoint.** Each run item carries `statutory_status` (`applied` | `disabled` | `not_applied`) and its run carries `engine_version`, so a reader can never mistake a pre-statutory `net_pay` for a real post-withholding take-home. Engine-4 items are `applied` (org withholds) or `disabled` (org opted out); engine-2/-3 items are `not_applied`. The self/manager payslip exposes the employee's own statutory heads and wage bases but **never** `statutory_snapshot` (HR-only diagnostics carrying declaration-derived figures — D-28).

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

## 24. Get Employee Bank Account (HR view)
* **HTTP method**: `GET` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/bank-account` · **Roles**: `hr`.
* **Request Fields**: `userId` (Path, UUID).
* **Detailed API Function**: Returns the employee's primary account **masked** — the full number is AES-256-GCM encrypted at rest and is **never** returned.
* **What This API Gives/Does**: `{ account_holder_name, masked_account_number: "••••1234", ifsc_code, bank_name, branch_name, account_type, is_verified, ... }` or `null`.

## 25. Verify an Employee Bank Account
* **HTTP method**: `POST` · **Endpoint**: `/api/v1/payroll/hr/employees/:userId/bank-account/verify` · **Roles**: `hr`.
* **Request Fields**: `userId` (Path, UUID).
* **Detailed API Function**: Sets `is_verified = true`, `verified_by`, `verified_at`. **Idempotent** — verifying an already-verified account is a no-op success.
* **Error handling**: `404 BANK_ACCOUNT_NOT_FOUND`.
* **What This API Gives/Does**: The masked, now-verified account.

## 26. List Audit Logs
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
