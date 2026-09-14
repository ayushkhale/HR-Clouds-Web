// ─────────────────────────────────────────────────────────────────────────────
// ReasonDialog.jsx — Purple, stack-safe dialog for any action the backend
// refuses without a written reason (cancel a run, reject a proposal, exclude an
// employee…). A plain window.confirm has no text box, so those actions used to
// fail with "reason is required". Sits above DetailDialog (z-140).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiX } from "react-icons/hi";

const MAX_LENGTH = 1000;

/**
 * @param {object} props
 * @param {string} props.title
 * @param {React.ReactNode} [props.description]  context shown above the field
 * @param {string} [props.label]                 label of the reason field
 * @param {string} [props.placeholder]
 * @param {string} [props.confirmLabel]
 * @param {"primary"|"danger"} [props.tone]
 * @param {number} [props.minLength]             trimmed length required
 * @param {boolean} [props.busy]
 * @param {string} [props.error]                 server error to show inline
 * @param {React.ReactNode} [props.children]     extra fields rendered above the reason
 * @param {boolean} [props.canSubmit]            extra gate from the caller's own fields
 * @param {(reason: string) => void} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function ReasonDialog({
  title,
  description,
  label = "Reason",
  placeholder = "Write a short reason",
  confirmLabel = "Confirm",
  tone = "primary",
  minLength = 3,
  busy = false,
  error = "",
  children,
  canSubmit = true,
  onSubmit,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const fieldRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    // Focus the reason unless the caller put its own fields first.
    if (!children) fieldRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    // Capture so the Escape never reaches a preview dialog underneath.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < minLength;
  const disabled = busy || tooShort || !canSubmit;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (disabled) return;
    onSubmit(trimmed);
  };

  const confirmCls = tone === "danger"
    ? "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
    : "bg-purple-600 hover:bg-purple-700 shadow-purple-200";

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {description && <div className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</div>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {children}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">
              {label} <span className="text-rose-500">*</span>
            </label>
            <textarea
              ref={fieldRef}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_LENGTH))}
              onBlur={() => setTouched(true)}
              rows={4}
              placeholder={placeholder}
              aria-invalid={touched && tooShort}
              className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:bg-white outline-none resize-none transition ${touched && tooShort ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-purple-400"}`}
            />
            <div className="flex items-center justify-between mt-1.5 text-[11px]">
              <span className={touched && tooShort ? "text-rose-600 font-semibold" : "text-slate-400"}>
                {touched && tooShort ? `Please write at least ${minLength} characters.` : "This is saved in the audit log."}
              </span>
              <span className="text-slate-400 tabular-nums">{reason.length}/{MAX_LENGTH}</span>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{error}</p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            Go back
          </button>
          <button type="submit" disabled={disabled} className={`sm:min-w-[170px] px-5 py-2.5 rounded-xl font-bold text-sm text-white transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 ${confirmCls}`}>
            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
