// ─────────────────────────────────────────────────────────────────────────────
// billingMeta.js — What the billing module's enums, states and figures MEAN,
// kept out of the JSX (§1) so the two billing screens and three dialogs agree.
//
// Contract: public/ref docs/md_money/phase1_api_analysis.md.
//
// This domain has more jargon per screen than anything else in the product —
// proration, entitlement, grace, settlement, intent, credit notes — and none of
// it is a word an HR admin should have to learn (§6). So every label here is
// written for the person paying the bill, and says the consequence rather than
// the mechanism:
//
//   entitlement  → "your workspace is switched on"
//   in_grace     → "payment overdue" (access continues, briefly)
//   proration    → "credit for the days you’ve already paid for"
//   intent       → what this payment IS: first plan / renewal / move up
//   settled_via  → never shown at all; nobody cares which of our three
//                  settlement paths won the race
//
// Tones follow §5: `emerald` renders violet (good), `amber` renders fuchsia
// (pending/warning), `blue`/`indigo` render indigo (neutral info), and `rose`
// stays red for the two states that genuinely are failures — a failed payment
// and an expired subscription.
//
// The money figures arrive as DECIMAL STRINGS ("14999.00"). Nothing here does
// arithmetic on them; the one place that must compare two amounts
// (`isBiggerPlan`) parses explicitly and is only ever used to sort a catalogue
// for display, never to decide what to charge — the server decides that.
// ─────────────────────────────────────────────────────────────────────────────

import { humanize } from "../../../shared/attendance/enums";
import { formatMoney } from "../../../shared/utils/formatUtils";
import { PLAN_FEATURES, tierName, tierOf } from "../../../shared/config/plans";

const FEATURE_NAME = Object.fromEntries(PLAN_FEATURES.map((f) => [f.key, f.name]));

/* ─── Subscription status (#226 `subscription.status`) ───────────────────────
   Five values, and the difference between three of them is the whole story of
   whether the workspace still works. `is_entitled` is the server's verdict and
   is always preferred over reading the status ourselves. */
export const SUBSCRIPTION_STATUS = {
  active: {
    label: "Active",
    tone: "emerald",
    meaning: "Everything is switched on and the plan renews on its own.",
  },
  in_grace: {
    label: "Payment overdue",
    tone: "amber",
    meaning: "The plan has run out but we’ve kept the workspace on for a few more days. Renew to keep it.",
  },
  past_due: {
    label: "Payment overdue",
    tone: "amber",
    meaning: "The plan has run out but we’ve kept the workspace on for a few more days. Renew to keep it.",
  },
  expired: {
    label: "Ended",
    tone: "rose",
    meaning: "The plan has run out and the extra days are used up. Choose a plan to switch the workspace back on.",
  },
  canceled: {
    label: "Cancelled",
    tone: "slate",
    meaning: "This plan was cancelled. Choose a plan to start again.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "slate",
    meaning: "This plan was cancelled. Choose a plan to start again.",
  },
  suspended: {
    label: "Suspended",
    tone: "rose",
    meaning: "We’ve paused this workspace. Contact support to sort it out.",
  },
};

export const subscriptionStatusMeta = (status) =>
  SUBSCRIPTION_STATUS[String(status || "").toLowerCase()]
  || { label: humanize(status) || "N/A", tone: "slate", meaning: "" };

/* ─── Payment status (#229 `status`) ────────────────────────────────────────
   "pending" is the one that needs care: it means an order is open and the
   person may be mid-payment, so it is never styled as a failure. */
export const PAYMENT_STATUS = {
  pending: { label: "Waiting to pay", tone: "amber" },
  success: { label: "Paid", tone: "emerald" },
  failed: { label: "Didn’t go through", tone: "rose" },
  cancelled: { label: "Dropped", tone: "slate" },
  partially_refunded: { label: "Part refunded", tone: "blue" },
  refunded: { label: "Refunded", tone: "blue" },
};

export const paymentStatusMeta = (status) =>
  PAYMENT_STATUS[String(status || "").toLowerCase()]
  || { label: humanize(status) || "N/A", tone: "slate" };

/** The filter tabs on Payments & Invoices — labels, not enum names. */
export const PAYMENT_FILTERS = [
  { value: "", label: "All" },
  { value: "success", label: "Paid" },
  { value: "pending", label: "Waiting to pay" },
  { value: "failed", label: "Didn’t go through" },
  { value: "refunded", label: "Refunded" },
];

