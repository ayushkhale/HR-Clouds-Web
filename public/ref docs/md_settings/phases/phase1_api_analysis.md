# Phase 1 Complete API Analysis Documentation: Settings Module (Foundation, Catalog & Read Plane)

**Document File:** `public/md_settings/phases/phase1_api_analysis.md`  
**Author:** Senior/Principal Backend Engineer, API Architect & Technical Documentation Engineer  
**Status:** Shipped, Verified & Green (`node --test tests/unit/settings/*.test.js` — 133 passing assertions, 0 failures)  
**Codebase Sources of Truth:**
* Router: [src/modules/settings/routes/settings.routes.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js)
* Controller: [src/modules/settings/controllers/settings.controller.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/controllers/settings.controller.js)
* Validators: [src/modules/settings/validators/settings.validator.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/validators/settings.validator.js)
* Services:
  * Catalog Service: [src/modules/settings/services/settings_catalog.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_catalog.service.js)
  * Read Service: [src/modules/settings/services/settings_read.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_read.service.js)
  * Entitlement Service: [src/modules/settings/services/settings_entitlement.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_entitlement.service.js)
* Catalog & Store Adapters:
  * Catalog Loader: [src/modules/settings/catalog/index.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/catalog/index.js)
  * Groups Definition: [src/modules/settings/catalog/groups.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/catalog/groups.js)
  * Surfaces Definition: [src/modules/settings/catalog/surfaces.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/catalog/surfaces.js)
  * Store Adapters: [src/modules/settings/adapters/](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/adapters/)
* Module Mount: [src/modules/settings/settings.index.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/settings.index.js) $\rightarrow$ [src/app.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/app.js)

---

## 1. Architectural Overview & Design Invariants

Phase 1 introduces the **read plane** and **declarative catalog** of the HRMS Settings Module. It exposes **four authenticated, read-only `GET` endpoints** (`#242` through `#245` in the system API registry) over a deep-frozen in-process catalog (138 settings keys across 26 groups and 49 configuration surfaces) aggregating data from 5 existing domain singleton stores.

### 1.1 Fundamental System Invariants

1. **No New Settings Table (Pure Gateway / Aggregator):**
   The Settings Module owns **zero database tables, zero models, zero seeders, and zero migrations** in Phase 1. It acts as an abstraction gateway reading live values from existing domain tables:
   * `payroll_settings` (63 keys across 11 groups)
   * `statutory_configs` (25 keys across 4 groups)
   * `document_settings` (35 keys across 9 groups)
   * `document_letter_branding` (13 keys across 1 group)
   * `organization_profiles` (2 keys across 1 group)
2. **Tenant-Plane Authority Only (`hr`, `manager`):**
   Settings are tenant organizational data. Platform-plane roles (`admin`, `super-admin`) are strictly excluded and blocked at the router with `403 FORBIDDEN`. Tokens must carry a valid `req.user.orgId`.
3. **No Route-Level `requireFeature` Gate:**
   Unlike single-domain routers, the settings router cannot attach a blanket `requireFeature('payroll.access')` middleware because a single page request aggregates groups across multiple modules (`payroll`, `document`, `organization`). Entitlement is therefore checked **per group inside the service layer** and surfaced in the response payload.
4. **Resilient Read Aggregation (`Promise.allSettled`):**
   When fetching all settings (`S-3`), stores are read concurrently using `Promise.allSettled`. If one store fails (e.g. timeout on `statutory_configs`), the request **does not fail with 500**; the healthy stores return normally, and the failed store's groups degrade to `READ_FAILED` in `unavailable_groups[]`.
5. **Load-Time Invariant Validation (Boot-Crash Honesty):**
   The catalog is validated against 11 structural invariants during `require('./catalog')` at application startup. If any catalog key is duplicated, missing from groups, improperly typed, or violates platform role constraints, the Node.js process crashes immediately, preventing malformed contracts from serving traffic.
6. **Built-in Type-Aware Comparator (`valuesEqual`):**
   PostgreSQL `pg` drivers return `NUMERIC`/`DECIMAL` columns as JavaScript strings (e.g. `'2.00'`), whereas catalog defaults and Joi schemas declare numbers (`2.00`). The comparator handles type coercion for decimal/integer comparisons, preventing every clean tenant from erroneously reporting non-default settings.
