import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { listFrom, unwrap } from "../../../../shared/attendance/normalize";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiDocumentReport, HiPlus, HiTrash,
  HiCalculator, HiCalendar, HiScale, HiPaperClip, HiEye, HiInformationCircle
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import AttachmentUploadButton from "../../../../shared/components/AttachmentUploadButton";
import AttachmentViewerDialog from "../../../../shared/components/AttachmentViewerDialog";
import { normalizeAttachment } from "../../../../shared/utils/reimbursementMeta";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { humanize } from "../../../../shared/attendance/enums";
import { STATUS_CHIP } from "../../../../shared/utils/statusChip";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthLabel = (pm) => {
  if (!pm) return "N/A";
  const [y, m] = String(pm).split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
function currentFY(d = new Date()) {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
const SECTIONS = ["80C", "80D", "80CCD(1B)", "80E", "80G", "80TTA", "24B (Home Loan Interest)", "HRA", "LTA", "Other"];

const STATUS_PILL = {
  draft: "bg-slate-50 text-slate-600 border-slate-200",
  submitted: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  under_review: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  verified: "bg-violet-50 text-violet-700 border-violet-200",
  partially_verified: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

const TABS = [
  { key: "summary", label: "Summary", icon: HiDocumentReport },
  { key: "declarations", label: "Declarations", icon: HiPaperClip },
  { key: "regime", label: "Regime", icon: HiScale },
  { key: "projection", label: "Projection", icon: HiCalculator },
  { key: "monthly", label: "Monthly TDS", icon: HiCalendar },
  { key: "form16", label: "Form 16", icon: HiDocumentReport },
];

export default function MyTaxAndInvestmentsPage() {
  const [tab, setTab] = useState("summary");
  const [fy] = useState(currentFY());
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
        <DashboardTopBar title="My Tax & Investments" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">My Tax &amp; Investments
            </h1>
            <p className="text-sm text-slate-500 mt-1">FY {fy} — your tax regime, investment declarations, the year’s tax estimate and Form 16.</p>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {tab === "summary" && <SummaryTab fy={fy} showToast={showToast} />}
          {tab === "declarations" && <DeclarationsTab fy={fy} showToast={showToast} />}
          {tab === "regime" && <RegimeTab fy={fy} showToast={showToast} />}
          {tab === "projection" && <ProjectionTab fy={fy} showToast={showToast} />}
          {tab === "monthly" && <MonthlyTab fy={fy} showToast={showToast} />}
          {tab === "form16" && <Form16Tab fy={fy} showToast={showToast} />}
        </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// The summary's regime arrives either as a code ("new") or as the regime record
// ({ id, code, name }) — reduce both to a lowercase code plus a display label.
function regimeCodeOf(data) {
  const raw = data?.regime_code ?? data?.regime;
  const code = raw && typeof raw === "object" ? raw.code ?? raw.regime_code : raw;
  return code ? String(code).toLowerCase() : "";
}

function regimeLabelOf(data) {
  const raw = data?.regime;
  if (raw && typeof raw === "object" && raw.name) return raw.name;
  const code = regimeCodeOf(data);
  return code ? `${code.charAt(0).toUpperCase()}${code.slice(1)} Regime` : "N/A";
}

function SummaryTab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const res = await payrollAPI.getMyTaxSummary({ financial_year: fy }); setData(res.data || res); }
      catch (err) { showToast(err.message || "Failed to load summary", "error"); }
      finally { setLoading(false); }
    })();
  }, [fy, showToast]);

  if (loading) return <Skeleton type="dashboard" />;
  if (!data) return <Empty text="No tax summary available yet." />;

  const ytd = data.ytd || data.actuals || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* House wording (CLAUDE.md §6): "TDS YTD" reads as "Income tax so far". */}
        <Stat k="Tax regime" v={regimeLabelOf(data)} />
        <Stat k="Income tax for the year" v={money(data.projected_annual_tax ?? data.projected_liability)} />
        <Stat k="Income tax so far" v={money(ytd.tds ?? ytd.income_tax)} />
        <Stat k="Income tax still to deduct" v={money(data.remaining_tds ?? data.balance_tds)} help={{ surface: "payroll.tax_summary", field: "remaining_tds", label: "income tax still to deduct" }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat k="PF so far" v={money(ytd.pf)} />
        <Stat k="ESI so far" v={money(ytd.esi)} />
        <Stat k="Professional tax so far" v={money(ytd.pt ?? ytd.professional_tax)} />
        <Stat k="Investment declaration" v={data.declaration_status && data.declaration_status !== "none" ? humanize(data.declaration_status) : "Not started"} />
      </div>
      {data.previous_employer && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-3"><HelpLabel text="Previous Employer (Form 12B)" help={{ surface: "payroll.tax_summary", field: "previous_employer", label: "previous employer income" }} /></h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <KV k="Gross" v={money(data.previous_employer.gross ?? data.previous_employer.previous_employer_gross)} />
            <KV k="TDS" v={money(data.previous_employer.tds ?? data.previous_employer.previous_employer_tds)} />
            <KV k="PF" v={money(data.previous_employer.pf ?? data.previous_employer.previous_employer_pf)} />
          </div>
        </div>
      )}
    </div>
  );
}

