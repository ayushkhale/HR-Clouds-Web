# Phase 1: Payroll Compensation Master & Salary Structures — Complete Frontend Integration Guide

This document provides the exhaustive, endpoint-by-endpoint integration specifications for Frontend Developers and DevOps/Support Engineers implementing the **Phase 1 Payroll** module.

> [!IMPORTANT]
> **Architectural Note:** Payroll is strictly a **tenant-plane** module. Platform roles (`admin`, `super-admin`) are deliberately locked out. An organizational `orgId` (derived from the token) and the `payroll.access` feature flag are mandatory for every single route. 
> 
> **Money & Dates Note:** All monetary values (`annual_ctc`, `value`) accept strings or numbers. Strings are preferred (e.g. `"1200000.00"`) as they prevent floating-point loss in transit. The backend always calculates and stores to the paise (minor unit). Dates are strictly `YYYY-MM-DD`.

---

## 1. HR Administration APIs — `/api/v1/payroll/hr`

### 1.1 Bootstrap Default Component Catalog
**What it is:** Seeds standard salary components (Basic, HRA, PF) for an organization.
**Why it exists:** Eliminates manual data entry for standard components when a new tenant onboards.
**Frontend/Support Workflow:** An HR Admin clicks "Load Default Components" during initial setup.
**Database Models Affected:** `SalaryComponents`, `PayrollAuditLogs`.
**Side Effects:** Idempotent. Safely skips components with codes that already exist.

**Endpoint:** `POST /api/v1/payroll/hr/components/bootstrap`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`
**Feature Required:** `payroll.access`

#### Request Body
*None*

#### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Default components bootstrapped",
  "data": { "created": ["BASIC", "HRA"], "skipped": ["PF"] }
}
```

#### Error Scenarios
- **403 Forbidden:** Lacks `hr` role or `payroll.access` feature.

---

### 1.2 Create a Salary Component
**What it is:** Defines a new custom earning, deduction, or reimbursement component.
**Why it exists:** Allows organizations to create proprietary allowances with custom tax rules and formulas.
**Frontend/Support Workflow:** HR fills out the "Create Component" form.
**Database Models Affected:** `SalaryComponents`.
**Side Effects:** None. Custom rows are strictly saved as `is_system = false`.

**Endpoint:** `POST /api/v1/payroll/hr/components`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

#### Request Body (JSON)
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `name` | String | Yes | Max 150 chars. |
| `code` | String | Yes | Unique, `^[A-Za-z0-9_]+$`. |
| `component_type` | Enum | Yes | `earning`, `deduction`, `employer_contribution`, `reimbursement`. |
| `calculation_type`| Enum | Yes | `flat`, `percent_of_basic`, `percent_of_gross`, `percent_of_ctc`, `balancing`. |
| `value` | Decimal | Optional| Default 0. |

**Example Request:**
```json
{
  "name": "Special Allowance",
  "code": "SPECIAL_ALLOWANCE",
  "component_type": "earning",
  "calculation_type": "balancing"
}
```

#### Success Response (201 Created)
Returns the created component UUID.

#### Error Scenarios
- **409 Conflict (COMPONENT_CODE_EXISTS):** A component with this code already exists in the org.

---

### 1.3 List Salary Components
**What it is:** Fetches the catalog of all components.
**Why it exists:** Populates dropdowns for building templates or overriding individual employee structures.
**Frontend/Support Workflow:** Renders the Data Table in the Settings > Components view.

**Endpoint:** `GET /api/v1/payroll/hr/components`
**Auth Required:** Yes (Token)
**Roles Required:** `hr`

#### Query Parameters
- `is_active` (Boolean): Filter by active status.
- `component_type` (Enum): Filter by earning/deduction etc.

> [!TIP]
> **Frontend Note (Express 5):** Express 5 strictly enforces read-only `req.query`. Ensure query strings exactly match the types defined in Swagger, as middleware no longer type-casts them implicitly.

#### Success Response (200 OK)
Returns an array of component objects.

---

### 1.4 Get, 1.5 Update, 1.6 Deactivate Component
**Endpoint:** `GET|PUT|DELETE /api/v1/payroll/hr/components/:id`
**What it is:** CRUD operations for components.
**Frontend Note:** Deleting a component NEVER hard-deletes it. It sets `is_active = false` (soft-delete). The API will reject (`409 COMPONENT_IN_USE`) the deactivation if any active template or approved employee structure depends on it. 
**For Updates (`PUT`):** `is_system = true` components cannot have their `code` or `calculation_type` changed (`409 SYSTEM_COMPONENT_IMMUTABLE`).

---

### 1.7 Create Structure Template
**What it is:** Creates an empty blueprint for a salary bracket (e.g., "Senior Dev").
**Endpoint:** `POST /api/v1/payroll/hr/structure-templates`
**Auth Required:** Yes (Token), `hr` role.

#### Request Body
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `name` | String | Yes | Human readable name. |
| `code` | String | Yes | Unique alphanumeric code. |

