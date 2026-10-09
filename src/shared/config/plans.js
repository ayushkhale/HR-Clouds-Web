// ─────────────────────────────────────────────────────────────────────────────
// plans.js — the plan catalogue: its shape, its display rules, and the
// pre-login fallback copy of it.
//
// It used to be the single source of truth, because there was no endpoint to
// ask. There is now: #225 `GET /billing/plans` returns the live catalogue, and
// `usePlanCatalog()` (shared/hooks) is what screens call. This file is two
// things underneath that hook:
//
//   1. `plansFromCatalog()` — the normaliser that turns #225's FLAT rows into
//      the tiered shape the pickers render.
//   2. `PLANS` — a hardcoded fallback, used only where no token exists.
//
// WHY A FALLBACK AT ALL (don't delete it): #225 requires a bearer token, and
// the marketing pricing page is public. A logged-out visitor has nothing to
// ask with, so the public cards come from here. Everything behind a login —
// registration above all — reads the live catalogue.
//
// WHY THAT ARRANGEMENT IS SAFE: these numbers can drift from the server's and
// nobody would see it (that is what this file's own history is about — the
// landing page once advertised ₹49/month while the checkout charged ₹499).
// They can no longer cause a wrong charge, because the server derives every
// price itself and the LAST screen before money moves — the registration
// picker, and the HR billing page — is always live. A stale number here is a
// wrong advert, which is a content bug; it is not a wrong bill.
//
// So: if these figures look wrong, the fix is to correct them here AND ask why
// they drifted. Never "fix" a price by changing what the UI sends — the body
// of #2 and #232 carries a `plan_code` and nothing else, deliberately.
//
// `code` values are the literal `plan_code` strings that
// POST /organizations/register/initiate accepts — never rename them.
// ─────────────────────────────────────────────────────────────────────────────

import { humanize } from "../attendance/enums";

/* ─── Feature catalog ──────────────────────────────────────────────────────
   Keyed by the backend's feature key. `comingSoon` marks a flag the backend
   grants but the product has no screens for yet: we show it as "Coming soon"
   rather than a tick, so a plan can't promise something a buyer can't open.
   Drop the flag here the day the module ships.
──────────────────────────────────────────────────────────────────────────── */
export const PLAN_FEATURES = [
  { key: "employee.access", name: "Employee Management", module: "employee" },
  { key: "attendance.access", name: "Attendance", module: "attendance" },
  { key: "attendance.geofencing", name: "Attendance Geofencing", module: "attendance" },
  { key: "leave.access", name: "Leave Management", module: "leave" },
  { key: "payroll.access", name: "Payroll", module: "payroll" },
  { key: "documents.access", name: "Document Management", module: "document" },
  { key: "recruitment.access", name: "Recruitment & ATS", module: "recruitment", comingSoon: true },
];

const FEATURE_BY_KEY = Object.fromEntries(PLAN_FEATURES.map((f) => [f.key, f]));

export const isComingSoon = (key) => Boolean(FEATURE_BY_KEY[key]?.comingSoon);

/* ─── The plans ────────────────────────────────────────────────────────────
   The backend lists five rows because monthly and yearly are separate plan
   codes. A buyer thinks in three tiers, so each tier below carries both codes
   and the UI picks one from the billing toggle.
──────────────────────────────────────────────────────────────────────────── */
export const PLANS = [
  {
    tier: "free",
    name: "Free Plan",
    description: "Basic features for small teams",
    popular: false,
    // One lifetime code — the billing toggle doesn't change anything here.
    monthly: { code: "free", amount: 0, billingCycle: "lifetime" },
    yearly: { code: "free", amount: 0, billingCycle: "lifetime" },
    limits: { employees: 10, managers: 2, hrs: 1 },
    features: {
      "employee.access": true,
      "attendance.access": true,
      "attendance.geofencing": false,
      "leave.access": true,
      "payroll.access": true,
      "documents.access": true,
      "recruitment.access": false,
    },
  },
  {
    tier: "starter",
    name: "Starter",
    description: "Great for growing teams",
    popular: true,
    monthly: { code: "starter_monthly", amount: 49, billingCycle: "monthly" },
    yearly: { code: "starter_yearly", amount: 500, billingCycle: "yearly" },
    limits: { employees: 20, managers: 5, hrs: 2 },
    features: {
      "employee.access": true,
      "attendance.access": true,
      "attendance.geofencing": false,
      "leave.access": true,
      "payroll.access": true,
      "documents.access": true,
      "recruitment.access": false,
    },
  },
  {
    tier: "growth",
    name: "Growth",
    description: "For scaling organizations",
    popular: false,
    monthly: { code: "growth_monthly", amount: 99, billingCycle: "monthly" },
    yearly: { code: "growth_yearly", amount: 990, billingCycle: "yearly" },
    limits: { employees: 300, managers: 10, hrs: 5 },
    features: {
      "employee.access": true,
      "attendance.access": true,
      "attendance.geofencing": true,
      "leave.access": true,
      "payroll.access": true,
      "documents.access": true,
      "recruitment.access": true,
    },
  },
];

