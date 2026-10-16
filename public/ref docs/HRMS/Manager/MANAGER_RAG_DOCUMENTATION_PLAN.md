# Manager Role — RAG Source-of-Truth Documentation Implementation Plan

**Deliverable type:** Implementation blueprint (NOT the final documentation)
**Scope:** Manager role ONLY
**Input folder:** `public/HRMS/Manager/mds` (10 files)
**Output folder:** `public/HRMS/Manager/mds_for_rag` (10 files — one per input)
**Date prepared:** 2026-09-10

---

## 0. READ THIS FIRST — Baseline Reality Established By Inspection

This plan was written **after** inspecting the repository, not from assumptions. The implementation agent MUST internalise the following verified facts before touching any file, because they invalidate the naive reading of the input MDs.

### 0.1 Verified fact: this project is a backend-only REST API

- `package.json` has **no** frontend framework (no React/Vue/Angular/Next). Dependencies are Express 5, Sequelize, PostgreSQL, Redis, JWT, Joi, express-validator, Razorpay, AWS SES.
- `src/app.js` mounts exactly **five** feature modules:
  ```
  auth · organization · attendance · leave · payroll
  ```
- The only "UI" is a set of **static HTML demo/console pages** served from `public/pages` via
  `app.use(express.static(path.join(__dirname, '../public/pages')))`.
- **Consequence:** "user-facing behavior" for the Manager = **API contract behavior** (endpoints, roles, request fields, validation, statuses, errors) **plus** the two real Manager HTML consoles. It does **not** mean a rich SPA. The agent must NOT invent sidebars, breadcrumbs, drawers, KPI tiles, heatmaps, or responsive layouts that do not exist.

### 0.2 Verified fact: `src/modules/manager` is effectively empty

```
src/modules/manager/models/manager_profiles.model.js   ← the ONLY file
```
It is **not mounted** in `src/app.js`. There is no manager controller, service, route, or repository in that folder.

**Consequence:** Manager capability is **not** a module. It is a **role (`manager`) enforced across the attendance, leave, payroll, and organization modules.** The agent must look for Manager behavior in those four modules, never in `src/modules/manager`.

### 0.3 Verified fact: the 10 input MDs are pre-development wireframe templates, not product descriptions

Evidence found in the input files:
- `Dashboard Overview.md` contains stock-template SEO spam (`themeforest.net+7multipurposethemes.com+7…`), a "**Starter Template Recommendation**" advising *"bootstrapping with AdminLTE or ArchitectUI Bootstrap 5"*, and a "**Final Checklist Before Development**".
- `Employee Management Panel.md` is literally titled "**Template:**" and ends with "**How to Use This Template** — Copy the sections above into your documentation or project requirement doc."
- Multiple files contain OCR corruption from PDF extraction (`Profle` for Profile, orphaned `o` bullets, a mangled wireframe table).

**Consequence — the single most important rule in this plan:**

> The input MDs describe an **aspirational product that was never built**. They are **input hypotheses to be tested**, never source of truth. The default expectation for any claim in these files is **"unverified until proven by code."** The agent will find that a large fraction of claimed functionality **does not exist**, and must say so plainly rather than paraphrasing the template.

### 0.4 Verified Manager surface (the actual truth to document)

Established by reading route files, index mounts, and role constants:

| Area | Base path | Roles allowed | Feature gate |
|---|---|---|---|
| Manager attendance (write) | `/api/v1/attendance/manager` | `manager, hr, admin, super-admin` | `attendance.access` |
| Manager attendance (read) | `/api/v1/attendance/manager` | `manager, hr, admin, super-admin` | `attendance.access` |
| Leave approver | `/api/v1/leaves` | `manager, super-admin` | `leave.access` |
| Manager payroll | `/api/v1/payroll/manager` | `manager, hr` | `payroll.access` |
| Org employees (read + limited edit) | `/api/v1/organizations` | `HR_OR_MANAGER = ['hr','manager']` | — |

Verified Manager-callable endpoints:

**Attendance** — `GET /team/today`, `/team/history`, `/team/anomalies`, `/team/summary`, `/team/graph-data`, `/team/member/:userId/history`, `/team/member/:userId/summary`; `POST /anomalies/:id/resolve`, `/regularizations/:id/approve|reject`, `/overtime/:id/approve|reject`, `/comp-offs/:id/approve|reject`; `GET /regularizations/pending`, `/overtime/pending`, `/comp-offs/pending`.

**Leave** — `GET /team/requests/pending`, `/team/requests`, `/team/member/:userId/requests`, `/team/member/:userId/balances`; `POST /requests/:id/approve|reject`.

**Payroll (maker-checker: Manager proposes, HR approves)** — `GET /team/salary-structures`, `/employees/:userId/salary-structures[/current]`, `/salary-structures/proposals`, `/runs/:runId/team-summary`, `/runs/:runId/team-items`, `/employees/:userId/payslips[/:runId]`, `/adjustments`, `/bonus-rules`, `/loans`, `/loans/:id`; `POST /employees/:userId/salary-structures/propose`, `/salary-structures/:id/cancel`, `/employees/:userId/adjustments/propose`, `/adjustments/:id/cancel`, `/bonus-rules/propose`, `/employees/:userId/loans/recommend`.

**Organization** — `GET /employees`, `GET /employees/:id`, `PATCH /employees/:id` are `HR_OR_MANAGER`. But `PATCH /employees/:id/status`, `DELETE /employees/:id`, and `PUT /users/:id/department-transfer` are **`HR_ONLY`**.

Verified Manager UI pages: `public/pages/manager_dashboard.html` (708 lines) and `public/pages/payroll_manager_team.html` (270 lines). **These two files are the only real Manager screens in the product.**

### 0.5 Verified NON-existence (searched across `src/modules`)

