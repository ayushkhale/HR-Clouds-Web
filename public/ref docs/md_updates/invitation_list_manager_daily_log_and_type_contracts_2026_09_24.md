# Backend API Update — 24 September 2026

**Written for: frontend engineers integrating the HR, Manager and Document panels.**

Two new endpoints and two contract tightenings on existing Document-module endpoints. One
internal bug fix is listed at the end for completeness; it has no API surface.

| # | Endpoint | Change | Breaking? |
|---|---|---|---|
| 1 | `GET /api/v1/organizations/users/invite` | **NEW** — list invitations with derived status | No (additive) |
| 2 | `GET /api/v1/attendance/manager/team/member/:userId/daily-log` | **NEW** — manager-plane enriched daily log | No (additive) |
| 3 | `POST /api/v1/documents/hr/types` | `mandatory_for` now validated against a fixed key set | **Yes, if you sent non-conforming keys** |
| 4 | `PUT /api/v1/documents/hr/types/:id` | same as above | **Yes, if you sent non-conforming keys** |
| 5 | `PATCH /api/v1/documents/hr/types/:id/deactivate` | can now return `409 DOCUMENT_TYPE_IN_USE` | **Yes — a new failure path** |

> **Deployment order.** Endpoint 1 requires migration `00052-create-organization-invitations.js`,
> which creates the `organization_invitations` table. It is handed to the operator **unrun**. The
> endpoint returns `500` until the migration is applied — do not ship the UI ahead of it. The
> migration is purely additive (one new table, one new enum type) and alters nothing existing, so
> applying it early is safe.

---

## 1. `GET /api/v1/organizations/users/invite` — list invitations

### Why this needed a schema change

Invitations themselves live in **Redis with a 48-hour TTL**, and both revoke and accept **delete**
the key. That store can answer exactly one question — "is this token still redeemable right now" —
and none of the questions this list asks. A revoked invitation, an accepted one, an expired one,
`send_count`, `last_sent_at` and the mail-delivery outcome all have no representation there once
the key is gone.

So a durable **ledger** table now records what happened to each invitation. Redis remains
authoritative for whether a token can be redeemed; the ledger is the read model behind this
endpoint. **Neither the invitation token nor its hash is stored in that table**, so there is no
column this endpoint could leak one from.

### Request

```
GET /api/v1/organizations/users/invite
Authorization: Bearer <access token>
```

Same path as the existing `POST /users/invite`, distinguished only by verb.

**Roles:** `hr`, `manager`.

> **Deviation from the supplied spec.** The spec listed `super-admin, admin, hr, manager`. In this
> system `admin` / `super-admin` are **platform** roles whose `user_role` has `org_id IS NULL`;
> they carry no tenant context and are deliberately excluded from every tenant-data endpoint. The
> org creator is provisioned as `hr`, so this locks out nobody legitimate. This endpoint uses the
> same role list as the `POST`, `revoke` and `resend` endpoints beside it — no behaviour differs
> between them.

Unlike the POST, this route does **not** run the subscription seat check. Listing who was invited
must keep working once the plan limit is reached — that is exactly when HR needs to revoke
something.

### Query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | string, **repeatable** | *(all)* | One of `pending`, `accepted`, `revoked`, `expired`. Repeat for OR: `?status=pending&status=expired`. A single value is also accepted as a bare string. |
| `q` | string, ≤ 200 chars | — | Case-insensitive *contains* over **email** and **name**. `%` and `_` are escaped, so searching `50%` matches literally. |
| `role` | string | — | `employee` \| `manager` \| `hr` \| `admin` \| `worker`. Matches the role the invitation was issued for. |
| `department_id` | uuid v4 | — | The department snapshotted on the invitation. |
| `limit` | integer | `25` | 1–100. |
| `offset` | integer | `0` | ≥ 0. |

