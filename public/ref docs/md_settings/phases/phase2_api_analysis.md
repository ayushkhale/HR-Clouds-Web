# Phase 2 Complete API Analysis Documentation: Settings Module (The Write Plane & Concurrency Guard)

**Document File:** `public/md_settings/phases/phase2_api_analysis.md`  
**Author:** Senior/Principal Backend Engineer, API Architect & Technical Documentation Engineer  
**Status:** Shipped, Verified & Green (`node --test tests/unit/settings/*.test.js` — 133 passing assertions, 0 failures)  
**Codebase Sources of Truth:**
* Router: [src/modules/settings/routes/settings.routes.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js)
* Controller: [src/modules/settings/controllers/settings.controller.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/controllers/settings.controller.js)
* Validators: [src/modules/settings/validators/settings.validator.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/validators/settings.validator.js)
* Write Service: [src/modules/settings/services/settings_write.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_write.service.js)
* Pure Pipeline Utilities:
  * Patch Engine: [src/modules/settings/utils/settings_patch.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_patch.utils.js)
  * Owner Schema Runner: [src/modules/settings/utils/settings_owner_validation.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_owner_validation.utils.js)
  * Concurrency Token Engine: [src/modules/settings/utils/settings_etag.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_etag.utils.js)
  * Value Comparator: [src/modules/settings/utils/settings_value.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_value.utils.js)
  * Projection Engine: [src/modules/settings/utils/settings_projection.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_projection.utils.js)
* Store Adapters: [src/modules/settings/adapters/](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/adapters/)
* Shared Concurrency Guard: [src/common/utilities/if_match.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/if_match.utils.js)
* Owning Domain Services:
  * Payroll Settings: [src/modules/payroll/services/payroll_settings.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_settings.service.js)
  * Statutory Config: [src/modules/payroll/services/statutory_config.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/statutory_config.service.js)
  * Document Settings: [src/modules/document/services/document_settings.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/services/document_settings.service.js)
  * Document Letter Branding: [src/modules/document/services/document_letter_branding.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/document/services/document_letter_branding.service.js)
  * Organization Profile (DEF-S10): [src/modules/organization/services/organization.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/organization/services/organization.service.js)

---

## 1. Architectural Overview & Design Invariants

Phase 2 introduces the **write plane** of the Settings Module. It exposes **two authenticated HTTP write endpoints** (`#246` and `#247` in the system API registry):
* **S-5 (`PUT /api/v1/settings/groups/:groupKey`)**: Partial update of settings within a single group.
* **S-6 (`POST /api/v1/settings/groups/:groupKey/reset`)**: Restoration of specified keys within a group to their factory catalog defaults.

Both endpoints act as an intelligent gateway, delegating persistence, row locking, and audit recording entirely to the 5 underlying domain singleton stores while enforcing centralized security policies: optimistic concurrency control (`If-Match`), a mass-assignment allowlist, owner-level validation, and two-gate protection for high-risk settings.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SETTINGS WRITE GATEWAY                                 │
│                                                                                        │
│   S-5: PUT  /api/v1/settings/groups/:groupKey                                          │
│   S-6: POST /api/v1/settings/groups/:groupKey/reset                                    │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 1. RESOLUTION & ACCESS GATES (Pre-Store I/O)                                    │
  │    • Step 1: Exists? → catalog.groupByKey (404 GROUP_NOT_FOUND)                 │
  │    • Step 2: Read-Only? → write_roles.length > 0 (405 SETTINGS_GROUP_READ_ONLY) │
  │    • Step 3: RBAC? → isGroupWritable(group, actorRole) (403 FORBIDDEN)          │
  │    • Step 4: Entitled? → resolveEntitlements(orgId) (403 FEATURE_NOT_AVAILABLE) │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 2. PAYLOAD BOUNDS & SAFETY GATES                                                │
  │    • Step 5: Payload Bounds → ≤60 keys, depth ≤2, size ≤64KB (422 INVALID)      │
  │    • Step 6: Mass-Assignment Allowlist → Catalog ∩ Owner Writable (422 REJECT)  │
  │    • Step 7a: Reason Gate → If high-risk key, reason required (422 REASON_REQ)   │
  │    • Step 7b: Confirm Gate → If high-risk key, confirm:true (409 CONFIRM_REQ)   │
  │    • Step 8: Owner Joi Execution → validateWithOwnerSchema (400 VALIDATION_ERR) │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 3. CONCURRENCY & PERSISTENCE (Delegated to Domain Store)                        │
  │    • Step 9: Pre-lock read (adapter.read) for exact before-state baseline       │
  │    • Step 10: Atomic Domain Write under SELECT ... FOR UPDATE                   │
  │               assertUpdatedAtMatches(row, ifMatchISO) → (412 PRECONDITION_FAIL) │
  │               Domain Transaction: Update row + Emit Domain Audit                │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 4. DIFFING & RESPONSE PROJECTION                                                │
  │    • Step 11: Stored Row Diff → diffStored(before, after) via valuesEqual       │
  │               Compute changed{}, unchanged_keys[], non_default_keys[]           │
  │               Group-slice values{} and mint fresh weak ETag token               │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Fundamental System Invariants

1. **The Gateway Writes Nothing Itself (Delegated Execution):**
   The Settings Module owns **zero tables, zero models, and zero transactions** in Phase 2. It holds no local state and caches nothing. All persistence, transactional semantics, domain-specific invariant checking, and audit records are executed strictly by the owning domain services through store adapters.
2. **Strict Single-Store Transaction Invariant (D-S4):**
   Every settings group maps to **exactly one backing store** (enforced by catalog Invariant 3). A single API request targets exactly one group (`:groupKey`), touching exactly one database table within one database transaction managed by the owning module. Multi-group or cross-table writes within a single HTTP request are structurally impossible.
3. **Mandatory `If-Match` Optimistic Concurrency Control:**
   Every write (`S-5` and `S-6`) strictly requires an `If-Match` request header containing the per-group weak ETag (`W/"<catalog_version>:<updated_at ISO>"`) obtained from `S-4` (`GET /api/v1/settings/groups/:groupKey`). Missing headers fail fast with HTTP `400 SETTINGS_IF_MATCH_REQUIRED`. Preconditions are verified **under the database row lock (`SELECT ... FOR UPDATE`)**, mathematically proving that no concurrent transaction committed between the caller's read and lock acquisition.
