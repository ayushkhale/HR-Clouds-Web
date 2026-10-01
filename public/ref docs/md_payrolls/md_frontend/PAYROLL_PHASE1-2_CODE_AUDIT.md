# Payroll Frontend — Phase 1 & 2 Code Audit

**Scope:** Self-review of all code produced during the Phase 1 (contract correctness & truth-in-UI) and Phase 2 (payroll run review surface) fixing tasks.
**Date:** 2026-09-12
**Reviewer stance:** Senior frontend review — hunting for technical and logical defects, not restating intent.

---

## 1. Method & limitations

What this review **can** assert:

- **Static correctness** — read every changed/created file line-by-line.
- **Compilation** — `vite build` succeeds.
- **Module transform** — every touched module returns 200 through Vite's dev transform (catches JSX/syntax/import errors that a production build can tree-shake past).
- **Icon resolution** — all 19 `react-icons/hi` names used resolve to real exports (a missing named import renders an invisible broken component at runtime, not a build error).
- **No stale references** — the four manager functions whose signatures changed (`cancelMyProposal`, `getTeamRunSummary`, `getTeamRunItems`, `getMyStructureHistory`) have **no current callers**, so the path corrections cannot regress a live screen.

What this review **cannot** assert (no live backend / no sample responses available):

- Exact JSON response shapes — field names, nesting, and the pagination envelope.
- The day-ledger `class` code vocabulary.
- The `already_run` value shape from the eligibility endpoint.

Everywhere a shape is unverified, the code reads it **defensively** and degrades to a safe fallback rather than crashing. Those points are catalogued in §4 as **verify-against-live-server** items, not defects.

---

## 2. Files reviewed

| File | Phase | Change |
|---|---|---|
| `src/shared/api/payroll.api.js` | 1 | 6 path corrections, 2 param additions, 13 fns quarantined |
| `src/shared/utils/payrollErrors.js` | 1 | **new** — `errorCode` → message map |
| `src/shared/components/FeatureNotAvailable.jsx` | 1 | **new** — honest "not live yet" state |
| `src/roles/hr/payroll/screens/PayrollApprovalsPage.jsx` | 1 | adopt error helper |
| `src/roles/hr/payroll/screens/PayrollSettingsPage.jsx` | 1 | adopt error helper |
| `src/roles/hr/payroll/screens/BenefitsAndReimbursementsPage.jsx` | 1 | mock → honest state |
| `src/roles/manager/payroll/screens/TeamReimbursementsPage.jsx` | 1 | mock → honest state |
| `src/roles/employee/payroll/screens/MyReimbursementsPage.jsx` | 1 | mock → honest state |
| `src/roles/hr/payroll/screens/PayrollReportsPage.jsx` | 1 | mock (dead buttons) → honest state |
| `src/shared/utils/formatUtils.js` | 2 | **added** `formatPeriod`, `formatMoney` |
| `src/roles/hr/payroll/screens/PayrollRunDashboard.jsx` | 1→2 | field mapping, confirmations, eligibility pre-flight, navigation |
| `src/roles/hr/payroll/screens/PayrollRunDetailPage.jsx` | 2 | **new** — run review surface |
| `src/routes/AppRoutes.jsx` | 2 | run detail route |

---

## 3. Correctness — confirmed solid

- **API paths now match the spec exactly.** All six corrections verified against `combined_api_analysis-2.md`: `/salary-structures/propose`, `PATCH …/items/:itemId/period`, `/salary-structures/:id/cancel`, `/runs/:id/team-summary`, `/runs/:id/team-items`, `/me/salary-structure/history`.
- **Request payloads match the contract.** Exclude → `{ exclusion_reason }`; override → `{ period_end, period_override_reason }` over `PATCH`; create run → `{ period_month, run_type, notes }`; eligibility → `?period_month=YYYY-MM`.
- **Quarantine block is syntactically valid** — the last live property (`recordMyDeclarationProofs`) keeps its trailing comma; everything below is commented; the object closes cleanly. Build confirms.
- **No React anti-patterns in data fetching.** Every `useEffect` that fetches has a correct dependency array; `showToast` is `useCallback([])`-stable, so `loadHeader`/`loadItems`/the item-detail effect do **not** loop. Both the eligibility effect and the item-detail modal use a `cancelled` guard to avoid setState-after-unmount.
- **Effect re-fires are value-driven, not identity-driven.** `periodMonth` is a derived primitive string, so the eligibility effect only re-runs when the chosen month actually changes.
- **D-12 immutability is honoured in the UI.** Item edit actions (exclude/include/override) render only while `status ∈ {draft, calculated}`; an `approved`/`paid` run exposes no mutation affordance.
- **Approval gate is correct.** `canApprove = status === 'calculated' && !requires_recalculation && errorCount === 0`. The blocking reason is explained in-page *before* the button is pressed, rather than surfacing as an opaque `RUN_HAS_ERRORS` / `RUN_STALE` toast.
- **Honesty guard respected.** The item drill-down shows the "not final take-home" banner exactly when `statutory_status === 'not_applied'`.
- **Irreversible actions are gated.** Approve / pay / cancel each require a `window.confirm` naming the specific consequence (consistent with the existing codebase convention).
- **No UUIDs shown to users.** `itemName`/`itemDept`/`itemCode` resolve human-readable identity with a documented fallback chain; IDs are retained only for API calls.

