# Attendance Module — Implementation & Fix Report

**Date:** 2026-09-13 · **Branch:** `dev` (uncommitted working tree)
**Source of truth:** `ATTENDANCE_MODULE_AUDIT.md` (plan) + `public/ref docs/md_attendance/*` (backend contract)
**Scope agreed with the user:** Phases 1–7, 9 and 10 implemented. **Phase 8 (Biometric devices / webhook onboarding) was deliberately excluded** at the user's request.

---

## 1. Summary

| Metric | Before (audit) | After this work |
|---|---|---|
| Endpoints fully implemented to the documented contract | 7 / 100 (7%) | **53 / 93 in-scope (57%)** |
| In-scope endpoints wired to a correct, working UI (incl. those awaiting backend confirmation) | — | **93 / 93 (100%)** |
| In-scope endpoints whose remaining gap is *only* a backend confirmation (❓, audit §8) | 7 | 40 |
| Out of scope (Phase 8 — biometric) | — | 7 (H26–H32) |
| Not applicable to browser (webhook) | 1 | 1 |
| Form contract coverage (in-scope forms) | 72% (48/67) | **100% (64/64)** — device forms (3 capabilities) excluded |
| Filter / query-parameter coverage | 33% (11/33) | **100% (33/33)** |
| Workflows implemented end-to-end in the UI | 0 / 10 | **9 / 9 in scope** (W8 biometric excluded) — 4 fully confirmed, 5 pending backend confirmation of field names/bodies |

> **Honest verification boundary.** There is no backend repository or running API in this workspace, so nothing was exercised against the live server. Verification was: production build, lint, a table-driven Node test suite for all pure logic in three timezones, and static reference checks (§6). Items marked ❓ follow the documented contract where one exists; where none exists they keep the field names the live UI already used, and are listed in §7 for backend confirmation.

---

## 2. Architecture delivered (Phase 1 — foundation)

No new runtime dependencies. No React Query/Redux (as recommended by the audit). All new code lives in `src/shared/attendance/*`.

