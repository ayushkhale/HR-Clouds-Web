# Backend change record — 2026-10-09

## New: Settings module write APIs (Phase 2, write plane)

Two **brand-new** write endpoints under `/api/v1/settings`. They let HR change the
same configuration the Phase 1 read plane exposes, by **delegating** each write to the
owning module's existing service (payroll, statutory, document, letter-branding,
organization) under optimistic concurrency. **No existing endpoint, request shape or
response shape changes**, so every current frontend keeps working unchanged. There is
**no migration, no new table/column, no new org setting, no new dependency, no env
var, and no change to `src/app.js`.**

| # | Endpoint | Method | What it does |
|---|---|---|---|
| #246 | `/api/v1/settings/groups/:groupKey` | PUT | Update one or more keys in a group (S-5). |
| #247 | `/api/v1/settings/groups/:groupKey/reset` | POST | Reset named keys in a group to their catalog defaults (S-6). |

**Full endpoint-by-endpoint contract:** `public/md_settings/combined_api_analysis.md`.

---

## ⚠️ Two hard client obligations — read these first

### 1. `If-Match` is **mandatory** on every S-5 and S-6 request

Both writes require an `If-Match` header carrying a **per-group** ETag. This is the
optimistic-concurrency guard: the write only lands if nobody else changed the group
since you read it.

- **Where to get the token:** the **`data.etag` of S-4** (`GET /settings/groups/:groupKey`),
  i.e. `W/"<catalog_version>:<updated_at ISO>"`. **Do _not_ use S-3's top-level
  ETag** (`GET /settings`) — that one folds in the *max* `updated_at` across all
  stores and is not valid as a per-group precondition.
- **After a successful write**, the `200` response returns a **new** `data.etag` (and
  an `ETag` response header). Use that as the `If-Match` for your next write to the
  same group — no re-read needed.
- **Missing `If-Match` → `400 SETTINGS_IF_MATCH_REQUIRED`.** A malformed one (a bare
  ISO, a strong ETag, or `*`) → `400 SETTINGS_IF_MATCH_INVALID`. `*` is deliberately
  **not** honoured as "overwrite whatever is there" — that is exactly what this gate
  prevents.
- **`412 SETTINGS_PRECONDITION_FAILED`** means the group changed under you. The
  response `details.current_etag` is the server's current token. **Re-read the group,
  reconcile, and resubmit — never retry the same request blindly.** This is especially
  true after a client timeout: the write may actually have committed, so a blind retry
  can clobber a newer value. Re-read first.
- **`412` is the first use of HTTP `412` anywhere in this API.** If your HTTP client or
  gateway has special handling for `412`, verify it surfaces the body (we rely on
  `details.current_etag`).

### 2. `reason` is now **required** for eight high-risk keys

Keys classified `risk: "high"` require **both** a non-empty `reason` (string, 1–500
chars) **and** `confirm: true` in the request body. Sending neither, or only one, is
rejected **before** anything is written:

- missing `reason` → **`422 SETTINGS_REASON_REQUIRED`** (`details.keys[]`)
- `reason` present but no `confirm: true` → **`409 SETTINGS_CONFIRMATION_REQUIRED`**
  (`details.keys[]`, `details.warnings[]` — the warnings are verbatim catalog text to
  show the user before they confirm)

The eight high-risk keys (promoted in this phase under catalog gate P2-GATE-1):

| Key | Group | Why high-risk |
|---|---|---|
| `payroll_require_separate_checker` | `payroll.authority` | alters who may approve money |
| `manager_direct_compensation_authority` | `payroll.authority` | alters who may approve money |
| `manager_direct_document_authority` | `documents.authority` | alters who may approve documents |
| `document_require_separate_checker` | `documents.authority` | alters who may approve documents |
| `document_retention_days` | `documents.retention` | irreversible purge |
| `document_publish_sync_threshold` | `documents.publishing` | changes a client-visible response class |
| `letter_auto_issue_on_exit` | `documents.letters` | issues unreviewed letters automatically |
| `letter_record_retention_days` | `documents.retention` | irreversible purge |

`requires_reason` is published per key on the S-1/S-2/S-4 catalog metadata, so you can
know up front which keys will demand a `reason` + `confirm`. Reset (S-6) of a high-risk
key is **not** a privileged bypass — it needs `reason` + `confirm` too.

---

## 1. Auth & roles

- Both writes require `authenticate` + `authorize(['hr'])` + `requireActiveOrg`.
- **`manager` is never a writer.** A `manager` token (which *can* read
  `payroll.authority` / `documents.authority`) gets `403` at the door on S-5/S-6.
  `employee`, `admin`, `super-admin` are rejected the same way. HR is the only writer.
