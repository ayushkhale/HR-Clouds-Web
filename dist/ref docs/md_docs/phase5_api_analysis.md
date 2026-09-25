# Phase 5: Documents Module (Templates, Metadata Search, Compliance Reports & Exports, Offboarding, Composed View, Async Materialisation, On-Join Top-Up & Leave Bridge) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint technical, architectural, and production-grade analysis of **Documents Module – Phase 5**. It covers all **31 new APIs (#99–#129)**, the **existing endpoints modified / extended by Phase 5** (#47 publish, #77 compliance CSV, the `tags` additions to #43/#44/#70 + employee-document reads, and `POST /api/v1/leaves`), the **two new automated background crons** (publish-materialiser, offboarding-archive) and their boot startup catch-up engine, and the **two internal hooks with no HTTP surface** (F-7 on-join recipient top-up, F-4 soft-delete offboarding).

This document serves as the implementation-accurate reference for frontend engineering, QA test suite generation, security auditing, and RAG semantic indexing. It is grounded in the actual codebase (`src/modules/document/`, `src/cron-jobs/`, `src/modules/leave/`, `src/modules/organization/`) and verified against the test suite.

> [!IMPORTANT]
> **Architectural Premise & Enterprise Mechanics of Phase 5:**
> 1. **Reference Material vs. Employee PII Isolation (§1.1, F-1):** Templates are organization-owned blank forms carrying **zero employee PII**. They represent the sole read surface in the Documents module with **no hierarchy scoping**—every authenticated employee in the tenant sees the exact same published template catalog. This is an intentional architectural design, not a missing `getAccessibleUserIds` filter.
> 2. **Zero Binary Transit Invariant Maintained:** Across all Phase 5 capabilities (template upload/download, exit packs, bulk search, CSV exports, composed views), file binaries never transit Node.js memory. S3 signed PUT URLs are used for uploads; S3 signed GET URLs (`Expires: 900` with attachment disposition) are generated for downloads.
> 3. **SQL-Pushed Filtering & Honest Pagination (B-7, F-2):** Every row-excluding predicate in search and reports is executed in SQL before the `LIMIT` clause. Post-query screening via `screenDocument` acts strictly as defense-in-depth on the HR plane and must never drop rows. Paging ordering utilizes stable tiebreaks (`ORDER BY created_at DESC, id DESC`) to prevent repeated or skipped rows.
> 4. **Export Ledger as a Hard Egress Gate (F-3):** Every compliance CSV export and exit pack CSV writes a `document_export_jobs` ledger row. The job is marked `started` before the first byte leaves the server. If the ledger cannot record the egress (`begin` fails), the export is blocked with HTTP `503`. Ledger completion or failure is swallowed post-send to ensure file delivery is never compromised by bookkeeping issues.
> 5. **Asynchronous Bulk Publish Thresholding (F-6):** Org-wide document publication switches dynamically: when the audience is within `document_publish_sync_threshold` (#79, default 20,000), publication is synchronous (`200 OK`). When the audience exceeds this threshold, publication returns **`202 Accepted`**, publishes the document immediately, freezes the audience snapshot, and delegates roster materialisation to background workers in chunks of 5,000.
> 6. **Host-Operation Non-Blocking Isolation (F-4, F-7):** The on-join top-up hook and the employee soft-delete offboarding hook are executed **post-commit** within swallowing `try/catch` blocks via lazy `require()`. An invitation acceptance or employee deletion never rolls back or fails because of document module operations.
> 7. **Audience-Neutral Cross-Module Bridge (F-8, API #128):** Endpoint #128 resolves a single stored relative URL (`/api/v1/documents/attachments/:id/view-url`) for Leave requests. It derives the reader's plane from their token (applicant `self`, approving `manager`, or `hr`) and verifies access through the existing authority matrix. Supporting `?redirect=true`, it allows direct browser link navigation via HTTP 302.

---

## Table of Contents

- [1. Domain Overview & Architectural Mechanics](#1-domain-overview--architectural-mechanics)
  - [1.1 Template Lifecycle & Version Chain](#11-template-lifecycle--version-chain)
  - [1.2 Cross-Repository Metadata Search & Tags Engine](#12-cross-repository-metadata-search--tags-engine)
  - [1.3 Compliance Reporting & Data-Egress Ledger](#13-compliance-reporting--data-egress-ledger)
  - [1.4 Offboarding Unwind & Exit Pack Generation](#14-offboarding-unwind--exit-pack-generation)
  - [1.5 Unified Composed Employee Portfolio](#15-unified-composed-employee-portfolio)
  - [1.6 Asynchronous Recipient Materialisation Engine](#16-asynchronous-recipient-materialisation-engine)
  - [1.7 Real-Time On-Join Recipient Top-Up Hook](#17-real-time-on-join-recipient-top-up-hook)
  - [1.8 Leave Attachment Cross-Module Bridge](#18-leave-attachment-cross-module-bridge)
  - [1.9 Database Schemas, Alterations & Migration 00054](#19-database-schemas-alterations--migration-00054)
- [2. HR Template Lifecycle APIs (#99–#110)](#2-hr-template-lifecycle-apis-99110)
  - [99. POST /api/v1/documents/hr/templates](#99-post-apiv1documentshrtemplates)
  - [100. PATCH /api/v1/documents/hr/templates/:id](#100-patch-apiv1documentshrtemplatesid)
  - [101. POST /api/v1/documents/hr/templates/:id/file-url](#101-post-apiv1documentshrtemplatesidfile-url)
  - [102. POST /api/v1/documents/hr/templates/:id/confirm](#102-post-apiv1documentshrtemplatesidconfirm)
  - [103. POST /api/v1/documents/hr/templates/:id/publish](#103-post-apiv1documentshrtemplatesidpublish)
  - [104. POST /api/v1/documents/hr/templates/:id/replace](#104-post-apiv1documentshrtemplatesidreplace)
  - [105. POST /api/v1/documents/hr/templates/:id/archive](#105-post-apiv1documentshrtemplatesidarchive)
  - [106. DELETE /api/v1/documents/hr/templates/:id](#106-delete-apiv1documentshrtemplatesid)
  - [107. GET /api/v1/documents/hr/templates](#107-get-apiv1documentshrtemplates)
  - [108. GET /api/v1/documents/hr/templates/:id](#108-get-apiv1documentshrtemplatesid)
  - [109. GET /api/v1/documents/hr/templates/:id/versions](#109-get-apiv1documentshrtemplatesidversions)
  - [110. GET /api/v1/documents/hr/templates/:id/download-url](#110-get-apiv1documentshrtemplatesiddownload-url)
- [3. Employee Template Self-Service APIs (#111–#112)](#3-employee-template-self-service-apis-111112)
  - [111. GET /api/v1/documents/templates](#111-get-apiv1documentstemplates)
  - [112. GET /api/v1/documents/templates/:id/download-url](#112-get-apiv1documentstemplatesiddownload-url)
- [4. HR Metadata Search, Reports & Egress Ledger APIs (#113–#121)](#4-hr-metadata-search-reports--egress-ledger-apis-113121)
  - [113. GET /api/v1/documents/hr/documents/search](#113-get-apiv1documentshrdocumentssearch)
  - [114. GET /api/v1/documents/hr/documents/search.csv](#114-get-apiv1documentshrdocumentssearchcsv)
  - [115. GET /api/v1/documents/hr/reports/missing-mandatory](#115-get-apiv1documentshrreportsmissing-mandatory)
  - [116. GET /api/v1/documents/hr/reports/missing-mandatory.csv](#116-get-apiv1documentshrreportsmissing-mandatorycsv)
  - [117. GET /api/v1/documents/hr/reports/expiring](#117-get-apiv1documentshrreportsexpiring)
  - [118. GET /api/v1/documents/hr/reports/expiring.csv](#118-get-apiv1documentshrreportsexpiringcsv)
  - [119. GET /api/v1/documents/hr/exports](#119-get-apiv1documentshrexports)
  - [120. GET /api/v1/documents/hr/exports/:id](#120-get-apiv1documentshrexportsid)
  - [121. PATCH /api/v1/documents/hr/documents/:id/tags](#121-patch-apiv1documentshrdocumentsidtags)
- [5. HR Offboarding & Exit Pack APIs (#122–#125, #129)](#5-hr-offboarding--exit-pack-apis-122125-129)
  - [122. POST /api/v1/documents/hr/employees/:userId/offboard-documents](#122-post-apiv1documentshremployeesuseridoffboard-documents)
  - [123. GET /api/v1/documents/hr/employees/:userId/exit-pack](#123-get-apiv1documentshremployeesuseridexit-pack)
  - [124. GET /api/v1/documents/hr/employees/:userId/exit-pack.csv](#124-get-apiv1documentshremployeesuseridexit-packcsv)
  - [125. POST /api/v1/documents/hr/jobs/offboarding-archive/run](#125-post-apiv1documentshrjobsoffboarding-archiverun)
  - [129. POST /api/v1/documents/hr/jobs/publish-materialisation/run](#129-post-apiv1documentshrjobspublish-materialisationrun)
- [6. Employee Unified Composed Portfolio View (#126)](#6-employee-unified-composed-portfolio-view-126)
  - [126. GET /api/v1/documents/me/documents/all](#126-get-apiv1documentsmedocumentsall)
- [7. HR Async Materialisation Progress Inspection (#127)](#7-hr-async-materialisation-progress-inspection-127)
  - [127. GET /api/v1/documents/hr/org-documents/:id/materialisation](#127-get-apiv1documentshrorg-documentsidmaterialisation)
- [8. Audience-Neutral Leave Attachment Bridge View URL (#128)](#8-audience-neutral-leave-attachment-bridge-view-url-128)
  - [128. GET /api/v1/documents/attachments/:id/view-url](#128-get-apiv1documentsattachmentsidview-url)
- [9. Existing Endpoints Modified / Extended by Phase 5](#9-existing-endpoints-modified--extended-by-phase-5)
- [10. Background Crons & Internal Hooks](#10-background-crons--internal-hooks)
- [11. Security, Tenancy & Production Verification](#11-security-tenancy--production-verification)
- [12. Complete Error Code Catalog](#12-complete-error-code-catalog)

---

## 1. Domain Overview & Architectural Mechanics

### 1.1 Template Lifecycle & Version Chain

Templates (`document_templates`) serve as organization-wide reference forms (blank declarations, medical certificates, policy templates) published by HR for employee self-service download. They hold no employee data.

```text
         ┌────────┐      replace      ┌────────┐
         │ draft  │ ◄──────────────── │(new ver)│
         └───┬────┘                   └────────┘
    publish  │
             ▼
        ┌───────────┐  replace→publish  ┌────────────┐
        │ published │ ─────────────────►│ superseded │  [prior version]
        └────┬──────┘                   └────────────┘
     archive │
             ▼
        ┌──────────┐
        │ archived │   (S3 file retained; hidden from non-HR)
        └──────────┘
```

#### Core Lifecycle Invariants:
1. **One Published Version per Group (B-2):** `template_group_id` (a random UUID minted on draft creation) ties all versions together. Partial unique index `document_templates_org_published_uq` on `(org_id, template_group_id) WHERE status='published' AND deleted_at IS NULL` enforces that at most one active version is published per group.
2. **Demote-Before-Promote Publish Ordering:** Because PostgreSQL partial unique indexes evaluate per statement, publish transactions execute an advisory transaction lock on `template_group_id`, demote the existing published row to `superseded` **first**, and promote the target draft to `published` **second**.
3. **Draft Exclusivity (B-6):** Attempting to open a new version (`replace`) while an unpublished draft already exists in that group is refused with `409 TEMPLATE_DRAFT_EXISTS`. Version numbers are strictly monotonically increasing (`MAX(version) + 1`).
4. **Draft-Only Deletion:** Soft-deletion (`DELETE #106`) is strictly restricted to drafts. Published or archived templates cannot be deleted (`422 TEMPLATE_NOT_DELETABLE`); they must be archived to preserve historical auditability.

---

### 1.2 Cross-Repository Metadata Search & Tags Engine

The search engine (`document_report.service.search`) provides HR with unified search across employee-owned documents.
- **SQL-First Query Execution:** Pushes all filter criteria (`q` title prefix, `type_id`, `user_id`, `department_id`, `status`, `tags` array overlap, and date bounds) into a single SQL query before `LIMIT`.
- **GIN-Indexed Tags:** `tags` is stored as a Postgres array (`VARCHAR[]`) supported by a GIN index. Updating tags (`PATCH #121`) replaces the whole array with normalized strings (lowercase, alphanumeric with hyphens/underscores/spaces, max 10 tags, max 64 chars each) and logs old and new states in `document_audit_logs`.
- **Data Minimization in Bulk Results:** Search results omit sensitive metadata: `document_number` (even masked), `storage_key`, and `reference_url` are never disclosed in search arrays.

---

### 1.3 Compliance Reporting & Data-Egress Ledger

Two compliance engines provide real-time organizational oversight:
1. **Missing Mandatory Documents Report:** Evaluates the organization's workforce against active mandatory document types using `documentChecklistService.forUsers` in chunks of 100. Aggregates company-wide completeness percentage and departmental breakdowns.
2. **Expiring Documents Report:** Groups documents expiring within a user-defined horizon (1–365 days) into six strict IST-anchored buckets: `expired`, `due_7`, `due_30`, `due_60`, `due_90`, and `later`.
3. **Data-Egress Ledger (`document_export_jobs`):** Every CSV download and exit pack export executes through the ledger. A transaction inserts a `started` record before any bytes leave. If the ledger write fails, the export halts with `503 EXPORT_LEDGER_UNAVAILABLE`. The ledger retains export metadata (filters, row count, byte count, requester IP) without exposing PII.

---

### 1.4 Offboarding Unwind & Exit Pack Generation

When an employee departs the organization, `document_offboarding.service.archiveForUser` performs an atomic, idempotent unwinding under an advisory transaction lock:
1. **Archive Employee Documents:** In `archive` mode (default), transitions all `available` and `expired` employee documents to `archived`.
2. **Waive Recipient Obligations:** Waives all open org document acknowledgements (`pending` or `viewed`) with `waived_reason = 'employee_offboarded'`. Signed or acknowledged documents are never modified.
3. **Cancel Document Requests:** Cancels all open and overdue document requests.
4. **Skip Queued Notifications:** Marks all pending or failed notification outbox entries as `skipped` to prevent reminder emails from dispatching to departed personnel.
5. **Exit Pack Generation:** Produces a consolidated manifest of active and archived records. In JSON mode (#123), short-TTL signed URLs (`min(ttl, 900s)`) are issued per document. In CSV mode (#124), URLs are omitted to prevent long-lived bearer tokens from persisting in local file downloads.

---

### 1.5 Unified Composed Employee Portfolio

API #126 (`GET /api/v1/documents/me/documents/all`) aggregates four independently degradable sections for the authenticated employee:
1. `my_documents`: Personal uploaded documents.
2. `org_documents`: Organization policies, handbooks, and notices addressed to the employee.
3. `templates`: Published blank forms available for download.
4. `payroll`: Payslips and Form 16 tax summaries (delegated read-only to Payroll module when `payroll.access` is entitled).

**Key Performance Pattern:** The composed view returns standard API route paths (`access.path`) rather than presigned S3 URLs. A dashboard listing 60 items incurs 0 AWS STS signing calls and 0 audit log entries during render; audit logging occurs only when the employee clicks to open a specific document.

---

### 1.6 Asynchronous Recipient Materialisation Engine

When publishing an organization document (#47) whose target audience exceeds `document_publish_sync_threshold` (#79, default 20,000):
1. The endpoint immediately marks the document `published` and freezes the recipient criteria into a JSON snapshot.
2. It inserts the initial 5,000 recipients in the request transaction and returns **`202 Accepted`** with a polling URL (#127).
3. Background cron `document_publish_materialiser.cron.js` (running every 5 minutes IST) processes pending documents in chunks of 5,000 using `INSERT ... ON CONFLICT DO NOTHING` against existing recipient IDs until `materialisation_state = 'complete'`.
4. Mid-flight crashes leave the document in `pending`, allowing the next cron tick or server restart (`runStartupCatchUp`) to safely resume without duplicating recipients.

---

### 1.7 Real-Time On-Join Recipient Top-Up Hook

When an invited employee accepts an organization invitation (`invitation.service.js::acceptInvitation`), a post-commit hook executes `documentRecipientService.topUpForUser`.
- Evaluates all active, published organization documents matching the user's role, department, designation, and employment type.
- Materializes `org_document_recipients` rows with `due_on` calculated relative to their join date.
- The hook runs inside a non-blocking `try/catch` block, ensuring that invitation acceptance never fails due to document operations.

---

### 1.8 Leave Attachment Cross-Module Bridge

Employees applying for medical or statutory leave can reference a document ID directly:
1. Leave validator allows optional `document_id: Joi.string().uuid()`.
2. When supplied, `leave_application.service.js` resolves the ID through `documentReadService.resolveForLeaveAttachment`, ensuring the document belongs to the applicant and is in `available` or `pending_verification` status.
3. The leave record stores an audience-neutral relative path: `/api/v1/documents/attachments/:id/view-url`.
4. Endpoint #128 resolves the caller's identity at view time (applicant `self`, approving `manager`, or `hr`), enforces permission rules, and generates a short-lived presigned URL or redirects via HTTP 302.

---

### 1.9 Database Schemas, Alterations & Migration 00054

Migration `00054-create-document-templates-and-exports.js` introduces two new tables and extends existing models:

#### 1. `document_templates` Table (New)
| Column | Type | Constraints / Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key, default random UUID |
| `org_id` | `UUID` | Foreign Key `organizations.id`, NOT NULL |
| `template_group_id` | `UUID` | Version chain grouping identifier, NOT NULL |
| `version` | `INTEGER` | Monotonically increasing version number, default 1 |
| `status` | `ENUM` | `'draft'`, `'published'`, `'superseded'`, `'archived'` |
| `document_type_id` | `UUID` | Nullable FK `document_types.id` |
| `title` | `VARCHAR(255)` | Template title, NOT NULL |
| `description` | `TEXT` | Optional description |
| `is_employee_visible` | `BOOLEAN` | Controls self-plane catalog visibility, default true |
| `storage_backend` | `ENUM` | `'s3'`, `'reference'`, default `'s3'` |
| `storage_key` | `VARCHAR(512)` | S3 object key (never exposed in API) |
| `reference_url` | `VARCHAR(2048)` | HTTPS external reference URL |
| `file_name` | `VARCHAR(255)` | Sanitized file name |
| `content_type` | `VARCHAR(255)` | MIME type |
| `size_bytes` | `BIGINT` | File size in bytes |
| `checksum_sha256` | `VARCHAR(64)` | SHA-256 digest verified at confirm |
| `confirmed_at` | `TIMESTAMP` | S3 HeadObject verification timestamp |
| `published_by` | `UUID` | User ID of publishing HR actor |
| `published_at` | `TIMESTAMP` | Publication timestamp |
| `superseded_at` | `TIMESTAMP` | Timestamp when replaced by newer version |
| `supersedes_id` | `UUID` | ID of immediate predecessor version |
| `archived_by` | `UUID` | User ID of archiving HR actor |
| `archived_at` | `TIMESTAMP` | Archival timestamp |
| `download_count` | `INTEGER` | Atomic download counter, default 0 |
| `created_at` / `updated_at` | `TIMESTAMP` | Standard Sequelize timestamps |
| `deleted_at` | `TIMESTAMP` | Paranoid soft-deletion timestamp |

**Indexes:**
- Partial unique index: `CREATE UNIQUE INDEX document_templates_org_published_uq ON document_templates (org_id, template_group_id) WHERE status = 'published' AND deleted_at IS NULL`
- Group lookup index: `CREATE INDEX document_templates_group_idx ON document_templates (org_id, template_group_id, version DESC)`

#### 2. `document_export_jobs` Table (New)
| Column | Type | Constraints / Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key, default random UUID |
| `org_id` | `UUID` | Foreign Key `organizations.id`, NOT NULL |
| `export_type` | `ENUM` | `'search'`, `'missing_mandatory'`, `'expiring'`, `'compliance'`, `'exit_pack'` |
| `format` | `ENUM` | `'csv'`, `'json'` |
| `scope` | `ENUM` | `'org'`, `'self'` |
| `status` | `ENUM` | `'started'`, `'completed'`, `'failed'` |
| `filters` | `JSONB` | Query filters applied (IDs, bounds, enums only; no PII) |
| `subject_user_id` | `UUID` | Optional target user ID (for exit packs) |
| `requested_by` | `UUID` | User ID of requesting actor |
| `row_count` | `INTEGER` | Number of rows written |
| `byte_count` | `BIGINT` | Byte length of payload |
| `failure_reason` | `TEXT` | Error message if status is failed |
| `started_at` / `completed_at` | `TIMESTAMP` | Execution timing |
| `ip_address` / `request_id` | `VARCHAR` | Forensic audit metadata |

#### 3. Alterations to Existing Tables
- **`employee_documents`:** Added `tags VARCHAR[] DEFAULT '{}'` with GIN index `employee_documents_tags_gin` and title pattern index `employee_documents_lower_title_idx`.
- **`org_documents`:** Added `materialisation_state VARCHAR(32) DEFAULT 'not_required'`, `recipient_target_count INTEGER`, and `materialised_at TIMESTAMP`.
- **`document_settings`:** Added Setting #79 (`document_publish_sync_threshold`, default 20,000), Setting #80 (`document_offboarding_archive_mode`, default `'archive'`), and Setting #81 (`document_offboarding_exit_pack_scope`, default `'all'`).

---

## 2. HR Template Lifecycle APIs (#99–#110)

Templates represent organization-owned blank reference documents and statutory forms (e.g., standard nondisclosure agreements, provident fund declarations, medical reimbursement claim sheets, travel expense claims). They contain **zero employee PII** and carry **no hierarchy scoping**.

Every HR template API is restricted to users with the `hr` role and entitled with the `documents.access` feature flag.

---

### 99. POST /api/v1/documents/hr/templates

#### Identity & Purpose
- **API Number:** 99
- **Name:** Create Template Draft
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/templates`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Mints a new template group and initial version (version 1) in `draft` status. Generates an S3 presigned `PUT` upload URL when `storage_backend = 's3'`.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Role `hr` required
- **Feature Entitlement:** `documents.access` required
- **Tenant Isolation:** Automatically scoped to `req.user.orgId`

#### Request Contract
- **Headers:**
  - `Authorization: Bearer <token>` (Required)
  - `Content-Type: application/json` (Required)
  - `X-Request-Id: <uuid>` (Optional)
- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body (JSON):**
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

#### Field-Level Request Specification
| Field Name | Type | Required / Optional | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `title` | `String` | **Required** | No | None | Min 1, Max 255 chars. Trimmed. |
| `description` | `String` | Optional | Yes | `null` | Max 2000 chars. Trimmed. |
| `document_type_id` | `UUID` | Optional | Yes | `null` | FK to active `document_types.id`. If provided, type must be active. |
| `storage_backend` | `Enum` | Optional | No | `'s3'` | Valid values: `'s3'`, `'reference'`. |
| `file_name` | `String` | Optional | Yes | `null` | Max 255 chars. Valid only when backend is `s3`. |
| `content_type` | `String` | Optional | Yes | `null` | Max 255 chars. MIME type checked against policy. |
| `size_bytes` | `Integer` | Optional | Yes | `null` | Min 0. File size in bytes checked against policy. |
| `reference_url` | `String` | Optional | Yes | `null` | Max 2048 chars. Must be safe `https://` URI if backend is `reference`. |
| `is_employee_visible` | `Boolean` | Optional | No | `true` | Controls self-plane catalog discovery. |

#### Processing & Business Logic
1. **Validation & State Setup:** Rejects unknown body keys. When `storage_backend = 's3'`, validates that AWS S3 is configured.
2. **Type Policy Check:** If `document_type_id` is provided, checks that it exists in the organization and is active (`is_active = true`). Gathers allowed MIME types and max size bounds.
3. **Identifier Generation:** Generates a new random UUID for `template_id` and a distinct random UUID for `template_group_id`.
4. **Storage Key Derivation:** For S3 templates, constructs the key: `orgs/<orgId>/templates/<templateGroupId>/<templateId>/file`.
5. **Database Transaction:** In a single transaction:
   - Inserts `document_templates` row with `status = 'draft'`, `version = 1`, `download_count = 0`.
   - Records audit log entry with action `document_template.created`.
6. **Presigned Upload URL:** For `s3` backend, issues a presigned S3 PUT URL with TTL defined in `document_settings.document_upload_url_ttl_seconds`.

#### Success Response Contract (`201 Created`)
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
      "created_by": "489f9cd6-990d-4911-a84f-060984cc1831",
      "created_at": "2026-09-25T14:30:00.000Z",
      "updated_at": "2026-09-25T14:30:00.000Z",
      "has_file": false
    },
    "upload_url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/templates/c1f7b830-4e3e-4b68-80f0-8c20572e9a25/27685646-6086-44c1-8408-f404ca033f9b/file?X-Amz-Algorithm=...",
    "upload_expires_at": "2026-09-25T14:45:00.000Z",
    "required_headers": {
      "Content-Type": "application/pdf"
    }
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `success` | `Boolean` | No | Always `true` on success. |
| `message` | `String` | No | Status confirmation text: `"Template draft created"`. |
| `data.template.id` | `UUID` | No | Primary key of this template draft version. |
| `data.template.org_id` | `UUID` | No | Organization tenant ID. |
| `data.template.template_group_id` | `UUID` | No | Unique version chain identifier. |
| `data.template.version` | `Integer` | No | Integer version number (`1` on create). |
| `data.template.supersedes_id` | `UUID` | Yes | `null` on initial version creation. |
| `data.template.document_type_id` | `UUID` | Yes | Linked document type ID (or `null` if untyped). |
| `data.template.title` | `String` | No | Template title. |
| `data.template.description` | `String` | Yes | Detailed description. |
| `data.template.status` | `String` | No | Current lifecycle status: `'draft'`. |
| `data.template.storage_backend` | `String` | No | Resolved storage backend: `'s3'` or `'reference'`. |
| `data.template.has_file` | `Boolean` | No | Computed flag: `true` if confirmed in S3 or has reference URL. |
| `data.upload_url` | `String` | Yes | S3 presigned PUT URL (present only for `s3` backend). |
| `data.upload_expires_at` | `ISO Timestamp`| Yes | S3 PUT URL expiration timestamp. |
| `data.required_headers` | `Object` | Yes | HTTP headers that must accompany the client upload PUT. |

#### Error Conditions & Responses
- `400 BAD_REQUEST` / `VALIDATION_ERROR`: Missing `title`, invalid UUID, or unknown body attributes.
- `404 DOCUMENT_TYPE_NOT_FOUND`: The provided `document_type_id` does not exist in the tenant.
- `409 DOCUMENT_TYPE_INACTIVE`: The provided `document_type_id` is deactivated.
- `422 INVALID_REFERENCE_URL`: For `reference` backend, `reference_url` is missing, malformed, or not HTTPS.
- `503 DOCUMENT_STORAGE_UNAVAILABLE`: S3 credentials or bucket configuration is missing.

---

### 100. PATCH /api/v1/documents/hr/templates/:id

#### Identity & Purpose
- **API Number:** 100
- **Name:** Update Template Draft
- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/documents/hr/templates/:id`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Updates metadata on an existing template draft before publication. Edits on published or archived templates are refused.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Role `hr` required
- **Feature Entitlement:** `documents.access` required

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): Target template draft ID.
- **Request Body (JSON):** Requires at least 1 field.
  ```json
  {
    "title": "Medical Expense Reimbursement Form 2026 (Updated)",
    "description": "Clarified Section 3 claim requirements for day-care treatments.",
    "is_employee_visible": true
  }
  ```

#### Field-Level Request Specification
| Field Name | Type | Required / Optional | Constraints & Description |
| :--- | :--- | :--- | :--- |
| `title` | `String` | Optional | Min 1, Max 255 chars. Trimmed. |
| `description` | `String` | Optional | Max 2000 chars. Trimmed. Nullable. |
| `is_employee_visible` | `Boolean` | Optional | Controls visibility in employee self-plane. |
| `file_name` | `String` | Optional | Max 255 chars. Applies only to `s3` backend. |
| `reference_url` | `String` | Optional | Max 2048 chars. Must be safe `https://` URI (applies only to `reference` backend). |

#### Processing & Business Logic
1. **Concurrency Lock:** Obtains an advisory transaction lock on `template_group_id` and loads the template row with `SELECT ... FOR UPDATE`.
2. **State Guard:** Asserts `status = 'draft'`. If the template is `published`, `superseded`, or `archived`, throws `409 TEMPLATE_NOT_DRAFT`.
3. **Backend Field Integrity:** Rejects updates to `file_name` on `reference` backend or `reference_url` on `s3` backend with `409 INVALID_FIELD_FOR_BACKEND`.
4. **Audit Logging:** Records old and new values in `document_audit_logs` under action `document_template.updated`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Template updated",
  "data": {
    "id": "27685646-6086-44c1-8408-f404ca033f9b",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
    "version": 1,
    "supersedes_id": null,
    "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
    "title": "Medical Expense Reimbursement Form 2026 (Updated)",
    "description": "Clarified Section 3 claim requirements for day-care treatments.",
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
    "updated_at": "2026-09-25T14:35:00.000Z"
  }
}
```

#### Error Conditions & Responses
- `404 TEMPLATE_NOT_FOUND`: No template found matching `id` within the tenant.
- `409 TEMPLATE_NOT_DRAFT`: The target template is not in `draft` status.
- `409 INVALID_FIELD_FOR_BACKEND`: Attempting to set `reference_url` on an S3-backed template or `file_name` on reference template.
- `422 INVALID_REFERENCE_URL`: Invalid or insecure reference URL.

---

### 101. POST /api/v1/documents/hr/templates/:id/file-url

#### Identity & Purpose
- **API Number:** 101
- **Name:** Re-Issue Template Upload URL
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/file-url`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Re-issues a fresh S3 presigned `PUT` URL for a draft template if the previous upload URL expired or if file metadata changed.

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): Target template draft ID.
- **Request Body (JSON):**
  ```json
  {
    "file_name": "revised_medical_template.pdf",
    "content_type": "application/pdf",
    "size_bytes": 148500
  }
  ```

#### Processing & Business Logic
1. **Checks:** Asserts S3 is configured, template exists, is in `draft` status, and is `s3` backed.
2. **Policy Verification:** Resolves the effective document type policy and verifies that `content_type` and `size_bytes` are permitted.
3. **Metadata Update:** Updates claimed `file_name`, `content_type`, and `size_bytes` on the draft record under an advisory lock.
4. **URL Generation:** Signs a new S3 PUT URL for the template's permanent object key.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Upload URL issued",
  "data": {
    "template_id": "27685646-6086-44c1-8408-f404ca033f9b",
    "upload_url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/templates/c1f7b830-4e3e-4b68-80f0-8c20572e9a25/27685646-6086-44c1-8408-f404ca033f9b/file?X-Amz-Algorithm=...",
    "upload_expires_at": "2026-09-25T14:50:00.000Z",
    "required_headers": {
      "Content-Type": "application/pdf"
    }
  }
}
```

---

### 102. POST /api/v1/documents/hr/templates/:id/confirm

#### Identity & Purpose
- **API Number:** 102
- **Name:** Confirm Template Upload
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/confirm`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Verifies that the template file binary was successfully uploaded to S3 via `HeadObject`. Locks in confirmed metadata, size, MIME type, and ETag checksum.

#### Processing & Business Logic
1. **Idempotency:** If the draft is already confirmed (`confirmed_at IS NOT NULL`), returns current record immediately.
2. **S3 HeadObject Verification:** Calls S3 `headObject` for `storage_key`. If object does not exist, returns `422 TEMPLATE_FILE_NOT_UPLOADED`.
3. **MIME & Size Enforcement:** Verifies that the S3 object matches the declared content type and does not violate the maximum file size ceiling.
4. **Atomic Commit:** Sets `confirmed_at = NOW()`, `size_bytes = head.contentLength`, `content_type = head.contentType`, `checksum_sha256 = head.etag`.
5. **Audit:** Records `document_template.file_confirmed`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Upload confirmed",
  "data": {
    "id": "27685646-6086-44c1-8408-f404ca033f9b",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
    "version": 1,
    "status": "draft",
    "storage_backend": "s3",
    "has_file": true,
    "file_name": "medical_claim_form_template_2026.pdf",
    "content_type": "application/pdf",
    "size_bytes": 145020,
    "checksum_sha256": "35a8f2780e922754c0e668b556f8f533",
    "confirmed_at": "2026-09-25T14:36:12.450Z",
    "is_employee_visible": true,
    "download_count": 0,
    "updated_at": "2026-09-25T14:36:12.450Z"
  }
}
```

---

### 103. POST /api/v1/documents/hr/templates/:id/publish

#### Identity & Purpose
- **API Number:** 103
- **Name:** Publish Template Draft
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/publish`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Promotes a confirmed template draft to `published` status. If a prior version was published in the same group, demotes the predecessor to `superseded`.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Role `hr` required
- **Feature Entitlement:** `documents.access` required

#### Processing & Architectural Mechanics
1. **Advisory Lock & Draft Verification:** Takes `pg_advisory_xact_lock` on `template_group_id`. Asserts template is in `draft` status.
2. **File Readiness Check:** Asserts that `isPublishable` returns true:
   - For S3 backend: `storage_key` must exist and `confirmed_at` must not be null.
   - For reference backend: `reference_url` must be populated.
   - If not satisfied, throws `422 TEMPLATE_FILE_MISSING`.
3. **Demote-Predecessor-FIRST Execution (Load-Bearing):**
   - The PostgreSQL partial unique index `document_templates_org_published_uq` permits at most one row with `status = 'published'` per group.
   - To avoid unique constraint violation, queries the active published predecessor row and sets `status = 'superseded'`, `superseded_at = NOW()`, and audits `document_template.superseded`.
4. **Promote Target Draft:**
   - Computes `version = MAX(group_max, draft.version)`.
   - Sets `status = 'published'`, `supersedes_id = predecessor.id`, `published_by = actorId`, `published_at = NOW()`.
   - Audits `document_template.published`.
5. **Commit:** Commits transaction and releases advisory lock.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Template published",
  "data": {
    "id": "27685646-6086-44c1-8408-f404ca033f9b",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
    "version": 1,
    "supersedes_id": null,
    "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
    "title": "Medical Expense Reimbursement Form 2026",
    "description": "Standard declaration form for employee outpatient claims under policy health insurance.",
    "status": "published",
    "storage_backend": "s3",
    "has_file": true,
    "file_name": "medical_claim_form_template_2026.pdf",
    "content_type": "application/pdf",
    "size_bytes": 145020,
    "checksum_sha256": "35a8f2780e922754c0e668b556f8f533",
    "confirmed_at": "2026-09-25T14:36:12.450Z",
    "published_by": "489f9cd6-990d-4911-a84f-060984cc1831",
    "published_at": "2026-09-25T14:40:00.000Z",
    "is_employee_visible": true,
    "download_count": 0,
    "created_at": "2026-09-25T14:30:00.000Z",
    "updated_at": "2026-09-25T14:40:00.000Z"
  }
}
```

#### Error Conditions & Responses
- `404 TEMPLATE_NOT_FOUND`: Template does not exist.
- `409 TEMPLATE_PUBLISH_CONFLICT`: Race condition triggered duplicate published version.
- `422 TEMPLATE_NOT_DRAFT`: Template is not in `draft` status.
- `422 TEMPLATE_FILE_MISSING`: Draft has not confirmed an S3 upload or lacks a reference URL.

---

### 104. POST /api/v1/documents/hr/templates/:id/replace

#### Identity & Purpose
- **API Number:** 104
- **Name:** Replace Template (Create Next Draft Version)
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/replace`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Initiates a new version for an already published template. Clones settings and metadata into a new draft row with `version = MAX(version) + 1` and links `supersedes_id`.

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): ID of the currently `published` template.
- **Request Body (JSON):** Optional overrides.
  ```json
  {
    "title": "Medical Expense Reimbursement Form 2027",
    "description": "Updated form reflecting revised tax limits for FY 2026-27.",
    "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442"
  }
  ```

#### Processing & Invariants
1. **Replaceable Status Guard:** Asserts target template status is `published`. If `draft` or `archived`, throws `409 TEMPLATE_NOT_REPLACEABLE`.
2. **Draft Exclusivity (B-6):** Checks whether an existing `draft` already exists in this `template_group_id`. If so, aborts with `409 TEMPLATE_DRAFT_EXISTS` and returns the existing draft's ID.
3. **Version Number Calculation:** Queries `MAX(version)` for the group in the transaction; assigns `newVersion = maxVersion + 1`.
4. **Draft Creation:** Inserts new row with `status = 'draft'`, `supersedes_id = row.id`, and `has_file = false`.
5. **Presigned Upload URL:** Returns presigned S3 PUT URL for the new version's storage key.

#### Success Response Contract (`201 Created`)
```json
{
  "success": true,
  "message": "Template draft version created",
  "data": {
    "template": {
      "id": "7a304e22-e423-421b-8711-92576da9192c",
      "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
      "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
      "version": 2,
      "supersedes_id": "27685646-6086-44c1-8408-f404ca033f9b",
      "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
      "title": "Medical Expense Reimbursement Form 2027",
      "description": "Updated form reflecting revised tax limits for FY 2026-27.",
      "status": "draft",
      "storage_backend": "s3",
      "has_file": false,
      "download_count": 0,
      "is_employee_visible": true,
      "created_at": "2026-09-25T15:00:00.000Z"
    },
    "upload_url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/templates/c1f7b830-4e3e-4b68-80f0-8c20572e9a25/7a304e22-e423-421b-8711-92576da9192c/file?X-Amz-Algorithm=...",
    "upload_expires_at": "2026-09-25T15:15:00.000Z",
    "required_headers": {
      "Content-Type": "application/pdf"
    }
  }
}
```

#### Error Conditions & Responses
- `409 TEMPLATE_NOT_REPLACEABLE`: The source template is not published.
- `409 TEMPLATE_DRAFT_EXISTS`: An in-flight draft already exists in this group.

---

### 105. POST /api/v1/documents/hr/templates/:id/archive

#### Identity & Purpose
- **API Number:** 105
- **Name:** Archive Published Template
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/archive`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Retires a published template from the catalog. Preserves S3 objects and database audit records, but hides the template from non-HR discovery.

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): Target published template ID.
- **Request Body (JSON):** Optional reason.
  ```json
  {
    "reason": "Superseded by online paperless claims module."
  }
  ```

#### Processing Logic
1. **Idempotency:** If template is already `archived`, returns the existing row with 200 OK.
2. **Status Check:** Asserts current status is `published`. If `draft` or `superseded`, throws `409 TEMPLATE_NOT_ARCHIVABLE`.
3. **State Transition:** Updates `status = 'archived'`, `archived_by = actorId`, `archived_at = NOW()`.
4. **Audit:** Records `document_template.archived`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Template archived",
  "data": {
    "id": "27685646-6086-44c1-8408-f404ca033f9b",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "status": "archived",
    "archived_by": "489f9cd6-990d-4911-a84f-060984cc1831",
    "archived_at": "2026-09-25T15:10:00.000Z",
    "has_file": true
  }
}
```

---

### 106. DELETE /api/v1/documents/hr/templates/:id

#### Identity & Purpose
- **API Number:** 106
- **Name:** Delete Template Draft
- **HTTP Method:** `DELETE`
- **Endpoint:** `/api/v1/documents/hr/templates/:id`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Permanently deletes an uncommitted template draft. Published or archived templates cannot be deleted; they must be archived.

#### Processing Logic
1. **Draft Guard:** Asserts status is strictly `draft`. Throws `422 TEMPLATE_NOT_DELETABLE` if template is in any other status.
2. **Soft Delete:** Soft-deletes the database record (`deleted_at = NOW()`).
3. **Orphan Sweep:** Post-transaction, executes best-effort S3 `deleteObject` for `storage_key`. Failure to delete the S3 object is logged and does not fail the API response.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Template draft deleted",
  "data": {
    "id": "7a304e22-e423-421b-8711-92576da9192c",
    "deleted": true
  }
}
```

---

### 107. GET /api/v1/documents/hr/templates

#### Identity & Purpose
- **API Number:** 107
- **Name:** List Templates (HR Plane)
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/templates`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Returns all templates in the organization with multi-status filtering, text search, and pagination.

#### Request Contract
- **Query Parameters:**
  - `status` (`String` or `Array[String]`, Optional): Filter by status (`'draft'`, `'published'`, `'superseded'`, `'archived'`).
  - `type_id` (`UUID`, Optional): Filter by linked `document_type_id`.
  - `q` (`String`, Optional): Search query matched against `title` (prefix/wildcard). Max 200 chars.
  - `limit` (`Integer`, Optional): Rows per page, min 1, max 100, default 50.
  - `offset` (`Integer`, Optional): Pagination offset, min 0, default 0.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "rows": [
      {
        "id": "27685646-6086-44c1-8408-f404ca033f9b",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
        "version": 1,
        "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
        "title": "Medical Expense Reimbursement Form 2026",
        "status": "published",
        "storage_backend": "s3",
        "has_file": true,
        "is_employee_visible": true,
        "download_count": 42,
        "created_at": "2026-09-25T14:30:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### 108. GET /api/v1/documents/hr/templates/:id

#### Identity & Purpose
- **API Number:** 108
- **Name:** Get Template Detail (HR Plane)
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/templates/:id`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Fetches full detail for any template record in the organization.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "27685646-6086-44c1-8408-f404ca033f9b",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
    "version": 1,
    "supersedes_id": null,
    "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
    "title": "Medical Expense Reimbursement Form 2026",
    "description": "Standard declaration form for employee outpatient claims under policy health insurance.",
    "status": "published",
    "storage_backend": "s3",
    "has_file": true,
    "file_name": "medical_claim_form_template_2026.pdf",
    "content_type": "application/pdf",
    "size_bytes": 145020,
    "checksum_sha256": "35a8f2780e922754c0e668b556f8f533",
    "confirmed_at": "2026-09-25T14:36:12.450Z",
    "published_by": "489f9cd6-990d-4911-a84f-060984cc1831",
    "published_at": "2026-09-25T14:40:00.000Z",
    "is_employee_visible": true,
    "download_count": 42,
    "created_at": "2026-09-25T14:30:00.000Z",
    "updated_at": "2026-09-25T14:40:00.000Z"
  }
}
```

---

### 109. GET /api/v1/documents/hr/templates/:id/versions

#### Identity & Purpose
- **API Number:** 109
- **Name:** Get Template Version Chain
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/versions`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Retrieves the entire version chain for the specified template's group, ordered by version descending. Shows draft, published, superseded, and archived history.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "7a304e22-e423-421b-8711-92576da9192c",
      "version": 2,
      "status": "draft",
      "supersedes_id": "27685646-6086-44c1-8408-f404ca033f9b",
      "title": "Medical Expense Reimbursement Form 2027",
      "has_file": false
    },
    {
      "id": "27685646-6086-44c1-8408-f404ca033f9b",
      "version": 1,
      "status": "published",
      "supersedes_id": null,
      "title": "Medical Expense Reimbursement Form 2026",
      "has_file": true
    }
  ]
}
```

---

### 110. GET /api/v1/documents/hr/templates/:id/download-url

#### Identity & Purpose
- **API Number:** 110
- **Name:** Generate HR Template Download URL
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/templates/:id/download-url`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Generates a short-lived S3 signed GET URL with `Content-Disposition: attachment` for an HR user to download any confirmed template file. Bumps the download counter atomically.

#### Processing Logic
1. **Verification:** Template must exist in the tenant and have a confirmed S3 file or reference URL.
2. **Download Header Formation:** Builds S3 presigned URL with `response-content-disposition = attachment; filename="<sanitized_name>"`.
3. **Atomic Counter Bump:** Increments `download_count` in `document_templates` via atomic SQL increment. Swallows errors so counter issues never block download.
4. **Audit:** Records `document_template.downloaded` audit entry asynchronously.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/templates/c1f7b830-4e3e-4b68-80f0-8c20572e9a25/27685646-6086-44c1-8408-f404ca033f9b/file?response-content-disposition=attachment...&X-Amz-Signature=...",
    "expires_at": "2026-09-25T15:15:00.000Z",
    "file_name": "medical_claim_form_template_2026.pdf"
  }
}
```

---

## 3. Employee Template Self-Service APIs (#111–#112)

Published templates represent organizational reference material and blank forms for self-service employee download. They contain **zero employee PII** and carry **no hierarchy scoping** (§1.1, F-1). Every authenticated employee in the tenant has access to the exact same catalog of published, employee-visible templates.

---

### 111. GET /api/v1/documents/templates

#### Identity & Purpose
- **API Number:** 111
- **Name:** Browse Published Templates (Employee Self-Plane)
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/templates`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Enables employees to browse and search active blank forms and statutory templates.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Any authenticated organization member (`employee`, `manager`, or `hr`)
- **Feature Entitlement:** `documents.access` required

#### Request Contract
- **Query Parameters:**
  - `type_id` (`UUID`, Optional): Filter by linked document type.
  - `q` (`String`, Optional): Search filter matched against template title. Max 200 chars.
  - `limit` (`Integer`, Optional): Pagination limit (1–100, default 50).
  - `offset` (`Integer`, Optional): Pagination offset (min 0, default 0).
  *(Note: Non-HR callers cannot specify a `status` query parameter; drafts, superseded, and archived templates are never disclosed).*

#### Processing & Visibility Rules
1. **Query Filtering:** Automatically adds SQL predicate `status = 'published'` and `deleted_at IS NULL`.
2. **Row-Level Screening:** For each candidate row, verifies:
   - `is_employee_visible = true`
   - If tied to a `document_type`, that the type is active (`is_active = true`) and allows employee viewing (`employee_can_view = true`).
3. **Data Minimization:** Response omits internal identifiers like `storage_key` and `confirmed_at`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "rows": [
      {
        "id": "27685646-6086-44c1-8408-f404ca033f9b",
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "template_group_id": "c1f7b830-4e3e-4b68-80f0-8c20572e9a25",
        "version": 1,
        "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
        "title": "Medical Expense Reimbursement Form 2026",
        "description": "Standard declaration form for employee outpatient claims under policy health insurance.",
        "status": "published",
        "storage_backend": "s3",
        "has_file": true,
        "file_name": "medical_claim_form_template_2026.pdf",
        "content_type": "application/pdf",
        "size_bytes": 145020,
        "is_employee_visible": true,
        "download_count": 42,
        "created_at": "2026-09-25T14:30:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### 112. GET /api/v1/documents/templates/:id/download-url

#### Identity & Purpose
- **API Number:** 112
- **Name:** Get Template Download URL (Employee Self-Plane)
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/templates/:id/download-url`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Issues an S3 presigned GET URL for an employee to download a published template blank form.

#### Authentication & Security Enforcement
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Any authenticated tenant member
- **Uniform 404 Behavior:** If the template does not exist, is in `draft` / `superseded` / `archived` status, has `is_employee_visible = false`, or its gating type forbids employee view, returns uniform **`404 TEMPLATE_NOT_FOUND`** (never 403) to prevent status probing.

#### Processing Logic
1. **Lookup & Policy Evaluation:** Loads template row and verifies visibility against employee authority rules.
2. **Download URL Issuance:** Generates presigned URL with `attachment` disposition using the tenant's configured TTL (`document_view_url_ttl_seconds`).
3. **Atomic Metrics & Audit:** Increments `download_count` in the database and records detached audit log `document_template.downloaded`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/templates/c1f7b830-4e3e-4b68-80f0-8c20572e9a25/27685646-6086-44c1-8408-f404ca033f9b/file?response-content-disposition=attachment...&X-Amz-Signature=...",
    "expires_at": "2026-09-25T15:15:00.000Z",
    "file_name": "medical_claim_form_template_2026.pdf"
  }
}
```

#### Error Conditions & Responses
- `404 TEMPLATE_NOT_FOUND`: Template does not exist, is not published, or is hidden by visibility rules.
- `404 TEMPLATE_FILE_MISSING`: Template lacks a confirmed S3 object or reference URL.
- `503 DOCUMENT_STORAGE_UNAVAILABLE`: S3 credentials or signing service unavailable.

---

## 4. HR Metadata Search, Reports & Egress Ledger APIs (#113–#121)

This section covers the enterprise metadata search engine, compliance roll-ups, CSV streaming infrastructure, data-egress ledger, and tag taxonomy management.

All endpoints in this section are restricted to users with the `hr` role and entitled with the `documents.access` feature flag.

---

### 113. GET /api/v1/documents/hr/documents/search

#### Identity & Purpose
- **API Number:** 113
- **Name:** Search Employee Documents Metadata
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/documents/search`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Provides HR with high-performance, cross-repository metadata search over employee-owned documents. Pushes all filter predicates into SQL before `LIMIT`, enforces honest pagination, and guarantees data minimization (omits document numbers and storage keys).

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Role `hr` required
- **Feature Entitlement:** `documents.access` required
- **Scope:** Organization-wide (`org_id`)

#### Request Contract
- **Query Parameters:**
  - `q` (`String`, Optional): Case-insensitive search string matching title (prefix / substring). Max 200 chars.
  - `type_id` (`UUID`, Optional): Filter by `document_types.id`.
  - `user_id` (`UUID`, Optional): Filter by document owner (`users.id`).
  - `department_id` (`UUID`, Optional): Filter by owner's department (`employee_profiles.department_id`).
  - `status` (`String` or `Array[String]`, Optional): Filter by document status. Intersected with visible statuses (`available`, `pending_verification`, `rejected`, `expired`, `archived`). Note: `quarantined` is excluded from bulk search.
  - `tags` (`String` or `Array[String]`, Optional): Filter by tags. Matches documents containing any of the specified tags (array overlap `tags && ARRAY[...]::varchar[]`).
  - `from_issued_on` (`ISO Date YYYY-MM-DD`, Optional): Lower bound for issue date.
  - `to_issued_on` (`ISO Date YYYY-MM-DD`, Optional): Upper bound for issue date.
  - `from_expires_on` (`ISO Date YYYY-MM-DD`, Optional): Lower bound for expiry date.
  - `to_expires_on` (`ISO Date YYYY-MM-DD`, Optional): Upper bound for expiry date.
  - `limit` (`Integer`, Optional): Results per page, min 1, max 100, default 50.
  - `offset` (`Integer`, Optional): Row offset, min 0, default 0. Max deep pagination offset is 10,000.

#### Processing & Architectural Mechanics
1. **SQL Predicate Pushdown (B-7):** Every row-excluding predicate (status, dates, types, department, tags, title) is evaluated in PostgreSQL before the `LIMIT` clause. Paging count and row fetching share the exact same `WHERE` conditions.
2. **Stable Sorting:** Applies `ORDER BY created_at DESC, id DESC` to prevent row hopping or omission during pagination.
3. **GIN Index Tag Search:** Array search executes against the GIN index on `employee_documents.tags`.
4. **Data Minimization:** Response explicitly projects metadata only:
   - `document_number` (raw or masked) is **never** disclosed in search results.
   - `storage_key` and `reference_url` are **never** disclosed.
5. **Defense-in-Depth Screening:** `screenDocument` is executed per candidate row. On the HR plane, it acts as a defensive sanity check and must never drop rows.

#### Success Response Contract (`200 OK`)
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
    "filters": {
      "q": "passport",
      "statuses": ["available"],
      "tags": ["travel"],
      "limit": 50,
      "offset": 0
    }
  }
}
```

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `data.rows[].id` | `UUID` | No | Employee document primary key. |
| `data.rows[].title` | `String` | No | Document title. |
| `data.rows[].document_type` | `Object` | No | Type metadata: `id`, `code`, and `name`. |
| `data.rows[].owner` | `Object` | No | Document owner identity: `user_id`, `name`, `employee_code`, `department_id`. |
| `data.rows[].status` | `String` | No | Document status: `'available'`, `'pending_verification'`, etc. |
| `data.rows[].tags` | `Array[String]`| No | Assigned normalized tags. Empty array if none. |
| `data.rows[].issued_on` | `String` | Yes | Date string `YYYY-MM-DD`. |
| `data.rows[].expires_on` | `String` | Yes | Date string `YYYY-MM-DD`. |
| `data.rows[].is_confidential`| `Boolean`| No | Confidentiality flag. |
| `data.rows[].created_at` | `ISO Timestamp`| No | Creation timestamp. |
| `data.rows[].verified_at`| `ISO Timestamp`| Yes| Verification timestamp (or `null`). |
| `data.total` | `Integer` | No | Total matching rows across the tenant. |

#### Error Conditions & Responses
- `400 BAD_REQUEST`: Invalid date format (`YYYY-MM-DD` required) or invalid UUID filter.
- `422 PAGINATION_TOO_DEEP`: Query offset exceeds 10,000.
- `422 TOO_MANY_TAGS`: More than 10 tags requested in query filter.

---

### 114. GET /api/v1/documents/hr/documents/search.csv

#### Identity & Purpose
- **API Number:** 114
- **Name:** Export Search Results to CSV
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/documents/search.csv`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Streams search results as a formatted CSV attachment. Registers an audit entry in the `document_export_jobs` ledger before transmitting data.

#### Request Contract
- Same query parameters as API #113 (excluding `limit` and `offset`).

#### Processing & Data-Egress Ledger Mechanics (F-3)
1. **Result Volume Guard:** Executes a counting query. If `total > EXPORT_MAX_ROWS` (10,000), halts immediately with `422 EXPORT_TOO_LARGE`.
2. **Ledger Hard Gate:** Calls `exportService.begin` to insert a record in `document_export_jobs` with:
   - `export_type = 'document_search'`
   - `format = 'csv'`
   - `status = 'started'`
   - If the ledger write fails, throws **`503 EXPORT_LEDGER_UNAVAILABLE`** before any byte is streamed.
3. **CSV Building:** Constructs CSV rows based on `SEARCH_CSV_COLUMNS`:
   - `id`, `title`, `document_type_code`, `user_id`, `owner_name`, `employee_code`, `status`, `tags`, `issued_on`, `expires_on`, `created_at`.
   - `document_number` is **strictly omitted** to comply with PII data minimization standards.
4. **Streaming Response:** Emits CSV payload with headers:
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename="document-search-YYYY-MM-DD.csv"`
5. **Post-Send Completion:** After sending the response, asynchronously executes `exportService.complete` with byte count and row count. Errors during completion are logged and swallowed.

#### Success Response Contract (`200 OK`)
```csv
id,title,document_type_code,user_id,owner_name,employee_code,status,tags,issued_on,expires_on,created_at
e42938e1-5129-4e76-8025-502a3a5f7823,Passport Renewal Copy,PASSPORT,489f9cd6-990d-4911-a84f-060984cc1831,Rishi Ganeshe,EMP-00104,available,"travel,compliance-2026",2024-05-10,2034-05-09,2026-09-20T10:15:30.000Z
```

#### Error Conditions & Responses
- `422 EXPORT_TOO_LARGE`: Matches more than 10,000 rows.
- `503 EXPORT_LEDGER_UNAVAILABLE`: Unable to initialize ledger tracking record in database.

---

### 115. GET /api/v1/documents/hr/reports/missing-mandatory

#### Identity & Purpose
- **API Number:** 115
- **Name:** Missing Mandatory Documents Report
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/reports/missing-mandatory`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Real-time compliance audit rolling up workforce adherence to mandatory document requirements. Produces organizational totals, type-level breakdowns, and departmental summaries.

#### Request Contract
- **Query Parameters:**
  - `department_id` (`UUID`, Optional): Filter workforce by department.
  - `employment_type` (`String`, Optional): Filter by employment type (`full_time`, `part_time`, `contract`, `intern`).
  - `document_type_id` (`UUID`, Optional): Restrict audit to a single mandatory document type.
  - `include_employees` (`Boolean`, Optional, default `false`): When `true`, includes a paginated list of non-compliant employees.
  - `employees_limit` (`Integer`, Optional): Employees list page size (1–100, default 50).
  - `employees_offset` (`Integer`, Optional): Employees list offset (min 0, default 0).

#### Processing & Architectural Mechanics
1. **Sequential Roster Chunking:** Pages active employee profiles from `employee_profiles` in chunks of `CHECKLIST_CHUNK` (100) to protect PostgreSQL connection pool from query spikes.
2. **Compliance Classification:** Evaluates each chunk via `documentChecklistService.forUsers` (Phase 4 engine). Satisfying states include `available`, `pending_verification`, and `under_review`.
3. **Full-Roster Roll-Up:** Computes overall compliance percentage:
   $$\text{completeness\_pct} = \text{round}\left(\frac{\text{employees\_complete}}{\text{employees\_total}} \times 100\right)$$
4. **Conditional Incomplete Window:** When `include_employees = true`, returns the requested slice of incomplete employees along with a `has_more` flag.

#### Success Response Contract (`200 OK`)
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
      },
      {
        "document_type_id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
        "name": "Aadhaar Card",
        "required_for": 120,
        "missing_count": 11,
        "open_request_count": 8
      }
    ],
    "by_department": [
      {
        "department_id": "bd22cbe8-0a4d-4a32-b509-6fa700319e87",
        "department_name": "Engineering",
        "employees_total": 45,
        "employees_incomplete": 3
      },
      {
        "department_id": "db42d45c-78ac-45c2-b3b8-cac91ed7195b",
        "department_name": "Sales",
        "employees_total": 75,
        "employees_incomplete": 12
      }
    ],
    "employees": [
      {
        "user_id": "1824cde3-0039-4a96-b6e7-f59ca39b3137",
        "employee_code": "EMP-00188",
        "department_id": "db42d45c-78ac-45c2-b3b8-cac91ed7195b",
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

#### Identity & Purpose
- **API Number:** 116
- **Name:** Export Missing Mandatory Documents Report to CSV
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/reports/missing-mandatory.csv`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Streams all incomplete employee records in the missing mandatory report as a downloadable CSV. Registers export in `document_export_jobs`.

#### Request Contract
- Same query filters as API #115 (`department_id`, `employment_type`, `document_type_id`).

#### Processing & Invariants
1. **Pre-Flight Row Count:** Evaluates non-compliant employee count against `EXPORT_MAX_ROWS` (10,000). Throws `422 EXPORT_TOO_LARGE` before opening a ledger row if exceeded.
2. **Ledger Egress Hard Gate:** Begins export tracking with `export_type = 'missing_mandatory'`. 503 if failed.
3. **CSV Columns:** `MISSING_CSV_COLUMNS` (`user_id`, `employee_code`, `department_name`, `required`, `satisfied`, `completeness_pct`, `missing_types`).
4. **Streaming:** Sets `Content-Disposition: attachment; filename="missing-mandatory-YYYY-MM-DD.csv"`. Completes ledger asynchronously.

#### Success Response Contract (`200 OK`)
```csv
user_id,employee_code,department_name,required,satisfied,completeness_pct,missing_types
1824cde3-0039-4a96-b6e7-f59ca39b3137,EMP-00188,Sales,4,2,50,"Aadhaar Card; Form 11 Declaration"
```

---

### 117. GET /api/v1/documents/hr/reports/expiring

#### Identity & Purpose
- **API Number:** 117
- **Name:** Expiring Documents Compliance Report
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/reports/expiring`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Identifies active documents whose expiration date falls within an upcoming time horizon. Segregates results into six strict time buckets.

#### Request Contract
- **Query Parameters:**
  - `within_days` (`Integer`, Optional, default 30): Target horizon in days. Min 1, Max 365 (`REPORT_MAX_HORIZON_DAYS`).
  - `document_type_id` (`UUID`, Optional): Filter by document type.
  - `department_id` (`UUID`, Optional): Filter by owner's department.
  - `include_expired` (`Boolean`, Optional, default `false`): When `true`, includes already-expired documents.
  - `limit` (`Integer`, Optional): Results page size (1–100, default 100).
  - `offset` (`Integer`, Optional): Offset (min 0, default 0).

#### Processing & Architectural Mechanics
1. **IST Date Anchoring:** Computes `todayIst` using `Asia/Kolkata` timezone. `toIst = todayIst + within_days`. Never uses raw SQL `NOW()`, guaranteeing 100% synchronization with the daily 02:00 IST expiry cron.
2. **Bucket Assignment:** Categorizes each document into:
   - `expired`: `expires_on < todayIst`
   - `due_7`: `0 <= days_remaining <= 7`
   - `due_30`: `8 <= days_remaining <= 30`
   - `due_60`: `31 <= days_remaining <= 60`
   - `due_90`: `61 <= days_remaining <= 90`
   - `later`: `days_remaining > 90`
3. **Status Integrity:** Only queries documents currently stored as `available`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "generated_at": "2026-09-25T15:25:00.000Z",
    "as_of": "2026-09-25",
    "within_days": 30,
    "buckets": {
      "expired": 0,
      "due_7": 1,
      "due_30": 3,
      "due_60": 0,
      "due_90": 0,
      "later": 0
    },
    "rows": [
      {
        "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
        "title": "Medical License Certificate",
        "document_type": {
          "id": "8e3791a2-92b0-466d-9799-a47291a13442",
          "code": "MED_LICENSE",
          "name": "Medical License"
        },
        "owner": {
          "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
          "name": "Rishi Ganeshe",
          "employee_code": "EMP-00104",
          "department_id": "bd22cbe8-0a4d-4a32-b509-6fa700319e87"
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

#### Identity & Purpose
- **API Number:** 118
- **Name:** Export Expiring Documents Report to CSV
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/reports/expiring.csv`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Streams all expiring document records matching the query parameters to a CSV file.

#### Invariants & Execution
- Enforces `EXPORT_MAX_ROWS` (10,000). Throws `422 EXPORT_TOO_LARGE` if exceeded.
- Registers `export_type = 'expiring'` in `document_export_jobs`.
- Streams CSV with columns: `id`, `title`, `document_type_code`, `user_id`, `owner_name`, `employee_code`, `issued_on`, `expires_on`, `days_remaining`, `bucket`, `status`.
- Filename format: `expiring-documents-YYYY-MM-DD.csv`.

---

### 119. GET /api/v1/documents/hr/exports

#### Identity & Purpose
- **API Number:** 119
- **Name:** List Data-Egress Export Jobs
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/exports`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Readout of the data-egress ledger (`document_export_jobs`), providing compliance visibility into every file export generated across the tenant.

#### Request Contract
- **Query Parameters:**
  - `export_type` (`String`, Optional): `'document_search'`, `'missing_mandatory'`, `'expiring'`, `'compliance'`, `'exit_pack'`.
  - `format` (`String`, Optional): `'csv'`, `'json'`.
  - `scope` (`String`, Optional): `'org'`, `'self'`.
  - `status` (`String`, Optional): `'started'`, `'completed'`, `'failed'`.
  - `from` (`ISO Timestamp`, Optional): Lower timestamp bound.
  - `to` (`ISO Timestamp`, Optional): Upper timestamp bound.
  - `page` (`Integer`, Optional, default 1): Page number.
  - `limit` (`Integer`, Optional, default 50, max 100): Page limit.

#### Success Response Contract (`200 OK`)
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
        "filters": {
          "q": "passport",
          "statuses": ["available"],
          "tags": ["travel"]
        },
        "subject_user_id": null,
        "requested_by": "489f9cd6-990d-4911-a84f-060984cc1831",
        "requester_identifier": "hr.lead@hrclouds.in",
        "row_count": 1,
        "byte_count": 245,
        "failure_reason": null,
        "started_at": "2026-09-25T15:21:00.000Z",
        "completed_at": "2026-09-25T15:21:01.000Z",
        "ip_address": "103.212.144.10"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

---

### 120. GET /api/v1/documents/hr/exports/:id

#### Identity & Purpose
- **API Number:** 120
- **Name:** Get Export Job Detail
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/exports/:id`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Fetches audit detail for a specific export operation by ID.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "fa1b8c2e-4e6a-4d2b-9273-cf6a1b023901",
    "export_type": "document_search",
    "format": "csv",
    "scope": "org",
    "status": "completed",
    "filters": {
      "q": "passport",
      "statuses": ["available"]
    },
    "subject_user_id": null,
    "requested_by": "489f9cd6-990d-4911-a84f-060984cc1831",
    "requester_identifier": "hr.lead@hrclouds.in",
    "row_count": 1,
    "byte_count": 245,
    "failure_reason": null,
    "started_at": "2026-09-25T15:21:00.000Z",
    "completed_at": "2026-09-25T15:21:01.000Z",
    "ip_address": "103.212.144.10"
  }
}
```

#### Error Conditions
- `404 EXPORT_NOT_FOUND`: Export job ID not found within the tenant.

---

### 121. PATCH /api/v1/documents/hr/documents/:id/tags

#### Identity & Purpose
- **API Number:** 121
- **Name:** Update Document Tags
- **HTTP Method:** `PATCH`
- **Endpoint:** `/api/v1/documents/hr/documents/:id/tags`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Replaces the tag taxonomy on an employee document with a validated, normalized array.

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): Target `employee_documents.id`.
- **Request Body (JSON):**
  ```json
  {
    "tags": ["travel", "compliance-2026", "audit_cleared"]
  }
  ```

#### Validation & Taxonomy Rules
1. **Replace-Not-Merge:** Overwrites the entire tag set with the provided array.
2. **Tag Limits:** At most `TAGS_MAX_PER_DOCUMENT` (10) tags per document.
3. **Length Restrictions:** Each tag may be at most `TAG_MAX_LEN` (64) characters.
4. **Character Set:** Regex pattern `^[a-z0-9][a-z0-9 _-]*$` (starts with lowercase letter or digit; contains lowercase letters, digits, spaces, underscores, or hyphens).
5. **Normalization:** Automatically trimmed, lowercased, and deduplicated.

#### Processing Logic
1. **Transaction:** In a single transaction under row lock (`FOR UPDATE`):
   - Updates `employee_documents.tags` array column.
   - Records audit log action `document.tags_updated` capturing `oldValues.tags` and `newValues.tags`.
2. **GIN Index Maintenance:** PostgreSQL automatically updates the GIN inverted index `employee_documents_tags_gin`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Tags updated",
  "data": {
    "id": "e42938e1-5129-4e76-8025-502a3a5f7823",
    "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
    "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
    "title": "Passport Renewal Copy",
    "status": "available",
    "tags": ["audit_cleared", "compliance-2026", "travel"],
    "updated_at": "2026-09-25T15:30:00.000Z"
  }
}
```

#### Error Conditions & Responses
- `404 DOCUMENT_NOT_FOUND`: Target document does not exist.
- `422 TAG_TOO_LONG`: A tag exceeds 64 characters.
- `422 TAG_INVALID`: A tag contains uppercase or disallowed symbols.
- `422 TOO_MANY_TAGS`: More than 10 tags supplied.

---

## 5. HR Offboarding & Exit Pack APIs (#122–#125, #129)

Phase 5 introduces automated, atomic, and idempotent document unwinding when an employee departs the organization. This fulfills statutory record-retention requirements, terminates pending reminder obligations, and produces consolidated exit packs.

All offboarding and job trigger endpoints are restricted to HR users (`authorize(['hr'])`) entitled with `documents.access`.

---

### 122. POST /api/v1/documents/hr/employees/:userId/offboard-documents

#### Identity & Purpose
- **API Number:** 122
- **Name:** Offboard Employee Documents
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/employees/:userId/offboard-documents`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Executes the document lifecycle unwinding for a departed or departing employee. Archives employee-owned documents, waives pending organization acknowledgements, cancels open document requests, and purges scheduled notification dispatches.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Role `hr` required
- **Feature Entitlement:** `documents.access` required
- **Tenant Isolation:** Subject user must belong to `req.user.orgId`

#### Request Contract
- **Path Parameters:**
  - `userId` (`UUID`, Required): Target employee's user ID.
- **Query Parameters:**
  - `dry_run` (`Boolean`, Optional, default `false`): When `true`, computes prospective affected row counts without modifying persistent state.
  - `force` (`Boolean`, Optional, default `false`): When `true`, permits executing the offboarding unwind even if the employee's last working day is in the future.
- **Request Body (JSON):** Optional notes.
  ```json
  {
    "reason": "Voluntary resignation; clearance completed."
  }
  ```

#### Processing & Architectural Invariants
1. **Advisory Lock (Per-User):** Executes `pg_advisory_xact_lock(hashtext('document_offboarding:<orgId>:<userId>'))` inside the transaction. Concurrent calls queue up safely.
2. **Exit Trigger & Date Verification:**
   - Queries `employee_exits` table (if present in the database) and checks user active status.
   - If last working day is in the future and `force = false`, rolls back and returns **`422 EXIT_DATE_IN_FUTURE`** with the employee's `effective_on` date.
   - If employee has no exit record and is active in the company, rolls back and returns **`422 NOT_OFFBOARDING`**.
3. **Offboarding Archive Mode (Setting #80):** Consults `document_offboarding_archive_mode` (`'archive'` or `'retain'`, default `'archive'`).
4. **Dry-Run Execution:** If `dry_run = true`, queries count of archivable documents, waivable recipients, and open requests, then issues an atomic rollback and returns preview counts.
5. **Atomic Unwind Pipeline (Live Mode):**
   - **Step 1 — Archive Documents:** Updates all `available` and `expired` employee documents to `archived` status (`statuses = ['available', 'expired']`).
   - **Step 2 — Waive Acknowledgement Obligations:** Updates open recipient records (`pending` or `viewed` only) to `waived` with `waived_reason = 'employee_offboarded'`. Documents already signed or acknowledged are **never** altered.
   - **Step 3 — Cancel Requests:** Transitions all `open` and `overdue` document requests to `cancelled`.
   - **Step 4 — Stop Notifications:** Transitions all `pending` and `failed` notification outbox rows for this user to `skipped` with `reason = 'recipient_offboarded'` to ensure no automated emails reach departed personnel.
   - **Step 5 — Auditing:** Records audit entries with action `document.bulk_archived`, `org_document.recipients_waived`, and `document_request.bulk_cancelled` with sampled ID arrays (capped at 50 IDs).
6. **Idempotency Guarantee:** A second execution on the same user executes cleanly, discovers 0 remaining rows to transition, creates 0 audit rows, and returns zero counts.

#### Success Response Contract (`200 OK`)
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

#### Field-Level Response Specification
| Field Path | Type | Description |
| :--- | :--- | :--- |
| `data.trigger` | `String` | Resolved trigger: `'exit'` (formal exit row) or `'membership_removed'`. |
| `data.mode` | `String` | Archive mode applied: `'archive'` or `'retain'`. |
| `data.archived_count` | `Integer` | Number of employee documents transitioned to `archived`. |
| `data.waived_count` | `Integer` | Number of pending org document acknowledgements waived. |
| `data.cancelled_count` | `Integer` | Number of open document requests cancelled. |
| `data.notifications_skipped`| `Integer`| Number of queued notification emails cancelled. |

#### Error Conditions & Responses
- `403 FORBIDDEN`: Target `userId` does not belong to the caller's organization.
- `422 EXIT_DATE_IN_FUTURE`: Employee exit date has not arrived yet (provide `force=true` to override).
- `422 NOT_OFFBOARDING`: Employee has no active exit record and is an active organization member.

---

### 123. GET /api/v1/documents/hr/employees/:userId/exit-pack

#### Identity & Purpose
- **API Number:** 123
- **Name:** Generate Employee Exit Document Pack (JSON Manifest)
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/employees/:userId/exit-pack`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Generates a consolidated JSON manifest of all documents associated with an offboarded employee. Issues short-TTL signed download URLs for each accessible item.

#### Request Contract
- **Path Parameters:**
  - `userId` (`UUID`, Required): Target employee user ID.
- **Query Parameters:**
  - `scope` (`String`, Optional): `'all'`, `'employee_owned'`, or `'org_issued'`. Defaults to tenant setting #81 (`document_offboarding_exit_pack_scope`).

#### Processing & Architectural Mechanics
1. **Scope Partitioning:** Gathers employee-owned documents (`available`, `expired`, and `archived`) and organization-issued documents assigned to the user.
2. **Item Count Guard:** If total items exceed `EXIT_PACK_MAX_ITEMS` (500), rejects with `422 EXIT_PACK_TOO_LARGE`.
3. **Data-Egress Ledger Gate:** Opens a tracking record in `document_export_jobs` (`export_type = 'exit_pack'`, `format = 'json'`, `scope = 'self'`).
4. **Presigned URL Signing:** Iterates through each document item and generates a presigned S3 download URL (`Content-Disposition: attachment`).
5. **Item-Level Degradation:** If an S3 object cannot be signed or has been swept, that specific item returns `url: null` and `url_error: 'UNAVAILABLE'` without aborting the exit pack.
6. **Ledger Completion:** Marks the export ledger job `completed` with the total item count.

#### Success Response Contract (`200 OK`)
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
        "document_type_id": "8e3791a2-92b0-466d-9799-a47291a13442",
        "title": "Passport Renewal Copy",
        "version": 1,
        "status": "archived",
        "file_name": "passport_scan.pdf",
        "issued_on": "2024-05-10",
        "expires_on": "2034-05-09",
        "due_on": null,
        "url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/documents/...?response-content-disposition=attachment...",
        "url_expires_at": "2026-09-25T15:50:00.000Z",
        "url_error": null
      },
      {
        "plane": "org",
        "document_id": "7a304e22-e423-421b-8711-92576da9192c",
        "document_type_id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
        "title": "Non-Disclosure & Confidentiality Agreement",
        "version": 2,
        "status": "waived",
        "file_name": null,
        "issued_on": null,
        "expires_on": null,
        "due_on": "2026-09-15",
        "url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/org-documents/...?response-content-disposition=attachment...",
        "url_expires_at": "2026-09-25T15:50:00.000Z",
        "url_error": null
      }
    ]
  }
}
```

---

### 124. GET /api/v1/documents/hr/employees/:userId/exit-pack.csv

#### Identity & Purpose
- **API Number:** 124
- **Name:** Export Employee Exit Pack Manifest to CSV
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/employees/:userId/exit-pack.csv`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Streams a CSV manifest of the employee's exit pack. Strictly **omits presigned URLs** to prevent persistent bearer tokens from lingering in local spreadsheet downloads.

#### Processing & Security Guard (K-5)
1. **Security Requirement:** Signed S3 URLs are valid for 15 minutes; embedding them in CSV spreadsheets creates security leaks where expired tokens or persistent download URLs are stored insecurely. CSV exports contain **metadata only**.
2. **CSV Columns:** `plane`, `document_id`, `document_type_id`, `title`, `version`, `status`, `issued_on`, `expires_on`, `due_on`.
3. **Ledger Record:** Registers `export_type = 'exit_pack'`, `format = 'csv'`.
4. **Streaming:** Sets `Content-Disposition: attachment; filename="exit-pack-<userId>-YYYY-MM-DD.csv"`.

#### Success Response Contract (`200 OK`)
```csv
plane,document_id,document_type_id,title,version,status,issued_on,expires_on,due_on
employee,e42938e1-5129-4e76-8025-502a3a5f7823,8e3791a2-92b0-466d-9799-a47291a13442,Passport Renewal Copy,1,archived,2024-05-10,2034-05-09,
org,7a304e22-e423-421b-8711-92576da9192c,1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed,Non-Disclosure Agreement,2,waived,,,2026-09-15
```

---

### 125. POST /api/v1/documents/hr/jobs/offboarding-archive/run

#### Identity & Purpose
- **API Number:** 125
- **Name:** Manually Trigger Offboarding Archive Sweeper
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/jobs/offboarding-archive/run`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Manual operator execution of the daily offboarding archive routine scoped to the caller's organization.

#### Processing Logic
1. **Pass A (Completed Exits):** Identifies employees whose exit status is `completed` and whose `last_working_day <= todayIst`. Executes `archiveForUser` on each.
2. **Pass B (Removed Members Backstop):** Identifies inactive or soft-deleted employee profiles who still hold `available` or `expired` documents. Executes `archiveForUser` on each.
3. **Returns Summary:** Reports total processed exits and removed members.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Offboarding archive run complete",
  "data": {
    "ok": true,
    "orgs_scanned": 1,
    "exits": 2,
    "removed": 0,
    "errors": []
  }
}
```

---

### 129. POST /api/v1/documents/hr/jobs/publish-materialisation/run

#### Identity & Purpose
- **API Number:** 129
- **Name:** Manually Trigger Publish Materialisation Worker
- **HTTP Method:** `POST`
- **Endpoint:** `/api/v1/documents/hr/jobs/publish-materialisation/run`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Manually executes a single batch run of the background materialisation worker for organization documents in `materialisation_state = 'pending'` scoped to the caller's organization.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Publish materialisation run complete",
  "data": {
    "ok": true,
    "orgs_scanned": 1,
    "documents": 1,
    "recipients": 5000,
    "errors": []
  }
}
```

---

## 6. Employee Unified Composed Portfolio View (#126)

### 126. GET /api/v1/documents/me/documents/all

#### Identity & Purpose
- **API Number:** 126
- **Name:** Employee Unified Composed Documents Portfolio
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/me/documents/all`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Aggregates all four document surfaces available to an employee into a unified dashboard view: personal uploaded documents, assigned organization policies, downloadable blank templates, and payroll tax/payslip documents.

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Any authenticated employee
- **Feature Entitlement:** `documents.access` required
- **Actor Isolation:** `userId` is derived strictly from the JWT token (`req.user.id`). It cannot be overridden by request parameters.

#### Request Contract
- **Query Parameters:**
  - `sections` (`String`, Optional): Comma-delimited list of sections to return (`my_documents`, `org_documents`, `templates`, `payroll`). If omitted, all four sections are returned.
  - `limit` (`Integer`, Optional, default 50, max 100): Maximum items to return per section.

#### Processing & Architectural Invariants (F-5)
1. **Zero AWS STS Presigning Overhead:**
   - Instead of presigning URLs for 60+ items on a single dashboard load (which would saturate AWS STS rate limits and generate dozens of audit log records for unread documents), each item returns an **`access.path`** API route string.
   - The frontend calls the specific endpoint path only when the employee actually clicks or opens a document.
2. **Graceful Section-Level Degradation:**
   - Each section executes independently inside its own isolated `try/catch` block.
   - If one downstream subsystem fails (e.g., payroll database error), that section degrades to `{ "available": false, "reason": "UNAVAILABLE", "items": [], "has_more": false }` while the remaining sections render with `200 OK`.
3. **Payroll Entitlement Isolation:**
   - The `payroll` section checks `entitlementService.hasFeature(orgId, 'payroll.access')`.
   - If the tenant is not subscribed to the Payroll module, returns `{ "available": false, "reason": "NOT_ENTITLED" }`.
   - The payroll service is loaded via lazy `require()`, ensuring the Documents module operates seamlessly even if the Payroll module is decoupled.

#### Success Response Contract (`200 OK`)
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
            "category": "8e3791a2-92b0-466d-9799-a47291a13442",
            "status": "available",
            "issued_on": "2024-05-10",
            "expires_on": "2034-05-09",
            "requires_action": false,
            "action": null,
            "access": {
              "kind": "document",
              "path": "/api/v1/documents/me/documents/e42938e1-5129-4e76-8025-502a3a5f7823/view-url"
            }
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
            "category": "Company Policies",
            "status": "published",
            "issued_on": "2026-01-01T00:00:00.000Z",
            "expires_on": null,
            "requires_action": true,
            "action": "acknowledge",
            "access": {
              "kind": "org_document",
              "path": "/api/v1/documents/me/hr-documents/7a304e22-e423-421b-8711-92576da9192c/view-url"
            }
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
            "category": "8e3791a2-92b0-466d-9799-a47291a13442",
            "status": "published",
            "issued_on": null,
            "expires_on": null,
            "requires_action": false,
            "action": null,
            "access": {
              "kind": "template",
              "path": "/api/v1/documents/templates/27685646-6086-44c1-8408-f404ca033f9b/download-url"
            }
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
            "category": "payslip",
            "status": "finalized",
            "issued_on": "2026-08",
            "expires_on": null,
            "requires_action": false,
            "action": null,
            "access": {
              "kind": "payroll_payslip",
              "path": "/api/v1/payroll/me/payslips/run-2026-08/pdf"
            }
          }
        ],
        "has_more": false
      }
    },
    "generated_at": "2026-09-25T15:40:00.000Z"
  }
}
```

#### Error Conditions
- `400 INVALID_SECTION`: Unknown section name supplied in `sections` query param.

---

## 7. HR Async Materialisation Progress Inspection (#127)

### 127. GET /api/v1/documents/hr/org-documents/:id/materialisation

#### Identity & Purpose
- **API Number:** 127
- **Name:** Check Document Recipient Materialisation Status
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/hr/org-documents/:id/materialisation`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Polling endpoint for HR to monitor the progress of recipient materialisation when publishing an organization document to an audience that exceeds the synchronous threshold (> 20,000 users).

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Authorization:** Role `hr` required
- **Feature Entitlement:** `documents.access` required

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): Target `org_documents.id`.

#### Success Response Contract (`200 OK`)
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

#### Field-Level Response Specification
| Field Path | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `data.materialisation_state`| `String` | No | Current state: `'not_required'`, `'pending'`, or `'complete'`. |
| `data.recipient_target_count`| `Integer`| Yes | Total target recipients resolved at publish time. |
| `data.materialised_count` | `Integer` | No | Number of recipient rows currently written in database. |
| `data.materialised_at` | `ISO Timestamp`| Yes| Timestamp when materialisation reached `complete`. |
| `data.percent_complete` | `Integer` | No | Percentage of target recipients successfully materialized. |

---

## 8. Audience-Neutral Leave Attachment Bridge View URL (#128)

### 128. GET /api/v1/documents/attachments/:id/view-url

#### Identity & Purpose
- **API Number:** 128
- **Name:** Resolve Attachment View URL (Cross-Module Leave Bridge)
- **HTTP Method:** `GET`
- **Endpoint:** `/api/v1/documents/attachments/:id/view-url`
- **Module:** Documents Module
- **Phase:** Phase 5
- **Purpose:** Audience-neutral view URL allowing a single stored relative URL on a Leave Application record to serve all three reader planes: applicant (`self`), approving supervisor (`manager`), and compliance auditor (`hr`).

#### Authentication & Authorization
- **Authentication:** Required (Bearer JWT)
- **Feature Entitlement:** `documents.access` required
- **Audience Resolution Algorithm (B-13):**
  - If `req.user.role === 'hr'` $\rightarrow$ Evaluates access on `hr` plane.
  - Else if `req.user.id === document.user_id` $\rightarrow$ Evaluates access on `self` plane.
  - Else $\rightarrow$ Resolves accessible reporting subordinates via `hierarchyAccess.getAccessibleUserIds`. If document owner is within the caller's hierarchy, evaluates access on `manager` plane.
  - Otherwise, denies access with uniform **`404 DOCUMENT_NOT_FOUND`** to prevent document existence probing.

#### Request Contract
- **Path Parameters:**
  - `id` (`UUID`, Required): Target employee document ID.
- **Query Parameters:**
  - `redirect` (`Boolean`, Optional, default `false`): When `true`, responds with HTTP `302 Found` directly redirecting the client browser to the signed S3 URL.
  - `disposition` (`String`, Optional, default `'inline'`): `'inline'` or `'attachment'`.

#### Success Response Contract (`200 OK` or `302 Found`)

##### Standard JSON Response (`redirect = false`):
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "view_url": "https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/documents/e42938e1-5129-4e76-8025-502a3a5f7823/file?response-content-disposition=inline...&X-Amz-Signature=...",
    "expires_at": "2026-09-25T15:55:00.000Z"
  }
}
```

##### Direct Browser Link Navigation (`redirect = true`):
```http
HTTP/1.1 302 Found
Location: https://hrms-documents-prod.s3.ap-south-1.amazonaws.com/orgs/b782fd72-493e-415d-8b5b-9194b81d294e/documents/e42938e1-5129-4e76-8025-502a3a5f7823/file?...
```

---

## 9. Existing Endpoints Modified / Extended by Phase 5

### 1. #47 POST /api/v1/documents/hr/org-documents/:id/publish (Async Materialisation Threshold)
- **Change:** Inspects resolved target audience count against `document_settings.document_publish_sync_threshold` (Setting #79, default 20,000).
- **Synchronous Execution (<= 20,000):** Operates identically to Phase 2: inserts all recipients in transaction and returns `200 OK`.
- **Asynchronous Execution (> 20,000):**
  - Marks document `published` and freezes audience targeting criteria.
  - Sets `materialisation_state = 'pending'` and `recipient_target_count = resolved.length`.
  - Materializes the initial slice of 5,000 recipients in the request transaction.
  - Responds with **`202 Accepted`** and polling link to API #127:
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

### 2. #77 GET /api/v1/documents/hr/org-documents/compliance/export (Ledger Registration)
- **Change:** Integrated with `document_export_jobs` ledger (F-3). Opens an `export_type = 'compliance'` job before streaming and records completion upon completion.

### 3. #43, #44, #70 & Employee Document Reads (Tags Support)
- **Change:**
  - Database schema `employee_documents` now includes `tags VARCHAR[] DEFAULT '{}'`.
  - Document read responses across `self`, `manager`, and `hr` planes now include the normalized `tags` array.

### 4. POST /api/v1/leaves (Cross-Module Attachment Validation)
- **Change:**
  - Joi schema in Leave module accepts optional `document_id: Joi.string().uuid()`.
  - Resolves via `documentReadService.resolveForLeaveAttachment`:
    - Asserts document belongs to the leave applicant.
    - Asserts status is evidence-grade (`available` or `pending_verification`).
    - Stores relative path `/api/v1/documents/attachments/:id/view-url` on the leave application row.

---

## 10. Background Crons & Internal Hooks

Phase 5 introduces two dedicated automated background cron jobs, a resilient startup catch-up engine, and two post-commit event hooks.

### 10.1 Cron 1: `document_publish_materialiser.cron.js`
- **Schedule:** `*/5 * * * *` (Every 5 minutes IST)
- **Purpose:** Fills the recipient set of organization documents published above the sync threshold.
- **Batching Bounds:** Max 20 pending documents per org, inserting 5,000 recipients per batch tick.
- **Idempotency:** Uses `INSERT ... ON CONFLICT DO NOTHING` against `org_document_recipients`. Safe against server restarts and worker timeouts.

### 10.2 Cron 2: `document_offboarding_archiver.cron.js`
- **Schedule:** `10 2 * * *` (Daily at 02:10 IST)
- **Timing Rationale:** Runs 10 minutes after the daily 02:00 IST expiry sweeper to ensure documents expiring on an employee's last working day are transitioned to `expired` before being archived.
- **Two-Pass Execution:**
  - **Pass A:** Completed exits whose `last_working_day <= todayIst`.
  - **Pass B:** Inactive / soft-deleted members who still hold `available` or `expired` documents.

### 10.3 Boot Startup Catch-Up Engine (`runStartupCatchUp`)
- **Execution:** Runs 30 seconds after server startup.
- **Scope:** Executes `runExpiryFlip`, `runNotificationDispatch`, and `runPublishMaterialisation`.
- **Guarantees:** If the server was down during a scheduled cron tick, pending materialisations and unsent email dispatches are immediately caught up without waiting for the next cron interval.

### 10.4 Internal Hook 1: Real-Time On-Join Recipient Top-Up
- **Location:** `src/modules/organization/services/invitation.service.js::acceptInvitation`
- **Execution:** Post-commit within a non-blocking `try/catch` block.
- **Behavior:** Queries published org documents matching the joining user's role, department, designation, and employment type, and creates recipient rows with calculated `due_on` dates.

### 10.5 Internal Hook 2: Soft-Delete Employee Offboarding
- **Location:** `src/modules/organization/services/organization.service.js::removeEmployee`
- **Execution:** Post-commit within a non-blocking `try/catch` block.
- **Behavior:** Automatically invokes `documentOffboardingService.archiveForUser`, archiving employee documents and waiving pending acknowledgements immediately upon employee termination.

---

## 11. Security, Tenancy & Production Verification

| Security Domain | Implemented Guarantee | Implementation Mechanism |
| :--- | :--- | :--- |
| **Tenant Isolation** | Zero cross-tenant data access | Every query, advisory lock, and S3 object prefix is strictly bounded by `req.user.orgId`. |
| **PII Protection** | Zero PII in search & exports | `document_number` (raw or masked) and `storage_key` are excluded from bulk search and CSV exports. |
| **Zero Memory Binary Transit** | Server memory protected | File binaries never enter Node.js RAM. S3 presigned PUT/GET URLs are used for all transfers. |
| **Download Egress Ledger** | Unaudited file egress impossible | `document_export_jobs` row is written before the first byte leaves. 503 error if ledger fails. |
| **Race-Condition Safety** | No duplicate published versions | PostgreSQL advisory transaction locks (`pg_advisory_xact_lock`) and partial unique indexes. |
| **Direct Anchor Links** | Safe browser previewing | API #128 supports `?redirect=true`, issuing a 302 redirect to a 15-minute signed S3 URL. |

---

## 12. Complete Error Code Catalog

| HTTP Status | Error Code | Description / Trigger Cause |
| :--- | :--- | :--- |
| `400` | `BAD_REQUEST` / `VALIDATION_ERROR` | Malformed request body, invalid UUID, or invalid date range. |
| `400` | `INVALID_SECTION` | Unknown section name requested in composed portfolio API #126. |
| `403` | `FORBIDDEN` | User lacks role authority or subject employee belongs to another tenant. |
| `404` | `TEMPLATE_NOT_FOUND` | Template does not exist, is in draft/archived status on self plane, or is hidden. |
| `404` | `DOCUMENT_TYPE_NOT_FOUND` | Linked document type does not exist in the tenant. |
| `404` | `DOCUMENT_NOT_FOUND` | Employee document not found or out of caller's hierarchy scope. |
| `404` | `EXPORT_NOT_FOUND` | Export job ID not found. |
| `404` | `TEMPLATE_FILE_MISSING` | Download attempted for template with no confirmed S3 file or reference URL. |
| `409` | `TEMPLATE_NOT_DRAFT` | Attempted edit or confirm on a template that is not in `draft` status. |
| `409` | `TEMPLATE_NOT_REPLACEABLE` | Attempted to replace a template that is not in `published` status. |
| `409` | `TEMPLATE_NOT_ARCHIVABLE` | Attempted to archive a template that is not in `published` status. |
| `409` | `TEMPLATE_DRAFT_EXISTS` | Cannot replace template because an unpublished draft already exists in the group. |
| `409` | `TEMPLATE_PUBLISH_CONFLICT` | Concurrent publish collision for the same template group. |
| `409` | `INVALID_FIELD_FOR_BACKEND` | Provided `file_name` for reference template or `reference_url` for S3 template. |
| `409` | `DOCUMENT_TYPE_INACTIVE` | Linked document type is deactivated. |
| `422` | `TEMPLATE_NOT_DELETABLE` | Cannot delete a published or archived template (only drafts may be deleted). |
| `422` | `TEMPLATE_FILE_NOT_UPLOADED` | S3 HeadObject failed; file was not uploaded to S3 bucket. |
| `422` | `DOCUMENT_VERIFICATION_FAILED` | Uploaded S3 object MIME type or size does not match claimed metadata or policy. |
| `422` | `EXPORT_TOO_LARGE` | Export query matched more than 10,000 rows. Filters must be narrowed. |
| `422` | `EXIT_PACK_TOO_LARGE` | Exit pack contains more than 500 items. Scope must be narrowed. |
| `422` | `EXIT_DATE_IN_FUTURE` | Offboarding attempted before employee last working day (use `force=true` to override). |
| `422` | `NOT_OFFBOARDING` | Employee is an active member with no pending exit. |
| `422` | `TAG_TOO_LONG` | Tag exceeds maximum allowed length of 64 characters. |
| `422` | `TAG_INVALID` | Tag contains uppercase characters or disallowed special symbols. |
| `422` | `TOO_MANY_TAGS` | Document exceeds maximum limit of 10 tags. |
| `422` | `PAGINATION_TOO_DEEP` | Search pagination offset exceeds 10,000. |
| `503` | `DOCUMENT_STORAGE_UNAVAILABLE`| AWS S3 credentials, bucket, or presigning provider is unreachable. |
| `503` | `EXPORT_LEDGER_UNAVAILABLE` | `document_export_jobs` could not record the export job; egress halted. |
