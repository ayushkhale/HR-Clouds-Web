// ─────────────────────────────────────────────────────────────────────────────
// MyWorkLocationsPage — the places this person may clock in from: their base
// office and, for field staff, the client sites assigned to them. Mounted in
// all three workspaces under each one's own prefix (SELF_SERVICE_PAGES.locations)
// for the same reason the rest of self-service is — everybody punches, HR and
// managers included, so nobody is sent into the employee workspace to read
// their own work locations (CLAUDE.md §2).
//
// WHY THIS PAGE EXISTS. Where a field worker may stand only ever showed inline
// on the dashboard punch card, so an `out_of_bounds` flag arrived with no
// standing place to check it against. This is the one screen that answers
// "where am I allowed to clock in from?" on its own, in full.
//
// READ-ONLY, ON PURPOSE. An employee cannot assign themselves a site — the
// assign endpoints are HR/manager only (§6 of the contract). A field site on an
// `office` employee does nothing until HR changes the mode, so this page reads
// the mode and says what it means rather than offering controls that would 403
// (CLAUDE.md §2).
//
// CONTRACT TRAPS (md_attendance/7_work_mode_and_field_geofencing_api.md)
//  · `work_mode` here is the NORMALIZED contractual mode (office | remote |
//    hybrid | field) and is fail-secure — a null profile reads as `office`.
//  · `assigned_office` carries only { id, name } — no pin — so the office is
//    named, never mapped. Client sites carry coordinates and a radius.
//  · Coordinates arrive as STRINGS from numeric columns; run them through
//    `coord()` before handing them anywhere (a map URL silently breaks on
//    "18.52043000"). The id itself never reaches the screen (§4).
//  · A geofence outcome never blocks a punch — the whole feature is a flag for
//    HR, not a gate — so nothing here is framed as a failure.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiLocationMarker, HiOfficeBuilding, HiHome, HiSwitchHorizontal, HiRefresh,
  HiExternalLink,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailSection, rowPreviewProps } from "../components/DetailDialog";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { attendanceAPI } from "../api";
import { fmtDate } from "../attendance/dates";
import { normalizeWorkMode } from "../attendance/geofence";
import { coord, hasPin } from "../attendance/fieldPlanes";
import { EmptyState, ErrorState, InlineAlert, LoadingRows } from "../attendance/ui";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { SECONDARY_BTN } from "../documents/ui";

const SURFACE = "attendance.my_work_locations";

/**
 * What each work mode means for where the person stands, in their own words —
 * the consequence, not the mechanism (§6). Tones are purple throughout (§5):
 * on-site is indigo (info), field is violet (the mode this page is really for),
 * remote is grey (no check), hybrid is violet (a daily choice).
 */
const MODE_VIEW = {
  office: {
    pill: "At the office",
    tone: "blue",
    panel: "from-indigo-50/80 via-white to-white border-indigo-100",
    icon: HiOfficeBuilding,
    headline: "You clock in from your assigned office.",
    hint: "Clocking in from inside your office counts without a flag. Further away, the punch still works but your manager sees it to review.",
  },
  remote: {
    pill: "Remote",
    tone: "slate",
    panel: "from-slate-50 via-white to-white border-slate-200",
    icon: HiHome,
    headline: "You work remotely, so your location isn’t checked when you clock in.",
    hint: "Clock in from wherever you’re working — nothing is geofenced for you.",
  },
  hybrid: {
    pill: "Hybrid",
    tone: "purple",
    panel: "from-purple-50/80 via-white to-white border-purple-100",
    icon: HiSwitchHorizontal,
    headline: "You split your time between the office and home.",
    hint: "Choose where you are each day when you clock in. An office day is checked against your office; a home day isn’t checked.",
  },
  field: {
    pill: "Field",
    tone: "purple",
    panel: "from-purple-50/80 via-white to-white border-purple-100",
    icon: HiLocationMarker,
    headline: "You clock in from client sites as well as your base office.",
    hint: "Any of the sites below, or your base office, counts without a flag. Clock in far from all of them and your manager sees it to review.",
  },
};

