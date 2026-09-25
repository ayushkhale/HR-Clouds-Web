// ─────────────────────────────────────────────────────────────────────────────
// documents/useDocumentSettings.js — The organisation's document settings (#23),
// read once per session window and shared by every screen that wants them.
//
// Only HR may read this endpoint, so a manager or an employee calling it gets a
// 403. That is not a fault worth reporting anywhere: every screen that uses
// these values has a sensible sentence for "we don't know yet" — the request
// dialog says "your organisation's standard window" instead of naming a number
// of days. So a failure is swallowed and the hook simply reports nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { documentsAPI, tokenHelper } from "../api";

const CACHE_MS = 60_000;
// Keyed by session token: settings must not survive a logout in the same tab.
let cache = { token: null, at: 0, settings: null };

const fresh = () => cache.token === (tokenHelper.get() || "") && Date.now() - cache.at < CACHE_MS;

/** Drop the cache after HR saves the settings. */
export function invalidateDocumentSettings() {
  cache = { token: null, at: 0, settings: null };
}

/**
 * @returns {{ settings: object|null, requestDueDays: number|undefined }}
 *   `requestDueDays` is the org's default request window (#77), or undefined
 *   when it isn't known — which callers must render as words, not as a number.
 */
export default function useDocumentSettings() {
  const [settings, setSettings] = useState(() => (fresh() ? cache.settings : null));

  useEffect(() => {
    if (fresh()) {
      setSettings(cache.settings);
      return undefined;
    }
    const token = tokenHelper.get() || "";
    let alive = true;
    documentsAPI.getSettings()
      .then((res) => {
        const data = res?.data ?? null;
        cache = { token, at: Date.now(), settings: data };
        if (alive) setSettings(data);
      })
      .catch(() => {
        // Not readable by this role, or not reachable. Either way there is
        // nothing for a screen to do about it, so it stays quiet.
      });
    return () => { alive = false; };
  }, []);

  const days = Number(settings?.document_request_default_due_days);
  return { settings, requestDueDays: Number.isFinite(days) ? days : undefined };
}
