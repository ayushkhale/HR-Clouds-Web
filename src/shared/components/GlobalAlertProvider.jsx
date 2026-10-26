import { useState, useEffect, useRef, useCallback } from "react";
import { HiInformationCircle, HiQuestionMarkCircle } from "react-icons/hi";

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
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-[2px] transition-opacity">
          {/* key: each alert mounts fresh, so autoFocus runs again */}
          <div
            key={alert.id}
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`global-alert-${alert.id}`}
            className="bg-white border border-purple-100 shadow-2xl shadow-purple-950/15 rounded-2xl w-full max-w-[340px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-6 text-center flex flex-col items-center justify-center">
              <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center mb-3 shrink-0">
                <HiInformationCircle className="w-6 h-6" />
              </div>
              <p id={`global-alert-${alert.id}`} className="text-slate-800 text-[14px] font-semibold leading-relaxed whitespace-pre-line">
                {alert.message}
              </p>
            </div>
            <div className="border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                autoFocus
                onClick={() => { if (!tooSoon()) closeAlert(alert.id); }}
                className="w-full py-3.5 text-purple-700 hover:text-purple-800 font-bold text-[15px] hover:bg-purple-50/70 active:bg-purple-100/50 transition-colors focus:outline-none focus-visible:bg-purple-50 cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-[2px] transition-opacity">
          {/* key: each question mounts fresh, so Cancel is focused again */}
          <div
            key={confirm.id}
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`global-confirm-${confirm.id}`}
            className="bg-white border border-purple-100 shadow-2xl shadow-purple-950/15 rounded-2xl w-full max-w-[340px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-6 text-center flex flex-col items-center justify-center">
              <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center mb-3 shrink-0">
                <HiQuestionMarkCircle className="w-6 h-6" />
              </div>
              <p id={`global-confirm-${confirm.id}`} className="text-slate-800 text-[14px] font-semibold leading-relaxed whitespace-pre-line">
                {confirm.message}
              </p>
            </div>
            <div className="border-t border-slate-100 bg-slate-50/50 flex">
              <button
                type="button"
                // Focus the safe answer, so a stray Enter can't confirm, nor
                // re-press the button that opened this question.
                autoFocus
                onClick={() => resolveConfirm(confirm.id, false)}
                className="flex-1 py-3.5 border-r border-slate-100 text-slate-600 hover:text-slate-800 font-semibold text-[15px] hover:bg-slate-100/70 active:bg-slate-200/50 transition-colors focus:outline-none focus-visible:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (!tooSoon()) resolveConfirm(confirm.id, true); }}
                className="flex-1 py-3.5 text-purple-700 hover:text-purple-800 font-bold text-[15px] hover:bg-purple-50/70 active:bg-purple-100/50 transition-colors focus:outline-none focus-visible:bg-purple-50 cursor-pointer"
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
