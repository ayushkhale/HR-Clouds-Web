// ─────────────────────────────────────────────────────────────────────────────
// FieldAssignmentsPanel — one person's work locations, from the HR or manager
// side: the mode their punches are judged by, the office they are based at, and
// the client sites they may clock in from. ONE component for both workspaces
// (CLAUDE.md §2); `viewer` only picks the API plane, never the layout.
//
// WHY THIS EXISTS. Client sites were only ever manageable SITE-FIRST: to take
// somebody off a site you had to know which site, open it, and expand a folded
// section. The question people actually arrive with is the other way round —
// "where is Ravi allowed to clock in, and can I stop that?" — and
// `GET /field-assignments/user/:user_id` (API 8) answers exactly that but had
// no screen at all. This is that screen, mounted both on Client Sites (the
// People view) and on the employee record's own tab.
//
// THE SERVER IS THE AUTHORITY ON THE MODE AND THE OFFICE. API 8 returns
// `work_mode` already normalized and fail-secure (a null profile reads
// `office`) and `assigned_office` as part of the valid punch area — composite
// resolution, so a field worker's base office counts alongside their sites.
// Neither is re-derived from the roster row here: the roster's `work_mode` is
// in the PROFILE vocabulary (`on-site`) and would disagree (contract §0.2).
//
// ASSIGNING RUNS THE OTHER WAY ROUND from the Client Sites dialog — the person
// is fixed and the site is chosen — but it is the same endpoint with the same
// traps: plain `YYYY-MM-DD` dates (an ISO timestamp is a 400 and at IST would
// shift the window by a day), one active assignment per (person, site) pair
// whatever the dates, and `set_work_mode_to_field` to stop the assignment
// quietly doing nothing on an `office` employee.
//
// CHANGING A WINDOW IS AN EDIT, NOT REMOVE-THEN-ADD (2026-10-18). A `PUT` on
// the assignment moves `effective_from`/`effective_to` while preserving the
// original `assigned_by` and the punch-defence history — which remove-then-add
// destroyed. "Change dates" on a row opens that edit; the uniqueness rule is
// still date-blind, so the SITE itself is fixed there (only the dates move).
//
// Contract: `md_attendance/7_work_mode_and_field_geofencing_api.md` §4.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiLocationMarker, HiOfficeBuilding, HiPlus, HiRefresh, HiExternalLink, HiCalendar,
} from "react-icons/hi";
import { DetailSection, DetailTable } from "../components/DetailDialog";
import FieldHelp from "../fieldHelp/FieldHelp";
import { EmptyState, ErrorState, FieldError, InlineAlert, LoadingRows, Spinner, Toast, useToast } from "./ui";
import { TONE_CLASSES, TONE_DOT } from "./enums";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { coord, dedupeById, fieldPlane, hasPin, workModeView } from "./fieldPlanes";
import { normalizeWorkMode } from "./geofence";
import { fmtDate, todayYMD, ymdOnly } from "./dates";
import { personName } from "./normalize";

const SURFACE = "attendance.field_assignments";

/** Enough sites for any realistic org picker; the endpoint caps `limit` at 100. */
const SITE_PAGE = 100;

/** A clock-in radius reads in metres — the band is 50–2000, never a kilometre. */
const radiusText = (meters) => {
  const n = Number(meters);
  return Number.isFinite(n) && n > 0 ? `${n} m` : "N/A";
};

/** Site coordinates only — no personal data leaves with the link. */
const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/**
 * One person's work locations.
 *
 * @param {object}            props
 * @param {string}            props.userId     whose locations these are
 * @param {string}            [props.name]     their name, for the confirmations
 * @param {"hr"|"manager"}    [props.viewer]   picks the API plane (§2)
 * @param {boolean}           [props.collapsible]  false pins the sections open
 * @param {() => void}        [props.onEditWorkplace]  HR's "change the mode or
 *   base office" action. Omitted for a manager, whose workspace has no such
 *   screen — a capability a role lacks is absent, not disabled (§2).
 */