7. **Weak ETag & HTTP 304 Validation:**
   Every endpoint issues a weak `ETag` and `Cache-Control: private, max-age=0, must-revalidate`. Clients echoing `If-None-Match` receive an immediate `304 Not Modified` with an empty body.

---

## 2. Shared Request & Response Conventions

### 2.1 Standard Response Envelopes

#### Success Envelope (`200 OK` / `304 Not Modified`)
```json
{
  "success": true,
  "message": "OK",
  "data": { ... }
}
```

#### Error Envelope
All error responses are emitted via `AppError(status, message, errorCode, details?)` and handled by the global error middleware:
```json
{
  "success": false,
  "errorCode": "ERROR_CODE_STRING",
  "message": "Human-readable explanation of failure",
  "details": {}
}
```

### 2.2 Global Auth Stack
All 4 Phase 1 endpoints share the identical middleware stack defined in [settings.routes.js:28](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js#L28):
```javascript
const settingsReadAuth = [authenticate, authorize(['hr', 'manager']), requireActiveOrg]
```
* `authenticate`: Validates JWT, verifies blacklist, injects frozen `req.user`.
* `authorize(['hr', 'manager'])`: Enforces that caller is a tenant administrator or team manager.
* `requireActiveOrg`: Rejects inactive/suspended tenants with `403 ORG_NOT_ACTIVE`.

### 2.3 Express 5 Query Hardening
In Express 5, `req.query` is getter-only. All query parameters are validated strictly inside controllers into isolated local variables using `validateOrThrow(schema, req.query)`. Parameter pollution (e.g. `?module=payroll&module=document`, which Express 5 parses as an array) is rejected with `400 VALIDATION_ERROR` via strict `Joi.string()` declarations.

---

## 3. Shipped Phase 1 APIs — Detailed Analysis

```text
┌──────┬────────┬──────────────────────────────────────┬─────────────┬──────────────────────────────────────────────────────┐
│ Ref  │ Method │ Endpoint                             │ Registry #  │ Name / Core Purpose                                  │
├──────┼────────┼──────────────────────────────────────┼─────────────┼──────────────────────────────────────────────────────┤
│ S-1  │ GET    │ /api/v1/settings/catalog             │ #242        │ Settings Catalog & Discovery Metadata                │
│ S-2  │ GET    │ /api/v1/settings/catalog/:settingKey │ #243        │ Single Catalog Entry Detail & Relationship Graph     │
│ S-3  │ GET    │ /api/v1/settings                     │ #244        │ Aggregated Live Settings Values (All Groups)         │
│ S-4  │ GET    │ /api/v1/settings/groups/:groupKey    │ #245        │ Single Group Live Settings Values & Entry Metadata   │
└──────┴────────┴──────────────────────────────────────┴─────────────┴──────────────────────────────────────────────────────┘
```

---

### API S-1: Get Settings Catalog & Discovery Metadata

* **API Number / Registry Ref:** `S-1` (API Registry **#242**)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/catalog`
* **Purpose:** Provides the machine-readable contract of all organization settings, groups, and surfaces. Used by the frontend to render navigation, tabs, form controls, validation rules, and tooltips. **Contains zero current tenant values.**

#### Authentication & Authorization
* **Bearer Token Required:** Yes.
* **Allowed Roles:** `hr`, `manager`.
* **Tenant Isolation:** Enforced via `req.user.orgId`.
* **Entitlement Check:** Evaluates feature flags (`payroll.access`, `documents.access`) per group via `entitlementService.hasFeature()`. Returns `entitled: true/false` on each group.

#### Request Parameters
* **Request Body:** None (`GET`).
* **Query Parameters (`catalogQuerySchema`):**
  | Parameter | Type | Required? | Default | Constraints & Validation Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `module` | String | Optional | `null` | Must be one of: `payroll`, `document`, `organization`, `leave`, `attendance`. Mutually exclusive with `group`. |
  | `group` | String | Optional | `null` | Pattern: `^[a-z0-9_.]{1,60}$`. Must match an existing group key in `groups.js`. Mutually exclusive with `module`. |
  | `include_hidden`| Boolean| Optional | `false` | When `true`, includes deprecated settings entries (e.g. `pdf_render_engine`). |

* **Validation Rules & Express 5 Edge Cases:**
  * If both `module` and `group` are provided simultaneously $\rightarrow$ `422 INVALID_FILTER_COMBINATION`.
  * Unknown query parameters $\rightarrow$ rejected with `400 VALIDATION_ERROR` (`.unknown(false)`).
  * Parameter pollution (`?module=a&module=b`) $\rightarrow$ rejected with `400 VALIDATION_ERROR`.

#### Detailed Execution Pipeline
1. **Controller Layer (`settings.controller.js:getCatalog`):**
   * Extracts context: `ctx = { orgId, actorId, actorRole, ipAddress, requestId }`.
   * Validates `req.query` with `schemas.catalogQuerySchema`.
   * Asserts mutual exclusivity of `module` and `group`.
2. **Service Layer (`settings_catalog.service.js:getCatalog`):**
   * Filters the frozen `catalog.GROUPS` based on `module` or `group`.
   * Projects groups for caller's role via `projectGroupForRole(group, ctx.actorRole)`:
     * `hr`: `readable = true`, `writable = true` (except `payroll.deprecated`).
     * `manager`: `readable = true` on `payroll.authority` and `documents.authority`; `readable = false` on all 24 other groups. `writable = false` on all groups.
   * Resolves subscription entitlement **once per distinct feature key** using `resolveEntitlements(ctx.orgId, featureKeys)`.
   * Filters `catalog.ENTRIES` for surviving groups, excluding deprecated entries unless `include_hidden = true`.
   * Strips `enforcement_hint` from all entries via `projectEntryForResponse` (prevents leaking internal file paths).
   * Attaches matching entries from `catalog.SURFACES` (the 49 multi-record pointers). If `group` was specified, surfaces are omitted (`[]`) as surfaces do not belong to singleton groups.
3. **ETag & Cache Check:**
   * Generates weak ETag: `W/"<CATALOG_VERSION>"` (e.g. `W/"2026-10-09.2"`).
   * If `req.headers['if-none-match'] === tag` $\rightarrow$ returns HTTP `304 Not Modified` immediately.
   * Otherwise sets `ETag` and `Cache-Control: private, max-age=0, must-revalidate` and returns `200 OK`.

#### Database & Transaction Impact
* **Pure in-memory operation:** Zero Sequelize database queries, except the 1–2 cached/direct queries performed inside `entitlementService.hasFeature()`. No database transaction opened.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "catalog_version": "2026-10-09.2",
    "generated_at": "2026-10-09T02:21:08.123Z",
    "groups": [
      {
        "key": "payroll.calendar",
        "label": "Payroll Calendar",
        "module_key": "payroll",
        "store": "payroll_settings",
        "feature_key": "payroll.access",
        "order": 10,
        "readable": true,
        "writable": true,
        "entitled": true,
        "setting_count": 7
      }
    ],
    "settings": [
      {
        "key": "payroll_cycle",
        "registry_ref": 35,
        "group_key": "payroll.calendar",
        "module_key": "payroll",
        "store": "payroll_settings",
        "label": "Payroll Cycle",
        "description": null,
        "unit": null,
        "doc_ref": "org_settings_registry.md#35",
        "data_type": "enum",
        "default": "monthly",
        "nullable": false,
        "range": {
          "enum": ["monthly", "biweekly", "weekly"]
        },
        "platform_cap": null,
        "effect_timing": "next_run",
        "risk": "medium",
        "requires_reason": false,
        "resettable": true,
        "sensitive": false,
        "deprecated": false,
        "split": false,
        "normalised": false,
        "clearable": true,
        "empty_clears": false,
        "inherits_from": null,
        "depends_on": [],
        "depends_on_ops": [],
        "conflicts_with": [],
        "preconditions": [],
        "consumed_by": ["payroll"],
        "known_errors": [],
        "warnings": []
      }
    ],
    "surfaces": [
      {
        "registry_ref": 1,
        "key": "leave_sandwich_rule",
        "label": "Sandwich Rule",
        "module_key": "leave",
        "owner_table": "leave_types",
        "owner_endpoint_hint": null,
        "scope": "per_record",
        "managed_by": "leave"
      }
    ],
    "counts": {
      "groups": 26,
      "settings": 137,
      "surfaces": 49
    }
  }
}
```

#### Field-Level Response Dictionary
* `catalog_version` (String): Version identifier of the catalog contract (`YYYY-MM-DD.counter`).
* `generated_at` (String, ISO 8601): Timestamp when response was assembled.
* `groups[].key` (String): Unique identifier of the settings group.
* `groups[].readable` (Boolean): Whether the caller's role can read this group.
* `groups[].writable` (Boolean): Whether the caller's role can write to this group (advisory in Phase 1).
* `groups[].entitled` (Boolean): Whether the tenant's current billing subscription includes the required feature key.
* `groups[].setting_count` (Integer): Total active settings in this group.
* `settings[].key` (String): The exact database column name representing this setting.
* `settings[].data_type` (String): One of `boolean`, `integer`, `decimal`, `string`, `enum`, `array`, `date`, `jsonb`.
* `settings[].default` (Any): Factory default value.
* `settings[].effect_timing` (String): One of `immediate`, `next_record`, `next_run`, `next_cron_pass`, `inert`.
* `settings[].risk` (String): Risk classification (`low`, `medium`, `high`).
* `surfaces[]` (Array): Directory descriptors for the 49 per-record policy settings managed by domain CRUD.
* `counts.settings` (Integer): Count of settings returned in `settings[]` (137 active settings by default; 138 when `include_hidden=true`).

#### Error Responses
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Malformed query parameter or unexpected query key. |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing, expired, or invalid JWT Bearer token. |
| **403 Forbidden** | `FORBIDDEN` | Platform role (`admin`, `super-admin`) or `employee` attempting access. |
| **403 Forbidden** | `ORG_NOT_ACTIVE` | Organization status is suspended or inactive. |
| **404 Not Found** | `GROUP_NOT_FOUND` | Queried `?group=` does not exist in `groups.js`. |
| **422 Unprocessable**| `INVALID_FILTER_COMBINATION` | Both `module` and `group` query parameters supplied. |
| **422 Unprocessable**| `UNKNOWN_MODULE` | Queried `?module=` is not in the valid modules set. |
| **503 Service Unavail**| `ENTITLEMENT_DEPENDENCY_FAILURE`| Database unreachable during feature entitlement check (propagated unchanged). |

---

### API S-2: Get Single Catalog Entry Detail & Relationships

* **API Number / Registry Ref:** `S-2` (API Registry **#243**)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/catalog/:settingKey`
* **Purpose:** Fetches complete metadata, group projection, and resolved relationship references (`depends_on`, `conflicts_with`, `inherits_from`) for a single setting. Designed for configuration drawers and context help modals. **Returns zero current tenant values.**

