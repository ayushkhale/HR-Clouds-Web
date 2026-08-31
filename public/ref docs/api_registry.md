# HRMS System API Registry

This matrix provides a comprehensive mapping of every API endpoint in the system to its functionality, security boundaries, and source code files. It serves as a master index for developers to quickly understand system capabilities and trace the execution path of any request.

> **Dashboard column:** Indicates which dashboard(s) the endpoint belongs to. Values are restricted to `hr`, `manager`, and `employee` (combined when an endpoint is surfaced on more than one dashboard). `admin` / `super-admin` roles are treated as part of the `hr` (administration) dashboard; `guest` onboarding flows that create/administer the org are attributed to `hr`.

## Authentication Module

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/auth/signup` | POST | No | N/A | hr, manager, employee | Initiates the guest user signup and OTP generation process. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/auth/signup/verify` | POST | No | N/A | hr, manager, employee | Verifies the OTP sent during signup and completes the registration. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/auth/login` | POST | No | N/A | hr, manager, employee | Authenticates a user with email/password and returns a selection token if multiple orgs exist. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/auth/select-organization` | POST | Yes | N/A (Selection Token) | hr, manager, employee | Exchanges an org selection token for full access/refresh tokens for a specific org. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/auth/switch-organization` | POST | Yes | Any | hr, manager, employee | Allows an already authenticated user to switch their active organization context. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/auth/forgot-password` | POST | No | N/A | hr, manager, employee | Initiates the password reset process by generating and sending an OTP to the user's email. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/auth/forgot-password/verify` | POST | No | N/A | hr, manager, employee | Verifies the forgot password OTP and updates the user's password. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/auth/otp/resend` | POST | No | N/A | hr, manager, employee | Resends a new OTP to the user's email for signup or password reset flows. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/auth/google` | POST | No | N/A | hr, manager, employee | Handles Google OAuth sign-in, creating a user if they don't exist and returning tokens. | `auth.routes.js` | `auth.controller.js` | `auth.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/auth/health` | GET | No | N/A | hr, manager, employee | Simple health check endpoint to verify the auth service is running. | `health.routes.js` | N/A | N/A | [ ] | [ ] | [ ] |

## Organization Module

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/organizations/invitations/validate` | GET | No | N/A | hr, manager, employee | Validates an invitation token before accepting it. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/organizations/register/initiate` | POST | Yes | `guest` | hr | Initiates the creation of a new organization and handles free/paid plan logic. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/organizations/register/verify-payment` | POST | Yes | `guest` | hr | Verifies a Razorpay payment signature and activates the organization's paid subscription. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/organizations/users/invite` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Sends an email invitation to a new or existing user to join the organization. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/organizations/users/invite/revoke` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Revokes a pending invitation to prevent the user from joining the organization. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/organizations/users/invite/resend` | POST | Yes | `super-admin, admin, hr, manager` | hr, manager | Resends the invitation email to a pending user. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/organizations/invitations/accept` | POST | Optional | N/A | hr, manager, employee | Accepts an organization invitation and provisions the user profile inside the tenant. | `organization.routes.js` | `organization.controller.js` | `invitation.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/organizations/employees` | GET | Yes | `super-admin, admin, hr, manager` | hr, manager | Fetches a list of all active/inactive employees in the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/organizations/employees/:id` | GET | Yes | `super-admin, admin, hr, manager` | hr, manager | Fetches detailed profile information for a specific employee. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/organizations/employees/:id/status` | PATCH | Yes | `super-admin, admin, hr` | hr | Activates or deactivates an employee's access to the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/organizations/employees/:id` | DELETE | Yes | `super-admin, admin, hr` | hr | Soft-deletes an employee and removes their reporting mappings. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 12 | `/api/v1/organizations/users/:id/department-transfer` | PUT | Yes | `super-admin, admin, hr` | hr | Transfers an employee to a new department and updates reporting hierarchies. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/organizations/locations` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a list of all geographical office locations for the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 14 | `/api/v1/organizations/locations` | POST | Yes | `super-admin, admin, hr` | hr | Creates a new office location for the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 15 | `/api/v1/organizations/locations/:id` | PUT | Yes | `super-admin, admin, hr` | hr | Updates details of an existing office location. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 16 | `/api/v1/organizations/departments` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a list of all departments in the organization. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/organizations/departments` | POST | Yes | `super-admin, admin, hr` | hr | Creates a new department and optionally assigns a Head of Department. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 18 | `/api/v1/organizations/departments/:id` | PUT | Yes | `super-admin, admin, hr` | hr | Updates an existing department and manages HOD reporting line swaps. | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 19 | `/api/v1/organizations/me` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches the logged-in user's own full profile (reuses the employee-detail view scoped to self). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 20 | `/api/v1/organizations/me` | PATCH | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Updates the logged-in user's own personal fields (whitelisted; department/designation/gender/marital_status/employee_code locked). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |
| 21 | `/api/v1/organizations/directory` | GET | Yes | `super-admin, admin, hr, manager, employee` | hr, manager, employee | Fetches a public-safe employee directory (name, email, avatar, role, department, designation, work location only). | `organization.routes.js` | `organization.controller.js` | `organization.service.js` | [ ] | [ ] | [ ] |

