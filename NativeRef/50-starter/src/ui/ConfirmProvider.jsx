// ─────────────────────────────────────────────────────────────────────────────
// ui/ConfirmProvider.jsx — the AWAITABLE confirm.
//
// This is the native answer to one of the web app's worst bugs. `window.confirm`
// there is overridden by GlobalAlertProvider to return a PROMISE, and about
// twenty call sites did:
//
//     if (!window.confirm('Cancel this leave?')) return;   // WRONG
//
// A Promise is always truthy, so every one of those fired its API call BEFORE
// the person pressed anything. Somebody's leave was cancelled by a dialog they
// then dismissed.
//
// There is no `window.confirm` on native, which is the good news: the only way
// to confirm is this hook, and it cannot be used wrong by accident because it
// returns a Promise and nothing else.
//
//     const confirm = useConfirm();
//     if (!(await confirm({
//       title: 'Cancel this leave?',
//       message: 'Your balance will be given back.',
//       confirmText: 'Cancel leave',
//       destructive: true,
//     }))) return;
//
// ── RULES ────────────────────────────────────────────────────────────────────
//
// • EVERY DESTRUCTIVE ACTION AWAITS THIS. Cancelling a request, deleting a
//   document, withdrawing a correction, clocking out. No exceptions.
//
// • THE MESSAGE SAYS THE CONSEQUENCE, not the mechanism (CLAUDE.md §6).
//   "Your balance will be given back", not "triggers a balance reversal".
//
// • THE CONFIRM BUTTON SAYS WHAT HAPPENS. "Cancel leave", not "OK" — and never
//   "Yes"/"No" on a question whose wording makes "yes" ambiguous ("Cancel this
//   leave?" / "Cancel" is genuinely unanswerable).
//
// • IT IS NOT A FORM. One question, up to two buttons. A confirm that collects
//   a reason is ReasonPrompt; a confirm that collects three fields is a
//   FormSheet (CLAUDE.md §3).
//
// It uses the platform Alert on purpose rather than a custom sheet: people
// already know what a system dialog means, it is announced correctly by both
// screen readers for free, and it cannot be dismissed by a stray scroll.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext } from 'react';
import { Alert } from 'react-native';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} [opts.message]       the CONSEQUENCE, in plain words
   * @param {string} [opts.confirmText]   what will happen — not "OK"
   * @param {string} [opts.cancelText]
   * @param {boolean} [opts.destructive]  red confirm on iOS
   * @returns {Promise<boolean>}
   */
  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    const {
      title = 'Are you sure?',
      message,
      confirmText = 'Continue',
      cancelText = 'Go back',
      destructive = false,
    } = opts;

    Alert.alert(
      title,
      message,
      [
        // `style: 'cancel'` is what makes the Android back button and an
        // outside tap resolve as a NO rather than leaving the promise hanging
        // forever — which would silently wedge the calling handler.
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  }), []);

  return <ConfirmContext.Provider value={confirm}>{children}</ConfirmContext.Provider>;
}

/**
 * @returns {(opts: object) => Promise<boolean>}
 *
 * Throws without a provider — unlike useToast, which degrades. A confirm that
 * silently resolved `true` would delete things nobody agreed to, and one that
 * silently resolved `false` would make every action appear broken. Neither is
 * survivable, so this fails loudly at the top of the tree instead.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export default ConfirmProvider;
