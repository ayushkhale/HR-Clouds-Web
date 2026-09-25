// ─────────────────────────────────────────────────────────────────────────────
// DocumentSettingsPage.jsx — Organisation-wide document rules (#23 / #24),
// org-settings registry #58–#78.
//
// Guard rails the server enforces, surfaced here before saving:
//   · separate checker + manager direct authority can't both be on (SETTINGS_CONFLICT)
//   · separate checker needs ≥ 2 active HR administrators (INSUFFICIENT_CHECKERS)
//   · virus scanning can't be turned on in Phase 1 (SCAN_PROVIDER_NOT_CONFIGURED)
//   · view link 30–900 s, upload link 60–3600 s, file size ≤ 25 MB, retention ≥ 30 days
//   · acknowledgement deadline 1–365 days (Phase 3)
//   · expiry reminder schedule ≤ 6 entries, each 0–365; request window 1–365
//     days; onboarding target 0–100% (Phase 4) — all SETTING_OUT_OF_RANGE
//   · the audience size above which publishing is handed to a background
//     worker, and the two offboarding defaults (Phase 5)
// Only changed fields are sent. The Phase 3, 4 and 5 keys are only sent when
// the server returned them, so an older server never sees a key it would reject.
//
// Every one of the five Phase 4 email switches starts OFF, and that is a
// deliberate default rather than an oversight: an organisation that turns the
// module on should not begin mailing its whole workforce the next morning. The
// card says so, because "why is nobody getting reminders?" is otherwise the
// first support question this feature generates.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { HiBadgeCheck, HiBell, HiClipboardList, HiCog, HiEye, HiLockClosed, HiLogout, HiMail, HiShieldCheck, HiUserGroup, HiInformationCircle } from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { documentErrorMessage } from "../../../../shared/utils/documentErrors";
import { DocErrorState, FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "../../../../shared/documents/ui";
import { invalidateDocumentSettings } from "../../../../shared/documents/useDocumentSettings";
import { fmtDateTime } from "../../../../shared/attendance/dates";
import { SIGNATURE_PROVIDERS } from "../../../../shared/documents/complianceMeta";

const MB = 1024 * 1024;

const NUMBERS = {
  document_view_url_ttl_seconds: { min: 30, max: 900, label: "View links stay valid for", unit: "seconds" },
  document_upload_url_ttl_seconds: { min: 60, max: 3600, label: "Upload links stay valid for", unit: "seconds" },
  document_max_file_size_mb: { min: 1, max: 25, label: "Largest file anyone can upload", unit: "MB" },
  document_retention_days: { min: 30, max: 36500, label: "Keep documents for", unit: "days" },
  document_acknowledgement_due_days: { min: 1, max: 365, label: "Default time to acknowledge", unit: "days" },
  document_request_default_due_days: { min: 1, max: 365, label: "Default time to provide a document", unit: "days" },
  document_onboarding_completeness_threshold: { min: 0, max: 100, label: "Onboarding target", unit: "%" },
  document_publish_sync_threshold: { min: 1, max: 1_000_000, label: "Hand a publish to the background above", unit: "people" },
};

// Phase 3 settings. Present on the read only once the server has them.
const COMPLIANCE_KEYS = ["document_acknowledgement_due_days", "document_acknowledgement_blocking", "document_signature_provider"];

// Phase 4 settings (#71–#78), likewise only sent once the server returns them.
const NOTIFY_SWITCHES = [
  {
    key: "document_notify_hr_on_upload",
    title: "Tell us when somebody uploads a document",
    description: "Every HR administrator gets an email as soon as an employee adds a document, so it doesn't sit unreviewed. Busy organisations usually leave this off and work from the Verification Queue instead.",
  },
  {
    key: "document_notify_expiry",
    title: "Warn people before their documents expire",
    description: "Emails the employee on each of the reminder days below — for passports, visas, licences and anything else with an end date. This is the one most organisations want on.",
  },
  {
    key: "document_notify_pending_acknowledgement",
    title: "Chase unread company documents",
    description: "A daily email each morning while somebody still owes an acknowledgement or a signature on a policy, until they do it or the document closes.",
  },
  {
    key: "document_notify_request_raised",
    title: "Tell people when you ask them for something",
    description: "Emails the employee the moment you or their manager asks for a document, with what you need, the deadline and your note. Off, the request only appears in their portal.",
  },
  {
    key: "document_notify_request_overdue",
    title: "Chase overdue documents",
    description: "A daily email each morning once a requested document passes its deadline. At most one a day and five in all, so nobody is buried.",
  },
];
const PHASE4_KEYS = [
  "document_expiry_reminder_days",
  ...NOTIFY_SWITCHES.map((s) => s.key),
  "document_request_default_due_days",
  "document_onboarding_completeness_threshold",
];

// Phase 5 settings (#79–#81), likewise only sent once the server returns them.
const OFFBOARD_MODE_OPTIONS = [
  { value: "archive", label: "Archive their documents", blurb: "Their file moves to Archived: kept and readable, but out of every active list. This is what most organisations want." },
  { value: "retain", label: "Leave their documents active", blurb: "Their documents stay exactly where they are. Policies, requests and emails are still closed down." },
];
const EXIT_PACK_SCOPE_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "employee_owned", label: "Their own documents only" },
  { value: "org_issued", label: "Company documents only" },
];
const PHASE5_KEYS = [
  "document_publish_sync_threshold",
  "document_offboarding_archive_mode",
  "document_offboarding_exit_pack_scope",
];

