// ─────────────────────────────────────────────────────────────────────────────
// config/env.js — the ONE place that resolves environment configuration.
//
// There is no import.meta.env in React Native. `react-native-config` compiles
// .env values into the native build, and everything is resolved here so no
// other file reads Config directly.
//
// Anything compiled into the app is readable by anyone who downloads it, so
// nothing here may be a secret that matters. The DocMind key is already
// client-side on the web app; treat it as public.
//
// VERIFY THIS ON A RELEASE BUILD, not just in Metro: a half-finished
// react-native-config setup silently yields `undefined` for every key.
// ─────────────────────────────────────────────────────────────────────────────

import Config from 'react-native-config';

const clean = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const cleanUrl = (v, fallback = '') => clean(v, fallback).replace(/\/+$/, '');

const MODE = clean(Config.APP_ENV, 'development');
const IS_PRODUCTION = MODE === 'production';

export const ENV = {
  MODE,
  IS_PRODUCTION,
  IS_DEV: !IS_PRODUCTION,

  // The same two gateways the web app uses.
  API_BASE_URL: cleanUrl(
    Config.API_BASE_URL,
    IS_PRODUCTION ? 'https://api.hrclouds.in/api/v1' : 'https://development.hrclouds.in/api/v1',
  ),

  // Google SSO -> idToken -> POST /auth/google
  GOOGLE_WEB_CLIENT_ID: clean(Config.GOOGLE_WEB_CLIENT_ID),
  GOOGLE_IOS_CLIENT_ID: clean(Config.GOOGLE_IOS_CLIENT_ID),

  // Maya (the "Ask Maya" assistant behind every ⓘ). No key -> Maya is ABSENT,
  // and the ⓘ shows no Ask Maya link. Absent, not broken.
  DOCMIND_API_KEY: clean(Config.DOCMIND_API_KEY),
  DOCMIND_API_URL: cleanUrl(Config.DOCMIND_API_URL, 'https://api.codewithrishi.fun/api/public'),

  // Build identity, for the Settings screen and crash reports.
  APP_VERSION: clean(Config.APP_VERSION, '1.0.0'),
  SENTRY_DSN: clean(Config.SENTRY_DSN),
};

if (__DEV__) {
  if (!ENV.API_BASE_URL) console.error('[CONFIG] API_BASE_URL is not set.');
  if (!ENV.DOCMIND_API_KEY) console.warn('[CONFIG] No DocMind key — Maya will be hidden from every ⓘ.');
  if (!ENV.GOOGLE_WEB_CLIENT_ID) console.warn('[CONFIG] No Google client id — SSO will be disabled.');
}

export default ENV;
