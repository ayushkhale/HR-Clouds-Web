# Complete Catalog of Money & Payment Operations / APIs

This document provides a comprehensive, implementation-accurate review of **all operations and APIs that involve financial transactions, currency calculation, payment gateway interactions, subscription purchasing, renewals, proration, and invoicing** across the HRMS platform.

It consolidates financial touchpoints from the Organization Onboarding domain (`public/md_organization/`) and the Billing Lifecycle domain (`src/modules/billing/`).

---

## 1. Executive Summary of Financial Operations

Across the HRMS platform, money is involved in three distinct commercial scenarios:
1. **Initial Tenant Onboarding (Registration):** An organization creator purchases a subscription plan during company registration.
2. **Ongoing Subscription Lifecycle (Billing HR):** An existing organization renews their current plan, upgrades to a higher tier with proration, voids abandoned checkouts, or schedules a downgrade.
3. **Statutory Accounting & Reconciliation:** Ingestion of payment gateway captures, webhook settlements, automated background reconciliation, refund tracking, and gapless GST invoice allocation.

### Core Financial Invariants
* **Currency Restriction:** All transactions and orders are strictly denominated in Indian National Rupees (**INR**). The Razorpay provider hard-rejects any other currency (`createRazorpayOrder` in `src/infrastructure/razorpay/razorpay.functions.js:33`).
* **Zero Floating-Point Drift:** In the database, money is stored as `DECIMAL(10,2)` strings (e.g. `'14999.00'`). In the payment gateway, money is processed as integer paise (e.g. `1499900`). All arithmetic and conversions pass strictly through `src/modules/billing/utils/money.utils.js` using integer math (`toPaise`, `fromPaise`, `assertGatewayAmount`).
* **Zero Client Trust:** The frontend **never** sends an amount to be charged. The backend derives the price server-side from immutable plan rows and freezes it into `plan_snapshot` on the transaction and subscription.

---

## 2. Master Table of Money-Involving APIs

| API # | HTTP Method | Endpoint Route | Financial Operation | Money Flow / Gateway Call | Roles / Authentication |
| :---: | :---: | :--- | :--- | :--- | :--- |
| **#2** | `POST` | `/api/v1/organizations/register/initiate` | Initial Plan Purchase (Onboarding) | Creates Razorpay Order for paid plan; $0 plans activate instantly | `guest` (JWT Bearer) |
| **#3** | `POST` | `/api/v1/organizations/register/verify-payment` | Initial Payment Settlement (Onboarding) | Verifies signature, validates captured amount, activates tenant, issues invoice | `guest` (JWT Bearer) |
| **#232** | `POST` | `/api/v1/billing/subscription/checkout` | Subscription Purchase / Renewal / Upgrade | Derives intent, prorates upgrade delta, creates Razorpay Order, opens pending tx | `hr` (JWT Bearer) |
| **#233** | `POST` | `/api/v1/billing/subscription/checkout/verify` | Interactive Payment Verification | Validates signature, verifies captured paise against DB, issues invoice | `hr` (JWT Bearer) |
| **#234** | `POST` | `/api/v1/billing/subscription/checkout/cancel` | Void Abandoned Checkout Order | Gateway re-check: voids if unpaid; settles if actually captured | `hr` (JWT Bearer) |
| **#235** | `POST` | `/api/v1/billing/subscription/cancel` | Cancel Active Subscription | Stops recurring renewal; immediate mode terminates without auto-refund | `hr` (JWT Bearer) |
| **#236** | `POST` | `/api/v1/billing/subscription/cancel/undo` | Undo Scheduled Cancellation | Restores renewal schedule for active subscription | `hr` (JWT Bearer) |
| **#237** | `POST` | `/api/v1/billing/subscription/schedule-change` | Schedule Plan Downgrade | Queues lower-priced plan for period-end transition | `hr` (JWT Bearer) |
| **#238** | `GET` | `/api/v1/billing/subscription/preview-change` | Preview Proration & Amount Due | Pure quote: computes unused credit, target prorated cost, and amount due | `hr` (JWT Bearer) |
| **#229** | `GET` | `/api/v1/billing/payments` | List Financial Transactions | Reads payments, base amounts, taxes, refunded amounts, and invoice numbers | `hr` (JWT Bearer) |
| **#230** | `GET` | `/api/v1/billing/payments/:transactionId` | Payment Detail & Credit Notes | Reads transaction details, refund items, and linked credit notes | `hr` (JWT Bearer) |
| **#231** | `GET` | `/api/v1/billing/payments/:transactionId/invoice` | Frozen GST Tax Invoice | Statutory tax invoice snapshot with line items, tax rates, and credit notes | `hr` (JWT Bearer) |
| **#239** | `POST` | `/webhooks/razorpay` | Asynchronous Gateway Webhook | Ingests `payment.captured`, `payment.failed`, `refund.processed` | Public (HMAC Gated) |

