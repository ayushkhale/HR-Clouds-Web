# Frontend Integration Guide: Organization Profile Update APIs

## Document Metadata
* **Status**: Production Ready (code-complete, organization suite green; DB migration `00062` handed to ops, unrun)
* **Target Audience**: Frontend Engineers, QA, Product
* **Module**: Organization Module
* **Date**: September 30, 2026
* **Full contract**: `public/md_organization/6_org_profile_management_api.md`

---

## 1. What Changed?

### New APIs or updated?
> **STATUS: NEW (additive only).** Three new **HR-only** write endpoints let HR maintain the company profile: one to edit the profile data, and a two-step handshake to upload the org logo. No existing route, request or response was changed, renamed or removed. `GET /organizations/details` is unchanged in shape — `profile.logo_url` now simply reflects the uploaded logo (see §4).

### Affected Endpoints
| # | Method | Endpoint | Allowed Roles | Plane |
|---|--------|----------|---------------|-------|
| 1 | `PATCH` | `/api/v1/organizations/profile` | `hr` | Tenant |
| 2 | `POST` | `/api/v1/organizations/logo/upload-url` | `hr` | Tenant |
| 3 | `POST` | `/api/v1/organizations/logo/confirm` | `hr` | Tenant |

All three require a Bearer token and an active organization. `manager` / `employee` receive `403`.

---

## 2. `PATCH /api/v1/organizations/profile`

Edit the company profile. Send **only** the fields being changed — every field is optional, but **at least one** must be present (else `422`).

Editable fields (all `organization_profiles` columns except the logo):
`org_name`, `org_alias`, `industry`, `size`, `website`, `phone_number`,
`address_line_1`, `address_line_2`, `city`, `state`, `country`, `zip_code`,
`description`, `founded_year`, `gst_number`, `company_pan_number`.

- **`org_name`** is the display name. Updating it also updates the org's core `name` (they are kept in lockstep) — a rename is reflected everywhere the org name appears. Min length 1, max 150.
- **`founded_year`** is an integer between 1800 and the current year.
- Nullable string fields accept `null` or `""` to clear them; `org_name` cannot be cleared.
- The **logo is NOT settable here** — use the upload handshake (§3). Any `logo_url` / `logo_storage_key` in the body is silently ignored.
- **Response:** the full refreshed `GET /organizations/details` payload (org + profile + HR contacts + stats), so you can update the view from the response without a second fetch.

---

## 3. Logo upload — two-step handshake

Same handshake shape as the profile-avatar upload. The bucket is private, so the client uploads bytes straight to storage with a presigned URL, then confirms.

### Step 1 — `POST /api/v1/organizations/logo/upload-url`
Request:
```json
{ "content_type": "image/png", "size_bytes": 20480, "file_name": "logo.png" }
```
- `content_type` ∈ `image/png`, `image/jpeg`, `image/webp`.
- `size_bytes` ≤ **5 MB** (`5242880`). `file_name` is advisory/optional.

Response `data`:
```json
{
  "upload_url": "https://...",         // presigned PUT — upload the bytes here
  "storage_key_token": "eyJ...",       // opaque; pass back to confirm
  "expires_in": 600,                    // seconds
  "required_headers": { "Content-Type": "image/png" }
}
```

### Step 2 — client PUTs the file
`PUT upload_url` with the raw file body and **exactly** the `required_headers` (notably `Content-Type` must match what you declared).

### Step 3 — `POST /api/v1/organizations/logo/confirm`
Request:
```json
{ "storage_key_token": "eyJ..." }
```
- The server HEAD-verifies the uploaded object (real type + size, not your declared values), persists it, and best-effort deletes the previously uploaded logo.
- **Idempotent:** re-confirming the same token after success is a no-op that returns current state.
- **Response:** the full refreshed `GET /organizations/details` payload — `profile.logo_url` now resolves to the new logo.

---

## 4. How the logo is served (important)

`profile.logo_url` in `GET /organizations/details` is now a **resolved** value:
- If a logo was **uploaded**, it is a **short-lived presigned URL (~5 min TTL)** — do **not** cache or persist it; always read it fresh from the latest `/details` response.
- If no upload exists, it falls back to whatever directly-loadable URL is stored (external logo), or `null`.
- If storage is momentarily unavailable, it resolves to `null` (never a broken/raw value) — render a placeholder.

> **Note (payslips/PDFs):** an uploaded logo is currently reflected in the org-details view. Payslip/letter PDFs that embed a logo continue to use externally-hosted `logo_url` values only; they will pick up uploaded logos in a later change.

---

## 5. Errors
| Status | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/invalid token or no active org |
| 403 | (authz) | Caller is not `hr` |
| 404 | `ORG_PROFILE_NOT_FOUND` | Org has no profile row |
| 404 | `UPLOAD_CLAIM_NOT_FOUND` | `storage_key_token` is forged/expired/for another org |
| 409 | `UPLOAD_NOT_FOUND` | Confirm called before the file was uploaded |
| 413 | `FILE_TOO_LARGE` | File exceeds 5 MB (checked from the real object at confirm) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Not PNG/JPEG/WebP |
| 422 | (validation) | Empty body / invalid field |
| 429 | `LOGO_RATE_LIMITED` | Per-org logo upload cap reached (`Retry-After` provided) |
| 503 | `STORAGE_UNAVAILABLE` | Object storage not configured/unreachable |

All error bodies follow the standard `{ success:false, message, errorCode }` envelope.
