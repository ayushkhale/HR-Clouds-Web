# Employee Role — RAG Source-of-Truth Documentation: Implementation Blueprint

**Audience:** the documentation agent that will produce the enriched Employee feature MD files.
**Status of this file:** blueprint / instructions only. It is **not** documentation and must **not** be converted to PDF or fed to the RAG system.
**Author role:** Senior RAG Engineer & Technical Documentation Architect.
**Date:** 2026-09-10.

---

## 0. READ THIS FIRST — Ground Truth About This Repository

The generic assumption behind most documentation briefs is that there is a frontend to inspect. **In this repository there is not.** Verify this yourself before starting (Section 2.4), then work accordingly.

### 0.1 What actually exists

| Layer | Reality |
| --- | --- |
| Backend | Node.js / Express REST API under `src/modules/`, organized as `controllers/`, `models/`, `repositories/`, `routes/`, `services/`, `validators/`, `utils/` |
| Frontend | **Does not exist.** No React/Vue/Angular. No `components/`, `pages/`, `hooks/`, `views/`, or state management anywhere in `src/` |
| UI artifacts | Static HTML prototypes served from `public/pages/` via `express.static` (see `src/app.js`). Exactly **one** is Employee-facing: `public/pages/employee_dashboard.html` (~61 KB) |
| API documentation | Markdown under `public/md_attendance/`, `public/md_auth/`, `public/md_leave/`, `public/md_organization/`, `public/md_payrolls/`, `public/md_settings/`, `public/md_system/`, `public/md_core-workflows/`, `public/md_updates/` |
| Master API index | `public/md_system/api_registry.md` — contains an **"Employee UI"** column. This is the single most valuable cross-reference in the repo |

### 0.2 What this means for your job

The brief's instructions to inspect "components, pages, hooks, state management, conditional rendering" **cannot be followed literally**. Substitute this evidence model:

| Brief asked for | Substitute evidence source in this repo |
| --- | --- |
| Components / pages | `public/pages/employee_dashboard.html` (only for features it covers), otherwise **none — record as "no UI exists"** |
| Routes | `src/modules/*/routes/*.routes.js` |
| Forms & fields | `src/modules/*/validators/*.validator.js` (Joi/Zod schemas define field names, types, required/optional, enums, defaults, min/max) |
| Validation & error messages | Validator schemas + `src/common/middlewares/` + the standardized error envelope (Section 5.4) |
| Permission checks | `authenticate`, `authorize([roles])`, `requireActiveOrg` in `src/common/middlewares/auth.middleware.js`; role lists in `src/modules/organization/routes/role_planes.js` |
| Feature flags | `requireFeature('<key>')` from `src/common/middlewares/require_feature.middleware.js`, backed by `src/modules/billing/services/entitlement.service.js` |
| Business rules | `src/modules/*/services/*.service.js` |
| Navigation | `employee_dashboard.html` where it exists; otherwise **navigation is undocumentable — say so explicitly** |

### 0.3 The single most important consequence

**You cannot document screens, buttons, breadcrumbs, sidebars, modals, or icons for features that have no UI.**

If you write "Navigate to Sidebar → Expenses → New Claim," you will have **fabricated** a navigation path. That fabrication becomes a PDF, becomes a RAG chunk, and becomes a confidently wrong answer given to a real employee. This is the exact failure mode this whole exercise exists to prevent.

Where no UI exists, document **capability and behavior**, and state plainly that no employee-facing screen currently exists.

### 0.4 Mandatory disclosure block

Every output document must carry this at the top, immediately after the H1, so the RAG system can never present API-derived behavior as screen-level instructions:

```markdown
> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** <YYYY-MM-DD>
```

---

## 1. Objective and Non-Negotiable Rules

### 1.1 Objective

Produce one enriched Markdown document per Employee feature. These become PDFs that a RAG system treats as **authoritative**. Optimize for **retrieval correctness over brevity**.

### 1.2 Hard rules

1. **One feature = one document.** Never merge. Never split a feature across documents.
2. **Existing MD is a hypothesis, never a fact.** Every claim must be independently re-verified.
3. **No invention.** If it cannot be traced to code, an API doc, or the prototype, it does not go in the document.
4. **Never present unimplemented capability as available.**
5. **No developer-only detail leaks.** No file paths, function names, table names, internal architecture. Endpoint paths are permitted only where Section 5.5 allows.
6. **Do not modify** `src/`, existing Employee MDs (except as final output), or application behavior.
7. **Traceability.** Every document ends with an evidence appendix (Section 6.7).

### 1.3 Explicit anti-goal

The existing Employee MDs read as **marketing/requirements copy** — aspirational feature lists ("Multi-Currency Support," "Biometric Devices," "AI-based suggestions") written before implementation. Your job is **not** to polish that copy. Your job is to determine what the system **actually does** and rewrite from that basis. Expect to **delete more than you keep** in several documents.

---

## 2. Phase 1 — Inventory and Mapping (do this before writing anything)

### 2.1 Inventory the input folder

Target: `public/HRMS/Employee/Employee_md`

Verified inventory at blueprint time — **re-verify, do not trust this list**:

```bash
ls -1 "public/HRMS/Employee/Employee_md"
```

**16 files total = 14 feature documents + 2 knowledge-base aggregates.**

The 14 feature MDs correspond 1:1 with the 14 feature PDFs in `public/HRMS/Employee/Employee_pdf/`, confirming they are the intended feature set.

### 2.2 The two knowledge-base files — decision rule

| File | Nature | Treatment |
| --- | --- | --- |
| `HRMS_Knowledge_Base.md` | Raw, garbled PDF text extraction. Broken words (`mobile-ﬁrst`, `notiﬁcations`), collapsed grammar, lost structure. **Low quality.** | **Do not produce an output document.** Use only as a weak corroborating signal. |
| `HRMS_Knowledge_Base.curated.md` | Cleaned, structured version of the same content: table of contents, module registry, RBAC section, inter-module dependencies, phased roadmap | **Do not produce an output document.** Use as a **planning aid** — especially its RBAC and dependency sections — but treat every claim as unverified. |

**Rationale:** these are not features. They are compilations *of* the other 14 files. Emitting them as RAG documents would create massive duplication and a high risk of contradicting the per-feature documents — the single worst outcome for retrieval quality.

**Action required:** flag this to the requester and get confirmation before finalizing. If the requester insists on 16 outputs, produce them as **navigational index documents only** (Template C, Section 5.3), containing no feature detail — only one-line pointers to the 14 feature documents.

### 2.3 The near-duplicate pair — decision rule

`Employee panel.md` and `Core Functionalities of HRMS Services.md` are **substantially the same document**: both are top-level overviews listing the same modules (Profile, Attendance & Leave, Payroll, Performance, Announcements…). This is the "two files representing the same feature" case the brief asks you to detect.

**Ruling:** keep both as separate outputs (the one-file-per-input rule wins), but **differentiate them deliberately** so they do not compete for the same retrieval queries:

- `Employee panel.md` → **"Employee Panel — Overview and Module Directory."** Answers *"what is the Employee Panel, what can I do in it, where does each capability live."* Module-by-module directory with availability status. Points to the other 13 documents.
- `Core Functionalities of HRMS Services.md` → **"Employee Self-Service — Capability Availability Matrix."** Answers *"is capability X available to me right now."* A status-first matrix document, minimal prose, heavy on the availability table.

Both use Template C. Both must carry an explicit "for detail, see the dedicated document for that feature" pointer. Neither may contain field-level, form-level, or workflow-level detail — that detail lives **only** in the feature documents. This prevents duplicate-and-drift.

### 2.4 Verify the no-frontend finding yourself

Run these and record the results. Do not proceed until you have.

```bash
ls src/
find src -type d \( -name components -o -name pages -o -name hooks -o -name views -o -name store \) | head
ls public/pages/
grep -n "express.static" src/app.js
```

Expected: `src/` contains only `app.js`, `code_dump`, `common`, `cron-jobs`, `infrastructure`, `modules`, `server.js`. No frontend directories. `public/pages/` contains 21 static HTML prototypes, one of which is `employee_dashboard.html`.

### 2.5 Build the Employee API surface map

Before touching any feature, enumerate **every endpoint an Employee can reach**. This is the backbone of every subsequent decision.

```bash
# Employee self-service route files
cat src/modules/attendance/routes/user_attendance.routes.js
cat src/modules/attendance/routes/user_attendance_read.routes.js
cat src/modules/leave/routes/leave_self.routes.js
cat src/modules/payroll/routes/payroll_self.routes.js
cat src/modules/organization/routes/self_service.routes.js
cat src/modules/organization/routes/department.routes.js
cat src/modules/organization/routes/location.routes.js
cat src/modules/auth/routes/auth.routes.js

# Confirm role gating everywhere
grep -rn "authorize(" src/modules/*/routes/ | grep -i employee
```

Verified Employee-reachable surface at blueprint time (**re-verify**):

| Domain | Endpoints reachable by `employee` | Entitlement gate |
| --- | --- | --- |
| Attendance | ~20 (`/today`, `/history`, `/summary`, `/shift`, `/clock-in`, `/clock-out`, `/break/start`, `/break/end`, `/regularization`, `/regularizations`, `/regularizations/:id/cancel`, `/overtime/mine`, `/anomalies/mine`, `/comp-offs/mine`, `/comp-offs/mine/summary`, `/daily-log`, `/graph-data`, `/trends`, `/weekly-calendar`, `/holidays`) | `attendance.access` |
| Leave | 6 (`/my-balances`, `/my-leave-types`, `/request`, `/requests/:id/cancel`, `/my-requests`, `/requests/:id`) | `leave.access` |
| Payroll & Tax | ~20 (`/me/salary-structure`, `/me/salary-structure/history`, `/me/bank-account` GET+PUT, `/me/payslips`, `/me/payslips/:runId`, `/me/bonuses`, `/me/adjustments`, `/me/loans`, `/me/loans/:id/installments`, `/me/tax/summary`, `/me/tax/projection`, `/me/tax/monthly`, `/me/tax/declarations` GET+PUT, `/me/tax/declarations/submit`, `/me/tax/declarations/proofs`, `/me/tax/regime`, `/me/tax/form16/:financialYear`) | `payroll.access` |
| Profile / Directory | 3 (`GET /me`, `PATCH /me`, `GET /directory`) | none |
| Org reference data | 2 (`GET /departments`, `GET /locations`) | none |
| Auth | signup, verify, login, select-organization, switch-organization, forgot-password, forgot-password/verify, otp/resend, google | none |
| **Invitation / onboarding** | **2 (`GET /invitations/validate` — unauthenticated; `POST /invitations/accept` — optional auth)** | none |

