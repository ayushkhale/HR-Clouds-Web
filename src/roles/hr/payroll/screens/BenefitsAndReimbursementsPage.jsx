import React from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import FeatureNotAvailable from "../../../../shared/components/FeatureNotAvailable";
import { HiGift } from "react-icons/hi";

export default function BenefitsAndReimbursementsPage() {
  return (
    <>
        <DashboardTopBar title="Benefits & Reimbursements" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Benefits & Reimbursements
            </h1>
            <p className="text-sm text-slate-500 mt-1">Manage benefit plans and approve employee reimbursement claims.</p>
          </div>

          <FeatureNotAvailable
            icon={HiGift}
            title="Benefits & reimbursements aren't live yet"
            message="Benefit plans and the reimbursement approval workflow ship in an upcoming payroll release. There's nothing to review here yet — this page will fill in automatically once the backend is available."
            capabilities={[
              { title: "Reimbursement categories", desc: "Per-category spend limits, taxable flags, and receipt requirements." },
              { title: "Claim review queue", desc: "Multi-level approval (manager → finance/HR) with a full comment and status trail." },
              { title: "Automatic payout", desc: "Approved claims flow into the next payroll run as non-taxable, non-LOP components and are paid exactly once." },
              { title: "Benefit plans", desc: "Health insurance, travel, and meal plans with per-employee enrollments linked to payroll." },
            ]}
            note="Pending the reimbursements & benefits backend. No claims or plans exist yet — nothing here is live data."
          />
        </main>
    </>
  );
}
