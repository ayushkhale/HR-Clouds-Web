import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { organizationAPI } from "../../../shared/api";
import { HiOfficeBuilding, HiSearch, HiUserGroup } from "react-icons/hi";
import { departmentName, employeeCode, personName } from "../../../shared/attendance/normalize";
import { ErrorState, FilterTabs } from "../../../shared/attendance/ui";
import GenderAvatar from "../../../shared/components/GenderAvatar";
import { DICTIONARY } from "../../../shared/config/dictionary";

// The org roster keys people by `user_id`.
const memberId = (m) => m.user_id || m.id || m._id;
const isActive = (m) => m.is_active !== false && String(m.status || "active").toLowerCase() === "active";
const openKeys = (e) => e.key === "Enter" || e.key === " ";

/**
 * A manager's direct reports, laid out like HR's Team directory. Selecting a
 * card opens the member's profile, where attendance, leave and editing live.
 */
/** "hr" → "HR", "employee" → "Employee". */
const titleCaseRole = (r) => (r === "hr" ? "HR" : r ? r.charAt(0).toUpperCase() + r.slice(1) : r);

export default function ManagerTeamRosterPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The server scopes a manager's roster to their direct reports.
      const res = await organizationAPI.getEmployees({ purpose: "shift_assignment" });
      const list = Array.isArray(res.data) ? res.data : (res.data?.employees || []);
      setTeam([...list].sort((a, b) => personName(a).localeCompare(personName(b))));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const q = searchQuery.trim().toLowerCase();
  // Only the roles this manager's own reports hold — usually just Employee, but
  // a manager with managers under them gets both. Deriving it means the filter
  // can never empty the list on its own.
  const roleTabs = [
    { value: "", label: `All (${team.length})` },
    ...[...new Set(team.map((m) => String(m.role || "").toLowerCase()).filter(Boolean))].sort()
      .map((r) => ({
        value: r,
        label: `${titleCaseRole(r)} (${team.filter((m) => String(m.role || "").toLowerCase() === r).length})`,
      })),
  ];
  const filteredTeam = team.filter((m) => {
    const matchesSearch = !q || [personName(m), m.email, employeeCode(m)].some((v) => String(v || "").toLowerCase().includes(q));
    const matchesRole = !roleFilter || String(m.role || "").toLowerCase() === roleFilter;
    return matchesSearch && matchesRole;
  });

  const openMember = (m) => {
    const id = memberId(m);
    if (id) navigate(`/dashboard/manager/team/member/${id}`);
  };

  return (
    <>
      <DashboardTopBar title={DICTIONARY.NAV.EMPLOYEES} />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-7xl w-full mx-auto flex-1 overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{DICTIONARY.NAV.EMPLOYEES}</h1>
          <p className="text-sm text-slate-500 mt-1">Everyone who reports to you. Open a person to see their attendance and leave, or edit their details.</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
          {/* Same shape as Live Attendance: role segments left, search right. */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <FilterTabs options={roleTabs} value={roleFilter} onChange={setRoleFilter} />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative sm:w-64">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search member or email…"
                  aria-label="Search your team"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                />
              </div>
              {!loading && !error && (
                <p className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                  {filteredTeam.length} {filteredTeam.length === 1 ? "member" : "members"}
                </p>
              )}
            </div>
          </div>

          {error ? (
            <ErrorState error={error} onRetry={fetchTeam} fallback="Couldn't load your team." />
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => <div key={i} className="bg-white rounded-[20px] h-56 border border-slate-100 animate-pulse" />)}
            </div>
          ) : team.length === 0 ? (
            <div className="py-16 text-center">
              <HiUserGroup className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800">No one reports to you yet</h3>
              <p className="text-slate-500 text-sm mt-1">People appear here once HR sets you as their reporting manager.</p>
            </div>
          ) : filteredTeam.length === 0 ? (
            <div className="py-16 text-center text-slate-400 font-medium">
              <HiUserGroup className="w-12 h-12 mx-auto text-slate-200 mb-3" />
              {searchQuery
                ? <>No members matching &quot;{searchQuery}&quot;{roleFilter ? ` in ${titleCaseRole(roleFilter)}` : ""}</>
                : `Nobody on your team has the ${titleCaseRole(roleFilter)} role.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredTeam.map((m) => {
                const name = personName(m);
                const code = employeeCode(m);
                const dept = departmentName(m);
                const active = isActive(m);
                return (
                  <div
                    key={memberId(m) || name}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${name}'s profile`}
                    onClick={() => openMember(m)}
                    onKeyDown={(e) => openKeys(e) && (e.preventDefault(), openMember(m))}
                    className="bg-white rounded-[20px] border border-slate-100 hover:border-purple-200 hover:shadow-md hover:-translate-y-1 focus:border-purple-300 outline-none transition-all duration-200 group cursor-pointer flex flex-col overflow-hidden shadow-sm"
                  >
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-full ${active ? "bg-violet-50 text-violet-600 border border-violet-100" : "bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-violet-500" : "bg-fuchsia-500"}`} />
                          {active ? "Active" : "Inactive"}
                        </span>
                        <span className={`font-mono text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 ${code ? "text-slate-500 bg-slate-100" : "text-slate-400 bg-slate-50"}`} title={code ? undefined : "No employee code on file"}>
                          {code || "N/A"}
                        </span>
                      </div>

                      <div className="flex flex-col items-center text-center">
                        <div className="relative mb-4">
                          <div className="w-20 h-20 rounded-full shadow-sm overflow-hidden bg-slate-50 shrink-0 ring-2 ring-purple-100 flex items-center justify-center">
                            <GenderAvatar person={m} name={name} />
                          </div>
                          {active && <div className="absolute bottom-0.5 right-0.5 w-4.5 h-4.5 bg-violet-500 border-2 border-white rounded-full shadow-sm" />}
                        </div>
                        <h3 className="text-[17px] font-bold text-slate-900 leading-tight group-hover:text-purple-700 transition-colors px-2 truncate w-full">{name}</h3>
                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase truncate w-full">{m.designation || m.role || "N/A"}</p>
                        <span
                          className={`mt-2.5 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full text-[11px] font-semibold border ${dept ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-slate-50 text-slate-400 border-slate-200"}`}
                          title={dept || "No department assigned"}
                        >
                          <HiOfficeBuilding className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{dept || "No department"}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
