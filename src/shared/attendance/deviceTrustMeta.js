// ─────────────────────────────────────────────────────────────────────────────
// attendance/deviceTrustMeta.js — Everything Device Trust MEANS, in one place:
// the modes, the operations, the labels HR and employees read, and the small
// predicates the screens branch on. No network calls and no React, so the
// sidebar, the punch card, the employee device page and the two HR screens all
// agree on what a word means.
//
// Device Trust answers one question at punch time: "did this clock-in come from
// a device this organisation knows about?" The employee registers their laptop
// or phone once (screen lock / fingerprint, never a password), and from then on
// each punch carries a signature from it.
//
// THE RULE THAT MATTERS: branch on `effective_mode`, never on `mode`. `mode` is
// what HR configured; `effective_mode` is what is actually happening today,
// because `enforce` with an `enforce_from` in the future still behaves as
// `monitor`. Reading `mode` would block punches a fortnight early.
//
// The context read can also be ABSENT — an older server, or the feature's kill
// switch — which is not an error: `effectiveModeOf(null)` is "off", every
// predicate here answers false, and attendance behaves exactly as it did before
// this feature existed (CLAUDE.md §7: absent key, hidden feature).
//
// Contract: public/ref docs/md_attendance/8_device_trust_api_analysis.md and
// md_attendance/new_implementations/device_trust_frontend_guide.md.
// ─────────────────────────────────────────────────────────────────────────────

import { addDaysYMD, todayYMD } from "./dates.js";

// ── The four gated punch operations ─────────────────────────────────────────
// The server gates a SUBSET: an org may require a verified device to clock in
// and out but not to start a break, so membership is checked per operation.

export const DEVICE_OPERATIONS = {
  CLOCK_IN: "clock_in",
  CLOCK_OUT: "clock_out",
  BREAK_START: "break_start",
  BREAK_END: "break_end",
};

/** Policy-form order and wording. Sentences, not enum names (CLAUDE.md §6). */
export const DEVICE_OPERATION_OPTIONS = [
  { value: DEVICE_OPERATIONS.CLOCK_IN, label: "Clocking in" },
  { value: DEVICE_OPERATIONS.CLOCK_OUT, label: "Clocking out" },
  { value: DEVICE_OPERATIONS.BREAK_START, label: "Starting a break" },
  { value: DEVICE_OPERATIONS.BREAK_END, label: "Ending a break" },
];

const OPERATION_LABELS = DEVICE_OPERATION_OPTIONS.reduce((map, o) => ({ ...map, [o.value]: o.label }), {});

export const operationLabel = (value) => OPERATION_LABELS[value] || "This action";

// ── Enforcement modes ───────────────────────────────────────────────────────

export const DEVICE_MODES = { OFF: "off", MONITOR: "monitor", ENFORCE: "enforce" };

/**
 * What HR picks in the policy form. The hints say the consequence for the
 * people punching, which is the only thing that decides this setting.
 */
export const DEVICE_MODE_OPTIONS = [
  {
    value: DEVICE_MODES.OFF,
    label: "Off",
    hint: "Nobody is asked to verify a device. Clocking in works exactly as it does today.",
    tone: "slate",
  },
  {
    value: DEVICE_MODES.MONITOR,
    label: "Watch only",
    hint: "Everyone can still clock in. We record which punches came from a registered device, so you can see who is covered before making it compulsory.",
    tone: "blue",
  },
  {
    value: DEVICE_MODES.ENFORCE,
    label: "Required",
    hint: "A punch from a device that isn’t registered is refused. Anyone who hasn’t registered one cannot clock in.",
    tone: "rose",
  },
];

const MODE_META = DEVICE_MODE_OPTIONS.reduce((map, m) => ({ ...map, [m.value]: m }), {});

/** `{label, hint, tone}` for a mode, with a safe fallback for an unknown one. */
export const deviceModeMeta = (mode) => MODE_META[mode] || MODE_META[DEVICE_MODES.OFF];

// ── How a newly registered device becomes usable ────────────────────────────

export const DEVICE_APPROVALS = { OTP: "otp", HR_APPROVAL: "hr_approval" };

