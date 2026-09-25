import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { tokenHelper, authAPI } from "../api";
import { SESSION_EXPIRED_EVENT, TOKEN_KEY, decodeJWT } from "../api/client";

const AuthContext = createContext();

// setTimeout overflows past ~24.8 days; tokens living longer are re-checked on tab focus.
const MAX_TIMER_MS = 2 ** 31 - 1;

// Session facts carried by an access token, or null if it can't be read.
function sessionFromToken(token) {
  const decoded = decodeJWT(token);
  if (!decoded) return null;
  const role = (decoded.role || "").toLowerCase();
  const orgId = decoded.orgId || decoded.org_id || null;
  return { role: role || null, orgId, user: { id: decoded.id || decoded.sub, role, orgId } };
}

export function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until token hydration completes
  const [tokenExp, setTokenExp] = useState(null);
  // True after the session ended on its own (not via Logout) — the login page explains why.
  const [sessionExpired, setSessionExpired] = useState(false);

  // Multi-org selection state (temporary, used between login and org selection)
  const [selectionToken, setSelectionToken] = useState(null);
  const [organizations, setOrganizations] = useState([]);

  // Clear temporary org-selection state
  const clearSelectionState = useCallback(() => {
    setSelectionToken(null);
    setOrganizations([]);
    localStorage.removeItem("hrclouds_selection_token");
    localStorage.removeItem("hrclouds_organizations");
  }, []);

  /**
   * Fetch the signed-in person's profile and merge it into `user`.
   *
   * This is what supplies their NAME. A login response and a JWT both carry
   * only an id, a role and an identifier (their email) — so without this the
   * dashboard greets people by their email address until something else
   * happens to reload the app. That was the bug: only the stored-token path
   * fetched it, so the name appeared on refresh but never at sign-in.
   *
   * Failure is non-fatal on purpose. Every screen that shows a name already
   * falls back, and a profile read that times out must not cost somebody their
   * session.
   */
  const hydrateProfile = useCallback(() => {
    authAPI.me().then(res => {
      const profile = res.data || res.user;
      if (!profile) return;
      // Keep the session's own user id: /organizations/me reuses the employee
      // detail view, whose `id` may be the profile row, and a changed id makes
      // the identity check in applyStoredToken discard this profile on the
      // next token check.
      setUser(prev => ({ ...prev, ...profile, id: prev?.id ?? profile.id }));
    }).catch(err => console.error("Failed to fetch user profile", err));
  }, []);

  // Restore a signed-in session from a stored access token.
  const applyStoredToken = useCallback((token) => {
    const session = sessionFromToken(token);
    if (!session) return;
    setIsAuthenticated(true);
    setRole(session.role);
    setOrgId(session.orgId);
    setUser((prev) => (prev?.id === session.user.id ? { ...prev, ...session.user } : session.user));
    setTokenExp(tokenHelper.expiresAt(token));
    hydrateProfile();
  }, [hydrateProfile]);

  const clearSession = useCallback(() => {
    tokenHelper.clear();
    clearSelectionState();
    setUser(null);
    setRole(null);
    setOrgId(null);
    setTokenExp(null);
    setIsAuthenticated(false);
  }, [clearSelectionState]);

  const expireSession = useCallback(() => {
    clearSession();
    setSessionExpired(true);
  }, [clearSession]);

  // Hydrate from stored token on mount — tokens live in localStorage, so the
  // session survives reloads and browser restarts until the token expires.
  useEffect(() => {
    const token = tokenHelper.get();
    if (token) {
      if (tokenHelper.isExpired(token)) {
        tokenHelper.clear();
        setSessionExpired(true);
      } else {
        applyStoredToken(token);
      }
    }

    // Restore pending org-selection state if user refreshed mid-flow
    const storedSelToken = localStorage.getItem("hrclouds_selection_token");
    const storedOrgs = localStorage.getItem("hrclouds_organizations");
    if (storedSelToken) setSelectionToken(storedSelToken);
    if (storedOrgs) {
      try { setOrganizations(JSON.parse(storedOrgs)); } catch { /* ignore */ }
    }

    setIsLoading(false); // hydration done
  }, [applyStoredToken]);

  // End the session when the token reaches its `exp`, and re-check whenever the
  // tab becomes visible (timers don't run reliably while a laptop sleeps).
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const check = () => {
      const token = tokenHelper.get();
      if (token && tokenHelper.isExpired(token)) expireSession();
    };
    check();
    const ms = tokenExp != null ? tokenExp - Date.now() : null;
    const timer = ms != null && ms > 0 && ms < MAX_TIMER_MS ? setTimeout(check, ms + 500) : null;
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, tokenExp, expireSession]);

  // Any API call rejected with 401 (see client.js) ends the session.
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [expireSession]);

  // Keep tabs in sync: signing in or out in one tab applies to all of them.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== TOKEN_KEY && e.key !== null) return; // null = storage cleared
      const token = tokenHelper.get();
      if (!token) clearSession();
      else if (tokenHelper.isExpired(token)) expireSession();
      else applyStoredToken(token);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clearSession, expireSession, applyStoredToken]);

  // Helper: extract tokens and user info from any API response structure
  const extractAuthData = useCallback((res) => {
    if (!res) return null;
    const data = res.data || res;
    let userObj = data.user || res.user || (typeof data === "object" && !data.requires_org_selection ? data : {});

    const accessToken =
      userObj?.accessToken ||
      userObj?.access_token ||
      data?.accessToken ||
      data?.access_token ||
      res?.accessToken ||
      res?.access_token ||
      data?.token ||
      res?.token;

    const refreshToken =
      userObj?.refreshToken ||
      userObj?.refresh_token ||
      data?.refreshToken ||
      data?.refresh_token ||
      res?.refreshToken ||
      res?.refresh_token;

    const decoded = accessToken ? decodeJWT(accessToken) : null;
    const role = (userObj?.role || decoded?.role || "").toLowerCase();
    const orgId = userObj?.orgId || userObj?.org_id || decoded?.orgId || decoded?.org_id || null;

    const fullUser = {
      ...userObj,
      accessToken,
      refreshToken,
      role,
      orgId,
    };

    return { accessToken, refreshToken, user: fullUser, role, orgId };
  }, []);

  // Save tokens from a login / org-selection / org-switch response.
  const startSession = useCallback((res) => {
    const authData = extractAuthData(res);
    if (authData?.accessToken) {
      tokenHelper.save(authData.accessToken, authData.refreshToken);
      setUser(authData.user);
      setRole(authData.role);
      setOrgId(authData.orgId);
      setTokenExp(tokenHelper.expiresAt(authData.accessToken));
      setSessionExpired(false);
      setIsAuthenticated(true);
      // Signing in, selecting an org and switching org all land here, and none
      // of those replies carries the person's name — so ask for it now rather
      // than greeting them by their email address until the next refresh.
      hydrateProfile();
    }
    clearSelectionState();
    return authData;
  }, [extractAuthData, clearSelectionState, hydrateProfile]);

  // Full login — saves tokens, updates role
  const login = startSession;

  // After org switch/selection — replace tokens & update role
  const updateTokens = startSession;

  // Multi-org: store selection token & orgs temporarily
  const startOrgSelection = useCallback((token, orgs) => {
    setSelectionToken(token);
    setOrganizations(orgs);
    localStorage.setItem("hrclouds_selection_token", token);
    localStorage.setItem("hrclouds_organizations", JSON.stringify(orgs));
  }, []);

  // Logout — clear everything. There is no server-side logout: the backend has
  // no /auth/logout route (not in the API reference docs; POST returns 404).
  const logout = useCallback(() => {
    clearSession();
    setSessionExpired(false);
  }, [clearSession]);

  // Get the role-based dashboard path
  const getDashboardPath = useCallback((overrideRole) => {
    const r = (overrideRole || role || "").toLowerCase();
    switch (r) {
      case "hr":       return "/dashboard/hr";
      case "employee": return "/dashboard/employee";
      case "manager":  return "/dashboard/manager";
      case "guest":    return "/dashboard/guest";
      default:         return "/dashboard";
    }
  }, [role]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        orgId,
        isAuthenticated,
        isLoading,
        sessionExpired,
        selectionToken,
        organizations,
        login,
        logout,
        startOrgSelection,
        clearSelectionState,
        updateTokens,
        getDashboardPath,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