## Attendance Module - Employee Self-Service

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/today` | GET | Yes | `all` | hr, manager, employee | Fetches the authenticated user's live attendance status for today. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/attendance/history` | GET | Yes | `all` | hr, manager, employee | Fetches the user's historical attendance records with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/attendance/summary` | GET | Yes | `all` | hr, manager, employee | Fetches the user's aggregated monthly attendance summary (total present, late, etc). | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/attendance/shift` | GET | Yes | `all` | hr, manager, employee | Fetches the user's currently active assigned shift details. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/attendance/clock-in` | POST | Yes | `all` | hr, manager, employee | Records a clock-in punch and validates GPS geofencing rules. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/attendance/clock-out` | POST | Yes | `all` | hr, manager, employee | Records a clock-out punch and triggers the payroll hours calculation engine. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/attendance/break/start` | POST | Yes | `all` | hr, manager, employee | Records the start of a designated break period. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/attendance/break/end` | POST | Yes | `all` | hr, manager, employee | Records the end of a break period and updates total break duration. | `user_attendance.routes.js` | `user_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/attendance/regularization` | POST | Yes | `all` | hr, manager, employee | Submits a request to retroactively modify an attendance record's timestamps. | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/attendance/regularizations` | GET | Yes | `all` | hr, manager, employee | Fetches a list of the user's submitted regularization requests and their statuses. | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/attendance/daily-log` | GET | Yes | `all` | hr, manager, employee | Fetches the user's detailed minute-by-minute punch logs for a specific day. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 12 | `/api/v1/attendance/graph-data` | GET | Yes | `all` | hr, manager, employee | Fetches time-series data for rendering the user's attendance trends chart. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/attendance/trends` | GET | Yes | `all` | hr, manager, employee | Fetches aggregated trend insights regarding the user's punctuality and hours. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 14 | `/api/v1/attendance/weekly-calendar` | GET | Yes | `all` | hr, manager, employee | Fetches the user's attendance status mapped to a 7-day weekly calendar view. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 15 | `/api/v1/attendance/holidays` | GET | Yes | `all` | hr, manager, employee | Fetches the list of upcoming organizational holidays applicable to the user. | `user_attendance_read.routes.js` | `user_attendance_read.controller.js` | `user_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 16 | `/api/v1/attendance/regularizations/:id/cancel` | POST | Yes | `all` | hr, manager, employee | Withdraws the user's own pending regularization request (self-scoped, row-locked, rejects already-processed requests). | `user_attendance.routes.js` | `user_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/attendance/overtime/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own overtime requests with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `overtime.service.js` | [ ] | [ ] | [ ] |
| 18 | `/api/v1/attendance/anomalies/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own attendance anomalies, filterable by status (open/resolved/all). | `user_attendance.routes.js` | `user_attendance.controller.js` | `anomaly.service.js` | [ ] | [ ] | [ ] |
| 19 | `/api/v1/attendance/comp-offs/mine` | GET | Yes | `all` | hr, manager, employee | Fetches the user's own compensatory-off requests with pagination. | `user_attendance.routes.js` | `user_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 20 | `/api/v1/attendance/comp-offs/mine/summary` | GET | Yes | `all` | hr, manager, employee | Fetches the user's aggregated comp-off balance summary. | `user_attendance.routes.js` | `user_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |

## Attendance Module - Manager Operations

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/team/today` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches the live daily attendance status of all subordinates reporting to the manager. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `team.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/attendance/team/history` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches historical attendance records for the manager's team. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `team.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/attendance/team/anomalies` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches unresolved system-generated anomalies (like GPS breaches) for the team. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `anomaly.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/attendance/anomalies/:id/resolve` | POST | Yes | `manager, hr, admin` | manager, hr | Allows a manager to manually resolve and dismiss a subordinate's attendance anomaly. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `anomaly.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/attendance/regularizations/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending regularization requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/attendance/regularizations/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a regularization request and forces a recalculation of payroll hours. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/attendance/regularizations/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's regularization request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `regularization.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/attendance/overtime/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending overtime requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/attendance/overtime/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a subordinate's overtime request for payroll processing. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/attendance/overtime/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's overtime request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `overtime.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/attendance/comp-offs/pending` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches pending compensatory-off requests submitted by subordinates. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 12 | `/api/v1/attendance/comp-offs/:id/approve` | POST | Yes | `manager, hr, admin` | manager, hr | Approves a subordinate's comp-off request and credits their leave balance. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/attendance/comp-offs/:id/reject` | POST | Yes | `manager, hr, admin` | manager, hr | Rejects a subordinate's comp-off request. | `manager_attendance.routes.js` | `manager_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 14 | `/api/v1/attendance/team/summary` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches aggregated attendance summaries for the entire team over a specific period. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 15 | `/api/v1/attendance/team/member/:userId/history` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches detailed attendance history for a specific subordinate. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 16 | `/api/v1/attendance/team/member/:userId/summary` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches the attendance summary metrics for a specific subordinate. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/attendance/team/graph-data` | GET | Yes | `manager, hr, admin` | manager, hr | Fetches time-series data for rendering the manager's team attendance trends chart. | `manager_attendance_read.routes.js` | `manager_attendance_read.controller.js` | `manager_attendance_read.service.js` | [ ] | [ ] | [ ] |

