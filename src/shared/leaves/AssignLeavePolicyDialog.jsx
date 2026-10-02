// ─────────────────────────────────────────────────────────────────────────────
// leaves/AssignLeavePolicyDialog.jsx — Give people the leave days from a policy
// template, one person (POST /leaves/users/:userId/assign-policy) or a whole
// department at a time (POST /leaves/assignments/preview, then …/bulk).
//
// One dialog, four callers: the employee profile's Leave tab, where the person is
// already decided; the org-wide Leave Requests page, where they are not; Setup ›
// Leave Policies, where the POLICY is decided and HR picks the person
// (`templateId`); and Setup › Leave › Leave Assignment, which is the only one
// that may assign to many people (`allowBulk`). Those presets are the only
// differences, and they are props — a second copy of this form would drift from
// the first within a release (CLAUDE.md §2).
//
// It is a FORM, so it is not a DetailDialog (§3): gridded, pinned footer, nothing
// to scroll past. One person is two fields and stays narrow; many people is a
// dozen and goes wide (§3 — `max-w-md` on a multi-field form is a bug).
//
// The thing this screen has to get right is that assignment REPLACES what people
// have and is silent about it. The server closes every existing config for the
// person, copies the template's rules in their place, and recomputes the year's
// balances pro-rata from 1 January (or their joining date if they joined this
// year). Taken leave is never reset, but a quota that goes down takes days away.
// Four consequences shape everything below:
//
//  · WHAT THEY HAVE NOW IS SHOWN BEFORE, NOT AFTER. On the profile tab the
//    balances happen to be on screen beside the form; from a picker they are
//    not, and HR would be replacing rules they never saw. So choosing a person
//    reads their balances and lists exactly what is about to be replaced. For
//    many people the server does this far better — the PREVIEW is the same idea
//    at scale, and the assign button stays disabled until one has succeeded.
//
//  · A FAILED READ IS NOT AN EMPTY ONE. "Couldn't load" and "nothing on file"
//    look identical if both render as a blank list, and the first one invites a
//    destructive overwrite of rules that were actually there (§7). They are
//    separate states, and a failed read DISABLES the button rather than letting
//    someone assign blind.
//
//  · CONFIRMATION IS A STEP, NOT A NESTED MODAL. It has to name the person, the
//    template and the consequence, which is more than window.confirm can carry
//    — but stacking a second dialog over this one to say so would be a layer
//    nobody needs. It is the same shell showing a different face.
//
//  · BULK IS PER PERSON, NOT ALL-OR-NOTHING. The server assigns each person in
//    their own transaction and answers HTTP 200 with assigned / skipped / failed
//    lists. So the last step reports "12 of 24" and names who failed and why. A
//    toast that just says "Done" over seven failures is the bug this prevents.
//
// CONTRACT NOTES (live behaviour beats the spec — §9):
//  · `effective_from` MUST be today (IST); a future date is a 400
//    EFFECTIVE_DATE_NOT_SUPPORTED. A date picker whose only legal value is today
//    is a control that can only be got wrong, so there is none: the field is
//    omitted and the server dates it. Add the picker back with future dating.
//  · The employment type and job status values are CANONICAL (`full_time`, not
//    "Full-time"). `useTargetingOptions` derives its lists from whatever strings
//    the roster carries, which is right for the attendance rules and wrong here,
//    so only departments / locations / people come from it — the other two lists
//    are fixed in leaveAssignmentMeta.js.
//  · Over the 200-person cap the preview says `over_cap` and bulk refuses. The
//    targeting query cannot be paged, so HR is asked to narrow it. Don't invent
//    a chunking scheme: a second pass under a different selection would assign
//    people the preview never showed.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCalendar, HiCheckCircle, HiExclamationCircle, HiInformationCircle, HiX } from "react-icons/hi";
import { leaveAPI } from "../api";
import { leaveErrorMessage } from "../utils/leaveErrors";
import { formatDayCount } from "../utils/formatUtils";
import { PersonSelect, PersonMultiSelect } from "../components/PersonPicker";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import { useTargetingOptions, withSelected } from "../attendance/useTargetingOptions";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import FieldHelp from "../fieldHelp/FieldHelp";
import {
  EMPLOYMENT_TYPE_NOTE, EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS, PREVIEW_BUCKETS,
  blockReason, failureReason, skipReason,
} from "./leaveAssignmentMeta";