#### Authentication & Authorization
* **Bearer Token Required:** Yes (`hr`, `manager`).
* **Tenant Isolation:** Scoped by `req.user.orgId`.

#### Request Parameters
* **Path Parameter (`settingKeyParamSchema`):**
  * `settingKey` (String, Required): Pattern `^[a-z0-9_]{1,80}$`. Must match an existing catalog key.
* **Validation & Security Hardening:**
  * Validated via `settingKeyParamSchema`.
  * Map-backed lookup (`catalog.byKey(settingKey)`): Prototype pollution keys (`__proto__`, `constructor`, `hasOwnProperty`) return `404 SETTING_NOT_FOUND` without checking the JavaScript prototype chain.

#### Detailed Execution Pipeline
1. Validates `req.params` with `schemas.settingKeyParamSchema`.
2. Resolves setting from in-memory Map: `entry = catalog.byKey(settingKey)`. If missing $\rightarrow$ throws `404 SETTING_NOT_FOUND`.
3. Resolves owning group from Map: `group = catalog.groupByKey(entry.group_key)`.
4. Resolves relationship stubs (`depends_on`, `conflicts_with`) into `{ key, label, group_key }` objects so client drawers can build links without secondary queries.
5. If `inherits_from` references a foreign table rather than a key (e.g. `organization_profiles`), passes through as `{ ref: "<store_name>" }`.
6. Strips `enforcement_hint`.
7. Evaluates weak ETag `W/"<CATALOG_VERSION>"`. Returns `304` if matched, else `200 OK`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "catalog_version": "2026-10-09.2",
    "setting": {
      "key": "payroll_require_separate_checker",
      "registry_ref": 39,
      "group_key": "payroll.authority",
      "module_key": "payroll",
      "store": "payroll_settings",
      "label": "Require a separate checker",
      "description": null,
      "unit": null,
      "doc_ref": "org_settings_registry.md#39",
      "data_type": "boolean",
      "default": false,
      "nullable": false,
      "range": null,
      "platform_cap": null,
      "effect_timing": "next_run",
      "risk": "high",
      "requires_reason": true,
      "resettable": true,
      "sensitive": false,
      "deprecated": false,
      "split": false,
      "normalised": false,
      "clearable": true,
      "empty_clears": false,
      "inherits_from": null,
      "depends_on": [],
      "depends_on_ops": [],
      "conflicts_with": [],
      "preconditions": ["min_active_hr:2"],
      "consumed_by": ["payroll"],
      "known_errors": ["INSUFFICIENT_CHECKERS", "SEPARATE_CHECKER_REQUIRED"],
      "warnings": [
        "Changes who may approve a payroll run: turning this on requires a second active HR to approve every run, and turning it off lets a single HR approve money alone."
      ]
    },
    "group": {
      "key": "payroll.authority",
      "label": "Approval authority",
      "module_key": "payroll",
      "store": "payroll_settings",
      "feature_key": "payroll.access",
      "order": 20,
      "readable": true,
      "writable": true
    },
    "related": {
      "depends_on": [],
      "conflicts_with": [],
      "inherits_from": null
    }
  }
}
```

#### Error Responses
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | `settingKey` violates regex `^[a-z0-9_]{1,80}$`. |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid auth token. |
| **403 Forbidden** | `FORBIDDEN` | Caller is not `hr` or `manager`. |
| **404 Not Found** | `SETTING_NOT_FOUND` | Setting key does not exist in catalog. |

---

### API S-3: Get All Settings Values (Aggregated Read Plane)

* **API Number / Registry Ref:** `S-3` (API Registry **#244**)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings`
* **Purpose:** Primary read endpoint powering the entire Organization Settings dashboard. Returns live settings values across all authorized and entitled groups, with per-group ETag tokens and non-default diff tracking.

