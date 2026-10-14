// ─────────────────────────────────────────────────────────────────────────────
// api/client.js — the one network client. Every api/*.api.js module imports
// `request` from here, and NOTHING ELSE in the app does (there is a lint rule).
//
// Ported from shared/api/client.js. Three differences, all forced by native:
//
//  1. The token lives in the Keychain, not localStorage. Keychain reads are
//     async, so a synchronous in-memory cache is primed at boot by
//     `hydrateToken()` and kept in step by `setToken()` / `clearToken()`.
//     `request()` must stay synchronous up to the fetch, or every call would
//     pay a Keychain round-trip.
//  2. There is no `window`, so session expiry is a plain listener set.
//  3. There is no cross-tab `storage` event. Multi-device sessions reconcile
//     through the 401 path and the AppState refresh in useTodayAttendance.
//
// WHAT NOT TO CHANGE:
//  • The 401 rules. A wrong password must not sign you out of a live session,
//    and a LATE 401 must not kill a NEWER login — hence the sent-token check.
//  • The 110 s abort. The gateway cuts at 120 s; we want our own error, not
//    nginx's HTML 504.
//  • The JSON content-type guard. Gateway errors (413/429/502/504) return HTML,
//    and parsing that would mask the real status.
// ─────────────────────────────────────────────────────────────────────────────

import { ENV } from '../config/env';

const BASE_URL = ENV.API_BASE_URL;

/** Binary downloads bypass request() but need the same base. */
export const API_BASE_URL = BASE_URL;

// Below the gateway's 120 s cut-off, so we produce our own error.
const REQUEST_TIMEOUT_MS = 110000;

/* ─── Token cache ─────────────────────────────────────────────────────────────
   state/session.js owns the Keychain; this module owns the in-memory copy that
   every request reads. Keeping them in one direction (session → client) means
   there is never a question of which is authoritative. */

let accessToken = null;

export const setToken = (token) => {
  accessToken = token && token !== 'undefined' && token !== 'null' ? token : null;
};
export const getToken = () => accessToken;
export const clearToken = () => {
  accessToken = null;
};

/* ─── Session expiry bus ─────────────────────────────────────────────────── */

const sessionListeners = new Set();

/** AuthContext subscribes; returns an unsubscribe. */
export function onSessionExpired(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function emitSessionExpired() {
  sessionListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      if (__DEV__) console.error('session-expired listener failed', err);
    }
  });
}

/* ─── JWT ─────────────────────────────────────────────────────────────────────
   JWTs are base64URL ("-" and "_", which plain base64 rejects) holding UTF-8
   JSON, so a name with non-ASCII characters needs a real UTF-8 decode.
   Hermes has atob/btoa but no TextDecoder in older versions, so the UTF-8
   step is done by hand. */

function base64UrlDecode(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  // eslint-disable-next-line no-undef
  const binary = global.atob ? global.atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  // percent-decode the bytes as UTF-8
  let out = '';
  for (let i = 0; i < binary.length; i += 1) {
    out += `%${`00${binary.charCodeAt(i).toString(16)}`.slice(-2)}`;
  }
  return decodeURIComponent(out);
}

/** Decode a JWT payload WITHOUT verifying it — just to read claims. */
export function decodeJWT(token) {
  try {
    return JSON.parse(base64UrlDecode(String(token).split('.')[1]));
  } catch {
    return null;
  }
}

/** Expiry in ms since epoch, or null when the token carries no `exp`. */
export function tokenExpiresAt(token = accessToken) {
  const exp = token ? decodeJWT(token)?.exp : null;
  return Number.isFinite(exp) ? exp * 1000 : null;
}

export function isTokenExpired(token = accessToken) {
  const at = tokenExpiresAt(token);
  return at != null && at <= Date.now();
}

/* ─── 401 handling ────────────────────────────────────────────────────────── */

// A 401 from these means wrong credentials / OTP / API key — NOT an expired
// session. Signing the user out here would be a bug, not a safety measure.
const NON_SESSION_401_CODES = new Set([
  'INVALID_CREDENTIALS',
  'LOGIN_NOT_ALLOWED',
  'GOOGLE_TOKEN_INVALID',
  'UNAUTHORIZED_DEVICE',
]);

function handleUnauthorized(endpoint, sentToken, data) {
  if (!sentToken) return;
  // /auth/* 401s are credential failures. The one exception really is a
  // session failure: switching organisation uses the live access token.
  if (endpoint.startsWith('/auth/') && endpoint !== '/auth/switch-organization') return;
  const code = data?.errorCode || data?.code || '';
  if (NON_SESSION_401_CODES.has(code) || code.startsWith('API_KEY')) return;
  // Only end the session the request was MADE WITH. A newer login (another
  // device, an org switch) must survive a late 401 — and this also makes
  // parallel 401s fire once instead of five times.
  if (accessToken !== sentToken) return;
  clearToken();
  emitSessionExpired();
}

/* ─── Body parsing ────────────────────────────────────────────────────────── */

const isJsonResponse = (response) =>
  (response.headers.get('content-type') || '').includes('application/json');

async function safeParseBody(response) {
  if (!isJsonResponse(response)) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function shapeError(response, data) {
  const message =
    data?.message ||
    `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`;
  const error = new Error(message);
  error.status = response.status;
  error.data = data;
  // `Retry-After` is the one response HEADER a caller acts on: a 429 from a
  // rate-limited write says here how long to wait. Read once, centrally, so no
  // api module reaches for the raw Response. The body normally carries the same
  // number (`details.retry_after_seconds`) and is preferred by readers, because
  // a proxy can strip a header but not a payload.
  const retryAfter = Number(response.headers.get('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) error.retryAfter = retryAfter;
  return error;
}

/* ─── The fetch wrapper ───────────────────────────────────────────────────── */

async function send(endpoint, options, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      const error = new Error('Request timed out. Please try again.');
      error.status = 408;
      error.isTimeout = true;
      throw error;
    }
    // A genuine network failure. Flagged so ErrorState can say "offline"
    // rather than showing a server error for a missing signal.
    err.isNetworkError = true;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await safeParseBody(response);

  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(endpoint, token, data);
    throw shapeError(response, data);
  }

  return data;
}

/** The call every api module makes. */
export function request(endpoint, options = {}) {
  return send(endpoint, options, accessToken);
}

/**
 * Like request(), but with an explicitly supplied token instead of the stored
 * one. Used only by the multi-org selection step, whose `selection_token` is
 * short-lived and deliberately never persisted.
 */
export function requestWithToken(endpoint, customToken, options = {}) {
  return send(endpoint, options, customToken);
}

export const IS_PRODUCTION = ENV.IS_PRODUCTION;