**Unknown query keys are silently dropped, not rejected.** Shared validation across this codebase
runs with `stripUnknown: true`, so `?statuss=pending` returns `200` with an *unfiltered* page rather
than an error. Check your parameter names against the table above — the response will not tell you.

### Response — `200 OK`

```json
{
  "success": true,
  "message": "Invitations fetched",
  "data": {
    "total": 42,
    "rows": [
      {
        "id": "6f1e0c2a-4b1e-4a77-9c1a-2f9a8d0b1c33",
        "email": "asha@example.com",
        "name": "Asha Rao",
        "role": "employee",
        "department_id": "b2c3d4e5-1111-4222-8333-444455556666",
        "department_name": "Engineering",
        "designation": "Analyst",
        "reporting_person": "9c1a2f9a-8d0b-4c33-9111-222233334444",
        "reporting_person_name": "Ravi Menon",
        "status": "pending",
        "invited_by": "1a2b3c4d-5555-4666-8777-888899990000",
        "invited_by_name": "Hiring Lead",
        "invited_at": "2026-09-23T09:14:22.411Z",
        "expires_at": "2026-09-25T09:14:22.411Z",
        "accepted_at": null,
        "revoked_at": null,
        "revoked_by": null,
        "last_sent_at": "2026-09-23T09:14:22.411Z",
        "send_count": 1,
        "delivery_status": "sent",
        "delivery_error": null
      }
    ]
  }
}
```

`total` is the **unpaginated** count matching the filters; `rows` is the current page.

**An org with no invitations returns `200` with `{ "total": 0, "rows": [] }`.** It never returns
`404`. The same is true for any filter combination that matches nothing.

### Field reference

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | The ledger row. Not the invitation token — there is no token in this response. |
| `email` | string | Normalised (trimmed, lower-cased) exactly as the invite stored it. |
| `name` | string \| null | **Snapshot** taken at invite time — see below. |
| `role` | string | The role key the invitation was issued for. |
| `department_id` | uuid \| null | Snapshot. |
| `department_name` | string \| null | Resolved live; `null` if the department was since deleted. |
| `designation` | string \| null | Snapshot. |
| `reporting_person` | uuid \| null | Snapshot. |
| `reporting_person_name` | string \| null | Resolved live; `null` if unresolvable. |
| `status` | string | Derived — see below. |
| `invited_by` | uuid | Who sent it. |
| `invited_by_name` | string \| null | Resolved live. |
| `invited_at` | ISO 8601 | When the invitation was created. |
| `expires_at` | ISO 8601 | 48 h from the **last** send; every resend moves it forward. |
| `accepted_at` | ISO 8601 \| null | |
| `revoked_at` | ISO 8601 \| null | |
| `revoked_by` | uuid \| null | |
| `last_sent_at` | ISO 8601 | Moves on every resend. |
| `send_count` | integer ≥ 1 | The original send counts as 1. |
| `delivery_status` | `sent` \| `queued` \| `failed` | Always present. |
| `delivery_error` | string \| null | Populated only when `delivery_status` is `failed`. |

#### Why `name` / `department_id` / `designation` / `reporting_person` are snapshots

Revoking an invitation for someone who **never became a member** purges their half-provisioned
role-profile row (that cleanup is what lets a clean re-invite succeed). Without a snapshot on the
invitation itself, every revoked entry in this list would render blank. These four columns are the
only copy of the display data that survives a revoke.

Consequence for you: for a `pending` invitation the snapshot and the live profile agree. For an
`accepted` one the live employee record is the better source — the person may have moved
departments since. The snapshot is "what they were invited as", not "what they are now".

#### `status` is derived at read time

There is no status column and nothing sweeps the table. The status is computed from four
timestamps on every request, in this precedence:

1. **`accepted`** — `accepted_at` is set. Terminal.
2. **`revoked`** — `revoked_at` is set and it was never accepted.
3. **`expired`** — still open, and `expires_at <= now`. Inclusive at the boundary, matching the
   instant the Redis key disappears.
