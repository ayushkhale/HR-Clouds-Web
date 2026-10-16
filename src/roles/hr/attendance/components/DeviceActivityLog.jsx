// ─────────────────────────────────────────────────────────────────────────────
// DeviceActivityLog.jsx — the device-trust audit log (registry #16), in two
// shapes from one component: the whole organisation's log (its own tab on
// Registered Devices) and one person's history (inside the person inspector).
//
// WHY ONE FILTER AND NOT FOUR. This was a seven-option tab strip plus a person
// picker above a five-column table, which is more filtering furniture than
// log (user decision, 16 Oct 2026). The person filter was the bigger waste:
// anybody looking for one person's history opens that person, and now gets it
// there — `userId` is how the inspector asks for exactly that. What is left is
// one dropdown, because "show me the refused punches" is the one cut this log
// is genuinely read for.
//
// `device_gate_monitor` rows are the point of the pilot: punches that WOULD
// have been refused once the mode is Required. That is the list which says
// whether Required is safe yet, so it keeps its own entry in the dropdown.
//
// No ids anywhere — `nameOf` turns `target_user_id` into a person (§4).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiClipboardList, HiDeviceMobile } from "react-icons/hi";
import { TONE_CLASSES, TONE_DOT } from "../../../../shared/attendance/enums.js";
import { attendanceAPI } from "../../../../shared/api";
import { fmtDateTime } from "../../../../shared/attendance/dates";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import { useEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";
import { DEVICE_EVENT_FILTERS, deviceEventMeta, platformLabel } from "../../../../shared/attendance/deviceTrustMeta";
import { EmptyState, ErrorState, LoadingRows, Pagination } from "../../../../shared/attendance/ui";
import { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";

const SURFACE = "attendance.device_checks";

const SELECT = "px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";

/** The log's own pill. Tones come from the shared table, never new classes. */
export function EventPill({ action }) {
  const meta = deviceEventMeta(action);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/**
 * @param {object} props
 * @param {string} [props.userId]  one person's history; hides the filter and
 *                                 the employee column, and renders as a list
 * @param {number} [props.limit]
 */
export default function DeviceActivityLog({ userId = "", limit = 20 }) {
  const { nameOf } = useEmployeeDirectory({ enabled: !userId });
  const [action, setAction] = useState("");
  const forPerson = !!userId;

  const events = usePagedList(
    ({ page, limit: pageLimit }) => attendanceAPI.getDeviceTrustEvents({
      page, limit: pageLimit,
      ...(action && !forPerson ? { action } : {}),
      ...(forPerson ? { user_id: userId } : {}),
    }),
    { limit, keys: ["items"], filterKey: `${action}|${userId}` }
  );

  if (forPerson) {
    // Inside a dialog: the newest few, as lines. A second table in an overlay
    // reads as another page rather than as this person's history.
    if (events.loading) return <LoadingRows rows={3} />;
    if (events.error || events.items.length === 0) {
      return (
        <p className="text-xs text-slate-500">
          {events.error ? "Couldn’t load this person’s device activity." : "Nothing recorded for this person yet."}
        </p>
      );
    }
    return (
      <ul className="divide-y divide-slate-100">
        {events.items.map((row) => (
          <li key={row.id} className="py-2.5 flex items-start gap-3 first:pt-0 last:pb-0">
            <EventPill action={row.action} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-slate-500">{fmtDateTime(row.created_at)}</p>
              {row.reason && <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{row.reason}</p>}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
            <HiClipboardList className="w-4 h-4" />
          </span>
          <h2 className="text-base font-bold text-slate-800">
            <HelpLabel text="Device activity" help={{ surface: SURFACE, field: "events", size: "sm", label: "the device activity log" }} />
          </h2>
        </div>
        <select
          className={`${SELECT} sm:ml-auto w-full sm:w-auto`}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter the activity log"
        >
          {DEVICE_EVENT_FILTERS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {events.error ? (
        <ErrorState error={events.error} onRetry={events.reload} fallback="Couldn’t load device activity." />
      ) : events.loading ? (
        <div className="p-6"><LoadingRows rows={5} /></div>
      ) : events.items.length === 0 ? (
        <EmptyState
          icon={HiDeviceMobile}
          title="Nothing recorded yet"
          message={action ? "Nothing of this kind has happened yet. Try another choice." : "Registrations, refused punches and settings changes appear here."}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[760px]">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-6 py-3.5">When</th>
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-6 py-3.5">What happened</th>
                  <th className="px-6 py-3.5">Device</th>
                  <th className="px-6 py-3.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {events.items.map((row) => {
                  const info = row.new_values || {};
                  const kind = info.platform ? platformLabel(info.platform) : "";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">
                        {row.target_user_id ? nameOf(row.target_user_id) : "N/A"}
                      </td>
                      <td className="px-6 py-4"><EventPill action={row.action} /></td>
                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{kind || "N/A"}</td>
                      <td className="px-6 py-4 text-slate-500 max-w-xs truncate" title={row.reason || ""}>{row.reason || "N/A"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-slate-100">
            <Pagination
              page={events.page}
              totalPages={events.totalPages}
              total={events.total}
              limit={events.limit}
              onPageChange={events.setPage}
              noun="event"
            />
          </div>
        </>
      )}
    </div>
  );
}