export const DEVICE_APPROVAL_OPTIONS = [
  {
    value: DEVICE_APPROVALS.OTP,
    label: "Code sent to the employee",
    hint: "The employee confirms with a code sent to their verified email or phone, and the device works straight away.",
  },
  {
    value: DEVICE_APPROVALS.HR_APPROVAL,
    label: "HR approves each device",
    hint: "The employee still confirms with a code, then the device waits in your approval queue and can’t clock in until you approve it.",
  },
];

const APPROVAL_LABELS = DEVICE_APPROVAL_OPTIONS.reduce((map, a) => ({ ...map, [a.value]: a.label }), {});

export const approvalLabel = (value) => APPROVAL_LABELS[value] || "N/A";

// Whether the label above is a real answer or the "N/A" fallback. A caller
// putting the label into a SENTENCE needs to know: "New devices: n/a." is not
// English, and a value this build has never heard of should drop the sentence
// rather than print a shrug in the middle of it (CLAUDE.md §7).
export const hasApprovalLabel = (value) => Boolean(APPROVAL_LABELS[value]);

// ── Platforms ───────────────────────────────────────────────────────────────
// `platform` is free-form server-side; these are the values it sends today.

const PLATFORM_LABELS = {
  web: "Computer or browser",
  android: "Android phone",
  ios: "iPhone or iPad",
};

export const platformLabel = (value) => PLATFORM_LABELS[String(value || "").toLowerCase()]
  || (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : "N/A");

export const DEVICE_PLATFORM_FILTERS = [
  { value: "", label: "All kinds" },
  { value: "web", label: "Computer or browser" },
  { value: "android", label: "Android phone" },
  { value: "ios", label: "iPhone or iPad" },
];

// ── What each status means for the person who owns the device ───────────────
// The badge itself comes from `statusMeta("device", …)` in enums.js; these are
// the sentences shown underneath it, written so they read correctly whether HR
// or the device's owner is looking.

export const DEVICE_STATUS_NOTES = {
  pending: "Waiting for HR to approve it. It can’t be used to clock in yet.",
  active: "Ready to use for clocking in and out.",
  suspended: "Temporarily blocked. HR can switch it back on.",
  revoked: "Shut off for good. The same screen lock or fingerprint can’t be registered again.",
};

export const deviceStatusNote = (status) => DEVICE_STATUS_NOTES[String(status || "").toLowerCase()] || "";

/** Only these can be used to clock in. */
export const isDeviceUsable = (device) => String(device?.status || "").toLowerCase() === "active";

// ── One person's devices, summarised for a table row ────────────────────────
// The HR inventory is a list of DEVICES; the question HR actually asks is about
// PEOPLE ("who has one and who hasn't"). These turn one person's devices into
// the three things a row has room for, and they are the only place that decides
// what "covered" means on a per-person basis: at least one `active` device.

/**
 * `{ total, active, pending, suspended, revoked, lastUsedAt, covered }` for one
 * person's devices. `null`/absent list answers all zeros rather than throwing,
 * because a person with no devices is the normal case on day one.
 */
export function summariseDevices(devices) {
  const list = Array.isArray(devices) ? devices : [];
  const count = (status) => list.filter((d) => String(d?.status || "").toLowerCase() === status).length;
  const active = count("active");
  const lastUsedAt = list.reduce((latest, d) => {
    const when = d?.last_used_at ? String(d.last_used_at) : "";
    return when > latest ? when : latest;
  }, "");
  return {
    total: list.length,
    active,
    pending: count("pending"),
    suspended: count("suspended"),
    revoked: count("revoked"),
    lastUsedAt,
    // What the coverage endpoint counts as enrolled: one device that can
    // actually punch. A pending or blocked device cannot, so it doesn't count.
    covered: active > 0,
  };
}

/**
 * One row of the per-person roster (`GET /hr/device-trust/people`, API #18),
 * in the SAME shape `summariseDevices` returns — so a table row renders
 * identically whether it was built from pre-aggregated counts or from the
 * person's real device rows, and only one set of components has to exist.
 *
 * `null` answers all-zeros: the roster includes people with no devices at all,
 * and so does the directory half of the join when the roster hasn't arrived.
 */
