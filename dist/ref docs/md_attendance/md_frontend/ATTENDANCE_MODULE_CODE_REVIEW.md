# Attendance Module — Code Review & Remediation Report

**Reviewer role:** Senior review (backend-contract and frontend-behaviour) of the attendance implementation
**Date:** 2026-09-13
**Source of truth:** `ATTENDANCE_MODULE_AUDIT.md` (implementation plan) + `public/ref docs/md_attendance/*`
**Scope:** everything delivered in `ATTENDANCE_MODULE_FIX_REPORT.md` — the shared layer
(`src/shared/attendance/*`, `attendanceErrors.js`, `csv.js`, `attendance.api.js`), the sidebar and
routes, and every employee / manager / HR attendance screen. Phase 8 (biometric) remains out of scope.

**Outcome: 17 defects found, 17 fixed.**
- **Severity:** 5 high, 5 medium and 7 low.
- **High-severity kinds:** one blank-screen bug, one wrong-person/wrong-data race, one mislabelled payroll export, one cross-session data leak and one duplicated-rows pagination bug.
- **Verification:** `vite build` passes, the logic test suite passes in three timezones, and ESLint reports no new findings.
- **Not verified:** nothing was exercised against a live backend.

---

## 1. High severity

### H1 — Profile attendance tabs queried the wrong role and could keep the wrong data
**`EmployeeProfilePage.jsx`, `employee-profile/OverviewTab.jsx`** · wrong data / false error

**Cause:**
- `employeeRole` was `employee?.role || "employee"`.
- While the profile was still loading, Overview and Attendance mounted with the role `employee` and called `/hr/employees/:id/*`, even for managers and HR staff.
- When the profile arrived, both tabs refetched through `/managers` or `/hrs`.
- `OverviewTab` had no stale-response guard.

**Effect:**
- The earlier `/employees/*` request could resolve after the correct one and overwrite it.
- A manager's profile then showed "not found" or an empty month.
- The deep link `?tab=attendance` from Live Attendance and Top Defaulters hit this on every open.

**Fix:**
- Both tabs now render only once the profile has loaded, with a skeleton until then, and are keyed by `userId`.
- `OverviewTab` discards responses that are no longer current, using a request id.

### H2 — Unknown `?tab=` rendered a blank content area
**`EmployeeProfilePage.jsx`** · blank screen

**Cause:**
- The initial tab was taken from the query string without checking it.
- `/dashboard/hr/employees/:id?tab=attendence`, or any stale bookmark, matched no panel.

**Effect:** the right-hand side of the page was empty, with no tab highlighted.

**Fix:** the value is validated against `TABS` and falls back to `overview`.

### H3 — Report exports could describe a different period than their data
**`AttendanceReportsPage.jsx` (Daily, Monthly), `shared/attendance/EmployeeAttendanceReport.jsx`** · mislabelled payroll data

**Cause:** the CSV filename and empty-state text were built from the current filter inputs, not from the inputs the rows were generated with.

**Effect:**
- Scenario: generate August, switch the selector to September, then click Export.
- The download was `monthly_attendance_2026-09.csv` but contained August's rows.
- Daily and employee reports had the same problem.

**Fix:**
- Each report stores the parameters it was generated with.
- Filenames and labels use those stored parameters.
- An amber hint appears when the inputs have changed since the report was generated ("Showing August 2026. Generate again…").

### H4 — Unpaginated responses produced phantom pages with the same rows
**`shared/attendance/normalize.js` (`normalizePaginated`)** · duplicated rows, broken paging

**Cause:**
- When a response had no pagination metadata, the total page count was calculated from the requested `limit`.
- Endpoints that return a full array ignore `page` and `limit`. Examples: the HR Regularizations fallback to `/manager/regularizations/pending`, and any undocumented list shape (C14).

**Effect:**
- With 45 items, the page showed all 45 rows alongside "Showing 1–20 of 45" and a page 2/3.
- Every "page" re-rendered the same 45 rows.

**Fix:**
- If there is no metadata and the server returned more rows than requested, the result is treated as a single page.
- If there is no metadata and the server returned exactly `limit` rows, one more page is allowed; `usePagedList` already steps back from an empty page.
- Covered by three new tests.

### H5 — Module-level caches survived logout/login in the same tab
**`EmployeePicker.jsx` (`useOrgEmployees`), `useTargetingOptions.js`, `useTeamNames.js`, `DashboardSidebar.jsx`** · cross-session data leak

**Cause:**
- The org roster, locations and departments, team names and inbox count were cached at module level for 60 seconds.
- `logout()` clears tokens and React state but not these caches.
- Org switching does a full reload, so it was not affected.

**Effect:** within that 60-second window, the next user to sign in on the same browser could see:
- the previous user's employee picker options;
- holiday targeting lists;
- manager team names;
- the inbox badge count.

