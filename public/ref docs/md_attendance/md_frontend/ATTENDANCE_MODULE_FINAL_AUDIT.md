# Attendance Module — Final Audit

**Date:** 2026-09-13
**Branch:** `dev` (uncommitted working tree)
**Authoritative contract:** `ATTENDANCE_API_CONTRACT.md`. It supersedes `3_user_…`, `4_manager_…`, `5_hr_…` and `6_webhook_attendance_api.md` wherever they disagree.
- A copy is in `public/ref docs/md_attendance/` and another in `dist/ref docs/md_attendance/`.

**Earlier documents in this series** (same folder):
- `ATTENDANCE_MODULE_AUDIT.md`: the plan.
- `ATTENDANCE_MODULE_FIX_REPORT.md`: the implementation.
- `ATTENDANCE_MODULE_CODE_REVIEW.md`: the review, with 17 fixes.

**Scope:** Phases 1–7, 9 and 10. **Phase 8 (biometric devices and webhook onboarding) is deferred** by product decision.

---

## 1. Verdict

The attendance frontend now matches the verified backend contract for every in-scope endpoint:
- Every open question C1–C22 has been answered by the backend and applied.
- All 14 items on the contract's frontend action list (§10) are done.
- So are the other contract corrections found while applying it (§4 below).

| Measure | Status |
|---|---|
| Open contract questions (C1–C22) | **22 / 22 resolved** (§5) |
| Contract action list (§10): blocking | **3 / 3 fixed** |
| Contract action list (§10): silent data loss | **2 / 2 fixed** |
| Contract action list (§10): correctness | **4 / 4 fixed** |
| Contract action list (§10): simplification | **4 / 4 done** |
| Contract action list (§10): additions | **1 / 1 done** |
| Other contract corrections applied (§4) | **24** |
| Defects fixed in the code review | 17 / 17 |
| Attendance API functions in use by the UI | **92 / 92** (7 device functions are Phase 8; 3 location functions are org-module delegates) |
| Endpoints deliberately *not* called | 1: `GET /manager/team/history`, which is unbounded and ignores filters (§6) |
| Logic tests | 75 pass (IST), 74 (New York), 73 (UTC). Counts differ only by timezone-specific cases. |
| Production build | ✓ |
| ESLint on all touched files | No new findings |

**Verification boundary.** No backend runs in this workspace, so nothing was exercised against the live API. Verification was the build, lint, a Node test suite for all pure logic, and static reference checks (§8). Four response shapes are marked **"not exhaustively verified"** by the backend itself:
- `/shift`
- `/daily-log`
- the comp-off summary
- the recompute count key

For those, the tolerant normalisers are kept deliberately.

---

## 2. Phase status

| Phase | Area | Status |
|---|---|---|
| 1 | Foundation: shared layer, API, dates, errors, events | ✅ Complete; error catalogue rebuilt from contract §3 |
| 2 | Policies, shifts, rotations, roster | ✅ Complete. Policy form now has all 22 fields; rotation off-days removed (C5) |
| 3 | Holidays, weekly offs | ✅ Complete. Weekly-off targeting corrected to `target_users` |
| 4 | Punch card, history, daily log | ✅ Complete. Handles an open overnight shift; server break total |
| 5 | Regularizations, flags, overtime, comp-offs, analytics | ✅ Complete. Contract summary keys; `is_resolved` |
| 6 | Manager queues, team views | ✅ Complete. Team History rebuilt per member |
| 7 | HR comp-offs, comp-off policies, locks, reports, directory | ✅ Complete. Comp-off policy targeting; server-side search |
| 8 | Biometric devices / webhook | ⏸ **Deferred** — see §7 for the known key-loss defect |
| 9 | HR dashboard | ✅ Complete. Grouped defaulters; explicit live date |
| 10 | Hardening: races, caches, redirects, exports | ✅ Complete |

---

## 3. Contract action list (§10) — implementation

### Blocking

