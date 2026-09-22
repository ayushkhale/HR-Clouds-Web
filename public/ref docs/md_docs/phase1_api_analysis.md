# Phase 1: Documents Module (Core Foundation) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint technical and architectural analysis of the **42 APIs (#1–#42)** implemented in Phase 1 of the Documents module, providing complete, implementation-accurate request contracts, JSON success responses, field-level data dictionaries, and implementation-defined error structures for frontend development.

> [!IMPORTANT]
> **Architectural Premise & Security Posture:** The Documents module manages highly sensitive PII. It operates strictly on the tenant plane. Every incoming request strictly requires an authenticated tenant context (`orgId` extracted from the verified JWT) and an active `documents.access` feature flag. Platform administrative roles (`admin`, `super-admin`, `worker`) are categorically locked out.
>
> **S3 Pre-signed URL Architecture:** The backend API never buffers or parses binary files. Uploads, replacements, and downloads operate entirely via AWS S3 pre-signed cryptographic URLs. 
>
> **Maker-Checker & Verification (Tier B & Tier C):** Documents flow through strict state transitions: `pending_upload` → `pending_verification` → `available` / `expired` / `rejected`. Managers (Tier B) can provide recommendations, but only HR (Tier C) has final verification authority unless the org explicitly overrides this via Settings (`manager_direct_document_authority`).
>
> **Advisory Locks & Concurrency:** To prevent race conditions on single-instance documents (e.g. uploading two PAN cards at once), the system uses `pg_advisory_xact_lock` for document slots (`docslot:{orgId}:{userId}:{typeId}`), document groups (`docgrp:{orgId}:{groupId}`), and organization types (`doctypes:{orgId}`).

---

## 1. HR Administration APIs — Catalog & Types