**There is no other Employee-reachable surface.** Anything a feature MD claims that is not on this list is, by definition, not available to an Employee.

### 2.5.1 The invitation flow — the real Employee entry point

Verified in `src/modules/organization/routes/invitation.routes.js`:

- `GET /invitations/validate` — **no `authenticate` middleware at all.** A prospective employee validates their emailed invitation token before holding any account.
- `POST /invitations/accept` — uses `authenticateOptional`, so it works both for a brand-new user and for an existing user being added to an additional organization.
- The invite is *issued* by HR or Manager (`POST /users/invite`, gated to `HR_OR_MANAGER` + subscription seat-limit check). **The employee never issues an invite** — document it as a received action only.

**Why this matters:** in an enterprise HRMS, employees rarely self-signup. Invitation acceptance is the **primary onboarding path**, and the current plan had no home for it. Questions like *"How do I accept my invite?"*, *"Why does my invitation link say invalid?"*, and *"My invite expired, what now?"* would have retrieved **nothing**.

**Assignment:** document the invitation flow in **Feature 6 (`Employee panel.md`)** under a dedicated H2, *"Joining Your Organization Through an Invitation."* Feature 6 already owns "How to Access the Employee Panel," so onboarding belongs there and stays out of Feature 8, which owns account/security settings. Feature 8 links to it; it does not restate it.

Before writing, verify the failure modes: what the validate endpoint returns for an **expired**, **already-accepted**, and **revoked** token. Those three messages are the high-value content. Also confirm whether accepting an invite requires setting a password (new user) versus simply attaching the org (existing user) — the two paths give different instructions.

### 2.6 Master mapping table

Fill this from real inspection. The Status column below is **preliminary triage from grep evidence** — you must confirm each one via Section 3.

| # | Input MD | Feature | Output MD | Source module | Public resources | Preliminary status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `Attendance.md` | Attendance & Time Tracking | `Attendance.md` | `src/modules/attendance` | `md_attendance/3_user_attendance_api.md`, `md_core-workflows/attendance-workflow.md`, `employee_dashboard.html` | **Implemented** |
| 2 | `Leave Management Module.md` | Leave Management | `Leave Management Module.md` | `src/modules/leave` | `md_leave/*`, `employee_dashboard.html` | **Implemented** |
| 3 | `Payroll & Salary Module.md` | Payroll, Salary & Tax | `Payroll & Salary Module.md` | `src/modules/payroll` | `md_payrolls/*` | **Implemented**, no UI |
| 4 | `🔧 Key Functions Under Profile Management.md` | Profile Management | same name | `src/modules/organization` (self-service), `src/modules/employee/models` | `md_organization/4_org_employee_api.md` | **Partial** |
| 5 | `Personal Dashboard Features.md` | Personal Dashboard | same name | composed — no dedicated module | `employee_dashboard.html` | **Partial**, composed |
| 6 | `Employee panel.md` | Employee Panel overview | same name | all of the above | `api_registry.md` | **Umbrella / index** |
| 7 | `Core Functionalities of HRMS Services.md` | Capability availability matrix | same name | all of the above | `api_registry.md` | **Umbrella / index** |
| 8 | `Settings & Preferences.md` | Settings & Preferences | same name | `src/modules/auth`, `src/modules/organization` | `md_settings/org_settings_registry.md` | **Partial** |
| 9 | `Document Management.md` | Document Management | same name | — | — | **Not implemented** |
| 10 | `Expense & Reimbursement.md` | Expense & Reimbursement | same name | — | — | **Not implemented** |
| 11 | `Helpdesk & Support Tickets.md` | Helpdesk & Tickets | same name | — | — | **Not implemented** |
| 12 | `Performance & Appraisal.md` | Performance & Appraisal | same name | — | — | **Not implemented** |
| 13 | `Training & Development.md` | Training & Development | same name | — | — | **Not implemented** |
| 14 | `Communication & Collaboration.md` | Communication & Collaboration | same name | — | — | **Not implemented** |

**Output location:** overwrite in place at `public/HRMS/Employee/Employee_md/<same filename>.md`. Preserve filenames exactly, including spaces and the `🔧` emoji in file 4, so the existing MD→PDF pipeline keeps working.

**Before overwriting:** copy the originals to `public/HRMS/Employee/Employee_md_original/`. You are deleting a lot of content; the originals must remain recoverable.

---

## 3. Phase 2 — Per-Feature Verification Protocol

Run this identical protocol for each of the 14 features. Do not skip steps for features you believe you already understand.

### Step 1 — Read the existing MD in full

Classify **every** claim into exactly one bucket:

| Bucket | Meaning | Action |
| --- | --- | --- |
| **RETAIN** | Verified true against code | Keep, rewrite for RAG clarity |
| **CORRECT** | Directionally right, details wrong | Keep the concept, replace details with verified facts |
| **EXPAND** | True but too thin for a user to act on | Keep and enrich with field/rule/status detail |
| **DEMOTE** | Not available to Employees today | Move to "Not Currently Available" section |
| **REMOVE** | Contradicted by code, or pure marketing with no behavioral content | Delete |

Record the bucket for every claim in your working notes. This log feeds the evidence appendix.

### Step 2 — Locate the module and enumerate Employee routes

```bash
ls -R src/modules/<module>
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" src/modules/<module>/routes/
```

For each Employee-reachable route record: method, path, middleware chain, validator schema, controller handler, service.

### Step 3 — Extract fields from validators (this is your form specification)

```bash
cat src/modules/<module>/validators/<name>.validator.js
```

Validator schemas are the **authoritative field contract**. From each schema extract, per field: name, data type, required vs optional, enum/allowed values, default, min/max/length constraints, conditional requirements (`when`/`.required()` branches), and any custom message string.

**Never guess an enum.** If a status set or leave-type list is not enumerated in a validator, model, or constants file, do not list values — say the values are configured per organization.

### Step 4 — Extract user-visible business rules from services

```bash
cat src/modules/<module>/services/<name>.service.js
```

Extract only rules an employee can **observe**: eligibility conditions, balance checks, overlap/duplicate rejection, cutoffs and windows, state transitions, what is blocked and why, what happens on success. Ignore transactions, locking, query construction, caching, and repository internals.

### Step 5 — Extract error messages verbatim

```bash
grep -rn "message:\|Error(\|throw new" src/modules/<module>/services/ src/modules/<module>/controllers/
```

Capture the **exact user-facing message strings**. These are the highest-value RAG content in the entire corpus: employees literally paste error text into a chatbot. Reproduce them verbatim, in a table, with cause and resolution.

### Step 6 — Check permissions and entitlement gating

```bash
grep -n "authorize(\|requireFeature(\|requireActiveOrg" src/modules/<module>/routes/*.routes.js
cat src/modules/organization/routes/role_planes.js
```

Record: which roles reach the endpoint, whether `employee` is included, whether an active org is required, and which entitlement key gates it.

Confirmed entitlement keys (only three exist):

| Key | Gates |
| --- | --- |
| `attendance.access` | all Attendance endpoints |
| `leave.access` | all Leave self endpoints |
| `payroll.access` | all Payroll/Tax self endpoints |

Any feature gated by these can return `FEATURE_NOT_AVAILABLE` if the organization's subscription plan excludes it. **This is a real, user-visible limitation and must be documented in every gated feature's Limitations section.**

### Step 7 — Check the API documentation

Read the matching file under `public/md_*/`. Extract request/response shapes, query parameters, pagination, filters, and worked examples. Treat as **corroborating** evidence — subordinate to code (Section 5.1).

### Step 8 — Check the prototype UI

```bash
grep -n "fetch(\|/api/v1/" public/pages/employee_dashboard.html
```

Only if the endpoint appears there may you describe screen elements, and only as they exist in the prototype. Confirmed prototype coverage: Today's Attendance, Recent Punch History, Regularization Requests (+ submit modal), My Leave History, My Leave Wallet (+ apply modal), Monthly Snapshot, Monthly Trend, This Week, Daily Log modal, leave-request cancel action, logout.

**Everything else has no UI.**

### Step 9 — Assign an implementation status to every capability

Use the taxonomy in Section 4. Status is assigned **per capability**, not per feature — one feature routinely contains a mix.

### Step 10 — Write the document using the correct template

Template A (implemented), B (not implemented), or C (umbrella). See Section 5.

---

## 4. Implementation Status Taxonomy

Every documented capability gets exactly one status, justified by evidence.

| Status | Evidence required | How it appears to the reader |
| --- | --- | --- |
| **Available** | Route exists, `employee` in `authorize()`, controller + service implemented, validator present | Documented normally as a usable capability |
| **Available (API only — no user interface yet)** | Route exists and works, but no screen in `employee_dashboard.html` | Documented as capability; explicitly notes no screen exists yet |
| **Available with limitations** | Works, but narrower than the existing MD implies | Documented with an explicit limitation statement |
| **Not available to Employees** | Endpoint exists but `employee` is absent from `authorize()` (HR/Manager only) | Stated as performed by HR/Manager, not by the employee |
| **Requires subscription plan** | Behind `requireFeature(...)` | Noted; explains `FEATURE_NOT_AVAILABLE` |
| **Not implemented** | No route, no controller, no service, no model | Listed under "Not Currently Available," with no invented detail |
| **Described in requirements only** | Appears in source MDs but has zero code | Same as above, explicitly labeled as a requirements-document claim, not a product capability |

### 4.1 Verified not-implemented findings

Triage evidence gathered while writing this blueprint. **Re-run and confirm each before writing.**

