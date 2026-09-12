import React from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import FeatureNotAvailable from "../../../../shared/components/FeatureNotAvailable";
import { HiCurrencyRupee } from "react-icons/hi";

export default function MyReimbursementsPage() {
  return (
    <>
        <DashboardTopBar title="My Reimbursements" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiCurrencyRupee className="text-purple-600 w-7 h-7" /> My Reimbursements
            </h1>
            <p className="text-sm text-slate-500 mt-1">Submit claims and track benefit enrollments.</p>
          </div>

          <FeatureNotAvailable
            icon={HiCurrencyRupee}
            title="Reimbursements aren't live yet"
            message="Submitting reimbursement claims and enrolling in benefit plans ship in an upcoming payroll release. Check back soon."
            capabilities={[
              { title: "Submit claims", desc: "Raise reimbursement claims with itemised amounts and receipt attachments." },
              { title: "Track approvals", desc: "Follow each claim through its approval levels and read the reviewer's comments." },
              { title: "Get paid automatically", desc: "Approved claims are paid tax-free in your next payslip." },
              { title: "Enroll in benefits", desc: "Opt into health insurance, travel, and meal plans offered by your organisation." },
            ]}
            note="Pending the reimbursements & benefits backend. Nothing here is live yet."
          />
        </main>
    </>
  );
}
