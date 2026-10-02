# Organization Details, Hierarchy & Avatar Upload APIs

**Base URL:** `/api/v1/organizations`
**Source of Truth:** `organization.routes.js`, `self_service.routes.js`, `organization.controller.js`, `self_service.controller.js`, `organization.service.js`, `organization.repository.js`, `user_reporting_mapping.repository.js`, `organization_structure.utils.js`, `avatar_asset.utils.js`
**Last Verified:** September 30, 2026

> Organization details, live reporting hierarchy, and profile avatar upload APIs. All endpoints require a Bearer token and an active organization context.

---

## 1. Get Organization Details

### Business Purpose
Returns the organization's detail sheet for an "Organization / Company Profile" screen: the org core record, its company profile (`organization_profiles`), the organization's HR contacts, and a small stats summary.

### Endpoint Contract
- **Method:** `GET`
- **Full Endpoint:** `/api/v1/organizations/details`
- **Authentication:** Required. Bearer token.
- **Authorization:** `hr`, `manager`, `employee` (all tenant roles). Platform roles (`admin` / `super-admin`) are excluded — they carry no tenant context.
- **Query / Body:** None.

### Role-based field visibility
The **statutory identifiers** `gst_number` and `company_pan_number` are returned **only when the caller's role is `hr`**. For `manager` and `employee` these two keys are **omitted** from `profile` (not `null` — absent). Every other field is returned to all tenant roles.

### Response Structure
**200 OK**
```json
{
  "success": true,
  "message": "Organization details fetched successfully",
  "data": {
    "organization": {
      "id": "org-uuid-v4",
      "name": "Acme Corp",
      "key": "acmecorp-l4k2j-9f3a1c",
      "status": "active",
      "created_at": "2026-01-15T08:30:00.000Z"
    },
    "profile": {
      "org_name": "Acme Corp",
      "org_alias": "Acme",
      "industry": "Software",
      "size": "51-200",
      "website": "https://acme.example",
      "phone_number": "+91-22-1234-5678",
      "address_line_1": "123 Main St",
      "address_line_2": "Suite 4",
      "city": "Mumbai",
      "state": "Maharashtra",
      "country": "India",
      "zip_code": "400001",
      "logo_url": "https://cdn.example/logo.png",
      "description": "We build things.",
      "founded_year": 2015,
      "gst_number": "27ABCDE1234F1Z5",
      "company_pan_number": "ABCDE1234F"
    },
    "hr_contacts": [
      {
        "user_id": "user-uuid-v4",
        "name": "Jane Smith",
        "email": "jane@acme.example",
        "avatar_url": "https://cdn.example/jane.png",
        "role": "hr",
        "employee_id": "hr-profile-uuid",
        "employee_code": "HR-1A2B3C",
        "department": "Human Resources",
        "designation": "HR Administrator",
        "work_location": "Headquarters",
        "dob": null,
        "gender": null
      }
    ],
    "stats": {
      "total_active_members": 42,
      "hr_count": 3,
      "manager_count": 9,
      "employee_count": 30,
      "department_count": 6,
      "location_count": 2
    }
  }
}
```

### Field Notes
- `profile` is `null` if the organization has no `organization_profiles` row (should not happen for a normally-onboarded org, but the frontend should tolerate it).
- `gst_number` / `company_pan_number`: **present only for `hr`** (see visibility rule above).
- `hr_contacts`: active HR members only, shaped with the public-safe directory projection (no addresses, PAN/UAN, DOB values, personal email). It reuses the same shape as `GET /directory` rows.
- `stats.total_active_members` = `hr_count + manager_count + employee_count`.
- `stats.department_count` / `location_count` count **active** departments / locations only.

### Internal Execution Flow
```text
GET /api/v1/organizations/details
        ↓
authenticate → requireActiveOrg → authorize(['hr','manager','employee'])
        ↓
OrganizationController.handleGetOrganizationDetails()
        ↓
OrganizationService.getOrganizationDetails(req.user)
        ↓
Promise.all([
  findOrganizationById, findOrganizationProfileByOrgId,
  getEmployeesByOrgId(roleKey:'hr'), countActiveMembersByRoleKey x3,
  getDepartmentsByOrgId(active), getLocationsByOrgId(active)
])
        ↓
(HR-only: attach gst_number / company_pan_number)
        ↓
HTTP 200 OK
```

