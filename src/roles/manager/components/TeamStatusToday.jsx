import React from "react";
import { HiUserGroup } from "react-icons/hi";

function TeamStatusToday({ team }) {
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
    <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
      <h2 className="text-lg font-bold text-primary-800 mb-6 flex items-center gap-2">
        <HiUserGroup className="text-purple-600" /> Team Status Today
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">In Time</th>
              <th className="px-6 py-4">Out Time</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Lateness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!team || team.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                  No team members recorded today.
                </td>
              </tr>
            ) : (
              team.map((mem, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold text-primary-800">
                    {mem.user?.profile?.display_name || 
                     `${mem.user?.profile?.first_name || ''} ${mem.user?.profile?.last_name || ''}`.trim() || 
                     mem.user?.identifier || 'Unknown'}
                  </td>
                  <td className="px-6 py-4">{formatTime12H(mem.clock_in_time)}</td>
                  <td className="px-6 py-4">{formatTime12H(mem.clock_out_time)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border border-black/5 ${getBadgeClass(mem.status)}`}>
                      {mem.status ? mem.status.replace('_', ' ') : 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {mem.late_minutes > 0 ? (
                      <span className="text-rose-600 font-bold">{mem.late_minutes} min late</span>
                    ) : (
                      <span className="text-slate-400 text-xs">On Time</span>
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

export default TeamStatusToday;
