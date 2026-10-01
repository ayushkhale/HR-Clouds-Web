// ─────────────────────────────────────────────────────────────────────────────
// client.js — Core network client for HR Clouds
// All domain API modules import `request` and `tokenHelper` from here.
// ─────────────────────────────────────────────────────────────────────────────

// Fail at boot, not at the first API call. A blank screen with a clear
// console error beats a deployed app that 404s against `undefined/auth/login`.
const BASE_URL = (() => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (!url) {
    throw new Error(
      "Missing build-time config: VITE_API_BASE_URL. " +
      "Set it in .env.development / .env.production or pass it as an env var during build."
    );
  }
  return url.replace(/\/+$/, "");
})();

// Binary downloads (payslip PDFs, report CSVs, bank advice, ZIPs) bypass
// `request()` because it always parses JSON — they need the same base URL.
export const API_BASE_URL = BASE_URL;

// Production nginx cuts requests at 120s. Keep the client timeout below
// that so we produce our own error rather than parsing nginx's HTML 504.
const REQUEST_TIMEOUT_MS = 110_000;

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

// Safely parse a response body. Production nginx returns HTML for gateway
// errors (413, 429, 502, 504) — parsing that as JSON would throw and mask
// the real status code.
const isJsonResponse = (response) =>
  (response.headers.get("content-type") || "").includes("application/json");

async function safeParseBody(response) {
  if (!isJsonResponse(response)) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
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

  // Abort after REQUEST_TIMEOUT_MS so we fail before the gateway's 120s cut-off.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const config = {
    ...options,
    headers,
    signal: options.signal || controller.signal,
  };

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const error = new Error("Request timed out. Please try again.");
      error.status = 408;
      error.isTimeout = true;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await safeParseBody(response);

  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(endpoint, token, data);
    const message = data?.message
      || `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    // `Retry-After` is the one response HEADER a caller acts on: a 429 from a
    // rate-limited write says here how long to wait. Read once, centrally, so
    // no api module has to reach for the raw Response. The body normally
    // carries the same number (`details.retry_after_seconds`) and is preferred
    // by readers, because a proxy can strip a header but not a payload.
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) error.retryAfter = retryAfter;
    throw error;
  }

  return data;
}

export const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || "development";
export const IS_PRODUCTION = ENVIRONMENT === "production";

// Like request(), but uses an explicitly provided token instead of the stored one
export async function requestWithToken(endpoint, customToken, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(customToken ? { Authorization: `Bearer ${customToken}` } : {}),
    ...(options.headers || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const config = {
    ...options,
    headers,
    signal: options.signal || controller.signal,
  };

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const error = new Error("Request timed out. Please try again.");
      error.status = 408;
      error.isTimeout = true;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await safeParseBody(response);

  if (!response.ok) {
    const message = data?.message
      || `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) error.retryAfter = retryAfter;
    throw error;
  }

  return data;
}