| Claimed by input MDs | Grep result | Verdict |
|---|---|---|
| Recruitment / interviews / job postings | `recruit` = 0, `interview` = 0 files | **Not implemented** |
| Performance / appraisals / OKR / KPI | `appraisal` = 0, `kpi` = 0; `performance` hits are only the string `'performance_rating'` as a *bonus-rule population source that is explicitly skipped*; `candidate` hits are `_assembleCandidates` in bonus-rule logic | **Not implemented** |
| Notifications / announcements | `notification` = 0, `announcement` = 0 files. Email exists only as transactional SES utilities (`src/common/utilities/email.utils.js`, `src/infrastructure/aws-ses/`) used for invitations/OTP | **Not implemented** (no notification centre) |
| Reports / analytics / report builder | 41 `report` hits are **all** the reporting-manager hierarchy (`reporting_person`, `reporting_mappings`, `reporting_to_id`, `ReportingMappingRepository`). No reports module, no export, no report builder | **Not implemented** |
| Audit logs for Manager | Audit infrastructure is real (`AuditService`, `attendance_audit_logs.model.js`, `AuditLogsRepository`), but the **only** audit-log endpoint is `GET /api/v1/payroll/hr/audit-logs` gated by `hrAuth` | **Exists, but inaccessible to Manager** |

**The agent must not soften these findings.** A RAG system that answers "yes, Managers can post job openings" because a 2024 wireframe said so is a production defect.

---

## 1. Deliverable Contract

### 1.1 One input → one output, always

| Rule | Statement |
|---|---|
| R1 | Every file in `mds/` produces **exactly one** file in `mds_for_rag/`. 10 in → 10 out. |
| R2 | **Never** merge two features into one document. |
| R3 | **Never** create a combined "Manager master" document. |
| R4 | **Never** split one input into several outputs. If investigation proves an input genuinely conflates independent features, **flag it in the Deviation Register (§10) and stop for a human decision** — do not silently re-map. |
| R5 | A document whose feature turns out to be unimplemented is **still produced**. It becomes a **Not Implemented** document (§6.4). Deleting it would let the RAG fall back on the stale PDF and hallucinate. |

### 1.2 Output naming

Preserve the input basename exactly, so retrieval provenance stays traceable. Two filenames need normalisation:

- `📋 Attendance & Leave Management.md` → drop the emoji and leading space → `Attendance & Leave Management.md`. Emoji in filenames breaks some PDF toolchains and shell paths. **Record this rename in the Deviation Register.**
- `HRMS MANAGER PANEL.md` keeps its name.

---

## 2. Feature Inventory & Mapping (built from actual inspection)

10 files confirmed in `public/HRMS/Manager/mds`.

| # | Input MD | Feature it claims | Expected Output MD | Real source module(s) | Public resources | Verified status (pre-assessment) |
|---|---|---|---|---|---|---|
| 1 | `HRMS MANAGER PANEL.md` | Umbrella index of all Manager capabilities | `HRMS MANAGER PANEL.md` | `app.js` mounts; `routes/role_planes.js` | `public/pages/manager_dashboard.html`, `public/md_system/api_registry.md` | **Mixed** — rewrite as a capability index with per-area truth |
| 2 | `Dashboard Overview.md` | KPI tiles, headcount/attrition charts, alerts, quick links | `Dashboard Overview.md` | attendance (manager read), leave (approver) | `public/pages/manager_dashboard.html` | **Mixed** — a real dashboard exists but is an ops console, not the claimed KPI/attrition dashboard |
| 3 | `Employee Management Panel.md` | Full CRUD on employees, docs, status, transfers | `Employee Management Panel.md` | `organization/routes/employee.routes.js` | `public/md_organization/4_org_employee_api.md`, `public/md_core-workflows/employee-hierarchy.md` | **Partially implemented** — read + limited edit only; add/remove/status/transfer are HR-only |
| 4 | `📋 Attendance & Leave Management.md` | Team attendance, approvals, shifts, WFH, import/export | `Attendance & Leave Management.md` | `attendance/routes/manager_attendance*.routes.js`, `leave/routes/leave_approver.routes.js` | `public/md_attendance/4_manager_attendance_api.md`, `manager_dashboard.html`, `public/md_core-workflows/attendance-workflow.md` | **Largest genuinely implemented feature** |
| 5 | `Payroll & Compensation.md` | Run payroll, modify salary, bonuses, payslips | `Payroll & Compensation.md` | `payroll/routes/payroll_manager.routes.js` | `public/pages/payroll_manager_team.html`, `public/md_payrolls/phases/*` | **Implemented but propose-only** — Manager cannot run payroll |
| 6 | `Performance Management.md` | OKR/KPI, appraisals, reviews | `Performance Management.md` | — none — | — none — | **Not implemented** |
| 7 | `Recruitment Management Module.md` | Job posts, interviews, offers, onboarding | `Recruitment Management Module.md` | — none — | — none — | **Not implemented** |
| 8 | `Reports.md` | HR reports, custom builder, Excel/PDF export | `Reports.md` | — none — | — none — | **Not implemented** |
| 9 | `Notifications.md` | Email + in-system alerts | `Notifications.md` | — none — (SES is transactional only) | `src/common/utilities/email.utils.js` (context only) | **Not implemented** |
| 10 | `Audit Logs.md` | Manager action history, compliance reports | `Audit Logs.md` | `payroll` audit endpoint (HR-only), `attendance_audit_logs` model | `public/md_system/architecture.md` | **Exists but inaccessible to Manager** |

### 2.1 Overlap flags the agent must handle

