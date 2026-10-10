// ─────────────────────────────────────────────────────────────────────────────
// SettingsHistoryPanel.jsx — "Change history": every settings change this
// organisation has made, newest first (#248).
//
// Contract: public/ref docs/md_settings/phases/phase3_api_analysis.md; the
// business shape is phases/phase3_business_walkthrough.md §4.
//
// HR ONLY, and the hub hides this section from a manager rather than offering
// it — #248 is guarded `authorize(['hr'])` and a manager gets 403. That is §2's
// rule exactly: a capability a role lacks is ABSENT, not broken.
//
// A TABLE, not cards. The walkthrough calls these "history cards", but what it
// describes is who / when / what / from / to — four scannable columns and a
// detail behind them, which is §3's list rule and the shape the rest of the
// product already uses for ledgers (see the billing audit trail). The row
// opens the record inspector; there is no View button (§3).
//
// PAGING IS "SHOW EARLIER", NOT PAGE NUMBERS, because #248 pages by an opaque
// keyset cursor with no total to count against — see useSettingsHistory.js.
//
// The filters are the walkthrough's, minus "entries per page", which is a
// control for a pagination model this endpoint doesn't have.
//
// ─── THE 2026-10-10 PASS ───────────────────────────────────────────────────
// Three things, all about the same complaint — the screen was a wall of
// controls above a wall of repetition:
//   · THE FILTERS ARE BEHIND A SHUTTER, like the cards on the hub. Six
//     controls, always open, took the top of the screen to ask a question most
//     readers don't have: they come to see what changed this week. Closed,
//     the bar says how many changes are listed and what is filtering them;
//     open, it is the same six controls.
//   · WHAT IS FILTERING THE LIST IS NAMED, AS CHIPS, each one removable.
//     Hiding the controls without saying what they are set to would be the
//     worse half of a shutter: a short list and no visible reason for it.
//     The chips read in words — "Changed by Asha", "From 1 Oct 2026" — never
//     a key or an id (§4).
//   · ROWS ARE GROUPED BY DAY, with "Today" and "Yesterday" by name. Twenty
//     consecutive rows each printing "9 Oct 2026, 4:12 pm" spent the widest
//     column in the table restating the same date; the day is now a heading
//     and the row keeps only its time. The full stamp is still in the record
//     inspector, which is where somebody checking an exact moment goes.
//
// ─── THE FOURTH PASS, SAME DAY: A DAY IS A SHUTTER ─────────────────────────
// Each day heading folds its own rows away, and the state held is the CLOSED
// set, because open is the default (user instruction: "keep by default open
// but user can close any time") and a page loaded from "show earlier changes"
// must not arrive folded. A shut day says how many changes it holds and which
// areas they touched, so folding never hides what it is hiding. The headings
// carry the product's purple and the tab now opens with the same banded
// heading as the other four, which is the "match the project theme" half of
// the same instruction.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  HiAdjustments, HiArrowNarrowRight, HiChevronDown, HiClock, HiRefresh, HiX,
} from "react-icons/hi";
import Skeleton from "../components/Skeleton";
import { PersonSelect } from "../components/PersonPicker";
import { rowPreviewProps } from "../components/DetailDialog";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import { fmtDate, fmtTime } from "../attendance/dates";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import useSettingsHistory from "./useSettingsHistory";
import SettingsHistoryDialog from "./SettingsHistoryDialog";
import {
  CHANGE_SOURCE_OPTIONS, changeActorName, changeDayHeading, changeSourceLabel,
  displaySettingValue, moduleLabel,
} from "./settingsMeta";
import { settingLabel } from "./settingsBlurbs";
import { META, TEXT } from "./settingsText";

const FIELD = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition";
const LABEL = `block text-[11px] font-bold uppercase tracking-wider ${TEXT.label} mb-1.5`;
const BTN = "px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5";

/**
 * @param {object} props
 * @param {object[]} props.groups        catalogue groups, for the area filter
 * @param {object[]} props.entries       catalogue settings, for labels
 * @param {object} props.groupsByKey
 * @param {string} props.surface         the host page's field-help surface id
 */
