// ─────────────────────────────────────────────────────────────────────────────
// FieldLocationsView — client sites field staff may clock in from, and who is
// assigned to each. ONE component for HR and manager (CLAUDE.md §2); `viewer`
// only picks the API plane and the assignment scope, never the layout.
//
// WHY SITES ARE ORG-WIDE: a created site is visible to every manager and HR on
// purpose, so "Tata Steel Pune" is registered once and reused rather than six
// managers each adding their own copy. That is also why anyone may CREATE one
// but only HR, or the manager who created it, may EDIT or RETIRE it — the
// server answers that per row (`can_modify` on the detail, `creator` on the
// list) and we gate on what it returned, never on our own guess (§7).
//
// COORDINATES ARE MANDATORY HERE, unlike office locations where they are
// optional: a field site exists only to be geofenced, so a site without a pin
// could never match a punch and would silently produce `geofence_unresolved`
// flags against the employee. The map is a required step, not a nicety.
//
// RETIRING CASCADES — and only DELETE does it. `is_active` is rejected on the
// update path on purpose: a site deactivated through PUT would drop out of the
// geofence pool while its assignment rows stayed active, so the UI would keep
// showing people as assigned while their punches quietly started failing.
//
// DATES GO AS `YYYY-MM-DD` STRINGS. An ISO timestamp is a 400, because at IST a
// midnight-UTC instant lands on the previous calendar day and would shift the
// window by one. Never `toISOString()` here.
//
// TWO VIEWS, ONE SCREEN (2026-10-18). "Sites" answers "where can field staff
// clock in?"; "People" answers "where is THIS person allowed to clock in, and
// can I stop that?". The second question had no screen at all: taking somebody
// off a site meant knowing which site, opening it and expanding a folded
// section, and `GET /field-assignments/user/:user_id` (API 8) was only ever
// called invisibly to read a work mode. The People view is that endpoint's
// home, and it is the same `FieldAssignmentsPanel` the employee record's own
// tab mounts — one component, two hosts, so the two can't drift.
//
// Contract: `md_attendance/7_work_mode_and_field_geofencing_api.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiLocationMarker, HiPlus, HiOfficeBuilding, HiUserGroup, HiTrash, HiPencil, HiX, HiUser, HiSearch } from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailTable, displayValue, rowPreviewProps } from "../components/DetailDialog";
import GeofenceMapPicker from "../components/GeofenceMapPicker";
import AddressSearchField from "../components/AddressSearchField";
import { reverseGeocode } from "../utils/geocoding";
import { normalizeWorkMode } from "./geofence";
import { PersonSelect } from "../components/PersonPicker";
import FieldHelp from "../fieldHelp/FieldHelp";
import { EmptyState, ErrorState, FieldError, FilterTabs, InlineAlert, LoadingRows, Pagination, Spinner, Toast, useToast } from "./ui";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { coord, dedupeById, fieldPlane, FIELD_RADIUS_DEFAULT, FIELD_RADIUS_MAX, FIELD_RADIUS_MIN, hasPin } from "./fieldPlanes";
import FieldAssignmentsPanel from "./FieldAssignmentsPanel";
import { fmtDate, todayYMD, ymdOnly } from "./dates";
import { personName } from "./normalize";
import { useAuth } from "../contexts/AuthContext";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";

const PAGE_SIZE = 20;
/** The flat assignment roster is an overview, not a paged list — take the lot (the endpoint caps at 100). */
const SITE_PAGE = 100;

/** The two questions this screen answers. Sites first — a site must exist before anyone can be put on one. */
const VIEW_TABS = [
  { value: "sites", label: "Sites", icon: HiOfficeBuilding },
  { value: "people", label: "People", icon: HiUserGroup },
];

const BROWSER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"; }
  catch { return "Asia/Kolkata"; }
})();

/**
 * Every IANA zone the browser knows, so the field is a real choice rather than
 * free text somebody can misspell into a zone the server won't recognise.
 * `supportedValuesOf` is absent on older engines — the fallback keeps the
 * handful this organisation realistically uses plus whatever the browser is on.
 */
const TIMEZONES = (() => {
  try {
    const all = Intl.supportedValuesOf?.("timeZone");
    if (Array.isArray(all) && all.length) return all;
  } catch { /* fall through */ }
  return [...new Set([BROWSER_TZ, "Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"])];
})();

const BLANK = {
  name: "", client_name: "", latitude: "", longitude: "",
  geofence_radius_meters: FIELD_RADIUS_DEFAULT,
  address: "", city: "", state: "", country: "India", pincode: "", timezone: BROWSER_TZ,
};

const STATUS_TABS = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
];

