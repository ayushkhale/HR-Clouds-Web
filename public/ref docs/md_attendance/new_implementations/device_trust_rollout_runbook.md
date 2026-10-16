# Attendance Device Trust — rollout runbook

**Date:** 2026-10-15
**Audience:** operators / release engineers

This is the staged rollout for attendance device trust. Every step is reversible without a deploy up to the moment enforcement engages, and even then `monitor` is the documented rollback.

## Configuration (all opt-in)

| Env var | Default | Meaning |
|---|---|---|
| `ATTENDANCE_DEVICE_TRUST_ENABLED` | `false` | Global kill switch, checked **before any DB read**. Off = the punch path is byte-for-byte its pre-feature behaviour. |
| `WEBAUTHN_RP_ID` | — | The relying-party id: the eTLD+1 of the frontend origin (e.g. `hrclouds.in`). A wrong value fails every registration with a browser-side error invisible to the server. |
| `WEBAUTHN_RP_NAME` | `HRMS` | Name shown in the OS passkey prompt. |
| `WEBAUTHN_ORIGINS` | — | Comma-separated allowlist of exact frontend origins. |

**Boot guard:** when `ATTENDANCE_DEVICE_TRUST_ENABLED=true` and any RP value is missing, the process **refuses to start** (same reasoning as the token-secret assertion — there is no safe default, and enforcement with no RP id would reject every punch in the org).

## Sequence

1. **Deploy with the kill switch `false`.** All code is inert. Confirm no change to punch latency or behaviour.
2. **Run migration `00078`** (creates the three tables + `attendance_logs.trusted_device_id`, and backfills one `off` policy row per org). This is a metadata-only / additive migration.
3. **Flip `ATTENDANCE_DEVICE_TRUST_ENABLED=true`.** Every org is still `off`; the only live endpoints are the readouts and enrollment. Verify `GET /device-trust/context` returns `effective_mode: "off"`.
4. **Pilot org → `enforcement_mode = 'monitor'`** (via `PUT /device-trust/hr/.../policy`). Communicate to users; open enrollment.
5. **Watch for 1–2 weeks:** `GET /device-trust/events` (verification failures + lifecycle) and `GET /device-trust/coverage` (enrolled vs active members).
   **Gate to proceed:** coverage ≥ **95%** of active members, and zero unexplained verification failures.
6. **Set `enforce_from` ~two weeks out and `enforcement_mode = 'enforce'`.** During the grace window the effective mode is still `monitor`, so this step is reversible without a deploy — clear `enforce_from` or drop back to `monitor`.
7. **On the `enforce_from` date, enforcement engages.** Keep `monitor` as the documented rollback.
8. **Repeat per org.**

## Hard constraints

- **Any org with `ENABLE_ATTENDANCE_SIMULATOR=true` stays at `off`.** The simulator authenticates with a bearer token and holds no device key, so it cannot satisfy the gate.
- The challenge sweeper cron (`attendance_device_challenge_sweeper.cron.js`, 03:50 IST) runs only on Linux with cron jobs enabled; it deletes consumed or week-old-expired challenge rows in bounded batches.

## Rollback

- **Fastest:** set `ATTENDANCE_DEVICE_TRUST_ENABLED=false` — the gate goes inert for every org immediately, no DB change.
- **Per org, no deploy:** drop `enforcement_mode` to `monitor`, or clear `enforce_from`.