## Attendance Module - HR Administration

*Requires Feature Flag: `attendance.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/policies` | POST | Yes | `hr, admin` | hr | Creates a new organizational policy defining grace periods and half-day rules. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/attendance/policies` | GET | Yes | `hr, admin` | hr | Fetches a list of all attendance policies defined in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/attendance/policies/:id` | GET | Yes | `hr, admin` | hr | Fetches details for a specific attendance policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/attendance/policies/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing attendance policy's rules and thresholds. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/attendance/policies/:id/deactivate` | PATCH | Yes | `hr, admin` | hr | Deactivates an attendance policy, preventing future assignments. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `policy.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/attendance/shifts/assign` | POST | Yes | `hr, admin` | hr | Assigns an employee to a specific shift schedule or rotation pattern. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/attendance/shifts/assignments` | GET | Yes | `hr, admin` | hr | Fetches a ledger of historical and active shift assignments. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/attendance/shifts/assignments/:assignment_id` | DELETE | Yes | `hr, admin` | hr | Hard-deletes a shift assignment record. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/attendance/shifts/assignments/:assignment_id/end` | POST | Yes | `hr, admin` | hr | Closes an active shift assignment by setting its end date. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/attendance/shifts` | POST | Yes | `hr, admin` | hr | Creates a new shift template defining start times and work hours. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/attendance/shifts` | GET | Yes | `hr, admin` | hr | Fetches all shift templates defined in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 12 | `/api/v1/attendance/shifts/:id` | GET | Yes | `hr, admin` | hr | Fetches details for a specific shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 13 | `/api/v1/attendance/shifts/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 14 | `/api/v1/attendance/shifts/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a shift template. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `shift.service.js` | [ ] | [ ] | [ ] |
| 15 | `/api/v1/attendance/rotations` | POST | Yes | `hr, admin` | hr | Creates a complex repeating shift pattern (e.g., 5 days morning, 2 days off). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ] | [ ] | [ ] |
| 16 | `/api/v1/attendance/rotations` | GET | Yes | `hr, admin` | hr | Fetches all rotation patterns in the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ] | [ ] | [ ] |
| 17 | `/api/v1/attendance/rotations/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a rotation pattern. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `rotation.service.js` | [ ] | [ ] | [ ] |
| 18 | `/api/v1/attendance/holidays` | POST | Yes | `hr, admin` | hr | Creates a new organization-wide or location-specific holiday. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ] | [ ] |
| 19 | `/api/v1/attendance/holidays` | GET | Yes | `hr, admin` | hr | Fetches all configured holidays for the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ] | [ ] |
| 20 | `/api/v1/attendance/holidays/:id` | PUT | Yes | `hr, admin` | hr | Updates an existing holiday's details. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ] | [ ] |
| 21 | `/api/v1/attendance/holidays/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a configured holiday. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `holiday.service.js` | [ ] | [ ] | [ ] |
| 22 | `/api/v1/attendance/weekly-offs` | POST | Yes | `hr, admin` | hr | Creates a rule defining default rest days (e.g., Saturdays and Sundays). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ] | [ ] |
| 23 | `/api/v1/attendance/weekly-offs` | GET | Yes | `hr, admin` | hr | Fetches all weekly off rules. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ] | [ ] |
| 24 | `/api/v1/attendance/weekly-offs/:id` | PUT | Yes | `hr, admin` | hr | Updates a weekly off rule. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ] | [ ] |
| 25 | `/api/v1/attendance/weekly-offs/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a weekly off rule. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `weekly_off.service.js` | [ ] | [ ] | [ ] |
| 26 | `/api/v1/attendance/devices` | POST | Yes | `hr, admin` | hr | Registers a biometric hardware device and generates its secure API key. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 27 | `/api/v1/attendance/devices` | GET | Yes | `hr, admin` | hr | Fetches a list of all registered biometric devices. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 28 | `/api/v1/attendance/devices/:id` | PUT | Yes | `hr, admin` | hr | Updates biometric device configuration details. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 29 | `/api/v1/attendance/devices/:id` | DELETE | Yes | `hr, admin` | hr | Deactivates and deletes a registered biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 30 | `/api/v1/attendance/devices/:id/mappings` | POST | Yes | `hr, admin` | hr | Links an employee ID from HRMS to an internal hardware user ID on a device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 31 | `/api/v1/attendance/devices/:id/mappings` | GET | Yes | `hr, admin` | hr | Fetches all employee mappings for a specific biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 32 | `/api/v1/attendance/devices/:id/mappings/:mappingId` | DELETE | Yes | `hr, admin` | hr | Removes a mapping linking an employee to a biometric device. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |
| 33 | `/api/v1/attendance/comp-off-policies` | POST | Yes | `hr, admin` | hr | Creates rules defining how extra hours are converted into comp-off leave balances. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ] | [ ] |
| 34 | `/api/v1/attendance/comp-off-policies` | GET | Yes | `hr, admin` | hr | Fetches all comp-off policies. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ] | [ ] |
| 35 | `/api/v1/attendance/comp-off-policies/:id` | PUT | Yes | `hr, admin` | hr | Updates a comp-off policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ] | [ ] |
| 36 | `/api/v1/attendance/comp-off-policies/:id` | DELETE | Yes | `hr, admin` | hr | Deletes a comp-off policy. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off_policy.service.js` | [ ] | [ ] | [ ] |
| 37 | `/api/v1/attendance/comp-offs` | GET | Yes | `hr, admin` | hr | Fetches all comp-off requests across the organization. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 38 | `/api/v1/attendance/comp-offs/:id/approve` | POST | Yes | `hr, admin` | hr | HR endpoint to override and manually approve a comp-off request. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 39 | `/api/v1/attendance/comp-offs/:id/reject` | POST | Yes | `hr, admin` | hr | HR endpoint to override and manually reject a comp-off request. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `comp_off.service.js` | [ ] | [ ] | [ ] |
| 40 | `/api/v1/attendance/locks` | GET | Yes | `hr, admin` | hr | Fetches all payroll lock periods. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ] | [ ] | [ ] |
| 41 | `/api/v1/attendance/locks` | POST | Yes | `hr, admin` | hr | Creates a payroll lock period to freeze historical attendance modifications. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ] | [ ] | [ ] |
| 42 | `/api/v1/attendance/locks/:id` | DELETE | Yes | `hr, admin` | hr | Removes a payroll lock period to allow backdated corrections. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `lock.service.js` | [ ] | [ ] | [ ] |
| 43 | `/api/v1/attendance/records/recompute-stale` | POST | Yes | `hr, admin` | hr | Maintenance sweep that recomputes attendance records stuck in `in_progress` despite having a clock-out (optional single-day scope). | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `clock.service.js` | [ ] | [ ] | [ ] |
| 44 | `/api/v1/attendance/reports/daily` | GET | Yes | `hr, admin` | hr | Generates flattened JSON arrays containing daily attendance data for CSV export. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ] | [ ] | [ ] |
| 45 | `/api/v1/attendance/reports/monthly` | GET | Yes | `hr, admin` | hr | Generates flattened JSON arrays containing monthly consolidated attendance data. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ] | [ ] | [ ] |
| 46 | `/api/v1/attendance/reports/employee/:userId` | GET | Yes | `hr, admin` | hr | Generates flattened attendance reports for a single specific employee. | `hr_attendance.routes.js` | `hr_attendance.controller.js` | `report.service.js` | [ ] | [ ] | [ ] |
| 47 | `/api/v1/attendance/hrs/attendance` | GET | Yes | `hr, manager` | hr, manager | Fetches attendance data for HR team members. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 48 | `/api/v1/attendance/hrs/:userId/attendance` | GET | Yes | `hr, manager` | hr, manager | Fetches history for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 49 | `/api/v1/attendance/hrs/:userId/summary` | GET | Yes | `hr, manager` | hr, manager | Fetches summary for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 50 | `/api/v1/attendance/hrs/:userId/daily-log` | GET | Yes | `hr, manager` | hr, manager | Fetches daily log for an HR member. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 51 | `/api/v1/attendance/employees/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching organization-wide employee attendance lists. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 52 | `/api/v1/attendance/employees/:userId/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching deep history for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 53 | `/api/v1/attendance/employees/:userId/summary` | GET | Yes | `hr, admin` | hr | HR endpoint fetching summary metrics for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 54 | `/api/v1/attendance/employees/:userId/daily-log` | GET | Yes | `hr, admin` | hr | HR endpoint fetching detailed daily logs for any employee. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 55 | `/api/v1/attendance/managers/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching organization-wide manager attendance lists. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 56 | `/api/v1/attendance/managers/:userId/attendance` | GET | Yes | `hr, admin` | hr | HR endpoint fetching history for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 57 | `/api/v1/attendance/managers/:userId/summary` | GET | Yes | `hr, admin` | hr | HR endpoint fetching summary metrics for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 58 | `/api/v1/attendance/managers/:userId/daily-log` | GET | Yes | `hr, admin` | hr | HR endpoint fetching detailed daily logs for any manager. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 59 | `/api/v1/attendance/dashboard/live` | GET | Yes | `hr, admin` | hr | Provides real-time organization-wide metrics (Present, Absent, Late) for the HR dashboard. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 60 | `/api/v1/attendance/dashboard/graph-data` | GET | Yes | `hr, admin` | hr | Provides time-series chart data for the HR dashboard over the past 30 days. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 61 | `/api/v1/attendance/dashboard/department-summary` | GET | Yes | `hr, admin` | hr | Aggregates attendance statistics grouped by department for organizational insights. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 62 | `/api/v1/attendance/dashboard/top-defaulters` | GET | Yes | `hr, admin` | hr | Identifies employees with the highest late minutes or missing punches across the organization. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |
| 63 | `/api/v1/attendance/dashboard/work-mode-distribution` | GET | Yes | `hr, admin` | hr | Returns a breakdown of Remote vs Office vs Hybrid clock-ins for today. | `hr_attendance_read.routes.js` | `hr_attendance_read.controller.js` | `hr_attendance_read.service.js` | [ ] | [ ] | [ ] |

## Attendance Module - Hardware Integrations

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/attendance/devices/webhook` | POST | Yes | Custom API Key | hr | Secure endpoint for physical biometric hardware to push real-time attendance punches to the backend. | `device_webhook.routes.js` | `device_webhook.controller.js` | `device.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Foundation & Rules Engine

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/types` | POST | Yes | `hr, admin, super-admin` | hr | Creates a global category of leave (e.g., Sick Leave). | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/types` | GET | Yes | `hr, admin, super-admin` | hr | Fetches all global leave types. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/types/:id` | PUT | Yes | `hr, admin, super-admin` | hr | Edits an existing leave type. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/types/:id` | DELETE | Yes | `hr, admin, super-admin` | hr | Soft-deletes a leave type from active use. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/leaves/templates` | POST | Yes | `hr, admin, super-admin` | hr | Creates a new Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 6 | `/api/v1/leaves/templates` | GET | Yes | `hr, admin, super-admin` | hr | Fetches all Policy Templates. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 7 | `/api/v1/leaves/templates/:id` | PUT | Yes | `hr, admin, super-admin` | hr | Updates an existing Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 8 | `/api/v1/leaves/templates/:id` | DELETE | Yes | `hr, admin, super-admin` | hr | Deletes a Policy Template and its entitlements. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 9 | `/api/v1/leaves/templates/:templateId/entitlements` | POST | Yes | `hr, admin, super-admin` | hr | Adds an entitlement (quota rule) to a Policy Template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 10 | `/api/v1/leaves/templates/:templateId/entitlements/:entitlementId` | PUT | Yes | `hr, admin, super-admin` | hr | Updates an existing entitlement in a template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |
| 11 | `/api/v1/leaves/templates/:templateId/entitlements/:entitlementId` | DELETE | Yes | `hr, admin, super-admin` | hr | Deletes an entitlement from a template. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_admin.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Policy Assignment & Balance Engine

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/users/:userId/assign-policy` | POST | Yes | `hr, admin, super-admin` | hr | Assigns a Leave Policy Template to an employee. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_assignment.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/users/:userId/configs/:leaveTypeId` | PUT | Yes | `hr, admin, super-admin` | hr | Overrides specific leave rules for a single leave type for a specific employee. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_assignment.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/users/:userId/balances` | GET | Yes | `hr, admin, super-admin` | hr | Fetches the leave wallet (ledger) for an employee (Admin). | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_balance.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/my-balances` | GET | Yes | `all` | hr, manager, employee | Fetches the logged-in employee's own leave wallet. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_balance.service.js` | [ ] | [ ] | [ ] |
| 5 | `/api/v1/leaves/my-leave-types` | GET | Yes | `all` | hr, manager, employee | Fetches the leave types applicable to the logged-in employee (apply-form catalog with their per-user config). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_balance.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Employee Application (Phase 3)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/request` | POST | Yes | `all` | hr, manager, employee | Submits a new leave application and deducts tentative balance. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/my-requests` | GET | Yes | `all` | hr, manager, employee | Fetches the logged-in employee's historical leave applications. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/requests/:id/cancel` | POST | Yes | `all` | hr, manager, employee | Cancels a pending or upcoming leave request and refunds the balance. | `leave_self.routes.js` | `leave_self.controller.js` | `leave_request.service.js` | [ ] | [ ] | [ ] |
| 4 | `/api/v1/leaves/requests/:id` | GET | Yes | `all` | hr, manager, employee | Fetches a single one of the logged-in employee's own leave requests by ID (ownership enforced in query predicate). | `leave_self.routes.js` | `leave_self.controller.js` | `leave_self.controller.js` (inline) | [ ] | [ ] | [ ] |

