// ─────────────────────────────────────────────────────────────────────────────
// billing.api.js — Subscription, plans, payments and GST invoices (#225–#239).
//
// Contract source of truth: public/ref docs/md_money/phase1_api_analysis.md,
// with the operational background in money_operations_and_apis.md,
// money_and_subscription_handling_architecture.md and the HR Q&A
// hr_user_billing_and_subscription_qa.md.
//
// This is the only domain in the product where money LEAVES the customer, and
// the contract is built so the client can never influence what is charged:
//
//   · We send a `plan_code` and nothing else. No amount, no currency, no
//     intent. The server reads the price from its own plan rows, freezes it
//     into a `plan_snapshot`, and hands Razorpay the figure itself. There is
//     deliberately no way to pass an amount from here — don't add one.
//   · The server DERIVES the intent (initial / renewal / upgrade /
//     reactivation) from the organisation's current subscription. The UI never
//     declares "this is an upgrade"; it asks #238 what this plan change would
//     be and renders the answer.
//   · #238 (preview) and #232 (checkout) run the SAME quote function server
//     side, so a preview's `blocked_reason` is exactly the `errorCode` the
//     checkout would have raised. Always preview before charging — that is
//     what keeps a seat violation or an early renewal out of the gateway.
//
// Everything except #225 is HR-only (`authorize(HR_ONLY)`); #225 is open to
// every authenticated role because a guest mid-registration has to read the
// catalogue before an organisation exists. #239 (`POST /webhooks/razorpay`) is
// a server-to-server webhook and has no client function here by design — it is
// what settles a payment when our verify call never lands.
//
// Two contract traps worth keeping:
//   · #232 REQUIRES an `Idempotency-Key` header, and a retry has to reuse the
//     same one — a fresh key on a retried click mints a second gateway order.
//     `checkout()` therefore takes the key as an argument rather than
//     generating one, so the caller owns its lifetime (one key per "Confirm
//     and pay" press, reused for every retry of that press).
//   · The money figures are DECIMAL STRINGS ("14999.00"), not numbers. Pass
//     them to formatMoney() and never to arithmetic — a float round-trip is
//     exactly the drift the backend's integer-paise math exists to avoid.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

function qs(params) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value
        .filter((item) => item !== undefined && item !== null && item !== "")
        .forEach((item) => search.append(key, item));
      return;
    }
    search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

const seg = (value) => encodeURIComponent(String(value ?? ""));
const post = (path, body, options = {}) =>
  request(path, { method: "POST", body: JSON.stringify(body ?? {}), ...options });

const B = "/billing";

