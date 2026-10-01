# Organization Profile Management API (HR)

HR-only endpoints to maintain the company profile: edit profile data, and upload the org logo
via a presigned two-step handshake. All routes are mounted under `/api/v1/organizations`, require
`Authorization: Bearer <token>` and an active org, and are restricted to role `hr`.

Related read endpoints: see `5_org_details_and_hierarchy_api.md` (`GET /organizations/details`).

---

## §1. `PATCH /api/v1/organizations/profile`

Partial update of the company profile. Send only changed fields; **at least one** required.

### Request body (all optional; `.min(1)`)
| Field | Type | Constraints |
|---|---|---|
| `org_name` | string | 1–150; also updates the org core `name` (kept in lockstep) |
| `org_alias` | string\|null | ≤ 100 |
| `industry` | string\|null | ≤ 100 |
| `size` | string\|null | ≤ 50 |
| `website` | string\|null | ≤ 255 |
| `phone_number` | string\|null | ≤ 20 |
| `address_line_1` | string\|null | ≤ 255 |
| `address_line_2` | string\|null | ≤ 255 |
| `city` | string\|null | ≤ 100 |
| `state` | string\|null | ≤ 100 |
| `country` | string\|null | ≤ 100 |
| `zip_code` | string\|null | ≤ 20 |
| `description` | string\|null | free text |
| `founded_year` | integer\|null | 1800 … current year |
| `gst_number` | string\|null | ≤ 50 |
| `company_pan_number` | string\|null | ≤ 50 |

Nullable fields accept `null`/`""` to clear. Unknown keys (incl. `logo_url` / `logo_storage_key`)
are stripped. The logo is managed only by §2.

### Behaviour
- Profile row and (when `org_name` changes) the `organizations.name` row are updated atomically in
  one transaction.
- Returns the refreshed `GET /organizations/details` payload.

### Response `200`
```json
{ "success": true, "message": "Organization profile updated successfully", "data": { /* details payload */ } }
```

---

## §2. Logo upload handshake

Private bucket → the client uploads bytes directly with a presigned PUT, then confirms.

### §2.1 `POST /api/v1/organizations/logo/upload-url`
Request:
```json
{ "content_type": "image/png", "size_bytes": 20480, "file_name": "logo.png" }
```
| Field | Type | Constraints |
|---|---|---|
| `content_type` | string | `image/png` \| `image/jpeg` \| `image/webp` |
| `size_bytes` | integer | 1 … 5242880 (5 MB) |
| `file_name` | string | optional, ≤ 200, advisory |

Response `200 data`:
```json
{
  "upload_url": "https://<presigned-put>",
  "storage_key_token": "<signed opaque claim>",
  "expires_in": 600,
  "required_headers": { "Content-Type": "image/png" }
}
```
The `storage_key_token` is a 10-minute JWT (`purpose: "logo_upload"`) bound to the org and a key
under `org/{orgId}/logos/`. No DB write happens at this step. Per-org issuance is rate-limited
(50/hr; `429 LOGO_RATE_LIMITED` with `Retry-After`).

### §2.2 Client upload
`PUT {upload_url}` with the file body and exactly `required_headers`.

### §2.3 `POST /api/v1/organizations/logo/confirm`
Request:
```json
{ "storage_key_token": "<from step 1>" }
```
Behaviour:
- Decodes/validates the claim (org + key prefix); a forged/expired/cross-org token → `404 UPLOAD_CLAIM_NOT_FOUND`.
- HEAD-verifies the uploaded object from storage (real content-type + size, not the client's claim).
- Persists `organization_profiles.logo_storage_key` in a transaction.
- Best-effort deletes the previously uploaded logo object after commit.
- Idempotent: re-confirming an already-committed key is a no-op.

Response `200`:
```json
{ "success": true, "message": "Organization logo updated successfully", "data": { /* details payload */ } }
```

---

## §3. Logo serving model

- `organization_profiles.logo_storage_key` (TEXT, nullable) holds the private object key of an
  uploaded logo. `logo_url` keeps its meaning — a directly-loadable URL (external logos, and the
  value payslip/PDF snapshots embed) — and is the fallback.
- `GET /organizations/details` resolves `profile.logo_url`: presign the key when present (≈5 min
  TTL), else pass a stored http(s) `logo_url` through, else `null`. **Fail-open** — a signing error
  resolves to `null`, never a raw key. Clients must treat `logo_url` as short-lived, not cacheable.
- **Cross-module limitation:** payslip snapshots capture `logo_url` verbatim into an immutable
  snapshot, so an uploaded (key-only) logo does **not** appear in payslip/letter PDFs until payroll
  adopts key resolution; externally-hosted `logo_url` values still render there.

---

## §4. Error codes
| Status | Code |
|---|---|
| 401 | `UNAUTHORIZED` |
| 403 | authz (not `hr`) |
| 404 | `ORG_PROFILE_NOT_FOUND`, `UPLOAD_CLAIM_NOT_FOUND` |
| 409 | `UPLOAD_NOT_FOUND` |
| 413 | `FILE_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | validation |
| 429 | `LOGO_RATE_LIMITED` |
| 503 | `STORAGE_UNAVAILABLE` |

---

## §5. Data / migration

- Migration `00062-add-logo-storage-key-to-organization-profiles` adds nullable
  `organization_profiles.logo_storage_key` (TEXT). Additive, reversible, no backfill.
- **Adding this column to the model eagerly selects it on every `OrganizationProfile` read**
  (payslip, tax, letter branding, invitation, org details). The feature — and those reads — require
  the migration to be applied. Run `00062` before/with deploy.
