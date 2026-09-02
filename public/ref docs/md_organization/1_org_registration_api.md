# Organization Registration & Subscription APIs

**Base URL:** `/api/v1/organizations/register`  

> **Note:** The specific function and ORM method names (e.g., `Organization.create()`) used in the internal execution flows are conceptual/dummy names intended to clearly illustrate the business logic. The internal execution logic, database interactions, transactions, side-effects, and validations described are strictly accurate and verified against the actual codebase.
**Source of Truth:** `organization.routes.js`, `organization.controller.js`, `organization.service.js`  
**Last Verified:** August 21, 2026

---

## 1. Initiate Organization Registration

### Purpose

Allows a newly signed-up user (with a `guest` role) to create their organization/tenant in the system. It provisions the initial organization structure, creates a pending transaction for paid plans, and returns a Razorpay order ID. For free plans, it instantly activates the organization and promotes the user to HR.

### Endpoint

```
POST /api/v1/organizations/register/initiate
```

### Authentication and Authorization

- **Authentication:** Required. Bearer token (JWT).
- **Role:** Must be a `guest` (inferred from JWT payload).

### Request Structure

**Headers:**

```json
{
  "Authorization": "Bearer <access_token>",
  "Content-Type": "application/json"
}
```

**Body:**

```json
{
  "plan_code": "premium_monthly",
  "org_name": "Tech Corp",
  "org_alias": "TechCorp",
  "industry": "IT",
  "size": "50-100",
  "website": "https://techcorp.com",
  "phone_number": "+1234567890",
  "gst_number": "22AAAAA0000A1Z5",
  "company_pan_number": "ABCDE1234F"
}
```

### Validation Rules

- `plan_code`: String. Required. Must match a valid code in the database.
- `org_name`: String. Required. Min 2, Max 150 characters.
- `org_alias`: String. Optional. Max 100 characters. Allows null/empty.
- `industry`: String. Optional. Max 100 characters.
- `size`: String. Optional. Max 50 characters.
- `website`: String. Optional. Max 255 characters. (Note: No strict URI validation is performed).
- `phone_number`: String. Optional. Max 20 characters.
- `gst_number`: String. Optional. Max 50 characters.
- `company_pan_number`: String. Optional. Max 50 characters.

### Internal Working

1. **Validate Request:** Verify body against Joi schema.
2. **Fetch Plan:** Lookup `subscription_plans` by `plan_code`. Throws 404 if not found or inactive.
3. **Generate Org Key:** Normalizes `org_name` and appends a timestamp.
4. **Create Org:** Creates record in `organizations` (status = `inactive`).
5. **Create Profile:** Creates `organization_profiles` record.
6. **Branch: Free Plan ($0)**
   - Updates org status to `active`.
   - Creates active `organization_subscriptions` record.
   - Finds the `hr` role ID and assigns it to the user via `user_roles`.
   - Generates a random HR employee code (`HR-XXXXXX`).
   - Creates an `hr_profiles` record for the user.
   - Generates a new JWT with `role=hr` and `orgId=newOrg.id`.
   - Blacklists the old JWT in Redis.
   - Commits transaction and returns new tokens.
7. **Branch: Paid Plan (> $0)**
   - Calls Razorpay API to create an order for the plan amount.
   - Creates a `transactions` record (status = `pending`) storing the order ID and plan metadata.
   - Commits transaction and returns the Razorpay order ID to the frontend.

### Database Operations

- **Read:** `subscription_plans`, `roles`
- **Create:** `organizations`, `organization_profiles`, `transactions` (if paid) OR `organization_subscriptions`, `user_roles`, `hr_profiles` (if free).
- **Update:** `organizations.status` (if free).
- **Transactions:** Yes, fully wrapped in a PostgreSQL transaction.

### External Services

- **Razorpay:** `createRazorpayOrder` is called for paid plans. Synchronous.
- **Redis:** `setEx` is called for free plans to blacklist the old `guest` JWT token.

### Response Structure

**Success (Free Plan) - 200 OK**

