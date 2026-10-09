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
  const title = to?.label || first.label;
  // Each surface is one policy area; naming them is more useful than a count,
  // because the reader is looking for one of them by name. But when the only
  // surface IS the screen (one registry entry, same words as the link), that
  // line is the title typed twice — so it is dropped rather than repeated.
  const names = surfaces.map((s) => s.label).join(" · ");
  const subtitle = names.toLowerCase() === title.toLowerCase() ? null : names;

  // The whole card is the link, so the target is the card — not a small word
  // at the end of it. Without a path there is nothing to point at, and a card
  // that looks clickable but isn't is the same lie as a button that 403s (§2),
  // so it renders as plain text instead.
  const Shell = to?.path ? Link : "div";
  const shellProps = to?.path
    ? { to: to.path, className: `${CARD} group block px-4 py-3 hover:border-purple-200 hover:shadow-sm transition` }
    : { className: `${CARD} block px-4 py-3` };

  return (
    <Shell {...shellProps}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-8 h-8 rounded-xl bg-purple-50 text-purple-500 inline-flex items-center justify-center">
          <HiSparkles className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-800 truncate group-hover:text-purple-800 transition">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-1">{subtitle}</p>}
        </div>
        {to?.path && (
          <span className={LINK_BTN}>
            Manage <HiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        )}
      </div>
    </Shell>
  );
}
