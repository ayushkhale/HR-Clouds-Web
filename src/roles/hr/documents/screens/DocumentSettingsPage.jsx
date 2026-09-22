// ─────────────────────────────────────────────────────────────────────────────
// DocumentSettingsPage.jsx — Organisation-wide document rules (#23 / #24),
// org-settings registry #58–#67.
//
// Guard rails the server enforces, surfaced here before saving:
//   · separate checker + manager direct authority can't both be on (SETTINGS_CONFLICT)
//   · separate checker needs ≥ 2 active HR administrators (INSUFFICIENT_CHECKERS)
//   · virus scanning can't be turned on in Phase 1 (SCAN_PROVIDER_NOT_CONFIGURED)
//   · view link 30–900 s, upload link 60–3600 s, file size ≤ 25 MB, retention ≥ 30 days
// Only changed fields are sent.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { HiCog, HiEye, HiLockClosed, HiShieldCheck, HiUserGroup, HiInformationCircle } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { documentErrorMessage } from "../../../../shared/utils/documentErrors";
import { DocErrorState, FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "../../../../shared/documents/ui";
import { fmtDateTime } from "../../../../shared/attendance/dates";

const MB = 1024 * 1024;

const NUMBERS = {
  document_view_url_ttl_seconds: { min: 30, max: 900, label: "View links stay valid for", unit: "seconds" },
  document_upload_url_ttl_seconds: { min: 60, max: 3600, label: "Upload links stay valid for", unit: "seconds" },
  document_max_file_size_mb: { min: 1, max: 25, label: "Largest file anyone can upload", unit: "MB" },
  document_retention_days: { min: 30, max: 36500, label: "Keep documents for", unit: "days" },
};

const toForm = (s) => ({
  ...s,
  document_max_file_size_mb: String(Math.round(((s.document_max_file_size_bytes || 10 * MB) / MB) * 10) / 10),
  document_view_url_ttl_seconds: String(s.document_view_url_ttl_seconds ?? 300),
  document_upload_url_ttl_seconds: String(s.document_upload_url_ttl_seconds ?? 600),
  document_retention_days: String(s.document_retention_days ?? 2555),
});

function Card({ title, icon: Icon, blurb, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-100 shadow-xs ${className}`}>
      <div className="flex items-start gap-3 px-6 pt-5 pb-3">
        <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
        <div>
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          {blurb && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{blurb}</p>}
        </div>
      </div>
      <div className="px-6 pb-4 divide-y divide-slate-100">{children}</div>
    </section>
  );
}

export default function DocumentSettingsPage() {
  const { toast, showToast, clearToast } = useToast();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = (await documentsAPI.getSettings())?.data;
      setSaved(data);
      setForm(toForm(data || {}));
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const problems = useMemo(() => {
    if (!form) return {};
    const out = {};
    Object.entries(NUMBERS).forEach(([key, r]) => {
      const n = Number(form[key]);
      if (!Number.isFinite(n) || n < r.min || n > r.max) out[key] = `Between ${r.min} and ${r.max} ${r.unit}.`;
    });
    if (form.document_require_separate_checker && form.manager_direct_document_authority) {
      out.conflict = "Separate checker and manager direct authority can't both be on — turn one off.";
    }
    return out;
  }, [form]);

  const changes = useMemo(() => {
    if (!form || !saved) return {};
    const next = {
      manager_can_view_team_documents: !!form.manager_can_view_team_documents,
      manager_direct_document_authority: !!form.manager_direct_document_authority,
      document_require_separate_checker: !!form.document_require_separate_checker,
      employee_can_delete_verified_documents: !!form.employee_can_delete_verified_documents,
      document_default_verification_required: !!form.document_default_verification_required,
      document_scan_required: !!form.document_scan_required,
      document_view_url_ttl_seconds: Number(form.document_view_url_ttl_seconds),
      document_upload_url_ttl_seconds: Number(form.document_upload_url_ttl_seconds),
      document_max_file_size_bytes: Math.round(Number(form.document_max_file_size_mb) * MB),
      document_retention_days: Number(form.document_retention_days),
    };
    return Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== saved[k]));
  }, [form, saved]);

  const dirty = Object.keys(changes).length > 0;
  const blocked = Object.keys(problems).length > 0;

  const save = async () => {
    if (!dirty || blocked || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const data = (await documentsAPI.updateSettings(changes))?.data;
      setSaved(data);
      setForm(toForm(data || {}));
      showToast("Document settings saved");
    } catch (err) {
      setSaveError(documentErrorMessage(err, "Couldn't save the settings."));
    } finally {
      setSaving(false);
    }
  };

  const numberField = (key) => {
    const r = NUMBERS[key];
    return (
      <div key={key} className="min-w-0">
        <label htmlFor={`ds-${key}`} className={LABEL}>{r.label}</label>
        <div className="flex items-center gap-2">
          <input id={`ds-${key}`} type="number" min={r.min} max={r.max} value={form[key]} onChange={(e) => set(key, e.target.value)} className={FIELD} />
          <span className="text-xs font-semibold text-slate-500 shrink-0">{r.unit}</span>
        </div>
        <p className={`text-[10px] mt-1 ${problems[key] ? "font-semibold text-rose-600" : "text-slate-400"}`}>
          {problems[key] || `${r.min}–${r.max} ${r.unit}`}
        </p>
      </div>
    );
  };

  return (
    <>
      <DashboardTopBar title="Document Settings" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Who sees and decides documents, and how long links and files last. Applies to the whole organisation.
            {saved?.updated_at && <span className="text-slate-400"> Last changed {fmtDateTime(saved.updated_at)}.</span>}
          </p>
        </div>

        {error ? (
          <div className="bg-white rounded-2xl border border-slate-100"><DocErrorState error={error} onRetry={load} fallback="Couldn't load the document settings." /></div>
        ) : !form ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[0, 1, 2, 3].map((i) => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : (
          <>
            {/* Two equal columns of people rules, then one full-width card for
                the numbers. Equal switch counts per column keep the two sides
                the same height instead of leaving a hole under the short one. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <div className="flex flex-col gap-6">
                <Card title="Managers" icon={HiUserGroup} blurb="How much the reporting manager is involved in their team's documents.">
                  <SwitchRow
                    title="Managers can see their team's documents"
                    description="Non-confidential documents of direct reports, for types that allow manager viewing. Off hides every team document from managers."
                    checked={form.manager_can_view_team_documents}
                    onChange={(v) => set("manager_can_view_team_documents", v)}
                  />
                  <SwitchRow
                    title="Managers decide directly"
                    description="A manager's recommendation becomes the final decision — the document skips HR's Verification Queue."
                    checked={form.manager_direct_document_authority}
                    onChange={(v) => set("manager_direct_document_authority", v)}
                    note={form.manager_direct_document_authority && form.document_require_separate_checker ? "Can't be on together with Separate checker." : ""}
                  />
                </Card>
                <Card title="Employees" icon={HiLockClosed} blurb="What employees can do with their own verified documents.">
                  <SwitchRow
                    title="Employees can delete verified documents"
                    description="Only for types that also allow it. Statutory documents (PAN, Aadhaar, Form 16…) are never deletable by employees, whatever this says."
                    checked={form.employee_can_delete_verified_documents}
                    onChange={(v) => set("employee_can_delete_verified_documents", v)}
                  />
                </Card>
              </div>

              <Card title="Verification" icon={HiShieldCheck} blurb="The maker–checker rules for HR decisions." className="h-full">
                <SwitchRow
                  title="Separate checker"
                  description="The HR person who uploaded or proposed a document can't verify it — another HR administrator must. Needs at least two active HR administrators."
                  checked={form.document_require_separate_checker}
                  onChange={(v) => set("document_require_separate_checker", v)}
                  note={form.document_require_separate_checker && form.manager_direct_document_authority ? "Can't be on together with Managers decide directly." : ""}
                />
                <SwitchRow
                  title="New custom types need verification"
                  description="The starting value for “Needs verification” when HR creates a custom type. Existing types don't change."
                  checked={form.document_default_verification_required}
                  onChange={(v) => set("document_default_verification_required", v)}
                />
                <SwitchRow
                  title="Scan uploads for viruses"
                  description="Not available yet — no scanning service is connected, so it can't be turned on."
                  checked={false}
                  onChange={() => {}}
                  disabled
                />
              </Card>
            </div>

            <Card title="Links & storage" icon={HiEye} blurb="Every view and upload uses a short-lived secure link. A copied link stops working after this time.">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4 py-4">
                {numberField("document_view_url_ttl_seconds")}
                {numberField("document_upload_url_ttl_seconds")}
                {numberField("document_max_file_size_mb")}
                {numberField("document_retention_days")}
              </div>
              <p className="flex items-start gap-2 text-[11px] text-slate-500 py-3">
                <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0" />
                A document type can only lower the file-size limit, never raise it. Retention is recorded now; automatic purging starts in a later release.
              </p>
            </Card>

            {(problems.conflict || saveError) && (
              <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">{saveError || problems.conflict}</p>
            )}

            {dirty && (
              <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 bg-white/95 backdrop-blur border border-slate-200 shadow-lg rounded-2xl px-4 py-3">
                <p className="mr-auto text-xs font-semibold text-slate-600">
                  {Object.keys(changes).length} unsaved {Object.keys(changes).length === 1 ? "change" : "changes"}
                </p>
                <button type="button" onClick={() => { setForm(toForm(saved)); setSaveError(""); }} disabled={saving} className={SECONDARY_BTN}>Discard</button>
                <button type="button" onClick={save} disabled={blocked || saving} className={PRIMARY_BTN}>
                  <HiCog className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
