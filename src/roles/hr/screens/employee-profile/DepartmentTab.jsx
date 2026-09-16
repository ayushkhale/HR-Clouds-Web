// ─────────────────────────────────────────────────────────────────────────────
// DepartmentTab.jsx — Where the person sits in the organisation.
//
// Everyone: their department and who heads it.
// Managers: also the people who report to them. There is no HR endpoint for
// "a manager's direct reports", so the team is the org roster (emp_report,
// every page) filtered on `reporting_person === userId`. The roster carries PII;
// it stays in component memory only.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOfficeBuilding, HiUserGroup, HiLocationMarker, HiMail, HiSearch, HiChevronRight, HiStar } from "react-icons/hi";
import { organizationAPI } from "../../../../shared/api";
import { fetchAllOrgEmployees } from "../../../../shared/utils/orgEmployees";
import { EmptyState, ErrorState, LoadingRows } from "../../../../shared/attendance/ui";
import { humanize } from "../../../../shared/attendance/enums";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import { DetailSection } from "../../../../shared/components/DetailDialog";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const sameText = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const reportsTo = (row) => row?.reporting_person ?? row?.reporting_person_id ?? row?.reporting_person_details?.user_id ?? null;

const ALL_DEPTS = "__all__";
const NO_DEPT = "No department";
const teamDeptOf = (member) => String(member?.department || "").trim() || NO_DEPT;

