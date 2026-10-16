# Phase 1: PDF Generation Module (Letter Branding & Templates) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint architectural, security, and technical analysis of the **9 APIs (#130–#138)** implemented in Phase 1 of the PDF Generation module. It provides implementation-accurate request contracts, JSON success responses, binary stream response specifications, field-level data dictionaries, database transaction boundaries, PDF rendering mechanics, and implementation-defined error structures.

---

## Executive Architectural Premise & Security Posture

### 1. Tenant Plane Isolation & Role Authorization
The PDF Generation module operates strictly on the tenant plane under the Document Module routing hierarchy (`/api/v1/documents/hr/*`).
* **Tenant Scoping:** Every incoming request strictly requires an authenticated JWT bearer token. The tenant identifier (`orgId`) is extracted directly from the verified token claims (`req.user.orgId`). No endpoint accepts an `org_id` in the URL path or request payload, structurally eliminating Insecure Direct Object References (IDOR) across tenants.
* **Role Gate:** All 9 Phase 1 endpoints are restricted to the `hr` role via `authorize(['hr'])`. Employee, manager, and platform administrative roles (`admin`, `super-admin`, `worker`) are categorically locked out with HTTP `403 Forbidden` (`INSUFFICIENT_PERMISSIONS`).
* **Feature Flag:** Every endpoint enforces the active entitlement of the `documents.access` feature flag via `requireFeature('documents.access')`. If disabled or missing, requests terminate immediately with HTTP `403 Forbidden` (`FEATURE_DISABLED`).

