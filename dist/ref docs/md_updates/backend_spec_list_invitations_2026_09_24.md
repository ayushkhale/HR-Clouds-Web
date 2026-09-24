# SPEC — `GET /api/v1/organizations/users/invite` (list invitations)

**Requested:** 2026-09-24 · **Requested by:** frontend
**Closes:** gap **B5** (`ORG_MODULE_IMPLEMENTATION_REPORT.md` §5)
**Status:** frontend is built and waiting. The Invites screen ships now, calls this endpoint, and currently renders an "not available yet" state on the 404. **No frontend change is needed when this lands** — it fills itself in.

---

## 1. Why

There is no way to read invitations back. Verified on the dev API 2026-09-24 — all 404:

```
/organizations/invitations          404
/organizations/users/invite         404
/organizations/users/invitations    404
/organizations/invitations/list     404
/organizations/users?status=pending 404
/organizations/users/pending        404
```

And `GET /organizations/employees` returns only **provisioned** members (8 rows on the dev org, no `status` field), so invited-but-not-accepted people appear nowhere.

Consequences today: HR cannot see who has been invited, cannot tell accepted from pending, and can only revoke or resend invitations created in the current browser session — the moment the page reloads, those are gone.

---

## 2. Route

```
GET /api/v1/organizations/users/invite
```

Deliberately the **same path as the POST that creates an invitation**, differing only by verb — the invite surface stays one URL:

| Method | Path | Purpose |
|---|---|---|
| POST | `/organizations/users/invite` | create (exists) |
| **GET** | **`/organizations/users/invite`** | **list (this spec)** |
| POST | `/organizations/users/invite/revoke` | revoke (exists) |
| POST | `/organizations/users/invite/resend` | resend (exists) |

If a collection noun is preferred, `GET /organizations/users/invites` is an acceptable substitute — say so and the frontend changes one line. Everything else in this spec stands either way.

**Auth:** Bearer. **Roles:** `super-admin, admin, hr, manager` — the same set that may POST to `/users/invite`. Scope each caller to their own org via `req.user.orgId`.

> A manager can already send invitations, so a manager can already see the addresses they invited. Whether a manager should see invitations sent by **other** people is your call — if they should not, filter to `invited_by = req.user.id` for the `manager` role and say so in the response docs. HR sees the whole org either way.

---

## 3. Query parameters

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `status` | string or array | No | all | `pending` · `accepted` · `revoked` · `expired`. Repeatable (`?status=pending&status=expired`), matching how the Documents module already parses repeated keys. |
| `q` | string | No | — | Case-insensitive match on email **or** name. Max 200 chars. |
| `role` | string | No | — | `hr` · `manager` · `employee` |
| `department_id` | UUID | No | — | |
| `limit` | int | No | `25` | 1–100 |
| `offset` | int | No | `0` | |

Sort newest first (`invited_at DESC, id DESC`) so the most recent invitation is on page 1.

---

## 4. Response

