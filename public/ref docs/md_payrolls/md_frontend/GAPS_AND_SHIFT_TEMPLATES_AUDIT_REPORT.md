# Audit: Payroll Gaps G-1…G-8 and Shift Template API Changes

**Date:** 2026-09-15
**Scope:** frontend work for two backend documents:
- `md_payrolls/md_frontend/PAYROLL_BACKEND_GAPS_RESPONSE.md`: the backend's final contracts for gaps G-1 to G-8
- `md_updates/update_shift_templates_2026_09_14.md`: shift template fields removed, filters allow-listed, error status corrected

## 1. Result

| Check | Result |
|---|---|
| Contract checks against both documents' sample payloads | **104 / 104 pass** |
| `npm run build` | Succeeds. The only warning is the chunk-size warning that was already there. |
| ESLint on the 16 changed files | **0 new errors.** 6 errors already exist in the committed versions (unused `React` imports, two apostrophes, `_` in `payroll.api.js`). |
| Tested against a live backend | **No.** The backend says none of G-1 to G-8 is built yet. The shift change is live, but was not exercised from a browser. |
| Committed | No |

Other uncommitted work (reimbursements, benefits, Form 16) touches some of the same files: `PayrollRunDetailPage.jsx`, `payroll.api.js`, `payrollErrors.js` and `variablePayMeta.js`. It was left untouched. Only the lines listed below changed.

## 2. Payroll gaps G-1 to G-8

Every gap is additive. The backend confirmed that, until each ships, the new keys are **absent**, not `null`. So each change below reads the field only when it is present, and otherwise keeps today's behaviour. Shipping a gap needs no frontend release.

| Gap | Backend contract (final) | Frontend change | Before it ships | After it ships |
|---|---|---|---|---|
| **G-2** Names in responses | `employee {user_id, name, employee_code, department, is_active}`; actor `<field>_user {user_id, name}`; `?include=employee` | **Request:** `include=employee` is sent on run items (list and detail), run preview, adjustments (list and detail) and bonus impact. **Reading:** new helpers `embeddedEmployee` and `actorName`. They are preferred on the run page, the adjustments list and detail, the impact dialog and the bonus rule history. **Run page:** loads the organisation list only when some row lacks `employee`. | Names come from the organisation list, as today. | The run page makes no organisation-list requests. Leavers resolve too. |
| **G-8** Founder "Unknown" | Profile row plus backfill; `name` becomes the real name or the email | Comment only. The "Unknown" fallback stays until the backend confirms the backfill in every environment. | Fallback looks the person up. | Fallback never fires. Remove it after confirmation. |
| **G-5** Percent cap | `value ≤ 100` for percentage bonuses; no override flag | The server message maps to "A percentage can't be more than 100%.", shown on the Value field. The form already enforced 100%. | Only the UI protects. | UI and API both protect. |
| **G-3** `failure_code` | String or null; open-ended set of 9 known codes | New run-level advice for all nine codes, shown on the dashboard card and the run banner. Unknown codes show `failure_reason` only. | No advice line. | "What to do" line. |
| **G-4** `error_context` | `inferred_last_working_day`: `"YYYY-MM-DD"` or `null` | `inferredExitDate` treats a present key as final (`null` means unknown, and the sentence is not parsed). It also reads eligibility rows' `reason`. The readiness chips show "last seen …". | Parses the sentence. | Uses the structured field. |
| **G-1** Validation details | `details: [{path, message}]` on `VALIDATION_ERROR` only; CSV codes keep `details.errors` | **Parsing:** `validationProblems`, `formErrorsFrom` and `clearFieldErrors`. **Adjustment and bonus rule forms:** show server errors under the matching field, clear each one when that field is edited, and put any message without a matching field in the banner, so nothing is lost. Branches on `errorCode`, never on the type of `details`. | First message only. | Every problem, highlighted per field. |
| **G-7** `capped` | `capped`, `uncapped_amount` per award | "At limit" follows `capped`, so an amount exactly on the cap is not flagged. The uncapped amount appears in a tooltip, only when capped. `employee` is kept on awards and skips. | Inferred from the cap. | Exact. |
| **G-6** Lean lists | Snapshots only with `?include=snapshots` | None needed. We checked that no list reads a snapshot; the payslip detail reads `day_ledger` from the detail endpoint. | – | Smaller payloads. |

