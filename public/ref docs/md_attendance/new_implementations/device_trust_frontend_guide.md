# Attendance Device Trust — Frontend Implementation Guide

**Companion to:** `public/md_attendance/device_trust_implementation_plan.md`
**Date:** 2026-10-15
**Status:** Contract proposal. Backend is **not built yet** — this guide is written now so the
contract can be argued with before it is implemented, not after.
**Audience:** web frontend + native mobile engineers.

---

## 1. The mental model

Today a punch is one call:

```
POST /api/v1/attendance/clock-in      { source, latitude, longitude, work_mode }
```

After device trust it is **three steps and two calls**:

```
1.  POST /attendance/device-trust/challenge   { operation: "clock_in" }
        → a one-time challenge
2.  (browser / OS)  sign the challenge with the device's private key
        → user touches Touch ID / Windows Hello / fingerprint
3.  POST /attendance/clock-in   { ...same body as before, device_proof: { ... } }
```

Three things to internalise before writing any code:

- **The private key never leaves the device and the frontend never sees it.** You are not
  implementing cryptography. You are calling one browser API (`navigator.credentials`) or
  one native API (Keystore / Keychain) and forwarding its output verbatim.
- **A challenge is single-use and dies on first submit, success or failure.** There is no
  such thing as retrying a punch with the same `device_proof`. Every attempt starts at
  step 1. See §3.1 — this is the rule that breaks naive retry logic.
- **This is not login.** The user is already authenticated. A device failure is **403, never
  401**, and must never trigger your logout/refresh interceptor. See §3.2.

---

## 2. Contract refinements I'm requesting from the backend

I wrote the backend plan, then designed the client against it, and the client exercise
found eight things worth changing. **Every shape in this guide assumes these are
accepted.** If backend rejects any of them, the affected section changes.

---

**S-FE-1 — Return the W3C WebAuthn JSON verbatim; do not snake_case it.**

The plan's §B.4 #3 says only "OTP step-up + registration options" and never pins the wire
shape. Left unspecified, the repo's snake_case convention would be applied by default,
giving the frontend `pub_key_cred_params`, `authenticator_selection`,
`exclude_credentials` — and forcing it to translate snake_case → camelCase → and then
base64url → `ArrayBuffer` by hand. That translation is the single largest source of
WebAuthn frontend bugs, and it is pure busywork: the W3C already defines a JSON
serialization (`PublicKeyCredentialCreationOptionsJSON` /
`PublicKeyCredentialRequestOptionsJSON`) which both the browser
(`PublicKeyCredential.parseCreationOptionsFromJSON()`) and `@simplewebauthn/browser`
consume directly.

**Request:** nest the protocol payload **verbatim, camelCase, unmodified** under a
snake_case wrapper, so the repo's JSON convention holds at the envelope level while the
protocol payload stays pass-through:

```json
{ "required": true, "challenge_id": "...", "public_key": { /* verbatim W3C JSON */ } }
```

Backend already has the right generator — `@simplewebauthn/server`'s
`generateRegistrationOptions()` / `generateAuthenticationOptions()` return exactly this
shape. Pass it through. Symmetrically, accept the browser's response verbatim (S-FE-2).

---

**S-FE-2 — Accept the ceremony output verbatim, as one nested object.**

`device_proof.assertion` is the unmodified return value of
`startAuthentication()` / `credential.toJSON()`. `registration.attestation` likewise.
Do not ask the frontend to splat `clientDataJSON`, `authenticatorData`, `signature` and
`userHandle` into sibling snake_case fields — every splat is a chance to drop
`userHandle` (which is legitimately `null`) or to re-encode base64url as base64.

---

**S-FE-3 — `residentKey` must be pinned to `'discouraged'`. The library default fights D-DT-2.**

The plan (D-DT-2) specifies `authenticatorAttachment: 'platform'` and
`userVerification: 'required'` but is **silent on `residentKey`**. Silence is the bug.
Verified against `@simplewebauthn/server@14.0.3`:

```
generateRegistrationOptions({ rpName, rpID, userName })
  → authenticatorSelection: { residentKey: 'preferred',
                              userVerification: 'preferred',
                              requireResidentKey: false }
```

So an implementer who calls the generator with exactly the fields the plan names inherits
`residentKey: 'preferred'` **and** silently loses the `userVerification: 'required'` the
plan asked for. Both defaults must be overridden explicitly.

`residentKey: 'preferred'` matters because a *discoverable* (resident) credential is
precisely what Chrome routes into Google Password Manager and Safari into iCloud Keychain
— i.e. the default maximises the chance of minting a backup-eligible credential that the
server then rejects with `422 DEVICE_NOT_HARDWARE_BOUND`, **after** the user has already
completed the biometric prompt. That is the worst possible UX: effort, then failure, with
no way for the frontend to have predicted it.

`'discouraged'` + `requireResidentKey: false` produces a non-discoverable, device-local
credential on current Chrome/Safari/Edge. We can afford non-discoverable because this is
not a login flow and we always send `allowCredentials`.

This does not remove the server-side BE-flag check — a client hint is not a guarantee —
but it turns the 422 from the common case into the rare case.

---

**S-FE-4 — `credential_type` is a required request field, not something the server infers.**

The server cannot tell a browser from a native app, and a user may hold both a `webauthn`
credential (laptop) and a `device_key` credential (phone). Make it explicit: the web app
always sends `"webauthn"`, the native app always sends `"device_key"`. No inference, no
ambiguity. If the user has no active device of the requested type, the response is
`registration_required: true`.

