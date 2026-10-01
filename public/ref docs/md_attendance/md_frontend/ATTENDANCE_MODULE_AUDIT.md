# Attendance Module — Backend-to-Frontend Contract Audit & Implementation Plan

**Scope:** Analysis and planning only. No code was modified.
**Date:** 2026-09-13 · **Branch:** `dev`
**Backend sources of truth read:**
`public/ref docs/md_attendance/3_user_attendance_api.md`, `4_manager_attendance_api.md`, `5_hr_attendance_api.md`, `6_webhook_attendance_api.md`, `public/ref docs/api_registry.md` (attendance sections), `public/ref docs/new updates/new_apis_2026_08_29.md`, `error_handling_api_changes.md`. Cross-module context: `md_leave/development_phases.md`, `md_leave/md_phases/phase4_analysis.md`, `md_payrolls/implementation_plan.md`.
**Frontend read:** `src/shared/api/attendance.api.js`, `client.js`, `AppRoutes.jsx`, `DashboardSidebar.jsx`, `permissions.js`, `dictionary.js`, and every screen/component that imports `attendanceAPI` (38 files).

---

## 0. Executive Summary

| Metric | Value |
|---|---|
| Documented Attendance endpoints | **101** (User 20 · Manager 17 · HR 63 · Webhook 1) |
| Endpoints with an API service function | 98 / 100 browser-applicable (2 missing) |
| **Fully Implemented (verified end-to-end)** | **7** |
| Partially Implemented | 59 |
| Incorrectly Integrated | 17 |
| Form Incomplete | 5 |
| Backend Clarification Required (primary blocker) | 7 |
| UI Missing | 3 |
| Missing (no service, no UI) | 2 |
| Not Applicable to Browser (hardware) | 1 |
| **Attendance API Coverage % (fully implemented / 100 applicable)** | **7%** |
| Attendance API "usable" coverage (fully + partial) | 66% |
| **Attendance Form Contract Coverage %** | **72%** (48 / 67 meaningful documented capabilities) |
| Attendance Filter/Query Coverage % | 33% (11 / 33 documented query params sent correctly) |
| **Attendance Workflow Coverage %** | **0% fully complete** (0/10) · 30% weighted (6 partial, 4 broken) |

The headline number is low for a structural reason, not because pages are absent: almost every endpoint has a service function and a screen, but very few survive a field-by-field check. Most failures fall into a small number of repeating patterns, so the remediation is smaller than the 7% suggests.

### The 12 findings that matter most

