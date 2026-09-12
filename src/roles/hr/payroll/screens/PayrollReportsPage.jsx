import React from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import FeatureNotAvailable from "../../../../shared/components/FeatureNotAvailable";
import { HiDocumentReport } from "react-icons/hi";

export default function PayrollReportsPage() {
  return (
    <>
        <DashboardTopBar title="Reports & Delivery" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiDocumentReport className="text-purple-600 w-7 h-7" /> Reports & Delivery
            </h1>
            <p className="text-sm text-slate-500 mt-1">Export payroll registers, bank NEFT files, and custom CSVs.</p>
          </div>

          <FeatureNotAvailable
            icon={HiDocumentReport}
            title="Reports & delivery aren't live yet"
            message="Payslip delivery, payroll reports, and exports ship in an upcoming payroll release. Export options will appear here once the backend is available."
            capabilities={[
              { title: "Payslip delivery", desc: "PDFs rendered on demand from the frozen run snapshot, payslip history, and email dispatch." },
              { title: "Bulk download", desc: "Streamed ZIP of payslips for an approved run." },
              { title: "Payroll reports", desc: "Payroll register, department / cost-center distribution, and deduction summary — filterable by period, department, employee, and component." },
              { title: "Exports with audit", desc: "CSV and PDF exports, with a record of who exported what and when." },
              { title: "Bank advice / NEFT file", desc: "Generated for a paid run for upload to the bank." },
            ]}
            note="Pending the reports & delivery backend. Nothing here is live data yet."
          />
        </main>
    </>
  );
}
