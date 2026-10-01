# Documents Module — Phase 2 (Org-Issued Documents) API Guide

**Date:** 2026-09-23
**Audience:** Frontend developers integrating the Documents module.
**Scope:** Phase 2 adds **30 new endpoints** (#43–#72). **No Phase-1 endpoint changes** — no existing path, request shape, or response shape is altered. This document lists every new endpoint, its request/response, the shared error contract, and the fields the frontend must **not** expect.

---

## 1. What Phase 2 adds

Phase 1 covered **employee-owned** documents (things an employee or HR uploads *about* one person). Phase 2 adds **org-issued** documents — a policy, notice, or letter that HR (or a manager, as a proposal) issues to a **targeted audience** of employees. The two planes never share a row.

An org document has a lifecycle:

```
draft ──publish──▶ published ──replace──▶ (new draft → published, old row → superseded)
  │                     │
  │                     └──retire──▶ retired
  └──reject──▶ rejected            (manager proposals only)
```

The response envelope is unchanged: `{ success, message, data }`. List endpoints put `{ total, rows }` in `data` (`counts_by_state` is added for the recipient roster). Errors use `{ success: false, message, errorCode, details? }`.

---

## 2. Shared contracts (read this first)

### 2.1 Uniform "not found" / "forbidden"
- Any `/:id`-addressed request the caller may not see returns **`404 DOCUMENT_NOT_FOUND`** with message `"Document not found"` and **no details** — whether the row is missing, cross-org, confidential, or out of the caller's scope. Existence never leaks. Do not branch UI on "does it exist" vs "am I allowed"; treat 404 as "not available to you".
- A `/:userId`-addressed request the caller may not make returns **`403 FORBIDDEN`**.

### 2.2 Fields the frontend must NEVER expect
These are stripped from every list/detail/roster response:
- `storage_key` — internal S3 object key. **Never returned, ever.** Use the `view-url` endpoints to open a file.
- `reference_url` — returned **only** by a `view-url` call (as `view_url`), never in list/detail.
- On the **employee** (`/me/hr-documents`) plane, the targeting internals (`targeting`, `target_*`, `included_users`, `excluded_users`, `recipient_count`, `proposed_by`, `created_by`, `updated_by`) are also withheld — an employee can never see who else got a document or how it was targeted.

### 2.3 Derived read-only fields (present on org document responses)
- `display_status` — the *effective* status on today's date (IST). A `published` row reads as `scheduled` (before `effective_from`), `active`, or `expired` (after `effective_to`). Other statuses pass through unchanged. **Never persisted** — always trust this field over doing date math on the client.
- `is_actionable` — `true` only when `status === 'published'`.

### 2.4 Targeting (how an audience is chosen)
A draft carries six optional arrays. **Empty array = no restriction on that dimension.** All six empty = the entire active workforce.
- `target_departments` (UUIDs), `target_locations` (UUIDs), `target_employment_types` (strings), `target_job_statuses` (strings)
- `included_users` (UUIDs) — restricts the result further (AND); it does **not** override the attribute filters.
- `excluded_users` (UUIDs) — always wins; removed before anything else.
- Each array is capped at **200** elements. `included_users` and `excluded_users` must be disjoint.

The audience is **resolved and frozen at publish**. Editing targeting is only possible while `draft`.

**Update (#44) merge semantics:** targeting arrays are merged per-dimension, not replaced wholesale. A dimension you **omit** from the PUT body keeps its stored value; sending an explicit `[]` clears just that one dimension. So to remove all locations while keeping the department list, send `"target_locations": []` and omit `target_departments`.

**Acknowledgement:** when `requires_acknowledgement` is `true`, `acknowledgement_due_days` must be an integer in **1–365** (0 is rejected).

---

## 3. HR plane — base `/api/v1/documents/hr`

Auth: HR role + `documents.access` feature.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 43 | POST | `/org-documents` | create a draft (returns an upload URL for the `s3` backend) |
| 44 | PUT | `/org-documents/:id` | edit a draft's metadata + targeting |
| 45 | POST | `/org-documents/:id/file` | re-issue the upload URL for a draft |
| 46 | POST | `/org-documents/:id/file/confirm` | verify + record the uploaded object |
| 47 | POST | `/org-documents/:id/publish` | publish + materialise recipients |
| 48 | POST | `/org-documents/:id/replace` | start the next-version draft |
| 49 | POST | `/org-documents/:id/retire` | withdraw a live policy |
| 50 | POST | `/org-documents/:id/reject` | decline a manager proposal |
| 51 | DELETE | `/org-documents/:id` | soft-delete a draft/rejected row |
| 52 | GET | `/org-documents` | list + filter |
| 53 | GET | `/org-documents/proposals` | manager-proposed drafts queue |
| 54 | GET | `/org-documents/groups/:groupId` | full version chain of a policy group |
| 55 | GET | `/org-documents/:id` | detail |
| 56 | GET | `/org-documents/:id/versions` | version chain from any member |
| 57 | GET | `/org-documents/:id/view-url` | presigned GET |
| 58 | GET | `/org-documents/:id/audit-logs` | audit trail |
| 59 | GET | `/org-documents/:id/recipients` | roster + `counts_by_state` |
| 60 | POST | `/org-documents/:id/recipients/sync` | top-up recipients against the frozen criteria |
| 61 | POST | `/org-documents/:id/recipients/:userId/waive` | excuse one recipient |

### 3.1 Create a draft (#43)
Two backends. Pick one via `storage_backend`.

**S3 (upload a file):**
```json
POST /api/v1/documents/hr/org-documents
{
  "document_type_id": "…",
  "title": "Leave Policy 2026",
  "description": "…",                       // optional
  "storage_backend": "s3",
  "file_name": "leave-policy.pdf",
  "content_type": "application/pdf",
  "size_bytes": 482113,
  "effective_from": "2026-10-01",           // optional
  "effective_to": null,                     // optional
  "requires_acknowledgement": true,         // optional; may be raised, never lowered below the type default
  "acknowledgement_due_days": 14,           // required when requires_acknowledgement is true
  "requires_signature": false,              // optional; raise-only
  "is_confidential": false,                 // optional; tighten-only
  "target_departments": ["…"],              // any subset of the six arrays; all omitted = whole org
  "included_users": [], "excluded_users": []
}
```
Response `201`:
```json
{ "success": true, "message": "Draft created", "data": {
  "document": { "id": "…", "status": "draft", "version": 1, "targeting": null, … },
  "upload_url": "https://…", "upload_expires_at": "…", "required_headers": { "Content-Type": "…", "Content-Length": "…" }
}}
```
Then `PUT` the raw bytes to `upload_url` with exactly the `required_headers`, and call **#46** to confirm.

**Reference (link an external https URL):**
```json
{ "document_type_id": "…", "title": "…", "storage_backend": "reference", "reference_url": "https://…" }
```
A reference draft is publishable immediately (no upload/confirm step).

### 3.2 Confirm the upload (#46)
`POST /org-documents/:id/file/confirm` — no body. The backend re-verifies the object's content-type and size against the type policy. **Idempotent**: a second call returns the same row. Errors: `422 DOCUMENT_TOO_LARGE` / `422 DOCUMENT_CONTENT_TYPE_NOT_ALLOWED` / `409 UPLOAD_NOT_FOUND` / `503 DOCUMENT_STORAGE_UNAVAILABLE`.

### 3.3 Publish (#47)
```json
POST /org-documents/:id/publish
{ "override_scope_change": false }   // optional; see below
```
Response:
```json
{ "success": true, "message": "Published", "data": {
  "document": { …, "status": "published", "version": 1, "recipient_count": 214 },
  "recipient_count": 214, "version": 1, "warnings": []
}}
```
- **Idempotent**: publishing an already-published row returns it with `"already_published": true` and creates no new recipients.
- **Zero recipients is a success**, not an error: `"warnings": ["ZERO_RECIPIENTS"]`. Surface this so HR knows the targeting matched nobody.
- **Too large**: a resolved audience over the sync limit → `422 RECIPIENT_SET_TOO_LARGE` (`details.resolved_count`, `details.limit`).
- **`409 ORG_DOCUMENT_FILE_MISSING`**: publish attempted on a draft with no confirmed file and no reference URL.
- **`409 PROPOSER_SCOPE_CHANGED`** (manager proposals only): the proposing manager no longer manages every target. Re-submit with `"override_scope_change": true` to publish anyway (the override is audited).

### 3.4 Replace / Retire / Reject / Delete
- **Replace (#48)** — `POST …/replace` with optional `{ "title", "effective_from" }`. Creates the next-version **draft** (same group), returns it plus an upload URL if the group is S3-backed. `409 ORG_DOCUMENT_DRAFT_EXISTS` (carries the existing draft id) if one is already open; `409 ORG_DOCUMENT_NOT_REPLACEABLE` if the subject is not published.
- **Retire (#49)** — `POST …/retire` with `{ "reason": "…" }` (10–500 chars). `published → retired`. Idempotent. A retired document stays readable by its recipients with `is_actionable: false`.
- **Reject (#50)** — `POST …/reject` with `{ "reason": "…" }`. Only a **manager proposal** draft can be rejected (`draft → rejected`); a non-proposal draft returns `409 ORG_DOCUMENT_NOT_A_PROPOSAL`. Idempotent.
- **Delete (#51)** — `DELETE …/:id`. Only `draft`/`rejected` rows; else `409 ORG_DOCUMENT_NOT_DELETABLE`. Idempotent.

### 3.5 Lists (#52–#54)
- **#52** `GET /org-documents?status=…&type_id=…&group_id=…&proposed=true|false&q=…&limit=&offset=`. `status` repeatable. `data: { total, rows }`.
- **#53** `GET /org-documents/proposals` — manager-proposed **drafts** awaiting HR.
- **#54** `GET /org-documents/groups/:groupId` — the full version chain (all versions, oldest first).

### 3.6 Recipients (#59–#61)
- **#59** `GET /org-documents/:id/recipients?state=…&limit=&offset=` →
  ```json
  { "total": 214, "rows": [ { "id": "…", "state": "pending", "source": "publish", "due_on": "2026-10-15", "first_viewed_at": null } ],
    "counts_by_state": { "pending": 200, "viewed": 10, "acknowledged": 3, "signed": 0, "waived": 1, "total": 214 } }
  ```
- **#60** `POST /org-documents/:id/recipients/sync` — adds employees who now match the **frozen** criteria but aren't recipients yet; never removes anyone. Returns `{ added_count, recipient_count }`. Naturally idempotent (a re-run adds 0).
- **#61** `POST /org-documents/:id/recipients/:userId/waive` with `{ "reason": "…" }`. Legal from `pending`/`viewed`; `409 RECIPIENT_ALREADY_COMPLETED` from `acknowledged`/`signed`; idempotent from `waived`.

---

## 4. Manager plane — base `/api/v1/documents/manager`

Auth: `manager` or `hr` role + `documents.access`. A manager can **propose** an org document for **one direct report** and manage that draft, but can **never** publish/retire/reject — those are HR-only.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 62 | GET | `/org-documents/types` | org-plane types with `manager_can_request = true` |
| 63 | POST | `/org-documents` | create a proposal for one direct report (+ upload URL) |
| 64 | PUT | `/org-documents/:id` | edit own proposal |
| 65 | POST | `/org-documents/:id/file` | re-issue upload URL for own proposal |
| 66 | POST | `/org-documents/:id/file/confirm` | confirm own proposal's upload |
| 67 | GET | `/org-documents/mine` | own proposals + their outcome |
| 68 | GET | `/org-documents/:id` | detail of own proposal |
| 69 | GET | `/org-documents/:id/view-url` | presigned GET for own proposal |

- **#62 returns `[]` (not an error)** when the org has `manager_can_view_team_documents` turned off — render an empty state, not an error.
- **#63** request is like #43 but **must** carry `"included_users": ["<one direct-report id>"]` and **no** other targeting arrays. Wrong shape → `422 MANAGER_SINGLE_TARGET_REQUIRED`; target outside the manager's reports → `403 FORBIDDEN`.
- Any manager request on a draft that isn't their own proposal → uniform `404`.

---

## 5. Self plane — base `/api/v1/documents`

Auth: any authenticated org member + `documents.access`.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 70 | GET | `/me/hr-documents` | documents issued to me |
| 71 | GET | `/me/hr-documents/:id` | detail (recipient-anchored) |
| 72 | GET | `/me/hr-documents/:id/view-url` | presigned GET + marks the doc "viewed" |

- **#70** `?state=…&type_id=…&requires_acknowledgement=true|false&limit=&offset=`. `data: { total, rows }`; each row is a recipient record with the (scrubbed) document joined under `document` (carrying `display_status`/`is_actionable`).
- Employees only ever see `published` / `superseded` / `retired` documents they were addressed to. A draft, or a document they weren't targeted for, is a uniform `404`.
- **#72** additionally flips the recipient's `pending → viewed` state the first time it is called (guarded — concurrent calls stamp `first_viewed_at` exactly once).

### `view-url` response shape (all three planes, #57 / #69 / #72)
```json
{ "success": true, "message": "OK", "data": {
  "view_url": "https://…",         // presigned S3 GET, or the raw reference URL
  "expires_at": "…",               // null for reference-backed docs
  "file_name": "leave-policy.pdf", // null for reference-backed docs
  "content_type": "application/pdf"
}}
```
Add `?disposition=attachment` to force a download instead of inline view.

---

## 6. Error codes quick reference

| Code | HTTP | When |
|------|------|------|
| `DOCUMENT_NOT_FOUND` | 404 | any unavailable `/:id` (missing, cross-org, confidential, out-of-scope) |
| `FORBIDDEN` | 403 | `/:userId` the caller may not act on; manager create outside scope |
| `MANAGER_SINGLE_TARGET_REQUIRED` | 422 | manager proposal not targeting exactly one report |
| `FLAG_CANNOT_BE_LOWERED` | 422 | trying to set `requires_acknowledgement`/`requires_signature` below the type default |
| `ACK_DUE_DAYS_REQUIRED` | 422 | acknowledgement on, `acknowledgement_due_days` missing |
| `TARGET_DEPARTMENT_UNKNOWN` / `TARGET_LOCATION_UNKNOWN` / `TARGET_USER_UNKNOWN` | 422 | a targeting id doesn't exist in this org |
| `EFFECTIVE_WINDOW_INVALID` | 422 | `effective_to` precedes `effective_from` |
| `ORG_DOCUMENT_NOT_EDITABLE` | 409 | editing/uploading on a non-draft |
| `ORG_DOCUMENT_FILE_MISSING` | 409 | publish with no confirmed file / reference |
| `INVALID_STATUS_TRANSITION` | 409 | e.g. publishing a non-draft, retiring a non-published |
| `ORG_DOCUMENT_ALREADY_PUBLISHED` | 409 | a concurrent publish already won |
| `ORG_DOCUMENT_DRAFT_EXISTS` | 409 | replace while a draft is already open (carries `details.document_id`) |
| `ORG_DOCUMENT_NOT_REPLACEABLE` | 409 | replace on a non-published row |
| `ORG_DOCUMENT_NOT_A_PROPOSAL` | 409 | reject on an HR-authored draft |
| `ORG_DOCUMENT_NOT_DELETABLE` | 409 | delete on a non-draft/rejected row |
| `RECIPIENT_SET_TOO_LARGE` | 422 | resolved audience over the sync limit |
| `RECIPIENT_ALREADY_COMPLETED` | 409 | waive on an acknowledged/signed recipient |
| `PROPOSER_SCOPE_CHANGED` | 409 | publishing a proposal whose manager lost scope (retry with `override_scope_change`) |
| `DOCUMENT_STORAGE_UNAVAILABLE` | 503 | S3 unreachable — safe to retry |