const FIELD = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition disabled:opacity-60";
const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed";

/** What the balances read said, kept apart so a failure can never read as "none". */
const HAVE = { LOADING: "loading", NONE: "none", SOME: "some", FAILED: "failed", IDLE: "idle" };

const NAMES_SHOWN = 12;

/**
 * Give focus back to whatever opened the dialog, ONCE, when the whole dialog
 * goes away. It lives in the parent rather than in Shell because switching
 * between One person and Many people swaps one child for another: a restore in
 * Shell's cleanup fired on that switch and threw focus back to the page button
 * behind the dialog, mid-edit.
 */
function useFocusReturn() {
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);
}

/** The shell both modes share: one header, one scrolling body, one pinned footer. */
function Shell({ zIndex, width, title, subtitle, busy, onClose, footerNote, footer, children }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Escape closes this and nothing underneath it — captured, because this can
  // sit over the request inspector, which has listeners of its own. Ignored
  // mid-write, so a stray key never looks like it cancelled the assignment.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busyRef.current) onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4`}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assign a leave policy"
        className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 transition-[max-width]`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <HiCalendar className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>
            </div>
          </div>
          <button
            type="button" onClick={() => onCloseRef.current?.()} disabled={busy}
            className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">{children}</div>

        <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="mr-auto text-[11px] text-slate-500 max-w-[20rem] leading-relaxed">{footerNote}</p>
          {footer}
        </div>
      </div>
    </div>
  );
}

function ErrorLine({ children }) {
  return (
    <p className="flex items-start gap-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3 leading-relaxed" role="alert">
      <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
      {children}
    </p>
  );
}

/** One person / Many people. Hidden entirely where only one is possible. */
function ModeToggle({ mode, onChange, disabled }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`${LABEL} mb-0`}>Who this is for</span>
        <FieldHelp surface="leaves.assign_policy" field="scope" label="who a policy is given to" size="sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[{ v: "one", l: "One person" }, { v: "many", l: "Many people" }].map((o) => (
          <button
            key={o.v} type="button" onClick={() => onChange(o.v)} disabled={disabled}
            aria-pressed={mode === o.v}
            className={`py-2.5 rounded-xl border text-xs font-bold transition disabled:opacity-50 ${mode === o.v ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The policy picker, identical in both modes. */
function TemplateField({ templates, templateId, onChange, disabled }) {
  const chosen = templates.rows.find((t) => t.id === templateId) || null;
  const chosenIsEmpty = !!chosen && (chosen.entitlements?.length ?? 0) === 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <label className={`${LABEL} mb-0`} htmlFor="alp-template">Which policy</label>
        <FieldHelp
          surface="leaves.assign_policy" field="template_id" label="a leave policy"
          ariaLabel="What does a leave policy give somebody?" size="sm"
        />
      </div>
      {templates.error ? (
        <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
          <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
          {leaveErrorMessage(templates.error, "Couldn’t load the policies you can assign.")}
        </p>
      ) : (
        <select
          id="alp-template" value={templateId} disabled={disabled || templates.loading}
          onChange={(e) => onChange(e.target.value)} className={FIELD}
        >
          <option value="">{templates.loading ? "Loading…" : "Choose a policy…"}</option>
          {templates.rows.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{(t.entitlements?.length ?? 0) === 0 ? " (no leave types yet)" : ""}
            </option>
          ))}
        </select>
      )}
      {chosenIsEmpty && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-600 mt-1.5">
          <HiInformationCircle className="w-3.5 h-3.5 shrink-0" />
          No leave types have been added to this policy, so they would get no days at all.
        </p>
      )}
      {!templates.loading && !templates.error && templates.rows.length === 0 && (
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          No policies have been set up yet. Create one in Leave Policies first.
        </p>
      )}
    </div>
  );
}

