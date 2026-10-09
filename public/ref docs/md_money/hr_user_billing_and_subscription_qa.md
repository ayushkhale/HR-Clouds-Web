# HR Administrator Guide: Billing, Plans, Invoicing & Subscriptions (Code-Referenced Q&A)

This document answers common operational and financial queries asked by Human Resources (HR) Administrators and company founders managing subscriptions, billing, seat capacities, upgrades, renewals, and invoices in the HRMS.

Every answer is **strictly backed by and referenced from the active backend codebase**.

---

## 1. Plan Selection & Initial Onboarding

### Q1: How does an HR Administrator select and activate an initial subscription plan?
**Answer:**
When an administrator registers an organization, they specify a `plan_code` in the registration payload.
- **Free Tier Plans ($0.00):** If `Number(plan.amount) === 0`, activation is instantaneous. The system activates the organization, provisions the creator as an HR administrator, and creates a perpetual subscription (`current_period_end = null`). No payment gateway order is created.
- **Paid Tier Plans (> $0.00):** The system generates a Razorpay order, stores a pending transaction, and presents the Razorpay checkout modal. The tenant is provisioned in an `inactive` state and only activates once the payment signature and captured amount are verified.

**Code References:**
* `src/modules/organization/services/organization.service.js:103-128` — `subscriptionPlanRepository.findActiveByCode`, `Number(plan.amount) === 0` branch, and `createRazorpayOrder`.
* `src/modules/organization/services/organization.service.js:151-180` — Free plan immediate activation and `orgSubscriptionRepository.createSubscription`.
* `src/modules/billing/utils/billing_period.utils.js:25-27` — `periodEnd` sets `null` (perpetual) for `'lifetime'` billing cycle.

---

### Q2: What currencies and payment methods are supported?
**Answer:**
The system strictly operates in Indian Rupees (**INR**). Payment methods supported through the Razorpay integration include Credit/Debit Cards, UPI, Net Banking, and Corporate Cards.

**Code References:**
* `src/infrastructure/razorpay/razorpay.functions.js:33` — `if (currency !== 'INR') throw new AppError(400, 'Only INR is supported', 'UNSUPPORTED_CURRENCY')`.
* `src/modules/billing/services/settlement.service.js:120` — Captures `payment_method: payment.method` from gateway into `transactions`.

---

## 2. Seat Limits & Member Headcount

### Q3: What are seat limits, and how are our employees counted?
**Answer:**
Each subscription plan defines maximum capacity thresholds for three distinct roles:
1. `max_employees`: Maximum members holding the `employee` role.
2. `max_managers`: Maximum members holding the `manager` role.
3. `max_hrs`: Maximum members holding the `hr` role.

The backend computes live headcount by querying active role bindings across the organization.

**Code References:**
* `src/modules/billing/services/subscription.service.js:24-28` — `SEAT_ROLES = ['employees', 'managers', 'hrs']` mapped to role keys.
* `src/modules/billing/services/subscription.service.js:421-429` — `_computeUsage()` counts members via `userRoleRepository.countMembersByRole(orgId, role.id)`.

---

### Q4: What happens if our organization tries to invite more staff than our plan allows?
**Answer:**
When an administrator sends a new employee invitation (`POST /organizations/users/invite`), the subscription middleware intercepts the request and verifies current headcount plus pending invitations against `plan_snapshot.max_employees`. If the threshold is reached, the invitation is blocked immediately with HTTP `403 Forbidden` (`LIMIT_EXCEEDED`).

**Code References:**
* `src/common/middlewares/subscription.middleware.js:48-95` — `requireSubscription(true)` checks `currentCount >= maxLimit` and throws `AppError(403, 'Subscription limit exceeded for role ...', 'LIMIT_EXCEEDED')`.

---

## 3. Plan Renewals & Expiry

### Q5: When can an organization renew its subscription, and do we lose days if we renew early?
**Answer:**
- **Renewal Window:** An organization can renew its subscription within **15 days** before its current period ends (`RENEWAL_WINDOW_DAYS = 15`). Attempting to renew earlier than 15 days is refused with HTTP `409 Conflict` (`RENEWAL_TOO_EARLY`).
- **Zero Lost Days Guarantee:** If you renew 10 days before your plan expires, you do **not** lose those 10 days. The backend anchors the new billing period to your existing `current_period_end`. Your next year or month begins exactly when your old period would have ended.

