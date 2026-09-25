# HRMS System API Registry

This matrix provides a comprehensive mapping of every API endpoint in the system to its functionality, security boundaries, and source code files. It serves as a master index for developers to quickly understand system capabilities and trace the execution path of any request.

> **Dashboard column:** Indicates which dashboard(s) the endpoint belongs to. Values are restricted to `hr`, `manager`, and `employee` (combined when an endpoint is surfaced on more than one dashboard). `admin` / `super-admin` roles are treated as part of the `hr` (administration) dashboard; `guest` onboarding flows that create/administer the org are attributed to `hr`.

> **UI columns (Employee / HR / Manager):** ✅ means a screen in that workspace calls the endpoint — traced from the routes in `src/routes/AppRoutes.jsx` through each screen's imports to the `src/shared/api/*.api.js` function (verified 2026-09-22). Self-service screens mounted in more than one workspace (e.g. My Salary, My Reimbursements) are ticked in each; pre-login pages (login, signup, invitation) are ticked in all three. A row with no tick has a client function but no screen yet; `n/a` rows have no UI by design.

## Authentication Module

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/auth/signup` | POST | No | N/A | hr, manager, employee | Initiates the guest user signup and OTP generation process. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/auth/signup/verify` | POST | No | N/A | hr, manager, employee | Verifies the OTP sent during signup and completes the registration. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/auth/login` | POST | No | N/A | hr, manager, employee | Authenticates a user with email/password and returns a selection token if multiple orgs exist. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/auth/select-organization` | POST | Yes | N/A (Selection Token) | hr, manager, employee | Exchanges an org selection token for full access/refresh tokens for a specific org. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/auth/switch-organization` | POST | Yes | Any | hr, manager, employee | Allows an already authenticated user to switch their active organization context. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 6 | `/api/v1/auth/forgot-password` | POST | No | N/A | hr, manager, employee | Initiates the password reset process by generating and sending an OTP to the user's email. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 7 | `/api/v1/auth/forgot-password/verify` | POST | No | N/A | hr, manager, employee | Verifies the forgot password OTP and updates the user's password. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/auth/otp/resend` | POST | No | N/A | hr, manager, employee | Resends a new OTP to the user's email for signup or password reset flows. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/auth/google` | POST | No | N/A | hr, manager, employee | Handles Google OAuth sign-in, creating a user if they don't exist and returning tokens. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 10 | `/api/v1/auth/health` | GET | No | N/A | hr, manager, employee | Simple health check endpoint to verify the auth service is running. | `health.routes.js` | N/A | N/A | n/a | n/a | n/a |  <!-- no UI: Infrastructure health probe. No UI by design. -->

## Organization Module

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/organizations/invitations/validate` | GET | No | N/A | hr, manager, employee | Validates an invitation token before accepting it. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/organizations/register/initiate` | POST | Yes | `guest` | hr | Initiates the creation of a new organization and handles free/paid plan logic. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 3 | `/api/v1/organizations/register/verify-payment` | POST | Yes | `guest` | hr | Verifies a Razorpay payment signature and activates the organization's paid subscription. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 4 | `/api/v1/organizations/users/invite` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Sends an email invitation to a new or existing user to join the organization. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ✅ ] | [ ] |
| 5 | `/api/v1/organizations/users/invite/revoke` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Revokes a pending invitation to prevent the user from joining the organization. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ✅ ] | [ ] |
| 6 | `/api/v1/organizations/users/invite/resend` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Resends the invitation email to a pending user. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ✅ ] | [ ] |
| 7 | `/api/v1/organizations/invitations/accept` | POST | Optional | N/A | hr, manager, employee | Accepts an organization invitation and provisions the user profile inside the tenant. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/organizations/employees` | GET | Yes | `super-admin, admin, hr, manager` | hr, manager | Employee list. HR/admin: whole org (purpose-driven). Managers are hierarchy-scoped server-side to their direct reports and receive a roster-safe projection (no PAN/UAN/address/DOB/personal_email). Optional `search`/`department_id`/`include_inactive` filters. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/organizations/employees/:id` | GET | Yes | `super-admin, admin, hr, manager` | hr, manager | Detailed employee profile. Managers may only read their own record or a direct report's — cross-team ids return 403 (BOLA/IDOR guard, scope checked before existence). HR/admin unrestricted. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 10 | `/api/v1/organizations/employees/:id/status` | PATCH | Yes | `super-admin, admin, hr` | hr | Activates or deactivates an employee's access to the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 11 | `/api/v1/organizations/employees/:id` | DELETE | Yes | `super-admin, admin, hr` | hr | Soft-deletes an employee and removes their reporting mappings. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 12 | `/api/v1/organizations/users/:id/department-transfer` | PUT | Yes | `super-admin, admin, hr` | hr | Transfers an employee to a new department and updates reporting hierarchies. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 13 | `/api/v1/organizations/locations` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a list of all geographical office locations for the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 14 | `/api/v1/organizations/locations` | POST | Yes | `super-admin, admin, hr` | hr | Creates a new office location for the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 15 | `/api/v1/organizations/locations/:id` | PUT | Yes | `super-admin, admin, hr` | hr | Updates details of an existing office location. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 16 | `/api/v1/organizations/departments` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a list of all departments in the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 17 | `/api/v1/organizations/departments` | POST | Yes | `super-admin, admin, hr` | hr | Creates a new department and optionally assigns a Head of Department. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 18 | `/api/v1/organizations/departments/:id` | PUT | Yes | `super-admin, admin, hr` | hr | Updates an existing department and manages HOD reporting line swaps. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ✅ ] | [ ] |
| 19 | `/api/v1/organizations/me` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches the logged-in user's own full profile (reuses the employee-detail view scoped to self). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 20 | `/api/v1/organizations/me` | PATCH | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Updates the logged-in user's own personal fields (whitelisted; department/designation/gender/marital_status/employee_code locked). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 21 | `/api/v1/organizations/directory` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a public-safe employee directory (name, email, avatar, role, department, designation, work location only). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 22 | `/api/v1/organizations/employees/:id` | PATCH | Yes | `super-admin, admin, hr, manager` | hr, manager | Edits a team member's personal profile fields (whitelisted, same set as self-service). Managers are hierarchy-scoped to direct reports (cross-team id → 403); self-edits are rejected (use `/me`). Role/department/designation/employee_code and leave-gate demographics are not editable here. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ✅ ] |
| 23 | `/api/v1/organizations/users/invite` | GET | Yes | `hr, manager` | hr | Lists invitations with a status derived on read (pending / accepted / revoked / expired), send count, last sent, expiry and email delivery outcome. HR sees the whole org; a manager sees only invitations they sent. Filters: status (repeatable), q, role, department_id, limit, offset — unknown keys are dropped. Needs migration 00052 (500 until applied). | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ✅ ] | [ ] |

## Attendance Module - Employee Self-Service

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/today` | GET | Yes | `all` | hr, manager, employee | Fetches the authenticated user's live attendance status for today. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ] | [ ✅ ] |
| 2 | `/api/v1/attendance/history` | GET | Yes | `all` | hr, manager, employee | Fetches the user's historical attendance records with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/attendance/summary` | GET | Yes | `all` | hr, manager, employee | Fetches the user's aggregated monthly attendance summary (total present, late, etc). | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/attendance/shift` | GET | Yes | `all` | hr, manager, employee | Fetches the user's currently active assigned shift details. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ] | [ ✅ ] |
| 5 | `/api/v1/attendance/clock-in` | POST | Yes | `all` | hr, manager, employee | Records a clock-in punch and validates GPS geofencing rules. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ] | [ ✅ ] |
| 6 | `/api/v1/attendance/clock-out` | POST | Yes | `all` | hr, manager, employee | Records a clock-out punch and triggers the payroll hours calculation engine. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ] | [ ✅ ] |
| 7 | `/api/v1/attendance/break/start` | POST | Yes | `all` | hr, manager, employee | Records the start of a designated break period. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ] | [ ✅ ] |
| 8 | `/api/v1/attendance/break/end` | POST | Yes | `all` | hr, manager, employee | Records the end of a break period and updates total break duration. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ] | [ ✅ ] |
| 9 | `/api/v1/attendance/regularization` | POST | Yes | `all` | hr, manager, employee | Submits a request to retroactively modify an attendance record's timestamps. | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 10 | `/api/v1/attendance/regularizations` | GET | Yes | `all` | hr, manager, employee | Fetches a list of the user's submitted regularization requests and their statuses. | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 11 | `/api/v1/attendance/daily-log` | GET | Yes | `all` | hr, manager, employee | Fetches the user's detailed minute-by-minute punch logs for a specific day. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 12 | `/api/v1/attendance/graph-data` | GET | Yes | `all` | hr, manager, employee | Fetches time-series data for rendering the user's attendance trends chart. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ✅ ] | [ ] | [ ] |
| 13 | `/api/v1/attendance/trends` | GET | Yes | `all` | hr, manager, employee | Fetches aggregated trend insights regarding the user's punctuality and hours. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |  <!-- no UI yet: attendanceAPI.getTrends exists in the API layer but no screen calls it. -->
| 14 | `/api/v1/attendance/weekly-calendar` | GET | Yes | `all` | hr, manager, employee | Fetches the user's attendance status mapped to a 7-day weekly calendar view. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |  <!-- no UI yet: attendanceAPI.getWeeklyCalendar exists in the API layer but no screen calls it. -->
| 15 | `/api/v1/attendance/holidays` | GET | Yes | `all` | hr, manager, employee | Fetches the list of upcoming organizational holidays applicable to the user. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `holiday.service.js` | [ ✅ ] | [ ] | [ ] |
| 16 | `/api/v1/attendance/regularizations/:id/cancel` | POST | Yes | `all` | hr, manager, employee | Withdraws the user's own pending regularization request (self-scoped, row-locked, rejects already-processed requests). | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 17 | `/api/v1/attendance/overtime/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own overtime requests with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `overtime.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 18 | `/api/v1/attendance/anomalies/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own attendance anomalies, filterable by status (open/resolved/all). | `user_attendance.routes.js` | `user_attendance.controller.js` | `anomaly.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 19 | `/api/v1/attendance/comp-offs/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own compensatory-off requests with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `comp_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 20 | `/api/v1/attendance/comp-offs/mine/summary` | GET | Yes | `all` | hr, manager, employee | Fetches the user's aggregated comp-off balance summary. | `user_attendance.routes.js` | `user_attendance.controller.js` | `comp_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Attendance Module - Manager Operations

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/manager/team/today` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches the live daily attendance status of all subordinates reporting to the manager. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `team.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/attendance/manager/team/history` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches historical attendance records for the manager's team. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `team.service.js` | n/a | n/a | n/a |  <!-- no UI: Deliberately NOT called — unbounded, ignores every query param (contract §8.1). The Team History page is driven off /team/member/:userId/history instead. -->
| 3 | `/api/v1/attendance/manager/team/anomalies` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches unresolved system-generated anomalies (like GPS breaches) for the team. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `anomaly.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/attendance/manager/anomalies/:id/resolve` | POST | Yes | `manager, hr, admin` | manager, hr | Allows a manager to manually resolve and dismiss a subordinate's attendance anomaly. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `anomaly.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/attendance/manager/regularizations/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending regularization requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 6 | `/api/v1/attendance/manager/regularizations/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a regularization request and forces a recalculation of payroll hours. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 7 | `/api/v1/attendance/manager/regularizations/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's regularization request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/attendance/manager/overtime/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending overtime requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/attendance/manager/overtime/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a subordinate's overtime request for payroll processing. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 10 | `/api/v1/attendance/manager/overtime/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's overtime request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 11 | `/api/v1/attendance/manager/comp-offs/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending compensatory-off requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 12 | `/api/v1/attendance/manager/comp-offs/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a subordinate's comp-off request and credits their leave balance. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 13 | `/api/v1/attendance/manager/comp-offs/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's comp-off request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 14 | `/api/v1/attendance/manager/team/summary` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches aggregated attendance summaries for the entire team over a specific period. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 15 | `/api/v1/attendance/manager/team/member/:userId/history` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches detailed attendance history for a specific subordinate. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 16 | `/api/v1/attendance/manager/team/member/:userId/summary` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches the attendance summary metrics for a specific subordinate. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 17 | `/api/v1/attendance/manager/team/graph-data` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches time-series data for rendering the manager's team attendance trends chart. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 18 | `/api/v1/attendance/manager/team/member/:userId/daily-log` | GET | Yes | `manager, hr, admin, super-admin` | manager | One report's enriched day (sessions, breaks, shift) — same shape as the HR daily-log reads. `date` defaults to today (IST). 403 `EMPLOYEE_NOT_IN_TEAM` outside the manager's team. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ✅ ] |