| Concern | File | What it does |
|---|---|---|
| API contract | `src/shared/api/attendance.api.js` | `qs()` drops `undefined/null/""/NaN` (no more `status=`); corrected signatures (history `{from,to,page,limit}`, member history, team summary `YYYY-MM-DD`, holidays `year`, recompute `{date}`, my regularizations `{status,page,limit}`); added **H48/H49** (`/hr/hrs/:id/attendance`, `/summary`); decision bodies send `remarks` only when typed; undocumented calls flagged (C1/C2) and removed from UI where unsafe. |
| Dates / timezone | `dates.js` | Local `YYYY-MM-DD` ("today" no longer UTC), DATEONLY parsed as local dates, month ranges, overnight date-time combination, duration/hour formatting, zone helpers. |
| Response normalisation | `normalize.js` | `normalizePaginated` (accepts `totalPages` and `total_pages`), `listFrom`, `personName`/`employeeCode` (**never returns a UUID**), `entityId`, `departmentName`. |
| Enums | `enums.js` | Record/regularization/comp-off/overtime/anomaly/severity status metadata, filter enums from the docs (`open/resolved/all`, `earned/approved/used/expired/cancelled`, …), work modes, weekdays, anomaly labels, literal Tailwind tone classes. |
| Validation | `validation.js` | Pure validators returning `{errors, payload}` for regularization, policy, shift, rotation, assignment, end-assignment, lock, comp-off policy. |
| Errors | `src/shared/utils/attendanceErrors.js` | `errorCode` → actionable message (`DATE_LOCKED`, `ALREADY_CLOCKED_IN`, `HIERARCHY_VIOLATION`, `FEATURE_NOT_AVAILABLE`, `OVERLAPPING_LOCK`, …); passes through Joi/`BAD_REQUEST` messages; handles 401/429/5xx/network. |
| Refresh signalling | `events.js` | `emitAttendanceChanged(kind)` / `useAttendanceChanged(kinds, cb)` — punch, regularization, overtime, compoff, anomaly, config, lock. |
| Lists | `usePagedList.js`, `ui.jsx` (`Pagination`) | Page resets on filter change, out-of-order responses discarded, steps back from an emptied last page. |
| UI kit | `ui.jsx` | `StatusBadge`, `EmptyState`, `ErrorState` (renders `FeatureNotAvailable` when the flag is off), `LoadingRows`, `InlineAlert`, `FieldError`, `FilterTabs`, `Spinner`, shared `Toast` + `useToast` (replaces 6 local copies). |
| Decisions | `DecisionDialog.jsx`, `decisions.js`, `AttendanceApprovalQueue.jsx` | One dialog for approve/reject/resolve: remarks reset per entity, reject/resolve require remarks, loading + duplicate-click guard, mapped errors, stale-row refresh on 404/409/hierarchy errors, cross-module notices (comp-off credits leave, OT feeds payroll). |
| Pickers | `EmployeePicker.jsx`, `useTargetingOptions.js` | Name + code + email employee picker (value = `user_id`); live locations/departments/employees/employment types/job statuses for targeting; saved values that no longer exist stay selectable and never show as UUIDs. |
| Live hours | `LiveEffectiveHours.jsx`, `liveHours.js` | Single implementation (was ×3): backend `effective_hours` once clocked out; live worked time minus closed breaks, frozen during a break; explicitly labelled "elapsed" when break data isn't in the payload. |
| Punch state | `useTodayAttendance.js`, `geolocation.js` | `/today` + `/shift` with focus refresh, local-midnight rollover, race protection; geolocation that never rejects and classifies denied/unsupported/timeout/insecure. |
| Role routing | `paths.js`, `memberAttendance.js`, `permissions.js` | Self-service pages mounted per workspace; HR profile tabs choose `/employees`, `/managers` or `/hrs` endpoints by the viewed person's role; `canSelfServeAttendance`, `canManageTeamAttendance`, `canConfigureAttendance`. |
| CSV | `src/shared/utils/csv.js` | RFC 4180 quoting, formula-injection guard, UTF-8 BOM for Excel. |

---

## 3. Phase-by-phase implementation

### Phase 2 — Configuration (H1–H17)
- **Policies** (`AttendancePoliciesPage.jsx`): added `max_break_duration_minutes`, `max_breaks_per_day`; field-level validation (half ≤ full, ranges); inputs accept clearing (no `parseInt(...) || 0` snapping); disabled toggles omit their dependent fields; undocumented `late_threshold_minutes` / `is_default` are shown and sent **only when existing policies already carry those keys** (C4); removed the unverified "counts as a Half Day" claim; edit notice about policy snapshots; list shows breaks/OT/correction window.
- **Shifts** (`AttendanceShiftsPage.jsx`): **`policy_id` selector** (default policy preselected; clearing sends `null` on edit), per-type validation (split block ordering, flexible hours/core window, buffers), `is_overnight` derived for night shifts *and* fixed shifts crossing midnight, policy column, rotational handled through Rotation Patterns (explained in UI).
- **Rotations**: off-day phases, reorder, cycle length **derived** from Σ phase days (previous default 21-day cycle vs 14 days of phases could never be consistent), `start_reference_date` sent as `YYYY-MM-DD`, phase preview, phase sequence in the list.
- **Roster** (`AttendanceRosterPage.jsx`): shared `EmployeePicker`; `effective_from` / `effective_to` sent as `YYYY-MM-DD`; **undocumented Edit action removed** (C2); "End" only offered on ongoing assignments; ongoing / upcoming / ended filter, search, client pagination; permanent-delete warning uses the employee's name.

### Phase 3 — Calendar rules (H18–H25, U19, U20)
- **Holidays**: date sent as `YYYY-MM-DD`; timestamp-safe display (no Invalid Date / previous-day shift); live employment types & job statuses; include/exclude overlap validation; targeting shown as names; catalog import now confirms org-wide scope and reports partial failures instead of swallowing them.
- **Weekly offs**: `effective_from` validated (was sent as `""`), **`excluded_users` control added**, priority validation, days sorted; rules grouped by *actual* targeting (was mislabelled by priority); effective-from and target names in the list.
- `LeaveDashboard` holiday widget passes `year`, shows only upcoming dates, honours `is_optional`.

