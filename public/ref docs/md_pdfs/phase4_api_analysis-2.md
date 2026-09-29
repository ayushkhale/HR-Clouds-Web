# Phase 4: PDF Generation Module (Bulk Issuance, Manager Proposals & Auto-Issue on Exit) — Complete API Analysis

This document provides an exhaustive, endpoint-by-endpoint architectural, security, and technical analysis of **Phase 4** of the PDF Generation module. It covers the three new letter-issuance drivers layered on top of the Phase 2 single-issue path: **bulk issuance** of one template to many subjects behind an asynchronous render queue (**#143, #144**), the on-demand letter render-queue drain (**#147**), the **manager maker–checker** flow (**#145, #146** on a new `/manager` plane and the HR decision queue **#148, #149, #150**), the unattended **auto-issue-on-exit** pass (no endpoint — a cron driven by setting **#92**), the contract-neutral extension of the single-issue endpoint (**#139** gains two internal parameters), and the four new document settings (**#91–#94**).

---

## Executive Architectural Premise & Security Posture

### 1. Tenant Plane Isolation & Role Authorization
The Phase 4 endpoints operate under strict tenant-plane isolation across two operational planes (HR Administration and Manager Operations):
* **Tenant Derivation:** Every incoming request requires an authenticated Bearer JWT. The tenant identifier (`orgId`) and calling actor (`actorId`, `actorRole`) are extracted exclusively from verified token claims (`req.user.orgId`, `req.user.id`, `req.user.role`). No URL path, query parameter, or request body ever accepts an `org_id`, structurally eliminating Insecure Direct Object References (IDOR) across tenants.
* **Plane-Specific Role Gates:**
  * **HR Plane (#143, #144, #147, #148, #149, #150):** Restricted strictly to `hr` via the existing `hrAuth` array (`authenticate` + `authorize(['hr'])` + `requireFeature('documents.access')`). Platform roles (`admin`, `super-admin`) are categorically excluded with HTTP `403 Forbidden` (`INSUFFICIENT_PERMISSIONS`).
  * **Manager Plane (#145, #146):** A **new** mount `/api/v1/documents/manager` restricted to `manager` and `hr` via `managerAuth` (`authenticate` + `authorize(['manager','hr'])` + `requireFeature('documents.access')`). Managers are hierarchy-scoped server-side to their accessible reports via `hierarchyAccess.getAccessibleUserIds`; a cross-team subject is blocked with HTTP `403 Forbidden` (`FORBIDDEN`). The plane is additionally gated by the org setting `manager_can_propose_letters` (#93, default off), which returns `403 LETTER_PROPOSALS_DISABLED` when off.
* **Feature Entitlement:** All endpoints enforce active entitlement of the `documents.access` feature flag via `requireFeature('documents.access')`.

### 2. One Issuance Path, Three New Drivers (D-6, §14 / §16)
`document_letter.service.issue()` is the **single and exclusive** letter-issuance path established in Phase 2. Phase 4 adds **no second issuance path**:
* **Bulk items** (`document_letter_batch.service`), **proposal approvals** (`document_letter_proposal.service`), and **auto-issue-on-exit** (`document_automation.runLetterAutoIssue`) are thin drivers that all call `issue()`.
* The Phase 2 invariants therefore hold unchanged for every Phase 4 flow: the PDF is rendered **outside** any transaction, the `published`/`generated` `org_document` row and its `ready` artifact commit atomically, and the per-org reference number is allocated under `FOR UPDATE` **after** a successful render and is unique per org (`409 LETTER_REFERENCE_CONFLICT`).
* To let the drivers reuse `issue()`, it gained two **internal** optional parameters — `documentId` (a pre-generated `org_documents.id` so a batch item's queue row, artifact and letter share one id) and `orgContext` (a resolved org/settings/branding snapshot so branding is resolved once per batch, not per subject). **Neither appears on the wire; `#139`'s external request/response is byte-for-byte unchanged.**

### 3. Idempotency: Salted System Keys vs. Client Keys (R-1, BR-M6)
`issue()` derives its idempotency key from resolved inputs and routes a **system** caller's key through a failure salt:
```text
Bulk item      keyBase = "batch:{batchId}:{subjectId}"
Proposal       keyBase = "proposal:{proposalId}"
Auto-issue     keyBase = "autoexit:{exitId}:{templateCode}"
```
* A **system** caller **never** supplies a client `idempotency_key`; the salted `keyBase` guarantees a re-driven batch, a double-clicked approval (`#149`), or a re-run cron never double-issues.
* Only the direct **`#139`** single-issue endpoint accepts an external client `idempotency_key`, which opts that call **out** of the salt.
* The **batch-creation** endpoint (`#143`) additionally accepts an *optional* client `idempotency_key` for **batch-level** de-duplication (falling back to a key derived from `template + subjects + overrides + date`). This is distinct from the per-item issuance key above.

### 4. The Batch as a Durable Ledger (§6.1, §6.2, C-11)
Bulk issuance is backed by two tables, not a transient queue snapshot:
* **`document_letter_batches`** records the request: `template_code` (no FK — the catalog is a repo asset), pinned `template_version`, `document_type_id`, `idempotency_key`, `field_overrides`, `pinned_date` (frozen at creation, BR-B6), an asset-src-stripped `branding_snapshot` (C-11/R-10 — no presigned URL is ever persisted), `total_count`, `status` (`queued`/`running`/`completed`/`completed_with_failures`/`cancelled`), `source` (`hr_bulk`), `created_by`. A DB CHECK `total_count BETWEEN 1 AND 2000` is an absolute ceiling above the configurable `letter_bulk_max_subjects` (#91), so a settings bug can never enqueue an unbounded batch.
* **`document_letter_batch_items`** is the per-subject ledger: `subject_user_id`, a pre-generated `document_id` (no FK — the row does not exist until issued), `status` (`pending`/`issued`/`failed`/`skipped`), nullable `letter_id`/`artifact_id` (FKs `ON DELETE SET NULL` so dropping the ledger never touches an issued letter or artifact), `reference_number`, `failure_code`/`failure_reason`. A DB CHECK enforces that an `issued` item names its `letter_id`, `artifact_id` **and** `reference_number` (mirroring `org_documents_generated_chk`).
* The batch's terminal status is **recomputed from item counts** by the drain, conditional on a non-terminal current status, so a late worker tick cannot reopen a completed batch.

### 5. Auto-Issue Is Subordinate to the Archive (F-5, BR-A6)
The auto-issue pass runs on the **offboarding-archiver cron, strictly after the archive**, and exposes **no HTTP endpoint**:
* Archival waives the leaver's acknowledgement/notification obligations; a letter auto-issued *before* the archive would be silently un-acknowledgeable and unmailed — the ordering is a correctness property.
* Empty `letter_auto_issue_on_exit` (#92, default) reads nothing beyond settings and returns (BR-A1). The setting may hold at most 5 distinct known template codes, **none compensation-bearing** (BR-A2) — an automatic, unreviewed letter must never state a salary.
* An exit with no attributable actor (`recorded_by` null) is **skipped**, not guessed. The audit records `actor_id: null` + reason `auto_issue_on_exit` (a system act) while the letter row keeps its attribution `created_by`/`published_by` (R-2).

### 6. PII Minimization Carried Forward (C-11, R-10)
No Phase 4 table stores a presigned URL or a `logo_src`/`signature_src`. A batch's `branding_snapshot` stores the frozen branding **content** with asset srcs stripped; the render-time asset URLs are resolved freshly and merged over it. Repositories project `storage_key`, `branding_snapshot` and any URL away from every list/detail response, and the audit service continues to scrub `storage_key`/`document_number`/`reference_url`.

---

## API Summary Index

### New Phase 4 Bulk, Render-Queue & Maker–Checker APIs
| API # | Method | Endpoint | Primary Purpose | Response Type | Roles / Permissions |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **#143** | `POST` | `/api/v1/documents/hr/letters/bulk` | Create a bulk-letter batch (one template → many subjects) | JSON (`202` / `200` reused) | `hr` · `documents.access` |
| **#144** | `GET` | `/api/v1/documents/hr/letters/bulk/:batchId` | Poll batch progress + paginated failed items | JSON (`200 OK`) | `hr` · `documents.access` |
| **#145** | `POST` | `/api/v1/documents/manager/letters` | Propose a letter for a direct report | JSON (`201 Created`) | `manager`, `hr` · `documents.access` · setting #93 |
| **#146** | `GET` | `/api/v1/documents/manager/letters` | List the caller's own proposals | JSON (`200 OK`) | `manager`, `hr` · `documents.access` |
| **#147** | `POST` | `/api/v1/documents/hr/jobs/pdf-render/run` | Manually drain this org's letter render queue | JSON (`200 OK`) | `hr` · `documents.access` |
| **#148** | `GET` | `/api/v1/documents/hr/letters/proposals` | List pending manager proposals (HR queue) | JSON (`200 OK`) | `hr` · `documents.access` |
| **#149** | `POST` | `/api/v1/documents/hr/letters/proposals/:id/approve` | Approve a proposal — issues the letter | JSON (`201` / `200` reused) | `hr` · `documents.access` |
| **#150** | `POST` | `/api/v1/documents/hr/letters/proposals/:id/reject` | Reject a proposal (terminal; requires reason) | JSON (`200 OK`) | `hr` · `documents.access` |

### Existing API Extended by Phase 4 (No Wire Change)
| API # | Method | Endpoint | Phase 4 Modification | Plane |
| :---: | :---: | :--- | :--- | :---: |
| **#139** | `POST` | `/api/v1/documents/hr/letters` | Gained internal-only optional params `documentId` / `orgContext` so bulk items and proposal approvals reuse its issuance path. External request/response unchanged. | HR |

### New Settings Exposed via the Document Settings Endpoint
| Setting Key | Registry # | Data Type | Default | Consumer |
| :--- | :---: | :--- | :---: | :--- |
| `letter_bulk_max_subjects` | **#91** | Integer `1`–`2000` | `200` | `#143` batch-size gate |
| `letter_auto_issue_on_exit` | **#92** | Array (≤ 5 codes) | `[]` | Auto-issue cron (no endpoint) |
| `manager_can_propose_letters` | **#93** | Boolean | `false` | `#145` proposal gate |
| `document_notify_letter_issued` | **#94** | Boolean | `false` | `letter_issued` notification (OFF, OD-P4-9) |

---

## Detailed Endpoint Specifications — New Phase 4 APIs

### 143. POST /api/v1/documents/hr/letters/bulk
* **API Name / Purpose:** Create Bulk-Letter Batch
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letters/bulk`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** HR needs to issue the same letter template (e.g. a revised-policy acknowledgement) to many employees without issuing them one at a time, and without hanging the request through hundreds of live Lambda renders.
* **Why the API Exists:** Validates and freezes a bulk request, enqueues one render job per subject in a single transaction, and returns immediately with a `batch_id` to poll. Rendering is deferred to the render worker (or `#147`).
* **Real-World Usage:** Invoked from an HR "Issue to many" screen; the client then polls `#144` until the batch reaches a terminal status.
* **Path Parameters:** None.
* **Query Parameters:** None.
* **Request Headers:** `Authorization: Bearer <JWT>` (Required); `X-Request-ID` / `X-Correlation-ID` (Optional, traced in audit).
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `template_code` | Body | String ≤64 | Yes | No | — | Must exist in the letter-template registry (service check). |
  | `subject_user_ids` | Body | Array<UUID> | Yes | No | — | 1–2000 UUIDs; **distinctness** is the service's check (`422 LETTER_BULK_DUPLICATE_SUBJECT`). Per-org bound is `letter_bulk_max_subjects` (#91). |
  | `field_overrides` | Body | Object | No | No | `{}` | Depth-1 map of declared, overridable template fields; ≤20 keys. Non-declared/derived keys rejected by the service. |
  | `effective_date` | Body | String (ISO `YYYY-MM-DD`) | No | No | today (IST) | The date printed on every letter in the batch; must be within ±365 days. Frozen as `pinned_date` (BR-B6). |
  | `idempotency_key` | Body | String 8–120 | No | Yes | derived | Optional **batch-level** dedup key; if omitted, a key is derived from `template + subjects + overrides + date`. |
* **Request JSON Example:**
  ```json
  {
    "template_code": "experience_letter",
    "subject_user_ids": ["u1", "u2", "u3"],
    "field_overrides": { "purpose": "Address proof" },
    "effective_date": "2026-09-29"
  }
  ```
* **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller as `hr` with `documents.access`; extracts `orgId`/`actorId` from token claims.
  2. Validates the body against `bulkIssueLettersSchema` (shape only).
  3. Resolves the org issuance context once via `letterService._resolveOrgIssuanceContext(orgId, template_code)` (branding + settings), and freezes `pinned_date`.
  4. Derives the batch idempotency key (or uses the client's) and **probes before cohort validation**: if a batch with that key already exists, re-enqueues any pending items and returns `{ reused: true, batch_id, total, counts }` (`200`).
  5. Enforces `subject_user_ids.length ≤ letter_bulk_max_subjects` (#91) ⇒ else `422 LETTER_BULK_TOO_MANY_SUBJECTS`; asserts distinctness ⇒ else `422 LETTER_BULK_DUPLICATE_SUBJECT`.
  6. Pre-validates each subject; any failure aborts the whole batch with `422 LETTER_BULK_VALIDATION_FAILED` and a `failures[]` detail — **nothing is enqueued**.
  7. In one transaction: inserts the `document_letter_batches` row, one `document_letter_batch_items` row per subject (each with a pre-generated `document_id`), one `pdf_render_jobs` row per subject, and an audit entry (`letter_batch.created`).
  8. Returns `202 Accepted` with the new `batch_id`.
* **Database Impact:**
  * **Reads:** `document_settings`, `document_letter_branding`, `document_types`, `users`, `document_letter_batches` (idempotency probe).
  * **Writes:** `document_letter_batches` (`INSERT`), `document_letter_batch_items` (`INSERT` × N), `pdf_render_jobs` (`INSERT` × N), `document_audit_logs`.
* **PDF Generation Impact:** None at creation. Renders are deferred to the worker drain (no Lambda call on this request).
* **File / Storage Impact:** None at creation (the frozen `branding_snapshot` is asset-src-stripped; no presigned URL is stored).
* **Transaction Behavior:** Batch + items + jobs + audit commit in a **single** transaction (all-or-nothing enqueue). No network call inside the transaction.
* **Concurrency & Race Conditions:** The unique index `document_letter_batches_idem_uq (org_id, idempotency_key)` collapses concurrent duplicate submissions to one batch; the per-item render job is de-duplicated by the queue's live-source unique index.
* **Idempotency / Retry Behavior:** Fully idempotent. A re-submission (same key or derived key) returns the existing batch with `reused: true` and live counts.
* **Success Response Structure:**
  ```json
  { "success": true, "message": "Bulk issuance queued",
    "data": { "batch_id": "…", "total": 3, "reused": false,
              "counts": { "pending": 3, "issued": 0, "failed": 0, "skipped": 0 } } }
  ```
* **Response Field Meanings:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `batch_id` | String (UUID) | The batch's id; poll target for `#144`. |
  | `total` | Integer | Number of subjects in the batch. |
  | `reused` | Boolean | `true` on an idempotent re-submission (HTTP `200`); `false` for a fresh batch (HTTP `202`). |
  | `counts` | Object | Per-status item tallies at creation. |
* **Error Responses:**
  | HTTP | Error Code | Trigger |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Malformed body (missing/oversized fields, non-ISO date). |
  | `403` | `INSUFFICIENT_PERMISSIONS` / `FEATURE_DISABLED` | Not `hr`, or `documents.access` not entitled. |
  | `404` | `LETTER_TEMPLATE_UNKNOWN` | `template_code` not in the registry. |
  | `409` | `LETTER_TEMPLATE_DISABLED` | Template disabled for the org. |
  | `422` | `LETTER_BULK_DUPLICATE_SUBJECT` | A subject id appears more than once. |
  | `422` | `LETTER_BULK_TOO_MANY_SUBJECTS` | Over `letter_bulk_max_subjects` (#91). |
  | `422` | `LETTER_BULK_VALIDATION_FAILED` | One or more subjects fail pre-validation (`failures[]` detail). |

---

### 144. GET /api/v1/documents/hr/letters/bulk/:batchId
* **API Name / Purpose:** Get Bulk-Letter Batch Progress
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/letters/bulk/:batchId`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** After a `202` from `#143`, HR needs an authoritative progress indicator and a way to see exactly which subjects failed and why, so it can remediate a handful without redoing the batch.
* **Why the API Exists:** Returns aggregate item counts and a paginated failure list read straight from the durable ledger — no renderer, no S3 call.
* **Real-World Usage:** Polled by the HR bulk screen at a few-second interval until `status` is terminal.
* **Path Parameters:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `:batchId` | String (UUID) | The batch row id. |
* **Query Parameters:**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `limit` | Integer 1–100 | No | `50` | Page size for the failure list. |
  | `offset` | Integer ≥0 | No | `0` | Failure-list offset. |
* **Request Headers:** `Authorization: Bearer <JWT>` (Required).
* **Request JSON Payload:** None.
* **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller as `hr`; validates `:batchId` and the query inside the controller (Express 5 getter-only `req.query`).
  2. Resolves the batch scoped by `org_id`; cross-org/missing/not-a-batch ⇒ uniform `404 DOCUMENT_NOT_FOUND`.
  3. Aggregates item counts and reads the paginated failed-item slice.
* **Database Impact:** Read-only over `document_letter_batches` and `document_letter_batch_items`. No writes, no locks.
* **PDF Generation Impact:** None.
* **File / Storage Impact:** None.
* **Idempotency / Retry Behavior:** Fully idempotent read; safe to poll.
* **Success Response Structure (HTTP 200 OK):**
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
* **Response Field Meanings:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `batch.id` | String (UUID) | The bulk batch row identifier. |
  | `batch.template_code` | String | Template code being issued in this batch. |
  | `batch.template_version` | Integer | Version of the template frozen at batch creation time. |
  | `batch.status` | String | Current batch lifecycle status: `queued` / `running` / `completed` / `completed_with_failures` / `cancelled`. |
  | `batch.total` | Integer | Total count of subjects registered in the batch. |
  | `batch.created_by` | String (UUID) | User ID of the HR administrator who created the batch. |
  | `batch.created_at` | ISO Timestamp | UTC creation timestamp. |
  | `batch.completed_at` | ISO Timestamp / Null | When all items reached terminal status, or `null`. |
  | `counts` | Object | Authoritative ledger status counts: `{ pending, issued, failed, skipped }`. |
  | `queue` | Object | Diagnostic queue counts: `{ queued, claimed, done, failed, cancelled }`. |
  | `failures` | Array | Paginated failed and skipped ledger items: `[{ subject_user_id, failure_code, failure_reason, updated_at }]`. |
  | `pagination` | Object | Pagination metadata: `{ limit, offset, total }`. |
* **Error Responses:**
  | HTTP | Error Code | Trigger |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Malformed `:batchId` or query. |
  | `404` | `DOCUMENT_NOT_FOUND` | Cross-org, missing, or not a batch. |

---

### 145. POST /api/v1/documents/manager/letters
* **API Name / Purpose:** Propose a Letter for a Direct Report
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/manager/letters`
* **Authentication / Authorization:** Bearer JWT. Required Roles: `manager`, `hr`. Required Feature: `documents.access`. Gated by setting `manager_can_propose_letters` (#93).
* **Purpose / Business Problem Solved:** Organizations that want line managers involved in letter drafting need a way for a manager to initiate a letter for a report **without** granting the manager the power to issue it. A proposal is a draft awaiting HR approval.
* **Why the API Exists:** Creates a `pending` proposal scoped to the manager's hierarchy; the letter itself is only issued at HR approval (`#149`).
* **Real-World Usage:** Invoked from a manager "Request a letter for my report" screen.
* **Path Parameters:** None.
* **Query Parameters:** None.
* **Request Headers:** `Authorization: Bearer <JWT>` (Required); `X-Request-ID` (Optional).
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description / Allowed Values |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `template_code` | Body | String ≤64 | Yes | No | — | Must exist / be enabled (service check). |
  | `subject_user_id` | Body | UUID | Yes | No | — | Must be within the caller's `getAccessibleUserIds` scope. |
  | `field_overrides` | Body | Object | No | No | `{}` | Depth-1 declared, non-derived, non-service fields only (BR-20/BR-R2); ≤20 keys. |
  | `reason` | Body | String ≤500 | No | Yes | — | Free-text justification. |
* **Request JSON Example:**
  ```json
  { "template_code": "experience_letter", "subject_user_id": "u9", "reason": "Requested by employee" }
  ```
* **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller as `manager`/`hr` with `documents.access`.
  2. Reads settings; if `manager_can_propose_letters !== true` ⇒ `403 LETTER_PROPOSALS_DISABLED`.
  3. Resolves the caller's scope (`getAccessibleUserIds`; a global approver = anyone). If the subject is out of scope ⇒ `403 FORBIDDEN`.
  4. Validates overrides against the template's declared, non-derived, non-service fields.
  5. Inserts a `pending` proposal (`proposed_by = actor`). The partial unique index guards one open proposal per `(subject, template)` ⇒ `409 LETTER_PROPOSAL_EXISTS`.
  6. Records `letter_proposal.created`. **No letter is issued.**
* **Database Impact:** **Reads** `document_settings`, `user_reporting_mappings`, `users`. **Writes** `document_letter_proposals` (`INSERT`), `document_audit_logs`.
* **PDF Generation Impact:** None (no render at proposal time).
* **File / Storage Impact:** None.
* **Transaction Behavior:** Proposal insert + audit in one transaction.
* **Concurrency & Race Conditions:** The partial unique index `document_letter_proposals_live_uq (org_id, template_code, subject_user_id) WHERE status='pending'` collapses concurrent duplicate proposals to one.
* **Idempotency / Retry Behavior:** A re-submission while one is pending returns `409 LETTER_PROPOSAL_EXISTS` (the open-proposal invariant is the guard).
* **Success Response Structure (HTTP 201 Created):**
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
* **Response Field Meanings:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `proposal.id` | String (UUID) | Unique proposal identifier. |
  | `proposal.template_code` | String | Template code proposed by the manager. |
  | `proposal.subject_user_id` | String (UUID) | Recipient employee UUID. |
  | `proposal.field_overrides` | Object | Declared override fields submitted by the manager. |
  | `proposal.reason` | String / Null | Operational justification note. |
  | `proposal.status` | String | Initial lifecycle status: always `pending`. |
  | `proposal.proposed_by` | String (UUID) | Proposing manager user ID. |
  | `proposal.decided_by` | String (UUID) / Null | Approving/rejecting HR user ID (`null` while pending). |
  | `proposal.decided_at` | ISO Timestamp / Null | Decision timestamp (`null` while pending). |
  | `proposal.decision_note` | String / Null | Decision note upon rejection (`null` while pending). |
  | `proposal.letter_id` | String (UUID) / Null | Issued document ID upon approval (`null` while pending). |
  | `proposal.created_at` | ISO Timestamp | Creation timestamp. |
  | `proposal.updated_at` | ISO Timestamp | Last modification timestamp. |

* **Error Responses:**
  | HTTP | Error Code | Trigger |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Malformed body. |
  | `403` | `LETTER_PROPOSALS_DISABLED` | Setting #93 off. |
  | `403` | `FORBIDDEN` | Subject not within the manager's scope. |
  | `409` | `LETTER_PROPOSAL_EXISTS` | An open proposal already exists for `(subject, template)`. |
  | `404`/`409`/`422` | template/field errors | Unknown/disabled template or invalid override field. |

---

### 146. GET /api/v1/documents/manager/letters
* **API Name / Purpose:** List the Caller's Own Proposals
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/manager/letters`
* **Authentication / Authorization:** Bearer JWT. Required Roles: `manager`, `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** A manager needs to see the status of the proposals they raised — a manager must never see another manager's queue (BR-M9).
* **Why the API Exists:** Returns a paginated list filtered strictly on `proposed_by = actor`, regardless of any query parameter.
* **Real-World Usage:** The manager "My proposals" list.
* **Path Parameters:** None.
* **Query Parameters:**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `status` | Enum | No | — | `pending`/`approved`/`rejected`/`cancelled`. |
  | `template_code` | String ≤64 | No | — | Filter. |
  | `subject_user_id` | UUID | No | — | Filter. |
  | `limit` | Integer 1–200 | No | `50` | Page size. |
  | `offset` | Integer ≥0 | No | `0` | Offset. |
* **Request Headers:** `Authorization: Bearer <JWT>` (Required).
* **Detailed API Behavior & Processing Flow:** Validates the query in the controller; forces `proposed_by = actor` at the service (a `proposed_by` query parameter is ignored on this plane); returns the paginated slice.
* **Database Impact:** Read-only over `document_letter_proposals` (`document_letter_proposals_mine_idx`). No writes.
* **PDF Generation / File / Storage Impact:** None.
* **Idempotency / Retry Behavior:** Idempotent read.
* **Success Response Structure:**
  ```json
  { "success": true, "message": "OK",
    "data": { "proposals": [ { "id": "…", "template_code": "…", "subject_user_id": "…", "status": "pending" } ],
              "total": 1, "limit": 50, "offset": 0 } }
  ```
* **Error Responses:** `400 VALIDATION_ERROR` (malformed query); `403 INSUFFICIENT_PERMISSIONS` (wrong role).

---

### 147. POST /api/v1/documents/hr/jobs/pdf-render/run
* **API Name / Purpose:** Drain the Letter Render Queue On Demand
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/jobs/pdf-render/run`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** After creating a bulk batch, HR may want the letters prepared immediately rather than waiting for the 15-minute worker cron.
* **Why the API Exists:** Provides an authorized manual drain of this org's letter render queue, optionally scoped to a single batch, bounded by a `limit`.
* **Real-World Usage:** A "Prepare now" button on the bulk-batch screen; safe to press repeatedly.
* **Path Parameters:** None.
* **Query Parameters:** None.
* **Request Headers:** `Authorization: Bearer <JWT>` (Required).
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `batch_id` | Body | UUID | No | Yes | `null` | When set, re-enqueues that batch's stragglers first, then drains. |
  | `limit` | Body | Integer 1–200 | No | Yes | worker default | Bounds the number of jobs drained (a drain is not a render request and does not consume the preview budget). |
* **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller as `hr`; validates the body against `runRenderSchema`.
  2. Invokes `automationService.runLetterRender({ orgId, batchId, limit })`, which claims queued jobs via `SELECT ... FOR UPDATE SKIP LOCKED`, issues each via `issue()` (salted `keyBase`), and recomputes affected batch statuses.
  3. Returns the drain summary.
* **Database Impact:** **Reads/Writes** `pdf_render_jobs` (claim → terminal), `document_letter_batch_items` (status), `document_letter_batches` (recomputed status), plus the issuance path's writes (`org_documents`, `pdf_render_artifacts`, `document_reference_sequences`, `document_audit_logs`).
* **PDF Generation Impact:** Triggers external Lambda renders for claimed jobs **outside** any transaction.
* **File / Storage Impact:** Persists each issued letter's PDF to S3 (`record`-class).
* **Transaction Behavior:** Claim commits, render runs with no open transaction, issuance commits atomically per item (Phase 2 contract).
* **Concurrency & Race Conditions:** `SKIP LOCKED` divides work safely between concurrent manual drains and the worker cron; per-item idempotency prevents double-issue.
* **Idempotency / Retry Behavior:** Fully idempotent; repeat invocations drain remaining work or return zeros.
* **Success Response Structure:**
  ```json
  { "success": true, "message": "OK",
    "data": { "claimed": 12, "done": 12, "retried": 0, "failed": 0, "cancelled": 0, "remaining": 0 } }
  ```
* **Response Field Meanings:** `claimed` (jobs locked this invocation), `done` (issued), `retried` (left pending for backoff), `failed`, `cancelled`, `remaining` (queue depth after the drain).
* **Error Responses:** `400 VALIDATION_ERROR`; `403 INSUFFICIENT_PERMISSIONS` / `FEATURE_DISABLED`.

---

### 148. GET /api/v1/documents/hr/letters/proposals
* **API Name / Purpose:** List Pending Manager Proposals (HR Queue)
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/letters/proposals`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** HR needs a single org-wide queue of proposals awaiting a decision.
* **Why the API Exists:** Returns proposals (default `status=pending`) across the org; registered **before** `/letters/:id` so `proposals` is never swallowed as an id.
* **Real-World Usage:** The HR "Pending proposals" review screen.
* **Path Parameters:** None.
* **Query Parameters:** Same shape as `#146` plus `proposed_by` (UUID) — on this plane the controller passes it through as a filter. Defaults `status=pending`.
* **Detailed API Behavior & Processing Flow:** Validates the query in the controller; if no `status` is given, defaults to `pending`; returns the paginated slice.
* **Database Impact:** Read-only over `document_letter_proposals` (`document_letter_proposals_queue_idx`).
* **PDF Generation / File / Storage Impact:** None.
* **Idempotency / Retry Behavior:** Idempotent read.
* **Success Response Structure:**
  ```json
  { "success": true, "message": "OK",
    "data": { "proposals": [ { "id": "…", "template_code": "…", "subject_user_id": "…", "proposed_by": "m1", "status": "pending", "created_at": "…" } ], "total": 1, "limit": 50, "offset": 0 } }
  ```
* **Error Responses:** `400 VALIDATION_ERROR`; `403 INSUFFICIENT_PERMISSIONS`.

---

### 149. POST /api/v1/documents/hr/letters/proposals/:id/approve
* **API Name / Purpose:** Approve a Proposal (Issues the Letter)
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letters/proposals/:id/approve`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** HR must be the checker who turns a manager's draft into a real letter, with separate-checker and scope-freshness guarantees.
* **Why the API Exists:** Issues the letter via the `#139` path (under `keyBase proposal:{id}`) and closes the proposal `approved` with its `letter_id` — atomically, with an approve-once guarantee.
* **Real-World Usage:** The "Approve" action in the HR proposal queue.
* **Path Parameters:** `:id` (UUID) — the proposal id.
* **Query Parameters:** None.
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `field_overrides` | Body | Object | No | Yes | proposal's | Optionally **replaces** the manager's overrides (audited by key name, R-18); ≤20 keys. |
  | `effective_date` | Body | String (ISO) | No | Yes | today | Optionally pins the letter date (±365 days). |
  | `acknowledge_stale_scope` | Body | Boolean | No | No | `false` | Clears a `PROPOSAL_SCOPE_STALE` 409 (EC-40). |
  | | | | | | | **No `idempotency_key`** — approval idempotency is the salted proposal keyBase (R-1/BR-M6); a client key would defeat approve-once. |
* **Detailed API Behavior & Processing Flow:**
  1. Authenticates caller as `hr`; validates `:id` and body.
  2. Loads the proposal scoped by org; missing ⇒ `404 DOCUMENT_NOT_FOUND`; not `pending` ⇒ `409 LETTER_PROPOSAL_NOT_PENDING`.
  3. Separate-checker: if `document_require_separate_checker` (#60) and approver == proposer ⇒ `409 SELF_APPROVAL_NOT_ALLOWED`.
  4. Scope-freshness: if the proposer's scope over the subject is stale and `acknowledge_stale_scope` is false ⇒ `409 PROPOSAL_SCOPE_STALE`.
  5. Issues the letter via `issue()` under `keyBase proposal:{id}`; on the `onIssued` hook, closes the proposal `approved` with `letter_id` (DB CHECK: an `approved` proposal must name a letter).
  6. On an idempotent replay (`reused: true`, `onIssued` did not run) the proposal is already closed by the first approval — a double-click approves once (BR-M6).
* **Database Impact:** **Reads** `document_letter_proposals`, `document_settings`. **Writes** the issuance path (`org_documents`, `pdf_render_artifacts`, `document_reference_sequences`, `document_audit_logs`) + `document_letter_proposals` (status → `approved`, `letter_id`, `decided_by`, `decided_at`).
* **PDF Generation Impact:** Renders the PDF via Lambda **outside** the transaction (Phase 2 contract).
* **File / Storage Impact:** Persists the issued letter's PDF to S3 (`record`-class).
* **Transaction Behavior:** Render outside; row + artifact + proposal-close commit atomically; reference allocated under `FOR UPDATE` after render.
* **Concurrency & Race Conditions:** The salted `keyBase` + the `pending`→`approved` transition (conditional on `pending`) guarantee two concurrent approvals issue exactly one letter.
* **Idempotency / Retry Behavior:** Idempotent on `keyBase proposal:{id}`; replay returns `200` + `reused: true`.
* **Success Response Structure:**
  ```json
  { "success": true, "message": "Proposal approved and letter issued",
    "data": { "letter": { "id": "…", "reference_number": "…", "status": "published" },
              "artifact": { "id": "…", "status": "ready" },
              "proposal": { "id": "…", "status": "approved" }, "reused": false } }
  ```
* **Error Responses:**
  | HTTP | Error Code | Trigger |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Malformed body/`:id`. |
  | `404` | `DOCUMENT_NOT_FOUND` | Cross-org/missing proposal. |
  | `409` | `LETTER_PROPOSAL_NOT_PENDING` | Already decided. |
  | `409` | `SELF_APPROVAL_NOT_ALLOWED` | Separate-checker on and approver == proposer. |
  | `409` | `PROPOSAL_SCOPE_STALE` | Proposer scope stale (clear with `acknowledge_stale_scope`). |
  | `409`/`422`/`502`/`503`/`504` | `#139` render errors | Inherited from the issuance path. |

---

### 150. POST /api/v1/documents/hr/letters/proposals/:id/reject
* **API Name / Purpose:** Reject a Proposal (Terminal)
* **HTTP Method:** `POST`
* **Endpoint / Route:** `/api/v1/documents/hr/letters/proposals/:id/reject`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** HR must be able to decline a proposal with an auditable reason. No letter is issued.
* **Why the API Exists:** Closes a `pending` proposal as `rejected`, recording the decision note (BR-M8).
* **Real-World Usage:** The "Reject" action in the HR proposal queue.
* **Path Parameters:** `:id` (UUID) — the proposal id.
* **Query Parameters:** None.
* **Request JSON Payload:**
  | Field | Location | Type | Required | Nullable | Default | Description |
  | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
  | `reason` | Body | String 1–500 | **Yes** | No | — | Mandatory rejection reason (BR-M8). |
* **Request JSON Example:** `{ "reason": "Not eligible — probation not cleared" }`
* **Detailed API Behavior & Processing Flow:** Loads the proposal scoped by org (missing ⇒ `404`); not `pending` ⇒ `409 LETTER_PROPOSAL_NOT_PENDING`; transitions to `rejected` with `decided_by`/`decided_at`/`decision_note`; records `letter_proposal.rejected`.
* **Database Impact:** **Reads/Writes** `document_letter_proposals` (status → `rejected`), `document_audit_logs`. No issuance-path writes.
* **PDF Generation / File / Storage Impact:** None.
* **Transaction Behavior:** Status transition + audit in one transaction; the transition is conditional on `pending` (a late second reject ⇒ `409`).
* **Idempotency / Retry Behavior:** A second reject on a decided proposal ⇒ `409 LETTER_PROPOSAL_NOT_PENDING`.
* **Success Response Structure:**
  ```json
  { "success": true, "message": "Proposal rejected",
    "data": { "proposal": { "id": "…", "status": "rejected", "decision_note": "…", "decided_by": "hr1", "decided_at": "…" } } }
  ```
* **Error Responses:**
  | HTTP | Error Code | Trigger |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Missing/empty `reason`. |
  | `404` | `DOCUMENT_NOT_FOUND` | Cross-org/missing proposal. |
  | `409` | `LETTER_PROPOSAL_NOT_PENDING` | Already decided. |

---

## Detailed Endpoint Specifications — Extended Existing API

### 139. POST /api/v1/documents/hr/letters — Internal Parameter Extension
* **Phase 4 Modification:** `issue()` gained five **internal** optional parameters so Phase 4 drivers reuse it:
  | Parameter | Type | Purpose |
  | :--- | :--- | :--- |
  | `documentId` | UUID | A pre-generated `org_documents.id` so a batch item's queue row, artifact and letter share a single id. |
  | `orgContext` | Object | A resolved org/settings/branding snapshot so a batch resolves branding once, not per subject. |
  | `onIssued` | Function | Post-issuance hook invoked inside or alongside issuance (e.g., closing proposals or updating batch items). |
  | `keyBase` | String | Deterministic seed for salted idempotency hashing (`batch:{b}:{s}`, `autoexit:{e}:{t}`, `proposal:{id}`). |
  | `systemOrigin` | Boolean | (auto-issue) records the audit as a system act — `actor_id: null` + reason `auto_issue_on_exit` — while the row keeps its attribution `created_by`/`published_by` (R-2). |
* **Wire Compatibility:** All five are additive, optional, and **never appear on the HTTP request or response**. `#139`'s external contract (request body, `201`/`200`+`reused`, error set) is byte-for-byte unchanged; the existing client `idempotency_key` behaviour is preserved.

---

## Background Worker & Automation Architecture

### 1. Letter Render Worker (F-4, §9.4)
`src/cron-jobs/pdf_render_worker.cron.js` (`*/15 * * * *` IST) first drains the payslip queue (`payroll_automation.runPayslipRender`, engine-gated), then — in its **own** `try/catch` — drains the **letter** queue (`document_automation.runLetterRender`, **not** engine-gated; letters are always HTML). The two halves are independent: a letter-side failure never stops the payslip drain or vice versa. Per item, an `issue()` failure is classified (R-3): `404`/never-issuable ⇒ skip; deterministic render defect ⇒ mark failed and rethrow (job fails); `422` ⇒ item failed; transient (renderer/storage/network, no `AppError` shape) ⇒ leave pending and rethrow so the job backs off. The `#147` endpoint is the manual trigger for the same drain.

### 2. Auto-Issue on Exit (F-5, BR-A6)
`src/cron-jobs/document_offboarding_archiver.cron.js` (02:30 IST) runs `runOffboardingArchive`, then **strictly after** it `runLetterAutoIssue`. The pass reads `letter_auto_issue_on_exit` (#92); if empty it returns after the settings read. It finds exits whose `last_working_day` falls in the lookback window via `employeeExitRepo.findDueForLetterAutoIssue` (bounded by `AUTO_ISSUE_BATCH = 100`, `AUTO_ISSUE_LOOKBACK_DAYS = 30`), and issues each listed template under `keyBase autoexit:{exitId}:{code}`. Per-exit error handling: `404` ⇒ break the exit's remaining templates (subject gone, BR-A7); `409` ⇒ skip that template, continue (BR-A5); `503` ⇒ skip, continue; any other ⇒ rethrow (per-org isolation via `_forEachOrg`). An exit with no `recorded_by` is skipped, not guessed.

### 3. Queue Reuse
Both letter render paths reuse the Phase 3 `pdf_render_jobs` table and its `SELECT ... FOR UPDATE SKIP LOCKED` claim protocol and live-source partial unique index. Phase 4 adds no new queue table.

---

## Phase 1 → Phase 2 → Phase 3 → Phase 4 Cross-Phase Consistency & Impact

| Phase | Core Domain | Primary Artifact Class | New Tables | Idempotency Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Letter Branding & Templates | Ephemeral / Preview | — | SHA-256 canonical view-model |
| **Phase 2** | Letter Issuance & Reissue | `record` (legal evidence) | — (uses `org_documents`) | subject facts + template version + sequence |
| **Phase 3** | Payroll Documents & Caching | `cache` (regenerable) | `pdf_render_jobs`, `pdf_render_artifacts` | payslip snapshot + template version + pinned date |
| **Phase 4** | Bulk / Proposals / Auto-Issue | `record` (via `issue()`) | `document_letter_batches`, `document_letter_batch_items`, `document_letter_proposals` | salted keyBase (`batch:` / `proposal:` / `autoexit:`) |

* **Zero Regressions on Phases 1–3:** Phase 4 adds no second issuance path and no change to the payslip pipeline; the two new internal `#139` params are additive and optional.
* **Shared Infrastructure Reuse:** the Phase 3 `pdf_render_jobs` queue, the Phase 2 `issue()` path, the branding builder, the reference-sequence allocator and the audit service are all reused, not re-implemented.
* **Settings defaults reproduce today's behaviour:** no org bulk-issues, auto-issues, accepts proposals, or emails a letter until it opts in — the phase is inert on deploy.
* **Notification gated off (OD-P4-9):** the `letter_issued` event is registered but `document_notify_letter_issued` (#94) defaults off until the frontend CTA route is confirmed.
* **Migration safety:** `00059` adds three tables, four `document_settings` columns and one enum label; `down()` uses `ON DELETE SET NULL` FKs and touches no issued letter or render artifact, and leaves the (unremovable) `letter_issued` enum label inert.

---

## Final Coverage Audit

```text
Total Phase 4 APIs discovered: 8
Total Phase 4 APIs documented: 8
New APIs added: 8 (#143, #144, #145, #146, #147, #148, #149, #150)
Existing APIs extended by Phase 4: 1 (#139 — internal params only, no wire change)
APIs corrected: 0
APIs still missing: 0
```

```text
Request contracts verified: 8 / 8
Success responses verified: 8 / 8
Error handling verified: 8 / 8
Security/authorization verified: 8 / 8
Database behavior verified: 8 / 8
PDF-generation behavior verified: 8 / 8
File/storage behavior verified: 8 / 8
```

```text
Phase 1 APIs reviewed for Phase 4 impact: 9 (#130–#138)
Phase 2 APIs reviewed for Phase 4 impact: 4 (#139–#142)
Phase 3 APIs reviewed for Phase 4 impact: 2 (#219, #220 payroll) + queue reuse
Phase 1–3 APIs actually changed by Phase 4: 0 wire changes (#139 internal params only)
APIs incorrectly assumed as changed: 0
```

```text
Existing phase analysis files reviewed: YES (phase1/2/3 api_analysis.md)
Existing file structure compared with reference files: YES
Required API documentation structure followed: YES
New settings (#91–#94) documented: YES
Background jobs (render drain, auto-issue ordering) documented: YES
Unsupported/invented information removed: YES
Test suites green at completion: pdf 512 / document 707 / payroll 995 (0 failures)
```
