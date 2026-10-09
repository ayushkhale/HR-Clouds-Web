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
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { HiArrowNarrowRight, HiClock, HiRefresh, HiX } from "react-icons/hi";
import Skeleton from "../components/Skeleton";
import { PersonSelect } from "../components/PersonPicker";
import { rowPreviewProps } from "../components/DetailDialog";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import { fmtDateTime } from "../attendance/dates";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import useSettingsHistory from "./useSettingsHistory";
import SettingsHistoryDialog from "./SettingsHistoryDialog";
import {
  CHANGE_SOURCE_OPTIONS, changeActorName, changeSourceLabel, displaySettingValue, moduleLabel,
} from "./settingsMeta";

const FIELD = "w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5";
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
    return [...scoped].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [entries, filters.group]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <div className="flex items-center">
          <h2 className="text-lg font-bold text-slate-900">Change history</h2>
          <FieldHelp surface={surface} field="history" label="the change history" className="mb-0 ml-1" />
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Every change made to your company’s settings, newest first. Click a row to see what it was before.
        </p>
      </div>

      {/* ── Filters. One row on a laptop, stacked on a phone. ─────────────── */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4">
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

        {filtered && (
          <div className="flex justify-end mt-3">
            <button type="button" onClick={clearFilters} className={BTN}>
              <HiX className="w-3.5 h-3.5" /> Clear filters
            </button>
          </div>
        )}
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
        <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
          {filtered
            ? "No changes match those filters. Try widening them, or clear them to see everything."
            : "Nothing has been changed yet. Once somebody edits a setting, it will be recorded here."}
        </p>
        )
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-100">
                    <th className="px-5 py-3.5">When</th>
                    <th className="px-5 py-3.5">Setting</th>
                    <th className="px-5 py-3.5">Change</th>
                    <th className="px-5 py-3.5">Changed by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, i) => {
                    const entry = entriesByKey[item.setting_key];
                    const group = groupsByKey[item.group];
                    return (
                      <tr
                        // The API sends no row id, so the key is the one thing
                        // that is unique per change: when + which setting.
                        key={`${item.occurred_at}-${item.setting_key}-${i}`}
                        {...rowPreviewProps(() => setSelected(item), "Change details")}
                      >
                        <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap tabular-nums">
                          {fmtDateTime(item.occurred_at)}
                        </td>
                        <td className="px-5 py-3.5 min-w-0">
                          <p className="font-semibold text-slate-800">{entry?.label || item.setting_key}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {group?.label || moduleLabel(item.group)}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 line-through">{displaySettingValue(item.old_value, entry)}</span>
                            <HiArrowNarrowRight className="w-3.5 h-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                            <span className="font-semibold text-slate-800">{displaySettingValue(item.new_value, entry)}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                          {changeActorName(item.actor, nameOf)}
                          {changeSourceLabel(item.source) && (
                            <span className="block text-[11px] text-slate-400">{changeSourceLabel(item.source)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
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
