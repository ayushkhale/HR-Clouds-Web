# Backend change record — 2026-10-03

## Letter activation now activates its document type, and document requests go bulk

Two changes, both in the **Documents** module. One is additive-with-a-new-field, one is
two brand-new endpoints. **Nothing is removed and no existing field changes type or
meaning**, so an unchanged frontend keeps working — but there is one **action required**
item (§1.5) and one new screen's worth of API (§2).

| # | Change | Endpoints touched | Breaking? |
|---|---|---|---|
| 1 | Enabling a letter template activates the org document type it issues into | `#135`, `#136`, `#137` (additive response fields) | No |
| 2 | Bulk "request documents from employees" | `#240` (HR), `#241` (manager) — **new** | No (new) |
| 3 | A document request is refused for an **org-plane** type | `#80`, `#93` (new `422`), `#240`, `#241` | See §2.8 |

No migration. No new org setting. No new dependency.

---

# 1. Enabling a letter now activates its document type

## 1.1 What was wrong

The "What we issue" screen writes `PUT /api/v1/documents/hr/letter-templates/:code/config`
with `is_enabled: true`. That only flipped a flag on the letter *config*.

Separately, every generated letter is filed as an org document of a specific **document
type** (`experience_letter_issued`, `relieving_letter_issued`, …). If HR had not *also*
activated that type on the Document Types screen, then:

- the toggle looked on,
- the preview (`#138`) rendered fine,
- and the actual issue (`POST /hr/letters`, `#139`) failed with
  `409 DOCUMENT_TYPE_NOT_ACTIVATED`.

That failure is undiagnosable from the screen HR was on.

## 1.2 What happens now

`is_enabled: true` on `#137` **also activates (or reactivates) the mapped document type
for that organization, in the same database transaction as the config row.** Either both
land or neither does.

Switching a template **off does NOT deactivate the type**, deliberately: letters already
issued, their acknowledgements and their retention obligations all point at that type.
(The type-deactivation endpoint already refuses while any of that is open.) Activation
here is one-way.

## 1.3 `#137` response — additive `document_type` block

`PUT /api/v1/documents/hr/letter-templates/:code/config`

```jsonc
{
  "success": true,
  "message": "Template configuration saved",
  "data": {
    "config": {                       // unchanged
      "is_enabled": true,
      "pinned_version": null,
      "saved_fields": { "place_of_issue": "Pune" }
    },
    "document_type": {                 // NEW — null when is_enabled was false
      "code": "experience_letter_issued",
      "document_type_id": "7c1f…",     // null when nothing could be activated
      "is_active": true,               // the only field the UI needs to branch on
      "activated_now": true,           // true only if THIS call changed it
      "state": "activated"
    }
  }
}
```

`document_type` is `null` whenever the request had `is_enabled: false` (nothing was
touched). Otherwise `state` is one of:

| `state` | `is_active` | Meaning | What the UI should do |
|---|---|---|---|
| `activated` | `true` | Type created and activated by this call | Nothing — success |
| `reactivated` | `true` | Type existed but was off; turned back on | Nothing — success |
| `already_active` | `true` | Type was already live | Nothing — success |
| `catalog_missing` | `false` | The platform catalog has no row for this code — a seeder has not been run in this environment | **Show a warning**: the letter is enabled but cannot be issued yet; this is an ops task, not an HR one |
| `catalog_inactive` | `false` | The platform retired that catalog entry | Same warning |
| `plane_mismatch` | `false` | A different document type in this org already owns that code on another plane | Same warning; needs a backend/ops look |

**Why a warning and not an error:** refusing the whole save would make some letter
templates impossible to enable for a reason HR cannot fix (an unrun seeder). The save
succeeds and the response tells you issuance will not work yet.

So the rule for the UI is simply:

```js
if (data.document_type && data.document_type.is_active === false) showIssuanceWarning(data.document_type.state)
```

## 1.4 `#135` / `#136` — additive read fields

So the toggle list can render the real state without a second round-trip.

`GET /api/v1/documents/hr/letter-templates` (`#135`) — each item in `templates[]` gains:

