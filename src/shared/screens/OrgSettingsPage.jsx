// ─────────────────────────────────────────────────────────────────────────────
// OrgSettingsPage.jsx — "Company Settings": every rule the organisation runs
// on, in one place, with what each one is set to today and — since Phase 2 —
// the ability to change it (#242, #244, #246, #247).
//
// Contract: public/ref docs/md_settings/combined_api_analysis.md; the design
// brief is md_settings/frontend_settings_ui_ux_architecture.md.
//
// It does NOT replace the module settings screens, by explicit instruction
// (the brief's §1.4): Payroll Settings, Document Settings, Letterhead,
// Attendance Policies and Leave Policies all stay exactly where they are, and
// every card here links to them.
//
// Shared by HR and the manager (§2), one component, no fork. The server does
// the projecting: a manager's catalogue comes back with 24 of the 26 groups
// marked unreadable, and #244 lists them under `unavailable_groups` with
// NOT_READABLE. So the manager sees the same screen with less in it, which is
// the parity rule working rather than a second screen pretending to be it.
//
// WHY A SECTION RAIL RATHER THAN A TAB STRIP. This page is a settings hub with
// five sections and up to twenty-six cards, and a horizontal strip gave it the
// shape of a report: the eye crossed the full width from a setting's label to
// its control, and the five sections were a row of chips with no sense of
// where you were. The rail makes the content column a readable width, keeps
// the section list visible while scrolling, and is the shape every settings
// screen a person already uses has. Below `lg` there is no room for it, so it
// falls back to the house `FilterTabs` — the same options, the same state.
//
// WHY THERE IS NO LEGEND STRIP. There used to be four grey sentences under the
// search box explaining "changed", risk, hidden groups and the save conflict.
// Four explanations stacked above the thing they explain is a disclaimer, not
// help. Each one now sits on its own subject (§10's "beside what it
// explains"): "changed" and risk on the section's own summary line, the
// hidden-group hint on the locked card itself, and the conflict hint on the
// conflict banner — which only ever appears once it has happened.
//
// Traps:
//   · A group that is missing is NOT an error. `unavailable_groups[]` carries
//     NOT_READABLE (role), NOT_ENTITLED (plan) or READ_FAILED (fault), and
//     only the last of those is worth a retry (§7).
//   · The sections come from the catalogue, not from a hardcoded list, so a
//     module the backend adds appears without a frontend release (the brief's
//     "zero maintenance burden"). Only modules with something in them appear.
//   · Links are built from the reader's OWN workspace prefix, never a
//     hardcoded /dashboard/hr path — a manager following one must stay in the
//     manager workspace or the route gate bounces them (§2).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { HiChevronRight, HiClock, HiSearch, HiX } from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import Skeleton from "../components/Skeleton";
import { ErrorState, FilterTabs, Toast, useToast } from "../attendance/ui";
import { useCurrentWorkspace } from "../attendance/paths";
import FieldHelp from "../fieldHelp/FieldHelp";
import useSettingsHub from "../settings/useSettingsHub";
import {
  displaySettingValue, editRouteFor, moduleIcon, moduleLabel, searchSettings,
  surfaceRouteFor, tabsFor,
} from "../settings/settingsMeta";
import { SurfaceHubCard } from "../settings/settingsUi";
import SettingsGroupForm from "../settings/SettingsGroupForm";
import SettingsHistoryPanel from "../settings/SettingsHistoryPanel";

const SURFACE = "settings.hub";

/* The change history is its own rail entry rather than a module section: it
   spans every module, so it belongs beside them, not inside one. HR ONLY —
   #248 is guarded `authorize(['hr'])` and a manager gets 403, so the entry is
   ABSENT for them rather than present and broken (§2). */
const HISTORY_TAB = "__history";

