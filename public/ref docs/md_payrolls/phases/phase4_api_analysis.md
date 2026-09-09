# Phase 4: Statutory & Tax (PF, ESI, PT, Income Tax/TDS, Declarations & Form 16) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint analysis of the **33 APIs (#95–#127)** implemented in Phase 4 of the Payroll module.

> [!IMPORTANT]
> **Architectural Premise:** Payroll is exclusively a **tenant-plane** module. Platform roles (`admin`, `super-admin`) are strictly blocked. Every route demands an organizational `orgId` and the `payroll.access` feature flag. Statutory withholding is layered on top of the Phase 2/3 run engine: from **engine version 4**, a calculated run item carries the twelve statutory figures (`pf_wage`, `esi_wage`, `taxable_earnings`, `esi_covered`, the PF/EPS/ESI split, `professional_tax_amount`, `income_tax_amount`, and the HR-only `statutory_snapshot`).

> [!IMPORTANT]
> **No Manager surface (D-28).** Phase 4 adds **no** manager tax or declaration endpoints. `payroll_manager.routes.js` is untouched. Tax figures are personal and legally sensitive; a manager never sees a report's declaration, regime, or `statutory_snapshot`.

---

## 1. HR Administration APIs — `/api/v1/payroll/hr`
*Auth stack:* `authenticate` → `authorize(['hr'])` → `requireFeature('payroll.access')`

### API 95: Get Statutory Config
* **API Name:** Get Statutory Config
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/statutory/config`
* **Purpose:** Returns the org's statutory-configuration singleton — the master switches and rates for PF, EPS, EDLI, ESI, PT and income-tax/TDS.
* **Business problem solved:** Centralizes all statutory configurations in a single place to ensure compliance and consistent payroll runs.
* **Why the API exists:** HR needs one place to see and govern every statutory withholding decision that will drive every future run.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** An HR administrator opens the "Statutory Settings" page to review the currently active PF and PT rules for the organization.
* **Request structure and parameters:** None.
* **Request payload and field meanings:** None.
* **Backend processing flow:** Lazy `getOrCreate` — provisions the singleton with statute-default rates on first read (all heads default OFF). Returns `updated_at` and `updated_by` tracking.
* **Database impact:** May insert one `statutory_configs` row on first access; otherwise read-only.
* **Validation rules:** None.
* **Success response structure:** `{ "success": true, "data": { ...config } }`
* **Response field meanings:** Returns all statutory flags (`pf_enabled`, etc.), rates, and wage ceilings.
* **Failure/error scenarios:** Standard auth errors.
* **HTTP status codes and error codes:** `200 OK`, `401 Unauthorized`, `403 Forbidden`.
* **Security / authorization behavior:** Validates tenant token and checks `hr` role + `payroll.access` feature.
* **Idempotency and retry behavior:** Idempotent read.
* **Transactions and concurrency behavior:** Read concurrency handled natively by `getOrCreate`.
* **Side effects:** Seeds the default statutory config if it doesn't exist.
* **Important edge cases:** First-time access triggers an insertion of default values.
* **Related APIs/dependencies:** API #96 (Update Config).
* **What the API gives/does:** Returns the single active statutory configuration record for the organization.

---

### API 96: Update Statutory Config
* **API Name:** Update Statutory Config
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/statutory/config`
* **Purpose:** Partial update of the statutory singleton (enable/disable heads, edit rates and ceilings).
* **Business problem solved:** Allows HR to adapt to new government regulations (e.g., changes in PF ceilings or TDS rules).
* **Why the API exists:** To configure withholding variables before running payroll engines.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR opts the organization into ESI or updates the PF wage ceiling from 15k to 21k.
* **Request structure and parameters:** None in URL.
* **Request payload and field meanings:** Accepts any subset of configuration flags/rates (`pf_enabled`, `pf_employee_rate`, `esi_enabled`, etc.).
* **Backend processing flow:** Reads the pre-image, applies the patch, writes the audit log old→new. When a head is newly enabled, it activates that head's catalog component rows. Computes which live `draft`/`calculated` runs have a `settings_snapshot` older than this edit.
* **Database impact:** Updates the `statutory_configs` singleton row. Inserts an audit log.
* **Validation rules:** Every rate `0–100`; ceilings/thresholds `> 0`; DB `CHECK (eps_rate <= pf_employer_rate)`. Unknown keys are stripped.
* **Success response structure:** `{ "success": true, "data": { "config": {...}, "affected_runs": [...] } }`
* **Response field meanings:** The updated config plus `affected_runs`, which are runs that must be cancelled and re-created to adopt the new config.
* **Failure/error scenarios:** Validation failures for invalid rate numbers.
* **HTTP status codes and error codes:** `200 OK`, `422 Unprocessable Entity`.
* **Security / authorization behavior:** Requires `hr` token and `payroll.access`.
* **Idempotency and retry behavior:** Idempotent updates.
* **Transactions and concurrency behavior:** Updates within a transaction to guarantee consistency with audit logs.
* **Side effects:** Modifying configurations affects newly calculated runs; already frozen runs remain unchanged unless cancelled and re-created.
* **Important edge cases:** Enabling a statutory head (e.g. `pf_enabled = true`) automatically ensures its component is activated in the catalog.
* **Related APIs/dependencies:** Impacts the main run calculate engine.
* **What the API gives/does:** Returns the updated statutory configuration object.

---