/* ─── Intent (#229/#232/#238 `intent`) ──────────────────────────────────────
   The server works out what a payment is from the organisation's current
   subscription; we only ever display its answer. "Upgrade" is the word the API
   uses, but nobody buying it calls it that — they are moving to a bigger plan. */
export const PAYMENT_INTENT = {
  initial: { label: "First plan", verb: "Subscribe" },
  renewal: { label: "Renewal", verb: "Renew" },
  upgrade: { label: "Moved up a plan", verb: "Move up" },
  downgrade: { label: "Moved down a plan", verb: "Move down" },
  reactivation: { label: "Restarted", verb: "Restart" },
};

export const intentLabel = (intent) =>
  PAYMENT_INTENT[String(intent || "").toLowerCase()]?.label || humanize(intent) || "N/A";

/** The button word for a quote: "Renew and pay", "Move up and pay". */
export const intentVerb = (intent) =>
  PAYMENT_INTENT[String(intent || "").toLowerCase()]?.verb || "Pay";

/**
 * What this payment will do, in a sentence — shown above the amount so nobody
 * pays without knowing what changes. Deliberately avoids dates and figures:
 * the quote renders those itself, from the server's numbers.
 */
export const INTENT_CONSEQUENCE = {
  initial: "Paying starts your plan and switches the workspace on.",
  renewal: "Paying extends your plan from the day the current one ends — you don’t lose the days you’ve already paid for.",
  upgrade: "Paying moves you up straight away. We’ve taken off credit for the days left on your current plan, and your renewal date doesn’t change.",
  reactivation: "Paying switches the workspace back on and starts a fresh period today.",
  downgrade: "A cheaper plan starts when the period you’ve paid for ends, so there’s nothing to pay now.",
};

export const intentConsequence = (intent) => INTENT_CONSEQUENCE[String(intent || "").toLowerCase()] || "";

/* ─── Billing cycle ────────────────────────────────────────────────────────── */
export const CYCLE_LABEL = { monthly: "a month", yearly: "a year", lifetime: "" };

/**
 * How often the card is charged, as a sentence rather than an enum name (§6).
 * "lifetime" says only that nothing is ever taken — not "lifetime", which
 * reads like something bought.
 *
 * It used to read "Never — this plan is free", which was true of the only
 * lifetime plan on sale and wrong about the other kind: an internal or
 * negotiated plan is `lifetime` too, and "free" is not what somebody agreed
 * to. The reason now lives in the hint beside it, which knows which of the
 * two this is (CurrentPlanCard, PlanDetailDialog).
 */
export const CYCLE_EVERY = { monthly: "Every month", yearly: "Every year", lifetime: "Never" };

export const cycleEveryLabel = (billingCycle) =>
  CYCLE_EVERY[String(billingCycle || "").toLowerCase()] || "N/A";

/** "₹999 a month", "₹14,999 a year", "₹0" — the figure with its period word. */
export const amountLabel = (amount, billingCycle) => {
  const per = CYCLE_LABEL[String(billingCycle || "").toLowerCase()];
  return per ? `${formatMoney(amount)} ${per}` : formatMoney(amount);
};

/**
 * The price of a CATALOGUE row — every row in #225 is on public sale, so a
 * figure of zero there is the free tier and may safely be called "Free".
 * Use planPriceLabel for the plan somebody is ON, which may be zero without
 * being the free tier.
 */
export function priceLabel(amount, billingCycle) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n === 0) return "Free";
  return amountLabel(amount, billingCycle);
}

/** A free plan never expires and can't be cancelled (#235 CANNOT_CANCEL_FREE_PLAN). */
export const isFreePlan = (plan) =>
  !plan || parseFloat(plan.amount) === 0 || String(plan.billing_cycle).toLowerCase() === "lifetime";

/**
 * Is this plan code one that anybody can buy?
 *
 * #225 returns only rows where `is_active = true AND is_public = true`
 * (md_money/phase1_api_analysis.md §225), so a plan the SUBSCRIPTION names
 * that the CATALOGUE doesn't carry is not on sale: a negotiated or internal
 * plan, or one withdrawn since it was bought. There is no `is_public` flag on
 * #226's plan object to read instead — absence from #225 is the only signal
 * the contract gives us.
 *
 * An empty catalogue answers TRUE. The catalogue is a separate request that
 * can fail (the token-less public `GET /plans` still 404s on dev — see
 * billing.api.js), and "the list didn't load" must never be read as "this plan
 * is private": that would reclassify every ordinary customer on one failed
 * request (§7 — a missing read is not a fact).
 */
