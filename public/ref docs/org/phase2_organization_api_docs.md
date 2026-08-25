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


# Phase 2: Complete API Documentation (Organization & Employees)

**Base URL:** `/api/v1/organizations`

All endpoints (unless explicitly marked as "No Auth") require a valid JWT `Bearer` token in the `Authorization` header.

---

## 1. Registration & Invitations
This section covers the lifecycle of getting users into the system, from initial onboarding to sending and accepting multi-tenant invitations.

### 1.1 Initiate Registration
Initializes a new organization and tenant space.
- **Endpoint**: `POST /register/initiate`
- **Auth**: Required (Role: `guest` only)
- **Request Body**:
  ```json
  {
    "plan_code": "premium_monthly", // (Required) String
    "org_name": "Tech Corp", // (Required) String (Min: 2, Max: 150)
    "org_alias": "TechCorp", // (Optional) String
    "industry": "IT", // (Optional) String
    "size": "50-100", // (Optional) String
    "website": "https://techcorp.com", // (Optional) String
    "phone_number": "+1234567890", // (Optional) String
    "gst_number": "22AAAAA0000A1Z5", // (Optional) String
    "company_pan_number": "ABCDE1234F" // (Optional) String
  }
  ```

### 1.2 Verify Payment
Verifies the Razorpay transaction to successfully activate the organization.
- **Endpoint**: `POST /register/verify-payment`
- **Auth**: Required (Role: `guest` only)
- **Request Body**:
  ```json
  {
    "razorpay_order_id": "order_xyz", // (Required) String
    "razorpay_payment_id": "pay_xyz", // (Required) String
    "razorpay_signature": "signature_hash", // (Required) String
    "org_id": "uuid-v4-string" // (Required) UUIDv4
  }
  ```

### 1.3 Invite User
Sends an email invitation to a new employee/manager to join the specific organization.
- **Endpoint**: `POST /users/invite`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`)
- **Request Body**:
  ```json
  {
    "email": "employee@company.com", // (Required) Valid Email String
    "role": "employee", // (Required) String (e.g., 'employee', 'manager', 'hr')
    "name": "Jane Doe", // (Optional) String
    "emp_id": "EMP-001", // (Optional) String
    "location_id": "uuid-v4-string", // (Optional) UUIDv4 (Maps to Organization Location)
    "department_id": "uuid-v4-string", // (Optional) UUIDv4 (Maps to Organization Department)
    "designation": "Software Engineer", // (Optional) String
    "reporting_person": "uuid-v4-string" // (Optional) UUIDv4
    // Note: Other optional fields available (pan_number, blood_group, etc.)
  }
  ```

### 1.4 Resend Invitation
Resends the invitation email if the user lost it.
- **Endpoint**: `POST /users/invite/resend`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`)
- **Request Body**:
  ```json
  {
    "email": "employee@company.com" // (Required) Valid Email String
  }
  ```

### 1.5 Revoke Invitation
Cancels a pending invitation so the token can no longer be accepted.
- **Endpoint**: `POST /users/invite/revoke`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`)
- **Request Body**:
  ```json
  {
    "email": "employee@company.com" // (Required) Valid Email String
  }
  ```

### 1.6 Validate Invitation Token
Validates if an invitation token clicked in an email is still active before rendering the Accept screen.
- **Endpoint**: `GET /invitations/validate`
- **Auth**: No Auth
- **Query Parameters**:
  - `token` (Required) String: The JWT token from the email link.
- **Response**: Returns the pre-filled `email`, `role`, and `orgName` so the frontend can display a welcoming screen.

### 1.7 Accept Invitation
Accepts the invitation. If the user doesn't exist globally, they must provide a password to complete registration.
- **Endpoint**: `POST /invitations/accept`
- **Auth**: Optional
- **Request Body**:
  ```json
  {
    "token": "jwt-token-string", // (Required) String
    "password": "StrongPassword123!" // (Optional) String. Required ONLY if the user is new to the platform. Must have 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.
  }
  ```

---

## 2. Organization Structure

### 2.1 Get All Locations
Fetches all structural locations defined for the organization.
- **Endpoint**: `GET /locations`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`, `employee`)
- **Query Parameters**:
  - `include_inactive` (Optional) Boolean string (e.g., `?include_inactive=true`). Defaults to false.
