// ─────────────────────────────────────────────────────────────────────────────
// attendance/liveLocationMeta.js — everything the live-location screens need to
// know about the domain, and nothing that talks to the network.
//
// ─── THE ONE WORDING RULE THAT MATTERS ─────────────────────────────────────
// NOTHING IS "VERIFIED". The server can only test whether a reported fix is
// PLAUSIBLE — it cannot prove a phone was where it said it was. Every label
// here says "reported", and the frontend guide (§1.2) is explicit that
// "Verified Live" was the single worst phrase in the first draft. If a future
// screen reintroduces the word, it is making a legal claim we cannot support.
//
// Likewise a device that never answered is UNREACHABLE, never "evading". The
// commonest cause is an iPhone the person swiped shut days ago, which Apple
// will not wake for a silent push at all (guide §4).
//
// ─── THE FOUR STATES ARE THE WHOLE STATE MACHINE ───────────────────────────
// `dispatched` is the only non-terminal one, and it is also the only one worth
// polling. `failed` means no device could even be woken at dispatch time, so it
// arrives on the FIRST response and must never be polled — a screen that polls
// it burns 30 requests to learn what it already knew.
//
// ─── WHY THERE IS NO "EXPIRED" STATE ───────────────────────────────────────
// The backend derives the timeout on read rather than sweeping for it
// (implementation plan §B.9), so a request past `expires_at` comes back as
// `timed_out` on the next poll by itself. We never flip it locally: a fix that
// landed in the last second would be thrown away by a client-side clock that
// disagrees with the server's by a few hundred milliseconds.
//
// Contract: public/ref docs/md_updates/2026-10-23_on_demand_location_tracking_frontend_guide.md
// ─────────────────────────────────────────────────────────────────────────────

/** The page and section title, in every workspace (§2 — one name everywhere). */
export const LIVE_LOCATION_TITLE = "Live Location Checks";

/**
 * The four terminal-or-not states, with the words a person reads.
 * `tone` keys are the semantic names from `enums.js`; every one of them renders
 * in a purple shade except `rose`, which is kept for the one genuine failure.
 */
export const LOCATE_STATUS = Object.freeze({
  dispatched: {
    label: "Waiting for their device",
    tone: "amber",
    live: true,
    note: "Their device has been asked. An answer usually arrives within a few seconds.",
  },
  reported: {
    label: "Location reported",
    tone: "emerald",
    live: false,
    note: "Their device answered with where it was at that moment.",
  },
  timed_out: {
    label: "Device didn’t answer",
    tone: "slate",
    live: false,
    // Said in full, because the first instinct on seeing this is to assume the
    // worst about the person rather than about the phone.
    note: "No answer came back in time. The phone may be off, out of signal, or closed — it doesn’t mean they refused.",
  },
  failed: {
    label: "Couldn’t reach any device",
    tone: "rose",
    live: false,
    note: "Nothing we could send a request to answered. They may need to sign in to the mobile app again.",
  },
});

export const statusMetaOf = (status) => LOCATE_STATUS[String(status || "").toLowerCase()] || {
  label: "Unknown", tone: "slate", live: false, note: "",
};

/** Only `dispatched` is worth another request. */
export const isLivePoll = (status) => statusMetaOf(status).live === true;

/** How often the result is re-read, and the ceiling on how long we keep trying. */
export const POLL_INTERVAL_MS = 2000;
export const DEFAULT_TIMEOUT_SECONDS = 60;
/** A hard stop even if the server sends a silly `timeout_seconds`. */
export const MAX_POLL_SECONDS = 300;

/** A last-known fix older than this is history, not an answer (guide §2.2). */
export const STALE_AFTER_MINUTES = 15;

// ─── The reason ──────────────────────────────────────────────────────────────
// 10–255 characters, trimmed. Required only when the org policy says so, but
// ALWAYS asked for: it is persisted and shown to the person in their own
// history, and a manager has no endpoint that reveals whether it was required.
export const REASON_MIN = 10;
export const REASON_MAX = 255;

/** `null` when the reason may be sent, else the sentence shown under the box. */
export function reasonProblem(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Say why you need to know where this person is.";
  if (text.length < REASON_MIN) return `Give a little more detail — at least ${REASON_MIN} characters.`;
  if (text.length > REASON_MAX) return `That's too long. Keep it under ${REASON_MAX} characters.`;
  return null;
}

// ─── Policy (HR only) ────────────────────────────────────────────────────────

/**
 * The ten keys the PUT accepts. The patch is built from THIS list rather than
 * from the form object, because anything outside it fails the whole request.
 */
export const POLICY_KEYS = Object.freeze([
  "enabled", "consent_mode", "allowed_requester_roles", "require_clocked_in",
  "require_reason", "notify_employee", "request_ttl_seconds", "cooldown_seconds",
  "max_requests_per_employee_per_day", "log_retention_days",
]);

/** Server-side bounds, mirrored so a bad number is caught before the call (§11). */
export const POLICY_BOUNDS = Object.freeze({
  request_ttl_seconds: { min: 30, max: 300 },
  cooldown_seconds: { min: 0, max: 86400 },
  max_requests_per_employee_per_day: { min: 1, max: 50 },
  log_retention_days: { min: 7, max: 730 },
});