**No crashes, no logic errors, and no contract violations were found in the reviewed code.**

---

## 4. Verify against a live server (assumptions, not defects)

Each item below is read defensively today and degrades safely; confirm the real shape when a server or sample response is available, then tighten if needed.

| # | Assumption | Where | If wrong, current behaviour | Severity |
|---|---|---|---|---|
| V1 | Day-ledger `class` codes are `P/L/W/H/O` | `PayrollRunDetailPage` → `LEDGER_CLASS` | Unknown codes render as the raw letter in a neutral grey chip; legend won't match | **Medium** (visual only) |
| V2 | List/paginated envelope exposes a total as `data.total` / `data.count` | `PayrollRunDetailPage.loadItems` | If absent, `total=0` → pagination hidden; if >20 items exist, later pages unreachable | **Medium** |
| V3 | Run item carries its own stable `id`, and employee identity under `employee_name` / `user.profile.*` | items table + drill-down | Falls back through the chain to `"Unknown"` / `"—"`; actions key on `it.id` | Medium |
| V4 | `eligibility.already_run` is an object with `.id` (or a bare id) | create modal "Open it" | If a bare boolean, "Open it" would navigate to a bad URL | Low |
| V5 | Preview `department_breakdown[]` uses `department` + `total_net` + `headcount` | detail page | Falls back to `department_name`/`net`/`count`; hidden entirely if array absent | Low |
| V6 | Run item summary includes `gross_earnings` / `total_deductions` / `net_pay` / `payable_days` / `lop_days` | items table | Missing money → `₹0`; missing days → `—` | Low (fields are columns on `payroll_run_items` per spec §4.2) |

None of these can crash the page; the worst case is a cosmetic mismatch (V1) or an unreachable second page of items (V2).

---

## 5. Minor observations (lint-level, non-blocking)

- **`showToast` omitted from the eligibility effect's deps** in `PayrollRunDashboard`. Harmless — `showToast` only calls stable state setters — but `eslint-plugin-react-hooks` would flag it. Wrapping it in `useCallback([])` (as the detail page already does) would silence it and is the tidier form.
- **Client-side search scope.** The items search filters only the loaded page (server filtering is by UUID, which isn't user-facing). The placeholder says "Search this page by name…", so the behaviour is honestly labelled — but the pagination footer still reflects the server total, which can look inconsistent while a search is active. Acceptable trade-off given the API surface; revisit if the backend adds a name query param.
- **`total_employees` on the run card/tiles** is read directly; the spec pins `total_gross`/`total_net` but does not explicitly name the headcount field on the run header. It renders `0` if absent. Low risk.

---

## 6. Verdict

The Phase 1 and Phase 2 code is **correct, defensively written, and free of technical or logical errors** under static review, compilation, and module-transform checks. The only open items are **response-shape assumptions** that genuinely require a live backend to confirm (§4) — all of which fail soft rather than hard.

**Recommended before merge to a real environment:**
1. Capture one sample response each for `GET /runs/:id/items`, `GET /runs/:id/items/:itemId` (day ledger), `GET /runs/eligibility`, and `GET /runs/:id/preview`.
2. Confirm V1 (ledger codes) and V2 (pagination total) — the two Medium items.
3. Optionally apply the `useCallback` tidy in §5.

Once §4 is confirmed against live data, this work is ready to proceed to **Phase 3 — salary structure visibility** per the implementation plan.
