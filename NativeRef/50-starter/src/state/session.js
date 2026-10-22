// ─────────────────────────────────────────────────────────────────────────────
// state/session.js — the role gate, and the Keychain.
//
// THE MOST IMPORTANT FILE IN THE APP.
//
// Every self-service endpoint behind every screen is authorised for EVERY
// tenant role — super-admin, admin, hr, manager, employee. So the backend will
// happily serve an HR admin a complete employee experience. It will not stop
// you. That is exactly how HR once walked the employee tabs on the web app
// (2026-10-01), and this gate is what prevents it here.
//
// ONE ROLE, ONE WORKSPACE. The check is EXACT, not cumulative, and it FAILS
// CLOSED: an unknown role is refused. When the manager app arrives it gets its
// own tab set behind this same gate — never a widening of this one.
// ─────────────────────────────────────────────────────────────────────────────

import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setToken, clearToken, decodeJWT } from '../api/client';
import { clearDownloadCache } from '../api/files';
import { clearDirectoryCache } from '../hooks/useDirectory';

/* ─── Roles and workspaces ────────────────────────────────────────────────── */

export function normalizeRole(role) {
  return (role || '').toString().trim().toLowerCase();
}

// Lower number = higher privilege. Mirrors the backend hierarchy.
export const ROLE_PRIORITY = {
  'super-admin': 0, admin: 1, hr: 2, manager: 3, employee: 4, guest: 9,
};

const ROLE_LABELS = {
  'super-admin': 'Platform Admin',
  admin: 'Admin',
  hr: 'HR Admin',
  manager: 'Manager',
  employee: 'Employee',
  guest: 'Guest',
};

/** "hr" → "HR Admin". An unknown or missing role gives "", never a raw code. */
export function roleLabel(role) {
  const r = normalizeRole(role);
  return ROLE_LABELS[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : '');
}

const WORKSPACE_OF_ROLE = {
  'super-admin': 'hr',
  admin: 'hr',
  hr: 'hr',
  manager: 'manager',
  employee: 'employee',
  guest: 'guest',
};

/** The ONE workspace a role belongs to, or null for a role the app doesn't know. */
export function workspaceForRole(role) {
  return WORKSPACE_OF_ROLE[normalizeRole(role)] || null;
}

/** The workspace THIS app is. Change this, and the gate, to build another app. */
export const APP_WORKSPACE = 'employee';

/**
 * May this role use this app? Exact match only; an unknown role is refused.
 *
 * On `false` the caller must CLEAR THE TOKEN and show WrongWorkspaceScreen —
 * not hide controls and carry on, and not enter the app "read-only".
 */
export function isEmployeeApp(role) {
  return workspaceForRole(role) === APP_WORKSPACE;
}

/** The copy for the refusal screen. One sentence, names the role, offers a way on. */
export function wrongWorkspaceCopy(role) {
  const label = roleLabel(role);
  return {
    title: 'This app is for employees',
    message: label
      ? `Your account is ${/^[AEIOU]/i.test(label) ? 'an' : 'a'} ${label} account. Sign in at hrclouds.in to use that workspace.`
      : 'We couldn’t tell which workspace your account belongs to. Sign in at hrclouds.in, or contact your administrator.',
  };
}

/* ─── API capability tiers — NOT app access ───────────────────────────────────
   Which roles the BACKEND lets call an endpoint family. Cumulative on purpose
   (HR may punch in like anyone), and they decide whether a control is offered
   INSIDE a screen. They must never decide who renders the app. */

const ORG_MEMBER_ROLES = ['super-admin', 'admin', 'hr', 'manager', 'employee'];
const TEAM_LEAD_ROLES = ['super-admin', 'admin', 'hr', 'manager'];

export const canSelfServeAttendance = (role) => ORG_MEMBER_ROLES.includes(normalizeRole(role));
export const canManageTeamAttendance = (role) => TEAM_LEAD_ROLES.includes(normalizeRole(role));
/** Employees and guests get a 403 on /organizations/employees — see api/organization.api.js. */
export const canReadRoster = (role) => TEAM_LEAD_ROLES.includes(normalizeRole(role));

/* ─── Session facts from a token ──────────────────────────────────────────── */

/** Session facts carried by an access token, or null if it can't be read. */
export function sessionFromToken(token) {
  const decoded = decodeJWT(token);
  if (!decoded) return null;
  const role = normalizeRole(decoded.role);
  const orgId = decoded.orgId || decoded.org_id || null;
  return { role: role || null, orgId, user: { id: decoded.id || decoded.sub, role, orgId } };
}

/* ─── Keychain ────────────────────────────────────────────────────────────────
   The access token is a bearer credential to payroll data. It lives in the
   Keychain / Keystore, never in AsyncStorage.

   The short-lived multi-org `selection_token` is NOT stored at all — it lives
   for seconds and writing it to disk is pure risk. It is held in React state
   during the selection flow and dropped. */

const SERVICE = 'in.hrclouds.employee.session';

export async function saveSession(accessToken, refreshToken) {
  if (!accessToken) return;
  await Keychain.setGenericPassword(
    'hrclouds',
    JSON.stringify({ accessToken, refreshToken: refreshToken || null }),
    {
      service: SERVICE,
      // The session must survive a reboot, so the token is not bound to a
      // biometric unlock here. The optional app lock (phase 8) is a separate,
      // explicit feature — don't conflate the two.
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    },
  );
  setToken(accessToken);
}

/** Read the stored session and prime the in-memory token cache. */
export async function loadSession() {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    if (!creds) return null;
    const parsed = JSON.parse(creds.password);
    if (!parsed?.accessToken) return null;
    setToken(parsed.accessToken);
    return parsed;
  } catch {
    // A corrupt or unreadable entry is treated as no session, not as an error
    // worth showing — the person simply signs in again.
    return null;
  }
}

/**
 * Sign out, completely. Everything that could outlive the session goes:
 * the Keychain entry, the in-memory token, cached preferences, the people
 * directory, and any downloaded payslip in the cache directory.
 */
export async function clearSession() {
  clearToken();
  await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
  await AsyncStorage.multiRemove([
    'hrclouds_attendance_work_mode',
    'hrclouds_last_tab',
  ]).catch(() => {});
  clearDirectoryCache();
  await clearDownloadCache().catch(() => {});
}