### Error Flow
| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No active organization on the token. |
| 403 | (authorize) | Caller is a platform role or otherwise not a tenant role. |
| 404 | `ORG_NOT_FOUND` | Organization row missing for the token's org. |

### Frontend Integration
- **When to call:** on opening the Organization / Company Profile page.
- **Rendering GST/PAN:** only render the statutory block if the keys are present (they will be absent for non-HR users). Do not show "null".

---

## 2. Get Organization Hierarchy (Org Chart)

### Business Purpose
Returns the **live reporting tree** of every **active** member of the organization — HR at the top, then managers, then employees — so the frontend can render an org chart. The parent/child edges come from the authoritative reporting backbone (`user_reporting_mappings`), so the tree reflects real-time reporting lines (HOD transfers, department moves, offboarding rewires) the moment they happen.

### Endpoint Contract
- **Method:** `GET`
- **Full Endpoint:** `/api/v1/organizations/hierarchy`
- **Authentication:** Required. Bearer token.
- **Authorization:** `hr`, `manager`, `employee` (all tenant roles).
- **Query / Body:** None.

### Scope & visibility
This is a **whole-org** structural view — the same visibility class as `GET /directory`. It is **not** hierarchy-scoped: a manager or employee receives the full org chart, not just their own subtree. Node fields are **public-safe** (identity + job context only): no addresses, PAN/UAN, DOB, personal email or marital status.

### Response Structure
`data` is a **forest**: `roots` is an array (an org may have more than one top node — e.g. multiple HRs with no one above them), each node carrying its `children` recursively.

**200 OK**
```json
{
  "success": true,
  "message": "Organization hierarchy fetched successfully",
  "data": {
    "total_members": 42,
    "roots": [
      {
        "user_id": "hr-uuid",
        "name": "Jane Smith",
        "first_name": "Jane",
        "last_name": "Smith",
        "email": "jane@acme.example",
        "avatar_url": "https://cdn.example/jane.png",
        "role": "hr",
        "employee_code": "HR-1A2B3C",
        "designation": "HR Administrator",
        "department_id": "dept-uuid",
        "department": "Human Resources",
        "work_location": "Headquarters",
        "reporting_to_id": null,
        "children": [
          {
            "user_id": "mgr-uuid",
            "name": "Bob Manager",
            "role": "manager",
            "designation": "Engineering Manager",
            "department": "Engineering",
            "reporting_to_id": "hr-uuid",
            "children": [
              {
                "user_id": "emp-uuid",
                "name": "Carol Employee",
                "role": "employee",
                "designation": "Software Engineer",
                "department": "Engineering",
                "reporting_to_id": "mgr-uuid",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  }
}
```
> Each node has the same fields as the root shown above (`first_name`, `last_name`, `email`, `avatar_url`, `employee_code`, `department_id`, `work_location` etc.); they are abbreviated in the nested examples for brevity.

### Node Fields
| Field | Meaning |
|---|---|
| `user_id` | The member's user id (stable key for the chart). |
| `name` | Display name (falls back to first+last, then email). |
| `first_name`, `last_name` | Name parts (may be `null`). |
| `email` | Work identifier / login email. |
| `avatar_url` | Profile image URL (may be `null`). |
| `role` | `hr` \| `manager` \| `employee`. |
| `employee_code` | Org employee code (may be `null`). |
| `designation` | Job title (may be `null`). |
| `department_id`, `department` | Canonical department id + resolved name (may be `null`). |
| `work_location` | Resolved location name (may be `null`). |
| `reporting_to_id` | The user id this member reports to, from the active mapping. `null` for a top node. |
| `children` | Array of child nodes (empty for a leaf). |

### How the tree is built
- **Nodes:** every active membership (`user_roles.is_active = true` AND `users.status = 'active'`).
- **Edges:** active rows in `user_reporting_mappings` (`is_active = true`) — `user_id` reports to `reporting_to_id`. Never derived from the denormalized `reporting_person` field.
- **Roots:** members with no active upward mapping to another active member (typically top HR).
- **Edge cases the builder handles gracefully:**
  - A member whose `reporting_to_id` points at someone **not** in the active set (deactivated/removed) becomes a **root**, but still exposes that `reporting_to_id`.
  - Only the **first** active mapping per user is used as the parent edge.
  - A self-referencing mapping never makes a node its own child.
  - A reporting cycle (should not occur — the domain forbids self-report and enforces role order) is broken safely; every node still appears exactly once.
