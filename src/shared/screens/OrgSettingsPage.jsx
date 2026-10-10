// ─────────────────────────────────────────────────────────────────────────────
// OrgSettingsPage.jsx — "Company Settings": every rule the organisation runs
// on, in one place, with what each one is set to today and — since Phase 2 —
// the ability to change it (#242, #244, #246, #247, #248).
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
// ─── THE 2026-10-10 REBUILD, AND WHAT IT REVERSED ──────────────────────────
// This page used to be a LEFT SECTION RAIL with one full-width card per group,
// each card a ledger of `label … [control]` rows. The header comment then
// argued the rail beat a tab strip because a full-width row made the eye cross
// the screen from a label to its control. That diagnosis was right and the
// cure was wrong: the rail narrowed the page but kept the rows full-width, so
// the crossing stayed and the hub just got a second navigation to learn.
//
// It is now the brief's own shape, measured at 1366 and 390:
//   · TABS, not a rail (the brief's §2 information architecture), as the house
//     `FilterTabs` with the module's icon and its group count in the label.
//     One navigation at every width, instead of a rail above `lg` and a strip
//     below it.
//   · FIELDS STACKED LABEL-ABOVE-CONTROL inside the card (see
//     SettingsGroupForm), rather than a label on the left and a control pinned
//     right. Nothing is more than its own width from its label, which is what
//     the rail was reaching for. The card's own grid — not the page — is what
//     uses up a wide screen.
// If a later change wants the rail back, it is buying the label-to-control
// distance back with it.
//
// ─── THE SECOND PASS, SAME DAY: FOUR THINGS THE FIRST BUILD GOT WRONG ──────
//   · THE FOUR TILES ARE GONE (user instruction). They were the first thing
//     on the page and answered a question nobody opens Settings to ask. The
//     two facts worth keeping went onto the cards they are true of.
//   · THE SEARCH SITS WITH THE TITLE, not beside the tabs. It searches all
//     137 settings across every tab, so pinning it to the tab strip implied
//     it filtered the open tab; and sharing one line with five tabs left it
//     ~260px on a 1366 screen. On the title line it is the page's other
//     primary control, which is what it actually is.
//   · THE TABS OWN THEIR LINE, in alphabetical order (see `tabsFor`).
//   · CARDS ARE ONE COLUMN OF FULL-WIDTH BRICKS (fourth pass, same day), and
//     this took three goes to get right. Grid rows left a card-sized hole
//     beside an opened card — "no hole in the wall". Two columns cut
//     half-and-half left most of a screen empty beside an open card — "this
//     blank space should self-adjust". Two columns with the boundary chosen
//     from the cards' heights fixed the space and broke something worse: open
//     a card and a card the reader had not touched jumped from the foot of one
//     column to the head of the other ("notification tab jumping from
//     position"). There is no two-column layout that both fills itself and
//     holds still. One column has neither fault — closed cards are a single
//     height so the stack is flush, and opening one pushes the rest down
//     without moving anything sideways. The width goes inside the card, where
//     it was wanted: three fields to a line from `xl` (`fieldSpan`).
// The cards are also shutters now, closed by default: the Payroll tab is
// eleven groups, and a page that opens as an index of eleven rows is one an
// admin can aim at. See SettingsGroupForm for what that does and doesn't
// unmount.
//
// WHY THERE IS NO LEGEND STRIP. There used to be four grey sentences under the
// search box explaining "changed", risk, hidden groups and the save conflict.
// Four explanations stacked above the thing they explain is a disclaimer, not
// help. Each one now sits on its own subject (§10's "beside what it
// explains"): "changed" and risk inside the card they describe, the
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
//   · The search covers SETTINGS and POLICY SCREENS both. Half the catalogue
//     lives behind a surface, and until surfaces were indexed, searching
//     "grace" — the brief's own example — found nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowRight, HiChevronRight, HiClock, HiSearch, HiX,
} from "react-icons/hi";
import { Link, useNavigate } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import Skeleton from "../components/Skeleton";
import { ErrorState, Toast, useToast } from "../attendance/ui";
import { useCurrentWorkspace } from "../attendance/paths";
import FieldHelp from "../fieldHelp/FieldHelp";
import useSettingsHub from "../settings/useSettingsHub";
import { settingLabel } from "../settings/settingsBlurbs";
import {
  displaySettingValue, groupIcon,
  moduleLabel, searchSettings, searchSurfaces, surfaceRouteFor, tabsFor,
} from "../settings/settingsMeta";
import { META, TEXT } from "../settings/settingsText";
import { SurfaceHubCard } from "../settings/settingsUi";

