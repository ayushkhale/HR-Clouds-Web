import React, { useState, useMemo } from "react";
import {
  HiX,
  HiSwitchHorizontal,
  HiUser,
  HiUserGroup,
  HiOfficeBuilding,
  HiExclamation,
  HiCheckCircle,
  HiShieldCheck,
  HiInformationCircle,
} from "react-icons/hi";
import { organizationAPI } from "../../../../shared/api";
import { useEmployeeDirectory, refreshEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";

const ROLE_METADATA = {
  employee: {
    label: "Employee",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    icon: HiUser,
    desc: "Standard team member. Reports to a Manager or HR Administrator.",
  },
  manager: {
    label: "Manager",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: HiUserGroup,
    desc: "Team lead with direct reports. Must report strictly to an HR Administrator.",
  },
  hr: {
    label: "HR Administrator",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    icon: HiShieldCheck,
    desc: "Organization administrator with full administrative access. Must report to an HR Administrator.",
  },
};

const ERROR_MESSAGE_MAP = {
  SELF_ROLE_SWITCH_FORBIDDEN: "You cannot change your own role. Another HR Administrator must perform this action.",
  ROLE_UNMODIFIED: "The user already holds this role. Please select a different role.",
  MISSING_SUBORDINATE_REASSIGNMENT: "This member has direct reports. You must select someone to reassign them to.",
  INVALID_REASSIGNMENT_TARGET: "Invalid recipient. Subordinates include managers who must report to an active HR.",
  MISSING_REPLACEMENT_HOD: "Please select a replacement Head of Department or choose 'Vacate Position'.",
  HOD_DEPARTMENT_MISMATCH: "The replacement HOD must belong to the same department.",
  CIRCULAR_REPORTING_ERROR: "Circular reporting detected. A user cannot report to someone who reports to them.",
  INVALID_REPORTING_PERSON_ROLE: "Managers and HRs can only report to an active HR Administrator.",
  LAST_HR_PROTECTED: "Cannot demote the sole active HR. Please promote another HR administrator first.",
  LIMIT_EXCEEDED: "Plan seat limit reached for this role. Please upgrade your subscription tier.",
  VALIDATION_ERROR: "Please verify all required fields and ensure reason is at least 5 characters.",
};

export default function RoleSwitchModal({
  isOpen,
  onClose,
  employee,
  userId,
  currentUserId,
  onSuccess,
}) {
  const { activeRows } = useEmployeeDirectory();

  const currentRole = (employee?.role || "employee").toLowerCase();
  const initialNewRole = currentRole === "employee" ? "manager" : "employee";

  const [newRole, setNewRole] = useState(initialNewRole);
  const [designation, setDesignation] = useState(employee?.designation || "");
  const [newReportingPerson, setNewReportingPerson] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [replacementHodId, setReplacementHodId] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  // Active HRs for leadership reporting (Rule 10: Managers & HRs can only report to an active HR)
  const activeHrs = useMemo(() => {
    return activeRows.filter(
      (r) => (r.role || "").toLowerCase() === "hr" && String(r.user_id || r.id) !== String(userId)
    );
  }, [activeRows, userId]);

  // Active Managers & HRs for reassignment and regular reporting
  const activeManagersAndHrs = useMemo(() => {
    return activeRows.filter((r) => {
      const rRole = (r.role || "").toLowerCase();
      return (rRole === "manager" || rRole === "hr") && String(r.user_id || r.id) !== String(userId);
    });
  }, [activeRows, userId]);

  // Dynamic conditions
  const isDemotingToEmployee = newRole === "employee" && currentRole !== "employee";
  const isPromotingToManagerOrHr = newRole === "manager" || newRole === "hr";
  const needsSubordinateReassignment = isDemotingToEmployee && directReportsCount > 0;
  const needsHodReplacement = isDemotingToEmployee && isCurrentHod;

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (newRole === currentRole) {
      setFormError("The selected role must differ from the current role.");
      return;
    }

    if (reason.trim().length < 5) {
      setFormError("Reason must be at least 5 characters.");
      return;
    }

    if (reason.trim().length > 255) {
      setFormError("Reason cannot exceed 255 characters.");
      return;
    }

    if (isPromotingToManagerOrHr && !newReportingPerson) {
      setFormError("Managers and HRs must report to an active HR Administrator. Please select one.");
      return;
    }

    if (needsSubordinateReassignment && !reassignTo) {
      setFormError("This member manages team members. Please select a Manager or HR to reassign them to.");
      return;
    }

    if (needsHodReplacement && !replacementHodId) {
      setFormError("Please select a replacement Head of Department or choose 'Vacate Position'.");
      return;
    }

    setSubmitting(true);

    const payload = {
      new_role: newRole,
      reason: reason.trim(),
    };

    if (designation.trim()) {
      payload.designation = designation.trim();
    }

    if (newReportingPerson) {
      payload.new_reporting_person = newReportingPerson;
    }

    if (needsSubordinateReassignment && reassignTo) {
      payload.reassign_subordinates_to = reassignTo;
    }

    if (needsHodReplacement) {
      payload.replacement_hod_id = replacementHodId === "vacate" ? null : replacementHodId;
    }

    try {
      const res = await organizationAPI.switchUserRole(userId, payload);
      refreshEmployeeDirectory();
      if (onSuccess) {
        onSuccess(res?.data || { role: newRole, designation: payload.designation });
      }
      onClose();
    } catch (err) {
      const code = err.data?.errorCode || err.errorCode;
      const mapped = ERROR_MESSAGE_MAP[code];
      const message = mapped || err.data?.message || err.message || "Failed to switch user role.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = employee?.name || employee?.full_name || "Employee";
  const departmentName = employee?.department_name || employee?.department?.name || "No department";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <HiSwitchHorizontal className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-lg text-slate-800">Change Member Role</h3>
              <p className="text-xs text-slate-500">
                Promote, demote, or transfer organizational role for <span className="font-semibold text-slate-700">{displayName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Member Overview Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Current Role & Department</span>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border capitalize ${ROLE_METADATA[currentRole]?.badge}`}>
                  {ROLE_METADATA[currentRole]?.label || currentRole}
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-slate-700">{departmentName}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Direct Reports</span>
                <span className="font-bold text-slate-700">{directReportsCount} members</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Head of Dept</span>
                <span className={`font-bold ${isCurrentHod ? "text-purple-700" : "text-slate-700"}`}>
                  {isCurrentHod ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>

          {/* Form Error Banner */}
          {formError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
              <HiExclamation className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{formError}</div>
            </div>
          )}

          {/* Target Role Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select New Role <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(ROLE_METADATA).map(([roleKey, meta]) => {
                const isSelected = newRole === roleKey;
                const isCurrent = currentRole === roleKey;
                const Icon = meta.icon;

                return (
                  <button
                    key={roleKey}
                    type="button"
                    disabled={isCurrent || submitting}
                    onClick={() => {
                      setNewRole(roleKey);
                      setFormError("");
                    }}
                    className={`relative p-3.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-600/20 shadow-xs"
                        : isCurrent
                        ? "border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        {isCurrent ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            Current
                          </span>
                        ) : isSelected ? (
                          <HiCheckCircle className="w-4 h-4 text-purple-600" />
                        ) : null}
                      </div>
                      <p className="text-sm font-bold text-slate-800">{meta.label}</p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{meta.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Designation */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Designation / Job Title (Optional)
            </label>
            <input
              type="text"
              maxLength={150}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Lead Technical Architect"
              disabled={submitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition"
            />
            <p className="text-[11px] text-slate-400 mt-1">Leave blank to retain current designation ({employee?.designation || "None"}).</p>
          </div>

          {/* DYNAMIC FIELD A: Reporting Person when new role is Manager or HR */}
          {isPromotingToManagerOrHr && (
            <div className="bg-purple-50/50 rounded-2xl p-4 border border-purple-100 space-y-2">
              <label className="block text-xs font-bold text-purple-900 uppercase tracking-wider">
                Reports To (HR Administrator) <span className="text-rose-500">*</span>
              </label>
              <select
                value={newReportingPerson}
                onChange={(e) => {
                  setNewReportingPerson(e.target.value);
                  setFormError("");
                }}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition"
              >
                <option value="">Select an active HR Administrator...</option>
                {activeHrs.map((hr) => (
                  <option key={hr.user_id || hr.id} value={hr.user_id || hr.id}>
                    {hr.name} ({hr.email || "HR Administrator"})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1.5 text-[11px] text-purple-700">
                <HiInformationCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Organizational Rule: Managers and HR Administrators can only report to an active HR Administrator.</span>
              </div>
            </div>
          )}

          {/* Reporting Person when new role is Employee */}
          {newRole === "employee" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                New Reporting Person (Optional)
              </label>
              <select
                value={newReportingPerson}
                onChange={(e) => setNewReportingPerson(e.target.value)}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition"
              >
                <option value="">Select a Manager or HR Administrator...</option>
                {activeManagersAndHrs.map((m) => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.name} ({m.role?.toUpperCase()} • {m.department || "No Department"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* DYNAMIC FIELD B: Demoting to Employee with Direct Reports */}
          {needsSubordinateReassignment && (
            <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200 space-y-2.5">
              <div className="flex items-start gap-2 text-amber-800 text-xs font-semibold">
                <HiExclamation className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  {displayName} currently manages <strong className="font-bold">{directReportsCount} direct reports</strong>.
                  Employees cannot have subordinates. You must reassign their direct reports.
                </span>
              </div>
              <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                Reassign Direct Reports To <span className="text-rose-500">*</span>
              </label>
              <select
                value={reassignTo}
                onChange={(e) => {
                  setReassignTo(e.target.value);
                  setFormError("");
                }}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 transition"
              >
                <option value="">Select a new Manager or HR Administrator...</option>
                {activeManagersAndHrs.map((m) => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.name} ({m.role?.toUpperCase()} • {m.department || "General"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* DYNAMIC FIELD C: Demoting HOD to Employee */}
          {needsHodReplacement && (
            <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200 space-y-2.5">
              <div className="flex items-start gap-2 text-amber-800 text-xs font-semibold">
                <HiExclamation className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  {displayName} is currently Head of Department for <strong className="font-bold">{departmentName}</strong>.
                  Employees cannot head a department.
                </span>
              </div>
              <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                Replacement Head of Department <span className="text-rose-500">*</span>
              </label>
              <select
                value={replacementHodId}
                onChange={(e) => {
                  setReplacementHodId(e.target.value);
                  setFormError("");
                }}
                disabled={submitting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 transition"
              >
                <option value="">Select replacement HOD or choose 'Vacate Position'...</option>
                <option value="vacate">Vacate Position (Leave department without HOD for now)</option>
                {activeManagersAndHrs.map((m) => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.name} ({m.role?.toUpperCase()} • {m.department || "No Dept"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason for Role Change */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Reason for Role Change <span className="text-rose-500">*</span>
              </label>
              <span className={`text-[11px] ${reason.trim().length > 255 ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                {reason.trim().length} / 255
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={255}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFormError("");
              }}
              placeholder="Enter audit justification or promotion review notes (minimum 5 characters)..."
              disabled={submitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition resize-none"
            />
          </div>

          {/* Security & Token Notice */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-[11px] text-slate-500 flex items-start gap-2">
            <HiShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <span>
              All profile records, bank accounts, and payroll identifiers will be preserved. Active JWT sessions will be
              automatically invalidated so permissions update instantly across all devices.
            </span>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              newRole === currentRole ||
              reason.trim().length < 5 ||
              reason.trim().length > 255 ||
              (isPromotingToManagerOrHr && !newReportingPerson) ||
              (needsSubordinateReassignment && !reassignTo) ||
              (needsHodReplacement && !replacementHodId)
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating Role...
              </>
            ) : (
              <>
                <HiSwitchHorizontal className="w-4 h-4" />
                Confirm Role Change
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

