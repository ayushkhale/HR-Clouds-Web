// ─────────────────────────────────────────────────────────────────────────────
// documents/useDocumentSettings.js — The organisation's document settings (#23),
// read once per session window and shared by every screen that wants them.
//
// HR reads them from its own plane; since PDF Phase 4 a MANAGER may read the
// same settings from `/documents/manager/settings` (they need to know whether
// letter drafting is open to them, #93). An employee has no such endpoint and
// is not asked at all — firing a known 403 on every mount of every screen that
// opens a request filled the console with failures that were never errors.
//
// A failure is swallowed and the hook simply reports nothing: every screen that
// uses these values has a sensible sentence for "we don't know yet" — the
// request dialog says "your organisation's standard window" instead of naming a
// number of days.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { documentsAPI, tokenHelper } from "../api";
import { decodeJWT } from "../api/client";

const CACHE_MS = 60_000;
// Keyed by session token: settings must not survive a logout in the same tab.
let cache = { token: null, at: 0, settings: null };

// Which read this role is allowed, or null when it has none. The two answer the
// same payload; only the mount differs.
const readerFor = (role) => {
  if (role === "hr") return () => documentsAPI.getSettings();
  if (role === "manager") return () => documentsAPI.getManagerSettings();
  return null;
};

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
    const read = readerFor(decodeJWT(token)?.role);
    // Don't ask when the answer is a known 403 (see the header).
    if (!read) return undefined;
    let alive = true;
    read()
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