---

## 3. Detailed Specifications of Each Money Operation

### A. Initial Organization Onboarding Payments

#### API #2: POST /api/v1/organizations/register/initiate
* **Source Files:**
  * Controller: `src/modules/organization/controllers/onboarding.controller.js:7`
  * Validator: `src/modules/organization/validators/onboarding.validator.js:4` (`fieldValidation_InitiateRegistration`)
  * Service: `src/modules/organization/services/organization.service.js:98` (`initiateRegistration`)
* **Financial Logic:**
  1. Resolves `plan_code` against `subscription_plans` via `subscriptionPlanRepository.findActiveByCode(payload.plan_code)`.
  2. If `Number(plan.amount) === 0` (Free Tier):
     * Bypasses payment gateway entirely.
     * Activates organization immediately.
     * Materializes active subscription with `current_period_end = null` (perpetual lifetime access).
     * Returns HTTP `200 OK` with activated HR access tokens.
  3. If `Number(plan.amount) > 0` (Paid Tier):
     * Mints a Razorpay order **before** opening the database transaction via `createRazorpayOrder({ amount: Number(plan.amount), currency: plan.currency, orderId: newOrgId })`.
     * Inside database transaction: inserts `organizations` (status `inactive`), `organization_profiles`, and creates a pending `transactions` row (`type = 'subscription'`, `status = 'pending'`, `amount = plan.amount`, `intent = 'initial'`, `plan_snapshot`).
     * Returns Razorpay order details to frontend.
* **Request Body Payload:**
  ```json
  {
    "plan_code": "growth_yearly",
    "org_name": "Acme Technologies Private Limited",
    "org_alias": "AcmeTech",
    "industry": "Software",
    "size": "50-100",
    "website": "https://acme.com",
    "phone_number": "+91 80 4000 0000",
    "gst_number": "29ABCDE1234F1Z5",
    "company_pan_number": "ABCDE1234F"
  }
  ```
* **Success Response (Paid Plan):**
  ```json
  {
    "success": true,
    "message": "Registration initiated, proceed to payment",
    "data": {
      "org_id": "3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11",
      "razorpay_order": {
        "id": "order_ORD1234567890",
        "amount": 1499900,
        "currency": "INR",
        "receipt": "3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11",
        "status": "created"
      }
    }
  }
  ```

---

#### API #3: POST /api/v1/organizations/register/verify-payment
* **Source Files:**
  * Controller: `src/modules/organization/controllers/onboarding.controller.js:30`
  * Validator: `src/modules/organization/validators/onboarding.validator.js:22` (`fieldValidation_VerifyPayment`)
  * Service: `src/modules/organization/services/organization.service.js:231` (`verifyPayment`)
  * Settlement: `src/modules/billing/services/settlement.service.js:52` (`settle`)
* **Financial & Settlement Logic:**
  1. Locates transaction by `razorpay_order_id`. Verifies ownership by `org_id` and calling user.
  2. Verifies cryptographic signature using `crypto.timingSafeEqual` (`verifyRazorpaySignature`).
  3. Executes out-of-band HTTPS fetch to Razorpay (`fetchPayment(paymentId)`) to verify captured status and assert exact integer paise match (`assertGatewayAmount`).
  4. In a single database transaction:
     * Transitions transaction `status = 'pending' -> 'success'`, stamps `settled_at`, `settled_via = 'client_callback'`.
     * Materializes new `org_subscriptions` row with `plan_snapshot` and calculated billing period.
     * Executes `onProvision`: activates organization (`status = 'active'`), assigns `hr` role to creator.
     * Allocates gapless consecutive GST invoice serial from `billing_invoice_sequences` under `FOR UPDATE` lock.
     * Commits frozen `invoice_snapshot` onto the transaction row.
     * Writes `payment.succeeded` and `subscription.activated` to `subscription_events`.
