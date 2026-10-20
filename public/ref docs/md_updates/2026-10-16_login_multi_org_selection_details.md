# Change Record: Multi-Organization Login Response Enhancement

**Date:** 2026-10-16  
**Module:** Authentication (`auth`)  
**Endpoint:** `POST /api/v1/auth/login` (and Google OAuth `POST /api/v1/auth/google`)  
**Impact:** Frontend non-breaking enhancement. Existing keys (`org_id`, `name`, `status`, `role`) are preserved unchanged. Additional organization profile fields are now included in the `organizations` array when `requires_org_selection: true`.

---

## 1. Context & Motivation

When a user belongs to multiple organizations, logging in returns `requires_org_selection: true` with a list of active organizations for the user to choose from. Previously, each organization object only had basic identity fields (`org_id`, `name`, `status`, `role`), which did not provide enough visual information (such as company logo/profile picture, alias, industry, size, or location) to build rich organization selection cards on the frontend.

## 2. Updated Response Payload Structure

### Scenario: Multiple Organizations (`requires_org_selection: true`)

**Status:** `200 OK`

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "requires_org_selection": true,
    "selection_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "organizations": [
      {
        "org_id": "8edac489-a332-467a-bf8d-0273610ba4e8",
        "name": "HR-Vista Soft Solutions Private Limited",
        "status": "active",
        "role": "employee",
        "org_key": "hrvistasoftsolutionsprivatelimited-1787150232309",
        "org_alias": "HRV-SS",
        "logo_url": null,
        "profile_picture": null,
        "industry": "IT Services",
        "size": "11-50",
        "website": "https://hrvista.co.in/",
        "city": null,
        "state": null,
        "country": null
      },
      {
        "org_id": "b782fd72-493e-415d-8b5b-9194b81d294e",
        "name": "Compunic Private Limited",
        "status": "active",
        "role": "employee",
        "org_key": "compunicprivatelimited-mty8ysvv-519a23",
        "org_alias": "Compunic PVT LTD",
        "logo_url": "https://hrclouds-developmet.s3.ap-south-1.amazonaws.com/org/b782fd72-493e-415d-8b5b-9194b81d294e/logos/c907e850-bf64-4714-9ee0-7dfc5df4f02c.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
        "profile_picture": "https://hrclouds-developmet.s3.ap-south-1.amazonaws.com/org/b782fd72-493e-415d-8b5b-9194b81d294e/logos/c907e850-bf64-4714-9ee0-7dfc5df4f02c.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
        "industry": "IT Services",
        "size": "1-10",
        "website": "https://compunic.co.in/",
        "city": "Indore",
        "state": "Madhya Pradesh",
        "country": "India"
      }
    ]
  }
}
```

---

## 3. Field Specifications

| Field | Type | Description | Compatibility |
| :--- | :--- | :--- | :--- |
| `org_id` | `UUID` | Organization unique identifier | **Existing** |
| `name` | `string` | Legal organization name | **Existing** |
| `status` | `string` | Organization status (`active`, etc.) | **Existing** |
| `role` | `string` | User's role key in this organization (e.g., `employee`, `hr`, `manager`) | **Existing** |
| `org_key` | `string \| null` | Unique organization slug / system key | **New** |
| `org_alias` | `string \| null` | Short display alias / brand name | **New** |
| `logo_url` | `string \| null` | Presigned AWS S3 GET URL (or direct URL fallback) for the company logo. Valid for 300s. | **New** |
| `profile_picture` | `string \| null` | Alias of `logo_url` for frontend convenience and intuitive property binding | **New** |
| `industry` | `string \| null` | Organization industry vertical (e.g. `IT Services`, `Manufacturing`) | **New** |
| `size` | `string \| null` | Organization employee size range (e.g. `1-10`, `11-50`, `50-100`) | **New** |
| `website` | `string \| null` | Organization official website URL | **New** |
| `city` | `string \| null` | Registered city | **New** |
| `state` | `string \| null` | Registered state / province | **New** |
| `country` | `string \| null` | Registered country | **New** |

---

## 4. Frontend Integration Notes

1. **Zero Breaking Changes:** Frontend code accessing `org.org_id`, `org.name`, `org.status`, or `org.role` continues to function exactly as before.
2. **Displaying Logos / Avatars:** Use `org.logo_url || org.profile_picture`. If both are `null`, render a fallback with the organization's initials (e.g., from `org.org_alias` or `org.name`).
3. **Presigned URL Expiry:** The S3 URLs are presigned with a 300-second (5-minute) TTL. Since org selection happens immediately upon login (within the 10-minute `selection_token` window), this is optimal.
