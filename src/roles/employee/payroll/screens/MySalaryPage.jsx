import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCurrencyRupee, HiLibrary } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

export default function MySalaryPage() {
  const [structure, setStructure] = useState(null);
  const [bankAccount, setBankAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankFormData, setBankFormData] = useState({
    account_holder_name: "", bank_name: "", account_number: "", ifsc_code: "", branch_name: ""
  });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [structRes, bankRes] = await Promise.all([
        payrollAPI.getMyCurrentStructure().catch(() => ({ data: null })),
        payrollAPI.getMyBankAccount().catch(() => ({ data: null }))
      ]);
      setStructure(structRes.data);
      if (bankRes.data) {
        setBankAccount(bankRes.data);
      }
    } catch (err) {
      showToast("Failed to load salary data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenBankModal = () => {
    if (bankAccount) {
      setBankFormData({
        account_holder_name: bankAccount.account_holder_name,
        bank_name: bankAccount.bank_name,
        account_number: bankAccount.account_number,
        ifsc_code: bankAccount.ifsc_code,
        branch_name: bankAccount.branch_name || ""
      });
    } else {
      setBankFormData({
        account_holder_name: "", bank_name: "", account_number: "", ifsc_code: "", branch_name: ""
      });
    }
    setIsBankModalOpen(true);
  };

  const handleBankSubmit = async (e) => {
    e.preventDefault();
    try {
      await payrollAPI.upsertMyBankAccount(bankFormData);
      showToast("Bank details updated successfully");
      setIsBankModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to update bank details", "error");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="My Salary Details" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-5xl mx-auto w-full">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiCurrencyRupee className="text-purple-600 w-7 h-7" /> Salary & Bank Details
            </h1>
            <p className="text-sm text-slate-500 mt-1">View your current salary structure and manage deposit details.</p>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Left Column - Salary Structure */}
              <div className="md:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Current Salary Structure</h2>
                      {structure && <p className="text-xs text-slate-500 mt-0.5">Effective from {new Date(structure.effective_from).toLocaleDateString()}</p>}
                    </div>
                    {structure && (
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Annual CTC</p>
                        <p className="text-xl font-black text-purple-700">₹{parseFloat(structure.annual_ctc || 0).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                  
                  {structure ? (
                    <div className="p-6">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                            <th className="px-4 py-3 rounded-l-lg">Component</th>
                            <th className="px-4 py-3 text-right">Monthly</th>
                            <th className="px-4 py-3 text-right rounded-r-lg">Annually</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                          {(structure.components || []).map((line, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-medium text-slate-800">{line.name}</td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-700">₹{parseFloat(line.monthly_amount || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-800">₹{parseFloat(line.annual_amount || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-100">
                           <tr className="bg-slate-50/50">
                             <td className="px-4 py-3 font-bold text-slate-800">Gross Earnings</td>
                             <td className="px-4 py-3 text-right font-black text-purple-600">₹{parseFloat(structure.monthly_gross || 0).toLocaleString()}</td>
                             <td className="px-4 py-3 text-right font-black text-purple-700">₹{parseFloat(structure.annual_ctc || 0).toLocaleString()}</td>
                           </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      Your salary structure has not been assigned yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column - Bank Details */}
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <HiLibrary className="text-purple-600 w-5 h-5" /> Bank Details
                    </h2>
                    {bankAccount && bankAccount.verification_status === 'verified' && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase">Verified</span>
                    )}
                  </div>
                  <div className="p-6 flex-1">
                    {bankAccount ? (
                      <div className="space-y-4 text-sm">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Account Holder</p>
                          <p className="font-semibold text-slate-800">{bankAccount.account_holder_name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Bank Name</p>
                          <p className="font-semibold text-slate-800">{bankAccount.bank_name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Account Number</p>
                          <p className="font-mono font-medium text-slate-600">XXXX-XXXX-{bankAccount.account_number.slice(-4)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">IFSC Code</p>
                          <p className="font-mono font-medium text-slate-600">{bankAccount.ifsc_code}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-500 text-sm">
                        No bank details added.
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50">
                    <button onClick={handleOpenBankModal} className="w-full py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 transition">
                      {bankAccount ? "Update Details" : "Add Bank Details"}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>

      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{bankAccount ? "Update Bank Details" : "Add Bank Details"}</h2>
              <button onClick={() => setIsBankModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleBankSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Account Holder Name <span className="text-red-500">*</span></label>
                <input type="text" required value={bankFormData.account_holder_name} onChange={e => setBankFormData({...bankFormData, account_holder_name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Bank Name <span className="text-red-500">*</span></label>
                <input type="text" required value={bankFormData.bank_name} onChange={e => setBankFormData({...bankFormData, bank_name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Account Number <span className="text-red-500">*</span></label>
                <input type="text" required value={bankFormData.account_number} onChange={e => setBankFormData({...bankFormData, account_number: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">IFSC Code <span className="text-red-500">*</span></label>
                  <input type="text" required value={bankFormData.ifsc_code} onChange={e => setBankFormData({...bankFormData, ifsc_code: e.target.value.toUpperCase()})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Branch</label>
                  <input type="text" value={bankFormData.branch_name} onChange={e => setBankFormData({...bankFormData, branch_name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <p className="text-xs text-slate-400 italic">By updating this, you confirm these details are correct. HR may verify this account.</p>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsBankModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">Save Bank Details</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
