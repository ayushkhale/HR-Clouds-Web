// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsUi.jsx — The policy-surface card.
//
// The catalogue's 49 `surfaces[]` are multi-record policy tables — leave
// types, shift templates, holiday calendars — not singleton settings, so they
// have no values to edit here and have always had their own screens. The hub's
// only job with them is to point, which is the cure for the scavenger hunt the
// design brief describes.
//
// The editable group card lives in SettingsGroupForm.jsx. There used to be a
// read-only SettingsGroupCard here too, from Phase 1; the write plane
// superseded it, and keeping both would have meant two places to change every
// time a row's rendering did.
// ─────────────────────────────────────────────────────────────────────────────

import { HiChevronRight, HiSparkles } from "react-icons/hi";
import { Link } from "react-router-dom";

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden";
const LINK_BTN = "inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 shrink-0";

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
