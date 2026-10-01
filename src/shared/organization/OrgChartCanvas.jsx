// ─────────────────────────────────────────────────────────────────────────────
// organization/OrgChartCanvas.jsx — The drawn org chart: the company at the
// top, people below it as cards, joined by reporting lines. Drag to move,
// ctrl/⌘ + scroll or pinch to zoom, fold any team from the pill under a card.
//
// How it's drawn, and why:
// • Layout is plain nested flexbox — each person is a column of "their card"
//   over "a row of their team". No layout algorithm, no absolute positions per
//   node; the browser does it, and it's always centred under the manager.
// • The lines are ONE SVG layer measured after layout (offsetLeft/offsetTop,
//   which ignore the pan/zoom transform). Pseudo-element connectors were the
//   alternative; they can't highlight a single reporting line from the top to a
//   selected person, and that highlight is the point of search and "Find me".
// • A team where nobody has reports of their own, and there are enough of them
//   to stretch the chart sideways (STACK_AT), is drawn as one compact stacked
//   panel. A support lead with 30 agents otherwise made the chart 7,000px wide.
// • Folding a team keeps the card you clicked still on screen: the flex layout
//   re-centres everything when a row changes width, and without the correction
//   the card jumped away from under the pointer.
// • The canvas never scrolls. Tabbing to an off-screen card would make the
//   browser scroll the overflow-hidden viewport and throw every later
//   calculation off, so scroll is reset and the card is centred instead.
// • Every card is a real <button> (opens the person) with the fold pill as a
//   SIBLING button, never nested. The List view is the screen-reader-first way
//   through the same data; this view is for seeing the shape.
// ─────────────────────────────────────────────────────────────────────────────

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  HiChevronDown,
  HiChevronUp,
  HiMinus,
  HiPlus,
  HiArrowsExpand,
  HiOfficeBuilding,
  HiViewGrid,
  HiExclamation,
  HiX,
} from "react-icons/hi";
import GenderAvatar from "../components/GenderAvatar";
import { useReducedMotion } from "../motion";
import usePanZoom, { offsetWithin } from "./usePanZoom";
import { NO_DEPARTMENT, ROLE_META, departmentKeyOf, departmentTone, isStackedTeam, roleMetaOf } from "./orgChartMeta";

export const ORG_ANCHOR = "__org__";
const teamAnchor = (id) => `${id}::team`;
const LINE_GAP = "pt-12";

// Rounded elbow from a parent's bottom-centre to a child's top-centre.
function elbowPath(px, py, cx, cy) {
  if (Math.abs(cx - px) < 0.5) return `M${px},${py} V${cy}`;
  const mid = py + (cy - py) / 2;
  const dir = cx > px ? 1 : -1;
  const r = Math.min(12, Math.abs(cx - px) / 2, (cy - py) / 2);
  return `M${px},${py} V${mid - r} Q${px},${mid} ${px + dir * r},${mid} H${cx - dir * r} Q${cx},${mid} ${cx},${mid + r} V${cy}`;
}

