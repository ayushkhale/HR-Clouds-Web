// ─────────────────────────────────────────────────────────────────────────────
// state/AuthContext.jsx — the session's whole lifecycle.
//
// Ported from shared/contexts/AuthContext.jsx. What it owns:
//   • hydrating a stored session at launch (no login flash)
//   • THE ROLE GATE — a non-employee never enters the app
//   • expiring on `exp`, and re-checking when the app returns to the
//     foreground (timers don't fire reliably while a phone sleeps)
//   • expiring on a 401 from anywhere (the client's session bus)
//   • the multi-org selection flow, whose selection_token is never persisted
//   • fetching the person's NAME — a login response and a JWT carry only an
//     id, a role and an identifier, so without this the app greets people by
//     their email address
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { authAPI, onSessionExpired, isTokenExpired, tokenExpiresAt } from '../api';
import {
  clearSession, isEmployeeApp, loadSession, saveSession, sessionFromToken, workspaceForRole,
} from './session';

const AuthContext = createContext(null);

// setTimeout overflows past ~24.8 days; longer-lived tokens are re-checked on
// foreground instead.
const MAX_TIMER_MS = 2 ** 31 - 1;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until hydration finishes
  const [tokenExp, setTokenExp] = useState(null);

  // True after the session ended on its own (not via Sign out) — the login
  // screen explains why rather than just appearing.
  const [sessionExpired, setSessionExpired] = useState(false);

  // The role that was refused, for WrongWorkspaceScreen. Set only by the gate.
  const [refusedRole, setRefusedRole] = useState(null);

  // Multi-org selection. The selection token is MEMORY ONLY — it lives for
  // seconds and is never written to the Keychain.
  const [selection, setSelection] = useState(null); // { token, organizations[] }

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  /**
   * Fetch the profile and merge it into `user`. THIS IS WHAT SUPPLIES THE NAME.
   *
   * Failure is non-fatal on purpose: every screen that shows a name already
   * falls back, and a profile read that times out must not cost somebody their
   * session.
   */
  const hydrateProfile = useCallback(() => {
    authAPI.me()
      .then((res) => {
        const profile = res?.data || res?.user;
        if (!profile || !mounted.current) return;
        // Keep the SESSION's user id: /organizations/me reuses the employee
        // detail view, whose `id` may be the profile row, and a changed id
        // makes the identity check below discard this profile on the next
        // token check.
        setUser((prev) => ({ ...prev, ...profile, id: prev?.id ?? profile.id }));
      })
      .catch(() => {
        // Non-fatal. Deliberately silent — the fallbacks handle it.
      });
  }, []);

  const applyToken = useCallback((token) => {
    const session = sessionFromToken(token);
    if (!session) return false;

    // ── THE GATE ──────────────────────────────────────────────────────────────
    // Exact match, fails closed. The backend will NOT stop a wrong-workspace
    // session, because every self-service endpoint accepts every tenant role.
    if (!isEmployeeApp(session.role)) {
      setRefusedRole(session.role || 'unknown');
      clearSession();
      setIsAuthenticated(false);
      setUser(null);
      setRole(null);
      setOrgId(null);
      return false;
    }

    setRefusedRole(null);
    setIsAuthenticated(true);
    setRole(session.role);
    setOrgId(session.orgId);
    setUser((prev) => (prev?.id === session.user.id ? { ...prev, ...session.user } : session.user));
    setTokenExp(tokenExpiresAt(token));
    hydrateProfile();
    return true;
  }, [hydrateProfile]);

  const endSession = useCallback(async ({ expired = false } = {}) => {
    await clearSession();
    if (!mounted.current) return;
    setUser(null);
    setRole(null);
    setOrgId(null);
    setTokenExp(null);
    setIsAuthenticated(false);
    setSelection(null);
    setSessionExpired(expired);
  }, []);

  /* ── Launch hydration ─────────────────────────────────────────────────────
     The splash stays up until this finishes, so a returning user never sees
     the Login screen flash for 200ms — which reads as having been signed out. */
  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      if (stored?.accessToken) {
        if (isTokenExpired(stored.accessToken)) {
          await clearSession();
          if (mounted.current) setSessionExpired(true);
        } else {
          applyToken(stored.accessToken);
        }
      }
      if (mounted.current) setIsLoading(false);
    })();
  }, [applyToken]);

  /* ── Expiry: the timer, plus a foreground re-check ─────────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const check = () => {
      if (isTokenExpired()) endSession({ expired: true });
    };
    check();

    const ms = tokenExp != null ? tokenExp - Date.now() : null;
    const timer = ms != null && ms > 0 && ms < MAX_TIMER_MS ? setTimeout(check, ms + 500) : null;

    // Timers don't run reliably while the phone sleeps, so re-check whenever
    // the app comes back to the foreground.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [isAuthenticated, tokenExp, endSession]);

  /* ── Any 401 from anywhere ends the session ───────────────────────────── */
  useEffect(() => onSessionExpired(() => endSession({ expired: true })), [endSession]);

  /* ── Starting a session ───────────────────────────────────────────────── */

  // Login, org selection and org switch all answer in one of several shapes.
  const extractAuth = (res) => {
    if (!res) return null;
    const data = res.data || res;
    const userObj = data.user || res.user || (typeof data === 'object' && !data.requires_org_selection ? data : {});
    const accessToken =
      userObj?.accessToken || userObj?.access_token ||
      data?.accessToken || data?.access_token ||
      res?.accessToken || res?.access_token || data?.token || res?.token;
    const refreshToken =
      userObj?.refreshToken || userObj?.refresh_token ||
      data?.refreshToken || data?.refresh_token ||
      res?.refreshToken || res?.refresh_token;
    return { accessToken, refreshToken, user: userObj };
  };

  /**
   * Apply an auth response.
   * @returns {{ ok: boolean, needsOrg?: boolean, refused?: string }}
   */
  const startSession = useCallback(async (res) => {
    const data = res?.data || res || {};

    // Multi-org: nothing is stored, and the selection token stays in memory.
    if (data.requires_org_selection || data.selection_token) {
      setSelection({
        token: data.selection_token || data.selectionToken,
        organizations: data.organizations || data.orgs || [],
      });
      return { ok: false, needsOrg: true };
    }

    const auth = extractAuth(res);
    if (!auth?.accessToken) return { ok: false };

    // The gate runs BEFORE the token is persisted, so a refused account never
    // leaves anything on the device.
    const session = sessionFromToken(auth.accessToken);
    if (!session || !isEmployeeApp(session.role)) {
      setRefusedRole(session?.role || 'unknown');
      await clearSession();
      return { ok: false, refused: session?.role || 'unknown' };
    }

    await saveSession(auth.accessToken, auth.refreshToken);
    setSessionExpired(false);
    setSelection(null);
    setUser({ ...auth.user, ...session.user });
    setRole(session.role);
    setOrgId(session.orgId);
    setTokenExp(tokenExpiresAt(auth.accessToken));
    setIsAuthenticated(true);
    setRefusedRole(null);
    // Signing in, selecting an org and switching org all land here, and none
    // of those replies carries the person's name.
    hydrateProfile();
    return { ok: true };
  }, [hydrateProfile]);

  const login = useCallback(async (identifier, password) => {
    const res = await authAPI.login({ identifier, password });
    return startSession(res);
  }, [startSession]);

  const loginWithGoogle = useCallback(async (idToken) => {
    const res = await authAPI.googleAuth({ idToken });
    return startSession(res);
  }, [startSession]);

  const chooseOrganization = useCallback(async (orgIdToPick) => {
    if (!selection?.token) return { ok: false };
    const res = await authAPI.selectOrganization({ org_id: orgIdToPick }, selection.token);
    return startSession(res);
  }, [selection, startSession]);

  const switchOrganization = useCallback(async (orgIdToPick) => {
    const res = await authAPI.switchOrganization({ org_id: orgIdToPick });
    return startSession(res);
  }, [startSession]);

  const logout = useCallback(() => endSession({ expired: false }), [endSession]);

  const value = useMemo(() => ({
    user,
    role,
    orgId,
    workspace: workspaceForRole(role),
    isAuthenticated,
    isLoading,
    sessionExpired,
    refusedRole,
    selection,
    login,
    loginWithGoogle,
    chooseOrganization,
    switchOrganization,
    logout,
    clearRefusal: () => setRefusedRole(null),
    acknowledgeExpiry: () => setSessionExpired(false),
  }), [
    user, role, orgId, isAuthenticated, isLoading, sessionExpired, refusedRole, selection,
    login, loginWithGoogle, chooseOrganization, switchOrganization, logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
