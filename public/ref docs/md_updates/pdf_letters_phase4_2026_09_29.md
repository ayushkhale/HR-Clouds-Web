# PDF Generation Phase 4 — Bulk Issuance, Manager Proposals & Auto-Issue (API change record)

**Date:** 2026-09-29
**Module:** Documents → PDF Generation (Phase 4)
**Audience:** Frontend / API consumers
**Feature flag:** `documents.access` (unchanged)
**Auth:** HR endpoints use the existing `hrAuth` array; manager endpoints use a new `/api/v1/documents/manager` mount (`authenticate` + `authorize(['manager','hr'])` + `requireFeature('documents.access')`), covering proposals (#145/#146), template discovery, and settings read.

Phase 4 adds three capabilities on top of the Phase 2 single-issue path: **bulk issuance** of one template to many subjects, a **manager maker-checker** flow (manager proposes → HR approves/rejects), and an unattended **auto-issue-on-exit** pass (no endpoint — driven by a cron and an org setting). A letter is still a first-class `org_document` (`origin='generated'`); every new issue runs through the same `#139` issuance path underneath. Below is everything a client must handle.

---

## 1. New endpoints

### 1.1 HR plane — base `/api/v1/documents/hr`

| #   | Method | Path                              | Purpose                                                        |
| --- | ------ | --------------------------------- | -------------------------------------------------------------- |
| 143 | POST   | `/letters/bulk`                   | Create a bulk-letter batch (one template → many subjects)      |
| 144 | GET    | `/letters/bulk/:batchId`          | Poll a batch's progress and failed items                       |
| 147 | POST   | `/jobs/pdf-render/run`            | Manually drain this org's letter render queue                  |
| 148 | GET    | `/letters/proposals`              | List all pending manager proposals awaiting HR decision        |
| 149 | POST   | `/letters/proposals/:id/approve`  | Approve a proposal — **issues the letter**                     |
| 150 | POST   | `/letters/proposals/:id/reject`   | Reject a proposal (terminal; requires a reason)                |

### 1.2 Manager plane — base `/api/v1/documents/manager`

| #   | Method | Path                | Purpose                                                        |
| --- | ------ | ------------------- | -------------------------------------------------------------- |
| 145 | POST   | `/letters`          | Propose a letter for a direct report                           |
| 146 | GET    | `/letters`          | List the caller's **own** proposals (paginated)                |
| —   | GET    | `/letter-templates` | Discover letter templates available for proposal               |
| —   | GET    | `/letter-templates/:code` | Get template detail, fields descriptor & sample data      |
| —   | GET    | `/settings`         | Read document settings (discovers `manager_can_propose_letters` #93) |

> **Note on HR reads:** `GET /api/v1/documents/hr/letter-templates` (#135), `GET /api/v1/documents/hr/letter-templates/:code` (#136), and `GET /api/v1/documents/hr/settings` also permit `manager` role in addition to `hr`.

---

## 2. Behaviour a client must handle

### 2.1 Bulk issuance is asynchronous (`#143` → `202`)

`POST /letters/bulk` does **not** return finished letters. It validates the subject list, enqueues one render job per subject, and returns **`202 Accepted`** with a `batch_id`. The client must then poll `#144 GET /letters/bulk/:batchId` for progress. Rendering is drained by the 15-minute worker cron (or on demand via `#147`).

**Request**

```json
{
  "template_code": "experience_letter",
  "subject_user_ids": ["u1", "u2", "u3"],
  "field_overrides": { "purpose": "Address proof" },
  "effective_date": "2026-09-29"
}
```

- `subject_user_ids` must be **distinct** (a repeat ⇒ `422 LETTER_BULK_DUPLICATE_SUBJECT`) and no larger than the org's `letter_bulk_max_subjects` (#91, default 200; `422 LETTER_BULK_TOO_MANY_SUBJECTS`).
- If any subject fails pre-validation, the whole batch is refused with `422 LETTER_BULK_VALIDATION_FAILED` and a `failures` detail array — nothing is enqueued.
- **Idempotency:** the client **may** supply an optional `idempotency_key`; if omitted, the batch is de-duplicated on a key **derived** from `(template_code, subjects, overrides, date)`. Either way a re-submission returns `200` with `reused: true` and the existing `batch_id` and live counts, so a double-click never creates two batches. (This batch-level key is distinct from the per-item issuance key, which is always the salted `batch:{batchId}:{subjectId}` — see §4.)

**`#144` progress shape (Canonical)**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "batch": {
      "id": "…",
      "template_code": "experience_letter",
      "template_version": 1,
      "status": "running",
      "total": 3,
      "total_count": 3,
      "created_by": "…",
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
        "subject_user_id": "u2",
        "failure_code": "PDF_DATA_INCOMPLETE",
        "failure_reason": "Missing required field: employee.phone",
        "updated_at": "2026-09-29T10:05:00.000Z"
      }
    ],
    "pagination": { "limit": 50, "offset": 0, "total": 1 }
  }
}
```

*Notes on properties:*
- `batch.status`: one of `queued` / `running` / `completed` / `completed_with_failures` / `cancelled`.
- `batch.total` and `batch.total_count`: both present with the total subject count for client convenience.
- `counts`: authoritative item ledger counts (`pending`, `issued`, `failed`, `skipped`).
- Pending items: The pending item count is located at `data.counts.pending` in the ledger object (there is no `batch.pending_count` property).
- `queue`: diagnostic worker queue state (`queued`, `claimed`, `done`, `failed`, `cancelled`). Active worker lock status is `queue.claimed` (the actual PostgreSQL job status), not `queue.processing`.
- `failures`: paginated list of failed/skipped items (`limit`, `offset`, `total`).

### 2.2 Manager maker-checker (`#145`/`#146` → `#148`/`#149`/`#150`)