---

### 1.8 List, 1.9 Get, 1.10 Update, 1.11 Deactivate Templates
**Endpoint:** `GET|PUT|DELETE /api/v1/payroll/hr/structure-templates/:id`
**What it is:** Standard CRUD operations. 
**Frontend Note:** The `GET` endpoints eager-load all attached component lines instantly. You do not need to make secondary network requests to fetch the template's components.

---

### 1.12 Add Component to Template
**What it is:** Attaches a specific component rule to a template blueprint.
**Endpoint:** `POST /api/v1/payroll/hr/structure-templates/:id/components`
**Auth Required:** Yes, `hr` role.

#### Request Body
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `component_id` | UUID | Yes | The ID of the catalog component. |
| `value` | Decimal| Optional | Overrides the catalog value. |
| `calculation_type`| Enum| Optional | Overrides the catalog calculation. |

#### Error Scenarios
- **409 Conflict (TEMPLATE_COMPONENT_EXISTS):** This component is already attached to this template.

---

### 1.13 Update, 1.14 Remove Template Component
**Endpoint:** `PUT|DELETE /api/v1/payroll/hr/structure-templates/:id/components/:componentId`
**What it is:** Modifies or detaches an override line inside a template.

---

### 1.15 Preview Template Evaluation
**What it is:** A dry-run mathematical engine for a template.
**Why it exists:** Allows HR to test complex mathematical formulas (like nested percentages) before saving or assigning them.
**Side Effects:** Absolutely None. Persists zero data to the database.

**Endpoint:** `POST /api/v1/payroll/hr/structure-templates/:id/preview`
**Auth Required:** Yes, `hr` role.

#### Request Body
```json
{
  "annual_ctc": "1500000"
}
```

#### Success Response (200 OK)
Returns the fully reconciled mathematical breakdown.
```json
{
  "success": true,
  "data": {
    "annual_ctc": "1500000",
    "annual_gross": "1500000",
    "monthly_gross": "125000",
    "reconciled": true,
    "lines": [...]
  }
}
```

#### Error Scenarios (The Evaluator Guards)
- **422 Unprocessable Entity:** Returns highly specific mathematical errors: `NO_BASIC_COMPONENT`, `INVALID_PERCENTAGE`, `CTC_BELOW_FIXED_COMPONENTS` (if fixed deductions push the balance negative), or `CTC_RECONCILIATION_FAILED`.

---

### 1.16 Assign / Revise Employee Salary Structure
**What it is:** The critical transaction that binds a mathematical structure to an employee.
**Why it exists:** This is the Maker step of the D-13 Maker-Checker workflow.
**Side Effects:** Acquires a strict DB advisory lock. Always inserts the row as `proposed` initially. If the caller has global authority and separate-checker is OFF, it instantly promotes to `approved`.

**Endpoint:** `POST /api/v1/payroll/hr/employees/:userId/salary-structures`

#### Request Body
| Field | Type | Required | Validation / Constraints |
|-------|------|----------|--------------------------|
| `annual_ctc` | String | Yes | Must be a positive decimal. |
| `effective_from` | String | Yes | Must be ≥ joining_date. |
| `revision_reason` | String | Conditional| Required for every revision after the first. |
| `template_id` | UUID | Conditional| XOR with `components`. |
| `components` | Array | Conditional| XOR with `template_id`. |

#### Error Scenarios
- **422 INVALID_STRUCTURE_INPUT:** Supplying BOTH `template_id` and `components`, or neither.
- **400 EFFECTIVE_BEFORE_JOINING:** Dates must be strictly strictly forward-compatible.

---

### 1.17 Get History, 1.18 Get Current Structure
**Endpoint:** `GET /api/v1/payroll/hr/employees/:userId/salary-structures(/current)`
**What it is:** Fetches the full version history (including rejected proposals) or just the active structure.

---

### 1.19 List Salary-Structure Proposals (HR Checker Queue)
**What it is:** The unified inbox for HR to review all pending proposals.
**Endpoint:** `GET /api/v1/payroll/hr/salary-structures/proposals`
**Auth Required:** Yes, `hr` role.

#### Query Parameters
- `status` (`proposed`, `approved`, `rejected`), `proposed_by`, `user_id`.

---

### 1.20 Approve Salary-Structure Proposal
**What it is:** The Checker step. Promotes a proposal to legally binding.
**Why it exists:** Executes the "gap-free invariant". 
**Side Effects:** Calculates the exact `effective_to` date of the old salary, avoiding overlaps. Supersedes any competing pending proposals for the same user.

**Endpoint:** `POST /api/v1/payroll/hr/salary-structures/:id/approve`

#### Success Response (200 OK)
Returns the promoted row with a new integer `version`.

