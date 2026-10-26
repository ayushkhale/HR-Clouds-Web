// ─────────────────────────────────────────────────────────────────────────────
// attendance/ui.jsx — Small shared presentational pieces for attendance screens:
// StatusBadge, Pagination, EmptyState, ErrorState, LoadingRows, Toast (+hook),
// FieldError and PersonCell. Keeps the 8 duplicated badge maps and 6 toast
// copies from diverging again.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HiCheckCircle, HiExclamationCircle, HiX, HiChevronLeft, HiChevronRight, HiRefresh, HiInformationCircle, HiArrowRight } from "react-icons/hi";
import FeatureNotAvailable from "../components/FeatureNotAvailable";
import { statusMeta, TONE_CLASSES, TONE_DOT } from "./enums.js";
import { dayContextLabel, isProvisionalDay, statusReasonNote } from "./dayStatus.js";
import { attendanceErrorMessage, isFeatureDisabled } from "../utils/attendanceErrors.js";
import { employeeCode, personName } from "./normalize.js";
import GenderAvatar from "../components/GenderAvatar.jsx";

/** kind: "record" | "regularization" | "compoff" | "overtime" | "anomaly" | "severity" | "device" */
export function StatusBadge({ kind = "record", status, label, className = "" }) {
  const meta = statusMeta(kind, status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone]} ${className}`}
      title={meta.longLabel}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden="true" />
      {label || meta.label}
    </span>
  );
}

/**
 * `noun` names what is being counted. The dense attendance history endpoints
 * paginate over CALENDAR DAYS, not records (contract §6), so "30 records" for
 * September would be a plain lie — pass noun="day" there.
 */
export function Pagination({ page, totalPages, total, limit, onPageChange, disabled = false, className = "", noun = "record" }) {
  if (!total || totalPages <= 1) {
    return total ? <p className={`text-[11px] text-slate-400 font-medium ${className}`}>{total} {noun}{total === 1 ? "" : "s"}</p> : null;
  }
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${className}`}>
      <p className="text-[11px] text-slate-500 font-medium">
        Showing <span className="font-bold text-slate-700">{from}–{to}</span> of <span className="font-bold text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Previous page"
        >
          <HiChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-slate-600 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Next page"
        >
          <HiChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = HiInformationCircle, title = "Nothing here yet", message, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-2 py-12 px-4 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-1">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {message && <p className="text-xs text-slate-400 max-w-sm leading-relaxed">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Error state that also handles the `attendance.access` feature flag being off.
 */
