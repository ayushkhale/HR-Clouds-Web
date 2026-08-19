import React from "react";
import { HiExclamationCircle } from "react-icons/hi";

function ActiveAnomalies({ anomalies, onReview }) {
  const getSeverityClass = (severity) => {
    if (!severity) return "text-slate-500 bg-slate-100 border-slate-200";
    const sev = severity.toLowerCase();
    if(sev === 'high') return 'text-rose-700 bg-rose-50 border-rose-200';
    if(sev === 'medium') return 'text-amber-700 bg-amber-50 border-amber-200';
    return "text-indigo-700 bg-indigo-50 border-indigo-200";
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6 mt-6">
      <h2 className="text-lg font-bold text-primary-800 mb-6 flex items-center gap-2">
        <HiExclamationCircle className="text-rose-500" /> Active Anomalies & Exceptions
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Severity</th>
              <th className="px-6 py-4">Type / Description</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!anomalies || anomalies.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                  No active anomalies.
                </td>
              </tr>
            ) : (
              anomalies.map((anom, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold text-primary-800">{anom.employeeName}</td>
                  <td className="px-6 py-4">{anom.date}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border ${getSeverityClass(anom.severity)}`}>
                      {anom.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold">{anom.type ? anom.type.replace('_', ' ').toUpperCase() : ''}</div>
                    <div className="text-xs text-slate-500 mt-1 max-w-[250px] truncate" title={anom.description}>{anom.description}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      className="bg-primary-800 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      onClick={() => onReview('anomaly', anom.id, 'Resolve Anomaly')}
                    >
                      Resolve
                    </button>
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

export default ActiveAnomalies;