#### Authentication & Authorization
* **Bearer Token Required:** Yes (`hr`, `manager`).
* **Tenant Isolation:** Reads strictly for `ctx.orgId = req.user.orgId`.
* **RBAC Filtering:**
  * `hr`: Can read all 26 groups across all 5 stores.
  * `manager`: Can read only 2 authority groups (`payroll.authority` and `documents.authority`). The other 24 groups are routed into `unavailable_groups[]` with reason `NOT_READABLE`.

#### Request Parameters
* **Request Body:** None (`GET`).
* **Query Parameters (`allQuerySchema`):**
  | Parameter | Type | Required? | Default | Constraints & Validation Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `modules` | String | Optional | `null` | Comma-separated list (e.g. `payroll,document`). Regex: `^[a-z0-9_,]{1,120}$`. Each token must be in `['payroll', 'document', 'organization', 'leave', 'attendance']`. |

* **Validation Rules:**
  * An array of `modules` (`?modules=payroll&modules=document`) fails `400 VALIDATION_ERROR`.
  * An unrecognised module name (e.g. `?modules=payroll,finance`) fails `422 UNKNOWN_MODULE` before any database store is queried.

#### Detailed Execution Pipeline
1. **Context & Validation:**
   * Validates query string; splits `q.modules` by comma; rejects invalid module names with `422 UNKNOWN_MODULE`.