```bash
for k in expense reimburs ticket helpdesk training course performance appraisal \
         survey chat announcement notification asset badge certificate goal okr kra; do
  printf "%-14s %s\n" "$k" "$(grep -ril "$k" src/modules | wc -l)"
done
```

| Feature claimed | Grep result | Interpretation |
| --- | --- | --- |
| Expense & Reimbursement | `expense` = **0 files**. `reimburs` = 5 files, **all in `src/modules/payroll`** as salary *component* names | No expense module. The `reimburs` hits are payroll salary components, an unrelated concept. **False positive — do not mistake this for an expense feature.** |
| Helpdesk & Tickets | `helpdesk` = 0. `ticket` = 1 (incidental) | Not implemented |
| Training & Development | `training` = 0, `course` = 0 | Not implemented |
| Performance & Appraisal | `appraisal` = 0. `performance` = 4 files, **all `bonus_rules` / `bonus_rule_evaluator` in payroll** | No appraisal module. **False positive.** |
| Communication & Collaboration | `chat` = 0, `announcement` = 0, `survey` = 0, `notification` = 0 | Not implemented |
| Document Management | `document` = 9 files, **all leave supporting-documents and payroll statutory logic** | No document management module. **False positive.** Leave attachment capability belongs in the Leave document, not here |

These three false positives are exactly the trap that produces hallucinated documentation. **Always open the matched files before concluding a feature exists.**

---

## 5. Output Document Standards

### 5.1 Source-of-truth precedence

When sources conflict, resolve strictly in this order:

1. **Source code** under `src/modules` — routes, validators, services, middleware. **Always wins.** It is what actually runs.
2. **`public/md_system/api_registry.md`** — maintained index with an Employee UI column. Use to cross-check coverage; if it disagrees with code, code wins.
3. **Domain API docs** (`public/md_attendance/`, `md_leave/`, `md_payrolls/`, `md_organization/`, `md_updates/`) — good for request/response shapes and examples. If they disagree with code, code wins.
4. **`public/pages/employee_dashboard.html`** — authoritative **only** for prototype UI appearance. Never authoritative for business rules.
5. **Existing Employee MDs** — **lowest precedence.** Requirements-era aspiration. Useful only for identifying intent and vocabulary employees might use when asking questions.

**Conflict procedure:**

1. Re-read the code path end to end (route → validator → controller → service) to be certain you have understood it.
2. Code wins. Write the code-verified behavior.
3. If the existing MD claimed something materially different, add a row to the document's **Known Documentation Corrections** table so the discrepancy is recorded rather than silently dropped.
4. If code is genuinely ambiguous and you cannot resolve it, **omit the claim** and list it in the evidence appendix under "Unresolved." Never split the difference. Never guess.

### 5.2 Template A — Implemented Feature

For features 1, 2, 3, 4, 5, 8. Section order is deliberate: identity and availability first (cheap, high-frequency questions), then workflows, then reference tables, then edge cases. Headings are phrased as **retrievable noun phrases including the feature name**, because after PDF conversion a heading is often the strongest signal a chunk carries.

```markdown
---
[YAML frontmatter per Section 6.4]
---

# <Feature Name> — Employee Guide

**Document Information**
Role: Employee · Module: <module> · Availability: <status> · User interface: <yes|partial|none> · Last verified: <YYYY-MM-DD>

> [mandatory disclosure block from Section 0.4]

## 1. What <Feature Name> Does for an Employee
2–4 sentences. Plain language. Name the feature and the role in the first sentence.

## 2. Availability and Access for the Employee Role
Status. Who can use it. Subscription/entitlement gating. Prerequisites.
Explicit statement of whether a user interface exists today.

## 3. Where to Find <Feature Name>
Prototype navigation if it exists. Otherwise state plainly that the capability is
available through the platform's Employee self-service interface and that a
dedicated screen has not been released.

## 4. Capabilities Available to an Employee in <Feature Name>
Table: Capability | Status | Notes. This is the fastest answer to
"can I do X" and must be scannable.

## 5. <Workflow Name> — Step-by-Step
One H2 per distinct workflow. Numbered steps in execution order.
State preconditions, what the employee provides, what the system does,
what the outcome is. Repeat H2 per workflow.

## 6. Fields and Input Rules for <Specific Form Name>
One table per form. Columns: Field | Purpose | Required | Type |
Allowed values | Default | Rules.

## 7. Statuses in <Feature Name> and What They Mean
Table: Status | Meaning for the employee | What happens next | Can the employee act.

## 8. Rules and Restrictions That Apply to <Feature Name>
Verified business rules an employee can observe.

## 9. Error Messages in <Feature Name> and How to Resolve Them
One H3 per significant failure, per Section 6.6 (error-code anchoring).
A summary table of verbatim messages may precede the H3s, but must not replace them.

## 10. Successful Outcomes in <Feature Name>
What confirms success and what changes as a result.

## 11. When No Data Is Shown in <Feature Name>
Legitimate empty-state causes.

## 12. Limitations of <Feature Name>
Explicit. Include entitlement gating and anything the source MD overstated.

## 13. Not Currently Available in <Feature Name>
Capabilities described in requirements that do not exist. Flat statements, no detail.

## 14. Related Employee Features
Named pointers to other Employee documents and why they relate.

## 15. Common Employee Questions About <Feature Name>
8–15 entries, **each as its own H3 phrased as the question**, per Section 6.5.
Use the phrasing employees actually type. **Highest-value RAG section.**

## 16. Terminology Used in <Feature Name>
Term | Definition | Also called.

## 17. Known Documentation Corrections
Previously stated | Verified reality. Only if corrections were made.

## 18. Verification Record
Evidence appendix per Section 6.7.
```

### 5.3 Template B — Not Implemented Feature

For features 9–14. **Short by design.** Length here is a liability: every extra sentence about a nonexistent feature is another chunk that can be retrieved and misread as fact.

```markdown
---
[YAML frontmatter per Section 6.4, with status: "not-implemented", ui_available: "none"]
---

# <Feature Name> — Availability Status for the Employee Role

**Document Information**
Role: Employee · Availability: Not currently available · Last verified: <YYYY-MM-DD>

> [mandatory disclosure block]

## 1. Current Availability of <Feature Name>
**Status: Not currently available.**
State it in the first sentence, unambiguously. No hedging, no "coming soon"
unless a dated commitment exists in the repository — it does not.

## 2. What This Means for an Employee Today
What an employee can and cannot do right now. Direct and practical.

## 3. Capabilities Described in Planning Documents but Not Implemented
Bullet list, one line each, no elaboration. Framed as
"the following were described in requirements documents and are not available."

## 4. Where Related Needs Are Handled Today
Genuine alternatives only. Example: leave supporting documents attach to a leave
request (see the Leave Management document). If there is no alternative,
say the need must be handled outside the platform.

## 5. Common Employee Questions About <Feature Name>
One H3 per question, per Section 6.5. Every answer must reinforce unavailability:

### How do I submit an expense claim?
Expense and reimbursement submission is not available in the platform. There is no
expense claim feature for employees. Contact your HR or finance team for the process
your organization uses.

## 6. Verification Record
Searches run, what was found, date.
```

**Critical constraint:** these documents must **never** describe how the feature would work. No fields, no workflows, no statuses. Describing an imaginary workflow is the single highest-risk action in this project.

### 5.4 Standardized error envelope

Verified in `public/md_updates/error_handling_api_changes.md`: **all** error responses across the backend share one schema.

```json
{ "success": false, "message": "<human-readable>", "errorCode": "<CODE>" }
```

Known codes: `BAD_REQUEST`, `NOT_FOUND`, `FORBIDDEN`, `INTERNAL_ERROR`, `FEATURE_NOT_AVAILABLE`.

Translate to plain language in documents. Do **not** print raw JSON — that is developer detail. Instead:

> If your organization's plan does not include this module, the system reports that the feature is not available on your current subscription plan. Contact your HR administrator.

### 5.5 What may and may not appear in output

| Permitted | Prohibited |
| --- | --- |
| Feature and capability descriptions | Source file paths |
| Field names as the employee supplies them | Function, controller, service, variable names |
| Allowed values and validation rules | Database tables and columns |
| Verbatim user-facing error messages | Raw JSON payloads and HTTP status codes |
| Statuses and their meanings | Middleware names, architecture, internal APIs |
| Business rules the employee experiences | Algorithms, transactions, locking, query logic |
| Role-based access statements | Internal role constants, entitlement key strings |

**One deliberate exception:** in Payroll and Attendance, endpoint *paths* may be named in a clearly-labeled subsection **only if** the requester confirms the audience includes integrators. Default is **exclude**. Ask before including.

---

## 6. RAG Optimization Rules

### 6.1 Chunk-survival rules

PDF conversion plus chunking destroys context. Write so that **any single section, read alone, is still correct and useful.**

1. **Repeat the feature name in every H2.** "Fields in the Leave Application Form," not "Fields."
2. **No orphan references.** Ban "this page," "the above," "as mentioned earlier," "the form below." Name the thing every time.
3. **Restate the role.** Say "an employee can…" rather than "you can…" where ambiguity is possible.
4. **Keep tables under ~15 rows.** Long tables split across pages and lose their header row. Split by subtopic with its own heading.
5. **Never split a field's rules from its name.** One row per field, complete.
6. **Never split a status from its meaning.** Same row.
7. **Front-load the answer.** First sentence of each section answers the question; detail follows.

### 6.2 Synonym coverage

Employees do not use internal vocabulary. Introduce alternatives naturally in prose or in the terminology table so semantic search matches real queries.

| Canonical | Must also appear |
| --- | --- |
| Clock-in / Clock-out | punch in, punch out, mark attendance, check in, sign in for the day |
| Regularization | attendance correction, missed punch request, fix my attendance, wrong timing |
| Leave balance | leave wallet, remaining leaves, how many leaves left, leave quota |
| Payslip | salary slip, pay stub, monthly salary statement |
| Salary structure | CTC breakup, salary breakdown, pay components |
| Tax declaration | investment declaration, 80C declaration, tax saving proof |
| Comp-off | compensatory off, compensatory leave |
| Form 16 | tax certificate, annual tax statement |
| Directory | employee list, colleague search, team contacts |

