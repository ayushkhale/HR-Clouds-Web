// ─────────────────────────────────────────────────────────────────────────────
// PushOptInCard — the explanatory half of the two-step permission prompt, at
// the top of the Notifications page.
//
// The browser's own prompt says nothing useful ("hrclouds.in wants to show
// notifications"), is one-shot, and is refused by most people who meet it
// cold. This card is what is supposed to be read first: what the alerts are
// for, what they will not contain, and that it applies to this browser only.
// The native prompt is then raised by a press, with the answer already known.
//
// ─── THE BLOCKED STATE IS A DEAD END AND SAYS SO ───────────────────────────
// Once somebody clicks Block, `requestPermission()` resolves "denied" without
// showing anything, forever. A button there would be a control that silently
// does nothing, so the card explains where the switch actually lives instead.
//
// ─── WHAT IT PROMISES ──────────────────────────────────────────────────────
// "No amounts and no reasons" is not marketing — it is the server's contract.
// The push payload carries a title, a short body and three routing keys; the
// money and the manager's words stay in the in-app record, because a push
// renders on a lock screen. Do not soften that line without checking the
// catalog's push rules first.
// ─────────────────────────────────────────────────────────────────────────────

import { HiBell, HiVolumeOff, HiCheckCircle, HiDesktopComputer, HiLockClosed } from "react-icons/hi";
import FieldHelp from "../fieldHelp/FieldHelp";
import { PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import { InlineAlert, Spinner } from "../attendance/ui";
import { useBrowserAlerts } from "./useBrowserAlerts";

const SURFACE = "notification.browser_alerts";

export default function PushOptInCard() {
  const { state, busy, error, enable, disable } = useBrowserAlerts();
  if (state === "unavailable") return null;

  const on = state === "on";
  const blocked = state === "blocked";

  return (
    <section className="rounded-3xl border border-purple-100 shadow-xs bg-gradient-to-br from-purple-50/80 via-white to-white px-5 sm:px-6 py-5">
      <div className="flex items-start gap-4 min-w-0">
        <span className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0 shadow-xs">
          {on ? <HiCheckCircle className="w-6 h-6" /> : blocked ? <HiVolumeOff className="w-6 h-6" /> : <HiDesktopComputer className="w-6 h-6" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-sm sm:text-base font-bold text-slate-800">
              {on ? "Desktop alerts are on for this browser" : "Get alerts on your desktop"}
            </h2>
            <FieldHelp surface={SURFACE} field="push_enabled" label="desktop alerts" size="sm" />
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-2 max-w-2xl">
            {on
              ? "This browser will pop up a short alert when a decision lands, a payslip is published or work is assigned to you — even when the tab is closed. The full wording stays on this page."
              : "A short alert when a decision lands, a payslip is published or work is assigned to you, even when this tab is closed. It never carries an amount or anyone’s reason — those stay in here, where only you are looking."}
          </p>

          <p className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed mt-2 max-w-2xl">
            <HiLockClosed className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              It applies to this browser on this computer only, and it is switched off automatically when you sign out —
              so a shared machine never shows your alerts to the next person.
            </span>
          </p>

          {error && <div className="mt-4"><InlineAlert tone="rose">{error}</InlineAlert></div>}

          <div className="mt-5">
            {blocked ? (
              <InlineAlert tone="slate">
                Your browser is blocking alerts from this site, and only you can undo that: open its site settings for
                HR Clouds — usually the padlock beside the address — and set Notifications to Allow. Everything on this
                page keeps working either way.
              </InlineAlert>
            ) : on ? (
              <button type="button" onClick={disable} disabled={busy} className={SECONDARY_BTN}>
                {busy ? <Spinner className="w-4 h-4" /> : <HiVolumeOff className="w-4 h-4" />}
                {busy ? "Turning off…" : "Turn off for this browser"}
              </button>
            ) : (
              <button type="button" onClick={enable} disabled={busy} className={PRIMARY_BTN}>
                {busy ? <Spinner className="w-4 h-4" /> : <HiBell className="w-4 h-4" />}
                {busy ? "Turning on…" : "Turn on desktop alerts"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