---

**S-FE-5 — `GET /device-trust/context` must also return `effective_mode`, `challenge_ttl_seconds`, `allow_platform_web`, `allow_mobile_key`.**

The plan computes `effective_mode` server-side (§B.5 step 3, folding in `enforce_from`)
but never exposes it. The frontend must **only ever branch on `effective_mode`** —
branching on the raw `mode` would make the UI demand a device during the grace window,
when the backend is still letting punches through. Return both, and say in the field docs
that `mode` is display-only ("HR has set enforcement to X, effective from Y").

`challenge_ttl_seconds` lets the client size its own browser timeout (S-FE-6). The two
`allow_*` flags tell the enrollment screen which paths to offer.

---

**S-FE-6 — The browser timeout must be shorter than the server TTL.**

Server TTL is 180s. Put `timeout: 120000` in the WebAuthn options the server generates.
If the browser timeout is the longer of the two, a slow user completes the prompt and gets
a server-side `DEVICE_CHALLENGE_INVALID` — indistinguishable from a backend bug. With the
browser timing out first, the failure is a clean `NotAllowedError` the frontend can label
accurately ("took too long, try again").

---

**S-FE-7 — For `device_key`, return every field the canonical string needs.**

Return `device_id`, `user_id`, `org_id`, `operation` and `challenge` in the challenge
response, rather than letting the mobile client assemble them from its own cached state.
A client whose cached `org_id` is stale after an org switch would produce a valid
signature over the wrong bytes and get an unexplainable `DEVICE_VERIFICATION_FAILED`.
Echoing them makes the canonical string a pure function of one response body.

---

**S-FE-8 — Declare the ECDSA signature encoding in the contract, explicitly.**

Verified on Node 22 against the planned verifier:

| Encoding | Length | Node `crypto.verify` default (`dsaEncoding: 'der'`) |
|---|---|---|
| DER / X9.62 (ASN.1 SEQUENCE) | 70–72 bytes, variable | **accepts** |
| IEEE P1363 (raw `r‖s`) | 64 bytes, fixed | **silently returns `false`** |

Android `Signature.getInstance("SHA256withECDSA")` and iOS
`SecKeyCreateSignature(.ecdsaSignatureMessageX962SHA256)` both emit DER — fine. **WebCrypto
`subtle.sign({name:'ECDSA'})` emits raw P1363** — so a React Native build using a WebCrypto
polyfill will produce signatures that fail verification with no diagnostic, and the symptom
is a 403 that looks like a server bug.

The contract must say **DER**, and the backend should reject a 64-byte ECDSA signature with
a distinct developer-facing hint rather than a generic verification failure.

---

## 3. Four hard obligations — read before writing code

### 3.1 Never reuse, cache, persist or retry a challenge

A challenge is consumed by the **first** submit that reaches the gate, whether the punch
then succeeds or fails on a business rule (`ALREADY_CLOCKED_IN`, `ATTENDANCE_LOCKED`,
`NOT_CLOCKED_IN`, `MAX_BREAKS_EXCEEDED`, …). The backend consumes before the punch
deliberately — a replayable signature is a security hole, a re-prompt is an inconvenience.

Consequences you must build for:

- Any retry of a punch — including your HTTP client's automatic retry — **must restart at
  step 1**. If you have a generic retry interceptor on `POST`, **exclude the four punch
  endpoints from it**, or it will fire a second request with a dead `device_proof` and the
  user will see `DEVICE_CHALLENGE_INVALID` instead of the real error.
- Never put a challenge in Redux/Zustand/React Query cache, `localStorage`, or a
  `useMemo`. It is request-scoped. Hold it in a local variable for the duration of one
  ceremony and let it go.
- A network timeout on step 3 is **ambiguous**: the punch may have committed. Do not
  auto-retry. Re-read `GET /attendance/today` and reconcile from the server's state.

### 3.2 Exclude device-trust codes from your auth interceptor

Every device-trust rejection is **403**. If your interceptor treats 403 as "session
problem" (many do, alongside 401) it will clear the token and bounce the user to login.
They will log back in successfully, which makes the bug look random and un-reproducible.

```ts
const DEVICE_TRUST_CODES = new Set([
  'ATTENDANCE_DEVICE_REQUIRED',
  'ATTENDANCE_DEVICE_REVOKED',
  'ATTENDANCE_DEVICE_SUSPENDED',
  'DEVICE_VERIFICATION_FAILED',
  'DEVICE_CHALLENGE_INVALID',
  'DEVICE_NOT_HARDWARE_BOUND',
  'DEVICE_LIMIT_REACHED',
  'DEVICE_ALREADY_REGISTERED',
  'DEVICE_TRUST_MISCONFIGURED',
])

// in the response interceptor, BEFORE any logout logic:
if (DEVICE_TRUST_CODES.has(error.response?.data?.code)) return Promise.reject(error)
```

No device-trust code is ever 401. If you see a 401 on a punch, it is a genuine token
problem, unrelated to this feature.

### 3.3 One ceremony at a time, and abort it on unmount

`navigator.credentials.get()` / `.create()` throw if a ceremony is already pending in the
same browser. A double-tapped Check In button, or a component that remounts mid-prompt,
produces `InvalidStateError` or an immediate `NotAllowedError` — reported by users as
"the fingerprint thing just closed".

- Disable the punch button for the **entire** three-step flow, not just the HTTP call.
- Keep an `AbortController` per ceremony and abort it in your cleanup / `useEffect`
  teardown.
- A double-tap also burns two challenge rows against your 60/hour budget (§7).

