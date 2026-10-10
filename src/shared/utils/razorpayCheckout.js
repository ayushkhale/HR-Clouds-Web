// ─────────────────────────────────────────────────────────────────────────────
// razorpayCheckout.js — Loading the gateway's script and opening its modal.
//
// Two screens take money: organisation registration (#2/#3, before there is a
// workspace) and the HR billing page (#232/#233, inside one). They had to agree
// on the script tag, the key, the theme and what "the user closed the modal"
// means, so the handshake lives here once rather than twice.
//
// Things learned the hard way, all of them encoded below:
//   · The script is injected once and keyed by id. Two screens asking for it at
//     the same time must not both append a tag, so a load already in flight is
//     shared rather than restarted.
//   · A FAILED load resolves false, it does not throw: a blocked or offline
//     script is a message on the page ("we couldn't load the payment window"),
//     never an unhandled rejection.
//   · Use the `key` the checkout response gave us (#232 `razorpay_key_id`) in
//     preference to our bundled VITE_RAZORPAY_KEY_ID. The server knows which
//     environment minted the order; a test order opened with a live key fails
//     inside the modal, where we can't explain it.
//   · `ondismiss` and `handler` are mutually exclusive in practice but NOT
//     guaranteed to be: the modal can dismiss after a successful handler on a
//     slow network. `openRazorpayCheckout` therefore settles once and ignores
//     whichever callback arrives second, so a paid order is never reported as
//     abandoned.
//   · The modal is the user's last chance to abandon without paying, so
//     dismissal is an ordinary outcome, not an error: it resolves
//     `{ dismissed: true }` rather than rejecting.
// ─────────────────────────────────────────────────────────────────────────────

import { ENV } from "../../config/env";

const SCRIPT_ID = "razorpay-script";
const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Our brand purple, so the modal doesn't arrive in Razorpay's default blue.
const THEME_COLOR = "#7c3aed";

// A load already running — shared so two callers can't inject two tags.
let loading = null;

/**
 * Inject the gateway script if it isn't there. Resolves true when
 * `window.Razorpay` is usable, false when the script couldn't load (offline,
 * blocked, or the CDN is down). Never throws.
 */
export function loadRazorpayScript() {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(true);
  if (loading) return loading;

  loading = new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      // A tag is there but the global isn't ready yet — wait for this one
      // rather than adding a second.
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      // Already finished loading before we attached: the global tells us.
      if (window.Razorpay) resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  }).then((ok) => {
    // Let a failed load be retried later (the user may just have been offline).
    if (!ok) loading = null;
    return ok;
  });

  return loading;
}

/** Warm the script up ahead of the click, so the modal opens without a wait. */
export const prefetchRazorpay = () => { loadRazorpayScript(); };

/**
 * Open the checkout modal for an order and wait for the user to finish with it.
 *
 * @param {object} args
 * @param {{ id: string, amount: number, currency?: string }} args.order — #232 `order`
 * @param {string} [args.keyId] — #232 `razorpay_key_id`; falls back to our build's key
 * @param {string} [args.description] — the line under "HR Clouds" in the modal
 * @param {{ name?: string, email?: string, contact?: string }} [args.prefill]
 * @param {object} [args.notes]
 * @returns one of:
 *   `{ ok: true, payment: { razorpay_order_id, razorpay_payment_id, razorpay_signature } }`
 *   `{ dismissed: true }`  — the user closed the modal; nothing was charged
 *   `{ failed: true, reason }` — we never got as far as showing it
 *
 * The caller verifies the payment with its own endpoint (#233 for billing, #3
 * for registration): this helper deliberately knows nothing about settlement,
 * so neither screen inherits the other's verify call.
 */
export async function openRazorpayCheckout({
  order,
  keyId,
  description = "HR Clouds subscription",
  prefill = {},
  notes,
} = {}) {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    return { failed: true, reason: "We couldn’t load the payment window. Check your connection and try again." };
  }

  const key = keyId || ENV.RAZORPAY_KEY_ID;
  if (!key) {
    return { failed: true, reason: "Payments aren’t set up on this site yet. Contact support." };
  }
  if (!order?.id) {
    return { failed: true, reason: "That payment couldn’t be started. Try again." };
  }

  return new Promise((resolve) => {
    // The modal can fire `ondismiss` after a successful `handler` on a slow
    // network. Settle once, or a paid order gets reported as abandoned.
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const options = {
      key,
      amount: order.amount,
      currency: order.currency || "INR",
      name: "HR Clouds",
      description,
      order_id: order.id,
      ...(notes ? { notes } : {}),
      prefill: {
        ...(prefill.name ? { name: prefill.name } : {}),
        ...(prefill.email ? { email: prefill.email } : {}),
        ...(prefill.contact ? { contact: prefill.contact } : {}),
      },
      theme: { color: THEME_COLOR },
      handler: (response) => {
        settle({
          ok: true,
          payment: {
            razorpay_order_id: response?.razorpay_order_id,
            razorpay_payment_id: response?.razorpay_payment_id,
            razorpay_signature: response?.razorpay_signature,
          },
        });
      },
      modal: {
        ondismiss: () => settle({ dismissed: true }),
      },
    };

    try {
      new window.Razorpay(options).open();
    } catch {
      settle({ failed: true, reason: "The payment window wouldn’t open. Reload the page and try again." });
    }
  });
}

/**
 * A fresh idempotency key for one "Confirm and pay" press.
 *
 * #232 requires the header, and a RETRY of the same press must reuse the same
 * key — a new one mints a second gateway order. So generate it once when the
 * user commits, hold it, and only call this again for a genuinely new attempt.
 * `crypto.randomUUID` is absent on older Safari and on http:// origins, hence
 * the fallback.
 */
export function newIdempotencyKey() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `${rand()}-${rand()}-${rand()}-${rand()}`;
}
