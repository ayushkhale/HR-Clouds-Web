// ─────────────────────────────────────────────────────────────────────────────
// ReportingLocationTab — "Reporting & Location" on an employee record: who they
// answer to, which department they sit in, and where their clock-ins are
// allowed to happen. ONE component for HR and the manager (CLAUDE.md §2);
// `viewer` picks the API plane and hides the controls a manager has no
// endpoint for, never the layout.
//
// It was the "Department" tab, which named one of the four things on it. The
// key is still `department` so `?tab=department` links and the `tab.department`
// field-help entry keep working — the label changed, not the route.
//
// WHERE THE PEOPLE COME FROM. One roster, the app-wide directory
// (`useEmployeeDirectory`, CLAUDE.md §7) — this screen used to run its own
// `fetchAllOrgEmployees`, a second unpaginated read of the same rows that gave
// the same colleague a photo here and initials elsewhere. `rows` resolves the
// reporting person and the head of department (a deactivated manager still has
// a name), `activeRows` builds the team list.
//
// THERE IS NO "a manager's direct reports" ENDPOINT, so the team is the roster
// filtered on `reporting_person === userId`. The roster carries PII; it stays
// in component memory.
//
// NAVIGATION IS HR-ONLY ON PURPOSE. `GET /organization/employees/:id` answers
// 403 outside the manager's own reporting line, so a manager's team card is an
// info card, not a link — a grand-report's profile would 403 and §2 says a
// capability a role lacks is absent, not broken.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOfficeBuilding, HiUserGroup, HiMail, HiSearch, HiChevronRight,
  HiStar, HiSwitchHorizontal, HiBriefcase, HiUser,
} from "react-icons/hi";
import { organizationAPI } from "../../../../shared/api";
import { useEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import { EmptyState, ErrorState, LoadingRows } from "../../../../shared/attendance/ui";
import { humanize } from "../../../../shared/attendance/enums";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import { DetailGrid, DetailSection } from "../../../../shared/components/DetailDialog";
import FieldAssignmentsPanel from "../../../../shared/attendance/FieldAssignmentsPanel";

const SURFACE = "organization.employee_profile";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const sameText = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const reportsTo = (row) => row?.reporting_person ?? row?.reporting_person_id ?? row?.reporting_person_details?.user_id ?? null;

const ALL_DEPTS = "__all__";
const NO_DEPT_KEY = "__none__";
const NO_DEPT = "No department";

/** A colleague's record, in the workspace that is rendering this tab. */
const MEMBER_PATH = {
  hr: (id) => (id ? `/dashboard/hr/employees/${id}` : null),
  manager: () => null, // out of scope past one level — see the header comment
};

// THE KEY IS `department_id`, THE NAME IS ONLY A LABEL. `department` is a
// denormalized copy of the name: the 2026-10-02 repair migration rewrites it
// where it can resolve a real department and nulls it where it cannot, so two
// rows in the same department can disagree about its name and a row in no
// department can still carry one. Grouping on the string is the bug that
// migration exists to clear up — one chip would split in two, or two
// departments with the same name would merge into one.
//
// The name is the FALLBACK, not a shortcut: before migration 00067 runs, every
// roster row carries a name and no id, and folding those into "No department"
// would collapse the whole strip to a single chip — which this screen then
// hides, because it only shows the filter for more than one. Same rule as
// `departmentKeyOf` in shared/organization/orgChartMeta.js; change both or
// neither.
const teamDeptKeyOf = (member) => {
  if (member?.department_id) return String(member.department_id);
  return String(member?.department || "").trim() || NO_DEPT_KEY;
};

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

/** The two people this record hangs off: the person above them, and their head of department. */
function PersonCard({ label, name, person, meta = [], badge, onOpen = null, emptyText }) {
  const body = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{label}</p>
      {name ? (
        <>
          <PersonTile name={name} person={person} subtitle={person?.designation || (person?.role ? humanize(person.role) : "")} badge={badge} />
          {meta.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 sm:pl-14 text-[11px] font-semibold text-slate-500">
              {meta.map(({ icon: Icon, text }) => (
                <span key={text} className="inline-flex items-center gap-1 min-w-0 max-w-full">
                  <Icon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="truncate" title={text}>{text}</span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-slate-400">{emptyText}</p>
      )}
    </>
  );

  const shell = "rounded-2xl border border-slate-200 bg-slate-50/60 p-4 min-w-0";
  if (!onOpen || !name) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${shell} w-full text-left relative hover:border-purple-300 hover:bg-purple-50/50 transition-colors group`}
    >
      {body}
      <HiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 absolute top-4 right-3" />
    </button>
  );
}

export default function ReportingLocationTab({
  employee,
  userId,
  employeeRole,
  viewer = "hr",
  onTransfer = null,
  onEditWorkplace = null,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rows, activeRows, status: rosterStatus, error: rosterError, entryOf, nameOf, reload: reloadRoster } = useEmployeeDirectory();
  const isManager = employeeRole === "manager";
  const [state, setState] = useState({ departments: [], loading: true, error: null });
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState(ALL_DEPTS);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await organizationAPI.getDepartments();
      if (id !== reqId.current) return;
      setState({ departments: Array.isArray(res?.data) ? res.data : [], loading: false, error: null });
    } catch (err) {
      if (id !== reqId.current) return;
      setState({ departments: [], loading: false, error: err });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The profile carries the department name (and sometimes its id); the
  // departments list adds the head's id, location and active flag.
  const department = useMemo(
    () => state.departments.find((d) => sameId(d.id, employee?.department_id))
      || state.departments.find((d) => sameText(d.name, employee?.department))
      || null,
    [state.departments, employee?.department_id, employee?.department],
  );

  const deptName = department?.name || employee?.department || "";
  const deptKey = department?.id ? String(department.id) : String(employee?.department_id || "").trim() || null;

  // ── The person above them ────────────────────────────────────────────────
  // The detail payload resolves the name itself; the roster adds the photo,
  // designation and department. An id with no roster row yet reads "Loading…",
  // never the id (§4).
  const managerId = reportsTo(employee);
  const managerRow = useMemo(() => {
    if (managerId) return entryOf(managerId);
    const email = employee?.reporting_person_details?.email;
    return email ? rows.find((r) => sameText(r.email, email)) || null : null;
  }, [managerId, entryOf, rows, employee?.reporting_person_details?.email]);
  const managerName = employee?.reporting_person_details?.name
    || managerRow?.name
    || (managerId ? nameOf(managerId, "") : "");
  const managerIsViewer = sameId(managerId, user?.id) || sameText(managerRow?.email, user?.email);
  const managerMeta = [
    managerRow?.department && { icon: HiOfficeBuilding, text: managerRow.department },
    (employee?.reporting_person_details?.email || managerRow?.email) && {
      icon: HiMail,
      text: employee?.reporting_person_details?.email || managerRow?.email,
    },
  ].filter(Boolean);

  // ── Head of department ───────────────────────────────────────────────────
  const headId = department?.head_of_department_id;
  const headRow = headId ? entryOf(headId) : null;
  const headName = department?.head_of_department_name
    || employee?.department_head_details?.name
    || headRow?.name
    || (headId ? nameOf(headId, "") : "");
  const headEmail = employee?.department_head_details?.email || headRow?.email || "";
  const isHead = sameId(headId, userId) || (!headId && sameText(headEmail, employee?.email));
  const headMeta = [headEmail && { icon: HiMail, text: headEmail }].filter(Boolean);

  // How big the department is — the roster is already in hand, so this costs
  // no request. Counted on the id where there is one, the name otherwise.
  const deptHeadcount = useMemo(() => {
    if (!deptName) return null;
    return activeRows.filter((r) => (deptKey ? sameId(r.department_id, deptKey) : sameText(r.department, deptName))).length;
  }, [activeRows, deptKey, deptName]);

  // ── Their team, when they lead one ───────────────────────────────────────
  const team = useMemo(
    () => activeRows.filter((row) => sameId(reportsTo(row), userId) && !sameId(row.user_id, userId)),
    [activeRows, userId],
  );
  // One chip per department the team spans — a manager can head more than one.
  // Each chip is keyed by id and labelled from the departments list, so the
  // label is the department's real name even when a member's own copy of it is
  // stale or missing.
  const teamDepts = useMemo(() => {
    const counts = new Map();
    for (const m of team) {
      const key = teamDeptKeyOf(m);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({
        key,
        count,
        name: key === NO_DEPT_KEY
          ? NO_DEPT
          : state.departments.find((d) => sameId(d.id || d._id, key))?.name
            // The departments list failed or doesn't carry it; the member's own
            // label is the only name available, and a chip with no name at all
            // would read as a bug.
            || team.find((m) => teamDeptKeyOf(m) === key)?.department
            || NO_DEPT,
      }))
      .sort((a, b) => (a.key === NO_DEPT_KEY) - (b.key === NO_DEPT_KEY) || a.name.localeCompare(b.name));
  }, [team, state.departments]);
  // Drop a stale choice (e.g. after the team reloads without that department).
  const activeDept = teamDepts.some((d) => d.key === deptFilter) ? deptFilter : ALL_DEPTS;
  const activeDeptName = teamDepts.find((d) => d.key === activeDept)?.name || "";

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team.filter((m) => (activeDept === ALL_DEPTS || teamDeptKeyOf(m) === activeDept)
      && (!q || [m.name, m.designation, m.department, m.email, m.employee_code].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [team, query, activeDept]);

  const openMember = MEMBER_PATH[viewer] || MEMBER_PATH.manager;
  const rosterLoading = rosterStatus === "idle" || rosterStatus === "loading";
  const rosterBroken = rosterStatus === "error" || rosterStatus === "unavailable";
  const displayName = employee?.name || employee?.full_name || "";

  return (
    <div className="space-y-6">
      <DetailSection title="Reporting line" icon={HiUser} help={{ surface: SURFACE, field: "reporting_person" }}>
        {rosterLoading && !managerName && !headName ? (
          <LoadingRows rows={2} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PersonCard
              label="Reports to"
              name={managerName}
              person={managerRow}
              meta={managerMeta}
              emptyText="Nobody — this person reports to no one yet"
              badge={managerIsViewer && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white shrink-0">You</span>
              )}
              onOpen={openMember(managerId) && !managerIsViewer ? () => navigate(openMember(managerId)) : null}
            />
            <PersonCard
              label="Head of department"
              name={headName}
              person={headRow}
              meta={headMeta}
              emptyText={deptName ? "No head assigned" : "No department, so no head"}
              badge={isHead && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white shrink-0">
                  <HiStar className="w-3 h-3" /> This person
                </span>
              )}
              onOpen={!isHead && openMember(headId) ? () => navigate(openMember(headId)) : null}
            />
          </div>
        )}
      </DetailSection>

      <DetailSection
        title="Department"
        icon={HiOfficeBuilding}
        action={onTransfer && (
          <button
            type="button"
            onClick={onTransfer}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 transition"
          >
            <HiSwitchHorizontal className="w-3.5 h-3.5" /> {deptName ? "Transfer department" : "Assign department"}
          </button>
        )}
      >
        {state.loading && !deptName ? (
          <LoadingRows rows={2} />
        ) : state.error && !deptName ? (
          <ErrorState error={state.error} onRetry={load} fallback="Couldn't load the department." />
        ) : !deptName ? (
          <EmptyState
            icon={HiOfficeBuilding}
            title="No department assigned"
            message={onTransfer ? "Assign a department to place this person in the organisation." : "Nobody has placed this person in a department yet."}
            className="py-8"
          />
        ) : (
          <>
            <DetailGrid
              cols={3}
              items={[
                { label: "Department", value: deptName },
                { label: "Where it sits", value: department?.location_name },
                { label: "People in it", value: deptHeadcount == null || rosterBroken ? null : `${deptHeadcount}` },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {employee?.designation && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  <HiBriefcase className="w-3.5 h-3.5" /> {employee.designation}
                </span>
              )}
              {department?.is_active === false && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  Department closed
                </span>
              )}
            </div>
          </>
        )}
      </DetailSection>

      {/* Where their clock-ins are allowed: the mode, the base office, and the
          client sites. HR can change the first two; both planes can assign a
          site (§2 — the manager's own endpoints, one level deep). */}
      <FieldAssignmentsPanel
        key={userId}
        userId={userId}
        name={displayName}
        viewer={viewer}
        onEditWorkplace={onEditWorkplace}
      />

      {isManager && (
        <DetailSection
          title={`Team members${rosterLoading ? "" : ` (${team.length})`}`}
          icon={HiUserGroup}
          action={!rosterLoading && !rosterBroken && team.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
              {teamDepts.length > 1 && (
                <div role="group" aria-label="Filter team by department" className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
                  {/* `key` is the department id (or the no-department
                      sentinel) and `label` is its name — two separate things
                      since the name stopped being trustworthy as an identity. */}
                  {[{ key: ALL_DEPTS, label: "All", count: team.length }, ...teamDepts.map((d) => ({ ...d, label: d.name }))].map(({ key, label, count }) => {
                    const active = activeDept === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setDeptFilter(key)}
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
          {rosterLoading ? (
            <LoadingRows rows={3} />
          ) : rosterBroken ? (
            <ErrorState error={rosterError} onRetry={reloadRoster} fallback="Couldn't load this manager's team." />
          ) : team.length === 0 ? (
            <EmptyState icon={HiUserGroup} title="No team members" message="Nobody reports to this manager yet." className="py-8" />
          ) : filteredTeam.length === 0 ? (
            <EmptyState
              icon={HiSearch}
              title="No matches"
              message={`No team member${activeDept === ALL_DEPTS ? "" : ` in ${activeDeptName}`} matches “${query.trim()}”.`}
              className="py-8"
            />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTeam.map((member) => {
                const path = openMember(member.user_id);
                const card = (
                  <>
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
                        {/* "This one sits somewhere else" is a question about
                            identity, so it is decided on the id when both rows
                            have one and only falls back to comparing names. */}
                        {member.department && (deptKey
                          ? !sameId(member.department_id, deptKey)
                          : !sameText(member.department, deptName)) && (
                          <span className="inline-flex items-center gap-1"><HiOfficeBuilding className="w-3.5 h-3.5 text-purple-500" />{member.department}</span>
                        )}
                        {member.email && <span className="inline-flex items-center gap-1 min-w-0"><HiMail className="w-3.5 h-3.5 text-purple-500 shrink-0" /><span className="truncate">{member.email}</span></span>}
                      </div>
                    </div>
                    {path && <HiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 shrink-0" />}
                  </>
                );
                return (
                  <li key={member.user_id}>
                    {path ? (
                      <button
                        type="button"
                        onClick={() => navigate(path)}
                        className="w-full text-left rounded-2xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3 hover:border-purple-300 hover:bg-purple-50/40 transition-colors group"
                      >
                        {card}
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3">
                        {card}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>
      )}
    </div>
  );
}