A reply to the backend's four questions is drafted in `PAYROLL_BACKEND_GAPS_CONFIRMATION.md`. It needs your sign-off before it's sent (see §5).

## 3. Shift template API changes

The document's §7 migration checklist, item by item:

| Checklist item | Status | What changed |
|---|---|---|
| Remove `min_hours` from the form | Done | Removed the "Minimum hours", core-hours, second-block and buffer inputs, and their validation. `validateShift` no longer sends any of the seven fields. |
| Remove displays of the dropped fields | Done | Shift list, shift detail (the "Clock-in window" section is gone), the roster's assign picker, the assignment table and the assignment detail. |
| Point "minimum hours" at the policy | Done | The form shows the selected policy's (or the organisation default's) full-day hours, half-day hours and grace period. The detail view keeps them. |
| Audit query strings | Done | No call site sent filters. `getShifts` and `getAssignments` now allow-list parameters: unsupported keys (including `org_id`) are dropped, with a development warning. |
| Validate filter values or handle `INVALID_FILTER` | Done | A malformed `is_active` or UUID is rejected as a promise with the backend's error shape, before any request. `INVALID_FILTER` has a message. |
| `409` checks on `SHIFT_IN_USE` / `PATTERN_IN_USE` | Nothing to change | Nothing branched on 409; errors are matched by code. The message now says "deactivated" and drops the wrong "used in a rotation". |
| Guard `shift_snapshot` reads | Nothing to change | Nothing reads `shift_snapshot`. |
| Stop offering `split` | Done | New shifts are Fixed, Flexible or Night. Split, and Rotational, appear only when editing a shift that already has that type, with a note that Split is worked out like Fixed. |
| Client guards for the two PUT gaps | Done | See R5 and R7 below. |

**Also changed:**
- **Deactivate, not delete:** the Delete button is now Deactivate, with a confirmation that says it can't be undone.
- **Inactive shifts:** hidden by default behind "Show deactivated (n)". They can't be edited, and there is no reactivation.
- **Time zone:** now shown in the shift detail.

## 4. Review findings (all fixed)

| # | Severity | Finding | Fix |
|---|---|---|---|
| R1 | Medium | An unexpected `failure_code` or `errorCode` such as `toString` or `constructor` matched a built-in property of the message lookup and returned a function instead of text. Found by the contract tests. | Lookups check own keys only (`payrollErrorMessage`, `runFailureAdvice`). |
| R2 | Medium | G-4: `inferred_last_working_day: null` alongside an older sentence could have been overridden by parsing the sentence. | A present key is final. |
| R3 | High | Editing a **rotational** shift silently saved it as **Fixed**. The form mapped `rotational` to `fixed`. This bug already existed. | Edits keep the saved type. |
| R4 | High | Switching a shift to Flexible kept its old start and end times, so the engine kept judging lateness against them. | Saving a Flexible shift that had times sends `start_time: null, end_time: null`. The list and detail flag Flexible shifts that still have times. |
| R5 | High | PUT skips the rule that timed types need both times, and a timed shift without times silently stops lateness for everyone on it. | Enforced on edit as well as create. The list ("Check this shift") and detail warn about timed shifts saved without times. |
| R6 | Medium | Every Night shift was sent as `is_overnight: true`, even 00:00–08:00. The backend doesn't infer this. | `is_overnight` comes from the times, for all timed types. A same-day Night shift shows a warning. |
| R7 | Medium | Edit was offered on deactivated shifts, which PUT refuses. A list opened before someone else deactivated a shift could still open the editor. | No Edit or Deactivate on inactive rows. Edit re-fetches the shift and stops if it's inactive. `SHIFT_DEACTIVATED` during a save gets a specific message. |
| R8 | Medium | An unsupported filter silently returns the full list. Rejecting a bad value with a synchronous throw would escape `Promise.all(...).catch`. | Allow-list, and the rejection is returned as a promise. |
| R9 | Low | The `SHIFT_IN_USE` copy said "delete" and "used in a rotation"; the endpoint deactivates and only checks assignments. | Copy corrected. |
| R10 | Medium | `normalizeImpact` dropped `employee` from awards and skips, which would have hidden G-2 names in the impact dialog. | Kept. |
| R11 | Low | `uncapped_amount` equals `amount` when uncapped, so showing it would be noise. | Shown only when `capped` is true. |
| R12 | Low | A server field error could land on a field with no visible input, such as the month picker, and be lost. | Only fields the form renders are mapped. Everything else goes in the banner. |

