// ─────────────────────────────────────────────────────────────────────────────
// navigation/linking.js — deep links, and the one hard part about them.
//
// Two prefixes: the custom scheme `hrclouds://` (push notifications) and
// `https://hrclouds.in/app` (transactional email). The link that actually
// matters is `company-documents/:documentId` — both the "please acknowledge
// this" email and its push point an employee at ONE issued document, and
// landing them on Home instead is the difference between an acknowledgement
// taking two taps and taking six.
//
// ── THE HARD PART: A LINK THAT ARRIVES WHILE SIGNED OUT ──────────────────────
//
// React Navigation resolves a link against the navigator tree that is MOUNTED
// AT THAT MOMENT. While somebody is signed out, AppTabs does not exist — so a
// link naming `MoreTab → CompanyDocuments` resolves to nothing and is silently
// dropped. The person taps a link, types a password, and arrives on Home with
// no idea what happened to the thing they tapped.
//
// So this file holds the URL instead of discarding it, and replays it once the
// session is real. It does that through React Navigation's own `getInitialURL`
// / `subscribe` hooks rather than a second navigation path of our own, because
// two things navigating from one link is how you get a double push.
//
// RootNavigator drives it with `setLinkingAuthed(isAuthenticated)`.
//
// ── A PENDING LINK IS NOT KEPT FOREVER ───────────────────────────────────────
//
// It expires after five minutes. A stale intent is worse than no intent: a
// link tapped yesterday, replayed over whatever the person opened the app to
// do today, feels like the app lost its place. Five minutes covers "tap link,
// find password, sign in" and nothing longer.
//
// It is also dropped the moment the role gate refuses an account. A link must
// never be a way into this app for somebody it isn't for (CLAUDE.md §2) — the
// gate already guarantees that by never mounting AppTabs, and clearing here
// means a refused HR admin's link doesn't fire at the next employee to sign in
// on the same phone.
//
// ── WHAT IS NOT LINKED ───────────────────────────────────────────────────────
//
// No form, no modal and no record sheet has a URL. A link that opens a
// half-filled Apply-for-leave form, or a sheet over a list that never loaded,
// is a bug with a URL. Links land on LISTS and the person taps the row —
// which is also the only way the sheet gets a list behind it to go back to.
//
// Associated domains (iOS) and App Links (Android) are a Phase 6 task, with
// push. Until they are registered, `https://` links open the browser and only
// the custom scheme reaches the app. The config is already correct for both.
// ─────────────────────────────────────────────────────────────────────────────

import { Linking } from 'react-native';

export const PREFIXES = ['hrclouds://', 'https://hrclouds.in/app'];

/** How long a link waits for a session before it is considered stale. */
const PENDING_TTL_MS = 5 * 60 * 1000;

let pending = null;      // { url, at } — arrived before there was a session
let listener = null;     // React Navigation's URL callback, while mounted
let authed = false;      // mirrors AuthContext.isAuthenticated

function takePending() {
  if (!pending) return null;
  const { url, at } = pending;
  pending = null;
  if (Date.now() - at > PENDING_TTL_MS) {
    if (__DEV__) console.log('[linking] dropped a stale pending link:', url);
    return null;
  }
  return url;
}

/**
 * Tell the linking layer whether there is a session. Called from
 * RootNavigator on every change of `isAuthenticated`.
 *
 * Going true replays a held link. Going false does NOT clear one — a link
 * tapped at the Login screen is exactly the case this exists for.
 */
export function setLinkingAuthed(next) {
  authed = !!next;
  if (!authed) return;
  const url = takePending();
  if (url && listener) listener(url);
}

/** Drop a held link. Called when the role gate refuses an account. */
export function clearPendingLink() {
  pending = null;
}

/** Dev/debug only: what is being held, if anything. */
export function peekPendingLink() {
  return pending?.url || null;
}

/**
 * The screen map. Every path lands on a LIST or a tab root, and every name
 * here must exist in `tabs.employee.js` — a path naming a screen the tab set
 * doesn't have resolves to nothing, with no warning.
 */
export const linkingConfig = {
  screens: {
    AppTabs: {
      screens: {
        HomeTab: { screens: { Home: 'home' } },
        TimeTab: { screens: { Time: 'attendance' } },
        LeaveTab: { screens: { Leave: 'leaves' } },
        PayTab: { screens: { Payslips: 'payslips' } },
        MoreTab: {
          screens: {
            // THE important one. The web contract (2026-10-08) deep-links to
            // /dashboard/employee/company-documents/:id, so the mobile path
            // deliberately keeps the same tail: one link works for both.
            CompanyDocuments: 'company-documents/:documentId',
            DocumentRequests: 'document-requests',
            MyDocuments: 'my-documents',
            Profile: 'profile',
          },
        },
      },
    },
  },
};

export const linking = {
  prefixes: PREFIXES,
  config: linkingConfig,

  /**
   * The URL the app was COLD-STARTED with. Returning `null` while signed out
   * is what makes the container start on the auth stack instead of trying to
   * resolve a path into a tree that isn't there.
   */
  async getInitialURL() {
    const url = await Linking.getInitialURL().catch(() => null);
    if (!url) return null;
    if (!authed) {
      pending = { url, at: Date.now() };
      return null;
    }
    return url;
  },

  /**
   * Links that arrive while the app is already running — and the replay point
   * for one captured before the container mounted.
   */
  subscribe(cb) {
    listener = cb;

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url) return;
      if (!authed) {
        pending = { url, at: Date.now() };
        return;
      }
      cb(url);
    });

    // A cold start with a token: getInitialURL ran before `authed` was set,
    // so the link is sitting in `pending`. Hand it over now.
    if (authed) {
      const held = takePending();
      if (held) cb(held);
    }

    return () => {
      sub.remove();
      listener = null;
    };
  },
};

export default linking;
