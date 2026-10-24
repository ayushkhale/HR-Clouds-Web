/**
 * src/config/env.js
 * Centralized, validated environment configuration for HR Clouds.
 * Single source of truth for build-time & runtime environment variables.
 *
 * NOTE: Vite replaces `import.meta.env.VITE_*` via static string replacement at build time.
 * Dynamic access like `import.meta.env[key]` is intentionally avoided to ensure
 * reliable bundling in production.
 */

// Helper to sanitize string values and fall back gracefully on empty strings or undefined
const cleanString = (val, fallback = '') => {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return fallback;
};

// Strip trailing slashes to guarantee clean URL concatenation
const cleanUrl = (url, fallback = '') => {
  const cleaned = cleanString(url, fallback);
  return cleaned.replace(/\/+$/, '');
};

const MODE = import.meta.env.MODE || 'development';
const IS_PRODUCTION = MODE === 'production';
const IS_DEV = MODE === 'development';

export const ENV = {
  // Environment Flags
  MODE,
  IS_PRODUCTION,
  IS_DEV,

  // Central API Gateway Base URL.
  //
  // NO FALLBACK HOST, deliberately (user decision, 15 Oct 2026). `.env.development`
  // and `.env.production` are the only places that say which API this build talks
  // to. The old code defaulted a missing variable to the DEPLOYED dev or prod
  // gateway, which meant a typo, a blank line or an unrestarted dev server pointed
  // the app at somebody else's database while the env file on screen said
  // localhost — and nothing on the screen looked wrong. An unset variable is now
  // an empty base and a loud console error naming the file to fix.
  API_BASE_URL: cleanUrl(import.meta.env.VITE_API_BASE_URL),

  // Google OAuth Client ID
  GOOGLE_CLIENT_ID: cleanString(import.meta.env.VITE_GOOGLE_CLIENT_ID, ''),

  // Razorpay Public Key ID (test key in dev, live key in prod)
  RAZORPAY_KEY_ID: cleanString(import.meta.env.VITE_RAZORPAY_KEY_ID, ''),

  // DocMind AI Assistant
  DOCMIND_API_KEY: cleanString(import.meta.env.VITE_DOCMIND_API_KEY, ''),
  DOCMIND_API_URL: cleanUrl(
    import.meta.env.VITE_DOCMIND_API_URL,
    'https://api.codewithrishi.fun/api/public'
  ),

  // Web Push VAPID public key — must be the pair of the server's private key
  // (`PUSH_WEBPUSH_*`). Blank is the supported state, not a misconfiguration:
  // with no key the browser cannot subscribe at all, so the "browser alerts"
  // switch is absent rather than offered and broken (§2). The in-app inbox is
  // unaffected — it is REST, and it is the source of truth; push is a nudge.
  PUSH_VAPID_PUBLIC_KEY: cleanString(import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY, ''),

  // Google Geocoding v4 — address <-> coordinates (shared/utils/geocoding.js).
  // No key -> OpenStreetMap only, exactly as before. Today a Maps DEMO key (no
  // billing, a small daily allowance); it ships in the bundle like every VITE_ value.
  GOOGLE_MAPS_API_KEY: cleanString(import.meta.env.VITE_GOOGLE_MAPS_API_KEY, ''),
};

// Where this build talks, said once at boot in every mode — the line that would
// have ended a day of chasing a WebAuthn error that came from the wrong server.
if (!ENV.API_BASE_URL) {
  console.error(
    `[CONFIG ERROR] VITE_API_BASE_URL is not set, so every API call will fail. `
    + `Set it in .env.${MODE} and restart — Vite reads env files only at startup.`,
  );
} else if (IS_DEV) {
  console.info(`[config] API → ${ENV.API_BASE_URL} (from .env.${MODE})`);
}

// Runtime diagnostic warnings for production readiness
if (IS_PRODUCTION) {
  if (!ENV.GOOGLE_CLIENT_ID) {
    console.warn('[CONFIG WARNING] Google OAuth Client ID is missing. SSO will be disabled.');
  }
  if (!ENV.RAZORPAY_KEY_ID) {
    console.warn('[CONFIG WARNING] Razorpay Key ID is missing. Org registration checkout will fail.');
  }
  if (!ENV.DOCMIND_API_KEY) {
    console.warn('[CONFIG WARNING] DocMind API Key is missing. Maya chatbot will use offline defaults.');
  }
}

export default ENV;