export const billingAPI = {
  // ───────────────────────────────────────────────────────────────────────────
  //  CATALOGUE
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #225 GET /billing/plans — the purchasable tiers.
   * Open to every authenticated role, guests included.
   * @returns `{ plans: [{ code, name, description, amount, currency,
   *   billing_cycle, limits: { max_employees, max_managers, max_hrs },
   *   feature_keys, grace_period_days, is_current }] }`
   *   — a `limits` value of `null` means unlimited, not zero.
   */
  getPlans() {
    return request(`${B}/plans`);
  },

  /**
   * GET /plans — the same catalogue, PUBLIC (no token).
   *
   * `#225` above sits behind `authenticate`, which the marketing pricing page
   * cannot satisfy: a visitor who has not signed up has nothing to send. This
   * route exists so the public site can advertise the real prices instead of a
   * hardcoded copy that silently rots (see usePlanCatalog).
   *
   * Same row shape as `#225` minus `is_current`, which is meaningless without a
   * tenant — so a signed-in caller still prefers `#225`.
   */
  getPublicPlans() {
    return request("/plans");
  },

  // ───────────────────────────────────────────────────────────────────────────
  //  SUBSCRIPTION STATE
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #226 GET /billing/subscription — the billing dashboard in one read.
   * Falls back to the most recent historical row when nothing is live, so
   * `subscription` is only null for an organisation that never had one.
   * @returns `{ subscription, usage: { employees, managers, hrs }, last_payment }`
   *   `usage.*` is `{ used, limit }`; `subscription.plan` comes from the frozen
   *   snapshot, never the live plan table, so an edited plan can't rewrite what
   *   this organisation bought.
   */
  getSubscription() {
    return request(`${B}/subscription`);
  },

  /** #227 GET /billing/subscription/history — every subscription this org has had. */
  getSubscriptionHistory(params) {
    return request(`${B}/subscription/history${qs(params)}`);
  },

  /** #228 GET /billing/subscription/events — the append-only billing audit trail. */
  getSubscriptionEvents(params) {
    return request(`${B}/subscription/events${qs(params)}`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  //  PAYMENTS & INVOICES
  // ───────────────────────────────────────────────────────────────────────────
  /** #229 GET /billing/payments — transaction history (`status`, `from`, `to`, `limit`, `offset`). */
  getPayments(params) {
    return request(`${B}/payments${qs(params)}`);
  },

  /**
   * #230 GET /billing/payments/:transactionId — one payment with its refunds,
   * subscription and lifecycle events. A transaction belonging to another
   * organisation answers 404, never 403, so a wrong id reads as "not found".
   */
  getPayment(transactionId) {
    return request(`${B}/payments/${seg(transactionId)}`);
  },

  /**
   * #231 GET /billing/payments/:transactionId/invoice — the frozen GST invoice.
   * Only settled payments have one: anything else answers 409
   * INVOICE_NOT_AVAILABLE, which is a state, not a failure to load.
   */
  getInvoice(transactionId) {
    return request(`${B}/payments/${seg(transactionId)}/invoice`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  //  CHECKOUT
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #238 GET /billing/subscription/preview-change — the quote, before charging.
   * Pure: it writes nothing and mints no gateway order. Call this first, every
   * time (the playbook's rule 1): `blocked_reason` tells the UI what #232 would
   * refuse, so a seat violation or an early renewal is explained on the page
   * instead of arriving as a gateway error.
   * @returns `{ intent, requires_payment, amount_due, currency, proration,
   *   new_period_start, new_period_end, seat_check, blocked_reason }`
   */
  previewChange(planCode) {
    return request(`${B}/subscription/preview-change${qs({ plan_code: planCode })}`);
  },

  /**
   * #232 POST /billing/subscription/checkout — mint the gateway order.
   *
   * `idempotencyKey` is REQUIRED and must be the same UUID for every retry of
   * one user action; a new key on a retry opens a second order. The body
   * carries `plan_code` alone — see this file's header for why.
   *
   * @returns `{ transaction_id, intent, requires_payment, amount, currency,
   *   order: { id, amount, currency, receipt }, razorpay_key_id, quote }`
   *   `razorpay_key_id` is the key to open the modal with: prefer it over our
   *   bundled VITE_RAZORPAY_KEY_ID, because the server knows which environment
   *   the order was minted in.
   */
  checkout(planCode, idempotencyKey) {
    return post(`${B}/subscription/checkout`, { plan_code: planCode }, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  /**
   * #233 POST /billing/subscription/checkout/verify — the modal's callback.
   *
   * A failure here does NOT mean the money is lost: the gateway webhook and the
   * reconciler cron settle the same transaction independently, so the UI polls
   * #226 rather than showing an error (playbook rule 4).
   * @returns `{ already_settled, transaction_id, subscription_id, status,
   *   invoice_number, intent }`
   */
  verifyCheckout({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    return post(`${B}/subscription/checkout/verify`, {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
  },

  /**
   * #234 POST /billing/subscription/checkout/cancel — void the open order.
   *
   * The server re-checks the gateway first: if the payment actually went
   * through in another tab it settles it and answers 409
   * PAYMENT_ALREADY_CAPTURED, which is good news and must be shown as such.
   */
  cancelCheckout() {
    return post(`${B}/subscription/checkout/cancel`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  //  CANCELLATION & SCHEDULED CHANGE
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #235 POST /billing/subscription/cancel.
   * `effective: "period_end"` keeps access to the end of the paid period and is
   * reversible (#236). `effective: "immediate"` ends access now, needs
   * `confirm: true`, and cannot be undone — no refund is issued automatically.
   */
  cancelSubscription({ effective = "period_end", reason, confirm } = {}) {
    return post(`${B}/subscription/cancel`, {
      effective,
      ...(reason ? { reason } : {}),
      ...(effective === "immediate" ? { confirm: Boolean(confirm) } : {}),
    });
  },

  /** #236 POST /billing/subscription/cancel/undo — put a period-end cancellation back. */
  undoCancellation() {
    return post(`${B}/subscription/cancel/undo`);
  },

  /**
   * #237 POST /billing/subscription/schedule-change — queue a downgrade for the
   * period boundary, or pass `null` to clear one. A cheaper plan can only be
   * scheduled, never bought (#232 refuses it with USE_SCHEDULED_DOWNGRADE),
   * because the current period is already paid for.
   */
  scheduleChange(planCode) {
    return post(`${B}/subscription/schedule-change`, { plan_code: planCode ?? null });
  },
};

export default billingAPI;
