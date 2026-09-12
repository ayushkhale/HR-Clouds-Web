import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { leaveAPI, attendanceAPI } from "../../../shared/api";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import {
  HiCalendar, HiPlus, HiX, HiCheckCircle, HiExclamationCircle,
  HiInformationCircle, HiClock, HiXCircle, HiExternalLink, HiChevronDown
} from "react-icons/hi";

// Whether a leave's start date is today or already past. The backend decides
// cancellation behaviour by DATE, not status: a leave entirely in the future is
// cancelled + refunded instantly; one that has started (today or earlier) needs
// manager approval and enters `cancellation_pending`.
function hasLeaveStarted(startDateStr) {
  if (!startDateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Force local-midnight parse so a "YYYY-MM-DD" string isn't shifted by TZ.
  const start = new Date(`${String(startDateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime())) return false;
  return start <= today;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  const info = toast.type === "info";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : info ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : info ? <HiInformationCircle className="w-5 h-5 text-blue-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

// ─── Cancel Confirm Modal ─────────────────────────────────────────────────────
function CancelConfirmModal({ request, onClose, onConfirm }) {
  const needsApproval = hasLeaveStarted(request.start_date);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Cancel Leave?</h2>
          <p className="text-xs text-slate-400 mt-1.5">
            {needsApproval
              ? "This leave has already started (or is today). Cancelling submits a cancellation request — your manager must approve it before the balance is refunded."
              : "This leave is in the future, so it will be cancelled immediately and the balance refunded to your account."}
          </p>
        </div>
        <div className="p-6 flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
          >
            {needsApproval ? "Request Cancellation" : "Yes, Cancel Leave"}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            Keep It
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending: "bg-purple-50 text-purple-600",
    approved: "bg-purple-100 text-purple-800",
    rejected: "bg-slate-100 text-slate-500",
    cancelled: "bg-slate-50 text-slate-400 border border-slate-100",
    cancellation_pending: "bg-amber-50 text-amber-700 border border-amber-200",
    terminated_cancelled: "bg-slate-100 text-slate-500 border border-slate-200",
  };
  const cls = map[status] || "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${cls}`}>
      {status?.replace(/_/g, " ") || "—"}
    </span>
  );
}

