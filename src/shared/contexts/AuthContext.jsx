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
        setRole(decoded.role || null);
        setOrgId(decoded.orgId || null);
        setUser({
          id: decoded.id || decoded.sub,
          role: decoded.role,
          orgId: decoded.orgId,
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

  // Full login — saves tokens, updates role
  const login = useCallback((userData) => {
    const { accessToken, refreshToken } = userData;
    tokenHelper.save(accessToken, refreshToken);
    const decoded = decodeJWT(accessToken);

    setUser(userData);
    setRole(userData.role || decoded?.role || null);
    setOrgId(decoded?.orgId || null);
    setIsAuthenticated(true);

    // Clear any leftover org-selection state
    clearSelectionState();
  }, []);

  // Multi-org: store selection token & orgs temporarily
  const startOrgSelection = useCallback((token, orgs) => {
    setSelectionToken(token);
    setOrganizations(orgs);
    localStorage.setItem("hrclouds_selection_token", token);
    localStorage.setItem("hrclouds_organizations", JSON.stringify(orgs));
  }, []);

  // Clear temporary org-selection state
  const clearSelectionState = useCallback(() => {
    setSelectionToken(null);
    setOrganizations([]);
    localStorage.removeItem("hrclouds_selection_token");
    localStorage.removeItem("hrclouds_organizations");
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
  const updateTokens = useCallback((userData) => {
    const { accessToken, refreshToken } = userData;
    tokenHelper.save(accessToken, refreshToken);
    const decoded = decodeJWT(accessToken);

    setUser(userData);
    setRole(userData.role || decoded?.role || null);
    setOrgId(decoded?.orgId || null);
    setIsAuthenticated(true);
    clearSelectionState();
  }, [clearSelectionState]);

  // Get the role-based dashboard path
  const getDashboardPath = useCallback((overrideRole) => {
    const r = overrideRole || role;
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
