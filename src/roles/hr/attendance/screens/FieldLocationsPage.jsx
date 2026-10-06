// HR's view of client sites. The screen itself is shared with the manager
// workspace — this file only supplies the page shell and the `viewer` that
// picks the API plane (CLAUDE.md §2). Keep the <h1> identical to the manager
// wrapper and to the sidebar label.
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import FieldLocationsView from "../../../../shared/attendance/FieldLocationsView";

export default function FieldLocationsPage() {
  return (
    <>
      <DashboardTopBar title="Client Sites" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-6 max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Sites</h1>
          <p className="text-sm text-slate-500 mt-1">Places your field staff work from, and who is assigned to each.</p>
        </div>
        <FieldLocationsView viewer="hr" />
      </main>
    </>
  );
}
