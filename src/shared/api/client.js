// ─────────────────────────────────────────────────────────────────────────────
// client.js — Core network client for HR Clouds
// All domain API modules import `request` and `tokenHelper` from here.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://development.hrclouds.in/api/v1";

// const BASE_URL = "http://192.168.29.131:4500/api/v1";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN HELPERS — localStorage access / refresh token management
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_KEY = "hrclouds_token";
const REFRESH_TOKEN_KEY = "hrclouds_refresh_token";

// Fired when the stored session stops being valid (401 or token past `exp`).
export const SESSION_EXPIRED_EVENT = "hrclouds:session-expired";

// Decode a JWT payload without verifying it — just to read claims.
// JWTs are base64url (plain atob() rejects "-" / "_") holding UTF-8 JSON, so
// names with non-ASCII characters need a real UTF-8 decode.
export function decodeJWT(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

export const tokenHelper = {
  save(accessToken, refreshToken) {
    if (accessToken && accessToken !== "undefined" && accessToken !== "null") {
      localStorage.setItem(TOKEN_KEY, accessToken);
    }
    if (refreshToken && refreshToken !== "undefined" && refreshToken !== "null") {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  },
  get() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || token === "undefined" || token === "null") return null;
    return token;
  },
  getRefresh() {
    const token = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!token || token === "undefined" || token === "null") return null;
    return token;
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
  /** Expiry of a token in ms since epoch, or null when it carries no `exp`. */
  expiresAt(token = tokenHelper.get()) {
    const exp = token ? decodeJWT(token)?.exp : null;
    return Number.isFinite(exp) ? exp * 1000 : null;
  },
  isExpired(token = tokenHelper.get()) {
    const at = tokenHelper.expiresAt(token);
    return at != null && at <= Date.now();
  },
};

// A 401 from these means wrong credentials / OTP / API key, not an expired session.
const NON_SESSION_401_CODES = new Set(["INVALID_CREDENTIALS", "LOGIN_NOT_ALLOWED", "GOOGLE_TOKEN_INVALID", "UNAUTHORIZED_DEVICE"]);

function handleUnauthorized(endpoint, sentToken, data) {
  if (!sentToken) return;
  if (endpoint.startsWith("/auth/") && endpoint !== "/auth/switch-organization") return;
  const code = data?.errorCode || "";
  if (NON_SESSION_401_CODES.has(code) || code.startsWith("API_KEY")) return;
  // Only end the session the request was made with — a newer login (e.g. from
  // another tab) must survive a late 401. This also makes parallel 401s fire once.
  if (tokenHelper.get() !== sentToken) return;
  tokenHelper.clear();
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch wrapper — handles headers, JSON, and error responses centrally
// ─────────────────────────────────────────────────────────────────────────────

export async function request(endpoint, options = {}) {
  const token = tokenHelper.get();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(endpoint, token, data);
    const error = new Error(data?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Like request(), but uses an explicitly provided token instead of the stored one
export async function requestWithToken(endpoint, customToken, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(customToken ? { Authorization: `Bearer ${customToken}` } : {}),
    ...(options.headers || {}),
  };

  const config = { ...options, headers };
  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
