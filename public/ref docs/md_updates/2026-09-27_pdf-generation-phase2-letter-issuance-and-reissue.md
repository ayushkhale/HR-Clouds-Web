# PDF Generation Phase 2 — Letter Issuance & Reissue (API change record)

**Date:** 2026-09-27
**Module:** Documents → PDF Generation (Phase 2)
**Audience:** Frontend / API consumers
**Feature flag:** `documents.access` (unchanged)
**Auth:** all new endpoints are `hr`-plane only (existing `hrAuth`: `authenticate` + `authorize(['hr'])` + `requireFeature('documents.access')`) — no new role, middleware or flag.

This phase makes a **letter a first-class `org_document`** (`origin='generated'`): HR issues and reissues letters through four new HR endpoints, and employees/managers read those letters through the **existing** org-document endpoints they already use (no new self-service or manager routes). Below is everything a client must handle.

---

## 1. New endpoints (#139–#142)

Base path: `/api/v1/documents/hr`.

| # | Method | Path | Purpose |
|---|---|---|---|
| 139 | POST | `/letters` | Issue a letter from an enabled template for one subject |
| 140 | GET | `/letters` | List the org's generated letters (paginated, filterable) |
| 141 | GET | `/letters/:id` | Get one letter with its generation metadata |
| 142 | POST | `/letters/:id/reissue` | Reissue a published letter (new version, new reference number) |

### 1.1 #139 `POST /letters` — issue

**Request**

```json
{
  "template_code": "experience_letter",
  "subject_user_id": "b1f2…",
  "field_overrides": { "purpose": "Visa application" },
  "effective_date": "2026-09-27",
  "idempotency_key": "client-supplied-opaque-string"
}
```

| Field | Rules |
|---|---|
| `template_code` | required, string, must exist in the letter-template registry |
| `subject_user_id` | required, uuid |
| `field_overrides` | optional object, depth 1, ≤ 20 keys; each value a string ≤ 500 chars / number / boolean; keys must be declared by the template and must not be a `derived_fields` key |
| `effective_date` | optional ISO date; within ± 365 days of today |
| `idempotency_key` | optional, 8–120 chars, `^[A-Za-z0-9._:-]+$` |

Unknown top-level keys ⇒ `400 VALIDATION_ERROR` (`unknown(false)`, consistent with the rest of the module).

**201 Created**

```json
{
  "success": true,
  "message": "Letter issued",
  "data": {
    "letter": {
      "id": "…", "document_group_id": "…", "version": 1,
      "status": "published", "origin": "generated",
      "reference_number": "ACME/EXP/2026-2027/0007",
      "document_type_id": "…", "title": "Experience Letter — Asha Rao",
      "file_name": "experience-letter-asha-rao-2026-09-27.pdf",
      "size_bytes": 84213, "checksum_sha256": "…",
      "is_confidential": true, "requires_acknowledgement": false,
      "recipient_count": 1, "published_at": "2026-09-27T09:14:22.183Z",
      "template": { "code": "experience_letter", "version": 1 }
    },
    "artifact": { "id": "…", "size_bytes": 84213, "content_hash": "…" },
    "reused": false
  }
}
```

**Idempotency:** an idempotent replay of the same request returns **`200` with `reused: true`** and the same body (instead of `201`), so a client can distinguish a fresh issue from a replay without diffing. The idempotency key you send is combined with the resolved inputs server-side; you do not need to change it on a replay.

> **Sending the second copy (EC-P2-8):** two calls with the **same** inputs (same template + subject + overrides + date) are treated as the same request and de-duplicated — the second returns the first letter with `reused: true`. If a user genuinely needs a **second identical letter** for the same employee on the same day (e.g. two separate visa applications), the client must send a **distinct `idempotency_key`** on the second call to force a new letter with its own reference number.

**No download data is ever returned here** — no `storage_key`, no view URL, no HTML, no rendered view-model. To download the PDF, HR uses the existing `#57 GET /org-documents/:id/view-url`; the employee uses `#65`.

### 1.2 #140 `GET /letters` — list

Query parameters (all optional): `template_code`, `subject_user_id`, `document_type_id`, `status` (`published | superseded | retired`), `reference_number` (exact match), `issued_from`, `issued_to` (ISO dates), `page` (≥ 1), `limit` (1–100, default 20), `sort` (`published_at | reference_number`, default `published_at`), `order` (`asc | desc`, default `desc`).

- `issued_from > issued_to` ⇒ `400`.
- Only generated letters are returned (`origin='generated'`, not soft-deleted), scoped to the caller's org.
- Response shape: `{ items: [...], pagination: { page, limit, total, total_pages } }`.
- Confidential letters are **not** hidden from HR.

### 1.3 #141 `GET /letters/:id` — detail