- **Ordering:** `roots` and every `children` array are sorted by `name` (case-aware locale compare) for deterministic rendering.

### Internal Execution Flow
```text
GET /api/v1/organizations/hierarchy
        ↓
authenticate → requireActiveOrg → authorize(['hr','manager','employee'])
        ↓
OrganizationController.handleGetOrganizationHierarchy()
        ↓
OrganizationService.getOrganizationHierarchy(req.user)
        ↓
Promise.all([
  getEmployeesByOrgId(active)  →  member rows,
  getActiveMappingsByOrg       →  reporting edges
])
        ↓
buildHierarchyForest(rows, mappings)   (pure, in-memory, cycle-guarded)
        ↓
HTTP 200 OK
```

### Error Flow
| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No active organization on the token. |
| 403 | (authorize) | Caller is a platform role or otherwise not a tenant role. |

### Frontend Integration
- **When to call:** on opening the Org Chart / Team Structure page.
- **Rendering:** recurse over `children`. Use `user_id` as the React key. A member appears exactly once in the tree.
- **Multiple roots:** always treat `roots` as an array; render all of them as top-level cards.
- **Performance:** the response is the whole org in one payload (no pagination). For very large orgs, render lazily / virtualize the tree client-side.

---

## 3. Profile Avatar Upload Handshake

### 3.1 Overview & Handshake Lifecycle

Any active tenant member (`hr`, `manager`, `employee`) can set or replace **their own** profile picture. Upload uses a **presigned two-step handshake** — the image bytes go straight from the browser to object storage, never through the API:

```text
1. POST /api/v1/organizations/me/avatar/upload-url → API returns a presigned PUT URL + a signed claim token
2. PUT  <upload_url>                              → Browser uploads raw image bytes directly to storage
3. POST /api/v1/organizations/me/avatar/confirm    → API verifies object in storage, persists it, returns updated profile
```

The bucket is **private**. There is no permanent public URL for an avatar; the API serves it as a **short-lived presigned URL** (≈5 min) each time a profile, directory, or hierarchy is read. Always take `avatar_url` from a fresh API response — do not cache it long-term or persist it client-side.

### 3.2 Step 1 — Request an Upload URL

- **Method:** `POST`
- **Full Endpoint:** `/api/v1/organizations/me/avatar/upload-url`
- **Authentication:** Required. Bearer token.
- **Authorization:** `hr`, `manager`, `employee` (all tenant roles).

#### Request Body
```json
{
  "content_type": "image/png",
  "size_bytes": 84213,
  "file_name": "me.png"
}
```

| Field | Required | Rule |
|---|---|---|
| `content_type` | Yes | One of `image/png`, `image/jpeg`, `image/webp` |
| `size_bytes` | Yes | Integer, 1 … 5242880 (5 MB max) |
| `file_name` | No | Advisory only, ≤ 200 chars |

#### Response Structure
**200 OK**
```json
{
  "success": true,
  "message": "Avatar upload URL issued successfully",
  "data": {
    "upload_url": "https://<bucket>.s3....?X-Amz-Signature=...",
    "storage_key_token": "<opaque signed token>",
    "expires_in": 600,
    "required_headers": {
      "Content-Type": "image/png",
      "Content-Length": "84213"
    }
  }
}
```
- `storage_key_token` is **opaque** — store it in memory and send it back verbatim at Step 3. Do not decode or modify it.
- The URL expires in `expires_in` seconds (600). Re-request if the user stalls.

### 3.3 Step 2 — Upload Image Bytes Directly to Storage

- **Method:** `PUT`
- **URL:** `<upload_url>` (directly to storage, **not** to the HRMS API)
- **Body:** Send the **raw file binary** as the body.
- **Headers:** Set exactly the headers returned in `required_headers` (`Content-Type` and `Content-Length`). They must match what was declared in Step 1, or storage will reject the PUT.
- **Auth:** Do **not** send the `Authorization` header on this request — it goes directly to S3/storage.
- **Outcome:** A successful PUT returns `200` or `204` with an empty body.