* **Request Body Payload:**
  ```json
  {
    "razorpay_order_id": "order_ORD1234567890",
    "razorpay_payment_id": "pay_PAY1234567890",
    "razorpay_signature": "e5c2b79a8d1f...",
    "org_id": "3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11"
  }
  ```
* **Success Response:**
  ```json
  {
    "success": true,
    "message": "Payment verified, organization registered successfully",
    "data": {
      "org_id": "3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11",
      "status": "active",
      "role": "hr",
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

---

### B. Ongoing Subscription & Plan Lifecycle Money APIs

#### API #238: GET /api/v1/billing/subscription/preview-change
* **Source Files:**
  * Controller: `src/modules/billing/controllers/subscription.controller.js:44`
  * Service: `src/modules/billing/services/subscription.service.js:187` (`previewChange`) & `303` (`deriveQuote`)
  * Proration: `src/modules/billing/utils/proration.utils.js:35` (`quoteUpgrade`)
* **Financial Logic:**
  * Takes `?plan_code=` query parameter.
  * Evaluates current active subscription vs target plan.
  * If upgrading to a more expensive tier:
    $$\text{period\_days} = \max(1, \text{ceilDays}(\text{period\_start}, \text{period\_end}))$$
    $$\text{remaining\_days} = \max(0, \text{ceilDays}(\text{now}, \text{period\_end}))$$
    $$\text{unused\_credit} = \text{round}\left(\frac{\text{current\_amount} \times \text{remaining\_days}}{\text{period\_days}}\right)$$
    $$\text{target\_prorated} = \text{round}\left(\frac{\text{target\_amount} \times \text{remaining\_days}}{\text{period\_days}}\right)$$
    $$\text{amount\_due} = \max(\text{target\_prorated} - \text{unused\_credit}, 0)$$
  * Floored at ₹1.00 (100 paise) if between ₹0.01 and ₹0.99 because gateway rejects orders $< 100$ paise.
* **Success Response:**
  ```json
  {
    "success": true,
    "message": "Change preview computed successfully",
    "data": {
      "intent": "upgrade",
      "requires_payment": true,
      "amount_due": "14000.00",
      "currency": "INR",
      "proration": {
        "remaining_days": 358,
        "period_days": 365,
        "unused_credit": "999.00",
        "target_prorated": "14999.00"
      },
      "new_period_start": "2026-10-01T04:30:00.000Z",
      "new_period_end": "2027-10-01T00:00:00.000Z",
      "seat_check": { "ok": true, "violations": [] },
      "blocked_reason": null
    }
  }
  ```

---

#### API #232: POST /api/v1/billing/subscription/checkout
* **Source Files:**
  * Controller: `src/modules/billing/controllers/subscription.controller.js:53`
  * Validator: `src/modules/billing/validators/subscription.validator.js:25` (`fieldValidation_CheckoutBody`)
  * Service: `src/modules/billing/services/checkout.service.js:52` (`checkout`)
* **Financial Logic:**
  1. Requires `Idempotency-Key` header (16–100 chars).
  2. Rates limited to 10 requests/hour per organization.
  3. Derives intent server-side: `'renewal'`, `'upgrade'`, `'reactivation'`.
  4. Validates renewal window (must be within 15 days of expiry for renewals).
  5. Validates headcount against target plan limits (`SEAT_LIMIT_EXCEEDED`).
  6. Calculates `amount_due`.
  7. If zero-amount upgrade (e.g. free tier reactivation): short-circuits, applies subscription directly without gateway call.
  8. If paid: generates transaction UUID, calls `createRazorpayOrder({ amount, currency, orderId })` outside DB transaction.
  9. Inserts pending `transactions` row inside DB transaction. Anti-double-checkout partial unique index prevents concurrent duplicate checkouts.
* **Request Payload:**
  ```json
  {
    "plan_code": "growth_yearly"
  }
  ```
* **Success Response:**
  ```json
  {
    "success": true,
    "message": "Checkout created successfully",
    "data": {
      "transaction_id": "9c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
      "intent": "upgrade",
      "requires_payment": true,
      "amount": "14000.00",
      "currency": "INR",
      "order": {
        "id": "order_ORD1234567890",
        "amount": 1400000,
        "currency": "INR",
        "receipt": "9c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f"
      },
      "razorpay_key_id": "rzp_test_1DP5mmOlF5G5ag",
      "quote": {
        "base_amount": "14999.00",
        "unused_credit": "999.00",
        "new_period_end": "2027-10-01T00:00:00.000Z"
      }
    }
  }
  ```

---

#### API #233: POST /api/v1/billing/subscription/checkout/verify
* **Source Files:**
  * Controller: `src/modules/billing/controllers/subscription.controller.js:66`
  * Validator: `src/modules/billing/validators/subscription.validator.js:36` (`fieldValidation_VerifyBody`)
  * Service: `src/modules/billing/services/settlement.service.js:52` (`settle`)
* **Financial Logic:**
  1. Takes `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
  2. Verifies HMAC-SHA256 signature timing-safely.
  3. Pre-transaction gateway check: verifies payment is `captured` on Razorpay and matches `tx.amount` in paise.
  4. Takes `FOR UPDATE` lock on `transactions` row.
  5. Updates transaction to `success`, records `settled_at`, `settled_via = 'client_callback'`.
  6. Takes `FOR UPDATE` lock on live `org_subscriptions` row, supersedes old subscription to `canceled`, creates new subscription row.
  7. Allocates gapless consecutive GST invoice number (`billing_invoice_sequences`).
  8. Freezes immutable `invoice_snapshot` into transaction.