```jsonc
{
  "code": "experience_letter",
  "title": "Experience Letter",
  "current_version": 1,
  "is_enabled": true,
  "pinned_version": null,
  "has_saved_fields": true,
  "is_orphaned": false,
  "document_type_code": "experience_letter_issued",   // NEW (null when is_orphaned)
  "document_type_active": true                        // NEW
}
```

`GET /api/v1/documents/hr/letter-templates/:code` (`#136`) gains a sibling of
`template` / `config`:

```jsonc
{
  "template": { "...": "unchanged" },
  "config":   { "...": "unchanged, still null when never configured" },
  "document_type": {                                  // NEW, never null
    "code": "experience_letter_issued",
    "document_type_id": "7c1f…",   // null if never activated
    "is_active": true
  }
}
```

`document_type_active` is `true` only when the org has an **active, org-plane** type with
that code. Both endpoints are readable by `hr` and by `manager` (unchanged).

### The one state worth rendering

`is_enabled: true` **and** `document_type_active: false` ⇒ this letter will fail at issue
time. Recommended: a small warning badge on that row. This is the only combination that
needs attention; every other combination is normal.

## 1.5 ⚠️ Action required — pre-existing rows are not healed retroactively

A template that was **already** enabled before this change, whose type was never
activated, stays broken until someone re-saves it. There is no automatic backfill (a
read endpoint must not write).

Either is fine:

- **Frontend/HR:** re-save the toggle for any row showing `is_enabled: true` +
  `document_type_active: false` (re-sending `is_enabled: true` is safe and idempotent —
  it returns `already_active` if nothing was needed), **or**
- **Ops:** call the existing `POST /api/v1/documents/hr/types/activate` once with the
  affected `document_type_code`s.

Surfacing §1.4's warning badge makes this self-service.

---

# 2. Bulk document requests — `#240` / `#241` (NEW)

## 2.1 What exists today

| Endpoint | Shape |
|---|---|
| `#80` `POST /hr/employees/:userId/document-requests` | one employee, **one** type |
| `#81` `POST /hr/employees/:userId/document-requests/bulk-from-checklist` | **one** employee, every outstanding checklist type |
| `#93` `POST /manager/employees/:userId/document-requests` | one report, one type |

There was no way to ask **many employees** for documents in one call.

## 2.2 The new endpoints

```
POST /api/v1/documents/hr/document-requests/bulk            #240   roles: hr
POST /api/v1/documents/manager/document-requests/bulk       #241   roles: manager, hr
```

Both require the `documents.access` feature (same as every sibling route).

### Request

```jsonc
{
  "user_ids": ["<uuid>", "<uuid>", "..."],            // required, 1..200, must be distinct
  "document_type_ids": ["<uuid>", "..."],             // required, 1..10,  must be distinct
  "due_on": "2026-10-20",                             // optional, YYYY-MM-DD
  "note": "Please upload before your first payroll"   // optional, max 1000 chars
}
```

- The unit of work is the **cross product**: `user_ids × document_type_ids`.
- `user_ids.length × document_type_ids.length` must be **≤ 500** (`#2.6`).
- **A repeated id in either array is rejected** (`400`) rather than silently collapsed —
  otherwise the response counts would not match what you sent.
- `due_on` must not be in the past and must be within 365 days (same rule as `#80`).
  Omitted ⇒ derived once from the org setting `document_request_default_due_days`, and
  **every** pair in the batch gets that same date.
- `note` is applied to every created request.

### Response — `201 Created`, always a ledger

```jsonc
{
  "success": true,
  "message": "Bulk requests processed",
  "data": {
    "summary": {
      "users": 3,            // distinct employees asked
      "document_types": 2,   // distinct types asked
      "pairs": 6,            // users × document_types = the work attempted
      "created": 4,
      "skipped": 2,
      "failed": 0
    },
    "due_on": "2026-10-20",  // the one date applied to the whole batch
    "created": [
      { "request_id": "…", "user_id": "…", "document_type_id": "…", "due_on": "2026-10-20" }
    ],
    "skipped": [
      { "user_id": "…", "document_type_id": "…", "reason": "document_already_present" }
    ],
    "failed": [
      { "user_id": "…", "document_type_id": "…", "error_code": "REQUEST_FAILED", "message": "…" }
    ]
  }
}
```