/** A named list of people from a preview or bulk bucket, trimmed to a readable length. */
function PeopleList({ people, describe }) {
  const shown = people.slice(0, NAMES_SHOWN);
  const hidden = people.length - shown.length;
  return (
    <ul className="mt-2 space-y-1">
      {shown.map((p, i) => (
        <li key={p.user_id || `p-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold">{p.name || "Loading…"}</span>
          {describe && <span className="opacity-80">{describe(p)}</span>}
        </li>
      ))}
      {hidden > 0 && <li className="text-xs opacity-70">and {hidden} more</li>}
    </ul>
  );
}

/* ─── One person ─────────────────────────────────────────────────────────── */

function OnePersonAssign({
  fixedSubject, userId, subjectName, people, peopleLoading, templates, templateId, setTemplateId,
  modeToggle, onAssigned, onClose, zIndex,
}) {
  const [subject, setSubject] = useState(userId);
  const [subjectLabel, setSubjectLabel] = useState(subjectName);
  const [have, setHave] = useState({ state: userId ? HAVE.LOADING : HAVE.IDLE, rows: [] });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-read whenever the person changes. A late answer for somebody who is no
  // longer selected must never be shown against the new name, so it is guarded
  // by a token rather than trusted to arrive in order.
  const haveReq = useRef(0);
  useEffect(() => {
    if (!subject) { setHave({ state: HAVE.IDLE, rows: [] }); return; }
    const token = ++haveReq.current;
    setHave({ state: HAVE.LOADING, rows: [] });
    leaveAPI.getUserBalances(subject)
      .then((res) => {
        if (token !== haveReq.current) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setHave({ state: rows.length ? HAVE.SOME : HAVE.NONE, rows });
      })
      .catch(() => {
        if (token !== haveReq.current) return;
        // Deliberately NOT an empty list. See the header note.
        setHave({ state: HAVE.FAILED, rows: [] });
      });
  }, [subject]);

  const chosen = useMemo(() => templates.rows.find((t) => t.id === templateId) || null, [templates.rows, templateId]);
  const who = subjectLabel || "this employee";

  // The read has to have SUCCEEDED, not merely finished: assigning over rules
  // nobody could see is the one mistake this dialog exists to prevent.
  const knowsWhatTheyHave = have.state === HAVE.SOME || have.state === HAVE.NONE;
  const ready = !!subject && !!templateId && knowsWhatTheyHave && !templates.loading;

  const assign = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      // `effective_from` is deliberately omitted — today is the only value the
      // server accepts, so let it date the assignment itself.
      const res = await leaveAPI.assignPolicy(subject, { template_id: templateId });
      const unchanged = res?.data?.outcome === "unchanged";
      onAssigned?.(
        unchanged
          ? `${who} was already on ${chosen?.name || "this policy"}, so nothing was changed.`
          : `${who} now has the leave days from ${chosen?.name || "this policy"}.`,
        subject,
      );
      onClose?.();
    } catch (err) {
      setError(leaveErrorMessage(err, "Couldn’t assign this policy. Nothing was changed."));
      setConfirming(false);
      setBusy(false);
    }
  };

  const balanceList = (rows) => (
    <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.leave_type_id || row.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
          <span className="text-sm font-semibold text-slate-700 min-w-0 truncate">{row.leave_type?.name || "Leave"}</span>
          <span className="text-xs text-slate-500 shrink-0 tabular-nums">
            {formatDayCount(row.current_balance, { lower: true, fallback: "0 days" })} left
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <Shell
      zIndex={zIndex}
      width="max-w-lg"
      busy={busy}
      onClose={onClose}
      title="Assign a leave policy"
      subtitle={confirming
        ? "Check this over — it replaces what they have now."
        : "Gives somebody their leave days for this year, worked out from the day they joined."}
      footerNote={confirming
        ? "Their days are worked out again from scratch."
        : !subject
          ? "Choose who this is for."
          : !templateId
            ? "Choose the policy to give them."
            : have.state === HAVE.FAILED
              ? "Waiting to see what they have now."
              : "You’ll get a chance to check it first."}
      footer={
        <>
          <button type="button" onClick={() => (confirming ? setConfirming(false) : onClose?.())} disabled={busy} className={SECONDARY_BTN}>
            {confirming ? "Back" : "Cancel"}
          </button>
          <button type="button" onClick={() => (confirming ? assign() : setConfirming(true))} disabled={!ready || busy} className={PRIMARY_BTN}>
            {busy ? "Assigning…" : confirming ? "Yes, assign it" : "Continue"}
          </button>
        </>
      }
    >
      {confirming ? (
        <>
          <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <HiExclamationCircle className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fuchsia-800">This replaces every leave rule {who} has</p>
                <p className="text-sm text-fuchsia-800 mt-1 leading-relaxed">
                  They’ll be given the days from <strong>{chosen?.name}</strong>, reduced for however much of the year has
                  already gone. Leave they have already taken is kept, but anything set just for them is lost, and this
                  can’t be undone.
                </p>
              </div>
            </div>
          </div>

          {have.state === HAVE.SOME && (
            <div>
              <p className={LABEL}>What they have today</p>
              {balanceList(have.rows)}
            </div>
          )}
          {have.state === HAVE.NONE && (
            <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
              <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
              They have nothing on file, so nothing is being taken away — this is their first policy.
            </p>
          )}
        </>
      ) : (
        <>
          {modeToggle}

          {!fixedSubject && (
            <div>
              <label className={LABEL} htmlFor="alp-person">Who is this for</label>
              <PersonSelect
                id="alp-person" people={people} value={subject} loading={peopleLoading} disabled={busy}
                onChange={(id, option) => { setSubject(id); setSubjectLabel(option?.name || ""); setError(""); }}
                placeholder="Choose an employee" aria-label="Employee"
              />
            </div>
          )}

          <TemplateField
            templates={templates} templateId={templateId} disabled={busy}
            onChange={(v) => { setTemplateId(v); setError(""); }}
          />

          {/* What is about to be replaced. Shown before the decision, not after
              it — and a failed read says so rather than looking empty. */}
          <div>
            <p className={LABEL}>What they have now</p>
            {have.state === HAVE.IDLE ? (
              <p className="text-xs text-slate-500 leading-relaxed">Choose somebody and their current leave days appear here.</p>
            ) : have.state === HAVE.LOADING ? (
              <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-label="Loading their leave days" />
            ) : have.state === HAVE.FAILED ? (
              <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3 leading-relaxed">
                <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
                Couldn’t load what they have now. Assigning is held back until it loads, because this replaces their
                leave rules and you should see what is going.
              </p>
            ) : have.state === HAVE.NONE ? (
              <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
                <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                Nothing on file yet — this will be their first leave policy.
              </p>
            ) : (
              balanceList(have.rows)
            )}
          </div>
        </>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
    </Shell>
  );
}

/* ─── Many people ────────────────────────────────────────────────────────── */

const EMPTY_TARGETING = {
  target_departments: [], target_locations: [], target_employment_types: [], target_job_statuses: [],
  included_users: [], excluded_users: [],
};

// The selectors that can START a selection. Exclusions deliberately aren't among
// them: a selection made only of people to leave out has nothing to narrow FROM
// and matches nobody. "Everyone except these two" is not expressible yet — it
// would need scope "all" together with excluded_users, which the contract
// doesn't confirm, so it isn't guessed at.
const POSITIVE_TARGETS = ["target_departments", "target_locations", "target_employment_types", "target_job_statuses", "included_users"];

function ManyPeopleAssign({ templates, templateId, setTemplateId, modeToggle, onAssigned, onClose, zIndex }) {
  const targeting = useTargetingOptions();
  const [scope, setScope] = useState("selection");
  const [form, setForm] = useState(EMPTY_TARGETING);
  const [step, setStep] = useState("form");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // `busy` state is one render behind the click that sets it, so two fast clicks
  // both saw false. This is read and written synchronously.
  const inFlight = useRef(false);

  const chosen = useMemo(() => templates.rows.find((t) => t.id === templateId) || null, [templates.rows, templateId]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    // Any change invalidates the preview: the token it issued is only good for
    // the selection it was asked about (409 PREVIEW_STALE otherwise).
    setPreview(null);
    setError("");
  }

  const narrowed = useMemo(() => POSITIVE_TARGETS.some((k) => form[k].length > 0), [form]);
  const onlyExclusions = !narrowed && form.excluded_users.length > 0;

  const body = useCallback(() => {
    if (scope === "all") return { template_id: templateId, scope: "all" };
    const out = { template_id: templateId, scope: "selection" };
    Object.entries(form).forEach(([key, value]) => { if (value.length) out[key] = value; });
    return out;
  }, [scope, templateId, form]);

  const canPreview = !!templateId && !templates.loading && (scope === "all" || narrowed);

  async function runPreview() {
    if (!canPreview || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await leaveAPI.previewBulkAssign(body());
      setPreview(res?.data ?? res ?? null);
      setStep("preview");
    } catch (err) {
      setError(leaveErrorMessage(err, "Couldn’t work out who this would affect."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function runBulk() {
    if (!preview || inFlight.current || preview.over_cap) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = body();
      if (preview.preview_token) payload.preview_token = preview.preview_token;
      const res = await leaveAPI.bulkAssignPolicy(payload);
      setResult(res?.data ?? res ?? null);
      setStep("result");
    } catch (err) {
      // PREVIEW_STALE means somebody or something moved while HR was reading.
      // Drop the stale preview so the only way on is to look again.
      if (err?.data?.errorCode === "PREVIEW_STALE") { setPreview(null); setStep("form"); }
      setError(leaveErrorMessage(err, "Couldn’t assign the policy."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const counts = useMemo(() => ({
    changing: preview?.changing?.length ?? 0,
    unchanged: preview?.unchanged?.length ?? 0,
    blocked: preview?.blocked?.length ?? 0,
  }), [preview]);

  const assignedCount = result?.assigned?.length ?? 0;
  const skippedCount = result?.skipped?.length ?? 0;
  const failedCount = result?.failed?.length ?? 0;

  /** Honest, never "Done" over a pile of failures. */
  function finish() {
    const policy = result?.template?.name || chosen?.name || "the policy";
    const parts = [assignedCount === 1
      ? `1 person now has the leave days from ${policy}.`
      : `${assignedCount} people now have the leave days from ${policy}.`];
    if (skippedCount) parts.push(`${skippedCount} ${skippedCount === 1 ? "was" : "were"} already on it.`);
    if (failedCount) parts.push(`${failedCount} couldn’t be done.`);
    onAssigned?.(parts.join(" "));
    onClose?.();
  }

  const footer = step === "result" ? (
    <button type="button" onClick={finish} className={PRIMARY_BTN}>Done</button>
  ) : step === "preview" ? (
    <>
      <button type="button" onClick={() => setStep("form")} disabled={busy} className={SECONDARY_BTN}>Back</button>
      <button type="button" onClick={runBulk} disabled={busy || !preview || preview.over_cap || counts.changing === 0} className={PRIMARY_BTN}>
        {busy ? "Assigning…" : counts.changing === 0 ? "Nothing to change" : `Assign to ${counts.changing} ${counts.changing === 1 ? "person" : "people"}`}
      </button>
    </>
  ) : (
    <>
      <button type="button" onClick={() => onClose?.()} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
      <button type="button" onClick={runPreview} disabled={!canPreview || busy} className={PRIMARY_BTN}>
        {busy ? "Checking…" : "Check who this affects"}
      </button>
    </>
  );

  const footerNote = step === "result"
    ? "Anyone who failed can be tried again once their details are fixed."
    : step === "preview"
      ? "Nothing has been changed yet."
      : !templateId
        ? "Choose the policy to give out."
        : scope === "selection" && onlyExclusions
          ? "Leaving people out only narrows a group. Choose a department, a location or some people as well."
          : scope === "selection" && !narrowed
            ? "Choose a department, a location or some people — or switch to everyone."
            : "Nothing is written until you have seen who it affects.";

  return (
    <Shell
      zIndex={zIndex}
      width={step === "form" ? "max-w-4xl" : "max-w-3xl"}
      busy={busy}
      // Past the write, closing by ANY route has to report what happened —
      // Escape and the backdrop included, or the list behind would still show
      // the policies these people were on a moment ago.
      onClose={result ? finish : onClose}
      title="Assign a leave policy"
      subtitle={step === "result"
        ? "What happened, person by person."
        : step === "preview"
          ? "Who this affects, before anything is written."
          : "Give the same policy to a whole department, a location or a group of people."}
      footerNote={footerNote}
      footer={footer}
    >
      {step === "form" && (
        <>
          {modeToggle}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="sm:col-span-2">
              <TemplateField
                templates={templates} templateId={templateId} disabled={busy}
                onChange={(v) => { setTemplateId(v); setPreview(null); setError(""); }}
              />
            </div>

            <div className="sm:col-span-2">
              <span className={LABEL}>Who gets it</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { v: "selection", l: "A group I choose" },
                  { v: "all", l: "Everyone in the organisation" },
                ].map((o) => (
                  <button
                    key={o.v} type="button" aria-pressed={scope === o.v}
                    onClick={() => { setScope(o.v); setPreview(null); setError(""); }}
                    disabled={busy}
                    className={`py-2.5 rounded-xl border text-xs font-semibold transition disabled:opacity-50 ${scope === o.v ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {scope === "selection" && (
              <>
                {targeting.loading && (
                  <p className="sm:col-span-2 text-[11px] text-slate-400">Loading departments, locations and people…</p>
                )}
                <div>
                  <MultiSelectDropdown
                    label="Departments"
                    placeholder="Any department"
                    options={withSelected(targeting.departmentOptions, form.target_departments)}
                    value={form.target_departments}
                    onChange={(v) => set("target_departments", v)}
                  />
                </div>
                <div>
                  <MultiSelectDropdown
                    label="Office locations"
                    placeholder="Any location"
                    options={withSelected(targeting.locationOptions, form.target_locations)}
                    value={form.target_locations}
                    onChange={(v) => set("target_locations", v)}
                  />
                </div>
                <div>
                  <MultiSelectDropdown
                    label="Employment types"
                    placeholder="Any employment type"
                    options={EMPLOYMENT_TYPE_OPTIONS}
                    value={form.target_employment_types}
                    onChange={(v) => set("target_employment_types", v)}
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">{EMPLOYMENT_TYPE_NOTE}</p>
                </div>
                <div>
                  <MultiSelectDropdown
                    label="Where they are in their job"
                    placeholder="Any stage"
                    options={JOB_STATUS_OPTIONS}
                    value={form.target_job_statuses}
                    onChange={(v) => set("target_job_statuses", v)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Also include these people</label>
                  <PersonMultiSelect
                    people={targeting.employeePeople} value={form.included_users}
                    onChange={(v) => set("included_users", v)} placeholder="Nobody extra"
                    unknownLabel="Former employee" loading={targeting.loading} aria-label="Also include these people"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Leave these people out</label>
                  <PersonMultiSelect
                    people={targeting.employeePeople} value={form.excluded_users}
                    onChange={(v) => set("excluded_users", v)} placeholder="Nobody"
                    unknownLabel="Former employee" loading={targeting.loading} aria-label="Leave these people out"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">Leaving somebody out wins over every other choice above.</p>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {step === "preview" && preview && (
        <>
          <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3.5">
            <p className="text-sm font-bold text-purple-900">
              {preview.matched} {preview.matched === 1 ? "person matches" : "people match"} what you chose
            </p>
            <p className="text-sm text-purple-800 mt-1 leading-relaxed">
              {counts.changing} will be given the days from <strong>{preview.template?.name || chosen?.name}</strong>.
              Leave they have already taken is kept; their balance moves by the difference in days per year, worked out
              from 1 January, or from the day they joined if that was this year.
            </p>
          </div>

          {preview.over_cap && (
            <ErrorLine>
              That’s more people than can be done in one go{preview.cap ? ` (the limit is ${preview.cap})` : ""}. Narrow it
              down — one department at a time, for example — and check again.
            </ErrorLine>
          )}

          {PREVIEW_BUCKETS.map((bucket) => {
            const people = preview[bucket.key] || [];
            if (people.length === 0) return null;
            return (
              <div key={bucket.key} className={`rounded-2xl border px-4 py-3.5 ${bucket.tone}`}>
                <p className="text-sm font-bold">{bucket.title} — {people.length}</p>
                <p className="text-xs mt-1 leading-relaxed opacity-90">{bucket.note}</p>
                <PeopleList
                  people={people}
                  describe={bucket.key === "blocked"
                    ? (p) => blockReason(p.reason)
                    : bucket.key === "unchanged"
                      ? (p) => skipReason(p.reason)
                      : (p) => {
                        const bits = [];
                        bits.push(p.from_template ? `from ${p.from_template}` : p.legacy ? "policy not recorded until now" : "no policy until now");
                        if (p.overrides_replaced?.length) bits.push("their own rules will be replaced");
                        if (p.types_removed?.length) bits.push(`loses ${p.types_removed.join(", ")}`);
                        return bits.join(" · ");
                      }}
                />
              </div>
            );
          })}
        </>
      )}

      {step === "result" && result && (
        <>
          <div className={`rounded-2xl border px-4 py-3.5 ${failedCount ? "border-fuchsia-200 bg-fuchsia-50" : "border-violet-200 bg-violet-50"}`}>
            <p className={`flex items-center gap-2 text-sm font-bold ${failedCount ? "text-fuchsia-900" : "text-violet-900"}`}>
              {failedCount ? <HiExclamationCircle className="w-5 h-5 shrink-0" /> : <HiCheckCircle className="w-5 h-5 shrink-0" />}
              {assignedCount} of {assignedCount + skippedCount + failedCount} given {result.template?.name || chosen?.name}
            </p>
            <p className={`text-xs mt-1 leading-relaxed ${failedCount ? "text-fuchsia-800" : "text-violet-800"}`}>
              {skippedCount > 0 && `${skippedCount} ${skippedCount === 1 ? "was" : "were"} already on it and left alone. `}
              {failedCount > 0
                ? "The ones below were not changed at all. Fix what’s missing, then run this again — people already done are skipped."
                : "Everyone affected now has their days."}
            </p>
          </div>

          {failedCount > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-rose-800">
              <p className="text-sm font-bold">Not done — {failedCount}</p>
              <PeopleList people={result.failed} describe={(p) => failureReason(p.code)} />
            </div>
          )}
        </>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
    </Shell>
  );
}

/* ─── The dialog ─────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {string} [props.userId]          fixed subject; omit to ask for one
 * @param {string} [props.subjectName]     who, when the caller already knows
 * @param {object[]} [props.people]        the roster; defaults to the app-wide directory
 * @param {boolean} [props.peopleLoading]
 * @param {boolean} [props.allowBulk]      offer "Many people" (Leave Assignment only)
 * @param {(message: string, userId?: string) => void} props.onAssigned
 * @param {() => void} props.onClose
 * @param {string} [props.zIndex]          raise it over a host dialog (§3 stacking)
 * @param {string} [props.templateId]      preselected policy (Setup › Leave Policies)
 */
export default function AssignLeavePolicyDialog({
  userId = "", subjectName = "", people, peopleLoading, allowBulk = false,
  onAssigned, onClose, zIndex = "z-[170]", templateId: initialTemplateId = "",
}) {
  useFocusReturn();
  const fixedSubject = !!userId;
  const [mode, setMode] = useState("one");
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [templates, setTemplates] = useState({ rows: [], loading: true, error: null });

  // People come from one place (§7). Callers that already hold the roster pass
  // it; the rest get it from the same store rather than reading it again.
  const directory = useEmployeeDirectory({ enabled: !fixedSubject && people === undefined });
  const roster = people ?? directory.activeOptions;
  const rosterLoading = peopleLoading ?? (directory.status === "loading" || directory.status === "idle");

  const loadTemplates = useCallback(async () => {
    setTemplates((t) => ({ ...t, loading: true, error: null }));
    try {
      const res = await leaveAPI.getTemplates();
      setTemplates({ rows: Array.isArray(res?.data) ? res.data : [], loading: false, error: null });
    } catch (err) {
      setTemplates({ rows: [], loading: false, error: err });
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Only one workspace may assign in bulk, and only when nobody is fixed: a
  // dialog opened on one person must not quietly widen to their whole department.
  const bulkOffered = allowBulk && !fixedSubject;
  const modeToggle = bulkOffered ? <ModeToggle mode={mode} onChange={setMode} disabled={false} /> : null;

  const shared = { templates, templateId, setTemplateId, modeToggle, onAssigned, onClose, zIndex };

  return mode === "many" && bulkOffered
    ? <ManyPeopleAssign {...shared} />
    : <OnePersonAssign {...shared} fixedSubject={fixedSubject} userId={userId} subjectName={subjectName} people={roster} peopleLoading={rosterLoading} />;
}
