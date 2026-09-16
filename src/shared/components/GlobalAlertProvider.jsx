import { useState, useEffect, useRef, useCallback } from "react";

// A dialog ignores "OK" for this long after it appears, so the second click of
// a double-click on the button that opened it can't confirm it by accident.
const ACCIDENTAL_CLICK_MS = 400;

const toText = (message) => (message == null ? "" : String(message));

/**
 * Replaces window.alert / window.confirm with in-app dialogs.
 *
 * IMPORTANT: window.confirm returns a Promise<boolean> here, not a boolean.
 * Always await it — `if (!(await window.confirm("…"))) return;`. Without
 * `await` the Promise is truthy, so the action runs while the question is still
 * on screen. eslint (`no-restricted-syntax`) rejects un-awaited calls.
 */
export function GlobalAlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [confirms, setConfirms] = useState([]);
  // The queues also live in refs so each answer removes exactly one dialog,
  // even when two clicks land before React re-renders.
  const alertsRef = useRef([]);
  const confirmsRef = useRef([]);
  const seqRef = useRef(0);
  const shownAtRef = useRef(0);
  const dialogRef = useRef(null);
  // Where focus was before the modal opened, so it can go back there.
  const returnFocusRef = useRef(null);

  const setAlertQueue = useCallback((next) => {
    alertsRef.current = next;
    setAlerts(next);
  }, []);

  const setConfirmQueue = useCallback((next) => {
    confirmsRef.current = next;
    setConfirms(next);
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;

    const rememberFocus = () => {
      if (!returnFocusRef.current) returnFocusRef.current = document.activeElement;
    };

    window.alert = (message) => {
      rememberFocus();
      setAlertQueue([...alertsRef.current, { id: ++seqRef.current, message: toText(message) }]);
    };

    window.confirm = (message) =>
      new Promise((resolve) => {
        rememberFocus();
        setConfirmQueue([...confirmsRef.current, { id: ++seqRef.current, message: toText(message), resolve }]);
      });

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      // Answer anything still open with "no", so no caller waits forever
      // holding its busy lock.
      const pending = confirmsRef.current;
      setConfirmQueue([]);
      setAlertQueue([]);
      pending.forEach((c) => c.resolve(false));
    };
  }, [setAlertQueue, setConfirmQueue]);

  // Answers are tied to the dialog's id. Two clicks on one button before React
  // re-renders then answer that dialog once, never the next one in the queue.
  const closeAlert = useCallback((id) => {
    const [head, ...rest] = alertsRef.current;
    if (!head || head.id !== id) return;
    setAlertQueue(rest);
  }, [setAlertQueue]);

  const resolveConfirm = useCallback((id, result) => {
    const [head, ...rest] = confirmsRef.current;
    if (!head || head.id !== id) return;
    setConfirmQueue(rest);
    head.resolve(result === true);
  }, [setConfirmQueue]);

  const topAlertId = alerts[0]?.id;
  const topConfirmId = confirms[0]?.id;
  const open = alerts.length > 0 || confirms.length > 0;

  // Start the accidental-click window each time a new dialog comes to the front.
  useEffect(() => {
    if (topAlertId !== undefined || topConfirmId !== undefined) shownAtRef.current = performance.now();
  }, [topAlertId, topConfirmId]);

  const tooSoon = () => performance.now() - shownAtRef.current < ACCIDENTAL_CLICK_MS;

  // These modals sit above every dialog. The listener is on window in the
  // capture phase, so it runs before any dialog's document listener. Escape
  // answers the question (Cancel / OK) and never reaches a dialog underneath.
  // Tab stays inside the modal, so nothing behind it can be pressed.
  useEffect(() => {
    if (!open) {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && typeof target.focus === "function" && document.contains(target)) {
        target.focus({ preventScroll: true });
      }
      return undefined;
    }
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        const question = confirmsRef.current[0];
        if (question) resolveConfirm(question.id, false);
        else if (alertsRef.current[0]) closeAlert(alertsRef.current[0].id);
        return;
      }
      if (e.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll("button") || []);
      if (buttons.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const index = buttons.indexOf(document.activeElement);
      const nextIndex = index === -1
        ? 0
        : (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[nextIndex].focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, resolveConfirm, closeAlert]);

  // Only the front dialog is rendered. A confirm goes in front of an alert,
  // because its caller is waiting on the answer.
  const confirm = confirms[0];
  const alert = confirm ? null : alerts[0];

  return (
    <>
      {children}

      {/* Alert Modal */}
      {alert && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-10 sm:pt-16 bg-black/20 backdrop-blur-sm transition-opacity">
          {/* key: each alert mounts fresh, so autoFocus runs again */}
          <div key={alert.id} ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={`global-alert-${alert.id}`} className="bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl shadow-2xl rounded-[14px] w-full max-w-[320px] overflow-hidden animate-in fade-in slide-in-from-top-10 duration-300">
            <div className="p-6 text-center min-h-[90px] flex items-center justify-center">
              <p id={`global-alert-${alert.id}`} className="text-gray-900 dark:text-gray-100 text-[14px] font-medium leading-relaxed whitespace-pre-line">
                {alert.message}
              </p>
            </div>
            <div className="border-t border-gray-300/50 dark:border-gray-700/50">
              <button
                type="button"
                autoFocus
                onClick={() => { if (!tooSoon()) closeAlert(alert.id); }}
                className="w-full py-3.5 text-[#6D28D9] font-semibold text-[16px] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors focus:outline-none focus-visible:bg-black/5"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirm && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-10 sm:pt-16 bg-black/20 backdrop-blur-sm transition-opacity">
          {/* key: each question mounts fresh, so Cancel is focused again */}
          <div key={confirm.id} ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={`global-confirm-${confirm.id}`} className="bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl shadow-2xl rounded-[14px] w-full max-w-[320px] overflow-hidden animate-in fade-in slide-in-from-top-10 duration-300">
            <div className="p-6 text-center min-h-[90px] flex items-center justify-center">
              <p id={`global-confirm-${confirm.id}`} className="text-gray-900 dark:text-gray-100 text-[14px] font-medium leading-relaxed whitespace-pre-line">
                {confirm.message}
              </p>
            </div>
            <div className="border-t border-gray-300/50 dark:border-gray-700/50 flex">
              <button
                type="button"
                // Focus the safe answer, so a stray Enter can't confirm, nor
                // re-press the button that opened this question.
                autoFocus
                onClick={() => resolveConfirm(confirm.id, false)}
                className="flex-1 py-3.5 border-r border-gray-300/50 dark:border-gray-700/50 text-[#6D28D9] font-semibold text-[16px] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors focus:outline-none focus-visible:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (!tooSoon()) resolveConfirm(confirm.id, true); }}
                className="flex-1 py-3.5 text-[#6D28D9] font-semibold text-[16px] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors focus:outline-none focus-visible:bg-black/5"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
