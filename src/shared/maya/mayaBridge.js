// ─────────────────────────────────────────────────────────────────────────────
// mayaBridge.js — how any screen hands Maya a question without owning her.
//
// Maya (ChatbotWidget) is lazy-loaded once in App.jsx, outside the routes, and
// keeps her input state to herself. A form's ⓘ help can't reach it by props, so
// this plain module sits between them:
//
// • askMaya() puts the question in a pending slot *and* fires an event. A bare
//   window event fired before the lazy widget has mounted is simply lost; the
//   slot is read again on mount, so the first click after a hard refresh still
//   lands. Stale asks (older than PENDING_TTL_MS) are dropped so a question
//   can't surface minutes later when Maya is shown again.
// • The widget only *pre-fills* the question — it never sends it. Nothing goes
//   to the external chatbot without the user pressing Send.
// • registerMaya() lets the widget say whether she can take a question at all
//   (mounted, not hidden from My Profile, API key configured) and how long a
//   question she accepts (the workspace's live `maxQueryLength`). The ⓘ leaves
//   the "Ask Maya" link out when she can't take *that* question — absent, not
//   broken. A question longer than the limit would otherwise be pre-filled cut
//   off mid-sentence.
// • `source` ({ surface, field }) is kept for future telemetry only. It is never
//   shown and never sent to Maya.
// • `layer` is the z-index of the dialog the question was asked from (see
//   fieldHelp/fieldHelpLayer.js). The widget raises herself just above it, so
//   a question asked from a z-170 dialog doesn't open behind that dialog.
// ─────────────────────────────────────────────────────────────────────────────

export const MAYA_ASK_EVENT = "hrclouds:maya-ask";
export const MAYA_AVAILABILITY_EVENT = "hrclouds:maya-availability";

const PENDING_TTL_MS = 30000;

let pending = null;
let available = false;
let queryLimit = 1000; // DocMind's default until the widget reports the live one

/** Queue a question for Maya to pre-fill. Returns false if there was nothing to ask. */
export function askMaya({ question, source, layer } = {}) {
  const text = typeof question === "string" ? question.trim() : "";
  if (!text) return false;
  pending = { question: text, source: source || null, layer: Number.isFinite(layer) ? layer : 0, at: Date.now() };
  window.dispatchEvent(new Event(MAYA_ASK_EVENT));
  return true;
}

/** Take the pending question, if a fresh one is waiting. Called by the widget only. */
export function consumePendingQuestion() {
  const next = pending;
  pending = null;
  if (!next || Date.now() - next.at > PENDING_TTL_MS) return null;
  return next;
}

/** The widget reports whether she can currently take a question, and how long one may be. */
export function registerMaya(next, limit) {
  const value = !!next;
  const lim = Number.isFinite(limit) && limit > 0 ? limit : queryLimit;
  if (value === available && lim === queryLimit) return;
  available = value;
  queryLimit = lim;
  window.dispatchEvent(new Event(MAYA_AVAILABILITY_EVENT));
}

/** Longest question Maya accepts right now; 0 when she can't take one at all. */
export function mayaQueryLimit() {
  return available ? queryLimit : 0;
}