2. **Step 1 — Role-Based Filter:**
   * Evaluates `isGroupReadable(group, ctx.actorRole)` for all candidate groups.
   * Groups not readable by the caller are added to `unavailable_groups` with `{ key, reason: 'NOT_READABLE' }`.
3. **Step 2 — Batched Entitlement Check:**
   * Extracts distinct non-null `featureKey` values across readable groups (max 2 keys: `payroll.access`, `documents.access`).
   * Calls `resolveEntitlements(ctx.orgId, keys)` once.
   * Groups whose feature is not on the organization plan are added to `unavailable_groups` with `{ key, reason: 'NOT_ENTITLED' }`.
   * **503 Propagation Invariant:** If `entitlementService.hasFeature` throws `503 ENTITLEMENT_DEPENDENCY_FAILURE` due to a database connection failure, the error is **never** caught or flattened into `NOT_ENTITLED`; it rethrows immediately.
4. **Step 3 — Filter-Before-Read Optimization:**
   * Determines the set of distinct stores backing the surviving entitled groups (at most 5 stores).
   * If an HR manager is not entitled to payroll, `payroll_settings` and `statutory_configs` are **never queried**, preventing accidental row provisioning.
5. **Step 4 — Concurrent Store Execution (`Promise.allSettled`):**
   * Fires parallel reads to the 5 store adapters:
     * `payroll_settings`: calls `payrollSettingsService.getOrCreate(orgId)`
     * `statutory_configs`: calls `statutoryConfigService.getConfig(orgId)`
     * `document_settings`: calls `documentSettingsService.getOrCreate(orgId)`
     * `document_letter_branding`: calls `letterBrandingService.getOrCreate(orgId, { includeAssetUrls: false })`
     * `organization_profiles`: calls `organizationRepository.findOrganizationProfileByOrgId(orgId)`
   * Rejections: If an adapter throws a `503`, it rethrows immediately. If an adapter throws an ordinary error, only that store's groups are marked `{ key, reason: 'READ_FAILED' }`.