export default function OrgSettingsPage() {
  const workspace = useCurrentWorkspace();
  const hub = useSettingsHub();
  const { toast, showToast, clearToast } = useToast();
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState("");

  const {
    groups, entriesByGroup, groupsByKey, entries, surfacesByModule,
    modules, loading, error, valuesError, reload, applyWrite,
  } = hub;

  /** Every link on this page is prefixed with the reader's own workspace. */
  const inWorkspace = (path) => (workspace ? `/dashboard/${workspace}${path}` : null);

  const tabs = useMemo(() => tabsFor(modules), [modules]);
  // The history reads across every module and is HR's alone.
  const canSeeHistory = workspace === "hr";
  const showHistory = canSeeHistory && tab === HISTORY_TAB;
  // Default to the first section that exists, so the page never opens empty on
  // a role (or plan) whose first module happens to be missing.
  const activeTab = showHistory
    ? HISTORY_TAB
    : (tab && tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key || null);

  const results = useMemo(
    () => searchSettings(entries, groupsByKey, query),
    [entries, groupsByKey, query],
  );
  const searching = query.trim().length >= 2;

  const visibleGroups = useMemo(
    () => groups.filter((g) => g.module_key === activeTab),
    [groups, activeTab],
  );

  // Policy surfaces grouped by the screen that manages them, so four registry
  // entries backed by one table become one row rather than four.
  const surfaceCards = useMemo(() => {
    const byRoute = new Map();
    for (const surface of surfacesByModule[activeTab] || []) {
      const route = surfaceRouteFor(surface);
      // No screen we can point at means no row: a dead link is worse than a
      // missing one, and the catalogue lists surfaces we may not have built.
      if (!route) continue;
      const key = route.path;
      if (!byRoute.has(key)) byRoute.set(key, { route, surfaces: [] });
      byRoute.get(key).surfaces.push(surface);
    }
    return [...byRoute.values()];
  }, [surfacesByModule, activeTab]);

  /** What this section adds up to — the line under its heading. */
  const summary = useMemo(() => {
    const settingCount = visibleGroups.reduce((n, g) => n + (entriesByGroup[g.key]?.length || 0), 0);
    const changed = visibleGroups.reduce((n, g) => n + (g.nonDefaultKeys || []).length, 0);
    const risky = visibleGroups.some((g) =>
      (entriesByGroup[g.key] || []).some((e) => e.risk === "high" || e.risk === "medium"));
    return { settingCount, changed, risky };
  }, [visibleGroups, entriesByGroup]);

  const sectionOptions = useMemo(
    () => [
      ...tabs.map((t) => ({ value: t.key, label: `${t.label}${countFor(groups, t.key)}` })),
      // Below `lg` the rail becomes this strip, so the history has to be
      // reachable from it too — otherwise HR loses a whole section on a phone.
      ...(canSeeHistory ? [{ value: HISTORY_TAB, label: "Change history" }] : []),
    ],
    [tabs, groups, canSeeHistory],
  );

  return (
    <>
      <DashboardTopBar title="Company Settings" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="min-w-0">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-slate-900">Company Settings</h1>
            <FieldHelp surface={SURFACE} field="page" label="this page" className="mb-0 ml-1" />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Every rule your organisation runs on, and what each one is set to today. Change them here, or open the area that owns one for its fuller screen.
          </p>
        </div>

        {loading ? (
          <Skeleton type="table" rows={6} />
        ) : error ? (
          <ErrorState error={{ message: error }} onRetry={reload} fallback="We couldn’t load your settings." />
        ) : (
          <>
            {/* The numbers failed but the catalogue didn't: the page is still
                worth reading, so say what's missing rather than hiding it. */}
            {valuesError && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 text-xs text-slate-700">
                <span className="flex-1">{valuesError} The list of settings below is complete, but what they’re set to isn’t showing.</span>
                <button type="button" onClick={() => reload()} className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50">
                  Try again
                </button>
              </div>
            )}

            {/* One search across everything, because nobody knows which
                section a setting lives in — the brief's whole §6. */}
            <div className="relative max-w-2xl">
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every setting — try “cutoff”, “retention” or “grace”"
                className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition"
                aria-label="Search settings"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Clear search">
                  <HiX className="w-4 h-4" />
                </button>
              )}
            </div>

            {searching ? (
              <SearchResults
                results={results}
                groupsByKey={groupsByKey}
                inWorkspace={inWorkspace}
                onClear={() => setQuery("")}
              />
            ) : tabs.length === 0 ? (
              <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
                There are no settings you can see here. They belong to an HR administrator.
              </p>
            ) : (
              <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-6 items-start">
                {/* The rail, on screens with room for it. `display:none` keeps
                    the hidden one out of the grid entirely, so each breakpoint
                    gets exactly one navigation and no empty column. */}
                <nav className="hidden lg:block lg:sticky lg:top-6 space-y-1" aria-label="Settings sections">
                  {tabs.map((t) => {
                    const Icon = moduleIcon(t.key);
                    const active = t.key === activeTab;
                    const n = groups.filter((g) => g.module_key === t.key).length;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        aria-current={active ? "page" : undefined}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition ${
                          active
                            ? "bg-purple-50 text-purple-800 ring-1 ring-purple-200"
                            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-purple-600" : "text-slate-400"}`} />
                        <span className="min-w-0 truncate">{t.label}</span>
                        {n > 0 && (
                          <span className={`ml-auto shrink-0 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${active ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                            {n}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Separated from the module sections by a rule, because it
                      is a different KIND of thing: the others are "what is it
                      set to", this is "what has it been". */}
                  {canSeeHistory && (
                    <div className="pt-2 mt-2 border-t border-slate-200/70">
                      <button
                        type="button"
                        onClick={() => setTab(HISTORY_TAB)}
                        aria-current={showHistory ? "page" : undefined}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition ${
                          showHistory
                            ? "bg-purple-50 text-purple-800 ring-1 ring-purple-200"
                            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                        }`}
                      >
                        <HiClock className={`w-4 h-4 shrink-0 ${showHistory ? "text-purple-600" : "text-slate-400"}`} />
                        <span className="min-w-0 truncate">Change history</span>
                      </button>
                    </div>
                  )}
                </nav>

                <div className="lg:hidden">
                  <FilterTabs options={sectionOptions} value={activeTab} onChange={setTab} />
                </div>

                {showHistory ? (
                  <SettingsHistoryPanel
                    groups={groups}
                    entries={entries}
                    groupsByKey={groupsByKey}
                    surface={SURFACE}
                  />
                ) : (
                <div className="min-w-0 space-y-4">
                  {/* The section's own heading, and the two pieces of
                      vocabulary this page needs — each shown only when the
                      section actually contains the thing it describes. */}
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-900">{moduleLabel(activeTab)}</h2>
                    <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                      <span>
                        {summary.settingCount} setting{summary.settingCount === 1 ? "" : "s"} in{" "}
                        {visibleGroups.length} group{visibleGroups.length === 1 ? "" : "s"}
                      </span>
                      {summary.changed > 0 && (
                        <span className="inline-flex items-center whitespace-nowrap">
                          <span aria-hidden="true" className="mr-1.5">·</span>
                          <span className="font-semibold text-purple-700">{summary.changed} changed from the default</span>
                          <FieldHelp surface={SURFACE} field="non_default_keys" label="what “changed” means" size="sm" className="mb-0" />
                        </span>
                      )}
                      {summary.risky && (
                        <span className="inline-flex items-center whitespace-nowrap">
                          <span aria-hidden="true" className="mr-1.5">·</span>
                          <span>some need care</span>
                          <FieldHelp surface={SURFACE} field="risk" label="settings that need care" size="sm" className="mb-0" />
                        </span>
                      )}
                    </p>
                  </div>

                  {visibleGroups.map((group) => {
                    const route = editRouteFor(group);
                    return (
                      <SettingsGroupForm
                        key={group.key}
                        group={group}
                        entries={entriesByGroup[group.key]}
                        editTo={route ? { ...route, path: inWorkspace(route.path) } : null}
                        onSaved={applyWrite}
                        onReload={() => reload()}
                        showToast={showToast}
                        surface={SURFACE}
                      />
                    );
                  })}

                  {/* Policy areas: not settings at all, but whole screens that
                      manage many records. Kept apart and visually quieter, so
                      a list of links never reads as something editable here. */}
                  {surfaceCards.length > 0 && (
                    <section className="pt-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Managed on their own screens
                      </h3>
                      <div className="space-y-2">
                        {surfaceCards.map(({ route, surfaces }) => (
                          <SurfaceHubCard
                            key={route.path}
                            surfaces={surfaces}
                            to={{ ...route, path: inWorkspace(route.path) }}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {visibleGroups.length === 0 && surfaceCards.length === 0 && (
                    <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
                      Nothing to show for {moduleLabel(activeTab)}.
                    </p>
                  )}
                </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/** "Payroll (11)" — counts live in the tab label (attendance/ui.jsx §5). A
    module that is only policy surfaces has no groups to count, so it gets no
    number rather than a misleading "(0)". */
function countFor(groups, moduleKey) {
  const n = groups.filter((g) => g.module_key === moduleKey).length;
  return n ? ` (${n})` : "";
}

/**
 * Search hits across every module. Each one says where it lives, because
 * "which section is this in" is the question that brought them to the search box.
 */
function SearchResults({ results, groupsByKey, inWorkspace, onClear }) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
        No setting matches that. Try a shorter word — or{" "}
        <button type="button" onClick={onClear} className="font-bold text-purple-700 hover:text-purple-900 underline underline-offset-2">
          show everything
        </button>.
      </p>
    );
  }

  return (
    <ul className="space-y-2 max-w-4xl">
      {results.map((entry) => {
        const group = groupsByKey[entry.group_key];
        const route = editRouteFor(group);
        return (
          <li key={entry.key} className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">{entry.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {moduleLabel(entry.module_key)}
                {group?.label && <> · {group.label}</>}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {group?.hasValues && (
                <span className="text-xs font-bold text-slate-800 tabular-nums">
                  {displaySettingValue(group.values?.[entry.key], entry)}
                </span>
              )}
              {route && (
                <Link to={inWorkspace(route.path)} className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900">
                  {route.label} <HiChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
