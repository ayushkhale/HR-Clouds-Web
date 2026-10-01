# Organization Module — Code Review & Remediation Report

**Reviewer role:** Senior frontend review of the Organization-module implementation
**Date:** 2026-09-13
**Source of truth:** the phased implementation plan + `public/ref docs/md_organization/*`
and `public/ref docs/new updates/*`
**Scope:** the 12 files changed during implementation (see
`ORG_MODULE_IMPLEMENTATION_REPORT.md`)

**Outcome: 21 defects found, 21 fixed.** 4 were high severity, including one
silent **data-loss** bug and two **blank-screen** bugs. `vite build` passes;
ESLint reports no new errors.

---

## 1. High severity

### H1 — Manager profile edit silently wiped phone number and avatar
**`ManagerTeamRosterPage.jsx`** · data loss

The roster is fetched with `purpose=shift_assignment`, whose projection contains
no `phone_number` and no `avatar_url`. `EditProfileModal` seeded its form from
those missing fields (→ empty strings) and then unconditionally posted all three
values. A manager who opened the modal to correct a name would **erase that
report's stored phone number and avatar**.

*Fix:* the modal now loads the full record via `GET /employees/:id` before
editing (a manager is authorised for direct reports), tracks the loaded values
as a baseline, and sends **only fields that actually changed**. Submit is
disabled while loading, and a missing id is reported instead of producing a
`PATCH /employees/undefined`.

### H2 — Invite button and role selector disappeared for HR
**`EmployeesPage.jsx`** · feature unavailable

`getInvitableRoles(user?.role)` returned `[]` for any unrecognised input. `user`
is built from the JWT but then merged with the `authAPI.me()` response, which can
overwrite or drop `role`. With `invitableRoles` empty, the "Invite Member" button
was hidden entirely and the role `<select>` rendered with no options — HR loses
the ability to invite anyone.

*Fix:* read the authoritative `role` from `useAuth()` (set directly from the JWT)
with `user.role` as a secondary fallback, and default to the HR tier if the role
is still unknown so the page degrades open rather than closed — the backend
enforces the real policy regardless.

### H3 — Failed fetches rendered as "your organization is empty"
**`EmployeesPage.jsx`**, **`DepartmentsPage.jsx`**, **`AttendanceLocationsPage.jsx`** · blank screen

None of the three had a loading or error state. While in flight, and on any
failure, each rendered its *empty* state — "No personnel matching", "No
departments found.", "No locations found." An outage was indistinguishable from
a genuinely empty org, and there was no way to retry short of a page reload.

*Fix:* all three now render skeleton cards while loading, a dismissible error
banner with a **Try Again** button on failure, and three distinct empty
messages (error / no-search-match / genuinely-empty).

### H4 — Role gating could strand a user on a permanent spinner
**`AppRoutes.jsx`** · lockout

The new workspace gate redirected on `!canAccessWorkspace(role, workspace)`. A
token without a usable `role` claim normalises to `""`, matches no workspace, and
redirects to `dashboardPathForRole(null)` → `/dashboard`. `DashboardPage` then
navigates to `getDashboardPath(null)` → `/dashboard`, i.e. itself, leaving the
user on "Loading workspace…" forever with no route they can reach.

*Fix:* gate only when the role is actually known (`workspace && role && !allowed`).
Failing open is safe here because every request is still authorised server-side.

---

## 2. Medium severity

| # | File | Defect | Fix |
|---|---|---|---|
| M1 | `EmployeeProfilePage` | Manager row fell back to printing the raw `reporting_person` **UUID**, violating the "never expose internal UUIDs" constraint | Render the resolved name or `—`, never the id |
| M2 | `EmployeeProfilePage` | `department_head_details` was fetched but never displayed | Added a "Dept. Head" row |
| M3 | `EmployeeProfilePage` | `managerName` went stale after a transfer rewired the reporting line | Re-derive it from the post-transfer refetch |
| M4 | `EmployeeProfilePage` | Transfer modal accepted a submit with no department chosen (posted a meaningless `{role}` only) | Require a department (or explicit "Remove from department") |
| M5 | `EmployeeProfilePage` | Moving an employee into a department with **no HOD** and no manager is a guaranteed backend 400 | Validate against the target department's `head_of_department_id` first |
| M6 | `DepartmentsPage` | Clearing an HOD was a **silent no-op** — the field was only sent when truthy, so the user saw "updated successfully" with nothing changed | A department that has an HOD must be handed to a named successor; the blank option is withheld and the rule is explained inline |
| M7 | `DepartmentsPage` | A legacy HOD whose role no longer qualifies was filtered out of the options, so the `<select>` rendered blank and would **silently reassign** the HOD on save | Always include the currently-assigned HOD in the option list |
| M8 | `EmployeesPage` | Reporting-manager options were built from `all_hr_list`, which isn't documented to return `user_id`; those options would post an empty `reporting_person` | Prefer the `emp_report` roster (keyed on `user_id`) and drop any id-less entry; warn when no eligible manager exists |
| M9 | `EmployeesPage` | A locally-tracked pending invite and the real employee both rendered once the invite was accepted | Dedupe local invites against roster emails |
| M10 | `AttendanceLocationsPage` | Rendered literal `undefined` — "undefined meters" and "Mumbai, undefined" — because `GET /locations` only guarantees `id/name/city/is_active` | Null-guard the radius; join city/state with `filter(Boolean)` |
| M11 | `AttendanceLocationsPage` | `parseFloat(x) \|\| default` treats a valid `0` coordinate as missing; unparseable input became `NaN` → serialised to `null` | `Number.isFinite` checks plus range validation (-90/90, -180/180) before save |
| M12 | `MyProfilePage` | `res?.data \|\| res` spread the whole `{success, message}` envelope into profile state whenever the PATCH returned no `data` | Merge only the sent payload, then silently re-read the canonical record |
| M13 | *all touched fetches* | `if (res.success && res.data)` meant a response without an explicit `success: true` rendered **nothing at all**, silently | Switched to `Array.isArray(res?.data)` / explicit null-guards throughout |

