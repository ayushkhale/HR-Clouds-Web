import React from "react";
import { HiCalendar } from "react-icons/hi";

function PunchHistoryCard({ history }) {
  const formatTime12H = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true });
  };

  const getBadgeClass = (status) => {
    if (!status) return "bg-indigo-50 text-indigo-700 border-indigo-200";
    const stat = status.toLowerCase();
    if(stat === 'present') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    else if(stat === 'absent') return 'bg-rose-50 text-rose-700 border-rose-200';
    else if(stat.includes('half')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  };

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 overflow-hidden">
      <h2 className="text-lg font-bold text-primary-800 mb-6 flex items-center gap-2">
        <HiCalendar className="text-purple-600" /> Recent Punch History
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">In Time</th>
              <th className="px-6 py-4">Out Time</th>
              <th className="px-6 py-4">Effective</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!history || history.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                  No recent records
                </td>
              </tr>
            ) : (
              history.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold text-primary-800">{r.date}</td>
                  <td className="px-6 py-4">{formatTime12H(r.clock_in_time)}</td>
                  <td className="px-6 py-4">{formatTime12H(r.clock_out_time)}</td>
                  <td className="px-6 py-4 font-semibold text-primary-800">
                    {r.effective_hours || 0} <span className="text-slate-400 text-xs font-medium">hrs</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border ${getBadgeClass(r.status)}`}>
                      {r.status ? r.status.replace('_', ' ') : 'In Progress'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PunchHistoryCard;
