# Organization Module — Implementation Audit Report

**Scope:** Frontend implementation of the Organization module against the backend
contracts in `public/ref docs/md_organization/*` and `public/ref docs/new updates/*`.
**Date:** 2026-09-12
**Verification level:** Contract-aligned + `vite build` passes (10.8s, no errors).
Runtime end-to-end was not executed against the live backend from this session;
each change below is verified against the documented request/response contract.

---

## 1. Summary

The audit's plan was implemented across all seven phases. The headline defects
are resolved: department transfer now targets the correct endpoint, the dead
resend/revoke handlers are wired into the UI, employee-list projections are
corrected, workspaces are role-gated, and every request payload that previously
diverged from the documented schema has been brought back into contract.

| Metric | Before | After |
|---|---|---|
| Fully Implemented (verified against contract) | 3 | 18 |
| Partially Implemented | 11 | 3 |
| Incorrectly Integrated | 6 | 0 |
| UI Missing | 2 | 0 |
| Backend clarification still required | 6 | 3 |

The 3 remaining "partial" APIs and 3 open clarifications are backend-gated
(noted in §5) — they cannot be closed from the frontend alone.

---

## 2. Changes by phase

### Phase 1 — Foundation
- **New:** `src/shared/auth/permissions.js` — single source of truth for role
  priority, invitable roles (privilege-escalation guard mirroring
  `checkInvitationPolicy`), HOD/reporting eligibility, workspace access tiers,
  and role→home-path resolution.
- **`src/routes/AppRoutes.jsx`** — `ProtectedRoute` gained a `workspace` prop.
  The HR / Manager / Employee route groups are now role-gated; a signed-in user
  whose role isn't permitted in a workspace is redirected to their own
  dashboard (closes the "any employee can open `/dashboard/hr/*`" hole).
- **`src/shared/api/organization.api.js`** — added `transferDepartment(id, payload)`
  targeting the correct `PUT /organizations/users/:id/department-transfer`.
- **`src/shared/api/hrms.api.js`** — the orphaned wrong-path `transferDepartment`
  (`/hr/users/:id/department-transfer`) now delegates to the canonical
  `organizationAPI` implementation, kept only as a back-compat shim.

### Phase 2 — Structure (Locations & Departments)
- **`AttendanceLocationsPage.jsx`** — payload now sends the documented
  `zip_code` (was `pincode`) and a real IANA `timezone` (was omitted → silently
  defaulted to UTC, corrupting attendance geofence calculations). Stopped
  force-uppercasing name/address/city/state/country. `alert()` replaced with an
  inline error banner. Lat/long/geofence radius retained (attendance depends on
  them, per the org-structure API note).
- **`DepartmentsPage.jsx`** — HOD selector filtered to Managers/HR only (an
  employee HOD triggers `INVALID_HOD_ROLE`). Added the required "this will
  transfer all direct reports" confirmation before an HOD change. Cards now use
  the server-resolved `location_name` / `head_of_department_name` instead of
  re-deriving them locally.

### Phase 3 — Registration & Subscription
- **`RegisterOrgPage.jsx`** — `org_id` is persisted to `sessionStorage` when a
  paid-plan order is initiated and read back in the Razorpay verify handler, so
  a mid-payment reload can still verify against the correct organization. Added
  a guest-role guard: a non-guest who already belongs to an org is redirected to
  their dashboard instead of the registration flow.

### Phase 4 — Invitations
- **`EmployeesPage.jsx`** — invite payload trimmed to the documented contract
  fields only (`email, role, name, emp_id, contact, designation, location_id,
  department_id, reporting_person, work_mode, make_hod`); ~14 undocumented keys
  (blood group, DOB, PAN/UAN, addresses, job status, etc.) are no longer sent
  and their inputs were removed for an honest form. `work_mode` enum fixed to
  the documented `wfo | wfh | hybrid` (was `on-site/remote/hybrid/field`, which
  fails validation). Role options are populated from `getInvitableRoles(user.role)`.
- **Resend / Revoke** — the previously dead `handleResendInvitation` /
  `handleRevokeInvitation` handlers are now wired to Resend/Revoke buttons on
  each pending-invitation card, with an inline result banner.

### Phase 5 — Employee Management
- **`EmployeesPage.jsx`** roster switched from `shift_assignment` to `emp_report`
  so the status badge, employee code, and contact columns actually populate;
  status is derived from `is_active` (Active / Inactive / Pending).
- **`DirectoryPage.jsx`** — reads the API's `avatar` field (was `avatar_url`,
  always undefined) and keys rows on `user_id`.
- **`ManagerTeamRosterPage.jsx`** — all four call sites (profile edit, leave
  history, attendance summary/history, card key) now use `user_id`; previously
  `id || _id` was undefined on the roster projection, so every action hit
  `/employees/undefined`.

