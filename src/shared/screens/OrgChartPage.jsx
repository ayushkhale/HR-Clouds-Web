// ─────────────────────────────────────────────────────────────────────────────
// OrgChartPage.jsx — Org Chart: who reports to whom, across the organisation.
// Mounted in all three workspaces (ORG_PATHS) — the endpoint is open to every
// tenant role and returns the whole org to each of them, so the only thing a
// workspace changes is where "Open profile" may go (OrgPersonDialog) and
// whether the "manager no longer active" warning shows (HR only: HR is the
// one who can fix it).
//
// Contract: GET /organizations/hierarchy (`public/ref docs/md_updates/
// 5_org_details_and_hierarchy_api.md` §2) — a forest, live from the reporting
// mappings, no pagination. The company card on top comes from GET
// /organizations/details; if that fails the chart still draws, it just says
// "Organisation" where the name would go. The two load in parallel.
//
// Things that look optional and aren't:
// • Presigned avatar links die after ~5 minutes. A card unfolded after that
//   gets a dead link, so an avatar failing to load on data older than four
//   minutes triggers ONE silent refetch (at most once a minute). Folds and the
//   selection survive it — both are keyed by user_id.
// • Big orgs open folded to their leadership (defaultExpanded); spotlighting a
//   department or finding a person unfolds exactly the branches needed, so a
//   match is never dimmed-but-hidden inside a closed team.
// • Full screen is an in-page overlay at z-[90] (over Maya, under every
//   dialog), not the Fullscreen API: that hides anything portalled to <body>,
//   which is where the ⓘ popovers and the person dialog's layers live.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiUsers,
  HiChartBar,
  HiUserGroup,
  HiOfficeBuilding,
  HiSearch,
  HiX,
  HiViewList,
  HiShare,
  HiLocationMarker,
  HiChevronDoubleDown,
  HiChevronDoubleUp,
  HiRefresh,
  HiExclamation,
  HiExclamationCircle,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import GenderAvatar from "../components/GenderAvatar";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { organizationAPI } from "../api";
import { organizationErrorMessage } from "../utils/organizationErrors";
import { useOrgPaths } from "../attendance/paths";
import OrgChartCanvas from "../organization/OrgChartCanvas";
import OrgChartList from "../organization/OrgChartList";
import OrgPersonDialog from "../organization/OrgPersonDialog";
import {
  NO_DEPARTMENT,
  allExpandable,
  ancestorsOf,
  buildOrgIndex,
  defaultExpanded,
  departmentKeyOf,
  departmentTone,
  roleMetaOf,
  searchPeople,
} from "../organization/orgChartMeta";

const SURFACE = "organization.org_chart";
const VIEW_KEY = "hrc.orgchart.view";
const STALE_AFTER_MS = 4 * 60 * 1000;
const REFRESH_GAP_MS = 60 * 1000;

function initialView() {
  try {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "chart" || saved === "list") return saved;
  } catch { /* storage blocked — use the default */ }
  return typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "chart";
}

// ── Loading: a faint tree, so the page doesn't jump when it arrives ─────────
function ChartSkeleton() {
  const card = "w-44 h-24 rounded-2xl bg-white border border-slate-100 shadow-sm";
  return (
    <div className="h-full flex flex-col items-center pt-10 gap-10 animate-pulse" aria-busy="true" aria-label="Loading the org chart">
      <div className="w-60 h-28 rounded-3xl bg-purple-200/70" />
      <div className="flex gap-6">{[0, 1, 2].map((i) => <div key={i} className={card} />)}</div>
      <div className="flex gap-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`${card} w-36 h-20`} />)}</div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint, help }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs px-4 py-2.5 flex items-center gap-3 min-w-0">
      <span className="hidden sm:flex w-9 h-9 rounded-xl bg-purple-50 text-purple-600 items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
          <span className="text-xl font-bold text-slate-900 leading-tight tabular-nums">{value}</span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate"><HelpLabel text={label} help={help} /></span>
        </div>
        {hint && <p className="text-[11px] text-slate-500 truncate">{hint}</p>}
      </div>
    </div>
  );
}

