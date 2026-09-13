// ─────────────────────────────────────────────────────────────────────────────
// RegularizationCard — "My Regularizations" list (U7), submit form (U6) and
// cancel action (U8). Data fetching/pagination is owned by the page.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { attendanceAPI } from "../../../shared/api";
import { attendanceErrorMessage } from "../../../shared/utils/attendanceErrors";
import { validateRegularization, hasErrors, REGULARIZATION_REASON_MAX } from "../../../shared/attendance/validation";
import { addDaysYMD, fmtDate, fmtDateTime, fmtTime, parseYMDLocal, todayYMD, toLocalYMD, ymdOnly } from "../../../shared/attendance/dates";
import { REGULARIZATION_FILTERS, WORK_MODES } from "../../../shared/attendance/enums";
import { entityId } from "../../../shared/attendance/normalize";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../../../shared/attendance/events";
import { EmptyState, ErrorState, FieldError, FilterTabs, InlineAlert, LoadingRows, Pagination, Spinner, StatusBadge, Toast, useToast } from "../../../shared/attendance/ui";
import { HiPencilAlt, HiPlus, HiX } from "react-icons/hi";

const inputClass = (invalid) =>
  `w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all ${invalid ? "border-rose-300" : "border-slate-200"}`;

/** Requested instant as a time, with "+1 day" when it falls after the request date. */
function RequestedTime({ iso, date }) {
  if (!iso) return <span className="text-slate-400">—</span>;
  const nextDay = date && toLocalYMD(iso) > ymdOnly(date);
  return (
    <span>
      {fmtTime(iso)}
      {nextDay && <span className="ml-1 text-[10px] font-bold text-indigo-500">+1 day</span>}
    </span>
  );
}

