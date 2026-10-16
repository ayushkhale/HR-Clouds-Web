# Attendance Device Trust — Senior Review & Implementation Plan

**Source requirement:** `review/for_cc_2026-10-15_production_device_registration_attendance_restriction.md`
**Date:** 2026-10-15
**Scope:** Attendance module. Proof-of-possession device gate on punch operations.
**Status:** PLAN ONLY — nothing implemented.

---

## Part 0 — Executive summary

The source document's architecture is correct and I endorse it: separate authentication
from device authentication, bind a cryptographic credential to the authenticator, require
proof of possession on attendance operations only, and protect the registration endpoint
with step-up. That is the right production design and I am not proposing an alternative.

Three things must be settled before any code is written, because each one invalidates a
different part of the document:

1. **The table name `attendance_devices` is already taken** by the biometric terminal
   registry in this repo. Implementing the document literally destroys the biometric
   punch ingestion path. (D-DT-1)
2. **A synced passkey is not a device.** iCloud Keychain / Google Password Manager
   passkeys replicate across every device the employee owns. The document's web story
   (§11, §12) produces a credential that works from the employee's sofa. Unless
   registration rejects backup-eligible credentials, the feature does not deliver its
   own stated requirement. (D-DT-2)
3. **Device trust does not answer the question the client is probably asking.** It
   proves *"this is the enrolled device"*, never *"the employee is at work"* — the
   document says this itself in §29 and then does not follow through. If the business
   goal is "stop people punching from home", the enforced control is geofence + device
   trust together, and **this repo's geofence is advisory today**: `_validateGeofence`
   raises anomalies and has never rejected a punch. (D-DT-3)

Everything else below is detail.

---

## Part A — Spec review

### A.1 What the document gets right

| § | Point | Verdict |
|---|---|---|
| 2, 5–7 | IP / User-Agent / fingerprint are metadata, not identity | Correct, and worth the space it spends on it |
| 4 | authn ≠ device-authn ≠ authz as three separate layers | Correct; drives the middleware decomposition in §20 |
| 8, 10 | `device_id` is an identifier, the private key is the credential | Correct |
| 20, 21 | Gate attendance routes, not the whole app | Correct and the reason this is shippable at all |
| 30, 31 | Single-use, short-lived, operation-bound challenge | Correct |
| 38 | The registration endpoint is itself the attack surface | The most important paragraph in the document. Most implementations miss this |
| 24, 39 | Replacement and recovery are part of the security model | Correct; the usual production failure is having no answer here |

### A.2 Findings

Severity is about production impact, not document quality.

---

**D-DT-1 — CRITICAL — `attendance_devices` collides with the biometric terminal registry.**

§9, §12, §25 and §26 all propose a table called `attendance_devices`. That table exists:

- `src/modules/attendance/models/attendance_devices.model.js` — `serial_number`,
  `api_key_hash`, `webhook_url`, `location_id`, `type`. It is a **hardware terminal**,
  owned by the org, not by a user. There is no `user_id` column.
- `attendance_logs.device_id` is a FK to it (`attendance_logs.model.js:95`).
- `attendance_device_employee_mappings` hangs off it.
- `device.service.js` already exports `registerDevice`, `getDevices`, `revokeDevice`-shaped
  methods for it, and HR already serves `POST /api/v1/attendance/hr/devices`.

**Resolution.** New table `attendance_trusted_devices`, new service
`trusted_device.service.js`, new route segment `trusted-devices`, and a **new column**
`attendance_logs.trusted_device_id` — never reuse `device_id`, which would raise a FK
violation against the terminal table and abort the punch transaction. (Migration 00022
is the standing proof in this repo of what pointing a polymorphic id at one table costs;
see the header of `00071-add-geofence-provenance-to-attendance-records.js`.)

---

**D-DT-2 — CRITICAL — backup-eligible passkeys defeat the requirement.**

The document never mentions the WebAuthn **BE** (backup eligible) and **BS** (backup
state) flags. In 2026 the default outcome of `navigator.credentials.create()` on consumer
hardware is a *synced* passkey: Chrome stores it in Google Password Manager, Safari in
iCloud Keychain. It is then usable from every device in that account.

Consequence: an employee enrolls their office laptop, the credential syncs to their home
Mac and their personal iPhone, and all three pass the gate. The system reports "attendance
from a registered device" and the requirement in §1 is not met.

**Resolution.** Registration must read the BE flag out of `authData` and:

- store it as `backed_up`, and derive `device_bound = !backed_up`;
- reject the registration with `422 DEVICE_NOT_HARDWARE_BOUND` when the org policy sets
  `require_device_bound = true` (the default);
- request `authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged', requireResidentKey: false }`
  at creation time to steer the authenticator, while **still verifying the flag
  server-side** — `authenticatorSelection` is a hint the client can ignore.

  All four fields must be set **explicitly**. Verified against
  `@simplewebauthn/server@14.0.3`: `generateRegistrationOptions()` defaults to
  `{ residentKey: 'preferred', userVerification: 'preferred', requireResidentKey: false }`,
  so passing only `rpName`/`rpID`/`userName` both loses the required user verification
  **and** asks for a discoverable credential — which is exactly what Chrome routes into
  Google Password Manager and Safari into iCloud Keychain, maximising the BE-flag
  rejection this finding exists to avoid. `discouraged` is affordable because this is not
  a login flow and `allowCredentials` is always sent at assertion time. (Raised by the
  frontend contract review as S-FE-3.)

Operationally this means employees enroll via Windows Hello / Touch ID with sync
unavailable, or via a hardware security key. HR needs to be told this before rollout,
because it is a procurement question, not a code question.

---

**D-DT-3 — HIGH — the feature does not establish physical presence, and the control that would is advisory in this repo.**

§29 states the limitation correctly and then §28 lists location as an "additional
control". What the document does not say is that a registered phone in the employee's
pocket at home satisfies every check in §32. Device trust raises the cost of buddy
punching (you must hand over your unlocked phone and your biometric) but does not stop
remote punching at all.

In this codebase the complementary control already exists and **does not block**:

- `clock.service.js#_validateGeofence` returns a provenance object and calls
  `anomalyService.createAnomaly`. There is no `throw` on `out_of_bounds`.
- `tests/unit/attendance/geofence_evaluation.test.js` documents the fail-open history of
  `isWithinGeofence` and why `evaluateGeofence` has a third `unresolved` state.
- The seeded feature key `attendance.geofencing` is **never read anywhere in `src/`** —
  a precedent worth noting in its own right (see D-DT-16).

**Resolution.** Two separate decisions, both for the client, neither one implied by the
other:

- (a) Ship device trust as a blocking gate — this plan.
- (b) Decide separately whether `out_of_bounds` should become blocking. That is a much
  larger behavioural change (it rejects punches on client-supplied GPS, which is
  spoofable on a rooted phone, and it will reject legitimate punches whenever HR has
  not pinned a location — the `unresolved` case) and it is **out of scope here**.

Do not let (a) ship while anyone believes it delivers (b).

---

**D-DT-4 — HIGH — the document never says when the challenge is consumed relative to the business rules.**

§30 says "verify → consume challenge → allow operation". That ordering is ambiguous
in the one case that matters: the punch fails a business rule *after* the signature
verifies. `applyClockIn` throws `ALREADY_CLOCKED_IN`, `PREVIOUS_SHIFT_OPEN`,
`ATTENDANCE_LOCKED` and `MAX_BREAKS_EXCEEDED` after the gate would have run.

