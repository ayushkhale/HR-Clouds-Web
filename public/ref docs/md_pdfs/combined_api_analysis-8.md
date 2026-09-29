# Combined API Analysis: PDF Generation Module (Phases 1, 2, 3 & 4)

# Phase 1: Letter Branding & Templates (APIs #130–#138)

## 1. HR Administration APIs — Letterhead Branding & Assets

### 130. GET /api/v1/documents/hr/letter-branding

- **API Name / Purpose:** Get Organization Letterhead Branding Identity
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-branding`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR administrators need to retrieve the organization's active letterhead configuration—including corporate identifiers (CIN, GSTIN, PAN, TAN), authorized signatories, official addresses, styling color palettes, and upload status of logos and signatures—prior to issuing formal letters or generating PDF previews.
- **Why the API Exists:** Provides a secure Data Transfer Object (DTO) that abstracts internal S3 storage keys away from the client interface while merging explicit letterhead overrides with fallbacks inherited from the primary organization profile.
- **Real-World Usage:** Invoked by the HR frontend when navigating to the "Letterhead & Branding Settings" tab in the administrative portal.
- **Path Parameters:** None.
- **Query Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `include_asset_urls` | Query | Boolean | Optional | No | `false` | When set to `true`, generates short-lived (300 seconds) S3 presigned GET URLs for viewing existing logo and signature assets. Allowed values: `true`, `false`. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
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
- **Database Impact:** Read-only queries against `document_letter_branding` and `organization_profiles`. On very first access for a tenant, inserts initial default row into `document_letter_branding` and an initialization record into `document_audit_logs`.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** Generates temporary presigned GET URLs via AWS S3 when `include_asset_urls=true`. No bucket writes or file modifications occur.
- **Transaction Behavior:** Uses an atomic database transaction only during first-read lazy initialization. Normal read requests run without a transaction.
- **Concurrency Behavior:** Protected against concurrent first-read insertion races via a unique constraint catch block that gracefully handles `SequelizeUniqueConstraintError` and re-reads the committed row.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to retry freely.
- **Side Effects:** None.
- **Dependencies:** AWS S3 provider (optional for URL presigning), PostgreSQL `document_letter_branding` and `organization_profiles` tables.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. Raw S3 object storage keys (`logo_storage_key`, `signature_storage_key`) are categorically stripped from the response DTO to prevent internal cloud storage path enumeration.
- **Success Response Structure (HTTP 200 OK):**
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
- **Response Field Documentation:**
  | Field | Type | Nullable | Description | Meaning / Source |
  | :--- | :--- | :---: | :--- | :--- |
  | `success` | Boolean | No | Request success status | Always `true` for 200 responses |
  | `message` | String | No | Response status message | Always `"Branding loaded"` |
  | `data` | Object | No | Root response data envelope | Top-level payload container |
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
- **Exact Error Response Structures:**
  - **401 Unauthorized:**
    ```json
    {
      "success": false,
      "message": "Authentication token is missing or invalid",
      "errorCode": "UNAUTHORIZED"
    }
    ```
    _Trigger:_ Missing or invalid `Authorization: Bearer <token>` header.
  - **403 Forbidden — Insufficient Role:**
    ```json
    {
      "success": false,
      "message": "User does not have required permissions",
      "errorCode": "INSUFFICIENT_PERMISSIONS"
    }
    ```
    _Trigger:_ Authenticated caller does not have the `hr` role.
  - **403 Forbidden — Feature Disabled:**
    ```json
    {
      "success": false,
      "message": "Feature 'documents.access' is not enabled for your organization",
      "errorCode": "FEATURE_DISABLED"
    }
    ```
    _Trigger:_ The organization lacks the `documents.access` feature flag.
- **Important Edge Cases:** If the S3 provider fails during presigned URL generation, errors are trapped and logged as warnings; `logo_url` / `signature_url` resolve to `null` without crashing the endpoint.

---

### 131. PUT /api/v1/documents/hr/letter-branding

- **API Name / Purpose:** Update Organization Letterhead Branding Identity
- **HTTP Method:** `PUT`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-branding`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR needs to configure and maintain authoritative corporate letterhead data, ensuring statutory compliance (correct CIN, GSTIN, PAN numbers) and accurate representation of signatories on issued documentation.
- **Why the API Exists:** Provides atomic replacement and partial-update semantics for text-based branding attributes while strictly preserving binary asset storage pointers managed separately via the presigned handshake.
- **Real-World Usage:** Invoked when HR clicks "Save Changes" on the branding configuration form.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `Content-Type: application/json` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON Payload:**
  | Field | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :---: | :---: | :---: | :--- |
  | `signatory_name` | String | Optional | Yes | None | Full legal name of authorized signatory. Max 120 chars. Must not contain `<` or `>`. Empty string clears to `null`. |
  | `signatory_designation` | String | Optional | Yes | None | Title/role of signatory. Max 120 chars. Must not contain `<` or `>`. Empty string clears to `null`. |
  | `registered_address_lines` | Array[String]| Optional | No | `[]` | Up to 5 lines of physical registered address. Each item max 120 chars without `<` or `>`. |
  | `cin` | String | Optional | Yes | None | Corporate Identification Number. Max 32 chars. Empty string clears to `null`. |
  | `gstin` | String | Optional | Yes | None | GSTIN identifier. Max 32 chars. Empty string clears to `null`. |
  | `pan` | String | Optional | Yes | None | Company PAN identifier. Max 32 chars. Empty string clears to `null`. |
  | `tan` | String | Optional | Yes | None | Company TAN identifier. Max 32 chars. Empty string clears to `null`. |
  | `contact_email` | String | Optional | Yes | None | Valid corporate email address. Max 150 chars. Empty string clears to `null`. |
  | `contact_phone` | String | Optional | Yes | None | Official contact phone number. Max 30 chars. Empty string clears to `null`. |
  | `website` | String | Optional | Yes | None | Valid HTTPS website URI. Max 255 chars. Scheme must be `https`. Empty string clears to `null`. |
  | `accent_color_hex` | String | Optional | No | None | Exact 6-digit hex color format matching `^#[0-9A-Fa-f]{6}$` (e.g. `#2563EB`). CSS injection defense. |
  | `footer_note` | String | Optional | Yes | None | Statutory or operational disclaimer printed at bottom margin. Max 300 chars. |
  | `letterhead_enabled` | Boolean | Optional | No | None | When `false`, completely disables branding compositing on generated documents. |
- **Validation Rules:**
  - Root object enforces `.min(1)`: At least one field must be provided in the request body.
  - All text fields enforce regex `^[^<>]*$` to prevent HTML/XSS injection through Handlebars interpolation.
  - `accent_color_hex` is strictly validated against `^#[0-9A-Fa-f]{6}$` because it is interpolated into inline CSS `<style>` blocks (BR-16 CSS-injection defense).
  - `registered_address_lines` array length cannot exceed 5 items.
