# Leave ↔ Documents Attachment Bridge, Audience-Neutral View URL & Phase-5 Settings

**Date:** 2026-09-25
**Modules:** Leave, Documents
**Type:** Additive feature + one behavioural change to an existing field (`leave_requests.document_url`)
**Audience:** Frontend / API clients

---

## ⚠️ Frontend action required

`leave_requests.document_url` **may now hold a relative API path**, not only an absolute URL.

When a leave is submitted with the new optional `document_id`, the leave service resolves it and stores:

```
/api/v1/documents/attachments/<document_uuid>/view-url
```

instead of an absolute `https://…` link. This path is **API endpoint #128**, not a file:

- Fetched plainly, it returns **`200 { "url": "<signed s3 url>", "expires_at": "…" }`** (JSON).
- A client that renders `document_url` directly as an `<a href>` will therefore show the user **raw JSON**, not the file.

**What to do:**

- To make the stored value directly clickable, append **`?redirect=true`**:
  `/api/v1/documents/attachments/<uuid>/view-url?redirect=true` answers **`302 Found`** with the signed URL in the `Location` header, so a browser opens the file. **Put this form in an anchor tag.**
- To fetch the URL programmatically (e.g. to render an inline preview), call the plain path and read `data.url` from the `200` body.
- Absolute `https://…` values (the pre-existing shape) are **unchanged** — render them directly as before. A value beginning with `/api/v1/documents/attachments/` is the new shape and needs the treatment above.

Nothing is required for callers that never send `document_id`.

---

## Summary

- **Leave submit** (`POST /api/v1/leaves`) accepts an **optional `document_id`** (a UUID of one of the applicant's own documents). The leave service resolves it into the audience-neutral attachment path above and stores that in `document_url`. Callers who pass a raw `document_url` are **unaffected**.
- **New endpoint #128** `GET /api/v1/documents/attachments/:id/view-url` — one audience-neutral path that returns a fresh signed view URL for an employee document, correct for the applicant, their manager and HR alike.
- **3 new org settings** (#79–#81) on `document_settings` — see the last section.

> **Feature flag:** #128 requires `documents.access`. Leave endpoints are unchanged in their feature gating.

---

## 1. Leave submit — the optional `document_id`

`POST /api/v1/leaves` request body adds one optional field:

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `document_id` | UUID | No | A document the applicant owns. Resolved server-side into `document_url`. |
| `document_url` | string | No | Existing field. Absolute `http(s)` URL **or** the relative attachment path. |

### Precedence (both supplied)

If **both** `document_id` and `document_url` are sent, **`document_id` wins**: the raw `document_url` is ignored and the response/record carries the resolved attachment path. (A redundant field should not cost an applicant their leave, so this is not an error.)

### Validation of `document_url`

The `document_url` validator now accepts **either** shape, so a stored value echoed back through the submit schema (re-apply, duplicate-leave, edit-and-resubmit) is not rejected on a value this system itself produced:

- an absolute `http`/`https` URL (≤ 255 chars), **or**
- the relative path `^/api/v1/documents/attachments/<uuid>/view-url$`.

### Errors when resolving `document_id`

| Condition | Status / code |
|---|---|
| Document not found or not readable by the applicant | `404 DOCUMENT_NOT_FOUND` — **the leave is not created** |
| Document belongs to someone other than the leave's subject | `422 DOCUMENT_NOT_OWNED_BY_SUBJECT` |
| Document status is not `available` or `pending_verification` (e.g. rejected, quarantined, expired, archived, deleted) | `422 DOCUMENT_NOT_ATTACHABLE` |

Resolution is **blocking by design**: silently dropping the attachment on a document-requiring leave type would produce an approved leave with no evidence. A leave type that requires a document is satisfied by **either** `document_id` or a raw `document_url`.

---

## 2. New endpoint #128 — audience-neutral view URL

```
GET /api/v1/documents/attachments/:id/view-url
```

- **Auth:** any authenticated org member with `documents.access`.
- **Who may open it:** the document's **owner**, the owner's **manager chain**, and **HR** — the endpoint resolves the reader's plane from the token and applies the standard document authority matrix. Everyone else (and any cross-tenant id) receives a uniform **`404`**.
- It adds **no new capability** — each plane already had its own view-url endpoint. #128 exists so a single stored string (a leave's `document_url`) is correct for all three readers at once.

### Query parameters

| Param | Values | Default | Effect |
|---|---|---|---|
| `redirect` | `true` \| `false` | `false` | `true` ⇒ `302 Found` with the signed URL in `Location`. `false` ⇒ `200` JSON body. |
| `disposition` | `inline` \| `attachment` | `inline` | `Content-Disposition` on the signed URL. |

### Responses

**`200 OK`** (plain):
```json
{ "success": true, "message": "OK", "data": { "view_url": "https://…signed…", "expires_at": "2026-09-25T12:34:56.000Z", "file_name": "certificate.pdf", "content_type": "application/pdf" } }
```

**`302 Found`** (`?redirect=true`): empty body, `Location: https://…signed…`.

### Confidentiality

A manager who is not permitted to see a confidential document type receives **`404`** from #128, exactly as elsewhere — the leave still shows that an attachment is present, but the file itself stays invisible to that reader. If the document is **deleted after** the leave is submitted, the stored path is left intact and #128 then returns `404` at view time; the leave record is not rewritten.

---

## 3. New org settings #79–#81

Added to the `document_settings` update surface (HR settings endpoint). All three are optional and default to values that **preserve current behaviour**.

| # | Key | Type | Default | Allowed |
|---|---|---|---|---|
| 79 | `document_publish_sync_threshold` | integer | `20000` | `100 … 20000` |
| 80 | `document_offboarding_archive_mode` | string | `'archive'` | `archive` \| `retain` |
| 81 | `document_offboarding_exit_pack_scope` | string | `'all'` | `all` \| `org_issued` \| `employee_owned` |

**Response-class note (#79):** lowering `document_publish_sync_threshold` can change the org-document **publish** response from `200` to `202` for large audiences (the roster is then filled in the background). Treat `202` as success and poll the materialisation-progress endpoint (#127). See the org-settings registry rows #79–#81 for full detail.

---

## What did NOT change

- Callers that send only a `document_url` (or neither field) see **identical** behaviour to before.
- No leave-module database column was added or altered; `document_url` (`STRING(255)`) is reused.
- The existing per-plane view-url endpoints (HR / manager / self) are unchanged; #128 is additive.
