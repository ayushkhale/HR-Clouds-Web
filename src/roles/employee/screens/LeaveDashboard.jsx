import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { leaveAPI } from "../../../shared/api";
import {
  HiCalendar, HiPlus, HiX, HiCheckCircle, HiExclamationCircle,
  HiInformationCircle, HiClock, HiXCircle, HiExternalLink,
} from "react-icons/hi";

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
  const isPast = request.status === "approved";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Cancel Leave?</h2>
          <p className="text-xs text-slate-400 mt-1.5">
            {isPast
              ? "This leave is already approved. Cancelling will submit a cancellation request — your manager must approve it before the balance is refunded."
              : "This will immediately cancel your leave request and refund the balance to your account."}
          </p>
        </div>
        <div className="p-6 flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
          >
            {isPast ? "Request Cancellation" : "Yes, Cancel Leave"}
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
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-600 border-red-200",
    cancelled: "bg-slate-100 text-slate-500 border-slate-200",
    cancellation_pending: "bg-orange-50 text-orange-700 border-orange-200",
  };
  const cls = map[status] || "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border capitalize ${cls}`}>
      {status?.replace(/_/g, " ") || "—"}
    </span>
  );
}

// ─── Balance Cards ────────────────────────────────────────────────────────────
const CARD_COLORS = [
  { bg: "from-purple-500 to-purple-700", light: "bg-purple-50 border-purple-100" },
  { bg: "from-blue-500 to-blue-700", light: "bg-blue-50 border-blue-100" },
  { bg: "from-emerald-500 to-emerald-700", light: "bg-emerald-50 border-emerald-100" },
  { bg: "from-amber-500 to-amber-600", light: "bg-amber-50 border-amber-100" },
  { bg: "from-rose-500 to-rose-700", light: "bg-rose-50 border-rose-100" },
  { bg: "from-cyan-500 to-cyan-700", light: "bg-cyan-50 border-cyan-100" },
];

function BalanceCards({ balances }) {
  if (balances.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
          <HiCalendar className="w-7 h-7 text-slate-400" />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {balances.map((b, i) => {
        const color = CARD_COLORS[i % CARD_COLORS.length];
        return (
          <div key={b.id || b.leave_type_id} className={`relative rounded-2xl overflow-hidden border ${color.light}`}>
            {/* Gradient strip */}
            <div className={`h-1.5 w-full bg-gradient-to-r ${color.bg}`} />
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex-1 truncate">
                  {b.leave_type?.name || "Leave"}
                </p>
                <span className="font-mono text-[10px] font-bold bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                  {b.leave_type?.code}
                </span>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 mb-0.5">{fmt(parseFloat(b.current_balance))}</p>
              <p className="text-xs text-slate-400">days remaining</p>
              <div className="mt-3 pt-3 border-t border-slate-200/60 flex gap-4 text-xs text-slate-400">
                <span className="font-medium">{fmt(parseFloat(b.total_accrued))} accrued</span>
                <span className="font-medium">{fmt(parseFloat(b.total_used))} used</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Apply Leave Drawer ───────────────────────────────────────────────────────
function ApplyLeaveDrawer({ balances, onClose, onSubmitted }) {
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
      setError(err.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  }

  if (breakdown) {
    const req = breakdown.leaveRequest;
    const bk = breakdown.breakdown || [];
    const workingDays = bk.filter(d => d.is_working_day);
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
              {balances.map(b => {
                const bal = parseFloat(b.current_balance);
                return (
                  <option key={b.leave_type_id} value={b.leave_type_id}>
                    {b.leave_type?.name} ({bal <= 0 ? "No balance" : `${bal % 1 === 0 ? bal : bal.toFixed(1)} days left`})
                  </option>
                );
              })}
            </select>
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
function RequestsTable({ requests, onCancel, cancelling }) {
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 flex flex-col items-center gap-2 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-1">
          <HiClock className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-600">No leave requests yet</p>
        <p className="text-xs text-slate-400">Your submitted leave requests will appear here.</p>
      </div>
    );
  }

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  const cancellable = ["pending", "approved", "cancellation_pending"];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800">My Leave Requests</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-50">
              <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Type</th>
              <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Range</th>
              <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Days</th>
              <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Applied</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {requests.map(r => (
              <React.Fragment key={r.id}>
                <tr className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{r.leave_type?.name || "—"}</span>
                      {r.is_half_day && (
                        <span className="text-[9px] font-bold bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">
                          {r.half_day_type === "first_half" ? "1st Half" : "2nd Half"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-600 font-medium">
                    {fmtDate(r.start_date)}
                    {r.start_date !== r.end_date && <> → {fmtDate(r.end_date)}</>}
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm font-bold text-slate-800">{parseFloat(r.total_days).toFixed(1)}</span>
                    <span className="text-xs text-slate-400 ml-1">days</span>
                    {parseFloat(r.unpaid_days || 0) > 0 && (
                      <p className="text-[10px] mt-0.5">
                        <span className="text-emerald-600 font-semibold">{parseFloat(r.paid_days || 0).toFixed(1)}p</span>
                        {" · "}
                        <span className="text-rose-500 font-semibold">{parseFloat(r.unpaid_days).toFixed(1)} LWP</span>
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-6 py-3 text-xs text-slate-400">{fmtDate(r.created_at || r.requested_at)}</td>
                  <td className="px-6 py-3">
                    {cancellable.includes(r.status) && (
                      <button
                        onClick={() => onCancel(r.id)}
                        disabled={cancelling === r.id}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        <HiXCircle className="w-3.5 h-3.5" />
                        {cancelling === r.id ? "…" : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
                {r.status === "rejected" && r.rejection_reason && (
                  <tr>
                    <td colSpan={6} className="px-6 pb-3 pt-0">
                      <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                        <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
                        <span><span className="font-semibold">Rejection reason:</span> {r.rejection_reason}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeaveDashboard() {
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  const loadBalances = useCallback(async () => {
    try {
      const res = await leaveAPI.getMyBalances();
      setBalances(res.data || []);
    } catch { /* non-critical */ }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await leaveAPI.getMyRequests();
      setRequests(res.data || []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadBalances(), loadRequests()]).finally(() => setLoading(false));
  }, [loadBalances, loadRequests]);

  function handleCancelClick(id) {
    const req = requests.find(r => r.id === id);
    setCancelTarget(req || { id, status: "pending" });
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
      showToast(err.message || "Failed to cancel leave.", "error");
    } finally {
      setCancelling(null);
    }
  }

  function onLeaveSubmitted() {
    loadBalances();
    loadRequests();
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="My Leaves" />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8 space-y-8">

          {/* Page Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Leave Dashboard</h1>
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
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
            </div>
          ) : (
            <BalanceCards balances={balances} />
          )}

          {/* Requests Table */}
          {!loading && (
            <RequestsTable requests={requests} onCancel={handleCancelClick} cancelling={cancelling} />
          )}
        </main>
      </div>

      {/* Apply Modal */}
      {showApply && (
        <ApplyLeaveDrawer
          balances={balances}
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

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