- `#145 POST /manager/letters` creates a **proposal**, not a letter. It is gated by the org setting `manager_can_propose_letters` (#93, **default off**) — disabled ⇒ `403 LETTER_PROPOSALS_DISABLED`. A manager may only propose for a **direct report**; out-of-scope subject ⇒ `403 FORBIDDEN`. Only overridable declared fields are accepted (no derived or service fields).
- **Template Discovery:** A manager can list available templates at `GET /api/v1/documents/manager/letter-templates` (or `/hr/letter-templates?enabled=true`) and inspect field descriptors at `GET /api/v1/documents/manager/letter-templates/:code` (or `/hr/letter-templates/:code`). Settings can be read at `GET /api/v1/documents/manager/settings` (or `/hr/settings`) to check `manager_can_propose_letters`.
- One open proposal per `(subject, template)` — a re-submit while one is pending ⇒ `409 LETTER_PROPOSAL_EXISTS`.
- `#146 GET /manager/letters` returns only the **caller's own** proposals — a manager never sees another manager's queue.
- `#149 POST /hr/letters/proposals/:id/approve` **issues the letter** and closes the proposal `approved`. Returns `201` (or `200` + `reused: true` — a double-click approves once). If `document_require_separate_checker` (#60) is on and the approver is the proposer ⇒ `409 SELF_APPROVAL_NOT_ALLOWED`. If the proposer's scope over the subject is no longer valid ⇒ `409 PROPOSAL_SCOPE_STALE`.
- `#150 POST /hr/letters/proposals/:id/reject` is terminal and **requires a `reason`** (missing ⇒ `400 VALIDATION_ERROR`). No letter is issued.
- A proposal that is not pending (already decided) ⇒ `409 LETTER_PROPOSAL_NOT_PENDING` on either decision.

### 2.3 Auto-issue on exit (no endpoint)

Governed entirely by the org setting `letter_auto_issue_on_exit` (#92). A cron issues each listed template to a departing employee on their last working day. There is **no client action** — this note exists so a frontend settings screen can expose #92 (see §3).

---

## 3. New org settings (surface in the Document settings screen)

| #  | Key                              | Type            | Default | Notes                                                                                              |
| -- | -------------------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 91 | `letter_bulk_max_subjects`       | integer 1–2000  | `200`   | Max subjects per bulk batch (#143).                                                                |
| 92 | `letter_auto_issue_on_exit`      | array (≤ 5)     | `[]`    | Template codes auto-issued to leavers. Must be known, distinct, **not compensation-bearing**.      |
| 93 | `manager_can_propose_letters`    | boolean         | `false` | Enables the manager proposal path (#145/#146).                                                     |
| 94 | `document_notify_letter_issued`  | boolean         | `false` | Emails the subject when a letter is issued. Destination CTA: `/dashboard/employee/company-documents`. |

All four are updated through the existing `PUT /api/v1/documents/hr/settings` endpoint (and readable via `GET /api/v1/documents/hr/settings` or `GET /api/v1/documents/manager/settings`). Out-of-range / unknown values ⇒ `422 SETTING_OUT_OF_RANGE`.

---

## 4. `#139` (single issue) — no wire change

`#139 POST /letters` gained five **internal** optional parameters (`documentId`, `orgContext`, `onIssued`, `keyBase`, `systemOrigin`) so the batch worker, auto-issue, and proposal approval can reuse its issuance path. There is **no change** to the `#139` request or response as seen by an external client. It continues to accept an external client-supplied `idempotency_key`.

**Idempotency contract (important):** the system-driven flows (bulk items, proposal approval, auto-issue) do **not** accept or forward a client `idempotency_key`; they key issuance internally on a salted value (`batch:{batchId}:{subjectId}`, `proposal:{proposalId}`, `autoexit:{exitId}:{code}`). This means an `#149` approval and a batch item are idempotent **without** the client passing any key — a re-driven approval or batch never double-issues. Only the direct `#139` single-issue call takes a client `idempotency_key`.

---

## 5. New notification event — confirmed route

A new notification event `letter_issued` is registered and gated by `document_notify_letter_issued` (#94, default **false**). When enabled, the email CTA deep-links to `/dashboard/employee/company-documents/${documentId}` (where employees view their issued company documents; for HR administrative views, `/dashboard/hr/documents/organisation`). When #94 is disabled, letters are still issued and visible in-app; only the email notification is suppressed. The HR settings card toggle can now be offered directly rather than displayed as unavailable.

---

## 6. Error code summary (new)

| Code                             | HTTP | Where                                  |
| -------------------------------- | ---- | -------------------------------------- |
| `VALIDATION_ERROR`               | 400  | `#150` (missing reason), `#143` (syntax)|
| `LETTER_BULK_DUPLICATE_SUBJECT`  | 422  | `#143` — repeated subject id           |
| `LETTER_BULK_TOO_MANY_SUBJECTS`  | 422  | `#143` — over `letter_bulk_max_subjects` |
| `LETTER_BULK_VALIDATION_FAILED`  | 422  | `#143` — one or more subjects invalid  |
| `LETTER_PROPOSALS_DISABLED`      | 403  | `#145` — `manager_can_propose_letters` off |
| `FORBIDDEN`                      | 403  | `#145` — subject not a direct report   |
| `LETTER_PROPOSAL_EXISTS`         | 409  | `#145` — open proposal already exists  |
| `LETTER_PROPOSAL_NOT_PENDING`    | 409  | `#149`/`#150` — proposal already decided |
| `SELF_APPROVAL_NOT_ALLOWED`      | 409  | `#149` — separate-checker violation    |
| `PROPOSAL_SCOPE_STALE`           | 409  | `#149` — proposer scope no longer valid |
| `DOCUMENT_NOT_FOUND`             | 404  | `#144`/`#149`/`#150` — cross-org/missing |

`#149` additionally surfaces every `#139` render/issue error (`404 LETTER_TEMPLATE_UNKNOWN`, `409 LETTER_TEMPLATE_DISABLED`, `422 PDF_DATA_INCOMPLETE`, `502/503/504` renderer/storage, etc.).

---

## 7. Migration & rollout note

The schema (three tables + four `document_settings` columns + the `letter_issued` enum label) ships in migration `00059-create-letter-batches-and-proposals.js`, **authored and handed back UNRUN** — the operator runs migrations. All four new settings default to today's behaviour (no org bulk-issues, auto-issues, accepts proposals, or emails a letter until it opts in), so the phase is inert on deploy until an org turns something on.
