// ─────────────────────────────────────────────────────────────────────────────
// DepartmentDetailPage — one department, the way the employee profile shows one
// person. There is no GET /departments/:id, so the page composes what the API
// does offer:
//   · the department itself        → GET /organizations/departments        (#16)
//   · its people                   → the cached org roster, filtered by id  (#8)
//   · today's attendance           → GET /attendance/hr/dashboard/department-summary (#61)
//     (that payload is keyed by department NAME, not id — matched on name)
//   · its office                   → GET /organizations/locations
// Anything a source doesn't answer reads N/A rather than a made-up zero.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  HiArrowLeft, HiCalendar, HiCheckCircle, HiClock, HiExclamationCircle, HiGlobeAlt, HiLocationMarker,
  HiOutlineOfficeBuilding, HiPencil, HiRefresh, HiSearch, HiUser, HiUserGroup, HiUsers,
} from "react-icons/hi";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI, organizationAPI } from "../../../shared/api";
import { fetchAllOrgEmployees } from "../../../shared/utils/orgEmployees";
import { ErrorState, PersonCell } from "../../../shared/attendance/ui";
import { fmtDate, todayYMD } from "../../../shared/attendance/dates";
import { humanize } from "../../../shared/attendance/enums";
import { roleLabel } from "../../../shared/auth/permissions";
import { personName } from "../../../shared/attendance/normalize";

const CARD = "bg-white rounded-2xl border border-slate-100 shadow-xs";
const TH = "px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wide text-left";
const TD = "px-5 py-3.5 text-xs text-slate-600";

const value = (v) => (v === null || v === undefined || v === "" ? "N/A" : v);