Envelope and pagination shape match the module's other list endpoints.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "total": 42,
    "rows": [
      {
        "id": "6f1b2c33-6d4e-4f90-9a11-77c2b4e5a801",
        "email": "ravi@example.com",
        "name": "Ravi Kumar",
        "role": "manager",

        "department_id": "3870a72d-d090-4797-8822-c38563f90b40",
        "department_name": "Engineering",
        "designation": "Engineering Manager",
        "reporting_person": "71639be3-1a97-4408-8bac-5b8039336755",
        "reporting_person_name": "Alex Mathew",

        "status": "pending",

        "invited_by": "71639be3-1a97-4408-8bac-5b8039336755",
        "invited_by_name": "Alex Mathew",
        "invited_at": "2026-09-20T09:14:02.000Z",
        "expires_at": "2026-09-27T09:14:02.000Z",
        "accepted_at": null,
        "revoked_at": null,
        "revoked_by": null,

        "last_sent_at": "2026-09-22T11:02:41.000Z",
        "send_count": 2,
        "delivery_status": "sent",
        "delivery_error": null
      }
    ]
  }
}
```

### Field notes

| Field | Type | Null? | Notes |
|---|---|---|---|
| `id` | UUID | no | The invitation row, not the user. |
| `email` | string | no | |
| `name` | string | yes | As typed on the invite; null when only an email was given. |
| `role` | string | no | |
| `department_name` | string | yes | **Resolved server-side.** The UI has no department list on this screen, so an id alone renders as blank. Same for `reporting_person_name` and `invited_by_name`. |
| `status` | enum | no | See §5. |
| `expires_at` | ISO | yes | Null if invitations don't expire. The UI shows "Expires <date>" when present. |
| `accepted_at` | ISO | yes | Set when the invite was accepted. |
| `last_sent_at` | ISO | yes | Updated by resend. Shown as "resent <date>" when it differs from `invited_at`. |
| `send_count` | int | no | 1 on create, +1 per resend. Rendered as "Sent N times" when > 1. |
| `delivery_status` | enum | no | `sent` · `queued` · `failed`. See §6. |
| `delivery_error` | string | yes | Short human-readable reason when `failed` (e.g. `"mailbox does not exist"`). Shown verbatim to HR, so no stack traces. |

Never return the invitation **token** on this endpoint. It is a credential; listing it would let anyone who can read the list accept on someone else's behalf.

---

## 5. `status`

Four values, computed at read time so a cron that misses a run can't cause a wrong answer:

| Value | Condition |
|---|---|
| `accepted` | `accepted_at IS NOT NULL` |
| `revoked` | `revoked_at IS NOT NULL` |
| `expired` | not accepted, not revoked, and `expires_at < now()` |
| `pending` | everything else |

Precedence in that order — an invitation that was accepted and later expired reads as `accepted`.

---

## 6. `delivery_status` — the part that matters most

This is the one field that doesn't exist anywhere today, and it is the reason for a specific bug class: **an invitation can be perfectly valid while its email silently bounced.** The person is then waiting for something that never arrived, and HR has no way to know — the invite looks "pending", which is indistinguishable from "sent fine, not opened yet".

| Value | Meaning |
|---|---|
| `sent` | Handed to the mail provider and accepted by it. |
| `queued` | Not yet attempted, or a retry is pending. |
| `failed` | The provider rejected it, or it hard-bounced. |

If your mail path can't report this yet, **return `"sent"` for every row rather than omitting the field** — the UI treats `sent` as the quiet case and shows nothing. Adding real values later needs no frontend change. Capturing the provider's response at send time is enough for a first version; webhook-based bounce tracking can come later.

---

## 7. Errors

Standard envelope; nothing exotic is needed.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | bad `status`, `limit` out of range, etc. |
| `UNAUTHORIZED` | 401 | missing/expired token |
| `FORBIDDEN` | 403 | role not permitted |

An org with no invitations is **`200` with `{ total: 0, rows: [] }`** — not a 404. The frontend treats 404 as "endpoint not built yet" and shows an explanatory state, so returning 404 for an empty list would permanently hide the screen.

---

## 8. What the frontend does with each field

`src/roles/hr/screens/InvitesPage.jsx`, already built:

- **Table** — person (name, email, delivery warning), role, department, status, sent date, invited by, actions
- **Filters** — All · Waiting · Accepted · Revoked · Expired → `?status=`
- **Search** — → `?q=`
- **Tiles** — counts of waiting / accepted / failed on the current page
- **Row actions** — Resend and Revoke, shown only for `pending` and `expired`, calling the existing POST endpoints by `email`
- **Pagination** — `limit`/`offset`, using `total`

It tolerates a `rows`/`invitations` key either way, and a bare array, so a small shape difference won't break it. Everything else above is used as specified.

---

## 9. Acceptance

1. `GET /organizations/users/invite` returns 200 with `{ total, rows }` for an HR token.
2. A newly sent invitation appears in the list with `status: "pending"` and `send_count: 1`.
3. Calling `/invite/resend` increments `send_count` and moves `last_sent_at`.
4. Calling `/invite/revoke` flips the row to `status: "revoked"`; it stays in the list rather than disappearing.
5. Accepting an invitation flips it to `accepted` with `accepted_at` set.
6. `?status=pending` returns only pending rows; `?q=` matches on email and name.
7. An org with no invitations returns `200` and an empty array.
8. Another org's invitations never appear.

---

## 10. Separate finding — profile PATCH silently drops `name` and phone

Found while verifying the profile whitelists on 2026-09-24, unrelated to invitations but worth fixing.

`PATCH /organizations/me` and `PATCH /organizations/employees/:id` **strip** `name`, `phone_number` and `contact` from the body. A request containing only one of them therefore comes back:

```
400 {"errorCode":"VALIDATION_ERROR",
     "message":"At least one field must be provided to update"}
```

Verified by sending each field back with the value it already held — a write that changes nothing but still exercises the whitelist:

| Field | `employees/:id` | Note |
|---|---|---|
| `first_name`, `last_name` | **200** | this is how a name is changed |
| `avatar_url` | 200 | |
| `dob`, `blood_group`, `personal_email` | 200 | |
| `current_address`, `permanent_address`, `city`, `state`, `pincode` | 200 | |
| `name` | **400** — stripped | read-only composite |
| `phone_number` | **400** — stripped | |
| `contact` | **400** — stripped | even though this is the populated column |
| `gender`, `marital_status`, `designation`, `employee_code`, `pan_number` | 400 — stripped | documented as intentional |

Two consequences:

1. **The manager's "Edit profile" modal could never work.** It sent exactly `name`, `phone_number` and `avatar_url`; two of the three are dropped, so any save that did not also change the photo returned 400. The frontend now sends `first_name`/`last_name` instead.
2. **There is no way to change a phone number.** Neither `phone_number` nor `contact` is accepted on either endpoint, so the field is now shown read-only. **Please confirm whether this is intentional** — if not, adding `contact` to the whitelist is all that is needed and the UI will expose it again.

---

## 11. Related open gaps

Unchanged by this spec, still open from the same report:

- **B3** — whether `organization_locations` persists `latitude`/`longitude`/`geofence_radius_meters`.
- **B6** — no endpoint changes an existing member's role or designation.