## Leave Module - Approvals & Management (Phase 3)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/team/requests/pending` | GET | Yes | `manager, hr, admin, super-admin` | manager, hr | Fetches pending leave requests for direct reports (or global queue for HR). | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/requests/:id/approve` | POST | Yes | `manager, hr, admin, super-admin` | manager, hr | Approves a leave request, locking the balance deduction and notifying systems. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ] | [ ] |
| 3 | `/api/v1/leaves/requests/:id/reject` | POST | Yes | `manager, hr, admin, super-admin` | manager, hr | Rejects a leave request and refunds the previously held balance. | `leave_approver.routes.js` | `leave_approver.controller.js` | `leave_approval.service.js` | [ ] | [ ] | [ ] |

## Leave Module - Automation & Maintenance (Phase 5)

*Requires Feature Flag: `leave.access`*

| # | Endpoint | Method | Protected | Allowed Roles | Dashboard | Description | Route File | Controller | Service | Employee UI | HR UI | Manager UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/v1/leaves/automation/accrual/run` | POST | Yes | `hr, admin, super-admin` | hr | Manually triggers the monthly accrual calculation and ledger credit for the organization. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_accrual.service.js` | [ ] | [ ] | [ ] |
| 2 | `/api/v1/leaves/automation/rollover/run` | POST | Yes | `hr, admin, super-admin` | hr | Manually triggers the year-end balance rollover, carry-forward, and initialization for the organization. | `leave_admin.routes.js` | `leave_admin.controller.js` | `leave_rollover.service.js` | [ ] | [ ] | [ ] |
