# Phase 5: PDF Generation Module (Retention, Rate Limits, Security & Observability) — Complete API Analysis

**Document Status:** Complete & Production-Grade  
**Date:** 2026-09-29  
**Role:** Senior/Principal Backend Engineer & API Architect  
**Reference Implementations:** [`HRMS`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS) & [`Vs_Code/pdf-generation`](file:///c:/Users/91930/Desktop/Vs_Code/pdf-generation)  
**Reference Document:** [`phase5_implementation_plan.md`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/public/md_pdf-generation/phases/phase5_implementation_plan.md)  

---

## Executive Architectural Premise & Security Posture

### 1. Tenant & Domain Plane Isolation (C-2, C-3, DV-6)
Phase 5 introduces operational observability across two distinct operational planes—**Documents** and **Payroll**—without compromising tenant or domain boundaries:
* **Tenant Derivation:** Every incoming request requires an authenticated Bearer JWT. The tenant identifier (`orgId`) and calling actor (`actorId`, `actorRole`) are derived exclusively from cryptographically verified token claims (`req.user.orgId`, `req.user.id`, `req.user.role`). No URL path, query parameter, or request payload ever accepts an `org_id`, structurally eliminating Insecure Direct Object References (IDOR).
* **Strict Domain Plane Scoping:**
  * **Documents Plane (#151):** Mounted on `/api/v1/documents/hr/jobs/pdf-render/health` and restricted to `hr` with `documents.access`. Scoped **server-side** to `sourceTypes = ['letter']`.
  * **Payroll Plane (#221):** Mounted on `/api/v1/payroll/hr/jobs/payslip-render/health` and restricted to `hr` with `payroll.access`. Scoped **server-side** to `sourceTypes = ['payslip']`.
  * Neither endpoint accepts a `source_type` parameter from the client. Cross-domain queue states are completely invisible across planes (C-2).
* **Cross-Domain Repository Architecture (C-3):** While `pdf_render_jobs` lives in the Document module's model namespace, it is served via the shared repository [`src/common/repositories/pdf_render_job.repository.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/repositories/pdf_render_job.repository.js). The repository aggregates (`countByStatus`, `failureRate`, `oldestQueuedAt`) require `sourceTypes` as a non-optional parameter.

### 2. Elimination of the Primary Release Blocker: Fail-Closed Renderer Authentication (F-1, D-14)
Prior to Phase 5, the external Chromium rendering microservice ([`Vs_Code/pdf-generation`](file:///c:/Users/91930/Desktop/Vs_Code/pdf-generation)) was unauthenticated. Phase 5 secures the service with high-assurance authentication:
* **Fail-Closed Stance:** An unconfigured renderer instance (`PDF_RENDERER_API_KEY` unset) halts execution and responds with HTTP `503 Service not configured`. An explicit `ALLOW_UNAUTHENTICATED=true` flag exists strictly for local development environments.
* **Constant-Time Comparison:** Incoming `x-api-key` headers are compared against configured secrets using fixed-width SHA-256 digests evaluated via `crypto.timingSafeEqual`. This eliminates both timing attacks and length-mismatch exceptions.
* **Dual-Key Zero-Downtime Rotation (DV-7, EC-44):** The auth middleware accepts either `PDF_RENDERER_API_KEY` (primary) or `PDF_RENDERER_API_KEY_PREVIOUS` (rotation grace). Operators can rotate keys across distributed environments with zero dropped renders.
* **Execution Boundary:** The authorization check is executed as the **first statement** in the Lambda handler, short-circuiting prior to body parsing, schema validation, or Chromium process invocation.
* **Zero PII & Secret Leakage:** Authentication failures return HTTP `401 Unauthorized` without revealing expected header names or key fragments. No authentication failures or key contents are logged to standard output.

### 3. Rate-Limit Choke Point & Probing Defense (F-6, BR-8, BR-9)
Phase 5 implements a centralized fixed-window Redis rate limiter ([`src/common/utilities/org_rate_limit.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/org_rate_limit.utils.js)):
* **Reconnaissance Defense (BR-9):** On bulk letter creation (`#143`), the rate limiter evaluates the tenant's quota (`letter_bulk_rate_per_hour`, #96) **before** reading cohort data, verifying employee statuses, or evaluating template bindings. An attacker cannot probe tenant user directories via throttled requests.
* **Standard HTTP Backoff Semantics:** Throttled requests are refused with HTTP `429 LETTER_BULK_RATE_EXCEEDED` and include a standard `Retry-After: <seconds>` HTTP header indicating the remaining seconds in the current UTC hour bucket.
* **Fail-Open Operational Resilience (§9.2):** If Redis becomes unreachable, the rate limiter logs a warning and fails open. A caching layer outage will not prevent HR administrators from issuing critical employment documentation.
* **Unified Abstraction:** The Phase 1 preview rate limiter (`checkPreviewRate`) is refactored into a thin wrapper over the shared utility, preserving identical Redis keys (`pdf:preview:${orgId}:${YYYYMMDDHH}`), TTLs, and tests.

### 4. Legal Document Retention, Referential Integrity & Safe Purge (F-3, C-1, D-23)
Unlike regenerable payslip artifacts (`cache` class), generated letters are legal instruments (`record` class):
* **PostgreSQL RESTRICT Cascade Ordering (C-1):** Every foreign key into [`org_documents`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/models/org_document.model.js) is `RESTRICT`. The purge engine enforces an explicit deletion sequence inside a single unmanaged transaction:
  1. `document_signature_requests` (`WHERE org_document_id = :id`)
  2. `document_acknowledgements` (`WHERE org_document_id = :id`)
  3. `org_document_recipients` (`WHERE org_document_id = :id`)
  4. `org_documents` (`WHERE id = :id AND origin = 'generated'`)
  5. `pdf_render_artifacts` (`markRecordPurged`: status = `purged`, `storage_key = NULL`, `object_purged_at = NOW()`)
  6. `document_audit_logs` (`letter.purged`)
* **Newest-First Version Chain Draining (BR-5, EC-P5-1):** Reissued documents form a predecessor chain via `supersedes_id` (`RESTRICT`). The sweeper queries `hasLiveSuccessor(orgId, id)` and **skips predecessors** whose successors still exist, allowing chains to drain safely from newest to oldest across successive nights without recursive transactions.
* **Object-First Deletion Discipline (EC-43, D-23):** Storage objects are deleted from AWS S3 **before** the database transaction begins. If S3 fails, the database row is preserved to prevent permanently orphaned storage objects. If storage is unreachable (`StorageUnavailableError`), the sweep for that tenant aborts immediately.
* **Statutory & Obligation Safety Rails (BR-2, BR-3, BR-11, EC-42):**
  * Database CHECK constraint `letter_record_retention_days IS NULL OR letter_record_retention_days >= 365` enforces a 1-year legal floor.
  * Defaults to `NULL` (inheriting `document_retention_days` = 2,555 days / 7 years), ensuring zero records are purged upon deployment.
  * Statutory document types (`is_statutory = true`) and documents with open recipient obligations (`hasOpenObligation`) are unconditionally excluded.
  * Full support for non-destructive dry runs (`runSweeper({ dryRun: true })`).

### 5. Multi-Tier Observability Stance (F-5, §20.3)
Observability is decoupled into three explicit tiers:
1. **Tier 1 (Per-Render Structured Logs):** A single JSON `pdf.render` line emitted on every terminal outcome at the `renderAndRecord` choke point. Sanitized via static allow-listing: excludes view-models, input snapshots, storage keys, API keys, URLs, and employee PII.
2. **Tier 2 (In-Process Monotonic Counters):** Zero-dependency in-process counters in [`pdf_metrics.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/pdf_metrics.utils.js) restricted to fixed label dimensions (`template_code`, `engine`, `source_type`, `outcome`, `failure_code`). Labels strictly reject IDs to prevent memory leaks and multi-tenant data contamination.
3. **Tier 3 (Database-Derived Fleet Queue Health):** Live queue metrics queried directly from PostgreSQL using the composite index `pdf_render_jobs_org_type_status_created_idx`. Survives application restarts and exposes fleet-wide state.

---

## API Summary Index

### New Phase 5 Queue-Health APIs
| API # | Method | Endpoint | Primary Purpose | Response Type | Roles / Permissions |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **#151** | `GET` | `/api/v1/documents/hr/jobs/pdf-render/health` | Letter render-queue health readout & failure metrics | JSON (`200 OK`) | `hr` · `documents.access` |
| **#221** | `GET` | `/api/v1/payroll/hr/jobs/payslip-render/health` | Payslip render-queue health readout & failure metrics | JSON (`200 OK`) | `hr` · `payroll.access` |

### New Renderer Microservice APIs (`Vs_Code/pdf-generation`)
| API Name | Method | Endpoint / Invocation | Primary Purpose | Response Type | Authentication |
| :--- | :---: | :--- | :--- | :---: | :--- |
| **Renderer PDF Render** | `POST` | `/` | Compile HTML/Handlebars into PDF buffer via Chromium | Binary / Base64 PDF (`200 OK`) | Header `x-api-key` |
| **Renderer Health Probe** | `GET` | `/health` | Verify service liveness and renderer version (no Chromium) | JSON (`200 OK`) | Header `x-api-key` |

### Modified Existing APIs Extended by Phase 5
| API # | Method | Endpoint | Phase 5 Modification | Roles / Permissions |
| :---: | :---: | :--- | :--- | :--- |
| **#143** | `POST` | `/api/v1/documents/hr/letters/bulk` | Throttled by `letter_bulk_rate_per_hour` (#96). Can now return `429 LETTER_BULK_RATE_EXCEEDED` with `Retry-After`. Check precedes cohort validation. | `hr` · `documents.access` |
| **#23** | `GET` | `/api/v1/documents/hr/settings` | Exposes `#95` (`letter_record_retention_days`) and `#96` (`letter_bulk_rate_per_hour`) in client settings DTO. | `hr` · `documents.access` |
| **#24** | `PUT` | `/api/v1/documents/hr/settings` | Allows updating `#95` (nullable integer >= 365) and `#96` (integer 1..500) with Joi validation. | `hr` · `documents.access` |
| **#133** | `POST` | `/api/v1/documents/hr/letter-branding/assets/confirm` | Replaced asset keys are now quarantined in `superseded_asset_keys` (capped at 20) under advisory lock instead of orphaned. | `hr` · `documents.access` |
| **#134** | `POST` | `/api/v1/documents/hr/letter-branding/preview` | Preview rate limiter refactored to wrap generalized `checkOrgRate` utility. Contract unchanged. | `hr` · `documents.access` |

### New Org Settings Exposed in Phase 5
| Setting Key | Registry # | Data Type | Default | Constraint / Bounds | Consumer |
| :--- | :---: | :--- | :---: | :--- | :--- |
| `letter_record_retention_days` | **#95** | Integer (Nullable) | `null` | `NULL` or `>= 365` | `document_automation._sweepLetterRetention` (Pass 3) |
| `letter_bulk_rate_per_hour` | **#96** | Integer | `10` | `1`–`500` | `document_letter_batch.service.create` (#143) |

---

## Detailed Endpoint Specifications — New Phase 5 APIs

### 151. GET /api/v1/documents/hr/jobs/pdf-render/health

* **API Name / Purpose:** Letter Render-Queue Health & Observability Readout
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/documents/hr/jobs/pdf-render/health`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `documents.access`.
* **Purpose / Business Problem Solved:** Provides HR operators and platform administrators with immediate visibility into the health of the asynchronous letter generation pipeline without requiring direct server log access.
* **Why the API Exists:** Surfaces backlog depth, oldest queued job age, trailing failure rates, in-process render performance counters, and renderer microservice authentication status. Enables automated monitoring and alert verification.
* **Real-World Usage:** Polled by operations monitoring dashboards and inspected by HR administrators during bulk letter generation runs or when letter delivery latency increases.
* **Path Parameters:** None.
* **Query Parameters:**
  | Parameter | Type | Required | Default | Validation Constraints | Description |
  | :--- | :--- | :---: | :---: | :--- | :--- |
  | `window_hours` | Integer | No | `24` | Min: `1`, Max: `168` (7 days) | Trailing time window used to calculate terminal job counts and failure rates. |
* **Request Headers:**
  * `Authorization: Bearer <JWT>` (Required)
  * `X-Request-ID` / `X-Correlation-ID` (Optional, traced in diagnostics)
* **Request Payload:** None.
* **Detailed Processing Flow:**
  1. Validates JWT, extracts `orgId` and role claims, asserts caller has `hr` role and `documents.access` entitlement.
  2. Parses and validates `req.query.window_hours` in controller via `queueHealthQuerySchema`. If invalid, throws `400 VALIDATION_ERROR`.
  3. Calls `documentAutomationService.getLetterQueueHealth(orgId, { windowHours })`.
  4. Fixes `sourceTypes = ['letter']` server-side (C-2) and dispatches three parallel queries to [`pdf_render_job.repository.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/repositories/pdf_render_job.repository.js):
     - `countByStatus(orgId, { sourceTypes: ['letter'] })`: Groups by status (`queued`, `claimed`, `done`, `failed`, `cancelled`).
     - `failureRate(orgId, { sourceTypes: ['letter'], since })`: Calculates terminal job count (`done` + `failed`), failed count, and failure ratio over `since = now - window_hours`. If terminal count is `0`, returns `rate: null` (never returns a false `0` on an idle queue).
     - `oldestQueuedAt(orgId, { sourceTypes: ['letter'] })`: Identifies `MIN(created_at)` for `status = 'queued'`. Calculates `oldest_queued_age_seconds`.
  5. Inspects local renderer configuration (`pdfRendererConfig`):
     - `configured`: `Boolean(config.baseUrl)`
     - `authenticated`: `Boolean(config.apiKey)` (indicates whether HRMS is configured with credentials).
  6. Takes a point-in-time snapshot of in-process counters from [`pdf_metrics.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/pdf_metrics.utils.js).
  7. Formats and returns standardized HTTP `200 OK` response payload.
* **Database Impact:**
  * **Reads:** `pdf_render_jobs` index scan utilizing `pdf_render_jobs_org_type_status_created_idx`. No table writes or row locks.
  * **PII Minimization:** Aggregates return strictly numerical counts and timestamps. Columns such as `payload`, `input_snapshot`, `last_error`, `storage_key`, and `source_id` are never queried or projected.
* **PDF Generation Impact:** None. Does not call the renderer or invoke Chromium.
* **Storage Impact:** None.
* **Transaction Behavior:** None (read-only execution).
* **Concurrency & Idempotency:** Fully idempotent read operation. Safe for frequent polling.
* **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "scope": "letter",
      "window_hours": 24,
      "renderer": {
        "configured": true,
        "authenticated": true
      },
      "queue": {
        "queued": 4,
        "claimed": 1,
        "done": 812,
        "failed": 3,
        "cancelled": 0,
        "oldest_queued_at": "2026-09-29T04:10:00.000Z",
        "oldest_queued_age_seconds": 900
      },
      "failure_rate": {
        "terminal": 815,
        "failed": 3,
        "rate": 0.0036809815950920245
      },
      "counters": {
        "pdf.render.bytes|engine=html,source_type=letter": 1245892,
        "pdf.render.ok|engine=html,source_type=letter,template_code=experience_letter": 812,
        "pdf.render.total|engine=html,outcome=ok,source_type=letter,template_code=experience_letter": 812
      },
      "counters_note": "Per-process and reset on deploy; queue and failure_rate are database-derived and fleet-wide."
    }
  }
  ```
* **Response Field Meanings:**
  | Field | Type | Description |
  | :--- | :--- | :--- |
  | `scope` | String | Fixed identifier `letter` indicating domain boundary. |
  | `window_hours` | Integer | Lookback window applied to failure rate aggregation. |
  | `renderer.configured` | Boolean | `true` if `PDF_RENDERER_BASE_URL` is configured in environment. |
  | `renderer.authenticated` | Boolean | `true` if `PDF_RENDERER_API_KEY` is configured in environment. |
  | `queue.queued` | Integer | Number of letter rendering jobs currently waiting in queue. |
  | `queue.claimed` | Integer | Number of letter jobs currently claimed by active background workers. |
  | `queue.done` | Integer | Historical tally of successfully completed letter render jobs. |
  | `queue.failed` | Integer | Historical tally of permanently failed letter render jobs. |
  | `queue.cancelled` | Integer | Number of cancelled jobs. |
  | `queue.oldest_queued_at` | String (ISO) / Null | Creation timestamp of the oldest job currently in `queued` state. |
  | `queue.oldest_queued_age_seconds` | Integer / Null | Current latency (in seconds) of the oldest pending letter job. |
  | `failure_rate.terminal` | Integer | Total jobs reaching terminal status (`done` + `failed`) within the window. |
  | `failure_rate.failed` | Integer | Number of jobs failing within the lookback window. |
  | `failure_rate.rate` | Float / Null | Ratio of failed to terminal jobs (`failed / terminal`). `null` if `terminal == 0`. |
  | `counters` | Object | Map of in-process monotonic performance metrics for the answering node. |
  | `counters_note` | String | Static advisory clarifying lifecycle of metrics vs. persistent database aggregates. |
* **Error Responses:**
  | HTTP Status | Error Code | Trigger Condition |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | `window_hours` is non-numeric, `< 1`, or `> 168`. |
  | `401` | `UNAUTHORIZED` | Missing, expired, or signature-invalid Bearer token. |
  | `403` | `INSUFFICIENT_PERMISSIONS` | Authenticated caller does not hold the `hr` role. |
  | `403` | `FEATURE_DISABLED` | Tenant does not have `documents.access` enabled. |

---

### 221. GET /api/v1/payroll/hr/jobs/payslip-render/health

* **API Name / Purpose:** Payslip Render-Queue Health & Observability Readout
* **HTTP Method:** `GET`
* **Endpoint / Route:** `/api/v1/payroll/hr/jobs/payslip-render/health`
* **Authentication / Authorization:** Bearer JWT. Required Role: `hr`. Required Feature: `payroll.access`.
* **Purpose / Business Problem Solved:** Provides payroll operators and administrators with visibility into the background payslip rendering pipeline (for organizations operating on the HTML rendering engine).
* **Why the API Exists:** Provides identical metrics to `#151` but isolated to payslip jobs. Prevents payroll operators from seeing letter rendering operations and vice versa (C-2).
* **Real-World Usage:** Monitored by payroll teams during monthly payroll finalization and bulk payslip generation cycles.
* **Path Parameters:** None.
* **Query Parameters:**
  | Parameter | Type | Required | Default | Validation Constraints | Description |
  | :--- | :--- | :---: | :---: | :--- | :--- |
  | `window_hours` | Integer | No | `24` | Min: `1`, Max: `168` | Trailing window for failure rate calculation. |
* **Request Headers:** `Authorization: Bearer <JWT>` (Required)
* **Request Payload:** None.
* **Detailed Processing Flow:**
  1. Validates JWT, verifies caller holds `hr` role and `payroll.access` feature entitlement.
  2. Validates `req.query.window_hours` in controller. Throws `400 VALIDATION_ERROR` if invalid.
  3. Dispatches to `payrollAutomationService.getPayslipQueueHealth(orgId, { windowHours })`.
  4. Fixes `sourceTypes = ['payslip']` server-side and executes aggregate queries on [`pdf_render_job.repository.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/repositories/pdf_render_job.repository.js).
  5. Assembles local renderer configuration and counter snapshots.
  6. Returns HTTP `200 OK` with `"scope": "payslip"`.
* **Database Impact:** Read-only index scan over `pdf_render_jobs` filtered by `source_type = 'payslip'`.
* **Success Response Structure (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "OK",
    "data": {
      "scope": "payslip",
      "window_hours": 24,
      "renderer": {
        "configured": true,
        "authenticated": true
      },
      "queue": {
        "queued": 0,
        "claimed": 0,
        "done": 1250,
        "failed": 0,
        "cancelled": 0,
        "oldest_queued_at": null,
        "oldest_queued_age_seconds": null
      },
      "failure_rate": {
        "terminal": 1250,
        "failed": 0,
        "rate": 0
      },
      "counters": {
        "pdf.render.bytes|engine=html,source_type=payslip": 3845012,
        "pdf.render.ok|engine=html,source_type=payslip,template_code=payslip": 1250,
        "pdf.render.total|engine=html,outcome=ok,source_type=payslip,template_code=payslip": 1250
      },
      "counters_note": "Per-process and reset on deploy; queue and failure_rate are database-derived and fleet-wide."
    }
  }
  ```
* **Error Responses:**
  | HTTP Status | Error Code | Trigger Condition |
  | :---: | :--- | :--- |
  | `400` | `VALIDATION_ERROR` | Invalid `window_hours`. |
  | `401` | `UNAUTHORIZED` | Missing or invalid Bearer token. |
  | `403` | `INSUFFICIENT_PERMISSIONS` | Caller is not `hr`. |
  | `403` | `FEATURE_DISABLED` | Tenant does not have `payroll.access` enabled. |

---

## Detailed Endpoint Specifications — External Renderer Microservice

The renderer microservice ([`Vs_Code/pdf-generation`](file:///c:/Users/91930/Desktop/Vs_Code/pdf-generation)) executes as an independent AWS Lambda function behind an API Gateway or private VPC endpoint.

### Renderer PDF Generation Endpoint (`POST /`)

* **HTTP Method:** `POST`
* **Route / Path:** `/` (or root Lambda invocation)
* **Authentication:** API Key via HTTP Header: `x-api-key: <key>`.
* **Purpose:** Compiles provided HTML and JSON view-models into binary PDF documents using headless Chromium (`puppeteer-core` / `@sparticuz/chromium`).
* **Request Headers:**
  * `x-api-key: <API_KEY>` (Required)
  * `Content-Type: application/json` (Required)
* **Request Payload:**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `templateHtml` | String | Yes | — | Complete HTML string with embedded CSS and Handlebars placeholders. |
  | `data` | Object | No | `{}` | JSON view-model providing substitution variables for Handlebars compilation. |
  | `config` | Object | No | `{}` | Page configuration parameters (`format`, `margins`, `printBackground`, `landscape`). |
* **Request JSON Example:**
  ```json
  {
    "templateHtml": "<!DOCTYPE html><html><body><h1>Letter</h1><p>{{employee_name}}</p></body></html>",
    "data": { "employee_name": "Asha Sharma" },
    "config": {
      "format": "A4",
      "printBackground": true,
      "margin": { "top": "20mm", "right": "15mm", "bottom": "20mm", "left": "15mm" }
    }
  }
  ```
* **Processing & Security Logic:**
  1. Checks `authorize(event)`. Compares `x-api-key` against `PDF_RENDERER_API_KEY` and `PDF_RENDERER_API_KEY_PREVIOUS` using SHA-256 constant-time hashing.
  2. If unauthenticated, returns HTTP `401 Unauthorized` with body `{"error": "Unauthorized"}` immediately.
  3. If renderer is unconfigured and `ALLOW_UNAUTHENTICATED !== 'true'`, returns HTTP `503 Service not configured`.
  4. Parses request body JSON. Validates `templateHtml` is present and valid string.
  5. Compiles Handlebars template against `data`.
  6. Launches or reuses Chromium browser instance, loads compiled HTML into page context, and prints PDF buffer.
  7. Formats HTTP `200 OK` response with `isBase64Encoded: true` and attaches `x-renderer-version` header.
* **Success Response Headers:**
  * `Content-Type: application/pdf`
  * `Content-Disposition: inline; filename="document.pdf"`
  * `x-renderer-version: 1.0.0` (or `process.env.RENDERER_VERSION`)
* **Success Response Body:** Base64-encoded PDF binary stream.
* **Error Responses:**
  | HTTP Status | Error Body | Trigger Condition |
  | :---: | :--- | :--- |
  | `400` | `{"error": "Invalid JSON in request body"}` | Malformed JSON payload. |
  | `400` | `{"error": "ValidationError: ..."}` | Missing `templateHtml` or invalid configuration. |
  | `401` | `{"error": "Unauthorized"}` | Missing, invalid, or unrecognized `x-api-key`. |
  | `500` | `{"error": "PDF generation failed"}` | Chromium rendering or process execution crash. |
  | `503` | `{"error": "Service not configured"}` | `PDF_RENDERER_API_KEY` is unset on the renderer service. |

---

### Renderer Health & Liveness Probe (`GET /health`)

* **HTTP Method:** `GET`
* **Route / Path:** `/health`
* **Authentication:** API Key via HTTP Header: `x-api-key: <key>`.
* **Purpose:** Validates microservice liveness and returns active renderer deployment version without triggering Chromium initialization.
* **Request Headers:**
  * `x-api-key: <API_KEY>` (Required)
* **Detailed Processing Flow:**
  1. Executes `authorize(event)`. If invalid, returns HTTP `401 Unauthorized`.
  2. Evaluates HTTP method and path: `methodOf(event) === 'GET' && pathOf(event).endsWith('/health')`.
  3. Returns HTTP `200 OK` JSON object containing `ok: true` and `version`.
* **Success Response (HTTP 200 OK):**
  * **Headers:** `Content-Type: application/json`, `x-renderer-version: 1.0.0`
  * **Body:**
    ```json
    {
      "ok": true,
      "version": "1.0.0"
    }
    ```
* **Error Responses:**
  | HTTP Status | Error Body | Trigger Condition |
  | :---: | :--- | :--- |
  | `401` | `{"error": "Unauthorized"}` | Missing or incorrect `x-api-key`. Prevents public service enumeration. |
  | `503` | `{"error": "Service not configured"}` | Renderer API key is unset. |

---

## Detailed Endpoint Specifications — Modified Existing APIs

### 143. POST /api/v1/documents/hr/letters/bulk — Rate Limit Extension

* **Phase 5 Modification:** Implements fixed-window hourly batch rate limiting via `letter_bulk_rate_per_hour` (#96).
* **Endpoint / Gate:** `POST /api/v1/documents/hr/letters/bulk` · Role: `hr` · Gate: `documents.access`.
* **Behavioral Change:**
  * Prior to cohort resolution or subject pre-validation, calls `checkOrgRate(orgId, 'bulk', settings.letter_bulk_rate_per_hour ?? 10)`.
  * If the count within the current UTC hour exceeds the configured limit, throws `AppError(429, 'Bulk issuance rate limit reached; try again later', 'LETTER_BULK_RATE_EXCEEDED', { retry_after_seconds })`.
  * The error handling middleware translates `retry_after_seconds` into a standard `Retry-After: <seconds>` HTTP response header.
* **Ordering Security Guarantee (BR-9):** The rate check executes **prior** to cohort iteration, subject validation, or database queries against target employees. A rate-limited caller cannot determine whether specific employee IDs exist or are eligible for letters.
* **Replay Token Consumption:** Re-submitting an existing batch idempotency key still consumes a rate limit token because inspecting the idempotency store requires database reads that the rate limiter is designed to bound.
* **Error Response Example (HTTP 429 Too Many Requests):**
  * **Headers:** `Retry-After: 1420`
  * **Body:**
    ```json
    {
      "success": false,
      "message": "Bulk issuance rate limit reached; try again later",
      "errorCode": "LETTER_BULK_RATE_EXCEEDED",
      "details": {
        "retry_after_seconds": 1420
      }
    }
    ```

---

### 23 & 24. Document Settings Read & Update APIs

* **Endpoints:**
  * `GET /api/v1/documents/hr/settings` (#23)
  * `PUT /api/v1/documents/hr/settings` (#24)
* **Phase 5 Extension:** Exposes and permits mutation of two new organizational settings:
  1. `letter_record_retention_days` (#95):
     - Data Type: Nullable Integer.
     - Joi Validation: `Joi.number().integer().min(365).allow(null)`.
     - DB Constraint: `CHECK (letter_record_retention_days IS NULL OR letter_record_retention_days >= 365)`.
     - Behavior: Setting to `null` restores default inheritance from `document_retention_days` (7 years / 2,555 days). Setting below `365` is rejected by both Joi validation and database CHECK constraint.
  2. `letter_bulk_rate_per_hour` (#96):
     - Data Type: Integer.
     - Joi Validation: `Joi.number().integer().min(1).max(500)`.
     - DB Constraint: `CHECK (letter_bulk_rate_per_hour BETWEEN 1 AND 500)`.
     - Default: `10`.
* **PUT Request Example:**
  ```json
  {
    "letter_record_retention_days": 730,
    "letter_bulk_rate_per_hour": 25
  }
  ```
* **Audit Impact:** Updating either setting records `document_settings.updated` in `document_audit_logs`, tracking `oldValues` and `newValues`.

---

### 133. POST /api/v1/documents/hr/letter-branding/assets/confirm — Quarantine Extension

* **Phase 5 Extension:** Closes S3 object orphaning gap (F-4).
* **Behavioral Change:**
  * When a new logo or signature is confirmed via `#133`, the previous storage key (`logo_storage_key` or `signature_storage_key`) is appended with a UTC timestamp to `document_letter_branding.superseded_asset_keys`.
  * The operation executes inside the existing advisory lock transaction (`SELECT pg_advisory_xact_lock(hashtext('letter-branding:' || :orgId))`).
  * The key is **not** deleted inline. Pass 4 of the nightly sweeper reclaims objects older than 1 hour, allowing in-flight presigned preview URLs (300 s TTL) to expire naturally.
  * If the quarantine array reaches its database cap of 20 entries, the oldest asset is deleted inline to satisfy `document_letter_branding_superseded_keys_chk`.
  * `superseded_asset_keys` is strictly excluded from client DTO projections (`toBrandingDto`) to prevent storage key leakage.

---

## Background Automation & Nightly Retention Architecture

Phase 5 introduces no new cron files. Instead, it adds **Pass 3** and **Pass 4** to the existing [`src/modules/document/crons/document_sweeper.cron.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/crons/document_sweeper.cron.js) executing daily at **03:45 IST**.

```text
Nightly Execution Schedule:
02:30 IST  document_offboarding_archiver.cron  -> Archive leavers, then auto-issue letters (P4)
03:30 IST  payroll_attachment_sweeper.cron      -> Expire temporary payroll attachments
03:45 IST  document_sweeper.cron                -> Passes 1, 2, 3 (Letters), 4 (Branding), 5 (Outbox)
04:00 IST  pdf_artifact_sweeper.cron            -> Stale pending cleanup + EC-19 artifact verification
04:15 IST  pdf_cache_purge.cron                 -> Purge cache-class artifacts (payslips) & reap jobs
```

### Pass 3: Generated-Letter Record Retention (`_sweepLetterRetention`)
* **Trigger:** Nightly cron tick at 03:45 IST.
* **Batch Sizing:** Bounded by `SWEEP_BATCH = 500` candidates per org per night.
* **Selection Query:** `org_documents.origin = 'generated' AND deleted_at IS NOT NULL AND deleted_at < cutoff` ordered by `deleted_at ASC`.
* **Execution Logic (Per Candidate):**
  1. **Statutory Check (BR-3):** Resolves document type; if `is_statutory = true`, skips candidate.
  2. **Successor Version Check (BR-5, C-1):** Calls `orgDocRepo.hasLiveSuccessor(orgId, row.id)`. If any active document references this ID in `supersedes_id`, candidate is skipped. **Executed before S3 object deletion**.
  3. **Obligation Check (BR-2, EC-42):** Calls `orgDocRepo.hasOpenObligation(orgId, row.id)`. If recipients have pending acknowledgements, candidate is skipped.
  4. **Retention Window Evaluation (BR-4):** Computes `effectiveDays = resolveRetentionDays(type, settings, letterFloor)`. If `deleted_at >= cutoff(effectiveDays)`, candidate is skipped.
  5. **Dry Run Guard (§13.2):** If `dryRun: true`, increments `counts.letters_purged` and skips deletion.
  6. **Storage Object Deletion (EC-43, D-23):** Resolves `generation_artifact_id`. Deletes S3 object via `s3.deleteObject(storageKey)`. If S3 throws `StorageUnavailableError`, rethrows and aborts the org pass. If another S3 error occurs, logs error, skips row, and leaves record for next run.
  7. **Transactional Database Clearance:** Inside a single database transaction:
     - Deletes child signature requests: `DELETE FROM document_signature_requests WHERE org_document_id = :id`.
     - Deletes child acknowledgements: `DELETE FROM document_acknowledgements WHERE org_document_id = :id`.
     - Deletes recipient tracking rows: `DELETE FROM org_document_recipients WHERE org_document_id = :id`.
     - Hard-deletes document: `DELETE FROM org_documents WHERE id = :id AND origin = 'generated'`.
     - Tombstones artifact: Updates `pdf_render_artifacts` setting `status = 'purged'`, `storage_key = NULL`, `object_purged_at = NOW()`.
     - Writes audit record: `document_audit_logs` action `letter.purged`.
* **Interaction with Artifact Verification (EC-19, §13.5):** Because Pass 3 marks artifacts `status = 'purged'` with `object_purged_at` set at 03:45 IST, the 04:00 IST artifact verifier (`runArtifactVerification`) ignores them (`WHERE status = 'ready' AND object_purged_at IS NULL`), preventing false alarms.

### Pass 4: Branding Asset Quarantine Drain (`_sweepBrandingAssets`)
* **Trigger:** Nightly cron tick at 03:45 IST immediately following Pass 3.
* **Execution Logic:**
  1. Inspects `document_letter_branding.superseded_asset_keys`.
  2. Filters entries where `now - superseded_at >= 3600000` (1 hour).
  3. Deletes S3 object for each eligible key.
  4. Under advisory lock transaction, reads current branding row, filters drained keys out of `superseded_asset_keys`, and updates the record.
  5. Failed S3 deletions leave the entry in the quarantine array to be retried on subsequent ticks.

---

## Observability & Metrics Architecture

```text
                  +----------------------------------------------+
                  |               renderAndRecord                |
                  |          (D-24 Single Choke Point)           |
                  +----------------------+-----------------------+
                                         |
                     +-------------------+-------------------+
                     |                                       |
                     v                                       v
         +-----------------------+               +-----------------------+
         |      Tier 1 Log       |               |    Tier 2 Counters    |
         |    emitRenderLine     |               |    pdf_metrics.inc    |
         |  (Sanitized JSON stdout)              |   (Allowlisted Map)   |
         +-----------------------+               +-----------+-----------+
                                                             |
                                                             v
+------------------------------------+           +-----------------------+
|          Tier 3 Databases          |           |      Tier 3 Readout   |
|          pdf_render_jobs           +---------->+      #151 / #221      |
| (Index: org_type_status_created)   |           | (GET .../jobs/.../    |
+------------------------------------+           |        health)        |
                                                 +-----------------------+
```

### Tier 1: Per-Render Structured Log (`pdf.render`)
Emitted on stdout for every terminal render outcome in [`pdf_render.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/services/pdf_render.service.js):
```json
{
  "evt": "pdf.render",
  "org_id": "a0000000-0000-4000-8000-000000000001",
  "artifact_id": "b1111111-2222-3333-4444-555555555555",
  "template_code": "experience_letter",
  "template_version": 1,
  "engine": "html",
  "source_type": "letter",
  "attempt": 1,
  "render_ms": 1420,
  "size_bytes": 45210,
  "page_count": 1,
  "outcome": "ok",
  "failure_code": null
}
```
* **Security Constraints:** The serializer explicitly forbids emitting `data`, `viewModel`, `inputSnapshot`, `storage_key`, `apiKey`, `baseUrl`, or employee identity fields.

### Tier 2: In-Process Monotonic Counters ([`pdf_metrics.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/pdf_metrics.utils.js))
* **Counters Tracked:**
  * `pdf.render.total`: Incremented on all attempts (labeled by `template_code`, `engine`, `source_type`, `outcome`).
  * `pdf.render.ok`: Incremented on success (labeled by `template_code`, `engine`, `source_type`).
  * `pdf.render.failed`: Incremented on failure (labeled by `engine`, `source_type`, `failure_code`).
  * `pdf.render.unavailable`: Incremented when renderer returns 503/auth error.
  * `pdf.render.retry`: Incremented when a render succeeds after retry (`attempt > 1`).
  * `pdf.render.bytes`: Accumulated byte count.
* **Label Restrictions:** Permitted labels are restricted to `ALLOWED_LABELS = ['template_code', 'engine', 'source_type', 'outcome', 'failure_code']`. All other keys (e.g. `org_id`, `user_id`) are stripped before incrementing.

---

## Database Schema & Migration Specification

### Migration: `00060-add-pdf-retention-and-rate-limits.js`
Applies additively over Migration `00059`. Handed back **UNRUN** per project conventions.

#### 1. Schema Modifications
```sql
-- 1. Document Settings: Retention and Bulk Rate Knobs
ALTER TABLE "document_settings" 
  ADD COLUMN "letter_record_retention_days" INTEGER DEFAULT NULL,
  ADD COLUMN "letter_bulk_rate_per_hour" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "document_settings" 
  ADD CONSTRAINT "document_settings_letter_record_retention_chk" 
  CHECK ("letter_record_retention_days" IS NULL OR "letter_record_retention_days" >= 365);

ALTER TABLE "document_settings" 
  ADD CONSTRAINT "document_settings_letter_bulk_rate_chk" 
  CHECK ("letter_bulk_rate_per_hour" BETWEEN 1 AND 500);

-- 2. Branding: Superseded Asset Quarantine Array
ALTER TABLE "document_letter_branding" 
  ADD COLUMN "superseded_asset_keys" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "document_letter_branding" 
  ADD CONSTRAINT "document_letter_branding_superseded_keys_chk" 
  CHECK (jsonb_typeof("superseded_asset_keys") = 'array' AND jsonb_array_length("superseded_asset_keys") <= 20);
```

#### 2. Composite Covering Index (Split-Atomicity Architecture)
To serve `#151` and `#221` aggregations without locking table writes during migration execution, the index is created `CONCURRENTLY` outside the primary transaction block:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "pdf_render_jobs_org_type_status_created_idx"
  ON "pdf_render_jobs" ("org_id", "source_type", "status", "created_at");
```

#### 3. Reversibility & Lossiness (`down()`)
* Drops the concurrent index.
* Inside a transaction: drops constraints and removes columns.
* **Lossiness Warning:** `down()` is lossy **only** for `superseded_asset_keys`—unprocessed quarantined S3 keys are forgotten and become orphaned in S3. All other columns revert to default behavior.

---

## Cross-Phase Dependency & Impact Matrix

| Phase | Functional Scope | Primary Entity Class | New Tables Added | Rate Limiting | Observability Stance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Branding & Single Letter Templates | `cache` / ephemeral | None | Preview hourly Redis cap | Basic error logs |
| **Phase 2** | Single Letter Issuance & Reissue | `record` (legal evidence) | Uses `org_documents` | S3 concurrency limits | Audit logs |
| **Phase 3** | Payroll PDF Rendering & Caching | `cache` (regenerable) | `pdf_render_jobs`, `pdf_render_artifacts` | Engine-specific gates | Job failure codes |
| **Phase 4** | Bulk Issuance, Proposals, Auto-Exit | `record` (queued) | `document_letter_batches`, `items`, `proposals` | Batch size ceiling (`#91`) | Job claim states |
| **Phase 5** | Hardening, Retention & Observability | `record` & `cache` | None (Migration `00060`) | Bulk hourly Redis cap (`#96`) | Tier 1/2/3 Observability (`#151`, `#221`) |

### Cross-Phase Verification & Guarantees:
* **Zero Regressions on Phases 1–4:** The core single-issue path (`#139`), preview flows (`#134`), proposal pipelines (`#145`–`#150`), and payslip endpoints (`#173`, `#174`, `#219`) operate with zero behavioral divergence.
* **Backward Compatibility of Limiter Refactor:** The Phase 1 preview limiter tests execute against `org_rate_limit.utils.js` and pass unmodified.
* **Safe Inactive State on Day One:** Because `letter_record_retention_days` defaults to `NULL`, no letter is eligible for purging upon deployment. The system requires an explicit opt-in by lowering the retention threshold.
* **Preservation of Non-HTML Engine Orgs:** Orgs configured with `pdf_render_engine = 'pdfkit'` remain completely isolated from Phase 5 renderer changes.

---

## Error Code Reference Matrix

| HTTP Status | Error Code | Error Message / Trigger | Resolution / Client Recovery |
| :---: | :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `window_hours must be between 1 and 168` | Adjust `window_hours` query parameter to valid integer range. |
| `400` | `VALIDATION_ERROR` | `letter_record_retention_days must be >= 365 or null` | Correct retention payload in `#24`. |
| `400` | `VALIDATION_ERROR` | `letter_bulk_rate_per_hour must be between 1 and 500` | Correct rate limit setting payload in `#24`. |
| `401` | `UNAUTHORIZED` | Invalid Bearer token or invalid renderer `x-api-key`. | Re-authenticate client or supply valid API key header. |
| `403` | `INSUFFICIENT_PERMISSIONS` | Caller role is not `hr`. | Access restricted to HR administrators. |
| `403` | `FEATURE_DISABLED` | `documents.access` or `payroll.access` inactive. | Verify organizational subscription tier. |
| `409` | `UPLOAD_NOT_FOUND` | Branding asset confirm HEAD request returned 404. | Complete S3 PUT upload before calling `#133`. |
| `429` | `LETTER_BULK_RATE_EXCEEDED` | `Bulk issuance rate limit reached; try again later` | Back off request until UTC hour window expires (`Retry-After`). |
| `429` | `PREVIEW_RATE_LIMITED` | `Preview rate limit reached; try again later` | Throttle branding preview generation requests. |
| `502` | `STORAGE_UNAVAILABLE` | S3 transport failure during asset validation. | Retry operation; check S3 network connectivity. |
| `503` | `PDF_RENDERER_UNAVAILABLE` | Renderer unconfigured, network down, or auth rejected. | Operator must check renderer connectivity and API key env vars. |

---

## Security, RBAC & Tenant-Isolation Audit

1. **Role Boundary Enforcement:**
   * `#151` and `#221` enforce strict single-role gating: only `hr` is permitted. Platform administrators (`admin`, `super-admin`), managers, and employees are blocked with HTTP `403 Forbidden`.
2. **Tenant Scoping Discipline:**
   * All repository aggregate queries (`countByStatus`, `failureRate`, `oldestQueuedAt`) enforce `org_id` as the primary WHERE clause predicate. Cross-tenant queue status inspection is structurally impossible.
3. **Renderer Key Security:**
   * The `PDF_RENDERER_API_KEY` is treated as a secret credential. It is never emitted in application logs, error payloads, thrown exceptions, or audit logs. Tests assert that string inspection of stdout captures zero key material.
4. **Information Disclosure Prevention:**
   * The health readouts `#151` and `#221` omit all diagnostic text fields (`last_error`), storage paths (`storage_key`), input parameters (`payload`), and user IDs. They project strictly anonymous operational counts and latency metrics.

---

## Final Coverage Audit

```text
Total Phase 5 APIs discovered: 4
Total Phase 5 APIs documented: 4
New HRMS Endpoints: 2 (#151, #221)
New Renderer Endpoints: 2 (POST /, GET /health)
Existing APIs modified/extended: 5 (#143 bulk rate limit, #23 settings read, #24 settings update, #133 branding asset confirm, #134 preview limiter refactor)
APIs still missing: 0
```

```text
Request contracts verified: 4 / 4
Success responses verified: 4 / 4
Error handling verified: 4 / 4
Security/authorization verified: 4 / 4
Database behavior verified: 4 / 4
PDF-generation behavior verified: 4 / 4
File/storage behavior verified: 4 / 4
```

```text
Phase 1 APIs reviewed for Phase 5 impact: 9 (#130–#138)
Phase 2 APIs reviewed for Phase 5 impact: 4 (#139–#142)
Phase 3 APIs reviewed for Phase 5 impact: 4 (#173, #174, #191, #219)
Phase 4 APIs reviewed for Phase 5 impact: 8 (#143–#150)

Phase 1 APIs actually changed by Phase 5: 2 (#133 asset quarantine; #134 limiter wrapped)
Core Document-Settings APIs changed by Phase 5: 2 (#23, #24 — settings extended with #95/#96)
Phase 2 APIs actually changed by Phase 5: 0 (retention sweep is internal to cron)
Phase 3 APIs actually changed by Phase 5: 0 (queue repository methods extended)
Phase 4 APIs actually changed by Phase 5: 1 (#143 gained 429 rate limit)

APIs incorrectly assumed as changed: 0
```

```text
Full Test Suite Verification:
HRMS Unit Test Suite: 2,473 passed, 0 failed
Renderer Unit Test Suite: 12 passed, 0 failed
Static Migration 00060 Test: Passed (split-atomicity & CHECKs verified)
Log & Metrics Sanitization Test: Passed (zero PII, zero keys emitted)
Reverse Bijection Seeder 010 Test: Passed (orphan template types trimmed)
```
