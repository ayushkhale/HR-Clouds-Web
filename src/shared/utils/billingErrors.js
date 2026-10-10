// ─────────────────────────────────────────────────────────────────────────────
// billingErrors.js — The billing module's error codes in plain words.
// Mirrors payrollErrors.js / organizationErrors.js: `request()` throws with
// `err.data` holding the body, whose code arrives as `errorCode`.
//
// Source: the error matrix in public/ref docs/md_money/phase1_api_analysis.md.
//
// Money messages carry a duty the rest of the product doesn't: the reader has
// just tried to pay, or has already paid, and a wrong word here turns a settled
// payment into a support ticket. So:
//
//   · Three of these codes are NOT failures and must never read like one.
//     PAYMENT_ALREADY_CAPTURED means the payment went through (the server
//     settled it while refusing to void it). CHECKOUT_ALREADY_PENDING means an
//     order is still open and can be resumed. INVOICE_NOT_AVAILABLE means the
//     payment hasn't settled yet, not that the invoice is broken.
//   · A verification failure never tells the reader their money is gone,
//     because it usually isn't — the gateway webhook settles the same
//     transaction minutes later. The screen polls; the message says we're
//     confirming, not that it failed.
//   · Nothing quotes a figure, a plan price or a date that the server owns.
//     SEAT_LIMIT_EXCEEDED and RENEWAL_TOO_EARLY both carry their specifics in
//     `details`, which the screen renders itself — the helpers below pull them
//     out rather than baking numbers into a sentence.
//
// VALIDATION_ERROR deliberately falls through to the caller's fallback: the
// body holds a Joi sentence, which §6 says never reaches a screen. The only
// field we ever send is `plan_code`, picked from a server-supplied list, so a
// validation error here means something we didn't anticipate.
// ─────────────────────────────────────────────────────────────────────────────

const BILLING_ERROR_MESSAGES = {
  // ── Reads ────────────────────────────────────────────────────────────────
  PLAN_NOT_FOUND: "That plan is no longer on offer. We’ve reloaded the current plans — pick one of those.",
  TX_NOT_FOUND: "We couldn’t find that payment. It may belong to a different organisation.",
  UNAUTHORIZED_TX: "That payment isn’t yours to open.",
  INVOICE_NOT_AVAILABLE: "The invoice is ready once the payment settles. This one hasn’t settled yet.",

  // ── Entitlement ──────────────────────────────────────────────────────────
  NO_ACTIVE_SUBSCRIPTION: "Your subscription has ended. Choose a plan to switch the workspace back on.",
  FEATURE_NOT_AVAILABLE: "Your current plan doesn’t include this. Moving to a higher plan switches it on.",

  // ── Checkout ─────────────────────────────────────────────────────────────
  // Not a failure: an order is already open and can be paid or dropped.
  CHECKOUT_ALREADY_PENDING: "You already have a payment waiting. Finish that one, or drop it and start again.",
  SEAT_LIMIT_EXCEEDED: "You have more people than that plan allows. Pick a bigger plan, or remove people first.",
  RENEWAL_TOO_EARLY: "It’s too soon to renew. You can renew in the last fortnight before your plan ends.",
  USE_SCHEDULED_DOWNGRADE: "A cheaper plan can’t be bought — you’ve already paid for this period. Schedule it to start when this period ends instead.",
  PLAN_CHANGE_NOT_SUPPORTED: "We can’t move you between those two plans. Contact support and we’ll do it for you.",
  NOT_A_DOWNGRADE: "That plan isn’t cheaper than your current one, so it’s a purchase rather than a scheduled change.",
  BILLING_RATE_EXCEEDED: "That’s a lot of attempts in one hour. Wait a few minutes and try again.",

  // ── Settlement ───────────────────────────────────────────────────────────
  // The money is usually fine here — the webhook settles the same transaction.
  // Never say "payment failed" for a verification problem.
  PAYMENT_VERIFICATION_FAILED: "We couldn’t confirm that payment with the bank. Nothing more has been charged — open Payments & Invoices in a few minutes, and contact support if it isn’t there.",
  PAYMENT_NOT_CAPTURED: "The bank hasn’t completed that payment. If money has left your account, it will appear here within a few minutes.",
  AMOUNT_MISMATCH: "The amount the bank took doesn’t match the order, so we’ve held it rather than switching your plan. Contact support — don’t pay again.",
  PAYMENT_ORDER_MISMATCH: "That payment doesn’t belong to this order, so we’ve held it. Contact support — don’t pay again.",
  // Good news: they paid, and we activated it.
  PAYMENT_ALREADY_CAPTURED: "That payment went through — your plan is active. We’ve refreshed the page to show it.",
  NO_PENDING_CHECKOUT: "There’s no payment waiting any more. It has either gone through or been dropped.",

  // ── Cancellation ─────────────────────────────────────────────────────────
  CONFIRMATION_REQUIRED: "Ending access today needs the confirmation box ticked.",
  CANNOT_CANCEL_FREE_PLAN: "A free plan has nothing to cancel — there’s no payment to stop.",
  CANCELLATION_NOT_REVERSIBLE: "Access was already ended, and that can’t be undone. Choose a plan to start again.",
  ALREADY_CANCELLED: "This subscription is already set to end. The date is shown on the page.",
  NO_SCHEDULED_CANCELLATION: "Nothing is scheduled to end, so there’s nothing to put back.",

  // ── Gateway ──────────────────────────────────────────────────────────────
  GATEWAY_REJECTED: "The payment provider turned the request down. Try again in a moment.",
  GATEWAY_UNAVAILABLE: "We can’t reach the payment provider right now. Nothing has been charged — try again shortly.",
  UNSUPPORTED_CURRENCY: "We can only take payments in rupees.",
};