### 3.4 Step 3 — Confirm Upload

- **Method:** `POST`
- **Full Endpoint:** `/api/v1/organizations/me/avatar/confirm`
- **Authentication:** Required. Bearer token.
- **Authorization:** `hr`, `manager`, `employee` (all tenant roles).

#### Request Body
```json
{
  "storage_key_token": "<the token from step 1>"
}
```

The server re-reads the uploaded object from storage and **re-verifies its real content type and size** via `HeadObject` (it does not trust Step 1's declared values), persists it, and deletes any previous avatar object.

#### Response Structure
**200 OK**
Returns the caller's full profile (identical shape to `GET /api/v1/organizations/me`), with `avatar_url` now pointing at a fresh presigned URL:
```json
{
  "success": true,
  "message": "Avatar updated successfully",
  "data": {
    "user_id": "user-uuid-v4",
    "name": "Jane Smith",
    "avatar_url": "https://<bucket>.s3....?X-Amz-Signature=...",
    "email": "jane@acme.example",
    "role": "employee",
    "employee_code": "EMP-001"
  }
}
```
- **Idempotent:** Re-POSTing the same token after success is a safe no-op that returns the current profile.

### 3.5 Where the New Avatar Appears & Resolution Logic

After confirmation, the presigned `avatar_url` is automatically resolved on every **organization-module** read that carries an avatar:
- `GET /api/v1/organizations/me`
- `GET /api/v1/organizations/employees`
- `GET /api/v1/organizations/employees/:id`
- `GET /api/v1/organizations/directory`
- `GET /api/v1/organizations/details` (HR contacts)
- `GET /api/v1/organizations/hierarchy`

> **Cross-module note:** Other modules (attendance, leave, payroll) echo `avatar_url` from their own reads and do not yet resolve the private storage key, so a newly uploaded avatar will not appear in those views until they adopt the same resolver. Externally hosted avatars (e.g. Google OAuth `https://...` URLs) continue to render everywhere as before.

### 3.6 Error Handling Matrix

| Status | Code | Step | Meaning |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | 1 / 3 | Bad or missing body fields (e.g. missing token, invalid content type). |
| 401 | `UNAUTHORIZED` | Any | Missing/invalid token or no active org on the token. |
| 403 | `FORBIDDEN` | Any | Caller is not a tenant role. |
| 413 | `FILE_TOO_LARGE` | 1 / 3 | Declared or actual file size exceeds 5 MB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 1 / 3 | MIME type not PNG, JPEG, or WebP (verified again from real object at confirm). |
| 429 | `AVATAR_RATE_LIMITED` | 1 | Per-org hourly issuance cap hit; response body carries `retry_after_seconds`. |
| 404 | `UPLOAD_CLAIM_NOT_FOUND` | 3 | Token expired, malformed, or not minted for this user. |
| 409 | `UPLOAD_NOT_FOUND` | 3 | Confirm called before the storage PUT completed (object absent). |
| 503 | `STORAGE_UNAVAILABLE` | 1 / 3 | Object storage not configured or unreachable. |

### 3.7 Backend Implementation & Security Notes

- **Database Column:** Uses `user_profiles.avatar_storage_key` (migration `00061-add-avatar-storage-key-to-user-profiles`, additive/nullable). `avatar_url` keeps its meaning as a directly loadable external URL and is the fallback when no key is present; a stored key always takes precedence.
- **JWT Claim Security:** The claim rides in a purpose-scoped JWT (`avatar_upload`, 10 min TTL), strictly bound to `org_id`, `user_id`, and key prefix `org/{orgId}/avatars/{userId}/` — a token cannot target another user or tenant.
- **Verification on Confirm:** Confirm verifies metadata directly from storage via `HeadObject` (never trusting client parameters), writes transactionally, and performs best-effort asynchronous deletion of the superseded object post-commit.
- **Fail-Open Read Resolution:** Read-time resolution (`avatar_asset.utils`) fails open to `null` — a storage outage hides the avatar without breaking the profile, directory, or hierarchy read.
- **Unit Test Coverage:** Verified by `tests/unit/organization/avatar_asset.test.js` and `tests/unit/organization/avatar_upload_service.test.js`.

