# System Architecture

## Overview
HRMS is a multi-tenant Node.js application designed to handle organizational structure, attendance, billing, and employee management.

## Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (with Sequelize ORM)
- **Caching/State**: Redis (used for token blacklisting and invitation tokens)
- **Email**: Brevo (Sendinblue) for transactional emails

## Module Architecture

The system is broken down into several isolated modules, which interact via specific integration points (e.g., `user_roles` linking a User to an Organization).

### 1. Auth Module (`src/modules/auth`)
Handles global authentication. Users sign up globally and can belong to multiple Organizations (tenants).
- Uses JWT for session management.
- Handles OTP verification and Google OAuth.
- Redis is used to blacklist tokens when users switch organizations or are revoked.

### 2. Organization Module (`src/modules/organization`)
The core tenant module.
- **Tenancy**: The `organizations` table represents a tenant. Users are linked via the `user_roles` table, which maps a `user_id` + `role_id` + `org_id`.
- **Hierarchies**: Manages departments, locations, and the Head of Department (HOD) assignments.
- **Reporting**: The `user_reporting_mappings` table maps managers to subordinates. The `transferDepartmentHead` and `transferReportingLines` functions in `organization.service.js` handle atomic updates to this complex hierarchy.

### 3. Attendance Module (`src/modules/attendance`)
A massive module for tracking employee time.
- Integrates with the Organization module to determine the employee's location and department.
- **Calculation Engine**: A complex engine (`attendance_calculation.service.js`) that factors in Shifts, Policies, Holidays, Weekly Offs, and Break times to determine lateness, overtime, and daily status.
- **Hardware Integration**: Exposes a secure Webhook API (`/devices/webhook`) for biometric scanners to push physical punches into the `attendance_logs` table.

### 4. Billing Module (`src/modules/billing`)
Handles SaaS subscriptions.
- Integrates with Razorpay for payment processing.
- The `organization.service.js` enforces feature limits (e.g., max employees) by querying the `organization_subscriptions` table.

## Important Architectural Patterns

### Soft Deletion
Entities are rarely hard-deleted. They are marked `is_active: false` or use Sequelize's `deletedAt` timestamp to preserve historical audit trails (especially critical for attendance records referencing old shifts).

### Idempotency
Several APIs (e.g., the Biometric Webhook, Razorpay Payment Verification) are designed to be idempotent. If the network stutters and a request is retried, the backend gracefully ignores duplicate operations and returns a success payload based on the existing state.

### Immutable Audit Logs
The `attendance_logs` table is append-only. When an employee clocks in or out, a log is written. The `attendance_records` table represents the calculated aggregate of those logs. If a user regularizes their time, a new log may be created or the record modified, but the original hardware/web punches are never deleted.