// ─── Leave Request Detail Modal ───────────────────────────────────────────────
function LeaveRequestDetailModal({ requestId, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await leaveAPI.getLeaveRequest(requestId);
        setDetails(res.data);
      } catch (err) {
        setError(err.message || "Failed to load leave details.");
      } finally {
        setLoading(false);
      }
    }
    if (requestId) load();
  }, [requestId]);

  if (!requestId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-slate-800">Leave Request Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : details ? (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{details.leave_type?.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(details.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {details.start_date !== details.end_date && ` → ${new Date(details.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <StatusBadge status={details.status} />
              </div>

              {/* Days breakdown */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-2xl font-extrabold text-slate-900">{parseFloat(details.total_days).toFixed(1)}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Total</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-2xl font-extrabold text-emerald-700">{parseFloat(details.paid_days || 0).toFixed(1)}</p>
                  <p className="text-[10px] uppercase font-bold text-emerald-500 mt-1">Paid</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-4">
                  <p className="text-2xl font-extrabold text-rose-600">{parseFloat(details.unpaid_days || 0).toFixed(1)}</p>
                  <p className="text-[10px] uppercase font-bold text-rose-400 mt-1">LWP</p>
                </div>
              </div>

              {/* Reason */}
              {details.reason && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Reason</p>
                  <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">{details.reason}</p>
                </div>
              )}

              {/* Rejection */}
              {details.rejection_reason && (
                <div>
                  <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-2">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 p-4 rounded-xl border border-red-100">{details.rejection_reason}</p>
                </div>
              )}

              {/* Document */}
              {details.document_url && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Attachment</p>
                  <a href={details.document_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 bg-purple-50 px-4 py-2 rounded-xl font-semibold transition">
                    <HiExternalLink className="w-4 h-4" /> View Document
                  </a>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Balance Cards ────────────────────────────────────────────────────────────
function BalanceCards({ balances }) {
  if (balances.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xs p-10 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center">
          <HiCalendar className="w-7 h-7 text-purple-400" />
        </div>
        <p className="text-sm font-semibold text-slate-600">No leave balances found</p>
        <p className="text-xs text-slate-400">Contact your HR to assign a leave policy to your account.</p>
      </div>
    );
  }

  function fmt(n) {
    const f = parseFloat(n);
    return Number.isInteger(f) ? `${f}` : f.toFixed(1);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {balances.map((b) => (
        <div key={b.id || b.leave_type_id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs flex flex-col justify-start">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 bg-purple-50">
              <HiCalendar className="w-5 h-5" />
            </div>
            <span className="font-mono text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded-full uppercase tracking-wider">
              {b.leave_type?.code}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-500 mb-1">{b.leave_type?.name || "Leave"}</p>
          <div className="flex items-end gap-1 mb-4">
             <span className="text-3xl font-black tracking-tight text-slate-800 leading-none">{fmt(parseFloat(b.current_balance))}</span>
             <span className="text-xs font-semibold text-slate-400 mb-1 tracking-normal">days left</span>
          </div>
          <div className="mt-auto pt-3 border-t border-slate-50 flex gap-4 text-[10px] uppercase font-bold text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>{fmt(parseFloat(b.total_accrued))} Earned</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400 opacity-50"></span>{fmt(parseFloat(b.total_used))} Used</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Upcoming Holidays Widget ─────────────────────────────────────────────────
function UpcomingHolidaysWidget({ holidays }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!holidays || holidays.length === 0) return null;
  
  function dayOfWeek(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });
  }
  
  function fmtDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden flex flex-col mt-8">
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <HiCalendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Upcoming Holidays</h3>
            <p className="text-xs text-slate-400 mt-0.5">Your organization's official non-working days.</p>
          </div>
        </div>
        <HiChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="overflow-x-auto p-4 sm:p-6 pt-0 border-t border-slate-50">
          <table className="w-full text-left border-separate border-spacing-y-2 mt-4">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-4 py-3 rounded-l-xl">Holiday Name</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3 rounded-r-xl">Type</th>
              </tr>
            </thead>
            <tbody className="text-xs font-semibold text-slate-700">
              {holidays.map((h, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">{h.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(h.date?.split('T')[0] || h.date)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{dayOfWeek(h.date?.split('T')[0] || h.date)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2.5 py-1 text-[10px] font-bold rounded-full capitalize bg-purple-50 text-purple-600">
                      {h.type || 'Public'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Apply Leave Drawer ───────────────────────────────────────────────────────
function ApplyLeaveDrawer({ leaveTypes, balances = [], requests = [], onClose, onSubmitted }) {
  const [form, setForm] = useState({
    leave_type_id: "",
    start_date: "",
    end_date: "",
    is_half_day: false,
    half_day_type: "first_half",
    reason: "",
    document_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [breakdown, setBreakdown] = useState(null);

  // Normalise the apply-form catalog (getMyLeaveTypes returns either a flat
  // leave type or { leave_type, ...config }).
  const typeOptions = useMemo(() => leaveTypes.map(item => {
    const lt = item.leave_type ? item.leave_type : item;
    const id = lt.id || lt._id || item.leave_type_id;
    return {
      id,
      name: lt.name,
      code: lt.code,
      requires_document_threshold: lt.requires_document_threshold ?? item.requires_document_threshold ?? 0,
    };
  }).filter(t => t.id && t.name), [leaveTypes]);

  // Current balance per leave type.
  const balanceByType = useMemo(() => {
    const m = {};
    balances.forEach(b => { if (b.leave_type_id) m[b.leave_type_id] = b; });
    return m;
  }, [balances]);

  // Phantom holds: pending requests already count against the effective balance.
  const pendingByType = useMemo(() => {
    const m = {};
    requests.forEach(r => {
      const id = r.leave_type_id || r.leave_type?.id;
      if (id && (r.status === "pending" || r.status === "cancellation_pending")) {
        m[id] = (m[id] || 0) + parseFloat(r.total_days || 0);
      }
    });
    return m;
  }, [requests]);

  const selectedType = typeOptions.find(t => t.id === form.leave_type_id) || null;
  const selectedBalance = selectedType ? balanceByType[selectedType.id] : null;
  const available = selectedBalance ? parseFloat(selectedBalance.current_balance) : null;
  const pendingHold = selectedType ? (pendingByType[selectedType.id] || 0) : 0;
  const effective = available !== null ? available - pendingHold : null;

  // Naive calendar-day span (backend computes the true deductible working days;
  // this is only a pre-submit hint for balance/document guidance).
  const spanDays = useMemo(() => {
    if (form.is_half_day) return 0.5;
    if (!form.start_date || !form.end_date) return 0;
    const s = new Date(`${form.start_date}T00:00:00`);
    const e = new Date(`${form.end_date}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e - s) / 86400000) + 1;
  }, [form.start_date, form.end_date, form.is_half_day]);

  const docThreshold = selectedType?.requires_document_threshold || 0;
  const docMayBeRequired = docThreshold > 0 && spanDays > docThreshold && !form.document_url.trim();
  const mayNeedLWP = effective !== null && spanDays > 0 && spanDays > effective;

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val };
      // Lock end_date to start_date when half-day is enabled
      if (key === "is_half_day" && val === true) {
        next.end_date = f.start_date;
      }
      // Keep end_date synced while is_half_day is on and start_date changes
      if (key === "start_date" && f.is_half_day) {
        next.end_date = val;
      }
      return next;
    });
    setError("");
    setBreakdown(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.leave_type_id) { setError("Please select a leave type."); return; }
    if (!form.start_date) { setError("Start date is required."); return; }
    if (!form.end_date) { setError("End date is required."); return; }
    if (form.is_half_day && form.start_date !== form.end_date) {
      setError("For a half-day leave, start and end date must be the same day.");
      return;
    }
    if (form.start_date && form.end_date && form.start_date.slice(0, 4) !== form.end_date.slice(0, 4)) {
      setError("Start and end dates must be within the same calendar year.");
      return;
    }
    setLoading(true); setError(""); setBreakdown(null);
    const payload = {
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      is_half_day: form.is_half_day,
    };
    if (form.is_half_day) payload.half_day_type = form.half_day_type;
    if (form.reason.trim()) payload.reason = form.reason.trim();
    if (form.document_url.trim()) payload.document_url = form.document_url.trim();
    try {
      const res = await leaveAPI.submitRequest(payload);
      setBreakdown(res.data);
    } catch (err) {
      setError(leaveErrorMessage(err, "Failed to submit request."));
    } finally {
      setLoading(false);
    }
  }

  if (breakdown) {
    const req = breakdown.leaveRequest;
    const bk = breakdown.breakdown || [];
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <HiCheckCircle className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Leave Request Submitted!</h2>
              <p className="text-xs text-slate-400 mt-0.5">Pending manager approval.</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-slate-900">{parseFloat(req.total_days).toFixed(1)}</p>
                <p className="text-xs text-slate-400 mt-1">total days</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-emerald-700">{parseFloat(req.paid_days || 0).toFixed(1)}</p>
                <p className="text-xs text-emerald-500 mt-1">paid days</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-rose-600">{parseFloat(req.unpaid_days || 0).toFixed(1)}</p>
                <p className="text-xs text-rose-400 mt-1">LWP days</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Day Breakdown</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {bk.map((d, i) => (
                  <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${d.is_working_day ? "bg-slate-50" : "bg-slate-50/40 text-slate-400"}`}>
                    <span className={d.is_working_day ? "font-medium text-slate-700" : "line-through"}>{d.date}</span>
                    <span className={`text-[10px] font-semibold ${d.is_working_day ? "text-emerald-600" : "text-slate-400"}`}>{d.reason || (d.is_working_day ? "Leave Day" : "Skipped")}</span>
                  </div>
                ))}
              </div>
            </div>
            {req.escalated_to_role && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                No direct manager found — your request was escalated to <strong>{req.escalated_to_role}</strong>.
              </div>
            )}
            <button onClick={() => { onSubmitted(); onClose(); }} className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-3 rounded-xl transition">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">Apply for Leave</h2>
            <p className="text-xs text-slate-400 mt-0.5">Holidays and weekends are automatically excluded.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Leave Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Leave Type <span className="text-red-400">*</span>
            </label>
            <select
              value={form.leave_type_id}
              onChange={e => set("leave_type_id", e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            >
              <option value="">Select a leave type...</option>
              {typeOptions.map(t => {
                const bal = balanceByType[t.id];
                const left = bal ? parseFloat(bal.current_balance) : null;
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.code ? ` (${t.code})` : ""}{left !== null ? ` — ${Number.isInteger(left) ? left : left.toFixed(1)} left` : ""}
                  </option>
                );
              })}
            </select>

            {/* Selected leave type: balance + phantom-hold decision support */}
            {selectedType && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                {available !== null ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-sm font-extrabold text-slate-800">{Number.isInteger(available) ? available : available.toFixed(1)}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Available</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-amber-600">{pendingHold ? (Number.isInteger(pendingHold) ? pendingHold : pendingHold.toFixed(1)) : "0"}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Pending hold</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-purple-700">{Number.isInteger(effective) ? effective : effective.toFixed(1)}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Effective</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No balance record for this leave type yet.</p>
                )}
                {mayNeedLWP && (
                  <p className="flex items-start gap-1.5 text-[11px] text-rose-600">
                    <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    This request may exceed your balance — the extra days will be unpaid (LWP). The exact split is confirmed after submit.
                  </p>
                )}
                {docMayBeRequired && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
                    <HiInformationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Leaves longer than {docThreshold} day{docThreshold > 1 ? "s" : ""} may require a supporting document — add a link below.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Start Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set("start_date", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                End Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set("end_date", e.target.value)}
                min={form.start_date}
                disabled={form.is_half_day}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </div>

          {/* Half Day Toggle */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Half-Day Leave</p>
              <p className="text-xs text-slate-400 mt-0.5">Deducts 0.5 days. Applies to a single day only.</p>
            </div>
            <button
              type="button"
              onClick={() => set("is_half_day", !form.is_half_day)}
              className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.is_half_day ? "bg-purple-600" : "bg-slate-200"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_half_day ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Half Day Type */}
          {form.is_half_day && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Which Half?</label>
              <div className="flex gap-3">
                {[{ val: "first_half", label: "First Half (Morning)" }, { val: "second_half", label: "Second Half (Afternoon)" }].map(opt => (
                  <label key={opt.val} className={`flex-1 flex items-center justify-center py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${form.half_day_type === opt.val ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                    <input type="radio" name="half_day_type" value={opt.val} checked={form.half_day_type === opt.val} onChange={() => set("half_day_type", opt.val)} className="sr-only" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reason (Optional)</label>
            <textarea
              value={form.reason}
              onChange={e => set("reason", e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Why are you applying for this leave?"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-1 text-right">{form.reason.length}/1000</p>
          </div>

          {/* Document URL */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Supporting Document{" "}
              <span className="normal-case font-normal text-slate-400">(may be required for longer leaves)</span>
            </label>
            <div className="relative">
              <HiExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="url"
                value={form.document_url}
                onChange={e => set("document_url", e.target.value)}
                placeholder="https://drive.google.com/file/..."
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Paste a link to your doctor's note, medical certificate, etc.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Submitting…" : "Submit Leave Request"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Requests Table ───────────────────────────────────────────────────────────
function RequestsTable({ requests, onView, onCancel, cancelling }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  // `cancellation_pending` is already awaiting manager approval — cancelling it
  // again would 400. Only pending and approved leaves are cancellable.
  const cancellable = ["pending", "approved"];

  // my-requests has no server-side filter, so search/status are client-side.
  const filtered = useMemo(() => {
    let list = requests;
    if (statusFilter) list = list.filter(r => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r =>
      (r.leave_type?.name || "").toLowerCase().includes(q) ||
      (r.reason || "").toLowerCase().includes(q)
    );
    return list;
  }, [requests, statusFilter, search]);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden flex flex-col mt-8">
      <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <HiCalendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">My Leave Requests</h3>
            <p className="text-xs text-slate-400 mt-0.5">Track your past and active leave applications.</p>
          </div>
        </div>
        {requests.length > 0 && (
          <div className="flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search type or reason…"
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="cancellation_pending">Cancellation Pending</option>
              <option value="terminated_cancelled">Terminated Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center">
            <HiClock className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No leave requests yet</p>
          <p className="text-xs text-slate-400">Your submitted leave requests will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">No matching requests</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing the search or status filter.</p>
        </div>
      ) : (
      <div className="overflow-x-auto p-4 sm:p-6 pt-0">
        <table className="w-full text-left border-separate border-spacing-y-2">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <th className="px-4 py-3 rounded-l-xl">Leave Type</th>
              <th className="px-4 py-3">Date Range</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Applied</th>
              <th className="px-4 py-3 rounded-r-xl" />
            </tr>
          </thead>
          <tbody className="text-xs font-semibold text-slate-700">
            {filtered.map(r => (
              <React.Fragment key={r.id}>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onView(r.id)} className="text-sm font-semibold text-purple-600 hover:text-purple-700 hover:underline text-left">
                        {r.leave_type?.name || "—"}
                      </button>
                      {r.is_half_day && (
                        <span className="text-[9px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
                          {r.half_day_type === "first_half" ? "1st Half" : "2nd Half"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-medium">
                    {fmtDate(r.start_date)}
                    {r.start_date !== r.end_date && <> → {fmtDate(r.end_date)}</>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-slate-800">{parseFloat(r.total_days).toFixed(1)}</span>
                    <span className="text-[10px] text-slate-400 ml-1">days</span>
                    {parseFloat(r.unpaid_days || 0) > 0 && (
                      <p className="text-[10px] mt-0.5">
                        <span className="text-purple-600 font-semibold">{parseFloat(r.paid_days || 0).toFixed(1)}p</span>
                        {" · "}
                        <span className="text-slate-400 font-semibold">{parseFloat(r.unpaid_days).toFixed(1)} LWP</span>
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-slate-400">{fmtDate(r.created_at || r.requested_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => onView(r.id)}
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-purple-600 border border-slate-200 hover:border-purple-200 px-3 py-1.5 rounded-lg transition"
                      >
                        <HiExternalLink className="w-3.5 h-3.5" /> View
                      </button>
                      {cancellable.includes(r.status) && (
                        <button
                          onClick={() => onCancel(r.id)}
                          disabled={cancelling === r.id}
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          <HiXCircle className="w-3.5 h-3.5" />
                          {cancelling === r.id ? "…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {r.status === "rejected" && r.rejection_reason && (
                  <tr>
                    <td colSpan={6} className="px-4 pb-3 pt-0">
                      <div className="flex items-start gap-2 text-[11px] text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5">
                        <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-500" />
                        <span><span className="font-bold uppercase tracking-wider text-[9px] mr-1">Rejection reason:</span> {r.rejection_reason}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function LeaveDashboard() {
  const [balances, setBalances] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [showApply, setShowApply] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [detailRequestId, setDetailRequestId] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const res = await leaveAPI.getMyBalances(year);
      setBalances(res.data || []);
    } catch { /* non-critical */ } finally {
      setBalancesLoading(false);
    }
  }, [year]);

  const loadRequests = useCallback(async () => {
    try {
      const res = await leaveAPI.getMyRequests();
      setRequests(res.data || []);
    } catch { /* non-critical */ }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const res = await attendanceAPI.getUpcomingHolidays();
      if (res.success) {
        setUpcomingHolidays(res.data || []);
      }
    } catch { /* non-critical */ }
  }, []);

  const loadLeaveTypes = useCallback(async () => {
    try {
      const res = await leaveAPI.getMyLeaveTypes();
      setLeaveTypes(res.data || []);
    } catch { /* non-critical */ }
  }, []);

  // Balances reload on their own when the year changes.
  useEffect(() => { loadBalances(); }, [loadBalances]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRequests(), loadHolidays(), loadLeaveTypes()]).finally(() => setLoading(false));
  }, [loadRequests, loadHolidays, loadLeaveTypes]);

  function handleCancelClick(id) {
    const req = requests.find(r => r.id === id);
    setCancelTarget(req || { id });
  }

  async function executeCancelRequest() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelTarget(null);
    setCancelling(id);
    try {
      const res = await leaveAPI.cancelRequest(id);
      const msg = res.message || "";
      if (msg.toLowerCase().includes("pending")) {
        showToast("Cancellation submitted — your manager needs to approve it since the date has already passed.", "info");
      } else {
        showToast("Leave cancelled successfully.");
      }
      await Promise.all([loadBalances(), loadRequests()]);
    } catch (err) {
      showToast(leaveErrorMessage(err, "Failed to cancel leave."), "error");
    } finally {
      setCancelling(null);
    }
  }

  function onLeaveSubmitted() {
    loadBalances();
    loadRequests();
  }

  return (
    <>
        <DashboardTopBar title="My Leaves" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8 space-y-8">

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                  <HiCalendar className="w-5 h-5" />
                </div>
                My Leave Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-1">View your leave balances and manage your requests.</p>
            </div>
            <button
              onClick={() => setShowApply(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition"
            >
              <HiPlus className="w-4 h-4" />
              Apply for Leave
            </button>
          </div>

          {/* Balance Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-700">Leave Balances</h2>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white"
                title="Balance year"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {balancesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
              </div>
            ) : (
              <BalanceCards balances={balances} />
            )}
          </div>

          {/* Requests Table */}
          {!loading && (
            <RequestsTable requests={requests} onView={setDetailRequestId} onCancel={handleCancelClick} cancelling={cancelling} />
          )}
          
          {/* Upcoming Holidays Widget */}
          {!loading && (
            <UpcomingHolidaysWidget holidays={upcomingHolidays} />
          )}
        </main>

      {/* Apply Modal */}
      {showApply && (
        <ApplyLeaveDrawer
          leaveTypes={leaveTypes.length > 0 ? leaveTypes : balances.map(b => ({ ...(b.leave_type || {}), id: b.leave_type_id })).filter(t => t.name)}
          balances={balances}
          requests={requests}
          onClose={() => setShowApply(false)}
          onSubmitted={onLeaveSubmitted}
        />
      )}

      {cancelTarget && (
        <CancelConfirmModal
          request={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={executeCancelRequest}
        />
      )}

      {detailRequestId && (
        <LeaveRequestDetailModal
          requestId={detailRequestId}
          onClose={() => setDetailRequestId(null)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
