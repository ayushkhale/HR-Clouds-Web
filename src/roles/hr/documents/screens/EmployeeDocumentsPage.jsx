// ─────────────────────────────────────────────────────────────────────────────
// EmployeeDocumentsPage.jsx — HR opens any employee's document file (#13) and
// uploads (#10), links an external document (#12), verifies, replaces or
// deletes from there. Since Phase 4 the same panel also carries what that
// person is REQUIRED to hold (#86) and what has been asked of them (#82) —
// three tabs over one question: is this file in order?
//
// The same panel is the "Documents" tab of the employee profile. The chosen
// person lives in the URL (?user=) so the page can be linked and survives a
// refresh.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HiExternalLink, HiFolderOpen } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import SubjectDocumentsPanel from "../../../../shared/documents/SubjectDocumentsPanel";
import { DocEmptyState } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

export default function EmployeeDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const userId = params.get("user") || "";
  const { rows: people, status, nameOf } = useEmployeeDirectory();
  const person = useMemo(() => people.find((p) => (p.user_id ?? p.id) === userId), [people, userId]);

  return (
    <>
      <DashboardTopBar title="Employee Documents" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Employee Documents</h1>
            <p className="text-sm text-slate-500 mt-1">Open anyone’s file to see what they have, what their job still requires, and what has been asked of them.</p>
          </div>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="flex-1 lg:w-80">
              <PersonSelect
                people={people}
                value={userId}
                onChange={(id) => setParams(id ? { user: id } : {}, { replace: true })}
                placeholder="Choose an employee"
                loading={status === "loading"}
              />
            </div>
            {userId && (
              <Link to={`/dashboard/hr/employees/${userId}?tab=documents`} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800 whitespace-nowrap">
                Profile <HiExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {userId ? (
          <SubjectDocumentsPanel key={userId} planeKey="hr" userId={userId} subjectName={person ? nameOf(userId) : ""} nameOf={nameOf} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
            <DocEmptyState icon={HiFolderOpen} title="Choose an employee" message="Pick someone above to see every document in their file — including ones in review, rejected and older versions — plus what their job requires and anything still outstanding." />
          </div>
        )}
      </main>
    </>
  );
}