**Code References:**
* `src/modules/billing/utils/billing_defaults.js:28` — `RENEWAL_WINDOW_DAYS = intEnv('BILLING_RENEWAL_WINDOW_DAYS', 15)`.
* `src/modules/billing/services/subscription.service.js:338-342` — Asserts `isWithinRenewalWindow`; sets `blocked_reason = 'RENEWAL_TOO_EARLY'`.
* `src/modules/billing/utils/billing_period.utils.js:45-53` — `renewalAnchor(currentPeriodEndISO, nowISO)` returns `end.toISOString()` if `now.isBefore(end)`.

---

### Q6: What happens if our subscription expires on the due date? Do we lose access immediately?
**Answer:**
No, access is not cut off immediately on the due date:
1. **Grace Period Access:** Plans include a seller-configured grace period (typically **3 to 5 days**, defined on the plan row as `grace_period_days`).
2. **Entitlement During Grace:** As long as `now < grace_ends_at`, the entitlement engine (`isEntitled`) evaluates to `true`. Employees can still punch attendance, submit leaves, and access documents.
3. **Grace Expiry:** Only after the grace period ends (`now >= grace_ends_at`) does the daily background cron transition the subscription to `expired`, terminating access with HTTP `402 Payment Required` (`NO_ACTIVE_SUBSCRIPTION`).

**Code References:**
* `src/modules/billing/utils/subscription_state.utils.js:66-73` — `isEntitled(sub, now)` returns `true` if `now < (sub.grace_ends_at || sub.current_period_end)`.
* `src/modules/billing/services/subscription_lifecycle.service.js:101-118` — Daily sweep checks: if `now >= current_period_end` and grace remains, moves to `in_grace`; if `now >= grace_ends_at`, moves to `expired`.

---

## 4. Plan Upgrades & Proration Math

### Q7: How is the upgrade price calculated if we upgrade mid-month or mid-year?
**Answer:**
Upgrades are strictly prorated based on the exact unused days remaining in your current billing cycle:
1. **Unused Credit:** The system calculates the unused monetary value of your current plan:
   $$\text{unused\_credit} = \text{round}\left(\frac{\text{current\_plan\_price} \times \text{remaining\_days}}{\text{total\_period\_days}}\right)$$
2. **Target Plan Prorated Cost:** The system calculates the cost of the new plan for those same remaining days:
   $$\text{target\_prorated} = \text{round}\left(\frac{\text{new\_plan\_price} \times \text{remaining\_days}}{\text{total\_period\_days}}\right)$$
3. **Amount Due:** You pay only the difference:
   $$\text{amount\_due} = \max(\text{target\_prorated} - \text{unused\_credit}, 0)$$
4. **Expiration Date Unchanged:** An upgrade **never extends the period**. You are upgrading your tier for the remainder of the time you already own.

**Code References:**
* `src/modules/billing/utils/proration.utils.js:35-83` — `quoteUpgrade({ current, targetPlan, nowISO })`.
* `src/modules/billing/utils/proration.utils.js:81` — Explicit assertion: `new_period_end: periodEndISO // UNCHANGED — an upgrade never extends the period`.
* `src/modules/billing/utils/proration.utils.js:87-90` — `applyMinimum`: If `0 < amount_due < ₹1.00`, rounded up to ₹1.00 (100 paise) because Razorpay rejects orders below ₹1.

---

### Q8: Can we preview the upgrade cost and unused credit before paying?
**Answer:**
Yes. The frontend invokes `GET /api/v1/billing/subscription/preview-change?plan_code=TARGET_PLAN`. This endpoint computes the exact proration math, displays your `unused_credit`, shows `amount_due`, checks whether your current headcount fits the target plan, and warns if any restrictions exist.

**Code References:**
* `src/modules/billing/controllers/subscription.controller.js:44-50` — `handleGetPreviewChange`.
* `src/modules/billing/services/subscription.service.js:187-200` — `previewChange` calls `deriveQuote`.

---

## 5. Plan Downgrades