```json
{
  "success": true,
  "message": "Free plan activated successfully",
  "data": {
    "org_id": "uuid-v4",
    "status": "active",
    "role": "hr",
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

**Success (Paid Plan) - 200 OK**

```json
{
  "success": true,
  "message": "Registration initiated, proceed to payment",
  "data": {
    "org_id": "uuid-v4",
    "razorpay_order": {
      "id": "order_xyz",
      "amount": 50000,
      "currency": "INR"
    }
  }
}
```

### Error Handling

- `401 Unauthorized` - Token missing or invalid.
- `404 PLAN_NOT_FOUND` - Provided `plan_code` doesn't exist.

### Frontend Integration

**When to Call:** When the user selects a subscription plan and submits the organization details form.
**Required Data:** `plan_code` from the selection UI, and org details from the form.
**Frontend Response Handling:**

- **If Free:** Replace the `accessToken` and `refreshToken` in local storage. Update global state role to `hr`. Navigate to HR Dashboard.
- **If Paid:** Do NOT navigate. Open the Razorpay Checkout Modal using the returned `razorpay_order.id` and `amount`.

---

## 2. Verify Payment

### Purpose

Verifies the cryptographic signature of a successful Razorpay transaction. Upon success, activates the pending organization, creates the subscription, promotes the guest user to HR, and issues new JWT tokens.

### Endpoint

```
POST /api/v1/organizations/register/verify-payment
```

### Authentication and Authorization

- **Authentication:** Required. Bearer token (JWT).
- **Role:** `guest` (using the old token).

### Request Structure

**Headers:**

```json
{
  "Authorization": "Bearer <access_token>",
  "Content-Type": "application/json"
}
```

**Body:**

```json
{
  "razorpay_order_id": "order_xyz",
  "razorpay_payment_id": "pay_xyz",
  "razorpay_signature": "signature_hash",
  "org_id": "uuid-v4"
}
```

### Validation Rules

- `razorpay_order_id`: String. Required.
- `razorpay_payment_id`: String. Required.
- `razorpay_signature`: String. Required.
- `org_id`: UUIDv4. Required. Must match the ID returned from the initiate API.

### Internal Working

1. **Fetch Transaction:** Look up pending transaction by `razorpay_order_id`. Throws 404 if not found.
2. **Security Checks:** Verify the transaction belongs to `userId` and `org_id`. Ensure type is `subscription` and provider is `razorpay`.
3. **Verify Signature:** Concatenate `order_id|payment_id` and hash with `RAZORPAY_KEY_SECRET`. Compare with `razorpay_signature`.
4. **Invalid Signature Handling:** If signature fails, log to `payment_audits` and throw 400.
5. **Idempotent Update:** Attempt to update transaction status to `success` _only if_ current status is `pending`. If affected rows = 0, check if it was already updated by a concurrent request.
6. **Activate Organization:** Start DB transaction. Fetch org, update status to `active`.
7. **Assign HR Role:** Fetch `hr` role ID. If user doesn't have it, assign it via `user_roles` and create `hr_profiles`.
8. **Create Subscription:** Create `organization_subscriptions` linking the org, plan, and transaction. Deactivate any prior active subscriptions.
9. **Issue Tokens:** Generate new JWTs with `role=hr` and `orgId=org.id`.
10. **Revoke Old Token:** Blacklist the old `guest` JWT in Redis.
11. **Commit:** Commit PostgreSQL transaction.

### Database Operations

- **Read:** `transactions`, `organizations`, `roles`, `user_roles`.
- **Update:** `transactions` (atomic state change), `organizations` (status), `organization_subscriptions` (deactivate old).
- **Create:** `payment_audits` (on failure), `user_roles`, `hr_profiles`, `organization_subscriptions`.
- **Transactions:** Used to ensure atomic activation of org, role, and subscription.

### Important Side Effects

- **Idempotency:** This API is highly idempotent. If network failure occurs after Razorpay charges the user, the frontend can safely retry this API. The backend will detect `currentTxStatus !== 'pending'` and gracefully skip the update while still returning the success payload and new tokens.
- **Token Revocation:** The old JWT used to make the request is permanently invalidated.

### Response Structure

**200 OK**

```json
{
  "success": true,
  "message": "Payment verified, organization registered successfully",
  "data": {
    "org_id": "uuid-v4",
    "status": "active",
    "role": "hr",
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

### Error Handling

- `400 PAYMENT_VERIFICATION_FAILED` - Razorpay signature mismatch. (Potential fraud attempt).
- `400 ORG_MISMATCH` - User tried to verify payment for a different org ID.
- `403 UNAUTHORIZED_TX` - User trying to verify someone else's order.
- `404 TX_NOT_FOUND` - Order ID doesn't exist in DB.

### Frontend Integration

**When to Call:** Inside the `handler` callback of the Razorpay Checkout Modal after a successful payment.
**Required Data:** The three parameters passed into the Razorpay handler function, plus the `org_id` saved from the Initiate API step.
**Frontend Response Handling:**

- Replace `accessToken` and `refreshToken` in local storage.
- Update global state role to `hr`.
- Route the user to the HR Dashboard (`/dashboard`).
