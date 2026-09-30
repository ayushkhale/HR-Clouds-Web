// ─────────────────────────────────────────────────────────────────────────────
// DetailDialog.jsx — Read-only preview opened by clicking a table row. Same
// size, header, section cards and label/field look as the Invite Team Member
// dialog, so previews read like the rest of the app: one titled section after
// another, each a grid of labelled values. Compose the body from DetailSection /
// DetailGrid / DetailStats / DetailTable / DetailText.
// Empty values always render as "N/A" (never "—" or "-").
//
// ⓘ help (fieldHelp.json): a DetailGrid/DetailStats item may carry
// `help: { surface, field }`, and DetailSection takes a `help` prop. All three
// are optional and render nothing extra without it — HR and manager screens
// share these components. The config decides which workspaces see an ⓘ. A
// section's ⓘ sits in the header's right-hand area, never inside the fold
// toggle <button>: nested controls are invalid and the click would fold it.
//
// `width` is opt-in and defaults to the full `wide`, so every existing preview
// is unchanged. Narrow it only for a dialog that opens on a short form and
// fills up later (the template preview waits for a CTC before it has anything
// to show) — at full width those sit stretched around a couple of fields. The
// max-width transitions, so growing when the content arrives isn't a jump.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from "react";
import { HiX, HiInformationCircle, HiChevronDown } from "react-icons/hi";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { getFieldHelp } from "../fieldHelp/fieldHelpMeta";
import { useWorkspace } from "../contexts/WorkspaceContext";

/** null / undefined / "" / NaN → "N/A". Numbers (including 0) are kept. */
export function displayValue(value, fallback = "N/A") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") return value.trim() ? value : fallback;
  return value;
}

const isEmpty = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (typeof v === "number" && !Number.isFinite(v));

// Same label and read-only "field" look as the invite form inputs.
const LABEL = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5";
const FIELD = "min-h-10 flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2 text-xs";

// Several previews can be open at once (e.g. a cost preview stacked on a rule).
// Only the topmost reacts to Escape, and the body scroll lock is released only
// when the last one closes.
const layerStack = [];
let bodyOverflowBeforeLock = "";

const DIALOG_WIDTH = { compact: "max-w-2xl", medium: "max-w-4xl", wide: "max-w-6xl" };