### Q9: Can an HR Administrator downgrade to a cheaper plan immediately?
**Answer:**
No. Direct immediate downgrades via checkout are blocked (`409 USE_SCHEDULED_DOWNGRADE`).
- **Why:** You have already paid for your current tier's capacity through the end of your billing cycle.
- **How Downgrades Work:** Downgrades are **scheduled for the period end** via `POST /api/v1/billing/subscription/schedule-change`. You continue using your higher tier until your current paid period finishes.

**Code References:**
* `src/modules/billing/services/subscription.service.js:325-328` — `deriveQuote` sets `blocked_reason = 'USE_SCHEDULED_DOWNGRADE'` when `targetPaise < currentPaise`.
* `src/modules/billing/services/subscription_management.service.js:133-172` — `scheduleChange()` sets `scheduled_plan_id`.

---

### Q10: What happens if our current employee count exceeds the cheaper plan's limits?
**Answer:**
The system enforces a **pre-flight seat check** when scheduling a downgrade. If your current headcount exceeds the target plan's seat limits, the downgrade is refused immediately with HTTP `409 Conflict` (`SEAT_LIMIT_EXCEEDED`), detailing the excess staff per role. You must deactivate excess accounts before scheduling the downgrade.

**Code References:**
* `src/modules/billing/services/subscription_management.service.js:147-149` — Asserts `quote.seat_check.ok`; throws `AppError(409, 'Your current headcount exceeds the target plan limits', 'SEAT_LIMIT_EXCEEDED')`.

---

## 6. Cancellations & Refunds

### Q11: What is the difference between "Period-End Cancellation" and "Immediate Cancellation"?
**Answer:**
1. **Period-End Cancellation (`effective = 'period_end'`):**
   * Default and recommended mode.
   * Subscription remains `active` until `current_period_end`. Your team retains full access through the paid term.
   * Recurring renewal is cancelled. At period end, access lapses cleanly.
   * **Reversible:** You can undo this cancellation at any time before period end via `POST /billing/subscription/cancel/undo`.
2. **Immediate Cancellation (`effective = 'immediate'`):**
   * Requires explicit confirmation (`confirm: true`).
   * Subscription is marked `canceled` and `ended_at = now()`. Access terminates instantly.
   * **Irreversible:** You cannot undo an immediate cancellation; you must purchase a new subscription to reactivate.
   * **No Automated Refund:** Immediate termination does not automatically refund unused time.

**Code References:**
* `src/modules/billing/services/subscription_management.service.js:63-82` — Immediate vs period_end branch logic.
* `src/modules/billing/services/subscription_management.service.js:18-19` — `REFUND_POLICY_NOTE`: *"Cancelling now ends access immediately. No automatic refund is issued; contact support if you believe a refund applies."*
* `src/modules/billing/services/subscription_management.service.js:120-125` — `undoCancel` throws `409 CANCELLATION_NOT_REVERSIBLE` if the subscription was terminated immediately.

---

### Q12: How are refunds handled by the platform?
**Answer:**
Refunds are seller actions initiated by finance administrators directly through the Razorpay Dashboard.
- When finance issues a refund on Razorpay, our system ingests the webhook (`refund.processed`).
- The system allocates an official GST Credit Note number (e.g. `CN-2026-27-000001`), increments `transactions.refunded_amount`, and updates the payment status to `partially_refunded` or `refunded`.
- **A refund does not cancel your subscription.** Subscriptions remain active unless explicitly cancelled.

**Code References:**
* `src/modules/billing/services/refund.service.js:27-28` — Code rule: *"A refund is recorded ONLY. It never cancels a subscription (D-B14 / EC-B20)."*
* `src/modules/billing/services/refund.service.js:83-86` — Allocates gapless credit note from `invoiceSequenceRepository.allocate(scope, t)`.

---

## 7. Invoicing & GST Tax Compliance

### Q13: Where can an HR Administrator download or view GST tax invoices?
**Answer:**
Invoices are available for every settled transaction via `GET /api/v1/billing/payments/:transactionId/invoice`.
- **Consecutive Serial Numbers:** Every tax invoice carries a gapless, statutory Indian Financial Year serial number (e.g. `INV-2026-27-000084`).
- **Frozen Compliance Snapshot:** The invoice snapshot freezes your company's legal name, registered address, GSTIN, and PAN as they existed at the moment of payment. Any later edits to your company profile will not retroactively alter historic tax invoices.

