// ─────────────────────────────────────────────────────────────────────────────
// useBrowserAlerts — the state of "should this browser pop up alerts", in the
// five shapes the UI actually has to render. Both the panel nudge and the
// page's card read it, so they can never claim different things about the same
// browser.
//
// ─── WHY THE STATE IS RE-READ RATHER THAN REMEMBERED ───────────────────────
// `Notification.permission` changes from the browser's own site settings, in
// another tab, with no event to tell this page. A remembered "granted" is how
// a switch ends up showing On while the browser silently drops every alert. So
// it is re-read on mount, on tab focus and after every action.
//
// ─── THE FIVE STATES, AND WHY "unavailable" IS NOT AN ERROR ────────────────
//   unavailable — no push in this browser, or no VAPID key in this build. The
//                 UI renders NOTHING: a switch that cannot work is worse than
//                 no switch (§2 — absent, not broken).
//   off         — can be turned on. The only state with a prompt.
//   on          — subscribed and registered with the server.
//   stale       — the browser says granted but this session has no device row:
//                 a different person signed in on this machine, or storage was
//                 cleared. Turning it on again is one silent call, no prompt.
//   blocked     — the person pressed Block. We can never ask again; only their
//                 browser settings can undo it, so the UI explains instead of
//                 offering a button that does nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { disableBrowserAlerts, enableBrowserAlerts, pushSupport } from "./pushRegistration";

function readState() {
  const support = pushSupport();
  if (!support.supported || !support.configured) return "unavailable";
  if (support.permission === "denied") return "blocked";
  if (support.permission === "granted") return support.registered ? "on" : "stale";
  return "off";
}

export function useBrowserAlerts() {
  const [state, setState] = useState(readState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => setState(readState()), []);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  /** Always from a press — never from an effect (see pushRegistration.js). */
  const enable = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const result = await enableBrowserAlerts();
      if (!result.ok) setError(result.reason || "Couldn’t turn on browser alerts.");
      return result.ok;
    } catch (err) {
      setError(err?.message || "Couldn’t turn on browser alerts. Try again in a moment.");
      return false;
    } finally {
      setBusy(false);
      setState(readState());
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await disableBrowserAlerts();
      return true;
    } finally {
      setBusy(false);
      setState(readState());
    }
  }, [busy]);

  return { state, busy, error, enable, disable, refresh };
}

export default useBrowserAlerts;
