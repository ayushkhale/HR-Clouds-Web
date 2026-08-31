# Phase 2: Frontend Integration & System Analysis Guide

## 1. Overview
This document serves as an analytical guide for frontend engineers and system architects to understand the data flows, security mechanisms, and user journeys implemented in Phase 2 (Organizational Structure & Employee Management).

## 2. Core Architectural Principles
Phase 2 introduces deep **Tenant Isolation** and **Multi-Tenant State Management**. 
- **The Global `User`**: The `users` table acts as a global identity repository (email/password).
- **The Local `UserRole`**: The `user_roles` table acts as the bridge connecting a global user to a specific organization (`org_id`).
- **Data Protection**: If an HR admin deactivates an employee, it updates `user_roles.is_active = false`. This safely locks the user out of the specific organization while leaving their global identity untouched, allowing them to log into other organizations they might belong to.

---

## 3. The Onboarding & Invitation Journey (Frontend Flow)

### Step 1: Pre-Fetching Structural Data
Before an HR Administrator can invite a new employee, the frontend must fetch the organization's Locations and Departments to populate the dropdown menus.
- Call **`GET /api/v1/organizations/locations`**
- Call **`GET /api/v1/organizations/departments`**
*(Note: By default, these only return active records. Append `?include_inactive=true` if you need to build an admin management table).*

### Step 2: Sending the Invitation
The HR Administrator fills out the invite form (Email, Role, Location, Department, Designation).
- Call **`POST /api/v1/organizations/users/invite`**
- **Validation Rule**: The backend strictly validates that the `location_id` and `department_id` are valid UUIDs.

### Step 3: Resending / Revoking
If the employee loses the email, the frontend can trigger actions using the invitation ID.
- Call **`POST /api/v1/organizations/users/invite/resend`**
- Call **`POST /api/v1/organizations/users/invite/revoke`**

### Step 4: Employee Acceptance
The employee receives the email link containing an invitation token. The frontend extracts the token from the URL.
- Call **`GET /api/v1/organizations/invitations/validate?token=...`** to check if the token is valid.
- Call **`POST /api/v1/organizations/invitations/accept`** (sending the token, and a new password if they are a new user).

---

## 4. The Employee Management Journey

### Step 1: Viewing the Employee Directory
When HR clicks "Employee Directory", the frontend must fetch the master list.
- Call **`GET /api/v1/organizations/employees`**
- **Data Shape**: This API heavily normalizes the data. Instead of raw nested objects, it provides flattened, frontend-friendly keys like `department`, `work_location`, and `designation`. 
- **Legacy Fallback**: If an older employee profile hasn't been mapped to a relational `department_id`, the API dynamically falls back to the old string-based `department` field, ensuring the UI never breaks.

### Step 2: Viewing a Single Profile
When HR clicks on an employee row, fetch their deep profile.
- Call **`GET /api/v1/organizations/employees/:id`**
- **Important**: The `:id` parameter expects the `user_id` (the global identity), NOT the specific `employee_profile.id`. Use the `user_id` returned from the bulk directory list.

### Step 3: Offboarding (Deactivation vs Deletion)
- **Deactivation (`PATCH /api/v1/organizations/employees/:id/status`)**: Use this when an employee goes on long-term leave or is suspended. It sets `is_active = false`. Their session token instantly fails authentication middleware.
- **Deletion (`DELETE /api/v1/organizations/employees/:id`)**: Use this when an employee resigns or is terminated. It performs a **Soft Delete** (`deleted_at`), removing their access permanently while keeping their historical attendance and payroll data perfectly intact for tax and reporting purposes.
