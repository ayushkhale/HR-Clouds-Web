# Payroll Contract Audit

**Date:** 2026-09-14 · **Branch:** `dev` (uncommitted) · **Scope:** HR payroll screens, aligned with `PAYROLL_BACKEND_RESPONSES.md`, plus a senior review of that work.

## Verification

| Check | Result |
|---|---|
| Contract test: 66 checks run against the backend's sample payloads (scratchpad, not in the repo) | All pass |
| `npm run build` | Succeeds (the chunk-size warning was already there) |
| ESLint on every changed file | No new errors. The remaining ones were already in `HEAD`: unused `React`/icon imports in 6 files, one unescaped `'`, `_` in `payroll.api.js` |
| Live backend | **Not tested.** Every shape comes from the backend's written samples |
| Git | Nothing committed; `dist` rebuilt |

## What was done

1. **Aligned the payroll screens with the backend's answers:** Runs, Run detail, Adjustments, Bonus Rules and the attendance HR tab.
2. **Fixed employee loading on the other five payroll screens:** Loans, Year-End, Audit Log, Bank Verification and Salary Structures.
3. **Prepared the backend gap request:** the frontend now reads the fields the backend proposed, and `PAYROLL_BACKEND_GAPS_REQUEST.md` asks for them.
4. **Reviewed all of the above as a senior frontend pass**, and fixed what the review found (R-series below).

Earlier the same day: `window.confirm` returns a Promise in this app, so un-awaited calls ran the action before the user answered. That was fixed with a lint guard and a hardened `GlobalAlertProvider`.

## Findings and fixes

Severity: **High** means a user-facing failure or data risk. **Medium** means wrong or misleading information. **Low** means an edge case or polish.

### Alignment with the backend contract

| ID | Sev. | Issue | Fix | Where |
|---|---|---|---|---|
| F1 | High | Payroll lists send `pagination` next to `data`; the normaliser only looked inside `data`, so totals and page counts were guessed | Reads both positions | `shared/attendance/normalize.js` |
| F2 | High | Name lookups loaded only 20 employees and left out leavers, which showed as "Employee not found" | Loads every page (100 each) with leavers included, keyed on `user_id` | `shared/utils/orgEmployees.js`, `useEmployeeDirectory.js` |
| F3 | High | The bulk CSV had no `component_code` column (every upload failed), and totals were read under keys that don't exist | Correct headers, `totals.*`, row codes, line errors | `PayrollAdjustmentsPage.jsx`, `variablePayMeta.js` |
| F4 | High | Custom adjustments sent no `component_code` (always 400) | Code field, auto-filled from the name; reserved codes refused | `PayrollAdjustmentsPage.jsx` |
| F5 | High | Bonus `PUT` replaces the whole rule, so edits wiped `component_id` and the cap | Sends every field, with an explicit `null` cap | `PayrollBonusRulesPage.jsx` |
| F6 | Medium | Validation errors showed a generic line instead of the backend's message | Shows the humanised Joi message | `shared/utils/payrollErrors.js` |
| F7 | Medium | 8 guessed error codes don't exist; real codes fell through to prettified text | Real catalogue; per-message period-override text | `payrollErrors.js`, `runMeta.js` |
| F8 | Medium | The day ledger legend used P/L/W/H/O; the real classes are 10 words | Real classes, reason tooltips, unpaid-data warning | `runMeta.js`, `PayrollRunDetailPage.jsx` |
| F9 | Medium | "Needs attention" fell back to preview rows that have no item id | Uses only `items?status=error&limit=200` | `PayrollRunDetailPage.jsx` |
| F10 | Medium | Error and excluded items showed ₹0 pay | N/A in the payslip dialog and the items table | `PayrollRunDetailPage.jsx` |
| F11 | Low | Cancel sent both `cancellation_reason` and `reason` | Sends `cancellation_reason` only | `shared/api/payroll.api.js` |

### Senior review of the generated code