- **#1 vs #2:** the umbrella panel doc and the dashboard doc both describe the landing experience. **Resolution:** #1 = capability index + role/access model + cross-links; #2 = the actual `manager_dashboard.html` screen. #1 must not restate dashboard widget detail; it links to #2.
- **#4 is a genuine two-feature file** (Attendance AND Leave). Per **R4**, do **not** split it. Document both inside it under clearly separated top-level sections, and flag it in the Deviation Register as a known conflation retained for the 1:1 rule.
- **#2 vs #4:** `manager_dashboard.html` is *also* the attendance/leave approval surface. **Resolution:** #2 documents layout, sections, and what the landing screen shows; #4 owns the approval workflows in depth. Neither duplicates the other; each cross-references.
- **#5 vs #3:** salary structure lives in payroll (#5), employment record lives in organization (#3). Keep the boundary at that line.

---

## 3. Source-of-Truth Hierarchy (binding conflict resolution)

When sources disagree, authority runs **strictly** in this order:

```
TIER 1 (decisive)  Route file + middleware chain   → does the endpoint exist, and can role `manager` reach it?
                   src/modules/*/routes/*.js, common/middlewares/auth.middleware.js,
                   require_feature.middleware.js, organization/routes/role_planes.js

TIER 2 (decisive)  Validator schema                → exact field names, required/optional, types, enums, defaults
                   src/modules/*/validators/*.js

TIER 3 (strong)    Controller + service            → business rules, statuses, side effects, error conditions
                   src/modules/*/controllers|services|utilities/*.js

TIER 4 (strong)    Model definitions               → ENUM value lists, nullability, constraints
                   src/modules/*/models/*.js

TIER 5 (corroborating) Static HTML consoles        → real user-visible labels, sections, button text
                   public/pages/manager_dashboard.html, payroll_manager_team.html

TIER 6 (corroborating) Project API docs            → intent, worked examples, response shapes
                   public/md_attendance, md_leave, md_payrolls, md_organization,
                   md_core-workflows, md_system, md_updates

TIER 7 (hypothesis only, NEVER truth) The input MD in Manager/mds
```

### 3.1 Resolution rules

1. **Tier 1 is absolute on existence and access.** If no route reaches the behavior with role `manager`, the feature is **Not Implemented for Manager** — regardless of how much supporting code, model, or documentation exists. Supporting code is not a feature.
2. **Tier 2 is absolute on field contracts.** Never describe a field, requiredness, or allowed value that is not in the validator schema (or, for enums, the model).
3. **Tier 5 wins for user-visible wording** — button labels, section titles, column headers — because those are what a Manager actually reads. If HTML says "Pending Comp Offs", document that exact label; do not invent "Compensatory Leave Approvals".
4. **Tier 6 loses to Tiers 1–4.** These docs are phase plans and can lead the implementation. If a `public/md_*` doc describes an endpoint that Tier 1 does not have, the endpoint does not exist.
5. **Tier 7 never wins anything.** An input-MD claim with no Tier 1–5 support is documented as **Not Implemented**, never as behavior.
6. **Insufficient evidence:** if a behavior cannot be settled at Tiers 1–5 within reasonable effort, the agent **must not guess**. Mark it `Status: Not Verified` in the document, add a one-line reason, and log it in the Open Questions register. **Omission is preferable to invention, but silent omission is not permitted** — an unverified item must be visibly marked.
7. **Never infer permission from a feature's name.** `manager_attendance.routes.js` admits `['manager','hr','admin','super-admin']`; `leave_approver.routes.js` admits `['manager','super-admin']`; `payroll_manager.routes.js` admits `['manager','hr']`. These are three *different* role sets on three "manager" surfaces. Read every chain individually.

### 3.2 Two verification traps specific to this codebase

- **Express 5 `req.query` is a getter.** Validators that reassign `req.query = validated` behave differently than on Express 4. When documenting filters/pagination, verify the query params are actually honoured by the controller rather than assuming the schema is applied.
- **Tenant + feature gating stacks on top of role.** `requireFeature('payroll.access')` means a Manager in an org whose plan lacks the entitlement gets denied **even with the correct role**. Every feature document must state this in **Permission Behavior**, because "why can't I see this?" is a top RAG question.

---

## 4. Implementation Status Model (mandatory vocabulary)

Every feature document declares exactly one **document-level** status, and may annotate individual capabilities with the same vocabulary.

| Status | Definition — assign ONLY when | Required evidence |
|---|---|---|
| `Fully Implemented` | Route reachable by `manager`, validator present, controller implements it, no TODO/stub | Route + validator + controller/service citation |
| `Partially Implemented` | Feature area exists for Manager but a material part of the claim is absent or HR-only | Cite what works AND what does not, each with a route reference |
| `Propose-Only (Maker-Checker)` | Manager can submit a proposal/recommendation but cannot enact it; HR approval required | Propose route + the HR approval route that completes it |
| `Read-Only for Manager` | Manager can view but not mutate | GET routes present, mutation routes absent or higher-role |
| `Inaccessible to Manager` | Capability exists in product but role `manager` is excluded | Cite the route and the role array that excludes `manager` |
| `Not Implemented` | No route, controller, or service delivers it | State the search performed and that it returned nothing |
| `Not Verified` | Could not be settled from Tiers 1–5 | State precisely what is unknown |

Prohibited: `Planned`, `Coming Soon`, `Future`, `Roadmap`, or any phrasing implying availability. If the input MD describes something aspirational, it is `Not Implemented` — full stop.

### 4.1 The absolute rule

> **Never present planned, incomplete, or unverified functionality as currently available Manager functionality.**
> Where a capability is absent, the document must say what a Manager should do instead (e.g. "Salary structure changes are enacted by HR; the Manager submits a proposal"). This turns a negative into a correct, actionable RAG answer.

---

## 5. Investigation Procedure (run per feature, in this order)

**Phase A — Read the input MD.** Extract every discrete claim into a checklist. Do not paraphrase yet. Note OCR corruption, template boilerplate, and stock-reference spam for deletion.