export function rosterSummary(row) {
  const n = (value) => Math.max(0, Math.trunc(Number(value) || 0));
  const active = n(row?.active_count);
  const pending = n(row?.pending_count);
  const suspended = n(row?.suspended_count);
  const revoked = n(row?.revoked_count);
  const counted = active + pending + suspended + revoked;
  return {
    // Trust the server's own total when it sent one: a status this build has
    // never heard of would otherwise vanish from the count.
    total: Math.max(n(row?.device_count), counted),
    active,
    pending,
    suspended,
    revoked,
    lastUsedAt: row?.last_used_at ? String(row.last_used_at) : "",
    covered: typeof row?.covered === "boolean" ? row.covered : active > 0,
  };
}

/** Shared by every person the roster hasn't answered for. Frozen — it is reused. */
export const EMPTY_DEVICE_SUMMARY = Object.freeze(rosterSummary(null));

// ── The one verdict: "can this person clock in on Monday?" ───────────────────
// These five states are a PARTITION — every person is in exactly one — and the
// four `scope` values are precisely the server's `coverage` filter (delivery
// doc §4). That is deliberate: the roster endpoint can filter server-side and
// this file can filter client-side, and the two can never disagree about who
// belongs in "No device". Change one and you must change the other.
//
// `expired` and `none` share the `none` scope on purpose. The server cannot
// tell them apart and doesn't need to, but HR does: somebody whose only device
// was shut off has to register a NEW one, which is a different sentence from
// somebody who never got round to it. Same bucket, different words.