// ── One person ─────────────────────────────────────────────────────────────
function PersonNode({ node, ctx }) {
  const role = roleMetaOf(node.role);
  const tone = departmentTone(node.department);
  const isMe = node.id === ctx.myId;
  const selected = node.id === ctx.selectedId;
  const onPath = !selected && ctx.pathIds.has(node.id);
  const dimmed = !!ctx.deptFilter && departmentKeyOf(node) !== ctx.deptFilter;
  const reports = node.children.length;
  const open = reports > 0 && ctx.expanded.has(node.id);

  return (
    <div
      data-oc-anchor={node.id}
      className={`relative flex flex-col items-center transition-opacity duration-200 ${dimmed ? "opacity-30" : ""}`}
    >
      <button
        type="button"
        onClick={() => ctx.onOpen(node.id)}
        aria-haspopup="dialog"
        aria-label={`${node.name}${node.designation ? `, ${node.designation}` : ""}${isMe ? " (you)" : ""}. Open details`}
        className="group relative flex flex-col items-center w-[212px] rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-purple-300/60"
      >
        <span
          className={`relative z-10 w-14 h-14 rounded-full overflow-hidden bg-purple-50 text-lg ring-[3px] ring-offset-2 ring-offset-white shadow-md ${role.ring}`}
        >
          <GenderAvatar person={node} name={node.name} onPhotoError={ctx.onPhotoError} />
        </span>
        <span
          className={`-mt-7 w-full relative overflow-hidden rounded-2xl bg-white border pt-9 pb-4 px-3.5 text-center transition-all duration-200 ${
            selected
              ? "border-purple-400 shadow-lg shadow-purple-300/40 ring-2 ring-purple-500"
              : onPath
                ? "border-purple-300 shadow-md shadow-purple-200/40"
                : "border-slate-200/80 shadow-sm group-hover:shadow-lg group-hover:shadow-purple-200/40 group-hover:border-purple-200"
          }`}
        >
          <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${role.bar}`} aria-hidden="true" />
          {node.role !== "employee" && (
            <span className={`absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${role.tag}`}>
              {node.role === "hr" ? "HR" : role.label}
            </span>
          )}
          {isMe && (
            <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-purple-600 text-white">You</span>
          )}
          {!isMe && ctx.showFormerManager && node.formerManager && (
            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center" title="The person they reported to is no longer active">
              <HiExclamation className="w-3 h-3" />
            </span>
          )}
          <span className="block text-sm font-bold text-slate-900 truncate">{node.name}</span>
          <span className={`block text-xs truncate mt-0.5 ${node.designation ? "text-slate-500" : "text-slate-400 italic"}`}>
            {node.designation || "No job title yet"}
          </span>
          <span className={`mt-2.5 inline-flex max-w-full items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${tone.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
            <span className="truncate">{node.department || "No department"}</span>
          </span>
        </span>
      </button>

      {reports > 0 && (
        <button
          type="button"
          onClick={() => ctx.onToggle(node.id)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the ${reports} ${reports === 1 ? "person" : "people"} reporting to ${node.name}`}
          className={`absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 h-6 min-w-[2.75rem] px-2 inline-flex items-center justify-center gap-1 rounded-full border text-[11px] font-bold shadow-sm transition-colors outline-none focus-visible:ring-4 focus-visible:ring-purple-300/60 ${
            open
              ? "bg-white text-purple-700 border-purple-200 hover:bg-purple-50"
              : "bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
          }`}
        >
          {open ? <HiChevronUp className="w-3.5 h-3.5" /> : <HiChevronDown className="w-3.5 h-3.5" />}
          {reports}
        </button>
      )}
    </div>
  );
}

// ── A flat team drawn as one stacked panel ─────────────────────────────────
function TeamStack({ parent, ctx }) {
  const people = parent.children;
  const twoCols = people.length > 8;
  return (
    <div
      data-oc-anchor={teamAnchor(parent.id)}
      className={`relative rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm p-2 ${twoCols ? "w-[520px]" : "w-[272px]"}`}
    >
      <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Reporting to {parent.name.split(/\s+/)[0]} · {people.length}
      </p>
      <ul className={`grid gap-1 ${twoCols ? "grid-cols-2" : "grid-cols-1"}`}>
        {people.map((p) => {
          const role = roleMetaOf(p.role);
          const tone = departmentTone(p.department);
          const selected = p.id === ctx.selectedId;
          const dimmed = !!ctx.deptFilter && departmentKeyOf(p) !== ctx.deptFilter;
          const isMe = p.id === ctx.myId;
          return (
            <li key={p.id} data-oc-anchor={p.id} className={`transition-opacity ${dimmed ? "opacity-30" : ""}`}>
              <button
                type="button"
                onClick={() => ctx.onOpen(p.id)}
                aria-haspopup="dialog"
                aria-label={`${p.name}${p.designation ? `, ${p.designation}` : ""}${isMe ? " (you)" : ""}. Open details`}
                className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                  selected ? "bg-purple-50 ring-2 ring-purple-500" : "hover:bg-purple-50/70"
                }`}
              >
                <span className={`w-8 h-8 rounded-full overflow-hidden bg-purple-50 shrink-0 text-[11px] ring-2 ring-offset-1 ring-offset-white ${role.ring}`}>
                  <GenderAvatar person={p} name={p.name} onPhotoError={ctx.onPhotoError} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 truncate">{p.name}</span>
                    {isMe && <span className="px-1 py-px rounded bg-purple-600 text-white text-[8px] font-bold uppercase tracking-wider shrink-0">You</span>}
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">{p.designation || "No job title yet"}</span>
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} title={p.department || "No department"} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Subtree({ node, ctx }) {
  const open = node.children.length > 0 && ctx.expanded.has(node.id);
  return (
    <div className="flex flex-col items-center">
      <PersonNode node={node} ctx={ctx} />
      {open && (
        isStackedTeam(node) ? (
          <div className={`${LINE_GAP} oc-pop`}>
            <TeamStack parent={node} ctx={ctx} />
          </div>
        ) : (
          <div className={`flex items-start justify-center gap-5 ${LINE_GAP} oc-pop`}>
            {node.children.map((c) => <Subtree key={c.id} node={c} ctx={ctx} />)}
          </div>
        )
      )}
    </div>
  );
}

// ── The company, at the very top ───────────────────────────────────────────
function CompanyNode({ company, total, departments }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = company?.logo_url && !logoFailed ? company.logo_url : null;
  return (
    <div data-oc-anchor={ORG_ANCHOR} className="relative w-[272px] rounded-3xl overflow-hidden bg-gradient-to-br from-[#5B21B6] via-[#6328D7] to-[#4C1D95] text-white px-5 pt-5 pb-5 text-center shadow-xl shadow-purple-900/20">
      <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/10 pointer-events-none" aria-hidden="true" />
      <div className="absolute -left-8 -bottom-12 w-28 h-28 rounded-full bg-white/5 pointer-events-none" aria-hidden="true" />
      <div className="relative mx-auto w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center overflow-hidden">
        {logo ? (
          <img src={logo} alt="" className="w-full h-full object-contain p-1.5" onError={() => setLogoFailed(true)} draggable={false} />
        ) : (
          <HiOfficeBuilding className="w-6 h-6 text-purple-600" aria-hidden="true" />
        )}
      </div>
      <p className="relative mt-3 text-base font-bold leading-tight truncate">{company?.name || "Organisation"}</p>
      <p className="relative mt-1 text-xs text-purple-100/90">
        {total} {total === 1 ? "person" : "people"} · {departments} {departments === 1 ? "department" : "departments"}
      </p>
    </div>
  );
}

const CONTROL = "w-9 h-9 flex items-center justify-center text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors outline-none focus-visible:bg-purple-50 focus-visible:text-purple-700";

/**
 * @param {object} props
 * @param {ReturnType<import("./orgChartMeta").buildOrgIndex>} props.index
 * @param {Set<string>} props.expanded
 * @param {(id: string) => void} props.onToggle
 * @param {(id: string) => void} props.onOpen
 * @param {string|null} props.selectedId
 * @param {Set<string>} props.pathIds     selected person and everyone above them
 * @param {string|null} props.deptFilter  department key to spotlight, or null
 * @param {string|null} props.myId
 * @param {{name?: string, logo_url?: string}|null} props.company
 * @param {boolean} props.showFormerManager
 * @param {() => void} props.onPhotoError
 * @param {{id: string, n: number}|null} props.focusTarget   centre on this person once drawn
 * @param {boolean} props.focusMode
 * @param {() => void} props.onToggleFocusMode
 */
const OrgChartCanvas = forwardRef(function OrgChartCanvas({
  index, expanded, onToggle, onOpen, selectedId, pathIds, deptFilter, myId, company,
  showFormerManager, onPhotoError, focusTarget, focusMode, onToggleFocusMode, className = "",
}, ref) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const reducedMotion = useReducedMotion();
  // Embedded, a plain scroll belongs to the page; say how to zoom instead.
  const [wheelHint, setWheelHint] = useState(false);
  const hintTimer = useRef(0);
  const onWheelHint = useCallback(() => {
    setWheelHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setWheelHint(false), 1400);
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current), []);
  const { view, setView, animating, dragging, zoomBy, fit, reset, centerOn, handlers } = usePanZoom({
    viewportRef, contentRef, reducedMotion, wheelPans: !!focusMode, onWheelHint,
  });

  const anchorEl = useCallback((id) => {
    const content = contentRef.current;
    if (!content || !id) return null;
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    return content.querySelector(`[data-oc-anchor="${esc}"]`);
  }, []);

  useImperativeHandle(ref, () => ({
    fit: () => fit(),
    reset: () => reset({ animate: true }, anchorEl(ORG_ANCHOR)),
    centerOnId: (id) => centerOn(anchorEl(id)),
  }), [fit, reset, centerOn, anchorEl]);

  // ── Folding keeps the clicked card where it was ──────────────────────────
  const keepStill = useRef(null);
  const handleToggle = useCallback((id) => {
    const el = anchorEl(id);
    if (el && contentRef.current) keepStill.current = { id, ...offsetWithin(el, contentRef.current) };
    onToggle(id);
  }, [anchorEl, onToggle]);

  // ── Connectors ───────────────────────────────────────────────────────────
  const edges = useMemo(() => {
    const list = [];
    for (const r of index.roots) list.push([ORG_ANCHOR, r.id]);
    const walk = (nodes) => {
      for (const n of nodes) {
        if (!n.children.length || !expanded.has(n.id)) continue;
        if (isStackedTeam(n)) list.push([n.id, teamAnchor(n.id)]);
        else {
          for (const c of n.children) list.push([n.id, c.id]);
          walk(n.children);
        }
      }
    };
    walk(index.roots);
    return list;
  }, [index, expanded]);

  const [paths, setPaths] = useState([]);
  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const anchors = new Map();
    content.querySelectorAll("[data-oc-anchor]").forEach((el) => anchors.set(el.getAttribute("data-oc-anchor"), el));
    const next = [];
    for (const [from, to] of edges) {
      const a = anchors.get(from);
      const b = anchors.get(to);
      if (!a || !b) continue;
      const p = offsetWithin(a, content);
      const c = offsetWithin(b, content);
      next.push({ key: `${from}>${to}`, from, to, d: elbowPath(p.x + p.w / 2, p.y + p.h, c.x + c.w / 2, c.y) });
    }
    setPaths(next);
  }, [edges]);

  useLayoutEffect(() => {
    measure();
    const still = keepStill.current;
    if (still) {
      keepStill.current = null;
      const el = anchorEl(still.id);
      if (el && contentRef.current) {
        const now = offsetWithin(el, contentRef.current);
        const dx = now.x - still.x;
        const dy = now.y - still.y;
        if (dx || dy) setView((v) => ({ x: v.x - dx * v.s, y: v.y - dy * v.s, s: v.s }));
      }
    }
  }, [measure, anchorEl, setView]);

  // Late font loads and avatar sizes settling can move cards by a pixel or two.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(content);
    return () => { ro.disconnect(); cancelAnimationFrame(frame); };
  }, [measure]);

  // ── First view, and "take me to this person" ────────────────────────────
  const firstIndex = useRef(null);
  useLayoutEffect(() => {
    if (firstIndex.current === index) return;
    const isFirst = firstIndex.current === null;
    firstIndex.current = index;
    if (isFirst) reset({ animate: false }, anchorEl(ORG_ANCHOR));
  }, [index, reset, anchorEl]);

  const handledFocus = useRef(0);
  useLayoutEffect(() => {
    if (!focusTarget || focusTarget.n === handledFocus.current) return;
    const el = anchorEl(focusTarget.id);
    if (!el) return;
    handledFocus.current = focusTarget.n;
    centerOn(el);
  }, [focusTarget, expanded, anchorEl, centerOn]);

  // ── Never let the browser scroll the viewport ────────────────────────────
  const onScroll = (e) => {
    const vp = e.currentTarget;
    if (vp.scrollLeft || vp.scrollTop) { vp.scrollLeft = 0; vp.scrollTop = 0; }
  };
  const onFocusCapture = (e) => {
    const target = e.target.closest?.("[data-oc-anchor]");
    const vp = viewportRef.current;
    if (!target || !vp || !e.target.matches?.(":focus-visible")) return;
    const r = e.target.getBoundingClientRect();
    const box = vp.getBoundingClientRect();
    const inView = r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
    if (!inView) centerOn(target, { minScale: view.s });
  };

  const ctx = {
    expanded, onToggle: handleToggle, onOpen, selectedId, pathIds, deptFilter, myId, showFormerManager, onPhotoError,
  };

  const departmentCount = index.departments.filter((d) => d.key !== NO_DEPARTMENT).length;
  const selectedParent = selectedId ? index.byId.get(selectedId)?.parentId : null;
  const isLit = ({ from, to }) => {
    if (!selectedId) return false;
    if (to.endsWith("::team")) return selectedParent === from;
    return pathIds.has(to) && (from === ORG_ANCHOR || pathIds.has(from));
  };
  const lit = paths.filter(isLit);
  const grid = 22 * view.s;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-roledescription="organisation chart"
        aria-label="Organisation chart. Drag or use the arrow keys to move, plus and minus to zoom, 0 to fit."
        onScroll={onScroll}
        onFocusCapture={onFocusCapture}
        {...handlers}
        className={`absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-300 touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          backgroundColor: "#FBFAFE",
          backgroundImage: "radial-gradient(circle, #E4DDF3 1.2px, transparent 1.2px)",
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 w-max px-10 pt-6 pb-16"
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
            transformOrigin: "0 0",
            transition: animating ? "transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none",
            willChange: dragging ? "transform" : undefined,
          }}
        >
          <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1" aria-hidden="true">
            <g fill="none" stroke="#D9D0EC" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              {paths.map((p) => <path key={p.key} d={p.d} />)}
            </g>
            {lit.length > 0 && (
              <>
                <g fill="none" stroke="#8B5CF6" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                  {lit.map((p) => <path key={p.key} d={p.d} />)}
                </g>
                <g fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" className="oc-flow" opacity="0.75">
                  {lit.map((p) => <path key={p.key} d={p.d} />)}
                </g>
              </>
            )}
          </svg>

          <div className="relative flex flex-col items-center">
            <CompanyNode company={company} total={index.total} departments={departmentCount} />
            <div className={`flex items-start justify-center gap-5 ${LINE_GAP}`}>
              {index.roots.map((r) => <Subtree key={r.id} node={r} ctx={ctx} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Legend — what the ring colours mean. */}
      <div className="absolute left-3 bottom-3 hidden sm:flex items-center gap-3 px-3 py-2 rounded-xl bg-white/90 backdrop-blur border border-slate-200/80 shadow-sm text-[11px] font-semibold text-slate-600 pointer-events-none">
        {["hr", "manager", "employee"].map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${ROLE_META[r].dot}`} aria-hidden="true" />
            {ROLE_META[r].label}
          </span>
        ))}
      </div>

      {wheelHint && (
        <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none" aria-hidden="true">
          <span className="px-3.5 py-2 rounded-xl bg-slate-900/80 text-white text-xs font-semibold shadow-lg">
            Hold Ctrl or ⌘ and scroll to zoom · drag to move around
          </span>
        </div>
      )}

      {/* Zoom and view controls — top right, clear of the Ask Maya button. */}
      <div className="absolute right-3 top-3 flex flex-col items-center rounded-xl bg-white/95 backdrop-blur border border-slate-200/80 shadow-md overflow-hidden divide-y divide-slate-100">
        <button type="button" onClick={() => zoomBy(1.2)} className={CONTROL} aria-label="Zoom in" title="Zoom in (+)"><HiPlus className="w-4 h-4" /></button>
        <span className="w-9 py-1 text-center text-[10px] font-bold text-slate-500 tabular-nums" aria-live="polite">{Math.round(view.s * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} className={CONTROL} aria-label="Zoom out" title="Zoom out (−)"><HiMinus className="w-4 h-4" /></button>
        <button type="button" onClick={() => fit()} className={CONTROL} aria-label="Fit the whole chart" title="Fit the whole chart (0)"><HiViewGrid className="w-4 h-4" /></button>
        {onToggleFocusMode && (
          <button type="button" onClick={onToggleFocusMode} className={CONTROL} aria-pressed={focusMode} aria-label={focusMode ? "Leave full screen" : "Full screen"} title={focusMode ? "Leave full screen (Esc)" : "Full screen"}>
            {focusMode ? <HiX className="w-4 h-4" /> : <HiArrowsExpand className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
});

export default OrgChartCanvas;
