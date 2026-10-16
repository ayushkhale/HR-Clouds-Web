# Backend change record — 2026-10-09

## New: Settings module history API (Phase 3)

One **brand-new** read endpoint under `/api/v1/settings`. It returns a unified,
keyset-paginated audit trail of **who changed which setting, when, and from what to what**,
across all five settings stores. It is a pure read — it writes nothing — and it **delegates
to no new data of its own for stores 1–4**: it reads the owning modules' existing audit
tables and one new ledger for the organization-profile settings.

| # | Endpoint | Method | Auth | Roles | What it does |
|---|---|---|---|---|---|
| #248 | `/api/v1/settings/history` | GET | Yes | `hr` only | S-7. Paginated change history for readable + entitled settings groups. |

**`hr` only.** Unlike the Phase 1 read plane (`hr` + `manager`), history is HR-only — a
`manager` token gets `403 FORBIDDEN`. `admin` / `super-admin` have no tenant plane and are
also `403`.

**No existing endpoint, request shape or response shape changes.** Every current frontend
keeps working unchanged. There is **one new table** (`settings_change_logs`, migration
`00073`, handed back to the operator unrun), **no new org setting, no new dependency, and no
env var.** `CATALOG_VERSION` is unchanged (`2026-10-09.2`).

---

## Query parameters (all optional, all scalar)

| Param | Type | Rules |
|---|---|---|
| `group` | string | `^[a-z0-9_.]{1,60}$`. Unknown → `404 GROUP_NOT_FOUND`. |
| `setting_key` | string | `^[a-z0-9_]{1,80}$`. Unknown → `404 SETTING_NOT_FOUND`. |
| `actor_id` | UUID | filter to one actor. |
| `from` / `to` | ISO 8601 | `to` must be `>= from`, else `422 INVALID_DATE_RANGE`. |
| `source` | enum | `settings_api` \| `module_api` \| `system`. **See caveat 1.** |
| `limit` | integer | 1–100, default **50**. |
| `cursor` | string | opaque; pass back `next_cursor` verbatim. Malformed → `400 INVALID_CURSOR`. |

`group` and `setting_key` may be combined; if the key is not a member of the group →
`422 FILTER_CONFLICT`. Every param is a **scalar** — a polluted `?group=a&group=b` (an array
in Express 5) is a `400 VALIDATION_ERROR`, not silently `[0]`-indexed. `?org_id=…` is
rejected (`400`): the org is taken only from your token.

## Response `200` — `data`

```jsonc
{
  "items": [
    {
      "occurred_at": "2026-10-07T09:12:04.221Z",
      "group": "documents.retention",
      "setting_key": "letter_record_retention_days",
      "registry_ref": 95,
      "old_value": null,
      "new_value": 730,
      "actor": { "id": "…", "name": "Asha Rao", "role": "hr" },
      "reason": null,
      "source": null,
      "request_id": "…",
      "audit_source": "document_audit_logs"
    }
  ],
  "next_cursor": "eyJ2IjoxLCJ0Ijoi…",   // or null
  "unavailable_sources": [ { "table": "payroll_audit_logs", "reason": "READ_FAILED" } ],
  "meta": { "sources_read": 3, "sources_unavailable": 0, "returned": 50 }
}
```

There is **no `ETag`** on this endpoint (history is append-only and unbounded). Cache header is
`private, max-age=0, must-revalidate`, same as the other read endpoints.

---

## ⚠️ Five client obligations and caveats — read before integrating

### 1. `next_cursor === null` is the **only** end-of-history signal

**A page can be shorter than `limit` and still have more.** Two mechanisms shorten a page:
no-op audit rows are dropped, and the merge across three sources withholds items it cannot yet
prove are complete. **Do not stop paging on a short page** — stop only when `next_cursor` is
`null`. To page, send the previous response's `next_cursor` back verbatim as `?cursor=`.

### 2. `source` is populated **only** for organization-profile (ledger) rows

The payroll and document audit tables have no `source` column. Rows sourced from them always
report `source: null` — never a guessed value. **Consequence:** filtering `?source=…` returns
**only** ledger rows (the `billing.notifications` group); the two audit-table sources are
excluded by construction, because a column they do not have cannot match.

### 3. `actor.role` is populated **only** for ledger rows

Same reason as `source`. For a payroll/document row, `actor.role` is `null`. We deliberately do
**not** resolve the actor's *current* role and present it as the role at change time — that
would be a plausible-looking lie. `actor.name` is a best-effort display name and may be `null`
for a deleted user; `actor.id` is the stable attribution.

### 4. `reason` is **not retained** for stores 1–4 today

The gateway now **collects** a `reason` on high-risk writes, but only the organization-profile
ledger persists it; the four JSONB-store owners do not yet store it. For payroll / statutory /
document / branding rows, `reason` is `null` in history even when one was supplied at write time.

### 5. Coverage is **org-singleton settings only** (138 keys / 5 stores)

History covers the 138 org-level setting keys. It does **not** cover per-record / targeted
writes (per-employee leave, attendance, org structure) — those are unaudited today and are a
separate effort. For `document_settings`, the recorded `new_value` is the **submitted**
(post-validation) value, not necessarily the stored one; the other stores record the stored
value.

---

## Partial availability and errors

- **Partial source failure is a `200`,** not a failure: the failing table appears in
  `unavailable_sources[]` and `meta.sources_unavailable`, the rest of the page is returned.
  Only when **every** queried source fails do you get `503 SETTINGS_HISTORY_UNAVAILABLE`.
- A `503 ENTITLEMENT_DEPENDENCY_FAILURE` (the subscription store is down) **propagates
  unchanged** — it is never flattened into an upsell `403`.
- A **targeted** filter (`?group=` or `?setting_key=`) on a group your plan does not include →
  `403 FEATURE_NOT_AVAILABLE`. A broad query simply omits those groups silently.

Full error register and the endpoint contract: `public/md_settings/combined_api_analysis.md`
and `public/md_settings/phases/phase3_implementation_plan.md` §10.

---

## Implementation note for reviewers (not a client concern)

The keyset cursor keys on `date_trunc('milliseconds', created_at)`, not on raw `created_at`.
Postgres stores microsecond precision but the pg driver truncates to milliseconds when it hands
a `Date` to JS, so a literal `created_at = :t` predicate would miss rows — and a single two-key
write produces two ledger rows at the identical transaction timestamp, which must not be split
across a page boundary. This is a deliberate, documented refinement of the plan's literal
predicate (§10.3); ordering, the cursor predicate and the in-memory merge all compare at
millisecond granularity.