**`201` with `created: []` is a valid, successful response.** It means every pair was
skipped — most commonly because the employees already hold those documents or already
have an open request. Do not treat it as an error; render the ledger.

`created.length + skipped.length + failed.length === summary.pairs` always holds.

## 2.3 `skipped.reason` vocabulary

| `reason` | Meaning | Suggested copy |
|---|---|---|
| `user_not_found` | Not an active, non-deleted employee of this org (includes an id from another org) | "No longer an active employee" |
| `document_already_present` | They already hold a live document of that type (`available` or `pending_verification`). An **expired** one does *not* block — that is exactly what a request replaces | "Already on file" |
| `already_requested` | An `open`/`overdue` request for that pair already exists | "Already requested" |
| `document_type_inactive` | The type was deactivated while the batch was running (a race) | "Document type was switched off" |

`failed` carries `error_code` / `message` for an unexpected per-employee fault (a
transient database error). It is normally empty. Those pairs were **not** created and are
safe to re-send.

## 2.4 Errors that fail the WHOLE call (nothing is written)

The split is deliberate: **your payload** failing is an error; **an employee's
circumstances** are a ledger row.

| Status | `errorCode` | When | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Bad uuid, repeated id, over a per-array cap, past/too-far `due_on` | Joi message |
| `403` | `FORBIDDEN` | Caller is not `hr`/`manager`; or a **manager** named any employee outside their reporting cohort | — |
| `403` | `TYPE_NOT_REQUESTABLE` | A **manager** asked for a type whose policy forbids manager requests | `{ document_type_id }` |
| `404` | `DOCUMENT_TYPE_NOT_FOUND` | A `document_type_id` does not exist in this org | `{ document_type_id }` |
| `409` | `DOCUMENT_TYPE_INACTIVE` | A named type is deactivated | `{ document_type_id }` |
| `422` | `REQUEST_BULK_TOO_LARGE` | The cross product exceeds the cap | `{ users, document_types, pairs, max_users, max_document_types, max_pairs }` |
| `422` | `DOCUMENT_TYPE_PLANE_MISMATCH` | A named type is **org-plane**, not `employee` — see §2.8 | `{ document_type_id }` |

### Manager scoping is all-or-nothing

If a manager names **one** employee outside their cohort, the **entire call** is
`403 FORBIDDEN` and nothing is written. An out-of-scope id and a non-existent id give the
identical response, so this leaks no information. Build the picker from the manager's own
team list and this never fires.

## 2.5 Safe to retry — important for the UI

The endpoint is **idempotent in effect**. A pair that already has an open request comes
back as `skipped: already_requested`, so re-sending the same body creates nothing new.

Consequences for the frontend:

- On a network error or timeout, **re-sending the same payload is safe**. Do not warn the
  user about duplicates.
- Work is committed **per employee**, not per call. If the request dies halfway, earlier
  employees are already asked (and notified) and later ones are not — re-sending
  completes the rest.
- Because of that, do not show an optimistic all-or-nothing success. Render
  `summary` + the three lists from the actual response.

## 2.6 Limits and timing

| Limit | Value |
|---|---|
| `user_ids` | 1 – 200 |
| `document_type_ids` | 1 – 10 |
| `users × types` (pairs) | **≤ 500** |

The pair cap is the one that matters — every pair is a row, an audit entry and an email
notice. A 500-pair call runs sequentially and can take a few seconds; the production proxy
read timeout is 120 s, so it fits comfortably, but **show a busy state and disable the
submit button** rather than letting the user double-fire (which is harmless but confusing).

Each created request sends the existing `document_request_raised` email to the employee,
subject to the org's `document_notify_request_raised` toggle — unchanged behaviour,
just more of it.

## 2.7 What is unchanged