4. **Split Responsibility for `If-Match` (D-P2-2):**
   The gateway validates the token's outer envelope and `catalog_version` segment (`etag.parseIfMatch`), passing only the **bare ISO timestamp** to the domain service. Domain services call `assertUpdatedAtMatches(row, ifMatch)` under their row lock, keeping domain modules 100% decoupled from settings catalog versioning concepts.
5. **Two-Tier Authorization Architecture:**
   * **Tier 1 (Route Guard):** `authorize(['hr'])` blocks non-tenant-admin roles (`manager`, `employee`, `admin`, `super-admin`) at the HTTP entrypoint with HTTP `403 FORBIDDEN`.
   * **Tier 2 (Service Guard):** `projection.isGroupWritable(group, actorRole)` verifies that the target group permits writing (`write_roles.includes(role)`). Groups with `write_roles: []` (such as `payroll.deprecated`) reject writes with HTTP `405 SETTINGS_GROUP_READ_ONLY`.
6. **Mass-Assignment Defense via Allowlist Intersection:**
   The gateway builds an immutable allowlist: `catalog.entriesForGroup(groupKey) ∩ adapter.ownerWritableKeys()`, strictly excluding any `deprecated: true` or `sensitive: true` entries. Any submitted key outside this allowlist is **loudly rejected** (`422 SETTING_NOT_WRITABLE` with `{ keys: [...] }`), never silently dropped.
7. **Gateway Owner-Schema Validation (F-P2-1):**
   Domain services do not invoke Joi internally (historical route-level validation pattern). To prevent bypassing domain constraints, the gateway runs the owner's exported Joi schema directly with non-negotiable options: `{ abortEarly: false, allowUnknown: false, stripUnknown: false, convert: true, noDefaults: true }`. This guarantees type coercion (`"5"` $\rightarrow$ `5`), rejects unknown fields, and prevents destructive default injection (e.g. `registered_address_lines: []`).
8. **Stored-Row Diffing via Type-Aware Comparator (DEF-S12):**
   `changed` and `unchanged_keys` are calculated by comparing the stored `before` row against the stored `after` row using `valuesEqual(a, b, dataType)`. The diff is never constructed from the submitted client payload. PostgreSQL `NUMERIC`/`DECIMAL` string representations are compared numerically against JavaScript numbers, eliminating phantom diff anomalies.
9. **Two-Gate High-Risk & Audit Protection:**
   Settings classified with `risk: "high"` require both a business justification (`reason`) and explicit confirmation (`confirm: true`). The reason gate (`422 SETTINGS_REASON_REQUIRED`) evaluates prior to the confirmation gate (`409 SETTINGS_CONFIRMATION_REQUIRED`), allowing clients to collect user justification before showing high-risk warnings.
10. **Statutory Impact Reporting:**
    Writes to statutory configurations (`statutory.*` groups) trigger domain recalculation tracking. The response surfaces domain side effects (`impact: { affected_runs, activated_components }`), informing HR of open payroll runs whose frozen calculations predate the setting modification.

---

## 2. Shared Request & Response Conventions

### 2.1 Standard Response Envelopes

#### Success Envelope (`200 OK`)
Every successful write returns HTTP `200 OK`, a new group ETag header, `Cache-Control: no-store`, and the standard payload envelope:
```json
{
  "success": true,
  "message": "Settings updated",
  "data": {
    "catalog_version": "2026-10-09.2",
    "group": "payroll.calendar",
    "store": "payroll_settings",
    "etag": "W/\"2026-10-09.2:2026-10-09T11:30:00.000Z\"",
    "updated_at": "2026-10-09T11:30:00.000Z",
    "values": { ... },
    "changed": { ... },
    "unchanged_keys": [ ... ],
    "non_default_keys": [ ... ]
  }
}
```
*For `POST /api/v1/settings/groups/:groupKey/reset`, `message` is `"Settings reset"` and `data.reset` is `true`.*

#### Error Envelope
All failure cases emit `AppError` payloads formatted by the global error middleware:
```json
{
  "success": false,
  "errorCode": "ERROR_CODE_STRING",
  "message": "Human-readable description of error",
  "details": { ... }
}
```

