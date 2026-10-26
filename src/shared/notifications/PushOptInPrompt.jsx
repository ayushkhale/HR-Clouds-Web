// ─────────────────────────────────────────────────────────────────────────────
// PushOptInPrompt — the soft prompt that asks a signed-in browser to turn on
// alerts, and the only one of the three opt-in surfaces that speaks first.
//
// The other two wait to be found: `PushOptInCard` sits on the Notifications
// page and `PushOptInNudge` at the foot of the bell panel. Neither is any use
// to the person this is actually for — somebody who has never opened either,
// whose location checks are therefore failing with `NO_ACTIVE_DEVICE`, and who
// has no way of knowing that is happening. The web guide of 2026-10-24 asked
// for a post-login prompt for exactly that reason, and it is why this one is
// allowed to interrupt when the others are not.
//
// ─── THE RULES IT KEEPS SO IT IS A PROMPT AND NOT A NAG ────────────────────
// · IT ASKS ONCE AND REMEMBERS THE ANSWER. "Not now" buys a week; a blocked
//   browser is told once a month, because only the person can undo that and
//   being reminded daily of something you cannot fix from here is bullying.
// · IT WAITS. Appearing in the first second of a page load reads as an error.
//   It comes up after the screen has settled.
// · IT DOES NOT COVER THE WORK. Bottom LEFT — Maya owns bottom right — and it
//   never blocks the page behind it.
// · IT NEVER CALLS `requestPermission()` BY ITSELF. The browser's prompt is
//   one-shot: once somebody presses Block we are finished for good, so it is
//   only ever raised by a person who has just read what it is for.
// · IT SAYS THE CONSEQUENCE, NOT THE MECHANISM (§6). "Nobody can confirm where
//   you are" beats "your device is not registered in notification_devices".
//
// Web guide: md_updates/2026-10-24_web_notification_prompt_and_location_device_registration.md §2
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { HiBell, HiVolumeOff, HiX } from "react-icons/hi";
import { useAuth } from "../contexts/AuthContext";
import { Spinner } from "../attendance/ui";
import { useBrowserAlerts } from "./useBrowserAlerts";

const SNOOZE_KEY = "hrclouds_alert_prompt_snoozed_until";
/** "Not now" on a browser that could still say yes. */
const SNOOZE_OFF_MS = 7 * 24 * 60 * 60 * 1000;
/** A browser the person has blocked. Only their settings can change it. */
const SNOOZE_BLOCKED_MS = 30 * 24 * 60 * 60 * 1000;
/** Long enough for the page to finish arriving, short enough to still be seen. */
const APPEAR_AFTER_MS = 6_000;

function snoozed() {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function snooze(ms) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms));
  } catch {
    // Storage blocked. The prompt reappears next load; that is the failure we
    // would rather have than one that cannot be dismissed at all.
  }
}

export default function PushOptInPrompt() {
  const { isAuthenticated, role } = useAuth();
  const { pathname } = useLocation();
  const { state, busy, error, enable } = useBrowserAlerts();
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);

  // Signed in, inside the product, and not a guest — the marketing site and
  // the auth screens never see this.
  const eligible = Boolean(isAuthenticated && role && role !== "guest" && pathname.startsWith("/dashboard"));
  const askable = state === "off" || state === "stale" || state === "blocked";

  useEffect(() => {
    if (!eligible || !askable || snoozed()) return undefined;
    const timer = setTimeout(() => setReady(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [eligible, askable]);

  // Turning them on is the end of this prompt's job, for good.
  useEffect(() => {
    if (state === "on") setClosed(true);
  }, [state]);

  if (!ready || closed || !eligible || !askable) return null;

  const blocked = state === "blocked";
  const dismiss = () => {
    snooze(blocked ? SNOOZE_BLOCKED_MS : SNOOZE_OFF_MS);
    setClosed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-[23rem] z-[150]">
      <section
        role="region"
        aria-label="Turn on browser alerts"
        className="bg-white rounded-2xl border border-purple-100 shadow-2xl shadow-purple-900/10 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              {blocked ? <HiVolumeOff className="w-5 h-5" /> : <HiBell className="w-5 h-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-800 leading-snug">
                {blocked ? "Alerts are blocked in this browser" : "Turn on alerts in this browser"}
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed mt-1.5">
                {blocked
                  ? "Until they’re allowed, nobody at work can confirm where you are from this browser, and decisions on your requests won’t reach your desktop."
                  : "It takes one press, and it is what lets this browser speak for you when you’re not looking at it."}
              </p>
              {!blocked && (
                <ul className="text-[11px] text-slate-500 leading-relaxed mt-2.5 space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-purple-400 shrink-0" aria-hidden="true">•</span>
                    <span>Your manager or HR can confirm where you are while you’re on shift. Without it, they’re told you have no device set up — and your attendance can be queried.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-400 shrink-0" aria-hidden="true">•</span>
                    <span>Decisions on your leave and claims reach you as they happen, not when you next look.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-purple-400 shrink-0" aria-hidden="true">•</span>
                    <span>You hear the moment your payslip is ready.</span>
                  </li>
                </ul>
              )}
              <p className="text-[11px] text-slate-400 leading-relaxed mt-2.5">
                {blocked
                  ? "Only you can undo it: open this site’s settings — usually the padlock beside the address — and set Notifications to Allow."
                  : "Alerts never carry an amount or anyone’s reason, this browser only, and they switch off by themselves when you sign out."}
              </p>
              {error && <p className="text-xs text-rose-600 leading-relaxed mt-2.5" role="alert">{error}</p>}
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="p-1 -mt-0.5 -mr-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition cursor-pointer shrink-0"
              aria-label="Dismiss"
            >
              <HiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!blocked && (
          <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition cursor-pointer"
            >
              {busy ? <Spinner className="w-3.5 h-3.5" /> : <HiBell className="w-3.5 h-3.5" />}
              {busy ? "Turning on…" : "Turn on alerts"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-2 rounded-xl font-bold text-xs text-slate-500 hover:bg-slate-100 transition cursor-pointer"
            >
              Not now
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