### 3.4 Drop optimistic UI on the punch button

If the button currently flips to "Clocked In" before the response lands, remove that. The
flow now has a user-interaction step in the middle and three new failure classes after it.
Show real progress instead — users double-tap undifferentiated spinners:

```
"Verifying device…"   → step 1
"Touch your sensor"   → step 2 (the OS prompt is up)
"Clocking in…"        → step 3
```

---

## 4. The three enforcement modes, and what the UI shows

Branch on `effective_mode` from `GET /device-trust/context` (**never** on `mode` — S-FE-5).

| `effective_mode` | Backend behaviour | What the UI does |
|---|---|---|
| `off` | gate is a no-op; `device_proof` ignored | **Exactly today's UI.** Skip steps 1–2 entirely. Hide the device screens. |
| `monitor` | verifies if proof is sent, records the result, **allows the punch either way** | Run the full flow. **On any device failure, punch anyway without the proof** and show nothing. Show a soft banner: "Register this device before <enforce_from> to keep clocking in." |
| `enforce` | no valid proof → 403 | Full flow. A device failure blocks the punch and routes to enrollment. |

`monitor` is the mode this ships into, and getting it right is what makes rollout safe. The
rule is: **in `monitor`, a device failure must never block a punch.** Catch the error,
re-submit the punch with no `device_proof` at all, and keep quiet. If you instead surface
the error, HR gets a support queue during the pilot and the rollout stalls.

```ts
if (ctx.effective_mode === 'monitor') {
  try   { return await punchWithProof(op, body) }
  catch (e) { if (isDeviceTrustError(e)) return await punchWithoutProof(op, body); throw e }
}
```

Cache the context for the session; invalidate it on any device-trust error code. A stale
`mode` costs one failed punch that self-corrects on the refetch. Fetch it **in parallel**
with `GET /attendance/today` on screen mount — do not serialise the two.

---

## 5. API reference

### Employee plane — base `/api/v1/attendance`

All require the normal `Authorization: Bearer <JWT>`.

---

#### #1 `GET /device-trust/context`