`#80`, `#81`, `#93` keep their exact request and response shapes. The rows `#240`/`#241`
create are ordinary document requests: they appear in `#82` / `#94` / `#97` lists, are
cancellable via `#84` / `#95`, remindable via `#85`, auto-fulfil on upload, and go overdue
on the usual cron. Their audit rows carry `bulk: true` (siblings of `#81`'s
`from_checklist: true`).

---

## 2.8 ⚠️ Only `plane: "employee"` types can be requested — affects `#80` / `#93` too

A document request asks the **employee to upload something**. An **org-plane** type is a
document the *org* holds — including the types the letter templates in §1 issue into. The
employee-side upload endpoint has always refused a non-employee-plane type with
`422 DOCUMENT_TYPE_PLANE_MISMATCH`, so a request raised against one could **never be
fulfilled**: the employee sees a task they cannot complete, and it goes `overdue` forever.

Change §1 makes this reachable for the first time at any scale — enabling a letter
template now activates its org-plane type, and those types appear in the **unfiltered**
`GET /hr/types` response that a type picker is usually built from. So the guard was added
to every request-create path:

| Endpoint | Before | Now |
|---|---|---|
| `#80` `POST /hr/employees/:userId/document-requests` | `201`, created an unfulfillable request | `422 DOCUMENT_TYPE_PLANE_MISMATCH` |
| `#93` manager equivalent | same | same |
| `#240` / `#241` bulk | would have created one per employee | `422`, whole call, `details.document_type_id` |

**What the frontend must do:** request **`?plane=employee`** when loading types for any
"request a document" picker:

```
GET /hr/types?plane=employee&is_active=true
```

`#81` (bulk-from-checklist) was never affected — it reads types through a query that is
already `plane: 'employee'`.

This is a **behaviour change on two existing endpoints**. It is only reachable with a
payload that was already broken, so a correct client sees no difference.

---

# 3. Bulk letter PDF generation — no code change, but read this

For completeness, because "bulk" came up in the same conversation: **bulk letter
issuance already exists** and was not modified.

```
POST /api/v1/documents/hr/letters/bulk       #143   create a batch (many subjects, one template)
GET  /api/v1/documents/hr/letters/bulk/:id   #144   poll progress
```

`#143` is gated by the server environment flag **`PDF_BULK_GENERATION_ENABLED`**. Unless
it is exactly `"true"`, `#143` returns:

```jsonc
{ "success": false, "message": "...", "errorCode": "PDF_BULK_GENERATION_DISABLED" }   // 503
```

Batches accepted earlier keep draining; only *creating* a new one is blocked. So if the
bulk-letters screen is returning `503`, that is the ops switch, not a bug — the flag has
to be turned on for the environment. Single-letter issuance (`#139`) is never gated.

---

# 4. Quick integration checklist

- [ ] **What-we-issue screen:** read `document_type_active` from `#135`; badge any row with
      `is_enabled: true` + `document_type_active: false`.
- [ ] **What-we-issue screen:** after `#137`, if `data.document_type?.is_active === false`,
      surface the `state` as a warning (the save itself still succeeded).
- [ ] **One-time:** re-save already-enabled templates showing the warning (§1.5).
- [ ] **New bulk-request screen:** multi-select employees + multi-select document types,
      optional shared due date and note; enforce ≤ 200 / ≤ 10 / ≤ 500 pairs client-side so
      the user gets the message before the round-trip.
- [ ] Render the `summary` + `created` / `skipped` / `failed` ledger; `201` with
      `created: []` is success, not failure.
- [ ] **Every document-type picker used for requesting** (`#80`, `#93`, `#240`, `#241`):
      load it with `?plane=employee&is_active=true`, or the new
      `422 DOCUMENT_TYPE_PLANE_MISMATCH` will fire on the letter types that §1
      activates (§2.8).
- [ ] Treat retry as safe; never block the user from re-sending.
- [ ] Manager screen: build the employee picker from the manager's own team so the
      all-or-nothing `403` cannot fire.
- [ ] If bulk letters `503` with `PDF_BULK_GENERATION_DISABLED`, raise it with ops.
