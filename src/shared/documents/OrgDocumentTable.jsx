// ─────────────────────────────────────────────────────────────────────────────
// documents/OrgDocumentTable.jsx — The org-document list HR and managers read.
// Rows open the detail dialog (no separate View button), matching the employee
// document table.
//
// The employee table's columns don't fit here: an org document has no subject
// and no expiry date. What matters instead is who it reaches and when it is in
// force, so those get the columns.
// ─────────────────────────────────────────────────────────────────────────────

import { HiLockClosed, HiUserGroup, HiUsers } from "react-icons/hi";
import { rowPreviewProps } from "../components/DetailDialog";
import { Pagination } from "../attendance/ui";
import { fmtDate } from "../attendance/dates";
import { DocIcon } from "./ui";
import { OrgStatusBadge } from "./orgUi";
import { goesToEveryone, isProposal, orgDisplayStatus } from "./orgDocumentMeta";

/** When this document is in force, in one short phrase. */
function EffectiveCell({ doc }) {
  const from = doc?.effective_from;
  const to = doc?.effective_to;
  if (!from && !to) return <span className="text-xs text-slate-400">No fixed dates</span>;
  return (
    <div className="leading-tight">
      <p className="text-xs font-semibold text-slate-700">{from ? fmtDate(from) : "Right away"}</p>
      <p className="text-[10px] text-slate-400">{to ? `until ${fmtDate(to)}` : "no end date"}</p>
    </div>
  );
}

/**
 * Who it reaches. Before publish there is no count yet, so the shape of the
 * targeting is shown instead — that is the only honest answer at that point,
 * because the audience isn't resolved until publish.
 */
function AudienceCell({ doc, nameOf }) {
  const orgWide = goesToEveryone(doc);
  const published = ["published", "superseded", "retired"].includes(doc?.status);
  const count = Number(doc?.recipient_count) || 0;
  // A manager's proposal targets exactly one person (R-71), so naming them is
  // far more use than "selected audience".
  const only = Array.isArray(doc?.included_users) && doc.included_users.length === 1 ? doc.included_users[0] : null;

  if (only && nameOf) {
    return (
      <div className="flex items-center gap-2 leading-tight">
        <HiUsers className="w-4 h-4 text-purple-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{nameOf(only, "One person")}</p>
          <p className="text-[10px] text-slate-400">{published ? "issued" : "not issued yet"}</p>
        </div>
      </div>
    );
  }

  if (published) {
    return (
      <div className="flex items-center gap-2 leading-tight">
        <HiUsers className="w-4 h-4 text-purple-400 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-slate-700 tabular-nums">{count} {count === 1 ? "person" : "people"}</p>
          <p className="text-[10px] text-slate-400">{orgWide ? "everyone" : "selected audience"}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 leading-tight">
      <HiUserGroup className="w-4 h-4 text-slate-300 shrink-0" />
      <div>
        <p className="text-xs font-semibold text-slate-500">{orgWide ? "Everyone" : "Selected audience"}</p>
        <p className="text-[10px] text-slate-400">not issued yet</p>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.rows
 * @param {Map} [props.types]                  type id → type
 * @param {(row) => void} props.onOpen
 * @param {(id: string) => string} [props.nameOf]   show who proposed it (HR's proposals queue)
 * @param {boolean} [props.showProposer]
 * @param {{ page, total, limit, onPageChange }} [props.pagination]
 */
export default function OrgDocumentTable({ rows, types, onOpen, nameOf, showProposer = false, pagination }) {
  const totalPages = pagination ? Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit)) : 1;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[820px]">
          <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Document</th>
              <th className="px-5 py-3.5">Status</th>
              {showProposer && <th className="px-5 py-3.5">Proposed by</th>}
              <th className="px-5 py-3.5">Goes to</th>
              <th className="px-5 py-3.5">In force</th>
              <th className="px-5 py-3.5">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((doc) => {
              const type = types?.get?.(doc.document_type_id);
              return (
                <tr
                  key={doc.id}
                  {...rowPreviewProps(() => onOpen(doc), `Open ${doc.title}`)}
                  className="hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <DocIcon doc={doc} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate max-w-[300px] flex items-center gap-1.5">
                          <span className="truncate">{doc.title}</span>
                          {doc.is_confidential && <HiLockClosed className="w-3.5 h-3.5 text-purple-500 shrink-0" title="Confidential" />}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[300px]">
                          {[
                            type?.name,
                            doc.version > 1 ? `Version ${doc.version}` : null,
                            doc.requires_acknowledgement ? "Needs acknowledgement" : null,
                          ].filter(Boolean).join(" · ") || "Organisation document"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <OrgStatusBadge status={orgDisplayStatus(doc)} />
                      {isProposal(doc) && doc.status === "draft" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-bold">Proposal</span>
                      )}
                    </div>
                  </td>
                  {showProposer && (
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{nameOf?.(doc.proposed_by, "A manager") || "A manager"}</p>
                    </td>
                  )}
                  <td className="px-5 py-3.5"><AudienceCell doc={doc} nameOf={nameOf} /></td>
                  <td className="px-5 py-3.5"><EffectiveCell doc={doc} /></td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-semibold text-slate-700">{fmtDate(doc.updated_at || doc.created_at)}</p>
                    <p className="text-[10px] text-slate-400">{doc.published_at ? `Issued ${fmtDate(doc.published_at)}` : "Not issued"}</p>
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
