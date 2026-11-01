import { useNavigate } from "react-router-dom";
import { HiCurrencyRupee } from "react-icons/hi";
import SalaryStructurePanel from "../../../../shared/components/SalaryStructurePanel";

// The same panel HR and the manager both read. `viewer` only picks which
// endpoints are called; a manager may be blocked from figures by policy, which
// the panel states in place of the numbers.
export default function SalaryTab({ userId, viewer = "hr" }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Salary</h2>
          <p className="text-xs text-slate-500 mt-0.5">The pay structure in force today, and every revision behind it. Open a past version for its components.</p>
        </div>
        {viewer === "hr" && (
          <button
            type="button"
            onClick={() => navigate("/dashboard/hr/payroll/employee-structures")}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <HiCurrencyRupee className="w-4 h-4" /> Employee Salaries
          </button>
        )}
      </div>
      <SalaryStructurePanel
        key={`${viewer}-${userId}`}
        userId={userId}
        viewer={viewer}
        compact
        onAssign={() => navigate("/dashboard/hr/payroll/employee-structures")}
      />
    </div>
  );
}