/** Only the keys the server accepts; everything else is stripped anyway. */
function sitePayload(form) {
  const body = {
    name: form.name.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    geofence_radius_meters: Number(form.geofence_radius_meters) || FIELD_RADIUS_DEFAULT,
  };
  ["client_name", "address", "city", "state", "country", "pincode", "timezone"].forEach((k) => {
    const v = String(form[k] ?? "").trim();
    if (v) body[k] = v;
  });
  return body;
}

export default function FieldLocationsView({ viewer = "hr" }) {
  const plane = useMemo(() => fieldPlane(viewer), [viewer]);
  // Leavers are a filter, never a second read — and nobody should be assigned to
  // a client site after they've left (CLAUDE.md §7).
  const { activeRows, activeOptions, nameOf, status: rosterStatus } = useEmployeeDirectory();
  const { user } = useAuth();
  const { toast, showToast, clearToast } = useToast();

  // A manager may NOT assign a site to themselves — the hierarchy resolver
  // never returns the caller's own id, so offering themselves would only buy a
  // 403 with a very specific message (contract §6.1). HR may assign anyone,
  // themselves included.
  const assignableRows = useMemo(
    () => (plane?.canAssignSelf ? activeRows : activeRows.filter((row) => String(row.user_id ?? row.id) !== String(user?.id ?? ""))),
    [activeRows, plane, user?.id],
  );
  const assignablePeople = useMemo(
    () => (plane?.canAssignSelf ? activeOptions : activeOptions.filter((person) => String(person.id) !== String(user?.id ?? ""))),
    [activeOptions, plane, user?.id],
  );

  const [view, setView] = useState("sites");
  const [person, setPerson] = useState("");
  const [list, setList] = useState({ rows: [], total: 0, totalPages: 1, loading: true, error: null });
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const reqId = useRef(0);

  const [selected, setSelected] = useState(null);   // detail dialog
  const [editing, setEditing] = useState(null);     // form dialog: {} = create
  const [assigning, setAssigning] = useState(null); // assign dialog: the site

  const load = useCallback(async () => {
    if (!plane) return;
    const id = ++reqId.current;
    setList((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.list({ page, limit: PAGE_SIZE, search: search.trim() || undefined, include_inactive: tab === "all" || undefined });
      if (id !== reqId.current) return;
      const d = res?.data || {};
      // `records` can carry the same site twice — see dedupeById. The counts
      // come from `total`/`totalPages`, which are computed separately and are
      // already correct, so they are NOT derived from the array length.
      setList({
        rows: dedupeById(d.records),
        total: Number(d.total) || 0,
        totalPages: Number(d.totalPages) || 1,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (id === reqId.current) setList({ rows: [], total: 0, totalPages: 1, loading: false, error });
    }
  }, [plane, page, tab, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, search]);

  if (!plane) {
    return <EmptyState icon={HiLocationMarker} title="Not available here" message="Client sites are managed from the HR and manager workspaces." />;
  }

  const refresh = () => load();

  const selectedName = person ? nameOf(person, "Loading…") : "";

  return (
    <div className="space-y-5">
      {/* No heading here on purpose. The page wrapper already carries the <h1>
          and its one-line description, which §2 requires to match the sidebar
          label and the top bar — repeating them here printed the same title
          twice. The page ⓘ lives beside that <h1>, per §10. */}
      {/* ── Top-level view tabs: Sites and People (matches RegisteredDevicesPage) ── */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-1 -mb-px" role="tablist" aria-label="Client sites view">
          {VIEW_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
                view === value
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {Icon && <Icon className="w-4 h-4" />} {label}
            </button>
          ))}
        </div>
        {view === "sites" && (
          <button
            type="button"
            onClick={() => setEditing({ site: null, assignedCount: 0 })}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition mb-1"
          >
            <HiPlus className="w-4 h-4" /> Add a site
          </button>
        )}
      </div>

      {view === "people" ? (
        <PeopleView
          plane={plane}
          viewer={viewer}
          people={assignablePeople}
          rosterStatus={rosterStatus}
          nameOf={nameOf}
          value={person}
          onChange={setPerson}
          name={selectedName}
        />
      ) : (
        <>
          {/* ONE card and ONE toolbar row: status tabs left, search right (matches RegisteredDevicesPage) */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-2xs">
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
              <FilterTabs
                options={STATUS_TABS.map((t) => (t.value === "active" ? { ...t, label: `Active${list.total && tab === "active" ? ` (${list.total})` : ""}` } : t))}
                value={tab}
                onChange={setTab}
              />
              <div className="relative w-full sm:w-64">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search site, client, city..."
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 transition"
                />
              </div>
            </div>
        {list.error ? (
          <div className="p-6"><ErrorState error={list.error} onRetry={refresh} fallback="Couldn't load client sites." /></div>
        ) : list.loading ? (
          <div className="p-6"><LoadingRows rows={5} /></div>
        ) : list.rows.length === 0 ? (
          <EmptyState
            icon={HiLocationMarker}
            title="No client sites yet"
            message="Add the places your field staff work from, so their clock-ins are recognised instead of flagged."
            action={<button type="button" onClick={() => setEditing({ site: null, assignedCount: 0 })} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl">Add a site</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Site</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3">How close they must be</th>
                  <th className="px-5 py-3">People</th>
                  <th className="px-5 py-3">Added by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {list.rows.map((row) => (
                  <tr key={row.id} {...rowPreviewProps(() => setSelected(row), "Site details")}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800 truncate">{row.name}</p>
                      {!hasPin(row) && <p className="text-[10px] font-bold text-rose-600 mt-0.5">No map pin — can’t be checked against</p>}
                    </td>
                    <td className="px-5 py-3.5">{displayValue(row.client_name)}</td>
                    <td className="px-5 py-3.5">{displayValue(row.city)}</td>
                    <td className="px-5 py-3.5 tabular-nums">{row.geofence_radius_meters ? `${row.geofence_radius_meters} m` : "N/A"}</td>
                    {/* `assigned_user_count` arrives on every list row (2026-10-18).
                        Zero is a real answer — "nobody yet" — not missing data,
                        so it reads as 0, never N/A. */}
                    <td className="px-5 py-3.5 tabular-nums">
                      {Number.isFinite(Number(row.assigned_user_count))
                        ? <span className={Number(row.assigned_user_count) > 0 ? "font-semibold text-slate-800" : "text-slate-400"}>{Number(row.assigned_user_count)}</span>
                        : "N/A"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{personName(row.creator, "Unknown user")}</span>
                        {row.is_active === false && <DetailPill tone="soft">Retired</DetailPill>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {list.totalPages > 1 && (
        <Pagination page={page} totalPages={list.totalPages} total={list.total} limit={PAGE_SIZE} onPageChange={setPage} noun="site" />
      )}
        </>
      )}

      {selected && (
        <SiteDetailDialog
          plane={plane}
          site={selected}
          nameOf={nameOf}
          onClose={() => setSelected(null)}
          onEdit={(full, count) => { setSelected(null); setEditing({ site: full, assignedCount: count }); }}
          onAssign={(full) => { setSelected(null); setAssigning(full); }}
          onChanged={() => { setSelected(null); refresh(); }}
          showToast={showToast}
        />
      )}

      {editing && (
        <SiteFormDialog
          plane={plane}
          site={editing.site}
          assignedCount={editing.assignedCount}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); showToast(msg); refresh(); }}
        />
      )}

      {assigning && (
        <AssignDialog
          plane={plane}
          site={assigning}
          people={assignableRows}
          onClose={() => setAssigning(null)}
          onSaved={(msg) => { setAssigning(null); showToast(msg); refresh(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

/* ─── People view: one person's work locations ─────────────────────────────── */

/**
 * The other way round from the Sites table: pick somebody and see — and change
 * — where they may clock in. This is the only place `GET
 * /field-assignments/user/:user_id` (API 8) is actually shown, and the only
 * employee-first route to unassigning (API 7) and to moving a window (the PUT).
 *
 * It opens on the flat "who is assigned where" read (`GET /field-assignments`,
 * 2026-10-18) rather than an empty picker: the question is usually "who is on a
 * site" before it is "this specific person", and a bare picker made you already
 * know the answer. A row there drills into that person's full panel.
 *
 * The roster is already hierarchy-scoped server-side, so a manager's people ARE
 * their direct reports — exactly the set the assign endpoint accepts, and the
 * same set the flat list returns. Self is excluded for a manager by the caller
 * (contract §6.1).
 */
function PeopleView({ plane, viewer, people, rosterStatus, nameOf, value, onChange, name }) {
  // A roster this role may not read is "not available", never an empty list
  // that would read as an organisation with nobody in it (CLAUDE.md §7).
  if (rosterStatus === "unavailable") {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
        <EmptyState icon={HiUser} title="The list of people isn’t available here" message="Open a person from their employee record instead." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-slate-100 p-5">
        <div className="flex items-center gap-1.5 mb-2">
          <label htmlFor="fl-person" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Whose locations</label>
          <FieldHelp surface="attendance.field_assignments" field="user_id" label="who you can pick" />
        </div>
        <div className="max-w-md">
          <PersonSelect
            id="fl-person"
            value={value}
            onChange={(id) => onChange(id)}
            people={people}
            loading={rosterStatus === "loading"}
            placeholder="Choose someone"
            emptyText={viewer === "manager" ? "Nobody reports to you yet." : "No people found."}
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          {viewer === "manager"
            ? "You can see and change the work locations of the people who report to you."
            : "You can see and change anyone’s work locations."}
        </p>
      </div>

      {value ? (
        <>
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:underline"
          >
            ← Everyone on a client site
          </button>
          <FieldAssignmentsPanel key={value} userId={value} name={name} viewer={viewer} collapsible={false} />
        </>
      ) : (
        <AssignedRoster plane={plane} viewer={viewer} nameOf={nameOf} onPick={onChange} />
      )}
    </div>
  );
}

/* ─── Everyone currently on a client site ─────────────────────────────────── */

/**
 * The flat `GET /field-assignments` read as a scannable list: who is on which
 * site, and until when. A row opens that person's full panel — list → row →
 * record (§3), where the "record" is `FieldAssignmentsPanel`. Active only: a
 * removed assignment is not an answer to "where can people clock in now".
 */
function AssignedRoster({ plane, viewer, nameOf, onPick }) {
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    plane.listAssignments({ is_active: true, page: 1, limit: SITE_PAGE })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        setState({ rows: Array.isArray(d.records) ? d.records : [], total: Number(d.total) || 0, loading: false, error: null });
      })
      .catch((error) => { if (!cancelled) setState({ rows: [], total: 0, loading: false, error }); });
    return () => { cancelled = true; };
  }, [plane]);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
      {state.error ? (
        <div className="p-6"><ErrorState error={state.error} fallback="Couldn't load who is assigned." /></div>
      ) : state.loading ? (
        <div className="p-6"><LoadingRows rows={4} /></div>
      ) : state.rows.length === 0 ? (
        <EmptyState
          icon={HiUser}
          title="Nobody is on a client site yet"
          message={viewer === "manager"
            ? "When you assign someone who reports to you to a site, they appear here. Pick a person above to start."
            : "When you assign someone to a client site, they appear here. Pick a person above to start."}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Person</th>
                  <th className="px-5 py-3">Client site</th>
                  <th className="px-5 py-3">From</th>
                  <th className="px-5 py-3">Until</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {state.rows.map((a) => {
                  // An unresolved name reads "Loading…", never an id (§4).
                  const who = personName(a.user, "") || nameOf?.(a.user_id, "Loading…") || "Loading…";
                  return (
                    <tr key={a.id} {...rowPreviewProps(() => onPick(String(a.user_id)), `${who}’s work locations`)}>
                      <td className="px-5 py-3.5 font-semibold text-slate-800">{who}</td>
                      <td className="px-5 py-3.5">
                        <span className="block truncate">{a.field_location?.name || "A client site"}</span>
                        {a.field_location?.city && <span className="block text-[10px] text-slate-400">{a.field_location.city}</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">{fmtDate(ymdOnly(a.effective_from))}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">{a.effective_to ? fmtDate(ymdOnly(a.effective_to)) : "No end date"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {state.total > state.rows.length && (
            <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100">
              Showing the first {state.rows.length} of {state.total}. Pick a person above to go straight to someone further down.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Detail: the site, and who is assigned to it ─────────────────────────── */

function SiteDetailDialog({ plane, site, nameOf, onClose, onEdit, onAssign, onChanged, showToast }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    plane.get(site.id)
      .then((res) => { if (!cancelled) setState({ data: res?.data || null, loading: false, error: null }); })
      .catch((error) => { if (!cancelled) setState({ data: null, loading: false, error }); });
    return () => { cancelled = true; };
  }, [plane, site.id]);

  const d = state.data;
  const loc = d?.location || site;
  // The server is the authority on who may change this row.
  const canModify = d?.can_modify === true;
  const retired = loc.is_active === false;

  // `assigned_user_count` is returned even when `assignments` is withheld, and
  // it names nobody — so the confirmation can state the real cost of retiring.
  const assignedCount = Number(d?.assigned_user_count) || 0;

  const retire = async () => {
    const willUnassign = assignedCount === 1 ? "1 person will be unassigned" : `${assignedCount} people will be unassigned`;
    const consequence = assignedCount > 0
      ? `${willUnassign}, and they'll fall back to clocking in at their office only.`
      : "It will stop counting as a valid place to clock in.";
    if (!(await window.confirm(`Retire ${loc.name}? ${consequence}`))) return;
    setBusy(true);
    try {
      const res = await plane.retire(site.id);
      // The server reports what it actually deactivated; a repeat call is a
      // success with 0, not an error (API 5 is idempotent).
      const freed = Number(res?.data?.assignments_deactivated) || 0;
      showToast(freed > 0
        ? `${loc.name} retired — ${freed === 1 ? "1 person" : `${freed} people`} unassigned.`
        : `${loc.name} retired.`);
      onChanged();
    } catch (error) {
      showToast(attendanceErrorMessage(error, "Couldn't retire this site."), "error");
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (a) => {
    const who = personName(a.user, "") || nameOf?.(a.user_id) || "this person";
    if (!(await window.confirm(`Remove ${who} from ${loc.name}? They'll fall back to clocking in at their office only.`))) return;
    setBusy(true);
    try {
      await plane.unassign(a.id);
      // Idempotent: a repeat returns `already_inactive: true`, not an error, so
      // there is no failure case to distinguish here (API 7).
      showToast(`${who} removed from ${loc.name}.`);
      onChanged();
    } catch (error) {
      showToast(attendanceErrorMessage(error, "Couldn't remove this assignment."), "error");
    } finally {
      setBusy(false);
    }
  };

  // `assignments` is NULL — not empty — when the caller may not see names. An
  // empty array would mean "nobody assigned", so the two must not collapse:
  // saying "nobody is assigned" to a manager who simply isn't allowed the list
  // would be a plain falsehood (CLAUDE.md §7).
  const assignments = Array.isArray(d?.assignments) ? d.assignments : null;

  return (
    <DetailDialog
      eyebrow="Client site"
      icon={HiLocationMarker}
      title={loc.name}
      subtitle={loc.client_name || undefined}
      badge={loc.is_active === false ? <DetailPill tone="soft">Retired</DetailPill> : undefined}
      loading={state.loading}
      onClose={onClose}
      footer={!canModify ? (
        <DetailFooterNote>Only HR, or whoever added this site, can change it.</DetailFooterNote>
      ) : retired ? (
        // A retired site rejects both editing and assigning, and can't be
        // brought back — the name is freed, so a new site is the way. Showing
        // either control would only produce a 400 (API 4).
        <DetailFooterNote>This site is retired, so it can’t be edited or assigned to. Add it again as a new site if you need it back.</DetailFooterNote>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onEdit(loc, assignedCount)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50">
            <HiPencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button type="button" onClick={() => onAssign(loc)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl">
            <HiUserGroup className="w-3.5 h-3.5" /> Assign someone
          </button>
          <button type="button" onClick={retire} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-rose-600 font-bold text-xs rounded-xl hover:bg-rose-50 ml-auto">
            {busy ? <Spinner /> : <HiTrash className="w-3.5 h-3.5" />} Retire
          </button>
        </div>
      )}
    >
      {state.error ? (
        <ErrorState error={state.error} fallback="Couldn't load this site." />
      ) : (
        <>
          {!hasPin(loc) && (
            <InlineAlert tone="rose">
              This site has no map pin, so nobody’s clock-in can be matched to it. Add one by editing the site.
            </InlineAlert>
          )}

          <DetailSection title="Where it is" icon={HiOfficeBuilding}>
            <DetailGrid
              cols={3}
              items={[
                { label: "Client", value: displayValue(loc.client_name) },
                { label: "City", value: displayValue(loc.city) },
                { label: "State", value: displayValue(loc.state) },
                { label: "Address", value: displayValue(loc.address) },
                { label: "Pincode", value: displayValue(loc.pincode) },
                {
                  label: "How close they must be",
                  value: loc.geofence_radius_meters ? `${loc.geofence_radius_meters} m` : "N/A",
                  help: { surface: "attendance.field_locations", field: "geofence_radius_meters" },
                },
              ]}
            />
          </DetailSection>

          <DetailSection
            title={`Assigned to this site · ${assignedCount}`}
            icon={HiUserGroup}
            defaultOpen={assignedCount > 0}
          >
            {assignments ? (
              <DetailTable
                columns={[
                  {
                    header: "Person",
                    // An unresolved name reads "Loading…", never an id (§4).
                    render: (a) => personName(a.user, "") || nameOf?.(a.user_id) || "Loading…",
                  },
                  { header: "From", render: (a) => fmtDate(ymdOnly(a.effective_from)) },
                  {
                    header: "Until",
                    // An open-ended assignment has no end date — a fact, not
                    // missing data, so it says so rather than reading "N/A".
                    render: (a) => (a.effective_to ? fmtDate(ymdOnly(a.effective_to)) : "No end date"),
                  },
                  {
                    header: "",
                    align: "right",
                    render: (a) => (
                      <button
                        type="button"
                        onClick={() => unassign(a)}
                        disabled={busy}
                        className="text-[11px] font-bold text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    ),
                  },
                ]}
                rows={assignments}
                empty="Nobody is assigned to this site yet."
              />
            ) : (
              <p className="text-xs text-slate-500">
                {assignedCount === 0
                  ? "Nobody is assigned to this site yet."
                  : `${assignedCount === 1 ? "1 person is" : `${assignedCount} people are`} assigned to this site. Only HR, or whoever added it, can see who.`}
              </p>
            )}
          </DetailSection>
        </>
      )}
    </DetailDialog>
  );
}

/* ─── Create / edit ───────────────────────────────────────────────────────── */

function SiteFormDialog({ plane, site, assignedCount = 0, onClose, onSaved }) {
  const isEdit = !!site?.id;
  // Seeded key by key, NOT by spreading the row over BLANK. The API returns
  // `address: null`, `city: null` and so on for a site that has none, and a
  // spread overwrites the "" default with that null — which hands React
  // `value={null}`, turning a controlled input into an uncontrolled one. It
  // also keeps the row's own id/org_id/created_by out of the form entirely.
  const [form, setForm] = useState(() => {
    if (!site) return BLANK;
    const seeded = { ...BLANK };
    Object.keys(BLANK).forEach((k) => {
      if (site[k] !== null && site[k] !== undefined) seeded[k] = site[k];
    });
    seeded.latitude = coord(site.latitude) ?? "";
    seeded.longitude = coord(site.longitude) ?? "";
    seeded.geofence_radius_meters = site.geofence_radius_meters || FIELD_RADIUS_DEFAULT;
    return seeded;
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  /**
   * Moving the pin rewrites the address from the new coordinate — the same way
   * the office-location screen behaves, so the two forms don't disagree.
   *
   * It deliberately OVERWRITES rather than filling only blanks: an earlier
   * version preserved whatever was typed, which meant dragging the pin across
   * town left the old address sitting under a pin that no longer matched it.
   * A stale address on a geofence anchor is worse than a lost edit, and the
   * fields stay editable afterwards.
   */
  const onPinMoved = async ({ latitude, longitude }) => {
    setForm((f) => ({ ...f, latitude, longitude }));
    const place = await reverseGeocode(latitude, longitude);
    if (!place) return; // offline or rate-limited: the pin still moved
    setForm((f) => ({
      ...f,
      latitude,
      longitude,
      address: place.address || f.address,
      city: place.city || f.city,
      state: place.state || f.state,
      country: place.country || f.country,
      pincode: place.pincode || f.pincode,
    }));
  };
  const lat = coord(form.latitude);
  const lng = coord(form.longitude);
  const radius = Number(form.geofence_radius_meters) || FIELD_RADIUS_DEFAULT;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.name.trim().length < 2) return setError("Give the site a name of at least 2 characters.");
    if (lat === null || lng === null) return setError("Drop a pin on the map. A site with no pin can’t be checked against.");
    if (radius < FIELD_RADIUS_MIN || radius > FIELD_RADIUS_MAX) {
      return setError(`How close they must be has to be between ${FIELD_RADIUS_MIN} and ${FIELD_RADIUS_MAX} metres.`);
    }
    // The site is shared org-wide, so moving the pin or changing the radius
    // changes where EVERY assigned person has to stand to clock in. Confirm it
    // with the number of people affected before saving (API 4 §6).
    if (isEdit && assignedCount > 0) {
      const movedPin = coord(site.latitude) !== lat || coord(site.longitude) !== lng;
      const movedRadius = Number(site.geofence_radius_meters) !== radius;
      if (movedPin || movedRadius) {
        const who = assignedCount === 1 ? "1 person" : `${assignedCount} people`;
        const what = movedPin && movedRadius ? "the pin and the distance allowed"
          : movedPin ? "the pin" : "the distance allowed";
        if (!(await window.confirm(`You're changing ${what} for this site. ${who} assigned here will have to clock in from the new area. Save anyway?`))) return;
      }
    }

    setError("");
    setSaving(true);
    try {
      const body = sitePayload({ ...form, latitude: lat, longitude: lng });
      if (isEdit) {
        // `is_active` is deliberately never sent — retiring has to cascade, and
        // only DELETE does that (see the header).
        await plane.update(site.id, body);
        onSaved(`${body.name} updated.`);
      } else {
        await plane.create(body);
        onSaved(`${body.name} added.`);
      }
    } catch (err) {
      setError(attendanceErrorMessage(err, isEdit ? "Couldn't update this site." : "Couldn't add this site."));
    } finally {
      setSaving(false);
    }
  };

  // Laid out exactly like the office-location dialog (AttendanceLocationsPage):
  // map and its search on the left, the fields stacked on the right, the same
  // widths, paddings, label weights and footer. The two screens register the
  // same kind of thing, so someone who has added an office should not have to
  // relearn anything to add a client site.
  const FIELD_CLS = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-xs";
  const MONO_CLS = `${FIELD_CLS} font-mono`;
  const LBL_CLS = "block text-xs font-semibold text-slate-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[140] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit client site" : "Add a client site"}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{isEdit ? "Edit Client Site" : "Add New Client Site"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto">

          {/* Left: map preview + address search */}
          <div className="flex-1 p-4 sm:p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 min-h-[250px] sm:min-h-[400px]">
            <label className="block text-sm font-bold text-slate-800 mb-3">
              Map Preview <span className="text-slate-400 font-normal">(search or drag pin to set location)</span>
            </label>
            <AddressSearchField
              id="fl-place"
              label={null}
              hint={false}
              placeholder="Search for a city, landmark, or address..."
              onSelect={(place) => setForm((f) => ({ ...f, ...place }))}
            />
            <GeofenceMapPicker fill latitude={lat} longitude={lng} radius={radius} onChange={onPinMoved} className="mt-4" />
          </div>

          {/* Right: the fields */}
          <div className="w-full lg:w-[380px] shrink-0 p-4 sm:p-6 space-y-4">
            <div>
              <label htmlFor="fl-name" className={LBL_CLS}>Site Name *</label>
              <input id="fl-name" type="text" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={150} placeholder="e.g. Tata Steel Pune Plant" className={FIELD_CLS} />
            </div>

            <div>
              <label htmlFor="fl-client" className={LBL_CLS}>Client</label>
              <input id="fl-client" type="text" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} maxLength={150} placeholder="e.g. Tata Steel Ltd" className={FIELD_CLS} />
            </div>

            <div>
              <label htmlFor="fl-address" className={LBL_CLS}>Address</label>
              <input id="fl-address" type="text" value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={1000} placeholder="Plot 14, MIDC Industrial Area" className={FIELD_CLS} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fl-lat" className={LBL_CLS}>Latitude *</label>
                <input id="fl-lat" type="text" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="18.52043" className={MONO_CLS} />
              </div>
              <div>
                <label htmlFor="fl-lng" className={LBL_CLS}>Longitude *</label>
                <input id="fl-lng" type="text" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="73.856743" className={MONO_CLS} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fl-city" className={LBL_CLS}>City</label>
                <input id="fl-city" type="text" value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={100} placeholder="Pune" className={FIELD_CLS} />
              </div>
              <div>
                <label htmlFor="fl-state" className={LBL_CLS}>State</label>
                <input id="fl-state" type="text" value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={100} placeholder="Maharashtra" className={FIELD_CLS} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fl-country" className={LBL_CLS}>Country</label>
                <input id="fl-country" type="text" value={form.country} onChange={(e) => set("country", e.target.value)} maxLength={100} placeholder="India" className={FIELD_CLS} />
              </div>
              <div>
                <label htmlFor="fl-pincode" className={LBL_CLS}>Pincode</label>
                <input id="fl-pincode" type="text" value={form.pincode} onChange={(e) => set("pincode", e.target.value)} maxLength={20} placeholder="411019" className={FIELD_CLS} />
              </div>
            </div>

            <div>
              <label htmlFor="fl-timezone" className={LBL_CLS}>Timezone</label>
              <select id="fl-timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={MONO_CLS}>
                {!TIMEZONES.includes(form.timezone) && form.timezone && <option value={form.timezone}>{form.timezone}</option>}
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">IANA zone stored against this site.</p>
            </div>

            <div>
              <div className="flex items-center">
                <label htmlFor="fl-radius" className={LBL_CLS}>
                  Radius: <span className="text-purple-600 font-bold">{radius}m</span>
                </label>
                <FieldHelp surface="attendance.field_locations" field="geofence_radius_meters" label="the clock-in radius" className="mb-1.5" />
              </div>
              {/* 50–2000 m, wider than an office's 25–1000: client sites are
                  plants and basements where GPS drifts 50–150 m, and the band
                  mirrors the database CHECK so a saved value can never fail. */}
              <input
                id="fl-radius"
                type="range"
                min={FIELD_RADIUS_MIN}
                max={FIELD_RADIUS_MAX}
                step={25}
                value={radius}
                onChange={(e) => set("geofence_radius_meters", parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 shadow-inner"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                <span>{FIELD_RADIUS_MIN}m</span><span>1000m</span><span>{FIELD_RADIUS_MAX}m</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 p-6 border-t border-slate-100 shrink-0 bg-white">
          {error && (
            <div className="mr-auto text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || !form.name || lat === null || lng === null} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/20 transition-all active:scale-95">
            {saving ? "Saving…" : isEdit ? "Update Site" : "Create Site"}
          </button>
        </div>
      </form>
    </div>
  );
}
/* ─── Assign someone to a site ────────────────────────────────────────────── */

function AssignDialog({ plane, site, people, onClose, onSaved }) {
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(todayYMD());
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [saving, setSaving] = useState(false);
  const [setFieldMode, setSetFieldMode] = useState(true);
  // The assignee's contractual mode, read when they are picked. A client site
  // only geofences a `field` employee, so without this the assignment can be
  // created and quietly do nothing (contract §3.2).
  const [assignee, setAssignee] = useState({ loading: false, workMode: null });

  useEffect(() => {
    if (!userId) { setAssignee({ loading: false, workMode: null }); return undefined; }
    let cancelled = false;
    setAssignee({ loading: true, workMode: null });
    plane.assignmentsFor(userId)
      .then((res) => { if (!cancelled) setAssignee({ loading: false, workMode: res?.data?.work_mode || null }); })
      // Unknown mode: offer the checkbox anyway. The backend refuses a
      // remote/hybrid flip on its own and answers with a warning, so guessing
      // wrong here is safe (§3.5).
      .catch(() => { if (!cancelled) setAssignee({ loading: false, workMode: null }); });
    return () => { cancelled = true; };
  }, [userId, plane]);

  const mode = normalizeWorkMode(assignee.workMode);
  const alreadyField = assignee.workMode != null && mode === "field";
  // `remote`/`hybrid` are contractual modes tied to allowances and payroll, so
  // only HR may move them — the checkbox is shown disabled rather than hidden,
  // because "you can't do this here" is more useful than a missing control.
  const modeLockedByContract = mode === "remote" || mode === "hybrid";

  const submit = async (e) => {
    e.preventDefault();
    if (!userId) return setError("Choose who you’re assigning.");
    if (to && from && to < from) return setError("The end date can’t be before the start date.");
    setError("");
    setSaving(true);
    try {
      // Plain YYYY-MM-DD, never an ISO timestamp — see the header.
      const payload = { user_id: userId, field_location_id: site.id, effective_from: ymdOnly(from) };
      if (to) payload.effective_to = ymdOnly(to);
      // Only sent when it could actually do something. The flip happens in the
      // same transaction as the assignment, so there is never a moment where
      // the site is assigned but the mode is half-changed.
      if (setFieldMode && !alreadyField && !modeLockedByContract) payload.set_work_mode_to_field = true;
      const res = await plane.assign(payload);
      const warn = res?.data?.work_mode_warning;
      if (warn) {
        // Not an error: the assignment exists and starts working the moment HR
        // sets the mode. Shown here so it isn't lost in a toast.
        setWarning(warn);
        setSaving(false);
        return;
      }
      // `work_mode_changed` is true only when the backend actually flipped it
      // on this call, so the confirmation says what really happened (§3.3).
      onSaved(res?.data?.work_mode_changed
        ? "Assigned to this site, and their work mode is now Field."
        : "Assigned to this site.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't assign this person."));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Assign to site">
      <form onSubmit={submit} className="bg-white w-full max-w-3xl rounded-3xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Assign to {site.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">They’ll be able to clock in here without being flagged.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {warning ? (
            <>
              <InlineAlert tone="amber">{warning}</InlineAlert>
              <p className="text-xs text-slate-500">The assignment has been saved and starts working as soon as their work mode is set to field.</p>
            </>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <div className="sm:col-span-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="fa-user" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Who</label>
                  <FieldHelp surface="attendance.field_assignments" field="user_id" label="who you can assign" />
                </div>
                <PersonSelect id="fa-user" value={userId} onChange={(id) => setUserId(id)} people={people} placeholder="Choose someone" />
              </div>
              <div>
                <label htmlFor="fa-from" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">From</label>
                <input id="fa-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="fa-to" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Until</label>
                  <FieldHelp surface="attendance.field_assignments" field="effective_to" label="leaving this blank" />
                </div>
                <input id="fa-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500" />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank for no end date.</p>
              </div>

              {/* A client site only geofences a FIELD employee, so without this
                  the assignment is created and quietly does nothing. Hidden
                  when they are already field (nothing to do) and disabled for
                  remote/hybrid, which only HR may move (contract §3.4). */}
              {userId && !assignee.loading && !alreadyField && (
                <div className="sm:col-span-2">
                  <label className={`flex items-start gap-2.5 rounded-xl border p-3 ${modeLockedByContract ? "border-slate-200 bg-slate-50 cursor-not-allowed" : "border-purple-100 bg-purple-50/50 cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={setFieldMode && !modeLockedByContract}
                      disabled={modeLockedByContract}
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
            <button type="button" onClick={() => onSaved("Assigned to this site.")} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl">
                {saving && <Spinner />} Assign
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
