import React from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import FeatureNotAvailable from "../../../../shared/components/FeatureNotAvailable";
import { HiDocumentText } from "react-icons/hi";

export default function TeamReimbursementsPage() {
  return (
    <>
        <DashboardTopBar title="Team Reimbursements" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiDocumentText className="text-purple-600 w-7 h-7" /> Team Reimbursements
            </h1>
            <p className="text-sm text-slate-500 mt-1">Review and approve reimbursement claims from your direct reports.</p>
          </div>

          <FeatureNotAvailable
            icon={HiDocumentText}
            title="Team reimbursements aren't live yet"
            message="Reimbursement claims from your direct reports ship in an upcoming payroll release. There are no claims to review here yet."
            capabilities={[
              { title: "Claims from your reports", desc: "Reimbursement claims raised by your direct reports, scoped to your team." },
              { title: "First-level approval", desc: "You approve or return a claim before it moves on to finance/HR — no level can be skipped." },
              { title: "Status tracking", desc: "Follow each claim through submitted → under review → approved/processed with its comment trail." },
            ]}
            note="Pending the reimbursements backend. No claims exist yet — nothing here is live data."
          />
        </main>
    </>
  );
}
