// ─────────────────────────────────────────────────────────────────────────────
// lib/errors/index.js — one entry point for "what do we tell the person?".
//
// The four domain modules beside this one hold the real copy, and they are not
// interchangeable because THE API USES TWO DIFFERENT ERROR-CODE KEYS:
//
//   • attendance and leave  →  `data.code`
//   • payroll and documents →  `data.errorCode`
//
// That is not a style choice, it is the two halves of the gateway (see
// 10-api/04-error-handling.md). Reading the wrong key gets you `undefined` and
// a generic message for an error we have perfectly good copy for, which is the
// commonest cause of "why does this say Something went wrong?".
//
// So: a screen that knows its domain calls that domain's mapper directly.
// `errorMessage(err, domain)` below exists for the generic places — ErrorState,
// a toast in a shared component — where the domain arrives as a prop.
//
// NEVER show `err.message` raw. It is a fetch message, a Joi string or an
// English sentence written for a developer; all three are worse than our
// fallback. (CLAUDE.md §6)
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceErrorMessage, attendanceErrorCode, isFeatureDisabled } from './attendanceErrors';
import { leaveErrorMessage } from './leaveErrors';
import { payrollErrorMessage, payrollErrorCode, isPayrollRouteMissing } from './payrollErrors';
import { documentErrorMessage, documentErrorCode, isFeatureNotDeployed } from './documentErrors';

const MAPPERS = {
  attendance: attendanceErrorMessage,
  leave: leaveErrorMessage,
  payroll: payrollErrorMessage,
  documents: documentErrorMessage,
  organization: attendanceErrorMessage, // same `code` key, same shared copy
};

export const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';

/**
 * The sentence to show for an error.
 *
 * @param {Error & {status?: number, data?: object, isNetworkError?: boolean}} err
 * @param {'attendance'|'leave'|'payroll'|'documents'|'organization'} [domain]
 * @param {string} [fallback] — say what COULDN'T be done, not "an error occurred"
 */
export function errorMessage(err, domain = 'attendance', fallback = DEFAULT_FALLBACK) {
  if (!err) return fallback;
  // Offline comes first: no server code exists, and the server's copy would be
  // misleading ("your session expired" for a lift with no signal).
  if (isOffline(err)) return OFFLINE_MESSAGE;
  const mapper = MAPPERS[domain] || attendanceErrorMessage;
  return mapper(err, fallback);
}

/** The code, whichever key this domain uses. For branching, not for display. */
export function errorCode(err, domain = 'attendance') {
  if (domain === 'payroll') return payrollErrorCode(err);
  if (domain === 'documents') return documentErrorCode(err);
  return attendanceErrorCode(err);
}

/* ─── Offline ─────────────────────────────────────────────────────────────── */

export const OFFLINE_MESSAGE =
  'You’re offline. This will load as soon as you have a connection.';

/**
 * A genuine network failure, flagged by api/client.js — NOT a 500, and not a
 * timeout from the server. The difference matters: offline copy must not offer
 * a "Try again" that cannot possibly work, and a server error must not blame
 * the person's connection.
 */
export const isOffline = (err) => err?.isNetworkError === true;

/** The client's own 110s abort (the gateway cuts at 120s). */
export const isTimeout = (err) => err?.name === 'AbortError' || err?.isTimeout === true;

/* ─── "Not enabled" vs "broken" ───────────────────────────────────────────────
   A feature the org hasn't switched on, or a backend route that isn't deployed
   yet, is NOT an error — it is an absence, and a Try again button on it is a
   lie. ErrorState branches on this and drops the retry. (CLAUDE.md §7: a
   missing backend feature degrades to a hidden control, never a crash.) */

export function isUnavailableFeature(err, domain = 'attendance') {
  if (!err) return false;
  if (isFeatureDisabled(err)) return true;
  if (domain === 'payroll' && isPayrollRouteMissing(err)) return true;
  if (domain === 'documents' && isFeatureNotDeployed(err)) return true;
  // A 404 with no body from anywhere else is the same thing: the route isn't
  // there. A 404 WITH a body is a real "not found" and keeps its own copy.
  return err.status === 404 && !err.data;
}

export const UNAVAILABLE_MESSAGE = 'This isn’t switched on for your organisation yet.';

/**
 * Everything ErrorState needs, decided in one place so three screens can't
 * disagree about whether an error is retryable.
 *
 * @returns {{ message: string, retryable: boolean, kind: 'offline'|'unavailable'|'error' }}
 */
export function errorPresentation(err, domain = 'attendance', fallback = DEFAULT_FALLBACK) {
  if (isOffline(err)) return { message: OFFLINE_MESSAGE, retryable: true, kind: 'offline' };
  if (isUnavailableFeature(err, domain)) {
    return { message: UNAVAILABLE_MESSAGE, retryable: false, kind: 'unavailable' };
  }
  return { message: errorMessage(err, domain, fallback), retryable: true, kind: 'error' };
}
