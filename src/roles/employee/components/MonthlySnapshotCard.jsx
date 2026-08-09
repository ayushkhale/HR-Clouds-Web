import React from "react";
import { HiChartPie, HiCheckCircle, HiExclamationCircle, HiXCircle, HiClock } from "react-icons/hi";

function MonthlySnapshotCard({ summary }) {
  return (
    <div className="bg-gradient-to-br from-primary-800 to-primary-600 rounded-2xl p-6 sm:p-8 shadow-md text-white relative overflow-hidden">
      <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
      
      <h2 className="text-lg font-bold mb-6 flex items-center gap-2 border-b border-white/10 pb-4">
        <HiChartPie className="text-purple-300" /> Monthly Snapshot
      </h2>
      
      <div className="grid grid-cols-2 gap-4 relative z-10">
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 transition-transform hover:-translate-y-1 hover:bg-white/10">
          <div className="text-2xl mb-1">
            <HiClock className="text-blue-400 w-7 h-7" />
          </div>
          <div className="text-2xl font-extrabold text-blue-300">{summary?.total_hours_worked || 0}<span className="text-sm font-medium ml-1">h</span></div>
          <div className="text-xs text-slate-300 mt-1 font-medium tracking-wide uppercase">Effective Hrs</div>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 transition-transform hover:-translate-y-1 hover:bg-white/10">
          <div className="text-2xl mb-1">
            <HiCheckCircle className="text-emerald-400 w-7 h-7" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300">{summary?.present_days || 0}</div>
          <div className="text-xs text-slate-300 mt-1 font-medium tracking-wide uppercase">Present Days</div>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 transition-transform hover:-translate-y-1 hover:bg-white/10">
          <div className="text-2xl mb-1">
            <HiExclamationCircle className="text-amber-400 w-7 h-7" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300">{summary?.late_days || 0}</div>
          <div className="text-xs text-slate-300 mt-1 font-medium tracking-wide uppercase">Late Arrivals</div>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 transition-transform hover:-translate-y-1 hover:bg-white/10">
          <div className="text-2xl mb-1">
            <HiXCircle className="text-rose-400 w-7 h-7" />
          </div>
          <div className="text-2xl font-extrabold text-rose-300">{summary?.absent_days || 0}</div>
          <div className="text-xs text-slate-300 mt-1 font-medium tracking-wide uppercase">Absent Days</div>
        </div>

      </div>
    </div>
  );
}

export default MonthlySnapshotCard;
