// ─────────────────────────────────────────────────────────────────────────────
// OfficeLocationsView — the office-location cards, searchable, with the
// loading, "couldn't load" and "none yet" states.
//
// ONE component for HR and the manager (CLAUDE.md §2). The cards, the wording
// and the search are identical in both workspaces; only the WRITE affordances
// differ, and they are absent rather than disabled because a manager has no
// write endpoint to call at all (officePlanes.js carries the contract). Pass no
// `onEdit`/`onToggle` and the pencil and the status switch simply aren't drawn
// — never render a button that 403s.
//
// WHY THE HEADING AND THE ADD BUTTON ARE NOT IN HERE: they live in each
// workspace's page shell, beside each other, the same way the client-sites pair
// is arranged. HR's shell also owns the add/edit dialog and its map, because HR
// is the only role that can open one.
//
// THE SEARCH IS CLIENT-SIDE ON PURPOSE: `GET /organizations/locations` returns
// the whole list unpaginated and takes no search parameter, so filtering here
// is reading what the server sent, not inventing a query it hasn't got (§7).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { HiLocationMarker, HiPencil, HiSearch, HiSparkles } from "react-icons/hi";
import { HelpLabel } from "../fieldHelp/FieldHelp";

const RADIUS_HELP = { surface: "organization.office_locations", field: "geofence_radius_meters" };

/**
 * @param {object} props
 * @param {object} props.list        from `useOfficeLocations(viewer)`
 * @param {(loc: object) => void} [props.onEdit]    omit where the role can’t edit
 * @param {(loc: object) => void} [props.onToggle]  omit where the role can’t
 *   change a location’s active status
 * @param {Set<string>} [props.togglingIds]  ids with a status write in flight
 */
export default function OfficeLocationsView({ list, onEdit, onToggle, togglingIds }) {
  const { rows, loading, error, reload } = list;
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((loc) => (loc.name || "").toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="relative flex-1 sm:w-72">
          <HiSearch className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search location..."
            aria-label="Search office locations by name"
            className="w-full bg-slate-50/70 border border-slate-200/80 rounded-full pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {error && !loading && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex flex-wrap items-center gap-3" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => reload()}
            className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-[20px] h-72 border border-slate-100 animate-pulse" />
          ))
        ) : shown.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 font-medium">
            <HiLocationMarker className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            {/* An empty state says what to do next (§6) — but only where doing
                it is this person's job. A manager cannot add a location, so
                they are told the state, not given an instruction they can't act on. */}
            {error
              ? "Locations unavailable."
              : query
                ? `No locations matching “${query.trim()}”`
                : onEdit
                  ? "No locations yet — add your first office."
                  : "No office locations have been set up yet."}
          </div>
        ) : (
          shown.map((loc) => {
            const toggling = !!togglingIds?.has(loc.id);
            return (
              <div
                key={loc.id}
                className={`rounded-[20px] transition-all duration-300 group flex flex-col overflow-hidden relative ${loc.is_active
                  ? "bg-white border border-slate-100 hover:border-purple-200 hover:shadow-xl hover:-translate-y-1 shadow-sm"
                  : "bg-slate-50/50 border border-dashed border-slate-300 hover:border-slate-400 opacity-90 hover:opacity-100 hover:-translate-y-1 shadow-inner"
                  }`}
              >
                <div className="p-6 pb-4 border-b border-slate-50 relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-full border ${loc.is_active
                      ? "bg-violet-50 text-violet-600 border-violet-100"
                      : "bg-rose-50 text-rose-600 border-rose-100"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${loc.is_active ? "bg-violet-500" : "bg-rose-500"}`} />
                      {loc.is_active ? "Active" : "Inactive"}
                    </div>

                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(loc)}
                        aria-label={`Edit ${loc.name}`}
                        className="text-slate-400 hover:text-purple-600 transition-colors p-1.5 rounded-lg hover:bg-purple-50"
                      >
                        <HiPencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${loc.is_active ? "bg-purple-50 text-purple-600" : "bg-slate-100 text-slate-400"
                      }`}>
                      <HiLocationMarker className="w-5 h-5" />
                    </div>
                    <h3 className={`text-[17px] font-bold leading-tight transition-colors line-clamp-1 ${loc.is_active ? "text-slate-900 group-hover:text-purple-700" : "text-slate-700"
                      }`}>
                      {loc.name}
                    </h3>
                  </div>
                </div>

                <div className="p-6 pt-4 flex-1 flex flex-col gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Address</p>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed line-clamp-2">
                      {loc.address || "N/A"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-auto">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">City &amp; State</p>
                      <p className="text-xs font-semibold text-slate-700 truncate">
                        {[loc.city, loc.state].filter(Boolean).join(", ") || "N/A"}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                        <HelpLabel text="Radius" help={RADIUS_HELP} />
                      </p>
                      <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <HiSparkles className="w-3.5 h-3.5 text-purple-500" />
                        {loc.geofence_radius_meters != null ? `${loc.geofence_radius_meters} meters` : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* The status switch is a write, so it is absent for a role with
                    no update endpoint. The Active/Inactive badge above already
                    states the status, so nothing is lost by dropping it. */}
                {onToggle && (
                  <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold text-slate-600">Location Status</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!loc.is_active}
                      aria-label={`${loc.is_active ? "Deactivate" : "Activate"} ${loc.name}`}
                      onClick={() => onToggle(loc)}
                      disabled={toggling}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 disabled:cursor-wait ${loc.is_active ? "bg-purple-600" : "bg-slate-300"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${loc.is_active ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