export default function FieldAssignmentsPanel({
  userId,
  name = "",
  viewer = "hr",
  collapsible = true,
  onEditWorkplace = null,
}) {
  const plane = useMemo(() => fieldPlane(viewer), [viewer]);
  const { toast, showToast, clearToast } = useToast();

  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(null); // the assignment row whose window is being changed
  const [busyId, setBusyId] = useState("");
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!plane || !userId) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.assignmentsFor(userId);
      if (id !== reqId.current) return;
      setState({ data: res?.data || null, loading: false, error: null });
    } catch (error) {
      if (id === reqId.current) setState({ data: null, loading: false, error });
    }
  }, [plane, userId]);

  useEffect(() => { load(); }, [load]);

  const { data, loading, error } = state;
  // Fail-secure, the way the server resolves it: an unknown mode is `office`.
  const mode = normalizeWorkMode(data?.work_mode);
  const modeView = workModeView(mode);
  const office = data?.assigned_office || null;
  const sites = Array.isArray(data?.records) ? data.records : [];
  // A site assigned to someone who isn't on `field` is created and then does
  // nothing — the engine only unions client sites for a field-mode punch.
  const sitesInertMode = sites.length > 0 && mode !== "field";
  const firstLoad = loading && !data;
  const who = name || "this person";

  const unassign = async (row) => {
    const site = row.field_location?.name || "that site";
    if (!(await window.confirm(`Take ${who} off ${site}? They’ll be back to clocking in at their base office only.`))) return;
    setBusyId(row.id);
    try {
      await plane.unassign(row.id);
      // Idempotent: a repeat answers `already_inactive: true`, not an error, so
      // there is no second outcome to tell apart here (API 7).
      showToast(`${who} is no longer assigned to ${site}.`);
      load();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn’t remove this assignment."), "error");
    } finally {
      setBusyId("");
    }
  };

  if (!plane) {
    return (
      <EmptyState
        icon={HiLocationMarker}
        title="Not available here"
        message="Work locations are managed from the HR and manager workspaces."
      />
    );
  }

  return (
    <>
      <DetailSection
        title="Where they clock in"
        icon={HiLocationMarker}
        collapsible={collapsible}
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onEditWorkplace && (
              <button
                type="button"
                onClick={onEditWorkplace}
                className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 transition"
              >
                <HiOfficeBuilding className="w-3.5 h-3.5" /> Change mode or office
              </button>
            )}
            <button
              type="button"
              onClick={() => setAssigning(true)}
              disabled={firstLoad}
              className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition"
            >
              <HiPlus className="w-3.5 h-3.5" /> Assign a client site
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label="Reload work locations"
              className="p-1.5 rounded-xl text-slate-400 hover:text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition"
            >
              <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      >
        {firstLoad ? (
          <LoadingRows rows={3} />
        ) : error ? (
          <ErrorState error={error} onRetry={load} fallback="Couldn’t load their work locations." />
        ) : (
          <div className="space-y-4">
            {/* Mode and base office side by side: together they are the whole
                answer for everybody except field staff, whose sites follow. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Work mode</p>
                  <FieldHelp surface={SURFACE} field="work_mode" label="work mode" size="sm" />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[mode === "remote" ? "slate" : mode === "office" ? "blue" : "purple"]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[mode === "remote" ? "slate" : mode === "office" ? "blue" : "purple"]}`} aria-hidden="true" />
                    {modeView.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{modeView.blurb}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Base office</p>
                {mode === "remote" ? (
                  <p className="text-sm font-semibold text-slate-500 mt-1.5">Not used — they work remotely.</p>
                ) : office?.name ? (
                  <>
                    <p className="text-base font-bold text-slate-900 truncate mt-1.5" title={office.name}>{office.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {mode === "field"
                        ? "Counts alongside their client sites."
                        : "Where they’re expected to clock in from."}
                    </p>
                  </>
                ) : (
                  <p className="text-xs font-semibold text-fuchsia-700 mt-1.5 leading-relaxed">
                    No office set, so their clock-ins are checked against every branch instead. Worth setting.
                  </p>
                )}
              </div>
            </div>

            {sitesInertMode && (
              <InlineAlert tone="amber">
                {sites.length === 1 ? "This site is" : "These sites are"} assigned, but only count once their
                work mode is Field. Until then {sites.length === 1 ? "it doesn’t" : "they don’t"} affect
                where {who} can clock in.
              </InlineAlert>
            )}

            {sites.length === 0 ? (
              <EmptyState
                icon={HiLocationMarker}
                title="No client sites assigned"
                message={mode === "field"
                  ? "They’re set to Field but have no client sites yet, so only their base office counts. Assign the places they actually work."
                  : "Assign a client site when they start working somewhere outside your offices."}
                className="py-8"
              />
            ) : (
              <DetailTable
                columns={[
                  {
                    header: "Site",
                    render: (row) => {
                      const site = row.field_location || {};
                      return (
                        <span className="min-w-0 block">
                          <span className="block font-semibold text-slate-800 truncate">{site.name || "A client site"}</span>
                          {site.client_name && <span className="block text-[11px] text-slate-400">{site.client_name}</span>}
                          {/* A pinless site can never match a punch — it is the
                              configuration gap behind `geofence_unresolved`. */}
                          {!hasPin(site) && <span className="block text-[11px] font-bold text-rose-600">No map pin — can’t be checked against</span>}
                        </span>
                      );
                    },
                  },
                  {
                    header: "Radius",
                    help: { surface: SURFACE, field: "geofence_radius_meters", label: "the clock-in radius" },
                    render: (row) => radiusText(row.field_location?.geofence_radius_meters),
                  },
                  { header: "From", render: (row) => fmtDate(ymdOnly(row.effective_from)) },
                  {
                    header: "Until",
                    // Open-ended is a fact, not missing data (§5).
                    render: (row) => (row.effective_to ? fmtDate(ymdOnly(row.effective_to)) : "No end date"),
                  },
                  {
                    header: "Assigned by",
                    render: (row) => personName(row.assigner, "Unknown user"),
                  },
                  {
                    header: "",
                    align: "right",
                    render: (row) => {
                      const lat = coord(row.field_location?.latitude);
                      const lng = coord(row.field_location?.longitude);
                      return (
                        <span className="inline-flex items-center gap-3 whitespace-nowrap">
                          {lat !== null && lng !== null && (
                            <a
                              href={mapsUrl(lat, lng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-bold text-purple-700 hover:underline inline-flex items-center gap-1"
                            >
                              <HiExternalLink className="w-3.5 h-3.5" /> Map
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditing(row)}
                            disabled={busyId === row.id}
                            className="text-[11px] font-bold text-purple-700 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <HiCalendar className="w-3.5 h-3.5" /> Change dates
                          </button>
                          <button
                            type="button"
                            onClick={() => unassign(row)}
                            disabled={busyId === row.id}
                            className="text-[11px] font-bold text-rose-600 hover:underline disabled:opacity-50"
                          >
                            {busyId === row.id ? "Removing…" : "Remove"}
                          </button>
                        </span>
                      );
                    },
                  },
                ]}
                rows={sites}
                empty="No client sites assigned."
              />
            )}
          </div>
        )}
      </DetailSection>

      {assigning && (
        <AssignSiteDialog
          plane={plane}
          name={who}
          userId={userId}
          workMode={data?.work_mode}
          assignedSiteIds={sites.map((row) => row.field_location?.id).filter(Boolean)}
          onClose={() => setAssigning(false)}
          onSaved={(message) => { setAssigning(false); showToast(message); load(); }}
        />
      )}

      {editing && (
        <EditWindowDialog
          plane={plane}
          name={who}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); showToast(message); load(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

/* ─── Assign a site to THIS person ────────────────────────────────────────── */

/**
 * The mirror of Client Sites' own assign dialog: there the site is fixed and
 * the person is chosen, here the person is fixed and the site is chosen. Same
 * endpoint, same traps — so the wording, the date rules and the work-mode
 * checkbox are deliberately identical (§2).
 *
 * Sites already assigned to this person are dropped from the picker rather
 * than offered and refused: one active assignment per (person, site) pair is a
 * DATE-BLIND rule, so a second window for the same pair is a 409 however the
 * dates read.
 */
function AssignSiteDialog({ plane, name, userId, workMode, assignedSiteIds, onClose, onSaved }) {
  const [sites, setSites] = useState({ rows: [], loading: true, error: null });
  const [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState(todayYMD());
  const [to, setTo] = useState("");
  const [setFieldMode, setSetFieldMode] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saving, setSaving] = useState(false);

  const mode = normalizeWorkMode(workMode);
  const alreadyField = workMode != null && mode === "field";
  // `remote` and `hybrid` are contractual modes tied to allowances and payroll,
  // so only HR may move them. The checkbox is shown disabled rather than
  // hidden: "you can't do this here" beats a control that silently isn't there.
  const modeLockedByContract = mode === "remote" || mode === "hybrid";

  useEffect(() => {
    let cancelled = false;
    plane.list({ page: 1, limit: SITE_PAGE })
      .then((res) => {
        if (cancelled) return;
        // `records` can repeat a site once per creator profile — see dedupeById.
        const all = dedupeById(res?.data?.records);
        const taken = new Set((assignedSiteIds || []).map(String));
        setSites({ rows: all.filter((row) => row.is_active !== false && !taken.has(String(row.id))), loading: false, error: null });
      })
      .catch((err) => { if (!cancelled) setSites({ rows: [], loading: false, error: err }); });
    return () => { cancelled = true; };
    // `assignedSiteIds` is a fresh array each render; the dialog is mounted
    // against one read of the panel, so the site list is fetched once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plane]);

  // The press does the checking and nothing goes out from an unfinished form
  // (§11). `_site` is prefixed so it can never collide with a payload key.
  const problems = {
    _site: siteId ? "" : "Choose the site they’ll be working at.",
    effective_to: to && from && to < from ? "The end date can’t be before the start date." : "",
  };
  const blocking = Object.values(problems).find(Boolean) || "";

  const submit = async (e) => {
    e.preventDefault();
    setAttempted(true);
    if (saving || blocking) return;
    setError("");
    setSaving(true);
    try {
      // Plain YYYY-MM-DD, never an ISO timestamp — see the file header.
      const payload = { user_id: userId, field_location_id: siteId, effective_from: ymdOnly(from) };
      if (to) payload.effective_to = ymdOnly(to);
      // Only sent when it could do something. The flip runs in the same
      // transaction as the assignment, so the site is never assigned against a
      // half-changed mode.
      if (setFieldMode && !alreadyField && !modeLockedByContract) payload.set_work_mode_to_field = true;
      const res = await plane.assign(payload);
      const warn = res?.data?.work_mode_warning;
      if (warn) {
        // Not an error: the assignment exists and starts working the moment the
        // mode is set. Held on screen rather than lost in a toast.
        setWarning(warn);
        setSaving(false);
        return;
      }
      onSaved(res?.data?.work_mode_changed
        ? `${name} is assigned to this site, and their work mode is now Field.`
        : `${name} is assigned to this site.`);
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn’t assign this site."));
      setSaving(false);
    }
  };

  const CTL = "w-full px-3 py-2.5 border rounded-xl text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500";
  const LBL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wide";
  const invalid = (key) => (attempted && problems[key] ? "border-rose-300 bg-rose-50/40" : "border-slate-200");

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Assign a client site to ${name}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={submit} noValidate className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Assign a client site</h2>
          <p className="text-xs text-slate-500 mt-0.5">{name} will be able to clock in there without being flagged.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {warning ? (
            <>
              <InlineAlert tone="amber">{warning}</InlineAlert>
              <p className="text-xs text-slate-500">
                The assignment is saved and starts working as soon as their work mode is set to Field.
              </p>
            </>
          ) : sites.error ? (
            // A site list that wouldn't load is "couldn't load", never an empty
            // picker that reads as an organisation with no sites (§7).
            <ErrorState error={sites.error} fallback="Couldn’t load the client sites." />
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <div className="sm:col-span-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="fap-site" className={LBL}>Client site</label>
                  <FieldHelp surface={SURFACE} field="field_location_id" label="which sites you can pick" />
                </div>
                <select
                  id="fap-site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  disabled={sites.loading || saving}
                  className={`${CTL} ${invalid("_site")}`}
                >
                  <option value="">{sites.loading ? "Loading sites…" : "Choose a site"}</option>
                  {sites.rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {[row.name, row.city].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
                {!sites.loading && sites.rows.length === 0 && (
                  <p className="text-[11px] font-semibold text-slate-500 mt-1.5">
                    {assignedSiteIds?.length
                      ? "They’re already assigned to every active site. Remove one first, or add a new site under Client Sites."
                      : "No client sites have been added yet. Add one under Setup → Organisation → Client Sites."}
                  </p>
                )}
                <FieldError message={attempted ? problems._site : ""} id="fap-site-error" />
              </div>

              <div>
                <label htmlFor="fap-from" className={`${LBL} mb-1.5`}>From</label>
                <input id="fap-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={saving} className={`${CTL} ${invalid("effective_from")}`} />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="fap-to" className={LBL}>Until</label>
                  <FieldHelp surface={SURFACE} field="effective_to" label="leaving this blank" />
                </div>
                <input id="fap-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} disabled={saving} className={`${CTL} ${invalid("effective_to")}`} />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank for no end date.</p>
                <FieldError message={attempted ? problems.effective_to : ""} id="fap-to-error" />
              </div>

              {!alreadyField && (
                <div className="sm:col-span-2">
                  <label className={`flex items-start gap-2.5 rounded-xl border p-3 ${modeLockedByContract ? "border-slate-200 bg-slate-50 cursor-not-allowed" : "border-purple-100 bg-purple-50/50 cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={setFieldMode && !modeLockedByContract}
                      disabled={modeLockedByContract || saving}
                      onChange={(e) => setSetFieldMode(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-purple-600 shrink-0 disabled:opacity-50"
                    />
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${modeLockedByContract ? "text-slate-500" : "text-slate-800"}`}>
                        Also set their work mode to Field
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {modeLockedByContract
                          ? `Their work mode is ${mode === "remote" ? "Remote" : "Hybrid"}, which only HR can change. The assignment still saves, but it won’t apply until HR changes it.`
                          : "Needed for their clock-ins at this site to be recognised. Without it the assignment has no effect."}
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
          <FieldError message={error} />
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          {warning ? (
            <button type="button" onClick={() => onSaved(`${name} is assigned to this site.`)} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl">Done</button>
          ) : (
            <>
              {/* The footer note and the blocking message are ONE string (§11). */}
              {attempted && blocking && <p className="mr-auto text-[11px] font-semibold text-rose-600">{blocking}</p>}
              <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving || sites.loading} className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl">
                {saving && <Spinner />} Assign
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/* ─── Change an assignment's window ───────────────────────────────────────── */

/**
 * Move the dates of ONE existing assignment (`PUT`, 2026-10-18). The site is
 * fixed — only the window moves — so this is a two-date form and stays narrow
 * (§3). The original `assigned_by` is preserved server-side, which is the whole
 * reason this beats remove-then-add.
 *
 * §11: the button stays live and the press does the checking. `effective_from`
 * is always sent (seeded from the row); clearing "Until" sends
 * `effective_to: null` to make the window open-ended.
 */
function EditWindowDialog({ plane, name, row, onClose, onSaved }) {
  const site = row.field_location || {};
  const [from, setFrom] = useState(ymdOnly(row.effective_from) || todayYMD());
  const [to, setTo] = useState(ymdOnly(row.effective_to) || "");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const origFrom = ymdOnly(row.effective_from) || "";
  const origTo = ymdOnly(row.effective_to) || "";
  const unchanged = from === origFrom && to === origTo;

  // Keyed by the payload key, empty when the form may be sent (§11).
  const problems = {
    effective_from: from ? "" : "Give the assignment a start date.",
    effective_to: to && from && to < from ? "The end date can’t be before the start date." : "",
    _window: unchanged ? "Change the start or end date, or close this." : "",
  };
  const blocking = Object.values(problems).find(Boolean) || "";

  const submit = async (e) => {
    e.preventDefault();
    setAttempted(true);
    if (saving || blocking) return;
    setSaving(true);
    setError("");
    try {
      // Plain YYYY-MM-DD, never an ISO timestamp (the file header). An explicit
      // null clears the end date; omitting it would leave the old one in place.
      await plane.updateAssignment(row.id, {
        effective_from: ymdOnly(from),
        effective_to: to ? ymdOnly(to) : null,
      });
      onSaved(`${name}’s dates for ${site.name || "this site"} have been changed.`);
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn’t change these dates."));
      setSaving(false);
    }
  };

  const CTL = "w-full px-3 py-2.5 border rounded-xl text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500";
  const LBL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wide";
  const invalid = (key) => (attempted && problems[key] ? "border-rose-300 bg-rose-50/40" : "border-slate-200");

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Change ${name}’s dates for ${site.name || "this site"}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={submit} noValidate className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Change dates</h2>
          {/* The site is fixed; only the window moves. Saying so stops anyone
              looking for a site picker that isn't here. */}
          <p className="text-xs text-slate-500 mt-0.5">
            {name} at {site.name || "this site"}. The site stays the same — only the dates change.
          </p>
        </div>

        <div className="px-6 py-5 grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label htmlFor="few-from" className={`${LBL} mb-1.5`}>From</label>
            <input id="few-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={saving} className={`${CTL} ${invalid("effective_from")}`} />
            <FieldError message={attempted ? problems.effective_from : ""} id="few-from-error" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label htmlFor="few-to" className={LBL}>Until</label>
              <FieldHelp surface={SURFACE} field="effective_to" label="leaving this blank" />
            </div>
            <input id="few-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} disabled={saving} className={`${CTL} ${invalid("effective_to")}`} />
            <p className="text-[10px] text-slate-400 mt-1">Leave blank for no end date.</p>
            <FieldError message={attempted ? problems.effective_to : ""} id="few-to-error" />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <InlineAlert tone="rose">{error}</InlineAlert>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          {/* The footer note and the blocking message are ONE string (§11). */}
          {attempted && blocking && !error && <p className="mr-auto text-[11px] font-semibold text-rose-600">{blocking}</p>}
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl">
            {saving && <Spinner />} Save dates
          </button>
        </div>
      </form>
    </div>
  );
}