**Phase B — Locate the route surface.** Search `src/modules/*/routes/` for the feature. Read the full middleware chain top to bottom: `authenticate` → `authorize([...])` → `requireFeature(...)` → per-route validators. Record the exact role array and feature key. **If no route admits `manager`, jump to §6.4 and produce a Not Implemented document.**

**Phase C — Extract the contract.** For each reachable endpoint, read the validator schema: every field name, type, required/optional, enum values, defaults, min/max, and date formats. Then read the controller and service for business rules, status transitions, side effects, and error paths. Then read models for ENUM lists and constraints.

**Phase D — Extract real UI.** Read the relevant HTML console. Extract exact section headings, button labels, table column headers, modal titles, filter controls, and empty/error message strings. These become the user-facing vocabulary of the document.

**Phase E — Corroborate.** Read the matching `public/md_*` doc for worked examples and response shapes. Use for illustration only; never let it override Tiers 1–4.

**Phase F — Reconcile.** Walk the Phase A checklist. Mark each claim `Confirmed` / `Contradicted` / `Absent` / `Unverifiable`, each with a file reference. This table is the backbone of the document's accuracy.

**Phase G — Scope check.** Determine how "team" is resolved — via `user_reporting_mappings`, `reporting_relations.utils.js`, `attendance_access.utils.js`, `leave_access.utils.js`, `approval_chain.utils.js`. Document what a Manager sees (direct reports vs. whole org) and confirm the **IDOR/BOLA** guard: a Manager acting on a non-report must be rejected. State the observed behavior.

**Phase H — Write** to the §7 structure. **Phase I — Self-audit** against §9.

---

## 6. Required Document Structure

### 6.1 Front matter (every document)

```markdown
# Manager — <Feature Name>

**Role:** Manager
**Feature area:** <Attendance | Leave | Payroll | Employee Records | Platform>
**Implementation status:** <status from §4>
**API base path:** <exact base path, or "Not applicable — feature not implemented">
**Manager UI:** <public/pages/... , or "No dedicated screen">
**Last verified against source:** 2026-09-10
```

A one-paragraph **Summary in plain language** follows immediately — self-contained, naming the role and feature explicitly, because this paragraph is the highest-value retrieval chunk in the document.

### 6.2 Body sections (include only those that apply)

Feature Overview · Feature Purpose · Manager Access & Roles · Availability and Implementation Status · Navigation / Entry Point · Prerequisites · Complete Manager Workflow (numbered, end to end) · Screen & Section Structure · Actions Available to the Manager · Fields and Field Rules · Options and Allowed Values · Filters, Search, Sorting, Pagination · Statuses and Their Meanings · Validation Rules · Error Behavior · Success Behavior · Empty States · Permission Behavior (role, scope, entitlement) · What the Manager Cannot Do · Limitations · Dependencies on Other Manager Features · Common Manager Scenarios · FAQs · Terminology.

Do **not** force irrelevant sections. Add feature-specific sections where they improve accuracy.

### 6.3 Mandatory sections regardless of status

Every document must contain **Manager Access & Roles**, **Availability and Implementation Status**, **What the Manager Cannot Do**, and **Limitations**. These four carry most of the RAG's guard-rail value.

### 6.4 Structure for a `Not Implemented` feature (#6, #7, #8, #9, and largely #10)

These documents are short, blunt, and high-value. Required shape:

```markdown
# Manager — <Feature Name>

**Implementation status:** Not Implemented
**Manager UI:** None
**API base path:** None

## Current Availability
<Feature> is **not available** in the HRMS product. There is no <feature> module,
no API endpoint, and no screen for it. Managers cannot <primary claimed action>.

## What Was Verified
Searched all mounted modules (auth, organization, attendance, leave, payroll)
for <terms>. No route, controller, service, or model implements this capability.

## Why an Older Document May Suggest Otherwise
An earlier planning document described this feature as part of an intended
Manager panel. That document was a pre-development template and does not
reflect the built product.

## What a Manager Can Do Instead
<Nearest real capability, with a link to the correct feature document — or an
explicit statement that no equivalent exists.>

## Related Manager Features That Do Exist
<links>
```

**Rationale:** the stale PDFs are already in the RAG corpus. A document that only omits the feature leaves the hallucination unchallenged; a document that **explicitly negates** it corrects retrieval. This is why R5 forbids deleting these files.

---

## 7. RAG Authoring Rules

1. **Self-contained chunks.** Every H2/H3 section must make sense retrieved alone. Restate "Manager" and the feature name inside sections rather than relying on the title.
2. **Banned deixis:** "this page", "the above option", "as mentioned earlier", "the relevant button", "it", "there". Name the thing every time.
3. **Exact labels in bold**, exact API paths and field names in backticks. Never paraphrase a user-visible string.
4. **Tables for enumerable facts** — fields, statuses, roles, errors. One row per fact; no prose bundling.
5. **Statuses always defined with meaning + who sets it + what it allows next.**
6. **Numbered workflows**, one action per step, each naming the actor and the control used.
7. **Retrieval synonyms** — include a Terminology section mapping product terms to what users actually type ("comp off" / "compensatory off"; "regularization" / "attendance correction"; "reporting manager" / "line manager"). Place synonyms in prose once; do not keyword-stuff.
8. **No contradictions** within or across the set (§8).
9. **PDF-safe formatting:** no HTML, no nested tables, no emoji in headings (they survive poorly through PDF extraction — the existing corpus proves it), heading depth ≤ H3, tables ≤ 5 columns.
10. **No developer-only detail** — no schema DDL, no internal function names, no file paths, no SQL, no algorithm internals. Exception: API paths, field names, roles, and status enums, which are legitimately Manager-facing for an API product.
11. **State negatives explicitly.** "Managers cannot approve their own leave request" is a higher-value chunk than any positive statement.