## Attendance Module - HR Administration

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/hr/policies` | POST | Yes | `hr, admin` | hr | Creates a new organizational policy defining grace periods and half-day rules. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 2 | `/api/v1/attendance/hr/policies` | GET | Yes | `hr, admin` | hr | Fetches a list of all attendance policies defined in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/attendance/hr/policies/:id` | GET | Yes | `hr, admin` | hr | Fetches details for a specific attendance policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 4 | `/api/v1/attendance/hr/policies/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing attendance policy's rules and thresholds. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 5 | `/api/v1/attendance/hr/policies/:id/deactivate` | PATCH | Yes | `hr, admin` | hr | Deactivates an attendance policy, preventing future assignments. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 6 | `/api/v1/attendance/hr/shifts/assign` | POST | Yes | `hr, admin` | hr | Assigns an employee to a specific shift schedule or rotation pattern. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 7 | `/api/v1/attendance/hr/shifts/assignments` | GET | Yes | `hr, admin` | hr | Fetches a ledger of historical and active shift assignments. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 8 | `/api/v1/attendance/hr/shifts/assignments/:assignment_id` | DELETE | Yes | `hr, admin` | hr | Hard-deletes a shift assignment record. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 9 | `/api/v1/attendance/hr/shifts/assignments/:assignment_id/end` | POST | Yes | `hr, admin` | hr | Closes an active shift assignment by setting its end date. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 10 | `/api/v1/attendance/hr/shifts` | POST | Yes | `hr, admin` | hr | Creates a new shift template defining start times and work hours. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 11 | `/api/v1/attendance/hr/shifts` | GET | Yes | `hr, admin` | hr | Fetches all shift templates defined in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 12 | `/api/v1/attendance/hr/shifts/:id` | GET | Yes | `hr, admin` | hr | Fetches details for a specific shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 13 | `/api/v1/attendance/hr/shifts/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 14 | `/api/v1/attendance/hr/shifts/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ✅ ] | [ ] |
| 15 | `/api/v1/attendance/hr/rotations` | POST | Yes | `hr, admin` | hr | Creates a complex repeating shift pattern (e.g., 5 days morning, 2 days off). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ] | [ ✅ ] | [ ] |
| 16 | `/api/v1/attendance/hr/rotations` | GET | Yes | `hr, admin` | hr | Fetches all rotation patterns in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ] | [ ✅ ] | [ ] |
| 17 | `/api/v1/attendance/hr/rotations/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a rotation pattern. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ] | [ ✅ ] | [ ] |
| 18 | `/api/v1/attendance/hr/holidays` | POST | Yes | `hr, admin` | hr | Creates a new organization-wide or location-specific holiday. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ✅ ] | [ ] |
| 19 | `/api/v1/attendance/hr/holidays` | GET | Yes | `hr, admin` | hr | Fetches all configured holidays for the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ✅ ] | [ ] |
| 20 | `/api/v1/attendance/hr/holidays/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing holiday's details. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ✅ ] | [ ] |
| 21 | `/api/v1/attendance/hr/holidays/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a configured holiday. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ✅ ] | [ ] |
| 22 | `/api/v1/attendance/hr/weekly-offs` | POST | Yes | `hr, admin` | hr | Creates a rule defining default rest days (e.g., Saturdays and Sundays). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 23 | `/api/v1/attendance/hr/weekly-offs` | GET | Yes | `hr, admin` | hr | Fetches all weekly off rules. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 24 | `/api/v1/attendance/hr/weekly-offs/:id` | PUT | Yes | `hr, admin` | hr | Updates a weekly off rule. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 25 | `/api/v1/attendance/hr/weekly-offs/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a weekly off rule. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 26 | `/api/v1/attendance/hr/devices` | POST | Yes | `hr, admin` | hr | Registers a biometric hardware device and generates its secure API key. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 27 | `/api/v1/attendance/hr/devices` | GET | Yes | `hr, admin` | hr | Fetches a list of all registered biometric devices. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 28 | `/api/v1/attendance/hr/devices/:id` | PUT | Yes | `hr, admin` | hr | Updates biometric device configuration details. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 29 | `/api/v1/attendance/hr/devices/:id` | DELETE | Yes | `hr, admin` | hr | Deactivates and deletes a registered biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 30 | `/api/v1/attendance/hr/devices/:id/mappings` | POST | Yes | `hr, admin` | hr | Links an employee ID from HRMS to an internal hardware user ID on a device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 31 | `/api/v1/attendance/hr/devices/:id/mappings` | GET | Yes | `hr, admin` | hr | Fetches all employee mappings for a specific biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 32 | `/api/v1/attendance/hr/devices/:id/mappings/:mappingId` | DELETE | Yes | `hr, admin` | hr | Removes a mapping linking an employee to a biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ✅ ] | [ ] |
| 33 | `/api/v1/attendance/hr/comp-off-policies` | POST | Yes | `hr, admin` | hr | Creates rules defining how extra hours are converted into comp-off leave balances. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 34 | `/api/v1/attendance/hr/comp-off-policies` | GET | Yes | `hr, admin` | hr | Fetches all comp-off policies. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 35 | `/api/v1/attendance/hr/comp-off-policies/:id` | PUT | Yes | `hr, admin` | hr | Updates a comp-off policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 36 | `/api/v1/attendance/hr/comp-off-policies/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a comp-off policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ✅ ] | [ ] |
| 37 | `/api/v1/attendance/hr/comp-offs` | GET | Yes | `hr, admin` | hr | Fetches all comp-off requests across the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 38 | `/api/v1/attendance/hr/comp-offs/:id/approve` | POST | Yes | `hr, admin` | hr | HR endpoint to override and manually approve a comp-off request. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 39 | `/api/v1/attendance/hr/comp-offs/:id/reject` | POST | Yes | `hr, admin` | hr | HR endpoint to override and manually reject a comp-off request. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ✅ ] | [ ] |
| 40 | `/api/v1/attendance/hr/locks` | GET | Yes | `hr, admin` | hr | Fetches all payroll lock periods. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ] | [ ✅ ] | [ ] |
| 41 | `/api/v1/attendance/hr/locks` | POST | Yes | `hr, admin` | hr | Creates a payroll lock period to freeze historical attendance modifications. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ] | [ ✅ ] | [ ] |
| 42 | `/api/v1/attendance/hr/locks/:id` | DELETE | Yes | `hr, admin` | hr | Removes a payroll lock period to allow backdated corrections. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ] | [ ✅ ] | [ ] |
| 43 | `/api/v1/attendance/hr/records/recompute-stale` | POST | Yes | `hr, admin` | hr | Maintenance sweep that recomputes attendance records stuck in `in_progress` despite having a clock-out (optional single-day scope). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `clock.service.js` | [ ] | [ ✅ ] | [ ] |
| 44 | `/api/v1/attendance/hr/reports/daily` | GET | Yes | `hr, admin` | hr | Generates flattened JSON arrays containing daily attendance data for CSV export. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ] | [ ✅ ] | [ ] |
| 45 | `/api/v1/attendance/hr/reports/monthly` | GET | Yes | `hr, admin` | hr | Generates flattened JSON arrays containing monthly consolidated attendance data. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ] | [ ✅ ] | [ ] |
| 46 | `/api/v1/attendance/hr/reports/employee/:userId` | GET | Yes | `hr, admin` | hr | Generates flattened attendance reports for a single specific employee. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ] | [ ✅ ] | [ ] |
| 47 | `/api/v1/attendance/hr/hrs/attendance` | GET | Yes | `hr, manager` | hr, manager | Fetches attendance data for HR team members. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 48 | `/api/v1/attendance/hr/hrs/:userId/attendance` | GET | Yes | `hr, manager` | hr, manager | Fetches history for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 49 | `/api/v1/attendance/hr/hrs/:userId/summary` | GET | Yes | `hr, manager` | hr, manager | Fetches summary for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 50 | `/api/v1/attendance/hr/hrs/:userId/daily-log` | GET | Yes | `hr, manager` | hr, manager | Fetches daily log for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 51 | `/api/v1/attendance/hr/employees/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching organization-wide employee attendance lists. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 52 | `/api/v1/attendance/hr/employees/:userId/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching deep history for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 53 | `/api/v1/attendance/hr/employees/:userId/summary` | GET | Yes | `hr, admin` | hr | HR endpoint fetching summary metrics for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 54 | `/api/v1/attendance/hr/employees/:userId/daily-log` | GET | Yes | `hr, admin` | hr | HR endpoint fetching detailed daily logs for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 55 | `/api/v1/attendance/hr/managers/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching organization-wide manager attendance lists. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 56 | `/api/v1/attendance/hr/managers/:userId/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching history for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 57 | `/api/v1/attendance/hr/managers/:userId/summary` | GET | Yes | `hr, admin` | hr | HR endpoint fetching summary metrics for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 58 | `/api/v1/attendance/hr/managers/:userId/daily-log` | GET | Yes | `hr, admin` | hr | HR endpoint fetching detailed daily logs for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 59 | `/api/v1/attendance/hr/dashboard/live` | GET | Yes | `hr, admin` | hr | Provides real-time organization-wide metrics (Present, Absent, Late) for the HR dashboard. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 60 | `/api/v1/attendance/hr/dashboard/graph-data` | GET | Yes | `hr, admin` | hr | Provides time-series chart data for the HR dashboard over the past 30 days. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 61 | `/api/v1/attendance/hr/dashboard/department-summary` | GET | Yes | `hr, admin` | hr | Aggregates attendance statistics grouped by department for organizational insights. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 62 | `/api/v1/attendance/hr/dashboard/top-defaulters` | GET | Yes | `hr, admin` | hr | Identifies employees with the highest late minutes or missing punches across the organization. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |  <!-- no UI yet: attendanceAPI.getTopDefaulters exists in the API layer but no screen calls it. -->
| 63 | `/api/v1/attendance/hr/dashboard/work-mode-distribution` | GET | Yes | `hr, admin` | hr | Returns a breakdown of Remote vs Office vs Hybrid clock-ins for today. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |  <!-- no UI yet: attendanceAPI.getWorkModeDistribution exists in the API layer but no screen calls it. -->

## Attendance Module - Hardware Integrations

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/devices/webhook` | POST | Yes | Custom API Key | hr | Secure endpoint for physical biometric hardware to push real-time attendance punches to the backend. | `device_webhook.routes.js` | `device_webhook.controller.js` | `device.service.js` | n/a | n/a | n/a |  <!-- no UI: Machine-to-machine: biometric devices POST here directly. No UI by design (Phase 8). -->

## Leave Module - Foundation & Rules Engine

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/types` | POST | Yes | `hr, admin, super-admin` | hr | Creates a global category of leave (e.g., Sick Leave). | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 2 | `/api/v1/leaves/types` | GET | Yes | `hr, admin, super-admin` | hr | Fetches all global leave types. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 3 | `/api/v1/leaves/types/:id` | PUT | Yes | `hr, admin, super-admin` | hr | Edits an existing leave type. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 4 | `/api/v1/leaves/types/:id` | DELETE | Yes | `hr, admin, super-admin` | hr | Soft-deletes a leave type from active use. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 5 | `/api/v1/leaves/templates` | POST | Yes | `hr, admin, super-admin` | hr | Creates a new Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 6 | `/api/v1/leaves/templates` | GET | Yes | `hr, admin, super-admin` | hr | Fetches all Policy Templates. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 7 | `/api/v1/leaves/templates/:id` | PUT | Yes | `hr, admin, super-admin` | hr | Updates an existing Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 8 | `/api/v1/leaves/templates/:id` | DELETE | Yes | `hr, admin, super-admin` | hr | Deletes a Policy Template and its entitlements. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 9 | `/api/v1/leaves/templates/:id/entitlements` | POST | Yes | `hr, admin, super-admin` | hr | Adds an entitlement (quota rule) to a Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 10 | `/api/v1/leaves/templates/:id/entitlements/:entitlementId` | PUT | Yes | `hr, admin, super-admin` | hr | Updates an existing entitlement in a template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |
| 11 | `/api/v1/leaves/templates/:id/entitlements/:entitlementId` | DELETE | Yes | `hr, admin, super-admin` | hr | Deletes an entitlement from a template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ✅ ] | [ ] |

## Leave Module - Policy Assignment & Balance Engine

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/users/:userId/assign-policy` | POST | Yes | `hr, admin, super-admin` | hr | Assigns a Leave Policy Template to an employee. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_assignment.service.js` | [ ] | [ ✅ ] | [ ] |
| 2 | `/api/v1/leaves/users/:userId/configs/:leaveTypeId` | PUT | Yes | `hr, admin, super-admin` | hr | Overrides specific leave rules for a single leave type for a specific employee. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_assignment.service.js` | [ ] | [ ✅ ] | [ ] |
| 3 | `/api/v1/leaves/users/:userId/balances` | GET | Yes | `hr, admin, super-admin` | hr | Fetches the leave wallet (ledger) for an employee (Admin). | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_balance.service.js` | [ ] | [ ✅ ] | [ ] |
| 4 | `/api/v1/leaves/my-balances` | GET | Yes | `all` | hr, manager, employee | Fetches the logged-in employee's own leave wallet. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_balance.service.js` | [ ✅ ] | [ ] | [ ] |
| 5 | `/api/v1/leaves/my-leave-types` | GET | Yes | `all` | hr, manager, employee | Fetches the leave types applicable to the logged-in employee (apply-form catalog with their per-user config). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_balance.service.js` | [ ✅ ] | [ ] | [ ] |

## Leave Module - Employee Application (Phase 3)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/request` | POST | Yes | `all` | hr, manager, employee | Submits a new leave application and deducts tentative balance. Since Documents Phase 5 it also takes an optional `document_id` — one of the applicant's own documents in `available` or `pending_verification` — and stores it as the audience-neutral path `/api/v1/documents/attachments/:id/view-url` in `document_url` (see #128). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ✅ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/my-requests` | GET | Yes | `all` | hr, manager, employee | Fetches the logged-in employee's historical leave applications. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ✅ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/requests/:id/cancel` | POST | Yes | `all` | hr, manager, employee | Cancels a pending or upcoming leave request and refunds the balance. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ✅ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/requests/:id` | GET | Yes | `all` | hr, manager, employee | Fetches a single one of the logged-in employee's own leave requests by ID (ownership enforced in query predicate). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_self.controller.js` (inline) | [ ✅ ] | [ ] | [ ] |

## Leave Module - Approvals & Management (Phase 3)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/team/requests/pending` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | Fetches pending leave requests for direct reports (or global queue for HR). | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/leaves/requests/:id/approve` | POST | Yes | `manager, hr, admin, super-admin` | manager, hr | Approves a leave request, locking the balance deduction and notifying systems. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/leaves/requests/:id/reject` | POST | Yes | `manager, hr, admin, super-admin` | manager, hr | Rejects a leave request and refunds the previously held balance. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/leaves/team/requests` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | Team leave history (any status). Hierarchy-scoped to reports for managers, org-wide for HR. Optional `status`/`user_id` filters (a manager's `user_id` filter is validated against their scope — BOLA guard) with bounded pagination (`page`, `limit`). | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approver.controller.js` | [ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/leaves/team/member/:userId/requests` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | A single team member's leave history. Manager may only target a direct report (cross-team id → 403). Optional `status` filter + pagination. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approver.controller.js` | [ ] | [ ] | [ ✅ ] |
| 6 | `/api/v1/leaves/team/member/:userId/balances` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | A single team member's leave balances (the wallet needed at approval time). Manager may only target a direct report (cross-team id → 403). Optional `year`. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_balance.service.js` | [ ] | [ ✅ ] | [ ✅ ] |

