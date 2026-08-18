import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI, organizationAPI } from "../../../../shared/api";
import MultiSelectDropdown from "../../../../shared/components/MultiSelectDropdown";
import {
  HiCalendar, HiPlus, HiX, HiCheckCircle,
  HiExclamationCircle, HiTrash, HiPencil, HiChevronDown, HiSparkles,
} from "react-icons/hi";
import {
  FaFlag, FaSun, FaPalette, FaTree, FaChampagneGlasses,
  FaMoon, FaCross, FaWrench, FaCrown, FaOm, FaHandsPraying
} from "react-icons/fa6";

const HOLIDAY_TYPES = [
  { value: "public", label: "National Holiday", color: "bg-rose-50 text-rose-700" },
  { value: "optional", label: "Optional Holiday", color: "bg-amber-50 text-amber-700" },
  { value: "restricted", label: "Restricted Holiday", color: "bg-slate-100 text-slate-600" },
];

function typeLabel(val) {
  return HOLIDAY_TYPES.find((t) => t.value === val)?.label || val;
}
function typeColor(val) {
  return HOLIDAY_TYPES.find((t) => t.value === val)?.color || "bg-slate-100 text-slate-600";
}
function dayOfWeek(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });
}
function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getHolidayIconInfo(name) {
  const n = (name || "").toLowerCase();
  const purpleTheme = "text-[#6D28D9] bg-purple-50 group-hover:bg-purple-100 transition-colors";
  if (n.includes("independence") || n.includes("republic")) return { Icon: FaFlag, color: purpleTheme };
  if (n.includes("diwali")) return { Icon: FaSun, color: purpleTheme };
  if (n.includes("holi")) return { Icon: FaPalette, color: purpleTheme };
  if (n.includes("christmas")) return { Icon: FaTree, color: purpleTheme };
  if (n.includes("new year")) return { Icon: FaChampagneGlasses, color: purpleTheme };
  if (n.includes("gandhi")) return { Icon: FaHandsPraying, color: purpleTheme };
  if (n.includes("eid")) return { Icon: FaMoon, color: purpleTheme };
  if (n.includes("dussehra")) return { Icon: FaCrown, color: purpleTheme };
  if (n.includes("good friday")) return { Icon: FaCross, color: purpleTheme };
  if (n.includes("shivratri")) return { Icon: FaOm, color: purpleTheme };
  if (n.includes("guru nanak")) return { Icon: FaSun, color: purpleTheme };
  if (n.includes("labour") || n.includes("may day")) return { Icon: FaWrench, color: purpleTheme };
  return { Icon: HiCalendar, color: purpleTheme };
}

