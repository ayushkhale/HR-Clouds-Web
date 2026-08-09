import React from "react";
import { HiClock } from "react-icons/hi";

function TeamHistoryTable({ history }) {
  const formatTime12H = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true });
  };

  const getBadgeClass = (status) => {
    if (!status) return "bg-slate-100 text-slate-700";
    const stat = status.toLowerCase();
    if(stat === 'completed') return 'bg-indigo-100 text-indigo-700';
    if(stat === 'in_progress') return 'bg-emerald-100 text-emerald-700';
    if(stat.includes('break')) return 'bg-amber-100 text-amber-700';
    return "bg-slate-100 text-slate-700";
  };

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 overflow-hidden mt-6">
      <h2 className="text-lg font-bold text-primary-800 mb-6 flex items-center gap-2">
        <HiClock className="text-purple-600" /> Team History
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">In Time</th>
              <th className="px-6 py-4">Out Time</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Total Hrs</th>
              <th className="px-6 py-4">Effective Hrs</th>
              <th className="px-6 py-4">Late / Early</th>
              <th className="px-6 py-4">Overtime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!history || history.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-6 py-12 text-center text-slate-400">
                  No historical records found for this period.
                </td>
              </tr>
            ) : (
              history.map((mem, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold text-primary-800">
                    {mem.user?.profile?.display_name || 
                     (mem.user?.profile?.first_name ? `${mem.user.profile.first_name} ${mem.user.profile.last_name}`.trim() : null) || 
                     mem.user?.identifier || 
                     (mem.user_id ? `EMP-${mem.user_id.split('-')[0].toUpperCase()}` : 'Unknown')}
                  </td>
                  <td className="px-6 py-4 font-medium">{mem.date}</td>
                  <td className="px-6 py-4">{formatTime12H(mem.clock_in_time)}</td>
                  <td className="px-6 py-4">{formatTime12H(mem.clock_out_time)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border border-black/5 ${getBadgeClass(mem.status)}`}>
                      {mem.status ? mem.status.replace('_', ' ') : 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {mem.total_hours ? `${mem.total_hours}h` : '--'}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {mem.effective_hours ? `${mem.effective_hours}h` : '--'}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {mem.late_minutes > 0 && <div className="text-rose-600 font-bold">{mem.late_minutes}m late</div>}
                    {mem.early_exit_minutes > 0 && <div className="text-amber-600 font-bold">{mem.early_exit_minutes}m early</div>}
                    {mem.late_minutes === 0 && mem.early_exit_minutes === 0 && <span className="text-slate-400">--</span>}
                  </td>
                  <td className="px-6 py-4">
                    {mem.overtime_minutes > 0 ? (
                      <span className="text-emerald-600 font-bold">+{mem.overtime_minutes}m</span>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
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

export default TeamHistoryTable;
