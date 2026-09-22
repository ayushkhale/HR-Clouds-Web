// ─────────────────────────────────────────────────────────────────────────────
// documents/DocumentTable.jsx — The one document list every audience renders.
// Rows open the detail dialog (no separate View button). Optional columns: the
// person (team / org lists) and the manager recommendation (review queues).
// ─────────────────────────────────────────────────────────────────────────────

import { HiLockClosed } from "react-icons/hi";
import { rowPreviewProps } from "../components/DetailDialog";
import { Pagination } from "../attendance/ui";
import { fmtDate } from "../attendance/dates";
import { PersonCell } from "../attendance/ui";
import { daysToExpiry, displayStatus, groupLabel, sourceLabel } from "./documentMeta";
import { DocIcon, DocStatusBadge } from "./ui";

const REC = {
  verify: { label: "Verify", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  reject: { label: "Reject", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

function ExpiryCell({ doc }) {
  if (!doc?.expires_on) return <span className="text-slate-400 text-xs">No expiry</span>;
  const days = daysToExpiry(doc);
  const tone = days < 0 ? "text-rose-600" : days <= 30 ? "text-fuchsia-700" : "text-slate-400";
  const hint = days < 0 ? `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago` : days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`;
  return (
    <div className="leading-tight">
      <p className="text-xs font-semibold text-slate-700">{fmtDate(doc.expires_on)}</p>
      <p className={`text-[10px] font-semibold ${tone}`}>{hint}</p>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.rows
 * @param {Map} [props.types]                    type id → type
 * @param {(row) => void} props.onOpen
 * @param {(id: string) => object} [props.personOf]  show a person column; returns an entity for PersonCell
 * @param {boolean} [props.showRecommendation]
 * @param {{ page, total, limit, onPageChange }} [props.pagination]
 */
export default function DocumentTable({ rows, types, onOpen, personOf, showRecommendation = false, pagination }) {
  const totalPages = pagination ? Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit)) : 1;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            <tr>
              {personOf && <th className="px-5 py-3.5">Employee</th>}
              <th className="px-5 py-3.5">Document</th>
              <th className="px-5 py-3.5">Status</th>
              {showRecommendation && <th className="px-5 py-3.5">Manager</th>}
              <th className="px-5 py-3.5">Expiry</th>
              <th className="px-5 py-3.5">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((doc) => {
              const type = types?.get?.(doc.document_type_id);
              const rec = REC[doc.recommendation];
              return (
                <tr key={doc.id} {...rowPreviewProps(() => onOpen(doc), `Open ${doc.title}`)} className="hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40">
                  {personOf && (
                    <td className="px-5 py-3.5"><PersonCell entity={personOf(doc.user_id)} /></td>
                  )}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <DocIcon doc={doc} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate max-w-[280px] flex items-center gap-1.5">
                          <span className="truncate">{doc.title}</span>
                          {doc.is_confidential && <HiLockClosed className="w-3.5 h-3.5 text-purple-500 shrink-0" title="Confidential" />}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                          {[type?.name, type?.group ? groupLabel(type.group) : null, doc.version > 1 ? `v${doc.version}` : null].filter(Boolean).join(" · ") || "Document"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><DocStatusBadge status={displayStatus(doc)} /></td>
                  {showRecommendation && (
                    <td className="px-5 py-3.5">
                      {rec ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${rec.cls}`} title={doc.recommendation_note || undefined}>{rec.label}</span>
                      ) : <span className="text-xs text-slate-400">Not yet</span>}
                    </td>
                  )}
                  <td className="px-5 py-3.5"><ExpiryCell doc={doc} /></td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-semibold text-slate-700">{fmtDate(doc.confirmed_at || doc.created_at)}</p>
                    <p className="text-[10px] text-slate-400">{sourceLabel(doc.source)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination && pagination.total > 0 && (
        <div className="px-5 py-4 border-t border-slate-100">
          <Pagination page={pagination.page} totalPages={totalPages} total={pagination.total} limit={pagination.limit} onPageChange={pagination.onPageChange} noun="document" />
        </div>
      )}
    </>
  );
}