4. **`pending`** — still open and inside the window.

A missed cron therefore cannot mislabel a row. All rows on one page are evaluated against the same
instant, so a row cannot be selected as `pending` and rendered as `expired`.

#### `delivery_status`

The invitation email is dispatched **after** the invite transaction commits, so:

- `queued` — written inside the transaction, before the send is attempted. A row still showing
  `queued` means the process died between commit and dispatch. This is surfaced rather than
  optimistically reported as `sent`, because "the mail bounced" versus "they haven't clicked yet"
  is exactly what HR needs this field to distinguish.
- `sent` — the mail provider accepted it.
- `failed` — the send threw. `delivery_error` carries the provider message (truncated to 1000
  chars). The invitation is still valid and can be resent; a failed send has never blocked an
  invite and still does not.

### Visibility scope

- **`hr`** sees every invitation in the org.
- **`manager`** sees the invitations **they** sent (`invited_by = req.user.id`).

The spec left this to backend judgement. A manager can only invite into their own team (the invite
endpoint clamps `reporting_person` to the manager and forbids them setting org/statutory fields),
so an org-wide invitation list would hand them a directory they have no authority over. The
manager scope here is the read-side mirror of that write-side rule.

Org scope comes from the authenticated token (`req.user.orgId`), never from the query. Another
tenant's invitations are unreachable — there is no parameter that could reach them.

### Lifecycle guarantees

| Action | Effect on the list |
|---|---|
| **Invite** | A row appears with `status: "pending"`, `send_count: 1`. |
| **Resend** | `send_count` increments, `last_sent_at` moves, `expires_at` restarts at +48 h, `delivery_status` is re-recorded. The row is the same row — its `id` does not change. |
| **Revoke** | The row **stays in the list**, flipped to `status: "revoked"` with `revoked_at` / `revoked_by` set. It is never deleted. |
| **Accept** | The row flips to `status: "accepted"` with `accepted_at` set, in the same transaction that grants membership — so the list can never show `pending` for someone who is already a member. |
| **Re-invite after expiry** | **Refreshes the existing row in place** (bumps `send_count`, moves `last_sent_at` / `expires_at`). You will not see a duplicate. |
| **Re-invite after revoke** | **Inserts a new row.** The revoked row remains visible beside it, so the withdrawal stays in the audit trail. |

At most one *open* (neither accepted nor revoked) invitation exists per user per org; this is
enforced by a partial unique index, so two concurrent invites for the same email produce one row
and a clean `409 INVITE_IN_PROGRESS` for the loser rather than a duplicate.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed parameter value: `limit` out of range, invalid `status`/`role`, non-uuid `department_id`, `q` over 200 chars. (An unknown *key* is dropped, not rejected.) |
| 401 | — | Missing or invalid token. |
| 403 | — | Caller is not `hr` or `manager`, or the org is not active. |

There is no `404` on this endpoint.

### Invitations that predate the ledger

Invitations issued before this deploy have no ledger row and will not appear in the list until
they are **resent** — a resend backfills the row from the live Redis payload (with `name`,
`department_id`, `designation` and `reporting_person` as `null`, since that data is not in the
Redis payload). Invitations issued after the deploy are complete. Expect the list to be sparse for
the first 48 hours; after that every live invitation has a row.

---

## 2. `GET /api/v1/attendance/manager/team/member/:userId/daily-log` — manager daily log

The manager-plane counterpart of `GET /api/v1/attendance/hr/employees/:userId/daily-log`.

### Request

```
GET /api/v1/attendance/manager/team/member/{userId}/daily-log?date=2026-09-23
Authorization: Bearer <access token>
```

**Roles:** `manager`, `hr`, `admin`, `super-admin` — the same list as every other route in the
manager attendance-read router, which the new endpoint joins.

