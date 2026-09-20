// ─────────────────────────────────────────────────────────────────────────────
// PayrollAutomationPage.jsx — the four background jobs, and a way to run each
// one now (API #212–#215).
//
// These normally run on a schedule. The manual triggers exist for when someone
// needs the result immediately — a reminder that should have gone out, a draft
// that is due today, a run wedged in "calculating".
//
// All four are org-scoped and idempotent: running one twice does not send the
// emails twice or create two drafts. That is worth saying on screen, because
// otherwise nobody dares press a button whose effect they cannot see.
//
// Whether each job runs on its own is configured in Payroll Settings; this page
// reads those switches and says which are off rather than presenting four
// buttons of equal standing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiMail, HiDocumentAdd, HiRefresh, HiTrash, HiPlay, HiCheckCircle,
  HiInformationCircle, HiCog, HiExclamationCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";

/**
 * `settingKey` is the switch that decides whether this job runs on its own.
 * `confirm` is asked before running anything that leaves the system — an email
 * nobody expected, or a file that cannot be brought back.
 */
const JOBS = [
  {
    key: "reminders",
    icon: HiMail,
    title: "Payroll reminders",
    what: "Emails the people who need to act: pay-day and cut-off dates coming up, and deadlines for tax declarations and proofs.",
    action: "Send reminders now",
    settingKey: "payroll_calendar_reminders_enabled",
    run: () => payrollAPI.runCalendarReminders(),
    confirm: "Send any reminder emails that are due right now?\n\nOnly people with something outstanding are emailed, and nobody is emailed twice for the same thing.",
    done: (d) => (d?.sent != null ? `${d.sent} reminder${d.sent === 1 ? "" : "s"} sent` : "Reminders sent"),
  },
  {
    key: "autoDraft",
    icon: HiDocumentAdd,
    title: "Next month's draft payroll",
    what: "Opens the draft run for the coming month so it is ready to calculate. Nothing is calculated or paid.",
    action: "Create the draft now",
    settingKey: "auto_draft_enabled",
    run: () => payrollAPI.runAutoDraft(),
    done: (d) => (d?.created ? "Draft payroll created" : "Nothing was due — no draft created"),
  },
  {
    key: "sweeper",
    icon: HiRefresh,
    title: "Stuck payroll runs",
    what: "If a calculation stops unexpectedly the run sits in “calculating” forever. This marks those as failed so they can be started again.",
    action: "Check for stuck runs",
    settingKey: "stale_run_sweep_enabled",
    run: () => payrollAPI.runRunSweeper(),
    done: (d) => (d?.swept ? `${d.swept} run${d.swept === 1 ? "" : "s"} reset` : "No stuck runs found"),
  },
  {
    key: "attachments",
    icon: HiTrash,
    title: "Old receipts and proofs",
    what: "Clears half-finished uploads, and permanently deletes files kept past the retention period set in Payroll Settings.",
    action: "Clear old files now",
    settingKey: "attachment_purge_enabled",
    run: () => payrollAPI.runAttachmentSweeper(),
    confirm: "Permanently delete files that are past their retention period?\n\nThis cannot be undone. Files still inside the retention period are not touched.",
    danger: true,
    done: (d) => (d?.purged != null ? `${d.purged} file${d.purged === 1 ? "" : "s"} removed` : "Old files cleared"),
  },
];

export default function PayrollAutomationPage() {
  const { toast, showToast, hideToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});

  const loadSettings = useCallback(() => {
    setLoading(true);
    payrollAPI.getSettings()
      .then((res) => setSettings(res?.data || {}))
      .catch(() => setSettings({}))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const runJob = async (job) => {
    if (busy) return;
    if (job.confirm && !(await window.confirm(job.confirm))) return;
    setBusy(job.key);
    try {
      const res = await job.run();
      const data = res?.data ?? res ?? {};
      const message = job.done(data);
      setResults((r) => ({ ...r, [job.key]: { message, at: new Date() } }));
      showToast(message);
    } catch (err) {
      showToast(payrollErrorMessage(err, `Couldn't run ${job.title.toLowerCase()}.`), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DashboardTopBar title="Automation" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Automatic jobs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Routine work payroll does on its own. You can also run any of it now if you need the result straight away.
          </p>
        </div>

        <p className="flex items-start gap-2 mb-6 text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
          <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
          <span>
            Running a job now is safe to repeat — nobody is emailed twice for the same thing and no duplicate drafts are
            created. Only your organisation is affected.
          </span>
        </p>

        {loading ? <Skeleton type="card" /> : (
          <div className="space-y-4">
            {JOBS.map((job) => {
              const Icon = job.icon;
              const scheduled = settings?.[job.settingKey] !== false;
              const running = busy === job.key;
              const result = results[job.key];
              return (
                <section key={job.key} className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${job.danger ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-purple-600"}`}>
                      <Icon className="w-5 h-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-800">{job.title}</h2>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          scheduled ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                          {scheduled ? "Runs on its own" : "Manual only"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{job.what}</p>

                      {!scheduled && (
                        <p className="flex items-start gap-1.5 mt-2 text-[11px] text-slate-500">
                          <HiCog className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-px" />
                          <span>This is switched off, so it only happens when you run it here. Turn it on in Payroll Settings.</span>
                        </p>
                      )}

                      {result && (
                        <p className="flex items-start gap-1.5 mt-2 text-[11px] font-semibold text-violet-800">
                          <HiCheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                          <span>{result.message} · {result.at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => runJob(job)}
                      disabled={!!busy}
                      className={`shrink-0 h-10 px-4 rounded-xl font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2 ${
                        job.danger
                          ? "bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
                          : "bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200"}`}
                    >
                      {running ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <HiPlay className="w-3.5 h-3.5" />}
                      {running ? "Running…" : job.action}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {!loading && !settings && (
          <p className="flex items-start gap-2 mt-4 text-[11px] font-semibold text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3.5 py-2.5">
            <HiExclamationCircle className="w-4 h-4 shrink-0" />
            <span>Couldn&apos;t read your settings, so the schedule shown above may not be accurate. The buttons still work.</span>
          </p>
        )}
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
