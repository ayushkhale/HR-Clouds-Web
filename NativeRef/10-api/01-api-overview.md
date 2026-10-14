# 01 · API overview

One gateway, one envelope, one error shape, one client. Learn this page and
every endpoint in the registry behaves predictably.

---

## Base URLs

| Environment | Base URL |
|---|---|
| Development | `https://development.hrclouds.in/api/v1` |
| Production | `https://api.hrclouds.in/api/v1` |

Resolved once, in `src/config/env.js`, with trailing slashes stripped. Nothing
else in the app knows a hostname.

**Build against development until Phase 8.** A clock-in you make while testing
is a real attendance record.

---

## Authentication

`Authorization: Bearer <accessToken>` on everything except the public auth
endpoints.

### Token storage

| Item | Where | Why |
|---|---|---|
| `accessToken` | **Keychain / Keystore** (`react-native-keychain`) | It is a bearer credential to payroll data |
| `refreshToken` | Keychain, same entry | |
| `selection_token` (multi-org, short-lived) | **memory only** | Lives for seconds; writing it to disk is pure risk |
| Everything else (last work mode, UI prefs) | AsyncStorage | Not sensitive |

The web app uses `localStorage` with the keys `hrclouds_token` and
`hrclouds_refresh_token`. Keep the names for familiarity, not the mechanism.

### The JWT carries the session facts

```js
decodeJWT(token) // → { id | sub, role, orgId | org_id, exp, … }
```

- `role` is lowercase (`employee`). It drives the app's **role gate**.
- `orgId` identifies the tenant. It changes on an org switch — anything cached
  per-org must be keyed by it.
- `exp` is seconds since epoch. `expiresAt()` returns ms.

The JWT is base64**url** (`-` and `_`), so a plain `atob` equivalent fails, and
the payload is UTF-8 JSON — a name with non-ASCII characters needs a real UTF-8
decode. The ported `decodeJWT` in `api/client.js` handles both. Do not
reimplement it.

### Session expiry

Three things end a session, and all three funnel into one place:

