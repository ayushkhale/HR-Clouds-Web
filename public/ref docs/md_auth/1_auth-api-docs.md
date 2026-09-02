# Authentication Module — Complete API Reference

**Base URL:** `/api/v1/auth`  
**Source of Truth:** [`auth.routes.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/auth/routes/auth.routes.js), [`auth.controller.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/auth/controllers/auth.controller.js), [`auth.service.js`](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/src/modules/auth/services/auth.service.js)  
**Last Verified Against Code:** August 21, 2026

> **Note:** The specific function and ORM method names (e.g., `User.create()`) used in the internal execution flows are conceptual/dummy names intended to clearly illustrate the business logic. The internal execution logic, database interactions, transactions, side-effects, and validations described are strictly accurate and verified against the actual codebase.

---

## API 1: Initiate Signup

### Purpose

Begins the user registration process. A new user provides their email, the backend creates a `pending_verification` user record (if one doesn't already exist), generates a 6-digit OTP, stores it in the database with an expiry, and dispatches it to the user's email via the configured email provider.

### Endpoint

```
POST /api/v1/auth/signup
```

### Authentication

Not required.

### Request

**Headers:** `Content-Type: application/json`

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `identifier` | string | **Yes** | Must be a valid email address. |

```json
{
  "identifier": "user@example.com"
}
```

### Internal Working

1. Normalize the identifier (trim, lowercase).
2. Check if a user with this email already exists.
   - If `status = active` → throw `400 ALREADY_REGISTERED`.
   - If `status = blocked/suspended` → throw `403 SIGNUP_NOT_ALLOWED`.
   - If no user exists → create a new `User` record with `status: pending_verification`.
3. Generate a numeric OTP (length from config, default 6 digits).
4. Create an OTP record in the `otp_verifications` table with context `registration`.
5. Send the OTP to the user's email via `sendOtpEmail`.
6. Commit the transaction.

### Database Operations

- **Read:** `users` table (find by identifier).
- **Create:** `users` record (if new user).
- **Create:** `otp_verifications` record.
- **Transaction:** Yes, full transaction with rollback on error.

### External Services

- **Email Provider:** Sends OTP email via configured provider (Brevo/SendinBlue).

### Response

**200 OK**

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "requestId": "uuid-v4",
    "identifier": "user@example.com",
    "identifierType": "email",
    "context": "registration",
    "otp": "123456"
  }
}
```

> **Note:** The `otp` field is returned in the response during development. In production, this should be removed and the user should only receive the OTP via email.

### Error Responses

| Status | Code                 | Cause                                                  |
| ------ | -------------------- | ------------------------------------------------------ |
| 400    | `ALREADY_REGISTERED` | Email already registered and active.                   |
| 403    | `SIGNUP_NOT_ALLOWED` | User account is blocked or suspended.                  |
| 500    | `OTP_CONFIG_ERROR`   | OTP configuration missing from `configs/default.json`. |

### Frontend Integration

**When to call:** When the user submits their email on the Signup page.  
**On success:** Store the returned `requestId` in component state. Navigate to the OTP verification screen.  
**On error (400 ALREADY_REGISTERED):** Show "Email already registered" and offer a link to the Login page.

---

## API 2: Verify Signup OTP

### Purpose

Completes user registration by verifying the OTP, setting the user's password, marking them as `active`, assigning them the `guest` role, creating their `UserProfile`, and returning JWT access/refresh tokens.

### Endpoint

```
POST /api/v1/auth/signup/verify
```

### Authentication

Not required.

### Request

**Headers:** `Content-Type: application/json`

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `identifier` | string | **Yes** | Valid email address. |
| `otp` | string | **Yes** | Exactly 6 digits (`/^\d{6}$/`). |
| `context` | string | **Yes** | Must be `"registration"`. |
| `password` | string | **Yes** | Min 8 chars. Must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character. |
| `requestId` | string | **Yes** | UUIDv4. The `requestId` returned from the Initiate Signup API. |

```json
{
  "identifier": "user@example.com",
  "otp": "123456",
  "context": "registration",
  "password": "Password@123",
  "requestId": "uuid-from-signup-response"
}
```

### Internal Working

1. Find and lock a valid OTP record matching identifier + otp + context + requestId.
2. If no valid OTP → throw `400 OTP_INVALID`.
3. Fetch the user record.
4. If user is `blocked/suspended` → throw `403`.
5. If user is already `active` and verified → throw `409 USER_ALREADY_VERIFIED`.
6. Hash the password using Argon2.
7. Update user: set `password_hash`, `status = active`, `identifier_verified = true`, `onboarding_step = 1`.
8. Find or create the `guest` role assignment via `UserRole`.
9. Create a `UserProfile` record (first_name and display_name set to the email prefix).
10. Delete the consumed OTP.
11. Generate JWT access token and refresh token.
12. Commit transaction.

### Database Operations

- **Read:** `otp_verifications` (with row lock for update).
- **Read:** `users`.
- **Update:** `users` (password, status, verified_at).
- **Create:** `user_roles` (guest role assignment).
- **Create:** `user_profiles`.
- **Delete:** `otp_verifications` (consumed OTP).
- **Transaction:** Yes.

### Response

**200 OK**

```json
{
  "success": true,
  "message": "OTP Verified Successfully. Registration Completed.",
  "data": {
    "user": {
      "id": "user-uuid",
      "identifier": "user@example.com",
      "identifierType": "email",
      "role": "guest",
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token"
    }
  }
}
```

### Error Responses

| Status | Code                    | Cause                                           |
| ------ | ----------------------- | ----------------------------------------------- |
| 400    | `OTP_INVALID`           | OTP is incorrect, expired, or already consumed. |
| 403    | `USER_ACCESS_DENIED`    | User account is blocked or suspended.           |
| 404    | `USER_NOT_FOUND`        | No user found for the given identifier.         |
| 409    | `USER_ALREADY_VERIFIED` | User is already active and verified.            |

### Frontend Integration

**When to call:** When the user submits the OTP + password on the verification screen.  
**On success:** Store `accessToken` and `refreshToken` in localStorage/cookies. Set global user state to `role: guest`. Navigate to the Pricing/Plan Selection page.  
**On error (OTP_INVALID):** Show "Invalid or expired OTP" error on the OTP input.

---

## API 3: Login

### Purpose

Authenticates a user using their email and password. Handles three response scenarios: guest/single-org login (returns tokens directly), multi-org login (returns a selection token and organization list), and edge cases where multiple memberships exist but only one org is active.

### Endpoint

```
POST /api/v1/auth/login
```

### Authentication

Not required.

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `identifier` | string | **Yes** | Min 3 chars, max 255 chars. Trimmed. |
| `password` | string | **Yes** | Min 8 chars. |

```json
{
  "identifier": "user@example.com",
  "password": "Password@123"
}
```

### Internal Working

1. Normalize identifier, fetch user with all role memberships.
2. **Timing-safe guard:** If no user found, still run a dummy password verify to prevent timing attacks, then throw `401`.
3. If user has no `password_hash` (e.g., Google-only user) → throw `401 LOGIN_NOT_ALLOWED`.
4. If user `status !== active` → throw `403`.
5. Verify password with Argon2.
6. Update `last_login_at` timestamp.
7. Generate login response:
   - **0 org roles (guest):** Return tokens with `role: guest`.
   - **1 org role:** Return tokens scoped to that org.
   - **Multiple org roles:** Filter out suspended/deleted orgs. If only 1 active org remains, return tokens for it. Otherwise, return `requires_org_selection: true` with a `selection_token` (10-min JWT) and the org list.

### Database Operations

- **Read:** `users` with eager-loaded `user_roles` → `roles` → `organizations`.
- **Update:** `users.last_login_at`.
- **Transaction:** Yes (for the update).

### Response Scenarios

**Scenario A: Single Organization or Guest (200 OK)**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user-uuid",
      "identifier": "user@example.com",
      "identifierType": "email",
      "role": "employee",
      "accessToken": "jwt-token",
      "refreshToken": "jwt-refresh-token",
      "onboarding_step": 1
    }
  }
}
```

