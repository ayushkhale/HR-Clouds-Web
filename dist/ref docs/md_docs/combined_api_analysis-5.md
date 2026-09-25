# Combined API Analysis: Document Module (Phases 1, 2, 3, 4 & 5: Core Foundation, Org-Issued Documents, Compliance/Signatures, Requests/Checklists/Retention, & Templates/Search/Reports/Offboarding/Composed-View/Materialisation/Top-Up/Leave-Bridge)
# Phase 1: Core Foundation (APIs #1–#42)
## 1. HR Administration APIs — Catalog & Types

*Auth stack for all routes in this section:* `authenticate` → `authorize(['hr'])` → `requireFeature('documents.access')`.

---

### 1. GET /api/v1/documents/hr/catalog
* **API Name / Purpose:** List Document Type Catalog
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/catalog`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs to know what standard document types (e.g. PAN, Aadhaar, Passport) the platform supports out-of-the-box before activating them for the organization.
* **Why the API Exists:** Provides a centralized, standardized registry of document definitions to ensure consistent validation rules and policies across all tenant organizations.
* **Real-World Usage:** HR admins open the "Add Document Type" modal and browse/search available platform types.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `plane` | Query | String | Optional | None | Filter by plane (`employee`, `org`) |
  | `group` | Query | String | Optional | None | Filter by group (e.g., `identity`, `medical`, `education`) |
  | `country_code` | Query | String | Optional | None | Two-letter ISO country code (e.g., `IN`, `US`) |
  | `q` | Query | String | Optional | None | Search term matching code, name, or description (max 200 chars) |
  | `activated` | Query | Boolean | Optional | None | Filter by activation status in this org (`true` or `false`) |
  | `include_inactive`| Query | Boolean | Optional | `false` | When `true`, includes catalog entries soft-disabled globally |
* **Backend Processing Flow:**
  1. Validates query parameters against Joi schema.
  2. Queries `document_type_catalog` filtered by `plane`, `group`, `country_code`, `q`, and global `is_active`.
  3. Loads organization's activated `document_types` for the current `orgId` to compute `is_activated`, `org_type_id`, and `org_type_is_active`.
  4. Filters by `activated` if explicitly requested.
  5. Wraps the resulting array in standard `{ success: true, message: 'OK', data: [...] }` envelope.
* **Database Impact:** Read-only (SELECT queries on `document_type_catalog` and `document_types`).
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "code": "pan_card",
        "name": "PAN Card",
        "plane": "employee",
        "group": "identity",
        "description": "Permanent Account Number issued by the Income Tax Department",
        "country_code": "IN",
        "is_statutory": true,
        "default_is_confidential": false,
        "default_employee_can_upload": true,
        "default_employee_can_view": true,
        "default_employee_can_delete": false,
        "default_manager_can_view": false,
        "default_manager_can_request": false,
        "default_requires_verification": true,
        "default_requires_acknowledgement": false,
        "default_requires_signature": false,
        "default_has_expiry": false,
        "default_expiry_reminder_days": [30, 15, 7],
        "default_is_mandatory": false,
        "default_mandatory_for": {},
        "default_allows_multiple": false,
        "default_max_file_size_bytes": 10485760,
        "default_allowed_content_types": [
          "application/pdf",
          "image/jpeg",
          "image/png"
        ],
        "default_retention_days": 2555,
        "display_order": 0,
        "is_active": true,
        "created_at": "2026-03-01T00:00:00.000Z",
        "updated_at": "2026-03-01T00:00:00.000Z",
        "is_activated": false,
        "org_type_id": null,
        "org_type_is_active": null
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates whether the request succeeded (`true`) |
  | `message` | String | No | Response status message (`"OK"`) |
  | `data` | Array[Object] | No | Array of catalog entry items matching filters |
  | `data[].id` | UUID | No | Unique identifier of the catalog template |
  | `data[].code` | String | No | System-wide unique document type code (e.g. `pan_card`) |
  | `data[].name` | String | No | Human-readable document type title |
  | `data[].plane` | String | No | Scope plane: `'employee'` or `'org'` |
  | `data[].group` | String | No | Classification group: `'identity'`, `'education'`, `'employment_history'`, `'financial'`, `'medical'`, etc. |
  | `data[].description` | String | Yes | Description or instructions for this document type |
  | `data[].country_code` | String | Yes | ISO 3166-1 alpha-2 jurisdiction code (e.g. `'IN'`) or `null` for global |
  | `data[].is_statutory` | Boolean | No | Whether document is legally mandatory under statutory regulations |
  | `data[].default_is_confidential` | Boolean | No | Default privacy setting when activated |
  | `data[].default_employee_can_upload` | Boolean | No | Default permission for employee self-upload |
  | `data[].default_employee_can_view` | Boolean | No | Default permission for employee viewing |
  | `data[].default_employee_can_delete` | Boolean | No | Default permission for employee deletion |
  | `data[].default_manager_can_view` | Boolean | No | Default permission for manager viewing |
  | `data[].default_manager_can_request` | Boolean | No | Default permission for manager request/upload |
  | `data[].default_requires_verification` | Boolean | No | Default requirement for HR verification |
  | `data[].default_requires_acknowledgement` | Boolean | No | Default requirement for employee acknowledgement |
  | `data[].default_requires_signature` | Boolean | No | Default requirement for digital signature |
  | `data[].default_has_expiry` | Boolean | No | Whether this document type tracks expiration |
  | `data[].default_expiry_reminder_days` | Array[Integer] | No | Days before expiration to send notifications (e.g. `[30, 15, 7]`) |
  | `data[].default_is_mandatory` | Boolean | No | Default mandatory compliance flag |
  | `data[].default_mandatory_for` | Object | No | Targeting criteria (e.g. department, role filters) |
  | `data[].default_allows_multiple` | Boolean | No | Whether multiple active copies are allowed per employee |
  | `data[].default_max_file_size_bytes` | Integer | No | Default maximum upload file size in bytes (e.g. `10485760` = 10 MB) |
  | `data[].default_allowed_content_types` | Array[String] | No | Default MIME types allowed for upload |
  | `data[].default_retention_days` | Integer | No | Statutory retention window in days (e.g. `2555` = 7 years) |
  | `data[].display_order` | Integer | No | Sorting sequence in UI selectors |
  | `data[].is_active` | Boolean | No | Whether catalog item is active in the platform catalog |
  | `data[].created_at` | String (ISO) | No | Timestamp of catalog entry creation |
  | `data[].updated_at` | String (ISO) | No | Timestamp of catalog entry last update |
  | `data[].is_activated` | Boolean | No | `true` if activated and currently active for the caller's organization |
  | `data[].org_type_id` | UUID | Yes | ID of the organization's instantiated `document_types` row, or `null` if not activated |
  | `data[].org_type_is_active` | Boolean | Yes | `is_active` state of the organization's type row, or `null` if not activated |
* **Exact Error Response Structures:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"plane\" must be one of [employee, org]",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Requires authenticated tenant context (`orgId`) and role `hr`.
* **Idempotency and Retry Behavior:** Read-only and idempotent.
* **Transactions/Concurrency Behavior:** No transaction required.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array `[]` when no catalog entries match the provided filters.
* **Related APIs/Dependencies:** API #3 (Activate Types).
* **What the API Gives/Does:** Lists all platform-provided document templates along with their organization-specific activation state.

---

### 2. GET /api/v1/documents/hr/catalog/:code
* **API Name / Purpose:** Get Catalog Entry Details
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/catalog/:code`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR wants to preview the default policies (e.g. max size, expiry rules) of a system type before activating it.
* **Why the API Exists:** Powers the "Preview & Activate" screen in the HR Document Type Catalog.
* **Real-World Usage:** Clicking on a specific catalog item like "PAN Card" to see its full configuration.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `code` | Path | String | Required | Catalog code (3–64 characters, e.g. `pan_card`, `aadhaar_card`) |
* **Backend Processing Flow:**
  1. Validates path parameter `code`.
  2. Queries `document_type_catalog` by unique code.
  3. Returns 404 if not found.
  4. Wraps result in `{ success: true, message: 'OK', data: { ... } }`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "code": "pan_card",
      "name": "PAN Card",
      "plane": "employee",
      "group": "identity",
      "description": "Permanent Account Number issued by the Income Tax Department",
      "country_code": "IN",
      "is_statutory": true,
      "default_is_confidential": false,
      "default_employee_can_upload": true,
      "default_employee_can_view": true,
      "default_employee_can_delete": false,
      "default_manager_can_view": false,
      "default_manager_can_request": false,
      "default_requires_verification": true,
      "default_requires_acknowledgement": false,
      "default_requires_signature": false,
      "default_has_expiry": false,
      "default_expiry_reminder_days": [30, 15, 7],
      "default_is_mandatory": false,
      "default_mandatory_for": {},
      "default_allows_multiple": false,
      "default_max_file_size_bytes": 10485760,
      "default_allowed_content_types": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "default_retention_days": 2555,
      "display_order": 0,
      "is_active": true,
      "created_at": "2026-03-01T00:00:00.000Z",
      "updated_at": "2026-03-01T00:00:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates whether the request succeeded (`true`) |
  | `message` | String | No | Response status message (`"OK"`) |
  | `data` | Object | No | Complete catalog template definition (see API #1 for field descriptions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Catalog Entry Not Found:**
    ```json
    {
      "success": false,
      "message": "Catalog entry not found",
      "errorCode": "CATALOG_ENTRY_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Tenant-scoped and requires `hr` role.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only; no locks needed.
* **Side Effects:** None.
* **Important Edge Cases:** None.
* **Related APIs/Dependencies:** API #1, API #3.
* **What the API Gives/Does:** Yields complete configuration parameters of a specific platform catalog template.

---

### 3. POST /api/v1/documents/hr/types/activate
* **API Name / Purpose:** Bulk Activate Catalog Types
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/types/activate`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR decides the company will now collect standard documents (e.g. "Aadhaar", "PAN", "Passport") from employees.
* **Why the API Exists:** Copies platform catalog defaults into the tenant's `document_types` table so that policies can be independently customized.
* **Real-World Usage:** HR selects multiple catalog items from the catalog view and clicks "Activate".
* **Request JSON Payload:**
  ```json
  {
    "codes": [
      "pan_card",
      "aadhaar_card"
    ]
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `codes` | Array[String] | Required | No | List of catalog type codes to activate | 1–100 items, unique, pattern `/^[a-z][a-z0-9_]{2,63}$/` | None |
* **Validation Rules:**
  - `codes` must be a non-empty array of valid format strings with no duplicates.
  - Every specified code must exist in `document_type_catalog` and be globally active; otherwise, the entire batch fails.
* **Backend Processing Flow:**
  1. Validates `codes` payload.
  2. Begins database transaction and acquires organization type lock: `pg_advisory_xact_lock(hashtext('doctypes:{orgId}'))`.
  3. Fetches catalog entries for all codes. If any code is missing or inactive, aborts with 404 or 409.
  4. Fetches existing `document_types` in the organization matching the codes.
  5. For each code:
     - If already active: adds to `already_active` list.
     - If soft-deleted / inactive: reactivates (`is_active = true`, preserving any previous custom modifications) and logs audit event `document_type.reactivated`.
     - If new: creates new row in `document_types` copying all `default_*` attributes from catalog entry, sets `source = 'catalog'`, and logs audit event `document_type.activated`.
  6. Commits transaction and returns arrays of activated, reactivated, and already active codes.
* **Database Impact:** Inserts/updates `document_types`; inserts rows into `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Activation processed",
    "data": {
      "activated": [
        "pan_card"
      ],
      "reactivated": [],
      "already_active": [
        "aadhaar_card"
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates whether the request succeeded (`true`) |
  | `message` | String | No | Status message (`"Activation processed"`) |
  | `data` | Object | No | Summary of activation operations |
  | `data.activated` | Array[String] | No | Array of newly activated document type codes |
  | `data.reactivated` | Array[String] | No | Array of previously inactive/soft-deleted codes that were reactivated |
  | `data.already_active` | Array[String] | No | Array of codes that were already active for this organization |
* **Exact Error Response Structures:**
  - **404 Not Found — Catalog Entry Not Found:**
    ```json
    {
      "success": false,
      "message": "Catalog entry not found: invalid_code",
      "errorCode": "CATALOG_ENTRY_NOT_FOUND"
    }
    ```
  - **409 Conflict — Catalog Entry Inactive:**
    ```json
    {
      "success": false,
      "message": "Catalog entry inactive: deprecated_doc",
      "errorCode": "CATALOG_ENTRY_INACTIVE"
    }
    ```
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"codes\" must contain at least 1 items",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Idempotent; calling multiple times with same codes safely returns codes in `already_active`.
* **Transactions/Concurrency Behavior:** Uses `doctypes:{orgId}` advisory lock and atomic transaction.
* **Side Effects:** Makes these document types available for employee and manager uploads.
* **Important Edge Cases:** Reactivating a previously deactivated type preserves earlier custom configuration overrides instead of resetting them to catalog defaults.
* **Related APIs/Dependencies:** API #1, API #5.
* **What the API Gives/Does:** Bulk instantiates or reactivates catalog document types for the tenant.

---

### 4. POST /api/v1/documents/hr/types
* **API Name / Purpose:** Create Custom Document Type
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/types`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** The organization has custom internal forms (e.g. "Acme Corp NDA 2026", "Laptop Handover Receipt") that employees must submit.
* **Why the API Exists:** Provides administrative flexibility to define custom document types outside platform catalog defaults.
* **Real-World Usage:** HR fills out the "Create Custom Document Type" form in settings.
* **Request JSON Payload:**
  ```json
  {
    "code": "custom_nda_2026",
    "name": "Acme Corp NDA 2026",
    "plane": "employee",
    "group": "policy",
    "description": "Signed Non-Disclosure Agreement for 2026",
    "is_confidential": true,
    "employee_can_upload": true,
    "employee_can_view": true,
    "employee_can_delete": false,
    "manager_can_view": false,
    "manager_can_request": false,
    "requires_verification": true,
    "requires_acknowledgement": false,
    "requires_signature": false,
    "has_expiry": false,
    "expiry_reminder_days": [30, 15, 7],
    "is_mandatory": false,
    "mandatory_for": {},
    "allows_multiple": false,
    "max_file_size_bytes": 10485760,
    "allowed_content_types": [
      "application/pdf"
    ],
    "retention_days": 2555,
    "display_order": 0
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `code` | String | Required | No | Unique code for custom type | Pattern `/^[a-z][a-z0-9_]{2,63}$/` | None |
  | `name` | String | Required | No | Display name | 2–150 characters | None |
  | `plane` | String | Optional | No | Target plane | `'employee'` or `'org'` | `'employee'` |
  | `group` | String | Required | No | Functional category | `'identity'`, `'education'`, `'employment_history'`, `'financial'`, `'medical'`, `'background_check'`, `'onboarding'`, `'policy'`, `'disciplinary'`, `'exit'` | None |
  | `description` | String | Optional | Yes | Detailed description/guidelines | Max 2000 characters | `null` |
  | `is_confidential` | Boolean | Optional | No | Hide from managers/peers | `true` or `false` | `false` |
  | `employee_can_upload` | Boolean | Optional | No | Self-service upload flag | `true` or `false` | `true` |
  | `employee_can_view` | Boolean | Optional | No | Employee view permission | `true` or `false` | `true` |
  | `employee_can_delete` | Boolean | Optional | No | Employee deletion permission | `true` or `false` | `false` |
  | `manager_can_view` | Boolean | Optional | No | Manager view permission | `true` or `false` | `false` |
  | `manager_can_request` | Boolean | Optional | No | Manager request/upload flag | `true` or `false` | `false` |
  | `requires_verification` | Boolean | Optional | No | Verification workflow required | `true` or `false` | `true` |
  | `requires_acknowledgement` | Boolean | Optional | No | Acknowledgement required | `true` or `false` | `false` |
  | `requires_signature` | Boolean | Optional | No | Signature required | `true` or `false` | `false` |
  | `has_expiry` | Boolean | Optional | No | Tracks document expiration | `true` or `false` | `false` |
  | `expiry_reminder_days` | Array[Integer] | Optional | No | Notification schedule | Array of integers 0–365, max 10 items | `[30, 15, 7]` |
  | `is_mandatory` | Boolean | Optional | No | Mandatory submission flag | `true` or `false` | `false` |
  | `mandatory_for` | Object | Optional | No | Targeting criteria. Optional keys only: `target_departments` (uuid[]), `target_locations` (uuid[]), `target_employment_types` (string[]), `target_job_statuses` (string[]), `included_users` (uuid[]), `excluded_users` (uuid[]). Each array max 200 unique items; strings max 64 chars. `included_users` and `excluded_users` must be disjoint. Unknown keys are rejected (400 `VALIDATION_ERROR`, naming the key). This subtree deliberately opts out of the global `stripUnknown`, because `{}` means "mandatory for everyone" and a silently dropped typo would widen the audience instead of narrowing it | `{}` |
  | `allows_multiple` | Boolean | Optional | No | Permit multiple active records | `true` or `false` | `false` |
  | `max_file_size_bytes` | Integer | Optional | No | Size cap in bytes | Integer 1024 to 26214400 (25 MB) | `10485760` (10 MB) |
  | `allowed_content_types` | Array[String] | Optional | No | Allowed MIME types | Valid MIME types from supported list | `['application/pdf', 'image/jpeg', 'image/png']` |
  | `retention_days` | Integer | Optional | No | Retention window in days | Integer $\ge 30$ | `2555` (7 years) |
  | `display_order` | Integer | Optional | No | Sorting sequence | Integer $\ge 0$ | `0` |
* **Backend Processing Flow:**
  1. Validates payload via `createTypeSchema`.
  2. Acquires `doctypes:{orgId}` advisory lock.
  3. Verifies `code` is not reserved in global catalog and is unique within the organization.
  4. Forces `source = 'custom'`, `catalog_id = null`, and `is_statutory = false`.
  5. Inserts new record into `document_types`.
  6. Records audit entry `document_type.created`.
  7. Returns 201 Created with full created record.
* **Database Impact:** Inserts 1 row in `document_types`, inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Custom type created",
    "data": {
      "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "source": "custom",
      "catalog_id": null,
      "code": "custom_nda_2026",
      "name": "Acme Corp NDA 2026",
      "plane": "employee",
      "group": "policy",
      "description": "Signed Non-Disclosure Agreement for 2026",
      "is_statutory": false,
      "is_confidential": true,
      "employee_can_upload": true,
      "employee_can_view": true,
      "employee_can_delete": false,
      "manager_can_view": false,
      "manager_can_request": false,
      "requires_verification": true,
      "requires_acknowledgement": false,
      "requires_signature": false,
      "has_expiry": false,
      "expiry_reminder_days": [30, 15, 7],
      "is_mandatory": false,
      "mandatory_for": {},
      "allows_multiple": false,
      "max_file_size_bytes": 10485760,
      "allowed_content_types": [
        "application/pdf"
      ],
      "retention_days": 2555,
      "display_order": 0,
      "is_active": true,
      "created_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "created_at": "2026-03-22T03:00:00.000Z",
      "updated_at": "2026-03-22T03:00:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates whether the request succeeded (`true`) |
  | `message` | String | No | Status message (`"Custom type created"`) |
  | `data` | Object | No | The created document type record |
  | `data.id` | UUID | No | Unique identifier of the document type |
  | `data.org_id` | UUID | No | Organization identifier |
  | `data.source` | String | No | Creation source (`'custom'`) |
  | `data.catalog_id` | UUID | Yes | Catalog link (`null` for custom types) |
  | `data.code` | String | No | Unique code for this document type |
  | `data.name` | String | No | Display name |
  | `data.plane` | String | No | Target plane (`'employee'` or `'org'`) |
  | `data.group` | String | No | Classification group |
  | `data.description` | String | Yes | Description or employee instructions |
  | `data.is_statutory` | Boolean | No | Always `false` for custom types |
  | `data.is_confidential` | Boolean | No | Confidentiality flag |
  | `data.employee_can_upload` | Boolean | No | Employee upload permission |
  | `data.employee_can_view` | Boolean | No | Employee view permission |
  | `data.employee_can_delete` | Boolean | No | Employee delete permission |
  | `data.manager_can_view` | Boolean | No | Manager view permission |
  | `data.manager_can_request` | Boolean | No | Manager request permission |
  | `data.requires_verification` | Boolean | No | Verification requirement |
  | `data.requires_acknowledgement` | Boolean | No | Acknowledgement requirement |
  | `data.requires_signature` | Boolean | No | Signature requirement |
  | `data.has_expiry` | Boolean | No | Expiry tracking flag |
  | `data.expiry_reminder_days` | Array[Integer] | No | Expiration reminder schedule |
  | `data.is_mandatory` | Boolean | No | Mandatory submission flag |
  | `data.mandatory_for` | Object | No | Targeting criteria |
  | `data.allows_multiple` | Boolean | No | Multiple active documents allowed |
  | `data.max_file_size_bytes` | Integer | No | Max file size in bytes |
  | `data.allowed_content_types` | Array[String] | No | Permitted MIME types |
  | `data.retention_days` | Integer | No | Retention period in days |
  | `data.display_order` | Integer | No | Display ordering |
  | `data.is_active` | Boolean | No | Active status (`true`) |
  | `data.created_by` | UUID | No | ID of user who created the type |
  | `data.updated_by` | UUID | Yes | ID of user who last modified the type |
  | `data.created_at` | String (ISO) | No | Creation timestamp |
  | `data.updated_at` | String (ISO) | No | Last update timestamp |
* **Exact Error Response Structures:**
  - **409 Conflict — Code Reserved in Catalog:**
    ```json
    {
      "success": false,
      "message": "code is reserved in catalog",
      "errorCode": "DOCUMENT_TYPE_CODE_RESERVED"
    }
    ```
  - **409 Conflict — Code Already Exists in Org:**
    ```json
    {
      "success": false,
      "message": "code already exists",
      "errorCode": "DOCUMENT_TYPE_CODE_EXISTS"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Non-idempotent; retry with same code returns 409.
* **Transactions/Concurrency Behavior:** Transaction wrapped with advisory lock `doctypes:{orgId}`.
* **Side Effects:** New document type is immediately available for selection in allowed planes.
* **Important Edge Cases:** Custom types can NEVER be marked statutory (`is_statutory` is forcefully set to `false`).
* **Related APIs/Dependencies:** API #5, API #7.
* **What the API Gives/Does:** Creates a brand-new organization-specific document type.

---

### 5. GET /api/v1/documents/hr/types
* **API Name / Purpose:** List Organization Document Types
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/types`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs a dashboard to view and manage all active/inactive document types for their organization.
* **Why the API Exists:** Powers the Document Types configuration data table in HR settings.
* **Real-World Usage:** Loading the "Document Types" settings tab.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `plane` | Query | String | Optional | Filter by plane (`employee`, `org`) |
  | `group` | Query | String | Optional | Filter by functional group |
  | `source` | Query | String | Optional | Filter by source (`catalog`, `custom`) |
  | `is_active` | Query | Boolean | Optional | Filter by active status (`true`, `false`) |
* **Backend Processing Flow:**
  1. Validates query parameters.
  2. Queries `document_types` scoped to `org_id` applying optional filters.
  3. Returns array of matching `document_types` rows.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "source": "catalog",
        "catalog_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "code": "pan_card",
        "name": "PAN Card",
        "plane": "employee",
        "group": "identity",
        "description": "Permanent Account Number issued by Income Tax Department",
        "is_statutory": true,
        "is_confidential": false,
        "employee_can_upload": true,
        "employee_can_view": true,
        "employee_can_delete": false,
        "manager_can_view": false,
        "manager_can_request": false,
        "requires_verification": true,
        "requires_acknowledgement": false,
        "requires_signature": false,
        "has_expiry": false,
        "expiry_reminder_days": [30, 15, 7],
        "is_mandatory": false,
        "mandatory_for": {},
        "allows_multiple": false,
        "max_file_size_bytes": 10485760,
        "allowed_content_types": [
          "application/pdf",
          "image/jpeg",
          "image/png"
        ],
        "retention_days": 2555,
        "display_order": 0,
        "is_active": true,
        "created_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "created_at": "2026-03-22T03:00:00.000Z",
        "updated_at": "2026-03-22T03:00:00.000Z"
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Array[Object] | No | List of organization document types (see API #4 for item field descriptions) |
* **Exact Error Response Structures:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"source\" must be one of [catalog, custom]",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`, strictly scoped to tenant.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only; no transaction.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array `[]` when no types have been activated or created yet.
* **Related APIs/Dependencies:** API #6, API #7.
* **What the API Gives/Does:** Lists all configured document types for the caller's organization.

---

### 6. GET /api/v1/documents/hr/types/:id
* **API Name / Purpose:** Get Document Type Detail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/types/:id`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs to load a specific document type's settings into an "Edit Document Type" modal.
* **Why the API Exists:** Provides complete detail for a single organization document type.
* **Real-World Usage:** Clicking "Edit" or "Configure" on a document type row.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document type ID |
* **Backend Processing Flow:**
  1. Validates `id` as a valid UUID.
  2. Queries `document_types` where `id = :id` and `org_id = :orgId`.
  3. Returns 404 if not found.
  4. Returns document type object.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "source": "catalog",
      "catalog_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "code": "pan_card",
      "name": "PAN Card",
      "plane": "employee",
      "group": "identity",
      "description": "Permanent Account Number issued by Income Tax Department",
      "is_statutory": true,
      "is_confidential": false,
      "employee_can_upload": true,
      "employee_can_view": true,
      "employee_can_delete": false,
      "manager_can_view": false,
      "manager_can_request": false,
      "requires_verification": true,
      "requires_acknowledgement": false,
      "requires_signature": false,
      "has_expiry": false,
      "expiry_reminder_days": [30, 15, 7],
      "is_mandatory": false,
      "mandatory_for": {},
      "allows_multiple": false,
      "max_file_size_bytes": 10485760,
      "allowed_content_types": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "retention_days": 2555,
      "display_order": 0,
      "is_active": true,
      "created_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "created_at": "2026-03-22T03:00:00.000Z",
      "updated_at": "2026-03-22T03:00:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Complete document type configuration (see API #4 for field descriptions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`, tenant-scoped.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** None.
* **Related APIs/Dependencies:** API #7.
* **What the API Gives/Does:** Fetches the configuration of an individual document type.

---

### 7. PUT /api/v1/documents/hr/types/:id
* **API Name / Purpose:** Update Document Type
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/documents/hr/types/:id`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs to modify policies for a document type (e.g. increase max file size, allow managers to view, or mandate verification).
* **Why the API Exists:** Allows runtime tuning of organization document policies without engineering intervention.
* **Real-World Usage:** Submitting the "Edit Document Type" form.
* **Request JSON Payload:**
  ```json
  {
    "name": "PAN Card (Permanent Account Number)",
    "description": "Upload front side showing clear PAN and photograph",
    "employee_can_upload": true,
    "employee_can_view": true,
    "employee_can_delete": false,
    "manager_can_view": true,
    "manager_can_request": false,
    "requires_verification": true,
    "max_file_size_bytes": 15728640,
    "allowed_content_types": [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ],
    "has_expiry": false,
    "retention_days": 2555
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `name` | String | Optional | No | Updated display name | 2–150 characters | Unchanged |
  | `group` | String | Optional | No | Classification category | Valid category enum | Unchanged |
  | `description` | String | Optional | Yes | Updated instructions | Max 2000 characters | Unchanged |
  | `is_confidential` | Boolean | Optional | No | Confidentiality protection | `true` or `false` | Unchanged |
  | `employee_can_upload` | Boolean | Optional | No | Self-service upload flag | `true` or `false` | Unchanged |
  | `employee_can_view` | Boolean | Optional | No | Self-service view flag | `true` or `false` | Unchanged |
  | `employee_can_delete` | Boolean | Optional | No | Self-service delete flag | `true` or `false` | Unchanged |
  | `manager_can_view` | Boolean | Optional | No | Manager view flag | `true` or `false` | Unchanged |
  | `manager_can_request` | Boolean | Optional | No | Manager request flag | `true` or `false` | Unchanged |
  | `requires_verification` | Boolean | Optional | No | Verification requirement | `true` or `false` | Unchanged |
  | `requires_acknowledgement` | Boolean | Optional | No | Acknowledgement requirement | `true` or `false` | Unchanged |
  | `requires_signature` | Boolean | Optional | No | Signature requirement | `true` or `false` | Unchanged |
  | `has_expiry` | Boolean | Optional | No | Expiration tracking enabled | `true` or `false` | Unchanged |
  | `expiry_reminder_days` | Array[Integer] | Optional | No | Reminder schedule | Array of integers 0–365, max 10 items | Unchanged |
  | `is_mandatory` | Boolean | Optional | No | Mandatory submission flag | `true` or `false` | Unchanged |
  | `mandatory_for` | Object | Optional | No | Targeting criteria. Optional keys only: `target_departments` (uuid[]), `target_locations` (uuid[]), `target_employment_types` (string[]), `target_job_statuses` (string[]), `included_users` (uuid[]), `excluded_users` (uuid[]). Each array max 200 unique items; strings max 64 chars. `included_users` and `excluded_users` must be disjoint. Unknown keys are rejected (400 `VALIDATION_ERROR`, naming the key). This subtree deliberately opts out of the global `stripUnknown`, because `{}` means "mandatory for everyone" and a silently dropped typo would widen the audience instead of narrowing it | Unchanged |
  | `allows_multiple` | Boolean | Optional | No | Permit multiple active documents | `true` or `false` | Unchanged |
  | `max_file_size_bytes` | Integer | Optional | No | File size cap | 1024 to 26214400 (25 MB) | Unchanged |
  | `allowed_content_types` | Array[String] | Optional | No | Allowed MIME types | Supported MIME types list | Unchanged |
  | `retention_days` | Integer | Optional | No | Retention period in days | Integer $\ge 30$ | Unchanged |
  | `display_order` | Integer | Optional | No | Display sorting order | Integer $\ge 0$ | Unchanged |
  | `is_active` | Boolean | Optional | No | Operational status | `true` or `false` | Unchanged |
  | `code` / `plane` / `source` / `catalog_id` / `is_statutory` | Any | Optional | — | **IMMUTABLE FIELDS** — Attempting to change these surfaces `DOCUMENT_TYPE_FIELD_IMMUTABLE` |
* **Validation Rules:**
  - Payload must contain at least 1 field to update.
  - The fields `code`, `plane`, `source`, `catalog_id`, and `is_statutory` are **strictly immutable**. Any attempt to provide a different value triggers `409 DOCUMENT_TYPE_FIELD_IMMUTABLE`.
* **Backend Processing Flow:**
  1. Validates payload via `updateTypeSchema`.
  2. Acquires `doctypes:{orgId}` advisory lock.
  3. Loads row with `FOR UPDATE`. If missing, throws 404.
  4. Checks for attempts to mutate immutable fields (`detectImmutableFieldViolations`). If violated, throws 409.
  5. Strips immutable fields, stamps `updated_by = actorId`.
  6. Updates `document_types` row and creates audit log `document_type.updated` recording `oldValues` and `newValues`.
  7. Commits transaction and returns updated row.
* **Database Impact:** Updates `document_types`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Type updated",
    "data": {
      "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "source": "catalog",
      "catalog_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "code": "pan_card",
      "name": "PAN Card (Permanent Account Number)",
      "plane": "employee",
      "group": "identity",
      "description": "Upload front side showing clear PAN and photograph",
      "is_statutory": true,
      "is_confidential": false,
      "employee_can_upload": true,
      "employee_can_view": true,
      "employee_can_delete": false,
      "manager_can_view": true,
      "manager_can_request": false,
      "requires_verification": true,
      "requires_acknowledgement": false,
      "requires_signature": false,
      "has_expiry": false,
      "expiry_reminder_days": [30, 15, 7],
      "is_mandatory": false,
      "mandatory_for": {},
      "allows_multiple": false,
      "max_file_size_bytes": 15728640,
      "allowed_content_types": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "retention_days": 2555,
      "display_order": 0,
      "is_active": true,
      "created_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "created_at": "2026-03-22T03:00:00.000Z",
      "updated_at": "2026-03-22T03:15:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Type updated"`) |
  | `data` | Object | No | The updated document type record (see API #4 for field descriptions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
  - **409 Conflict — Immutable Field Violation:**
    ```json
    {
      "success": false,
      "message": "immutable fields cannot be changed: code, is_statutory",
      "errorCode": "DOCUMENT_TYPE_FIELD_IMMUTABLE",
      "details": {
        "fields": [
          "code",
          "is_statutory"
        ]
      }
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** Transaction wraps update and audit log under `doctypes:{orgId}` lock.
* **Side Effects:** Changes immediately affect subsequent document uploads and visibility checks.
* **Important Edge Cases:** Cannot convert statutory type to non-statutory or change internal code.
* **Related APIs/Dependencies:** API #5, API #6.
* **What the API Gives/Does:** Updates mutable configuration settings of a document type.

---

### 8. PATCH /api/v1/documents/hr/types/:id/deactivate
* **API Name / Purpose:** Deactivate Document Type
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/documents/hr/types/:id/deactivate`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** The organization no longer requires employees to upload a specific document type, but historical uploads must remain intact.
* **Why the API Exists:** Soft-deactivation prevents new uploads while preserving historical compliance and audit trails.
* **Real-World Usage:** Clicking "Deactivate" on a document type.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document type ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Acquires `doctypes:{orgId}` advisory lock.
  3. Loads row with `FOR UPDATE`. If already inactive, returns immediately.
  4. **In-use guard.** Counts, inside the same transaction, `employee_documents` for this type in `pending_upload`/`pending_verification` and `org_documents` in `draft`. If the total is above zero, throws `409 DOCUMENT_TYPE_IN_USE` and nothing is written. Settled documents (`available`, `expired`, `superseded`, `published`, `retired`) never block — retiring a type stops new documents, it does not invalidate issued ones.
  5. Updates `is_active = false` and `updated_by = actorId`.
  6. Inserts audit log `document_type.deactivated`.
  7. Commits transaction and returns updated row.
* **Database Impact:** Reads `employee_documents` and `org_documents` (counts), updates `document_types`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Type deactivated",
    "data": {
      "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "source": "catalog",
      "catalog_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "code": "pan_card",
      "name": "PAN Card",
      "plane": "employee",
      "group": "identity",
      "description": "Permanent Account Number",
      "is_statutory": true,
      "is_confidential": false,
      "employee_can_upload": true,
      "employee_can_view": true,
      "employee_can_delete": false,
      "manager_can_view": false,
      "manager_can_request": false,
      "requires_verification": true,
      "requires_acknowledgement": false,
      "requires_signature": false,
      "has_expiry": false,
      "expiry_reminder_days": [30, 15, 7],
      "is_mandatory": false,
      "mandatory_for": {},
      "allows_multiple": false,
      "max_file_size_bytes": 10485760,
      "allowed_content_types": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "retention_days": 2555,
      "display_order": 0,
      "is_active": false,
      "created_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "created_at": "2026-03-22T03:00:00.000Z",
      "updated_at": "2026-03-22T03:20:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Type deactivated"`) |
  | `data` | Object | No | The updated document type record |
  | `data.id` | UUID | No | Document type identifier |
  | `data.is_active` | Boolean | No | Deactivated status (`false`) |
  | *(all other fields)* | As defined in #4 | — | See API #4 for full field dictionary |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
  - **409 Conflict — Type Still In Use:**
    ```json
    {
      "success": false,
      "message": "Document type is in use by 3 open documents. Resolve or remove them before deactivating.",
      "errorCode": "DOCUMENT_TYPE_IN_USE",
      "details": { "open_employee_documents": 2, "open_org_documents": 1 }
    }
    ```
    Surface `details` in the UI — the counters tell HR what to clear. Treat `details` as an open-ended map: Phase 4 adds `open_document_requests` on the same rule and error code.
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with advisory lock `doctypes:{orgId}`. The in-use counts are read inside that transaction, so a document created concurrently cannot slip past the guard.
* **Side Effects:** Prevents issuance of new upload URLs for this document type across all planes. Existing documents remain viewable.
* **Important Edge Cases:** Does not soft-delete or delete any existing documents. A type with open documents cannot be deactivated at all (`409`) — resolve or remove them first.
* **Related APIs/Dependencies:** API #9 (Reactivate).
* **What the API Gives/Does:** Disables collection of a document type.

---

### 9. PATCH /api/v1/documents/hr/types/:id/activate
* **API Name / Purpose:** Reactivate Document Type
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/documents/hr/types/:id/activate`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR previously paused collecting a document type and now wants to resume collection.
* **Why the API Exists:** Reverses deactivation (API #8).
* **Real-World Usage:** Clicking "Activate" on an inactive document type.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document type ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Acquires `doctypes:{orgId}` advisory lock.
  3. Loads row with `FOR UPDATE`. If already active, returns immediately.
  4. Updates `is_active = true` and `updated_by = actorId`.
  5. Inserts audit log `document_type.reactivated`.
  6. Commits transaction and returns updated row.
* **Database Impact:** Updates `document_types`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Type reactivated",
    "data": {
      "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "source": "catalog",
      "catalog_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "code": "pan_card",
      "name": "PAN Card",
      "plane": "employee",
      "group": "identity",
      "description": "Permanent Account Number",
      "is_statutory": true,
      "is_confidential": false,
      "employee_can_upload": true,
      "employee_can_view": true,
      "employee_can_delete": false,
      "manager_can_view": false,
      "manager_can_request": false,
      "requires_verification": true,
      "requires_acknowledgement": false,
      "requires_signature": false,
      "has_expiry": false,
      "expiry_reminder_days": [30, 15, 7],
      "is_mandatory": false,
      "mandatory_for": {},
      "allows_multiple": false,
      "max_file_size_bytes": 10485760,
      "allowed_content_types": [
        "application/pdf",
        "image/jpeg",
        "image/png"
      ],
      "retention_days": 2555,
      "display_order": 0,
      "is_active": true,
      "created_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "created_at": "2026-03-22T03:00:00.000Z",
      "updated_at": "2026-03-22T03:25:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Type reactivated"`) |
  | `data` | Object | No | The updated document type record |
  | `data.id` | UUID | No | Document type identifier |
  | `data.is_active` | Boolean | No | Active status (`true`) |
  | *(all other fields)* | As defined in #4 | — | See API #4 for full field dictionary |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with advisory lock `doctypes:{orgId}`.
* **Side Effects:** Restores ability for employees/managers to upload this document type.
* **Important Edge Cases:** Retains all previously saved custom settings.
* **Related APIs/Dependencies:** API #8.
* **What the API Gives/Does:** Resumes collection of a document type.


## 2. HR Administration APIs — Documents & Settings

### 10. POST /api/v1/documents/hr/employees/:userId/documents
* **API Name / Purpose:** Issue HR Upload URL
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to directly upload a signed employment contract, statutory document, or onboarding proof on behalf of an employee without having to log in as the employee.
* **Why the API Exists:** Orchestrates secure, binary-free uploads via AWS S3 pre-signed PUT URLs with server-side validation of size, content type, and document constraints before storage.
* **Real-World Usage:** HR admin drags and drops an employee's scanned PAN card or Passport into the employee document repository.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
    "title": "Aadhaar Card Front & Back",
    "file_name": "aadhaar_card.pdf",
    "content_type": "application/pdf",
    "size_bytes": 1048576,
    "issued_on": "2020-01-15",
    "expires_on": null,
    "document_number": "123456789012",
    "is_confidential": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | UUID | Required | No | Target document type ID | Valid UUID of an active document type | None |
  | `title` | String | Required | No | Human-readable document title | 3–200 characters | None |
  | `file_name` | String | Required | No | Original filename of the file | 1–255 characters | None |
  | `content_type` | String | Required | No | MIME content type of the file | One of: `'image/jpeg'`, `'image/png'`, `'image/webp'`, `'application/pdf'`, `'application/msword'`, `'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`, `'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'` | None |
  | `size_bytes` | Integer | Required | No | Exact file size in bytes | 1 to 26214400 (25 MB cap) | None |
  | `issued_on` | String (Date) | Optional | Yes | Date document was issued | ISO 8601 date string (`YYYY-MM-DD`) | `null` |
  | `expires_on` | String (Date) | Optional | Yes | Expiration date of document | ISO 8601 date string (`YYYY-MM-DD`); required if type has `has_expiry=true` | `null` |
  | `document_number`| String | Optional | Yes | Unique reference number (PAN, Aadhaar, Passport) | 1–100 characters; masked in DB | `null` |
  | `is_confidential`| Boolean | Optional | No | Whether document is confidential | `true` or `false` | Type default |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `userId` | Path | UUID | Required | The employee user ID who owns the document |
* **Validation Rules:**
  - `document_type_id`, `title`, `file_name`, `content_type`, and `size_bytes` are strictly required.
  - `content_type` must be present in the document type's effective `allowed_content_types`.
  - `size_bytes` must be $\le$ the effective `max_file_size_bytes` of the document type / organization cap.
  - If document type requires expiry (`has_expiry = true`), `expires_on` is mandatory (`DOCUMENT_EXPIRY_REQUIRED`).
  - If both `issued_on` and `expires_on` are provided, `expires_on` must be after `issued_on` (`DOCUMENT_INVALID_DATES`).
  - For single-instance types (`allows_multiple = false`), only one live document (`status IN ('pending_verification', 'available', 'expired')`) may exist per employee. An in-progress stale `pending_upload` is automatically purged.
* **Backend Processing Flow:**
  1. Validates `userId` and request payload.
  2. Ensures S3 storage provider is configured.
  3. Begins database transaction. Loads document type and effective policy.
  4. For single-instance documents, acquires slot advisory lock `docslot:{orgId}:{userId}:{typeId}`. Checks for existing live documents.
  5. Generates `documentId` and deterministic S3 key: `tenants/{orgId}/employee/{userId}/{documentId}`.
  6. Creates row in `employee_documents` with status `pending_upload`, `source = 'hr_upload'`, and masked `document_number_last4`.
  7. Generates pre-signed S3 PUT URL with TTL configured by `document_upload_url_ttl_seconds`.
  8. Emits audit log `document.upload_issued`.
  9. Commits transaction and returns pre-signed URL details.
* **Database Impact:** Inserts 1 row in `employee_documents` (`status = 'pending_upload'`), inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Upload URL issued",
    "data": {
      "document_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "upload_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/c3b9b46e-789a-4c28-98e3-0d268a735cf1?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...",
      "expires_at": "2026-03-22T03:30:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "1048576"
      }
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Upload URL issued"`) |
  | `data` | Object | No | Pre-signed upload instructions |
  | `data.document_id` | UUID | No | Created document ID to be confirmed in API #11 |
  | `data.upload_url` | String | No | Pre-signed AWS S3 cryptographic PUT URL |
  | `data.expires_at` | String (ISO) | No | ISO timestamp when the upload URL expires |
  | `data.required_headers` | Object | No | Mandatory HTTP headers the client MUST pass when sending PUT to S3 |
  | `data.required_headers.Content-Type` | String | No | Exactly matches declared `content_type` |
  | `data.required_headers.Content-Length` | String | No | Exactly matches declared `size_bytes` |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
  - **409 Conflict — Document Type Inactive:**
    ```json
    {
      "success": false,
      "message": "Document type is inactive",
      "errorCode": "DOCUMENT_TYPE_INACTIVE"
    }
    ```
  - **409 Conflict — Document Already Exists:**
    ```json
    {
      "success": false,
      "message": "A live document of this type already exists — use replace instead",
      "errorCode": "DOCUMENT_ALREADY_EXISTS",
      "details": {
        "existing_document_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "status": "available"
      }
    }
    ```
  - **422 Unprocessable Entity — Content Type Not Allowed:**
    ```json
    {
      "success": false,
      "message": "content_type is not allowed for this document type",
      "errorCode": "DOCUMENT_CONTENT_TYPE_NOT_ALLOWED",
      "details": {
        "allowed": [
          "application/pdf",
          "image/jpeg",
          "image/png"
        ]
      }
    }
    ```
  - **422 Unprocessable Entity — Exceeds Size Limit:**
    ```json
    {
      "success": false,
      "message": "file size exceeds the effective limit of 10485760 bytes",
      "errorCode": "DOCUMENT_TOO_LARGE",
      "details": {
        "max_bytes": 10485760
      }
    }
    ```
  - **422 Unprocessable Entity — Expiry Required:**
    ```json
    {
      "success": false,
      "message": "expires_on is required for this document type",
      "errorCode": "DOCUMENT_EXPIRY_REQUIRED"
    }
    ```
  - **503 Service Unavailable — Storage Unavailable:**
    ```json
    {
      "success": false,
      "message": "document storage is not configured",
      "errorCode": "DOCUMENT_STORAGE_UNAVAILABLE"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`, tenant-scoped.
* **Idempotency and Retry Behavior:** Non-idempotent; retry generates new `document_id` and S3 key.
* **Transactions/Concurrency Behavior:** Protected by slot advisory lock `docslot:{orgId}:{userId}:{typeId}` to prevent race conditions on single-instance documents.
* **Side Effects:** Reserves document slot in database with status `pending_upload`.
* **Important Edge Cases:** If an upload was previously issued but abandoned past the TTL, this API automatically reaps the stale `pending_upload` row.
* **Related APIs/Dependencies:** API #11 (Confirm Upload).
* **What the API Gives/Does:** Issues a cryptographic S3 upload URL for HR to store an employee document.

---

### 11. POST /api/v1/documents/hr/documents/:id/confirm
* **API Name / Purpose:** Confirm HR Upload
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/confirm`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** The frontend has finished uploading the binary file directly to S3 and needs the backend to verify and transition the document to its active/pending state.
* **Why the API Exists:** Closes the asynchronous loop between client, AWS S3, and the PostgreSQL database.
* **Real-World Usage:** Called immediately by the frontend after receiving HTTP 200 OK from the S3 PUT request.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | The `document_id` returned by API #10 |
* **Backend Processing Flow:**
  1. Validates `id` format.
  2. Pre-loads document record from `employee_documents`.
  3. **Idempotency check:** If document is already `pending_verification`, `available`, or `expired`, returns the client representation immediately without re-calling S3.
  4. Calls S3 `HeadObject` **outside any database transaction** to verify the file was actually uploaded.
  5. Verifies that actual `contentType` and `contentLength` reported by S3 exactly match the declared metadata from API #10.
  6. Begins database transaction and acquires group lock: `pg_advisory_xact_lock(hashtext('docgrp:{orgId}:{groupId}'))`.
  7. If this is a version replacement (`version > 1` and `supersedes_id`), transitions the predecessor to `superseded`.
  8. Evaluates target status:
     - If document type / settings require verification: `pending_verification`.
     - Else if document has expired: `expired`.
     - Else: `available`.
  9. Updates document row: updates `status`, `confirmed_at = NOW()`, `checksum_sha256 = etag`.
  10. Records audit log `document.confirmed`.
  11. Commits transaction and returns finalized document object.
* **Database Impact:** Updates `employee_documents`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "Aadhaar Card Front & Back",
      "file_name": "aadhaar_card.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
      "storage_backend": "s3",
      "document_number_last4": "9012",
      "reference_url": null,
      "status": "pending_verification",
      "scan_status": "not_scanned",
      "issued_on": "2020-01-15",
      "expires_on": null,
      "is_confidential": false,
      "source": "hr_upload",
      "uploaded_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "confirmed_at": "2026-03-22T03:31:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "created_at": "2026-03-22T03:30:00.000Z",
      "updated_at": "2026-03-22T03:31:00.000Z",
      "display_status": "pending_verification"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Finalized employee document object |
  | `data.id` | UUID | No | Unique document identifier |
  | `data.org_id` | UUID | No | Tenant organization ID |
  | `data.user_id` | UUID | No | Employee owner user ID |
  | `data.document_type_id` | UUID | No | Associated document type ID |
  | `data.document_group_id` | UUID | No | Version group identifier |
  | `data.version` | Integer | No | Version sequence number (starts at 1) |
  | `data.supersedes_id` | UUID | Yes | ID of predecessor document replaced by this upload, or `null` |
  | `data.allows_multiple` | Boolean | No | Snapshot of type's allows_multiple setting |
  | `data.title` | String | No | Document title |
  | `data.file_name` | String | Yes | Original uploaded filename |
  | `data.content_type` | String | Yes | Verified MIME type |
  | `data.size_bytes` | Integer | Yes | Verified file size in bytes |
  | `data.checksum_sha256` | String | Yes | S3 ETag checksum of the uploaded file |
  | `data.storage_backend` | String | No | Storage provider: `'s3'` or `'reference'` |
  | `data.document_number_last4`| String | Yes | Masked last 4 characters of document number |
  | `data.reference_url` | String | Yes | External URL (`null` for S3 uploads) |
  | `data.status` | String | No | Lifecycle status: `'pending_verification'`, `'available'`, or `'expired'` |
  | `data.scan_status` | String | No | Malware scan status: `'not_scanned'`, `'clean'`, `'infected'`, `'failed'` |
  | `data.issued_on` | String (Date) | Yes | Issue date (`YYYY-MM-DD`) |
  | `data.expires_on` | String (Date) | Yes | Expiry date (`YYYY-MM-DD`) |
  | `data.is_confidential` | Boolean | No | Confidentiality protection flag |
  | `data.source` | String | No | Initiating source: `'hr_upload'` |
  | `data.uploaded_by` | UUID | No | User ID who initiated upload |
  | `data.confirmed_at` | String (ISO) | Yes | Timestamp upload was verified with S3 |
  | `data.recommendation` | String | No | Manager recommendation state: `'none'`, `'verify'`, `'reject'` |
  | `data.recommended_by` | UUID | Yes | Manager user ID who submitted recommendation |
  | `data.recommended_at` | String (ISO) | Yes | Recommendation timestamp |
  | `data.recommendation_note` | String | Yes | Manager's review notes |
  | `data.proposed_by` | UUID | Yes | Proposer user ID for maker-checker |
  | `data.approved_by` | UUID | Yes | Approver user ID |
  | `data.actioned_at` | String (ISO) | Yes | Approval/rejection timestamp |
  | `data.rejection_reason`| String | Yes | Reason string if rejected |
  | `data.created_at` | String (ISO) | No | Creation timestamp |
  | `data.updated_at` | String (ISO) | No | Last modification timestamp |
  | `data.display_status` | String | No | Computed status for UI: `'pending_verification'`, `'available'`, `'expired'`, etc. |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Not Awaiting Upload:**
    ```json
    {
      "success": false,
      "message": "Document is not awaiting upload",
      "errorCode": "DOCUMENT_NOT_AWAITING_UPLOAD",
      "details": {
        "status": "rejected"
      }
    }
    ```
  - **422 Unprocessable Entity — Object Not in S3:**
    ```json
    {
      "success": false,
      "message": "Uploaded object was not found",
      "errorCode": "DOCUMENT_OBJECT_NOT_FOUND"
    }
    ```
    *Trigger:* Frontend calls confirm before the S3 PUT completes or after upload failed.
  - **422 Unprocessable Entity — Verification Failed:**
    ```json
    {
      "success": false,
      "message": "Uploaded object failed verification",
      "errorCode": "DOCUMENT_VERIFICATION_FAILED"
    }
    ```
    *Trigger:* The file uploaded to S3 differs in size or MIME type from the parameters declared in API #10.
* **Security/Authorization Behavior:** Role `hr`, tenant-scoped. `storage_key` is strictly scrubbed from the response.
* **Idempotency and Retry Behavior:** Fully idempotent; safe to call multiple times.
* **Transactions/Concurrency Behavior:** S3 HeadObject executed outside transaction; row update executed under `docgrp:{orgId}:{groupId}` advisory lock.
* **Side Effects:** Promotes document to verification queue or active status.
* **Important Edge Cases:** If verifying a replacement, the predecessor is atomically set to `superseded`.
* **Related APIs/Dependencies:** API #10 (Issue Upload URL).
* **What the API Gives/Does:** Validates the uploaded S3 object and promotes the document to active/reviewable state.

---

### 12. POST /api/v1/documents/hr/employees/:userId/documents/link-reference
* **API Name / Purpose:** Link External Reference
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/documents/link-reference`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Some compliance or legal documents are hosted on external platforms (e.g. DocuSign, DigiLocker, Google Drive) and HR needs to link them without downloading and re-uploading binaries.
* **Why the API Exists:** Provides administrative capability to register externally-hosted documents.
* **Real-World Usage:** HR links an executed employment agreement hosted on DocuSign to an employee's profile.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
    "title": "DocuSign Signed Employment Contract",
    "reference_url": "https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=...",
    "issued_on": "2026-01-01",
    "expires_on": null,
    "document_number": "DS-2026-0987",
    "is_confidential": true
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | UUID | Required | No | Target document type ID | Active document type UUID | None |
  | `title` | String | Required | No | Document title | 3–200 characters | None |
  | `reference_url` | String | Required | No | External URL to document | Max 1000 characters; strictly HTTPS scheme | None |
  | `issued_on` | String (Date) | Optional | Yes | Date document was issued | ISO date (`YYYY-MM-DD`) | `null` |
  | `expires_on` | String (Date) | Optional | Yes | Expiry date | ISO date (`YYYY-MM-DD`) | `null` |
  | `document_number`| String | Optional | Yes | Document reference identifier | 1–100 characters; masked in DB | `null` |
  | `is_confidential`| Boolean | Optional | No | Confidentiality protection | `true` or `false` | Type default |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `userId` | Path | UUID | Required | Target employee user ID |
* **Validation Rules:**
  - `reference_url` must be a valid, secure HTTPS URL (`https://...`). Localhost, non-routable IPs, and HTTP are rejected (`INVALID_REFERENCE_URL`).
  - If document type requires expiry, `expires_on` is mandatory (`DOCUMENT_EXPIRY_REQUIRED`).
* **Backend Processing Flow:**
  1. Validates payload via `linkReferenceSchema`.
  2. Ensures `reference_url` passes URL safety check (`isSafeReferenceUrl`).
  3. Begins database transaction. Loads type and policy.
  4. For single-instance types, acquires slot advisory lock `docslot:{orgId}:{userId}:{typeId}` and asserts no live document exists.
  5. Creates document record with `storage_backend = 'reference'`, `reference_url = payload.reference_url`, `status = 'available'` (or `'expired'`), `file_name = null`, `size_bytes = null`, `confirmed_at = NOW()`, `approved_by = actorId`.
  6. Emits audit log `document.reference_linked`.
  7. Commits transaction and returns created record.
* **Database Impact:** Inserts 1 row in `employee_documents`, inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Reference linked",
    "data": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "DocuSign Signed Employment Contract",
      "file_name": null,
      "content_type": null,
      "size_bytes": null,
      "checksum_sha256": null,
      "storage_backend": "reference",
      "document_number_last4": "0987",
      "reference_url": "https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=...",
      "status": "available",
      "scan_status": "not_scanned",
      "issued_on": "2026-01-01",
      "expires_on": null,
      "is_confidential": true,
      "source": "hr_upload",
      "uploaded_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "confirmed_at": "2026-03-22T03:35:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "actioned_at": "2026-03-22T03:35:00.000Z",
      "rejection_reason": null,
      "created_at": "2026-03-22T03:35:00.000Z",
      "updated_at": "2026-03-22T03:35:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Reference linked"`) |
  | `data` | Object | No | Linked document record |
  | `data.storage_backend` | String | No | Always `'reference'` for linked external documents |
  | `data.reference_url` | String | No | The external HTTPS URL |
  | `data.status` | String | No | Created directly as `'available'` (or `'expired'`) |
  | `data.file_name` | String | Yes | Always `null` |
  | `data.size_bytes` | Integer | Yes | Always `null` |
  | `data.content_type` | String | Yes | Always `null` |
  | *(all other fields)* | As defined in #11 | — | See API #11 for full field dictionary |
* **Exact Error Response Structures:**
  - **422 Unprocessable Entity — Invalid Reference URL:**
    ```json
    {
      "success": false,
      "message": "reference_url is not a safe https URL",
      "errorCode": "INVALID_REFERENCE_URL"
    }
    ```
  - **409 Conflict — Document Already Exists:**
    ```json
    {
      "success": false,
      "message": "A live document of this type already exists",
      "errorCode": "DOCUMENT_ALREADY_EXISTS",
      "details": {
        "existing_document_id": "e2a8b34c-1234-4b56-7890-123456789abc"
      }
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Non-idempotent insert.
* **Transactions/Concurrency Behavior:** Transaction wrapped with slot advisory lock.
* **Side Effects:** Directly creates an active document record without S3 upload or verification queue.
* **Important Edge Cases:** Reference-backed documents do not expire via S3 presigned URLs; viewing them redirects to or returns the external URL directly.
* **Related APIs/Dependencies:** API #15 (Detail), API #17 (View URL).
* **What the API Gives/Does:** Links an external cloud document directly to an employee's file.

---

### 13. GET /api/v1/documents/hr/employees/:userId/documents
* **API Name / Purpose:** List Employee Documents (HR)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to review all documents uploaded for a specific employee profile.
* **Why the API Exists:** Provides complete administrative visibility into an employee's document file.
* **Real-World Usage:** Opening the "Documents" tab on an employee's profile.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `userId` | Path | UUID | Required | None | Employee user ID |
  | `type_id` | Query | UUID | Optional | None | Filter by document type ID |
  | `status` | Query | String | Optional | None | Filter by status (`available`, `pending_verification`, `expired`, `rejected`, etc.) |
  | `group_id` | Query | UUID | Optional | None | Filter by document group ID |
  | `expiring_before` | Query | String (Date) | Optional | None | ISO date string; filters documents expiring on or before this date |
  | `limit` | Query | Integer | Optional | `50` | Maximum items to return (1–200) |
  | `offset` | Query | Integer | Optional | `0` | Pagination offset ($\ge 0$) |
* **Backend Processing Flow:**
  1. Validates `userId` and query parameters.
  2. Queries `employee_documents` scoped to `org_id` and `user_id = :userId` using `findAndCountAll`.
  3. Projects standard list attributes (excluding `storage_key` and unmasked `document_number`).
  4. Dynamically computes `display_status` for each item.
  5. Returns paginated response `{ total, rows }`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
          "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "version": 1,
          "supersedes_id": null,
          "allows_multiple": false,
          "title": "Aadhaar Card Front & Back",
          "file_name": "aadhaar_card.pdf",
          "content_type": "application/pdf",
          "size_bytes": 1048576,
          "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
          "storage_backend": "s3",
          "document_number_last4": "9012",
          "reference_url": null,
          "status": "available",
          "scan_status": "not_scanned",
          "issued_on": "2020-01-15",
          "expires_on": null,
          "is_confidential": false,
          "source": "hr_upload",
          "uploaded_by": "71639be3-1a97-4408-8bac-5b8039336755",
          "confirmed_at": "2026-03-22T03:31:00.000Z",
          "recommendation": "none",
          "recommended_by": null,
          "recommended_at": null,
          "recommendation_note": null,
          "proposed_by": null,
          "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
          "actioned_at": "2026-03-22T03:32:00.000Z",
          "rejection_reason": null,
          "created_at": "2026-03-22T03:30:00.000Z",
          "updated_at": "2026-03-22T03:32:00.000Z",
          "display_status": "available"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Paginated document response |
  | `data.total` | Integer | No | Total count of documents matching filters |
  | `data.rows` | Array[Object] | No | Array of document items (see API #11 for item field definitions) |
* **Exact Error Response Structures:**
  - **400 Bad Request — Invalid UUID:**
    ```json
    {
      "success": false,
      "message": "\"userId\" must be a valid GUID",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`, tenant-scoped.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Returns `{ total: 0, rows: [] }` if the employee has no documents.
* **Related APIs/Dependencies:** API #15 (Detail).
* **What the API Gives/Does:** Lists all documents belonging to a specific employee.

---

### 14. GET /api/v1/documents/hr/documents/verification-queue
* **API Name / Purpose:** HR Verification Queue
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/verification-queue`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs a central inbox showing all documents uploaded across the company that are waiting for verification.
* **Why the API Exists:** Core workflow interface for Tier C (HR) document verification.
* **Real-World Usage:** HR opening the "Verification Inbox" to review new submissions.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `type_id` | Query | UUID | Optional | None | Filter by document type ID |
  | `user_ids` | Query | Array[UUID] | Optional | None | Filter by specific employee user IDs |
  | `limit` | Query | Integer | Optional | `50` | Page limit (1–200) |
  | `offset` | Query | Integer | Optional | `0` | Page offset ($\ge 0$) |
* **Backend Processing Flow:**
  1. Validates query parameters.
  2. Queries `employee_documents` where `org_id = :orgId` and `status = 'pending_verification'`.
  3. Orders results by `created_at ASC` (oldest pending documents first).
  4. Returns `{ total, rows }`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
          "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "version": 1,
          "supersedes_id": null,
          "allows_multiple": false,
          "title": "PAN Card Image",
          "file_name": "pan_card.jpg",
          "content_type": "image/jpeg",
          "size_bytes": 524288,
          "checksum_sha256": "e3b0c44298fc1c149afbf4c8996fb924",
          "storage_backend": "s3",
          "document_number_last4": "1234",
          "reference_url": null,
          "status": "pending_verification",
          "scan_status": "not_scanned",
          "issued_on": "2021-01-01",
          "expires_on": null,
          "is_confidential": false,
          "source": "self_upload",
          "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "confirmed_at": "2026-03-22T03:40:00.000Z",
          "recommendation": "verify",
          "recommended_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
          "recommended_at": "2026-03-22T03:42:00.000Z",
          "recommendation_note": "Verified against physical card",
          "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
          "approved_by": null,
          "actioned_at": null,
          "rejection_reason": null,
          "created_at": "2026-03-22T03:39:00.000Z",
          "updated_at": "2026-03-22T03:42:00.000Z",
          "display_status": "pending_verification"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.total` | Integer | No | Total count of documents pending verification |
  | `data.rows` | Array[Object] | No | Array of pending verification documents |
  | `data.rows[].recommendation` | String | No | Shows manager's recommendation if provided (`'verify'`, `'reject'`, or `'none'`) |
  | `data.rows[].recommendation_note` | String | Yes | Manager's comment for HR |
  | *(all other fields)* | As defined in #11 | — | See API #11 for full field dictionary |
* **Exact Error Response Structures:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"type_id\" must be a valid GUID",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Documents appear in this queue only after successful confirmation (API #11, #30, or #37).
* **Related APIs/Dependencies:** API #18 (Verify), API #19 (Reject).
* **What the API Gives/Does:** Lists all documents awaiting HR verification, sorted oldest first.

---

### 15. GET /api/v1/documents/hr/documents/:id
* **API Name / Purpose:** Get Document Detail (HR)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to inspect all metadata for a specific document before verifying, rejecting, or deleting it.
* **Why the API Exists:** Provides administrative single-document inspection.
* **Real-World Usage:** Clicking on a document in the verification queue or employee document list.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Queries document by `id` and `org_id`.
  3. Returns 404 if not found.
  4. Returns client-projected document object (scrubbed of `storage_key` and unmasked `document_number`).
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "Aadhaar Card Front & Back",
      "file_name": "aadhaar_card.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
      "storage_backend": "s3",
      "document_number_last4": "9012",
      "reference_url": null,
      "status": "available",
      "scan_status": "not_scanned",
      "issued_on": "2020-01-15",
      "expires_on": null,
      "is_confidential": false,
      "source": "hr_upload",
      "uploaded_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "confirmed_at": "2026-03-22T03:31:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "actioned_at": "2026-03-22T03:32:00.000Z",
      "rejection_reason": null,
      "created_at": "2026-03-22T03:30:00.000Z",
      "updated_at": "2026-03-22T03:32:00.000Z",
      "display_status": "available"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Complete document details (see API #11 for all field descriptions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`, tenant-scoped.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** None.
* **Related APIs/Dependencies:** API #16 (Versions), API #17 (View URL).
* **What the API Gives/Does:** Retrieves full metadata for a single document.

---

### 16. GET /api/v1/documents/hr/documents/:id/versions
* **API Name / Purpose:** Get Document Versions
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/versions`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to see previous revisions of a document to review historical changes.
* **Why the API Exists:** Provides complete version history for any document group.
* **Real-World Usage:** Clicking "Version History" on a document detail page.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Any document ID belonging to the version chain |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Resolves target document to obtain its `document_group_id`.
  3. Queries `employee_documents` where `document_group_id = :groupId` ordered by `version ASC`.
  4. Returns array of client-projected document records.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "document_group_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "version": 1,
        "supersedes_id": null,
        "allows_multiple": false,
        "title": "PAN Card (Original)",
        "file_name": "pan_v1.pdf",
        "content_type": "application/pdf",
        "size_bytes": 512000,
        "checksum_sha256": "a1b2c3d4e5f6...",
        "storage_backend": "s3",
        "document_number_last4": "1234",
        "reference_url": null,
        "status": "superseded",
        "scan_status": "not_scanned",
        "issued_on": "2020-01-01",
        "expires_on": null,
        "is_confidential": false,
        "source": "self_upload",
        "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "confirmed_at": "2026-01-10T10:00:00.000Z",
        "recommendation": "none",
        "recommended_by": null,
        "recommended_at": null,
        "recommendation_note": null,
        "proposed_by": null,
        "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "actioned_at": "2026-01-10T11:00:00.000Z",
        "rejection_reason": null,
        "created_at": "2026-01-10T09:50:00.000Z",
        "updated_at": "2026-03-22T03:30:00.000Z",
        "display_status": "superseded"
      },
      {
        "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "document_group_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "version": 2,
        "supersedes_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "allows_multiple": false,
        "title": "PAN Card (Re-upload)",
        "file_name": "pan_v2.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1048576,
        "checksum_sha256": "d41d8cd98f00...",
        "storage_backend": "s3",
        "document_number_last4": "1234",
        "reference_url": null,
        "status": "available",
        "scan_status": "not_scanned",
        "issued_on": "2020-01-01",
        "expires_on": null,
        "is_confidential": false,
        "source": "hr_upload",
        "uploaded_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "confirmed_at": "2026-03-22T03:31:00.000Z",
        "recommendation": "none",
        "recommended_by": null,
        "recommended_at": null,
        "recommendation_note": null,
        "proposed_by": null,
        "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "actioned_at": "2026-03-22T03:32:00.000Z",
        "rejection_reason": null,
        "created_at": "2026-03-22T03:30:00.000Z",
        "updated_at": "2026-03-22T03:32:00.000Z",
        "display_status": "available"
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Array[Object] | No | Chronological list of document versions (oldest to newest) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** For single-version documents, returns an array with exactly 1 item.
* **Related APIs/Dependencies:** API #15, API #20.
* **What the API Gives/Does:** Lists all revisions in a document's version chain.

---

### 17. GET /api/v1/documents/hr/documents/:id/view-url
* **API Name / Purpose:** Issue View URL (HR)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/view-url`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to securely view or download the actual document file in the browser without exposing S3 bucket credentials or persisting raw files on the web server.
* **Why the API Exists:** Issues short-lived, pre-signed AWS S3 cryptographic GET URLs with pinned content-disposition and content-type.
* **Real-World Usage:** Clicking "View Document" or "Download" in the HR admin console.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | None | Document ID to view |
  | `disposition` | Query | String | Optional | `'inline'` | Presentation mode: `'inline'` (view in browser tab) or `'attachment'` (force download) |
* **Backend Processing Flow:**
  1. Validates `id` and `disposition`.
  2. Loads document record.
  3. If document is reference-backed (`storage_backend = 'reference'`), logs audit event `document.viewed` and immediately returns the external URL with `expires_at = null`.
  4. If S3-backed, loads storage key from database.
  5. Sanitizes filename and constructs `Content-Disposition` header: `inline; filename="safe_name.pdf"`.
  6. Calls S3 provider `getViewUrl` with TTL from `document_view_url_ttl_seconds`.
  7. Emits detached audit log `document.viewed`.
  8. Returns pre-signed view URL.
* **Database Impact:** Inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ### Success — S3-Backed Document
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "view_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/c3b9b46e-789a-4c28-98e3-0d268a735cf1?response-content-disposition=inline%3B%20filename%3D%22aadhaar_card.pdf%22&response-content-type=application%2Fpdf&X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "expires_at": "2026-03-22T03:45:00.000Z",
      "file_name": "aadhaar_card.pdf",
      "content_type": "application/pdf"
    }
  }
  ```
  ### Success — Reference-Backed Document
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "view_url": "https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=...",
      "expires_at": null,
      "file_name": null,
      "content_type": null
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | View URL instructions |
  | `data.view_url` | String | No | Time-limited pre-signed S3 URL or external reference URL |
  | `data.expires_at` | String (ISO) | Yes | ISO timestamp when the view URL expires (`null` for external references) |
  | `data.file_name` | String | Yes | Sanitized filename |
  | `data.content_type` | String | Yes | Verified MIME type |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **503 Service Unavailable — Storage Unavailable:**
    ```json
    {
      "success": false,
      "message": "document storage is not available",
      "errorCode": "DOCUMENT_STORAGE_UNAVAILABLE"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`. Audit log `document.viewed` is emitted for every URL generation.
* **Idempotency and Retry Behavior:** Idempotent in state; successive calls issue fresh cryptographic URLs with new expiry timestamps.
* **Transactions/Concurrency Behavior:** S3 signature computed outside transaction; audit log written via detached helper.
* **Side Effects:** Emits `document.viewed` audit record.
* **Important Edge Cases:** URL expires automatically after the configured TTL (default 300 seconds).
* **Related APIs/Dependencies:** API #15 (Detail).
* **What the API Gives/Does:** Generates a secure, temporary pre-signed URL to view or download a document.

---

### 18. POST /api/v1/documents/hr/documents/:id/verify
* **API Name / Purpose:** Verify Document
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/verify`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR has reviewed an uploaded document and confirms its validity and authenticity.
* **Why the API Exists:** Provides the authoritative Tier C maker-checker verification transition.
* **Real-World Usage:** HR admin reviews the document preview in the verification queue and clicks "Approve & Verify".
* **Request JSON Payload:**
  ```json
  {
    "acknowledge_stale_recommendation": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `acknowledge_stale_recommendation` | Boolean | Optional | No | Explicit override if recommender no longer manages the employee | `true` or `false` | `false` |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID to verify |
* **Validation Rules:**
  - Document must currently be in `pending_verification` status (`DOCUMENT_NOT_PENDING_VERIFICATION`).
  - If `document_require_separate_checker = true` in organization settings, the approver (`actorId`) must differ from the proposer (`proposed_by`) (`SELF_APPROVAL_NOT_ALLOWED`).
  - If a manager recommended the document but that manager no longer manages the employee (due to org hierarchy changes), the request fails with `RECOMMENDATION_SCOPE_STALE` unless `acknowledge_stale_recommendation = true`.
* **Backend Processing Flow:**
  1. Validates `id` and body.
  2. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  3. Loads document row with `FOR UPDATE`.
  4. Asserts status is `pending_verification`.
  5. Enforces maker-checker separate checker rule if enabled.
  6. Evaluates recommender hierarchy scope. If stale and unacknowledged, throws 409.
  7. Determines target status: if document has reached expiration date (`expires_on < today`), sets `expired`; otherwise sets `available`.
  8. Updates row: `status = target`, `approved_by = actorId`, `actioned_at = NOW()`, `recommendation = 'none'`.
  9. Records audit log `document.verified`.
  10. Commits transaction and returns updated document.
* **Database Impact:** Updates `employee_documents`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Verified",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "PAN Card Image",
      "file_name": "pan_card.jpg",
      "content_type": "image/jpeg",
      "size_bytes": 524288,
      "checksum_sha256": "e3b0c44298fc1c149afbf4c8996fb924",
      "storage_backend": "s3",
      "document_number_last4": "1234",
      "reference_url": null,
      "status": "available",
      "scan_status": "not_scanned",
      "issued_on": "2021-01-01",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T03:40:00.000Z",
      "recommendation": "none",
      "recommended_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "recommended_at": "2026-03-22T03:42:00.000Z",
      "recommendation_note": "Verified against physical card",
      "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "actioned_at": "2026-03-22T03:50:00.000Z",
      "rejection_reason": null,
      "created_at": "2026-03-22T03:39:00.000Z",
      "updated_at": "2026-03-22T03:50:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Status message (`"Verified"`) |
  | `data` | Object | No | Updated document record |
  | `data.status` | String | No | Updated status (`'available'` or `'expired'`) |
  | `data.approved_by` | UUID | No | Actor ID who verified the document |
  | `data.actioned_at` | String (ISO) | No | Timestamp of verification |
  | *(all other fields)* | As defined in #11 | — | See API #11 for full field dictionary |
* **Exact Error Response Structures:**
  - **409 Conflict — Not Pending Verification:**
    ```json
    {
      "success": false,
      "message": "Document is not pending verification",
      "errorCode": "DOCUMENT_NOT_PENDING_VERIFICATION",
      "details": {
        "status": "available"
      }
    }
    ```
  - **409 Conflict — Self Approval Not Allowed:**
    ```json
    {
      "success": false,
      "message": "Separate checker required — approver must differ from proposer",
      "errorCode": "SELF_APPROVAL_NOT_ALLOWED"
    }
    ```
  - **409 Conflict — Recommender Scope Stale:**
    ```json
    {
      "success": false,
      "message": "The recommender no longer manages the subject",
      "errorCode": "RECOMMENDATION_SCOPE_STALE"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Non-idempotent; retry after verification returns `409 DOCUMENT_NOT_PENDING_VERIFICATION`.
* **Transactions/Concurrency Behavior:** Row locked with `FOR UPDATE` under `docgrp:{orgId}:{groupId}` advisory lock.
* **Side Effects:** Removes document from verification queue; enables document for active compliance.
* **Important Edge Cases:** If a verified document has an expired `expires_on` date, it transitions to `expired` rather than `available`.
* **Related APIs/Dependencies:** API #14 (Queue), API #19 (Reject).
* **What the API Gives/Does:** Formally approves and verifies an employee document.

---

### 19. POST /api/v1/documents/hr/documents/:id/reject
* **API Name / Purpose:** Reject Document
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/reject`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** The uploaded document is blurry, illegible, expired, or incorrect, and HR needs to reject it with a clear reason so the employee can re-upload.
* **Why the API Exists:** Provides formal rejection capability with mandatory reason logging.
* **Real-World Usage:** HR reviews a blurry document and clicks "Reject", entering "Blurry scan: name and photo not legible".
* **Request JSON Payload:**
  ```json
  {
    "reason": "Document image is blurred and unreadable. Please upload a clear color scan."
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `reason` | String | Required | No | Reason explaining why document was rejected | 10–500 characters | None |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID to reject |
* **Validation Rules:**
  - `reason` is strictly required and must be at least 10 characters long.
  - Document must currently be in `pending_verification` status (`DOCUMENT_NOT_PENDING_VERIFICATION`).
  - Separate checker rule enforced if enabled (`SELF_APPROVAL_NOT_ALLOWED`).
* **Backend Processing Flow:**
  1. Validates `id` and `reason`.
  2. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  3. Loads row with `FOR UPDATE`. Asserts status is `pending_verification`.
  4. Enforces separate checker rule if enabled.
  5. Updates document row: `status = 'rejected'`, `rejection_reason = reason.trim()`, `approved_by = actorId`, `actioned_at = NOW()`, `recommendation = 'none'`.
  6. Records audit log `document.rejected` with `reason`.
  7. Commits transaction and returns updated document.
* **Database Impact:** Updates `employee_documents`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Rejected",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "PAN Card Image",
      "file_name": "pan_card.jpg",
      "content_type": "image/jpeg",
      "size_bytes": 524288,
      "checksum_sha256": "e3b0c44298fc1c149afbf4c8996fb924",
      "storage_backend": "s3",
      "document_number_last4": "1234",
      "reference_url": null,
      "status": "rejected",
      "scan_status": "not_scanned",
      "issued_on": "2021-01-01",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T03:40:00.000Z",
      "recommendation": "none",
      "recommended_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "recommended_at": "2026-03-22T03:42:00.000Z",
      "recommendation_note": null,
      "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "actioned_at": "2026-03-22T03:52:00.000Z",
      "rejection_reason": "Document image is blurred and unreadable. Please upload a clear color scan.",
      "created_at": "2026-03-22T03:39:00.000Z",
      "updated_at": "2026-03-22T03:52:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Status message (`"Rejected"`) |
  | `data` | Object | No | Updated document record |
  | `data.status` | String | No | Rejected status (`'rejected'`) |
  | `data.rejection_reason`| String | No | Logged rejection explanation |
  | *(all other fields)* | As defined in #11 | — | See API #11 for full field dictionary |
* **Exact Error Response Structures:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"reason\" length must be at least 10 characters long",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
  - **409 Conflict — Not Pending Verification:**
    ```json
    {
      "success": false,
      "message": "Document is not pending verification",
      "errorCode": "DOCUMENT_NOT_PENDING_VERIFICATION",
      "details": {
        "status": "rejected"
      }
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Non-idempotent.
* **Transactions/Concurrency Behavior:** Row locked with `FOR UPDATE` under `docgrp:{orgId}:{groupId}` advisory lock.
* **Side Effects:** Removes document from verification queue; displays rejection reason to employee.
* **Important Edge Cases:** Rejected documents remain in the database for audit history; employees can upload a replacement via API #20 or #41.
* **Related APIs/Dependencies:** API #14 (Queue), API #18 (Verify).
* **What the API Gives/Does:** Rejects a document with an audit-logged reason.

---

### 20. POST /api/v1/documents/hr/documents/:id/replace
* **API Name / Purpose:** Issue HR Replace URL
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/replace`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A document has expired, been rejected, or needs an updated version, and HR needs to upload the new version while preserving the old version in history.
* **Why the API Exists:** Orchestrates atomic document version progression ($v \rightarrow v+1$) without prematurely overwriting the predecessor.
* **Real-World Usage:** Clicking "Replace / Upload New Version" on an employee's existing document.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
    "title": "Aadhaar Card Front & Back (2026 Re-issue)",
    "file_name": "aadhaar_2026.pdf",
    "content_type": "application/pdf",
    "size_bytes": 1048576,
    "issued_on": "2026-01-01",
    "expires_on": null,
    "document_number": "123456789012",
    "is_confidential": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | UUID | Required | No | Target document type ID | Must match predecessor's type | None |
  | `title` | String | Required | No | Document title | 3–200 characters | Predecessor title |
  | `file_name` | String | Required | No | Uploaded filename | 1–255 characters | None |
  | `content_type` | String | Required | No | MIME content type | Permitted MIME type | None |
  | `size_bytes` | Integer | Required | No | File size in bytes | 1 to 26214400 (25 MB) | None |
  | `issued_on` | String (Date) | Optional | Yes | Issue date | ISO date (`YYYY-MM-DD`) | `null` |
  | `expires_on` | String (Date) | Optional | Yes | Expiration date | ISO date (`YYYY-MM-DD`) | `null` |
  | `document_number`| String | Optional | Yes | Document reference number | 1–100 characters | Predecessor number |
  | `is_confidential`| Boolean | Optional | No | Confidentiality protection | `true` or `false` | Predecessor flag |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | ID of predecessor document being replaced |
* **Validation Rules:**
  - Predecessor document must be in a replaceable status (`'available'`, `'expired'`, or `'rejected'`) (`DOCUMENT_NOT_REPLACEABLE`). Documents currently `pending_upload` or `pending_verification` cannot be replaced.
  - If another replacement is already in progress on the same group and not stale, fails with `REPLACE_ALREADY_IN_PROGRESS`.
* **Backend Processing Flow:**
  1. Validates `id` and payload.
  2. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  3. Loads predecessor row with `FOR UPDATE` and asserts `isReplaceable(status)`.
  4. Inspects version chain for stale `pending_upload` replacements, purging any that exceeded TTL.
  5. Computes `version = predecessor.version + 1` and `supersedes_id = predecessor.id`.
  6. Creates new row in `employee_documents` in `pending_upload` status with same `document_group_id`.
  7. Generates pre-signed S3 PUT URL for new document ID.
  8. Emits audit log `document.replace_issued`.
  9. Commits transaction and returns upload parameters.
* **Database Impact:** Inserts 1 row in `employee_documents`, inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Replace URL issued",
    "data": {
      "document_id": "f8a7b6c5-d4e3-2f1a-0b9c-8d7e6f5a4b3c",
      "upload_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/f8a7b6c5-d4e3-2f1a-0b9c-8d7e6f5a4b3c?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "expires_at": "2026-03-22T04:00:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "1048576"
      },
      "supersedes_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 2
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Replace URL issued"`) |
  | `data` | Object | No | Pre-signed upload instructions for replacement |
  | `data.document_id` | UUID | No | ID of the new version document (to be confirmed via API #11) |
  | `data.upload_url` | String | No | Pre-signed AWS S3 cryptographic PUT URL |
  | `data.expires_at` | String (ISO) | No | ISO timestamp when upload URL expires |
  | `data.required_headers` | Object | No | Mandatory HTTP headers for S3 PUT |
  | `data.supersedes_id` | UUID | No | ID of the predecessor document |
  | `data.version` | Integer | No | Incremented version number ($v+1$) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Not Replaceable:**
    ```json
    {
      "success": false,
      "message": "Document cannot be replaced from its current status",
      "errorCode": "DOCUMENT_NOT_REPLACEABLE",
      "details": {
        "status": "pending_verification"
      }
    }
    ```
  - **409 Conflict — Replacement In Progress:**
    ```json
    {
      "success": false,
      "message": "A replacement is already in progress",
      "errorCode": "REPLACE_ALREADY_IN_PROGRESS",
      "details": {
        "existing_document_id": "d1e2f3a4-b5c6-7a8b-9c0d-1e2f3a4b5c6d"
      }
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Non-idempotent; retry creates new replacement row.
* **Transactions/Concurrency Behavior:** Transaction wrapped with group advisory lock `docgrp:{orgId}:{groupId}`.
* **Side Effects:** Reserves version $v+1$ slot. The predecessor remains live until the new version is confirmed via API #11.
* **Important Edge Cases:** Predecessor is NOT superseded immediately; it remains active until the replacement upload is successfully confirmed.
* **Related APIs/Dependencies:** API #11 (Confirm Upload), API #16 (Versions).
* **What the API Gives/Does:** Issues an S3 upload URL for a new version of an existing document.

---

### 21. DELETE /api/v1/documents/hr/documents/:id
* **API Name / Purpose:** Delete Document (HR)
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to permanently remove an uploaded document (e.g. uploaded by mistake, duplicate, or legally requested erasure).
* **Why the API Exists:** Provides administrative soft-deletion capability with audit trail preservation.
* **Real-World Usage:** Clicking "Delete Document" in the HR admin console.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID to delete |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  3. Pre-checks document status. If already deleted, returns `{ id, status: 'deleted' }` idempotently.
  4. Updates row: `status = 'deleted'`.
  5. Performs Sequelize paranoid soft-delete: sets `deleted_at = NOW()`.
  6. Emits audit log `document.deleted`.
  7. Commits transaction and returns deletion confirmation.
* **Database Impact:** Updates `employee_documents` (`status = 'deleted'`, `deleted_at = NOW()`), inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Document deleted",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "status": "deleted"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Document deleted"`) |
  | `data` | Object | No | Deletion confirmation |
  | `data.id` | UUID | No | ID of deleted document |
  | `data.status` | String | No | Status confirming deletion (`"deleted"`) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`. HR has administrative override and can delete documents regardless of statutory status.
* **Idempotency and Retry Behavior:** Fully idempotent; deleting an already-deleted document returns 200 OK.
* **Transactions/Concurrency Behavior:** Transaction wrapped with group advisory lock.
* **Side Effects:** Document disappears from all standard list and detail queries.
* **Important Edge Cases:** Binary in S3 is not purged synchronously; it is retained for compliance until purged by retention sweeping.
* **Related APIs/Dependencies:** API #13, API #15.
* **What the API Gives/Does:** Soft-deletes a document and stamps audit history.

---

### 22. GET /api/v1/documents/hr/documents/:id/audit-logs
* **API Name / Purpose:** View Document Audit Trail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/audit-logs`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR or compliance auditors need an immutable chronological audit trail of all actions taken on a document (upload, view, verify, reject, delete).
* **Why the API Exists:** Provides statutory and compliance auditability for sensitive employee documents.
* **Real-World Usage:** Clicking "Audit Trail" on a document to inspect who viewed or modified it and when.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Queries `document_audit_logs` where `org_id = :orgId`, `entity_type = 'employee_document'`, and `entity_id = :id`.
  3. Orders results by `created_at DESC` (newest events first).
  4. Returns array of audit log entries.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "7b8a9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "actor_id": "71639be3-1a97-4408-8bac-5b8039336755",
        "target_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "entity_type": "employee_document",
        "entity_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
        "action": "document.verified",
        "old_values": {
          "status": "pending_verification"
        },
        "new_values": {
          "status": "available"
        },
        "reason": null,
        "ip_address": "127.0.0.1",
        "request_id": "req-987654",
        "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
        "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "created_at": "2026-03-22T03:50:00.000Z"
      },
      {
        "id": "6a7b8c9d-0e1f-2a3b-4c5d-6e7f8a9b0c1d",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "actor_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "target_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "entity_type": "employee_document",
        "entity_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
        "action": "document.confirmed",
        "old_values": {
          "status": "pending_upload"
        },
        "new_values": {
          "status": "pending_verification",
          "version": 1
        },
        "reason": null,
        "ip_address": "127.0.0.1",
        "request_id": "req-123456",
        "proposed_by": null,
        "approved_by": null,
        "created_at": "2026-03-22T03:40:00.000Z"
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Array[Object] | No | Array of audit events |
  | `data[].id` | UUID | No | Unique audit log ID |
  | `data[].org_id` | UUID | No | Tenant organization ID |
  | `data[].actor_id` | UUID | Yes | User ID who performed the action |
  | `data[].target_user_id` | UUID | Yes | Employee ID whom the document belongs to |
  | `data[].entity_type` | String | No | Entity type (`'employee_document'`) |
  | `data[].entity_id` | UUID | Yes | Document identifier |
  | `data[].action` | String | No | Action key (`'document.upload_issued'`, `'document.confirmed'`, `'document.verified'`, `'document.viewed'`, `'document.rejected'`, `'document.deleted'`) |
  | `data[].old_values` | Object | Yes | State before the action |
  | `data[].new_values` | Object | Yes | State after the action |
  | `data[].reason` | String | Yes | Rejection reason or administrative note |
  | `data[].ip_address` | String | Yes | Client IP address of the caller |
  | `data[].request_id` | String | Yes | Request correlation ID |
  | `data[].proposed_by` | UUID | Yes | Maker / proposer user ID |
  | `data[].approved_by` | UUID | Yes | Checker / verifier user ID |
  | `data[].created_at` | String (ISO) | No | Timestamp of the event |
* **Exact Error Response Structures:**
  - **400 Bad Request — Invalid UUID:**
    ```json
    {
      "success": false,
      "message": "\"id\" must be a valid GUID",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array `[]` if no audit logs exist.
* **Related APIs/Dependencies:** API #15.
* **What the API Gives/Does:** Lists complete audit history for a document.

---

### 23. GET /api/v1/documents/hr/settings
* **API Name / Purpose:** Get Document Settings
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/settings`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to inspect tenant-level document configuration (TTL, max file size, separate checker, manager permissions).
* **Why the API Exists:** Provides access to the organization's document settings singleton.
* **Real-World Usage:** Loading the "Document Settings" tab in HR administration.
* **Request JSON Payload:** None.
* **Request Parameters:** None.
* **Backend Processing Flow:**
  1. Calls `settingsService.get(orgId)`.
  2. Uses `findOrCreate` against `document_settings` table to ensure a defaults row exists lazily without requiring seeders.
  3. Returns document settings row.
* **Database Impact:** Inserts default row if organization is accessing settings for the first time.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "manager_can_view_team_documents": true,
      "manager_direct_document_authority": false,
      "document_require_separate_checker": false,
      "document_view_url_ttl_seconds": 300,
      "document_upload_url_ttl_seconds": 600,
      "document_max_file_size_bytes": 10485760,
      "document_scan_required": false,
      "document_retention_days": 2555,
      "employee_can_delete_verified_documents": false,
      "document_default_verification_required": true,
      "updated_by": null,
      "created_at": "2026-03-01T00:00:00.000Z",
      "updated_at": "2026-03-01T00:00:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Organization document settings singleton |
  | `data.id` | UUID | No | Settings record identifier |
  | `data.org_id` | UUID | No | Tenant organization ID |
  | `data.manager_can_view_team_documents` | Boolean | No | Master switch allowing managers to view non-confidential team documents (default `true`) |
  | `data.manager_direct_document_authority`| Boolean | No | Allows managers to directly verify/reject without HR escalation (default `false`) |
  | `data.document_require_separate_checker`| Boolean | No | Enforces that approver cannot equal proposer (default `false`) |
  | `data.document_view_url_ttl_seconds` | Integer | No | Pre-signed view URL lifetime in seconds (default `300` = 5 min) |
  | `data.document_upload_url_ttl_seconds` | Integer | No | Pre-signed upload URL lifetime in seconds (default `600` = 10 min) |
  | `data.document_max_file_size_bytes` | Integer | No | Global maximum upload size cap in bytes (default `10485760` = 10 MB) |
  | `data.document_scan_required` | Boolean | No | Antivirus scan requirement (must be `false` in Phase 1) |
  | `data.document_retention_days` | Integer | No | Document retention period in days (default `2555` = 7 years) |
  | `data.employee_can_delete_verified_documents` | Boolean | No | Master switch allowing employees to delete verified documents (default `false`) |
  | `data.document_default_verification_required` | Boolean | No | Default verification flag for newly created types (default `true`) |
  | `data.updated_by` | UUID | Yes | ID of user who last modified settings |
  | `data.created_at` | String (ISO) | No | Record creation timestamp |
  | `data.updated_at` | String (ISO) | No | Last update timestamp |
* **Exact Error Response Structures:**
  - Standard 500s only.
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only (or `findOrCreate`).
* **Side Effects:** None.
* **Important Edge Cases:** Always returns a valid record; never 404s.
* **Related APIs/Dependencies:** API #24 (Update Settings).
* **What the API Gives/Does:** Fetches tenant organization document configuration settings.

---

### 24. PUT /api/v1/documents/hr/settings
* **API Name / Purpose:** Update Document Settings
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/documents/hr/settings`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to configure security policies, URL expiration times, file size limits, or maker-checker workflows.
* **Why the API Exists:** Provides administrative capability to update organization document policies with strict validation guardrails.
* **Real-World Usage:** HR changes the maximum file size to 20MB and enables separate checker workflow.
* **Request JSON Payload:**
  ```json
  {
    "manager_can_view_team_documents": true,
    "manager_direct_document_authority": false,
    "document_require_separate_checker": true,
    "document_view_url_ttl_seconds": 600,
    "document_upload_url_ttl_seconds": 900,
    "document_max_file_size_bytes": 20971520,
    "document_scan_required": false,
    "document_retention_days": 2555,
    "employee_can_delete_verified_documents": false,
    "document_default_verification_required": true
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `manager_can_view_team_documents` | Boolean | Optional | No | Manager team viewing switch | `true` or `false` | Unchanged |
  | `manager_direct_document_authority`| Boolean | Optional | No | Manager direct verification switch | `true` or `false` | Unchanged |
  | `document_require_separate_checker`| Boolean | Optional | No | Separate checker workflow switch | `true` or `false` | Unchanged |
  | `document_view_url_ttl_seconds` | Integer | Optional | No | View URL TTL in seconds | 30 to 900 seconds (15 min) | Unchanged |
  | `document_upload_url_ttl_seconds` | Integer | Optional | No | Upload URL TTL in seconds | 30 to 3600 seconds (1 hour) | Unchanged |
  | `document_max_file_size_bytes` | Integer | Optional | No | Global max file size | 1024 to 26214400 (25 MB) | Unchanged |
  | `document_scan_required` | Boolean | Optional | No | Antivirus scanning flag | Must be `false` in Phase 1 | Unchanged |
  | `document_retention_days` | Integer | Optional | No | Retention window in days | Integer $\ge 30$ | Unchanged |
  | `employee_can_delete_verified_documents` | Boolean | Optional | No | Employee verified delete permission | `true` or `false` | Unchanged |
  | `document_default_verification_required` | Boolean | Optional | No | Default verification flag | `true` or `false` | Unchanged |
* **Validation Rules:**
  - Must include at least 1 field to update.
  - **Guard 1 (Phase 1 restriction):** `document_scan_required` cannot be enabled in Phase 1 (`SCAN_PROVIDER_NOT_CONFIGURED`).
  - **Guard 2 (Sufficient checkers):** Enabling `document_require_separate_checker = true` requires at least 2 active HR users in the organization (`INSUFFICIENT_CHECKERS`).
  - **Guard 3 (Settings conflict):** `document_require_separate_checker` and `manager_direct_document_authority` cannot both be `true` at the same time (`SETTINGS_CONFLICT`).
* **Backend Processing Flow:**
  1. Validates payload via `updateSettingsSchema`.
  2. Begins database transaction. Loads current settings with `FOR UPDATE`.
  3. Evaluates prospective merged state against business guardrails (Guard 1, Guard 3, Guard 2).
  4. Updates `document_settings` row with `updated_by = actorId`.
  5. Records audit log `document_settings.updated` with `oldValues` and `newValues`.
  6. Commits transaction and returns updated settings object.
* **Database Impact:** Updates `document_settings`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Settings updated",
    "data": {
      "id": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "manager_can_view_team_documents": true,
      "manager_direct_document_authority": false,
      "document_require_separate_checker": true,
      "document_view_url_ttl_seconds": 600,
      "document_upload_url_ttl_seconds": 900,
      "document_max_file_size_bytes": 20971520,
      "document_scan_required": false,
      "document_retention_days": 2555,
      "employee_can_delete_verified_documents": false,
      "document_default_verification_required": true,
      "updated_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "created_at": "2026-03-01T00:00:00.000Z",
      "updated_at": "2026-03-22T04:10:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Settings updated"`) |
  | `data` | Object | No | Updated settings object (see API #23 for all field descriptions) |
* **Exact Error Response Structures:**
  - **409 Conflict — Scan Provider Not Configured:**
    ```json
    {
      "success": false,
      "message": "document scanning is not configured in this phase",
      "errorCode": "SCAN_PROVIDER_NOT_CONFIGURED"
    }
    ```
    *Trigger:* Setting `document_scan_required = true`.
  - **409 Conflict — Settings Conflict:**
    ```json
    {
      "success": false,
      "message": "document_require_separate_checker and manager_direct_document_authority cannot both be ON",
      "errorCode": "SETTINGS_CONFLICT",
      "details": {
        "fields": [
          "document_require_separate_checker",
          "manager_direct_document_authority"
        ]
      }
    }
    ```
    *Trigger:* Enabling both separate checker and manager direct authority.
  - **409 Conflict — Insufficient Checkers:**
    ```json
    {
      "success": false,
      "message": "at least two active HR users are required to enable separate-checker",
      "errorCode": "INSUFFICIENT_CHECKERS",
      "details": {
        "active_hr_count": 1
      }
    }
    ```
    *Trigger:* Attempting to enable `document_require_separate_checker` when the tenant has fewer than 2 active HR users.
  - **422 Unprocessable Entity — Setting Out of Range:**
    ```json
    {
      "success": false,
      "message": "document_view_url_ttl_seconds must be <= 900",
      "errorCode": "SETTING_OUT_OF_RANGE",
      "details": {
        "field": "document_view_url_ttl_seconds",
        "max": 900
      }
    }
    ```
* **Security/Authorization Behavior:** Role `hr`.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** Wrapped in atomic transaction with row lock `FOR UPDATE`.
* **Side Effects:** Updated settings apply immediately to subsequent upload and view operations.
* **Important Edge Cases:** If no changes are made, the current settings are returned safely.
* **Related APIs/Dependencies:** API #23 (Get Settings).
* **What the API Gives/Does:** Updates organizational document configuration policies.


## 3. Manager APIs — Team Documents

> [!NOTE]
> **Security & Scope Enforcement:** All Manager endpoints strictly require the `manager` (or `hr`) role and an active tenant context. Access is dynamically scoped to the manager's direct reports cohort via `getAccessibleUserIds(orgId, req.user)`.
>
> **Anti-Enumeration Posture:** Attempting to query, view, or confirm documents belonging to employees outside the manager's hierarchy, or documents flagged as confidential (`is_confidential = true`), returns `404 DOCUMENT_NOT_FOUND` rather than `403 FORBIDDEN` to prevent ID enumeration.

---

### 25. GET /api/v1/documents/manager/types
* **API Name / Purpose:** List Allowed Document Types (Manager)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/types`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager needs to know what document types they are permitted to view or request/upload for their direct reports.
* **Why the API Exists:** Filters organization document types according to manager visibility and request privileges.
* **Real-World Usage:** Populating the document type dropdown when a manager initiates an upload or sets up team filters.
* **Request JSON Payload:** None.
* **Request Parameters:** None.
* **Backend Processing Flow:**
  1. Checks organization settings: if `manager_can_view_team_documents = false`, returns empty array `[]` (per acceptance criteria #22; not an error).
  2. Queries active employee-plane `document_types` for the organization.
  3. Filters rows where `manager_can_view === true` OR `manager_can_request === true`.
  4. Projects clean dictionary: `id`, `code`, `name`, `plane`, `group`, `manager_can_view`, `manager_can_request`, `is_confidential`, `has_expiry`.
  5. Returns array of allowed types.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "code": "performance_review",
        "name": "Performance Review",
        "plane": "employee",
        "group": "employment_history",
        "manager_can_view": true,
        "manager_can_request": true,
        "is_confidential": false,
        "has_expiry": false
      },
      {
        "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "code": "pan_card",
        "name": "PAN Card",
        "plane": "employee",
        "group": "identity",
        "manager_can_view": true,
        "manager_can_request": false,
        "is_confidential": false,
        "has_expiry": false
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Array[Object] | No | Array of document types accessible to the manager |
  | `data[].id` | UUID | No | Document type identifier |
  | `data[].code` | String | No | Document type code |
  | `data[].name` | String | No | Display name |
  | `data[].plane` | String | No | Scope plane (`'employee'`) |
  | `data[].group` | String | No | Functional category group |
  | `data[].manager_can_view` | Boolean | No | Whether manager can view uploaded documents of this type |
  | `data[].manager_can_request` | Boolean | No | Whether manager can initiate uploads/requests of this type |
  | `data[].is_confidential` | Boolean | No | Confidentiality protection flag |
  | `data[].has_expiry` | Boolean | No | Whether this type tracks expiration |
* **Exact Error Response Structures:**
  - Standard 500s only.
* **Security/Authorization Behavior:** Role `manager` or `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** If `manager_can_view_team_documents` is disabled globally in Settings, returns an empty array `[]` (HTTP 200).
* **Related APIs/Dependencies:** API #26, API #31.
* **What the API Gives/Does:** Lists document types that managers have permission to interact with.

---

### 26. GET /api/v1/documents/manager/team/documents
* **API Name / Purpose:** List Team Documents
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/team/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A people manager needs an overview of all documents uploaded across their direct and indirect reporting hierarchy.
* **Why the API Exists:** Provides team-level document aggregation with hierarchy and confidentiality screening.
* **Real-World Usage:** Opening the "Team Documents" view in the Manager portal.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `user_id` | Query | UUID | Optional | None | Filter documents to a specific team member |
  | `type_id` | Query | UUID | Optional | None | Filter by document type ID |
  | `status` | Query | String | Optional | None | Filter by status: `'available'`, `'expired'`, or `'pending_verification'` |
  | `limit` | Query | Integer | Optional | `50` | Page limit (1–200) |
  | `offset` | Query | Integer | Optional | `0` | Page offset ($\ge 0$) |
* **Backend Processing Flow:**
  1. Validates query parameters.
  2. Checks settings: if `manager_can_view_team_documents = false`, returns `{ total: 0, rows: [] }`.
  3. Resolves accessible team member user IDs via `hierarchyAccess.getAccessibleUserIds`.
  4. If manager has no direct reports, returns `{ total: 0, rows: [] }`.
  5. If `user_id` query parameter is supplied, asserts that `user_id` is within the accessible direct report cohort; otherwise returns `403 FORBIDDEN`.
  6. Queries `employee_documents` scoped to accessible user IDs and manager-visible statuses (`available`, `expired`, `pending_verification`).
  7. Screens out confidential documents where `is_confidential = true`.
  8. Computes `display_status` and returns paginated result.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
          "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "version": 1,
          "supersedes_id": null,
          "allows_multiple": false,
          "title": "Performance Review 2025",
          "file_name": "review_2025.pdf",
          "content_type": "application/pdf",
          "size_bytes": 524288,
          "checksum_sha256": "e3b0c44298fc...",
          "storage_backend": "s3",
          "document_number_last4": null,
          "reference_url": null,
          "status": "available",
          "scan_status": "not_scanned",
          "issued_on": "2026-01-15",
          "expires_on": null,
          "is_confidential": false,
          "source": "manager_upload",
          "uploaded_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
          "confirmed_at": "2026-01-15T12:00:00.000Z",
          "recommendation": "none",
          "recommended_by": null,
          "recommended_at": null,
          "recommendation_note": null,
          "proposed_by": null,
          "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
          "actioned_at": "2026-01-15T14:00:00.000Z",
          "rejection_reason": null,
          "created_at": "2026-01-15T11:55:00.000Z",
          "updated_at": "2026-01-15T14:00:00.000Z",
          "display_status": "available"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Paginated team documents result |
  | `data.total` | Integer | No | Total count of documents matching criteria |
  | `data.rows` | Array[Object] | No | Array of document objects (see API #11 for item field definitions) |
* **Exact Error Response Structures:**
  - **403 Forbidden — Out of Hierarchy Scope:**
    ```json
    {
      "success": false,
      "message": "Forbidden",
      "errorCode": "FORBIDDEN"
    }
    ```
    *Trigger:* Passing a `user_id` query parameter for an employee who does not report to the caller.
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"status\" must be one of [available, expired, pending_verification]",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Scoped to `accessibleUserIds`. Confidential documents are completely screened out.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Documents with `status = 'pending_upload'`, `'rejected'`, or `'deleted'` are not visible to managers in this list.
* **Related APIs/Dependencies:** API #27, API #29.
* **What the API Gives/Does:** Lists documents for all team members reporting to the caller.

---

### 27. GET /api/v1/documents/manager/employees/:userId/documents
* **API Name / Purpose:** List Single Report's Documents
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/employees/:userId/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager is reviewing the file of a specific direct report.
* **Why the API Exists:** Provides direct report-specific document listing for managers.
* **Real-World Usage:** Clicking on a specific employee in the manager's team directory and viewing their documents.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `userId` | Path | UUID | Required | None | Direct report employee user ID |
  | `type_id` | Query | UUID | Optional | None | Filter by document type ID |
  | `status` | Query | String | Optional | None | Filter by status: `'available'`, `'expired'`, or `'pending_verification'` |
  | `limit` | Query | Integer | Optional | `50` | Page limit (1–200) |
  | `offset` | Query | Integer | Optional | `0` | Page offset ($\ge 0$) |
* **Backend Processing Flow:**
  1. Validates `userId` and query parameters.
  2. Checks settings: if `manager_can_view_team_documents = false`, throws 403 `FORBIDDEN`.
  3. Resolves accessible team member IDs. If `userId` is not in the list, throws 403 `FORBIDDEN`.
  4. Queries documents for `userId` matching filters.
  5. Filters rows to the manager-visible window (`available`, `expired`, `pending_verification`) and excludes confidential types.
  6. Returns `{ total, rows }`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
          "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "version": 1,
          "supersedes_id": null,
          "allows_multiple": false,
          "title": "Performance Review 2025",
          "file_name": "review_2025.pdf",
          "content_type": "application/pdf",
          "size_bytes": 524288,
          "checksum_sha256": "e3b0c44298fc...",
          "storage_backend": "s3",
          "document_number_last4": null,
          "reference_url": null,
          "status": "available",
          "scan_status": "not_scanned",
          "issued_on": "2026-01-15",
          "expires_on": null,
          "is_confidential": false,
          "source": "manager_upload",
          "uploaded_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
          "confirmed_at": "2026-01-15T12:00:00.000Z",
          "recommendation": "none",
          "recommended_by": null,
          "recommended_at": null,
          "recommendation_note": null,
          "proposed_by": null,
          "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
          "actioned_at": "2026-01-15T14:00:00.000Z",
          "rejection_reason": null,
          "created_at": "2026-01-15T11:55:00.000Z",
          "updated_at": "2026-01-15T14:00:00.000Z",
          "display_status": "available"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Paginated document response for the report |
  | `data.total` | Integer | No | Total count of documents matching criteria |
  | `data.rows` | Array[Object] | No | Array of document objects (see API #11 for item field definitions) |
* **Exact Error Response Structures:**
  - **403 Forbidden — Scope Restriction:**
    ```json
    {
      "success": false,
      "message": "Forbidden",
      "errorCode": "FORBIDDEN"
    }
    ```
    *Trigger:* `userId` does not report to the calling manager, or `manager_can_view_team_documents` is disabled.
* **Security/Authorization Behavior:** Role `manager` or `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Returns `{ total: 0, rows: [] }` if the employee has no visible documents.
* **Related APIs/Dependencies:** API #26, API #29.
* **What the API Gives/Does:** Lists documents for a single direct report.

---

### 28. GET /api/v1/documents/manager/documents/recommendations
* **API Name / Purpose:** Manager Recommendation Queue
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/documents/recommendations`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager needs to track all pending document recommendations they have submitted that are still awaiting final HR action.
* **Why the API Exists:** Provides an outstanding recommendations tracker for managers.
* **Real-World Usage:** Opening the "My Open Recommendations" section in the manager portal.
* **Request JSON Payload:** None.
* **Request Parameters:** None.
* **Backend Processing Flow:**
  1. Queries `employee_documents` where `org_id = :orgId`, `recommended_by = :actorId`, and `status = 'pending_verification'`.
  2. Orders results by `recommended_at DESC`.
  3. Projects standard list attributes.
  4. Returns `{ total, rows }`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
          "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "version": 1,
          "supersedes_id": null,
          "allows_multiple": false,
          "title": "Aadhaar Card Front & Back",
          "file_name": "aadhaar.pdf",
          "content_type": "application/pdf",
          "size_bytes": 1048576,
          "checksum_sha256": "d41d8cd98f00...",
          "storage_backend": "s3",
          "document_number_last4": "9012",
          "reference_url": null,
          "status": "pending_verification",
          "scan_status": "not_scanned",
          "issued_on": "2020-01-15",
          "expires_on": null,
          "is_confidential": false,
          "source": "self_upload",
          "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "confirmed_at": "2026-03-22T03:31:00.000Z",
          "recommendation": "verify",
          "recommended_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
          "recommended_at": "2026-03-22T03:42:00.000Z",
          "recommendation_note": "Verified against physical card presented during 1-on-1",
          "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
          "approved_by": null,
          "actioned_at": null,
          "rejection_reason": null,
          "created_at": "2026-03-22T03:30:00.000Z",
          "updated_at": "2026-03-22T03:42:00.000Z"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Paginated recommendations response |
  | `data.total` | Integer | No | Total count of open recommendations |
  | `data.rows` | Array[Object] | No | Array of document items pending HR verification where caller recommended action |
* **Exact Error Response Structures:**
  - Standard 500s only.
* **Security/Authorization Behavior:** Role `manager` or `hr`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Items automatically disappear from this list once HR approves (API #18) or rejects (API #19) them.
* **Related APIs/Dependencies:** API #33 (Recommend).
* **What the API Gives/Does:** Lists all documents where the calling manager has recorded a recommendation that is awaiting HR review.

---

### 29. GET /api/v1/documents/manager/documents/:id
* **API Name / Purpose:** Get Document Detail (Manager)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager needs to inspect the metadata of a document belonging to a direct report before recommending or verifying it.
* **Why the API Exists:** Provides single-document inspection with manager scope and confidentiality protection.
* **Real-World Usage:** Clicking on a document in the team list or recommendation queue.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Resolves accessible report user IDs via `hierarchyAccess.getAccessibleUserIds`.
  3. Executes `readService._screenAndAuthorise`:
     - Asserts document belongs to an accessible team member.
     - Asserts document is NOT confidential (`is_confidential = false`).
     - Asserts document type has `manager_can_view = true`.
     - If any check fails, returns 404 `DOCUMENT_NOT_FOUND` (anti-enumeration).
  4. Returns client-projected document object with `display_status`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "Aadhaar Card Front & Back",
      "file_name": "aadhaar.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00...",
      "storage_backend": "s3",
      "document_number_last4": "9012",
      "reference_url": null,
      "status": "pending_verification",
      "scan_status": "not_scanned",
      "issued_on": "2020-01-15",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T03:31:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "created_at": "2026-03-22T03:30:00.000Z",
      "updated_at": "2026-03-22T03:31:00.000Z",
      "display_status": "pending_verification"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Document details (see API #11 for item field definitions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found / Out of Scope:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    *Trigger:* Document does not exist, belongs to an employee outside the manager's hierarchy, is confidential, or is marked with `manager_can_view = false`.
* **Security/Authorization Behavior:** Role `manager` or `hr`. Returns 404 for out-of-scope/confidential to prevent ID enumeration.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Confidential documents cannot be viewed by managers under any circumstances.
* **Related APIs/Dependencies:** API #30 (View URL), API #33 (Recommend).
* **What the API Gives/Does:** Fetches document details for a direct report.

---

### 30. GET /api/v1/documents/manager/documents/:id/view-url
* **API Name / Purpose:** Issue View URL (Manager)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/documents/:id/view-url`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager needs to view or download a direct report's document file to verify its contents.
* **Why the API Exists:** Generates pre-signed S3 GET URLs for managers with hierarchy and confidentiality verification.
* **Real-World Usage:** Clicking "View File" on a team document in the manager portal.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | None | Document ID |
  | `disposition` | Query | String | Optional | `'inline'` | Presentation mode: `'inline'` or `'attachment'` |
* **Backend Processing Flow:**
  1. Validates `id` and `disposition`.
  2. Resolves accessible team member IDs.
  3. Executes `readService._screenAndAuthorise`: checks scope, asserts `!is_confidential`, asserts `manager_can_view = true`. Returns 404 if denied.
  4. Generates S3 GetObject pre-signed URL with TTL from `document_view_url_ttl_seconds`.
  5. Emits detached audit log `document.viewed`.
  6. Returns view URL.
* **Database Impact:** Inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "view_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/c3b9b46e-789a-4c28-98e3-0d268a735cf1?response-content-disposition=inline%3B%20filename%3D%22aadhaar.pdf%22&...",
      "expires_at": "2026-03-22T03:55:00.000Z",
      "file_name": "aadhaar.pdf",
      "content_type": "application/pdf"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Pre-signed view URL details |
  | `data.view_url` | String | No | Time-limited pre-signed S3 URL or external reference URL |
  | `data.expires_at` | String (ISO) | Yes | ISO timestamp when the URL expires |
  | `data.file_name` | String | Yes | Sanitized filename |
  | `data.content_type` | String | Yes | Verified MIME type |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found / Out of Scope:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **503 Service Unavailable — Storage Unavailable:**
    ```json
    {
      "success": false,
      "message": "document storage is not available",
      "errorCode": "DOCUMENT_STORAGE_UNAVAILABLE"
    }
    ```
* **Security/Authorization Behavior:** Role `manager` or `hr`. Audit log `document.viewed` emitted.
* **Idempotency and Retry Behavior:** Idempotent in state; successive calls issue fresh URLs.
* **Transactions/Concurrency Behavior:** S3 signature computed outside transaction; audit log detached.
* **Side Effects:** Emits `document.viewed` audit record.
* **Important Edge Cases:** URL expires automatically after configured TTL (default 300s).
* **Related APIs/Dependencies:** API #29.
* **What the API Gives/Does:** Generates a secure view URL for a team member's document.

---

### 31. POST /api/v1/documents/manager/employees/:userId/documents
* **API Name / Purpose:** Issue Manager Upload URL
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/employees/:userId/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager needs to upload an evaluation, PIP letter, or training certificate directly to a direct report's profile.
* **Why the API Exists:** Provides manager-initiated upload capability gated by hierarchy and `manager_can_request` policy.
* **Real-World Usage:** Manager uploads a signed annual performance appraisal for an employee.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
    "title": "Annual Performance Review 2025",
    "file_name": "performance_2025.pdf",
    "content_type": "application/pdf",
    "size_bytes": 1048576,
    "issued_on": "2026-01-15",
    "expires_on": null,
    "document_number": null,
    "is_confidential": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | UUID | Required | No | Target document type ID | Must have `manager_can_request = true` | None |
  | `title` | String | Required | No | Document title | 3–200 characters | None |
  | `file_name` | String | Required | No | Original filename | 1–255 characters | None |
  | `content_type` | String | Required | No | MIME content type | Allowed MIME types list | None |
  | `size_bytes` | Integer | Required | No | File size in bytes | 1 to 26214400 (25 MB) | None |
  | `issued_on` | String (Date) | Optional | Yes | Issue date | ISO date (`YYYY-MM-DD`) | `null` |
  | `expires_on` | String (Date) | Optional | Yes | Expiry date | ISO date (`YYYY-MM-DD`) | `null` |
  | `document_number`| String | Optional | Yes | Reference number | 1–100 characters; masked in DB | `null` |
  | `is_confidential`| Boolean | Optional | No | Confidentiality protection | `true` or `false` | Type default |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `userId` | Path | UUID | Required | Direct report employee user ID |
* **Validation Rules:**
  - `userId` must be an active direct report in the manager's hierarchy (`FORBIDDEN`).
  - Document type must have `manager_can_request = true` (`FORBIDDEN`).
  - Document type must be active and valid.
* **Backend Processing Flow:**
  1. Validates `userId` and request payload.
  2. Resolves accessible team member IDs. Asserts `userId` is in the list.
  3. Loads document type. Asserts `type.manager_can_request === true`.
  4. Calls `uploadService.issueUploadUrl` with `source = 'manager_upload'`, `subjectUserId = userId`, and `actorId = managerId`.
  5. Creates `employee_documents` row with `status = 'pending_upload'`.
  6. Generates pre-signed S3 PUT URL.
  7. Emits audit log `document.upload_issued`.
  8. Returns 201 Created with upload instructions.
* **Database Impact:** Inserts 1 row in `employee_documents`, inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Upload URL issued",
    "data": {
      "document_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "upload_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/c3b9b46e-789a-4c28-98e3-0d268a735cf1?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "expires_at": "2026-03-22T04:05:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "1048576"
      }
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Upload URL issued"`) |
  | `data` | Object | No | Pre-signed upload instructions |
  | `data.document_id` | UUID | No | Created document ID |
  | `data.upload_url` | String | No | Pre-signed AWS S3 cryptographic PUT URL |
  | `data.expires_at` | String (ISO) | No | URL expiration timestamp |
  | `data.required_headers` | Object | No | Mandatory headers for S3 PUT |
* **Exact Error Response Structures:**
  - **403 Forbidden — Out of Hierarchy Scope:**
    ```json
    {
      "success": false,
      "message": "Forbidden",
      "errorCode": "FORBIDDEN"
    }
    ```
    *Trigger:* Calling with a `userId` not reporting to the manager, or requesting a document type where `manager_can_request = false`.
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Role `manager` or `hr`.
* **Idempotency and Retry Behavior:** Non-idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with slot advisory lock.
* **Side Effects:** Reserves document row in `pending_upload` status.
* **Important Edge Cases:** Requires `manager_can_request = true` on the document type; otherwise fails with 403.
* **Related APIs/Dependencies:** API #32 (Confirm Upload).
* **What the API Gives/Does:** Issues an S3 upload URL for a manager to upload a file for a direct report.

---

### 32. POST /api/v1/documents/manager/documents/:id/confirm
* **API Name / Purpose:** Confirm Manager Upload
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/documents/:id/confirm`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** The manager frontend has finished uploading the file to S3 and needs the backend to verify the file and transition it to pending verification.
* **Why the API Exists:** Confirms manager-initiated uploads.
* **Real-World Usage:** Called by the frontend immediately after the manager's S3 PUT completes.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Resolves accessible team member IDs.
  3. Pre-loads document via `readService.detail` with `audience: 'manager'`. Asserts document is in the manager's hierarchy. Throws 404 if not found or out of scope.
  4. Calls `uploadService.confirmUpload`.
  5. S3 HeadObject check verifies file existence, content type, and size.
  6. Updates status to `pending_verification`, `available`, or `expired`.
  7. Returns finalized document object.
* **Database Impact:** Updates `employee_documents`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "Annual Performance Review 2025",
      "file_name": "performance_2025.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00...",
      "storage_backend": "s3",
      "document_number_last4": null,
      "reference_url": null,
      "status": "pending_verification",
      "scan_status": "not_scanned",
      "issued_on": "2026-01-15",
      "expires_on": null,
      "is_confidential": false,
      "source": "manager_upload",
      "uploaded_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "confirmed_at": "2026-03-22T04:06:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "created_at": "2026-03-22T04:05:00.000Z",
      "updated_at": "2026-03-22T04:06:00.000Z",
      "display_status": "pending_verification"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Confirmed document record (see API #11 for field descriptions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found / Out of Scope:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **422 Unprocessable Entity — Verification Failed:**
    ```json
    {
      "success": false,
      "message": "Uploaded object failed verification",
      "errorCode": "DOCUMENT_VERIFICATION_FAILED"
    }
    ```
* **Security/Authorization Behavior:** Role `manager` or `hr`.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** S3 HeadObject executed outside transaction; row update executed under `docgrp:{orgId}:{groupId}` lock.
* **Side Effects:** Promotes document to verification queue or active status.
* **Important Edge Cases:** None.
* **Related APIs/Dependencies:** API #31.
* **What the API Gives/Does:** Verifies the manager's uploaded S3 file and marks the document confirmed.

---

### 33. POST /api/v1/documents/manager/documents/:id/recommend
* **API Name / Purpose:** Manager Tier-B Recommendation
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/documents/:id/recommend`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** People managers conduct the first line of document verification (e.g. checking physical certificates presented in 1-on-1s) and record their recommendation for HR, or directly approve if delegated authority.
* **Why the API Exists:** Powers Tier B in the two-tier document verification workflow.
* **Real-World Usage:** Manager inspects an employee's degree certificate and clicks "Recommend Verification", adding note "Inspected original degree parchment".
* **Request JSON Payload:**
  ```json
  {
    "recommendation": "verify",
    "note": "Inspected original certificate parchment in person. Details match perfectly."
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `recommendation` | String | Required | No | Recommended decision | Exactly `'verify'` or `'reject'` | None |
  | `note` | String | Optional | Yes | Manager's comment/note for HR | Max 500 characters | `null` |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Validation Rules:**
  - `recommendation` must be `'verify'` or `'reject'`.
  - Calling user must have active management authority over the document's subject (`DOCUMENT_NOT_FOUND` if out of scope).
  - HR users must use the HR verify/reject endpoints (#18/#19) instead of this manager recommendation route (`MANAGER_ROUTE_FOR_MANAGERS`).
  - Document must currently be in `pending_verification` status (`DOCUMENT_NOT_PENDING_VERIFICATION`).
* **Backend Processing Flow:**
  1. Validates `id` and request payload.
  2. Resolves accessible team member IDs.
  3. If caller is HR (`ids === null`), throws `409 MANAGER_ROUTE_FOR_MANAGERS`.
  4. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  5. Asserts document belongs to direct report and is in `pending_verification` status.
  6. Checks organization settings:
     - **Path A — `manager_direct_document_authority = true`:**
       - If `recommendation === 'verify'`: sets `status = 'available'` (or `'expired'`), `approved_by = managerId`, `actioned_at = NOW()`, `recommendation = 'none'`. Emits `document.verified`.
       - If `recommendation === 'reject'`: sets `status = 'rejected'`, `rejection_reason = note`, `approved_by = managerId`, `actioned_at = NOW()`. Emits `document.rejected`.
     - **Path B — `manager_direct_document_authority = false` (Standard Tier B):**
       - Updates row: `recommendation = payload.recommendation`, `recommended_by = managerId`, `recommended_at = NOW()`, `recommendation_note = note`.
       - Emits audit log `document.recommended`.
  7. Commits transaction and returns updated document.
* **Database Impact:** Updates `employee_documents`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ### Success — Standard Tier-B Recommendation (HR Decides)
  ```json
  {
    "success": true,
    "message": "Recommendation recorded",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "Degree Certificate",
      "file_name": "degree.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00...",
      "storage_backend": "s3",
      "document_number_last4": null,
      "reference_url": null,
      "status": "pending_verification",
      "scan_status": "not_scanned",
      "issued_on": "2019-06-01",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T03:31:00.000Z",
      "recommendation": "verify",
      "recommended_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "recommended_at": "2026-03-22T04:10:00.000Z",
      "recommendation_note": "Inspected original certificate parchment in person. Details match perfectly.",
      "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "created_at": "2026-03-22T03:30:00.000Z",
      "updated_at": "2026-03-22T04:10:00.000Z"
    }
  }
  ```
  ### Success — Delegated Direct Authority (Manager Verifies Immediately)
  ```json
  {
    "success": true,
    "message": "Recommendation recorded",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "Degree Certificate",
      "file_name": "degree.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00...",
      "storage_backend": "s3",
      "document_number_last4": null,
      "reference_url": null,
      "status": "available",
      "scan_status": "not_scanned",
      "issued_on": "2019-06-01",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T03:31:00.000Z",
      "recommendation": "none",
      "recommended_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "recommended_at": "2026-03-22T04:10:00.000Z",
      "recommendation_note": "Inspected original certificate parchment in person. Details match perfectly.",
      "proposed_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "approved_by": "82740cf4-2b08-410e-8c3d-6b815321de56",
      "actioned_at": "2026-03-22T04:10:00.000Z",
      "rejection_reason": null,
      "created_at": "2026-03-22T03:30:00.000Z",
      "updated_at": "2026-03-22T04:10:00.000Z"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Recommendation recorded"`) |
  | `data` | Object | No | Document record with recorded recommendation or direct verification |
  | `data.recommendation` | String | No | Recommended decision: `'verify'`, `'reject'`, or `'none'` (if direct authority applied) |
  | `data.recommended_by` | UUID | Yes | Manager user ID |
  | `data.recommended_at` | String (ISO) | Yes | Recommendation timestamp |
  | `data.recommendation_note` | String | Yes | Manager's comment |
  | `data.status` | String | No | Remains `'pending_verification'` in standard workflow; transitions to `'available'`/`'rejected'` under direct authority |
  | *(all other fields)* | As defined in #11 | — | See API #11 for full field dictionary |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found / Out of Scope:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Not Pending Verification:**
    ```json
    {
      "success": false,
      "message": "Document is not pending verification",
      "errorCode": "DOCUMENT_NOT_PENDING_VERIFICATION",
      "details": {
        "status": "available"
      }
    }
    ```
  - **409 Conflict — HR Touching Manager Route:**
    ```json
    {
      "success": false,
      "message": "Use the HR verify/reject endpoints",
      "errorCode": "MANAGER_ROUTE_FOR_MANAGERS"
    }
    ```
    *Trigger:* HR user attempting to call manager recommendation endpoint instead of API #18/#19.
  - **409 Conflict — Settings Conflict:**
    ```json
    {
      "success": false,
      "message": "Direct authority and separate-checker conflict",
      "errorCode": "SETTINGS_CONFLICT"
    }
    ```
* **Security/Authorization Behavior:** Scoped to direct report cohort. HR prevented from acting as manager.
* **Idempotency and Retry Behavior:** Non-idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with group advisory lock.
* **Side Effects:** Updates recommendation fields on document for HR inbox, or applies final decision if direct authority enabled.
* **Important Edge Cases:** If direct authority is enabled, this acts as final verification without requiring HR action.
* **Related APIs/Dependencies:** API #14, API #18.
* **What the API Gives/Does:** Records a manager's recommendation or directly verifies a direct report's document.


## 4. Self APIs — Employee Self-Service

> [!NOTE]
> **Strict Identity Context:** All endpoints under `/me/documents` operate strictly on `req.user.id` extracted from the verified JWT. Employees cannot specify a `userId` in the path or body, ensuring zero cross-tenant or cross-employee privilege escalation.

---

### 34. GET /api/v1/documents/me/documents/types
* **API Name / Purpose:** List My Allowed Document Types
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/documents/types`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employees need to know which documents they are required or permitted to upload (e.g. PAN, Aadhaar, Education Certificates), along with size caps and allowed file formats.
* **Why the API Exists:** Provides a tailored list of uploadable document types overlaying effective organization policies.
* **Real-World Usage:** Populating the "Select Document Type" selector in the employee self-service portal.
* **Request JSON Payload:** None.
* **Request Parameters:** None.
* **Backend Processing Flow:**
  1. Queries active `document_types` on the employee plane (`plane = 'employee'`, `is_active = true`).
  2. Filters rows where `employee_can_upload === true`.
  3. Loads organization settings and calls `resolveEffectivePolicy(type, settings)` to resolve effective caps (`maxFileSizeBytes`, `allowedContentTypes`, `requiresVerification`).
  4. Returns sanitized list of uploadable types.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "code": "pan_card",
        "name": "PAN Card",
        "plane": "employee",
        "group": "identity",
        "description": "Permanent Account Number issued by the Income Tax Department",
        "is_confidential": false,
        "has_expiry": false,
        "allows_multiple": false,
        "allowed_content_types": [
          "application/pdf",
          "image/jpeg",
          "image/png"
        ],
        "max_file_size_bytes": 10485760,
        "requires_verification": true
      },
      {
        "id": "5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
        "code": "degree_certificate",
        "name": "Degree / Graduation Certificate",
        "plane": "employee",
        "group": "education",
        "description": "Highest educational qualification degree certificate",
        "is_confidential": false,
        "has_expiry": false,
        "allows_multiple": true,
        "allowed_content_types": [
          "application/pdf"
        ],
        "max_file_size_bytes": 10485760,
        "requires_verification": true
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Array[Object] | No | Array of document types the employee can upload |
  | `data[].id` | UUID | No | Document type identifier |
  | `data[].code` | String | No | Document type code |
  | `data[].name` | String | No | Display name |
  | `data[].plane` | String | No | Scope plane (`'employee'`) |
  | `data[].group` | String | No | Category group |
  | `data[].description` | String | Yes | Instructions or guidelines for employee |
  | `data[].is_confidential` | Boolean | No | Confidentiality status |
  | `data[].has_expiry` | Boolean | No | Indicates whether an expiry date must be provided on upload |
  | `data[].allows_multiple` | Boolean | No | Whether multiple active copies can be uploaded |
  | `data[].allowed_content_types` | Array[String] | No | Permitted MIME types for this document type |
  | `data[].max_file_size_bytes` | Integer | No | Effective file size cap in bytes |
  | `data[].requires_verification` | Boolean | No | Whether uploaded document requires verification before becoming active |
* **Exact Error Response Structures:**
  - Standard 500s only.
* **Security/Authorization Behavior:** Any authenticated tenant user.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Returns empty array `[]` if no document types have `employee_can_upload = true`.
* **Related APIs/Dependencies:** API #36 (Issue My Upload URL).
* **What the API Gives/Does:** Lists all document types that the logged-in employee is permitted to upload.

---

### 35. GET /api/v1/documents/me/documents
* **API Name / Purpose:** List My Documents
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee needs to view their personal document repository, tracking which documents are verified, pending, expiring, or rejected.
* **Why the API Exists:** Provides personal document history for the logged-in employee.
* **Real-World Usage:** Loading the "My Documents" section in employee self-service.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `type_id` | Query | UUID | Optional | None | Filter by document type ID |
  | `status` | Query | String | Optional | None | Filter by status (`available`, `pending_verification`, `rejected`, etc.) |
  | `group_id` | Query | UUID | Optional | None | Filter by document group ID |
  | `limit` | Query | Integer | Optional | `50` | Page limit (1–200) |
  | `offset` | Query | Integer | Optional | `0` | Page offset ($\ge 0$) |
* **Backend Processing Flow:**
  1. Validates query parameters.
  2. Queries `employee_documents` scoped strictly to `org_id` and `user_id = req.user.id`.
  3. Includes `pending_upload` items so the employee sees uploads that were started.
  4. Projects clean list attributes, excluding `storage_key` and unmasked `document_number`.
  5. Computes `display_status` for each item.
  6. Returns `{ total, rows }`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
          "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
          "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
          "version": 1,
          "supersedes_id": null,
          "allows_multiple": false,
          "title": "My PAN Card",
          "file_name": "my_pan.pdf",
          "content_type": "application/pdf",
          "size_bytes": 524288,
          "checksum_sha256": "e3b0c44298fc...",
          "storage_backend": "s3",
          "document_number_last4": "1234",
          "reference_url": null,
          "status": "available",
          "scan_status": "not_scanned",
          "issued_on": "2021-05-10",
          "expires_on": null,
          "is_confidential": false,
          "source": "self_upload",
          "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "confirmed_at": "2026-03-22T03:40:00.000Z",
          "recommendation": "none",
          "recommended_by": null,
          "recommended_at": null,
          "recommendation_note": null,
          "proposed_by": null,
          "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
          "actioned_at": "2026-03-22T03:50:00.000Z",
          "rejection_reason": null,
          "created_at": "2026-03-22T03:39:00.000Z",
          "updated_at": "2026-03-22T03:50:00.000Z",
          "display_status": "available"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Paginated personal document list |
  | `data.total` | Integer | No | Total count of documents belonging to caller |
  | `data.rows` | Array[Object] | No | Array of document objects (see API #11 for item field definitions) |
* **Exact Error Response Structures:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"limit\" must be less than or equal to 200",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
* **Security/Authorization Behavior:** Iron-clad tenant and user scoping to `req.user.id`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Returns `{ total: 0, rows: [] }` if employee has no documents.
* **Related APIs/Dependencies:** API #36 (Upload), API #38 (Detail).
* **What the API Gives/Does:** Lists all documents belonging to the authenticated employee.

---

### 36. POST /api/v1/documents/me/documents
* **API Name / Purpose:** Issue My Upload URL
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/me/documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee needs to upload a required statutory or company document from their personal computer or phone.
* **Why the API Exists:** Provides secure, direct S3 upload URLs for employee self-service.
* **Real-World Usage:** Employee selects "PAN Card" in the portal, enters document number, and selects a PDF file to upload.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
    "title": "My PAN Card",
    "file_name": "my_pan.pdf",
    "content_type": "application/pdf",
    "size_bytes": 524288,
    "issued_on": "2021-05-10",
    "expires_on": null,
    "document_number": "ABCDE1234F",
    "is_confidential": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | UUID | Required | No | Target document type ID | Must have `employee_can_upload = true` | None |
  | `title` | String | Required | No | Document title | 3–200 characters | None |
  | `file_name` | String | Required | No | Uploaded filename | 1–255 characters | None |
  | `content_type` | String | Required | No | MIME content type | Permitted MIME type | None |
  | `size_bytes` | Integer | Required | No | File size in bytes | 1 to 26214400 (25 MB) | None |
  | `issued_on` | String (Date) | Optional | Yes | Issue date | ISO date (`YYYY-MM-DD`) | `null` |
  | `expires_on` | String (Date) | Optional | Yes | Expiry date | ISO date (`YYYY-MM-DD`); required if `has_expiry=true` | `null` |
  | `document_number`| String | Optional | Yes | Unique identifier (PAN, Aadhaar, Passport) | 1–100 characters; masked in DB | `null` |
  | `is_confidential`| Boolean | Optional | No | Confidentiality protection | `true` or `false` | Type default |
* **Request Parameters:** None.
* **Validation Rules:**
  - `document_type_id` must have `employee_can_upload = true` and `is_active = true` (`FORBIDDEN` / `DOCUMENT_TYPE_INACTIVE`).
  - `content_type` must be permitted by the document type (`DOCUMENT_CONTENT_TYPE_NOT_ALLOWED`).
  - `size_bytes` must be within effective size limit (`DOCUMENT_TOO_LARGE`).
  - If `has_expiry = true`, `expires_on` is mandatory (`DOCUMENT_EXPIRY_REQUIRED`).
  - For single-instance types (`allows_multiple = false`), a live document cannot already exist (`DOCUMENT_ALREADY_EXISTS`).
* **Backend Processing Flow:**
  1. Validates payload via `issueUploadUrlSchema`.
  2. Verifies document type exists, is active, and permits employee upload.
  3. Begins database transaction and acquires slot advisory lock `docslot:{orgId}:{actorId}:{typeId}`.
  4. Checks for existing live document. Reaps stale `pending_upload` if abandoned past TTL.
  5. Generates `documentId` and deterministic S3 key.
  6. Creates row in `employee_documents` with `status = 'pending_upload'` and `source = 'self_upload'`.
  7. Generates pre-signed S3 PUT URL with TTL from settings.
  8. Emits audit log `document.upload_issued`.
  9. Commits transaction and returns upload parameters.
* **Database Impact:** Inserts 1 row in `employee_documents`, inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Upload URL issued",
    "data": {
      "document_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "upload_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/c3b9b46e-789a-4c28-98e3-0d268a735cf1?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "expires_at": "2026-03-22T04:15:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "524288"
      }
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Upload URL issued"`) |
  | `data` | Object | No | Pre-signed upload parameters |
  | `data.document_id` | UUID | No | Document ID to confirm after S3 upload |
  | `data.upload_url` | String | No | Pre-signed AWS S3 cryptographic PUT URL |
  | `data.expires_at` | String (ISO) | No | URL expiration timestamp |
  | `data.required_headers` | Object | No | Mandatory headers to send in PUT to S3 |
* **Exact Error Response Structures:**
  - **403 Forbidden — Self Upload Not Allowed:**
    ```json
    {
      "success": false,
      "message": "Forbidden",
      "errorCode": "FORBIDDEN"
    }
    ```
    *Trigger:* Type has `employee_can_upload = false`.
  - **409 Conflict — Document Already Exists:**
    ```json
    {
      "success": false,
      "message": "A live document of this type already exists — use replace instead",
      "errorCode": "DOCUMENT_ALREADY_EXISTS",
      "details": {
        "existing_document_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "status": "available"
      }
    }
    ```
  - **422 Unprocessable Entity — Content Type Not Allowed:**
    ```json
    {
      "success": false,
      "message": "content_type is not allowed for this document type",
      "errorCode": "DOCUMENT_CONTENT_TYPE_NOT_ALLOWED",
      "details": {
        "allowed": [
          "application/pdf"
        ]
      }
    }
    ```
  - **422 Unprocessable Entity — Expiry Required:**
    ```json
    {
      "success": false,
      "message": "expires_on is required for this document type",
      "errorCode": "DOCUMENT_EXPIRY_REQUIRED"
    }
    ```
* **Security/Authorization Behavior:** Any authenticated tenant user acting on their own profile.
* **Idempotency and Retry Behavior:** Non-idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with slot advisory lock `docslot:{orgId}:{actorId}:{typeId}`.
* **Side Effects:** Reserves document row in `pending_upload` status.
* **Important Edge Cases:** Reaps stale uploads automatically if past TTL.
* **Related APIs/Dependencies:** API #37 (Confirm Upload).
* **What the API Gives/Does:** Issues an S3 upload URL for an employee to upload their personal document.

---

### 37. POST /api/v1/documents/me/documents/:id/confirm
* **API Name / Purpose:** Confirm My Upload
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/me/documents/:id/confirm`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** The employee's browser has completed the S3 PUT upload and notifies the backend to verify the file and advance its state.
* **Why the API Exists:** Closes the asynchronous S3 upload loop for self-service uploads.
* **Real-World Usage:** Called automatically by the frontend after a successful S3 upload.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Pre-loads document. Asserts caller owns the document (`user_id === actorId`). Throws 404 if not found or not owned.
  3. If already confirmed, idempotently returns current detail.
  4. S3 HeadObject check verifies file existence, size, and MIME type.
  5. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  6. Evaluates target status: `pending_verification`, `available`, or `expired`.
  7. Updates row: `status = targetStatus`, `confirmed_at = NOW()`, `checksum_sha256 = etag`.
  8. Emits audit log `document.confirmed`.
  9. Commits transaction and returns finalized document object.
* **Database Impact:** Updates `employee_documents`, inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "My PAN Card",
      "file_name": "my_pan.pdf",
      "content_type": "application/pdf",
      "size_bytes": 524288,
      "checksum_sha256": "e3b0c44298fc...",
      "storage_backend": "s3",
      "document_number_last4": "1234",
      "reference_url": null,
      "status": "pending_verification",
      "scan_status": "not_scanned",
      "issued_on": "2021-05-10",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T04:16:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "created_at": "2026-03-22T04:15:00.000Z",
      "updated_at": "2026-03-22T04:16:00.000Z",
      "display_status": "pending_verification"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Confirmed document record (see API #11 for field descriptions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    *Trigger:* ID does not exist or does not belong to the logged-in employee.
  - **422 Unprocessable Entity — Verification Failed:**
    ```json
    {
      "success": false,
      "message": "Uploaded object failed verification",
      "errorCode": "DOCUMENT_VERIFICATION_FAILED"
    }
    ```
* **Security/Authorization Behavior:** Strict ownership check (`user_id === actorId`).
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** HeadObject outside transaction; update inside transaction under `docgrp:{orgId}:{groupId}` lock.
* **Side Effects:** Moves document into verification queue or active status.
* **Important Edge Cases:** None.
* **Related APIs/Dependencies:** API #36 (Upload URL).
* **What the API Gives/Does:** Verifies the employee's S3 upload and confirms the document.

---

### 38. GET /api/v1/documents/me/documents/:id
* **API Name / Purpose:** Get My Document Detail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee needs to view detailed metadata, verification status, or rejection reasons for a specific document they own.
* **Why the API Exists:** Provides single-document detail for employee self-service.
* **Real-World Usage:** Clicking on a document in the "My Documents" list.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Executes `readService.detail` with `audience = 'self'`.
  3. Asserts caller owns the document (`user_id === actorId`).
  4. Returns client-projected document object with `display_status`.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
      "document_group_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 1,
      "supersedes_id": null,
      "allows_multiple": false,
      "title": "My PAN Card",
      "file_name": "my_pan.pdf",
      "content_type": "application/pdf",
      "size_bytes": 524288,
      "checksum_sha256": "e3b0c44298fc...",
      "storage_backend": "s3",
      "document_number_last4": "1234",
      "reference_url": null,
      "status": "available",
      "scan_status": "not_scanned",
      "issued_on": "2021-05-10",
      "expires_on": null,
      "is_confidential": false,
      "source": "self_upload",
      "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
      "confirmed_at": "2026-03-22T03:40:00.000Z",
      "recommendation": "none",
      "recommended_by": null,
      "recommended_at": null,
      "recommendation_note": null,
      "proposed_by": null,
      "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
      "actioned_at": "2026-03-22T03:50:00.000Z",
      "rejection_reason": null,
      "created_at": "2026-03-22T03:39:00.000Z",
      "updated_at": "2026-03-22T03:50:00.000Z",
      "display_status": "available"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | Personal document details (see API #11 for item field definitions) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    *Trigger:* Document does not exist or belongs to another user.
* **Security/Authorization Behavior:** Strictly scoped to `req.user.id`.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** Full `document_number` and `storage_key` are never returned.
* **Related APIs/Dependencies:** API #39 (Versions), API #40 (View URL).
* **What the API Gives/Does:** Retrieves detailed metadata for a personal document.

---

### 39. GET /api/v1/documents/me/documents/:id/versions
* **API Name / Purpose:** Get My Document Versions
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/documents/:id/versions`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee needs to see previous revisions of an updated document.
* **Why the API Exists:** Provides personal version history.
* **Real-World Usage:** Employee checks the history of their uploaded Passport or PAN card.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Any document ID in the version group |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Asserts document belongs to caller (`user_id === actorId`). Throws 404 if not.
  3. Queries `employee_documents` where `document_group_id = row.document_group_id` ordered by `version ASC`.
  4. Returns array of client-projected versions.
* **Database Impact:** Read-only.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "document_group_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "version": 1,
        "supersedes_id": null,
        "allows_multiple": false,
        "title": "My PAN Card (v1)",
        "file_name": "pan_old.pdf",
        "content_type": "application/pdf",
        "size_bytes": 512000,
        "checksum_sha256": "a1b2c3d4...",
        "storage_backend": "s3",
        "document_number_last4": "1234",
        "reference_url": null,
        "status": "superseded",
        "scan_status": "not_scanned",
        "issued_on": "2020-01-01",
        "expires_on": null,
        "is_confidential": false,
        "source": "self_upload",
        "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "confirmed_at": "2026-01-10T10:00:00.000Z",
        "recommendation": "none",
        "recommended_by": null,
        "recommended_at": null,
        "recommendation_note": null,
        "proposed_by": null,
        "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "actioned_at": "2026-01-10T11:00:00.000Z",
        "rejection_reason": null,
        "created_at": "2026-01-10T09:50:00.000Z",
        "updated_at": "2026-03-22T03:30:00.000Z",
        "display_status": "superseded"
      },
      {
        "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
        "document_group_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "version": 2,
        "supersedes_id": "e2a8b34c-1234-4b56-7890-123456789abc",
        "allows_multiple": false,
        "title": "My PAN Card (v2)",
        "file_name": "my_pan.pdf",
        "content_type": "application/pdf",
        "size_bytes": 524288,
        "checksum_sha256": "e3b0c442...",
        "storage_backend": "s3",
        "document_number_last4": "1234",
        "reference_url": null,
        "status": "available",
        "scan_status": "not_scanned",
        "issued_on": "2021-05-10",
        "expires_on": null,
        "is_confidential": false,
        "source": "self_upload",
        "uploaded_by": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "confirmed_at": "2026-03-22T03:40:00.000Z",
        "recommendation": "none",
        "recommended_by": null,
        "recommended_at": null,
        "recommendation_note": null,
        "proposed_by": null,
        "approved_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "actioned_at": "2026-03-22T03:50:00.000Z",
        "rejection_reason": null,
        "created_at": "2026-03-22T03:39:00.000Z",
        "updated_at": "2026-03-22T03:50:00.000Z",
        "display_status": "available"
      }
    ]
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Array[Object] | No | Chronological list of revisions for this document group |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
* **Security/Authorization Behavior:** Scoped to caller's documents.
* **Idempotency and Retry Behavior:** Safe and idempotent.
* **Transactions/Concurrency Behavior:** Read-only.
* **Side Effects:** None.
* **Important Edge Cases:** None.
* **Related APIs/Dependencies:** API #38, API #41.
* **What the API Gives/Does:** Lists all versions of a personal document.

---

### 40. GET /api/v1/documents/me/documents/:id/view-url
* **API Name / Purpose:** Issue My View URL
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/documents/:id/view-url`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee needs to view or download a document they previously uploaded.
* **Why the API Exists:** Generates pre-signed S3 GET URLs for personal documents.
* **Real-World Usage:** Clicking "Download" or "View" next to a document in "My Documents".
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | None | Document ID |
  | `disposition` | Query | String | Optional | `'inline'` | Presentation mode: `'inline'` or `'attachment'` |
* **Backend Processing Flow:**
  1. Validates `id` and `disposition`.
  2. Executes `readService.detail` with `audience: 'self'`. Asserts `user_id === actorId`.
  3. Verifies that document type has `employee_can_view = true`. If false, denies.
  4. Generates pre-signed S3 GET URL with TTL from `document_view_url_ttl_seconds`.
  5. Emits detached audit log `document.viewed`.
  6. Returns view URL.
* **Database Impact:** Inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "view_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/c3b9b46e-789a-4c28-98e3-0d268a735cf1?response-content-disposition=inline%3B%20filename%3D%22my_pan.pdf%22&...",
      "expires_at": "2026-03-22T04:20:00.000Z",
      "file_name": "my_pan.pdf",
      "content_type": "application/pdf"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data` | Object | No | View URL parameters |
  | `data.view_url` | String | No | Pre-signed AWS S3 cryptographic GET URL or external reference URL |
  | `data.expires_at` | String (ISO) | Yes | Expiration timestamp |
  | `data.file_name` | String | Yes | Sanitized filename |
  | `data.content_type` | String | Yes | Verified MIME type |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **503 Service Unavailable — Storage Unavailable:**
    ```json
    {
      "success": false,
      "message": "document storage is not available",
      "errorCode": "DOCUMENT_STORAGE_UNAVAILABLE"
    }
    ```
* **Security/Authorization Behavior:** Strictly scoped to caller. Requires `employee_can_view = true` on the document type.
* **Idempotency and Retry Behavior:** Idempotent in state; returns fresh cryptographic URLs.
* **Transactions/Concurrency Behavior:** Read-only with detached audit log.
* **Side Effects:** Emits `document.viewed` audit entry.
* **Important Edge Cases:** URL expires automatically after configured TTL (default 300s).
* **Related APIs/Dependencies:** API #38.
* **What the API Gives/Does:** Generates a secure view URL for an employee's own document.

---

### 41. POST /api/v1/documents/me/documents/:id/replace
* **API Name / Purpose:** Issue My Replace URL
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/me/documents/:id/replace`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee's document was rejected (e.g. blurry image) or has expired, and the employee needs to upload an updated version.
* **Why the API Exists:** Provides self-service document replacement ($v \rightarrow v+1$).
* **Real-World Usage:** Clicking "Re-upload" next to a rejected or expired document in "My Documents".
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "2b9a7c3d-e4f5-4a1b-8c2d-9e0f1a2b3c4d",
    "title": "My PAN Card (Clear Color Scan)",
    "file_name": "pan_scan_clear.pdf",
    "content_type": "application/pdf",
    "size_bytes": 786432,
    "issued_on": "2021-05-10",
    "expires_on": null,
    "document_number": "ABCDE1234F",
    "is_confidential": false
  }
  ```
* **Payload Fields & Meaning:**
  | Field | Type | Required | Nullable | Description | Validation / Allowed Values | Default |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | UUID | Required | No | Target document type ID | Must match predecessor's type | None |
  | `title` | String | Required | No | Document title | 3–200 characters | Predecessor title |
  | `file_name` | String | Required | No | Uploaded filename | 1–255 characters | None |
  | `content_type` | String | Required | No | MIME content type | Allowed MIME types list | None |
  | `size_bytes` | Integer | Required | No | File size in bytes | 1 to 26214400 (25 MB) | None |
  | `issued_on` | String (Date) | Optional | Yes | Issue date | ISO date (`YYYY-MM-DD`) | `null` |
  | `expires_on` | String (Date) | Optional | Yes | Expiry date | ISO date (`YYYY-MM-DD`) | `null` |
  | `document_number`| String | Optional | Yes | Reference number | 1–100 characters | Predecessor number |
  | `is_confidential`| Boolean | Optional | No | Confidentiality protection | `true` or `false` | Predecessor flag |
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Predecessor document ID |
* **Validation Rules:**
  - Predecessor document must belong to the logged-in employee (`DOCUMENT_NOT_FOUND` if not).
  - Predecessor must be in a replaceable status (`'available'`, `'expired'`, or `'rejected'`) (`DOCUMENT_NOT_REPLACEABLE`).
  - No active replacement on this group can already be in progress (`REPLACE_ALREADY_IN_PROGRESS`).
* **Backend Processing Flow:**
  1. Validates `id` and payload.
  2. Asserts predecessor document belongs to `actorId`.
  3. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  4. Asserts predecessor is replaceable.
  5. Computes `version = predecessor.version + 1` and `supersedes_id = predecessor.id`.
  6. Creates new row in `employee_documents` in `pending_upload` status.
  7. Generates pre-signed S3 PUT URL for new version.
  8. Emits audit log `document.replace_issued`.
  9. Commits transaction and returns upload parameters.
* **Database Impact:** Inserts 1 row in `employee_documents`, inserts 1 row in `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Replace URL issued",
    "data": {
      "document_id": "8d7e6f5a-4b3c-2d1e-0f9a-8b7c6d5e4f3a",
      "upload_url": "https://hrms-documents-bucket.s3.ap-south-1.amazonaws.com/tenants/b782fd72-493e-415d-8b5b-9194b81d294e/employee/f5eccc72-9e78-490c-93d7-0eb84210de45/8d7e6f5a-4b3c-2d1e-0f9a-8b7c6d5e4f3a?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
      "expires_at": "2026-03-22T04:25:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf",
        "Content-Length": "786432"
      },
      "supersedes_id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "version": 2
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Replace URL issued"`) |
  | `data` | Object | No | Replacement upload instructions |
  | `data.document_id` | UUID | No | New document version ID (confirm via API #37) |
  | `data.upload_url` | String | No | Pre-signed AWS S3 cryptographic PUT URL |
  | `data.expires_at` | String (ISO) | No | Upload URL expiration timestamp |
  | `data.required_headers` | Object | No | Mandatory headers for S3 PUT |
  | `data.supersedes_id` | UUID | No | ID of predecessor document |
  | `data.version` | Integer | No | Incremented version number ($v+1$) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Not Replaceable:**
    ```json
    {
      "success": false,
      "message": "Document cannot be replaced from its current status",
      "errorCode": "DOCUMENT_NOT_REPLACEABLE",
      "details": {
        "status": "pending_verification"
      }
    }
    ```
  - **409 Conflict — Replacement In Progress:**
    ```json
    {
      "success": false,
      "message": "A replacement is already in progress",
      "errorCode": "REPLACE_ALREADY_IN_PROGRESS",
      "details": {
        "existing_document_id": "d1e2f3a4-b5c6-7a8b-9c0d-1e2f3a4b5c6d"
      }
    }
    ```
* **Security/Authorization Behavior:** Strictly scoped to documents owned by `actorId`.
* **Idempotency and Retry Behavior:** Non-idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with group advisory lock `docgrp:{orgId}:{groupId}`.
* **Side Effects:** Predecessor document remains live until new version is confirmed via API #37.
* **Important Edge Cases:** Cannot replace documents currently in `pending_upload` or `pending_verification`.
* **Related APIs/Dependencies:** API #37 (Confirm Upload), API #39 (Versions).
* **What the API Gives/Does:** Issues an S3 upload URL for an employee to upload an updated version of a document.

---

### 42. DELETE /api/v1/documents/me/documents/:id
* **API Name / Purpose:** Delete My Document
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/documents/me/documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** An employee uploaded the wrong file or an unneeded document and wants to remove it before or after verification.
* **Why the API Exists:** Provides employee self-service deletion subject to statutory and verification guardrails.
* **Real-World Usage:** Employee clicks "Remove" on an incorrect upload.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUID | Required | Document ID to delete |
* **Validation Rules:**
  - Document must belong to caller (`user_id === actorId`).
  - **Unverified Document Rule:** If document status is `pending_upload` or `pending_verification`, deletion is **always permitted**.
  - **Verified Document Guardrails:** If document status is `available` or `expired`:
    - Document type must allow employee deletion (`type.employee_can_delete === true`).
    - Document type must **NOT be statutory** (`type.is_statutory === false`). Employees can **NEVER** delete verified statutory documents (e.g. PAN, Aadhaar, Form 16).
    - Organization settings must allow verified document deletion (`settings.employee_can_delete_verified_documents === true`).
    - If any of these conditions are not met, deletion fails with `409 DOCUMENT_NOT_DELETABLE`.
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Loads document. Asserts caller is owner (`user_id === actorId`).
  3. Evaluates unverified vs verified status against guardrails.
  4. Begins database transaction and acquires group lock `docgrp:{orgId}:{groupId}`.
  5. Updates row `status = 'deleted'` and performs paranoid soft-delete (`deleted_at = NOW()`).
  6. Emits audit log `document.deleted`.
  7. Commits transaction and returns deletion confirmation.
* **Database Impact:** Updates `employee_documents` (`status = 'deleted'`, `deleted_at = NOW()`), inserts `document_audit_logs`.
* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Document deleted",
    "data": {
      "id": "c3b9b46e-789a-4c28-98e3-0d268a735cf1",
      "status": "deleted"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"Document deleted"`) |
  | `data` | Object | No | Deletion confirmation |
  | `data.id` | UUID | No | ID of deleted document |
  | `data.status` | String | No | Status confirming deletion (`"deleted"`) |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Document Not Deletable:**
    ```json
    {
      "success": false,
      "message": "Document cannot be deleted from its current status",
      "errorCode": "DOCUMENT_NOT_DELETABLE"
    }
    ```
    *Trigger:* Attempting to delete a verified statutory document or when employee deletion permissions are turned off.
* **Security/Authorization Behavior:** Strict ownership check. Employees can never delete another user's document or a verified statutory document.
* **Idempotency and Retry Behavior:** Idempotent.
* **Transactions/Concurrency Behavior:** Transaction wrapped with group advisory lock.
* **Side Effects:** Soft-deletes document record.
* **Important Edge Cases:** Employees can NEVER delete a statutory document once it has been verified, regardless of standard policy flags.
* **Related APIs/Dependencies:** API #35, API #38.
* **What the API Gives/Does:** Soft-deletes a personal document subject to statutory compliance rules.

---

# Phase 2: Org-Issued Documents (APIs #43–#72)
## 2. HR Administration & Management APIs — Org Documents (APIs #43–#61)

### 43. POST /api/v1/documents/hr/org-documents
* **API Name / Purpose:** Create Org Document Draft
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to initiate a new organization-wide or department-targeted document/policy draft, assign its governance metadata, configure acknowledgement obligations, and receive an S3 upload URL.
* **Why the API Exists:** Provides the entry point for authoring org-plane documents with strict schema and policy validation before publishing.
* **Real-World Usage:** HR admin creates the "Annual Leave Policy 2026", assigns targeting criteria for full-time employees, sets a 14-day acknowledgement window, and uploads the policy PDF.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "title": "Annual Leave Policy 2026",
    "description": "Updated leave encashment and carry-forward guidelines.",
    "storage_backend": "s3",
    "file_name": "leave_policy_2026.pdf",
    "content_type": "application/pdf",
    "size_bytes": 1048576,
    "effective_from": "2026-10-01",
    "effective_to": null,
    "requires_acknowledgement": true,
    "acknowledgement_due_days": 14,
    "requires_signature": false,
    "is_confidential": false,
    "target_departments": ["550e8400-e29b-41d4-a716-446655440000"],
    "target_locations": [],
    "target_employment_types": ["full_time"],
    "target_job_statuses": ["confirmed"],
    "included_users": [],
    "excluded_users": []
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Validation / Allowed Values |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | Body | UUIDv4 | Yes | None | Must exist, be active, and have `plane = 'org'` |
  | `title` | Body | String | Yes | None | 3 to 200 characters |
  | `description` | Body | String | No | `null` | Max 2000 characters, nullable |
  | `storage_backend` | Body | String | No | `'s3'` | `'s3'` or `'reference'` |
  | `file_name` | Body | String | Conditional | None | Required if `storage_backend = 's3'`. Forbidden if `'reference'`. Max 255 chars |
  | `content_type` | Body | String | Conditional | None | Required if `storage_backend = 's3'`. Must be in module allowed MIME list |
  | `size_bytes` | Body | Integer | Conditional | None | Required if `storage_backend = 's3'`. 1 to 26,214,400 bytes (25 MB) |
  | `reference_url` | Body | String | Conditional | None | Required if `storage_backend = 'reference'`. Forbidden if `'s3'`. Valid HTTPS URL $\le 1000$ chars |
  | `effective_from` | Body | String (ISO) | No | `null` | ISO YYYY-MM-DD date string |
  | `effective_to` | Body | String (ISO) | No | `null` | ISO YYYY-MM-DD date string; must be $\ge$ `effective_from` |
  | `requires_acknowledgement` | Body | Boolean | No | Type default | May be raised; cannot be lowered below document type default |
  | `acknowledgement_due_days` | Body | Integer | Conditional | `null` | Required if `requires_acknowledgement = true`. Range: 1 to 365 (0 rejected) |
  | `requires_signature` | Body | Boolean | No | Type default | May be raised; cannot be lowered below document type default |
  | `is_confidential` | Body | Boolean | No | Type default | Tighten-only against type (`true` if type or payload is true) |
  | `target_departments` | Body | Array[UUID] | No | `[]` | Max 200 unique department IDs; verified against `organization_departments` |
  | `target_locations` | Body | Array[UUID] | No | `[]` | Max 200 unique location IDs; verified against `organization_locations` |
  | `target_employment_types`| Body | Array[String]| No | `[]` | Max 200 unique strings (e.g., `'full_time'`, `'part_time'`) |
  | `target_job_statuses` | Body | Array[String]| No | `[]` | Max 200 unique strings (e.g., `'confirmed'`, `'probation'`) |
  | `included_users` | Body | Array[UUID] | No | `[]` | Max 200 unique active user IDs; must be disjoint from `excluded_users` |
  | `excluded_users` | Body | Array[UUID] | No | `[]` | Max 200 unique active user IDs; must be disjoint from `included_users` |
* **Backend Processing Flow:**
  1. Validates body against `createOrgDraftSchema` (enforces field constraints, array limits, and disjointness of included/excluded users).
  2. Generates new UUID for `documentId` and independent UUID for `document_group_id`.
  3. Opens database transaction.
  4. Loads document type via `_loadTypeAndPolicy(orgId, typeId, t, 'org')`. Asserts `type.plane === 'org'` and `type.is_active === true`.
  5. Asserts raise-only rules for acknowledgement and signature; enforces tighten-only rule for confidentiality.
  6. Validates foreign existence of IDs in `target_departments`, `target_locations`, and `included_users`/`excluded_users` (R-47–R-49).
  7. Builds storage key: `org/{orgId}/documents/org/{document_group_id}/{documentId}`.
  8. Inserts row into `org_documents` with `status = 'draft'`, `version = 1`, `targeting = null`, `recipient_count = 0`.
  9. Records in-transaction audit entry `org_document.created`.
  10. Commits database transaction.
  11. Presigns S3 PUT upload URL outside the transaction using configured TTL.
* **Database Impact:** Inserts 1 row into `org_documents`; inserts 1 row into `document_audit_logs`.
* **File/Storage Impact:** No object written to S3 yet; returns pre-signed S3 cryptographic PUT URL.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Draft created",
    "data": {
      "document": {
        "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
        "version": 1,
        "supersedes_id": null,
        "title": "Annual Leave Policy 2026",
        "description": "Updated leave encashment and carry-forward guidelines.",
        "status": "draft",
        "effective_from": "2026-10-01",
        "effective_to": null,
        "target_departments": [
          "550e8400-e29b-41d4-a716-446655440000"
        ],
        "target_locations": [],
        "target_employment_types": [
          "full_time"
        ],
        "target_job_statuses": [
          "confirmed"
        ],
        "included_users": [],
        "excluded_users": [],
        "targeting": null,
        "requires_acknowledgement": true,
        "acknowledgement_due_days": 14,
        "requires_signature": false,
        "is_confidential": false,
        "storage_backend": "s3",
        "file_name": "leave_policy_2026.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1048576,
        "checksum_sha256": null,
        "confirmed_at": null,
        "published_by": null,
        "published_at": null,
        "superseded_at": null,
        "retired_by": null,
        "retired_at": null,
        "retirement_reason": null,
        "proposed_by": null,
        "approved_by": null,
        "actioned_at": null,
        "rejection_reason": null,
        "recipient_count": 0,
        "created_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "updated_by": null,
        "created_at": "2026-09-23T10:00:00.000Z",
        "updated_at": "2026-09-23T10:00:00.000Z"
      },
      "upload_url": "https://s3.ap-south-1.amazonaws.com/tenant-docs/org/9b1deb4d.../18cfdf09...?X-Amz-Signature=...",
      "upload_expires_at": "2026-09-23T10:15:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf"
      }
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success indicator (`true`) |
  | `message` | String | No | Status message (`"Draft created"`) |
  | `data.document` | Object | No | The created draft document record |
  | `data.document.id` | UUID | No | Unique ID of the created document version |
  | `data.document.org_id` | UUID | No | Tenant organization ID |
  | `data.document.document_type_id` | UUID | No | ID of associated document type |
  | `data.document.document_group_id` | UUID | No | Stable policy group identifier |
  | `data.document.version` | Integer | No | Provisional version number (`1`) |
  | `data.document.status` | String | No | Lifecycle status (`"draft"`) |
  | `data.document.targeting` | Object | Yes | Frozen targeting criteria (`null` while draft) |
  | `data.document.recipient_count` | Integer | No | Materialized recipient tally (`0` while draft) |
  | `data.upload_url` | String | Yes | Pre-signed AWS S3 PUT URL (present if `storage_backend = 's3'`) |
  | `data.upload_expires_at` | String (ISO) | Yes | S3 PUT URL expiration timestamp |
  | `data.required_headers` | Object | Yes | Headers required on binary S3 PUT (`Content-Type`) |
* **Exact Error Responses:**
  - **422 Unprocessable Entity — Plane Mismatch:**
    ```json
    {
      "success": false,
      "message": "This operation applies only to org-plane types",
      "errorCode": "DOCUMENT_TYPE_PLANE_MISMATCH"
    }
    ```
  - **422 Unprocessable Entity — Unknown Target Department:**
    ```json
    {
      "success": false,
      "message": "Unknown target department id",
      "errorCode": "TARGET_DEPARTMENT_UNKNOWN",
      "details": {
        "unknown": ["550e8400-e29b-41d4-a716-446655440099"]
      }
    }
    ```
  - **422 Unprocessable Entity — Overlapping Targeting Users:**
    ```json
    {
      "success": false,
      "message": "included_users and excluded_users must be disjoint",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
  - **422 Unprocessable Entity — Lowering Flag Forbidden:**
    ```json
    {
      "success": false,
      "message": "requires_acknowledgement cannot be lowered below the type default",
      "errorCode": "FLAG_CANNOT_BE_LOWERED",
      "details": {
        "field": "requires_acknowledgement"
      }
    }
    ```
  - **409 Conflict — Type Inactive:**
    ```json
    {
      "success": false,
      "message": "Document type is inactive",
      "errorCode": "DOCUMENT_TYPE_INACTIVE"
    }
    ```

---

### 44. PUT /api/v1/documents/hr/org-documents/:id
* **API Name / Purpose:** Update Org Document Draft
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to modify the title, description, effective window, acknowledgement rules, or targeting criteria of an unpublished draft.
* **Why the API Exists:** Provides mutable draft configuration prior to immutable publication.
* **Real-World Usage:** HR expands the target departments of the "Remote Work Policy" draft before issuing it to staff.
* **Request JSON Payload:**
  ```json
  {
    "title": "Remote Work Policy 2026 (Updated)",
    "description": "Amended home office stipend and eligibility criteria.",
    "effective_from": "2026-11-01",
    "effective_to": null,
    "target_departments": [
      "550e8400-e29b-41d4-a716-446655440000",
      "660e8400-e29b-41d4-a716-446655440001"
    ],
    "target_locations": []
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Target document draft ID |
  | `title` | Body | String | No | 3 to 200 characters |
  | `description` | Body | String | No | Max 2000 characters, nullable |
  | `effective_from` | Body | String (ISO) | No | ISO date string |
  | `effective_to` | Body | String (ISO) | No | ISO date string ($\ge$ `effective_from`) |
  | `requires_acknowledgement`| Body | Boolean | No | Cannot lower below type default or stored draft value |
  | `acknowledgement_due_days`| Body | Integer | No | Range 1 to 365 |
  | `requires_signature` | Body | Boolean | No | Cannot lower below type default or stored draft value |
  | `is_confidential` | Body | Boolean | No | Tighten-only |
  | Targeting arrays | Body | Array | No | Merged per dimension; omitted dimensions retain current stored values |
* **Backend Processing Flow:**
  1. Validates `id` parameter and body payload.
  2. Opens transaction and acquires transactional advisory lock `docorg:{orgId}:{groupId}`.
  3. Re-reads row `FOR UPDATE`. Asserts `status === 'draft'` (`409 ORG_DOCUMENT_NOT_EDITABLE` otherwise).
  4. Asserts `document_type_id` has not changed (R-38: `422 IMMUTABLE_FIELD`).
  5. Performs per-dimension targeting merge (omitted arrays retain previous values; explicit `[]` clears that dimension).
  6. Validates targeting IDs against database.
  7. Updates `org_documents` record and sets `updated_by = actorId`.
  8. Computes criteria diff and logs audit entry `org_document.updated`.
  9. Commits transaction and returns updated document.
* **Database Impact:** Updates row in `org_documents`; inserts 1 row in `document_audit_logs`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Draft updated",
    "data": {
      "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
      "version": 1,
      "title": "Remote Work Policy 2026 (Updated)",
      "description": "Amended home office stipend and eligibility criteria.",
      "status": "draft",
      "effective_from": "2026-11-01",
      "effective_to": null,
      "target_departments": [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001"
      ],
      "target_locations": [],
      "target_employment_types": ["full_time"],
      "target_job_statuses": ["confirmed"],
      "included_users": [],
      "excluded_users": [],
      "targeting": null,
      "requires_acknowledgement": true,
      "acknowledgement_due_days": 14,
      "requires_signature": false,
      "is_confidential": false,
      "storage_backend": "s3",
      "file_name": "leave_policy_2026.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": null,
      "confirmed_at": null,
      "published_by": null,
      "published_at": null,
      "superseded_at": null,
      "retired_by": null,
      "retired_at": null,
      "retirement_reason": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "recipient_count": 0,
      "created_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "updated_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "created_at": "2026-09-23T10:00:00.000Z",
      "updated_at": "2026-09-23T10:05:00.000Z"
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Not Editable:**
    ```json
    {
      "success": false,
      "message": "Only a draft can be edited",
      "errorCode": "ORG_DOCUMENT_NOT_EDITABLE",
      "details": {
        "status": "published"
      }
    }
    ```
  - **422 Unprocessable Entity — Immutable Field:**
    ```json
    {
      "success": false,
      "message": "document_type_id is immutable",
      "errorCode": "IMMUTABLE_FIELD",
      "details": {
        "field": "document_type_id"
      }
    }
    ```

---

### 45. POST /api/v1/documents/hr/org-documents/:id/file
* **API Name / Purpose:** Re-issue Upload URL for Draft
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/file`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** The previous pre-signed S3 upload URL expired before the client completed uploading, or the user chose a different file for the draft.
* **Why the API Exists:** Generates a fresh S3 PUT URL for the identical `storage_key` without creating duplicate rows or orphan S3 storage paths.
* **Request JSON Payload:** None (empty body).
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Target document draft ID |
* **Backend Processing Flow:**
  1. Validates `id` parameter.
  2. Loads document via `findByIdForStorage(orgId, docId)`.
  3. Verifies `status === 'draft'` and `storage_backend === 's3'`.
  4. Presigns fresh S3 PUT URL against existing `storage_key` using configured TTL.
  5. Returns upload URL instructions.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Upload URL issued",
    "data": {
      "document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "upload_url": "https://s3.ap-south-1.amazonaws.com/tenant-docs/org/9b1deb4d.../18cfdf09...?X-Amz-Signature=...",
      "upload_expires_at": "2026-09-23T10:30:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf"
      }
    }
  }
  ```
* **Exact Error Responses:**
  - **404 Not Found — Document Missing:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Not S3 Backed:**
    ```json
    {
      "success": false,
      "message": "This document has no S3 object to upload",
      "errorCode": "ORG_DOCUMENT_NOT_S3_BACKED"
    }
    ```

---

### 46. POST /api/v1/documents/hr/org-documents/:id/file/confirm
* **API Name / Purpose:** Confirm S3 Upload
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/file/confirm`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Verifies that the client actually uploaded the binary payload to AWS S3 before allowing publication.
* **Why the API Exists:** Validates physical object existence, exact byte size, and verified MIME type against document policy.
* **Real-World Usage:** Frontend uploads the PDF directly to S3 via PUT, then calls this endpoint to trigger server-side verification.
* **Request JSON Payload:** None (empty body).
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Target document draft ID |
* **Backend Processing Flow:**
  1. Validates `id` parameter. Loads row via `findByIdForStorage`.
  2. Asserts `status === 'draft'` and `storage_backend === 's3'`.
  3. If already confirmed (`confirmed_at !== null`), immediately returns document (idempotent replay).
  4. Calls S3 `HeadObject` on `storage_key` outside transaction (3s timeout, `maxAttempts: 1`).
  5. Asserts verified S3 content type and size using `assertUploadAllowed(policy, { contentType, sizeBytes })`.
  6. Opens transaction and acquires advisory lock `docorg:{orgId}:{groupId}`.
  7. Re-reads row `FOR UPDATE`. Updates `confirmed_at = now()`, `content_type`, `size_bytes`, `checksum_sha256`, `updated_by`.
  8. Records in-transaction audit entry `org_document.file_confirmed`.
  9. Commits transaction and returns verified document record.
* **Database Impact:** Updates `org_documents` (`confirmed_at`, `size_bytes`, `content_type`, `checksum_sha256`); inserts 1 row into `document_audit_logs`.
* **File/Storage Impact:** Reads S3 object metadata via `HeadObject`. No file mutation.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "File confirmed",
    "data": {
      "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
      "version": 1,
      "title": "Remote Work Policy 2026 (Updated)",
      "status": "draft",
      "file_name": "leave_policy_2026.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
      "confirmed_at": "2026-09-23T10:10:00.000Z",
      "created_at": "2026-09-23T10:00:00.000Z",
      "updated_at": "2026-09-23T10:10:00.000Z"
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Object Not in S3:**
    ```json
    {
      "success": false,
      "message": "Uploaded object was not found",
      "errorCode": "UPLOAD_NOT_FOUND"
    }
    ```
  - **422 Unprocessable Entity — Content Type Forbidden:**
    ```json
    {
      "success": false,
      "message": "content_type is not allowed for this document type",
      "errorCode": "DOCUMENT_CONTENT_TYPE_NOT_ALLOWED",
      "details": {
        "allowed": ["application/pdf"]
      }
    }
    ```
  - **503 Service Unavailable — Storage Timeout:**
    ```json
    {
      "success": false,
      "message": "document storage is not available",
      "errorCode": "DOCUMENT_STORAGE_UNAVAILABLE"
    }
    ```

---

### 47. POST /api/v1/documents/hr/org-documents/:id/publish
* **API Name / Purpose:** Publish Org Document & Materialize Audience
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/publish`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Transitions an unreleased draft into the official, live version of a policy, freezes its targeting rules into an audit snapshot, and populates individual recipient records for all eligible employees.
* **Why the API Exists:** Executes the core transactional transition of Phase 2, superseding predecessor versions and guaranteeing data consistency.
* **Real-World Usage:** HR reviews the uploaded policy draft, clicks "Publish", and the system makes it available to 450 targeted employees.
* **Request JSON Payload:**
  ```json
  {
    "override_scope_change": false
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | None | Document draft ID to publish |
  | `override_scope_change`| Body | Boolean | No | `false` | Required `true` if manager proposal target employee is no longer managed by proposer (EC-19) |
* **Backend Processing Flow (The Core Transaction):**
  1. Validates body against `publishSchema`.
  2. Reads row unlocked to obtain `org_id` and `document_group_id`.
  3. Begins database transaction.
  4. Acquires transactional advisory lock: `SELECT pg_advisory_xact_lock(hashtext('docorg:{orgId}:{groupId}'))`.
  5. Re-reads subject row `FOR UPDATE`:
     - If `status === 'published'`: Returns idempotent success (`already_published: true`).
     - If `status !== 'draft'`: Throws `409 INVALID_STATUS_TRANSITION`.
     - If `!isPublishable(row)` (missing confirmed S3 file or reference URL): Throws `409 ORG_DOCUMENT_FILE_MISSING`.
  6. Re-asserts document type is active and `plane === 'org'`.
  7. Queries active workforce matching targeting arrays via SQL pre-filter, then re-verifies each candidate row with `matchesCriteria` (T-19).
  8. Synchronous limit check: If `resolved.length > ORG_PUBLISH_SYNC_LIMIT (20000)`, rolls back with `422 RECIPIENT_SET_TOO_LARGE`.
  9. EC-19 Proposer Scope Check: If `proposed_by !== null`, recomputes manager's accessible IDs. If target is no longer managed and `override_scope_change === false`, rolls back with `409 PROPOSER_SCOPE_CHANGED`.
  10. Finds current live version in group via `findPublishedByGroup(orgId, groupId, { lock: true })`:
      - If predecessor found: `version = predecessor.version + 1`, `supersedes_id = predecessor.id`, updates predecessor `status = 'superseded'`, `superseded_at = now()`. Records audit `org_document.superseded`.
      - If no predecessor: `version = maxVersion + 1`.
  11. Constructs frozen targeting snapshot object containing criteria, resolved label map (`_resolveLabels`), scope token, summary, and resolved count.
  12. Computes `due_on = resolveDueOn(published_at IST, acknowledgement_due_days)`.
  13. Updates subject row to `status = 'published'`, `version`, `supersedes_id`, `published_by = actorId`, `published_at = now()`, `targeting = snapshot`, `recipient_count = resolved.length`.
  14. Inserts recipient rows into `org_document_recipients` in chunks of 1,000 using `bulkCreate({ ignoreDuplicates: true })` with `state = 'pending'`, `source = 'publish'`, `due_on`.
  15. Records audit entry `org_document.published` inside transaction.
  16. Commits transaction and returns published document.
* **Database Impact:**
  - Updates subject `org_documents` (`status = 'published'`, `targeting`, `recipient_count`, `version`).
  - Updates predecessor `org_documents` (`status = 'superseded'`, `superseded_at`) if applicable.
  - Inserts $N$ rows into `org_document_recipients`.
  - Inserts 1 or 2 rows into `document_audit_logs`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Published",
    "data": {
      "document": {
        "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
        "version": 2,
        "supersedes_id": "01af3344-9c8e-4a11-b112-998877665544",
        "title": "Remote Work Policy 2026 (Updated)",
        "description": "Amended home office stipend and eligibility criteria.",
        "status": "published",
        "effective_from": "2026-11-01",
        "effective_to": null,
        "targeting": {
          "criteria": {
            "target_departments": ["550e8400-e29b-41d4-a716-446655440000"],
            "target_locations": [],
            "target_employment_types": ["full_time"],
            "target_job_statuses": ["confirmed"],
            "included_users": [],
            "excluded_users": []
          },
          "labels": {
            "departments": {
              "550e8400-e29b-41d4-a716-446655440000": "Engineering"
            },
            "locations": {}
          },
          "scope": "mixed",
          "summary": "1 department(s), 1 employment type(s), 1 job status(es)",
          "resolved_at": "2026-09-23T10:15:00.000Z",
          "resolved_count": 42
        },
        "requires_acknowledgement": true,
        "acknowledgement_due_days": 14,
        "requires_signature": false,
        "is_confidential": false,
        "storage_backend": "s3",
        "file_name": "remote_work_policy_2026.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1048576,
        "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
        "confirmed_at": "2026-09-23T10:10:00.000Z",
        "published_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "published_at": "2026-09-23T10:15:00.000Z",
        "superseded_at": null,
        "recipient_count": 42,
        "created_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "updated_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "created_at": "2026-09-23T10:00:00.000Z",
        "updated_at": "2026-09-23T10:15:00.000Z"
      },
      "recipient_count": 42,
      "version": 2,
      "warnings": []
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — File Missing:**
    ```json
    {
      "success": false,
      "message": "Publish requires a confirmed file or a reference url",
      "errorCode": "ORG_DOCUMENT_FILE_MISSING"
    }
    ```
  - **409 Conflict — Proposer Scope Changed (EC-19):**
    ```json
    {
      "success": false,
      "message": "The proposer no longer manages every target",
      "errorCode": "PROPOSER_SCOPE_CHANGED"
    }
    ```
  - **409 Conflict — Already Published:**
    ```json
    {
      "success": false,
      "message": "A published version already exists for this group",
      "errorCode": "ORG_DOCUMENT_ALREADY_PUBLISHED"
    }
    ```
  - **422 Unprocessable Entity — Audience Too Large:**
    ```json
    {
      "success": false,
      "message": "Recipient set too large",
      "errorCode": "RECIPIENT_SET_TOO_LARGE",
      "details": {
        "resolved_count": 25000,
        "limit": 20000
      }
    }
    ```

---

### 48. POST /api/v1/documents/hr/org-documents/:id/replace
* **API Name / Purpose:** Start Replacement Draft ($v+1$)
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/replace`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to prepare the next version of an existing policy without taking down or unpublishing the currently active policy version.
* **Why the API Exists:** Provides non-disruptive policy replacement. The predecessor remains `published` until the new version is explicitly published via API #47.
* **Request JSON Payload:**
  ```json
  {
    "title": "Remote Work Policy 2027",
    "effective_from": "2027-01-01"
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Existing published document ID |
  | `title` | Body | String | No | 3 to 200 chars (defaults to predecessor title) |
  | `effective_from` | Body | String (ISO) | No | Defaults to predecessor effective from date |
* **Backend Processing Flow:**
  1. Opens transaction and acquires advisory lock `docorg:{orgId}:{groupId}`.
  2. Reads predecessor `FOR UPDATE`. Asserts `row.status === 'published'` (`409 ORG_DOCUMENT_NOT_REPLACEABLE` otherwise).
  3. Checks whether a draft already exists in the group (`409 ORG_DOCUMENT_DRAFT_EXISTS`).
  4. Generates new UUID for `newId`. Copies metadata, targeting arrays, and settings from predecessor.
  5. Inserts new row with same `document_group_id`, `version = predecessor.version + 1` (provisional), `status = 'draft'`, `supersedes_id = null`.
  6. Records audit entry `org_document.replaced`.
  7. Commits transaction and presigns S3 upload URL for the new version.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Replacement draft created",
    "data": {
      "document": {
        "id": "77bb2211-4433-2211-aa99-001122334455",
        "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
        "version": 2,
        "supersedes_id": null,
        "title": "Remote Work Policy 2027",
        "status": "draft",
        "effective_from": "2027-01-01",
        "effective_to": null,
        "targeting": null,
        "recipient_count": 0,
        "created_at": "2026-09-23T10:30:00.000Z",
        "updated_at": "2026-09-23T10:30:00.000Z"
      },
      "upload_url": "https://s3.ap-south-1.amazonaws.com/tenant-docs/org/9b1deb4d.../77bb2211...?X-Amz-Signature=...",
      "upload_expires_at": "2026-09-23T10:45:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf"
      }
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Not Replaceable:**
    ```json
    {
      "success": false,
      "message": "Only a published document can be replaced",
      "errorCode": "ORG_DOCUMENT_NOT_REPLACEABLE",
      "details": {
        "status": "draft"
      }
    }
    ```
  - **409 Conflict — Draft Already In Progress:**
    ```json
    {
      "success": false,
      "message": "A draft already exists for this group",
      "errorCode": "ORG_DOCUMENT_DRAFT_EXISTS",
      "details": {
        "document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1"
      }
    }
    ```

---

### 49. POST /api/v1/documents/hr/org-documents/:id/retire
* **API Name / Purpose:** Retire Published Document
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/retire`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to officially withdraw an active policy or letter without deleting historical compliance records.
* **Why the API Exists:** Transitions a live policy to terminal `'retired'` state, freeing the group unique index while preserving historical recipient access.
* **Request JSON Payload:**
  ```json
  {
    "reason": "Superseded by updated regional corporate governance guidelines."
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Published document ID |
  | `reason` | Body | String | Yes | 10 to 500 characters explaining retirement |
* **Backend Processing Flow:**
  1. Validates body against `reasonSchema`.
  2. Opens transaction and acquires advisory lock `docorg:{orgId}:{groupId}`.
  3. Re-reads row `FOR UPDATE`. If `status === 'retired'`, returns immediately (idempotent replay).
  4. Asserts `status === 'published'` (`409 INVALID_STATUS_TRANSITION` if draft/superseded/rejected).
  5. Updates row: `status = 'retired'`, `retired_by = actorId`, `retired_at = now()`, `retirement_reason = reason`.
  6. Recipient rows are **not modified** (they retain historical read-only access with `is_actionable = false`).
  7. Records audit entry `org_document.retired`.
  8. Commits transaction and returns retired document.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Retired",
    "data": {
      "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
      "version": 1,
      "title": "Remote Work Policy 2026",
      "status": "retired",
      "retired_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "retired_at": "2026-09-23T11:00:00.000Z",
      "retirement_reason": "Superseded by updated regional corporate governance guidelines.",
      "recipient_count": 42,
      "created_at": "2026-09-23T10:00:00.000Z",
      "updated_at": "2026-09-23T11:00:00.000Z"
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Illegal Transition:**
    ```json
    {
      "success": false,
      "message": "Only a published document can be retired",
      "errorCode": "INVALID_STATUS_TRANSITION",
      "details": {
        "status": "superseded"
      }
    }
    ```
  - **400 Bad Request — Reason Too Short:**
    ```json
    {
      "success": false,
      "message": "\"reason\" length must be at least 10 characters long",
      "errorCode": "VALIDATION_ERROR"
    }
    ```

---

### 50. POST /api/v1/documents/hr/org-documents/:id/reject
* **API Name / Purpose:** Reject Manager Proposal
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/reject`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR declines a manager-submitted disciplinary or policy proposal (Tier-B maker-checker rejection).
* **Why the API Exists:** Provides an auditable rejection mechanism for manager proposals, preventing unauthorized publishing.
* **Request JSON Payload:**
  ```json
  {
    "reason": "Insufficient documentation provided regarding previous verbal warnings."
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Manager proposal draft ID |
  | `reason` | Body | String | Yes | 10 to 500 characters explaining rejection |
* **Backend Processing Flow:**
  1. Validates body against `reasonSchema`.
  2. Opens transaction and acquires advisory lock `docorg:{orgId}:{groupId}`.
  3. Re-reads row `FOR UPDATE`. Asserts `proposed_by !== null` (`409 ORG_DOCUMENT_NOT_A_PROPOSAL` if HR-authored).
  4. If `status === 'rejected'`, returns immediately (idempotent replay).
  5. Asserts `status === 'draft'` (`409 INVALID_STATUS_TRANSITION`).
  6. Updates row: `status = 'rejected'`, `rejection_reason = reason`, `approved_by = actorId`, `actioned_at = now()`.
  7. Records audit entry `org_document.rejected`.
  8. Commits transaction and returns rejected document.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Rejected",
    "data": {
      "id": "33cc4455-6677-8899-aabb-ccddeeff0011",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "title": "Performance Improvement Plan - John Doe",
      "status": "rejected",
      "proposed_by": "b1234567-89ab-cdef-0123-456789abcdef",
      "approved_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "actioned_at": "2026-09-23T11:15:00.000Z",
      "rejection_reason": "Insufficient documentation provided regarding previous verbal warnings.",
      "created_at": "2026-09-23T09:00:00.000Z",
      "updated_at": "2026-09-23T11:15:00.000Z"
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Not a Manager Proposal:**
    ```json
    {
      "success": false,
      "message": "Only a manager proposal can be rejected",
      "errorCode": "ORG_DOCUMENT_NOT_A_PROPOSAL",
      "details": {
        "status": "draft"
      }
    }
    ```

---

### 51. DELETE /api/v1/documents/hr/org-documents/:id
* **API Name / Purpose:** Soft-Delete Draft / Rejected Document
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Eliminates abandoned drafts or rejected proposals while preserving audit trails and cleaning up unneeded S3 binaries.
* **Why the API Exists:** Provides administrative cleanup. Published, superseded, or retired documents can **never** be deleted.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Target document ID |
* **Backend Processing Flow:**
  1. Validates `id` parameter. Loads row via `findByIdForStorage`.
  2. Opens transaction and acquires advisory lock `docorg:{orgId}:{groupId}`.
  3. Re-reads row `FOR UPDATE`.
  4. Asserts `status === 'draft' || status === 'rejected'` (`409 ORG_DOCUMENT_NOT_DELETABLE` otherwise).
  5. Updates `updated_by = actorId`, executes soft-delete (`deleted_at = now()`).
  6. Records audit entry `org_document.deleted`.
  7. Commits transaction.
  8. Post-commit: Best-effort asynchronous sweep of S3 object (`deleteObject(storage_key)`). Failure is logged and swallowed (§19.3).
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Document deleted",
    "data": {
      "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "deleted": true
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Published Document Not Deletable:**
    ```json
    {
      "success": false,
      "message": "Only a draft or rejected document can be deleted",
      "errorCode": "ORG_DOCUMENT_NOT_DELETABLE",
      "details": {
        "status": "published"
      }
    }
    ```

---

### 52. GET /api/v1/documents/hr/org-documents
* **API Name / Purpose:** List Org Documents
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to search, filter, and paginate through organization documents across all statuses.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `status` | Query | String / Array | No | None | Filter by status (`draft`, `published`, `superseded`, `retired`, `rejected`) |
  | `type_id` | Query | UUIDv4 | No | None | Filter by document type ID |
  | `group_id` | Query | UUIDv4 | No | None | Filter by policy group ID |
  | `proposed` | Query | Boolean | No | None | `true` for manager proposals; `false` for HR-authored |
  | `q` | Query | String | No | None | Case-insensitive title prefix search (max 200 chars) |
  | `limit` | Query | Integer | No | `50` | 1 to 200 rows per page |
  | `offset` | Query | Integer | No | `0` | Pagination offset |
* **Backend Processing Flow:**
  1. Validates query parameters against `listQuerySchema`.
  2. Queries `org_documents` using `LIST_ATTRIBUTES` projection (excludes `storage_key` and `reference_url`).
  3. Derives `display_status` and `is_actionable` for each row.
  4. Returns paginated response.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
          "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
          "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
          "version": 1,
          "supersedes_id": null,
          "title": "Remote Work Policy 2026",
          "description": "Amended home office stipend and eligibility criteria.",
          "status": "published",
          "display_status": "active",
          "is_actionable": true,
          "effective_from": "2026-09-01",
          "effective_to": null,
          "targeting": {
            "scope": "mixed",
            "summary": "1 department(s), 1 employment type(s)",
            "resolved_count": 42
          },
          "requires_acknowledgement": true,
          "acknowledgement_due_days": 14,
          "requires_signature": false,
          "is_confidential": false,
          "storage_backend": "s3",
          "file_name": "remote_work_policy_2026.pdf",
          "content_type": "application/pdf",
          "size_bytes": 1048576,
          "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
          "confirmed_at": "2026-09-23T10:10:00.000Z",
          "published_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
          "published_at": "2026-09-23T10:15:00.000Z",
          "recipient_count": 42,
          "created_at": "2026-09-23T10:00:00.000Z",
          "updated_at": "2026-09-23T10:15:00.000Z"
        }
      ]
    }
  }
  ```

---

### 53. GET /api/v1/documents/hr/org-documents/proposals
* **API Name / Purpose:** Manager Proposals Review Queue
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/proposals`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs a dedicated queue of pending manager-drafted proposals awaiting review, publishing, or rejection.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `limit` | Query | Integer | No | `50` | 1 to 200 |
  | `offset` | Query | Integer | No | `0` | Pagination offset |
* **Backend Processing Flow:**
  1. Validates query against `proposalsQuerySchema`.
  2. Queries partial index `org_documents_org_proposed_idx`: `WHERE status = 'draft' AND proposed_by IS NOT NULL AND deleted_at IS NULL`.
  3. Returns paginated queue with derived display statuses.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "33cc4455-6677-8899-aabb-ccddeeff0011",
          "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "document_type_id": "88aa99bb-ccdd-eeff-0011-223344556677",
          "document_group_id": "11223344-5566-7788-99aa-bbccddeeff00",
          "version": 1,
          "title": "Warning Letter - Attendance Irregularity",
          "status": "draft",
          "display_status": "draft",
          "is_actionable": false,
          "proposed_by": "b1234567-89ab-cdef-0123-456789abcdef",
          "included_users": [
            "c9876543-21ba-fedc-ba98-765432abcdef"
          ],
          "created_at": "2026-09-23T09:00:00.000Z",
          "updated_at": "2026-09-23T09:00:00.000Z"
        }
      ]
    }
  }
  ```

---

### 54. GET /api/v1/documents/hr/org-documents/groups/:groupId
* **API Name / Purpose:** Full Policy Group Version Chain
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/groups/:groupId`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to audit the entire revision history of a policy group from version 1 through the current active version.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `groupId` | Path | UUIDv4 | Yes | Policy group ID |
* **Backend Processing Flow:**
  1. Validates `groupId` parameter against `groupIdParamSchema`.
  2. Queries `org_documents` matching `org_id` and `document_group_id`, ordered `version ASC`.
  3. Throws `404 DOCUMENT_NOT_FOUND` if no versions exist.
  4. Formats each row with derived `display_status` and `is_actionable`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "01af3344-9c8e-4a11-b112-998877665544",
        "version": 1,
        "title": "Remote Work Policy 2025",
        "status": "superseded",
        "display_status": "superseded",
        "is_actionable": false,
        "published_at": "2025-09-01T00:00:00.000Z",
        "superseded_at": "2026-09-23T10:15:00.000Z",
        "recipient_count": 35
      },
      {
        "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "version": 2,
        "title": "Remote Work Policy 2026 (Updated)",
        "status": "published",
        "display_status": "active",
        "is_actionable": true,
        "published_at": "2026-09-23T10:15:00.000Z",
        "recipient_count": 42
      }
    ]
  }
  ```

---

### 55. GET /api/v1/documents/hr/org-documents/:id
* **API Name / Purpose:** Org Document Detail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR inspects full configuration, targeting rules, and publication metrics for a specific org document.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Target document ID |
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
      "version": 2,
      "supersedes_id": "01af3344-9c8e-4a11-b112-998877665544",
      "title": "Remote Work Policy 2026 (Updated)",
      "description": "Amended home office stipend and eligibility criteria.",
      "status": "published",
      "display_status": "active",
      "is_actionable": true,
      "effective_from": "2026-11-01",
      "effective_to": null,
      "target_departments": ["550e8400-e29b-41d4-a716-446655440000"],
      "target_locations": [],
      "target_employment_types": ["full_time"],
      "target_job_statuses": ["confirmed"],
      "included_users": [],
      "excluded_users": [],
      "targeting": {
        "criteria": {
          "target_departments": ["550e8400-e29b-41d4-a716-446655440000"],
          "target_locations": [],
          "target_employment_types": ["full_time"],
          "target_job_statuses": ["confirmed"],
          "included_users": [],
          "excluded_users": []
        },
        "labels": {
          "departments": {
            "550e8400-e29b-41d4-a716-446655440000": "Engineering"
          },
          "locations": {}
        },
        "scope": "mixed",
        "summary": "1 department(s), 1 employment type(s), 1 job status(es)",
        "resolved_at": "2026-09-23T10:15:00.000Z",
        "resolved_count": 42
      },
      "requires_acknowledgement": true,
      "acknowledgement_due_days": 14,
      "requires_signature": false,
      "is_confidential": false,
      "storage_backend": "s3",
      "file_name": "remote_work_policy_2026.pdf",
      "content_type": "application/pdf",
      "size_bytes": 1048576,
      "checksum_sha256": "d41d8cd98f00b204e9800998ecf8427e",
      "confirmed_at": "2026-09-23T10:10:00.000Z",
      "published_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "published_at": "2026-09-23T10:15:00.000Z",
      "superseded_at": null,
      "retired_by": null,
      "retired_at": null,
      "retirement_reason": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "recipient_count": 42,
      "created_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "updated_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "created_at": "2026-09-23T10:00:00.000Z",
      "updated_at": "2026-09-23T10:15:00.000Z"
    }
  }
  ```

---

### 56. GET /api/v1/documents/hr/org-documents/:id/versions
* **API Name / Purpose:** Version Chain via Document Member
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/versions`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Enables a client viewing any individual document version to immediately load all peer versions in the group.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Any document version ID in the group |
* **Backend Processing Flow:**
  1. Loads document row by `id` to resolve `document_group_id`.
  2. Queries all documents for that group ID, ordered `version ASC`.
  3. Returns array of version records.
* **Success Response Structure (200 OK):** Identical array payload to API #54.

---

### 57. GET /api/v1/documents/hr/org-documents/:id/view-url
* **API Name / Purpose:** Pre-signed View URL (HR)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/view-url`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Grants HR temporary pre-signed S3 download/viewing access to the policy binary or external reference URL.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | None | Document ID |
  | `disposition` | Query | String | No | `'inline'` | `'inline'` or `'attachment'` |
* **Backend Processing Flow:**
  1. Validates `id` and query against `viewUrlQuerySchema`.
  2. Loads document via `findByIdForStorage`.
  3. If `storage_backend === 'reference'`: Returns stored `reference_url` directly; logs detached audit `org_document.viewed`.
  4. If `storage_backend === 's3'`: Sanitizes filename, formats `Content-Disposition`, and generates pre-signed GET URL via S3 SDK using TTL from `document_settings.document_view_url_ttl_seconds`.
  5. Logs detached audit entry `org_document.viewed`.
  6. Returns view URL and metadata.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "view_url": "https://s3.ap-south-1.amazonaws.com/tenant-docs/org/9b1deb4d.../18cfdf09...?X-Amz-Signature=...",
      "expires_at": "2026-09-23T11:30:00.000Z",
      "file_name": "remote_work_policy_2026.pdf",
      "content_type": "application/pdf"
    }
  }
  ```

---

### 58. GET /api/v1/documents/hr/org-documents/:id/audit-logs
* **API Name / Purpose:** Document Audit Trail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/audit-logs`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Compliance and legal auditing of all state changes, targeting edits, and publication actions for an org document.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Document ID |
* **Backend Processing Flow:**
  1. Validates `id`.
  2. Queries `document_audit_logs` where `org_id = :orgId AND entity_type = 'org_document' AND entity_id = :id`.
  3. Orders by `created_at DESC, id DESC`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "e91b5c42-8877-44aa-99bb-112233445566",
        "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "actor_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "entity_type": "org_document",
        "entity_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "action": "org_document.published",
        "old_values": {
          "status": "draft"
        },
        "new_values": {
          "version": 2,
          "recipient_count": 42,
          "scope": "mixed",
          "criteria": {
            "target_departments": ["550e8400-e29b-41d4-a716-446655440000"]
          },
          "scope_override": false
        },
        "proposed_by": null,
        "approved_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "reason": null,
        "ip_address": "127.0.0.1",
        "created_at": "2026-09-23T10:15:00.000Z"
      }
    ]
  }
  ```

---

### 59. GET /api/v1/documents/hr/org-documents/:id/recipients
* **API Name / Purpose:** Recipient Roster & State Tallies
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/recipients`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to verify individual employee compliance, see who has viewed or waived a policy, and track status tallies.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | None | Document ID |
  | `state` | Query | String / Array | No | None | Filter by state (`pending`, `viewed`, `acknowledged`, `signed`, `waived`) |
  | `limit` | Query | Integer | No | `50` | 1 to 200 |
  | `offset` | Query | Integer | No | `0` | Pagination offset |
* **Backend Processing Flow:**
  1. Asserts document exists in organization.
  2. Queries `org_document_recipients` filtered by `state`, ordered `created_at ASC, id ASC`.
  3. Executes `countsByState` aggregation query grouped by `state`. Fills zero-counts for missing states.
  4. Returns paginated roster along with status summary block.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 42,
      "rows": [
        {
          "id": "44bb5566-7788-9900-aabb-ccddeeff0011",
          "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
          "user_id": "c9876543-21ba-fedc-ba98-765432abcdef",
          "state": "viewed",
          "source": "publish",
          "first_viewed_at": "2026-09-23T10:45:00.000Z",
          "due_on": "2026-10-07",
          "waived_by": null,
          "waived_at": null,
          "waived_reason": null,
          "created_at": "2026-09-23T10:15:00.000Z",
          "updated_at": "2026-09-23T10:45:00.000Z"
        }
      ],
      "counts_by_state": {
        "pending": 30,
        "viewed": 10,
        "acknowledged": 0,
        "signed": 0,
        "waived": 2,
        "total": 42
      }
    }
  }
  ```

---

### 60. POST /api/v1/documents/hr/org-documents/:id/recipients/sync
* **API Name / Purpose:** Sync / Top-Up Recipients Against Frozen Criteria
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/recipients/sync`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** When new employees join an organization or transfer into a targeted department after publication, HR tops up the recipient roster so new staff receive mandatory policies (D-14).
* **Why the API Exists:** Idempotently materializes newly matching recipients without disturbing existing recipients or re-triggering notifications for employees who already received the document.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Published document ID |
* **Backend Processing Flow:**
  1. Opens transaction and acquires advisory lock `docorg:{orgId}:{groupId}`.
  2. Loads document `FOR UPDATE`. Asserts `status === 'published'` (`409 ORG_DOCUMENT_NOT_SYNCABLE` otherwise).
  3. Resolves current matching workforce against **frozen snapshot criteria** (`targeting.criteria`), never live array columns (R-54).
  4. Identifies user IDs not yet present in `org_document_recipients`.
  5. Sync limit guard: If `missing.length > ORG_PUBLISH_SYNC_LIMIT`, rolls back with `422 RECIPIENT_SET_TOO_LARGE`.
  6. Computes `due_on` from the **sync date** (EC-13: new joiners are not shown as overdue from original publication date).
  7. Inserts missing rows with `source = 'sync'`, `state = 'pending'`. Existing recipients are untouched.
  8. Updates `org_documents.recipient_count`.
  9. Records audit entry `org_document.recipients_synced` with `{ added_count }`.
  10. Commits transaction and returns added count and total recipient tally.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Recipients synced",
    "data": {
      "added_count": 3,
      "recipient_count": 45
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Not Published:**
    ```json
    {
      "success": false,
      "message": "Only a published document can be synced",
      "errorCode": "ORG_DOCUMENT_NOT_SYNCABLE",
      "details": {
        "status": "retired"
      }
    }
    ```

---

### 61. POST /api/v1/documents/hr/org-documents/:id/recipients/:userId/waive
* **API Name / Purpose:** Waive Individual Recipient
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/recipients/:userId/waive`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR grants an administrative exemption to an individual employee from having to acknowledge or complete a mandatory document (e.g. employee on medical sabbatical).
* **Why the API Exists:** Provides an auditable exit state (`waived`) without deleting the recipient record (D-14).
* **Request JSON Payload:**
  ```json
  {
    "reason": "Employee is currently on approved long-term medical leave."
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Document ID |
  | `userId` | Path | UUIDv4 | Yes | Recipient user ID |
  | `reason` | Body | String | Yes | 10 to 500 characters justifying waiver |
* **Backend Processing Flow:**
  1. Validates parameters and body against `waiveSchema`.
  2. Opens transaction and loads recipient row `FOR UPDATE`.
  3. If already `state === 'waived'`, returns row immediately (idempotent replay).
  4. If `state === 'acknowledged'` or `state === 'signed'`, rolls back with `409 RECIPIENT_ALREADY_COMPLETED`.
  5. Updates recipient row: `state = 'waived'`, `waived_by = actorId`, `waived_reason = reason`, `waived_at = now()`.
  6. Records audit entry `org_document_recipient.waived`.
  7. Commits transaction and returns updated recipient row.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Recipient waived",
    "data": {
      "id": "44bb5566-7788-9900-aabb-ccddeeff0011",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "user_id": "c9876543-21ba-fedc-ba98-765432abcdef",
      "state": "waived",
      "source": "publish",
      "first_viewed_at": "2026-09-23T10:45:00.000Z",
      "due_on": "2026-10-07",
      "waived_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "waived_at": "2026-09-23T11:45:00.000Z",
      "waived_reason": "Employee is currently on approved long-term medical leave.",
      "created_at": "2026-09-23T10:15:00.000Z",
      "updated_at": "2026-09-23T11:45:00.000Z"
    }
  }
  ```
* **Exact Error Responses:**
  - **409 Conflict — Already Acknowledged:**
    ```json
    {
      "success": false,
      "message": "Recipient has already completed this document",
      "errorCode": "RECIPIENT_ALREADY_COMPLETED",
      "details": {
        "state": "acknowledged"
      }
    }
    ```
  - **404 Not Found — Recipient Missing:**
    ```json
    {
      "success": false,
      "message": "Recipient not found",
      "errorCode": "RECIPIENT_NOT_FOUND"
    }
    ```

---

## 3. Manager Tier-B Proposal APIs — Org Documents (APIs #62–#69)

### 62. GET /api/v1/documents/manager/org-documents/types
* **API Name / Purpose:** List Requestable Org Types for Manager
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/types`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager needs to discover what types of org-plane documents (e.g. Warning Letter, PIP) they are permitted to draft for their team members.
* **Why the API Exists:** Filters active org-plane types by `manager_can_request === true` and respects the organization-level setting `manager_can_view_team_documents`.
* **Request Parameters:** None.
* **Backend Processing Flow:**
  1. Loads organization settings. If `manager_can_view_team_documents === false`, returns empty list `[]` (not an error, mirroring Phase 1 convention).
  2. Queries active document types for the tenant with `plane = 'org'`.
  3. Filters types where `manager_can_request === true`.
  4. Returns allowed types list.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      {
        "id": "88aa99bb-ccdd-eeff-0011-223344556677",
        "code": "warning_letter",
        "name": "Warning Letter",
        "plane": "org",
        "group": "compliance",
        "manager_can_request": true,
        "requires_acknowledgement": true,
        "requires_signature": false,
        "is_confidential": true
      }
    ]
  }
  ```

---

### 63. POST /api/v1/documents/manager/org-documents
* **API Name / Purpose:** Create Proposal for Direct Report
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** A manager initiates a disciplinary letter or PIP for an underperforming direct report and forwards it to HR for formal publication.
* **Why the API Exists:** Enforces Tier-B maker-checker creation rules.
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "88aa99bb-ccdd-eeff-0011-223344556677",
    "title": "Warning Letter - Attendance Irregularity",
    "description": "Repeated unannounced absences in September.",
    "storage_backend": "s3",
    "file_name": "warning_letter_john_doe.pdf",
    "content_type": "application/pdf",
    "size_bytes": 524288,
    "effective_from": "2026-09-24",
    "requires_acknowledgement": true,
    "acknowledgement_due_days": 7,
    "is_confidential": true,
    "included_users": [
      "c9876543-21ba-fedc-ba98-765432abcdef"
    ]
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | Body | UUIDv4 | Yes | Must have `plane = 'org'` and `manager_can_request = true` |
  | `title` | Body | String | Yes | 3 to 200 characters |
  | `included_users` | Body | Array[UUID] | Yes | Must contain **exactly one** user ID (`singleTarget`) who is an active direct report |
  | File / S3 metadata | Body | Various | Conditional | Identical to API #43 |
* **Backend Processing Flow:**
  1. Validates body against `createProposalSchema` (enforces `included_users.length === 1`).
  2. Resolves manager's accessible team members via `hierarchyAccess.getAccessibleUserIds(orgId, req.user)`.
  3. Verifies `manager_can_view_team_documents` setting (`403 FORBIDDEN` if off).
  4. Verifies `included_users[0]` belongs to `accessibleUserIds` (`403 FORBIDDEN` if out of scope).
  5. Opens transaction. Loads type, verifies `manager_can_request === true`.
  6. Inserts draft with `proposed_by = actorId`, `created_by = actorId`, all other targeting arrays empty.
  7. Audits `org_document.created` with `proposed_by` populated.
  8. Commits transaction and returns pre-signed S3 upload URL.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Proposal created",
    "data": {
      "document": {
        "id": "33cc4455-6677-8899-aabb-ccddeeff0011",
        "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "document_type_id": "88aa99bb-ccdd-eeff-0011-223344556677",
        "document_group_id": "11223344-5566-7788-99aa-bbccddeeff00",
        "version": 1,
        "title": "Warning Letter - Attendance Irregularity",
        "status": "draft",
        "proposed_by": "b1234567-89ab-cdef-0123-456789abcdef",
        "included_users": [
          "c9876543-21ba-fedc-ba98-765432abcdef"
        ],
        "created_at": "2026-09-23T09:00:00.000Z",
        "updated_at": "2026-09-23T09:00:00.000Z"
      },
      "upload_url": "https://s3.ap-south-1.amazonaws.com/tenant-docs/org/9b1deb4d.../33cc4455...?X-Amz-Signature=...",
      "upload_expires_at": "2026-09-23T09:15:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf"
      }
    }
  }
  ```
* **Exact Error Responses:**
  - **403 Forbidden — Target Not a Direct Report:**
    ```json
    {
      "success": false,
      "message": "Forbidden",
      "errorCode": "FORBIDDEN"
    }
    ```
  - **422 Unprocessable Entity — Multiple Targets Prohibited:**
    ```json
    {
      "success": false,
      "message": "\"included_users\" must contain 1 items",
      "errorCode": "VALIDATION_ERROR"
    }
    ```

---

### 64. PUT /api/v1/documents/manager/org-documents/:id
* **API Name / Purpose:** Update Own Proposal
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Manager edits their own unreviewed proposal.
* **Request JSON Payload:**
  ```json
  {
    "title": "Warning Letter - Attendance Irregularity (Final Draft)",
    "description": "Updated with additional absence logs."
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Proposal ID |
* **Backend Processing Flow:**
  1. Validates body against `updateProposalSchema`.
  2. Resolves manager accessible IDs.
  3. Loads draft. Authority check enforces `row.proposed_by === actorUserId`, `row.status === 'draft'`, and target report is still in accessible IDs.
  4. Any unauthorized attempt returns **uniform `404 DOCUMENT_NOT_FOUND`**.
  5. Updates draft under advisory lock and logs audit entry.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Proposal updated",
    "data": {
      "id": "33cc4455-6677-8899-aabb-ccddeeff0011",
      "title": "Warning Letter - Attendance Irregularity (Final Draft)",
      "status": "draft",
      "proposed_by": "b1234567-89ab-cdef-0123-456789abcdef",
      "updated_at": "2026-09-23T09:10:00.000Z"
    }
  }
  ```
* **Exact Error Responses:**
  - **404 Not Found — Probing Another Manager's Proposal:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```

---

### 65. POST /api/v1/documents/manager/org-documents/:id/file
* **API Name / Purpose:** Re-issue Upload URL for Own Proposal
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/:id/file`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Manager requests fresh pre-signed upload URL for an existing proposal draft.
* **Backend Processing Flow:** Verifies manager proposal ownership via `_assertManagerWrite`. Generates pre-signed S3 PUT URL for existing `storage_key`.
* **Success Response Structure (200 OK):** Identical structure to API #45.

---

### 66. POST /api/v1/documents/manager/org-documents/:id/file/confirm
* **API Name / Purpose:** Confirm Upload for Own Proposal
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/:id/file/confirm`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Manager verifies that their proposal file has arrived in S3 before sending to HR review.
* **Backend Processing Flow:** Verifies manager proposal ownership. Calls S3 `HeadObject` and applies policy checks via `assertUploadAllowed`. Sets `confirmed_at = now()`.
* **Success Response Structure (200 OK):** Identical structure to API #46.

---

### 67. GET /api/v1/documents/manager/org-documents/mine
* **API Name / Purpose:** List Manager's Own Proposals
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/mine`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Allows a manager to view all proposals they have authored, tracking whether HR published or rejected them.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `status` | Query | String / Array | No | None | Filter by status (`draft`, `published`, `superseded`, `retired`, `rejected`) |
  | `limit` | Query | Integer | No | `50` | 1 to 200 |
  | `offset` | Query | Integer | No | `0` | Pagination offset |
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "33cc4455-6677-8899-aabb-ccddeeff0011",
          "title": "Warning Letter - Attendance Irregularity",
          "status": "published",
          "display_status": "active",
          "is_actionable": true,
          "proposed_by": "b1234567-89ab-cdef-0123-456789abcdef",
          "approved_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
          "actioned_at": "2026-09-23T10:15:00.000Z",
          "recipient_count": 1,
          "created_at": "2026-09-23T09:00:00.000Z"
        }
      ]
    }
  }
  ```

---

### 68. GET /api/v1/documents/manager/org-documents/:id
* **API Name / Purpose:** Detail of Own Proposal
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Inspects full metadata and approval/rejection notes for a proposal authored by the manager.
* **Backend Processing Flow:** Asserts `proposed_by === actorUserId`. Probing any other manager's proposal collapses to **uniform `404 DOCUMENT_NOT_FOUND`**.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "33cc4455-6677-8899-aabb-ccddeeff0011",
      "org_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "title": "Warning Letter - Attendance Irregularity",
      "status": "rejected",
      "display_status": "rejected",
      "is_actionable": false,
      "proposed_by": "b1234567-89ab-cdef-0123-456789abcdef",
      "approved_by": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "actioned_at": "2026-09-23T11:15:00.000Z",
      "rejection_reason": "Insufficient documentation provided regarding previous verbal warnings.",
      "created_at": "2026-09-23T09:00:00.000Z"
    }
  }
  ```

---

### 69. GET /api/v1/documents/manager/org-documents/:id/view-url
* **API Name / Purpose:** Pre-signed View URL for Proposal
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/:id/view-url`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Allows the authoring manager to view the uploaded proposal file.
* **Backend Processing Flow:** Validates manager ownership. Returns pre-signed S3 GET URL or reference URL. Detached audit `org_document.viewed`.
* **Success Response Structure (200 OK):** Identical structure to API #57.

---

## 4. Employee Self-Service APIs — "My HR Documents" (APIs #70–#72)

### 70. GET /api/v1/documents/me/hr-documents
* **API Name / Purpose:** List Documents Issued to Me
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user (Employee, Manager, HR).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employees need an inbox to view policies, letters, and handbooks officially issued to them, tracking their compliance obligations.
* **Why the API Exists:** Provides the read-side composer (D-2) joining the employee's recipient obligation with the organization document.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `state` | Query | String / Array | No | None | Filter by recipient state (`pending`, `viewed`, `acknowledged`, `signed`, `waived`) |
  | `type_id` | Query | UUIDv4 | No | None | Filter by document type ID |
  | `requires_acknowledgement`| Query | Boolean | No | None | Filter documents requiring acknowledgement |
  | `limit` | Query | Integer | No | `25` | 1 to 100 rows per page |
  | `offset` | Query | Integer | No | `0` | Pagination offset |
* **Backend Processing Flow:**
  1. Validates query against `listQuerySchema`.
  2. Queries `org_document_recipients` where `org_id = :orgId AND user_id = :actorId`.
  3. Inner joins `org_documents` filtered by `status IN ('published', 'superseded', 'retired')` (drafts and rejected documents are strictly excluded).
  4. Projects only safe recipient columns (`RECIPIENT_ATTRIBUTES`) and document attributes (`EMPLOYEE_DOC_ATTRIBUTES`).
  5. Strips internal fields (`storage_key`, `reference_url`, targeting details, counts, creator IDs).
  6. Calculates `display_status` and `is_actionable = (status === 'published' && display_status === 'active' && state not in ['acknowledged', 'signed', 'waived'])`.
* **Database Impact:** Read-only index scan on `(org_id, user_id, state)`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "44bb5566-7788-9900-aabb-ccddeeff0011",
          "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
          "state": "pending",
          "source": "publish",
          "first_viewed_at": null,
          "due_on": "2026-10-07",
          "document": {
            "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
            "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
            "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
            "version": 2,
            "title": "Remote Work Policy 2026 (Updated)",
            "description": "Amended home office stipend and eligibility criteria.",
            "status": "published",
            "display_status": "active",
            "is_actionable": true,
            "effective_from": "2026-11-01",
            "effective_to": null,
            "requires_acknowledgement": true,
            "acknowledgement_due_days": 14,
            "requires_signature": false,
            "is_confidential": false,
            "storage_backend": "s3",
            "file_name": "remote_work_policy_2026.pdf",
            "content_type": "application/pdf",
            "size_bytes": 1048576,
            "published_at": "2026-09-23T10:15:00.000Z"
          }
        }
      ]
    }
  }
  ```

---

### 71. GET /api/v1/documents/me/hr-documents/:id
* **API Name / Purpose:** My Issued Document Detail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents/:id`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employee opens a specific issued policy or letter to inspect requirements and details.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Document ID (`org_document_id`) |
* **Backend Processing Flow:**
  1. Validates `id` parameter.
  2. Queries `org_document_recipients` for `org_id`, `user_id = actorId`, and `org_document_id = id`.
  3. Joins `org_documents` asserting `status IN ('published', 'superseded', 'retired')`.
  4. If caller is not a recipient, or if document does not exist or is a draft, **returns uniform `404 DOCUMENT_NOT_FOUND`**.
  5. Formats response with `display_status` and `is_actionable`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "44bb5566-7788-9900-aabb-ccddeeff0011",
      "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "state": "pending",
      "source": "publish",
      "first_viewed_at": null,
      "due_on": "2026-10-07",
      "document": {
        "id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "document_group_id": "e6a1f81d-6523-455b-b99a-41d7ca0a12e8",
        "version": 2,
        "title": "Remote Work Policy 2026 (Updated)",
        "description": "Amended home office stipend and eligibility criteria.",
        "status": "published",
        "display_status": "active",
        "is_actionable": true,
        "effective_from": "2026-11-01",
        "effective_to": null,
        "requires_acknowledgement": true,
        "acknowledgement_due_days": 14,
        "requires_signature": false,
        "is_confidential": false,
        "storage_backend": "s3",
        "file_name": "remote_work_policy_2026.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1048576,
        "published_at": "2026-09-23T10:15:00.000Z"
      }
    }
  }
  ```
* **Exact Error Responses:**
  - **404 Not Found — Probing Document Not Issued to Caller:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```

---

### 72. GET /api/v1/documents/me/hr-documents/:id/view-url
* **API Name / Purpose:** View Issued Document & Flip State to Viewed
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents/:id/view-url`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** Any authenticated tenant user.
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Generates a pre-signed S3 download URL for an employee to read a policy, while automatically and reliably capturing the compliance timestamp (`pending` $\rightarrow$ `viewed`).
* **Why the API Exists:** Couples view URL generation with the auditable `viewed` recipient state transition (F-8b).
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | None | Document ID |
  | `disposition` | Query | String | No | `'inline'` | `'inline'` or `'attachment'` |
* **Backend Processing Flow:**
  1. Validates `id` and query against `viewUrlQuerySchema`.
  2. Loads document through `_loadForRead({ audience: 'self' })`.
  3. Verifies caller has an active recipient row for this document. Uniform `404` if not a recipient.
  4. Generates pre-signed S3 GET URL or retrieves reference URL.
  5. **F-8b State Transition:** Calls `recipientService.markViewed(orgId, docId, actorId)`.
     - Executes atomic SQL update: `UPDATE org_document_recipients SET state = 'viewed', first_viewed_at = now() WHERE id = :recId AND org_id = :orgId AND state = 'pending'`.
     - If row was already `viewed`, `acknowledged`, `signed`, or `waived`, the update affects 0 rows and leaves existing state untouched (never regresses).
  6. Emits detached audit log `org_document.viewed`.
  7. Returns pre-signed URL and file metadata.
* **Database Impact:** Updates `org_document_recipients` (`state = 'viewed'`, `first_viewed_at = now()`); inserts 1 row into `document_audit_logs`.
* **File/Storage Impact:** Generates pre-signed AWS S3 cryptographic GET URL.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "view_url": "https://s3.ap-south-1.amazonaws.com/tenant-docs/org/9b1deb4d.../18cfdf09...?X-Amz-Signature=...",
      "expires_at": "2026-09-23T11:45:00.000Z",
      "file_name": "remote_work_policy_2026.pdf",
      "content_type": "application/pdf"
    }
  }
  ```
* **Exact Error Responses:**
  - **404 Not Found — Not a Recipient:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **503 Service Unavailable — S3 Unreachable:**
    ```json
    {
      "success": false,
      "message": "document storage is not available",
      "errorCode": "DOCUMENT_STORAGE_UNAVAILABLE"
    }
    ```

---

# Phase 3: Compliance, Acknowledgements & Digital Signatures (APIs #73–#79)
## 2. Employee Self-Service Compliance APIs (APIs #73–#75)

### 73. POST /api/v1/documents/me/hr-documents/:id/acknowledge
* **API Name / Purpose:** Acknowledge Org-Issued Document
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents/:id/acknowledge`
* **Authentication / Authorization:** Bearer Token. Self-plane authenticated org member.
* **Required Roles:** Any active employee role (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employees must acknowledge statutory policies (e.g. POSH, IT Security, Code of Conduct) to ensure organizational legal compliance, generating an unalterable proof of notice.
* **Why the API Exists:** Records immutable forensic evidence of compliance tied to the specific version and checksum of the policy document served.
* **Real-World Usage:** An employee opens the "Employee Handbook 2026" on their self-service dashboard, reads it, and clicks "I Acknowledge Having Read & Understood".
* **Request JSON Payload:**
  ```json
  {
    "confirm": true
  }
  ```
  *(Note: Request body is optional. An empty body `{}` is valid. If provided, `confirm` must be boolean `true`).*
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | None | Must be a valid UUIDv4 | ID of the published org document |
  | `confirm` | Body | Boolean | No | `true` | Must be `true` if provided | Explicit confirmation flag |
* **Backend Processing Flow:**
  1. Validates path parameter `id` as UUIDv4 and body against `acknowledgeBodySchema`.
  2. Extracts context: `orgId`, `actorId`, `ipAddress`, `userAgent` (from headers), `requestId`.
  3. Pre-transaction screening outside transaction:
     - Fetches document row via `orgRepo.findById(orgId, id)`. Returns `404 DOCUMENT_NOT_FOUND` if missing.
     - Fetches document type. Screen via `screenOrgDocument` and `resolveOrgDocumentAuthority`. Denies with `404 DOCUMENT_NOT_FOUND` if caller is not an assigned recipient or document is not published.
     - Asserts `row.requires_acknowledgement === true` (`422 ACKNOWLEDGEMENT_NOT_REQUIRED`).
     - Asserts `resolveOrgDisplayStatus(row, todayIst) === 'active'` (`409 ORG_DOCUMENT_NOT_ACTIONABLE`).
  4. Begins database transaction.
  5. Acquires `FOR SHARE` lock on `org_documents` row.
  6. Acquires `FOR UPDATE` lock on caller's `org_document_recipients` row.
  7. Re-reads recipient status under lock:
     - If `rec.state === 'waived'`: Throws `409 RECIPIENT_WAIVED`.
     - If `rec.state === 'acknowledged'` or `rec.state === 'signed'`: Queries existing evidence row, commits transaction, and returns HTTP 200 with `already_acknowledged: true`.
  8. Inserts new record into `document_acknowledgements` with `document_version = doc.version`, `content_checksum = doc.checksum_sha256 || null`, `ip_address`, `user_agent` (truncated to 512 chars), `request_id`, and `acknowledged_at = now()`.
  9. Updates recipient row: transitions `state` to `'acknowledged'`, backfills `first_viewed_at = now()` if previously null.
  10. Records in-transaction audit log: `action = 'org_document.acknowledged'`, entity `org_document`.
  11. Commits transaction and returns HTTP 201 Created.
* **Database Impact:**
  - Inserts 1 row into `document_acknowledgements`.
  - Updates 1 row in `org_document_recipients` (`state = 'acknowledged'`, `first_viewed_at`).
  - Inserts 1 row into `document_audit_logs`.
* **File/Storage Impact:** Read-only against database metadata. Zero interaction with S3 storage.
* **Concurrency & Lock Behavior:**
  - Row-level `FOR SHARE` on `org_documents` prevents version replacement/supersession mid-acknowledgement.
  - Row-level `FOR UPDATE` on `org_document_recipients` serializes individual employee actions.
  - Unique constraint `document_acknowledgements_org_doc_user_ver_unique_idx` handles concurrent double-submits by falling back to idempotent 200 replay.
* **Success Response Structure (201 Created — First Write):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "already_acknowledged": false,
      "acknowledgement": {
        "id": "c8a4b679-8a3c-4e89-9a2d-5b3e2a1f0d9c",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "acknowledged_at": "2026-09-24T06:15:00.000Z",
        "ip_address": "192.168.1.100"
      },
      "recipient_state": "acknowledged"
    }
  }
  ```
* **Success Response Structure (200 OK — Idempotent Replay):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "already_acknowledged": true,
      "acknowledgement": {
        "id": "c8a4b679-8a3c-4e89-9a2d-5b3e2a1f0d9c",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "acknowledged_at": "2026-09-24T06:15:00.000Z",
        "ip_address": "192.168.1.100"
      },
      "recipient_state": "acknowledged"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates whether the request succeeded (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.already_acknowledged` | Boolean | No | `false` on initial write; `true` on duplicate/retry replay |
  | `data.acknowledgement.id` | UUID | No | Unique identifier of the recorded evidence entry |
  | `data.acknowledgement.org_document_id` | UUID | No | ID of the acknowledged org document version |
  | `data.acknowledgement.user_id` | UUID | No | User ID of the acknowledging employee |
  | `data.acknowledgement.document_version` | Integer | No | Exact version number of the document when acknowledged |
  | `data.acknowledgement.content_checksum` | String | Yes | SHA-256 hash of document binary (`null` for reference/multipart) |
  | `data.acknowledgement.acknowledged_at` | String (ISO) | No | Exact UTC timestamp when acknowledgement was registered |
  | `data.acknowledgement.ip_address` | String | Yes | IPv4 or IPv6 address of caller |
  | `data.recipient_state` | String | No | Updated recipient status (`'acknowledged'` or `'signed'`) |
* **Exact Error Responses:**
  - **404 Not Found — Uniform Denial (K-1):**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    *Trigger:* Document does not exist, belongs to another tenant, document is unpublished/draft, or caller is not in the assigned recipient audience.
  - **422 Unprocessable Entity — Not Required:**
    ```json
    {
      "success": false,
      "message": "This document does not require acknowledgement",
      "errorCode": "ACKNOWLEDGEMENT_NOT_REQUIRED"
    }
    ```
    *Trigger:* Document type/record has `requires_acknowledgement = false`.
  - **409 Conflict — Document Not Actionable:**
    ```json
    {
      "success": false,
      "message": "This document is no longer actionable",
      "errorCode": "ORG_DOCUMENT_NOT_ACTIONABLE",
      "details": {
        "display_status": "expired"
      }
    }
    ```
    *Trigger:* Document has passed its `effective_to` window and is expired.
  - **409 Conflict — Recipient Waived:**
    ```json
    {
      "success": false,
      "message": "This document has been waived for you",
      "errorCode": "RECIPIENT_WAIVED",
      "details": {
        "state": "waived"
      }
    }
    ```
    *Trigger:* Recipient was previously excused from this document by HR.
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"confirm\" must be [true]",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing `confirm: false` or arbitrary client properties.

---

### 74. POST /api/v1/documents/me/hr-documents/:id/sign
* **API Name / Purpose:** Typed-Sign Org-Issued Document
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents/:id/sign`
* **Authentication / Authorization:** Bearer Token. Self-plane authenticated org member.
* **Required Roles:** Any active employee role (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Certain legal notices, offer agreements, or disciplinary letters require an individual digital signature acknowledgment rather than a simple confirmation checkbox.
* **Why the API Exists:** Provides legally defensible, internally verified typed e-signatures matched against employee profile records.
* **Real-World Usage:** An employee opens an "Appointment Letter Addendum", types their legal name "Asha Rao" into the signature field, and submits.
* **Request JSON Payload:**
  ```json
  {
    "signer_name": "Asha Rao"
  }
  ```
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | None | Must be a valid UUIDv4 | ID of the published org document |
  | `signer_name` | Body | String | Yes | None | 2 to 150 characters, trimmed | Full name typed by the signer |
* **Backend Processing Flow:**
  1. Validates path parameter `id` as UUIDv4 and request body against `signBodySchema` (trims string, asserts 2–150 characters).
  2. Executes pre-transaction screening:
     - Validates document existence, tenant scope, and caller recipient status. Returns `404 DOCUMENT_NOT_FOUND` if denied.
     - Asserts `row.requires_signature === true` (`422 SIGNATURE_NOT_REQUIRED`).
     - Asserts `resolveOrgDisplayStatus(row, todayIst) === 'active'` (`409 ORG_DOCUMENT_NOT_ACTIONABLE`).
  3. Pluggable Provider Gate (Pre-Transaction):
     - Loads tenant settings via `settingsService.getOrCreate(orgId)`. Resolves `provider` (default `'internal_typed'`).
     - Checks `isProviderAvailable(provider)`. If configured provider is `'docusign'` or `'adobe_sign'`, throws `503 SIGNATURE_PROVIDER_UNAVAILABLE` immediately. Zero DB transaction opened.
  4. Signer Name Verification (Pre-Transaction):
     - Reads signer's profile from `user_profiles` via raw SQL.
     - Verifies `signerNameMatches(signerName, profile)` against normalized `"first_name last_name"` and normalized `display_name`. If mismatch, throws `422 SIGNER_NAME_MISMATCH` with no details leaked.
  5. Begins database transaction.
  6. Acquires `FOR SHARE` lock on `org_documents` row and `FOR UPDATE` lock on `org_document_recipients` row.
  7. Re-reads recipient status under lock:
     - If `rec.state === 'waived'`: Throws `409 RECIPIENT_WAIVED`.
     - If `rec.state === 'signed'`: Queries existing signature row, commits transaction, and returns HTTP 200 with `already_signed: true`.
  8. Inserts record into `document_signature_requests`:
     - `provider = 'internal_typed'`, `status = 'signed'`.
     - `signer_name = signerName` (raw typed string, R-89).
     - `document_version = doc.version`, `content_checksum = doc.checksum_sha256 || null`.
     - `ip_address`, `user_agent` (truncated to 512 chars), `request_id`, `requested_at = now()`, `signed_at = now()`.
  9. Transitions recipient state to `'signed'` (`fromStates: ['pending', 'viewed', 'acknowledged']`). Backfills `first_viewed_at = now()` if null.
  10. Records in-transaction audit log: `action = 'org_document.signed'`. (*Note: `signer_name` is excluded from the audit payload to protect PII; the signature request ID is referenced instead*).
  11. Commits transaction and returns HTTP 201 Created.
* **Database Impact:**
  - Inserts 1 row into `document_signature_requests`.
  - Updates 1 row in `org_document_recipients` (`state = 'signed'`, `first_viewed_at`).
  - Inserts 1 row into `document_audit_logs`.
* **Success Response Structure (201 Created — First Write):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "already_signed": false,
      "signature": {
        "id": "e4f5a6b7-8c9d-4e0f-1a2b-3c4d5e6f7a8b",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "provider": "internal_typed",
        "status": "signed",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "signer_name": "Asha Rao",
        "requested_at": "2026-09-24T06:20:00.000Z",
        "signed_at": "2026-09-24T06:20:00.000Z",
        "ip_address": "192.168.1.100"
      },
      "recipient_state": "signed"
    }
  }
  ```
* **Success Response Structure (200 OK — Idempotent Replay):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "already_signed": true,
      "signature": {
        "id": "e4f5a6b7-8c9d-4e0f-1a2b-3c4d5e6f7a8b",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "provider": "internal_typed",
        "status": "signed",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "signer_name": "Asha Rao",
        "requested_at": "2026-09-24T06:20:00.000Z",
        "signed_at": "2026-09-24T06:20:00.000Z",
        "ip_address": "192.168.1.100"
      },
      "recipient_state": "signed"
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.already_signed` | Boolean | No | `false` on initial signature; `true` on duplicate/retry replay |
  | `data.signature.id` | UUID | No | Unique identifier of signature evidence record |
  | `data.signature.org_document_id` | UUID | No | Associated org document version ID |
  | `data.signature.user_id` | UUID | No | User ID of signer |
  | `data.signature.provider` | String | No | Signature provider mechanism (`'internal_typed'`) |
  | `data.signature.status` | String | No | Signature status (`'signed'`) |
  | `data.signature.document_version` | Integer | No | Exact version number of document when signed |
  | `data.signature.content_checksum` | String | Yes | SHA-256 hash of document binary |
  | `data.signature.signer_name` | String | No | Exact name string typed by employee |
  | `data.signature.requested_at` | String (ISO) | No | UTC timestamp when signature request commenced |
  | `data.signature.signed_at` | String (ISO) | No | UTC timestamp when signature was recorded |
  | `data.signature.ip_address` | String | Yes | Client IP address |
  | `data.recipient_state` | String | No | Updated recipient status (`'signed'`) |
* **Exact Error Responses:**
  - **422 Unprocessable Entity — Signer Name Mismatch (R-88):**
    ```json
    {
      "success": false,
      "message": "The typed name does not match your profile",
      "errorCode": "SIGNER_NAME_MISMATCH"
    }
    ```
    *Trigger:* Typed string does not match employee's first+last name or display name under normalization.
  - **422 Unprocessable Entity — Signature Not Required:**
    ```json
    {
      "success": false,
      "message": "This document does not require a signature",
      "errorCode": "SIGNATURE_NOT_REQUIRED"
    }
    ```
    *Trigger:* Document type/record has `requires_signature = false`.
  - **503 Service Unavailable — Provider Unavailable (EC-33):**
    ```json
    {
      "success": false,
      "message": "The configured signature provider is not available",
      "errorCode": "SIGNATURE_PROVIDER_UNAVAILABLE",
      "details": {
        "provider": "docusign"
      }
    }
    ```
    *Trigger:* Organization settings configured for external provider stub.
  - **404 Not Found — Uniform Denial:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Recipient Waived:**
    ```json
    {
      "success": false,
      "message": "This document has been waived for you",
      "errorCode": "RECIPIENT_WAIVED",
      "details": {
        "state": "waived"
      }
    }
    ```

---

### 75. GET /api/v1/documents/me/hr-documents/:id/acknowledgement
* **API Name / Purpose:** Get My Compliance Receipt for Document
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents/:id/acknowledgement`
* **Authentication / Authorization:** Bearer Token. Self-plane authenticated org member.
* **Required Roles:** Any active employee role (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employees need to view their proof of compliance, verifying when they signed or acknowledged a specific company policy.
* **Why the API Exists:** Provides a self-service legal receipt showing timestamp, version, and checksum without exposing administrative logs.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | Target org document version ID |
* **Backend Processing Flow:**
  1. Validates path parameter `id` as UUIDv4.
  2. Executes `_screen` with `action: 'view'`. Asserts caller is an assigned recipient. Denies with `404 DOCUMENT_NOT_FOUND` if not found or unauthorized.
  3. Queries `ackRepo.findForOrgDocument(orgId, docId, actorId)` and `signatureRepo.findForOrgDocument(orgId, docId, actorId)`.
  4. If both return null, throws `404 DOCUMENT_NOT_FOUND` with message `"No acknowledgement or signature found"`.
  5. Returns sanitized client representations of acknowledgement and signature evidence.
* **Database Impact:** Read-only (SELECT queries against `document_acknowledgements` and `document_signature_requests`).
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "document_version": 1,
      "acknowledgement": {
        "id": "c8a4b679-8a3c-4e89-9a2d-5b3e2a1f0d9c",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "acknowledged_at": "2026-09-24T06:15:00.000Z",
        "ip_address": "192.168.1.100"
      },
      "signature": null
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.org_document_id` | UUID | No | Document version ID |
  | `data.user_id` | UUID | No | Employee User ID |
  | `data.document_version` | Integer | No | Active version number of the document |
  | `data.acknowledgement` | Object | Yes | Acknowledgement evidence record, or `null` if not acknowledged |
  | `data.signature` | Object | Yes | Signature evidence record, or `null` if not signed |
* **Exact Error Responses:**
  - **404 Not Found — Uniform Denial:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    *Trigger:* Document missing, wrong tenant, or caller has no recorded acknowledgement or signature.

---

## 3. HR Administration & Legal Evidence APIs (APIs #76–#78)

### 76. GET /api/v1/documents/hr/org-documents/compliance
* **API Name / Purpose:** List Org-Wide Document Compliance Roster
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/compliance`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs an aggregated compliance dashboard showing which published policies have outstanding, overdue, or completed acknowledgements across the company.
* **Why the API Exists:** Provides real-time, organization-wide compliance metrics grouped by document.
* **Real-World Usage:** HR Directors monitor company-wide completion rates for the newly issued "2026 Anti-Bribery Policy".
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `type_id` | Query | UUIDv4 | No | None | Must be valid UUIDv4 | Filter by document type ID |
  | `document_id` | Query | UUIDv4 | No | None | Must be valid UUIDv4 | Filter by specific document ID |
  | `department_id`| Query | UUIDv4 | No | None | Matches `employee_profiles.department_id` | Filter by target department |
  | `overdue_only` | Query | Boolean | No | `false` | `true` or `false` | When `true`, returns only documents with overdue recipients |
  | `limit` | Query | Integer | No | `25` | 1 to 100 | Pagination page size |
  | `offset` | Query | Integer | No | `0` | $\ge 0$ | Pagination offset |
* **Backend Processing Flow:**
  1. Validates query parameters via `complianceQuerySchema` inside the controller (Express 5 safe).
  2. Resolves single `today_IST` date string.
  3. Executes `recipientRepo.complianceByDocument(orgId, options)`:
     - Scopes exclusively to `d.status = 'published'` and obligation-bearing documents (`requires_acknowledgement = true OR requires_signature = true`).
     - Aggregates recipient counts: `total`, `completed`, `waived`, `overdue` (evaluated via partial index criteria `due_on < today_IST`).
     - Computes derived `pending = total - completed - waived - overdue` to guarantee all buckets sum perfectly to `total`.
     - Calculates `completion_rate = Math.round((completed / total) * 1000) / 10`.
  4. Returns paginated document entries with temporal metadata (`as_of: today_IST`).
* **Database Impact:** Read-only (Grouped aggregate query using `org_document_recipients_org_due_idx`).
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "as_of": "2026-09-24",
      "rows": [
        {
          "document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
          "title": "Annual Leave Policy 2026",
          "version": 1,
          "document_type_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
          "type": {
            "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
            "code": "leave_policy",
            "name": "Leave Policy"
          },
          "published_at": "2026-09-23T10:15:00.000Z",
          "requires_acknowledgement": true,
          "requires_signature": false,
          "total": 50,
          "completed": 35,
          "pending": 10,
          "overdue": 3,
          "waived": 2,
          "completion_rate": 70.0
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.total` | Integer | No | Total count of obligation-bearing documents matching filters |
  | `data.as_of` | String | No | IST date (`YYYY-MM-DD`) against which compliance was judged |
  | `data.rows[].document_id` | UUID | No | Org document primary key |
  | `data.rows[].title` | String | No | Document title |
  | `data.rows[].version` | Integer | No | Active version number |
  | `data.rows[].document_type_id` | UUID | No | Document type foreign key (mirrors `type.id`) |
  | `data.rows[].type` | Object | Yes | Document type descriptor (`id`, `code`, `name`) |
  | `data.rows[].published_at` | String (ISO) | No | Timestamp of publication |
  | `data.rows[].total` | Integer | No | Total recipients targeted |
  | `data.rows[].completed` | Integer | No | Recipients who acknowledged or signed |
  | `data.rows[].pending` | Integer | No | Recipients pending within their allowed deadline |
  | `data.rows[].overdue` | Integer | No | Recipients whose deadline expired without completion |
  | `data.rows[].waived` | Integer | No | Recipients administratively excused |
  | `data.rows[].completion_rate` | Number | No | Percentage completed (0.0 to 100.0) |
* **Exact Error Responses:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"limit\" must be less than or equal to 100",
      "errorCode": "VALIDATION_ERROR"
    }
    ```

---

### 77. GET /api/v1/documents/hr/org-documents/compliance/export
* **API Name / Purpose:** Export Compliance Report to CSV
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/compliance/export`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** External compliance audits, ISO audits, and statutory reviews require downloadable spreadsheet evidence of policy distribution and acknowledgements.
* **Why the API Exists:** Streams full-fidelity recipient compliance rosters with forensic timestamps directly into CSV.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `type_id` | Query | UUIDv4 | No | None | Valid UUIDv4 | Filter by document type ID |
  | `document_id` | Query | UUIDv4 | No | None | Valid UUIDv4 | Filter by document ID |
  | `department_id`| Query | UUIDv4 | No | None | Valid UUIDv4 | Filter by department ID |
  | `overdue_only` | Query | Boolean | No | `false` | `true` or `false` | When `true`, exports only overdue recipient rows |
* **Backend Processing Flow:**
  1. Validates query parameters against `complianceExportQuerySchema` (no `limit`/`offset` permitted).
  2. Resolves single `today_IST` date string.
  3. Pre-stream row count check:
     - Executes `recipientRepo.countComplianceRows(orgId, scope)`.
     - If `count > COMPLIANCE_EXPORT_MAX_ROWS (50000)`, throws `422 EXPORT_TOO_LARGE` before any headers are sent, preserving central JSON error handling.
  4. Initializes CSV writer with 16 standardized columns and UTF-8 Byte Order Mark (`\uFEFF`) to ensure Microsoft Excel correctly parses UTF-8 encoding.
  5. Batches database reads in chunks of 1,000 rows (`PAGE = 1000`) to cap Node.js process memory.
  6. Applies CSV Formula-Injection Protection: If any text cell begins with `=`, `+`, `-`, `@`, `\t`, or `\r`, prepends an apostrophe `'` so Excel treats it as literal text.
  7. Sets HTTP download headers via `buildDownloadHeaders`:
     - `Content-Type: text/csv; charset=utf-8`
     - `Content-Disposition: attachment; filename="document-compliance-YYYY-MM-DD.csv"`
     - `Content-Length: [byteLength]`
  8. Sends payload via `res.status(200).end(body)`.
  9. Records detached audit log `org_document.compliance_exported` with `row_count` and applied filters (contains no employee PII).
* **Database Impact:** Read-only on recipient and evidence tables. Inserts 1 row into `document_audit_logs`.
* **Success Response Structure (200 OK — Raw CSV Download):**
  ```csv
  document_id,document_title,document_version,employee_code,user_id,state,compliance_state,due_on,days_remaining,first_viewed_at,acknowledged_at,acknowledged_version,signed_at,signer_provider,waived_at,waived_reason
  18cfdf09-5a5c-44b4-a28a-6b825daae6c1,Annual Leave Policy 2026,1,EMP-001,a24f0c92-3e2b-4d5c-9c7a-112233445566,acknowledged,completed,2026-10-07,13,2026-09-24T06:10:00.000Z,2026-09-24T06:15:00.000Z,1,,,,
  18cfdf09-5a5c-44b4-a28a-6b825daae6c1,Annual Leave Policy 2026,1,EMP-002,b35a1d03-4f3c-5e6d-0d8b-223344556677,pending,overdue,2026-09-20,-4,2026-09-21T08:00:00.000Z,,,,,,
  ```
* **Exact Error Responses:**
  - **422 Unprocessable Entity — Export Set Too Large:**
    ```json
    {
      "success": false,
      "message": "This export matches too many rows. Narrow the filters and try again.",
      "errorCode": "EXPORT_TOO_LARGE",
      "details": {
        "row_count": 62450,
        "max_rows": 50000
      }
    }
    ```

---

### 78. GET /api/v1/documents/hr/org-documents/:id/acknowledgements/:userId
* **API Name / Purpose:** Get Single Employee Evidence Record (HR Legal Readout)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/acknowledgements/:userId`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** In legal proceedings, labor dispute tribunals, or statutory inspections, HR must produce concrete proof that a specific employee received, viewed, and acknowledged/signed a document.
* **Why the API Exists:** Provides an authoritative administrative forensic readout of an individual employee's compliance record.
* **Real-World Usage:** Legal counsel requests proof of notice for a terminated employee regarding the corporate Disciplinary Policy.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `id` | Path | UUIDv4 | Yes | ID of the target org document |
  | `userId` | Path | UUIDv4 | Yes | ID of the specific employee whose evidence is being examined |
* **Backend Processing Flow:**
  1. Validates `id` and `userId` as valid UUIDv4 strings.
  2. Queries `org_documents` where `id = :id` and `org_id = :orgId`. Returns `404 DOCUMENT_NOT_FOUND` if absent.
  3. Queries `org_document_recipients` where `org_document_id = :id` and `user_id = :userId`. Returns `404 RECIPIENT_NOT_FOUND` if employee was not a recipient.
  4. Parallel queries `document_acknowledgements` and `document_signature_requests`.
  5. If both return null, throws `404 DOCUMENT_NOT_FOUND` with message `"No acknowledgement or signature found"`.
  6. Redacts internal forensic column `user_agent` to protect client hardware details while exposing IP address, checksum, and timestamps.
  7. Returns formatted legal evidence record.
* **Database Impact:** Read-only.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
      "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
      "document_version": 1,
      "recipient_state": "signed",
      "acknowledgement": {
        "id": "c8a4b679-8a3c-4e89-9a2d-5b3e2a1f0d9c",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "acknowledged_at": "2026-09-24T06:15:00.000Z",
        "ip_address": "192.168.1.100"
      },
      "signature": {
        "id": "e4f5a6b7-8c9d-4e0f-1a2b-3c4d5e6f7a8b",
        "org_document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
        "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
        "provider": "internal_typed",
        "status": "signed",
        "document_version": 1,
        "content_checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "signer_name": "Asha Rao",
        "requested_at": "2026-09-24T06:20:00.000Z",
        "signed_at": "2026-09-24T06:20:00.000Z",
        "ip_address": "192.168.1.100"
      }
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.org_document_id` | UUID | No | Document version ID |
  | `data.user_id` | UUID | No | Employee User ID |
  | `data.document_version` | Integer | No | Document version evaluated |
  | `data.recipient_state` | String | No | Current lifecycle status of recipient (`'acknowledged'`, `'signed'`, `'waived'`) |
  | `data.acknowledgement` | Object | Yes | Complete acknowledgement forensic record |
  | `data.signature` | Object | Yes | Complete signature forensic record |
* **Exact Error Responses:**
  - **404 Not Found — Recipient Not Found:**
    ```json
    {
      "success": false,
      "message": "Recipient not found",
      "errorCode": "RECIPIENT_NOT_FOUND"
    }
    ```
    *Trigger:* Named user is not on the recipient roster for this document.
  - **404 Not Found — No Evidence:**
    ```json
    {
      "success": false,
      "message": "No acknowledgement or signature found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    *Trigger:* Recipient exists on roster, but has not acknowledged or signed yet.

---

## 4. Manager Tier-A Team Compliance APIs (API #79)

### 79. GET /api/v1/documents/manager/org-documents/compliance
* **API Name / Purpose:** List Team Document Compliance (Manager Tier-A Roster)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/org-documents/compliance`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `manager`, `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** People managers must track policy compliance across their direct reports to ensure team operational readiness without having access to company-wide or confidential personnel records.
* **Why the API Exists:** Provides a scoped, employee-grouped compliance readout strictly bounded by reporting hierarchy.
* **Real-World Usage:** Engineering Managers check which of their direct-report engineers have not yet acknowledged the new "Remote Work Security Guidelines".
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `user_id` | Query | UUIDv4 | No | None | Must be a direct report | Narrows readout to a specific team member |
  | `document_id` | Query | UUIDv4 | No | None | Valid UUIDv4 | Filter by specific document ID |
  | `overdue_only` | Query | Boolean | No | `false` | `true` or `false` | When `true`, includes only team members with overdue items |
  | `limit` | Query | Integer | No | `25` | 1 to 100 | Employee pagination limit |
  | `offset` | Query | Integer | No | `0` | $\ge 0$ | Employee pagination offset |
* **Backend Processing Flow:**
  1. Validates query parameters against `complianceQuerySchema`.
  2. Resolves manager's team scope via `hierarchyAccess.getAccessibleUserIds(orgId, req.user)`.
  3. Verifies organizational setting: `settings.manager_can_view_team_documents === true`. If false, returns `403 FORBIDDEN`.
  4. Scoping & Privacy Enforcement:
     - If manager manages 0 employees (`accessibleUserIds = []`), immediately returns empty `{ total: 0, as_of, rows: [] }`.
     - If `user_id` query param is provided but is NOT in `accessibleUserIds`, returns empty `{ total: 0, as_of, rows: [] }` (avoids revealing employee existence).
     - **Confidentiality Exclusion (F-18):** Unconditionally sets `excludeConfidential: true`. Joins `document_types` and filters `d.is_confidential = false AND t.is_confidential = false`. Managers can never discover confidential documents served to their reports.
  5. Two-Stage SQL Pagination:
     - Stage 1: Paginates the *employees* (`complianceUserPage`) matching criteria in SQL.
     - Stage 2: Fetches recipient rows for exactly those paged employees (capped at 50 documents per employee).
  6. Groups recipient rows by employee, calculating `pending_count` and `overdue_count`.
  7. Formats employee name: prioritizes `user_profiles.display_name`; falls back to `"first_name last_name"`.
  8. Returns grouped team compliance roster.
* **Database Impact:** Read-only (Scoped SQL queries on `org_document_recipients` joined to `org_documents` and `document_types`).
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "as_of": "2026-09-24",
      "rows": [
        {
          "user_id": "a24f0c92-3e2b-4d5c-9c7a-112233445566",
          "employee_code": "EMP-042",
          "display_name": "Asha Rao",
          "pending_count": 1,
          "overdue_count": 1,
          "documents": [
            {
              "document_id": "18cfdf09-5a5c-44b4-a28a-6b825daae6c1",
              "title": "Annual Leave Policy 2026",
              "version": 1,
              "state": "pending",
              "compliance_state": "pending",
              "due_on": "2026-10-07",
              "days_remaining": 13
            },
            {
              "document_id": "29dfdf09-6b6c-55b5-b39b-7b925daae7d2",
              "title": "IT Security Standards 2026",
              "version": 2,
              "state": "viewed",
              "compliance_state": "overdue",
              "due_on": "2026-09-20",
              "days_remaining": -4
            }
          ]
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response message (`"OK"`) |
  | `data.total` | Integer | No | Count of direct reports matching compliance query |
  | `data.as_of` | String | No | IST date against which overdue status was determined |
  | `data.rows[].user_id` | UUID | No | Direct report User ID |
  | `data.rows[].employee_code` | String | Yes | Organization employee identifier code |
  | `data.rows[].display_name` | String | Yes | Formatted name of employee |
  | `data.rows[].pending_count` | Integer | No | Count of documents currently pending within allowed deadline |
  | `data.rows[].overdue_count` | Integer | No | Count of documents currently past deadline |
  | `data.rows[].documents` | Array | No | List of actionable documents assigned to this employee |
  | `data.rows[].documents[].document_id` | UUID | No | Org document primary key |
  | `data.rows[].documents[].title` | String | No | Document title |
  | `data.rows[].documents[].version` | Integer | No | Document version |
  | `data.rows[].documents[].state` | String | No | Stored recipient state (`'pending'`, `'viewed'`, etc.) |
  | `data.rows[].documents[].compliance_state` | String | No | Derived compliance state (`'pending'`, `'overdue'`, `'completed'`) |
  | `data.rows[].documents[].due_on` | String | Yes | Date string (`YYYY-MM-DD`) deadline |
  | `data.rows[].documents[].days_remaining` | Integer | Yes | Days remaining until due (negative if overdue) |
* **Exact Error Responses:**
  - **403 Forbidden — Team Visibility Disabled:**
    ```json
    {
      "success": false,
      "message": "Team document access is disabled for this organization",
      "errorCode": "FORBIDDEN"
    }
    ```
    *Trigger:* Org setting `manager_can_view_team_documents` is set to `false`.
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "\"limit\" must be less than or equal to 100",
      "errorCode": "VALIDATION_ERROR"
    }
    ```

---

## 5. Existing Phase 1 & Phase 2 APIs Modified / Extended by Phase 3

### 5.1 Extended API #59: GET /api/v1/documents/hr/org-documents/:id/recipients
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/recipients`
* **Required Roles:** `hr`
* **Required Feature:** `documents.access`
* **Modifications Implemented in Phase 3:**
  1. **New Query Filter:** Added optional `compliance_state` query parameter supporting values: `'completed'`, `'waived'`, `'overdue'`, `'pending'`.
  2. **Batched Evidence Joins:** Roster rows are now batched and joined with `document_acknowledgements` and `document_signature_requests` by `(org_document_id, user_id)`.
  3. **Row-Level Compliance Fields Added:**
     - `compliance_state`: `'completed' | 'waived' | 'overdue' | 'pending'`
     - `is_overdue`: `boolean`
     - `days_remaining`: `integer | null`
     - `acknowledged_at`: `string (ISO) | null`
     - `acknowledgement_id`: `UUID | null`
     - `acknowledged_version`: `integer | null`
     - `signed_at`: `string (ISO) | null`
     - `signature_request_id`: `UUID | null`
  4. **Top-Level `compliance` Object Added:**
     ```json
     {
       "compliance": {
         "requires_acknowledgement": true,
         "requires_signature": false,
         "due_on_basis": "document",
         "total": 50,
         "completed": 35,
         "pending": 10,
         "overdue": 3,
         "waived": 2,
         "completion_rate": 70.0
       }
     }
     ```
     `due_on_basis` reflects whether deadline was derived from `'document'` attribute or fallback `'org_default'`.

---

### 5.2 Extended API #70: GET /api/v1/documents/me/hr-documents
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents`
* **Authentication:** Bearer token (Self-plane).
* **Modifications Implemented in Phase 3:**
  1. **New Query Filters:**
     - `compliance_state`: `'completed' | 'waived' | 'overdue' | 'pending'`
     - `overdue_only`: `boolean`
  2. **Next Action Calculation:** `row.document.next_action` dynamically returns `'sign' | 'acknowledge' | null` based on recipient status and document obligation (reconciling legacy `is_actionable` which remains status-only for backward compatibility).
  3. **Acknowledgement Block Added:** Each recipient row now includes the `acknowledgement` summary block:
     ```json
     {
       "acknowledgement": {
         "required": true,
         "signature_required": false,
         "state": "pending",
         "due_on": "2026-10-07",
         "days_remaining": 13,
         "is_overdue": false,
         "is_blocking": false,
         "acknowledged_at": null,
         "signed_at": null
       }
     }
     ```

---

### 5.3 Extended API #71: GET /api/v1/documents/me/hr-documents/:id
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/hr-documents/:id`
* **Authentication:** Bearer token (Self-plane).
* **Modifications Implemented in Phase 3:**
  - Enriched with the identical `document.next_action` field and `acknowledgement` object documented above for API #70.

---

### 5.4 Extended APIs #41 & #42: GET & PUT /api/v1/documents/hr/settings
* **HTTP Methods:** `GET` and `PUT`
* **Endpoints:** `/api/v1/documents/hr/settings`
* **Required Roles:** `hr`
* **Modifications Implemented in Phase 3:**
  1. **Three New Columns in `document_settings`:**
     - `document_acknowledgement_due_days`: Integer, default `7`, allowed range `1..365`.
     - `document_acknowledgement_blocking`: Boolean, default `false`.
     - `document_signature_provider`: String, default `'internal_typed'`, allowed values `['internal_typed', 'docusign', 'adobe_sign']`.
  2. **API #41 (GET):** Response `data` includes the 3 new fields.
  3. **API #42 (PUT):**
     - Accepts the 3 fields in request JSON payload.
     - Validates numeric range $1 \le \text{due\_days} \le 365$ via `assertCap` (rejects with `422 SETTING_OUT_OF_RANGE`).
     - Validates provider string against enum.
     - Updates columns in atomic transaction and records diff in `document_audit_logs`.

---

### 5.5 Publish & Sync Due-Date Fallback Interaction (APIs #47 & #60)
* **API #47:** `POST /api/v1/documents/hr/org-documents/:id/publish`
* **API #60:** `POST /api/v1/documents/hr/org-documents/:id/recipients/sync`
* **Phase 3 Behavior Change (S-13):**
  - Previously in Phase 2, if a draft had `acknowledgement_due_days: null`, published recipients received `due_on: null`.
  - In Phase 3, both publish and sync execute an in-transaction read of `document_settings`:
    ```javascript
    const dueDays = row.requires_acknowledgement
      ? (row.acknowledgement_due_days ?? settings.document_acknowledgement_due_days)
      : null;
    const dueOn = resolveDueOn(baseDate, dueDays);
    ```
  - This guarantees that any document marked `requires_acknowledgement: true` always receives a concrete `due_on` date, enabling active overdue tracking.

---

### 5.6 Waiver State Machine Transition Activation (API #61)
* **API #61:** `POST /api/v1/documents/hr/org-documents/:id/recipients/:userId/waive`
* **Phase 3 Behavior Change:**
  - In Phase 2, the error guard throwing `409 RECIPIENT_ALREADY_COMPLETED` when a recipient was `acknowledged` or `signed` existed in code but was unreachable because no endpoints produced those states.
  - With Phase 3 APIs #73 and #74 active, this guard is now fully operational in production.

---

# Phase 4: Requests, Checklists, Expiry Engine, Notification Outbox & Retention (APIs #80–#98)
## 2. HR Administration APIs (APIs #80–#92)

### 80. POST /api/v1/documents/hr/employees/:userId/document-requests

* **API Name / Purpose:** Raise Single Document Request
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/document-requests`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to formally task an employee with uploading a specific statutory or organizational document (e.g. Passport, Tax Certificate, Degree) by a strict deadline, establishing clear accountability.
* **Why the API Exists:** Provides an auditable mechanism to create tracked document requests, set turnaround deadlines, and automatically initiate employee notification workflows.
* **Real-World Usage:** During onboarding or visa renewal, HR requests an updated copy of an employee's passport, giving them 14 days to upload.
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userId` | UUIDv4 | Yes | ID of the target employee |
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "99999999-8888-7777-6666-555555555555",
    "due_on": "2026-10-15",
    "note": "Please ensure the scan includes all pages with entry stamps."
  }
  ```
* **Request Parameters & Body Schema:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | Body | UUIDv4 | Yes | None | Must be a valid UUIDv4 of an active document type in the tenant | Target document type |
  | `due_on` | Body | Date String | No | `today + default_due_days` | ISO `YYYY-MM-DD`. Must be $\ge \text{today\_IST}$ and $\le \text{today\_IST} + 365$ days | Due date |
  | `note` | Body | String | No | `null` | Maximum 1000 characters, nullable | Instructions for the employee |
* **Backend Processing Flow:**
  1. Validates path parameter `userId` as UUIDv4 and request body against `createSchema`.
  2. Extracts tenant context (`orgId`, `actorId`, `actorRole: 'hr'`, `ipAddress`, `requestId`).
  3. Verifies subject employee exists, is active, and is not deleted within the organization (`404 USER_NOT_FOUND`).
  4. Acquires advisory lock `docreq:{orgId}:{userId}:{document_type_id}` to prevent concurrent race conditions.
  5. Loads document type with `FOR SHARE` lock. Validates existence (`404 DOCUMENT_TYPE_NOT_FOUND`) and active status (`409 DOCUMENT_TYPE_INACTIVE`).
  6. Checks if an active document already exists in `available` or `pending_verification` status (`409 DOCUMENT_ALREADY_PRESENT`).
  7. Checks for existing open or overdue requests via partial unique index (`409 DUPLICATE_REQUEST`).
  8. Inserts new record into `document_requests` with `status: 'open'`, `requested_by_role: 'hr'`.
  9. Enqueues `document_request_raised` notice into `document_notifications` (gated on `document_notify_request_raised` toggle).
  10. Writes audit log entry: `action = 'document_request.created'`.
  11. Commits transaction, releases advisory lock, and returns HTTP `201 Created` with HR-plane serialized object.
* **Database Impact:**
  - Inserts 1 row into `document_requests`.
  - Conditionally inserts 1 row into `document_notifications`.
  - Inserts 1 row into `document_audit_logs`.
* **File/Storage Impact:** Pure database metadata operation; zero S3 interaction.
* **Concurrency & Lock Behavior:**
  - Advisory lock `docreq:{orgId}:{userId}:{typeId}` serializes concurrent request creations per user/type.
  - Partial unique index `document_requests_open_unique_idx` acts as secondary database-level duplicate barrier.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Request raised",
    "data": {
      "id": "11111111-2222-3333-4444-555555555555",
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "document_type_id": "99999999-8888-7777-6666-555555555555",
      "status": "open",
      "due_on": "2026-10-15",
      "days_until_due": 20,
      "note": "Please ensure the scan includes all pages with entry stamps.",
      "requested_by": "00000000-0000-0000-0000-000000000001",
      "requested_by_role": "hr",
      "fulfilled_document_id": null,
      "fulfilled_at": null,
      "cancelled_at": null,
      "cancel_reason": null,
      "created_at": "2026-09-25T06:00:00.000Z",
      "reminder_count": 0,
      "last_reminder_on": null
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates successful execution (`true`) |
  | `message` | String | No | Operation message (`"Request raised"`) |
  | `data.id` | UUID | No | Unique identifier of the created request |
  | `data.user_id` | UUID | No | Target employee ID |
  | `data.document_type_id` | UUID | No | Requested document type ID |
  | `data.status` | String | No | Current request state (`'open'`) |
  | `data.due_on` | String | No | Target due date in IST (`YYYY-MM-DD`) |
  | `data.days_until_due` | Integer | No | Dynamically derived remaining days until deadline |
  | `data.note` | String | Yes | Contextual instructions for the employee |
  | `data.requested_by` | UUID | No | User ID of the requesting HR administrator |
  | `data.requested_by_role` | String | No | Actor role at creation time (`'hr'`) |
  | `data.fulfilled_document_id` | UUID | Yes | ID of fulfilling employee document (`null` at creation) |
  | `data.fulfilled_at` | String (ISO) | Yes | Timestamp of fulfillment (`null` at creation) |
  | `data.cancelled_at` | String (ISO) | Yes | Timestamp of cancellation (`null` at creation) |
  | `data.cancel_reason` | String | Yes | Justification for cancellation (`null` at creation) |
  | `data.created_at` | String (ISO) | No | Timestamp of request creation |
  | `data.reminder_count` | Integer | No | Number of reminders sent so far (`0`) |
  | `data.last_reminder_on` | String | Yes | Date of last dispatched reminder (HR plane only) |
* **Exact Error Responses:**
  - **400 Bad Request — Validation Error:**
    ```json
    { "success": false, "message": "due_on must be greater than or equal to today", "errorCode": "VALIDATION_ERROR" }
    ```
  - **404 Not Found — User Missing:**
    ```json
    { "success": false, "message": "User not found", "errorCode": "USER_NOT_FOUND" }
    ```
  - **404 Not Found — Document Type Missing:**
    ```json
    { "success": false, "message": "Document type not found", "errorCode": "DOCUMENT_TYPE_NOT_FOUND" }
    ```
  - **409 Conflict — Document Type Inactive:**
    ```json
    { "success": false, "message": "Document type is inactive", "errorCode": "DOCUMENT_TYPE_INACTIVE" }
    ```
  - **409 Conflict — Document Already Present:**
    ```json
    { "success": false, "message": "Employee already possesses an active document of this type", "errorCode": "DOCUMENT_ALREADY_PRESENT" }
    ```
  - **409 Conflict — Duplicate Request:**
    ```json
    { "success": false, "message": "An active request for this document type already exists", "errorCode": "DUPLICATE_REQUEST" }
    ```

---

### 81. POST /api/v1/documents/hr/employees/:userId/document-requests/bulk-from-checklist

* **API Name / Purpose:** Bulk Raise Document Requests from Checklist
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/document-requests/bulk-from-checklist`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Manually identifying missing onboarding documents and issuing requests one by one is time-consuming and error-prone during high-volume hiring.
* **Why the API Exists:** Evaluates the employee's onboarding checklist and creates tracked document requests for all missing or expired items in a single atomic operation.
* **Real-World Usage:** HR reviews a newly hired engineer's profile, notices 3 missing compliance documents, and clicks "Request All Missing" to instantly task the employee.
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userId` | UUIDv4 | Yes | Target employee ID |
* **Request JSON Payload:** Empty body (`{}`).
* **Backend Processing Flow:**
  1. Validates path parameter `userId`.
  2. Confirms subject user is an active employee within the tenant.
  3. Computes `checklistService.forUser` to derive all required document items.
  4. Filters items where `state IN ('missing', 'expired')`, capped at 50 (`CHECKLIST_BULK_MAX`).
  5. If 0 candidates found, throws `409 NOTHING_TO_REQUEST`.
  6. Opens a single database transaction. Iterates candidates using database savepoints:
     - Attempts creation of each request.
     - Captures unique constraint collisions / duplicates and appends to `skipped: [{ document_type_id, reason: 'already_requested' }]`.
     - Appends successfully created rows to `created: [{ request_id, document_type_id }]`.
     - Enqueues notification outbox entry for each created request.
  7. Audits `document_request.created` for each created row.
  8. Commits transaction and returns HTTP `201 Created` with summary counts.
* **Database Impact:**
  - Inserts $N$ rows into `document_requests`.
  - Inserts up to $N$ rows into `document_notifications`.
  - Inserts $N$ rows into `document_audit_logs`.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Requests raised from checklist",
    "data": {
      "created": [
        { "request_id": "11111111-2222-3333-4444-555555555555", "document_type_id": "aaaaaaaa-1111-2222-3333-444444444444" },
        { "request_id": "22222222-3333-4444-5555-666666666666", "document_type_id": "bbbbbbbb-2222-3333-4444-555555555555" }
      ],
      "skipped": [
        { "document_type_id": "cccccccc-3333-4444-5555-666666666666", "reason": "already_requested" }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Indicates successful execution (`true`) |
  | `message` | String | No | Operation message |
  | `data.created` | Array | No | List of successfully created request records |
  | `data.created[].request_id` | UUID | No | ID of the created document request |
  | `data.created[].document_type_id` | UUID | No | ID of the associated document type |
  | `data.skipped` | Array | No | List of candidate items skipped due to existing requests |
  | `data.skipped[].document_type_id` | UUID | No | ID of the skipped document type |
  | `data.skipped[].reason` | String | No | Reason for skipping (`'already_requested'`) |
* **Exact Error Responses:**
  - **404 Not Found:** `{ "success": false, "message": "User not found", "errorCode": "USER_NOT_FOUND" }`
  - **409 Conflict:** `{ "success": false, "message": "No missing or expired checklist items eligible for request", "errorCode": "NOTHING_TO_REQUEST" }`

---

### 82. GET /api/v1/documents/hr/document-requests

* **API Name / Purpose:** List Org-Wide Document Requests
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/document-requests`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR administrators need total visibility across all document collection campaigns, tracking pending, overdue, and fulfilled requests company-wide.
* **Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `status` | String / Array | No | All | Filter by status (`'open'`, `'fulfilled'`, `'cancelled'`, `'overdue'`) |
  | `user_id` | UUIDv4 | No | None | Restrict to a specific employee |
  | `document_type_id` | UUIDv4 | No | None | Restrict to a specific document type |
  | `overdue_only` | Boolean | No | `false` | If `true`, filters strictly to past-due requests |
  | `page` | Integer | No | `1` | Page number (min 1) |
  | `limit` | Integer | No | `20` | Page size (1 to 100) |
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "11111111-2222-3333-4444-555555555555",
          "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "document_type_id": "99999999-8888-7777-6666-555555555555",
          "status": "open",
          "due_on": "2026-10-15",
          "days_until_due": 20,
          "note": "Please upload passport copy",
          "requested_by": "00000000-0000-0000-0000-000000000001",
          "requested_by_role": "hr",
          "fulfilled_document_id": null,
          "fulfilled_at": null,
          "cancelled_at": null,
          "cancel_reason": null,
          "created_at": "2026-09-25T06:00:00.000Z",
          "reminder_count": 0,
          "last_reminder_on": null
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Execution success status |
  | `message` | String | No | Response message |
  | `data.total` | Integer | No | Total matching rows across pagination |
  | `data.rows` | Array | No | Array of request objects formatted with HR plane attributes |

---

### 83. GET /api/v1/documents/hr/document-requests/:id

* **API Name / Purpose:** Get Single Document Request Detail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/document-requests/:id`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `id` | UUIDv4 | Yes | Request ID |
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "11111111-2222-3333-4444-555555555555",
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "document_type_id": "99999999-8888-7777-6666-555555555555",
      "status": "open",
      "due_on": "2026-10-15",
      "days_until_due": 20,
      "note": "Please upload passport copy",
      "requested_by": "00000000-0000-0000-0000-000000000001",
      "requested_by_role": "hr",
      "fulfilled_document_id": null,
      "fulfilled_at": null,
      "cancelled_at": null,
      "cancel_reason": null,
      "created_at": "2026-09-25T06:00:00.000Z",
      "reminder_count": 0,
      "last_reminder_on": null
    }
  }
  ```
* **Error Response:** `404 REQUEST_NOT_FOUND` if not found or outside caller's tenant.

---

### 84. POST /api/v1/documents/hr/document-requests/:id/cancel

* **API Name / Purpose:** Administratively Cancel Document Request
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/document-requests/:id/cancel`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `id` | UUIDv4 | Yes | Request ID |
* **Request JSON Payload:**
  ```json
  {
    "reason": "Exemption granted due to diplomatic passport status."
  }
  ```
* **Request Body Schema:**
  | Field | Location | Type | Required | Validation | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `reason` | Body | String | Yes | 1 to 500 characters | Mandatory justification for cancellation |
* **Backend Processing Flow:**
  1. Validates path parameter `id` and body against `cancelSchema`.
  2. Begins database transaction. Locks row `SELECT ... FOR UPDATE`.
  3. Returns `404 REQUEST_NOT_FOUND` if row does not exist or belongs to another tenant.
  4. If status is already `fulfilled` or `cancelled`, throws `409 REQUEST_NOT_OPEN`.
  5. Updates row: `status = 'cancelled'`, `cancelled_at = now()`, `cancelled_by = actorId`, `cancel_reason = reason`.
  6. Writes audit entry: `action = 'document_request.cancelled'`.
  7. Commits transaction and returns HTTP 200 with updated request object.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Request cancelled",
    "data": {
      "id": "11111111-2222-3333-4444-555555555555",
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "document_type_id": "99999999-8888-7777-6666-555555555555",
      "status": "cancelled",
      "due_on": "2026-10-15",
      "days_until_due": 20,
      "note": "Please upload passport copy",
      "requested_by": "00000000-0000-0000-0000-000000000001",
      "requested_by_role": "hr",
      "fulfilled_document_id": null,
      "fulfilled_at": null,
      "cancelled_at": "2026-09-25T06:45:00.000Z",
      "cancel_reason": "Exemption granted due to diplomatic passport status.",
      "created_at": "2026-09-25T06:00:00.000Z",
      "reminder_count": 0,
      "last_reminder_on": null
    }
  }
  ```
* **Exact Error Responses:**
  - **404 Not Found:** `{ "success": false, "message": "Request not found", "errorCode": "REQUEST_NOT_FOUND" }`
  - **409 Conflict:** `{ "success": false, "message": "Request is not open or overdue", "errorCode": "REQUEST_NOT_OPEN" }`

---

### 85. POST /api/v1/documents/hr/document-requests/:id/remind

* **API Name / Purpose:** Manually Resend Overdue Request Reminder
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/document-requests/:id/remind`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `id` | UUIDv4 | Yes | Request ID |
* **Request JSON Payload:** None (`{}`).
* **Backend Processing Flow & Watermark:**
  1. Validates request status is `open` or `overdue` (`409 REQUEST_NOT_OPEN`).
  2. Atomically attempts to claim today's watermark via single-statement SQL update (`claimReminderWatermark`):
     ```sql
     UPDATE document_requests
        SET last_reminder_on = :today, reminder_count = reminder_count + 1
      WHERE id = :id AND org_id = :orgId
        AND (last_reminder_on IS NULL OR last_reminder_on != :today)
        AND reminder_count < 5
     RETURNING *;
     ```
  3. If 0 rows updated (already reminded today or capped at 5, `DOCUMENT_REQUEST_MAX_REMINDERS`), returns HTTP 200 with `reminded: false, reason: "already_reminded_today"`.
  4. If claimed, enqueues `document_request_overdue` outbox notice and records audit log.
* **Success Response Structure (200 OK — Watermark Claimed):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "reminded": true,
      "request": {
        "id": "11111111-2222-3333-4444-555555555555",
        "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "document_type_id": "99999999-8888-7777-6666-555555555555",
        "status": "overdue",
        "due_on": "2026-09-20",
        "days_until_due": -5,
        "note": null,
        "requested_by": "00000000-0000-0000-0000-000000000001",
        "requested_by_role": "hr",
        "fulfilled_document_id": null,
        "fulfilled_at": null,
        "cancelled_at": null,
        "cancel_reason": null,
        "created_at": "2026-09-13T06:00:00.000Z",
        "reminder_count": 1,
        "last_reminder_on": "2026-09-25"
      }
    }
  }
  ```
* **Success Response Structure (200 OK — Watermark Skipped):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "reminded": false,
      "reason": "already_reminded_today",
      "request": {
        "id": "11111111-2222-3333-4444-555555555555",
        "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "document_type_id": "99999999-8888-7777-6666-555555555555",
        "status": "overdue",
        "due_on": "2026-09-20",
        "days_until_due": -5,
        "reminder_count": 1,
        "last_reminder_on": "2026-09-25"
      }
    }
  }
  ```

---

### 86. GET /api/v1/documents/hr/employees/:userId/checklist

* **API Name / Purpose:** Get Employee Onboarding Document Checklist
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/checklist`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userId` | UUIDv4 | Yes | Target employee ID |
* **Backend Processing Flow:**
  1. Validates subject employee exists and is active.
  2. If HR reads another employee (`userId !== req.user.id`), logs detached audit `document_checklist.viewed`.
  3. Resolves required document types by evaluating `mandatory_for` targeting against employee's profile.
  4. Classifies each checklist item using hierarchy: `expired` > `expiring` > `satisfied` > `pending_upload` > `requested` > `missing`.
  5. Computes completeness scorecard with 99% cap rule.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "completeness": {
        "required": 3,
        "satisfied": 2,
        "percent": 67,
        "threshold": 100,
        "meets_threshold": false
      },
      "items": [
        {
          "document_type_id": "99999999-8888-7777-6666-555555555555",
          "name": "Identity Proof",
          "is_statutory": true,
          "state": "satisfied",
          "document_id": "11111111-2222-3333-4444-555555555555",
          "expires_on": null,
          "days_until_expiry": null,
          "request_id": null
        },
        {
          "document_type_id": "88888888-7777-6666-5555-444444444444",
          "name": "Work Visa",
          "is_statutory": false,
          "state": "expiring",
          "document_id": "22222222-3333-4444-5555-666666666666",
          "expires_on": "2026-10-10",
          "days_until_expiry": 15,
          "request_id": null
        },
        {
          "document_type_id": "77777777-6666-5555-4444-333333333333",
          "name": "Signed NDA",
          "is_statutory": false,
          "state": "requested",
          "document_id": null,
          "expires_on": null,
          "days_until_expiry": null,
          "request_id": "33333333-4444-5555-6666-777777777777"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `completeness.required` | Integer | No | Total mandatory types applicable to this employee |
  | `completeness.satisfied` | Integer | No | Number of satisfied or expiring documents |
  | `completeness.percent` | Integer | No | Completeness percentage (capped at 99% if not all satisfied) |
  | `completeness.threshold` | Integer | No | Target compliance threshold configured in settings |
  | `completeness.meets_threshold` | Boolean | No | `true` if `percent >= threshold` |
  | `items[].document_type_id` | UUID | No | Document type identifier |
  | `items[].name` | String | No | Document type name |
  | `items[].is_statutory` | Boolean | No | Statutory compliance flag |
  | `items[].state` | String | No | Status: `'satisfied'`, `'expiring'`, `'expired'`, `'pending_upload'`, `'requested'`, `'missing'` |
  | `items[].document_id` | UUID | Yes | Active document ID (masked to null for managers if confidential) |
  | `items[].expires_on` | String | Yes | Document expiry date in IST |
  | `items[].days_until_expiry` | Integer | Yes | Days remaining until document expires |
  | `items[].request_id` | UUID | Yes | Active request ID if state is `'requested'` |
  | `profile_incomplete` | Boolean | Yes | Present and `true` (top level, omitted otherwise) when the subject's profile carries none of `department_id`, `location_id`, `employment_type`, `job_status`; the checklist then matches only `{}`-criteria types. Applies to #96 and #98 identically. |

---

### 87. GET /api/v1/documents/hr/notifications

* **API Name / Purpose:** List Notification Outbox Queue Log
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/notifications`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `hr`
* **Security Guard:** `dedupe_key` is strictly excluded from output projection.
* **Query Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `status` | String | No | Filter by `'pending'`, `'sending'`, `'sent'`, `'failed'`, `'skipped'` |
  | `event_type` | String | No | Filter by event type enum |
  | `from` | ISO Date | No | Filter by `scheduled_for >= from` |
  | `to` | ISO Date | No | Filter by `scheduled_for <= to` |
  | `page` | Integer | No | Page number (default 1) |
  | `limit` | Integer | No | Page size (1 to 100, default 20) |
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "11111111-2222-3333-4444-555555555555",
          "org_id": "00000000-0000-0000-0000-000000000001",
          "event_type": "document_request_raised",
          "channel": "email",
          "recipient_user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "recipient_role": null,
          "subject_user_id": null,
          "entity_type": "document_request",
          "entity_id": "22222222-3333-4444-5555-666666666666",
          "payload": {
            "document_type_name": "Identity Proof",
            "due_on": "2026-10-15"
          },
          "status": "sent",
          "attempts": 1,
          "last_error": null,
          "scheduled_for": "2026-09-25T06:00:00.000Z",
          "claimed_at": "2026-09-25T06:00:05.000Z",
          "sent_at": "2026-09-25T06:00:06.000Z",
          "created_at": "2026-09-25T06:00:00.000Z",
          "updated_at": "2026-09-25T06:00:06.000Z"
        }
      ]
    }
  }
  ```

---

### 88–92. Manual Job Triggers (HR Only)

All manual trigger endpoints execute the exact cron logic scoped exclusively to the caller's tenant (`req.user.orgId`). An `org_id` passed in the request body is **strictly ignored**.

#### 88. POST /api/v1/documents/hr/jobs/expiry-sweep/run
* **Action:** Flips `available → expired` for documents past validity date (`runExpiryFlip`).
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Job processed",
    "data": {
      "job": "expiry_flip",
      "duration_ms": 154,
      "ok": true,
      "orgs_scanned": 1,
      "errors": [],
      "flipped": 3
    }
  }
  ```

#### 89. POST /api/v1/documents/hr/jobs/document-reminders/run
* **Action:** Executes reminder passes A (overdue flip), B (expiry notices), C (ack notices), and D (request overdue notices) (`runReminders`).
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Job processed",
    "data": {
      "job": "document_reminders",
      "duration_ms": 285,
      "ok": true,
      "orgs_scanned": 1,
      "errors": [],
      "overdue_flipped": 1,
      "expiry": 2,
      "acknowledgement": 4,
      "request_overdue": 1
    }
  }
  ```

#### 90. POST /api/v1/documents/hr/jobs/notification-dispatch/run
* **Action:** Claims and drains pending outbox rows via email (`runNotificationDispatch`).
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Job processed",
    "data": {
      "job": "notification_dispatch",
      "duration_ms": 520,
      "ok": true,
      "orgs_scanned": 1,
      "errors": [],
      "claimed": 8,
      "sent": 8,
      "failed": 0,
      "skipped": 0
    }
  }
  ```

#### 91. POST /api/v1/documents/hr/jobs/document-sweeper/run
* **Action:** Destructive purge of abandoned uploads, soft-deleted documents past retention, and old outbox rows (`runSweeper`).
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Job processed",
    "data": {
      "job": "document_sweeper",
      "duration_ms": 340,
      "ok": true,
      "orgs_scanned": 1,
      "errors": [],
      "abandoned": 2,
      "purged": 1,
      "outbox_purged": 15
    }
  }
  ```

#### 92. POST /api/v1/documents/hr/jobs/recipient-topup/run
* **Action:** Scans published org documents and synchronizes recipients for new joiners (`runRecipientTopUp`).
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Job processed",
    "data": {
      "job": "recipient_topup",
      "duration_ms": 210,
      "ok": true,
      "orgs_scanned": 1,
      "errors": [],
      "documents": 5,
      "recipients": 12
    }
  }
  ```


---

## 3. Manager Plane APIs (APIs #93–#96)

All manager endpoints enforce reporting hierarchy access via `hierarchyAccess.getAccessibleUserIds`. A manager who manages zero direct reports receives an empty scope (`[]`). An empty scope never grants tenant-wide access.

### 93. POST /api/v1/documents/manager/employees/:userId/document-requests

* **API Name / Purpose:** Manager Raise Document Request
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/employees/:userId/document-requests`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `manager` or `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Team leads and frontline managers need to request project-specific or role-specific documentation (e.g. driving license, security clearance) directly from team members without escalating to HR.
* **Why the API Exists:** Empowers managers with controlled document request authority over direct reports, enforcing both organizational hierarchy and document type policy permissions.
* **Real-World Usage:** An engineering manager requests a scanned copy of an AWS Certificate from a junior engineer for an upcoming client compliance audit.
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userId` | UUIDv4 | Yes | Target direct report's employee ID |
* **Request JSON Payload:**
  ```json
  {
    "document_type_id": "99999999-8888-7777-6666-555555555555",
    "due_on": "2026-10-10",
    "note": "Please submit your cloud practitioner certificate for client audit."
  }
  ```
* **Request Parameters & Body Schema:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `document_type_id` | Body | UUIDv4 | Yes | None | Must be an active document type in the tenant | Requested document type |
  | `due_on` | Body | Date String | No | `today + default_due_days` | ISO `YYYY-MM-DD`. Must be $\ge \text{today\_IST}$ and $\le \text{today\_IST} + 365$ days | Due date |
  | `note` | Body | String | No | `null` | Maximum 1000 characters, nullable | Instructions for the direct report |
* **Manager-Specific Scope & Policy Guards:**
  1. Hierarchy Scope: `userId` must be included in `accessibleUserIds` (`403 FORBIDDEN`).
  2. Type Policy Gate: Document type must permit manager requests: `resolveEffectivePolicy(type, settings).managerCanRequest === true` (`403 TYPE_NOT_REQUESTABLE`).
* **Backend Processing Flow:**
  1. Validates path parameter `userId` and body.
  2. Resolves `accessibleUserIds`. If `userId` is not in list, rejects with `403 FORBIDDEN`.
  3. Acquires advisory lock `docreq:{orgId}:{userId}:{document_type_id}`.
  4. Loads type; evaluates `managerCanRequest` policy (`403 TYPE_NOT_REQUESTABLE`).
  5. Checks existing active document (`409 DOCUMENT_ALREADY_PRESENT`) and existing open request (`409 DUPLICATE_REQUEST`).
  6. Inserts request row with `status: 'open'`, `requested_by_role: 'manager'`.
  7. Enqueues `document_request_raised` notification.
  8. Audits `document_request.created`.
  9. Returns HTTP `201 Created` serialized with `{ plane: 'manager' }`: includes `reminder_count`, but **withholds `last_reminder_on`**.
* **Database Impact:**
  - Inserts 1 row into `document_requests`.
  - Conditionally inserts 1 row into `document_notifications`.
  - Inserts 1 row into `document_audit_logs`.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Request raised",
    "data": {
      "id": "11111111-2222-3333-4444-555555555555",
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "document_type_id": "99999999-8888-7777-6666-555555555555",
      "status": "open",
      "due_on": "2026-10-10",
      "days_until_due": 15,
      "note": "Please submit your cloud practitioner certificate for client audit.",
      "requested_by": "00000000-0000-0000-0000-000000000002",
      "requested_by_role": "manager",
      "fulfilled_document_id": null,
      "fulfilled_at": null,
      "cancelled_at": null,
      "cancel_reason": null,
      "created_at": "2026-09-25T06:00:00.000Z",
      "reminder_count": 0
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `data.id` | UUID | No | Created request identifier |
  | `data.user_id` | UUID | No | Target direct report ID |
  | `data.document_type_id` | UUID | No | Document type requested |
  | `data.status` | String | No | `'open'` |
  | `data.due_on` | String | No | Due date |
  | `data.days_until_due` | Integer | No | Dynamically derived days remaining |
  | `data.requested_by` | UUID | No | Manager's user ID |
  | `data.requested_by_role` | String | No | `'manager'` |
  | `data.reminder_count` | Integer | No | Reminder counter |
  | *(last_reminder_on)* | — | — | **Omitted on manager plane** |
* **Exact Error Responses:**
  - **403 Forbidden — Outside Hierarchy:**
    ```json
    { "success": false, "message": "You do not have permission to manage this employee", "errorCode": "FORBIDDEN" }
    ```
  - **403 Forbidden — Type Not Requestable:**
    ```json
    { "success": false, "message": "Managers are not permitted to request this document type", "errorCode": "TYPE_NOT_REQUESTABLE" }
    ```

---

### 94. GET /api/v1/documents/manager/document-requests

* **API Name / Purpose:** List Team Document Requests
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/document-requests`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `manager` or `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Managers need a consolidated dashboard to track document requests raised for their direct and indirect reporting line.
* **Query Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `status` | String / Array | No | Filter by `'open'`, `'fulfilled'`, `'cancelled'`, `'overdue'` |
  | `user_id` | UUIDv4 | No | Filter by specific direct report |
  | `document_type_id` | UUIDv4 | No | Filter by document type |
  | `overdue_only` | Boolean | No | Filter to past-due requests |
  | `page` | Integer | No | Page number (default 1) |
  | `limit` | Integer | No | Page size (default 20) |
* **Scoping & Security Behavior:** Scoped via SQL `WHERE user_id IN (:accessibleUserIds)`. If `user_id` query param is supplied and falls outside manager's reporting line, query returns `{ rows: [], total: 0 }`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "11111111-2222-3333-4444-555555555555",
          "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "document_type_id": "99999999-8888-7777-6666-555555555555",
          "status": "open",
          "due_on": "2026-10-10",
          "days_until_due": 15,
          "note": "Please submit your cloud practitioner certificate for client audit.",
          "requested_by": "00000000-0000-0000-0000-000000000002",
          "requested_by_role": "manager",
          "fulfilled_document_id": null,
          "fulfilled_at": null,
          "cancelled_at": null,
          "cancel_reason": null,
          "created_at": "2026-09-25T06:00:00.000Z",
          "reminder_count": 0
        }
      ]
    }
  }
  ```

---

### 95. POST /api/v1/documents/manager/document-requests/:id/cancel

* **API Name / Purpose:** Manager Cancel Document Request
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/document-requests/:id/cancel`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `manager` or `hr`
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `id` | UUIDv4 | Yes | Request ID |
* **Request JSON Payload:**
  ```json
  {
    "reason": "Client contract altered; certificate no longer required."
  }
  ```
* **Strict Addressing & Security Rule:**
  - If request is outside manager's reporting scope OR was raised by someone else (`requested_by !== actorId`), **returns `404 REQUEST_NOT_FOUND`** to prevent ID enumeration.
  - If settled (`fulfilled` or `cancelled`), returns `409 REQUEST_NOT_OPEN`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Request cancelled",
    "data": {
      "id": "11111111-2222-3333-4444-555555555555",
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "document_type_id": "99999999-8888-7777-6666-555555555555",
      "status": "cancelled",
      "due_on": "2026-10-10",
      "days_until_due": 15,
      "note": "Please submit your cloud practitioner certificate for client audit.",
      "requested_by": "00000000-0000-0000-0000-000000000002",
      "requested_by_role": "manager",
      "fulfilled_document_id": null,
      "fulfilled_at": null,
      "cancelled_at": "2026-09-25T06:50:00.000Z",
      "cancel_reason": "Client contract altered; certificate no longer required.",
      "created_at": "2026-09-25T06:00:00.000Z",
      "reminder_count": 0
    }
  }
  ```

---

### 96. GET /api/v1/documents/manager/employees/:userId/checklist

* **API Name / Purpose:** Get Direct Report Onboarding Checklist
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/employees/:userId/checklist`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** `manager` or `hr`
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userId` | UUIDv4 | Yes | Direct report's employee ID |
* **Behavior & Confidentiality Masking (R-21):**
  - If `userId` is not in manager's reporting scope, returns `403 FORBIDDEN`.
  - For items where `resolveEffectivePolicy(type, settings).managerCanView === false`, the checklist reports accurate compliance `state` and metadata, but **`document_id` is masked to `null`**. The manager knows the requirement is satisfied without accessing confidential personal files.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "completeness": {
        "required": 2,
        "satisfied": 2,
        "percent": 100,
        "threshold": 100,
        "meets_threshold": true
      },
      "items": [
        {
          "document_type_id": "99999999-8888-7777-6666-555555555555",
          "name": "PAN Card (Statutory)",
          "is_statutory": true,
          "state": "satisfied",
          "document_id": null,
          "expires_on": null,
          "days_until_expiry": null,
          "request_id": null
        },
        {
          "document_type_id": "88888888-7777-6666-5555-444444444444",
          "name": "Project NDA",
          "is_statutory": false,
          "state": "satisfied",
          "document_id": "22222222-3333-4444-5555-666666666666",
          "expires_on": null,
          "days_until_expiry": null,
          "request_id": null
        }
      ]
    }
  }
  ```

---

## 4. Employee Self-Service APIs (APIs #97–#98)

All self-service endpoints operate strictly under the `/me` namespace, anchoring `actorId = req.user.id`.

### 97. GET /api/v1/documents/me/document-requests

* **API Name / Purpose:** Get Personal Document Requests
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/document-requests`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** Any authenticated tenant user (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employees need a dedicated view of outstanding documents requested from them by HR or management, highlighting deadlines and upload requirements.
* **Query Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `status` | String / Array | No | Filter by `'open'`, `'fulfilled'`, `'cancelled'`, `'overdue'` |
  | `document_type_id` | UUIDv4 | No | Filter by document type |
  | `overdue_only` | Boolean | No | Filter to past-due requests |
  | `page` | Integer | No | Page number (default 1) |
  | `limit` | Integer | No | Page size (default 20) |
* **Data Privacy Projection:** `plane = 'self'` withholds both `reminder_count` and `last_reminder_on` to prevent exposing internal organization chasing schedules.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "total": 1,
      "rows": [
        {
          "id": "11111111-2222-3333-4444-555555555555",
          "user_id": "my-user-id",
          "document_type_id": "99999999-8888-7777-6666-555555555555",
          "status": "open",
          "due_on": "2026-10-15",
          "days_until_due": 20,
          "note": "Please upload signed passport copy",
          "requested_by": "00000000-0000-0000-0000-000000000001",
          "requested_by_role": "hr",
          "fulfilled_document_id": null,
          "fulfilled_at": null,
          "cancelled_at": null,
          "cancel_reason": null,
          "created_at": "2026-09-25T06:00:00.000Z"
        }
      ]
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `data.rows[].id` | UUID | No | Request identifier |
  | `data.rows[].status` | String | No | `'open'`, `'fulfilled'`, `'cancelled'`, `'overdue'` |
  | `data.rows[].due_on` | String | No | Due date |
  | `data.rows[].days_until_due` | Integer | No | Days remaining until due date |
  | `data.rows[].note` | String | Yes | Instructions from requester |
  | *(reminder_count)* | — | — | **Omitted on self plane** |
  | *(last_reminder_on)* | — | — | **Omitted on self plane** |

---

### 98. GET /api/v1/documents/me/checklist

* **API Name / Purpose:** Get Personal Onboarding Checklist & Completeness
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/checklist`
* **Authentication / Authorization:** Bearer JWT required.
* **Required Roles:** Any authenticated tenant user (`employee`, `manager`, `hr`).
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Employees need transparent visibility into their onboarding compliance progress, seeing exactly which documents are approved, expiring, or missing.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "user_id": "my-user-id",
      "completeness": {
        "required": 3,
        "satisfied": 2,
        "percent": 67,
        "threshold": 100,
        "meets_threshold": false
      },
      "items": [
        {
          "document_type_id": "type-1",
          "name": "Identity Proof",
          "is_statutory": true,
          "state": "satisfied",
          "document_id": "doc-1",
          "expires_on": null,
          "days_until_expiry": null,
          "request_id": null
        },
        {
          "document_type_id": "type-2",
          "name": "Work Visa",
          "is_statutory": false,
          "state": "expiring",
          "document_id": "doc-2",
          "expires_on": "2026-10-10",
          "days_until_expiry": 15,
          "request_id": null
        },
        {
          "document_type_id": "type-3",
          "name": "Signed NDA",
          "is_statutory": false,
          "state": "requested",
          "document_id": null,
          "expires_on": null,
          "days_until_expiry": null,
          "request_id": "req-1"
        }
      ]
    }
  }
  ```


---

## 5. Existing Phase 1, Phase 2 & Phase 3 APIs Modified / Extended by Phase 4

### 5.1 Extended APIs #9, #10, #30, #41 (Upload Confirm & Link Reference)

- **Endpoints:**
  - **API #9:** `POST /api/v1/documents/employees/:userId/documents/:id/confirm` (HR Confirm Upload)
  - **API #10:** `POST /api/v1/documents/employees/:userId/documents/link-reference` (HR Link Reference)
  - **API #30:** `POST /api/v1/documents/manager/documents/:id/confirm` (Manager Confirm Upload)
  - **API #41:** `POST /api/v1/documents/documents/:id/confirm` (Employee Self Confirm Upload)
- **Contract Modification:** Response payload includes additive field:
  ```json
  "fulfilled_request_id": "uuid | null"
  ```
- **Business Behavior (F-2):** Confirming an upload or linking an external reference automatically checks if an open or overdue request exists for `(user_id, document_type_id)`. If found, the request is atomically fulfilled within the confirmation transaction (`fulfilled_document_id = doc.id`, `status = 'fulfilled'`, `fulfilled_at = now()`). If no request existed, `fulfilled_request_id` returns `null`.
- **Notification Hook (N-1):** Successful confirmation enqueues a `document_uploaded` notice to HR if `document_notify_hr_on_upload` is enabled.

---

### 5.2 Extended API #22 (Type Deactivation Guard)

- **Endpoint:** `PATCH /api/v1/documents/hr/types/:id/deactivate`
- **Behavioral Extension:** Before deactivating a document type, the service now checks `requestService.countOpenRequestsForType`. If active requests (`open` or `overdue`) reference this type, deactivation is blocked with `409 DOCUMENT_TYPE_IN_USE`.
- **Error Response Structure (409 Conflict):**
  ```json
  {
    "success": false,
    "errorCode": "DOCUMENT_TYPE_IN_USE",
    "message": "Document type is in use by 3 open items. Resolve or remove them before deactivating.",
    "details": {
      "open_employee_documents": 1,
      "open_org_documents": 0,
      "open_document_requests": 2
    }
  }
  ```

---

### 5.3 Extended APIs #16 & #17 (Type Creation & Update Mandatory Targeting)

- **Endpoints:**
  - **API #16:** `POST /api/v1/documents/hr/types`
  - **API #17:** `PUT /api/v1/documents/hr/types/:id`
- **Validation Contract Tightening:** `mandatory_for` criteria object is strictly validated against the six core targeting dimensions:
  - `target_departments`: UUID array (unique, max 200)
  - `target_locations`: UUID array (unique, max 200)
  - `target_employment_types`: String array of exact enums (`full_time`, `part_time`, `contract`, `intern`)
  - `target_job_statuses`: String array of exact enums (`probation`, `confirmed`, `notice_period`, `terminated`, `trainee`, `contract`, `temporary`)
  - `included_users`: UUID array (unique, max 200)
  - `excluded_users`: UUID array (unique, max 200)
  - `assertDisjoint`: Validates that `included_users` and `excluded_users` have empty intersection (`400 VALIDATION_ERROR`). Unknown keys are rejected (`stripUnknown: false`) to prevent accidental org-wide widening.

---

### 5.4 Extended APIs #55 & #56 (Org Settings #71–#78)

- **Endpoints:**
  - **API #55:** `GET /api/v1/documents/hr/settings`
  - **API #56:** `PUT /api/v1/documents/hr/settings`
- **Additive Settings Attributes:**
  | Key | Type | Default | Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `document_expiry_reminder_days` | Integer[] | `[30, 15, 7]` | Array $\le 6$ integers, each $0 \le n \le 365$ | Expiry reminder schedule in days |
  | `document_notify_hr_on_upload` | Boolean | `false` | Boolean | Email HR when an employee uploads a document |
  | `document_notify_expiry` | Boolean | `false` | Boolean | Send reminder to employee when document is expiring |
  | `document_notify_pending_acknowledgement` | Boolean | `false` | Boolean | Daily reminder for pending policy acknowledgements |
  | `document_notify_request_raised` | Boolean | `false` | Boolean | Send email to employee when a request is raised |
  | `document_notify_request_overdue` | Boolean | `false` | Boolean | Daily reminder to employee when a request is overdue |
  | `document_request_default_due_days` | Integer | `7` | `BETWEEN 1 AND 365` | Default turnaround window for requests |
  | `document_onboarding_completeness_threshold` | Integer | `100` | `BETWEEN 0 AND 100` | Completeness percentage target |

---

---

# Phase 5: Templates, Metadata Search, Compliance Reports & Exports, Offboarding, Composed View, Async Materialisation, On-Join Top-Up & Leave Bridge (APIs #99–#129)

## 1. HR Administration APIs — Template Lifecycle (APIs #99–#110)

*Auth stack for all routes in this section:* `authenticate` → `authorize(['hr'])` → `requireFeature('documents.access')`.

---

### 99. POST /api/v1/documents/hr/templates

* **API Name / Purpose:** Create Template Draft
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/templates`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs to introduce new standard blank declaration forms, reimbursement claim formats, or policy templates without exposing work-in-progress forms to employees.
* **Why the API Exists:** Initializes a new template version group with version 1 in `draft` status and issues a presigned S3 upload URL when backed by S3.
* **Real-World Usage:** HR admins create a blank "Outpatient Medical Claim Form 2026" template, upload the clean PDF, and prepare it for organization-wide publication.
* **Path Parameters:** None.
* **Request JSON Payload:**
  ```json
  {
    "title": "Medical Expense Reimbursement Form 2026",
    "description": "Standard declaration form for employee outpatient claims under policy health insurance.",
    "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
    "storage_backend": "s3",
    "file_name": "medical_claim_form_template_2026.pdf",
    "content_type": "application/pdf",
    "size_bytes": 145020,
    "is_employee_visible": true
  }
  ```
* **Request Parameters & Body Schema:**
  | Field | Location | Type | Required | Default | Validation / Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `title` | Body | String | Yes | None | Min 1, Max 255 chars. Trimmed | Name of the template |
  | `description` | Body | String | No | `null` | Max 2000 chars, nullable | Instructions or scope of the template |
  | `document_type_id` | Body | UUIDv4 | No | `null` | Must be active document type in the tenant | Linked document type |
  | `storage_backend` | Body | String | No | `'s3'` | Valid: `'s3'`, `'reference'` | Storage provider |
  | `file_name` | Body | String | No | `null` | Max 255 chars. S3 backend only | Original filename |
  | `content_type` | Body | String | No | `null` | Max 255 chars. S3 backend only | MIME type |
  | `size_bytes` | Body | Integer | No | `null` | Min 0. S3 backend only | Estimated file size in bytes |
  | `reference_url` | Body | String | No | `null` | Safe HTTPS URI, max 2048 chars | External link for reference backend |
  | `is_employee_visible` | Body | Boolean | No | `true` | Boolean flag | Controls visibility in employee catalog |
* **Backend Processing Flow:**
  1. Validates request body against `createTemplateSchema`.
  2. Extracts tenant context (`orgId`, `actorId`, `actorRole: 'hr'`, `ipAddress`, `requestId`).
  3. Validates S3 configuration if `storage_backend = 's3'`.
  4. If `document_type_id` is provided, verifies type exists and is active (`404 DOCUMENT_TYPE_NOT_FOUND`, `409 DOCUMENT_TYPE_INACTIVE`).
  5. Mints random UUID for `template_id` and distinct random UUID for `template_group_id`.
  6. Inserts row into `document_templates` with `status = 'draft'`, `version = 1`, `download_count = 0`.
  7. Records audit log: `action = 'document_template.created'`.
  8. If S3-backed, signs an S3 `PUT` URL with tenant's configured upload TTL.
  9. Returns HTTP `201 Created` with template metadata and upload URL.
* **Database Impact:**
  - Inserts 1 row into `document_templates`.
  - Inserts 1 row into `document_audit_logs`.
* **File/Storage Impact:** Constructs object key `orgs/<orgId>/templates/<templateGroupId>/<templateId>/file` and signs S3 PUT URL.
* **Concurrency & Lock Behavior:** Initial version creation mints a new UUID; no concurrency conflict.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Template draft created",
    "data": {
      "template": {
        "id": "27685646-6086-44c1-8408-f404ca033f9b",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
        "version": 1,
        "supersedes_id": null,
        "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
        "title": "Medical Expense Reimbursement Form 2026",
        "description": "Standard declaration form for employee outpatient claims under policy health insurance.",
        "status": "draft",
        "storage_backend": "s3",
        "reference_url": null,
        "file_name": "medical_claim_form_template_2026.pdf",
        "content_type": "application/pdf",
        "size_bytes": 145020,
        "checksum_sha256": null,
        "confirmed_at": null,
        "is_employee_visible": true,
        "download_count": 0,
        "has_file": false,
        "created_at": "2026-09-25T14:30:00.000Z",
        "updated_at": "2026-09-25T14:30:00.000Z"
      },
      "upload_url": "https://s3.ap-south-1.amazonaws.com/orgs/.../file?X-Amz-Algorithm=...",
      "upload_expires_at": "2026-09-25T14:45:00.000Z",
      "required_headers": {
        "Content-Type": "application/pdf"
      }
    }
  }
  ```
* **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :--- | :--- |
  | `success` | Boolean | No | Always `true` on success |
  | `message` | String | No | Status confirmation text (`"Template draft created"`) |
  | `data.template.id` | UUID | No | Primary key of this template version |
  | `data.template.template_group_id` | UUID | No | Group identifier common to all versions in this lineage |
  | `data.template.version` | Integer | No | Version number (`1` on create) |
  | `data.template.status` | String | No | Lifecycle status (`'draft'`) |
  | `data.template.has_file` | Boolean | No | `true` when file confirmed in S3 or reference URL populated |
  | `data.upload_url` | String | Yes | S3 presigned PUT URL |
  | `data.upload_expires_at` | ISO Timestamp | Yes | Upload URL expiration timestamp |
  | `data.required_headers` | Object | Yes | Headers required on upload PUT |
* **Error Response Documentation:**
  | HTTP Status | Error Code | Error Message | Trigger Condition |
  | :--- | :--- | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Validation error details | Missing title or invalid parameters |
  | `404` | `DOCUMENT_TYPE_NOT_FOUND` | Document type not found | Provided type does not exist in tenant |
  | `409` | `DOCUMENT_TYPE_INACTIVE` | Document type is inactive | Provided type is deactivated |
  | `422` | `INVALID_REFERENCE_URL` | reference_url is not a safe https URL | Malformed or non-HTTPS reference link |
  | `503` | `DOCUMENT_STORAGE_UNAVAILABLE`| document storage is not available | S3 configuration missing |
* **Edge Cases & Failure Scenarios:**
  - Specifying `reference_url` with `storage_backend: 's3'` ignores reference URL.
  - S3 downtime prevents URL signing and halts draft creation with `503`.

---

### 100. PATCH /api/v1/documents/hr/templates/:id

* **API Name / Purpose:** Update Template Draft Metadata
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs to update the title, instructions, or catalog visibility of a draft template before releasing it to employees.
* **Why the API Exists:** Provides an in-place update mechanism for uncommitted draft templates while strictly blocking mutations on published or archived templates.
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `id` | UUIDv4 | Yes | Target template draft ID |
* **Request JSON Payload:**
  ```json
  {
    "title": "Medical Expense Reimbursement Form 2026 (Updated)",
    "description": "Clarified Section 3 claim requirements for day-care treatments.",
    "is_employee_visible": true
  }
  ```
* **Request Parameters & Body Schema:** Requires at least 1 field. Accepts `title`, `description`, `is_employee_visible`, `file_name` (S3 only), `reference_url` (reference only).
* **Backend Processing Flow:**
  1. Validates UUID path parameter and body against `updateTemplateSchema`.
  2. Acquires advisory lock on `template_group_id`.
  3. Loads template with `FOR UPDATE` lock.
  4. Verifies status is `draft` (`409 TEMPLATE_NOT_DRAFT`).
  5. Enforces backend-field coupling: setting `reference_url` on S3 backend or `file_name` on reference backend throws `409 INVALID_FIELD_FOR_BACKEND`.
  6. Updates template record and records audit log: `action = 'document_template.updated'`.
  7. Commits transaction and returns HTTP `200 OK` with updated template object.
* **Database Impact:** Updates 1 row in `document_templates`, inserts 1 row into `document_audit_logs`.
* **Concurrency & Lock Behavior:** Serialized by `pg_advisory_xact_lock` on `template_group_id`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Template updated",
    "data": {
      "id": "27685646-6086-44c1-8408-f404ca033f9b",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
      "version": 1,
      "title": "Medical Expense Reimbursement Form 2026 (Updated)",
      "description": "Clarified Section 3 claim requirements for day-care treatments.",
      "status": "draft",
      "storage_backend": "s3",
      "has_file": false,
      "updated_at": "2026-09-25T14:35:00.000Z"
    }
  }
  ```
* **Error Response Documentation:**
  | HTTP Status | Error Code | Error Message | Trigger Condition |
  | :--- | :--- | :--- | :--- |
  | `404` | `TEMPLATE_NOT_FOUND` | Template not found | ID does not exist in tenant |
  | `409` | `TEMPLATE_NOT_DRAFT` | Only a draft can be edited | Target is published or archived |
  | `409` | `INVALID_FIELD_FOR_BACKEND`| Field applies only to other backend | Mixing S3 and reference fields |

---

### 101. POST /api/v1/documents/hr/templates/:id/file-url

* **API Name / Purpose:** Re-Issue Template Upload URL
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/file-url`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** If an upload URL expires or the file changes before confirmation, HR re-issues an upload URL without recreating the draft.
* **Path Parameters:** `id` (UUIDv4, required).
* **Request JSON Payload:**
  ```json
  {
    "file_name": "revised_medical_template.pdf",
    "content_type": "application/pdf",
    "size_bytes": 148500
  }
  ```
* **Backend Processing Flow:**
  1. Asserts S3 is configured (`503 DOCUMENT_STORAGE_UNAVAILABLE`).
  2. Loads template; verifies `status = 'draft'` (`422 TEMPLATE_NOT_DRAFT`) and `storage_backend = 's3'` (`409 TEMPLATE_NOT_S3_BACKED`).
  3. Verifies `content_type` and `size_bytes` against effective type policy.
  4. Updates claimed metadata on draft record under advisory lock.
  5. Signs new presigned S3 PUT URL and returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Upload URL issued",
    "data": {
      "template_id": "27685646-6086-44c1-8408-f404ca033f9b",
      "upload_url": "https://s3.ap-south-1.amazonaws.com/.../file?X-Amz-Algorithm=...",
      "upload_expires_at": "2026-09-25T14:50:00.000Z",
      "required_headers": { "Content-Type": "application/pdf" }
    }
  }
  ```

---

### 102. POST /api/v1/documents/hr/templates/:id/confirm

* **API Name / Purpose:** Confirm Template File Upload
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/confirm`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Verifies that the template file was actually uploaded to S3, locking in real size and checksum.
* **Backend Processing Flow:**
  1. Asserts S3 is configured and template is in `draft` status.
  2. Idempotent short-circuit: if `confirmed_at` is already set, returns current record immediately.
  3. Calls S3 `HeadObject` on `storage_key`. If object missing, throws `422 TEMPLATE_FILE_NOT_UPLOADED`.
  4. Verifies verified MIME type and size against effective policy. Throws `422 DOCUMENT_VERIFICATION_FAILED` if MIME mismatch.
  5. Updates draft: `confirmed_at = NOW()`, `size_bytes = head.contentLength`, `content_type = head.contentType`, `checksum_sha256 = head.etag`.
  6. Records audit: `document_template.file_confirmed`. Returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Upload confirmed",
    "data": {
      "id": "27685646-6086-44c1-8408-f404ca033f9b",
      "has_file": true,
      "size_bytes": 145020,
      "content_type": "application/pdf",
      "checksum_sha256": "35a8f2780e922754c0e668b556f8f533",
      "confirmed_at": "2026-09-25T14:36:12.450Z"
    }
  }
  ```

---

### 103. POST /api/v1/documents/hr/templates/:id/publish

* **API Name / Purpose:** Publish Template Draft
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/publish`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Makes a verified blank form live for company-wide employee download while retiring any previous version.
* **Backend Processing Flow:**
  1. Acquires `pg_advisory_xact_lock` on `template_group_id`.
  2. Loads target draft with `FOR UPDATE`. Idempotent replay if already published.
  3. Asserts `status = 'draft'` (`422 TEMPLATE_NOT_DRAFT`) and `isPublishable` returns true (`422 TEMPLATE_FILE_MISSING`).
  4. **Demote-Predecessor-FIRST Ordering (B-2):** Partial unique index permits at most 1 published row per group. Queries active published predecessor, updates `status = 'superseded'`, `superseded_at = NOW()`, and audits `document_template.superseded`.
  5. Computes `version = MAX(group_max, draft.version)`.
  6. Updates target draft: `status = 'published'`, `supersedes_id = predecessor.id`, `published_by = actorId`, `published_at = NOW()`.
  7. Audits `document_template.published`. Commits transaction and returns HTTP `200 OK`.
* **Database Impact:** Updates 1 or 2 rows in `document_templates`, inserts up to 2 rows into `document_audit_logs`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Template published",
    "data": {
      "id": "27685646-6086-44c1-8408-f404ca033f9b",
      "version": 1,
      "status": "published",
      "has_file": true,
      "published_at": "2026-09-25T14:40:00.000Z"
    }
  }
  ```
* **Error Response Documentation:**
  | HTTP Status | Error Code | Error Message | Trigger Condition |
  | :--- | :--- | :--- | :--- |
  | `409` | `TEMPLATE_PUBLISH_CONFLICT` | A published version already exists | Race condition on partial unique index |
  | `422` | `TEMPLATE_FILE_MISSING` | Publish requires a confirmed file | Upload not confirmed or URL missing |

---

### 104. POST /api/v1/documents/hr/templates/:id/replace

* **API Name / Purpose:** Replace Template (Create Next Draft Version)
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/replace`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Opens a revised draft version of an active template while keeping the current version published and accessible to employees.
* **Backend Processing Flow:**
  1. Acquires advisory lock on `template_group_id`.
  2. Asserts target template status is `published` (`409 TEMPLATE_NOT_REPLACEABLE`).
  3. Draft Exclusivity Check (B-6): Checks if an uncommitted draft already exists in the group. If so, throws `409 TEMPLATE_DRAFT_EXISTS` with the existing draft's ID.
  4. Calculates `newVersion = MAX(version) + 1`.
  5. Clones metadata and creates new draft with `supersedes_id = row.id`, `status = 'draft'`, `has_file = false`.
  6. Audits `document_template.replaced`.
  7. If S3-backed, signs an S3 PUT URL for the new version's storage key.
  8. Commits transaction and returns HTTP `201 Created`.
* **Success Response Structure (201 Created):**
  ```json
  {
    "success": true,
    "message": "Template draft version created",
    "data": {
      "template": {
        "id": "7a304e22-e423-421b-8711-92576da9192c",
        "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
        "version": 2,
        "supersedes_id": "27685646-6086-44c1-8408-f404ca033f9b",
        "status": "draft",
        "has_file": false
      },
      "upload_url": "https://s3.ap-south-1.amazonaws.com/.../file?...",
      "upload_expires_at": "2026-09-25T15:15:00.000Z"
    }
  }
  ```

---

### 105. POST /api/v1/documents/hr/templates/:id/archive

* **API Name / Purpose:** Archive Published Template
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/archive`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Retires a published template permanently from the employee catalog while preserving audit lineage.
* **Backend Processing Flow:**
  1. Acquires advisory lock on `template_group_id`.
  2. Idempotent if already `archived`.
  3. Asserts status is `published` (`409 TEMPLATE_NOT_ARCHIVABLE`).
  4. Updates `status = 'archived'`, `archived_by = actorId`, `archived_at = NOW()`.
  5. Records audit log: `document_template.archived`. Returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Template archived",
    "data": {
      "id": "27685646-6086-44c1-8408-f404ca033f9b",
      "status": "archived",
      "archived_at": "2026-09-25T15:10:00.000Z"
    }
  }
  ```

---

### 106. DELETE /api/v1/documents/hr/templates/:id

* **API Name / Purpose:** Delete Template Draft
* **HTTP Method:** `DELETE`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Enables HR to discard an unneeded draft without leaving orphaned database rows.
* **Backend Processing Flow:**
  1. Asserts status is strictly `draft` (`422 TEMPLATE_NOT_DELETABLE`).
  2. Executes soft-deletion (`deleted_at = NOW()`).
  3. Audits `document_template.deleted`.
  4. Post-commit: executes best-effort S3 `deleteObject` for uploaded storage key. Returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Template draft deleted",
    "data": { "id": "7a304e22-e423-421b-8711-92576da9192c", "deleted": true }
  }
  ```

---

### 107. GET /api/v1/documents/hr/templates

* **API Name / Purpose:** List Templates (HR Plane)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/templates`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Query Parameters:** `status` (string or array), `type_id` (UUID), `q` (string, max 200), `limit` (1-100, default 50), `offset` (min 0, default 0).
* **Backend Processing Flow:** Queries `document_templates` filtered by organization, status, type, and title query. Returns paginated list with total count.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "rows": [
        {
          "id": "27685646-6086-44c1-8408-f404ca033f9b",
          "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
          "version": 1,
          "title": "Medical Expense Reimbursement Form 2026",
          "status": "published",
          "storage_backend": "s3",
          "has_file": true,
          "download_count": 42
        }
      ],
      "total": 1
    }
  }
  ```

---

### 108. GET /api/v1/documents/hr/templates/:id

* **API Name / Purpose:** Get Template Detail (HR Plane)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Success Response Structure (200 OK):** Returns full template record including `has_file`, `storage_backend`, `checksum_sha256`, `confirmed_at`, `published_at`.

---

### 109. GET /api/v1/documents/hr/templates/:id/versions

* **API Name / Purpose:** Get Template Version Chain
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/versions`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Backend Processing Flow:** Resolves `template_group_id` of target template and returns all versions ordered by `version DESC`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": [
      { "id": "7a304e22-...", "version": 2, "status": "draft", "has_file": false },
      { "id": "27685646-...", "version": 1, "status": "published", "has_file": true }
    ]
  }
  ```

---

### 110. GET /api/v1/documents/hr/templates/:id/download-url

* **API Name / Purpose:** Generate HR Template Download URL
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/templates/:id/download-url`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Backend Processing Flow:**
  1. Asserts template exists and has confirmed file (`404 TEMPLATE_FILE_MISSING`).
  2. Generates S3 presigned GET URL with `Content-Disposition: attachment`.
  3. Atomically increments `download_count` (swallowing errors).
  4. Records detached audit log: `document_template.downloaded`. Returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "url": "https://s3.ap-south-1.amazonaws.com/.../file?response-content-disposition=attachment...",
      "expires_at": "2026-09-25T15:15:00.000Z",
      "file_name": "medical_claim_form_template_2026.pdf"
    }
  }
  ```

---

## 2. Employee Self-Service APIs — Templates Catalog (APIs #111–#112)

*Auth stack for all routes in this section:* `authenticate` → `requireFeature('documents.access')`. Any authenticated tenant member.

---

### 111. GET /api/v1/documents/templates

* **API Name / Purpose:** Browse Published Templates (Employee Catalog)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/templates`
* **Authentication / Authorization:** Bearer Token. Any authenticated organization member. Feature: `documents.access`.
* **Business Problem Solved:** Employees need self-service access to active blank declaration forms and statutory claim formats.
* **Why the API Exists:** Exposes the published, employee-visible template catalog with no hierarchy scoping.
* **Query Parameters:** `type_id` (UUID), `q` (string, max 200), `limit` (1-100, default 50), `offset` (min 0, default 0). *(Note: `status` filter is forbidden; returns `published` only).*
* **Backend Processing Flow:**
  1. Adds predicate `status = 'published'` and `deleted_at IS NULL`.
  2. Evaluates row visibility: `is_employee_visible = true` and gating type `employee_can_view = true`.
  3. Returns filtered array omitting internal storage keys.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "rows": [
        {
          "id": "27685646-6086-44c1-8408-f404ca033f9b",
          "title": "Medical Expense Reimbursement Form 2026",
          "description": "Standard declaration form for outpatient claims.",
          "status": "published",
          "has_file": true,
          "file_name": "medical_claim_form_template_2026.pdf",
          "download_count": 42
        }
      ],
      "total": 1
    }
  }
  ```

---

### 112. GET /api/v1/documents/templates/:id/download-url

* **API Name / Purpose:** Get Template Download URL (Employee Self-Plane)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/templates/:id/download-url`
* **Authentication / Authorization:** Bearer Token. Any authenticated organization member. Feature: `documents.access`.
* **Business Problem Solved:** Allows an employee to securely download an official blank company form.
* **Uniform 404 Behavior:** If template is missing, unpublished, archived, hidden, or type-gate fails, returns uniform **`404 TEMPLATE_NOT_FOUND`** (never 403) to prevent status probing.
* **Backend Processing Flow:**
  1. Resolves template visibility against authority rules.
  2. Issues S3 presigned GET URL with `attachment` disposition.
  3. Atomically increments `download_count` and audits `document_template.downloaded`. Returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "url": "https://s3.ap-south-1.amazonaws.com/.../file?response-content-disposition=attachment...",
      "expires_at": "2026-09-25T15:15:00.000Z",
      "file_name": "medical_claim_form_template_2026.pdf"
    }
  }
  ```

## 3. HR Administration APIs — Search, Tags, Reports & Egress Ledger (APIs #113–#121)

*Auth stack for all routes in this section:* `authenticate` → `authorize(['hr'])` → `requireFeature('documents.access')`.

---

### 113. GET /api/v1/documents/hr/documents/search

* **API Name / Purpose:** Search Employee Documents Metadata
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/search`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** HR needs to quickly find employee documents across the organization using complex criteria (keywords, tags, departments, statuses, date ranges) without clicking through individual employee profiles.
* **Why the API Exists:** Provides a centralized, SQL-optimized search engine over employee documents that enforces data minimization (omits document numbers and storage keys).
* **Path Parameters:** None.
* **Query Parameters & Search Schema:**
  | Field | Location | Type | Required | Default | Description / Constraints |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `q` | Query | String | No | None | Case-insensitive title prefix/substring (max 200 chars) |
  | `type_id` | Query | UUIDv4 | No | None | Filter by document type ID |
  | `user_id` | Query | UUIDv4 | No | None | Filter by document owner user ID |
  | `department_id` | Query | UUIDv4 | No | None | Filter by owner's department ID |
  | `status` | Query | String/Array | No | None | Intersected with visible statuses; excludes `quarantined` |
  | `tags` | Query | String/Array | No | None | Array overlap filter against GIN-indexed tags |
  | `from_issued_on` | Query | ISO Date | No | None | `YYYY-MM-DD` lower bound for issue date |
  | `to_issued_on` | Query | ISO Date | No | None | `YYYY-MM-DD` upper bound for issue date |
  | `from_expires_on`| Query | ISO Date | No | None | `YYYY-MM-DD` lower bound for expiry date |
  | `to_expires_on` | Query | ISO Date | No | None | `YYYY-MM-DD` upper bound for expiry date |
  | `limit` | Query | Integer | No | `50` | Min 1, Max 100 results per page |
  | `offset` | Query | Integer | No | `0` | Offset index; max deep offset is 10,000 |
* **Backend Processing Flow:**
  1. Validates query parameters; normalizes tags and status filters.
  2. Pushes all filter predicates into SQL before the `LIMIT` clause (B-7).
  3. Applies `ORDER BY created_at DESC, id DESC` for deterministic pagination.
  4. Projects metadata only: `document_number`, `storage_key`, and `reference_url` are **never** disclosed.
  5. Wraps in standard envelope and returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "rows": [
        {
          "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
          "title": "Passport Renewal Copy",
          "document_type": {
            "id": "8e3791a2-92b0-466d-9799-a47291a13442",
            "code": "PASSPORT",
            "name": "Passport"
          },
          "owner": {
            "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
            "name": "Rishi Ganeshe",
            "employee_code": "EMP-00104",
            "department_id": "bd22cbe8-0a4d-4a32-b509-6fa700319e87"
          },
          "status": "available",
          "tags": ["travel", "compliance-2026"],
          "issued_on": "2024-05-10",
          "expires_on": "2034-05-09",
          "is_confidential": false,
          "created_at": "2026-09-20T10:15:30.000Z",
          "verified_at": "2026-09-20T11:00:00.000Z"
        }
      ],
      "total": 1,
      "limit": 50,
      "offset": 0,
      "filters": { "q": "passport", "limit": 50, "offset": 0 }
    }
  }
  ```
* **Error Response Documentation:**
  | HTTP Status | Error Code | Error Message | Trigger Condition |
  | :--- | :--- | :--- | :--- |
  | `400` | `BAD_REQUEST` | Invalid date format | Date format not `YYYY-MM-DD` |
  | `422` | `PAGINATION_TOO_DEEP` | offset cannot exceed 10000 | Deep paging beyond 10,000 rows |
  | `422` | `TOO_MANY_TAGS` | At most 10 tags are allowed | More than 10 tags in query |

---

### 114. GET /api/v1/documents/hr/documents/search.csv

* **API Name / Purpose:** Export Search Results to CSV
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/search.csv`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Enables HR to export a filtered spreadsheet of employee documents for external audits while logging the egress in the compliance ledger.
* **Backend Processing Flow:**
  1. Executes search query with limit `EXPORT_MAX_ROWS + 1` (10,001).
  2. If `total > 10,000`, halts immediately with `422 EXPORT_TOO_LARGE`.
  3. Registers export job in `document_export_jobs` (`export_type = 'document_search'`, `format = 'csv'`, `status = 'started'`). Throws `503 EXPORT_LEDGER_UNAVAILABLE` if ledger write fails.
  4. Builds CSV using `SEARCH_CSV_COLUMNS` (omits `document_number`).
  5. Streams CSV with `Content-Disposition: attachment; filename="document-search-YYYY-MM-DD.csv"`.
  6. Asynchronously marks ledger job `completed` with byte length and row count.
* **Success Response Structure (200 OK, text/csv):**
  ```csv
  id,title,document_type_code,user_id,owner_name,employee_code,status,tags,issued_on,expires_on,created_at
  e42938e1-5129-4e76-8025-502a3a5f7823,Passport Renewal Copy,PASSPORT,489f9cd6-990d-4911-a84f-060984cc1831,Rishi Ganeshe,EMP-00104,available,"travel,compliance-2026",2024-05-10,2034-05-09,2026-09-20T10:15:30.000Z
  ```

---

### 115. GET /api/v1/documents/hr/reports/missing-mandatory

* **API Name / Purpose:** Missing Mandatory Documents Report
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/reports/missing-mandatory`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Generates real-time compliance audits showing workforce adherence to mandatory document requirements.
* **Query Parameters:** `department_id` (UUID), `employment_type` (string), `document_type_id` (UUID), `include_employees` (boolean, default false), `employees_limit` (1-100, default 50), `employees_offset` (min 0, default 0).
* **Backend Processing Flow:**
  1. Pages active employee roster in chunks of `CHECKLIST_CHUNK` (100).
  2. Evaluates each chunk via `documentChecklistService.forUsers`.
  3. Computes overall `completeness_pct` across the entire organization.
  4. Aggregates counts `by_type` and `by_department`.
  5. If `include_employees = true`, returns paged slice of incomplete employee records with missing types.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "generated_at": "2026-09-25T15:20:00.000Z",
      "summary": {
        "employees_total": 120,
        "employees_complete": 105,
        "employees_incomplete": 15,
        "completeness_pct": 88
      },
      "by_type": [
        {
          "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
          "name": "PAN Card",
          "required_for": 120,
          "missing_count": 4,
          "open_request_count": 2
        }
      ],
      "by_department": [
        {
          "department_id": "bd22cbe8-0a4d-4a32-b509-6fa700319e87",
          "department_name": "Engineering",
          "employees_total": 45,
          "employees_incomplete": 3
        }
      ],
      "employees": [
        {
          "user_id": "1824cde3-0039-4a96-b6e7-f59ca39b3137",
          "employee_code": "EMP-00188",
          "department_name": "Sales",
          "required": 4,
          "satisfied": 2,
          "completeness_pct": 50,
          "missing_types": ["Aadhaar Card", "Form 11 Declaration"]
        }
      ],
      "employees_limit": 50,
      "employees_offset": 0,
      "has_more": false
    }
  }
  ```

---

### 116. GET /api/v1/documents/hr/reports/missing-mandatory.csv

* **API Name / Purpose:** Export Missing Mandatory Report to CSV
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/reports/missing-mandatory.csv`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Backend Processing Flow:**
  1. Collects all non-compliant employees across the roster.
  2. Enforces cap of 10,000 rows (`422 EXPORT_TOO_LARGE`).
  3. Registers export in `document_export_jobs` (`export_type = 'missing_mandatory'`, `format = 'csv'`).
  4. Streams CSV attachment: `missing-mandatory-YYYY-MM-DD.csv`.
  5. Completes ledger row asynchronously.
* **Success Response Structure (200 OK, text/csv):**
  ```csv
  user_id,employee_code,department_name,required,satisfied,completeness_pct,missing_types
  1824cde3-0039-4a96-b6e7-f59ca39b3137,EMP-00188,Sales,4,2,50,"Aadhaar Card; Form 11 Declaration"
  ```

---

### 117. GET /api/v1/documents/hr/reports/expiring

* **API Name / Purpose:** Expiring Documents Compliance Report
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/reports/expiring`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Query Parameters:** `within_days` (1-365, default 30), `document_type_id` (UUID), `department_id` (UUID), `include_expired` (boolean, default false), `limit` (1-100, default 100), `offset` (min 0, default 0).
* **Backend Processing Flow:**
  1. Computes IST date bounds (`todayIst = toIstDateString(now)`, `toIst = todayIst + within_days`).
  2. Queries active `available` documents expiring in range.
  3. Groups rows into 6 IST-anchored buckets: `expired`, `due_7`, `due_30`, `due_60`, `due_90`, `later`.
  4. Returns paginated rows and aggregated bucket metrics.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "generated_at": "2026-09-25T15:25:00.000Z",
      "as_of": "2026-09-25",
      "within_days": 30,
      "buckets": { "expired": 0, "due_7": 1, "due_30": 3, "due_60": 0, "due_90": 0, "later": 0 },
      "rows": [
        {
          "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
          "title": "Medical License Certificate",
          "owner": {
            "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
            "name": "Rishi Ganeshe",
            "employee_code": "EMP-00104"
          },
          "issued_on": "2023-10-01",
          "expires_on": "2026-10-01",
          "days_remaining": 6,
          "bucket": "due_7",
          "status": "available"
        }
      ]
    }
  }
  ```

---

### 118. GET /api/v1/documents/hr/reports/expiring.csv

* **API Name / Purpose:** Export Expiring Documents Report to CSV
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/reports/expiring.csv`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Backend Processing Flow:** Same filters as #117; capped at 10,000 rows; registers export in `document_export_jobs` (`export_type = 'expiring'`); streams `expiring-documents-YYYY-MM-DD.csv`.

---

### 119. GET /api/v1/documents/hr/exports

* **API Name / Purpose:** List Data-Egress Export Jobs
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/exports`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Query Parameters:** `export_type`, `format`, `scope`, `status`, `from`, `to`, `page` (default 1), `limit` (default 50).
* **Backend Processing Flow:** Queries `document_export_jobs` for the organization with pagination.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "exports": [
        {
          "id": "fa1b8c2e-4e6a-4d2b-9273-cf6a1b023901",
          "export_type": "document_search",
          "format": "csv",
          "scope": "org",
          "status": "completed",
          "filters": { "q": "passport", "statuses": ["available"] },
          "requested_by": "489f9cd6-990d-4911-a84f-060984cc1831",
          "requester_identifier": "hr.lead@hrclouds.in",
          "row_count": 1,
          "byte_count": 245,
          "started_at": "2026-09-25T15:21:00.000Z",
          "completed_at": "2026-09-25T15:21:01.000Z"
        }
      ],
      "pagination": { "page": 1, "limit": 50, "total": 1, "total_pages": 1 }
    }
  }
  ```

---

### 120. GET /api/v1/documents/hr/exports/:id

* **API Name / Purpose:** Get Export Job Detail
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/exports/:id`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Success Response Structure (200 OK):** Returns single `document_export_jobs` row including filters, row count, byte count, IP address, and status.

---

### 121. PATCH /api/v1/documents/hr/documents/:id/tags

* **API Name / Purpose:** Update Document Tags
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/documents/hr/documents/:id/tags`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Path Parameters:** `id` (UUIDv4, required).
* **Request JSON Payload:**
  ```json
  {
    "tags": ["travel", "compliance-2026", "audit_cleared"]
  }
  ```
* **Request Parameters & Body Schema:**
  | Field | Location | Type | Required | Constraints | Description |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | `tags` | Body | Array[String] | Yes | Max 10 items, max 64 chars each, regex `^[a-z0-9][a-z0-9 _-]*$` | Complete replacement tag array |
* **Backend Processing Flow:**
  1. Validates tag array: trimmed, lowercased, deduplicated, max 10 tags, max 64 characters each.
  2. Acquires row lock (`FOR UPDATE`) on `employee_documents`.
  3. Updates `tags` column with PostgreSQL `VARCHAR[]`.
  4. Records audit log: `action = 'document.tags_updated'` with old and new values.
  5. Returns HTTP `200 OK` with updated document row.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Tags updated",
    "data": {
      "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
      "tags": ["audit_cleared", "compliance-2026", "travel"],
      "updated_at": "2026-09-25T15:30:00.000Z"
    }
  }
  ```
* **Error Response Documentation:**
  | HTTP Status | Error Code | Error Message | Trigger Condition |
  | :--- | :--- | :--- | :--- |
  | `404` | `DOCUMENT_NOT_FOUND` | Document not found | Document ID missing in tenant |
  | `422` | `TAG_TOO_LONG` | A tag may be at most 64 characters | Tag length > 64 chars |
  | `422` | `TAG_INVALID` | A tag may contain only lowercase letters... | Contains uppercase or symbols |
  | `422` | `TOO_MANY_TAGS` | At most 10 tags are allowed | More than 10 tags supplied |

## 4. HR Administration APIs — Offboarding & Automated Job Triggers (APIs #122–#125, #129)

*Auth stack for all routes in this section:* `authenticate` → `authorize(['hr'])` → `requireFeature('documents.access')`.

---

### 122. POST /api/v1/documents/hr/employees/:userId/offboard-documents

* **API Name / Purpose:** Offboard Employee Documents
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/offboard-documents`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Automates document lifecycle unwinding when an employee leaves the company: archives personal papers, waives pending policy acknowledgements, cancels open document requests, and stops scheduled reminder emails.
* **Path Parameters:**
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userId` | UUIDv4 | Yes | ID of the departing employee |
* **Query Parameters:**
  | Field | Type | Default | Description |
  | :--- | :--- | :--- | :--- |
  | `dry_run` | Boolean | `false` | When `true`, computes affected row counts without modifying persistent state |
  | `force` | Boolean | `false` | When `true`, permits executing unwinding before the employee's last working day |
* **Request JSON Payload:**
  ```json
  {
    "reason": "Voluntary resignation; clearance completed."
  }
  ```
* **Backend Processing Flow:**
  1. Validates `userId` path parameter, query parameters, and optional body reason.
  2. Acquires advisory transaction lock: `pg_advisory_xact_lock(hashtext('document_offboarding:<orgId>:<userId>'))`.
  3. Resolves exit context from `employee_exits` (if available) and verifies active membership.
  4. If last working day is in the future and `force = false`, throws `422 EXIT_DATE_IN_FUTURE` with `effective_on`.
  5. If employee has no exit record and is an active member, throws `422 NOT_OFFBOARDING`.
  6. Reads tenant setting #80 (`document_offboarding_archive_mode`: `'archive'` or `'retain'`).
  7. If `dry_run = true`, counts archivable documents, waivable recipients, and open requests, rolls back, and returns counts.
  8. Live Execution:
     - **Step 1:** Bulk updates leaver's documents in `available` and `expired` to `archived`.
     - **Step 2:** Updates open recipient records (`pending` or `viewed` only) to `waived` with `waived_reason = 'employee_offboarded'`. Signed/acknowledged records are **never** altered.
     - **Step 3:** Updates open and overdue document requests to `cancelled`.
     - **Step 4:** Updates pending and failed notification outbox entries to `skipped` with `reason = 'recipient_offboarded'`.
     - **Step 5:** Writes up to 3 audit log records (`document.bulk_archived`, `org_document.recipients_waived`, `document_request.bulk_cancelled`) with sampled IDs (capped at 50).
  9. Commits transaction and returns HTTP `200 OK`.
* **Database Impact:** Updates rows across `employee_documents`, `org_document_recipients`, `document_requests`, `document_notifications`; inserts up to 3 audit log rows.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Offboarding complete",
    "data": {
      "trigger": "exit",
      "mode": "archive",
      "archived_count": 6,
      "waived_count": 2,
      "cancelled_count": 1,
      "notifications_skipped": 3
    }
  }
  ```
* **Error Response Documentation:**
  | HTTP Status | Error Code | Error Message | Trigger Condition |
  | :--- | :--- | :--- | :--- |
  | `403` | `FORBIDDEN` | Forbidden | Subject user belongs to another organization |
  | `422` | `EXIT_DATE_IN_FUTURE` | The employee's last working day is in the future | Exit date in future without `force=true` |
  | `422` | `NOT_OFFBOARDING` | This employee is not offboarding | Active member with no pending exit |

---

### 123. GET /api/v1/documents/hr/employees/:userId/exit-pack

* **API Name / Purpose:** Generate Employee Exit Document Pack (JSON Manifest)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/exit-pack`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Path Parameters:** `userId` (UUIDv4, required).
* **Query Parameters:** `scope` (`'all'`, `'employee_owned'`, `'org_issued'`, optional; defaults to Setting #81).
* **Backend Processing Flow:**
  1. Gathers employee-owned documents (`available`, `expired`, `archived`) and assigned organization policies.
  2. Enforces cap of 500 items (`422 EXIT_PACK_TOO_LARGE`).
  3. Registers export in `document_export_jobs` (`export_type = 'exit_pack'`, `format = 'json'`, `scope = 'self'`).
  4. Generates S3 presigned GET URLs (`Expires: 900`, attachment disposition) for each item.
  5. Fault tolerance: if signing fails for an item, degrades that item to `url: null`, `url_error: 'UNAVAILABLE'` without failing the pack.
  6. Completes ledger row and returns HTTP `200 OK`.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "export_id": "c71a39b2-92b0-466d-9799-a47291a13442",
      "scope": "all",
      "item_count": 2,
      "generated_at": "2026-09-25T15:35:00.000Z",
      "items": [
        {
          "plane": "employee",
          "document_id": "e42938e1-5129-4e76-8025-502a3a5f7823",
          "title": "Passport Renewal Copy",
          "version": 1,
          "status": "archived",
          "url": "https://s3.ap-south-1.amazonaws.com/.../file?response-content-disposition=attachment...",
          "url_expires_at": "2026-09-25T15:50:00.000Z",
          "url_error": null
        }
      ]
    }
  }
  ```

---

### 124. GET /api/v1/documents/hr/employees/:userId/exit-pack.csv

* **API Name / Purpose:** Export Exit Pack Manifest to CSV
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/employees/:userId/exit-pack.csv`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Backend Processing Flow:** Same scope filtering as #123. Streams CSV manifest with columns: `plane`, `document_id`, `document_type_id`, `title`, `version`, `status`, `issued_on`, `expires_on`, `due_on`. Strictly **omits download URLs** to prevent persistent bearer token exposure in spreadsheets.

---

### 125. POST /api/v1/documents/hr/jobs/offboarding-archive/run

* **API Name / Purpose:** Trigger Offboarding Archive Sweeper
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/jobs/offboarding-archive/run`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Manual execution of the daily offboarding archive routine scoped to the caller's organization.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Offboarding archive run complete",
    "data": { "ok": true, "orgs_scanned": 1, "exits": 2, "removed": 0, "errors": [] }
  }
  ```

---

### 129. POST /api/v1/documents/hr/jobs/publish-materialisation/run

* **API Name / Purpose:** Trigger Publish Materialisation Worker
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/jobs/publish-materialisation/run`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Business Problem Solved:** Manually executes a single batch tick (5,000 recipients) of the async publish materialiser for pending documents in the organization.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "Publish materialisation run complete",
    "data": { "ok": true, "orgs_scanned": 1, "documents": 1, "recipients": 5000, "errors": [] }
  }
  ```

---

## 5. Employee Self-Service APIs — Composed View (API #126)

*Auth stack for all routes in this section:* `authenticate` → `requireFeature('documents.access')`. Any authenticated employee.

---

### 126. GET /api/v1/documents/me/documents/all

* **API Name / Purpose:** Employee Unified Composed Documents Portfolio
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/me/documents/all`
* **Authentication / Authorization:** Bearer Token. Any authenticated employee. Feature: `documents.access`.
* **Business Problem Solved:** Surfaces an employee's personal documents, assigned company policies, downloadable templates, and payroll tax documents in a single view without multiple round trips.
* **Actor Isolation:** `userId` is derived strictly from the JWT token (`req.user.id`).
* **Query Parameters:** `sections` (comma-delimited: `my_documents`, `org_documents`, `templates`, `payroll`), `limit` (1-100, default 50).
* **Backend Processing Flow:**
  1. Validates section list. Throws `400 INVALID_SECTION` if unknown section name requested.
  2. Concurrently builds requested sections with isolated `try/catch` blocks.
  3. **Zero STS Signing Overhead:** Emits standard API route paths (`access.path`), not presigned S3 URLs. Prevents STS rate limits and generates 0 unneeded audit rows during list viewing.
  4. Payroll section checks `entitlementService.hasFeature(orgId, 'payroll.access')`. If unentitled, returns `{ available: false, reason: 'NOT_ENTITLED' }`.
  5. Returns HTTP `200 OK` with 4-section portfolio.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "sections": {
        "my_documents": {
          "available": true,
          "items": [
            {
              "source": "employee",
              "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
              "title": "Passport Renewal Copy",
              "status": "available",
              "requires_action": false,
              "action": null,
              "access": { "kind": "document", "path": "/api/v1/documents/me/documents/e42938e1-5129-4e76-8025-502a3a5f7823/view-url" }
            }
          ],
          "has_more": false
        },
        "org_documents": {
          "available": true,
          "items": [
            {
              "source": "org",
              "id": "7a304e22-e423-421b-8711-92576da9192c",
              "title": "Information Security Policy 2026",
              "status": "published",
              "requires_action": true,
              "action": "acknowledge",
              "access": { "kind": "org_document", "path": "/api/v1/documents/me/hr-documents/7a304e22-e423-421b-8711-92576da9192c/view-url" }
            }
          ],
          "has_more": false
        },
        "templates": {
          "available": true,
          "items": [
            {
              "source": "template",
              "id": "27685646-6086-44c1-8408-f404ca033f9b",
              "title": "Medical Expense Reimbursement Form 2026",
              "status": "published",
              "requires_action": false,
              "action": null,
              "access": { "kind": "template", "path": "/api/v1/documents/templates/27685646-6086-44c1-8408-f404ca033f9b/download-url" }
            }
          ],
          "has_more": false
        },
        "payroll": {
          "available": true,
          "items": [
            {
              "source": "payroll",
              "id": "run-2026-08",
              "title": "Payslip 2026-08",
              "status": "finalized",
              "requires_action": false,
              "action": null,
              "access": { "kind": "payroll_payslip", "path": "/api/v1/payroll/me/payslips/run-2026-08/pdf" }
            }
          ],
          "has_more": false
        }
      },
      "generated_at": "2026-09-25T15:40:00.000Z"
    }
  }
  ```

---

## 6. HR Administration APIs — Materialisation Monitoring (API #127)

*Auth stack for all routes in this section:* `authenticate` → `authorize(['hr'])` → `requireFeature('documents.access')`.

---

### 127. GET /api/v1/documents/hr/org-documents/:id/materialisation

* **API Name / Purpose:** Check Document Recipient Materialisation Status
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/org-documents/:id/materialisation`
* **Authentication / Authorization:** Bearer Token. Required Roles: `hr`. Feature: `documents.access`.
* **Path Parameters:** `id` (UUIDv4, required).
* **Backend Processing Flow:** Returns current materialisation state, target count, materialized count, and completion timestamp.
* **Success Response Structure (200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "materialisation_state": "pending",
      "recipient_target_count": 25000,
      "materialised_count": 10000,
      "materialised_at": null,
      "percent_complete": 40
    }
  }
  ```

---

## 7. Cross-Module Leave Bridge APIs — Audience-Neutral View URL (API #128)

*Auth stack for all routes in this section:* `authenticate` → `requireFeature('documents.access')`. Any authenticated tenant member.

---

### 128. GET /api/v1/documents/attachments/:id/view-url

* **API Name / Purpose:** Resolve Attachment View URL (Cross-Module Leave Bridge)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/attachments/:id/view-url`
* **Authentication / Authorization:** Bearer Token. Any authenticated tenant member. Feature: `documents.access`.
* **Business Problem Solved:** Enables a single stored relative URL on a Leave Application record to serve all three reader planes: applicant (`self`), approving supervisor (`manager`), and compliance auditor (`hr`).
* **Audience Resolution Algorithm (B-13):**
  - If `actorRole === 'hr'` $\rightarrow$ Audience `'hr'`.
  - Else if `actorUserId === row.user_id` $\rightarrow$ Audience `'self'`.
  - Else $\rightarrow$ Audience `'manager'`, fetches `accessibleUserIds` via `hierarchyAccess.getAccessibleUserIds`.
  - Denies access with uniform `404 DOCUMENT_NOT_FOUND` if caller lacks authority.
* **Path Parameters:** `id` (UUIDv4, required).
* **Query Parameters:**
  | Field | Type | Default | Description |
  | :--- | :--- | :--- | :--- |
  | `redirect` | Boolean | `false` | When `true`, responds with HTTP `302 Found` directly redirecting browser to signed S3 URL |
  | `disposition` | String | `'inline'` | Valid: `'inline'`, `'attachment'` |
* **Success Response Structure (200 OK or 302 Found):**
  - **JSON Mode (`redirect = false`):**
    ```json
    {
      "success": true,
      "message": "OK",
      "data": {
        "view_url": "https://s3.ap-south-1.amazonaws.com/.../file?response-content-disposition=inline...",
        "expires_at": "2026-09-25T15:55:00.000Z"
      }
    }
    ```
  - **Redirect Mode (`redirect = true`):**
    ```http
    HTTP/1.1 302 Found
    Location: https://s3.ap-south-1.amazonaws.com/.../file?...
    ```

---

## 8. Existing Phase 1, Phase 2, Phase 3 & Phase 4 APIs Modified / Extended by Phase 5

### 8.1 Extended API #47: POST /api/v1/documents/hr/org-documents/:id/publish
* **Contract Change:** Inspects resolved target audience count against `document_settings.document_publish_sync_threshold` (Setting #79, default 20,000).
* **Synchronous Branch ($le 20,000$):** Retains existing Phase 2 behavior: inserts all recipients in request transaction and returns HTTP `200 OK`.
* **Asynchronous Branch ($> 20,000$):**
  - Updates `status = 'published'` immediately and freezes targeting criteria snapshot.
  - Sets `materialisation_state = 'pending'` and `recipient_target_count = resolved.length`.
  - Materializes first 5,000 recipients in the transaction.
  - Responds with **HTTP `202 Accepted`** and polling link to API #127:
    ```json
    {
      "success": true,
      "message": "Published; recipients are being materialised",
      "data": {
        "status": "published",
        "materialisation_state": "pending",
        "recipient_target_count": 25000,
        "recipients_created": 5000,
        "poll": "/api/v1/documents/hr/org-documents/7a304e22-e423-421b-8711-92576da9192c/materialisation"
      }
    }
    ```

### 8.2 Extended API #77: GET /api/v1/documents/hr/org-documents/compliance/export
* **Contract Change:** Now integrated with the data-egress ledger (`document_export_jobs`). Opens a ledger tracking record with `export_type = 'compliance'` prior to streaming and records completion post-send.

### 8.3 Extended APIs #43, #44, #70 & Employee Document Reads
* **Contract Change:**
  - Table `employee_documents` incorporates `tags VARCHAR[] DEFAULT '{}'` supported by GIN index `employee_documents_tags_gin`.
  - All read projections across `self`, `manager`, and `hr` planes now include the normalized `tags` array:
    ```json
    {
      "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
      "tags": ["travel", "compliance-2026"]
    }
    ```

### 8.4 Extended Cross-Module Endpoint: POST /api/v1/leaves
* **Contract Change:**
  - Request body validator in Leave module accepts optional `document_id: Joi.string().uuid()`.
  - Service executes `documentReadService.resolveForLeaveAttachment`:
    - Asserts document belongs to leave applicant (`422 DOCUMENT_NOT_OWNED_BY_SUBJECT`).
    - Asserts status is evidence-grade (`available` or `pending_verification`, else `422 DOCUMENT_NOT_ATTACHABLE`).
    - Persists relative path `/api/v1/documents/attachments/:id/view-url` on the leave application record.