## Leave Module - Automation & Maintenance (Phase 5)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/automation/accrual/run` | POST | Yes | `hr, admin, super-admin` | hr | Manually triggers the monthly accrual calculation and ledger credit for the organization. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_accrual.service.js` | [ ] | [ ✅ ] | [ ] |
| 2 | `/api/v1/leaves/automation/rollover/run` | POST | Yes | `hr, admin, super-admin` | hr | Manually triggers the year-end balance rollover, carry-forward, and initialization for the organization. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_rollover.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - HR Administration (Phase 1)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These routes allow **`hr` only** — `admin`/`super-admin` are platform-plane roles and are deliberately excluded, making Payroll the strictest module in the product. A platform token is stopped by `requireFeature` (`400 MISSING_ORG_CONTEXT`) before the role gate is even reached.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/payroll/hr/components/bootstrap` | POST | Yes | `hr` | hr | Idempotent seed of the default component catalog; inserts only missing `code`s and returns `{ created[], skipped[] }`. Audit-logged. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ✅ ] | [ ] |
| 2 | `/api/v1/payroll/hr/components` | POST | Yes | `hr` | hr | Creates a custom salary component (forced `is_system = false`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ✅ ] | [ ] |
| 3 | `/api/v1/payroll/hr/components` | GET | Yes | `hr` | hr | Lists components; filters `is_active`, `component_type` (validated in controller — Express 5). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ✅ ] | [ ] |
| 4 | `/api/v1/payroll/hr/components/:id` | GET | Yes | `hr` | hr | Fetches a single component. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ✅ ] | [ ] |
| 5 | `/api/v1/payroll/hr/components/:id` | PUT | Yes | `hr` | hr | Updates a component. System rows: `code`/`component_type`/`calculation_type` immutable → `409 SYSTEM_COMPONENT_IMMUTABLE`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ✅ ] | [ ] |
| 6 | `/api/v1/payroll/hr/components/:id` | DELETE | Yes | `hr` | hr | Deactivates (never hard-deletes). `409 COMPONENT_IN_USE` if referenced by an active template or any approved structure. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ✅ ] | [ ] |
| 7 | `/api/v1/payroll/hr/structure-templates` | POST | Yes | `hr` | hr | Creates a salary structure template (blueprint). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 8 | `/api/v1/payroll/hr/structure-templates` | GET | Yes | `hr` | hr | Lists templates with their components and catalog names eager-loaded. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 9 | `/api/v1/payroll/hr/structure-templates/:id` | GET | Yes | `hr` | hr | Fetches a single template with components. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 10 | `/api/v1/payroll/hr/structure-templates/:id` | PUT | Yes | `hr` | hr | Updates a template. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 11 | `/api/v1/payroll/hr/structure-templates/:id` | DELETE | Yes | `hr` | hr | Deactivates a template. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 12 | `/api/v1/payroll/hr/structure-templates/:id/components` | POST | Yes | `hr` | hr | Adds a component to a template; rejects a duplicate `component_id` (`409`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 13 | `/api/v1/payroll/hr/structure-templates/:id/components/:componentId` | PUT | Yes | `hr` | hr | Updates a template component override (value / calculation_type / display_order). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 14 | `/api/v1/payroll/hr/structure-templates/:id/components/:componentId` | DELETE | Yes | `hr` | hr | Soft-removes a component from a template. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 15 | `/api/v1/payroll/hr/structure-templates/:id/preview` | POST | Yes | `hr` | hr | `{ annual_ctc }` → full evaluated component breakdown. **Persists nothing.** | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 16 | `/api/v1/payroll/hr/employees/:userId/salary-structures` | POST | Yes | `hr` | hr | Assigns/revises a salary structure. Lands `approved` (Tier C) unless `payroll_require_separate_checker` is ON, then `proposed`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 17 | `/api/v1/payroll/hr/employees/:userId/salary-structures` | GET | Yes | `hr` | hr | Full version history incl. rejected/cancelled. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 18 | `/api/v1/payroll/hr/employees/:userId/salary-structures/current` | GET | Yes | `hr` | hr | The current approved open-ended structure with its component snapshot. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 18a | `/api/v1/payroll/hr/salary-structures/current` | GET | Yes | `hr` | hr | Every employee's current approved open-ended structure in one paginated list (`page` ≥ 1, `limit` 1–100, default 50) with component snapshots and `employee.profile` embedded. Replaces N+1 calls to #18 on the salary-structures grid. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 19 | `/api/v1/payroll/hr/salary-structures/proposals` | GET | Yes | `hr` | hr | The HR checker queue; filters `status`, `proposed_by`, `user_id`, with pagination. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 20 | `/api/v1/payroll/hr/salary-structures/:id/approve` | POST | Yes | `hr` | hr | Approves a proposal (§7.2 critical section: advisory lock, scope re-verify EC-29, separate-checker EC-30, close-out, supersede). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 21 | `/api/v1/payroll/hr/salary-structures/:id/reject` | POST | Yes | `hr` | hr | Rejects a proposal; `rejection_reason` required; status-guarded. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ✅ ] | [ ] |
| 22 | `/api/v1/payroll/hr/settings` | GET | Yes | `hr` | hr | Lazy `getOrCreate` of the org payroll settings singleton. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_settings.service.js` | [ ] | [ ✅ ] | [ ] |
| 23 | `/api/v1/payroll/hr/settings` | PUT | Yes | `hr` | hr | Partial update, audit-logged old→new. Enabling separate-checker with < 2 active HR → `409 INSUFFICIENT_CHECKERS`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_settings.service.js` | [ ] | [ ✅ ] | [ ] |
| 24 | `/api/v1/payroll/hr/employees/:userId/bank-account` | GET | Yes | `hr` | hr | Masked bank account (`••••1234`); full number never returned. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bank_account.service.js` | [ ] | [ ✅ ] | [ ] |
| 24a | `/api/v1/payroll/hr/bank-accounts` | GET | Yes | `hr` | hr | Every employee's primary bank account in one paginated list (`page` ≥ 1, `limit` 1–100, default 20), masked (`••••1234`); full numbers are never returned. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bank_account.service.js` | [ ] | [ ✅ ] | [ ] |
| 25 | `/api/v1/payroll/hr/employees/:userId/bank-account/verify` | POST | Yes | `hr` | hr | Marks the account verified (`is_verified`, `verified_by`, `verified_at`); idempotent. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bank_account.service.js` | [ ] | [ ✅ ] | [ ] |
| 26 | `/api/v1/payroll/hr/audit-logs` | GET | Yes | `hr` | hr | Append-only audit trail; filters `entity_type`, `entity_id`, `target_user_id`, `action`, date range, pagination. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_audit.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Manager Operations (Phase 1)

*Requires Feature Flag: `payroll.access`*

> `hr` is admitted so an HR user can exercise the manager views without a second token; `decideAuthority` resolves them to `scope: 'global'`. Every handler resolves hierarchy scope **before** any existence lookup — a cross-team id returns an identical `403` (never `404`).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 27 | `/api/v1/payroll/manager/team/salary-structures` | GET | Yes | `manager, hr` | manager, hr | Direct reports + current CTC summary. If `manager_can_view_team_compensation` is OFF → aggregates only, never per-head figures (EC-25). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ✅ ] |
| 28 | `/api/v1/payroll/manager/employees/:userId/salary-structures` | GET | Yes | `manager, hr` | manager, hr | A report's structure history (scoped; `403` on a cross-team id). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ✅ ] |
| 29 | `/api/v1/payroll/manager/employees/:userId/salary-structures/current` | GET | Yes | `manager, hr` | manager, hr | A report's current structure (scoped). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ✅ ] |
| 30 | `/api/v1/payroll/manager/employees/:userId/salary-structures/propose` | POST | Yes | `manager, hr` | manager, hr | Tier-B proposal (`proposed_by = req.user.id`). Lands `proposed`; with `manager_direct_compensation_authority` ON it runs the full approval in-transaction and lands `approved`. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ✅ ] |
| 31 | `/api/v1/payroll/manager/salary-structures/proposals` | GET | Yes | `manager, hr` | manager, hr | The caller's own proposals + status/outcome; pagination. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ✅ ] |
| 32 | `/api/v1/payroll/manager/salary-structures/:id/cancel` | POST | Yes | `manager, hr` | manager, hr | Cancels the caller's own proposal, only while `proposed` (ownership doubles as the BOLA guard). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ✅ ] |

## Payroll Module - Employee Self-Service (Phase 1)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1): the target is always `req.user.id`, so there is no object-level authorization to break. The guard on this plane is the presence of `orgId` (a platform token → `400 MISSING_ORG_CONTEXT`). All routes live under `/me`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 33 | `/api/v1/payroll/me/salary-structure` | GET | Yes | any tenant role (self) | employee | The caller's current **approved** structure only — a pending proposal is never surfaced. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_salary_structure.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 34 | `/api/v1/payroll/me/salary-structure/history` | GET | Yes | any tenant role (self) | employee | The caller's approved version history only. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_salary_structure.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 35 | `/api/v1/payroll/me/bank-account` | GET | Yes | any tenant role (self) | employee | The caller's own bank account, masked. | `payroll_self.routes.js` | `payroll_self.controller.js` | `bank_account.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 36 | `/api/v1/payroll/me/bank-account` | PUT | Yes | any tenant role (self) | employee | Upserts own bank account; any edit resets `is_verified = false` and re-triggers HR verification. | `payroll_self.routes.js` | `payroll_self.controller.js` | `bank_account.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Payroll Module - HR Administration (Phase 2)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These engine operations allow **`hr` only** to evaluate run eligibility, create draft runs, trigger calculations/recalculations, inspect preview aggregates, manage exclusions/overrides, and transition runs through approval, cancellation, or paid settlement.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 37 | `/api/v1/payroll/hr/runs/eligibility` | GET | Yes | `hr` | hr | Pre-flight readiness check for a specific month (`period_month`); evaluates missing structures, leavers, missing bank accounts, and period locks without persisting data. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 38 | `/api/v1/payroll/hr/runs` | POST | Yes | `hr` | hr | Creates a draft payroll run for a specific month (`period_month`, `run_type`, `notes`) and snapshots org settings under an advisory lock; prevents duplicate runs (`409`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 39 | `/api/v1/payroll/hr/runs` | GET | Yes | `hr` | hr | Lists payroll runs with pagination and optional filters (`status`, `period_month`, `run_type`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 40 | `/api/v1/payroll/hr/runs/:id` | GET | Yes | `hr` | hr | Fetches header details and aggregated financial totals of a specific payroll run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 41 | `/api/v1/payroll/hr/runs/:id/calculate` | POST | Yes | `hr` | hr | Triggers synchronous batch calculation across employee cohorts; aggregates attendance, leave, and structures, computes LOP/proration/components, UPSERTs run items, and updates run header to `calculated`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 42 | `/api/v1/payroll/hr/runs/:id/preview` | GET | Yes | `hr` | hr | Fetches macro-level aggregates of a calculated run including department cost breakdown, error items, warnings, and excluded items. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 43 | `/api/v1/payroll/hr/runs/:id/items` | GET | Yes | `hr` | hr | Lists calculated payslip items for a run with pagination and optional filters (`status`, `user_id`, `department_id`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 44 | `/api/v1/payroll/hr/runs/:id/items/:itemId` | GET | Yes | `hr` | hr | Fetches a single employee's payslip item with granular component lines, attendance day ledger snapshot, and structure snapshot. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 45 | `/api/v1/payroll/hr/runs/:id/items/:itemId/exclude` | POST | Yes | `hr` | hr | Manually excludes an employee's item from a run with `exclusion_reason` (e.g. hold pay); marks run header as requiring recalculation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 46 | `/api/v1/payroll/hr/runs/:id/items/:itemId/include` | POST | Yes | `hr` | hr | Re-includes a previously excluded employee item back to pending status; marks run header as requiring recalculation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 47 | `/api/v1/payroll/hr/runs/:id/items/:itemId/period` | PATCH | Yes | `hr` | hr | Overrides the calculation period window (`period_start`, `period_end`, `period_override_reason`) for an item (e.g., mid-month leaver adjustment); marks run as requiring recalculation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 48 | `/api/v1/payroll/hr/runs/:id/approve` | POST | Yes | `hr` | hr | Critical state transition. Validates run has no errors or stale recalculation flags, freezes run to `approved`, creates attendance period lock, and publishes payslips to managers and employees. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 49 | `/api/v1/payroll/hr/runs/:id/cancel` | POST | Yes | `hr` | hr | Cancels an approved, unpaid run with `cancellation_reason`; transitions status to `cancelled` and removes attendance lock. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |
| 50 | `/api/v1/payroll/hr/runs/:id/pay` | POST | Yes | `hr` | hr | Terminal workflow step. Marks an approved run as `paid`; irreversible payment settlement confirmation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Manager Operations (Phase 2)

*Requires Feature Flag: `payroll.access`*

> `hr` is admitted so an HR user can exercise manager views without a second token. BOLA is strictly enforced (scope checked before existence; cross-team access returns `403`). Detailed compensation amounts are masked when `manager_can_view_team_compensation` is disabled, leaving aggregate totals only.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 51 | `/api/v1/payroll/manager/runs/:runId/team-summary` | GET | Yes | `manager, hr` | manager, hr | Aggregated team payroll cost summary (headcount, gross, net, LOP days) for an approved/paid run; allowed regardless of compensation-visibility toggle. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 52 | `/api/v1/payroll/manager/runs/:runId/team-items` | GET | Yes | `manager, hr` | manager, hr | Lists payslip items for direct reports in an approved/paid run; strips monetary figures when `manager_can_view_team_compensation` is disabled (aggregates only). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 53 | `/api/v1/payroll/manager/employees/:userId/payslips` | GET | Yes | `manager, hr` | manager, hr | Lists historical finalized payslips (`approved` or `paid` runs only) for a direct report; scope-checked before existence (`403` on cross-team id). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 54 | `/api/v1/payroll/manager/employees/:userId/payslips/:runId` | GET | Yes | `manager, hr` | manager, hr | Fetches detailed payslip JSON for a specific direct report; blocked (`403 COMPENSATION_VIEW_DISABLED`) if manager compensation visibility toggle is OFF. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ✅ ] |

## Payroll Module - Employee Self-Service (Phase 2)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1): target is always `req.user.id`. Only finalized payslips from `approved` or `paid` runs are returned; draft and calculating runs are completely hidden. All routes live under `/me`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 55 | `/api/v1/payroll/me/payslips` | GET | Yes | any tenant role (self) | employee | Fetches the authenticated employee's own finalized payslips list (`approved` and `paid` runs only; draft runs hidden). | `payroll_self.routes.js` | `payroll_self.controller.js` | `payslip_read.service.js` | [ ✅ ] | [ ] | [ ] |
| 56 | `/api/v1/payroll/me/payslips/:runId` | GET | Yes | any tenant role (self) | employee | Fetches the authenticated employee's detailed finalized payslip for a specific run, including component breakdown and attendance day ledger. | `payroll_self.routes.js` | `payroll_self.controller.js` | `payslip_read.service.js` | [ ✅ ] | [ ] | [ ] |



## Payroll Module - HR Administration (Phase 3)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These variable pay operations allow **`hr` only** to manage one-off adjustments, bulk CSV uploads, declarative bonus rules with impact preview & application, and employee loan grants with EMI schedules & foreclosures.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 57 | `/api/v1/payroll/hr/adjustments` | POST | Yes | `hr` | hr | Creates an ad-hoc one-off variable pay line (earning or deduction) for an employee. Lands in `approved` status (or `pending` if separate-checker is enabled). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 58 | `/api/v1/payroll/hr/adjustments` | GET | Yes | `hr` | hr | Paginated list of adjustments across the organization with filters for `period_month`, `user_id`, `status`, `category`, and `batch_id`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 59 | `/api/v1/payroll/hr/adjustments/:id` | GET | Yes | `hr` | hr | Fetches full metadata of a single adjustment, including creation source, batch ID, and approval history. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 60 | `/api/v1/payroll/hr/adjustments/:id/approve` | POST | Yes | `hr` | hr | Approves a pending adjustment proposal. Enforces Maker-Checker separation of duties (`403 SEPARATE_CHECKER_REQUIRED`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 61 | `/api/v1/payroll/hr/adjustments/:id/reject` | POST | Yes | `hr` | hr | Rejects a pending adjustment proposal with a mandatory rejection reason. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 62 | `/api/v1/payroll/hr/adjustments/:id/cancel` | POST | Yes | `hr` | hr | Cancels a `pending` or `approved`-and-unapplied adjustment. Cannot cancel once applied to an approved/paid run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 63 | `/api/v1/payroll/hr/adjustments/bulk/preview` | POST | Yes | `hr` | hr | Pre-flight validation dry-run for bulk variable pay CSV uploads. Parses and validates every row without writing any database records. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 64 | `/api/v1/payroll/hr/adjustments/bulk` | POST | Yes | `hr` | hr | Atomically inserts up to 5,000 adjustment rows in a single transaction linked by a shared `batch_id`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 65 | `/api/v1/payroll/hr/adjustments/batches/:batchId/cancel` | POST | Yes | `hr` | hr | Cancels all unapplied adjustment rows belonging to a specific bulk batch. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ✅ ] | [ ] |
| 66 | `/api/v1/payroll/hr/bonus-rules` | POST | Yes | `hr` | hr | Creates a declarative rule for automated bonus distributions based on tenure, department, and salary component percentages. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 67 | `/api/v1/payroll/hr/bonus-rules` | GET | Yes | `hr` | hr | Paginated list of bonus distribution rules. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 68 | `/api/v1/payroll/hr/bonus-rules/:id` | GET | Yes | `hr` | hr | Fetches header and eligibility criteria for a specific bonus rule. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 69 | `/api/v1/payroll/hr/bonus-rules/:id` | PUT | Yes | `hr` | hr | Updates an unapproved bonus rule (allowed only while in `pending` status). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 70 | `/api/v1/payroll/hr/bonus-rules/:id/approve` | POST | Yes | `hr` | hr | Approves a bonus rule, enabling it for application to payroll. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 71 | `/api/v1/payroll/hr/bonus-rules/:id/reject` | POST | Yes | `hr` | hr | Rejects a bonus rule proposal with mandatory justification. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 72 | `/api/v1/payroll/hr/bonus-rules/:id/preview-impact` | POST | Yes | `hr` | hr | Evaluates eligibility and computes exact payouts for all matching employees. Returns total liability without persisting any data. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 73 | `/api/v1/payroll/hr/bonus-rules/:id/apply` | POST | Yes | `hr` | hr | Materializes the bonus rule by creating individual `payroll_adjustments` rows for all eligible employees with a shared `batch_id`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 74 | `/api/v1/payroll/hr/bonus-rules/:id/cancel` | POST | Yes | `hr` | hr | Cancels an unapplied bonus rule. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bonus_rule.service.js` | [ ] | [ ✅ ] | [ ] |
| 75 | `/api/v1/payroll/hr/employees/:userId/loans` | POST | Yes | `hr` | hr | Grants a company loan or salary advance. Generates full monthly EMI schedule in `loan_installments`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 76 | `/api/v1/payroll/hr/loans` | GET | Yes | `hr` | hr | Paginated list of company loans with status and type filters. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 77 | `/api/v1/payroll/hr/loans/:id` | GET | Yes | `hr` | hr | Fetches loan metadata, principal, interest, recovered amount, and outstanding balance. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 78 | `/api/v1/payroll/hr/loans/:id/installments` | GET | Yes | `hr` | hr | Lists all scheduled, deducted, skipped, and cancelled installments for a loan. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 79 | `/api/v1/payroll/hr/loans/:id/approve` | POST | Yes | `hr` | hr | Approves a pending loan proposal and generates its installment schedule. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 80 | `/api/v1/payroll/hr/loans/:id/reject` | POST | Yes | `hr` | hr | Rejects a pending loan proposal with mandatory reason. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 81 | `/api/v1/payroll/hr/loans/:id/cancel` | POST | Yes | `hr` | hr | Cancels a pending loan, or an active loan that has had zero deducted installments. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |
| 82 | `/api/v1/payroll/hr/loans/:id/foreclose` | POST | Yes | `hr` | hr | Performs early closure of an active loan. Cancels remaining installments (forgiving interest) and optionally creates a recovery adjustment for outstanding principal. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_loan.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Manager Operations (Phase 3)

