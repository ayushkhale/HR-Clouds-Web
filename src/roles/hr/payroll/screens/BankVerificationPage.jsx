import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiShieldCheck, HiSearch,
  HiRefresh, HiClock, HiEye,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatDate } from "../../../../shared/utils/formatUtils";

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

const userId = (u) => u?.id || u?.user_id || u?._id;
const userName = (u) => u?.name || u?.display_name || [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.identifier || "Unknown";
const userDept = (u) => u?.department || u?.department_name || "N/A";

// A failed #24 fetch is NOT the same as "no account on file" — telling HR an
// employee has no account when the request merely errored would send them
// chasing someone who is actually payable. Keep the states distinct.
const LOAD_ERROR = Symbol("load_error");

const STATE = {
  verified: { label: "Verified", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  unverified: { label: "Awaiting verification", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  none: { label: "No account on file", pill: "bg-slate-50 text-slate-500 border-slate-200" },
  error: { label: "Couldn't load", pill: "bg-red-50 text-red-600 border-red-200" },
  loading: { label: "Checking…", pill: "bg-slate-50 text-slate-400 border-slate-200" },
};

const accountState = (acct) => {
  if (acct === undefined) return "loading";
  if (acct === LOAD_ERROR) return "error";
  if (!acct) return "none";               // fulfilled with an explicit null = genuinely no account
  return acct.is_verified ? "verified" : "unverified";
};

// A real, present account is the only thing that opens the detail drawer.
const hasAccount = (acct) => acct != null && acct !== LOAD_ERROR && typeof acct === "object";

const initials = (name) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

// ── Full account detail (masked; the raw number is never returned by #24) ──
function AccountDrawer({ user, account, onClose, onVerify, verifying }) {
  const state = accountState(account);
  const rows = account
    ? [
        ["Account holder", account.account_holder_name],
        ["Account number", account.masked_account_number],
        ["IFSC code", account.ifsc_code],
        ["Bank", account.bank_name],
        ["Branch", account.branch_name],
        ["Account type", account.account_type],
        ["Verified by", account.verified_by_name || account.verified_by],
        ["Verified on", account.verified_at ? formatDate(account.verified_at) : null],
      ].filter(([, v]) => v != null && v !== "")
    : [];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Bank account</h2>
            <p className="text-xs text-slate-500">{userName(user)}{userDept(user) !== "N/A" ? ` · ${userDept(user)}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${STATE[state].pill}`}>{STATE[state].label}</span>
          </div>

          {state === "none" ? (
            <p className="text-center text-slate-400 py-8 text-sm">
              This employee hasn't added their bank details yet. They can add them from their own <span className="font-semibold text-slate-500">My Salary &amp; Bank</span> page.
            </p>
          ) : (
            <dl className="divide-y divide-slate-50 rounded-xl border border-slate-100 overflow-hidden">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-3">
                  <dt className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{k}</dt>
                  <dd className="text-sm font-semibold text-slate-800 text-right capitalize">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {state === "unverified" && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition">Close</button>
            <button disabled={verifying} onClick={() => onVerify(user)} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-1.5">
              <HiShieldCheck className="w-4 h-4" /> {verifying ? "Verifying…" : "Verify account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BankVerificationPage() {
  const [employees, setEmployees] = useState([]);
  const [acctByUser, setAcctByUser] = useState({}); // userId -> account | null
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState(""); // "", verified, unverified, none
  const [drawerUser, setDrawerUser] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fan out one #24 per employee, failure-isolated (no list endpoint exists).
  const enrichAccounts = useCallback(async (list) => {
    if (!list.length) { setAcctByUser({}); return; }
    setEnriching(true);
    const results = await Promise.allSettled(
      list.map((u) => payrollAPI.getEmployeeBankAccount(userId(u)))
    );
    const map = {};
    results.forEach((r, i) => {
      map[userId(list[i])] = r.status === "fulfilled" ? (r.value.data ?? null) : LOAD_ERROR;
    });
    setAcctByUser(map);
    setEnriching(false);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const empRes = await organizationAPI.getEmployees({ purpose: "emp_report" });
      const list = empRes.data?.records || empRes.data?.employees || empRes.data || [];
      setEmployees(list);
      enrichAccounts(list);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load employees"), "error");
    } finally {
      setLoading(false);
    }
  }, [enrichAccounts, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleVerify = useCallback(async (user) => {
    const id = userId(user);
    setVerifyingId(id);
    try {
      const res = await payrollAPI.verifyEmployeeBankAccount(id);
      const verified = res.data ?? { ...(acctByUser[id] || {}), is_verified: true };
      setAcctByUser((m) => ({ ...m, [id]: verified }));
      showToast(`${userName(user)}'s account verified`);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to verify account"), "error");
    } finally {
      setVerifyingId(null);
    }
  }, [acctByUser, showToast]);

  const counts = useMemo(() => {
    const c = { verified: 0, unverified: 0, none: 0 };
    employees.forEach((u) => {
      const st = accountState(acctByUser[userId(u)]);
      if (st in c) c[st] += 1;   // loading / error are indeterminate — not tallied
    });
    return c;
  }, [employees, acctByUser]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((u) => {
      const acct = acctByUser[userId(u)];
      if (stateFilter && accountState(acct) !== stateFilter) return false;
      if (q && !userName(u).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, acctByUser, search, stateFilter]);

  return (
    <>
      <DashboardTopBar title="Bank Verification" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bank Verification
            </h1>
            <p className="text-sm text-slate-500 mt-1">Review and verify employee bank accounts before they receive salary payments.</p>
          </div>
          <button onClick={loadData} className="h-[42px] px-4 text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition flex items-center gap-2">
            <HiRefresh className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Summary tiles double as quick filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { key: "", label: "All employees", value: employees.length, tone: "text-slate-800" },
            { key: "verified", label: "Verified", value: counts.verified, tone: "text-emerald-600" },
            { key: "unverified", label: "Awaiting", value: counts.unverified, tone: "text-amber-600" },
            { key: "none", label: "No account", value: counts.none, tone: "text-slate-500" },
          ].map((t) => (
            <button
              key={t.key || "all"}
              onClick={() => setStateFilter(t.key)}
              className={`text-left bg-white rounded-2xl border p-4 transition ${stateFilter === t.key ? "border-purple-300 ring-2 ring-purple-100" : "border-slate-100 hover:border-slate-200"}`}
            >
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t.label}</p>
              <p className={`text-2xl font-black mt-1 ${t.tone}`}>{t.value}</p>
            </button>
          ))}
        </div>

        <div className="relative mb-4 max-w-xs">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full h-[42px] pl-9 pr-4 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400"
          />
        </div>

        {loading ? <Skeleton type="table" rows={6} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Bank</th>
                    <th className="px-6 py-4">Account</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((u) => {
                    const id = userId(u);
                    const acct = acctByUser[id];
                    const state = accountState(acct);
                    return (
                      <tr key={id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-white text-xs font-bold flex items-center justify-center shrink-0">{initials(userName(u))}</span>
                            <div>
                              <p className="font-bold text-slate-800">{userName(u)}</p>
                              <p className="text-[11px] text-slate-400">{userDept(u)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{acct?.bank_name || <span className="text-slate-300 font-medium">N/A</span>}</td>
                        <td className="px-6 py-4 font-mono text-slate-600">{acct?.masked_account_number || <span className="font-sans text-slate-300 font-medium">N/A</span>}</td>
                        <td className="px-6 py-4">
                          {enriching && acct === undefined ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><HiClock className="w-3.5 h-3.5 animate-pulse" /> checking…</span>
                          ) : (
                            <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${STATE[state].pill}`}>{STATE[state].label}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {hasAccount(acct) && (
                              <button onClick={() => setDrawerUser(u)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition" title="View details"><HiEye className="w-4 h-4" /></button>
                            )}
                            {state === "unverified" && (
                              <button
                                disabled={verifyingId === id}
                                onClick={() => handleVerify(u)}
                                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-purple-700 rounded-lg transition flex items-center gap-1 disabled:opacity-50"
                              >
                                <HiShieldCheck className="w-3.5 h-3.5" /> {verifyingId === id ? "…" : "Verify"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No employees match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {drawerUser && (
        <AccountDrawer
          user={drawerUser}
          account={acctByUser[userId(drawerUser)]}
          verifying={verifyingId === userId(drawerUser)}
          onVerify={handleVerify}
          onClose={() => setDrawerUser(null)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
