// ─────────────────────────────────────────────────────────────────────────────
// documents/recentLetterBatches.js — The handles this browser has been given to
// bulk-letter batches (#143 → #144).
//
// This exists because of a hole in the contract rather than as a convenience.
// #143 hands back a batch id; #144 answers about that id; and there is NO
// endpoint that lists an organisation's batches. So the id is the only way back
// to a batch that is still running, and a batch of two hundred letters is drawn
// by a worker that wakes every fifteen minutes. Without this, closing the dialog
// — or reloading the page — would make a batch that is still going unreachable,
// with no way to see which of the two hundred failed.
//
// What is kept is deliberately thin: the id, which letter it was, how many
// people, and when. No names, no counts that go stale, nothing about anybody's
// record. The id is a handle and is never rendered (CLAUDE.md §4).
//
// Held per signed-in user so a shared machine never shows one person's batches
// to the next, and dropped after a week — by then the batch is long finished and
// the register is the place to look.
// ─────────────────────────────────────────────────────────────────────────────

import { tokenHelper } from "../api";
import { decodeJWT } from "../api/client";

const KEY = "hrclouds_letter_batches_v1";
const MAX_KEPT = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Who these belong to. Falls back to a constant so a token we can't read still works. */
function owner() {
  const claims = decodeJWT(tokenHelper.get() || "");
  return String(claims?.id || claims?.user_id || claims?.sub || "anon");
}

/** Every read is guarded: storage throws in private mode and can come back malformed. */
function readAll() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(next) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full, or blocked. The batch is still reachable in this tab from
    // the dialog that created it, so there is nothing to tell anybody.
  }
}

const isFresh = (row) => Number.isFinite(Number(row?.at)) && Date.now() - Number(row.at) < TTL_MS;

/** The batches this user has started, newest first. */
export function recentLetterBatches() {
  const all = readAll();
  const rows = Array.isArray(all[owner()]) ? all[owner()] : [];
  return rows.filter((row) => row && typeof row.id === "string" && row.id && isFresh(row)).slice(0, MAX_KEPT);
}

/** Remember a batch that has just been queued, or refresh one already known. */
export function rememberLetterBatch({ id, templateCode = "", templateTitle = "", total = 0 }) {
  if (!id) return;
  const all = readAll();
  const key = owner();
  const existing = (Array.isArray(all[key]) ? all[key] : []).filter((row) => row?.id !== id && isFresh(row));
  all[key] = [{ id, templateCode, templateTitle, total: Number(total) || 0, at: Date.now() }, ...existing].slice(0, MAX_KEPT);
  writeAll(all);
}

/** Drop one batch — it finished and was acknowledged, or its id no longer resolves. */
export function forgetLetterBatch(id) {
  if (!id) return;
  const all = readAll();
  const key = owner();
  all[key] = (Array.isArray(all[key]) ? all[key] : []).filter((row) => row?.id !== id);
  writeAll(all);
}