---

## 8. Cross-Feature Consistency

Before finalising, build a shared-vocabulary table and apply it uniformly across all 10 documents:

- **Role names:** `manager`, `hr`, `employee`, `admin`, `super-admin`. Note the plane split — `hr` is top of the tenant; `admin`/`super-admin` are **platform** roles and are not tenant data actors. Never describe `admin` as a Manager's supervisor in HR workflows.
- **"Team"** must mean the same thing everywhere: the Manager's direct reports as resolved by reporting mappings. If any module scopes differently, state the difference explicitly in both affected documents.
- **Shared statuses** (`pending`, `approved`, `rejected`, `cancelled`) must carry identical definitions unless the code genuinely differs — in which case both documents state the difference and say why.
- **Maker-checker** must be described identically wherever it appears (payroll proposals, and any attendance/leave analogue).
- **Entitlement gating** (`attendance.access`, `leave.access`, `payroll.access`) must be phrased identically in every Permission Behavior section.
- **Dependencies are referenced, never duplicated.** Link to the owning document with one sentence of context.

**Consistency gate:** after all 10 drafts exist, re-read them as a set specifically hunting contradictions. Fix at the source of truth, not by softening the wording.

---

## 9. Per-Document Quality Gate

No document is complete until every line passes. Record the result in the completion report.

**Existence & access**
- [ ] Feature existence verified at Tier 1; status assigned from §4 vocabulary only
- [ ] Exact role array cited from the route file
- [ ] Feature-entitlement gate stated
- [ ] Team scoping / IDOR guard described
- [ ] No permission asserted from a feature name

**Contract accuracy**
- [ ] Every field traced to a validator schema; requiredness matches
- [ ] Every enum value traced to validator or model — no invented options
- [ ] Every status defined with meaning, setter, and next transition
- [ ] Validation, error, success, and empty behavior reflect controller code
- [ ] Every endpoint path verified against route + mount

**Truthfulness**
- [ ] Every input-MD claim marked Confirmed / Contradicted / Absent / Unverifiable
- [ ] Zero hallucinated functionality; zero unsupported assumptions
- [ ] Template boilerplate, stock-vendor references, and OCR artifacts removed
- [ ] Unverified items visibly marked, not silently dropped
- [ ] "What the Manager Cannot Do" populated

**RAG quality**
- [ ] Sections self-contained; no banned deixis
- [ ] Exact labels preserved; terminology and synonyms present
- [ ] PDF-safe formatting; no emoji headings
- [ ] No developer-only internals beyond the §7.10 exception
- [ ] Cross-links resolve to real sibling documents

**Scope**
- [ ] Exactly one feature; nothing merged, nothing split
- [ ] Output filename maps 1:1 to its input

---

## 10. Registers the Agent Must Maintain

Produce alongside the 10 documents (in `mds_for_rag/`):

1. **`_COMPLETION_REPORT.md`** — the §2 mapping table with final verified status per feature, plus quality-gate results.
2. **Deviation Register** (section within the report) — every departure from the input MDs, with evidence. Must already include: the emoji filename normalisation, the retained Attendance+Leave conflation (R4), and each Not Implemented determination.
3. **Open Questions register** — every `Not Verified` item with the precise unknown, for human follow-up.

---

## 11. Per-Feature Specifications

> Common to all: follow §5 Phases A–I, the §6 structure, §7 RAG rules, and the §9 gate. Below are only the **feature-specific** requirements.

---

### Feature 1 — `HRMS MANAGER PANEL.md`

**Identity.** Umbrella capability index for the Manager role. Output: same name. No single owning module.

**Investigate.** `src/app.js` (which modules are mounted); `src/modules/organization/routes/role_planes.js` (role constants and planes); the four manager-facing route files; `public/pages/manager_dashboard.html`; `public/md_system/api_registry.md`.

**Extract.** The complete, verified list of Manager capability areas with a status per area; the role/plane model (`manager` vs `hr` vs platform roles); the reporting-manager scoping concept; entitlement gating.

**Verify.** That each of the input's nine claimed areas maps to a real, Manager-reachable surface. Expect: Employee Management (partial), Attendance & Leave (yes), Payroll (propose-only), Performance (no), Recruitment (no), System & HR Settings (no — HR-only), Reports (no), Notifications (no), Audit Logs (HR-only).

**Document.** A capability matrix — one row per area, columns: Area · Manager status · Where · Document link. Then the access model, the scoping model, and an explicit **"Areas Managers do not have"** section. Correct the input's "Full Access / full administrative access" framing directly: the Manager is a **scoped approver and proposer over direct reports**, not an administrator.