function DeclarationsTab({ fy, showToast }) {
  const [decl, setDecl] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewAttachment, setViewAttachment] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getMyDeclaration({ financial_year: fy });
      const d = res.data || res || {};
      setDecl(d);
      setItems((d.items || []).map((it) => ({
        item_id: it.item_id || it.id,
        section: it.section || "80C",
        sub_category: it.sub_category || "",
        declared_amount: it.declared_amount ?? "",
        verified_amount: it.verified_amount,
        proof_status: it.proof_status,
        proof_reference: it.proof_reference || "",
        attachments: (Array.isArray(it.attachments) ? it.attachments : []).map(normalizeAttachment).filter((a) => a && a.id),
        locked: it.sub_category === "EPF_AUTO",
      })));
    } catch (err) {
      showToast(err.message || "Failed to load declaration", "error");
    } finally {
      setLoading(false);
    }
  }, [fy, showToast]);

  useEffect(() => { load(); }, [load]);

  const status = decl?.status || "draft";
  const isDraft = status === "draft";
  const canProofs = status === "submitted" || status === "under_review";

  const setRow = (i, patch) => setItems((arr) => arr.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const addRow = () => setItems((arr) => [...arr, { section: "80C", sub_category: "", declared_amount: "", proof_reference: "" }]);
  const removeRow = (i) => setItems((arr) => arr.filter((_, x) => x !== i));

  const declaredTotal = items.reduce((s, i) => s + (parseFloat(i.declared_amount) || 0), 0);
  const verifiedTotal = items.reduce((s, i) => s + (parseFloat(i.verified_amount) || 0), 0);

  const saveDraft = async () => {
    setBusy(true);
    try {
      await payrollAPI.upsertMyDeclaration({
        items: items.filter((r) => !r.locked).map((r) => ({
          item_id: r.item_id || undefined,
          section: r.section,
          sub_category: r.sub_category || undefined,
          declared_amount: parseFloat(r.declared_amount) || 0,
          proof_reference: r.proof_reference || undefined,
        })),
      }, { financial_year: fy });
      showToast("Declaration saved");
      load();
    } catch (err) {
      showToast(err.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!(await window.confirm("Submit to HR? You will no longer be able to edit the declared amounts."))) return;
    setBusy(true);
    try {
      await payrollAPI.submitMyDeclaration({ financial_year: fy });
      showToast("Declaration submitted to HR");
      load();
    } catch (err) {
      showToast(err.message || "Submit failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveProofs = async () => {
    setBusy(true);
    try {
      await payrollAPI.recordMyDeclarationProofs({
        items: items.filter((r) => r.item_id && r.proof_reference).map((r) => ({ item_id: r.item_id, proof_reference: r.proof_reference })),
      }, { financial_year: fy });
      showToast("Proof references saved");
      load();
    } catch (err) {
      showToast(err.message || "Failed to save proofs", "error");
    } finally {
      setBusy(false);
    }
  };

  const canUploadProof = isDraft || canProofs;
  const removeProof = async (i, att) => {
    if (!(await window.confirm(`Remove ${att.file_name}?`))) return;
    try {
      await payrollAPI.deleteMyAttachment(att.id);
      setRow(i, { attachments: (items[i]?.attachments || []).filter((a) => a.id !== att.id) });
      showToast("Proof removed");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't remove this proof."), "error");
    }
  };

  if (loading) return <Skeleton type="table" rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={`${STATUS_CHIP} ${STATUS_PILL[status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>{humanize(status)}</span>
          {decl?.proof_deadline && <span className="text-slate-500">Proof deadline: {new Date(decl.proof_deadline).toLocaleDateString()}</span>}
        </div>
        {isDraft && (
          <button onClick={addRow} className="px-3 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition flex items-center gap-1.5"><HiPlus className="w-4 h-4" /> Add Item</button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
              <th className="px-5 py-3"><HelpLabel text="Section" help={{ surface: "payroll.tax_declaration", field: "section", label: "the section" }} /></th>
              <th className="px-5 py-3">Detail</th>
              <th className="px-5 py-3 text-right">Declared ₹</th>
              <th className="px-5 py-3 text-right"><HelpLabel text="Verified ₹" help={{ surface: "payroll.tax_declaration", field: "verified_amount", label: "the verified amount" }} /></th>
              <th className="px-5 py-3"><HelpLabel text="Proof Reference" help={{ surface: "payroll.tax_declaration", field: "proof_reference", label: "the proof reference" }} /></th>
              {isDraft && <th className="px-5 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((r, i) => (
              <tr key={r.item_id || i}>
                <td className="px-5 py-2.5">
                  {isDraft && !r.locked ? (
                    <select value={r.section} onChange={(e) => setRow(i, { section: e.target.value })} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400">
                      {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className="font-semibold text-slate-800">{r.section}</span>}
                </td>
                <td className="px-5 py-2.5">
                  {isDraft && !r.locked ? (
                    <input value={r.sub_category} onChange={(e) => setRow(i, { sub_category: e.target.value })} placeholder="e.g. LIC premium" className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400 w-40" />
                  ) : <span className="text-slate-500">{r.sub_category || "N/A"}</span>}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {isDraft && !r.locked ? (
                    <input type="number" min="0" value={r.declared_amount} onChange={(e) => setRow(i, { declared_amount: e.target.value })} className="w-28 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right outline-none focus:border-purple-400" />
                  ) : money(r.declared_amount)}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-600">{r.verified_amount != null ? money(r.verified_amount) : "N/A"}</td>
                <td className="px-5 py-2.5">
                  {(isDraft || canProofs) && !r.locked ? (
                    <input value={r.proof_reference} onChange={(e) => setRow(i, { proof_reference: e.target.value })} placeholder="link or ref #" className="w-44 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                  ) : <span className="text-slate-500 truncate block max-w-[11rem]">{r.proof_reference || "N/A"}</span>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {(r.attachments || []).map((att) => (
                      <span key={att.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-[11px] text-slate-700">
                        <span className="max-w-[100px] truncate">{att.file_name}</span>
                        <button type="button" onClick={() => setViewAttachment(att)} className="text-purple-600 hover:text-purple-800" aria-label="View proof"><HiEye className="w-3.5 h-3.5" /></button>
                        {canUploadProof && !r.locked && <button type="button" onClick={() => removeProof(i, att)} className="text-slate-400 hover:text-rose-600" aria-label="Remove proof"><HiTrash className="w-3.5 h-3.5" /></button>}
                      </span>
                    ))}
                    {canUploadProof && !r.locked && r.item_id && (
                      <AttachmentUploadButton
                        issue={(meta) => payrollAPI.requestDeclarationProofUpload(r.item_id, meta)}
                        confirm={(id) => payrollAPI.confirmMyAttachment(id)}
                        label="Add proof"
                        onUploaded={(att) => { setRow(i, { attachments: [...(items[i]?.attachments || []), att] }); showToast("Proof attached"); }}
                      />
                    )}
                    {canUploadProof && !r.locked && !r.item_id && <span className="text-[11px] text-slate-400">Save the draft to attach a proof file.</span>}
                  </div>
                </td>
                {isDraft && (
                  <td className="px-5 py-2.5">
                    {!r.locked && <button onClick={() => removeRow(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><HiTrash className="w-4 h-4" /></button>}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={isDraft ? 6 : 5} className="px-5 py-8 text-center text-slate-500">No items declared. {isDraft && "Click “Add Item” to start."}</td></tr>}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between text-sm">
          <span className="text-slate-500">Declared <span className="font-bold text-slate-800">{money(declaredTotal)}</span></span>
          <span className="text-slate-500">Verified <span className="font-bold text-violet-600">{money(verifiedTotal)}</span></span>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        {isDraft && (
          <>
            <button disabled={busy} onClick={saveDraft} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">Save Draft</button>
            <button disabled={busy || items.length === 0} onClick={submit} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">Submit to HR</button>
          </>
        )}
        {canProofs && (
          <button disabled={busy} onClick={saveProofs} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-1.5">
            <HiPaperClip className="w-4 h-4" /> Save Proof References
          </button>
        )}
      </div>

      {canUploadProof && <p className="text-[11px] text-slate-400">Uploaded proofs appear here once HR&apos;s copy is refreshed. You can attach a PDF, JPG, PNG or WebP up to 10 MB per item.</p>}

      {viewAttachment && <AttachmentViewerDialog attachment={viewAttachment} getViewUrl={payrollAPI.getMyAttachmentViewUrl} onClose={() => setViewAttachment(null)} />}
    </div>
  );
}

function RegimeTab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await payrollAPI.getMyTaxSummary({ financial_year: fy }); setData(res.data || res); }
    catch (err) { showToast(err.message || "Failed to load", "error"); }
    finally { setLoading(false); }
  }, [fy, showToast]);
  useEffect(() => { load(); }, [load]);

  const switchTo = async (code) => {
    setBusy(true);
    try {
      await payrollAPI.switchMyRegime({ regime_code: code }, { financial_year: fy });
      showToast(`Switched to ${code.toUpperCase()} regime`);
      load();
    } catch (err) {
      showToast(err.message || "Regime switch not allowed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton type="dashboard" />;
  const regime = regimeCodeOf(data);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <p className="md:col-span-2 -mb-2 flex items-center text-sm font-bold text-slate-700">
        Your tax regime <FieldHelp surface="payroll.tax_regime" field="regime_code" label="the tax regime" />
      </p>
      {[
        { code: "old", title: "Old Regime", blurb: "Lower slabs but you can claim HRA, 80C, 80D and other Chapter VI-A deductions." },
        { code: "new", title: "New Regime", blurb: "Higher standard deduction, wider slabs, but most exemptions are not available." },
      ].map((r) => (
        <div key={r.code} className={`bg-white rounded-2xl border-2 shadow-sm p-6 ${regime === r.code ? "border-purple-500" : "border-slate-100"}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg text-slate-800">{r.title}</h3>
            {regime === r.code && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded uppercase">Current</span>}
          </div>
          <p className="text-sm text-slate-500 mb-4">{r.blurb}</p>
          <button disabled={busy || regime === r.code} onClick={() => switchTo(r.code)} className="w-full px-4 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-40">
            {regime === r.code ? "Selected" : `Switch to ${r.title}`}
          </button>
        </div>
      ))}
    </div>
  );
}

// `/payroll/me/tax/projection` nests its figures — `annual_projected`,
// `projected_monthly`, a `tax` block and a `tds` block — and says whether
// income tax is switched on at all (`income_tax_enabled`, `tax.enabled`). The
// tab used to read flat keys (`projected_gross`, `total_tax`…) that the live
// reply doesn't have, so every tile said ₹0 and the only real content was a
// raw JSON dump. Flat keys stay as fallbacks for older servers.
function ProjectionTab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try { const res = await payrollAPI.getMyTaxProjection({ financial_year: fy }); if (alive) setData(res.data || res); }
      catch (err) { if (alive) showToast(payrollErrorMessage(err, "Couldn't load your tax projection"), "error"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [fy, showToast]);

  if (loading) return <Skeleton type="dashboard" />;
  if (!data) return <Empty text="No projection available yet." />;

  const tax = data.tax || {};
  const tds = data.tds || {};
  const annual = data.annual_projected || {};
  const monthly = data.projected_monthly || {};
  const taxOn = data.income_tax_enabled !== false && tax.enabled !== false;
  const limitations = Array.isArray(data.limitations) ? data.limitations.filter((l) => typeof l === "string") : [];
  const notes = Array.isArray(data.notes) ? data.notes.filter((n) => typeof n === "string") : [];

  return (
    <div className="space-y-4">
      {!taxOn && (
        <div className="flex items-start gap-2.5 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl px-4 py-3 text-sm">
          <HiInformationCircle className="w-5 h-5 shrink-0 mt-px text-indigo-500" />
          <p>Your organisation hasn’t switched on income tax deduction in payroll yet, so none is taken from your pay. The figures below are what your pay is expected to be for the year.</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat k="Taxable pay for the year" v={money(annual.gross_taxable ?? data.projected_gross ?? data.annual_gross)} />
        <Stat k="Taxable pay a month" v={money(monthly.taxable)} />
        <Stat k="Months left this year" v={data.months_remaining ?? "N/A"} />
        {taxOn && (
          <>
            <Stat k="Taxable income" v={money(tax.taxable_income ?? data.taxable_income)} />
            <Stat k="Income tax for the year" v={money(tax.total_liability ?? tax.annual_liability ?? data.total_tax ?? data.annual_tax)} />
            <Stat k="Income tax this month" v={money(tds.this_month ?? tds.monthly_tds ?? tds.amount ?? data.monthly_tds ?? data.tds_this_month)} />
          </>
        )}
        <Stat k="PF for the year" v={money(annual.epf ?? monthly.pf_employee)} />
        <Stat k="Professional tax for the year" v={money(annual.professional_tax)} />
        {taxOn && <Stat k="Standard deduction" v={money(tax.standard_deduction ?? data.standard_deduction)} help={{ surface: "payroll.tax_projection", field: "standard_deduction", label: "the standard deduction", overlay: true }} />}
      </div>
      {notes.length > 0 && (
        <ul className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-1.5 text-sm text-slate-600 list-disc pl-9">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {limitations.length > 0 && (
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <summary className="text-sm font-bold text-slate-700 cursor-pointer">What this estimate leaves out ({limitations.length})</summary>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-500 list-disc pl-5">
            {limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

// `/payroll/me/tax/monthly` has no documented response shape. Accept an array
// under a known key, or a map keyed by month ({ "2026-04": {...} }); anything
// else yields no rows instead of crashing the tab.
function monthlyTaxRows(res) {
  const list = listFrom(res, ["months", "monthly", "breakdown", "records"]);
  if (list.length) return list;
  const payload = unwrap(res);
  const map = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload.months || payload.monthly || payload) : null;
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.entries(map)
    .filter(([key, value]) => /^\d{4}-\d{2}/.test(key) && value && typeof value === "object")
    .map(([key, value]) => ({ period_month: key, ...value }));
}

function MonthlyTab({ fy, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const res = await payrollAPI.getMyMonthlyTax({ financial_year: fy }); setRows(monthlyTaxRows(res)); }
      catch (err) { showToast(err.message || "Failed to load", "error"); }
      finally { setLoading(false); }
    })();
  }, [fy, showToast]);

  if (loading) return <Skeleton type="table" rows={6} />;
  if (rows.length === 0) return <Empty text="No monthly tax data yet." />;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
            <th className="px-5 py-3">Month</th>
            <th className="px-5 py-3 text-right">TDS</th>
            <th className="px-5 py-3 text-right">PF</th>
            <th className="px-5 py-3 text-right">ESI</th>
            <th className="px-5 py-3 text-right">PT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((m) => (
            <tr key={m.period_month || m.month} className="hover:bg-slate-50/50">
              <td className="px-5 py-2.5 font-medium text-slate-700">{monthLabel(m.period_month || m.month)}</td>
              <td className="px-5 py-2.5 text-right font-semibold text-slate-800">{money(m.tds ?? m.income_tax)}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{money(m.pf)}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{money(m.esi)}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{money(m.pt ?? m.professional_tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Form16Tab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | unavailable
  const [viewAttachment, setViewAttachment] = useState(null);

  const fetchIt = async () => {
    setState("loading");
    try {
      const res = await payrollAPI.getMyForm16(fy);
      setData(res.data || res);
      setState("ready");
    } catch (err) {
      setState("unavailable");
      showToast(err.message || "Form 16 not finalized yet", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="font-bold text-slate-800"><HelpLabel text={`Form 16 — Part B (FY ${fy})`} help={{ surface: "payroll.form16", field: "form16", label: "Form 16" }} /></h3>
        <p className="text-sm text-slate-500 mt-1">Available only after HR finalizes the financial year. A provisional Form 16 is never issued.</p>
        <button onClick={fetchIt} disabled={state === "loading"} className="mt-4 px-4 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
          {state === "loading" ? "Checking…" : "Fetch My Form 16"}
        </button>
        {state === "unavailable" && <p className="mt-3 text-sm text-rose-600">Not finalized yet — check back after year-end closure.</p>}
        {state === "ready" && data?.part_a_attachment && (() => {
          const att = normalizeAttachment(data.part_a_attachment);
          if (!att?.id) return null;
          return (
            <button type="button" onClick={() => setViewAttachment(att)} className="mt-4 ml-3 px-4 py-2.5 rounded-xl font-bold text-sm text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition inline-flex items-center gap-1.5">
              <HiEye className="w-4 h-4" /> View Part A
            </button>
          );
        })()}
      </div>
      {state === "ready" && data && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <pre className="text-[11px] text-slate-600 whitespace-pre-wrap overflow-x-auto max-h-[28rem]">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
      {viewAttachment && <AttachmentViewerDialog attachment={viewAttachment} getViewUrl={payrollAPI.getMyAttachmentViewUrl} onClose={() => setViewAttachment(null)} />}
    </div>
  );
}

const Stat = ({ k, v, help }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
    <p className="text-[11px] font-bold text-slate-400 uppercase"><HelpLabel text={k} help={help} /></p>
    <p className="text-lg font-black text-slate-800 mt-1 capitalize">{v}</p>
  </div>
);
const KV = ({ k, v }) => (
  <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800">{v}</span></div>
);
const Empty = ({ text }) => (
  <div className="py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed text-slate-500">{text}</div>
);