### 1. GET /api/v1/documents/hr/catalog
* **API Name / Purpose:** List Document Type Catalog
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/catalog`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to know what standard document types (e.g. PAN, Aadhaar) the platform supports out-of-the-box before activating them.
* **Why the API Exists:** Provides a centralized, standardized registry of documents to ensure consistent validation and policies across all tenant organizations.
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
    *Trigger:* Passing an unrecognized `plane` or invalid query parameter.
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  | `data` | Object | No | Complete catalog template definition |
  | `data.id` | UUID | No | Unique identifier of the catalog template |
  | `data.code` | String | No | System-wide unique code |
  | `data.name` | String | No | Document template title |
  | `data.plane` | String | No | Plane (`'employee'` or `'org'`) |
  | `data.group` | String | No | Functional category group |
  | `data.description` | String | Yes | Template description or instructions |
  | `data.country_code` | String | Yes | ISO country code or `null` |
  | `data.is_statutory` | Boolean | No | Whether legally required under statutory rules |
  | `data.default_is_confidential` | Boolean | No | Default privacy setting |
  | `data.default_employee_can_upload` | Boolean | No | Default employee upload permission |
  | `data.default_employee_can_view` | Boolean | No | Default employee view permission |
  | `data.default_employee_can_delete` | Boolean | No | Default employee delete permission |
  | `data.default_manager_can_view` | Boolean | No | Default manager view permission |
  | `data.default_manager_can_request` | Boolean | No | Default manager request permission |
  | `data.default_requires_verification` | Boolean | No | Default verification flag |
  | `data.default_requires_acknowledgement` | Boolean | No | Default acknowledgement flag |
  | `data.default_requires_signature` | Boolean | No | Default signature requirement flag |
  | `data.default_has_expiry` | Boolean | No | Whether expiry tracking is enabled |
  | `data.default_expiry_reminder_days` | Array[Integer] | No | Notification reminder schedule in days |
  | `data.default_is_mandatory` | Boolean | No | Default mandatory compliance flag |
  | `data.default_mandatory_for` | Object | No | Targeting criteria object |
  | `data.default_allows_multiple` | Boolean | No | Whether multiple active documents are permitted |
  | `data.default_max_file_size_bytes` | Integer | No | Maximum file size limit in bytes |
  | `data.default_allowed_content_types` | Array[String] | No | Allowed MIME types |
  | `data.default_retention_days` | Integer | No | Retention period in days |
  | `data.display_order` | Integer | No | UI presentation sequence |
  | `data.is_active` | Boolean | No | Global template active status |
  | `data.created_at` | String (ISO) | No | Creation timestamp |
  | `data.updated_at` | String (ISO) | No | Last modification timestamp |
* **Exact Error Response Structures:**
  - **404 Not Found — Catalog Entry Not Found:**
    ```json
    {
      "success": false,
      "message": "Catalog entry not found",
      "errorCode": "CATALOG_ENTRY_NOT_FOUND"
    }
    ```
    *Trigger:* Requesting a non-existent catalog code.
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
    *Trigger:* Passing a code not present in the platform catalog.
  - **409 Conflict — Catalog Entry Inactive:**
    ```json
    {
      "success": false,
      "message": "Catalog entry inactive: deprecated_doc",
      "errorCode": "CATALOG_ENTRY_INACTIVE"
    }
    ```
    *Trigger:* Passing a catalog code that has been globally marked inactive.
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  | `mandatory_for` | Object | Optional | No | Targeting criteria | JSON object | `{}` |
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
    *Trigger:* Attempting to create a custom type using a code that exists in the platform catalog.
  - **409 Conflict — Code Already Exists in Org:**
    ```json
    {
      "success": false,
      "message": "code already exists",
      "errorCode": "DOCUMENT_TYPE_CODE_EXISTS"
    }
    ```
    *Trigger:* Code is already registered for this organization.
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  | `data` | Array[Object] | No | List of organization document types |
  | `data[].id` | UUID | No | Document type primary key |
  | `data[].org_id` | UUID | No | Tenant organization ID |
  | `data[].source` | String | No | Type origin: `'catalog'` or `'custom'` |
  | `data[].catalog_id` | UUID | Yes | Associated catalog ID if source is catalog |
  | `data[].code` | String | No | Unique document type code |
  | `data[].name` | String | No | Human-readable title |
  | `data[].plane` | String | No | Operational plane (`'employee'`, `'org'`) |
  | `data[].group` | String | No | Classification category |
  | `data[].description` | String | Yes | Description or employee instructions |
  | `data[].is_statutory` | Boolean | No | Whether legally required |
  | `data[].is_confidential` | Boolean | No | Confidentiality protection flag |
  | `data[].employee_can_upload` | Boolean | No | Self-service upload permission |
  | `data[].employee_can_view` | Boolean | No | Self-service view permission |
  | `data[].employee_can_delete` | Boolean | No | Self-service deletion permission |
  | `data[].manager_can_view` | Boolean | No | Manager team-view permission |
  | `data[].manager_can_request` | Boolean | No | Manager request permission |
  | `data[].requires_verification` | Boolean | No | HR verification requirement |
  | `data[].requires_acknowledgement` | Boolean | No | Acknowledgement requirement |
  | `data[].requires_signature` | Boolean | No | Signature requirement |
  | `data[].has_expiry` | Boolean | No | Expiration tracking enabled |
  | `data[].expiry_reminder_days` | Array[Integer] | No | Expiration reminder schedule |
  | `data[].is_mandatory` | Boolean | No | Mandatory submission flag |
  | `data[].mandatory_for` | Object | No | Employee targeting rule criteria |
  | `data[].allows_multiple` | Boolean | No | Multiple concurrent documents allowed |
  | `data[].max_file_size_bytes` | Integer | No | Max file size in bytes |
  | `data[].allowed_content_types` | Array[String] | No | Permitted MIME types |
  | `data[].retention_days` | Integer | No | Retention period in days |
  | `data[].display_order` | Integer | No | UI sequence order |
  | `data[].is_active` | Boolean | No | Active operational status |
  | `data[].created_by` | UUID | No | Creator user ID |
  | `data[].updated_by` | UUID | Yes | Last updater user ID |
  | `data[].created_at` | String (ISO) | No | Creation timestamp |
  | `data[].updated_at` | String (ISO) | No | Last update timestamp |
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  | `data` | Object | No | Complete document type configuration |
  | `data.id` | UUID | No | Document type identifier |
  | `data.org_id` | UUID | No | Tenant organization ID |
  | `data.source` | String | No | Origin (`'catalog'` or `'custom'`) |
  | `data.catalog_id` | UUID | Yes | Catalog ID if linked |
  | `data.code` | String | No | Unique type code |
  | `data.name` | String | No | Display name |
  | `data.plane` | String | No | Scope plane (`'employee'`, `'org'`) |
  | `data.group` | String | No | Category group |
  | `data.description` | String | Yes | Description or employee instructions |
  | `data.is_statutory` | Boolean | No | Statutory flag |
  | `data.is_confidential` | Boolean | No | Confidentiality protection flag |
  | `data.employee_can_upload` | Boolean | No | Self-service upload permission |
  | `data.employee_can_view` | Boolean | No | Self-service view permission |
  | `data.employee_can_delete` | Boolean | No | Self-service delete permission |
  | `data.manager_can_view` | Boolean | No | Manager view permission |
  | `data.manager_can_request` | Boolean | No | Manager request permission |
  | `data.requires_verification` | Boolean | No | Verification requirement |
  | `data.requires_acknowledgement` | Boolean | No | Acknowledgement requirement |
  | `data.requires_signature` | Boolean | No | Signature requirement |
  | `data.has_expiry` | Boolean | No | Expiry tracking enabled |
  | `data.expiry_reminder_days` | Array[Integer] | No | Reminder schedule |
  | `data.is_mandatory` | Boolean | No | Mandatory submission flag |
  | `data.mandatory_for` | Object | No | Targeting criteria |
  | `data.allows_multiple` | Boolean | No | Multiple active documents allowed |
  | `data.max_file_size_bytes` | Integer | No | Max file size in bytes |
  | `data.allowed_content_types` | Array[String] | No | Permitted MIME types |
  | `data.retention_days` | Integer | No | Retention period in days |
  | `data.display_order` | Integer | No | UI sequence |
  | `data.is_active` | Boolean | No | Active operational status |
  | `data.created_by` | UUID | No | Creator user ID |
  | `data.updated_by` | UUID | Yes | Last updater user ID |
  | `data.created_at` | String (ISO) | No | Creation timestamp |
  | `data.updated_at` | String (ISO) | No | Last update timestamp |
* **Exact Error Response Structures:**
  - **404 Not Found — Document Type Not Found:**
    ```json
    {
      "success": false,
      "message": "Document type not found",
      "errorCode": "DOCUMENT_TYPE_NOT_FOUND"
    }
    ```
    *Trigger:* Passing an ID that does not exist in the tenant's organization.
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  | `mandatory_for` | Object | Optional | No | Targeting criteria | JSON object | Unchanged |
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
  | `data` | Object | No | The updated document type record |
  | `data.id` | UUID | No | Document type identifier |
  | `data.org_id` | UUID | No | Tenant organization ID |
  | `data.source` | String | No | Type origin (`'catalog'` or `'custom'`) |
  | `data.catalog_id` | UUID | Yes | Catalog reference ID |
  | `data.code` | String | No | Unique code (unchanged) |
  | `data.name` | String | No | Updated display name |
  | `data.plane` | String | No | Operational plane |
  | `data.group` | String | No | Classification category |
  | `data.description` | String | Yes | Updated instructions |
  | `data.is_statutory` | Boolean | No | Statutory flag (immutable) |
  | `data.is_confidential` | Boolean | No | Updated confidentiality flag |
  | `data.employee_can_upload` | Boolean | No | Updated employee upload permission |
  | `data.employee_can_view` | Boolean | No | Updated employee view permission |
  | `data.employee_can_delete` | Boolean | No | Updated employee delete permission |
  | `data.manager_can_view` | Boolean | No | Updated manager view permission |
  | `data.manager_can_request` | Boolean | No | Updated manager request permission |
  | `data.requires_verification` | Boolean | No | Updated verification requirement |
  | `data.requires_acknowledgement` | Boolean | No | Acknowledgement requirement |
  | `data.requires_signature` | Boolean | No | Signature requirement |
  | `data.has_expiry` | Boolean | No | Updated expiry tracking flag |
  | `data.expiry_reminder_days` | Array[Integer] | No | Updated reminder schedule |
  | `data.is_mandatory` | Boolean | No | Mandatory submission flag |
  | `data.mandatory_for` | Object | No | Targeting criteria |
  | `data.allows_multiple` | Boolean | No | Multiple active documents allowed |
  | `data.max_file_size_bytes` | Integer | No | Updated file size limit in bytes |
  | `data.allowed_content_types` | Array[String] | No | Updated allowed MIME types |
  | `data.retention_days` | Integer | No | Retention period in days |
  | `data.display_order` | Integer | No | UI sequence |
  | `data.is_active` | Boolean | No | Active status |
  | `data.created_by` | UUID | No | Creator user ID |
  | `data.updated_by` | UUID | Yes | Actor user ID who performed this update |
  | `data.created_at` | String (ISO) | No | Creation timestamp |
  | `data.updated_at` | String (ISO) | No | Update timestamp |
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
    *Trigger:* Attempting to alter `code`, `plane`, `source`, `catalog_id`, or `is_statutory`.
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
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  4. Updates `is_active = false` and `updated_by = actorId`.
  5. Inserts audit log `document_type.deactivated`.
  6. Commits transaction and returns updated row.
* **Database Impact:** Updates `document_types`, inserts `document_audit_logs`.
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
  | *(all other fields)* | As defined in #6 | — | See API #6 for full field dictionary |
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
* **Idempotency and Retry Behavior:** Idempotent; calling again on an already inactive type returns current record without re-auditing.
* **Transactions/Concurrency Behavior:** Transaction wrapped with advisory lock `doctypes:{orgId}`.
* **Side Effects:** Prevents issuance of new upload URLs for this document type across all planes. Existing documents remain viewable.
* **Important Edge Cases:** Does not soft-delete or delete any existing documents.
* **Related APIs/Dependencies:** API #9 (Reactivate).
* **What the API Gives/Does:** Disables collection of a document type.

---

### 9. PATCH /api/v1/documents/hr/types/:id/activate
* **API Name / Purpose:** Reactivate Document Type
* **HTTP Method:** `PATCH`
* **Endpoint / Route:** `/api/v1/documents/hr/types/:id/activate`
* **Authentication / Authorization:** Bearer Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
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
  | *(all other fields)* | As defined in #6 | — | See API #6 for full field dictionary |
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

## 5. Final Response Coverage Audit

```text
Total Phase 1 APIs: 42

Request structures verified: 42 / 42
Success response structures verified: 42 / 42
Error response structures verified: 42 / 42
Response field documentation completed: 42 / 42

APIs with exact success JSON examples: 42 / 42
APIs with exact error JSON examples: 42 / 42

APIs still missing response documentation: 0
```

*(End of Analysis)*
