// ─────────────────────────────────────────────────────────────────────────────
// phase7Meta.js — enums, wording and state rules for exits, final settlement,
// arrears and encashments (API #195–#218).
//
// Everything a Phase 7 screen needs to decide "can this button be pressed, and
// what do we call this thing" lives here, so the exits page and the encashments
// page can never disagree about what `prepared` means.
//
// Wording rule: these strings go in front of HR, not engineers. "Full & Final
// settlement" is the contract's name for it; on screen it is "final settlement".
// Nothing says "dual-debit", "artefact" or "idempotent".
// ─────────────────────────────────────────────────────────────────────────────

/** Tones stay in the purple family; rose is reserved for money owed back / refusals. */
const TONE = {
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-500 border-slate-200",
};

export const toneClass = (tone) => TONE[tone] || TONE.slate;

// ── Exits (#195–#199) ────────────────────────────────────────────────────────

export const EXIT_TYPES = [
  { value: "resignation", label: "Resigned" },
  { value: "termination", label: "Terminated" },
  { value: "retirement", label: "Retired" },
  { value: "end_of_contract", label: "Contract ended" },
  { value: "death", label: "Deceased" },
  { value: "absconding", label: "Absconded" },
];

export const exitTypeLabel = (v) =>
  EXIT_TYPES.find((t) => t.value === v)?.label || "Not recorded";

/**
 * The four states an exit moves through. `note` is the one-line explanation
 * shown under the badge, so HR never has to guess what happens next.
 */
export const EXIT_STATUS = {
  recorded: {
    label: "Recorded",
    tone: "indigo",
    note: "The last working day is on file. Nothing has been charged or paid yet.",
  },
  prepared: {
    label: "Settlement ready",
    tone: "fuchsia",
    note: "The amounts are locked in and waiting to be paid in a payroll run.",
  },
  settled: {
    label: "Settled",
    tone: "violet",
    note: "Paid through an approved payroll run. This exit is closed.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "slate",
    note: "This exit was called off. Nothing will be charged or paid.",
  },
};

export const exitStatusMeta = (status) =>
  EXIT_STATUS[String(status || "").toLowerCase()] || { label: "Unknown", tone: "slate", note: "" };

/**
 * What HR may do to an exit in its current state, and — when they may not —
 * the reason to show instead. A disabled button with no explanation reads as a
 * broken page, so every `false` here carries its sentence.
 *
 * Mirrors the backend's own refusals (#198, #199, #201, #202) so the UI and the
 * server agree before a request is ever sent.
 */
export function exitActions(exit) {
  const status = String(exit?.status || "").toLowerCase();
  const settled = status === "settled";
  const cancelled = status === "cancelled";
  const prepared = status === "prepared";

  return {
    canCorrect: !settled && !cancelled && !prepared,
    correctReason: settled ? "This exit is settled and paid, so its dates are fixed."
      : cancelled ? "This exit was cancelled."
      : prepared ? "Reset the settlement first — the amounts were worked out from these dates."
      : "",

    canCancel: !settled && !cancelled,
    cancelReason: settled ? "This exit is settled and paid, so it can't be cancelled."
      : cancelled ? "This exit is already cancelled." : "",

    canPrepare: !settled && !cancelled && !prepared,
    prepareReason: settled ? "This exit is already settled."
      : cancelled ? "This exit was cancelled."
      : prepared ? "The settlement is already prepared." : "",

    canReset: prepared,
    resetReason: prepared ? "" : "There's no prepared settlement to undo.",
  };
}

// ── Encashments (#206–#211, #216–#218) ───────────────────────────────────────