## 5. Decisions for you

1. **Send the confirmation reply?** It agrees to Wave 1 first and asks for G-8 in parallel. That call belongs to the team's priorities.
2. **Night shift overnight flag:** it is now worked out from the times (R6). A Night shift on the same day is saved as not overnight, with a warning. The alternative is to block it outright.
3. **Deactivated shifts hidden by default.** They pile up because they can never be removed.

## 6. Known limits

- **G-2:**
  - The adjustment and bonus rule pages still load the organisation list, because their pickers need it.
  - Bonus rule history names depend on `GET /bonus-rules/:id` honouring `include`, which is not in the backend's G-2 list (asked in the reply).
- **G-8:** the "Unknown" fallback stays until the backend confirms the backfill per environment.
- **Shift form:** time zone is not editable; the backend default, Asia/Kolkata, applies to new shifts.
- **Rotation Patterns copy:** still says "shift and off-day phases". That is outside this change; off-day phases don't exist.

## 7. Manual checks

**Shifts (live now):**
- Create a Flexible shift with only a name. It should save, with no times sent.
- Edit a Fixed shift to Flexible, save, and re-open it. The times should be gone.
- Edit an existing Rotational shift. The type should stay Rotational.
- Deactivate a shift that has an ongoing assignment. Expect the `SHIFT_IN_USE` message. Deactivate an unassigned shift. It should move behind "Show deactivated".
- Create a Night shift, 22:00–06:00. `is_overnight` should be true.

**Payroll (as each wave lands on `development`):**
- **Wave 1:**
  - Save a percentage bonus of 150 through the API. Expect the message under Value.
  - Submit an adjustment with two invalid fields. Expect both highlighted.
  - Preview a capped rule. "At limit" should appear only where the cap cut the amount.
- **Wave 2:**
  - A failed run shows "What to do".
  - An `EXIT_DATE_REQUIRED` item with `null` shows "couldn't work out".
- **Wave 4:** the HR attendance tab shows no "Unknown".
- **Wave 5:** on the run page, the Network tab shows no `/organizations/employees` requests, and names appear for leavers.

## 8. Files changed

**Payroll:**
- `src/shared/api/payroll.api.js`
- `src/shared/utils/payrollErrors.js`
- `src/roles/hr/payroll/runMeta.js`
- `src/roles/hr/payroll/variablePayMeta.js`
- `src/roles/hr/payroll/useEmployeeDirectory.js`
- `src/roles/hr/payroll/screens/PayrollRunDetailPage.jsx`
- `src/roles/hr/payroll/screens/PayrollRunDashboard.jsx`
- `src/roles/hr/payroll/screens/PayrollAdjustmentsPage.jsx`
- `src/roles/hr/payroll/screens/PayrollBonusRulesPage.jsx`
- `src/roles/hr/components/AttendanceDirectory.jsx`

**Shifts:**
- `src/shared/api/attendance.api.js`
- `src/shared/attendance/validation.js`
- `src/shared/attendance/enums.js`
- `src/shared/utils/attendanceErrors.js`
- `src/roles/hr/attendance/screens/AttendanceShiftsPage.jsx`
- `src/roles/hr/attendance/screens/AttendanceRosterPage.jsx`

**Docs:**
- `PAYROLL_BACKEND_GAPS_CONFIRMATION.md`
- this report