*Requires Feature Flag: `payroll.access`*

> `hr` is admitted so an HR user can exercise manager views without a second token. BOLA is strictly enforced (scope checked before existence; cross-team access returns `403`). Managers can propose variable pay adjustments, bonus rules, and loans for direct reports.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 83 | `/api/v1/payroll/manager/employees/:userId/adjustments/propose` | POST | Yes | `manager, hr` | manager, hr | Manager proposes a variable pay earning/deduction for a direct report. Lands in `pending` for HR review. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ] | [ ✅ ] |
| 84 | `/api/v1/payroll/manager/adjustments` | GET | Yes | `manager, hr` | manager, hr | Lists adjustments for direct reports. Masks financial amounts if `manager_can_view_team_compensation` is disabled. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ] | [ ✅ ] |
| 85 | `/api/v1/payroll/manager/adjustments/:id/cancel` | POST | Yes | `manager, hr` | manager, hr | Manager cancels their own pending adjustment proposal. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_adjustment.service.js` | [ ] | [ ] | [ ✅ ] |
| 86 | `/api/v1/payroll/manager/bonus-rules/propose` | POST | Yes | `manager, hr` | manager, hr | Manager proposes a bonus rule strictly targeting direct reports with `eligibility_source: 'manual'`. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `bonus_rule.service.js` | [ ] | [ ] | [ ✅ ] |
| 87 | `/api/v1/payroll/manager/bonus-rules` | GET | Yes | `manager, hr` | manager, hr | Lists bonus rule proposals submitted by the manager. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `bonus_rule.service.js` | [ ] | [ ] | [ ✅ ] |
| 88 | `/api/v1/payroll/manager/employees/:userId/loans/recommend` | POST | Yes | `manager, hr` | manager, hr | Manager recommends a loan or emergency advance for a direct report. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_loan.service.js` | [ ] | [ ] | [ ✅ ] |
| 89 | `/api/v1/payroll/manager/loans` | GET | Yes | `manager, hr` | manager, hr | Lists loans granted to direct reports with BOLA hierarchy verification. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_loan.service.js` | [ ] | [ ] | [ ✅ ] |
| 90 | `/api/v1/payroll/manager/loans/:id` | GET | Yes | `manager, hr` | manager, hr | Fetches installment schedule and repayment status for a subordinate's loan. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_loan.service.js` | [ ] | [ ] | [ ✅ ] |

## Payroll Module - Employee Self-Service (Phase 3)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1): target is always `req.user.id`. Employees view only approved/finalized records; pending and rejected proposals are strictly hidden. All routes live under `/me`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 91 | `/api/v1/payroll/me/bonuses` | GET | Yes | any tenant role (self) | employee | Returns the employee's approved bonuses, categorized into earned (paid) and upcoming (scheduled). | `payroll_self.routes.js` | `payroll_self.controller.js` | `bonus_rule.service.js` | [ ✅ ] | [ ] | [ ] |
| 92 | `/api/v1/payroll/me/adjustments` | GET | Yes | any tenant role (self) | employee | Lists all approved variable pay additions and deductions for the employee. | `payroll_self.routes.js` | `payroll_self.controller.js` | `payroll_adjustment.service.js` | [ ✅ ] | [ ] | [ ] |
| 93 | `/api/v1/payroll/me/loans` | GET | Yes | any tenant role (self) | employee | Lists the employee's active and closed loans, including total principal, recovered amount, and outstanding balance. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_loan.service.js` | [ ✅ ] | [ ] | [ ] |
| 94 | `/api/v1/payroll/me/loans/:id/installments` | GET | Yes | any tenant role (self) | employee | Returns the employee's monthly EMI repayment schedule and deduction history. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_loan.service.js` | [ ✅ ] | [ ] | [ ] |