function getPresetHolidays(y) {
  // Only the 3 constitutionally gazetted National Holidays of India
  const fixed = [
    { name: "Republic Day", date: `${y}-01-26`, type: "public" },
    { name: "Independence Day", date: `${y}-08-15`, type: "public" },
    { name: "Gandhi Jayanti", date: `${y}-10-02`, type: "public" },
  ];

  // All other holidays are optional / restricted — dates vary by year
  const variableByYear = {
    2025: [
      { name: "New Year's Day", date: "2025-01-01", type: "optional" },
      { name: "Maha Shivratri", date: "2025-02-26", type: "optional" },
      { name: "Holi", date: "2025-03-14", type: "optional" },
      { name: "Eid ul-Fitr", date: "2025-03-31", type: "optional" },
      { name: "Good Friday", date: "2025-04-18", type: "optional" },
      { name: "May Day / Labour Day", date: "2025-05-01", type: "optional" },
      { name: "Dussehra", date: "2025-10-02", type: "optional" },
      { name: "Diwali", date: "2025-10-20", type: "optional" },
      { name: "Guru Nanak Jayanti", date: "2025-11-05", type: "optional" },
      { name: "Christmas Day", date: "2025-12-25", type: "optional" },
    ],
    2026: [
      { name: "New Year's Day", date: "2026-01-01", type: "optional" },
      { name: "Maha Shivratri", date: "2026-02-15", type: "optional" },
      { name: "Holi", date: "2026-03-04", type: "optional" },
      { name: "Eid ul-Fitr", date: "2026-03-20", type: "optional" },
      { name: "Good Friday", date: "2026-04-03", type: "optional" },
      { name: "May Day / Labour Day", date: "2026-05-01", type: "optional" },
      { name: "Dussehra", date: "2026-10-20", type: "optional" },
      { name: "Diwali", date: "2026-11-08", type: "optional" },
      { name: "Guru Nanak Jayanti", date: "2026-11-24", type: "optional" },
      { name: "Christmas Day", date: "2026-12-25", type: "optional" },
    ],
    2027: [
      { name: "New Year's Day", date: "2027-01-01", type: "optional" },
      { name: "Holi", date: "2027-03-22", type: "optional" },
      { name: "Eid ul-Fitr", date: "2027-03-10", type: "optional" },
      { name: "Good Friday", date: "2027-03-26", type: "optional" },
      { name: "May Day / Labour Day", date: "2027-05-01", type: "optional" },
      { name: "Dussehra", date: "2027-10-09", type: "optional" },
      { name: "Diwali", date: "2027-10-29", type: "optional" },
      { name: "Christmas Day", date: "2027-12-25", type: "optional" },
    ],
  };

  const dynamicList = variableByYear[y] || [];
  const combined = [...fixed];
  for (const item of dynamicList) {
    if (!combined.some((c) => c.date === item.date || c.name.toLowerCase() === item.name.toLowerCase())) {
      combined.push(item);
    }
  }

  return combined.sort((a, b) => new Date(a.date) - new Date(b.date));
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

/* ─── Holiday Modal (Create / Edit) ──────────────────────────────────────── */
function HolidayModal({ editHoliday, onClose, onSaved }) {
  const isEdit = !!editHoliday;
  const [form, setForm] = useState({
    name: editHoliday?.name || "",
    date: editHoliday?.date || "",
    type: editHoliday?.type || "public",
    target_locations: editHoliday?.target_locations || [],
    target_departments: editHoliday?.target_departments || [],
    target_employment_types: editHoliday?.target_employment_types || [],
    target_job_statuses: editHoliday?.target_job_statuses || [],
    included_users: editHoliday?.included_users || [],
    excluded_users: editHoliday?.excluded_users || [],
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.date) { setError("Please provide both holiday name and date."); return; }
    setLoading(true); setError("");
    try {
      const payload = {
        name: form.name,
        type: form.type,
        target_locations: form.target_locations,
        target_departments: form.target_departments,
        target_employment_types: form.target_employment_types,
        target_job_statuses: form.target_job_statuses,
        included_users: form.included_users,
        excluded_users: form.excluded_users,
      };
      // Only include date if we are creating or if we want to update it
      if (!isEdit || form.date) {
        payload.date = new Date(form.date + "T00:00:00Z").toISOString();
      }

      if (isEdit) {
        await attendanceAPI.updateHoliday(editHoliday.id, payload);
        onSaved("Holiday updated successfully.");
      } else {
        await attendanceAPI.createHoliday(payload);
        onSaved("Holiday added successfully.");
      }
    } catch (err) {
      if (err.status === 409) {
        setError("A holiday already exists on this date.");
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isEdit ? "Edit Holiday" : "Add Holiday"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? "Update this holiday's details." : "Add a day off to your company's holiday list."}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Holiday Name <span className="text-red-400">*</span></label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Diwali"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white shadow-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date <span className="text-red-400">*</span></label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white shadow-xs" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Type of Holiday</label>
            <div className="grid grid-cols-3 gap-2">
              {HOLIDAY_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => set("type", t.value)}
                  className={`py-2 px-3 rounded-xl border-2 text-xs font-semibold text-center transition ${
                    form.type === t.value ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          
          <hr className="border-slate-100 my-4" />
          <h3 className="text-sm font-bold text-slate-800">Targeting Rules</h3>
          <p className="text-xs text-slate-500 mb-4">Leave empty to apply to the entire organization.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelectDropdown
              label="Applicable Locations"
              placeholder="All Locations"
              options={locations.map(l => ({ value: l.id, label: l.name }))}
              value={form.target_locations}
              onChange={v => set("target_locations", v)}
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
              label="Employment Types"
              placeholder="All Types"
              options={[{value:"Full-time", label:"Full-time"}, {value:"Part-time", label:"Part-time"}, {value:"Contract", label:"Contract"}]}
              value={form.target_employment_types}
              onChange={v => set("target_employment_types", v)}
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
              label="Force Include Employees"
              placeholder="None"
              options={employees.map(e => ({ value: e.user_id || e.id, label: e.name || e.full_name, subtitle: e.employee_code, avatarIdentifier: e.email || e.name }))}
              value={form.included_users}
              onChange={v => set("included_users", v)}
            />
            <MultiSelectDropdown
              label="Force Exclude Employees"
              placeholder="None"
              options={employees.map(e => ({ value: e.user_id || e.id, label: e.name || e.full_name, subtitle: e.employee_code, avatarIdentifier: e.email || e.name }))}
              value={form.excluded_users}
              onChange={v => set("excluded_users", v)}
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading ? "Saving…" : isEdit ? "Update Holiday" : "Add Holiday"}
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
export default function AttendanceHolidaysPage() {
  const [holidays, setHolidays] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | holiday object
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [isNationalOpen, setIsNationalOpen] = useState(false);
  const [isTableOpen, setIsTableOpen] = useState(true);
  const [importingHoliday, setImportingHoliday] = useState(null);

  const presetList = getPresetHolidays(year);

  function isHolidayAdded(preset) {
    return holidays.some((h) => {
      const hDate = h.date ? h.date.split("T")[0] : "";
      return hDate === preset.date || h.name.toLowerCase() === preset.name.toLowerCase();
    });
  }

  async function handleAddPresetHoliday(preset) {
    setImportingHoliday(preset.name);
    try {
      const payload = {
        name: preset.name,
        type: preset.type || "public",
        date: new Date(preset.date + "T00:00:00Z").toISOString(),
      };
      await attendanceAPI.createHoliday(payload);
      showToast(`Added "${preset.name}" to holiday calendar.`);
      load(year);
    } catch (err) {
      if (err.status === 409) {
        showToast(`Holiday "${preset.name}" already exists on this date.`, "error");
      } else {
        showToast(err.message || `Failed to add ${preset.name}`, "error");
      }
    } finally {
      setImportingHoliday(null);
    }
  }

  async function handleAddAllPresets() {
    const existingDates = new Set(holidays.map((h) => (h.date ? h.date.split("T")[0] : "")));
    const existingNames = new Set(holidays.map((h) => h.name.toLowerCase()));

    const toAdd = presetList.filter(
      (p) => !existingDates.has(p.date) && !existingNames.has(p.name.toLowerCase())
    );

    if (toAdd.length === 0) {
      showToast("All national holidays are already added for this year!");
      return;
    }

    setImportingHoliday("ALL");
    let addedCount = 0;
    for (const preset of toAdd) {
      try {
        await attendanceAPI.createHoliday({
          name: preset.name,
          type: preset.type || "public",
          date: new Date(preset.date + "T00:00:00Z").toISOString(),
        });
        addedCount++;
      } catch {
        // Ignore conflicts
      }
    }
    setImportingHoliday(null);
    showToast(`Added ${addedCount} national holiday(s) to calendar.`);
    load(year);
  }

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async (y) => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getHolidays(y);
      setHolidays(res.data || []);
    } catch {
      showToast("Failed to load holidays.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  async function handleDelete(h) {
    if (!window.confirm(`Remove "${h.name}" from the holiday calendar?`)) return;
    setDeleting(h.id);
    try {
      await attendanceAPI.deleteHoliday(h.id);
      showToast("Holiday removed.");
      load(year);
    } catch (err) {
      showToast(err.message || "Failed to delete.", "error");
    } finally {
      setDeleting(null);
    }
  }

  function onSaved(msg) {
    setModal(null);
    showToast(msg);
    load(year);
  }

  const yearOptions = [year - 1, year, year + 1];

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <HiCalendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Holiday Calendar</h1>
                <p className="text-xs text-slate-400 mt-0.5">Manage your organisation's holiday calendar.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Year Selector */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
                {yearOptions.map((y) => (
                  <button key={y} onClick={() => setYear(y)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      year === y ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}>
                    {y}
                  </button>
                ))}
              </div>
              <button onClick={() => setModal("create")}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition cursor-pointer">
                <HiPlus className="w-4 h-4" /> Add Holiday
              </button>
            </div>
          </div>

          {/* Collapsible National Holidays Catalog */}
          <div className="mb-6 border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
            <button
              type="button"
              onClick={() => setIsNationalOpen(!isNationalOpen)}
              className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <HiSparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Common Holidays Catalog ({year})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Quickly view and import public holidays (26 Jan, 15 Aug, 2 Oct) and optional holidays (Diwali, Holi, Eid, etc.)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-100">
                  {presetList.filter(p => isHolidayAdded(p)).length} / {presetList.length} Added
                </span>
                <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${isNationalOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isNationalOpen && (
              <div className="p-6 border-t border-slate-100 space-y-4 bg-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Standard National Calendar</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Select individual holidays or import all standard national holidays at once.</p>
                  </div>
                  <button
                    onClick={handleAddAllPresets}
                    disabled={importingHoliday === "ALL"}
                    className="px-4 py-2 bg-[#6D28D9] hover:bg-purple-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <HiSparkles className="w-3.5 h-3.5" />
                    {importingHoliday === "ALL" ? "Adding All..." : "Add All to Calendar"}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {presetList.map((preset) => {
                    const added = isHolidayAdded(preset);
                    const isLoadingThis = importingHoliday === preset.name;
                    const { Icon: HolidayIcon, color } = getHolidayIconInfo(preset.name);
                    return (
                      <div
                        key={preset.name + preset.date}
                        className={`group rounded-2xl border transition-all flex flex-col justify-between p-4 bg-white shadow-2xs hover:shadow-xs hover:-translate-y-0.5 ${
                          added
                            ? "border-slate-200 bg-slate-50/40 opacity-85"
                            : "border-slate-200/90 hover:border-purple-300"
                        }`}
                      >
                        {/* Top Header Row */}
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}>
                              <HolidayIcon className="w-4 h-4" />
                            </div>
                            {added ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                                <HiCheckCircle className="w-3 h-3 text-emerald-500" /> Added
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {typeLabel(preset.type)}
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-1 mt-3" title={preset.name}>
                            {preset.name}
                          </h4>
                          <p className="text-[11px] font-semibold text-slate-500 mt-1">
                            {fmtDate(preset.date)} <span className="text-slate-400 font-normal">• {dayOfWeek(preset.date)}</span>
                          </p>
                        </div>

                        {/* Action Button */}
                        {!added ? (
                          <button
                            onClick={() => handleAddPresetHoliday(preset)}
                            disabled={isLoadingThis || importingHoliday === "ALL"}
                            className="w-full mt-3 py-1.5 px-3 bg-slate-50 hover:bg-purple-600 text-slate-700 hover:text-white border border-slate-200 hover:border-purple-600 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer shrink-0"
                          >
                            <HiPlus className="w-3.5 h-3.5" />
                            {isLoadingThis ? "Adding..." : "Add to Calendar"}
                          </button>
                        ) : (
                          <div className="w-full mt-3 py-1.5 px-3 bg-slate-100/70 text-slate-400 text-[11px] font-semibold rounded-xl text-center shrink-0">
                            In Calendar
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Collapsible Header */}
            <button
              type="button"
              onClick={() => setIsTableOpen(o => !o)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <HiCalendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Holiday List ({year})</h3>
                  <p className="text-xs text-slate-400">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''} added</p>
                </div>
              </div>
              <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${isTableOpen ? "rotate-180" : ""}`} />
            </button>

          {isTableOpen && (
          <div className="border-t border-slate-100">
          {loading ? (
            <div className="p-6"><Skeleton type="table" rows={6} /></div>
          ) : (
            holidays.length === 0 ? (
              <div className="p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <HiCalendar className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No holidays for {year}</p>
                <p className="text-xs text-slate-400">Add holidays so the attendance engine knows non-working days.</p>
                <button onClick={() => setModal("create")}
                  className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                  <HiPlus className="w-4 h-4" /> Add Holiday
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Holiday Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Day</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Targeting</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">{h.name}</td>
                      <td className="px-6 py-4 text-xs text-slate-600">{fmtDate(h.date)}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{dayOfWeek(h.date)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${typeColor(h.type)}`}>
                          {typeLabel(h.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const targetingCount = (h.target_locations?.length || 0) + (h.target_departments?.length || 0) + (h.target_employment_types?.length || 0) + (h.target_job_statuses?.length || 0) + (h.included_users?.length || 0) + (h.excluded_users?.length || 0);
                          return targetingCount === 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Global</span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100 cursor-help" title={`Targeted to ${targetingCount} rule(s)`}>Targeted</span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setModal(h)}
                            className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Edit holiday">
                            <HiPencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(h)} disabled={deleting === h.id}
                            className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
                            <HiTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          </div>
          )}
          </div>
        </main>
      </div>

      {modal && (
        <HolidayModal
          editHoliday={modal === "create" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