export const isPublicPlan = (planCode, rows) =>
  !planCode || !Array.isArray(rows) || rows.length === 0
    ? true
    : rows.some((row) => row?.code === planCode);

/**
 * The FREE TIER — no cost AND on public sale.
 *
 * A different question from `isFreePlan`, and the one the UI actually wants
 * before it says "Free" or "No card is needed". An internal or negotiated plan
 * arrives as `amount: "0.00"` on `billing_cycle: "lifetime"` — byte for byte
 * the shape of the public `free` row — so neither the amount nor the cycle can
 * tell the two apart. Only catalogue membership can.
 *
 * Calling a plan somebody negotiated "Free" is a claim about their commercial
 * relationship, which is why this exists (14 Oct 2026).
 */
export const isFreeTier = (plan, rows) => isFreePlan(plan) && isPublicPlan(plan?.code, rows);

/**
 * The price of the plan IN FORCE (#226), which is not the same question as
 * priceLabel: a negotiated plan can be ₹0 without being the free tier, and
 * printing "Free" over it tells somebody their arrangement costs nothing.
 * Reads the catalogue to tell the two apart, and falls back to the figure.
 */
export const planPriceLabel = (plan, rows) =>
  isFreeTier(plan, rows) ? "Free" : amountLabel(plan?.amount, plan?.billing_cycle);

/* ─── Subscription lifecycle events (#228 `event_type`) ─────────────────────
   An audit trail an HR admin can actually read. Anything not listed falls back
   to humanize(), so a new backend event type shows as words rather than a raw
   code — and never as nothing. */
export const EVENT_LABEL = {
  "payment.initiated": "Payment started",
  "payment.succeeded": "Payment received",
  "payment.failed": "Payment didn’t go through",
  "payment.abandoned": "Payment dropped",
  "payment.flagged": "Payment held for checking",
  "payment.refunded": "Payment refunded",
  "subscription.activated": "Plan switched on",
  "subscription.renewed": "Plan renewed",
  "subscription.upgraded": "Moved up a plan",
  "subscription.downgraded": "Moved down a plan",
  "subscription.cancelled": "Plan cancelled",
  "subscription.canceled": "Plan cancelled",
  "subscription.cancel_scheduled": "Set to end at the period end",
  "subscription.cancel_reverted": "Cancellation called off",
  "subscription.downgrade_scheduled": "Cheaper plan scheduled",
  "subscription.downgrade_cleared": "Scheduled plan change removed",
  "subscription.expired": "Plan ran out",
  "subscription.grace_started": "Extra days started",
  "subscription.suspended": "Workspace paused",
  "invoice.issued": "Invoice issued",
};

export const eventLabel = (type) => EVENT_LABEL[type] || humanize(String(type || "").replace(/\./g, " ")) || "N/A";

/** Events that are bad news get the one red tone; everything else stays neutral. */
export const eventTone = (type) =>
  ["payment.failed", "payment.flagged", "subscription.expired", "subscription.suspended"].includes(type)
    ? "rose"
    : ["payment.succeeded", "subscription.activated", "subscription.renewed", "subscription.upgraded"].includes(type)
      ? "emerald"
      : "slate";

/* ─── Seat usage ────────────────────────────────────────────────────────────
   #226 `usage` is `{ employees, managers, hrs }`, each `{ used, limit }` with a
   null limit meaning unlimited. The meters are the main reason an admin opens
   this page, so they are derived once here. */
// `noun` is the mid-sentence form. It is spelled out rather than lower-cased
// from `label`, because "HR" is an initialism and `toLowerCase()` turned it
// into "1 of 2 hr admins".
export const SEAT_ROLES = [
  { key: "employees", label: "Employees", noun: "employees" },
  { key: "managers", label: "Managers", noun: "managers" },
  { key: "hrs", label: "HR admins", noun: "HR admins" },
];

/** Role word for a #232/#237 seat violation, which names the singular role. */
export const VIOLATION_ROLE_LABEL = { employee: "Employees", manager: "Managers", hr: "HR admins" };

