import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI, organizationAPI } from "../../../../shared/api";
import MultiSelectDropdown from "../../../../shared/components/MultiSelectDropdown";
import {
  HiTemplate, HiPlus, HiX, HiCheckCircle,
  HiExclamationCircle, HiTrash, HiPencil,
} from "react-icons/hi";

const DAYS = [
  { label: "Sun", full: "Sunday", value: 0 },
  { label: "Mon", full: "Monday", value: 1 },
  { label: "Tue", full: "Tuesday", value: 2 },
  { label: "Wed", full: "Wednesday", value: 3 },
  { label: "Thu", full: "Thursday", value: 4 },
  { label: "Fri", full: "Friday", value: 5 },
  { label: "Sat", full: "Saturday", value: 6 },
];

function dayName(v) {
  return DAYS.find((d) => d.value === v)?.full || `Day ${v}`;
}

/* ─── Toast ─────────────────────────────────────────────────────────────── */
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500" /> : <HiExclamationCircle className="w-5 h-5 text-red-500" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 text-slate-400" /></button>
    </div>
  );
}

/* ─── Create Modal ───────────────────────────────────────────────────────── */
function WeeklyOffModal({ shifts, onClose, onSaved, editRule }) {
  const isEdit = !!editRule;
  const [form, setForm] = useState({
    name: editRule?.name || "",
    priority: editRule?.priority ?? 0,
    effective_from: editRule?.effective_from ? editRule.effective_from.split('T')[0] : "",
    days_of_week: editRule?.days_of_week || (editRule?.day_of_week !== undefined ? [editRule.day_of_week] : []),
    target_locations: editRule?.target_locations || [],
    target_departments: editRule?.target_departments || [],
    target_shifts: editRule?.target_shifts || (editRule?.shift_id ? [editRule.shift_id] : []),
    target_employment_types: editRule?.target_employment_types || [],
    target_job_statuses: editRule?.target_job_statuses || [],
    included_users: editRule?.included_users || [],
    excluded_users: editRule?.excluded_users || [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function loadTargetingData() {
      try {
        const [locRes, depRes, empRes] = await Promise.all([
          organizationAPI.getLocations().catch(() => ({ data: [] })),
          organizationAPI.getDepartments().catch(() => ({ data: [] })),
          organizationAPI.getEmployees({ purpose: "shift_assignment" }).catch(() => ({ data: [] }))
        ]);
        setLocations((locRes.data || []).filter(x => x.is_active !== false));
        setDepartments((depRes.data || []).filter(x => x.is_active !== false));
        setEmployees((empRes.data || []).filter(x => x.is_active !== false && x.status !== "Inactive"));
      } catch (err) {
        console.error("Failed to load targeting data", err);
      }
    }
    loadTargetingData();
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function toggleDay(val) {
    setForm((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(val) 
        ? prev.days_of_week.filter((d) => d !== val) 
        : [...prev.days_of_week, val]
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Please provide a rule name."); return; }
    if (form.days_of_week.length === 0) { setError("Please select at least one day."); return; }
    
    setLoading(true); setError("");
    try {
      const payload = {
        name: form.name,
        days_of_week: form.days_of_week,
        priority: parseInt(form.priority, 10),
        effective_from: form.effective_from,
        target_locations: form.target_locations,
        target_departments: form.target_departments,
        target_shifts: form.target_shifts,
        target_employment_types: form.target_employment_types,
        target_job_statuses: form.target_job_statuses,
        included_users: form.included_users,
        excluded_users: form.excluded_users,
      };

      if (isEdit) {
        await attendanceAPI.updateWeeklyOff(editRule.id, payload);
        onSaved("Weekly off rule updated successfully.");
      } else {
        await attendanceAPI.createWeeklyOff(payload);
        onSaved("Weekly off rule saved successfully.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isEdit ? "Edit Weekly Off Rule" : "Add Weekly Off Rule"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define weekend days for your company or specific groups.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rule Name <span className="text-red-400">*</span></label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Global Sunday"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white shadow-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priority (0 = Lowest) <span className="text-red-400">*</span></label>
              <input type="number" min="0" value={form.priority} onChange={(e) => set("priority", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white shadow-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective From <span className="text-red-400">*</span></label>
              <input type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white shadow-xs" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Days Off <span className="text-red-400">*</span></label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((d) => {
                const active = form.days_of_week.includes(d.value);
                return (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition ${
                      active
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200"
                        : "bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600"
                    }`}>
                    {d.label}
                  </button>
                );
              })}
            </div>
            {form.days_of_week.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-2">
                Selected: {form.days_of_week.map((v) => DAYS.find((d) => d.value === v)?.full).join(", ")}
              </p>
            )}
          </div>
          
          <hr className="border-slate-100 my-4" />
          <h3 className="text-sm font-bold text-slate-800">Targeting Rules</h3>
          <p className="text-xs text-slate-500 mb-4">Leave empty to apply to the entire organization.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelectDropdown
              label="Applicable Shifts"
              placeholder="All Shifts"
              options={shifts.map(s => ({ value: s.id, label: s.name }))}
              value={form.target_shifts}
              onChange={v => set("target_shifts", v)}
            />
            <MultiSelectDropdown
              label="Applicable Departments"
              placeholder="All Departments"
              options={departments.map(d => ({ value: d.id || d._id, label: d.name }))}
              value={form.target_departments}
              onChange={v => set("target_departments", v)}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelectDropdown
              label="Applicable Locations"
              placeholder="All Locations"
              options={locations.map(l => ({ value: l.id, label: l.name }))}
              value={form.target_locations}
              onChange={v => set("target_locations", v)}
            />
            <MultiSelectDropdown
              label="Job Statuses"
              placeholder="All Statuses"
              options={[{value:"Active", label:"Active"}, {value:"Probation", label:"Probation"}, {value:"Notice Period", label:"Notice Period"}]}
              value={form.target_job_statuses}
              onChange={v => set("target_job_statuses", v)}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelectDropdown
              label="Employment Types"
              placeholder="All Types"
              options={[{value:"Full-time", label:"Full-time"}, {value:"Part-time", label:"Part-time"}, {value:"Contract", label:"Contract"}]}
              value={form.target_employment_types}
              onChange={v => set("target_employment_types", v)}
            />
            <MultiSelectDropdown
              label="Force Include Employees"
              placeholder="None"
              options={employees.map(e => ({ value: e.user_id || e.id, label: e.name || e.full_name, subtitle: e.employee_code, avatarIdentifier: e.email || e.name }))}
              value={form.included_users}
              onChange={v => set("included_users", v)}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading ? "Saving…" : isEdit ? "Update Rule" : "Save Rule"}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AttendanceWeeklyOffsPage() {
  const [rules, setRules] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    try {
      const [rulesRes, shiftsRes] = await Promise.all([
        attendanceAPI.getWeeklyOffs(),
        attendanceAPI.getShifts(),
      ]);
      setRules(rulesRes.data || []);
      setShifts(shiftsRes.data || []);
    } catch {
      showToast("Failed to load weekly off rules.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(rule) {
    if (!window.confirm("Remove this weekly off rule?")) return;
    setDeleting(rule.id);
    try {
      await attendanceAPI.deleteWeeklyOff(rule.id);
      showToast("Rule removed.");
      load();
    } catch (err) {
      showToast(err.message || "Failed to delete.", "error");
    } finally {
      setDeleting(null);
    }
  }

  function shiftName(shiftId) {
    return shifts.find((s) => s.id === shiftId)?.name || null;
  }

  // Split rules into global and exceptions
  const globalRules = rules.filter((r) => r.priority === 0);
  const exceptionRules = rules.filter((r) => r.priority > 0);

  function RuleRow({ r }) {
    const daysStr = (r.days_of_week || []).map(dayName).join(", ");
    const targetingCount = (r.target_locations?.length || 0) + (r.target_departments?.length || 0) + (r.target_shifts?.length || 0) + (r.target_employment_types?.length || 0) + (r.target_job_statuses?.length || 0) + (r.included_users?.length || 0) + (r.excluded_users?.length || 0);

    return (
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{r.name}</td>
        <td className="px-6 py-4 text-xs font-semibold text-slate-600">{daysStr}</td>
        <td className="px-6 py-4 text-xs text-slate-500">{r.priority}</td>
        <td className="px-6 py-4">
          {targetingCount === 0 ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Global</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100 cursor-help" title={`Targeted to ${targetingCount} rule(s)`}>Targeted</span>
          )}
        </td>
        <td className="px-6 py-4">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${r.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {r.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditRule(r)}
              className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Edit rule">
              <HiPencil className="w-4 h-4" />
            </button>
            <button onClick={() => handleDelete(r)} disabled={deleting === r.id}
              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
              <HiTrash className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function RulesTable({ title, badge, badgeColor, rows, emptyMsg }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-xs text-slate-400">{emptyMsg}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rule Name</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Days Off</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Targeting</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => <RuleRow key={r.id} r={r} />)}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <HiTemplate className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Weekly Off Configuration</h1>
                <p className="text-xs text-slate-400 mt-0.5">Define which days of the week are non-working for your teams.</p>
              </div>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
              <HiPlus className="w-4 h-4" /> Add Rule
            </button>
          </div>

          {loading ? (
            <Skeleton type="table" rows={4} />
          ) : rules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                <HiTemplate className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No weekly off rules yet</p>
              <p className="text-xs text-slate-400">Configure weekends so the attendance engine knows non-working days.</p>
              <button onClick={() => setShowModal(true)}
                className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                <HiPlus className="w-4 h-4" /> Add Rule
              </button>
            </div>
          ) : (
            <>
              {/* Global Weekends */}
              <RulesTable
                title="Global Weekends"
                badge={`${globalRules.length} rule${globalRules.length !== 1 ? "s" : ""}`}
                badgeColor="bg-emerald-100 text-emerald-700"
                rows={globalRules}
                emptyMsg="No company-wide weekend rules configured."
              />

              {/* Exceptions (Priority > 0) */}
              <RulesTable
                title="Exception Rules"
                badge={`${exceptionRules.length} rule${exceptionRules.length !== 1 ? "s" : ""}`}
                badgeColor="bg-violet-100 text-violet-700"
                rows={exceptionRules}
                emptyMsg="No targeted exceptions configured."
              />
            </>
          )}
        </main>
      </div>

      {showModal && (
        <WeeklyOffModal
          shifts={shifts.filter((s) => s.is_active)}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => { setShowModal(false); showToast(msg); load(); }}
        />
      )}

      {editRule && (
        <WeeklyOffModal
          editRule={editRule}
          shifts={shifts.filter((s) => s.is_active)}
          onClose={() => setEditRule(null)}
          onSaved={(msg) => { setEditRule(null); showToast(msg); load(); }}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
