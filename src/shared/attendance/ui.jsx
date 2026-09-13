// ─────────────────────────────────────────────────────────────────────────────
// attendance/ui.jsx — Small shared presentational pieces for attendance screens:
// StatusBadge, Pagination, EmptyState, ErrorState, LoadingRows, Toast (+hook),
// FieldError and PersonCell. Keeps the 8 duplicated badge maps and 6 toast
// copies from diverging again.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import { HiCheckCircle, HiExclamationCircle, HiX, HiChevronLeft, HiChevronRight, HiRefresh, HiInformationCircle } from "react-icons/hi";
import FeatureNotAvailable from "../components/FeatureNotAvailable";
import { statusMeta, TONE_CLASSES, TONE_DOT } from "./enums.js";
import { attendanceErrorMessage, isFeatureDisabled } from "../utils/attendanceErrors.js";
import { employeeCode, initials, personName } from "./normalize.js";

/** kind: "record" | "regularization" | "compoff" | "overtime" | "anomaly" | "severity" */
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

export function Pagination({ page, totalPages, total, limit, onPageChange, disabled = false, className = "" }) {
  if (!total || totalPages <= 1) {
    return total ? <p className={`text-[11px] text-slate-400 font-medium ${className}`}>{total} record{total === 1 ? "" : "s"}</p> : null;
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
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    sky: "bg-sky-50 border-sky-200 text-sky-800",
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

/** Name + code (+ optional secondary line) for any attendance entity. Never a UUID. */
export function PersonCell({ entity, secondary, size = "sm" }) {
  const name = personName(entity);
  const code = employeeCode(entity);
  const box = size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`${box} rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold shrink-0`}>
        {initials(name)}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
        {(code || secondary) && (
          <p className="text-[10px] text-slate-400 font-medium truncate">{[code, secondary].filter(Boolean).join(" · ")}</p>
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
    (message, type = "success") => {
      clearTimeout(timer.current);
      setToast({ message, type, id: Date.now() });
      timer.current = setTimeout(() => setToast(null), type === "error" ? duration + 2000 : duration);
    },
    [duration]
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, showToast, clearToast };
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  const info = toast.type === "info";
  return (
    <div
      role={ok || info ? "status" : "alert"}
      aria-live="polite"
      className={`fixed top-5 right-5 left-5 sm:left-auto z-[120] sm:max-w-sm flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border ${
        ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : info ? "bg-sky-50 text-sky-800 border-sky-200" : "bg-rose-50 text-rose-700 border-rose-200"
      }`}
    >
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : info ? <HiInformationCircle className="w-5 h-5 text-sky-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0">
        <HiX className="w-4 h-4 text-slate-400" />
      </button>
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