/**
 * One meter: `{ key, label, used, limit, unlimited, pct, full, over }`.
 * `pct` is capped at 100 so the bar can't overflow its track, while `over`
 * keeps the fact that the count has passed the limit — which is possible, since
 * people can be invited up to the limit and a scheduled downgrade can land
 * under it.
 */
export function seatMeters(usage) {
  return SEAT_ROLES.map(({ key, label, noun }) => {
    const row = usage?.[key] || {};
    const used = Number(row.used) || 0;
    const limit = row.limit === null || row.limit === undefined ? null : Number(row.limit);
    const unlimited = limit === null || !Number.isFinite(limit);
    const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
    return {
      key,
      label,
      noun,
      used,
      limit,
      unlimited,
      pct,
      full: !unlimited && used >= limit,
      over: !unlimited && used > limit,
      // "42 of 100" / "42 of Unlimited", never a bare fraction with no unit.
      // "Unlimited" is the word used for an absent cap EVERYWHERE in billing
      // (user instruction, 14 Oct 2026); "no limit" read like a warning and
      // "5 — no limit employees" in the seat line read like broken English.
      text: unlimited ? `${used} of Unlimited` : `${used} of ${limit}`,
    };
  });
}

/** The meter colour: red once it's over, fuchsia as it fills, violet otherwise. */
export const meterTone = (meter) =>
  meter.over ? "bg-rose-500" : meter.full || meter.pct >= 90 ? "bg-fuchsia-500" : "bg-violet-500";

/* ─── What a plan includes, in words ───────────────────────────────────────
   Shared by the catalogue cards and the current-plan panel, which must agree
   about what a plan gives you — they sit on the same screen, inches apart.

   The feature NAMES come from shared/config/plans.js, the same list the public
   pricing page reads, including which features the backend grants but the
   product has no screens for yet. */

/** "payroll.access" → "Payroll", and an unknown key still reads as words (§4). */
export const featureName = (key) =>
  FEATURE_NAME[key] || humanize(String(key).split(".")[0]);

/** "1 manager" / "5 managers" — a seat line reading "1 HR admins" looks broken. */
export const plural = (count, one, many) => `${count} ${Number(count) === 1 ? one : many}`;

/**
 * "5 of 20 employees · 2 of 5 managers · 1 of 2 HR admins" — what is actually
 * being USED, for the one line the banner has room for. The allowance alone
 * ("up to 20 employees") is the less useful of the two: an admin already knows
 * what they bought, and what they came to check is how close they are to it.
 * Takes rows from `seatMeters()`, so the arithmetic stays in one place.
 */
export const seatUsageLine = (meters = []) =>
  meters.map((m) => `${m.text} ${m.noun || m.label}`).join(" · ");

/**
 * "Up to 100 employees · 15 managers · Unlimited HR admins".
 *
 * A null limit is UNLIMITED and now says so, for all three roles. The managers
 * and HR parts used to be dropped when they were null, which read as though
 * the plan said nothing about them — on a plan with no caps at all the whole
 * line came out as four words. "Unlimited" is the one word billing uses for an
 * absent cap (user instruction, 14 Oct 2026).
 */
export function seatLine(limits) {
  const cap = (value, one, many) =>
    value == null ? `Unlimited ${many}` : plural(value, one, many);
  return [
    limits?.max_employees == null ? "Unlimited employees" : `Up to ${plural(limits.max_employees, "employee", "employees")}`,
    cap(limits?.max_managers, "manager", "managers"),
    cap(limits?.max_hrs, "HR admin", "HR admins"),
  ].join(" · ");
}

/* ─── Plan comparison (display only) ───────────────────────────────────────── */

/** Is `plan` dearer than `current`? Used to sort and to label, never to price. */
export function isBiggerPlan(plan, current) {
  const a = parseFloat(plan?.amount);
  const b = parseFloat(current?.amount);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a > b;
}

/**
 * How a catalogue plan stands against the one in force: "current" | "up" |
 * "down" | "none". The server has the final say (#238 `intent`); this only
 * decides which button a card shows before anything is asked.
 */
export function planStanding(plan, currentPlan) {
  if (!currentPlan) return "none";
  if (plan.code === currentPlan.code) return "current";
  return isBiggerPlan(plan, currentPlan) ? "up" : "down";
}

