# Field Locations & Assignments: Creator Join Row Multiplication & Pagination Fix

**Date:** 2026-10-07  
**Module:** Attendance & Time Tracking  
**Endpoints Affected:**
- `GET /api/v1/attendance/hr/field-locations`
- `GET /api/v1/attendance/manager/field-locations`
- `GET /api/v1/attendance/hr/field-locations/:id`
- `GET /api/v1/attendance/manager/field-locations/:id`
- `GET /api/v1/attendance/hr/field-assignments/user/:user_id`
- `GET /api/v1/attendance/manager/field-assignments/user/:user_id`
- `GET /api/v1/attendance/my-field-assignments`

---

## 1. Defect Description & Symptoms

When requesting field locations list:
```http
GET /api/v1/attendance/hr/field-locations?page=1&limit=20
GET /api/v1/attendance/manager/field-locations?page=1&limit=20
```

1. **Row Multiplication:**
   The response payload returned duplicate entries for a single field location:
   - `total: 1` (calculated via distinct count)
   - `records.length: 2` (containing identical `id`, `name`, `latitude`, `longitude`, `created_at`).
   - The only difference was `creator.profile.display_name` (e.g. `Abhishek HR` vs `mealex517`).
2. **Pagination Data Loss:**
   When pagination parameters were supplied (e.g. `?limit=1`), only 1 joined row was returned. Because a duplicated site occupied multiple limit slots on the joined SQL query, subsequent distinct field locations were pushed past the page limit and disappeared from paginated responses.

---

## 2. Root Cause Analysis

1. In `src/modules/attendance/repositories/organization_field_locations.repository.js`, `CREATOR_INCLUDE` joined `UserProfile` with `required: false`, but **without an `org_id` filter**.
2. While `User.hasOne(UserProfile, { as: 'profile' })` associates a User to a Profile, PostgreSQL's `user_profiles` table stores multiple profile rows per user across tenants and signup scopes:
   - A global signup profile with `org_id: null` (e.g. `mealex517` created from email prefix at OTP verification).
   - An organization-scoped profile with `org_id: <tenant_id>` (e.g. `Abhishek HR` created when joining or configuring the organization).
3. Without `where: { org_id: orgId }`, PostgreSQL's `LEFT OUTER JOIN` matched all profile rows for the creator user.
4. Because Sequelize treats `belongsTo` and `hasOne` as to-one associations, it applied SQL `LIMIT` and `OFFSET` directly to the joined rows rather than a subquery, leading to row duplication and pagination truncation.
5. Parallel join vulnerabilities were identified in `employee_field_assignments.repository.js`:
   - `findActiveByUser`: assigner profile was not scoped to `org_id`.
   - `findActiveByLocation`: assigned employee profile was not scoped to `org_id`.

---

## 3. Resolution Implemented

1. **Repository Scoping (`organization_field_locations.repository.js`):**
   - Replaced static `CREATOR_INCLUDE` with `buildCreatorInclude(orgId)`:
     ```javascript
     const buildCreatorInclude = (orgId) => [
       {
         model: User,
         as: 'creator',
         attributes: ['id', 'identifier'],
         include: [
           {
             model: UserProfile,
             as: 'profile',
             where: { org_id: orgId },
             required: false,
             attributes: ['first_name', 'last_name', 'display_name']
           }
         ]
       }
     ]
     ```
   - In `findPaginatedByOrg`, explicitly specified `distinct: true` and `col: 'OrganizationFieldLocations.id'`.
   - Because `user_profiles` enforces `UNIQUE (org_id, user_id)`, `where: { org_id: orgId }` mathematically guarantees at most 1 matching profile per creator user in the organization. The join is strictly 1-to-1, preventing row multiplication.
2. **Assignment Repository Hardening (`employee_field_assignments.repository.js`):**
   - In `findActiveByUser(orgId, userId)`: scoped `assigner.profile` with `where: { org_id: orgId }`.
   - In `findActiveByLocation(fieldLocationId, orgId)`: accepted `orgId` and scoped `user.profile` with `where: { org_id: orgId }`.
3. **Service Layer Update (`field_location.service.js`):**
   - Forwarded `orgId` from `getFieldLocationById(orgId, requesterUser, id)` to `findActiveByLocation(id, orgId)`.

---

## 4. Frontend Impact & Guidance

- **Pagination Data Loss Resolved:** The backend now strictly returns 1 entry per field location. `records.length` matches `total` (up to `limit`).
- **Creator Profile Fixed:** The returned `creator.profile` is guaranteed to be the creator's authoritative profile in the current organization (`Abhishek HR`), never their global signup profile (`mealex517`) or another tenant's profile.
- **Frontend Deduplication Helper (`dedupeById`):** The defensive `dedupeById()` added on the frontend is safe to keep as a safeguard or can be removed; the server will no longer emit duplicate IDs.
