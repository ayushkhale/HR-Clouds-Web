// ─────────────────────────────────────────────────────────────────────────────
// PushOptInNudge — one line at the foot of the bell panel offering desktop
// alerts, and the soft half of the two-step prompt.
//
// It renders ONLY in the "off" state. Not when alerts are already on (nothing
// to say), not when the browser blocked them (we cannot ask again, and a
// dropdown is the wrong place to explain how to undo that — the page's card
// does it), and not when the build has no VAPID key.
//
// It asks for permission on a PRESS and never on render. The browser's prompt
// is one-shot: once somebody clicks Block we are finished for good, so it is
// only ever raised by a person who has just read what it is for. That is the
// whole reason this nudge exists instead of a `requestPermission()` on login.
// ─────────────────────────────────────────────────────────────────────────────

import { HiBell } from "react-icons/hi";
import { Spinner } from "../attendance/ui";
import { useBrowserAlerts } from "./useBrowserAlerts";

export default function PushOptInNudge() {
  const { state, busy, error, enable } = useBrowserAlerts();
  if (state !== "off" && state !== "stale") return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 bg-purple-50/40">
      <HiBell className="w-4 h-4 text-purple-500 shrink-0" aria-hidden="true" />
      <p className="flex-1 min-w-0 text-[11px] text-slate-600 leading-snug">
        {error || "Get these on your desktop, even when this tab is closed."}
      </p>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
      >
        {busy && <Spinner className="w-3 h-3" />}
        {busy ? "Turning on…" : "Turn on"}
      </button>
    </div>
  );
}