const SURFACE = "settings.hub";


export default function OrgSettingsPage() {
  const workspace = useCurrentWorkspace();
  const navigate = useNavigate();
  const hub = useSettingsHub();
  const { toast, clearToast } = useToast();
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  const {
    groups, entriesByGroup, groupsByKey, entries, surfaces, surfacesByModule,
    modules, loading, error, valuesError, reload,
  } = hub;

  /** Every link on this page is prefixed with the reader's own workspace. */
  const inWorkspace = useCallback(
    (path) => (workspace ? `/dashboard/${workspace}${path}` : null),
    [workspace],
  );

  const tabs = useMemo(() => tabsFor(modules), [modules]);
  // The history reads across every module and is HR's alone (#248 is
  // authorize(['hr']); a manager is not offered the row at all, §2).
  const canSeeHistory = workspace === "hr";


  const searching = query.trim().length >= 2;
  const results = useMemo(
    () => (searching ? searchSettings(entries, groupsByKey, query) : []),
    [searching, entries, groupsByKey, query],
  );
  const surfaceResults = useMemo(
    () => (searching ? searchSurfaces(surfaces, query) : []),
    [searching, surfaces, query],
  );

  /**
   * Every area, in order, with the groups and the policy screens that belong
   * to it. The page shows ALL of them at once now — one vertical list — so
   * the per-area slices are built once here rather than recomputed as a tab
   * changes. The tab state remains for the history view and for search.
   */
  const sections = useMemo(() => tabs.map((t) => {
    const byRoute = new Map();
    for (const surface of surfacesByModule[t.key] || []) {
      const route = surfaceRouteFor(surface);
      // No screen we can point at means no row: a dead link is worse than a
      // missing one, and the catalogue lists surfaces we may not have built.
      if (!route) continue;
      // Some screens exist in the HR workspace only. Hidden rather than
      // offered-and-bounced (§2).
      if (route.hrOnly && workspace !== "hr") continue;
      if (!byRoute.has(route.path)) byRoute.set(route.path, { route, surfaces: [] });
      byRoute.get(route.path).surfaces.push(surface);
    }
    return {
      ...t,
      groups: groups.filter((g) => g.module_key === t.key),
      surfaces: [...byRoute.values()],
    };
  }).filter((s) => s.groups.length > 0 || s.surfaces.length > 0),
  [tabs, groups, surfacesByModule, workspace]);


  /* ─── The command bar ──────────────────────────────────────────────────
     Ctrl/⌘-K from anywhere on the page, because with 137 settings the search
     is the primary navigation and reaching for it with the mouse is the slow
     path (the brief's §6). Escape hands the page back. */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * A search hit now OPENS the thing it found, rather than switching tab and
   * ringing a card the reader then had to expand. One click from "I typed
   * payday" to the page that owns it — which is the whole point of giving
   * each group a page.
   */
  const jumpToGroup = (entry) => {
    setQuery("");
    const path = inWorkspace(`/settings/${encodeURIComponent(entry.group_key)}`);
    if (path) navigate(path);
  };


  /* The "moving tab discards your edits" guard went with the tabs. Nothing on
     this page is editable now, so there is nothing to lose by navigating —
     and a group's own page owns its edits and its Save together. */

  /* The scroll-to-and-ring-a-card effect went too: a search hit now opens the
     group's page, so there is no card on this screen to find and highlight. */

  return (
    <>
      <DashboardTopBar title="Company Settings" />
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <div className="flex-1 space-y-5">
          {/* Title and search share the top line: the search reads across
              every tab, so it belongs to the page, not to the tab strip. */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 lg:gap-6">
            <div className="min-w-0">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-slate-900">Company Settings</h1>
                <FieldHelp surface={SURFACE} field="page" label="this page" className="mb-0 ml-1" />
              </div>
              <p className={`text-sm ${TEXT.body} mt-1`}>
                Every rule your organisation runs on, and what each one is set to today. Change them here, or open the area that owns one for its fuller screen.
              </p>
            </div>

            {!loading && !error && tabs.length > 0 && (
              <div className="relative w-full lg:w-[22rem] xl:w-[26rem] shrink-0 lg:mt-1">
                <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
                  placeholder="Search every setting — try “grace” or “payday”"
                  className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-16 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition"
                  aria-label="Search settings"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Clear search">
                    <HiX className="w-4 h-4" />
                  </button>
                ) : (
                  // The shortcut is advertised where it is used. Hidden on
                  // touch widths, where there is no key to press.
                  <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400 pointer-events-none">
                    Ctrl K
                  </kbd>
                )}
              </div>
            )}
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

              {tabs.length === 0 ? (
                <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
                  There are no settings you can see here. They belong to an HR administrator.
                </p>
              ) : (
                <>
                  {/* NO TAB STRIP. Once every group opened as its own page,
                      five of the strip's six positions filtered a list that
                      now shows everything, and the sixth moved the history —
                      so the history became a page too and the strip went.
                      Everything on this screen behaves one way: click a name,
                      get a page, come back. */}
                  {searching && (
                    <SearchResults
                      results={results}
                      surfaceResults={surfaceResults}
                      groupsByKey={groupsByKey}
                      inWorkspace={inWorkspace}
                      onJump={jumpToGroup}
                      onClear={() => setQuery("")}
                    />
                  )}

                  {!searching && (
                    <div className="min-w-0 space-y-7">
                      {/* The history is a destination like any other, so it is
                          a row in the list rather than a tab — and only for
                          HR, because #248 answers a manager 403 (§2). */}
                      {canSeeHistory && (
                        <Link
                          to={inWorkspace("/settings/history")}
                          className="group flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-xs px-4 py-3 hover:bg-slate-50/70 hover:border-purple-200 transition-colors"
                        >
                          <span className="shrink-0 w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 inline-flex items-center justify-center">
                            <HiClock className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-slate-900 group-hover:text-purple-800 transition-colors">
                              Change history
                            </span>
                            <span className={`block ${TEXT.meta} text-[11px] mt-0.5`}>
                              Who changed what, and when
                            </span>
                          </span>
                          <HiChevronRight
                            aria-hidden="true"
                            className="shrink-0 w-4 h-4 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition"
                          />
                        </Link>
                      )}

                      {/* EVERY AREA AT ONCE, DOWN THE PAGE. The tab strip and
                          the stack of shutters it hid are gone: five tabs over
                          fifteen collapsibles meant the rule you wanted was
                          three clicks deep and invisible until you found the
                          right tab. A list of names you scroll, where clicking
                          a name opens that one thing on its own page, is the
                          shape this product already uses for Employees and
                          Departments — so nobody has to learn it. */}
                      {sections.map((section) => (
                        <section key={section.key} className="min-w-0">
                          <div className="flex items-center px-1 mb-2.5">
                            <h2 className="text-base font-bold text-slate-900 truncate">{section.label}</h2>
                            {/* §10 wants the area's help beside its heading,
                                never inside a tablist — and there is no
                                tablist any more. */}
                            <FieldHelp
                              surface={SURFACE}
                              field={`tab.${section.key}`}
                              label={`the ${section.label} settings`}
                              className="mb-0 ml-0.5"
                            />
                          </div>

                          {/* One card, hairline-divided. Separate cards per
                              row put a 16px gutter between things that belong
                              to one another; a divided list reads as a list. */}
                          {section.groups.length > 0 && (
                            <ul className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden divide-y divide-slate-50">
                              {section.groups.map((group) => (
                                <li key={group.key}>
                                  <SettingsGroupRow
                                    group={group}
                                    count={(entriesByGroup[group.key] || []).length}
                                    to={inWorkspace(`/settings/${encodeURIComponent(group.key)}`)}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* Policy areas: not settings at all, but whole
                              screens that manage many records. Same row
                              shape, their own sub-heading, so a link out
                              never reads as something editable here. */}
                          {section.surfaces.length > 0 && (
                            <div className="mt-3">
                              <h3 className={`text-[11px] font-bold uppercase tracking-wider ${TEXT.label} mb-2 px-1`}>
                                Managed on their own screens
                              </h3>
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
                                {section.surfaces.map(({ route, surfaces }) => (
                                  <SurfaceHubCard
                                    key={route.path}
                                    surfaces={surfaces}
                                    to={{ ...route, path: inWorkspace(route.path) }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* No save dock here any more: nothing on this page is editable. A
            group is edited on its own page, where its own Save sits with it
            and there is only ever one transaction in flight. */}
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/**
 * Search hits across every module: the settings themselves, and the policy
 * screens that own the rest. Each one says where it lives, because "which tab
 * is this in" is the question that brought them to the search box.
 */
function SearchResults({ results, surfaceResults, groupsByKey, inWorkspace, onJump, onClear }) {
  if (results.length === 0 && surfaceResults.length === 0) {
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
    <div className="space-y-5">
      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((entry) => {
            const group = groupsByKey[entry.group_key];
            return (
              <li key={entry.key}>
                {/* The hit itself is the button: it takes the reader to the
                    card where the setting can actually be changed, which is
                    the only useful thing to do with a search result here. */}
                <button
                  type="button"
                  onClick={() => onJump(entry)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:border-purple-200 hover:shadow-sm transition group"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 group-hover:text-purple-800 transition">{settingLabel(entry)}</span>
                    <span className={`block ${META} mt-0.5`}>
                      {moduleLabel(entry.module_key)}
                      {group?.label && <> · {group.label}</>}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    {group?.hasValues && (
                      <span className="text-xs font-bold text-slate-800 tabular-nums">
                        {displaySettingValue(group.values?.[entry.key], entry)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700">
                      Go to it <HiArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Rules that live on a policy screen. Separated because the action is
          different: these leave the page. */}
      {surfaceResults.length > 0 && (
        <section>
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${TEXT.label} mb-2`}>
            Set on their own screens
          </h3>
          <ul className="space-y-2">
            {surfaceResults.map(({ route, module_key: moduleKey, matches }) => (
              <li key={route.path}>
                <Link
                  to={inWorkspace(route.path)}
                  className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:border-purple-200 hover:shadow-sm transition group"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 group-hover:text-purple-800 transition">{route.label}</span>
                    <span className={`block ${META} mt-0.5`}>
                      {moduleLabel(moduleKey)}
                      {matches.length > 0 && <> · {matches.join(" · ")}</>}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 shrink-0">
                    Open it <HiChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One group, as a row in the list. A link, not a shutter: clicking it opens
 * that group on its own page, the same way a name in the employee list opens
 * that person.
 *
 * Closed-state discipline from the shutter version survives — the name, the
 * one pill that says something, the size, an arrow. The explaining sentence
 * lives on the group's own page now, where there is room to read it.
 */
function SettingsGroupRow({ group, count, to }) {
  const Icon = groupIcon(group);
  const changed = (group.nonDefaultKeys || []).length;
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors"
    >
      <span className="shrink-0 w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 inline-flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1 flex items-center gap-2">
        <span className="text-[15px] font-semibold text-slate-900 truncate group-hover:text-purple-800 transition-colors">
          {group.label}
        </span>
        {/* Only when it says something — "Default" on every row was the
            loudest thing on the old page and told nobody anything. */}
        {changed > 0 && (
          <span className="shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap bg-purple-50 text-purple-700 border-purple-200">
            Customised
          </span>
        )}
      </span>
      <span className={`shrink-0 ${TEXT.meta} tabular-nums`}>{count}</span>
      <HiChevronRight
        aria-hidden="true"
        className="shrink-0 w-4 h-4 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition"
      />
    </Link>
  );
}