**Scenario B: Multiple Organizations (200 OK)**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "requires_org_selection": true,
    "selection_token": "short-lived-jwt",
    "organizations": [
      {
        "org_id": "uuid-1",
        "name": "Acme Corp",
        "status": "active",
        "role": "hr"
      }
    ]
  }
}
```

### Error Responses

| Status | Code                  | Cause                                                             |
| ------ | --------------------- | ----------------------------------------------------------------- |
| 401    | `INVALID_CREDENTIALS` | Wrong email or password.                                          |
| 401    | `LOGIN_NOT_ALLOWED`   | User registered via Google OAuth only, cannot use password login. |
| 403    | `USER_NOT_ACTIVE`     | User account is not active.                                       |
| 403    | `NO_ACTIVE_ORGS`      | User has org memberships but all orgs are suspended/deleted.      |

### Frontend Integration

**When to call:** When user submits the login form.  
**On success:**

- If `data.user` exists → Store tokens, set role, navigate to dashboard.
- If `data.requires_org_selection` exists → Store `selection_token` temporarily, render an organization selection screen showing `data.organizations`.

**Security Note:** The `selection_token` has a 10-minute expiry. If the user takes too long to select, they'll need to log in again.

---

## API 4: Select Organization

### Purpose

After a multi-org login, the user picks which organization to enter. This API consumes the temporary `selection_token` and issues final access/refresh tokens scoped to the selected organization.

### Endpoint

```
POST /api/v1/auth/select-organization
```

### Authentication

Required. Uses the **`selection_token`** (not a standard access token).  
**Header:** `Authorization: Bearer <selection_token>`  
**Middleware:** `authenticateSelectionToken` — validates the token has `purpose: org_selection` and extracts `user.id` from `payload.sub`.

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `org_id` | string | **Yes** | UUIDv4. |

```json
{
  "org_id": "uuid-of-selected-org"
}
```

### Internal Working

1. Fetch user by ID. Verify `status = active`.
2. Verify the user has a membership (`UserRole`) in the requested org.
3. Verify the organization is not suspended/deleted.
4. Generate access and refresh tokens scoped to the selected org + role.

### Response

**200 OK**

```json
{
  "success": true,
  "message": "Organization selected successfully",
  "data": {
    "user": {
      "id": "user-uuid",
      "identifier": "user@example.com",
      "identifierType": "email",
      "role": "employee",
      "accessToken": "final-jwt-access-token",
      "refreshToken": "final-jwt-refresh-token",
      "onboarding_step": 1
    }
  }
}
```

### Error Responses

| Status | Code                   | Cause                                      |
| ------ | ---------------------- | ------------------------------------------ |
| 403    | `MEMBERSHIP_NOT_FOUND` | User does not belong to this organization. |
| 403    | `ORG_NOT_ACCESSIBLE`   | Organization is suspended or deleted.      |
| 404    | `USER_NOT_FOUND`       | User ID from token not found.              |

### Frontend Integration

**When to call:** When the user clicks an organization from the selection screen after multi-org login.  
**On success:** Discard the `selection_token`. Store new `accessToken` and `refreshToken`. Navigate to dashboard.

---

## API 5: Switch Organization

### Purpose

Allows a user who is already logged into one organization to switch to another organization they belong to. The backend invalidates the old access token by placing its SHA-256 hash onto a Redis blacklist with a TTL matching the token's remaining lifespan.

### Endpoint

```
POST /api/v1/auth/switch-organization
```

### Authentication

Required. Standard `access_token`.  
**Header:** `Authorization: Bearer <access_token>`  
**Middleware:** `authenticate`

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `org_id` | string | **Yes** | UUIDv4. The target organization to switch to. |

### Internal Working

1. Validate the user's membership in the target org (same logic as Select Organization).
2. Generate new access and refresh tokens scoped to the target org.
3. **Token Blacklisting:** The controller extracts `tokenHash` and `tokenExp` from `req.user`, calculates the remaining TTL, and sets `bl:<tokenHash>` in Redis with that TTL.

### Side Effects

- **Redis:** Old access token hash is blacklisted. Any subsequent request using the old token will be rejected by the `authenticate` middleware.

### Response

**200 OK** — Same structure as Select Organization.

### Frontend Integration

**When to call:** When the user selects a different organization from an org-switcher dropdown.  
**Critical:** Immediately replace old tokens in localStorage with the new ones. The old token is permanently revoked.

---

## API 6: Forgot Password

### Purpose

Initiates a password reset flow by sending an OTP to the user's registered email (or phone). Invalidates any previous forgot_password OTPs for the same identifier before generating a new one.

### Endpoint

```
POST /api/v1/auth/forgot-password
```

### Authentication

Not required.

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `identifier` | string | **Yes** | Min 3, max 255 chars. Can be email or phone. |

### Internal Working

1. Detect identifier type (email or phone).
2. Fetch user. Must be `active` and `identifier_verified`.
3. Invalidate all existing `forgot_password` OTPs for this identifier.
4. Generate new OTP and store in `otp_verifications`.
5. Send via email or SMS based on identifier type.

### Response

**200 OK**

```json
{
  "success": true,
  "message": "Password reset OTP sent successfully",
  "data": {
    "requestId": "uuid-v4",
    "identifier": "user@example.com",
    "identifierType": "email",
    "context": "forgot_password",
    "otp": "123456"
  }
}
```

### Error Responses

| Status | Code                 | Cause                                             |
| ------ | -------------------- | ------------------------------------------------- |
| 400    | `INVALID_IDENTIFIER` | Not a valid email or phone number.                |
| 400    | `USER_NOT_VERIFIED`  | Account exists but hasn't completed registration. |
| 404    | `USER_NOT_FOUND`     | No account found.                                 |

---

## API 7: Verify Forgot Password OTP

### Purpose

Verifies the OTP and immediately resets the user's password. Also unlocks the account if it was previously locked.

### Endpoint

```
POST /api/v1/auth/forgot-password/verify
```

### Authentication

Not required.

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `identifier` | string | **Yes** | Min 3, max 255 chars. |
| `otp` | string | **Yes** | 6 digits. |
| `context` | string | **Yes** | Must be `"forgot_password"`. |
| `requestId` | string | **Yes** | UUIDv4. |
| `newPassword` | string | **Yes** | Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char. |

### Internal Working

1. Find and lock the OTP record.
2. Fetch and verify user status.
3. Hash the new password with Argon2.
4. Update user: `password_hash`, `password_updated_at`, `last_password_reset_at`, `password_reset_required = false`, `account_locked = false`, `locked_until = null`.
5. Delete the consumed OTP.

### Response

**200 OK**

```json
{
  "success": true,
  "message": "Password reset successful"
}
```

---

## API 8: Resend OTP

### Purpose

Resends the OTP for an active registration or forgot_password flow. Enforces a cooldown period between resends and a maximum resend count.

### Endpoint

```
POST /api/v1/auth/otp/resend
```

### Authentication

Not required.

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `identifier` | string | **Yes** | Min 3, max 255 chars. |
| `context` | string | **Yes** | `"registration"` or `"forgot_password"`. |
| `requestId` | string | **Yes** | UUIDv4. The `requestId` from the original OTP request. |

### Internal Working

1. Find the active OTP record by requestId.
2. Check resend count against `config.otp.maxResendCount` (default 3). If exceeded → `429`.
3. Check cooldown: if less than `config.otp.resendCooldownSeconds` (default 60s) since last update → `429` with `retryAfter`.
4. Generate new OTP, new requestId, extend expiry.
5. Update the OTP record in-place (increment `resend_count`, replace `request_id`).
6. Send via email or SMS.

### Response

**200 OK**

```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": {
    "requestId": "new-uuid",
    "resendCount": 1,
    "otp": "654321"
  }
}
```

> **Important:** The old `requestId` is now invalid. Frontend must store the new `requestId` for any subsequent verify or resend calls.

### Error Responses

| Status | Code                     | Cause                                                               |
| ------ | ------------------------ | ------------------------------------------------------------------- |
| 400    | `OTP_REQUEST_NOT_FOUND`  | No active OTP request found.                                        |
| 429    | `RESEND_LIMIT_EXCEEDED`  | Maximum resend attempts reached.                                    |
| 429    | `RESEND_COOLDOWN_ACTIVE` | Must wait before resending. Response includes `retryAfter` seconds. |

### Frontend Integration

**When to call:** When the user clicks "Resend OTP".  
**On 429 (RESEND_COOLDOWN_ACTIVE):** Start a countdown timer using the `retryAfter` value and disable the resend button.  
**On 429 (RESEND_LIMIT_EXCEEDED):** Hide the resend button entirely and show "Maximum attempts reached. Please start over."  
**On success:** Replace the stored `requestId` with `data.requestId`.

---

## API 9: Google Authentication

### Purpose

Authenticates a user via Google Sign-In. If the user doesn't exist in the system, automatically creates a new account with `guest` role. If the user exists but registered via a different auth method (e.g., password), rejects the login to prevent account hijacking.

### Endpoint

```
POST /api/v1/auth/google
```

### Authentication

Not required.

### Request

**Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| `idToken` | string | **Yes** | The Google ID token from the Google Sign-In SDK. |

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZ..."
}
```

