# Attendance: targeted weekly-off / holiday resolution fixed (employees wrongly marked absent)

**Date:** 2026-10-04
**Module:** Attendance (auto-absent cron + all read planes), Holiday listing, Leave day calculation, Payroll LOP
**Change type:** Bug fix — **behaviour correction** (no request/response shape change). Day statuses, leave
deductions and payroll LOP change for affected employees. No migration.

---

## 1. Symptom

Employees with a **Saturday** (or any department/location-targeted) weekly off were still being marked
`absent` by the 07:00 IST auto-absent cron, and shown `absent` on the HR / manager / employee panels
before the cron ran.

## 2. Root causes (two independent bugs)

### Bug 1 — the user's profile was read from the wrong place (CRITICAL)

`clock.service._getUserProfileArgs` and `holiday.service.getMyHolidays` read the role profile from
`membership.employee_profile`, but `organizationRepository.findMemberProfile` nests the profiles under the
`user` association (`membership.user.employee_profile`). The read therefore always returned `undefined`, so
`departmentId` / `locationId` / `employmentType` / `jobStatus` were **always null**.

Every weekly-off rule or holiday that is **targeted** at a department, location, employment type or job
status is matched in SQL with `(cardinality(target_x) = 0 OR :profileX = ANY(target_x))`. With a null
profile value, `NULL = ANY(target_x)` is SQL NULL (falsey), so **a targeted rule could only ever match
through its untargeted branch** — i.e. targeted rules and holidays silently never applied to anyone.

- **Impact:** a "Saturday off for the Tech department" rule (or a department-targeted holiday) matched
  nobody → those employees were treated as working on Saturday → auto-marked `absent` with an
  `unauthorized_absence` anomaly, and shown `absent` on every panel.
- **Not affected:** an **org-wide** (untargeted) weekly off / holiday always worked, because it matches via
  the `cardinality = 0` branch regardless of the profile. This is why only *some* employees were affected.
- **Leave and payroll were already correct** — they resolve the profile through
  `organizationRepository.findRoleProfile` / a direct profile-table read, not the broken nesting.

### Bug 2 — only the single highest-priority weekly-off rule was honoured (HIGH)

`_isWeeklyOff` (and the leave + payroll calendar resolvers) used only `weeklyOffRules[0]` to decide the day.
When an org configures its weekend as **two separate rules** — e.g. "Sunday off" `[0]` and "Saturday off"
`[6]`, both at the default `priority: 0` — only one was honoured, and *which* one was decided by Postgres
heap/insertion order. On the day covered by the dropped rule, the employee was treated as working.

**Fix:** rules **tied at the top priority are unioned** (the day is off if any top-tier rule covers it),
while a **strictly higher-priority rule still fully overrides** lower ones. The override behaviour is
unchanged (e.g. a priority-10 "department works Saturdays" rule still suppresses a priority-5 company
Saturday-off); only the same-priority tie — previously nondeterministic — now combines deterministically.

### Bug 3 — cron re-fetches the profile per employee (LOW, perf only — NOT changed)

The cron eager-loads each employee's profile for the joining-date check but calls `_isHoliday` /
`_isWeeklyOff` without passing it, forcing a redundant profile fetch per employee. Once Bug 1 is fixed the
re-fetch returns the correct data, so this is a pure N+1 performance item, not a correctness issue. Left as
a documented follow-up to keep this change surgical.

## 3. What changed in the code

| File | Change |
|---|---|
| `attendance/services/clock.service.js` | `_getUserProfileArgs` reads `membership.user.*`; `_isWeeklyOff` and `_describeWeeklyOffRule` use top-priority-tier union |
| `attendance/services/holiday.service.js` | `getMyHolidays` reads `membership.user.*` |
| `leave/utils/leave_calculator.utils.js` | weekly-off check uses top-priority-tier union |
| `payroll/utils/calendar_resolver.utils.js` | weekly-off check uses top-priority-tier union |

All four weekly-off evaluators now apply the **same** precedence, so attendance status, leave deduction and
payroll LOP cannot disagree about whether a given day is a working day.

## 4. Behaviour / data impact for the frontend

- Employees on **targeted** weekly-off rules now correctly show `weekly_off` (not `absent`) on the HR,
  manager and employee panels, and the cron no longer marks them absent.
- Employees on **targeted holidays** now correctly show `holiday`, and `GET /attendance/holidays`
  (`getMyHolidays`) now returns department/location-targeted holidays that were previously missing.
- Orgs whose weekend is configured as two separate same-priority rules now get **both** days off
  everywhere (attendance, leave calculation, payroll LOP).
- Dashboard aggregate counts shift accordingly: affected members move from `absent` into `weekly_off` /
  `holiday` (and, on `hr/dashboard/live`, into `final_leave_count` rather than `final_absent_count`).

No status values, fields, query parameters or response shapes changed.

## 5. Operational follow-up (not performed here — requires DB access)

Attendance rows already written as `absent` with an `unauthorized_absence` anomaly on a **targeted**
weekly-off / holiday are historical bad data from Bug 1. A one-time cleanup should delete those rows and
their anomalies for affected dates. This is handed back to the operator — no cleanup script is run as part
of this change.

## 6. Tests

- `tests/unit/attendance/weekly_off_resolution.test.js` (new, 8 tests): `_getUserProfileArgs` reads the
  profile from `membership.user` (employee/manager/hr); `_isWeeklyOff` unions same-priority rules, preserves
  higher-priority override, respects a `working_day` exception.
- `tests/unit/payroll/calendar_resolver.test.js`: added a same-priority-union case; the existing
  higher-priority-override test still passes (override semantics preserved).
- Full unit suite: **2765 / 2765 passing**.
