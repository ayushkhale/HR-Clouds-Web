# PDF Generation — Phase 1: Letter Branding & Templates (API change record)

**Date:** 2026-09-27
**Module:** Documents → PDF Generation (Phase 1)
**Endpoints added:** #130–#138 (nine, all HR-plane)
**Feature flag:** `documents.access`
**Migration:** `00055-create-pdf-generation.js` (handed back to the operator, **not run** by the implementer)

This record is the frontend contract for the nine new letter endpoints. It lists every
request/response shape, the form-descriptor contract, the two binary (PDF) endpoints and their
headers, the `storage_key_token` upload handshake, and the full error table. Deviations from the
Phase 1 plan are recorded at the end.

---

## Conventions

- **Base path:** `/api/v1/documents/hr`
- **Auth:** every endpoint requires a valid access token, role `hr`, and the `documents.access`
  feature. `org_id` is always taken from the token — **no endpoint accepts an org or resource id**;
  the only path parameter anywhere is `:code` (a template code).
- **Envelope (JSON endpoints):** `{ "success": true, "message": "...", "data": { ... } }`.
- **Errors:** `{ "success": false, "message": "...", "errorCode": "..." }` with the HTTP status in
  the table below. Validation failures are `400 VALIDATION_ERROR` with `message` set to the first
  Joi detail.
- **Never returned in any body:** a storage key, `input_snapshot`, a `data:` URI, or a raw S3 URL.
  Assets are surfaced only as `*_present` / size / type, or (on request) as short-TTL signed URLs.

---

## #130 — GET `/letter-branding`

Loads the org's letterhead identity, creating the row on first read.

- **Query:** `include_asset_urls=true` (optional) adds short-TTL signed asset URLs.
- **200 response `data`:**

```json
{
  "branding": {
    "signatory_name": "…|null", "signatory_designation": "…|null",
    "registered_address_lines": ["…"],
    "cin": "…|null", "gstin": "…|null", "pan": "…|null", "tan": "…|null",
    "contact_email": "…|null", "contact_phone": "…|null", "website": "…|null",
    "accent_color_hex": "#1F2937", "footer_note": "…|null", "letterhead_enabled": true,
    "logo_present": false, "logo_content_type": null, "logo_size_bytes": null,
    "signature_present": false, "signature_content_type": null, "signature_size_bytes": null,
    "updated_at": "…"
  },
  "inherited": { "org_name": "…", "website": "…", "address_line_1": "…", "...": "…from organization_profiles" },
  "assets": { "logo_present": false, "signature_present": false, "logo_url": "…(only if include_asset_urls)", "signature_url": "…" }
}
```

`inherited` is the org profile fallback (read-only context); `branding` fields win where set.

---

## #131 — PUT `/letter-branding`

