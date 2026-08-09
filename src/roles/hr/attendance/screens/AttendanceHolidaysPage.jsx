import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiCalendar, HiPlus, HiX, HiCheckCircle,
  HiExclamationCircle, HiTrash, HiPencil,
} from "react-icons/hi";

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
    // For edit, date comes as "YYYY-MM-DD" from API. For create, start blank.
    date: editHoliday?.date || "",
    type: editHoliday?.type || "public",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.date) { setError("Please provide both holiday name and date."); return; }
    setLoading(true); setError("");
    try {
      if (isEdit) {
        // Send only changed fields; date as ISO string
        await attendanceAPI.updateHoliday(editHoliday.id, {
          name: form.name,
          date: new Date(form.date + "T00:00:00").toISOString(),
          type: form.type,
        });
        onSaved("Holiday updated successfully.");
      } else {
        // Create: send name, date as ISO string, type — no extra year field
        await attendanceAPI.createHoliday({
          name: form.name,
          date: new Date(form.date + "T00:00:00").toISOString(),
          type: form.type,
        });
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
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
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Holiday Name <span className="text-red-400">*</span></label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Diwali"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date <span className="text-red-400">*</span></label>
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Type of Holiday</label>
            <div className="grid grid-cols-3 gap-2">
              {HOLIDAY_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => set("type", t.value)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-xs font-semibold text-center transition ${
                    form.type === t.value ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
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
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
                <HiPlus className="w-4 h-4" /> Add Holiday
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <Skeleton type="table" rows={6} />
          ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {holidays.length === 0 ? (
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
            )}
          </div>
          )}
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
