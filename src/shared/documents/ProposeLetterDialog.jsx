// ─────────────────────────────────────────────────────────────────────────────
// documents/ProposeLetterDialog.jsx — A manager asks HR to issue a letter to
// one of their team (#145).
//
// A form (CLAUDE.md §3): wide, gridded, pinned footer, nothing to scroll past.
//
// What makes it different from the HR issue form is the whole point of the
// phase — pressing the button here creates a REQUEST, not a letter. Nothing is
// drawn, nothing is numbered and the employee sees nothing. Every line of copy
// on this screen protects that distinction, because a manager who believes a
// letter has gone out will tell the employee so.
//
// The letters and their fields are read from the caller's OWN plane, through
// the adapter — a manager from `/manager/letter-templates/:code`, HR from #136.
// Those manager reads did not exist when Phase 4 first shipped, which is why
// the screen behind this dialog still proves the feature is open before
// offering the button, rather than opening a form that cannot be submitted.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheckCircle, HiDocumentText, HiExclamationCircle, HiInformationCircle, HiPaperAirplane, HiUser, HiX,
} from "react-icons/hi";
import { PersonSelect } from "../components/PersonPicker";
import { documentErrorMessage, isProposalDuplicate, isProposalsDisabled } from "../utils/documentErrors";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { letterTemplateOf, letterTitle } from "./letterMeta";
import { letterOverridableFields, overrideProblems, overridesPayload, refusedFields } from "./letterIssueMeta";
import { PROPOSAL_REASON_MAX } from "./letterProposalMeta";

/**
 * @param {object} props
 * @param {object} props.plane                   LETTER_PROPOSAL_PLANES.manager
 * @param {object[]} props.templates             the letters that can be proposed (already filtered)
 * @param {object[]} props.people                the caller's team
 * @param {"idle"|"loading"|"ready"|"error"} [props.peopleStatus]
 * @param {(proposal: object) => void} props.onProposed
 * @param {() => void} [props.onDisabled]        the organisation has the path switched off
 * @param {() => void} props.onClose
 */
