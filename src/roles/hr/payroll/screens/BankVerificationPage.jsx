import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { fetchAllOrgEmployees } from "../../../../shared/utils/orgEmployees";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiShieldCheck, HiSearch,
  HiRefresh, HiLibrary, HiUser,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatDate } from "../../../../shared/utils/formatUtils";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import { useAuth } from "../../../../shared/contexts/AuthContext";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

// Org employee rows carry `user_id` (the users.id every payroll route takes); they have no `id`.
const userId = (u) => u?.user_id ?? u?.id ?? u?._id;
// "No account yet" may come back as a 404 rather than an empty 200 — that is not a load failure.
const isNotFound = (err) => err?.status === 404 || err?.data?.errorCode === "BANK_ACCOUNT_NOT_FOUND";
const userName = (u) => u?.name || u?.display_name || [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.identifier || "Unknown";
const userDept = (u) => u?.department || u?.department_name || "N/A";

// Same wording as the claim approval guard in reimbursementMeta.js — HR meets
// this sentence in both places and it should read the same way.
const SOLE_HR_HINT = " If you're the only HR user, invite a second HR user to verify it.";

/**
 * Whether the signed-in HR user may verify this account, and the reason shown
 * in place of the button when they may not.
 *
 * Verifying is the one control between "an account number was typed in" and
 * "salary is paid to it", and only the account holder can enter it
 * (`PUT /payroll/me/bank-account` is self-scoped). So the person who typed the
 * number must not also be the person who clears it — that is self-approval, and
 * it is exactly how a payroll diversion goes unnoticed.
 *
 * This is a UI guard, not an authorisation boundary: the same rule has to hold
 * on `POST /payroll/hr/employees/:userId/bank-account/verify`.
 */
function verifyAction(account, { isSelf } = {}) {
  if (!account || account.is_verified) return { canVerify: false, reason: "" };
  if (isSelf) {
    return {
      canVerify: false,
      reason: `You can't verify your own bank account. Another HR user has to check it against your passbook or a cancelled cheque.${SOLE_HR_HINT}`,
    };
  }
  return { canVerify: true, reason: "" };
}

const ACCOUNT_KEYS = ["accounts", "bank_accounts", "records"];
const PAGE_LIMIT = 100; // backend maximum
const MAX_PAGES = 50;

/**
 * Every bank account in the org as `user_id -> account`, from the bulk list
 * endpoint. The grid used to make one request per employee (N+1); this is one
 * request per 100 employees. Rows carry masked account numbers only.
 */
async function fetchAllBankAccounts() {
  const first = await payrollAPI.getBankAccounts({ page: 1, limit: PAGE_LIMIT });
  const firstPage = normalizePaginated(first, ACCOUNT_KEYS, { page: 1, limit: PAGE_LIMIT });
  const pages = Math.min(MAX_PAGES, firstPage.totalPages);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => payrollAPI.getBankAccounts({ page: i + 2, limit: PAGE_LIMIT })))
    : [];

  const map = {};
  for (const row of [firstPage.items, ...rest.map((res) => normalizePaginated(res, ACCOUNT_KEYS).items)].flat()) {
    const id = row?.user_id;
    // Someone with several accounts: the primary one represents them.
    if (id && (!map[id] || row.is_primary)) map[id] = row;
  }
  return map;
}

