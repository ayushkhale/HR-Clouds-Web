// ─────────────────────────────────────────────────────────────────────────────
// leaves/AssignLeavePolicyDialog.jsx — Give one employee the leave days from a
// policy template (POST /leaves/users/:userId/assign-policy).
//
// One dialog, two callers: the employee profile's Leave tab, where the person is
// already decided, and the org-wide Leave Requests page, where they are not.
// That is the only difference between them, and it is a prop — a second copy of
// this form would drift from the first within a release (CLAUDE.md §2).
//
// It is a FORM, so it is not a DetailDialog (§3): wide-ish, gridded, pinned
// footer, nothing to scroll past.
//
// The thing this screen has to get right is that assignment is DESTRUCTIVE and
// silent about it. The server soft-deletes every existing config for the person,
// copies the template's rules in their place, and recomputes the year's balances
// pro-rata from their joining date. There is no undo and no warning in the
// reply. Three consequences shape everything below:
//
//  · WHAT THEY HAVE NOW IS SHOWN BEFORE, NOT AFTER. On the profile tab the
//    balances happen to be on screen beside the form; from a picker they are
//    not, and HR would be replacing rules they never saw. So choosing a person
//    reads their balances and lists exactly what is about to be replaced.
//
//  · A FAILED READ IS NOT AN EMPTY ONE. "Couldn't load" and "nothing on file"
//    look identical if both render as a blank list, and the first one invites a
//    destructive overwrite of rules that were actually there (§7). They are
//    separate states, and a failed read DISABLES the button rather than
//    letting someone assign blind.
//
//  · CONFIRMATION IS A STEP, NOT A NESTED MODAL. It has to name the person, the
//    template and the consequence, which is more than window.confirm can carry
//    — but stacking a second dialog over this one to say so would be a layer
//    nobody needs. It is the same shell showing a different face.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCalendar, HiExclamationCircle, HiInformationCircle, HiX } from "react-icons/hi";
import { leaveAPI } from "../api";
import { leaveErrorMessage } from "../utils/leaveErrors";
import { formatDayCount } from "../utils/formatUtils";
import { PersonSelect } from "../components/PersonPicker";
import FieldHelp from "../fieldHelp/FieldHelp";

const FIELD = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition disabled:opacity-60";
const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed";

/** What the balances read said, kept apart so a failure can never read as "none". */
const HAVE = { LOADING: "loading", NONE: "none", SOME: "some", FAILED: "failed", IDLE: "idle" };

/**
 * @param {object} props
 * @param {string} [props.userId]          fixed subject; omit to ask for one
 * @param {string} [props.subjectName]     who, when the caller already knows
 * @param {object[]} [props.people]        the roster, needed only without `userId`
 * @param {boolean} [props.peopleLoading]
 * @param {(message: string, userId: string) => void} props.onAssigned
 * @param {() => void} props.onClose
 * @param {string} [props.zIndex]          raise it over a host dialog (§3 stacking)
 */
