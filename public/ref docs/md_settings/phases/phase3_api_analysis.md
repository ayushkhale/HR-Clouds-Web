# Phase 3 Complete API Analysis Documentation: Settings Module (Unified Change History & Audit Ledger)

**Document File:** `public/md_settings/phases/phase3_api_analysis.md`  
**Author:** Senior/Principal Backend Engineer, API Architect & Technical Documentation Engineer  
**Status:** Shipped, Verified & Green (`node --test tests/unit/settings/*.test.js` — 180 passing assertions, 0 failures across 19 suites)  
**Codebase Sources of Truth:**
* Router: [src/modules/settings/routes/settings.routes.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js)
* Controller: [src/modules/settings/controllers/settings.controller.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/controllers/settings.controller.js)
* Validators: [src/modules/settings/validators/settings.validator.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/validators/settings.validator.js)
* Services:
  * History Reader Service: [src/modules/settings/services/settings_history.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_history.service.js)
  * Audit Recorder Service: [src/modules/settings/services/settings_audit.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_audit.service.js)
  * Entitlement Service: [src/modules/settings/services/settings_entitlement.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_entitlement.service.js)
* Repositories:
  * Ledger Repository: [src/modules/settings/repositories/settings_change_log.repository.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/repositories/settings_change_log.repository.js)
  * Foreign Audit Union Repository: [src/modules/settings/repositories/settings_history.repository.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/repositories/settings_history.repository.js)
* Model & Migration:
  * Model: [src/modules/settings/models/settings_change_logs.model.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/models/settings_change_logs.model.js)
  * Migration: [src/infrastructure/postgres-sql/migrations/00073-create-settings-change-logs.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/infrastructure/postgres-sql/migrations/00073-create-settings-change-logs.js)
* Pure Pipeline Utilities:
  * Normalizer & Shape Adapter: [src/modules/settings/utils/settings_history_normalise.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_history_normalise.utils.js)
  * Keyset Cursor Engine: [src/modules/settings/utils/settings_history_cursor.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_history_cursor.utils.js)
  * Value Comparator: [src/modules/settings/utils/settings_value.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_value.utils.js)
  * Projection Engine: [src/modules/settings/utils/settings_projection.utils.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_projection.utils.js)
* Cross-Module Ingestion Points:
  * Organization Profile Writer: [src/modules/organization/services/organization.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/organization/services/organization.service.js)
  * Organization Controller: [src/modules/organization/controllers/organization.controller.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/organization/controllers/organization.controller.js)
  * Organization Billing Adapter: [src/modules/settings/adapters/organization_billing.adapter.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/adapters/organization_billing.adapter.js)
  * Payroll Settings Service (DEF-S11 / F-P3-2): [src/modules/payroll/services/payroll_settings.service.js](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_settings.service.js)

---

## 1. Architectural Overview & Design Invariants

