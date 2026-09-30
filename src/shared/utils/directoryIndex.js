// ─────────────────────────────────────────────────────────────────────────────
// directoryIndex.js — A person's gender and photo by user id or email, for
// avatars on rows that don't carry them.
//
// Attendance records, flags, exports and invitations named a person without
// their gender, so `GenderAvatar` fell back to initials there while the Team
// page — whose rows do carry it — showed the illustration, and the same person
// looked different from one screen to the next. The backend added gender to
// those rows on 29 Sep 2026 (R-5); this stays for older servers and for rows
// the fix didn't reach, and is skipped whenever the row already has it. This fills the gap from
// the organisation directory that a dozen screens already load
// (`fetchAllOrgEmployees`, cached and shared per session), so it usually costs
// no extra request at all.
//
// Only the two avatar fields are kept: the directory rows also hold PII (PAN,
// addresses, dates of birth) and nothing here needs it. Only HR and managers
// can read the directory; for anyone else, and after any failure, avatars keep
// their initials and nothing is retried.
//
// PHOTOS EXPIRE (30 Sep 2026). Uploaded photos come back as presigned links
// that die ~5 minutes after the read, so the index can't be kept for the whole
// session any more. It is re-read once it is PHOTO_TTL_MS old — the old copy
// keeps serving meanwhile, and genders never go stale — and at once when a
// photo it handed out fails to load (`markDirectoryPhotosStale`, called by
// GenderAvatar), at most once per RETRY_GAP_MS.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { decodeJWT, tokenHelper } from "../api/client";
import { fetchAllOrgEmployees } from "./orgEmployees";

const ROLES_WITH_DIRECTORY = new Set(["hr", "manager"]);
const PHOTO_TTL_MS = 4 * 60_000;
const RETRY_GAP_MS = 60_000;

let state = { token: null, index: null, promise: null, failed: false, loadedAt: 0, lastForced: 0 };
const listeners = new Set();

function build(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const entry = {
      gender: row?.gender ?? row?.profile?.gender ?? null,
      photo: row?.avatar_url ?? row?.profile?.avatar_url ?? null,
    };
    if (!entry.gender && !entry.photo) continue;
    for (const key of [row?.user_id, row?.id, row?.email, row?.identifier]) {
      if (key) index.set(String(key).toLowerCase(), entry);
    }
  }
  return index;
}

function ensureLoaded({ force = false } = {}) {
  const token = tokenHelper.get();
  if (state.token !== token) state = { token, index: null, promise: null, failed: false, loadedAt: 0, lastForced: 0 };
  const stale = force || (state.index && Date.now() - state.loadedAt > PHOTO_TTL_MS);
  if (!token || state.promise || state.failed || (state.index && !stale)) return;
  if (!ROLES_WITH_DIRECTORY.has(decodeJWT(token)?.role)) { state.failed = true; return; }
  // A refresh must not be answered from the shared roster cache's older copy.
  state.promise = fetchAllOrgEmployees(stale ? { maxAgeMs: 0 } : undefined)
    .then((rows) => { if (state.token === token) { state.index = build(rows); state.loadedAt = Date.now(); } })
    // A failed refresh keeps the old index (genders are still right); only a
    // failed first load gives up for the session.
    .catch(() => { if (state.token === token && !state.index) state.failed = true; })
    .finally(() => {
      if (state.token === token) state.promise = null;
      listeners.forEach((notify) => notify());
    });
}

/**
 * A photo from the index failed to load — its presigned link has expired.
 * Re-read the directory now rather than waiting for the timer.
 */
export function markDirectoryPhotosStale() {
  if (!state.index || Date.now() - state.lastForced < RETRY_GAP_MS) return;
  state.lastForced = Date.now();
  ensureLoaded({ force: true });
}

/**
 * The directory entry `{ gender, photo }` for the first of `keys` (user ids or
 * emails) it knows, or null. Loads the directory lazily, and only when
 * `enabled` — an avatar that already has a gender or photo never asks.
 */
export function useDirectoryEntry(keys, enabled) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const notify = () => rerender((n) => n + 1);
    listeners.add(notify);
    ensureLoaded();
    return () => { listeners.delete(notify); };
  }, [enabled]);
  if (!enabled || !state.index) return null;
  for (const key of keys) {
    const hit = state.index.get(String(key).toLowerCase());
    if (hit) return hit;
  }
  return null;
}