export default function AssignLeavePolicyDialog({
  userId = "", subjectName = "", people = [], peopleLoading = false,
  onAssigned, onClose, zIndex = "z-[170]",
}) {
  const fixedSubject = !!userId;
  const [subject, setSubject] = useState(userId);
  const [subjectLabel, setSubjectLabel] = useState(subjectName);
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState({ rows: [], loading: true, error: null });
  const [have, setHave] = useState({ state: userId ? HAVE.LOADING : HAVE.IDLE, rows: [] });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Escape closes this and nothing underneath it — captured, because this can
  // sit over the request inspector, which has listeners of its own. Ignored
  // mid-write, so a stray key never looks like it cancelled the assignment.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busyRef.current) onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  // ── The templates on offer ─────────────────────────────────────────────────
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

  // ── What this person has today ─────────────────────────────────────────────
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

  const chosen = useMemo(
    () => templates.rows.find((t) => t.id === templateId) || null,
    [templates.rows, templateId],
  );
  const chosenIsEmpty = !!chosen && (chosen.entitlements?.length ?? 0) === 0;
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
      await leaveAPI.assignPolicy(subject, { template_id: templateId });
      onAssigned?.(
        `${who} now has the leave days from ${chosen?.name || "this policy"}.`,
        subject,
      );
      onCloseRef.current?.();
    } catch (err) {
      setError(leaveErrorMessage(err, "Couldn’t assign this policy. Nothing was changed."));
      setConfirming(false);
      setBusy(false);
    }
  };

  const pickPerson = (id, option) => {
    setSubject(id);
    setSubjectLabel(option?.name || "");
    setError("");
  };

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4`}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assign a leave policy"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <HiCalendar className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">Assign a leave policy</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {confirming
                  ? "Check this over — it replaces what they have now."
                  : "Gives somebody their leave days for this year, worked out from the day they joined."}
              </p>
            </div>
          </div>
          <button
            type="button" onClick={() => onCloseRef.current?.()} disabled={busy}
            className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {confirming ? (
            <>
              <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <HiExclamationCircle className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-fuchsia-800">
                      This replaces every leave rule {who} has
                    </p>
                    <p className="text-sm text-fuchsia-800 mt-1 leading-relaxed">
                      They’ll be given the days from <strong>{chosen?.name}</strong>, reduced for
                      however much of the year has already gone. Anything set just for them is lost,
                      and this can’t be undone.
                    </p>
                  </div>
                </div>
              </div>

              {have.state === HAVE.SOME && (
                <div>
                  <p className={LABEL}>What they have today</p>
                  <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {have.rows.map((row) => (
                      <li key={row.leave_type_id || row.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="text-sm font-semibold text-slate-700 min-w-0 truncate">
                          {row.leave_type?.name || "Leave"}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                          {formatDayCount(row.current_balance, { lower: true, fallback: "0 days" })} left
                        </span>
                      </li>
                    ))}
                  </ul>
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
              {!fixedSubject && (
                <div>
                  <label className={LABEL} htmlFor="alp-person">Who is this for</label>
                  <PersonSelect
                    id="alp-person"
                    people={people}
                    value={subject}
                    onChange={pickPerson}
                    loading={peopleLoading}
                    disabled={busy}
                    placeholder="Choose an employee"
                    aria-label="Employee"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <label className={`${LABEL} mb-0`} htmlFor="alp-template">Which policy</label>
                  <FieldHelp
                    surface="leaves.assign_policy"
                    field="template_id"
                    label="a leave policy"
                    ariaLabel="What does a leave policy give somebody?"
                    size="sm"
                  />
                </div>
                {templates.error ? (
                  <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
                    <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
                    {leaveErrorMessage(templates.error, "Couldn’t load the policies you can assign.")}
                  </p>
                ) : (
                  <select
                    id="alp-template"
                    value={templateId}
                    disabled={busy || templates.loading}
                    onChange={(e) => { setTemplateId(e.target.value); setError(""); }}
                    className={FIELD}
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

              {/* What is about to be replaced. Shown before the decision, not
                  after it — and a failed read says so rather than looking empty. */}
              <div>
                <p className={LABEL}>What they have now</p>
                {have.state === HAVE.IDLE ? (
                  <p className="text-xs text-slate-500 leading-relaxed">Choose somebody and their current leave days appear here.</p>
                ) : have.state === HAVE.LOADING ? (
                  <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-label="Loading their leave days" />
                ) : have.state === HAVE.FAILED ? (
                  <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3 leading-relaxed">
                    <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
                    Couldn’t load what they have now. Assigning is held back until it loads, because
                    this replaces their leave rules and you should see what is going.
                  </p>
                ) : have.state === HAVE.NONE ? (
                  <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
                    <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                    Nothing on file yet — this will be their first leave policy.
                  </p>
                ) : (
                  <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {have.rows.map((row) => (
                      <li key={row.leave_type_id || row.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="text-sm font-semibold text-slate-700 min-w-0 truncate">
                          {row.leave_type?.name || "Leave"}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                          {formatDayCount(row.current_balance, { lower: true, fallback: "0 days" })} left
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="flex items-start gap-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3 leading-relaxed" role="alert">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="mr-auto text-[11px] text-slate-500 max-w-[16rem] leading-relaxed">
            {confirming
              ? "Their days are worked out again from scratch."
              : !subject
                ? "Choose who this is for."
                : !templateId
                  ? "Choose the policy to give them."
                  : have.state === HAVE.FAILED
                    ? "Waiting to see what they have now."
                    : "You’ll get a chance to check it first."}
          </p>
          <button
            type="button"
            onClick={() => (confirming ? setConfirming(false) : onCloseRef.current?.())}
            disabled={busy}
            className={SECONDARY_BTN}
          >
            {confirming ? "Back" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => (confirming ? assign() : setConfirming(true))}
            disabled={!ready || busy}
            className={PRIMARY_BTN}
          >
            {busy ? "Assigning…" : confirming ? "Yes, assign it" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
