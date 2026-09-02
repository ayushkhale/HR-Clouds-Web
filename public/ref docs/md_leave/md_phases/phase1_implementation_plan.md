# Phase 1: Foundation — Schema, Models & HR Admin CRUD
*(Production-Level Implementation Plan)*

## 1. Goal Description
Build the robust database foundation for the Leave Management System. This phase focuses entirely on the database schema, Sequelize models, Data Access layer (Repositories), and HR-facing APIs for configuring Leave Types, Templates, and Entitlements. 

**Critical Directive:** This phase must incorporate all bug fixes and gap resolutions identified in the final review of the architecture, ensuring tenant isolation (`org_id`) across all tables, establishing auditability, and preparing the schema for all downstream edge cases (e.g., half-days, notice periods, gender-specific leaves, soft deletes). No application/deduction logic is built here; only the configuration engine.

---

## 2. Directory Structure Setup
We will establish a unified `leave` module to prevent duplicate business logic.
```text
src/
└── modules/
    └── leave/
        ├── controllers/
        │   └── leave_admin.controller.js
        ├── models/
        │   ├── leave_types.model.js
        │   ├── leave_policy_templates.model.js
        │   ├── leave_policy_entitlements.model.js
        │   ├── employee_leave_configs.model.js
        │   ├── leave_balances.model.js
        │   └── leave_requests.model.js
        ├── repositories/
        │   ├── leave_types.repository.js
        │   ├── leave_policy_templates.repository.js
        │   ├── leave_policy_entitlements.repository.js
        │   ├── employee_leave_configs.repository.js
        │   ├── leave_balances.repository.js
        │   └── leave_requests.repository.js
        ├── routes/
        │   └── leave_admin.routes.js
        ├── services/
        │   └── leave_admin.service.js
        ├── validators/
        │   ├── leave_admin.validator.js
        └── leave.module.js (Index exporter)
```

---

## 3. Database Migrations & Schema Definitions

*All tables must include `createdAt`, `updatedAt`, and `deletedAt` (paranoid: true).*

### 3.1 Migration: Add `gender` to Profile Models (Fix for Bug 4 / Edge Case 10)
Before building the leave models, we must fix the missing demographic fields required for gender-specific leave policies (e.g., Maternity/Paternity).
- **Target Tables:** `employee_profiles`, `manager_profiles`, `hr_profiles`
- **New Column:** `gender` (Enum: `male`, `female`, `other`, `prefer_not_to_say`, nullable)

### 3.2 `leave_types` (Global/Tenant Scoped Leave Definitions)
- `id` (UUID, Primary Key)
- `org_id` (UUID, NOT NULL) **[Fix for Gap 1: Tenant Scoping]**
- `name` (String, NOT NULL, e.g., 'Sick Leave')
- `code` (String, NOT NULL, e.g., 'SL')
- `is_paid` (Boolean, default: true)
- `requires_document_threshold` (Integer, default: 0)
- `sandwich_rule_applies` (Boolean, default: false) **[Prep for Edge Case 4]**
- `is_active` (Boolean, default: true) **[Fix for Bug 6 / Edge Case 26: Soft-Delete Safety]**

### 3.3 `leave_policy_templates` (Base Rules for HR)
- `id` (UUID, Primary Key)
- `org_id` (UUID, NOT NULL) **[Fix for Gap 2: Tenant Scoping]**
- `name` (String, NOT NULL, e.g., 'Standard Permanent 2026')
- `description` (Text, NULL)

### 3.4 `leave_policy_entitlements` (Template Quotas)
- `id` (UUID, Primary Key)
- `org_id` (UUID, NOT NULL) **[Fix for Gap 4: Direct Multi-Tenant Safety]**
- `policy_template_id` (UUID, NOT NULL, FK to `leave_policy_templates`)
- `leave_type_id` (UUID, NOT NULL, FK to `leave_types`)
- `annual_quota` (Float, NOT NULL)
- `accrual_type` (Enum: `upfront`, `monthly`, NOT NULL)
- `max_carry_forward` (Float, default: 0)
- `probation_restriction_days` (Integer, default: 0) **[Prep for Edge Case 9]**
- `max_negative_balance` (Float, default: 0) **[Prep for Edge Case 12]**

### 3.5 `employee_leave_configs` (Individualized Employee Policies)
- `id` (UUID, Primary Key)
- `org_id` (UUID, NOT NULL, FK to `organizations`)
- `user_id` (UUID, NOT NULL, FK to `users`)
- `leave_type_id` (UUID, NOT NULL, FK to `leave_types`)
- `assigned_annual_quota` (Float, NOT NULL)
- `accrual_type` (Enum: `upfront`, `monthly`, NOT NULL) **[Fix for Bug 3: Lost Accrual Config]**
- `max_carry_forward` (Float, default: 0) **[Fix for Bug 3: Lost Carry Forward]**
- `effective_from` (Date, NOT NULL)
- `effective_to` (Date, NULL)

### 3.6 `leave_balances` (Live Wallet Tracker)
- `id` (UUID, Primary Key)
- `org_id` (UUID, NOT NULL, FK to `organizations`)
- `user_id` (UUID, NOT NULL, FK to `users`)
- `leave_type_id` (UUID, NOT NULL, FK to `leave_types`)
- `year` (Integer, NOT NULL)
- `total_accrued` (Float, default: 0)
- `total_used` (Float, default: 0)
- `current_balance` (Float, default: 0)