- **Request JSON Payload Example:**
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
- **Detailed API Behavior & Processing Flow:**
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
- **Database Impact:** Updates `document_letter_branding` row for caller's `org_id`. Inserts full state diff into `document_audit_logs`.
- **PDF Generation Impact:** Immediate effect. Subsequent letterhead probe (#134) and template previews (#138) immediately reflect updated branding metadata and color theme.
- **File / Storage Impact:** None. Asset storage keys are untouched.
- **Transaction Behavior:** The entire read-modify-write-audit sequence is executed inside an atomic database transaction.
- **Concurrency Behavior:** Row-level locking (`SELECT ... FOR UPDATE`) ensures concurrent updates serialize strictly, preventing lost updates or race conditions.
- **Idempotency / Retry Behavior:** Fully idempotent for identical request payloads.
- **Side Effects:** Writes immutable audit log record.
- **Dependencies:** PostgreSQL `document_letter_branding` table.
- **Security & Authorization (Inside Entry):** All text inputs are sanitised against HTML angle brackets (`<`, `>`) and CSS injection (`accent_color_hex`). Row lock prevents interleaved partial writes.
- **Success Response Structure (HTTP 200 OK):**
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
        "website": "https://www.acme-corp.com"
      },
      "assets": {
        "logo_present": true,
        "signature_present": true
      }
    }
  }
  ```
- **Response Field Documentation:** (Matches field dictionary documented in API #130).
- **Exact Error Response Structures:**
  - **400 Bad Request — Empty Payload:**
    ```json
    {
      "success": false,
      "message": "\"value\" must have at least 1 key",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing `{}` with zero update fields.
  - **400 Bad Request — Angle Brackets Detected:**
    ```json
    {
      "success": false,
      "message": "\"signatory_name\" must not contain < or >",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing `<` or `>` in any text field.
  - **400 Bad Request — Invalid Accent Hex Format:**
    ```json
    {
      "success": false,
      "message": "accent_color_hex must be a 6-digit hex colour like #1F2937",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing an invalid hex string (e.g. `blue`, `#FFF`, `123456`).
  - **400 Bad Request — Insecure Non-HTTPS URI:**
    ```json
    {
      "success": false,
      "message": "\"website\" must be a valid uri with a scheme matching the https pattern",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing an `http://` or non-standard URI scheme for website.
- **Important Edge Cases:** Setting `accent_color_hex: null` or `""` is ignored and omitted from deletion, preserving the existing color or database default `#1F2937`.

---

### 132. POST /api/v1/documents/hr/letter-branding/assets/upload-url

- **API Name / Purpose:** Issue S3 Presigned Upload URL for Branding Asset
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-branding/assets/upload-url`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR needs to upload official branding media (corporate logos and authorized signatory signatures) securely and directly to AWS S3 without passing bulky binary files through the Node.js application server.
- **Why the API Exists:** Issues a cryptographically signed presigned PUT URL with restricted headers, strict size boundaries, and a signed verification token that prevents storage path tampering.
- **Real-World Usage:** Triggered when an HR user selects an image file in the Logo or Signature file picker component.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `Content-Type: application/json` (Required)
- **Request JSON Payload:**
  | Field | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :---: | :---: | :---: | :--- |
  | `asset_type` | String | Required | No | None | Type of letterhead asset. Allowed values: `'logo'`, `'signature'`. |
  | `file_name` | String | Required | No | None | Original filename. Min 1, max 255 chars. Used to derive extension. |
  | `content_type` | String | Required | No | None | Image MIME type. Allowed values: `'image/png'`, `'image/jpeg'`. SVGs banned. |
  | `size_bytes` | Integer | Required | No | None | Exact file size in bytes. Min 1. Upper limit depends on `asset_type`. |
- **Validation & Business Rules:**
  - **Asset Size Limits (BR-1):** `logo`: Maximum **524,288 bytes** (512 KB); `signature`: Maximum **262,144 bytes** (256 KB).
  - **SVG Ban (D-12):** Vector graphics (`image/svg+xml`) are strictly rejected with HTTP `415 Unsupported Media Type` to eliminate script execution and SSRF vulnerabilities in the headless Chromium renderer.
- **Request JSON Payload Example:**
  ```json
  {
    "asset_type": "logo",
    "file_name": "company_crest_highres.png",
    "content_type": "image/png",
    "size_bytes": 142850
  }
  ```
- **Detailed API Behavior & Processing Flow:**
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
- **Database Impact:** Inserts one row in `document_audit_logs`. Branding record is **not** touched until confirmation (#133), leaving zero orphan records if upload is abandoned.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** Generates an AWS S3 presigned PUT URL with strict header constraints. Does not directly create an S3 object.
- **Transaction Behavior:** Isolated audit transaction only.
- **Concurrency Behavior:** Purely additive audit write. No row locking required.
- **Idempotency / Retry Behavior:** Non-idempotent; each request generates a fresh unique storage key and signed token.
- **Side Effects:** Writes audit log entry.
- **Dependencies:** AWS S3 provider and signing credentials.
- **Security & Authorization (Inside Entry):** File size caps enforced before presigning. Presigned PUT binds exact `Content-Length` and `Content-Type` into the AWS signature. Raster formats only (SVGs banned).
- **Success Response Structure (HTTP 201 Created):**
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
- **Response Field Documentation:**
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
- **Exact Error Response Structures:**
  - **413 Payload Too Large — Exceeds Asset Cap:**
    ```json
    {
      "success": false,
      "message": "A logo may not exceed 524288 bytes",
      "errorCode": "FILE_TOO_LARGE"
    }
    ```
    _Trigger:_ Passing `size_bytes > 524288` for logo or `> 262144` for signature.
  - **415 Unsupported Media Type — Banned Media Format:**
    ```json
    {
      "success": false,
      "message": "\"content_type\" must be one of [image/png, image/jpeg]",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing `image/svg+xml`, `image/webp`, `application/pdf`, etc.
  - **502 Bad Gateway — Storage Provider Down:**
    ```json
    {
      "success": false,
      "message": "Document storage is unavailable",
      "errorCode": "STORAGE_UNAVAILABLE"
    }
    ```
    _Trigger:_ S3 bucket configuration missing or AWS STS connectivity failure.
- **Important Edge Cases:** Abandoned uploads leave zero orphaned records in `document_letter_branding`.

---

### 133. POST /api/v1/documents/hr/letter-branding/assets/confirm

- **API Name / Purpose:** Confirm and Commit Uploaded Branding Asset
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-branding/assets/confirm`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Once direct binary upload to S3 completes, the backend must verify that the file landed in S3, inspect its real metadata independently of client claims, and link it atomically to the organization's letterhead configuration.
- **Why the API Exists:** Completes the two-phase upload handshake. Protects against forged upload claims by performing an authoritative server-side `HeadObject` inspection on S3 prior to writing to the database.
- **Real-World Usage:** Triggered immediately after the frontend receives a `200 OK` response from the S3 presigned PUT URL.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `Content-Type: application/json` (Required)
- **Request JSON Payload:**
  | Field | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :---: | :---: | :---: | :--- |
  | `storage_key_token` | String | Required | No | None | Cryptographic JWT issued by API #132. Max 4096 chars. |
  | `checksum` | String | Optional | Yes | None | Optional client-computed SHA-256 or MD5 checksum for auditing. Max 128 chars. |
- **Request JSON Payload Example:**
  ```json
  {
    "storage_key_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdfaWQiOiI3YzllNjY3OS03NDI1LTQwZGUtOTQ0Yi1lMDdmYzFmOTBhZTciLCJhc3NldF90eXBlIjoibG9nbyIsInN0b3JhZ2Vfa2V5Ijoib3JnLzdjOWU2Njc5LTc0MjUtNDBkZS05NDRiLWUwN2ZjMWY5MGFlNy9icmFuZGluZy9sb2dvLzliMWRlYjRkLTNiN2QtNGJhZC05YmRkLTJiMGQ3YjNkY2I2ZC5wbmciLCJwdXJwb3NlIjoibGV0dGVyX2Fzc2V0X3VwbG9hZCIsImlhdCI6MTc1ODk0MDYwMCwiZXhwIjoxNzU4OTQxMjAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```
- **Detailed API Behavior & Processing Flow:**
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
- **Database Impact:** Updates `document_letter_branding` (`logo_storage_key` or `signature_storage_key`, MIME type, byte size, `updated_by`, `updated_at`). Inserts audit log entry in `document_audit_logs`.
- **PDF Generation Impact:** Immediate. The confirmed image will be rendered in subsequent letterhead probe (#134) and template (#138) PDF previews.
- **File / Storage Impact:** Verified against AWS S3 via `headObject`. Existing S3 objects are retained (not deleted synchronously) to prevent race conditions with in-flight renders.
- **Transaction Behavior:** Network I/O (`headObject`) runs outside transaction. Database update and audit log run inside an isolated transaction under locks.
- **Concurrency Behavior:** Enforces serialization per organization using PostgreSQL transaction-scoped advisory locks: `SELECT pg_advisory_xact_lock(hashtext('letter-branding:' || :orgId))` followed by row-level locking (`FOR UPDATE`) on `document_letter_branding`.
- **Idempotency / Retry Behavior:** Fully idempotent. If re-sent with the same token, detects that the key is already committed and returns the branding DTO cleanly without re-auditing.
- **Side Effects:** Writes audit log entry.
- **Dependencies:** AWS S3 provider and PostgreSQL database.
- **Security & Authorization (Inside Entry):** All claims in the token are validated against tenant context. File metadata is verified from AWS S3 directly, never trusting client body data.
- **Success Response Structure (HTTP 200 OK):**
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
- **Response Field Documentation:** (Matches field dictionary documented in API #130).
- **Exact Error Response Structures:**
  - **404 Not Found — Invalid or Expired Claim Token:**
    ```json
    {
      "success": false,
      "message": "The upload claim could not be resolved",
      "errorCode": "UPLOAD_CLAIM_NOT_FOUND"
    }
    ```
    _Trigger:_ Token expired (>10 minutes), invalid signature, wrong purpose, or `org_id` mismatch.
  - **409 Conflict — Uploaded Object Missing in S3:**
    ```json
    {
      "success": false,
      "message": "The uploaded object was not found",
      "errorCode": "UPLOAD_NOT_FOUND"
    }
    ```
    _Trigger:_ Client called confirm without completing the S3 PUT upload, or upload failed.
  - **413 Payload Too Large — S3 Object Exceeds Ceiling:**
    ```json
    {
      "success": false,
      "message": "The uploaded logo exceeds the size limit",
      "errorCode": "FILE_TOO_LARGE"
    }
    ```
    _Trigger:_ S3 HEAD reveals `ContentLength` > 512 KB (logo) or > 256 KB (signature).
  - **415 Unsupported Media Type — Actual MIME Disallowed:**
    ```json
    {
      "success": false,
      "message": "The uploaded object is not a PNG or JPEG",
      "errorCode": "UNSUPPORTED_MEDIA_TYPE"
    }
    ```
    _Trigger:_ S3 HEAD reveals Content-Type is not `image/png` or `image/jpeg`.
- **Important Edge Cases:** If the network to AWS S3 fails during HEAD inspection, throws HTTP `502 Bad Gateway` (`STORAGE_UNAVAILABLE`) and rolls back cleanly without updating the database.

---

### 134. POST /api/v1/documents/hr/letter-branding/preview

- **API Name / Purpose:** Generate and Stream Letterhead Branding Preview PDF
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-branding/preview`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR administrators need immediate visual confirmation that corporate logos, signatures, accent colors, corporate metadata, and margins align properly on a standard A4 page before generating or issuing binding legal letters.
- **Why the API Exists:** Compiles a dedicated internal branding probe template (`_branding_probe`), composites the organization's resolved branding identity, verifies storage and rendering connectivity, and streams back binary PDF bytes directly to the browser with security headers.
- **Real-World Usage:** Invoked when HR clicks "Preview Letterhead" in the branding settings portal.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `Content-Type: application/json` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON Payload:** None (`{}` strictly enforced). Passing any key triggers HTTP `400 Bad Request`.
- **Detailed API Behavior & Processing Flow:**
  1. Validates body is `{}`.
  2. Evaluates Redis rolling rate limit:
     - Key: `pdf:preview:${orgId}:${YYYYMMDDHH}`
     - Increments counter and sets TTL to 3900 seconds.
     - Compares against `document_settings.letter_preview_rate_per_hour` (default 60).
     - If exceeded, throws HTTP `429 Too Many Requests` (`PREVIEW_RATE_LIMITED`). Fails open if Redis is down.
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
- **Database Impact:** Inserts one tracking row in `pdf_render_artifacts` (`status = 'ready'`, `storage_key = NULL`), inserts one audit row in `document_audit_logs`.
- **PDF Generation Impact:** Renders internal probe template `_branding_probe` (Version 1). Applies diagonal `PREVIEW` watermark. Computes SHA-256 canonical JSON input and content hashes.
- **File / Storage Impact:** Reads logo/signature assets from AWS S3. Zero S3 bucket writes (`persist: false`).
- **Transaction Behavior:** Dual-transaction boundary pattern (§17.1). Transaction 1 inserts `pending` row; external render and S3 checks occur outside any transaction; Transaction 2 commits `ready` status and audit log.
- **Concurrency Behavior:** Unique constraint on `(org_id, idempotency_key)` prevents parallel render races.
- **Idempotency / Retry Behavior:** Fully idempotent. Identical branding setups reuse existing artifact rows.
- **Side Effects:** Writes audit log and increments hourly Redis preview counter.
- **Dependencies:** Headless Chromium rendering service (`PDF_RENDERER_BASE_URL`), Redis client, AWS S3.
- **Security & Authorization (Inside Entry):** Rate-limited per organization. Response headers enforce `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` to prevent caching of corporate letterheads on shared client browsers.
- **Success Response Structure (Binary PDF Stream):**
  - **HTTP Status:** `200 OK`
  - **Response Headers:**
    ```http
    HTTP/1.1 200 OK
    Content-Type: application/pdf
    Content-Length: 45120
    Content-Disposition: inline; filename*=UTF-8''branding-preview.pdf
    X-Content-Type-Options: nosniff
    Cache-Control: private, no-store
    X-Artifact-Id: 8f4b1e5a-2c3d-4e5f-9a1b-2c3d4e5f6a7b
    ```
  - **Response Body:** Raw binary PDF byte buffer (`%PDF-1.4 ... %%EOF`).
- **Response Field Documentation (Response Headers):**
  | Header | Value | Description |
  | :--- | :--- | :--- |
  | `Content-Type` | `application/pdf` | Declares binary stream as a PDF document |
  | `Content-Length` | Numeric string | Exact byte length of rendered PDF buffer |
  | `Content-Disposition` | `inline; filename*=UTF-8''branding-preview.pdf` | Directs browser to render inline rather than forcing attachment download |
  | `X-Content-Type-Options`| `nosniff` | Prevents browser MIME-type sniffing |
  | `Cache-Control` | `private, no-store` | Forbids intermediary and local browser caching |
  | `X-Artifact-Id` | UUID string | Database identifier of the committed `pdf_render_artifacts` record |
- **Exact Error Response Structures:**
  - **400 Bad Request — Non-Empty Body:**
    ```json
    {
      "success": false,
      "message": "\"sample\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing any key inside the request JSON body.
  - **429 Too Many Requests — Preview Rate Limit Exceeded:**
    ```json
    {
      "success": false,
      "message": "Preview rate limit reached; try again later",
      "errorCode": "PREVIEW_RATE_LIMITED"
    }
    ```
    _Trigger:_ Organization exceeds hourly preview quota (`letter_preview_rate_per_hour`).
  - **502 Bad Gateway — Renderer Unavailable / Crashed:**
    ```json
    {
      "success": false,
      "message": "The document renderer is unavailable",
      "errorCode": "PDF_RENDERER_UNAVAILABLE"
    }
    ```
    _Trigger:_ Lambda renderer network timeout, connection refused, 5xx error, or non-PDF bytes returned.
  - **503 Service Unavailable — Renderer Unconfigured:**
    ```json
    {
      "success": false,
      "message": "The document renderer is not configured",
      "errorCode": "PDF_RENDERER_NOT_CONFIGURED"
    }
    ```
    _Trigger:_ `PDF_RENDERER_BASE_URL` environment variable is unset.
- **Important Edge Cases:** If a configured logo or signature S3 object is missing from the bucket, `resolveAssetSrcs` logs a warning and suppresses the image block, allowing the preview to render cleanly without crashing.

---

## 2. HR Administration APIs — Letter Template Catalog & Config

### 135. GET /api/v1/documents/hr/letter-templates

- **API Name / Purpose:** List Letter Template Catalog with Organization Config State
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-templates`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR administrators need an overview of all standard letter templates provided by the system (e.g., Experience Letter, Appointment Letter, Bonafide Letter) alongside their organization's enablement status, version pinning, and configuration completeness.
- **Why the API Exists:** Blends static codebase template registry definitions with dynamic tenant database configurations, surfacing orphaned templates if a previously configured template is removed from the codebase.
- **Real-World Usage:** Populates the "Document Templates" dashboard table in the HR admin console.
- **Path Parameters:** None.
- **Query Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `enabled` | Query | Boolean | Optional | Yes | None | Filter templates by enablement status. Allowed values: `true`, `false`. Omit to return all templates. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
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
- **Database Impact:** Read-only query against `document_letter_configs`.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** None.
- **Transaction Behavior:** None (read-only).
- **Concurrency Behavior:** None.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to retry freely.
- **Side Effects:** None.
- **Dependencies:** `letter-templates/registry.js` and `document_letter_configs` table.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`.
- **Success Response Structure (HTTP 200 OK):**
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
- **Response Field Documentation:**
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
- **Exact Error Response Structures:**
  - **400 Bad Request — Invalid Query Parameter:**
    ```json
    {
      "success": false,
      "message": "enabled must be 'true' or 'false'",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing `?enabled=1` or `?enabled=yes`.
- **Important Edge Cases:** Orphaned templates (`is_orphaned: true`) are never deleted or hidden; they are surfaced explicitly so HR understands why a legacy template cannot be rendered.

---

### 136. GET /api/v1/documents/hr/letter-templates/:code

- **API Name / Purpose:** Get Letter Template Details, Form Descriptor & Organization Config
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-templates/:code`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** When configuring a specific letter template, HR administrators need to understand what fields the template accepts, which fields can be pre-configured at the organization level (e.g. `place_of_issue`, `hr_contact_line`), validation constraints (max lengths, required status), and inspection of synthetic sample data.
- **Why the API Exists:** Converts the template's internal Joi schema into an engine-agnostic UI Form Descriptor array (`fields: [{ key, label, type, max_length, required }]`), eliminating frontend hardcoding while exposing current organization configuration.
- **Real-World Usage:** Invoked when opening the "Configure Template" modal or page for a letter template.
- **Path Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `code` | Path | String | Required | No | None | Unique template identifier. Regex: `^[a-z][a-z0-9_]{2,63}$`. E.g. `experience_letter`. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Validates `:code` parameter format via `templateCodeSchema`.
  2. Queries template registry for `code`. If not found, throws HTTP `404 Not Found` (`TEMPLATE_NOT_FOUND`).
  3. Queries `document_letter_configs` by `(org_id, template_code)`.
  4. Transforms the template's Joi `saved_field_schema` into a UI Form Descriptor via `_toFormDescriptor()`:
     - Extracts keys, labels (humanized), types, maximum lengths, and required flags.
  5. Packages metadata: `required_fields`, `optional_fields`, `sample_data`, and active organization `config`.
  6. Returns HTTP `200 OK` with assembled template and config objects.
- **Database Impact:** Read-only query against `document_letter_configs`.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** None.
- **Transaction Behavior:** None (read-only).
- **Concurrency Behavior:** None.
- **Idempotency / Retry Behavior:** Fully idempotent.
- **Side Effects:** None.
- **Dependencies:** `letter-templates/registry.js` and `document_letter_configs` table.
- **Security & Authorization (Inside Entry):** Strictly scoped to tenant `orgId`. Returns `config: null` if the organization has never configured the template.
- **Success Response Structure (HTTP 200 OK):**
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
        "optional_fields": ["department_name", "employee_code", "closing_note"],
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
- **Response Field Documentation:**
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
- **Exact Error Response Structures:**
  - **400 Bad Request — Malformed Template Code:**
    ```json
    {
      "success": false,
      "message": "template code must be 3-64 lowercase letters, digits or underscores and start with a letter",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing an invalid code like `123_test` or `Experience-Letter`.
  - **404 Not Found — Unrecognized Template:**
    ```json
    {
      "success": false,
      "message": "Template not found",
      "errorCode": "TEMPLATE_NOT_FOUND"
    }
    ```
    _Trigger:_ Passing a syntactically valid code that does not exist in `registry.js`.
- **Important Edge Cases:** Registry sample data is verified at boot time to satisfy all `required_fields` so that previews always render successfully out-of-the-box.

---

### 137. PUT /api/v1/documents/hr/letter-templates/:code/config

- **API Name / Purpose:** Upsert Organization Template Configuration & Saved Fields
- **HTTP Method:** `PUT`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-templates/:code/config`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR needs to enable or disable specific letter templates for their company and save standard organization-wide defaults (such as office location or verification contact lines) so issuers do not re-type identical text on every document.
- **Why the API Exists:** Provides atomic upsert semantics for template configuration while validating `saved_fields` against the specific template's declared Joi schema, rejecting unrecognized keys with HTTP `400` to prevent un-rendered blank text in generated letters.
- **Real-World Usage:** Invoked when HR clicks "Save Configuration" in the template settings interface.
- **Path Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `code` | Path | String | Required | No | None | Template identifier code matching `^[a-z][a-z0-9_]{2,63}$`. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `Content-Type: application/json` (Required)
- **Request JSON Payload:**
  | Field | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :---: | :---: | :---: | :--- |
  | `is_enabled` | Boolean | Required | No | None | Master toggle enabling this template for issuance/preview. |
  | `saved_fields` | Object | Optional | No | `{}` | Organization-wide default field values. Keys validated against template schema. |
  | `pinned_version` | Integer | Optional | Yes | `null` | Pin to a specific template version. In Phase 1, only `1` or `null` is allowed. |
  | `reference_pattern` | String | Optional | Yes | `null` | Custom numbering pattern (e.g. `EXP/{YYYY}/{SEQ}`). Max 120 chars. |
  | `requires_acknowledgement`| Boolean | Optional | Yes | `null` | Whether employee must acknowledge receipt in self-service portal. |
  | `is_confidential` | Boolean | Optional | Yes | `null` | Whether access is restricted to HR and direct reporting managers. |
- **Validation Rules:**
  - Top-level request shape validated via `upsertConfigSchema`.
  - `saved_fields` is strictly re-validated against the template's specific `saved_field_schema` using `{ allowUnknown: false, stripUnknown: false }`. Any unrecognised key immediately triggers HTTP `400 Bad Request` (`VALIDATION_ERROR`).
- **Request JSON Payload Example:**
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
- **Detailed API Behavior & Processing Flow:**
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
- **Database Impact:** Upserts row in `document_letter_configs`. Inserts one audit record in `document_audit_logs`.
- **PDF Generation Impact:** Immediate effect. All future preview (#138) and issuance calls will apply the saved field defaults.
- **File / Storage Impact:** None.
- **Transaction Behavior:** The entire read-modify-write-audit sequence runs within an atomic database transaction.
- **Concurrency Behavior:** Row-level locking (`SELECT ... FOR UPDATE`) prevents concurrent update conflicts. A retry loop cleanly handles first-time concurrent insertion collisions on `document_letter_configs_org_template_uq`.
- **Idempotency / Retry Behavior:** Fully idempotent.
- **Side Effects:** Writes immutable audit log record.
- **Dependencies:** PostgreSQL `document_letter_configs` table.
- **Security & Authorization (Inside Entry):** Scoped to tenant `orgId`. Validates `saved_fields` against strict schema to prevent JSON pollution. Audit logs record field keys only, never field values.
- **Success Response Structure (HTTP 200 OK):**
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
- **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :---: | :--- |
  | `success` | Boolean | No | Request success status (`true`) |
  | `message` | String | No | Response status message (`"Template configuration saved"`) |
  | `data` | Object | No | Root data envelope |
  | `data.config` | Object | No | Updated organization template configuration |
  | `data.config.is_enabled` | Boolean | No | Enablement status for letter generation |
  | `data.config.pinned_version` | Integer | Yes | Pinned template version override |
  | `data.config.saved_fields` | Object | No | Stored default field key-value pairs |
- **Exact Error Response Structures:**
  - **400 Bad Request — Unrecognized Saved Field Key:**
    ```json
    {
      "success": false,
      "message": "\"unsupported_key\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing a field name not declared in the template's `saved_field_schema`.
  - **400 Bad Request — Field Length Exceeded:**
    ```json
    {
      "success": false,
      "message": "\"place_of_issue\" length must be less than or equal to 80 characters long",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Exceeding maximum character limit for a saved field.
  - **404 Not Found — Template Code Unknown:**
    ```json
    {
      "success": false,
      "message": "Template not found",
      "errorCode": "TEMPLATE_NOT_FOUND"
    }
    ```
    _Trigger:_ Specifying a `:code` that does not exist in the codebase template registry.
- **Important Edge Cases:** Setting `pinned_version: null` is valid and instructs the system to automatically track the latest version of the template as new revisions are released.

---

### 138. POST /api/v1/documents/hr/letter-templates/:code/preview

- **API Name / Purpose:** Generate and Stream Letter Template Preview PDF
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letter-templates/:code/preview`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR needs to preview how a specific letter template will look when rendered with their company letterhead, saved organizational fields, and temporary test overrides, ensuring formatting, table structures, and pagination are visually perfect before issuing letters to employees.
- **Why the API Exists:** Provides an end-to-end rendering pipeline that composites letterhead branding, merges template sample data with saved defaults and ad-hoc overrides, passes the view-model through strict completeness validation, and streams back a watermarked A4 PDF.
- **Real-World Usage:** Invoked when HR clicks "Preview Letter" on any letter template view.
- **Path Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `code` | Path | String | Required | No | None | Template identifier code matching `^[a-z][a-z0-9_]{2,63}$`. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `Content-Type: application/json` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON Payload:**
  | Field | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :---: | :---: | :---: | :--- |
  | `use_saved_fields` | Boolean | Optional | No | `true` | When `true`, merges organization's saved fields from `document_letter_configs`. When `false`, ignores saved config. |
  | `override_fields` | Object | Optional | No | `{}` | Ad-hoc field overrides for this preview execution only. Keys validated against template schema. |
- **Security Guard — Strict Prohibition of Real PII (§1.4(2)):**
  - `allowUnknown: false` is enforced on the root body schema.
  - Passing `subject_user_id` or any unrecognised parameter immediately fails validation with HTTP `400 Bad Request` (`VALIDATION_ERROR`). This prevents real employee data from reaching the unauthenticated rendering service (D-14).
- **Request JSON Payload Example:**
  ```json
  {
    "use_saved_fields": true,
    "override_fields": {
      "place_of_issue": "Mumbai Central Office",
      "hr_contact_line": "Direct verification line: +91 22 2490 0000"
    }
  }
  ```
- **Detailed API Behavior & Processing Flow:**
  1. Validates `:code` parameter. Fetches registry entry; if missing, throws HTTP `404 Not Found` (`TEMPLATE_NOT_FOUND`).
  2. Validates top-level body shape via `previewTemplateSchema`.
  3. Validates `override_fields` against the template's `saved_field_schema` (unknown keys fail with HTTP `400`).
  4. Checks Redis rolling rate limit (`letter_preview_rate_per_hour`). Throws HTTP `429` if exceeded. Fails open if Redis is down.
  5. Queries `document_letter_configs` for `(org_id, code)`.
     - If `use_saved_fields === true` and config exists with `is_enabled === false`, throws HTTP `409 Conflict` (`TEMPLATE_DISABLED`).
     - Extracts `saved_fields` if enabled.
  6. Resolves letterhead branding view-model via `resolveBranding()` (reads S3 assets outside transaction).
  7. Hierarchical Field Merging:
     `Merged Fields = sample_data <- saved_fields <- override_fields`
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
- **Database Impact:** Inserts one tracking row in `pdf_render_artifacts` (`status = 'ready'`, `source_type = 'preview'`, `storage_key = NULL`), inserts one audit row in `document_audit_logs`.
- **PDF Generation Impact:** Renders letter template (`experience_letter`, `appointment_letter`, `bonafide_letter`). Applies diagonal `PREVIEW` watermark. Computes SHA-256 canonical JSON input and content hashes.
- **File / Storage Impact:** Reads logo/signature assets from AWS S3. Zero S3 bucket writes (`persist: false`).
- **Transaction Behavior:** Dual-transaction boundary pattern (§17.1). Transaction 1 inserts `pending` row; external render and S3 checks occur outside any transaction; Transaction 2 commits `ready` status and audit log.
- **Concurrency Behavior:** Safe from concurrent duplicate races via the database unique index on `(org_id, idempotency_key)`.
- **Idempotency / Retry Behavior:** Fully idempotent. Identical inputs re-render into the existing artifact without creating orphan rows.
- **Side Effects:** Writes audit log and increments hourly Redis preview counter.
- **Dependencies:** Headless Chromium rendering service (`PDF_RENDERER_BASE_URL`), Redis client, AWS S3.
- **Security & Authorization (Inside Entry):** Enforces strict role restriction (`hr`). Disallows employee targeting (`subject_user_id` strictly prohibited). Response headers enforce `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
- **Success Response Structure (Binary PDF Stream):**
  - **HTTP Status:** `200 OK`
  - **Response Headers:**
    ```http
    HTTP/1.1 200 OK
    Content-Type: application/pdf
    Content-Length: 68420
    Content-Disposition: inline; filename*=UTF-8''experience_letter-preview.pdf
    X-Content-Type-Options: nosniff
    Cache-Control: private, no-store
    X-Artifact-Id: 3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11
    ```
  - **Response Body:** Raw binary PDF byte buffer (`%PDF-1.4 ... %%EOF`).
- **Response Field Documentation (Response Headers):**
  | Header | Value | Description |
  | :--- | :--- | :--- |
  | `Content-Type` | `application/pdf` | Declares binary stream as a PDF document |
  | `Content-Length` | Numeric string | Exact byte length of rendered PDF buffer |
  | `Content-Disposition` | `inline; filename*=UTF-8''<template>-preview.pdf` | Directs browser to render inline rather than forcing attachment download |
  | `X-Content-Type-Options`| `nosniff` | Prevents browser MIME-type sniffing |
  | `Cache-Control` | `private, no-store` | Forbids intermediary and local browser caching |
  | `X-Artifact-Id` | UUID string | Database identifier of the committed `pdf_render_artifacts` record |
- **Exact Error Response Structures:**
  - **400 Bad Request — Disallowed Subject Parameter (PII Defense):**
    ```json
    {
      "success": false,
      "message": "\"subject_user_id\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing `subject_user_id` or any real employee identifier.
  - **400 Bad Request — Unrecognized Override Field:**
    ```json
    {
      "success": false,
      "message": "\"unknown_field\" is not allowed",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
    _Trigger:_ Passing a field key in `override_fields` not defined in the template schema.
  - **404 Not Found — Unknown Template Code:**
    ```json
    {
      "success": false,
      "message": "Template not found",
      "errorCode": "TEMPLATE_NOT_FOUND"
    }
    ```
    _Trigger:_ Path parameter `:code` not found in registry.
  - **409 Conflict — Template Disabled by Organization Policy:**
    ```json
    {
      "success": false,
      "message": "This template is disabled for your organization",
      "errorCode": "TEMPLATE_DISABLED"
    }
    ```
    _Trigger:_ `use_saved_fields: true` when `document_letter_configs.is_enabled === false`.
  - **422 Unprocessable Entity — Missing Required Field:**
    ```json
    {
      "success": false,
      "message": "The letter cannot be issued: required field \"employee_name\" is missing",
      "errorCode": "PDF_DATA_INCOMPLETE"
    }
    ```
    _Trigger:_ Any required template field resolves to empty string, `null`, or `undefined`.
  - **429 Too Many Requests — Preview Hourly Rate Cap:**
    ```json
    {
      "success": false,
      "message": "Preview rate limit reached; try again later",
      "errorCode": "PREVIEW_RATE_LIMITED"
    }
    ```
    _Trigger:_ Hourly preview rate exceeds `letter_preview_rate_per_hour`.
  - **500 Internal Server Error — Template Markup Syntax Error:**
    ```json
    {
      "success": false,
      "message": "The letter template could not be rendered",
      "errorCode": "PDF_TEMPLATE_INVALID"
    }
    ```
    _Trigger:_ Handlebars compilation or Chromium rendering rejected by Lambda renderer with 400.
  - **502 Bad Gateway — Lambda Renderer Unreachable or Timed Out:**
    ```json
    {
      "success": false,
      "message": "The document renderer is unavailable",
      "errorCode": "PDF_RENDERER_UNAVAILABLE"
    }
    ```
    _Trigger:_ Network failure, 5xx, or non-PDF bytes from the rendering engine.
  - **503 Service Unavailable — Renderer Unconfigured:**
    ```json
    {
      "success": false,
      "message": "The document renderer is not configured",
      "errorCode": "PDF_RENDERER_NOT_CONFIGURED"
    }
    ```
    _Trigger:_ Missing `PDF_RENDERER_BASE_URL` in environment variables.
- **Important Edge Cases:** If an organization has never configured a template (no database config row exists), previews succeed smoothly using catalog `sample_data`.

---

## 3. Existing APIs Modified / Extended by Phase 1: None (Zero Contract Modifications)

Phase 1 is strictly additive and introduces nine new endpoints (#130–#138) on the HR plane. No existing Document Module, Payroll Module, or Core Module API request payloads (`req.body`), query parameters, or response payloads (`res.body`) were modified or extended.

---

# Phase 2: Letter Issuance & Reissue (APIs #139–#142)

## 4. HR Administration APIs — Letter Issuance, Reissue & Retrieval

### 139. POST /api/v1/documents/hr/letters

- **API Name / Purpose:** Issue Formal Organization Letter
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letters`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Issues an authoritative, legally binding, and numbered corporate letter for an active employee. Automatically extracts verified employee profile, organizational department, and approved payroll compensation facts, merges organization branding and letterhead configuration, assigns a sequential corporate reference number under strict lock ordering, renders a tamper-evident PDF via headless Chromium, uploads the binary file to AWS S3, materializes the document directly in the employee's personal Document Portal, and writes an immutable audit trail.
- **Why the API Exists:** Provides a single, atomic operation transitioning a template and subject into an official, published corporate document without manual PDF uploading or offline number tracking.
- **Real-World Usage:** Invoked in the HR administrative portal when issuing Bonafide Letters (for employee bank loans/visas), Experience Certificates, Relieving Letters, or Appointment/Offer Letters.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "template_code": "bonafide_letter",
    "subject_user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "field_overrides": {
      "purpose": "Opening a salary account with HDFC Bank"
    },
    "effective_date": "2026-09-27",
    "idempotency_key": "issue-bonafide-emp402-20260927"
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `template_code` | Body | String | **Yes** | No | — | Unique code of the letter template in the catalog registry (e.g. `bonafide_letter`, `experience_letter`). Max 64 chars. |
  | `subject_user_id` | Body | UUIDv4 | **Yes** | No | — | UUID of the recipient employee. Must exist within the caller's organization. |
  | `field_overrides` | Body | Object | Optional | No | `{}` | Key-value dictionary of narrative field overrides. Max 20 keys. Depth 1 only. Values must be string (max 500 chars), number, or boolean. Must NOT target derived fields. |
  | `effective_date` | Body | String | Optional | No | UTC today | ISO date string (`YYYY-MM-DD`). Must fall within ±365 days of the current date. Used for template `issued_on_text` and reference FY calculations. |
  | `idempotency_key` | Body | String | Optional | No | Auto-derived | Unique client idempotency key (8–120 characters, matching `^[A-Za-z0-9._:-]+$`). If omitted, an SHA-256 key is automatically derived from input parameters. |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` and `actorId` from verified token claims (`req.user.orgId`, `req.user.id`).
  3. Validates request body shape via `issueLetterSchema` (`allowUnknown: false` at root).
  4. Looks up template in registry (`registry.get(template_code)`). Throws `404 LETTER_TEMPLATE_UNKNOWN` if absent.
  5. Queries `document_letter_configs` for `(org_id, template_code)`. Throws `409 LETTER_TEMPLATE_DISABLED` if config is missing or `is_enabled !== true`.
  6. Queries `document_types` by code. Throws `409 DOCUMENT_TYPE_NOT_ACTIVATED` if absent, `409 DOCUMENT_TYPE_INACTIVE` if inactive, or `422 DOCUMENT_TYPE_PLANE_MISMATCH` if `plane !== 'org'`.
  7. Reads organization settings (`document_settings`) to freeze confidentiality and acknowledgement defaults.
  8. Validates `field_overrides`: throws `422 LETTER_FIELD_UNKNOWN` if key is not declared in template fields, or `422 LETTER_FIELD_NOT_OVERRIDABLE` if key matches any entry in `template.derived_fields`.
  9. Resolves employee facts via `document_letter_facts.service.js`. Throws `404 DOCUMENT_NOT_FOUND` if employee not found in org, or `422 LETTER_FACTS_MISSING` if a required derived fact is missing.
  10. Resolves organization branding via `branding.builder.js`. Fetches presigned asset data URIs if branding is enabled.
  11. Assembles render view-model via pure builder `buildIssueViewModel()`. Throws `422 PDF_DATA_INCOMPLETE` if any required template field resolves to empty. Reference number is intentionally omitted.
  12. Computes SHA-256 idempotency key. Probes `pdf_render_artifacts`. If an existing ready artifact is found, returns existing document as HTTP `200 OK` (`reused: true`).
  13. Generates new UUIDs for `documentId` and `groupId`.
  14. Dispatches to `renderAndRecord()`:
      a. Phase A: Inserts row in `pdf_render_artifacts` with `status = 'pending'`, `retention_class = 'record'`.
      b. Network Phase: Calls external Puppeteer renderer (`POST /v1/pdf/generate`), verifies magic bytes (`%PDF-` and `%%EOF`), and uploads PDF buffer to AWS S3 (`org/{org_id}/pdf/letter/{artifact_id}.pdf`).
      c. Phase B (`onReady` Hook inside DB Transaction):
      - Acquires transaction-scoped advisory lock on document group: `SELECT pg_advisory_xact_lock(hashtext('docorg:' || :orgId || ':' || :groupId))`.
      - Re-checks subject existence and active document type status.
      - Allocates next reference number under row lock `FOR UPDATE` on `document_letter_sequences`.
      - Inserts new row into `org_documents` (`origin = 'generated'`, `status = 'published'`, `generation_artifact_id = artifactId`, `reference_number = referenceNumber`).
      - Materializes recipient in `org_document_recipients` (`state = 'pending'`).
      - Writes audit log entries: `letter.generated` on artifact, `letter.issued` on document.
      - Updates `pdf_render_artifacts` to `status = 'ready'`.
  15. Returns HTTP `201 Created` with letter and artifact metadata.
- **Database Impact:**
  - **Reads:** `document_letter_configs`, `document_types`, `document_settings`, `organization_profiles`, `document_letter_branding`, `employee_profiles` / `user_profiles`, `document_letter_sequences` (with `FOR UPDATE`).
  - **Writes:**
    - `pdf_render_artifacts` (INSERT pending, UPDATE ready).
    - `document_letter_sequences` (INSERT or UPDATE incrementing `last_number`).
    - `org_documents` (INSERT with `origin = 'generated'`).
    - `org_document_recipients` (INSERT single recipient).
    - `document_audit_logs` (INSERT two audit entries).
  - **Locking:** PostgreSQL transaction advisory lock on `groupId`, row lock (`FOR UPDATE`) on sequence counter row. Sequence lock is held for <10ms exclusively within the final commit phase.
- **PDF Generation Impact:**
  - View-model assembled via `buildIssueViewModel` (Handlebars HTML).
  - External Chromium renderer executes headless rendering to A4 PDF with 0.5-inch margins.
  - PDF bytes uploaded to AWS S3 under key `org/{org_id}/pdf/letter/{artifact_id}.pdf`.
  - Magic bytes validated (`%PDF-` at byte 0, `%%EOF` in trailing 1024 bytes).
- **File / Storage Impact:** Uploads binary PDF stream to AWS S3 under `org/{org_id}/pdf/letter/{artifact_id}.pdf` with `ContentType: application/pdf`.
- **Transaction Behavior:** Dual-transaction boundary pattern (BR-24, §17.1). Zero network calls inside DB transactions. `onReady` hook executes inside an atomic transaction committing document row, sequence increment, recipient materialization, and artifact `ready` state.
- **Concurrency Behavior:** Protected by transaction-scoped PostgreSQL advisory lock (`docorg:{orgId}:{groupId}`) and pessimistic row-level lock (`FOR UPDATE`) on `document_letter_sequences`. Safe retry logic handles unique constraint collisions (`23505`).
- **Idempotency / Retry Behavior:**
  - When `idempotency_key` is supplied by client, identical requests return HTTP `200 OK` with `reused: true`.
  - If client omits `idempotency_key`, an SHA-256 hash of canonicalized inputs (`template_code`, `template_version`, `subject_user_id`, `pinned_date`, `field_overrides`, `saved_fields_hash`, `branding_hash`) is generated.
  - If a transient failure occurs with a derived key, a bounded failure salt (`:r1`, `:r2`, `:r3`, `:r4`) is appended. If 5 prior attempts failed, the 6th attempt is rejected with HTTP `409 Conflict` (`PDF_RETRY_LIMIT_EXCEEDED`).
- **Side Effects:** Publishes document to employee self-service portal, inserts recipient record, records audit trail.
- **Dependencies:** Headless Chromium rendering engine (`PDF_RENDERER_BASE_URL`), AWS S3, PostgreSQL, Document Type catalog.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. `authorize(['hr'])` and `requireFeature('documents.access')`. Subject employee membership verified in caller's organization (`404 DOCUMENT_NOT_FOUND` if outside). Response scrubs `storage_key` and internal snapshot.
- **Success Response Structure (Fresh Issue — HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Letter issued",
    "data": {
      "letter": {
        "id": "e4f3a120-7b3d-4c31-8f55-123456789abc",
        "document_group_id": "a1b2c3d4-e5f6-7a8b-9c0d-112233445566",
        "version": 1,
        "status": "published",
        "origin": "generated",
        "reference_number": "ACME/BON/2026-2027/0001",
        "document_type_id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Bonafide Letter — Asha Rao",
        "file_name": "bonafide-letter-asha-rao-2026-09-27.pdf",
        "size_bytes": 84213,
        "checksum_sha256": "3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
        "is_confidential": true,
        "requires_acknowledgement": false,
        "recipient_count": 1,
        "published_at": "2026-09-27T09:14:22.000Z",
        "template": {
          "code": "bonafide_letter",
          "version": 1
        }
      },
      "artifact": {
        "id": "770e8400-e29b-41d4-a716-446655440011",
        "size_bytes": 84213,
        "content_hash": "3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b"
      },
      "reused": false
    }
  }
  ```
- **Success Response Structure (Idempotent Replay — HTTP 200 OK):**
  Same body structure as HTTP 201, with HTTP status `200`, message `"Letter already issued"`, and `"reused": true`.
- **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :---: | :--- |
  | `success` | Boolean | No | Request success indicator (always `true` on 200/201). |
  | `message` | String | No | Response message (`"Letter issued"` or `"Letter already issued"`). |
  | `data.letter.id` | UUIDv4 | No | Identifier of the created `org_documents` row. |
  | `data.letter.document_group_id`| UUIDv4 | No | Document group identifier for version lineage. |
  | `data.letter.version` | Integer | No | Version number of the letter (starts at `1`). |
  | `data.letter.status` | String | No | Document status (always `'published'`). |
  | `data.letter.origin` | String | No | Document origin discriminator (always `'generated'`). |
  | `data.letter.reference_number` | String | No | Official assigned corporate reference number. |
  | `data.letter.document_type_id` | UUIDv4 | No | Identifier of the mapped active document type. |
  | `data.letter.title` | String | No | Generated title (e.g. `Bonafide Letter — Asha Rao`). |
  | `data.letter.file_name` | String | No | Generated PDF file name. |
  | `data.letter.size_bytes` | Integer | No | Size of generated PDF file in bytes. |
  | `data.letter.checksum_sha256` | String | No | SHA-256 hash of the generated PDF content. |
  | `data.letter.is_confidential` | Boolean | No | Confidentiality flag frozen from settings. |
  | `data.letter.requires_acknowledgement` | Boolean | No | Acknowledgement flag frozen from settings/payload. |
  | `data.letter.recipient_count` | Integer | No | Number of recipients addressed (always `1`). |
  | `data.letter.published_at` | String (ISO) | No | Timestamp when letter was published. |
  | `data.letter.template.code` | String | No | Template code used for generation. |
  | `data.letter.template.version`| Integer | No | Template version used for generation. |
  | `data.artifact.id` | UUIDv4 | No | Identifier of the underlying `pdf_render_artifacts` record. |
  | `data.artifact.size_bytes` | Integer | No | Byte length of generated PDF. |
  | `data.artifact.content_hash` | String | No | Cryptographic content hash of the PDF. |
  | `data.reused` | Boolean | No | `false` on initial creation; `true` on idempotent replay. |
- **Exact Error Response Structures:**
  - **400 Bad Request — Validation Error:**
    ```json
    {
      "success": false,
      "message": "effective_date must be within 365 days of today",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
  - **404 Not Found — Template Unknown:**
    ```json
    {
      "success": false,
      "message": "Letter template not found",
      "errorCode": "LETTER_TEMPLATE_UNKNOWN"
    }
    ```
  - **404 Not Found — Subject Not Found:**
    ```json
    {
      "success": false,
      "message": "Document subject not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Template Disabled:**
    ```json
    {
      "success": false,
      "message": "This letter template is disabled for your organization",
      "errorCode": "LETTER_TEMPLATE_DISABLED"
    }
    ```
  - **409 Conflict — Document Type Inactive:**
    ```json
    {
      "success": false,
      "message": "The document type for this letter is inactive",
      "errorCode": "DOCUMENT_TYPE_INACTIVE"
    }
    ```
  - **409 Conflict — Render In Progress:**
    ```json
    {
      "success": false,
      "message": "A render is already in progress for this document",
      "errorCode": "PDF_RENDER_IN_PROGRESS"
    }
    ```
  - **409 Conflict — Retry Limit Exceeded:**
    ```json
    {
      "success": false,
      "message": "This letter has failed too many times; please try again later",
      "errorCode": "PDF_RETRY_LIMIT_EXCEEDED"
    }
    ```
  - **422 Unprocessable Entity — Field Not Overridable:**
    ```json
    {
      "success": false,
      "message": "Field \"designation\" is derived and cannot be overridden",
      "errorCode": "LETTER_FIELD_NOT_OVERRIDABLE",
      "details": { "field": "designation" }
    }
    ```
  - **422 Unprocessable Entity — Missing Derived Facts:**
    ```json
    {
      "success": false,
      "message": "Required letter facts are missing: employee_code, joining_date",
      "errorCode": "LETTER_FACTS_MISSING",
      "details": { "missing_facts": ["employee_code", "joining_date"] }
    }
    ```
  - **422 Unprocessable Entity — Incomplete PDF Data:**
    ```json
    {
      "success": false,
      "message": "The letter cannot be issued: required field(s) missing: employee_code",
      "errorCode": "PDF_DATA_INCOMPLETE",
      "details": { "missing_fields": ["employee_code"] }
    }
    ```
  - **502 Bad Gateway — Renderer Unavailable:**
    ```json
    {
      "success": false,
      "message": "The document renderer is unavailable",
      "errorCode": "PDF_RENDERER_UNAVAILABLE"
    }
    ```
  - **504 Gateway Timeout — Renderer Timeout:**
    ```json
    {
      "success": false,
      "message": "The document renderer timed out",
      "errorCode": "PDF_RENDER_TIMEOUT"
    }
    ```
- **Important Edge Cases:**
  - If a concurrent issue request with the exact same idempotency key is already executing, the second request fails gracefully with `409 PDF_RENDER_IN_PROGRESS`.
  - If an employee profile lacks optional fields (e.g. reporting manager or department), the builder cleanly collapses the corresponding conditional blocks without throwing errors.

---

### 140. GET /api/v1/documents/hr/letters

- **API Name / Purpose:** List Generated Organization Letters
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letters`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Retrieves a paginated, filterable register of all formal letters issued by the organization, with instant filtering by template code, subject employee, document status, reference number, and date ranges.
- **Why the API Exists:** Provides an optimized, partial-indexed query view (`org_documents_org_generated_idx`) restricted strictly to `origin = 'generated'` with internal S3 storage keys and sensitive parameters scrubbed.
- **Real-World Usage:** Powers the "Issued Letters" tab in the HR administrative portal.
- **Path Parameters:** None.
- **Query Parameters:**
  | Parameter | Type | Required | Default | Allowed Values / Validation Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `template_code` | String | Optional | — | Filter by catalog template code (e.g. `bonafide_letter`). Resolves to `document_type_id`. Throws `400` if code is unknown. |
  | `subject_user_id` | UUIDv4 | Optional | — | Filter by recipient employee UUID. Matched via `included_users @> ARRAY[:subjectUserId]`. |
  | `document_type_id` | UUIDv4 | Optional | — | Direct filter by document type UUID. |
  | `status` | String | Optional | — | Filter by status: `published`, `superseded`, or `retired`. |
  | `reference_number` | String | Optional | — | Exact string match on assigned reference number. |
  | `issued_from` | String | Optional | — | ISO date string (`YYYY-MM-DD`). Documents published on or after this date. |
  | `issued_to` | String | Optional | — | ISO date string (`YYYY-MM-DD`). Documents published on or before this date. Must be `>= issued_from`. |
  | `page` | Integer | Optional | `1` | Page number. Minimum `1`. |
  | `limit` | Integer | Optional | `20` | Page size. Integer between `1` and `100`. |
  | `sort` | String | Optional | `published_at` | Sort column: `published_at` or `reference_number`. |
  | `order` | String | Optional | `desc` | Sort direction: `asc` or `desc`. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `hr` role and `documents.access` feature.
  2. Validates query parameters via `listLettersQuerySchema` (ensures `issued_from <= issued_to`).
  3. If `template_code` is provided:
     - Checks registry. Throws `400 LETTER_TEMPLATE_UNKNOWN` if code does not exist in catalog.
     - Looks up mapped `document_type_id` for this organization. If this org never activated the document type, short-circuits and returns an empty list (`items: []`, `total: 0`).
  4. Calls `orgRepo.listGenerated(orgId, filters)` using partial index `org_documents_org_generated_idx`.
  5. Projects rows through safe list serializer (`_letterListView`):
     - Derives `display_status` using Indian Standard Time (IST).
     - Excludes `storage_key`, `reference_url`, and internal metadata.
  6. Computes pagination metadata and returns HTTP `200 OK`.
- **Database Impact:** Read-only query on `org_documents` (`SELECT ... WHERE org_id = :orgId AND origin = 'generated' ...`), and `document_types` if `template_code` is provided. Zero writes.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** None.
- **Transaction Behavior:** None (read-only query outside transaction).
- **Concurrency Behavior:** Fully concurrent read-only queries served by partial database index.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to retry freely.
- **Side Effects:** None.
- **Dependencies:** PostgreSQL `org_documents` and `document_types` tables.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. `authorize(['hr'])` and `requireFeature('documents.access')`. Confidential letters are visible to HR (tenant administrative ceiling). `storage_key` and `reference_url` are structurally excluded.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "items": [
        {
          "id": "e4f3a120-7b3d-4c31-8f55-123456789abc",
          "document_group_id": "a1b2c3d4-e5f6-7a8b-9c0d-112233445566",
          "version": 1,
          "supersedes_id": null,
          "status": "published",
          "display_status": "active",
          "origin": "generated",
          "reference_number": "ACME/BON/2026-2027/0001",
          "document_type_id": "550e8400-e29b-41d4-a716-446655440000",
          "title": "Bonafide Letter — Asha Rao",
          "file_name": "bonafide-letter-asha-rao-2026-09-27.pdf",
          "size_bytes": 84213,
          "checksum_sha256": "3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
          "is_confidential": true,
          "requires_acknowledgement": false,
          "recipient_count": 1,
          "published_at": "2026-09-27T09:14:22.000Z",
          "superseded_at": null
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "total_pages": 1
      }
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :---: | :--- |
  | `success` | Boolean | No | Request success indicator (always `true` on 200). |
  | `message` | String | No | Response message (`"OK"`). |
  | `data.items[].id` | UUIDv4 | No | Identifier of the `org_documents` record. |
  | `data.items[].document_group_id` | UUIDv4 | No | Group identifier linking all versions of a document. |
  | `data.items[].version` | Integer | No | Version number of the letter. |
  | `data.items[].supersedes_id` | UUIDv4 | Yes | Predecessor document identifier (null on Version 1). |
  | `data.items[].status` | String | No | Stored document status (`published`, `superseded`, `retired`). |
  | `data.items[].display_status` | String | No | Computed IST display status (`active`, `expired`, `superseded`, `retired`). |
  | `data.items[].origin` | String | No | Origin discriminator (`'generated'`). |
  | `data.items[].reference_number` | String | No | Assigned legal corporate reference number. |
  | `data.items[].document_type_id` | UUIDv4 | No | Identifier of mapped document type. |
  | `data.items[].title` | String | No | Title of the letter. |
  | `data.items[].file_name` | String | No | File name of the PDF. |
  | `data.items[].size_bytes` | Integer | No | File size in bytes. |
  | `data.items[].checksum_sha256` | String | No | Cryptographic content hash of the PDF. |
  | `data.items[].is_confidential` | Boolean | No | Whether letter is marked confidential. |
  | `data.items[].requires_acknowledgement`| Boolean | No | Whether employee acknowledgement is required. |
  | `data.items[].recipient_count` | Integer | No | Number of recipients (always `1` for letters). |
  | `data.items[].published_at` | String (ISO) | No | Timestamp when letter was published. |
  | `data.items[].superseded_at` | String (ISO) | Yes | Timestamp when letter was superseded by a reissue. |
  | `data.pagination.page` | Integer | No | Current page number. |
  | `data.pagination.limit` | Integer | No | Current page size limit. |
  | `data.pagination.total` | Integer | No | Total count of matching generated letters. |
  | `data.pagination.total_pages` | Integer | No | Total calculated page count. |
- **Exact Error Response Structures:**
  - **400 Bad Request — Date Range Invalid:**
    ```json
    {
      "success": false,
      "message": "issued_from must not be after issued_to",
      "errorCode": "VALIDATION_ERROR"
    }
    ```
  - **400 Bad Request — Template Code Unknown:**
    ```json
    {
      "success": false,
      "message": "Unknown template code \"invalid_code\"",
      "errorCode": "LETTER_TEMPLATE_UNKNOWN",
      "details": { "field": "template_code" }
    }
    ```
- **Important Edge Cases:**
  - If `template_code` belongs to a valid catalog entry whose document type was never activated for this tenant, the endpoint returns an empty array with HTTP 200 rather than an error.

---

### 141. GET /api/v1/documents/hr/letters/:id

- **API Name / Purpose:** Get Generated Letter Detail & Render Audit
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/:id`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Retrieves comprehensive document details for an issued letter, including version lineage, recipient delivery state, and the cryptographic provenance of the render artifact (renderer engine version, render duration, input hash, content hash).
- **Why the API Exists:** Provides an extended view joining the `org_documents` record with its underlying `pdf_render_artifacts` audit entry, while enforcing strict tenant isolation and preventing existence leaks.
- **Real-World Usage:** Invoked when clicking on a letter in the issued letters list to view its summary modal, version history, or audit metadata.
- **Path Parameters:**
  | Parameter | Location | Type | Required | Description |
  | :--- | :--- | :--- | :---: | :--- |
  | `:id` | Path | UUIDv4 | **Yes** | The UUID of the `org_documents` record. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `hr` role and `documents.access` feature.
  2. Validates path parameter `:id` is a valid UUIDv4.
  3. Queries `org_documents` via `findGeneratedById(orgId, id)`.
     - Scopes strictly to `where: { id, org_id: orgId, origin: 'generated' }`.
     - If the row does not exist, belongs to another organization, is soft-deleted, or has `origin === 'uploaded'`, returns `null`.
     - Throws uniform HTTP `404 Not Found` (`DOCUMENT_NOT_FOUND`).
  4. If `generation_artifact_id` is present, queries `pdf_render_artifacts` via `findSafeById(artifactId, orgId)` using `SAFE_ATTRIBUTES` (omitting `input_snapshot`, `storage_key`, and `idempotency_key`).
  5. Assembles `generation` audit block.
  6. Computes `display_status` and `is_actionable`. Strips `storage_key` and `reference_url`.
  7. Returns HTTP `200 OK`.
- **Database Impact:** Reads `org_documents` (`SELECT ... WHERE id = :id AND org_id = :orgId AND origin = 'generated'`) and `pdf_render_artifacts` (`SELECT ... WHERE id = :artifactId AND org_id = :orgId`). Zero writes.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** None.
- **Transaction Behavior:** None (read-only query).
- **Concurrency Behavior:** Fully concurrent read-only queries.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to retry freely.
- **Side Effects:** None.
- **Dependencies:** PostgreSQL `org_documents` and `pdf_render_artifacts` tables.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. `authorize(['hr'])` and `requireFeature('documents.access')`. Uploaded rows or cross-tenant IDs return uniform `404 DOCUMENT_NOT_FOUND` to prevent existence leaks. `storage_key`, `reference_url`, and `input_snapshot` are strictly scrubbed.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "id": "e4f3a120-7b3d-4c31-8f55-123456789abc",
      "org_id": "00000000-0000-0000-0000-000000000001",
      "document_type_id": "550e8400-e29b-41d4-a716-446655440000",
      "document_group_id": "a1b2c3d4-e5f6-7a8b-9c0d-112233445566",
      "version": 1,
      "supersedes_id": null,
      "title": "Bonafide Letter — Asha Rao",
      "description": null,
      "status": "published",
      "origin": "generated",
      "generation_artifact_id": "770e8400-e29b-41d4-a716-446655440011",
      "reference_number": "ACME/BON/2026-2027/0001",
      "effective_from": null,
      "effective_to": null,
      "target_departments": [],
      "target_locations": [],
      "target_employment_types": [],
      "target_job_statuses": [],
      "included_users": ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"],
      "excluded_users": [],
      "targeting": {
        "criteria": {
          "target_departments": [],
          "target_locations": [],
          "target_employment_types": [],
          "target_job_statuses": [],
          "included_users": ["9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"],
          "excluded_users": []
        },
        "labels": {},
        "scope": "specific_users",
        "summary": "1 employee",
        "resolved_at": "2026-09-27T09:14:22.000Z",
        "resolved_count": 1
      },
      "requires_acknowledgement": false,
      "acknowledgement_due_days": null,
      "requires_signature": false,
      "is_confidential": true,
      "storage_backend": "s3",
      "file_name": "bonafide-letter-asha-rao-2026-09-27.pdf",
      "content_type": "application/pdf",
      "size_bytes": 84213,
      "checksum_sha256": "3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
      "confirmed_at": "2026-09-27T09:14:22.000Z",
      "published_by": "11111111-2222-3333-4444-555555555555",
      "published_at": "2026-09-27T09:14:22.000Z",
      "superseded_at": null,
      "retired_by": null,
      "retired_at": null,
      "retirement_reason": null,
      "proposed_by": null,
      "approved_by": null,
      "actioned_at": null,
      "rejection_reason": null,
      "recipient_count": 1,
      "created_by": "11111111-2222-3333-4444-555555555555",
      "updated_by": null,
      "materialisation_state": "not_required",
      "materialised_at": null,
      "recipient_target_count": null,
      "created_at": "2026-09-27T09:14:22.000Z",
      "updated_at": "2026-09-27T09:14:22.000Z",
      "display_status": "active",
      "is_actionable": true,
      "generation": {
        "artifact_id": "770e8400-e29b-41d4-a716-446655440011",
        "template_code": "bonafide_letter",
        "template_version": 1,
        "renderer_version": "chromium-121",
        "input_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
        "content_hash": "3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
        "size_bytes": 84213,
        "render_ms": 1840,
        "retention_class": "record",
        "generated_at": "2026-09-27T09:14:21.000Z",
        "pinned_date": "2026-09-27"
      }
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :---: | :--- |
  | `success` | Boolean | No | Request success indicator (always `true` on 200). |
  | `message` | String | No | Response message (`"OK"`). |
  | `data.id` | UUIDv4 | No | Identifier of the `org_documents` record. |
  | `data.org_id` | UUIDv4 | No | Organization identifier. |
  | `data.document_type_id` | UUIDv4 | No | Identifier of mapped document type. |
  | `data.document_group_id` | UUIDv4 | No | Group identifier linking all versions. |
  | `data.version` | Integer | No | Version number of the letter. |
  | `data.supersedes_id` | UUIDv4 | Yes | Predecessor document identifier. |
  | `data.title` | String | No | Document title. |
  | `data.status` | String | No | Status (`published`, `superseded`, `retired`). |
  | `data.origin` | String | No | Origin discriminator (`'generated'`). |
  | `data.generation_artifact_id` | UUIDv4 | No | Foreign key linking to render artifact record. |
  | `data.reference_number` | String | No | Official assigned corporate reference number. |
  | `data.file_name` | String | No | File name of the PDF. |
  | `data.content_type` | String | No | MIME type (`application/pdf`). |
  | `data.size_bytes` | Integer | No | Byte length of the PDF. |
  | `data.checksum_sha256` | String | No | Cryptographic content hash of the PDF. |
  | `data.display_status` | String | No | Derived IST status (`active`, `expired`, etc.). |
  | `data.is_actionable` | Boolean | No | Indicates whether document can be acted upon. |
  | `data.generation.artifact_id` | UUIDv4 | No | Render artifact identifier. |
  | `data.generation.template_code` | String | No | Template catalog code used for rendering. |
  | `data.generation.template_version`| Integer| No | Template version used for rendering. |
  | `data.generation.renderer_version`| String | No | Version of the Chromium rendering engine. |
  | `data.generation.input_hash` | String | No | SHA-256 hash of canonicalized view-model inputs. |
  | `data.generation.content_hash` | String | No | SHA-256 hash of rendered binary PDF output. |
  | `data.generation.size_bytes` | Integer | No | Byte length of rendered PDF file. |
  | `data.generation.render_ms` | Integer | No | Rendering execution time in milliseconds. |
  | `data.generation.retention_class` | String | No | Artifact retention class (`'record'`). |
  | `data.generation.generated_at` | String (ISO) | No | Timestamp when artifact was rendered. |
  | `data.generation.pinned_date` | String | No | Pinned date string (`YYYY-MM-DD`). |
- **Exact Error Response Structures:**
  - **404 Not Found — Document Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
    _Trigger:_ ID does not exist, belongs to another organization, is soft-deleted, or represents an uploaded document (`origin = 'uploaded'`).

---

### 142. POST /api/v1/documents/hr/letters/:id/reissue

- **API Name / Purpose:** Reissue Published Organization Letter
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/:id/reissue`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Supersedes a published letter with clerical errors or outdated information by creating Version $N+1$ in the same document group. Assigns a brand-new sequential reference number, permanently transitions the predecessor to status `superseded` (`superseded_at = now()`), preserves original PDF bytes and reference numbers unchanged for legal audits, and records an auditable reason for reissue.
- **Why the API Exists:** Provides an atomic, version-controlled replacement flow designed specifically for system-generated letters, replacing the generic upload-based replace endpoint (#48).
- **Real-World Usage:** Invoked when HR needs to amend a published letter (e.g. employee changed mortgage lenders, designation updated, or relieving date renegotiated).
- **Path Parameters:**
  | Parameter | Location | Type | Required | Description |
  | :--- | :--- | :--- | :---: | :--- |
  | `:id` | Path | UUIDv4 | **Yes** | The UUID of the published predecessor `org_documents` record. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "field_overrides": {
      "purpose": "Opening a salary account with ICICI Bank"
    },
    "reason": "Corrected bank name requested by employee",
    "idempotency_key": "reissue-bonafide-emp402-v2"
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :--- |
  | `field_overrides` | Body | Object | Optional | No | `{}` | Key-value dictionary of narrative field overrides. Max 20 keys. Depth 1 only. Must NOT target derived fields. |
  | `reason` | Body | String | Optional | Yes | `null` | Reason for reissue (max 500 characters). Persisted to audit log `letter.reissued`. |
  | `idempotency_key` | Body | String | Optional | No | Auto-derived | Unique client idempotency key (8–120 characters, matching `^[A-Za-z0-9._:-]+$`). |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `hr` role and `documents.access` feature.
  2. Validates path parameter `:id` is a valid UUIDv4.
  3. Validates body shape via `reissueLetterSchema`.
  4. Looks up predecessor row via `findGeneratedById(orgId, id)`. Throws `404 DOCUMENT_NOT_FOUND` if absent or not generated.
  5. Asserts `predecessor.status === 'published'`. Throws `409 LETTER_NOT_REISSUABLE` if status is `draft`, `superseded`, or `retired`.
  6. Reads predecessor's artifact to extract `template_code`. Extracts `subject_user_id` from `predecessor.included_users[0]`.
  7. Re-resolves current template config, document type, settings, subject facts, and organization branding. Note: `effective_date` is deliberately absent; a reissue is dated **today** (`todayIso()`).
  8. Computes reissue idempotency key: namespaced with predecessor id (`letter:reissue:{orgId}:{predecessorId}:{hash}`) to guarantee isolation from the original issuance key.
  9. Probes `pdf_render_artifacts`. If a ready artifact is found, returns existing successor as HTTP `200 OK` (`reused: true`).
  10. Generates new UUID for successor `documentId`.
  11. Executes `renderAndRecord()`:
      a. Phase A: Inserts pending artifact record.
      b. Network Phase: Calls external Puppeteer renderer and uploads PDF buffer to AWS S3.
      c. Phase C (`onReady` Hook inside DB Transaction):
      - Acquires advisory lock on `document_group_id`.
      - Acquires pessimistic row lock (`FOR UPDATE`) on predecessor row and re-asserts `status === 'published'`. If a concurrent reissue already superseded it, halts with `409 LETTER_NOT_REISSUABLE`.
      - Re-asserts subject membership and active document type.
      - Allocates fresh sequential reference number from `document_letter_sequences`.
      - Updates predecessor row: `status = 'superseded'`, `superseded_at = now()`.
      - Inserts successor row in `org_documents`: `document_group_id = predecessor.document_group_id`, `version = predecessor.version + 1`, `supersedes_id = predecessor.id`, `reference_number = newReferenceNumber`.
      - Materializes recipient for successor document.
      - Writes audit logs: `letter.generated` on artifact, and `letter.reissued` on document (recording `previous_reference_number`, `supersedes_id`, and `reason`).
      - Marks artifact `ready`.
  12. Returns HTTP `201 Created` with new letter metadata, artifact metadata, and superseded predecessor linkage.
- **Database Impact:**
  - **Reads:** `org_documents` (predecessor read, then `FOR UPDATE`), `pdf_render_artifacts`, `document_letter_sequences` (with `FOR UPDATE`).
  - **Writes:**
    - `org_documents` (UPDATE predecessor status to `'superseded'`; INSERT successor row).
    - `pdf_render_artifacts` (INSERT pending, UPDATE ready).
    - `document_letter_sequences` (UPDATE incrementing counter).
    - `org_document_recipients` (INSERT recipient for successor).
    - `document_audit_logs` (INSERT audit rows).
  - **Locking:** Advisory lock on `document_group_id`, row lock on predecessor row, row lock on sequence counter.
- **PDF Generation Impact:** Pure view-model assembly via `buildIssueViewModel`, external Chromium headless rendering to A4 PDF, S3 byte upload. Predecessor artifact and PDF bytes remain completely untouched.
- **File / Storage Impact:** Uploads binary PDF stream to AWS S3 under key `org/{org_id}/pdf/letter/{new_artifact_id}.pdf`. Predecessor S3 object remains stored and untouched.
- **Transaction Behavior:** Dual-transaction boundary pattern (BR-24, §17.1). `onReady` hook executes inside an atomic transaction acquiring advisory locks, updating predecessor, allocating new sequence number, creating successor row, and writing audit logs.
- **Concurrency Behavior:** Concurrency serialization via transaction advisory lock on `document_group_id` and row lock `FOR UPDATE` on predecessor row. If two concurrent reissues race, the second acquiree detects that predecessor status is no longer `published` and halts safely with `409 LETTER_NOT_REISSUABLE`.
- **Idempotency / Retry Behavior:** Idempotency key is namespaced by predecessor ID. Replaying an identical reissue returns HTTP `200 OK` with `reused: true`.
- **Side Effects:** Predecessor document status transitions to `superseded`. Successor document is published to recipient employee.
- **Dependencies:** Headless Chromium rendering service, AWS S3, PostgreSQL.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. `authorize(['hr'])` and `requireFeature('documents.access')`. Predecessor letter must belong to caller's organization. Sensitive storage keys are stripped from response.
- **Success Response Structure (Fresh Reissue — HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Letter reissued",
    "data": {
      "letter": {
        "id": "f5e4d3c2-b1a0-4987-6543-210987654321",
        "document_group_id": "a1b2c3d4-e5f6-7a8b-9c0d-112233445566",
        "version": 2,
        "status": "published",
        "origin": "generated",
        "reference_number": "ACME/BON/2026-2027/0002",
        "document_type_id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Bonafide Letter — Asha Rao",
        "file_name": "bonafide-letter-asha-rao-2026-09-27.pdf",
        "size_bytes": 84213,
        "checksum_sha256": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
        "is_confidential": true,
        "requires_acknowledgement": false,
        "recipient_count": 1,
        "published_at": "2026-09-27T09:15:30.000Z",
        "template": {
          "code": "bonafide_letter",
          "version": 1
        }
      },
      "artifact": {
        "id": "880e8400-e29b-41d4-a716-446655440022",
        "size_bytes": 84213,
        "content_hash": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e"
      },
      "supersedes": {
        "id": "e4f3a120-7b3d-4c31-8f55-123456789abc",
        "version": 1,
        "reference_number": "ACME/BON/2026-2027/0001"
      },
      "reused": false
    }
  }
  ```
- **Success Response Structure (Idempotent Replay — HTTP 200 OK):**
  Same body structure as HTTP 201, with HTTP status `200`, message `"Letter already reissued"`, and `"reused": true`.
- **Response Field Documentation:**
  | Field | Type | Nullable | Description |
  | :--- | :--- | :---: | :--- |
  | `success` | Boolean | No | Request success indicator. |
  | `message` | String | No | Response message (`"Letter reissued"` or `"Letter already reissued"`). |
  | `data.letter` | Object | No | The newly created successor document object. |
  | `data.letter.id` | UUIDv4 | No | Identifier of the new `org_documents` record. |
  | `data.letter.version` | Integer | No | New version number (predecessor version + 1). |
  | `data.letter.reference_number` | String | No | Newly allocated corporate reference number. |
  | `data.artifact` | Object | No | Render artifact details for the successor document. |
  | `data.supersedes.id` | UUIDv4 | No | Identifier of the superseded predecessor document. |
  | `data.supersedes.version` | Integer | No | Version number of the superseded predecessor. |
  | `data.supersedes.reference_number`| String | No | Reference number of the superseded predecessor. |
  | `data.reused` | Boolean | No | `false` on initial reissue; `true` on idempotent replay. |
- **Exact Error Response Structures:**
  - **404 Not Found — Predecessor Not Found:**
    ```json
    {
      "success": false,
      "message": "Document not found",
      "errorCode": "DOCUMENT_NOT_FOUND"
    }
    ```
  - **409 Conflict — Predecessor Not Published:**
    ```json
    {
      "success": false,
      "message": "Only a published letter can be reissued",
      "errorCode": "LETTER_NOT_REISSUABLE"
    }
    ```
  - **409 Conflict — Group Already Published (Unique Constraint Collision):**
    ```json
    {
      "success": false,
      "message": "A published version already exists for this group",
      "errorCode": "ORG_DOCUMENT_ALREADY_PUBLISHED"
    }
    ```
  - **409 Conflict — Reference Number In Use:**
    ```json
    {
      "success": false,
      "message": "This reference number is already in use; please retry",
      "errorCode": "LETTER_REFERENCE_CONFLICT"
    }
    ```
- **Important Edge Cases:**
  - An attempt to reissue a draft, superseded, or retired letter fails immediately with `409 LETTER_NOT_REISSUABLE`.
  - If the predecessor's generation artifact or subject user record has been purged or deleted, reissue halts with `409 LETTER_NOT_REISSUABLE`.

---

## 5. Existing APIs Modified / Extended by Phase 2

### 5.1. POST /api/v1/documents/hr/org-documents/:id/file (API #45) — Origin Guard Added

- **Endpoint / Method:** `POST /api/v1/documents/hr/org-documents/:id/file`
- **Phase 2 Contract Change:** Introduces defensive origin guard check in `document_org.service.js`.
- **Behavioral Change:** If the targeted `org_documents` record has `origin === 'generated'`, the request terminates immediately prior to generating any S3 presigned PUT URL.
- **Error Response Returned:**
  ```json
  {
    "success": false,
    "message": "A generated document cannot be replaced by an upload; reissue it instead",
    "errorCode": "DOCUMENT_ORIGIN_GENERATED"
  }
  ```
- **HTTP Status:** `409 Conflict`

### 5.2. POST /api/v1/documents/hr/org-documents/:id/file/confirm (API #46) — Origin Guard Added

- **Endpoint / Method:** `POST /api/v1/documents/hr/org-documents/:id/file/confirm`
- **Phase 2 Contract Change:** Introduces defensive origin guard check in `document_org.service.js`.
- **Behavioral Change:** If the targeted `org_documents` record has `origin === 'generated'`, the request terminates immediately prior to executing S3 `HeadObject` or database transactions.
- **Error Response Returned:**
  ```json
  {
    "success": false,
    "message": "A generated document cannot be replaced by an upload; reissue it instead",
    "errorCode": "DOCUMENT_ORIGIN_GENERATED"
  }
  ```
- **HTTP Status:** `409 Conflict`

### 5.3. POST /api/v1/documents/hr/org-documents/:id/replace (API #48) — Origin Guard Added

- **Endpoint / Method:** `POST /api/v1/documents/hr/org-documents/:id/replace`
- **Phase 2 Contract Change:** Introduces defensive origin guard check in `document_org.service.js`.
- **Behavioral Change:** If the targeted `org_documents` record has `origin === 'generated'`, the request terminates immediately prior to acquiring advisory locks or minting draft replacement rows.
- **Error Response Returned:**
  ```json
  {
    "success": false,
    "message": "A generated document cannot be replaced by an upload; reissue it instead",
    "errorCode": "DOCUMENT_ORIGIN_GENERATED"
  }
  ```
- **HTTP Status:** `409 Conflict`

### 5.4. GET /api/v1/documents/hr/org-documents (API #52) — Additive Letter Metadata Fields

- **Endpoint / Method:** `GET /api/v1/documents/hr/org-documents`
- **Phase 2 Contract Change:** Extended base repository attribute projection `LIST_ATTRIBUTES` in `org_document.repository.js`.
- **Response Changes:** Every item in the returned `data.rows` array now includes the following additive fields:
  - `origin`: String (`'uploaded' | 'generated'`)
  - `generation_artifact_id`: UUIDv4 or `null`
  - `reference_number`: String (up to 64 chars) or `null`
- **Backward Compatibility:** Fully backward-compatible; existing uploaded documents default to `origin: 'uploaded'`, `generation_artifact_id: null`, and `reference_number: null`.

### 5.5. GET /api/v1/documents/hr/org-documents/:id (API #55) — Additive Letter Metadata Fields

- **Endpoint / Method:** `GET /api/v1/documents/hr/org-documents/:id`
- **Phase 2 Contract Change:** Extended repository attribute projection `DETAIL_ATTRIBUTES` in `org_document.repository.js`.
- **Response Changes:** The returned document detail object `data` now includes:
  - `origin`: String (`'uploaded' | 'generated'`)
  - `generation_artifact_id`: UUIDv4 or `null`
  - `reference_number`: String (up to 64 chars) or `null`
- **Backward Compatibility:** Fully backward-compatible.

### 5.6. GET /api/v1/documents/me/hr-documents (API #70) — Recipient Access for Issued Letters

- **Endpoint / Method:** `GET /api/v1/documents/me/hr-documents`
- **Phase 2 Contract Change:** Employee self-service document listing joins to `org_documents` records where the employee is the recipient (`origin = 'generated'`).
- **Response Changes:** Letters issued to the authenticated employee automatically appear in their personal document list, reflecting:
  - `title`: String
  - `status`: `'published'`
  - `published_at`: ISO timestamp
  - Personal acknowledgement & signature requirements (`plain.acknowledgement`, `doc.next_action`)
- **Security & Backward Compatibility:** Fully backward-compatible. Internal attributes (`storage_key`, `input_snapshot`, `generation_artifact_id`) remain strictly excluded.

### 5.7. GET /api/v1/documents/me/hr-documents/:id (API #71) — Recipient Detail for Issued Letters

- **Endpoint / Method:** `GET /api/v1/documents/me/hr-documents/:id`
- **Phase 2 Contract Change:** Employee document detail view for an issued letter.
- **Response Changes:** The returned document detail object reflects the issued letter's recipient view:
  - `title`: String
  - `status`: `'published'`
  - `published_at`: ISO timestamp
  - `next_action`: `'acknowledge'` | `'sign'` | `null`
- **Security & Backward Compatibility:** Fully backward-compatible. Non-recipient access returns uniform `404 DOCUMENT_NOT_FOUND`.

### 5.8. PUT /api/v1/documents/hr/settings (APIs #82–#86) — New Letter Generation & Numbering Settings

- **Endpoint / Method:** `PUT /api/v1/documents/hr/settings`
- **Phase 2 Contract Change:** Expanded request validation schema in `document_hr.validator.js` and database model `document_settings.model.js`.
- **New Supported Request Fields:**
  | Field | Type | Validation Rules / Allowed Values | Default | Purpose |
  | :--- | :--- | :--- | :---: | :--- |
  | `letter_branding_enabled` | Boolean | Optional boolean | `true` | Enables or disables letterhead headers and logo/signature compositing across all generated letters (#82). |
  | `letter_preview_rate_per_hour` | Integer | Min `1`, Max `1000` | `60` | Organization-level hourly rate cap for letter preview generation (#83). |
  | `letter_reference_pattern` | String | 1–120 characters, non-empty, must contain `{SEQ}` token. Validated by `assertPatternTokens()`. | `'{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}'` | Default corporate pattern for sequential letter numbering (#84). |
  | `letter_default_confidential` | Boolean | Optional boolean | `true` | Default confidentiality flag applied to newly issued letters (#85). |
  | `letter_requires_acknowledgement_default` | Boolean | Optional boolean or `null` | `null` | Default acknowledgement requirement for newly issued letters (#86). |
- **Success Response:** Returns HTTP `200 OK` with updated settings object reflecting the newly persisted columns.

---

# Phase 3: Payroll Documents, Caching & Render Queue (APIs #219–#220)

## 6. HR Administration APIs — Payslip Render Queue & Readiness Status

### 219. POST /api/v1/payroll/hr/jobs/payslip-render/run
- **API Name / Purpose:** Trigger On-Demand Payslip Render Queue Drain
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/payroll/hr/jobs/payslip-render/run`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `payroll.access`.
- **Purpose / Business Problem Solved:** Following bulk payroll approval or before executing a bulk ZIP download, HR administrators need an immediate way to warm up the payslip cache without waiting for the scheduled 15-minute background cron job.
- **Why the API Exists:** Provides an authorized trigger to immediately enqueue missing render jobs for a specific run (at elevated priority 50) and process a bounded batch of queued jobs for the caller's organization.
- **Real-World Usage:** Invoked by the HR frontend when clicking "Prepare Payslips" on a payroll run details page, or triggered programmatically following a `202 Accepted` response from API #174.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `run_id` | Body | String (UUIDv4) | Optional | Yes | `null` | When provided, explicitly enqueues all published, unrendered payslips for this run at priority 50 before draining the queue. |
- **Request JSON Example:**
  ```json
  {
    "run_id": "c1f8a840-7e12-4c22-b5e8-3a9d701e1234"
  }
  ```
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller and verifies `req.user.role === 'hr'` and entitlement `payroll.access`.
  2. Validates request body using `payslipRenderRunSchema` in `payroll_hr.validator.js` (`run_id` optional UUID, `allowUnknown: false`).
  3. Extracts `orgId` from token claims (`req.user.orgId`).
  4. Reads organization payroll settings via `payrollSettingsService.getOrCreate(orgId)`.
  5. If `settings.pdf_render_engine === 'pdfkit'`:
     - Bypasses queue processing completely.
     - Returns HTTP `200 OK` with all counters set to `0` and `engine: 'pdfkit'`. (Zero work on the default engine is a success, not an error).
  6. If `settings.pdf_render_engine === 'html'`:
     - If `run_id` is supplied, invokes `jobRepo.enqueueForRun(orgId, runId, { priority: 50, batchId: null })`. Executes an idempotent `INSERT INTO pdf_render_jobs ... SELECT ... ON CONFLICT DO NOTHING`.
     - Invokes `pdfRenderWorker.drain()` with bounded batch size (default 50) and bounded concurrency (default 4).
     - For each claimed job: fetches `payslips.snapshot`, renders via Chromium renderer, stores PDF in S3 (`org/{org_id}/pdf/payslip/{artifact_id}.pdf`), and transitions artifact to `ready`.
  7. Opens a database transaction, records an audit log entry in `payroll_audit_logs` (`action = 'payslip_render.drained'`, `entity_type = 'payroll_run'`, `entity_id = run_id`), and commits.
  8. Returns HTTP `200 OK` with processing tallies.
- **Database Impact:**
  - **Reads:** `payroll_settings`, `pdf_render_jobs`, `payslips`.
  - **Writes:** `pdf_render_jobs` (`INSERT` on enqueue, `UPDATE status='claimed'`, `UPDATE status='done'`), `pdf_render_artifacts` (`INSERT status='pending'`, `UPDATE status='ready'`), `payroll_audit_logs`.
- **PDF Generation Impact:** Triggers external Chromium Puppeteer renders for claimed jobs outside of any database transaction.
- **File / Storage Impact:** Persists generated PDF binaries to AWS S3 under `org/{org_id}/pdf/payslip/{artifact_id}.pdf`.
- **Transaction Behavior:** The claim phase commits immediately in Transaction 1. Renders and S3 writes execute with **no open database transaction**. Job completion commits in Transaction 2. Audit logging commits in Transaction 3.
- **Concurrency Behavior:** Protected by partial unique index `pdf_render_jobs_live_source_uq` (`(org_id, source_type, source_id) WHERE status IN ('queued', 'claimed')`) and `SELECT ... FOR UPDATE SKIP LOCKED` during worker batch claims. Multiple concurrent HR triggers or races with the worker cron safely divide work without duplicate renders.
- **Idempotency / Retry Behavior:** Fully idempotent. Repeat invocations safely return remaining work or zero counts.
- **Side Effects:** Warms the S3 cache and artifact database table for published payslips.
- **Dependencies:** PostgreSQL `pdf_render_jobs` and `pdf_render_artifacts` tables, AWS S3 provider, external Chromium Puppeteer rendering service.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. Platform administrators are blocked from accessing tenant queues. Raw storage keys and artifact IDs are omitted from the response.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Payslip render queue processed",
    "data": {
      "engine": "html",
      "enqueued": 24,
      "claimed": 24,
      "done": 24,
      "failed": 0,
      "remaining": 0
    }
  }
  ```
- **Response Field Meanings:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `engine` | String | Active organization render engine (`'html'` or `'pdfkit'`). |
  | `enqueued` | Integer | Number of new render jobs newly inserted for the specified `run_id`. |
  | `claimed` | Integer | Number of jobs locked by this worker invocation via `SKIP LOCKED`. |
  | `done` | Integer | Number of jobs successfully rendered and committed to S3. |
  | `failed` | Integer | Number of jobs that failed during this drain invocation. |
  | `remaining` | Integer | Remaining queued/claimed jobs in the organization's queue. |
- **Error Responses & Failure Modes:**
  | HTTP Status | Error Code | Trigger Condition | Client Resolution |
  | :---: | :--- | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | `run_id` is not a valid UUIDv4 or unexpected fields are present. | Correct payload to supply valid UUID syntax or omit `run_id`. |
  | `401` | `UNAUTHORIZED` | Missing, malformed, or expired JWT bearer token. | Refresh credentials and provide active authentication header. |
  | `403` | `INSUFFICIENT_PERMISSIONS` | Caller does not possess the `hr` role. | Must authenticate with tenant HR administrative credentials. |
  | `403` | `FEATURE_DISABLED` | Organization lacks the `payroll.access` entitlement. | Enable Payroll feature module for tenant. |
- **Important Edge Cases:**
  - An organization operating on the default `pdfkit` engine receives HTTP `200 OK` with zero counts across all tallies; no error is raised because zero queue work on classic engine is expected.
  - If a specific payslip job fails repeatedly (deterministic error such as invalid data), worker burns attempts at claim time and marks job `failed` after 3 attempts without blocking other jobs.

---

### 220. GET /api/v1/payroll/hr/runs/:runId/payslips/render-status
- **API Name / Purpose:** Get Payroll Run Payslip Render & Cache Status
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/payroll/hr/runs/:runId/payslips/render-status`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `payroll.access`.
- **Purpose / Business Problem Solved:** Clients polling after receiving a `202 Accepted` from API #174 require a lightweight, authoritative progress indicator to determine when all payslips in a run are cached and ready for instant ZIP streaming.
- **Why the API Exists:** Provides aggregate status counts across a run's payslip cohort without invoking the PDF renderer, fetching S3 bytes, or loading full payslip JSON payloads.
- **Real-World Usage:** Polled by the administrative web frontend at 2–3 second intervals following an async bulk ZIP request until `will_stream === true`.
- **Path Parameters:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `:runId` | String (UUIDv4) | The primary key identifier of the payroll run. |
- **Query Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `batch_id` | Query | String (UUIDv4) | Optional | Yes | `null` | When provided, scopes batch progress metrics to a specific async bulk generation batch. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller as `hr` with `payroll.access`.
  2. Validates `:runId` path parameter and `batch_id` query parameter inside the controller (Express 5 safe).
  3. Extracts `orgId` from JWT claims (`req.user.orgId`).
  4. Resolves payroll run via `payslipReadService.hrPayslipsForDownload(orgId, runId)`. If run is missing or belongs to another tenant, halts immediately with uniform HTTP `404 Not Found` (`RUN_NOT_FOUND`).
  5. Reads organization payroll settings via `payrollSettingsService.getOrCreate(orgId)`.
  6. Executes aggregate database reads via `payrollPdfService.renderStatus`:
     - Queries `pdf_render_artifacts` for count of `ready` artifacts matching the run's payslip IDs (`findReadyBySourceIds`).
     - Queries `pdf_render_jobs` for live job tallies (`queued`, `claimed`, `failed`) matching the run's payslips.
     - If `batch_id` is supplied, queries `pdf_render_jobs` for batch-specific tallies (`countByBatch`).
  7. Calculates `will_stream`:
     $$\text{will\_stream} = (\text{ready} + \text{uncacheable} === \text{total})$$
  8. Returns HTTP `200 OK` with status envelope.
- **Database Impact:** Read-only queries against `payroll_runs`, `payslips`, `pdf_render_artifacts`, and `pdf_render_jobs`. No database modifications or locks.
- **PDF Generation Impact:** None. Zero renderer invocations.
- **File / Storage Impact:** None. Zero S3 network calls.
- **Transaction Behavior:** None. Read-only operation without transaction.
- **Concurrency Behavior:** Pure read queries execute without table or row locking.
- **Idempotency / Retry Behavior:** Fully idempotent read operation. Safe to poll continuously.
- **Side Effects:** None.
- **Dependencies:** PostgreSQL `payroll_runs`, `payslips`, `pdf_render_artifacts`, and `pdf_render_jobs` tables.
- **Security & Authorization (Inside Entry):** Scoped strictly to `req.user.orgId`. Foreign or non-existent `runId` values return uniform `404 RUN_NOT_FOUND` to prevent cross-tenant enumeration.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Payslip render status fetched",
    "data": {
      "run_id": "c1f8a840-7e12-4c22-b5e8-3a9d701e1234",
      "engine": "html",
      "total": 150,
      "ready": 145,
      "pending": {
        "queued": 5,
        "claimed": 0
      },
      "failed": 0,
      "uncacheable": 0,
      "will_stream": false,
      "batch": {
        "id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
        "queued": 5,
        "claimed": 0,
        "done": 45,
        "failed": 0,
        "cancelled": 0
      }
    }
  }
  ```
- **Response Field Meanings:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `run_id` | String (UUID) | Identifier of the verified payroll run. |
  | `engine` | String | Organization's active PDF render engine (`'html'` or `'pdfkit'`). |
  | `total` | Integer | Total active employee payslips in the payroll run. |
  | `ready` | Integer | Number of payslips with a verified `ready` artifact in S3 cache. |
  | `pending.queued` | Integer | Number of payslips currently queued for background rendering. |
  | `pending.claimed` | Integer | Number of payslips currently being rendered by active workers. |
  | `failed` | Integer | Number of render jobs that failed permanently (exhausted retries). |
  | `uncacheable` | Integer | Number of held or ephemeral payslips that will render inline on-demand. |
  | `will_stream` | Boolean | True when `ready + uncacheable === total`. Indicates that API #174 will immediately stream a full ZIP without queuing. |
  | `batch` | Object / Null | Progress breakdown for the requested `batch_id`, or `null` if omitted. |
- **Error Responses & Failure Modes:**
  | HTTP Status | Error Code | Trigger Condition | Client Resolution |
  | :---: | :--- | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Malformed UUID syntax in `:runId` or `batch_id`. | Provide valid UUID string format. |
  | `401` | `UNAUTHORIZED` | Missing or expired JWT authentication token. | Provide active bearer token. |
  | `403` | `INSUFFICIENT_PERMISSIONS` | Caller is not an HR administrator. | Authenticate with HR role. |
  | `404` | `RUN_NOT_FOUND` | Payroll run does not exist or belongs to another tenant. | Verify run identifier within caller's organization. |
- **Important Edge Cases:**
  - When `batch_id` is supplied, `batch` provides granular progress (`queued`, `claimed`, `done`, `failed`, `cancelled`) specific to that enqueue event.
  - If all payslips in a run are held, `uncacheable === total` and `will_stream === true` immediately because held payslips stream via PDFKit without caching.

---

## 7. Existing APIs Modified / Extended by Phase 3

### 7.1. GET /api/v1/payroll/hr/runs/:id/payslips/download (API #174) — Asynchronous 202 Bulk ZIP Protocol & Cache Streaming
- **Endpoint / Method:** `GET /api/v1/payroll/hr/runs/:id/payslips/download`
- **Phase 3 Contract Change:** Introduces asynchronous thresholding protocol behind `pdf_render_engine = 'html'`.
- **Detailed Behavioral & Protocol Changes:**
  - **Legacy Engine (`pdf_render_engine = 'pdfkit'`):** Behavior is 100% preserved. Generates and streams PDFKit ZIP archive synchronously.
  - **HTML Engine (`pdf_render_engine = 'html'`):** Evaluates inline render cost: $\text{inlineCost} = \text{misses.length} + \text{repairs.length}$.
    - **Over Threshold:** If $\text{inlineCost} > \text{pdf_bulk_inline_miss_threshold}$ (setting #89, default 50):
      - Enqueues all missing and repair jobs at priority 50 linked to a new UUID `batch_id`.
      - **Opens no export audit row** (D-48).
      - Returns HTTP `202 Accepted` with payload containing `poll_url` (API #220).
    - **Under Threshold or Warm:** Starts export ledger row, streams chunked ZIP archive directly from S3 cache bytes entry-by-entry with $O(1)$ memory consumption, and closes export audit row.
- **Async Enqueued Response (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "message": "Bulk payslip generation enqueued",
    "data": {
      "run_id": "c1f8a840-7e12-4c22-b5e8-3a9d701e1234",
      "batch_id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
      "total": 250,
      "ready": 30,
      "queued": 220,
      "poll_url": "/api/v1/payroll/hr/runs/c1f8a840-7e12-4c22-b5e8-3a9d701e1234/payslips/render-status"
    }
  }
  ```
- **Streaming Response (HTTP 200 OK):**
  - **Headers:** `Content-Type: application/zip`, `Content-Disposition: attachment; filename="payslips_run-<runIdPrefix>.zip"`.
  - **Body:** Binary ZIP stream.
- **Security & Backward Compatibility:** Fully backward-compatible for all tenants until explicitly opting into `pdf_render_engine = 'html'`.

### 7.2. GET /api/v1/payroll/hr/employees/:userId/payslips/:runId/pdf (API #170) — Single Payslip PDF (HTML Cache / PDFKit Fallback)
- **Endpoint / Method:** `GET /api/v1/payroll/hr/employees/:userId/payslips/:runId/pdf`
- **Phase 3 Contract Change:** Routes through `payroll_pdf.service.js` single engine branch facade.
- **Engine Resolution & Caching Mechanics:**
  - Classic `pdfkit` engine: Renders via PDFKit to buffer; un-persisted.
  - HTML engine:
    - Held payslip (`published_at IS NULL`): Falls back unconditionally to PDFKit (DV-3); un-persisted.
    - Released payslip (`visible_to_employee = true`): Checks S3 artifact cache. Cache hit loads binary directly from S3. Cache miss invokes Chromium renderer, uploads to S3 (`retention_class = 'cache'`), records `ready` artifact, and returns binary.
    - EC-19 Object Loss: If S3 object is missing on cache hit, logs warning, enqueues single-flight background repair, and serves inline non-persisted HTML render.
- **Response Format:** Binary `application/pdf` stream (`Content-Disposition: attachment; filename="payslip_<periodMonth>.pdf"`).
- **Security & Backward Compatibility:** HR can review held and released payslips. Audit ledger entry logged before first byte.

### 7.3. GET /api/v1/payroll/manager/employees/:userId/payslips/:runId/pdf (API #186) — Manager Report Payslip PDF (HTML Cache / PDFKit Fallback)
- **Endpoint / Method:** `GET /api/v1/payroll/manager/employees/:userId/payslips/:runId/pdf`
- **Phase 3 Contract Change:** Routes through `payroll_pdf.service.js` single engine branch facade.
- **Hierarchy Scoping & Masking:** Scope-checked before existence (`403 EMPLOYEE_NOT_IN_TEAM` on cross-team ID). Blocked with `403 COMPENSATION_VIEW_DISABLED` if compensation visibility is disabled.
- **Response Format:** Binary `application/pdf` stream.

### 7.4. GET /api/v1/payroll/me/payslips/:runId/pdf (API #191) — Employee Self-Service Payslip PDF (HTML Cache / PDFKit Fallback)
- **Endpoint / Method:** `GET /api/v1/payroll/me/payslips/:runId/pdf`
- **Phase 3 Contract Change:** Routes through `payroll_pdf.service.js` single engine branch facade.
- **Self-Scoped Resolution & Published-Only Gate:** Scoped strictly to `req.user.id`. Held or unapproved payslips return uniform `403 PAYSLIP_NOT_ACCESSIBLE`. Released payslips served instantly from S3 cache.
- **Response Format:** Binary `application/pdf` stream.

### 7.5. GET /api/v1/payroll/hr/employees/:userId/annual-statement/pdf (API #184) — HR Annual Salary Statement PDF (HTML Engine)
- **Endpoint / Method:** `GET /api/v1/payroll/hr/employees/:userId/annual-statement/pdf`
- **Phase 3 Contract Change:** Renders via HTML template `annual_statement/v1.html` under `pdf_render_engine = 'html'`.
- **Portrait 12-Month Table & Zero Persistence:** Generates portrait A4 12-month zero-filled table. Computed dynamically and pinned to request timestamp (`pinnedDate: new Date()`). Never cached (`persist: false`, `sourceId: null`).
- **Response Format:** Binary `application/pdf` stream (`Content-Disposition: attachment; filename="annual_statement_<financialYear>.pdf"`).

### 7.6. GET /api/v1/payroll/me/annual-statement/pdf (API #193) — Self Annual Salary Statement PDF (HTML Engine)
- **Endpoint / Method:** `GET /api/v1/payroll/me/annual-statement/pdf`
- **Phase 3 Contract Change:** Self-service counterpart of API #184 rendered via HTML pipeline.
- **Response Format:** Binary `application/pdf` stream.

### 7.7. GET /api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/pdf (API #185) — HR Form 16 Part B PDF (HTML Engine)
- **Endpoint / Method:** `GET /api/v1/payroll/hr/employees/:userId/tax/form16/:financialYear/pdf`
- **Phase 3 Contract Change:** Renders Form 16 Part B via HTML template `form16_part_b/v1.html`.
- **Provisional vs Finalized Form 16:** HR may render provisional statements (`is_provisional: true`). Provisional statements are never cached. Finalized summaries are eligible for S3 caching linked to `employee_tax_summaries.id`.
- **Response Format:** Binary `application/pdf` stream (`Content-Disposition: attachment; filename="form16_partb_<financialYear>.pdf"`).

### 7.8. GET /api/v1/payroll/me/tax/form16/:financialYear/pdf (API #194) — Self Form 16 Part B PDF (HTML Engine)
- **Endpoint / Method:** `GET /api/v1/payroll/me/tax/form16/:financialYear/pdf`
- **Phase 3 Contract Change:** Self-service Form 16 Part B rendered via HTML pipeline.
- **Self-Scoped Finalized Form 16 Only:** Employees receive uniform `404` until the financial year tax summary is finalized by HR.
- **Response Format:** Binary `application/pdf` stream.

### 7.9. GET & PUT /api/v1/payroll/hr/settings (APIs #22, #23) — New Engine & Cache Retention Settings (Settings #87–#90)
- **Endpoints:** `GET /api/v1/payroll/hr/settings` and `PUT /api/v1/payroll/hr/settings`
- **Phase 3 Contract Change:** Exposes and validates four new organizational settings knobs in `payroll_hr.validator.js`:
  | Setting Key | Registry # | Data Type | Validation Rules / Allowed Values | Default | Business Purpose |
  | :--- | :---: | :--- | :--- | :---: | :--- |
  | `pdf_render_engine` | **#87** | String | `'pdfkit'`, `'html'` | `'pdfkit'` | Switches organization between classic PDFKit and HTML Chromium engine. |
  | `payslip_prerender_on_publish` | **#88** | Boolean | `true`, `false` | `true` | Automatically enqueues background render jobs when a payroll run is released. |
  | `pdf_bulk_inline_miss_threshold` | **#89** | Integer | Min `1`, Max `500` | `50` | Maximum uncached payslips rendered synchronously before #174 returns HTTP 202. |
  | `pdf_cache_retention_days` | **#90** | Integer | Min `30`, Max `3650` | `365` | Retention window for cache-class S3 objects before purge by nightly cron. |
- **Renderer Configuration Pre-Flight Guard:** When updating settings via `PUT /api/v1/payroll/hr/settings`, if `pdf_render_engine` transitions to `'html'`, `payroll_settings.service.js` asserts `pdfRendererConfig.isConfigured()`. If `PDF_RENDERER_BASE_URL` is empty, halts with HTTP `409 Conflict` (`PDF_RENDERER_NOT_CONFIGURED`). Rolling back to `'pdfkit'` is always permitted without restriction.
- **Success Response:** HTTP `200 OK` with updated settings object.

---

# Phase 4: Bulk Issuance, Manager Proposals & Queue Drain (APIs #143–#150)

## 8. HR Administration APIs — Bulk Letter Issuance & Progress

### 143. POST /api/v1/documents/hr/letters/bulk

- **API Name / Purpose:** Create Bulk-Letter Batch (Asynchronous Queueing)
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/bulk`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR administrators frequently need to issue an identical letter template (such as an updated corporate policy acknowledgement, annual bonus declaration, or uniform organizational notice) to a cohort of dozens or hundreds of employees simultaneously. Executing synchronous Chromium renders in a sequential HTTP loop would result in HTTP gateway timeouts (504), unbounded memory spikes, and partial batch failures without transactional rollback. This API accepts a cohort of up to 2000 subject UUIDs (subject to organization-level caps), performs pre-flight cohort validation, freezes the template version, effective date, and branding configuration once for the entire batch, writes durable ledger rows, enqueues background render jobs, and returns immediately with a tracking identifier (`batch_id`).
- **Why the API Exists:** Provides an asynchronous batch ingestion gateway backed by an immutable ledger (`document_letter_batches` and `document_letter_batch_items`), decoupling large cohort ingestion from execution time while preserving complete idempotency and failure visibility.
- **Real-World Usage:** Invoked by HR administrators in the administrative portal from the "Issue to Many" or "Bulk Letter Issuance" workflow. Upon receiving the `202 Accepted` response, the web interface initiates polling on API #144 to display a real-time progress bar with live counts of pending, issued, failed, and skipped items.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "template_code": "bonafide_letter",
    "subject_user_ids": [
      "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "a8c2f170-4e2b-4d33-9118-8f85f3cfb001",
      "c3f1b402-1200-4b99-a401-2094c39f0012"
    ],
    "field_overrides": {
      "purpose": "Corporate visa renewal and residency verification"
    },
    "effective_date": "2026-09-29",
    "idempotency_key": "bulk-bonafide-batch-20260929-v1"
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `template_code` | Body | String | **Yes** | No | — | Unique identifier of the letter template in the registry (e.g. `bonafide_letter`, `experience_letter`). Max 64 characters. |
  | `subject_user_ids` | Body | Array<UUIDv4> | **Yes** | No | — | Array of 1 to 2000 UUIDs representing recipient employees. Distinctness is verified by the service layer (returns 422 `LETTER_BULK_DUPLICATE_SUBJECT` if duplicates exist). Length must not exceed tenant ceiling `letter_bulk_max_subjects` (Setting #91, default 200). |
  | `field_overrides` | Body | Object | Optional | No | `{}` | Depth-1 key-value map of template-specific field overrides applied uniformly across the entire batch. Max 20 keys. Values must be string (max 500 chars), number, or boolean. Keys must be declared in template schema and must NOT target derived or service fields. |
  | `effective_date` | Body | String | Optional | No | UTC today | ISO date string (`YYYY-MM-DD`). Must fall within ±365 days of the current date. Frozen as `pinned_date` on the batch record. |
  | `idempotency_key` | Body | String | Optional | No | Auto-derived | Client-provided idempotency key (8–120 characters, matching `^[A-Za-z0-9._:-]+$`). If omitted, an SHA-256 key is derived from the canonical JSON representation of `(org_id, template_code, template_version, sorted_subject_ids, sorted_overrides, effective_date, pinned_date)`. |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` and `actorId` from verified token claims (`req.user.orgId`, `req.user.id`).
  3. Validates request body shape against `bulkIssueLettersSchema` using `validateOrThrow`.
  4. Enforces strict subject distinctness: compares `subject_user_ids.length` against `new Set(subject_user_ids).size`. If duplicates exist, rejects immediately with HTTP `422 Unprocessable Entity` (`LETTER_BULK_DUPLICATE_SUBJECT`).
  5. Resolves organization issuance context via `letterService._resolveOrgIssuanceContext(orgId, template_code)`:
     a. Checks template catalog registry: throws `404 LETTER_TEMPLATE_UNKNOWN` if absent.
     b. Reads `document_letter_configs`: throws `409 LETTER_TEMPLATE_DISABLED` if missing or `is_enabled !== true`.
     c. Reads `document_types` for mapped code: throws `409 DOCUMENT_TYPE_NOT_ACTIVATED` if absent, `409 DOCUMENT_TYPE_INACTIVE` if inactive, or `422 DOCUMENT_TYPE_PLANE_MISMATCH` if `plane !== 'org'`.
     d. Resolves active letterhead branding and settings.
  6. Evaluates cohort size against tenant setting `letter_bulk_max_subjects` (Setting #91, default 200). If `subject_user_ids.length > max`, rejects with HTTP `422 Unprocessable Entity` (`LETTER_BULK_TOO_MANY_SUBJECTS`) detailing `{ max, received }`.
  7. Resolves or generates the batch idempotency key and pins the effective date (`pinned_date`).
  8. Probes `document_letter_batches` for an existing batch by `(org_id, idempotency_key)`:
     - **Idempotent Re-Submission Path (BR-B9, EC-38):** If an existing batch is found:
       a. Opens an atomic transaction.
       b. Queries `document_letter_batch_items` for items currently in `status = 'pending'`.
       c. Invokes `jobRepo.enqueueMany` using `ON CONFLICT DO NOTHING` against the partial live index, safely re-enqueuing stragglers without creating duplicate jobs.
       d. Commits transaction and retrieves updated status counts via `itemRepo.countByBatch`.
       e. Returns HTTP `200 OK` with `reused: true` and current ledger counts. Does NOT re-validate subjects.
  9. **Fresh Ingestion Path (EC-37):** Validates the entire cohort read-only via `_validateSubjects()`:
     - Iterates each subject UUID and executes `letterService._resolveSubjectIssuanceContext()` in read-only mode.
     - Resolves employee facts, checks required non-empty fields, and ensures the subject belongs to `orgId`.
     - Captures any `AppError` per subject into a structured failure list.
     - If any subject fails (missing facts, unknown employee, incomplete data), halts ingestion immediately and returns HTTP `422 Unprocessable Entity` (`LETTER_BULK_VALIDATION_FAILED`) with the full `failures` array. Zero database rows are inserted, and zero jobs are queued.
  10. Opens an atomic database transaction:
      a. Inserts batch record into `document_letter_batches` with `status = 'queued'`, `total_count = subjectIds.length`, `branding_snapshot = freezeBranding(orgCtx.branding)` (strips volatile presigned asset URLs), `pinned_date`, and `template_version`.
      b. Pre-generates a unique UUID `document_id` for every subject and bulk inserts per-subject rows into `document_letter_batch_items` with `status = 'pending'`.
      c. Queries newly inserted pending items from the database and bulk enqueues corresponding render jobs into `pdf_render_jobs` via `jobRepo.enqueueMany()` (`source_type = 'letter'`, `source_id = document_id`, `batch_id = batchId`, `priority = 100`, `max_attempts = 5`, `engine = 'html'`).
      d. Records audit log entry in `document_audit_logs` (`entityType = 'document_letter_batch'`, `action = 'letter_batch.created'`).
      e. Commits the transaction.
  11. Queries item counts for the batch and returns HTTP `202 Accepted` (`reused: false`) with `batch_id`, `total`, and live counts.
- **Database Impact:**
  - **Reads:** `document_letter_batches` (idempotency probe), `document_letter_configs`, `document_types`, `document_settings`, `document_letter_branding`, `employee_profiles` / `user_profiles` (read-only cohort pre-flight validation).
  - **Writes (in single atomic transaction):**
    - `document_letter_batches` (INSERT single batch header).
    - `document_letter_batch_items` (INSERT `N` ledger items with pre-allocated `document_id`).
    - `pdf_render_jobs` (INSERT `N` render jobs with `priority = 100`).
    - `document_audit_logs` (INSERT single `letter_batch.created` audit record).
  - **Locking:** Standard row insertion locks within transaction. No long-lived table or row locks.
- **PDF Generation Impact:** Zero synchronous rendering. Defers all Chromium PDF rendering to asynchronous background workers (or manual trigger API #147).
- **File / Storage Impact:** None on this ingestion endpoint. Frozen branding snapshot stores text metadata with presigned asset URLs stripped (`freezeBranding()`), preventing stale S3 presigned URLs from persisting in PostgreSQL.
- **Transaction Behavior:** Entire fresh batch creation (batch header, ledger items, render jobs, and audit log) executes inside a single atomic PostgreSQL transaction. If any step fails, transaction rolls back cleanly leaving zero database remnants.
- **Concurrency Behavior:** Protected by unique constraint `document_letter_batches_idem_uq` on `(org_id, idempotency_key)`. Concurrent submissions with identical idempotency keys are serialized: one commits the fresh batch, while concurrent requests detect the committed batch and execute the safe re-enqueue path.
- **Idempotency / Retry Behavior:**
  - Client may supply an `idempotency_key`. If omitted, an SHA-256 key is automatically derived from the request parameters and sorted subject list.
  - Re-submitting an identical request returns HTTP `200 OK` with `reused: true`. It does not create a new batch; instead, it re-enqueues only those items that remain in `pending` status, providing resilient retry mechanics for interrupted runs.
- **Side Effects:** Enqueues background render jobs into the system job queue (`pdf_render_jobs`).
- **Dependencies:** PostgreSQL database, Document Type catalog, Template Registry, PDF Render Worker subsystem.
- **Security & Authorization (Inside Entry):**
  - Authenticated via Bearer JWT. Enforces `req.user.role === 'hr'` and `documents.access`.
  - Organization isolation is absolute: `orgId` is extracted solely from JWT claims. No path or body parameters can override tenant boundaries.
  - Cohort validation verifies that all subject UUIDs belong to `orgId`. A subject belonging to another tenant or non-existent triggers uniform `404 DOCUMENT_NOT_FOUND` in the cohort failure report.
  - Sensitive internal storage keys and presigned URLs are stripped from the batch before persistence.
- **Success Response Structure:**
  - **Fresh Submission (HTTP 202 Accepted):**
    ```json
    {
      "success": true,
      "message": "Bulk issuance queued",
      "data": {
        "batch_id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
        "total": 3,
        "reused": false,
        "counts": {
          "pending": 3,
          "issued": 0,
          "failed": 0,
          "skipped": 0
        }
      }
    }
    ```
  - **Idempotent Re-Submission (HTTP 200 OK):**
    ```json
    {
      "success": true,
      "message": "Bulk issuance already queued",
      "data": {
        "batch_id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
        "total": 3,
        "reused": true,
        "counts": {
          "pending": 1,
          "issued": 2,
          "failed": 0,
          "skipped": 0
        }
      }
    }
    ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | `'Bulk issuance queued'` for fresh batches, or `'Bulk issuance already queued'` for idempotent re-submissions. |
  | `data.batch_id` | UUIDv4 | Unique identifier of the created or existing bulk batch row in `document_letter_batches`. |
  | `data.total` | Integer | Total number of subjects included in this batch. |
  | `data.reused` | Boolean | `false` when a new batch was created; `true` when re-using an existing batch under an identical idempotency key. |
  | `data.counts.pending` | Integer | Number of items currently awaiting render and publication. |
  | `data.counts.issued` | Integer | Number of items successfully rendered, published, and materialized. |
  | `data.counts.failed` | Integer | Number of items that encountered deterministic render defects or unrecoverable errors. |
  | `data.counts.skipped` | Integer | Number of items skipped due to subject deactivation, departure, or inactivated document types. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | Schema validation error (e.g. invalid UUID format, invalid date format, invalid characters in idempotency key). | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or expired Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr` (e.g., employee, manager, platform admin). | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
  | **404** | `LETTER_TEMPLATE_UNKNOWN` | `template_code` is not registered in the system template catalog. | `{"success": false, "message": "Letter template not found", "errorCode": "LETTER_TEMPLATE_UNKNOWN"}` |
  | **409** | `LETTER_TEMPLATE_DISABLED` | Template is disabled in `document_letter_configs` for this organization. | `{"success": false, "message": "This letter template is disabled for your organization", "errorCode": "LETTER_TEMPLATE_DISABLED"}` |
  | **409** | `DOCUMENT_TYPE_NOT_ACTIVATED`| Document type mapped to template is not activated in the tenant's catalog. | `{"success": false, "message": "The document type for this letter is not activated", "errorCode": "DOCUMENT_TYPE_NOT_ACTIVATED"}` |
  | **409** | `DOCUMENT_TYPE_INACTIVE` | Document type mapped to template is deactivated in the tenant's catalog. | `{"success": false, "message": "The document type for this letter is inactive", "errorCode": "DOCUMENT_TYPE_INACTIVE"}` |
  | **422** | `LETTER_BULK_DUPLICATE_SUBJECT` | `subject_user_ids` contains one or more duplicate UUIDs. | `{"success": false, "message": "subject_user_ids must be distinct", "errorCode": "LETTER_BULK_DUPLICATE_SUBJECT"}` |
  | **422** | `LETTER_BULK_TOO_MANY_SUBJECTS` | Cohort length exceeds tenant setting `letter_bulk_max_subjects` (Setting #91). | `{"success": false, "message": "A bulk batch may contain at most <max> subjects", "errorCode": "LETTER_BULK_TOO_MANY_SUBJECTS", "details": {"max": 200, "received": 250}}` |
  | **422** | `DOCUMENT_TYPE_PLANE_MISMATCH` | Mapped document type is configured with `plane !== 'org'`. | `{"success": false, "message": "The mapped document type is not an organization-plane type", "errorCode": "DOCUMENT_TYPE_PLANE_MISMATCH"}` |
  | **422** | `LETTER_FIELD_UNKNOWN` | An override key in `field_overrides` is not defined in template schema. | `{"success": false, "message": "Unknown field \"<field>\" for this template", "errorCode": "LETTER_FIELD_UNKNOWN", "details": {"field": "<field>"}}` |
  | **422** | `LETTER_FIELD_NOT_OVERRIDABLE` | An override key targets a derived or service field. | `{"success": false, "message": "Field \"<field>\" is derived and cannot be overridden", "errorCode": "LETTER_FIELD_NOT_OVERRIDABLE", "details": {"field": "<field>"}}` |
  | **422** | `LETTER_BULK_VALIDATION_FAILED` | One or more subjects failed pre-flight read-only fact validation. | `{"success": false, "message": "One or more subjects failed validation", "errorCode": "LETTER_BULK_VALIDATION_FAILED", "details": {"failures": [{"subject_user_id": "<uuid>", "error_code": "LETTER_FACTS_MISSING", "message": "...", "fields": [...]}]}}` |
- **Edge Cases & Boundary Handling:**
  - **All-or-Nothing Cohort Validation:** If 199 subjects have valid profiles and facts but 1 subject has missing mandatory compensation data, the entire batch is rejected with `422 LETTER_BULK_VALIDATION_FAILED`. No batch row is created, preventing partial or dirty cohort issuance.
  - **Re-submission Subject State Immunity (EC-38):** If a batch is re-submitted with an identical idempotency key after some items have already been processed, the service probes the batch before subject validation, re-enqueueing only items currently in `pending` status without re-validating subjects. A subject whose employment status changed since batch creation cannot fail the re-enqueue.
  - **Absurd Date Prevention:** `effective_date` is strictly bounded to ±365 days of the current date, preventing accidental issuance of letters dated decades in the past or future.

---

### 144. GET /api/v1/documents/hr/letters/bulk/:batchId

- **API Name / Purpose:** Get Bulk-Letter Batch Progress & Failure Ledger
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/bulk/:batchId`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Following bulk letter ingestion (API #143), the client interface requires real-time observability into execution status, completion percentage, aggregate counts, diagnostic queue health, and paginated details of any subjects that failed or were skipped during processing.
- **Why the API Exists:** Provides an authoritative status endpoint reflecting the true state of the durable item ledger (`document_letter_batch_items`) alongside diagnostic metrics from the render job queue (`pdf_render_jobs`), allowing administrators to inspect and remediate failures.
- **Real-World Usage:** Polled periodically (e.g. every 2–3 seconds) by the HR frontend while a bulk issuance batch is processing, and displayed as a terminal audit summary once the batch transitions to `completed` or `completed_with_failures`.
- **Path Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `batchId` | Path | UUIDv4 | **Yes** | Unique identifier of the bulk batch row in `document_letter_batches`. |
- **Query Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `limit` | Query | Integer | Optional | No | `50` | Maximum number of failed/skipped items to return in the paginated failures list. Min `1`, Max `100`. |
  | `offset` | Query | Integer | Optional | No | `0` | Number of failed/skipped items to skip. Min `0`. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` from verified token claims (`req.user.orgId`).
  3. Validates path parameter `batchId` against `bulkBatchIdParamSchema` and query parameters against `bulkFailuresQuerySchema`.
  4. Queries `document_letter_batches` by `(id, org_id)` using `LIST_ATTRIBUTES`. Note: `branding_snapshot` and `field_overrides` are excluded from the query projection to prevent internal configuration leakage.
  5. If no batch is found matching `(id, org_id)`, returns uniform HTTP `404 Not Found` (`DOCUMENT_NOT_FOUND`).
  6. Queries aggregate item status counts from the authoritative ledger via `itemRepo.countByBatch(orgId, batchId)`. Aggregates counts for `pending`, `issued`, `failed`, and `skipped`.
  7. Queries diagnostic queue status counts via `jobRepo.countByBatch(orgId, batchId)`. Aggregates counts for `queued`, `claimed`, `done`, `failed`, and `cancelled`.
  8. Queries paginated failed and skipped rows from `document_letter_batch_items` via `itemRepo.listFailures(orgId, batchId, { limit, offset })` ordered by `updated_at DESC, id DESC`.
  9. Evaluates divergence check: if `counts.pending !== (queue.queued + queue.claimed)`, emits a system diagnostic warning log to assist operator observability.
  10. Assembles and returns HTTP `200 OK` response payload containing `batch` summary, `counts`, `queue`, `failures` list, and `pagination` metadata.
- **Database Impact:** Read-only queries against `document_letter_batches`, `document_letter_batch_items`, and `pdf_render_jobs`. No table or row locks acquired.
- **PDF Generation Impact:** None. Read-only status inspection.
- **File / Storage Impact:** None. No S3 operations or signed URL generations occur.
- **Transaction Behavior:** None. Standard read operations execute outside database transactions.
- **Concurrency Behavior:** Pure read-only operation. Safe for high-frequency polling from multiple client sessions.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to poll indefinitely.
- **Side Effects:** Emits diagnostic console log warning if ledger pending count diverges from active queue job count.
- **Dependencies:** PostgreSQL database tables (`document_letter_batches`, `document_letter_batch_items`, `pdf_render_jobs`).
- **Security & Authorization (Inside Entry):**
  - Scoped strictly to `req.user.orgId`.
  - Batch existence check includes `org_id` predicate: querying a `batchId` belonging to another organization returns HTTP `404 Not Found` (`DOCUMENT_NOT_FOUND`), structurally preventing cross-tenant existence enumeration.
  - Excludes raw S3 storage keys and branding snapshots from all returned records.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "batch": {
        "id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
        "template_code": "bonafide_letter",
        "template_version": 1,
        "status": "running",
        "total": 50,
        "created_by": "11111111-2222-3333-4444-555555555555",
        "created_at": "2026-09-29T08:00:00.000Z",
        "completed_at": null
      },
      "counts": {
        "pending": 10,
        "issued": 38,
        "failed": 2,
        "skipped": 0
      },
      "queue": {
        "queued": 10,
        "claimed": 0,
        "done": 38,
        "failed": 2,
        "cancelled": 0
      },
      "failures": [
        {
          "subject_user_id": "22222222-3333-4444-5555-666666666666",
          "failure_code": "PDF_RENDER_TIMEOUT",
          "failure_reason": "Chromium renderer timed out after 30000ms",
          "updated_at": "2026-09-29T08:05:00.000Z"
        }
      ],
      "pagination": {
        "limit": 50,
        "offset": 0,
        "total": 1
      }
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | Always `'OK'`. |
  | `data.batch.id` | UUIDv4 | Unique identifier of the bulk batch. |
  | `data.batch.template_code` | String | Template code being issued in this batch. |
  | `data.batch.template_version` | Integer | Version of the template frozen at batch creation time. |
  | `data.batch.status` | String | Current batch lifecycle status: `queued`, `running`, `completed`, `completed_with_failures`, or `cancelled`. |
  | `data.batch.total` | Integer | Total count of subjects registered in the batch. |
  | `data.batch.created_by` | UUIDv4 | User ID of the HR administrator who initiated the batch. |
  | `data.batch.created_at` | ISO Timestamp | UTC timestamp when the batch was created. |
  | `data.batch.completed_at` | ISO Timestamp / Null | UTC timestamp when all items reached terminal status, or `null` if still in progress. |
  | `data.counts.pending` | Integer | Authoritative count of batch items still awaiting processing. |
  | `data.counts.issued` | Integer | Authoritative count of batch items successfully published and materialized. |
  | `data.counts.failed` | Integer | Authoritative count of batch items that failed due to render defects. |
  | `data.counts.skipped` | Integer | Authoritative count of batch items skipped due to subject departures or deactivated types. |
  | `data.queue.queued` | Integer | Diagnostic count of render jobs currently waiting in the job queue. |
  | `data.queue.claimed` | Integer | Diagnostic count of render jobs currently locked and being processed by workers. |
  | `data.queue.done` | Integer | Diagnostic count of completed render jobs. |
  | `data.queue.failed` | Integer | Diagnostic count of permanently failed render jobs. |
  | `data.queue.cancelled` | Integer | Diagnostic count of cancelled render jobs. |
  | `data.failures[].subject_user_id` | UUIDv4 | Employee UUID whose letter generation failed or was skipped. |
  | `data.failures[].failure_code` | String | Machine-readable failure classification code (e.g. `PDF_RENDER_TIMEOUT`, `LETTER_FACTS_MISSING`). |
  | `data.failures[].failure_reason` | String / Null | Detailed narrative error message or explanation. |
  | `data.failures[].updated_at` | ISO Timestamp | UTC timestamp when the item transitioned to failed/skipped. |
  | `data.pagination.limit` | Integer | Requested pagination limit for failures list. |
  | `data.pagination.offset` | Integer | Requested pagination offset for failures list. |
  | `data.pagination.total` | Integer | Total number of failed/skipped items recorded for this batch. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | `batchId` is not a valid UUIDv4 or query parameters violate constraints. | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
  | **404** | `DOCUMENT_NOT_FOUND` | `batchId` does not exist in the caller's organization. | `{"success": false, "message": "Document not found", "errorCode": "DOCUMENT_NOT_FOUND"}` |
- **Edge Cases & Boundary Handling:**
  - **Authoritative Ledger vs Diagnostic Queue:** Status and completion criteria are evaluated strictly from `document_letter_batch_items` (the durable ledger), not from `pdf_render_jobs` (the transient queue). If an external worker restarts or jobs are dropped, the item ledger remains the single source of truth for retry and reporting.
  - **Terminal Batch Status Protection:** Once a batch reaches `completed`, `completed_with_failures`, or `cancelled`, its terminal status cannot be reopened by late worker callbacks or status roll-up sweeps.

---

## 9. Manager Operations APIs — Letter Proposals

### 145. POST /api/v1/documents/manager/letters

- **API Name / Purpose:** Propose a Letter for a Direct Report (Maker Action)
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/manager/letters`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `manager`, `hr`. Required Feature: `documents.access`. Gated by Organization Setting: `manager_can_propose_letters` (Setting #93, default `false`).
- **Purpose / Business Problem Solved:** Operational line managers often know when an employee requires an official corporate document (e.g. an employment confirmation, experience recommendation, or visa bonafide letter) before central HR is informed. However, enterprise compliance and internal controls strictly prohibit line managers from directly minting, signing, numbering, and materializing official company legal instruments. This API initiates a maker–checker workflow by allowing a manager to submit a formal letter proposal for their direct report. The proposal is placed into the central HR review queue (API #148), where an authorized HR administrator acts as the checker to inspect, edit, approve (API #149), or reject (API #150) the request.
- **Why the API Exists:** Establishes a dedicated, hierarchy-scoped maker plane (`/api/v1/documents/manager`) for letter requests, completely segregating line management proposal initiation from HR issuance authority.
- **Real-World Usage:** Invoked from the Manager Self-Service (MSS) portal when a manager selects a direct report from their team roster and clicks "Request Letter for Employee", selecting a permitted template (e.g. `experience_letter`) and providing operational context.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "template_code": "experience_letter",
    "subject_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
    "field_overrides": {
      "closing_note": "Exemplary performance during project migration"
    },
    "reason": "Employee requested letter for higher education application"
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `template_code` | Body | String | **Yes** | No | — | Unique identifier of the letter template in the registry. Max 64 characters. |
  | `subject_user_id` | Body | UUIDv4 | **Yes** | No | — | UUID of the recipient employee. Must belong to the caller's direct reporting line (or any employee if caller has `hr` role). |
  | `field_overrides` | Body | Object | Optional | No | `{}` | Depth-1 key-value map of template-specific field overrides. Max 20 keys. Values must be string (max 500 chars), number, or boolean. Must NOT target derived or service fields. |
  | `reason` | Body | String | Optional | Yes | `null` | Optional justification or operational context for HR review. Max 500 characters. |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role` is either `manager` or `hr`, and verifies entitlement `documents.access`.
  2. Extracts `orgId`, `actorId`, and `actorRole` from verified token claims (`req.user.orgId`, `req.user.id`, `req.user.role`).
  3. Validates request body shape against `proposeLetterSchema` using `validateOrThrow`.
  4. Evaluates organization setting `manager_can_propose_letters` (Setting #93) via `settingsService.getOrCreate(orgId)`. If `manager_can_propose_letters !== true`, halts immediately with HTTP `403 Forbidden` (`LETTER_PROPOSALS_DISABLED`).
  5. Evaluates manager reporting hierarchy scope via `hierarchyAccess.getAccessibleUserIds(orgId, { id: actorId, role: actorRole })`:
     - If caller is `hr`, returns `null` (global access granted).
     - If caller is `manager`, returns an array of direct report user UUIDs. If `subject_user_id` is NOT present in this array, rejects with HTTP `403 Forbidden` (`FORBIDDEN`).
     - **Scope-Before-Existence Rule:** Hierarchy scope is verified before querying the database for employee existence, preventing unauthorized cross-team or cross-tenant employee IDOR enumeration.
  6. Asserts template issuable in this organization:
     a. Checks template catalog registry: throws `404 LETTER_TEMPLATE_UNKNOWN` if absent.
     b. Reads `document_letter_configs`: throws `409 LETTER_TEMPLATE_DISABLED` if config is missing or `is_enabled !== true`.
     c. Reads `document_types` for mapped code: throws `409 DOCUMENT_TYPE_NOT_ACTIVATED` if absent, `409 DOCUMENT_TYPE_INACTIVE` if inactive, or `422 DOCUMENT_TYPE_PLANE_MISMATCH` if `plane !== 'org'`.
  7. Validates `field_overrides`: throws `422 LETTER_FIELD_UNKNOWN` if key is not declared in template schema, or `422 LETTER_FIELD_NOT_OVERRIDABLE` if key matches any entry in `template.derived_fields` or `template.service_fields`.
  8. Opens an atomic database transaction:
     a. Inserts proposal record into `document_letter_proposals` with `status = 'pending'`, `proposed_by = actorId`, `template_code`, `subject_user_id`, `field_overrides`, and `reason`.
        - If an open proposal already exists for `(org_id, template_code, subject_user_id)`, partial unique index `document_letter_proposals_live_uq` triggers `SequelizeUniqueConstraintError`. The repository catches this violation and maps it cleanly to HTTP `409 Conflict` (`LETTER_PROPOSAL_EXISTS`).
     b. Records audit log entry in `document_audit_logs` (`entityType = 'document_letter_proposal'`, `action = 'letter_proposal.created'`).
     c. Commits transaction.
  9. Returns HTTP `201 Created` with normalized proposal view model.
- **Database Impact:**
  - **Reads:** `document_settings` (feature gate check), `organization_hierarchy` / `employee_profiles` (hierarchy scoping), `document_letter_configs`, `document_types`.
  - **Writes (in atomic transaction):**
    - `document_letter_proposals` (INSERT new row with `status = 'pending'`).
    - `document_audit_logs` (INSERT audit entry `letter_proposal.created`).
  - **Locking:** Standard row insertion locks. No long-lived table locks.
- **PDF Generation Impact:** Zero rendering. A proposal is merely an intent to issue; rendering and template version pinning occur exclusively when HR approves the proposal (API #149).
- **File / Storage Impact:** None.
- **Transaction Behavior:** Single short database transaction enclosing the proposal insertion and its audit log.
- **Concurrency Behavior:** Protected by PostgreSQL partial unique index `document_letter_proposals_live_uq` on `(org_id, template_code, subject_user_id) WHERE status = 'pending'`. Prevents duplicate concurrent pending proposals for the same employee and letter template.
- **Idempotency / Retry Behavior:** Does not accept an idempotency key. A retry of the same proposal submission while a prior proposal is pending safely halts with HTTP `409 Conflict` (`LETTER_PROPOSAL_EXISTS`).
- **Side Effects:** Makes the proposal visible in the HR decision queue (API #148).
- **Dependencies:** PostgreSQL database, Document Settings, Document Type catalog, Template Registry, Hierarchy Access subsystem.
- **Security & Authorization (Inside Entry):**
  - Route mounted at `/api/v1/documents/manager/letters`.
  - Restricts access to `manager` and `hr` roles. Platform administrators (`admin`, `super-admin`) are denied with HTTP `403 Forbidden` (`INSUFFICIENT_PERMISSIONS`).
  - Gated by tenant-level setting `manager_can_propose_letters` (Setting #93).
  - Scope-checked strictly to direct reports. Addressing a subject outside the caller's team yields `403 FORBIDDEN` before database existence lookups occur.
- **Success Response Structure (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Letter proposal created",
    "data": {
      "proposal": {
        "id": "7c8e9b01-1234-4567-89ab-cdef01234567",
        "template_code": "experience_letter",
        "subject_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "field_overrides": {
          "closing_note": "Exemplary performance during project migration"
        },
        "reason": "Employee requested letter for higher education application",
        "status": "pending",
        "proposed_by": "33333333-4444-5555-6666-777777777777",
        "decided_by": null,
        "decided_at": null,
        "decision_note": null,
        "letter_id": null,
        "created_at": "2026-09-29T08:10:00.000Z",
        "updated_at": "2026-09-29T08:10:00.000Z"
      }
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | Always `'Letter proposal created'`. |
  | `data.proposal.id` | UUIDv4 | Unique identifier of the created proposal in `document_letter_proposals`. |
  | `data.proposal.template_code` | String | Letter template code proposed by the manager. |
  | `data.proposal.subject_user_id` | UUIDv4 | Employee UUID for whom the letter is requested. |
  | `data.proposal.field_overrides` | Object | Key-value overrides submitted by the manager. |
  | `data.proposal.reason` | String / Null | Justification note provided by the manager. |
  | `data.proposal.status` | String | Initial lifecycle status: always `'pending'`. |
  | `data.proposal.proposed_by` | UUIDv4 | User ID of the line manager who created the proposal. |
  | `data.proposal.decided_by` | UUIDv4 / Null | User ID of the HR administrator who approved or rejected the proposal (`null` while pending). |
  | `data.proposal.decided_at` | ISO Timestamp / Null | UTC timestamp when decision was rendered (`null` while pending). |
  | `data.proposal.decision_note` | String / Null | Decision explanation note recorded upon rejection (`null` while pending). |
  | `data.proposal.letter_id` | UUIDv4 / Null | Reference to the issued `org_documents.id` upon approval (`null` while pending). |
  | `data.proposal.created_at` | ISO Timestamp | UTC timestamp when proposal was created. |
  | `data.proposal.updated_at` | ISO Timestamp | UTC timestamp when proposal was last updated. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | Request body fails schema validation (e.g. invalid UUID, text fields with `<` or `>`). | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is neither `manager` nor `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
  | **403** | `LETTER_PROPOSALS_DISABLED` | Setting `manager_can_propose_letters` (Setting #93) is `false` in this organization. | `{"success": false, "message": "Manager letter proposals are disabled for your organization", "errorCode": "LETTER_PROPOSALS_DISABLED"}` |
  | **403** | `FORBIDDEN` | Subject employee is not in the caller's direct reporting line. | `{"success": false, "message": "You may only propose letters for your direct reports", "errorCode": "FORBIDDEN"}` |
  | **404** | `LETTER_TEMPLATE_UNKNOWN` | Template code does not exist in the system template catalog. | `{"success": false, "message": "Letter template not found", "errorCode": "LETTER_TEMPLATE_UNKNOWN"}` |
  | **409** | `LETTER_TEMPLATE_DISABLED` | Template is disabled in `document_letter_configs` for this organization. | `{"success": false, "message": "This letter template is disabled for your organization", "errorCode": "LETTER_TEMPLATE_DISABLED"}` |
  | **409** | `DOCUMENT_TYPE_NOT_ACTIVATED`| Document type mapped to template is not activated in tenant's catalog. | `{"success": false, "message": "The document type for this letter is not activated", "errorCode": "DOCUMENT_TYPE_NOT_ACTIVATED"}` |
  | **409** | `DOCUMENT_TYPE_INACTIVE` | Document type mapped to template is inactive in tenant's catalog. | `{"success": false, "message": "The document type for this letter is inactive", "errorCode": "DOCUMENT_TYPE_INACTIVE"}` |
  | **409** | `LETTER_PROPOSAL_EXISTS` | An open (`pending`) proposal already exists for this subject and template. | `{"success": false, "message": "An open proposal already exists for this subject and template", "errorCode": "LETTER_PROPOSAL_EXISTS"}` |
  | **422** | `DOCUMENT_TYPE_PLANE_MISMATCH` | Mapped document type is configured with `plane !== 'org'`. | `{"success": false, "message": "The mapped document type is not an organization-plane type", "errorCode": "DOCUMENT_TYPE_PLANE_MISMATCH"}` |
  | **422** | `LETTER_FIELD_UNKNOWN` | An override key in `field_overrides` is not defined in template schema. | `{"success": false, "message": "Unknown field \"<field>\" for this template", "errorCode": "LETTER_FIELD_UNKNOWN", "details": {"field": "<field>"}}` |
  | **422** | `LETTER_FIELD_NOT_OVERRIDABLE` | An override key targets a derived or service field. | `{"success": false, "message": "Field \"<field>\" is derived and cannot be overridden", "errorCode": "LETTER_FIELD_NOT_OVERRIDABLE", "details": {"field": "<field>"}}` |
- **Edge Cases & Boundary Handling:**
  - **No Template Version Pinning at Proposal:** A proposal does not freeze `template_version`. If HR updates the corporate template definition while a proposal is pending, the letter is rendered using the active version at the moment of approval (API #149), guaranteeing corporate template currency.
  - **Pre-Validation of Field Overrides:** Even though issuance is deferred to approval, `field_overrides` are strictly validated at proposal creation time. A manager cannot submit invalid override keys that would inevitably fail later during HR approval.

---

### 146. GET /api/v1/documents/manager/letters

- **API Name / Purpose:** List Caller's Own Letter Proposals
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/manager/letters`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `manager`, `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Line managers need visibility into the status of all letter requests they have submitted on behalf of their direct reports—tracking whether each request is still pending HR review, has been approved and issued (with its generated document ID), has been rejected (with the HR rejection reason), or was cancelled.
- **Why the API Exists:** Provides an inherently scoped query endpoint that restricts visibility exclusively to proposals created by the calling user (`proposed_by = req.user.id`), preventing managers from viewing proposal activity across other organizational departments.
- **Real-World Usage:** Invoked by the Manager Self-Service (MSS) portal when displaying the "My Letter Requests" tab, rendering a table with filter chips for `pending`, `approved`, and `rejected`.
- **Path Parameters:** None.
- **Query Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `status` | Query | String | Optional | No | `null` | Filter by proposal status. Allowed values: `pending`, `approved`, `rejected`, `cancelled`. If omitted, returns proposals across all statuses. |
  | `template_code` | Query | String | Optional | No | `null` | Filter proposals by template code (e.g. `experience_letter`). Max 64 chars. |
  | `subject_user_id` | Query | UUIDv4 | Optional | No | `null` | Filter proposals by target employee UUID. |
  | `limit` | Query | Integer | Optional | No | `50` | Maximum number of records to return. Min `1`, Max `200`. |
  | `offset` | Query | Integer | Optional | No | `0` | Number of records to skip. Min `0`. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role` is either `manager` or `hr`, and entitlement `documents.access`.
  2. Extracts `orgId` and `actorId` from verified token claims (`req.user.orgId`, `req.user.id`).
  3. Validates query parameters against `proposalListQuerySchema` using `validateOrThrow`.
  4. Queries `document_letter_proposals` with mandatory predicates `org_id = :orgId` AND `proposed_by = :actorId`.
  5. Applies optional query filters (`status`, `template_code`, `subject_user_id`).
  6. Executes `findAndCountAll` with pagination (`limit`, `offset`) ordered by `created_at DESC, id DESC`.
  7. Maps database rows to safe DTO views via `proposalView()`.
  8. Returns HTTP `200 OK` with paginated proposal list and total count.
- **Database Impact:** Read-only query against `document_letter_proposals`. No table or row locks acquired.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** None.
- **Transaction Behavior:** None. Standard read operation.
- **Concurrency Behavior:** Pure read-only operation.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to repeat.
- **Side Effects:** None.
- **Dependencies:** PostgreSQL database (`document_letter_proposals`).
- **Security & Authorization (Inside Entry):**
  - Scoped strictly to `req.user.orgId` AND `req.user.id`.
  - Inherent scoping: the repository forces `proposed_by = actorId`. A line manager cannot access or infer proposals authored by any other manager.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "proposals": [
        {
          "id": "7c8e9b01-1234-4567-89ab-cdef01234567",
          "template_code": "experience_letter",
          "subject_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "field_overrides": {
            "closing_note": "Exemplary performance during project migration"
          },
          "reason": "Employee requested letter for higher education application",
          "status": "approved",
          "proposed_by": "33333333-4444-5555-6666-777777777777",
          "decided_by": "11111111-2222-3333-4444-555555555555",
          "decided_at": "2026-09-29T08:20:00.000Z",
          "decision_note": null,
          "letter_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "created_at": "2026-09-29T08:10:00.000Z",
          "updated_at": "2026-09-29T08:20:00.000Z"
        }
      ],
      "total": 1,
      "limit": 50,
      "offset": 0
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | Always `'OK'`. |
  | `data.proposals[].id` | UUIDv4 | Unique proposal identifier. |
  | `data.proposals[].template_code` | String | Proposed letter template code. |
  | `data.proposals[].subject_user_id` | UUIDv4 | Recipient employee UUID. |
  | `data.proposals[].field_overrides` | Object | Key-value overrides submitted with the proposal. |
  | `data.proposals[].reason` | String / Null | Justification note provided by the manager. |
  | `data.proposals[].status` | String | Proposal status: `pending`, `approved`, `rejected`, or `cancelled`. |
  | `data.proposals[].proposed_by` | UUIDv4 | User ID of the proposer (matches `req.user.id`). |
  | `data.proposals[].decided_by` | UUIDv4 / Null | User ID of the deciding HR administrator. |
  | `data.proposals[].decided_at` | ISO Timestamp / Null | UTC timestamp when the proposal was decided. |
  | `data.proposals[].decision_note` | String / Null | Explanation note recorded by HR upon rejection. |
  | `data.proposals[].letter_id` | UUIDv4 / Null | Reference to the issued document row in `org_documents`. |
  | `data.proposals[].created_at` | ISO Timestamp | UTC timestamp when proposal was created. |
  | `data.proposals[].updated_at` | ISO Timestamp | UTC timestamp when proposal was last modified. |
  | `data.total` | Integer | Total count of proposals matching the query filters for this proposer. |
  | `data.limit` | Integer | Pagination limit applied. |
  | `data.offset` | Integer | Pagination offset applied. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | Invalid query parameter (e.g. invalid status enum, negative limit). | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is neither `manager` nor `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
- **Edge Cases & Boundary Handling:**
  - **No Cross-Manager Leakage (BR-M9):** Querying without filters returns all proposals authored by the calling manager, but never returns proposals submitted by peers or other department heads, preserving departmental compensation and recommendation privacy.

---

## 10. HR Administration APIs — Render Queue Drain & Proposal Decision Queue

### 147. POST /api/v1/documents/hr/jobs/pdf-render/run

- **API Name / Purpose:** Trigger On-Demand Letter Render Queue Drain
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/jobs/pdf-render/run`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** While bulk issuance batches and letter render jobs are ordinarily drained by an unattended 15-minute scheduled background cron, HR administrators frequently need immediate batch completion (e.g. issuing urgent appointment or relieving letters during active business hours). Furthermore, if worker pods restart or transient network timeouts strand pending render artifacts in an uncommitted state, administrators need an authorized trigger to sweep stranded artifacts, re-enqueue batch stragglers, drain queued letter jobs, and update batch completion statuses without waiting for the next cron cycle.
- **Why the API Exists:** Provides an administrative, organization-scoped execution trigger for the letter PDF render worker, isolating letter queue processing from payroll payslip jobs and exposing execution counters (`claimed`, `done`, `retried`, `failed`, `cancelled`, `remaining`).
- **Real-World Usage:** Invoked by HR administrators when clicking "Process Queue Now" or "Retry Bulk Batch" on a bulk batch details screen, or triggered automatically by administrative test suites.
- **Path Parameters:** None.
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "batch_id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
    "limit": 50
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `batch_id` | Body | UUIDv4 | Optional | Yes | `null` | Optional UUID of a specific bulk batch. When supplied, re-enqueues any still-pending items for this batch before draining, and targets status roll-up to this batch. |
  | `limit` | Body | Integer | Optional | Yes | `null` | Maximum number of render jobs to claim and process during this drain invocation. Min `1`, Max `200`. Bounds execution time and prevents worker timeout. |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` from verified token claims (`req.user.orgId`).
  3. Validates request body shape against `runRenderSchema` using `validateOrThrow`.
  4. Triggers the PDF artifact sweeper service scoped strictly to letters: `pdf_artifact_sweeper.service.run({ orgId, sourceTypes: ['letter'] })`. Identifies and recovers stranded `pending` letter artifacts older than 30 minutes.
  5. If `batch_id` is supplied:
     a. Loads the batch record via `batchRepo.findById(orgId, batchId)`.
     b. If found, opens a transaction and re-enqueues any still-pending ledger items via `_reenqueuePending()` using `ON CONFLICT DO NOTHING`.
  6. Initializes a shared memory cache Map (`cache`) for the drain tick to cache each batch's resolved organization context and branding snapshot (R-6), eliminating redundant database queries across items of the same batch.
  7. Invokes `pdf_render_worker.service.drain()`:
     - Scoped strictly to `sourceTypes: ['letter']` (never claims payslip jobs, preserving module isolation).
     - Claims jobs using `FOR UPDATE SKIP LOCKED`.
     - Executes `batchService.renderItem({ orgId, job, cache })` for each claimed job:
       a. Loads the per-subject ledger item from `document_letter_batch_items` by `document_id = job.source_id`. If absent, cancels the orphan job.
       b. Checks item status: if status is not `'pending'` (already issued, failed, or skipped), cancels redundant job.
       c. Resolves org issuance context from cache (or reads batch row and branding snapshot).
       d. Evaluates branding asset URL freshness: if cached presigned URLs are older than 180 seconds (`BRANDING_ASSET_REUSE_MS`), re-mints fresh S3 presigned URLs via `refreshAssets()`.
       e. Calls `letterService.issue()` with:
          - `keyBase = "batch:{batchId}:{subjectUserId}"` (salted system idempotency key)
          - `documentId = item.document_id` (pre-generated UUID matches job `source_id`)
          - `effective_date = batch.pinned_date`
          - `orgContext = ctx`
       f. Upon successful render, opens an atomic transaction to update the ledger item: sets `status = 'issued'`, `letter_id = item.document_id`, `artifact_id = result.artifact.id`, `reference_number = result.reference_number`, and `issued_at = new Date()`.
       g. Upon failure, executes `_classifyRenderFailure()`:
          - **Never-Issuable (404 or inactive type/template):** Marks item `status = 'skipped'` and cancels job in one atomic transaction.
          - **Deterministic Render Defect (template syntax error, size limit, 422):** Marks item `status = 'failed'` and cancels job or rethrows without backoff to prevent burning retry attempts.
          - **Transient Network / Renderer Timeout:** Leaves item `status = 'pending'` and rethrows error for worker exponential backoff (up to 5 attempts).
  8. Recomputes terminal lifecycle status (`rollUpStatus`) for all runnable batches in the organization (R-8):
     - If `pending > 0`: `status = 'running'`
     - If `pending === 0` AND `failed === 0` AND `skipped === 0`: `status = 'completed'`, `completed_at = now`
     - If `pending === 0` AND (`failed > 0` OR `skipped > 0`): `status = 'completed_with_failures'`, `completed_at = now`
     - Note: `updateStatus` is conditional on current status not being terminal, preventing late ticks from reopening finished batches.
  9. Queries `jobRepo.countLiveForOrg(orgId, { sourceType: 'letter' })` to compute remaining live jobs.
  10. Returns HTTP `200 OK` with execution summary counters.
- **Database Impact:**
  - **Reads:** `pdf_render_artifacts`, `document_letter_batches`, `document_letter_batch_items`, `pdf_render_jobs` (with `FOR UPDATE SKIP LOCKED`).
  - **Writes:**
    - `pdf_render_jobs` (UPDATE claimed, markDone, cancelled, failed).
    - `document_letter_batch_items` (UPDATE status to `issued`, `failed`, or `skipped`).
    - `org_documents`, `org_document_recipients`, `pdf_render_artifacts`, `document_letter_sequences` (INSERT/UPDATE via `letterService.issue`).
    - `document_letter_batches` (UPDATE status to `completed` or `completed_with_failures`).
  - **Locking:** Sequence allocation lock held for <10ms exclusively within the final commit phase of each item. Worker job claim uses non-blocking `SKIP LOCKED`.
- **PDF Generation Impact:** Executes headless Chromium rendering for all claimed letter jobs, generating A4 PDF binaries and uploading to AWS S3.
- **File / Storage Impact:** Uploads binary PDF streams to AWS S3 under `org/{org_id}/pdf/letter/{artifact_id}.pdf`.
- **Transaction Behavior:** Dual-transaction boundary pattern per item. Rendering occurs outside database transactions. Item ledger updates, sequence increments, and document materialization commit in short, isolated transactions.
- **Concurrency Behavior:** Safe for concurrent worker processes. Row-level `SKIP LOCKED` prevents duplicate job claims across parallel workers.
- **Idempotency / Retry Behavior:**
  - Idempotency key base `batch:{batchId}:{subjectUserId}` routes through bounded failure salt (`:r1`, `:r2`, ...).
  - Retrying a batch converges on existing issued documents without duplicate sequence generation or duplicate S3 uploads.
- **Side Effects:** Materializes documents in employee portals, issues notifications if enabled, increments organizational reference number sequences.
- **Dependencies:** PostgreSQL database, AWS S3, Puppeteer PDF renderer service (`PDF_RENDERER_BASE_URL`).
- **Security & Authorization (Inside Entry):**
  - Restricted strictly to `hr` role and `documents.access`.
  - Scoped strictly to `req.user.orgId`. Cannot claim or drain jobs belonging to other tenants.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Letter render queue drained",
    "data": {
      "claimed": 25,
      "done": 24,
      "retried": 0,
      "failed": 1,
      "cancelled": 0,
      "remaining": 0
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | Always `'Letter render queue drained'`. |
  | `data.claimed` | Integer | Total number of letter render jobs claimed by worker during this drain execution. |
  | `data.done` | Integer | Number of jobs successfully rendered, uploaded, and materialized as official letters. |
  | `data.retried` | Integer | Number of jobs that encountered transient errors and were rescheduled with exponential backoff. |
  | `data.failed` | Integer | Number of jobs that failed permanently due to deterministic template or data defects. |
  | `data.cancelled` | Integer | Number of redundant or obsolete jobs cancelled during the drain. |
  | `data.remaining` | Integer | Count of active queued or claimed letter jobs remaining in the queue for this organization. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | `batch_id` is not a valid UUIDv4 or `limit` exceeds 200. | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
- **Edge Cases & Boundary Handling:**
  - **Presigned URL Expiry Prevention (C-11):** If a batch contains hundreds of subjects and a single drain run spans multiple minutes, the worker detects when cached branding asset presigned URLs exceed 180 seconds and refreshes them from S3 before rendering, preventing broken image placeholders.
  - **Terminal Status Roll-Up (R-8):** Status roll-up checks all runnable batches in the organization at the end of each tick, ensuring that a batch whose final job completed is promptly marked `completed` even if the current worker tick claimed zero jobs for it.

---

### 148. GET /api/v1/documents/hr/letters/proposals

- **API Name / Purpose:** List Pending Manager Proposals (HR Decision Queue)
- **HTTP Method:** `GET`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/proposals`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR administrators need a centralized review queue to inspect all maker–checker letter proposals submitted by operational line managers across the company, enabling them to evaluate operational context, check candidate qualifications, and prepare for approval or rejection.
- **Why the API Exists:** Provides an administrative inbox for maker–checker letter proposals, defaulting to `status = 'pending'` so HR administrators immediately see items requiring review and action.
- **Real-World Usage:** Invoked by the HR portal on the "Manager Letter Requests" page, displaying an action table where administrators can review justification notes, inspect requested overrides, and click "Approve & Issue" (API #149) or "Reject" (API #150).
- **Path Parameters:** None.
- **Query Parameters:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `status` | Query | String | Optional | No | `'pending'` | Filter proposals by status: `pending`, `approved`, `rejected`, or `cancelled`. Defaults to `'pending'` in controller if omitted. |
  | `template_code` | Query | String | Optional | No | `null` | Filter proposals by template code (e.g. `experience_letter`). Max 64 chars. |
  | `subject_user_id` | Query | UUIDv4 | Optional | No | `null` | Filter proposals by target employee UUID. |
  | `proposed_by` | Query | UUIDv4 | Optional | No | `null` | Filter proposals submitted by a specific proposing manager. |
  | `limit` | Query | Integer | Optional | No | `50` | Maximum number of records to return. Min `1`, Max `200`. |
  | `offset` | Query | Integer | Optional | No | `0` | Number of records to skip. Min `0`. |
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:** None.
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` from verified token claims (`req.user.orgId`).
  3. Validates query parameters against `proposalListQuerySchema` using `validateOrThrow`.
  4. Defaults `query.status` to `'pending'` if omitted by the client.
  5. Queries `document_letter_proposals` filtered by `org_id = :orgId` and optional criteria (`template_code`, `subject_user_id`, `proposed_by`, `status`).
  6. Executes `findAndCountAll` with pagination (`limit`, `offset`) ordered by `created_at DESC, id DESC`.
  7. Maps database rows to safe DTO views via `proposalView()`.
  8. Returns HTTP `200 OK` with paginated proposal list and total count.
- **Database Impact:** Read-only query against `document_letter_proposals`. No locks held.
- **PDF Generation Impact:** None.
- **File / Storage Impact:** None.
- **Transaction Behavior:** None.
- **Concurrency Behavior:** Pure read-only operation.
- **Idempotency / Retry Behavior:** Fully idempotent. Safe to repeat.
- **Side Effects:** None.
- **Dependencies:** PostgreSQL database (`document_letter_proposals`).
- **Security & Authorization (Inside Entry):**
  - Restricted strictly to `hr` role. Managers cannot access this endpoint.
  - Scoped strictly to `req.user.orgId`.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "proposals": [
        {
          "id": "7c8e9b01-1234-4567-89ab-cdef01234567",
          "template_code": "experience_letter",
          "subject_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
          "field_overrides": {
            "closing_note": "Exemplary performance during project migration"
          },
          "reason": "Employee requested letter for higher education application",
          "status": "pending",
          "proposed_by": "33333333-4444-5555-6666-777777777777",
          "decided_by": null,
          "decided_at": null,
          "decision_note": null,
          "letter_id": null,
          "created_at": "2026-09-29T08:10:00.000Z",
          "updated_at": "2026-09-29T08:10:00.000Z"
        }
      ],
      "total": 1,
      "limit": 50,
      "offset": 0
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | Always `'OK'`. |
  | `data.proposals[].id` | UUIDv4 | Unique proposal identifier. |
  | `data.proposals[].template_code` | String | Letter template code proposed. |
  | `data.proposals[].subject_user_id` | UUIDv4 | Recipient employee UUID. |
  | `data.proposals[].field_overrides` | Object | Key-value overrides submitted by the manager. |
  | `data.proposals[].reason` | String / Null | Justification note provided by the manager. |
  | `data.proposals[].status` | String | Proposal status (typically `'pending'`). |
  | `data.proposals[].proposed_by` | UUIDv4 | User ID of the proposing line manager. |
  | `data.proposals[].decided_by` | UUIDv4 / Null | User ID of the deciding HR administrator. |
  | `data.proposals[].decided_at` | ISO Timestamp / Null | UTC timestamp when decision was rendered. |
  | `data.proposals[].decision_note` | String / Null | Decision explanation note recorded upon rejection. |
  | `data.proposals[].letter_id` | UUIDv4 / Null | Reference to the issued document row in `org_documents`. |
  | `data.proposals[].created_at` | ISO Timestamp | UTC timestamp when proposal was created. |
  | `data.proposals[].updated_at` | ISO Timestamp | UTC timestamp when proposal was last modified. |
  | `data.total` | Integer | Total count of proposals matching the query filters. |
  | `data.limit` | Integer | Pagination limit applied. |
  | `data.offset` | Integer | Pagination offset applied. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | Invalid query parameter (e.g. invalid status enum, negative limit). | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
- **Edge Cases & Boundary Handling:**
  - **Defaulting to Pending:** If `status` query parameter is omitted, the controller explicitly defaults to `status = 'pending'`, ensuring that the inbox view displays actionable pending proposals rather than completed history.

---

### 149. POST /api/v1/documents/hr/letters/proposals/:id/approve

- **API Name / Purpose:** Approve Proposal & Issue Formal Letter (Checker Action)
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/proposals/:id/approve`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** Completes the maker–checker workflow by authorizing an HR administrator to approve a pending manager proposal. Approval immediately triggers full letter issuance through the unified letter issuance engine (`document_letter.service.issue`): resolving active template version and corporate branding, allocating a sequential reference number under lock, rendering an authentic PDF, uploading to S3, materializing the document in the employee's portal, and closing the proposal as `approved` atomically in the exact same transaction as the document commit.
- **Why the API Exists:** Provides an atomic maker–checker decision mechanism where a proposal can never be marked approved without a corresponding issued letter, and a letter can never be committed if the proposal approval fails.
- **Real-World Usage:** Invoked by an HR administrator clicking "Approve & Issue" on a proposal review modal. The administrator may optionally modify field overrides or specify an effective date.
- **Path Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `id` | Path | UUIDv4 | **Yes** | Unique identifier of the proposal in `document_letter_proposals`. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "field_overrides": {
      "closing_note": "Approved with exemplary service record"
    },
    "effective_date": "2026-09-29",
    "acknowledge_stale_scope": false
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `field_overrides` | Body | Object | Optional | No | proposal's overrides | Optional replacement overrides. Max 20 keys, depth 1. If provided, completely REPLACES the manager's overrides (audited by field names). |
  | `effective_date` | Body | String | Optional | No | today | Optional ISO date string (`YYYY-MM-DD`). Must fall within ±365 days of current date. |
  | `acknowledge_stale_scope` | Body | Boolean | Optional | No | `false` | When `true`, overrides a stale reporting hierarchy guard (e.g. if proposing manager changed departments since proposal creation). |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` and `actorId` from verified token claims (`req.user.orgId`, `req.user.id`).
  3. Validates path parameter `id` against `proposalIdParamSchema` and request body against `approveProposalSchema`.
  4. **Plain-Read Courtesy Pre-check (R-15):** Loads proposal by `(id, org_id)`. If missing: throws `404 DOCUMENT_NOT_FOUND`. If `status !== 'pending'`: throws `409 LETTER_PROPOSAL_NOT_PENDING`. (Executed without database locks to prevent row locks from spanning external Lambda rendering).
  5. **Separate Checker Enforcement (BR-M5, Setting #60):** Reads `document_settings`. If `document_require_separate_checker === true` AND `proposal.proposed_by === actorId`, halts immediately with HTTP `409 Conflict` (`SELF_APPROVAL_NOT_ALLOWED`). An HR user cannot approve a proposal they created as manager.
  6. **Stale Scope Re-Evaluation (BR-M4, EC-40):** Evaluates whether the proposing manager still manages the target employee via `hierarchyAccess.getAccessibleUserIds`. If the manager no longer manages the subject (e.g. due to department transfer or resignation) AND `acknowledge_stale_scope !== true`, rejects with HTTP `409 Conflict` (`PROPOSAL_SCOPE_STALE`). If `acknowledge_stale_scope === true`, approval proceeds and a special audit log is committed.
  7. Resolves effective overrides: if `field_overrides` is provided in the request body, replaces the manager's overrides; otherwise retains the proposal's original overrides.
  8. Dispatches to `letterService.issue()` with:
     - `keyBase = "proposal:" + id` (deterministic salted system idempotency key)
     - `onIssued` transactional hook (executed inside Phase B's `onReady` transaction):
       a. If stale scope was overridden, writes `letter_proposal.stale_scope_overridden` audit log.
       b. Calls `proposalRepo.decide(orgId, id, { status: 'approved', decidedBy: actorId, decidedAt: new Date(), letterId: ctx.documentId }, t)` conditional on `status = 'pending'`.
       c. **Concurrency Check:** If rows updated === 0 (indicating a concurrent approval or rejection won the race), throws `409 LETTER_PROPOSAL_NOT_PENDING`, which aborts and rolls back the entire letter transaction!
       d. Writes `letter_proposal.approved` audit log recording `letter_id`, `reference_number`, and any overridden field keys.
  9. Reloads the closed proposal record.
  10. Returns HTTP `201 Created` (`reused: false`) on fresh approval, or HTTP `200 OK` (`reused: true`) on idempotent replay, returning letter, artifact, and proposal metadata.
- **Database Impact:**
  - **Reads:** `document_letter_proposals`, `document_settings`, `document_letter_configs`, `document_types`, `document_letter_branding`, `employee_profiles`.
  - **Writes (atomic commit in onReady transaction):**
    - `pdf_render_artifacts` (INSERT pending, UPDATE ready).
    - `document_letter_sequences` (UPDATE sequence counter under row lock).
    - `org_documents` (INSERT letter record).
    - `org_document_recipients` (INSERT recipient record).
    - `document_letter_proposals` (UPDATE status to `approved`, set `decided_by`, `decided_at`, `letter_id`).
    - `document_audit_logs` (INSERT multiple audit records).
  - **Locking:** Sequence row lock held for <10ms. No row locks span the external render call.
- **PDF Generation Impact:** Executes headless Chromium render for the approved letter, generating A4 PDF binary with corporate branding.
- **File / Storage Impact:** Uploads binary PDF to AWS S3 under `org/{org_id}/pdf/letter/{artifact_id}.pdf`.
- **Transaction Behavior:** Proposal closure occurs inside the exact same atomic transaction as the letter row creation and sequence increment (`BR-M7`). A proposal cannot be approved without a letter, nor can a letter be issued without closing the proposal.
- **Concurrency Behavior:** Protected by conditional `decide` update (`WHERE id = :id AND status = 'pending'`). If two HR administrators attempt to approve the same proposal simultaneously, exactly one succeeds; the second receives HTTP `409 Conflict` (`LETTER_PROPOSAL_NOT_PENDING`) and its letter transaction rolls back cleanly.
- **Idempotency / Retry Behavior:** Does NOT accept a client `idempotency_key`. The proposal ID serves as the deterministic system key base (`proposal:{id}`). A double-click or network retry returns HTTP `200 OK` with `reused: true` and the existing letter details.
- **Side Effects:** Publishes document to employee portal, creates recipient obligation, writes audit trail.
- **Dependencies:** PostgreSQL database, AWS S3, Puppeteer PDF renderer, Document Type catalog.
- **Security & Authorization (Inside Entry):**
  - Restricted strictly to `hr` role and `documents.access`.
  - Scoped strictly to `req.user.orgId`.
  - Segregation of duties: Enforces separate checker rule (`SELF_APPROVAL_NOT_ALLOWED`) when configured.
  - Hierarchy freshness: Enforces stale scope check to prevent approving letters initiated under outdated reporting relationships.
- **Success Response Structure (Fresh Approval — HTTP 201 Created):**
  ```json
  {
    "success": true,
    "message": "Proposal approved and letter issued",
    "data": {
      "letter": {
        "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "title": "Experience Letter - Rajesh Kumar",
        "reference_number": "HR/EXP/2026/00042",
        "status": "published",
        "origin": "generated",
        "issued_at": "2026-09-29T08:20:00.000Z",
        "requires_acknowledgement": false,
        "is_confidential": true
      },
      "artifact": {
        "id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
        "status": "ready",
        "file_size_bytes": 104520,
        "sha256": "3a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
        "page_count": 1
      },
      "proposal": {
        "id": "7c8e9b01-1234-4567-89ab-cdef01234567",
        "template_code": "experience_letter",
        "subject_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "field_overrides": {
          "closing_note": "Approved with exemplary service record"
        },
        "reason": "Employee requested letter for higher education application",
        "status": "approved",
        "proposed_by": "33333333-4444-5555-6666-777777777777",
        "decided_by": "11111111-2222-3333-4444-555555555555",
        "decided_at": "2026-09-29T08:20:00.000Z",
        "decision_note": null,
        "letter_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "created_at": "2026-09-29T08:10:00.000Z",
        "updated_at": "2026-09-29T08:20:00.000Z"
      },
      "reused": false
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | `'Proposal approved and letter issued'` (or `'Proposal already approved'` on replay). |
  | `data.letter.id` | UUIDv4 | Unique identifier of the created `org_documents` record. |
  | `data.letter.title` | String | Formatted title of the generated letter document. |
  | `data.letter.reference_number` | String | Corporate reference number sequentially assigned to this letter. |
  | `data.letter.status` | String | Document status: always `'published'`. |
  | `data.letter.origin` | String | Document origin: always `'generated'`. |
  | `data.letter.issued_at` | ISO Timestamp | UTC timestamp when document was generated. |
  | `data.letter.requires_acknowledgement` | Boolean | Whether recipient acknowledgement is mandatory. |
  | `data.letter.is_confidential` | Boolean | Whether document is restricted to recipient and HR. |
  | `data.artifact.id` | UUIDv4 | Unique identifier of the render artifact in `pdf_render_artifacts`. |
  | `data.artifact.status` | String | Artifact status: `'ready'`. |
  | `data.artifact.file_size_bytes` | Integer | Binary file size of the rendered PDF in bytes. |
  | `data.artifact.sha256` | String | Hex-encoded SHA-256 checksum of the PDF file. |
  | `data.artifact.page_count` | Integer | Total page count of the rendered PDF. |
  | `data.proposal.id` | UUIDv4 | Proposal identifier. |
  | `data.proposal.status` | String | Proposal status: now `'approved'`. |
  | `data.proposal.decided_by` | UUIDv4 | User ID of the HR administrator who approved the proposal. |
  | `data.proposal.decided_at` | ISO Timestamp | UTC timestamp when approval occurred. |
  | `data.proposal.letter_id` | UUIDv4 | ID of the materialized `org_documents` record. |
  | `data.reused` | Boolean | `false` on fresh approval; `true` on idempotent replay. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | Schema validation error in path or body. | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
  | **404** | `DOCUMENT_NOT_FOUND` | Proposal `id` does not exist in caller's organization. | `{"success": false, "message": "Document not found", "errorCode": "DOCUMENT_NOT_FOUND"}` |
  | **409** | `LETTER_PROPOSAL_NOT_PENDING` | Proposal is already approved, rejected, or cancelled. | `{"success": false, "message": "This proposal is not pending", "errorCode": "LETTER_PROPOSAL_NOT_PENDING", "details": {"status": "approved"}}` |
  | **409** | `SELF_APPROVAL_NOT_ALLOWED` | Proposing manager is identical to approver and separate checker is required. | `{"success": false, "message": "Separate checker required — approver must differ from proposer", "errorCode": "SELF_APPROVAL_NOT_ALLOWED"}` |
  | **409** | `PROPOSAL_SCOPE_STALE` | Proposing manager no longer manages the subject and `acknowledge_stale_scope` is false. | `{"success": false, "message": "The proposer no longer manages the subject", "errorCode": "PROPOSAL_SCOPE_STALE"}` |
  | **409** | `LETTER_TEMPLATE_DISABLED` | Template disabled in `document_letter_configs`. | `{"success": false, "message": "This letter template is disabled for your organization", "errorCode": "LETTER_TEMPLATE_DISABLED"}` |
  | **422** | `LETTER_FIELD_UNKNOWN` | Overrides contain unknown field names. | `{"success": false, "message": "Unknown field \"<field>\" for this template", "errorCode": "LETTER_FIELD_UNKNOWN", "details": {"field": "<field>"}}` |
  | **422** | `LETTER_FACTS_MISSING` | Employee facts required by template cannot be resolved. | `{"success": false, "message": "Required employee facts are missing", "errorCode": "LETTER_FACTS_MISSING", "details": {"missing_fields": [...]}}` |
- **Edge Cases & Boundary Handling:**
  - **Override Replacement Auditing (R-18):** When HR replaces field overrides at approval time, the audit log `letter_proposal.approved` records `overrides_replaced: true` and the array of overridden key names. To prevent sensitive PII leakage into audit trails, values are never written to audit logs.
  - **Zero Row Decide Race Protection:** If two HR admins approve simultaneously, the losing admin's `decide()` returns 0 rows updated, triggering `LETTER_PROPOSAL_NOT_PENDING` and rolling back the generated letter and sequence allocation completely.

---

### 150. POST /api/v1/documents/hr/letters/proposals/:id/reject

- **API Name / Purpose:** Reject Proposal (Terminal Decision)
- **HTTP Method:** `POST`
- **Endpoint / Route:** `/api/v1/documents/hr/letters/proposals/:id/reject`
- **Authentication / Authorization:** Bearer JWT Token. Required Roles: `hr`. Required Feature: `documents.access`.
- **Purpose / Business Problem Solved:** HR administrators need the ability to officially decline an unjustified, improper, or non-compliant letter proposal submitted by a line manager. A rejection is permanent, terminal, requires an explanatory reason for transparency, updates the proposal state to `rejected`, and records an immutable audit trail.
- **Why the API Exists:** Provides a terminal rejection endpoint for maker–checker proposals that closes the proposal lifecycle without issuing a document or allocating reference numbers.
- **Real-World Usage:** Invoked by an HR administrator clicking "Reject Request" on a proposal review modal and providing an operational explanation (e.g. "Tenure dates do not match employee service book records").
- **Path Parameters:**
  | Field | Location | Type | Required | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `id` | Path | UUIDv4 | **Yes** | Unique identifier of the proposal in `document_letter_proposals`. |
- **Query Parameters:** None.
- **Request Headers:**
  - `Authorization: Bearer <JWT>` (Required)
  - `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit logs)
- **Request JSON / Form Data:**
  ```json
  {
    "reason": "Tenure dates do not match employee service book records"
  }
  ```
- **Request Field Documentation:**
  | Field | Location | Type | Required | Nullable | Default | Description / Validation Rules |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `reason` | Body | String | **Yes** | No | — | Explanatory reason for rejection. Min 1, Max 500 characters. Mandatory for all rejections (BR-M8). |
- **Detailed API Behavior & Processing Flow:**
  1. Authenticates token and verifies `req.user.role === 'hr'` and entitlement `documents.access`.
  2. Extracts `orgId` and `actorId` from verified token claims (`req.user.orgId`, `req.user.id`).
  3. Validates path parameter `id` against `proposalIdParamSchema` and request body against `rejectProposalSchema` (`reason` must be non-empty string ≤ 500 chars).
  4. Opens an atomic database transaction.
  5. Queries `document_letter_proposals` under row-level pessimistic lock `FOR UPDATE` via `proposalRepo.findById(orgId, id, { lock: true, transaction: t })`.
  6. If row does not exist, rolls back and returns HTTP `404 Not Found` (`DOCUMENT_NOT_FOUND`).
  7. If proposal status is not `'pending'`, rolls back and returns HTTP `409 Conflict` (`LETTER_PROPOSAL_NOT_PENDING`) detailing `{ status: row.status }`.
  8. Executes `proposalRepo.decide(orgId, id, { status: 'rejected', decidedBy: actorId, decidedAt: new Date(), decisionNote: payload.reason }, t)` conditional on `status = 'pending'`.
  9. Records audit log entry in `document_audit_logs` (`entityType = 'document_letter_proposal'`, `action = 'letter_proposal.rejected'`, `newValues: { decision_note: payload.reason }`).
  10. Commits the transaction.
  11. Reloads the rejected proposal and returns HTTP `200 OK` with the updated proposal object.
- **Database Impact:**
  - **Reads:** `document_letter_proposals` (with `FOR UPDATE` lock).
  - **Writes (in atomic transaction):**
    - `document_letter_proposals` (UPDATE `status = 'rejected'`, `decided_by`, `decided_at`, `decision_note`).
    - `document_audit_logs` (INSERT audit entry `letter_proposal.rejected`).
  - **Locking:** Row-level lock (`FOR UPDATE`) on the proposal row held for the duration of the short transaction (<10ms).
- **PDF Generation Impact:** Zero rendering.
- **File / Storage Impact:** None.
- **Transaction Behavior:** Entire operation (lock, update, audit log) executes inside a single atomic database transaction.
- **Concurrency Behavior:** Protected by pessimistic `FOR UPDATE` locking and conditional `status = 'pending'` update predicate. Concurrent decisions are serialized; the first wins, and subsequent calls receive HTTP `409 Conflict`.
- **Idempotency / Retry Behavior:** Does not accept an idempotency key. Repeating the request after rejection returns HTTP `409 Conflict` (`LETTER_PROPOSAL_NOT_PENDING`).
- **Side Effects:** Makes rejection status and justification note visible to the proposing manager via API #146.
- **Dependencies:** PostgreSQL database (`document_letter_proposals`, `document_audit_logs`).
- **Security & Authorization (Inside Entry):**
  - Restricted strictly to `hr` role and `documents.access`.
  - Scoped strictly to `req.user.orgId`.
- **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Proposal rejected",
    "data": {
      "proposal": {
        "id": "7c8e9b01-1234-4567-89ab-cdef01234567",
        "template_code": "experience_letter",
        "subject_user_id": "f5eccc72-9e78-490c-93d7-0eb84210de45",
        "field_overrides": {
          "closing_note": "Exemplary performance during project migration"
        },
        "reason": "Employee requested letter for higher education application",
        "status": "rejected",
        "proposed_by": "33333333-4444-5555-6666-777777777777",
        "decided_by": "11111111-2222-3333-4444-555555555555",
        "decided_at": "2026-09-29T08:25:00.000Z",
        "decision_note": "Tenure dates do not match employee service book records",
        "letter_id": null,
        "created_at": "2026-09-29T08:10:00.000Z",
        "updated_at": "2026-09-29T08:25:00.000Z"
      }
    }
  }
  ```
- **Response Field Documentation:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `success` | Boolean | Always `true` for successful responses. |
  | `message` | String | Always `'Proposal rejected'`. |
  | `data.proposal.id` | UUIDv4 | Unique proposal identifier. |
  | `data.proposal.template_code` | String | Letter template code. |
  | `data.proposal.subject_user_id` | UUIDv4 | Target employee UUID. |
  | `data.proposal.field_overrides` | Object | Original overrides submitted by manager. |
  | `data.proposal.reason` | String / Null | Original request justification from manager. |
  | `data.proposal.status` | String | Proposal status: now `'rejected'`. |
  | `data.proposal.proposed_by` | UUIDv4 | User ID of the proposing line manager. |
  | `data.proposal.decided_by` | UUIDv4 | User ID of the rejecting HR administrator. |
  | `data.proposal.decided_at` | ISO Timestamp | UTC timestamp when rejection occurred. |
  | `data.proposal.decision_note` | String | Mandatory rejection explanation provided by HR. |
  | `data.proposal.letter_id` | Null | Always `null` on rejection. |
  | `data.proposal.created_at` | ISO Timestamp | UTC timestamp when proposal was created. |
  | `data.proposal.updated_at` | ISO Timestamp | UTC timestamp when proposal was rejected. |
- **Error Codes & Scenarios:**
  | HTTP Status | Error Code | Scenario / Trigger Condition | Exact Error Message / Structure |
  | :---: | :--- | :--- | :--- |
  | **400** | `VALIDATION_ERROR` | Missing or invalid `reason` (empty string, >500 chars). | `{"success": false, "message": "<Validation details>", "errorCode": "VALIDATION_ERROR"}` |
  | **401** | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. | `{"success": false, "message": "Authentication required", "errorCode": "AUTHENTICATION_REQUIRED"}` |
  | **403** | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr`. | `{"success": false, "message": "Insufficient permissions", "errorCode": "INSUFFICIENT_PERMISSIONS"}` |
  | **403** | `FEATURE_NOT_ENABLED` | Tenant is not entitled to `documents.access`. | `{"success": false, "message": "Feature not enabled", "errorCode": "FEATURE_NOT_ENABLED"}` |
  | **404** | `DOCUMENT_NOT_FOUND` | Proposal `id` does not exist in caller's organization. | `{"success": false, "message": "Document not found", "errorCode": "DOCUMENT_NOT_FOUND"}` |
  | **409** | `LETTER_PROPOSAL_NOT_PENDING` | Proposal is already approved, rejected, or cancelled. | `{"success": false, "message": "This proposal is not pending", "errorCode": "LETTER_PROPOSAL_NOT_PENDING", "details": {"status": "rejected"}}` |
- **Edge Cases & Boundary Handling:**
  - **Mandatory Rejection Justification (BR-M8):** Rejection schema mandates a non-empty `reason` string between 1 and 500 characters. An HR administrator cannot reject a proposal without providing operational feedback to the line manager.
  - **Terminal Status Invariance:** A rejected proposal cannot be revived, approved, or edited. If an employee requires the letter later, a new proposal must be submitted.

---

## 11. Existing APIs Modified / Extended by Phase 4

### 11.1. POST /api/v1/documents/hr/letters (API #139) — Internal Parameter Extension for Bulk & Automated Workflows

- **Endpoint / Method:** `POST /api/v1/documents/hr/letters`
- **Phase 4 Contract Modification:**
  - **External Wire Contract:** Zero modifications. External request payload, headers, query parameters, HTTP response codes (`201 Created` fresh / `200 OK` reused), and JSON response structure remain 100% byte-for-byte identical.
  - **Internal Architecture & Service Signature:** To maintain architectural integrity and adhere to the single issuance engine principle (D-6), `document_letter.service.js` method `issue()` was extended with five optional internal parameters:
    ```javascript
    async issue({
      orgId,
      actorId,
      payload,
      ipAddress = null,
      requestId = null,
      documentId = null,      // Internal pre-allocated org_documents.id
      orgContext = null,      // Pre-resolved branding, template, config & settings
      onIssued = null,        // Transactional callback executed inside onReady
      keyBase = null,         // Deterministic salted system idempotency key base
      systemOrigin = false    // Attribution flag for automated crons
    })
    ```
- **Detailed Concrete Contract & Behavioral Changes:**
  1. **Pre-Allocated Document Identity (`documentId`):**
     - Enables callers to inject a pre-generated UUIDv4 before rendering.
     - Utilized by bulk batch processing (`document_letter_batch.service.js`) so that the render job `source_id` in `pdf_render_jobs`, the per-subject ledger item `document_id` in `document_letter_batch_items`, and the materialized letter `id` in `org_documents` share the exact same UUID without requiring schema updates or secondary foreign key reconciliations.
  2. **Batch Context Caching (`orgContext`):**
     - Allows callers to inject a pre-resolved organization issuance context containing template metadata, active document type, letterhead branding, and organization settings.
     - In bulk batch processing, this resolves the organization-scoped context once per batch (across hundreds of subjects) rather than querying PostgreSQL for each subject, drastically reducing database read IOPS during large cohort processing.
  3. **Atomic Maker–Checker Transition Hook (`onIssued`):**
     - A transactional callback invoked within Phase B's `onReady` transaction alongside the letter row insertion, sequence increment, and recipient materialization.
     - Utilized by proposal approvals (`document_letter_proposal.service.js`, API #149) to execute `proposalRepo.decide(..., { status: 'approved' })`. If the proposal decision fails (e.g. lost race condition), `onIssued` throws, causing the entire letter insertion and sequence increment to roll back atomically.
  4. **Salted System Idempotency Keys (`keyBase`):**
     - Accepts a deterministic system key base:
       - Bulk items: `batch:{batchId}:{subjectUserId}`
       - Proposals: `proposal:{proposalId}`
       - Auto-issue on exit: `autoexit:{exitId}:{templateCode}`
     - System keys are routed through a bounded failure salt (`:r1`, `:r2`, ...) to allow automatic worker retry upon transient render failures while preventing duplicate letter generation or sequence counter consumption.
     - Direct client requests passing `payload.idempotency_key` continue to bypass the failure salt.
  5. **Automated Cron Attribution (`systemOrigin`):**
     - When `true`, audit logging records `actor_id: null` with reason `'auto_issue_on_exit'` to accurately represent a system-driven action, while the letter row retains attribution to the exit's administrative recorder (`created_by = exit.recorded_by`).

---

### 11.2. GET & PUT /api/v1/documents/hr/settings (APIs #82–#86) — New Letter Automation & Proposal Settings (Settings #91–#94)

- **Endpoints:** `GET /api/v1/documents/hr/settings` and `PUT /api/v1/documents/hr/settings`
- **Phase 4 Contract Modification:** Exposes and validates four new organizational configuration knobs in `document_hr.validator.js` and `document_settings.service.js`:
  | Setting Key | Registry # | Data Type | Validation Rules / Allowed Values | Default | Business Purpose |
  | :--- | :---: | :--- | :--- | :---: | :--- |
  | `letter_bulk_max_subjects` | **#91** | Integer | Min `1`, Max `2000`. Validated against `SETTINGS_CAPS`. | `200` | Defines the maximum number of employee subjects permitted in a single bulk letter issuance request via API #143. Prevents memory exhaustion and bounds batch size. |
  | `letter_auto_issue_on_exit` | **#92** | Array<String> | Array of up to 5 template codes. Validated by `assertAutoIssueTemplates()`. Must be registered templates, must not repeat, and **must not be compensation-bearing** (no salary-bearing templates allowed). | `[]` | List of letter template codes automatically issued to resigning/terminated employees during the offboarding cron pass (`runLetterAutoIssue`). |
  | `manager_can_propose_letters` | **#93** | Boolean | `true` or `false`. Validated as boolean. | `false` | Feature gate controlling whether operational line managers can submit maker–checker letter proposals for direct reports via API #145. When `false`, API #145 returns HTTP `403 Forbidden` (`LETTER_PROPOSALS_DISABLED`). |
  | `document_notify_letter_issued` | **#94** | Boolean | `true` or `false`. Validated as boolean. | `false` | Controls whether employee email notifications (`letter_issued`) are queued upon publication of a newly issued letter. Default is `false` (disabled) per product specifications. |
- **Pre-Flight Validation & Error Behaviors for `PUT /api/v1/documents/hr/settings`:**
  - If `letter_bulk_max_subjects` is `< 1` or `> 2000`: throws HTTP `422 Unprocessable Entity` (`SETTING_OUT_OF_RANGE` with `{ field: 'letter_bulk_max_subjects' }`).
  - If `letter_auto_issue_on_exit` is not an array: throws HTTP `422 Unprocessable Entity` (`SETTING_OUT_OF_RANGE`).
  - If `letter_auto_issue_on_exit` contains `> 5` templates: throws HTTP `422 Unprocessable Entity` (`SETTING_OUT_OF_RANGE` with `{ field: 'letter_auto_issue_on_exit', max: 5 }`).
  - If `letter_auto_issue_on_exit` contains an unknown template code: throws HTTP `422 Unprocessable Entity` (`SETTING_OUT_OF_RANGE` with `{ field: 'letter_auto_issue_on_exit', code }`).
  - If `letter_auto_issue_on_exit` contains duplicate template codes: throws HTTP `422 Unprocessable Entity` (`SETTING_OUT_OF_RANGE` with `{ field: 'letter_auto_issue_on_exit', code }`).
  - If `letter_auto_issue_on_exit` contains a compensation-bearing template (any template where a derived field uses `SOURCES.SALARY`): throws HTTP `422 Unprocessable Entity` (`SETTING_OUT_OF_RANGE` with message `"letter_auto_issue_on_exit may not include a compensation-bearing template (<code_name>)"`).
- **Success Response Structure (HTTP 200 OK):**
  - Returns HTTP `200 OK` with the complete, updated settings object reflecting the newly persisted columns alongside existing settings.