export const ENCASHMENT_STATUS = {
  pending: { label: "Waiting for approval", tone: "fuchsia" },
  approved: { label: "Approved", tone: "violet" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const encashmentStatusMeta = (status) =>
  ENCASHMENT_STATUS[String(status || "").toLowerCase()] || { label: "Unknown", tone: "slate" };

export const SOURCE_KINDS = [
  { value: "comp_off", label: "Comp-off", blurb: "Days earned for working on an off day." },
  { value: "leave_balance", label: "Leave balance", blurb: "Unused leave from the employee's balance." },
];

export const sourceKindLabel = (v) =>
  SOURCE_KINDS.find((k) => k.value === v)?.label || "Not recorded";

/**
 * Whether an encashment can be actioned, and by whom.
 *
 * `viewerId` drives the maker–checker rule: when the organisation requires a
 * separate checker, the HR user who raised a request may not approve it
 * (§5.5). The backend refuses it either way; doing it here as well means the
 * button is disabled with a reason rather than failing after the click.
 */
export function encashmentActions(row, { viewerId, separateChecker } = {}) {
  const status = String(row?.status || "").toLowerCase();
  const pending = status === "pending";
  const approved = status === "approved";
  const applied = Boolean(row?.applied_run_id || row?.adjustment_applied);
  const raisedByViewer = Boolean(viewerId) && (row?.created_by === viewerId || row?.requested_by === viewerId);
  const selfBlocked = pending && separateChecker && raisedByViewer;

  return {
    isOwnRequest: raisedByViewer,
    canApprove: pending && !selfBlocked,
    approveReason: !pending ? "Only requests still waiting for approval can be approved."
      : selfBlocked ? "You raised this request. Someone else in HR has to approve it."
      : "",
    canReject: pending && !selfBlocked,
    rejectReason: !pending ? "Only requests still waiting for approval can be rejected."
      : selfBlocked ? "You raised this request, so someone else has to decide on it."
      : "",
    // An approved request can still be pulled back until its money is paid.
    canCancel: (pending || approved) && !applied,
    cancelReason: applied ? "This has already been paid in a payroll run, so it can't be cancelled."
      : pending || approved ? "" : "This request has already been closed.",
  };
}

// ── Arrears (#203–#205) ──────────────────────────────────────────────────────

export const ARREAR_STATUS = {
  pending: { label: "Waiting for approval", tone: "fuchsia" },
  approved: { label: "Approved", tone: "indigo" },
  applied: { label: "Paid", tone: "violet" },
  rejected: { label: "Rejected", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const arrearStatusMeta = (status) =>
  ARREAR_STATUS[String(status || "").toLowerCase()] || { label: "Unknown", tone: "slate" };

// ── Payroll run types (#38/#39 Phase 7 extension) ────────────────────────────

export const RUN_TYPES = [
  {
    value: "regular",
    label: "Regular monthly payroll",
    blurb: "Everyone who should be paid this month.",
  },
  {
    value: "off_cycle",
    label: "Off-cycle payment",
    blurb: "A one-off payment to a chosen group, outside the normal monthly run.",
    cohort: { min: 1, max: 500, required: true },
    note: "Only extra payments are included — no regular salary.",
  },
  {
    value: "final_settlement",
    label: "Final settlement",
    blurb: "The last payment for people who have left.",
    cohort: { min: 1, max: 50, required: true },
    note: "Pick the people whose exit you have already prepared.",
  },
];

export const runTypeMeta = (v) => RUN_TYPES.find((t) => t.value === v) || RUN_TYPES[0];
export const runTypeLabel = (v) => (v ? runTypeMeta(v).label : RUN_TYPES[0].label);

/** `null` means "not worked out", which is never the same as zero rupees. */
export const amount = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The net of a settlement preview: what the company owes the employee, minus
 * what the employee owes back. Positive = a payout, negative = a recovery.
 */
export function settlementNet(preview) {
  const encash = (preview?.encashments || []).reduce((sum, e) => sum + (amount(e.amount) || 0), 0);
  const notice = amount(preview?.notice_recovery?.amount) || 0;
  const loans = (preview?.loan_recovery?.loans || []).reduce((sum, l) => sum + (amount(l.recovery_amount ?? l.outstanding_principal) || 0), 0);
  return { encash, notice, loans, net: encash - notice - loans };
}