function RegularizationFormModal({ initialDate, onClose, onSubmitted }) {
  const maxDate = addDaysYMD(todayYMD(), -1);
  const validInitial = initialDate && parseYMDLocal(initialDate) && initialDate <= maxDate ? initialDate : "";
  const [form, setForm] = useState({ date: validInitial, clockIn: "", clockOut: "", outNextDay: false, reason: "", work_mode: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, times: key === "clockIn" || key === "clockOut" ? undefined : e.times }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const { errors: v, payload } = validateRegularization(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSubmitting(true);
    setError("");
    try {
      await attendanceAPI.submitRegularization(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.REGULARIZATION, { action: "submit" });
      onSubmitted();
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't submit your request."));
    } finally {
      setSubmitting(false);
    }
  }

  const showNextDay = !!form.clockOut && (!form.clockIn || form.clockOut <= form.clockIn || form.outNextDay);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}>
      <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="reg-title">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 id="reg-title" className="font-bold text-lg text-slate-800">Request a correction</h3>
            <p className="text-xs text-slate-500">Your manager reviews it before your attendance changes.</p>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors" onClick={onClose} disabled={submitting} aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}
          <div>
            <label htmlFor="reg-date" className="block text-sm font-semibold text-slate-700 mb-1.5">Date *</label>
            <input id="reg-date" type="date" max={maxDate} className={inputClass(!!errors.date)} value={form.date} onChange={(e) => set("date", e.target.value)} />
            {errors.date ? <FieldError message={errors.date} /> : <p className="text-[11px] text-slate-400 mt-1">Only past dates within your policy's correction window can be requested.</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-in" className="block text-sm font-semibold text-slate-700 mb-1.5">Clock in</label>
              <input id="reg-in" type="time" className={inputClass(!!(errors.clockIn || errors.times))} value={form.clockIn} onChange={(e) => set("clockIn", e.target.value)} />
              <FieldError message={errors.clockIn} />
            </div>
            <div>
              <label htmlFor="reg-out" className="block text-sm font-semibold text-slate-700 mb-1.5">Clock out</label>
              <input id="reg-out" type="time" className={inputClass(!!(errors.clockOut || errors.times))} value={form.clockOut} onChange={(e) => set("clockOut", e.target.value)} />
            </div>
          </div>
          {showNextDay && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={form.outNextDay} onChange={(e) => set("outNextDay", e.target.checked)} className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
              Clock-out was the next day (overnight shift)
            </label>
          )}
          <FieldError message={errors.times || errors.clockOut} />
          <div>
            <label htmlFor="reg-mode" className="block text-sm font-semibold text-slate-700 mb-1.5">Worked from <span className="font-normal text-slate-400">(optional)</span></label>
            <select id="reg-mode" className={`${inputClass(!!errors.work_mode)} bg-white`} value={form.work_mode} onChange={(e) => set("work_mode", e.target.value)}>
              <option value="">Keep as recorded</option>
              {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {errors.work_mode ? <FieldError message={errors.work_mode} /> : <p className="text-[11px] text-slate-400 mt-1">Applied to the day if the correction is approved.</p>}
          </div>
          <div>
            <label htmlFor="reg-reason" className="block text-sm font-semibold text-slate-700 mb-1.5">Reason *</label>
            <textarea id="reg-reason" rows={3} maxLength={REGULARIZATION_REASON_MAX} placeholder="e.g. Forgot to clock out after the client meeting" className={`${inputClass(!!errors.reason)} resize-none`} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
            <div className="flex justify-between">
              <FieldError message={errors.reason} />
              <span className="text-[10px] text-slate-400 tabular-nums ml-auto mt-1">{form.reason.length}/{REGULARIZATION_REASON_MAX}</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button type="button" className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-colors disabled:opacity-70" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RegularizationCard({ list, statusFilter, onStatusChange, initialDate, onPrefillConsumed }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  // Status is filtered client-side on the loaded page (the server ignores it).
  const visible = statusFilter === "all"
    ? list.items
    : list.items.filter((r) => String(r.status || "pending").toLowerCase() === statusFilter);
  const filterLabel = REGULARIZATION_FILTERS.find((f) => f.value === statusFilter)?.label.toLowerCase() || statusFilter;

  // Deep link from history / daily log: /regularizations?date=YYYY-MM-DD
  useEffect(() => {
    if (!initialDate) return;
    setPrefill(initialDate);
    setIsModalOpen(true);
    onPrefillConsumed?.();
  }, [initialDate, onPrefillConsumed]);

  const handleCancel = async (req) => {
    const id = entityId(req);
    if (!id || cancelling) return;
    if (!(await window.confirm(`Withdraw your correction request for ${fmtDate(ymdOnly(req.date))}?`))) return;
    setCancelling(id);
    try {
      await attendanceAPI.cancelRegularization(id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.REGULARIZATION, { action: "cancel" });
      showToast("Request withdrawn.");
      list.reload();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't withdraw the request."), "error");
      list.reload();
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-8 shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <HiPencilAlt className="text-purple-600" /> My requests
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <FilterTabs options={REGULARIZATION_FILTERS} value={statusFilter} onChange={onStatusChange} />
          <button type="button" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm" onClick={() => { setPrefill(""); setIsModalOpen(true); }}>
            <HiPlus /> New request
          </button>
        </div>
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn't load your requests." />
      ) : list.loading && list.items.length === 0 ? (
        <LoadingRows rows={4} />
      ) : visible.length === 0 ? (
        <>
          <EmptyState
            icon={HiPencilAlt}
            title="No requests"
            message={list.items.length === 0 ? "Missed a punch? Request a correction and your manager will review it." : `No ${filterLabel} requests on this page.`}
          />
          {list.items.length > 0 && <Pagination className="mt-4" page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} />}
        </>
      ) : (
        <>
          {statusFilter !== "all" && list.totalPages > 1 && (
            <p className="text-[11px] text-slate-400 mb-2">Showing {filterLabel} requests from this page of results.</p>
          )}
          <div className={`overflow-x-auto rounded-xl border border-slate-100 ${list.loading ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm min-w-[860px]">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Clock in</th>
                  <th className="px-5 py-3.5">Clock out</th>
                  <th className="px-5 py-3.5">Reason</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Submitted</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visible.map((req) => {
                  const id = entityId(req);
                  const remarks = req.remarks || req.manager_remarks || req.review_remarks;
                  return (
                    <tr key={id || `${req.date}-${req.created_at}`} className="hover:bg-slate-50/80 transition-colors align-top">
                      <td className="px-5 py-3.5 font-semibold whitespace-nowrap">{fmtDate(ymdOnly(req.date))}</td>
                      <td className="px-5 py-3.5"><RequestedTime iso={req.requested_clock_in} date={req.date} /></td>
                      <td className="px-5 py-3.5"><RequestedTime iso={req.requested_clock_out} date={req.date} /></td>
                      <td className="px-5 py-3.5 max-w-[240px]">
                        <p className="truncate" title={req.reason}>{req.reason}</p>
                        {remarks && <p className="text-[11px] text-slate-400 truncate mt-0.5" title={remarks}>Reviewer: {remarks}</p>}
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge kind="regularization" status={req.status || "pending"} /></td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(req.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {(req.status || "pending").toLowerCase() === "pending" && id && (
                          <button type="button" onClick={() => handleCancel(req)} disabled={!!cancelling} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                            {cancelling === id && <Spinner className="w-3 h-3" />} Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-4" page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} />
        </>
      )}

      {isModalOpen && (
        <RegularizationFormModal
          initialDate={prefill}
          onClose={() => setIsModalOpen(false)}
          onSubmitted={() => {
            setIsModalOpen(false);
            showToast("Request submitted for approval.");
            if (statusFilter !== "all" && statusFilter !== "pending") onStatusChange("pending");
            list.reload();
          }}
        />
      )}
      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

export default RegularizationCard;