Full replace of the **text** fields only (assets go through #132/#133). Send at least one field.

- **Body (all optional, min 1):**

| Field | Rule |
|---|---|
| `signatory_name`, `signatory_designation` | ≤120 chars, no `<`/`>`; `""` clears to null |
| `registered_address_lines` | array of strings ≤120 each, **≤5 entries**; trimmed, empties dropped |
| `cin`, `gstin`, `pan`, `tan` | ≤32 chars, no `<`/`>`; `""` clears |
| `contact_email` | email, ≤150; `""` clears |
| `contact_phone` | ≤30, no `<`/`>`; `""` clears |
| `website` | **https-only** URI, ≤255; `""` clears |
| `accent_color_hex` | must match `^#[0-9A-Fa-f]{6}$` (interpolated into CSS — never cleared to null) |
| `footer_note` | ≤300, no `<`/`>`; `""` clears |
| `letterhead_enabled` | boolean |

- **200 response `data`:** same shape as #130.

---

## #132 — POST `/letter-branding/assets/upload-url`

Issues a presigned PUT URL and an opaque `storage_key_token`. **201.**

- **Body:** `{ "asset_type": "logo"|"signature", "file_name": "…", "content_type": "image/png"|"image/jpeg", "size_bytes": <int> }`
- **Caps:** logo ≤ 512 KB, signature ≤ 256 KB. PNG/JPEG only.
- **201 response `data`:**

```json
{ "upload_url": "https://…", "storage_key_token": "<opaque signed token>", "expires_in": 600, "required_headers": { "…": "…" } }
```

Frontend flow: `PUT` the file bytes to `upload_url` with `required_headers`, then call #133 with the
`storage_key_token`. **The token is opaque** — do not parse it; it carries the claim so no
pending row is written server-side (see deviations).

---

## #133 — POST `/letter-branding/assets/confirm`

Commits an uploaded asset after the server HEAD-verifies it from S3 (content-type and size are
checked **from the object, not your claim**).

- **Body:** `{ "storage_key_token": "…", "checksum": "…(optional)" }`
- **200 response `data`:** same shape as #130 (with the new asset now `*_present: true`).
- **Idempotent:** confirming the same token twice returns `200` with the same state.

---

## #134 — POST `/letter-branding/preview` → `application/pdf`

Renders a watermarked A4 letterhead-probe PDF so HR can verify branding.

- **Body:** must be exactly `{}`.
- **Success:** `200`, binary PDF. Headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename*=UTF-8''branding-preview.pdf`
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: private, no-store`
  - `X-Artifact-Id: <uuid>` (for support correlation)
- Rate-limited per org (setting #83).

---

## #135 — GET `/letter-templates`

The template catalog joined with the org's enablement state.

- **Query:** `enabled=true|false` (optional; must be exactly `true` or `false`).
- **200 response `data`:**

```json
{ "templates": [
  { "code": "experience_letter", "title": "Experience Letter", "current_version": 1,
    "is_enabled": false, "pinned_version": null, "has_saved_fields": false, "is_orphaned": false }
] }
```

`is_orphaned: true` marks a stored config whose template code has left the catalog
(`current_version: null`); such rows are surfaced, never hidden.

---

## #136 — GET `/letter-templates/:code`

Everything the config form needs. `:code` must match `^[a-z][a-z0-9_]{2,63}$` and exist.

- **200 response `data`:**

```json
{
  "template": {
    "code": "experience_letter", "title": "Experience Letter", "current_version": 1,
    "required_fields": ["employee_name", "designation", "joining_date_text", "relieving_date_text"],
    "optional_fields": ["department_name", "employee_code", "closing_note"],
    "fields": [
      { "key": "place_of_issue", "label": "Place Of Issue", "type": "string", "max_length": 80, "required": false },
      { "key": "hr_contact_line", "label": "Hr Contact Line", "type": "string", "max_length": 160, "required": false }
    ],
    "sample_data": { "employee_name": "Asha Sample", "…": "…" }
  },
  "config": { "is_enabled": true, "pinned_version": null, "saved_fields": { "place_of_issue": "Pune" } }
}
```

**Form-descriptor contract:** `template.fields` is the schema for the per-org **saved fields** the
frontend renders as a form. It is `[{key, label, type, max_length, required}]` — the frontend is
never handed Joi internals. `required_fields`/`optional_fields` are the *template body* fields (the
letter's own placeholders, sourced from sample/override), distinct from `fields` (the org's saved
config inputs). `config` is `null` when the template has never been configured.

---

## #137 — PUT `/letter-templates/:code/config`

Enable/disable a template and store its per-org saved fields.

- **Body:**

| Field | Rule |
|---|---|
| `is_enabled` | boolean, **required** |
| `saved_fields` | object; each key/value validated against **this template's** `fields` schema. An unknown key is a `400` — it is **not** silently stripped |
| `pinned_version` | integer or null; Phase 1 accepts only `1` (or null = always current) |
| `reference_pattern`, `requires_acknowledgement`, `is_confidential` | accepted and stored, but **not read by Phase 1** |

- **200 response `data`:** `{ "config": { "is_enabled": true, "pinned_version": null, "saved_fields": { … } } }`
- **Idempotent** (full replace).

---

## #138 — POST `/letter-templates/:code/preview` → `application/pdf`

Renders a watermarked template PDF with **sample data only**.

- **Body:** `{ "use_saved_fields": true, "override_fields": { … } }` (both optional; `use_saved_fields`
  defaults `true`).
  - `override_fields` keys must be a **subset** of the template's `fields` schema; each value is
    re-validated by it.
  - **`subject_user_id` is rejected** (`400`) — Phase 1 previews carry no real employee PII.
- **Merge order:** `sample_data ← saved_fields ← override_fields` (last wins).
- **Success:** `200`, binary PDF. Headers as #134 but
  `Content-Disposition: inline; filename*=UTF-8''<code>-preview.pdf`.
- Rate-limited per org (setting #83).

---

## Error catalogue

| Status | errorCode | Where | Meaning |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | all | Body/param/query failed a shape rule (incl. unknown `saved_fields`/`override_fields` key, `subject_user_id`, bad `:code`, bad `?enabled`) |
| 404 | `TEMPLATE_NOT_FOUND` | #136/#137/#138 | Unknown template code (same body another org's would get) |
| 404 | `UPLOAD_CLAIM_NOT_FOUND` | #133 | `storage_key_token` invalid, expired, wrong org, or wrong purpose |
| 409 | `UPLOAD_NOT_FOUND` | #133 | Token valid but no object was uploaded to the key |
| 409 | `TEMPLATE_DISABLED` | #138 | `use_saved_fields` and the config exists but is disabled |
| 413 | `FILE_TOO_LARGE` | #132/#133 | Asset exceeds its cap (logo 512 KB / signature 256 KB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | #132/#133 | Not PNG/JPEG (verified from the object on confirm) |
| 422 | `PDF_DATA_INCOMPLETE` | #138 | A required template field resolved empty after the merge |
| 429 | `PREVIEW_RATE_LIMITED` | #134/#138 | Per-org hourly preview cap reached (setting #83) |
| 500 | `PDF_TEMPLATE_INVALID` | #134/#138 | Renderer rejected the template (a server bug, not user input) |
| 502 | `STORAGE_UNAVAILABLE` | #132/#133/#134/#138 | S3 unreachable while an asset operation was required |
| 502 | `PDF_RENDERER_UNAVAILABLE` | #134/#138 | Renderer unreachable / returned an invalid or non-PDF response |
| 503 | `PDF_RENDERER_NOT_CONFIGURED` | #134/#138 | `PDF_RENDERER_BASE_URL` is unset — the other seven endpoints still work |
| 504 | `PDF_RENDER_TIMEOUT` | #134/#138 | Renderer exceeded the client timeout (not retried) |

Frontend note: `502`/`503`/`504` on a preview are transient/config-side — surface a retry, not a
validation message. `422 PDF_DATA_INCOMPLETE` names the missing field in `message`.

---

## Deviations from the Phase 1 plan (for reviewers)

- **OD-P1-1 (no KMS):** assets are stored without a customer-managed KMS key in Phase 1, per the
  operator pre-flight; bucket-level encryption applies.
- **Timeout is not retried:** a renderer timeout (`504 PDF_RENDER_TIMEOUT`) is returned on the first
  occurrence. Only connect-class failures (network / throttle / 5xx / bad-response) are retried
  once, matching the renderer provider's `RETRYABLE` set.
- **`storage_key_token` is a signed JWT, not a pending DB row.** The plan's #132/§14 text implies a
  "pending column set", but the schema (§8.2 / migration 00055) has **no** pending-claim columns —
  `logo_storage_key`/`signature_storage_key` are written only at confirm (#133). The claim
  therefore rides in a purpose-scoped, 10-minute signed token (`purpose: letter_asset_upload`)
  reusing the existing `jsonwebtoken` dependency. This needs no migration change, leaves no orphan
  pending rows, and requires no advisory lock at presign (nothing to serialise). #133 re-verifies
  content-type and size from HeadObject, never from the token's claim.

---

## Migration hand-back (§25)

`00055-create-pdf-generation.js` is **additive** (three tables + two `document_settings` columns
`#82`/`#83`, all with safe defaults) and has **not** been run. Deploying without running it is safe:
the seven non-rendering endpoints return errors only when their tables are queried, and the two
preview endpoints already return `503` when `PDF_RENDERER_BASE_URL` is unset.

> ⚠️ **Destructive `down()`:** the migration's `down()` **DROPS `pdf_render_artifacts`**, destroying
> all render evidence, and drops the enum types `CASCADE`. Treat it like `00051`'s destructive
> down — do not roll back in an environment where render history matters.
