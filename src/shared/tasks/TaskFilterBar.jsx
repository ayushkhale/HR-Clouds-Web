// ─────────────────────────────────────────────────────────────────────────────
// TaskFilterBar.jsx — The second row of a task list's toolbar: search,
// priority, kind of work, and (HR only) department. The status tabs are the
// row above.
//
// Traps:
//
// • IT IS A ROW OF ITS OWN, NOT THE RIGHT HALF OF THE TAB ROW. The house
//   arrangement is tabs left and search right (CLAUDE.md §5), and that is
//   still what a short tab strip gets. A task list has SEVEN status tabs with
//   sentence labels ("Waiting for review", "Changes requested"), which came to
//   more than half the card on their own: the tabs wrapped to two rows, the
//   four controls here wrapped to two more, and the department select ended up
//   alone on the last line with its ⓘ hanging off it. Given the full width the
//   tabs fit on one line and these fit on the next. Don't fold them back into
//   one row to "save a line" — it costs three.
//
// • THE SEARCH BOX GROWS, THE SELECTS DON'T. The selects are as wide as their
//   longest option and no wider; whatever is left over is the search box. It
//   used to be `w-full sm:w-56` inside an auto-width wrapper, so below the
//   `sm` breakpoint `w-full` resolved against a box that had collapsed to the
//   icon and the field all but disappeared.
//
// • SEARCH IS DEBOUNCED BEFORE IT REACHES THE QUERY KEY. `usePagedList` resets
//   to page 1 and refetches whenever `filterKey` changes, so an undebounced
//   input would fire one request per keystroke and the answers would race.
//
// • A BLANK FILTER MUST BE ABSENT, NOT EMPTY. The list endpoints validate
//   `status`/`priority`/`category` against an enum and answer 400 on "", so
//   tasks.api.js drops empty values — this component only has to keep sending
//   "" for "any".
//
// • THE DEPARTMENT FILTER IS HR-ONLY because only #266 has it. A manager gets
//   no control at all rather than one that is ignored (§2).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { HiSearch, HiX } from "react-icons/hi";
import FieldHelp from "../fieldHelp/FieldHelp";
import { TASK_CATEGORY_FILTERS, TASK_PRIORITY_FILTERS } from "./taskMeta";

const SEARCH_DEBOUNCE_MS = 350;

const selectClass =
  "h-9 bg-white border border-slate-200 rounded-xl pl-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-purple-400 transition";

export default function TaskFilterBar({ filters, onChange, departments, departmentHelp }) {
  const [text, setText] = useState(filters.search || "");

  // Keep in step when the page clears the filters from outside.
  useEffect(() => { setText(filters.search || ""); }, [filters.search]);

  useEffect(() => {
    if (text === (filters.search || "")) return undefined;
    const timer = setTimeout(() => onChange((f) => ({ ...f, search: text })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `onChange` and `filters.search` are compared, not depended on: adding them
    // would restart the timer on every keystroke's own state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const set = (key, value) => onChange((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="relative flex-1 min-w-0 sm:min-w-[14rem]">
        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by title"
          aria-label="Search tasks by title"
          className="h-9 w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-purple-400 transition"
        />
        {text && (
          <button
            type="button"
            onClick={() => setText("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700"
            aria-label="Clear the search"
          >
            <HiX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <select value={filters.priority} onChange={(e) => set("priority", e.target.value)} className={selectClass} aria-label="Filter by priority">
          {TASK_PRIORITY_FILTERS.map((option) => (
            <option key={option.value || "any"} value={option.value}>{option.label}</option>
          ))}
        </select>

        <select value={filters.category} onChange={(e) => set("category", e.target.value)} className={selectClass} aria-label="Filter by kind of work">
          {TASK_CATEGORY_FILTERS.map((option) => (
            <option key={option.value || "any"} value={option.value}>{option.label}</option>
          ))}
        </select>

        {departments && (
          <span className="inline-flex items-center gap-1">
            <select
              value={filters.department_id || ""}
              onChange={(e) => set("department_id", e.target.value)}
              className={selectClass}
              aria-label="Filter by department"
            >
              <option value="">Every department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
            {departmentHelp && <FieldHelp {...departmentHelp} label="the department filter" overlay />}
          </span>
        )}
      </div>
    </div>
  );
}
