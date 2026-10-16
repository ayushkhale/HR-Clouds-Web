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
 * How HR narrows the people list. "No device" is the whole reason this view
 * exists — the device inventory can never show those people, because they have
 * nothing in it.
 */
export const DEVICE_PEOPLE_SCOPES = [
  { value: "", label: "Everyone" },
  { value: "none", label: "No device" },
  { value: "pending", label: "Waiting for approval" },
  { value: "covered", label: "Has a working device" },
  { value: "blocked", label: "Blocked or shut off" },
];

/** Does one person's summary belong in this scope? */
export function matchesDeviceScope(summary, scope) {
  switch (scope) {
    case "none": return summary.total === 0;
    case "pending": return summary.pending > 0;
    case "covered": return summary.covered;
    case "blocked": return summary.suspended > 0 || summary.revoked > 0;
    default: return true;
  }
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
 * A default name for the device being registered. Derived from the browser, 1–100
 * characters, and editable — a raw User-Agent string is never sent as a name.
 */
export function suggestDeviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
      : /Chrome\//.test(ua) ? "Chrome"
        : /Safari\//.test(ua) ? "Safari"
          : /Firefox\//.test(ua) ? "Firefox"
            : "Browser";
  const os = /Windows/.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac"
      : /Android/.test(ua) ? "Android"
        : /iPhone|iPad|iPod/.test(ua) ? "iPhone"
          : /Linux/.test(ua) ? "Linux"
            : "";
  return (os ? `${browser} on ${os}` : browser).slice(0, 100);
}

export const DEVICE_NAME_MAX = 100;

/** The reason box on every lifecycle action. Server rule, shown before it bites. */
export const DEVICE_REASON_MIN = 3;
export const DEVICE_REASON_MAX = 500;
