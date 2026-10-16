# Backend change record — 2026-10-09

## New: Settings module read APIs (Phase 1, read-only)

Four **brand-new** `GET` endpoints under `/api/v1/settings`. They expose a single
read model over configuration that already lives in five existing owner stores
(payroll, statutory, document, letter-branding, organization). **Nothing existing
is removed, no existing field changes type or meaning, and no new write path is
added** — so every current frontend keeps working unchanged. This record exists so
the frontend can build the Settings screens against a stable contract.

| # | Endpoint | Method | What it returns |
|---|---|---|---|
| #242 | `/api/v1/settings/catalog` | GET | Catalog metadata (groups + keys + surfaces). **No values.** |
| #243 | `/api/v1/settings/catalog/:settingKey` | GET | One key's metadata + related refs. **No value.** |
| #244 | `/api/v1/settings` | GET | Live values for all readable+entitled groups. |
| #245 | `/api/v1/settings/groups/:groupKey` | GET | Live values + per-entry metadata for one group. |

**Breaking changes: none.** No migration, no new org setting, no new dependency,
no env var. The only server wiring change is one line in `src/app.js` mounting the
module. Full endpoint-by-endpoint contract: `public/md_settings/combined_api_analysis.md`.

---

## 1. Auth, roles, and the two-plane gate

- All four require `authenticate` + `authorize(['hr','manager'])` + `requireActiveOrg`.
- `employee`, `admin`, `super-admin` tokens get `403` at the door — the module is
  tenant-plane and HR/manager-only.
- There is **no route-level feature gate**. Entitlement (payroll / documents plan
  features) is resolved **per settings group inside the service** and reported in
  the payload (see §4), because one page load spans groups with different feature
  requirements. The single exception is the targeted S-4, which returns a hard
  `403 FEATURE_NOT_AVAILABLE` for the one group asked for.

### Manager sees a strict subset
`manager` can read exactly **2 groups** — `payroll.authority` and
`documents.authority` (the maker/checker authority knobs over their reports).
Every other group is returned to a manager in `unavailable_groups` with reason
`NOT_READABLE` on S-3, or `403 FORBIDDEN` on S-4. (Note: an earlier plan draft
referred to a "5-group" manager view; the shipped scope is 2 — build to 2.)
`manager` is **never** a writer of any group (`writable:false` always), which
matters once Phase 2 adds writes.

---

## 2. Response envelope

Every `200` is the standard project envelope:

```json
{ "success": true, "message": "OK", "data": { /* endpoint payload */ } }
```

Error responses are the project's standard `AppError` shape (`status`, `errorCode`,
`message`). Error codes you will see: `INVALID_FILTER_COMBINATION` (422),
`UNKNOWN_MODULE` (422), `GROUP_NOT_FOUND` (404), `SETTING_NOT_FOUND` (404),
`FORBIDDEN` (403), `FEATURE_NOT_AVAILABLE` (403), `VALIDATION_ERROR` (400),
and `503` for a dependency outage (see §4.3).

---

## 3. ETag / caching / `304`

- Every response sets a **weak** `ETag` and `Cache-Control: private, max-age=0, must-revalidate`.
- S-1/S-2 ETag is derived from `catalog_version` alone (the catalog is immutable
  per deploy): `W/"<catalog_version>"`.
- S-3/S-4 ETag folds in the owner rows' latest `updated_at`, so it changes when a
  value changes: `W/"<catalog_version>:<iso>"`.
- Send the ETag back as `If-None-Match`; a match returns `304` with an empty body
  and no re-read. Always compare the whole ETag string; do not parse it.
- Every payload also carries `catalog_version` explicitly. **If you receive a
  `catalog_version` you did not expect, re-fetch S-1** — during a rolling deploy
  two instances can briefly serve different catalog versions, and a stale client
  asking for a renamed group gets `404 GROUP_NOT_FOUND`, recoverable in one
  re-fetch. (Phase 1 is purely additive, so this only bites from Phase 2 onward.)

---

## 4. S-3 (`GET /settings`) specifics

### 4.1 `unavailable_groups` is part of the `200`, not an error
A group the caller may not see, is not entitled to, or whose store failed to read
is **not** an error on S-3 — it is listed in `data.unavailable_groups` with a
`reason`, and the rest of the page still returns `200`. The three reasons:

| reason | meaning | client action |
|---|---|---|
| `NOT_READABLE` | the caller's role cannot read this group | hide it |
| `NOT_ENTITLED` | the org's plan does not include this group's feature | show as upgrade-gated |
| `READ_FAILED` | the owner store errored transiently on this request | show "temporarily unavailable", offer retry |

### 4.2 `non_default_keys`
Each returned group carries `non_default_keys: string[]` — the keys whose current
value differs from the catalog default, compared with a **type-aware** comparator
(so a DECIMAL that the database returns as the string `"2.00"` is correctly equal
to a default of `2`, and is **not** reported as changed). Use this to badge
"customised" settings without re-deriving defaults on the client.

### 4.3 `503` is never flattened to an upsell
If the entitlement dependency or a store read fails with `503`, S-3 **propagates
the `503`** rather than marking groups `NOT_ENTITLED`/`READ_FAILED`. Retry; do not
tell the user to upgrade on a `503`.

### 4.4 Filtering
Optional `?modules=payroll,document` (a **comma-separated scalar** — do **not**
send repeated `?modules=` params; an array fails validation). Unknown module →
`422 UNKNOWN_MODULE`.

---

## 5. S-4 (`GET /settings/groups/:groupKey`) fails loudly

Because S-4 is a targeted request, it does **not** degrade the way S-3 does:

| condition | S-3 | S-4 |
|---|---|---|
| role may not read the group | lists it `NOT_READABLE`, `200` | `403 FORBIDDEN` |
| not entitled | lists it `NOT_ENTITLED`, `200` | `403 FEATURE_NOT_AVAILABLE` |
| store read fails | lists it `READ_FAILED`, `200` | the rejection propagates |

This asymmetry is intentional: a list tolerates a missing tile; a detail view must
tell the caller exactly why it cannot be shown.

---

## 6. Metadata fields worth knowing

Present on catalog entries (S-1/S-2) and, for S-4, on each group's `settings[]`:

- **`inherits_from`** — usually another setting key; its resolved stub appears under
  `related.inherits_from`. When it names an owner **store** rather than a key, it is
  passed through unresolved as `{ "ref": "<store_or_key>" }` — treat an object with
  only `ref` as "inherited from a source we don't surface as a key".
- **`platform_cap`** — present on a few document keys (#61/#62/#63/#79); a hard
  platform ceiling the org value cannot exceed. Display it as the max.
- **`writable`** — **advisory in Phase 1.** It reflects what the role *will* be
  allowed to write once Phase 2 ships writes; there is no write endpoint yet. Do
  not key any current behaviour off it beyond showing/hiding a (disabled) control.
- **`enforcement_hint`** is **never** sent to the client (stripped from every
  entry); do not build around it.

S-1 and S-2 carry **metadata and the `default` only — never a current value**. Read
current values from S-3/S-4.
