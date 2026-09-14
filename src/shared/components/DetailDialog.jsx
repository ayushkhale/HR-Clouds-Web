// ─────────────────────────────────────────────────────────────────────────────
// DetailDialog.jsx — Viewport-wide, purple-themed read-only preview used when a
// table row is clicked. Compose the body from DetailSection / DetailGrid /
// DetailStats / DetailTable so every preview in the app reads the same way.
// Empty values always render as "N/A" (never "—" or "-").
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { HiX, HiChevronRight, HiInformationCircle } from "react-icons/hi";

/** null / undefined / "" / NaN → "N/A". Numbers (including 0) are kept. */
export function displayValue(value, fallback = "N/A") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") return value.trim() ? value : fallback;
  return value;
}

const isEmpty = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (typeof v === "number" && !Number.isFinite(v));

// Several previews can be open at once (e.g. a cost preview stacked on a rule).
// Only the topmost reacts to Escape, and the body scroll lock is released only
// when the last one closes.
const layerStack = [];
let bodyOverflowBeforeLock = "";

export default function DetailDialog({ title, subtitle, eyebrow, icon: Icon, badge, onClose, footer, loading = false, children }) {
  const panelRef = useRef(null);
  // Callers pass inline arrows; a ref keeps the listeners registered once.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const layer = {};
    if (layerStack.length === 0) {
      bodyOverflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    layerStack.push(layer);
    panelRef.current?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // One Escape closes one preview, even when focus has fallen to <body>.
      if (layerStack[layerStack.length - 1] !== layer) return;
      // Ignore Escape while focus is in another layer stacked above this
      // preview (reject reason, foreclose form…) so typing there can't close it.
      const active = document.activeElement;
      if (active && active !== document.body && panelRef.current && !panelRef.current.contains(active)) return;
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const index = layerStack.indexOf(layer);
      if (index !== -1) layerStack.splice(index, 1);
      if (layerStack.length === 0) document.body.style.overflow = bodyOverflowBeforeLock;
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-3 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current?.()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-white rounded-3xl shadow-2xl shadow-purple-900/20 w-full max-h-[94vh] flex flex-col overflow-hidden outline-none animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Details"}
      >
        <div className="relative bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] px-5 sm:px-8 py-5 text-white shrink-0">
          <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_top_right,_#ffffff_0%,_transparent_45%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {Icon && (
                <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-white" />
                </div>
              )}
              <div className="min-w-0">
                {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200 mb-0.5">{eyebrow}</p>}
                <h2 className="text-lg sm:text-xl font-bold leading-tight truncate">{displayValue(title)}</h2>
                {subtitle && <p className="text-xs sm:text-sm text-purple-100/90 mt-0.5 truncate">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {badge}
              <button type="button" onClick={() => onCloseRef.current?.()} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition" aria-label="Close">
                <HiX className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-purple-50/40 px-4 sm:px-8 py-6 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-600">
              <span className="inline-block w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> Loading full details…
            </div>
          )}
          {children}
        </div>

        {footer && <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-purple-100 bg-white flex flex-wrap items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function DetailSection({ title, icon: Icon, action, children, className = "" }) {
  return (
    <section className={`bg-white border border-purple-100 rounded-2xl p-4 sm:p-5 shadow-xs ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && (
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-purple-700">
              {Icon && <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></span>}
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const GRID_COLS = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
};

/** items: [{ label, value, mono?, wide? }] or [label, value] tuples. */
export function DetailGrid({ items, cols = 4 }) {
  const rows = items.map((it) => (Array.isArray(it) ? { label: it[0], value: it[1] } : it));
  return (
    <dl className={`grid gap-3 ${GRID_COLS[cols] || GRID_COLS[4]}`}>
      {rows.map(({ label, value, mono, wide }, i) => (
        <div key={`${label}-${i}`} className={`rounded-xl bg-purple-50/70 border border-purple-100/80 px-3.5 py-3 min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-purple-500/90 mb-1">{label}</dt>
          <dd className={`text-sm font-semibold break-words ${isEmpty(value) ? "text-slate-400" : "text-slate-800"} ${mono ? "font-mono" : ""}`}>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Headline numbers. items: [{ label, value, icon?, hint? }] */
export function DetailStats({ items }) {
  const cols = items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2";
  return (
    <div className={`grid gap-3 ${cols}`}>
      {items.map(({ label, value, icon: Icon, hint }) => (
        <div key={label} className="rounded-2xl bg-gradient-to-br from-white to-purple-50 border border-purple-100 p-4 flex items-start gap-3 min-w-0">
          {Icon && <span className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">{label}</p>
            <p className={`text-xl font-black mt-0.5 truncate ${isEmpty(value) ? "text-slate-400" : "text-purple-800"}`}>{displayValue(value)}</p>
            {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Purple-only pill. tone: "solid" | "soft" | "outline" | "muted" | "onDark" */
export function DetailPill({ children, tone = "soft", className = "" }) {
  const tones = {
    solid: "bg-purple-600 text-white border-purple-600",
    soft: "bg-purple-100 text-purple-700 border-purple-200",
    outline: "bg-white text-purple-700 border-purple-300",
    muted: "bg-purple-50 text-purple-400 border-purple-100",
    onDark: "bg-white/15 text-white border-white/25",
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${tones[tone] || tones.soft} ${className}`}>{children}</span>;
}

/** columns: [{ header, render(row, i), align? }] */
export function DetailTable({ columns, rows, empty = "No records.", rowKey = (r, i) => r.id ?? i }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-purple-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-purple-50 text-[10px] uppercase font-bold tracking-wider text-purple-600">
          <tr>
            {columns.map((c) => <th key={c.header} className={`px-4 py-3 whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-purple-50 bg-white">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-xs text-slate-400">{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="hover:bg-purple-50/40">
              {columns.map((c) => {
                const v = c.render(row, i);
                return <td key={c.header} className={`px-4 py-2.5 text-slate-700 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>{isEmpty(v) ? <span className="text-slate-400">N/A</span> : v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetailText({ label, children }) {
  return (
    <div className="rounded-xl bg-purple-50/70 border border-purple-100/80 px-4 py-3">
      {label && <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500/90 mb-1">{label}</p>}
      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isEmpty(children) ? "text-slate-400" : "text-slate-700"}`}>{displayValue(children)}</p>
    </div>
  );
}

/**
 * The single control at the end of a previewable row. It is the same size on
 * every row so the column never shifts; record actions (approve, cancel…) live
 * in the preview's footer instead. `attention` fills it when the row is waiting
 * on the viewer. Keep the visible word inside `label` for voice-control users.
 */
export function RowOpenButton({ onClick, label, attention = false, children, className = "w-24" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
      className={`inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${className} ${attention ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-200" : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-50"}`}
    >
      {children ?? (attention ? "Review" : "View")} <HiChevronRight className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
}

/** Footer line that says why a record has no actions, instead of an empty footer. */
export function DetailFooterNote({ children }) {
  return (
    <p className="mr-auto flex items-start gap-2 text-xs text-slate-500">
      <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-400" /> <span>{children}</span>
    </p>
  );
}

const INTERACTIVE = "button, a, input, select, textarea, label, [data-row-action]";

/**
 * Makes a table row open a preview on click / Enter / Space while leaving inner
 * buttons, links and form controls alone. Keeps native row semantics (no
 * role/aria-label override) so screen readers still read the cell contents.
 */
export function rowPreviewProps(onOpen, label) {
  return {
    onClick: (e) => {
      if (e.target.closest(INTERACTIVE)) return;
      // Selecting text to copy (e.g. an employee code) must not open the preview.
      if (window.getSelection?.()?.toString()) return;
      onOpen();
    },
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
    },
    tabIndex: 0,
    "aria-haspopup": "dialog",
    "data-preview-label": label,
    className: "cursor-pointer hover:bg-purple-50/40 focus:bg-purple-50/60 outline-none transition-colors",
  };
}
