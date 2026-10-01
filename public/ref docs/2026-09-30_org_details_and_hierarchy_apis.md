# Frontend Integration Guide: Organization Details & Hierarchy APIs

## Document Metadata
* **Status**: Production Ready (code-complete, 2482 unit tests green)
* **Target Audience**: Frontend Engineers, QA, Product
* **Module**: Organization Module
* **Date**: September 30, 2026
* **Full contract**: `public/md_organization/6_org_details_and_hierarchy_api.md`

---

## 1. What Changed?

### New APIs or updated?
> **STATUS: NEW (additive only).** Two new read-only endpoints were added. No existing route, request or response was changed, renamed or removed. Fully backward compatible.

### Affected Endpoints
| # | Method | Endpoint | Allowed Roles | Plane |
|---|--------|----------|---------------|-------|
| 1 | `GET` | `/api/v1/organizations/details` | `hr`, `manager`, `employee` | Tenant |
| 2 | `GET` | `/api/v1/organizations/hierarchy` | `hr`, `manager`, `employee` | Tenant |

Both require a Bearer token and an active organization; both take no query params or body.

---

## 2. `GET /api/v1/organizations/details`

Company detail sheet: org core + `organization_profiles` + HR contacts + light stats.

- Response shape: see the full contract, §1.
- **Role-gated fields:** `profile.gst_number` and `profile.company_pan_number` are returned **only to `hr`**. For `manager` / `employee` these keys are **absent** (not `null`). Render the statutory block only when the keys exist.
- `profile` can be `null` if the org somehow has no profile row — tolerate it.
- `stats` = active member counts by role + active department / location counts.

## 3. `GET /api/v1/organizations/hierarchy`

Live org chart of all **active** members, wired from the `user_reporting_mappings` backbone (real-time reporting lines).

- Response `data = { total_members, roots[] }`; each node has `children[]` recursively. See the full contract, §2.
- **Whole-org view** (same visibility class as `/directory`) — a manager/employee gets the full chart, not just their subtree.
- Node fields are **public-safe** (identity + job context; no addresses, PAN/UAN, DOB, personal email).
- `roots` is an **array** (an org can have several top nodes). Each node exposes `reporting_to_id`.
- No pagination — render/virtualize client-side for large orgs.

---

## 4. Errors
| Status | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | No active org on the token. |
| 403 | — | Caller is not a tenant role (platform roles are excluded). |
| 404 | `ORG_NOT_FOUND` | (details only) org row missing. |

---

## 5. Backend Notes (for reviewers)
- No DB migration, no new tables — pure reads over existing tables.
- Edges read from `user_reporting_mappings` (authoritative backbone), never the denormalized `reporting_person`.
- Tree assembly is a pure, cycle-guarded function (`organization_structure.utils.buildHierarchyForest`), covered by `tests/unit/organization/organization_structure.test.js`.