export const CONSENT_MODES = Object.freeze([
  {
    value: "notice_only",
    label: "Tell them each time",
    description: "Their phone shows a notice whenever somebody asks. Nothing to accept — the first request works straight away.",
  },
  {
    value: "acknowledgement",
    label: "Ask them to accept first",
    description: "They have to read and accept the notice once before anyone can ask them. Until they do, every request is refused.",
  },
]);

export const REQUESTER_ROLES = Object.freeze([
  { value: "hr", label: "HR admins", description: "Can ask anyone in the organisation." },
  { value: "manager", label: "Managers", description: "Can ask only the people who report directly to them." },
]);

/** Sensible starting point when the org has no row yet (plan §B.3 defaults). */
export const POLICY_DEFAULTS = Object.freeze({
  enabled: false,
  consent_mode: "acknowledgement",
  allowed_requester_roles: ["hr", "manager"],
  require_clocked_in: true,
  require_reason: true,
  notify_employee: true,
  request_ttl_seconds: 60,
  cooldown_seconds: 300,
  max_requests_per_employee_per_day: 6,
  log_retention_days: 90,
});

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * "accurate to about 8 m". GPS accuracy is a radius, not a tolerance, and a
 * bare "±8" in a table reads as a margin of error on a number nobody can see.
 *
 * Under a metre is not precision, it is a fake-GPS app (plan §B.6) — but the
 * server decides that, so we only round sensibly and never editorialise here.
 */
export function accuracyLabel(meters, fallback = "N/A") {
  const n = Number(meters);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n < 1000) return `about ${Math.round(n)} m`;
  return `about ${(n / 1000).toFixed(1)} km`;
}

/** How wrong a fix might be, said as trust rather than as a number. */
export function accuracyConfidence(meters) {
  const n = Number(meters);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 30) return { label: "Pinpoint", tone: "emerald" };
  if (n <= 150) return { label: "Close enough", tone: "blue" };
  // Indoors, or a cell-tower fix rather than satellites. Worth saying out loud
  // before anybody treats the pin as proof of a street address.
  return { label: "Rough area only", tone: "amber" };
}

/** "4 minutes ago" / "just now" — relative, because the question is freshness. */
export function sinceLabel(value, fallback = "N/A") {
  if (!value) return fallback;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return fallback;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/**
 * Whether a last-known fix should be greyed out rather than read as current.
 * The server sends `is_stale`; this is the fallback for a row that doesn't
 * carry it (history rows don't) — gate on what the server returned first (§7).
 */
export function isStaleFix(fix) {
  if (!fix) return true;
  if (typeof fix.is_stale === "boolean") return fix.is_stale;
  const at = new Date(fix.recorded_at || fix.captured_at || 0).getTime();
  if (!Number.isFinite(at) || at === 0) return true;
  return Date.now() - at > STALE_AFTER_MINUTES * 60 * 1000;
}

/** Coordinates, to the precision a human can read without pretending to survey. */
export function coordsLabel(fix, fallback = "N/A") {
  const lat = Number(fix?.latitude);
  const lng = Number(fix?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export const hasCoords = (fix) =>
  Number.isFinite(Number(fix?.latitude)) && Number.isFinite(Number(fix?.longitude));

/** An external map, for the one thing our own map can't do: give directions. */
export function mapsLink(fix) {
  if (!hasCoords(fix)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${Number(fix.latitude)},${Number(fix.longitude)}`;
}

/**
 * Whether the fix landed inside one of the places this person may clock in
 * from. `in_bounds` is only sent when the server could resolve a geofence at
 * all, so `null`/absent means "we didn't check", which is NOT "they were
 * outside" — hence three outcomes rather than a boolean.
 */
export function boundsMeta(location) {
  if (!location || location.in_bounds == null) return null;
  return location.in_bounds
    ? { label: "At a work location", tone: "emerald" }
    : { label: "Away from any work location", tone: "amber" };
}

/** Distance from the nearest work location, in words. */
export function distanceLabel(meters, fallback = "N/A") {
  const n = Number(meters);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n < 1000) return `${Math.round(n)} m away`;
  return `${(n / 1000).toFixed(1)} km away`;
}

/**
 * The anti-spoof verdict, for the ASKER only. The subject never sees it — the
 * server withholds it from `/locations/mine` on purpose, so that nobody can
 * work out which heuristic fired and tune around it (guide §2.6).
 *
 * A flagged fix is still a fix: it is stored and shown, never dropped. The
 * backend also writes a high-severity anomaly, which is where the follow-up
 * actually happens, so this badge points there rather than offering an action.
 */
export const SPOOF_BADGE = Object.freeze({
  label: "Needs checking",
  tone: "rose",
  note: "This fix didn’t look right to our checks — it may have come from a fake-location app. It has been raised as an attendance flag for someone to look at.",
});

/** The notice every subject is entitled to read, in plain words (§6). */
export const LOCATION_NOTICE = Object.freeze({
  title: "When your location can be asked for",
  points: [
    "Only while you are clocked in — nobody can ask where you are outside your shift.",
    "Only HR and your own manager can ask, and only if your organisation allows it.",
    "Whoever asks has to say why, and you can read that reason on this page.",
    "Your phone shows you a notice every time. Nothing runs in the background between requests.",
    "Only the single position your device sends back is kept, and only for as long as your organisation's retention setting allows.",
  ],
  consentVersion: "v1",
});