const REMINDER_DAYS_MAX_ENTRIES = 6;

/**
 * "30, 15, 7" → [30, 15, 7]. Unique and descending, which is how the server
 * stores it. Returns null when the text is malformed and [] for an empty box,
 * because clearing the schedule is a legitimate way to turn expiry reminders
 * off for good. Zero is allowed here (a reminder on the expiry day itself),
 * unlike the per-type schedule.
 */
function parseReminderDays(text) {
  const parts = String(text || "").split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return [];
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const days = [...new Set(parts.map(Number))];
  if (days.some((n) => n < 0 || n > 365)) return null;
  if (days.length > REMINDER_DAYS_MAX_ENTRIES) return null;
  return days.sort((a, b) => b - a);
}

const sameDays = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((n, i) => n === b[i]);

const toForm = (s) => ({
  ...s,
  document_max_file_size_mb: String(Math.round(((s.document_max_file_size_bytes || 10 * MB) / MB) * 10) / 10),
  document_view_url_ttl_seconds: String(s.document_view_url_ttl_seconds ?? 300),
  document_upload_url_ttl_seconds: String(s.document_upload_url_ttl_seconds ?? 600),
  document_retention_days: String(s.document_retention_days ?? 2555),
  document_acknowledgement_due_days: String(s.document_acknowledgement_due_days ?? 7),
  document_acknowledgement_blocking: !!s.document_acknowledgement_blocking,
  document_signature_provider: s.document_signature_provider || "internal_typed",
  // A stored empty array means "never warn anyone", which has to survive a
  // round trip through the text box — so it becomes an empty string, not the
  // default schedule.
  document_expiry_reminder_days: (Array.isArray(s.document_expiry_reminder_days) ? s.document_expiry_reminder_days : [30, 15, 7]).join(", "),
  document_request_default_due_days: String(s.document_request_default_due_days ?? 7),
  document_onboarding_completeness_threshold: String(s.document_onboarding_completeness_threshold ?? 100),
  ...Object.fromEntries(NOTIFY_SWITCHES.map((n) => [n.key, !!s[n.key]])),
  document_publish_sync_threshold: String(s.document_publish_sync_threshold ?? 20000),
  document_offboarding_archive_mode: s.document_offboarding_archive_mode || "archive",
  document_offboarding_exit_pack_scope: s.document_offboarding_exit_pack_scope || "all",
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
  // The server returns each phase's keys once it supports them. A key the read
  // didn't mention is never sent back, so an older server can't be handed a
  // field it would reject.
  const hasCompliance = !!saved && COMPLIANCE_KEYS.some((k) => k in saved);
  const hasAutomation = !!saved && PHASE4_KEYS.some((k) => k in saved);
  const hasEnterprise = !!saved && PHASE5_KEYS.some((k) => k in saved);

  const problems = useMemo(() => {
    if (!form) return {};
    const out = {};
    Object.entries(NUMBERS).forEach(([key, r]) => {
      if (COMPLIANCE_KEYS.includes(key) && !hasCompliance) return;
      if (PHASE4_KEYS.includes(key) && !hasAutomation) return;
      if (PHASE5_KEYS.includes(key) && !hasEnterprise) return;
      const n = Number(form[key]);
      if (!Number.isFinite(n) || n < r.min || n > r.max) out[key] = `Between ${r.min} and ${r.max} ${r.unit}.`;
    });
    if (hasAutomation && parseReminderDays(form.document_expiry_reminder_days) === null) {
      out.document_expiry_reminder_days = `Up to ${REMINDER_DAYS_MAX_ENTRIES} whole numbers between 0 and 365, e.g. 30, 15, 7.`;
    }
    if (form.document_require_separate_checker && form.manager_direct_document_authority) {
      out.conflict = "Separate checker and manager direct authority can't both be on — turn one off.";
    }
    return out;
  }, [form, hasCompliance, hasAutomation, hasEnterprise]);

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
      ...(hasCompliance ? {
        document_acknowledgement_due_days: Number(form.document_acknowledgement_due_days),
        document_acknowledgement_blocking: !!form.document_acknowledgement_blocking,
        document_signature_provider: form.document_signature_provider,
      } : {}),
      ...(hasAutomation ? {
        document_expiry_reminder_days: parseReminderDays(form.document_expiry_reminder_days) || [],
        document_request_default_due_days: Number(form.document_request_default_due_days),
        document_onboarding_completeness_threshold: Number(form.document_onboarding_completeness_threshold),
        ...Object.fromEntries(NOTIFY_SWITCHES.map((n) => [n.key, !!form[n.key]])),
      } : {}),
      ...(hasEnterprise ? {
        document_publish_sync_threshold: Number(form.document_publish_sync_threshold),
        document_offboarding_archive_mode: form.document_offboarding_archive_mode,
        document_offboarding_exit_pack_scope: form.document_offboarding_exit_pack_scope,
      } : {}),
    };
    return Object.fromEntries(Object.entries(next).filter(([k, v]) => {
      // A key the server never sent is never sent back.
      if ((COMPLIANCE_KEYS.includes(k) || PHASE4_KEYS.includes(k) || PHASE5_KEYS.includes(k)) && !(k in saved)) return false;
      // The reminder schedule is an array, so `!==` would call it changed on
      // every render and leave the Save bar permanently up.
      if (Array.isArray(v)) return !sameDays(v, saved[k]);
      return v !== saved[k];
    }));
  }, [form, saved, hasCompliance, hasAutomation, hasEnterprise]);

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
      // Other screens cache this read for a minute; a save has to beat that.
      invalidateDocumentSettings();
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
                    description="Non-confidential documents of direct reports, for types that allow manager viewing. It also decides whether managers can propose an organisation document for someone on their team. Off hides every team document from managers and stops proposals."
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

            <Card
              title="Acknowledgements & signatures"
              icon={HiBadgeCheck}
              blurb="What happens when a company document asks people to acknowledge or sign it."
            >
              {hasCompliance ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4">
                    <div className="min-w-0">
                      {numberField("document_acknowledgement_due_days")}
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                        Used when a document asks for acknowledgement without its own deadline. Changing it only affects documents published from now on — existing deadlines stay as they are.
                      </p>
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="ds-provider" className={LABEL}>How people sign</label>
                      <select
                        id="ds-provider"
                        value={form.document_signature_provider}
                        onChange={(e) => set("document_signature_provider", e.target.value)}
                        className={FIELD}
                      >
                        {Object.entries(SIGNATURE_PROVIDERS).map(([code, p]) => (
                          <option key={code} value={code}>{p.label}{p.available ? "" : " (not connected yet)"}</option>
                        ))}
                      </select>
                      <p className={`text-[11px] mt-1.5 leading-relaxed ${SIGNATURE_PROVIDERS[form.document_signature_provider]?.available === false ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                        {SIGNATURE_PROVIDERS[form.document_signature_provider]?.hint || ""}
                      </p>
                    </div>
                  </div>
                  <SwitchRow
                    title="Flag overdue documents as a priority"
                    description="People with an overdue document see a stronger warning in Company Documents asking them to deal with it first. It doesn't lock anyone out of anything."
                    checked={form.document_acknowledgement_blocking}
                    onChange={(v) => set("document_acknowledgement_blocking", v)}
                  />
                </>
              ) : (
                <p className="flex items-start gap-2 text-xs text-slate-500 py-4">
                  <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0" />
                  These settings will appear here once your server has been updated. Until then, every document uses its own deadline and people sign by typing their name.
                </p>
              )}
            </Card>

            <Card
              title="Asking people for documents"
              icon={HiClipboardList}
              blurb="What happens when you or a manager asks somebody for a document, and how complete a new joiner's file has to be."
            >
              {hasAutomation ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4">
                  <div className="min-w-0">
                    {numberField("document_request_default_due_days")}
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      The deadline somebody gets when whoever asked them didn’t set one. They can always be given a specific date instead.
                    </p>
                  </div>
                  <div className="min-w-0">
                    {numberField("document_onboarding_completeness_threshold")}
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      How much of the required paperwork counts as complete. Leave it at 100% unless some of what you ask for genuinely isn’t essential. The score never rounds up to 100% while anything is outstanding.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="flex items-start gap-2 text-xs text-slate-500 py-4">
                  <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0" />
                  These settings will appear here once your server has been updated.
                </p>
              )}
            </Card>

            <Card
              title="Emails"
              icon={HiMail}
              blurb="Which document emails go out. All five start switched off, so turning the module on never surprises your workforce with a morning of reminders."
            >
              {hasAutomation ? (
                <>
                  {NOTIFY_SWITCHES.map((n) => (
                    <SwitchRow
                      key={n.key}
                      title={n.title}
                      description={n.description}
                      checked={!!form[n.key]}
                      onChange={(v) => set(n.key, v)}
                    />
                  ))}

                  <div className="py-4">
                    <label htmlFor="ds-reminder-days" className={LABEL}>Warn this many days before a document expires</label>
                    <input
                      id="ds-reminder-days"
                      type="text"
                      value={form.document_expiry_reminder_days}
                      onChange={(e) => set("document_expiry_reminder_days", e.target.value)}
                      placeholder="30, 15, 7"
                      className={FIELD}
                    />
                    <p className={`text-[11px] mt-1.5 leading-relaxed ${problems.document_expiry_reminder_days ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                      {problems.document_expiry_reminder_days
                        || (!form.document_notify_expiry
                          ? "Saved, but nothing is sent until expiry warnings are switched on above."
                          : (parseReminderDays(form.document_expiry_reminder_days) || []).length === 0
                            ? "Empty, so nobody is warned before a document expires. Add days like 30, 15, 7 to start warning them."
                            : `One email on each of these days before the expiry date. Up to ${REMINDER_DAYS_MAX_ENTRIES} days; 0 means on the day itself.`)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">A document type can set its own schedule, which wins for documents of that kind.</p>
                  </div>

                  {/* Queued is not delivered, and that distinction matters the
                      first time somebody says they never got an email. */}
                  <p className="flex items-start gap-2 text-[11px] text-slate-500 py-3 leading-relaxed">
                    <HiBell className="w-4 h-4 text-purple-500 shrink-0" />
                    <span>
                      Emails are queued and sent within about fifteen minutes; reminders go out at 8am. Nobody gets more than one reminder a day about the same thing.{" "}
                      <Link to="/dashboard/hr/documents/notifications" className="font-bold text-purple-600 hover:underline">See what has actually been sent</Link>.
                    </span>
                  </p>
                </>
              ) : (
                <p className="flex items-start gap-2 text-xs text-slate-500 py-4">
                  <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0" />
                  Document emails will appear here once your server has been updated. Until then, nothing is emailed automatically.
                </p>
              )}
            </Card>

            <Card
              title="When somebody leaves, and very large publishes"
              icon={HiLogout}
              blurb="What happens to a leaver's file when their paperwork is closed down, and the point at which a company-wide publish is handed to a background worker."
            >
              {hasEnterprise ? (
                <>
                  <div className="py-4">
                    <span className={LABEL}>A leaver’s own documents</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {OFFBOARD_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => set("document_offboarding_archive_mode", option.value)}
                          aria-pressed={form.document_offboarding_archive_mode === option.value}
                          className={`text-left rounded-xl border px-4 py-3 transition ${form.document_offboarding_archive_mode === option.value ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
                        >
                          <span className="block text-sm font-bold text-slate-800">{option.label}</span>
                          <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">{option.blurb}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      Either way, unsigned policies are excused, open requests are withdrawn and queued emails are stopped — that part isn’t optional, because it is what keeps a former employee from being chased by the system. Nothing they signed is ever altered.
                    </p>
                  </div>

                  <div className="py-4">
                    <label htmlFor="ds-exit-scope" className={LABEL}>What a leaver’s pack includes by default</label>
                    <select
                      id="ds-exit-scope"
                      value={form.document_offboarding_exit_pack_scope}
                      onChange={(e) => set("document_offboarding_exit_pack_scope", e.target.value)}
                      className={FIELD}
                    >
                      {EXIT_PACK_SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      Just the starting point — whoever builds the pack can change it for that one person.
                    </p>
                  </div>

                  <div className="py-4">
                    {numberField("document_publish_sync_threshold")}
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      Below this, publishing a company document hands it to everyone at once and the screen waits a second or two. Above it, the document goes live immediately and the rest of the recipients are filled in by a background worker over the next few minutes, with progress on screen. Unless you have tens of thousands of people, you will never reach this.
                    </p>
                  </div>
                </>
              ) : (
                <p className="flex items-start gap-2 text-xs text-slate-500 py-4">
                  <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0" />
                  These settings will appear here once your server has been updated. Until then a leaver’s documents are archived, their pack includes everything, and every publish is handed out at once.
                </p>
              )}
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
