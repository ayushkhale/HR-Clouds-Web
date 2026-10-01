// ─────────────────────────────────────────────────────────────────────────────
// documents/orgUi.jsx — The presentational pieces only the org plane needs:
// its own status badge, the recipient state badge, the bars that show how far
// a published document has got with its audience, and (Phase 3) the compliance
// verdict badge, the deadline chip and the completion meter.
//
// Everything else (fields, buttons, drop zone, empty and error states) comes
// from documents/ui.jsx unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { HiClock } from "react-icons/hi";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { RECIPIENT_STATE_ORDER, orgStatusMeta, recipientStateMeta } from "./orgDocumentMeta";
import { COMPLIANCE_ORDER, complianceStateMeta, dueLabel, percentLabel } from "./complianceMeta";

/** Status pill for an org document. Pass the display status (see orgDisplayStatus). */
export function OrgStatusBadge({ status, className = "" }) {
  const meta = orgStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate} ${className}`}
      title={meta.hint || meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
      {meta.short}
    </span>
  );
}

/** Where one addressed person has got to. */
export function RecipientStateBadge({ state, className = "" }) {
  const meta = recipientStateMeta(state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate} ${className}`}
      title={meta.hint || meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
      {meta.short}
    </span>
  );
}

const SEGMENT_CLASS = {
  pending: "bg-slate-200",
  viewed: "bg-indigo-400",
  acknowledged: "bg-violet-500",
  signed: "bg-violet-600",
  waived: "bg-purple-300",
};

/**
 * One bar, split by recipient state, over a row of counts you can click to
 * filter. `onPick` is optional — without it the counts are plain labels.
 */
export function ComplianceBar({ counts, active = "", onPick }) {
  const total = Number(counts?.total) || 0;
  const segments = RECIPIENT_STATE_ORDER
    .map((state) => ({ state, value: Number(counts?.[state]) || 0 }))
    .filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={`${total} recipients by state`}>
        {total > 0 && segments.map(({ state, value }) => (
          <span
            key={state}
            className={SEGMENT_CLASS[state] || "bg-slate-200"}
            style={{ width: `${(value / total) * 100}%` }}
            title={`${recipientStateMeta(state).label}: ${value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {RECIPIENT_STATE_ORDER.map((state) => {
          const value = Number(counts?.[state]) || 0;
          const meta = recipientStateMeta(state);
          const selected = active === state;
          const content = (
            <>
              <span className={`w-2 h-2 rounded-full shrink-0 ${SEGMENT_CLASS[state] || "bg-slate-200"}`} aria-hidden="true" />
              <span className="text-[11px] font-semibold text-slate-500">{meta.label}</span>
              <span className="text-[11px] font-bold text-slate-800 tabular-nums">{value}</span>
            </>
          );
          if (!onPick) return <span key={state} className="inline-flex items-center gap-1.5">{content}</span>;
          return (
            <button
              key={state}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(selected ? "" : state)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg transition ${selected ? "bg-purple-50 ring-1 ring-purple-200" : "hover:bg-slate-50"}`}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Phase 3 ─────────────────────────────────────────────────────────────────

/** Done / Waiting / Overdue / Excused — today's verdict, not the stored state. */
export function ComplianceStateBadge({ state, className = "" }) {
  const meta = complianceStateMeta(state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate} ${className}`}
      title={meta.hint || meta.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
      {meta.short}
    </span>
  );
}

/**
 * "Due in 3 days" / "Overdue by 2 days", from the server's `days_remaining`.
 * Nothing renders without a deadline, and a finished item shows no countdown.
 */
export function DueChip({ daysRemaining, dueOn, done = false, className = "", withDate = false, fmt }) {
  if (done) return null;
  const text = dueLabel(daysRemaining);
  if (!text && !dueOn) return null;
  const late = Number(daysRemaining) < 0;
  const soon = !late && Number(daysRemaining) <= 2;
  const tone = late ? "text-rose-600" : soon ? "text-fuchsia-700" : "text-slate-500";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${tone} ${className}`}>
      <HiClock className="w-3.5 h-3.5 shrink-0" />
      {text || (fmt ? `Due ${fmt(dueOn)}` : "")}
      {withDate && text && dueOn && fmt ? <span className="font-semibold text-slate-400">· {fmt(dueOn)}</span> : null}
    </span>
  );
}

const COMPLIANCE_SEGMENT = {
  completed: "bg-violet-500",
  pending: "bg-indigo-300",
  overdue: "bg-rose-400",
  waived: "bg-purple-200",
};

/**
 * One bar split into done / waiting / overdue / excused, with the counts under
 * it. The four always add up to `total` (the server guarantees it), so the bar
 * never over- or under-fills. `onPick` turns the counts into filters.
 */
export function CompletionBar({ counts, active = "", onPick, compact = false }) {
  const total = Number(counts?.total) || 0;
  const segments = COMPLIANCE_ORDER
    .map((key) => ({ key, value: Number(counts?.[key]) || 0 }))
    .filter((s) => s.value > 0);

  return (
    <div>
      <div className={`flex ${compact ? "h-2" : "h-2.5"} rounded-full overflow-hidden bg-slate-100`} role="img" aria-label={`${counts?.completed || 0} of ${total} done`}>
        {total > 0 && segments.map(({ key, value }) => (
          <span key={key} className={COMPLIANCE_SEGMENT[key]} style={{ width: `${(value / total) * 100}%` }} title={`${complianceStateMeta(key).label}: ${value}`} />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {COMPLIANCE_ORDER.map((key) => {
            const value = Number(counts?.[key]) || 0;
            const meta = complianceStateMeta(key);
            const selected = active === key;
            const content = (
              <>
                <span className={`w-2 h-2 rounded-full shrink-0 ${COMPLIANCE_SEGMENT[key]}`} aria-hidden="true" />
                <span className="text-[11px] font-semibold text-slate-500">{meta.label}</span>
                <span className={`text-[11px] font-bold tabular-nums ${key === "overdue" && value > 0 ? "text-rose-600" : "text-slate-800"}`}>{value}</span>
              </>
            );
            if (!onPick) return <span key={key} className="inline-flex items-center gap-1.5">{content}</span>;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(selected ? "" : key)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg transition ${selected ? "bg-purple-50 ring-1 ring-purple-200" : "hover:bg-slate-50"}`}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A thin meter with its percentage — for table cells. */
export function RateMeter({ rate, className = "" }) {
  const n = Number.isFinite(Number(rate)) ? Math.max(0, Math.min(100, Number(rate))) : null;
  return (
    <div className={`flex items-center gap-2 min-w-[120px] ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        {n !== null && <span className="block h-full bg-violet-500 rounded-full" style={{ width: `${n}%` }} />}
      </div>
      <span className="text-xs font-bold text-slate-700 tabular-nums w-12 text-right">{percentLabel(rate)}</span>
    </div>
  );
}

