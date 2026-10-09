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
8. Weak ETag Evaluation: Evaluates `W/"<CATALOG_VERSION>"` (e.g. `W/"2026-10-09.2"`). If `req.headers['if-none-match'] === tag`, returns HTTP `304 Not Modified` immediately. Otherwise sets `ETag` and `Cache-Control: private, max-age=0, must-revalidate` and returns `200 OK`.

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
    "catalog_version": "2026-10-09.2",
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
        "non_default_keys": [
          "pay_day"
        ],
        "updated_at": "2026-10-08T14:32:00.000Z",
        "etag": "W/\"2026-10-09.2:2026-10-08T14:32:00.000Z\""
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
        "etag": "W/\"2026-10-09.2:2026-10-08T15:00:00.000Z\""
      }
    ],
    "unavailable_groups": [
      {
        "key": "statutory.pf",
        "reason": "NOT_ENTITLED"
      }
    ],
    "etag": "W/\"2026-10-09.2:2026-10-08T15:00:00.000Z\"",
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

# Phase 2: The Write Plane & Concurrency Guard (APIs #246–#247)

## 1. Settings Write Plane

### 1. PUT /api/v1/settings/groups/:groupKey

* **API Number / Registry Ref:** S-5 (API Registry #246)
* **HTTP Method:** `PUT`
* **Route Path:** `/api/v1/settings/groups/:groupKey`
* **Purpose & Business Problem Solved:** Provides a unified, atomic endpoint for updating one or more configuration settings within a specific settings group. It delegates value validation, row-level locking, database updates, and domain audit logging directly to the owning module's existing service. Centralizes optimistic concurrency control (`If-Match`), mass-assignment allowlisting, and two-stage safety controls (reason and confirmation) for high-risk settings without creating new settings storage tables.

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (Valid JWT Bearer token).
* **Allowed Roles:** `hr` **only**. Requests from `manager`, `employee`, `admin`, or `super-admin` are rejected at the router door with HTTP `403 FORBIDDEN` (`errorCode: "FORBIDDEN"`).
* **Tenant Isolation:** Enforced strictly via authenticated user token claims (`req.user.orgId`). The caller cannot specify, override, or spoof `orgId` via path, query, or body.
* **Active Organization Check:** Verified via `requireActiveOrg`. Inactive or suspended tenants receive HTTP `403 FORBIDDEN` (`errorCode: "ORG_NOT_ACTIVE"`).
* **Group Writability Validation:** Service checks `projection.isGroupWritable(group, req.user.role)` against `group.write_roles`. Groups with empty `write_roles` (e.g. `payroll.deprecated`) reject write attempts with HTTP `405 Method Not Allowed` (`errorCode: "SETTINGS_GROUP_READ_ONLY"`).
* **Feature Entitlement Check:** Service resolves billing subscription entitlements for `group.featureKey` (e.g. `payroll.access`, `documents.access`) via `resolveEntitlements(orgId)`. Tenants lacking active plan access receive HTTP `403 FORBIDDEN` (`errorCode: "FEATURE_NOT_AVAILABLE"`).
* **Mass-Assignment Defense:** Gateway builds a strict allowlist: `catalogKeysForGroup ∩ ownerWritableKeys`, explicitly excluding `deprecated: true` and `sensitive: true` entries. Any submitted key outside this allowlist is reported and rejected with HTTP `422 Unprocessable Entity` (`errorCode: "SETTING_NOT_WRITABLE"`), never silently dropped.
* **Owner-Schema Validation at Gateway (F-P2-1):** The gateway directly executes the domain module's own exported Joi schema using `{ abortEarly: false, allowUnknown: false, stripUnknown: false, convert: true, noDefaults: true }`. This guarantees type conversion (`"5"` $\rightarrow$ `5`), rejects unknown properties, and prevents injecting default values (which would wipe unmentioned fields such as `registered_address_lines`).
* **High-Risk Two-Gate Safety Shield:** Modifying any setting classified as `risk: "high"` requires both a non-empty `reason` (1..500 characters) and `confirm: true`. The reason gate (`422 SETTINGS_REASON_REQUIRED`) evaluates prior to the confirmation gate (`409 SETTINGS_CONFIRMATION_REQUIRED`), allowing clients to capture business justification before presenting user warnings.
* **Payload Bounds Protection:** Gateway enforces maximum 60 keys, maximum container nesting depth of 2, and maximum serialized payload size of 65,536 bytes before initiating database I/O.
* **Prototype Pollution Protection:** Property name schemas enforce regex `^[a-z0-9_]{1,80}$`. Lookups use native `Set` and `Map` instances, rendering `__proto__` and `constructor` attacks inert.

#### Request Parameters & Headers
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-Match: W/"<CATALOG_VERSION>:<updated_at ISO>"` (**Required** — per-group weak ETag token obtained from `S-4` `data.etag` or a prior write response. Wildcards `*`, bare timestamps, and strong ETags are rejected with HTTP `400 Bad Request` [`errorCode: "SETTINGS_IF_MATCH_INVALID"`]).
  * `Content-Type: application/json` (Required)
* **Path Parameters (`groupKeyParamSchema`):**
  * `groupKey` (String, Required): Pattern `^[a-z0-9_.]{1,60}$`. Must match an active group in `catalog.GROUPS`.
* **Request Body (`updateGroupBodySchema`, `.unknown(false)`):**
  ```json
  {
    "values": {
      "pay_day": 5
    },
    "reason": "Aligning payroll cycle with executive banking schedule",
    "confirm": true
  }
  ```
* **Request Body Specifications:**
  | Field | Type | Required? | Nullable? | Validation Constraints & Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `values` | Object | Yes | No | Key-value map. Keys must match regex `^[a-z0-9_]{1,80}$`. Min 1 key, max 60 keys. Max container depth $\le 2$. Max payload size 64 KB. Values must satisfy the owner domain's Joi schema. |
  | `reason` | String | Conditional | No | Trimmed string, 1–500 characters. Mandatory if any touched setting has `requires_reason: true` (e.g. `risk: "high"`). |
  | `confirm` | Boolean | Conditional | No | Must be `true` if any touched setting is classified as `risk: "high"`. |

#### Execution Behavior & Implementation Pipeline
1. **Step 1 (Exists):** Resolves group via `catalog.groupByKey(groupKey)`. Missing group $\rightarrow$ `404 GROUP_NOT_FOUND`.
2. **Step 2 (Read-Only):** Checks `group.write_roles`. If empty, throws `405 SETTINGS_GROUP_READ_ONLY`.
3. **Step 3 (RBAC):** Evaluates `projection.isGroupWritable(group, ctx.actorRole)`. If false, throws `403 FORBIDDEN`.
4. **Step 4 (Entitlement):** Calls `resolveEntitlements(ctx.orgId, [group.featureKey])`. If unsubscribed, throws `403 FEATURE_NOT_AVAILABLE`.
5. **Step 5 (Bounds):** `patch.assertBodyBounds(values)` validates object shape, key count (1..60), container depth ($\le 2$), and serialized size ($\le 64$ KB). Throws `422 SETTINGS_PAYLOAD_INVALID`.
6. **Step 6 (Allowlist Intersection):** Intersects submitted keys with `writableKeysForGroup(entries, adapter.ownerWritableKeys())`. Non-writable, deprecated, or sensitive keys collect into `rejected[]` $\rightarrow$ `422 SETTING_NOT_WRITABLE { keys }`. If clean patch is empty $\rightarrow$ `422 NO_WRITABLE_KEYS`.
7. **Step 7a / 7b (Policy Evaluation):**
   * If any touched setting has `requires_reason: true` and `reason` is blank $\rightarrow$ `422 SETTINGS_REASON_REQUIRED { keys }`.
   * If any touched setting has `risk: "high"` and `confirm !== true` $\rightarrow$ `409 SETTINGS_CONFIRMATION_REQUIRED { keys, warnings }`.
8. **Step 8 (Owner Joi Validation):** Executes `validateWithOwnerSchema(adapter.ownerSchema, clean)`. Returns coerced values (e.g. numeric string converted to number). Throws `400 VALIDATION_ERROR` with `keys[]` on failure.
9. **Step 9 (Pre-Lock Baseline):** Calls `adapter.read(ctx.orgId)` to capture pre-write state.
10. **Step 10 (Domain Write):** Calls `adapter.update(ctx.orgId, coerced, ctx, { ifMatch })`. Executes inside the domain's own database transaction under row lock (`SELECT ... FOR UPDATE`). Compares `ifMatch` against locked `updated_at`. If mismatched, throws `412 SETTINGS_PRECONDITION_FAILED` (enriched with `current_etag`).
11. **Step 11 (Diffing & Response):** Slices post-write store values to group keys. Compares stored `before` and `after` rows via `patch.diffStored`. Computes `changed`, `unchanged_keys`, and `non_default_keys`. Sets `ETag` and `Cache-Control: no-store`. Returns HTTP `200 OK`.

#### Database Impact, Concurrency & Transactions
* **Database Operations:** The gateway opens zero database transactions and owns zero tables. The owning domain service opens exactly 1 transaction:
  * Acquires row lock: `SELECT * FROM <store> WHERE org_id = :orgId FOR UPDATE`.
  * Validates optimistic concurrency: `assertUpdatedAtMatches(row, ifMatch)`.
  * Executes update: `UPDATE <store> SET ... WHERE org_id = :orgId`.
  * Emits domain audit log (e.g. `payroll_audit_logs`, `document_audit_logs`) within the same transaction.
  * *Note on `billing.notifications`:* Updates `organization_profiles` under row lock; because `organization_profiles` lacks a domain audit table, writes to this group in Phase 2 are not audit logged.
* **Concurrency & Locking:** Row-level exclusive lock prevents lost updates. Two concurrent writers serialize on the lock; the loser acquires the lock, detects timestamp mismatch, rolls back, and returns HTTP `412 SETTINGS_PRECONDITION_FAILED`.
* **Idempotency & Retries:** Conditional PUT. A blind replay with the same `If-Match` after success fails with HTTP `412`. On network timeout, clients must re-read via `S-4` before retrying.
* **No-Op Writes:** Submitting an identical patch returns `changed: {}`, lists the keys in `unchanged_keys`, updates the database `updated_at`, and mints a fresh ETag.

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

#### Error Responses
```json
{
  "success": false,
  "errorCode": "SETTINGS_PRECONDITION_FAILED",
  "message": "The resource was modified by another request",
  "details": {
    "current_updated_at": "2026-10-09T12:00:00.000Z",
    "current_etag": "W/\"2026-10-09.2:2026-10-09T12:00:00.000Z\""
  }
}
```
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

### 2. POST /api/v1/settings/groups/:groupKey/reset

* **API Number / Registry Ref:** S-6 (API Registry #247)
* **HTTP Method:** `POST`
* **Route Path:** `/api/v1/settings/groups/:groupKey/reset`
* **Purpose & Business Problem Solved:** Restores named configuration keys in a group back to their factory catalog defaults. Reset is not a privileged bypass: it executes through the exact same 11-step pipeline as `S-5`, strictly enforcing optimistic concurrency (`If-Match`), RBAC, feature entitlements, mass-assignment allowlists, high-risk reason requirements, and confirmation gates.

#### Authentication, Authorization & Security
* **Authentication Required:** Yes (Valid JWT Bearer token).
* **Allowed Roles:** `hr` **only**.
* **Tenant Isolation:** Scoped strictly to `req.user.orgId`.
* **Group Writable Check:** Validates `isGroupWritable(group, req.user.role)`.
* **Entitlement Check:** Evaluates `resolveEntitlements(orgId, [group.featureKey])`.
* **Precondition Required:** Mandatory `If-Match` header.
* **Reset Allowlist & Immutability:** Requested keys must be writable in the group and cannot have `resettable: false`.

#### Request Parameters & Headers
* **Request Headers:**
  * `Authorization: Bearer <token>` (Required)
  * `If-Match: W/"<CATALOG_VERSION>:<updated_at ISO>"` (**Required**)
  * `Content-Type: application/json` (Required)
* **Path Parameters (`groupKeyParamSchema`):**
  * `groupKey` (String, Required): Pattern `^[a-z0-9_.]{1,60}$`. Must match an active group in `catalog.GROUPS`.
* **Request Body (`resetGroupBodySchema`, `.unknown(false)`):**
  ```json
  {
    "keys": [
      "pay_day"
    ],
    "reason": "Restoring standard factory payroll calendar schedule",
    "confirm": true
  }
  ```
* **Request Body Specifications:**
  | Field | Type | Required? | Nullable? | Validation Constraints & Rules |
  | :--- | :--- | :---: | :---: | :--- |
  | `keys` | Array of Strings | Yes | No | Array of setting keys to reset. Min 1 key, max 50 keys. Items must be unique and match regex `^[a-z0-9_]{1,80}$`. |
  | `reason` | String | Conditional | No | Trimmed string, 1–500 characters. Mandatory if any reset key has `requires_reason: true`. |
  | `confirm` | Boolean | Conditional | No | Must be `true` if any reset key is classified as `risk: "high"`. |

#### Execution Behavior & Implementation Pipeline
1. **Resolution & Access Gating (Steps 1–4):** Validates group exists, is not read-only, caller role is authorized, and tenant plan includes group feature.
2. **Reset Key Verification:**
   * Verifies all requested keys belong to the group's writable allowlist (`patch.writableKeysForGroup`). Any unknown or read-only key triggers HTTP `422 SETTING_NOT_WRITABLE` (`details.keys[]`).
   * Verifies `resettable !== false` for each key. Any key marked non-resettable in the catalog triggers HTTP `422 SETTING_NOT_RESETTABLE` (`details.keys[]`).
3. **Default Value Resolution:** Resolves each key's catalog factory default via `patch.resolveDefaults(entryByKey, keys)`. Formats synthetic patch: `{ [key]: catalogEntry.default }`.
4. **Pipeline Execution (Steps 5–11):** Runs the synthetic default patch through the identical `runPipeline` function as `S-5`:
   * Reason gate (`422 SETTINGS_REASON_REQUIRED`) and confirmation gate (`409 SETTINGS_CONFIRMATION_REQUIRED`) enforce policy if any reset key is high-risk.
   * Owner Joi schema validates default values.
   * Row lock (`SELECT ... FOR UPDATE`) and `If-Match` check execute under transaction.
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
Includes all fields defined for `S-5`, plus:
| Field Path | Type | Nullable? | Description & Semantics |
| :--- | :--- | :---: | :--- |
| `data.reset` | Boolean | No | Explicit boolean flag indicating response was generated by a reset operation (`true`). |

#### Error Responses
Includes all error codes defined for `S-5`, plus:
| HTTP Status | Error Code | Raised By | Triggering Condition & Description |
| :--- | :--- | :--- | :--- |
| **422 Unprocessable** | `SETTING_NOT_RESETTABLE` | Gateway | Attempted to reset a setting whose catalog definition declares `resettable: false`. |

---

## 2. Existing APIs Modified / Extended by Phase 2

### 2.1 GET /api/v1/settings/catalog (S-1 #242)

* **Catalog Version Bump:** Returns `catalog_version: "2026-10-09.2"`.
* **Weak ETag Update:** Top-level weak ETag changes to `W/"2026-10-09.2"`, causing HTTP caching clients to revalidate cached catalog data once.
* **Risk & Warning Reclassifications:** Eight operational settings are reclassified to `risk: "high"`, automatically setting `requires_reason: true` and attaching explicit plain-language `warnings[]`:
  * `payroll_require_separate_checker` (#39)
  * `manager_direct_compensation_authority` (#40)
  * `manager_direct_document_authority` (#59)
  * `document_require_separate_checker` (#60)
  * `document_retention_days` (#65)
  * `document_publish_sync_threshold` (#79)
  * `letter_auto_issue_on_exit` (#92)
  * `letter_record_retention_days` (#95)
* **Cross-Setting Relationships:** Populates `conflicts_with` between `manager_direct_document_authority` and `document_require_separate_checker` (bidirectional), and `depends_on` between `document_expiry_reminder_days` and `document_notify_expiry`.
* **Contract Backward Compatibility:** 100% backward compatible. Request parameters (`module`, `group`, `include_hidden`), response structure, and error conditions remain identical.

### 2.2 GET /api/v1/settings/catalog/:settingKey (S-2 #243)

* **Reflects Updated Setting Metadata:** When querying any of the 8 high-risk settings, returns updated `risk: "high"`, `requires_reason: true`, populated `warnings[]`, and bidirectional `conflicts_with` references.
* **Weak ETag Update:** Reflects the new catalog release version (`W/"2026-10-09.2"`).
* **Contract Backward Compatibility:** 100% backward compatible. Path parameter handling and response structure remain unchanged.

### 2.3 GET /api/v1/settings (S-3 #244)

* **Live State Synchronization:** Groups returned in `data.groups[]` immediately reflect settings updated or reset via `S-5` and `S-6`.
* **Dynamic Default Diffing:** `non_default_keys` dynamically recalculates across all groups using `valuesEqual` type-aware comparison. If a setting is reset via `S-6`, it disappears from `non_default_keys`.
* **Composite ETag Advancement:** Response ETag advances to `W/"2026-10-09.2:<max_updated_at>"`, reflecting the most recently modified backing store.
* **Contract Backward Compatibility:** 100% backward compatible. Query filtering (`?modules=`), partial degradation (`unavailable_groups[]`), and meta block remain identical.

### 2.4 GET /api/v1/settings/groups/:groupKey (S-4 #245)

* **Live State Synchronization:** Returns updated setting values modified via `S-5` or reset via `S-6`.
* **Targeted ETag Advancement:** Group weak ETag (`W/"2026-10-09.2:<updated_at ISO>"`) advances immediately upon write.
* **Precondition Authority:** The ETag returned by `S-4` serves as the exact `If-Match` precondition token required by `S-5` and `S-6`.
* **Contract Backward Compatibility:** 100% backward compatible. Fail-loud security behavior and response structure remain identical.