/** The mode pill, same shape and tone tables as the rest of attendance. */
function ModePill({ view }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[view.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[view.tone]}`} aria-hidden="true" />
      {view.pill}
    </span>
  );
}

/** A clock-in radius reads in metres — the numbers in play (50–2000) never reach a kilometre. */
const radiusText = (meters) => {
  const n = Number(meters);
  return Number.isFinite(n) && n > 0 ? `${n} m` : "N/A";
};

/** Open the site on a map the person already has. Site coords only — no personal data. */
const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export default function MyWorkLocationsPage() {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getMyFieldAssignments();
      setState({ data: res?.data || null, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { data, loading, error } = state;
  const mode = normalizeWorkMode(data?.work_mode);
  const modeView = MODE_VIEW[mode] || MODE_VIEW.office;
  const office = data?.assigned_office || null;
  // The server already returns active assignments; a site with a pin is the
  // only one a punch can match, so a pinless one is shown but marked.
  const sites = Array.isArray(data?.records) ? data.records : [];
  // Sites can be assigned before HR flips the mode to field, where they do
  // nothing yet — say so rather than imply they already apply.
  const sitesInactiveMode = sites.length > 0 && mode !== "field";
  const firstLoad = loading && !data;
  const nothingSetUp = !firstLoad && !error && !office && sites.length === 0 && mode !== "remote";

  const selectedSite = selected?.field_location || null;
  const selLat = coord(selectedSite?.latitude);
  const selLng = coord(selectedSite?.longitude);

  return (
    <>
      <DashboardTopBar title="My Work Locations" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="My Work Locations" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              The office and client sites you can clock in from. HR sets these — you can’t change them here, but this is where you check where you’re expected to be.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} className={SECONDARY_BTN}>
            <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && <ErrorState error={error} onRetry={load} fallback="Couldn’t load your work locations." />}

        {firstLoad && <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6"><LoadingRows rows={3} /></div>}

        {!firstLoad && !error && (
          <>
            {/* What the organisation expects of this person, stated once, at the
                top — the rest of the page is the detail behind it. Tinted to the
                mode's own tone so the page reads its state before a word of it. */}
            <div className={`rounded-3xl border shadow-xs px-5 sm:px-6 py-5 bg-gradient-to-br ${modeView.panel}`}>
              <div className="flex items-start gap-4 min-w-0">
                <span className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-xs ${TONE_CLASSES[modeView.tone]}`}>
                  <modeView.icon className="w-6 h-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <p className="text-sm sm:text-base font-bold text-slate-800">{modeView.headline}</p>
                    <ModePill view={modeView} />
                    <FieldHelp surface={SURFACE} field="work_mode" label="what your work mode means" size="sm" />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed max-w-2xl">{modeView.hint}</p>
                </div>
              </div>
            </div>

            {nothingSetUp ? (
              <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
                <EmptyState
                  icon={HiLocationMarker}
                  title="No work location set yet"
                  message="Your office hasn’t been set, so your clock-ins aren’t checked against a place yet. Ask HR to set your office location."
                />
              </div>
            ) : (
              <>
                {/* Your base office. Named, never mapped — the self endpoint
                    returns a name only, no pin (contract §4.4). */}
                {mode !== "remote" && (
                  <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
                    <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
                      <HiOfficeBuilding className="w-4 h-4 text-purple-600 shrink-0" />
                      <h3 className="text-base font-bold text-slate-800">Your base office</h3>
                    </div>
                    <div className="px-5 sm:px-6 py-5">
                      {office?.name ? (
                        <div className="flex items-start gap-3.5">
                          <span className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0 shadow-xs">
                            <HiOfficeBuilding className="w-5 h-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-800 truncate">{office.name}</p>
                              {mode === "field" && (
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5">
                                  Base
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {mode === "field" ? "Your base — it counts alongside your client sites." : "Where you’re expected to clock in from."}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
                          No office is set for you yet, so your clock-ins aren’t checked against a place. Ask HR to set your office location.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Client sites, for field staff. A list → row → inspector (§3). */}
                {sites.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
                    <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
                      <HiLocationMarker className="w-4 h-4 text-purple-600 shrink-0" />
                      <h3 className="text-base font-bold text-slate-800">Your client sites</h3>
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5">
                        {sites.length}
                      </span>
                    </div>

                    {sitesInactiveMode && (
                      <div className="px-5 sm:px-6 pt-4">
                        <InlineAlert tone="amber">
                          These sites are assigned to you, but they only count once HR sets your work mode to Field. Until then they don’t affect where you can clock in.
                        </InlineAlert>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm min-w-[560px]">
                        <caption className="sr-only">Your assigned client sites. Open a row for its details.</caption>
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                          <tr>
                            <th className="px-6 py-3.5">Site</th>
                            <th className="px-6 py-3.5">Client</th>
                            <th className="px-6 py-3.5">
                              <HelpLabel text="Clock-in radius" help={{ surface: SURFACE, field: "geofence_radius_meters", size: "sm", label: "the clock-in radius" }} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {sites.map((row) => {
                            const site = row.field_location || {};
                            const preview = rowPreviewProps(() => setSelected(row), "Site details");
                            return (
                              <tr key={row.id} {...preview}>
                                <td className="px-6 py-4">
                                  <span className="flex items-center gap-3 min-w-0">
                                    <span className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                      <HiLocationMarker className="w-4 h-4" />
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block font-semibold text-slate-800 truncate">{site.name || "A client site"}</span>
                                      {!hasPin(site) && <span className="block text-[11px] text-fuchsia-600 font-semibold">No map pin yet</span>}
                                    </span>
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-500">{site.client_name || "N/A"}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                                    {radiusText(site.geofence_radius_meters)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {selected && selectedSite && (
        <DetailDialog
          eyebrow="Client site"
          title={selectedSite.name || "A client site"}
          subtitle={selectedSite.client_name || ""}
          icon={HiLocationMarker}
          width="medium"
          onClose={() => setSelected(null)}
          footer={
            selLat !== null && selLng !== null ? (
              <a
                href={mapsUrl(selLat, selLng)}
                target="_blank"
                rel="noopener noreferrer"
                className={SECONDARY_BTN}
              >
                <HiExternalLink className="w-4 h-4" /> View on map
              </a>
            ) : (
              <DetailFooterNote>This site has no map pin yet, so there’s nothing to open on a map. Ask HR to add its location.</DetailFooterNote>
            )
          }
        >
          <div className="space-y-4">
            <DetailSection title="Where it is" collapsible={false}>
              <DetailGrid
                cols={2}
                items={[
                  { label: "Client", value: selectedSite.client_name || "N/A" },
                  {
                    label: "Clock-in radius",
                    value: radiusText(selectedSite.geofence_radius_meters),
                    help: { surface: SURFACE, field: "geofence_radius_meters", label: "the clock-in radius" },
                  },
                  { label: "Assigned from", value: selected.effective_from ? fmtDate(selected.effective_from) : "N/A" },
                  { label: "Assigned until", value: selected.effective_to ? fmtDate(selected.effective_to) : "No end date" },
                ]}
              />
            </DetailSection>
          </div>
        </DetailDialog>
      )}
    </>
  );
}
