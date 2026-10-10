// ─────────────────────────────────────────────────────────────────────────────
// useBillingCheckout.js — The one place money is taken inside the workspace.
//
// Contract: public/ref docs/md_money/phase1_api_analysis.md, "Frontend
// Integration Playbook". Its four rules are all encoded here, because each one
// exists to stop a real way of losing or double-taking a customer's money:
//
//  1. ALWAYS preview (#238) before charging (#232). The two run the same quote
//     function server side, so a preview's `blocked_reason` is exactly the
//     error the checkout would have raised — a seat violation or an early
//     renewal is then explained on the page instead of inside the gateway.
//
//  2. ONE idempotency key per "Confirm and pay" PRESS, reused by every retry of
//     that press. A fresh key on a retry mints a second gateway order, and the
//     customer can then pay twice. The key therefore lives in a ref tied to the
//     plan being bought and is only cleared when the attempt genuinely ends.
//
//  3. A 409 CHECKOUT_ALREADY_PENDING is not a dead end. An order is open (a
//     second tab, a reload mid-payment), the response carries it, and the only
//     safe moves are to PAY that order or to drop it with #234 — never to mint
//     another. Hence `pending` in the returned state and the two actions.
//
//  4. A failed #233 verify does NOT mean the payment failed. The gateway
//     webhook (#239) and the reconciliation cron settle the very same
//     transaction within minutes, so this hook polls #226 and tells the person
//     we are confirming. Showing a red "payment failed" here would send a
//     customer who has already paid to support, or worse, make them pay again.
//
// One more trap, from #234: voiding an order re-checks the gateway first, and
// if the payment actually went through it SETTLES it and answers 409
// PAYMENT_ALREADY_CAPTURED. That is good news — it is handled as success.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { billingAPI } from "../../../shared/api";
import {
  billingErrorMessage, isAlreadyPaid, isCheckoutPending, isRateLimited,
  isSettlementPending, pendingCheckoutDetail, retryAfterSeconds,
} from "../../../shared/utils/billingErrors";
import { newIdempotencyKey, openRazorpayCheckout, prefetchRazorpay } from "../../../shared/utils/razorpayCheckout";

// Settlement poll after a verify that didn't land. Short and bounded: the
// webhook usually wins within a few seconds, and 30s is long enough to feel
// like confirmation rather than a hang.
const POLL_EVERY_MS = 3000;
const POLL_ATTEMPTS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} args
 * @param {() => void} args.onSettled   refresh the page's subscription read
 * @param {(msg: string, type?: string) => void} args.showToast
 * @returns `{ stage, quote, planCode, error, pending, waitSeconds,
 *   preview, confirm, resume, drop, reset }`
 *
 * `stage` is one of:
 *   idle       — nothing in flight
 *   previewing — asking #238 what this plan change would cost
 *   quoted     — a quote is on screen, waiting for the person to commit
 *   paying     — the gateway modal is open (or the order is being minted)
 *   verifying  — #233 is running
 *   confirming — verify didn't land; polling #226 for the webhook's result
 *   done       — settled
 */