### 2. Unauthenticated Renderer Defense (D-14 Scope Boundary)
In Phase 1, the external Puppeteer rendering service (running on an AWS Lambda/container infrastructure via `PDF_RENDERER_BASE_URL`) is currently unauthenticated. 
* **PII Exfiltration Defense:** Phase 1 enforces a strict architectural boundary (§1.4(2) of the implementation plan): **no real employee Personally Identifiable Information (PII) is ever processed or transmitted to the renderer**.
* **Sample Data Only:** The preview endpoint (#138) renders synthetic catalog `sample_data` merged with organization-level `saved_fields` and ephemeral `override_fields`.
* **Prohibition of Subject Context:** The request schema strictly disallows `subject_user_id` (`allowUnknown: false`). Any attempt to pass an employee ID or real employee facts fails input validation with HTTP `400 Bad Request` (`VALIDATION_ERROR`).

### 3. Pure Builder Pattern & Byte Determinism (D-15, D-16)
All view-model transformations for PDF generation are handled by pure, side-effect-free builders:
* **Clock Isolation:** Neither `branding.builder.js` nor `letter_preview.builder.js` reads system time. Pinned UTC date strings (`YYYY-MM-DD` via `todayIso()`) are generated exclusively at the service layer and passed as immutable arguments, ensuring byte-identical rendering across disparate execution environments.
* **Zero Null Propagation:** Handlebars renders missing, `undefined`, or `null` values as empty strings (`""`), which could silently create unpopulated blanks in legal contracts. If any required template field evaluates to empty, the builder fails loud with HTTP `422 Unprocessable Entity` (`PDF_DATA_INCOMPLETE`). Optional fields are explicitly omitted from the view model so that template conditional blocks (`{{#if field}}...{{/if}}`) cleanly collapse rather than rendering vacant lines.

### 4. S3 Storage & Raster-Only Asset Handshake (D-12)
Branding asset uploads (company logo, authorized signatory signature) utilize an asynchronous presigned URL pattern that guarantees the backend API never buffers binary image files:
1. **Presigned Upload:** HR requests an upload URL (#132), specifying `asset_type`, MIME type, and byte size.
2. **Strict Media Type Restrictions:** Only raster images (`image/png`, `image/jpeg`) are accepted. Vector formats like SVG are strictly prohibited (`415 UNSUPPORTED_MEDIA_TYPE`) to prevent Stored Cross-Site Scripting (XSS) and script execution within the headless Chromium renderer.
3. **Signed State Claim:** Rather than tracking unconfirmed files via mutable database columns, the asset claim is cryptographically sealed into a short-lived (10-minute) purpose-scoped JWT (`storage_key_token`).
4. **Server-Side Verification:** Upon confirmation (#133), the backend executes an S3 `HeadObject` call outside of any database transaction. It verifies actual byte size against asset caps (Logo: 512 KB, Signature: 256 KB) and validates the S3-reported `ContentType` against allowed MIME types before committing the storage key to the database.

### 5. Dual-Transaction Boundary Pattern (D-24, §17.1)
Network I/O is strictly forbidden inside database transaction boundaries:
* **Transaction 1:** An initial transaction inserts a tracking row into `pdf_render_artifacts` with status `pending` and calculates an SHA-256 `input_hash` over the canonicalized view-model JSON.
* **Network Phase:** The HTTP POST request to the renderer (`/v1/pdf/generate`) and any S3 byte writes occur completely outside database transactions.
* **Transaction 2:** Upon successful generation and verification of PDF magic bytes (`%PDF-` header and `%%EOF` trailer), a second transaction transitions the artifact status to `ready`, sets `content_hash`, `size_bytes`, and `render_ms`, and writes an immutable audit record to `document_audit_logs`.
* **Failure Decoupling:** If the renderer or network fails, an independent transaction records `failed` status, persisting the `failure_code` and truncated `failure_reason` for diagnostics without holding locks.

### 6. Advisory Locks & Concurrency Controls
* **Asset Confirmation Lock:** Asset confirmation (#133) enforces serialization per organization using PostgreSQL transaction-scoped advisory locks: `SELECT pg_advisory_xact_lock(hashtext('letter-branding:' || :orgId))`, followed by row-level locking (`FOR UPDATE`) on `document_letter_branding`.
* **Config Upsert Concurrency:** Template configuration writes (#137) utilize row-level locking (`FOR UPDATE`) with automated retry logic on unique constraint violations (`document_letter_configs_org_template_uq`) to eliminate insertion races.
* **Idempotency De-duplication:** Artifact generation is indexed uniquely by `(org_id, idempotency_key)`. Concurrent duplicate preview requests detect existing in-flight rows and safely reuse or stream the resulting payload without duplicate rendering.

### 7. Preview Rate Limiting & Watermarking
* **Redis Rolling Limiter:** Preview endpoints (#134, #138) enforce an hourly rate cap per organization (`pdf:preview:{orgId}:{YYYYMMDDHH}`) driven by setting #83 (`letter_preview_rate_per_hour`, default 60). Excess calls trigger HTTP `429 Too Many Requests` (`PREVIEW_RATE_LIMITED`). The limiter fails open if Redis is unavailable.
* **Mandatory Watermark:** All preview outputs render with `data.is_preview = true`, triggering a diagonal, semi-transparent `PREVIEW` watermark across every page to prevent unissued previews from being circulated as official corporate documents.

---

## API Summary Index

| API # | Method | Endpoint | Primary Purpose | Response Type | Roles / Permissions |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **#130** | `GET` | `/api/v1/documents/hr/letter-branding` | Retrieve organization letterhead identity, inherited profile data, and asset presence | JSON (`200`) | `hr` · `documents.access` |
| **#131** | `PUT` | `/api/v1/documents/hr/letter-branding` | Replace letterhead identity text fields, address lines, and accent styling | JSON (`200`) | `hr` · `documents.access` |
| **#132** | `POST` | `/api/v1/documents/hr/letter-branding/assets/upload-url` | Generate S3 presigned PUT URL and cryptographic token for logo/signature | JSON (`201`) | `hr` · `documents.access` |
| **#133** | `POST` | `/api/v1/documents/hr/letter-branding/assets/confirm` | Verify uploaded asset via S3 HEAD and commit storage key under advisory lock | JSON (`200`) | `hr` · `documents.access` |
| **#134** | `POST` | `/api/v1/documents/hr/letter-branding/preview` | Stream an inline watermarked A4 PDF letterhead probe to preview branding | Binary PDF (`200`) | `hr` · `documents.access` |
| **#135** | `GET` | `/api/v1/documents/hr/letter-templates` | List letter catalog joined with organization enablement state and orphan flags | JSON (`200`) | `hr` · `documents.access` |
| **#136** | `GET` | `/api/v1/documents/hr/letter-templates/:code` | Get template field form descriptor, sample data, and organization saved config | JSON (`200`) | `hr` · `documents.access` |
| **#137** | `PUT` | `/api/v1/documents/hr/letter-templates/:code/config` | Update template enablement and validate/persist organization saved fields | JSON (`200`) | `hr` · `documents.access` |
| **#138** | `POST` | `/api/v1/documents/hr/letter-templates/:code/preview` | Stream an inline watermarked PDF preview merging sample, saved, and override fields | Binary PDF (`200`) | `hr` · `documents.access` |

---

## Detailed Endpoint Specifications

### 130. GET /api/v1/documents/hr/letter-branding
* **API Name / Purpose:** Get Organization Letterhead Branding Identity
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-branding`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR administrators need to review their organization's letterhead configuration—including corporate identifiers (CIN, GSTIN, PAN, TAN), authorized signatories, official addresses, styling color palettes, and upload status of logos and signatures—prior to issuing formal letters or generating PDF previews.
* **Why the API Exists:** Provides a secure Data Transfer Object (DTO) that abstracts internal S3 storage keys away from the client interface while merging explicit letterhead overrides with fallbacks inherited from the primary organization profile.
* **Real-World Usage:** Invoked by the HR frontend when navigating to the "Letterhead & Branding Settings" tab in the administrative portal.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `include_asset_urls` | Query | Boolean | Optional | No | `false` | When set to `true`, generates short-lived (300 seconds) S3 presigned GET URLs for viewing existing logo and signature assets. Allowed values: `true`, `false`. |

* **Backend Processing Flow:**
  1. Authenticates request and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` from JWT claims (`req.user.orgId`).
  3. Queries `document_letter_branding` by `org_id`.
  4. If no branding record exists:
     a. Initiates a database transaction.
     b. Executes `findOrCreate` on `document_letter_branding` with default attributes (`accent_color_hex: '#1F2937'`, `letterhead_enabled: true`, `registered_address_lines: []`).
     c. Records an audit entry in `document_audit_logs` with action `letter_branding.initialized`.
     d. Commits the transaction.
  5. Queries `organization_profiles` by `org_id` to assemble inherited corporate metadata.
  6. Transforms database row into a safe DTO via `toBrandingDto()` (omits all `*_storage_key` fields, returning boolean existence and file size/MIME metadata).
  7. If `include_asset_urls === true`, requests temporary presigned GET URLs from AWS S3 via `s3Provider.getViewUrl()` with a 300-second TTL.
  8. Returns HTTP `200 OK` with payload envelope containing `branding`, `inherited`, and `assets` objects.

* **Database Impact:**
  * **Reads:** `document_letter_branding` (`SELECT ... WHERE org_id = :orgId`), `organization_profiles` (`SELECT ... WHERE org_id = :orgId`).
  * **Writes (First Access Only):** Inserts initial row into `document_letter_branding` and inserts audit record into `document_audit_logs`.
  * **Locking:** No locks on read; uses transaction for atomic initialization if the row does not yet exist.

* **PDF Generation Impact:** None.
* **File / Storage Impact:** Generates temporary presigned GET URLs via AWS S3 STS when `include_asset_urls=true`. No bucket writes or file modifications occur.
* **Concurrency & Transactions:** First access creates the row inside an atomic transaction. A catch block traps race condition unique constraint violations (`SequelizeUniqueConstraintError`) and re-queries the row cleanly.
* **Idempotency & Retry Behavior:** Fully idempotent. Safe to retry freely.

* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Branding loaded",
    "data": {
      "branding": {
        "signatory_name": "Rajesh Sharma",
        "signatory_designation": "Director of Human Resources",
        "registered_address_lines": [
          "Tower B, 9th Floor, Tech Park",
          "Outer Ring Road, Bellandur",
          "Bengaluru, Karnataka 560103"
        ],
        "cin": "U72200KA2020PTC123456",
        "gstin": "29ABCDE1234F1Z5",
        "pan": "ABCDE1234F",
        "tan": "BLRE12345F",
        "contact_email": "hr@acme-corp.com",
        "contact_phone": "+91 80 4123 4567",
        "website": "https://www.acme-corp.com",
        "accent_color_hex": "#1E40AF",
        "footer_note": "This is a computer-generated letter and requires an authorized digital signature.",
        "letterhead_enabled": true,
        "logo_present": true,
        "logo_content_type": "image/png",
        "logo_size_bytes": 48210,
        "signature_present": true,
        "signature_content_type": "image/png",
        "signature_size_bytes": 22150,
        "updated_at": "2026-09-27T01:30:00.000Z"
      },
      "inherited": {
        "org_name": "Acme Technologies Private Limited",
        "website": "https://www.acme-corp.com",
        "phone_number": "+91 80 4000 0000",
        "address_line_1": "Tower B, 9th Floor",
        "address_line_2": "Outer Ring Road",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "zip_code": "560103",
        "gst_number": "29ABCDE1234F1Z5",
        "company_pan_number": "ABCDE1234F",
        "logo_url": "https://cdn.acme-corp.com/assets/logo.png"
      },
      "assets": {
        "logo_present": true,
        "signature_present": true,
        "logo_url": "https://payroll-s3-bucket.s3.ap-south-1.amazonaws.com/org/7c9e6679-7425-40de-944b-e07fc1f90ae7/branding/logo/uuid.png?X-Amz-Signature=...",
        "signature_url": "https://payroll-s3-bucket.s3.ap-south-1.amazonaws.com/org/7c9e6679-7425-40de-944b-e07fc1f90ae7/branding/signature/uuid.png?X-Amz-Signature=..."
      }
    }
  }
  ```

* **Response Field Documentation:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :---: | :--- | :--- |
  | `success` | Boolean | No | Request success status | Always `true` for 200 responses |
  | `message` | String | No | Human-readable outcome message | Always `"Branding loaded"` |
  | `data` | Object | No | Root response data envelope | Top-level payload |
  | `data.branding` | Object | No | Organization letterhead branding configuration | DTO mapped from `document_letter_branding` |
  | `data.branding.signatory_name` | String | Yes | Name of official authorized signatory | Direct column; used in letter closing |
  | `data.branding.signatory_designation` | String | Yes | Official designation of authorized signatory | Direct column; printed below signatory name |
  | `data.branding.registered_address_lines` | Array[String] | No | Up to 5 lines of corporate registered address | Direct array column; printed in letter header |
  | `data.branding.cin` | String | Yes | Corporate Identification Number | Direct column |
  | `data.branding.gstin` | String | Yes | Goods and Services Tax Identification Number | Direct column |
  | `data.branding.pan` | String | Yes | Permanent Account Number | Direct column |
  | `data.branding.tan` | String | Yes | Tax Deduction and Collection Account Number | Direct column |
  | `data.branding.contact_email` | String | Yes | Official contact email printed on letterhead | Direct column |
  | `data.branding.contact_phone` | String | Yes | Official contact phone printed on letterhead | Direct column |
  | `data.branding.website` | String | Yes | Official corporate website URL | Direct column |
  | `data.branding.accent_color_hex` | String | No | Hex color code for borders, accents, rules | 6-digit hex format (e.g. `#1E40AF`) |
  | `data.branding.footer_note` | String | Yes | Mandatory disclaimer printed in letter footer | Max 300 chars; printed at bottom margin |
  | `data.branding.letterhead_enabled` | Boolean | No | Master toggle for letterhead compositing | When `false`, suppresses header, logo & signature |
  | `data.branding.logo_present` | Boolean | No | Indicates whether an official logo is stored | Evaluated from `Boolean(logo_storage_key)` |
  | `data.branding.logo_content_type` | String | Yes | MIME type of stored logo | E.g. `image/png`, `image/jpeg` |
  | `data.branding.logo_size_bytes` | Integer | Yes | File size of stored logo in bytes | Direct column from S3 metadata |
  | `data.branding.signature_present` | Boolean | No | Indicates whether official signature is stored | Evaluated from `Boolean(signature_storage_key)` |
  | `data.branding.signature_content_type` | String | Yes | MIME type of stored signature image | E.g. `image/png`, `image/jpeg` |
  | `data.branding.signature_size_bytes` | Integer | Yes | File size of stored signature in bytes | Direct column from S3 metadata |
  | `data.branding.updated_at` | String (ISO) | No | Timestamp when branding was last modified | Database timestamp |
  | `data.inherited` | Object | No | Baseline corporate data from organization profile | Source: `organization_profiles` table |
  | `data.inherited.org_name` | String | Yes | Registered organization legal name | Profile fallback for header |
  | `data.inherited.website` | String | Yes | Profile website URL | Fallback if branding website is null |
  | `data.inherited.phone_number` | String | Yes | Profile primary contact number | Fallback phone number |
  | `data.inherited.address_line_1` | String | Yes | Profile primary address line | Fallback address component |
  | `data.inherited.address_line_2` | String | Yes | Profile secondary address line | Fallback address component |
  | `data.inherited.city` | String | Yes | Profile registered city | Fallback address component |
  | `data.inherited.state` | String | Yes | Profile registered state/province | Fallback address component |
  | `data.inherited.country` | String | Yes | Profile registered country | Fallback address component |
  | `data.inherited.zip_code` | String | Yes | Profile postal/PIN code | Fallback address component |
  | `data.inherited.gst_number` | String | Yes | Profile GST registration number | Fallback identifier |
  | `data.inherited.company_pan_number` | String | Yes | Profile PAN registration number | Fallback identifier |
  | `data.inherited.logo_url` | String | Yes | Public marketing logo URL | Informational reference |
  | `data.assets` | Object | No | Asset presence flags and optional view URLs | Dynamic asset container |
  | `data.assets.logo_present` | Boolean | No | Flag indicating if logo asset exists | Mirror of branding DTO |
  | `data.assets.signature_present` | Boolean | No | Flag indicating if signature asset exists | Mirror of branding DTO |
  | `data.assets.logo_url` | String | Yes | Presigned S3 GET URL for logo | Present only when `include_asset_urls=true` |
  | `data.assets.signature_url` | String | Yes | Presigned S3 GET URL for signature | Present only when `include_asset_urls=true` |

* **Exact Error Response Structures:**
  * **401 Unauthorized:**
    ```json
    {
      "success": false,
      "message": "Authentication token is missing or invalid",
      "errorCode": "UNAUTHORIZED"
    }
    ```
    *Trigger:* Missing or invalid `Authorization: Bearer <token>` header.
  * **403 Forbidden — Insufficient Permissions:**
    ```json
    {
      "success": false,
      "message": "User does not have required permissions",
      "errorCode": "INSUFFICIENT_PERMISSIONS"
    }
    ```
    *Trigger:* Authenticated caller does not have the `hr` role.
  * **403 Forbidden — Feature Disabled:**
    ```json
    {
      "success": false,
      "message": "Feature 'documents.access' is not enabled for your organization",
      "errorCode": "FEATURE_DISABLED"
    }
    ```
    *Trigger:* The organization lacks the `documents.access` feature flag.

* **Security & Authorization Behavior:** Strictly isolates data by `req.user.orgId`. Storage keys are completely scrubbed from the response to prevent S3 internal path enumeration.
* **Important Edge Cases:** If the S3 provider fails during presigned URL generation, errors are trapped and logged as warnings; `logo_url` / `signature_url` resolve to `null` without crashing the endpoint.
* **Related APIs / Dependencies:** API #131 (`PUT /letter-branding`), API #132 (`POST /assets/upload-url`), API #134 (`POST /preview`).

---

### 131. PUT /api/v1/documents/hr/letter-branding
* **API Name / Purpose:** Update Organization Letterhead Branding Identity
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-branding`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to configure and maintain authoritative corporate letterhead data, ensuring statutory compliance (correct CIN, GSTIN, PAN numbers) and accurate representation of signatories on issued documentation.
* **Why the API Exists:** Provides atomic replacement and partial-update semantics for text-based branding attributes while strictly preserving binary asset storage pointers managed separately via the presigned handshake.
* **Real-World Usage:** Invoked when HR clicks "Save Changes" on the branding configuration form.
* **Request Parameters:** None (URL path has no parameters).
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `signatory_name` | Body | String | Optional | Yes | None | Full legal name of authorized signatory. Max 120 chars. Must not contain `<` or `>`. Empty string clears to `null`. |
  | `signatory_designation` | Body | String | Optional | Yes | None | Title/role of signatory. Max 120 chars. Must not contain `<` or `>`. Empty string clears to `null`. |
  | `registered_address_lines` | Body | Array[String]| Optional | No | `[]` | Up to 5 lines of physical registered address. Each item max 120 chars without `<` or `>`. |
  | `cin` | Body | String | Optional | Yes | None | Corporate Identification Number. Max 32 chars. Empty string clears to `null`. |
  | `gstin` | Body | String | Optional | Yes | None | GSTIN identifier. Max 32 chars. Empty string clears to `null`. |
  | `pan` | Body | String | Optional | Yes | None | Company PAN identifier. Max 32 chars. Empty string clears to `null`. |
  | `tan` | Body | String | Optional | Yes | None | Company TAN identifier. Max 32 chars. Empty string clears to `null`. |
  | `contact_email` | Body | String | Optional | Yes | None | Valid corporate email address. Max 150 chars. Empty string clears to `null`. |
  | `contact_phone` | Body | String | Optional | Yes | None | Official contact phone number. Max 30 chars. Empty string clears to `null`. |
  | `website` | Body | String | Optional | Yes | None | Valid HTTPS website URI. Max 255 chars. Scheme must be `https`. Empty string clears to `null`. |
  | `accent_color_hex` | Body | String | Optional | No | None | Exact 6-digit hex color format matching `^#[0-9A-Fa-f]{6}$` (e.g. `#2563EB`). CSS injection defense. |
  | `footer_note` | Body | String | Optional | Yes | None | Statutory or operational disclaimer printed at bottom margin. Max 300 chars. |
  | `letterhead_enabled` | Body | Boolean | Optional | No | None | When `false`, completely disables branding compositing on generated documents. |

* **Validation Rules:**
  * Root object enforces `.min(1)`: At least one field must be provided in the request body.
  * All text fields enforce regex `^[^<>]*$` to prevent HTML/XSS injection through Handlebars interpolation.
  * `accent_color_hex` is strictly validated against `^#[0-9A-Fa-f]{6}$` because it is interpolated into inline CSS `<style>` blocks (BR-16 CSS-injection defense).
  * `registered_address_lines` array length cannot exceed 5 items.

* **Request JSON Payload Example:**
  ```json
  {
    "signatory_name": "Priya Nair",
    "signatory_designation": "Vice President - People & Culture",
    "registered_address_lines": [
      "Building 4, Infinity Park",
      "Doddakannelli, Sarjapur Road",
      "Bengaluru, Karnataka 560035"
    ],
    "cin": "U72900KA2021PTC987654",
    "gstin": "29XYZAB5678C1Z2",
    "pan": "XYZAB5678C",
    "tan": "BLRZ56789C",
    "contact_email": "people@acme-corp.com",
    "contact_phone": "+91 80 6111 2222",
    "website": "https://www.acme-corp.com",
    "accent_color_hex": "#0D9488",
    "footer_note": "Confidential - Acme Technologies Private Limited",
    "letterhead_enabled": true
  }
  ```

* **Backend Processing Flow:**
  1. Validates request body against `replaceBrandingSchema`.
  2. Opens database transaction.
  3. Executes `findByOrgId` with `lock: true` (`SELECT ... FOR UPDATE`) to acquire exclusive row lock on `document_letter_branding`.
  4. If record does not exist, executes `findOrCreate` to initialize it.
  5. Captures pre-update DTO state (`before`) for audit logging.
  6. Maps provided fields:
     - Non-empty strings are updated directly.
     - Empty strings (`""`) or `null` values explicitly clear the column to `NULL` (except `accent_color_hex`, which is schema-constrained `NOT NULL`).
     - Preserves asset columns (`logo_storage_key`, `signature_storage_key`, etc.) without modification.
  7. Updates `document_letter_branding` setting `updated_by = req.user.id`.
  8. Records an audit entry in `document_audit_logs`:
     - `action`: `letter_branding.updated`
     - `entityType`: `document_letter_branding`
     - `oldValues`: `before`
     - `newValues`: `after`
  9. Commits transaction and returns assembled response.

* **Database Impact:**
  * **Updates:** `document_letter_branding` (`signatory_name`, `signatory_designation`, `registered_address_lines`, `cin`, `gstin`, `pan`, `tan`, `contact_email`, `contact_phone`, `website`, `accent_color_hex`, `footer_note`, `letterhead_enabled`, `updated_by`, `updated_at`).
  * **Inserts:** `document_audit_logs` record capturing full diff.
  * **Locking:** Explicit pessimistic row lock (`FOR UPDATE`) throughout transaction.

* **PDF Generation Impact:** Immediate. All subsequent preview generations (#134, #138) will immediately reflect the updated branding metadata and color palette.
* **File / Storage Impact:** None. Binary asset keys are untouched.
* **Concurrency & Transactions:** Fully protected by row lock (`FOR UPDATE`) inside an isolated transaction. Concurrent updates serialize cleanly without lost updates.
* **Idempotency & Retry Behavior:** Fully idempotent for identical payloads.

* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Branding updated",
    "data": {
      "branding": {
        "signatory_name": "Priya Nair",
        "signatory_designation": "Vice President - People & Culture",
        "registered_address_lines": [
          "Building 4, Infinity Park",
          "Doddakannelli, Sarjapur Road",
          "Bengaluru, Karnataka 560035"
        ],
        "cin": "U72900KA2021PTC987654",
        "gstin": "29XYZAB5678C1Z2",
        "pan": "XYZAB5678C",
        "tan": "BLRZ56789C",
        "contact_email": "people@acme-corp.com",
        "contact_phone": "+91 80 6111 2222",
        "website": "https://www.acme-corp.com",
        "accent_color_hex": "#0D9488",
        "footer_note": "Confidential - Acme Technologies Private Limited",
        "letterhead_enabled": true,
        "logo_present": true,
        "logo_content_type": "image/png",
        "logo_size_bytes": 48210,
        "signature_present": true,
        "signature_content_type": "image/png",
        "signature_size_bytes": 22150,
        "updated_at": "2026-09-27T01:35:12.890Z"
      },
      "inherited": {
        "org_name": "Acme Technologies Private Limited",
        "website": "https://www.acme-corp.com",
        "phone_number": "+91 80 4000 0000",
        "address_line_1": "Tower B, 9th Floor",
        "address_line_2": "Outer Ring Road",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "zip_code": "560103",
        "gst_number": "29ABCDE1234F1Z5",
        "company_pan_number": "ABCDE1234F",
        "logo_url": "https://cdn.acme-corp.com/assets/logo.png"
      },
      "assets": {
        "logo_present": true,
        "signature_present": true
      }
    }
  }
  ```

* **Exact Error Response Structures:**
  * **400 Bad Request — Empty Payload:**
    ```json
    {
      "success": false,
      "message": "\"value\" must have at least 1 key",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Sending `{}` with no fields to update.
  * **400 Bad Request — Illegal HTML Characters:**
    ```json
    {
      "success": false,
      "message": "\"signatory_name\" must not contain < or >",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing characters `<` or `>` in any text field.
  * **400 Bad Request — Invalid Accent Hex Format:**
    ```json
    {
      "success": false,
      "message": "accent_color_hex must be a 6-digit hex colour like #1F2937",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing an invalid hex string (e.g. `blue`, `#FFF`, `123456`).
  * **400 Bad Request — Insecure Non-HTTPS URI:**
    ```json
    {
      "success": false,
      "message": "\"website\" must be a valid uri with a scheme matching the https pattern",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing an `http://` or non-standard URI scheme for website.

* **Security & Authorization Behavior:** Validates all fields against HTML and CSS injection attacks. Enforces pessimistic locking so that parallel HR updates do not interleave corrupted states.
* **Important Edge Cases:** Setting `accent_color_hex: null` or `""` is ignored and rejected from deletion, preserving the existing color or database default `#1F2937`.
* **Related APIs / Dependencies:** API #130 (`GET /letter-branding`), API #134 (`POST /preview`).

---

### 132. POST /api/v1/documents/hr/letter-branding/assets/upload-url
* **API Name / Purpose:** Issue S3 Presigned Upload URL for Branding Asset
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-branding/assets/upload-url`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to upload official branding media (corporate logos and authorized signatory signatures) securely and directly to AWS S3 without passing bulky binary files through the Node.js application server.
* **Why the API Exists:** Issues a cryptographically signed presigned PUT URL with restricted headers, strict size boundaries, and a signed verification token that prevents storage path tampering.
* **Real-World Usage:** Triggered when an HR user selects an image file in the Logo or Signature file picker component.
* **Request Parameters:** None.
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `asset_type` | Body | String | Required | No | None | Type of letterhead asset. Allowed values: `'logo'`, `'signature'`. |
  | `file_name` | Body | String | Required | No | None | Original filename. Min 1, max 255 chars. Used to derive extension. |
  | `content_type` | Body | String | Required | No | None | Image MIME type. Allowed values: `'image/png'`, `'image/jpeg'`. SVGs banned. |
  | `size_bytes` | Body | Integer | Required | No | None | Exact file size in bytes. Min 1. Upper limit depends on `asset_type`. |

* **Validation & Business Rules:**
  * **Asset Size Limits (BR-1):**
    * `logo`: Maximum **524,288 bytes** (512 KB).
    * `signature`: Maximum **262,144 bytes** (256 KB).
  * **SVG Ban (D-12):** Vector graphics (`image/svg+xml`) are strictly rejected with HTTP `415 Unsupported Media Type` to eliminate script execution and SSRF vulnerabilities in the headless Chromium renderer.
  * **Storage Key Format:** Generated strictly on the server: `org/{orgId}/branding/{assetType}/{UUID}{ext}`.

* **Request JSON Payload Example:**
  ```json
  {
    "asset_type": "logo",
    "file_name": "company_crest_highres.png",
    "content_type": "image/png",
    "size_bytes": 142850
  }
  ```

* **Backend Processing Flow:**
  1. Validates payload shape via `assetUploadUrlSchema`.
  2. Verifies that object storage is operational via `s3Config.isConfigured()`. Throws HTTP `502 Bad Gateway` (`STORAGE_UNAVAILABLE`) if unconfigured.
  3. Enforces asset size constraints: if `size_bytes > ASSET_SIZE_CAPS[asset_type]`, throws HTTP `413 Payload Too Large` (`FILE_TOO_LARGE`).
  4. Generates a secure, unguessable storage key: `org/${orgId}/branding/${assetType}/${randomUUID()}.${ext}`.
  5. Requests a presigned PUT URL from `s3Provider.getUploadUrl()` with a 600-second (10-minute) TTL and exact `Content-Length` / `Content-Type` headers bound into the AWS signature.
  6. Encodes a Purpose-Scoped Claim Token (`storage_key_token`) using `jwtUtils.generateLetterAssetToken()` signed with application secret:
     - `org_id`: `orgId`
     - `asset_type`: `asset_type`
     - `storage_key`: `storageKey`
     - `claimed_content_type`: `content_type`
     - `claimed_size_bytes`: `size_bytes`
     - `file_name`: `file_name`
     - `purpose`: `'letter_asset_upload'`
     - `exp`: 10 minutes from issuance
  7. Inserts an audit log entry in `document_audit_logs` inside a transaction:
     - `action`: `letter_branding.asset_upload_requested`
  8. Returns HTTP `201 Created` containing the `upload_url`, `storage_key_token`, `expires_in`, and `required_headers`.

* **Database Impact:**
  * **Inserts:** One row in `document_audit_logs`.
  * **Modifications:** None. The branding record is **not** touched until confirmation (#133), leaving zero orphan records if the upload is aborted.

* **PDF Generation Impact:** None.
* **File / Storage Impact:** Generates an AWS S3 presigned PUT URL with strict header constraints. Does not directly create an S3 object.
* **Concurrency & Transactions:** Purely additive audit write. No row locking required.
* **Idempotency & Retry Behavior:** Non-idempotent; each request generates a fresh unique storage key and signed token.

* **Success Response Structure (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Upload URL issued",
    "data": {
      "upload_url": "https://payroll-s3-bucket.s3.ap-south-1.amazonaws.com/org/7c9e6679-7425-40de-944b-e07fc1f90ae7/branding/logo/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...",
      "storage_key_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdfaWQiOiI3YzllNjY3OS03NDI1LTQwZGUtOTQ0Yi1lMDdmYzFmOTBhZTciLCJhc3NldF90eXBlIjoibG9nbyIsInN0b3JhZ2Vfa2V5Ijoib3JnLzdjOWU2Njc5LTc0MjUtNDBkZS05NDRiLWUwN2ZjMWY5MGFlNy9icmFuZGluZy9sb2dvLzliMWRlYjRkLTNiN2QtNGJhZC05YmRkLTJiMGQ3YjNkY2I2ZC5wbmciLCJwdXJwb3NlIjoibGV0dGVyX2Fzc2V0X3VwbG9hZCIsImlhdCI6MTc1ODk0MDYwMCwiZXhwIjoxNzU4OTQxMjAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      "expires_in": 600,
      "required_headers": {
        "content-type": "image/png",
        "content-length": "142850"
      }
    }
  }
  ```

* **Response Field Documentation:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :---: | :--- | :--- |
  | `success` | Boolean | No | Request success flag | Always `true` |
  | `message` | String | No | Status message | Always `"Upload URL issued"` |
  | `data` | Object | No | Payload wrapper | Container |
  | `data.upload_url` | String | No | AWS S3 presigned PUT URL | Target for client-side direct binary upload |
  | `data.storage_key_token` | String | No | Signed JWT containing encrypted storage claim | Passed to confirm endpoint (#133) |
  | `data.expires_in` | Integer | No | Presigned URL validity lifetime in seconds | Always `600` (10 minutes) |
  | `data.required_headers` | Object | No | Mandatory headers client must include in PUT | AWS signature validation requirements |
  | `data.required_headers.content-type` | String | No | Required Content-Type header | Exact MIME type claimed |
  | `data.required_headers.content-length`| String | No | Required Content-Length header | Exact byte size claimed |

* **Exact Error Response Structures:**
  * **413 Payload Too Large — Exceeds Asset Cap:**
    ```json
    {
      "success": false,
      "message": "A logo may not exceed 524288 bytes",
      "errorCode": "FILE_TOO_LARGE"
    }
    ```
    *Trigger:* Passing `size_bytes > 524288` for logo or `> 262144` for signature.
  * **415 Unsupported Media Type — Banned Media Format:**
    ```json
    {
      "success": false,
      "message": "\"content_type\" must be one of [image/png, image/jpeg]",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing `image/svg+xml`, `image/webp`, `application/pdf`, etc.
  * **502 Bad Gateway — Storage Provider Down:**
    ```json
    {
      "success": false,
      "message": "Document storage is unavailable",
      "errorCode": "STORAGE_UNAVAILABLE"
    }
    ```
    *Trigger:* S3 bucket configuration missing or AWS STS connectivity failure.

* **Security & Authorization Behavior:** Enforces file size ceilings before issuing presigned URLs. Binds S3 PUT signature to exact byte length to prevent clients from uploading files larger than declared.
* **Important Edge Cases:** Abandoned uploads do not leave dangling rows in the database, because no database state is updated except for an immutable audit entry.
* **Related APIs / Dependencies:** API #133 (`POST /assets/confirm`).

---

### 133. POST /api/v1/documents/hr/letter-branding/assets/confirm
* **API Name / Purpose:** Confirm and Commit Uploaded Branding Asset
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-branding/assets/confirm`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** Once the frontend completes direct binary upload to S3, the backend must verify that the file actually landed in S3, inspect its real metadata independently of client claims, and link it atomically to the organization's letterhead configuration.
* **Why the API Exists:** Completes the two-phase upload handshake. Protects against forged upload claims by performing an authoritative server-side `HeadObject` inspection on S3 prior to writing to the database.
* **Real-World Usage:** Triggered immediately after the frontend receives a `200 OK` response from the S3 presigned PUT URL.
* **Request Parameters:** None.
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `storage_key_token` | Body | String | Required | No | None | Cryptographic JWT issued by API #132. Max 4096 chars. |
  | `checksum` | Body | String | Optional | Yes | None | Optional client-computed SHA-256 or MD5 checksum for auditing. Max 128 chars. |

* **Request JSON Payload Example:**
  ```json
  {
    "storage_key_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdfaWQiOiI3YzllNjY3OS03NDI1LTQwZGUtOTQ0Yi1lMDdmYzFmOTBhZTciLCJhc3NldF90eXBlIjoibG9nbyIsInN0b3JhZ2Vfa2V5Ijoib3JnLzdjOWU2Njc5LTc0MjUtNDBkZS05NDRiLWUwN2ZjMWY5MGFlNy9icmFuZGluZy9sb2dvLzliMWRlYjRkLTNiN2QtNGJhZC05YmRkLTJiMGQ3YjNkY2I2ZC5wbmciLCJwdXJwb3NlIjoibGV0dGVyX2Fzc2V0X3VwbG9hZCIsImlhdCI6MTc1ODk0MDYwMCwiZXhwIjoxNzU4OTQxMjAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```

* **Backend Processing Flow:**
  1. Validates request body against `assetConfirmSchema`.
  2. Decodes and verifies `storage_key_token` via `verifyToken()`:
     - Confirms token signature is valid.
     - Confirms `purpose === 'letter_asset_upload'`.
     - Confirms `claim.org_id === req.user.orgId` (cross-tenant token theft prevention).
     - Confirms `storage_key` begins with `org/${orgId}/branding/`.
     - Throws HTTP `404 Not Found` (`UPLOAD_CLAIM_NOT_FOUND`) if token is forged, expired, or invalid.
  3. Inspects current database state: If the target column (`logo_storage_key` or `signature_storage_key`) already contains `storage_key`, the request is an idempotent replay and returns HTTP `200 OK` immediately.
  4. Executes S3 `HeadObject` check **outside** database transaction:
     - Verifies object exists. If absent, throws HTTP `409 Conflict` (`UPLOAD_NOT_FOUND`).
     - Verifies `head.contentType` is in `['image/png', 'image/jpeg']`. If not, throws HTTP `415 Unsupported Media Type` (`UNSUPPORTED_MEDIA_TYPE`).
     - Verifies `head.contentLength <= ASSET_SIZE_CAPS[assetType]`. If exceeded, throws HTTP `413 Payload Too Large` (`FILE_TOO_LARGE`).
  5. Opens database transaction:
     a. Acquires transaction-scoped PostgreSQL advisory lock:
        `SELECT pg_advisory_xact_lock(hashtext('letter-branding:' || :orgId))`
     b. Acquires pessimistic row lock (`SELECT ... FOR UPDATE`) on `document_letter_branding`.
     c. Re-checks replay under the lock.
     d. Updates branding record:
        - Sets `${assetType}_storage_key = storageKey`
        - Sets `${assetType}_content_type = head.contentType`
        - Sets `${assetType}_size_bytes = head.contentLength`
        - Sets `updated_by = req.user.id`
     e. Inserts audit record in `document_audit_logs`:
        - `action`: `letter_branding.asset_confirmed`
        - `oldValues`: `{ asset_type, [key]: oldKey }`
        - `newValues`: `{ asset_type, content_type, size_bytes }`
     f. Commits transaction.
  6. Returns updated branding response envelope.

* **Database Impact:**
  * **Updates:** `document_letter_branding` (`logo_storage_key` or `signature_storage_key`, MIME type, byte size, `updated_by`, `updated_at`).
  * **Inserts:** Audit log entry in `document_audit_logs`.
  * **Locking:** PostgreSQL advisory lock (`letter-branding:{orgId}`) + pessimistic row lock (`FOR UPDATE`).

* **PDF Generation Impact:** Immediate. The confirmed image will be rendered in subsequent letterhead probe (#134) and template (#138) PDF previews.
* **File / Storage Impact:** Verified against AWS S3 via `headObject`. Existing S3 objects are retained (not deleted synchronously) to prevent race conditions with in-flight renders.
* **Concurrency & Transactions:** Fully race-protected via `pg_advisory_xact_lock` and row-level locks. Two concurrent confirms for the same organization serialize strictly.
* **Idempotency & Retry Behavior:** Fully idempotent. If re-sent with the same token, detects that the key is already committed and returns the branding DTO cleanly without re-auditing.

* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Asset confirmed",
    "data": {
      "branding": {
        "signatory_name": "Priya Nair",
        "signatory_designation": "Vice President - People & Culture",
        "registered_address_lines": [
          "Building 4, Infinity Park",
          "Bengaluru, Karnataka 560035"
        ],
        "cin": "U72900KA2021PTC987654",
        "gstin": "29XYZAB5678C1Z2",
        "pan": "XYZAB5678C",
        "tan": "BLRZ56789C",
        "contact_email": "people@acme-corp.com",
        "contact_phone": "+91 80 6111 2222",
        "website": "https://www.acme-corp.com",
        "accent_color_hex": "#0D9488",
        "footer_note": "Confidential - Acme Technologies Private Limited",
        "letterhead_enabled": true,
        "logo_present": true,
        "logo_content_type": "image/png",
        "logo_size_bytes": 142850,
        "signature_present": true,
        "signature_content_type": "image/png",
        "signature_size_bytes": 22150,
        "updated_at": "2026-09-27T01:38:00.123Z"
      },
      "inherited": {
        "org_name": "Acme Technologies Private Limited",
        "website": "https://www.acme-corp.com"
      },
      "assets": {
        "logo_present": true,
        "signature_present": true
      }
    }
  }
  ```

* **Exact Error Response Structures:**
  * **404 Not Found — Invalid or Expired Claim Token:**
    ```json
    {
      "success": false,
      "message": "The upload claim could not be resolved",
      "errorCode": "UPLOAD_CLAIM_NOT_FOUND"
    }
    ```
    *Trigger:* Token expired (>10 minutes), invalid signature, wrong purpose, or `org_id` mismatch.
  * **409 Conflict — Uploaded Object Missing in S3:**
    ```json
    {
      "success": false,
      "message": "The uploaded object was not found",
      "errorCode": "UPLOAD_NOT_FOUND"
    }
    ```
    *Trigger:* Client called confirm without completing the S3 PUT upload, or upload failed.
  * **413 Payload Too Large — S3 Object Exceeds Ceiling:**
    ```json
    {
      "success": false,
      "message": "The uploaded logo exceeds the size limit",
      "errorCode": "FILE_TOO_LARGE"
    }
    ```
    *Trigger:* S3 HEAD reveals `ContentLength` > 512 KB (logo) or > 256 KB (signature).
  * **415 Unsupported Media Type — Actual MIME Disallowed:**
    ```json
    {
      "success": false,
      "message": "The uploaded object is not a PNG or JPEG",
      "errorCode": "UNSUPPORTED_MEDIA_TYPE"
    }
    ```
    *Trigger:* S3 HEAD reveals Content-Type is not `image/png` or `image/jpeg`.

* **Security & Authorization Behavior:** Server re-verifies all metadata directly from AWS S3 via `headObject`. The client's claims in the token or body are never trusted as proof of file characteristics.
* **Important Edge Cases:** If the network to AWS S3 fails during HEAD inspection, throws HTTP `502 Bad Gateway` (`STORAGE_UNAVAILABLE`) and rolls back cleanly without updating the database.
* **Related APIs / Dependencies:** API #132 (`POST /assets/upload-url`), API #134 (`POST /preview`).

---

### 134. POST /api/v1/documents/hr/letter-branding/preview
* **API Name / Purpose:** Generate and Stream Letterhead Branding Preview PDF
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-branding/preview`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR administrators need immediate visual confirmation that corporate logos, signatures, accent colors, corporate metadata, and margins align properly on a standard A4 page before generating or issuing binding legal letters.
* **Why the API Exists:** Compiles a dedicated internal branding probe template (`_branding_probe`), composites the organization's resolved branding identity, verifies storage and rendering connectivity, and streams back binary PDF bytes directly to the browser with security headers.
* **Real-World Usage:** Invoked when HR clicks "Preview Letterhead" in the branding settings portal.
* **Request Parameters:** None.
* **Request JSON Payload:** None (`{}` strictly enforced).
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :--- | :---: | :--- |
  | `body` | Body | Object | Required | Must be an empty JSON object `{}`. Any keys will fail validation. |

* **Validation Rules:** Validated via `brandingPreviewSchema = Joi.object({})`. Passing unknown keys triggers HTTP `400 Bad Request`.

* **Backend Processing Flow:**
  1. Validates body is `{}`.
  2. Evaluates Redis rolling rate limit:
     - Key: `pdf:preview:${orgId}:${YYYYMMDDHH}`
     - Increments counter and sets TTL to 3900 seconds.
     - Compares against `document_settings.letter_preview_rate_per_hour` (default 60).
     - If exceeded, throws HTTP `429 Too Many Requests` (`PREVIEW_RATE_LIMITED`).
  3. Loads `document_letter_branding` and `organization_profiles`.
  4. Resolves branding view-model via `resolveBranding()`:
     - Merges profile and branding rows.
     - Resolves asset sources: Images ≤ 64 KB are fetched from S3 and converted to base64 Data URIs (`data:image/png;base64,...`) for instant rendering; images > 64 KB use presigned GET URLs with a 300s TTL.
     - Respects `letterhead_enabled`: If `false`, suppresses all branding components.
  5. Pins current date in UTC (`todayIso()`) and builds probe view-model using `_branding_probe` template definition (`sample_reference`, `sample_amount`, `is_preview: true`).
  6. Computes SHA-256 `input_hash` over canonicalized view-model JSON and derives an idempotency key:
     `sha256("${orgId}:_branding_probe:1:${inputHash}").slice(0, 64)`.
  7. Invokes `renderAndRecord()` pipeline (`persist: false`):
     a. Checks `pdf_render_artifacts` for an existing ready artifact matching `(org_id, idempotency_key)`.
     b. If absent, inserts tracking artifact row with status `pending`, `source_type: 'preview'`, `retention_class: 'cache'`.
     c. Calls external rendering service `POST ${baseUrl}/v1/pdf/generate` with assembled HTML, view-model data, and A4 margins (`top: 0mm, right: 0mm, bottom: 0mm, left: 0mm`).
     d. Verifies returned binary buffer: Checks for `%PDF-` header and `%%EOF` trailer. Rejects non-PDF or truncated payloads with HTTP `502`.
     e. Transitions artifact row to `ready`, committing `content_hash`, `size_bytes`, and `render_ms`.
     f. Records audit log in `document_audit_logs` (`pdf.preview_rendered`).
  8. Streams binary PDF buffer directly to the HTTP response.

* **Database Impact:**
  * **Inserts:** One row in `pdf_render_artifacts` (`status = 'ready'`, `storage_key = NULL`), one audit log in `document_audit_logs`.
  * **Transactions:** Two discrete transactions (Insert `pending` → External Render → Commit `ready`). No locks held during network rendering.

* **PDF Generation Impact:**
  * **Template:** Internal `_branding_probe` (Version 1).
  * **Watermark:** Renders semi-transparent diagonal `PREVIEW` watermark across the page.
  * **Determinism:** Canonical JSON input hashing ensures byte determinism.

* **File / Storage Impact:**
  * **S3 Reads:** Reads logo/signature objects via `headObject` and optionally `getObject` (if ≤ 64 KB) or `getViewUrl`.
  * **S3 Writes:** **None**. Preview artifacts are transient (`persist: false`) and streamed directly to the client without creating an S3 object.

* **Concurrency & Transactions:** Idempotency key prevents concurrent duplicate renders. If a duplicate request arrives while another is rendering, it awaits the result or re-renders into the winner's pending slot safely.
* **Idempotency & Retry Behavior:** Fully idempotent. Consecutive calls with identical branding state reuse the existing artifact row and re-render/stream the PDF.

* **Success Response Structure (Binary Stream):**
  * **HTTP Status:** `200 OK`
  * **Response Headers:**
    ```http
    HTTP/1.1 200 OK
    Content-Type: application/pdf
    Content-Length: 45120
    Content-Disposition: inline; filename*=UTF-8''branding-preview.pdf
    X-Content-Type-Options: nosniff
    Cache-Control: private, no-store
    X-Artifact-Id: 8f4b1e5a-2c3d-4e5f-9a1b-2c3d4e5f6a7b
    ```
  * **Response Body:** Binary PDF stream (`%PDF-1.4 ... %%EOF`).

* **Exact Error Response Structures:**
  * **400 Bad Request — Non-Empty Body:**
    ```json
    {
      "success": false,
      "message": "\"sample\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing any key inside the request JSON body.
  * **429 Too Many Requests — Preview Rate Limit Exceeded:**
    ```json
    {
      "success": false,
      "message": "Preview rate limit reached; try again later",
      "errorCode": "PREVIEW_RATE_LIMITED"
    }
    ```
    *Trigger:* Organization exceeds hourly preview quota (`letter_preview_rate_per_hour`).
  * **502 Bad Gateway — Renderer Unavailable / Crashed:**
    ```json
    {
      "success": false,
      "message": "The document renderer is unavailable",
      "errorCode": "PDF_RENDERER_UNAVAILABLE"
    }
    ```
    *Trigger:* Lambda renderer network timeout, connection refused, 5xx error, or non-PDF bytes returned.
  * **503 Service Unavailable — Renderer Unconfigured:**
    ```json
    {
      "success": false,
      "message": "The document renderer is not configured",
      "errorCode": "PDF_RENDERER_NOT_CONFIGURED"
    }
    ```
    *Trigger:* `PDF_RENDERER_BASE_URL` environment variable is unset.

* **Security & Authorization Behavior:** Response headers include `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` to prevent browser caching of sensitive company letterheads on shared workstations.
* **Important Edge Cases:** If configured logo/signature S3 object is missing from the bucket, `resolveAssetSrcs` logs a warning and suppresses the image block, allowing the preview to render cleanly without crashing.
* **Related APIs / Dependencies:** API #130 (`GET /letter-branding`), API #138 (`POST /letter-templates/:code/preview`).

---

### 135. GET /api/v1/documents/hr/letter-templates
* **API Name / Purpose:** List Letter Template Catalog with Organization Config State
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-templates`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR administrators need an overview of all standard letter templates provided by the system (e.g., Experience Letter, Appointment Letter, Bonafide Letter) alongside their organization's enablement status, version pinning, and configuration completeness.
* **Why the API Exists:** Blends static codebase template registry definitions with dynamic tenant database configurations, surfacing orphaned templates if a previously configured template is removed from the codebase.
* **Real-World Usage:** Populates the "Document Templates" dashboard table in the HR admin console.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `enabled` | Query | Boolean | Optional | Yes | None | Filter templates by enablement status. Allowed values: `true`, `false`. Omit to return all templates. |

* **Validation Rules:**
  * Query parameter `enabled` is validated explicitly: must be `'true'` or `'false'`. Any other value returns HTTP `400 Bad Request` (`VALIDATION_ERROR`).

* **Backend Processing Flow:**
  1. Authenticates request and extracts `orgId` from JWT.
  2. Queries `document_letter_configs` for all configuration records belonging to `orgId`.
  3. Loads all template registry entries from `letter-templates/registry.js`.
  4. Maps each registry template:
     - Joins corresponding `document_letter_configs` record if present.
     - Computes `is_enabled`: `cfg ? cfg.is_enabled : false`.
     - Computes `pinned_version`: `cfg ? cfg.pinned_version : null`.
     - Computes `has_saved_fields`: `Boolean(cfg?.saved_fields && Object.keys(cfg.saved_fields).length > 0)`.
     - Sets `is_orphaned: false`.
  5. Identifies orphaned configurations: Scans database config rows whose `template_code` does not exist in `registry.js`. Appends them to the list with `is_orphaned: true` and `current_version: null`.
  6. Applies optional `enabled` filter if provided (`true` or `false`).
  7. Returns HTTP `200 OK` with templates array.

* **Database Impact:**
  * **Reads:** `document_letter_configs` (`SELECT ... WHERE org_id = :orgId`).
  * **Writes:** None.

* **PDF Generation Impact:** None.
* **File / Storage Impact:** None.
* **Concurrency & Transactions:** Read-only operation. No transactions or locking required.
* **Idempotency & Retry Behavior:** Fully idempotent. Safe to retry freely.

* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Templates loaded",
    "data": {
      "templates": [
        {
          "code": "experience_letter",
          "title": "Experience Letter",
          "current_version": 1,
          "is_enabled": true,
          "pinned_version": null,
          "has_saved_fields": true,
          "is_orphaned": false
        },
        {
          "code": "appointment_letter",
          "title": "Appointment Letter",
          "current_version": 1,
          "is_enabled": false,
          "pinned_version": 1,
          "has_saved_fields": false,
          "is_orphaned": false
        },
        {
          "code": "bonafide_letter",
          "title": "Bonafide Letter",
          "current_version": 1,
          "is_enabled": false,
          "pinned_version": null,
          "has_saved_fields": false,
          "is_orphaned": false
        }
      ]
    }
  }
  ```

* **Response Field Documentation:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :---: | :--- | :--- |
  | `success` | Boolean | No | Request success status | Always `true` |
  | `message` | String | No | Status message | Always `"Templates loaded"` |
  | `data` | Object | No | Root data wrapper | Container |
  | `data.templates` | Array[Object] | No | List of catalog templates and orphan records | Joined catalog array |
  | `data.templates[].code` | String | No | Unique programmatic template identifier | E.g. `experience_letter` |
  | `data.templates[].title` | String | No | Human-readable title of the template | Registry title |
  | `data.templates[].current_version` | Integer | Yes | Latest version available in codebase | From registry; `null` if orphaned |
  | `data.templates[].is_enabled` | Boolean | No | Whether template is enabled for generation | From `document_letter_configs.is_enabled` |
  | `data.templates[].pinned_version` | Integer | Yes | Explicitly pinned template version | From config; `null` tracks latest |
  | `data.templates[].has_saved_fields` | Boolean | No | Whether organization has saved field defaults | Computed from `saved_fields` |
  | `data.templates[].is_orphaned` | Boolean | No | Indicates if template was removed from code | `true` if DB row has no registry match |

* **Exact Error Response Structures:**
  * **400 Bad Request — Invalid Query Parameter:**
    ```json
    {
      "success": false,
      "message": "enabled must be 'true' or 'false'",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing `?enabled=1` or `?enabled=yes`.

* **Security & Authorization Behavior:** Strictly isolates data by `req.user.orgId`.
* **Important Edge Cases:** Orphaned templates (`is_orphaned: true`) are never deleted or hidden; they are surfaced explicitly so HR understands why a legacy template cannot be rendered.
* **Related APIs / Dependencies:** API #136 (`GET /letter-templates/:code`), API #137 (`PUT /letter-templates/:code/config`).

---

### 136. GET /api/v1/documents/hr/letter-templates/:code
* **API Name / Purpose:** Get Letter Template Details, Form Descriptor & Organization Config
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-templates/:code`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** When configuring a specific letter template, HR administrators need to understand what fields the template accepts, which fields can be pre-configured at the organization level (e.g. `place_of_issue`, `hr_contact_line`), validation constraints (max lengths, required status), and inspection of synthetic sample data.
* **Why the API Exists:** Converts the template's internal Joi schema into an engine-agnostic UI Form Descriptor array (`fields: [{ key, label, type, max_length, required }]`), eliminating frontend hardcoding while exposing current organization configuration.
* **Real-World Usage:** Invoked when opening the "Configure Template" modal or page for a letter template.
* **Request JSON Payload:** None.
* **Request Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `code` | Path | String | Required | No | None | Unique template identifier. Regex: `^[a-z][a-z0-9_]{2,63}$`. E.g. `experience_letter`. |

* **Validation Rules:** Validated via `templateCodeSchema`: must start with a lowercase letter, contain only lowercase letters, numbers, or underscores, and have length between 3 and 64 characters.

* **Backend Processing Flow:**
  1. Validates `:code` parameter format.
  2. Queries template registry for `code`. If not found, throws HTTP `404 Not Found` (`TEMPLATE_NOT_FOUND`).
  3. Queries `document_letter_configs` by `(org_id, template_code)`.
  4. Transforms the template's Joi `saved_field_schema` into a UI Form Descriptor via `_toFormDescriptor()`:
     - Extracts keys, labels (humanized), types, maximum lengths, and required flags.
  5. Packages metadata: `required_fields`, `optional_fields`, `sample_data`, and active organization `config`.
  6. Returns HTTP `200 OK` with assembled template and config objects.

* **Database Impact:**
  * **Reads:** `document_letter_configs` (`SELECT ... WHERE org_id = :orgId AND template_code = :code`).
  * **Writes:** None.

* **PDF Generation Impact:** None.
* **File / Storage Impact:** None.
* **Concurrency & Transactions:** Read-only.
* **Idempotency & Retry Behavior:** Fully idempotent.

* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Template loaded",
    "data": {
      "template": {
        "code": "experience_letter",
        "title": "Experience Letter",
        "current_version": 1,
        "required_fields": [
          "employee_name",
          "designation",
          "joining_date_text",
          "relieving_date_text"
        ],
        "optional_fields": [
          "department_name",
          "employee_code",
          "closing_note"
        ],
        "fields": [
          {
            "key": "place_of_issue",
            "label": "Place Of Issue",
            "type": "string",
            "max_length": 80,
            "required": false
          },
          {
            "key": "hr_contact_line",
            "label": "Hr Contact Line",
            "type": "string",
            "max_length": 160,
            "required": false
          }
        ],
        "sample_data": {
          "employee_name": "Asha Sample",
          "designation": "Senior Software Engineer",
          "joining_date_text": "12 January 2021",
          "relieving_date_text": "31 August 2026",
          "department_name": "Engineering",
          "employee_code": "EMP-1042",
          "closing_note": "We wish Asha continued success in all future endeavours."
        }
      },
      "config": {
        "is_enabled": true,
        "pinned_version": null,
        "saved_fields": {
          "place_of_issue": "Bengaluru",
          "hr_contact_line": "For queries, email hr-verifications@acme-corp.com"
        }
      }
    }
  }
  ```

* **Response Field Documentation:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :---: | :--- | :--- |
  | `success` | Boolean | No | Success status flag | Always `true` |
  | `message` | String | No | Status message | Always `"Template loaded"` |
  | `data` | Object | No | Root response wrapper | Container |
  | `data.template` | Object | No | Catalog template specification | Source: `registry.js` |
  | `data.template.code` | String | No | Template identifier code | Codebase registry key |
  | `data.template.title` | String | No | Human-readable template title | E.g. `"Experience Letter"` |
  | `data.template.current_version` | Integer | No | Active template version | Codebase version counter |
  | `data.template.required_fields` | Array[String]| No | List of required field names | Enforced by preview builder |
  | `data.template.optional_fields` | Array[String]| No | List of optional field names | Wrapped in `{{#if}}` in template |
  | `data.template.fields` | Array[Object]| No | Dynamic form descriptor for UI | Schema-derived form descriptor |
  | `data.template.fields[].key` | String | No | Field key identifier | Key name in `saved_fields` |
  | `data.template.fields[].label` | String | No | Humanized field title | E.g. `"Place Of Issue"` |
  | `data.template.fields[].type` | String | No | Field primitive type | E.g. `"string"` |
  | `data.template.fields[].max_length` | Integer | Yes | Maximum allowed character length | Derived from Joi `.max()` rule |
  | `data.template.fields[].required` | Boolean | No | Whether field is mandatory | Derived from Joi presence rule |
  | `data.template.sample_data` | Object | No | Synthetic PII-free preview payload | Used by preview endpoint |
  | `data.config` | Object | Yes | Organization-specific saved configuration | Source: `document_letter_configs` |
  | `data.config.is_enabled` | Boolean | No | Enablement status for generation | Enablement flag |
  | `data.config.pinned_version` | Integer | Yes | Pinned template version override | `null` defaults to current version |
  | `data.config.saved_fields` | Object | No | Stored default field values | Pre-populated into generation |

* **Exact Error Response Structures:**
  * **400 Bad Request — Malformed Template Code:**
    ```json
    {
      "success": false,
      "message": "template code must be 3-64 lowercase letters, digits or underscores and start with a letter",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing an invalid code like `123_test` or `Experience-Letter`.
  * **404 Not Found — Unrecognized Template:**
    ```json
    {
      "success": false,
      "message": "Template not found",
      "errorCode": "TEMPLATE_NOT_FOUND"
    }
    ```
    *Trigger:* Passing a syntactically valid code that does not exist in `registry.js`.

* **Security & Authorization Behavior:** Strictly scoped to tenant `orgId`. Returns `config: null` if the organization has never configured the template.
* **Important Edge Cases:** Registry sample data is guaranteed to satisfy all `required_fields` so that previews always render successfully out-of-the-box.
* **Related APIs / Dependencies:** API #135 (`GET /letter-templates`), API #137 (`PUT /letter-templates/:code/config`), API #138 (`POST /letter-templates/:code/preview`).

---

### 137. PUT /api/v1/documents/hr/letter-templates/:code/config
* **API Name / Purpose:** Upsert Organization Template Configuration & Saved Fields
* **HTTP Method:** `PUT`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-templates/:code/config`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to enable or disable specific letter templates for their company and save standard organization-wide defaults (such as office location or verification contact lines) so issuers do not re-type identical text on every document.
* **Why the API Exists:** Provides atomic upsert semantics for template configuration while validating `saved_fields` against the specific template's declared Joi schema, rejecting unrecognized keys with HTTP `400` to prevent un-rendered blank text in generated letters.
* **Real-World Usage:** Invoked when HR clicks "Save Configuration" in the template settings interface.
* **Request Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `code` | Path | String | Required | No | None | Template identifier code matching `^[a-z][a-z0-9_]{2,63}$`. |

* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `is_enabled` | Body | Boolean | Required | No | None | Master toggle enabling this template for issuance/preview. |
  | `saved_fields` | Body | Object | Optional | No | `{}` | Organization-wide default field values. Keys validated against template schema. |
  | `pinned_version` | Body | Integer | Optional | Yes | `null` | Pin to a specific template version. In Phase 1, only `1` or `null` is allowed. |
  | `reference_pattern` | Body | String | Optional | Yes | `null` | Custom numbering pattern (e.g. `EXP/{YYYY}/{SEQ}`). Max 120 chars. |
  | `requires_acknowledgement`| Body | Boolean | Optional | Yes | `null` | Whether employee must acknowledge receipt in self-service portal. |
  | `is_confidential` | Body | Boolean | Optional | Yes | `null` | Whether access is restricted to HR and direct reporting managers. |

* **Validation Rules:**
  * Top-level request shape validated via `upsertConfigSchema`.
  * `saved_fields` is strictly re-validated against the template's specific `saved_field_schema` using `{ allowUnknown: false, stripUnknown: false }`. Any unrecognised key immediately triggers HTTP `400 Bad Request` (`VALIDATION_ERROR`).

* **Request JSON Payload Example:**
  ```json
  {
    "is_enabled": true,
    "pinned_version": 1,
    "saved_fields": {
      "place_of_issue": "Bengaluru",
      "hr_contact_line": "For employment verification, contact verifications@acme-corp.com"
    },
    "reference_pattern": "ACME/EXP/{YYYY}/{SEQ}",
    "requires_acknowledgement": false,
    "is_confidential": true
  }
  ```

* **Backend Processing Flow:**
  1. Validates `:code` parameter format.
  2. Queries template registry. Throws HTTP `404 Not Found` (`TEMPLATE_NOT_FOUND`) if code does not exist.
  3. Validates top-level body using `upsertConfigSchema`.
  4. Validates `saved_fields` against `entry.saved_field_schema`.
  5. Enters transaction with retry capability:
     a. Queries `document_letter_configs` using `lock: true` (`SELECT ... FOR UPDATE`).
     b. Captures pre-update shape (`before`) for audit logging.
     c. If row exists, updates `is_enabled`, `saved_fields`, `pinned_version`, `reference_pattern`, `requires_acknowledgement`, `is_confidential`, `updated_by`.
     d. If row does not exist, executes `findOrCreate`. If a concurrent insert races, retries once.
     e. Records audit log in `document_audit_logs`:
        - `action`: `letter_template.config_updated`
        - Note: To prevent sensitive HR data leakage into audit logs, only **keys** of `saved_fields` are audited (`saved_field_keys: ['place_of_issue', 'hr_contact_line']`), never the field values.
     f. Commits transaction.
  6. Returns HTTP `200 OK` with updated `config` object.

* **Database Impact:**
  * **Updates / Inserts:** Upserts row in `document_letter_configs`.
  * **Inserts:** One record in `document_audit_logs`.
  * **Locking:** Explicit row lock (`FOR UPDATE`) throughout transaction.

* **PDF Generation Impact:** Immediate. All future preview (#138) and issuance calls will apply the saved field defaults.
* **File / Storage Impact:** None.
* **Concurrency & Transactions:** Protected by row-level locking. If two concurrent requests attempt to insert the first configuration simultaneously, the unique index violation (`document_letter_configs_org_template_uq`) triggers an automatic retry that converts into an update.
* **Idempotency & Retry Behavior:** Fully idempotent.

* **Success Response Structure:**
  ```json
  {
    "success": true,
    "message": "Template configuration saved",
    "data": {
      "config": {
        "is_enabled": true,
        "pinned_version": 1,
        "saved_fields": {
          "place_of_issue": "Bengaluru",
          "hr_contact_line": "For employment verification, contact verifications@acme-corp.com"
        }
      }
    }
  }
  ```

* **Exact Error Response Structures:**
  * **400 Bad Request — Unrecognized Saved Field Key:**
    ```json
    {
      "success": false,
      "message": "\"unsupported_key\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing a field name not declared in the template's `saved_field_schema`.
  * **400 Bad Request — Field Length Exceeded:**
    ```json
    {
      "success": false,
      "message": "\"place_of_issue\" length must be less than or equal to 80 characters long",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Exceeding maximum character limit for a saved field.
  * **404 Not Found — Template Code Unknown:**
    ```json
    {
      "success": false,
      "message": "Template not found",
      "errorCode": "TEMPLATE_NOT_FOUND"
    }
    ```
    *Trigger:* Specifying a `:code` that does not exist in the codebase template registry.

* **Security & Authorization Behavior:** Strictly isolates data by `req.user.orgId`. Validates saved fields against strict whitelists to ensure no arbitrary JSON pollution.
* **Important Edge Cases:** Setting `pinned_version: null` is valid and instructs the system to automatically track the latest version of the template as new revisions are released.
* **Related APIs / Dependencies:** API #136 (`GET /letter-templates/:code`), API #138 (`POST /letter-templates/:code/preview`).

---

### 138. POST /api/v1/documents/hr/letter-templates/:code/preview
* **API Name / Purpose:** Generate and Stream Letter Template Preview PDF
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letter-templates/:code/preview`
* **Authentication / Authorization:** Bearer JWT Token.
* **Required Roles:** `hr`
* **Required Feature / Permission:** `documents.access`
* **Business Problem Solved:** HR needs to preview how a specific letter template will look when rendered with their company letterhead, saved organizational fields, and temporary test overrides, ensuring formatting, table structures, and pagination are visually perfect before issuing letters to employees.
* **Why the API Exists:** Provides an end-to-end rendering pipeline that composites letterhead branding, merges template sample data with saved defaults and ad-hoc overrides, passes the view-model through strict completeness validation, and streams back a watermarked A4 PDF.
* **Real-World Usage:** Invoked when HR clicks "Preview Letter" on any letter template view.
* **Request Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `code` | Path | String | Required | No | None | Template identifier code matching `^[a-z][a-z0-9_]{2,63}$`. |

* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `use_saved_fields` | Body | Boolean | Optional | No | `true` | When `true`, merges organization's saved fields from `document_letter_configs`. When `false`, ignores saved config. |
  | `override_fields` | Body | Object | Optional | No | `{}` | Ad-hoc field overrides for this preview execution only. Keys validated against template schema. |

* **Security Guard — Strict Prohibition of Real PII (§1.4(2)):**
  * `allowUnknown: false` is enforced on the root body schema.
  * Passing `subject_user_id` or any unrecognised parameter immediately fails validation with HTTP `400 Bad Request` (`VALIDATION_ERROR`). This prevents real employee data from reaching the unauthenticated rendering service (D-14).

* **Request JSON Payload Example:**
  ```json
  {
    "use_saved_fields": true,
    "override_fields": {
      "place_of_issue": "Mumbai Central Office",
      "hr_contact_line": "Direct verification line: +91 22 2490 0000"
    }
  }
  ```

* **Backend Processing Flow:**
  1. Validates `:code` parameter. Fetches registry entry; if missing, throws HTTP `404 Not Found` (`TEMPLATE_NOT_FOUND`).
  2. Validates top-level body shape via `previewTemplateSchema`.
  3. Validates `override_fields` against the template's `saved_field_schema` (unknown keys fail with HTTP `400`).
  4. Checks Redis rolling rate limit (`letter_preview_rate_per_hour`). Throws HTTP `429` if exceeded.
  5. Queries `document_letter_configs` for `(org_id, code)`.
     - If `use_saved_fields === true` and config exists with `is_enabled === false`, throws HTTP `409 Conflict` (`TEMPLATE_DISABLED`).
     - Extracts `saved_fields` if enabled.
  6. Resolves letterhead branding view-model via `resolveBranding()` (reads S3 assets outside transaction).
  7. Hierarchical Field Merging:
     $$\text{Merged Fields} = \text{sample\_data} \longleftarrow \text{saved\_fields} \longleftarrow \text{override\_fields}$$
     (Later sources override earlier ones).
  8. Pins date in UTC (`todayIso()`) and executes `buildPreviewViewModel()`:
     - Validates that every declared `required_fields` key is non-empty. Throws HTTP `422 Unprocessable Entity` (`PDF_DATA_INCOMPLETE`) if any required field is missing or empty.
     - Normalizes strings, numbers, and arrays element-wise.
     - Sets reserved template variables: `is_preview = true` (triggers diagonal watermark), `issued_on_text`, `template_marker`, `branding`.
  9. Computes canonical SHA-256 `input_hash` and derives idempotency key:
     `sha256("${orgId}:${code}:${version}:${inputHash}").slice(0, 64)`.
  10. Invokes `renderAndRecord()` pipeline (`persist: false`):
      a. Probes `pdf_render_artifacts` for an existing ready artifact matching `(org_id, idempotency_key)`.
      b. Inserts `pending` artifact row inside Transaction 1.
      c. Assembles HTML (inlines Handlebars partials `_header`, `_footer`, `_typography`, `_watermark`).
      d. Executes HTTP POST to Lambda renderer `/v1/pdf/generate` outside of any transaction.
      e. Verifies PDF magic bytes (`%PDF-` header and `%%EOF` tail).
      f. Commits `ready` status and audit log (`pdf.preview_rendered`) inside Transaction 2.
  11. Streams binary PDF buffer directly to the HTTP response.

* **Database Impact:**
  * **Inserts:** One row in `pdf_render_artifacts` (`status = 'ready'`, `source_type = 'preview'`, `retention_class = 'cache'`, `storage_key = NULL`), one audit row in `document_audit_logs`.
  * **Transactions:** Two discrete transactions (Insert `pending` → External Render → Commit `ready`).

* **PDF Generation Impact:**
  * **Template:** Selected by `:code` (`experience_letter`, `appointment_letter`, `bonafide_letter`).
  * **Watermark:** Renders semi-transparent diagonal `PREVIEW` watermark across every page.
  * **Storage:** No S3 object created; bytes streamed directly in memory.

* **File / Storage Impact:**
  * **S3 Reads:** Reads logo/signature assets if letterhead is enabled.
  * **S3 Writes:** None (`persist: false`).

* **Concurrency & Transactions:** Safe from concurrent duplicate races via the database unique index on `(org_id, idempotency_key)`.
* **Idempotency & Retry Behavior:** Fully idempotent. Identical inputs re-render into the existing artifact without creating orphan rows.

* **Success Response Structure (Binary Stream):**
  * **HTTP Status:** `200 OK`
  * **Response Headers:**
    ```http
    HTTP/1.1 200 OK
    Content-Type: application/pdf
    Content-Length: 68420
    Content-Disposition: inline; filename*=UTF-8''experience_letter-preview.pdf
    X-Content-Type-Options: nosniff
    Cache-Control: private, no-store
    X-Artifact-Id: 3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11
    ```
  * **Response Body:** Binary PDF stream (`%PDF-1.4 ... %%EOF`).

* **Exact Error Response Structures:**
  * **400 Bad Request — Disallowed Subject Parameter (PII Defense):**
    ```json
    {
      "success": false,
      "message": "\"subject_user_id\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing `subject_user_id` or any real employee identifier.
  * **400 Bad Request — Unrecognized Override Field:**
    ```json
    {
      "success": false,
      "message": "\"unknown_field\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    *Trigger:* Passing a field key in `override_fields` not defined in the template schema.
  * **404 Not Found — Unknown Template Code:**
    ```json
    {
      "success": false,
      "message": "Template not found",
      "errorCode": "TEMPLATE_NOT_FOUND"
    }
    ```
    *Trigger:* Path parameter `:code` not found in registry.
  * **409 Conflict — Template Disabled by Organization Policy:**
    ```json
    {
      "success": false,
      "message": "This template is disabled for your organization",
      "errorCode": "TEMPLATE_DISABLED"
    }
    ```
    *Trigger:* `use_saved_fields: true` when `document_letter_configs.is_enabled === false`.
  * **422 Unprocessable Entity — Missing Required Field:**
    ```json
    {
      "success": false,
      "message": "The letter cannot be issued: required field \"employee_name\" is missing",
      "errorCode": "PDF_DATA_INCOMPLETE"
    }
    ```
    *Trigger:* Any required template field resolves to empty string, `null`, or `undefined`.
  * **429 Too Many Requests — Preview Hourly Rate Cap:**
    ```json
    {
      "success": false,
      "message": "Preview rate limit reached; try again later",
      "errorCode": "PREVIEW_RATE_LIMITED"
    }
    ```
    *Trigger:* Hourly preview rate exceeds `letter_preview_rate_per_hour`.
  * **500 Internal Server Error — Template Markup Syntax Error:**
    ```json
    {
      "success": false,
      "message": "The letter template could not be rendered",
      "errorCode": "PDF_TEMPLATE_INVALID"
    }
    ```
    *Trigger:* Handlebars compilation or Chromium rendering rejected by Lambda renderer with 400.
  * **502 Bad Gateway — Lambda Renderer Unreachable or Timed Out:**
    ```json
    {
      "success": false,
      "message": "The document renderer is unavailable",
      "errorCode": "PDF_RENDERER_UNAVAILABLE"
    }
    ```
    *Trigger:* Network failure, 5xx, or non-PDF bytes from the rendering engine.
  * **503 Service Unavailable — Renderer Unconfigured:**
    ```json
    {
      "success": false,
      "message": "The document renderer is not configured",
      "errorCode": "PDF_RENDERER_NOT_CONFIGURED"
    }
    ```
    *Trigger:* Missing `PDF_RENDERER_BASE_URL` in environment variables.

* **Security & Authorization Behavior:** Enforces strict role restriction (`hr`), disallows employee targeting, and applies inline disposal headers.
* **Important Edge Cases:** If an organization has never configured a template (no database config row exists), previews succeed smoothly using catalog `sample_data`.
* **Related APIs / Dependencies:** API #136 (`GET /letter-templates/:code`), API #137 (`PUT /letter-templates/:code/config`).

---

## Error Code Reference Matrix

The following table catalogs every standardized machine-readable error code implemented across the PDF Generation Phase 1 endpoints:

| HTTP Status | Error Code (`errorCode`) | Human Message | Primary Triggering Conditions |
| :---: | :--- | :--- | :--- |
| **`400`** | `VALIDATION_ERROR` | Varies by field (e.g. `must not contain < or >`) | Invalid request payload shape, angle brackets in text, bad hex color, unknown saved fields, or illegal path param. |
| **`401`** | `UNAUTHORIZED` | `Authentication token is missing or invalid` | Absent, malformed, or expired JWT bearer token. |
| **`403`** | `INSUFFICIENT_PERMISSIONS` | `User does not have required permissions` | Authenticated user lacks the `hr` role (e.g. `employee`, `manager`, `admin`). |
| **`403`** | `FEATURE_DISABLED` | `Feature 'documents.access' is not enabled...` | The organization's subscription lacks the `documents.access` feature flag. |
| **`404`** | `TEMPLATE_NOT_FOUND` | `Template not found` | Requested `:code` does not exist in `letter-templates/registry.js`. |
| **`404`** | `UPLOAD_CLAIM_NOT_FOUND` | `The upload claim could not be resolved` | Expired (>10m), forged, or cross-tenant `storage_key_token` on asset confirmation. |
| **`409`** | `UPLOAD_NOT_FOUND` | `The uploaded object was not found` | S3 `HeadObject` returns 404 because client did not complete direct S3 PUT upload. |
| **`409`** | `TEMPLATE_DISABLED` | `This template is disabled for your organization` | Attempting to preview a template configured with `is_enabled: false`. |
| **`409`** | `PDF_IDEMPOTENCY_CONFLICT` | `A different document already exists for this request` | Re-submitting an existing idempotency key with a mismatched `input_hash`. |
| **`413`** | `FILE_TOO_LARGE` | `A {asset_type} may not exceed {limit} bytes` | Declared or S3-verified asset size exceeds caps (Logo: 512 KB, Signature: 256 KB). |
| **`415`** | `UNSUPPORTED_MEDIA_TYPE` | `Only PNG or JPEG images are allowed` | Attempting to upload SVGs, PDFs, or non-PNG/JPEG image formats. |
| **`422`** | `PDF_DATA_INCOMPLETE` | `The letter cannot be issued: required field "{f}" is missing` | Required template field resolves to empty string, `null`, or `undefined`. |
| **`429`** | `PREVIEW_RATE_LIMITED` | `Preview rate limit reached; try again later` | Organization exceeds hourly preview quota (`letter_preview_rate_per_hour`). |
| **`500`** | `PDF_TEMPLATE_INVALID` | `The letter template could not be rendered` | Rendering engine rejected template markup or invalid data structures (HTTP 400). |
| **`500`** | `PDF_TEMPLATE_TOO_LARGE` | `The assembled template is too large` | Total assembled HTML markup exceeds 256 KB safety limit. |
| **`502`** | `STORAGE_UNAVAILABLE` | `Document storage is unavailable` | AWS S3 connectivity failure during presigning, HEAD check, or byte retrieval. |
| **`502`** | `PDF_RENDERER_UNAVAILABLE` | `The document renderer is unavailable` | Headless Chromium Lambda timed out, crashed, returned 5xx, or emitted non-PDF bytes. |
| **`503`** | `PDF_RENDERER_NOT_CONFIGURED`| `The document renderer is not configured` | Environment variable `PDF_RENDERER_BASE_URL` is unset or empty. |
| **`504`** | `PDF_RENDER_TIMEOUT` | `The document renderer timed out` | Lambda renderer exceeded request execution timeout window (`PDF_RENDERER_TIMEOUT_MS`). |

---

## Final Coverage Audit Matrix

Before concluding Phase 1 documentation, an exhaustive verification of all 9 implemented endpoints was conducted against the active codebase:

| Verification Category | Target Status | Discovered & Verified | Audit Result |
| :--- | :---: | :---: | :---: |
| **Total Phase 1 APIs Discovered** | 9 | 9 (#130–#138) | **100% Verified** |
| **Total Phase 1 APIs Documented** | 9 | 9 (#130–#138) | **100% Verified** |
| **New Phase 1 APIs Added** | 9 | 9 | **Complete** |
| **APIs Corrected / Reconciled** | 0 | 0 | **Verified** |
| **APIs Still Missing** | 0 | 0 | **Zero Missing** |
| **Request Contracts Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **Success Responses Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **Error Handling Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **Security & Auth Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **Database Behavior Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **PDF Generation Behavior Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **File / Storage Behavior Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **Transaction Boundaries Verified** | 9 / 9 | 9 / 9 | **100% Verified** |
| **PDF Stream Responses Verified** | 2 / 2 (#134, #138) | 2 / 2 | **100% Verified** |
| **Unit Test Suite Parity** | 126 / 126 | 126 / 126 passing | **100% Verified** |
