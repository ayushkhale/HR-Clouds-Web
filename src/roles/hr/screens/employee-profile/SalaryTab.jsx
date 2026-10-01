import SalaryStructurePanel from "../../../../shared/components/SalaryStructurePanel";

// The same panel HR and the manager both read. `viewer` only picks which
// endpoints are called; a manager may be blocked from figures by policy, which
// the panel states in place of the numbers.
export default function SalaryTab({ userId, viewer = "hr" }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-800">Salary</h2>
        <p className="text-xs text-slate-500 mt-0.5">The pay structure in force today, and every revision behind it. Open a past version for its components.</p>
      </div>
      <SalaryStructurePanel key={`${viewer}-${userId}`} userId={userId} viewer={viewer} compact />
    </div>
  );
}
