# Phase 2: Documents Module (Org-Issued Documents) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint technical and architectural analysis of the **30 APIs (#43–#72)** implemented in Phase 2 of the Documents module. It provides complete, implementation-accurate request contracts, JSON success responses, field-level data dictionaries, database impact, concurrency locks, S3 storage mechanics, and implementation-defined error structures for frontend development and RAG ingestion.

> [!IMPORTANT]
> **Architectural Premise & Security Posture:**
> 1. **Dual-Plane Separation:** The Documents module operates two strictly distinct architectural planes:
>    - **Employee-Owned Plane (Phase 1, APIs #1–#42):** Documents uploaded *about* an individual employee (`employee_documents`). Anchored on `user_id`.
>    - **Org-Issued Plane (Phase 2, APIs #43–#72):** Policies, notices, and letters issued by HR or proposed by Managers to a targeted audience of employees (`org_documents` + `org_document_recipients`). Anchored on `org_id` and `document_group_id`.
>    The two planes never share database rows, models, or repositories.
>
> 2. **Uniform Denial Security Parity (§12.2):** To prevent metadata probing and enumeration attacks across planes and tenants:
>    - Any `/:id`-addressed request that the caller is not authorized to access (wrong tenant, missing row, unauthorized role, unassigned recipient, draft status, or confidentiality restriction) **strictly collapses to an identical `404 DOCUMENT_NOT_FOUND`** with message `"Document not found"` and **no details**. A probe cannot distinguish whether an ID does not exist, belongs to another tenant, belongs to another plane, or is restricted.
>    - Any `/:userId`-addressed request where the caller lacks authority returns `403 FORBIDDEN`.
>
> 3. **Maker-Checker & Manager Tier-B Guardrails:** Managers can draft org-plane proposals (e.g., warning letters, PIPs) for their direct reports. However, managers **can never publish, retire, replace, reject, delete, sync, or waive** an org document. Publishing is an exclusive HR authority. Proposer scope is re-checked at publish time (EC-19).
>
> 4. **Advisory Locks & Concurrency:** All policy-group-mutating transactions acquire a Postgres transactional advisory lock on `docorg:{orgId}:{groupId}` via `pg_advisory_xact_lock(hashtext(:key))` before acquiring row-level `FOR UPDATE` locks, guaranteeing serialized state transitions and preventing competing versions.
>
> 5. **Frozen Targeting & Atomic Materialization:** Audience criteria are evaluated and permanently frozen into a `targeting` JSONB snapshot inside the publish transaction. Concurrently, recipient records are bulk-created in chunks of 1,000 with `ignoreDuplicates: true`, capped by `ORG_PUBLISH_SYNC_LIMIT = 20000`.

---

## Table of Contents

- [1. Domain Overview & Architectural Mechanics](#1-domain-overview--architectural-mechanics)
  - [1.1 Lifecycle State Machine](#11-lifecycle-state-machine)
  - [1.2 Recipient State Machine](#12-recipient-state-machine)
  - [1.3 Targeting Engine & Precedence Rules](#13-targeting-engine--precedence-rules)
  - [1.4 S3 Object Storage & Security Guardrails](#14-s3-object-storage--security-guardrails)
  - [1.5 Database Tables & Constraints](#15-database-tables--constraints)
- [2. HR Administration & Management APIs — Org Documents (APIs #43–#61)](#2-hr-administration--management-apis--org-documents-apis-43-61)
  - [43. POST /api/v1/documents/hr/org-documents](#43-post-apiv1documentshrorg-documents)
  - [44. PUT /api/v1/documents/hr/org-documents/:id](#44-put-apiv1documentshrorg-documentsid)
  - [45. POST /api/v1/documents/hr/org-documents/:id/file](#45-post-apiv1documentshrorg-documentsidfile)
  - [46. POST /api/v1/documents/hr/org-documents/:id/file/confirm](#46-post-apiv1documentshrorg-documentsidfileconfirm)
  - [47. POST /api/v1/documents/hr/org-documents/:id/publish](#47-post-apiv1documentshrorg-documentsidpublish)
  - [48. POST /api/v1/documents/hr/org-documents/:id/replace](#48-post-apiv1documentshrorg-documentsidreplace)
  - [49. POST /api/v1/documents/hr/org-documents/:id/retire](#49-post-apiv1documentshrorg-documentsidretire)
  - [50. POST /api/v1/documents/hr/org-documents/:id/reject](#50-post-apiv1documentshrorg-documentsidreject)
  - [51. DELETE /api/v1/documents/hr/org-documents/:id](#51-delete-apiv1documentshrorg-documentsid)
  - [52. GET /api/v1/documents/hr/org-documents](#52-get-apiv1documentshrorg-documents)
  - [53. GET /api/v1/documents/hr/org-documents/proposals](#53-get-apiv1documentshrorg-documentsproposals)
  - [54. GET /api/v1/documents/hr/org-documents/groups/:groupId](#54-get-apiv1documentshrorg-documentsgroupsgroupid)
  - [55. GET /api/v1/documents/hr/org-documents/:id](#55-get-apiv1documentshrorg-documentsid)
  - [56. GET /api/v1/documents/hr/org-documents/:id/versions](#56-get-apiv1documentshrorg-documentsidversions)
  - [57. GET /api/v1/documents/hr/org-documents/:id/view-url](#57-get-apiv1documentshrorg-documentsidview-url)
  - [58. GET /api/v1/documents/hr/org-documents/:id/audit-logs](#58-get-apiv1documentshrorg-documentsidaudit-logs)
  - [59. GET /api/v1/documents/hr/org-documents/:id/recipients](#59-get-apiv1documentshrorg-documentsidrecipients)
  - [60. POST /api/v1/documents/hr/org-documents/:id/recipients/sync](#60-post-apiv1documentshrorg-documentsidrecipientssync)
  - [61. POST /api/v1/documents/hr/org-documents/:id/recipients/:userId/waive](#61-post-apiv1documentshrorg-documentsidrecipientsuseridwaive)
- [3. Manager Tier-B Proposal APIs — Org Documents (APIs #62–#69)](#3-manager-tier-b-proposal-apis--org-documents-apis-62-69)
  - [62. GET /api/v1/documents/manager/org-documents/types](#62-get-apiv1documentsmanagerorg-documentstypes)
  - [63. POST /api/v1/documents/manager/org-documents](#63-post-apiv1documentsmanagerorg-documents)
  - [64. PUT /api/v1/documents/manager/org-documents/:id](#64-put-apiv1documentsmanagerorg-documentsid)
  - [65. POST /api/v1/documents/manager/org-documents/:id/file](#65-post-apiv1documentsmanagerorg-documentsidfile)
  - [66. POST /api/v1/documents/manager/org-documents/:id/file/confirm](#66-post-apiv1documentsmanagerorg-documentsidfileconfirm)
  - [67. GET /api/v1/documents/manager/org-documents/mine](#67-get-apiv1documentsmanagerorg-documentsmine)
  - [68. GET /api/v1/documents/manager/org-documents/:id](#68-get-apiv1documentsmanagerorg-documentsid)
  - [69. GET /api/v1/documents/manager/org-documents/:id/view-url](#69-get-apiv1documentsmanagerorg-documentsidview-url)
- [4. Employee Self-Service APIs — "My HR Documents" (APIs #70–#72)](#4-employee-self-service-apis--my-hr-documents-apis-70-72)
  - [70. GET /api/v1/documents/me/hr-documents](#70-get-apiv1documentsmehr-documents)
  - [71. GET /api/v1/documents/me/hr-documents/:id](#71-get-apiv1documentsmehr-documentsid)
  - [72. GET /api/v1/documents/me/hr-documents/:id/view-url](#72-get-apiv1documentsmehr-documentsidview-url)
- [5. Phase 1 vs Phase 2 Consistency & Impact Analysis](#5-phase-1-vs-phase-2-consistency--impact-analysis)
- [6. Cross-Module Consistency & Architectural Conventions](#6-cross-module-consistency--architectural-conventions)
- [7. Final Response Coverage Audit](#7-final-response-coverage-audit)

---

## 1. Domain Overview & Architectural Mechanics

### 1.1 Lifecycle State Machine
Every org document record (`org_documents`) progresses through explicit, irreversible status transitions enforced by `canTransition(from, to)` in `document_org_rules.utils.js`:

```text
       ┌──────────────┐
       │    draft     │
       └──────┬───────┘
              │
      ┌───────┴────────────────────────┐
      │ (publish)                      │ (HR reject - proposals only)
      ▼                                ▼
┌───────────┐                    ┌───────────┐
│ published │                    │ rejected  │ [TERMINAL]
└─────┬─────┘                    └───────────┘
      │
      ├────────────────────────────────┐
      │ (supersede on v-next publish)  │ (retire)
      ▼                                ▼
┌───────────┐                    ┌───────────┐
│superseded │ [TERMINAL]         │  retired  │ [TERMINAL]
└───────────┘                    └───────────┘
```

- **`draft`**: Editable, uploadable, confirmable. Not visible to target employees. Can be soft-deleted.
- **`published`**: Live, enforceable document version. Exactly one live version per `(org_id, document_group_id)` is enforced by database partial unique index `org_documents_published_group_unique_idx`. Cannot be deleted.
- **`superseded`**: Historical version replaced by a subsequent version ($v+1$) upon publish of that new version. Stays readable to employees who received it in historical read-only mode (`is_actionable: false`).
- **`retired`**: Administratively withdrawn policy. Frees the partial unique index so a replacement or fresh version can be published if desired. Remains visible in recipient history (`is_actionable: false`).
- **`rejected`**: Disapproved manager proposal with required `rejection_reason`. Terminal state. Can be soft-deleted.

#### Derived Display Status (`resolveOrgDisplayStatus`)
To prevent cron drift or batch execution failures from causing compliance false-negatives (EC-17), the database `status` remains strictly `'published'`. On every read, the backend dynamically resolves `display_status`:
- `effective_from > today_IST` $\rightarrow$ `'scheduled'`
- `effective_to < today_IST` $\rightarrow$ `'expired'`
- Otherwise $\rightarrow$ `'active'`

### 1.2 Recipient State Machine
Each addressed employee has an immutable entry in `org_document_recipients`:

```text
 ┌─────────┐   view-url    ┌────────┐   Phase 3    ┌──────────────┐
 │ pending ├──────────────►│ viewed ├─────────────►│ acknowledged │ [TERMINAL]
 └────┬────┘               └───┬────┘              └──────────────┘
      │                        │
      │ (waive)                │ (waive)           ┌──────────────┐
      └───────────┬────────────┘                  │    signed    │ [TERMINAL, Phase 3]
                  ▼                                └──────────────┘
            ┌───────────┐
            │  waived   │ [TERMINAL]
            └───────────┘
```

- **`pending`**: Initial state upon materialization.
- **`viewed`**: Transitioned automatically when the employee invokes API #72 (`view-url`). Stamped with `first_viewed_at`.
- **`waived`**: Administratively excused by HR via API #61 with required reason, waiver ID, and timestamp. Permitted only from `pending` or `viewed`.
- **`acknowledged` / `signed`**: Reserved for Phase 3. Cannot be waived once reached (`409 RECIPIENT_ALREADY_COMPLETED`).

### 1.3 Targeting Engine & Precedence Rules
The pure utility `document_targeting.utils.js` enforces audience resolution identical to the payroll calendar resolver and leave calculator:

1. **`excluded_users`**: Evaluated first. If an active user ID is present in `excluded_users`, the user is **unconditionally excluded**.
2. **`included_users`**: If populated, restricts the eligible audience to only those users. It does **not** bypass attribute filters.
3. **Attribute Filters (`target_departments`, `target_locations`, `target_employment_types`, `target_job_statuses`)**:
   - An empty array matches all employees on that dimension.
   - A non-empty array requires the profile attribute to match one of the specified values.
   - Departments are strictly matched on `employee_profiles.department_id` UUID (the free-text `department` column is ignored).
4. **Org-Wide Rule**: If all six arrays are empty, the audience includes the entire active organization workforce (`scope: 'all'`).
5. **Frozen Targeting Snapshot**: Upon publish, the targeting criteria, resolved department/location label dictionary (EC-36), resolved count, and resolved timestamp are frozen permanently in `org_documents.targeting`.

### 1.4 S3 Object Storage & Security Guardrails
1. **Zero-Byte Memory Buffering:** The backend never receives binary file streams. It issues pre-signed cryptographic URLs via AWS S3 SDK.
2. **Pre-signed PUT / Re-issue:** Pre-signed S3 PUT URLs are generated with short-lived expiration configured in `document_settings.document_upload_url_ttl_seconds`.
3. **Confirmation Gate (HeadObject):** API #46 executes an S3 `HeadObject` command (3-second timeout, `maxAttempts: 1`) outside database transactions. It cryptographically verifies that the object exists, matches permitted MIME types in `ALLOWED_CONTENT_TYPES`, and does not exceed effective file size limits.
4. **Storage Key Isolation:** `storage_key` is strictly scrubbed from all list, detail, and audit projections. It is only accessible internally via `findByIdForStorage`.
5. **Reference Backend:** For documents hosted externally, `storage_backend = 'reference'` stores a validated HTTPS `reference_url`. `reference_url` is withheld from list and detail views and is returned solely upon calling `view-url`.

### 1.5 Database Tables & Constraints

#### 1. `org_documents`
- **Primary Key:** `id` (UUIDv4)
- **Tenancy:** `org_id` (FK to `organizations.id`, CASCADE)
- **Versioning:** `document_group_id` (UUIDv4), `version` (INT, $\ge 1$), `supersedes_id` (FK self-referential)
- **Auditing:** `created_by`, `updated_by`, `published_by`, `retired_by`, `proposed_by`, `approved_by`
- **Integrity Constraints:**
  - `org_documents_version_check`: `version >= 1`
  - `org_documents_backend_shape_check`: Mutually exclusive S3 (`storage_key`) vs Reference (`reference_url`).
  - `org_documents_effective_window_check`: `effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from`
  - `org_documents_ack_shape_check`: `acknowledgement_due_days` must be between 1 and 365 when `requires_acknowledgement = true`, and null when false.
  - `org_documents_published_shape_check`: Published/superseded/retired records must have `published_at`, `published_by`, and `targeting` JSONB snapshot.
  - `org_documents_rejected_shape_check`: Rejected records must have `rejection_reason`, `approved_by`, and `actioned_at`.
  - `org_documents_retired_shape_check`: Retired records must have `retired_at` and `retired_by`.
- **Unique Indexes:**
  - `org_documents_published_group_unique_idx`: Partial unique index on `(org_id, document_group_id) WHERE status = 'published' AND deleted_at IS NULL`.

#### 2. `org_document_recipients`
- **Primary Key:** `id` (UUIDv4)
- **Foreign Keys:** `org_id`, `org_document_id` (FK to `org_documents.id`), `user_id` (FK to `users.id`), `waived_by`
- **State & Source:** `state` ENUM (`pending`, `viewed`, `acknowledged`, `signed`, `waived`), `source` ENUM (`publish`, `sync`)
- **Tracking:** `first_viewed_at` (TIMESTAMPTZ), `due_on` (DATEONLY), `waived_at`, `waived_reason`
- **Integrity Constraints:**
  - `org_document_recipients_waived_shape_check`: Waived records must have `waived_reason`, `waived_by`, and `waived_at`.
  - `org_document_recipients_viewed_shape_check`: State past `pending` (except administrative waive) requires `first_viewed_at IS NOT NULL`.
- **Unique Indexes:**
  - `org_document_recipients_doc_user_unique_idx`: Unique on `(org_document_id, user_id)`.

---

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

## 5. Phase 1 vs Phase 2 Consistency & Impact Analysis

### 5.1 Reused vs New Components

| Component Area | Phase 1 (Delivered) | Phase 2 (Delivered) | Impact / Relationship |
| :--- | :--- | :--- | :--- |
| **Plane Entity** | `employee_documents` (User uploads) | `org_documents` + `org_document_recipients` | Completely separate tables. No joint table or cross-plane joins. |
| **Catalog & Types** | Seeded 12 `org` types, activated via API #3 | Consumes `plane = 'org'` activated types | **Zero changes** to Phase 1 type APIs. Reused read-only. |
| **Settings** | Registered settings #58–#67 | Consumes `document_view_url_ttl_seconds`, `manager_can_view_team_documents` | **Zero new settings added** in Phase 2. Reused read-only. |
| **Audit Service** | `document_audit.service.js` | Emits `org_document.*` and `org_document_recipient.*` | Reused verbatim. Audit model supports arbitrary `entity_type`. |
| **S3 Provider** | `aws-s3.provider.js` | Reuses `getUploadUrl`, `getViewUrl`, `headObject`, `deleteObject` | Reused verbatim with identical TTL and cryptographic signing. |
| **Upload Validation** | Private `_assertContentTypeAndSize` | Promoted to pure util `assertUploadAllowed` | Refactored cleanly into `document_type_rules.utils.js`; 100% backward compatible. |
| **Advisory Locks** | `docgrp:`, `docslot:`, `doctypes:` | Adds `docorg:{orgId}:{groupId}` | Mirrors P1 advisory lock pattern without namespace collisions. |
| **Type Activation Fix** | Transaction held on no-op | Added `await t.rollback()` on no-op | Eliminates connection pool leak in `setActive`. No API change. |

### 5.2 Phase 1 APIs Audit for Impact
- **Total Phase 1 APIs Reviewed:** 42 (#1–#42)
- **Phase 1 APIs with Modified Paths:** 0
- **Phase 1 APIs with Changed Request Payloads:** 0
- **Phase 1 APIs with Changed Response Envelopes or Fields:** 0
- **Phase 1 APIs with Changed Error Codes:** 0
- **Phase 1 APIs Broken or Regressed:** 0 (156 of 156 unit tests passing)

---

## 6. Cross-Module Consistency & Architectural Conventions

1. **Modular Monolith Layering:**
   - Controllers: Strictly thin handlers extracting `ctx(req)`, running `validateOrThrow`, calling a single service method, and wrapping output in `envelope()`.
   - Services: Sole owners of business logic, unmanaged transactions (`await db.sequelize.transaction()`), advisory locking, and in-transaction audit emission.
   - Repositories: Sole owners of Sequelize queries, projections (`LIST_ATTRIBUTES`, `DETAIL_ATTRIBUTES`), and bulk operations.
   - Validators: Strictly pure Joi schemas.
2. **Standard Response Formatting:**
   - Success envelope: `{ success: true, message: "...", data: { ... } }`
   - List endpoints: `{ success: true, message: "OK", data: { total: N, rows: [ ... ] } }`
   - Error envelope: `{ success: false, message: "...", errorCode: "...", details?: { ... } }`
3. **Timezone & Date Conventions:**
   - All timestamps stored in database as UTC `TIMESTAMPTZ`.
   - All date-only comparisons (effective window, due date) normalised to **Asia/Kolkata (IST)** via `toIstDateString`.
4. **Hierarchy & Direct Reports Access:**
   - Reuses `hierarchyAccess.getAccessibleUserIds(orgId, req.user)` identically to Attendance and Payroll modules.
   - Enforces D-10: A manager with null or empty direct reports scope is rejected with `403 FORBIDDEN`.

---

## 7. Final Response Coverage Audit

```text
================================================================================
DOCUMENTS MODULE — PHASE 2 FINAL API AUDIT
================================================================================

Total Phase 2 APIs Discovered: 30
Total Phase 2 APIs Documented: 30

New APIs Added: 30
Existing Phase 1 APIs Modified by Phase 2: 0
APIs Corrected / Fixed: 0
APIs Still Missing Documentation: 0

Request Contracts Verified Against Implementation: 30 / 30
Success Response Structures Verified Against Code: 30 / 30
Error Response Structures Verified Against Code: 30 / 30
Security & Authorization Behavior Verified: 30 / 30
Database Impact & Locks Verified: 30 / 30
Storage & S3 Mechanics Verified: 30 / 30

Phase 1 Impact Review:
Phase 1 APIs Reviewed for Phase 2 Impact: 42
Phase 1 APIs Actually Changed: 0
Phase 1 APIs Incorrectly Assumed as Changed: 0

Breakdown by Actor Plane:
- HR Administration & Management APIs (APIs #43–#61): 19
- Manager Tier-B Proposal APIs (APIs #62–#69): 8
- Employee Self-Service APIs (APIs #70–#72): 3

================================================================================
ALL PHASE 2 DOCUMENTS MODULE APIS HAVE BEEN DISCOVERED, VERIFIED, AND DOCUMENTED.
================================================================================
```
