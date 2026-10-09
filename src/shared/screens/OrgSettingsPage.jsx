// ─────────────────────────────────────────────────────────────────────────────
// OrgSettingsPage.jsx — "Company Settings": every rule the organisation runs
// on, in one place, with what each one is set to today (#242, #244).
//
// Contract: public/ref docs/md_settings/combined_api_analysis.md; the design
// brief is md_settings/frontend_settings_ui_ux_architecture.md.
//
// WHY THIS SCREEN IS READ-ONLY. Settings Phase 1 ships the catalogue and the
// read plane. The write plane (`PUT /settings/groups/:key` and its reset) is
// Phase 2 and is not deployed. So this is a discovery and audit screen, not a
// form: it answers "what are our rules, and which ones have we changed", and
// hands anyone who wants to change something to the module screen that already
// owns it. Editable-looking inputs with nothing behind them would be the
// button-that-403s §2 exists to prevent — when the write plane lands, the
// cards grow inputs and this comment gets deleted, not worked around.
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
// Traps:
//   · A group that is missing is NOT an error. `unavailable_groups[]` carries
//     NOT_READABLE (role), NOT_ENTITLED (plan) or READ_FAILED (fault), and
//     only the last of those is worth a retry (§7).
//   · The tabs come from the catalogue, not from a hardcoded list, so a module
//     the backend adds appears without a frontend release (the brief's "zero
//     maintenance burden"). Only modules with something in them get a tab.
//   · Links are built from the reader's OWN workspace prefix, never a
//     hardcoded /dashboard/hr path — a manager following one must stay in the
//     manager workspace or the route gate bounces them (§2).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { HiSearch, HiX } from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import Skeleton from "../components/Skeleton";
import { ErrorState, FilterTabs, Toast, useToast } from "../attendance/ui";
import { useCurrentWorkspace } from "../attendance/paths";
import FieldHelp from "../fieldHelp/FieldHelp";
import useSettingsHub from "../settings/useSettingsHub";
import {
  displaySettingValue, editRouteFor, moduleLabel, searchSettings, surfaceRouteFor, tabsFor,
} from "../settings/settingsMeta";
import { SurfaceHubCard } from "../settings/settingsUi";
import SettingsGroupForm from "../settings/SettingsGroupForm";

const SURFACE = "settings.hub";

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
  // Default to the first tab that exists, so the page never opens empty on a
  // role (or plan) whose first module happens to be missing.
  const activeTab = tab && tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key || null;

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
  // entries backed by one table become one card rather than four.
  const surfaceCards = useMemo(() => {
    const byRoute = new Map();
    for (const surface of surfacesByModule[activeTab] || []) {
      const route = surfaceRouteFor(surface);
      // No screen we can point at means no card: a dead link is worse than a
      // missing one, and the catalogue lists surfaces we may not have built.
      if (!route) continue;
      const key = route.path;
      if (!byRoute.has(key)) byRoute.set(key, { route, surfaces: [] });
      byRoute.get(key).surfaces.push(surface);
    }
    return [...byRoute.values()];
  }, [surfacesByModule, activeTab]);

  const tabOptions = useMemo(
    () => tabs.map((t) => ({
      value: t.key,
      label: `${t.label}${countFor(groups, t.key)}`,
    })),
    [tabs, groups],
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

            {/* One search across everything, because nobody knows which tab a
                setting lives in — the brief's whole §6. */}
            <div className="relative">
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every setting — try “cutoff”, “retention” or “grace”"
                className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition"
                aria-label="Search settings"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Clear search">
                  <HiX className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* The three words on this page that aren't self-explanatory, each
                introduced once (§10: once per concept per screen). They sit on
                a legend rather than on every card, because the cards repeat
                and an ⓘ per card would be the same hint a dozen times. */}
            {!searching && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center whitespace-nowrap">
                  <span className="font-semibold text-purple-700">Changed</span>
                  <span className="ml-1">= set away from the default</span>
                  <FieldHelp surface={SURFACE} field="non_default_keys" label="what “changed” means" size="sm" className="mb-0" />
                </span>
                <span className="inline-flex items-center whitespace-nowrap">
                  <span>Some settings need care</span>
                  <FieldHelp surface={SURFACE} field="risk" label="settings that need care" size="sm" className="mb-0" />
                </span>
                <span className="inline-flex items-center whitespace-nowrap">
                  <span>Not everything is shown to everyone</span>
                  <FieldHelp surface={SURFACE} field="unavailable_groups" label="why some settings are hidden" size="sm" className="mb-0" />
                </span>
                <span className="inline-flex items-center whitespace-nowrap">
                  <span>Two people can’t overwrite each other</span>
                  <FieldHelp surface={SURFACE} field="etag_conflict" label="what happens if two people edit at once" size="sm" className="mb-0" />
                </span>
              </div>
            )}

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
              <>
                <FilterTabs options={tabOptions} value={activeTab} onChange={setTab} />

                <div className="space-y-4">
                  {surfaceCards.map(({ route, surfaces }) => (
                    <SurfaceHubCard
                      key={route.path}
                      surfaces={surfaces}
                      to={{ ...route, path: inWorkspace(route.path) }}
                    />
                  ))}

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
                      />
                    );
                  })}

                  {visibleGroups.length === 0 && surfaceCards.length === 0 && (
                    <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
                      Nothing to show for {moduleLabel(activeTab)}.
                    </p>
                  )}
                </div>
              </>
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
 * "which tab is this in" is the question that brought them to the search box.
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
    <ul className="space-y-2">
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
                <Link to={inWorkspace(route.path)} className="text-xs font-bold text-purple-700 hover:text-purple-900">
                  {route.label}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
