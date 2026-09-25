// ─────────────────────────────────────────────────────────────────────────────
// DocumentAutomationPage.jsx — The overnight document jobs, what each one does,
// and a button to run it now for this organisation (#88–#92, #125, #129).
//
// Nothing here is needed for the module to be correct. Expiry and overdue are
// worked out every time anything is read, so a job that hasn't run yet can never
// make an expired document look valid or a late request look on time. The jobs
// write those verdicts down, send the day's emails, and clear out old files.
//
// So the honest framing on this screen is "run it early", not "fix it" — and the
// one job that genuinely can't be undone (the file clean-out) is separated from
// the other four and asks before it runs.
//
// Two things about the replies these endpoints give, which the UI has to respect:
//   · They answer 200 even when part of the run failed, with the failures in
//     `errors`. So success is `ok && errors.length === 0`, never the status code.
//   · The organisation is always the caller's own. There is no way to run one
//     of these for anybody else, and nothing on this screen suggests otherwise.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBell, HiCheckCircle, HiClock, HiExclamationCircle, HiExternalLink, HiInformationCircle,
  HiLightningBolt, HiLogout, HiMail, HiPlay, HiShieldCheck, HiTrash, HiUserAdd, HiUserGroup,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { fmtDateTime } from "../../../../shared/attendance/dates";