Returns the same shape as the existing `#55` org-document detail, **plus** `origin`, `reference_number`, the version chain (`version`, `supersedes_id`, `superseded_at`) and a `generation` block:

```json
"generation": {
  "artifact_id": "…", "template_code": "experience_letter", "template_version": 1,
  "renderer_version": "chromium-…", "input_hash": "…", "content_hash": "…",
  "size_bytes": 84213, "render_ms": 1840, "retention_class": "record",
  "generated_at": "2026-09-27T09:14:21.006Z", "pinned_date": "2026-09-27"
}
```

`404 DOCUMENT_NOT_FOUND` covers id-not-found, cross-org, soft-deleted **and an uploaded document** — #141 answers only about letters; for an upload the client uses `#55`.

### 1.4 #142 `POST /letters/:id/reissue` — reissue

Reissues a **published** letter: mints a new version in the same `document_group_id` with a **new** `reference_number`, re-rendered from current facts/branding, and marks the predecessor `superseded` (its bytes, artifact and reference number are never changed).

**Request**

```json
{
  "field_overrides": { "purpose": "Corrected designation" },
  "reason": "Designation corrected",
  "idempotency_key": "client-supplied-opaque-string"
}
```

All three fields are optional. **There is no `effective_date`** — a reissue is always dated *now*, so its financial year / reference number reflect the reissue date, not the predecessor's.

**201 / 200** — same `letter` + `artifact` envelope as #139, **plus** a `supersedes` block:

```json
"data": {
  "letter": { "…": "…", "version": 2, "supersedes_id": "…", "reference_number": "ACME/EXP/2026-2027/0009" },
  "artifact": { "…": "…" },
  "supersedes": { "document_id": "…", "version": 1, "reference_number": "ACME/EXP/2025-2026/0007" },
  "reused": false
}
```

An idempotent replay returns `200` + `reused: true`; `supersedes` is `null` when nothing was superseded.

---

## 2. New error codes clients should handle

| Status | Code | Endpoint(s) | Meaning |
|---|---|---|---|
| 404 | `LETTER_TEMPLATE_UNKNOWN` | #139 | `template_code` not in the registry |
| 409 | `LETTER_TEMPLATE_DISABLED` | #139 | template not enabled for the org |
| 409 | `PDF_RENDER_IN_PROGRESS` | #139, #142 | a concurrent request with the same key is still rendering — **retry shortly** |
| 409 | `LETTER_REFERENCE_CONFLICT` | #139, #142 | reference number collided (unique per org) — safe to retry |
| 409 | `PDF_RETRY_LIMIT_EXCEEDED` | #139, #142 | too many failed attempts under this key; use a new request |
| 409 | `LETTER_NOT_REISSUABLE` | #142 | the target letter is not in `published` status |
| 409 | `ORG_DOCUMENT_ALREADY_PUBLISHED` | #142 | another published version already exists in the group |
| 409 | `DOCUMENT_ORIGIN_GENERATED` | #45, #46, #48 | **see §4** — a generated letter cannot be replaced by an upload |
| 422 | `PDF_DATA_INCOMPLETE` / `PDF_TOO_LARGE` | #139, #142 | a required field is unresolved / PDF over 6 MB |
| 422 | `LETTER_FIELD_UNKNOWN` / `LETTER_FIELD_NOT_OVERRIDABLE` | #139, #142 | a bad `field_overrides` key |
| 422 | `LETTER_FACTS_MISSING` | #139, #142 | a required employee fact is absent (names the fields) |
| 422 | `LETTER_REFERENCE_PATTERN_INVALID` | #139, #142 | the configured reference pattern is invalid |
| 502 | `PDF_RENDERER_UNAVAILABLE` / `STORAGE_UNAVAILABLE` | #139, #142 | renderer/storage transport error |
| 503 | `PDF_RENDERER_NOT_CONFIGURED` | #139, #142 | `PDF_RENDERER_BASE_URL` not set |
| 504 | `PDF_RENDER_TIMEOUT` | #139, #142 | renderer exceeded its timeout |

`404 DOCUMENT_NOT_FOUND` is the **uniform** denial for cross-org / missing / soft-deleted / not-a-letter on #140/#141/#142 — no distinguishing field. Every 5xx body carries `artifact_id` for support triage; no error body ever contains a renderer URL, API key, storage key or stack trace.

**Retry guidance:** `409 PDF_RENDER_IN_PROGRESS` and `409 LETTER_REFERENCE_CONFLICT` are transient — retry the same request (the server is idempotent). `409 PDF_RETRY_LIMIT_EXCEEDED` is terminal for that key — surface it to the user.

---

## 3. New fields on **existing** responses (`#52`, `#55`, `#63`, `#64`)

Generated letters now flow through the same org-document reads employees and managers already use. For a row with `origin='generated'` the following fields are now present (they are `null`/absent for ordinary uploaded documents):

