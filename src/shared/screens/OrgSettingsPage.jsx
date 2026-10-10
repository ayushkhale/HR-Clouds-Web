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
  HiArrowRight, HiChevronDown, HiChevronRight, HiClock, HiSearch, HiX,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import Skeleton from "../components/Skeleton";
import { ErrorState, FilterTabs, Toast, useToast } from "../attendance/ui";
import { useCurrentWorkspace } from "../attendance/paths";
import FieldHelp from "../fieldHelp/FieldHelp";
import useSettingsHub from "../settings/useSettingsHub";
import { settingLabel } from "../settings/settingsBlurbs";
import {
  displaySettingValue, editRouteFor, LANDING_MODULE, moduleBlurb, moduleIcon,
  moduleLabel, searchSettings, searchSurfaces, surfaceRouteFor, tabsFor,
} from "../settings/settingsMeta";
import { META, TEXT } from "../settings/settingsText";
import { SurfaceHubCard } from "../settings/settingsUi";
import SettingsGroupForm from "../settings/SettingsGroupForm";
import SettingsHistoryPanel from "../settings/SettingsHistoryPanel";
import SettingsSaveDock from "../settings/SettingsSaveDock";
import useDirtyCards, { revealGroupCard } from "../settings/settingsDock";

const SURFACE = "settings.hub";

/* The change history is its own tab rather than a module section: it spans
   every module, so it belongs beside them, not inside one. HR ONLY — #248 is
   guarded `authorize(['hr'])` and a manager gets 403, so the tab is ABSENT
   for them rather than present and broken (§2). */
const HISTORY_TAB = "__history";