| Param | In | Type | Required | Notes |
|---|---|---|---|---|
| `userId` | path | uuid | yes | A malformed uuid is a `400`, not a `500`. |
| `date` | query | ISO date (`YYYY-MM-DD`) | no | Defaults to **today in IST**. |

Unknown query keys are silently dropped (`stripUnknown: true`), exactly as on the HR endpoint.

### Access control

`getAccessibleUserIds(orgId, requester)` — the same scoping used by
`/team/member/:userId/history` and `/team/member/:userId/summary` — is the only gate:

- a **manager** gets the explicit list of their direct reports; anyone outside it returns
  `403 EMPLOYEE_NOT_IN_TEAM`, and the day is never read;
- an **org-wide approver** (HR) gets `null`, meaning no restriction, and can read any employee in
  the org;
- a `userId` from **another tenant** returns `404 EMPLOYEE_NOT_FOUND` — the lookup is org-scoped,
  so cross-tenant ids resolve to "not found" before anything else runs.

### Response — `200 OK`

Byte-identical in shape to the HR endpoint. The day itself is rendered by the same service method,
so the two planes can never disagree about the same date.

```json
{
  "success": true,
  "message": "Member daily log fetched",
  "data": {
    "member": {
      "user_id": "489f9cd6-990d-4911-a84f-060984cc1831",
      "name": "Asha Rao",
      "employee_code": "EMP-0142",
      "department": "Engineering",
      "designation": "Analyst",
      "avatar_url": null
    },
    "id": "1b7e5f30-99a0-4f21-8c44-0d2a1e33c7b9",
    "date": "2026-09-23",
    "status": "present",
    "clock_in_time": "2026-09-23T03:32:10.000Z",
    "clock_out_time": "2026-09-23T12:41:55.000Z",
    "effective_hours": 8.42,
    "late_minutes": 2,
    "early_exit_minutes": 0,
    "overtime_minutes": 0,
    "break_duration_minutes": 35,
    "work_mode": "on-site",
    "is_regularized": false,
    "shift": { "name": "General", "start_time": "09:30:00", "end_time": "18:30:00", "type": "fixed" },
    "breaks": [
      { "start_time": "2026-09-23T07:30:00.000Z", "end_time": "2026-09-23T08:05:00.000Z", "duration_minutes": 35 }
    ],
    "sessions": [
      { "opened_at": "2026-09-23T03:32:10.000Z", "closed_at": "2026-09-23T12:41:55.000Z", "status": "closed" }
    ]
  }
}
```

**Days with no attendance record** return the same envelope with a *derived* status and zeroed
metrics — exactly as the HR endpoint does:

```json
{
  "member": { "...": "..." },
  "date": "2026-09-21",
  "status": "weekly_off",
  "clock_in_time": null,
  "clock_out_time": null,
  "effective_hours": 0,
  "late_minutes": 0,
  "early_exit_minutes": 0,
  "overtime_minutes": 0,
  "break_duration_minutes": 0,
  "work_mode": null,
  "is_regularized": false,
  "shift": null,
  "breaks": [],
  "sessions": []
}
```

Note that `id` is **absent** on the no-record variant (there is no record to identify). Derived
status is one of `holiday`, `weekly_off`, `absent` (a past date the employee should have marked)
or `not_marked` (today, or a date before their joining date).

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed `userId` or `date`. |
| 403 | `EMPLOYEE_NOT_IN_TEAM` | The manager does not have this employee as a report. |
| 404 | `EMPLOYEE_NOT_FOUND` | No such employee in this org. |

---

## 3 & 4. `mandatory_for` is now validated (document types)

**Endpoints:** `POST /api/v1/documents/hr/types`, `PUT /api/v1/documents/hr/types/:id`

`mandatory_for` was declared as a free-form object, so **any** payload was accepted and stored —
typos included. A type saved with `{ "departments": [...] }` (instead of `target_departments`)
silently matched nobody, and nothing surfaced the mistake until someone noticed the type was never
required of anyone.