/** The card's button word, from that standing. */
export const STANDING_ACTION = {
  current: "Renew this plan",
  up: "Move up to this plan",
  down: "Switch to this plan later",
  none: "Choose this plan",
};

/* ─── Grouping the flat catalogue into tiers ────────────────────────────────
   #225 returns one row per PURCHASABLE CODE, so "starter_monthly" and
   "starter_yearly" arrive as two separate rows. Rendered one card each, six
   rows asked an admin to compare a tier against its own other billing cycle —
   and left an orphan card on a row of its own whenever the count wasn't a
   multiple of the grid. Grouping restores the question they actually have
   ("which tier?") and moves the cycle to a single toggle above the cards.

   `tierOf` and `tierName` are imported from shared/config/plans.js rather than
   rewritten here, because the marketing pricing page and the registration
   picker group the same catalogue with them. Three copies of "what counts as
   one tier" is three ways for one plan to be named differently.

   THE ROWS ARE KEPT UNTOUCHED in the slots. Everything downstream — the quote
   dialog, the seat line, the feature ticks — reads `amount`, `billing_cycle`,
   `limits` and `feature_keys` straight off a #225 row, and a reshaped copy
   would be one more thing that can quietly disagree with the server. ──────── */

/** Which slot a row fills. A lifetime (free) plan fills both — it has no cycle. */
const slotOf = (row) => {
  const cycle = String(row?.billing_cycle || "").toLowerCase();
  if (cycle === "lifetime") return "both";
  if (cycle === "yearly" || cycle === "annual" || cycle === "annually") return "yearly";
  return "monthly";
};

/**
 * #225 `plans[]` → `[{ tier, name, description, monthly, yearly }]`, cheapest
 * first so the cards read as a ladder. `monthly` and `yearly` are the original
 * rows; a tier sold on only one cycle mirrors it into the other slot, so a
 * card never vanishes when the toggle moves.
 */
export function planTiers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const tiers = new Map();
  for (const row of rows) {
    if (!row?.code) continue;
    const key = tierOf(row.code);
    if (!tiers.has(key)) {
      tiers.set(key, { tier: key, name: tierName(row.name, row.code), description: row.description || "", monthly: null, yearly: null });
    }
    const entry = tiers.get(key);
    const slot = slotOf(row);
    if (slot === "both") { entry.monthly = row; entry.yearly = row; }
    else entry[slot] = row;
    if (!entry.description && row.description) entry.description = row.description;
    // The shortest name wins the tier label ("Starter" over "Starter Monthly").
    const candidate = tierName(row.name, row.code);
    if (candidate && candidate.length < entry.name.length) entry.name = candidate;
  }

  return [...tiers.values()]
    .map((t) => ({ ...t, monthly: t.monthly || t.yearly, yearly: t.yearly || t.monthly }))
    .filter((t) => t.monthly)
    .sort((a, b) => (parseFloat(a.monthly.amount) || 0) - (parseFloat(b.monthly.amount) || 0));
}

/** The row a tier offers on this cycle. Never null for a tier that rendered. */
export const variantOf = (tier, cycle) =>
  (cycle === "yearly" ? tier?.yearly || tier?.monthly : tier?.monthly || tier?.yearly) || null;

/** Does this tier actually sell two cycles? A free lifetime plan does not. */
export const hasBothCycles = (tier) =>
  Boolean(tier?.monthly && tier?.yearly && tier.monthly.code !== tier.yearly.code);

/**
 * What a year up front saves against twelve monthly payments:
 * `{ full, saved, pct }`, or null when there is nothing to advertise.
 *
 * Display only, like `isBiggerPlan` — it compares two of the server's own list
 * prices to label a toggle. It is never what anybody is charged: the quote
 * (#238) and the charge (#232) both come from the server, and this screen has
 * no way to pass an amount (see billing.api.js).
 */
export function yearlySaving(tier) {
  if (!hasBothCycles(tier)) return null;
  const monthly = parseFloat(tier.monthly?.amount);
  const yearly = parseFloat(tier.yearly?.amount);
  if (!Number.isFinite(monthly) || !Number.isFinite(yearly) || monthly <= 0) return null;
  const full = monthly * 12;
  const saved = full - yearly;
  if (saved <= 0) return null;
  return { full, saved, pct: Math.round((saved / full) * 100) };
}