### API 97: List Professional-Tax Slabs
* **API Name:** List Professional-Tax Slabs
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/statutory/pt-slabs`
* **Purpose:** Lists PT slab rows, optionally filtered by state.
* **Business problem solved:** Gives HR visibility into the active PT tax brackets across states.
* **Why the API exists:** Required for displaying the active PT tables before running payroll for distributed teams.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR wants to verify the PT deductions configured for the Karnataka state office.
* **Request structure and parameters:** Query parameters: `state_code` (String), `is_active` (Boolean).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Fetches active PT slabs from the database grouped by state code. Query parameters are validated in the controller.
* **Database impact:** Read-only.
* **Validation rules:** Validates the `state_code` enum in the query parameter.
* **Success response structure:** `{ "success": true, "data": [ ...slabs ] }`
* **Response field meanings:** Slab rows grouped/orderable by `(state_code, from_amount)`, each with `gender` and `month_overrides`.
* **Failure/error scenarios:** Standard auth errors.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read operation.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** If no slabs exist, returns an empty array.
* **Related APIs/dependencies:** API #98, API #99.
* **What the API gives/does:** An array of PT slabs.

---

### API 98: Replace a State's PT Slab Set
* **API Name:** Replace a State's PT Slab Set
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/statutory/pt-slabs/states/:stateCode`
* **Purpose:** Atomically replaces the entire slab set for one state.
* **Business problem solved:** Guarantees that PT slabs for a state never contain gaps or overlapping salary brackets, preventing tax computation errors.
* **Why the API exists:** When a state government revises its PT brackets, HR must update the entire schedule at once.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** The Maharashtra state government changes PT brackets for female employees. HR submits the new full slab array.
* **Request structure and parameters:** `stateCode` (Path, String).
* **Request payload and field meanings:** `state_name` (String), `slabs` (Array of objects with `from_amount`, `to_amount`, `monthly_amount`, `gender`, `month_overrides`).
* **Backend processing flow:** Obtains an advisory transaction lock. Soft-deletes the state's existing active slabs and inserts the new set under one transaction.
* **Database impact:** Soft deletes old `pt_slabs` rows, inserts new rows.
* **Validation rules:** Validates the contiguous, half-open `[from, to)` intervals to prevent gaps or overlaps per gender. `to_amount` = null denotes infinity.
* **Success response structure:** `{ "success": true, "data": [ ...newSlabs ] }`
* **Response field meanings:** The newly inserted active slabs for the state.
* **Failure/error scenarios:** Gap or overlap detected in the provided slabs.
* **HTTP status codes and error codes:** `422 PT_SLAB_RANGE_INVALID` naming the exact gap or overlap.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Highly idempotent (replaces entirely).
* **Transactions and concurrency behavior:** Uses `pg_advisory_xact_lock` (`payroll:pt_slabs:{orgId}:{stateCode}`) to prevent race conditions during bulk replacement. All DB writes occur within a single transaction.
* **Side effects:** Modifies the PT deductions applied to future payroll calculations for employees in this state.
* **Important edge cases:** Replacing with an empty array acts like a deactivation.
* **Related APIs/dependencies:** API #99.
* **What the API gives/does:** Returns the newly inserted slab set.

---

### API 99: Deactivate a State's PT Slabs
* **API Name:** Deactivate a State's PT Slabs
* **HTTP Method:** `DELETE`
* **Endpoint:** `/api/v1/payroll/hr/statutory/pt-slabs/states/:stateCode`
* **Purpose:** Turns off PT for a state without destroying the historical rows.
* **Business problem solved:** If an org shuts down operations in a state, they can disable PT calculations without breaking historical payroll audits.
* **Why the API exists:** Safe tombstoning of active slabs.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR removes all PT configurations for an abandoned state office.
* **Request structure and parameters:** `stateCode` (Path, String).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Soft-deletes (sets `deleted_at`) all currently active PT slabs for the specified state.
* **Database impact:** Modifies `deleted_at` timestamp on existing rows.
* **Validation rules:** None beyond path validation.
* **Success response structure:** `{ "success": true, "message": "PT slabs deactivated" }`
* **Response field meanings:** Confirmation message.
* **Failure/error scenarios:** No active slabs found.
* **HTTP status codes and error codes:** `404 PT_SLAB_STATE_NOT_FOUND`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent (404 on repeat).
* **Transactions and concurrency behavior:** Simple bulk update.
* **Side effects:** Ceases PT deductions for employees in this state on future runs.
* **Important edge cases:** None.
* **Related APIs/dependencies:** API #98.
* **What the API gives/does:** Confirms deactivation of the slabs.

---