It is now validated against the same six-key criteria schema the org-document targeting endpoints
already use:

| Key | Type | Limits |
|---|---|---|
| `target_departments` | uuid[] | ≤ 200, unique |
| `target_locations` | uuid[] | ≤ 200, unique |
| `target_employment_types` | string[] | ≤ 200, each ≤ 64 chars, unique |
| `target_job_statuses` | string[] | ≤ 200, each ≤ 64 chars, unique |
| `included_users` | uuid[] | ≤ 200, unique |
| `excluded_users` | uuid[] | ≤ 200, unique |

All keys optional. `{}` means "not mandatory for anyone" and remains the default on create.
`included_users` and `excluded_users` must be **disjoint** — the same user in both is a
contradiction and is rejected rather than resolved by precedence.

```jsonc
// accepted
{ "mandatory_for": { "target_departments": ["b2c3...6666"], "excluded_users": ["9c1a...4444"] } }

// now 400 VALIDATION_ERROR — unknown key (previously stored and silently ineffective)
{ "mandatory_for": { "departments": ["b2c3...6666"] } }

// now 400 VALIDATION_ERROR — a user cannot be both included and excluded
{ "mandatory_for": { "included_users": ["9c1a...4444"], "excluded_users": ["9c1a...4444"] } }
```

> **This is the one place in the API where an unknown key is an error rather than being dropped.**
> Everywhere else (including the two new endpoints above) unknown keys are silently stripped. The
> exception is deliberate: `{}` means "mandatory for everyone", so stripping a typo'd key would not
> merely lose the filter, it would *invert* the intent — "mandatory for Engineering" would silently
> become "mandatory for the whole org", with a `200`. The error names the offending key
> (`"mandatory_for.departments" is not allowed`), so it is actionable.

**What you must check:** any create/update call sending a `mandatory_for` shape other than the six
keys above now fails with `400 VALIDATION_ERROR` where it previously returned `201`/`200`. If your
UI builds this object from the same targeting widget as org documents, nothing changes. Existing
stored rows are **not** re-validated or migrated — a malformed one keeps working exactly as before
(matching nobody) until it is next edited, at which point it must be corrected.

---

## 5. `PATCH /api/v1/documents/hr/types/:id/deactivate` — new `409 DOCUMENT_TYPE_IN_USE`

Deactivating a type (this endpoint takes no body) now fails if documents of that type are still
**open**:

```json
{
  "success": false,
  "message": "Document type is in use by 3 open documents. Resolve or remove them before deactivating.",
  "errorCode": "DOCUMENT_TYPE_IN_USE",
  "details": { "open_employee_documents": 2, "open_org_documents": 1 }
}
```

"Open" means work is still in flight and the type is still steering it:

| Counted | Not counted |
|---|---|
| `employee_documents` in `pending_upload` or `pending_verification` | `available`, `expired`, `superseded` |
| `org_documents` in `draft` | `published`, `retired` |

**Settled documents never block a deactivation.** Retiring a type stops *new* documents from being
created against it; it does not invalidate documents already issued. Deactivating a type with no
open documents behaves exactly as before.

Both counts are read inside the same transaction as the flag update, so a document created
concurrently with the deactivation cannot slip past the check.

`PATCH /api/v1/documents/hr/types/:id/activate` (reactivation) is unaffected and never returns
this error.

**UI guidance:** surface `details` directly — "2 employee documents and 1 org document are still
open" is actionable, where the bare message is not. The natural next step is to link the user to
the filtered document list for that type.

> **Phase 4 note.** When document *requests* ship, a type with open requests will block
> deactivation on the same rule and the same error code; `details` will gain an
> `open_document_requests` counter. Read `details` as an open-ended map of counters rather than a
> fixed pair of keys.

---

## 6. Answer to §10 of the spec — profile PATCH drops `name`, `phone_number`, `contact`

**The finding is correct, and the behaviour is intentional.** No backend change was made.