1. **Biometric onboarding is unusable.** Device registration discards the one-time `api_key_plain`, so no device can authenticate to the webhook. The mapping form sends `employee_id`/`biometric_id` instead of the documented `user_id`/`device_employee_id`, and asks HR to type a raw UUID. The page is also hidden: its sidebar link is commented out. ([BiometricDevicesPage.jsx:58-71](src/roles/hr/screens/BiometricDevicesPage.jsx#L58-L71), [:119-122](src/roles/hr/screens/BiometricDevicesPage.jsx#L119-L122), [DashboardSidebar.jsx:176](src/shared/components/DashboardSidebar.jsx#L176))
2. **Comp-Off Policy form sends none of the five documented fields.** It sends `min_hours_required`, `expiry_days`, `is_active`, `description`. Backend documents `min_hours_for_half_day`, `min_hours_for_full_day`, `multiplier`, `validity_days`, `requires_approval`. ([AttendanceCompOffPoliciesPage.jsx:73-79](src/roles/hr/attendance/screens/AttendanceCompOffPoliciesPage.jsx#L73-L79))
3. **Shift templates cannot be linked to an Attendance Policy.** The documented `policy_id` has no selector, so the "Policy → Shift → Assignment → Calculation" chain is broken at step 2. ([AttendanceShiftsPage.jsx:80-96](src/roles/hr/attendance/screens/AttendanceShiftsPage.jsx#L80-L96))
4. **Employee history sends the wrong filters.** It sends `month`/`year`; the backend accepts `from`/`to`/`page`/`limit`. The filter is ignored, and only the default 20 most recent records ever render, whatever month is selected. ([EmployeeAttendancePage.jsx:115](src/roles/employee/screens/EmployeeAttendancePage.jsx#L115)) The manager's team-member history has the same defect. ([ManagerTeamRosterPage.jsx:216](src/roles/manager/screens/ManagerTeamRosterPage.jsx#L216))
5. **Clock In/Out fails silently.** Geolocation errors are swallowed and the punch goes out without coordinates. No `work_mode`, `notes` or `client_timestamp` is sent. `ALREADY_CLOCKED_IN` and `DATE_LOCKED` only reach `console.error`. Buttons have no disabled/loading state, so double clicks are possible. ([AttendanceCard.jsx:47-74](src/roles/employee/components/AttendanceCard.jsx#L47-L74))
6. **My Regularizations never shows requested times.** It reads `req.clockIn`/`req.clockOut` instead of `requested_clock_in`/`requested_clock_out`. ([RegularizationCard.jsx:110-111](src/roles/employee/components/RegularizationCard.jsx#L110-L111))
7. **My Anomalies filter uses the wrong enum.** It sends `pending`/`ignored`; the backend enum is `open`/`resolved`/`all`. ([AttendanceAnomaliesPage.jsx:57-60](src/roles/employee/screens/AttendanceAnomaliesPage.jsx#L57-L60))
8. **Employee Comp-Off page reads wrong fields.** The summary reads `total_used` (documented: `used_days`), and the list reads `worked_date`/`days_earned` while manager/HR pages read `earned_date`/`worked_hours` for the same entity. ([EmployeeCompOffsPage.jsx:84, 121-123](src/roles/employee/screens/EmployeeCompOffsPage.jsx#L84))
9. **HR Dashboard fetches Top Defaulters and Work-Mode Distribution but never renders them.** State is set and never read. ([HRDashboard.jsx:67-68, 97-99](src/roles/hr/screens/HRDashboard.jsx#L67-L68))
10. **Manager team views show "Unknown" instead of names.** Team Today/Anomalies read `user.profile.first_name`, but the documented response is flat (`name`) or `user_id` only. Anomalies fall back to a UUID fragment. ([ManagerAnomaliesPage.jsx:22](src/roles/manager/screens/ManagerAnomaliesPage.jsx#L22), [TeamStatusToday.jsx:47-49](src/roles/manager/components/TeamStatusToday.jsx#L47-L49))
11. **The frontend calls 4 undocumented endpoints.** They are `GET/POST /attendance/hr/regularizations[/:id/approve|reject]` (a live sidebar page) and `PUT /attendance/hr/shifts/assignments/:id` (an "Edit" menu item). → Backend Clarification Required.
12. **HR users have no clock-in UI.** Managers have one on their dashboard but no own-history, regularization, anomaly, overtime or comp-off pages in navigation. The backend authorizes all five roles for self-service. ([DashboardSidebar.jsx:238-247](src/shared/components/DashboardSidebar.jsx#L238-L247))

### Documentation gaps that block "100%"
Many documented endpoints (overtime/mine, comp-offs/mine, daily-log, graph-data, trends, weekly-calendar, all pending lists, all HR read/report/dashboard endpoints) have **no documented response shape**. Several create endpoints (shift, rotation, holiday, weekly-off, device) have **no documented request body**. These cannot be marked Fully Implemented without backend confirmation. They are listed in §8, and the plan treats them as a Phase 0 parallel track.

---

## 1. Attendance Module Understanding

### 1.1 User attendance (self-service, all roles incl. HR/Manager/Admin)
- **Live state machine** is driven by `GET /today` (`status`: `not_marked | in_progress | present | holiday | weekly_off | …`, plus `active_break`, `breaks[]`, `shift`, `is_holiday`, `is_weekly_off`).
- **Punches:** `clock-in` (geofence validated against org location; an out-of-bounds punch is *accepted* but creates an `out_of_bounds` anomaly), `break/start`, `break/end` (excessive break → `excessive_break` anomaly; `max_breaks_per_day` enforced), `clock-out` (auto-closes an open break, runs `CalculationService.calculateRecord`, and returns the authoritative `status`, `effective_hours`, `overtime_minutes`, `half_day_type`).
- **Payroll lock** is checked on every punch → `403 DATE_LOCKED`.
- **Requests:** Regularization submit/list/cancel. Overtime and Comp-Off are **read-only for the employee** (no documented create endpoint). Per Leave Phase-4 docs, comp-offs are *system-generated at clock-out* when holiday/weekly-off work is detected.
- **Analytics:** history (paginated), monthly summary, daily log, graph data, trends, weekly calendar, applicable holidays, active shift.

### 1.2 Manager attendance
- Every read and approval is **hierarchy-scoped server-side** via `accessControl.getAccessibleUserIds()` (recursive `user_reporting_mappings`). Out-of-scope → `403 HIERARCHY_VIOLATION`.
- Reads: team today, team history, team summary (by date), team graph (by month), member history, member summary.
- Actions: resolve anomaly (`remarks`), approve/reject regularization (`remarks`; approval upserts the record and recalculates), approve/reject overtime (`remarks`; feeds payroll), approve/reject comp-off (approval credits the Leave "CO" balance).

### 1.3 HR configuration
- **Policy** (grace, half/full-day thresholds, max break, regularization window, overtime) → linked from **Shift template** (`policy_id`; types fixed/flexible/split/night/rotational) → **Rotation pattern** (`rotation_cycle_days`, shift phases) → **Assignment** (`user_id`, `shift_id`, `effective_from`; end via `effective_to`; delete is a hard delete).
- **Calendar exceptions:** Holidays (org/department/location/employment-type targeting, include/exclude users) and Weekly-Off rules (`days_of_week`, scoped by department/shift/employment type).
- **Comp-Off policies** and org-wide comp-off HR overrides.
- **Payroll locks** (date ranges freezing punches, regularizations, overtime, comp-off) and the stale-record recompute sweep.
- **Reports** (daily / monthly / per-employee) and **org read views** split by role population (`/hr/employees/*`, `/hr/managers/*`, `/hr/hrs/*`). The `/hr/hrs/*` routes are also allowed for `manager` per the registry.
- **Dashboards:** live counts, graph, department summary, top defaulters, work-mode distribution.

### 1.4 Hardware integration
Register device → receive one-time `api_key_plain` → map `device_employee_id` ↔ `user_id` → the device POSTs `/devices/webhook` with `Authorization: Bearer <api_key_plain>` → the backend deduplicates within ±60 s, checks locks, and writes an `attendance_log` (source `biometric`). **Records/sessions are built asynchronously** by a background worker, so a biometric punch does not appear in `/today` immediately.

### 1.5 Calculation dependencies
`attendance_record` status = f(logs, breaks, **shift snapshot**, **policy snapshot**, holidays, weekly-offs, calendar exceptions, approved leave). The frontend must never re-derive status. It should display backend `status`, `effective_hours`, `late_minutes`, `early_exit_minutes`, `overtime_minutes`, `half_day_type`.

### 1.6 Cross-module dependencies
| Attendance feature | Dependency | Source | Impact | Required handling |
|---|---|---|---|---|
| Manager team views/approvals | Reporting hierarchy | Org module (`user_reporting_mappings`, HOD changes) | Team scope changes | Re-fetch team lists on mount; no client-side scope filtering |
| Clock-in geofence | Locations (lat/lng/radius/timezone) | Org `/organizations/locations` | Out-of-bounds anomalies | Locations page already sends radius/timezone ✓ |
| Holiday / weekly-off targeting | Departments, Locations, Employees, employment types | Org module | Who gets the holiday | Selectors must use live org data (employment-type list is hardcoded today) |
| Comp-off approval | Leave "CO" balance (+1.0), 90-day expiry cron | Leave module | Leave wallet | Refresh leave balance views after approval; show expiry |
| Leave approval | Inserts `on_leave` attendance record | Leave module | History/summary | Status map must include `on_leave` |
| Overtime approval / records | Payroll run | Payroll module | Pay | None client-side; show locked state |
| Payroll run approve/cancel | Creates/removes attendance lock (`lockService.createLock`) | Payroll D-3 | Locks list; punch/regularization rejections | Lock page should label payroll-created locks; warn before unlocking |
| All endpoints | `attendance.access` feature flag | Subscription | 403 `FEATURE_NOT_AVAILABLE` | Needs `attendanceErrors.js` like `leaveErrors.js`/`payrollErrors.js` |

---

## 2 + 4. Complete API Inventory & Master API Coverage Matrix

Deliverables 2 (inventory) and 4 (coverage matrix) are merged so that each of the 101 endpoints appears exactly once, and no endpoint is combined with another.
**Status legend:** ✅ Fully · 🟡 Partial · ❌ Incorrectly Integrated · 📝 Form Incomplete · 👁 UI Missing · ⛔ Missing · ❓ Backend Clarification Required · 🔌 Not Applicable to Browser.
**Phase** refers to §10.

### 2.1 User Attendance — `/api/v1/attendance` (all org roles, flag `attendance.access`)

| # | Endpoint | Method | Purpose | Frontend consumer | Status | Form / Filter coverage | Missing work | Phase |
|---|---|---|---|---|---|---|---|---|
| U1 | `/clock-in` | POST | Start day, geofence, lateness | `AttendanceCard.handlePunch` (Employee & Manager dashboards) | 🟡 | Body 3/6 | Geolocation states (denied/unsupported/timeout/retry), `work_mode`, `notes`, `client_timestamp`; show `late_minutes`/`within_grace`/holiday result; errorCode handling; disable during request; HR has no punch UI | 4 |
| U2 | `/clock-out` | POST | End day, calculate record | same | 🟡 | Body 3/4 | `notes`; show calc result (effective/break/late/early/OT/status/half_day_type); refresh history/summary/graph; errors | 4 |
| U3 | `/break/start` | POST | Start break | same | 🟡 | n/a | Loading/disable; 400 "already on break" / `max_breaks_per_day` messages | 4 |
| U4 | `/break/end` | POST | End break | same | 🟡 | n/a | Loading/disable; "no active break" message; excessive-break notice | 4 |
| U5 | `/today` | GET | Live state | `EmployeeDashboard`, `ManagerDashboard` | 🟡 | n/a | Drive buttons from `status` (not `clock_in_time` presence); handle `holiday`/`weekly_off`; timer must use `breaks[]`/`active_break` (reads undocumented `break_duration_minutes`); render `shift`; remove hardcoded 75% progress ring | 4 |
| U6 | `/regularization` | POST | Submit correction | `RegularizationCard` | 🟡 | Body 4/4, validation 2/5 | Past-date `max` on date input; reason max 1000; clock-out after clock-in; overnight clock-out (next-day date); map 409 duplicate / `DATE_LOCKED` / window-exceeded; replace `alert()` | 5 |
| U7 | `/regularizations` | GET | My requests | `AttendanceRegularizationsPage` | ❌ | Query 0/3 | Read `requested_clock_in/out` (reads `clockIn/clockOut`); `status` filter incl. `cancelled`; pagination; cancelled badge; colSpan bug | 5 |
| U8 | `/regularizations/:id/cancel` | POST | Withdraw pending | `RegularizationCard.handleCancel` | 🟡 | n/a | Loading/disable; map 403 / already-processed errors | 5 |
| U9 | `/overtime/mine` | GET | My overtime | `EmployeeOvertimePage` | ❌ | Query 0/2 | Reads `record.hours`/`manager_note` (manager side uses `overtime_minutes`); response shape undocumented ❓; pagination; copy says "approved" but list is all statuses | 5 |
| U10 | `/anomalies/mine` | GET | My anomalies | `AttendanceAnomaliesPage` | ❌ | Query 0/3 | Status enum `open/resolved/all` (sends `pending/ignored`); pagination | 5 |
| U11 | `/history` | GET | Paginated history | `EmployeeAttendancePage` | ❌ | Query 0/4 | Send `from`/`to` for the selected month + `page`/`limit`; pagination UI; add late/early/OT columns; status keys (`half_day` not `half-day`) | 4 |
| U12 | `/summary` | GET | Monthly aggregates | `EmployeeAttendancePage` | 🟡 | Query 2/2 | Shows 4/10 metrics (missing half days, leave, holidays, weekly offs, OT, total days) | 5 |
| U13 | `/shift` | GET | Active shift | `EmployeeDashboard`, `ManagerDashboard` → `AttendanceCard` prop | 👁 | n/a | `shiftData` prop is never rendered; show name/type/timing/grace/thresholds (thresholds are **minutes** here) | 4 |
| U14 | `/comp-offs/mine` | GET | My comp-offs | `EmployeeCompOffsPage` | ❌ | Query 0/3 | Field names inconsistent with manager/HR pages ❓; status enum `earned/approved/used/expired/cancelled` (badges assume approved/rejected); filter; pagination; show expiry | 5 |
| U15 | `/comp-offs/mine/summary` | GET | Balance summary | `EmployeeCompOffsPage` | ❌ | n/a | `used_days` (reads `total_used`); `expired_days` not shown | 5 |
| U16 | `/daily-log` | GET | Punch/break/session/anomaly detail | `EmployeeAttendancePage.DailyLogModal` | ❌ | Query 1/1 | Modal calls `log.map`, treating it as an array; HR daily-log equivalents return an object (`sessions`, `breaks`, `anomalies`) → likely runtime error; response shape ❓ | 4 |
| U17 | `/graph-data` | GET | Day-series chart | `EmployeeDashboard` | 🟡 | Query 2/2 | Donut offsets hardcoded; fabricated "Better than 91.3%"; dead "Show all" select; no month navigation; response shape ❓ | 5 |
| U18 | `/trends` | GET | N-month trend | `EmployeeAttendancePage` | 🟡 | Query 1/1 (hardcoded 6) | Response shape ❓ (`t.month`, `total_effective_hours` assumed); selectable months | 5 |
| U19 | `/weekly-calendar` | GET | 7-day calendar | `EmployeeAttendancePage` | 🟡 | Query 0/1 | Status keys `half-day`/`weekly-off` vs backend underscore; no week navigation (`date`); shift/holiday details not shown | 5 |
| U20 | `/holidays` | GET | Applicable holidays | `LeaveDashboard` only | 🟡 | Query 0/1 | Service has no `year` arg; not shown in attendance area; `is_optional` badge | 5 |

### 2.2 Manager Attendance — `/api/v1/attendance/manager` (manager, hr, admin, super-admin)

| # | Endpoint | Method | Purpose | Frontend consumer | Status | Form / Filter coverage | Missing work | Phase |
|---|---|---|---|---|---|---|---|---|
| M1 | `/team/today` | GET | Live team status | `ManagerTeamPage`→`TeamStatusToday`, `ManagerDashboard.TeamDirectoryTable` | ❌ | n/a | Reads `user.profile.*` (doc returns flat `name`) → "Unknown"; dashboard date navigator changes nothing (endpoint is today-only) → remove or switch to history; show `active_break`/shift | 6 |
| M2 | `/team/history` | GET | Team history | `ManagerTeamHistoryPage` | ❓ | Query undocumented | Sends `start_date`/`end_date` (other history APIs use `from`/`to`); pagination; UTC `toISOString` default dates | 6 |
| M3 | `/team/anomalies` | GET | Unresolved team anomalies | `ManagerAnomaliesPage`, `ManagerApprovalsInbox`, sidebar badge | 🟡 | n/a | Name resolution (doc returns `user_id` only → UUID fragment shown); inbox reads `anomaly_type` (doc: `type`); status enum `unresolved` vs user `open` ❓ | 6 |
| M4 | `/anomalies/:id/resolve` | POST | Resolve anomaly | `ManagerAnomaliesPage`, `ManagerApprovalsInbox` | 🟡 | Body 1/1 | Remarks textarea never resets (`ActionModal` state persists); no loading; `HIERARCHY_VIOLATION` message; sidebar badge cache not invalidated | 6 |
| M5 | `/regularizations/pending` | GET | Pending regs | `ManagerRegularizationsPage`, inbox, sidebar | 🟡 | n/a | Show requested in/out times + reason in review modal; name resolution; response shape ❓ | 6 |
| M6 | `/regularizations/:id/approve` | POST | Approve + recalc | same | 🟡 | Body 1/1 | `DATE_LOCKED`/`HIERARCHY_VIOLATION` messages; loading/duplicate guard; badge refresh | 6 |
| M7 | `/regularizations/:id/reject` | POST | Reject | same | 🟡 | Body 1/1 (inbox adds undocumented `rejection_reason`) | Remove extra field; require remarks consistently (inbox requires, page doesn't) | 6 |
| M8 | `/overtime/pending` | GET | Pending OT | `ManagerOvertimePage`, inbox, sidebar | 🟡 | n/a | Show date, minutes, record context; names | 6 |
| M9 | `/overtime/:id/approve` | POST | Approve OT | same | 🟡 | Body 1/1 | Errors/loading/lock message | 6 |
| M10 | `/overtime/:id/reject` | POST | Reject OT | same | 🟡 | Body 1/1 (+ extra field in inbox) | Same as M7 | 6 |
| M11 | `/comp-offs/pending` | GET | Pending comp-offs | `ManagerCompOffsPage`, inbox, sidebar | 🟡 | n/a | Response shape ❓; names | 6 |
| M12 | `/comp-offs/:id/approve` | POST | Approve, credit leave | same | 🟡 | Body undocumented ❓ (page sends none, inbox sends `remarks`) | Confirmation that leave balance will be credited; hardcoded "90 days" fallback text; loading | 6 |
| M13 | `/comp-offs/:id/reject` | POST | Reject | same | 🟡 | Body undocumented ❓ | Confirmation; loading | 6 |
| M14 | `/team/summary` | GET | Team counts for a date | `ManagerDashboard` | ❌ | Query 0/1 | Sends full ISO timestamp (doc: `YYYY-MM-DD`), which is also UTC-shifted; response keys ❓ | 6 |
| M15 | `/team/member/:userId/history` | GET | Member history | `ManagerTeamRosterPage.ViewAttendanceModal` | ❌ | Query 0/4 | Sends `month`/`year`; must send `from`/`to`/`page`/`limit`; pagination; service signature is wrong | 6 |
| M16 | `/team/member/:userId/summary` | GET | Member monthly summary | same | 🟡 | Query 2/2 | Shows 4 metrics only | 6 |
| M17 | `/team/graph-data` | GET | Team trend chart | `ManagerDashboard` | 🟡 | Query 2/2 | Arbitrary 2-page split; response keys ❓ | 6 |

### 2.3 HR Attendance — `/api/v1/attendance/hr` (hr, admin, super-admin; `/hrs/*` also manager)

| # | Endpoint | Method | Purpose | Frontend consumer | Status | Form / Filter coverage | Missing work | Phase |
|---|---|---|---|---|---|---|---|---|
| H1 | `/policies` | POST | Create policy | `AttendancePoliciesPage.PolicyModal` | 📝 | 8/10 | Add `max_break_duration_minutes`, `max_breaks_per_day`; confirm undocumented `late_threshold_minutes`, `is_default` ❓; client validation (half ≤ full) | 2 |
| H2 | `/policies` | GET | List policies | `AttendancePoliciesPage`, `DocumentsPage`, `PolicyDocumentModal` | ✅ | n/a | (Optional) show OT/regularization columns | — |
| H3 | `/policies/:id` | GET | Policy detail | Edit prefill | ✅ | n/a | — | — |
| H4 | `/policies/:id` | PUT | Update policy | same modal | 📝 | 8/10 | Same as H1 | 2 |
| H5 | `/policies/:id/deactivate` | PATCH | Deactivate | `handleDeactivate` | ✅ | n/a | Map by errorCode rather than status 400 | 10 |
| H6 | `/shifts/assign` | POST | Assign shift/rotation | `AttendanceRosterPage.AssignModal` | ❓ | 2/3 | `effective_from` sent as ISO datetime (doc: `YYYY-MM-DD`); `rotation_pattern_id` field name undocumented; behaviour when an active assignment exists; exclude inactive shifts ✓ | 2 |
| H7 | `/shifts/assignments` | GET | Assignment ledger | `AttendanceRosterPage` | 🟡 | Filters none | Active/ended filter, employee search, pagination (query params undocumented ❓) | 2 |
| H8 | `/shifts/assignments/:assignment_id` | DELETE | Hard delete | `DeleteShiftModal` | ✅ | n/a | — | — |
| H9 | `/shifts/assignments/:assignment_id/end` | POST | Set `effective_to` | `EndShiftModal` | ❓ | 1/1 | Body undocumented; ISO datetime vs date; only offer on ongoing (`effective_to == null`) rows | 2 |
| H10 | `/shifts` | POST | Create shift template | `AttendanceShiftsPage.ShiftModal` | 📝 | 4/6 | **`policy_id` selector**; rotational type hidden; per-type fields (`min_hours`, `core_*`, `split_*_2`, `buffer_*`, `is_overnight`) undocumented ❓; overnight validation for night shifts | 2 |
| H11 | `/shifts` | GET | List shifts | Shifts, Roster, Weekly-offs | 🟡 | n/a | Show linked policy; `type` vs `shift_type` naming ❓ | 2 |
| H12 | `/shifts/:id` | GET | Shift detail | Edit prefill | ✅ | n/a | — | — |
| H13 | `/shifts/:id` | PUT | Update shift | same modal | 📝 | 4/6 | Same as H10 | 2 |
| H14 | `/shifts/:id` | DELETE | Delete shift | `handleDeleteShift` | 🟡 | n/a | Error mapped by assumption (400 = "employees assigned") | 2 |
| H15 | `/rotations` | POST | Create rotation | `RotationModal` | 📝 | 3/4 | Off-day phases (doc example "2 days Off"); validate Σ`duration_days` = `rotation_cycle_days`; entries schema ❓ | 2 |
| H16 | `/rotations` | GET | List rotations | Shifts page, Assign modal | 🟡 | n/a | Show phase sequence with shift names | 2 |
| H17 | `/rotations/:id` | DELETE | Delete rotation | `handleDeleteRotation` | 🟡 | n/a | Warn if assigned; mapped errors | 2 |
| H18 | `/holidays` | POST | Create holiday | `HolidayModal`, preset importer | ❓ | 7/7 | `type` enum (public/optional/restricted) vs user response `is_optional`; `target_job_statuses` undocumented; employment-type values hardcoded; date sent as ISO datetime; presets skip targeting | 3 |
| H19 | `/holidays` | GET | List by year | `AttendanceHolidaysPage` | 🟡 | Query 1/1 | Targeting shown as count only (no names); `h.date + "T00:00:00"` produces Invalid Date if backend returns a timestamp | 3 |
| H20 | `/holidays/:id` | PUT | Update holiday | `HolidayModal` | ❓ | 7/7 | Same as H18; edit prefill of timestamp date into `<input type=date>` | 3 |
| H21 | `/holidays/:id` | DELETE | Delete holiday | `handleDelete` | ✅ | n/a | — | — |
| H22 | `/weekly-offs` | POST | Create rule | `WeeklyOffModal` | 🟡 | 4/4 | `effective_from` marked required but not validated (sends `""`); `excluded_users` in state with no UI; day numbering ❓ | 3 |
| H23 | `/weekly-offs` | GET | List rules | `AttendanceWeeklyOffsPage` | 🟡 | n/a | "Global vs Exception" is split by `priority`, not by targeting (mislabels); show effective_from and targets | 3 |
| H24 | `/weekly-offs/:id` | PUT | Update rule | `WeeklyOffModal` | 🟡 | 4/4 | Same as H22 | 3 |
| H25 | `/weekly-offs/:id` | DELETE | Delete rule | `handleDelete` | ✅ | n/a | — | — |
| H26 | `/devices` | POST | Register device, returns one-time key | `BiometricDevicesPage` | ❌ | Request ❓ · response 0/1 | **Show `api_key_plain` once with copy + warning**; show `device_id`; request fields (`ip_address`, free-text `location`, `status`) undocumented; restore sidebar link | 8 |
| H27 | `/devices` | GET | List devices | same | 🟡 | n/a | `status==='active'` is labelled "Online" (it is activation state; use `last_sync_at`); show device ID | 8 |
| H28 | `/devices/:id` | PUT | Update device | same | 🟡 | ❓ | Hardcodes `status:"active"` → cannot deactivate, and silently reactivates | 8 |
| H29 | `/devices/:id` | DELETE | Deactivate/remove | same | 🟡 | n/a | Copy says "delete … remove all mappings" (doc: deactivates/removes ❓); errors | 8 |
| H30 | `/devices/:id/mappings` | POST | Map employee | Mappings modal | ❌ | 0/2 | Send `user_id` + `device_employee_id`; employee picker (name/code) instead of UUID text; duplicate error | 8 |
| H31 | `/devices/:id/mappings` | GET | List mappings | Mappings modal | ❌ | n/a | Reads `biometric_id`/`employee_name`/`employee_id`; must show name + code | 8 |
| H32 | `/devices/:id/mappings/:mappingId` | DELETE | Unmap | Mappings modal | 🟡 | n/a | Errors; `window.alert` UX | 8 |
| H33 | `/comp-off-policies` | POST | Create comp-off policy | `AttendanceCompOffPoliciesPage` | ❌ | 1/6 | Replace fields with `min_hours_for_half_day`, `min_hours_for_full_day`, `multiplier`, `validity_days`, `requires_approval` | 7 |
| H34 | `/comp-off-policies` | GET | List | same | ❌ | n/a | Render documented fields | 7 |
| H35 | `/comp-off-policies/:id` | PUT | Update | same | ❌ | 1/6 | Same as H33 | 7 |
| H36 | `/comp-off-policies/:id` | DELETE | Delete | same | 🟡 | n/a | Errors; alert UX | 7 |
| H37 | `/comp-offs` | GET | Org-wide comp-offs | `AttendanceCompOffsPage` | ❌ | Query 1/? | Tabs `rejected`/`consumed` are not in the documented enum (`used`/`cancelled`); pagination; employee filter ❓ | 7 |
| H38 | `/comp-offs/:id/approve` | POST | HR override approve | same (single + bulk) | 🟡 | Body ❓ | Override confirmation; remarks; bulk progress/failure report; leave-credit notice | 7 |
| H39 | `/comp-offs/:id/reject` | POST | HR override reject | same | 🟡 | Body ❓ | Require remarks; confirmation | 7 |
| H40 | `/locks` | GET | List locks | `AttendanceLockPeriodsPage` | 🟡 | n/a | Distinguish payroll-created locks; show creator | 7 |
| H41 | `/locks` | POST | Create lock | same | 🟡 | 3/3 | `end_date ≥ start_date` validation; the confirm copy claims pending requests get auto-rejected, which is undocumented ❓ | 7 |
| H42 | `/locks/:id` | DELETE | Unlock | same | 🟡 | n/a | Warn when lock belongs to an approved payroll run | 7 |
| H43 | `/records/recompute-stale` | POST | Maintenance sweep | Lock page button | 🟡 | 0/1 | Optional `date`; loading; show result count; "started" toast before await is misleading | 7 |
| H44 | `/reports/daily` | GET | Daily export report | `AttendanceReportsPage` | 🟡 | Query ❓ | CSV has no quoting/escaping; field names (`early_leave_minutes`, `is_anomaly`) ❓; pagination ❓ | 7 |
| H45 | `/reports/monthly` | GET | Monthly report | same | ❓ | Query ❓ | Sends `month=YYYY-MM` (all other monthly APIs use integer `month`+`year`); KPIs aggregated client-side | 7 |
| H46 | `/reports/employee/:userId` | GET | Employee range report | `AttendanceReportsPage`, `ReportsTab` | ❓ | Query ❓ | Sends `start_date`/`end_date` (vs `from`/`to`); the two consumers read different fields (`clock_in_time` vs `clock_in`); `ReportsTab` recomputes totals client-side | 7 |
| H47 | `/hrs/attendance` | GET | HR staff list | `AttendanceDirectory` "HR" tab | 🟡 | Query ❓ | Pagination key `total_pages` vs documented `totalPages` elsewhere ❓ | 7 |
| H48 | `/hrs/:userId/attendance` | GET | HR member history | — | ⛔ | — | Add service fn; use in profile tabs when role is `hr` (today they call `/employees/:id/attendance`) | 7 |
| H49 | `/hrs/:userId/summary` | GET | HR member summary | — | ⛔ | — | Add service fn; use in `OverviewTab` for `hr` role | 7 |
| H50 | `/hrs/:userId/daily-log` | GET | HR member daily log | `AttendanceTab.DailyLogModal` | 🟡 | 1/1 | Reachable, but its parent list uses the wrong route for HR users | 7 |
| H51 | `/employees/attendance` | GET | Org employee list | `AttendanceDirectory`, `HRDashboard` | 🟡 | Query ❓ | Search/department filters; pagination key ❓; live-hours ticker ignores breaks | 7 |
| H52 | `/employees/:userId/attendance` | GET | Employee history | `AttendanceTab`, `OverviewTab` | 🟡 | Query ❓ (`month`/`year`) | Confirm params; also used incorrectly for `hr` users | 7 |
| H53 | `/employees/:userId/summary` | GET | Employee summary | `OverviewTab` | 🟡 | Query 2/2 | Also used for HR users | 7 |
| H54 | `/employees/:userId/daily-log` | GET | Employee daily log | `AttendanceTab.DailyLogModal` | 🟡 | 1/1 | Live hours = gross elapsed (no breaks) contradicts backend `effective_hours` | 7 |
| H55 | `/managers/attendance` | GET | Org manager list | `AttendanceDirectory` | 🟡 | Query ❓ | As H51 | 7 |
| H56 | `/managers/:userId/attendance` | GET | Manager history | `AttendanceTab`, `OverviewTab` | 🟡 | Query ❓ | As H52 | 7 |
| H57 | `/managers/:userId/summary` | GET | Manager summary | `OverviewTab` | 🟡 | 2/2 | — | 7 |
| H58 | `/managers/:userId/daily-log` | GET | Manager daily log | `AttendanceTab` | 🟡 | 1/1 | As H54 | 7 |
| H59 | `/dashboard/live` | GET | Live counts | `HRDashboard` | 🟡 | n/a | No refresh/poll; keys ❓ | 9 |
| H60 | `/dashboard/graph-data` | GET | Org trend | `HRDashboard` | 🟡 | 2/2 | Padding creates fake future dates | 9 |
| H61 | `/dashboard/department-summary` | GET | By department | `HRDashboard` | 🟡 | 0/1 | Date selector; percentages recomputed client-side | 9 |
| H62 | `/dashboard/top-defaulters` | GET | Defaulters | `HRDashboard` (fetch only) | 👁 | 2/2 | **Widget never rendered**; `defaulterTab` state unused | 9 |
| H63 | `/dashboard/work-mode-distribution` | GET | Work-mode split | `HRDashboard` (fetch only) | 👁 | 0/1 | **Widget never rendered**; sends ISO timestamp instead of date | 9 |

### 2.4 Device Webhook

| # | Endpoint | Method | Purpose | Frontend consumer | Status | Missing work | Phase |
|---|---|---|---|---|---|---|---|
| W1 | `/api/v1/attendance/devices/webhook` | POST | Hardware punch ingestion (device Bearer key, ±60 s idempotency, lock check, async record build) | None (correct) | 🔌 | **Prerequisites are broken**: no API key display (H26), wrong mapping payload (H30), device page hidden, `device_id` not shown for firmware config. Add an "Integration instructions" panel (endpoint URL, header, body schema, punch types, NTP/backoff guidance, "punches appear after background processing"). | 8 |

### 2.5 Frontend calls with **no documented backend contract**

| Service fn | Endpoint called | Used by | Risk | Classification |
|---|---|---|---|---|
| `getOrgRegularizations` | `GET /attendance/hr/regularizations` | `AttendanceRegularizationsHRPage` (live sidebar item) | Page may 404; reads `check_in_time`/`check_out_time`, which differ from `requested_clock_in/out` | ❓ Backend Clarification Required |
| `approveRegularization` | `POST /attendance/hr/regularizations/:id/approve` | same (no confirm, no remarks) | HR can already approve via `/manager/regularizations/*` (role allows hr) | ❓ |
| `rejectRegularization` | `POST /attendance/hr/regularizations/:id/reject` body `{reason}` | same | Every other reject uses `remarks` | ❓ |
| `updateAssignment` | `PUT /attendance/hr/shifts/assignments/:id` | Roster "Edit" menu | Doc only has assign / end / delete. A historical assignment may be rewritten | ❓ — hide the Edit action until confirmed |
| `getLocations/createLocation/updateLocation` | Organization module | Locations page | Out of attendance scope (delegation is fine) | n/a |

---

## 3. Current Frontend Audit

### 3.1 Architecture as-built
- **Stack:** React 18 + plain JS (no TypeScript), React Router 7, Tailwind, Recharts. **No React Query, Redux or context for attendance.** Each screen owns `useState` + `useEffect` fetches and re-fetches manually after mutations. "Cache invalidation" therefore means "which fetch functions are re-run", and nothing is shared across screens.
- **Service layer:** a single object `attendanceAPI` in [attendance.api.js](src/shared/api/attendance.api.js) (98 fns). Query strings are built inconsistently: some use `URLSearchParams(params)` (which serializes `undefined`/`""` as literal values, e.g. `status=` in [AttendanceRegularizationsHRPage.jsx:96](src/roles/hr/attendance/screens/AttendanceRegularizationsHRPage.jsx#L96)); others use template strings that drop params unless *both* `month && year` are set.
- **Errors:** `client.js` attaches `error.status` and `error.data` (including `errorCode`). Attendance screens never switch on `errorCode` (single exception: `OVERLAPPING_LOCK` on the lock page). Leave and Payroll already have `leaveErrors.js` / `payrollErrors.js`; attendance has no equivalent.
- **Dialogs:** `GlobalAlertProvider` overrides `window.alert`/`window.confirm` (confirm is async; callers correctly `await` it). Mutations are signalled through a mix of `alert()`, per-page `Toast` copies (6 duplicates) and inline errors.
- **Duplicated logic:** `LiveEffectiveHours` is copied in 3 files (`AttendanceDirectory`, `AttendanceTab`, `OverviewTab`) and computes **gross elapsed time ignoring breaks**. Status badge maps are duplicated with inconsistent keys (`half-day` vs `half_day`, `completed`, `late`, `weekly-off`). `DICTIONARY.STATUS_CONFIG` is the correct underscore map but is used only in HR screens.
- **Role navigation:** the sidebar attendance section renders only for `role === "employee"`. **HR** has no own punch or self-service pages. **Manager** has punch on the dashboard but no nav to own history/regularizations/anomalies/OT/comp-offs (a manager route exists only for regularizations, [AppRoutes.jsx:236](src/routes/AppRoutes.jsx#L236), and has no nav link).

### 3.2 Feature-by-feature
| Feature | Page / component | Service fns | Forms / dialogs | Current payload | Response handling | Refresh after mutation | Actual connected workflow |
|---|---|---|---|---|---|---|---|
| Punch card | `AttendanceCard` in `EmployeeDashboard`, `ManagerDashboard` | clockIn, clockOut, breakStart, breakEnd, getToday, getMyShift | Buttons, no confirm | `{source:"web", latitude?, longitude?}`; breaks: no body | Only `res.success` checked; response data discarded | `fetchStatus()` (today only) | Happy path works. Errors, location denial and holiday states are invisible. |
| My Attendance | `EmployeeAttendancePage` | getSummary, getHistory, getWeeklyCalendar, getTrends, getDailyLog | DailyLogModal | history `{month, year}` (ignored by backend) | history `data.records`; daily log treated as array | Month change refetches all | History does not follow the month; daily log likely breaks |
| Regularization | `AttendanceRegularizationsPage` → `RegularizationCard` | submitRegularization, getMyRegularizations, cancelRegularization | Submit modal; confirm on cancel | `{date, reason, requested_clock_in?, requested_clock_out?}` (local→ISO) | list reads wrong keys | List refetch | Submit/cancel work; list can't show times; errors generic |
| My anomalies / OT / comp-offs | `AttendanceAnomaliesPage`, `EmployeeOvertimePage`, `EmployeeCompOffsPage` | getMyAnomalies, getMyOvertime, getMyCompOffs, getMyCompOffSummary | Status select (anomalies) | wrong status enum; no page/limit | Guessing shapes (`data.data \|\| data.anomalies \|\| data`) | n/a | Read-only views with field mismatches |
| Manager approvals | `ManagerRegularizationsPage`, `ManagerOvertimePage`, `ManagerAnomaliesPage` (`ActionModal`), `ManagerCompOffsPage` (inline), `ManagerApprovalsInbox` (tabs incl. leave) | pending/approve/reject/resolve | `ActionModal` (remarks optional, never reset), inbox modal (reject requires remarks) | `{remarks}`; inbox reject adds `rejection_reason` | `success` → refetch list | List only; sidebar badge cache (module-level, time-based) not invalidated | Two parallel UIs with different validation for the same actions |
| Manager team | `ManagerTeamPage`, `ManagerTeamHistoryPage`, `ManagerDashboard`, `ManagerTeamRosterPage` | team today/history/summary/graph, member history/summary | Roster attendance modal (month picker) | history `{start_date,end_date}`; member `{month,year}`; summary ISO datetime | Names from `user.profile` | n/a | Scoped endpoints ✓ (no client-side filtering ✓); display fields mismatched |
| Policies | `AttendancePoliciesPage` | get/create/update/deactivate | `PolicyModal` with conditional OT/regularization inputs | 10 keys incl. undocumented `late_threshold_minutes`, `is_default` | Refetch | List | Works for supported fields |
| Shifts & rotations | `AttendanceShiftsPage` | shifts CRUD, rotations C/L/D | `ShiftModal` (type-adaptive), `RotationModal` | see §5 | Refetch | List | Shift ↔ policy link missing |
| Assignments | `AttendanceRosterPage` | assign, list, update(undocumented), end, delete | Assign (searchable employee picker ✓), End, Delete (distinct, with warning ✓) | `{user_id, effective_from(ISO), shift_id \| rotation_pattern_id}` | Names from `user.profile` ✓ + emp code ✓ | List | Good UX; date type and undocumented edit are the issues |
| Holidays | `AttendanceHolidaysPage` | holidays CRUD | `HolidayModal` with MultiSelect targeting ✓; India preset importer | full targeting payload | Refetch | List | Most complete HR form; contract ambiguities remain |
| Weekly offs | `AttendanceWeeklyOffsPage` | weekly-offs CRUD | `WeeklyOffModal`, weekday chips ✓ | full targeting payload + priority/effective_from | Refetch | List | Works; validation gap |
| Locations | `AttendanceLocationsPage` | org locations | Map picker + radius slider | lat/lng/radius/timezone | — | — | Geofence source ✓ (org module) |
| Comp-offs (HR) | `AttendanceCompOffsPage` | getCompOffs, approve, reject | Inline remarks, bulk approve | status tab; `{remarks}` on reject | Refetch | List | Wrong status tabs |
| Comp-off policies | `AttendanceCompOffPoliciesPage` | CRUD | Modal | wrong field names | Refetch | List | Non-functional vs contract |
| Locks & maintenance | `AttendanceLockPeriodsPage` | locks C/L/D, recomputeStale | Inline form + confirm modal ✓ | `{start_date,end_date,reason}` | Refetch | List | Works; copy/validation gaps |
| Devices | `BiometricDevicesPage` (route only, nav commented) | devices CRUD, mappings C/L/D | Device modal, mappings modal | wrong mapping keys; forced `status:"active"` | Key discarded | List | Non-functional for webhook onboarding |
| Reports | `AttendanceReportsPage`, `ReportsTab` | daily/monthly/employee | Date/month/employee pickers, CSV export | params ❓ | Client KPIs | n/a | Renders if params happen to match |
| HR read views | `AttendanceDirectory` (HRDashboard + `/attendance/directory`), `EmployeeProfilePage` → `OverviewTab`, `AttendanceTab`, `ReportsTab` | employees/managers/hrs lists, detail, summary, daily log | Daily log drilldown ✓ | `{page, limit:10, date}` | pagination `total_pages` | n/a | Good structure; HR-role routing gap |
| HR dashboard | `HRDashboard` | live, graph, dept, defaulters, work-mode | — | — | 2 of 5 datasets unused | none | Partial |

---

## 5. Backend Field → Frontend Field Coverage Matrix (every mutation)

Classification vocabulary as requested: User Input · Automatically Derived · Context Derived · Fixed Intentional Default · Optional and Intentionally Omitted · UI Missing · Captured but Not Sent · Sent Incorrectly · Incorrect Data Type · Incorrect Enum Mapping · Hardcoded Incorrectly · Backend Clarification Required.

### 5.1 `POST /clock-in`
| Backend field | Req? | Type / enum | Backend purpose | Frontend control / source | Sent? | Current value | Classification | Action |
|---|---|---|---|---|---|---|---|---|
| `source` | Opt (default `web`) | `web\|mobile\|api` | Punch origin | Hardcoded | ✓ | `"web"` | Fixed Intentional Default ✓ | none |
| `latitude` | Opt ("critical for geofencing") | number −90..90 | Geofence | `navigator.geolocation`, 5 s timeout | only on success | omitted on any failure, silently | Automatically Derived — **failure states UI Missing** | Resolve location before the POST with loading; explicit denied/unsupported/timeout messages + Retry; let the user proceed without location only after an explicit acknowledgement; never send 0,0 ✓ (not done today ✓) |
| `longitude` | Opt | −180..180 | Geofence | same | same | same | same | same |
| `client_timestamp` | Opt | ISO | Device clock audit | — | ✗ | — | UI Missing (should be Automatically Derived) | `new Date().toISOString()` at tap time |
| `notes` | Opt | ≤500 | Context | — | ✗ | — | UI Missing | Optional collapsible textarea with counter |
| `work_mode` | Opt | `office\|remote\|field\|hybrid` | Work-mode analytics (H63) | — | ✗ | — | UI Missing — **Backend Clarification**: derive from the employee profile `work_mode` (present in org roster data) or ask each punch? | Default to the profile work mode, allow override (hybrid users) |
| `metadata` | Opt (in example) | object | Extensibility | — | ✗ | — | Optional and Intentionally Omitted | Optionally `{user_agent, geo_accuracy}` |

### 5.2 `POST /clock-out`
| Field | Req? | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|
| `source` | Opt | `"web"` | ✓ | Fixed Intentional Default | — |
| `latitude`/`longitude` | Opt | geolocation, silent failure | partial | Auto-derived, failure UI Missing | as 5.1 |
| `notes` | Opt | — | ✗ | UI Missing | as 5.1 |
| `client_timestamp`, `work_mode` | ❓ doc says body is "same as clock in" but lists only 4 fields | — | ✗ | Backend Clarification Required | confirm |

### 5.3 `POST /break/start`, `POST /break/end`
No documented body. Frontend sends none ✓ (Fixed). Nothing missing.

### 5.4 `POST /regularization`
| Field | Req? | Type / validation | Frontend control | Sent? | Correct? | Classification | Action |
|---|---|---|---|---|---|---|---|
| `date` | Req | ISO date, **must be past** | `<input type=date>` | ✓ `YYYY-MM-DD` | type ✓; no `max` | User Input — Validation Missing | `max = yesterday (local)`; also block dates outside policy `regularization_window_days` if exposed via `/shift` |
| `requested_clock_in` | ≥1 of in/out | ISO datetime | `<input type=time>` + date → `new Date("YYYY-MM-DDTHH:mm:00").toISOString()` | ✓ when set | ✓ local→UTC is correct | User Input | — |
| `requested_clock_out` | ≥1 of in/out | ISO datetime | same | ✓ | ✗ for overnight/night shifts (always the same calendar date) | User Input — Incorrect for overnight | Add "next day" toggle when out < in; validate out > in |
| `reason` | Req | 5–1000 | textarea | ✓ | min ✓, max ✗ | User Input — Validation partial | `maxLength=1000` + counter |
| At-least-one rule | — | — | enforced ✓ | — | ✓ | ✓ | — |

### 5.5 `POST /regularizations/:id/cancel`
`id` path — Context Derived from row (`req._id || req.id`) ✓. Body none ✓.

### 5.6 Manager decisions
| API | Field | Req? | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|---|
| `POST /manager/anomalies/:id/resolve` | `id` | path | row id ✓ | ✓ | Context Derived | — |
| | `remarks` | doc example (req ❓) | `ActionModal` textarea (optional, not reset between rows) | ✓ | User Input — stale state bug | Reset on open; decide required |
| `POST /manager/regularizations/:id/approve` | `remarks` | example | ActionModal / inbox | ✓ | User Input | — |
| `POST /manager/regularizations/:id/reject` | `remarks` | example | ActionModal (optional) / inbox (required) | ✓ + inbox adds `rejection_reason` | **Sent Incorrectly** (extra unknown key) in inbox | Drop `rejection_reason`; make remarks required for reject in both UIs |
| `POST /manager/overtime/:id/approve\|reject` | `remarks` | example | same | ✓ (+ extra key on reject) | same | same |
| `POST /manager/comp-offs/:id/approve` | body undocumented | — | Page: none; Inbox: `{remarks}` | varies | Backend Clarification Required | Confirm, then unify |
| `POST /manager/comp-offs/:id/reject` | body undocumented | — | Page: `{remarks}` (may be `""`); Inbox: `{remarks, rejection_reason}` | varies | Backend Clarification Required | same |

### 5.7 `POST|PUT /hr/policies` (Attendance Policy)
| Backend field | Documented? | Type | Frontend control | Sent? | Current default | Classification | Action |
|---|---|---|---|---|---|---|---|
| `name` | ✓ | string | text (required) | ✓ | "" | User Input ✓ | — |
| `grace_minutes` | ✓ | int min | number | ✓ | 15 | User Input ✓ | — |
| `half_day_min_hours` | ✓ | decimal hours | number step .5 | ✓ | 4.5 | User Input ✓ | Validate < full day |
| `full_day_min_hours` | ✓ | decimal hours | number step .5 | ✓ | 8.5 | User Input ✓ | — |
| `max_break_duration_minutes` | ✓ | int | — | ✗ | — | **UI Missing** | Add (drives `excessive_break` anomaly) |
| `max_breaks_per_day` | referenced in clock doc | int | — | ✗ | — | **UI Missing** (confirm it is a policy field ❓) | Add |
| `regularization_allowed` | ✓ | bool | Toggle | ✓ | true | User Input ✓ | — |
| `regularization_window_days` | ✓ | int | number, hidden when disabled ✓ | ✓ (even when disabled) | 7 | User Input ✓ | Optionally omit/null when disabled |
| `overtime_enabled` | ✓ | bool | Toggle | ✓ | false | User Input ✓ | — |
| `overtime_min_minutes` | ✓ | int | number, hidden when disabled ✓ | ✓ | 60 (fallback 30 on parse fail) | User Input ✓ | Fix inconsistent fallback |
| `late_threshold_minutes` | ✗ | int | number | ✓ | 60 | Backend Clarification Required | Confirm or remove; helper text claims it causes a Half Day (unverified business rule) |
| `is_default` | ✗ | bool | Toggle | ✓ | false | Backend Clarification Required | Confirm (deactivate 400 handling implies it exists) |
| auto clock-out rules | named in doc purpose | ❓ | — | ✗ | — | Backend Clarification Required | Obtain field names |

### 5.8 `POST|PUT /hr/shifts` (Shift Template)
| Backend field | Documented? | Required? | Frontend control | Sent? | Correct control? | Classification | Action |
|---|---|---|---|---|---|---|---|
| `name` | implied | ✓ | text | ✓ | ✓ | User Input | — |
| shift type | ✓ (enum fixed/flexible/split/night/rotational) | ✓ | card picker (4; **rotational hidden**) | ✓ as `type` | partial | Backend Clarification (key `type` vs `shift_type` as returned by `GET /shift`); rotational: confirm it is created via Rotations (then hiding is correct) | confirm |
| `policy_id` | ✓ "Linked to a specific Policy" | ❓ | — | ✗ | — | **UI Missing (critical)** | Policy select (active policies, default preselected) |
| `start_time` / `end_time` | ✓ implied for fixed | for fixed/night/split | `<input type=time>` | ✓ | ✓ | User Input | Validate end > start unless night |
| flexible duration | ✓ ("duration-based") | flexible | `min_hours` number | ✓ | ❓ key | Backend Clarification Required | confirm key |
| `core_start_time`/`core_end_time` | ✗ | ❓ | time inputs (flexible) | ✓ | ❓ | Backend Clarification Required | confirm |
| `split_start_time_2`/`split_end_time_2` | ✗ | ❓ | time inputs (split) | ✓ | ❓ | Backend Clarification Required | confirm |
| `is_overnight` | ✗ | ❓ | derived when type = night | ✓ | ❓ | Automatically Derived / Clarification | confirm; also derive for fixed shifts crossing midnight |
| `buffer_minutes_before/after` | ✗ | ❓ | numbers ("early/late entry") | ✓ | ❓ | Backend Clarification Required; overlaps policy `grace_minutes` semantics | confirm |
| work days | not documented for shifts (weekly-offs own this) | — | — | ✗ | — | Optional and Intentionally Omitted (weekly-off rules cover it) | — |
| break config | not documented | — | — | ✗ | — | n/a (policy owns) | — |

### 5.9 `POST /hr/rotations`
| Field | Documented? | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|
| `name` | implied | text | ✓ | User Input | — |
| `rotation_cycle_days` | ✓ | number | ✓ int | User Input — Validation Missing | Must equal Σ `duration_days` (or be derived from it) |
| `start_reference_date` | ✗ | date → `new Date(d).toISOString()` (UTC midnight) | ✓ | Backend Clarification (date vs datetime) | send `YYYY-MM-DD` if DATEONLY |
| `entries[].shift_id` | ✗ (concept ✓) | select (name + type) ✓ | ✓ | User Input | — |
| `entries[].sequence_order` | ✗ | auto-renumbered ✓ | ✓ | Automatically Derived | — |
| `entries[].duration_days` | ✗ | number | ✓ | User Input | — |
| off-day phase | ✓ doc example "2 days Off" | — | ✗ | **UI Missing** / Clarification (null shift_id? `is_off`?) | confirm schema, add "Off" option |

### 5.10 `POST /hr/shifts/assign` and `/assignments/:id/end`
| API | Field | Req? | Type | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|---|---|
| assign | `user_id` | ✓ | uuid | searchable picker (name + email) ✓ | ✓ | Context Derived from selection ✓ | add employee code to rows |
| assign | `shift_id` | ✓ (for shift) | uuid | select of active shifts (name + times) ✓ | ✓ | User Input ✓ | — |
| assign | `effective_from` | ✓ | `YYYY-MM-DD` (doc example) | date input → ISO datetime | ✓ | **Incorrect Data Type** | send the date string |
| assign | `rotation_pattern_id` | registry says "shift or rotation" | uuid | select | ✓ | Backend Clarification Required | confirm key/mutual exclusivity |
| end | `effective_to` | ✓ (doc) | ❓ | date input (`min` = effective_from) → ISO datetime | ✓ | Backend Clarification Required / likely Incorrect Data Type | confirm; hide End for already-ended rows |
| update (undocumented PUT) | all | — | — | reuse assign modal | ✓ | Backend Clarification Required | hide until documented |

### 5.11 `POST|PUT /hr/holidays`
| Field | Documented? | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|
| `name` | ✓ implied | text | ✓ | User Input | — |
| `date` | ✓ implied | date → `YYYY-MM-DDT00:00:00Z` ISO | ✓ | Backend Clarification (date vs datetime) | prefer `YYYY-MM-DD` |
| `target_departments` | ✓ | MultiSelect (names → ids) ✓ | ✓ | User Input ✓ | — |
| `target_locations` | ✓ | MultiSelect ✓ | ✓ | User Input ✓ | — |
| `target_employment_types` | ✓ | MultiSelect with **hardcoded** "Full-time/Part-time/Contract" | ✓ | Hardcoded — Clarification on enum values | source from org module / backend enum |
| `included_users` | ✓ | MultiSelect (name + code) ✓ | ✓ | User Input ✓ | — |
| `excluded_users` | ✓ | MultiSelect ✓ | ✓ | User Input ✓ | — |
| `type` (`public/optional/restricted`) | ✗ (user API returns `is_optional`) | 3-button picker | ✓ | Backend Clarification Required | confirm enum ↔ `is_optional` |
| `target_job_statuses` | ✗ | MultiSelect hardcoded | ✓ | Backend Clarification Required | confirm |

### 5.12 `POST|PUT /hr/weekly-offs`
| Field | Documented? | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|
| `days_of_week` | ✓ int[] | weekday chips, labels ✓, values 0=Sun…6=Sat | ✓ | User Input — Clarification (doc text "[0, 6] for Saturday and Sunday" is ambiguous about 0) | confirm convention |
| department scope (`target_departments`) | ✓ concept | MultiSelect ✓ | ✓ | User Input ✓ (key name ❓) | — |
| shift scope (`target_shifts`) | ✓ concept | MultiSelect ✓ | ✓ | User Input ✓ (key ❓) | — |
| employment type scope | ✓ concept | MultiSelect hardcoded | ✓ | Hardcoded / Clarification | as 5.11 |
| `name` | ✗ | text (required) | ✓ | Clarification | — |
| `priority` | ✗ | number (required) | ✓ | Clarification (precedence semantics) | explain in UI once confirmed |
| `effective_from` | ✗ | date (asterisk) | ✓ possibly `""` | Validation Missing / Clarification | require or omit when empty |
| `target_locations`, `target_job_statuses`, `included_users` | ✗ | MultiSelects | ✓ | Clarification | — |
| `excluded_users` | ✗ | **no control** (state only) | ✓ `[]` | Captured but Not Editable | add control once confirmed |

### 5.13 Devices & mappings
| API | Backend field | Documented? | Frontend | Sent? | Classification | Action |
|---|---|---|---|---|---|---|
| `POST /hr/devices` | name | implied | text | ✓ | User Input | — |
| | `ip_address` | ✗ | text | ✓ | Clarification | — |
| | location | ✗ (free text vs `location_id`?) | text | ✓ | Clarification — should likely be an org location select | — |
| | `status` | ✗ | hardcoded `"active"` | ✓ | Hardcoded Incorrectly (on update) | Status/active toggle on edit |
| | **response `api_key_plain`** | ✓ one-time | — | n/a | **Response Handling Incorrect (critical)** | One-time secret dialog: masked + reveal, copy button, "store it now, it cannot be retrieved" acknowledgement checkbox, no `console.log`, clear from state on close |
| | response `id` (= webhook `device_id`) | ✓ | not shown | n/a | UI Missing | show + copy |
| `POST /hr/devices/:id/mappings` | `user_id` | ✓ | text "System Employee UUID" sent as `employee_id` | ✓ wrong key | **Sent Incorrectly + raw UUID input** | Employee picker (name/code) → `user_id` |
| | `device_employee_id` | ✓ | text sent as `biometric_id` | ✓ wrong key | **Sent Incorrectly** | rename |

### 5.14 `POST|PUT /hr/comp-off-policies`
| Backend field | Frontend sends | Classification | Action |
|---|---|---|---|
| `name` (implied) | `name` ✓ | User Input | — |
| `min_hours_for_half_day` | — (sends `min_hours_required`) | **Sent Incorrectly / UI Missing** | number (hours) |
| `min_hours_for_full_day` | — | **UI Missing** | number, ≥ half-day |
| `multiplier` | — | **UI Missing** | number (e.g. 1, 1.5, 2) |
| `validity_days` | — (sends `expiry_days`) | **Sent Incorrectly** | number |
| `requires_approval` | — | **UI Missing** | toggle (explain: when off, earned comp-offs auto-credit ❓) |
| `is_active`, `description` | sent | Backend Clarification Required | confirm or drop |

### 5.15 HR comp-off overrides, locks, maintenance
| API | Field | Documented? | Frontend | Classification | Action |
|---|---|---|---|---|---|
| `POST /hr/comp-offs/:id/approve` | body | ✗ | none | Clarification | add remarks if accepted |
| `POST /hr/comp-offs/:id/reject` | body | ✗ | `{remarks}` (may be empty) | Clarification | require remarks |
| `POST /hr/locks` | `start_date` | ✓ | date input | User Input ✓ | validate ≤ end |
| | `end_date` | ✓ | date input | User Input ✓ | — |
| | `reason` | ✓ (payroll D-3 signature) | text | User Input ✓ | — |
| `POST /hr/records/recompute-stale` | `date` | ✓ optional `YYYY-MM-DD` | service accepts no args | **UI Missing** | optional date picker (default all) |

---

## 6. Form Completeness Report

"Backend capabilities" counts documented, meaningful fields/behaviours. Legitimately auto-derived context (path ids) is not counted as missing. Undocumented fields the UI sends are listed separately and excluded from the %.

| Form | Backend capabilities (documented) | Supported correctly by UI | Missing / wrong | Auto-derived | Intentionally omitted | Undocumented extras sent | Coverage % |
|---|---|---|---|---|---|---|---|
| Clock In | source, latitude, longitude, client_timestamp, notes, work_mode | 3 (source, lat, lng) | client_timestamp, notes, work_mode; geolocation failure UX | source, lat/lng | metadata | — | **50%** |
| Clock Out | source, latitude, longitude, notes | 3 | notes; failure UX | source, lat/lng | — | — | **75%** |
| Regularization (submit) | date, requested_clock_in, requested_clock_out, reason (+ past-date, ≥1 time, 5–1000 rules) | 4 fields; 2/5 rules | past-date max, reason max, overnight out | — | — | — | **100% fields · 40% validation** |
| Resolve Anomaly | remarks | 1 | stale remarks bug | id | — | — | **100%** |
| Approve/Reject Regularization (×2) | remarks | 2 | inbox extra key | id | — | `rejection_reason` | **100%** |
| Approve/Reject Overtime (×2) | remarks | 2 | inbox extra key | id | — | `rejection_reason` | **100%** |
| Approve/Reject Comp-Off (mgr, HR) | ❓ undocumented | — | — | id | — | `remarks` | **n/a — Clarification** |
| Attendance Policy (create/edit) | name, grace, half-day h, full-day h, max break mins, max breaks/day, reg allowed, reg window, OT enabled, OT min mins | 8 | max_break_duration_minutes, max_breaks_per_day | — | — | late_threshold_minutes, is_default | **80%** |
| Shift Template (create/edit) | name, type, policy_id, start_time, end_time, flexible duration | 4 (name, start, end, duration) | **policy_id**; type partially (rotational excluded, key ❓) | is_overnight (night) | work days (weekly-offs) | core_*, split_*_2, buffer_*, is_overnight | **67%** |
| Rotation Pattern | name, rotation_cycle_days, shift phases, off-day phases | 3 | off-days; cycle = Σ duration validation | sequence_order | — | start_reference_date | **75%** |
| Assign Shift | user_id, shift_id, effective_from | 2 | effective_from type | — | — | rotation_pattern_id (registry-implied) | **67%** |
| End Assignment | effective_to | 1 (type ❓) | — | id | — | — | **100% (❓ type)** |
| Holiday (create/edit) | name, date, target_departments, target_locations, target_employment_types, included_users, excluded_users | 7 | employment-type values hardcoded; date type ❓ | — | — | type, target_job_statuses | **100% (❓)** |
| Weekly-Off Rule | days_of_week, department scope, shift scope, employment-type scope | 4 | effective_from validation; excluded_users control | — | — | name, priority, effective_from, locations, job statuses, include/exclude | **100% (❓)** |
| Device Registration | request ❓; response api_key_plain + id | 0 of 1 response capability | **one-time key display**, device id | — | — | ip_address, location, status | **0% (critical)** |
| Device Mapping | user_id, device_employee_id | 0 | both keys wrong; UUID text box | device id (path) | — | employee_id, biometric_id | **0%** |
| Comp-Off Policy | name, min_hours_for_half_day, min_hours_for_full_day, multiplier, validity_days, requires_approval | 1 | 5 fields | — | — | min_hours_required, expiry_days, is_active, description | **17%** |
| Comp-Off Request (employee) | **No documented create endpoint.** Leave Phase-4 docs: comp-offs are system-generated at clock-out | No form exists ✓ | — | — | — | — | **n/a — correct absence** (see §8 C12) |
| Overtime Request (employee) | **No documented create endpoint** | No form exists ✓ | — | — | — | — | **n/a — correct absence** (see §8 C13) |
| Payroll Lock | start_date, end_date, reason | 3 | start ≤ end validation | — | — | — | **100%** |
| Recompute Stale | date (optional) | 0 | date | — | — | — | **0%** |
| **Total** | **67** | **48** | | | | | **72%** |

### Missing Form Capabilities (must appear in the plan)
1. Clock In: `work_mode`, `notes`, `client_timestamp`, geolocation state machine → Phase 4
2. Clock Out: `notes`, geolocation UX, result summary → Phase 4
3. Regularization: past-date limit, reason ≤1000, overnight clock-out, out > in → Phase 5
4. Attendance Policy: `max_break_duration_minutes`, `max_breaks_per_day`, half ≤ full validation → Phase 2
5. Shift Template: `policy_id` selector, rotational type decision, per-type validation → Phase 2
6. Rotation: off-day phases, Σ duration = cycle validation, phase display → Phase 2
7. Assign Shift: `effective_from` as date; hide undocumented Edit → Phase 2
8. Holiday / Weekly-off: employment-type source, weekly-off `effective_from` validation, `excluded_users` control → Phase 3
9. Device: one-time API key dialog, device id display, active toggle → Phase 8
10. Device Mapping: `user_id` picker + `device_employee_id` → Phase 8
11. Comp-Off Policy: the 5 documented fields → Phase 7
12. Payroll Lock: date-range validation → Phase 7
13. Recompute Stale: optional date + result feedback → Phase 7
14. Approval dialogs: unified remarks rules, removal of `rejection_reason`, comp-off body per clarification → Phase 6

---

## 7. Missing / Incorrect Integrations (categorized)

| Category | Findings |
|---|---|
| **API completely missing** | H48 `GET /hr/hrs/:userId/attendance`, H49 `GET /hr/hrs/:userId/summary` |
| **UI missing** | U13 active shift never rendered · H62 top defaulters · H63 work-mode distribution · HR role has no punch/self-service UI · Manager has no nav to own attendance pages · Device page removed from sidebar · Device `id` for firmware not shown |
| **Form incomplete** | Policy (H1/H4), Shift (H10/H13), Rotation (H15) — see §6 |
| **Backend field missing from UI** | `policy_id`; `max_break_duration_minutes`; `max_breaks_per_day`; `work_mode`; `notes`; `client_timestamp`; comp-off policy ×5; recompute `date`; rotation off-days |
| **Field captured but not sent / not editable** | Weekly-off `excluded_users` (state, no control); `shiftData` fetched, not displayed; dashboard `defaultersData`, `workModeData` fetched, not displayed |
| **Wrong payload field** | Mapping `employee_id`/`biometric_id`; comp-off policy `min_hours_required`/`expiry_days`; inbox `rejection_reason`; HR regularization reject `{reason}` |
| **Hardcoded value hiding capability** | Device update `status:"active"`; employment types & job statuses lists; `getTrends(6)`; clock-in `source` (OK); comp-off approve toast "90 days"; progress ring 75%; "Better than 91.3%"; "Good Afternoon" |
| **Wrong enum** | My Anomalies `pending/ignored` (→ `open/resolved/all`); HR comp-offs `rejected/consumed` (→ `used/cancelled`); status keys `half-day`/`weekly-off`/`completed` (→ `half_day`/`weekly_off`/`present`); employee comp-off badges |
| **Wrong request method / undocumented endpoint** | `PUT /hr/shifts/assignments/:id`; `GET/POST /hr/regularizations*` |
| **Incorrect query parameters** | U11 history `month/year` (→ `from/to/page/limit`); M15 member history `month/year`; M14 team summary ISO datetime (→ `YYYY-MM-DD`); H63 work-mode ISO datetime; M2 team history `start_date/end_date` ❓; H45 monthly report `month=YYYY-MM` ❓; H46 `start_date/end_date` ❓; `URLSearchParams` serializing empty `status=` |
| **Filters missing** | Regularizations status (U7); comp-offs/mine status (U14); weekly calendar date (U19); holidays year (U20); department-summary date (H61); assignments list filters (H7); HR directory search/department (❓ params) |
| **Pagination missing** | U7, U9, U10, U11, U14, M2, M15, H7, H37, H44 (❓). Correct: `AttendanceDirectory` and `AttendanceTab` (but read `total_pages` ❓ vs `totalPages`) |
| **Incorrect response handling** | U7 wrong keys; U9 `hours`; U15 `total_used`; U16 `log.map` on object; M1/M3/M5/M8 name resolution; inbox `anomaly_type`; H26 key discarded; H31 mapping keys; H34 policy keys; H46 two consumers disagree (`clock_in_time` vs `clock_in`); clock-in/out result discarded |
| **Incorrect role handling** | Profile tabs route HR users to `/hr/employees/:id/*` instead of `/hr/hrs/:id/*`; HR self-service absent; manager own-attendance nav absent |
| **Hierarchy issue** | None in fetch strategy (manager screens use scoped endpoints ✓, no client filtering ✓). Display: names missing. Out-of-scope IDs: manager UI only uses IDs returned by scoped lists ✓; `HIERARCHY_VIOLATION` not messaged |
| **State / refresh issue** | See §7.4 |
| **Date/time issue** | See §7.5 |
| **Cross-module refresh** | Comp-off approval → Leave balance (no in-app notice); payroll-created locks deletable without warning; sidebar inbox badge stale after approvals |
| **Security / privacy** | One-time device secret never shown, so HR may re-register devices repeatedly and leak keys in retries; raw UUID entry for mappings; `console.log` of today payload ([ManagerDashboard.jsx:149](src/roles/manager/screens/ManagerDashboard.jsx#L149)); undocumented HR approval endpoints bypass the documented hierarchy path |
| **Fabricated / misleading UI** | "Better than 91.3% employees", static donut, dead "Show all" select, dashboard date navigator that doesn't change data, "Online" for activation status, lock copy claiming auto-rejection |

### 7.1 Role / Permission Matrix

| Feature | Action | Employee | Manager | HR | Admin | Super Admin | Flag | Backend authz | Frontend behaviour today |
|---|---|---|---|---|---|---|---|---|---|
| Clock In/Out, Break | punch | ✓ | ✓ | ✓ | ✓ | ✓ | attendance.access | all org roles | Employee dashboard ✓, Manager dashboard ✓, **HR ✗**, Admin/Super-admin land on HR workspace ✗ |
| Regularization | submit/list/cancel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | all | Employee nav ✓; Manager route exists, no nav; HR ✗ |
| Own history / summary / analytics | read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | all | Employee ✓; Manager/HR ✗ |
| Own anomalies / OT / comp-offs | read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | all | Employee ✓; Manager/HR ✗ |
| Team reads | read | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | manager+ (hierarchy) | Manager ✓; HR not offered (fine) |
| Approvals (reg/OT/CO/anomaly) | decide | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | manager+ (hierarchy) | Manager ✓ ×2 UIs; HR uses undocumented HR routes |
| HR staff attendance `/hrs/*` | read | ✗ | ✓ (registry) | ✓ | ✓ | ✓ | ✓ | hr, manager | HR tab ✓; manager ✗ (clarify intent) |
| Policies / Shifts / Rotations / Assignments | configure | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | hr, admin | HR workspace ✓ (workspace gate ✓) |
| Holidays / Weekly-offs | configure | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | hr, admin | ✓ |
| Devices & mappings | configure | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | hr, admin | Route ✓, nav hidden |
| Comp-off policies / overrides | configure | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | hr, admin | ✓ |
| Payroll locks / recompute | configure | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | hr, admin | ✓ |
| Reports / HR dashboards | read | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | hr, admin | ✓ (2 widgets missing) |
| Feature disabled | any | — | — | — | — | — | off | 403 `FEATURE_NOT_AVAILABLE` | **No handling**; pages show empty tables |

### 7.2 Filter & Query Parameter Coverage

| API | Backend param | Frontend filter exists? | Sent correctly? | Default | Missing work |
|---|---|---|---|---|---|
| U11 history | from / to | month navigator (sends month/year) | ✗ | — | map month → first/last day |
| | page / limit | ✗ | ✗ | 1 / 20 | pagination |
| U12 summary | month / year | ✓ | ✓ | current | — |
| U7 regularizations | status | ✗ | ✗ | all | status tabs incl. cancelled |
| | page / limit | ✗ | ✗ | | pagination |
| U9 overtime/mine | page / limit | ✗ | ✗ | | pagination |
| U10 anomalies/mine | status | ✓ | ✗ enum | all | `open/resolved/all` |
| | page / limit | ✗ | ✗ | | pagination |
| U14 comp-offs/mine | status | ✗ | ✗ | | tabs |
| | page / limit | ✗ | ✗ | | pagination |
| U16 daily-log | date | row click | ✓ | today | — |
| U17 graph-data | month / year | current only | ✓ | | month navigator |
| U18 trends | months | hardcoded 6 | ✓ | 3 | selector (1–12) |
| U19 weekly-calendar | date | ✗ | ✗ | today | prev/next week |
| U20 holidays | year | ✗ | ✗ | current | year arg |
| M14 team summary | date | ✗ | ✗ format | today | `YYYY-MM-DD` + date picker |
| M15 member history | from / to / page / limit | month picker | ✗ | | map + paginate |
| M16 member summary | month / year | ✓ | ✓ | | — |
| M17 team graph | month / year | ✓ | ✓ | | — |
| H19 holidays | year | ✓ | ✓ | current | — |
| **Total documented params** | **33** | | **11 correct** | | **33%** |

### 7.3 Pagination Audit
| Endpoint | page | limit | total / totalPages rendered | next/prev | reset on filter change | empty page | Verdict |
|---|---|---|---|---|---|---|---|
| U7, U9, U10, U14 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Missing — first 20 only |
| U11 | ✗ | ✗ | ✗ | ✗ | ✗ | "No records for this month" (misleading) | Missing |
| M15 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Missing |
| H51/H55/H47 directory | ✓ | 10 | ✓ (`total_pages` ❓) | ✓ | ✓ on tab/date | ✓ | Implemented, key ❓ |
| H52/H56 AttendanceTab | ✓ | 20 | ✓ (`total_pages` ❓) | ✓ | ✓ on month | ✓ | Implemented, key ❓ |
| OverviewTab | page 1 | 31 | n/a | n/a | n/a | n/a | Acceptable (month fits) |

### 7.4 Cache / State Invalidation Matrix (actual architecture: per-screen manual refetch)
| Mutation | Data affected | Current refresh | Missing refresh |
|---|---|---|---|
| Clock In | today, graph-data, weekly calendar, daily log, manager team today | today | graph/summary cards on dashboard; manager's own team table does not matter |
| Clock Out | today, history, summary, graph, trends, weekly | today | dashboard stats (`fetchGraphData`), and the result banner |
| Break start/end | today, daily log | today | — |
| Regularization submit / cancel | my regularizations | list | none cross-screen |
| Manager approve regularization | pending list, inbox counts, employee history/summary/daily log | list | **sidebar inbox badge (module cache)**; roster modal if open |
| Approve / reject overtime | pending, badge, payroll | list | badge |
| Approve comp-off (mgr/HR) | pending, badge, employee comp-off list/summary, **Leave CO balance** | list | badge; Leave balances fetch on next mount (acceptable) + in-app notice |
| Resolve anomaly | team anomalies, badge, employee anomalies | list | badge |
| Create/update policy | policies, shift form policy options | list | shift modal options (fetch on open) |
| Create/update/delete shift | shifts, rotation options, assignment options, weekly-off shift scope | list | modals fetch on open ✓ |
| Assign / end / delete assignment | roster, employee `/shift`, future calculation | roster | none (other screens fetch on mount ✓) |
| Holiday / weekly-off CRUD | lists, employee weekly calendar/holidays | list | ✓ on mount |
| Device CRUD / mapping | devices, mappings | list | ✓ |
| Lock create/delete | locks, payroll readiness | list | payroll pre-flight on mount ✓ |
| Recompute stale | HR directory, reports | nothing | directory/report refetch or notice |
| Org hierarchy change (other module) | manager scope | on mount | ✓ (no persistent cache) |

**Recommendation:** do not introduce React Query only for attendance (no other module uses it). Add a tiny `attendanceEvents` emitter (`emit('attendance:changed', {kind})`) that the sidebar badge, dashboards and open lists subscribe to, matching the existing module-level cache in `DashboardSidebar`.

### 7.5 Date / Time Audit
| Area | Current code | Problem | Owner | Fix |
|---|---|---|---|---|
| "Today" defaults | `new Date().toISOString().split('T')[0]` in ManagerTeamHistory, Reports (×3), AssignModal, RotationModal, ReportsTab | UTC date; in IST between 00:00–05:29 this yields **yesterday** | Frontend | `toLocalYMD(date)` helper (already written ad hoc in `AttendanceDirectory.getApiDateString`) |
| Team summary / work-mode date | `new Date().toISOString()` | full timestamp + UTC date | Frontend | local `YYYY-MM-DD` |
| Displaying `YYYY-MM-DD` | `new Date(record.date)` then `.getDate()` / `toLocaleDateString` | parsed as UTC midnight → previous day in negative-offset zones | Frontend | parse DATEONLY as local (`new Date(y, m-1, d)`) |
| Holiday list | `new Date(h.date + "T00:00:00")` | Invalid Date if backend returns ISO timestamp | Frontend + ❓ | normalize `date.slice(0,10)` |
| Clock timestamps | server-generated; UI formats with `toLocaleTimeString` | browser TZ vs location TZ (locations carry `timezone`) | Backend computes; Browser displays | display in browser TZ, label TZ when location TZ differs |
| Regularization | `new Date("YYYY-MM-DDTHH:mm:00").toISOString()` | correct local→UTC; **cannot express overnight** | Frontend | next-day toggle |
| Assign `effective_from` / End `effective_to` / rotation start / holiday date | `new Date("YYYY-MM-DD").toISOString()` | datetime where a date is documented; round-tripping may shift | Frontend + ❓ | send `YYYY-MM-DD` |
| Night shifts | `is_overnight` only for type night | fixed shifts crossing midnight (22:00–06:00) not flagged | ❓ | derive when end < start |
| Month boundaries | month/year arithmetic ✓ | history not bound to month (params ignored) | Frontend | from/to |
| Weekly calendar | no date navigation | — | Frontend | week stepper |
| Live timer | `Date.now() - clock_in - break_duration_minutes` | `break_duration_minutes` isn't in `/today`; uses local clock skew | Frontend | sum `breaks[]` durations + active break; recompute from server values |

### 7.6 Error Handling Audit
Specific backend errors and how they surface today:

| Error | Source | Today | Required |
|---|---|---|---|
| `409 ALREADY_CLOCKED_IN` | U1 | console only | toast + refetch today |
| `403 DATE_LOCKED` | U1, U2, U6, M6, webhook | console / generic alert / generic "Action failed" | "This date is locked for payroll (dd MMM–dd MMM). Contact HR." |
| 400 not clocked in / already on break / no active break / max breaks | U3, U4 | console | specific toasts |
| 409 duplicate pending regularization | U6 | "Failed to submit request." | specific message |
| 403 cancel not owner / already processed | U8 | `err.message` ✓ | keep, via mapper |
| `403 HIERARCHY_VIOLATION` | M4–M13 | "Action failed to execute" | "This employee is outside your reporting line." + refetch |
| `404 MAPPING_NOT_FOUND`, `401 UNAUTHORIZED_DEVICE` | W1 | n/a (hardware) | document in the device integration panel |
| `403 FEATURE_NOT_AVAILABLE` | all | empty tables | `FeatureNotAvailable` component (exists) |
| `400 BAD_REQUEST` (Joi) | all mutations | generic / message | show backend `message` |
| 400 deactivate default policy | H5 | status-based guess ✓ | errorCode-based |
| 400 delete shift in use | H14 | status-based guess | errorCode-based |
| 409 holiday on date | H18 | status-based ✓ | errorCode-based |
| `OVERLAPPING_LOCK` | H41 | ✓ | keep |
| `404 NOT_FOUND` (clock-out calc) | U2 | console | refetch today |

---

## 8. Backend Clarifications / Documentation Gaps (genuine ambiguities only)

| ID | Gap | Evidence | Blocks |
|---|---|---|---|
| C1 | **HR regularization endpoints** used by a live page are not in any doc or the registry | `attendance.api.js:75-80`; `AttendanceRegularizationsHRPage` | Keep, re-point HR to `/manager/regularizations/*`, or remove the page |
| C2 | **`PUT /hr/shifts/assignments/:id`** undocumented | `attendance.api.js:49`; Roster "Edit" | Edit action |
| C3 | **Shift create/update request contract**: key `type` vs `shift_type` (user `/shift` returns `shift_type`); is `policy_id` required; flexible/split/night/buffer field names; is `rotational` created here or only via rotations | HR doc §1 names concepts only | H10, H13 |
| C4 | **Policy contract**: `late_threshold_minutes`, `is_default`, `max_breaks_per_day`, auto-clock-out fields; units (HR doc: `half_day_min_hours`; `/shift` response: `half_day_threshold_minutes`) | HR doc §1 vs user doc §11 | H1, H4, U13 |
| C5 | **Rotation contract**: `entries[]` schema, off-day representation, `start_reference_date` format, relation to assignment | HR doc §1 mentions only `rotation_cycle_days` | H15 |
| C6 | **Assignment**: `effective_from`/`effective_to` date vs datetime; `rotation_pattern_id` key; what happens to an existing active assignment (UI claims "current shift ends the day before"); future-dated assignments; deleting/deactivating a shift that has assignments | HR doc §2 | H6, H9 |
| C7 | **Holiday**: `type` enum vs `is_optional`; `target_job_statuses`; allowed `target_employment_types` values; `date` format | HR doc §3, user doc §19 | H18, H20 |
| C8 | **Weekly-off**: day numbering (doc: "`[0, 6]` for Saturday and Sunday"); `name`, `priority`, `effective_from`, locations/job-status/include/exclude support | HR doc §3 | H22, H24 |
| C9 | **Devices**: register/update request fields (`ip_address`? `location_id`? serial?); exact key of the one-time secret in the create response; status enum vs `is_active`; `last_sync_at` in list; does DELETE deactivate or delete, and does it cascade mappings | HR doc §4, webhook doc | H26–H29 |
| C10 | **Comp-off decision bodies**: do manager/HR approve/reject accept `remarks`; is it required for reject | Manager doc §10, HR doc §5 | M12, M13, H38, H39 |
| C11 | **Comp-off record shape & status enum**: `earned_date` vs `worked_date`, `worked_hours`, `days_earned`, `expiry_date`; does the enum include `rejected` (HR tabs) or only `earned/approved/used/expired/cancelled` | User doc §13 | U14, U15, H37 |
| C12 | **Comp-off creation**: *no create endpoint is documented.* Leave Phase-4 analysis says comp-offs are **system-generated at clock-out** when policy `comp_off_on_holiday_work` is true, but that field appears in neither the attendance policy nor the comp-off policy docs. The frontend correctly has **no** comp-off request form. Confirm the earning trigger and which configuration enables it. | `md_leave/md_phases/phase4_analysis.md:11-16` | Workflow 7 |
| C13 | **Overtime creation**: no submit endpoint documented; manager pending/approve exists. Confirm OT requests are auto-created at clock-out when `overtime_enabled` and `overtime_minutes ≥ overtime_min_minutes`. The frontend correctly has **no** overtime request form. | Manager doc §7-8 | Workflow OT |
| C14 | **Undocumented response shapes**: U9, U10, U14, U16, U17, U18, U19; M2, M5, M8, M11, M14, M17; H37, H44–H47, H51–H63; pagination key `totalPages` (user doc) vs `total_pages` (frontend reads) | — | Response handling for ~35 endpoints |
| C15 | **Undocumented query params**: M2 team history; H7 assignments; HR lists (`date`, `page`, `limit`, `search`, `department_id`?); HR detail (`month`/`year` vs `from`/`to`); reports daily/monthly/employee (integer `month`+`year` vs `YYYY-MM`; `from/to` vs `start_date/end_date`); H61 department-summary `date`; H62 top-defaulters | — | Filters |
| C16 | **Anomaly status enum conflict**: user doc `open/resolved/all`; manager doc queries `status === 'unresolved'` | User doc §8 vs manager doc §3 | U10, M3 |
| C17 | **Lock side effects**: does creating a lock auto-reject pending regularizations/comp-offs (UI claims so)? Can HR delete a lock created by an approved payroll run, and should the UI block it? | Lock page copy; payroll D-3 | H41, H42 |
| C18 | **Clock-out body**: doc says "same as clock in" but lists only 4 fields; are `work_mode`/`client_timestamp` accepted? | User doc §2 | U2 |
| C19 | **`work_mode` source**: per-punch user choice vs employee profile default | User doc §1 | U1 |
| C20 | **Manager access to `/hr/hrs/*`**: registry allows `manager`; is a manager-facing HR-staff view intended? | Registry rows 47-50 | Role matrix |
| C21 | **Recompute-stale response** (count/ids) | HR doc §6 | H43 |
| C22 | **`/today` break total**: is `break_duration_minutes` returned (frontend timer relies on it) or must it be summed from `breaks[]` | User doc §4 | U5 timer |

---

## 9. Workflow Gap Report

Legend: ✓ working · ⚠ partial/defective · ✗ broken/missing · ❓ needs clarification.

### W1 — Daily Punch — ⚠ Partial
`Load Today (U5 ⚠ state from clock_in_time, holiday/weekly_off unhandled)` → `Resolve Shift (U13 ✗ not displayed)` → `Clock In (U1 ⚠ silent geo failure, no work_mode, no errors, double-submit)` → `Work (timer ⚠ break math)` → `Break (U3 ⚠)` → `End Break (U4 ⚠)` → `Clock Out (U2 ⚠ result discarded)` → `Calculation (backend ✓)` → `History (U11 ✗ wrong params)` / `Summary (U12 ⚠ 4/10 metrics)` / `Daily log (U16 ✗)`.
**Broken steps:** shift display, history filtering, daily log, error feedback. **HR role cannot start this workflow at all.**

### W2 — Regularization — ⚠ Partial
`Attendance issue (no "Request correction" action from a history row ✗)` → `Submit (U6 ⚠ validation)` → `Pending list (U7 ✗ times not shown)` → `Manager review (M5 ⚠ no requested times in modal)` → `Approve/Reject (M6/M7 ⚠ errors)` → `Recalculate (backend ✓)` → `Updated history (U11 ✗)`; `Cancel (U8 ⚠)`.

### W3 — Shift Configuration — ✗ Broken
`Create Policy (H1 📝)` → `Create Shift (H10 ✗ no policy_id)` → `Assign (H6 ❓ date type)` → `Effective date reached (backend)` → `Employee active shift (U13 ✗ not shown)` → `Calculation uses shift+policy (✗ policy link cannot be set from UI)`.

### W4 — Rotational Shift — ❓ Partial
`Create shifts (H10 📝)` → `Create rotation (H15 📝 no off-days, no Σ validation)` → `Assign rotation (H6 ❓ rotation_pattern_id)` → `Effective attendance (U13/U19 ⚠ not visible)`.

### W5 — Holiday — ⚠ Partial
`Create scoped holiday (H18 ❓ mostly complete)` → `Applicable employees (backend)` → `User calendar (U20 ⚠ only on Leave dashboard; U19 ⚠ status keys)` → `Calculation (backend ✓; `today.status=holiday` ✗ unhandled in punch card)`.

### W6 — Weekly Off — ⚠ Partial
`Create rule (H22 ⚠ effective_from validation, ❓ day numbering)` → `Match scope (backend)` → `Calendar (U19 ⚠ weekly-off key mismatch)` → `Calculation (✓; punch card ✗ weekly_off)`.

### W7 — Comp-Off — ✗ Broken
`Configure comp-off policy (H33 ✗ wrong fields)` → `Earned at clock-out (backend, C12 ❓)` → `Employee sees earned (U14 ❌ fields/enum)` → `Manager review (M11 ⚠)` / `HR override (H37 ❌ tabs, H38 ⚠)` → `Approve (M12 ❓ body)` → `Comp-off balance (U15 ❌ used_days)` → `Leave credit (Leave module ✓, no in-app notice ⚠)`.

### W8 — Biometric — ✗ Broken
`Register device (H26 ❌ nav hidden)` → `Receive API key (✗ discarded)` → `Map employee (H30 ❌ wrong keys, UUID input)` → `Hardware punch → Webhook (W1 🔌 cannot authenticate)` → `Attendance log → async processing (backend)` → `Record visible (U5/H51 ✓ once processed; no "pending sync" explanation ⚠)`.

### W9 — Payroll Lock — ⚠ Partial
`Create lock (H41 ⚠ validation, ❓ side-effect copy)` → `Employee/manager modifies (U1/U6/M6)` → `Backend rejects DATE_LOCKED ✓` → `Frontend explains lock (✗ generic/console)` → `Unlock if authorized (H42 ⚠ no payroll-lock warning)`.

### W10 — Manager Oversight — ⚠ Partial
`Team today (M1 ❌ names "Unknown")` → `Team member (roster modal ✓)` → `History (M15 ❌ params) / Summary (M16 ⚠)` → `Anomalies/requests (M3/M5/M8/M11 ⚠ names, two UIs)` → `Review/resolve (M4/M6/M9/M12 ⚠ errors, stale remarks, badge not refreshed)`.

**Workflow Coverage:** 0 complete · 6 partial · 4 broken → **0% complete / 30% weighted**.

---

## 9A. Implementation Quality Findings

| Finding | Location | Severity |
|---|---|---|
| No typed contract (JS only); response shapes guessed with `data.data \|\| data.x \|\| data` chains | 9 screens | High, hides mismatches |
| Duplicate `LiveEffectiveHours` (×3) computing gross hours, contradicting backend `effective_hours` | AttendanceDirectory, AttendanceTab, OverviewTab | Medium |
| Duplicate Toast (×6), fmtDate/fmtTime (×10+), status badge maps with inconsistent keys | many | Medium |
| Two approval UIs with divergent validation (`ActionModal` vs Inbox modal) | manager screens | Medium |
| `ActionModal` remarks state persists across rows | [ActionModal.jsx:5](src/roles/manager/components/ActionModal.jsx#L5) | Medium |
| No loading/disabled state on punch & approval buttons (duplicate submits) | AttendanceCard, ManagerCompOffsPage, AttendanceRegularizationsHRPage approve | High |
| Destructive actions without confirmation: HR comp-off approve/reject/bulk, manager comp-off approve/reject, HR regularization approve | listed | Medium |
| `alert()`-driven UX on devices/comp-off policies | 2 pages | Low |
| `useEffect` with missing deps (fetch fns) | most pages | Low |
| `console.log` of attendance payload | ManagerDashboard:149 | Low |
| `URLSearchParams` sends empty params (`status=`) | several | Low |
| CSV export without quoting (commas/newlines in names break columns) | AttendanceReportsPage:68-77 | Medium |
| Fabricated metrics / dead controls (see §7) | EmployeeDashboard, ManagerDashboard, AttendanceCard | Medium (trust) |
| Raw UUID shown/entered | Device mappings; manager anomalies fallback; TeamHistoryTable `EMP-xxxx` fallback | Medium |
| Colspan mismatch (5 vs 6 cols) | RegularizationCard:102 | Low |

---

## 10. Phase-Wise Implementation Plan

**Ordering rationale.** Phase 0 (clarifications) runs in parallel with everything and gates only the ❓ items. Phase 1 builds the shared contract, error and date layers every later phase relies on. Configuration (2–3) precedes daily attendance (4) because the punch card must display shift/holiday state that only exists once configured. Biometric (8) is independent after Phase 1 and can be pulled forward, since it is fully broken today.

### Phase 0 — Backend Contract Clarification (parallel track)
- **Objective:** Resolve C1–C22 so no ❓ item is implemented on a guess.
- **APIs:** all ❓ rows. **Existing:** docs listed in the header. **Missing:** request/response schemas, enums, query params.
- **Deliverable:** an addendum to `public/ref docs/md_attendance/` (or confirmation replies) covering C1–C22.
- **Risks:** Phases 2, 3, 7, 8 stall on C3, C5–C9, C11, C15. **Mitigation:** implement documented parts first, and put ❓ fields behind a small `CONTRACT_PENDING` flag in the contract map.
- **Exit:** every C-item answered or explicitly descoped.

### Phase 1 — Attendance Foundation
- **Objective:** A single contract, error, date and selector layer so later fixes are small and consistent.
- **APIs:** all 100 browser endpoints (service signatures), plus H48/H49 added.
- **Existing:** `attendance.api.js` object; `client.js` exposes `error.data.errorCode`; `leaveErrors.js`/`payrollErrors.js` patterns; `DICTIONARY.STATUS_CONFIG`; `MultiSelectDropdown`; `FeatureNotAvailable`.
- **Missing:** query helper; corrected signatures (U11, U20, M14, M15, H43, H48, H49); enums; error mapper; date utils; shared selectors/badges; refresh events; role-aware nav.
- **Form/API gaps addressed:** none directly. This provides the contract maps later forms use.
- **Files:** `src/shared/api/attendance.api.js`, new `src/shared/attendance/*`, `src/shared/utils/attendanceErrors.js`, `DashboardSidebar.jsx`, `AppRoutes.jsx`, `dictionary.js`.
- **Dependencies:** none (Phase 0 answers refine enums later).
- **Risks:** changing service signatures touches callers. Update each caller in the same change.
- **Steps:** see the detailed checklist §10.1.
- **Verification:** each service fn produces the documented URL (compare with a table-driven check of 101 rows); error mapper covers all codes in §7.6; `toLocalYMD` correct at 00:30 IST.
- **Exit:** no screen builds query strings or parses dates ad hoc; `attendanceErrorMessage` is used by every attendance mutation.

### Phase 2 — Attendance Configuration (Policies, Shifts, Rotations, Assignments)
- **Objective:** Complete, validated configuration so "Policy → Shift → Assignment → Calculation" works from the UI.
- **APIs:** H1–H17 (+ C2 decision on undocumented PUT).
- **Existing:** Policy modal (8/10), type-adaptive Shift modal, Rotation modal, Roster with a good employee picker and distinct End/Delete.
- **Missing:** `max_break_duration_minutes`, `max_breaks_per_day`; `policy_id` selector + policy column; rotational type decision; off-day phases + Σ validation; `effective_from`/`effective_to` as dates; hide Edit assignment until C2; End only for ongoing rows; assignment filters/pagination; errorCode-based messages.
- **Files:** `AttendancePoliciesPage.jsx`, `AttendanceShiftsPage.jsx`, `AttendanceRosterPage.jsx`.
- **Dependencies:** Phase 1; Phase 0 C3–C6.
- **Risks:** existing shifts without a policy. Show "No policy (org default)" and let HR fix them.
- **Steps:** (1) policy fields + validation; (2) shift `policy_id` + per-type validation + overnight derivation; (3) rotation off-days/Σ check/phase preview; (4) assignment date types, row actions by state, filters; (5) remove/hide undocumented edit.
- **Verification:** create policy → create shift with that policy → assign today → `GET /attendance/shift` as that employee returns the shift with policy thresholds.
- **Exit:** Form coverage Policy 100%, Shift 100% (documented), Rotation 100%, Assign 100%.

### Phase 3 — Calendar Rules (Holidays, Weekly-offs)
- **Objective:** Correct, fully targeted calendar exceptions.
- **APIs:** H18–H25, U19, U20.
- **Existing:** full targeting MultiSelects ✓; weekday chips ✓.
- **Missing:** date format per C7; employment-type/job-status source per C7/C8; weekly-off `effective_from` validation + `excluded_users` control; targeting names in list; "Global/Exception" labelling by actual targeting; date parsing hardening.
- **Files:** `AttendanceHolidaysPage.jsx`, `AttendanceWeeklyOffsPage.jsx`.
- **Dependencies:** Phase 1; C7, C8.
- **Risks:** preset importer creates org-wide holidays silently. Add a confirm step showing scope.
- **Verification:** a targeted holiday appears in `/attendance/holidays` for an included user and not for an excluded one; the weekly-off day renders as `weekly_off` in the weekly calendar.
- **Exit:** Holiday and Weekly-off forms 100% confirmed; no raw day numbers or IDs displayed.

### Phase 4 — User Daily Attendance
- **Objective:** A punch experience driven entirely by `/today`, with complete payloads and explicit states.
- **APIs:** U1–U5, U11, U13, U16.
- **Existing:** `AttendanceCard` (state from `clock_in_time`), history table, daily log modal.
- **Missing:** status-driven state machine (`not_marked`, `in_progress`±break, `present`/completed, `holiday`, `weekly_off`); geolocation hook (idle/requesting/granted/denied/unsupported/timeout + retry + explicit "continue without location"); `work_mode` (profile default + override), `notes`, `client_timestamp`; loading/disabled buttons; clock-in result (late/grace) and clock-out result banner; timer from `breaks[]`; shift panel from U13; history `from/to/page/limit` + pagination + late/early/OT columns; daily-log modal matching the object shape; HR and Manager "My Attendance" nav + routes.
- **Files:** `AttendanceCard.jsx`, `EmployeeDashboard.jsx`, `ManagerDashboard.jsx`, `HRDashboard.jsx` (add card), `EmployeeAttendancePage.jsx`, `DashboardSidebar.jsx`, `AppRoutes.jsx`, new `useGeolocation.js`.
- **Dependencies:** Phase 1; Phase 2 (shift display); C18, C19, C22.
- **Risks:** blocking the punch on location denial could stop legitimate remote workers. Never hard-block, because the backend accepts punches without coordinates.
- **Verification:** reload mid-break shows End Break; holiday date shows holiday state; double-click creates one request; denied location shows a message and still allows an acknowledged punch; history month change sends `from/to`.
- **Exit:** W1 complete for Employee, Manager and HR roles.

### Phase 5 — Employee Requests & Analytics
- **Objective:** Correct self-service requests and truthful analytics.
- **APIs:** U6–U10, U12, U14, U15, U17–U20.
- **Missing:** regularization validation + overnight + errors; "Request correction" action from history rows (prefills date); list keys, status tabs, pagination, cancelled badge; overtime/anomaly/comp-off list shapes (C11, C14, C16), enums, pagination; comp-off summary `used_days`/`expired_days`; summary cards for all 10 metrics; weekly calendar navigation + underscore keys; trends selector; dashboard donut from real data; remove fabricated percentile/dead select.
- **Files:** `RegularizationCard.jsx`, `AttendanceRegularizationsPage.jsx`, `AttendanceAnomaliesPage.jsx`, `EmployeeOvertimePage.jsx`, `EmployeeCompOffsPage.jsx`, `EmployeeAttendancePage.jsx`, `EmployeeDashboard.jsx`, `LeaveDashboard.jsx` (holidays year).
- **Dependencies:** Phases 1, 4; C11, C12, C13, C14, C16.
- **Risks:** none structural; shape confirmations needed.
- **Verification:** submit → pending with times visible → cancel → cancelled tab; anomaly filters return data for `open`.
- **Exit:** W2 employee side complete; no fabricated values.

### Phase 6 — Manager Attendance
- **Objective:** Hierarchy-scoped oversight with human names and one consistent approval experience.
- **APIs:** M1–M17.
- **Missing:** name resolution per documented shapes; remove the non-functional date navigator; team summary date format; member history `from/to/page/limit`; team history params (C15) + pagination; a unified `DecisionDialog` (details, remarks rules, loading, errorCode, reset per row) used by the per-type pages and the Inbox; drop `rejection_reason`; comp-off decision body per C10 with a "credits leave balance" notice; `attendance:changed` → sidebar badge refresh; anomaly `type` field + enum (C16); requested times in regularization review.
- **Files:** `ManagerTeamPage`, `TeamStatusToday`, `ManagerTeamHistoryPage`, `TeamHistoryTable`, `ManagerDashboard`, `ManagerTeamRosterPage`, `ManagerAnomaliesPage`, `ActiveAnomalies`, `ManagerRegularizationsPage`, `PendingRegularizations`, `ManagerOvertimePage`, `PendingOvertime`, `ManagerCompOffsPage`, `ManagerApprovalsInbox`, `ActionModal` → `DecisionDialog`, `DashboardSidebar`.
- **Dependencies:** Phases 1, 5 (shared list components); C10, C14, C15, C16.
- **Risks:** Inbox also handles Leave. Keep the leave branch untouched and apply the dialog only to attendance types.
- **Verification:** approve a regularization → pending list, badge and employee history all reflect it; an out-of-scope manager receives the hierarchy message.
- **Exit:** W2 manager side and W10 complete.

### Phase 7 — HR Attendance Management
- **Objective:** Correct org views, comp-off configuration, locks, maintenance and reports.
- **APIs:** H33–H58 (+ C1 decision on HR regularizations page).
- **Missing:** comp-off policy fields (5); org comp-off enum tabs, pagination, override confirmation + remarks, bulk result report; lock date validation, payroll-lock warning, copy per C17; recompute `date` + result; H48/H49 wiring and role-aware profile tabs (`hr` → `/hrs/*`); reports params per C15, CSV escaping, remove client re-aggregation where the backend supplies totals, unify `ReportsTab` with the Reports page; directory pagination key; shared `LiveEffectiveHours` corrected (show backend `effective_hours`, label live values "gross, excl. breaks unknown" or omit); HR regularizations page decision (C1).
- **Files:** `AttendanceCompOffPoliciesPage`, `AttendanceCompOffsPage`, `AttendanceLockPeriodsPage`, `AttendanceReportsPage`, `ReportsTab`, `AttendanceTab`, `OverviewTab`, `AttendanceDirectory`, `EmployeeProfilePage`, `AttendanceRegularizationsHRPage`.
- **Dependencies:** Phases 1, 6 (DecisionDialog); C1, C9–C11, C14, C15, C17, C21.
- **Risks:** deleting a payroll-created lock re-opens paid periods. Require typed confirmation.
- **Verification:** a comp-off policy round-trips all 5 fields; HR profile of an HR user calls `/hrs/:id/*`; CSV with a comma in a name opens correctly.
- **Exit:** W7 HR side and W9 complete.

### Phase 8 — Devices / Biometric
- **Objective:** HR can onboard a device end-to-end without developer help.
- **APIs:** H26–H32; W1 prerequisites.
- **Missing:** restore nav; one-time secret dialog (reveal/copy/acknowledge, never persisted or logged, cleared on close, no "view key later" affordance); device ID copy; activation toggle (no forced `status`); `last_sync_at` "Last seen"; mapping employee picker → `user_id`, `device_employee_id`, duplicate error; mapping list showing name + code; integration panel (URL, header, body, types, ±60 s dedup, lock rejection, `MAPPING_NOT_FOUND`, async processing note, NTP/backoff).
- **Files:** `BiometricDevicesPage.jsx` (split into `DeviceFormModal`, `DeviceSecretDialog`, `DeviceMappingsModal`), `DashboardSidebar.jsx`.
- **Dependencies:** Phase 1 (EmployeePicker); C9.
- **Risks:** secret exposure via React DevTools/state. Keep it in a local ref, clear on unmount.
- **Verification:** register → copy key → `curl` webhook with a mapped `device_employee_id` → 200; unmapped → 404 documented; after the worker runs, the punch appears in the directory.
- **Exit:** W8 complete; Device and Mapping forms 100%.

### Phase 9 — HR Dashboard & Analytics
- **Objective:** Every dashboard API is rendered with filters and states.
- **APIs:** H59–H63.
- **Missing:** Top Defaulters widget (tabs by metric per C14, month selector, names + codes, link to profile); Work-Mode Distribution chart (date selector, local date); department-summary date selector; live refresh (interval + manual + on focus); graph without fabricated padding dates; loading/empty/error per widget.
- **Files:** `HRDashboard.jsx` (extract `TopDefaultersCard`, `WorkModeCard`, `DepartmentSummaryCard`).
- **Dependencies:** Phase 1; C14, C15. Recharts already installed.
- **Verification:** API → component → filter → transform → render mapping table filled for all 5.
- **Exit:** 5/5 dashboard APIs rendered.

### Phase 10 — Hardening & 100% Verification
- **Objective:** Prove the 101-row reconciliation is 100%.
- **Steps:** re-run §2 matrix row by row; permission walkthrough per role (employee/manager/hr/admin/super-admin, flag off); form contract re-audit against Phase 0 addendum; filter/pagination checks; mutation refresh matrix; timezone tests (IST 00:30, UTC-5); every errorCode path; responsive/empty/loading states; remove `console.log`; lint; manual regression of Leave inbox and Payroll lock interplay.
- **Exit:** Fully Implemented = 100/100 applicable (+ webhook documented as 🔌), Form coverage 100%, Workflow coverage 10/10.

### 10.1 Detailed Phase 1 Checklist (file / component level)

The project is JavaScript with no React Query/Redux. The checklist adapts "types / query keys" to that architecture rather than adding new frameworks.

| # | Item | File(s) | Task |
|---|---|---|---|
| 1 | Query helper | `src/shared/api/attendance.api.js` | Add `qs(params)` that drops `undefined`/`null`/`""`; replace all template-string query building |
| 2 | Endpoint constants | same | Group paths in an `ATT_PATHS` map (101 documented + 4 undocumented flagged `// UNDOCUMENTED – see audit C1/C2`) |
| 3 | Signature fixes | same + callers | `getHistory({from,to,page,limit})`; `getTeamMemberHistory(userId,{from,to,page,limit})`; `getTeamSummary(ymd)`; `getUpcomingHolidays(year)`; `getWeeklyCalendar(ymd)`; `recomputeStaleRecords({date})`; `getMyRegularizations({status,page,limit})`; `getManagerAnomalies()`; `getWorkModeDistribution(ymd)` |
| 4 | Missing service fns | same | `getIndividualHRAttendanceDetail(userId, params)` → `/hr/hrs/:id/attendance`; `getIndividualHRMonthlySummary(userId, month, year)` → `/hr/hrs/:id/summary` |
| 5 | Request "types" | `src/shared/attendance/contracts.js` | JSDoc `@typedef` per request body (§5), plus a `FORM_CONTRACTS` map `{api, fields:[{key, required, source, status}]}` used by forms and the Phase 10 audit |
| 6 | Response "types" | same | JSDoc typedefs for documented responses (clock-in, clock-out, today, history+pagination, summary, shift, regularization list, comp-off summary, webhook); `// PENDING C14` for undocumented ones |
| 7 | Response normalizers | `src/shared/attendance/normalize.js` | `normalizePaginated(res)` (accepts `totalPages`/`total_pages`), `personName(entity)` (flat `name` → `user.name` → `profile.first/last` → `identifier`, **never a UUID**), `employeeCode(entity)` |
| 8 | Enums | `src/shared/attendance/enums.js` | `RECORD_STATUS`, `WORK_MODE`, `PUNCH_SOURCE`, `REG_STATUS`, `COMP_OFF_STATUS`, `ANOMALY_STATUS`, `SHIFT_TYPE`, `WEEKDAYS` (value↔label), `ANOMALY_TYPE` labels, `PUNCH_TYPE` |
| 9 | Validation | `src/shared/attendance/validation.js` | `validateRegularization`, `validatePolicy`, `validateShift`, `validateRotation`, `validateLock`, `validateClockNotes` (pure functions returning field errors) |
| 10 | Refresh events | `src/shared/attendance/events.js` | `emitAttendanceChanged(kind)` / `useAttendanceChanged(kinds, cb)`; kinds: `punch`, `regularization`, `overtime`, `compoff`, `anomaly`, `config`, `lock` |
| 11 | "Query keys" equivalent | `events.js` | Document which screens subscribe to which kinds (from §7.4) |
| 12 | Sidebar badge | `DashboardSidebar.jsx` | Invalidate `lastInboxFetchTime` on `regularization/overtime/compoff/anomaly` events |
| 13 | Permission helpers | `src/shared/auth/permissions.js` | `canSelfServeAttendance(role)` (all org roles), `canManageTeamAttendance(role)`, `canConfigureAttendance(role)` |
| 14 | Role nav & routes | `DashboardSidebar.jsx`, `AppRoutes.jsx` | "My Attendance" group for manager and hr (routes under their workspace or shared `/dashboard/attendance/*`); restore Devices link (Phase 8 flag) |
| 15 | Error mapping | `src/shared/utils/attendanceErrors.js` | `attendanceErrorMessage(err, fallback)` keyed on `errorCode` (§7.6), plus `isFeatureDisabled(err)` |
| 16 | Feature-flag state | `src/shared/attendance/AttendanceGate.jsx` | Render `FeatureNotAvailable` when any initial load returns `FEATURE_NOT_AVAILABLE` |
| 17 | Employee selector | `src/shared/attendance/EmployeePicker.jsx` | Searchable single/multi picker over `organizationAPI.getEmployees` showing name + code + email; value = `user_id` (extract from `AttendanceRosterPage.AssignModal`) |
| 18 | Shift selector | `ShiftSelect.jsx` | Active shifts, label "Name · 09:00–18:00 · Fixed" |
| 19 | Policy selector | `PolicySelect.jsx` | Active policies, default badge |
| 20 | Department / location selectors | reuse `MultiSelectDropdown` with loaders `useOrgDepartments`, `useOrgLocations` | Remove duplicated loaders in Holiday/Weekly-off modals |
| 21 | Rotation selector | `RotationSelect.jsx` | Name · cycle days |
| 22 | Date utilities | `src/shared/attendance/dates.js` | `toLocalYMD`, `parseYMDLocal`, `monthRange(year, month)` → `{from,to}`, `combineLocalDateTime(ymd, hhmm, {nextDay})` → ISO, `fmtDate`, `fmtTime`, `fmtMinutes`, `fmtHours` (wraps `formatDecimalHours`) |
| 23 | Timezone utilities | same | `browserTimeZone()`, `formatInZone(iso, tz)` for location-TZ labelling |
| 24 | Pagination | `src/shared/components/Pagination.jsx` + `usePagedQuery(fetchFn, params)` | page/limit/total/totalPages, resets page on param change, empty-page fallback |
| 25 | Status badges | `src/shared/attendance/StatusBadge.jsx` | One map built on `DICTIONARY.STATUS_CONFIG` + regularization/comp-off/anomaly/severity variants; replace 8 local maps |
| 26 | Loading / empty / error states | `src/shared/attendance/AsyncState.jsx` | Standard skeleton/empty/error with retry |
| 27 | Decision dialog | `src/shared/attendance/DecisionDialog.jsx` | Title, entity summary slot, remarks (required rule per action), loading, error; reset per open |
| 28 | Toast | reuse one shared Toast (or `GlobalAlertProvider`) | Remove 6 local copies progressively |
| 29 | Live hours | `src/shared/attendance/LiveEffectiveHours.jsx` | Single implementation; uses backend `effective_hours` when available; label live gross time |
| 30 | CSV utility | `src/shared/utils/csv.js` | RFC-4180 quoting |
| 31 | Contract self-check | `src/shared/attendance/__contract__.md` or script | Table-driven list of 101 endpoints → service fn → consumer → status, updated each phase |
| 32 | Tests | (no test runner configured) | Add Vitest (Vite-native) for `dates.js`, `normalize.js`, `validation.js`, `attendanceErrors.js`, `qs()`. If adding a dev dependency is not approved, keep these pure and verify manually against §10 checklists. |

---

## 11. Final API Reconciliation

| Status | User | Manager | HR | Webhook | Total |
|---|---|---|---|---|---|
| ✅ Fully Implemented | 0 | 0 | 7 (H2, H3, H5, H8, H12, H21, H25) | — | **7** |
| 🟡 Partially Implemented | 12 | 13 | 34 | — | **59** |
| ❌ Incorrectly Integrated | 7 | 3 | 7 | — | **17** |
| 📝 Form Incomplete | 0 | 0 | 5 (H1, H4, H10, H13, H15) | — | **5** |
| ❓ Backend Clarification Required | 0 | 1 (M2) | 6 (H6, H9, H18, H20, H45, H46) | — | **7** |
| 👁 UI Missing | 1 (U13) | 0 | 2 (H62, H63) | — | **3** |
| ⛔ Missing | 0 | 0 | 2 (H48, H49) | — | **2** |
| 🔌 Not Applicable to Browser | — | — | — | 1 | **1** |
| **Total documented** | **20** | **17** | **63** | **1** | **101** |

- **Attendance API Coverage %** = 7 / 100 browser-applicable = **7%** (service-layer presence: 98%; usable fully+partial: 66%)
- **Attendance Form Contract Coverage %** = 48 / 67 = **72%**
- **Attendance Filter/Query Coverage %** = 11 / 33 = **33%**
- **Attendance Workflow Coverage %** = 0 / 10 complete = **0%** (weighted 30%)

Additionally, **4 undocumented endpoints** are called by the frontend (§2.5). They are excluded from the 101 and tracked as C1/C2.

---

## 12. Uncovered / Incomplete Attendance API Register

Every endpoint that is not ✅ is listed individually.

| API | Reason not 100% | Required action | Phase |
|---|---|---|---|
| U1 POST /clock-in | Silent geo failure; missing work_mode/notes/client_timestamp; errors hidden; double submit; result discarded; HR has no UI | Geolocation hook, full payload, result + error UX, role nav | 4 |
| U2 POST /clock-out | Notes missing; result discarded; partial refresh | Result banner, refresh events | 4 |
| U3 POST /break/start | No loading/error messages | Loading + errorCode | 4 |
| U4 POST /break/end | Same | Same | 4 |
| U5 GET /today | State from clock_in_time; holiday/weekly_off unhandled; timer break math; fake ring | Status-driven state machine | 4 |
| U6 POST /regularization | Validation gaps; overnight; generic errors | Validation + errors | 5 |
| U7 GET /regularizations | Wrong keys; no filter/pagination | Fix keys, tabs, pagination | 5 |
| U8 POST /regularizations/:id/cancel | No loading/mapped errors | DecisionDialog/errors | 5 |
| U9 GET /overtime/mine | Wrong fields; no pagination; shape ❓ | C14 + fix | 5 |
| U10 GET /anomalies/mine | Wrong enum; no pagination | Enum + pagination | 5 |
| U11 GET /history | Wrong params; no pagination; columns | from/to/page/limit | 4 |
| U12 GET /summary | 4/10 metrics | Render all metrics | 5 |
| U13 GET /shift | Never rendered | Shift panel | 4 |
| U14 GET /comp-offs/mine | Wrong fields/enum; no filter/pagination | C11 + fix | 5 |
| U15 GET /comp-offs/mine/summary | `total_used` vs `used_days`; expired missing | Fix keys | 5 |
| U16 GET /daily-log | Array vs object handling | Object-shaped modal; C14 | 4 |
| U17 GET /graph-data | Hardcoded/fabricated widgets; no month nav | Real data | 5 |
| U18 GET /trends | Shape ❓; hardcoded months | C14 + selector | 5 |
| U19 GET /weekly-calendar | Status key mismatch; no navigation | Keys + stepper | 5 |
| U20 GET /holidays | No year arg; not in attendance area | Year + display | 5 |
| M1 GET /team/today | Names "Unknown"; fake date nav | Normalizer; remove nav | 6 |
| M2 GET /team/history | Params undocumented; no pagination | C15 + pagination | 6 |
| M3 GET /team/anomalies | Names/UUID; `anomaly_type`; enum ❓ | Normalizer; C16 | 6 |
| M4 POST /anomalies/:id/resolve | Stale remarks; errors; badge | DecisionDialog + events | 6 |
| M5 GET /regularizations/pending | Names; no requested times | Detail in dialog | 6 |
| M6 POST /regularizations/:id/approve | Errors; loading; badge | DecisionDialog | 6 |
| M7 POST /regularizations/:id/reject | Extra field; inconsistent remarks rule | DecisionDialog | 6 |
| M8 GET /overtime/pending | Names/details | Normalizer | 6 |
| M9 POST /overtime/:id/approve | Errors/loading | DecisionDialog | 6 |
| M10 POST /overtime/:id/reject | Extra field; rules | DecisionDialog | 6 |
| M11 GET /comp-offs/pending | Shape ❓; names | C11/C14 | 6 |
| M12 POST /comp-offs/:id/approve | Body ❓; no confirmation/leave notice | C10 + dialog | 6 |
| M13 POST /comp-offs/:id/reject | Body ❓ | C10 + dialog | 6 |
| M14 GET /team/summary | ISO datetime instead of date | Local YMD | 6 |
| M15 GET /team/member/:userId/history | month/year instead of from/to/page/limit | Fix signature + pagination | 6 |
| M16 GET /team/member/:userId/summary | Partial metrics | All metrics | 6 |
| M17 GET /team/graph-data | Arbitrary paging; shape ❓ | C14; chart paging | 6 |
| H1 POST /hr/policies | 2 fields missing; 2 undocumented | Fields + C4 | 2 |
| H4 PUT /hr/policies/:id | Same | Same | 2 |
| H6 POST /hr/shifts/assign | Date type; rotation key ❓ | C6 + YMD | 2 |
| H7 GET /hr/shifts/assignments | No filters/pagination | C15 + UI | 2 |
| H9 POST /hr/shifts/assignments/:id/end | Body ❓; offered on ended rows | C6 + row state | 2 |
| H10 POST /hr/shifts | No policy_id; field contract ❓ | Policy select + C3 | 2 |
| H11 GET /hr/shifts | Policy not shown; key ❓ | Policy column | 2 |
| H13 PUT /hr/shifts/:id | Same as H10 | Same | 2 |
| H14 DELETE /hr/shifts/:id | Status-guess errors | errorCode | 2 |
| H15 POST /hr/rotations | Off-days; Σ validation; schema ❓ | C5 + validation | 2 |
| H16 GET /hr/rotations | Phase details not shown | Phase preview | 2 |
| H17 DELETE /hr/rotations/:id | No in-use warning | errorCode + warning | 2 |
| H18 POST /hr/holidays | type/job-status/employment enum/date ❓ | C7 | 3 |
| H19 GET /hr/holidays | Targeting names hidden; date parse fragility | Names + date util | 3 |
| H20 PUT /hr/holidays/:id | Same as H18 | C7 | 3 |
| H22 POST /hr/weekly-offs | effective_from validation; excluded_users UI; day numbering ❓ | C8 + validation | 3 |
| H23 GET /hr/weekly-offs | Mislabelled grouping | Group by targeting | 3 |
| H24 PUT /hr/weekly-offs/:id | Same as H22 | Same | 3 |
| H26 POST /hr/devices | API key discarded; nav hidden; request ❓ | Secret dialog + C9 | 8 |
| H27 GET /hr/devices | "Online" mislabel; id hidden | last_sync_at, id | 8 |
| H28 PUT /hr/devices/:id | Forced active status | Active toggle | 8 |
| H29 DELETE /hr/devices/:id | Semantics ❓; alerts | C9 + dialog | 8 |
| H30 POST /hr/devices/:id/mappings | Wrong keys; raw UUID | EmployeePicker + keys | 8 |
| H31 GET /hr/devices/:id/mappings | Wrong keys | Normalizer | 8 |
| H32 DELETE /hr/devices/:id/mappings/:mappingId | Alerts/errors | Dialog/errors | 8 |
| H33 POST /hr/comp-off-policies | 0/5 documented fields | Rebuild form | 7 |
| H34 GET /hr/comp-off-policies | Wrong fields | Render documented fields | 7 |
| H35 PUT /hr/comp-off-policies/:id | Same as H33 | Same | 7 |
| H36 DELETE /hr/comp-off-policies/:id | Alerts/errors | Dialog/errors | 7 |
| H37 GET /hr/comp-offs | Wrong enum tabs; no pagination | C11 + tabs | 7 |
| H38 POST /hr/comp-offs/:id/approve | No override confirm/remarks; bulk reporting | C10 + dialog | 7 |
| H39 POST /hr/comp-offs/:id/reject | Remarks optional | C10 + dialog | 7 |
| H40 GET /hr/locks | Payroll locks indistinguishable | Source label | 7 |
| H41 POST /hr/locks | Range validation; copy ❓ | Validation + C17 | 7 |
| H42 DELETE /hr/locks/:id | No payroll warning | Typed confirm | 7 |
| H43 POST /hr/records/recompute-stale | No date; no result | Date + result | 7 |
| H44 GET /hr/reports/daily | CSV escaping; fields/params ❓ | csv util + C14/C15 | 7 |
| H45 GET /hr/reports/monthly | `month=YYYY-MM` ❓; client aggregates | C15 | 7 |
| H46 GET /hr/reports/employee/:userId | Param names ❓; consumers disagree | C15 + unify | 7 |
| H47 GET /hr/hrs/attendance | Pagination key ❓ | normalizePaginated | 7 |
| H48 GET /hr/hrs/:userId/attendance | No service/UI | Add + wire | 7 |
| H49 GET /hr/hrs/:userId/summary | No service/UI | Add + wire | 7 |
| H50 GET /hr/hrs/:userId/daily-log | Parent list uses wrong route | Role-aware tabs | 7 |
| H51 GET /hr/employees/attendance | Pagination key; filters ❓; live hours | Normalizer, LiveEffectiveHours | 7 |
| H52 GET /hr/employees/:userId/attendance | Params ❓; used for HR users | C15 + role routing | 7 |
| H53 GET /hr/employees/:userId/summary | Used for HR users | Role routing | 7 |
| H54 GET /hr/employees/:userId/daily-log | Gross live hours | LiveEffectiveHours | 7 |
| H55 GET /hr/managers/attendance | As H51 | As H51 | 7 |
| H56 GET /hr/managers/:userId/attendance | As H52 | As H52 | 7 |
| H57 GET /hr/managers/:userId/summary | Partial metrics | All metrics | 7 |
| H58 GET /hr/managers/:userId/daily-log | As H54 | As H54 | 7 |
| H59 GET /hr/dashboard/live | No refresh; keys ❓ | Refresh + C14 | 9 |
| H60 GET /hr/dashboard/graph-data | Fabricated padding dates | Remove padding | 9 |
| H61 GET /hr/dashboard/department-summary | No date filter | Date selector | 9 |
| H62 GET /hr/dashboard/top-defaulters | Never rendered | Widget | 9 |
| H63 GET /hr/dashboard/work-mode-distribution | Never rendered; ISO datetime | Widget + YMD | 9 |
| W1 POST /devices/webhook | Hardware endpoint (🔌); onboarding prerequisites broken | Fix H26/H30, integration panel | 8 |
| *(undocumented)* GET/POST /hr/regularizations* | Not in backend docs | C1 decision | 0 → 7 |
| *(undocumented)* PUT /hr/shifts/assignments/:id | Not in backend docs | C2; hide Edit meanwhile | 0 → 2 |

**Register count:** 94 documented endpoints (93 browser + webhook) + 4 undocumented calls. With the 7 ✅ rows, that accounts for all 101 documented endpoints.

---

*End of audit. No source files were modified.*