export const PLAN_BY_TIER = Object.fromEntries(PLANS.map((p) => [p.tier, p]));

/* ─── Normalising the live catalogue (#225) ────────────────────────────────
   The endpoint returns a FLAT list — one row per purchasable code, so monthly
   and yearly are separate rows. A buyer thinks in tiers with a billing toggle,
   which is the shape above, so the rows are grouped back into tiers here.

   The grouping key is the code's prefix, because #225 sends no tier field:
   "starter_monthly" and "starter_yearly" are one tier, "free" is its own. That
   is a NAMING CONVENTION, not a contract, so it is deliberately forgiving — a
   code it can't split becomes a tier of its own rather than disappearing. A
   plan the backend adds tomorrow therefore still renders, with its own card,
   which is the one behaviour that matters: never silently drop a plan someone
   can buy.
──────────────────────────────────────────────────────────────────────────── */

const CYCLE_SUFFIX = /_(monthly|yearly|annual|annually|lifetime)$/i;

/** "growth_yearly" → "growth"; "free" → "free". */
export const tierOf = (code) => String(code || "").replace(CYCLE_SUFFIX, "") || "plan";

/** Which variant slot a row fills. A lifetime (free) plan fills both. */
const cycleOf = (row) => {
  const cycle = String(row?.billing_cycle || "").toLowerCase();
  if (cycle === "yearly" || cycle === "annual" || cycle === "annually") return "yearly";
  if (cycle === "lifetime") return "both";
  return "monthly";
};

/** "Starter Monthly" → "Starter": the tier's name, without the cycle word. */
const tierName = (name, code) =>
  String(name || "").replace(/\s+(monthly|yearly|annual|annually|lifetime)$/i, "").trim()
  || humanize(tierOf(code));

/** `feature_keys: ["payroll.access"]` → `{ "payroll.access": true }`. */
const featureMap = (keys) =>
  Object.fromEntries((Array.isArray(keys) ? keys : []).map((k) => [k, true]));

/** One #225 row → the variant shape the display helpers read. */
const variantFromRow = (row) => ({
  code: row.code,
  // #225 sends money as a decimal STRING ("999.00"); the display helpers want
  // a number. This is the only place the two meet.
  amount: Number.parseFloat(row.amount) || 0,
  billingCycle: String(row.billing_cycle || "monthly").toLowerCase(),
  currency: row.currency || "INR",
  // Limits live on the ROW, not the tier: monthly and yearly of one tier could
  // in principle differ, and the seat check that matters must read the variant
  // actually being bought.
  limits: {
    employees: row.limits?.max_employees ?? null,
    managers: row.limits?.max_managers ?? null,
    hrs: row.limits?.max_hrs ?? null,
  },
  features: featureMap(row.feature_keys),
  grace: row.grace_period_days ?? null,
  isCurrent: Boolean(row.is_current),
});

/**
 * #225 `data.plans` → the tiered catalogue the pickers render.
 * Returns `[]` for an empty or unusable payload, so a caller can tell "the
 * server offers nothing" from "we couldn't ask" (§7).
 */
export function plansFromCatalog(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const tiers = new Map();
  for (const row of rows) {
    if (!row?.code) continue;
    const tier = tierOf(row.code);
    if (!tiers.has(tier)) {
      tiers.set(tier, {
        tier,
        name: tierName(row.name, row.code),
        description: row.description || "",
        popular: false,
        monthly: null,
        yearly: null,
      });
    }
    const entry = tiers.get(tier);
    const variant = variantFromRow(row);
    const slot = cycleOf(row);
    if (slot === "both") { entry.monthly = variant; entry.yearly = variant; }
    else entry[slot] = variant;
    // Prefer a description that actually says something.
    if (!entry.description && row.description) entry.description = row.description;
    // The shortest name wins the tier label ("Starter" over "Starter Monthly").
    const candidate = tierName(row.name, row.code);
    if (candidate && candidate.length < entry.name.length) entry.name = candidate;
  }

  const plans = [...tiers.values()]
    // A tier offered on only one cycle still has to render on both toggle
    // positions, so the missing slot mirrors the present one.
    .map((p) => ({ ...p, monthly: p.monthly || p.yearly, yearly: p.yearly || p.monthly }))
    .filter((p) => p.monthly)
    // Cheapest first, so Free leads and the cards read as a ladder.
    .sort((a, b) => (a.monthly.amount || 0) - (b.monthly.amount || 0));

  // Tier-level limits and features, for the comparison table and the bullets:
  // taken from the monthly variant, which is the one the toggle opens on.
  for (const p of plans) {
    p.limits = p.monthly.limits;
    p.features = p.monthly.features;
  }

  // "Most popular" is a marketing decision the API doesn't carry. Keep it on
  // whichever live tier matches the one we flag in the fallback, so the badge
  // doesn't vanish the moment the catalogue goes live.
  const popularTier = PLANS.find((p) => p.popular)?.tier;
  const popular = plans.find((p) => p.tier === popularTier)
    // No match (the tiers were renamed): the dearest non-free plan, never none.
    || plans.filter((p) => p.monthly.amount > 0).slice(-1)[0];
  if (popular) popular.popular = true;

  return plans;
}