### 3.7 `leave_requests` (The Application)
- `id` (UUID, Primary Key)
- `org_id` (UUID, NOT NULL, FK to `organizations`) **[Fix for Bug 1: Crucial Tenant Scope]**
- `user_id` (UUID, NOT NULL, FK to `users`)
- `leave_type_id` (UUID, NOT NULL, FK to `leave_types`)
- `start_date` (Date, NOT NULL)
- `end_date` (Date, NOT NULL)
- `total_days` (Float, NOT NULL)
- `is_half_day` (Boolean, default: false) **[Fix for Bug 7: Half-Day Support]**
- `half_day_type` (Enum: `null`, `first_half`, `second_half`, default: `null`) **[Fix for Bug 7 / Edge Case 28]**
- `status` (Enum: `pending`, `approved`, `rejected`, `cancelled`, `cancellation_pending`, `terminated_cancelled`, default: `pending`)
- `reason` (Text, NULL)
- `document_url` (String, NULL)
- `approved_by` (UUID, NULL, FK to `users`)
- `actioned_at` (Date, NULL) **[Fix for Bug 2: Audit Logs]**
- `rejection_reason` (Text, NULL) **[Fix for Bug 2: Audit Logs]**
- `requested_at` (Date, NOT NULL, default: NOW) **[Fix for Gap 5: Explicit Submission Time]**

---

## 4. Sequelize Models & Associations Layer
1. Scaffold models utilizing `sequelize.define` with `paranoid: true`.
2. Ensure strict foreign key constraints (e.g., `ON DELETE CASCADE` for entitlements when a template is hard-deleted, but we prefer soft deletes).
3. **Indexes:**
   - Composite Index on `[org_id, code]` in `leave_types` (Code must be unique per Org).
   - Composite Index on `[org_id, user_id, leave_type_id, year]` in `leave_balances`.
   - Index on `[org_id, status]` in `leave_requests` for faster reporting queries.
4. **Associations:**
   - `Organization.hasMany(LeaveType)`
   - `User.hasMany(LeaveRequest)`
   - `LeaveType.hasMany(LeavePolicyEntitlement)`
   - `LeavePolicyTemplate.hasMany(LeavePolicyEntitlement)`
   - `LeaveRequest.belongsTo(User, { as: 'Applicant', foreignKey: 'user_id' })`
   - `LeaveRequest.belongsTo(User, { as: 'Approver', foreignKey: 'approved_by' })`

---

## 5. Repository Abstraction Layer
Build repositories encapsulating all DB interactions. 
**Security Standard:** EVERY generic read/write method MUST accept and enforce `org_id` in the `where` clause to prevent tenant data leaks.

*Example signatures:*
- `findById(id, orgId)`
- `findAllByOrgId(orgId, filters, pagination)`
- `update(id, orgId, updatePayload, transaction)`
- `softDelete(id, orgId, transaction)`

---

## 6. Service & API Layer — `leave_admin.routes.js`
*Target Audience: Roles `['hr', 'admin', 'super-admin']`*

### 6.1 Validation (Joi/express-validator)
- Create robust validation rules in `leave_admin.validator.js`. Ensure fields like `max_carry_forward` cannot be negative, and `code` strictly follows an alphanumeric format.

### 6.2 Leave Types CRUD
- **`POST /api/v1/leaves/types`**
  - Check if `code` already exists for this `org_id`.
- **`GET /api/v1/leaves/types`**
  - Fetch active types (`is_active: true`) by default. Support a `?include_inactive=true` query.
- **`PUT /api/v1/leaves/types/:id`**
- **`DELETE /api/v1/leaves/types/:id` (Fix for Bug 6 / Edge Case 26)**
  - *Logic Check:* Before setting `is_active = false`, query `leave_requests` to see if there are any `pending` requests for this type in this org. If yes, throw a `409 Conflict` explaining they must be actioned first. If no, proceed with soft delete.

### 6.3 Templates & Entitlements CRUD (Fix for Gap 3)
- **`POST /api/v1/leaves/templates`**
- **`GET /api/v1/leaves/templates`**
  - *Data Load:* Automatically eager load `entitlements` and nested `leave_types` so the frontend gets the full policy shape in one call.
- **`PUT /api/v1/leaves/templates/:id`**
- **`DELETE /api/v1/leaves/templates/:id`**
- **`POST /api/v1/leaves/templates/:id/entitlements`**
  - *Logic Check:* Prevent duplicate `leave_type_id` entries inside the same template.
- **`PUT /api/v1/leaves/templates/:id/entitlements/:entitlementId`**
- **`DELETE /api/v1/leaves/templates/:id/entitlements/:entitlementId`**

---

## 7. Verification & Handoff Criteria
1. **Schema Validation:** Verify migrations run successfully and all constraints/indexes (especially `org_id`) are in place. Verify `gender` migration executed successfully on Profile models.
2. **Tenant Isolation Check:** Write a test simulating an HR admin from Org A attempting to modify/delete a Leave Type belonging to Org B. It must return a `404 Not Found`.
3. **Soft-Delete Safety:** Attempt to delete a Leave Type that has a pending request. Verify it throws a validation error.
4. **API Completeness:** Ensure Postman/cURL can successfully execute the full CRUD cycle for Types, Templates, and Entitlements.