6. **Step 5 — Value Slicing & Comparator:**
   * Slices values per group using `sliceValues(storeValues, keys)`.
   * Computes `non_default_keys` via `valuesEqual(storedValue, catalogDefault, dataType)`.
   * Computes individual group ETags: `W/"<CATALOG_VERSION>:<updated_at ISO>"`.
7. **Step 6 — Global ETag & Response Assembly:**
   * Computes response ETag: `W/"<CATALOG_VERSION>:<max(updated_at) ISO>"`.
   * If `req.headers['if-none-match'] === data.etag` $\rightarrow$ returns `304 Not Modified`.
   * Otherwise returns `200 OK`.

#### Database & Transaction Impact
* **Lazy Provisioning:** If an active organization reads settings for the first time, `getOrCreate` runs in the domain services, lazily inserting default rows in `payroll_settings`, `statutory_configs`, `document_settings`, and `document_letter_branding`.
* **Audit Side Effect:** First access to `document_letter_branding` automatically logs a `letter_branding.initialized` audit record in `document_audit_logs`.
* **No Gateway Transactions:** The Settings gateway opens no transactions and acquires no database locks.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "catalog_version": "2026-10-09.2",
    "org_id": "018e3d55-1234-7890-abcd-ef0123456789",
    "groups": [
      {
        "key": "payroll.calendar",
        "label": "Payroll Calendar",
        "module_key": "payroll",
        "store": "payroll_settings",
        "readable": true,
        "writable": true,
        "entitled": true,
        "values": {
          "payroll_cycle": "monthly",
          "period_start_day": 1,
          "attendance_cutoff_day": 25,
          "pay_day": 30,
          "pay_day_in_next_month": false,
          "currency": "INR",
          "financial_year_start_month": 4
        },
        "non_default_keys": ["pay_day"],
        "updated_at": "2026-10-08T14:32:00.000Z",
        "etag": "W/\"2026-10-09.2:2026-10-08T14:32:00.000Z\""
      }
    ],
    "unavailable_groups": [
      {
        "key": "statutory.pf",
        "reason": "NOT_ENTITLED"
      }
    ],
    "etag": "W/\"2026-10-09.2:2026-10-08T14:32:00.000Z\"",
    "meta": {
      "stores_read": 5,
      "groups_returned": 25,
      "groups_unavailable": 1
    }
  }
}
```

#### Field-Level Response Dictionary
* `groups[].values` (Object): Map of current settings values keyed by database column name.
* `groups[].non_default_keys` (Array of Strings): Column names whose current stored value differs from the catalog factory default.
* `groups[].updated_at` (String, ISO 8601): The timestamp of the underlying store row (shared across all groups sharing that store).
* `groups[].etag` (String): Group-specific concurrency ETag for Phase 2 optimistic locking.
* `unavailable_groups[]` (Array): Groups that could not be returned, with exact failure reasons:
  * `NOT_READABLE`: Role does not have read permissions (e.g. manager accessing loans).
  * `NOT_ENTITLED`: Tenant subscription plan does not include the module feature.
  * `READ_FAILED`: Transient failure reading the underlying store.
* `meta.stores_read` (Integer): Count of unique physical stores read (max 5).

#### Error Responses
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Array parameter passed in `modules` (`?modules=a&modules=b`). |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid auth token. |
| **403 Forbidden** | `FORBIDDEN` | Caller is not `hr` or `manager`. |
| **422 Unprocessable**| `UNKNOWN_MODULE` | A module in `?modules=` is unrecognized. |
| **503 Service Unavail**| `ENTITLEMENT_DEPENDENCY_FAILURE`| Database unreachable during feature entitlement check. |

---

### API S-4: Get Single Group Settings Values & Metadata

* **API Number / Registry Ref:** `S-4` (API Registry **#245**)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/groups/:groupKey`
* **Purpose:** Targeted endpoint fetching current values and per-entry catalog metadata for a single group. Used when rendering a dedicated settings tab/drawer and refreshing state after an update.

