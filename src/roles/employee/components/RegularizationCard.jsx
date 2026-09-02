import React, { useState } from "react";
import { attendanceAPI } from "../../../shared/api";
import { HiPencilAlt, HiPlus, HiX } from "react-icons/hi";

function RegularizationCard({ requests, fetchRegularizations }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [date, setDate] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!date || reason.length < 5) {
      alert("Please provide a valid date and a reason with at least 5 characters.");
      return;
    }
    
    try {
      setIsSubmitting(true);
      const payload = {
        date,
        reason,
        ...(clockIn ? { requested_clock_in: clockIn } : {}),
        ...(clockOut ? { requested_clock_out: clockOut } : {})
      };
      const res = await attendanceAPI.submitRegularization(payload);
      if (res.success) {
        setIsModalOpen(false);
        setReason(""); setClockIn(""); setClockOut(""); setDate("");
        if (fetchRegularizations) fetchRegularizations();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this regularization request?")) return;
    try {
      const res = await attendanceAPI.cancelRegularization(id);
      if (res.success) {
        if (fetchRegularizations) fetchRegularizations();
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to cancel request.");
    }
  };

  const getStatusBadge = (status) => {
    if (!status) return "bg-slate-100 text-slate-700";
    const stat = status.toLowerCase();
    if (stat === 'approved') return "bg-emerald-100 text-emerald-700";
    if (stat === 'rejected') return "bg-rose-100 text-rose-700";
    return "bg-amber-100 text-amber-700";
  };

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h2 className="text-lg font-bold text-primary-800 flex items-center gap-2">
          <HiPencilAlt className="text-purple-600" /> Regularization Requests
        </h2>
        <button 
          className="bg-primary-800 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
          onClick={() => setIsModalOpen(true)}
        >
          <HiPlus /> New Request
        </button>
      </div>
      
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Requested In</th>
              <th className="px-6 py-4">Requested Out</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Reason</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!requests || requests.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                  No requests found
                </td>
              </tr>
            ) : (
              requests.map((req, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 font-semibold">{req.date}</td>
                  <td className="px-6 py-4">{req.clockIn || '--'}</td>
                  <td className="px-6 py-4">{req.clockOut || '--'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${getStatusBadge(req.status)}`}>
                      {req.status || 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 max-w-[200px] truncate" title={req.reason}>{req.reason}</td>
                  <td className="px-6 py-4 text-right">
                    {(!req.status || req.status.toLowerCase() === 'pending') && (
                      <button
                        onClick={() => handleCancel(req._id || req.id)}
                        className="text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg text-primary-800">Submit Regularization</h3>
              <button className="text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setIsModalOpen(false)}>
                <HiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date *</label>
                <input 
                  type="date" 
                  required 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Requested In</label>
                  <input 
                    type="time" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    value={clockIn} 
                    onChange={e => setClockIn(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Requested Out</label>
                  <input 
                    type="time" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    value={clockOut} 
                    onChange={e => setClockOut(e.target.value)} 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reason *</label>
                <textarea 
                  rows="3" 
                  required 
                  placeholder="Min 5 characters..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                  value={reason} 
                  onChange={e => setReason(e.target.value)}
                ></textarea>
              </div>
            </div>
            
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button 
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                onClick={() => setIsModalOpen(false)} 
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-800 hover:bg-primary-700 rounded-xl shadow-sm transition-colors disabled:opacity-70"
                onClick={handleSubmit} 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegularizationCard;