- Consume **inside** the punch transaction → the rollback un-consumes the challenge, and
  the captured assertion stays replayable for the rest of its TTL. That is precisely the
  hole §30 exists to close.
- Consume **before**, in its own committed transaction → single use is guaranteed; a
  business-rule failure burns the challenge and the client must fetch a new one.

**Resolution: consume first, committed separately.** Replay protection must not be
contingent on a business outcome. The cost is that every retry needs a fresh challenge,
which the client must handle anyway, and which is the same contract as an OAuth nonce or
a CSRF token. The error payload therefore has to carry a `retriable: true` hint so the UI
can re-run the challenge→sign→submit loop without showing the user a dead end.

Worst case on a mid-flight crash: a burned challenge and no punch. No data corruption,
user retries.

---

**D-DT-5 — HIGH — regularization is a side door, and it must stay open.**

§21 enumerates the attendance operations and omits regularization. An implementer
reading the list literally lands on one of two bugs:

- Forgets it → an employee with no enrolled device files
  `POST /attendance/regularization` and gets the same attendance state by another route.
  Silent bypass.
- Gates it → the employee who just lost their phone cannot file the request that fixes
  their missing punch. The recovery path is locked for exactly the population that needs
  it.

**Resolution.** Regularization is **not** device-gated, deliberately, because it is
already `pending` → manager/HR approval (`regularization.service.js#approveRequest`,
with `HIERARCHY_VIOLATION` checks). It is a *reviewed* bypass, which is the correct
shape for a recovery path. This must be written down, because it will be raised in every
future security review. Mitigation if abuse appears: raise a
`regularization_without_trusted_device` anomaly so approvers see the context — cheap, and
leaves the decision with a human.

---

**D-DT-6 — HIGH — "one active device" cannot be both a DB constraint and configurable.**

§22 asks for a transaction *and* "a database uniqueness constraint ... where
appropriate"; §23 then says multiple devices should need no architectural change. Those
are incompatible. A partial unique index `(org_id, user_id) WHERE status = 'active'`
hard-codes cap = 1 and must be dropped to ever reach §23.

**Resolution.** The cap is `attendance_device_policies.max_active_devices` (default 1,
1..5), so there is no unique index. Registration serializes on
`pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || user_id::text, 0))` and
re-counts active rows **under the lock**, inside the same transaction as the insert.

Advisory lock rather than `SELECT ... FOR UPDATE` on `user_roles`: the lock key is
exactly the invariant's scope, it releases on transaction end without a row to pick, and
it does not contend with unrelated writes to a membership row that the auth middleware
reads on every single request.

The count must happen *after* the lock, not before. The document's pseudocode in §22 has
this right; it is the detail most commonly got wrong.

---

**D-DT-7 — HIGH — 401 on a device failure will log users out.**

§33 gives three error bodies and no status codes. Returning 401 for
`ATTENDANCE_DEVICE_REQUIRED` means every SPA interceptor in existence treats it as an
expired session, drops the token and bounces the user to login. The user then logs back
in successfully, which makes the bug look non-deterministic to support.

**Resolution.** Fixed contract, asserted by a test:

| Code | Status | Meaning |
|---|---|---|
| `ATTENDANCE_DEVICE_REQUIRED` | 403 | no active trusted device, or no proof supplied |
| `ATTENDANCE_DEVICE_REVOKED` | 403 | named device is revoked |
| `ATTENDANCE_DEVICE_SUSPENDED` | 403 | named device is suspended |
| `DEVICE_VERIFICATION_FAILED` | 403 | signature/assertion did not verify |
| `DEVICE_CHALLENGE_INVALID` | 400 | unknown / consumed / expired / wrong operation (one code, no oracle) |
| `DEVICE_NOT_HARDWARE_BOUND` | 422 | registration only; backup-eligible credential |
| `DEVICE_LIMIT_REACHED` | 409 | registration only |
| `DEVICE_ALREADY_REGISTERED` | 409 | registration only, same user |
| `DEVICE_TRUST_MISCONFIGURED` | 503 | RP config missing while enforcement is on |

**No device-trust code is ever 401.** `REVOKED` and `SUSPENDED` are distinguished from
`REQUIRED` on purpose: the caller is already authenticated as the device's owner, so
there is no cross-account disclosure, and a generic error here costs real support time.
The four *challenge* failure modes collapse to one code precisely because they would
otherwise be an oracle.

---

**D-DT-8 — MEDIUM — `source` is client-supplied and already load-bearing.**

`_validateGeofence` skips geofencing entirely on `data.source === 'biometric'`
(documented carve-out: a terminal punch is attested by `location_id`). Today
`clockInSchema` allows only `web | mobile | api`, so the carve-out is unreachable from a
client — but it is one enum edit away from being a bypass, and the same shape of mistake
would apply to the device gate.

**Resolution.** The gate keys off the **route**, passed as a literal argument
(`requireTrustedDevice('clock_in')`), never off `req.body.source`. Add a regression test
asserting that a body claiming `source: 'biometric'` is rejected by the Joi schema **and**
does not alter the gate's decision.

---

**D-DT-9 — MEDIUM — `sign_count` is absent from the document, and the naive rule locks out Touch ID.**

The authenticator signature counter is WebAuthn's only built-in clone signal, and §26's
field list omits it. The naive implementation — "reject if new ≤ stored" — locks out
every platform authenticator, because Touch ID, Windows Hello and most synced passkeys
**always report 0**.

**Resolution.** Store `sign_count BIGINT NOT NULL DEFAULT 0`. Rule:

```
if (newCounter === 0 && storedCounter === 0) → allow, skip the check   // platform authenticator
if (newCounter === 0 && storedCounter  > 0) → allow, log counter_reset // authenticator replaced its counter
if (newCounter > 0 && newCounter <= storedCounter) → reject, CLONE SUSPECTED
otherwise → allow, persist newCounter
```

A clone-suspected rejection writes an audit row and does **not** auto-revoke (D-DT-10).

Persistence: `UPDATE ... SET sign_count = :new WHERE id = :id AND sign_count < :new`. Zero
rows affected means a concurrent assertion already advanced past us — log and continue;
concurrent punches from one device are a double-punch and get 409'd downstream anyway.

---

**D-DT-10 — MEDIUM — never auto-suspend on failed verification.**

§35 lists "repeated device verification failures" as a thing to investigate and §36 asks
for rate limiting. The tempting next step — suspend the device after N failures — is a
self-inflicted denial of service: anyone who can reach the endpoint with the victim's
JWT, or just a user on a flaky train connection, can lock an employee out of clocking in,
which in this product directly costs that person money.

**Resolution.** Rate limit, audit, surface on an HR events endpoint. **Never** mutate
device state automatically. Suspension is an HR action with an actor id on it.

---

**D-DT-11 — MEDIUM — §27's shared org terminal cannot be modelled as a trusted device.**

A WebAuthn credential is bound to a (user, authenticator) pair with user verification.
An "organization-issued attendance terminal" shared by 50 employees would need 50
credentials on one authenticator, each gated by the enrolling person's PIN or biometric.
The platform authenticator will not cooperate, and if it did, the shared PIN would be the
real credential.