/** The biggest saving any tier offers — the badge on the "Yearly" tab, or 0. */
export const bestSavingPct = (tiers = []) =>
  tiers.reduce((best, tier) => Math.max(best, yearlySaving(tier)?.pct || 0), 0);

/* ─── The rank mark on the premium banner ──────────────────────────────────
   One image per paid tier, in price order, so the banner says at a glance
   WHERE this organisation sits rather than only that it pays us something.

   The rank is the tier's POSITION among the paid tiers of the live
   catalogue — never a hardcoded "starter → bronze" map. A backend that adds
   a tier, renames one or reprices one therefore re-ranks the art with no
   frontend release, which is the same rule the catalogue cards already
   follow. It also means the marks can never disagree with the price order
   shown directly beneath them.

   EVERY PLAN GETS A MARK, AND THE LADDER INCLUDES THE FREE TIER (user
   decision, 14 Oct 2026 — "show it no matter what"). Both used to be the
   other way round: the ladder counted paid tiers only, and anything off it
   returned null, so the free tier, a lapsed plan and a private plan all drew
   nothing. The free tier is now simply the bottom rung of the same ladder.

   A plan THE CATALOGUE DOESN'T CARRY gets the TOP mark. #225 lists only
   public rows, so a subscription naming a plan that isn't there is on a
   negotiated or internal plan — the dearest thing an organisation can be on,
   whatever its invoice says — and there is no rung to read for it. The same
   answer covers a plan withdrawn from sale, and a catalogue request that
   failed outright; on this screen a mark that over-states beats a banner with
   a hole in it.

   A catalogue deeper than this list tops out at the last mark rather than
   running out, so the dearest public plan always has one too. */
const RANK_ART = [
  // Cheapest tier, which is the free one wherever the catalogue carries it
  "https://cdn3d.iconscout.com/3d/premium/thumb/bronze-rank-3d-icon-png-download-8955734.png",
  "https://cdn3d.iconscout.com/3d/premium/thumb/rank-silver-3d-icon-png-download-9325593.png",
  "https://cdn3d.iconscout.com/3d/premium/thumb/gold-rank-3d-icon-png-download-8955735.png",
  // Anything above the top three — and what a plan off the ladder wears
  "https://cdn3d.iconscout.com/3d/premium/thumb/game-rank-3d-icon-png-download-8017774.png",
];

/** The top mark — what a plan outside the public catalogue wears. */
const TOP_RANK_ART = RANK_ART[RANK_ART.length - 1];

/**
 * The rank mark for a subscription's plan. NEVER null — every plan has one.
 * @param {string} planCode  #226 `subscription.plan.code`
 * @param {object[]} rows    #225 rows, flat
 */
export function rankArtFor(planCode, rows) {
  if (!planCode) return TOP_RANK_ART;
  // Every tier, the free one included, already cheapest-first from planTiers().
  const tiers = planTiers(rows);
  // Either cycle of a tier is the same rank — paying yearly is not a promotion.
  const index = tiers.findIndex((t) => t.monthly?.code === planCode || t.yearly?.code === planCode);
  // Off the ladder: private, internal, withdrawn, or no catalogue to read.
  if (index < 0) return TOP_RANK_ART;
  return RANK_ART[Math.min(index, RANK_ART.length - 1)];
}

/** The two positions of the billing-cycle toggle. */
export const CYCLE_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/**
 * Which position the toggle should open on: the cycle the organisation is
 * already paying on, so its own plan is the card showing "Your plan" rather
 * than one the admin has to go looking for. A free or lapsed org opens monthly.
 */
export const cycleOfPlan = (plan) =>
  ["yearly", "annual", "annually"].includes(String(plan?.billing_cycle || "").toLowerCase())
    ? "yearly"
    : "monthly";

/* ─── Invoice (#231) ───────────────────────────────────────────────────────
   A frozen statutory document: it is shown exactly as it was issued, never
   re-derived from today's company details. The labels are the ones a finance
   team expects on a tax invoice, because this is the one screen in the product
   written for an accountant rather than for an HR admin. */
export const INVOICE_TOTAL_ROWS = [
  { key: "subtotal", label: "Subtotal" },
  { key: "discount", label: "Discount" },
  { key: "taxable_amount", label: "Taxable amount" },
  { key: "cgst_amount", label: "CGST" },
  { key: "sgst_amount", label: "SGST" },
  { key: "igst_amount", label: "IGST" },
];