**Purpose.** The single state read that decides what every attendance screen renders. Call
it on attendance screen mount, in parallel with `/today`.

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "mode": "enforce",
    "effective_mode": "monitor",
    "enforce_from": "2026-11-01",
    "enforced_operations": ["clock_in", "clock_out", "break_start", "break_end"],
    "my_active_device_count": 0,
    "max_active_devices": 1,
    "registration_approval": "otp",
    "require_device_bound": true,
    "allow_platform_web": true,
    "allow_mobile_key": true,
    "challenge_ttl_seconds": 180
  }
}
```

- `enabled: false` → the whole feature is off globally. Treat as `effective_mode: 'off'`.
- `effective_mode` is `monitor` here even though `mode` is `enforce`, because
  `enforce_from` is in the future. **Branch on `effective_mode`.**
- `enforced_operations` is a subset — an org may gate clock-in/out but not breaks. Check
  membership before running the flow for a given operation; if absent, punch as today.
- `my_active_device_count` vs `max_active_devices` drives the enrollment screen: at the cap,
  registration requires `replace_device_id`.
- `registration_approval: 'hr_approval'` means a newly registered device lands `pending` and
  **cannot punch until HR approves**. The enrollment success screen must say so, or the user
  will enroll, try to punch, get 403, and re-enroll in a loop.

---

#### #2 `POST /device-trust/challenge`

**Purpose.** Step 1. Mints one single-use challenge bound to one operation.

```json
{ "operation": "clock_in", "credential_type": "webauthn" }
```

`operation` ∈ `clock_in | clock_out | break_start | break_end`. `credential_type` is
required (S-FE-4): `webauthn` from the browser, `device_key` from a native app.

Three possible responses, all `200`:

**(a) not required** — mode is `off`, or this operation is not enforced:

```json
{ "success": true, "data": { "required": false } }
```

Punch exactly as today. Do not prompt.

**(b) required, and the user has an active device of this type:**

```json
{
  "success": true,
  "data": {
    "required": true,
    "challenge_id": "3f1c9a7e-5b2d-4e8a-9c1f-0a7b6d4e2c88",
    "expires_at": "2026-10-15T09:03:00.000Z",
    "credential_type": "webauthn",
    "public_key": {
      "challenge": "k7Qx2Zr9vN1tH8sL4mJ6wP0yB3dF5gC7aE9iK2oU1xQ",
      "rpId": "hrclouds.com",
      "allowCredentials": [
        { "id": "AbCd...", "type": "public-key", "transports": ["internal"] }
      ],
      "userVerification": "required",
      "timeout": 120000
    }
  }
}
```

`public_key` is verbatim W3C JSON — hand it straight to `startAuthentication()`.

**(c) required, but the user has no active device of this type:**

```json
{ "success": true, "data": { "required": true, "registration_required": true } }
```

Route to enrollment. **Do not** call `navigator.credentials.get()` with an empty
`allowCredentials` — that opens a credential picker listing unrelated passkeys and is a
dead end.

For `credential_type: "device_key"`, (b) returns a `device_key` block instead (see §8).

**Why a separate call rather than piggybacking on `/today`:** the challenge is single-use
and 180s-lived, so it cannot be fetched with the screen. One challenge per punch attempt,
fetched at the moment of the attempt.

---

#### #3 `POST /trusted-devices/registration/start`

**Purpose.** Opens enrollment. Does **two** things at once: sends an OTP to the user's
verified email/phone (the step-up that stops a stolen session from enrolling an attacker's
device) and returns the WebAuthn creation options.

```json
{ "credential_type": "webauthn", "device_name": "Chrome on Windows", "replace_device_id": null }
```

- `device_name` — 1–100 chars, shown in the user's and HR's device list. Prefill from UA
  parsing, let the user edit. Do not send a raw User-Agent string.
- `replace_device_id` — required **only** when already at `max_active_devices`.

```json
{
  "success": true,
  "data": {
    "request_id": "7c2a...",
    "otp_sent_to": "a****k@gmail.com",
    "otp_expires_at": "2026-10-15T09:10:00.000Z",
    "challenge_id": "9b4f...",
    "expires_at": "2026-10-15T09:03:00.000Z",
    "public_key": {
      "challenge": "...",
      "rp":   { "id": "hrclouds.com", "name": "HR Clouds" },
      "user": { "id": "...", "name": "abhishek@example.com", "displayName": "Abhishek Ganeshe" },
      "pubKeyCredParams": [{ "alg": -7, "type": "public-key" }, { "alg": -257, "type": "public-key" }],
      "authenticatorSelection": {
        "authenticatorAttachment": "platform",
        "userVerification": "required",
        "residentKey": "discouraged",
        "requireResidentKey": false
      },
      "excludeCredentials": [{ "id": "...", "type": "public-key" }],
      "attestation": "none",
      "timeout": 120000
    }
  }
}
```

- **The OTP is never in the response.** It arrives by email/SMS. `otp_sent_to` is masked
  and exists only so the UI can say where to look.
- Note the two independent clocks: `expires_at` (challenge, ~180s) and `otp_expires_at`
  (OTP, minutes). The challenge usually dies first — so run the WebAuthn ceremony
  **immediately**, then collect the OTP. See §6.1 for why that order matters.
- `409 DEVICE_LIMIT_REACHED` → `details.devices[]` lists the current devices so the user can
  pick one to replace. Re-call with `replace_device_id`.
- Rate limited **5/hour per user**.

---

#### #4 `POST /trusted-devices/registration/complete`

**Purpose.** Verifies the OTP and the attestation in one transaction and creates the device.
Either both land or neither does.

```json
{
  "request_id": "7c2a...",
  "otp": "418207",
  "challenge_id": "9b4f...",
  "credential_type": "webauthn",
  "device_name": "Chrome on Windows",
  "replace_device_id": null,
  "attestation": { /* verbatim startRegistration() output */ }
}
```

```json
{
  "success": true,
  "message": "Device registered",
  "data": {
    "id": "b84d...",
    "device_name": "Chrome on Windows",
    "platform": "web",
    "status": "active",
    "device_bound": true,
    "registered_at": "2026-10-15T09:02:40.000Z",
    "replaced_device_id": null
  }
}
```

`status` is `active` under `registration_approval: 'otp'` and `pending` under
`'hr_approval'`. **Render these differently** — a `pending` device cannot punch yet.

Failure modes, in the order they bite in practice:

| Code | Status | What happened | What the UI does |
|---|---|---|---|
| `DEVICE_NOT_HARDWARE_BOUND` | 422 | a synced/cloud passkey was created | §6.3 — the one that needs a real explanation |
| `OTP_INVALID` | 400 | wrong or expired code | let them re-enter; **the challenge is also gone** → restart from #3 |
| `DEVICE_CHALLENGE_INVALID` | 400 | they took >180s | restart from #3 |
| `DEVICE_LIMIT_REACHED` | 409 | raced to the cap | re-read #5, offer replacement |
| `DEVICE_ALREADY_REGISTERED` | 409 | this credential was already enrolled (possibly revoked) | tell them to use a different authenticator; a revoked credential is **not** reinstated |

---

#### #5 `GET /trusted-devices`

**Purpose.** "My registered devices" screen.

```json
{
  "success": true,
  "data": [{
    "id": "b84d...",
    "device_name": "Chrome on Windows",
    "platform": "web",
    "status": "active",
    "device_bound": true,
    "registered_at": "2026-10-15T09:02:40.000Z",
    "last_used_at": "2026-10-15T09:31:02.000Z",
    "last_ip": "49.36.x.x",
    "revoke_reason": null
  }]
}
```

Never returns `public_key`, `credential_id` or `sign_count`. Show `last_used_at` and
`last_ip` — they are how a user notices a device they do not recognise. Label them as
informational, not as security identity.

---

#### #6 `PATCH /trusted-devices/:id` — `{ "device_name": "Work Laptop" }`

Rename only. Nothing else about a device is editable by its owner.

---

#### #7 `POST /trusted-devices/:id/revoke` — `{ "reason": "lost" }`

Self-revoke. No OTP step-up: revoking only ever **reduces** access, so gating it would
mean a user who just lost their phone cannot shut it off.

**Irreversible.** Confirm destructively ("You will not be able to clock in from this device
again, and re-registering the same credential is not possible"). After revoking the last
active device the user cannot punch at all until they enroll a new one — if
`effective_mode === 'enforce'`, say that in the confirmation dialog.

---

### HR plane — base `/api/v1/attendance/hr`

`hr` only (plus the platform roles the module already lists). **`manager` has no access.**

| # | Endpoint | Screen it drives |
|---|---|---|
| #8 | `GET /trusted-devices` | device inventory table; filters `user_id`, `status`, `platform`, `device_bound` |
| #9 | `POST /trusted-devices/:id/approve` | the `pending` approval queue (`hr_approval` mode only) |
| #10 | `POST /trusted-devices/:id/reject` | same queue; **reason required** |
| #11 | `POST /trusted-devices/:id/revoke` | reason required; use for offboarding and lost devices |
| #12 | `POST /trusted-devices/:id/suspend` | reason required; reversible, unlike revoke |
| #13 | `POST /trusted-devices/:id/reinstate` | `suspended` → `active` **only**; a revoked device never comes back |
| #14 | `GET /device-trust/policy` | the policy form; `data.updated_at` is your `If-Match` token |
| #15 | `PUT /device-trust/policy` | **`If-Match` mandatory** → `412` means re-read, reconcile, resubmit. Never retry blindly |
| #16 | `GET /device-trust/events` | verification failures + lifecycle audit, paginated |
| #17 | `GET /device-trust/coverage` | enrolled vs active members — the number HR needs before switching to `enforce` |

Two UI obligations on the HR side:

- **#15 must warn before `enforce`.** Switching `enforcement_mode` to `enforce` with
  coverage below ~95% (#17) locks out the uncovered employees. Show the coverage number
  inside the confirmation dialog and default `enforce_from` to two weeks out, not today.
- **#13 must not offer revoked devices.** Hide or disable reinstate for
  `status: 'revoked'`; the server rejects it, but the button should not exist.

`#16` is the operational heart of the pilot. Columns worth surfacing: timestamp, employee,
operation, failure code, IP, user-agent, and whether the mode at the time was `monitor` or
`enforce`. A cluster of `DEVICE_CLONE_SUSPECTED` on one employee is the one row HR must
notice.

