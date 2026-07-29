import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { tokenHelper } from "../api";

const AuthContext = createContext();

// Helper: decode JWT payload (no verification — just read claims)
function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Multi-org selection state (temporary, used between login and org selection)
  const [selectionToken, setSelectionToken] = useState(null);
  const [organizations, setOrganizations] = useState([]);

  // Hydrate from stored token on mount
  useEffect(() => {
    const token = tokenHelper.get();
    if (token) {
      const decoded = decodeJWT(token);
      if (decoded) {
        setIsAuthenticated(true);
        setRole((decoded.role || "").toLowerCase() || null);
        setOrgId(decoded.orgId || decoded.org_id || null);
        setUser({
          id: decoded.id || decoded.sub,
          role: (decoded.role || "").toLowerCase(),
          orgId: decoded.orgId || decoded.org_id,
        });
      }
    }

    // Restore pending org-selection state if user refreshed mid-flow
    const storedSelToken = localStorage.getItem("hrclouds_selection_token");
    const storedOrgs = localStorage.getItem("hrclouds_organizations");
    if (storedSelToken) setSelectionToken(storedSelToken);
    if (storedOrgs) {
      try { setOrganizations(JSON.parse(storedOrgs)); } catch { /* ignore */ }
    }
  }, []);

  // Clear temporary org-selection state
  const clearSelectionState = useCallback(() => {
    setSelectionToken(null);
    setOrganizations([]);
    localStorage.removeItem("hrclouds_selection_token");
    localStorage.removeItem("hrclouds_organizations");
  }, []);

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

  // Full login — saves tokens, updates role
  const login = useCallback((res) => {
    const authData = extractAuthData(res);
    if (authData?.accessToken) {
      tokenHelper.save(authData.accessToken, authData.refreshToken);
      setUser(authData.user);
      setRole(authData.role);
      setOrgId(authData.orgId);
      setIsAuthenticated(true);
    }
    clearSelectionState();
    return authData;
  }, [extractAuthData, clearSelectionState]);

  // Multi-org: store selection token & orgs temporarily
  const startOrgSelection = useCallback((token, orgs) => {
    setSelectionToken(token);
    setOrganizations(orgs);
    localStorage.setItem("hrclouds_selection_token", token);
    localStorage.setItem("hrclouds_organizations", JSON.stringify(orgs));
  }, []);

  // Logout — clear everything
  const logout = useCallback(() => {
    tokenHelper.clear();
    clearSelectionState();
    setUser(null);
    setRole(null);
    setOrgId(null);
    setIsAuthenticated(false);
  }, [clearSelectionState]);

  // After org switch/selection — replace tokens & update role
  const updateTokens = useCallback((res) => {
    const authData = extractAuthData(res);
    if (authData?.accessToken) {
      tokenHelper.save(authData.accessToken, authData.refreshToken);
      setUser(authData.user);
      setRole(authData.role);
      setOrgId(authData.orgId);
      setIsAuthenticated(true);
    }
    clearSelectionState();
    return authData;
  }, [extractAuthData, clearSelectionState]);

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
