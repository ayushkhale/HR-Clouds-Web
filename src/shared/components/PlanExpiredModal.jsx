import React, { useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { HiX, HiExclamationCircle, HiArrowRight, HiShieldExclamation } from "react-icons/hi";
import { useSubscription } from "../contexts/SubscriptionContext";
import { useWorkspace } from "../contexts/WorkspaceContext";

export default function PlanExpiredModal() {
  const { isExpired, isModalDismissed, dismissModal } = useSubscription();
  const workspace = useWorkspace();
  const isHR = workspace === "hr";

  // Handle Escape key to dismiss
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        dismissModal();
      }
    },
    [dismissModal]
  );

  useEffect(() => {
    if (isExpired && !isModalDismissed) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isExpired, isModalDismissed, handleKeyDown]);

  if (!isExpired || isModalDismissed) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-expired-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissModal();
      }}
    >
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-100 overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Top cut-off / close button */}
        <button
          type="button"
          onClick={dismissModal}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 shadow-xs border border-slate-200 flex items-center justify-center transition active:scale-90"
          aria-label="Close dialog"
        >
          <HiX className="w-4 h-4" />
        </button>

        {/* Eye-catching Illustration Header */}
        <div className="bg-gradient-to-br from-purple-100/70 via-purple-50 to-indigo-50/50 p-6 sm:p-7 flex items-center justify-center border-b border-purple-100/70 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-purple-200/40 blur-2xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-indigo-200/40 blur-2xl pointer-events-none" />

          <img
            src="https://cdni.iconscout.com/illustration/premium/thumb/marking-the-business-development-plan-calendar-illustration-svg-download-png-7772355.png"
            alt="Calendar Plan Expired Illustration"
            className="h-36 sm:h-44 w-auto object-contain drop-shadow-md relative z-10 transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* Content Section */}
        <div className="p-6 sm:p-8 space-y-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0 text-rose-600 shadow-xs">
              <HiShieldExclamation className="w-5 h-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-bold tracking-wide uppercase mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                Action Required
              </div>
              <h2 id="plan-expired-modal-title" className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
                Your plan has run out
              </h2>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Your organization’s subscription plan has expired. Premium workspace capabilities, live attendance tracking, leave requests, and payroll computations are paused until the plan is renewed.
          </p>

          {isHR ? (
            <div className="pt-2 space-y-3">
              <Link
                to="/dashboard/hr/billing"
                onClick={dismissModal}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
              >
                <span>Renew Subscription Now</span>
                <HiArrowRight className="w-4 h-4" />
              </Link>
              <div className="text-center">
                <button
                  type="button"
                  onClick={dismissModal}
                  className="text-xs text-slate-400 hover:text-slate-600 font-medium py-1 transition"
                >
                  Remind me later
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2 space-y-3">
              <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-start gap-2.5 text-left">
                <HiExclamationCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-normal">
                  Please notify your organization’s HR administrator to renew the subscription so normal workspace operations can resume.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissModal}
                className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm transition"
              >
                Understood
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