---

## 6. Web implementation

### 6.0 Dependency

Use **`@simplewebauthn/browser`** (v14.0.0 — **zero dependencies**, ships both ESM and CJS,
version-matched to the server's `@simplewebauthn/server@14.0.3`).

```bash
npm i @simplewebauthn/browser
```

It does exactly two things you would otherwise hand-write: base64url ↔ `ArrayBuffer`
conversion in both directions, and normalising browser quirks in the credential response.
That is the entire bug class S-FE-1 exists to avoid. Hand-rolling it is ~80 lines of
`Uint8Array` juggling in which one wrong padding assumption produces a signature that
fails verification with no diagnostic.

If you must avoid the dependency, the native equivalents are
`PublicKeyCredential.parseCreationOptionsFromJSON()` / `parseRequestOptionsFromJSON()` and
`credential.toJSON()` — but check your browser support floor first; they are newer than the
WebAuthn API itself.

### 6.1 Enrollment

```ts
import { startRegistration } from '@simplewebauthn/browser'

export async function enrollThisDevice(deviceName: string, replaceDeviceId?: string) {
  // 1. Start: sends the OTP AND returns the creation options.
  const { data: start } = await api.post('/attendance/trusted-devices/registration/start', {
    credential_type: 'webauthn',
    device_name: deviceName,
    replace_device_id: replaceDeviceId ?? null,
  })

  // 2. Ceremony FIRST, OTP entry second. The challenge (~180s) expires long before the
  //    OTP (minutes), so prompting for the code first routinely kills the challenge while
  //    the user hunts for the email.
  let attestation
  try {
    attestation = await startRegistration({ optionsJSON: start.public_key })
  } catch (e) {
    throw mapCeremonyError(e)      // §6.4
  }

  // 3. Now collect the OTP. Keep the attestation in memory while they type.
  const otp = await promptForOtp({ sentTo: start.otp_sent_to, expiresAt: start.otp_expires_at })

  // 4. Complete — OTP + attestation verified in one transaction.
  const { data: device } = await api.post('/attendance/trusted-devices/registration/complete', {
    request_id: start.request_id,
    challenge_id: start.challenge_id,
    credential_type: 'webauthn',
    device_name: deviceName,
    replace_device_id: replaceDeviceId ?? null,
    otp,
    attestation,
  })

  return device   // status: 'active' | 'pending'
}
```

**Ceremony before OTP entry is not a style preference** — it is the difference between a
flow that works and one that fails for anyone who has to go find their email. Note the
consequence: a wrong OTP at step 4 invalidates the challenge too, so `OTP_INVALID` means
restarting from step 1, including a fresh biometric prompt. Say that in the error message.

### 6.2 The punch

```ts
import { startAuthentication } from '@simplewebauthn/browser'

type Operation = 'clock_in' | 'clock_out' | 'break_start' | 'break_end'
const PATHS: Record<Operation, string> = {
  clock_in: '/attendance/clock-in',
  clock_out: '/attendance/clock-out',
  break_start: '/attendance/break/start',
  break_end: '/attendance/break/end',
}

export async function punch(op: Operation, body: object, ctx: DeviceTrustContext) {
  // Fast path: feature off, or this operation isn't gated for this org.
  if (ctx.effective_mode === 'off' || !ctx.enforced_operations.includes(op)) {
    return api.post(PATHS[op], body)
  }

  // Step 1 — one challenge, one attempt.
  const { data: ch } = await api.post('/attendance/device-trust/challenge', {
    operation: op,
    credential_type: 'webauthn',
  })

  if (ch.required === false) return api.post(PATHS[op], body)
  if (ch.registration_required) throw new NeedsEnrollmentError()

  // Step 2 — the OS prompt. Abortable, and exactly one at a time.
  const controller = new AbortController()
  activeCeremony = controller                       // cancel on unmount
  let assertion
  try {
    assertion = await startAuthentication({
      optionsJSON: ch.public_key,
      signal: controller.signal,
    })
  } catch (e) {
    throw mapCeremonyError(e)
  } finally {
    activeCeremony = null
  }

  // Step 3 — the punch, with the proof. Same body as before, plus one field.
  return api.post(PATHS[op], {
    ...body,
    device_proof: {
      challenge_id: ch.challenge_id,
      credential_type: 'webauthn',
      assertion,
    },
  })
}
```

The punch body is **otherwise unchanged** — `source`, `latitude`, `longitude`, `work_mode`,
`notes`, `client_timestamp`, `metadata` all behave exactly as today. `device_proof` is
additive and is stripped by the gate before the punch is recorded; it never appears in the
attendance record.

The response is unchanged except for an added `trusted_device_id` on the punch result.

### 6.3 `DEVICE_NOT_HARDWARE_BOUND` — the error that needs a real screen

This is the one failure users cannot possibly diagnose, and S-FE-3 reduces it but does not
eliminate it. What happened: the browser created a **synced** passkey (iCloud Keychain /
Google Password Manager) which replicates to every device the person owns. The org's policy
(`require_device_bound: true`) requires a credential that cannot leave this machine, because
the whole point is that attendance comes from *this* device.

Do not show "device verification failed". Show something actionable:

> **This device couldn't be registered**
> The passkey your browser created is synced to your other devices, so it can't be used as
> your attendance device.
> **On Windows:** choose *Windows Hello* (not "Save to your Google account") when prompted.
> **On Mac/iPhone:** turn off iCloud Passwords syncing for this registration, or use a
> security key.
> Still stuck? Contact HR — they can register your device for you.

Include a "Try again" that restarts from #3, and a link to HR. The server returns
`details.reason: 'backup_eligible'` so you can distinguish this from other 422s.

### 6.4 Mapping ceremony (browser) errors

`navigator.credentials` failures are not HTTP errors and arrive as `DOMException`:

| `error.name` | Real cause | Message to show |
|---|---|---|
| `NotAllowedError` | user cancelled, OR timed out, OR **this browser holds none of the allowed credentials** | "Verification cancelled or timed out. Try again." + an enrollment link, because you cannot tell cancellation from no-credential (see §6.5) |
| `InvalidStateError` | on **create**: already enrolled on this authenticator. On **get**: a ceremony is already pending | create → "already registered on this device"; get → §3.3, your bug |
| `NotSupportedError` | no authenticator satisfies the options | "This device can't be used for attendance. Use your phone or ask HR." |
| `SecurityError` | RP ID / origin mismatch, or **not a secure context** | **Never user-facing.** This is a config bug — log it loudly. See §7 |
| `AbortError` | you aborted it | silent |
| `UnknownError` | platform authenticator failure | "Something went wrong. Try again." |

### 6.5 You cannot pre-detect whether this browser holds the credential

There is no API that answers "does this browser have one of these credential IDs" — that is
a deliberate WebAuthn privacy property, not a gap in this design. So:

- `isUserVerifyingPlatformAuthenticatorAvailable()` tells you the machine *has* a usable
  authenticator. It does **not** tell you a credential is enrolled. Use it only to decide
  whether to offer enrollment at all.
- The only way to find out is to attempt the ceremony. A `NotAllowedError` is therefore
  ambiguous: cancelled, timed out, or no matching credential. Always pair that error with
  an enrollment path.
- **A `localStorage` hint is fine and is not a security control.** Writing
  `attendance_device_enrolled: "<credential_id>"` after a successful enrollment, purely so
  the UI can show "This device is registered" without a ceremony, is legitimate. The source
  requirement bans `localStorage` as *device identity* — using it as a UI hint, where
  forging it only changes which button renders and the server still demands a signature, is
  a different thing. Clear it on revoke, and never trust it for anything that matters.

---

## 7. Environment and dev-setup traps

**WebAuthn requires a secure context.** `https://…` or `http://localhost`. It does **not**
work on `http://192.168.1.x:3000` — so the usual "run the dev server and open it on my
phone over wifi" workflow fails with `SecurityError` and no useful message. Options: an
HTTPS dev server with a trusted local cert, a tunnel (ngrok/cloudflared), or Chrome's
`--unsafely-treat-insecure-origin-as-secure` for the specific origin.

**RP ID is per-environment and credentials do not travel.** `WEBAUTHN_RP_ID` must be the
registrable domain of the frontend origin. A credential enrolled against
`staging.hrclouds.com` will **never** work on `app.hrclouds.com`. Consequences:

- Every environment needs its own `WEBAUTHN_RP_ID`, matching its own frontend domain.
- QA must re-enroll per environment. Budget for it.
- If web and mobile share a domain, the native app needs
  `/.well-known/assetlinks.json` (Android) or an associated-domains entitlement (iOS) —
  only if you use platform WebAuthn on mobile rather than the `device_key` path in §8.
- A mismatch surfaces as a browser-side `SecurityError` the backend never sees. If
  enrollment "silently does nothing" in a new environment, check RP ID first.

**Rate limits.** Registration 5/hour/user; challenges 60/hour/user. Both are generous for
real use and easy to burn in a test loop. A `429` in dev usually means a retry loop, not a
limit that is too low.

**`503 DEVICE_TRUST_MISCONFIGURED`** means the server has enforcement on with RP config
missing. Not retriable, not the user's fault: "Attendance is temporarily unavailable.
Please contact HR." Do not loop.

---

## 8. Native mobile (`device_key`)

Only if there is a native app. If mobile is a webview or PWA, use §6 — it is WebAuthn
either way.

### 8.1 Enrollment

1. Generate a **non-exportable** P-256 keypair in the Android Keystore
   (`setUserAuthenticationRequired(true)`, `setInvalidatedByBiometricEnrollment(true)`) or
   the iOS Keychain / Secure Enclave (`kSecAttrTokenIDSecureEnclave`,
   `.biometryCurrentSet`). **Never** `AsyncStorage`, `SharedPreferences`, SQLite or a file.
2. Export the **public** key as SPKI DER, base64.
3. `POST /trusted-devices/registration/start` with `credential_type: 'device_key'`.
4. Sign the canonical bytes (§8.3) built from the start response — this proves possession at
   enrollment, the role WebAuthn attestation plays on web.
5. `POST /trusted-devices/registration/complete`:

```json
{
  "request_id": "...", "challenge_id": "...", "otp": "418207",
  "credential_type": "device_key",
  "device_name": "Abhishek's Pixel 8",
  "platform": "android",
  "public_key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "signature_algorithm": "ES256",
  "signature": "MEUCIQD..."
}
```

Key loss is **expected**, not exceptional: `setInvalidatedByBiometricEnrollment` means
adding a fingerprint destroys the key, and an OS restore gives a new device with no key. On
any `InvalidKeyException` / `errSecItemNotFound`, treat the device as unenrolled and route to
enrollment — never crash, never retry-loop.

### 8.2 The punch

`POST /device-trust/challenge` with `credential_type: 'device_key'` returns every field the
canonical string needs (S-FE-7) — build it only from this response, never from cached state:

```json
{
  "success": true,
  "data": {
    "required": true,
    "challenge_id": "3f1c9a7e-5b2d-4e8a-9c1f-0a7b6d4e2c88",
    "expires_at": "2026-10-15T09:03:00.000Z",
    "credential_type": "device_key",
    "device_key": {
      "challenge":  "k7Qx2Zr9vN1tH8sL4mJ6wP0yB3dF5gC7aE9iK2oU1xQ",
      "operation":  "clock_in",
      "device_id":  "b84d2c11-7e9f-4a30-8d6b-1f5c3a9e7042",
      "user_id":    "0c6e8b24-9a1d-4f7c-b3e5-62d8a4017f93",
      "org_id":     "d51f7a68-3c2b-49e1-8a04-7b9e6d2c5318"
    }
  }
}
```

Then:

```json
"device_proof": {
  "challenge_id": "3f1c9a7e-5b2d-4e8a-9c1f-0a7b6d4e2c88",
  "credential_type": "device_key",
  "device_id": "b84d2c11-7e9f-4a30-8d6b-1f5c3a9e7042",
  "signature": "MEUCIQD..."
}
```

### 8.3 The canonical byte string — exact spec

Sign these bytes. Not a JSON string, not a concatenation — this exact framing. Field order
is fixed. Lengths are **byte** lengths (not character counts) as unsigned 32-bit
**big-endian**. All values are the UTF-8 bytes of the strings **exactly as the server
returned them** (base64url challenge as a string; UUIDs lowercase as given).

```
"HRMS-ATTN-DEVICE-PROOF-v1"                     // 25 ASCII bytes, no separator after
|| u32be(len(challenge_id)) || challenge_id
|| u32be(len(challenge))    || challenge
|| u32be(len(operation))    || operation
|| u32be(len(device_id))    || device_id
|| u32be(len(user_id))      || user_id
|| u32be(len(org_id))       || org_id
```

The length prefixes are not ceremony. Without them `("ab","c")` and `("a","bc")` produce
identical bytes, which is a forgery primitive. Do not "simplify" this to `join('|')`.

Reference implementation and **verified test vector** — your implementation must reproduce
this digest exactly before you write any networking code:

```ts
const DOMAIN = 'HRMS-ATTN-DEVICE-PROOF-v1'
const FIELDS = ['challenge_id', 'challenge', 'operation', 'device_id', 'user_id', 'org_id'] as const

function canonicalProofBytes(f: Record<typeof FIELDS[number], string>): Buffer {
  const parts: Buffer[] = [Buffer.from(DOMAIN, 'utf8')]
  for (const k of FIELDS) {
    const v = Buffer.from(f[k], 'utf8')
    const len = Buffer.alloc(4); len.writeUInt32BE(v.length, 0)
    parts.push(len, v)
  }
  return Buffer.concat(parts)
}
```

Given exactly the `device_key` block shown in §8.2 plus its `challenge_id`:

```
canonical byte length  : 244
sha256(canonical)      : e44145702f266eb5819c17ead9865f7f0361b55c77cb220082b9c811e516f9c3
first 48 bytes (hex)   : 48524d532d4154544e2d4445564943452d50524f4f462d76310000002433663163396137652d356232642d346538612d
```

(The leading `48524d53…` is `"HRMS"`; `00000024` is the first length prefix — 36 bytes for a
UUID.)

### 8.4 Signature encoding — the trap that costs a day

Sign with **SHA-256**, and emit the signature in **DER / X9.62** (ASN.1 `SEQUENCE { r, s }`,
70–72 bytes, variable length), base64.

Verified against the planned Node verifier: a raw IEEE-P1363 `r‖s` signature (fixed 64
bytes) makes `crypto.verify` return **`false`** with no error and no diagnostic — the symptom
is a 403 that looks like a server bug.

| Platform API | Emits | Verdict |
|---|---|---|
| Android `Signature.getInstance("SHA256withECDSA")` | DER | ✅ use as-is |
| iOS `SecKeyCreateSignature(.ecdsaSignatureMessageX962SHA256)` | DER | ✅ use as-is |
| WebCrypto `subtle.sign({ name: 'ECDSA', hash: 'SHA-256' })` | raw P1363 (64 B) | ❌ **convert to DER**, or don't use it |

If your React Native crypto layer is a WebCrypto polyfill, you are in the third row. Assert
`signature.length !== 64` before sending — a 64-byte ECDSA signature is always the bug.

---

## 9. Error handling matrix

| Code | Status | Retry? | UI |
|---|---|---|---|
| `ATTENDANCE_DEVICE_REQUIRED` | 403 | no | "Register this device to clock in" → enrollment |
| `ATTENDANCE_DEVICE_REVOKED` | 403 | no | "This device is no longer authorised" → enrollment |
| `ATTENDANCE_DEVICE_SUSPENDED` | 403 | no | "Temporarily blocked — contact HR". **No enrollment link**; HR must reinstate |
| `DEVICE_VERIFICATION_FAILED` | 403 | **never** | "Verification failed. Try again, then contact HR." Manual retry only — see below |
| `DEVICE_CHALLENGE_INVALID` | 400 | once, from step 1 | "That took too long — touch your sensor again" **then** re-run. Never silent |
| `DEVICE_NOT_HARDWARE_BOUND` | 422 | after user action | §6.3 |
| `DEVICE_LIMIT_REACHED` | 409 | after user action | device picker from `details.devices[]` |
| `DEVICE_ALREADY_REGISTERED` | 409 | no | "Use a different authenticator" |
| `DEVICE_TRUST_MISCONFIGURED` | 503 | no | "Temporarily unavailable — contact HR". Do not loop |
| `ALREADY_CLOCKED_IN` etc. | 409 | no | existing behaviour. **The challenge is spent** — any retry restarts at step 1 |

**Never auto-retry `DEVICE_VERIFICATION_FAILED`.** It is a genuine cryptographic failure, so
retrying cannot fix it; and every attempt writes an audit row that HR reads on `#16`. A
retry storm from one employee is indistinguishable from an attack and will get their device
suspended by a human.

**`DEVICE_CHALLENGE_INVALID` auto-retry must be announced.** The retry re-runs the ceremony,
so a second biometric prompt appears. Appearing unannounced reads as a malfunction; label it
first, then retry, and only once.

---

## 10. Build checklist

Web:

- [ ] `effective_mode`, never `mode`, drives every branch
- [ ] `monitor` mode falls back to a proof-less punch on any device error, silently
- [ ] `off` mode skips steps 1–2 entirely — zero behaviour change, zero extra calls
- [ ] `enforced_operations` membership checked per operation (breaks may not be gated)
- [ ] device-trust codes excluded from the 401/403 logout interceptor
- [ ] punch endpoints excluded from any generic HTTP retry interceptor
- [ ] button disabled across all three steps; one ceremony at a time; `AbortController` on unmount
- [ ] optimistic punch UI removed; three labelled progress states
- [ ] no challenge in any cache, store or `localStorage`
- [ ] enrollment runs the ceremony **before** asking for the OTP
- [ ] `DEVICE_NOT_HARDWARE_BOUND` has its own screen, not a generic toast
- [ ] `pending` (HR-approval) devices rendered distinctly from `active`
- [ ] revoke confirmation says it is irreversible and may block clocking in
- [ ] every `DOMException` name in §6.4 mapped
- [ ] network timeout on step 3 → re-read `/today`, never auto-retry

Mobile, additionally:

- [ ] key is non-exportable, biometric-gated, in Keystore/Secure Enclave
- [ ] canonical bytes reproduce the §8.3 test vector **before** any networking is written
- [ ] canonical fields come from the challenge response, never from cached state
- [ ] signature is DER; `length !== 64` asserted
- [ ] key-invalidation (new fingerprint, device restore) routes to enrollment, no crash loop

HR:

- [ ] `enforce` confirmation shows the `#17` coverage number and defaults `enforce_from` +14d
- [ ] `#15` sends `If-Match`; `412` re-reads and reconciles, never blind-retries
- [ ] reinstate hidden for `revoked`
- [ ] `#16` surfaces failure code, IP, user-agent and the mode at the time

---

## 11. Open questions for the frontend team

1. **Is there a native mobile app?** If mobile is a webview/PWA, §8 is dead and the backend's
   `device_key` path need not be built in phase one. Answer this before backend starts
   Phase 2 — it removes real work.
2. **Does the app queue punches offline?** If so there is a **hard conflict**: a challenge is
   online-only and lives 180s, so an offline punch cannot carry a proof. Either offline
   punches route through regularization (manager-approved, un-gated by design), or offline
   queueing is disabled for orgs in `enforce`. This needs a product decision, not a technical
   one.
3. **What is the browser support floor?** WebAuthn platform authenticators need Chrome 67+ /
   Safari 14+ / Firefox 60+ / Edge 18+. Anyone below that cannot enroll on web at all and
   needs the mobile path or HR-assisted enrollment.
4. **Is there a kiosk / shared-terminal attendance screen?** A shared browser cannot hold
   per-employee credentials (plan D-DT-11). Shared terminals must stay on the existing
   biometric-device webhook path. If a shared *web* kiosk exists today, flag it now — it will
   break under `enforce`.
5. **Which domains, per environment?** Needed to set `WEBAUTHN_RP_ID` for dev, staging and
   prod. A wrong value fails silently in the browser (§7).
6. **Does the frontend currently retry `POST`s automatically?** If yes, name the interceptor —
   it must exclude the four punch endpoints (§3.1).
