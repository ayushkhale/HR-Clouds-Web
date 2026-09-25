// ─────────────────────────────────────────────────────────────────────────────
// documents/RequestsTable.jsx — The one request list every audience renders.
// Rows open the detail dialog; there is no separate View button.
//
// A request row is FLAT: it carries `user_id`, `document_type_id` and
// `requested_by` as bare ids with nothing nested, so the person column and the
// document name are both resolved by the caller. A name that hasn't loaded yet
// reads as "Loading…" rather than as a missing person.
//
// The reminder column only appears on the planes that are sent it — HR and the
// manager get `reminder_count`, the person themselves gets neither cadence
// field. A withheld field must never render as "None".
// ─────────────────────────────────────────────────────────────────────────────

import { HiBell, HiClipboardList } from "react-icons/hi";
import { rowPreviewProps } from "../components/DetailDialog";
import { Pagination, PersonCell } from "../attendance/ui";
import { fmtDate } from "../attendance/dates";
import { RequestDueChip, RequestStatusBadge } from "./requestUi";
import { REQUEST_MAX_REMINDERS, groupLabelOfType, requesterRoleLabel } from "./requestMeta";

/**
 * @param {object} props
 * @param {object[]} props.rows
 * @param {Map} [props.types]                        type id → document type
 * @param {(row) => void} props.onOpen
 * @param {(id: string) => object} [props.personOf]  adds the person column
 * @param {(id: string, fallback?: string) => string} [props.nameOf]  names the requester
 * @param {boolean} [props.showReminders]            the plane is sent `reminder_count`
 * @param {{ page, total, limit, onPageChange }} [props.pagination]
 */
export default function RequestsTable({ rows, types, onOpen, personOf, nameOf, showReminders = false, pagination }) {
  const totalPages = pagination ? Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit)) : 1;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            <tr>
              {personOf && <th className="px-5 py-3.5">Employee</th>}
              <th className="px-5 py-3.5">What was asked for</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Due</th>
              <th className="px-5 py-3.5">Asked</th>
              {showReminders && <th className="px-5 py-3.5 text-right">Reminders</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((req) => {
              const type = types?.get?.(req.document_type_id);
              const reminders = Number(req.reminder_count) || 0;
              return (
                <tr
                  key={req.id}
                  {...rowPreviewProps(() => onOpen(req), `Open the request for ${type?.name || "a document"}`)}
                  className="hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40"
                >
                  {personOf && <td className="px-5 py-3.5"><PersonCell entity={personOf(req.user_id)} /></td>}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                        <HiClipboardList className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate max-w-[280px]">{type?.name || "A document"}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                          {req.note ? req.note : groupLabelOfType(type)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><RequestStatusBadge request={req} /></td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-semibold text-slate-700">{fmtDate(req.due_on)}</p>
                    <RequestDueChip request={req} />
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-semibold text-slate-700">{fmtDate(req.created_at)}</p>
                    <p className="text-[10px] text-slate-400 truncate max-w-[160px]">
                      by {nameOf ? nameOf(req.requested_by, requesterRoleLabel(req.requested_by_role)) : requesterRoleLabel(req.requested_by_role)}
                    </p>
                  </td>
                  {showReminders && (
                    <td className="px-5 py-3.5 text-right">
                      {reminders > 0 ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${reminders >= REQUEST_MAX_REMINDERS ? "text-rose-600" : "text-slate-700"}`}
                          title={reminders >= REQUEST_MAX_REMINDERS ? "All the automatic reminders have been used." : `${reminders} of ${REQUEST_MAX_REMINDERS} reminders sent`}
                        >
                          <HiBell className="w-3.5 h-3.5 text-slate-400" />{reminders}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination && pagination.total > 0 && (
        <div className="px-5 py-4 border-t border-slate-100">
          <Pagination page={pagination.page} totalPages={totalPages} total={pagination.total} limit={pagination.limit} onPageChange={pagination.onPageChange} noun="request" />
        </div>
      )}
    </>
  );
}