- There is still **no route-level feature gate**; entitlement is checked per group
  inside the service (`403 FEATURE_NOT_AVAILABLE` if the org's plan lacks the feature).

---

## 2. Request body

**S-5 (`PUT`):**
```json
{ "values": { "pay_day": 5 }, "reason": "optional, required for high-risk keys", "confirm": true }
```
- `values`: object, 1–60 keys; each key must match `^[a-z0-9_]{1,80}$`. Per-key value
  validation is the **owner module's own Joi** (same rules as the owner's existing
  `PUT` door). Unknown envelope fields are rejected (`.unknown(false)`).
- Keys not in the group's catalog, or not owner-writable, are **reported, never
  silently dropped** → `422 SETTING_NOT_WRITABLE` with `details.keys[]`.
- `reason` / `confirm` are only *consulted* for high-risk keys (see above).

**S-6 (`POST .../reset`):**
```json
{ "keys": ["pay_day", "currency"], "reason": "…", "confirm": true }
```
- `keys`: non-empty array (1–50, unique) of keys to reset to their catalog defaults.
  A non-writable key → `422 SETTING_NOT_WRITABLE`; a key marked non-resettable →
  `422 SETTING_NOT_RESETTABLE`.

---

## 3. Success response (`200 OK`)

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
    "values": { "pay_day": 5, "currency": "INR" },
    "changed": { "pay_day": { "from": 1, "to": 5 } },
    "unchanged_keys": ["currency"],
    "non_default_keys": ["pay_day"]
  }
}
```

- **`changed` / `unchanged_keys`** are diffed from the **stored** row before vs. after
  the write (via the type-aware comparator), **never** echoed from your submitted
  patch. So resubmitting a DECIMAL's stored value (`"2.00"` vs `2`) lands in
  `unchanged_keys`, not `changed`.
- **`non_default_keys`** is the post-write set of keys differing from catalog default.
- **`values`** is sliced to **this group only**, even though some stores back several
  groups (payroll, documents).
- **A no-op write still returns a _new_ `etag`.** If your patch changed nothing
  (`changed: {}`), `updated_at`/`etag` still advance because the owner row was touched.
  Always adopt the returned `etag` as your next `If-Match`.
- S-5/S-6 responses set `Cache-Control: no-store` and do **not** honour
  `If-None-Match` (meaningless on a write).

### Reset response
Identical shape plus `"reset": true`.

### `impact` — **statutory writes only**
A write to a `statutory.*` group may carry `data.impact`:
```json
"impact": {
  "affected_runs": [{ "id": "…", "period_month": 9, "run_type": "regular", "status": "draft" }],
  "activated_components": ["PF_EMPLOYEE"]
}
```
These are the owner's real side effects, passed through verbatim. Note the
`affected_runs` item fields are `{ id, period_month, run_type, status }` (not
`{ id, period, status }`). `impact` is **absent** when the owner reports none (e.g. all
payroll and document writes).

### Branding (`documents.branding`) — three normalisations to expect
When you write `documents.branding`, the owner may normalise on the way in; the
response reports the **stored** result, so compare against `changed`/`values`, not your
submission:
1. A patch that does **not** mention `registered_address_lines` leaves the stored
   address **untouched** (we validate with `noDefaults`, so the owner's `.default([])`
   never injects an empty array that would wipe it).
2. A cleared `accent_color_hex` (`null`) is coerced to its stored/default value and
   lands in `unchanged_keys` if unchanged.
3. `registered_address_lines` beyond the stored cap reports the **stored** (truncated)
   value — `changed` is built from the re-read row, never your echo.

---

## 4. Error register (complete)

| HTTP | `errorCode` | When | `details` |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | envelope Joi, **or** the owner's own Joi | `keys[]` (owner case) |
| 400 | `SETTINGS_IF_MATCH_REQUIRED` | no `If-Match` header | — |
| 400 | `SETTINGS_IF_MATCH_INVALID` | `If-Match` is `*`, a bare ISO, or a strong ETag | — |
| 401 | `UNAUTHORIZED` | missing/invalid token | — |
| 403 | `FORBIDDEN` | not `hr`, or role not in the group's `write_roles` | — |
| 403 | `FEATURE_NOT_AVAILABLE` | org's plan lacks the group's feature | — |
| 404 | `GROUP_NOT_FOUND` | unknown group key | — |
| 404 | `ORG_PROFILE_NOT_FOUND` | `billing.notifications` profile row missing | — |
| 405 | `SETTINGS_GROUP_READ_ONLY` | group has no writers (e.g. `payroll.deprecated`) | — |
| 409 | `SETTINGS_CONFIRMATION_REQUIRED` | high-risk key without `confirm: true` | `keys[]`, `warnings[]` |
| 409 | `INSUFFICIENT_CHECKERS` | owner guard (payroll/document) | `active_hr_count` (document) |
| 409 | `SETTINGS_CONFLICT` | document owner — `#59 ⊕ #60` mutually exclusive | `fields[]` |
| 409 | `SCAN_PROVIDER_NOT_CONFIGURED` | document owner (#64) | — |
| **412** | `SETTINGS_PRECONDITION_FAILED` | `If-Match` stale, **or** catalog version changed | `current_etag`, `current_updated_at`, `reason?` |
| 422 | `SETTING_NOT_WRITABLE` | key not in catalog / not owner-writable | `keys[]` |
| 422 | `NO_WRITABLE_KEYS` | nothing writable in the payload | — |
| 422 | `SETTINGS_REASON_REQUIRED` | high-risk key without `reason` | `keys[]` |
| 422 | `SETTING_NOT_RESETTABLE` | S-6 on a non-resettable key | `keys[]` |
| 422 | `SETTINGS_PAYLOAD_INVALID` | too many keys / too deep / too large | `violation` |
| 422 | `SETTING_OUT_OF_RANGE` | document owner range guards | `field`, `min`/`max`/`code` |
| 422 | `INVALID_PAYOUT_COMPONENT` | payroll owner | — |
| 422 | `LETTER_REFERENCE_PATTERN_INVALID` | document owner | — |
| 503 | `ENTITLEMENT_DEPENDENCY_FAILURE` | entitlement dependency outage | — |

Owner-raised codes (`INSUFFICIENT_CHECKERS`, `SETTINGS_CONFLICT`,
`SCAN_PROVIDER_NOT_CONFIGURED`, `SETTING_OUT_OF_RANGE`, …) propagate with their status,
message and `details` **unchanged** — the gateway adds nothing except, for a `412`, the
`current_etag`.

---

## 5. `catalog_version` bump and the rolling-deploy window

`catalog_version` advances from `2026-10-09.1` (Phase 1) to **`2026-10-09.2`**. The
change is **purely additive** — no key renamed or removed, no `data_type`/`default`/
`range`/`nullable` altered; only `risk`/`requires_reason`/`warnings`/`conflicts_with`/
`depends_on`/`known_errors` were populated.

During a rolling deploy, old and new instances briefly serve different catalog
versions. The `If-Match` token embeds the version, so:
- a token minted on an old instance, sent to a new one (or vice versa), yields
  **`412 … reason: "CATALOG_VERSION_CHANGED"`** — recover with **one re-read** of
  S-1 + the group;
- an old instance has no S-5/S-6 route at all, so a client that lands there gets a
  `404` from the router — correct for an endpoint that does not exist there yet.

Nothing is corrupted by a long window; keep it short anyway. On rollback the version
reverts and clients revalidate once more; every value written through the gateway
stays, because it was written into the owner's own column by the owner's own service.

---

## 6. Known gap: `billing.notifications` writes are **not audited** yet

`organization_profiles` has no audit table, so a Phase 2 write to `billing.notifications`
(`billing_notification_emails`, `billing_reminder_lead_days`) is **not** recorded in an
audit log. This is **not a new gap** — the existing `PUT /organizations/profile` door is
equally unaudited today — but Phase 2 adds a second unaudited door to the same two
fields. The audit ledger that closes it ships in Phase 3. Every other store's write
**is** audited through the owner's existing audit path. Shipped knowingly (D-P2-4).

---

## 7. Breaking changes: **none**

- No existing endpoint, request body, parameter, response field or status code changes.
- The owner modules gained one **optional** `ifMatch` parameter each; their own doors
  behave exactly as before.
- **The earlier prediction that `document_settings` writes would start returning `422`
  for unknown keys is withdrawn** — no such change was made (see §8).

---

## 8. Convention note — DEF-S8 (document settings route) left as-is

The plan offered an optional convention alignment (move the `document_hr` `PUT /settings`
validation from the controller into route `validate()` middleware, matching payroll).
**It was skipped deliberately, with no behaviour change**, because: (a) every route in
`document_hr.routes.js` validates in the controller — aligning only this one route would
break the module's _own_ local convention; (b) the schema is already applied
(`document_hr.controller.js` calls `validateOrThrow(updateSettingsSchema, …)`), so there
is nothing functionally missing; and (c) it would touch a shipped endpoint and its
controller for zero observable gain. The gateway runs each owner's Joi itself (F-P2-1),
so the gateway door is unaffected regardless. The document module's existing settings
tests pass unmodified.