#### Error Scenarios (Critical Invariants)
- **403 SEPARATE_CHECKER_REQUIRED:** The exact same HR user who proposed it clicked approve (when settings require 2 people).
- **409 PROPOSAL_SCOPE_STALE:** The manager who made the proposal lost authority over the employee during the waiting period.
- **409 PROPOSAL_NOT_PENDING:** Idempotency guard (prevents double promotion).

---

### 1.21 Reject Proposal
**Endpoint:** `POST /api/v1/payroll/hr/salary-structures/:id/reject`
**Request Body:** `{ "rejection_reason": "string" }`
**What it is:** Marks a proposal as rejected. No versioning changes occur.

---

### 1.22 Get, 1.23 Update Payroll Settings
**Endpoint:** `GET|PUT /api/v1/payroll/hr/settings`
**What it is:** Global org toggles.
**Frontend Note:** Setting `payroll_require_separate_checker` to `true` when the org has fewer than 2 active HR users will return `409 INSUFFICIENT_CHECKERS` to prevent deadlocking the org.

---

### 1.24 Get Bank Account (HR View)
**What it is:** Fetches an employee's masked bank account.
**Endpoint:** `GET /api/v1/payroll/hr/employees/:userId/bank-account`
**Response Data:** `{ "masked_account_number": "••••1234", ... }`

> [!WARNING]
> **Data Security Constraint:** The full account number is AES-256-GCM encrypted and NEVER returned by this endpoint. The UI must render `••••1234`.

---

### 1.25 Verify Bank Account
**What it is:** Formal HR verification of a payment instrument.
**Endpoint:** `POST /api/v1/payroll/hr/employees/:userId/bank-account/verify`
**Side Effects:** Idempotent. Sets `is_verified: true`.

---

### 1.26 List Audit Logs
**What it is:** The immutable ledger of every payroll action.
**Endpoint:** `GET /api/v1/payroll/hr/audit-logs`
**Frontend Note:** PII like bank account numbers and encryption keys are strictly redacted by a deny-list backstop before entering this log.

---

## 2. Manager Audience (Scoped Authority)
**Route Prefix:** `/api/v1/payroll/manager`

> [!IMPORTANT]
> **BOLA Rule (Broken Object Level Authorization):** EVERY manager endpoint executes a hierarchy scope check before querying the DB. Attempting to query an employee outside the manager's downline returns `403 FORBIDDEN` (not a 404), completely preventing employee enumeration attacks.

### 2.27 Get Team Salary Structures
**What it is:** The team compensation roll-up dashboard.
**Endpoint:** `GET /api/v1/payroll/manager/team/salary-structures`
**Auth Required:** `manager` or `hr`.

> [!TIP]
> **Frontend Integration Note (EC-25 Toggle):** If `manager_can_view_team_compensation` is `false`, the API strips the `members` array and returns ONLY `headcount`, `team_ctc_total`, and `team_ctc_average`. The UI must handle `members: undefined` gracefully!

---

### 2.28 Get Report's History, 2.29 Current Structure
**Endpoint:** `GET /api/v1/payroll/manager/employees/:userId/salary-structures(/current)`
**What it is:** BOLA-protected reads for direct reports.

---

### 2.30 Propose Salary Structure (Tier-B)
**What it is:** A manager proposes an increment for a direct report.
**Endpoint:** `POST /api/v1/payroll/manager/employees/:userId/salary-structures/propose`
**Side Effects:** Normally lands as `proposed` for HR review. If `manager_direct_compensation_authority` is true, it acts like the HR API and instantly approves it!

---

### 2.31 List My Proposals, 2.32 Cancel Proposal
**Endpoint:** `GET|POST /api/v1/payroll/manager/salary-structures/proposals`
**What it is:** Tracking and retracting Manager proposals. Cancelling requires the caller to be the original proposer (BOLA guard).

---

## 3. Employee Self-Service APIs — `/api/v1/payroll/me`

### 3.33 Get My Structure, 3.34 Get My History
**Endpoint:** `GET /api/v1/payroll/me/salary-structure(/history)`
**What it is:** Returns the employee's active salary.
**Data Isolation Constraint:** This endpoint **strictly filters out pending proposals**. An employee will never see a `proposed` structure, preventing premature expectations if HR rejects a manager's hike.

---

### 3.35 Get My Bank Account
**Endpoint:** `GET /api/v1/payroll/me/bank-account`
**What it is:** Returns the masked `••••1234` bank account.

---

### 3.36 Upsert My Bank Account (Anti-Fraud)
**What it is:** The employee updates their routing numbers.
**Endpoint:** `PUT /api/v1/payroll/me/bank-account`

#### Request Body
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `account_number` | String | Yes | `^\d{6,20}$` |
| `ifsc_code` | String | Yes | Indian format regex |
| `account_holder_name`| String| Yes | |

> [!WARNING]
> **Critical Security Workflow:** The moment this API is called successfully, the system encrypts the number AND **instantly resets `is_verified = false`**. This means a hacked employee account cannot silently route their upcoming paycheck to a fraudulent account—HR must manually re-verify the change.