Phase 3 introduces the **unified change history and audit ledger** for the Settings Module. It exposes **one authenticated HTTP read endpoint** (`S-7`: `GET /api/v1/settings/history`, registry ref **#248**), backed by:
1. A **purpose-built audit ledger** (`settings_change_logs`) for settings stores that historically lacked their own audit tables (specifically `organization_profiles` / `billing.notifications`).
2. An **in-flight federation reader** over the three distinct audit tables and four distinct audit shapes across the HRMS platform.
3. An opaque, millisecond-precision **keyset cursor pagination engine** (`(t, i, k)`: timestamp, row ID, setting key).

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SETTINGS HISTORY ARCHITECTURE                             │
│                                                                                        │
│   S-7: GET /api/v1/settings/history (Registry #248, HR Only)                           │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 1. RESOLUTION & GATING (Pre-Store I/O)                                          │
  │    • Step 1: In-Scope Groups Resolution (group/setting_key filter or all 26)     │
  │    • Step 2: RBAC Projection (HR only, write_roles / read_roles)                 │
  │    • Step 3: Entitlement Projection (resolveEntitlements per group)              │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 2. FEDERATED PARALLEL QUERY (Promise.allSettled)                                │
  │    • Source 1: settings_change_logs    (Shape C: 1 row per key)                 │
  │    • Source 2: payroll_audit_logs      (Shape A: changed-keys map)              │
  │    • Source 3: document_audit_logs     (Shape A: settings; Shape B: branding)   │
  │    • Tolerant Degradation: 1 store failure → 200 OK + unavailable_sources[]     │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 3. NORMALIZATION & FILTER PIPELINE (Pure, Key-Granular)                         │
  │    • Rule 1: Catalog Projection (drops unmapped non-setting columns)            │
  │    • Rule 2: Store Consistency Check (prevents mis-filed key leakage)           │
  │    • Rule 3: Group Scope Enforcement (key-granular RBAC & entitlement)          │
  │    • Rule 4: No-Op Drop via valuesEqual() (neutralizes unchanged row logging)   │
  │    • Rule 5: Keyset Tie Trim (drops keys <= cursor.k on boundary row)           │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
  ┌────────────────────────────────────────▼────────────────────────────────────────┐
  │ 4. MERGE, FRONTIER, TRIMMING & HYDRATION                                        │
  │    • Merge-Sort: created_at DESC, id DESC, setting_key ASC                      │
  │    • Frontier Cut-Off: Trims at the slowest stream's horizon to prevent gaps    │
  │    • Single-Query Tenant Actor Hydration (UserProfile in same orgId)            │
  │    • Next Cursor Encoding: Base64URL({ v: 1, t, i, k })                         │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Fundamental System Invariants

1. **One Chronological, Per-Key Audit Answer:**  
   Every item in the `items[]` array represents exactly **one changed setting key**. Whether the underlying database row recorded a single key, a JSON map of multiple keys, or two entire DTO snapshots, S-7 normalizes and fans out the event into uniform, independent records.
2. **HR-Only Security Plane:**  
   Unlike the Phase 1 read plane (`hr` + `manager`), S-7 is strictly restricted to `hr`. Team managers have no administrative change history access. Platform-plane tokens (`admin`, `super-admin`) are blocked with HTTP `403 FORBIDDEN`.
3. **No Auditing Retrofit on Existing Stores (Non-Destructive Integration):**  
   Stores with existing audit trails (`payroll_settings`, `statutory_configs`, `document_settings`, `document_letter_branding`) continue writing to their existing audit tables (`payroll_audit_logs`, `document_audit_logs`). No existing table is altered.
4. **Dedicated Purpose-Built Ledger (`settings_change_logs`):**  
   The new table exists solely for stores lacking their own audit tables (today: `organization_profiles`, tracking `billing_notification_emails` [#97] and `billing_reminder_lead_days` [#98]). The `store` column carries a strict SQL check constraint: `CHECK ("store" IN ('organization_profiles'))`. Accidental double-writes from already-audited stores fail loudly.
5. **Atomic Audit Recording Inside Owner Transactions:**  
   The audit recorder ([`settings_audit.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/services/settings_audit.service.js)) requires an active database transaction (`transaction` argument is mandatory). If audit logging fails, the enclosing setting write rolls back completely. An unattributable change to an administrative control is treated as an invalid write.
6. **Double-Door Attribution (`settings_api` vs `module_api` vs `system`):**  
   Settings changed via the Settings Gateway (`PUT /api/v1/settings/groups/:groupKey`) record `source: 'settings_api'`. Changes made through the direct domain controller (`PUT /api/v1/organizations/profile`) record `source: 'module_api'`. Internal background jobs record `source: 'system'`.
7. **Type-Aware Comparator in Diffing (`valuesEqual`):**  
   Both write-side diffing and read-side normalization use [`settings_value.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_value.utils.js). This eliminates phantom diffs caused by PostgreSQL string serialization of `DECIMAL`/`NUMERIC` values or array/JSON object reference inequality.
8. **Keyset (Cursor) Pagination with Frontier Cut-Off:**  
   Pagination uses keyset cursors rather than limit/offset to handle append-only streaming data. To prevent lost items or duplicates across parallel data sources with differing write frequencies, the merged stream is truncated at the earliest source's "frontier" before computing `next_cursor`.
9. **Microsecond-to-Millisecond Keyset Alignment:**  
   PostgreSQL stores `created_at` at microsecond precision, while the Node.js `pg` driver parses to millisecond `Date`. Queries use `date_trunc('milliseconds', created_at)` and evaluate `<=` ties with row IDs and setting keys (`(t, i, k)`), ensuring zero skipped rows across page boundaries.
10. **Tolerant Degradation Over Heterogeneous Stores:**  
    If one audit table fails during read (e.g. database query timeout on `document_audit_logs`), the endpoint returns HTTP `200 OK` with the healthy stores' history and populates `unavailable_sources: [{ table: "document_audit_logs", reason: "READ_FAILED" }]`. If all sources fail, it returns HTTP `503 SETTINGS_HISTORY_UNAVAILABLE`. Subscription entitlement failures (`503`) propagate immediately.
11. **Isolated Tenant Actor Hydration:**  
    Actor names are resolved in a single query against `user_profiles` filtered by `org_id = ctx.orgId`. Cross-tenant actor IDs (e.g. system operators) safely resolve to `name: null` rather than leaking another tenant's profile data.

---

## 2. Shared Request & Response Conventions

### 2.1 Standard Response Envelopes

#### Success Envelope (`200 OK`)
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "items": [ ... ],
    "next_cursor": "eyJ2IjoxLCJ0IjoiMjAyNi0xMC0wN1QwOToxMjowNC4yMjFaIiwiaSI6ImY3YTIxY2FlLTQxY2MtNDkyYy04MjljLWI3OTdhNTk2NmI1YyIsImsiOiJsZXR0ZXJfcmVjb3JkX3JldGVudGlvbl9kYXlzIn0",
    "unavailable_sources": [],
    "meta": {
      "sources_read": 3,
      "sources_unavailable": 0,
      "returned": 25
    }
  }
}
```

#### Error Envelope
All error responses emit `AppError` payloads formatted by the global error middleware:
```json
{
  "success": false,
  "errorCode": "ERROR_CODE_STRING",
  "message": "Human-readable explanation of failure",
  "details": {}
}
```

### 2.2 Global Auth Stack
The S-7 endpoint is guarded by the middleware chain defined in [settings.routes.js:35](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/routes/settings.routes.js#L35):
```javascript
const settingsHistoryAuth = [authenticate, authorize(['hr']), requireActiveOrg];
```
* `authenticate`: Validates JWT token, verifies blacklist in Redis, injects `req.user`.
* `authorize(['hr'])`: Strict HR-only role authorization. Blocks `manager`, `employee`, `admin`, and `super-admin` with `403 FORBIDDEN`.
* `requireActiveOrg`: Validates that `req.user.orgId` exists and the organization is in active status (`403 ORG_NOT_ACTIVE`).

### 2.3 Express 5 Query Hardening
In accordance with codebase standards for Express 5, all query parameters are strictly validated via Joi into typed scalar variables. Parameter pollution (e.g. `?group=payroll.calendar&group=payroll.authority`) is strictly rejected with `400 VALIDATION_ERROR`. Query injection of `?org_id=...` is rejected with `400 VALIDATION_ERROR` (tenant context is derived exclusively from the authenticated JWT token).

---

## 3. Shipped Phase 3 API — Detailed Analysis

```text
┌──────┬────────┬──────────────────────────┬─────────────┬────────────────────────────────────────────────────────┐
│ Ref  │ Method │ Endpoint                 │ Registry #  │ Name / Core Purpose                                    │
├──────┼────────┼──────────────────────────┼─────────────┼────────────────────────────────────────────────────────┤
│ S-7  │ GET    │ /api/v1/settings/history │ #248        │ Unified, Keyset-Paginated Settings Change Audit Ledger │
└──────┴────────┴──────────────────────────┴─────────────┴────────────────────────────────────────────────────────┘
```

---

### API S-7: Get Unified Settings Change History

* **API Number / Registry Ref:** `S-7` (API Registry **#248**)
* **HTTP Method:** `GET`
* **Route Path:** `/api/v1/settings/history`
* **Purpose:** Provides a unified, chronological, per-key change history across all 5 settings stores (138 catalog settings). Answers who changed which setting, when, from what value, to what value, and why.
* **Business Problem Solved:** Eliminates fragmented and siloed audit logging. Provides tenant administrators with a single, reliable audit trail for compliance, security audits, and troubleshooting configuration changes.

#### 3.1 Authentication & Authorization
* **Bearer Token Required:** Yes (`Authorization: Bearer <JWT>`).
* **Allowed Roles:** `hr` only.
* **Excluded Roles:** `manager`, `employee`, `admin`, `super-admin` (all return `403 FORBIDDEN`).
* **Tenant Isolation:** Enforced strictly via `req.user.orgId`. The query parameter `org_id` is forbidden (`400 VALIDATION_ERROR`).
* **Subscription Entitlement:**
  * If a targeted `group` or `setting_key` belongs to a module whose feature is disabled in the organization's subscription plan, the request returns `403 FEATURE_NOT_AVAILABLE`.
  * If a broad query is made with no group filter, groups belonging to unentitled features are silently excluded. If no groups remain in scope, a valid empty page (`items: []`) is returned.
  * If the entitlement service fails with `503`, the 503 error propagates directly and is never masked as 403.

#### 3.2 Request Parameters

##### Path Parameters
None.

##### Query Parameters (`historyQuerySchema`)
All parameters are optional scalars.

| Parameter | Type | Required? | Default | Constraints & Validation Rules | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `group` | String | No | `null` | Regex: `^[a-z0-9_.]{1,60}$` | Restricts history to a specific catalog group key (e.g. `payroll.calendar`). Unknown group $\rightarrow$ `404 GROUP_NOT_FOUND`. |
| `setting_key` | String | No | `null` | Regex: `^[a-z0-9_]{1,80}$` | Restricts history to a specific catalog setting key (e.g. `pay_day`). Unknown key $\rightarrow$ `404 SETTING_NOT_FOUND`. |
| `actor_id` | String | No | `null` | UUID v4 format | Filters changes performed by a specific user ID. |
| `from` | String | No | `null` | ISO 8601 Timestamp | Filters changes created on or after this timestamp (`created_at >= from`). |
| `to` | String | No | `null` | ISO 8601 Timestamp | Filters changes created on or before this timestamp (`created_at <= to`). Must be $\ge$ `from`, else `422 INVALID_DATE_RANGE`. |
| `source` | String | No | `null` | Enum: `settings_api`, `module_api`, `system` | Filters by execution channel. **Applies only to `settings_change_logs`** (see Section 3.4). |
| `limit` | Integer | No | `50` | Min: `1`, Max: `100` | Maximum number of history items to return per page. |
| `cursor` | String | No | `null` | Regex: `^[A-Za-z0-9_-]{1,300}$` | Opaque keyset pagination cursor from `next_cursor`. Malformed cursor $\rightarrow$ `400 INVALID_CURSOR`. |

##### Conflict & Cross-Field Validations
1. **Filter Conflict:** If both `group` and `setting_key` are provided, the setting must belong to the specified group in the catalog. If not $\rightarrow$ `422 FILTER_CONFLICT` (`Setting 'pay_day' is not a member of group 'documents.retention'`).
2. **Invalid Date Range:** If both `from` and `to` are provided and `new Date(to) < new Date(from)` $\rightarrow$ `422 INVALID_DATE_RANGE` (`to must not be earlier than from`).
3. **Array Parameter Pollution:** Supplying duplicate parameters (e.g. `?group=a&group=b`) $\rightarrow$ `400 VALIDATION_ERROR`.
4. **Tenant Parameter Injection:** Supplying `?org_id=...` $\rightarrow$ `400 VALIDATION_ERROR`.

---

#### 3.3 Four Ingested Audit Shapes Normalized to One

Settings Module Phase 3 ingests data across three physical database tables representing four distinct audit payload structures:

| Shape | Backing Audit Table | Settings Stores Served | Payload Structure in Database | How S-7 Normalizes It |
| :---: | :--- | :--- | :--- | :--- |
| **Shape A** | `payroll_audit_logs` | `payroll_settings`<br>`statutory_configs` | `old_values`: JSON map of changed keys<br>`new_values`: JSON map of changed keys | Fanned out: 1 candidate item per key in `new_values`. `old_value = old_values[k] ?? null`. |
| **Shape A** | `document_audit_logs` | `document_settings` | `old_values`: JSON map of all submitted keys<br>`new_values`: JSON map of all submitted keys | Fanned out per key. Unchanged keys are dropped by normalization Rule 4 (`valuesEqual`). |
| **Shape B** | `document_audit_logs` | `document_letter_branding` | `old_values`: Full DTO before update<br>`new_values`: Full DTO after update | Union of keys in both DTOs. Non-catalog asset fields (logo/signature metadata) are stripped by Rule 1. Unchanged fields dropped by Rule 4. |
| **Shape C** | `settings_change_logs` | `organization_profiles` | One row per key in table (`setting_key`, `old_value`, `new_value`) | 1:1 mapping directly into candidate item. |

---

#### 3.4 The Five Normalization Rules (Executed in Order)

For every candidate item emitted from an audit row, [`settings_history_normalise.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_history_normalise.utils.js#L72-L135) applies five rules sequentially:

1. **Rule 1 — Catalog Projection & Sensitivity Gate:**  
   `entry = catalog.byKey(candidate.key)`. If the key is not in the catalog, it is immediately discarded. This ensures internal database columns (e.g. `created_at`, `updated_at`, `id`, `logo_storage_key`) never leak to clients.
2. **Rule 2 — Store Consistency:**  
   Verifies `entry.store === source.store`. Prevents misfiled keys from being attributed to the wrong store or module.
3. **Rule 3 — Group Scope & RBAC/Entitlement Enforcement:**  
   Verifies that `entry.group_key` is present in `inScopeGroups`. This enforces that an audit row touching multiple groups only exposes keys belonging to groups the caller is entitled to see.
4. **Rule 4 — No-Op Drop (`valuesEqual`):**  
   If `valuesEqual(candidate.oldValue, candidate.newValue, entry.data_type) === true`, the candidate is dropped. This neutralizes legacy domain write paths that logged full DTOs or unchanged keys, guaranteeing S-7 emits only genuine changes.
5. **Rule 5 — Keyset Cursor Tie Trim:**  
   If the item belongs to the exact boundary row identified by `cursor.i` and `cursor.t`, any candidate key where `candidate.key <= cursor.k` is discarded, ensuring pagination within a multi-key row resumes precisely at `cursor.k`.

---

#### 3.5 Caveats & Field Population Rules

Because S-7 unions legacy domain audit tables with the new settings ledger, certain fields behave differently depending on the backing store:

1. **`source` Caveat:**
   * Populated (`settings_api`, `module_api`, or `system`) **only for changes to `organization_profiles`** (`billing.notifications` group).
   * For the other four stores (`payroll_settings`, `statutory_configs`, `document_settings`, `document_letter_branding`), `source` is always `null` because their legacy audit tables do not have a `source` column.
   * Supplying the query filter `?source=...` automatically restricts the query solely to `settings_change_logs`. Non-ledger tables are not queried.
2. **`actor.role` Caveat:**
   * Populated (`hr`) **only for changes to `organization_profiles`**.
   * For the other four stores, `actor.role` is always `null` because legacy tables store only `actor_id`. S-7 deliberately does not look up the actor's *current* role to avoid retroactively misrepresenting historical permissions.
3. **`reason` Caveat:**
   * Populated for `organization_profiles` when supplied.
   * For `payroll_audit_logs` and `document_audit_logs`, `reason` is populated if the user provided one during write, otherwise `null`.
4. **`audit_source` Field:**
   * Explicitly tells the client which physical table backed the audit record: `settings_change_logs`, `payroll_audit_logs`, or `document_audit_logs`.

---

#### 3.6 Success Response Contract (`200 OK`)

##### Response Headers
* `Content-Type: application/json; charset=utf-8`
* `Cache-Control: private, max-age=0, must-revalidate`
* *(Note: S-7 does not emit an ETag header because audit history is append-only and streaming; calculating an ETag across unbounded federated tables costs as much as executing the query).*

##### Success Response Body Example
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "items": [
      {
        "occurred_at": "2026-10-09T11:30:00.000Z",
        "group": "billing.notifications",
        "setting_key": "billing_reminder_lead_days",
        "registry_ref": 98,
        "old_value": [7, 1],
        "new_value": [14, 7, 1],
        "actor": {
          "id": "e4b52df1-7a6b-4e12-881c-912b7a489111",
          "name": "Asha Rao",
          "role": "hr"
        },
        "reason": "Extended reminder window for finance team",
        "source": "settings_api",
        "request_id": "req-98234-abcd",
        "audit_source": "settings_change_logs"
      },
      {
        "occurred_at": "2026-10-09T10:15:22.000Z",
        "group": "payroll.calendar",
        "setting_key": "pay_day",
        "registry_ref": 1,
        "old_value": 28,
        "new_value": 30,
        "actor": {
          "id": "e4b52df1-7a6b-4e12-881c-912b7a489111",
          "name": "Asha Rao",
          "role": null
        },
        "reason": null,
        "source": null,
        "request_id": "req-11029-efgh",
        "audit_source": "payroll_audit_logs"
      },
      {
        "occurred_at": "2026-10-08T16:45:10.000Z",
        "group": "documents.retention",
        "setting_key": "letter_record_retention_days",
        "registry_ref": 95,
        "old_value": null,
        "new_value": 730,
        "actor": {
          "id": "f8c92a10-2b11-4991-88dc-112233445566",
          "name": "Karthik Nair",
          "role": null
        },
        "reason": "Compliance policy update",
        "source": null,
        "request_id": "req-44910-ijkl",
        "audit_source": "document_audit_logs"
      }
    ],
    "next_cursor": "eyJ2IjoxLCJ0IjoiMjAyNi0xMC0wOFQxNjo0NToxMC4wMDBaIiwiaSI6IjQ0OTFmYWFjLTExMjItMzM0NC01NTY2LTc3ODg5OWFabbNjYyIsImsiOiJsZXR0ZXJfcmVjb3JkX3JldGVudGlvbl9kYXlzIn0",
    "unavailable_sources": [],
    "meta": {
      "sources_read": 3,
      "sources_unavailable": 0,
      "returned": 3
    }
  }
}
```

##### Field Descriptions

| JSON Field | Type | Nullable? | Description |
| :--- | :--- | :---: | :--- |
| `data.items[]` | Array | No | Chronological list of setting change events (ordered newest first). |
| `items[].occurred_at` | String (ISO 8601) | No | Exact UTC timestamp when the change was committed. |
| `items[].group` | String | No | Catalog group key (e.g. `payroll.calendar`, `billing.notifications`). |
| `items[].setting_key` | String | No | Catalog setting key (e.g. `pay_day`, `billing_reminder_lead_days`). |
| `items[].registry_ref` | Integer | Yes | Unique catalog integer ID (#1 through #138). |
| `items[].old_value` | Any (JSON) | Yes | Previous setting value before the update (`null` if previously unset). |
| `items[].new_value` | Any (JSON) | Yes | New setting value after the update. |
| `items[].actor` | Object | No | Information about the user who made the change. |
| `items[].actor.id` | String (UUID) | Yes | User ID of the actor (`null` for system changes). |
| `items[].actor.name` | String | Yes | Display name of the user resolved from `user_profiles` (`null` if unresolvable). |
| `items[].actor.role` | String | Yes | Role of the user at the time of change (`'hr'`, populated only for `settings_change_logs`). |
| `items[].reason` | String | Yes | Business reason provided during write. |
| `items[].source` | String | Yes | Ingestion channel: `settings_api`, `module_api`, or `system` (populated only for `settings_change_logs`). |
| `items[].request_id` | String | Yes | Correlation request ID (`x-request-id` or `x-correlation-id`). |
| `items[].audit_source` | String | No | Originating database table: `settings_change_logs`, `payroll_audit_logs`, or `document_audit_logs`. |
| `data.next_cursor` | String (Base64URL) | Yes | Keyset pagination token for the next page. `null` when no further records exist. |
| `data.unavailable_sources` | Array | No | Lists any backing tables that failed to query during execution: `[{ table, reason: "READ_FAILED" }]`. |
| `data.meta.sources_read` | Integer | No | Count of successfully queried audit tables. |
| `data.meta.sources_unavailable` | Integer | No | Count of failed audit tables. |
| `data.meta.returned` | Integer | No | Count of normalized items returned in the current response. |

---

#### 3.7 Keyset Cursor Specification

The pagination token `cursor` is an opaque Base64URL-encoded JSON payload with schema:
```json
{
  "v": 1,
  "t": "2026-10-08T16:45:10.000Z",
  "i": "4491faac-1122-3344-5566-778899aabbcc",
  "k": "letter_record_retention_days"
}
```

* `v`: Cursor format version (integer `1`).
* `t`: Millisecond-precision ISO timestamp of `created_at`.
* `i`: Primary key UUID of the boundary audit row.
* `k`: The setting key on the boundary row that was emitted last (`null` if the entire row was consumed).

##### SQL Keyset Predicate
Inside [`settings_history_cursor.utils.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/utils/settings_history_cursor.utils.js#L85-L100), the SQL `WHERE` clause generated for the cursor is:
```sql
WHERE date_trunc('milliseconds', created_at) < :t
   OR (date_trunc('milliseconds', created_at) = :t AND id <= :i)
ORDER BY date_trunc('milliseconds', created_at) DESC, id DESC
```
The `<=` operator on the tie re-fetches the boundary row so any remaining setting keys on that row (`setting_key > cursor.k`) are emitted on the next page. Keys with `setting_key <= cursor.k` are trimmed in-memory by normalization Rule 5.

---

## 4. Error Register & Failure Matrix

All errors return the standard error envelope with appropriate HTTP status codes and error constants:

| HTTP Status | Error Code (`errorCode`) | Cause / Trigger Condition | Details Payload |
| :---: | :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Schema failure on query params (e.g. `limit > 100`, array pollution `?group=a&group=b`, or unexpected query param `?org_id=...`). | `{ validationErrors: [...] }` |
| `400` | `INVALID_CURSOR` | Cursor string is malformed, not valid Base64URL, contains invalid JSON, or has an unknown version (`v != 1`). | Empty / message explanation. |
| `403` | `FORBIDDEN` | Request token does not possess role `hr` (e.g. `manager`, `employee`, `admin`, `super-admin`), OR caller lacks read access to targeted group. | Empty / message explanation. |
| `403` | `FEATURE_NOT_AVAILABLE` | Targeted group/setting belongs to an unentitled module feature flag (e.g. `payroll.access` disabled on subscription). | Empty / message explanation. |
| `403` | `ORG_NOT_ACTIVE` | Tenant organization is suspended, inactive, or cancelled. | Empty / message explanation. |
| `404` | `GROUP_NOT_FOUND` | Queried `group` does not exist in the catalog. | Empty / message explanation. |
| `404` | `SETTING_NOT_FOUND` | Queried `setting_key` does not exist in the catalog. | Empty / message explanation. |
| `422` | `FILTER_CONFLICT` | `group` and `setting_key` were both provided, but the setting is not a member of that group in the catalog. | Empty / message explanation. |
| `422` | `INVALID_DATE_RANGE` | `to` timestamp is strictly earlier than `from` timestamp. | Empty / message explanation. |
| `503` | `SETTINGS_HISTORY_UNAVAILABLE` | All queried audit sources failed due to database connection or query errors. | Empty / message explanation. |
| `503` | `ENTITLEMENT_DEPENDENCY_FAILURE` | Entitlement service or billing backend dependency failure during feature resolution. | Propagated dependency error. |

---

## 5. Security & Production Verification

### 5.1 Role-Based Access Control (RBAC)
* **Route Guard:** Guarded strictly by `authorize(['hr'])`. Managers are blocked at the HTTP layer with `403 FORBIDDEN` (verified in unit test `T-P3-S1`).
* **Service Guard:** Targeted queries against groups whose `read_roles` exclude the caller are rejected with `403 FORBIDDEN`.

### 5.2 Tenant Isolation
* All database queries append `WHERE org_id = :orgId` using `ctx.orgId` derived from the verified JWT.
* The query parameter `org_id` is forbidden in `historyQuerySchema` (`400 VALIDATION_ERROR`).
* Actor hydration filters by `org_id = ctx.orgId`. An `actor_id` from another tenant (or system user) will not resolve to a foreign user name.

### 5.3 Sensitive Data Protection & Projection
* Unmapped database columns (such as passwords, tokens, API secrets, internal keys, or document storage keys) are filtered out by Normalization Rule 1. Only explicitly registered catalog keys are emitted.
* Catalog keys flagged as `sensitive: true` (e.g. bank account numbers) are projected with masked representations as governed by catalog policies.

### 5.4 Database Performance & Concurrency
* **Read Plane:** S-7 issues **zero writes**, acquires zero row locks, and opens zero database transactions. It is safe for read replicas.
* **Write Plane (`settings_audit.service.js`):** Writes to `settings_change_logs` occur synchronously **inside the caller's existing transaction**. No separate transaction is opened, preventing orphaned audit records or partial rollbacks.
* **Indexes:** `settings_change_logs` features four targeted composite B-tree indexes matching every access path:
  1. `("org_id", "created_at" DESC)`
  2. `("org_id", "setting_key", "created_at" DESC)`
  3. `("org_id", "group_key", "created_at" DESC)`
  4. `("org_id", "actor_id", "created_at" DESC)`

---

## 6. Phase 1 $\rightarrow$ Phase 2 $\rightarrow$ Phase 3 Consistency & Impact

### 6.1 Review of Existing Settings APIs

| API Ref | Method | Endpoint | Registry Ref | Phase Introduced | Impact by Phase 3 | Status |
| :---: | :---: | :--- | :---: | :---: | :--- | :---: |
| **S-1** | `GET` | `/api/v1/settings/catalog` | #242 | Phase 1 | **None.** Contract, response, and behavior unchanged. | Unchanged |
| **S-2** | `GET` | `/api/v1/settings/catalog/:settingKey` | #243 | Phase 1 | **None.** Contract, response, and behavior unchanged. | Unchanged |
| **S-3** | `GET` | `/api/v1/settings` | #244 | Phase 1 | **None.** Contract, response, and behavior unchanged. | Unchanged |
| **S-4** | `GET` | `/api/v1/settings/groups/:groupKey` | #245 | Phase 1 | **None.** Contract, response, and behavior unchanged. | Unchanged |
| **S-5** | `PUT` | `/api/v1/settings/groups/:groupKey` | #246 | Phase 2 | **Internal write-side enhancement only.** Updates to `billing.notifications` now record audit rows to `settings_change_logs`. HTTP contract unchanged. | Unchanged |
| **S-6** | `POST` | `/api/v1/settings/groups/:groupKey/reset` | #247 | Phase 2 | **Internal write-side enhancement only.** Resets to `billing.notifications` now record audit rows to `settings_change_logs`. HTTP contract unchanged. | Unchanged |
| **S-7** | `GET` | `/api/v1/settings/history` | #248 | Phase 3 | **Brand-new endpoint.** | **NEW** |

### 6.2 Internal Cross-Phase Enhancements

1. **Organization Billing Adapter Attribution:**  
   [`organization_billing.adapter.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/settings/adapters/organization_billing.adapter.js#L40) was updated to forward `audit: { actorRole: actor.actorRole, ipAddress: actor.ipAddress, requestId: actor.requestId, reason: actor.reason, source: 'settings_api' }` to `organizationService.updateOrganizationProfileFieldsLocked`.
2. **Organization Domain Controller Attribution:**  
   [`organization.controller.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/organization/controllers/organization.controller.js#L34) was updated to thread `audit: { actorRole: req.user.role, ipAddress: req.ip, requestId: req.headers['x-request-id'] || req.headers['x-correlation-id'], reason: null, source: 'module_api' }` when updating organization profiles directly.
3. **Completion of DEF-S11 / F-P3-2:**  
   In [`payroll_settings.service.js:117`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/payroll/services/payroll_settings.service.js#L117), the owner diff comparator was updated from reference inequality (`!==`) to type-aware comparator `valuesEqual(before[key], updated[key], entry.data_type)`. This resolved a phantom audit logging bug where the array/JSON key `fnf_encashment_leave_type_codes` was falsely logged as changed on every write.

---

## 7. Cross-Module Consistency

| Dimension | Standard across HRMS | Settings Phase 3 Implementation |
| :--- | :--- | :--- |
| **Envelope** | `{ success, message, data }` | Matches standard envelope (`data: { items, next_cursor, unavailable_sources, meta }`). |
| **Error Handling** | `AppError(status, message, errorCode, details)` | Strict use of `AppError`; global error handler catches and formats responses. |
| **Tenant Scoping** | `req.user.orgId` enforced on every SQL query | All queries join/filter by `org_id = ctx.orgId`. Reject query param `org_id`. |
| **Timezone Management** | All timestamps stored and serialized in **UTC** | `occurred_at`, `from`, `to`, `created_at` formatted in ISO 8601 UTC. Date math uses `Dayjs` UTC. |
| **Layer Separation** | Controller $\rightarrow$ Service $\rightarrow$ Repository $\rightarrow$ Model | Strict separation. Controller is thin HTTP mapper; Service handles logic; Repositories query database. |
| **Audit Ledger Model** | Append-only, no `updated_at`, no `deleted_at` | `SettingsChangeLog` is append-only (`paranoid: false`, `updatedAt: false`). |

---

## 8. Final Coverage Audit & Verification Metrics

```text
Total Phase 3 APIs discovered: 1
Total Phase 3 APIs documented: 1
New APIs added: 1 (S-7 / #248)
Existing APIs modified by Phase 3: 0 (HTTP contract unchanged; 2 adapters/services internally enhanced)
APIs corrected: 0
APIs still missing: 0

Request contracts verified: 1 / 1
Success responses verified: 1 / 1
Error handling verified: 1 / 1
Security/authorization verified: 1 / 1
Database behavior verified: 1 / 1
Settings/configuration behavior verified: 1 / 1

Phase 1 APIs reviewed for Phase 3 impact: 4 (S-1, S-2, S-3, S-4)
Phase 2 APIs reviewed for Phase 3 impact: 2 (S-5, S-6)
Phase 1 APIs actually changed by Phase 3: 0
Phase 2 APIs actually changed by Phase 3: 0 (Internal audit recorder attached; HTTP contracts identical)
APIs incorrectly assumed as changed: 0
```

### Test Suite Execution Verification
* **Command:** `node --test tests/unit/settings/*.test.js`
* **Test Files:** 19 files under `tests/unit/settings/`
* **Results:** **180 passed, 0 failed, 0 skipped** (42.1s execution time)
* **Phase 3 Specific Suites Passing:**
  * `history_api_correctness.test.js`: Router mounting, ordering, HR role guard, error register
  * `history_service.test.js`: Resolution, degradation, filtering, actor hydration
  * `history_cursor.test.js`: Encode/decode, keyset predicate, multi-source frontier merge
  * `history_normalise.test.js`: Shapes A, B, C, five normalization rules, no-op drop
  * `settings_audit_recorder.test.js`: Transaction requirements, JSON null literals, `recordDiff`
  * `module_boundary.test.js`: Absence of foreign writes, circular dependencies, and foreign models