// ── Find a person (combobox) ────────────────────────────────────────────────
function PersonSearch({ index, onPick }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchPeople(index, query), [index, query]);
  const listId = "org-chart-search-results";
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (node) => {
    onPick(node.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); pick(results[active]); }
    else if (e.key === "Escape" && (open || query)) { e.stopPropagation(); setOpen(false); setQuery(""); }
  };

  const showList = open && query.trim().length > 0;
  return (
    <div ref={boxRef} className="relative w-full sm:w-80">
      <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `org-search-${results[active].id}` : undefined}
        aria-label="Find a person on the chart"
        placeholder="Find a person, job title or team…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
      />
      {query && (
        <button type="button" onClick={() => { setQuery(""); setOpen(false); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700">
          <HiX className="w-4 h-4" />
        </button>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-xs text-slate-500">Nobody on the chart matches “{query.trim()}”.</li>
          ) : results.map((n, i) => {
            const role = roleMetaOf(n.role);
            return (
              <li
                key={n.id}
                id={`org-search-${n.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(n)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${i === active ? "bg-purple-50" : ""}`}
              >
                <span className={`w-8 h-8 rounded-full overflow-hidden bg-purple-50 shrink-0 text-[11px] ring-2 ring-offset-1 ring-offset-white ${role.ring}`}>
                  <GenderAvatar person={n} name={n.name} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 truncate">{n.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{[n.designation, n.department].filter(Boolean).join(" · ") || role.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const myId = user?.id || user?.user_id || null;
  const orgPaths = useOrgPaths();

  const [index, setIndex] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [deptFilter, setDeptFilter] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  const [view, setViewMode] = useState(initialView);
  const [focusMode, setFocusMode] = useState(false);
  const canvasRef = useRef(null);
  const requestRef = useRef(0);
  const loadedAt = useRef(0);
  const lastRefresh = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    const token = ++requestRef.current;
    if (!silent) { setLoading(true); setError(null); }
    const [tree, details] = await Promise.allSettled([
      organizationAPI.getOrganizationHierarchy(),
      organizationAPI.getOrganizationDetails(),
    ]);
    if (token !== requestRef.current) return;
    if (tree.status === "fulfilled") {
      const next = buildOrgIndex(tree.value?.data);
      setIndex(next);
      loadedAt.current = Date.now();
      // First load decides the folds; a refresh keeps whatever the person opened.
      if (!silent) setExpanded(defaultExpanded(next));
    } else if (!silent) {
      setError(tree.reason);
    }
    if (details.status === "fulfilled") {
      const d = details.value?.data;
      setCompany({ name: d?.organization?.name || d?.profile?.org_name || null, logo_url: d?.profile?.logo_url || null });
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onPhotoError = useCallback(() => {
    const now = Date.now();
    if (now - loadedAt.current < STALE_AFTER_MS || now - lastRefresh.current < REFRESH_GAP_MS) return;
    lastRefresh.current = now;
    load({ silent: true });
  }, [load]);

  const setView = (v) => {
    setViewMode(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* remembered only when storage works */ }
  };

  // Escape leaves full screen — unless a dialog above it is taking that Escape.
  useEffect(() => {
    if (!focusMode) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !openId) setFocusMode(false); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [focusMode, openId]);

  const pathIds = useMemo(() => {
    if (!index || !selectedId || !index.byId.has(selectedId)) return new Set();
    return new Set([selectedId, ...ancestorsOf(index, selectedId).map((a) => a.id)]);
  }, [index, selectedId]);

  const toggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** Unfold every branch above these people, so they're drawn. */
  const revealAll = useCallback((ids) => {
    if (!index) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ids) for (const a of ancestorsOf(index, id)) next.add(a.id);
      return next;
    });
  }, [index]);

  const focusPerson = useCallback((id) => {
    revealAll([id]);
    setSelectedId(id);
    setFocusTarget({ id, n: Date.now() });
  }, [revealAll]);

  const openPerson = useCallback((id) => {
    setSelectedId(id);
    setOpenId(id);
  }, []);

  const chooseDepartment = (key) => {
    const next = deptFilter === key ? null : key;
    setDeptFilter(next);
    if (next && index) revealAll(index.flat.filter((n) => departmentKeyOf(n) === next).map((n) => n.id));
  };

  const expandedAll = index ? allExpandable(index).size > 0 && [...allExpandable(index)].every((id) => expanded.has(id)) : false;
  const meOnChart = !!(index && myId && index.byId.has(myId));
  const selected = selectedId && index ? index.byId.get(selectedId) : null;
  const realDepartments = index ? index.departments.filter((d) => d.key !== NO_DEPARTMENT) : [];
  const showFormerManager = workspace === "hr";
  const orgName = company?.name;

  const TOOL = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap";

  return (
    <>
      <DashboardTopBar title="Org Chart" />

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Org Chart</h1>
            <p className="text-sm text-slate-500 mt-1">
              Who reports to whom{orgName ? ` across ${orgName}` : " across the organisation"}. It updates as soon as someone joins, moves team or leaves.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to={orgPaths.company} className={`${TOOL} bg-white border-slate-200 text-slate-600 hover:bg-slate-50`}>
              <HiOfficeBuilding className="w-4 h-4" /> Company Profile
            </Link>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80" role="group" aria-label="How to show the chart">
              {[["chart", "Chart", HiShare], ["list", "List", HiViewList]].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === key ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <Icon className={`w-4 h-4 ${key === "chart" ? "rotate-90" : ""}`} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {index && !error && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatTile icon={HiUsers} label="People" value={index.total} hint={`${index.roleCounts.manager} ${index.roleCounts.manager === 1 ? "manager" : "managers"} · ${index.roleCounts.hr} HR`} />
            <StatTile icon={HiChartBar} label="Levels" value={index.depth} hint="From the top down" help={{ surface: SURFACE, field: "depth" }} />
            <StatTile
              icon={HiUserGroup}
              label="Biggest team"
              value={index.biggestTeam ? index.biggestTeam.children.length : 0}
              hint={index.biggestTeam ? `Reporting to ${index.biggestTeam.name}` : "Nobody has reports yet"}
              help={{ surface: SURFACE, field: "biggest_team" }}
            />
            <StatTile icon={HiOfficeBuilding} label="Departments" value={realDepartments.length} hint={index.departments.some((d) => d.key === NO_DEPARTMENT) ? "Some people have none yet" : "Everyone has one"} />
          </div>
        )}

        {showFormerManager && index?.formerManagerCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-2.5">
            <HiExclamation className="w-5 h-5 text-fuchsia-600 shrink-0" />
            <p className="text-xs sm:text-[13px] text-fuchsia-900 flex-1 leading-relaxed">
              <span className="font-bold">
                {index.formerManagerCount} {index.formerManagerCount === 1 ? "person reports" : "people report"} to someone who is no longer active.
              </span>{" "}
              They show at the top of the chart, marked with a warning, until they’re given a new manager from their profile.
            </p>
            <Link to="/dashboard/hr/employees" className="shrink-0 text-xs font-bold text-fuchsia-700 hover:text-fuchsia-900 underline underline-offset-2">
              Go to the Team page
            </Link>
          </div>
        )}

        {/* ── The chart shell: toolbar + canvas/list ── */}
        <section
          className={focusMode
            ? "fixed inset-0 z-[90] bg-white flex flex-col"
            : "bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col"}
          aria-label="Org chart"
        >
          <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              {index && <PersonSearch index={index} onPick={focusPerson} />}
              <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                {selected && (
                  <span className="inline-flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-xs font-semibold text-purple-800 max-w-full">
                    <span className="w-6 h-6 rounded-full overflow-hidden bg-white shrink-0 text-[9px]"><GenderAvatar person={selected} name={selected.name} /></span>
                    <span className="truncate max-w-[10rem]">{selected.name}</span>
                    <button type="button" onClick={() => setSelectedId(null)} aria-label={`Stop highlighting ${selected.name}`} className="p-0.5 rounded-full hover:bg-purple-100 text-purple-500">
                      <HiX className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
                {meOnChart && (
                  <button type="button" onClick={() => focusPerson(myId)} className={`${TOOL} bg-purple-600 border-purple-600 text-white hover:bg-purple-700`}>
                    <HiLocationMarker className="w-4 h-4" /> Find me
                  </button>
                )}
                {index && allExpandable(index).size > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(expandedAll ? defaultExpanded(index) : allExpandable(index))}
                    className={`${TOOL} bg-white border-slate-200 text-slate-600 hover:bg-slate-50`}
                  >
                    {expandedAll ? <HiChevronDoubleUp className="w-4 h-4" /> : <HiChevronDoubleDown className="w-4 h-4" />}
                    {expandedAll ? "Fold back" : "Open every team"}
                  </button>
                )}
              </div>
            </div>

            {realDepartments.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5 pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]" role="group" aria-label="Spotlight a department">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Spotlight</span>
                <button
                  type="button"
                  onClick={() => setDeptFilter(null)}
                  aria-pressed={!deptFilter}
                  className={`shrink-0 px-3 py-1 rounded-full border text-[11px] font-bold transition-colors ${!deptFilter ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  Everyone
                </button>
                {index.departments.map((d) => {
                  const tone = departmentTone(d.key === NO_DEPARTMENT ? null : d.name);
                  const on = deptFilter === d.key;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => chooseDepartment(d.key)}
                      aria-pressed={on}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold transition-colors ${on ? tone.active : `${tone.chip} hover:brightness-95`}`}
                    >
                      {!on && <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />}
                      {d.name} <span className={on ? "opacity-80" : "opacity-60"}>{d.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={focusMode ? "flex-1 min-h-0 relative" : "relative"}>
            {loading ? (
              <div className="h-[520px] bg-[#FBFAFE]"><ChartSkeleton /></div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center text-center gap-3 py-16 px-4" role="alert">
                <span className="w-12 h-12 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center"><HiExclamationCircle className="w-6 h-6" /></span>
                <p className="text-sm font-semibold text-slate-700 max-w-md">{organizationErrorMessage(error, "Couldn’t load the org chart.")}</p>
                <button type="button" onClick={() => load()} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
                  <HiRefresh className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            ) : index.total === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-16 px-4">
                <span className="w-12 h-12 rounded-full bg-purple-50 text-purple-400 flex items-center justify-center mb-1"><HiUserGroup className="w-6 h-6" /></span>
                <p className="text-sm font-semibold text-slate-700">Nobody is on the chart yet</p>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                  {workspace === "hr"
                    ? "Invite people and choose who they report to — they appear here as soon as they accept."
                    : "People appear here once HR has added them and set who they report to."}
                </p>
                {workspace === "hr" && (
                  <Link to="/dashboard/hr/invites" className="mt-2 text-xs font-bold text-purple-600 hover:text-purple-800 underline underline-offset-2">Invite people</Link>
                )}
              </div>
            ) : view === "chart" ? (
              <OrgChartCanvas
                ref={canvasRef}
                index={index}
                expanded={expanded}
                onToggle={toggle}
                onOpen={openPerson}
                selectedId={selectedId}
                pathIds={pathIds}
                deptFilter={deptFilter}
                myId={myId}
                company={company}
                showFormerManager={showFormerManager}
                onPhotoError={onPhotoError}
                focusTarget={focusTarget}
                focusMode={focusMode}
                onToggleFocusMode={() => setFocusMode((v) => !v)}
                className={focusMode ? "h-full" : "h-[calc(100vh-11rem)] min-h-[460px] max-h-[860px]"}
              />
            ) : (
              <div className={focusMode ? "h-full overflow-y-auto" : "max-h-[calc(100vh-20rem)] min-h-[320px] overflow-y-auto"}>
                <OrgChartList
                  index={index}
                  expanded={expanded}
                  onToggle={toggle}
                  onOpen={openPerson}
                  selectedId={selectedId}
                  pathIds={pathIds}
                  deptFilter={deptFilter}
                  myId={myId}
                  showFormerManager={showFormerManager}
                  onPhotoError={onPhotoError}
                  focusTarget={focusTarget}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      {openId && index && (
        <OrgPersonDialog
          index={index}
          personId={openId}
          companyName={orgName}
          myId={myId}
          workspace={workspace}
          onClose={() => setOpenId(null)}
          onNavigate={(id) => { setOpenId(id); setSelectedId(id); }}
          onShowInChart={(id) => { setOpenId(null); focusPerson(id); }}
        />
      )}
    </>
  );
}
