# HRMS System API Registry

This matrix provides a comprehensive mapping of every API endpoint in the system to its functionality, security boundaries, and source code files. It serves as a master index for developers to quickly understand system capabilities and trace the execution path of any request.

> **Dashboard column:** Indicates which dashboard(s) the endpoint belongs to. Values are restricted to `hr`, `manager`, and `employee` (combined when an endpoint is surfaced on more than one dashboard). `admin` / `super-admin` roles are treated as part of the `hr` (administration) dashboard; `guest` onboarding flows that create/administer the org are attributed to `hr`.

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
| 10 | `/api/v1/auth/health` | GET | No | N/A | hr, manager, employee | Simple health check endpoint to verify the auth service is running. | `health.routes.js` | N/A | N/A | [ ] | [ ] | [ ] |

## Organization Module

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/organizations/invitations/validate` | GET | No | N/A | hr, manager, employee | Validates an invitation token before accepting it. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/organizations/register/initiate` | POST | Yes | `guest` | hr | Initiates the creation of a new organization and handles free/paid plan logic. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/organizations/register/verify-payment` | POST | Yes | `guest` | hr | Verifies a Razorpay payment signature and activates the organization's paid subscription. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/organizations/users/invite` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Sends an email invitation to a new or existing user to join the organization. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/organizations/users/invite/revoke` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Revokes a pending invitation to prevent the user from joining the organization. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 6 | `/api/v1/organizations/users/invite/resend` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Resends the invitation email to a pending user. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 7 | `/api/v1/organizations/invitations/accept` | POST | Optional | N/A | hr, manager, employee | Accepts an organization invitation and provisions the user profile inside the tenant. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/organizations/employees` | GET | Yes | `super-admin, admin, hr, manager` | hr, manager | Employee list. HR/admin: whole org (purpose-driven). Managers are hierarchy-scoped server-side to their direct reports and receive a roster-safe projection (no PAN/UAN/address/DOB/personal_email). Optional `search`/`department_id`/`include_inactive` filters. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/organizations/employees/:id` | GET | Yes | `super-admin, admin, hr, manager` | hr, manager | Detailed employee profile. Managers may only read their own record or a direct report's — cross-team ids return 403 (BOLA/IDOR guard, scope checked before existence). HR/admin unrestricted. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 10 | `/api/v1/organizations/employees/:id/status` | PATCH | Yes | `super-admin, admin, hr` | hr | Activates or deactivates an employee's access to the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/organizations/employees/:id` | DELETE | Yes | `super-admin, admin, hr` | hr | Soft-deletes an employee and removes their reporting mappings. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 12 | `/api/v1/organizations/users/:id/department-transfer` | PUT | Yes | `super-admin, admin, hr` | hr | Transfers an employee to a new department and updates reporting hierarchies. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/organizations/locations` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a list of all geographical office locations for the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 14 | `/api/v1/organizations/locations` | POST | Yes | `super-admin, admin, hr` | hr | Creates a new office location for the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 15 | `/api/v1/organizations/locations/:id` | PUT | Yes | `super-admin, admin, hr` | hr | Updates details of an existing office location. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 16 | `/api/v1/organizations/departments` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a list of all departments in the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 17 | `/api/v1/organizations/departments` | POST | Yes | `super-admin, admin, hr` | hr | Creates a new department and optionally assigns a Head of Department. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 18 | `/api/v1/organizations/departments/:id` | PUT | Yes | `super-admin, admin, hr` | hr | Updates an existing department and manages HOD reporting line swaps. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 19 | `/api/v1/organizations/me` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches the logged-in user's own full profile (reuses the employee-detail view scoped to self). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 20 | `/api/v1/organizations/me` | PATCH | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Updates the logged-in user's own personal fields (whitelisted; department/designation/gender/marital_status/employee_code locked). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 21 | `/api/v1/organizations/directory` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a public-safe employee directory (name, email, avatar, role, department, designation, work location only). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 22 | `/api/v1/organizations/employees/:id` | PATCH | Yes | `super-admin, admin, hr, manager` | hr, manager | Edits a team member's personal profile fields (whitelisted, same set as self-service). Managers are hierarchy-scoped to direct reports (cross-team id → 403); self-edits are rejected (use `/me`). Role/department/designation/employee_code and leave-gate demographics are not editable here. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Attendance Module - Employee Self-Service

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/today` | GET | Yes | `all` | hr, manager, employee | Fetches the authenticated user's live attendance status for today. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/attendance/history` | GET | Yes | `all` | hr, manager, employee | Fetches the user's historical attendance records with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/attendance/summary` | GET | Yes | `all` | hr, manager, employee | Fetches the user's aggregated monthly attendance summary (total present, late, etc). | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/attendance/shift` | GET | Yes | `all` | hr, manager, employee | Fetches the user's currently active assigned shift details. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/attendance/clock-in` | POST | Yes | `all` | hr, manager, employee | Records a clock-in punch and validates GPS geofencing rules. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 6 | `/api/v1/attendance/clock-out` | POST | Yes | `all` | hr, manager, employee | Records a clock-out punch and triggers the payroll hours calculation engine. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 7 | `/api/v1/attendance/break/start` | POST | Yes | `all` | hr, manager, employee | Records the start of a designated break period. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/attendance/break/end` | POST | Yes | `all` | hr, manager, employee | Records the end of a break period and updates total break duration. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/attendance/regularization` | POST | Yes | `all` | hr, manager, employee | Submits a request to retroactively modify an attendance record's timestamps. | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 10 | `/api/v1/attendance/regularizations` | GET | Yes | `all` | hr, manager, employee | Fetches a list of the user's submitted regularization requests and their statuses. | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 11 | `/api/v1/attendance/daily-log` | GET | Yes | `all` | hr, manager, employee | Fetches the user's detailed minute-by-minute punch logs for a specific day. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 12 | `/api/v1/attendance/graph-data` | GET | Yes | `all` | hr, manager, employee | Fetches time-series data for rendering the user's attendance trends chart. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 13 | `/api/v1/attendance/trends` | GET | Yes | `all` | hr, manager, employee | Fetches aggregated trend insights regarding the user's punctuality and hours. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 14 | `/api/v1/attendance/weekly-calendar` | GET | Yes | `all` | hr, manager, employee | Fetches the user's attendance status mapped to a 7-day weekly calendar view. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 15 | `/api/v1/attendance/holidays` | GET | Yes | `all` | hr, manager, employee | Fetches the list of upcoming organizational holidays applicable to the user. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `holiday.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 16 | `/api/v1/attendance/regularizations/:id/cancel` | POST | Yes | `all` | hr, manager, employee | Withdraws the user's own pending regularization request (self-scoped, row-locked, rejects already-processed requests). | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/attendance/overtime/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own overtime requests with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `overtime.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 18 | `/api/v1/attendance/anomalies/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own attendance anomalies, filterable by status (open/resolved/all). | `user_attendance.routes.js` | `user_attendance.controller.js` | `anomaly.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 19 | `/api/v1/attendance/comp-offs/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own compensatory-off requests with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `comp_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 20 | `/api/v1/attendance/comp-offs/mine/summary` | GET | Yes | `all` | hr, manager, employee | Fetches the user's aggregated comp-off balance summary. | `user_attendance.routes.js` | `user_attendance.controller.js` | `comp_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Attendance Module - Manager Operations

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/manager/team/today` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches the live daily attendance status of all subordinates reporting to the manager. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `team.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/attendance/manager/team/history` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches historical attendance records for the manager's team. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `team.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/attendance/manager/team/anomalies` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches unresolved system-generated anomalies (like GPS breaches) for the team. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `anomaly.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/attendance/manager/anomalies/:id/resolve` | POST | Yes | `manager, hr, admin` | manager, hr | Allows a manager to manually resolve and dismiss a subordinate's attendance anomaly. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `anomaly.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/attendance/manager/regularizations/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending regularization requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 6 | `/api/v1/attendance/manager/regularizations/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a regularization request and forces a recalculation of payroll hours. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/attendance/manager/regularizations/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's regularization request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/attendance/manager/overtime/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending overtime requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/attendance/manager/overtime/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a subordinate's overtime request for payroll processing. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/attendance/manager/overtime/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's overtime request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/attendance/manager/comp-offs/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending compensatory-off requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 12 | `/api/v1/attendance/manager/comp-offs/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a subordinate's comp-off request and credits their leave balance. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/attendance/manager/comp-offs/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's comp-off request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 14 | `/api/v1/attendance/manager/team/summary` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches aggregated attendance summaries for the entire team over a specific period. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 15 | `/api/v1/attendance/manager/team/member/:userId/history` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches detailed attendance history for a specific subordinate. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 16 | `/api/v1/attendance/manager/team/member/:userId/summary` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches the attendance summary metrics for a specific subordinate. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/attendance/manager/team/graph-data` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches time-series data for rendering the manager's team attendance trends chart. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Attendance Module - HR Administration

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/hr/policies` | POST | Yes | `hr, admin` | hr | Creates a new organizational policy defining grace periods and half-day rules. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/attendance/hr/policies` | GET | Yes | `hr, admin` | hr | Fetches a list of all attendance policies defined in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/attendance/hr/policies/:id` | GET | Yes | `hr, admin` | hr | Fetches details for a specific attendance policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/attendance/hr/policies/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing attendance policy's rules and thresholds. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/attendance/hr/policies/:id/deactivate` | PATCH | Yes | `hr, admin` | hr | Deactivates an attendance policy, preventing future assignments. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/attendance/hr/shifts/assign` | POST | Yes | `hr, admin` | hr | Assigns an employee to a specific shift schedule or rotation pattern. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 7 | `/api/v1/attendance/hr/shifts/assignments` | GET | Yes | `hr, admin` | hr | Fetches a ledger of historical and active shift assignments. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/attendance/hr/shifts/assignments/:assignment_id` | DELETE | Yes | `hr, admin` | hr | Hard-deletes a shift assignment record. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/attendance/hr/shifts/assignments/:assignment_id/end` | POST | Yes | `hr, admin` | hr | Closes an active shift assignment by setting its end date. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/attendance/hr/shifts` | POST | Yes | `hr, admin` | hr | Creates a new shift template defining start times and work hours. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 11 | `/api/v1/attendance/hr/shifts` | GET | Yes | `hr, admin` | hr | Fetches all shift templates defined in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 12 | `/api/v1/attendance/hr/shifts/:id` | GET | Yes | `hr, admin` | hr | Fetches details for a specific shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 13 | `/api/v1/attendance/hr/shifts/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 14 | `/api/v1/attendance/hr/shifts/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 15 | `/api/v1/attendance/hr/rotations` | POST | Yes | `hr, admin` | hr | Creates a complex repeating shift pattern (e.g., 5 days morning, 2 days off). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 16 | `/api/v1/attendance/hr/rotations` | GET | Yes | `hr, admin` | hr | Fetches all rotation patterns in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 17 | `/api/v1/attendance/hr/rotations/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a rotation pattern. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 18 | `/api/v1/attendance/hr/holidays` | POST | Yes | `hr, admin` | hr | Creates a new organization-wide or location-specific holiday. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 19 | `/api/v1/attendance/hr/holidays` | GET | Yes | `hr, admin` | hr | Fetches all configured holidays for the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 20 | `/api/v1/attendance/hr/holidays/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing holiday's details. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 21 | `/api/v1/attendance/hr/holidays/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a configured holiday. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 22 | `/api/v1/attendance/hr/weekly-offs` | POST | Yes | `hr, admin` | hr | Creates a rule defining default rest days (e.g., Saturdays and Sundays). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 23 | `/api/v1/attendance/hr/weekly-offs` | GET | Yes | `hr, admin` | hr | Fetches all weekly off rules. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 24 | `/api/v1/attendance/hr/weekly-offs/:id` | PUT | Yes | `hr, admin` | hr | Updates a weekly off rule. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 25 | `/api/v1/attendance/hr/weekly-offs/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a weekly off rule. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 26 | `/api/v1/attendance/hr/devices` | POST | Yes | `hr, admin` | hr | Registers a biometric hardware device and generates its secure API key. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 27 | `/api/v1/attendance/hr/devices` | GET | Yes | `hr, admin` | hr | Fetches a list of all registered biometric devices. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 28 | `/api/v1/attendance/hr/devices/:id` | PUT | Yes | `hr, admin` | hr | Updates biometric device configuration details. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 29 | `/api/v1/attendance/hr/devices/:id` | DELETE | Yes | `hr, admin` | hr | Deactivates and deletes a registered biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 30 | `/api/v1/attendance/hr/devices/:id/mappings` | POST | Yes | `hr, admin` | hr | Links an employee ID from HRMS to an internal hardware user ID on a device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 31 | `/api/v1/attendance/hr/devices/:id/mappings` | GET | Yes | `hr, admin` | hr | Fetches all employee mappings for a specific biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 32 | `/api/v1/attendance/hr/devices/:id/mappings/:mappingId` | DELETE | Yes | `hr, admin` | hr | Removes a mapping linking an employee to a biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 33 | `/api/v1/attendance/hr/comp-off-policies` | POST | Yes | `hr, admin` | hr | Creates rules defining how extra hours are converted into comp-off leave balances. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 34 | `/api/v1/attendance/hr/comp-off-policies` | GET | Yes | `hr, admin` | hr | Fetches all comp-off policies. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 35 | `/api/v1/attendance/hr/comp-off-policies/:id` | PUT | Yes | `hr, admin` | hr | Updates a comp-off policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 36 | `/api/v1/attendance/hr/comp-off-policies/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a comp-off policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 37 | `/api/v1/attendance/hr/comp-offs` | GET | Yes | `hr, admin` | hr | Fetches all comp-off requests across the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 38 | `/api/v1/attendance/hr/comp-offs/:id/approve` | POST | Yes | `hr, admin` | hr | HR endpoint to override and manually approve a comp-off request. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 39 | `/api/v1/attendance/hr/comp-offs/:id/reject` | POST | Yes | `hr, admin` | hr | HR endpoint to override and manually reject a comp-off request. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 40 | `/api/v1/attendance/hr/locks` | GET | Yes | `hr, admin` | hr | Fetches all payroll lock periods. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 41 | `/api/v1/attendance/hr/locks` | POST | Yes | `hr, admin` | hr | Creates a payroll lock period to freeze historical attendance modifications. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 42 | `/api/v1/attendance/hr/locks/:id` | DELETE | Yes | `hr, admin` | hr | Removes a payroll lock period to allow backdated corrections. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 43 | `/api/v1/attendance/hr/records/recompute-stale` | POST | Yes | `hr, admin` | hr | Maintenance sweep that recomputes attendance records stuck in `in_progress` despite having a clock-out (optional single-day scope). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 44 | `/api/v1/attendance/hr/reports/daily` | GET | Yes | `hr, admin` | hr | Generates flattened JSON arrays containing daily attendance data for CSV export. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 45 | `/api/v1/attendance/hr/reports/monthly` | GET | Yes | `hr, admin` | hr | Generates flattened JSON arrays containing monthly consolidated attendance data. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 46 | `/api/v1/attendance/hr/reports/employee/:userId` | GET | Yes | `hr, admin` | hr | Generates flattened attendance reports for a single specific employee. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 47 | `/api/v1/attendance/hr/hrs/attendance` | GET | Yes | `hr, manager` | hr, manager | Fetches attendance data for HR team members. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 48 | `/api/v1/attendance/hr/hrs/:userId/attendance` | GET | Yes | `hr, manager` | hr, manager | Fetches history for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 49 | `/api/v1/attendance/hr/hrs/:userId/summary` | GET | Yes | `hr, manager` | hr, manager | Fetches summary for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 50 | `/api/v1/attendance/hr/hrs/:userId/daily-log` | GET | Yes | `hr, manager` | hr, manager | Fetches daily log for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 51 | `/api/v1/attendance/hr/employees/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching organization-wide employee attendance lists. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 52 | `/api/v1/attendance/hr/employees/:userId/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching deep history for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 53 | `/api/v1/attendance/hr/employees/:userId/summary` | GET | Yes | `hr, admin` | hr | HR endpoint fetching summary metrics for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 54 | `/api/v1/attendance/hr/employees/:userId/daily-log` | GET | Yes | `hr, admin` | hr | HR endpoint fetching detailed daily logs for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 55 | `/api/v1/attendance/hr/managers/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching organization-wide manager attendance lists. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 56 | `/api/v1/attendance/hr/managers/:userId/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching history for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 57 | `/api/v1/attendance/hr/managers/:userId/summary` | GET | Yes | `hr, admin` | hr | HR endpoint fetching summary metrics for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 58 | `/api/v1/attendance/hr/managers/:userId/daily-log` | GET | Yes | `hr, admin` | hr | HR endpoint fetching detailed daily logs for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 59 | `/api/v1/attendance/hr/dashboard/live` | GET | Yes | `hr, admin` | hr | Provides real-time organization-wide metrics (Present, Absent, Late) for the HR dashboard. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 60 | `/api/v1/attendance/hr/dashboard/graph-data` | GET | Yes | `hr, admin` | hr | Provides time-series chart data for the HR dashboard over the past 30 days. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 61 | `/api/v1/attendance/hr/dashboard/department-summary` | GET | Yes | `hr, admin` | hr | Aggregates attendance statistics grouped by department for organizational insights. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 62 | `/api/v1/attendance/hr/dashboard/top-defaulters` | GET | Yes | `hr, admin` | hr | Identifies employees with the highest late minutes or missing punches across the organization. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 63 | `/api/v1/attendance/hr/dashboard/work-mode-distribution` | GET | Yes | `hr, admin` | hr | Returns a breakdown of Remote vs Office vs Hybrid clock-ins for today. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Attendance Module - Hardware Integrations

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/devices/webhook` | POST | Yes | Custom API Key | hr | Secure endpoint for physical biometric hardware to push real-time attendance punches to the backend. | `device_webhook.routes.js` | `device_webhook.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Foundation & Rules Engine

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/types` | POST | Yes | `hr, admin, super-admin` | hr | Creates a global category of leave (e.g., Sick Leave). | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/leaves/types` | GET | Yes | `hr, admin, super-admin` | hr | Fetches all global leave types. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/leaves/types/:id` | PUT | Yes | `hr, admin, super-admin` | hr | Edits an existing leave type. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 4 | `/api/v1/leaves/types/:id` | DELETE | Yes | `hr, admin, super-admin` | hr | Soft-deletes a leave type from active use. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/leaves/templates` | POST | Yes | `hr, admin, super-admin` | hr | Creates a new Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 6 | `/api/v1/leaves/templates` | GET | Yes | `hr, admin, super-admin` | hr | Fetches all Policy Templates. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 7 | `/api/v1/leaves/templates/:id` | PUT | Yes | `hr, admin, super-admin` | hr | Updates an existing Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 8 | `/api/v1/leaves/templates/:id` | DELETE | Yes | `hr, admin, super-admin` | hr | Deletes a Policy Template and its entitlements. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 9 | `/api/v1/leaves/templates/:id/entitlements` | POST | Yes | `hr, admin, super-admin` | hr | Adds an entitlement (quota rule) to a Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/leaves/templates/:id/entitlements/:entitlementId` | PUT | Yes | `hr, admin, super-admin` | hr | Updates an existing entitlement in a template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/leaves/templates/:id/entitlements/:entitlementId` | DELETE | Yes | `hr, admin, super-admin` | hr | Deletes an entitlement from a template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Policy Assignment & Balance Engine

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/users/:userId/assign-policy` | POST | Yes | `hr, admin, super-admin` | hr | Assigns a Leave Policy Template to an employee. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_assignment.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/users/:userId/configs/:leaveTypeId` | PUT | Yes | `hr, admin, super-admin` | hr | Overrides specific leave rules for a single leave type for a specific employee. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_assignment.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/users/:userId/balances` | GET | Yes | `hr, admin, super-admin` | hr | Fetches the leave wallet (ledger) for an employee (Admin). | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_balance.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/my-balances` | GET | Yes | `all` | hr, manager, employee | Fetches the logged-in employee's own leave wallet. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_balance.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/leaves/my-leave-types` | GET | Yes | `all` | hr, manager, employee | Fetches the leave types applicable to the logged-in employee (apply-form catalog with their per-user config). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_balance.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Employee Application (Phase 3)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/request` | POST | Yes | `all` | hr, manager, employee | Submits a new leave application and deducts tentative balance. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/leaves/my-requests` | GET | Yes | `all` | hr, manager, employee | Fetches the logged-in employee's historical leave applications. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 3 | `/api/v1/leaves/requests/:id/cancel` | POST | Yes | `all` | hr, manager, employee | Cancels a pending or upcoming leave request and refunds the balance. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/requests/:id` | GET | Yes | `all` | hr, manager, employee | Fetches a single one of the logged-in employee's own leave requests by ID (ownership enforced in query predicate). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_self.controller.js` (inline) | [ ✅ ] | [ ✅ ] | [ ✅ ] |

## Leave Module - Approvals & Management (Phase 3)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/team/requests/pending` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | Fetches pending leave requests for direct reports (or global queue for HR). | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 2 | `/api/v1/leaves/requests/:id/approve` | POST | Yes | `manager, hr, admin, super-admin` | manager, hr | Approves a leave request, locking the balance deduction and notifying systems. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/requests/:id/reject` | POST | Yes | `manager, hr, admin, super-admin` | manager, hr | Rejects a leave request and refunds the previously held balance. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/team/requests` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | Team leave history (any status). Hierarchy-scoped to reports for managers, org-wide for HR. Optional `status`/`user_id` filters (a manager's `user_id` filter is validated against their scope — BOLA guard) with bounded pagination (`page`, `limit`). | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approver.controller.js` | [ ✅ ] | [ ✅ ] | [ ✅ ] |
| 5 | `/api/v1/leaves/team/member/:userId/requests` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | A single team member's leave history. Manager may only target a direct report (cross-team id → 403). Optional `status` filter + pagination. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approver.controller.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/leaves/team/member/:userId/balances` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | A single team member's leave balances (the wallet needed at approval time). Manager may only target a direct report (cross-team id → 403). Optional `year`. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_balance.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Automation & Maintenance (Phase 5)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/automation/accrual/run` | POST | Yes | `hr, admin, super-admin` | hr | Manually triggers the monthly accrual calculation and ledger credit for the organization. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_accrual.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/automation/rollover/run` | POST | Yes | `hr, admin, super-admin` | hr | Manually triggers the year-end balance rollover, carry-forward, and initialization for the organization. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_rollover.service.js` | [ ] | [ ] | [ ] |

## Payroll Module - HR Administration (Phase 1)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These routes allow **`hr` only** — `admin`/`super-admin` are platform-plane roles and are deliberately excluded, making Payroll the strictest module in the product. A platform token is stopped by `requireFeature` (`400 MISSING_ORG_CONTEXT`) before the role gate is even reached.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/payroll/hr/components/bootstrap` | POST | Yes | `hr` | hr | Idempotent seed of the default component catalog; inserts only missing `code`s and returns `{ created[], skipped[] }`. Audit-logged. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/payroll/hr/components` | POST | Yes | `hr` | hr | Creates a custom salary component (forced `is_system = false`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/payroll/hr/components` | GET | Yes | `hr` | hr | Lists components; filters `is_active`, `component_type` (validated in controller — Express 5). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/payroll/hr/components/:id` | GET | Yes | `hr` | hr | Fetches a single component. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/payroll/hr/components/:id` | PUT | Yes | `hr` | hr | Updates a component. System rows: `code`/`component_type`/`calculation_type` immutable → `409 SYSTEM_COMPONENT_IMMUTABLE`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/payroll/hr/components/:id` | DELETE | Yes | `hr` | hr | Deactivates (never hard-deletes). `409 COMPONENT_IN_USE` if referenced by an active template or any approved structure. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_component.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/payroll/hr/structure-templates` | POST | Yes | `hr` | hr | Creates a salary structure template (blueprint). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/payroll/hr/structure-templates` | GET | Yes | `hr` | hr | Lists templates with their components and catalog names eager-loaded. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/payroll/hr/structure-templates/:id` | GET | Yes | `hr` | hr | Fetches a single template with components. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/payroll/hr/structure-templates/:id` | PUT | Yes | `hr` | hr | Updates a template. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/payroll/hr/structure-templates/:id` | DELETE | Yes | `hr` | hr | Deactivates a template. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 12 | `/api/v1/payroll/hr/structure-templates/:id/components` | POST | Yes | `hr` | hr | Adds a component to a template; rejects a duplicate `component_id` (`409`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/payroll/hr/structure-templates/:id/components/:componentId` | PUT | Yes | `hr` | hr | Updates a template component override (value / calculation_type / display_order). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 14 | `/api/v1/payroll/hr/structure-templates/:id/components/:componentId` | DELETE | Yes | `hr` | hr | Soft-removes a component from a template. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 15 | `/api/v1/payroll/hr/structure-templates/:id/preview` | POST | Yes | `hr` | hr | `{ annual_ctc }` → full evaluated component breakdown. **Persists nothing.** | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `salary_structure_template.service.js` | [ ] | [ ] | [ ] |
| 16 | `/api/v1/payroll/hr/employees/:userId/salary-structures` | POST | Yes | `hr` | hr | Assigns/revises a salary structure. Lands `approved` (Tier C) unless `payroll_require_separate_checker` is ON, then `proposed`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/payroll/hr/employees/:userId/salary-structures` | GET | Yes | `hr` | hr | Full version history incl. rejected/cancelled. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 18 | `/api/v1/payroll/hr/employees/:userId/salary-structures/current` | GET | Yes | `hr` | hr | The current approved open-ended structure with its component snapshot. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 19 | `/api/v1/payroll/hr/salary-structures/proposals` | GET | Yes | `hr` | hr | The HR checker queue; filters `status`, `proposed_by`, `user_id`, with pagination. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 20 | `/api/v1/payroll/hr/salary-structures/:id/approve` | POST | Yes | `hr` | hr | Approves a proposal (§7.2 critical section: advisory lock, scope re-verify EC-29, separate-checker EC-30, close-out, supersede). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 21 | `/api/v1/payroll/hr/salary-structures/:id/reject` | POST | Yes | `hr` | hr | Rejects a proposal; `rejection_reason` required; status-guarded. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 22 | `/api/v1/payroll/hr/settings` | GET | Yes | `hr` | hr | Lazy `getOrCreate` of the org payroll settings singleton. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_settings.service.js` | [ ] | [ ] | [ ] |
| 23 | `/api/v1/payroll/hr/settings` | PUT | Yes | `hr` | hr | Partial update, audit-logged old→new. Enabling separate-checker with < 2 active HR → `409 INSUFFICIENT_CHECKERS`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_settings.service.js` | [ ] | [ ] | [ ] |
| 24 | `/api/v1/payroll/hr/employees/:userId/bank-account` | GET | Yes | `hr` | hr | Masked bank account (`••••1234`); full number never returned. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bank_account.service.js` | [ ] | [ ] | [ ] |
| 25 | `/api/v1/payroll/hr/employees/:userId/bank-account/verify` | POST | Yes | `hr` | hr | Marks the account verified (`is_verified`, `verified_by`, `verified_at`); idempotent. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `bank_account.service.js` | [ ] | [ ] | [ ] |
| 26 | `/api/v1/payroll/hr/audit-logs` | GET | Yes | `hr` | hr | Append-only audit trail; filters `entity_type`, `entity_id`, `target_user_id`, `action`, date range, pagination. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_audit.service.js` | [ ] | [ ] | [ ] |

## Payroll Module - Manager Operations (Phase 1)

*Requires Feature Flag: `payroll.access`*

> `hr` is admitted so an HR user can exercise the manager views without a second token; `decideAuthority` resolves them to `scope: 'global'`. Every handler resolves hierarchy scope **before** any existence lookup — a cross-team id returns an identical `403` (never `404`).

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 27 | `/api/v1/payroll/manager/team/salary-structures` | GET | Yes | `manager, hr` | manager, hr | Direct reports + current CTC summary. If `manager_can_view_team_compensation` is OFF → aggregates only, never per-head figures (EC-25). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 28 | `/api/v1/payroll/manager/employees/:userId/salary-structures` | GET | Yes | `manager, hr` | manager, hr | A report's structure history (scoped; `403` on a cross-team id). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 29 | `/api/v1/payroll/manager/employees/:userId/salary-structures/current` | GET | Yes | `manager, hr` | manager, hr | A report's current structure (scoped). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 30 | `/api/v1/payroll/manager/employees/:userId/salary-structures/propose` | POST | Yes | `manager, hr` | manager, hr | Tier-B proposal (`proposed_by = req.user.id`). Lands `proposed`; with `manager_direct_compensation_authority` ON it runs the full approval in-transaction and lands `approved`. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 31 | `/api/v1/payroll/manager/salary-structures/proposals` | GET | Yes | `manager, hr` | manager, hr | The caller's own proposals + status/outcome; pagination. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 32 | `/api/v1/payroll/manager/salary-structures/:id/cancel` | POST | Yes | `manager, hr` | manager, hr | Cancels the caller's own proposal, only while `proposed` (ownership doubles as the BOLA guard). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |

## Payroll Module - Employee Self-Service (Phase 1)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1): the target is always `req.user.id`, so there is no object-level authorization to break. The guard on this plane is the presence of `orgId` (a platform token → `400 MISSING_ORG_CONTEXT`). All routes live under `/me`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 33 | `/api/v1/payroll/me/salary-structure` | GET | Yes | any tenant role (self) | employee | The caller's current **approved** structure only — a pending proposal is never surfaced. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 34 | `/api/v1/payroll/me/salary-structure/history` | GET | Yes | any tenant role (self) | employee | The caller's approved version history only. | `payroll_self.routes.js` | `payroll_self.controller.js` | `employee_salary_structure.service.js` | [ ] | [ ] | [ ] |
| 35 | `/api/v1/payroll/me/bank-account` | GET | Yes | any tenant role (self) | employee | The caller's own bank account, masked. | `payroll_self.routes.js` | `payroll_self.controller.js` | `bank_account.service.js` | [ ] | [ ] | [ ] |
| 36 | `/api/v1/payroll/me/bank-account` | PUT | Yes | any tenant role (self) | employee | Upserts own bank account; any edit resets `is_verified = false` and re-triggers HR verification. | `payroll_self.routes.js` | `payroll_self.controller.js` | `bank_account.service.js` | [ ] | [ ] | [ ] |

## Payroll Module - HR Administration (Phase 2)

*Requires Feature Flag: `payroll.access`*

> **Tenant-plane only (§6.0).** These engine operations allow **`hr` only** to evaluate run eligibility, create draft runs, trigger calculations/recalculations, inspect preview aggregates, manage exclusions/overrides, and transition runs through approval, cancellation, or paid settlement.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 37 | `/api/v1/payroll/hr/runs/eligibility` | GET | Yes | `hr` | hr | Pre-flight readiness check for a specific month (`period_month`); evaluates missing structures, leavers, missing bank accounts, and period locks without persisting data. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 38 | `/api/v1/payroll/hr/runs` | POST | Yes | `hr` | hr | Creates a draft payroll run for a specific month (`period_month`, `run_type`, `notes`) and snapshots org settings under an advisory lock; prevents duplicate runs (`409`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 39 | `/api/v1/payroll/hr/runs` | GET | Yes | `hr` | hr | Lists payroll runs with pagination and optional filters (`status`, `period_month`, `run_type`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 40 | `/api/v1/payroll/hr/runs/:id` | GET | Yes | `hr` | hr | Fetches header details and aggregated financial totals of a specific payroll run. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 41 | `/api/v1/payroll/hr/runs/:id/calculate` | POST | Yes | `hr` | hr | Triggers synchronous batch calculation across employee cohorts; aggregates attendance, leave, and structures, computes LOP/proration/components, UPSERTs run items, and updates run header to `calculated`. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 42 | `/api/v1/payroll/hr/runs/:id/preview` | GET | Yes | `hr` | hr | Fetches macro-level aggregates of a calculated run including department cost breakdown, error items, warnings, and excluded items. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 43 | `/api/v1/payroll/hr/runs/:id/items` | GET | Yes | `hr` | hr | Lists calculated payslip items for a run with pagination and optional filters (`status`, `user_id`, `department_id`). | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 44 | `/api/v1/payroll/hr/runs/:id/items/:itemId` | GET | Yes | `hr` | hr | Fetches a single employee's payslip item with granular component lines, attendance day ledger snapshot, and structure snapshot. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 45 | `/api/v1/payroll/hr/runs/:id/items/:itemId/exclude` | POST | Yes | `hr` | hr | Manually excludes an employee's item from a run with `exclusion_reason` (e.g. hold pay); marks run header as requiring recalculation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 46 | `/api/v1/payroll/hr/runs/:id/items/:itemId/include` | POST | Yes | `hr` | hr | Re-includes a previously excluded employee item back to pending status; marks run header as requiring recalculation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 47 | `/api/v1/payroll/hr/runs/:id/items/:itemId/period` | PATCH | Yes | `hr` | hr | Overrides the calculation period window (`period_start`, `period_end`, `period_override_reason`) for an item (e.g., mid-month leaver adjustment); marks run as requiring recalculation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 48 | `/api/v1/payroll/hr/runs/:id/approve` | POST | Yes | `hr` | hr | Critical state transition. Validates run has no errors or stale recalculation flags, freezes run to `approved`, creates attendance period lock, and publishes payslips to managers and employees. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 49 | `/api/v1/payroll/hr/runs/:id/cancel` | POST | Yes | `hr` | hr | Cancels an approved, unpaid run with `cancellation_reason`; transitions status to `cancelled` and removes attendance lock. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |
| 50 | `/api/v1/payroll/hr/runs/:id/pay` | POST | Yes | `hr` | hr | Terminal workflow step. Marks an approved run as `paid`; irreversible payment settlement confirmation. | `payroll_hr.routes.js` | `payroll_hr.controller.js` | `payroll_run.service.js` | [ ] | [ ] | [ ] |

## Payroll Module - Manager Operations (Phase 2)

*Requires Feature Flag: `payroll.access`*

> `hr` is admitted so an HR user can exercise manager views without a second token. BOLA is strictly enforced (scope checked before existence; cross-team access returns `403`). Detailed compensation amounts are masked when `manager_can_view_team_compensation` is disabled, leaving aggregate totals only.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 51 | `/api/v1/payroll/manager/runs/:runId/team-summary` | GET | Yes | `manager, hr` | manager, hr | Aggregated team payroll cost summary (headcount, gross, net, LOP days) for an approved/paid run; allowed regardless of compensation-visibility toggle. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ] |
| 52 | `/api/v1/payroll/manager/runs/:runId/team-items` | GET | Yes | `manager, hr` | manager, hr | Lists payslip items for direct reports in an approved/paid run; strips monetary figures when `manager_can_view_team_compensation` is disabled (aggregates only). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ] |
| 53 | `/api/v1/payroll/manager/employees/:userId/payslips` | GET | Yes | `manager, hr` | manager, hr | Lists historical finalized payslips (`approved` or `paid` runs only) for a direct report; scope-checked before existence (`403` on cross-team id). | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ] |
| 54 | `/api/v1/payroll/manager/employees/:userId/payslips/:runId` | GET | Yes | `manager, hr` | manager, hr | Fetches detailed payslip JSON for a specific direct report; blocked (`403 COMPENSATION_VIEW_DISABLED`) if manager compensation visibility toggle is OFF. | `payroll_manager.routes.js` | `payroll_manager.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ] |

## Payroll Module - Employee Self-Service (Phase 2)

*Requires Feature Flag: `payroll.access`*

> No `authorize()` (D-1): target is always `req.user.id`. Only finalized payslips from `approved` or `paid` runs are returned; draft and calculating runs are completely hidden. All routes live under `/me`.

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 55 | `/api/v1/payroll/me/payslips` | GET | Yes | any tenant role (self) | employee | Fetches the authenticated employee's own finalized payslips list (`approved` and `paid` runs only; draft runs hidden). | `payroll_self.routes.js` | `payroll_self.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ] |
| 56 | `/api/v1/payroll/me/payslips/:runId` | GET | Yes | any tenant role (self) | employee | Fetches the authenticated employee's detailed finalized payslip for a specific run, including component breakdown and attendance day ledger. | `payroll_self.routes.js` | `payroll_self.controller.js` | `payslip_read.service.js` | [ ] | [ ] | [ ] |