export default function SettingsHistoryPanel({ groups, entries, groupsByKey, surface }) {
  const history = useSettingsHistory();
  const { activeOptions, nameOf } = useEmployeeDirectory();
  const [selected, setSelected] = useState(null);
  // Shut on arrival. The hook always starts on EMPTY_FILTERS, so there is
  // never a filter in force that this would need to reveal — and once one IS
  // in force, the chips below the bar name it whether the controls are open
  // or shut, so closing them never hides why the list is short.
  const [showFilters, setShowFilters] = useState(false);

  const {
    items, loading, loadingMore, error, unavailable, hasMore,
    filters, filtered, setFilter, clearFilters, loadMore, reload,
  } = history;

  const entriesByKey = useMemo(
    () => Object.fromEntries((entries || []).map((e) => [e.key, e])),
    [entries],
  );

  // The settings offered by the "setting" filter follow the chosen area, so
  // the two can never be sent contradicting each other (422 FILTER_CONFLICT).
  const settingOptions = useMemo(() => {
    const scoped = filters.group
      ? (entries || []).filter((e) => e.group_key === filters.group)
      : (entries || []);
    return [...scoped]
      .map((e) => ({ ...e, label: settingLabel(e) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [entries, filters.group]);

  /* One row per active filter, in words. This is what makes closing the
     filter bar safe: a list cut from 400 changes to 3 has to say why, and it
     has to say it without printing a group key or an actor id (§4). */
  const chips = useMemo(() => {
    const out = [];
    if (filters.group) {
      out.push({ key: "group", label: `In ${groupsByKey[filters.group]?.label || moduleLabel(filters.group)}` });
    }
    if (filters.settingKey) {
      out.push({ key: "settingKey", label: settingLabel(entriesByKey[filters.settingKey]) || "One setting" });
    }
    // `nameOf` answers "Loading…" until the directory arrives, which is the
    // right thing to print (§4) — never the id we are filtering on.
    if (filters.actorId) out.push({ key: "actorId", label: `Changed by ${nameOf(filters.actorId)}` });
    if (filters.from) out.push({ key: "from", label: `From ${fmtDate(filters.from)}` });
    if (filters.to) out.push({ key: "to", label: `Up to ${fmtDate(filters.to)}` });
    if (filters.source) out.push({ key: "source", label: `From ${changeSourceLabel(filters.source) || "one place"}` });
    return out;
  }, [filters, groupsByKey, entriesByKey, nameOf]);

  /* The rows, cut into days. Keyset paging appends older pages to the same
     array, so the groups are built from whatever has arrived rather than from
     a page — "Show earlier changes" extends the last day or starts a new one,
     and neither re-sorts what is already on screen. */
  const days = useMemo(() => {
    const out = [];
    for (const item of items) {
      const heading = changeDayHeading(item.occurred_at);
      const last = out[out.length - 1];
      if (last && last.heading === heading) last.items.push(item);
      else out.push({ heading, items: [item] });
    }
    /* What a shut day says instead of its rows: the areas it touched, which
       is the one thing worth knowing before deciding to open it. Names, not
       keys (§4), and at most three so the heading stays one line. */
    for (const day of out) {
      const areas = [];
      for (const item of day.items) {
        const label = groupsByKey[item.group]?.label || moduleLabel(item.group);
        if (label && !areas.includes(label)) areas.push(label);
      }
      day.areas = areas.length > 3 ? `${areas.slice(0, 3).join(", ")} and more` : areas.join(", ");
    }
    return out;
  }, [items, groupsByKey]);

  /* Which days are folded away. OPEN IS THE DEFAULT (user instruction,
     2026-10-10: "keep by default open but user can close any time"), so this
     holds the CLOSED ones — a day that arrives from "show earlier changes"
     is then open like the rest, where a set of open days would have landed
     every new day shut. */
  const [closedDays, setClosedDays] = useState(() => new Set());
  const toggleDay = (heading) => {
    setClosedDays((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading); else next.add(heading);
      return next;
    });
  };
  const allDaysClosed = days.length > 0 && days.every((d) => closedDays.has(d.heading));
  // Acts on the days ON SCREEN only, so it can't fold a day that arrives later.
  const toggleAllDays = () => setClosedDays(
    allDaysClosed ? new Set() : new Set(days.map((d) => d.heading)),
  );

  return (
    <div className="min-w-0 space-y-4">
      {/* The same banded heading the module tabs carry (see OrgSettingsPage),
          icon badge and all: this is one tab of five, and until it had the
          band it read as a different screen that had been bolted on. */}
      <div className="min-w-0 flex items-start gap-3 bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
          <HiClock className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-slate-900">Change history</h2>
            <FieldHelp surface={surface} field="history" label="the change history" className="mb-0 ml-1" />
          </div>
          <p className={`text-sm ${TEXT.body} mt-0.5`}>
            Every change made to your company’s settings, newest first. Open a row to see what it was before, who changed it and why.
          </p>
        </div>
      </div>

      {/* ── The filter bar: a shutter, like the cards on the hub. ─────────── */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="hist-filters"
            className={`inline-flex items-center gap-1.5 text-xs font-bold ${TEXT.body} hover:text-purple-800 transition`}
          >
            <HiAdjustments className="w-3.5 h-3.5" aria-hidden="true" />
            Narrow this down
            <HiChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>

          {/* How much is on screen. There is no total to count against — the
              endpoint pages by cursor — so it says what IS listed and whether
              there is more, rather than inventing "20 of 413". */}
          <p className={`${META} flex-1 min-w-0`}>
            {loading
              ? "Loading…"
              : items.length === 0
                ? "Nothing listed"
                : `${items.length} change${items.length === 1 ? "" : "s"} listed${hasMore ? ", with earlier ones to load" : ""}`}
          </p>

          {/* Folding the days is a property of the LIST, so it sits on the
              list's own bar rather than inside the filters. */}
          {days.length > 1 && (
            <button
              type="button"
              onClick={toggleAllDays}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900"
            >
              <HiChevronDown
                aria-hidden="true"
                className={`w-3.5 h-3.5 transition-transform ${allDaysClosed ? "-rotate-90" : ""}`}
              />
              {allDaysClosed ? "Open every day" : "Close every day"}
            </button>
          )}

          {filtered && (
            <button type="button" onClick={clearFilters} className={`${BTN} shrink-0`}>
              <HiX className="w-3.5 h-3.5" /> Clear all
            </button>
          )}
        </div>

        {/* What is filtering the list, named and individually removable. Shown
            whether the controls are open or shut: with them shut it is the
            only account of why the list is short. */}
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-4 pb-3">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => setFilter(chip.key, "")}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-[11px] font-semibold text-purple-800 hover:bg-purple-100 transition"
                >
                  {chip.label}
                  <HiX className="w-3 h-3 text-purple-400" aria-hidden="true" />
                  <span className="sr-only">— remove this filter</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Hidden, not unmounted: a half-typed date range survives the bar
            being shut, and the controls keep their ids for the labels. */}
        <div id="hist-filters" className={showFilters ? "border-t border-slate-100 p-4" : "hidden"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="min-w-0">
              <label className={LABEL} htmlFor="hist-group">Area</label>
              <select
                id="hist-group"
                value={filters.group}
                onChange={(e) => setFilter("group", e.target.value)}
                className={FIELD}
              >
                <option value="">Everywhere</option>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className={LABEL} htmlFor="hist-setting">Setting</label>
              <select
                id="hist-setting"
                value={filters.settingKey}
                onChange={(e) => setFilter("settingKey", e.target.value)}
                className={FIELD}
              >
                <option value="">Anything</option>
                {settingOptions.map((e) => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              {/* A person is picked with PersonSelect, never a native select of
                  people (§4) — and never by typing an id. */}
              <span className={LABEL}>Changed by</span>
              <PersonSelect
                people={activeOptions}
                value={filters.actorId}
                onChange={(id) => setFilter("actorId", id)}
                placeholder="Anyone"
                clearLabel="Anyone"
                aria-label="Filter by who made the change"
              />
            </div>

            <div className="min-w-0 grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className={LABEL} htmlFor="hist-from">From</label>
                <input
                  id="hist-from"
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => setFilter("from", e.target.value)}
                  className={FIELD}
                />
              </div>
              <div className="min-w-0">
                <label className={LABEL} htmlFor="hist-to">To</label>
                <input
                  id="hist-to"
                  type="date"
                  // The server refuses an inverted range (422 INVALID_DATE_RANGE).
                  // The inputs make it unpickable, so nobody meets that error by
                  // doing something the control allowed.
                  min={filters.from || undefined}
                  value={filters.to}
                  onChange={(e) => setFilter("to", e.target.value)}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="min-w-0">
              <label className={LABEL} htmlFor="hist-source">
                <HelpLabel text="Changed from" help={{ surface, field: "change_source" }} />
              </label>
              <select
                id="hist-source"
                value={filters.source}
                onChange={(e) => setFilter("source", e.target.value)}
                className={FIELD}
              >
                {CHANGE_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value || "any"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Part of the record couldn't be read. Say so — a history that looks
          complete but isn't is worse than one that admits the gap (§7). */}
      {unavailable.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 text-xs text-slate-700">
          <span className="flex-1">
            Some of the record couldn’t be read just now, so changes from {unavailable.length === 1 ? "one area" : `${unavailable.length} areas`} may be missing from this list.
          </span>
          <button type="button" onClick={reload} className={`${BTN} shrink-0`}>
            <HiRefresh className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {/* An error NEXT TO the list, never instead of it. A failed "show
          earlier" leaves the rows already on screen in state (see
          useSettingsHistory), and replacing them with a red box would take a
          list someone was reading away from them to report a page that never
          arrived. Only an empty list gets the error on its own. */}
      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-slate-700">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={reload} className={`${BTN} shrink-0`}>
            <HiRefresh className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {loading ? (
        <Skeleton type="table" rows={6} />
      ) : items.length === 0 ? (
        error ? null : (
        <p className={`text-sm ${TEXT.body} bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3`}>
          {filtered
            ? "No changes match those filters. Try widening them, or clear them to see everything."
            : "Nothing has been changed yet. Once somebody edits a setting, it will be recorded here."}
        </p>
        )
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className={`bg-slate-50/80 text-[10px] uppercase font-bold ${TEXT.label} tracking-wider border-b border-slate-100`}>
                    <th className="px-5 py-3.5 w-24">Time</th>
                    <th className="px-5 py-3.5">Setting</th>
                    <th className="px-5 py-3.5">Change</th>
                    <th className="px-5 py-3.5">Changed by</th>
                  </tr>
                </thead>
                {/* One `tbody` per day, which is what HTML gives us for a
                    grouped table: the heading is a row of the group it heads,
                    not a floating caption between two tables. The heading is
                    also the day's own shutter — a long history is read a day
                    at a time, and folding the days already dealt with is how
                    somebody gets to the one they haven't. */}
                {days.map((day) => {
                  const dayClosed = closedDays.has(day.heading);
                  return (
                  <tbody key={day.heading} className="divide-y divide-slate-50">
                    <tr className="bg-purple-50/40 border-y border-purple-100/70">
                      <th scope="colgroup" colSpan={4} className="px-5 py-0 text-left font-normal">
                        <button
                          type="button"
                          onClick={() => toggleDay(day.heading)}
                          aria-expanded={!dayClosed}
                          className="w-full flex items-center gap-2 py-2.5 text-left group"
                        >
                          <HiChevronDown
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 shrink-0 text-purple-500 transition-transform ${dayClosed ? "-rotate-90" : ""}`}
                          />
                          <span className={`text-[11px] font-bold ${TEXT.value} group-hover:text-purple-800 transition-colors`}>
                            {day.heading}
                          </span>
                          {/* Said in full in the sr-only line below, so the
                              pill is decoration for the eye only. */}
                          <span aria-hidden="true" className="shrink-0 px-1.5 py-0.5 rounded-full bg-white border border-purple-200 text-[10px] font-bold text-purple-700 tabular-nums">
                            {day.items.length}
                          </span>
                          {/* Shut, the heading has to stand in for its rows,
                              so it says which areas the day touched. */}
                          {dayClosed && day.areas && (
                            <span className={`${META} truncate`}>{day.areas}</span>
                          )}
                          <span className="sr-only">
                            {day.items.length} change{day.items.length === 1 ? "" : "s"} — {dayClosed ? "show them" : "hide them"}
                          </span>
                        </button>
                      </th>
                    </tr>
                    {!dayClosed && day.items.map((item, i) => {
                      const entry = entriesByKey[item.setting_key];
                      const group = groupsByKey[item.group];
                      return (
                        <tr
                          // The API sends no row id, so the key is the one thing
                          // that is unique per change: when + which setting.
                          key={`${item.occurred_at}-${item.setting_key}-${i}`}
                          {...rowPreviewProps(() => setSelected(item), "Change details")}
                        >
                          {/* The day is the heading above; the row keeps the
                              time it happened at. */}
                          <td className={`px-5 py-3.5 ${TEXT.meta} whitespace-nowrap tabular-nums align-top`}>
                            {fmtTime(item.occurred_at)}
                          </td>
                          <td className="px-5 py-3.5 min-w-0 align-top">
                            <p className={`font-semibold ${TEXT.value}`}>{entry?.label || item.setting_key}</p>
                            <p className={`${META} mt-0.5`}>{group?.label || moduleLabel(item.group)}</p>
                          </td>
                          <td className={`px-5 py-3.5 ${TEXT.body} align-top`}>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              <span className={`${TEXT.meta} line-through`}>{displaySettingValue(item.old_value, entry)}</span>
                              <HiArrowNarrowRight className="w-3.5 h-3.5 shrink-0 text-purple-300" aria-hidden="true" />
                              <span className={`font-semibold ${TEXT.value}`}>{displaySettingValue(item.new_value, entry)}</span>
                            </span>
                          </td>
                          <td className={`px-5 py-3.5 ${TEXT.body} whitespace-nowrap align-top`}>
                            {changeActorName(item.actor, nameOf)}
                            {changeSourceLabel(item.source) && (
                              <span className={`block ${META}`}>{changeSourceLabel(item.source)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  );
                })}
              </table>
            </div>
          </div>

          {/* Keyset paging: there is a next page or there isn't. No totals,
              no page numbers — see useSettingsHistory.js. */}
          {hasMore && (
            <div className="flex justify-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={BTN}>
                {loadingMore
                  ? <><span className="inline-block w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> Loading…</>
                  : <><HiClock className="w-3.5 h-3.5" /> Show earlier changes</>}
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <SettingsHistoryDialog
          item={selected}
          entry={entriesByKey[selected.setting_key]}
          group={groupsByKey[selected.group]}
          nameOf={nameOf}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