---

## 3. Low severity

- **L1 `DirectoryPage`** — the error banner rendered *above* a "No members found"
  empty state, showing both at once. Error now replaces the grid and offers a retry;
  the empty copy distinguishes "no search match" from "directory is empty".
- **L2 `MyProfilePage`** — an empty name could be submitted, and values weren't
  trimmed (so whitespace-only edits counted as changes). Both fixed.
- **L3 `AttendanceLocationsPage`** — no save validation and no double-submit guard;
  the geocode search box kept a stale query across modal opens, and `loc.name`
  could be `undefined` on a controlled input. All fixed.
- **L4 `EmployeeProfilePage`** — the transfer modal gave no feedback when zero
  eligible managers/HR exist; it now says so explicitly.
- **L5** Removed dead imports left over from the implementation pass.

### Caught by lint during this review, before commit
Two `react/jsx-no-undef` crashes: `HiCalendar` (pre-existing, in the roster's
leave-history empty state) and `HiOutlineLocationMarker` (introduced by my own
M-series card fix). Both would have thrown a `ReferenceError` on render. Fixed.

---

## 4. "Is every API's data actually rendered?"

| Endpoint | Consumed by | Rendered? |
|---|---|---|
| `GET /employees?purpose=emp_report` | EmployeesPage roster | ✅ name, email, role, status, employee_code, avatar, **designation, department, contact** (last three added in this review) |
| `GET /employees?purpose=all_hr_list` | Reporting dropdown | ✅ as options (now id-guarded) |
| `GET /employees?purpose=shift_assignment` | Departments HOD picker, transfer modal, manager roster | ✅ — roster card now also shows **work_location** and **work_mode**, which were fetched and discarded |
| `GET /employees/:id` | EmployeeProfilePage, roster edit modal | ✅ incl. `reporting_person_details` and **`department_head_details`** (added); `is_active` now shown as a **status badge** rather than only implied by a menu label |
| `PATCH /employees/:id/status` | Profile actions | ✅ optimistic update + visible badge |
| `DELETE /employees/:id` | Profile actions | ✅ navigates back to roster |
| `PUT /users/:id/department-transfer` | Transfer modal | ✅ success toast + refetch of department *and* manager |
| `GET/POST/PUT /locations` | Locations page | ✅ name, address, city, state, radius, is_active (null-guarded) |
| `GET/POST/PUT /departments` | Departments page | ✅ name, description, is_active, `location_name`, `head_of_department_name` |
| `GET /me`, `PATCH /me` | MyProfilePage | ✅ personal / org / address groups; only whitelisted fields editable |
| `GET /directory` | DirectoryPage | ✅ all 7 documented public-safe fields |
| `POST /users/invite[/resend\|/revoke]` | EmployeesPage | ✅ inline result banner; pending cards expose both actions |

**Two notes worth raising with the backend**, both consequences of the available
projections rather than frontend choices:

1. `emp_report` is the *only* documented projection that returns `is_active`,
   `contact` and `employee_code` together, so the HR roster must over-fetch 30+
   fields (including PAN/UAN/DOB) to render a summary card. A documented shape
   for `purpose=general` — identity + status + department, no tax identifiers —
   would let the list stop pulling sensitive data it never displays.
2. For managers the backend applies its roster-safe projection *regardless* of
   the `purpose` sent, so the exact field set a manager receives is unspecified.
   The roster now renders every field defensively (`emp.x && …`) rather than
   assuming, but a documented manager projection would remove the guesswork.

---

## 5. Verification

- `npx vite build` — passes (10.6s), no unresolved imports.
- `npx eslint` on all 12 touched files — **no new errors**. Remaining output is
  the repo-wide pre-existing style set (`React` unused under the new JSX
  transform, unescaped entities) plus 3 intentional `exhaustive-deps` warnings.
- Every changed request payload re-diffed field-by-field against its documented
  schema.

**Not performed / still open:**
- No live end-to-end run against the backend from this session. Response-shape
  assumptions are handled defensively but not empirically confirmed — in
  particular whether `all_hr_list` returns `user_id` (M8) and what a manager's
  roster-safe projection contains.
- No automated tests: the repo has no test runner (`package.json` has only
  dev/build/lint/deploy). The highest-value first targets are `permissions.js`
  (pure logic), the invite/location payload builders, and the changed-fields-only
  diff in H1 — the exact logic that prevents the data-loss regression.
- Backend clarifications **B3** (location geo columns), **B5** (no endpoint to
  list pending invitations — so resend/revoke only reach invites created in the
  current session) and **B6** (no endpoint to change role/designation) remain
  open and are unchanged by this review.
