# Auth — the `otp` field is gone from OTP responses

**Date:** 2026-10-01
**For:** HRMS frontend team
**Type:** breaking for anyone reading `data.otp`; no other change
**Status:** merged on `development`, not yet deployed

---

## 1. Short version

Three endpoints used to return the OTP itself in the response body. They no longer do.

| Endpoint | Field removed |
| :--- | :--- |
| `POST /api/v1/auth/signup` | `data.otp` |
| `POST /api/v1/auth/forgot-password` | `data.otp` |
| `POST /api/v1/auth/otp/resend` | `data.otp` |

Nothing else changed: same paths, same methods, same request bodies, same status codes,
same validation, same error codes, every other response field untouched. The OTP still
goes to the user's email exactly as before.

**If your code reads `response.data.data.otp` anywhere, it breaks. Nothing else does.**

---

## 2. Why

The OTP was being handed to the caller in the same response that triggered it. Anyone who
could name a victim's email address could call `POST /auth/forgot-password`, read the OTP
out of the JSON, and complete the reset without ever having access to the mailbox. That is
full account takeover from an unauthenticated endpoint, so the field had to go.

---

## 3. Exact response shapes

### `POST /api/v1/auth/signup`

Before:

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "requestId": "0f4a0c2e-1a1b-4c7e-9f3a-5d6e7f8a9b0c",
    "identifier": "user@example.com",
    "identifierType": "email",
    "context": "registration",
    "otp": "482913"
  }
}
```

After:

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "requestId": "0f4a0c2e-1a1b-4c7e-9f3a-5d6e7f8a9b0c",
    "identifier": "user@example.com",
    "identifierType": "email",
    "context": "registration"
  }
}
```

### `POST /api/v1/auth/forgot-password`

Same shape as signup — `requestId`, `identifier`, `identifierType`, `context` are all
still returned, `otp` is not. `context` is `forgot_password`.

### `POST /api/v1/auth/otp/resend`

After:

```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": {
    "requestId": "7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e5f",
    "resendCount": 1
  }
}
```

`otp` removed; `requestId` and `resendCount` unchanged.

---

## 4. What you need to do

1. **Search your codebase for `.otp` reads on these three responses** and delete them.
   Likely spots: an auto-filled OTP input during local testing, a dev-only "your code is
   X" banner, or a Cypress/Playwright test that skipped the mailbox by reading the
   response.
2. **Keep using `requestId`.** It is unchanged and is still what you pass to
   `POST /auth/signup/verify`, `POST /auth/forgot-password/verify` and
   `POST /auth/otp/resend`. The verify step is otherwise untouched.
3. **E2E tests that read the OTP from the response must change.** Read it from a test
   mailbox instead, or ask backend for a seeded test account. There is no
   supported way to obtain an OTP over the API, and there will not be one.

No change to request bodies, so nothing to send differently.

---

## 5. Not changed

Listed because it is easy to assume a security fix was broader than it was:

- OTP length, expiry, and resend limits — unchanged.
- `POST /auth/signup/verify` and `POST /auth/forgot-password/verify` — unchanged,
  request and response.
- Login, refresh, logout, Google sign-in, invitations — untouched.
- Error codes and messages on all five auth endpoints — unchanged.