export const COVERAGE_STATES = Object.freeze({
  covered: {
    key: "covered",
    scope: "covered",
    label: "Can clock in",
    cls: "bg-violet-50 text-violet-700 border-violet-200",
  },
  pending: {
    key: "pending",
    scope: "pending",
    label: "Waiting for you",
    cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  },
  blocked: {
    key: "blocked",
    scope: "blocked",
    label: "Blocked",
    cls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  expired: {
    key: "expired",
    scope: "none",
    label: "Needs a new one",
    cls: "bg-slate-50 text-slate-600 border-slate-200",
  },
  none: {
    key: "none",
    scope: "none",
    label: "No device",
    cls: "bg-slate-50 text-slate-500 border-slate-200",
  },
});

/**
 * `{ key, scope, label, cls }` — the single source of the verdict badge and of
 * which filter bucket a person falls in. Read in the order the server does:
 * one usable device beats everything, then a decision HR owes, then a block HR
 * can lift, then a device that is gone for good.
 */
export function coverageStateOf(summary) {
  if (!summary) return COVERAGE_STATES.none;
  if (summary.covered || summary.active > 0) return COVERAGE_STATES.covered;
  if (summary.pending > 0) return COVERAGE_STATES.pending;
  if (summary.suspended > 0) return COVERAGE_STATES.blocked;
  if (summary.revoked > 0) return COVERAGE_STATES.expired;
  return COVERAGE_STATES.none;
}

/**
 * Whoever HR has to act on first. A device waiting for a decision is the only
 * thing on this screen that is blocked on HR, so it sorts to the top; a block
 * HR can lift comes next; somebody who simply hasn't registered is the
 * employee's move, and people who can already clock in need no attention.
 */
export const COVERAGE_STATE_RANK = Object.freeze({
  pending: 0, blocked: 1, expired: 2, none: 3, covered: 4,
});

/**
 * How HR narrows the people list. "No device" is the whole reason this view
 * exists — the device inventory can never show those people, because they have
 * nothing in it. The values are the server's `coverage` filter verbatim.
 */
export const DEVICE_PEOPLE_SCOPES = [
  { value: "", label: "Everyone" },
  { value: "none", label: "No device" },
  { value: "pending", label: "Waiting for approval" },
  { value: "covered", label: "Has a working device" },
  { value: "blocked", label: "Blocked" },
];

/** Does one person's summary belong in this scope? */
export function matchesDeviceScope(summary, scope) {
  if (!scope) return true;
  return coverageStateOf(summary).scope === scope;
}

// ── Audit events (HR) ───────────────────────────────────────────────────────
// `action` values the events endpoint emits. The two gate rows are the point of
// the pilot: `device_gate_monitor` is a punch that WOULD have been refused once
// the mode is `Required`, and `device_gate_blocked` is one that was refused.

const EVENT_ACTIONS = {
  device_registered: { label: "Device registered", tone: "blue" },
  device_approved: { label: "Approved by HR", tone: "emerald" },
  device_rejected: { label: "Rejected by HR", tone: "rose" },
  device_revoked: { label: "Shut off", tone: "rose" },
  device_suspended: { label: "Blocked for now", tone: "amber" },
  device_reinstated: { label: "Switched back on", tone: "emerald" },
  device_verification_failed: { label: "Device check failed", tone: "rose" },
  device_gate_blocked: { label: "Punch refused", tone: "rose" },
  device_gate_monitor: { label: "Would have been refused", tone: "amber" },
  device_policy_updated: { label: "Settings changed", tone: "purple" },
};

/** `{label, tone}` for an audit action, falling back to a prettified code. */
export function deviceEventMeta(action) {
  const key = String(action || "").toLowerCase();
  if (EVENT_ACTIONS[key]) return { key, ...EVENT_ACTIONS[key] };
  const label = key.replace(/^device_/, "").replace(/_+/g, " ").trim();
  return { key, label: label ? label.charAt(0).toUpperCase() + label.slice(1) : "N/A", tone: "slate" };
}

export const DEVICE_EVENT_FILTERS = [
  { value: "", label: "Everything" },
  { value: "device_gate_blocked", label: "Punches refused" },
  { value: "device_gate_monitor", label: "Would have been refused" },
  { value: "device_verification_failed", label: "Device checks that failed" },
  { value: "device_registered", label: "Devices registered" },
  { value: "device_revoked", label: "Devices shut off" },
  { value: "device_policy_updated", label: "Settings changes" },
];

// ── Reading the context ─────────────────────────────────────────────────────

/**
 * The mode that is ACTUALLY in force right now. `null`/absent context, or the
 * feature switched off globally, both read as "off" so every caller has one
 * branch for "behave exactly as before".
 * @param {object|null} ctx response data of GET /device-trust/context
 */
export function effectiveModeOf(ctx) {
  if (!ctx || ctx.enabled === false) return DEVICE_MODES.OFF;
  const mode = String(ctx.effective_mode || "").toLowerCase();
  return mode === DEVICE_MODES.MONITOR || mode === DEVICE_MODES.ENFORCE ? mode : DEVICE_MODES.OFF;
}

/** Is this one punch gated? Both the mode and the operation list must say yes. */
export function isOperationEnforced(ctx, operation) {
  if (effectiveModeOf(ctx) === DEVICE_MODES.OFF) return false;
  const ops = ctx?.enforced_operations;
  // Absent list → nothing is gated. Never assume the full set: that would
  // prompt for a fingerprint on an operation the server ignores proof for.
  return Array.isArray(ops) && ops.includes(operation);
}

/**
 * Should the device screens and the "My Registered Devices" menu entry exist at all?
 *
 * ONE CONDITION ONLY: the feature answered. A context that read as absent, or
 * says the feature is switched off for this caller, hides every trace of it
 * (§7); anything else shows the page.
 *
 * It deliberately does NOT require the mode to be on, which it did until
 * 15 Oct 2026. Registering has to come BEFORE enforcing — HR is told to reach
 * safe coverage while the mode is still Off or Watch only — so gating the menu
 * entry on the mode hid the page from everybody who had nothing registered
 * yet, which is everybody, on the one screen that fixes it. The punch card's
 * own nudge still only appears when a device is actually needed.
 */
export function deviceTrustVisible(ctx) {
  return !!ctx && ctx.enabled !== false;
}

/** At the cap, registering anything new has to replace an existing device. */
export function atDeviceCap(ctx) {
  const max = Number(ctx?.max_active_devices);
  if (!Number.isFinite(max) || max <= 0) return false;
  return Number(ctx?.my_active_device_count || 0) >= max;
}

/** The soft `monitor` banner only makes sense while there is a date to beat. */
export function enforceFromUpcoming(ctx) {
  const from = ctx?.enforce_from;
  return from && String(from) > todayYMD() ? String(from) : null;
}

// ── Rollout numbers ─────────────────────────────────────────────────────────

/** Below this, switching to Required locks people out (frontend guide §5). */
export const COVERAGE_SAFE_PERCENT = 95;

/**
 * Two weeks out, the default the guide asks for: a date HR has to deliberately
 * bring forward, rather than one that blocks the uncovered half tomorrow.
 */
export const defaultEnforceFrom = () => addDaysYMD(todayYMD(), 14);

// ── Copy that would otherwise be typed on several screens ───────────────────

/** The three labelled punch steps. Undifferentiated spinners get double-tapped. */
export const DEVICE_PROGRESS = {
  challenge: "Checking this device…",
  ceremony: "Confirm it’s you on your device",
};

/**
 * `DEVICE_NOT_HARDWARE_BOUND` is the one failure nobody can diagnose: the
 * browser made a passkey that syncs to every device the person owns, so it
 * can’t prove WHICH device punched. It gets a screen, not a toast
 * (frontend guide §6.3).
 */
export const SYNCED_PASSKEY_HELP = {
  title: "This device couldn’t be registered",
  body: "The screen lock your browser offered is synced to your other devices, so it can’t be used to prove that a punch came from this one.",
  steps: [
    "On Windows: choose Windows Hello when asked, not “Save to your Google account”.",
    "On Mac or iPhone: turn off iCloud Passwords for this step, or use a security key.",
    "Still stuck? HR can register a device for you.",
  ],
};

/**
 * Browser and OS out of a User-Agent string. Order matters: Edge and Opera both
 * carry `Chrome/`, and every Chromium browser carries `Safari/`, so the most
 * specific test has to run first. `""` for anything unrecognised — this never
 * guesses, because the answer is shown to HR as fact.
 */
function parseUserAgent(ua) {
  const s = String(ua || "");
  const browser = /Edg\/|EdgiOS\/|Edge\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
      : /Firefox\/|FxiOS\//.test(s) ? "Firefox"
        : /CriOS\/|Chrome\//.test(s) ? "Chrome"
          : /Safari\//.test(s) ? "Safari"
            : "";
  const os = /Windows/.test(s) ? "Windows"
    : /Android/.test(s) ? "Android"
      : /iPad/.test(s) ? "iPad"
        : /iPhone|iPod/.test(s) ? "iPhone"
          : /Macintosh|Mac OS X/.test(s) ? "Mac"
            : /Linux|X11|CrOS/.test(s) ? "Linux"
              : "";
  return { browser, os };
}

/**
 * `last_user_agent` as something HR can read — "Chrome on Windows" rather than
 * 120 characters of `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit…`.
 * The raw string is NEVER shown: it is noise to the only people who see this
 * screen, and it is long enough to break a detail grid.
 *
 * Available on device rows since 22 Oct 2026 (delivery doc §2); absent on
 * anything older, which is why the fallback is a caller's decision (§7).
 */
export function describeUserAgent(ua, fallback = "N/A") {
  const { browser, os } = parseUserAgent(ua);
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || fallback;
}

/**
 * "Chrome on Windows · 103.21.124.5" — the two things that say where a punch
 * came from, as one line. Either half can be missing on a row written before
 * the telemetry existed, so whatever is known is shown and "N/A" means nothing
 * is, never that the device was never used (§5).
 */
export function lastSeenFrom(device) {
  const parts = [describeUserAgent(device?.last_user_agent, ""), device?.last_ip].filter(Boolean);
  return parts.length ? parts.join(" · ") : "N/A";
}

/**
 * A default name for the device being registered. Derived from the browser, 1–100
 * characters, and editable — a raw User-Agent string is never sent as a name.
 * Unlike `describeUserAgent` this one has to produce *something* typeable, so an
 * unrecognised browser becomes the generic "Browser" rather than nothing.
 */
export function suggestDeviceName() {
  const { browser, os } = parseUserAgent(typeof navigator === "undefined" ? "" : navigator.userAgent);
  const named = browser || "Browser";
  return (os ? `${named} on ${os}` : named).slice(0, DEVICE_NAME_MAX);
}

export const DEVICE_NAME_MAX = 100;

/** The reason box on every lifecycle action. Server rule, shown before it bites. */
export const DEVICE_REASON_MIN = 3;
export const DEVICE_REASON_MAX = 500;
