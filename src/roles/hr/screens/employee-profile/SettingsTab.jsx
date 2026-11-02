import React, { useState, useMemo } from "react";
import {
  HiShieldCheck,
  HiSwitchHorizontal,
  HiUser,
  HiUserGroup,
  HiBan,
  HiCheckCircle,
  HiTrash,
  HiExclamation,
  HiInformationCircle,
  HiTrendingUp,
  HiBriefcase,
  HiOfficeBuilding,
} from "react-icons/hi";
import RoleSwitchModal from "./RoleSwitchModal";
import { useEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";

const ROLE_INFO = {
  employee: {
    label: "Employee",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    icon: HiUser,
    desc: "Standard workforce member with employee portal access.",
  },
  manager: {
    label: "Manager",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: HiUserGroup,
    desc: "Team leader with direct reports and supervisory approval workflows.",
  },
  hr: {
    label: "HR Administrator",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    icon: HiShieldCheck,
    desc: "Full organization administration privileges and payroll permissions.",
  },
};

export default function SettingsTab({
  userId,
  employee,
  currentUserId,
  onEmployeeUpdated,
  danger,
}) {
  const [showRoleModal, setShowRoleModal] = useState(false);
  const { activeRows } = useEmployeeDirectory();

  const currentRole = (employee?.role || "employee").toLowerCase();
  const roleMeta = ROLE_INFO[currentRole] || ROLE_INFO.employee;
  const RoleIcon = roleMeta.icon;

  // Direct reports calculation
  const directReports = useMemo(() => {
    return activeRows.filter((r) => {
      const rep = r?.reporting_person ?? r?.reporting_person_id ?? r?.reporting_person_details?.user_id;
      return rep && String(rep) === String(userId) && String(r.user_id || r.id) !== String(userId);
    });
  }, [activeRows, userId]);

  const directReportsCount = employee?.direct_reports_count ?? directReports.length;

  const isCurrentHod = Boolean(
    employee?.is_hod ||
    employee?.department_head ||
    employee?.department_head_details?.user_id === userId ||
    employee?.department?.head_of_department_id === userId
  );

  // Active HR count for sole HR protection
  const activeHrCount = useMemo(() => {
    return activeRows.filter(
      (r) => (r.role || "").toLowerCase() === "hr" && r.is_active !== false
    ).length;
  }, [activeRows]);

  // Self-modification guard
  const isSelf = Boolean(currentUserId && String(currentUserId) === String(userId));

  // Sole active HR guard
  const isSoleHr = currentRole === "hr" && activeHrCount <= 1;

  const canSwitchRole = !isSelf && !isSoleHr;

  const displayName = employee?.name || employee?.full_name || "Employee";
  const departmentName = employee?.department_name || employee?.department?.name || "No department";

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* ── CARD 1: ROLE MANAGEMENT & UPGRADATION ── */}
      <section className="bg-white rounded-[20px] border border-slate-100 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
              <HiTrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Role & Permission Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Promote, demote, or transfer organizational permissions across Employee, Manager, and HR roles.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowRoleModal(true)}
            disabled={!canSwitchRole}
            className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs ${
              canSwitchRole
                ? "text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 cursor-pointer"
                : "text-slate-400 bg-slate-100 cursor-not-allowed border border-slate-200"
            }`}
          >
            <HiSwitchHorizontal className="w-4 h-4" />
            Upgrade or Switch Role
          </button>
        </div>

        {/* Self-modification Guard Alert */}
        {isSelf && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-2.5">
            <HiInformationCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Self-Role Modification Guard</p>
              <p className="font-normal mt-0.5 text-amber-700">
                You are viewing your own profile. For audit integrity and access protection, you cannot modify your own
                role. Another active HR Administrator must perform this action.
              </p>
            </div>
          </div>
        )}

        {/* Sole HR Guard Alert */}
        {isSoleHr && !isSelf && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-2.5">
            <HiExclamation className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Sole Active HR Administrator Protected</p>
              <p className="font-normal mt-0.5 text-amber-700">
                This member is currently the organization's sole active HR Administrator. Demoting this account would
                leave the tenant without administrative leadership. Please promote another member to HR Administrator first.
              </p>
            </div>
          </div>
        )}

        {/* Current Role Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Current Role
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                currentRole === "hr" ? "bg-purple-100 text-purple-700" :
                currentRole === "manager" ? "bg-indigo-100 text-indigo-700" :
                "bg-slate-200 text-slate-700"
              }`}>
                <RoleIcon className="w-3.5 h-3.5" />
              </span>
              <span className="text-sm font-bold text-slate-800 capitalize">{roleMeta.label}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Designation
            </span>
            <div className="flex items-center gap-2 mt-1">
              <HiBriefcase className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-sm font-bold text-slate-800 truncate">
                {employee?.designation || "Not Specified"}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Direct Reports
            </span>
            <div className="flex items-center gap-2 mt-1">
              <HiUserGroup className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-sm font-bold text-slate-800">
                {directReportsCount} {directReportsCount === 1 ? "member" : "members"}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Department Head
            </span>
            <div className="flex items-center gap-2 mt-1">
              <HiOfficeBuilding className="w-4 h-4 text-slate-400 shrink-0" />
              <span className={`text-sm font-bold ${isCurrentHod ? "text-purple-700" : "text-slate-800"}`}>
                {isCurrentHod ? "Yes (Active HOD)" : "No"}
              </span>
            </div>
          </div>
        </div>

        {/* Role Capability Description */}
        <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-start gap-3 text-xs text-slate-600">
          <HiInformationCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-slate-800">Organizational Invariants: </strong>
            Role changes preserve all shared personal, banking, PAN, UAN, and employment identifiers within an
            atomic database transaction. Reporting lines are automatically rewired, and previous JWT sessions are
            instantly revoked for strict security.
          </div>
        </div>
      </section>

      {/* ── CARD 2: DANGER ZONE (SHIFTED FROM PROFILE TAB) ── */}
      {danger && (
        <section className="bg-white rounded-[20px] border border-rose-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-rose-100 bg-rose-50/50 flex items-start gap-3">
            <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <HiExclamation className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800">Danger zone</h2>
              <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                These change what this person can reach. Only HR can do them.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Activate / Deactivate */}
            <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">
                  {employee.is_active !== false ? "Deactivate this employee" : "Activate this employee"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {employee.is_active !== false
                    ? "They can’t sign in and stop appearing in attendance and payroll. Their records are kept, and you can switch this back on."
                    : "They can sign in again and return to attendance and payroll from today."}
                </p>
              </div>
              <button
                type="button"
                onClick={danger.onToggleStatus}
                disabled={danger.busy}
                className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer ${
                  employee.is_active !== false
                    ? "text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 border border-fuchsia-200"
                    : "text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200"
                }`}
              >
                {employee.is_active !== false ? (
                  <>
                    <HiBan className="w-4 h-4" /> Deactivate
                  </>
                ) : (
                  <>
                    <HiCheckCircle className="w-4 h-4" /> Activate
                  </>
                )}
              </button>
            </div>

            {/* Delete Employee */}
            <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">Delete this employee</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Removes the person and everything filed under them. This can’t be undone — deactivate instead if they may come back.
                </p>
              </div>
              <button
                type="button"
                onClick={danger.onDelete}
                disabled={danger.busy}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition disabled:opacity-50 cursor-pointer"
              >
                <HiTrash className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── ROLE SWITCH MODAL ── */}
      {showRoleModal && (
        <RoleSwitchModal
          isOpen={showRoleModal}
          onClose={() => setShowRoleModal(false)}
          employee={employee}
          userId={userId}
          currentUserId={currentUserId}
          onSuccess={(updatedData) => {
            if (onEmployeeUpdated) {
              onEmployeeUpdated(updatedData);
            }
          }}
        />
      )}
    </div>
  );
}

