// The manager's view of office locations — the SAME screen HR sees, same cards,
// same wording, same layout; only the write affordances differ (CLAUDE.md §2).
//
// READ-ONLY, and that is the contract, not a decision taken here:
// `GET /organizations/locations` is open to every org role, while `POST` and
// `PUT /organizations/locations/:id` are super-admin/admin/hr only
// (public/ref docs/md_organization/3_org_structure_api.md, verified 14 Oct 2026).
// So the shared view is mounted without `onEdit`/`onToggle` and the pencil and
// the status switch are absent rather than disabled — never show a button that
// 403s. The note under the heading is there so a manager who needs a new office
// or a wider geofence knows it exists and who to ask, instead of hunting for an
// Add button that was never going to be here.
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import FieldHelp from "../../../shared/fieldHelp/FieldHelp";
import { useOfficeLocations } from "../../../shared/attendance/officePlanes";
import OfficeLocationsView from "../../../shared/attendance/OfficeLocationsView";

export default function ManagerOfficeLocationsPage() {
  const list = useOfficeLocations("manager");

  return (
    <>
      <DashboardTopBar title="Office Locations" />
      <main className="p-6 sm:p-8 space-y-8 max-w-7xl w-full mx-auto overflow-y-auto">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold text-slate-900">Office Locations</h1>
            <FieldHelp surface="organization.office_locations" field="page" label="office locations" />
          </div>
          <p className="text-sm text-slate-500 mt-1">Define geographical perimeters where employees can clock in.</p>
          <p className="text-xs font-semibold text-slate-400 mt-2">HR sets these up — ask HR to add an office or change where clocking in is allowed.</p>
        </div>
        <OfficeLocationsView list={list} />
      </main>
    </>
  );
}
