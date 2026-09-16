# Payroll Phase 5 — Frontend Implementation Plan (Reimbursements, Benefits & Documents)

**Status:** Not started · **Written:** 2026-09-15 · **Branch baseline:** `dev` @ `42ea71e`
**Covers:** backend API **#128–#166** plus the Phase 5 additions to existing endpoints (#37, #42, #44, #53–#56, #106, #114, #126, settings #22/#23).
**This file is the single source of truth for Phase 5 frontend work.** When it disagrees with a phase doc, this file wins until the backend answers the questions in **Appendix A**. When the backend answers, update this file first, then the code.

> **Numbering note.** An earlier frontend pass (2026-09-12) called its governance work "Phase 5" (Bank Verification, Audit Log) and its placeholder work "Phase 6". In this file, **Phase 5 means the backend phase: API #128–#166.** The governance screens are finished and nothing here changes them. Three of the four placeholder pages from that pass are replaced here. `PayrollReportsPage` belongs to backend Phase 6 and stays a placeholder.

---

## 0. Contract decisions — read before anything else

### 0.1 The Phase 5 documents describe two different APIs

| | **Contract A** | **Contract B** |
|---|---|---|
| Sources | `phase5_implementation_plan.md` §6, `phase5_api_analysis.md`, `api_registry.md` rows #128–#166 (uncommitted), `PAYROLL_BACKEND_RESPONSES.md` (authoritative, describes shipped code) | Phase 5 section of `combined_api_analysis-3.md` (lines 1035–1597), parts of `phase5_business_walkthrough.md` |
| Benefit paths | `/hr/benefit-plans`, `/hr/benefit-plans/:id/enrollments`, `/hr/employees/:userId/benefit-enrollments[/:id/end]` | `/hr/benefits/plans`, `/hr/benefits/enrollments[/:id]` |
| File paths | `/hr/attachments/:id/view-url`, `/me/attachments/:id/confirm`, `/me/reimbursements/claims/:id/items/:itemId/attachments` | `/hr/documents/upload-url`, `/documents/confirm`, `/documents/:id/url` |
| HR #137 | Attachment view URL | "Mark claim paid" (off-cycle payout) |
| Final claim status | `processed` | `paid` |
| Category limits | `max_amount_per_claim`, `max_amount_per_period` + `limit_period` (`month`/`financial_year`), `receipt_required_above_amount` | `max_claim_amount`, `monthly_limit`, `annual_limit` |
| Approve body | `{ items: [{ item_id, approved_amount, item_status, approver_remarks }], remarks }` | `{ item_approvals: [{ item_id, approved_amount, remarks }], notes, payout_period_month }` |
| Enrollment | `{ user_id, enrolled_from, overrides }`; status `active/ended/cancelled` | `coverage_tier`, `dependents[]`, `policy_number`, `start_date`; status `active/cancelled/expired` |
| Money | DECIMAL strings in rupees (`"4500.00"`) | integers that look like paise (`650000`) |

**Decision FD-1: build against Contract A.** Four sources agree on A, including `PAYROLL_BACKEND_RESPONSES.md`, which is the backend's description of the code on `development`. That file already emits Contract A names: `payouts.approved_claims_count`, `benefit_deductions_enabled`, `reimbursement_payout_lookahead_months`, `engine_version: 5`, `REIMBURSEMENT_ALREADY_APPLIED`, `DUPLICATE_BENEFIT_ENROLLMENT`, and component `source: benefit | reimbursement`. The frontend already reads these (`runMeta.js` `PAYOUT_FIELDS`, `payoutReadinessNotes`, `WARNING_META.DUPLICATE_BENEFIT_ENROLLMENT`). Contract B also breaks the project-wide money convention (strings in rupees). It also includes features the backend plan puts out of scope: off-cycle payout (Phase 7), coverage tiers and dependents (not planned at all).

**Gate:** Appendix A question **Q-1** must be answered before step 1 of §15. The build limits the damage if the answer changes:
- Every path lives only in `src/shared/api/payroll.api.js`.
- Every response field is read in `reimbursementMeta.js` / `benefitMeta.js` normalizers.
- A contract change is therefore a three-file change, not a screen rewrite.

### 0.2 Things the walkthrough promises that Contract A cannot do — do not build them

| Walkthrough promise | What Contract A actually does | Frontend behaviour |
|---|---|---|
| "Mark Paid Directly (Off-Cycle)" | No endpoint. Off-cycle payout is Phase 7 (plan §1.2). | Not built. No button, no disabled button. |
| HR picks the payout month | The server resolves it at final approval (plan §6.4). The body has no month field. | After approval, show the month the server returned. |
| Coverage tier, member/card ID, dependents, policy number, helplines, policy documents | None of these fields exist. | Not built. |
| A monthly **and** an annual cap on one category | One `max_amount_per_period` with `limit_period`. | Form offers one period cap plus a month/financial-year choice. |
| Headroom subtracts claims still waiting for approval | Only `approved` and `processed` claims count (plan §5.1). | The Limits tab says "Only approved claims are counted." |
| Status `paid` | Status `processed`. | UI label for `processed` is **"Paid"** (plain language); code compares against `processed`. |
| Enrollment status `expired` | `ended`. | Label `ended` as "Ended". |
| Combined Form 16 Part A + B download | No PDFs in Phase 5 (Phase 6). | Part A **view** link only. |
| Employee is "notified" | No notification API. | Status is visible in the claim list only. |
| HR "override" approval at level 1 | `403 NOT_YOUR_APPROVAL_LEVEL` on the HR route. | HR sees "Waiting for the manager"; no override button (see Q-10). |

### 0.3 Contract A gaps that change what the frontend can ship

