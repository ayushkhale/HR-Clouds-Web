import React from "react";
import { HiOutlineClock, HiCheck } from "react-icons/hi";

// Honest placeholder for a feature whose backend isn't live yet. Unlike an
// empty-state ("no records"), this makes clear the capability doesn't exist
// so nobody mistakes it for a verified zero result.
//
// `capabilities` optionally lists what the feature WILL do once it ships — a
// truthful roadmap drawn from the product plan, never fabricated data. Each
// item is a string or `{ title, desc }`.
export default function FeatureNotAvailable({
  title = "Not available yet",
  message = "This feature is being built and isn't ready to use.",
  icon: Icon = HiOutlineClock,
  capabilities = [],
  note,
}) {
  const hasList = Array.isArray(capabilities) && capabilities.length > 0;

  return (
    <div className={`bg-white p-8 sm:p-10 rounded-2xl border border-slate-100 shadow-sm ${hasList ? "max-w-2xl" : "max-w-xl text-center"} mx-auto`}>
      <div className={hasList ? "flex items-start gap-4" : ""}>
        <div className={`w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center shrink-0 ${hasList ? "" : "mx-auto mb-4"}`}>
          <Icon className="w-7 h-7 text-purple-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{message}</p>
          {!hasList && (
            <span className="inline-block mt-4 text-[11px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
              Coming soon
            </span>
          )}
        </div>
      </div>

      {hasList && (
        <div className="mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">What this will include</p>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
              Coming soon
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
                    {item.desc && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>}
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