| # | Item | Before | Now | Files |
|---|---|---|---|---|
| 1 | **Rotation off-days (C5)** | Off-day phases were sent as `{shift_id: null, is_off: true}`. **Every such rotation got HTTP 400**, and `is_off` would have been stripped anyway. | Off-day phases are removed. Every phase requires a shift, and each entry is exactly `{shift_id, sequence_order, duration_days}`. `rotation_cycle_days` is still derived (the backend doesn't check it) and capped at 365. The modal explains that rest days come from Weekly Off rules targeted at the shifts. | `validation.js`, `AttendanceShiftsPage.jsx` |
| 2 | **`DATE_LOCKED` → `PERIOD_LOCKED` (403)** | All lock error handling keyed on a code the backend never emits, so it was dead code. | `PERIOD_LOCKED` is mapped; `isPeriodLocked()` replaces `isDateLocked()`; `DATE_LOCKED` is removed and tested as no longer special. | `attendanceErrors.js` |
| 3 | **Team History (C15, §8.1)** | Date pickers and pagination were inert. The endpoint returns every record ever for the whole team. | The page is rebuilt on `GET /manager/team/member/:userId/history`, which is filtered and paginated. It has a member picker (roster scoped server-side), from/to dates, pagination, a "Corrected" marker and a work-mode column. `getManagerTeamHistory` is **removed from the API client** so it can't be reintroduced by accident. | `ManagerTeamHistoryPage.jsx`, `attendance.api.js` |

### Silent data loss

| # | Item | Before | Now |
|---|---|---|---|
| 4 | **Weekly-off `excluded_users` (§5.5)** | The form sent `included_users` and `excluded_users`, neither of which exists on weekly-off rules. **Both were stripped, so no employee targeting was ever saved.** | The form sends `target_users` ("Specific Employees"); the exclude control is removed and the UI explains why. `effective_to` is added. The payload comes from the new `validateWeeklyOff()`, which carries only schema keys. |
| 5 | **`work_mode` on clock-out (C18)** | Already correct: it was sent on clock-in only. | Re-verified and commented. `client_timestamp` is now sent on **both** punches as diagnostic metadata (§8.3). |

### Correctness

| # | Item | Now |
|---|---|---|
| 6 | **Comp-off reject writes `cancelled` (C11)** | The fake `rejected` and `pending` states are removed. `cancelled` is labelled **"Rejected / cancelled"** in badges and filters. Manager and HR reject toasts say where the item went. |
| 7 | **My Regularizations tabs don't filter server-side (§4.4)** | The list is fetched unfiltered; tabs filter the loaded page. When there are several pages the UI says the filter applies to the current page, and an empty filtered page keeps its pagination. |
| 8 | **Anomalies expose `is_resolved`, not `status` (C16)** | `anomalyStatusKey()` is used everywhere a flag is shown (My Flags, both daily logs). The note is read from `resolution_notes`. The phantom `unresolved` and `pending` keys are removed. |
| 9 | **Assignment `.xor()` rule (C6)** | `validateAssignment` sends exactly one of `shift_id` / `rotation_pattern_id`, which is tested. An optional `effective_to` is added with an end-before-start check. |

### Simplification

| # | Item | Now |
|---|---|---|
| 10 | **HR regularization list (C1)** | The non-existent `/hr/regularizations` call and its 404/405 fallback are removed. The HR page renders the shared `AttendanceApprovalQueue` in `scope="org"`, which is the same queue, dialog and events as managers use. A banner says only pending requests exist server-side. |
| 11 | **Policy extras (C4)** | The "only if existing policies carry the key" logic is gone. `late_threshold_minutes`, `is_default` and `max_breaks_per_day` are always sent, and the form now covers **all 22 schema fields** (§4). |
| 12 | **Top defaulters (§6.4)** | Fixed groups `most_absent` and `most_late`, each with its own metric: absent days, or late days plus total late minutes. The metric-guessing heuristics are gone and `limit` is sent. |
| 13 | **`/today` breaks (C22)** | `break_duration_minutes` is authoritative for closed breaks, plus live elapsed time of `active_break`. Summing `breaks[]` is only a fallback. |

### Additions

| # | Item | Now |
|---|---|---|
| 14 | **Comp-off policy form (§5.6)** | Adds `max_accumulation` (maximum balance), `priority`, and the four targeting arrays (departments, locations, employment types, job statuses) using live org data. Ranges follow the contract: nullable hours, validity 1–365 or empty for no expiry. The list shows priority, credit rules and scope, and is sorted by priority. |

---

## 4. Other contract corrections applied

These were found while reconciling the full contract; they are not on the backend's §10 list.

| Area | Defect / gap | Fix |
|---|---|---|
| **`/summary` keys (§4.2)** | My Attendance read `holidays`, `weekly_offs`, `total_days` and `total_effective_hours`. None exist, so **four summary cards always showed 0**. The same applied on the HR profile and the manager roster modal. | Now reads `holiday_days`, `weekly_off_days`, `total_records` and `total_hours_worked`; the profile and roster keep the old keys as a fallback. |
| **Error catalogue (§3)** | About 25 real codes were unmapped. | All verified codes are mapped (punch, regularization, authorization, configuration, device). `VALIDATION_ERROR` and the shift/rotation shape errors show the server message. |
| **`UNAUTHORIZED` meaning (§3.3)** | Mapped to "session expired", but attendance emits it as a **403 for cross-org access**. | HTTP 401 means session expired; code `UNAUTHORIZED` means "belongs to a different organisation". |
| **Error key** | Read `errorCode` first. | The contract uses `code`; it is now read first, with `errorCode` as a fallback. |
| **Stale decision refresh (§6.3)** | Stale rows refreshed on `CONFLICT`/409, which isn't the code for this case. | Refreshes on `ALREADY_PROCESSED` / `COMP_OFF_NOT_EARNED`, not-found, and hierarchy codes. |
| **`/holidays` (§4.3)** | A `year` parameter was sent; it takes none. | No parameter; filtered to upcoming dates client-side on the employee and leave dashboards. |
| **Break endpoints (§4.1)** | Sent no body. | Send `{ source: "web" }`. |
| **Overnight `/today` (§4.1)** | The card assumed the returned `date` was today. | It renders from the returned date. An open shift from yesterday shows "Open shift · Started …" with guidance; `PREVIOUS_SHIFT_OPEN` is mapped. |
| **Policy ranges (§5.1)** | Grace allowed up to 720 (backend max 120). Half/full-day hours allowed down to 0 (backend min 1). Name was capped at 100 (backend 150). | Ranges match the backend. Newly added fields: `early_exit_threshold_minutes`, `overtime_requires_approval`, `auto_clock_out_enabled` and `auto_clock_out_after_hours`, `auto_detect_shift`, `missing_punch_action`, `comp_off_on_holiday_work`, `late_count_half_day_threshold`, `consecutive_late_penalty_days`. |
| **Nullable policy limits** | A blank limit was omitted, so on edit it could never be cleared. | Blank sends `null`. |
| **Deactivate error** | Showed the raw server message, even for 5xx. | Goes through the mapped error handler. |
| **Shift ranges (§5.2)** | Buffers capped at 240 (backend 480); name capped at 100. | 480 and 150. On edit, core hours for a flexible shift clear with `null`, and `is_overnight` is always explicit. |
| **Comp-off policy ranges (§5.6)** | Validity up to 3650 and required; half/full-day hours required. | Validity 1–365 and optional; hours nullable. |
| **Lock reason (§5.7)** | Required, minimum 3 characters. | Optional (`reason?`), max 255, omitted when blank. |
| **Decision remarks (§6.3)** | Capped at 500. | Capped at 1000, the backend limit. Requiring a reason to reject stays a product rule (C10). |
| **Regularization `work_mode` (§4.4)** | Not offered. | Optional "Worked from" select; an approved correction copies it onto the day. |
| **HR list filters (§6.1)** | Search filtered only the loaded page; no status filter. | Server-side `search` (debounced) and `status`, so filters cover every page. |
| **Daily report (§5.8)** | Date only. | Optional `status` and `search` filters; the CSV name includes the status. |
| **HR live dashboard (§6.4, §8.6)** | Relied on the server's IST "today". | Sends the local date on every poll, so it rolls over at local midnight. |
| **Team today in UTC (§8.2)** | No mitigation. | When the local date is ahead of UTC (00:00–05:30 IST), the team table warns that it may still show yesterday and shows the time it switches. |
| **`/overtime/mine` (§4.5)** | Could forward arbitrary params. | Sends `page` and `limit` only. |
| **Record list** | "Corrected" state never shown. | `is_regularized` is shown in history rows (self-service and team history). |
| **Holiday name** | Unbounded input. | `maxLength` 150. |
| **Dead API surface** | `updateAssignment`, `getOrgRegularizations` and `getManagerTeamHistory` existed. | Removed. The routes don't exist or must not be used (C1, C2, C15). |

---

## 5. Open questions C1–C22 — final status

| # | Question | Backend answer | Frontend result |
|---|---|---|---|
| C1 | HR regularizations | No HR route. Manager routes are org-wide for HR, with no hierarchy limit. | HR uses the manager pending queue (`scope="org"`); fallback logic removed |
| C2 | Assignment PUT | Doesn't exist; end and re-create instead | No edit action; copy explains end-and-recreate |
| C3 | Shift keys | Confirmed, including `policy_id` (nullable) | Unchanged; ranges aligned |
| C4 | Policy extras | First-class fields | Always sent; full 22-field form |
| C5 | Rotation off-days | **Not supported** (400) | Off-days removed; rest days via Weekly Off rules |
| C6 | Assignment dates / xor | `YYYY-MM-DD`; exactly one of shift or rotation | Enforced and tested; optional `effective_to` |
| C7 | Holiday fields | Strict `YYYY-MM-DD`; include/exclude valid on holidays | Unchanged (already correct) |
| C8 | Weekday numbering | 0 = Sunday | Unchanged (already correct) |
| C9 | Devices | Contract documented | Phase 8 deferred (§7) |
| C10 | Comp-off decision body | `{remarks?}`, optional | Unchanged; rejecting still requires a reason, as a UI rule |
| C11 | Comp-off `rejected` | Doesn't exist; reject writes `cancelled` | Relabelled "Rejected / cancelled" |
| C12/C13 | Comp-off / overtime creation | Backend-generated | No creation forms (correct) |
| C14 | Response shapes | Documented; four marked not exhaustively verified | Tolerant normalisers kept only where unverified |
| C15 | Team-history params | Ignores all params; unbounded | Endpoint unused; page rebuilt per member |
| C16 | Anomaly status | Filter `open/resolved/all`; records carry `is_resolved` | `anomalyStatusKey()`; `resolution_notes` |
| C17 | Lock side effects | None on pending requests; `PERIOD_LOCKED` 403 | Neutral copy kept; code fixed |
| C18/C19 | Clock-out fields | No `work_mode`; six optional fields | Verified; `client_timestamp` on both punches |
| C20 | Managers on `/hr/hrs/*` | Allowed by the backend | Not exposed in the manager UI (product choice) |
| C21 | Recompute response | Count present; key not verified | Count shown when present |
| C22 | `/today` break total | `break_duration_minutes` authoritative | Server base plus live open break |

---

## 6. Backend defects still open (contract §8) and how the UI handles them

| # | Defect | Severity | Frontend handling | Backend action needed |
|---|---|---|---|---|
| 8.1 | `GET /manager/team/history` is unbounded and ignores filters | 🔴 High | Not called; page uses per-member history | Add `from`/`to` and pagination. The UI can then offer an all-team view again. |
| 8.2 | `/manager/team/today` computes "today" in UTC | 🟠 High | Amber notice during the lag window, with the switch-over time | Compute in the org (or IST) timezone |
| 8.3 | `client_timestamp` accepted from the client | 🟠 Medium | Sent as diagnostics only; no feature relies on it | Never make it authoritative |
| 8.4 | `/regularizations` ignores `status` | 🟡 Medium | Filters the loaded page client-side, with a label | **Please apply the offered small fix**; the UI can then filter server-side |
| 8.5 | `totalPages` vs `total_pages` | 🟡 Low | The normaliser accepts both | Unify (announced change) |
| 8.6 | "Today" hardcoded to Asia/Kolkata | 🟡 Medium | Local dates passed explicitly where accepted (history, summary, team summary, live, department, work mode) | Use the org timezone |

---

## 7. Remaining items

| Item | Owner | Notes |
|---|---|---|
| **Phase 8: biometric devices** | Frontend (deferred) | Still broken as audited. The plaintext API key is returned **once** at creation and the UI discards it, which permanently bricks the device. Mapping must send `user_id` and `device_employee_id`, chosen with an employee picker. Fixing key display is the first requirement when Phase 8 starts. |
| Rotations with off-day phases | Backend (needs go-ahead) | Nullable `shift_id` plus `is_off`, and resolver changes. Until then, use weekly-off rules targeted at the shifts. |
| Excluding employees from weekly-off rules | Backend (optional) | Add `excluded_users` to the weekly-off schema if exclusions are needed. |
| Org-wide regularization history for HR | Backend | Only pending requests are available today. |
| Server-side status filter on My Regularizations | Backend | See §6, row 8.4. |
| Global 401 handling | Frontend (app-wide) | `client.js` doesn't log out or redirect on an expired session. Affects every module, not just attendance. |
| Semantics of `late_count_half_day_threshold` / `consecutive_late_penalty_days` | Backend to confirm | The contract gives names and types only; the form hints describe them by name. |
| Manager view of HR-staff attendance (C20) | Product | The backend allows it; the UI doesn't expose it. |

---

## 8. Verification

- **Build:** `vite build` into a scratch directory completed with ✓. The only warning is the chunk-size notice that already existed.
- **Tests:** Node suite over the pure logic (validation, errors, enums, normalisers, dates, live hours, CSV). 75 / 74 / 73 pass in Asia/Kolkata / America/New_York / UTC.
  - New this round: rotation payload and 365 cap, policy unconditional extras and ranges, weekly-off `target_users` only and `effective_to`, assignment xor, optional lock reason, regularization `work_mode`, comp-off policy key set and validity cap.
  - Also new: `PERIOD_LOCKED`, `DATE_LOCKED` no longer special, 401 vs 403 `UNAUTHORIZED`, `ALREADY_PROCESSED`, `anomalyStatusKey`, no `rejected` comp-off status, server break minutes precedence, break total.
- **Static checks:**
  - No remaining references to `is_off`, `DATE_LOCKED`, `isDateLocked`, `getOrgRegularizations`, `getManagerTeamHistory`, `updateAssignment`, `"CONFLICT"`, the conditional policy `supports` logic, or weekly-off `included_users`/`excluded_users`.
  - No anomaly `.status` reads and no `getUpcomingHolidays(year)`.
  - All 92 attendance API functions are referenced from the UI.
- **ESLint:** only two older warnings, on lines not touched this round (`AttendanceLocationsPage.jsx` and `ManagerTeamRosterPage.jsx` effect dependencies). The repo-wide convention noise (unused `React` import, unescaped entities) is excluded.

---

## 9. Manual QA checklist for this round (run against the backend)

1. **Rotations:** create a rotation with two shift phases. It saves (201); the modal has no off-day option.
2. **Payroll lock error:** lock yesterday, then approve a regularization for that date. The message reads "locked for payroll" (code `PERIOD_LOCKED`).
3. **Team History:** pick a member and a 7-day range. The request goes to `/manager/team/member/:id/history?from=…&to=…&page=1&limit=25`, never to `/team/history`.
4. **Weekly-off targeting:** create a weekly-off rule targeting two employees, then reopen it. Both are still selected, and `target_users` is in the request body.
5. **Comp-off reject:** reject a comp-off as a manager. Under HR → Comp-offs → "Rejected / cancelled" it is listed.
6. **My Regularizations filter:** with mixed statuses, the Approved tab shows only approved rows on the page; with more than one page the "this page" note shows.
7. **Resolved flags:** resolve a flag as a manager. The employee's My Flags shows it as Resolved with the note.
8. **Policies:** create a policy with auto clock-out at 10 h, overtime without approval, and holiday-work comp-off on. Reopen it: all values persist. Clear "Max breaks per day" on edit and it saves as no limit.
9. **Comp-off policy scope:** set priority 5, maximum balance 10, and one department. The list shows priority, cap and department name.
10. **Summary cards:** on My Attendance, Holidays, Weekly offs, Days recorded and Hours worked show non-zero values for a month with data.
11. **Overnight shift:** clock in at 22:00 and view the card after midnight. It shows "Open shift · Started …" and Clock Out, not Clock In.
12. **Break total:** take a 20-minute break and end it. "Breaks so far" shows 20m, and counts live during the next break.
13. **Live Attendance search:** search a name that sits on page 3 of Live Attendance. It is found, because the search runs on the server.
14. **Top defaulters:** the widget has "Most absent" and "Most late" tabs with days, or days plus minutes.
15. **Team today notice:** at 00:30 IST, the manager dashboard team table shows the "may still show yesterday" notice with the switch time (05:30).

---

## 10. Files changed in this round

- **Shared layer:**
  - `src/shared/utils/attendanceErrors.js` (rewritten)
  - `src/shared/attendance/validation.js` (rewritten)
  - `src/shared/attendance/liveHours.js` (rewritten)
  - `src/shared/api/attendance.api.js`
  - `src/shared/attendance/enums.js`
  - `src/shared/attendance/decisions.js`
  - `src/shared/attendance/useTargetingOptions.js`
  - `src/shared/attendance/AttendanceApprovalQueue.jsx`
- **HR attendance screens:**
  - `AttendancePoliciesPage.jsx` (rewritten)
  - `AttendanceCompOffPoliciesPage.jsx` (rewritten)
  - `AttendanceRegularizationsHRPage.jsx` (rewritten)
  - `AttendanceShiftsPage.jsx`
  - `AttendanceWeeklyOffsPage.jsx`
  - `AttendanceRosterPage.jsx`
  - `AttendanceLockPeriodsPage.jsx`
  - `AttendanceCompOffsPage.jsx`
  - `AttendanceReportsPage.jsx`
  - `AttendanceHolidaysPage.jsx`
- **HR other:**
  - `components/AttendanceDirectory.jsx` (rewritten)
  - `screens/HRDashboard.jsx`
  - `employee-profile/AttendanceTab.jsx`
  - `employee-profile/OverviewTab.jsx`
- **Manager:**
  - `ManagerTeamHistoryPage.jsx` (rewritten)
  - `ManagerDashboard.jsx`
  - `ManagerTeamRosterPage.jsx`
- **Employee:**
  - `components/AttendanceCard.jsx`
  - `components/RegularizationCard.jsx`
  - `screens/EmployeeAttendancePage.jsx`
  - `screens/AttendanceAnomaliesPage.jsx`
  - `screens/AttendanceRegularizationsPage.jsx`
  - `screens/EmployeeDashboard.jsx`
  - `screens/LeaveDashboard.jsx` (holiday call only)
- **Docs:** `public/ref docs/md_attendance/ATTENDANCE_API_CONTRACT.md` (copied from `dist/` so a build can't remove it).

Nothing has been committed.

> ⚠️ **Where these reports live.** This folder (`dist/ref docs/md_attendance/md_frontend/`) is build output: `vite build` empties `dist/` and repopulates it from `public/`. Move `md_frontend/` under `public/ref docs/md_attendance/` to keep these reports across builds.