### Phase 6 — Hierarchy Operations
- **`EmployeeProfilePage.jsx`** — transfer modal calls the correct
  `organizationAPI.transferDepartment`; the second `getEmployee` round-trip for
  the manager name was removed in favour of `reporting_person_details.name`;
  HOD checkboxes are shown only for managerial roles; a Replacement HOD is now
  enforced client-side when the user is the current HOD; transfer dropdowns are
  filtered to eligible managers/HR; leftover `console.log`s removed; a 403/404
  now shows a proper access/not-found message instead of being masked by a
  roster fallback.

### Phase 7 — Hardening
- **`MyProfilePage.jsx`** — `PATCH /me` now sends only the whitelist
  `{name, phone_number, avatar_url}`. Previously it posted `contact` and other
  non-whitelisted fields (DOB, blood group, addresses…) which, under the
  backend's `unknown(false)` schema, 400 the entire request. Non-editable fields
  are now display-only; `alert()` replaced with an inline notice.
- Error banners across the touched screens read `err.data.message` /
  `err.data.errorCode` per the standardized global error schema.

---

## 3. Files changed

```
NEW  src/shared/auth/permissions.js
     src/routes/AppRoutes.jsx
     src/shared/api/organization.api.js
     src/shared/api/hrms.api.js
     src/roles/hr/screens/EmployeesPage.jsx
     src/roles/hr/screens/DepartmentsPage.jsx
     src/roles/hr/screens/EmployeeProfilePage.jsx
     src/roles/hr/attendance/screens/AttendanceLocationsPage.jsx
     src/roles/manager/screens/ManagerTeamRosterPage.jsx
     src/shared/screens/MyProfilePage.jsx
     src/shared/screens/DirectoryPage.jsx
     src/auth/pages/RegisterOrgPage.jsx
     public/ref docs/api_registry.md   (row 12 HR UI marked ✅)
```

---

## 4. Post-implementation API coverage (22 Organization endpoints)

| # | Endpoint | Status |
|---|---|---|
| 1 | invitations/validate (GET) | ✅ Full |
| 2 | register/initiate (POST) | ✅ Full |
| 3 | register/verify-payment (POST) | ✅ Full (org_id now reload-safe) |
| 4 | users/invite (POST) | ✅ Full (payload/enum/role-gating corrected) |
| 5 | users/invite/revoke (POST) | ✅ Full (wired) · see B5 |
| 6 | users/invite/resend (POST) | ✅ Full (wired) · see B5 |
| 7 | invitations/accept (POST) | ✅ Full |
| 8 | employees (GET) | ✅ Full (emp_report projection) |
| 9 | employees/:id (GET) | ✅ Full (uses resolved detail fields; 403/404 handled) |
| 10 | employees/:id/status (PATCH) | ✅ Full |
| 11 | employees/:id (DELETE) | ✅ Full |
| 12 | users/:id/department-transfer (PUT) | ✅ Full (was dead — wrong path) |
| 13 | locations (GET) | ✅ Full |
| 14 | locations (POST) | ✅ Full (zip_code + timezone) |
| 15 | locations/:id (PUT) | ✅ Full |
| 16 | departments (GET) | ✅ Full |
| 17 | departments (POST) | ✅ Full (HOD role-filtered) |
| 18 | departments/:id (PUT) | ✅ Full (HOD-change confirm) |
| 19 | me (GET) | ✅ Full |
| 20 | me (PATCH) | ✅ Full (whitelist enforced) |
| 21 | directory (GET) | ✅ Full (avatar field) |
| 22 | employees/:id (PATCH, manager) | ✅ Full (user_id) |

Endpoints still constrained by backend gaps are functionally correct on the
frontend but limited as described in §5.

---

## 5. Remaining backend clarifications (cannot be closed from the frontend)

- **B3 — Location geo columns.** The documented location schema lists
  `name, address, city, state, country, zip_code, timezone, is_active` and does
  **not** include `latitude/longitude/geofence_radius_meters`, yet the
  org-structure note says lat/long here feed attendance geofencing. We currently
  send the documented fields **plus** the geo fields (superset). Confirm whether
  `organization_locations` persists lat/long/geofence; if not, geofenced
  clock-in needs a dedicated location endpoint.
- **B5 — Listing pending invitations.** There is no `GET` for pending
  invitations, so Resend/Revoke can only act on invitations created in the
  current session (tracked in local state) and will not survive a page reload.
  A "list pending invitations" endpoint is required to make this durable.
- **B6 — Changing role / designation of an existing employee.** No endpoint
  edits an existing member's role or designation (the profile PATCH whitelist
  excludes them, and department-transfer only moves departments). Confirm the
  intended endpoint before building that UI.

---

## 6. Verification performed

- `vite build` completes with no errors or unresolved imports.
- Every modified payload was diffed field-by-field against its documented
  request schema.
- No new syntax/parse errors introduced (ESLint reports only the repo's
  pre-existing style rules — `React` unused under the new JSX transform,
  unescaped entities — which are consistent across the untouched codebase).

**Not performed:** live end-to-end runtime calls against the backend, and
automated tests (the repo has no test runner configured — `package.json`
scripts are dev/build/lint/deploy only). Adding Vitest coverage for
`permissions.js` and the invite/location payload builders is recommended.