export function ErrorState({ error, onRetry, fallback = "Couldn't load this data.", className = "" }) {
  if (isFeatureDisabled(error)) {
    return (
      <div className={`py-6 ${className}`}>
        <FeatureNotAvailable title="Attendance isn't enabled" message={attendanceErrorMessage(error)} />
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 py-10 px-4 ${className}`} role="alert">
      <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-400">
        <HiExclamationCircle className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-slate-700 max-w-md">{attendanceErrorMessage(error, fallback)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition"
        >
          <HiRefresh className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 5, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-slate-100/70 animate-pulse" />
      ))}
    </div>
  );
}

export function Spinner({ className = "w-4 h-4" }) {
  return <span className={`inline-block border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} aria-hidden="true" />;
}

export function FieldError({ message, id }) {
  if (!message) return null;
  return (
    <p id={id} className="text-[11px] font-semibold text-rose-600 mt-1">
      {message}
    </p>
  );
}

export function InlineAlert({ tone = "rose", children, className = "" }) {
  const tones = {
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
    emerald: "bg-violet-50 border-violet-200 text-violet-700",
    sky: "bg-indigo-50 border-indigo-200 text-indigo-800",
    slate: "bg-slate-50 border-slate-200 text-slate-600",
  };
  const Icon = tone === "emerald" ? HiCheckCircle : tone === "sky" || tone === "slate" ? HiInformationCircle : HiExclamationCircle;
  return (
    <div className={`flex items-start gap-2 border rounded-xl px-3.5 py-2.5 text-xs font-semibold leading-relaxed ${tones[tone] || tones.rose} ${className}`} role={tone === "rose" ? "alert" : "status"}>
      <Icon className="w-4 h-4 shrink-0 mt-px" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The one-line "why this status" banner for a day inspector (contract
 * 2026-10-04). It explains a derived or not-yet-settled status in plain words,
 * and names the holiday / weekly-off rule that decided the day from the detail
 * endpoints' `status_context`. The headline case: a projected absence
 * (`awaiting_absent_cron`) reads as amber "not finalised" rather than a
 * confirmed red absence — the day's cut-off simply hasn't run yet.
 *
 * Renders nothing for a plain record that explains itself, or when the payload
 * predates the contract (no provenance keys). Lives here so the employee and
 * the HR/manager inspectors say exactly the same thing (§2).
 */
export function DayStatusNote({ record, className = "" }) {
  if (!record) return null;
  const note = statusReasonNote(record);
  const ctx = dayContextLabel(record.status_context);
  if (!note && !ctx) return null;
  return (
    <InlineAlert tone={isProvisionalDay(record) ? "amber" : "slate"} className={className}>
      {ctx ? (
        <>
          <span className="font-bold">{ctx.name}</span>
          {ctx.kind === "holiday" ? " — an org holiday" : " — a weekly off"}, so no attendance was due this day.
        </>
      ) : note}
    </InlineAlert>
  );
}

/** Name + code (+ optional secondary line) for any attendance entity. Never a UUID. */
export function PersonCell({ entity, secondary, size = "sm" }) {
  const name = personName(entity);
  const code = employeeCode(entity);
  const box = size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`${box} rounded-full overflow-hidden shrink-0`}>
        <GenderAvatar person={entity} name={name} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
        {(code || secondary) && (
          <p className="text-[10px] text-slate-400 font-medium truncate">{[...new Set([code, secondary].filter(Boolean))].join(" · ")}</p>
        )}
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
export function useToast(duration = 4000) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const clearToast = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message, type = "success", options = {}) => {
      clearTimeout(timer.current);
      const toastData = typeof message === "object" && message !== null
        ? { id: Date.now(), ...message }
        : { id: Date.now(), message, type, ...options };
      setToast(toastData);
      const effectiveDuration = toastData.duration || (toastData.type === "error" ? duration + 3000 : duration);
      timer.current = setTimeout(() => setToast(null), effectiveDuration);
    },
    [duration]
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, showToast, clearToast };
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  const isWarning = toast.type === "warning";
  const isInfo = toast.type === "info";

  const Icon = isError
    ? HiExclamationCircle
    : isWarning
    ? HiExclamationCircle
    : isInfo
    ? HiInformationCircle
    : HiCheckCircle;

  const cardStyle = isError
    ? "bg-white border-2 border-rose-200 text-slate-800 shadow-2xl shadow-rose-950/10 ring-1 ring-rose-500/10"
    : isWarning
    ? "bg-white border-2 border-amber-200 text-slate-800 shadow-2xl shadow-amber-950/10 ring-1 ring-amber-500/10"
    : isInfo
    ? "bg-white border-2 border-indigo-200 text-slate-800 shadow-2xl shadow-indigo-950/10 ring-1 ring-indigo-500/10"
    : "bg-white border-2 border-purple-200 text-slate-800 shadow-2xl shadow-purple-950/10 ring-1 ring-purple-500/10";

  const iconStyle = isError
    ? "bg-rose-50 text-rose-600 border border-rose-200"
    : isWarning
    ? "bg-amber-50 text-amber-600 border border-amber-200"
    : isInfo
    ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
    : "bg-purple-50 text-purple-600 border border-purple-200";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`fixed top-5 right-5 sm:top-6 sm:right-6 z-[99999] w-[calc(100%-2.5rem)] sm:w-auto sm:max-w-md bg-white rounded-2xl p-4 transition-all duration-300 ${cardStyle}`}
    >
      <div className="flex items-start gap-3.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconStyle}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-1">
          {toast.title ? (
            <h4 className="text-xs sm:text-sm font-bold leading-snug mb-0.5 text-slate-900">
              {toast.title}
            </h4>
          ) : (
            isError && (
              <h4 className="text-xs sm:text-sm font-bold leading-snug mb-0.5 text-slate-900">
                Action Required
              </h4>
            )
          )}
          <p className="text-xs text-slate-600 font-medium leading-relaxed break-words">
            {toast.message}
          </p>

          {toast.action && (
            <div className="mt-2.5">
              {toast.action.to ? (
                <Link
                  to={toast.action.to}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  <span>{toast.action.label}</span>
                  <HiArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    toast.action.onClick?.();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  <span>{toast.action.label}</span>
                  <HiArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
        >
          <HiX className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Segmented filter tabs. options: [{value, label}] */
export function FilterTabs({ options, value, onChange, className = "" }) {
  return (
    <div className={`inline-flex flex-wrap gap-1 bg-slate-100/80 p-1 rounded-xl ${className}`} role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${active ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
