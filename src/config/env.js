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

  // Central API Gateway Base URL
  API_BASE_URL: cleanUrl(
    import.meta.env.VITE_API_BASE_URL,
    IS_PRODUCTION
      ? 'https://api.hrclouds.in/api/v1'
      : 'https://development.hrclouds.in/api/v1'
  ),

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
};

// Runtime diagnostic warnings for production readiness
if (IS_PRODUCTION) {
  if (!ENV.API_BASE_URL) {
    console.error('[CONFIG ERROR] API_BASE_URL is not set.');
  }
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