**Do not.** Restate dashboard widget detail (belongs to #2) or workflow depth (belongs to #4/#5).

**Acceptance.** Answers "What can a Manager do in HRMS?" and "Do Managers have full admin access?" correctly, and routes every follow-up to the right sibling document.

---

### Feature 2 — `Dashboard Overview.md`

**Identity.** The Manager landing console. Output: same name. Sources: `public/pages/manager_dashboard.html` (primary), attendance manager-read + leave approver routes.

**Investigate.** Read all 708 lines of `manager_dashboard.html`. Extract every section heading, control, table column, modal, and message string. Confirmed real sections include: **Team Attendance Trend**, **Pending Regularizations**, **Pending Overtime**, **Pending Comp Offs**, **Pending Leave Requests**, **Team Payroll Management**, **Team Status Today**, **Active Anomalies**, plus a **Review Request** modal and a **Member Details** view. Map each section to the endpoint it calls (`/attendance/manager/team/summary`, `/team/graph-data`, `/team/anomalies`, `/regularizations/pending`, `/overtime/pending`, comp-offs, `/leaves/team/requests/pending`).

**Verify.** Each widget's data source and each action's endpoint. Confirm which controls mutate data and which only navigate. Verify the member-details drill-down against `/team/member/:userId/*`.

**Document.** Actual screen structure section by section, in the order they appear; what each section shows; what actions each offers; drill-down behavior; empty states.

**Correct explicitly.** The input claims KPI tiles for **Headcount** and **Attrition Rate**, a **Headcount Trend** line chart, an **Attrition Breakdown** bar chart, an **Attendance Heatmap**, **Company Announcements**, **Low Attendance / High Attrition alerts**, **Birthday reminders**, **Interviews Today**, **dismissible alerts**, and **chart filters by department/location**. Verify each against the HTML; document the ones that exist, and place the rest under **"Not available on the Manager dashboard"** with the correct status. Do not carry over the template's colour palette, font recommendations, AdminLTE advice, wireframe table, or "Final Checklist Before Development" — delete all of it.

**Acceptance.** Answers "What does a Manager see after logging in?" from the real screen, and answers "Can a Manager see attrition rate / announcements / today's interviews?" with a correct negative where applicable.

---

### Feature 3 — `Employee Management Panel.md`

**Identity.** Manager access to employee records. Output: same name. Source: `src/modules/organization/routes/employee.routes.js` + controllers/services/validators. Public: `public/md_organization/4_org_employee_api.md`, `public/md_core-workflows/employee-hierarchy.md`.

**Investigate.** The role constants in `role_planes.js` — specifically that `GET /employees`, `GET /employees/:id`, `PATCH /employees/:id` are `HR_OR_MANAGER`, while `PATCH /employees/:id/status`, `DELETE /employees/:id`, `PUT /users/:id/department-transfer` are `HR_ONLY`. Read the `PATCH /employees/:id` validator to establish **exactly which fields a Manager may change** — this is the single most important fact in the document. Check whether list/detail are scoped to direct reports or org-wide, via `reporting_relations.utils.js` and the controller.

**Verify.** Whether onboarding/invitation (`invitation.routes.js`, `onboarding.routes.js`) admits `manager` — the input claims an "Add Employee Wizard". Verify document upload exists at all for Managers (the input claims offer letters, ID proofs, contracts, certifications with view/download/replace/delete). Verify status history and activity-log tabs exist.

**Document.** Status: **Partially Implemented**. Cover: viewing the employee list (filters, search, pagination as validated), viewing a profile, the exact editable field set, and a prominent **What the Manager Cannot Do** section listing add, remove/delete, status change, and department transfer as **HR-only**, each with the reason (role gate).

**Correct explicitly.** The input's claimed Add/Remove wizard, offboarding checklist, exit-settlement capture, bulk editing, document management, and per-profile Activity Log tab must each be verified and, where absent, stated as not available to Managers. Delete the "Technical Notes" data-model section (developer-only), the "How to Use This Template" section, and the Stackby/envato/wrapbootstrap references.

**Dependencies.** Reporting hierarchy (#1), Attendance & Leave (#4) for team scoping, Payroll (#5) for the compensation boundary.

**Acceptance.** Answers "Can a Manager add or terminate an employee?" with a correct, reasoned **no**, and "What can a Manager edit on an employee profile?" with the exact validated field list.

---

### Feature 4 — `📋 Attendance & Leave Management.md` → `Attendance & Leave Management.md`

**Identity.** The core implemented Manager feature. **Two domains in one document** — retained under R4, flagged in the Deviation Register.

**Sources.** `attendance/routes/manager_attendance.routes.js`, `manager_attendance_read.routes.js`, matching controllers/validators/services, `attendance_access.utils.js`; `leave/routes/leave_approver.routes.js`, `leave_access.utils.js`, `approval_chain.utils.js`, `leave_request.validator.js`. Public: `public/md_attendance/4_manager_attendance_api.md`, `public/md_core-workflows/attendance-workflow.md`, `manager_dashboard.html`.

**Note the role asymmetry** and document it: attendance-manager admits `['manager','hr','admin','super-admin']`; leave-approver admits `['manager','super-admin']`. Verify and explain what this means for an HR user viewing leave approvals.

**Attendance — extract.** Team today, team history, team summary, team graph-data, team anomalies; member history and member summary (`/team/member/:userId/*`). Four approval workflows: **anomaly resolution**, **regularization**, **overtime**, **comp-off** — each with pending-list + approve + reject. Read `manager_attendance.validator.js` for `idParamSchema` and `approvalSchema` (establish whether a remark/reason is required on approve and on reject — document precisely). Read the read-validators for date-range, pagination, and filter parameters.

**Leave — extract.** Team pending requests, all team requests, member requests, member balances, approve, reject. Read the approval-chain utility to document **multi-level approval** if present, and what happens when a Manager is not the designated approver. Establish leave statuses and their transitions from the model enums.

**Verify.** Self-approval prevention; acting on a non-report (IDOR guard); approving an already-decided request (idempotency/duplicate handling); the effect of approval on leave balances and on attendance records.

**Document.** Two clearly separated top-level parts — **Part A: Team Attendance Management**, **Part B: Team Leave Management** — with a shared Terminology section. Full numbered workflows for all six approval flows. Status tables for each entity.

**Correct explicitly.** The input claims **Configure Shift Timings & Holidays** and **Import/Export Attendance Data**. Verify against `attendance/routes/hr_attendance.routes.js` — shifts, holidays, weekly-offs, roster, and policies pages exist under `attendance_hr_*.html`, indicating **HR-only** ownership. Document these as **Inaccessible to Manager** with the correct owner. Also verify the **Remote/WFH log tracking** claim and document the result.

**Acceptance.** Answers, correctly and specifically: how a Manager approves a regularization; the difference between overtime and comp-off approval; what a Manager sees in team attendance; whether a Manager can configure shifts (no); what happens to leave balance on approval; why an approval was rejected by the system.

---

### Feature 5 — `Payroll & Compensation.md`

**Identity.** Manager payroll participation under **maker-checker**. Output: same name. Source: `payroll/routes/payroll_manager.routes.js`, `payroll_manager.controller.js`, `payroll_manager.validator.js`, related services. Public: `public/pages/payroll_manager_team.html`, `public/md_payrolls/phases/*`.

**Central fact to establish first.** The Manager is a **proposer/recommender**, not an executor. Verify and document the full propose → HR approve → effect chain for each of: salary structure, adjustment, bonus rule, loan (note: loans use `recommend`, not `propose` — preserve that distinction in wording). Note the code comment that `hr` is admitted here so an HR user can exercise manager views without a second token, resolving to `global` scope — explain the user-visible consequence.

**Extract.** Read views: team salary structures, structure history, current structure, own proposals list, run team-summary, run team-items, employee payslips (single and per-run). Write actions: propose structure, cancel proposal, propose adjustment, cancel adjustment, propose bonus rule, recommend loan. List views: adjustments, bonus rules, loans, loan detail. From the validators, extract every field of `proposeStructureSchema`, `proposeAdjustmentSchema`, `proposeBonusRuleSchema`, `recommendLoanSchema` — names, types, requiredness, enums, effective-date rules.

**Verify.** Payslip visibility is restricted to **approved/paid runs only** and scoped to the caller's reports (the route comments assert this — confirm in the controller). Proposal statuses and which are cancellable. Whether a Manager can propose for a non-report. Bonus-rule population sources from `bonus_rules.model.js` — note that `performance_rating` is defined as an ENUM value but is **skipped wholesale** in `bonus_rule.service.js`; if a Manager can select it, document that it produces no population.

**Document.** Status: **Propose-Only (Maker-Checker)**. A prominent **What the Manager Cannot Do** listing: generate/run payroll, approve any proposal (including their own), modify salary structures directly, disburse loans, view unapproved run payslips.

**Correct explicitly.** The input claims **Generate Monthly Payroll**, **View/Modify Salary Structures**, **Process Bonuses/Incentives/Deductions**, **Manage Reimbursements and Benefits**, **Download Salary Reports & Payslips**. Each must be re-stated in maker-checker terms or marked HR-only. "Generate Monthly Payroll" is **Inaccessible to Manager** — cite `payroll_hr.routes.js`. Verify whether reimbursements/benefits exist for Managers at all.

**Acceptance.** Answers "Can a Manager change an employee's salary?" with the correct propose-only explanation; "How does a Manager request a bonus?"; "Why can't a Manager see this month's payslips?" (run not approved/paid); "Who approves a Manager's salary proposal?"

---

### Feature 6 — `Performance Management.md`

**Status: Not Implemented.** Use the §6.4 structure.

**Verification to perform and record.** Search all mounted modules for `performance`, `appraisal`, `okr`, `kpi`, `review`, `goal`, `feedback`, `rating`. Expected finding: the only `performance` occurrences are the ENUM value `'performance_rating'` in `payroll/models/bonus_rules.model.js` as a bonus-rule population source, which `bonus_rule.service.js` skips. Record this precisely — **and explicitly state that a bonus-rule ENUM value is not a performance management feature**, so a future reader does not mistake it for one.

**Correct explicitly.** OKR/KPI setting and tracking, appraisal scheduling and recording, performance reviews and feedback, performance reports, and training-need identification are all unavailable to Managers.

**Point instead to.** #4 (attendance/leave oversight) and #5 (bonus proposals) as the real levers a Manager has.

**Acceptance.** Answers "How does a Manager set OKRs / conduct an appraisal?" with an unambiguous statement that the capability does not exist in the product.

---

### Feature 7 — `Recruitment Management Module.md`

**Status: Not Implemented.** Use the §6.4 structure.

**Verification to perform and record.** Search for `recruit`, `interview`, `candidate`, `job`, `applicant`, `offer`, `hiring`, `vacancy`, `panel`, `onboard`. Expected: zero for recruitment concepts; `candidate` appears only as `_assembleCandidates`/`_loadCandidateProfiles` in payroll bonus-rule population — **not** job candidates. Record that distinction explicitly, since a naive grep would produce a false positive.

**Adjacent-but-different caution.** `organization/routes/onboarding.routes.js` and `invitation.routes.js` exist, but these are **organization onboarding and user invitation**, not recruitment. Verify whether `manager` is admitted; document the distinction so the RAG never conflates "invite a user to the org" with "recruit a candidate".

**Correct explicitly.** Creating/posting job openings, scheduling interviews, assigning panels, tracking candidate progress, and managing offer letters are all unavailable.

**Acceptance.** Answers "Can a Manager post a job or schedule an interview?" with a clear no, and correctly distinguishes org invitations from recruitment.

---

### Feature 8 — `Reports.md`

**Status: Not Implemented.** Use the §6.4 structure.

**Verification to perform and record.** Search for `report`, `export`, `csv`, `xlsx`, `analytics`, `dashboard-report`. Expected: all 41 `report` hits are the **reporting-manager hierarchy** (`reporting_person`, `reporting_mappings`, `reporting_to_id`, `ReportingMappingRepository`, `reporting_role`). Record this explicitly — it is the highest-risk false positive in the entire corpus, since "reports" (documents) and "reports" (direct reports) are homonyms. The document must state the distinction in its Terminology section.

**Nuance to document accurately.** Manager **read** endpoints do return aggregated data — `/attendance/manager/team/summary`, `/team/graph-data`, `/payroll/manager/runs/:runId/team-summary`. These are **in-product views**, not a reporting module: there is no report builder, no scheduled report, and no export. Document what aggregated views genuinely exist and link to #2/#4/#5, while marking the reporting **feature** as not implemented.

**Correct explicitly.** HR reports (headcount, turnover, leave, payroll), custom report builder, Excel/PDF export, and automated monthly reports are all unavailable.

**Acceptance.** Answers "Can a Manager export a headcount report?" with a correct no, while still surfacing the real team-summary views — and never confuses "reports" with "direct reports".

---

### Feature 9 — `Notifications.md`

**Status: Not Implemented** (as a Manager-facing notification feature). Use the §6.4 structure.

**Verification to perform and record.** Search for `notification`, `announcement`, `alert`, `inbox`, `push`, `subscribe`. Expected: zero notification/announcement modules. Then examine the genuine email infrastructure — `src/common/utilities/email.utils.js`, `src/infrastructure/aws-ses/email-provider.factory.js` — and `src/cron-jobs/` to determine **what transactional emails actually send and whether any is Manager-facing** (e.g. invitation, OTP, and any approval-related mail). Document only what is confirmed to send.

**Correct explicitly.** There is no in-system notification centre, no alert feed, no configurable thresholds, no low-attendance or high-attrition alerts, and no birthday/anniversary reminders. The input's claimed alert categories (leave requests, attendance exceptions, payroll discrepancies, birthdays) must each be marked unavailable.

**Point instead to.** The pending-approval sections on `manager_dashboard.html` (#2) are how a Manager discovers work awaiting action — this is the correct RAG answer to "how does a Manager know a leave request is waiting?"

**Acceptance.** Answers "Do Managers get notified about pending approvals?" accurately: no notification system; work is discovered via the dashboard's pending sections; plus any transactional email actually confirmed in code.

---

### Feature 10 — `Audit Logs.md`

**Status: Inaccessible to Manager.** Note this is **not** the same as Not Implemented — adapt the §6.4 structure accordingly and be precise about the difference.

**Verification to perform and record.** Audit infrastructure genuinely exists: `AuditService`, `attendance_audit_logs.model.js`, `attendance_audit_logs.repository.js`, `AuditLogsRepository`, `auditLogsQuerySchema`. But the **only** exposed endpoint is `GET /api/v1/payroll/hr/audit-logs`, gated by `hrAuth` — **role `manager` is excluded**. Confirm no other audit route exists in any mounted module. Also verify whether attendance audit logs surface anywhere Manager-reachable (e.g. embedded in an approval detail response) — if they do, document that narrowly and accurately.

**Document.** That Manager actions **are recorded** (approvals, proposals, and similar are audited server-side), but Managers **cannot view, search, or export audit logs**; audit-log access belongs to HR. This is a nuanced and genuinely useful RAG answer: *your actions are logged, you just can't read the log.*

**Correct explicitly.** The input's claims — viewing all Manager actions, tracking logins/changes/approvals, generating compliance audit reports — are all unavailable to Managers.

**Acceptance.** Answers "Can a Manager view audit logs?" (no — HR only) and "Are a Manager's approvals recorded?" (yes) without conflating the two.

---

## 12. Execution Order

Do the implemented features first — they establish the shared vocabulary that the negative documents reference.

1. **#4 Attendance & Leave** — largest real surface; sets team/scoping/approval/status vocabulary
2. **#5 Payroll** — establishes maker-checker vocabulary
3. **#3 Employee Management** — establishes the HR-vs-Manager boundary
4. **#2 Dashboard** — assembles the above into the real landing screen
5. **#1 Manager Panel index** — written last among the positives, since it indexes all of them
6. **#10 Audit Logs**, then **#6, #7, #8, #9** — the negatives, which cross-link into the finished positives
7. **§8 consistency pass** across all 10
8. **`_COMPLETION_REPORT.md`** with mapping table, deviation register, and open questions

---

## 13. Acceptance Criteria

### 13.1 For the complete Manager set

- Exactly 10 output documents, 1:1 with inputs, no merges or splits
- Every document carries a §4 status backed by cited route-level evidence
- Every claim in every input MD has been adjudicated Confirmed / Contradicted / Absent / Unverifiable
- Zero occurrences of unimplemented functionality described as available
- Consistent role, scope, status, and entitlement vocabulary across all 10
- All cross-references resolve; no large duplication between documents
- All template boilerplate, stock-vendor spam, and OCR artifacts removed
- Completion report with mapping table, deviation register, and open questions delivered
- PDF-conversion-safe formatting throughout

### 13.2 For each individual document

The document enables the RAG to answer correctly:

1. What is this Manager feature? 2. Is it actually implemented and available to Managers? 3. Where does a Manager find it? 4. Which roles can access it, and under what entitlement? 5. Which employees' data can a Manager see? 6. What actions can a Manager take? 7. Step by step, how is each action performed? 8. Which fields are required, and what values are allowed? 9. What does each status mean, and what comes next? 10. What happens after submission — and who acts next? 11. What happens when the operation fails, and what do the errors mean? 12. Why might an action be unavailable to this Manager? 13. What can a Manager explicitly NOT do here, and who does it instead? 14. What are the limitations?

**A document fails acceptance if it answers any of these from the input MD rather than from verified source.**

---

## 14. Standing Prohibitions for the Implementation Agent

- Do **not** modify any file in `public/HRMS/Manager/mds` (inputs are preserved as historical artifacts)
- Do **not** modify source code, tests, or application behavior
- Do **not** implement missing functionality — the task is documentation of what exists
- Do **not** treat existing MD or PDF content as truth
- Do **not** infer a feature's existence from a model, ENUM, utility, or planning doc — only a Manager-reachable route proves it
- Do **not** infer Manager permission from a feature or file name
- Do **not** merge, split, or drop documents
- Do **not** invent UI that does not exist in `public/pages`
- Do **not** guess when evidence is insufficient — mark `Not Verified` and log it