### Phase 4 — Daily attendance (U1–U5, U11, U13, U16)
- **`AttendanceCard`** rebuilt: state from `/today` (`idle / working / on break / done`, plus holiday / weekly-off / leave context); location resolved before the punch with explicit Retry / "continue without location"; payload now includes `client_timestamp`, `work_mode` (remembered per browser), optional `notes` (≤500); single-flight guard; clock-out confirmation; clock-in result (late / grace / holiday) and authoritative clock-out calculation shown; shift + policy thresholds (U13) rendered; fake 75% ring replaced by progress against the policy full-day threshold.
- **My Attendance page**: history uses `from`/`to` for the selected month + pagination + late/early/OT columns; all 10 summary metrics; week stepper (U19 `date`); trends selector (3/6/12); **daily-log modal handles the object response** (`record`, `logs`, `breaks`, `sessions`, `anomalies`) — the old `log.map` would throw; "Correct" action deep-links to the regularization form with the date prefilled.
- **Self-service for all roles**: new routes `/dashboard/manager/attendance/*` and `/dashboard/hr/my-attendance/*`; sidebar "MY ATTENDANCE" section for managers and HR; punch card added to the HR dashboard.

### Phase 5 — Requests & analytics (U6–U10, U12, U14, U15, U17–U20)
- **Regularizations**: correct keys (`requested_clock_in/out`), status tabs incl. `cancelled`, pagination, past-date `max`, reason 5–1000 with counter, **overnight "next day" clock-out**, out > in / ≤24 h / not-in-future checks, mapped 409/`DATE_LOCKED` errors, withdraw with per-row loading, reviewer remarks shown.
- **Flags (anomalies)**: enum `open/resolved/all`, pagination, human labels, severity badges, resolution notes.
- **Overtime**: minutes-based display with documented fallbacks, pagination, reviewer remarks; copy no longer claims "approved only".
- **Comp-offs**: summary keys `available_balance / total_earned / used_days / expired_days`; status filter from the documented enum; pagination; expiry with "expiring soon" highlight; leave-balance explanation.
- **Employee dashboard**: fabricated "Better than 91.3%" removed, donut built from real counts, dead "Show all" select replaced by real links, month navigation for graph data, greeting by time of day, upcoming holidays (U20) instead of a developer placeholder.