| ID | Sev. | Issue | Fix | Where |
|---|---|---|---|---|
| R1 | High | Once every employee loads, Bank Verification and Salary Structures fire one request per employee **all at once** (hundreds) | At most 6 in flight, applied in batches; a newer load or leaving the page stops the old run | `shared/utils/promisePool.js`, both screens |
| R2 | High | A failed structure lookup read "Not set", inviting a duplicate assignment; a 404 "no bank account" read "Couldn't load" | Distinct "Couldn't load" state; 404 means "none" | `EmployeeSalaryStructuresPage.jsx`, `BankVerificationPage.jsx` |
| R3 | Medium | Excel "CSV UTF-8" files start with a byte-order mark, which breaks the backend's exact header match | Removed on file read and before sending | `PayrollAdjustmentsPage.jsx` |
| R4 | Medium | The header pre-check lowercased names; the backend is case-sensitive | Exact match | `variablePayMeta.js` |
| R5 | Medium | After `BULK_VALIDATION_FAILED` on save, the old "all ready" preview allowed repeated failing saves | Preview cleared; the file must be checked again | `PayrollAdjustmentsPage.jsx` |
| R6 | Medium | After an assignment, the full structures load could overwrite the fresh figure | Refreshed ids are protected from older results | `EmployeeSalaryStructuresPage.jsx` |
| R7 | Medium | Audit Log printed raw UUIDs for unknown people and ignored sibling pagination | "Unknown user"; reads pagination in both positions | `PayrollAuditLogPage.jsx` |
| R8 | Low | Year-End: a slow tax summary could replace the open panel; the panel kept the old year; finalize errors showed UUIDs | Response keyed to the open employee; panel closes on year change; names shown | `YearEndClosurePage.jsx` |
| R9 | Low | "Employee not found" flashed while the directory was loading | Shows "Loading…" or "Name unavailable" by load status | `useEmployeeDirectory.js`, 6 screens |
| R10 | Low | Loans and Year-End reloaded the employee list on every filter or year change | Loaded once | `PayrollLoansPage.jsx`, `YearEndClosurePage.jsx` |
| R11 | Low | Clearing a custom code stopped the auto-fill; a catalog component that disappears could submit a stale code | Clearing hands the code back to the name; guard before save | `PayrollAdjustmentsPage.jsx` |
| R12 | Low | The `.or()` wording rule never matched (underscores); snake_case field names leaked into custom messages | Pattern fixed; bare snake_case spelled out | `payrollErrors.js` |

## Backend gaps G-1 to G-8

Sent to the backend in `PAYROLL_BACKEND_GAPS_REQUEST.md`, in this order:

| Order | Gap | Frontend ready |
|---|---|---|
| 1 | G-2 Names in payroll responses | Partly: nested `employee` object already read; `include=employee` sent once keys are confirmed |
| 2 | G-8 Profile row for the HR who signed the organisation up ("Unknown") | Interim fallback to the org list (shows name or email) |
| 3 | G-5 Server cap on bonus percentages | UI caps at 100%, with a confirmation above 50% |
| 4 | G-3 `failure_code` on failed runs | Yes: "What to do" line on the run card and banner |
| 5 | G-4 `error_context.inferred_last_working_day` | Yes: preferred over parsing the sentence |
| 6 | G-1 All validation problems with paths | Yes for messages; field highlighting to follow |
| 7 | G-7 `capped` / `uncapped_amount` on awards | Yes: explicit flag beats the inference |
| 8 | G-6 Lean list projections | No frontend change needed |

## New shared building blocks

- `src/shared/utils/orgEmployees.js`: `fetchAllOrgEmployees({ includeInactive })`. Every page, de-duplicated by `user_id`. Rows hold PII, so they stay in memory only.
- `src/roles/hr/payroll/useEmployeeDirectory.js`: directory plus `status` plus loading-aware `nameOf(id)`.
- `src/shared/utils/promisePool.js`: `settleWithLimit(items, worker, { concurrency, onSettled })`.

## Open risks and assumptions

- **Unconfirmed by the backend:**
  - the component code format (`^[A-Z][A-Z0-9_]*$`, 2–50 characters)
  - whether a cancelled run blocks a new run for that month
  - the 30-minute "calculation stuck" threshold
- **Leavers:** Bank Verification and Salary Structures list active employees only, so a leaver paid in a final settlement isn't shown there.
- **One failed page:** if any employee page fails, the directory fails as a whole and names read "Name unavailable". It doesn't show a partial list.
- **Per-employee requests:** Bank Verification and Salary Structures still need N requests. A backend list endpoint would remove that.
- **Outside payroll:** `EmployeeProfilePage.jsx` still reads one page of employees.
- **Lint debt:** about 259 errors predate this work, so lint is not a CI gate.

## Manual checks before release

1. Run detail with error and excluded items: names, the N/A figures, "Review & fix", the period override using the inferred date.
2. Bulk upload an Excel "CSV UTF-8" file, then save a file where one employee has since left.
3. A custom adjustment (auto-filled code), and one using a catalog component.
4. Edit a bonus rule that has a cap and a component; confirm both survive.
5. Bank Verification and Salary Structures on the largest organisation: requests stay at 6 or fewer at a time, and Refresh mid-load leaves no mixed data.
6. Audit Log paging and the employee filter; Year-End search by employee code, then switch the financial year with the panel open.
