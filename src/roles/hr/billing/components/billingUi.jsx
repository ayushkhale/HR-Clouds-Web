// ─────────────────────────────────────────────────────────────────────────────
// billingUi.jsx — The small pieces both billing screens and all three dialogs
// share: the status badge, the coloured notice panel, the seat meter and the
// two button classes.
//
// There is a shared StatusBadge in attendance/ui.jsx, and it is deliberately
// NOT used here: it resolves its tone through `statusMeta(kind, status)`, whose
// kinds are all attendance ones. A billing "pending" (an order waiting to be
// paid) would have been coloured as a pending attendance correction — right by
// accident today, wrong the moment either enum changes. So the badge below
// takes its tone from billingMeta and reuses only the shared TONE classes,
// which is what keeps it on the purple palette (§5).
// ─────────────────────────────────────────────────────────────────────────────

import { HiCheckCircle, HiExclamationCircle, HiInformationCircle } from "react-icons/hi";
import { TONE_CLASSES, TONE_DOT } from "../../../../shared/attendance/enums";
import { meterTone } from "../billingMeta";

export const PRIMARY_BTN = "px-4 py-2.5 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 transition shadow-sm shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2";
export const SECONDARY_BTN = "px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2";
export const DANGER_BTN = "px-4 py-2.5 rounded-xl text-sm font-bold text-rose-700 border border-rose-200 bg-white hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2";

/** A status pill whose tone comes from billingMeta, on the shared palette. */
export function BillingBadge({ meta, className = "" }) {
  const tone = TONE_CLASSES[meta?.tone] ? meta.tone : "slate";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      {meta?.label || "N/A"}
    </span>
  );
}

const NOTICE_TONES = {
  info: { box: "bg-purple-50/70 border-purple-100", icon: "text-purple-500", Icon: HiInformationCircle },
  good: { box: "bg-violet-50/70 border-violet-200", icon: "text-violet-500", Icon: HiCheckCircle },
  warn: { box: "bg-fuchsia-50/70 border-fuchsia-200", icon: "text-fuchsia-500", Icon: HiInformationCircle },
  error: { box: "bg-rose-50/70 border-rose-200", icon: "text-rose-500", Icon: HiExclamationCircle },
};

/**
 * The one panel shape every billing message uses. `tone="error"` is reserved
 * for something that actually went wrong — a payment we had to hold, a change
 * the server refused. A payment still being confirmed is `warn`, never
 * `error`: the money is not lost, and colouring it red sends a customer who
 * has already paid to support (see billingErrors.js).
 */
export function Notice({ tone = "info", icon, title, children, className = "" }) {
  const t = NOTICE_TONES[tone] || NOTICE_TONES.info;
  const Icon = icon || t.Icon;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed text-slate-700 ${t.box} ${className}`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${t.icon}`} />
      <div className="min-w-0">
        {title && <p className="font-bold text-slate-800">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * One seat meter — "Employees · 42 of 100" over a bar. Takes a row from
 * `seatMeters()`, so the arithmetic (and the capping) lives in billingMeta and
 * not in the markup.
 */
export function SeatMeter({ meter, help }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
          {help ? <span className="inline-flex items-center whitespace-nowrap">{meter.label}{help}</span> : meter.label}
        </p>
        <p className={`text-xs font-bold tabular-nums shrink-0 ${meter.over ? "text-rose-600" : "text-slate-700"}`}>{meter.text}</p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="presentation">
        <div className={`h-full rounded-full transition-all ${meterTone(meter)}`} style={{ width: `${meter.unlimited ? 100 : meter.pct}%`, opacity: meter.unlimited ? 0.25 : 1 }} />
      </div>
      {meter.over && <p className="text-[11px] text-rose-600 font-semibold mt-1.5">More than this plan allows</p>}
      {!meter.over && meter.full && <p className="text-[11px] text-fuchsia-700 font-semibold mt-1.5">No room left</p>}
    </div>
  );
}