Do this in **flowing sentences**, not keyword lists. Keyword stuffing degrades embedding quality.

### 6.3 Duplication policy

- Full detail lives in **exactly one** document — the feature's own.
- Other documents **point by name**: "Leave balance rules are described in the Leave Management document."
- Never restate a rule in two documents. Two copies drift; drift produces contradictory retrieval; contradictory retrieval destroys trust.
- The two umbrella documents (features 6 and 7) carry **no** feature detail at all — this is precisely why.

### 6.4 YAML frontmatter and the PDF problem

Every document begins with a frontmatter block:

```yaml
---
title: "Attendance & Time Tracking — Employee Guide"
role: "employee"
module: "attendance"
status: "implemented"
ui_available: "partial"
source_document: "Attendance.md"
last_verified: "2026-09-10"
tags: ["clock-in", "clock-out", "punch", "regularization", "comp-off", "shift", "overtime", "anomalies", "geofencing", "holidays"]
---
```

Allowed `status` values: `implemented`, `partial`, `not-implemented`, `index`.
Allowed `ui_available` values: `yes`, `partial`, `none`.

**Benefit:** a vector store can filter on `metadata.role == "employee"`, eliminating cross-role contamination when Admin/HR/Manager corpora are ingested alongside this set — a real risk here, since sibling folders for those roles already exist under `public/HRMS/`.

**The caveat you must handle.** The stated pipeline is **MD → PDF → RAG**. PDF has no metadata channel that a chunker will read as frontmatter, and a naive converter will render the YAML as a visible block of `---` and colons on page one — junk text in your highest-weighted chunk. So frontmatter alone does not deliver the benefit. Do all three:

1. **Keep the YAML block** in the `.md` — it costs nothing and pays off immediately if the pipeline ever ingests Markdown directly, which is the better ingestion path anyway.
2. **Configure the converter to strip frontmatter** (Pandoc does this natively; most MD→PDF tools have a flag) **and map it into PDF document properties** — Title, Subject, Keywords. Many PDF loaders surface those as chunk metadata.
3. **Also render a visible Document Information block** as the first content after the H1, because it is the only one of the three that survives every pipeline:

```markdown
**Document Information**
Role: Employee · Module: Attendance · Availability: Implemented · User interface: Partial (reference dashboard) · Last verified: 2026-09-10
```

This is user-safe, human-readable, and makes the first chunk self-describing. **If you can only do one, do this one.**

### 6.5 Atomic, self-contained FAQ headers

The FAQ section is the highest-value RAG content in each document, but a flat list of bolded questions chunks badly: a splitter lands mid-list and produces a fragment whose questions have lost the feature name.

Rule: **every FAQ entry gets its own H3 phrased as the question itself, including the feature noun.**

```markdown
## 15. Common Employee Questions About Attendance

### How do I mark my attendance for the day?
Answer, self-contained, naming attendance explicitly.

### Why was an anomaly logged when I clocked in from outside the office?
Answer.

### Can I clock in without sharing my location?
Answer.
```

Not this:

```markdown
## FAQ
**Q: How do I mark attendance?** A: ...
**Q: Why an anomaly?** A: ...
```

**Why:** a header-aware splitter (`MarkdownHeaderTextSplitter` and equivalents) makes each Q&A its own atomic chunk carrying its full heading path — `Attendance & Time Tracking → Common Employee Questions About Attendance → How do I mark my attendance for the day?`. That heading path is retrieval gold. It also survives PDF conversion, since H3s remain real headings.

Phrase each H3 the way an employee would actually type it, not the way a technical writer would title it.

### 6.6 Error-code anchoring

Where a document explains a failure, anchor the plain-language explanation to the stable code so that both phrasings retrieve — employees paste messages, support staff quote codes.

Give each significant failure its own H3 in the error section, naming the condition in words, and mention the code once in the body:

```markdown
### Leave request rejected because your profile is missing required information
This appears when the leave type you selected has eligibility restrictions based on
gender or marital status, and that information is not yet recorded on your profile.
The system reports this as DEMOGRAPHIC_PROFILE_INCOMPLETE. You cannot add these
details yourself — contact HR to have them recorded, then apply again.
```

Codes to anchor: `DEMOGRAPHIC_PROFILE_INCOMPLETE`, `DEMOGRAPHIC_INELIGIBLE`, `FEATURE_NOT_AVAILABLE`, `REGIME_SWITCH_NOT_ALLOWED`, plus any others found during Step 5. Codes are **stable across releases** while message wording drifts, so this hedges against your own documentation going stale.

This is the **one sanctioned exception** to Section 5.5's ban on internal identifiers: these codes are returned to the user in the API response and appear in support conversations, so they are user-facing, not internal.

### 6.7 Verification record (mandatory appendix)

Every document ends with:

```markdown
## Verification Record

**Verified on:** <YYYY-MM-DD>
**Verification basis:** Application source code, API documentation, and the reference
Employee Dashboard prototype.

**Confirmed available:** <capability list>
**Confirmed unavailable:** <capability list>
**Available without a user interface:** <capability list>
**Could not be verified (excluded from this document):** <list, or "None">
```

This is user-safe (no internal detail) and gives the RAG system a way to answer "is this current?"

---

## 6A. Verified Code Facts — Settled, Do Not Re-Research

Everything below was read directly out of the source during blueprint review. These are **settled facts**, not research prompts. Use them as written. Re-verify only if the code has changed since 2026-09-10.

Where a fact contradicts something in Section 7's investigation notes, **this section wins** — Section 7 was written before this verification pass.

### 6A.1 Attendance — geofencing does not block a punch

`clock.service.js` (~L1015–1060). Location resolution: the employee's assigned `location_id` is used if the location is active; otherwise all active org locations are treated as valid. Geofencing only engages when at least one valid location exists.

**Critical behavioral fact: a punch is never rejected for location reasons.** Coordinates are optional. The outcomes are:

| Situation | What happens | Anomaly raised | Severity |
| --- | --- | --- | --- |
| Coordinates omitted while geofencing active | **Punch succeeds** | `missing_coordinates` | medium |
| Coordinates outside all valid location radiuses | **Punch succeeds** | `out_of_bounds` | high |
| Coordinates inside a valid radius | Punch succeeds | none | — |
| No active locations configured | Punch succeeds, geofencing skipped entirely | none | — |

