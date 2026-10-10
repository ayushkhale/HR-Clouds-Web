// ─────────────────────────────────────────────────────────────────────────────
// usePlanCatalog.js — the plan catalogue every picker reads.
//
// One rule decides everything here: **a price the buyer is about to commit to
// must come from the server.** The client never sends an amount (see
// billing.api.js), so a stale local figure can't produce a wrong charge — but
// it can produce a buyer who agreed to one number and meets another in the
// payment window, which is the complaint this whole module exists to prevent.
//
// Two endpoints serve the same catalogue, and the hook takes the best one the
// caller can reach:
//
//   token present  → #225 GET /billing/plans — the only one that marks the
//                    caller's current plan — falling back to the public route
//   no token       → GET /plans, the public catalogue
//   both failed    → the hardcoded copy in plans.js, `source: "fallback"`
//
// The public route is why the marketing page no longer has to advertise a
// hardcoded price. Before it existed the local copy was the ONLY thing a
// logged-out visitor could be shown, and it rotted invisibly.
//
// `source` is not decoration, and it drives two things:
//   · Registration refuses to take money while it reads "fallback" — a figure
//     we could not verify must not become a different number in the payment
//     window.
//   · The public cards mark a fallback price with an asterisk and say prices
//     may vary (user decision, 2026-10-09). Live prices carry no asterisk, so
//     the mark means something: it appears only when we are guessing.
//
// An EMPTY live catalogue is not the same as a failed read (§7). The server
// answering `plans: []` means nothing is on sale, which is a real state and
// must not silently fall back to showing three plans nobody can buy.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { billingAPI, tokenHelper } from "../api";
import { PLANS, plansFromCatalog, variantFor } from "../config/plans";

/**
 * Shout, in development only, when the hardcoded fallback disagrees with what
 * the server actually sells.
 *
 * The fallback is now a last resort rather than the public page's only option,
 * but it is still what a visitor sees when both endpoints are down — the worst
 * possible moment to be advertising a price from 2026. Nothing else compares
 * the two copies, so without this the local one rots unnoticed; here, the first
 * developer to open any page with plans on it is told which number moved.
 *
 * Dev-only and console-only on purpose: a visitor must never be shown our
 * bookkeeping, and the fallback is still the right thing to render.
 */
function warnOnDrift(live) {
  // Compared by PLAN CODE, not by tier and cycle. A tier sold on one cycle has
  // both its slots pointing at the same variant (see plansFromCatalog), so a
  // cycle-by-cycle diff would report a "code change" every time the two
  // catalogues disagree about which cycles exist. Codes are what the server
  // actually sells, and what #2 and #232 are given, so they are the honest
  // unit of comparison.
  const byCode = (plans, seatsOf) => {
    const map = new Map();
    for (const plan of plans) {
      for (const cycle of ["monthly", "yearly"]) {
        const variant = variantFor(plan, cycle);
        if (!variant?.code || map.has(variant.code)) continue;
        map.set(variant.code, { tier: plan.tier, amount: variant.amount, seats: seatsOf(plan, variant) });
      }
    }
    return map;
  };

  // The fallback keeps its seat limits on the TIER; the live rows carry them
  // per variant. Read each from where it actually lives, or every comparison
  // reports "undefined seats".
  const fallback = byCode(PLANS, (plan) => plan.limits?.employees);
  const current = byCode(live, (plan, variant) => variant.limits?.employees ?? plan.limits?.employees);

  const drifted = [];
  for (const [code, was] of fallback) {
    const now = current.get(code);
    if (!now) { drifted.push(`"${code}" is in the fallback but not on sale`); continue; }
    if (was.amount !== now.amount) drifted.push(`"${code}" price: ₹${was.amount} → ₹${now.amount}`);
    if (was.seats !== now.seats) drifted.push(`"${code}" employee seats: ${was.seats} → ${now.seats}`);
  }
  for (const [code] of current) {
    if (!fallback.has(code)) drifted.push(`"${code}" is on sale but missing from the fallback`);
  }

  if (drifted.length) {
    console.warn(
      "[plans] The hardcoded fallback in shared/config/plans.js disagrees with the live catalogue.\n"
      + "It is rendered only when BOTH plan endpoints fail — but that is exactly when a visitor is\n"
      + "advertised these figures, so they still need to be right.\n"
      + drifted.map((line) => `  • ${line}`).join("\n")
      + "\nUpdate PLANS in shared/config/plans.js to match.",
    );
  }
}

/* ─── One read per page, not one per component ────────────────────────────
   The pricing page mounts this hook twice — once for the cards, once for the
   comparison table — and both want the same immutable catalogue. Without a
   shared promise that is two identical requests on every visit (four in dev,
   where StrictMode double-mounts). The in-flight promise is shared and the
   answer is kept for the rest of the session; `reload()` clears it, which is
   what the "Reload plans" button on registration needs to actually re-ask. */
let inFlight = null;
let cached = null;

const readCatalogue = () => {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  // A signed-in caller prefers #225 because it alone marks their current plan;
  // everyone else — and anyone whose #225 read fails — takes the public route.
  inFlight = (tokenHelper.get()
    ? billingAPI.getPlans().catch(() => billingAPI.getPublicPlans())
    : billingAPI.getPublicPlans())
    .then((res) => { cached = res; return res; })
    .finally(() => { inFlight = null; });
  return inFlight;
};

/** Forget the session's catalogue, so the next read really asks the server. */
export const forgetPlanCatalog = () => { cached = null; inFlight = null; };

/**
 * @param {{ enabled?: boolean }} [options]
 *   `enabled: false` skips the read entirely and serves the fallback — for a
 *   page that renders before we know whether anyone is signed in.
 * @returns `{ plans, source, loading, error, reload }`
 *   `source` is "live" | "fallback"; `plans` is always a usable array.
 */
export default function usePlanCatalog({ enabled = true } = {}) {
  const [state, setState] = useState(() => ({
    plans: PLANS,
    source: "fallback",
    // Everyone has a read to wait for now that the catalogue is public.
    loading: enabled,
    error: null,
  }));

  const load = useCallback(async ({ signal } = {}) => {
    if (!enabled) {
      setState({ plans: PLANS, source: "fallback", loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await readCatalogue();
      if (signal?.aborted) return;
      const rows = res?.data?.plans;
      const live = plansFromCatalog(rows);
      // `plans: []` is an answer, not a failure — keep it, and let the screen
      // say "nothing is on sale" rather than showing stale cards.
      if (Array.isArray(rows) && rows.length === 0) {
        setState({ plans: [], source: "live", loading: false, error: null });
        return;
      }
      if (live.length === 0) throw new Error("The plan list came back in a shape we don’t understand.");
      if (import.meta.env.DEV) warnOnDrift(live);
      setState({ plans: live, source: "live", loading: false, error: null });
    } catch (error) {
      if (signal?.aborted) return;
      // Never cache a failure: the next mount, or the Reload button, must be
      // free to ask again.
      forgetPlanCatalog();
      // Keep showing something rather than an empty page, but say plainly that
      // these are not the server's numbers.
      setState({ plans: PLANS, source: "fallback", loading: false, error });
    }
  }, [enabled]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  // The caller's Reload button must really re-ask, so it drops the cache first.
  const reload = useCallback((args) => { forgetPlanCatalog(); return load(args); }, [load]);

  return { ...state, reload };
}
