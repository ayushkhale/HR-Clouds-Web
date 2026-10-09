// ─────────────────────────────────────────────────────────────────────────────
// usePlanCatalog.js — the plan catalogue every picker reads.
//
// One rule decides everything here: **a price the buyer is about to commit to
// must come from the server.** The client never sends an amount (see
// billing.api.js), so a stale local figure can't produce a wrong charge — but
// it can produce a buyer who agreed to one number and meets another in the
// payment window, which is the complaint this whole module exists to prevent.
//
// #225 needs a bearer token and the marketing pricing page is public, so there
// is no single answer, and the hook gives each caller the best one available:
//
//   token present  → the live catalogue, and `source: "live"`
//   no token       → the hardcoded fallback in plans.js, `source: "fallback"`
//   fetch failed   → the fallback, `source: "fallback"`, with `error` set
//
// `source` is not decoration. Registration uses it to refuse to take money on
// figures it couldn't verify: a visitor who is signed in (every registering
// user is — #2 requires a guest token) and whose catalogue read failed is told
// to retry rather than shown prices that might be wrong. The public marketing
// page ignores it, because advertising is not billing.
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
 * This is the whole reason the drift was dangerous: #225 needs a token, so the
 * public pricing page can only ever show the local copy, and NOBODY could tell
 * it had gone stale — the figures only meet on a signed-in screen, where the
 * live ones win silently. Now the first signed-in developer to open any page
 * with plans on it gets told exactly which number moved.
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
      "[plans] The hardcoded fallback in shared/config/plans.js disagrees with the live catalogue (#225).\n"
      + "The public pricing page shows the fallback — logged-out visitors are being advertised these figures.\n"
      + drifted.map((line) => `  • ${line}`).join("\n")
      + "\nFix plans.js, or make #225 public so the marketing page can read it too.",
    );
  }
}

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
    // Only a signed-in visitor has a read to wait for; everyone else is
    // already looking at their final answer.
    loading: enabled && Boolean(tokenHelper.get()),
    error: null,
  }));

  const load = useCallback(async ({ signal } = {}) => {
    if (!enabled || !tokenHelper.get()) {
      setState({ plans: PLANS, source: "fallback", loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await billingAPI.getPlans();
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

  return { ...state, reload: load };
}