import { documentErrorMessage } from "../../../../shared/utils/documentErrors";
import { DOCUMENT_JOBS, jobResultOf, jobResultSummary } from "../../../../shared/documents/requestMeta";
import useDocumentSettings from "../../../../shared/documents/useDocumentSettings";
import { DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from "../../../../shared/documents/ui";

// One icon per job, keyed the same way the job list is.
const JOB_ICON = {
  expiry_sweep: HiClock,
  document_reminders: HiBell,
  notification_dispatch: HiMail,
  recipient_topup: HiUserAdd,
  offboarding_archive: HiLogout,
  publish_materialisation: HiUserGroup,
  document_sweeper: HiTrash,
};

/** Which settings have to be on for a job's emails to actually go anywhere. */
const JOB_DEPENDS_ON_SETTINGS = {
  document_reminders: ["document_notify_expiry", "document_notify_pending_acknowledgement", "document_notify_request_overdue"],
};

function JobCard({ job, result, busy, disabled, warning, onRun }) {
  const Icon = JOB_ICON[job.key] || HiLightningBolt;
  const failed = result && !result.ok;

  return (
    <div className={`rounded-2xl border bg-white shadow-xs p-5 flex flex-col ${job.destructive ? "border-rose-200" : "border-slate-100"}`}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${job.destructive ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-purple-600"}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-800">{job.title}</h3>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{job.schedule}, automatically</p>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-3 leading-relaxed">{job.blurb}</p>

      {warning && (
        <p className="flex items-start gap-2 text-[11px] text-fuchsia-900 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3 py-2 mt-3 leading-relaxed">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-px" /> <span>{warning}</span>
        </p>
      )}

      {result && (
        <div className={`rounded-xl border px-3 py-2.5 mt-3 ${failed ? "border-rose-200 bg-rose-50" : "border-violet-200 bg-violet-50/60"}`} role="status">
          <p className={`text-xs font-bold flex items-center gap-1.5 ${failed ? "text-rose-800" : "text-violet-800"}`}>
            {failed ? <HiExclamationCircle className="w-4 h-4 shrink-0" /> : <HiCheckCircle className="w-4 h-4 shrink-0" />}
            {failed ? "Ran, but not everything worked" : "Done"}
            {result.durationMs !== null && <span className="font-semibold text-slate-400">· {result.durationMs < 1000 ? `${result.durationMs} ms` : `${(result.durationMs / 1000).toFixed(1)} s`}</span>}
          </p>
          {!failed && <p className="text-[11px] text-slate-600 mt-1">{jobResultSummary(job, result)}</p>}
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.errors.slice(0, 3).map((err, i) => (
                <li key={i} className="text-[11px] font-semibold text-rose-700 break-words">
                  {typeof err === "string" ? err : err?.message || err?.error || JSON.stringify(err)}
                </li>
              ))}
              {result.errors.length > 3 && <li className="text-[11px] text-rose-600">…and {result.errors.length - 3} more.</li>}
            </ul>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5">Run at {fmtDateTime(result.at)}</p>
        </div>
      )}

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={onRun}
          disabled={busy || disabled}
          className={`${job.destructive ? DANGER_BTN : SECONDARY_BTN} w-full`}
        >
          {busy
            ? <><span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${job.destructive ? "border-rose-200 border-t-rose-600" : "border-purple-200 border-t-purple-600"}`} /> Running…</>
            : <><HiPlay className="w-4 h-4" /> Run it now</>}
        </button>
      </div>
    </div>
  );
}

export default function DocumentAutomationPage() {
  const { toast, showToast, clearToast } = useToast();
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState({});
  // Reading the settings is what lets this screen say "this job will send
  // nothing, because those emails are switched off" before somebody runs it and
  // wonders why nothing happened. A failed read just means no warnings.
  const { settings } = useDocumentSettings();

  const run = async (job) => {
    if (busy) return;
    // Two jobs ask first: the one that deletes files, and the one that closes
    // leavers' records down. Neither can be put back.
    const confirmMessage = job.destructive
      ? `Clear out old files now?\n\nThis permanently deletes uploads that were abandoned more than a day ago, and documents that were deleted long enough ago to be past your retention period. Documents required by law are never touched.\n\nThis can't be undone.`
      : job.confirmMessage;
    if (confirmMessage) {
      const ok = await window.confirm(confirmMessage);
      if (!ok) return;
    }
    setBusy(job.key);
    try {
      const result = jobResultOf(await documentsAPI[job.call]());
      setResults((r) => ({ ...r, [job.key]: { ...result, at: new Date().toISOString() } }));
      showToast(result.ok ? `${job.title}: ${jobResultSummary(job, result)}` : `${job.title} ran, but ${result.errors.length} ${result.errors.length === 1 ? "thing" : "things"} went wrong.`, result.ok ? "success" : "error");
    } catch (err) {
      showToast(documentErrorMessage(err, `Couldn't run ${job.title.toLowerCase()}.`), "error");
    } finally {
      setBusy("");
    }
  };

  /** "Emails are off" is a fact worth saying on the card, not after the run. */
  const warningFor = (job) => {
    const keys = JOB_DEPENDS_ON_SETTINGS[job.key];
    if (!keys || !settings) return "";
    const off = keys.filter((key) => settings[key] !== true);
    if (off.length < keys.length) return "";
    return "Every reminder email is switched off, so this will work out who is overdue but send nothing. Turn the ones you want on in Document Settings.";
  };

  const dispatchWarning = settings && !Object.keys(settings).some((k) => k.startsWith("document_notify_") && settings[k] === true)
    ? "No document emails are switched on, so there is probably nothing queued to send."
    : "";

  const routine = DOCUMENT_JOBS.filter((j) => !j.destructive);
  const destructive = DOCUMENT_JOBS.filter((j) => j.destructive);

  return (
    <>
      <DashboardTopBar title="Documents Automation" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Documents Automation</h1>
            <p className="text-sm text-slate-500 mt-1">
              The routines that run by themselves for your organisation, and what each one does. You can run any of them now — usually to see today’s reminders go out early, or to check something works.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <Link to="/dashboard/hr/documents/notifications" className={SECONDARY_BTN}>
              <HiMail className="w-4 h-4" /> Email log
            </Link>
            <Link to="/dashboard/hr/documents/settings" className={PRIMARY_BTN}>
              <HiLightningBolt className="w-4 h-4" /> Document Settings
            </Link>
          </div>
        </div>

        {/* The reassurance that makes this screen safe to hand to somebody: none
            of it is load-bearing. Said first, so nobody reads the buttons as
            repairs that have to be run. */}
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-5 py-4 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-white text-violet-600 flex items-center justify-center shrink-0"><HiShieldCheck className="w-5 h-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-violet-900">You never have to run these</p>
            <p className="text-xs text-violet-800 mt-0.5 leading-relaxed">
              Whether a document has expired, and whether a request is late, is worked out fresh every time anyone looks. So even if a routine is delayed, nobody ever sees an expired document as valid or a late request as on time. These routines write those verdicts down, send the day’s emails, and tidy up storage.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-800">Everyday routines</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">Safe to run at any time, as often as you like. Running one twice in a day does not send anybody two emails.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {routine.map((job) => (
              <JobCard
                key={job.key}
                job={job}
                result={results[job.key]}
                busy={busy === job.key}
                disabled={!!busy && busy !== job.key}
                warning={job.key === "notification_dispatch" ? dispatchWarning : job.confirmMessage ? "This changes records for good, so it asks before it runs. It happens by itself tonight anyway." : warningFor(job)}
                onRun={() => run(job)}
              />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-800">Clearing out</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">
            This one deletes files for good. It asks before it runs, and it never touches a document that’s required by law, however long ago it was deleted.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {destructive.map((job) => (
              <JobCard
                key={job.key}
                job={job}
                result={results[job.key]}
                busy={busy === job.key}
                disabled={!!busy && busy !== job.key}
                onRun={() => run(job)}
              />
            ))}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-white text-purple-600 flex items-center justify-center shrink-0"><HiInformationCircle className="w-5 h-5" /></span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">What “past retention” means</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  A deleted document is hidden straight away but kept for as long as your retention period says — whichever is longer, the document type’s own setting or the organisation’s. Only after that does this routine remove the file itself.
                </p>
                <Link to="/dashboard/hr/documents/settings" className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline mt-2">
                  See your retention period <HiExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Every run here covers your organisation only. Anything a routine reports as gone wrong is worth a look in the <Link to="/dashboard/hr/documents/notifications" className="font-bold text-purple-600 hover:underline">email log</Link> — a bad address is the usual cause, and it names the person.
        </p>
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