function PersonTile({ name, subtitle, person, badge }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-purple-50 border-2 border-white shadow-sm shrink-0">
        <GenderAvatar person={person} name={name} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className={`text-sm font-bold truncate ${name ? "text-slate-900" : "text-slate-400"}`} title={name || undefined}>{name || "N/A"}</p>
          {badge}
        </div>
        {subtitle && <p className="text-xs text-slate-500 truncate" title={subtitle}>{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DepartmentTab({ employee, userId, employeeRole }) {
  const navigate = useNavigate();
  const isManager = employeeRole === "manager";
  const [state, setState] = useState({ departments: [], roster: [], loading: true, error: null, teamError: null });
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState(ALL_DEPTS);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null, teamError: null }));
    const [deptRes, rosterRes] = await Promise.allSettled([
      organizationAPI.getDepartments(),
      isManager ? fetchAllOrgEmployees({ includeInactive: false }) : Promise.resolve([]),
    ]);
    if (id !== reqId.current) return;
    setState({
      departments: deptRes.status === "fulfilled" && Array.isArray(deptRes.value?.data) ? deptRes.value.data : [],
      roster: rosterRes.status === "fulfilled" ? rosterRes.value : [],
      loading: false,
      error: deptRes.status === "rejected" ? deptRes.reason : null,
      teamError: rosterRes.status === "rejected" ? rosterRes.reason : null,
    });
  }, [isManager]);

  useEffect(() => { load(); }, [load]);

  // The profile carries the department name (and sometimes its id); the
  // departments list adds the head's id, location and active flag.
  const department = useMemo(
    () => state.departments.find((d) => sameId(d.id, employee?.department_id))
      || state.departments.find((d) => sameText(d.name, employee?.department))
      || null,
    [state.departments, employee?.department_id, employee?.department],
  );

  const team = useMemo(
    () => state.roster.filter((row) => sameId(reportsTo(row), userId) && !sameId(row.user_id, userId)),
    [state.roster, userId],
  );
  // One chip per department the team spans — a manager can head more than one.
  const teamDepts = useMemo(() => {
    const counts = new Map();
    for (const m of team) {
      const name = teamDeptOf(m);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (a.name === NO_DEPT) - (b.name === NO_DEPT) || a.name.localeCompare(b.name));
  }, [team]);
  // Drop a stale choice (e.g. after the team reloads without that department).
  const activeDept = teamDepts.some((d) => d.name === deptFilter) ? deptFilter : ALL_DEPTS;

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team.filter((m) => (activeDept === ALL_DEPTS || teamDeptOf(m) === activeDept)
      && (!q || [m.name, m.designation, m.department, m.email, m.employee_code].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [team, query, activeDept]);

  const deptName = department?.name || employee?.department || "";
  const headName = department?.head_of_department_name || employee?.department_head_details?.name || "";
  const headEmail = employee?.department_head_details?.email || "";
  const headId = department?.head_of_department_id;
  const isHead = sameId(headId, userId) || (!headId && sameText(headEmail, employee?.email));
  // A manager's roster includes the head when they are a peer; use it for their photo.
  const headRow = state.roster.find((row) => sameId(row.user_id, headId)) || null;

  return (
    <div className="space-y-6">
      <DetailSection title="Department" icon={HiOfficeBuilding}>
        {state.loading && !deptName ? (
          <LoadingRows rows={2} />
        ) : state.error && !deptName ? (
          <ErrorState error={state.error} onRetry={load} fallback="Couldn't load the department." />
        ) : !deptName ? (
          <EmptyState icon={HiOfficeBuilding} title="No department assigned" message="Use Transfer Department in the ··· menu to place this person in a department." className="py-8" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <HiOfficeBuilding className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Department</p>
                <p className="text-base font-bold text-slate-900 truncate" title={deptName}>{deptName}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {department?.location_name && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <HiLocationMarker className="w-3.5 h-3.5 text-purple-500" /> {department.location_name}
                    </span>
                  )}
                  {department?.is_active === false && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Inactive</span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Head of department</p>
              {headName ? (
                <PersonTile
                  name={headName}
                  person={headRow}
                  subtitle={headEmail || headRow?.designation}
                  badge={isHead && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white shrink-0">
                      <HiStar className="w-3 h-3" /> This person
                    </span>
                  )}
                />
              ) : (
                <p className="text-sm font-semibold text-slate-400">No head assigned</p>
              )}
            </div>
          </div>
        )}
      </DetailSection>

      {isManager && (
        <DetailSection
          title={`Team members${state.loading ? "" : ` (${team.length})`}`}
          icon={HiUserGroup}
          action={!state.loading && !state.teamError && team.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
              {teamDepts.length > 1 && (
                <div role="group" aria-label="Filter team by department" className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
                  {[{ name: ALL_DEPTS, label: "All", count: team.length }, ...teamDepts.map((d) => ({ ...d, label: d.name }))].map(({ name, label, count }) => {
                    const active = activeDept === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setDeptFilter(name)}
                        className={`inline-flex items-center gap-1.5 max-w-[11rem] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${active ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-purple-50 hover:text-purple-700"}`}
                      >
                        <span className="truncate" title={label}>{label}</span>
                        <span className={`px-1.5 rounded-full text-[10px] leading-4 ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {team.length > 6 && (
                <label className="relative block w-44 sm:w-56">
                  <HiSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search team"
                    aria-label="Search team members"
                    className="w-full h-8 pl-8 pr-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-purple-500"
                  />
                </label>
              )}
            </div>
          )}
        >
          {state.loading ? (
            <LoadingRows rows={3} />
          ) : state.teamError ? (
            <ErrorState error={state.teamError} onRetry={load} fallback="Couldn't load this manager's team." />
          ) : team.length === 0 ? (
            <EmptyState icon={HiUserGroup} title="No team members" message="Nobody reports to this manager yet." className="py-8" />
          ) : filteredTeam.length === 0 ? (
            <EmptyState
              icon={HiSearch}
              title="No matches"
              message={`No team member${activeDept === ALL_DEPTS ? "" : ` in ${activeDept}`} matches “${query.trim()}”.`}
              className="py-8"
            />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTeam.map((member) => (
                <li key={member.user_id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/hr/employees/${member.user_id}`)}
                    className="w-full text-left rounded-2xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3 hover:border-purple-300 hover:bg-purple-50/40 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <PersonTile
                        name={member.name}
                        person={member}
                        subtitle={member.designation || humanize(member.role)}
                        badge={member.is_active === false && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">Inactive</span>
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pl-14 text-[11px] font-semibold text-slate-500">
                        {member.employee_code && <span className="font-mono text-slate-600">#{member.employee_code}</span>}
                        {member.department && !sameText(member.department, deptName) && (
                          <span className="inline-flex items-center gap-1"><HiOfficeBuilding className="w-3.5 h-3.5 text-purple-500" />{member.department}</span>
                        )}
                        {member.email && <span className="inline-flex items-center gap-1 min-w-0"><HiMail className="w-3.5 h-3.5 text-purple-500 shrink-0" /><span className="truncate">{member.email}</span></span>}
                      </div>
                    </div>
                    <HiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      )}
    </div>
  );
}