### Phase 6 — Manager (M1–M17)
- All four request pages **and** the Approvals Inbox use the same `AttendanceApprovalQueue` + `DecisionDialog` (the two divergent UIs, the never-resetting `ActionModal`, and the inbox's extra `rejection_reason` key are gone). Requested times, reason, current record and notices are shown before deciding. The inbox's **leave branch was preserved** (only given a submit guard).
- Names resolved from documented flat `name` or via the hierarchy-scoped team list for endpoints that return only `user_id` — no UUID fragments.
- Sidebar approvals badge refreshes on every decision event (was a 60 s module cache that went stale); count survives non-array payloads.
- Dashboard: non-functional date navigator removed (team-today is today-only), team summary sends local `YYYY-MM-DD`, `console.log` removed, chart paging by fixed page size with future-month guard, shared team table reused on the Team Status page.
- Team History: local default dates (was UTC), `from`/`to` (C15), validation, pagination, name filter.
- Roster "View attendance": member history sends `from`/`to`/`page`/`limit` (was `month`/`year`), 8 summary metrics, pagination, working Retry.

### Phase 7 — HR management (H33–H58)
- **Comp-off policies**: rebuilt around the 5 documented fields (`min_hours_for_half_day`, `min_hours_for_full_day`, `multiplier`, `validity_days`, `requires_approval`); `alert()` UX replaced.
- **Org comp-offs**: documented status tabs (removed `rejected`/`consumed`), pagination, HR-override dialog with required reject remarks, bulk approval with confirmation, progress and a per-person failure report.
- **Locks & maintenance**: start ≤ end and reason validation, future-date warning, payroll-run locks labelled and protected by typed `UNLOCK` confirmation, removed the undocumented "auto-reject pending requests" claim (C17), creator shown; recompute accepts an optional date, shows progress and the returned count when provided.
- **HR regularizations**: decisions routed through the documented `/manager/regularizations/*` endpoints (C1); undocumented `{reason}` reject body removed; org list still read from the undocumented list endpoint with automatic fallback to the documented pending queue on 404/405.
- **Reports**: RFC-4180 CSV with local times and employee codes (no UUID filenames), local default dates, dynamic year list with future-month guard, loading/error states; employee report shared with the profile Reports tab (field names unified: `clock_in_time` vs `clock_in`).
- **Directory & profile tabs**: correct pagination key handling, date picker with future guard, periodic refresh for today, keyboard-accessible rows; HR users' profiles now use `/hr/hrs/:id/*` (**H48/H49/H50**); local date parsing (previously `new Date("YYYY-MM-DD")` rendered the previous day west of UTC and the Overview "today" used the UTC date); summary shows 8 metrics; heatmap covers half-day, leave, holiday and weekly-off.

### Phase 9 — HR dashboard (H59–H63)
- Live counts poll every 60 s while visible, refresh on focus and after corrections, with a "last updated" stamp and manual refresh.
- **Top Defaulters widget rendered** (month selector, grouped tabs if the payload is grouped, links to profiles) and **Work-Mode Distribution rendered** (date selector, pie + legend) — both were fetched and discarded before.
- Department summary has a date selector; graph no longer pads with **fabricated future dates**; every widget has independent loading/error states.

### Phase 10 — Hardening
- Production build, lint pass on all touched files, pure-logic test suite, reference sweeps (§6). Six obsolete manager components deleted after confirming no importers.

---

## 4. Bugs, edge cases and logical errors fixed

### 4.1 Found in the audit and fixed
| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | History sent `month`/`year` (ignored by backend) | Month navigation showed the wrong records | `from`/`to` for the month + pagination (U11, M15) |
| 2 | Daily log treated an object as an array (`log.map`) | Modal crash | Object-shaped rendering with array fallback |
| 3 | Clock-in geolocation errors swallowed | Silent punches without coordinates | Explicit location states, retry, acknowledged fallback |
| 4 | No double-submit guard on punches/approvals | Duplicate requests | Single-flight guards and disabled buttons everywhere |
| 5 | `ALREADY_CLOCKED_IN` / `DATE_LOCKED` only in console | User saw nothing | Mapped inline errors + automatic `/today` resync |
| 6 | Timer used undocumented `break_duration_minutes` | Wrong live hours | Σ closed breaks from `breaks[]`, frozen on active break |
| 7 | Regularization list read `clockIn`/`clockOut` | Times never shown | `requested_clock_in/out` |
| 8 | Regularization couldn't express overnight clock-out | Night-shift corrections impossible / wrong | "Next day" option + ordering validation |
| 9 | Anomaly filter sent `pending`/`ignored` | Filter returned wrong data | `open/resolved/all` |
| 10 | Comp-off summary read `total_used`; HR tabs `rejected/consumed` | Wrong/empty values | Documented keys and enum |
| 11 | Comp-off policy form sent 0 of 5 documented fields | Policies non-functional | Form rebuilt on documented fields |
| 12 | Shift had no `policy_id` | Policy → shift chain broken | Policy selector + list column |
| 13 | Assignment/rotation/holiday dates sent as UTC ISO datetimes | Off-by-one days around midnight | `YYYY-MM-DD` |
| 14 | Undocumented assignment Edit (PUT) | Could rewrite history | Removed from UI |
| 15 | End action offered on already-ended assignments | Invalid operation | Only for ongoing rows |
| 16 | Weekly-off `effective_from` sent as `""`; no `excluded_users` control | Rule creation errors / captured-not-editable field | Validation + control |
| 17 | "Global vs Exception" split by priority | Mislabelled rules | Grouped by real targeting |
| 18 | Manager names "Unknown" / UUID fragments | Unusable approvals | Flat `name` + hierarchy-scoped lookup; never UUIDs |
| 19 | `ActionModal` remarks persisted across rows; inbox sent `rejection_reason` | Wrong remarks submitted; unknown key | Shared dialog, reset per entity, documented body |
| 20 | Sidebar inbox badge never refreshed after decisions | Stale count | Event-driven refresh |
| 21 | Team summary sent a full UTC timestamp | Wrong day in IST before 05:30 | Local `YYYY-MM-DD` |
| 22 | Manager dashboard date navigator changed nothing | Misleading control | Removed (endpoint is today-only) |
| 23 | HR dashboard defaulters / work-mode fetched, never rendered | Missing analytics | Widgets built |
| 24 | HR graph padded with fabricated future dates | Misleading chart | Removed padding |
| 25 | Employee dashboard "Better than 91.3%", static donut, dead select | Fabricated UI | Real data or removed |
| 26 | HR profile tabs used `/employees/*` for HR staff; H48/H49 missing | Wrong/no data for HR users | Role-aware endpoint family |
| 27 | `LiveEffectiveHours` ×3 showed gross elapsed time as "effective" | Contradicted backend | Single, labelled implementation |
| 28 | CSV without quoting | Names with commas broke columns; formula injection | RFC-4180 + injection guard + BOM |
| 29 | Recompute toast shown before the request; no date option | Misleading success | Awaited, optional date, result count |
| 30 | Lock copy claimed auto-rejection; payroll locks deletable silently | Wrong expectations; paid periods reopened | Accurate copy; typed confirmation for payroll locks |
| 31 | HR regularization page used undocumented approve/reject with `{reason}` | Likely failures | Documented manager decision endpoints |
| 32 | `URLSearchParams` serialised empty filters (`status=`) | Backend validation errors | `qs()` |
| 33 | No `FEATURE_NOT_AVAILABLE` handling | Empty tables when flag off | `ErrorState` → `FeatureNotAvailable` |
| 34 | `console.log` of today's payload | Data leak in console | Removed |
| 35 | HR and managers had no self-service navigation | Could not punch/request (HR) | Routes + sidebar sections |

### 4.2 Additional defects discovered during implementation and fixed
| # | Location | Defect | Fix |
|---|---|---|---|
| A | Holiday / weekly-off modals | Employee options used `e.name \|\| e.full_name`; missing names produced `label: undefined`, and `MultiSelectDropdown` search calls `opt.label.toLowerCase()` → **TypeError crash** while typing | Options built by `toEmployeeOption` (always a string label) |
| B | Holiday / weekly-off / roster loaders | `(res.data \|\| []).filter` throws when the payload is an object | `listFrom` normalisation |
| C | `DashboardSidebar` badge | `res.data.length` on object payloads → `NaN` badge; one failed queue zeroed the whole count | `Promise.allSettled` + `listFrom` |
| D | Rotation modal | Default cycle 21 days vs 14 days of phases — inconsistent by default, never validated | Cycle derived from phases |
| E | Many displays | `new Date("YYYY-MM-DD")` is UTC midnight → previous day in negative-offset zones | `parseYMDLocal` / `fmtDate` everywhere touched |
| F | `OverviewTab` | "Today" matched with `toISOString()` (UTC) → wrong/no record before 05:30 IST | `todayYMD()` |
| G | Holiday list | `h.date + "T00:00:00"` → Invalid Date when the API returns a timestamp | `ymdOnly` normalisation |
| H | Policy form | `parseInt(value) \|\| 0` / `\|\| 30` / `\|\| 7` made fields impossible to clear and silently changed values | String state + validation |
| I | Holiday catalog "Add all" | Failures silently ignored, success count misleading | Per-item failure report |
| J | HR comp-off bulk approve | Failures only in console | Progress + failure list |
| K | Lists across the module | Out-of-order responses could overwrite newer filters | Request-id guards |
| L | Inbox leave modal | No submit guard (double approval possible) | `submitting` guard |
| M | Roster attendance modal | Month input could be cleared (`"".split`) → NaN period | Guarded, `max` = current month |
| N | Month navigators (employee, manager, HR, profile tabs) | Could navigate into future months | Future-month guard |
| O | `EmployeeDashboard` (my own regression, caught in review) | "Next month" disabled condition inverted | Fixed before completion |
| P | `AttendanceCard` (my own regression, caught in review) | Date header could render "Invalid Date" for timestamp dates; duplicate toast on `ALREADY_CLOCKED_IN` | `fmtDate(ymdOnly())`; single inline message |
| Q | Roster attendance modal (my own regression, caught in review) | Retry did not refetch the summary (`setMonth(m => m)` is a no-op) | Reload key |
| R | `csv.js` (my own regression, caught by lint) | Literal BOM character in source (`no-irregular-whitespace`) | `String.fromCharCode(0xfeff)` |
| S | Daily-log / records | Stale `record.date` keys, `key={idx}` rows | Stable ids / dates as keys |

---

## 5. Cache / refresh matrix (implemented)

| Mutation | Event | Subscribers refreshed |
|---|---|---|
| Clock in/out, break start/end | `punch` | Card (`/today`), employee dashboard graph, My Attendance summary/week/history, My Comp-offs |
| Regularization submit/withdraw/decide | `regularization` | My Regularizations, manager queues + inbox counts, sidebar badge, My Attendance, manager & HR dashboards, HR directory |
| Overtime decide | `overtime` | Queues, inbox counts, badge |
| Comp-off decide (manager/HR/bulk) | `compoff` | Queues, HR comp-offs, My Comp-offs, badge |
| Anomaly resolve | `anomaly` | Queues, inbox counts, badge |
| Policy/shift/rotation/assignment/holiday/weekly-off/comp-off policy change | `config` | Mounted shift/policy consumers (`/shift` on dashboards) |
| Lock create/delete, recompute | `lock` | HR dashboard live/graph, HR directory |

---

## 6. Verification performed

| Check | Result |
|---|---|
| `vite build` (output to scratch dir; tracked `dist/` untouched) | ✅ Built successfully after every phase and after final fixes |
| Pure-logic test suite (dates, normalizers, enums, validators, error mapper, CSV, live hours) | ✅ 53 / 52 / 51 assertions passed in `Asia/Kolkata` / `America/New_York` / `UTC` (timezone-specific cases differ per zone), including the IST 00:30 "today" case and overnight regularization |
| Every `attendanceAPI.*` reference resolves to a defined service function | ✅ No missing functions |
| No remaining UI references to undocumented approve/reject/assignment-PUT calls | ✅ None |
| No `toISOString().split` "today" logic in attendance code | ✅ None (one remains in payroll `TeamSalaryPage.jsx`, outside this module) |
| No `console.log` / `alert()` in attendance code | ✅ None |
| ESLint on touched files | ⚠️ Only repo-wide conventions remain (`'React' is defined but never used`, `react/no-unescaped-entities` — identical findings exist in untouched files such as `LeaveTypesPage.jsx`) plus dev-only `react-refresh/only-export-components` warnings on shared UI modules. Pre-existing findings in `DashboardSidebar.jsx`, `ManagerLeavePage.jsx`, `AttendanceLocationsPage.jsx` were not introduced by this work. |
| Runtime testing against the backend | ❌ Not possible in this environment (no backend available) — see §8 manual QA checklist |

The test script is kept outside the repo (scratchpad) because no test runner is configured; adding Vitest is recommended (§9).

---

## 7. Backend clarifications — status after implementation

| ID | Topic | Frontend decision taken | Still needs backend confirmation? |
|---|---|---|---|
| C1 | HR regularization endpoints | Decisions via documented manager routes; list via undocumented endpoint with fallback | Yes — confirm org-wide list endpoint and that HR decisions via manager routes are not hierarchy-limited |
| C2 | Assignment PUT | Edit removed from UI | Only if editing is wanted |
| C3 | Shift request keys (`type`, per-type fields) | Kept live keys + added documented `policy_id` | Yes |
| C4 | Policy extras | Sent only when the model already returns them | Yes (`max_breaks_per_day` placement) |
| C5 | Rotation `entries[]`, off days | `shift_id: null, is_off: true` for off phases | **Yes — off-day representation** |
| C6 | Assignment dates, `rotation_pattern_id`, overlap behaviour | `YYYY-MM-DD`; neutral copy | Yes |
| C7 | Holiday `type`, job statuses, employment-type values, date format | `YYYY-MM-DD`; values from roster | Yes |
| C8 | Weekly-off day numbering & extra fields | 0 = Sunday … 6 = Saturday | Yes |
| C9 | Devices | — (Phase 8 excluded) | Yes |
| C10 | Comp-off decision bodies | `{remarks}` sent only when typed; reject requires remarks in UI | Yes |
| C11 | Comp-off record shape / `rejected` status | Multi-key accessors; `rejected` display-only | Yes |
| C12 / C13 | Comp-off / overtime creation | No request forms (correct absence) | Confirm auto-generation trigger |
| C14 | Undocumented response shapes (~35 endpoints) | Normalisers accept documented + observed shapes | Yes |
| C15 | Undocumented query params (team history, HR lists/details, reports) | Team history `from/to`; HR details & reports keep the keys the live UI used | **Yes — team history (`from/to` vs `start_date/end_date`)** |
| C16 | Anomaly `open` vs `unresolved` | Both displayed as "Open"; filter sends documented enum | Yes |
| C17 | Lock side effects / payroll lock identification | Neutral copy; payroll detection by `payroll_run_id`/`source`/reason | Yes |
| C18 / C19 | Clock-out extra fields; `work_mode` source | Clock-out sends documented 4 fields; work mode user-selected & remembered | Confirm |
| C20 | Manager access to `/hr/hrs/*` | Not exposed to managers | Product decision |
| C21 | Recompute response | Count shown when present | Confirm key |
| C22 | `/today` break total | Computed from `breaks[]` | Confirm |

---

## 8. Manual QA checklist (run against a real backend)

1. Employee clocks in with location allowed → toast shows lateness/grace; card switches to Working; reload mid-break shows **End Break** only.
2. Deny location permission → explanation + "Clock in without location"; manager later sees a flag.
3. Double-click Clock In → exactly one request.
4. Clock out → confirmation → calculated summary (effective, breaks, late, OT, half-day type).
5. My Attendance: change month → Network shows `from/to` for that month; paginate.
6. Correct a past day from history → form prefilled; overnight 22:00 → 06:00 with "Next day"; submit → pending tab shows times.
7. Manager: approve with and without remarks, reject without remarks (blocked), sidebar badge decrements immediately.
8. Out-of-scope manager action → "outside your reporting line" message and queue refresh.
9. HR: create policy with break limits → create shift linked to it → assign from a date → employee `/shift` shows policy thresholds.
10. Create a rotation with an off-day phase (validates C5).
11. Holiday targeting to one department; weekly-off with exclusion; verify employee weekly calendar statuses.
12. Lock a range → punch/regularization inside it shows the payroll-lock message; unlock a payroll-run lock requires typing UNLOCK.
13. HR dashboard: defaulters and work-mode widgets populate; live counts refresh.
14. HR opens an HR staff member's profile → requests go to `/attendance/hr/hrs/:id/*`.
15. Disable `attendance.access` for an org → pages show "Attendance isn't enabled" instead of empty tables.
16. Set OS timezone to UTC-5 and IST at 00:30 → dates and "today" remain correct.

---

## 9. Known limitations & recommended follow-ups

- **Phase 8 (biometric) not implemented by request.** The audit's critical findings there remain open: API key discarded on device registration, mapping payload keys wrong (`employee_id`/`biometric_id`), raw UUID entry, forced `status:"active"`, sidebar link hidden (H26–H32, W1 prerequisites).
- No test runner in the project; add Vitest and move the scratch test suite in (`dates`, `normalize`, `validation`, `attendanceErrors`, `csv`, `liveHours`).
- Server-side search/department filters for HR lists and assignment ledger await C15; current search filters the loaded page only (labelled "Filter this page").
- Repo-wide lint conventions (`React` import, unescaped entities) should be addressed by lint config (`react/jsx-runtime`) rather than per file.
- Payroll `TeamSalaryPage.jsx` still derives "today" from UTC (outside attendance scope).

---

## 10. File inventory

**New**
`src/shared/attendance/` — `dates.js`, `normalize.js`, `enums.js`, `validation.js`, `events.js`, `geolocation.js`, `liveHours.js`, `paths.js`, `usePagedList.js`, `useTodayAttendance.js`, `useTargetingOptions.js`, `useTeamNames.js`, `decisions.js`, `memberAttendance.js`, `ui.jsx`, `DecisionDialog.jsx`, `EmployeePicker.jsx`, `AttendanceApprovalQueue.jsx`, `LiveEffectiveHours.jsx`, `EmployeeAttendanceReport.jsx`
`src/shared/utils/attendanceErrors.js`, `src/shared/utils/csv.js`, `src/roles/manager/components/ManagerQueuePage.jsx`

**Modified**
API/infra: `src/shared/api/attendance.api.js`, `src/shared/auth/permissions.js`, `src/shared/components/DashboardSidebar.jsx`, `src/routes/AppRoutes.jsx`
Employee: `components/AttendanceCard.jsx`, `components/RegularizationCard.jsx`, `screens/EmployeeDashboard.jsx`, `EmployeeAttendancePage.jsx`, `AttendanceRegularizationsPage.jsx`, `AttendanceAnomaliesPage.jsx`, `EmployeeOvertimePage.jsx`, `EmployeeCompOffsPage.jsx`, `LeaveDashboard.jsx` (holiday widget only)
Manager: `ManagerDashboard.jsx`, `ManagerApprovalsInbox.jsx`, `ManagerRegularizationsPage.jsx`, `ManagerOvertimePage.jsx`, `ManagerCompOffsPage.jsx`, `ManagerAnomaliesPage.jsx`, `ManagerTeamPage.jsx`, `ManagerTeamHistoryPage.jsx`, `ManagerTeamRosterPage.jsx` (attendance modal only)
HR: `attendance/screens/AttendancePoliciesPage.jsx`, `AttendanceShiftsPage.jsx`, `AttendanceRosterPage.jsx`, `AttendanceHolidaysPage.jsx`, `AttendanceWeeklyOffsPage.jsx`, `AttendanceCompOffPoliciesPage.jsx`, `AttendanceCompOffsPage.jsx`, `AttendanceLockPeriodsPage.jsx`, `AttendanceRegularizationsHRPage.jsx`, `AttendanceReportsPage.jsx`, `components/AttendanceDirectory.jsx`, `screens/HRDashboard.jsx`, `screens/employee-profile/AttendanceTab.jsx`, `OverviewTab.jsx`, `ReportsTab.jsx`

**Deleted (no remaining importers)**
`src/roles/manager/components/ActionModal.jsx`, `ActiveAnomalies.jsx`, `PendingOvertime.jsx`, `PendingRegularizations.jsx`, `TeamHistoryTable.jsx`, `TeamStatusToday.jsx`

**Untouched by this work** (pre-existing uncommitted changes in the tree): `RegisterOrgPage.jsx`, `AttendanceLocationsPage.jsx`, `DepartmentsPage.jsx`, `EmployeeProfilePage.jsx`, `EmployeesPage.jsx`, `hrms.api.js`, `organization.api.js`, `DirectoryPage.jsx`, `MyProfilePage.jsx`, `api_registry.md`, `BiometricDevicesPage.jsx`, `dist/`.

*Nothing was committed.*
