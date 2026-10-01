// ─────────────────────────────────────────────────────────────────────────────
// documents/requestUi.jsx — The small presentational pieces Phase 4 adds: the
// three new badges, the completeness ring and bar, and the due-date chip.
//
// Colours come from the app's TONE_CLASSES map, so every badge stays in the
// purple family; rose is kept for the two states that mean somebody is late.
// ─────────────────────────────────────────────────────────────────────────────

import { HiClock, HiExclamationCircle } from "react-icons/hi";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { dueLabel } from "./complianceMeta";
import {
  CHECKLIST_STATE_ORDER, checklistStateMeta, notificationStatusMeta, requestDisplayStatus, requestStatusMeta,
} from "./requestMeta";

/** Shared badge body, so the three below can't drift apart. */
function Badge({ meta, className = "" }) {
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
 * Where a request stands. Pass the whole request, not its raw `status`: the
 * `open → overdue` flip is written down by a nightly job but true from the
 * moment the date passes, so the badge reads the countdown too.
 */
export function RequestStatusBadge({ request, className = "" }) {
  return <Badge meta={requestStatusMeta(requestDisplayStatus(request))} className={className} />;
}

/** One checklist item's state (on file, expiring, expired, asked for, missing…). */
export function ChecklistStateBadge({ state, className = "" }) {
  return <Badge meta={checklistStateMeta(state)} className={className} />;
}

/** An outbox row's delivery state (#87). */
export function NotificationStatusBadge({ status, className = "" }) {
  return <Badge meta={notificationStatusMeta(status)} className={className} />;
}

/**
 * "Due in 3 days" / "Overdue by 2 days" for a request, from the server's
 * `days_until_due` (negative once late). A settled request shows nothing — its
 * deadline stopped mattering the moment it was met or withdrawn.
 */
export function RequestDueChip({ request, className = "", withDate = false, fmt }) {
  const status = requestDisplayStatus(request);
  if (status === "fulfilled" || status === "cancelled") return null;
  const days = request?.days_until_due;
  const text = dueLabel(days);
  const dueOn = request?.due_on;
  if (!text && !dueOn) return null;
  const late = Number(days) < 0;
  const soon = !late && Number(days) <= 2;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${late ? "text-rose-600" : soon ? "text-fuchsia-700" : "text-slate-500"} ${className}`}>
      {late ? <HiExclamationCircle className="w-3.5 h-3.5 shrink-0" /> : <HiClock className="w-3.5 h-3.5 shrink-0" />}
      {text || (fmt ? `Due ${fmt(dueOn)}` : "")}
      {withDate && text && dueOn && fmt ? <span className="font-semibold text-slate-400">· {fmt(dueOn)}</span> : null}
    </span>
  );
}

/**
 * The completeness score as a ring.
 *
 * The number is the server's: the share of required documents that are on file
 * or expiring soon, capped at 99% while anything is still outstanding so a
 * rounded 100% never reads as "done" when it isn't. `threshold` is the bar the
 * organisation set (100% by default) and is drawn as a notch, so a score of 85%
 * against a threshold of 80% reads as a pass at a glance.
 */
export function CompletenessRing({ completeness, size = 112, className = "" }) {
  const percent = Number.isFinite(Number(completeness?.percent)) ? Math.max(0, Math.min(100, Number(completeness.percent))) : null;
  const met = completeness?.meets_threshold === true;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = percent === null ? 0 : (percent / 100) * circumference;
  const threshold = Number.isFinite(Number(completeness?.threshold)) ? Number(completeness.threshold) : null;
  // 0% at the top, running clockwise, so the notch lands where the eye expects.
  const notchAngle = threshold === null ? null : (threshold / 100) * 360 - 90;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={percent === null ? "Completeness not available" : `${percent}% of required documents provided`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-100" />
        {percent !== null && percent > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            stroke="currentColor"
            className={met ? "text-violet-500" : percent >= 50 ? "text-purple-500" : "text-fuchsia-500"}
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {notchAngle !== null && threshold > 0 && threshold < 100 && (
          <line
            x1={size / 2 + (r - stroke / 2 - 1) * Math.cos((notchAngle * Math.PI) / 180)}
            y1={size / 2 + (r - stroke / 2 - 1) * Math.sin((notchAngle * Math.PI) / 180)}
            x2={size / 2 + (r + stroke / 2 + 1) * Math.cos((notchAngle * Math.PI) / 180)}
            y2={size / 2 + (r + stroke / 2 + 1) * Math.sin((notchAngle * Math.PI) / 180)}
            stroke="currentColor" strokeWidth={2} className="text-indigo-400"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none text-slate-800">{percent === null ? "N/A" : `${percent}%`}</span>
        <span className="text-[10px] font-semibold text-slate-400 mt-1">
          {completeness?.required ? `${completeness.satisfied} of ${completeness.required}` : "nothing required"}
        </span>
      </div>
    </div>
  );
}

const STATE_SEGMENT = {
  satisfied: "bg-violet-500",
  expiring: "bg-fuchsia-400",
  expired: "bg-rose-400",
  requested: "bg-indigo-400",
  pending_upload: "bg-slate-300",
  missing: "bg-slate-200",
};

/**
 * One bar split by checklist state, with the counts under it. `onPick` turns
 * each count into a filter. The segments add up to the number of required
 * items, so the bar never over- or under-fills.
 */
export function ChecklistBar({ counts, total, active = "", onPick, compact = false }) {
  const sum = Number(total) || CHECKLIST_STATE_ORDER.reduce((n, key) => n + (Number(counts?.[key]) || 0), 0);
  const segments = CHECKLIST_STATE_ORDER.map((key) => ({ key, value: Number(counts?.[key]) || 0 })).filter((s) => s.value > 0);

  return (
    <div>
      <div className={`flex ${compact ? "h-2" : "h-2.5"} rounded-full overflow-hidden bg-slate-100`} role="img" aria-label={`${counts?.satisfied || 0} of ${sum} on file`}>
        {sum > 0 && segments.map(({ key, value }) => (
          <span key={key} className={STATE_SEGMENT[key]} style={{ width: `${(value / sum) * 100}%` }} title={`${checklistStateMeta(key).label}: ${value}`} />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {CHECKLIST_STATE_ORDER.filter((key) => (Number(counts?.[key]) || 0) > 0).map((key) => {
            const value = Number(counts[key]) || 0;
            const meta = checklistStateMeta(key);
            const selected = active === key;
            const content = (
              <>
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_SEGMENT[key]}`} aria-hidden="true" />
                <span className="text-[11px] font-semibold text-slate-500">{meta.label}</span>
                <span className={`text-[11px] font-bold tabular-nums ${key === "expired" ? "text-rose-600" : "text-slate-800"}`}>{value}</span>
              </>
            );
            if (!onPick) return <span key={key} className="inline-flex items-center gap-1.5">{content}</span>;
            return (
              <button
                key={key} type="button" aria-pressed={selected}
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
