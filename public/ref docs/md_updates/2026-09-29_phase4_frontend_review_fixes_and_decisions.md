# PDF Generation Phase 4 — Backend Review Decisions, Fixes & API Contracts

**Date:** 2026-09-29  
**Audience:** Frontend Engineers, API Consumers, System Architects  
**Author:** Senior Backend Engineering Team  
**Status:** Implemented & Verified in Backend Codebase  

---

## Executive Summary

Following a senior backend review of the three frontend integration decisions, all three issues have been resolved directly in the codebase:

1. **Manager Catalogue Discovery & Settings Access (Resolved):** Opened read-only letter template discovery and document settings reads to the `manager` role on both the Manager plane (`/api/v1/documents/manager/*`) and the HR plane (`/api/v1/documents/hr/*`). Managers can now discover enabled templates, inspect field schemas, and verify whether `manager_can_propose_letters` (#93) is enabled without receiving 403 Forbidden errors.
2. **Notification Email CTA Route (Resolved):** Updated the `letter_issued` notification email destination route in `document_notification.service.js` from the unverified placeholder (`/documents/org`) to the confirmed frontend application route: `/dashboard/employee/company-documents/${documentId}`.
3. **#144 Bulk Progress Response Structure (Reconciled):** Reconciled the API contract across all documentation and the backend service. Added `batch.total_count` alongside `batch.total` so frontend code reading either spelling functions seamlessly. Settled the canonical status keys for both the item ledger (`counts`) and the background queue (`queue`).

---

## 1. Decision 1: Manager Letter Template Discovery & Settings Access

### Problem Analysis
`POST /api/v1/documents/manager/letters` (#145) requires a valid `template_code`. Previously:
- The template catalog endpoint (`GET /api/v1/documents/hr/letter-templates`, #135) was restricted to `authorize(['hr'])`.
- The template detail/fields descriptor endpoint (`GET /api/v1/documents/hr/letter-templates/:code`, #136) was restricted to `authorize(['hr'])`.
- The document settings read endpoint (`GET /api/v1/documents/hr/settings`) exposing `manager_can_propose_letters` (#93) was restricted to `authorize(['hr'])`.

Because managers received HTTP `403 Forbidden`, the frontend could not determine whether the proposal feature was enabled or populate the template dropdown.

### Backend Solution Implemented
1. **Manager Plane Endpoints Added (`src/modules/document/routes/document_letter_manager.routes.js`):**
   - `GET /api/v1/documents/manager/letter-templates`: Lists letter templates. Accepts optional `?enabled=true`.
   - `GET /api/v1/documents/manager/letter-templates/:code`: Returns template metadata and the form descriptor (`fields: [{ key, label, type, max_length, required }]`) so the frontend can dynamically render inputs for `field_overrides`.
   - `GET /api/v1/documents/manager/settings`: Returns document settings so managers can inspect `manager_can_propose_letters` (#93).
2. **HR Plane Read Permission Opened (`src/modules/document/routes/document_letter.routes.js` & `document_hr.routes.js`):**
   - `GET /api/v1/documents/hr/letter-templates` (#135) now authorizes `['hr', 'manager']`.
   - `GET /api/v1/documents/hr/letter-templates/:code` (#136) now authorizes `['hr', 'manager']`.
   - `GET /api/v1/documents/hr/settings` now authorizes `['hr', 'manager']`.
3. **Security Invariant Preserved:**
   - All administrative write operations remain strictly HR-only: `PUT /settings`, `PUT /letter-templates/:code/config`, and `POST /letter-templates/:code/preview` continue to return `403 Forbidden` for non-HR callers.

### Endpoints & Exact Response Payloads

#### A. List Templates for Manager
* **Route:** `GET /api/v1/documents/manager/letter-templates?enabled=true` (or `/api/v1/documents/hr/letter-templates?enabled=true`)
* **Auth:** Bearer JWT (`manager` or `hr`)
* **Response (HTTP 200 OK):**
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
        "has_saved_fields": false,
        "is_orphaned": false
      },
      {
        "code": "bonafide_letter",
        "title": "Bonafide Letter",
        "current_version": 1,
        "is_enabled": true,
        "pinned_version": null,
        "has_saved_fields": true,
        "is_orphaned": false
      }
    ]
  }
}
```

#### B. Get Template Detail & Form Descriptors for Manager
* **Route:** `GET /api/v1/documents/manager/letter-templates/experience_letter` (or `/api/v1/documents/hr/letter-templates/experience_letter`)
* **Auth:** Bearer JWT (`manager` or `hr`)
* **Response (HTTP 200 OK):**
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
        "employee.name",
        "employee.designation",
        "employee.department",
        "employee.joining_date",
        "employee.relieving_date"
      ],
      "optional_fields": [
        "closing_note"
      ],
      "fields": [
        {
          "key": "closing_note",
          "label": "Closing Note",
          "type": "string",
          "max_length": 500,
          "required": false
        }
      ],
      "sample_data": {
        "closing_note": "We wish him all the best in his future endeavors."
      }
    },
    "config": {
      "is_enabled": true,
      "pinned_version": null,
      "saved_fields": {}
    }
  }
}
```

#### C. Read Settings for Manager (Feature Toggle Check)
* **Route:** `GET /api/v1/documents/manager/settings` (or `/api/v1/documents/hr/settings`)
* **Auth:** Bearer JWT (`manager` or `hr`)
* **Response (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "990e8400-e29b-41d4-a716-446655440099",
    "org_id": "880e8400-e29b-41d4-a716-446655440088",
    "manager_can_propose_letters": true,
    "letter_bulk_max_subjects": 200,
    "letter_auto_issue_on_exit": ["relieving_letter", "experience_letter"],
    "document_notify_letter_issued": false,
    "document_require_separate_checker": false
  }
}
```

---

## 2. Decision 2: Confirmed Notification Email CTA Route

### Problem Analysis
The notification service had a placeholder CTA path (`org_document: '/documents/org'`), which was unconfirmed and did not exist in the frontend router. The frontend uses role-based routes:
- Employee portal company documents: `/dashboard/employee/company-documents`
- HR administrative documents: `/dashboard/hr/documents/organisation`

### Backend Solution Implemented
1. Updated `CTA_PATH_BY_ENTITY.org_document` in `src/modules/document/services/document_notification.service.js`:
   ```javascript
   org_document: '/dashboard/employee/company-documents'
   ```
2. When a letter is published and `document_notify_letter_issued` (#94) is enabled, the resulting email's "View document" CTA button points directly to:
   ```text
   https://<frontend-domain>/dashboard/employee/company-documents/<documentId>
   ```
3. Updated unit tests in `tests/unit/document/document_notification.service.test.js` to assert against `/dashboard/employee/company-documents/doc-1`.
4. The setting `document_notify_letter_issued` (#94) is safe to turn on whenever an organization desires email alerts for newly issued letters.

---

## 3. Decision 3: Reconciled Canonical Response Shape for #144

### Problem Analysis
The frontend reported a naming discrepancy across Phase 4 documentation files:
- An earlier change record referenced `batch.total_count` / `pending_count` with a queue state `queue.processing`.
- The API analysis referenced `batch.total` with item ledger `counts.pending` and worker queue `queue.claimed`.

### Backend Implementation & Contract Settled
1. **Dual Property Support on `batch` (`total` & `total_count`):**
   In `src/modules/document/services/document_letter_batch.service.js`, the `batch` object returns both properties:
   - `total: batch.total_count`
   - `total_count: batch.total_count`
   This guarantees that code consuming either property receives the exact count.
2. **Authoritative Ledger vs. Diagnostic Queue Distinction:**
   - **`counts` (Item Ledger):** Drawn from the authoritative `document_letter_batch_items` table:
     - `pending`: Number of batch items not yet finalized.
     - `issued`: Number of successfully published letters.
     - `failed`: Number of items that failed permanently.
     - `skipped`: Number of items skipped (e.g. employee resigned or template disabled).
   - **`queue` (Render Jobs):** Drawn from `pdf_render_jobs`:
     - `queued`: Waiting to be claimed by worker cron or `#147`.
     - `claimed`: Currently locked by workers under `SELECT ... FOR UPDATE SKIP LOCKED` (this is the real PostgreSQL status; there is no `processing` enum label in the database).
     - `done`: Jobs successfully rendered.
     - `failed`: Jobs that exceeded maximum retry attempts.
     - `cancelled`: Redundant jobs safely cancelled.
3. **Pending Count Placement (`counts.pending`):**
   The pending count is located in the ledger object at `data.counts.pending` (not `data.batch.pending_count`). The `batch` object carries immutable request metadata (`id`, `template_code`, `template_version`, `status`, `total`/`total_count`, `created_by`, `created_at`, `completed_at`), while all dynamic item counters live in `counts`.

### Canonical #144 Response Payload

* **Route:** `GET /api/v1/documents/hr/letters/bulk/:batchId?limit=50&offset=0`
* **Auth:** Bearer JWT (`hr`)
* **Response (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "batch": {
      "id": "e4f8b912-8f33-4a11-b2c3-5d7e890f4567",
      "template_code": "experience_letter",
      "template_version": 1,
      "status": "running",
      "total": 3,
      "total_count": 3,
      "created_by": "11111111-2222-3333-4444-555555555555",
      "created_at": "2026-09-29T10:00:00.000Z",
      "completed_at": null
    },
    "counts": {
      "pending": 1,
      "issued": 1,
      "failed": 1,
      "skipped": 0
    },
    "queue": {
      "queued": 1,
      "claimed": 0,
      "done": 1,
      "failed": 1,
      "cancelled": 0
    },
    "failures": [
      {
        "subject_user_id": "22222222-3333-4444-5555-666666666666",
        "failure_code": "PDF_DATA_INCOMPLETE",
        "failure_reason": "Missing required field: employee.phone",
        "updated_at": "2026-09-29T10:05:00.000Z"
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

---

## 4. Test & Verification Summary

All automated test suites were executed and verified green:
1. `tests/unit/pdf/letter_manager_routes.test.js`: Verified manager route availability for `/letter-templates`, `/letter-templates/:code`, and `/settings`.
2. `tests/unit/document/document_notification.service.test.js`: Verified `org_document` notification builds CTA pointing to `/dashboard/employee/company-documents/${documentId}`.
3. `tests/unit/pdf/letter_batch_service.test.js`: Verified `#144` progress shape, ledger counts, and `batch.total` / `batch.total_count`.
4. `tests/unit/pdf/letter_security.test.js`: Verified security guards across all letter routes.
5. `tests/unit/pdf/letter_proposal_service.test.js`: Verified maker-checker workflow, hierarchy scoping, and settings gating.

---

## 5. Direct Frontend Implementation Guide (Action Items by Screen)

This section translates backend resolutions into immediate, component-level tasks for the frontend team.

### Action Item 1: Enable Manager "Request Letter" Button & Flow

* **Previous State:** The frontend probed the catalogue, received HTTP 403 Forbidden, and hid the button with an explanation.
* **Now What You Receive:** Calling `GET /api/v1/documents/manager/settings` and `GET /api/v1/documents/manager/letter-templates` returns HTTP 200 OK.
* **Frontend Implementation Steps:**
  1. **Feature Gate Probe:**
     Call `GET /api/v1/documents/manager/settings` upon loading the team roster or manager document dashboard:
     ```typescript
     const { data } = await api.get('/api/v1/documents/manager/settings');
     const canPropose = Boolean(data.data.manager_can_propose_letters);
     // Enable the "Request Letter" action button when canPropose === true
     ```
  2. **Fetch Permitted Templates:**
     When the manager opens the "Request Letter" modal, fetch active templates:
     ```typescript
     const { data } = await api.get('/api/v1/documents/manager/letter-templates?enabled=true');
     const templateOptions = data.data.templates.map(t => ({ value: t.code, label: t.title }));
     ```
  3. **Fetch Dynamic Form Descriptors:**
     When a template is selected, fetch field specifications to render input fields:
     ```typescript
     const { data } = await api.get(`/api/v1/documents/manager/letter-templates/${selectedTemplateCode}`);
     const fields = data.data.template.fields; // [{ key, label, type, max_length, required }]
     ```
  4. **Submit Proposal:**
     `POST /api/v1/documents/manager/letters` with `{ template_code, subject_user_id, field_overrides, reason }`.
  5. **Render "My Letter Requests" Table:**
     `GET /api/v1/documents/manager/letters` loads the calling manager's submitted proposals with status badges (`pending`, `approved`, `rejected`, `cancelled`).

---

### Action Item 2: Un-hide the #94 Email Notification Toggle in HR Settings

* **Previous State:** The settings card rendered the switch as "unavailable" because `/documents/org` did not exist in the frontend router.
* **Now What You Receive:** The backend notification service uses `/dashboard/employee/company-documents/${documentId}`, which is an existing, active employee route.
* **Frontend Implementation Steps:**
  1. Remove the "unavailable" / disabled state from the `document_notify_letter_issued` switch card in the HR Document Settings page.
  2. The toggle can now be actively flipped by HR administrators.
  3. On submit, save via `PUT /api/v1/documents/hr/settings`:
     ```json
     {
       "document_notify_letter_issued": true
     }
     ```
  4. When enabled, any employee who receives a newly issued letter will receive an email containing a "View document" CTA deep-linking straight to `/dashboard/employee/company-documents/<documentId>`.

---

### Action Item 3: Streamline the Bulk Progress Component (#144)

* **Previous State:** The client read multiple fallback spellings (`batch.total_count` vs `batch.total`, `counts.pending` vs `batch.pending_count`, `queue.processing` vs `queue.claimed`).
* **Now What You Receive:** The backend reliably returns both `batch.total` and `batch.total_count`, dynamic item counts in `counts`, and worker queue status with PostgreSQL state `queue.claimed`.
* **Frontend TypeScript Interface & Mapping:**
  ```typescript
  export interface BulkProgressResponse {
    batch: {
      id: string;
      template_code: string;
      template_version: number;
      status: 'queued' | 'running' | 'completed' | 'completed_with_failures' | 'cancelled';
      total: number;       // Canonical total subject count
      total_count: number; // Exact alias of total
      created_by: string;
      created_at: string;
      completed_at: string | null;
    };
    counts: {
      pending: number; // Authoritative items waiting or currently rendering
      issued: number;  // Successfully materialized letters
      failed: number;  // Permanent render failures
      skipped: number; // Skipped subjects (e.g. inactive)
    };
    queue: {
      queued: number;
      claimed: number; // Worker active lock state (PostgreSQL status; not 'processing')
      done: number;
      failed: number;
      cancelled: number;
    };
    failures: Array<{
      subject_user_id: string;
      failure_code: string;
      failure_reason: string;
      updated_at: string;
    }>;
    pagination: {
      limit: number;
      offset: number;
      total: number;
    };
  }
  ```
* **Recommended Progress Bar Logic:**
  ```typescript
  const total = data.batch.total; // or data.batch.total_count
  const completed = data.counts.issued + data.counts.failed + data.counts.skipped;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Use data.counts for user-facing progress
  const isFinished = ['completed', 'completed_with_failures', 'cancelled'].includes(data.batch.status);
  ```

