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
// Each job's schedule and status come from GET /payroll/hr/jobs (the cron the
// server actually runs). Payroll Settings can still switch a job off for this
// organisation; when it does, that wins and the card says "Manual only".
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiMail, HiDocumentAdd, HiRefresh, HiTrash, HiPlay, HiCheckCircle,
  HiInformationCircle, HiCog, HiExclamationCircle, HiClock,
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
    jobId: "calendar-reminders",
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
    jobId: "auto-draft",
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
    jobId: "run-sweeper",
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
    jobId: "attachment-sweeper",
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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isInt = (v) => /^\d+$/.test(v);
const clock = (h, m) => new Date(2000, 0, 1, Number(h), Number(m)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * A five-field cron expression in words, for the shapes the jobs use:
 * "*\/15 * * * *" → "Every 15 minutes", "0 8 * * *" → "Every day at 8:00 am",
 * "0 2 * * 0" → "Every Sunday at 2:00 am", "0 1 5 * *" → "On day 5 of each month
 * at 1:00 am". Anything else returns null and the raw expression is shown.
 */
function cronText(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const everyN = /^\*\/(\d+)$/.exec(min);
  if (everyN && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(everyN[1]);
    return n === 1 ? "Every minute" : `Every ${n} minutes`;
  }
  if (!isInt(min) || !isInt(hour) || Number(min) > 59 || Number(hour) > 23 || mon !== "*") return null;
  const at = clock(hour, min);
  if (dom === "*" && dow === "*") return `Every day at ${at}`;
  if (dom === "*" && isInt(dow) && Number(dow) <= 7) return `Every ${WEEKDAYS[Number(dow) % 7]} at ${at}`;
  if (isInt(dom) && dow === "*" && Number(dom) >= 1 && Number(dom) <= 31) return `On day ${Number(dom)} of each month at ${at}`;
  return null;
}

export default function PayrollAutomationPage() {
  const { toast, showToast, hideToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [jobs, setJobs] = useState(null); // id → job, from GET /payroll/hr/jobs
  const [jobsFailed, setJobsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});

  // Both reads only describe the jobs; the Run buttons work without either.
  const load = useCallback(() => {
    setLoading(true);
    setSettingsFailed(false);
    setJobsFailed(false);
    Promise.all([
      payrollAPI.getSettings()
        .then((res) => setSettings(res?.data || {}))
        .catch(() => { setSettings(null); setSettingsFailed(true); }),
      payrollAPI.getJobs()
        .then((res) => {
          const list = Array.isArray(res?.data) ? res.data : [];
          setJobs(new Map(list.filter((j) => j?.id).map((j) => [j.id, j])));
        })
        .catch(() => { setJobs(null); setJobsFailed(true); }),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
      <DashboardTopBar title="Payroll Automation" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Payroll Automation</h1>
            <p className="text-sm text-slate-500 mt-1">
              Routine work payroll does on its own. You can also run any of it now if you need the result straight away.
            </p>
          </div>

          <p className="flex items-start gap-2 lg:max-w-md shrink-0 text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
            <span>
              Running a job now is safe to repeat — nobody is emailed twice for the same thing and no duplicate drafts
              are created. Only your organisation is affected. Schedules are set by the platform and can&apos;t be
              changed here.
            </span>
          </p>
        </div>

        {loading ? <Skeleton type="card" /> : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {JOBS.map((job) => {
              const Icon = job.icon;
              // An org switch that is explicitly off wins ("Manual only"). Otherwise
              // the job list says whether the platform runs it and when; if that
              // couldn't be read, the state is unknown rather than guessed.
              const serverJob = jobs?.get(job.jobId) || null;
              const switchedOff = settings?.[job.settingKey] === false;
              const scheduled = switchedOff ? false
                : serverJob ? String(serverJob.status || "").toLowerCase() === "active"
                  : null;
              const when = serverJob?.schedule ? cronText(serverJob.schedule) || serverJob.schedule : "";
              const running = busy === job.key;
              const result = results[job.key];
              return (
                <section key={job.key} className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 h-full">
                  <div className="flex items-start gap-4">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${job.danger ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-purple-600"}`}>
                      <Icon className="w-5 h-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-800">{job.title}</h2>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          scheduled === true ? "bg-violet-50 text-violet-700 border-violet-200"
                            : scheduled === false ? "bg-slate-100 text-slate-500 border-slate-200"
                            : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                          {scheduled === true ? "Runs on its own" : scheduled === false ? "Manual only" : "Schedule unknown"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{job.what}</p>

                      {scheduled === true && when && (
                        <p className="flex items-start gap-1.5 mt-2 text-[11px] font-semibold text-slate-600" title={serverJob?.schedule ? `Cron: ${serverJob.schedule}` : undefined}>
                          <HiClock className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-px" />
                          <span>{when}</span>
                        </p>
                      )}
                      {serverJob && !switchedOff && scheduled === false && (
                        <p className="flex items-start gap-1.5 mt-2 text-[11px] text-slate-500">
                          <HiCog className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-px" />
                          <span>The platform has this job {String(serverJob.status || "paused").toLowerCase()}, so it only happens when you run it here.</span>
                        </p>
                      )}

                      {switchedOff && (
                        <p className="flex items-start gap-1.5 mt-2 text-[11px] text-slate-500">
                          <HiCog className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-px" />
                          <span>This is switched off in Payroll Settings, so it only happens when you run it here.</span>
                        </p>
                      )}
                      {scheduled === null && (
                        <p className="flex items-start gap-1.5 mt-2 text-[11px] text-slate-500">
                          <HiCog className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-px" />
                          <span>Couldn&apos;t read this job&apos;s schedule, so run it here when you need it.</span>
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
                      className={`shrink-0 h-9 px-3.5 rounded-xl font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2 ${
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

        {!loading && (settingsFailed || jobsFailed) && (
          <div className="flex items-start gap-2 mt-4 text-[11px] font-semibold text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3.5 py-2.5">
            <HiExclamationCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              Couldn&apos;t read {settingsFailed && jobsFailed ? "your settings or the job schedules" : settingsFailed ? "your settings" : "the job schedules"}, so what&apos;s shown above may not be accurate. The buttons still work.
            </span>
            <button type="button" onClick={load} className="shrink-0 font-bold text-purple-700 hover:underline">Try again</button>
          </div>
        )}
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