| # | Gap | Effect | Plan |
|---|---|---|---|
| **G5-1** | The HR Form 16 Part A **upload** (#147 variant A) creates a `pending` attachment whose `user_id` is the employee. #163 confirm is owner-only (`user_id === req.user.id`). **No HR endpoint can confirm it.** | An uploaded Part A PDF stays `pending` forever, which means invisible. | Ship the **"Link TRACES URL"** variant (#147 variant B, stored `available` at once). Build the upload variant behind `PART_A_UPLOAD_ENABLED = false` in `payrollAttachments.js` until Q-2 is answered. |
| **G5-2** | Self declaration GET (#122) is not listed as gaining `attachments[]`; only HR #106 is. | After a reload, an employee cannot see which proofs they uploaded. | Read `items[].attachments` defensively from #122. If absent, show only the files uploaded in this session, with the note "Uploaded proofs appear here once HR's copy is refreshed." Asked as Q-3. |
| **G5-3** | #158 replaces the **whole** item set, and `items` is required. Replacing items soft-deletes their receipts. A title-only edit therefore also deletes receipts. | Silent loss of receipts. | Call #158 only when the draft is dirty. If any item has receipts, confirm first: "Saving changes removes the N receipts already attached. You'll need to upload them again." Asked as Q-4. |
| **G5-4** | Claim, enrollment and team-benefit list rows carry `user_id` only (same root cause as gap G-2). | Rows would show UUIDs. | HR screens: `useEmployeeDirectory().nameOf`. Manager screens: `useTeamNames()` plus `resolvePerson()`. Never render a UUID. |
| **G5-5** | Enrollment status `cancelled` has no writer in Contract A (#146 sets `ended`). | A "Cancel enrollment" action would have no endpoint. | Only "End cover" is built. `cancelled` rows display read-only. |

### 0.4 What was taken from `phase5_implementation_plan.md` and what was not

It is a **backend** plan. Not applicable to this repo:
- migrations, models, repositories, services, locks, the S3 adapter, `node:test` suites
- the engine steps (6c / 8a′ / 8f)
- deployment notes, except the CORS item in §14

Applied to the frontend:
- endpoint semantics (§6), the claim state machine (§6.5), payout month resolution (§6.4), and the error codes (§14)
- the attachment handshake and its TTLs (§5.4)
- **D-31**: a reimbursement is paid on top of net and is **not** part of gross
- **D-36**: no proration; any month an enrollment touches is charged in full
- **D-37**: benefit plans have no tax effect
- **EC-24**: an out-of-scope id and a missing id return the same `403`

The frontend states D-31, D-36 and D-37 to users at the moment they matter (§7, §9).

---

## 1. Current Payroll Architecture (Phases 1–4)

### 1.1 Stack and conventions

- **React 18 + Vite + React Router 7, plain JavaScript (`.jsx`/`.js`).** There is **no TypeScript**, no React Query, no Redux and no form library. "Types" are JSDoc comments plus normalizer functions that read response fields defensively. Phase 5 does not add TypeScript.
- **Tailwind, purple theme.** Pages use `bg-white rounded-2xl border border-slate-100 shadow-sm` cards, labels `text-[11px] font-bold text-slate-500 uppercase`, and fields with `fieldCls`.
- **Wording.** Plain language ("Waiting for approval", "Paid by the company"). Empty values render **"N/A" or 0, never "—" or "-"** (`displayValue`, `formatDate`, `formatPeriod`).
- **Lint:** `eslint.config.js` forbids an un-awaited `window.confirm` and a bare `confirm`. The repo has about 259 old lint errors, so check new code with `npx eslint <files>`. There is **no test runner** (`package.json` has only `dev`, `build`, `lint`, `deploy`).

### 1.2 Folder layout

```text
src/
├── routes/AppRoutes.jsx                    flat <Route path> list, grouped by workspace
├── shared/
│   ├── api/client.js                       request(): BASE_URL + Bearer + JSON, throws Error{status,data}
│   ├── api/payroll.api.js                  one `payrollAPI` object, grouped by phase, buildQuery()
│   ├── auth/permissions.js                 WORKSPACE_ROLES, canAccessWorkspace
│   ├── contexts/AuthContext.jsx            useAuth() → { user: { id }, role, orgId }
│   ├── attendance/normalize.js             unwrap, listFrom, normalizePaginated, personName   ← reused by payroll
│   ├── attendance/usePagedList.js          paged fetch state (stale-guard, page reset)         ← reused by payroll
│   ├── attendance/useTeamNames.js          manager: user_id → name from team-today list
│   ├── components/DetailDialog.jsx         row preview + DetailSection/Grid/Stats/Table/Text/Pill, RowOpenButton, rowPreviewProps
│   ├── components/ReasonDialog.jsx         required-text actions (z-170)
│   ├── components/{Skeleton,DashboardTopBar,DashboardSidebar,FeatureNotAvailable}.jsx
│   └── utils/{payrollErrors,formatUtils,orgEmployees,promisePool}.js
└── roles/
    ├── hr/payroll/
    │   ├── screens/*.jsx                   one default-export page per route; its dialogs/tabs live in the same file
    │   ├── runMeta.js, variablePayMeta.js, fyUtils.js, ctcBudget.js
    │   └── useEmployeeDirectory.js, useToast.js, PayrollToast.jsx, PeriodPicker.jsx, CtcBudgetBar.jsx
    ├── manager/payroll/screens/*.jsx
    └── employee/payroll/screens/*.jsx
```

### 1.3 Page → API → UI flow (the pattern Phase 5 copies)

Reference implementation: `PayrollAdjustmentsPage.jsx`, the newest pattern.

1. **Load.** A `useCallback` loader with a request-id ref (or `usePagedList`) calls `payrollAPI.x(params)`. `request()` unwraps nothing, so the page applies `normalizePaginated(res, keys, params)` (lists) or `res?.data ?? res` (records). A stale response is dropped when `reqId !== reqRef.current`.
2. **Render.** States are `Skeleton` while loading, an error panel with "Try again" on failure, and a table. An empty state has two messages: filtered vs none. Each row spreads `rowPreviewProps(open, label)` and ends in one `RowOpenButton` ("Review" when the row waits on the viewer, else "View").
3. **Detail.** `DetailDialog` opens with the list row immediately, then fetches the full record. Its footer actions stay disabled until the full record arrives. A destructive action sits on the left (`sm:mr-auto`), the primary action on the right. When no action applies, the footer shows `DetailFooterNote` explaining why.
4. **Mutate.** A `guarded(key, run, failMessage)` wrapper uses a busy ref to block double submission. It asks `await window.confirm(...)` for simple confirmations, or opens `ReasonDialog` when the backend requires text. Then it calls the API, shows `showToast(message)`, closes the detail and reloads the list silently. On failure it shows `payrollErrorMessage(err)`, reloads the list, and reloads the detail if it is still open.
5. **Forms.** State comes from `emptyForm()`. `validateX(form)` returns an error map, shown after the first submit (`touched`). A server error appears inline (`serverError`). A `savingRef` guards against double submit. A payload builder sends only what the contract accepts. The backend silently strips unknown keys.

### 1.4 Two generations of pages

| Generation | Pages | Traits |
|---|---|---|
| **Rebuilt (2026-09-14)** | Adjustments, Bonus Rules, Run Dashboard, Run Detail | `useToast`+`PayrollToast`, `DetailDialog`, `ReasonDialog`, `payrollErrorMessage`, `normalizePaginated`/`usePagedList`, `RowOpenButton` |
| **Older** | Loans, Tax Declarations, Year-End, My Tax, all manager and employee payroll pages | inline `Toast`, custom modals, `err.message` |

**Rule FD-2:** new Phase 5 pages follow the **rebuilt** generation. When Phase 5 touches an older page, new code follows the rebuilt helpers (`payrollErrorMessage`, `DetailDialog` pieces), but the rest of the page is **not** refactored.

### 1.5 Layers (z-index) — do not change

| Layer | z | Used for |
|---|---|---|
| Form dialogs opened from a page | `z-[120]` | `AdjustmentFormDialog`, Phase 5 editors |
| `DetailDialog` | `z-[140]` | row previews |
| Forms stacked on a preview | `z-[150]`/`z-[160]` | Phase 5 `ClaimDecisionDialog` (160), `AttachmentViewerDialog` (165) |
| `ReasonDialog` | `z-[170]` | required-reason actions |
| `PayrollToast` | `z-[210]` | feedback |

### 1.6 Permissions today

- **Route level:** `ProtectedRoute workspace="hr|manager|employee"` with `WORKSPACE_ROLES`. HR may open manager and employee workspaces; managers may open employee workspaces.
- **No feature-level permission system in the frontend.** The backend authorizes every call (`hr` only on `/hr`, `manager,hr` on `/manager`, any tenant role on `/me`, plus `payroll.access`). Screens hide actions the backend would refuse and map `FORBIDDEN` / `FEATURE_NOT_AVAILABLE` to readable errors.

### 1.7 Already Phase 5-aware (keep as-is)

These were built on 2026-09-14 from `PAYROLL_BACKEND_RESPONSES.md`:
- `PayrollRunDashboard` → `payoutReadinessNotes(eligibility.payouts)` (#37)
- `PayrollRunDetailPage` → "Reimbursements & benefits" preview block via `PAYOUT_FIELDS` (#42)
- `runMeta.js` → `COMPONENT_SOURCE_LABEL.benefit/reimbursement`, `WARNING_META.DUPLICATE_BENEFIT_ENROLLMENT`
- `payrollErrors.js` → `REIMBURSEMENT_ALREADY_APPLIED`, and `STATUTORY_COMPONENT_NOT_ASSIGNABLE` wording that names benefit plans and categories

---

## 2. Phase 5 Scope

Phase 5 adds three things and connects them to the Phase 2–4 engine.

1. **Reimbursement claims.**
   - HR keeps a category catalog with limits, a receipt rule and a taxability flag.
   - Employees write draft claims with line items and receipts, then submit them.
   - A claim is approved by the manager (level 1), then HR (level 2); HR only when the chain collapses.
   - Either approver may lower an item's amount or reject an item.
   - At final approval the server fixes the **payout month**. The claim is then paid in that month's payroll run: **added to net pay, never part of gross** (D-31). The claim becomes `processed` when that run is paid.
2. **Benefit plans and enrollments.**
   - HR defines flat monthly employee and employer contributions per plan.
   - HR enrolls employees and ends their cover.
   - The payroll engine charges every month an enrollment touches, with no proration (D-36), but only while `benefit_deductions_enabled` is on.
   - Managers see their team's enrollments; amounts are hidden when compensation visibility is off.
   - Employees see their own enrollments and this year's deductions.
3. **Secure documents (S3, pre-signed URLs).** One mechanism serves:
   - receipts on claim items
   - proofs on tax declaration items (completes Phase 4)
   - Form 16 Part A (completes Phase 4)

   Files go browser → S3 directly and are viewed through URLs that expire after 5 minutes.

**Connections to existing screens:**
- Payroll Settings gains 3 keys.
- The Run Detail payslip preview must show reimbursements as "paid on top".
- Payslips (employee, manager) gain reimbursement and benefit blocks.
- Tax Declarations (HR) can open proofs.
- My Tax (employee) can upload proofs and open Part A.
- Year-End (HR) can attach Part A.
- The Run Dashboard readiness notes already cover claims and enrollments.

**Out of scope:** everything in §0.2, PDFs and reports (Phase 6), and a notification badge in the manager Approvals Inbox (it counts attendance queues only; adding payroll is not requested).

---

## 3. Required Pages

Phase 5 needs **4 main pages**:
- 2 new HR pages
- the placeholder Team Reimbursements page (manager), rewritten
- the placeholder My Reimbursements page (employee), rewritten

It also touches **8 existing pages**. No page exists only because an endpoint exists: 39 endpoints map to 4 pages plus shared dialogs.

**Page decisions:**
- **FD-3.** HR claims and categories share one page as tabs (like `TaxConfigurationsPage`). Benefits get their own page. `BenefitsAndReimbursementsPage.jsx` is deleted. Its route `/dashboard/hr/payroll/benefits` now points to the new Benefits page.
- **FD-4.** Team benefits (manager) are a tab on the existing Team Reimbursements route. This follows `ManagerAdjustmentsPage`, which groups tabs, so no new manager page is needed.
- **FD-5.** The employee's claims, limits and benefits are tabs on the existing My Reimbursements route. This follows `MyTaxAndInvestmentsPage`.
- **FD-6.** Managers and HR also file their own claims. The self endpoints accept any tenant role, and the self-approval rules (EC-50) only matter for them. So `MyReimbursementsPage` is **also mounted inside the manager and HR workspaces**. This is the pattern attendance self-service already uses (`/dashboard/hr/my-attendance`, `/dashboard/manager/attendance`). Without it, a manager's or HR user's own claim cannot be created from the UI.

### 3.1 HR — Reimbursements *(new)* · `PayrollReimbursementsPage.jsx`

- **Route:** `/dashboard/hr/payroll/reimbursements` · tab in `?tab=claims|categories` (default `claims`)
- **Purpose:**
  - HR reviews every claim in the organisation and takes the HR approval level.
  - HR keeps the category catalog employees claim against.

**Tab "Claims"**

Sections:
- Header, with a "Categories" tab button.
- Filter bar: status, employee, category, pay month, submitted from/to, a search box for the current page, and Refresh.
- Paginated claims table.
- Claim `DetailDialog`.

Actions:
- Approve (opens `ClaimDecisionDialog`)
- Reject (`ReasonDialog`)
- View receipt (`AttachmentViewerDialog`)

APIs: #133 list, #134 detail, #135 approve, #136 reject, #137 view URL, #129 (category filter options).

Reuse: `DetailDialog` family, `ReasonDialog`, `useToast`/`PayrollToast`, `useEmployeeDirectory`, `usePagedList`, `periodOptions`, `payrollErrorMessage`.

**Tab "Categories"**

Sections:
- "New category" button.
- Active/inactive filter plus search.
- Categories table.
- Category `DetailDialog`, with Edit and Deactivate/Reactivate in the footer.
- `CategoryFormDialog` (create/edit).

APIs: #128 create, #129 list, #130 detail, #131 update / reactivate (`is_active: true`), #132 deactivate, `getComponents` (optional catalog mapping).

### 3.2 HR — Benefits *(new)* · `PayrollBenefitsPage.jsx`

- **Route:** `/dashboard/hr/payroll/benefits` (existing route, new element) · `?tab=plans|employees` (default `plans`)
- **Purpose:** HR defines benefit plans, enrolls employees, ends cover, and sees what each plan costs.

**Tab "Plans"**

Sections:
- A banner when `benefit_deductions_enabled` is off: "Benefit deductions are switched off, so nothing is charged yet. Turn them on in Payroll Settings." Read from `getSettings()`.
- "New plan" button.
- Filters: active, benefit type. Search.
- Plans table.

The plan `DetailDialog` contains:
- Stats: members, monthly cost (#140).
- The plan's terms.
- A members table (#144, paginated, status filter), where each active row has "End cover".
- Footer: Edit, Enroll employee, Deactivate/Reactivate.

Dialogs: `PlanFormDialog`, `EnrollDialog`, and the end-cover `ReasonDialog`.

APIs: #138, #139, #140, #141, #142, #143, #144, #146.

**Tab "By employee"**

Sections:
- Employee search: the directory including leavers, as on `YearEndClosurePage`.
- The chosen employee's enrollments table (#145, paginated), with "End cover" on active rows.
- "Enroll in a plan" (`EnrollDialog` with the employee preset).

APIs: #145, #146, #143, #139 (plan choices).

### 3.3 Manager — Team Claims & Benefits *(rewrite)* · `TeamReimbursementsPage.jsx`

- **Route:** `/dashboard/manager/payroll/reimbursements` (unchanged) · `?tab=claims|benefits`
- **Purpose:** the manager approves or rejects level 1 of their team's claims, and looks up team cover.

**Tab "Claims to review"**

Sections:
- Filters: status (default "Submitted"), pay month. Search.
- Paginated table.
- Claim `DetailDialog` (#149), with category limits shown.

Actions: Approve (`ClaimDecisionDialog`), Reject (`ReasonDialog`), View receipt.

APIs: #148, #149, #150, #151, #152.

**Tab "Team benefits"**

- If `aggregates_only`: headcount stat plus a plan mix table, with the note "Your organisation hides team pay details, so only totals are shown."
- Otherwise: paginated members table.

API: #153.

Reuse: `DetailDialog`, `ReasonDialog`, `useTeamNames`/`resolvePerson`, `usePagedList`, `useToast`/`PayrollToast`, and the shared claim components (§6).

### 3.4 Employee (also manager/HR self-service) — My Claims & Benefits *(rewrite)* · `MyReimbursementsPage.jsx`

- **Routes:**
  - `/dashboard/employee/payroll/reimbursements` (unchanged)
  - `/dashboard/manager/my-reimbursements` (new mount)
  - `/dashboard/hr/my-reimbursements` (new mount)
  - All three use `?tab=claims|limits|benefits`.

**Tab "My claims"**

Sections:
- "New claim" button.
- Filters: status, pay month.
- Paginated table.
- Claim `DetailDialog` (#157), showing the approval timeline, item decisions and pay month.

Footer actions by status:
- draft → Edit, Submit, Discard
- submitted / under_review → Withdraw
- other statuses → footer note

`ClaimEditorDialog`:
- title
- items table: category, date, merchant, description, amount
- per item: receipt upload, view, delete
- receipt and limit hints
- Save draft, Save & submit

APIs: #154 (category choices + hints), #155, #156, #157, #158, #159, #160, #161, #163, #164, #165.

**Tab "Spending limits"**

A table of active categories with their rules, used and remaining amounts. API: #154.

**Tab "My benefits"**

Stats (financial year, deducted this year, active enrollments) and a card per enrollment. API: #166.

### 3.5 Existing pages modified

| Page | Change | APIs |
|---|---|---|
| `PayrollSettingsPage` | New section "Reimbursements & benefits" with three settings: approval levels (1/2), payout look-ahead months (0–6), benefit deductions on/off (confirm when turning on) | #22 / #23 (registry #51–#53) |
| `PayrollRunDetailPage` → `RunItemDialog` | Split non-taxable reimbursement lines out of "Earnings" into a new "Reimbursements (paid on top of net pay)" section. Add reimbursement, benefit employee and benefit employer figures. Add a net-pay explanation line. | #44 |
| `TaxDeclarationsPage` (HR) | Verification modal: per-item "Proofs" list with View (#137) | #106, #137 |
| `YearEndClosurePage` → `EmployeeTaxPanel` | Part A block: show the current `part_a_attachment` from #114 with View (#137). "Link TRACES copy" (#147 variant B). "Upload PDF" (#147 variant A) behind the flag (G5-1). | #114, #147, #137 |
| `MyTaxAndInvestmentsPage` | Declarations tab: per-item proof upload / view / delete while draft, submitted or under_review. Form 16 tab: "View Part A" when `part_a_attachment` is present. | #122, #162, #163, #164, #165, #126 |
| `MyPayslipsPage` | Detail modal: "Reimbursements" and "Benefits" blocks and the net-pay explanation. List card: reimbursement line when > 0. | #55, #56 |
| `TeamPayslipsPage` | Same blocks in the report payslip detail | #53, #54 |
| `PayrollRunDashboard` | *(optional, 5 lines)* "Review claims" link beside the "waiting for approval" note, to `/dashboard/hr/payroll/reimbursements?tab=claims&status=under_review` | #37 (already consumed) |

---

## 4. File-Level Implementation Plan

**Placement rule FD-7.** Code used by more than one role goes where cross-role payroll code already lives: `src/shared/utils/*` (like `payrollErrors.js`, `orgEmployees.js`) and `src/shared/components/*` (like `DetailDialog.jsx`, `ReasonDialog.jsx`). This plan does **not** create a `src/shared/payroll/` folder. HR-only helpers stay in `src/roles/hr/payroll/`. Manager and employee pages may import `useToast`, `PayrollToast` and `PeriodPicker` from `src/roles/hr/payroll/`. Moving them to `shared/` is a later cleanup, not Phase 5 work.

### 4.1 `[NEW]` files

| File | Purpose |
|---|---|
| `src/shared/utils/reimbursementMeta.js` | Plain-language claim status labels and pills. `claimStage(claim)`: who the claim waits on, derived from `status`, `current_level`, `total_levels`. `claimActions(claim, { audience, viewerId })` is the state machine from §9 (the `runMeta.runActions` pattern). Also: approval-row labels, `limitText(category)`, `receiptRuleText(category)`, `LIMIT_PERIOD_LABEL`, `CLAIM_STATUS_FILTERS`, `ITEM_STATUS`. Normalizers: `normalizeClaim`, `normalizeClaimDetail` (items, approvals, attachments, `category_limits`), `normalizeHeadroomRow` (#154 `{category, period_key, consumed, remaining}`). `limitViolations(err)` and `receiptProblem(err)` read error details defensively. `parseMoney(value, { allowZero })`. `itemBucketKey(item, limitRows)` maps an item to its `category_limits` row. `isOwnClaim(claim, viewerId)`. |
| `src/shared/utils/benefitMeta.js` | `BENEFIT_TYPE_LABEL` (health_insurance → "Health insurance", …), `ENROLLMENT_STATUS` meta, `effectiveContribution(enrollment, plan)` using `override != null ? override : plan amount` (a 0 override means free), `normalizePlanDetail` (#140 `{plan, active_enrollment_count, monthly_cost_total}` or flat), `normalizeTeamBenefits` (#153 both variants), `chargeNoticeForStart(date)` / `chargeNoticeForEnd(date)` (D-36 sentences), `NO_TAX_EFFECT_NOTE` (D-37). |
| `src/shared/utils/payrollAttachments.js` | `ALLOWED_TYPES` (jpeg, png, webp, pdf), `PART_A_TYPES` (pdf), `MAX_BYTES = 10485760`, `ACCEPT_ATTR`. `fileProblem(file, types)` returns a plain message or "". `contentTypeOf(file)`: `file.type`, else inferred from the extension, else "". `uploadFile({ issue, confirm, file })`: issue URL → S3 `PUT` → confirm; returns the confirmed attachment and throws a typed `UploadError` with `stage: issue|put|confirm`. `putToSignedUrl(url, file, requiredHeaders)` uses bare `fetch`: no Authorization header, no `Content-Length` header (the browser forbids setting it and derives it from the Blob). `openAttachment(getUrl, id, { disposition })`. `PART_A_UPLOAD_ENABLED = false` (G5-1). |
| `src/shared/components/ClaimDetailSections.jsx` | Read-only body for every claim preview. Exports `ClaimStats`, `ClaimItemsTable` (category, date, merchant, claimed, approved, item status, remarks, receipts with a View button), `ApprovalTimeline` (levels with role, who, when, remarks; pending and skipped rows), `CategoryLimitsTable` (`category_limits[]`), `PayoutSection` (pay month, "in payroll run", paid on). Built only from `DetailSection` / `DetailTable` / `DetailGrid` / `DetailPill`. |
| `src/shared/components/ClaimDecisionDialog.jsx` | Approve with trimming (HR and manager). z-160 form stacked on the claim `DetailDialog`. Per item: Approve/Reject toggle, amount (≤ claimed), remark (required when trimmed or rejected). Live limit check against `category_limits[]`, an overall remark, and a summary line. Escape uses capture like `ReasonDialog`. Props: `claim`, `onSubmit(payload)`, `busy`, `error`, `violations`, `onClose`, `levelLabel`. |
| `src/shared/components/AttachmentViewerDialog.jsx` | z-165 viewer. Fetches a view URL on open. Renders `<img>` for images, `<iframe>` for PDFs, and a link for `storage_backend: reference`. Buttons: "Open in new tab" (anchor) and "Download" (re-fetch with `disposition=attachment`). Handles expiry: the URL is never reused. Props: `attachment`, `getViewUrl(id, params)`, `onClose`. |
| `src/shared/components/AttachmentUploadButton.jsx` | File picker plus the upload flow: busy spinner, inline error, retry. Props: `issue(meta)`, `confirm(id)`, `types`, `label`, `disabled`, `onUploaded(attachment)`. Used by the claim editor, My Tax proofs and Year-End Part A. |
| `src/roles/hr/payroll/screens/PayrollReimbursementsPage.jsx` | §3.1 page. Local components: `ClaimsTab`, `CategoriesTab`, `CategoryFormDialog`, `validateCategory`. |
| `src/roles/hr/payroll/screens/PayrollBenefitsPage.jsx` | §3.2 page. Local components: `PlansTab`, `EmployeesTab`, `PlanFormDialog`, `EnrollDialog`, `validatePlan`, `validateEnrollment`. |

### 4.2 `[MODIFY]` existing files

| File | Change |
|---|---|
| `src/shared/api/payroll.api.js` | Replace the commented speculative Phase 5 stubs and their "UNVERIFIED" banner with a `// Phase 5: Reimbursements, Benefits & Documents — API #128–#166` section (§11.1). Keep the Phase 6 stubs. |
| `src/shared/utils/payrollErrors.js` | Add every Phase 5 `errorCode` (§13.2). Append the server message for `NO_OPEN_PAYOUT_PERIOD` (it names the months tried), as is already done for `PERIOD_PARTIALLY_LOCKED`. |
| `src/routes/AppRoutes.jsx` | Import the two new HR pages. Point `/dashboard/hr/payroll/benefits` at `PayrollBenefitsPage`. Add `/dashboard/hr/payroll/reimbursements`, `/dashboard/hr/my-reimbursements`, `/dashboard/manager/my-reimbursements`. Remove the `BenefitsAndReimbursementsPage` import. |
| `src/shared/components/DashboardSidebar.jsx` | HR "PAYROLL & COMP": add "Reimbursements" (`HiReceiptRefund`) and "Benefits" (`HiHeart`) after "Loans & Advances", and "My Claims & Benefits" at the end. Manager: rename "Team Reimbursements" to "Team Claims & Benefits" and add "My Claims & Benefits". Employee: rename "Reimbursements" to "Claims & Benefits" (`HiReceiptRefund`). |
| `src/roles/manager/payroll/screens/TeamReimbursementsPage.jsx` | Full rewrite (§3.3). |
| `src/roles/employee/payroll/screens/MyReimbursementsPage.jsx` | Full rewrite (§3.4). Reads `useAuth().role` only to pick the page subtitle; the data is always "me". |
| `src/roles/hr/payroll/screens/PayrollSettingsPage.jsx` | Add the section from §7.8. Keep sending the full settings object (existing behaviour). |
| `src/roles/hr/payroll/screens/PayrollRunDetailPage.jsx` | In `RunItemDialog`: `earnings = byType("earning")`, `reimbursements = byType("reimbursement")`, plus a new section and figures (§5.4). |
| `src/roles/hr/payroll/screens/TaxDeclarationsPage.jsx` | Proof list per item plus `AttachmentViewerDialog` (HR view URL). |
| `src/roles/hr/payroll/screens/YearEndClosurePage.jsx` | Part A attachment block in `EmployeeTaxPanel`. |
| `src/roles/employee/payroll/screens/MyTaxAndInvestmentsPage.jsx` | Proof uploads in `DeclarationsTab`; Part A view in `Form16Tab`. |
| `src/roles/employee/payroll/screens/MyPayslipsPage.jsx` | Reimbursement and benefit blocks (read defensively). |
| `src/roles/manager/payroll/screens/TeamPayslipsPage.jsx` | Same blocks. |
| `src/roles/hr/payroll/variablePayMeta.js` | Add `"REIMBURSEMENT"` and `"BENEFIT"` to `RESERVED_COMPONENT_CODES` (backend plan §5.5, `422 RESERVED_COMPONENT_CODE`). |
| `public/ref docs/api_registry.md` | When each screen ships, tick the UI columns for #128–#166 (`[ ✅ ]`), as Phase 4 did. |

### 4.3 `[DELETE]`

| File | Why |
|---|---|
| `src/roles/hr/payroll/screens/BenefitsAndReimbursementsPage.jsx` | The "not live yet" placeholder is replaced by §3.1 and §3.2. `FeatureNotAvailable` itself stays (used by `PayrollReportsPage`). |

### 4.4 `[REUSE]` without change

- `DetailDialog.jsx` and all its exports: `DetailSection`, `DetailGrid`, `DetailStats`, `DetailTable`, `DetailText`, `DetailPill`, `RowOpenButton`, `DetailFooterNote`, `rowPreviewProps`, `displayValue`
- `ReasonDialog.jsx`
- `Skeleton.jsx`, `DashboardTopBar.jsx`
- `useToast.js`, `PayrollToast.jsx`, `PeriodPicker.jsx`
- `useEmployeeDirectory.js`
- `variablePayMeta.js`: `periodOptions`, `currentPeriod`, `isPeriod`, `parseAmount`, `matchesEmployee`, `sameMoney`, `componentCodeProblem` (pattern only)
- `runMeta.js`: `toCount`, `plural`, `prettifyCode`, `PAYOUT_FIELDS`, `payoutReadinessNotes`
- `fyUtils.js`
- `formatUtils.js`: `formatMoney`, `formatPeriod`, `formatDate`
- `normalize.js`: `normalizePaginated`, `listFrom`, `unwrap`, `personName`, `employeeCode`, `isUuid`
- `usePagedList.js`, `useTeamNames.js` (`useTeamNames`, `resolvePerson`)
- `useAuth()` (`user.id` for own-claim checks)

---

## 5. API Integration Plan

All paths are relative to `/api/v1/payroll`. `payrollAPI` function names are fixed in §11.1.

**Envelopes:**
- Records: `{ success, message, data }`
- Lists: `{ success, message, data: [], pagination: { total, page, limit, total_pages } }`, with `pagination` as a **sibling** of `data`

Some Phase 5 lists (#129, #139, #153 full variant) document `data: { count, rows }` instead. **Always** read lists with `normalizePaginated(res, ["rows", "records", "items"], params)` or `listFrom(res, ["rows", "records"])` so both shapes work.

**Money:**
- Arrives as strings with 2 decimals.
- Is sent as numbers with at most 2 decimals, built with `parseMoney`. This matches Phase 3, which the backend accepts.
- A cleared optional cap is sent as `null`, never omitted. An omitted key keeps the old value.

**Errors:** every failure goes through `payrollErrorMessage(err, fallback)`. Only the codes in §13.2 have dedicated wording.

### 5.1 HR — `/hr` (role `hr`)

| # | Method · Path | Business purpose | Consumer | Called when | Request | Important response | After success | Errors to handle |
|---|---|---|---|---|---|---|---|---|
| 128 | `POST /reimbursements/categories` | Create an expense category | `PayrollReimbursementsPage` → `CategoryFormDialog` | "Save category" in create mode | `{ name, code, description?, is_taxable, requires_receipt, receipt_required_above_amount?, max_amount_per_claim?, max_amount_per_period?, limit_period, component_id?, is_active }` | created category | Close dialog · toast "Category added. Employees can claim against it now." · reload #129 | `CATEGORY_CODE_EXISTS` (inline on the code field) · `STATUTORY_COMPONENT_NOT_ASSIGNABLE` · `COMPONENT_NOT_FOUND` · `VALIDATION_ERROR` (inline banner) |
| 129 | `GET /reimbursements/categories` | Catalog list | Categories tab table; Claims tab category filter | Tab mount; `is_active` filter change; after #128/#131/#132 | query `{ is_active? }` | `rows[]` or array | Render table. Filter options use all categories (inactive labelled "(inactive)"). | Load error panel with retry |
| 130 | `GET /reimbursements/categories/:id` | Full category for preview/edit | Category `DetailDialog`; `CategoryFormDialog` edit | Row open (list row shown first, then merged); "Edit" | — | category incl. `component_id`, `receipt_required_above_amount` | Merge into the open detail; seed the edit form | `CATEGORY_NOT_FOUND` → close detail, toast, reload list |
| 131 | `PUT /reimbursements/categories/:id` | Change limits, rules or taxability; reactivate | `CategoryFormDialog` (edit); detail footer "Reactivate" | "Save changes"; "Reactivate" (await confirm) | every editable field except `code` (caps sent as `null` when cleared); reactivate = `{ is_active: true }` | updated category | Toast "Category updated. Claims already submitted keep their old rules." · reload list + detail | `CATEGORY_NOT_FOUND` · `STATUTORY_COMPONENT_NOT_ASSIGNABLE` · `VALIDATION_ERROR` |
| 132 | `DELETE /reimbursements/categories/:id` | Deactivate (never hard-delete) | Category detail footer "Deactivate" | Click → `await window.confirm("Stop new claims in <name>? Claims already made keep it.")` | — | `{ id, is_active:false }` | Toast · reload | `CATEGORY_IN_USE` (409): "Some claims in this category are still open…" — keep the detail open |
| 133 | `GET /reimbursements/claims` | Org-wide claim queue | Claims tab table (`usePagedList`) | Tab mount; any filter or page change; after #135/#136; Refresh | `{ page, limit:20, status?, user_id?, category_id?, payout_period_month?, created_from?, created_to? }` | rows: `id, user_id, claim_number, title, status, total_amount, approved_amount, current_level, total_levels, submitted_at, payout_period_month, applied_run_id, created_at` · `pagination` | Render rows with name from the directory, `claimStage()` label, attention button when `claimActions(...).canDecide` | Error panel · empty (filtered / none) |
| 134 | `GET /reimbursements/claims/:id` | Full audit sheet | Claim `DetailDialog` → `ClaimDetailSections`; seed for `ClaimDecisionDialog` | Row open; after a failed action (reload) | — | `items[]` (+ `attachments[]` available only), `approvals[]`, `category_limits[]`, header fields | Enable footer actions only after it lands | `CLAIM_NOT_FOUND` / `FORBIDDEN` → close, toast, reload list |
| 135 | `POST /reimbursements/claims/:id/approve` | HR approval (level 2, or the only level) with trimming; the server resolves the pay month | `ClaimDecisionDialog` "Approve" | Submit dialog (client validation passed) | `{ items: [{ item_id, item_status: "approved"\|"rejected", approved_amount, approver_remarks? }], remarks? }` — **every item sent** | claim: `status`, `approved_amount`, `payout_period_month`, `finalized_at` | Close both dialogs. Toast by result: `approved` → "Approved ₹X. It will be paid with <Month YYYY> payroll. If that payroll is already calculated, recalculate it before approving." · `rejected` (all items rejected) → "All items were rejected, so the claim is rejected." Reload list. | `CATEGORY_LIMIT_EXCEEDED` → keep dialog open, show violation lines from `limitViolations(err)` · `APPROVED_EXCEEDS_CLAIMED` (inline) · `NO_OPEN_PAYOUT_PERIOD` (message + months) · `RUN_CALCULATION_IN_PROGRESS` (retry hint, keep dialog) · `SELF_APPROVAL_FORBIDDEN` / `NOT_YOUR_APPROVAL_LEVEL` / `CLAIM_NOT_ACTIONABLE` → close dialog, reload detail + list |
| 136 | `POST /reimbursements/claims/:id/reject` | Reject the whole claim (terminal) | `ReasonDialog` from detail footer | Submit reason | `{ rejection_reason }` (5–1000 chars) | `status:"rejected"` | Close · toast "Claim rejected. The employee will see your reason." · reload | `SELF_APPROVAL_FORBIDDEN` · `CLAIM_NOT_ACTIONABLE` · `NOT_YOUR_APPROVAL_LEVEL` → error inside `ReasonDialog` (`error` prop), then reload detail on close |
| 137 | `GET /attachments/:attachmentId/view-url` | Short-lived URL to view any org document | `AttachmentViewerDialog` via `payrollAPI.getAttachmentViewUrl`: receipts (claims tab), proofs (`TaxDeclarationsPage`), Part A (`YearEndClosurePage`) | "View" click; "Download" (`disposition=attachment`) | query `{ disposition?: "inline"\|"attachment" }` | `{ view_url, expires_at }` (`expires_at:null` for reference links) | Render inline or open; never store the URL | `ATTACHMENT_NOT_FOUND` ("This file is no longer available") · `ATTACHMENT_STORAGE_UNAVAILABLE` ("File storage isn't reachable right now. Nothing was changed.") |
| 138 | `POST /benefit-plans` | Create a plan | `PayrollBenefitsPage` → `PlanFormDialog` | "Save plan" (create) | `{ name, code, benefit_type, provider_name?, description?, employee_contribution_amount, employer_contribution_amount, employee_component_id?, employer_component_id?, coverage_amount?, effective_from, effective_to?, is_active }` | created plan | Close · toast · reload #139 | `PLAN_CODE_EXISTS` (inline on code) · `STATUTORY_COMPONENT_NOT_ASSIGNABLE` · `VALIDATION_ERROR` |
| 139 | `GET /benefit-plans` | Plan catalog | Plans tab table; plan choices in `EnrollDialog` (active only) | Tab mount; filter change; after #138/#141/#142 | `{ is_active?, benefit_type? }` | `rows[]` | Render | Error panel |
| 140 | `GET /benefit-plans/:id` | Plan + live members and monthly cost | Plan `DetailDialog` stats; `PlanFormDialog` edit seed; the edit confirmation text | Row open; "Edit" | — | `{ plan, active_enrollment_count, monthly_cost_total }` (normalize flat too) | Stats: "Active members", "Monthly cost (company + employees)" | `PLAN_NOT_FOUND` → close, reload |
| 141 | `PUT /benefit-plans/:id` | Change contributions or validity; reactivate | `PlanFormDialog` edit; footer "Reactivate" | Save. If amounts changed and members > 0: `await window.confirm("New amounts apply from the next payroll calculation for N members. Payroll that is already approved won't change.")` | editable fields except `code`, `benefit_type` | updated plan | Toast · reload list + detail | `PLAN_NOT_FOUND` · `STATUTORY_COMPONENT_NOT_ASSIGNABLE` |
| 142 | `DELETE /benefit-plans/:id` | Deactivate a plan (no active members) | Plan detail footer "Deactivate" | Button disabled with a hint when `active_enrollment_count > 0`; otherwise `await window.confirm` | — | `{ id, is_active:false }` | Toast · reload | `PLAN_HAS_ACTIVE_ENROLLMENTS` → "End every member's cover first." (race fallback) |
| 143 | `POST /benefit-plans/:id/enrollments` | Enroll an employee | `EnrollDialog` (from plan detail or the By-employee tab) | "Enroll" | `{ user_id, enrolled_from, overrides?: { employee_contribution_override, employer_contribution_override } }` — `overrides` only when a field is filled; blank = inherit; `"0"` = free | created enrollment | Close · toast using `chargeNoticeForStart`: "Enrolled. <Month> is charged in full." · reload #144 / #145 and #140 stats | `ENROLLMENT_PERIOD_OVERLAP` / `ALREADY_ENROLLED` → inline "They already have cover in this plan for that month." · `PERIOD_CLOSED_FOR_ADJUSTMENT` → "Payroll for that month is already approved. Pick a later start date." · `PLAN_NOT_ENROLLABLE` · `RUN_CALCULATION_IN_PROGRESS` |
| 144 | `GET /benefit-plans/:id/enrollments` | Plan member roster | Members table inside the plan `DetailDialog` (`usePagedList`, `enabled` only while open) | Detail open; status filter; page; after #143/#146 | `{ status?, page, limit:20 }` | rows: `id, user_id, plan_code, status, enrolled_from, enrolled_to, *_override` | Render with names from the directory | Inline error row with retry |
| 145 | `GET /employees/:userId/benefit-enrollments` | One employee's enrollments | By-employee tab table | Employee chosen; status filter; page; after #143/#146 | `{ status?, plan_id?, page, limit:20 }` | rows incl. `plan_name`, `plan_code`, dates, status | Render | Error panel |
| 146 | `POST /employees/:userId/benefit-enrollments/:enrollmentId/end` | End cover | `ReasonDialog` titled "End <name>'s cover in <plan>", with a date field as `children` | Submit | `{ enrolled_to, end_reason }` (UI requires the reason; API optional) | `status:"ended"`, `enrolled_to` | Close · toast using `chargeNoticeForEnd`: "Cover ends <date>. <Month> is still charged in full; nothing from <next month>." · reload | `INVALID_ENROLLMENT_DATES` · `PERIOD_CLOSED_FOR_ADJUSTMENT` · `ENROLLMENT_NOT_ACTIVE` (reload) · `ENROLLMENT_NOT_FOUND` → error in dialog |
| 147 | `POST /employees/:userId/tax/form16/:financialYear/part-a/attachment` | Attach TRACES Form 16 Part A | `YearEndClosurePage` → `EmployeeTaxPanel` Part A block | **Variant B (ships):** "Link TRACES copy" submit · **Variant A (flagged, G5-1):** file chosen in `AttachmentUploadButton` | B: `{ file_name, reference_url }` (https only) · A: `{ file_name, content_type:"application/pdf", size_bytes }` | B: attachment `available` · A: `{ attachment_id, upload_url, expires_at, required_headers }` | Toast "Part A linked." · re-fetch #114 so `part_a_attachment` shows · A: S3 PUT then confirm (blocked by G5-1) | `INVALID_FINANCIAL_YEAR` · `INVALID_ATTACHMENT_REFERENCE_URL` · `ATTACHMENT_TYPE_NOT_ALLOWED` · `ATTACHMENT_STORAGE_UNAVAILABLE` |

**Notes on the harder HR calls**

- **#133 has no single "waiting for HR" filter.** A claim waits for HR when `(status=submitted && total_levels=1)` or `status=under_review`. The default view is **All**, with the attention button on HR-actionable rows. The status select offers "Waiting for HR after manager approval" (`under_review`) and "Submitted" (`submitted`). There is **no client-side sorting**: the server orders by `created_at DESC`, and sorting one page would mislead.
- **Draft claims in #133.** The status filter offers Draft only if Q-8 says HR should see drafts. Until then the option is hidden; any draft rows that come back are shown read-only.
- **#135 payload.**
  - Send every item, so the server never keeps a stale decision.
  - A rejected item is sent as `{ item_status: "rejected", approved_amount: 0 }`.
  - An approved item needs `0 < approved_amount ≤ amount`.
  - Never send `payout_period_month` (Contract B only).
- **#137 opening.** `window.open` after an `await` is blocked by popup blockers. That is why the viewer renders inline and "Open in new tab" is a real `<a href target="_blank" rel="noopener noreferrer">` rendered once the URL arrives. A reference URL (TRACES) is not framed; the viewer shows only the link.

### 5.2 Manager — `/manager` (roles `manager`, `hr`)

| # | Method · Path | Business purpose | Consumer | Called when | Request | Important response | After success | Errors to handle |
|---|---|---|---|---|---|---|---|---|
| 148 | `GET /reimbursements/claims` | Team claim queue | `TeamReimbursementsPage` Claims tab (`usePagedList`) | Tab mount; filter or page change; after #150/#151 | `{ page, limit:20, status? (default "submitted"), payout_period_month? }` | same row shape as #133 | Names via `resolvePerson(row, useTeamNames())`; attention when the manager can decide | Error panel. A manager with no reports gets `{ total:0 }` → "No claims from your team yet." |
| 149 | `GET /reimbursements/claims/:id` | Team claim audit sheet incl. `category_limits[]` | Claim `DetailDialog` → `ClaimDetailSections` | Row open | — | same as #134 | Enable actions | `FORBIDDEN` (not in team, or missing: EC-24) → "You can't open this claim. It may belong to someone outside your team." → close, reload list |
| 150 | `POST /reimbursements/claims/:id/approve` | Level 1 approval with trimming | `ClaimDecisionDialog` (`levelLabel="Your approval (step 1 of 2)"`) | Submit | same body as #135 | `status:"under_review"` (or `rejected` when all items are rejected) | Toast "Approved. It now goes to HR for the final check." · reload | Same set as #135, minus the pay-month errors, plus `FORBIDDEN` |
| 151 | `POST /reimbursements/claims/:id/reject` | Level 1 rejection (terminal) | `ReasonDialog` | Submit | `{ rejection_reason }` | `status:"rejected"` | Toast · reload | `FORBIDDEN` · `CLAIM_NOT_ACTIONABLE` · `NOT_YOUR_APPROVAL_LEVEL` |
| 152 | `GET /attachments/:attachmentId/view-url` | View a team receipt (receipts only) | `AttachmentViewerDialog` with `getViewUrl = payrollAPI.getTeamAttachmentViewUrl` | "View" on a receipt in the team claim detail | `{ disposition? }` | `{ view_url, expires_at }` | Render | `FORBIDDEN` ("This file isn't available to managers") · `ATTACHMENT_NOT_FOUND` · `ATTACHMENT_STORAGE_UNAVAILABLE`. **Never called for proofs or Part A**: those owner types never appear on manager screens (D-28). |
| 153 | `GET /team/benefit-enrollments` | Team cover lookup | Team benefits tab | Tab mount; status filter; page | `{ status?, page, limit:20 }` | `aggregates_only:true` → `{ headcount, plan_mix[] }` · `false` → `{ count, rows[] }` | `normalizeTeamBenefits` decides which view to render | Error panel |

### 5.3 Self — `/me` (any tenant role; always the signed-in user)

| # | Method · Path | Business purpose | Consumer | Called when | Request | Important response | After success | Errors to handle |
|---|---|---|---|---|---|---|---|---|
| 154 | `GET /me/reimbursements/categories` | Active categories + my used and remaining amounts | Limits tab table; `ClaimEditorDialog` category select and hints | Page mount (once, shared by both tabs); after a submit or cancel | — | `[{ category:{ id, code, name, description, is_taxable, requires_receipt, receipt_required_above_amount, max_amount_per_claim, max_amount_per_period, limit_period }, period_key, consumed, remaining }]` | Build `categoriesById` for the editor | Error panel on the Limits tab. The editor shows "Couldn't load categories" and disables Add item. |
| 155 | `POST /me/reimbursements/claims` | Create a draft | `ClaimEditorDialog` first save | "Save draft" (or "Upload receipt" on an unsaved claim, which saves first) | `{ title, items: [{ category_id, expense_date, amount, merchant?, description?, display_order }] }` (items may be empty) | draft with `items[].id` | Keep the dialog open in edit mode with the real item ids, so receipts can be attached · reload #156 silently | `CATEGORY_NOT_FOUND_OR_INACTIVE` (reload #154, mark the row) · `INVALID_CLAIM_AMOUNT` · `VALIDATION_ERROR` |
| 156 | `GET /me/reimbursements/claims` | My claim history | My claims table (`usePagedList`) | Tab mount; filter or page change; after any claim mutation | `{ page, limit:20, status?, payout_period_month? }` | rows: `claim_number` (a `DRAFT-…` placeholder while draft), `title`, `status`, `total_amount`, `approved_amount`, `payout_period_month`, `current_level`, `total_levels`, `created_at` | Render. For drafts show "Draft", **not** the `DRAFT-uuid` placeholder number. | Error panel |
| 157 | `GET /me/reimbursements/claims/:id` | My claim detail | Claim `DetailDialog`; `ClaimEditorDialog` seed | Row open; "Edit"; after upload/delete (refresh attachments) | — | items (decisions, remarks, attachments), approvals, pay month | Footer actions from `claimActions(claim, { audience:"self" })` | `FORBIDDEN` → close, reload list |
| 158 | `PUT /me/reimbursements/claims/:id` | Replace the draft's title and items | `ClaimEditorDialog` save when dirty | "Save draft" / "Save & submit" with changes · **G5-3 confirm when any receipt exists** | `{ title, items: [...] }` (all items) | draft with **new** item ids (old receipts removed) | Replace editor state with the response (new ids, no receipts) · reload list | `CLAIM_NOT_DRAFT` → "This claim was already submitted." → close editor, reload detail · `CATEGORY_NOT_FOUND_OR_INACTIVE` · `FORBIDDEN` |
| 159 | `POST /me/reimbursements/claims/:id/submit` | Send for approval | Detail footer "Submit"; editor "Save & submit" | Click → client pre-check (≥1 item, receipts present) → `await window.confirm("Submit ₹X for approval? You can't edit it after this, but you can withdraw it until HR gives final approval.")` | — | `claim_number` (`RC-YYYYMM-NNNN`), `status:"submitted"`, `approvals[]` | Toast "Submitted as RC-…. It's with your manager." (or "with HR" when `approvals[0].approver_role === "hr"`) · reload list + #154 | `RECEIPT_REQUIRED` → mark the named item (`receiptProblem(err)`), keep editor/detail open · `CATEGORY_LIMIT_EXCEEDED` → violation lines · `CLAIM_HAS_NO_ITEMS` · `CLAIM_NOT_DRAFT` (reload) |
| 160 | `POST /me/reimbursements/claims/:id/cancel` | Discard a draft or withdraw a claim | Detail footer "Discard draft" / "Withdraw claim" | Draft: `await window.confirm("Discard this draft?")` · submitted/under_review: `ReasonDialog` "Why are you withdrawing it?" | `{ cancellation_reason? }` | `status:"cancelled"` | Toast "Draft discarded." / "Claim withdrawn. Nothing will be paid." · reload list + #154 | `CLAIM_NOT_CANCELLABLE` → "It was approved in the meantime and can't be withdrawn. Contact HR." → reload detail |
| 161 | `POST /me/reimbursements/claims/:id/items/:itemId/attachments` | Get a receipt upload URL | `AttachmentUploadButton` on an editor item row | File chosen and passes `fileProblem` | `{ file_name, content_type, size_bytes }` | `{ attachment_id, upload_url, expires_at, required_headers }` | `putToSignedUrl` → #163 | `CLAIM_NOT_DRAFT` · `ATTACHMENT_TYPE_NOT_ALLOWED` · `FORBIDDEN` · `ATTACHMENT_STORAGE_UNAVAILABLE` → error under the row, retry allowed |
| 162 | `POST /me/tax/declarations/items/:itemId/attachments` | Get an investment-proof upload URL | `MyTaxAndInvestmentsPage` → `DeclarationsTab` row | File chosen, while declaration status ∈ draft/submitted/under_review and the item has an `item_id` (saved) | same as #161 | same as #161 | `putToSignedUrl` → #163 | `DECLARATION_NOT_OPEN_FOR_PROOF` · `ATTACHMENT_TYPE_NOT_ALLOWED` · `FORBIDDEN` |
| 163 | `POST /me/attachments/:attachmentId/confirm` | Mark an upload real (after S3 `HeadObject`) | `uploadFile()` last step (receipts, proofs) | Immediately after a successful PUT | — | attachment `{ id, file_name, content_type, size_bytes, status:"available" }` | Add to the item's file list with a check mark · toast "Receipt attached." | `ATTACHMENT_VERIFICATION_FAILED` → "The upload didn't finish. Choose the file again." (the row stays `pending` and is invisible) · `ATTACHMENT_STORAGE_UNAVAILABLE` → retry confirm only, not re-upload |
| 164 | `DELETE /me/attachments/:attachmentId` | Remove a wrong upload | Trash icon next to a file (draft claim items; proofs on an open declaration) | Click → `await window.confirm("Remove <file_name>?")` | — | `{ id, status:"deleted" }` | Remove from the list · toast | `CLAIM_NOT_DRAFT` · `ATTACHMENT_NOT_DELETABLE` (reload) |
| 165 | `GET /me/attachments/:attachmentId/view-url` | View my own file (receipt, proof, Part A) | `AttachmentViewerDialog` with `getViewUrl = payrollAPI.getMyAttachmentViewUrl` | "View" / "Download" | `{ disposition? }` | `{ view_url, expires_at }` | Render / open | `ATTACHMENT_NOT_FOUND` · `ATTACHMENT_STORAGE_UNAVAILABLE` |
| 166 | `GET /me/benefits` | My enrollments + this year's deductions | My benefits tab | Tab mount | — | `{ financial_year, fy_total_employee_deducted, enrollment_count, enrollments:[{ plan:{code,name,benefit_type}, status, enrolled_from, enrolled_to, employee_contribution, employer_contribution, contribution_is_overridden }] }` | Stats + cards | Error panel · empty "You aren't enrolled in any company benefit." |

**The upload sequence (#161/#162 → S3 → #163), exact client rules**

1. Run `fileProblem(file, ALLOWED_TYPES)`:
   - Rejects an empty file, a file over 10 MB, and any type outside jpeg/png/webp/pdf. SVG, HEIC and ZIP are rejected with "Use a PDF, JPG, PNG or WebP file."
   - `content_type` is `file.type`, or is inferred from the extension when `file.type` is empty.
2. Issue the URL with `file_name` (cut to 255 characters, extension kept), `content_type` and `size_bytes = file.size`.
3. `fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": required_headers["Content-Type"] ?? content_type } })`:
   - **Do not** use `request()`: it adds `Authorization` and the API base URL, and S3 would reject the signature.
   - **Do not** set `Content-Length`: browsers forbid it and send `file.size` themselves.
   - A non-2xx response, or a `TypeError` (usually CORS, see §14), becomes an `UploadError` at stage `put` with "Couldn't send the file to storage. Try again." Retrying issues a **new** URL, because the old one may have expired.
4. Confirm. Only after the confirm succeeds does the file count toward "receipt attached".

### 5.4 Existing endpoints Phase 5 extends (no new numbers)

| # | Endpoint | Phase 5 addition | Consumer | Status |
|---|---|---|---|---|
| 22 / 23 | `GET` / `PUT /hr/settings` | `reimbursement_approval_levels`, `reimbursement_payout_lookahead_months`, `benefit_deductions_enabled` (registry #51–#53) | `PayrollSettingsPage` new section; `PayrollBenefitsPage` banner (read) | **To build** |
| 37 | `GET /hr/runs/eligibility` | `payouts{…}` | `PayrollRunDashboard` → `payoutReadinessNotes` | **Done.** Optional "Review claims" link. |
| 42 | `GET /hr/runs/:id/preview` | `payouts{…}` | `PayrollRunDetailPage` → `PAYOUT_FIELDS` | **Done** |
| 44 | `GET /hr/runs/:id/items/:itemId` | `item.reimbursement_amount`, `benefit_employee_amount`, `benefit_employer_amount`; components with `source: reimbursement\|benefit` | `RunItemDialog` | **To fix.** Today `earnings = [...earning, ...reimbursement]` puts non-taxable reimbursements beside gross, so "gross − deductions" no longer equals net. Build these sections: Earnings = `component_type:"earning"` (taxable reimbursements are earnings; the source pill says "Reimbursement"). Deductions (benefit premiums arrive here with source "Benefit"). New section "Reimbursements (added to net pay, not part of gross)" = `component_type:"reimbursement"`. Employer lines unchanged. Add "Reimbursements" and "Benefits (employee / company)" rows to the pay grid. Add a line under the stats when `reimbursement_amount > 0`: "Net pay includes ₹X of reimbursements, which aren't part of gross pay." |
| 53–56 | Manager `GET /manager/employees/:userId/payslips[/:runId]`, self `GET /me/payslips[/:runId]` | list row `reimbursement_amount`; detail `reimbursements[]` (category, claim number, amount) and `benefits[]` (plan, employee, employer) | `TeamPayslipsPage`, `MyPayslipsPage` | **To build.** Read `detail.reimbursements ?? detail.item?.reimbursements ?? []` and the same for `benefits`. Add the same net-pay explanation line. Hide a block when empty (no ₹0 rows). On the manager screen, keep the existing money-hidden handling. |
| 106 | `GET /hr/tax/declarations/:id` | `items[].attachments[]` (available only) | `TaxDeclarationsPage` verify modal | **To build.** Proof chips per item, each "View" → viewer with #137. Proofs do **not** gate "Apply Verification". |
| 114 | `GET /hr/employees/:userId/tax/form16/:fy` | `part_a_attachment: { attachment_id, file_name, storage_backend }` \| null | `YearEndClosurePage` Part A block | **To build.** Fetched silently when the panel opens (today it is fetched only on "View Form 16 Part-B"); a 404 means "not finalized" and is not an error. |
| 122 | `GET /me/tax/declarations` | `items[].attachments[]` **if sent** (G5-2) | `DeclarationsTab` | **To build**, reading defensively |
| 126 | `GET /me/tax/form16/:fy` | `part_a_attachment` | `Form16Tab` | **To build.** "View Part A" → viewer with #165. |

### 5.5 Coverage check

Every Phase 5 endpoint has a consumer:

| Range | Consumers |
|---|---|
| #128–#132 | §3.1 Categories |
| #133–#136 | §3.1 Claims |
| #137 | Claims tab, Tax Declarations, Year-End |
| #138–#146 | §3.2 Benefits |
| #147 | Year-End |
| #148–#152 | §3.3 Claims tab |
| #153 | §3.3 Team benefits tab |
| #154–#161 | §3.4 My claims / Limits |
| #162 | My Tax |
| #163–#165 | My claims, My Tax |
| #166 | My benefits |

**0 unmapped.** The only partial item is #147 variant A, which is gated by G5-1.

---

## 6. Component Structure

Legend:
- **R**: reused as is
- **X**: reused with a small extension
- **N**: genuinely new

### 6.1 `PayrollReimbursementsPage` (HR)

```text
PayrollReimbursementsPage                      N  (page; reads/writes ?tab)
├── DashboardTopBar                            R
├── header + tab strip                         R  (MyTaxAndInvestmentsPage tab markup)
├── ClaimsTab                                  N  (local)
│   ├── filter bar (status, employee, category, pay month, from/to, page search, refresh)  R (Adjustments filter-bar markup)
│   ├── usePagedList(#133)                     R
│   ├── claims table + rowPreviewProps + RowOpenButton   R
│   ├── pagination footer                      R  (Adjustments markup)
│   ├── DetailDialog (claim)                   R
│   │   ├── ClaimDetailSections               N  (shared: ClaimStats, ClaimItemsTable, ApprovalTimeline, CategoryLimitsTable, PayoutSection)
│   │   └── footer: Reject · Approve | DetailFooterNote   R
│   ├── ClaimDecisionDialog                    N  (shared)
│   ├── ReasonDialog (reject)                  R
│   └── AttachmentViewerDialog                 N  (shared)
├── CategoriesTab                              N  (local)
│   ├── active filter + search + "New category"
│   ├── categories table                       R  (pattern)
│   ├── DetailDialog (category)                R
│   └── CategoryFormDialog                     N  (local; AdjustmentFormDialog structure)
└── PayrollToast / useToast                    R
```

### 6.2 `PayrollBenefitsPage` (HR)

```text
PayrollBenefitsPage                            N
├── deductions-off banner (getSettings)         N  (8 lines, local)
├── PlansTab                                   N
│   ├── filters (active, type) + search + "New plan"
│   ├── plans table                            R  (pattern)
│   ├── DetailDialog (plan)                    R
│   │   ├── DetailStats (members, monthly cost)          R
│   │   ├── DetailGrid (terms) + NO_TAX_EFFECT_NOTE      R
│   │   └── members table: usePagedList(#144) + "End cover" per active row   R/X
│   ├── PlanFormDialog                         N  (local)
│   ├── EnrollDialog                           N  (local; employee search+select like AdjustmentFormDialog)
│   └── ReasonDialog + date field (end cover)  X  (uses existing `children` + `canSubmit` props — no code change)
├── EmployeesTab                               N
│   ├── employee search (directory.options)    R  (YearEndClosurePage search markup)
│   ├── usePagedList(#145) table               R
│   └── EnrollDialog (employee preset) / ReasonDialog (end)
└── PayrollToast / useToast                    R
```

### 6.3 `TeamReimbursementsPage` (manager)

```text
TeamReimbursementsPage                         N (rewrite)
├── tabs: Claims to review · Team benefits
├── ClaimsTab → usePagedList(#148), useTeamNames + resolvePerson, DetailDialog + ClaimDetailSections,
│               ClaimDecisionDialog, ReasonDialog, AttachmentViewerDialog(getTeamAttachmentViewUrl)
├── TeamBenefitsTab
│   ├── aggregates_only → DetailStats(headcount) + plan mix table + privacy note
│   └── full → usePagedList-like paging over #153 rows (names via useTeamNames)
└── PayrollToast / useToast (imported from roles/hr/payroll)   R
```

### 6.4 `MyReimbursementsPage` (employee + manager/HR self-service)

```text
MyReimbursementsPage                           N (rewrite)
├── tabs: My claims · Spending limits · My benefits
├── useMyCategories (local hook: #154 once, shared by tabs + editor)   N (local, 15 lines)
├── ClaimsTab
│   ├── filters (status, pay month) + "New claim"
│   ├── usePagedList(#156) table
│   ├── DetailDialog (#157) + ClaimDetailSections (no limits table)   R/N
│   │   └── footer from claimActions(audience:"self"): Discard · Withdraw · Edit · Submit
│   ├── ClaimEditorDialog                      N (local, z-120)
│   │   ├── title field
│   │   ├── items table rows: category select · date · merchant · description · amount · receipt cell
│   │   │   └── receipt cell: AttachmentUploadButton(#161→PUT→#163) · file chips (View #165 · Remove #164) · "Receipt needed" hint
│   │   ├── limit hints per category (from #154)
│   │   └── footer: Close · Save draft · Save & submit
│   ├── ReasonDialog (withdraw)                R
│   └── AttachmentViewerDialog(getMyAttachmentViewUrl)   N (shared)
├── LimitsTab → table from #154
└── BenefitsTab → DetailStats + enrollment cards from #166
```

### 6.5 Shared component contracts

| Component | Props | Behaviour notes |
|---|---|---|
| `ClaimDetailSections` | `claim` (normalized), `audience` (`"hr" \| "manager" \| "self"`), `nameOf(userId)`, `onViewAttachment(att)`, `showLimits` | Items table shows claimed and approved amounts. A trimmed item shows "Lowered by ₹Y" and its remark. The timeline shows an `hr` level as "HR"; a `manager` level shows "Manager" plus the assigned approver's name when resolvable, otherwise "Manager". `skipped` rows are shown muted as "Not needed". The limits table renders `remaining: null` as "No limit". |
| `ClaimDecisionDialog` | `claim`, `levelLabel`, `busy`, `error`, `violations`, `onSubmit({ items, remarks })`, `onClose` | Initial state: every item "Approve" at its current `approved_amount ?? amount`. Validation in §7.5. The submit label reads "Approve ₹X" or "Reject all items" when everything is rejected. It never closes on error. |
| `AttachmentViewerDialog` | `attachment {id, file_name, content_type, storage_backend}`, `getViewUrl`, `onClose` | Re-fetches on every open and on "Retry". Images render as `<img alt={file_name}>`, PDFs as `<iframe title={file_name}>`. If `expires_at` has passed while the dialog is open, the next action re-fetches. |
| `AttachmentUploadButton` | `issue(meta) => Promise`, `confirm(id) => Promise`, `types`, `label`, `disabled`, `onUploaded(att)` | One upload at a time per button. It is disabled while busy; the error text stays under the button until the next attempt. The input value is reset after each pick, so the same file can be picked again. |

---

## 7. Forms and Validation

Every form follows `AdjustmentFormDialog`:
- `emptyForm()` factory and a `validateX(form)` error map, shown after the first submit (`touched`)
- `aria-invalid` on fields and a `serverError` banner
- `savingRef` against double submit
- Close disabled while saving; Escape through a `closeRef`

Server validation: `payrollErrorMessage(err)` shows in the banner. For `VALIDATION_ERROR` the backend sends only the **first** Joi message. If that message quotes a known field name, also mark that field (best effort). Otherwise show only the banner.

### 7.1 Category — `CategoryFormDialog` (#128 create, #131 edit)

| Field | Required | Rules | Notes |
|---|---|---|---|
| Name `name` | yes | trimmed 2–150 chars | |
| Code `code` | yes (create) | uppercase as typed; `^[A-Z0-9_]+$`; 2–50 chars | Suggested from the name (`codeFromName` pattern) until edited. **Read-only on edit and never sent** (safe under both contracts). |
| Description `description` | no | ≤ 1000 | "Tell employees what they can claim here." |
| Taxable `is_taxable` | no (default off) | boolean | Off: "Paid on top of salary. Not taxed, not counted for PF/ESI." On: "Taxed as income and counted for professional tax, not for PF/ESI." |
| Receipt needed `requires_receipt` | no (default on) | boolean | |
| Only above `receipt_required_above_amount` | no | money ≥ 0; shown only when a receipt is needed; empty → `null` ("always") | |
| Limit per claim `max_amount_per_claim` | no | money > 0; empty → `null` ("No limit") | "All items of this category in one claim count together." |
| Limit per period `max_amount_per_period` | no | money ≥ 0; empty → `null`; `0` allowed | Helper: "0 means nobody can claim in this category." |
| Period `limit_period` | yes (default `financial_year`) | `month` \| `financial_year` | Disabled when there is no period limit (still sent). Label "per month" / "per financial year". |
| Salary component `component_id` | no | dropdown of `getComponents()` rows that are active and not statutory | Under "Advanced". Empty → `null`. |
| Active `is_active` | no (default on) | boolean | |

Cross-field checks:
- A per-claim limit greater than the period limit gets a **warning** only: "One claim can never use the full per-claim limit." Not blocking.
- Edit mode: if `is_taxable` or the limits changed, the save confirmation says: "Changes apply to claims created from now on. Claims already created keep the old rules."

### 7.2 Benefit plan — `PlanFormDialog` (#138 create, #141 edit)

| Field | Required | Rules |
|---|---|---|
| Name | yes | 2–150 |
| Code | yes (create) | uppercase `^[A-Z0-9_]+$`, 2–50; read-only on edit |
| Type `benefit_type` | yes (create) | `health_insurance \| life_insurance \| accident_insurance \| meal \| travel \| other`; read-only on edit |
| Provider `provider_name` | no | ≤ 150 |
| Description | no | ≤ 1000 |
| Employee pays per month `employee_contribution_amount` | yes (default `0`) | money ≥ 0 |
| Company pays per month `employer_contribution_amount` | yes (default `0`) | money ≥ 0 |
| Deduction component / company component | no | active, non-statutory components; under "Advanced" |
| Sum insured `coverage_amount` | no | money ≥ 0; empty → `null` |
| Starts `effective_from` | yes | date |
| Ends `effective_to` | no | date ≥ starts; empty → `null` |
| Active | no (default on) | boolean |

Rules:
- **Both amounts 0** → warning: "This plan won't change anyone's pay." Not blocking.
- **Always shown** under the amounts (D-37): "Benefit plans don't change income tax. A premium doesn't count toward 80D automatically, and a company-paid perk isn't taxed here."
- **Always shown** (D-36): "A month is charged in full if cover is active on any day of it."
- **Edit with members:** confirm per #141.

### 7.3 Enrollment — `EnrollDialog` (#143)

| Field | Required | Rules | Source |
|---|---|---|---|
| Employee `user_id` | yes | from `directory.activeOptions` (search + select); preset and locked on the By-employee tab | `useEmployeeDirectory` |
| Plan | yes | active plans from #139; preset and locked when opened from a plan | #139 |
| Starts `enrolled_from` | yes | date. Must be ≥ the plan's `effective_from`, and ≤ its `effective_to` when set; message "The plan isn't available on that date." | plan row |
| Employee pays `employee_contribution_override` | no | empty = the plan amount (placeholder shows it); a number ≥ 0; `0` = free | |
| Company pays `employer_contribution_override` | no | same | |

Behaviour:
- **Payload.** Send `overrides` only when at least one override is filled. A filled override is `parseMoney(v, { allowZero: true })`; an empty one is sent as `null` inside `overrides`.
- **Pre-check (advisory).** When an employee is chosen, fetch #145 for them, limited to 50 and status active/ended. If any enrollment in the same plan touches the start month, warn inline: "They already have cover in this plan in <Month>. Pick a start date in a later month." The server remains authoritative (409).
- **Notice under the date:** "<Month YYYY> is charged in full, even if cover starts mid-month."

### 7.4 End cover — `ReasonDialog` with `children` (#146)

- **Date `enrolled_to` (required):** a date ≥ `enrolled_from`. `canSubmit` is false until it is valid.
- **Reason `end_reason` (required in the UI):** 3–500 characters. The ReasonDialog limit is 1000, so the dialog also shows "500 max".
- **Description (D-36):** "<Month of date> is still charged in full. Nothing is charged from <next month>."

### 7.5 Claim decision — `ClaimDecisionDialog` (#135 / #150)

| Per item | Rule |
|---|---|
| Decision | `approved` \| `rejected` |
| Approved amount | Approved: `0 < value ≤ amount`, at most 2 decimals, compared in paise. Rejected: the input is locked to `0`. |
| Remark `approver_remarks` | Required when the item is rejected or the amount is lowered (walkthrough: the reviewer must note a reduction); ≤ 1000 |

Overall:
- **Overall remark `remarks`:** optional, ≤ 1000.
- **Limit preview.** For each `category_limits[]` row with a numeric `limit`: `after = limit − prior_approved − Σ approved amounts of the items that map to this row`. When `after < 0` show "₹N over the <period> limit" and **block submit**.
- **Mapping items to limit rows** (`itemBucketKey`):
  - Match `category_code`.
  - If that category has one row, use it.
  - If it has several rows (a claim that crosses a month or financial-year boundary), match `period_key` against `YYYY-MM` of `expense_date` (month limits), or against the Apr–Mar label from `fyUtils` (financial-year limits).
  - If still unmatched, show the row read-only and let the server decide.
- **All items rejected:** the submit label becomes "Reject all items", with the confirm "Every item is rejected, so the whole claim will be rejected. Use Reject instead if you want to give one reason."
- **Payload:** `{ items: allItems.map(({ id, decision, amount, remark }) => ({ item_id: id, item_status: decision, approved_amount: decision === "rejected" ? 0 : parseMoney(amount), approver_remarks: remark.trim() || undefined })), remarks: remarks.trim() || undefined }`.

### 7.6 Reject claim — `ReasonDialog` (#136 / #151)

`rejection_reason` is required, with `minLength={5}` (the stricter of the two contracts). Description: "<RC-…> · ₹X · <employee>. The employee will see your reason."

### 7.7 Claim draft — `ClaimEditorDialog` (#155 create, #158 replace, #159 submit)

| Field | Required | Rules |
|---|---|---|
| Title `title` | yes | trimmed 3–200 |
| Items | ≥ 1 to submit (0 allowed to save) | at most 100 rows |
| Category `category_id` | yes | an active category from #154 |
| Date `expense_date` | yes | valid date, **not in the future** (UI rule, message "Use the date you paid") |
| Amount `amount` | yes | `parseMoney` > 0, at most 2 decimals |
| Merchant `merchant` | no | ≤ 150 |
| Description `description` | no | ≤ 1000 |
| `display_order` | auto | row index |

Behaviour rules:
1. **Save before receipts.** Receipts attach to saved item ids. "Upload receipt" on an unsaved row first saves the draft (#155, or #158 if dirty), then opens the file picker on the new id.
2. **Dirty tracking.** Keep a snapshot of the last saved `{title, items}`. "Save draft" with no changes does nothing ("No changes to save"). This avoids the G5-3 receipt loss.
3. **G5-3 confirm.** If dirty **and** any saved item has attachments: `await window.confirm("Saving these changes removes the N receipt(s) already attached, because every item is saved again. Continue?")`.
4. **Receipt hint per row:**
   - Condition: `category.requires_receipt && (category.receipt_required_above_amount == null || amount > Number(threshold))`.
   - Label: "Receipt needed".
   - Submit is blocked client-side while any such row has no confirmed attachment. Message: "Attach a receipt for: <row labels>."
5. **Limit hints (advisory, never blocking).**
   - Per category: the claim subtotal over `max_amount_per_claim` shows "Over the ₹X per-claim limit".
   - When the row's date falls in the current window (`period_key`) and the subtotal exceeds `remaining`: "Only ₹R left this <month|year>".
   - Dates in other windows: no hint (the server decides at submit).
6. **"Save & submit"** = save if dirty → #159. When the save succeeds but the submit fails, stay in edit mode with the error. The draft is kept.
7. **Draft rows from Contract B** (`period_month`, `notes`, `receipt_reference`) are never sent.

### 7.8 Payroll settings — new section in `PayrollSettingsPage` (#23)

| Field | Control | Rules / copy |
|---|---|---|
| `reimbursement_approval_levels` | radio: "Manager, then HR" (2) · "HR only" (1) | Integer 1–2. Copy: "Applies to claims submitted after you save. Claims already in review keep their steps." |
| `reimbursement_payout_lookahead_months` | select 0–6 | Copy: "If this month's payroll is already approved, pay approved claims in one of the next N months. 0 means only this month." |
| `benefit_deductions_enabled` | checkbox | When switched **on**, before save: `await window.confirm("Every active benefit enrollment will be charged from the next payroll calculation. Check the benefit totals on the Payroll Runs readiness panel first.")` |

Defaults come from GET; the fallback object in `loadSettings` gains `2`, `2` and `false`.

---

## 8. Tables and Filters

Rules shared by every Phase 5 table (the `PayrollAdjustmentsPage` pattern):

**Rows**
- Each row spreads `rowPreviewProps(open, label)` with `tabIndex={-1}`.
- The last cell is `RowOpenButton`, with `attention` set when the viewer must act.
- There is **no Actions column** with multiple buttons. The only exception is "End cover" inside the plan members table, which carries `data-row-action`.

**Search, sorting and paging**
- Search filters the **current page** only. Its placeholder says so ("Filter this page by …").
- There is no client-side sorting on paged tables; server order is kept. Unpaged lists (#129, #139, #154) are sorted by name on the client.
- Pagination is server-side, `limit 20`, through `usePagedList(fetcher, { filterKey: JSON.stringify(filters) })`. The footer reads "Page X of Y · N claims" with prev/next buttons, and is shown only when `totalPages > 1`.

**States**
- Loading: `<Skeleton type="table" rows={6} />`.
- Error: a rose panel with `payrollErrorMessage` and "Try again".
- Empty: filters active → "No … match these filters." plus a Clear button; no filters → a first-use message with the primary action.
- Values: money through `formatMoney` with `tabular-nums`; dates `formatDate`; months `formatPeriod`; missing values "N/A".

**Status pills.** Colours follow `APPROVAL_STATUS` in `variablePayMeta` (amber, emerald, rose, slate), plus purple for "in payroll" and "paid".

**Bulk actions.** There are **none**. No bulk endpoint exists, and bulk-approving money claims would bypass the per-item review.

### 8.1 HR claims (#133)

| Column | Content |
|---|---|
| Employee | name (bold), code |
| Claim | `claim_number`, `title` (one line, truncated) |
| Submitted | `formatDate(submitted_at)`, or "Not submitted" for drafts |
| Amount | `total_amount`. When decided and different: approved amount on a second line ("Approved ₹X") |
| Status | pill from `claimStatusMeta`, with a `claimStage` sub-label ("Waiting for manager" / "Waiting for HR") |
| Pay month | `formatPeriod(payout_period_month)`, or "Set at final approval"; "In payroll" tag when `applied_run_id` |
| — | `RowOpenButton` (Review when HR can decide) |

Filters:
- Status: All · Submitted · Waiting for HR (after manager) · Approved · Paid · Rejected · Withdrawn
- Employee: search + select over `directory.options`
- Category: #129 rows
- Pay month: `periodOptions()`
- Submitted from / to: two date inputs, sent as `created_from` / `created_to`
- Clear · Refresh

### 8.2 HR categories (#129)

| Column | Content |
|---|---|
| Category | name, code (mono) |
| Tax | "Not taxed" / "Taxed" pill |
| Receipt | "Always" / "Above ₹X" / "Not needed" |
| Per claim | ₹X or "No limit" |
| Per period | "₹X per month" / "₹X per financial year" / "No limit" ("Blocked" when 0) |
| Status | Active / Inactive |

Filters: Active · Inactive · All (server `is_active`), plus search by name or code.

### 8.3 HR plans (#139) and members (#144, #145)

**Plans table**

| Column | Content |
|---|---|
| Plan | name, code |
| Type | `BENEFIT_TYPE_LABEL` |
| Provider | provider or N/A |
| Employee pays | ₹X / month |
| Company pays | ₹X / month |
| Valid | `effective_from` to `effective_to` ("no end date") |
| Status | Active / Inactive |

Filters: status (active / inactive / all), type, search.

**Members table** (#144, inside plan detail) and **By-employee table** (#145)

| Column | Content |
|---|---|
| Employee / Plan | name (#144) or plan name + code (#145) |
| From | date |
| To | date or "Ongoing" |
| Employee pays | override or "Plan rate" |
| Company pays | override or "Plan rate" |
| Status | Active / Ended / Cancelled |
| — | "End cover" on active rows (the only inline row action) |

Filter: status (Active · Ended · Cancelled · All).

### 8.4 Manager claims (#148) and team benefits (#153)

**Claims:** same columns as §8.1 minus the Pay month column (kept inside the detail). Filters: status (default Submitted), pay month, search. Attention when `claimActions(claim, {audience:"manager", viewerId}).canDecide`.

**Team benefits, full variant:** Member · Plan (`plan_code`) · From · Status · Rates ("Plan rate" / "Custom rate"). **Aggregates variant:** a stat for employees covered, and a table of Plan · Type · Enrollments · Employees. There is no row preview for aggregates.

### 8.5 Employee tables

**My claims (#156):** Claim (number or "Draft", title) · Created · Claimed · Approved · Status (with stage) · Pay month · open. Filters: status (All · Draft · Submitted · Waiting for HR · Approved · Paid · Rejected · Withdrawn), pay month.

**Spending limits (#154):**

| Column | Content |
|---|---|
| Category | name, description |
| Receipt rule | text |
| Per claim | limit |
| Period limit | with `period_key` shown as "This month (Sep 2026)" / "FY 2026-27" |
| Used | `consumed` |
| Left | `remaining` or "No limit" |

The note above the table: "Only approved claims are counted. Claims still waiting for approval are not subtracted yet."

---

## 9. Workflow and Status Handling

### 9.1 Claim state machine (Contract A §6.5)

Stages are derived by `claimStage(claim)` in `reimbursementMeta.js`, from list fields only:

| `status` | Condition | Stage label | Waiting on |
|---|---|---|---|
| `draft` | — | Draft | employee |
| `submitted` | `total_levels === 2 && current_level === 1` | Waiting for manager | manager |
| `submitted` | `total_levels === 1` | Waiting for HR | HR |
| `under_review` | (`current_level === 2`) | Waiting for HR (manager approved) | HR |
| `approved` | `applied_run_id == null` | Approved, to be paid with <pay month> payroll | payroll run |
| `approved` | `applied_run_id != null` | Approved, in <pay month> payroll | run payment |
| `processed` | — | **Paid** | — |
| `rejected` | — | Rejected | — |
| `cancelled` | — | **Withdrawn** (draft: "Discarded") | — |

### 9.2 Transitions → UI

| Current state | Who | Action (button) | API | New state | UI update |
|---|---|---|---|---|---|
| (none) | self | New claim → Save draft | #155 | `draft` | Editor switches to edit mode with item ids; list reloads |
| `draft` | self | Edit → Save draft | #158 | `draft` (new item ids) | Editor re-seeded from response; receipts on replaced items gone (G5-3 confirm) |
| `draft` | self | Upload receipt / Remove | #161→PUT→#163 / #164 | `draft` | File chip added / removed |
| `draft` | self | Submit | #159 | `submitted` | Toast names the next approver; detail footer changes to Withdraw; #154 reloaded |
| `draft` | self | Discard draft | #160 | `cancelled` | Close detail; list reload |
| `submitted` (2 levels) | manager | Approve (trim) | #150 | `under_review` (or `rejected` if all rejected) | Close dialogs; toast; list reload |
| `submitted` (2 levels) | manager | Reject | #151 | `rejected` | Same |
| `submitted` (1 level) / `under_review` | HR | Approve (trim) | #135 | `approved` + `payout_period_month` (or `rejected`) | Toast names the pay month and the recalculation note; list reload |
| `submitted` (1 level) / `under_review` | HR | Reject | #136 | `rejected` | Same |
| `submitted` / `under_review` | self | Withdraw (reason) | #160 | `cancelled` | Close; list + #154 reload |
| `approved` | payroll run approved | — (Payroll Runs page) | #48 | `approved` + `applied_run_id` | Status label switches to "in payroll"; no action |
| `approved` + applied | payroll run cancelled | — | #49 | `approved` (stamp cleared) | Label reverts; no action |
| `approved` + applied | payroll run paid | — | #50 | `processed` | "Paid" |
| `processed` / `rejected` / `cancelled` | anyone | — | — | terminal | `DetailFooterNote` explains why |

### 9.3 Buttons per state and audience (`claimActions`)

```js
// reimbursementMeta.claimActions(claim, { audience, viewerId }) → flags + reason
own        = claim.user_id === viewerId
stageRole  = stage.waitingOn            // "manager" | "hr" | ...
self:    canEdit = canSubmit = status === "draft"
         canDiscard  = status === "draft"
         canWithdraw = status in ["submitted","under_review"]
manager: canDecide = status === "submitted" && stageRole === "manager" && !own
hr:      canDecide = ((status === "submitted" && total_levels === 1) || status === "under_review") && !own
reason (when nothing is allowed), e.g.:
  own && waiting        → "You can't approve your own claim. Another approver has to review it."  (HR sole-user hint: "If you're the only HR user, invite a second HR user to approve it.")
  hr && stageRole=manager → "Waiting for the manager. HR reviews it after the manager approves."
  manager && stageRole=hr → "You've approved this. It's with HR now."
  approved              → "Approved. It will be paid with <Month> payroll." / "Included in <Month> payroll."
  processed             → "Paid with <Month> payroll."
  rejected              → "Rejected: <reason>."
  cancelled             → "Withdrawn by the employee."
```

**Detail footers:**
- Self: Discard/Withdraw on the left; Edit and Submit on the right.
- HR and manager: Reject on the left (`sm:mr-auto`); Approve on the right.

Actions stay disabled until the full detail (#134/#149/#157) has loaded.

### 9.4 Enrollment and plan / category states

| Entity | State | Actions | API | Result |
|---|---|---|---|---|
| Enrollment | `active` | End cover | #146 | `ended` |
| Enrollment | `ended`, `cancelled` | none | — | Footer note "Cover ended on <date>." |
| Plan | active | Edit · Enroll employee · Deactivate (disabled while members > 0) | #141 · #143 · #142 | active / inactive |
| Plan | inactive | Edit · Reactivate | #141 (`is_active:true`) | active |
| Category | active | Edit · Deactivate | #131 · #132 | inactive (409 while open claims use it) |
| Category | inactive | Edit · Reactivate | #131 | active |

### 9.5 Attachment states (client view)

`pending` rows are never shown (the server hides them). The UI only ever holds `available` attachments returned by #163 or embedded in detail payloads.

Upload button states: `idle → checking file → getting upload link → sending → confirming → done | error(stage)`. It shows one spinner and one line of text per stage.

---

## 10. Routing and Navigation

### 10.1 Routes (`src/routes/AppRoutes.jsx`)

| Path | Element | Workspace guard | Params |
|---|---|---|---|
| `/dashboard/hr/payroll/reimbursements` | `PayrollReimbursementsPage` | `hr` | `?tab=claims\|categories`, `?status=` (deep link from Run Dashboard) |
| `/dashboard/hr/payroll/benefits` | `PayrollBenefitsPage` (was `BenefitsAndReimbursementsPage`) | `hr` | `?tab=plans\|employees` |
| `/dashboard/hr/my-reimbursements` | `MyReimbursementsPage` | `hr` | `?tab=claims\|limits\|benefits` |
| `/dashboard/manager/payroll/reimbursements` | `TeamReimbursementsPage` (rewritten) | `manager` | `?tab=claims\|benefits` |
| `/dashboard/manager/my-reimbursements` | `MyReimbursementsPage` | `manager` | `?tab=` |
| `/dashboard/employee/payroll/reimbursements` | `MyReimbursementsPage` (rewritten) | `employee` | `?tab=` |

- **No route parameters for ids.** Details open as dialogs, like every payroll page.
- **Invalid `?tab` values** fall back to the default tab. Replace the value (`setSearchParams(..., { replace: true })`) so Back does not loop.
- **`?status`** is read once to seed the filter.

### 10.2 Menu placement (`DashboardSidebar.jsx`)

HR "PAYROLL & COMP" (final order):
1. Salary Components
2. Structure Templates
3. Employee Structures
4. Salary Approvals
5. Payroll Runs
6. Adjustments
7. Bonus Rules
8. Loans & Advances
9. **Reimbursements** (`HiReceiptRefund`, active when `pathname === "/dashboard/hr/payroll/reimbursements"`)
10. **Benefits** (`HiHeart`)
11. Bank Verification
12. Statutory & Tax
13. Tax Declarations
14. Year-End & Form 16
15. Audit Log
16. **My Claims & Benefits** (`HiReceiptRefund`, `/dashboard/hr/my-reimbursements`)

Manager "PAYROLL & COMP":
1. Team Compensation
2. Team Payslips
3. Team Variable Pay
4. **Team Claims & Benefits** (renamed; `HiReceiptRefund`)
5. **My Claims & Benefits** (new)

Employee "PAYROLL & COMP": My Salary & Bank, My Payslips, Loans & Variable Pay, Tax & Investments, **Claims & Benefits** (renamed; `HiReceiptRefund`).

All three icons exist in `react-icons/hi` (verified).

### 10.3 Breadcrumbs, titles, guards

- **Breadcrumbs:** the project has no breadcrumb component. Navigation context is the `DashboardTopBar` title and the page `h1`; tab state lives in the URL. Phase 5 does not add breadcrumbs.
- **`DashboardTopBar` titles:**
  - "Reimbursements"
  - "Benefits"
  - "Team Claims & Benefits"
  - "My Claims & Benefits", with an employee subtitle or "Your own claims" in the manager and HR workspaces
- **Guards:** the existing `ProtectedRoute workspace` only; no new guard component. The backend authorizes each call. §12 lists the screen-level handling.

---

## 11. API / Service / Hook Structure

**Existing approach, kept:**
- one `payrollAPI` object
- screens call it directly from `useCallback` loaders
- `usePagedList` for paged lists
- request-id refs for detail fetches
- no cache layer and no query keys
- after a mutation, the screen reloads the affected list and detail explicitly (§11.3)

### 11.1 `payroll.api.js` additions (exact names)

```js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: Reimbursements, Benefits & Documents — API #128–#166
// Contract: phase5_api_analysis.md / api_registry.md (see PAYROLL_PHASE5_FRONTEND_PLAN.md §0)
// ─────────────────────────────────────────────────────────────────────────────

// HR — Reimbursement categories (#128–#132)
createReimbursementCategory: (payload) => request("/payroll/hr/reimbursements/categories", { method: "POST", body: JSON.stringify(payload) }),
getReimbursementCategories: (params) => request(`/payroll/hr/reimbursements/categories${buildQuery(params)}`),
getReimbursementCategory: (id) => request(`/payroll/hr/reimbursements/categories/${id}`),
updateReimbursementCategory: (id, payload) => request(`/payroll/hr/reimbursements/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
deactivateReimbursementCategory: (id) => request(`/payroll/hr/reimbursements/categories/${id}`, { method: "DELETE" }),

// HR — Claims queue (#133–#136)
getReimbursementClaims: (params) => request(`/payroll/hr/reimbursements/claims${buildQuery(params)}`),
getReimbursementClaim: (id) => request(`/payroll/hr/reimbursements/claims/${id}`),
approveReimbursementClaim: (id, payload) => request(`/payroll/hr/reimbursements/claims/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
rejectReimbursementClaim: (id, reason) => request(`/payroll/hr/reimbursements/claims/${id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: reason }) }),

// HR — Documents (#137, #147)
getAttachmentViewUrl: (attachmentId, params) => request(`/payroll/hr/attachments/${attachmentId}/view-url${buildQuery(params)}`),
attachForm16PartA: (userId, financialYear, payload) => request(`/payroll/hr/employees/${userId}/tax/form16/${encodeURIComponent(financialYear)}/part-a/attachment`, { method: "POST", body: JSON.stringify(payload) }),

// HR — Benefit plans & enrollments (#138–#146)
createBenefitPlan: (payload) => request("/payroll/hr/benefit-plans", { method: "POST", body: JSON.stringify(payload) }),
getBenefitPlans: (params) => request(`/payroll/hr/benefit-plans${buildQuery(params)}`),
getBenefitPlan: (id) => request(`/payroll/hr/benefit-plans/${id}`),
updateBenefitPlan: (id, payload) => request(`/payroll/hr/benefit-plans/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
deactivateBenefitPlan: (id) => request(`/payroll/hr/benefit-plans/${id}`, { method: "DELETE" }),
enrollInBenefitPlan: (planId, payload) => request(`/payroll/hr/benefit-plans/${planId}/enrollments`, { method: "POST", body: JSON.stringify(payload) }),
getBenefitPlanEnrollments: (planId, params) => request(`/payroll/hr/benefit-plans/${planId}/enrollments${buildQuery(params)}`),
getEmployeeBenefitEnrollments: (userId, params) => request(`/payroll/hr/employees/${userId}/benefit-enrollments${buildQuery(params)}`),
endEmployeeBenefitEnrollment: (userId, enrollmentId, payload) => request(`/payroll/hr/employees/${userId}/benefit-enrollments/${enrollmentId}/end`, { method: "POST", body: JSON.stringify(payload) }),

// Manager — Team claims & benefits (#148–#153)
getTeamReimbursementClaims: (params) => request(`/payroll/manager/reimbursements/claims${buildQuery(params)}`),
getTeamReimbursementClaim: (id) => request(`/payroll/manager/reimbursements/claims/${id}`),
approveTeamReimbursementClaim: (id, payload) => request(`/payroll/manager/reimbursements/claims/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
rejectTeamReimbursementClaim: (id, reason) => request(`/payroll/manager/reimbursements/claims/${id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: reason }) }),
getTeamAttachmentViewUrl: (attachmentId, params) => request(`/payroll/manager/attachments/${attachmentId}/view-url${buildQuery(params)}`),
getTeamBenefitEnrollments: (params) => request(`/payroll/manager/team/benefit-enrollments${buildQuery(params)}`),

// Employee Self-Service — Claims, documents & benefits (#154–#166)
getMyReimbursementCategories: () => request("/payroll/me/reimbursements/categories"),
createMyReimbursementClaim: (payload) => request("/payroll/me/reimbursements/claims", { method: "POST", body: JSON.stringify(payload) }),
getMyReimbursementClaims: (params) => request(`/payroll/me/reimbursements/claims${buildQuery(params)}`),
getMyReimbursementClaim: (id) => request(`/payroll/me/reimbursements/claims/${id}`),
replaceMyReimbursementClaim: (id, payload) => request(`/payroll/me/reimbursements/claims/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
submitMyReimbursementClaim: (id) => request(`/payroll/me/reimbursements/claims/${id}/submit`, { method: "POST" }),
cancelMyReimbursementClaim: (id, reason) => request(`/payroll/me/reimbursements/claims/${id}/cancel`, { method: "POST", body: JSON.stringify(reason ? { cancellation_reason: reason } : {}) }),
requestClaimReceiptUpload: (claimId, itemId, payload) => request(`/payroll/me/reimbursements/claims/${claimId}/items/${itemId}/attachments`, { method: "POST", body: JSON.stringify(payload) }),
requestDeclarationProofUpload: (itemId, payload) => request(`/payroll/me/tax/declarations/items/${itemId}/attachments`, { method: "POST", body: JSON.stringify(payload) }),
confirmMyAttachment: (attachmentId) => request(`/payroll/me/attachments/${attachmentId}/confirm`, { method: "POST" }),
deleteMyAttachment: (attachmentId) => request(`/payroll/me/attachments/${attachmentId}`, { method: "DELETE" }),
getMyAttachmentViewUrl: (attachmentId, params) => request(`/payroll/me/attachments/${attachmentId}/view-url${buildQuery(params)}`),
getMyBenefits: () => request("/payroll/me/benefits"),
```

The S3 `PUT` is **not** added here. It does not go through `request()` (§5.3), so it lives in `payrollAttachments.js`.

### 11.2 Hooks

| Hook | Where | Kind | Use |
|---|---|---|---|
| `usePagedList` | `shared/attendance` | R | #133, #144, #145, #148, #153 (full), #156 |
| `useEmployeeDirectory` | `roles/hr/payroll` | R | HR name lookups and employee pickers |
| `useTeamNames` + `resolvePerson` | `shared/attendance` | R | Manager name lookups |
| `useToast` | `roles/hr/payroll` | R | All four Phase 5 pages |
| `useAuth` | `shared/contexts` | R | `user.id` for `isOwnClaim` |
| `useMyCategories` | local to `MyReimbursementsPage` | N | #154 loaded once, with `reload()` after submit or withdraw; returns `{ rows, byId, status, reload }` |
| `usePlanDetail` | *(not created)* | — | Plan detail uses the page-local request-id pattern, like Adjustments' `reloadDetail` |

"Types" are JSDoc on the normalizers (e.g. `@returns {{ id, userId, number, title, status, stage, total, approved, currentLevel, totalLevels, payoutMonth, appliedRunId, items: ClaimItem[], approvals: ApprovalRow[], limits: LimitRow[] }}`). No `.d.ts` or TypeScript files.

### 11.3 Refresh after each mutation (no query keys exist)

| Mutation | Reload |
|---|---|
| #128 / #131 / #132 | categories list; open category detail (on failure) |
| #135 / #136 / #150 / #151 | the page's claims list (silent); close the detail. On failure: re-fetch the detail if still open, and the list. |
| #138 / #141 / #142 | plans list; plan detail stats (#140) |
| #143 / #146 | members table (#144) or employee table (#145); plan stats (#140) |
| #147 | the panel's Form 16 fetch (#114) |
| #155 / #158 | my claims list (silent); editor state from the response |
| #159 / #160 | my claims list; `useMyCategories.reload()`; detail closed or re-fetched |
| #161→#163 / #164 | item attachment chips from the response; re-fetch #157 when the editor closes |
| #162→#163 / #164 | the declaration row's chips; re-fetch #122 when available (G5-2) |
| #23 settings | settings state from the response (existing) |

---

## 12. Permissions

This follows the current payroll implementation. The **backend is the authority**; the frontend (a) keeps users out of the wrong workspace, (b) never offers an action the backend refuses, and (c) turns every refusal into a readable message.

### 12.1 Page access

| Page | Workspace guard | Backend roles | If the call is refused |
|---|---|---|---|
| HR Reimbursements / Benefits | `hr` (admins can enter the workspace) | `hr` only; `admin`/`super-admin` get `403` (D-14) | Error panel: `payrollErrorMessage` → "You don't have permission to do this." / `FEATURE_NOT_AVAILABLE` text. No blank table. |
| Team Claims & Benefits | `manager` (HR may enter) | `manager`, `hr` (HR sees global scope) | Same |
| My Claims & Benefits (all 3 mounts) | own workspace | any tenant role | Same |
| Tax/Year-End/Payslip additions | unchanged | unchanged | Existing handling |

### 12.2 Action matrix (what the UI offers)

| Capability | Employee | Manager | HR | UI gate |
|---|---|---|---|---|
| Create / edit / submit / discard own draft | ✓ | ✓ (self mount) | ✓ (self mount) | `claimActions(audience:"self")` |
| Withdraw own submitted claim | ✓ | ✓ | ✓ | status ∈ submitted, under_review |
| Upload / remove receipts on own draft | ✓ | ✓ | ✓ | draft only |
| View receipts | own | team claims (receipts only) | all | Button appears only on attachments present in the payload the viewer received |
| Approve / trim / reject level 1 | — | direct/indirect reports, not own | — (see Q-10) | `canDecide` for manager |
| Approve / trim / reject HR level | — | — | any, not own | `canDecide` for hr |
| Categories CRUD | — | — | ✓ | HR page only |
| Plans CRUD, enroll, end cover | — | — | ✓ | HR page only |
| Team benefits (amounts) | — | when `aggregates_only === false` | (HR uses HR pages) | Response-driven. The UI never infers visibility from settings. |
| Upload proofs | own open declaration | — | — | declaration status |
| View proofs / Part A | own | **never** (D-28) | all | Manager screens never render tax attachments |
| Attach Part A | — | — | ✓ (link; upload flagged) | `PART_A_UPLOAD_ENABLED` |
| Change the 3 settings | — | — | ✓ | Payroll Settings |

**Own claim rule.** A claimant never gets Approve or Reject, even when the backend would route the claim to their level. `isOwnClaim(claim, useAuth().user?.id)` compares `claim.user_id` to the JWT `id`/`sub`. Both are `users.id`, the same key every payroll `user_id` uses. If `user.id` is unavailable (auth still hydrating), actions stay disabled.

---

## 13. Error and Edge Cases

### 13.1 Scenarios

| Scenario | Handling (existing pattern) |
|---|---|
| **API failure on list** | Rose panel with message + "Try again" (Adjustments). Filters stay as they were. |
| **API failure on detail** | Keep the list-row data visible. Toast "Couldn't load the full claim. Showing what the list has." Actions stay disabled. |
| **Network down** | `payrollErrorMessage` already maps a `TypeError` to "Couldn't reach the server…". |
| **Empty results** | Two messages: filtered vs first use (§8). Team with no reports: "No claims from your team yet." |
| **Invalid or foreign id** | Payroll returns `403` for out-of-scope and missing alike (EC-24), or a 404 code on HR. Close the dialog, toast the mapped message, reload the list. Never show a raw id. |
| **Duplicate submission** | `busyRef` / `savingRef` guard every mutation. Buttons are disabled with a spinner. The server is idempotent too: a double click returns `409 CLAIM_NOT_ACTIONABLE` / `CLAIM_NOT_DRAFT`; the UI treats that as "Already done. Refreshing." and reloads. |
| **Slow requests** | Loaders show Skeleton. Stale responses are dropped by request id (`usePagedList`, `detailReq`). Uploads show the stage text. |
| **Permission failure** | §12.1. On an action: the toast / ReasonDialog error shows the mapped `FORBIDDEN`, `SELF_APPROVAL_FORBIDDEN` or `NOT_YOUR_APPROVAL_LEVEL`, and the detail reloads. |
| **Server validation** | `VALIDATION_ERROR` shows the humanized first Joi message in the form banner. Mark the quoted field when it is recognisable. |
| **Stale data (someone else acted)** | Every failed action reloads the list and the open detail (`guarded` pattern). A 409 on approve means the claim moved on; the dialog closes and the fresh state is shown. |
| **Direct URL access** | Wrong workspace → `ProtectedRoute` redirects. Unknown `?tab` → default tab. Unknown `?status` → ignored. |
| **Invalid workflow transition** | Buttons derive from `claimActions`, so an invalid transition is not offered. If the server still refuses (race), show its mapped message and reload. |
| **Already processed / locked records** | Terminal claims show a `DetailFooterNote`. A category in use → 409 message. A plan with members → Deactivate disabled with a hint. A closed payroll month on enroll/end → `PERIOD_CLOSED_FOR_ADJUSTMENT` message. |
| **No open payout month** | `NO_OPEN_PAYOUT_PERIOD`: "No payroll month in the next N months is open, so this claim can't be scheduled. Open or cancel the approved payroll run, or raise the look-ahead in Payroll Settings." plus the server's month list. The claim stays with HR. |
| **Calculation running** | `RUN_CALCULATION_IN_PROGRESS` on approve / enroll / end: keep the dialog open with "A payroll calculation is running. Try again in a moment." |
| **Limit exceeded** | `CATEGORY_LIMIT_EXCEEDED`: list each violation as "<Category> · <period>: limit ₹L, already approved ₹P, this claim ₹A, over by ₹(A−remaining)". Read from `details.violations ?? details.errors ?? violations`; if no details, show the server message. Employee: the editor stays open. Approver: the decision dialog stays open. |
| **Receipt missing at submit** | `RECEIPT_REQUIRED`: highlight the named item (`details.item_id` if sent; otherwise match the item description in the message; otherwise banner only). |
| **Self-approval** | `SELF_APPROVAL_FORBIDDEN`: "You can't approve or reject your own claim. Another approver has to. If you're the only HR user, invite a second HR user." |
| **Category deactivated while drafting** | #155/#158 `CATEGORY_NOT_FOUND_OR_INACTIVE`: reload #154, mark rows whose category is no longer offered: "This category was switched off. Choose another." |
| **Receipts lost by item replace** | G5-3 confirm (§7.7 rule 3). |
| **Upload link expired (10 min)** | S3 PUT fails with 403 → stage `put` error → retry issues a new link. |
| **View link expired (5 min)** | The viewer never reuses a URL; "Retry" or reopening fetches a new one. |
| **Storage unavailable** | `ATTACHMENT_STORAGE_UNAVAILABLE`: "File storage isn't reachable right now. Nothing else was changed." Other claim actions keep working. |
| **CORS not configured** | The S3 PUT throws `TypeError`. Message: "Couldn't send the file to storage." Developer note in §14: the bucket's CORS must list every app origin. |
| **Unsupported file** | Rejected before any request (SVG, HEIC, >10 MB, empty). |
| **All items rejected in an approval** | Label and confirm per §7.5. Result toast says the claim is rejected. |
| **Straddling claim (two limit windows)** | Limits table shows one row per `period_key`. The preview maps items per §7.5 or defers to the server. |
| **Enrollment overlap** | `ENROLLMENT_PERIOD_OVERLAP` / `ALREADY_ENROLLED`: inline on the date field. |
| **Mid-month start/end** | D-36 notices at the moment of choosing the date and in the result toast. |
| **Benefit deductions switched off** | Benefits page banner. The Run Dashboard note already says "would be charged if enabled". |
| **Warning `DUPLICATE_BENEFIT_ENROLLMENT` on a run item** | Already explained by `WARNING_META` (reuse). |
| **Claim number while draft** | Never show `DRAFT-…`; show "Draft". |
| **UUIDs** | Never rendered. Names come from the directory or team names, falling back to "Loading…", "Name unavailable" or "Team member". |
| **Approved claim edited by HR later** | Not supported (Phase 7 corrections). The footer note says so. |

### 13.2 Error codes to add to `payrollErrors.js`

Plain wording, same voice as the existing table:

| Code | Message |
|---|---|
| `CATEGORY_CODE_EXISTS` | A category with this code already exists. Choose a different code. |
| `CATEGORY_NOT_FOUND` | This category no longer exists. Refresh the list. |
| `CATEGORY_IN_USE` | Some claims using this category are still open, so it can't be switched off yet. Try again once they are paid, rejected or withdrawn. |
| `CATEGORY_NOT_FOUND_OR_INACTIVE` | One of the categories was switched off or removed. Choose another category for that item. |
| `COMPONENT_NOT_FOUND` | That salary component no longer exists. Choose another one or leave it empty. |
| `CLAIM_NOT_FOUND` | This claim no longer exists. Refresh the list. |
| `INVALID_CLAIM_AMOUNT` | Each amount must be more than zero. |
| `CLAIM_NOT_DRAFT` | This claim was already submitted, so it can't be changed. Refresh to see where it stands. |
| `CLAIM_HAS_NO_ITEMS` | Add at least one expense before submitting. |
| `RECEIPT_REQUIRED` | A receipt is needed for one of the items before you can submit. |
| `CATEGORY_LIMIT_EXCEEDED` | This goes over a spending limit for the category. Lower the amount and try again. |
| `CLAIM_NOT_ACTIONABLE` | This claim has already been decided or withdrawn. Refresh to see its current state. |
| `NOT_YOUR_APPROVAL_LEVEL` | This claim is waiting for a different approver right now. |
| `SELF_APPROVAL_FORBIDDEN` | You can't approve or reject your own claim. Another approver has to. If you're the only HR user, invite a second HR user. |
| `APPROVED_EXCEEDS_CLAIMED` | An approved amount can't be more than what was claimed. |
| `CLAIM_NOT_CANCELLABLE` | This claim can't be withdrawn any more. It may already be approved. Contact HR. |
| `NO_OPEN_PAYOUT_PERIOD` | No open payroll month was found in the look-ahead window, so this claim can't be scheduled yet. *(+ server message)* |
| `REJECTION_REASON_REQUIRED` | Write a reason for rejecting it. |
| `PLAN_CODE_EXISTS` | A benefit plan with this code already exists. Choose a different code. |
| `PLAN_NOT_FOUND` | This benefit plan no longer exists. Refresh the list. |
| `PLAN_NOT_ENROLLABLE` | This plan is switched off or isn't valid on that date. |
| `PLAN_HAS_ACTIVE_ENROLLMENTS` | People are still enrolled in this plan. End their cover before switching it off. |
| `ALREADY_ENROLLED` | This person already has active cover in this plan. |
| `ENROLLMENT_PERIOD_OVERLAP` | This person already has cover in this plan for that month. Start from a later month. |
| `ENROLLMENT_NOT_FOUND` | This enrollment no longer exists. Refresh the list. |
| `ENROLLMENT_NOT_ACTIVE` | This cover has already ended. |
| `INVALID_ENROLLMENT_DATES` | The end date can't be before the start date. |
| `ATTACHMENT_NOT_FOUND` | This file isn't available any more. |
| `ATTACHMENT_TYPE_NOT_ALLOWED` | Use a PDF, JPG, PNG or WebP file. |
| `ATTACHMENT_VERIFICATION_FAILED` | The upload didn't finish. Choose the file and upload it again. |
| `ATTACHMENT_STORAGE_UNAVAILABLE` | File storage isn't reachable right now. Nothing else was changed. Try again shortly. |
| `ATTACHMENT_NOT_DELETABLE` | This file can't be removed any more. |
| `DECLARATION_NOT_OPEN_FOR_PROOF` | Proofs can't be added once the declaration is verified, rejected or closed. |
| `INVALID_FINANCIAL_YEAR` | Choose a valid financial year. |
| `INVALID_ATTACHMENT_REFERENCE_URL` | Paste a full link that starts with https://. |

Add a helper `limitViolationLines(err)` beside `bulkErrorLines`, following the same "read only for this code" rule.

---

## 14. Dependencies

### 14.1 Must exist before Phase 5 features work

| Dependency | Needed by | How to check |
|---|---|---|
| **Backend Phase 5 deployed** on the API the app points to (`VITE_API_BASE_URL`, default `development.hrclouds.in`) | everything | `GET /payroll/hr/reimbursements/categories` returns 200. `engine_version: 5` on a new run. |
| **Contract A confirmed** (Q-1) | API layer | Appendix A |
| **S3 bucket + CORS** allowing `PUT` and `GET` from **every frontend origin**: the deployed domain(s) **and `http://localhost:5173`** (Vite dev), with `Content-Type` in `AllowedHeaders` | receipts, proofs | A browser upload from localhost reaches `available` |
| `payroll.access` feature flag on for the org | all pages | Existing |
| Payroll settings row (Phase 1) with the 3 new keys | approval levels, look-ahead, benefit charging | `GET /hr/settings` contains them |
| Reporting-manager mapping in the org module | the manager level of the chain (otherwise claims go straight to HR) | Employee profile → reporting person |
| At least **two HR users** | an HR user's own claims (self-approval bar) | Invite flow |
| Salary component catalog (Phase 1) | optional category/plan mapping | `getComponents()` |
| Employee directory (`GET /organizations/employees`, HR) | HR names and pickers | `useEmployeeDirectory` status `ready` |
| Manager team list (`attendanceAPI.getManagerTeamToday`) | manager names | `useTeamNames` |
| Payroll runs (Phase 2) + period guard (Phase 3) | pay month resolution, recalculation flag, run commit/pay | Existing run flow |
| Tax declarations & Form 16 (Phase 4) | proofs (#162), Part A (#147, #114, #126) | Existing pages |
| `manager_can_view_team_compensation` setting (Phase 1) | team benefits masking | Response-driven |

**Not needed:** attendance data, leave data, new npm packages. The S3 PUT uses `fetch`; no AWS SDK in the browser.

### 14.2 Order-of-use dependencies inside Phase 5

1. **Categories** before any employee claim (#155 needs an active category).
2. **Approval-levels setting** before the first submit if the org wants HR-only approval. The chain is frozen at submit.
3. **Plans** before enrollments; **`benefit_deductions_enabled`** before any charge.
4. **Year finalized** before Form 16 views. A Part A link can be attached before or after finalization (the backend creates the summary row).

---

## 15. Development Sequence

Each step ends with `npx eslint <touched files>` clean and `npm run build` passing. Screens are wired into routes and the sidebar in the same step as the screen, so every step is manually testable.

| # | Step | Files | Depends on | Done when |
|---|---|---|---|---|
| 0 | **Gate:** send Appendix A (P1 questions) to backend. Confirm S3 CORS for localhost and the deployed origins. Smoke-call #129 and #154 on the dev API. | — | — | Q-1, Q-2 answered; a browser PUT from localhost succeeds on a scratch upload |
| 1 | **API layer + error codes** | `payroll.api.js` (§11.1, remove the Phase 5 stubs), `payrollErrors.js` (§13.2 + `limitViolationLines`) | 0 | Build passes; every function name in §11.1 exists |
| 2 | **Meta & normalizers** | `reimbursementMeta.js`, `benefitMeta.js` (incl. `claimStage`, `claimActions`, normalizers, D-36/D-37 text) | 1 | Functions checked by hand against the sample payloads in `phase5_api_analysis.md` (#133, #134, #140, #153 both variants, #154, #166) in the browser console |
| 3 | **Settings keys** | `PayrollSettingsPage.jsx` (§7.8) | 1 | The three keys round-trip through GET → PUT → GET |
| 4 | **Shared document pieces** | `payrollAttachments.js`, `AttachmentUploadButton.jsx`, `AttachmentViewerDialog.jsx` | 1, 0 (CORS) | A throwaway harness (scratchpad, not committed) uploads and views a JPEG and a PDF |
| 5 | **HR categories** | `PayrollReimbursementsPage.jsx` (Categories tab + shell with tabs), `AppRoutes.jsx`, sidebar HR "Reimbursements" | 1, 2 | Create / edit / clear caps (`null`) / deactivate / 409 in-use / reactivate |
| 6 | **Employee claims** | `MyReimbursementsPage.jsx` (claims + limits tabs, `ClaimEditorDialog`), `ClaimDetailSections.jsx` (self parts), sidebar rename | 4, 5 | Draft → receipts → submit → withdraw; receipt-required and limit errors render; G5-3 confirm fires |
| 7 | **Shared decision UI + manager review** | `ClaimDecisionDialog.jsx`, `ClaimDetailSections.jsx` (limits, timeline), `TeamReimbursementsPage.jsx` (claims tab), sidebar rename | 6 | Manager approves with a trim → `under_review`; rejects; can't act on own claim; limit preview blocks over-limit |
| 8 | **HR claims queue** | `PayrollReimbursementsPage.jsx` (Claims tab) | 7 | HR final approval shows the pay month; `NO_OPEN_PAYOUT_PERIOD` and `RUN_CALCULATION_IN_PROGRESS` render; level-1 claims show "Waiting for the manager" |
| 9 | **Self-service mounts** | `AppRoutes.jsx` (`/dashboard/{hr,manager}/my-reimbursements`), sidebar "My Claims & Benefits" | 6 | A manager's own claim routes to HR; HR's own claim can't be approved by the same HR |
| 10 | **HR benefits** | `PayrollBenefitsPage.jsx` (plans, members, by-employee, dialogs), route re-point, sidebar "Benefits", **delete** `BenefitsAndReimbursementsPage.jsx` | 2, 3 | Create plan, enroll (override 0 vs blank), overlap 409, end cover with D-36 text, deactivate blocked while members exist |
| 11 | **Benefit views** | `MyReimbursementsPage.jsx` (benefits tab), `TeamReimbursementsPage.jsx` (team benefits tab, both variants) | 10 | Aggregates variant renders when the compensation toggle is off |
| 12 | **Tax documents** | `TaxDeclarationsPage.jsx` (proof view), `MyTaxAndInvestmentsPage.jsx` (proof upload/view/delete; Part A view), `YearEndClosurePage.jsx` (Part A link; flagged upload) | 4 | Proof uploaded by the employee opens for HR in verification; Part A link visible to the employee |
| 13 | **Payslip semantics** | `PayrollRunDetailPage.jsx` (`RunItemDialog` split, §5.4), `MyPayslipsPage.jsx`, `TeamPayslipsPage.jsx`, `variablePayMeta.js` reserved codes, optional Run Dashboard link | 1 | A run item with a reimbursement shows it outside Earnings, and the net-pay note appears |
| 14 | **Hardening pass** | all Phase 5 files | 5–13 | Every row of §13.1 exercised; no "—"; no UUID visible; every `window.confirm` awaited |
| 15 | **Registry + regression** | `api_registry.md` ticks; §16 checklist | 14 | §17 all checked |

Critical path: 0 → 1 → 2 → 4 → 5 → 6 → 7 → 8. Benefits (10–11) can run in parallel after step 3. Documents (12) need step 4 only.

---

## 16. Testing Plan

The repo has **no automated test runner**. Verification is lint on touched files, `npm run build`, and the manual checklist below against the dev backend. Use three accounts: an employee with a manager, that manager, and two HR users. Record results in `PAYROLL_PHASE5_FRONTEND_AUDIT.md` (same folder) when done.

### 16.1 API integration
- [ ] Every function in §11.1 is called at least once from the UI (Network tab), with the exact path and method.
- [ ] Money is sent as numbers; cleared caps are sent as `null`; unknown keys are never sent (no `period_month`, `notes`, `payout_period_month`).
- [ ] List responses with both `data: []` + `pagination` and `data: { rows, count }` render.
- [ ] No request sends `Authorization` to S3; the S3 PUT carries only `Content-Type`.

### 16.2 Forms & validation
- [ ] Category: required fields; code uppercase and read-only on edit; receipt threshold only when a receipt is needed; 0 cap accepted with helper text; per-claim > period warning.
- [ ] Plan: amounts ≥ 0; both-zero warning; the D-37 and D-36 notes are visible; code/type read-only on edit.
- [ ] Enrollment: date inside the plan window; override blank vs 0 sent correctly; overlap pre-warning; server 409 inline.
- [ ] End cover: date ≥ start; reason required; D-36 text shows the right months.
- [ ] Claim editor: title length; ≥1 item to submit; future date blocked; amount 2 decimals; category from #154 only; receipt-needed rows block submit; per-claim and remaining hints.
- [ ] Decision dialog: trimmed or rejected items need a remark; approved amount ≤ claimed; all-rejected label and confirm; limit preview blocks over-limit.
- [ ] Settings: the three keys save and reload.
- [ ] `VALIDATION_ERROR` shows the humanized message in the banner.

### 16.3 Tables, filters, pagination
- [ ] Every filter changes the request params and resets to page 1.
- [ ] Prev/next pages work; after the last row on a page is actioned, the list steps back a page.
- [ ] Page search filters only visible rows and says so.
- [ ] Filtered-empty vs first-use empty messages.
- [ ] Names resolve (HR directory, manager team names); no UUID ever rendered; "Draft" instead of `DRAFT-…`.

### 16.4 Workflow
- [ ] Two-level org: employee submits → manager approves with a trim → HR approves → pay month shown → run calculated includes it → run approved → claim "in payroll" → run paid → "Paid".
- [ ] One-level setting: submit goes straight to HR; manager screen shows it read-only.
- [ ] Employee without a manager: goes straight to HR.
- [ ] Manager's own claim: not approvable by themselves; routes to HR.
- [ ] HR's own claim: the same HR can't act and sees the "invite a second HR" note; the other HR can.
- [ ] Withdraw from submitted and from under_review works; withdraw after approval shows `CLAIM_NOT_CANCELLABLE`.
- [ ] Manager rejects → terminal, no HR step; HR reject → terminal.
- [ ] Current month's run approved → approval resolves to next month; no open month → `NO_OPEN_PAYOUT_PERIOD` text.
- [ ] Approving while a calculation runs → retry message, dialog stays open.
- [ ] Two approvers race → the loser sees "already decided" and a refreshed state.
- [ ] Enrollment: start mid-month, end mid-month texts; deactivate plan blocked with members; benefit deductions off banner.

### 16.5 Documents
- [ ] Receipt: jpg, png, webp, pdf upload and view inline; svg, heic, >10 MB and empty rejected before any request.
- [ ] Remove receipt on a draft; no remove after submit.
- [ ] Saving changed items after receipts → confirm → receipts gone → re-upload works.
- [ ] Manager views a team receipt; manager screens never show a proof or Part A.
- [ ] Employee proof on a submitted declaration → HR sees and opens it in verification.
- [ ] HR links Part A → employee sees "View Part A" in Form 16 tab.
- [ ] Viewer after 5+ minutes open → retry fetches a new URL.
- [ ] Storage outage (or a wrong bucket in a test env) → `ATTACHMENT_STORAGE_UNAVAILABLE` text; claim actions still work.

### 16.6 Permissions & routing
- [ ] Employee opening `/dashboard/hr/payroll/reimbursements` → redirected.
- [ ] Admin role on HR payroll pages → readable 403 panel, not a blank table.
- [ ] Manager with `manager_can_view_team_compensation = false` → aggregates view.
- [ ] `?tab=` deep links for every tab; an invalid tab falls back.
- [ ] Sidebar highlights the right item on each new route (all three workspaces).

### 16.7 Success / error states
- [ ] Every mutation shows one toast (`PayrollToast`), and the toast is never hidden behind a dialog.
- [ ] Every code in §13.2 has been triggered at least once or reviewed against the backend doc.
- [ ] Double clicks on Save / Submit / Approve / Enroll send exactly one request.

### 16.8 Phase 1–4 regression
- [ ] Payroll Runs: create, calculate, preview (payout block), item dialog (earnings/deductions/employer sections; reimbursements now separate), approve, cancel, pay.
- [ ] Adjustments: create (reserved codes `REIMBURSEMENT` / `BENEFIT` refused), bulk, approve/reject/cancel.
- [ ] Bonus rules, Loans, Bank Verification, Audit Log unchanged.
- [ ] Tax Declarations verify/reject/reopen still work with and without proofs.
- [ ] Year-End: finalize one and org-wide; the Part A ack/reference form (#115) still saves.
- [ ] My Tax: declarations save/submit/proof references (#127) still work; Form 16 fetch.
- [ ] My Payslips / Team Payslips open for a run with **no** reimbursements or benefits (blocks hidden, no ₹0 rows).
- [ ] Payroll Settings: existing fields unchanged after saving the new section.
- [ ] `PayrollReportsPage` placeholder still renders (FeatureNotAvailable kept).
- [ ] `npm run build` clean; `npx eslint` on every touched file shows no new errors.

---

## 17. Definition of Done

Phase 5 frontend is done when **all** of these hold:

- [ ] Appendix A P1 questions answered and §0 updated to the confirmed contract.
- [ ] All 39 APIs (#128–#166) are implemented in `payroll.api.js` and each has a working consumer (§5.5). #147 variant A is either working (G5-1 resolved) or explicitly flagged off, with the reason in this file.
- [ ] The extended endpoints are consumed: settings keys, #44 item split, #53–#56 payslip blocks, #106 proofs, #114/#126 Part A, #122 attachments (if sent).
- [ ] The 4 pages in §3.1–§3.4 are complete; `BenefitsAndReimbursementsPage.jsx` is deleted; the 8 modified pages in §3.5 are updated.
- [ ] Routes (§10.1) and sidebar entries (§10.2) work in all three workspaces, including the manager and HR self-service mounts.
- [ ] Permissions (§12): own-claim, level and D-28 rules are enforced in the UI; refusals render readable messages.
- [ ] Forms and validation (§7) match this file; server errors map through `payrollErrorMessage` with every §13.2 code present.
- [ ] Tables, filters and pagination (§8) match this file; no client sorting on paged data; no UUIDs; no "—".
- [ ] Workflow/status handling (§9) comes from `claimStage` / `claimActions` only. No screen hard-codes status logic.
- [ ] Loading, empty and error states are present on every list, detail and dialog (§13.1).
- [ ] No duplicate components: claim detail, decision dialog, viewer and upload button exist once, in `shared/components`, and are used by every role that needs them.
- [ ] Existing style followed: rebuilt-generation helpers, purple theme, z-index layers (§1.5), awaited `window.confirm`, `ReasonDialog` for required text, plain language, D-31 / D-36 / D-37 wording.
- [ ] Phase 1–4 regression checklist (§16.8) passes.
- [ ] `npm run build` passes; `npx eslint` on all touched files introduces no new errors.
- [ ] The main workflows in §16.4 and §16.5 were verified by hand against the dev backend, with results written to `PAYROLL_PHASE5_FRONTEND_AUDIT.md`.
- [ ] `api_registry.md` UI columns ticked for #128–#166.

---

## Appendix A — Questions for the backend

Send before step 1. **P1** blocks the build, **P2** degrades a feature, **P3** is wording or clean-up.

| # | Pri | Question | Frontend default until answered |
|---|---|---|---|
| Q-1 | P1 | Which contract ships on `development`: A (`phase5_api_analysis.md` / `api_registry.md`) or B (`combined_api_analysis-3.md` Phase 5 section)? Is B's section stale? | Contract A |
| Q-2 | P1 | How does HR confirm a Form 16 Part A **upload** from #147? #163 only accepts attachments whose `user_id` is the caller, and a Part A's `user_id` is the employee. | Ship the reference-link variant only; upload flag off |
| Q-3 | P2 | Does `GET /me/tax/declarations` (#122) return `items[].attachments[]`? Without it an employee can't see their uploaded proofs after a reload. | Read defensively; session-only list |
| Q-4 | P2 | #158 requires the full item list and deletes receipts of replaced items. Can title-only updates skip `items`, or can unchanged items (sent with `item_id`) keep their receipts? | Dirty check + confirm before replacing |
| Q-5 | P2 | Can claim lists (#133, #148), plan members (#144) and team benefits (#153) include the employee name (same ask as G-2)? | Directory / team-name lookup |
| Q-6 | P2 | Exact error payloads: does `CATEGORY_LIMIT_EXCEEDED` carry `details.violations[]` (keys?) and does `RECEIPT_REQUIRED` carry the item id? | Defensive reads; message fallback |
| Q-7 | P2 | #154: is `period_key` / `consumed` / `remaining` for the current window only, and what is sent for a category with no period limit (`remaining: null`, `consumed`?) | Treat missing as "No limit" |
| Q-8 | P2 | Should HR's #133 return `draft` claims at all? | Hide the Draft filter option |
| Q-9 | P3 | Enrollment status `cancelled` has no writer in the documented API. Is there a cancel action, or is it legacy? | Display only |
| Q-10 | P2 | HR is admitted to the manager routes with global scope. Can HR approve level 1 through #150 (an override)? Is that intended? | Not exposed in the UI |
| Q-11 | P3 | Approve body: is sending **every** item (including unchanged ones) fine, and is a rejected item `{ item_status: "rejected", approved_amount: 0 }` the expected form? | Send every item that way |
| Q-12 | P3 | Are money fields accepted as JSON numbers (as in Phase 3), or only as strings? | Numbers |
| Q-13 | P2 | Payslip detail #53–#56: exact keys of `reimbursements[]` and `benefits[]`, and whether they sit on `data` or `data.item`. | Read both places |
| Q-14 | P3 | Minimum length for `rejection_reason` (B says 5). | 5 |
| Q-15 | P3 | #140 shape: `{ plan, active_enrollment_count, monthly_cost_total }` or flat? | Accept both |
| Q-16 | P2 | CORS: which origins are allowed on the payroll bucket in dev/staging/prod (need `http://localhost:5173` for development)? | Blocks step 4 locally |
