// ─────────────────────────────────────────────────────────────────────────────
// employeeDirectoryStore.js — ONE copy of the organisation's people, for the
// whole app.
//
// Every dropdown, avatar, name lookup and roster table reads this store, so the
// same person looks the same on every screen. Before it, a dozen screens each
// called `GET /organizations/employees` with their own `purpose`, and the
// answers disagreed: `shift_assignment` and `all_*_list` return trimmed rows
// with NO `avatar_url`, so the same colleague had a photo on Team and initials
// in a picker; the unpaginated calls also stopped at the first page, so a
// 100-plus-person org silently lost people from its dropdowns.
//
// The one read is `purpose=emp_report&include_inactive=true`, every page
// (`fetchAllOrgEmployees`) — the widest projection there is, so nothing else
// ever needs a narrower one. Callers that want current employees only filter
// `activeRows`; they must NOT fetch again.
//
// TRAPS
// • `avatar_url` is a PRESIGNED link that dies ~5 minutes after the read
//   (30 Sep 2026), so the roster can't be held for the whole session. It is
//   re-read once it is PHOTO_TTL_MS old, and at once when a photo it handed out
//   fails to load (`markDirectoryPhotosStale`, called by GenderAvatar) — at most
//   once per RETRY_GAP_MS. The old rows keep serving meanwhile: names, codes and
//   genders never go stale.
// • Only HR and managers may read the endpoint (employees and guests get 403),
//   so for anyone else the status is "unavailable" and nothing is ever
//   requested. A manager's rows are hierarchy-scoped server-side — their direct
//   reports, PII stripped — which is exactly what a manager screen should show.
// • The rows carry PII (PAN, addresses, dates of birth): memory only, never
//   storage, never logged.
// • Keyed by the session token, so a logout, another login or an org switch
//   never serves the previous session's people.
// ─────────────────────────────────────────────────────────────────────────────

import { tokenHelper } from "../api";
import { decodeJWT } from "../api/client";
import { departmentName, personEmail, toEmployeeOption } from "../attendance/normalize";
import { avatarUrlOf, genderOf } from "../utils/personFields";
import { clearOrgEmployeesCache, fetchAllOrgEmployees } from "../utils/orgEmployees";

// Roles the endpoint accepts (organization.routes.js). Anyone else is never asked.
const READER_ROLES = new Set(["hr", "manager", "admin", "super-admin", "superadmin"]);
const PHOTO_TTL_MS = 4 * 60_000; // under the ~5 min presigned-link lifetime
const RETRY_GAP_MS = 60_000; // floor between forced re-reads

const EMPTY = Object.freeze([]);

/** @type {{token: string|null, status: "idle"|"loading"|"ready"|"error"|"unavailable", rows: object[], error: unknown, loadedAt: number, refreshing: boolean}} */
let snapshot = { token: null, status: "idle", rows: EMPTY, error: null, loadedAt: 0, refreshing: false };
let inflight = null;
let lastForced = 0;
// Bumped whenever a read is superseded (a forced refresh, a new session), so a
// slow answer can never overwrite a newer one.
let generation = 0;

const listeners = new Set();

function publish(patch) {
  const next = { ...snapshot, ...patch };
  // Don't wake the app for a no-op (ensure* runs on every consumer's mount).
  if (Object.keys(patch).every((k) => Object.is(snapshot[k], next[k]))) return;
  snapshot = next;
  listeners.forEach((notify) => notify());
}

const sessionToken = () => tokenHelper.get() || null;

const canRead = (token) => READER_ROLES.has(String(decodeJWT(token)?.role || "").toLowerCase());