1. `exp` reached — a timer, plus a re-check whenever `AppState` becomes
   `active` (timers don't fire reliably while the phone sleeps).
2. A `401` from any non-auth endpoint → `client.js` clears the token and emits
   `SESSION_EXPIRED`.
3. The user signs out.

`AuthContext` listens for `SESSION_EXPIRED` and returns to the auth stack with
"Your session ended. Sign in again." — never a blank screen or an endless
spinner.

### The 401 exceptions that matter

A 401 is **not** an expired session when:

- the endpoint starts with `/auth/` (except `/auth/switch-organization`) — a
  wrong password must not sign you out of an existing session;
- the error code is one of `INVALID_CREDENTIALS`, `LOGIN_NOT_ALLOWED`,
  `GOOGLE_TOKEN_INVALID`, `UNAUTHORIZED_DEVICE`;
- the code starts with `API_KEY`.

And: **only end the session the request was made with.** Compare the stored
token against the token the request carried; if they differ, a newer login has
already happened and a late 401 must be ignored. This also makes parallel 401s
fire once instead of five times.

---

## Response envelope

### Success

```json
{ "success": true, "message": "Human readable string", "data": { } }
```

- `201` for created resources (regularization submit, HR creates).
  `200` for everything else.
- Some decision endpoints return **no `data` key at all**. Don't read `data`
  blindly — `unwrap()` handles it.

```js
unwrap(res)   // { success, data } → data;  anything else → itself
```

### Error

```json
{ "success": false, "message": "Human readable string", "code": "MACHINE_CODE" }
```

or, in payroll and documents:

```json
{ "success": false, "message": "…", "errorCode": "MACHINE_CODE", "details": [] }
```

**Both key names exist.** Attendance and leave use `code`; payroll and
documents use `errorCode`. The error modules read both. Never branch on
`message` — messages are not stable.

---

## Pagination — two key styles, deliberately absorbed

```json
"pagination": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 }
```

| Key | Used by |
|---|---|
| `totalPages` (camel) | **every self-service list** — `/attendance/history`, `/regularizations`, `/overtime/mine`, `/anomalies/mine`, `/comp-offs/mine` |
| `total_pages` (snake) | all `/attendance/hr/*` reads (not your problem in this app) |

The `pagination` object also moves: attendance puts it **inside** `data`
(`{ data: { pagination, records } }`); payroll and organisation put it
**beside** `data` (`{ data: [], pagination }`).

`normalizePaginated(res, keys, { page, limit })` absorbs all of it and returns:

```js
{ items, total, page, limit, totalPages }
```

It also handles the case the backend gives **no** pagination metadata: it never
fabricates page counts from the requested limit (every "page" would re-render
the same list). Use it everywhere; never read `res.data.pagination` in a screen.

> **Pagination counts days, not records, on the dense attendance history
> endpoints.** "30 records" for September would be a lie — pass `noun="day"` to
> the list footer there.

---

## Query strings

Every query goes through `qs()`:

```js
qs({ status: '', page: 2, date: undefined })  // → "?page=2"
```

Dropping empty values is not cosmetic. A literal `?status=` is a **400** on
several endpoints, and `?date=undefined` is a 400 everywhere. A cleared filter
must vanish from the URL.

Arrays repeat the key (`component_code=A&component_code=B`) — that is what the
report filters send and what `files.js` builds.

---

## Unknown fields are silently dropped

Validation runs with `allowUnknown: false, stripUnknown: true`. In Joi,
`stripUnknown` wins: **extra keys are silently removed, not rejected.**

> **A `200 OK` is not evidence that a field was understood.**

This is the single most dangerous property of the whole API, and it has already
caused real data loss on web:

- `work_mode` sent on **clock-out** — not a clock-out field, silently stripped.
- `excluded_users` on weekly-off rules — field doesn't exist, exclusions never
  saved, no error ever shown.

When you add a field to a payload, verify it landed by reading the record back,
not by checking the status code.

---

## Dates and times on the wire

| Context | Format | Note |
|---|---|---|
| `DATEONLY` responses (`date`, `expiry_date`, `effective_from`) | `"YYYY-MM-DD"` | **Never** `new Date(s)` — that's UTC midnight and renders the previous day west of UTC. Use `parseYMDLocal()` |
| Holiday `date`, `recompute-stale` `date` | strict `"YYYY-MM-DD"` | An ISO datetime is rejected |
| Field-assignment dates | strict `"YYYY-MM-DD"` | An ISO timestamp is a 400 — use `ymdOnly()`, never `toISOString()` |
| Other date fields | ISO 8601; send `"YYYY-MM-DD"` | A full timestamp is accepted but interpreted as **UTC** |
| Shift times (`start_time`, `core_*`) | `"HH:mm"` or `"HHmm"`, 24h | Seconds are **not** accepted. These are schedules — never timezone-convert them |
| Regularization `requested_clock_in/_out` | ISO datetime **or** `"HH:mm"` | Send full ISO for overnight corrections, or the server can't tell the clock-out is the next day |
| Response timestamps | ISO 8601 UTC | Convert to local for display |
| Decimals (`total_hours`, `effective_hours`) | **strings** (`"8.50"`) | Sequelize DECIMAL. Parse before arithmetic |

**Server-side "today" is computed in `Asia/Kolkata`**, not the org's timezone,
and one endpoint computes it in UTC. Where an endpoint accepts a date, **pass it
explicitly** rather than relying on the server's default.

Client-side "today" must be the **local** date: `toISOString().split('T')[0]`
returns *yesterday* in IST between 00:00 and 05:29. Use `todayYMD()`.

---

## Timeouts and the gateway

- Production nginx cuts requests at **120 s**. The client aborts at **110 s** so
  we produce our own error rather than parsing nginx's HTML 504.
- An abort surfaces as `{ status: 408, isTimeout: true }` with the message
  "Request timed out. Please try again."
- Gateway errors (413, 429, 502, 504) return **HTML**, not JSON. Parse the body
  only when `content-type` is JSON, or a 504 reads as a parse crash instead of a
  504.
- `Retry-After` is the one response **header** a caller acts on. A 429 from a
  rate-limited write says there how long to wait; it is read centrally into
  `error.retryAfter`. The body usually carries the same number as
  `details.retry_after_seconds` and is preferred — a proxy can strip a header
  but not a payload.

---

## Binary responses never go through `request()`

`request()` always parses JSON. Payslip PDFs, Form 16, annual statements, CSV
exports and ZIPs stream real files. They go through **`api/files.js`**:

```js
await downloadFile(payrollFiles.myPayslipPdf(runId), { filename: 'payslip-sep-2026.pdf' });
await fetchFileBlob(endpoint);   // when the app must SHOW it rather than save it
```

Both attach the same Bearer token and throw errors in exactly the shape
`request()` throws, so `payrollErrorMessage` reads them unchanged.

Two things to know:

1. **`Content-Disposition` carries the real filename**, and
   `filename*=UTF-8''…` wins over `filename="…"` (RFC 6266). It is only
   readable if the API exposes the header via CORS — on native there is no CORS,
   so you generally *will* get it. Fall back to the caller's name so a file never
   lands called "download".
2. **One route does not always answer with a file.** The bulk payslip ZIP may
   answer `202 Accepted` with a JSON body saying "I've started, poll here" — and
   `response.ok` is true for a 202. Without the `acceptJson` option you would
   save that JSON to disk as a `.zip`. Opt in per call; nothing else is affected.
   (Not an employee-app route today, but the helper carries the behaviour.)

---

## Feature flags: absent key → hidden feature

Every attendance endpoint sits behind `requireFeature('attendance.access')`.
When the org's plan lacks it:

```
403 { success: false, message: "This feature is not available…", code: "FEATURE_NOT_AVAILABLE" }
```

Render the "Attendance isn't enabled" state on this **code**. It is a 403, not a
404. `isFeatureDisabled(error)` in `lib/errors/attendanceErrors.js` detects it,
and `ErrorState` already branches on it.

More generally: **gate UI on what the server returned, not on the spec.** If a
response has no `benefits` key, the benefits card does not render. A missing
backend feature degrades to a hidden control, never a crash and never an empty
box with a heading.

---

## Rate limits

Writes are rate-limited per organisation. A `429` arrives with `Retry-After`
and/or `details.retry_after_seconds`. Surface it as a wait, with the number:

> "Too many attempts. Try again in 40 seconds."

Never auto-retry a write on a 429 — retrying a punch is how you get two punches.

---

## The request lifecycle, in code

```
screen
  └─ hook (usePagedList / useResource)         cancellation, page state, retry
       └─ api/<domain>.api.js                  path building, qs(), seg(), payload shape
            └─ api/client.js  request()        token, headers, 110s abort, JSON guard,
                 └─ fetch                      401 handling, error shaping
```

Four hard rules:

1. A screen never calls `fetch` or `client.js` directly.
2. Every response is `unwrap()`ped or `normalizePaginated()`d before a screen
   sees it.
3. Every fetch is cancellable; out-of-order responses are discarded.
4. Every write that changes a visible count emits on `lib/events.js`.
