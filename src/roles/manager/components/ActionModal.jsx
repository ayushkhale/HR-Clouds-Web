import React, { useState } from "react";
import { HiX } from "react-icons/hi";

function ActionModal({ isOpen, title, onClose, onExecute, type }) {
  const [remarks, setRemarks] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
        
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-lg text-primary-800">{title}</h3>
          <button className="text-slate-400 hover:text-slate-600 transition-colors" onClick={onClose}>
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Manager Remarks (Optional)</label>
          <textarea 
            rows="3" 
            placeholder="Enter remarks..." 
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          ></textarea>
        </div>

        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button 
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          
          {type !== 'anomaly' && (
            <button 
              className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-colors"
              onClick={() => onExecute('reject', remarks)}
            >
              Reject
            </button>
          )}

          <button 
            className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
            onClick={() => onExecute(type === 'anomaly' ? 'resolve' : 'approve', remarks)}
          >
            {type === 'anomaly' ? 'Mark Resolved' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActionModal;