* **Success Response:**
  ```json
  {
    "success": true,
    "message": "Payment verified successfully",
    "data": {
      "already_settled": false,
      "org_id": "3c9b1e5a-7f2d-4e5f-8a1b-9c3d4e5f6a11",
      "transaction_id": "9c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
      "subscription_id": "7b1e4f92-913a-4a29-87a1-3c9d2b1f8e40",
      "status": "active",
      "invoice_number": "INV-2026-27-000084",
      "intent": "upgrade"
    }
  }
  ```

---

#### API #234: POST /api/v1/billing/subscription/checkout/cancel
* **Source Files:**
  * Controller: `src/modules/billing/controllers/subscription.controller.js:84`
  * Service: `src/modules/billing/services/checkout.service.js:108` (`voidCheckout`)
* **Financial Protection Logic:**
  * Voids an abandoned pending checkout order so the tenant can pick a different plan.
  * **Gateway Guard:** Before cancelling, probes Razorpay (`fetchOrderPayments`). If the gateway reports that the customer actually completed payment, it **refuses cancellation, settles the payment immediately, and throws HTTP 409 Conflict (`PAYMENT_ALREADY_CAPTURED`)**.
  * If truly unpaid, transitions `transactions.status = 'cancelled'`, freeing the partial unique index.

---

#### API #235: POST /api/v1/billing/subscription/cancel
* **Source Files:**
  * Controller: `src/modules/billing/controllers/subscription.controller.js:92`
  * Validator: `src/modules/billing/validators/subscription.validator.js:43` (`fieldValidation_CancelBody`)
  * Service: `src/modules/billing/services/subscription_management.service.js:34` (`cancel`)
* **Financial & Termination Rules:**
  1. `period_end` (Default): Sets `cancel_at_period_end = true`. Subscription stays `active` until `current_period_end`. The organization retains access to all features already paid for.
  2. `immediate`: Requires `confirm: true`. Sets `status = 'canceled'`, `ended_at = now()`. Entitlements terminate immediately.
  3. **No Automatic Refund Rule:** The backend does **not** auto-issue a refund. The response includes an explicit policy disclaimer (`refund_policy_note` in `subscription_management.service.js:19`).
* **Request Payload:**
  ```json
  {
    "effective": "immediate",
    "reason": "Shutting down operations",
    "confirm": true
  }
  ```

---

#### API #237: POST /api/v1/billing/subscription/schedule-change
* **Source Files:**
  * Controller: `src/modules/billing/controllers/subscription.controller.js:109`
  * Validator: `src/modules/billing/validators/subscription.validator.js:50` (`fieldValidation_ScheduleChangeBody`)
  * Service: `src/modules/billing/services/subscription_management.service.js:133` (`scheduleChange`)
* **Financial Rule (D-B16):**
  * Downgrades are **never prorated and never executed immediately via checkout**.
  * Setting a downgrade queues `scheduled_plan_id` to take effect when the current billing cycle expires.
  * If the target plan is free ($0), the background cron automatically applies the downgrade at period end without payment.
  * If the target plan costs money, it becomes the pre-selected renewal option at period end.