#### Authentication & Authorization
* **Bearer Token Required:** Yes (`hr`, `manager`).
* **Tenant Isolation:** Enforced via `req.user.orgId`.
* **Fail-Loud Security Asymmetry:** Unlike `S-3` (which degrades gracefully), `S-4` is a targeted request and **fails loudly** with hard HTTP error codes:
  * Role not allowed $\rightarrow$ `403 FORBIDDEN`
  * Feature not subscribed $\rightarrow$ `403 FEATURE_NOT_AVAILABLE`

#### Request Parameters
* **Path Parameter (`groupKeyParamSchema`):**
  * `groupKey` (String, Required): Pattern `^[a-z0-9_.]{1,60}$`. E.g. `payroll.calendar`.
* **Validation Rules:**
  * Regex validates characters and length.
  * Unknown group $\rightarrow$ `404 GROUP_NOT_FOUND`.

#### Detailed Execution Pipeline
1. Validates `groupKey` with `schemas.groupKeyParamSchema`.
2. Resolves group: `group = catalog.groupByKey(groupKey)`. If missing $\rightarrow$ `404 GROUP_NOT_FOUND`.
3. RBAC Gate: `projection.isGroupReadable(group, ctx.actorRole)`. If `false` $\rightarrow$ `403 FORBIDDEN` (`FORBIDDEN`).
4. Entitlement Gate: `resolveEntitlements(ctx.orgId, [group.featureKey])`. If `false` $\rightarrow$ `403 FEATURE_NOT_AVAILABLE`.
5. Reads the single underlying store via `adapterForStore(group.store).read(ctx.orgId)`. Any store rejection propagates directly.
6. Slices group values, computes `non_default_keys`, and attaches catalog entry metadata via `settings[]`.
7. Evaluates group ETag: `W/"<CATALOG_VERSION>:<updated_at ISO>"`. Returns `304` if matched, else `200 OK`.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "key": "payroll.calendar",
    "label": "Payroll Calendar",
    "module_key": "payroll",
    "store": "payroll_settings",
    "readable": true,
    "writable": true,
    "entitled": true,
    "values": {
      "payroll_cycle": "monthly",
      "period_start_day": 1,
      "attendance_cutoff_day": 25,
      "pay_day": 30,
      "pay_day_in_next_month": false,
      "currency": "INR",
      "financial_year_start_month": 4
    },
    "non_default_keys": ["pay_day"],
    "updated_at": "2026-10-08T14:32:00.000Z",
    "etag": "W/\"2026-10-09.2:2026-10-08T14:32:00.000Z\"",
    "settings": [
      {
        "key": "pay_day",
        "registry_ref": 36,
        "group_key": "payroll.calendar",
        "module_key": "payroll",
        "store": "payroll_settings",
        "label": "Pay Day",
        "description": null,
        "unit": "days",
        "doc_ref": "org_settings_registry.md#36",
        "data_type": "integer",
        "default": 30,
        "nullable": false,
        "range": {
          "min": 1,
          "max": 31
        },
        "platform_cap": null,
        "effect_timing": "next_run",
        "risk": "medium",
        "requires_reason": false,
        "resettable": true,
        "sensitive": false,
        "deprecated": false,
        "split": false,
        "normalised": false,
        "clearable": true,
        "empty_clears": false,
        "inherits_from": null,
        "depends_on": [],
        "depends_on_ops": [],
        "conflicts_with": [],
        "preconditions": [],
        "consumed_by": ["payroll"],
        "known_errors": [],
        "warnings": []
      }
    ]
  }
}
```

#### Error Responses
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Malformed `groupKey` parameter. |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid auth token. |
| **403 Forbidden** | `FORBIDDEN` | Caller's role cannot read this group. |
| **403 Forbidden** | `FEATURE_NOT_AVAILABLE` | Tenant plan lacks the feature flag for this group. |
| **404 Not Found** | `GROUP_NOT_FOUND` | Group key does not exist. |
| **404 Not Found** | `ORG_PROFILE_NOT_FOUND` | For `billing.notifications`, profile row does not exist. |
| **503 Service Unavail**| `ENTITLEMENT_DEPENDENCY_FAILURE`| Database unreachable during feature entitlement check. |

---

## 4. Security & Production Verification Audit

| Security Domain | Enforced Mechanism in Implementation |
| :--- | :--- |
| **Tenant Isolation** | Absolute. `orgId` is read exclusively from `req.user.orgId`. No endpoint accepts `orgId` via path, query, or body. Verified across all adapter read operations (`T-S22`). |
| **RBAC Enforcement** | Two-tiered: coarse route allowlist `['hr', 'manager']` plus strict service-level checks (`group.read_roles.includes(role)`). Managers can only read authority groups. |
| **Platform Plane Exclusion** | `admin` and `super-admin` tokens are stopped at the route gate with `403 FORBIDDEN`. Invariant 8 verifies that no catalog group grants access to platform roles. |
| **Secret Sanitization** | `T-S18` asserts that no catalog entry carries `sensitive: true`. Database storage keys (`logo_storage_key`, `signature_storage_key`), cron watermarks, and encryption keys are excluded. |
| **Prototype Pollution** | Catalog lookups use native `Map` instances (`keyToEntry.get()`), rendering `__proto__` and `constructor` attacks completely inert (`T-P1-14`). |
| **Path / Query Injection** | Regex rules (`^[a-z0-9_]{1,80}$`) anchor all parameters. Joi `.unknown(false)` blocks unexpected parameter tampering. |
| **Asset URL Performance** | Letter branding adapter explicitly passes `{ includeAssetUrls: false }`, preventing expensive S3 presigned URL generation during settings reads (`T-P1-5`). |

---

## 5. Cross-Module Consistency & Impact on Existing APIs

### 5.1 Existing Module Impact
* **New APIs Introduced:** 4 (`S-1`, `S-2`, `S-3`, `S-4`).
* **Existing Endpoints Modified:** **ZERO.**
* **Source Diff Outside `src/modules/settings/`:** Exactly **1 line** in [src/app.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/app.js) mounting the module router.
* **Backward Compatibility:** 100% preserved. Canonical domain endpoints (`/api/v1/payroll/hr/settings`, `/api/v1/documents/hr/settings`, `/api/v1/organizations/profile`) remain active and unaffected.

### 5.2 The S-3 vs S-4 Contract Asymmetry
The intentional contract difference between collection and targeted reads must be understood by frontend clients:

| Scenario / Condition | `S-3: GET /settings` (Dashboard Page Load) | `S-4: GET /settings/groups/:groupKey` (Targeted Sub-Page) |
| :--- | :--- | :--- |
| **Role Not Permitted** | Group listed in `unavailable_groups` as `NOT_READABLE`; overall response `200 OK`. | Returns HTTP `403 FORBIDDEN`. |
| **Feature Unsubscribed** | Group listed in `unavailable_groups` as `NOT_ENTITLED`; overall response `200 OK`. | Returns HTTP `403 FEATURE_NOT_AVAILABLE`. |
| **Store Read Failure** | Group listed in `unavailable_groups` as `READ_FAILED`; healthy stores return `200 OK`. | Error propagates immediately (fails request). |
| **Database Outage (503)**| Propagates HTTP `503 ENTITLEMENT_DEPENDENCY_FAILURE`. | Propagates HTTP `503 ENTITLEMENT_DEPENDENCY_FAILURE`. |

---

## 6. Final Coverage & Verification Audit

```text
================================================================================
SETTINGS MODULE PHASE 1 — API VERIFICATION AUDIT
================================================================================
Total Phase 1 APIs discovered: 4
Total Phase 1 APIs documented: 4
New APIs added: 4 (#242, #243, #244, #245)
Existing APIs modified by Phase 1: 0
APIs corrected: 0
APIs still missing: 0

Request contracts verified: 4 / 4
Success responses verified: 4 / 4
Error handling verified: 4 / 4
Security/authorization verified: 4 / 4
Database behavior verified: 4 / 4
Settings read/write behavior verified: 4 / 4

Existing APIs reviewed for Phase 1 impact: 4
Existing APIs actually changed by Phase 1: 0
APIs incorrectly assumed as changed: 0
================================================================================
```
