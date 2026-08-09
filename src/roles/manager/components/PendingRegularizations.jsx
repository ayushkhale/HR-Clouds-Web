import React from "react";
import { HiInboxIn } from "react-icons/hi";

function PendingRegularizations({ regularizations, onReview }) {
  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 overflow-hidden">
      <h2 className="text-lg font-bold text-primary-800 mb-6 flex items-center gap-2">
        <HiInboxIn className="text-purple-600" /> Pending Regularizations
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Reason</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!regularizations || regularizations.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-slate-400">
                  No pending regularizations.
                </td>
              </tr>
            ) : (
              regularizations.map((req, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold text-primary-800">{req.employeeName}</td>
                  <td className="px-6 py-4">{req.date}</td>
                  <td className="px-6 py-4 text-xs max-w-[150px] truncate" title={req.reason}>{req.reason}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      className="bg-primary-800 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm" 
                      onClick={() => onReview('reg', req.id, 'Review Regularization')}
                    >
                      Review
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

export default PendingRegularizations;