export default function useBillingCheckout({ onSettled, showToast } = {}) {
  const [stage, setStage] = useState("idle");
  const [planCode, setPlanCode] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  // An order already open at the gateway: `{ transaction_id, order_id,
  // plan_code, amount, created_at }` from the 409's `details`.
  const [pending, setPending] = useState(null);
  const [waitSeconds, setWaitSeconds] = useState(null);

  // Rule 2: one key per press, reused across retries of that press.
  const keyRef = useRef(null);
  // Don't set state after the dialog has gone — a verify can outlive it.
  //
  // The mount MUST re-arm this, not just the unmount disarm it. StrictMode
  // mounts, runs the cleanup, and mounts again; an effect that only ever set
  // the flag false left it false for the rest of the component's life, so
  // `set()` became a permanent no-op and NOTHING the checkout learned —
  // the quote, an error, a stage change — ever reached the screen. The
  // symptom was a plan dialog that opened with a header and a Cancel button
  // and no body, even though #238 had answered 200.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => { liveRef.current = false; };
  }, []);

  const set = useCallback((fn) => { if (liveRef.current) fn(); }, []);

  // Warm the gateway script while the person reads the quote, so the modal
  // opens on the click rather than after a download.
  useEffect(() => { prefetchRazorpay(); }, []);

  const reset = useCallback(() => {
    keyRef.current = null;
    set(() => {
      setStage("idle");
      setQuote(null);
      setPlanCode(null);
      setError(null);
      setPending(null);
      setWaitSeconds(null);
    });
  }, [set]);

  /** Rule 1 — the quote, before anything is charged. */
  const preview = useCallback(async (code) => {
    keyRef.current = null;
    set(() => {
      setPlanCode(code);
      setStage("previewing");
      setError(null);
      setQuote(null);
      setPending(null);
    });
    try {
      const res = await billingAPI.previewChange(code);
      set(() => { setQuote(res?.data || null); setStage("quoted"); });
      return res?.data || null;
    } catch (err) {
      set(() => {
        setError(billingErrorMessage(err, "We couldn’t work out what this plan would cost. Try again."));
        setStage("quoted");
      });
      return null;
    }
  }, [set]);

  /**
   * Poll #226 until the webhook or the reconciler has settled the payment.
   * Deliberately NOT gated on `document.visibilityState`, unlike the product's
   * other pollers: this runs for at most 30 seconds, immediately after someone
   * paid, and a person who switches tabs while waiting for a payment to confirm
   * must come back to the answer rather than to a frozen spinner.
   */
  const awaitSettlement = useCallback(async () => {
    set(() => setStage("confirming"));
    for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
      await sleep(POLL_EVERY_MS);
      if (!liveRef.current) return false;
      try {
        const res = await billingAPI.getSubscription();
        const sub = res?.data?.subscription;
        const paid = res?.data?.last_payment?.status === "success";
        if (sub?.is_entitled && paid) {
          keyRef.current = null;
          set(() => setStage("done"));
          onSettled?.();
          showToast?.("Payment confirmed — your plan is active.");
          return true;
        }
      } catch { /* keep polling; a read failure here means nothing either way */ }
    }
    // Still unconfirmed. The money is not lost — say so, and leave the page to
    // show whatever the next read finds.
    set(() => setStage("quoted"));
    onSettled?.();
    showToast?.("Payment received. We’re still confirming it with the bank — this page will show your plan as soon as it lands.", "info");
    return false;
  }, [onSettled, set, showToast]);

  /** Verify what the modal handed back, then fall back to the poll (rule 4). */
  const verify = useCallback(async (payment) => {
    set(() => setStage("verifying"));
    try {
      const res = await billingAPI.verifyCheckout(payment);
      keyRef.current = null;
      set(() => setStage("done"));
      onSettled?.();
      const invoice = res?.data?.invoice_number;
      showToast?.(invoice ? `Payment received. Invoice ${invoice} is ready.` : "Payment received — your plan is active.");
      return true;
    } catch (err) {
      if (isSettlementPending(err)) return awaitSettlement();
      // A real refusal (amount mismatch, held payment). Say it plainly and
      // never invite a second payment.
      set(() => {
        setError(billingErrorMessage(err, "We couldn’t confirm that payment. Check Payments & Invoices before trying again."));
        setStage("quoted");
      });
      return false;
    }
  }, [awaitSettlement, onSettled, set, showToast]);

  /** Open the gateway for an order and see the payment through. */
  const payOrder = useCallback(async ({ order, keyId, description }) => {
    set(() => { setStage("paying"); setError(null); });
    const result = await openRazorpayCheckout({ order, keyId, description });

    if (result?.ok) return verify(result.payment);

    if (result?.dismissed) {
      // Nothing charged. The order stays open at the gateway, so offer to
      // resume it rather than minting a second one on the next click.
      set(() => {
        setPending({ order_id: order.id, amount: order.amount != null ? String(order.amount / 100) : null, plan_code: planCode });
        setStage("quoted");
      });
      showToast?.("Payment window closed — nothing was charged. You can pick it up again when you’re ready.", "info");
      return false;
    }

    set(() => { setError(result?.reason || "The payment window wouldn’t open. Try again."); setStage("quoted"); });
    return false;
  }, [planCode, set, showToast, verify]);

  /** Rule 2/3 — mint the order and pay it. Safe to call again after a failure. */
  const confirm = useCallback(async (code = planCode) => {
    if (!code) return false;
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    set(() => { setStage("paying"); setError(null); setWaitSeconds(null); });

    try {
      const res = await billingAPI.checkout(code, keyRef.current);
      const data = res?.data || {};
      // A zero-amount change (an upgrade fully covered by credit) settles on
      // the server with no gateway step at all.
      if (!data.requires_payment) {
        keyRef.current = null;
        set(() => setStage("done"));
        onSettled?.();
        showToast?.("Your plan has been updated — there was nothing to pay.");
        return true;
      }
      return payOrder({
        order: data.order,
        keyId: data.razorpay_key_id,
        description: `HR Clouds · ${code}`,
      });
    } catch (err) {
      // Rule 3: an order is already open. Hand it to the UI; never retry.
      if (isCheckoutPending(err)) {
        set(() => {
          setPending(pendingCheckoutDetail(err));
          setError(billingErrorMessage(err));
          setStage("quoted");
        });
        return false;
      }
      if (isRateLimited(err)) {
        set(() => {
          setWaitSeconds(retryAfterSeconds(err));
          setError(billingErrorMessage(err));
          setStage("quoted");
        });
        return false;
      }
      set(() => { setError(billingErrorMessage(err, "We couldn’t start that payment. Try again.")); setStage("quoted"); });
      return false;
    }
  }, [onSettled, payOrder, planCode, set, showToast]);

  /**
   * Pay the order that is already open. We hold its id but not a fresh gateway
   * amount, so re-opening the modal is enough: Razorpay reads the amount from
   * the order itself.
   */
  const resume = useCallback(async () => {
    if (!pending?.order_id) return false;
    return payOrder({
      order: { id: pending.order_id },
      description: "HR Clouds subscription",
    });
  }, [payOrder, pending]);

  /** Drop the open order (#234) so a different plan can be bought. */
  const drop = useCallback(async () => {
    set(() => { setStage("paying"); setError(null); });
    try {
      await billingAPI.cancelCheckout();
      keyRef.current = null;
      set(() => { setPending(null); setError(null); setStage("quoted"); });
      showToast?.("That payment has been dropped. You can choose a plan again.");
      return true;
    } catch (err) {
      // It was actually paid, and the server settled it on the way past.
      if (isAlreadyPaid(err)) {
        keyRef.current = null;
        set(() => { setPending(null); setError(null); setStage("done"); });
        onSettled?.();
        showToast?.(billingErrorMessage(err));
        return true;
      }
      set(() => { setError(billingErrorMessage(err, "We couldn’t drop that payment. Reload the page and try again.")); setStage("quoted"); });
      return false;
    }
  }, [onSettled, set, showToast]);

  return {
    stage, quote, planCode, error, pending, waitSeconds,
    busy: ["previewing", "paying", "verifying", "confirming"].includes(stage),
    preview, confirm, resume, drop, reset,
  };
}
