// ─────────────────────────────────────────────────────────────────────────────
// navigation/routes.js — the native equivalent of the web's path hooks.
//
// On the web, nothing builds a link by typing a URL. Every link goes through
// `useMyPayPaths()`, `useMyDocumentPaths()` or `useOrgPaths()`, which return
// **null** for a workspace that has no such page — never another workspace's
// link. That is what stops a shared component from sending a manager to an
// employee URL, and it is the mechanism behind "a capability a role lacks is
// ABSENT, NOT BROKEN" (CLAUDE.md §2).
//
// This is that, for routes.
//
//   const payslips = useRouteTarget('payslips');
//   …
//   {payslips ? <Row title="Payslips" onPress={() => go(payslips)} /> : null}
//
// ── WHY A SHARED COMPONENT MUST NOT NAME A ROUTE ─────────────────────────────
//
// Today there is one workspace and every key resolves, so a hardcoded
// `navigate('PayTab', { screen: 'Payslips' })` works — which is exactly why it
// gets written. The day the manager app ships, that line either throws (the
// route doesn't exist there) or, far worse, silently lands a manager on an
// employee screen. A `null` from this file is a hidden link; a hardcoded name
// is a bug nobody finds until then.
//
// ── A KEY IS A DESTINATION, NOT A SCREEN NAME ────────────────────────────────
//
// The keys are the WEB's vocabulary — `payslips`, `leaves`, `documents` — so a
// screen ported from the web keeps the same word it used there. Where the
// mobile grouping differs (Payslips lives in PayTab, My Documents in MoreTab),
// the difference is absorbed here and nowhere else.
//
// ── NOTHING THAT ISN'T A PLACE ───────────────────────────────────────────────
//
// No form, no modal, no record sheet. A destination is somewhere a person can
// BE and come back from. `ApplyLeave` is deliberately absent: a link to a
// blank form with no list behind it has nothing to go back to, so the caller
// routes to `leaves` and the screen opens its own form. Same reason those
// paths aren't deep-linkable (linking.js).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../state/AuthContext';

/**
 * workspace → key → [tabName, screenName].
 *
 * When the manager app arrives it adds a `manager:` block here. It does NOT
 * widen `employee`, and it does not get a fallback (see `useRouteTarget`).
 */
export const ROUTES = {
  employee: {
    // Home
    home: ['HomeTab', 'Home'],
    dayLog: ['HomeTab', 'DayLog'],

    // Time
    attendance: ['TimeTab', 'Time'],
    corrections: ['TimeTab', 'Time'],       // same screen, a TabStrip tab
    overtime: ['TimeTab', 'Time'],
    earnedLeave: ['TimeTab', 'Time'],

    // Leave
    leaves: ['LeaveTab', 'Leave'],
    holidays: ['LeaveTab', 'Holidays'],

    // Pay — the web's MY PAY section, key for key
    pay: ['PayTab', 'PayHome'],
    salary: ['PayTab', 'Salary'],
    payslips: ['PayTab', 'Payslips'],
    claims: ['PayTab', 'Claims'],
    loans: ['PayTab', 'Loans'],
    tax: ['PayTab', 'Tax'],

    // Documents — the web's MY DOCUMENTS section
    documentsHome: ['MoreTab', 'DocumentsHome'],
    documents: ['MoreTab', 'MyDocuments'],
    companyDocuments: ['MoreTab', 'CompanyDocuments'],
    documentRequests: ['MoreTab', 'DocumentRequests'],
    forms: ['MoreTab', 'Forms'],

    // Company and self
    company: ['MoreTab', 'Company'],
    orgChart: ['MoreTab', 'OrgChart'],
    directory: ['MoreTab', 'Directory'],
    profile: ['MoreTab', 'Profile'],
    settings: ['MoreTab', 'Settings'],
  },
};

/** Every key this app knows, for the dev-time check below. */
export const ROUTE_KEYS = Object.keys(ROUTES.employee);

/**
 * The destination for a key in THIS session's workspace, or `null`.
 *
 * `null` means HIDE THE LINK. Never fall back to another workspace's
 * destination, and never default a missing workspace to `employee` — that is
 * precisely how the web app once let HR walk the employee tabs (CLAUDE.md §2).
 *
 * @param {string} key
 * @returns {[string, string]|null}
 */
export function useRouteTarget(key) {
  const { workspace } = useAuth();
  const target = ROUTES[workspace]?.[key] ?? null;

  if (__DEV__ && workspace && target == null && ROUTE_KEYS.includes(key)) {
    // The key exists for employees but not for this workspace. That is a
    // legitimate `null` — logged once because the usual cause is a typo.
    console.log(`[routes] "${key}" has no destination in the "${workspace}" workspace — link hidden.`);
  }

  return target;
}

/**
 * Navigate to a target from `useRouteTarget`, with optional params.
 *
 * Crossing tabs needs BOTH names — `navigate('PayTab')` alone lands on the
 * tab's root, which is the wrong screen four times out of five. This always
 * passes both, so a cross-tab jump can't quietly become a tab switch.
 *
 *   const go = useGo();
 *   const payslips = useRouteTarget('payslips');
 *   <Row onPress={() => go(payslips, { month: '2026-09' })} />
 */
export function useGo() {
  const navigation = useNavigation();

  return useCallback((target, params) => {
    // A null target is a no-op, not a crash: the caller should have hidden the
    // control, and a dead press is better than a red screen if it didn't.
    if (!Array.isArray(target) || target.length < 2) {
      if (__DEV__) console.log('[routes] go() called with no destination — the link should have been hidden.');
      return;
    }
    const [tab, screen] = target;
    navigation.navigate(tab, { screen, params });
  }, [navigation]);
}

/**
 * Key → navigate, for the common case of a menu row.
 *
 *   const { target, go } = useRouteFor('payslips');
 *   {target ? <Row title="Payslips" onPress={go} /> : null}
 */
export function useRouteFor(key, params) {
  const target = useRouteTarget(key);
  const go = useGo();
  return {
    target,
    go: useCallback(() => go(target, params), [go, target, params]),
  };
}

if (__DEV__) {
  // Every destination must name a screen the tab set actually has. A route
  // table pointing at a renamed screen fails as a silent no-op at the tap,
  // weeks later — this says so at startup instead.
  // eslint-disable-next-line global-require
  const { EMPLOYEE_TABS } = require('./tabs.employee');
  const known = new Set(
    EMPLOYEE_TABS.flatMap((t) => t.screens.map((s) => `${t.name}/${s.name}`)),
  );
  const broken = Object.entries(ROUTES.employee)
    .filter(([, [tab, screen]]) => !known.has(`${tab}/${screen}`))
    .map(([key, [tab, screen]]) => `${key} → ${tab}/${screen}`);
  if (broken.length) {
    console.error(`[routes] destinations that don't exist in the tab set:\n  ${broken.join('\n  ')}`);
  }
}

export default ROUTES;
