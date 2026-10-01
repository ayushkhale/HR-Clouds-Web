// ─────────────────────────────────────────────────────────────────────────────
// organization/OrgChartList.jsx — The org chart as an indented outline. Same
// data, same folds and the same person dialog as the drawn chart; it is the
// default on a phone (a drawn chart is a lot of panning at 390px) and the
// better way through for keyboard and screen-reader users.
//
// It follows the WAI-ARIA tree pattern: one tab stop (roving tabindex), ↑/↓
// move, → opens a team or steps into it, ← closes it or climbs to the manager,
// Home/End jump, Enter opens the person. The fold chevron is part of the row's
// keyboard model rather than a separate tab stop, so a 300-person org isn't
// 600 Tab presses; for the pointer it is still its own click target.
//
// Only unfolded rows are rendered, which is what keeps a large organisation
// light — the top of the chart opens and the rest waits until asked for.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiChevronRight, HiExclamation } from "react-icons/hi";
import GenderAvatar from "../components/GenderAvatar";
import { departmentKeyOf, departmentTone, roleMetaOf, visibleRows } from "./orgChartMeta";

export default function OrgChartList({
  index, expanded, onToggle, onOpen, selectedId, pathIds, deptFilter, myId, showFormerManager, onPhotoError, focusTarget,
}) {
  const rows = visibleRows(index.roots, expanded);
  const [activeId, setActiveId] = useState(null);
  const treeRef = useRef(null);
  const current = rows.some((r) => r.id === activeId) ? activeId : rows[0]?.id;

  const focusRow = (id) => {
    setActiveId(id);
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    treeRef.current?.querySelector(`[data-row="${esc}"]`)?.focus();
  };

  // Search / Find me: move the roving focus there and bring it into view.
  const handledFocus = useRef(0);
  useEffect(() => {
    if (!focusTarget || focusTarget.n === handledFocus.current) return;
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(focusTarget.id) : focusTarget.id;
    const el = treeRef.current?.querySelector(`[data-row="${esc}"]`);
    if (!el) return;
    handledFocus.current = focusTarget.n;
    setActiveId(focusTarget.id);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusTarget, rows.length]);

  const onKeyDown = (e, node, i) => {
    const open = expanded.has(node.id);
    const has = node.children.length > 0;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); if (rows[i + 1]) focusRow(rows[i + 1].id); break;
      case "ArrowUp": e.preventDefault(); if (rows[i - 1]) focusRow(rows[i - 1].id); break;
      case "Home": e.preventDefault(); focusRow(rows[0].id); break;
      case "End": e.preventDefault(); focusRow(rows[rows.length - 1].id); break;
      case "ArrowRight":
        e.preventDefault();
        if (has && !open) onToggle(node.id);
        else if (has && open) focusRow(node.children[0].id);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (has && open) onToggle(node.id);
        else if (node.parentId) focusRow(node.parentId);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onOpen(node.id);
        break;
      default:
    }
  };

  return (
    <ul ref={treeRef} role="tree" aria-label="Organisation chart" className="divide-y divide-slate-100">
      {rows.map((node, i) => {
        const role = roleMetaOf(node.role);
        const tone = departmentTone(node.department);
        const has = node.children.length > 0;
        const open = has && expanded.has(node.id);
        const selected = node.id === selectedId;
        const onPath = !selected && pathIds.has(node.id);
        const dimmed = !!deptFilter && departmentKeyOf(node) !== deptFilter;
        const isMe = node.id === myId;
        return (
          <li
            key={node.id}
            role="treeitem"
            data-row={node.id}
            aria-level={node.level + 1}
            aria-expanded={has ? open : undefined}
            aria-selected={selected}
            aria-haspopup="dialog"
            tabIndex={node.id === current ? 0 : -1}
            onFocus={() => setActiveId(node.id)}
            onKeyDown={(e) => { if (e.target === e.currentTarget) onKeyDown(e, node, i); }}
            onClick={(e) => { if (!e.target.closest("[data-fold]")) onOpen(node.id); }}
            className={`relative flex items-center gap-3 pr-3 sm:pr-4 py-2.5 cursor-pointer outline-none transition-colors focus-visible:bg-purple-50/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-300 ${
              selected ? "bg-purple-50" : onPath ? "bg-purple-50/40" : "hover:bg-slate-50"
            } ${dimmed ? "opacity-40" : ""}`}
            style={{ paddingLeft: `${12 + node.level * 22}px` }}
          >
            {/* Indent guides, one per level above. */}
            {Array.from({ length: node.level }).map((_, l) => (
              <span key={l} aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-slate-200/80" style={{ left: `${23 + l * 22}px` }} />
            ))}
            {has ? (
              <button
                type="button"
                data-fold=""
                tabIndex={-1}
                onClick={() => onToggle(node.id)}
                aria-label={`${open ? "Hide" : "Show"} the ${node.children.length} ${node.children.length === 1 ? "person" : "people"} reporting to ${node.name}`}
                className="relative z-10 w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:text-purple-700 hover:bg-purple-100 transition-colors"
              >
                <HiChevronRight className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-6 shrink-0" aria-hidden="true" />
            )}
            <span className={`w-9 h-9 rounded-full overflow-hidden bg-purple-50 shrink-0 text-xs ring-2 ring-offset-1 ring-offset-white ${role.ring}`}>
              <GenderAvatar person={node} name={node.name} onPhotoError={onPhotoError} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-bold text-slate-900 truncate">{node.name}</span>
                {isMe && <span className="px-1.5 py-px rounded-md bg-purple-600 text-white text-[9px] font-bold uppercase tracking-wider shrink-0">You</span>}
                {node.role !== "employee" && (
                  <span className={`hidden sm:inline px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0 ${role.tag}`}>{node.role === "hr" ? "HR" : role.label}</span>
                )}
                {!isMe && showFormerManager && node.formerManager && (
                  <HiExclamation className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" title="The person they reported to is no longer active" />
                )}
              </span>
              <span className="block text-xs text-slate-500 truncate">{node.designation || "No job title yet"}</span>
            </span>
            <span className={`hidden md:inline-flex max-w-[12rem] items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${tone.chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
              <span className="truncate">{node.department || "No department"}</span>
            </span>
            {has && (
              <span className="hidden sm:inline shrink-0 text-[11px] font-bold text-slate-500 tabular-nums w-20 text-right">
                {node.teamSize} in team
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