/** The code a billing error arrived with, or "". */
export const billingErrorCode = (error) =>
  error?.data?.errorCode || error?.data?.code || "";

/**
 * A plain message for a billing error. Falls back to the caller's own sentence,
 * because a raw server string is the one thing that must not reach the screen.
 */
export function billingErrorMessage(error, fallback = "Something went wrong. Try again.") {
  const mapped = BILLING_ERROR_MESSAGES[billingErrorCode(error)];
  if (mapped) return mapped;
  if (error?.isTimeout) return "That took too long. Check Payments & Invoices before trying again — the payment may have gone through.";
  return fallback;
}

/* ─── The codes a screen has to act on, not just print ──────────────────────
   Each of these changes what the UI DOES next, so they get a predicate rather
   than leaving every caller to compare strings. */

/** An order is already open: offer "Pay now" (with `details.order_id`) or "Start again". */
export const isCheckoutPending = (error) => billingErrorCode(error) === "CHECKOUT_ALREADY_PENDING";

/** They paid after all. Refresh and celebrate — never show this as an error. */
export const isAlreadyPaid = (error) => billingErrorCode(error) === "PAYMENT_ALREADY_CAPTURED";

/** No invoice yet because the payment hasn't settled: a state, not a load failure. */
export const isInvoicePending = (error) => billingErrorCode(error) === "INVOICE_NOT_AVAILABLE";

/** Verification didn't land, so poll #226 instead of showing a failure. */
export const isSettlementPending = (error) =>
  ["PAYMENT_VERIFICATION_FAILED", "PAYMENT_NOT_CAPTURED", "GATEWAY_UNAVAILABLE"].includes(billingErrorCode(error))
  || error?.isTimeout
  || error?.status >= 500;

/** Too many attempts — disable the button for `retryAfterSeconds`. */
export const isRateLimited = (error) => billingErrorCode(error) === "BILLING_RATE_EXCEEDED" || error?.status === 429;

/**
 * Seconds to wait after a 429. The body is preferred over the header, because a
 * proxy can strip a header but not a payload (see client.js).
 */
export function retryAfterSeconds(error) {
  const body = Number(error?.data?.details?.retry_after_seconds);
  if (Number.isFinite(body) && body > 0) return body;
  return Number.isFinite(error?.retryAfter) && error.retryAfter > 0 ? error.retryAfter : null;
}

/**
 * The open order behind a CHECKOUT_ALREADY_PENDING, so the screen can offer to
 * resume it: `{ transaction_id, order_id, plan_code, amount, created_at }`.
 */
export const pendingCheckoutDetail = (error) =>
  isCheckoutPending(error) ? error?.data?.details || null : null;

/**
 * Who is over the limit on a SEAT_LIMIT_EXCEEDED:
 * `[{ role, used, limit }]`. Rendered as rows, never pasted into a sentence.
 */
export function seatViolations(error) {
  const list = error?.data?.details?.violations;
  return Array.isArray(list) ? list : [];
}

/** The ISO date a renewal becomes possible, from a RENEWAL_TOO_EARLY. */
export const earliestRenewalAt = (error) => error?.data?.details?.earliest_at || null;

export default billingErrorMessage;
