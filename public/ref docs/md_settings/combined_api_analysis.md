# Combined API Analysis: Settings Module

# Phase 1: Foundation, Catalog & Read Plane (APIs #242–#245)

## 1. Discovery & Catalog Read Plane

### 1. GET /api/v1/settings/catalog

* **API Number / Registry Ref:** S-1 (API Registry #242)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/catalog`
* **Purpose & Business Problem Solved:** Provides the complete machine-readable contract of all 138 organizational settings, 26 groups, and 49 policy surface pointers without exposing any current tenant values. Frontends use this endpoint to dynamically construct settings navigation, category tabs, form controls, validation rules, help tooltips, and policy directory links without hardcoding module configuration schemas.

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (Valid JWT Bearer token).
* **Allowed Roles:** `hr`, `manager`.
* **Platform Plane Exclusion:** Platform administrators (`admin`, `super-admin`) are strictly blocked at the route layer with HTTP `403 FORBIDDEN` (`errorCode: "FORBIDDEN"`). Tokens carrying `orgId = null` are rejected.
* **Tenant Isolation:** Enforced via `req.user.orgId`. The caller cannot pass or override `orgId` via query, path, or headers.
* **Active Organization Check:** Verified via `requireActiveOrg`. Suspended or inactive tenants are rejected with HTTP `403 FORBIDDEN` (`errorCode: "ORG_NOT_ACTIVE"`).
* **Role-Based Projection:**
  * For `hr`: All 26 groups are marked `readable: true`, `writable: true` (except `payroll.deprecated`, where `writable: false`).
  * For `manager`: Only 2 governance groups (`payroll.authority` and `documents.authority`) are marked `readable: true`, `writable: false`. The remaining 24 groups are projected with `readable: false`, `writable: false`.
* **Feature Entitlement Check:** Service resolves subscription plan entitlements per group feature key (`payroll.access`, `documents.access`) via `entitlementService.hasFeature()`. Groups without active subscription feature access are marked `entitled: false`.
* **Secret Sanitization:** Internal source code paths (`enforcement_hint`) are stripped from every catalog entry prior to emitting the response. Catalog entries never expose secrets, cryptographic keys, or storage hashes.

#### Request Parameters & Headers
* **Request Body:** None (`GET`).
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-None-Match: W/"<CATALOG_VERSION>"` (Optional. If matching current catalog version, returns HTTP `304 Not Modified` with empty body).
* **Query Parameters (`catalogQuerySchema`):**
  | Parameter | Type | Required? | Default | Validation Constraints & Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `module` | String | Optional | `null` | Must be one of: `payroll`, `document`, `organization`, `leave`, `attendance`. Mutually exclusive with `group`. |
  | `group` | String | Optional | `null` | Pattern: `^[a-z0-9_.]{1,60}$`. Must match an active group key in `groups.js`. Mutually exclusive with `module`. |
  | `include_hidden` | Boolean | Optional | `false` | When `true`, includes deprecated/hidden settings entries (e.g. `pdf_render_engine`). When `false`, deprecated entries are omitted. |

* **Express 5 Query Validation & Parameter Pollution Hardening:**
  * `req.query` is getter-only. Parameters are validated into local variables using `Joi.object().unknown(false)`.
  * Supplying both `module` and `group` simultaneously triggers HTTP `422 Unprocessable Entity` (`errorCode: "INVALID_FILTER_COMBINATION"`).
  * Supplying unexpected query parameters triggers HTTP `400 Bad Request` (`errorCode: "VALIDATION_ERROR"`).
  * Parameter pollution (e.g. `?module=payroll&module=document`, parsed as an array) triggers HTTP `400 Bad Request` (`errorCode: "VALIDATION_ERROR"`).

#### Execution Behavior & Implementation Pipeline
1. Extracts execution context: `{ orgId, actorId, actorRole, ipAddress, requestId }`.
2. Validates query parameters against Joi schema. Asserts mutual exclusivity between `module` and `group`.
3. In-memory filtering: Filters candidate groups from frozen `catalog.GROUPS` by specified `module` or `group`.
4. Role Projection: Evaluates `projectGroupForRole(group, ctx.actorRole)` to set `readable`, `writable`, and `setting_count`.
5. Batch Entitlement Check: Collects distinct non-null `feature_key` values from candidate groups and calls `resolveEntitlements(ctx.orgId, featureKeys)` once.
6. Filters `catalog.ENTRIES` for surviving groups, removing deprecated entries unless `include_hidden = true`. Strips `enforcement_hint`.
7. Attaches matching descriptors from `catalog.SURFACES` (the 49 multi-record policy directory pointers). If `group` was specified, `surfaces` is set to `[]` because surfaces are multi-record domain entities that do not belong to singleton settings groups.
8. Weak ETag Evaluation: Evaluates `W/"<CATALOG_VERSION>"` (e.g. `W/"2026-10-09.1"`). If `req.headers['if-none-match'] === tag`, returns HTTP `304 Not Modified` immediately. Otherwise sets `ETag` and `Cache-Control: private, max-age=0, must-revalidate` and returns `200 OK`.

#### Database Impact, Concurrency & Transactions
* **Database Operations:** Zero database tables owned. Zero write operations. At most 1–2 cached or direct read queries against organization subscription records inside `entitlementService.hasFeature()`.
* **Transaction Behavior:** No database transaction opened.
* **Concurrency & Locking:** Fully stateless in-memory catalog read; no database locks acquired.
* **Idempotency & Retries:** Inherently idempotent. Safe to retry freely.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "catalog_version": "2026-10-09.1",
    "generated_at": "2026-10-09T08:15:20.123Z",
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
      },
      {
        "key": "documents.branding",
        "label": "Letterhead and branding",
        "module_key": "document",
        "store": "document_letter_branding",
        "feature_key": "documents.access",
        "order": 20,
        "readable": true,
        "writable": true,
        "entitled": true,
        "setting_count": 13
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
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `success` | Boolean | No | Always `true` on successful response. |
| `message` | String | No | Always `"OK"`. |
| `data.catalog_version` | String | No | System release catalog version identifier (`YYYY-MM-DD.counter`). |
| `data.generated_at` | String (ISO 8601) | No | Timestamp when the response payload was assembled. |
| `data.groups[]` | Array of Objects | No | Projected settings groups matching the filter. |
| `data.groups[].key` | String | No | Unique settings group key (e.g. `payroll.calendar`). |
| `data.groups[].label` | String | No | Human-readable label for the group. |
| `data.groups[].module_key` | String | No | Module key: `payroll`, `document`, `organization`, `leave`, `attendance`. |
| `data.groups[].store` | String | No | Backing storage table identifier (e.g. `payroll_settings`). |
| `data.groups[].feature_key` | String / Null | Yes | Billing feature flag required to access this group, or `null` if core. |
| `data.groups[].order` | Integer | No | Display sorting sequence index. |
| `data.groups[].readable` | Boolean | No | Whether the caller's role is authorized to view settings in this group. |
| `data.groups[].writable` | Boolean | No | Whether the caller's role is authorized to update settings in this group. |
| `data.groups[].entitled` | Boolean | No | Whether the organization's subscription plan includes this group's feature. |
| `data.groups[].setting_count` | Integer | No | Count of active settings entries belonging to this group. |
| `data.settings[]` | Array of Objects | No | Catalog definitions for individual settings. Current tenant values are omitted. |
| `data.settings[].key` | String | No | Exact database column name representing the setting. |
| `data.settings[].registry_ref` | Integer | No | Reference ID in the master system settings registry. |
| `data.settings[].group_key` | String | No | Owning group key. |
| `data.settings[].module_key` | String | No | Owning module key. |
| `data.settings[].store` | String | No | Owning database store name. |
| `data.settings[].label` | String | No | UI display label. |
| `data.settings[].description` | String / Null | Yes | Business guidance text or `null`. |
| `data.settings[].unit` | String / Null | Yes | Physical or logical unit (e.g. `days`, `INR`, `percent`, `months`) or `null`. |
| `data.settings[].doc_ref` | String / Null | Yes | Documentation link anchor or `null`. |
| `data.settings[].data_type` | String | No | Closed enum: `boolean`, `integer`, `decimal`, `string`, `enum`, `array`, `date`, `jsonb`. |
| `data.settings[].default` | Any | No | System factory default value. |
| `data.settings[].nullable` | Boolean | No | Whether the setting accepts `null` in storage. |
| `data.settings[].range` | Object / Null | Yes | Constraints object (e.g. `{ min, max }` or `{ enum: [...] }`) or `null`. |
| `data.settings[].platform_cap` | Any / Null | Yes | Hard platform ceiling or `null`. |
| `data.settings[].effect_timing` | String | No | When changes take effect: `immediate`, `next_record`, `next_run`, `next_cron_pass`, `inert`. |
| `data.settings[].risk` | String | No | Operational risk tier: `low`, `medium`, `high`. |
| `data.settings[].requires_reason`| Boolean | No | Whether Phase 2 modifications require an audit reason. |
| `data.settings[].resettable` | Boolean | No | Whether the setting supports automated reset to factory default. |
| `data.settings[].sensitive` | Boolean | No | Whether the setting contains sensitive secrets (always `false` in catalog). |
| `data.settings[].deprecated` | Boolean | No | Whether the setting is obsolete. |
| `data.settings[].split` | Boolean | No | Whether the setting participates in split-field normalization. |
| `data.settings[].normalised` | Boolean | No | Whether storage represents a normalized projection. |
| `data.settings[].clearable` | Boolean | No | Whether the setting can be cleared to empty/null. |
| `data.settings[].empty_clears` | Boolean | No | Whether submitting an empty string clears the setting. |
| `data.settings[].inherits_from`| String / Null | Yes | Key or store name from which this setting inherits defaults. |
| `data.settings[].depends_on` | Array of Strings | No | Keys that must be enabled or set for this setting to operate. |
| `data.settings[].depends_on_ops`| Array of Strings| No | Specific operational dependency tags. |
| `data.settings[].conflicts_with`| Array of Strings| No | Keys whose activation conflicts with this setting. |
| `data.settings[].preconditions` | Array of Strings| No | System precondition rules (e.g. `min_active_hr:2`). |
| `data.settings[].consumed_by` | Array of Strings | No | Modules that read and enforce this setting. |
| `data.settings[].known_errors` | Array of Strings | No | Error codes emitted when this setting's rules are violated. |
| `data.settings[].warnings` | Array of Strings | No | Operational warnings attached to this setting. |
| `data.surfaces[]` | Array of Objects | No | Pointers to the 49 multi-record policy tables (e.g. leave types, shift rosters). |
| `data.surfaces[].registry_ref` | Integer | No | Surface registry reference ID. |
| `data.surfaces[].key` | String | No | Surface identifier. |
| `data.surfaces[].label` | String | No | Human-readable policy directory label. |
| `data.surfaces[].module_key` | String | No | Module managing the policy surface. |
| `data.surfaces[].owner_table` | String | No | Underlying database table backing the policy. |
| `data.surfaces[].owner_endpoint_hint`| String / Null| Yes | Hint for specialized CRUD management endpoints. |
| `data.surfaces[].scope` | String | No | Policy scope: `per_record`, `per_entity`, `per_branch`. |
| `data.surfaces[].managed_by` | String | No | Domain module possessing management authority. |
| `data.counts.groups` | Integer | No | Total count of groups in this response. |
| `data.counts.settings` | Integer | No | Total count of settings returned in `settings[]` (137 active settings by default; 138 when `include_hidden=true`). |
| `data.counts.surfaces` | Integer | No | Total count of policy surfaces in this response. |

#### Error Responses
```json
{
  "success": false,
  "errorCode": "INVALID_FILTER_COMBINATION",
  "message": "Parameters 'module' and 'group' are mutually exclusive"
}
```
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Unexpected query parameter or array parameter pollution (`?module=a&module=b`). |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing, expired, or malformed JWT Bearer token. |
| **403 Forbidden** | `FORBIDDEN` | Platform role (`admin`, `super-admin`) or `employee` attempting access. |
| **403 Forbidden** | `ORG_NOT_ACTIVE` | Organization status is inactive or suspended. |
| **404 Not Found** | `GROUP_NOT_FOUND` | Queried `?group=` does not exist in catalog. |
| **422 Unprocessable Entity** | `INVALID_FILTER_COMBINATION` | Both `module` and `group` query parameters supplied in the same request. |
| **422 Unprocessable Entity** | `UNKNOWN_MODULE` | Queried `?module=` is not in `['payroll', 'document', 'organization', 'leave', 'attendance']`. |
| **503 Service Unavailable** | `ENTITLEMENT_DEPENDENCY_FAILURE` | Database unreachable during feature entitlement check (propagated without degradation). |

---

### 2. GET /api/v1/settings/catalog/:settingKey

* **API Number / Registry Ref:** S-2 (API Registry #243)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/catalog/:settingKey`
* **Purpose & Business Problem Solved:** Fetches complete catalog metadata, group projection, and resolved relationship references (`depends_on`, `conflicts_with`, `inherits_from`) for a single setting key. Frontends use this endpoint to populate setting configuration drawers, prerequisite warning banners, and context help modals. **Returns zero current tenant values.**

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (Valid JWT Bearer token).
* **Allowed Roles:** `hr`, `manager`.
* **Platform Plane Exclusion:** Platform administrators (`admin`, `super-admin`) are rejected with HTTP `403 FORBIDDEN` (`errorCode: "FORBIDDEN"`).
* **Tenant Isolation:** Scoped by `req.user.orgId`.
* **Prototype Pollution Protection:** In-memory lookups use a native JavaScript `Map` instance (`keyToEntry.get(settingKey)`). Keys such as `__proto__`, `constructor`, and `hasOwnProperty` immediately return HTTP `404 Not Found` (`errorCode: "SETTING_NOT_FOUND"`).
* **Information Disclosure Protection:** Internal file and method references (`enforcement_hint`) are stripped.

#### Request Parameters & Headers
* **Request Body:** None (`GET`).
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-None-Match: W/"<CATALOG_VERSION>"` (Optional. Returns HTTP `304 Not Modified` on match).
* **Path Parameters (`settingKeyParamSchema`):**
  * `settingKey` (String, Required): Pattern `^[a-z0-9_]{1,80}$`. Must match an existing catalog setting key (e.g. `payroll_require_separate_checker`, `pf_employee_rate`).

#### Execution Behavior & Implementation Pipeline
1. Validates `settingKey` path parameter against Joi regex `^[a-z0-9_]{1,80}$`.
2. Resolves setting from in-memory Map: `entry = catalog.byKey(settingKey)`. If missing, throws `404 SETTING_NOT_FOUND`.
3. Resolves owning group from Map: `group = catalog.groupByKey(entry.group_key)`.
4. Projects owning group for the caller's role (`readable`, `writable`).
5. Resolves relationship stubs (`depends_on`, `conflicts_with`) into `{ key, label, group_key }` objects so client drawers can build navigational hyperlinks without secondary requests.
6. If `inherits_from` references a store table rather than a key, resolves to `{ ref: "<store>" }`.
7. Strips `enforcement_hint`.
8. Weak ETag Evaluation: Compares `W/"<CATALOG_VERSION>"`. Returns `304 Not Modified` on match; otherwise sets ETag headers and returns `200 OK`.

#### Database Impact, Concurrency & Transactions
* **Database Operations:** Pure in-memory operation. Zero database queries. Zero transactions.
* **Concurrency & Locking:** Stateless read; no locks acquired.
* **Idempotency & Retries:** Fully idempotent.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "catalog_version": "2026-10-09.1",
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
      "effect_timing": "next_record",
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
      "preconditions": [
        "min_active_hr:2"
      ],
      "consumed_by": [
        "payroll"
      ],
      "known_errors": [
        "INSUFFICIENT_CHECKERS",
        "SEPARATE_CHECKER_REQUIRED"
      ],
      "warnings": []
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

#### Field-Level Response Dictionary
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `success` | Boolean | No | Always `true` on successful response. |
| `message` | String | No | Always `"OK"`. |
| `data.catalog_version` | String | No | System release catalog version identifier. |
| `data.setting` | Object | No | Complete catalog definition for the requested setting key. |
| `data.setting.key` | String | No | Database column name representing the setting. |
| `data.setting.preconditions` | Array of Strings | No | Rules enforced before this setting can be altered (e.g. `min_active_hr:2`). |
| `data.setting.known_errors` | Array of Strings | No | Error codes emitted when this setting's rules are violated. |
| `data.group` | Object | No | Projected owning group metadata. |
| `data.group.key` | String | No | Unique group identifier. |
| `data.group.readable` | Boolean | No | Whether the caller's role can view settings in this group. |
| `data.group.writable` | Boolean | No | Whether the caller's role can modify settings in this group. |
| `data.related.depends_on[]` | Array of Objects | No | Resolved relationship stubs: `[{ key, label, group_key }]`. |
| `data.related.conflicts_with[]`| Array of Objects | No | Resolved conflicting setting stubs: `[{ key, label, group_key }]`. |
| `data.related.inherits_from` | Object / Null | Yes | Resolved parent setting stub or `{ ref: "<store>" }` or `null`. |

#### Error Responses
```json
{
  "success": false,
  "errorCode": "SETTING_NOT_FOUND",
  "message": "Setting key 'unknown_key' not found in catalog"
}
```
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | `settingKey` violates regex `^[a-z0-9_]{1,80}$`. |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid auth token. |
| **403 Forbidden** | `FORBIDDEN` | Caller is not `hr` or `manager`. |
| **404 Not Found** | `SETTING_NOT_FOUND` | Setting key does not exist in catalog (including prototype pollution attempts). |

---

## 2. Organization Settings Read Plane

### 3. GET /api/v1/settings

* **API Number / Registry Ref:** S-3 (API Registry #244)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings`
* **Purpose & Business Problem Solved:** Primary read plane endpoint powering the entire Organization Settings dashboard. Aggregates live settings values across all authorized and subscribed groups into a single response payload. Provides per-group concurrency ETag tokens, calculates non-default diff lists using type-aware comparison, and gracefully handles individual store read failures without crashing the entire page.

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (Valid JWT Bearer token).
* **Allowed Roles:** `hr`, `manager`.
* **Platform Plane Exclusion:** Platform administrators (`admin`, `super-admin`) are rejected with HTTP `403 FORBIDDEN` (`errorCode: "FORBIDDEN"`).
* **Tenant Isolation:** Reads live values strictly for `ctx.orgId = req.user.orgId`.
* **Role-Based Group Filtering:**
  * For `hr`: Allowed to read all 26 groups across all 5 stores.
  * For `manager`: Only allowed to read 2 authority groups (`payroll.authority` and `documents.authority`). The other 24 groups are routed to `unavailable_groups[]` with reason `NOT_READABLE`.
* **Batched Feature Entitlement Check:** Evaluates feature flags (`payroll.access`, `documents.access`) once per distinct feature key. Groups whose feature is not included in the tenant's billing plan are routed to `unavailable_groups[]` with reason `NOT_ENTITLED`.
* **Filter-Before-Read Security Optimization:** The service computes the set of stores required *after* filtering out unreadable and unentitled groups. If an organization does not subscribe to payroll, `payroll_settings` and `statutory_configs` stores are **never queried**, completely preventing accidental row provisioning.

#### Request Parameters & Headers
* **Request Body:** None (`GET`).
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-None-Match: W/"<CATALOG_VERSION>:<max_updated_at>"` (Optional. Returns HTTP `304 Not Modified` on match).
* **Query Parameters (`allQuerySchema`):**
  | Parameter | Type | Required? | Default | Validation Constraints & Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `modules` | String | Optional | `null` | Comma-separated scalar string (e.g. `payroll,document`). Regex: `^[a-z0-9_,]{1,120}$`. Each token must be in `['payroll', 'document', 'organization', 'leave', 'attendance']`. |

* **Validation Rules:**
  * Array parameter pollution (`?modules=payroll&modules=document`) fails HTTP `400 Bad Request` (`errorCode: "VALIDATION_ERROR"`).
  * An unrecognized module token (e.g. `?modules=payroll,finance`) fails HTTP `422 Unprocessable Entity` (`errorCode: "UNKNOWN_MODULE"`).

#### Execution Behavior & Implementation Pipeline
1. Validates query parameters; splits `modules` by comma; asserts all tokens are known modules.
2. Step 1 (Role-Based Filter): Checks `isGroupReadable(group, ctx.actorRole)` for all candidate groups. Unreadable groups are added to `unavailable_groups` with `{ key, reason: 'NOT_READABLE' }`.
3. Step 2 (Batched Entitlement Gate): Extracts distinct `featureKey` values across readable groups. Calls `resolveEntitlements(ctx.orgId, keys)`. Unsubscribed groups are added to `unavailable_groups` with `{ key, reason: 'NOT_ENTITLED' }`.
   * **Infrastructural 503 Propagation:** If `entitlementService.hasFeature` throws HTTP `503 Service Unavailable` (`errorCode: "ENTITLEMENT_DEPENDENCY_FAILURE"`), it is **never** caught or flattened; it rethrows immediately.
4. Step 3 (Filter-Before-Read): Collects distinct store names backing the surviving entitled groups (at most 5 stores).
5. Step 4 (Concurrent Execution via `Promise.allSettled`): Fires parallel reads across the required store adapters:
   * `payroll_settings`: calls `payrollSettingsService.getOrCreate(orgId)`
   * `statutory_configs`: calls `statutoryConfigService.getConfig(orgId)`
   * `document_settings`: calls `documentSettingsService.getOrCreate(orgId)`
   * `document_letter_branding`: calls `letterBrandingService.getOrCreate(orgId, { includeAssetUrls: false })`
   * `organization_profiles`: calls `organizationRepository.findOrganizationProfileByOrgId(orgId)`
   * **Failure Handling:** If an adapter throws HTTP `503`, it propagates immediately. If an adapter throws an ordinary read error, only that store's groups are marked `{ key, reason: 'READ_FAILED' }` in `unavailable_groups[]`. Healthy stores return `200 OK`.
6. Step 5 (Value Slicing & Comparison): Slices stored row columns per group. Computes `non_default_keys` via `valuesEqual(storedValue, catalogDefault, dataType)`, ensuring PostgreSQL `DECIMAL` strings (e.g. `'2.00'`) match catalog numbers (`2.00`).
7. Step 6 (ETag Calculation): Computes group ETag `W/"<CATALOG_VERSION>:<updated_at ISO>"`. Computes composite ETag `W/"<CATALOG_VERSION>:<max_updated_at ISO>"`. Returns `304 Not Modified` if matched, else `200 OK`.

#### Database Impact, Concurrency & Transactions
* **Database Stores Read:** Live values read from 5 existing domain singleton tables: `payroll_settings`, `statutory_configs`, `document_settings`, `document_letter_branding`, `organization_profiles`.
* **Lazy Provisioning:** If an active organization accesses settings for the first time, domain services lazily insert default singleton rows into `payroll_settings`, `statutory_configs`, `document_settings`, and `document_letter_branding`.
* **Audit Trail Side Effects:** First-time read of `document_letter_branding` automatically logs an initialization audit entry (`letter_branding.initialized`) in `document_audit_logs`.
* **Asset URL Optimization:** Explicitly passes `{ includeAssetUrls: false }` to prevent expensive S3 pre-signed URL generation during letterhead reads.
* **Transaction Behavior:** Zero gateway transactions opened; zero database table locks acquired.
* **Idempotency & Retries:** Read operations are idempotent. In the event of a `READ_FAILED` entry in `unavailable_groups[]`, clients can safely retry the request or query the affected group individually via S-4.

#### Success Response Contract (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "catalog_version": "2026-10-09.1",
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
        "non_default_keys": [
          "pay_day"
        ],
        "updated_at": "2026-10-08T14:32:00.000Z",
        "etag": "W/\"2026-10-09.1:2026-10-08T14:32:00.000Z\""
      },
      {
        "key": "documents.branding",
        "label": "Letterhead and branding",
        "module_key": "document",
        "store": "document_letter_branding",
        "readable": true,
        "writable": true,
        "entitled": true,
        "values": {
          "signatory_designation": "Head of People",
          "registered_address_lines": "123 Business Park, Tech Zone",
          "cin": "U72200MH2026PTC123456",
          "gstin": "27AABCU9603R1ZM",
          "pan": "AABCU9603R",
          "tan": "MUMA12345E",
          "contact_email": "hr@company.com",
          "contact_phone": "+91 9876543210",
          "website": "https://company.com",
          "accent_color_hex": "#1E40AF",
          "footer_note": "Confidential & Proprietary",
          "letterhead_enabled": true
        },
        "non_default_keys": [
          "signatory_designation",
          "accent_color_hex"
        ],
        "updated_at": "2026-10-08T15:00:00.000Z",
        "etag": "W/\"2026-10-09.1:2026-10-08T15:00:00.000Z\""
      }
    ],
    "unavailable_groups": [
      {
        "key": "statutory.pf",
        "reason": "NOT_ENTITLED"
      }
    ],
    "etag": "W/\"2026-10-09.1:2026-10-08T15:00:00.000Z\"",
    "meta": {
      "stores_read": 5,
      "groups_returned": 25,
      "groups_unavailable": 1
    }
  }
}
```

#### Field-Level Response Dictionary
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `success` | Boolean | No | Always `true` on successful response. |
| `message` | String | No | Always `"OK"`. |
| `data.catalog_version` | String | No | System release catalog version identifier. |
| `data.org_id` | String (UUID) | No | Organization UUID of the caller. |
| `data.groups[]` | Array of Objects | No | List of groups successfully read and returned. |
| `data.groups[].key` | String | No | Unique settings group key. |
| `data.groups[].label` | String | No | Display label of the group. |
| `data.groups[].module_key` | String | No | Owning module key. |
| `data.groups[].store` | String | No | Backing database table identifier. |
| `data.groups[].readable` | Boolean | No | Whether the caller's role can read this group (always `true` in `groups[]`). |
| `data.groups[].writable` | Boolean | No | Whether the caller's role can write to this group. |
| `data.groups[].entitled` | Boolean | No | Whether the tenant subscription includes this group (always `true` in `groups[]`). |
| `data.groups[].values` | Object | No | Key-value dictionary of current stored settings values. |
| `data.groups[].non_default_keys`| Array of Strings| No | Array of setting keys whose stored value differs from factory default. |
| `data.groups[].updated_at` | String (ISO 8601) | No | Last modification timestamp of the underlying store row. |
| `data.groups[].etag` | String | No | Group-specific weak ETag for Phase 2 optimistic concurrency control. |
| `data.unavailable_groups[]` | Array of Objects | No | Groups that could not be returned. |
| `data.unavailable_groups[].key` | String | No | Group key that is unavailable. |
| `data.unavailable_groups[].reason`| String | No | Reason code: `NOT_READABLE` (role restricted), `NOT_ENTITLED` (unsubscribed plan), `READ_FAILED` (transient store read error). |
| `data.etag` | String | No | Composite weak ETag for the entire aggregated response. |
| `data.meta.stores_read` | Integer | No | Count of unique physical stores read (maximum 5). |
| `data.meta.groups_returned` | Integer | No | Total count of groups returned in `groups[]`. |
| `data.meta.groups_unavailable` | Integer | No | Total count of groups in `unavailable_groups[]`. |

#### Error Responses
```json
{
  "success": false,
  "errorCode": "UNKNOWN_MODULE",
  "message": "Module 'finance' is not recognised"
}
```
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Array parameter passed in `modules` (`?modules=a&modules=b`). |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid auth token. |
| **403 Forbidden** | `FORBIDDEN` | Caller is not `hr` or `manager`. |
| **422 Unprocessable Entity** | `UNKNOWN_MODULE` | A token in `?modules=` is not in `['payroll', 'document', 'organization', 'leave', 'attendance']`. |
| **503 Service Unavailable** | `ENTITLEMENT_DEPENDENCY_FAILURE` | Database unreachable during feature entitlement check. |

---

### 4. GET /api/v1/settings/groups/:groupKey

* **API Number / Registry Ref:** S-4 (API Registry #245)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/groups/:groupKey`
* **Purpose & Business Problem Solved:** Targeted endpoint fetching live settings values along with full per-entry catalog metadata for a single settings group. Used when opening a dedicated settings tab or configuration drawer, and to refresh state after an update. Unlike S-3 (which degrades gracefully), **S-4 fails loudly** with explicit HTTP error codes if the group is unauthorized or unsubscribed.

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (Valid JWT Bearer token).
* **Allowed Roles:** `hr`, `manager`.
* **Platform Plane Exclusion:** Platform administrators (`admin`, `super-admin`) are rejected with HTTP `403 FORBIDDEN` (`errorCode: "FORBIDDEN"`).
* **Tenant Isolation:** Scoped by `req.user.orgId`.
* **Fail-Loud Security Asymmetry vs S-3:**
  * Role not permitted $\rightarrow$ HTTP `403 FORBIDDEN` (`errorCode: "FORBIDDEN"`). (In S-3, degraded to `NOT_READABLE` in `200 OK`).
  * Feature not subscribed $\rightarrow$ HTTP `403 FORBIDDEN` (`errorCode: "FEATURE_NOT_AVAILABLE"`). (In S-3, degraded to `NOT_ENTITLED` in `200 OK`).
  * Store read error $\rightarrow$ Error propagates immediately. (In S-3, degraded to `READ_FAILED` in `200 OK`).

#### Request Parameters & Headers
* **Request Body:** None (`GET`).
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-None-Match: W/"<CATALOG_VERSION>:<updated_at>"` (Optional. Returns HTTP `304 Not Modified` on match).
* **Path Parameters (`groupKeyParamSchema`):**
  * `groupKey` (String, Required): Pattern `^[a-z0-9_.]{1,60}$`. Must match an existing settings group key (e.g. `payroll.calendar`, `statutory.pf`, `documents.branding`).

#### Execution Behavior & Implementation Pipeline
1. Validates `groupKey` path parameter against Joi regex `^[a-z0-9_.]{1,60}$`.
2. Resolves group: `group = catalog.groupByKey(groupKey)`. If missing, throws `404 GROUP_NOT_FOUND`.
3. RBAC Gate: Evaluates `projection.isGroupReadable(group, ctx.actorRole)`. If `false`, throws `403 FORBIDDEN`.
4. Entitlement Gate: Evaluates `resolveEntitlements(ctx.orgId, [group.featureKey])`. If unsubscribed, throws `403 FEATURE_NOT_AVAILABLE`.
5. Underlying Store Read: Invokes `adapterForStore(group.store).read(ctx.orgId)`. Any store error propagates directly.
6. Slices group values, computes `non_default_keys` via `valuesEqual()`, and attaches catalog metadata via `settings[]` array (with `enforcement_hint` stripped).
7. Weak ETag Evaluation: Compares `W/"<CATALOG_VERSION>:<updated_at ISO>"`. Returns `304 Not Modified` on match; otherwise sets ETag headers and returns `200 OK`.

#### Database Impact, Concurrency & Transactions
* **Database Operations:** Reads exactly one underlying domain singleton row backing the specified group. Lazy default provisioning occurs if accessing `payroll_settings`, `statutory_configs`, `document_settings`, or `document_letter_branding` for the first time.
* **Transaction Behavior:** Zero gateway transactions opened; zero database locks acquired.
* **Concurrency & ETag:** Returns group-specific weak ETag `W/"<CATALOG_VERSION>:<updated_at ISO>"`. Clients can use this ETag in Phase 2 `If-Match` headers for optimistic concurrency control.
* **Idempotency & Retries:** Fully idempotent read operation. Safe to retry.

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
    "non_default_keys": [
      "pay_day"
    ],
    "updated_at": "2026-10-08T14:32:00.000Z",
    "etag": "W/\"2026-10-09.1:2026-10-08T14:32:00.000Z\"",
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
        "consumed_by": [
          "payroll"
        ],
        "known_errors": [],
        "warnings": []
      }
    ]
  }
}
```

#### Field-Level Response Dictionary
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `success` | Boolean | No | Always `true` on successful response. |
| `message` | String | No | Always `"OK"`. |
| `data.key` | String | No | Unique settings group identifier. |
| `data.label` | String | No | Group display label. |
| `data.module_key` | String | No | Owning module key. |
| `data.store` | String | No | Backing database store table name. |
| `data.readable` | Boolean | No | Whether caller's role can read this group (always `true` on 200 OK). |
| `data.writable` | Boolean | No | Whether caller's role can write to this group. |
| `data.entitled` | Boolean | No | Whether organization's plan includes this group (always `true` on 200 OK). |
| `data.values` | Object | No | Key-value dictionary of current stored setting values. |
| `data.non_default_keys` | Array of Strings | No | Array of keys whose stored value differs from catalog default. |
| `data.updated_at` | String (ISO 8601) | No | Modification timestamp of the underlying store row. |
| `data.etag` | String | No | Group concurrency weak ETag. |
| `data.settings[]` | Array of Objects | No | Array of catalog definitions for each setting in this group. |
| `data.settings[].key` | String | No | Database column name. |
| `data.settings[].registry_ref` | Integer | No | Setting reference ID in master registry. |
| `data.settings[].data_type` | String | No | Setting data type enum. |
| `data.settings[].default` | Any | No | System factory default value. |
| `data.settings[].range` | Object / Null | Yes | Constraints object or `null`. |
| `data.settings[].effect_timing` | String | No | Change effect timing classification. |
| `data.settings[].risk` | String | No | Risk classification tier (`low`, `medium`, `high`). |
| `data.settings[].preconditions` | Array of Strings | No | Preconditions required before editing this setting. |
| `data.settings[].known_errors` | Array of Strings | No | Error codes associated with this setting. |

#### Error Responses
```json
{
  "success": false,
  "errorCode": "FEATURE_NOT_AVAILABLE",
  "message": "Feature 'payroll.access' is not available for this organization"
}
```
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | `groupKey` violates regex `^[a-z0-9_.]{1,60}$`. |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid auth token. |
| **403 Forbidden** | `FORBIDDEN` | Caller's role cannot read this group (e.g. manager accessing loans). |
| **403 Forbidden** | `FEATURE_NOT_AVAILABLE` | Tenant plan lacks the feature flag for this group. |
| **404 Not Found** | `GROUP_NOT_FOUND` | Group key does not exist in catalog. |
| **404 Not Found** | `ORG_PROFILE_NOT_FOUND` | For `billing.notifications`, profile row does not exist for the organization. |
| **503 Service Unavailable** | `ENTITLEMENT_DEPENDENCY_FAILURE` | Database unreachable during feature entitlement check. |

---

## 3. Settings Write Plane

> **Phase 2.** Two HR-only write endpoints that **delegate** each write to the owning
> module's existing service under optimistic concurrency. The gateway opens no
> transaction and persists nothing itself; it gates, shapes and checks the patch, then
> hands the write to the owner. Nothing in the Phase 1 read plane changes.

### Shared write conventions

#### `If-Match` optimistic concurrency (both S-5 and S-6)
- **Required** on every write. Value is the **per-group** weak ETag
  `W/"<CATALOG_VERSION>:<updated_at ISO>"` obtained from **S-4**
  (`GET /settings/groups/:groupKey`) `data.etag`, or from a prior write's response.
  **Do not use the S-3 top-level ETag** — it folds in the max `updated_at` across all
  stores and is not a valid per-group precondition.
- The gateway (`settings_etag.utils.parseIfMatch`) validates the outer form and the
  `catalog_version` segment, then hands the owner the **bare ISO timestamp**, which the
  owner compares **under its own row lock** (`SELECT … FOR UPDATE`). This proves no
  competing commit landed between the client's read and the lock.
- Missing header → `400 SETTINGS_IF_MATCH_REQUIRED`. Malformed (`*`, bare ISO, strong
  ETag) → `400 SETTINGS_IF_MATCH_INVALID`. Wrong `catalog_version` → `412` with
  `details.reason = "CATALOG_VERSION_CHANGED"`. Stale timestamp → `412` with
  `details.current_etag` (the server's current token) and `details.current_updated_at`.
- **This is the first use of HTTP `412` anywhere in this API.**

#### Write-path retry guidance
Writes are **not** blindly idempotent — they are **conditional**. On `412`, the correct
recovery is **re-read the group (S-4), reconcile, resubmit with the fresh `If-Match`** —
**never** retry the same request. This matters most after a network timeout: the write
may have committed server-side, so a blind retry risks clobbering a newer value. On
`409 SETTINGS_CONFIRMATION_REQUIRED` resubmit with `confirm: true`; on
`422 SETTINGS_REASON_REQUIRED` resubmit with a `reason`. A `503` (entitlement dependency)
is safe to retry after backoff. A successful write returns a **new** `etag` — adopt it as
the next `If-Match` with no re-read. Write responses set `Cache-Control: no-store` and do
**not** honour `If-None-Match`.

#### High-risk confirmation gate
Eight keys are `risk: "high"` (`payroll_require_separate_checker`,
`manager_direct_compensation_authority`, `manager_direct_document_authority`,
`document_require_separate_checker`, `document_retention_days`,
`document_publish_sync_threshold`, `letter_auto_issue_on_exit`,
`letter_record_retention_days`). Touching any of them requires **both** a non-empty
`reason` and `confirm: true`. The reason gate (`422 SETTINGS_REASON_REQUIRED`) is
evaluated **before** the confirmation gate (`409 SETTINGS_CONFIRMATION_REQUIRED`), and
the `409` returns verbatim catalog `warnings[]` to show the user before they confirm.

### 5. PUT /api/v1/settings/groups/:groupKey

* **API Number / Registry Ref:** S-5 (API Registry #246)
* **HTTP Method:** `PUT`
* **Route Path:** `/api/v1/settings/groups/:groupKey`
* **Purpose & Business Problem Solved:** Lets HR change one or more settings in a group
  through a single uniform door, while the value rules, audit, and persistence stay with
  the owning module. Optimistic concurrency (`If-Match`) prevents a slow HR form from
  silently overwriting a concurrent change; a mass-assignment allowlist and a high-risk
  confirmation gate prevent accidental or unauthorized changes to money/document
  authority and irreversible purges.

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (valid JWT Bearer token).
* **Allowed Roles:** `hr` **only**. `manager` — even where it can *read* a group — is
  rejected with `403 FORBIDDEN`. `employee`, `admin`, `super-admin` likewise.
* **Two independent authorization layers:** route `authorize(['hr'])` at the door, and a
  per-group `write_roles` check (`projection.isGroupWritable`) in the service — so
  widening a writer is a one-line catalog data change.
* **Tenant Isolation:** `orgId` comes from `req.user.orgId` and nowhere else; `values`
  keys are regex-constrained and intersected with the catalog, so `org_id` is not even
  representable in a patch.

#### Request Parameters & Headers
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-Match: W/"<CATALOG_VERSION>:<updated_at ISO>"` (**Required** — see shared conventions)
* **Path Parameters (`groupKeyParamSchema`):**
  * `groupKey` (String, Required): Pattern `^[a-z0-9_.]{1,60}$`.
* **Request Body (`updateGroupBodySchema`, `.unknown(false)`):**
  * `values` (Object, Required): 1–60 keys, each matching `^[a-z0-9_]{1,80}$`; per-key
    values are validated by the **owner's own Joi**, not here.
  * `reason` (String, Optional): trimmed 1–500 chars. Required for high-risk keys.
  * `confirm` (Boolean, Optional): must be `true` for high-risk keys.

#### Execution Behavior & Implementation Pipeline
1. **Exists** — `catalog.groupByKey(groupKey)`; else `404 GROUP_NOT_FOUND`.
2. **Read-only** — group with empty `write_roles` → `405 SETTINGS_GROUP_READ_ONLY`.
3. **RBAC** — `isGroupWritable(group, role)`; else `403 FORBIDDEN`.
4. **Entitlement** — `resolveEntitlements(orgId, [group.featureKey])`; else `403 FEATURE_NOT_AVAILABLE`.
5. **Bounds** — `assertBodyBounds`: ≤60 keys, container depth ≤2, ≤64 KB; else `422 SETTINGS_PAYLOAD_INVALID{violation}`.
6. **Allowlist** — intersect `values` with (catalog keys ∩ owner-writable, minus deprecated/sensitive); rejected keys → `422 SETTING_NOT_WRITABLE{keys}`; empty result → `422 NO_WRITABLE_KEYS`.
7. **Reason/Confirm** — high-risk without `reason` → `422 SETTINGS_REASON_REQUIRED{keys}`; with reason but no `confirm:true` → `409 SETTINGS_CONFIRMATION_REQUIRED{keys,warnings}`.
8. **Owner Joi** — the gateway runs the owner's exported schema with fixed options `{abortEarly:false, allowUnknown:false, stripUnknown:false, convert:true, noDefaults:true}`; a rejected value → `400 VALIDATION_ERROR{keys}`. `convert:true` coerces (`"5"→5`); `noDefaults` is why a branding write never injects — and thus never wipes — `registered_address_lines`.
9. **Before-read** — `adapter.read(orgId)` captures the pre-write stored row.
10. **Write** — `adapter.update(orgId, coerced, ctx, { ifMatch })`; exactly one owner call, under the owner's lock. Any owner error propagates verbatim; only a `412` is enriched with `details.current_etag`.
11. **Diff** — `changed`/`unchanged_keys` computed from the **stored** before/after rows via the type-aware comparator; `non_default_keys` recomputed; `values` sliced to this group.

#### Database Impact, Concurrency & Transactions
* **Database Operations:** Exactly one owner transaction (opened and committed by the owner), which does a locked read + conditional update of the single backing singleton row. The gateway opens **no** transaction.
* **Concurrency & ETag:** `If-Match` compared under the owner's `FOR UPDATE` lock. The success response's `etag` is the post-write group token and is safe to use as the next `If-Match`.
* **Idempotency & Retries:** Conditional, not idempotent — see write-path retry guidance. A no-op (patch equals stored values) still commits a touch and returns a fresh `etag`.
* **Audit:** Each store writes through the owner's existing audit path, **except
  `billing.notifications`** (`organization_profiles` has no audit table yet — closed in
  Phase 3).

#### Success Response Contract (`200 OK`)
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
    "values": { "pay_day": 5 },
    "changed": { "pay_day": { "from": 1, "to": 5 } },
    "unchanged_keys": [],
    "non_default_keys": ["pay_day"]
  }
}
```
For a `statutory.*` group the response also carries `impact`:
```json
"impact": {
  "affected_runs": [{ "id": "…", "period_month": 9, "run_type": "regular", "status": "draft" }],
  "activated_components": ["PF_EMPLOYEE"]
}
```

#### Field-Level Response Dictionary
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `data.catalog_version` | String | No | Catalog version the write was evaluated against. |
| `data.group` | String | No | The group key written. |
| `data.store` | String | No | Backing owner store. |
| `data.etag` | String | No | Post-write per-group weak ETag; use as the next `If-Match`. |
| `data.updated_at` | String (ISO 8601) | No | Post-write store `updated_at` (advances even on a no-op). |
| `data.values` | Object | No | Stored values for **this group only** after the write. |
| `data.changed` | Object | No | `{ key: { from, to } }` for keys whose **stored** value changed. |
| `data.unchanged_keys` | Array of Strings | No | Touched keys whose stored value did not change (incl. type-equal DECIMALs). |
| `data.non_default_keys` | Array of Strings | No | Post-write keys differing from catalog default. |
| `data.impact` | Object | Yes | **Statutory only.** `{ affected_runs[], activated_components[] }`, passed through verbatim. Absent otherwise. |

#### Error Responses
See the shared error register (§3 shared conventions) and the per-step codes in the
pipeline above. Example `412`:
```json
{
  "success": false,
  "errorCode": "SETTINGS_PRECONDITION_FAILED",
  "message": "The settings group changed since you last read it; re-fetch and retry",
  "details": {
    "current_etag": "W/\"2026-10-09.2:2026-10-09T12:00:00.000Z\"",
    "current_updated_at": "2026-10-09T12:00:00.000Z"
  }
}
```
| HTTP Status | Error Code | Triggering Condition |
| :--- | :--- | :--- |
| **400** | `VALIDATION_ERROR` | Envelope Joi or owner Joi rejects a value (`details.keys[]`). |
| **400** | `SETTINGS_IF_MATCH_REQUIRED` / `SETTINGS_IF_MATCH_INVALID` | Missing / malformed `If-Match`. |
| **403** | `FORBIDDEN` | Not `hr`, or role not in the group's `write_roles`. |
| **403** | `FEATURE_NOT_AVAILABLE` | Org's plan lacks the group's feature. |
| **404** | `GROUP_NOT_FOUND` / `ORG_PROFILE_NOT_FOUND` | Unknown group / missing org profile (`billing.notifications`). |
| **405** | `SETTINGS_GROUP_READ_ONLY` | Group has no writers (e.g. `payroll.deprecated`). |
| **409** | `SETTINGS_CONFIRMATION_REQUIRED` | High-risk key without `confirm:true` (`details.keys`, `warnings`). |
| **409** | `INSUFFICIENT_CHECKERS` / `SETTINGS_CONFLICT` / `SCAN_PROVIDER_NOT_CONFIGURED` | Owner guard rejects the change. |
| **412** | `SETTINGS_PRECONDITION_FAILED` | Stale `If-Match` or changed `catalog_version` (`details.current_etag`). |
| **422** | `SETTING_NOT_WRITABLE` / `NO_WRITABLE_KEYS` / `SETTINGS_REASON_REQUIRED` / `SETTINGS_PAYLOAD_INVALID` | Gateway pre-write rejections. |
| **422** | `SETTING_OUT_OF_RANGE` / `INVALID_PAYOUT_COMPONENT` / `LETTER_REFERENCE_PATTERN_INVALID` | Owner value guards. |
| **503** | `ENTITLEMENT_DEPENDENCY_FAILURE` | Entitlement dependency outage. |

### 6. POST /api/v1/settings/groups/:groupKey/reset

* **API Number / Registry Ref:** S-6 (API Registry #247)
* **HTTP Method:** `POST`
* **Route Path:** `/api/v1/settings/groups/:groupKey/reset`
* **Purpose & Business Problem Solved:** Restores named keys in a group to their catalog
  factory defaults, through the **identical** pipeline as S-5 — reset is not a privileged
  bypass, so every gate (RBAC, entitlement, allowlist, high-risk confirmation,
  `If-Match`) still applies.

#### Authentication, Authorization & Security
Identical to S-5 — `hr` only, `If-Match` required, same two authorization layers and
tenant isolation.

#### Request Parameters & Headers
* **Request Headers:** `Authorization` (Required), `If-Match` (**Required**).
* **Path Parameters:** `groupKey` (`^[a-z0-9_.]{1,60}$`).
* **Request Body (`resetGroupBodySchema`, `.unknown(false)`):**
  * `keys` (Array of Strings, Required): 1–50 unique keys, each `^[a-z0-9_]{1,80}$`.
  * `reason` (String, Optional): required for high-risk keys.
  * `confirm` (Boolean, Optional): must be `true` for high-risk keys.

#### Execution Behavior & Implementation Pipeline
1–4 as S-5 (exists / read-only / RBAC / entitlement).
5. **Reset-specific checks (step 6):** a requested key not in the writable allowlist →
   `422 SETTING_NOT_WRITABLE{keys}`; a key whose catalog entry is `resettable:false` →
   `422 SETTING_NOT_RESETTABLE{keys}`.
6. Resolve each remaining key to its catalog `default` (`patch.resolveDefaults`), then
   run the **identical** S-5 pipeline from step 5 — so a high-risk reset still needs
   `reason` + `confirm:true`, and the owner's Joi still validates the default values.

#### Success Response Contract (`200 OK`)
Identical to S-5 plus `"reset": true` and `message: "Settings reset"`:
```json
{
  "success": true,
  "message": "Settings reset",
  "data": {
    "catalog_version": "2026-10-09.2",
    "group": "payroll.calendar",
    "store": "payroll_settings",
    "etag": "W/\"2026-10-09.2:2026-10-09T11:35:00.000Z\"",
    "updated_at": "2026-10-09T11:35:00.000Z",
    "values": { "pay_day": 1 },
    "changed": { "pay_day": { "from": 5, "to": 1 } },
    "unchanged_keys": [],
    "non_default_keys": [],
    "reset": true
  }
}
```

#### Error Responses
The S-5 register, plus `422 SETTING_NOT_RESETTABLE` (a key whose entry forbids reset).
`Database Impact, Concurrency & Transactions` and retry guidance are identical to S-5.
