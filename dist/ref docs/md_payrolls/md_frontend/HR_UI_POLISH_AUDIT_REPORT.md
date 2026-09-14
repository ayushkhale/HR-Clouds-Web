# HR UI Polish — Audit Report

**Date:** 14 Sep 2026
**Branch:** `dev` (changes are not committed)
**Scope:** every item from the HR UI feedback list, a senior-level code review of all files changed for it, and bugs found during that review.

**Verification:**
- `vite build` passes.
- ESLint shows no new errors in touched code.
- The helpers were unit-checked with node: name lookup, employee code, and state search.
- No clicking-through in a browser has been done yet.

Status legend:
- ✅ **Fixed** — changed and verified by build and lint.
- ⚠️ **Fixed, needs confirmation** — code done, but it depends on a backend response we haven't seen.
- ℹ️ **Note** — explanation or accepted trade-off, no change needed.

---

## 1. Requested items

### HR Dashboard

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 1 | Graph needs spacing at top and bottom | ✅ | The chart area is taller (`h-72`) with top and bottom padding. The chart margins increased (top 20, bottom 12). |
| 2 | Attendance Directory tab shows "-" | ✅ | Missing code, department and clock-out now show **N/A**. Missing hours show **0m**. The shared date and time formatters now default to N/A or 0m everywhere. |
| 3 | Department overview grid should be symmetric (4 → two rows) | ✅ | New `deptGridCols()`: 1–3 cards sit in one row, 4 become a 2×2 grid, and larger sets use a column count that divides evenly. |

### Team

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 4 | Invite form must ask for gender (Male / Female / Others) | ✅ | A required dropdown sits in "Required Information". It sends `gender` as `male`, `female` or `other`. The backend will return `gender` in the next update, as you confirmed. |
| 5 | Replace random avatars with one male and one female purple illustration with black hair, based on backend gender | ✅ | New `GenderAvatar` uses the same library (react-nice-avatar) with two fixed configs. It is used on Team cards, the Employee profile and employee dropdowns. "Others" or a missing gender shows purple initials rather than a guessed illustration. |
| 6 | Why is there a "-" opposite the Active chip on team cards? | ✅ | That "-" was the placeholder for a **missing employee code**. It now shows an "N/A" chip styled like the code chip. The role fallback also shows N/A. |

### Individual employee details

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 7 | Monthly overview doesn't follow the backend structure | ✅ | **Root cause:** the screen read stats from `data`, but they live in `data.summary`, so every card showed 0. It now reads `data.summary` and shows all 12 fields: present, half, absent, late, holiday, weekly off, on leave, hours worked, average hours per day, overtime, break time and punctuality %. |
| 8 | Use purple shades for the stat icons | ✅ | The icons rotate through three purple and violet shades. |
| 9 | Attendance pattern colours are too close; absent looks white | ✅ | Each status has its own purple-friendly colour (present violet, late amber, half-day sky, leave fuchsia, **absent solid rose**, holiday teal, weekly off slate). "No record" days are a dashed outline. See also review bug R6. |
| 10 | Daily log preview should be full width and purple-themed | ✅ | It is rebuilt on the shared full-width `DetailDialog`: headline stats, day breakdown, applied shift, sessions and breaks tables, and flags, all in purple. |
| 11 | Replace "-" with N/A or 0 (attendance history and elsewhere) | ✅ | Late, overtime, left early and breaks show **0m**. Text values show **N/A**. The profile card's fake `#EMP000` code now shows N/A (review bug R11). |
| 12 | Leave Balances grid: 4 in one row, purple shades only | ✅ | New `balanceGridCols()` puts up to 4 cards in one row, with purple and violet card palettes only. |
| 13 | Use plain language instead of "ACCRUED", "Override Config", etc., across the system | ✅ | See the term map in §3. Applied to the Leave tab, Leave Policies, Leave Automation, Leave Types, Comp-off screens and Payroll Run Detail. |

### Office Locations

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 14 | Toggling active reloads and re-renders the whole page | ✅ | **Root cause:** each toggle refetched the list, which swapped every card for a skeleton. The toggle now updates only that card and rolls back if the request fails. Saving a location refreshes silently. Review bug R8 also locks the toggle while its request runs. |