**Fix:** every cache is keyed by the session token. A token change discards the cache, and in-flight results from the old session are not stored.

---

## 2. Medium severity

### M1 — "Live" hours counted up forever on missed clock-outs
**`shared/attendance/LiveEffectiveHours.jsx`**

**Cause:** any record with a clock-in and no clock-out was treated as in progress.

**Effect:** in each of these views, a missed clock-out from days ago showed a running timer such as "52h 10m elapsed":
- Live Attendance for a past date;
- the profile history tab;
- the HR daily log.

**Fix:**
- An open record older than 24 hours is treated as stale.
- It shows the backend's `effective_hours` if present, otherwise an amber "No clock-out" label with an explanatory tooltip.
- Genuine overnight shifts, which are under 24 hours, still tick.

### M2 — Employee report kept the previous person's results
**`EmployeeAttendanceReport.jsx`, `employee-profile/ReportsTab.jsx`, `EmployeeProfilePage.jsx`**

**Cause:**
- State was not reset when `userId` changed.
- A slow response for the previous employee could still land.
- The profile never passed a name, so every export was called `attendance_employee_…csv`.

**Fix:**
- State resets when `userId` changes, and responses carry a request-id guard.
- The tab is keyed by `userId`.
- The profile passes the display name for the filename.

### M3 — Roster action menu was clipped on the last rows
**`AttendanceRosterPage.jsx`**

**Cause:** the row menu is absolutely positioned inside an `overflow-x-auto` table container, which also clips vertical overflow.

**Effect:** "End Assignment" and "Delete" on the last rows were cut off or needed an inner scroll.

**Fix:**
- On pages with more than two rows, the menu on the last two rows opens upwards.
- Pages with one or two rows reserve enough height for the menu to open downwards.

### M4 — Every `TypeError` was reported as a network outage
**`shared/utils/attendanceErrors.js`**

**Cause:** `err instanceof TypeError` was treated as a fetch failure.

**Effect:** a coding bug such as "Cannot read properties of undefined" told users "Can't reach the server. Check your internet connection", hiding the real problem.

**Fix:**
- Only the actual fetch failure messages map to the connectivity copy.
- A regression test was added.

### M5 — A decision could be posted to `/…/undefined/approve`
**`shared/attendance/AttendanceApprovalQueue.jsx`**

**Cause:** the entity id was not checked before calling `runDecision`.

**Fix:** a missing id now raises a clear inline error in the dialog and makes no request.

---

## 3. Low severity

| # | File | Defect | Fix |
|---|------|--------|-----|
| L1 | `DecisionDialog.jsx` | Resolving a flag without a note said "Please add a reason before **rejecting**". | The message uses the dialog's own label and action ("Please add resolution note to mark resolved."). |
| L2 | `AttendanceCard.jsx` | If `/today` ever returned `data: null`, the card rendered with **no action buttons**, so a user could not clock in. The docs promise `not_marked`; this is defensive. | A null payload that is neither loading nor failed is treated as idle, so Clock In shows. |
| L3 | `attendance.api.js` | Path params were interpolated raw. A hand-edited `/employees/:userId` (for example with `%2F..%2F`) could change which endpoint was called with the HR token. | All 44 path segments go through `encodeURIComponent`. |
| L4 | `DashboardSidebar.jsx` | Opening Comp-Off Policies directly left its "Attendance Settings" submenu collapsed. | The route is included in the submenu's initial open state. |
| L5 | `AttendanceWeeklyOffsPage.jsx` | `RulesTable` was a component declared inside the page, so both tables remounted on every render. | Converted to a render helper. |
| L6 | `AttendanceCompOffsPage.jsx` (HR) | Bulk approve reloaded the list twice (the event subscription plus an explicit reload). | An explicit reload runs only when nothing was approved. |
| L7 | `utils/csv.js` | The object URL was revoked immediately after `click()`, which can cancel downloads in Safari. | Revoked after one second. |

---

## 4. Checked and found correct (no change)

- **No fetch loop in Approvals Inbox.** `onCountChange` is a stable `useCallback`, so the queue's `load` identity does not churn.
- **`/today` contract (U5).** It always returns a status (`not_marked`, `in_progress`, …), and the card's states follow the documented button rules.
- **`/shift` contract (U13).** The policy keys `half_day_threshold_minutes` and `full_day_threshold_minutes` match what the card reads.
- **Team anomalies (M3).** The backend returns only `unresolved` flags, so the queue never offers to resolve an already-resolved one.
- **Redirects:**
  - `ProtectedRoute` waits for auth hydration and sends unauthenticated users to `/auth/login`.
  - Role-gated workspaces redirect to the role home.
  - Unknown paths go through `CatchAll` to `/dashboard`, which forwards to the role dashboard.
  - Every self-service route exists in all three workspaces.
