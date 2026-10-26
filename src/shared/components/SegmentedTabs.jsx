// ─────────────────────────────────────────────────────────────────────────────
// SegmentedTabs.jsx — the full-width tab bar that spans its container and
// splits the room evenly between a small, fixed set of sections.
//
// ─── WHY A THIRD TAB COMPONENT, AND WHEN TO USE WHICH ──────────────────────
// It does a job neither of the other two does, and the three are not
// interchangeable:
//   · `FilterTabs` (attendance/ui.jsx) — a small inline pill group for
//     FILTERING one list (All / Pending / Done). It hugs its content and sits
//     beside a search box. Narrowing a list, not navigating.
//   · `ProfileTabStrip` — eight-plus profile sections that must NOT wrap, so
//     it scrolls with arrows and edge fades and every tab is `shrink-0`.
//     Deliberately never fills the bar: filling it is what made the labels
//     unreadable in the first place.
//   · this — a handful of equal sections that ARE the page's primary
//     navigation, where the bar should read as one solid control across the
//     full width rather than a short clump of pills with dead space after it.
// Use it for 2–7 sections. Above that the tabs get too narrow to read and
// `ProfileTabStrip` is the right answer.
//
// ─── HOW IT FILLS WITHOUT CRUSHING ─────────────────────────────────────────
// `grow shrink-0 basis-auto`, not `flex-1`. Each tab starts at the width its
// own label needs and then takes an equal share of whatever is left over, so
// the bar is full AND every label is whole. `flex-1` is `basis: 0`, which
// sizes tabs from the container instead and ellipsised "Your organis…" and
// "Time & atten…" on a laptop; a min-width floor only moved the clipping to a
// phone. `shrink-0` stops a tab being squeezed until its label is unreadable —
// `ProfileTabStrip`'s lesson kept rather than relearnt.
//
// Too many for one row and it WRAPS; it does not scroll. This bar is the
// page's whole map, and a scrolling one hid four of six areas on a phone with
// nothing on screen to say they were there. `ProfileTabStrip` can scroll
// because eight profile tabs would otherwise eat a laptop screen three rows
// deep; two or three rows of a handful on a phone is just a menu. Each wrapped
// row shares out its own slack, so every row still reaches both edges.
// `overflow-x-auto` is only the backstop for one tab wider than the bar, and
// `.no-scrollbar` hides the bar it would then show.
//
// The active tab is PURPLE, never slate-900 (user decision, 21 Oct 2026): a
// black pill on a purple product reads as a different application (§5).
// ─────────────────────────────────────────────────────────────────────────────

import { HiCheck } from "react-icons/hi";

/**
 * @param {object} props
 * @param {{ key: string, label: string, icon?: Function, count?: number, done?: boolean }[]} props.tabs
 *   `count` draws a badge only when above zero — a tab reading "0" invites the
 *   question it is there to answer. `done` draws a tick in its place, so a
 *   finished section is visibly finished rather than merely unbadged.
 * @param {string} props.value            the selected tab's key
 * @param {(key: string) => void} props.onChange
 * @param {string} props.ariaLabel        what this set of tabs is for
 */
export default function SegmentedTabs({ tabs = [], value, onChange, ariaLabel }) {
  if (!tabs.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-1.5 shadow-xs">
      <div className="flex flex-wrap gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={`group grow shrink-0 basis-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                active
                  ? "bg-gradient-to-br from-[#6D28D9] to-[#5B21B6] text-white shadow-md shadow-purple-600/25"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {Icon && (
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-purple-200" : "text-slate-400 group-hover:text-purple-500"}`} />
              )}
              <span>{tab.label}</span>
              {tab.count > 0 ? (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                  active ? "bg-white/25 text-white" : "bg-fuchsia-50 text-fuchsia-700"
                }`}>
                  {tab.count}
                </span>
              ) : tab.done ? (
                <HiCheck className={`w-4 h-4 shrink-0 ${active ? "text-purple-200" : "text-violet-500"}`} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