### API 100: Bootstrap Tax Tables
* **API Name:** Bootstrap Tax Tables
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/tax/bootstrap`
* **Purpose:** Idempotently seed default income-tax regimes and their slabs for a financial year.
* **Business problem solved:** Eliminates the need for HR to manually construct complex Indian income tax brackets at the start of every fiscal year.
* **Why the API exists:** System-assisted initialization of annual tax structures.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** Start of April, HR initiates the FY 2026-27 tax environment. The backend provisions Old and New regimes automatically.
* **Request structure and parameters:** None in URL.
* **Request payload and field meanings:** `{ "financial_year": "YYYY-YY" }`
* **Backend processing flow:** Seeds the default old and new regimes along with their corresponding slabs. Only inserts missing `(financial_year, code)` pairs, never overwrites HR-edited regimes.
* **Database impact:** Inserts into `tax_regimes` and `tax_slabs`.
* **Validation rules:** `YYYY-YY` format for the financial year.
* **Success response structure:** `{ "success": true, "data": { "created": [...], "skipped": [...] } }`
* **Response field meanings:** Lists newly added vs pre-existing regimes.
* **Failure/error scenarios:** Invalid FY format.
* **HTTP status codes and error codes:** `400 Bad Request`, `422 Unprocessable Entity`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Highly idempotent. Calling it twice creates nothing the second time.
* **Transactions and concurrency behavior:** Runs within an atomic transaction.
* **Side effects:** Makes the FY available for employee tax regime elections.
* **Important edge cases:** HR can edit bootstrapped tables; rerunning bootstrap will safely skip them and preserve HR edits.
* **Related APIs/dependencies:** API #101.
* **What the API gives/does:** Returns the status of the bootstrap operation.

---

### API 101: List Tax Regimes
* **API Name:** List Tax Regimes
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/tax/regimes`
* **Purpose:** List tax regimes available for a financial year.
* **Business problem solved:** Displays available tax regimes and their configurations for HR to review.
* **Why the API exists:** Required for the UI to display the tax settings dashboard.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR views the Old and New tax regimes configured for the current year to ensure standard deductions are accurate.
* **Request structure and parameters:** `financial_year` (Query, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Fetches the regimes and joins to count their active slabs.
* **Database impact:** Read-only.
* **Validation rules:** Query params controller-validated.
* **Success response structure:** `{ "success": true, "data": [ ...regimes ] }`
* **Response field meanings:** Each regime (`old`/`new`) with `standard_deduction`, `allows_chapter_via`, `allows_hra_exemption`, `chapter_via_limits`, rebate/surcharge config, `is_default`, and its slab count.
* **Failure/error scenarios:** None.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read operation.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** None.
* **Related APIs/dependencies:** API #102.
* **What the API gives/does:** An array of regime objects.

---

### API 102: Update a Tax Regime
* **API Name:** Update a Tax Regime
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/tax/regimes/:id`
* **Purpose:** Edit a regime's rates, caps, and defaulting logic.
* **Business problem solved:** Allows HR to tweak tax laws (like 87A rebate limits) mid-year if emergency government budgets are passed.
* **Why the API exists:** Provides complete control over the tax engine's parameters.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** Government announces an increase in the 87A rebate from 25k to 30k. HR updates the New Regime record.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** Accepts fields to update: `name`, `standard_deduction`, `allows_chapter_via`, `allows_hra_exemption`, `chapter_via_limits` (Object map), `rebate_87a_income_limit`, `rebate_87a_max_amount`, `surcharge_slabs` (Array of objects), `is_default`, `is_active`.
* **Backend processing flow:** Partially updates the tax regime. If `is_default` is set to true, it atomically clears the default flag from sibling regimes in the same transaction.
* **Database impact:** Updates the `tax_regimes` row.
* **Validation rules:** Identity (`code`, `financial_year`) is not patchable. `chapter_via_limits` and `surcharge_slabs` replace wholesale.
* **Success response structure:** `{ "success": true, "data": { ...updatedRegime } }`
* **Response field meanings:** The updated tax regime object.
* **Failure/error scenarios:** Regime not found.
* **HTTP status codes and error codes:** `200 OK`, `404 REGIME_NOT_FOUND`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent update.
* **Transactions and concurrency behavior:** Setting `is_default` runs under a transaction to ensure exactly one default regime exists for the FY.
* **Side effects:** Alters tax liability projections for employees associated with this regime.
* **Important edge cases:** None.
* **Related APIs/dependencies:** API #103.
* **What the API gives/does:** Returns the updated tax regime.

---

### API 103: Get a Regime's Slabs
* **API Name:** Get a Regime's Slabs
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/tax/regimes/:id/slabs`
* **Purpose:** List the tax slabs for a specific regime.
* **Business problem solved:** Gives visibility into the granular tax bracket percentages.
* **Why the API exists:** Required for the UI to display and edit age-band specific tax slabs.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR views the tax slabs for the Old Regime to verify the 60+ (Senior Citizen) brackets.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Fetches all tax slabs associated with the regime, grouping them by `age_band` (`below_60`, `60_to_79`, `80_plus`).
* **Database impact:** Read-only.
* **Validation rules:** Validates UUID path param.
* **Success response structure:** `{ "success": true, "data": [ ...slabs ] }`
* **Response field meanings:** Array of tax slabs.
* **Failure/error scenarios:** Regime not found.
* **HTTP status codes and error codes:** `200 OK`, `404 REGIME_NOT_FOUND`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** None.
* **Related APIs/dependencies:** API #104.
* **What the API gives/does:** An array of tax slabs.

---

### API 104: Replace a Regime's Slabs
* **API Name:** Replace a Regime's Slabs
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/tax/regimes/:id/slabs`
* **Purpose:** Atomically replace a tax regime's slabs.
* **Business problem solved:** Ensures income tax bracket updates are atomic, contiguous, and error-free.
* **Why the API exists:** Permits HR to rebuild tax brackets during new budget announcements.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** The government alters the 5% tax bracket cap from 5L to 7L in the New Regime. HR updates the slabs.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** `slabs` (Array of objects: `age_band`, `from_amount`, `to_amount`, `rate_percent`, `display_order`).
* **Backend processing flow:** Soft deletes existing slabs for the age bands touched and inserts the new ones. Validates contiguity.
* **Database impact:** Deletes and inserts rows into `tax_slabs`.
* **Validation rules:** Half-open `[from, to)`; the service validates contiguity per `(regime, age_band)` to ensure no gaps or overlaps exist.
* **Success response structure:** `{ "success": true, "data": [ ...insertedSlabs ] }`
* **Response field meanings:** The newly active slab array.
* **Failure/error scenarios:** Invalid ranges (gap or overlap).
* **HTTP status codes and error codes:** `422 TAX_SLAB_RANGE_INVALID`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Highly idempotent.
* **Transactions and concurrency behavior:** Runs inside a single database transaction.
* **Side effects:** Changes exact tax amounts deducted in upcoming payroll runs.
* **Important edge cases:** Omitting an `age_band` from the payload leaves its existing slabs untouched; it only replaces the bands present in the payload.
* **Related APIs/dependencies:** API #103.
* **What the API gives/does:** Returns the newly inserted slab set.

---

### API 105: Declaration Verification Queue
* **API Name:** Declaration Verification Queue
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/tax/declarations`
* **Purpose:** Fetch the queue of employee investment declarations.
* **Business problem solved:** Provides HR a prioritized inbox of submitted tax declarations to review and approve.
* **Why the API exists:** Powers the HR declaration management dashboard.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** In February, HR filters the queue for `status = 'submitted'` to verify all pending employee proof attachments.
* **Request structure and parameters:** Query parameters: `financial_year`, `status`, `user_id`, `page`, `limit`.
* **Request payload and field meanings:** None.
* **Backend processing flow:** Returns paginated declaration headers. To maintain PAN secrecy, sensitive items like landlord PANs/rents do not surface in this list view.
* **Database impact:** Read-only against `tax_declarations` and users.
* **Validation rules:** Query constraints applied. Max limit 100.
* **Success response structure:** `{ "success": true, "data": { "docs": [...headers], "total": 45, "page": 1, ... } }`
* **Response field meanings:** Paginated headers showing status and timestamps.
* **Failure/error scenarios:** Invalid pagination parameters.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Protects sensitive PII by omitting child items from the list payload.
* **Related APIs/dependencies:** API #106.
* **What the API gives/does:** An array of declaration headers for the verification queue.

---

### API 106: Get a Declaration
* **API Name:** Get a Declaration
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/tax/declarations/:id`
* **Purpose:** Get a detailed investment declaration.
* **Business problem solved:** Exposes the full detail of an employee's tax-saving claims for HR audit.
* **Why the API exists:** Required for HR to review individual proofs and amounts.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR clicks on an employee's submitted declaration to verify their 80C LIC premium receipts.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Fetches the declaration header along with all its specific declared items and the employee's current tax regime.
* **Database impact:** Read-only.
* **Validation rules:** UUID check.
* **Success response structure:** `{ "success": true, "data": { ...declaration, "items": [...] } }`
* **Response field meanings:** Detailed declaration record including all line items, proof references, and amounts.
* **Failure/error scenarios:** Declaration missing.
* **HTTP status codes and error codes:** `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_NOT_VERIFIABLE` (must be in submitted or under_review status), `422 REJECTION_REASON_REQUIRED`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** None.
* **Related APIs/dependencies:** API #107.
* **What the API gives/does:** Detailed declaration record including all line items.

---

### API 107: Verify a Declaration
* **API Name:** Verify a Declaration
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/tax/declarations/:id/verify`
* **Purpose:** HR verification of an employee's investment declaration.
* **Business problem solved:** Legally records HR's acceptance or reduction of an employee's tax claims based on submitted proofs.
* **Why the API exists:** Executes the core compliance workflow for Indian payroll taxes.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** An employee claims 1.5L in 80C, but attaches receipts for only 1L. HR verifies the item at 1L and writes a remark.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** 
  `items` (Array): `{ item_id, verified_amount, proof_status, proof_reference, verifier_remarks }`
  `remarks` (String, Optional)
* **Backend processing flow:** Applies verification decisions item-by-item. If a proof is rejected, the amount is coerced to zero. Changes the declaration header status to `verified` if all items are verified, otherwise `partially_verified`.
* **Database impact:** Updates `tax_declaration_items` and `tax_declarations`.
* **Validation rules:** `verified_amount` cannot exceed `declared_amount`. `proof_status` must be valid enum.
* **Success response structure:** `{ "success": true, "data": { ...declaration } }`
* **Response field meanings:** The verified declaration.
* **Failure/error scenarios:** Verifying an amount greater than declared.
* **HTTP status codes and error codes:** `422 VERIFIED_EXCEEDS_DECLARED`, `404 DECLARATION_NOT_FOUND`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Highly idempotent based on item payload.
* **Transactions and concurrency behavior:** Uses an advisory lock to prevent race conditions while verifying items.
* **Side effects:** Modifies the employee's tax liability for the rest of the year.
* **Important edge cases:** Coerces rejected items to exactly `0` verified amount.
* **Related APIs/dependencies:** API #106.
* **What the API gives/does:** Returns the verified declaration.

---

### API 108: Reject a Declaration
* **API Name:** Reject a Declaration
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/tax/declarations/:id/reject`
* **Purpose:** Reject a declaration entirely.
* **Business problem solved:** Bulk dismisses fraudulent or completely invalid submissions.
* **Why the API exists:** Expedites rejection when an employee uploads dummy data.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** Employee uploads a selfie instead of rent receipts. HR rejects the entire declaration with a reason.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** `{ "rejection_reason": "string" }`
* **Backend processing flow:** Sets the declaration header to `rejected`. Automatically updates every line item to `verified_amount = 0` and `proof_status = 'rejected'`. 
* **Database impact:** Updates header and all items.
* **Validation rules:** `rejection_reason` is mandatory.
* **Success response structure:** `{ "success": true, "data": { ...declaration } }`
* **Response field meanings:** The rejected declaration.
* **Failure/error scenarios:** Declaration not found.
* **HTTP status codes and error codes:** `404 DECLARATION_NOT_FOUND`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent.
* **Transactions and concurrency behavior:** Protected by the same advisory lock as verify.
* **Side effects:** Wipes all projected tax savings for the employee, triggering higher TDS.
* **Important edge cases:** None.
* **Related APIs/dependencies:** API #109.
* **What the API gives/does:** Returns the rejected declaration.

---

### API 109: Reopen a Declaration
* **API Name:** Reopen a Declaration
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/tax/declarations/:id/reopen`
* **Purpose:** Reopen a submitted or verified declaration for editing.
* **Business problem solved:** Allows employees to correct mistakes or add late proofs after submission.
* **Why the API exists:** Unlocks the employee's self-service capabilities temporarily.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** An employee forgot to attach one receipt. HR reopens the declaration for them.
* **Request structure and parameters:** `id` (Path, UUID).
* **Request payload and field meanings:** `{ "reason": "string" }`
* **Backend processing flow:** Returns the declaration to `draft` status. Preserves `submitted_at` and `proof_deadline` (EC-43) so the declaration stays visible to the tax engine. Increments `reopened_count`.
* **Database impact:** Updates header status to `draft`.
* **Validation rules:** `reason` is mandatory and audited.
* **Success response structure:** `{ "success": true, "data": { ...declaration } }`
* **Response field meanings:** The reopened declaration.
* **Failure/error scenarios:** Declaration not found.
* **HTTP status codes and error codes:** `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_ALREADY_DRAFT`, `422 REOPEN_REASON_REQUIRED`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent.
* **Transactions and concurrency behavior:** None.
* **Side effects:** Permits employee to call `PUT /me/tax/declarations` again. Existing verified figures survive the reopen.
* **Important edge cases:** Preserving `submitted_at` ensures the employee continues to receive the tax benefit of already-verified items while editing.
* **Related APIs/dependencies:** API #123.
* **What the API gives/does:** Returns the reopened declaration.

---

### API 110: Employee Tax Summary (HR)
* **API Name:** Employee Tax Summary (HR)
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/summary`
* **Purpose:** View an employee's tax summary for a financial year.
* **Business problem solved:** Provides a high-level snapshot of an employee's tax situation.
* **Why the API exists:** Powers the HR-facing employee tax dashboard.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR looks up John Doe's tax summary to see if he opted for the Old Regime and how much TDS has been collected.
* **Request structure and parameters:** `userId` (Path, UUID); `financial_year` (Query, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Fetches the employee's chosen regime, previous employer figures, YTD actuals (derived dynamically from the calculation engine's approved runs), declaration status, and finalization state.
* **Database impact:** Read-only aggregations.
* **Validation rules:** Standard path/query constraints.
* **Success response structure:** `{ "success": true, "data": { ...summary } }`
* **Response field meanings:** Detailed tax overview payload including regime and aggregated YTD collections.
* **Failure/error scenarios:** User not found.
* **HTTP status codes and error codes:** `200 OK`, `404 Not Found`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** YTD figures accurately reflect only approved and paid runs.
* **Related APIs/dependencies:** API #113.
* **What the API gives/does:** Detailed tax overview payload.

---

### API 111: Override Employee Regime
* **API Name:** Override Employee Regime
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/regime`
* **Purpose:** HR forcibly overrides an employee's tax regime.
* **Business problem solved:** Sometimes employees are unable to change their regime via self-service, or HR policy dictates a manual switch.
* **Why the API exists:** Administrative override capability.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR switches a new joiner to the Old Regime as per their offline request.
* **Request structure and parameters:** `userId` (Path, UUID); query params: `financial_year` (`YYYY-YY`, Optional, defaults to current FY).
* **Request payload and field meanings:** `{ "regime_code": "old" | "new" }`
* **Backend processing flow:** Sets the employee's regime with `regime_source = 'hr'`. Blocked once the financial year is finalized.
* **Database impact:** Updates or inserts the employee's `tax_summaries` record.
* **Validation rules:** Must be a valid regime code.
* **Success response structure:** `{ "success": true, "data": { ...regime } }`
* **Response field meanings:** The updated regime setting.
* **Failure/error scenarios:** Trying to edit a finalized year, employee not found, or regime unavailable.
* **HTTP status codes and error codes:** `404 EMPLOYEE_NOT_FOUND`, `409 FINANCIAL_YEAR_FINALIZED`, `422 TAX_REGIME_UNAVAILABLE`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent.
* **Transactions and concurrency behavior:** None.
* **Side effects:** Drastically alters the employee's tax projection on the next run.
* **Important edge cases:** HR can override this even if `allow_employee_regime_switch` is set to false in org settings.
* **Related APIs/dependencies:** API #125.
* **What the API gives/does:** The updated regime setting.

---

### API 112: Set Previous-Employer Figures
* **API Name:** Set Previous-Employer Figures
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/previous-employer`
* **Purpose:** Update Form 12B previous-employer financial figures.
* **Business problem solved:** Integrates external income so that the tax engine projects liability on total-year income rather than just internal income.
* **Why the API exists:** Regulatory requirement for mid-year joiners.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** A new joiner submits their Form 12B indicating they earned 6L and paid 30k TDS at their last company. HR inputs these figures.
* **Request structure and parameters:** `userId` (Path, UUID); query params: `financial_year` (`YYYY-YY`, Optional, defaults to current FY).
* **Request payload and field meanings:** Optional money fields: `previous_employer_gross`, `previous_employer_taxable`, `previous_employer_tds`, `previous_employer_pf`, `previous_employer_pt`.
* **Backend processing flow:** Records income and tax deducted by previous employers. Unspecified fields default to zero. Blocked once the financial year is finalized.
* **Database impact:** Updates the employee's `tax_summaries` record.
* **Validation rules:** Validates money format.
* **Success response structure:** `{ "success": true, "data": { ...figures } }`
* **Response field meanings:** The updated previous-employer record.
* **Failure/error scenarios:** Editing a locked year, or employee not found.
* **HTTP status codes and error codes:** `404 EMPLOYEE_NOT_FOUND`, `409 FINANCIAL_YEAR_FINALIZED`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent.
* **Transactions and concurrency behavior:** None.
* **Side effects:** Increases projected annual income and directly influences monthly TDS calculations.
* **Important edge cases:** Missing fields are implicitly coerced to 0 to prevent stale data retention.
* **Related APIs/dependencies:** Feeds into API #113 projections.
* **What the API gives/does:** The updated previous-employer record.

---

### API 113: Employee Tax Projection (HR)
* **API Name:** Employee Tax Projection (HR)
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/projection`
* **Purpose:** Trace and debug an employee's tax projection.
* **Business problem solved:** Provides absolute transparency into the "black box" of tax calculations.
* **Why the API exists:** Answers the #1 payroll support question: "Why is my TDS this number?"
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** An employee complains their TDS spiked in March. HR runs the projection to see exactly how the engine calculated the liability.
* **Request structure and parameters:** `userId` (Path, UUID); query params: `financial_year`, `as_of_period`.
* **Request payload and field meanings:** None.
* **Backend processing flow:** Computes and returns the full calculation trace detailing how TDS and tax liabilities are generated. 
* **Database impact:** **Persists nothing** — a pure on-the-fly computation.
* **Validation rules:** Standard query validation.
* **Success response structure:** `{ "success": true, "data": { ...trace } }`
* **Response field meanings:** Deep calculation trace payload showing exemptions, chapter VI-A deductions, rebate applications, and slab breakdowns.
* **Failure/error scenarios:** Employee not found, invalid financial year, or period outside financial year.
* **HTTP status codes and error codes:** `200 OK`, `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`, `422 PERIOD_OUTSIDE_FINANCIAL_YEAR`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe, read-only simulation.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Shows side-by-side comparison of Old vs New regime efficiency if requested.
* **Related APIs/dependencies:** Matches API #120.
* **What the API gives/does:** A deep calculation trace payload.

---

### API 114: Form 16 Part-B Dataset (HR)
* **API Name:** Form 16 Part-B Dataset (HR)
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear`
* **Purpose:** Fetch the dataset for Form 16 Part-B annexure generation.
* **Business problem solved:** Compiles all tax, income, and exemption data for year-end compliance reporting.
* **Why the API exists:** Required for issuing statutory Form 16s to employees.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR previews a provisional Form 16 for an exiting employee before the FY is officially finalized.
* **Request structure and parameters:** `userId` (Path, UUID), `financialYear` (Path, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Returns the finalized `form16_snapshot` if the FY is finalized. Otherwise, returns a provisional assembly dynamically generated and marked `is_provisional: true`.
* **Database impact:** Read-only aggregation.
* **Validation rules:** FY format validation.
* **Success response structure:** `{ "success": true, "data": { "is_provisional": true/false, ...dataset } }`
* **Response field meanings:** Form 16 Part-B data structure.
* **Failure/error scenarios:** Employee not found, or invalid financial year format.
* **HTTP status codes and error codes:** `200 OK`, `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Provisional data is heavily marked to prevent legal accidental issuance.
* **Related APIs/dependencies:** API #116 finalizes this payload.
* **What the API gives/does:** Form 16 Part-B data structure.

---

### API 115: Set Form 16 Part-A Reference
* **API Name:** Set Form 16 Part-A Reference
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/part-a`
* **Purpose:** Record the acknowledgment for Form 16 Part-A from the TRACES portal.
* **Business problem solved:** Links the government-generated Part-A with the internal system without storing massive files.
* **Why the API exists:** Compliance tracking.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** HR uploads the TRACES CSV and scripts an API call to record the ACK numbers for all employees.
* **Request structure and parameters:** `userId` (Path, UUID), `financialYear` (Path, `YYYY-YY`).
* **Request payload and field meanings:** `{ "ack_number": "...", "issued_on": "YYYY-MM-DD", "reference_url": "..." }`
* **Backend processing flow:** Records the Part-A reference acknowledgment metadata. Does not store a file natively.
* **Database impact:** Updates the Form 16 tracking record.
* **Validation rules:** Required fields string validation.
* **Success response structure:** `{ "success": true, "data": { ...metadata } }`
* **Response field meanings:** Updated reference tracking metadata.
* **Failure/error scenarios:** Employee not found, missing ack_number, or invalid URL format.
* **HTTP status codes and error codes:** `200 OK`, `404 EMPLOYEE_NOT_FOUND`, `422 FORM16_PART_A_ACK_REQUIRED`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Idempotent update.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** None.
* **Related APIs/dependencies:** None.
* **What the API gives/does:** Updated reference tracking metadata.

---

### API 116: Finalize One Employee's FY
* **API Name:** Finalize One Employee's FY
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/employees/:userId/tax/financial-years/:financialYear/finalize`
* **Purpose:** Finalize tax records for a single employee.
* **Business problem solved:** Locks down historical tax data so it can never be altered retrospectively, guaranteeing audit integrity.
* **Why the API exists:** Required before issuing an official Form 16.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** An employee resigns in October. HR finalizes their individual tax year to issue their exit Form 16.
* **Request structure and parameters:** `userId` (Path, UUID), `financialYear` (Path, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Freezes the Form 16 snapshot, locking it permanently. Secured under a per-employee advisory lock (`payroll:tax:{userId}:{fy}`).
* **Database impact:** Serializes the Form 16 snapshot to JSONB and sets `is_finalized = true`.
* **Validation rules:** Ensures no pending declaration items exist.
* **Success response structure:** `{ "success": true, "message": "FY finalized", "data": {...} }`
* **Response field meanings:** The finalized tax record.
* **Failure/error scenarios:** Employee not found, no closed payroll in the FY, missing tax tables, or reconciliation assertion fails.
* **HTTP status codes and error codes:** `200 OK` (returns `already_finalized: true` if previously finalized), `404 EMPLOYEE_NOT_FOUND`, `422 INVALID_FINANCIAL_YEAR`, `422 NO_PAYROLL_IN_FINANCIAL_YEAR`, `422 TAX_TABLES_MISSING`, `422 FORM16_RECONCILIATION_FAILED`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Highly idempotent.
* **Transactions and concurrency behavior:** Protected by advisory locks to prevent race conditions during the heavy aggregation step.
* **Side effects:** Locks the FY. Subsequent regime edits or Form 12B updates will fail with `409 FINANCIAL_YEAR_FINALIZED`.
* **Important edge cases:** Automatically makes the Form 16 accessible to the employee on the self-service portal.
* **Related APIs/dependencies:** Enables API #126.
* **What the API gives/does:** The finalized tax record.

---

### API 117: Finalize FY Org-Wide
* **API Name:** Finalize FY Org-Wide
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/hr/tax/financial-years/:financialYear/finalize`
* **Purpose:** Bulk finalize tax records organization-wide.
* **Business problem solved:** Streamlines year-end closure operations for the entire company.
* **Why the API exists:** UX efficiency for end-of-year operations.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** April 15th, HR triggers the organization-wide FY close batch job.
* **Request structure and parameters:** `financialYear` (Path, `YYYY-YY`).
* **Request payload and field meanings:** `{ "acknowledge_missing_months": false, "reason": "string" }`
* **Backend processing flow:** Batches finalization across all eligible employees in the org. If gaps exist in the FY (e.g. unpaid months), it requires `acknowledge_missing_months` and a `reason` to proceed.
* **Database impact:** Mass updates across all eligible employee summaries.
* **Validation rules:** Requires reason if acknowledging gaps.
* **Success response structure:** `{ "success": true, "data": { "successful": 450, "failed": 2, "errors": [...] } }`
* **Response field meanings:** Summary of successful and failed finalizations (e.g. failing due to unverified declarations).
* **Failure/error scenarios:** Aborts if missing months are detected without the acknowledgment flag and justification reason, or if tax tables are missing.
* **HTTP status codes and error codes:** `200 OK`, `409 FINANCIAL_YEAR_INCOMPLETE`, `422 ACKNOWLEDGE_REASON_REQUIRED`, `422 TAX_TABLES_MISSING`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Resumable and per-employee error-isolated. Repeating it will just finalize those missed in the previous run.
* **Transactions and concurrency behavior:** Operates in chunks/batches internally.
* **Side effects:** Mass-publishes Form 16s.
* **Important edge cases:** One failing employee does not abort the entire batch.
* **Related APIs/dependencies:** API #116 (internally looped).
* **What the API gives/does:** Summary of successful and failed finalizations.

---

### API 118: Statutory Summary (Challan View)
* **API Name:** Statutory Summary (Challan View)
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/hr/tax/financial-years/:financialYear/statutory-summary`
* **Purpose:** Retrieve the organization-wide statutory challan summary.
* **Business problem solved:** Replaces manual excel aggregations required for filing government remittances.
* **Why the API exists:** Vital for the finance team to pay EPF, ESI, and TDS monthly.
* **Who / roles are allowed:** `hr` only.
* **Real-world usage scenario:** Finance exports the March TDS aggregate to file the monthly challan.
* **Request structure and parameters:** `financialYear` (Path, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Aggregates month-by-month PF, ESI, PT, and TDS alongside headcount figures using **only approved/paid items**.
* **Database impact:** Heavy read-only aggregation.
* **Validation rules:** Standard FY param validation.
* **Success response structure:** `{ "success": true, "data": { "months": [...] } }`
* **Response field meanings:** Comprehensive statutory aggregation payload broken down by month.
* **Failure/error scenarios:** None.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** `hr` role + `payroll.access`.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Draft or unapproved runs are strictly excluded from these aggregations to prevent false reporting.
* **Related APIs/dependencies:** None.
* **What the API gives/does:** Comprehensive statutory aggregation payload.

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`
*Auth stack:* `authenticate` → `requireFeature('payroll.access')`. No `authorize()` wrapper; these APIs always execute against the authenticated user token (`req.user.id`).

### API 119: My Tax Summary
* **API Name:** My Tax Summary
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/tax/summary`
* **Purpose:** Employee views their own tax summary.
* **Business problem solved:** Provides employees transparency into their current YTD tax status.
* **Why the API exists:** Prevents HR helpdesk spam.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** An employee checks their dashboard to see if their latest rent receipts have been approved by HR.
* **Request structure and parameters:** `financial_year` (Query, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Displays the employee's tax regime, YTD aggregated TDS/PF/ESI/PT, projected liability, and declaration statuses.
* **Database impact:** Read-only.
* **Validation rules:** Validates FY query param.
* **Success response structure:** `{ "success": true, "data": { ...summary } }`
* **Response field meanings:** Tax overview payload tailored for the employee.
* **Failure/error scenarios:** None.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** Self-scoped exclusively. Impossible to read another employee's summary.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** None.
* **Related APIs/dependencies:** None.
* **What the API gives/does:** Tax overview payload.

---

### API 120: My Tax Projection
* **API Name:** My Tax Projection
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/tax/projection`
* **Purpose:** Employee views their own tax projection trace.
* **Business problem solved:** Demystifies TDS calculations for the employee.
* **Why the API exists:** Empowers employees to understand their deductions independently.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee views the projection to decide if switching to the New Regime will save them money.
* **Request structure and parameters:** `financial_year` (Query, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Similar to API #113, gives the employee full visibility into how their current tax liabilities are calculated.
* **Database impact:** Pure compute; read-only.
* **Validation rules:** Validates FY query param.
* **Success response structure:** `{ "success": true, "data": { ...trace } }`
* **Response field meanings:** Complete, deep calculation trace.
* **Failure/error scenarios:** None.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Evaluates 'what-if' scenarios cleanly.
* **Related APIs/dependencies:** Matches API #113.
* **What the API gives/does:** Complete, deep calculation trace.

---

### API 121: My Monthly Tax Breakup
* **API Name:** My Monthly Tax Breakup
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/tax/monthly`
* **Purpose:** Employee views their monthly tax statement data.
* **Business problem solved:** Provides a ledger of exact withholdings over the year.
* **Why the API exists:** Required for employees filing preliminary returns.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee exports their month-by-month TDS breakdown.
* **Request structure and parameters:** `financial_year` (Query, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Month-by-month breakdown of taxes (TDS, PF, ESI, PT) collected over the fiscal year based strictly on approved payroll runs.
* **Database impact:** Read-only aggregation.
* **Validation rules:** Validates FY query param.
* **Success response structure:** `{ "success": true, "data": [ ...months ] }`
* **Response field meanings:** Array of monthly statutory deductions.
* **Failure/error scenarios:** None.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Omits pending/draft runs to avoid confusion.
* **Related APIs/dependencies:** None.
* **What the API gives/does:** Array of monthly statutory deductions.

---

### API 122: My Declaration
* **API Name:** My Declaration
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/tax/declarations`
* **Purpose:** Employee fetches their own investment declaration.
* **Business problem solved:** Serves the frontend declaration form.
* **Why the API exists:** Employees need to see their draft or submitted claims.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee opens the Tax Planner portal to continue filling out their 80C draft.
* **Request structure and parameters:** `financial_year` (Query, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Returns the investment declaration draft or submitted copy, specific items, proof deadlines, and the status of the declaration window.
* **Database impact:** Read-only.
* **Validation rules:** Validates FY query param.
* **Success response structure:** `{ "success": true, "data": { ...declaration } }`
* **Response field meanings:** Declaration items and state.
* **Failure/error scenarios:** None.
* **HTTP status codes and error codes:** `200 OK`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Surfaces the frozen `proof_deadline` clearly to the UI.
* **Related APIs/dependencies:** API #123.
* **What the API gives/does:** Declaration items and state.

---

### API 123: Upsert My Declaration
* **API Name:** Upsert My Declaration
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/me/tax/declarations`
* **Purpose:** Employee creates or updates their investment declaration items.
* **Business problem solved:** Captures self-declared tax exemptions (like Rent, LIC, PPF) to lower TDS liability.
* **Why the API exists:** Core employee compliance interface.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee claims 24,000 INR as annual rent paid.
* **Request structure and parameters:** Query parameters: `financial_year` (`YYYY-YY`, Optional, defaults to current FY).
* **Request payload and field meanings:** 
  `items`: Array of items. Max 150 items.
  `{ "section": "HRA", "declared_amount": 24000, "metadata": { "rent_paid_annual": 24000 } }`
* **Backend processing flow:** A wholesale replace-set operation. Validates while in `draft` state and within the submission window. Prevents editing auto-synchronized items like EPF (`sub_category: 'EPF_AUTO'`). Preserves existing verifications on unchanged items.
* **Database impact:** Deletes old items and inserts new items.
* **Validation rules:** Array maximum constraint applied (max 150 items) to prevent DoS. `metadata` is sanitized but flexible.
* **Success response structure:** `{ "success": true, "data": { ...updatedDeclaration } }`
* **Response field meanings:** The updated declaration.
* **Failure/error scenarios:** Editing outside the open window, while submitted, or attempting to write reserved EPF_AUTO sub_category.
* **HTTP status codes and error codes:** `409 DECLARATION_NOT_DRAFT`, `422 DECLARATION_WINDOW_CLOSED`, `422 RESERVED_DECLARATION_SUB_CATEGORY`, `422 INVALID_DECLARATION_ITEM`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Idempotent (replace-set).
* **Transactions and concurrency behavior:** Handled atomically.
* **Side effects:** Projects higher take-home pay if declarations are high.
* **Important edge cases:** EPF is auto-computed and strictly blocked from manual overwrites here.
* **Related APIs/dependencies:** API #124.
* **What the API gives/does:** The updated declaration.

---

### API 124: Submit My Declaration
* **API Name:** Submit My Declaration
* **HTTP Method:** `POST`
* **Endpoint:** `/api/v1/payroll/me/tax/declarations/submit`
* **Purpose:** Employee submits their declaration for HR review.
* **Business problem solved:** Hands off the draft record to the HR verification queue.
* **Why the API exists:** Necessary state transition to enforce proof deadlines.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee clicks "Submit to HR" after uploading all receipts.
* **Request structure and parameters:** Query parameters: `financial_year` (`YYYY-YY`, Optional, defaults to current FY).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Transitions the declaration from `draft` to `submitted`. Freezes the `proof_deadline` upon the first submission.
* **Database impact:** Updates header status.
* **Validation rules:** Must be in draft state.
* **Success response structure:** `{ "success": true, "data": { ...declaration } }`
* **Response field meanings:** The submitted declaration.
* **Failure/error scenarios:** Calling while not in draft state, or declaration not found.
* **HTTP status codes and error codes:** `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_NOT_DRAFT`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Idempotent (409 on repeat).
* **Transactions and concurrency behavior:** None.
* **Side effects:** Moves the declaration to HR's dashboard.
* **Important edge cases:** Locks the `proof_deadline` permanently.
* **Related APIs/dependencies:** API #105.
* **What the API gives/does:** The submitted declaration.

---

### API 125: Switch My Regime
* **API Name:** Switch My Regime
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/me/tax/regime`
* **Purpose:** Employee chooses between old/new tax regimes.
* **Business problem solved:** Enables self-service tax optimization for the employee.
* **Why the API exists:** Legal requirement to allow regime choice.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** An employee calculates New Regime is better for them and opts in via the UI.
* **Request structure and parameters:** Query parameters: `financial_year` (`YYYY-YY`, Optional, defaults to current FY).
* **Request payload and field meanings:** `{ "regime_code": "old" | "new" }`
* **Backend processing flow:** Sets the tax regime. Denied if `allow_employee_regime_switch` is disabled by the organization, or if the FY is finalized.
* **Database impact:** Updates the employee's `tax_summaries` record.
* **Validation rules:** Validates enum and org settings.
* **Success response structure:** `{ "success": true, "data": { ...regime } }`
* **Response field meanings:** The selected regime context.
* **Failure/error scenarios:** Switch blocked by HR settings, FY finalization, or unavailable regime.
* **HTTP status codes and error codes:** `403 REGIME_SWITCH_NOT_ALLOWED`, `409 FINANCIAL_YEAR_FINALIZED`, `422 TAX_REGIME_UNAVAILABLE`, `422 INVALID_FINANCIAL_YEAR`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Idempotent.
* **Transactions and concurrency behavior:** None.
* **Side effects:** Immediately alters their tax projection.
* **Important edge cases:** If `allow_employee_regime_switch` is turned off, this route returns 403, funneling them to HR to do it manually.
* **Related APIs/dependencies:** API #111.
* **What the API gives/does:** The selected regime context.

---

### API 126: My Form 16
* **API Name:** My Form 16
* **HTTP Method:** `GET`
* **Endpoint:** `/api/v1/payroll/me/tax/form16/:financialYear`
* **Purpose:** Employee downloads their Form 16 dataset.
* **Business problem solved:** Distributes statutory tax certificates securely.
* **Why the API exists:** Fulfills employer's legal obligation to provide Form 16.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee logs in during July to download their Form 16 for filing their personal IT returns.
* **Request structure and parameters:** `financialYear` (Path, `YYYY-YY`).
* **Request payload and field meanings:** None.
* **Backend processing flow:** Exposes the Part-B Form 16 data to the employee. It will return a 404 until the FY is fully finalized by HR.
* **Database impact:** Read-only.
* **Validation rules:** Standard FY param validation.
* **Success response structure:** `{ "success": true, "data": { ...dataset } }`
* **Response field meanings:** The Form 16 data payload.
* **Failure/error scenarios:** FY not finalized yet by HR.
* **HTTP status codes and error codes:** `404 FORM16_NOT_FINALIZED`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Safe read.
* **Transactions and concurrency behavior:** None.
* **Side effects:** None.
* **Important edge cases:** Employees can NEVER see provisional Form 16 data; only finalized data is exposed to them.
* **Related APIs/dependencies:** Dependent on API #116/#117.
* **What the API gives/does:** The Form 16 data payload.

---

### API 127: Record My Declaration Proofs
* **API Name:** Record My Declaration Proofs
* **HTTP Method:** `PUT`
* **Endpoint:** `/api/v1/payroll/me/tax/declarations/proofs`
* **Purpose:** Employee uploads proofs against submitted declaration items.
* **Business problem solved:** Allows staggered proof submission (e.g. attaching receipts as they are received) without reopening the whole declaration form.
* **Why the API exists:** Quality of life feature for employees managing proofs over months.
* **Who / roles are allowed:** Any authenticated employee.
* **Real-world usage scenario:** Employee finally receives their life insurance receipt in March and attaches it to their already-submitted declaration.
* **Request structure and parameters:** Query parameters: `financial_year` (`YYYY-YY`, Optional, defaults to current FY).
* **Request payload and field meanings:** `{ "items": [{ "item_id": "uuid", "proof_reference": "string" }] }`
* **Backend processing flow:** Records proof references for specific items and transitions their status to `submitted`. Executed without reopening the entire declaration. Allowed while status is `submitted` or `under_review`, provided the item is not `rejected`. Cannot touch `declared_amount`.
* **Database impact:** Updates specific `tax_declaration_items`.
* **Validation rules:** Cannot modify amounts, only `proof_reference`.
* **Success response structure:** `{ "success": true, "data": { ...updatedItems } }`
* **Response field meanings:** Updates specific proof references in the declaration.
* **Failure/error scenarios:** Declaration not found, not in submitted/under_review status, or item does not belong to declaration.
* **HTTP status codes and error codes:** `404 DECLARATION_NOT_FOUND`, `409 DECLARATION_NOT_SUBMITTED`, `403 DECLARATION_ITEM_FORBIDDEN`, `422 INVALID_DECLARATION_ITEM`.
* **Security / authorization behavior:** Self-scoped exclusively.
* **Idempotency and retry behavior:** Idempotent.
* **Transactions and concurrency behavior:** Executed atomically.
* **Side effects:** Modifies the `proof_status` of the item, alerting HR to review it.
* **Important edge cases:** Protects the integrity of amounts while permitting proof uploads.
* **Related APIs/dependencies:** API #123.
* **What the API gives/does:** Updates specific proof references in the declaration.
