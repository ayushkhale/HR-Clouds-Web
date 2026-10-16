# Documents Module — Phase 3 (Acknowledgements, Signatures & Compliance)

**Date:** 2026-09-24
**Module:** Documents
**Scope:** Seven new endpoints (#73–#79), additive changes to three existing responses (#59, #70, #71), a behavioural change on two writes (#47, #60), three new org settings, and seven new error codes.
**Breaking changes:** None. Every change to an existing response is additive.

> **Frontend action required:** New self-service acknowledge/sign flows, an HR compliance dashboard + CSV export, and a manager team-compliance view. Existing consumers of #59/#70/#71 keep working unchanged; new fields are additive. See **§7 Frontend migration guidance** for the one field to adopt (`document.next_action`).

All paths are under `/api/v1/documents`. Every response uses the module envelope `{ success, message, data }` **except #77**, which streams a raw CSV body.

---

## 1. New endpoints

### #73 — Acknowledge a document (self)
`POST /me/hr-documents/:id/acknowledge`
Auth: `authenticate` + `requireFeature('documents.access')` (no role gate — recipient-anchored).

**Request body** (optional):
```json
{ "confirm": true }
```
`confirm` accepts only `true`; the body may also be omitted entirely. No other field is accepted (`acknowledged_at`, `document_version`, etc. are rejected — evidence is server-captured).

**Response `201`** (first acknowledgement) / **`200`** (idempotent replay):
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "already_acknowledged": false,
    "acknowledgement": {
      "id": "uuid",
      "org_document_id": "uuid",
      "user_id": "uuid",
      "document_version": 3,
      "content_checksum": "<sha256>",
      "acknowledged_at": "2026-09-24T...Z",
      "ip_address": "10.0.0.9"
    },
    "recipient_state": "acknowledged"
  }
}
```
A retry of an already-acknowledged document returns `200` with `already_acknowledged: true` and the same evidence row. **Use the status code to distinguish first-write from replay.**

**Notable errors:** `422 ACKNOWLEDGEMENT_NOT_REQUIRED` (document does not require acknowledgement), `409 RECIPIENT_WAIVED` (`{ state: "waived" }`), `409 ORG_DOCUMENT_NOT_ACTIONABLE` (`{ display_status }` — expired/scheduled), `404 DOCUMENT_NOT_FOUND` (non-recipient or non-existent — indistinguishable by design).

### #74 — Sign a document (self)
`POST /me/hr-documents/:id/sign`

**Request body** (required):
```json
{ "signer_name": "Asha Rao" }
```
`signer_name`: 2–150 chars, trimmed. The provider is **not** taken from the body — it comes from the org setting `document_signature_provider`.

**Response `201`** / **`200`** (replay):
```json
{
  "success": true,
  "data": {
    "already_signed": false,
    "signature": {
      "id": "uuid", "org_document_id": "uuid", "user_id": "uuid",
      "provider": "internal_typed", "status": "signed", "document_version": 3,
      "content_checksum": "<sha256>", "signer_name": "Asha Rao",
      "requested_at": "2026-09-24T...Z", "signed_at": "2026-09-24T...Z",
      "ip_address": "10.0.0.9"
    },
    "recipient_state": "signed"
  }
}
```

**Notable errors:** `422 SIGNATURE_NOT_REQUIRED`; `422 SIGNER_NAME_MISMATCH` — **no `details`**, and the expected name is deliberately absent from the message (the endpoint must not be a name-disclosure oracle); `503 SIGNATURE_PROVIDER_UNAVAILABLE` (`{ provider }`) when the org has configured `docusign`/`adobe_sign` — returned **before any state change**; plus the same waived/not-actionable/404 cases as #73.

### #75 — My evidence (self)
`GET /me/hr-documents/:id/acknowledgement`

Returns the caller's own acknowledgement and/or signature for the document, `404` if they have neither (or are not a recipient).
```json
{
  "data": {
    "org_document_id": "uuid", "user_id": "uuid", "document_version": 3,
    "acknowledgement": { ... same shape as #73 ... } | null,
    "signature": { ... same shape as #74 ... } | null
  }
}
```
Never exposes `storage_key`, `reference_url`, `user_agent`, or another employee's identity.

### #76 — Org-wide compliance (HR)
`GET /hr/org-documents/compliance`
Auth: `authorize(['hr'])`.

**Query:** `type_id`, `document_id`, `department_id` (all UUID), `overdue_only` (bool, default `false`), `limit` (1–100, default 25), `offset` (default 0). Unknown params are rejected.

**Response:** grouped **by document**.
```json
{
  "data": {
    "total": 12,
    "as_of": "2026-09-24",
    "rows": [{
      "document_id": "uuid", "title": "Code of Conduct", "version": 2,
      "document_type_id": "uuid",
      "type": { "id": "uuid", "code": "policy", "name": "Policy" },
      "published_at": "2026-01-01T...Z",
      "requires_acknowledgement": true, "requires_signature": false,
      "total": 10, "completed": 4, "pending": 3, "overdue": 2, "waived": 1,
      "completion_rate": 40
    }]
  }
}
```
`total`/`completed`/`pending`/`overdue`/`waived` always sum consistently (`completed + pending + overdue + waived === total`). Covers `status = 'published'`, obligation-bearing documents only. `department_id` filters through the canonical `employee_profiles.department_id`.

### #77 — Compliance CSV export (HR)
`GET /hr/org-documents/compliance/export`
Auth: `authorize(['hr'])`.

**Query:** same filters as #76 **minus** pagination (`type_id`, `document_id`, `department_id`, `overdue_only`). No `limit`.

**Response:** raw `text/csv; charset=utf-8`, UTF-8 BOM, CRLF line endings, `Content-Disposition: attachment; filename="document-compliance-<YYYY-MM-DD>.csv"`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. One row **per recipient**; every user-controlled cell is formula-guarded.

**Columns (fixed order):** `document_id, document_title, document_version, employee_code, user_id, state, compliance_state, due_on, days_remaining, first_viewed_at, acknowledged_at, acknowledged_version, signed_at, signer_provider, waived_at, waived_reason`.

**Error:** `422 EXPORT_TOO_LARGE` (`{ row_count, max_rows: 50000 }`) when the filters match more than 50 000 rows — returned as JSON **before any bytes are written**. Each successful export writes one `org_document.compliance_exported` audit row (no employee identifiers).

### #78 — One employee's evidence (HR)
`GET /hr/org-documents/:id/acknowledgements/:userId`
Auth: `authorize(['hr'])`.

Same evidence pair as #75 for a named employee, plus `recipient_state`:
```json
{
  "data": {
    "org_document_id": "uuid", "user_id": "uuid", "document_version": 3,
    "acknowledgement": { ... } | null,
    "signature": { ... } | null,
    "recipient_state": "signed"
  }
}
```
Missing document → `404 DOCUMENT_NOT_FOUND`; non-recipient → `404 RECIPIENT_NOT_FOUND`; recipient with no evidence yet → `404 DOCUMENT_NOT_FOUND`. Never exposes `user_agent`.

### #79 — Team compliance (manager)
`GET /manager/org-documents/compliance`
Auth: `authorize(['manager','hr'])` + `requireFeature('documents.access')`, gated further by the org setting `manager_can_view_team_documents`.

**Query:** `user_id`, `document_id` (UUID), `overdue_only` (bool), `limit` (1–100, default 25), `offset`. Unknown params rejected.

**Response:** grouped **by employee**, scoped to the manager's direct/indirect reports (`getAccessibleUserIds`); confidential documents excluded.
```json
{
  "data": {
    "total": 2,
    "as_of": "2026-09-24",
    "rows": [{
      "user_id": "uuid", "employee_code": "E-1", "display_name": "Asha Rao",
      "pending_count": 1, "overdue_count": 1,
      "documents": [{
        "document_id": "uuid", "title": "Code of Conduct", "version": 2,
        "state": "pending", "compliance_state": "overdue",
        "due_on": "2026-09-01", "days_remaining": -23
      }]
    }]
  }
}
```
- An out-of-scope `user_id` returns an **empty list**, not a `403` (the endpoint is not `/:userId`-addressed; leaking existence is worse).
- `manager_can_view_team_documents = false` → `403 FORBIDDEN` (this path is collection-addressed, so `403` here is correct and does not conflict with the module's uniform-`404` rule on `/:id` paths).

---

## 2. Additive changes to existing responses

### #59 — `GET /hr/org-documents/:id/recipients`
Each roster row gains: `compliance_state`, `is_overdue`, `days_remaining`, `acknowledged_at`, `acknowledgement_id`, `acknowledged_version`, `signed_at`, `signature_request_id`. A top-level `compliance` block is added: `{ requires_acknowledgement, requires_signature, total, completed, pending, overdue, waived, completion_rate, due_on_basis, ... }`. New optional query filter: `compliance_state` (`completed|waived|overdue|pending`).

### #70 — `GET /me/hr-documents` and #71 — `GET /me/hr-documents/:id`
Each document gains an `acknowledgement` block and `document.next_action`:
```json
"acknowledgement": {
  "required": true, "signature_required": false,
  "state": "overdue", "due_on": "2026-09-01", "days_remaining": -23,
  "is_overdue": true, "is_blocking": false,
  "acknowledged_at": null, "signed_at": null
},
"document": { "...": "...", "next_action": "acknowledge" }
```
`next_action` ∈ `acknowledge | sign | null` — the recipient-aware field the frontend should read. `document.is_actionable` is **unchanged** (status-only) and retained for backward compatibility. #70 also gains optional filters `compliance_state` and `overdue_only`.

---

## 3. Behavioural change on writes (S-13)

- **#47 `POST /hr/org-documents/:id/publish`** and **#60 `POST /hr/org-documents/:id/recipients/sync`**: when a document requires acknowledgement but has a `null` per-document `acknowledgement_due_days`, `due_on` now falls back to the org default `document_acknowledgement_due_days` (instead of remaining `null`, which produced no overdue signal). A document that does **not** require acknowledgement still gets `due_on = null`.
- No field is added or removed on either response; the effect is visible as populated `due_on` values on #59/#70. Changing the org default **never** rewrites `due_on` on existing recipient rows — the fallback applies at publish and at sync only.

---

## 4. New org settings (on `GET`/`PUT /hr/settings`)

| Key | Type | Default | Range/Enum |
|---|---|---|---|
| `document_acknowledgement_due_days` | integer (days) | `7` | 1–365 |
| `document_acknowledgement_blocking` | boolean | `false` | — |
| `document_signature_provider` | string enum | `internal_typed` | `internal_typed \| docusign \| adobe_sign` |

Setting the provider to `docusign`/`adobe_sign` is **permitted** at write time (so an org can stage a switch); every sign call then returns `503 SIGNATURE_PROVIDER_UNAVAILABLE` until an integration ships.

---

## 5. New error codes

| Code | HTTP | Cause | `details` |
|---|---|---|---|
| `ACKNOWLEDGEMENT_NOT_REQUIRED` | 422 | #73 on a non-acknowledgement document | none |
| `SIGNATURE_NOT_REQUIRED` | 422 | #74 on a non-signature document | none |
| `RECIPIENT_WAIVED` | 409 | acknowledge/sign from `waived` | `{ state }` |
| `ORG_DOCUMENT_NOT_ACTIONABLE` | 409 | published but not display-active (expired/scheduled) | `{ display_status }` |
| `SIGNATURE_PROVIDER_UNAVAILABLE` | 503 | provider is `docusign`/`adobe_sign` | `{ provider }` |
| `SIGNER_NAME_MISMATCH` | 422 | typed name does not match the profile | **none** (no name disclosure) |
| `EXPORT_TOO_LARGE` | 422 | #77 matches > 50 000 rows | `{ row_count, max_rows }` |

Reused unchanged: `DOCUMENT_NOT_FOUND` (404), `RECIPIENT_NOT_FOUND` (404), `FORBIDDEN` (403), validation errors (400).

---

## 6. Uniform denial (unchanged rule, restated)

`/:id`-addressed refusals on the self and HR planes return a **byte-identical** `404 DOCUMENT_NOT_FOUND` ("Document not found") whether the document is missing, the caller is not a recipient, or access is denied — so the endpoint reveals nothing about which. Collection-addressed endpoints (`/compliance`) may return `403 FORBIDDEN`.

---

## 7. Frontend migration guidance

1. **Adopt `document.next_action`** on #70/#71 to decide whether to show an Acknowledge or Sign button. Do not derive this from `is_actionable` (status-only) — a document can be display-active yet already acknowledged by this user.
2. **Distinguish first-write from replay** on #73/#74 by HTTP status (`201` vs `200`), not by body.
3. **Signature errors:** treat `503 SIGNATURE_PROVIDER_UNAVAILABLE` as "signing temporarily unavailable"; `422 SIGNER_NAME_MISMATCH` carries no expected name — show a generic "name did not match your profile" message.
4. **CSV export (#77):** open in a new tab / trigger a download; on `422 EXPORT_TOO_LARGE` show the `row_count` and prompt to narrow filters.
