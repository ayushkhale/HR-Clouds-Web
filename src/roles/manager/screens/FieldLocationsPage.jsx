// The manager's view of client sites — the SAME screen HR sees, with the same
// layout and wording; only the API plane and the assignment scope differ
// (CLAUDE.md §2). A manager may register a site and assign their own direct
// reports to it, and may edit or retire only the sites they created — the
// server says which per row, and the shared view hides what it can't do.
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import FieldLocationsView from "../../../shared/attendance/FieldLocationsView";

export default function ManagerFieldLocationsPage() {
  return (
    <>
      <DashboardTopBar title="Client Sites" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-6 max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Sites</h1>
          <p className="text-sm text-slate-500 mt-1">Places your field staff work from, and who is assigned to each.</p>
        </div>
        <FieldLocationsView viewer="manager" />
      </main>
    </>
  );
}