**Resolution.** This repo already has the right mechanism for shared terminals: the
biometric device + `POST /api/v1/attendance/devices/webhook` path, where the hardware
holds an `api_key_hash` and attests `location_id`. **Trusted devices are
employee-owned, one user per credential. Shared terminals stay on the biometric path and
are exempt from the gate** (they never traverse the user punch routes at all). Do not
merge the two models into one table — they have different owners, different credentials
and different threat models.

---

**D-DT-12 — MEDIUM — the 60-second challenge TTL is too tight for the actual user population.**

§30 suggests "roughly one minute". The flow is challenge request → WebAuthn/Keystore
prompt → biometric → submit. On a factory floor on 2G, or on a laptop where Windows Hello
takes two attempts, 60s expires mid-prompt and the employee sees a failure they cannot
diagnose.

**Resolution.** Default `challenge_ttl_seconds = 180`, configurable 30..600. 180s with
single use, user-scoped, operation-bound and signature-verified is not a meaningful
widening of the replay window — the attacker needs the private key regardless. Pair it
with a `retriable: true` flag on `DEVICE_CHALLENGE_INVALID` so the client auto-retries
once before surfacing anything.

---

**D-DT-13 — MEDIUM — the client cannot tell whether to show the button.**

Nothing in the document lets the frontend know, before the punch, whether this browser
holds a usable credential. Without it the UX is "click Check In, wait, get a 403".

**Resolution.** Two readouts:

- `GET /attendance/device-trust/context` → mode, enforced operations, the caller's active
  device count, approval mode, grace date. Lets the UI render enrollment prompts.
- The challenge endpoint returns WebAuthn `allow_credentials` (the caller's own active
  credential ids — no disclosure, the client already holds its own) so the browser itself
  decides whether it has a match. When the caller has zero active devices it returns
  `registration_required: true` instead of an empty prompt.

Critically, when enforcement is `off` the challenge endpoint returns
`200 { required: false }`, **not** 404 — the client needs one uniform code path across
all three modes.

---

**D-DT-14 — MEDIUM — the mobile signing construction in §31 is forgeable as written.**

§31 shows `Sign(privateKey, challenge + user/session context + device ID + operation)`.
Plain concatenation with no separators or length prefixes collides across field
boundaries: `("ab", "c")` and `("a", "bc")` produce identical bytes. With a server-issued
opaque challenge this is not currently exploitable, but it is free to close and it is the
exact class of mistake §31's own closing sentence warns about.

**Resolution.** A single canonicalization function, domain-separated and
length-prefixed, with its own unit test:

```
"HRMS-ATTN-DEVICE-PROOF-v1"            // domain separator, literal ASCII
|| u32be(len(challenge_id))  || challenge_id
|| u32be(len(challenge))     || challenge
|| u32be(len(operation))     || operation
|| u32be(len(device_id))     || device_id
|| u32be(len(user_id))       || user_id
|| u32be(len(org_id))        || org_id
```

The `-v1` suffix is not decoration: it is what makes this format replaceable without a
flag day. For the **web** path, do not invent anything — the challenge inside
`clientDataJSON` carries the binding and the operation is bound because the server issued
that challenge *for* that operation and looks it up. §31's own advice.

---

**D-DT-15 — MEDIUM — there is no rollout story, and day one is an org-wide outage.**

§41 describes the steady state. On the day this ships, every employee in every org has
zero enrolled devices. Flipping the gate on is a total attendance outage for that org,
during which nobody can clock in and the fix (enroll a device) requires an OTP round trip
per person.

Two further blockers specific to this deployment:

- `ENABLE_ATTENDANCE_SIMULATOR=true` runs in production
  (`src/server.js:57`), and `src/code_dump/code/attendanceCron.js` punches over HTTP with
  a bearer token and nothing else. Enforcement breaks it immediately.
- There is no backfill: no existing employee has a credential, and none can be created
  server-side.

**Resolution.** Three-state enforcement plus a grace date, and a global env kill switch —
see §C.5. `off` is the default and short-circuits before any DB read, so the shipped code
is inert until an operator opts an org in.

---

**D-DT-16 — LOW — do not add a subscription feature key.**

`attendance.geofencing` was seeded in `004-seed-features.js` and plan-mapped in
`005-seed-plan-features.js`, and is **read nowhere in `src/`**. Adding
`attendance.device_trust` would repeat that: a key that implies a gate that does not
exist, plus an unrun seeder blocking deploys.

**Resolution.** Gate on the org policy row only. If billing should sell this, that is a
billing change with its own seeder, done deliberately.

---

**D-DT-17 — LOW — break punches record no IP or User-Agent, so §34 cannot be satisfied for them.**

`handlePostBreakStart` / `handlePostBreakEnd` pass `req.body` straight through
(`user_attendance.controller.js:34,41`), unlike the clock handlers which add `ip_address`
and `user_agent`. `applyBreakStart` consequently writes a log with no IP.

§34 requires IP and user-agent on every attendance event. Fixing it is a two-line
controller change plus two fields in the log create — small, but it is a change to
persisted data and therefore belongs in the `md_updates` record.

---

**D-DT-18 — LOW — the recovery flow in §39 stacks three mechanisms without picking any.**

"MFA → email/phone verification → optional admin approval" is three controls. Shipping
all three is a support burden; shipping none is D-DT-15's lockout.

**Resolution.** Reuse the OTP table that already exists (`otps`, with a `context` column
and `findValidOtpForUpdate` that locks the row) under a **new** context
`attendance_device_registration`, and offer exactly two org policies: `otp` (self-service,
step-up by OTP) and `hr_approval` (OTP plus a `pending` → `active` HR transition). No
third mechanism.

A new context, never a reuse of `registration` or `forgot_password`: a cross-context OTP
replay would turn a password-reset code into a device enrollment.

---

**D-DT-19 — LOW — proof placement interacts with this repo's validator.**

`validateOrThrow` runs Joi with `stripUnknown: true`, so unknown body keys are **silently
dropped**, not rejected. A proof placed in the body without a schema entry disappears and
the gate sees "no proof supplied" — a confusing 403 with no clue in the logs. The same
applies to any future schema edit.

**Resolution.** Add `device_proof` explicitly to all four punch schemas, and add a drift
test asserting the key is present in every one of them, so the next schema edit cannot
silently remove it.

---

## Part B — Design

### B.1 Data model

Three new tables plus one column. All org-scoped.