const STATE = {
  verified: { label: "Verified", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  unverified: { label: "Awaiting verification", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  none: { label: "No account on file", pill: "bg-slate-50 text-slate-500 border-slate-200" },
  error: { label: "Couldn't load", pill: "bg-red-50 text-red-600 border-red-200" },
  loading: { label: "Checking…", pill: "bg-slate-50 text-slate-400 border-slate-200" },
};

/**
 * `unknown` is true when the account list itself failed to load. Saying "no
 * account on file" then would send HR chasing someone who is actually payable,
 * so the two stay distinct.
 */
const accountState = (acct, unknown = false) => {
  if (unknown && !acct) return "error";
  if (!acct) return "none";
  return acct.is_verified ? "verified" : "unverified";
};

// ── One account's details, read for the clicked row ─────────────────────────
function AccountPreview({ user, account, loading, failed, onClose, onVerify, verifying, isSelf }) {
  const state = loading && !account ? "loading" : accountState(account, failed);
  const present = !!account;
  const action = verifyAction(account, { isSelf });

  return (
    <DetailDialog
      eyebrow="Bank account"
      icon={HiLibrary}
      title={userName(user)}
      subtitle={userDept(user) !== "N/A" ? userDept(user) : undefined}
      badge={
        <>
          {isSelf && <DetailPill tone="muted">Your account</DetailPill>}
          <DetailPill tone="onDark">{STATE[state].label}</DetailPill>
        </>
      }
      loading={loading}
      onClose={onClose}
      footer={state === "unverified" && (
        <>
          {action.reason && <DetailFooterNote>{action.reason}</DetailFooterNote>}
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition">Close</button>
          {action.canVerify && (
            <button disabled={verifying} onClick={() => onVerify(user)} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-1.5">
              <HiShieldCheck className="w-4 h-4" /> {verifying ? "Verifying…" : "Verify account"}
            </button>
          )}
        </>
      )}
    >
      <DetailSection title="Employee" icon={HiUser}>
        <DetailGrid
          cols={3}
          items={[
            ["Name", userName(user)],
            ["Department", userDept(user)],
            ["Employee code", user?.employee_code || user?.emp_id],
          ]}
        />
      </DetailSection>

      {present ? (
        <DetailSection title="Account details" icon={HiLibrary}>
          <DetailGrid
            items={[
              ["Account holder", account.account_holder_name],
              { label: "Account number", value: account.masked_account_number, mono: true },
              { label: "IFSC code", value: account.ifsc_code, mono: true },
              ["Bank", account.bank_name],
              ["Branch", account.branch_name],
              ["Account type", account.account_type ? String(account.account_type).replace(/_/g, " ") : null],
              ["Verified on", account.verified_at ? formatDate(account.verified_at) : null],
            ]}
          />
        </DetailSection>
      ) : (
        <DetailSection title="Account details" icon={HiLibrary}>
          <p className="text-sm text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-4">
            {state === "error"
              ? "We couldn't load this employee's bank account. Refresh the page to try again."
              : state === "loading"
                ? "Checking for a bank account…"
                : <>This employee hasn&apos;t added their bank details yet. They can add them from their own <span className="font-semibold text-purple-700">My Salary &amp; Bank</span> page.</>}
          </p>
        </DetailSection>
      )}
    </DetailDialog>
  );
}

export default function BankVerificationPage() {
  // The session's own users.id — the id every payroll route keys on. The
  // /organizations/me profile can carry a different `id` (the employee row), so
  // AuthContext deliberately keeps the session one; use that and nothing else.
  const { user: viewer } = useAuth();
  const viewerId = viewer?.id;
  const isSelf = useCallback((u) => !!viewerId && userId(u) === viewerId, [viewerId]);

  const [employees, setEmployees] = useState([]);
  const [acctByUser, setAcctByUser] = useState({}); // user_id -> account
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState(""); // "", verified, unverified, none
  const [preview, setPreview] = useState(null); // { user, account, loading, failed }
  const [verifyingId, setVerifyingId] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // A newer load (or leaving the page) discards an older one's results.
  const loadReq = useRef(0);
  useEffect(() => () => { loadReq.current += 1; }, []);

  const loadData = useCallback(async () => {
    const reqId = ++loadReq.current;
    setLoading(true);
    // The roster names the people; the bulk list gives their accounts. Either
    // can fail on its own, so the page still shows what it has.
    const [empRes, acctRes] = await Promise.allSettled([
      fetchAllOrgEmployees({ includeInactive: false }),
      fetchAllBankAccounts(),
    ]);
    if (reqId !== loadReq.current) return;

    if (empRes.status === "fulfilled") setEmployees(empRes.value);
    else showToast(payrollErrorMessage(empRes.reason, "Failed to load employees"), "error");

    if (acctRes.status === "fulfilled") {
      setAcctByUser(acctRes.value);
      setAccountsFailed(false);
    } else {
      setAcctByUser({});
      setAccountsFailed(true);
      showToast(payrollErrorMessage(acctRes.reason, "Failed to load bank accounts"), "error");
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Clicking a row reads that one account fresh, so the dialog shows the
  // current details (and fills in anything the list doesn't carry).
  const openPreview = useCallback(async (user) => {
    const id = userId(user);
    setPreview({ user, account: acctByUser[id] || null, loading: true, failed: false });
    try {
      const res = await payrollAPI.getEmployeeBankAccount(id);
      const account = res?.data ?? null;
      setPreview((p) => (p && userId(p.user) === id ? { ...p, account, loading: false, failed: false } : p));
      setAcctByUser((m) => ({ ...m, [id]: account }));
    } catch (err) {
      const missing = isNotFound(err);
      setPreview((p) => (p && userId(p.user) === id ? { ...p, account: missing ? null : p.account, loading: false, failed: !missing } : p));
      if (missing) setAcctByUser((m) => ({ ...m, [id]: null }));
    }
  }, [acctByUser]);

  const handleVerify = useCallback(async (user) => {
    const id = userId(user);
    // The button is already hidden for your own account; this stops a stale
    // dialog or a re-render race from firing the request anyway. The backend
    // still has to refuse it — a client can always be bypassed.
    if (viewerId && id === viewerId) {
      showToast("You can't verify your own bank account — another HR user has to.", "error");
      return;
    }
    setVerifyingId(id);
    try {
      const res = await payrollAPI.verifyEmployeeBankAccount(id);
      const verified = res.data ?? { ...(acctByUser[id] || {}), is_verified: true };
      setAcctByUser((m) => ({ ...m, [id]: verified }));
      setPreview((p) => (p && userId(p.user) === id ? { ...p, account: verified } : p));
      showToast(`${userName(user)}'s account verified`);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to verify account"), "error");
    } finally {
      setVerifyingId(null);
    }
  }, [acctByUser, showToast, viewerId]);

  const counts = useMemo(() => {
    const c = { verified: 0, unverified: 0, none: 0 };
    employees.forEach((u) => {
      const st = accountState(acctByUser[userId(u)], accountsFailed);
      if (st in c) c[st] += 1;   // "error" is indeterminate — not tallied
    });
    return c;
  }, [employees, acctByUser, accountsFailed]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((u) => {
      const acct = acctByUser[userId(u)];
      if (stateFilter && accountState(acct, accountsFailed) !== stateFilter) return false;
      if (q && ![userName(u), u.employee_code].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [employees, acctByUser, accountsFailed, search, stateFilter]);

  return (
    <>
      <DashboardTopBar title="Bank Verification" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bank Verification</h1>
            <p className="text-sm text-slate-500 mt-1">Review and verify employee bank accounts before they receive salary payments. Click a row to see its details.</p>
          </div>
          <button onClick={loadData} disabled={loading} className="h-[42px] px-4 text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition flex items-center gap-2 disabled:opacity-60">
            <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Summary tiles double as quick filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { key: "", label: "All employees", value: employees.length, tone: "text-slate-800" },
            { key: "verified", label: "Verified", value: counts.verified, tone: "text-violet-600" },
            { key: "unverified", label: "Awaiting", value: counts.unverified, tone: "text-fuchsia-600" },
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
            placeholder="Search by name or code…"
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((u) => {
                    const id = userId(u);
                    const acct = acctByUser[id];
                    const state = accountState(acct, accountsFailed);
                    return (
                      <tr key={id} {...rowPreviewProps(() => openPreview(u), `View ${userName(u)}'s bank account`)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 text-xs"><GenderAvatar person={u} name={userName(u)} /></span>
                            <div>
                              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                {userName(u)}
                                {isSelf(u) && <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-bold uppercase tracking-wider">You</span>}
                              </p>
                              <p className="text-[11px] text-slate-400">{userDept(u)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{acct?.bank_name || <span className="text-slate-400 font-medium">N/A</span>}</td>
                        <td className="px-6 py-4 font-mono text-slate-600">{acct?.masked_account_number || <span className="font-sans text-slate-400 font-medium">N/A</span>}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${STATE[state].pill}`}>{STATE[state].label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">No employees match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {preview && (
        <AccountPreview
          user={preview.user}
          account={preview.account}
          loading={preview.loading}
          failed={preview.failed}
          verifying={verifyingId === userId(preview.user)}
          isSelf={isSelf(preview.user)}
          onVerify={handleVerify}
          onClose={() => setPreview(null)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
