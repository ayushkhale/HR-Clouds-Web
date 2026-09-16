// ─────────────────────────────────────────────────────────────────────────────
// attendance/DecisionDialog.jsx — One approval/rejection/resolution dialog for
// every attendance decision (regularization, overtime, comp-off, anomaly) used
// by both the per-type manager pages, the Approvals Inbox and HR overrides.
//
//  • Same header, spacing and buttons as the Create Attendance Policy modal.
//  • `size="lg"` fills the viewport: details scroll on the left while the
//    decision (notice, remarks) stays visible on the right.
//  • Remarks reset every time the dialog opens for a new entity.
//  • Per-action `requireRemarks` (reject always requires a reason).
//  • Buttons disable while submitting — no duplicate decisions.
//  • Errors are mapped through attendanceErrorMessage and shown inline.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useState } from "react";
import { HiX } from "react-icons/hi";
import { attendanceErrorMessage } from "../utils/attendanceErrors.js";
import { DECISION_REMARKS_MAX } from "./validation.js";
import { InlineAlert, Spinner } from "./ui.jsx";

const TONE_BUTTON = {
  emerald: "bg-violet-600 hover:bg-violet-700 text-white",
  rose: "bg-rose-600 hover:bg-rose-700 text-white",
  purple: "bg-purple-600 hover:bg-purple-700 text-white",
  amber: "bg-fuchsia-500 hover:bg-fuchsia-600 text-white",
};

const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2";

/**
 * @param {{
 *   open: boolean,
 *   entityKey?: string|number,
 *   title: string,
 *   subtitle?: string,
 *   children?: React.ReactNode,      // entity details
 *   notice?: React.ReactNode,        // e.g. "Approving credits 1 day to the CO balance"
 *   actions: Array<{key: string, label: string, tone?: string, requireRemarks?: boolean}>,
 *   remarksLabel?: string,
 *   remarksPlaceholder?: string,
 *   showRemarks?: boolean,
 *   size?: "md" | "lg",
 *   onSubmit: (actionKey: string, remarks: string) => Promise<void>,
 *   onClose: () => void,
 * }} props
 */
export default function DecisionDialog({
  open,
  entityKey,
  title,
  subtitle,
  children,
  notice,
  actions,
  remarksLabel = "Remarks",
  remarksPlaceholder = "Add context for the employee…",
  showRemarks = true,
  size = "md",
  onSubmit,
  onClose,
}) {
  const [remarks, setRemarks] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState("");
  const [touchedAction, setTouchedAction] = useState(null);
  const fieldId = useId();

  // Fresh state for every opened entity.
  useEffect(() => {
    if (open) {
      setRemarks("");
      setError("");
      setBusyAction(null);
      setTouchedAction(null);
    }
  }, [open, entityKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busyAction) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busyAction, onClose]);

  if (!open) return null;

  const wide = size === "lg";
  const trimmed = remarks.trim();
  const requiredFor = actions.filter((a) => a.requireRemarks).map((a) => a.label.toLowerCase());
  const touched = touchedAction ? actions.find((a) => a.key === touchedAction) : null;
  const missingRemarks = !!touched?.requireRemarks && !trimmed;

  async function run(action) {
    if (busyAction) return;
    setTouchedAction(action.key);
    if (action.requireRemarks && !trimmed) {
      setError("");
      return;
    }
    setBusyAction(action.key);
    setError("");
    try {
      await onSubmit(action.key, trimmed);
    } catch (err) {
      setError(attendanceErrorMessage(err, `Couldn't ${action.label.toLowerCase()} this request.`));
      setBusyAction(null);
      return;
    }
    setBusyAction(null);
  }

  const decision = (
    <>
      {notice}
      {error && <InlineAlert tone="rose">{error}</InlineAlert>}

      {showRemarks && (
        <div>
          <label htmlFor={fieldId} className={LABEL}>
            {remarksLabel}
            <span className="normal-case tracking-normal font-semibold text-slate-400">
              {requiredFor.length ? ` (required to ${requiredFor.join(" / ")})` : " (optional)"}
            </span>
          </label>
          <textarea
            id={fieldId}
            rows={wide ? 6 : 3}
            maxLength={DECISION_REMARKS_MAX}
            placeholder={remarksPlaceholder}
            className={`w-full px-4 py-3 bg-white border rounded-xl text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none ${missingRemarks ? "border-rose-300" : "border-slate-200"}`}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            disabled={!!busyAction}
            aria-invalid={!!missingRemarks}
          />
          <div className="flex justify-between gap-3 mt-1">
            <span className="text-[11px] font-semibold text-rose-600">{missingRemarks ? `Please add ${remarksLabel.toLowerCase()} to ${touched.label.toLowerCase()}.` : ""}</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{remarks.length}/{DECISION_REMARKS_MAX}</span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busyAction) onClose();
      }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-6xl" : "max-w-lg"} max-h-[92vh] flex flex-col overflow-hidden`} role="dialog" aria-modal="true" aria-labelledby={`${fieldId}-title`}>
        <div className={`flex items-center justify-between gap-4 border-b border-slate-100 shrink-0 ${wide ? "px-6 sm:px-10 py-6" : "px-6 py-5"}`}>
          <div className="min-w-0">
            <h3 id={`${fieldId}-title`} className="text-lg font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="text-sm text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition disabled:opacity-40" onClick={onClose} disabled={!!busyAction} aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {wide ? (
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
            <div className="lg:min-h-0 lg:overflow-y-auto px-6 sm:px-10 py-8 space-y-6">{children}</div>
            <aside className="lg:min-h-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-100 bg-slate-50/60 px-6 sm:px-8 py-8 space-y-5">
              <p className="text-xs font-bold text-slate-700">Your decision</p>
              {decision}
            </aside>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            {children}
            {decision}
          </div>
        )}

        <div className={`shrink-0 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 ${wide ? "px-6 sm:px-10 py-5" : "px-6 py-4"}`}>
          <button
            type="button"
            className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
            onClick={onClose}
            disabled={!!busyAction}
          >
            Cancel
          </button>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`inline-flex items-center justify-center gap-2 px-8 py-3 text-sm font-semibold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed ${TONE_BUTTON[action.tone] || TONE_BUTTON.purple}`}
              onClick={() => run(action)}
              disabled={!!busyAction}
            >
              {busyAction === action.key && <Spinner />}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Label/value row used inside dialog detail sections. */
export function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-700 text-right min-w-0 break-words">{children}</span>
    </div>
  );
}