- **Response**: Array of location objects.

### 2.2 Create Location
Defines a new physical office or branch.
- **Endpoint**: `POST /locations`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`)
- **Request Body**:
  ```json
  {
    "name": "Mumbai HQ", // (Required) String (Max 150)
    "timezone": "Asia/Kolkata", // (Optional) String
    "latitude": 19.0760, // (Optional) Number (Decimal)
    "longitude": 72.8777, // (Optional) Number (Decimal)
    "geofence_radius_meters": 100, // (Optional) Integer (Min 10)
    "address": "123 Main St", // (Optional) String
    "city": "Mumbai", // (Optional) String
    "state": "Maharashtra", // (Optional) String
    "country": "India", // (Optional) String
    "pincode": "400001", // (Optional) String
    "is_active": true // (Optional) Boolean
  }
  ```

### 2.3 Update Location
Updates details of an existing location.
- **Endpoint**: `PUT /locations/:id`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`)
- **URL Parameters**: `:id` (UUIDv4)
- **Request Body**: Same fields as Create Location, but all are optional.

### 2.4 Get All Departments
Fetches all structural departments defined for the organization.
- **Endpoint**: `GET /departments`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`, `employee`)
- **Query Parameters**:
  - `include_inactive` (Optional) Boolean string (e.g., `?include_inactive=true`). Defaults to false.
- **Response**: Array of department objects, eager-loaded with nested `location` data.

### 2.5 Create Department
Defines a new department or team.
- **Endpoint**: `POST /departments`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`)
- **Request Body**:
  ```json
  {
    "name": "Engineering", // (Required) String (Max 150)
    "location_id": "uuid-v4-string", // (Optional) UUIDv4
    "description": "Software Development Team", // (Optional) String
    "head_of_department_id": "uuid-v4-string", // (Optional) UUIDv4
    "is_active": true // (Optional) Boolean
  }
  ```

### 2.6 Update Department
Updates an existing department.
- **Endpoint**: `PUT /departments/:id`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`)
- **URL Parameters**: `:id` (UUIDv4)
- **Request Body**: Same fields as Create Department, but all are optional.

---

## 3. Employee Management

### 3.1 Get All Employees (Directory)
Fetches a flattened, frontend-friendly list of all employees in the organization.
- **Endpoint**: `GET /employees`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`)
- **Query Parameters**:
  - `purpose` (Required) String: Must be `shift_assignment` or `emp_report`.
  - `include_inactive` (Optional) Boolean string: Default `false`. Set to `true` to view deactivated employees.
- **Response Schema**:
  ```json
  [
    {
      "user_id": "uuid", // Use THIS ID for subsequent API calls
      "org_id": "uuid",
      "name": "John Doe",
      "employee_id": "uuid", // Internal profile ID (Do not use for route params)
      "role": "employee",
      "employee_code": "EMP001",
      "department_id": "uuid",
      "department": "Engineering",
      "designation": "Backend Developer",
      "location_id": "uuid",
      "work_location": "Mumbai HQ",
      "is_active": true,
      "status": "active"
    }
  ]
  ```

### 3.2 Get Employee By ID
Fetches the deep, eager-loaded profile data for a specific employee.
- **Endpoint**: `GET /employees/:id`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`, `manager`)
- **URL Parameters**: `:id` (UUIDv4). Must be the global `user_id`.

### 3.3 Update Employee Status (Activate/Deactivate)
Deactivates an employee's access to the specific organization without deleting their history or affecting their global identity.
- **Endpoint**: `PATCH /employees/:id/status`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`)
- **URL Parameters**: `:id` (UUIDv4). Must be the global `user_id`.
- **Request Body**:
  ```json
  {
    "is_active": false // (Required) Boolean
  }
  ```

### 3.4 Soft Delete Employee
Permanently severs an employee's access to the organization by performing a soft-delete (`deleted_at`).
- **Endpoint**: `DELETE /employees/:id`
- **Auth**: Required (Roles: `super-admin`, `admin`, `hr`)
- **URL Parameters**: `:id` (UUIDv4). Must be the global `user_id`.
- **Response**: The API will immediately terminate their active session for this specific tenant, but all historical relational data (leaves, attendance) will remain in the database forever.
