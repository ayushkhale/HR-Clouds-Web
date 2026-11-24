import React from "react";
import { Link } from "react-router-dom";
import { HiArrowRight, HiSparkles, HiInformationCircle } from "react-icons/hi";
import { useWorkspace } from "../contexts/WorkspaceContext";

export default function PlanExpiredHeader() {
  const workspace = useWorkspace();
  const isHR = workspace === "hr";

  return (
    <div className="bg-gradient-to-r from-[#4C1D95] via-[#5B21B6] to-[#6D28D9] rounded-3xl p-5 sm:p-7 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xl shadow-purple-900/20 border-2 border-purple-400/40">
      {/* Background ambient lighting effects */}
      <div className="absolute right-0 top-0 bottom-0 w-2/3 opacity-25 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-300 via-transparent to-transparent" />
      <div className="absolute left-1/4 -bottom-10 w-48 h-48 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />

      {/* Text & Actions Column */}
      <div className="relative z-10 max-w-2xl space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-[11px] sm:text-xs font-bold tracking-wider uppercase border border-white/25 backdrop-blur-xs shadow-xs">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Subscription Expired · Action Required</span>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Your plan has run out
          </h1>
          <p className="text-xs sm:text-sm text-purple-100/95 font-normal leading-relaxed mt-2 max-w-xl">
            Your organization's HR Clouds plan has ended. Core operations, automated payroll, and attendance syncing are temporarily locked. Choose a plan to renew and switch everything back on immediately.
          </p>
        </div>

        {isHR ? (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/dashboard/hr/billing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-purple-800 font-bold text-sm shadow-md hover:bg-purple-50 hover:shadow-lg transition-all active:scale-95"
            >
              <HiSparkles className="w-4 h-4 text-purple-600" />
              <span>Renew Subscription</span>
              <HiArrowRight className="w-4 h-4 text-purple-700" />
            </Link>
            <Link
              to="/dashboard/hr/billing"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-purple-100 border border-white/20 font-semibold text-xs transition"
            >
              <span>View Pricing Plans</span>
            </Link>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2.5 pt-2 text-xs sm:text-sm text-purple-100 bg-white/10 px-4 py-2 rounded-xl border border-white/15">
            <HiInformationCircle className="w-4 h-4 shrink-0 text-amber-300" />
            <span>Please contact your HR administrator to renew the company plan.</span>
          </div>
        )}
      </div>

      {/* Decorative Vector Art */}
      <img
        src="https://cdni.iconscout.com/illustration/premium/thumb/marking-the-business-development-plan-calendar-illustration-svg-download-png-7772355.png"
        alt="Plan Expired Calendar Illustration"
        aria-hidden="true"
        className="relative z-10 shrink-0 w-auto max-w-[10rem] sm:max-w-[14rem] md:max-w-[17rem] h-28 sm:h-40 md:h-48 object-contain drop-shadow-2xl sm:mr-4 md:mr-8 self-center sm:self-auto"
      />
    </div>
  );
}