### My Attendance

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 15 | Remove the Hours Trend section | ✅ | The section and its API call are removed. ℹ️ This page is shared by HR, Manager and Employee "My Attendance", so it is removed for all three. The unused weekly-calendar fetch was removed too. |
| 16 | Replace "-" with N/A or 0 | ✅ | Minute values show 0m and times show N/A. |

### Attendance & Time

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 17 | Attendance Directory: replace "-" | ✅ | Same component as item 2. |
| 18 | Attendance Directory, HR tab: name shows "Unknown"; use `first_name` | ⚠️ | The name lookup now also reads `first_name` / `last_name` from the person's own role profile (`hr_profile`, `HrProfile`, `employee_profile`, `manager_profile`, `user.*profile`). **We need a sample response to confirm the field location. See §4.** |
| 19 | Shift Templates: clicking a row opens a full-width purple preview | ✅ | The preview shows working hours, clock-in window and linked policy, with an **Edit shift** action. |
| 20 | Shift Roster: clicking a row opens a full-width purple preview | ✅ | The preview shows employee, schedule (shift or rotation) and dates, with **End assignment** and **Delete** actions. |

### Attendance Settings

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 21 | Attendance Policies: last column has no "Action" header; clicking a row opens a preview | ✅ | The header now reads "Actions". The row preview loads the full policy: thresholds, penalties, breaks, missing punches, overtime and corrections. |
| 22 | Complimentary Off Policies: row preview; "-/-" shows | ✅ | The row preview shows how days are earned, limits and who it applies to. The "Actions" header is visible. An unset half or full day now shows "N/A / N/A". |

### Reports

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 23 | Attendance Reports: date, status and search aren't organised | ✅ | One aligned grid with equal-height controls, uppercase labels, a search icon, and the Generate and Export buttons aligned. The Monthly report bar now matches (review bug R13). Empty late and overtime show 0 or 0m. |

### Holiday

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 24 | Common Holidays Catalog should use coloured icons | ✅ | Each holiday gets its own colour, for example flag orange, Diwali amber, Holi pink, Christmas emerald and Eid cyan. |

### Off Days

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 25 | Weekly Off Configuration: row preview; "-" → N/A | ✅ | The preview shows a weekday strip, priority, effective dates and targeting. The header is "Actions". Empty days show N/A. |

### Leave

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 26 | Add Leave Type should use the viewport width; clicking a row opens a preview | ✅ | The modal is wider (`max-w-6xl`) with two columns: basics on the left, rules and eligibility on the right. The row preview shows rules and who can apply, with Edit and Deactivate actions. |

### Payroll & Compensation

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 27 | Salary Components: **the delete/deactivate API ran before OK was clicked**; row preview | ✅ | **Root cause:** `GlobalAlertProvider` replaces `window.confirm` with a popup that returns a Promise. `if (!window.confirm(...))` checked the Promise itself, which always counts as true, so the call ran immediately. All ~20 calls across the app now wait for the answer (Adjustments, Bonus Rules, Loans, Tax, Leave Policies, Leave Automation, Departments, Payroll Runs, Year-End, Templates, Manager screens, My Tax). A repo-wide grep confirms no un-awaited `window.confirm` remains. The row preview was also added. |
| 28 | Salary Adjustments: use viewport width; clicking a row opens a preview | ✅ | Full-width table with Component and Reason columns, a wider create modal and a wider bulk modal. The row preview has Approve, Reject and Cancel actions. The first pass also fixed two bugs: the **status filter never reloaded the list**, and switching between earning and deduction kept a component of the wrong type. |
| 29 | Bonus Rules: use viewport width; clicking a row opens a preview | ✅ | Full-width table with a Cap/employee column and a wider create modal. The row preview has Preview impact, Edit, Approve and Apply actions. |
| 30 | Loans & Advances: row preview; loan details should use the full width | ✅ | Every row opens the full-width loan details: stats, terms, reason and repayment schedule table. It opens immediately and fills in once loaded. Pending loans explain that the schedule appears after approval. |
| 31 | Bank Verification: row preview | ✅ | Every row opens a preview with employee and masked account details, including the "no account" and "couldn't load" states, and a Verify action. |
| 32 | Statutory Tax, State PT Slabs: state code should be a dropdown with suggestions and auto-fill | ✅ | New type-ahead (`StateCodePicker`) over all 36 states and UTs. You can type a code (KA) or a name (Karnataka), use the arrow keys and Enter, and both code and name fill in. Alias codes such as OR, TG and CT also match. Custom codes are still allowed, because the backend treats `state_code` as the organisation's own vocabulary. See also review bug R9. |
| 33 | Payroll Audit Log: row preview | ✅ | Replaces the inline expand row with a full-width preview showing when, who, action, entity, entity ID and affected employee, plus the reason and recorded JSON. |