### Internal Working

1. Verify the Google ID token using `google-auth-library` against `GOOGLE_CLIENT_ID_APP`.
2. Extract `email`, `sub` (provider ID), `given_name`, `family_name`, `name` from the payload.
3. Verify `email_verified === true`.
4. Check if user exists:
   - **New user:** Create `User` (auth_provider: google), assign `guest` role, create `UserProfile` with Google name data.
   - **Existing user (auth_provider !== google):** throw `403 AUTH_PROVIDER_MISMATCH`.
   - **Existing user (provider_id mismatch):** throw `403 PROVIDER_ID_MISMATCH`.
   - **Existing user (blocked/suspended):** throw `403`.
5. Update `last_login_at`.
6. Generate login response (same multi-org logic as Login API).

### External Services

- **Google OAuth2:** Verifies the ID token signature and claims.

### Error Responses

| Status | Code                     | Cause                                       |
| ------ | ------------------------ | ------------------------------------------- |
| 401    | `GOOGLE_TOKEN_INVALID`   | Google token verification failed.           |
| 400    | `GOOGLE_PAYLOAD_INVALID` | Token payload missing email or provider ID. |
| 403    | `EMAIL_NOT_VERIFIED`     | Google email is not verified.               |
| 403    | `AUTH_PROVIDER_MISMATCH` | Email registered via password, not Google.  |
| 403    | `PROVIDER_ID_MISMATCH`   | Different Google account for same email.    |

### Frontend Integration

**When to call:** After obtaining an `idToken` from the Google Sign-In SDK.  
**Response handling:** Identical to Login API (single org → tokens, multi org → selection flow).

---

## Environment Variables Used by Auth Module

| Variable               | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `ACCESS_TOKEN_SECRET`  | Secret key for signing/verifying JWTs.                   |
| `GOOGLE_CLIENT_ID_APP` | Google OAuth client ID for token verification.           |
| `Login_PlACEHOLDER`    | Optional custom error code for already-registered users. |

## Authentication Middleware Reference

| Middleware                   | Purpose                                                                                                    | Used By                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `authenticate`               | Validates standard Bearer JWT. Checks Redis blacklist. Verifies org membership is active. Sets `req.user`. | All protected routes.        |
| `authenticateOptional`       | Same as `authenticate` but silently sets `req.user = null` on failure instead of throwing.                 | `POST /invitations/accept`.  |
| `authenticateSelectionToken` | Validates a short-lived JWT with `purpose: org_selection`. Extracts `user.id` from `sub`.                  | `POST /select-organization`. |
| `authorize(roles[])`         | Checks `req.user.role` against the allowed roles array. Returns `403 FORBIDDEN` if not matched.            | All role-protected routes.   |
