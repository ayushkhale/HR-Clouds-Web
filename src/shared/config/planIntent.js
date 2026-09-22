// ─────────────────────────────────────────────────────────────────────────────
// planIntent.js — remembers which plan a visitor clicked on the way to signup.
//
// Picking a plan and creating an organization are separated by the whole signup
// detour: a visitor must register an account and verify an OTP before
// /register-organization will even load. Without somewhere to park the choice,
// "Choose Growth" on the pricing page lands on a plan picker that has
// forgotten Growth entirely and asks again.
//
// sessionStorage, not localStorage: the intent belongs to this visit. Someone
// returning next week should not silently get last week's plan pre-selected.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "hrclouds_plan_intent";

/** Park the tier and billing cycle a visitor chose. Failure is not fatal. */
export function rememberPlanIntent(tier, billing) {
  if (!tier) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tier, billing }));
  } catch {
    /* private mode or storage disabled — the picker just asks again */
  }
}

/** Read the parked choice, or null. Shape is never trusted blindly. */
export function readPlanIntent() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.tier !== "string") return null;
    return {
      tier: parsed.tier,
      billing: parsed.billing === "yearly" ? "yearly" : "monthly",
    };
  } catch {
    return null;
  }
}

/** Forget it once it has been used, so a later visit starts clean. */
export function clearPlanIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up */
  }
}