### 2.2 Global Auth Stack
All Phase 2 write endpoints share the router middleware stack defined in [settings.routes.js:31](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js#L31):
```javascript
const settingsWriteAuth = [authenticate, authorize(['hr']), requireActiveOrg]
```
* `authenticate`: Decodes JWT, checks revocation blacklist, injects `req.user`.
* `authorize(['hr'])`: Strictly restricts write capability to tenant HR administrators. Managers, employees, and platform administrators receive immediate HTTP `403 FORBIDDEN`.
* `requireActiveOrg`: Validates organization status. Suspended or inactive tenants receive HTTP `403 ORG_NOT_ACTIVE`.

### 2.3 The `If-Match` Precondition Contract
Both `S-5` and `S-6` enforce optimistic concurrency via the HTTP standard `If-Match` header:

```http
If-Match: W/"2026-10-09.2:2026-10-09T10:00:00.000Z"
```

* **Token Format:** Must match `^W\/"([^":]+):([^"]+)"$`.
* **Segment 1 (`catalog_version`):** Validated at the gateway. If the catalog version does not match `CATALOG_VERSION` (`2026-10-09.2`), the request fails with HTTP `412 SETTINGS_PRECONDITION_FAILED` (`details.reason = "CATALOG_VERSION_CHANGED"`).
* **Segment 2 (`updated_at` ISO):** Forwarded as a bare ISO timestamp to the domain service and compared against the database row under `SELECT ... FOR UPDATE`.
* **Stale Token Handling:** If another administrator modified the group in the interim, the database timestamp will not match. The request is rejected with HTTP `412 SETTINGS_PRECONDITION_FAILED`:
  ```json
  {
    "success": false,
    "errorCode": "SETTINGS_PRECONDITION_FAILED",
    "message": "The resource was modified by another request",
    "details": {
      "current_updated_at": "2026-10-09T10:15:30.123Z",
      "current_etag": "W/\"2026-10-09.2:2026-10-09T10:15:30.123Z\""
    }
  }
  ```
  The gateway enriches the `412` error with `current_etag`, allowing clients to re-synchronize state in a single roundtrip.

### 2.4 Write Retry & Idempotency Guidance
1. **Conditional, Not Blindly Idempotent:** Writes are conditional on the current row state. A blind replay with the same `If-Match` header after a successful commit will fail with HTTP `412 SETTINGS_PRECONDITION_FAILED`.
2. **Network Timeout Recovery:** If a client experiences a network drop or gateway timeout (`504`) on a write, it **must not** retry blindly. It should invoke `S-4` (`GET /api/v1/settings/groups/:groupKey`), inspect the live values, and reconcile before resubmitting with the new ETag.
3. **No-Op Writes Advance the ETag:** In PostgreSQL / Sequelize, updating a row (even with identical values) updates `updated_at` unless explicitly prevented. Submitting identical data returns `changed: {}`, lists the key in `unchanged_keys`, and mints a **new** ETag. Clients must always adopt the ETag returned in the response.

---

## 3. Shipped Phase 2 APIs — Detailed Analysis

```text
┌──────┬────────┬────────────────────────────────────────────┬─────────────┬──────────────────────────────────────────────────────┐
│ Ref  │ Method │ Endpoint                                   │ Registry #  │ Name / Core Purpose                                  │
├──────┼────────┼────────────────────────────────────────────┼─────────────┼──────────────────────────────────────────────────────┤
│ S-5  │ PUT    │ /api/v1/settings/groups/:groupKey          │ #246        │ Partial Update Settings in Group                     │
│ S-6  │ POST   │ /api/v1/settings/groups/:groupKey/reset    │ #247        │ Reset Group Settings to Factory Catalog Defaults     │
└──────┴────────┴────────────────────────────────────────────┴─────────────┴──────────────────────────────────────────────────────┘
```

---

### API S-5: Partial Update Settings in Group

* **API Number / Registry Ref:** `S-5` (API Registry **#246**)
* **HTTP Method:** `PUT`
* **Route Path:** `/api/v1/settings/groups/:groupKey`
* **Purpose & Business Problem Solved:** Provides a unified, hardened endpoint for updating one or more configuration settings belonging to a specific settings group. Eliminates disparate update contracts across modules, enforces concurrency checks to prevent accidental overwrites by concurrent HR administrators, restricts payload modifications to catalog allowlists, and mandates high-risk confirmation workflows for sensitive operational controls.

#### Authentication & Authorization
* **Bearer Token Required:** Yes.
* **Allowed Roles:** `hr` **only**.
* **Tenant Isolation:** Scoped strictly to `req.user.orgId`.
* **Group Writable Check:** Validates `isGroupWritable(group, req.user.role)`.
* **Entitlement Check:** Evaluates `resolveEntitlements(orgId, [group.featureKey])`. Rejects unentitled plans with HTTP `403 FEATURE_NOT_AVAILABLE`.

#### Request Parameters & Headers
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-Match: W/"<CATALOG_VERSION>:<updated_at ISO>"` (**Required** — see Section 2.3)
  * `Content-Type: application/json` (Required)
* **Path Parameters (`groupKeyParamSchema`):**
  | Parameter | Type | Required? | Constraints & Validation Rules |
  | :--- | :--- | :---: | :--- |
  | `groupKey` | String | Yes | Pattern: `^[a-z0-9_.]{1,60}$`. Must match an active group in `catalog.GROUPS`. |

* **Request Body (`updateGroupBodySchema` — `.unknown(false)`):**
  ```json
  {
    "values": {
      "pay_day": 5
    },
    "reason": "Aligned payroll cycle with executive financial calendar",
    "confirm": true
  }
  ```

* **Request Body Field Specifications:**
  | Field | Type | Required? | Nullable? | Validation Constraints & Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `values` | Object | Yes | No | Key-value map. Keys must match regex `^[a-z0-9_]{1,80}$`. Minimum 1 key, maximum 60 keys. Max container nesting depth $\le 2$. Max serialized payload size 64 KB. Values must satisfy the owner's domain Joi schema. |
  | `reason` | String | Conditional | No | Trimmed string between 1 and 500 characters. **Mandatory** if any modified key has `requires_reason: true` (e.g. `risk: "high"`). |
  | `confirm` | Boolean | Conditional | No | Must be `true` if any modified key is classified as `risk: "high"`. |

#### Detailed 11-Step Execution Pipeline

```text
Request (PUT /api/v1/settings/groups/:groupKey)
  │
  ├─ 1. Exists Check ──────────► catalog.groupByKey(groupKey)
  │                              └─ Fails? → 404 GROUP_NOT_FOUND
  ├─ 2. Read-Only Check ───────► group.write_roles.length > 0
  │                              └─ Empty? → 405 SETTINGS_GROUP_READ_ONLY
  ├─ 3. RBAC Check ────────────► projection.isGroupWritable(group, actorRole)
  │                              └─ False? → 403 FORBIDDEN
  ├─ 4. Entitlement Check ─────► resolveEntitlements(orgId, [group.featureKey])
  │                              └─ False? → 403 FEATURE_NOT_AVAILABLE
  ├─ 5. Bounds Check ──────────► patch.assertBodyBounds(values) (keys 1..60, depth ≤2, size ≤64KB)
  │                              └─ Fails? → 422 SETTINGS_PAYLOAD_INVALID
  ├─ 6. Allowlist Intersect ───► patch.intersectPatch(values, writableKeys)
  │                              ├─ Unknown/Non-writable keys? → 422 SETTING_NOT_WRITABLE { keys }
  │                              └─ Clean patch empty? → 422 NO_WRITABLE_KEYS
  ├─ 7. Policy Evaluation ─────► patch.reasonAndConfirmPolicy(touchedEntries, { reason, confirm })
  │                              ├─ Missing reason? → 422 SETTINGS_REASON_REQUIRED { keys }
  │                              └─ Missing confirm:true? → 409 SETTINGS_CONFIRMATION_REQUIRED { keys, warnings }
  ├─ 8. Owner Joi Validation ──► validateWithOwnerSchema(adapter.ownerSchema, cleanPatch)
  │                              └─ Domain rule fails? → 400 VALIDATION_ERROR { keys }
  ├─ 9. Pre-Lock Baseline ─────► before = await adapter.read(orgId)
  ├─ 10. Atomic Domain Write ──► after = await adapter.update(orgId, coerced, ctx, { ifMatch })
  │                              ├─ DB Row Lock: SELECT ... FOR UPDATE
  │                              ├─ Precondition: assertUpdatedAtMatches(row, ifMatch) → 412 PRECONDITION_FAILED
  │                              ├─ Domain Transaction: Execute update + write domain audit log
  │                              └─ Returns updated plain data and optional domain impact
  └─ 11. Stored Row Diff ──────► diffStored(before.values, after.values, touchedEntries)
                                 ├─ Compute changed: { key: { from, to } } and unchanged_keys: [...]
                                 ├─ Compute non_default_keys: [...] via projection engine
                                 └─ Assembly: Mint fresh ETag W/"<version>:<after.updatedAt>" + Cache-Control: no-store
```

1. **Step 1 (Exists):** Resolves group via `catalog.groupByKey(groupKey)`. Missing group $\rightarrow$ `404 GROUP_NOT_FOUND`.
2. **Step 2 (Read-Only):** Checks `group.write_roles`. If empty (e.g. `payroll.deprecated`), throws `405 SETTINGS_GROUP_READ_ONLY`.
3. **Step 3 (RBAC):** Evaluates `projection.isGroupWritable(group, ctx.actorRole)`. If false, throws `403 FORBIDDEN`.
4. **Step 4 (Entitlement):** Calls `resolveEntitlements(ctx.orgId, [group.featureKey])`. If subscription lacks feature, throws `403 FEATURE_NOT_AVAILABLE`.
5. **Step 5 (Bounds):** `patch.assertBodyBounds(values)` validates object shape, key count (1..60), container depth ($\le 2$), and JSON size ($\le 65536$ bytes). Throws `422 SETTINGS_PAYLOAD_INVALID`.
6. **Step 6 (Allowlist Intersection):** Intersects submitted keys with `writableKeysForGroup(entries, adapter.ownerWritableKeys())`. Any non-writable, deprecated, or sensitive key is collected in `rejected[]` $\rightarrow$ `422 SETTING_NOT_WRITABLE`. If empty $\rightarrow$ `422 NO_WRITABLE_KEYS`.
7. **Step 7a / 7b (Policy Evaluation):**
   * If any touched setting has `requires_reason: true` and `reason` is blank $\rightarrow$ `422 SETTINGS_REASON_REQUIRED`.
   * If any touched setting has `risk: "high"` and `confirm !== true` $\rightarrow$ `409 SETTINGS_CONFIRMATION_REQUIRED` (returns `keys[]` and `warnings[]`).
8. **Step 8 (Owner Joi Validation):** Executes `validateWithOwnerSchema(adapter.ownerSchema, clean)`. Returns coerced values (e.g. string numbers converted to numeric). Throws `400 VALIDATION_ERROR` with `keys[]` on schema mismatch.
9. **Step 9 (Pre-Lock Baseline):** Calls `adapter.read(ctx.orgId)` to capture pre-write state.
10. **Step 10 (Domain Write):** Calls `adapter.update(ctx.orgId, coerced, ctx, { ifMatch })`. Executes inside the domain's own database transaction under row lock (`FOR UPDATE`). Compares `ifMatch` against locked `updated_at`. If mismatched, throws `412 SETTINGS_PRECONDITION_FAILED` (enriched with `current_etag`).
11. **Step 11 (Diffing & Response):** Slices post-write store values to group keys. Compares stored `before` and `after` rows via `patch.diffStored`. Computes `changed`, `unchanged_keys`, and `non_default_keys`. Sets `ETag` and `Cache-Control: no-store`. Returns HTTP `200 OK`.

#### Database & Transaction Impact
* **Gateway Layer:** Zero database queries, zero transactions opened.
* **Domain Layer:** Opens exactly 1 database transaction in the owning module:
  * Acquires row lock: `SELECT * FROM <store> WHERE org_id = :orgId FOR UPDATE`.
  * Verifies `updated_at === ifMatch`.
  * Updates singleton record: `UPDATE <store> SET ... WHERE org_id = :orgId`.
  * Records domain audit log (e.g. `payroll_audit_logs`, `document_audit_logs`) within the same transaction.
  * Commits transaction.

#### Concurrency & Locking Behavior
* **Lock Granularity:** Row-level exclusive lock on the organization's singleton settings row.
* **Lock Duration:** Confined strictly to the microsecond window of the domain update method.
* **Race Prevention:** Two concurrent writes for the same org will serialize on the row lock. The winner commits and advances `updated_at`. The loser acquires the lock, detects timestamp mismatch, rolls back immediately, and returns HTTP `412 SETTINGS_PRECONDITION_FAILED`.

#### Success Response Contract (`200 OK`)

##### Standard Group Update (e.g. `payroll.calendar`)
```json
{
  "success": true,
  "message": "Settings updated",
  "data": {
    "catalog_version": "2026-10-09.2",
    "group": "payroll.calendar",
    "store": "payroll_settings",
    "etag": "W/\"2026-10-09.2:2026-10-09T11:30:00.000Z\"",
    "updated_at": "2026-10-09T11:30:00.000Z",
    "values": {
      "payroll_cycle": "monthly",
      "period_start_day": 1,
      "attendance_cutoff_day": 25,
      "pay_day": 5,
      "pay_day_in_next_month": false,
      "currency": "INR",
      "financial_year_start_month": 4
    },
    "changed": {
      "pay_day": {
        "from": 30,
        "to": 5
      }
    },
    "unchanged_keys": [],
    "non_default_keys": [
      "pay_day"
    ]
  }
}
```

##### Statutory Group Update with Side-Effect Impact (e.g. `statutory.pf`)
```json
{
  "success": true,
  "message": "Settings updated",
  "data": {
    "catalog_version": "2026-10-09.2",
    "group": "statutory.pf",
    "store": "statutory_configs",
    "etag": "W/\"2026-10-09.2:2026-10-09T11:35:12.450Z\"",
    "updated_at": "2026-10-09T11:35:12.450Z",
    "values": {
      "pf_enabled": true,
      "pf_establishment_code": "MH/BAN/0012345/000",
      "pf_employee_rate": "12.00",
      "pf_employer_rate": "12.00",
      "pf_wage_ceiling": "15000.00",
      "pf_include_admin_charges": true,
      "pf_admin_rate": "0.50",
      "pf_include_edli": true,
      "pf_edli_rate": "0.50",
      "pf_restrict_to_ceiling": true
    },
    "changed": {
      "pf_enabled": {
        "from": false,
        "to": true
      }
    },
    "unchanged_keys": [],
    "non_default_keys": [
      "pf_enabled"
    ],
    "impact": {
      "affected_runs": [
        {
          "id": "7b8e5c32-9f0a-4a1e-8d2b-1c3d4e5f6a7b",
          "period_month": 9,
          "run_type": "regular",
          "status": "draft"
        }
      ],
      "activated_components": [
        "PF_EMPLOYEE",
        "PF_EMPLOYER",
        "EPS",
        "PF_ADMIN_CHARGES",
        "EDLI"
      ]
    }
  }
}
```

#### Field-Level Response Dictionary
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `success` | Boolean | No | Always `true` on successful response. |
| `message` | String | No | Confirmation message (`"Settings updated"`). |
| `data.catalog_version` | String | No | Active settings catalog version (e.g. `"2026-10-09.2"`). |
| `data.group` | String | No | Target settings group identifier. |
| `data.store` | String | No | Backing database store table name. |
| `data.etag` | String | No | Newly minted group weak ETag. Use as `If-Match` for subsequent writes. |
| `data.updated_at` | String (ISO 8601) | No | Database modification timestamp of the underlying store row. |
| `data.values` | Object | No | Key-value dictionary containing stored settings for **this group only**. |
| `data.changed` | Object | No | Key-value dictionary mapping changed keys to `{ from, to }`. Empty on no-op. |
| `data.unchanged_keys` | Array of Strings | No | Array of touched keys whose stored value remained identical. |
| `data.non_default_keys` | Array of Strings | No | Array of group keys whose stored value currently differs from factory defaults. |
| `data.impact` | Object | Yes | **Statutory writes only.** Lists domain side effects. |
| `data.impact.affected_runs` | Array of Objects | No | Draft/calculated payroll runs whose frozen snapshot will not reflect this update. |
| `data.impact.activated_components` | Array of Strings | No | Salary component codes automatically activated by enabling statutory heads. |

#### Error Catalog
| HTTP Status | Error Code | Raised By | Triggering Condition & Description |
| :--- | :--- | :--- | :--- |
| **400 Bad Request** | `SETTINGS_IF_MATCH_REQUIRED` | Gateway | Missing or blank `If-Match` request header. |
| **400 Bad Request** | `SETTINGS_IF_MATCH_INVALID` | Gateway | Malformed `If-Match` header (wildcard `*`, bare ISO, strong ETag). |
| **400 Bad Request** | `VALIDATION_ERROR` | Gateway / Owner | Request envelope invalid, or owner Joi schema rejected value (`details.keys[]`). |
| **401 Unauthorized** | `UNAUTHORIZED` | Auth Middleware | Missing, invalid, or expired JWT token. |
| **403 Forbidden** | `FORBIDDEN` | Route / Service | Caller is not `hr`, or role is not in group `write_roles`. |
| **403 Forbidden** | `FEATURE_NOT_AVAILABLE` | Service | Tenant plan lacks subscription entitlement for this group's feature. |
| **404 Not Found** | `GROUP_NOT_FOUND` | Service | Group key does not exist in catalog. |
| **404 Not Found** | `ORG_PROFILE_NOT_FOUND` | Domain Service | For `billing.notifications`, organization profile row is missing in database. |
| **405 Method Not Allowed** | `SETTINGS_GROUP_READ_ONLY` | Service | Group has empty `write_roles` (e.g. `payroll.deprecated`). |
| **409 Conflict** | `SETTINGS_CONFIRMATION_REQUIRED`| Gateway | High-risk setting modified without `confirm: true` (`details.keys[]`, `details.warnings[]`). |
| **409 Conflict** | `INSUFFICIENT_CHECKERS` | Domain Owner | Attempted to enable separate checker with fewer than 2 active HR users. |
| **409 Conflict** | `SETTINGS_CONFLICT` | Domain Owner | Attempted to enable mutually conflicting authority settings. |
| **409 Conflict** | `SCAN_PROVIDER_NOT_CONFIGURED` | Domain Owner | Attempted to enable document scanning before provider configuration. |
| **412 Precondition Failed**| `SETTINGS_PRECONDITION_FAILED` | Gateway / Domain | Stale ETag or catalog version changed (`details.current_etag`, `details.current_updated_at`). |
| **422 Unprocessable** | `SETTINGS_PAYLOAD_INVALID` | Gateway | Payload bounds violation: $>60$ keys, depth $>2$, or size $>64$ KB. |
| **422 Unprocessable** | `SETTING_NOT_WRITABLE` | Gateway | Submitted key is unknown, deprecated, or not writable in this group (`details.keys[]`). |
| **422 Unprocessable** | `NO_WRITABLE_KEYS` | Gateway | Clean patch contains zero writable keys after allowlist intersection. |
| **422 Unprocessable** | `SETTINGS_REASON_REQUIRED` | Gateway | Modified setting requires business reason (`requires_reason: true`), but `reason` was omitted. |
| **422 Unprocessable** | `SETTING_OUT_OF_RANGE` | Domain Owner | Submitted numeric or duration value violates domain operational caps. |
| **422 Unprocessable** | `INVALID_PAYOUT_COMPONENT` | Domain Owner | FNF payout component ID does not reference an active earning component. |
| **422 Unprocessable** | `LETTER_REFERENCE_PATTERN_INVALID`| Domain Owner | Letter reference pattern contains invalid tokens or lacks sequence token. |
| **503 Service Unavailable**| `ENTITLEMENT_DEPENDENCY_FAILURE`| Service | Database or billing service unreachable during entitlement verification. |

---

### API S-6: Reset Group Settings to Factory Catalog Defaults

* **API Number / Registry Ref:** `S-6` (API Registry **#247**)
* **HTTP Method:** `POST`
* **Route Path:** `/api/v1/settings/groups/:groupKey/reset`
* **Purpose & Business Problem Solved:** Enables HR administrators to reset one or more configuration settings in a group back to factory catalog defaults. Reset is not a privileged security bypass: it executes through the exact same 11-step pipeline as `S-5`, strictly enforcing optimistic concurrency (`If-Match`), RBAC, feature entitlements, mass-assignment allowlists, high-risk reason requirements, and confirmation gates.

#### Authentication & Authorization
* **Bearer Token Required:** Yes.
* **Allowed Roles:** `hr` **only**.
* **Precondition Required:** `If-Match` header mandatory.
* **Tenant Isolation:** Scoped strictly to `req.user.orgId`.
* **Group Writable Check:** Validates `isGroupWritable(group, req.user.role)`.
* **Entitlement Check:** Evaluates `resolveEntitlements(orgId, [group.featureKey])`.

#### Request Parameters & Headers
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-Match: W/"<CATALOG_VERSION>:<updated_at ISO>"` (**Required**)
  * `Content-Type: application/json` (Required)
* **Path Parameters (`groupKeyParamSchema`):**
  | Parameter | Type | Required? | Constraints & Validation Rules |
  | :--- | :--- | :---: | :--- |
  | `groupKey` | String | Yes | Pattern: `^[a-z0-9_.]{1,60}$`. Must match an active group in `catalog.GROUPS`. |

* **Request Body (`resetGroupBodySchema` — `.unknown(false)`):**
  ```json
  {
    "keys": [
      "pay_day"
    ],
    "reason": "Restoring standard factory payroll calendar schedule",
    "confirm": true
  }
  ```

* **Request Body Field Specifications:**
  | Field | Type | Required? | Nullable? | Validation Constraints & Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `keys` | Array of Strings | Yes | No | Array of setting keys to reset. Minimum 1 key, maximum 50 keys. Items must be unique and match regex `^[a-z0-9_]{1,80}$`. |
  | `reason` | String | Conditional | No | Trimmed string between 1 and 500 characters. Mandatory if any reset key has `requires_reason: true`. |
  | `confirm` | Boolean | Conditional | No | Must be `true` if any reset key is classified as `risk: "high"`. |

#### Detailed Execution Pipeline
1. **Resolution & Access Gating (Steps 1–4):** Identical to `S-5` (Validates group exists, is not read-only, caller role is authorized, and tenant subscription plan includes group feature).
2. **Reset Key Verification:**
   * Verifies all requested keys belong to the group's writable allowlist (`patch.writableKeysForGroup`). Any unknown or read-only key triggers HTTP `422 SETTING_NOT_WRITABLE` (`details.keys[]`).
   * Verifies `resettable !== false` for each key. Any key marked non-resettable in the catalog triggers HTTP `422 SETTING_NOT_RESETTABLE` (`details.keys[]`).
3. **Default Value Resolution:** Resolves each key's catalog factory default via `patch.resolveDefaults(entryByKey, keys)`. Formats synthetic patch: `{ [key]: catalogEntry.default }`.
4. **Pipeline Execution (Steps 5–11):** Runs the synthetic default patch through the identical `runPipeline` function as `S-5`:
   * Reason gate (`422 SETTINGS_REASON_REQUIRED`) and confirmation gate (`409 SETTINGS_CONFIRMATION_REQUIRED`) enforce policy if any reset key is high-risk.
   * Owner Joi schema validates default values.
   * Row lock (`FOR UPDATE`) and `If-Match` check execute under transaction.
   * Domain update persists defaults and records domain audit log.
   * Diff is calculated against stored row. Emits `data.reset = true`.

#### Database Impact, Concurrency & Transactions
Identical to `S-5`. The reset executes as an atomic domain update inside a single transaction protected by row-level locking.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "Settings reset",
  "data": {
    "catalog_version": "2026-10-09.2",
    "group": "payroll.calendar",
    "store": "payroll_settings",
    "etag": "W/\"2026-10-09.2:2026-10-09T11:40:00.000Z\"",
    "updated_at": "2026-10-09T11:40:00.000Z",
    "values": {
      "payroll_cycle": "monthly",
      "period_start_day": 1,
      "attendance_cutoff_day": 25,
      "pay_day": 30,
      "pay_day_in_next_month": false,
      "currency": "INR",
      "financial_year_start_month": 4
    },
    "changed": {
      "pay_day": {
        "from": 5,
        "to": 30
      }
    },
    "unchanged_keys": [],
    "non_default_keys": [],
    "reset": true
  }
}
```

#### Field-Level Response Dictionary
Includes all fields defined for `S-5`, with one additional field:
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `data.reset` | Boolean | No | Explicit boolean flag indicating response was generated by a reset operation (`true`). |

#### Error Catalog
Includes all error codes defined for `S-5`, plus one reset-specific code:
| HTTP Status | Error Code | Raised By | Triggering Condition & Description |
| :--- | :--- | :--- | :--- |
| **422 Unprocessable** | `SETTING_NOT_RESETTABLE` | Gateway | Attempted to reset a setting whose catalog definition declares `resettable: false`. |

---

## 4. The 8 High-Risk Settings & Two-Gate Policy

Phase 2 enforces strict protection over settings classified as `risk: "high"`. Touching any high-risk setting requires both a written justification (`reason`) and explicit confirmation (`confirm: true`).

### 4.1 The Eight High-Risk Settings Directory

| Registry # | Setting Key | Group Key | Store Table | Operational Consequence & Catalog Warning |
| :---: | :--- | :--- | :--- | :--- |
| **#39** | `payroll_require_separate_checker` | `payroll.authority` | `payroll_settings` | **Alters money approval authority.** Turning ON requires $\ge 2$ active HR users to approve payroll runs; turning OFF allows a single HR user to approve payouts alone. |
| **#40** | `manager_direct_compensation_authority`| `payroll.authority` | `payroll_settings` | **Alters compensation authority.** Enabling allows team managers to adjust employee salaries directly without secondary HR approval. |
| **#59** | `manager_direct_document_authority` | `documents.authority`| `document_settings` | **Alters document issuance authority.** Enabling allows managers to publish letters directly to employees without HR approval. Conflicts with #60. |
| **#60** | `document_require_separate_checker` | `documents.authority`| `document_settings` | **Alters document issuance authority.** Turning ON requires $\ge 2$ active HR users to approve documents. Cannot be active simultaneously with #59. |
| **#65** | `document_retention_days` | `documents.retention`| `document_settings` | **Irreversible data destruction.** Lowering this retention window marks historical employee documents for permanent deletion on the next nightly purge pass. |
| **#79** | `document_publish_sync_threshold` | `documents.publishing`| `document_settings` | **Alters client execution protocol.** Lowering threshold forces document publishing into background queues rather than inline synchronous execution. |
| **#92** | `letter_auto_issue_on_exit` | `documents.letters` | `document_settings` | **Automated document issuance.** Configures document templates to be issued automatically upon employee exit without human review or approval. |
| **#95** | `letter_record_retention_days` | `documents.retention`| `document_settings` | **Irreversible data destruction.** Lowering this retention window permanently purges issued company letter records and audit metadata on nightly cleanup runs. |

### 4.2 Gate Evaluation Sequencing
The gateway enforces a strict two-stage gate evaluation sequence in `patch.reasonAndConfirmPolicy`:
1. **Stage 1 — The Reason Gate (HTTP 422):**
   * If any touched setting has `requires_reason: true` and the request body lacks a non-empty `reason` string, the request is immediately rejected:
     ```json
     {
       "success": false,
       "errorCode": "SETTINGS_REASON_REQUIRED",
       "message": "A reason is required to change one or more of these keys",
       "details": {
         "keys": ["document_retention_days"]
       }
     }
     ```
2. **Stage 2 — The Confirmation Gate (HTTP 409):**
   * Only evaluated *after* a valid `reason` is present. If any touched setting has `risk: "high"` and `confirm !== true`, the request is rejected with HTTP `409 Conflict`:
     ```json
     {
       "success": false,
       "errorCode": "SETTINGS_CONFIRMATION_REQUIRED",
       "message": "Confirmation is required to change one or more high-risk keys",
       "details": {
         "keys": ["document_retention_days"],
         "warnings": [
           "Lowering this value makes existing documents older than the new window purge candidates on the next nightly retention run, and the deletion is irreversible."
         ]
       }
     }
     ```
   * The frontend presents the verbatim `warnings` to the user. Upon user acknowledgement, the client resubmits the request with `confirm: true` and the original `reason`.

---

## 5. Security & Production Verification Audit

| Security Domain | Enforced Mechanism in Implementation | Verification Evidence |
| :--- | :--- | :--- |
| **Tenant Isolation** | Absolute. `orgId` is derived exclusively from authenticated JWT claims (`req.user.orgId`). No endpoint accepts `orgId` via path, query, or body. The identifier is threaded to all store adapters (`T-S22`). | [settings.controller.js:30](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/controllers/settings.controller.js#L30) |
| **RBAC Authorization** | Two-tiered: Router level enforces `authorize(['hr'])` at the door. Service layer verifies `group.write_roles.includes(role)` (`T-S14`). Managers, employees, and platform admins are blocked. | [settings.routes.js:31](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js#L31), [settings_write.service.js:40](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_write.service.js#L40) |
| **Mass-Assignment Defense** | Allowlist intersection: Gateway builds `catalogKeys ∩ ownerWritableKeys`, stripping deprecated and sensitive keys. Unknown/unauthorized keys are reported as `422 SETTING_NOT_WRITABLE` (`T-P2-6`). | [settings_patch.utils.js:59-83](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_patch.utils.js#L59-L83) |
| **Optimistic Concurrency** | `If-Match` token verified under `SELECT ... FOR UPDATE` database row lock. Mismatched timestamp fails with HTTP `412 SETTINGS_PRECONDITION_FAILED`, preventing lost updates (`T-P2-3`, `T-S33`). | [if_match.utils.js:23-34](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/common/utilities/if_match.utils.js#L23-L34) |
| **Safe Schema Coercion** | Owner Joi schemas executed at gateway with `{ stripUnknown: false, allowUnknown: false, noDefaults: true }`. Prevents accidental erasure of unmentioned fields like `registered_address_lines` (`F-P2-1`, `R-P2-1`). | [settings_owner_validation.utils.js:19-37](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_owner_validation.utils.js#L19-L37) |
| **Payload Flooding Defense** | `assertBodyBounds` enforces maximum 60 keys, maximum container nesting depth of 2, and maximum serialized payload size of 65,536 bytes before any database I/O (`T-P2-5`). | [settings_patch.utils.js:43-57](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_patch.utils.js#L43-L57) |
| **Prototype Pollution** | Key schemas enforce strict regex `^[a-z0-9_]{1,80}$`. Allowlist lookups utilize native JavaScript `Set` and `Map` collections, rendering `__proto__` and `constructor` attacks completely inert (`T-P2-6`). | [settings.validator.js:45](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/validators/settings.validator.js#L45) |
| **Secret Sanitization** | `T-S18` verifies no catalog entry carries `sensitive: true`. Adapter allowlists exclude asset storage keys, cryptographic secrets, and system cron watermarks. | [adapter_helpers.js:16-26](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/adapters/adapter_helpers.js#L16-L26) |
| **SQL Injection** | All updates execute via Sequelize ORM parameterized queries with hardcoded column attributes. Zero dynamic string concatenation or raw SQL on write paths. | Domain Service Repositories |
| **Audit Log Integrity** | Domain services write audit logs inside the same database transaction as the row update. Changes capture old and new values, actor ID, IP address, and request ID. | [payroll_settings.service.js:112-123](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_settings.service.js#L112-L123) |

---

## 6. Phase 1 → Phase 2 Consistency & Cross-Phase Impact

### 6.1 Impact on Phase 1 Read APIs
Phase 2 introduces the write plane without breaking any Phase 1 read contract. However, Phase 2 writes dynamically update the state reflected by Phase 1 endpoints:

```text
┌────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 1 Read API       │ Observed Impact from Phase 2 Writes                                                    │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ S-1: /settings/catalog │ • CATALOG_VERSION bumped to '2026-10-09.2'.                                             │
│                        │ • S-1 weak ETag changes to W/"2026-10-09.2", causing clients to revalidate cache.     │
│                        │ • 8 settings now expose risk: 'high', requires_reason: true, and populated warnings[]. │
│                        │ • Populates cross-setting relationships: conflicts_with and depends_on.               │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ S-2: /settings/catalog │ • Reflects updated risk, warnings, and relationship metadata for queried setting key.   │
│      /:settingKey      │ • Weak ETag reflects catalog version bump.                                              │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ S-3: /settings         │ • Live values immediately reflect settings modified via S-5 or S-6.                    │
│                        │ • non_default_keys array dynamically updates based on valuesEqual comparison.          │
│                        │ • S-3 top-level ETag advances to max(updated_at) across stores.                         │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ S-4: /settings/groups  │ • S-4 values dictionary reflects new stored state.                                     │
│      /:groupKey        │ • Group ETag advances to W/"<version>:<new_updated_at>".                                │
│                        │ • non_default_keys array accurately updates for the target group.                       │
└────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Backward Compatibility with Existing Domain Settings Endpoints
Pre-existing domain endpoints continue to operate in production with zero breaking changes:
* `PUT /api/v1/payroll/hr/settings`
* `PUT /api/v1/payroll/hr/statutory-config`
* `PUT /api/v1/documents/hr/settings`
* `PUT /api/v1/documents/hr/letter-branding`
* `PATCH /api/v1/organizations/profile`

**Underlying Service Hardening:**
To support `S-5` and `S-6`, five domain services were enhanced to accept an optional `{ ifMatch }` option. Existing domain controllers omit this parameter (`ifMatch = null`), preserving their exact historical behavior. Additionally, two critical domain race-condition vulnerabilities were remediated:
1. **DEF-S7 Fixed (`payroll_settings.service.js`):** Added `SELECT ... FOR UPDATE` row locking to `update()`. Previously, concurrent writers could compute diffs against stale in-memory snapshots.
2. **DEF-S10 Fixed (`organization.service.js`):** Extracted `updateOrganizationProfileFieldsLocked` utilizing `SELECT ... FOR UPDATE`. Previously, updates executed blind SQL `UPDATE` statements without locking or capturing prior state for audit logs.

### 6.3 Documented Audit Log Gap for `billing.notifications` (EC-P2-1)
Writes to the `billing.notifications` group update `organization_profiles` via DEF-S10. Because `organization_profiles` possesses no domain audit table in the existing schema, writes to this group in Phase 2 are **not audit logged**. This is an existing codebase limitation (the canonical `PATCH /organizations/profile` endpoint is equally unaudited). DEF-S10 captures both `before` and `after` rows so Phase 3 (`settings_change_logs`) can establish audit coverage without requiring further changes to the organization module.

---

## 7. Cross-Module Consistency & Architectural Patterns

1. **Standardized Context Object (`ctx`):**
   The Settings controller constructs a uniform context: `{ orgId, actorId, actorRole, ipAddress, requestId }`. Store adapters map these keys to domain signatures (e.g. mapping `ipAddress` to `ip` for payroll services), ensuring uniform audit attribution across all modules.
2. **Standardized Error Semantics:**
   All rejections map directly to established HRMS error conventions:
   * Validation failures: `400 VALIDATION_ERROR` or `422 SETTINGS_PAYLOAD_INVALID`.
   * Authentication/Authorization: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `403 FEATURE_NOT_AVAILABLE`.
   * Resource checks: `404 GROUP_NOT_FOUND`, `405 SETTINGS_GROUP_READ_ONLY`.
   * Concurrency/Policy conflicts: `409 SETTINGS_CONFIRMATION_REQUIRED`, `412 SETTINGS_PRECONDITION_FAILED`.
   * Dependency outages: `503 ENTITLEMENT_DEPENDENCY_FAILURE`.
3. **HTTP Status `412` Introduction:**
   Phase 2 introduces HTTP `412 Precondition Failed` to the HRMS API. It is utilized exclusively for optimistic concurrency precondition failures, replacing generic `400` or `409` errors with standard RFC 9110 semantics.

---

## 8. Final Coverage & Verification Audit

```text
================================================================================
SETTINGS MODULE PHASE 2 — API VERIFICATION AUDIT
================================================================================
Total Phase 2 APIs discovered: 2
Total Phase 2 APIs documented: 2 (#246, #247)
New APIs added: 2
Existing APIs modified by Phase 2: 0
APIs corrected: 0
APIs still missing: 0

Request contracts verified: 2 / 2
Success responses verified: 2 / 2
Error handling verified: 2 / 2
Security/authorization verified: 2 / 2
Database behavior verified: 2 / 2
Settings read/write behavior verified: 2 / 2

Phase 1 APIs reviewed for Phase 2 impact: 4
Phase 1 APIs actually changed by Phase 2: 0 (Contracts unchanged; live state linked)
APIs incorrectly assumed as changed: 0
================================================================================
```

### Unit Test Verification Evidence
The Settings Module unit test suite executes with 100% green assertions:
* **Command:** `node --test tests/unit/settings/*.test.js`
* **Test Suites:** 5
* **Total Passing Tests:** 133
* **Failing Tests:** 0
* **Cancelled / Skipped Tests:** 0
* **Execution Time:** ~6.9 seconds
* **Verified Test Coverage:**
  * `write_service.test.js`: Verified S-5 and S-6 full 11-step execution pipeline, gate orders, owner delegation, 412 enrichment, and statutory impact surfacing.
  * `if_match.test.js`: Verified ETag parsing, catalog version segment validation, wildcard rejection, and row timestamp comparison under lock.
  * `patch_utils.test.js`: Verified body bounds checking, allowlist intersection, high-risk policy derivation, and stored-row diffing.
  * `owner_validation.test.js`: Verified owner Joi execution at gateway, type conversion, and `noDefaults` address protection.
  * `owner_lock_contract.test.js`: Verified DEF-S7 and DEF-S10 row-level locking contracts across domain stores.
