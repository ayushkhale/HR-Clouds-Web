// ─────────────────────────────────────────────────────────────────────────────
// documents/RequestDocumentDialog.jsx — Ask one person for one kind of document
// (#80 for HR, #93 for a manager).
//
// Three fields, two of them optional, because the whole point is that asking
// should take five seconds. Leaving the date blank is the normal case: the
// server applies the organisation's standard window, which is one fewer
// decision than picking a date nobody will remember agreeing to.
//
// Two refusals are worth handling properly rather than as plain errors:
//   DUPLICATE_REQUEST      — it has already been asked for, and the reply says
//                            which request, so the dialog offers to open it
//   DOCUMENT_ALREADY_PRESENT — they already have one; there is nothing to ask
// Both are shown in place, with the type still selected, so the next attempt
// starts from where the user was rather than from an empty form.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiClipboardList, HiExternalLink, HiInformationCircle, HiX } from "react-icons/hi";
import { addDaysYMD, fmtDate, todayYMD } from "../attendance/dates";
import { documentErrorMessage, duplicateRequestId, isDocumentAlreadyPresent } from "../utils/documentErrors";
import { groupLabel } from "./documentMeta";
import { REQUEST_DUE_MAX_DAYS, REQUEST_NOTE_MAX } from "./requestMeta";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";

/**
 * @param {object} props
 * @param {object[]} props.types            the kinds this viewer may ask for
 * @param {string} [props.presetTypeId]     preselect (from a checklist row)
 * @param {string} props.subjectName        who is being asked
 * @param {number} [props.defaultDueDays]   the org's standard window, when known
 * @param {(payload: object) => Promise} props.create  bound to the subject
 * @param {(request: object) => void} props.onDone
 * @param {(requestId: string) => void} [props.onOpenExisting]  "already asked for" → open it
 * @param {() => void} props.onClose
 */
export default function RequestDocumentDialog({
  types = [], presetTypeId = "", subjectName = "this employee", defaultDueDays, create, onDone, onOpenExisting, onClose,
}) {
  const today = todayYMD();
  const [typeId, setTypeId] = useState(() => (types.some((t) => t.id === presetTypeId) ? presetTypeId : types.length === 1 ? types[0].id : ""));
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existingId, setExistingId] = useState("");

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape" && !busyRef.current) { e.stopPropagation(); onCloseRef.current?.(); }
    };
    // Capture, so Escape closes this and never a preview stacked underneath it.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const maxDue = addDaysYMD(today, REQUEST_DUE_MAX_DAYS);
  const chosen = useMemo(() => types.find((t) => t.id === typeId) || null, [types, typeId]);

  const problems = {
    type: !typeId ? "Choose what you're asking for." : "",
    // Empty is legal and means "use the organisation's window".
    due: dueOn && (dueOn < today || dueOn > maxDue) ? `Pick a date between today and ${fmtDate(maxDue)}.` : "",
    note: note.length > REQUEST_NOTE_MAX ? `Keep the note under ${REQUEST_NOTE_MAX} characters.` : "",
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (key) => (touched ? problems[key] : "");

  /** Quick picks, so the common deadlines don't need the date field at all. */
  const quickDays = [3, 7, 14, 30].filter((d) => d !== defaultDueDays);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;
    setBusy(true);
    setError("");
    setExistingId("");
    try {
      const res = await create({
        document_type_id: typeId,
        ...(dueOn ? { due_on: dueOn } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onDone(res?.data ?? res);
    } catch (err) {
      const duplicate = duplicateRequestId(err);
      if (duplicate) setExistingId(duplicate);
      setError(documentErrorMessage(err, "Couldn't send this request."));
      // A live document already on file is the one refusal where the user's
      // next move is to look at the file, not to change the form.
      if (isDocumentAlreadyPresent(err)) setTypeId(typeId);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-label={`Ask ${subjectName} for a document`}
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiClipboardList className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">Ask for a document</h2>
              <p className="text-sm text-slate-500 mt-0.5 leading-relaxed break-words">
                {subjectName} gets an email with what you need and by when. It closes itself as soon as they upload it.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label htmlFor="req-type" className={LABEL}>What you need</label>
            <select id="req-type" value={typeId} onChange={(e) => { setTypeId(e.target.value); setError(""); setExistingId(""); }} className={FIELD} disabled={busy}>
              <option value="">Choose a kind of document</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {show("type") ? (
              <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.type}</p>
            ) : chosen ? (
              <p className="text-[10px] text-slate-400 mt-1">
                {[groupLabel(chosen.group), chosen.has_expiry ? "they'll be asked for an expiry date" : null, chosen.requires_verification ? "you'll review it before it counts" : "counts as soon as it's uploaded"].filter(Boolean).join(" · ")}
              </p>
            ) : types.length === 0 ? (
              <p className="text-[11px] font-semibold text-fuchsia-700 mt-1">There’s no kind of document you can ask for yet.</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="req-due" className={LABEL}>Due by <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
            <input
              id="req-due" type="date" value={dueOn} min={today} max={maxDue} disabled={busy}
              onChange={(e) => setDueOn(e.target.value)} className={FIELD}
            />
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {quickDays.map((d) => {
                const value = addDaysYMD(today, d);
                const on = dueOn === value;
                return (
                  <button
                    key={d} type="button" disabled={busy} onClick={() => setDueOn(on ? "" : value)} aria-pressed={on}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${on ? "border-purple-300 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-500 hover:border-purple-200"}`}
                  >
                    In {d} days
                  </button>
                );
              })}
              {dueOn && (
                <button type="button" disabled={busy} onClick={() => setDueOn("")} className="text-[11px] font-bold text-purple-600 hover:underline px-1.5">
                  Use the standard window
                </button>
              )}
            </div>
            {show("due") ? (
              <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.due}</p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1">
                {dueOn
                  ? `They'll have until ${fmtDate(dueOn)}.`
                  : defaultDueDays
                    ? `Left blank, they get your organisation's standard ${defaultDueDays} ${defaultDueDays === 1 ? "day" : "days"}.`
                    : "Left blank, they get your organisation's standard window."}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="req-note" className={LABEL}>Anything they should know <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
            <textarea
              id="req-note" rows={3} value={note} maxLength={REQUEST_NOTE_MAX} disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Both sides please, and make sure the address page is readable."
              className={`${FIELD} resize-none`}
            />
            <p className={`text-[10px] mt-1 ${problems.note ? "font-semibold text-rose-600" : "text-slate-400"}`}>
              {problems.note || `Goes straight into their email. ${REQUEST_NOTE_MAX - note.length} characters left.`}
            </p>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 leading-relaxed">
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-purple-500" />
            The email only goes out if your organisation has request emails switched on in Document Settings. Either way the request shows up in their portal straight away.
          </p>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5" role="alert">
              <p className="text-xs font-semibold text-rose-700">{error}</p>
              {existingId && onOpenExisting && (
                <button
                  type="button"
                  onClick={() => onOpenExisting(existingId)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 hover:underline mt-1.5"
                >
                  Open the request that’s already open <HiExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={busy || types.length === 0 || (touched && !!firstProblem)} className={`${PRIMARY_BTN} sm:min-w-[160px]`}>
            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Send request"}
          </button>
        </div>
      </form>
    </div>
  );
}
