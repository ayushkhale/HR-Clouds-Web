import React, { useState, useEffect } from "react";
import { organizationAPI } from "../../../shared/api";
import { canBeHOD } from "../../../shared/auth/permissions";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiOutlineOfficeBuilding, HiSearch, HiPlus, HiX, HiCheckCircle, HiPencil, HiLocationMarker, HiUser
} from "react-icons/hi";

function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [description, setDescription] = useState("");
  const [headOfDepartmentId, setHeadOfDepartmentId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [result, setResult] = useState({ type: "", message: "" });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setPageLoading(true);
    setFetchError("");
    try {
      const [depRes, locRes, empRes] = await Promise.all([
        organizationAPI.getDepartments(),
        organizationAPI.getLocations().catch(() => ({ success: false, data: [] })),
        organizationAPI.getEmployees({ purpose: "shift_assignment" }).catch(() => ({ success: false, data: [] }))
      ]);

      setDepartments(Array.isArray(depRes?.data) ? depRes.data : []);
      if (Array.isArray(locRes?.data)) setLocations(locRes.data);
      if (Array.isArray(empRes?.data)) setEmployees(empRes.data);
    } catch (error) {
      console.error("Failed to fetch departments", error);
      setFetchError(error?.data?.message || error?.message || "Could not load departments.");
    } finally {
      setPageLoading(false);
    }
  };

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setName("");
    setLocationId("");
    setDescription("");
    setHeadOfDepartmentId("");
    setIsActive(true);
    setResult({ type: "", message: "" });
    setShowModal(true);
  };

  const openEditModal = (dept) => {
    setIsEditing(true);
    setEditingId(dept.id || dept._id);
    setName(dept.name || "");
    setLocationId(dept.location_id || "");
    setDescription(dept.description || "");
    setHeadOfDepartmentId(dept.head_of_department_id || "");
    setIsActive(dept.is_active !== undefined ? dept.is_active : true);
    setResult({ type: "", message: "" });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult({ type: "", message: "" });

    try {
      // Warn before an HOD change: the backend atomically rewires every
      // subordinate reporting line to the new Head of Department.
      if (isEditing) {
        const current = departments.find((d) => (d.id || d._id) === editingId);
        const prevHod = current?.head_of_department_id || "";
        if (prevHod && headOfDepartmentId && prevHod !== headOfDepartmentId) {
          const ok = window.confirm(
            "Changing the Head of Department will transfer all direct reports to the new HOD. Continue?"
          );
          if (!ok) {
            setLoading(false);
            return;
          }
        }
      }

      const payload = {
        name,
        description,
        is_active: isActive
      };
      if (locationId) payload.location_id = locationId;
      if (headOfDepartmentId) payload.head_of_department_id = headOfDepartmentId;

      if (isEditing) {
        await organizationAPI.updateDepartment(editingId, payload);
        setResult({ type: "success", message: "Department updated successfully!" });
      } else {
        await organizationAPI.createDepartment(payload);
        setResult({ type: "success", message: "Department created successfully!" });
      }

      fetchData();

      setTimeout(() => {
        setShowModal(false);
      }, 1500);
    } catch (err) {
      setResult({ type: "error", message: err.message || "Operation failed." });
    } finally {
      setLoading(false);
    }
  };

  const filteredDepartments = departments.filter((dept) =>
    (dept.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1));

  // ── HOD selector options ──────────────────────────────────────────────────
  // Only Managers/HR may lead a department. A department that already has an
  // HOD must be handed over to a named successor rather than left headless, so
  // the blank option is withheld in that case. A legacy HOD whose role no
  // longer qualifies is still listed, otherwise the select would render blank
  // and silently reassign on save.
  const editingDept = isEditing
    ? departments.find((d) => (d.id || d._id) === editingId)
    : null;
  const hasExistingHod = Boolean(editingDept?.head_of_department_id);
  const eligibleHods = employees.filter((emp) => canBeHOD(emp.role));
  const hodOptions = (headOfDepartmentId && !eligibleHods.some(
    (e) => String(e.user_id || e.id) === String(headOfDepartmentId)
  ))
    ? [
        ...eligibleHods,
        ...employees.filter((e) => String(e.user_id || e.id) === String(headOfDepartmentId)),
      ]
    : eligibleHods;

  return (
    <>
        <DashboardTopBar title="Departments" />

        <main className="p-6 sm:p-8 space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Departments</h1>
              <p className="text-sm text-slate-500 mt-1">Manage organizational departments and assignments.</p>
            </div>
            <button
              onClick={openAddModal}
              className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer flex-shrink-0"
            >
              <HiPlus className="w-4 h-4" />
              Add Department
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search department..."
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-full pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {fetchError && !pageLoading && (
              <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex flex-wrap items-center gap-3">
                <span>{fetchError}</span>
                <button
                  type="button"
                  onClick={fetchData}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {pageLoading ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-[20px] h-56 border border-slate-100 animate-pulse" />
                ))
              ) : filteredDepartments.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-400 font-medium">
                  <HiOutlineOfficeBuilding className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  {fetchError
                    ? "Departments unavailable."
                    : searchQuery
                      ? `No departments matching "${searchQuery}"`
                      : "No departments yet — add your first one."}
                </div>
              ) : (
                filteredDepartments.map((dept) => {
                  // Prefer server-resolved names; fall back to local lookup only if absent.
                  const locName = dept.location_name
                    || (locations.find(l => l.id === dept.location_id || l._id === dept.location_id) || dept.location)?.name;
                  const hodName = dept.head_of_department_name
                    || (employees.find(e => e.user_id === dept.head_of_department_id || e.id === dept.head_of_department_id) || dept.head_of_department)?.name;

                  return (
                    <div
                      key={dept.id || dept._id}
                      className={`rounded-[20px] transition-all duration-200 group relative flex flex-col overflow-hidden p-6 ${
                        dept.is_active 
                        ? 'bg-white border border-slate-100 hover:border-purple-200 hover:shadow-md hover:-translate-y-1 shadow-sm' 
                        : 'bg-slate-50 border border-dashed border-slate-300 hover:border-slate-400 opacity-90'
                      }`}
                    >
                      {/* Content */}
                      <div className="relative z-10 flex flex-col h-full">
                        {/* Header Section */}
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-500 group-hover:rotate-3 ${
                              dept.is_active ? 'bg-purple-50 text-purple-600 shadow-purple-100/30' : 'bg-slate-100 text-slate-400'
                            }`}>
                              <HiOutlineOfficeBuilding className="w-5 h-5" />
                            </div>
                            <div className="mt-0.5 min-w-0">
                              <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest mb-1 border ${
                                dept.is_active 
                                ? "bg-purple-50 text-purple-600 border-purple-100/50" 
                                : "bg-slate-200/50 text-slate-500 border-slate-200"
                              }`}>
                                <span className={`w-1 h-1 rounded-full animate-pulse ${dept.is_active ? 'bg-purple-500' : 'bg-slate-400'}`} />
                                {dept.is_active ? "Active" : "Inactive"}
                              </span>
                              <h3 className={`text-base font-bold truncate transition-colors ${
                                dept.is_active ? 'text-slate-850 group-hover:text-purple-700' : 'text-slate-650'
                              }`}>
                                {dept.name}
                              </h3>
                            </div>
                          </div>
                          <button
                            onClick={() => openEditModal(dept)}
                            className="shrink-0 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-purple-600 bg-white hover:bg-purple-50 rounded-xl transition-all shadow-xs border border-slate-100 hover:shadow-sm"
                          >
                            <HiPencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
 
                        {/* Description */}
                        <p className="text-xs text-slate-500 mb-6 line-clamp-2 leading-relaxed">
                          {dept.description || <span className="italic text-slate-350">No description provided</span>}
                        </p>
 
                        {/* Metadata Rows */}
                        <div className="mt-auto flex flex-col gap-2.5 pt-4 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <HiLocationMarker className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-slate-600 truncate">{locName || "No location assigned"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <HiUser className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-slate-600 truncate">{hodName || "No HOD assigned"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full p-7 relative my-8">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HiOutlineOfficeBuilding className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">
                  {isEditing ? "Edit Department" : "Add Department"}
                </h3>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                <HiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Department Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  placeholder="e.g. Engineering, HR, Sales"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Location</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                >
                  <option value="">---Select Location---</option>
                  {locations.map(loc => (
                    <option key={loc.id || loc._id} value={loc.id || loc._id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Head of Department</label>
                <select
                  value={headOfDepartmentId}
                  onChange={(e) => setHeadOfDepartmentId(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                >
                  {!hasExistingHod && <option value="">---Select HOD---</option>}
                  {hodOptions.map(emp => (
                    <option key={emp.user_id || emp.id} value={emp.user_id || emp.id}>
                      {emp.name || emp.full_name || emp.email} ({(emp.role || "").toUpperCase()})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {hasExistingHod
                    ? "Only Managers and HR Admins can lead a department. Choose a successor to hand over — a department cannot be left headless."
                    : "Only Managers and HR Admins can lead a department."}
                </p>
                {hodOptions.length === 0 && (
                  <p className="text-[11px] text-amber-600 font-medium mt-1">
                    No Managers or HR Admins available to assign.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description of the department's function"
                  rows="3"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                />
                <label htmlFor="isActive" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                  Department is Active
                </label>
              </div>

              {result.message && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${result.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {result.type === "success" && <HiCheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  {result.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 mt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">Cancel</button>
                <button type="submit" disabled={loading} className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading ? "Saving..." : "Save Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default DepartmentsPage;
