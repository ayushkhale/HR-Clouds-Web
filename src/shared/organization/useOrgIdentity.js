// ─────────────────────────────────────────────────────────────────────────────
// organization/useOrgIdentity.js — the signed-in organisation's name, logo,
// short name and one-line address, for the top bar every screen shows.
//
// One read of GET /organizations/details (open to every tenant role), shared by
// every top bar: the bar re-mounts on each page, and a read per navigation
// would be a request per click for three strings.
//
// Why it's built this way (keep these):
// • The logo is a presigned link that dies after a few minutes, like avatars.
//   When the <img> fails, `refreshOrgLogo()` re-reads — once a minute at most —
//   and the initials show until the fresh link arrives. Never keep `logo`
//   anywhere longer-lived than this store.
// • Company Profile's edit and logo writes answer with the whole refreshed
//   details payload; they hand it to `setOrgIdentityFrom()` so a rename or a
//   new logo shows in the top bar at once, without a second read.
// • Keyed by orgId: switching organisation reloads the page anyway, but a
//   stale identity must never show under another organisation's session.
// • A failed read is not "no name": the top bar falls back to what the login
//   already knew, and simply shows initials where the logo would be.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useSyncExternalStore } from "react";
import { organizationAPI } from "../api";

const clean = (v) => String(v ?? "").trim();
const EMPTY = { orgId: null, name: "", alias: "", address: "", place: "", logo: "", loaded: false };

let snapshot = EMPTY;
let inflight = null;
let lastRefresh = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Details payload → what the top bar shows. The address is one line, street to PIN. */
function identityFrom(details, orgId) {
  const d = details?.data ?? details ?? {};
  const org = d.organization || {};
  const profile = d.profile || {};
  return {
    orgId,
    name: clean(org.name) || clean(profile.org_name),
    alias: clean(profile.org_alias),
    address: [profile.address_line_1, profile.address_line_2, profile.city, profile.state, profile.zip_code]
      .map(clean).filter(Boolean).join(", "),
    // Phones have room for only this much.
    place: [profile.city, profile.state].map(clean).filter(Boolean).join(", "),
    logo: clean(profile.logo_url),
    loaded: true,
  };
}

function load(orgId) {
  if (!orgId || inflight) return;
  inflight = organizationAPI.getOrganizationDetails()
    .then((res) => { snapshot = identityFrom(res, orgId); })
    .catch(() => { snapshot = { ...EMPTY, orgId, loaded: true }; })
    .finally(() => { inflight = null; emit(); });
}

/** Take a fresh details payload (after an edit or a logo change). */
export function setOrgIdentityFrom(details) {
  if (!details) return;
  snapshot = identityFrom(details, snapshot.orgId);
  emit();
}

/** Re-read for a fresh logo link — at most once a minute, app-wide. */
export function refreshOrgLogo() {
  if (!snapshot.orgId || Date.now() - lastRefresh < 60_000) return;
  lastRefresh = Date.now();
  load(snapshot.orgId);
}

/** @returns {{ name: string, alias: string, address: string, place: string, logo: string, loaded: boolean }} */
export function useOrgIdentity(orgId) {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  useEffect(() => {
    if (!orgId) return;
    if (snapshot.orgId !== orgId) {
      snapshot = { ...EMPTY, orgId };
      emit();
    }
    if (!snapshot.loaded) load(orgId);
  }, [orgId]);
  return current.orgId === orgId ? current : EMPTY;
}
