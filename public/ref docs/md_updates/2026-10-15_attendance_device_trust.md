# Attendance Device Trust — API change record

**Date:** 2026-10-15
**Module:** Attendance
**Status:** Shipped behind a global kill switch (`ATTENDANCE_DEVICE_TRUST_ENABLED`, default `false`). Inert until the flag is on **and** an org's policy is past `off`.
**Authoritative contract:** `public/md_system/ATTENDANCE_API_CONTRACT.md` §11. Native-client wire details and the test vector: `public/md_attendance/device_trust_frontend_guide.md`.

Device trust binds a punch to a registered device — a WebAuthn/passkey credential on web, or a hardware-backed key on mobile. This note covers everything that changes for the frontend.

---

## 1. Backwards compatibility

With `ATTENDANCE_DEVICE_TRUST_ENABLED` off (the default), **nothing changes**. The punch path is byte-for-byte its current behaviour, `device_proof` is ignored, and the context readout reports `off`. A client that never implements any of this keeps working in every org that stays `off`.

## 2. The four punch endpoints gain an optional `device_proof`

`POST /clock-in`, `/clock-out`, `/break/start`, `/break/end` now accept an **optional** `device_proof` object:

```jsonc
{
  "challenge_id": "<uuid from the challenge endpoint>",
  "credential_type": "webauthn" | "device_key",
  "assertion": { /* WebAuthn get() response — webauthn only */ },
  "device_id": "<uuid — device_key only>",
  "signature": "<base64 DER signature — device_key only>"
}
```

- It is **optional** — `off` and `monitor` modes accept a punch body without it.
- It is **consumed once** and **never stored**. A replay is `DEVICE_CHALLENGE_INVALID`.
- ECDSA signatures must be **DER-encoded**. A 64-byte IEEE-P1363 signature is rejected.
- A successful **enforced** punch now records `trusted_device_id` on the attendance log (additive; existing log consumers are unaffected).

**Challenge → sign → submit sequence:**
1. `POST /device-trust/challenge` `{operation, credential_type}` → a single-use challenge.
2. Have the device sign/attest it (WebAuthn `get()` or the device key over the canonical bytes).
3. Submit the normal punch body **plus** `device_proof`.

## 3. Enforcement modes — branch on `effective_mode`

`off` → `monitor` (checked, failures audited, **never blocks**) → `enforce` (failures block). An `enforce_from` date is a grace window: while it is in the future the **effective** mode is `monitor`.

| Mode the UI sees (`effective_mode`) | What to do |
|---|---|
| `off` | Exactly today's UI. Skip the challenge step entirely. Hide device screens. |
| `monitor` | Run the challenge/sign flow if the user has a device, but if anything fails, **re-submit the punch with no `device_proof`** and stay quiet — the punch still succeeds. |
| `enforce` | The device flow is mandatory for the `enforced_operations`; a failure blocks the punch. |

**Always branch on `effective_mode`, never the raw `mode`** — otherwise the UI demands a device during the grace window while the backend is still letting punches through.

`enforced_operations` is a subset — an org may gate clock-in/out but not breaks. Check membership per operation; if an operation is absent, punch as today.

## 4. `registration_required`

`POST /device-trust/challenge` returns `{ "required": true, "registration_required": true }` when enforcement applies but the caller has **no active device of that credential type yet**. Route the user into enrollment (#3/#4) rather than showing a challenge.

## 5. New self-service endpoints (base `/api/v1/attendance`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/device-trust/context` | mode, `effective_mode`, `enforced_operations`, `my_active_device_count`, `max_active_devices`, approval mode. **Never 404 when off.** |
| POST | `/device-trust/challenge` | mint a challenge, or `{required:false}` / `{registration_required:true}`. Minting is rate limited **60/h** per user — a `429 RATE_LIMITED` with `details.retry_after_seconds` once exceeded. The `{required:false}` / `{registration_required:true}` fast paths are free (they mint nothing). |
| POST | `/trusted-devices/registration/start` | OTP step-up + credential-creation options. Rate limited 5/h. |
| POST | `/trusted-devices/registration/complete` | verify OTP + attestation, one transaction. |
| GET | `/trusted-devices` | my devices. **Never returns `public_key`, `credential_id`, `sign_count`.** |
| PATCH | `/trusted-devices/:id` | rename only (`{device_name}`). |
| POST | `/trusted-devices/:id/revoke` | self-revoke, no step-up. |

Registration OTP uses its own context (`attendance_device_registration`) — it is **not** interchangeable with the signup/reset OTP.

## 6. New HR endpoints (base `/api/v1/attendance/hr`, roles `hr`/`admin`/`super-admin`)

List (`GET /trusted-devices`, filters `user_id`/`status`/`platform`/`device_bound`), lifecycle (`approve`, `reject`, `revoke`, `suspend`, `reinstate` — `reject`/`revoke`/`suspend` require a `reason`), policy (`GET`/`PUT /device-trust/policy` with `If-Match`), and the readouts (`GET /device-trust/events`, `GET /device-trust/coverage`).

- `reinstate` moves `suspended → active` **only**; a revoked device is terminal.
- A cross-tenant device id returns **404** (not 403).
- `PUT /device-trust/policy`: the `ETag` is the row's `updated_at`; send it back as `If-Match`. Missing → **428**, stale → **412**.

## 7. Error contract — **403, not session expiry**

| Code | Status | `retriable` | UI |
|---|---|---|---|
| `ATTENDANCE_DEVICE_REQUIRED` | 403 | — | prompt to register (see `registration_required`) |
| `ATTENDANCE_DEVICE_REVOKED` | 403 | — | prompt to register a new device |
| `ATTENDANCE_DEVICE_SUSPENDED` | 403 | — | contact HR |
| `DEVICE_CHALLENGE_INVALID` | 400 | **true** | fetch a fresh challenge and retry |
| `DEVICE_VERIFICATION_FAILED` | 403 | false | generic failure |
| `DEVICE_NOT_HARDWARE_BOUND` | 422 | false | explain a synced/cloud passkey is not allowed |
| `DEVICE_LIMIT_REACHED` | 409 | — | `details.devices[]` → pick one to replace, resend with `replace_device_id` |
| `DEVICE_ALREADY_REGISTERED` | 409 | — | this authenticator is already enrolled |
| `DEVICE_TRUST_MISCONFIGURED` | 503 | — | transient server error |

**None of these is 401. Never log the user out on a device-trust error.** The whole point of the status choice is that a device problem must not look like an expired session (D-DT-7).

In `monitor` mode an enforced-operation punch still returns 200/201 even if verification fails — the failure is only audited. The UI must not surface it.

---

## Operator / rollout

See `public/md_attendance/device_trust_rollout_runbook.md`. In short: deploy inert → run migration `00078` → flip the kill switch (all orgs still `off`) → pilot org to `monitor` → watch coverage/events → set `enforce_from` + `enforce`. Any org with `ENABLE_ATTENDANCE_SIMULATOR=true` must stay `off`.

New env (see `.env.example`): `ATTENDANCE_DEVICE_TRUST_ENABLED`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS`. With the flag on and the RP config missing, the server refuses to start.