export function subscribeToEmployeeDirectory(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The current snapshot. Stable between changes, so it is safe as a
 * `useSyncExternalStore` value. A snapshot from another session is never
 * served: the token is part of it and `ensureEmployeeDirectory` resets first.
 */
export const getEmployeeDirectorySnapshot = () => snapshot;

function load(token, { force }) {
  const mine = generation;
  const stale = () => mine !== generation || sessionToken() !== token;
  inflight = fetchAllOrgEmployees({ includeInactive: true, maxAgeMs: force ? 0 : undefined })
    .then((rows) => {
      if (stale()) return;
      publish({ status: "ready", rows: rows || EMPTY, error: null, loadedAt: Date.now(), refreshing: false });
    })
    .catch((error) => {
      if (stale()) return;
      // A failed REFRESH keeps the rows it already has — names are still right,
      // only the photo links have aged. Only a failed first read is an error.
      publish(snapshot.rows.length ? { refreshing: false } : { status: "error", error, refreshing: false });
    })
    .finally(() => { if (!stale()) inflight = null; });
}

/**
 * Make sure the roster is loaded, and re-read it when its photo links have
 * aged. Cheap and idempotent: every consumer calls it on mount.
 */
export function ensureEmployeeDirectory({ force = false } = {}) {
  const token = sessionToken();
  if (snapshot.token !== token) {
    inflight = null;
    lastForced = 0;
    generation += 1;
    snapshot = { token, status: "idle", rows: EMPTY, error: null, loadedAt: 0, refreshing: false };
    listeners.forEach((notify) => notify());
  }
  if (!token || !canRead(token)) return publish({ status: "unavailable" });
  if (inflight) return undefined;

  const aged = snapshot.loadedAt > 0 && Date.now() - snapshot.loadedAt > PHOTO_TTL_MS;
  if (snapshot.status === "ready" && !force && !aged) return undefined;
  // A read that failed is retried when a new screen asks, not on a timer.
  if (snapshot.status === "loading") return undefined;

  publish(snapshot.rows.length ? { refreshing: true } : { status: "loading", error: null });
  load(token, { force: force || aged });
  return undefined;
}

/**
 * Re-read the roster now, from the network. Call it after something changes who
 * is in the organisation — an invitation accepted, someone deactivated, a
 * profile edited — so every dropdown and avatar updates without a reload.
 */
export function refreshEmployeeDirectory() {
  clearOrgEmployeesCache();
  lastForced = Date.now();
  generation += 1; // whatever is in flight answers about the roster as it was
  inflight = null;
  ensureEmployeeDirectory({ force: true });
}

/**
 * A photo this store handed out failed to load — its presigned link expired.
 * Re-read rather than leaving people on the fallback illustration. Rate-limited,
 * because a list of 50 stale photos reports 50 failures at once.
 */
export function markDirectoryPhotosStale() {
  if (snapshot.status !== "ready" || Date.now() - lastForced < RETRY_GAP_MS) return;
  lastForced = Date.now();
  ensureEmployeeDirectory({ force: true });
}

// ── Derived views ────────────────────────────────────────────────────────────
// Built once per rows identity: a dozen screens read the same maps every render.

let derivedFor = null;
let derived = null;

/** One person, in the shape every picker, avatar and name lookup wants. */
function toEntry(row) {
  const option = toEmployeeOption(row);
  const department = departmentName(row);
  const designation = typeof row?.designation === "string" ? row.designation : "";
  return {
    ...option,
    email: option.email || personEmail(row),
    department,
    designation,
    role: String(row?.role || "").toLowerCase(),
    gender: genderOf(row),
    photo: avatarUrlOf(row),
    active: row?.is_active !== false && row?.status !== "inactive",
    sub: [department, designation].filter(Boolean).join(" · ") || option.email || "",
  };
}

/**
 * `{ options, activeOptions, byId, byKey }` for the given rows.
 * `byKey` is keyed by lower-cased user id AND email, so a row that names a
 * person by either resolves.
 */
export function deriveEmployeeDirectory(rows) {
  if (derivedFor === rows) return derived;
  const byId = new Map();
  const byKey = new Map();
  const options = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = toEntry(row);
    if (!entry.id || byId.has(entry.id)) continue;
    byId.set(entry.id, entry);
    options.push(entry);
    for (const key of [entry.id, entry.email, row?.id, row?.identifier]) {
      if (key) byKey.set(String(key).toLowerCase(), entry);
    }
  }
  options.sort((a, b) => a.name.localeCompare(b.name));
  derivedFor = rows;
  derived = { options, activeOptions: options.filter((o) => o.active), byId, byKey };
  return derived;
}