export default function ProposeLetterDialog({
  plane, templates = [], people = [], peopleStatus = "ready", onProposed, onDisabled, onClose,
}) {
  const [code, setCode] = useState(templates.length === 1 ? templates[0].code : "");
  const [subject, setSubject] = useState("");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState({});
  const [detail, setDetail] = useState({ data: null, loading: false, error: null });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busyRef.current) onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  /**
   * The letter's own fields (#136). Optional to the flow: without them the
   * proposal still goes, carrying no wording of its own — HR fills the gaps
   * from the organisation's saved wording when they issue it. So a failure
   * here disables the wording step, never the form.
   */
  const detailReq = useRef(0);
  useEffect(() => {
    if (!code) { setDetail({ data: null, loading: false, error: null }); return; }
    const token = ++detailReq.current;
    setDetail({ data: null, loading: true, error: null });
    // The viewer's OWN plane, never HR's: a manager reads the descriptor from
    // `/manager/letter-templates/:code`, which is the same payload.
    plane.templateDetail(code)
      .then((res) => { if (token === detailReq.current) setDetail({ data: letterTemplateOf(res), loading: false, error: null }); })
      .catch((error) => { if (token === detailReq.current) setDetail({ data: null, loading: false, error }); });
  }, [plane, code]);

  const template = detail.data?.template || null;
  const fields = useMemo(
    () => (template ? letterOverridableFields(template, code, refusedFields(code)) : []),
    [template, code],
  );

  useEffect(() => {
    setValues((prev) => {
      const allowed = new Set(fields.map((f) => f.key));
      const next = {};
      Object.entries(prev).forEach(([key, value]) => { if (allowed.has(key)) next[key] = value; });
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [fields]);

  const problems = useMemo(() => overrideProblems(fields, values), [fields, values]);
  const chosen = useMemo(() => templates.find((row) => row.code === code) || null, [templates, code]);
  const person = useMemo(() => people.find((p) => (p.user_id ?? p.id) === subject) || null, [people, subject]);
  const ready = !!code && !!subject && Object.keys(problems).length === 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const body = { template_code: code, subject_user_id: subject };
      const overrides = overridesPayload(fields, values);
      if (Object.keys(overrides).length) body.field_overrides = overrides;
      if (reason.trim()) body.reason = reason.trim();

      const res = await plane.propose(body);
      onProposed?.(res);
    } catch (err) {
      if (isProposalsDisabled(err)) onDisabled?.();
      setFailure(isProposalDuplicate(err)
        ? "You’ve already asked for this letter for this person and HR hasn’t decided yet. Wait for that one — asking twice doesn’t make it happen sooner."
        : documentErrorMessage(err, "Couldn’t send this to HR."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Ask HR for a letter"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <HiDocumentText className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 truncate">Ask HR for a letter</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                For someone on your team. HR decides whether it goes out — nothing reaches them until then.
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

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5 items-start">
            <div className="sm:col-span-2">
              <span className={LABEL}>Which letter</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {templates.map((row) => {
                  const picked = row.code === code;
                  return (
                    <button
                      key={row.code}
                      type="button"
                      onClick={() => { setCode(row.code); setValues({}); setFailure(""); }}
                      aria-pressed={picked}
                      disabled={busy}
                      className={`text-left rounded-xl border px-4 py-3 transition disabled:opacity-60 ${picked ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
                    >
                      <span className="flex items-center gap-2">
                        <HiDocumentText className={`w-4 h-4 shrink-0 ${picked ? "text-purple-600" : "text-slate-400"}`} />
                        <span className="text-sm font-bold text-slate-800 truncate">{letterTitle(row)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="pl-person" className={LABEL}>Who it is for</label>
              <PersonSelect
                id="pl-person"
                people={people}
                value={subject}
                onChange={(id) => { setSubject(id); setFailure(""); }}
                placeholder="Search your team"
                loading={peopleStatus === "loading"}
                error={peopleStatus === "error" ? "Couldn’t load your team. Refresh the page and try again." : ""}
                disabled={busy}
                aria-label="Team member the letter is for"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Only people who report to you. Their name, job title and dates come from their record.
              </p>
            </div>

            <div>
              <label htmlFor="pl-reason" className={LABEL}>Why you’re asking (optional)</label>
              <textarea
                id="pl-reason"
                rows={3}
                value={reason}
                maxLength={PROPOSAL_REASON_MAX}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
                placeholder="They’ve asked for one for a visa application"
                className={`${FIELD} resize-y`}
              />
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                HR reads this when they decide. It doesn’t appear on the letter.
              </p>
            </div>

            {code && fields.length > 0 && (
              <div className="sm:col-span-2">
                <span className={LABEL}>What the letter should say</span>
                {detail.loading ? (
                  <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {fields.map((field) => (
                      <div key={field.key} className={field.long ? "sm:col-span-2" : ""}>
                        <label htmlFor={`pl-${field.key}`} className={LABEL}>{field.label}</label>
                        {field.long ? (
                          <textarea
                            id={`pl-${field.key}`} rows={2} value={values[field.key] ?? ""} disabled={busy}
                            maxLength={field.max}
                            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                            className={`${FIELD} resize-y`}
                          />
                        ) : (
                          <input
                            id={`pl-${field.key}`} type="text" value={values[field.key] ?? ""} disabled={busy}
                            maxLength={field.max}
                            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                            className={FIELD}
                          />
                        )}
                        <p className={`text-[10px] mt-1 leading-relaxed ${problems[field.key] ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                          {problems[field.key] || field.help || "Leave it empty and HR will use your organisation’s standard wording."}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {code && !detail.loading && fields.length === 0 && (
              <p className="sm:col-span-2 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
                <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                {detail.error
                  ? "There’s nothing for you to fill in here — HR will use your organisation’s standard wording for this letter."
                  : "Every word of this letter comes from your team member’s record and your organisation’s standard wording, so there is nothing to type in."}
              </p>
            )}
          </div>

          {person && (
            <p className="flex items-center gap-2 text-xs text-slate-600 bg-purple-50/60 border border-purple-100 rounded-xl px-3.5 py-2.5">
              <HiUser className="w-4 h-4 text-purple-500 shrink-0" />
              This asks HR to issue <span className="font-bold">{chosen ? letterTitle(chosen) : "this letter"}</span> to <span className="font-bold">{person.name}</span>.
            </p>
          )}

          {failure && (
            <p className="flex items-start gap-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
              <HiExclamationCircle className="w-5 h-5 shrink-0" /> {failure}
            </p>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="mr-auto flex items-start gap-2 text-[11px] text-slate-500 max-w-sm leading-relaxed">
            <HiCheckCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
            This doesn’t issue anything. HR decides, and you’ll see what they decided here.
          </p>
          <button type="button" onClick={() => onCloseRef.current?.()} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="button" onClick={submit} disabled={!ready || busy} className={PRIMARY_BTN}>
            <HiPaperAirplane className="w-4 h-4" /> {busy ? "Sending…" : "Send to HR"}
          </button>
        </div>
      </div>
    </div>
  );
}