## Payroll Module - HR Administration (Phase 4 — Statutory & Tax)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These statutory & tax operations allow **`hr` only** to configure statutory heads (PF/ESI/PT), maintain professional-tax and income-tax slab tables, run the investment-declaration verification workflow, and administer per-employee tax state (regime, previous-employer figures, projection, Form 16, finalization). **No Manager section exists for Phase 4 (D-28):** tax and declaration data — landlord PAN, rent paid, insurance policies, previous-employer income — is materially more sensitive than compensation, so `payroll_manager.routes.js` gains no tax endpoint. Statutory *figures* still reach a manager only as ordinary component lines on the already-gated payslip endpoints (#53/#54).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 95 | `/api/v1/payroll/hr/statutory/config` | GET | Yes | `hr` | hr | Lazy `getOrCreate` of the org statutory-config singleton; returns `updated_at` and `updated_by`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `statutory_config.service.js` | [ ] | [ ✅ ] | [ ] |
| 96 | `/api/v1/payroll/hr/statutory/config` | PUT | Yes | `hr` | hr | Partial update, audit-logged old→new. Response names every live `draft`/`calculated` run whose frozen snapshot predates the edit (must be cancelled & re-created to pick it up). Enabling a head activates its catalog rows. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `statutory_config.service.js` | [ ] | [ ✅ ] | [ ] |
| 97 | `/api/v1/payroll/hr/statutory/pt-slabs` | GET | Yes | `hr` | hr | Lists professional-tax slabs; filters `state_code`, `is_active` (validated in controller — Express 5). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `statutory_config.service.js` | [ ] | [ ✅ ] | [ ] |
| 98 | `/api/v1/payroll/hr/statutory/pt-slabs/states/:stateCode` | PUT | Yes | `hr` | hr | Replaces a state's whole slab set atomically; validates contiguity/overlap over the submitted set (`422 PT_SLAB_RANGE_INVALID` naming the gap or overlap). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `statutory_config.service.js` | [ ] | [ ✅ ] | [ ] |
| 99 | `/api/v1/payroll/hr/statutory/pt-slabs/states/:stateCode` | DELETE | Yes | `hr` | hr | Deactivates the state's slab set (soft-delete; never hard-deletes). `404 PT_SLAB_STATE_NOT_FOUND` when no active slabs exist. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `statutory_config.service.js` | [ ] | [ ✅ ] | [ ] |
| 100 | `/api/v1/payroll/hr/tax/bootstrap` | POST | Yes | `hr` | hr | `{ financial_year }` — idempotent seed of the default income-tax regimes + slabs for that FY. Inserts only missing `(financial_year, code)` pairs, never overwrites an edited regime; returns `{ created[], skipped[] }`. Audit-logged. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `tax_table.service.js` | [ ] | [ ✅ ] | [ ] |
| 101 | `/api/v1/payroll/hr/tax/regimes` | GET | Yes | `hr` | hr | `?financial_year=` — regimes with their slab counts. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `tax_table.service.js` | [ ] | [ ✅ ] | [ ] |
| 102 | `/api/v1/payroll/hr/tax/regimes/:id` | PUT | Yes | `hr` | hr | Rates, caps, standard deduction, rebate, surcharge, `is_default`. Setting `is_default` clears the sibling in one transaction. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `tax_table.service.js` | [ ] | [ ✅ ] | [ ] |
| 103 | `/api/v1/payroll/hr/tax/regimes/:id/slabs` | GET | Yes | `hr` | hr | Slabs for a regime, grouped by `age_band`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `tax_table.service.js` | [ ] | [ ✅ ] | [ ] |
| 104 | `/api/v1/payroll/hr/tax/regimes/:id/slabs` | PUT | Yes | `hr` | hr | Replaces the whole slab set for one or more age bands atomically; same contiguity validation (`422 TAX_SLAB_RANGE_INVALID`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `tax_table.service.js` | [ ] | [ ✅ ] | [ ] |
| 105 | `/api/v1/payroll/hr/tax/declarations` | GET | Yes | `hr` | hr | The investment-declaration verification queue. Filters `financial_year`, `status`, `user_id`; paginated. Header + name only — items (landlord PAN/rent) never surface in a list. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `investment_declaration.service.js` | [ ] | [ ✅ ] | [ ] |
| 106 | `/api/v1/payroll/hr/tax/declarations/:id` | GET | Yes | `hr` | hr | Header + items + the employee's current regime. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `investment_declaration.service.js` | [ ] | [ ✅ ] | [ ] |
| 107 | `/api/v1/payroll/hr/tax/declarations/:id/verify` | POST | Yes | `hr` | hr | `{ items: [{ item_id, verified_amount, proof_status, proof_reference?, verifier_remarks? }], remarks? }`. Sets the header to `verified` when every item is verified, `partially_verified` otherwise. Advisory-locked (§7.3). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `investment_declaration.service.js` | [ ] | [ ✅ ] | [ ] |
| 108 | `/api/v1/payroll/hr/tax/declarations/:id/reject` | POST | Yes | `hr` | hr | `rejection_reason` required. Every item → `verified_amount = 0`, `proof_status = 'rejected'`. Takes the same advisory lock as verify. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `investment_declaration.service.js` | [ ] | [ ✅ ] | [ ] |
| 109 | `/api/v1/payroll/hr/tax/declarations/:id/reopen` | POST | Yes | `hr` | hr | Returns the declaration to `draft` so the employee can edit; `reason` required; increments `reopened_count`. `submitted_at` and `proof_deadline` are preserved (EC-43), so it stays visible to the engine and existing verification survives (§7.3a). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `investment_declaration.service.js` | [ ] | [ ✅ ] | [ ] |
| 110 | `/api/v1/payroll/hr/employees/:userId/tax/summary` | GET | Yes | `hr` | hr | `?financial_year=` — regime, previous-employer figures, **derived** YTD actuals, declaration status, finalization state. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 111 | `/api/v1/payroll/hr/employees/:userId/tax/regime` | PUT | Yes | `hr` | hr | HR override (`regime_source = 'hr'`). Blocked when finalized (`409 FINANCIAL_YEAR_FINALIZED`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 112 | `/api/v1/payroll/hr/employees/:userId/tax/previous-employer` | PUT | Yes | `hr` | hr | Form 12B previous-employer figures (EC-33). Blocked when finalized. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 113 | `/api/v1/payroll/hr/employees/:userId/tax/projection` | GET | Yes | `hr` | hr | `?financial_year=&as_of_period=` — the full projection trace; **persists nothing**. The "why is my TDS this number" endpoint. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 114 | `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear` | GET | Yes | `hr` | hr | Part-B dataset. Returns the frozen `form16_snapshot` when finalized, otherwise a live assembly marked `is_provisional: true`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 115 | `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/part-a` | PUT | Yes | `hr` | hr | `{ ack_number, issued_on?, reference_url? }` — Part-A reference only, no file (D-29). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 116 | `/api/v1/payroll/hr/employees/:userId/tax/financial-years/:financialYear/finalize` | POST | Yes | `hr` | hr | Finalizes one employee's FY: freezes the Form 16 snapshot under the `payroll:tax:{userId}:{fy}` advisory lock (§7.5, idempotent). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 117 | `/api/v1/payroll/hr/tax/financial-years/:financialYear/finalize` | POST | Yes | `hr` | hr | Org-wide finalization: cohort-batched, resumable, per-employee error isolation. `{ acknowledge_missing_months, reason }`. §7.5. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |
| 118 | `/api/v1/payroll/hr/tax/financial-years/:financialYear/statutory-summary` | GET | Yes | `hr` | hr | Org-wide month-by-month totals: PF employee/employer/EPS, ESI employee/employer, PT, TDS, headcounts. The challan-preparation view. Aggregated from approved/paid items only. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Employee Self-Service (Phase 4 — Statutory & Tax)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1/EC-24): the target is always `req.user.id` — no route accepts a `userId`. The FY is the `?financial_year=` filter (validated in-controller), except #126 which takes it in the path. All routes live under `/me`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 119 | `/api/v1/payroll/me/tax/summary` | GET | Yes | any tenant role (self) | employee | `?financial_year=` — regime, YTD TDS/PF/ESI/PT, declaration status, projected annual liability, remaining monthly TDS. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_tax.service.js` | [ ✅ ] | [ ] | [ ] |
| 120 | `/api/v1/payroll/me/tax/projection` | GET | Yes | any tenant role (self) | employee | The same projection trace as #113, for oneself, with the stated limitations in the payload. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_tax.service.js` | [ ✅ ] | [ ] | [ ] |
| 121 | `/api/v1/payroll/me/tax/monthly` | GET | Yes | any tenant role (self) | employee | `?financial_year=` — month-by-month TDS / PF / ESI / PT from approved runs. The annual tax statement's data half. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_tax.service.js` | [ ✅ ] | [ ] | [ ] |
| 122 | `/api/v1/payroll/me/tax/declarations` | GET | Yes | any tenant role (self) | employee | `?financial_year=` — own declaration + items + window state + `proof_deadline`. | `payroll_self.routes.js` | `payroll_self.controller.js` | `investment_declaration.service.js` | [ ✅ ] | [ ] | [ ] |
| 123 | `/api/v1/payroll/me/tax/declarations` | PUT | Yes | any tenant role (self) | employee | Upserts the whole item set for the FY while `draft` and the window is open (replace-set, not per-item CRUD). Verification on unchanged items is preserved (§7.3a); `sub_category: 'EPF_AUTO'` is rejected (§4.6). | `payroll_self.routes.js` | `payroll_self.controller.js` | `investment_declaration.service.js` | [ ✅ ] | [ ] | [ ] |
| 124 | `/api/v1/payroll/me/tax/declarations/submit` | POST | Yes | any tenant role (self) | employee | `draft` → `submitted`. Freezes `proof_deadline` on first submission only. `409 DECLARATION_NOT_DRAFT` on retry. | `payroll_self.routes.js` | `payroll_self.controller.js` | `investment_declaration.service.js` | [ ✅ ] | [ ] | [ ] |
| 125 | `/api/v1/payroll/me/tax/regime` | PUT | Yes | any tenant role (self) | employee | Employee regime choice. `403 REGIME_SWITCH_NOT_ALLOWED` when `allow_employee_regime_switch` is off; `409 FINANCIAL_YEAR_FINALIZED` after finalization. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_tax.service.js` | [ ✅ ] | [ ] | [ ] |
| 126 | `/api/v1/payroll/me/tax/form16/:financialYear` | GET | Yes | any tenant role (self) | employee | Own Part-B dataset. `404` until the FY is finalized — an employee never receives a provisional Form 16. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_tax.service.js` | [ ✅ ] | [ ] | [ ] |
| 127 | `/api/v1/payroll/me/tax/declarations/proofs` | PUT | Yes | any tenant role (self) | employee | Records proof references after submission without a reopen. `{ items: [{ item_id, proof_reference }] }` → sets `proof_reference` and `proof_status = 'submitted'` on the caller's own items. Allowed while `status IN ('submitted','under_review')` and not `rejected`; never touches `declared_amount`, `verified_amount`, or header status. | `payroll_self.routes.js` | `payroll_self.controller.js` | `investment_declaration.service.js` | [ ✅ ] | [ ] | [ ] |

## Payroll Module - HR Administration (Phase 5 — Reimbursements, Benefits & Documents)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These reimbursement, benefit, and document operations allow **`hr` only** to manage the expense category catalog, audit and approve employee expense claims with selective amount trimming, schedule payouts into open payroll runs or off-cycle disbursements, configure corporate benefit plans and enrollments, and manage pre-signed S3 document attachments including certified Form 16 Part A certificates.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 128 | `/api/v1/payroll/hr/reimbursements/categories` | POST | Yes | `hr` | hr | Creates an organizational expense reimbursement category with policy caps, limit periods, receipt requirements, and tax treatment. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_category.service.js` | [ ] | [ ✅ ] | [ ] |
| 129 | `/api/v1/payroll/hr/reimbursements/categories` | GET | Yes | `hr` | hr | Lists all reimbursement categories configured for the organization (filterable by `is_active`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_category.service.js` | [ ] | [ ✅ ] | [ ] |
| 130 | `/api/v1/payroll/hr/reimbursements/categories/:id` | GET | Yes | `hr` | hr | Fetches detailed configuration of a single reimbursement category. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_category.service.js` | [ ] | [ ✅ ] | [ ] |
| 131 | `/api/v1/payroll/hr/reimbursements/categories/:id` | PUT | Yes | `hr` | hr | Updates an existing reimbursement category's parameters (caps, receipt obligations, taxability). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_category.service.js` | [ ] | [ ✅ ] | [ ] |
| 132 | `/api/v1/payroll/hr/reimbursements/categories/:id` | DELETE | Yes | `hr` | hr | Soft-deactivates a reimbursement category (`is_active = false`; rejects if active claims exist). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_category.service.js` | [ ] | [ ✅ ] | [ ] |
| 133 | `/api/v1/payroll/hr/reimbursements/claims` | GET | Yes | `hr` | hr | Lists all employee reimbursement claims across the organization with status, period, user, and level filters. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_claim.service.js` | [ ] | [ ✅ ] | [ ] |
| 134 | `/api/v1/payroll/hr/reimbursements/claims/:id` | GET | Yes | `hr` | hr | Fetches full audit details of a claim: line items, expense dates, merchants, receipts, and multi-tier approval history. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_claim.service.js` | [ ] | [ ✅ ] | [ ] |
| 135 | `/api/v1/payroll/hr/reimbursements/claims/:id/approve` | POST | Yes | `hr` | hr | HR grants final Level 2 approval, trims line items, and schedules payout into the earliest open payroll run within lookahead. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_approval.service.js` | [ ] | [ ✅ ] | [ ] |
| 136 | `/api/v1/payroll/hr/reimbursements/claims/:id/reject` | POST | Yes | `hr` | hr | HR rejects a reimbursement claim with mandatory rejection reason; restores claimant's budget headroom. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `reimbursement_approval.service.js` | [ ] | [ ✅ ] | [ ] |
| 137 | `/api/v1/payroll/hr/attachments/:attachmentId/view-url` | GET | Yes | `hr` | hr | Generates a short-lived pre-signed S3 GET URL (5-min TTL) to view or download any organization attachment. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `attachment.service.js` | [ ] | [ ✅ ] | [ ] |
| 138 | `/api/v1/payroll/hr/benefit-plans` | POST | Yes | `hr` | hr | Creates a corporate benefit plan (health, life, accidental, wellness) with monthly employee deduction and employer subsidy. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 139 | `/api/v1/payroll/hr/benefit-plans` | GET | Yes | `hr` | hr | Lists all corporate benefit plans in the organization catalog (filterable by `benefit_type` and `is_active`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 140 | `/api/v1/payroll/hr/benefit-plans/:id` | GET | Yes | `hr` | hr | Fetches details of a specific benefit plan including coverage parameters and contribution rates. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 141 | `/api/v1/payroll/hr/benefit-plans/:id` | PUT | Yes | `hr` | hr | Updates an existing benefit plan's contribution amounts, coverage details, or active status. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 142 | `/api/v1/payroll/hr/benefit-plans/:id` | DELETE | Yes | `hr` | hr | Soft-deactivates a benefit plan (`is_active = false`; blocked if active employee enrollments exist). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 143 | `/api/v1/payroll/hr/benefit-plans/:id/enrollments` | POST | Yes | `hr` | hr | Enrolls an employee in a benefit plan with policy number, coverage tier, start/end dates, and dependent details. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 144 | `/api/v1/payroll/hr/benefit-plans/:id/enrollments` | GET | Yes | `hr` | hr | Lists all employee enrollments under a specific benefit plan with status filters and pagination. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 145 | `/api/v1/payroll/hr/employees/:userId/benefit-enrollments` | GET | Yes | `hr` | hr | Lists all active and historical benefit enrollments for a specific employee. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 146 | `/api/v1/payroll/hr/employees/:userId/benefit-enrollments/:enrollmentId/end` | POST | Yes | `hr` | hr | Closes an active benefit enrollment by setting an effective end date, stopping payroll deductions from the next cycle. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `benefit_plan.service.js` | [ ] | [ ✅ ] | [ ] |
| 147 | `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/part-a/attachment` | POST | Yes | `hr` | hr | Issues a pre-signed S3 PUT URL to upload a TRACES-certified Form 16 Part A PDF, or links an external TRACES reference URL (D-29). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Manager Operations (Phase 5 — Reimbursements & Benefits)

*Requires Feature Flag: `payroll.access`*

> `hr` is admitted so an HR user can exercise manager views without a second token. BOLA is strictly enforced (scope checked before existence; cross-team access returns `403`). Managers can review direct reports' reimbursement claims, trim line-item amounts downward, view team receipts, and inspect benefit enrollment statuses.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 148 | `/api/v1/payroll/manager/reimbursements/claims` | GET | Yes | `manager, hr` | manager, hr | Lists pending reimbursement claims submitted by direct reports (or claims awaiting the manager's approval level). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `reimbursement_claim.service.js` | [ ] | [ ] | [ ✅ ] |
| 149 | `/api/v1/payroll/manager/reimbursements/claims/:id` | GET | Yes | `manager, hr` | manager, hr | Fetches detailed expense items, merchant names, bill references, and receipts of a direct report's claim (BOLA-enforced). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `reimbursement_claim.service.js` | [ ] | [ ] | [ ✅ ] |
| 150 | `/api/v1/payroll/manager/reimbursements/claims/:id/approve` | POST | Yes | `manager, hr` | manager, hr | Level 1 approval on a direct report's claim with optional downward line-item trimming; advances status to `under_review`. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `reimbursement_approval.service.js` | [ ] | [ ] | [ ✅ ] |
| 151 | `/api/v1/payroll/manager/reimbursements/claims/:id/reject` | POST | Yes | `manager, hr` | manager, hr | Rejects a direct report's reimbursement claim with mandatory rejection reason (terminal; restores budget headroom). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `reimbursement_approval.service.js` | [ ] | [ ] | [ ✅ ] |
| 152 | `/api/v1/payroll/manager/attachments/:attachmentId/view-url` | GET | Yes | `manager, hr` | manager, hr | Generates an expiring pre-signed S3 GET URL to view a team member's receipt attachment (`reimbursement_claim_item` only; tax attachments forbidden). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `attachment.service.js` | [ ] | [ ] | [ ✅ ] |
| 153 | `/api/v1/payroll/manager/team/benefit-enrollments` | GET | Yes | `manager, hr` | manager, hr | Lists active benefit coverages for direct reports (financial deduction amounts masked if compensation visibility is disabled, EC-25). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `benefit_plan.service.js` | [ ] | [ ] | [ ✅ ] |

## Payroll Module - Employee Self-Service (Phase 5 — Reimbursements, Benefits & Documents)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1/EC-24): the target is always `req.user.id`. Employees check live category headroom, author draft claims, attach expense receipts or tax proofs via S3 pre-signed URLs, submit claims for multi-tier review, self-cancel pending claims, and inspect their active benefit enrollments.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 154 | `/api/v1/payroll/me/reimbursements/categories` | GET | Yes | any tenant role (self) | employee | Lists active reimbursement categories alongside caller's consumed amounts and remaining monthly/annual budget headroom. | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 155 | `/api/v1/payroll/me/reimbursements/claims` | POST | Yes | any tenant role (self) | employee | Creates a new multi-line reimbursement claim header in `draft` status with itemized expenses (does not consume headroom). | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 156 | `/api/v1/payroll/me/reimbursements/claims` | GET | Yes | any tenant role (self) | employee | Lists caller's own reimbursement claims with status, period, line counts, approved amounts, and payout progress. | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 157 | `/api/v1/payroll/me/reimbursements/claims/:id` | GET | Yes | any tenant role (self) | employee | Returns detailed view of caller's own claim: line items, attached receipts, approval timeline, and scheduled payout run. | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 158 | `/api/v1/payroll/me/reimbursements/claims/:id` | PUT | Yes | any tenant role (self) | employee | Replaces the item set of a claim while in `draft` status (`409 CLAIM_NOT_DRAFT` if already submitted). | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 159 | `/api/v1/payroll/me/reimbursements/claims/:id/submit` | POST | Yes | any tenant role (self) | employee | Submits draft claim for review: validates items, enforces mandatory receipts and budget limits, materializes approval chain, and transitions to `submitted`. | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 160 | `/api/v1/payroll/me/reimbursements/claims/:id/cancel` | POST | Yes | any tenant role (self) | employee | Claimant cancels own claim while in `draft`, `submitted`, or `under_review` (releases headroom; blocked once approved or paid). | `payroll_self.routes.js` | `payroll_self.controller.js` | `reimbursement_claim.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 161 | `/api/v1/payroll/me/reimbursements/claims/:id/items/:itemId/attachments` | POST | Yes | any tenant role (self) | employee | Issues a pre-signed S3 PUT URL (10-min TTL) to upload an expense receipt for a draft claim line item (JPEG, PNG, WebP, PDF; SVG barred). | `payroll_self.routes.js` | `payroll_self.controller.js` | `attachment.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 162 | `/api/v1/payroll/me/tax/declarations/items/:itemId/attachments` | POST | Yes | any tenant role (self) | employee | Issues a pre-signed S3 PUT URL to upload an investment declaration proof document for Chapter VI-A deductions (D-29). | `payroll_self.routes.js` | `payroll_self.controller.js` | `attachment.service.js` | [ ✅ ] | [ ] | [ ] |
| 163 | `/api/v1/payroll/me/attachments/:attachmentId/confirm` | POST | Yes | any tenant role (self) | employee | Confirms that an attachment was successfully uploaded to S3 after HeadObject check; transitions document record from `pending` to `active`. | `payroll_self.routes.js` | `payroll_self.controller.js` | `attachment.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 164 | `/api/v1/payroll/me/attachments/:attachmentId` | DELETE | Yes | any tenant role (self) | employee | Soft-deletes caller's own attachment (allowed for receipts while claim is draft, or proofs while declaration is not finalized). | `payroll_self.routes.js` | `payroll_self.controller.js` | `attachment.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 165 | `/api/v1/payroll/me/attachments/:attachmentId/view-url` | GET | Yes | any tenant role (self) | employee | Generates a short-lived pre-signed S3 GET URL (5-minute TTL) to securely view or download own receipt, proof, or Form 16 Part A document. | `payroll_self.routes.js` | `payroll_self.controller.js` | `attachment.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 166 | `/api/v1/payroll/me/benefits` | GET | Yes | any tenant role (self) | employee | Lists caller's active and historical corporate benefit enrollments, policy numbers, dependent coverages, monthly deductions, and employer contributions. | `payroll_self.routes.js` | `payroll_self.controller.js` | `benefit_plan.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |




## Payroll Module - HR Administration (Phase 6 — Delivery Layer)

*Requires Feature Flag: `payroll.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 167 | `/api/v1/payroll/hr/runs/:id/payslips` | GET | Yes | `hr` | hr | Retrieves a paginated index of payslips for a specific payroll run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 168 | `/api/v1/payroll/hr/employees/:userId/payslips` | GET | Yes | `hr` | hr | Retrieves the complete payslip issuance history for an employee across all runs. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 169 | `/api/v1/payroll/hr/employees/:userId/payslips/:runId` | GET | Yes | `hr` | hr | Retrieves the full JSON representation of an employee's payslip for a specific run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 170 | `/api/v1/payroll/hr/employees/:userId/payslips/:runId/pdf` | GET | Yes | `hr` | hr | Generates and streams a PDF version of the payslip. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip.service.js` | [ ] | [ ✅ ] | [ ] |
| 171 | `/api/v1/payroll/hr/runs/:id/payslips/publish` | POST | Yes | `hr` | hr | Releases held payslips to employees, making them visible and enqueueing them for email dispatch. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip.service.js` | [ ] | [ ✅ ] | [ ] |
| 172 | `/api/v1/payroll/hr/runs/:id/payslips/backfill` | POST | Yes | `hr` | hr | Composes and persists payslip snapshots for historical runs approved before Phase 6. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip.service.js` | [ ] | [ ✅ ] | [ ] |
| 173 | `/api/v1/payroll/hr/payslips/:id/reissue` | POST | Yes | `hr` | hr | Supersedes an active payslip with version N+1 to correct presentation errors. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip.service.js` | [ ] | [ ✅ ] | [ ] |
| 174 | `/api/v1/payroll/hr/runs/:id/payslips/download` | GET | Yes | `hr` | hr | Streams a ZIP archive of all PDFs for an approved run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip.service.js` | [ ] | [ ✅ ] | [ ] |
| 175 | `/api/v1/payroll/hr/runs/:id/payslips/dispatch` | POST | Yes | `hr` | hr | Drains a bounded batch of the payslip notification email queue synchronously. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip_dispatch.service.js` | [ ] | [ ✅ ] | [ ] |
| 176 | `/api/v1/payroll/hr/runs/:id/payslips/dispatch-status` | GET | Yes | `hr` | hr | Surfaces queue state and recent failures for a run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payslip_dispatch.service.js` | [ ] | [ ✅ ] | [ ] |
| 177 | `/api/v1/payroll/hr/reports/payroll-register` | GET | Yes | `hr` | hr | Detailed employee-level financial data across a period. Supports CSV/PDF export. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 178 | `/api/v1/payroll/hr/reports/department-distribution` | GET | Yes | `hr` | hr | Aggregated financial totals bucketed by department and location. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 179 | `/api/v1/payroll/hr/reports/deduction-summary` | GET | Yes | `hr` | hr | Aggregated totals for deductions and employer contributions, bucketed by component code. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 180 | `/api/v1/payroll/hr/reports/components` | GET | Yes | `hr` | hr | Employee-level breakdown isolated to specific requested component codes. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 181 | `/api/v1/payroll/hr/runs/:id/bank-advice` | GET | Yes | `hr` | hr | Generates a NEFT-compatible CSV for bank disbursement, decrypting accounts dynamically. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bank_advice.service.js` | [ ] | [ ✅ ] | [ ] |
| 182 | `/api/v1/payroll/hr/exports` | GET | Yes | `hr` | hr | Paginated index of all export audit logs generated by the organization. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 183 | `/api/v1/payroll/hr/employees/:userId/annual-statement` | GET | Yes | `hr` | hr | Retrieves the FY salary grid for an employee. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `annual_statement.service.js` | [ ] | [ ✅ ] | [ ] |
| 184 | `/api/v1/payroll/hr/employees/:userId/annual-statement/pdf` | GET | Yes | `hr` | hr | Generates and streams the FY annual salary statement as PDF. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `annual_statement.service.js` | [ ] | [ ✅ ] | [ ] |
| 185 | `/api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/pdf` | GET | Yes | `hr` | hr | Generates the Part B tax certificate PDF. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_tax.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Manager Operations (Phase 6 — Delivery Layer)

*Requires Feature Flag: `payroll.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 186 | `/api/v1/payroll/manager/employees/:userId/payslips/:runId/pdf` | GET | Yes | `manager` | manager | Downloads a subordinate's payslip PDF (enforces release gate visibility). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 187 | `/api/v1/payroll/manager/reports/payroll-register` | GET | Yes | `manager` | manager | Downloads the Payroll Register report filtered securely to the manager's team hierarchy. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_report.service.js` | [ ] | [ ] | [ ✅ ] |
| 188 | `/api/v1/payroll/manager/reports/department-distribution` | GET | Yes | `manager` | manager | Downloads the Department Distribution report filtered securely to the manager's team hierarchy. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_report.service.js` | [ ] | [ ] | [ ✅ ] |
| 189 | `/api/v1/payroll/manager/reports/deduction-summary` | GET | Yes | `manager` | manager | Downloads the Deduction Summary report filtered securely to the manager's team hierarchy. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_report.service.js` | [ ] | [ ] | [ ✅ ] |
| 190 | `/api/v1/payroll/manager/reports/components` | GET | Yes | `manager` | manager | Downloads the Component breakdown report filtered securely to the manager's team hierarchy. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payroll_report.service.js` | [ ] | [ ] | [ ✅ ] |

## Payroll Module - Employee Self-Service (Phase 6 — Delivery Layer)

*Requires Feature Flag: `payroll.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 191 | `/api/v1/payroll/me/payslips/:runId/pdf` | GET | Yes | `any tenant role` | employee | Employee downloads their own payslip PDF (if officially published/released). | `payroll_self.routes.js` | `payroll_self.controller.js` | `payslip_read.service.js` | [ ✅ ] | [ ] | [ ] |
| 192 | `/api/v1/payroll/me/annual-statement` | GET | Yes | `any tenant role` | employee | Employee views their own FY annual salary statement JSON grid. | `payroll_self.routes.js` | `payroll_self.controller.js` | `annual_statement.service.js` | [ ✅ ] | [ ] | [ ] |
| 193 | `/api/v1/payroll/me/annual-statement/pdf` | GET | Yes | `any tenant role` | employee | Employee downloads their own FY annual salary statement PDF. | `payroll_self.routes.js` | `payroll_self.controller.js` | `annual_statement.service.js` | [ ✅ ] | [ ] | [ ] |
| 194 | `/api/v1/payroll/me/tax/form16/:financialYear/pdf` | GET | Yes | `any tenant role` | employee | Employee downloads their finalized Form 16 Part B tax certificate PDF. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_tax.service.js` | [ ✅ ] | [ ] | [ ] |

## Payroll Module - HR Operations (Phase 7 — Corrections, Exits & Automation)

*Requires Feature Flag: `payroll.access`. Tenant-plane only — no `admin`/`super-admin`. Exits and arrears are Tier C (org-level financial authority).*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 195 | `/api/v1/payroll/hr/exits` | POST | Yes | `hr` | hr | Records a first-class employee exit (last working day, notice, type). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_exit.service.js` | [ ] | [ ✅ ] | [ ] |
| 196 | `/api/v1/payroll/hr/exits` | GET | Yes | `hr` | hr | Lists exits (filters: status, user_id, from/to, exit_type). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_exit.service.js` | [ ] | [ ✅ ] | [ ] |
| 197 | `/api/v1/payroll/hr/exits/:id` | GET | Yes | `hr` | hr | Exit detail with prepared artefacts and the linked F&F run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_exit.service.js` | [ ] | [ ✅ ] | [ ] |
| 198 | `/api/v1/payroll/hr/exits/:id` | PATCH | Yes | `hr` | hr | Corrects last working day / notice / type / reason (refused once settled or prepared). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_exit.service.js` | [ ] | [ ✅ ] | [ ] |
| 199 | `/api/v1/payroll/hr/exits/:id/cancel` | POST | Yes | `hr` | hr | Cancels an exit (reason required; auto-resets if prepared). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_exit.service.js` | [ ] | [ ✅ ] | [ ] |
| 200 | `/api/v1/payroll/hr/exits/:id/settlement-preview` | GET | Yes | `hr` | hr | Full & Final settlement plan, read-only (nothing persisted). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `fnf_settlement.service.js` | [ ] | [ ✅ ] | [ ] |
| 201 | `/api/v1/payroll/hr/exits/:id/prepare-settlement` | POST | Yes | `hr` | hr | Idempotent; creates the notice/encashment/loan adjustment inputs in one transaction. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `fnf_settlement.service.js` | [ ] | [ ✅ ] | [ ] |
| 202 | `/api/v1/payroll/hr/exits/:id/settlement/reset` | POST | Yes | `hr` | hr | Reverses prepared artefacts (reason required); exact inverse. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `fnf_settlement.service.js` | [ ] | [ ✅ ] | [ ] |
| 203 | `/api/v1/payroll/hr/arrears/drift` | GET | Yes | `hr` | hr | Read-only frozen-vs-live drift report for a closed period. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_arrear.service.js` | [ ] | [ ✅ ] | [ ] |
| 204 | `/api/v1/payroll/hr/arrears/reconcile` | POST | Yes | `hr` | hr | Commits arrear adjustments into the next open run (one transaction). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_arrear.service.js` | [ ] | [ ✅ ] | [ ] |
| 205 | `/api/v1/payroll/hr/arrears` | GET | Yes | `hr` | hr | Lists arrear adjustments with provenance (source period, batch, applied run). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_arrear.service.js` | [ ] | [ ✅ ] | [ ] |
| 206 | `/api/v1/payroll/hr/employees/:userId/encashments` | POST | Yes | `hr` | hr | Creates a comp-off or leave-balance encashment (Tier C direct). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `encashment.service.js` | [ ] | [ ✅ ] | [ ] |
| 207 | `/api/v1/payroll/hr/encashments` | GET | Yes | `hr` | hr | Lists encashments (filters: status, user_id, period_month, source_kind). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `encashment.service.js` | [ ] | [ ✅ ] | [ ] |
| 208 | `/api/v1/payroll/hr/encashments/:id` | GET | Yes | `hr` | hr | Encashment detail, org-scoped. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `encashment.service.js` | [ ] | [ ✅ ] | [ ] |
| 209 | `/api/v1/payroll/hr/encashments/:id/approve` | POST | Yes | `hr` | hr | Approves an encashment: dual source debit + approved adjustment (§5.5). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `encashment.service.js` | [ ] | [ ✅ ] | [ ] |
| 210 | `/api/v1/payroll/hr/encashments/:id/reject` | POST | Yes | `hr` | hr | Rejects a pending encashment (reason required). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `encashment.service.js` | [ ] | [ ✅ ] | [ ] |
| 211 | `/api/v1/payroll/hr/encashments/:id/cancel` | POST | Yes | `hr` | hr | Cancels a pending encashment, or reverses an approved one while un-applied. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `encashment.service.js` | [ ] | [ ✅ ] | [ ] |
| 212 | `/api/v1/payroll/hr/jobs/calendar-reminders/run` | POST | Yes | `hr` | hr | Manually runs the four calendar reminders for the caller's org (org-scoped, idempotent). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 213 | `/api/v1/payroll/hr/jobs/auto-draft/run` | POST | Yes | `hr` | hr | Manually creates the due auto-draft run for the caller's org (org-scoped, idempotent). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 214 | `/api/v1/payroll/hr/jobs/run-sweeper/run` | POST | Yes | `hr` | hr | Manually sweeps stale `calculating` runs for the caller's org (org-scoped, idempotent). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 215 | `/api/v1/payroll/hr/jobs/attachment-sweeper/run` | POST | Yes | `hr` | hr | Manually sweeps pending/retention attachments for the caller's org (org-scoped, idempotent). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_automation.service.js` | [ ] | [ ✅ ] | [ ] |

## Payroll Module - Manager Operations (Phase 7 — Corrections, Exits & Automation)

*Requires Feature Flag: `payroll.access`. Tier B (propose → HR approves); no exit/arrear/job endpoints (Tier C).*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 216 | `/api/v1/payroll/manager/employees/:userId/encashments` | POST | Yes | `manager`, `hr` | manager | Proposes an encashment for a direct report (lands pending unless direct-compensation authority). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `encashment.service.js` | [ ] | [ ] | [ ✅ ] |
| 217 | `/api/v1/payroll/manager/encashments` | GET | Yes | `manager`, `hr` | manager | Lists team encashments (scoped to accessible users; amounts hidden per EC-25). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `encashment.service.js` | [ ] | [ ] | [ ✅ ] |

## Payroll Module - Employee Self-Service (Phase 7 — Corrections, Exits & Automation)

*Requires Feature Flag: `payroll.access`.*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 218 | `/api/v1/payroll/me/encashments` | GET | Yes | `any tenant role` | employee | Employee views own encashment history (days, amount, status, period, payslip link). | `payroll_self.routes.js` | `payroll_self.controller.js` | `encashment.service.js` | [ ✅ ] | [ ] | [ ] |



## Document Module - HR Administration (Phase 1)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** `admin` / `super-admin` are never admitted. Every `…/documents/:id` denial is a uniform `404 DOCUMENT_NOT_FOUND`; every manager `…/employees/:userId/…` denial is `403 FORBIDDEN`. Uploads go browser → S3 through pre-signed URLs (issue → PUT → confirm); the API never carries file bytes.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/documents/hr/catalog` | GET | Yes | `hr` | hr | Browse the platform document catalog with this org's activation state (`is_activated`, `org_type_id`). Filters `plane`, `group`, `country_code`, `q`, `activated`, `include_inactive`. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 2 | `/api/v1/documents/hr/catalog/:code` | GET | Yes | `hr` | hr | One catalog entry with its `default_*` policy, for the activation preview. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 3 | `/api/v1/documents/hr/types/activate` | POST | Yes | `hr` | hr | Idempotent bulk activation `{ codes[] }` → `{ activated, reactivated, already_active }`; an unknown or withdrawn code fails the whole batch. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 4 | `/api/v1/documents/hr/types` | POST | Yes | `hr` | hr | Create a custom document type (never statutory; code may not collide with a catalog or org code). | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 5 | `/api/v1/documents/hr/types` | GET | Yes | `hr` | hr | The org's document types. Filters `plane`, `group`, `source`, `is_active`. Empty list is a valid 200. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 6 | `/api/v1/documents/hr/types/:id` | GET | Yes | `hr` | hr | One document type. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 7 | `/api/v1/documents/hr/types/:id` | PUT | Yes | `hr` | hr | Edit type policy; `code`/`plane`/`source`/`catalog_id`/`is_statutory` immutable → `409 DOCUMENT_TYPE_FIELD_IMMUTABLE`. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 8 | `/api/v1/documents/hr/types/:id/deactivate` | PATCH | Yes | `hr` | hr | Soft-deactivate: no new uploads; existing documents stay readable and verifiable. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 9 | `/api/v1/documents/hr/types/:id/activate` | PATCH | Yes | `hr` | hr | Reactivate without resetting the org's edits. | `document_hr.routes.js` | `document_hr.controller.js` | `document_type.service.js` | [ ] | [ ✅ ] | [ ] |
| 10 | `/api/v1/documents/hr/employees/:userId/documents` | POST | Yes | `hr` | hr | Issue a pre-signed S3 upload URL for an employee's document (`source=hr_upload`). | `document_hr.routes.js` | `document_hr.controller.js` | `document_upload.service.js` | [ ] | [ ✅ ] | [ ] |
| 11 | `/api/v1/documents/hr/documents/:id/confirm` | POST | Yes | `hr` | hr | Confirm the upload (HeadObject size/type check); idempotent. | `document_hr.routes.js` | `document_hr.controller.js` | `document_upload.service.js` | [ ] | [ ✅ ] | [ ] |
| 12 | `/api/v1/documents/hr/employees/:userId/documents/link-reference` | POST | Yes | `hr` | hr | Register an externally hosted document (https only); born `available`, no file stored. | `document_hr.routes.js` | `document_hr.controller.js` | `document_upload.service.js` | [ ] | [ ✅ ] | [ ] |
| 13 | `/api/v1/documents/hr/employees/:userId/documents` | GET | Yes | `hr` | hr | One employee's documents. Filters `type_id`, `status`, `group_id`, `expiring_before`, `limit`/`offset`. | `document_hr.routes.js` | `document_hr.controller.js` | `document_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 14 | `/api/v1/documents/hr/documents/verification-queue` | GET | Yes | `hr` | hr | Org-wide `pending_verification`, oldest first, with the manager recommendation. Filters `type_id`, `user_ids[]`. | `document_hr.routes.js` | `document_hr.controller.js` | `document_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 15 | `/api/v1/documents/hr/documents/:id` | GET | Yes | `hr` | hr | Document detail (masked `document_number_last4`, `display_status`). | `document_hr.routes.js` | `document_hr.controller.js` | `document_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 16 | `/api/v1/documents/hr/documents/:id/versions` | GET | Yes | `hr` | hr | The document group's version chain (v1 → vN). | `document_hr.routes.js` | `document_hr.controller.js` | `document_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 17 | `/api/v1/documents/hr/documents/:id/view-url` | GET | Yes | `hr` | hr | Short-lived signed GET (`disposition` inline/attachment); audited as `document.viewed`. | `document_hr.routes.js` | `document_hr.controller.js` | `document_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 18 | `/api/v1/documents/hr/documents/:id/verify` | POST | Yes | `hr` | hr | Verify (Tier C). `acknowledge_stale_recommendation` overrides `409 RECOMMENDATION_SCOPE_STALE`; separate-checker → `409 SELF_APPROVAL_NOT_ALLOWED`. | `document_hr.routes.js` | `document_hr.controller.js` | `document_review.service.js` | [ ] | [ ✅ ] | [ ] |
| 19 | `/api/v1/documents/hr/documents/:id/reject` | POST | Yes | `hr` | hr | Reject with a mandatory 10–500 character reason. | `document_hr.routes.js` | `document_hr.controller.js` | `document_review.service.js` | [ ] | [ ✅ ] | [ ] |
| 20 | `/api/v1/documents/hr/documents/:id/replace` | POST | Yes | `hr` | hr | Issue a replacement upload URL (v+1); the predecessor stays live until the new version is confirmed. | `document_hr.routes.js` | `document_hr.controller.js` | `document_upload.service.js` | [ ] | [ ✅ ] | [ ] |
| 21 | `/api/v1/documents/hr/documents/:id` | DELETE | Yes | `hr` | hr | Soft delete, any status; idempotent. | `document_hr.routes.js` | `document_hr.controller.js` | `document_upload.service.js` | [ ] | [ ✅ ] | [ ] |
| 22 | `/api/v1/documents/hr/documents/:id/audit-logs` | GET | Yes | `hr` | hr | The document's immutable audit trail. | `document_hr.routes.js` | `document_hr.controller.js` | `document_audit.service.js` | [ ] | [ ✅ ] | [ ] |
| 23 | `/api/v1/documents/hr/settings` | GET | Yes | `hr` | hr | Org document settings (created on first read). | `document_hr.routes.js` | `document_hr.controller.js` | `document_settings.service.js` | [ ] | [ ✅ ] | [ ] |
| 24 | `/api/v1/documents/hr/settings` | PUT | Yes | `hr` | hr | Update settings with the guard rails (`SETTINGS_CONFLICT`, `INSUFFICIENT_CHECKERS`, `SCAN_PROVIDER_NOT_CONFIGURED`, ranges). | `document_hr.routes.js` | `document_hr.controller.js` | `document_settings.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - Manager Operations (Phase 1)

*Requires Feature Flag: `documents.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 25 | `/api/v1/documents/manager/types` | GET | Yes | `manager, hr` | manager | Types the manager may view (`manager_can_view`) or upload (`manager_can_request`); never confidential; empty when manager visibility is off. | `document_manager.routes.js` | `document_manager.controller.js` | `document_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 26 | `/api/v1/documents/manager/team/documents` | GET | Yes | `manager, hr` | manager | All direct reports' visible documents. Filters `user_id`, `type_id`, `status` (available/expired/pending_verification). | `document_manager.routes.js` | `document_manager.controller.js` | `document_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 27 | `/api/v1/documents/manager/employees/:userId/documents` | GET | Yes | `manager, hr` | manager | One direct report's visible documents; out-of-scope user → `403 FORBIDDEN`. | `document_manager.routes.js` | `document_manager.controller.js` | `document_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 28 | `/api/v1/documents/manager/documents/recommendations` | GET | Yes | `manager, hr` | manager | The caller's own recommendations still awaiting HR. | `document_manager.routes.js` | `document_manager.controller.js` | `document_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 29 | `/api/v1/documents/manager/documents/:id` | GET | Yes | `manager, hr` | manager | Document detail; any denial is `404 DOCUMENT_NOT_FOUND`. | `document_manager.routes.js` | `document_manager.controller.js` | `document_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 30 | `/api/v1/documents/manager/documents/:id/view-url` | GET | Yes | `manager, hr` | manager | Short-lived signed GET for a team document. | `document_manager.routes.js` | `document_manager.controller.js` | `document_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 31 | `/api/v1/documents/manager/employees/:userId/documents` | POST | Yes | `manager, hr` | manager | Upload for a report in a `manager_can_request` type (`source=manager_upload`). | `document_manager.routes.js` | `document_manager.controller.js` | `document_upload.service.js` | [ ] | [ ] | [ ✅ ] |
| 32 | `/api/v1/documents/manager/documents/:id/confirm` | POST | Yes | `manager, hr` | manager | Confirm the upload the manager issued. | `document_manager.routes.js` | `document_manager.controller.js` | `document_upload.service.js` | [ ] | [ ] | [ ✅ ] |
| 33 | `/api/v1/documents/manager/documents/:id/recommend` | POST | Yes | `manager, hr` | manager | Tier-B recommendation `{ recommendation: verify or reject, note }`; decides directly when `manager_direct_document_authority` is ON. | `document_manager.routes.js` | `document_manager.controller.js` | `document_review.service.js` | [ ] | [ ] | [ ✅ ] |

## Document Module - Employee Self-Service (Phase 1)

*Requires Feature Flag: `documents.access`*

> **Self-scoped access.** These routes allow **any authenticated tenant role** (`employee`, `manager`, `hr`). Access is strictly bound to `req.user.id` extracted from the verified JWT.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 34 | `/api/v1/documents/me/documents/types` | GET | Yes | `any tenant role` | employee | Lists active document types available for employee self-service upload. | `document_self.routes.js` | `document_self.controller.js` | `document_type.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 35 | `/api/v1/documents/me/documents` | GET | Yes | `any tenant role` | employee | Lists employee's own uploaded documents with status and type filters. | `document_self.routes.js` | `document_self.controller.js` | `document_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 36 | `/api/v1/documents/me/documents` | POST | Yes | `any tenant role` | employee | Initiates pre-signed upload URL for employee self-service document submission. | `document_self.routes.js` | `document_self.controller.js` | `document_upload.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 37 | `/api/v1/documents/me/documents/:id/confirm` | POST | Yes | `any tenant role` | employee | Confirms self-service S3 upload and transitions document to pending. | `document_self.routes.js` | `document_self.controller.js` | `document_upload.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 38 | `/api/v1/documents/me/documents/:id` | GET | Yes | `any tenant role` | employee | Retrieves metadata and current verification status for employee's own document. | `document_self.routes.js` | `document_self.controller.js` | `document_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 39 | `/api/v1/documents/me/documents/:id/versions` | GET | Yes | `any tenant role` | employee | Retrieves complete version history for employee's own document group. | `document_self.routes.js` | `document_self.controller.js` | `document_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 40 | `/api/v1/documents/me/documents/:id/view-url` | GET | Yes | `any tenant role` | employee | Generates time-limited pre-signed view/download URL for own document. | `document_self.routes.js` | `document_self.controller.js` | `document_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 41 | `/api/v1/documents/me/documents/:id/replace` | POST | Yes | `any tenant role` | employee | Initiates replacement upload URL for expired, rejected, or updated own document. | `document_self.routes.js` | `document_self.controller.js` | `document_upload.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 42 | `/api/v1/documents/me/documents/:id` | DELETE | Yes | `any tenant role` | employee | Soft-deletes employee's own document subject to statutory protection rules. | `document_self.routes.js` | `document_self.controller.js` | `document_upload.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |



## Document Module - HR Administration (Org Documents, Phase 2)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** These routes allow **`hr` only** — platform roles (`admin`/`super-admin`) are strictly excluded. HR authors, publishes, versions, retires, and administers organization-issued documents (`org_documents` + `org_document_recipients`). Only HR may publish, replace, retire, reject, sync, or waive. All endpoints enforce tenant isolation via `req.user.orgId`; `/:id` requests collapse to a uniform `404 DOCUMENT_NOT_FOUND` on any authorization failure (§12.2).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 43 | `/api/v1/documents/hr/org-documents` | POST | Yes | `hr` | hr | Creates an org document draft and returns a pre-signed S3 upload URL (or accepts a reference URL). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 44 | `/api/v1/documents/hr/org-documents/:id` | PUT | Yes | `hr` | hr | Updates title, window, acknowledgement rules, and targeting of an unpublished draft (per-dimension merge). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 45 | `/api/v1/documents/hr/org-documents/:id/file` | POST | Yes | `hr` | hr | Issues or re-issues an S3 pre-signed upload URL for a draft file (same `storage_key`). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 46 | `/api/v1/documents/hr/org-documents/:id/file/confirm` | POST | Yes | `hr` | hr | Confirms the S3 upload via HeadObject and links the verified object to the draft. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 47 | `/api/v1/documents/hr/org-documents/:id/publish` | POST | Yes | `hr` | hr | Publishes the document, freezes the targeting snapshot, and materializes recipient rows. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 48 | `/api/v1/documents/hr/org-documents/:id/replace` | POST | Yes | `hr` | hr | Starts a replacement draft (`v+1`) under the same document group while the predecessor stays live. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 49 | `/api/v1/documents/hr/org-documents/:id/retire` | POST | Yes | `hr` | hr | Retires a published document with a mandatory reason, freeing the group live slot. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 50 | `/api/v1/documents/hr/org-documents/:id/reject` | POST | Yes | `hr` | hr | Rejects a manager-submitted proposal draft with a mandatory reason (Tier-B maker-checker). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 51 | `/api/v1/documents/hr/org-documents/:id` | DELETE | Yes | `hr` | hr | Soft-deletes a draft or rejected org document and best-effort sweeps its S3 object. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org.service.js` | [ ] | [ ✅ ] | [ ] |
| 52 | `/api/v1/documents/hr/org-documents` | GET | Yes | `hr` | hr | Lists and filters org documents across all statuses with pagination. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 53 | `/api/v1/documents/hr/org-documents/proposals` | GET | Yes | `hr` | hr | Lists the HR review queue of manager-submitted draft proposals. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 54 | `/api/v1/documents/hr/org-documents/groups/:groupId` | GET | Yes | `hr` | hr | Returns the full version chain for a document group in version order. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 55 | `/api/v1/documents/hr/org-documents/:id` | GET | Yes | `hr` | hr | Retrieves full metadata and derived display status for an org document. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 56 | `/api/v1/documents/hr/org-documents/:id/versions` | GET | Yes | `hr` | hr | Returns the version history for the document group. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 57 | `/api/v1/documents/hr/org-documents/:id/view-url` | GET | Yes | `hr` | hr | Generates a short-lived pre-signed view/download URL for the document object. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 58 | `/api/v1/documents/hr/org-documents/:id/audit-logs` | GET | Yes | `hr` | hr | Retrieves the append-only immutable audit trail for the document. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 59 | `/api/v1/documents/hr/org-documents/:id/recipients` | GET | Yes | `hr` | hr | Returns the recipient roster with compliance tallies and per-employee state. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_org_read.service.js` | [ ] | [ ✅ ] | [ ] |
| 60 | `/api/v1/documents/hr/org-documents/:id/recipients/sync` | POST | Yes | `hr` | hr | Tops up recipients for newly eligible employees against the frozen criteria (fair due date). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_recipient.service.js` | [ ] | [ ✅ ] | [ ] |
| 61 | `/api/v1/documents/hr/org-documents/:id/recipients/:userId/waive` | POST | Yes | `hr` | hr | Waives an individual recipient with a mandatory reason (`pending`/`viewed` to `waived`). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_recipient.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - Manager Operations (Org Documents, Phase 2)

*Requires Feature Flag: `documents.access`*

> **Hierarchy-scoped Tier-B proposals.** These routes allow **`manager` and `hr`**. Managers may only draft proposals targeting a single active direct report and can never publish, retire, reject, sync, or waive. The manager type list is additionally gated by the org setting `manager_can_view_team_documents`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 62 | `/api/v1/documents/manager/org-documents/types` | GET | Yes | `manager, hr` | manager | Lists org-plane document types the manager is permitted to propose (empty when org disables team documents). | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_type.repository.js` | [ ] | [ ] | [ ✅ ] |
| 63 | `/api/v1/documents/manager/org-documents` | POST | Yes | `manager, hr` | manager | Drafts an org document proposal targeting exactly one direct report and returns an upload URL. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org.service.js` | [ ] | [ ] | [ ✅ ] |
| 64 | `/api/v1/documents/manager/org-documents/:id` | PUT | Yes | `manager, hr` | manager | Updates metadata/target of the manager own unreviewed proposal draft. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org.service.js` | [ ] | [ ] | [ ✅ ] |
| 65 | `/api/v1/documents/manager/org-documents/:id/file` | POST | Yes | `manager, hr` | manager | Issues or re-issues an S3 pre-signed upload URL for a proposal attachment. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org.service.js` | [ ] | [ ] | [ ✅ ] |
| 66 | `/api/v1/documents/manager/org-documents/:id/file/confirm` | POST | Yes | `manager, hr` | manager | Confirms the proposal S3 upload via HeadObject. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org.service.js` | [ ] | [ ] | [ ✅ ] |
| 67 | `/api/v1/documents/manager/org-documents/mine` | GET | Yes | `manager, hr` | manager | Lists all proposals drafted/submitted by the authenticated manager. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 68 | `/api/v1/documents/manager/org-documents/:id` | GET | Yes | `manager, hr` | manager | Retrieves details and status of the manager own proposal. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org_read.service.js` | [ ] | [ ] | [ ✅ ] |
| 69 | `/api/v1/documents/manager/org-documents/:id/view-url` | GET | Yes | `manager, hr` | manager | Generates a pre-signed view URL for the proposal attachment. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_org_read.service.js` | [ ] | [ ] | [ ✅ ] |

## Document Module - Employee Self-Service (My HR Documents, Phase 2)

*Requires Feature Flag: `documents.access`*

> **Recipient-scoped access.** These routes allow **any authenticated tenant role** (`employee`, `manager`, `hr`) but only surface documents issued to the caller (an `org_document_recipients` row). Non-recipient `/:id` access returns a uniform `404 DOCUMENT_NOT_FOUND`; co-recipients, targeting criteria, and HR notes are never exposed.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 70 | `/api/v1/documents/me/hr-documents` | GET | Yes | `any tenant role` | employee | Lists organization documents issued to the authenticated employee. | `document_org_self.routes.js` | `document_org_self.controller.js` | `document_org_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 71 | `/api/v1/documents/me/hr-documents/:id` | GET | Yes | `any tenant role` | employee | Retrieves an issued document details (recipient-scoped). | `document_org_self.routes.js` | `document_org_self.controller.js` | `document_org_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 72 | `/api/v1/documents/me/hr-documents/:id/view-url` | GET | Yes | `any tenant role` | employee | Generates a view URL and stamps first view (`pending` to `viewed`). | `document_org_self.routes.js` | `document_org_self.controller.js` | `document_org_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |



## Document Module - Employee Self-Service (Acknowledgements & Signatures, Phase 3)

*Requires Feature Flag: `documents.access`*

> **Recipient-anchored.** These routes allow **any authenticated tenant role** (`employee`, `manager`, `hr`) and act only on the caller's own recipient row. Evidence is append-only: an acknowledgement or signature can never be edited or deleted. A replay returns `200` with `already_acknowledged` / `already_signed: true`; the first write returns `201`. Non-recipient `/:id` access returns a uniform `404 DOCUMENT_NOT_FOUND`. Also extends #70/#71 with an `acknowledgement` block and `document.next_action`, and #59 with a `compliance` block (additive).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 73 | `/api/v1/documents/me/hr-documents/:id/acknowledge` | POST | Yes | `any tenant role` | employee | Records the caller's immutable acknowledgement (version, checksum, timestamp, IP); idempotent replay returns 200. | `document_org_self.routes.js` | `document_org_self.controller.js` | `document_acknowledgement.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 74 | `/api/v1/documents/me/hr-documents/:id/sign` | POST | Yes | `any tenant role` | employee | Typed signature verified against the caller's profile name (`SIGNER_NAME_MISMATCH` discloses nothing); provider comes from org settings. | `document_org_self.routes.js` | `document_org_self.controller.js` | `document_acknowledgement.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 75 | `/api/v1/documents/me/hr-documents/:id/acknowledgement` | GET | Yes | `any tenant role` | employee | Returns the caller's own acknowledgement and/or signature receipt; `404` until one exists. | `document_org_self.routes.js` | `document_org_self.controller.js` | `document_acknowledgement.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Document Module - HR Administration (Compliance & Legal Evidence, Phase 3)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** These routes allow **`hr` only** — platform roles (`admin`/`super-admin`) are strictly excluded. HR reads organization-wide compliance rosters, streams forensic CSV exports (UTF-8 BOM, formula-injection escaped, capped at 50,000 rows), and retrieves a single employee's acknowledgement/signature evidence. Read-only; all endpoints enforce tenant isolation via `req.user.orgId`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 76 | `/api/v1/documents/hr/org-documents/compliance` | GET | Yes | `hr` | hr | Returns the org-wide compliance roster grouped by document with completion rate and pending, overdue, and waived tallies (filter by type/document/department, overdue-only). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_compliance.service.js` | [ ] | [ ✅ ] | [ ] |
| 77 | `/api/v1/documents/hr/org-documents/compliance/export` | GET | Yes | `hr` | hr | Streams the full recipient compliance roster as a UTF-8 BOM CSV with formula-injection protection (`Content-Disposition: attachment`, capped at 50,000 rows). | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_compliance.service.js` | [ ] | [ ✅ ] | [ ] |
| 78 | `/api/v1/documents/hr/org-documents/:id/acknowledgements/:userId` | GET | Yes | `hr` | hr | Retrieves a single employee's acknowledgement or signature evidence for a document (legal audit trail); `404` when no evidence exists. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_acknowledgement.service.js` | [ ] | [ ✅ ] | [ ] |
## Document Module - Manager Operations (Team Compliance, Phase 3)

*Requires Feature Flag: `documents.access`*

> **Hierarchy-scoped team compliance.** These routes allow **`manager` and `hr`**. The manager sees compliance only for their direct/indirect reports and never for confidential documents. The endpoint is gated by the org setting `manager_can_view_team_documents`; when disabled it returns `403 FORBIDDEN`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 79 | `/api/v1/documents/manager/org-documents/compliance` | GET | Yes | `manager, hr` | manager | Returns team compliance metrics for the manager's direct/indirect reports (excludes confidential documents); gated by the org setting `manager_can_view_team_documents`. | `document_org_manager.routes.js` | `document_org_manager.controller.js` | `document_compliance.service.js` | [ ] | [ ] | [ ✅ ] |




## Document Module - HR Administration (Requests, Notifications & Automation, Phase 4)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** These routes allow **`hr` only** — platform roles (`admin`/`super-admin`) are strictly excluded. HR raises document requests against employees, reads the required-document checklist, inspects the notification outbox, and triggers the five background jobs manually. All endpoints enforce tenant isolation via `req.user.orgId`; the manual job triggers ignore any `org_id` in the body and scope to `req.user.orgId` only. `/document-requests/:id` requests collapse to a uniform `404 REQUEST_NOT_FOUND` on any authorization failure.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 80 | `/api/v1/documents/hr/employees/:userId/document-requests` | POST | Yes | `hr` | hr | Raises a document request against one employee for one document type (optional `due_on`, optional `note`). Returns `409 DOCUMENT_ALREADY_PRESENT` when a live document exists, `409 DUPLICATE_REQUEST` (with the existing id) when an open request already exists. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_request.service.js` | [ ] | [ ✅ ] | [ ] |
| 81 | `/api/v1/documents/hr/employees/:userId/document-requests/bulk-from-checklist` | POST | Yes | `hr` | hr | Raises one request per outstanding checklist item in a single transaction (per-item savepoint; already-requested items are skipped). `409 NOTHING_TO_REQUEST` when the checklist is already complete. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_request.service.js` | [ ] | [ ✅ ] | [ ] |
| 82 | `/api/v1/documents/hr/document-requests` | GET | Yes | `hr` | hr | Lists org-wide document requests with filters (`status` repeatable, `user_id`, `document_type_id`, `overdue_only`) and pagination. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_request.service.js` | [ ] | [ ✅ ] | [ ] |
| 83 | `/api/v1/documents/hr/document-requests/:id` | GET | Yes | `hr` | hr | Retrieves one document request (HR projection includes `reminder_count` and `last_reminder_on`). | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_request.service.js` | [ ] | [ ✅ ] | [ ] |
| 84 | `/api/v1/documents/hr/document-requests/:id/cancel` | POST | Yes | `hr` | hr | Cancels an open/overdue request with a mandatory `reason`; a settled request returns `409`. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_request.service.js` | [ ] | [ ✅ ] | [ ] |
| 85 | `/api/v1/documents/hr/document-requests/:id/remind` | POST | Yes | `hr` | hr | Sends the overdue notice now; idempotent per day (returns `reminded: false, reason: already_reminded_today` on a repeat same-day call). | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_request.service.js` | [ ] | [ ✅ ] | [ ] |
| 86 | `/api/v1/documents/hr/employees/:userId/checklist` | GET | Yes | `hr` | hr | Returns the required-document checklist and onboarding completeness for one employee. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_checklist.service.js` | [ ] | [ ✅ ] | [ ] |
| 87 | `/api/v1/documents/hr/notifications` | GET | Yes | `hr` | hr | Lists the notification outbox (org-scoped; filters `status`, `event_type`, `from`, `to`; `dedupe_key` is never returned). | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_notification.service.js` | [ ] | [ ✅ ] | [ ] |
| 88 | `/api/v1/documents/hr/jobs/expiry-sweep/run` | POST | Yes | `hr` | hr | Manually runs the expiry-flip job for the caller's org (`available → expired`). | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 89 | `/api/v1/documents/hr/jobs/document-reminders/run` | POST | Yes | `hr` | hr | Manually runs the reminder job for the caller's org (overdue flip + expiry/acknowledgement/overdue-request reminders). | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 90 | `/api/v1/documents/hr/jobs/notification-dispatch/run` | POST | Yes | `hr` | hr | Manually drains the notification outbox for the caller's org. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 91 | `/api/v1/documents/hr/jobs/document-sweeper/run` | POST | Yes | `hr` | hr | Manually runs the retention/abandoned sweeper for the caller's org (destructive; statutory never swept). | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 92 | `/api/v1/documents/hr/jobs/recipient-topup/run` | POST | Yes | `hr` | hr | Manually runs the org-document recipient top-up for the caller's org. | `document_request_hr.routes.js` | `document_request_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - Manager Operations (Requests & Checklists, Phase 4)

*Requires Feature Flag: `documents.access`*

> **Hierarchy-scoped access.** These routes allow **`manager` and `hr`**. A manager acts only within their reporting cohort (`getAccessibleUserIds`); an empty scope grants nothing (never the whole org). A manager may cancel only a request they raised for an in-scope employee. `/employees/:userId/...` out-of-scope access returns `403 FORBIDDEN`; `/document-requests/:id` out-of-scope or not-the-requester access returns a uniform `404 REQUEST_NOT_FOUND`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 93 | `/api/v1/documents/manager/employees/:userId/document-requests` | POST | Yes | `manager, hr` | manager | Raises a document request for a direct report (only for a type whose policy allows manager requests). | `document_request_manager.routes.js` | `document_request_manager.controller.js` | `document_request.service.js` | [ ] | [ ] | [ ✅ ] |
| 94 | `/api/v1/documents/manager/document-requests` | GET | Yes | `manager, hr` | manager | Lists document requests scoped to the manager's cohort (manager projection omits `last_reminder_on`). | `document_request_manager.routes.js` | `document_request_manager.controller.js` | `document_request.service.js` | [ ] | [ ] | [ ✅ ] |
| 95 | `/api/v1/documents/manager/document-requests/:id/cancel` | POST | Yes | `manager, hr` | manager | Cancels a request the manager raised for an in-scope employee (mandatory `reason`). | `document_request_manager.routes.js` | `document_request_manager.controller.js` | `document_request.service.js` | [ ] | [ ] | [ ✅ ] |
| 96 | `/api/v1/documents/manager/employees/:userId/checklist` | GET | Yes | `manager, hr` | manager | Returns a direct report's checklist (confidential-type links withheld per manager view policy). | `document_request_manager.routes.js` | `document_request_manager.controller.js` | `document_checklist.service.js` | [ ] | [ ] | [ ✅ ] |

## Document Module - Employee Self-Service (Requests & Checklists, Phase 4)

*Requires Feature Flag: `documents.access`*

> **Self-scoped access.** These routes allow **any authenticated tenant role** (`employee`, `manager`, `hr`) but surface only rows anchored to the caller (`req.user.id`); `actorRole` is forced to `self`, so an HR or manager user hitting `/me` sees only their own requests and checklist. The self projection withholds `reminder_count` and `last_reminder_on`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 97 | `/api/v1/documents/me/document-requests` | GET | Yes | `any tenant role` | employee | Lists the caller's own document requests (filters `status`, `document_type_id`, `overdue_only`; pagination). | `document_request_self.routes.js` | `document_request_self.controller.js` | `document_request.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 98 | `/api/v1/documents/me/checklist` | GET | Yes | `any tenant role` | employee | Returns the caller's own required-document checklist and onboarding completeness. | `document_request_self.routes.js` | `document_request_self.controller.js` | `document_checklist.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |



## Document Module - HR Templates (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** These routes allow **`hr` only** — platform roles (`admin`/`super-admin`) are excluded. HR authors document templates through a draft → published → archived lifecycle with S3 file staging (zero-binary-transit: presigned PUT + HeadObject confirm). Publishing archives the prior version in the same group; only a **draft** may be deleted. All routes scope to `req.user.orgId`; any cross-tenant or missing id collapses to `404 TEMPLATE_NOT_FOUND`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 99 | `/api/v1/documents/hr/templates` | POST | Yes | `hr` | hr | Creates a draft template (metadata only; no file yet). | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 100 | `/api/v1/documents/hr/templates/:id` | PATCH | Yes | `hr` | hr | Updates draft metadata; `404 TEMPLATE_NOT_FOUND` on a foreign/absent id, `409` if not a draft. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 101 | `/api/v1/documents/hr/templates/:id/file-url` | POST | Yes | `hr` | hr | Issues a presigned **PUT** URL for the template file (client uploads directly to S3). | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 102 | `/api/v1/documents/hr/templates/:id/confirm` | POST | Yes | `hr` | hr | HeadObject-verifies the uploaded file (size/type) and records it against the draft. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 103 | `/api/v1/documents/hr/templates/:id/publish` | POST | Yes | `hr` | hr | Transitions draft → published; archives the previously published version in the group. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 104 | `/api/v1/documents/hr/templates/:id/replace` | POST | Yes | `hr` | hr | Opens the next draft version in the same template group (version chain). | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 105 | `/api/v1/documents/hr/templates/:id/archive` | POST | Yes | `hr` | hr | Transitions published → archived (retires the template from the employee catalogue). | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 106 | `/api/v1/documents/hr/templates/:id` | DELETE | Yes | `hr` | hr | Soft-deletes a **draft only**; a published/archived template returns `409`. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 107 | `/api/v1/documents/hr/templates` | GET | Yes | `hr` | hr | Lists templates across all statuses (filters `status`, `type`, `q`). | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 108 | `/api/v1/documents/hr/templates/:id` | GET | Yes | `hr` | hr | Template detail. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 109 | `/api/v1/documents/hr/templates/:id/versions` | GET | Yes | `hr` | hr | Returns the full version chain for the template's group. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |
| 110 | `/api/v1/documents/hr/templates/:id/download-url` | GET | Yes | `hr` | hr | Signed **GET** (attachment disposition) for the template file. | `document_template_hr.routes.js` | `document_template_hr.controller.js` | `document_template.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - Employee Templates (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Self-scoped catalogue.** These routes allow **any authenticated tenant role** and surface only **published** templates the caller is entitled to see (employee-visible flag + document-type visibility gate). A template hidden from the caller returns `404 TEMPLATE_NOT_FOUND`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 111 | `/api/v1/documents/templates` | GET | Yes | `any tenant role` | employee | Lists published, employee-visible, type-gate-passed templates. | `document_template_self.routes.js` | `document_template_self.controller.js` | `document_template.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 112 | `/api/v1/documents/templates/:id/download-url` | GET | Yes | `any tenant role` | employee | Signed **GET** for a template the caller may see. | `document_template_self.routes.js` | `document_template_self.controller.js` | `document_template.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Document Module - HR Search, Tags, Reports & Exports (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** These routes allow **`hr` only**. They cover org-wide metadata search, tag editing, the two compliance roll-ups (missing-mandatory, expiring), and the export ledger. Every `.csv` variant streams the same data and writes an **export-ledger** row for audit. All routes scope to `req.user.orgId`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 113 | `/api/v1/documents/hr/documents/search` | GET | Yes | `hr` | hr | Metadata search across employee documents (filters + pagination). | `document_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 114 | `/api/v1/documents/hr/documents/search.csv` | GET | Yes | `hr` | hr | Search results as CSV (+ export-ledger row). | `document_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 115 | `/api/v1/documents/hr/reports/missing-mandatory` | GET | Yes | `hr` | hr | Org-wide missing-mandatory-document roll-up. | `document_report_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 116 | `/api/v1/documents/hr/reports/missing-mandatory.csv` | GET | Yes | `hr` | hr | Missing-mandatory roll-up as CSV (+ export-ledger row). | `document_report_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 117 | `/api/v1/documents/hr/reports/expiring` | GET | Yes | `hr` | hr | Expiring-in-N-days report with day-bucket grouping. | `document_report_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 118 | `/api/v1/documents/hr/reports/expiring.csv` | GET | Yes | `hr` | hr | Expiring report as CSV (+ export-ledger row). | `document_report_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |
| 119 | `/api/v1/documents/hr/exports` | GET | Yes | `hr` | hr | Lists the export ledger (who exported what, when). | `document_report_hr.routes.js` | `document_report_hr.controller.js` | `document_export.service.js` | [ ] | [ ✅ ] | [ ] |
| 120 | `/api/v1/documents/hr/exports/:id` | GET | Yes | `hr` | hr | Export-ledger detail; `404` on a foreign/absent id. | `document_report_hr.routes.js` | `document_report_hr.controller.js` | `document_export.service.js` | [ ] | [ ✅ ] | [ ] |
| 121 | `/api/v1/documents/hr/documents/:id/tags` | PATCH | Yes | `hr` | hr | Replaces a document's tag array; `404 DOCUMENT_NOT_FOUND` on a foreign/absent id. | `document_hr.routes.js` | `document_report_hr.controller.js` | `document_report.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - HR Offboarding & Materialisation Jobs (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** These routes allow **`hr` only** and are hierarchy-agnostic (HR acts org-wide). Offboarding archives/waives/cancels a leaver's document footprint and composes an exit pack; the two manual job triggers ignore any body `org_id` and scope to `req.user.orgId`. `/employees/:userId/...` out-of-org access returns `403 FORBIDDEN`. The exit-pack CSV carries **no signed URLs** (metadata only) and writes an export-ledger row.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 122 | `/api/v1/documents/hr/employees/:userId/offboard-documents` | POST | Yes | `hr` | hr | Archives, waives and cancels the leaver's document footprint (supports `dry_run` and `force`). | `document_offboarding_hr.routes.js` | `document_offboarding_hr.controller.js` | `document_offboarding.service.js` | [ ] | [ ✅ ] | [ ] |
| 123 | `/api/v1/documents/hr/employees/:userId/exit-pack` | GET | Yes | `hr` | hr | Exit-pack manifest with short-TTL signed URLs. | `document_offboarding_hr.routes.js` | `document_offboarding_hr.controller.js` | `document_offboarding.service.js` | [ ] | [ ✅ ] | [ ] |
| 124 | `/api/v1/documents/hr/employees/:userId/exit-pack.csv` | GET | Yes | `hr` | hr | Exit-pack metadata as CSV (**no URLs**; + export-ledger row). | `document_offboarding_hr.routes.js` | `document_offboarding_hr.controller.js` | `document_export.service.js` | [ ] | [ ✅ ] | [ ] |
| 125 | `/api/v1/documents/hr/jobs/offboarding-archive/run` | POST | Yes | `hr` | hr | Manually runs the offboarding-archive cron for the caller's org. | `document_offboarding_hr.routes.js` | `document_offboarding_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |
| 129 | `/api/v1/documents/hr/jobs/publish-materialisation/run` | POST | Yes | `hr` | hr | Manually runs the org-document publish-materialiser cron for the caller's org. | `document_offboarding_hr.routes.js` | `document_offboarding_hr.controller.js` | `document_automation.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - Employee Composed View (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Self-scoped.** Allows **any authenticated tenant role**; surfaces only the caller's own portfolio (`req.user.id`).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 126 | `/api/v1/documents/me/documents/all` | GET | Yes | `any tenant role` | employee | Composed four-section employee portfolio (own uploads, org-issued, templates, payroll). | `document_self.routes.js` | `document_self.controller.js` | `document_composer.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Document Module - HR Org-Document Materialisation Progress (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Tenant-plane only.** Allows **`hr` only**; reports background-fill progress for an org document whose publish was deferred (response `202`) once its audience crossed `document_publish_sync_threshold` (setting #79). `404` on a foreign/absent id.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 127 | `/api/v1/documents/hr/org-documents/:id/materialisation` | GET | Yes | `hr` | hr | Materialisation progress (recipients filled / total) for a deferred org-document publish. | `document_org_hr.routes.js` | `document_org_hr.controller.js` | `document_recipient.service.js` | [ ] | [ ✅ ] | [ ] |

## Document Module - Audience-Neutral Attachment View URL (Phase 5)

*Requires Feature Flag: `documents.access`*

> **Audience-neutral, employee-plane.** Allows **any authenticated tenant role**; resolves the reader's plane from the token (owner ⇒ self, reporting chain ⇒ manager, HR ⇒ hr) and applies the standard document authority matrix. It grants no new capability — it exists so a single stored string (a leave's `document_url`) is correct for the applicant, their manager chain and HR alike. Everyone else, any cross-tenant id, and a confidential type the reader may not see all collapse to a uniform `404`. `?redirect=true` answers `302` with the signed URL in `Location`; otherwise a `200` JSON body carries `view_url`. See [F-8 change record](../md_updates/2026-09-25_leave_document_attachment_bridge.md).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 128 | `/api/v1/documents/attachments/:id/view-url` | GET | Yes | `any tenant role` | employee | Audience-neutral signed view URL for an employee document (owner / manager chain / HR); `?redirect=true` ⇒ `302`. | `document_attachment.routes.js` | `document_attachment.controller.js` | `document_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
