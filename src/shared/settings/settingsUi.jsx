// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsUi.jsx — The small pieces the settings hub is built from:
// the group card, the policy-surface card, and the panel that explains why a
// group has no numbers.
//
// The hub is READ-ONLY in Phase 1 (the write plane is Phase 2 and isn't
// deployed), and these components are shaped by that one fact. There is no
// input, no Save, no dirty state — a disabled Save would be the "button that
// 403s" §2 exists to prevent. What each card offers instead is the thing that
// actually works today: a link to the module screen that owns these values.
//
// So a group card answers three questions and stops:
//   what is this?   — the catalogue's label and description
//   what is it set to?  — the live value, printed by displaySettingValue
//   where do I change it?  — editRouteFor, in the reader's own workspace
//
// `changed` (from `non_default_keys`) is the one piece of emphasis on the
// page. On a screen of ~137 rows, "which of these did we actually touch" is
// the question an auditor and a new HR admin both open it with, so it is a
// visible mark rather than something to work out by comparing with defaults.
// ─────────────────────────────────────────────────────────────────────────────

import { HiChevronRight, HiExclamationCircle, HiLockClosed, HiRefresh, HiSparkles } from "react-icons/hi";
import { Link } from "react-router-dom";
import { TONE_CLASSES } from "../attendance/enums";
import { fmtDateTime } from "../attendance/dates";
import { unavailableReason } from "../utils/settingsErrors";
import { displaySettingValue, effectTimingLabel, riskMeta } from "./settingsMeta";

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden";
const LINK_BTN = "inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 shrink-0";

/** A small tone pill, on the shared purple palette (§5). */
function Pill({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[tone] || TONE_CLASSES.slate}`}>
      {children}
    </span>
  );
}

/**
 * One settings group: its settings, what each is set to, and where to change
 * them. `editTo` is already workspace-prefixed by the caller.
 */
export function SettingsGroupCard({ group, entries, editTo, onRetry }) {
  const reason = group.unavailableReason ? unavailableReason(group.unavailableReason) : null;
  const changed = new Set(group.nonDefaultKeys || []);
  const rows = entries || [];

  return (
    <section className={CARD}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">{group.label}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {rows.length} setting{rows.length === 1 ? "" : "s"}
            {changed.size > 0 && <> · <span className="font-semibold text-purple-700">{changed.size} changed from the default</span></>}
            {group.updatedAt && <> · last changed {fmtDateTime(group.updatedAt)}</>}
          </p>
        </div>
        {editTo && (
          <Link to={editTo.path} className={LINK_BTN}>
            {editTo.label} <HiChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </header>

      {/* No numbers for this group, and the reason decides whether that is a
          state or a fault (§7 — "couldn't load" must not look like "not set"). */}
      {reason ? (
        <div className="px-5 py-4 flex items-start gap-2.5">
          {group.unavailableReason === "READ_FAILED"
            ? <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            : <HiLockClosed className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-700">{reason.label}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{reason.detail}</p>
          </div>
          {reason.retry && onRetry && (
            <button type="button" onClick={onRetry} className={LINK_BTN}>
              <HiRefresh className="w-3.5 h-3.5" /> Try again
            </button>
          )}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-500">Nothing is configurable in here yet.</p>
      ) : (
        <dl className="divide-y divide-slate-50">
          {rows.map((entry) => {
            const risk = riskMeta(entry.risk);
            const isChanged = changed.has(entry.key);
            return (
              <div key={entry.key} className="px-5 py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 flex-wrap">
                    {entry.label}
                    {isChanged && <Pill tone="purple">Changed</Pill>}
                    {risk && <Pill tone={risk.tone}>{risk.label}</Pill>}
                  </dt>
                  {entry.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{entry.description}</p>
                  )}
                </div>
                <dd className={`text-xs tabular-nums text-right shrink-0 ${group.hasValues ? "font-bold text-slate-800" : "text-slate-400"}`}>
                  {group.hasValues
                    ? displaySettingValue(group.values?.[entry.key], entry)
                    : "Couldn’t load"}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* When a change here would actually bite. Shown once per card, from the
          settings that agree — a per-row timing would be noise on a read-only
          screen nobody can change anything from. */}
      {!reason && rows.length > 0 && timingNote(rows) && (
        <p className="px-5 py-2.5 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-500">
          {timingNote(rows)}
        </p>
      )}
    </section>
  );
}

/** The one effect-timing line, when every setting in the card agrees on it. */
function timingNote(rows) {
  const timings = [...new Set(rows.map((r) => r.effect_timing).filter(Boolean))];
  return timings.length === 1 ? effectTimingLabel(timings[0]) : null;
}

/**
 * A policy surface: a multi-record area (leave types, shifts, holidays) that
 * has always had its own screen. The hub only points at it, which is the whole
 * cure for the scavenger hunt the brief describes.
 */
export function SurfaceHubCard({ surfaces, to }) {
  const first = surfaces[0];
  return (
    <section className={`${CARD} px-5 py-4 flex flex-wrap items-center justify-between gap-3`}>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <HiSparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          {to?.label || first.label}
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
          {/* Each surface is one policy area; naming them is more useful than
              a count, because the reader is looking for one of them by name. */}
          {surfaces.map((s) => s.label).join(" · ")}
        </p>
      </div>
      {to && (
        <Link to={to.path} className={`${LINK_BTN} px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-purple-300`}>
          Manage <HiChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </section>
  );
}
