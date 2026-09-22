// ─────────────────────────────────────────────────────────────────────────────
// plans.js — the single source of truth for subscription plans.
//
// Every price, seat limit and feature flag shown anywhere in the product comes
// from here: the marketing pricing cards, the pricing comparison table and the
// plan picker inside organization registration. Before this file existed those
// three places each carried their own copy and they had drifted badly — the
// landing page advertised ₹49/month while the checkout charged ₹499, which is
// the kind of mismatch that ends in a chargeback.
//
// The shape mirrors the backend plan catalog exactly (code, amount,
// billing_cycle, max_employees, max_managers, max_hrs, features[]), so when a
// GET /plans endpoint lands this module can fetch and keep the same exports as
// a fallback. `code` values are the literal `plan_code` strings that
// POST /organizations/register/initiate accepts — never rename them.
// ─────────────────────────────────────────────────────────────────────────────

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

/* ─── Derived helpers ─────────────────────────────────────────────────────── */

/** The billing variant to use — `billing` is "monthly" | "yearly". */
export const variantFor = (plan, billing) =>
  billing === "yearly" ? plan.yearly : plan.monthly;

/** The `plan_code` to send to the registration endpoint. */
export const planCodeFor = (plan, billing) => variantFor(plan, billing).code;

/** "Free" or "₹1,990" — the number alone, no period. */
export const formatPlanPrice = (plan, billing) => {
  const { amount } = variantFor(plan, billing);
  return amount === 0 ? "Free" : `₹${amount.toLocaleString("en-IN")}`;
};

/** "per month" / "per year", or "" for a free lifetime plan. */
export const planPeriodLabel = (plan, billing) => {
  const { amount, billingCycle } = variantFor(plan, billing);
  if (amount === 0 || billingCycle === "lifetime") return "";
  return billingCycle === "yearly" ? "per year" : "per month";
};

/**
 * What the price actually buys, spelled out. The old cards showed a bare "₹49"
 * with no qualifier, so nobody could tell whether it was per employee or for
 * the whole workspace. It is the whole workspace.
 */
export const planPriceCaption = (plan) =>
  `for the whole workspace · up to ${plan.limits.employees} employees`;

/** Whole-percent saving of the yearly price against 12× monthly, or 0. */
export const yearlySavingPct = (plan) => {
  const monthly = plan.monthly.amount * 12;
  if (!monthly || !plan.yearly.amount) return 0;
  return Math.round(((monthly - plan.yearly.amount) / monthly) * 100);
};

/** The biggest saving across paid tiers — for the "Save ~x%" toggle badge. */
export const bestYearlySavingPct = () =>
  Math.max(0, ...PLANS.map(yearlySavingPct));

/**
 * Bullet lines for a plan card: the seat limits, then each enabled feature.
 * A coming-soon feature is labelled so the card never implies it's usable.
 */
export const planBullets = (plan) => {
  const seats = `Up to ${plan.limits.employees} employees & ${plan.limits.managers} managers`;
  const feats = PLAN_FEATURES.filter((f) => plan.features[f.key]).map((f) =>
    f.comingSoon ? `${f.name} (coming soon)` : f.name
  );
  return [seats, ...feats];
};

/**
 * A cell value for the comparison table: true, false, or a string.
 * Seat rows return a string; feature rows return a boolean unless the feature
 * is granted-but-unbuilt, which returns the "Coming soon" label.
 */
export const comparisonRows = () => [
  {
    label: "Employee limit",
    values: PLANS.map((p) => `Up to ${p.limits.employees}`),
  },
  {
    label: "Manager accounts",
    values: PLANS.map((p) => `${p.limits.managers}`),
  },
  {
    label: "HR accounts",
    values: PLANS.map((p) => `${p.limits.hrs}`),
  },
  ...PLAN_FEATURES.map((f) => ({
    label: f.name,
    values: PLANS.map((p) => {
      if (!p.features[f.key]) return false;
      return f.comingSoon ? "Coming soon" : true;
    }),
  })),
];