---

## 2. Bugs found during this code review (all fixed)

| # | File | Bug / edge case | Fix |
|---|------|-----------------|-----|
| R1 | `shared/components/DetailDialog.jsx` | The Escape listener was removed and re-added on every render. Escape also closed the preview while you were typing in a Reject or Foreclose form stacked on top. Focus never moved into the dialog, and it wasn't returned to the row afterwards. | `onClose` is kept in a ref so listeners register once. Escape is ignored while focus is in another layer. The panel takes focus on open, and focus returns to the row on close. |
| R2 | `DetailDialog.jsx` | The body scroll lock could be released early when two dialogs were stacked. | Replaced with a shared open-dialog counter. |
| R3 | `DetailDialog.jsx` (`rowPreviewProps`) | Rows were `role="button"` with an `aria-label`, so screen readers read only the label and lost the cell contents. Selecting text in a row, such as to copy a code, also opened the preview. | Rows keep their native semantics (`aria-haspopup="dialog"`). A click with a text selection is ignored. |
| R4 | `shared/components/GenderAvatar.jsx` | Raw config, including the non-avatar prop `isGradient`, was spread straight onto the component. | Both configs are built once through the library's `genConfig`, so only real avatar fields are passed and every card renders the same face. |
| R5 | `shared/attendance/normalize.js` | The HR-name fix matched any key ending in `profile`. A record with `approver_profile` or `reporting_manager_profile` could then show **someone else's** name. The employee code also ignored the HR profile. | Only the person's own role profiles are read (`profile`, `hr_profile`, `manager_profile`, `employee_profile`, `user_profile`), and the employee code now checks them too. Unit-checked: an approver profile is ignored, and an empty record falls back to "Unknown employee", never a UUID. |
| R6 | `employee-profile/OverviewTab.jsx` | "Late" is a legend colour, but it is never stored as a day status, so that colour never appeared. | A present day with `late_minutes > 0` (or `is_late`) is now coloured and labelled Late. |
| R7 | `screens/EmployeesPage.jsx` | Collapsed invite sections unmount their inputs, so the browser's `required` check skipped them. That included the new Gender field, as well as contact, department, reporting person, job status, employment type, work mode and permanent address. Invites could be sent without them. | JavaScript validation covers every required field, opens the section with the first missing one, and lists the missing fields. |
| R8 | `attendance/screens/AttendanceLocationsPage.jsx` | Double-clicking a toggle fired two requests. If the first failed, its rollback could undo the second. | The toggle is locked per card while its request is running (disabled, with `role="switch"` and `aria-checked`). |
| R9 | `payroll/screens/TaxConfigurationsPage.jsx` | After a code auto-filled the state name, editing the code to something else kept the old name, e.g. "MHX" with "Maharashtra". | An auto-filled name is cleared when the code no longer matches. A name you typed yourself is kept. |
| R10 | `AttendanceShiftsPage.jsx`, `AttendancePoliciesPage.jsx` | Blind "—" → "N/A" replacement produced "Min N/A hrs / day" and "N/A hrs / N/A hrs". | These now show a clean "N/A" when the value is missing. |
| R11 | `screens/EmployeeProfilePage.jsx` | The profile card showed a fake `#EMP000` code when none existed. | It shows N/A. |
| R12 | `LeaveAutomationPage.jsx`, `LeavePoliciesPage.jsx` | Leftover "—" placeholders in the run summary and the entitlement table. | Run summary shows N/A for the period and 0 for counts. Entitlements show N/A. |
| R13 | `AttendanceReportsPage.jsx` | The Monthly report filter bar still used the old unaligned layout. | It uses the same grid and controls as the Daily bar. |
| R14 | `AttendanceReportsPage.jsx` | Style constants were declared between import statements. | Moved below the imports. |
| R15 | `AttendanceCompOffsPage.jsx`, `AttendanceCompOffPoliciesPage.jsx`, `PayrollRunDetailPage.jsx` | "Override" jargon remained ("Approve (override)", "HR override", "Override pay period"). | Now "Approve (as HR)", "on the manager's behalf", "HR decision" and "Change pay period". |