**Documentation impact:** this directly contradicts the natural assumption (and the source MD's implication) that out-of-area punches are blocked. The correct employee-facing statement is: *your punch is recorded, but an attendance anomaly is logged for your organization to review.* Getting this backwards would be a serious error — it would tell employees their attendance failed when it was actually recorded.

### 6A.2 Attendance — there are nine anomaly types, not five

**This corrects a common misreading.** `anomaly.service.js` L12–18 defines `DETECTED_TYPES` with five entries, but that constant is explicitly scoped to *"anomaly types owned by the detection pass"* for safe reconciliation. The file's own comment (L7–10) names four further types raised by other producers, all verified as live:

| Type | Producer | Verified at |
| --- | --- | --- |
| `missing_clock_out` | detection pass | `anomaly.service.js:12-18` |
| `late_arrival` | detection pass | same |
| `early_exit` | detection pass | same |
| `excessive_break` | detection pass | same |
| `insufficient_hours` | detection pass | same |
| `missing_coordinates` | geofence check | `clock.service.js` ~L1035 |
| `out_of_bounds` | geofence check | `clock.service.js` ~L1050 |
| `auto_clock_out` | auto-close routine | `clock.service.js:855` |
| `unauthorized_absence` | absence check | `clock.service.js:989` |

**An employee calling `/anomalies/mine` can see all nine.** Document all nine with plain-language meanings. Documenting only the five would leave the four most confusing ones — including both geofence types — unanswerable.

### 6A.3 Leave — half-day yes, hourly no

`leave_request.validator.js:5-23`. The complete `submitRequestSchema`:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `leave_type_id` | UUID | **Yes** | must be a leave type available to the employee |
| `start_date` | string | **Yes** | `YYYY-MM-DD` |
| `end_date` | string | **Yes** | `YYYY-MM-DD`; custom rule rejects an end date earlier than the start date, message: `"end_date" must be greater than or equal to "start_date"` |
| `is_half_day` | boolean | No | defaults to `false` |
| `half_day_type` | enum | **Conditional** | required when `is_half_day` is true; **forbidden** when false. Values: `first_half`, `second_half` |
| `reason` | string | No | max 1000 chars, may be empty/null |
| `document_url` | string | No | **must be a valid URI**, max 255 chars |

**Two facts that must not be misstated:**

1. **Hourly leave does not exist.** The source MD claims "full day, half day, hourly." Only full-day and half-day are supported. Demote the hourly claim.
2. **`document_url` is a URL reference, not a file upload.** There is no multipart upload on this endpoint. The employee supplies a link to an already-hosted document. Do **not** write "upload your medical certificate" — write that a document link can be attached. This also constrains what Feature 9 (Document Management) may claim as an alternative.

### 6A.4 Leave — six statuses, and cancellation can require approval

`leave_request.validator.js:37` defines the full status set — **six, not four**:

`pending`, `approved`, `rejected`, `cancelled`, `cancellation_pending`, `terminated_cancelled`

`leave_self.controller.js:39-54` confirms cancellation is **two-path**. The response message is chosen by the resulting status:

- `'Leave request cancelled successfully'` → status became `cancelled` (direct cancellation)
- `'Cancellation pending manager approval'` → status became `cancellation_pending`

**Documentation impact:** cancelling is not always immediate. An employee who cancels an already-approved leave enters `cancellation_pending` and must wait for manager approval. Determine from `leave_application.service.js` exactly which starting status takes which path, then document both outcomes and both verbatim messages. `cancellation_pending` and `terminated_cancelled` are precisely the statuses an employee will not understand and will ask about — both need plain-language definitions.

### 6A.5 Leave — demographic eligibility gating

`leave_application.service.js:35-61`, with `leave_type.model.js` exposing `allowed_genders` and `allowed_marital_statuses`. Gating engages only when a leave type sets one or both. Two distinct error codes and four distinct verbatim messages:

| Condition | Code | Verbatim message |
| --- | --- | --- |
| Type is gated, profile incomplete | `DEMOGRAPHIC_PROFILE_INCOMPLETE` | *"This leave type has eligibility restrictions, but your profile is incomplete. Please contact HR."* |
| Gender-gated, gender not set | `DEMOGRAPHIC_PROFILE_INCOMPLETE` | *"This leave type is restricted by gender, but your gender is not on file. Please contact HR."* |
| Marital-status-gated, not set | `DEMOGRAPHIC_PROFILE_INCOMPLETE` | *"This leave type is restricted by marital status, but your marital status is not on file. Please contact HR."* |
| Set but not in the allowed list | `DEMOGRAPHIC_INELIGIBLE` | *"You are not eligible to apply for this leave type."* |

Reproduce messages verbatim after confirming exact wording in the file (the grep output was lossily compressed during review).

**Cross-feature link that makes this urgent:** `gender` and `marital_status` are **not employee-editable** (see 6A.6). So an employee blocked by `DEMOGRAPHIC_PROFILE_INCOMPLETE` **cannot fix it themselves** — they must contact HR. The Leave document and the Profile document must both state this, and must agree.

### 6A.6 Profile — the exact editable whitelist, and silent field dropping

`self_service.validator.js:14-34`. Exactly **13 editable fields**:

`first_name`, `last_name`, `display_name`, `phone`, `avatar_url`, `personal_email`, `current_address`, `permanent_address`, `city`, `state`, `pincode`, `dob`, `blood_group`

Constraints: `personal_email` must be a valid email (max 150); `dob` must be ISO date; `phone`/`pincode`/`blood_group` max 20; `city` max 100 (verify — review showed `state` 100, `city` 150); `avatar_url` max 1000; most allow null/empty. At least one field must be supplied, else: **`"At least one field must be provided to update"`**.

**The behavioral subtlety that must be documented.** The validator runs with `stripUnknown: true`. Non-whitelisted fields — `department`, `designation`, `gender`, `marital_status`, `employee_code`, `pan_number` — are **silently dropped, not rejected**. The request returns **success**, and the field is simply unchanged.

This is a genuine user-confusion trap and a top-tier FAQ entry:

> **Q: I changed my designation and it said saved, but it didn't change. Why?**
> A: Designation is not an employee-editable field. Changes to it are not applied even though the save appears to succeed. Contact HR to update your designation.

**Do not describe this as an error message** — there is no error. Describe it as: the save succeeds, the locked field is unchanged, and no warning is shown.

### 6A.7 Profile — reporting manager is returned

`organization.service.js:442-473` builds `reportingPersonDetails` (name and email) into the `GET /me` response, nullable when no manager is assigned.

**Documentation impact:** an employee **can** see who their reporting manager is, on their own profile. Document it, including the "no manager assigned" case. Answers *"who is my manager?"* and *"who approves my leave?"* — link the latter to the Leave document.

### 6A.8 Settings — there is no authenticated change-password endpoint

`auth.routes.js` in full is nine routes: `/signup`, `/signup/verify`, `/login`, `/select-organization`, `/switch-organization`, `/forgot-password`, `/forgot-password/verify`, `/otp/resend`, `/google`. **No `/change-password`. No `/update-password`. No authenticated password route of any kind.**

**Documentation impact:** a signed-in employee **cannot** change their password from within the platform. The only path is the unauthenticated forgot-password OTP flow. Document it exactly that way:

> To change your password, sign out and use the "Forgot Password" option. You will receive a one-time password (OTP) by email to confirm the change. There is no in-account password change option.

This is counter-intuitive and near-certain to be asked. Section 7 / Feature 8 listed this as an open question — **it is now settled.**

### 6A.9 Payroll — tax regime switch is org-gated and lockable

`payroll_self.validator.js:63-66`: `switchRegimeSchema` = a single body field **`regime_code`**, required, valid values **`'old'`** or **`'new'`**. The route comment confirms `financial_year` arrives as a **query parameter validated in the controller**, not in this schema.

Service-side gating in `employee_tax.service.js` (~L800–812): a self-initiated switch requires the org setting **`allow_employee_regime_switch`** to be exactly `true`; otherwise it fails with **`REGIME_SWITCH_NOT_ALLOWED`**. The same area references a **tax lock** that further restricts switching.

Confirmed in `payroll_settings.model.js:174`, `payroll_hr.validator.js:190`, and `public/md_settings/org_settings_registry.md`.

**Documentation impact — three separate points, all needed:**
1. Only two regimes exist: old and new.
2. Whether an employee may switch at all is an **organization setting**. Many employees will find this disabled. Document the denial as a real, expected outcome, not an error.
3. A switch is tied to a specific financial year and may be blocked once tax processing is locked. Verify the lock condition in `employee_tax.service.js` before stating it precisely.

The related declaration-window settings in `org_settings_registry.md` — `tax_declaration_window_start_month` (default 4), `tax_declaration_window_end_month` (default 1), `tax_proof_deadline_month` (default 2), `tax_proof_deadline_day` (default 28) — explain *why* declaration submission is sometimes refused, and belong in the Payroll document's rules section as org-configurable windows.

### 6A.10 Summary of corrections this section makes to Section 7

| Section 7 said | Settled answer |
| --- | --- |
| "Determine if lat/long required; what rejection message?" | Optional; **no rejection ever**; raises an anomaly instead (6A.1) |
| "Confirm exact anomaly types" | **Nine** types, not five (6A.2) |
| "Check if hourly leave exists" | It does not (6A.3) |
| "Determine if endpoint accepts file upload" | **URL only**, max 255 chars — no upload (6A.3) |
| "Which statuses permit cancellation?" | Six statuses exist; cancellation is two-path with `cancellation_pending` (6A.4) |
| "Open the service and extract the exact whitelist" | 13 fields listed; unlisted fields **silently dropped on success** (6A.6) |
| "Check whether an authenticated change-password exists" | It does not (6A.8) |
| "Determine allowed regime values and restrictions" | `old`/`new`; org-gated by `allow_employee_regime_switch`; tax-lock constrained (6A.9) |

---

## 7. Per-Feature Implementation Plans

> **Read Section 6A first.** Several investigation notes below are already answered there, and Section 6A takes precedence.

---

### FEATURE 1 — Attendance & Time Tracking

**Input:** `Employee_md/Attendance.md` → **Output:** `Employee_md/Attendance.md`
**Template:** A · **Status:** Implemented, richest Employee feature, partial UI

**Source investigation**
- `src/modules/attendance/routes/user_attendance.routes.js` and `user_attendance_read.routes.js` — the full ~20-endpoint Employee surface
- `src/modules/attendance/validators/user_attendance.validator.js` and `user_attendance_read.validator.js` — clock-in/out payloads, regularization schema, all query filters, pagination
- `src/modules/attendance/services/` — `clock.service.js`, `regularization.service.js`, `overtime.service.js`, `anomaly.service.js`, `comp_off.service.js`, `holiday.service.js`, `user_attendance_read.service.js`
- `src/modules/attendance/models/` — status enums only

**Public investigation**
- `public/md_attendance/3_user_attendance_api.md` (primary)
- `public/md_core-workflows/attendance-workflow.md` (end-to-end lifecycle)
- `public/pages/employee_dashboard.html` — Today's Attendance, Recent Punch History, Regularization Requests + modal, Monthly Snapshot, Monthly Trend, This Week, Daily Log modal
- `public/md_updates/new_apis_2026_08_29.md`, `new_apis_2026_08_31.md` — recent additions the source MD predates

**Workflows to document (one H2 each)**
1. Clocking in for the day
2. Clocking out
3. Starting and ending a break
4. Viewing today's attendance status
5. Viewing attendance history
6. Viewing the daily log for a specific date
7. Viewing the weekly calendar
8. Viewing the monthly summary and trends
9. Submitting a regularization request
10. Tracking regularization requests
11. Cancelling a pending regularization request
12. Viewing overtime records
13. Viewing attendance anomalies
14. Viewing compensatory-off balance and records
15. Viewing applicable holidays
16. Viewing the assigned shift

**Verification specifics**
- **Geofencing/GPS:** the source MD claims GPS and geofencing. `api_registry.md` states clock-in "validates GPS geofencing rules." Open `clock.service.js` and the clock-in validator and determine: are latitude/longitude required or optional? Is geofence enforcement conditional on org configuration? What is the exact rejection message? Document only what the code does.
- **Biometric / facial recognition:** the source MD claims biometric devices and face recognition. `device_webhook.routes.js` exists — determine whether this is a device-integration webhook (device pushes to the system) rather than an employee-facing capability. If so, it is **not** an Employee capability. Document accordingly and correct the source MD's claim.
- **Regularization cancellation:** verified as self-scoped, row-locked, and rejecting already-processed requests. Document as: an employee may withdraw a regularization request only while it is still pending.
- **Anomalies:** filterable by open/resolved/all. Confirm the exact anomaly types the employee sees.
- **Comp-offs:** employee has read-only access (`/mine`, `/mine/summary`). Confirm there is **no** employee-facing comp-off *request* endpoint. If absent, state that comp-off credits are granted by HR/Manager and the employee can only view them.
- **Overtime:** same check — read-only for employee?

**Likely gaps in the existing MD:** break tracking, daily-log detail, weekly calendar, trends/graph data, anomalies, comp-offs, overtime, holidays, shift lookup, regularization cancellation, entitlement gating. The source MD covers roughly a quarter of what exists. **This document should grow substantially.**

**Likely corrections:** biometric/face recognition as an employee capability; "mobile app access" (no mobile app exists); multi-device real-time sync claims.

**Cross-feature:** Leave (holidays, comp-off→leave interaction), Payroll (clock-out triggers hours calculation feeding payroll), Personal Dashboard (surfaces attendance widgets).

**Quality checks:** every one of the ~20 endpoints is either documented or explicitly listed as not employee-facing; every clock-in/out and regularization field documented with required/optional; every status enumerated; every verbatim error message captured; prototype-UI claims limited to what is genuinely in `employee_dashboard.html`.

---

### FEATURE 2 — Leave Management

**Input:** `Employee_md/Leave Management Module.md` → **Output:** same name
**Template:** A · **Status:** Implemented (self-service subset), partial UI

**Source investigation**
- `src/modules/leave/routes/leave_self.routes.js` — the complete Employee surface: 6 endpoints
- `src/modules/leave/validators/leave_request.validator.js` — `submitRequestSchema`, `idParamSchema`
- `src/modules/leave/services/` — `leave_application.service.js` (eligibility, overlap, validation), `leave_balance.service.js` (balance, accrual, carry-forward)
- `src/modules/leave/models/leave_request.model.js`, `leave_type.model.js` — statuses, document-required flag

**Public investigation**
- `public/md_leave/combined_api_analysis.md`, `complete_workflow_overview.md`
- `public/md_leave/md_phases/` — check whether phases document unbuilt capability; anything there but not in code is **not implemented**
- `public/pages/employee_dashboard.html` — My Leave History, My Leave Wallet, Apply for Leave modal, cancel action

**Workflows:** apply for leave; check balance before applying; view available leave types; track request status; view a single request's detail; cancel a pending request.

**Verification specifics**
- **Leave types:** the source MD hard-lists CL/SL/PL/EL/Maternity/Paternity/Comp-off/WFH. `/my-leave-types` returns them **dynamically per organization**. Almost certainly the hard list is wrong as a universal claim. Verify, and document as "your organization configures which leave types are available; the platform commonly supports…". **Do not present the fixed list as authoritative.**
- **Half-day / hourly leave:** source MD claims full/half/hourly. Check `submitRequestSchema` for a duration/day-part field. Hourly leave in particular may not exist. Document only what the schema supports.
- **Supporting documents:** `leave_request.model.js` and `leave_type.model.js` reference documents. Determine whether the Employee endpoint accepts a file upload, a URL, or nothing. This is the **only** legitimate document-attachment capability found in the codebase — and it belongs **here**, not in the Document Management document.
- **Approval workflow:** source MD claims multi-level (Team Lead → Dept Head → HR). Check `leave_approver.routes.js` and the application service to determine actual approval depth. Document from the employee's perspective: who reviews, how many stages, what the employee sees at each stage.
- **Cancellation:** which statuses permit cancellation? Pending only, or approved-and-future too? Verify in the service.
- **Balance rules:** carry-forward, lapse, encashment — verify in `leave_balance.service.js`. Encashment is likely **HR-side only**; if there is no employee endpoint, mark it not available to employees.
- **Export leave history:** source MD claims export for any date range. Check for an export endpoint. Likely absent → correction.

**Cross-feature:** Attendance (holidays, comp-off), Payroll (unpaid leave affecting salary — verify before asserting), Personal Dashboard.

**Quality checks:** every field in `submitRequestSchema` documented with required/optional/allowed values; every leave status defined; balance semantics accurate; approval flow matches code; dynamic leave-type behavior correctly stated; every unimplemented source-MD claim demoted to Section 13.

---

### FEATURE 3 — Payroll, Salary & Tax

**Input:** `Employee_md/Payroll & Salary Module.md` → **Output:** same name
**Template:** A · **Status:** Implemented and extensive — **no UI whatsoever**

**Critical note:** this is the largest gap between existing documentation and reality, in the opposite direction from the others. The source MD is ~2 KB and covers payslips. The implementation is ~20 Employee endpoints including a full statutory tax-declaration subsystem. Per the project memory note, payroll Phase 4 (statutory/tax) is largely complete. **This document should grow the most.** There is also **no Employee payroll screen** — the disclosure block matters most here.

**Source investigation**
- `src/modules/payroll/routes/payroll_self.routes.js` — full Employee surface
- `src/modules/payroll/validators/payroll_self.validator.js` — `upsertBankAccountSchema`, `upsertDeclarationSchema`, `recordProofsSchema`, `switchRegimeSchema`, `runIdParamSchema`, `idParamSchema`, `financialYearParamSchema`
- `src/modules/payroll/services/` — self-service, statutory calculation, tax declaration, loan, bonus services
- `src/modules/payroll/models/` — payslip, salary structure component, loan, declaration status enums

**Public investigation:** `public/md_payrolls/combined_api_analysis.md`, `implementation_plan.md`, `phases/` (verify phase docs against code — a completed plan is not proof of shipped behavior). Confirm no payroll UI exists in `public/pages/` for the employee.

**Workflows (group under clear H2s)**
- *Salary information:* view current salary structure; view salary structure history
- *Bank details:* view bank account; add or update bank account
- *Payslips:* view payslip list; view a specific payslip
- *Earnings:* view bonuses; view adjustments
- *Loans:* view loans; view installment schedule
- *Tax:* view tax summary; view tax projection; view monthly tax breakdown; view declaration; create or update declaration; submit declaration; record proofs; switch tax regime; download Form 16

**Verification specifics**
- **Bank account update:** the only Employee **write** operation on payroll data besides tax. Document every field in `upsertBankAccountSchema`, all validation (IFSC format, account number rules), and — critically — whether an update requires HR re-verification or takes effect immediately. Check for a payroll-lock window during which changes are blocked.
- **Tax regime switching:** determine the allowed values (old/new), whether switching is restricted by financial-year window, and whether it is once-per-year. Employees ask this constantly.
- **Declaration lifecycle:** map the exact statuses (draft → submitted → proofs recorded → verified?). Determine whether a submitted declaration can be edited. Determine the proof-submission window. Document as a status table.
- **Form 16:** verify what `financialYear` format is accepted and what happens when Form 16 is not yet generated — that error message is high-value.
- **Payslip download:** source MD claims PDF download. Verify whether the endpoint returns structured data or a PDF. **Do not claim PDF download unless the code produces a PDF.**
- **Entitlement:** all payroll endpoints are behind `payroll.access`. Document the subscription-gating limitation.

**Likely corrections:** payslip PDF/download claims; "annual salary slips"; anything about tax filing (the platform supports declarations, not filing).

**Cross-feature:** Attendance (clock-out feeds hours→payroll), Leave (unpaid leave impact — verify), Profile (bank details vs. profile data ownership).

**Quality checks:** all ~20 endpoints covered; every writable field documented with validation; declaration lifecycle statuses complete and unambiguous; regime-switch rules exact; Form 16 availability conditions stated; the no-UI disclosure is prominent, not buried.

---

### FEATURE 4 — Profile Management

**Input:** `Employee_md/🔧 Key Functions Under Profile Management.md` → **Output:** same name (preserve the emoji exactly)
**Template:** A · **Status:** Partial — much narrower than the source MD claims

**Source investigation**
- `src/modules/organization/routes/self_service.routes.js` — the **entire** Employee surface: `GET /me`, `PATCH /me`, `GET /directory`
- `src/modules/organization/controllers/self_service.controller.js`
- `src/modules/organization/services/` — the self-profile update path, especially the **field whitelist**
- `src/modules/employee/models/employee_profiles.model.js` — full field set (for distinguishing viewable from editable)
- `src/modules/organization/routes/employee.routes.js` — to confirm which profile operations are **HR/Manager-only**

**Public investigation:** `public/md_organization/4_org_employee_api.md`; `api_registry.md` rows 19–21; `public/md_core-workflows/employee-hierarchy.md`.

**The single most important verification**

`api_registry.md` states `PATCH /me` updates "whitelisted" personal fields and that **`department`, `designation`, `gender`, `marital_status`, and `employee_code` are locked**. Open the service and extract the **exact** whitelist. Then produce two tables:

- **Fields an employee can view** on their own profile
- **Fields an employee can edit themselves** — with every locked field named, and a statement that locked fields are changed by HR

This directly answers "why can't I change my designation?", a top-frequency support question.

**Also verify**
- **Employee Directory:** confirmed public-safe — name, email, avatar, role, department, designation, work location only. Document exactly these fields and state that salary, contact numbers, and personal data are **not** visible. Check for search/filter/pagination parameters.
- **Reference data:** `GET /departments` and `GET /locations` are Employee-accessible. Document as read-only reference lookups.
- **Document upload:** source MD claims ID proof/certificate/resume upload. **There is no document module.** Verify no upload endpoint exists on the self-service path. If none → this claim moves to Section 13.
- **Bank details:** owned by Payroll (`PUT /me/bank-account`), not Profile. Point to the Payroll document; do not duplicate.
- **Employment history / promotions / role changes:** source MD claims employees track these. Verify whether `GET /me` returns any history. If not → correction.
- **Educational qualifications / professional experience:** verify presence in the model **and** in the update whitelist. Present in the model but absent from the whitelist means view-only, not editable.

**Cross-feature:** Payroll (bank account, salary structure), Settings & Preferences (password/account vs. profile — draw a hard boundary), Employee Panel, Personal Dashboard.

**Quality checks:** editable vs. locked field lists are exact and complete; directory field list exact; every unsupported source-MD claim demoted; no overlap with the Settings document.

---

### FEATURE 5 — Personal Dashboard

**Input:** `Employee_md/Personal Dashboard Features.md` → **Output:** same name
**Template:** A · **Status:** Partial — a **composed** feature with no backing module

**Special handling:** there is no dashboard module in `src/modules`. The dashboard is a **prototype UI** that composes other features' endpoints. This is the one feature where `employee_dashboard.html` is the primary evidence.

**Investigation**
```bash
grep -n "fetch(\|/api/v1/\|function \|id=\"" public/pages/employee_dashboard.html
```
Enumerate every section rendered and every endpoint it calls. Confirmed sections: Today's Attendance, Recent Punch History, Regularization Requests (+ New Request modal), My Leave History, My Leave Wallet (+ Apply for Leave modal), Monthly Snapshot, Monthly Trend, This Week, Daily Log modal, Log Out.

**Document as:** what the Employee Dashboard displays, section by section, and which feature each section belongs to. Each section gets a **pointer** to its owning feature document rather than a restatement of its rules. This is the cleanest way to keep a composed feature from duplicating everything else.

**Verification specifics**
- **Customizable widgets:** source MD claims customization. There is no preference-storage endpoint. Almost certainly **not implemented** → Section 13.
- **Real-time notifications:** `notification` = 0 files in `src/modules`. **Not implemented** → Section 13. Correct the source MD.
- **Announcements:** `announcement` = 0 files. **Not implemented** → Section 13.
- **Tasks / upcoming holidays:** holidays exist via `/attendance/holidays`. Tasks do not. Verify each independently.
- **Prototype vs. product:** state clearly that the dashboard described is the reference prototype.

**Cross-feature:** Attendance, Leave (its two main data sources), Employee Panel (avoid overlap — the panel document is a *directory of features*, this one is *what the dashboard screen shows*).

**Quality checks:** every documented section verifiably exists in the prototype; no feature rules duplicated from Attendance/Leave; notifications/announcements/widgets correctly marked unavailable.

---

### FEATURE 6 — Employee Panel Overview

**Input:** `Employee_md/Employee panel.md` → **Output:** same name
**Template:** C (umbrella / index) · **Status:** Umbrella

**Purpose:** answer *"what is the Employee Panel and what can I do in it?"* Route the reader to the right feature document. **Contains no feature detail.**

**Structure**
```markdown
# Employee Panel — Overview and Module Directory
> [disclosure block]
## 1. What the Employee Panel Is
## 2. Modules Available to an Employee
   Table: Module | What it lets you do (one line) | Availability | Where the detail is documented
## 3. Modules Described in Planning Documents but Not Available
## 4. Joining Your Organization Through an Invitation
   Owns the invitation flow per Section 2.5.1: receiving the invite, validating the
   link, accepting it, new-user vs existing-user paths, and the expired /
   already-accepted / revoked failure cases. Employees never send invites.
## 5. How to Access the Employee Panel
   Sign-in, organization selection (multi-org supported — verify in auth routes)
## 6. Common Employee Questions About the Employee Panel
   Scope-level and onboarding only: "what can I do here", "why don't I see X",
   "how do I switch organization", "my invitation link is invalid", "my invite expired"
## 7. Verification Record
```

**Verification:** the module table must exactly match the Section 2.5 API surface. Any module row must be traceable to real endpoints. Source-MD claims of announcements, notifications, and document upload must appear in Section 3, not Section 2.

**Quality checks:** zero field-level or workflow-level detail; every module row links to a real output document; availability column matches every feature document's own status — **no contradictions**.

---

### FEATURE 7 — Core Functionalities / Capability Availability Matrix

**Input:** `Employee_md/Core Functionalities of HRMS Services.md` → **Output:** same name
**Template:** C · **Status:** Umbrella

**Purpose and differentiation:** near-duplicate of Feature 6. Differentiate as the **availability matrix** — the document that answers *"is capability X actually available to me?"* Feature 6 is a directory; this is a status register. Keep them structurally distinct so they do not compete for the same queries.

**Structure**
```markdown
# Employee Self-Service — Capability Availability Matrix
> [disclosure block]
## 1. How to Read This Availability Matrix
## 2. Capabilities Currently Available to Employees
   Table: Capability | Feature area | Availability | User interface available | Notes
## 3. Capabilities Available Only Through Subscription Plans
   attendance.access / leave.access / payroll.access gating, in user terms
## 4. Capabilities Performed by HR or Managers, Not Employees
   e.g. approving leave, granting comp-off, editing locked profile fields
## 5. Capabilities Not Currently Available
## 6. Common Employee Questions About Feature Availability
## 7. Verification Record
```

**Verification:** every row traced to the Section 2.5 surface map. Section 4 requires checking `authorize()` lists to confirm `employee` is genuinely excluded — this section is what prevents employees from being told they can approve their own leave.

**Quality checks:** matrix is exhaustive against the API surface; entitlement gating correct; no overlap in *framing* with Feature 6; no feature detail.

---

### FEATURE 8 — Settings & Preferences

**Input:** `Employee_md/Settings & Preferences.md` → **Output:** same name
**Template:** A, but expect a large Section 13 · **Status:** Partial — likely far thinner than claimed

**Source investigation**
- `src/modules/auth/routes/auth.routes.js` — password reset, OTP, Google sign-in, organization switching
- `src/modules/auth/validators/` — password rules (length, complexity) — high-value, employees hit these constantly
- `src/modules/organization/routes/self_service.routes.js` — `PATCH /me` is the only preference-ish write available
- `public/md_settings/org_settings_registry.md` — **read carefully**

**The key distinction this document must draw**

`org_settings_registry.md` catalogs organization-configurable settings. These are configured by **HR**, not employees, but they **determine what an employee experiences** (leave policies, attendance rules, geofencing, approval flows). Document them as:

> **Settings your organization controls that affect you** — an employee cannot change these, but they explain why behavior differs between organizations.

This is genuinely useful and answers "why does my colleague at another company see something different?"

**Verify and expect to demote**
- Notification preferences (email/SMS/in-app toggles) — `notification` = 0 files → **not implemented**
- Theme / dark mode / display preferences → check for any preference storage; likely **not implemented**
- Language / localization → likely **not implemented**
- Timezone preference → check whether it is a profile field or org-level
- Two-factor authentication → OTP exists for signup and password reset; verify whether a **user-controllable 2FA setting** exists. Likely not → do not present OTP as 2FA
- Password change while logged in → verify. Forgot-password exists; an authenticated change-password endpoint may not. **Important distinction** — check `auth.routes.js` carefully
- Google sign-in — verified present; document as an available sign-in method
- Organization switching — verified present (`switch-organization`); document as a real capability for multi-org employees

**Cross-feature:** Profile Management (hard boundary: Profile = personal data; Settings = account, security, sign-in, org-level configuration), Employee Panel.

**Quality checks:** account/security capabilities verified individually against auth routes; password rules exact; every unimplemented preference demoted; org-controlled settings clearly marked as not employee-editable; no duplication with Profile.

---

### FEATURES 9–14 — Not Implemented

Apply **Template B** to all six. Same protocol, different feature vocabulary.

| # | Input MD | Output MD | Confirm absence of | Legitimate alternative to mention |
| --- | --- | --- | --- | --- |
| 9 | `Document Management.md` | same | document module, upload endpoints, e-signature, acknowledgment tracking, expiry reminders | Supporting documents can be attached to a **leave request** if the leave type requires them — see Leave Management. Verify this first. |
| 10 | `Expense & Reimbursement.md` | same | expense module, claim submission, receipt upload, multi-currency, approval workflow | None in-platform. Note that "reimbursement" may appear as a **salary component** in a payslip, which is a different thing — see Payroll. |
| 11 | `Helpdesk & Support Tickets.md` | same | ticket module, categories, priorities, SLA, ticket chat | None. Employees use their organization's existing support channel. |
| 12 | `Performance & Appraisal.md` | same | appraisal module, KRA/OKR, self-appraisal, ratings, feedback | None. Note that performance-linked **bonus rules** exist in payroll and are configured by HR — an employee may see a resulting bonus via Payroll, but there is no appraisal feature. |
| 13 | `Training & Development.md` | same | training module, courses, enrollment, certificates, skill tracking | None. |
| 14 | `Communication & Collaboration.md` | same | chat, messaging, groups, announcements, surveys, feedback, suggestion box | None. Note that leave/regularization **remarks** fields exist within those workflows — that is not a messaging feature. |

**Verification per feature**

```bash
grep -ril "<term1>\|<term2>\|<term3>" src/modules
find src/modules -iname "*<term>*"
grep -rn "<term>" public/md_system/api_registry.md
```

Then: **open every matched file.** If matches are confined to unrelated modules (payroll components, leave attachments, bonus rules), record the match, record the false positive, and conclude not-implemented. Document the false positive in the Verification Record so the next person does not re-investigate.

**Uniform quality checks for 9–14**
- "Not currently available" appears in the **first sentence**
- **Zero** invented fields, workflows, statuses, or navigation
- Every FAQ answer reinforces unavailability
- Alternatives are real and verified, never speculative
- Document stays short — under ~2 pages. Length here is a defect, not a virtue
- No "coming soon" or roadmap language — no dated commitment exists in the repository

---

## 8. Cross-Feature Consistency

### 8.1 Shared glossary (working artifact — **not** an output document)

Before writing, build a glossary at `<scratchpad>/employee_glossary.md`. It is a consistency tool and must **not** be converted to PDF.

Record: term, single agreed definition, which documents use it, synonyms. Cover at minimum — Employee, Organization, Clock-in/out, Regularization, Comp-off, Overtime, Anomaly, Shift, Leave Type, Leave Balance, Leave Request, Payslip, Salary Structure, Salary Component, Tax Declaration, Tax Regime, Form 16, Directory, Department, Location, Pending/Approved/Rejected/Cancelled.

### 8.2 Consistency rules

1. **One definition per term**, across all 14 documents. If two documents need it, both use the identical definition sentence.
2. **Statuses are global.** "Pending" must mean the same thing in Leave and in Attendance regularization. If the code genuinely differs, **qualify the term** — "Pending (leave request)" vs. "Pending (regularization request)" — rather than letting one word carry two meanings.
3. **Permission statements are global.** "Employees cannot approve leave requests" must be phrased consistently everywhere it appears.
4. **Availability statements must match.** If Feature 6's directory says Expense is unavailable, Feature 10 must not hint otherwise.
5. **Every cross-reference must resolve.** If a document points to another feature document, that document must exist and must actually cover the referenced topic.

### 8.3 Final consistency sweep (after all 14 are drafted)

Run these across the output folder and resolve every hit:

```bash
# contradictory availability language
grep -rn "not available\|not implemented\|not currently" public/HRMS/Employee/Employee_md/

# leaked developer detail
grep -rniE "src/modules|\.service\.js|\.controller\.js|\.validator\.js|repository|middleware|authorize\(|requireFeature" public/HRMS/Employee/Employee_md/

# leaked raw API/HTTP detail
grep -rnE "/api/v1/|HTTP [0-9]{3}|\"success\":|errorCode" public/HRMS/Employee/Employee_md/

# banned orphan references
grep -rniE "this page|the above|as mentioned|below you|the form below|see above" public/HRMS/Employee/Employee_md/
```

Every hit is either a defect to fix or a deliberate, justified exception recorded in your notes.

---

## 9. Final Quality Gate

No document is complete until **every** item passes. Record pass/fail per document.

### 9.1 Existence and accuracy
1. The feature genuinely exists (or is correctly documented as not existing)
2. Every documented capability is reachable by the `employee` role — confirmed in `authorize()`
3. Every claim traces to code, an API doc, or the prototype
4. No capability from the source MD was carried over without independent verification
5. Every source-MD claim is bucketed RETAIN / CORRECT / EXPAND / DEMOTE / REMOVE

### 9.2 Completeness
6. Every Employee-reachable endpoint in the feature is documented or explicitly excluded with a reason
7. Every major workflow is documented in execution order
8. Every writable field is documented with required/optional, type, allowed values, defaults, constraints
9. Every status is defined with its meaning and what happens next
10. Every verbatim user-facing error message is captured
11. Prerequisites and preconditions are stated
12. Limitations are explicit, including subscription gating

### 9.3 Honesty
13. Nothing unimplemented is presented as available
14. Everything unimplemented is explicitly listed as unavailable
15. No navigation path is described for a feature with no UI
16. No screens, buttons, or modals are described unless present in `employee_dashboard.html`
17. Unverifiable claims were **omitted**, not softened
18. The disclosure block is present and prominent

### 9.4 Boundaries
19. No file paths, function names, table names, or architecture
20. No raw JSON, HTTP status codes, or endpoint paths (unless the Section 5.5 exception was explicitly approved)
21. No internal role constants or entitlement key strings
22. Feature boundaries respected — no merged features, no detail bleeding across documents

### 9.5 RAG readiness
23. Every H2 contains the feature name or an unambiguous noun phrase
24. Every section is comprehensible read in isolation
25. No orphan references
26. No table exceeds ~15 rows without being split under its own heading
27. Field name and field rules are never separated
28. Status and meaning are never separated
29. Synonyms appear naturally in prose
30. FAQ section present, in employee phrasing, 8–15 entries (Template A)
31. Verification Record appendix present and accurate
32. YAML frontmatter present and valid, with correct `role`, `status`, `ui_available`, and `tags` (Section 6.4)
33. Visible **Document Information** line present immediately after the H1 (Section 6.4)
34. Every FAQ entry is its own H3 phrased as the question, not a bolded list item (Section 6.5)
35. Every significant failure has its own H3 in the error section, with the stable error code named once in the body (Section 6.6)
36. No `/api/v1/...` paths and no HTTP methods anywhere in prose (Decision 2, Section 12)
37. All Section 6A verified facts are reflected accurately, with none of the superseded Section 7 assumptions carried through

---

## 10. Acceptance Criteria

### 10.1 Per document

A feature document is accepted when it correctly and verifiably answers:

| Question | Section that answers it |
| --- | --- |
| What does this feature do? | 1 |
| Is it available to me? | 2, 4 |
| Where do I find it? | 3 |
| What can I do here? | 4 |
| How do I perform this action? | 5 |
| What fields do I fill in? | 6 |
| Which fields are required? | 6 |
| What options can I select? | 6 |
| What happens after I submit? | 5, 10 |
| What does this status mean? | 7 |
| Why can't I do this? | 8, 12, 13 |
| What does this error mean? | 9 |
| Why is my list empty? | 11 |
| What are the limits? | 12 |
| Is this actually available? | 2, 13 |

Plus: all 31 quality-gate items pass; the document is self-contained; and **a reviewer with no repository access cannot find a claim they would have to take on faith.**

### 10.2 For the full Employee set

1. Exactly 14 feature documents produced (16 if the requester overrides Section 2.2)
2. Filenames preserved exactly, including spaces and the `🔧` emoji
3. Originals preserved in `Employee_md_original/`
4. Zero contradictions across documents — Section 8.3 sweep clean
5. Every cross-reference resolves
6. Terminology consistent per the glossary
7. Every one of the six not-implemented features unambiguously marked, with no invented mechanics
8. Every Employee-reachable endpoint from Section 2.5 is covered by exactly one document
9. Every document carries the disclosure block and a Verification Record
10. **The absolute bar:** no document, read alone by a RAG system, can produce an answer that tells an employee to use a feature that does not exist, or to click something that is not there

### 10.3 Spot-check before sign-off

Draft 20 realistic employee questions spanning all 14 features, including at least 5 about unimplemented features. For each, identify which document should be retrieved and confirm the answer would be correct.

Mandatory inclusions:
- "How do I submit an expense claim?" → must yield *not available*
- "How do I raise an IT ticket?" → must yield *not available*
- "Where do I see my performance rating?" → must yield *not available*
- "How do I upload my Aadhar card?" → must yield *not available* (with the leave-attachment nuance only if verified)
- "How do I change my designation?" → must yield *locked field, save appears to succeed but nothing changes, contact HR* (6A.6)
- "How do I change my password?" → must yield *sign out and use Forgot Password; no in-account option* (6A.8)
- "I clocked in from outside the office — was my attendance rejected?" → must yield *no, the punch was recorded; an anomaly was logged* (6A.1)
- "Can I apply for two hours of leave?" → must yield *no, only full-day and half-day* (6A.3)
- "I cancelled my approved leave but it still shows pending — why?" → must yield *cancellation of approved leave requires manager approval; status is cancellation_pending* (6A.4)
- "Why can't I switch my tax regime?" → must yield *your organization controls whether employees may switch* (6A.9)
- "Why does it say my profile is incomplete when I apply for this leave?" → must yield *demographic gating; gender/marital status not employee-editable; contact HR* (6A.5)
- "My invitation link says invalid — what do I do?" → must yield a real answer from Feature 6 (Section 2.5.1)

If any of these produces a confidently wrong answer, the set is **not** accepted.

---

## 11. Execution Order

| Phase | Work | Gate |
| --- | --- | --- |
| 0 | Verify Section 0 findings; read Section 6A and Section 12 (both settled — no approvals to seek); back up originals to `Employee_md_original/`; run the Section 12.1 emoji-filename smoke test | No-frontend confirmed; backup exists; emoji filename round-trips through the converter |
| 1 | Build the Section 2.5 API surface map (including the 2.5.1 invitation flow) and the Section 8.1 glossary | Every Employee endpoint enumerated |
| 2 | Features 9–14 (not implemented) — **do these first**: fast, and they pin down the availability boundary that every other document depends on | 6 Template B docs pass the gate |
| 3 | Features 1, 2 (Attendance, Leave) — largest, best-evidenced, have UI | 2 Template A docs pass the gate |
| 4 | Feature 3 (Payroll) — largest expansion, no UI | Passes the gate |
| 5 | Features 4, 5, 8 (Profile, Dashboard, Settings) | 3 docs pass the gate |
| 6 | Features 6, 7 (umbrellas) — **last**, so they can accurately reflect the other 12 | 2 Template C docs pass the gate |
| 7 | Section 8.3 consistency sweep + Section 10.3 spot-check | Zero contradictions; all 20 questions answered correctly |

**Why not-implemented features go first:** they define the negative space. Once you know with certainty that Expense, Helpdesk, Training, Performance, Communication, and Document Management do not exist, you will not accidentally reference them as dependencies in the implemented features' documents.

---

## 12. Settled Decisions — No Further Approval Needed

These were open questions during blueprint drafting. **All five are now decided by the requester.** Treat them as binding constraints, not preferences.

| # | Decision | Binding rule |
| --- | --- | --- |
| 1 | **Knowledge-base files: excluded** | `HRMS_Knowledge_Base.md` and `HRMS_Knowledge_Base.curated.md` produce **no** output documents. `HRMS_Knowledge_Base.pdf` already exists and its content is a compilation of the individual features; emitting duplicates would cause chunk duplication and semantic drift. **Final deliverable count: 14.** |
| 2 | **Audience: employees only** | Exclude HTTP methods and `/api/v1/...` route paths from all prose. The Section 5.5 exception is **not** taken. Developer jargon does not reach the end user. Section 6.6 error codes remain the sole sanctioned identifier, because they are returned to users. |
| 3 | **UI disclosure: keep as drafted** | Use the Section 0.4 block verbatim. It correctly sets expectations about prototype versus production interface. |
| 4 | **Output: overwrite in place** | Write to `public/HRMS/Employee/Employee_md/`, after copying originals to `public/HRMS/Employee/Employee_md_original/`. This preserves 1:1 parity with `Employee_pdf/` and keeps the existing conversion pipeline working. |
| 5 | **Not-implemented framing: no roadmap language** | Use "not currently available." No "coming soon," no planned dates, no speculative roadmap. No dated commitment exists in the repository to support such language. |

### 12.1 Build precaution — UTF-8 filenames on Windows

Feature 4's filename is `🔧 Key Functions Under Profile Management.md`, containing a non-BMP emoji (U+1F527) plus spaces. The corresponding `Employee_pdf/🔧 Key Functions Under Profile Management.pdf` already exists, so the current pipeline handled it once — but confirm it still does after your rewrite.

Before the full conversion run, verify on this **one file first**:

1. The MD→PDF tool reads the path without a `UnicodeEncodeError` or mangled-filename failure.
2. The emitted PDF filename retains the emoji and does not become `?` , `_`, or a mojibake sequence.
3. Any shell or script in the pipeline uses UTF-8 I/O. On Windows set `PYTHONUTF8=1` (or `PYTHONIOENCODING=utf-8`) for Python-based converters, and prefer passing paths as arguments over interpolating them into shell strings.
4. Git preserves the name — check `git status` shows the file normally rather than as an escaped byte sequence.

**Do not rename the file to avoid the problem.** The name must stay identical to preserve 1:1 parity with `Employee_pdf/` and the source MD set. If the converter genuinely cannot handle it, convert that one file via a temporary ASCII-named copy and rename the resulting PDF afterward — and record that workaround in the pipeline notes.