- `origin` — `'uploaded'` (all pre-Phase-2 rows) or `'generated'`.
- `reference_number` — the letter's human reference (uploads: `null`).
- `generation` (detail reads) — the metadata block shown in §1.3.

**Impact:** these are **additive**. Existing clients that ignore unknown fields are unaffected. A client that renders a document list can now show a reference number and a "generated letter" badge by reading `origin`.

---

## 4. Behavioural change to existing endpoints `#45`, `#46`, `#48`

The upload handshake now **rejects a generated letter**:

- `#45 POST /org-documents/:id/file` (issue upload URL)
- `#46 POST /org-documents/:id/file/confirm` (confirm upload)
- `#48 POST /org-documents/:id/replace`

If the target row has `origin='generated'`, these return **`409 DOCUMENT_ORIGIN_GENERATED`** ("a generated document cannot be replaced by an upload; reissue it instead"). Uploaded documents are unaffected. The guard lives in the shared `document_org.service`, so the manager/self upload equivalents that reuse the same handlers (e.g. `#65`/`#66`) return the same `409` if ever pointed at a generated row. This is the **only** behavioural change to a pre-existing endpoint, and it is only reachable for a generated row, which no client could have created before this phase — so in practice no existing flow changes. To supersede a letter, use `#142 reissue`.

---

## 5. New org settings (settings endpoint gains five fields)

The document settings GET/PUT payload now includes five keys (see `org_settings_registry.md` #82–#86 for full detail):

| Key | Type | Default | Notes |
|---|---|---|---|
| `letter_branding_enabled` | boolean | `true` | **now editable** (was enforced in Phase 1 but not mutable — bug fixed) |
| `letter_preview_rate_per_hour` | integer 1–1000 | `60` | **now editable** (same fix) |
| `letter_reference_pattern` | string ≤ 120 | `{ORG_CODE}/{TYPE}/{FY}/{SEQ:0000}` | token-validated on write (see below) |
| `letter_default_confidential` | boolean | `true` | frozen onto each letter at issue |
| `letter_requires_acknowledgement_default` | boolean / null | `null` (inherit type) | frozen onto each letter at issue |

`letter_reference_pattern` accepts only the tokens `{ORG_CODE}`, `{TYPE}`, `{FY}`, `{YYYY}`, `{MM}` and exactly one width-bearing sequence token `{SEQ:0000}` (1–6 zeros). A bad pattern, a blank value, or a missing/duplicate `{SEQ}` is rejected with **`422 LETTER_REFERENCE_PATTERN_INVALID`** at settings-save time. Out-of-range `letter_preview_rate_per_hour` ⇒ `422 SETTING_OUT_OF_RANGE`.

---

## 6. Concurrency behaviour change in the shared render pipeline (affects existing previews #134/#138)

The internal `pdf_render.service.renderAndRecord` — used by the Phase 1 preview endpoints `#134` and `#138` as well as the new #139/#142 — changed how it handles a repeated idempotency key:

- **Before (Phase 1):** a same-key probe that found a leftover `pending` or `failed` artifact row **reused** it and re-rendered into it.
- **Now:**
  - a `failed` row **re-surfaces the recorded failure** (`PDF_TEMPLATE_INVALID` / `PDF_RENDER_TIMEOUT` / `PDF_RENDERER_NOT_CONFIGURED` / `STORAGE_UNAVAILABLE` / `PDF_RENDERER_UNAVAILABLE`) instead of silently re-rendering — a genuine retry must use a fresh request;
  - a `pending` row (a concurrent request still rendering under the same key) returns **`409 PDF_RENDER_IN_PROGRESS`** rather than double-rendering;
  - only a `ready` row is reused; other states render fresh.

**Client impact:** a preview or issue call that repeats an in-flight key can now get `409 PDF_RENDER_IN_PROGRESS` — treat it as *retry shortly*. A previously-failed key returns the mapped 4xx/5xx for that failure instead of a fresh render attempt. This makes the renderer safe against duplicate submits and retries.

---

## 7. Not added (intentionally)

No employee "my letters" endpoint, no manager letter endpoint, no separate letter download or delete/retire endpoint, no bulk issue. A letter is an `org_document`, so the existing `#63/#64/#65/#66/#67` (employee) and `#71/#72` (manager) endpoints already read, download and acknowledge it under the access control they already enforce. Letter delete/retire uses the existing `#49/#51`.

---

## 8. Operator note (not a client concern)

Migration `00056` (letter issuance/sequences) and seeder `010` (letter document types) must be applied before these endpoints function, and the renderer (`PDF_RENDERER_BASE_URL` + auth) must be reachable — until then #139/#142 return `503 PDF_RENDERER_NOT_CONFIGURED`. A daily cron (`pdf_artifact_sweeper`, 03:50 IST) cleans up any artifact left `pending` past 30 minutes and its orphaned object.
