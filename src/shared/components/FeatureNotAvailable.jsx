import React from "react";
import { Link } from "react-router-dom";
import { HiOutlineClock, HiCheck, HiShieldExclamation, HiArrowRight } from "react-icons/hi";
import { useSubscription } from "../contexts/SubscriptionContext";
import { useWorkspace } from "../contexts/WorkspaceContext";

export default function FeatureNotAvailable({
  title,
  message,
  icon: CustomIcon,
  capabilities = [],
  note,
  badge,
  isExpired: propIsExpired,
  action,
}) {
  const { isExpired: contextIsExpired } = useSubscription();
  const workspace = useWorkspace();
  const isHR = workspace === "hr";

  const isExpired = propIsExpired ?? contextIsExpired ?? false;

  // When a plan is expired, never deceive users with "Coming soon"
  const defaultTitle = isExpired ? "Your plan has run out" : "Not available yet";
  const defaultMessage = isExpired
    ? "This feature is locked because your organization's subscription has expired. Renew your plan to restore full access."
    : "This feature is being built and isn't ready to use.";

  const resolvedTitle = title || defaultTitle;
  const resolvedMessage = message || defaultMessage;
  const resolvedBadge = badge || (isExpired ? "Plan Expired" : "Coming soon");
  const Icon = CustomIcon || (isExpired ? HiShieldExclamation : HiOutlineClock);

  const hasList = Array.isArray(capabilities) && capabilities.length > 0;

  return (
    <div
      className={`bg-white p-8 sm:p-10 rounded-2xl border border-slate-100 shadow-sm ${
        hasList ? "max-w-2xl" : "max-w-xl text-center"
      } mx-auto`}
    >
      <div className={hasList ? "flex items-start gap-4" : ""}>
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
            hasList ? "" : "mx-auto mb-4"
          } ${isExpired ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-purple-500"}`}
        >
          <Icon className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{resolvedTitle}</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{resolvedMessage}</p>

          {!hasList && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <span
                className={`inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                  isExpired
                    ? "text-rose-700 bg-rose-50 border border-rose-200"
                    : "text-purple-600 bg-purple-50"
                }`}
              >
                {resolvedBadge}
              </span>

              {isExpired && (
                action || (
                  isHR ? (
                    <Link
                      to="/dashboard/hr/billing"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-xs transition active:scale-95"
                    >
                      <span>Renew Subscription</span>
                      <HiArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <p className="text-xs text-slate-400 font-medium">
                      Please contact your HR administrator to renew the subscription.
                    </p>
                  )
                )
              )}
            </div>
          )}
        </div>
      </div>

      {hasList && (
        <div className="mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              What this will include
            </p>
            <span
              className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                isExpired
                  ? "text-rose-700 bg-rose-50 border border-rose-200"
                  : "text-purple-600 bg-purple-50"
              }`}
            >
              {resolvedBadge}
            </span>
          </div>
          <ul className="space-y-3">
            {capabilities.map((cap, i) => {
              const item = typeof cap === "string" ? { title: cap } : cap;
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                    <HiCheck className="w-3 h-3 text-purple-600" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                    {item.desc && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {note && <p className="text-xs text-slate-400 mt-6 leading-relaxed">{note}</p>}
        </div>
      )}
    </div>
  );
}
