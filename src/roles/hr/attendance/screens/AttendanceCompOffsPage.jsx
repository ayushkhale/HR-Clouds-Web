import React, { useEffect, useMemo, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import { COMP_OFF_FILTERS } from "../../../../shared/attendance/enums";
import { employeeCode, entityId, initials, personName } from "../../../../shared/attendance/normalize";
import { fmtDate, fmtHours, ymdOnly } from "../../../../shared/attendance/dates";
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from "../../../../shared/attendance/events";
import DecisionDialog from "../../../../shared/attendance/DecisionDialog";
import { DecisionDetails } from "../../../../shared/attendance/AttendanceApprovalQueue";
import { EmptyState, ErrorState, FilterTabs, InlineAlert, LoadingRows, Pagination, Spinner, StatusBadge, Toast, useToast } from "../../../../shared/attendance/ui";
import { HiCheckCircle, HiGift } from "react-icons/hi";

const TERM = DICTIONARY.TERMS.COMP_OFF;
const workedDate = (r) => ymdOnly(r.earned_date || r.worked_date || r.date);
const creditDays = (r) => r.days_earned ?? r.credit_days ?? r.days ?? null;
const expiryDate = (r) => ymdOnly(r.expiry_date || r.expires_on || r.valid_until);

const HR_ACTIONS = [
  { key: "reject", label: "Reject", tone: "rose", requireRemarks: true },
  { key: "approve", label: "Approve (override)", tone: "emerald" },
];

function AttendanceCompOffsPage() {
  const [status, setStatus] = useState("earned");
  const [selected, setSelected] = useState([]);
  const [decision, setDecision] = useState(null);
  const [bulk, setBulk] = useState(null); // { done, total, failures: [] }
  const { toast, showToast, clearToast } = useToast();

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getCompOffs({ status: status || undefined, page, limit }),
    { limit: 25, keys: ["comp_offs", "compOffs", "records"], filterKey: status }
  );
  useAttendanceChanged([ATTENDANCE_EVENTS.COMPOFF], list.reload);

  // Selection only makes sense for the rows currently visible.
  useEffect(() => { setSelected([]); }, [status, list.page]);

  const actionable = status === "earned";
  const visibleIds = useMemo(() => list.items.map(entityId).filter(Boolean), [list.items]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setSelected(allSelected ? [] : visibleIds);

  const handleDecision = async (action, remarks) => {
    const id = entityId(decision);
    if (action === "approve") await attendanceAPI.approveCompOff(id, { remarks });
    else await attendanceAPI.rejectCompOff(id, { remarks });
    setDecision(null);
    emitAttendanceChanged(ATTENDANCE_EVENTS.COMPOFF, { action, id, scope: "hr" });
    // Reject writes `cancelled` (contract §2 C11) — tell HR where the item went.
    showToast(action === "approve" ? `${TERM} approved and credited to leave.` : `${TERM} rejected — it's now listed under Rejected / cancelled.`);
  };

  const handleBulkApprove = async () => {
    if (bulk || selected.length === 0) return;
    const rows = list.items.filter((r) => selected.includes(entityId(r)));
    if (!(await window.confirm(`Approve ${rows.length} ${TERM.toLowerCase()}${rows.length === 1 ? "" : "s"} as an HR override? Each approval credits the employee's leave balance.`))) return;

    const failures = [];
    setBulk({ done: 0, total: rows.length, failures });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await attendanceAPI.approveCompOff(entityId(row));
      } catch (err) {
        failures.push({ name: personName(row, "Employee"), message: attendanceErrorMessage(err, "Failed") });
      }
      setBulk({ done: i + 1, total: rows.length, failures: [...failures] });
    }
    const approved = rows.length - failures.length;
    if (approved > 0) emitAttendanceChanged(ATTENDANCE_EVENTS.COMPOFF, { action: "bulk_approve", scope: "hr" });
    setSelected([]);
    setBulk(null);
    if (failures.length === 0) showToast(`${approved} ${TERM.toLowerCase()}${approved === 1 ? "" : "s"} approved.`);
    else showToast(`${approved} approved, ${failures.length} failed: ${failures.map((f) => `${f.name} (${f.message})`).join("; ")}`, "error");
    // The COMPOFF event already reloads this list when anything was approved.
    if (approved === 0) list.reload();
  };

  const tabs = COMP_OFF_FILTERS.filter((t) => t.value !== "").concat([{ value: "", label: "All" }]);

  return (
    <>
      <DashboardTopBar title={`${TERM}s`} />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{TERM}s</h1>
          <p className="text-sm text-slate-500 mt-1">Organisation-wide compensatory days. HR can approve or reject earned credits as an override of the manager step.</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <FilterTabs options={tabs} value={status} onChange={setStatus} />
            {actionable && selected.length > 0 && (
              <button type="button" onClick={handleBulkApprove} disabled={!!bulk} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-60">
                {bulk ? <><Spinner /> Approving {bulk.done}/{bulk.total}…</> : <><HiCheckCircle className="w-4 h-4" /> Approve {selected.length} selected</>}
              </button>
            )}
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback={`Couldn't load ${TERM.toLowerCase()}s.`} />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-6"><LoadingRows rows={5} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState icon={HiGift} title="Nothing here" message={`No ${status ? `${status} ` : ""}${TERM.toLowerCase()}s found.`} />
          ) : (
            <>
              <div className={`overflow-x-auto ${list.loading ? "opacity-60" : ""}`}>
                <table className="w-full text-left text-sm min-w-[860px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      {actionable && (
                        <th className="px-4 py-3.5 w-10">
                          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-purple-600" aria-label="Select all on this page" />
                        </th>
                      )}
                      <th className="px-5 py-3.5">Employee</th>
                      <th className="px-5 py-3.5">Worked on</th>
                      <th className="px-5 py-3.5">Hours</th>
                      <th className="px-5 py-3.5">Credit</th>
                      <th className="px-5 py-3.5">Expires</th>
                      <th className="px-5 py-3.5">Status</th>
                      {actionable && <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {list.items.map((co) => {
                      const id = entityId(co);
                      const name = personName(co, "Employee");
                      const code = employeeCode(co);
                      return (
                        <tr key={id} className="hover:bg-slate-50/80 transition-colors">
                          {actionable && (
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} disabled={!!bulk} className="accent-purple-600" aria-label={`Select ${name}`} />
                            </td>
                          )}
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">{initials(name)}</div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
                                {code && <p className="text-[10px] text-slate-400">{code}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs whitespace-nowrap">{fmtDate(workedDate(co))}</td>
                          <td className="px-5 py-3 text-xs">{co.worked_hours != null ? fmtHours(co.worked_hours) : "—"}</td>
                          <td className="px-5 py-3 text-xs font-bold text-emerald-600">{creditDays(co) != null ? `${creditDays(co)} day(s)` : "—"}</td>
                          <td className="px-5 py-3 text-xs">{expiryDate(co) ? fmtDate(expiryDate(co)) : "—"}</td>
                          <td className="px-5 py-3"><StatusBadge kind="compoff" status={co.status} /></td>
                          {actionable && (
                            <td className="px-5 py-3 text-right">
                              <button type="button" onClick={() => setDecision(co)} disabled={!!bulk} className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3.5 py-1.5 rounded-lg transition disabled:opacity-50">
                                Review
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t border-slate-100">
                <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading || !!bulk} />
              </div>
            </>
          )}
        </div>
      </main>

      <DecisionDialog
        open={!!decision}
        entityKey={decision ? entityId(decision) : undefined}
        title={`HR override · ${TERM}`}
        subtitle={decision ? personName(decision, "Employee") : ""}
        actions={HR_ACTIONS}
        notice={<InlineAlert tone="amber">This decision bypasses the manager step. Approving credits the {TERM.toLowerCase()} to the employee's leave balance; rejecting moves it to Rejected / cancelled.</InlineAlert>}
        onSubmit={handleDecision}
        onClose={() => setDecision(null)}
      >
        {decision && <DecisionDetails type="compoff" item={decision} person={{ name: personName(decision, "Employee"), code: employeeCode(decision) }} />}
      </DecisionDialog>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

export default AttendanceCompOffsPage;