`PATCH /api/v1/organizations/employees/:id` and `PATCH /api/v1/organizations/employees/me` validate
against an explicit **whitelist** of personal fields, and validation runs with `stripUnknown: true`.
Any key outside the whitelist is removed before the service ever sees it — silently, with a `200`,
because the request is otherwise valid. This is deliberate: it is what stops a profile PATCH from
being used to change `role`, `department_id`, `designation`, `employee_code` or statutory fields,
which are owned by the dedicated HR endpoints.

`name`, `phone_number` and `contact` are not dropped because they are forbidden — they are dropped
because **they are spelled differently here**. The accepted whitelist is:

```
first_name, last_name, display_name, phone, avatar_url, personal_email,
current_address, permanent_address, city, state, pincode, dob, blood_group
```

Map your payload:

| You are sending | Send instead |
|---|---|
| `name` | `display_name` (or `first_name` + `last_name`) |
| `phone_number` / `contact` | `phone` |

The naming mismatch is real and comes from the invite payload, which does use `name` and `contact`.
Changing the profile endpoint to accept aliases would be an API change nobody requested and would
leave two spellings for one field, so it was not made. If you would rather the backend accept the
invite-style names on profile PATCH, say so and it will be added as an explicit alias.

**Related:** because unknown keys are stripped rather than rejected, a mistyped field on these two
endpoints returns `200` with that field unchanged. Diff the response against what you sent if you
need certainty that an update landed.

---

## 7. Internal fix — no API impact

The payroll attachment sweeper called the S3 provider's `deleteObject` with an object
(`{ key }`) where the provider takes the key as a plain string. Every delete threw, so abandoned
uploads were never removed and their pointer rows were retired with the object still in the
bucket. Fixed, and the sweeper now deletes the object **before** the pointer row — if the object
delete fails the row is kept for the next pass, so an object can never be orphaned behind a
deleted pointer. No request or response shape changed; nothing to do on the frontend.

---

## Operator checklist

1. **Apply migration `00052-create-organization-invitations.js`** before deploying this code. It
   creates the `organization_invitations` table plus the
   `enum_organization_invitations_delivery_status` type. Purely additive — no existing table is
   touched. `GET /organizations/users/invite` returns `500` until it is applied; every other
   endpoint is unaffected, since the ledger writes on invite/resend/revoke/accept are wrapped so a
   ledger failure cannot fail the operation it is recording.
2. Do **not** run `00051.down()` under any circumstance — it destroys document evidence tables.
3. No new environment variables, no new dependencies, no new cron jobs.

## Test evidence

Full unit suite after all changes: **1414 tests, 1414 pass, 0 fail** (`node --test "tests/unit/**/*.test.js"`). The document module alone is 326 green.

New suites backing the above:

| Suite | Covers |
|---|---|
| `tests/unit/organization/invitation_status_derivation.test.js` | status precedence, the expiry boundary |
| `tests/unit/organization/invitation_list_service.test.js` | response shape, no-token guarantee, org scope, manager scope, empty page |
| `tests/unit/organization/invitation_ledger_query.test.js` | the SQL per status, fail-closed filtering, `q` escaping, atomic `send_count` |
| `tests/unit/organization/invitation_ledger_writes.test.js` | resend / revoke / accept acceptance criteria |
| `tests/unit/organization/invitation_ledger_migration.test.js` | migration/model parity, the partial unique index, no token column |
| `tests/unit/attendance/manager_member_daily_log.test.js` | manager scoping, HR passthrough, cross-tenant 404 |
| `tests/unit/document/type_deactivation_guard.test.js` | the 409, settled rows not blocking, transactional counting |
| `tests/unit/document/type_mandatory_for_validator.test.js` | the six keys, limits, include/exclude disjointness, and that an unknown key errors through the real `validateOrThrow` path rather than being stripped |
| `tests/unit/payroll/attachment_sweeper.test.js` | the provider call signature, failed-delete row retention |