---

### C. Invoicing, Accounting & Asynchronous Gateway Endpoints

#### API #231: GET /api/v1/billing/payments/:transactionId/invoice
* **Source Files:**
  * Controller: `src/modules/billing/controllers/payment.controller.js:25`
  * Service: `src/modules/billing/services/subscription.service.js:257` (`getInvoice`)
  * Snapshot Builder: `src/modules/billing/utils/invoice_snapshot.utils.js`
* **Financial & Compliance Structure:**
  * Accessible only for payments with status `success`, `partially_refunded`, or `refunded`.
  * Returns the frozen `invoice_snapshot` JSON saved during settlement:
    - **Seller Block:** Legal company name, Gurugram address, GSTIN, PAN, state code.
    - **Buyer Block:** Organization legal name, registered address, GSTIN, PAN as of settlement time.
    - **Line Items:** Plan description, HSN/SAC code (`998314`), quantity, unit price, total.
    - **Tax Breakup:** Subtotal, CGST, SGST, IGST, currency (`INR`).
    - **Credit Notes:** Linked credit note numbers and amounts if partial or full refunds occurred.
* **Sample Invoice Data:**
  ```json
  {
    "success": true,
    "message": "Invoice fetched successfully",
    "data": {
      "invoice_number": "INV-2026-27-000084",
      "invoice_date": "2026-10-01T04:32:10.000Z",
      "seller": {
        "legal_name": "HrClouds Technologies Private Limited",
        "gstin": "06AAACH1234F1Z5",
        "state_code": "06"
      },
      "buyer": {
        "org_name": "Acme Technologies Private Limited",
        "gstin": "29ABCDE1234F1Z5",
        "state_code": "29"
      },
      "line_items": [
        {
          "description": "Subscription Upgrade: Growth Yearly",
          "hsn_sac": "998314",
          "unit_price": "14000.00",
          "amount": "14000.00"
        }
      ],
      "totals": {
        "taxable_amount": "14000.00",
        "total_amount": "14000.00",
        "currency": "INR"
      },
      "credit_notes": []
    }
  }
  ```

---

#### API #239: POST /webhooks/razorpay
* **Source Files:**
  * Controller: `src/modules/billing/controllers/webhook.controller.js:9`
  * Service: `src/modules/billing/services/billing_webhook.service.js:45` (`ingest`) & `83` (`drain`)
  * Refund Handler: `src/modules/billing/services/refund.service.js:33` (`handleWebhookEvent`)
* **Asynchronous Money Processing:**
  1. Validates webhook signature against `RAZORPAY_WEBHOOK_SECRET` over raw bytes.
  2. Redacts card/bank PII and saves to `billing_webhook_events`. Returns HTTP `200 { "received": true }`.
  3. Worker cron (`billing_webhook_drain.cron.js`, every 5 min) processes:
     * `payment.captured` / `order.paid`: Dispatches to `settlementService.settle({ source: 'webhook' })`. Activates subscription if user closed the browser.
     * `payment.failed`: Transitions transaction `status = 'failed'`, records error code.
     * `refund.created` / `refund.processed`: Ingests refund, allocates gapless Credit Note serial (`CN-2026-27-000001`), increments `transactions.refunded_amount`, transitions transaction `status = 'success' -> 'partially_refunded' -> 'refunded'`.

---

## 4. Financial Audit & Traceability Checklist

| Control Requirement | Implementation Verification |
| :--- | :--- |
| **No Float Money Math** | All calculations conducted in integer paise via `src/modules/billing/utils/money.utils.js`. |
| **No In-Place Plan Edits** | Plan prices are immutable; price changes create new rows (`D-B9`). |
| **Tamper-Proof Amounts** | Mandatory out-of-band HTTPS gateway cross-check on every settlement. |
| **Anti-Double-Billing** | Partial unique index `transactions_one_pending_subscription_uidx` + lock ordering. |
| **Statutory GST Sequencing** | Gapless allocation via `billing_invoice_sequences` table locked `FOR UPDATE`. |
| **Credit Note Tracking** | Reverse tax serials (`CN-YYYY-YY`) allocated when refunds are confirmed. |
| **Lost Tab Safety** | Webhook inbox + hourly reconciler cron guarantee settlement if user closes browser. |