export default function DetailDialog({ title, subtitle, eyebrow, icon: Icon, badge, onClose, footer, loading = false, width = "wide", children }) {
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
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current?.()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`bg-white rounded-2xl border border-slate-100 shadow-2xl ${DIALOG_WIDTH[width] || DIALOG_WIDTH.wide} w-full max-h-[90vh] flex flex-col outline-none animate-in fade-in zoom-in-95 duration-200 transition-[max-width]`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Details"}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              {eyebrow && <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">{eyebrow}</p>}
              <h3 className="font-bold text-slate-900 text-base truncate">{displayValue(title)}</h3>
              {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {badge}
            <button type="button" onClick={() => onCloseRef.current?.()} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Close">
              <HiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-600">
              <span className="inline-block w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> Loading full details…
            </div>
          )}
          {children}
        </div>

        {footer && <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * A titled card, styled like the invite form's sections.
 * Every titled section collapses from a chevron in its header, so a long popup
 * can be folded down to the parts you need. `defaultOpen={false}` starts it
 * folded (for long tables); `collapsible={false}` pins it open.
 */
export function DetailSection({ title, icon: Icon, action, help, children, className = "", collapsible = true, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const canCollapse = collapsible && !!title;
  // Resolved here, not left to FieldHelp: a `help` with nothing for this
  // workspace must not open an empty right-hand slot (it takes 12px and would
  // shift the title in HR/manager, who share this component).
  const workspace = useWorkspace();
  const showHelp = !!help && !!getFieldHelp(help.surface, help.field, workspace);
  const heading = title && (
    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 min-w-0">
      {Icon && <Icon className="w-4 h-4 text-purple-600 shrink-0" />}
      <span className="truncate">{title}</span>
    </h4>
  );
  return (
    <section className={`border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs ${className}`}>
      {(title || action || showHelp) && (
        <div className={`flex items-center justify-between gap-3 bg-slate-50/80 ${open ? "border-b border-slate-100" : ""}`}>
          {canCollapse ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={bodyId}
              className="flex-1 min-w-0 flex items-center gap-2 px-5 py-3.5 text-left hover:bg-slate-100/60 transition-colors"
            >
              {heading}
            </button>
          ) : (
            <div className="flex-1 min-w-0 px-5 py-3.5">{heading}</div>
          )}
          {(action || canCollapse || showHelp) && (
            <div className="flex items-center gap-2 pr-3 shrink-0">
              {showHelp && <FieldHelp surface={help.surface} field={help.field} label={help.label || (typeof title === "string" ? title : undefined)} />}
              {action}
              {canCollapse && (
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  aria-controls={bodyId}
                  aria-label={open ? `Collapse ${typeof title === "string" ? title : "section"}` : `Expand ${typeof title === "string" ? title : "section"}`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-white transition-colors"
                >
                  <HiChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {open && <div id={bodyId} className="p-5">{children}</div>}
    </section>
  );
}

const GRID_COLS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
};

/** items: [{ label, value, mono?, wide?, help? }] or [label, value] tuples. Labels sit above their values, like form fields. */
export function DetailGrid({ items, cols = 4 }) {
  const rows = items.map((it) => (Array.isArray(it) ? { label: it[0], value: it[1] } : it));
  return (
    <dl className={`grid gap-4 ${GRID_COLS[Math.min(cols, 4)] || GRID_COLS[4]}`}>
      {rows.map(({ label, value, mono, wide, help }, i) => (
        <div key={`${label}-${i}`} className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
          <dt className={LABEL}><HelpLabel text={label} help={help} /></dt>
          <dd className={`${FIELD} break-words ${isEmpty(value) ? "text-slate-400" : "text-slate-800 font-semibold"} ${mono ? "font-mono" : ""}`}>
            <span className="min-w-0 break-words">{displayValue(value)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Headline numbers. items: [{ label, value, icon?, hint?, help? }] */
export function DetailStats({ items }) {
  const cols = items.length >= 4 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2";
  return (
    <div className={`grid gap-4 ${cols}`}>
      {items.map(({ label, value, icon: Icon, hint, help }) => (
        <div key={label} className="border border-slate-200/80 rounded-2xl bg-white shadow-2xs px-4 py-3.5 flex items-center gap-3 min-w-0">
          {Icon && <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>}
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider"><HelpLabel text={label} help={help} /></p>
            <p className={`text-lg font-bold mt-0.5 truncate ${isEmpty(value) ? "text-slate-400" : "text-slate-900"}`}>{displayValue(value)}</p>
            {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Purple-only pill. tone: "solid" | "soft" | "outline" | "muted" | "onDark" (kept for callers; same as soft on the white header). */
export function DetailPill({ children, tone = "soft", className = "" }) {
  const tones = {
    solid: "bg-purple-600 text-white border-purple-600",
    soft: "bg-purple-50 text-purple-700 border-purple-200",
    outline: "bg-white text-purple-700 border-purple-300",
    muted: "bg-slate-50 text-slate-500 border-slate-200",
    onDark: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${tones[tone] || tones.soft} ${className}`}>{children}</span>;
}

/** columns: [{ header, render(row, i), align?, help? }] — `help` ({ surface, field, … }) puts an ⓘ on that header; none in this workspace → the plain text, as before. */
export function DetailTable({ columns, rows, empty = "No records.", rowKey = (r, i) => r.id ?? i }) {
  const alignCls = (c) => (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "");
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50/80 text-[11px] uppercase font-bold tracking-wider text-slate-600 border-b border-slate-100">
          <tr>
            {columns.map((c) => <th key={c.header} className={`px-4 py-3 whitespace-nowrap ${alignCls(c)}`}><HelpLabel text={c.header} help={c.help} /></th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-xs text-slate-400">{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="hover:bg-slate-50/60">
              {columns.map((c) => {
                const v = c.render(row, i);
                return <td key={c.header} className={`px-4 py-2.5 text-slate-800 ${alignCls(c)}`}>{isEmpty(v) ? <span className="text-slate-400">N/A</span> : v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Long text (reasons, notes) under a field label. */
export function DetailText({ label, children }) {
  return (
    <div className="min-w-0">
      {label && <p className={LABEL}>{label}</p>}
      <p className={`bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${isEmpty(children) ? "text-slate-400" : "text-slate-800"}`}>{displayValue(children)}</p>
    </div>
  );
}

/** Footer line that says why a record has no actions, instead of an empty footer. */
export function DetailFooterNote({ children }) {
  return (
    <p className="mr-auto flex items-start gap-2 text-xs text-slate-500">
      <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500" /> <span>{children}</span>
    </p>
  );
}

const INTERACTIVE = "button, a, input, select, textarea, label, [data-row-action]";

/**
 * Makes a table row open its preview on click / Enter / Space — the row is the
 * only way in (no separate View button), so it is always a keyboard stop. Inner
 * buttons, links and form controls keep their own behaviour. Keeps native row
 * semantics so screen readers still read the cell contents.
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
