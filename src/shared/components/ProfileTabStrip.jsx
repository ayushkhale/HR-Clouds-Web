// ─────────────────────────────────────────────────────────────────────────────
// ProfileTabStrip.jsx — the tab bar on an employee's profile, shared by HR
// (EmployeeProfilePage) and a manager (ManagerMemberProfilePage) so the two
// workspaces keep one tab bar between them (CLAUDE.md §2).
//
// It scrolls horizontally rather than wrapping: with eight tabs a wrapped bar
// grew to two or three rows on a laptop and pushed the content below the fold,
// and the tabs moved line to line as the window resized.
//
// The reason wrapping was tried in the first place still stands, though — a
// plain hidden-scrollbar strip cut the last tabs off with nothing on screen to
// say they were there. So the scroll gets real affordances:
//   • arrow buttons appear only on the side that has more tabs, and scroll by
//     about one screenful;
//   • a fade over each scrollable edge, so a half-cut tab reads as "more here"
//     rather than as a rendering fault;
//   • the selected tab is always scrolled into view, including on first paint
//     and when a deep link picks the last tab.
//
// The arrows sit OUTSIDE the `role="tablist"` element: a non-tab child of a
// tablist is invalid, and a keyboard user never needs them — focusing a tab
// scrolls it into view, so ← / → through the tabs walks the whole strip.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";

/**
 * @param {object} props
 * @param {{ key: string, label: string, icon: Function }[]} props.tabs
 * @param {string} props.activeTab   the selected tab's key
 * @param {(key: string) => void} props.onChange
 */
export default function ProfileTabStrip({ tabs = [], activeTab, onChange }) {
  const stripRef = useRef(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // 1px of slack: fractional scroll positions otherwise leave an arrow
    // enabled at the very end of the strip with nothing left to scroll to.
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    measure();
    // Tab labels are static, but the strip's width is not: the sidebar folds,
    // the window resizes, and a font can load late.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, tabs.length]);

  // Keep the selected tab visible — on first paint and whenever it changes.
  useEffect(() => {
    const el = stripRef.current;
    const tab = el?.querySelector('[aria-selected="true"]');
    if (!tab) return;
    // `nearest` so an already-visible tab doesn't jolt the strip sideways, and
    // block: "nearest" so this never scrolls the page itself.
    tab.scrollIntoView({ inline: "nearest", block: "nearest" });
    measure();
  }, [activeTab, measure]);

  const scrollBy = (direction) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.75), behavior: "smooth" });
  };

  const arrow = "absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 shadow-sm hover:text-purple-700 hover:border-purple-200 transition";
  const fade = "pointer-events-none absolute inset-y-1 w-10 z-[5]";

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 p-2">
      {overflow.left && (
        <>
          <span className={`${fade} left-1 bg-gradient-to-r from-white to-transparent rounded-l-xl`} aria-hidden="true" />
          <button type="button" onClick={() => scrollBy(-1)} tabIndex={-1} aria-hidden="true" className={`${arrow} left-1`}>
            <HiChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}

      <div ref={stripRef} onScroll={measure} className="flex gap-1 overflow-x-auto no-scrollbar scroll-smooth" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              // `shrink-0` is what makes the strip scroll instead of squashing
              // eight tabs until their labels are unreadable.
              className={`shrink-0 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {overflow.right && (
        <>
          <span className={`${fade} right-1 bg-gradient-to-l from-white to-transparent rounded-r-xl`} aria-hidden="true" />
          <button type="button" onClick={() => scrollBy(1)} tabIndex={-1} aria-hidden="true" className={`${arrow} right-1`}>
            <HiChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