Bugs fixed in the first pass (listed for completeness):
- In My Attendance, `EmptyState icon={A, B, C}` used a comma expression, so the wrong icon was passed.
- An unused weekly-calendar request fired on every visit.

---

## 3. Plain-language term map (applied across the system)

| Before | After |
|--------|-------|
| Override Config / Override | Customise Leave Rules / Customise |
| accrued | given so far |
| Accrual / Accrual Type | How leave is given |
| Upfront / Monthly | All at once / Every month |
| Annual Quota | Days per year |
| Carry Forward / Max Carry Forward | Kept for next year / Unused days kept for next year |
| Probation / Probation Restriction | Wait after joining |
| Overdraft / Max Negative Balance | Extra days allowed below zero |
| Notice-Period Leave Cap: Unrestricted / Blocked / Capped | Leave during notice period: No limit / Not allowed / Limited |
| Monthly Leaves (Accruals) / Trigger Accrual | Monthly Leave Credit / Add Leave Days Now |
| Sandwich Rule | Count weekends in between |
| Approve (override) / HR override | Approve (as HR) / HR decision |
| Override pay period | Change pay period |

---

## 4. Open items

1. **HR tab name (item 18).** Please share the raw JSON of one record from:
   - `GET /attendance/hr/hrs/attendance?date=YYYY-MM-DD&page=1&limit=20`
     - This is the Attendance Directory **HR** tab (`attendanceAPI.getAllHRsAttendance`).
     - Show one element of `data.records`, plus the `pagination` object.
   - Optional, to confirm the same shape on the profile screen: `GET /attendance/hr/hrs/{userId}/attendance?month=9&year=2026`.

   The frontend now looks for the name in this order: `name` / `employee_name` / `full_name` → the record's own `first_name` + `last_name` → `user` / `employee` → own role profile (`hr_profile`, `HrProfile`, …) → email. If the name sits somewhere else, it's a one-line change.
2. **Gender from the backend.** You confirmed the next backend update will send `gender`. The frontend reads it from `gender`, `profile.gender`, `user.gender` or `*_profile.gender`, and accepts `male`/`female` in any case (also `m`/`f`). Please make sure the Team list call `getEmployees({ purpose: "shift_assignment" })` includes it, or Team cards will keep showing initials.

---

## 5. Accepted trade-offs / notes

- **Blanks now show "0m" everywhere.** Missing hours and minutes default to "0m" across the app, including the manager and employee screens that share the formatters. This follows the "N/A or 0 instead of -" rule.
- **Hours Trend** is removed for every role that uses the shared My Attendance page.
- **"Others" or missing gender** shows purple initials rather than an illustration, so we never show the wrong one.
- **Lint notices left as they are:**
  - Fast-refresh notices in the new shared files come from exporting helpers next to the component, the same pattern as the existing `attendance/ui.jsx`. They only affect development hot-reload.
  - Old lint issues in lines this work didn't touch (e.g. unused imports in `EmployeesPage.jsx`, `HRDashboard.jsx`) were left alone to avoid unrelated churn.
- **Not yet tested in a browser.** Build, lint and helper unit checks pass. A manual click-through of the listed screens is still recommended, especially the previews and the invite form.
