// ─────────────────────────────────────────────────────────────────────────────
// PushOptInCard — Compact, dismissible desktop alerts banner.
//
// ─── STREAMLINED DENSITY ────────────────────────────────────────────────────
// 1. When blocked (permission denied): Renders a compact warning bar (~52px)
//    with a "How to unblock" guide toggle and a dismiss (×) button saved in localStorage.
// 2. When off (permission default): Renders a compact single-line card (~56px)
//    with concise copy, an "Enable desktop alerts" CTA, and a dismiss button.
// 3. When on (permission granted): Hides the full-width promotional card completely,
//    reclaiming ~150–210px of prime above-the-fold vertical space.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiBell, HiVolumeOff, HiCheckCircle, HiDesktopComputer, HiX } from "react-icons/hi";
import { Spinner } from "../attendance/ui";
import { useBrowserAlerts } from "./useBrowserAlerts";

export const DESKTOP_ALERT_DISMISSED_KEY = "hrclouds_desktop_alert_banner_dismissed";

export function DesktopAlertsStatusToggle() {
  const { state, busy, enable, disable } = useBrowserAlerts();
  if (state === "unavailable") return null;

  const on = state === "on";
  return (
    <button
      type="button"
      onClick={on ? disable : enable}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
        on
          ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
      title={on ? "Desktop alerts are on. Click to turn off." : "Click to turn on desktop alerts."}
      aria-label={on ? "Desktop alerts: On" : "Desktop alerts: Off"}
    >
      {busy ? (
        <Spinner className="w-3.5 h-3.5" />
      ) : on ? (
        <HiCheckCircle className="w-4 h-4 text-purple-600" />
      ) : (
        <HiBell className="w-4 h-4 text-slate-400" />
      )}
      <span className="hidden sm:inline">Desktop alerts:</span>
      <strong className="font-bold">{on ? "On" : "Off"}</strong>
    </button>
  );
}

export default function PushOptInCard() {
  const { state, busy, error, enable } = useBrowserAlerts();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DESKTOP_ALERT_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [showGuide, setShowGuide] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DESKTOP_ALERT_DISMISSED_KEY, "true");
    } catch {
      // Ignore private browsing restrictions
    }
  };

  // If unavailable, already granted (on), or dismissed by user -> don't show full banner
  if (state === "unavailable" || state === "on" || dismissed) return null;

  const blocked = state === "blocked";

  // State B: Blocked in browser -> compact collapsible warning bar
  if (blocked) {
    return (
      <section
        aria-label="Desktop notification settings"
        className="rounded-2xl border border-purple-100 bg-purple-50/40 p-3 sm:px-4 sm:py-3 text-xs shadow-xs"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <HiVolumeOff className="w-4 h-4" />
            </span>
            <p className="font-semibold text-slate-800 truncate text-xs sm:text-[13px]">
              Desktop alerts are blocked by your browser.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="text-xs font-bold text-purple-700 hover:text-purple-800 underline underline-offset-2 cursor-pointer"
            >
              {showGuide ? "Hide instructions" : "How to unblock"}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition cursor-pointer"
              aria-label="Dismiss blocked notification banner"
              title="Dismiss"
            >
              <HiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showGuide && (
          <div className="mt-2.5 pt-2.5 border-t border-purple-100 text-slate-600 leading-relaxed text-[11px] sm:text-xs">
            Open your browser&apos;s site settings for HR Clouds (click the lock or tune icon beside the address bar) and set <strong>Notifications</strong> to <strong>Allow</strong>. Everything on this page continues to work either way.
          </div>
        )}
      </section>
    );
  }

  // State A: Default / Off -> compact promotional row
  return (
    <section
      aria-label="Desktop notification promotion"
      className="rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50/80 via-white to-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
            <HiDesktopComputer className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              Get instant desktop alerts
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate max-w-xl">
              Private alerts for approvals, payslips, and assigned work — automatically off when you sign out.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {error && <span className="text-[11px] text-rose-600 font-semibold">{error}</span>}
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition cursor-pointer"
          >
            {busy ? <Spinner className="w-3.5 h-3.5" /> : <HiBell className="w-3.5 h-3.5" />}
            {busy ? "Turning on…" : "Enable desktop alerts"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            aria-label="Dismiss desktop alert prompt"
            title="Dismiss"
          >
            <HiX className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
