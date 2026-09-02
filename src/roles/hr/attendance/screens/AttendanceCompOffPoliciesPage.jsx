import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import { formatDecimalHours } from "../../../../shared/utils/formatUtils";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import {
  HiPlus,
  HiX,
  HiOutlineTrash,
  HiDocumentText,
  HiStatusOnline,
  HiStatusOffline
} from "react-icons/hi";

function AttendanceCompOffPoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);

  // Form State
  const [name, setName] = useState("");
  const [minHoursRequired, setMinHoursRequired] = useState(4);
  const [expiryDays, setExpiryDays] = useState(30);
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getCompOffPolicies();
      if (res.success) {
        const data = res.data?.data || res.data?.policies || res.data || [];
        setPolicies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
      window.alert(`Failed to load ${DICTIONARY.TERMS.COMP_OFF.toLowerCase()} policies`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (policy = null) => {
    if (policy) {
      setSelectedPolicy(policy);
      setName(policy.name || "");
      setMinHoursRequired(policy.min_hours_required || 4);
      setExpiryDays(policy.expiry_days || 30);
      setIsActive(policy.is_active !== false);
      setDescription(policy.description || "");
    } else {
      setSelectedPolicy(null);
      setName("");
      setMinHoursRequired(4);
      setExpiryDays(30);
      setIsActive(true);
      setDescription("");
    }
    setShowModal(true);
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    const payload = {
      name,
      min_hours_required: Number(minHoursRequired),
      expiry_days: Number(expiryDays),
      is_active: isActive,
      description
    };

    try {
      if (selectedPolicy) {
        await attendanceAPI.updateCompOffPolicy(selectedPolicy.id, payload);
        window.alert("Policy updated successfully");
      } else {
        await attendanceAPI.createCompOffPolicy(payload);
        window.alert("Policy created successfully");
      }
      setShowModal(false);
      fetchPolicies();
    } catch (err) {
      console.error(err);
      window.alert(selectedPolicy ? "Failed to update policy" : "Failed to create policy");
    }
  };

  const handleDeletePolicy = async (id) => {
    if (!await window.confirm(`Are you sure you want to delete this ${DICTIONARY.TERMS.COMP_OFF.toLowerCase()} policy?`)) return;
    try {
      await attendanceAPI.deleteCompOffPolicy(id);
      window.alert("Policy deleted successfully");
      fetchPolicies();
    } catch (err) {
      console.error(err);
      window.alert("Failed to delete policy");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role={user?.role || "hr"} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <DashboardTopBar title={`${DICTIONARY.TERMS.COMP_OFF} Policies`} subtitle="Configure rules for compensatory time off" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-800">{DICTIONARY.TERMS.COMP_OFF} Policies</h2>
              <button
                onClick={() => handleOpenModal()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-sm"
              >
                <HiPlus className="w-4 h-4" />
                Add Policy
              </button>
            </div>

            {/* Policies Table */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-xs">
                    <tr>
                      <th className="px-6 py-4">Policy Info</th>
                      <th className="px-6 py-4">Rules</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                            Loading policies...
                          </div>
                        </td>
                      </tr>
                    ) : policies.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-50 text-purple-600 mb-4">
                            <HiDocumentText className="w-8 h-8" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800 mb-1">No Policies Found</h3>
                          <p className="text-xs text-slate-500">Create a {DICTIONARY.TERMS.COMP_OFF.toLowerCase()} policy to set rules for extra work hours.</p>
                        </td>
                      </tr>
                    ) : (
                      policies.map((policy) => (
                        <tr key={policy.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
                                <HiDocumentText className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-800">{policy.name}</div>
                                <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{policy.description || "No description"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 text-xs text-slate-600">
                              <span><span className="font-semibold text-slate-800">Min Work:</span> {formatDecimalHours(policy.min_hours_required)}</span>
                              <span><span className="font-semibold text-slate-800">Expires in:</span> {policy.expiry_days} days</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${policy.is_active !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                              {policy.is_active !== false ? <HiStatusOnline className="w-3.5 h-3.5" /> : <HiStatusOffline className="w-3.5 h-3.5" />}
                              {policy.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenModal(policy)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                title="Edit"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeletePolicy(policy.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Policy Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                  <HiDocumentText className="w-4 h-4" />
                </div>
                {selectedPolicy ? "Edit Policy" : "New Policy"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="policyForm" onSubmit={handleSavePolicy} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Policy Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full h-11 bg-slate-50/70 border border-slate-200 rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                    placeholder={`e.g. Weekend/Holiday ${DICTIONARY.TERMS.COMP_OFF}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Min. Hours <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={minHoursRequired}
                      onChange={(e) => setMinHoursRequired(e.target.value)}
                      required
                      className="w-full h-11 bg-slate-50/70 border border-slate-200 rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                      placeholder="e.g. 4"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Expiry (Days) <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      min="1"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      required
                      className="w-full h-11 bg-slate-50/70 border border-slate-200 rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                      placeholder="e.g. 30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all resize-none"
                    placeholder="Optional details..."
                  />
                </div>
                <div>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                    />
                    <span className="text-sm font-semibold text-slate-700">Policy is Active</span>
                  </label>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="policyForm"
                className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-sm"
              >
                {selectedPolicy ? "Save Changes" : "Create Policy"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AttendanceCompOffPoliciesPage;