#### `attendance_trusted_devices`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `org_id` | UUID NOT NULL | FK `organizations(id)` |
| `user_id` | UUID NOT NULL | FK `users(id)` |
| `credential_type` | VARCHAR(20) NOT NULL | `webauthn` \| `device_key` |
| `credential_id` | TEXT NOT NULL | base64url rawId (web) / server-minted opaque id (mobile) |
| `public_key` | TEXT NOT NULL | base64 COSE (web) / base64 SPKI DER (mobile) |
| `signature_algorithm` | VARCHAR(20) NOT NULL | `ES256` \| `RS256` \| `Ed25519` |
| `aaguid` | UUID NULL | authenticator model, audit only |
| `sign_count` | BIGINT NOT NULL DEFAULT 0 | D-DT-9 |
| `backed_up` | BOOLEAN NULL | WebAuthn BE flag; NULL for `device_key` |
| `device_bound` | BOOLEAN NOT NULL DEFAULT true | derived `!backed_up`; D-DT-2 |
| `transports` | JSONB NULL | WebAuthn hint, echoed back in `allow_credentials` |
| `device_name` | VARCHAR(100) NOT NULL | user-supplied label |
| `platform` | VARCHAR(20) NOT NULL | `web` \| `android` \| `ios` |
| `status` | VARCHAR(20) NOT NULL DEFAULT `'pending'` | `pending` \| `active` \| `revoked` \| `suspended` |
| `registered_at` | TIMESTAMPTZ NULL | set when it first becomes `active` |
| `approved_by` / `approved_at` | UUID NULL / TIMESTAMPTZ NULL | `hr_approval` mode |
| `last_used_at` / `last_ip` / `last_user_agent` | TIMESTAMPTZ / VARCHAR(45) / TEXT | §26 risk metadata, never identity |
| `revoked_at` / `revoked_by` / `revoke_reason` | TIMESTAMPTZ / UUID / VARCHAR(50) | `user_replaced`, `user_revoked`, `hr_revoked`, `lost`, `clone_suspected`, `offboarded` |
| `replaced_device_id` | UUID NULL | self-FK, back-link for §24 |
| `created_at` / `updated_at` | TIMESTAMPTZ | `underscored: true`, repo convention |

Constraints and indexes:

- `UNIQUE (credential_id)` — `atd_credential_id_unique`. Globally unique by WebAuthn
  construction; a duplicate is either a cross-account registration attempt or a bug.
- `(user_id) WHERE status = 'active'` — `atd_user_active_idx`, the gate's hot lookup.
- `(org_id, user_id, status)` — `atd_org_user_status_idx`, the list endpoints.
- `(org_id, status) WHERE status = 'pending'` — HR approval queue.
- CHECK `status IN ('pending','active','revoked','suspended')`
- CHECK `credential_type IN ('webauthn','device_key')`
- CHECK `signature_algorithm IN ('ES256','RS256','Ed25519')`
- CHECK `status <> 'revoked' OR revoked_at IS NOT NULL`
- CHECK `status <> 'active' OR registered_at IS NOT NULL`

**The unique index has a sharp edge.** Revoking a device leaves its `credential_id` in the
table, so re-registering the *same* credential raises a unique violation rather than a
clean error. Handle it explicitly rather than letting a 500 out:

- same user, row is `revoked` → `409 DEVICE_ALREADY_REGISTERED`, message directs them to a
  different authenticator. **Do not reactivate** — that would make revocation reversible
  by the revoked party.
- different user → generic `403 DEVICE_VERIFICATION_FAILED` plus a high-signal audit row.
  Never reveal that the credential belongs to someone else.

