// ─────────────────────────────────────────────────────────────────────────────
// client.js — Core network client for HR Clouds
// All domain API modules import `request` and `tokenHelper` from here.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://development.hrclouds.in/api/v1";

// const BASE_URL = "http://192.168.29.131:4500/api/v1";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN HELPERS — localStorage access / refresh token management
// ─────────────────────────────────────────────────────────────────────────────

export const tokenHelper = {
  save(accessToken, refreshToken) {
    if (accessToken && accessToken !== "undefined" && accessToken !== "null") {
      localStorage.setItem("hrclouds_token", accessToken);
    }
    if (refreshToken && refreshToken !== "undefined" && refreshToken !== "null") {
      localStorage.setItem("hrclouds_refresh_token", refreshToken);
    }
  },
  get() {
    const token = localStorage.getItem("hrclouds_token");
    if (!token || token === "undefined" || token === "null") return null;
    return token;
  },
  getRefresh() {
    const token = localStorage.getItem("hrclouds_refresh_token");
    if (!token || token === "undefined" || token === "null") return null;
    return token;
  },
  clear() {
    localStorage.removeItem("hrclouds_token");
    localStorage.removeItem("hrclouds_refresh_token");
  },
};

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