function Tile({ icon: Icon, label, value: val, tone = "slate" }) {
  const tones = { slate: "text-slate-800", purple: "text-purple-700", fuchsia: "text-fuchsia-600" };
  return (
    <div className={`${CARD} p-5`}>
      <span className="w-10 h-10 rounded-full border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center mb-3"><Icon className="w-4 h-4" /></span>
      <p className={`text-2xl font-bold tracking-tight leading-none ${tones[tone]}`}>{val}</p>
      <p className="text-[11px] font-semibold text-slate-500 mt-1.5">{label}</p>
    </div>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
      {Icon && <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5" /></span>}
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="text-xs font-semibold text-slate-800 mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}

export default function DepartmentDetailPage() {
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: null, departments: [], members: [], locations: [], attendance: null });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const [deptRes, roster, locRes, attRes] = await Promise.allSettled([
      organizationAPI.getDepartments(),
      fetchAllOrgEmployees({ includeInactive: true }),
      organizationAPI.getLocations(),
      attendanceAPI.getDepartmentSummary(todayYMD()),
    ]);
    setState({
      loading: false,
      // Only the department read is fatal: without it there is nothing to show.
      error: deptRes.status === "rejected" ? deptRes.reason : null,
      departments: deptRes.status === "fulfilled" && Array.isArray(deptRes.value?.data) ? deptRes.value.data : [],
      members: roster.status === "fulfilled" ? roster.value : [],
      locations: locRes.status === "fulfilled" && Array.isArray(locRes.value?.data) ? locRes.value.data : [],
      attendance: attRes.status === "fulfilled" ? (attRes.value?.data ?? null) : null,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const dept = useMemo(
    () => state.departments.find((d) => (d.id || d._id) === departmentId) || null,
    [state.departments, departmentId],
  );

  const members = useMemo(
    () => state.members.filter((m) => m.department_id === departmentId),
    [state.members, departmentId],
  );

  const location = useMemo(
    () => state.locations.find((l) => l.id === dept?.location_id) || dept?.location || null,
    [state.locations, dept],
  );

  // #61 groups by department name, so an org with two same-named departments
  // would share a row. Names are unique in practice; the figures are labelled
  // "today" so a mismatch reads as stale, not as a wrong department.
  const stats = useMemo(() => {
    const rows = Array.isArray(state.attendance) ? state.attendance : (state.attendance?.departments || []);
    return rows.find((r) => (r.department || r.department_name) === dept?.name) || null;
  }, [state.attendance, dept]);

  const head = useMemo(() => {
    const id = dept?.head_of_department_id;
    if (!id) return null;
    return state.members.find((m) => m.user_id === id) || dept.head_of_department || null;
  }, [state.members, dept]);

  const activeCount = members.filter((m) => m.is_active !== false && m.status !== "inactive").length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => [m.name, m.employee_code, m.designation, m.email, m.work_location]
      .some((f) => String(f || "").toLowerCase().includes(q)));
  }, [members, query]);

  // A head who isn't in the roster arrives as { identifier, profile } and may
  // have no name at all, so fall back to the work email rather than printing
  // "Unknown employee" over a real person.
  const headEntity = useMemo(() => {
    if (!head) return null;
    const name = personName(head, "") || head.identifier || head.email || "";
    return name ? { ...head, name } : null;
  }, [head]);

  return (
    <>
      <DashboardTopBar title="Departments" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <Link to="/dashboard/hr/departments" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-purple-700">
          <HiArrowLeft className="w-4 h-4" /> All departments
        </Link>

        {state.error ? (
          <div className={CARD}><ErrorState error={state.error} onRetry={load} fallback="Couldn't load this department." /></div>
        ) : state.loading ? (
          <div className="space-y-6">
            <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
            <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        ) : !dept ? (
          <div className={`${CARD} py-16 text-center`}>
            <HiOutlineOfficeBuilding className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-700">This department no longer exists</p>
            <p className="text-xs text-slate-500 mt-1">It may have been removed. Go back to the list to see the current ones.</p>
          </div>
        ) : (
          <>
            {/* ── Identity ───────────────────────────────────────────────── */}
            <section className={`${CARD} p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4`}>
              <div className="flex items-start gap-4 min-w-0">
                <span className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${dept.is_active ? "bg-purple-50 text-purple-600" : "bg-slate-100 text-slate-400"}`}>
                  <HiOutlineOfficeBuilding className="w-7 h-7" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl font-bold text-slate-900">{dept.name}</h1>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${dept.is_active ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dept.is_active ? "bg-purple-500" : "bg-slate-400"}`} />
                      {dept.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1.5 max-w-3xl">
                    {dept.description || <span className="italic text-slate-400">No description provided</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={load} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-purple-200 hover:text-purple-700 px-4 py-2.5 rounded-xl transition">
                  <HiRefresh className="w-4 h-4" /> Refresh
                </button>
                <button type="button" onClick={() => navigate(`/dashboard/hr/departments?edit=${dept.id}`)} className="inline-flex items-center gap-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2.5 rounded-xl transition">
                  <HiPencil className="w-4 h-4" /> Edit department
                </button>
              </div>
            </section>

            {/* ── Headline numbers ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile icon={HiUsers} label={`Members${activeCount !== members.length ? ` · ${activeCount} active` : ""}`} value={members.length} tone="purple" />
              <Tile icon={HiCheckCircle} label="Present today" value={stats ? stats.final_present_count ?? stats.present ?? 0 : "N/A"} />
              <Tile icon={HiCalendar} label="On leave today" value={stats ? stats.on_leave ?? 0 : "N/A"} tone="fuchsia" />
              <Tile icon={HiClock} label="Attendance today" value={stats?.attendance_percentage == null ? "N/A" : `${Math.round(stats.attendance_percentage)}%`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* ── Head of department ───────────────────────────────────── */}
              <section className={`${CARD} p-5`}>
                <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><HiUser className="w-4 h-4 text-purple-500" /> Head of department</h2>
                {headEntity ? (
                  <>
                    <button
                      type="button"
                      onClick={() => dept.head_of_department_id && navigate(`/dashboard/hr/employees/${dept.head_of_department_id}`)}
                      className="w-full text-left rounded-xl border border-slate-100 p-3 hover:border-purple-200 hover:bg-purple-50/30 transition"
                    >
                      <PersonCell entity={headEntity} secondary={headEntity.designation} size="lg" />
                    </button>
                    <div className="mt-2">
                      <Row label="Work email">{value(headEntity.email || headEntity.identifier)}</Row>
                      <Row label="Role">{headEntity.role ? roleLabel(headEntity.role) : "N/A"}</Row>
                      <Row label="Contact">{value(headEntity.contact)}</Row>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No head assigned. Use Edit department to name one.</p>
                )}
              </section>

              {/* ── Office ───────────────────────────────────────────────── */}
              <section className={`${CARD} p-5`}>
                <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><HiLocationMarker className="w-4 h-4 text-purple-500" /> Office</h2>
                {location ? (
                  <div>
                    <Row icon={HiOutlineOfficeBuilding} label="Location">{value(location.name)}</Row>
                    <Row icon={HiLocationMarker} label="Address">{value(location.address)}</Row>
                    <Row icon={HiGlobeAlt} label="City / state">
                      {[location.city, location.state, location.pincode, location.country].filter(Boolean).join(", ") || "N/A"}
                    </Row>
                    <Row icon={HiClock} label="Timezone">{value(location.timezone)}</Row>
                    {location.geofence_radius_meters != null && (
                      <Row icon={HiExclamationCircle} label="Geofence">{location.geofence_radius_meters} m around the office</Row>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No location assigned to this department.</p>
                )}
              </section>

              {/* ── Record ───────────────────────────────────────────────── */}
              <section className={`${CARD} p-5`}>
                <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><HiUserGroup className="w-4 h-4 text-purple-500" /> Record</h2>
                <Row label="Status">{dept.is_active ? "Active" : "Inactive"}</Row>
                <Row label="Created">{fmtDate(dept.created_at, { day: "numeric", month: "short", year: "numeric" }, "N/A")}</Row>
                <Row label="Last updated">{fmtDate(dept.updated_at, { day: "numeric", month: "short", year: "numeric" }, "N/A")}</Row>
                {stats && (
                  <Row label="Today at a glance">
                    {[
                      `${stats.present ?? 0} present`,
                      `${stats.late ?? 0} late`,
                      `${stats.half_day ?? 0} half day`,
                      `${stats.final_absent_count ?? stats.absent ?? 0} absent`,
                    ].join(" · ")}
                  </Row>
                )}
              </section>
            </div>

            {/* ── Members ────────────────────────────────────────────────── */}
            <section className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Members</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {members.length === 0 ? "Nobody is in this department yet." : `${filtered.length} of ${members.length} shown · click a row to open the profile`}
                  </p>
                </div>
                {members.length > 0 && (
                  <div className="relative">
                    <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search this department"
                      aria-label="Search members of this department"
                      className="h-10 w-60 pl-9 pr-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400"
                    />
                  </div>
                )}
              </div>

              {filtered.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">
                  {members.length === 0 ? "Transfer someone here from their profile to get started." : `No member matches “${query}”.`}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem]">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className={TH}>Person</th>
                        <th className={TH}>Designation</th>
                        <th className={TH}>Role</th>
                        <th className={TH}>Employment</th>
                        <th className={TH}>Works from</th>
                        <th className={TH}>Joined</th>
                        <th className={TH}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m) => (
                        <tr
                          key={m.user_id}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open ${m.name}`}
                          onClick={() => navigate(`/dashboard/hr/employees/${m.user_id}`)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/dashboard/hr/employees/${m.user_id}`); } }}
                          className="border-b border-slate-50 last:border-0 hover:bg-purple-50/30 cursor-pointer outline-none focus:bg-purple-50/40"
                        >
                          <td className="px-5 py-3">
                            <PersonCell entity={m} secondary={m.email} />
                            {m.user_id === dept.head_of_department_id && (
                              <span className="inline-block mt-1 ml-11 px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[9px] font-bold uppercase tracking-wide">Head</span>
                            )}
                          </td>
                          <td className={TD}>{value(m.designation)}</td>
                          <td className={TD}>{m.role ? roleLabel(m.role) : "N/A"}</td>
                          <td className={TD}>{m.employment_type ? humanize(m.employment_type) : "N/A"}</td>
                          <td className={TD}>
                            {value(m.work_location)}
                            {m.work_mode && <span className="block text-[10px] text-slate-400">{humanize(m.work_mode)}</span>}
                          </td>
                          <td className={TD}>{fmtDate(m.joining_date, { day: "numeric", month: "short", year: "numeric" }, "N/A")}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${m.is_active === false ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-violet-50 text-violet-700 border-violet-200"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${m.is_active === false ? "bg-slate-400" : "bg-violet-500"}`} />
                              {m.is_active === false ? "Inactive" : "Active"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