- **HR Regularizations fallback.** When the undocumented org list returns 404 or 405, the page switches to the pending queue without flashing an error; the stale response is discarded by request id.
- **`usePagedList`:**
  - The page resets when the filter changes.
  - Out-of-order responses are dropped.
  - An emptied last page steps back.
- **`window.confirm`.** It is overridden by `GlobalAlertProvider` with an async modal, so the `await window.confirm(…)` calls are correct.
- **Date handling.** Local "today" and DATEONLY parsing are covered by tests in IST, New York and UTC.

---

## 5. Open items (not changed — outside this module or waiting on backend)

| Item | Why it isn't fixed here |
|------|--------------------------|
| **No global 401 handling.** An expired session shows "Your session has expired" with *Try again*, but never redirects to login. | `client.js` is shared by every module; it needs an app-wide interceptor that logs out and redirects. Recommend a follow-up. |
| **HR decisions use manager endpoints.** An HR override of a regularization outside HR's reporting line may return `HIERARCHY_VIOLATION`; it is shown clearly, but the action fails. | Audit C1: the org-wide HR decision endpoint is undocumented. |
| **Policy toggles hidden.** "Default policy" and "Late threshold" appear only once an existing policy exposes those keys, so the first policy can't be made default in the UI. | Audit C4: the keys are undocumented and are sent only when the model has them. |
| **Search boxes filter only the current page** (Live Attendance, Team History). | The backend has no documented search parameter. Placeholders say "Filter this page…". |
| **Holidays page header** uses fixed `px-8` and doesn't wrap at phone width. | Cosmetic; left as it was. |
| **Pre-existing ESLint errors in `DashboardSidebar.jsx`** (unused icons, `handleLogout`, `user`). | Present at `HEAD` (0446cc8); none were introduced by this work. |
| **Biometric devices (H26–H32).** | Phase 8 was deferred by the product owner. |

---

## 6. Verification

- **Build:** `vite build` to a scratch directory succeeded. The only warning is the chunk-size notice the app already had.
- **Logic tests:** `TZ=Asia/Kolkata` gives 57 passed, `America/New_York` 56, and `UTC` 55. Counts differ only by timezone-specific cases.
  - Four regression tests were added: two cases of unpaginated arrays, full-page lookahead, and the `TypeError` mapping.
- **ESLint on all 20 touched files:**
  - Repo-wide conventions are excluded (unused `React` import, unescaped entities, react-refresh).
  - Remaining findings are only the pre-existing ones in `DashboardSidebar.jsx`.
- **Not verified:** no runtime testing against a backend.

### Extra manual QA for the fixes

1. Open a **manager's** profile from Live Attendance (`?tab=attendance`). History loads through `/hr/managers/*`; there is no error flash and no `/hr/employees/*` call in the Network tab.
2. Visit `/dashboard/hr/employees/<id>?tab=nonsense`. The Overview tab is shown.
3. On Reports → Monthly, generate August, change the month to September and export. The file is named `…2026-08.csv` and an amber hint is visible.
4. Sign in as manager A and open a comp-off approval (team names load). Log out, then within a minute sign in as manager B in the same tab. B's picker, names and badge are B's own.
5. In Live Attendance, open yesterday and find someone with no clock-out. The row shows "No clock-out", not a growing timer.
6. In the roster with more than three assignments, open the menu on the last row. Both actions are visible.
7. In Flags, click "Mark resolved" with an empty note. The message refers to the resolution note.

---

## 7. Files changed in this review

- **Shared layer:**
  - `src/shared/attendance/normalize.js`
  - `src/shared/attendance/DecisionDialog.jsx`
  - `src/shared/attendance/AttendanceApprovalQueue.jsx`
  - `src/shared/attendance/EmployeePicker.jsx`
  - `src/shared/attendance/useTargetingOptions.js`
  - `src/shared/attendance/useTeamNames.js`
  - `src/shared/attendance/LiveEffectiveHours.jsx`
  - `src/shared/attendance/EmployeeAttendanceReport.jsx`
- **Utilities and API:**
  - `src/shared/utils/attendanceErrors.js`
  - `src/shared/utils/csv.js`
  - `src/shared/api/attendance.api.js`
- **Shell:** `src/shared/components/DashboardSidebar.jsx`
- **Employee profile:**
  - `src/roles/hr/screens/EmployeeProfilePage.jsx`
  - `src/roles/hr/screens/employee-profile/OverviewTab.jsx`
  - `src/roles/hr/screens/employee-profile/ReportsTab.jsx`
- **HR attendance screens:**
  - `src/roles/hr/attendance/screens/AttendanceReportsPage.jsx`
  - `src/roles/hr/attendance/screens/AttendanceRosterPage.jsx`
  - `src/roles/hr/attendance/screens/AttendanceWeeklyOffsPage.jsx`
  - `src/roles/hr/attendance/screens/AttendanceCompOffsPage.jsx`
- **Employee:** `src/roles/employee/components/AttendanceCard.jsx`

Nothing has been committed.