/* ─── Derived helpers ─────────────────────────────────────────────────────── */

/**
 * The billing variant to use — `billing` is "monthly" | "yearly".
 * Falls back to the other cycle rather than returning undefined: a live tier
 * sold only yearly would otherwise crash every caller on the monthly toggle.
 */
export const variantFor = (plan, billing) =>
  (billing === "yearly" ? plan?.yearly || plan?.monthly : plan?.monthly || plan?.yearly) || null;

/** The `plan_code` to send to the registration endpoint, or null. */
export const planCodeFor = (plan, billing) => variantFor(plan, billing)?.code || null;

/** The seat limits of the variant actually being bought. */
export const limitsFor = (plan, billing) => variantFor(plan, billing)?.limits || plan?.limits || null;

/** "Free" or "₹1,990" — the number alone, no period. */
export const formatPlanPrice = (plan, billing) => {
  const amount = variantFor(plan, billing)?.amount ?? 0;
  return amount === 0 ? "Free" : `₹${amount.toLocaleString("en-IN")}`;
};

/** "per month" / "per year", or "" for a free lifetime plan. */
export const planPeriodLabel = (plan, billing) => {
  const variant = variantFor(plan, billing);
  if (!variant || variant.amount === 0 || variant.billingCycle === "lifetime") return "";
  return variant.billingCycle === "yearly" ? "per year" : "per month";
};

/**
 * What the price actually buys, spelled out. The old cards showed a bare "₹49"
 * with no qualifier, so nobody could tell whether it was per employee or for
 * the whole workspace. It is the whole workspace.
 */
export const planPriceCaption = (plan) =>
  `for the whole workspace · ${seatPhrase(plan?.limits?.employees, "employee", "employees")}`;

/** "up to 100 employees" / "unlimited employees" — a null limit is unlimited. */
const seatPhrase = (count, one, many) =>
  count == null ? `unlimited ${many}` : `up to ${count} ${count === 1 ? one : many}`;

/** Whole-percent saving of the yearly price against 12× monthly, or 0. */
export const yearlySavingPct = (plan) => {
  const monthly = (plan?.monthly?.amount || 0) * 12;
  const yearly = plan?.yearly?.amount || 0;
  // A tier sold on one cycle only has both slots pointing at the same variant,
  // so there is no saving to advertise.
  if (!monthly || !yearly || plan.monthly.code === plan.yearly.code) return 0;
  return Math.max(0, Math.round(((monthly - yearly) / monthly) * 100));
};

/** The biggest saving across paid tiers — for the "Save ~x%" toggle badge. */
export const bestYearlySavingPct = (plans = PLANS) =>
  Math.max(0, ...plans.map(yearlySavingPct));

/**
 * Every feature key worth a row, in our catalogue's order, with any key the
 * live plans carry that we have no name for appended. Without this a feature
 * the backend adds would be invisible on the pricing table until someone
 * remembered to edit PLAN_FEATURES.
 */
export const featureRowsFor = (plans = PLANS) => {
  const known = new Set(PLAN_FEATURES.map((f) => f.key));
  const extra = [];
  for (const plan of plans) {
    for (const key of Object.keys(plan.features || {})) {
      if (!known.has(key) && !extra.some((f) => f.key === key)) {
        extra.push({ key, name: humanize(key.split(".")[0]) });
      }
    }
  }
  return [...PLAN_FEATURES, ...extra];
};

/**
 * Bullet lines for a plan card: the seat limits, then each enabled feature.
 * A coming-soon feature is labelled so the card never implies it's usable.
 */
export const planBullets = (plan) => {
  const limits = plan?.limits || {};
  const seats = `Up to ${limits.employees ?? "unlimited"} employees & ${limits.managers ?? "unlimited"} managers`;
  const feats = featureRowsFor([plan])
    .filter((f) => plan.features?.[f.key])
    .map((f) => (f.comingSoon ? `${f.name} (coming soon)` : f.name));
  return [seats, ...feats];
};

/**
 * A cell value for the comparison table: true, false, or a string.
 * Seat rows return a string; feature rows return a boolean unless the feature
 * is granted-but-unbuilt, which returns the "Coming soon" label.
 */
export const comparisonRows = (plans = PLANS) => [
  {
    label: "Employee limit",
    values: plans.map((p) => (p.limits?.employees == null ? "No limit" : `Up to ${p.limits.employees}`)),
  },
  {
    label: "Manager accounts",
    values: plans.map((p) => (p.limits?.managers == null ? "No limit" : `${p.limits.managers}`)),
  },
  {
    label: "HR accounts",
    values: plans.map((p) => (p.limits?.hrs == null ? "No limit" : `${p.limits.hrs}`)),
  },
  ...featureRowsFor(plans).map((f) => ({
    label: f.name,
    values: plans.map((p) => {
      if (!p.features?.[f.key]) return false;
      return f.comingSoon ? "Coming soon" : true;
    }),
  })),
];
