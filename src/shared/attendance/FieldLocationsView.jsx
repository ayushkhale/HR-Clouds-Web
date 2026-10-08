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
// Contract: `md_attendance/7_work_mode_and_field_geofencing_api.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiLocationMarker, HiPlus, HiOfficeBuilding, HiUserGroup, HiTrash, HiPencil, HiX } from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailTable, displayValue, rowPreviewProps } from "../components/DetailDialog";
import GeofenceMapPicker from "../components/GeofenceMapPicker";
import AddressSearchField from "../components/AddressSearchField";
import { reverseGeocode } from "../utils/geocoding";
import { PersonSelect } from "../components/PersonPicker";
import FieldHelp from "../fieldHelp/FieldHelp";
import { EmptyState, ErrorState, FieldError, FilterTabs, InlineAlert, LoadingRows, Pagination, Spinner, Toast, useToast } from "./ui";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { coord, dedupeById, fieldPlane, FIELD_RADIUS_DEFAULT, FIELD_RADIUS_MAX, FIELD_RADIUS_MIN, hasPin } from "./fieldPlanes";
import { fmtDate, todayYMD, ymdOnly } from "./dates";
import { personName } from "./normalize";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";

const PAGE_SIZE = 20;

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
  const { activeRows, nameOf } = useEmployeeDirectory();
  const { toast, showToast, clearToast } = useToast();

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

  return (
    <div className="space-y-5">
      {/* No heading here on purpose. The page wrapper already carries the <h1>
          and its one-line description, which §2 requires to match the sidebar
          label and the top bar — repeating them here printed the same title
          twice. The page ⓘ lives beside that <h1>, per §10. */}
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing({ site: null, assignedCount: 0 })} className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition">
          <HiPlus className="w-4 h-4" /> Add a site
        </button>
      </div>

      <FilterTabs
        options={STATUS_TABS.map((t) => (t.value === "active" ? { ...t, label: `Active${list.total && tab === "active" ? ` (${list.total})` : ""}` } : t))}
        value={tab}
        onChange={setTab}
      />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by site, client or city"
        className="w-full sm:max-w-xs px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
      />

      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
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
          people={activeRows}
          onClose={() => setAssigning(null)}
          onSaved={(msg) => { setAssigning(null); showToast(msg); refresh(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
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
      const res = await plane.assign(payload);
      const warn = res?.data?.work_mode_warning;
      if (warn) {
        // Not an error: the assignment exists and starts working the moment HR
        // sets the mode. Shown here so it isn't lost in a toast.
        setWarning(warn);
        setSaving(false);
        return;
      }
      onSaved("Assigned to this site.");
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