export default function OrgSettingsPage() {
  const workspace = useCurrentWorkspace();
  const hub = useSettingsHub();
  const { toast, showToast, clearToast } = useToast();
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState("");
  // The card a search hit sent the reader to, ringed for a moment so they can
  // see which of eleven cards answered them.
  const [flash, setFlash] = useState(null);
  // Which shutters are up. Held here rather than in each card because two
  // things outside a card have to open it: a search hit, and the save dock
  // naming a card with unsaved changes in it.
  const [openCards, setOpenCards] = useState(() => new Set());
  const searchRef = useRef(null);
  const dock = useDirtyCards();

  const {
    groups, entriesByGroup, groupsByKey, entries, surfaces, surfacesByModule,
    modules, loading, error, valuesError, reload, applyWrite,
  } = hub;

  /** Every link on this page is prefixed with the reader's own workspace. */
  const inWorkspace = useCallback(
    (path) => (workspace ? `/dashboard/${workspace}${path}` : null),
    [workspace],
  );

  const tabs = useMemo(() => tabsFor(modules), [modules]);
  // The history reads across every module and is HR's alone.
  const canSeeHistory = workspace === "hr";
  const showHistory = canSeeHistory && tab === HISTORY_TAB;
  /* The tab strip is alphabetical, so "first" is no longer "most useful" —
     open on the company's own record if this reader has it, and otherwise on
     whatever they do have, so the page never opens empty for a role (or plan)
     missing a module. */
  const landing = tabs.some((t) => t.key === LANDING_MODULE)
    ? LANDING_MODULE
    : tabs[0]?.key || null;
  const activeTab = showHistory
    ? HISTORY_TAB
    : (tab && tabs.some((t) => t.key === tab) ? tab : landing);

  // The open tab's own icon, for the section band. Capitalised because JSX
  // needs a component, not a value.
  const TabIcon = moduleIcon(activeTab);

  const searching = query.trim().length >= 2;
  const results = useMemo(
    () => (searching ? searchSettings(entries, groupsByKey, query) : []),
    [searching, entries, groupsByKey, query],
  );
  const surfaceResults = useMemo(
    () => (searching ? searchSurfaces(surfaces, query) : []),
    [searching, surfaces, query],
  );

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
      // Some screens exist in the HR workspace only. Hidden rather than
      // offered-and-bounced (§2).
      if (route.hrOnly && workspace !== "hr") continue;
      const key = route.path;
      if (!byRoute.has(key)) byRoute.set(key, { route, surfaces: [] });
      byRoute.get(key).surfaces.push(surface);
    }
    return [...byRoute.values()];
  }, [surfacesByModule, activeTab, workspace]);

  /* ─── The shutters ─────────────────────────────────────────────────────── */
  const toggleCard = useCallback((key) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const openCard = useCallback((key) => {
    setOpenCards((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  // Expand/collapse act on the OPEN TAB only: "collapse all" closing cards on
  // four tabs the reader can't see would be a change they never asked for and
  // can't observe.
  const allOpen = visibleGroups.length > 0 && visibleGroups.every((g) => openCards.has(g.key));
  const toggleAll = () => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      for (const group of visibleGroups) {
        if (allOpen) next.delete(group.key); else next.add(group.key);
      }
      return next;
    });
  };

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

  /** A search hit: switch to its tab, drop the query, open and ring the card. */
  const jumpToGroup = (entry) => {
    const group = groupsByKey[entry.group_key];
    if (group?.module_key) setTab(group.module_key);
    setQuery("");
    openCard(entry.group_key);
    setFlash(entry.group_key);
  };

  /**
   * Bring a card back into view from the save dock. Dropping the query is the
   * important half: while a search is on screen the cards are hidden, and
   * scrolling to a `display:none` card does nothing. Opening it is the other
   * half — a card can be dirty with its shutter down.
   */
  const revealFromDock = (key) => {
    setQuery("");
    openCard(key);
    setFlash(key);
  };

  /**
   * A tab change throws away every unsaved edit in the tab being left, because
   * the cards unmount and their edits live in them (which is what makes one
   * card one transaction). So it asks first.
   *
   * `window.confirm` is the in-app dialog here and returns a Promise — it MUST
   * be awaited or the branch is always taken (§7).
   */
  const changeTab = async (next) => {
    if (next === activeTab) return;
    if (dock.total > 0) {
      const where = dock.cards.map((c) => c.label).join(", ");
      const ok = await window.confirm(
        `You have ${dock.total} unsaved change${dock.total === 1 ? "" : "s"} in ${where}. Moving to another section will discard ${dock.total === 1 ? "it" : "them"}. Move anyway?`,
      );
      if (!ok) return;
    }
    setTab(next);
  };

  // Scroll only once the card is actually mounted under the new tab, which is
  // the render after `setTab` — hence an effect rather than a click handler.
  useEffect(() => {
    if (!flash) return undefined;
    revealGroupCard(flash);
    const timer = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [flash]);

  const tabOptions = useMemo(
    () => [
      ...tabs.map((t) => {
        const Icon = moduleIcon(t.key);
        const n = groups.filter((g) => g.module_key === t.key).length;
        return {
          value: t.key,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {t.label}
              {/* A module that is only policy screens has no groups to count,
                  so it gets no number rather than a misleading "(0)". */}
              {n > 0 && <span className="tabular-nums opacity-60">({n})</span>}
            </span>
          ),
        };
      }),
      ...(canSeeHistory ? [{
        value: HISTORY_TAB,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <HiClock className="w-3.5 h-3.5" aria-hidden="true" />
            Change history
          </span>
        ),
      }] : []),
    ],
    [tabs, groups, canSeeHistory],
  );

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
                  {/* The tabs get the whole line. Five of them plus a search
                      box on one row left both cramped, and the strip is the
                      page's primary navigation. */}
                  <div className="min-w-0 overflow-x-auto no-scrollbar">
                    <FilterTabs options={tabOptions} value={activeTab} onChange={changeTab} />
                  </div>

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

                  {/* HIDDEN, NOT UNMOUNTED, while a search is on screen. A
                      card holds its own unsaved edits, so unmounting the list
                      to show search results meant typing in the search box
                      silently threw away whatever had just been changed. */}
                  {showHistory ? (
                    !searching && (
                      <SettingsHistoryPanel
                        groups={groups}
                        entries={entries}
                        groupsByKey={groupsByKey}
                        surface={SURFACE}
                      />
                    )
                  ) : (
                    <div className={searching ? "hidden" : "min-w-0 space-y-4"}>
                      {/* The section's own heading, and what the whole area is
                          for in a line. The tab ⓘ sits beside the heading
                          rather than in the tablist — §10 forbids one inside a
                          tablist, and this is the heading of the open tab. */}
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4">
                        <div className="min-w-0 flex items-start gap-3">
                          {/* The module's own icon, in the house badge — the
                              same one the tab strip and the sidebar use, so
                              the open tab is named twice in the same visual
                              language. It also gives the thinner tabs
                              (Company & Billing is one card) something to be
                              a page rather than a stray card on grey. */}
                          <span className="shrink-0 w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                            <TabIcon className="w-5 h-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center">
                              <h2 className="text-lg font-bold text-slate-900">{moduleLabel(activeTab)}</h2>
                              <FieldHelp surface={SURFACE} field={`tab.${activeTab}`} label={`the ${moduleLabel(activeTab)} settings`} className="mb-0 ml-0.5" />
                            </div>
                            {moduleBlurb(activeTab) && (
                              <p className={`text-sm ${TEXT.body} mt-0.5`}>{moduleBlurb(activeTab)}</p>
                            )}
                          </div>
                        </div>
                        {visibleGroups.length > 1 && (
                          <button
                            type="button"
                            onClick={toggleAll}
                            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900"
                          >
                            <HiChevronDown
                              aria-hidden="true"
                              className={`w-3.5 h-3.5 transition-transform ${allOpen ? "rotate-180" : ""}`}
                            />
                            {allOpen ? "Close all" : "Open all"}
                          </button>
                        )}
                      </div>

                      {/* THE WALL: ONE COLUMN OF FULL-WIDTH BRICKS. Closed
                          cards are a single height, so the stack is flush —
                          and opening one pushes the rest DOWN rather than
                          moving any card sideways. See the tombstone in
                          settingsMeta for why the two-column version had to
                          go: it could be gapless or still, never both. */}
                      {visibleGroups.length > 0 && (
                        <div className="min-w-0 space-y-4">
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
                                onDirtyChange={dock.register}
                                flash={flash === group.key}
                                open={openCards.has(group.key)}
                                onToggle={toggleCard}
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Policy areas: not settings at all, but whole screens
                          that manage many records. Kept apart under their own
                          heading, so a list of links never reads as something
                          editable here. */}
                      {surfaceCards.length > 0 && (
                        <section className="pt-1">
                          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${TEXT.label} mb-2.5`}>
                            Managed on their own screens
                          </h3>
                          {/* These ARE a grid, unlike the group cards: their
                              content is fixed (a blurb and one line of rule
                              names), so a row of them is already level, and
                              `items-stretch` plus the card's own `mt-auto`
                              footer lands every "Manage" link at the same
                              height. Nothing here opens, so there is no row
                              that can suddenly grow. */}
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
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
                </>
              )}
            </>
          )}
        </div>

        {/* On the history tab and while loading there is nothing to save, and
            a dock saying "everything is saved" over a read-only list is noise.
            It DOES stay through a search, because the cards it reports on are
            still mounted and still dirty behind it. */}
        {!loading && !error && !showHistory && tabs.length > 0 && (
          <SettingsSaveDock
            cards={dock.cards}
            total={dock.total}
            saving={dock.saving}
            onReveal={revealFromDock}
            onSaveAll={dock.saveAll}
            onDiscardAll={dock.discardAll}
          />
        )}
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