**Code References:**
* `src/modules/billing/services/subscription.service.js:257-275` — `getInvoice` fetches frozen `invoice_snapshot`.
* `src/modules/billing/services/settlement.service.js:195-202` — Allocates sequential invoice number and creates `invoiceSnapshot`.
* `src/modules/billing/utils/invoice_snapshot.utils.js:1-55` — Assembles seller details, buyer details, SAC code `998314`, and tax breakup.

---

## 8. Network Interruptions & Payment Safeguards

### Q14: What happens if my card is charged but my internet disconnects before returning to the HRMS?
**Answer:**
Your payment and subscription are completely safe:
1. **Automated Webhooks:** When your payment completes at the bank, Razorpay sends a server-to-server webhook (`payment.captured`) directly to our backend (`POST /webhooks/razorpay`). The backend automatically activates your subscription within seconds.
2. **Hourly Reconciler Cron:** If a webhook is delayed or dropped, an automated background reconciler runs every hour. It checks all pending transactions with Razorpay (`fetchOrderPayments`). If Razorpay confirms payment was captured, the reconciler automatically settles the order and activates your subscription.
3. **No Duplicate Charges:** Clicking "Pay" again uses your unique transaction order; you cannot be charged twice for the same checkout.

**Code References:**
* `src/modules/billing/services/billing_webhook.service.js:144-155` — `_processCapture` handles webhook delivery and calls `settlementService.settle({ source: 'webhook' })`.
* `src/modules/billing/services/billing_reconciliation.service.js:29-37` — Background reconciler detects captured payments and settles them via `source: 'reconciler'`.
* `src/modules/billing/services/settlement.service.js:106-110` — Idempotent re-entry branch returns `already_settled: true` without double-mutating.

---

### Q15: What happens if an HR Administrator accidentally clicks "Pay" across multiple tabs?
**Answer:**
The database enforces a partial unique index: `transactions_one_pending_subscription_uidx`.
- Only **one** checkout order can be pending per organization at any time.
- If a second tab attempts to create a checkout while one is open, the system blocks it with HTTP `409 Conflict` (`CHECKOUT_ALREADY_PENDING`) and returns the existing open order ID so the user can complete the same payment rather than creating duplicate orders.

**Code References:**
* `src/modules/billing/services/checkout.service.js:237-248` — `_handleCheckoutUnique` catches duplicate constraint and returns `409 CHECKOUT_ALREADY_PENDING` with `details.order_id`.

---

## 9. Billing Notification Emails & Lead Days

### Q16: How can our company's Finance or Accounts team receive billing emails?
**Answer:**
By default, billing notifications are emailed to users holding the HR Administrator role. An HR Administrator can add up to **5 additional email addresses** (such as `accounts@company.com` or `cfo@company.com`) by updating the organization profile settings:
```http
PATCH /api/v1/organizations/profile
{
  "billing_notification_emails": ["finance@acme.com", "billing@acme.com"]
}
```

**Code References:**
* `src/modules/organization/models/organization_profiles.model.js:114-118` — Column `billing_notification_emails` (JSONB array, default `[]`).
* `src/modules/organization/validators/organization.validator.js:31-33` — Joi schema enforces array of max 5 valid emails.
* `src/modules/billing/services/billing_notification.service.js:52-64` — Recipient resolver joins HR admin users with `billing_notification_emails`.

---

### Q17: How many days before subscription expiry do we receive email warnings?
**Answer:**
By default, expiry reminder emails are dispatched **7 days** and **1 day** before your subscription period ends (`[7, 1]`). HR can customize this schedule (e.g. `[30, 14, 7, 1]`) up to 4 custom lead days between 1 and 90 days before expiry:
```http
PATCH /api/v1/organizations/profile
{
  "billing_reminder_lead_days": [30, 15, 7, 1]
}
```
Setting `billing_reminder_lead_days: []` disables advance reminder notices (final expiry notices on the day of expiry are still sent).

**Code References:**
* `src/modules/organization/models/organization_profiles.model.js:120-124` — Column `billing_reminder_lead_days` (default `[7, 1]`).
* `src/modules/organization/validators/organization.validator.js:34-36` — Joi schema enforces array of max 4 integers (1–90).
* `src/modules/billing/services/subscription_lifecycle.service.js:145-168` — Pass 4 calculates upcoming expirations matching lead days and emits `notice.expiring`.