Pass `excludeCredentials` (the caller's active credential ids) at registration so a
cooperating authenticator refuses to double-enroll and the user gets a browser-level
message instead of a server error.

#### `attendance_device_challenges`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | the `challenge_id` the client echoes back |
| `org_id` / `user_id` | UUID NOT NULL | |
| `purpose` | VARCHAR(20) NOT NULL | `registration` \| `assertion` |
| `operation` | VARCHAR(20) NULL | `clock_in` \| `clock_out` \| `break_start` \| `break_end`; NULL for registration |
| `challenge` | TEXT NOT NULL | base64url of 32 `crypto.randomBytes` |
| `device_id` | UUID NULL | pre-bound for `device_key`; NULL for webauthn (resolved by credential id) |
| `expires_at` | TIMESTAMPTZ NOT NULL | |
| `consumed_at` | TIMESTAMPTZ NULL | the single-use flag |
| `consumed_by_device_id` | UUID NULL | forensics |
| `created_ip` | VARCHAR(45) NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

- `UNIQUE (challenge)`, `(user_id, purpose, expires_at)`, `(expires_at)` for the sweeper.
- CHECK `purpose = 'registration' OR operation IS NOT NULL`

**Postgres, not Redis.** Redis gives free TTL and an atomic `GETDEL`, but replay
protection is a security invariant and must not fail open when a shared cache restarts —
and `connection.redis` is already a hard dependency that 503s the auth middleware. Punch
volume is a handful of rows per employee per day, so the write cost is irrelevant, and
`UPDATE ... WHERE consumed_at IS NULL RETURNING` is as atomic as a Lua script. Cleanup is
a cron (§C.4).

**Deliberately not stored: a session binding.** An earlier draft bound the challenge to
`req.user.tokenHash`. Dropped: the only attack it stops is challenge exfiltration without
key exfiltration, where the attacker still cannot sign, and it introduces a real failure
mode — a token refresh mid-flow invalidates an in-flight challenge. Binding is `user_id`
+ `org_id` + `purpose` + `operation` + single use + TTL.

#### `attendance_device_policies` — one row per org

| Column | Type | Default | Notes |
|---|---|---|---|
| `org_id` | UUID PK | | FK `organizations(id)` |
| `enforcement_mode` | VARCHAR(10) NOT NULL | `'off'` | `off` \| `monitor` \| `enforce` |
| `enforced_operations` | JSONB NOT NULL | all four | subset of the four punch operations |
| `max_active_devices` | SMALLINT NOT NULL | `1` | CHECK 1..5; D-DT-6 |
| `registration_approval` | VARCHAR(20) NOT NULL | `'otp'` | `otp` \| `hr_approval` |
| `require_device_bound` | BOOLEAN NOT NULL | `true` | D-DT-2 |
| `allow_platform_web` | BOOLEAN NOT NULL | `true` | |
| `allow_mobile_key` | BOOLEAN NOT NULL | `true` | |
| `challenge_ttl_seconds` | SMALLINT NOT NULL | `180` | CHECK 30..600; D-DT-12 |
| `enforce_from` | DATE NULL | | grace window; `enforce` behaves as `monitor` until this date |
| `updated_by` | UUID NULL | | |
| `created_at` / `updated_at` | TIMESTAMPTZ | | `updated_at` is the If-Match token |

**Why a dedicated table rather than columns on `attendance_policies`.**
`attendance_policies` is resolved per user via shift → policy
(`clock.service.js#_resolvePolicyForUser`), *inside* the punch transaction, after shift
resolution. The gate runs in middleware before the transaction opens and must not
duplicate shift resolution on every punch. Device trust is also an org-wide security
posture, not a shift attribute — letting it vary by shift is a footgun with no use case.
One row per org is a single PK read, trivially cacheable.

**Settings catalog (CLAUDE.md T-S2):** attendance has **no** store in
`src/modules/settings/catalog/` today — the registered stores are `payroll_settings`,
`statutory_configs`, `document_settings`, `document_letter_branding`,
`organization_profiles`, `task_settings`. `tests/unit/settings/catalog_drift.test.js`
iterates `ADAPTERS` only, so these tables are outside T-S2 and **no catalog file changes
are required**. Surfacing this on the Settings screen would need a new store, adapter,
group and entries — a separate phase, explicitly out of scope.

#### `attendance_logs` — one new column

- `trusted_device_id UUID NULL REFERENCES attendance_trusted_devices(id) ON DELETE SET NULL`

Per-punch verification detail goes into the existing `metadata` JSONB under a
`device_trust` key (`{ mode, outcome, credential_type, challenge_id, device_bound }`),
following the reasoning written into `00071`'s header: `metadata` is the authoritative
per-punch detail, a real column exists only when a dashboard or report needs it as a
dimension — which `trusted_device_id` does, as the audit anchor.

Never persisted anywhere: signatures, assertions, raw public keys in logs.

---

### B.2 Dependency

`@simplewebauthn/server@14.0.3`.

Justification, per CLAUDE.md's bar: attestation verification requires CBOR decoding of
`attestationObject`, COSE public-key parsing, `authData` bit-field parsing, X.509 chain
handling for non-`none` attestation, `clientDataJSON` validation and per-algorithm
signature verification. That is several hundred lines of security-critical parsing, and
§31 explicitly says not to invent the cryptographic construction. This package is the
de-facto standard.

Verified against the registry rather than assumed:

- `exports['.'].require = './script/index.js'` — a real CJS entry point, so plain
  `require()` works in this CommonJS repo. No `await import()` wrapper needed.
- `engines.node >= 20.0.0`; this repo pins `>=22 <23`.
- 10 transitive dependencies, all `@peculiar/asn1-*`, `@levischuck/tiny-cbor`,
  `@hexagon/base64`, `reflect-metadata`.

The 10 transitive deps are the real cost and the reason the dependency is confined to a
single wrapper file (`webauthn_verifier.utils.js`), so replacing it later is a one-file
change.

The **mobile** path needs no dependency at all: `node:crypto`'s `verify` handles ECDSA
P-256, RSA-PSS/PKCS1 and Ed25519 natively.

---

### B.3 Files

New:

```
src/modules/attendance/
  models/attendance_trusted_devices.model.js
  models/attendance_device_challenges.model.js
  models/attendance_device_policies.model.js
  repositories/attendance_trusted_devices.repository.js
  repositories/attendance_device_challenges.repository.js
  repositories/attendance_device_policies.repository.js
  services/trusted_device.service.js          # registration, lifecycle, HR admin
  services/device_trust.service.js            # policy read + challenge issue/consume + verify
  middlewares/require_trusted_device.middleware.js
  utilities/device_proof.utils.js             # pure: canonicalization + raw-key verify
  utilities/webauthn_verifier.utils.js        # the only file that requires @simplewebauthn/server
  utilities/device_trust_decision.utils.js    # pure: the gate decision table
  controllers/trusted_device.controller.js
  controllers/hr_trusted_device.controller.js
  routes/trusted_device.routes.js
  routes/hr_trusted_device.routes.js
  validators/trusted_device.validator.js
src/cron-jobs/attendance_device_challenge_sweeper.cron.js
src/infrastructure/postgres-sql/migrations/00078-create-attendance-device-trust.js
```

Modified:

- `attendance.index.js` — mount two routers.
- `routes/user_attendance.routes.js` — four `requireTrustedDevice(...)` insertions.
- `validators/user_attendance.validator.js` — `device_proof` on four schemas (D-DT-19).
- `controllers/user_attendance.controller.js` — `trusted_device_id` through to the service;
  `ip_address` / `user_agent` on break handlers (D-DT-17).
- `services/clock.service.js` — accept and persist `data.trusted_device_id` and
  `metadata.device_trust` in the four `logRepository.create` calls. No other change; the
  gate decides nothing inside the transaction.
- `src/server.js` — register the sweeper cron; extend the boot config assertion.

`middlewares/` is a new directory under a module. `src/common/middlewares/require_feature.middleware.js`
already reaches into `modules/billing`, so the alternative placement has precedent — but
this gate is attendance-only and imports attendance models, so putting it in `common`
would invert the dependency for a feature nothing else uses. **Flagging as a convention
decision to confirm before implementation.**

---

### B.4 Endpoints

Employee plane — `trusted_device.routes.js`, mounted at `/api/v1/attendance`
(`authenticate` → `authorize(allOrgRoles)` → `requireFeature('attendance.access')`):

| # | Method | Path | Notes |
|---|---|---|---|
| 1 | GET | `/device-trust/context` | mode, enforced ops, my active count, approval mode, `enforce_from` (D-DT-13) |
| 2 | POST | `/device-trust/challenge` | `{operation}` → challenge + `allow_credentials`; `{required:false}` when off |
| 3 | POST | `/trusted-devices/registration/start` | OTP step-up + registration options; rate limited 5/h |
| 4 | POST | `/trusted-devices/registration/complete` | OTP + attestation, one transaction |
| 5 | GET | `/trusted-devices` | my devices; never returns `public_key` |
| 6 | PATCH | `/trusted-devices/:id` | rename only |
| 7 | POST | `/trusted-devices/:id/revoke` | self-revoke, no step-up (it only reduces access) |

HR plane — `hr_trusted_device.routes.js`, mounted at `/api/v1/attendance/hr`
(`authorize(['hr','admin','super-admin'])`):

| # | Method | Path | Notes |
|---|---|---|---|
| 8 | GET | `/trusted-devices` | org-wide; filters `user_id`, `status`, `platform`, `device_bound` |
| 9 | POST | `/trusted-devices/:id/approve` | `hr_approval` mode: `pending` → `active` |
| 10 | POST | `/trusted-devices/:id/reject` | `pending` → `revoked`, reason required |
| 11 | POST | `/trusted-devices/:id/revoke` | reason required |
| 12 | POST | `/trusted-devices/:id/suspend` | reason required |
| 13 | POST | `/trusted-devices/:id/reinstate` | `suspended` → `active` only; never un-revokes |
| 14 | GET | `/device-trust/policy` | `updated_at` is the ETag |
| 15 | PUT | `/device-trust/policy` | If-Match required; `assertUpdatedAtMatches` |
| 16 | GET | `/device-trust/events` | verification failures + lifecycle, paginated |
| 17 | GET | `/device-trust/coverage` | enrolled vs active-member count — the gate for flipping to `enforce` |

**Wire shapes for #1–#4 are pinned in the frontend guide**
(`public/md_attendance/device_trust_frontend_guide.md` §5), which was written against this
plan and fed eight refinements back into it (S-FE-1…8). The three that change this
section's contract:

- **S-FE-1/S-FE-2 — WebAuthn protocol payloads pass through verbatim.** `public_key` on #2
  and #3 is the unmodified W3C `PublicKeyCredential*OptionsJSON` (camelCase, base64url) as
  `@simplewebauthn/server` emits it, nested under a snake_case envelope. Symmetrically,
  `device_proof.assertion` and `registration.attestation` are accepted as the unmodified
  browser ceremony output. Do **not** snake_case or splat them — that translation is the
  largest bug class in WebAuthn clients and buys nothing.
- **S-FE-4 — `credential_type` is a required request field on #2 and #3.** The server
  cannot distinguish a browser from a native app, and a user may hold both kinds. No
  inference.
- **S-FE-5 — #1 additionally returns `effective_mode`, `challenge_ttl_seconds`,
  `allow_platform_web`, `allow_mobile_key`.** `effective_mode` is the `enforce_from`-folded
  value from §B.5 step 3; the client must branch on it, never on raw `mode`, or the UI
  demands a device during the grace window while the backend is still letting punches
  through.

Also from that review: #2's `timeout` in the generated options must be **shorter** than
`challenge_ttl_seconds` (120s vs 180s) so the browser fails first with a clean
`NotAllowedError` instead of the server returning a confusing expiry (S-FE-6); the
`device_key` challenge response echoes `device_id`/`user_id`/`org_id`/`operation` so the
canonical string is a pure function of one response body (S-FE-7); and the ECDSA
signature encoding is **DER**, with a 64-byte (IEEE-P1363) signature rejected with a
distinct developer-facing hint — verified on Node 22 that `crypto.verify` returns `false`
for P1363 with no error, which would otherwise surface as an undiagnosable 403 (S-FE-8).

`trusted-devices` never collides with the existing HR `/devices` (biometric terminals).
Path-shape rule from memory holds: the attendance module keys actor planes off the mount
prefix, so these stay under the existing `/hr` prefix rather than inventing a new base.

**Platform-plane roles.** `admin` / `super-admin` appear in the HR `authorize` list only
because every existing HR attendance route does; they get no tenant data by the standing
role-plane rule. Keep consistent with the module, do not widen.

**Role note on #8–#17.** `manager` is excluded. A manager seeing their reports'
device inventory is a plausible future ask but is not in the requirement, and device
metadata is security state, not team state.

---

### B.5 The gate

Route wiring, clock-in as the example:

```js
router.post('/clock-in',
  validate(validator.clockInSchema),          // 400 on a malformed body before any crypto
  requireTrustedDevice('clock_in'),           // verify + consume, or short-circuit
  controller.handlePostClockIn)
```

Order matters in both directions: **after** `validate` so a garbage body cannot burn a
challenge, and **before** the controller so the punch transaction never opens for an
untrusted device.

Middleware algorithm:

1. Global kill switch `ATTENDANCE_DEVICE_TRUST_ENABLED !== 'true'` → `next()`. **No DB
   read.** This is what makes the shipped code inert.
2. Read the org policy (60s in-process cache keyed by `org_id`; one row, trivially small).
   No row → treat as `off`.
3. Effective mode = `enforcement_mode === 'enforce' && (enforce_from === null || todayIST >= enforce_from)
   ? 'enforce' : (enforcement_mode === 'off' ? 'off' : 'monitor')`.
4. `off`, or `operation ∉ enforced_operations` → `next()`.
5. No `device_proof` in the body → `enforce`: 403 `ATTENDANCE_DEVICE_REQUIRED`;
   `monitor`: audit + `next()`.
6. Consume the challenge in its own committed statement (D-DT-4):

   ```sql
   UPDATE attendance_device_challenges
      SET consumed_at = now(), consumed_by_device_id = :deviceId
    WHERE id = :challengeId AND org_id = :orgId AND user_id = :userId
      AND purpose = 'assertion' AND operation = :operation
      AND consumed_at IS NULL AND expires_at > now()
   RETURNING challenge, device_id
   ```

   Zero rows → 400 `DEVICE_CHALLENGE_INVALID` + `retriable: true`. All five guards in one
   statement so there is no check-then-act window and no oracle.
7. Load the device by `credential_id` (web) or `id` (mobile), scoped to
   `org_id` **and** `user_id` — the BOLA boundary. Not found → 403
   `ATTENDANCE_DEVICE_REQUIRED`. `revoked` / `suspended` → the matching 403.
8. Verify. Web: `webauthn_verifier`. Mobile: `device_proof.verify` over the canonical
   bytes from D-DT-14.
9. Apply the sign-count rule (D-DT-9). Clone suspected → audit + 403; **no auto-revoke**
   (D-DT-10).
10. Persist `sign_count`, `last_used_at`, `last_ip`, `last_user_agent` in one conditional
    `UPDATE`. On failure: `enforce` → 403 (fail closed — a security-state write that did
    not land makes the clone check worthless, and a DB that cannot take this write will
    fail the punch transaction two lines later anyway); `monitor` → log and continue.
11. Stash `req.deviceTrust = { device_id, credential_type, outcome, challenge_id, mode }`
    and **`delete req.body.device_proof`** so the controller's `{...req.body}` spread
    cannot carry a signature into `data` and from there into `metadata`.
12. `monitor` mode never blocks: every failure above writes an audit row with the code it
    *would* have returned, then calls `next()`. That is the whole point of the mode, and
    the `/device-trust/events` endpoint is what an operator reads before flipping to
    `enforce`.

Exempt by construction, and each for a stated reason:

| Path | Why exempt |
|---|---|
| `POST /attendance/devices/webhook` | biometric terminal, attested by `api_key_hash` + `location_id` (D-DT-11) |
| `POST /attendance/regularization` | manager/HR approved; the recovery path (D-DT-5) |
| `auto_clock_out` / `auto_mark_absent` crons | system actor, no device exists |
| HR corrections, `recompute-stale` | HR plane, separately authorized and audited |

---

## Part C — Phases

Every phase lists what changes, why, what it depends on, the risk, and how correctness is
verified. **No test touches a database** — the repo rule. Sequelize builds the model
registry without connecting, so model metadata and generated SQL are both inspectable
offline (`catalog_drift.test.js` and `audience_targeting_sql.test.js` are the precedents).

### Phase 0 — decisions to confirm (blocking, no code)

| # | Decision | Recommendation |
|---|---|---|
| 0.1 | Does the client actually want physical-presence enforcement? | If yes, D-DT-3(b) is a separate, larger piece of work. Settle before building. |
| 0.2 | Accept `require_device_bound = true` by default, with the procurement implication? | Yes. Without it the feature does not meet §1 (D-DT-2). |
| 0.3 | `max_active_devices` default 1 or 2? | 1 per §22; 2 materially reduces lockout support load. Client's call. |
| 0.4 | Mobile app: is there one, and can it reach Keystore/Keychain? | If web-only today, Phase 2's `device_key` half can be deferred. Do not build it speculatively. |
| 0.5 | `@simplewebauthn/server` approved? | Yes, with the justification in B.2. |
| 0.6 | Module-local `middlewares/` directory acceptable? | Yes; see B.3. |
| 0.7 | Simulator orgs stay `off` forever, or enroll `device_key` credentials? | Stay `off`. Enrolling the simulator means a private key in a repo file. |

### Phase 1 — data model

**Changes.** `00078-create-attendance-device-trust.js`: three tables, every constraint and
index from B.1, the `attendance_logs.trusted_device_id` column, and a backfill inserting
one `attendance_device_policies` row per existing org with `enforcement_mode = 'off'`.
Three models. Three repositories. Associations registered on `Organization` and `User`.

**Why.** Everything downstream reads these shapes.

**Risk.** `attendance_logs` is a high-volume table; `ADD COLUMN ... NULL` with no default
is metadata-only on Postgres 11+ and does not rewrite. The new indexes are on new, empty
tables. `down()` drops the three tables and the column — **destructive, and it discards
the enrollment ledger**, so it carries the same warning as migration 00051.

**Verification.**
- `tests/unit/attendance/device_trust_model_shape.test.js` — model attributes, types,
  `allowNull`, defaults and index definitions match the migration field for field. Repo
  has precedent for this parity style.
- `device_policy_defaults.test.js` — every policy default is identical in model and
  migration; a drifted default is a silent production posture change.
- No DB connection. **The migration is handed back unrun** per the standing rule.

### Phase 2 — verification primitives (pure, no DB, no HTTP)

**Changes.** `device_proof.utils.js` (canonicalization + raw-key verify),
`webauthn_verifier.utils.js` (the dependency boundary + BE/BS extraction + sign-count
rule), `device_trust_decision.utils.js` (the gate decision table as a pure function).

**Why.** These are the security core. Isolating them from Express and Sequelize is what
makes them exhaustively testable offline, and it is why the gate middleware ends up
thin enough to review.

**Dependencies.** Phase 0.5. Nothing from Phase 1.

**Risk.** Highest-consequence code in the feature; also the easiest to test.

**Verification.**
- `device_proof_canonicalization.test.js` — the `("ab","c")` vs `("a","bc")` collision is
  rejected; domain prefix present; byte-stable; a changed field changes the digest.
- `device_key_signature_verification.test.js` — real keypairs from
  `crypto.generateKeyPairSync` for P-256 / Ed25519 / RSA-2048; sign, verify true; tamper
  one byte of challenge, operation, device id, user id → false; wrong key → false;
  malformed base64 → `false`, never a throw; RSA-1024 rejected. **Plus the DER/P1363 case
  (S-FE-8):** a 64-byte IEEE-P1363 ECDSA signature over valid canonical bytes must be
  rejected with the distinct hint code, not a bare `false` — verified that Node's
  `crypto.verify` returns `false` for P1363 with no error, so without this the symptom is
  an undiagnosable 403 on every punch from a WebCrypto-based mobile client.
- `canonical_test_vector.test.js` — asserts the published vector in the frontend guide
  §8.3 (`sha256 = e44145702f26…f9c3`, 244 bytes) still holds. This is the contract the
  mobile client implements against; drifting it silently breaks every native build.
- `webauthn_flag_policy.test.js` — BE/BS → `device_bound` decision table;
  `require_device_bound` rejects backup-eligible; the full sign-count matrix from D-DT-9
  including `0/0` → allow and `5 → 5` → reject.
- `device_trust_decision.test.js` — the complete gate matrix across
  `{mode} × {operation enforced?} × {proof present?} × {device status} × {verify result} × {enforce_from}`:
  `off` skips, operation-not-enforced skips, `monitor` allows on failure and audits,
  `enforce_from` in the future degrades `enforce` to `monitor`.

### Phase 3 — registration and lifecycle (#1–#7)

**Changes.** `device_trust.service.js` (policy read + cache, challenge issue/consume),
`trusted_device.service.js` (registration, rename, self-revoke), controller, routes,
validators. New OTP context `attendance_device_registration`. Rate limits via the existing
`checkOrgRate` with `keyPrefix: 'devtrust'` and a per-user bucket
(`` `reg:${userId}` ``): registration 5/h, challenge 60/h.

**`registration/complete` is one transaction**, in this order:

1. `otpRepository.findValidOtpForUpdate` — locks the OTP row (`FOR UPDATE`).
2. Consume the `purpose='registration'` challenge (conditional UPDATE).
3. `pg_advisory_xact_lock` on `(org_id, user_id)`; **re-count** active devices under the
   lock (D-DT-6).
4. Verify attestation / validate the submitted SPKI; reject weak keys (RSA < 2048).
5. Enforce `require_device_bound` (D-DT-2).
6. Insert the device — `active` under `otp`, `pending` under `hr_approval`.
7. If `replace_device_id`: revoke it, set the `replaced_device_id` back-link.
8. `otpRepository.consumeAndDelete`.
9. Audit row.

**Why that order.** The OTP lock is taken first so two concurrent completions cannot both
consume it. The cap is re-counted *after* the advisory lock, never before — the whole
reason the lock exists. Replacement revokes inside the same transaction as the insert, so
there is no window with zero active devices (which would wrongly 403 a concurrent punch)
and no window with two (which would breach the cap).

**Risk.** The highest-privilege endpoint in the feature. §38 is the paragraph it
implements.
- `409 DEVICE_LIMIT_REACHED` must return the current device list, or the user cannot tell
  which device to replace.
- `replace_device_id` must be validated as owned-by-caller and currently `active`.
- Unique-violation mapping per B.1 — never a 500.
- **The OTP must not appear in the response.** A prior security audit in this repo fixed
  exactly that bug; do not reintroduce it.

**Verification.**
- `device_registration_cap.test.js` — cap logic, `replace_device_id` happy path,
  not-owned, already-revoked, and the re-count-under-lock ordering.
- `device_registration_transaction_order.test.js` — a stubbed-repository test asserting
  the call order above, so a future refactor cannot move the cap count before the lock.
- `device_registration_otp_context.test.js` — the context string is
  `attendance_device_registration` and a `registration` or `forgot_password` OTP is
  rejected (cross-context replay).
- `trusted_device_response_shape.test.js` — `public_key`, `sign_count` and any OTP are
  absent from every response.
- `device_error_contract.test.js` — the D-DT-7 code → status map; asserts **no**
  device-trust code maps to 401.

### Phase 4 — the gate

**Changes.** `require_trusted_device.middleware.js`; four insertions in
`user_attendance.routes.js`; `device_proof` on four schemas; `trusted_device_id` and
`metadata.device_trust` through the controller into the four `logRepository.create` calls;
`ip_address` / `user_agent` on the break handlers (D-DT-17).

**Why.** This is the requirement.

**Dependencies.** Phases 1–3.

**Risk.** The only phase that can break existing attendance. Mitigated by the kill switch
plus `off` default: with `ATTENDANCE_DEVICE_TRUST_ENABLED` unset the middleware returns
before reading anything, so the punch path is byte-for-byte the current behaviour.

**Verification.**
- `trusted_device_gate_wiring.test.js` — all four punch routes carry the middleware with
  the correct operation literal, it sits **after** `validate` and **before** the
  controller, and no read route carries it. A route-table assertion, so a future route
  edit that drops the gate fails CI.
- `punch_schema_device_proof_drift.test.js` — `device_proof` is present in all four punch
  schemas (D-DT-19) and is `optional()` (so `off` and `monitor` modes still accept bodies
  without it).
- `challenge_consume_sql.test.js` — the generated consume SQL contains all five guards,
  asserted against the SQL text in the style of `audience_targeting_sql.test.js`.
- `gate_source_claim_regression.test.js` — `source: 'biometric'` in a punch body is
  rejected by Joi and does not change the gate decision (D-DT-8).
- `gate_proof_not_persisted.test.js` — after the middleware, `req.body.device_proof` is
  gone and no signature reaches `logRepository.create`.
- `simulator_payload_unaffected.test.js` — with the kill switch off, the simulator's exact
  payload shape passes the gate as a no-op (D-DT-15).

### Phase 5 — HR administration, audit, observability (#8–#17)

**Changes.** `hr_trusted_device.controller.js`, `hr_trusted_device.routes.js`, HR service
methods, policy read/write with If-Match via `assertUpdatedAtMatches`, the events and
coverage readouts, and the challenge sweeper cron (03:50 IST; deletes `consumed_at IS NOT NULL
OR expires_at < now() - 7 days`, retaining a week for forensics).

Audit goes to the existing `attendance_audit_logs` with
`entity_type = 'attendance_trusted_device'` and actions
`device_registered` / `device_approved` / `device_revoked` / `device_suspended` /
`device_reinstated` / `device_verification_failed` / `device_clone_suspected` /
`device_policy_updated`. Satisfies §34 without a new table. Never log a signature, an
assertion or a public key.

`#17 /device-trust/coverage` exists because it is the one number an operator needs before
flipping to `enforce`: enrolled users vs active members. Per the deactivated-member
visibility contract, "active member" means `user_roles.is_active = true` — that is the only
tenant signal, and getting it wrong here would make coverage look complete when it is not.

**Risk.** `#13 reinstate` must accept `suspended` only. Allowing `revoked` → `active`
would make revocation reversible and defeat §24's lost-device flow.

**Verification.**
- `device_admin_authz.test.js` — every HR endpoint rejects `employee` and `manager`;
  every mutation requires a reason; cross-org device ids 404 (BOLA).
- `device_state_machine.test.js` — the full legal-transition table;
  `revoked → active` is rejected from every entry point.
- `device_policy_if_match.test.js` — `updated_at` ETag, 412 on mismatch, in the shape of
  `tests/unit/settings/if_match.test.js`.
- `device_audit_payload.test.js` — audit rows carry actor, target, device, operation,
  IP, user-agent and reason code, and carry **no** signature, assertion or public key.
- `device_coverage_active_member.test.js` — coverage counts `user_roles.is_active` members
  only.

### Phase 6 — documentation and rollout

**Changes.**

- `public/md_updates/2026-10-15_attendance_device_trust.md` — the frontend change record
  CLAUDE.md requires. Must cover: the new `device_proof` body field on four existing
  endpoints; the full error-code → status table from D-DT-7 with an explicit "**these are
  403, do not treat as a session expiry**" note; the challenge → sign → submit sequence;
  `retriable` semantics; the three enforcement modes and what the UI shows in each;
  `registration_required`; and the `trusted_device_id` addition to punch responses.
- `public/md_attendance/device_trust_frontend_guide.md` — **already written** (2026-10-15).
  Keep it in step with any contract change; its §5 is the pinned wire contract and its
  §8.3 test vector is what native clients build against.
- `public/md_attendance/ATTENDANCE_API_CONTRACT.md` — extend. That file is authoritative;
  the numbered `md_attendance` docs are stale and must not be updated.
- A rollout runbook, as §C.5.
- `.env.example` — `ATTENDANCE_DEVICE_TRUST_ENABLED`, `WEBAUTHN_RP_ID`,
  `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS`.

**Verification.** `npm test` green. Migration 00078 handed back unrun.

### C.4 Cron

`attendance_device_challenge_sweeper.cron.js`, 03:50 IST, registered in `src/server.js`
inside the existing `os.platform() === 'linux' && cronJobsEnabled` block. Bounded delete
(`LIMIT 5000` per pass, loop until under the limit) so a backlog cannot hold a long
transaction open.

### C.5 Rollout

Config, all opt-in:

- `ATTENDANCE_DEVICE_TRUST_ENABLED` (default `false`) — global kill switch, checked before
  any DB read. Mirrors the `PDF_BULK_GENERATION_ENABLED` precedent.
- `WEBAUTHN_RP_ID` — the eTLD+1 of the frontend origin. Wrong value = every registration
  fails with a browser-side error nobody can read server-side.
- `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS` (comma-separated allowlist).

Boot: extend the existing `assertTokenSecretsConfigured` block so that when
`ATTENDANCE_DEVICE_TRUST_ENABLED === 'true'` and any of the RP values are missing, the
process **refuses to start**. The same reasoning the comment at `src/server.js:21` already
gives for token secrets: there is no safe default, so a missing one must stop the process
rather than degrade quietly. If enforcement were on with no RP id, the gate would reject
every punch in the org.

Sequence:

1. Deploy with the kill switch `false`. All code inert. Verify no change to punch latency
   or behaviour.
2. Operator runs migration 00078.
3. Flip the kill switch `true`. Every org is still `off`; the only live endpoints are the
   readouts and enrollment.
4. Pilot org → `enforcement_mode = 'monitor'`. Communicate; open enrollment.
5. Watch `#16 events` and `#17 coverage` for 1–2 weeks. **Gate: coverage ≥ 95% of active
   members, and zero unexplained verification failures.**
6. Set `enforce_from` two weeks out and `enforcement_mode = 'enforce'`. The grace window
   means step 6 is reversible without a deploy — clear `enforce_from` or drop back to
   `monitor`.
7. On the date, enforcement engages. Keep `monitor` as the documented rollback.
8. Repeat per org.

**Hard constraint:** any org with `ENABLE_ATTENDANCE_SIMULATOR=true` stays at `off`
(Phase 0.7). The simulator authenticates with a bearer token and holds no key.

---

## Part D — Residual risks after full implementation

Stated plainly, because none of these are solved by this work:

1. **Remote punching is not prevented** (D-DT-3). The enrolled phone travels with the
   employee. Only location/network controls address this, and this repo's are advisory.
2. **Collusion is not prevented.** Handing over an unlocked phone defeats any
   device-bound scheme. User verification raises the cost; it does not close it.
3. **Rooted/jailbroken devices.** Key extraction from a compromised Keystore is possible.
   Play Integrity / DeviceCheck attestation would raise the bar — not in scope.
4. **Lost-device window.** Between loss and revocation, the finder who can unlock the
   device can punch. Mitigated only by how fast the employee reports it.
5. **A reviewed bypass remains open** by design (D-DT-5). Regularization volume is the
   metric that tells you if it is being abused.
6. **Enrollment is the weakest link.** The whole scheme reduces to the strength of
   `registration/complete`. OTP to a verified identifier is step-up, not MFA; an attacker
   with both the password and the mailbox can enroll. `hr_approval` mode is the answer for
   orgs that need more, and it is why that mode exists.

---

## Part E — Where this plan departs from the source document

| Source | This plan | Reason |
|---|---|---|
| `attendance_devices` | `attendance_trusted_devices` | D-DT-1, the name is taken |
| §11 WebAuthn, unqualified | WebAuthn **with BE-flag rejection** | D-DT-2, synced passkeys are not devices |
| §22 cap via unique constraint | cap via advisory lock + re-count | D-DT-6, the cap is configurable |
| §30 ~60s TTL | 180s, configurable 30..600 | D-DT-12, real-world prompt latency |
| §30 consume order unspecified | consume **before** the punch, committed separately | D-DT-4, replay protection must not depend on a business outcome |
| §31 string concatenation | length-prefixed, domain-separated, `v1` | D-DT-14, boundary-shift forgery |
| §33 no status codes | fixed code → status table, never 401 | D-DT-7, 401 triggers SPA logout |
| §27 shared org terminals | out of scope; existing biometric path | D-DT-11, incompatible credential model |
| §35 react to failures | audit + alert, **never** auto-revoke | D-DT-10, self-inflicted DoS |
| §41 steady state only | `off` → `monitor` → `enforce` + grace date + kill switch | D-DT-15, day one is an outage |
| §39 three recovery mechanisms | exactly two (`otp`, `hr_approval`) | D-DT-18, pick one and ship it |
| new feature key implied | org policy row only | D-DT-16, `attendance.geofencing` is the cautionary precedent |

---

## Appendix — estimated size

| Phase | New | Modified | Tests |
|---|---|---|---|
| 1 | 1 migration, 3 models, 3 repos | 0 | 2 |
| 2 | 3 utilities | 0 | 4 |
| 3 | 2 services, 1 controller, 1 route, 1 validator | 0 | 5 |
| 4 | 1 middleware | 4 attendance files | 6 |
| 5 | 1 controller, 1 route, 1 cron | `server.js` | 5 |
| 6 | 2 docs | 2 docs, `.env.example` | — |

Phases 1–2 are independent and can proceed in parallel once Phase 0 is settled.
Phase 4 is the only one that touches the existing punch path.
