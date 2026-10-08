// ─────────────────────────────────────────────────────────────────────────────
// documents/BulkRequestDocumentsDialog.jsx — Ask MANY people for MANY kinds of
// document in one go (#240 for HR, #241 for a manager).
//
// A form, so it follows the big-form pattern (CLAUDE.md §3): one wide panel,
// uppercase labels, a pinned footer, a grid rather than a scroll. It is the
// single-request dialog's sibling, and every difference comes from one fact —
// this one does a cross product, people × kinds, and reports a ledger:
//
//  · THE UNIT OF WORK IS A PAIR. Every chosen person is asked for every chosen
//    kind, so the work is `people × kinds`. All three caps are the server's
//    (200 people, 10 kinds, 500 pairs); they are enforced here so the person is
//    told before the round trip rather than refused at the end.
//
//  · THE RESULT IS A LEDGER, NEVER AN ALL-OR-NOTHING SUCCESS. #240 answers 201
//    with `summary` + `created` / `skipped` / `failed`, and `created: []` is a
//    valid success — every pair was already on file or already requested. So the
//    form gives way to the ledger on return; it never claims "sent" optimistically.
//
//  · RETRY IS SAFE. A pair with an open request comes back `skipped:
//    already_requested`, so re-sending the same body after a timeout creates
//    nothing new — the person is never warned about duplicates, and the form
//    state survives an error so they can simply press again.
//
//  · ONLY EMPLOYEE-PLANE TYPES CAN BE REQUESTED (§2.8). The picker is built from
//    the viewer's `uploadTypes` (employee-plane, active), so the org-plane letter
//    types that enabling a letter now activates never appear here and the new
//    422 DOCUMENT_TYPE_PLANE_MISMATCH can't fire.
//
//  · MANAGER SCOPING IS ALL-OR-NOTHING. One out-of-cohort id is 403 for the whole
//    call, and reads identically to a non-existent id. The manager picker is the
//    manager's own team, so it never fires.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheckCircle, HiClipboardList, HiExclamation, HiExclamationCircle, HiInformationCircle,
  HiUserGroup, HiX,
} from "react-icons/hi";
import { PersonMultiSelect } from "../components/PersonPicker";
import FieldHelp from "../fieldHelp/FieldHelp";
import { addDaysYMD, fmtDate, todayYMD } from "../attendance/dates";
import {
  bulkRequestTooLargeDetail, documentErrorCode, documentErrorMessage, isOutOfScope, isTypeNotRequestable,
} from "../utils/documentErrors";
import { groupLabel } from "./documentMeta";
import { refreshEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import {
  BULK_REQUEST_MAX_PAIRS, BULK_REQUEST_MAX_TYPES, BULK_REQUEST_MAX_USERS, bulkRequestPairs,
  bulkRequestResultOf, bulkRequestSummaryLine, bulkSkipReasonLabel, hasStaleRosterSkip,
  REQUEST_DUE_MAX_DAYS, REQUEST_NOTE_MAX,
} from "./requestMeta";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";

/** One headline count in the result ledger. */
function LedgerTile({ label, value, tone, sub }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="text-2xl font-bold tracking-tight leading-none tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold mt-1.5">{label}</p>
      {sub && <p className="text-[10px] opacity-80 mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {(body: object) => Promise} props.create     bound to the plane's bulk endpoint
 * @param {object[]} props.people                       roster rows (active employees / the team)
 * @param {"idle"|"loading"|"ready"|"error"} [props.peopleStatus]
 * @param {object[]} props.types                        the employee-plane, active kinds this viewer may ask for
 * @param {Map} [props.index]                           type id → type, for naming ledger rows
 * @param {(id: string, fallback?: string) => string} props.nameOf
 * @param {number} [props.defaultDueDays]               the org's standard window, when known
 * @param {"hr"|"manager"} [props.viewer]
 * @param {(result: object) => void} props.onDone       after a successful submit (refresh the list)
 * @param {() => void} props.onClose
 */
export default function BulkRequestDocumentsDialog({
  create, people = [], peopleStatus = "ready", types = [], index, nameOf,
  defaultDueDays, viewer = "hr", onDone, onClose,
}) {
  const today = todayYMD();
  const maxDue = addDaysYMD(today, REQUEST_DUE_MAX_DAYS);

  const [userIds, setUserIds] = useState([]);
  const [typeIds, setTypeIds] = useState([]);
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);   // the ledger, once sent

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busyRef.current) { e.stopPropagation(); onCloseRef.current?.(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const pairs = bulkRequestPairs(userIds.length, typeIds.length);
  const overPairs = pairs > BULK_REQUEST_MAX_PAIRS;
  const typesAtMax = typeIds.length >= BULK_REQUEST_MAX_TYPES;

  const problems = {
    users: userIds.length === 0 ? "Choose at least one person." : "",
    types: typeIds.length === 0 ? "Choose at least one kind of document." : "",
    pairs: overPairs
      ? `That’s ${pairs.toLocaleString("en-IN")} requests. Keep it to ${BULK_REQUEST_MAX_PAIRS} at a time — fewer people or fewer kinds — and send the rest after.`
      : "",
    due: dueOn && (dueOn < today || dueOn > maxDue) ? `Pick a date between today and ${fmtDate(maxDue)}.` : "",
    note: note.length > REQUEST_NOTE_MAX ? `Keep the note under ${REQUEST_NOTE_MAX} characters.` : "",
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (key) => (touched ? problems[key] : "");

  const toggleType = (id) => {
    setError("");
    setTypeIds((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= BULK_REQUEST_MAX_TYPES) return prev;
      return [...prev, id];
    });
  };

  const visibleTypes = useMemo(() => {
    const q = typeQuery.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) => String(t.name || "").toLowerCase().includes(q));
  }, [types, typeQuery]);

  const quickDays = [3, 7, 14, 30].filter((d) => d !== defaultDueDays);

  const typeName = (id) => index?.get?.(id)?.name || "a document";
  const who = (id) => nameOf?.(id, "A colleague") || "A colleague";

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        user_ids: userIds,
        document_type_ids: typeIds,
        ...(dueOn ? { due_on: dueOn } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      const res = bulkRequestResultOf(await create(body));
      setResult(res);
      // Somebody in the list isn't an active employee any more, so the roster
      // this browser holds is stale and the picker would keep offering them.
      // Re-read it (§7) rather than leaving the next batch to skip them too.
      if (hasStaleRosterSkip(res)) refreshEmployeeDirectory();
      onDone?.(res);
    } catch (err) {
      const detail = bulkRequestTooLargeDetail(err);
      // The split the backend draws (§2.4): the whole call failing is an error
      // here; an employee's circumstances are a ledger row, not an error.
      const code = documentErrorCode(err);
      setError(
        detail
          ? `That’s ${Number(detail.pairs || pairs).toLocaleString("en-IN")} requests, more than the ${Number(detail.maxPairs || BULK_REQUEST_MAX_PAIRS).toLocaleString("en-IN")} allowed at once. Choose fewer people or fewer kinds and send the rest after.`
          : viewer === "manager" && isOutOfScope(err)
            ? "One of the people chosen isn’t on your team any more. Nothing was sent — take them out and try again."
            : isTypeNotRequestable(err)
              ? "One of the kinds chosen is HR’s to ask for, not a manager’s. Nothing was sent — take it out and try again."
              : code === "VALIDATION_ERROR"
                ? documentErrorMessage(err, "Check the people and kinds chosen, then try again.")
                : documentErrorMessage(err, "Couldn’t send these requests."),
      );
      // Nothing was written on any whole-call refusal, so the form is left as it
      // was — the person fixes the one thing named and presses again.
    } finally {
      // Always cleared — including on success, so "Ask for more" returns to a
      // live form rather than a frozen one.
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setUserIds([]);
    setTypeIds([]);
    setDueOn("");
    setNote("");
    setTypeQuery("");
    setTouched(false);
    setError("");
  };

  // ── The result ledger ───────────────────────────────────────────────────────
  if (result) {
    const { summary, skipped, failed, dueOn: appliedDue } = result;
    return (
      <div
        className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          role="dialog" aria-modal="true" aria-label="What was asked for"
          className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiCheckCircle className="w-5 h-5" /></span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800">{bulkRequestSummaryLine(result)}</h2>
                <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                  {summary.users} {summary.users === 1 ? "person" : "people"} · {summary.documentTypes} {summary.documentTypes === 1 ? "kind" : "kinds"}
                  {appliedDue ? ` · due ${fmtDate(appliedDue)}` : ""}. Each request closes itself when the document arrives.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition" aria-label="Close">
              <HiX className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              <LedgerTile label="Asked for" value={summary.created} tone="border-violet-200 bg-violet-50 text-violet-800" sub={summary.created ? "Emails on the way" : "Nothing new needed"} />
              <LedgerTile label="Skipped" value={summary.skipped} tone="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800" sub={summary.skipped ? "Nothing to ask for" : "None"} />
              <LedgerTile label="Couldn’t send" value={summary.failed} tone={summary.failed ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-600"} sub={summary.failed ? "Safe to try again" : "None"} />
            </div>

            {summary.created === 0 && (
              <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 leading-relaxed">
                <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-purple-500" />
                No new requests were needed — everyone already holds these documents or has already been asked. Nothing went wrong.
              </p>
            )}

            {skipped.length > 0 && (
              <section>
                <p className={LABEL}>Skipped — nothing to ask for</p>
                <ul className="rounded-2xl border border-slate-100 divide-y divide-slate-50 max-h-56 overflow-y-auto">
                  {skipped.map((row, i) => (
                    <li key={`${row.user_id}-${row.document_type_id}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs">
                      <span className="min-w-0 truncate"><span className="font-semibold text-slate-700">{who(row.user_id)}</span> <span className="text-slate-400">· {typeName(row.document_type_id)}</span></span>
                      <span className="shrink-0 font-semibold text-fuchsia-700 whitespace-nowrap">{bulkSkipReasonLabel(row.reason)}</span>
                    </li>
                  ))}
                </ul>
                {hasStaleRosterSkip(result) && (
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    Anyone shown as no longer an active employee had already left or been switched off. The list of people has been refreshed, so they won’t be offered next time.
                  </p>
                )}
              </section>
            )}

            {failed.length > 0 && (
              <section>
                <p className={LABEL}>Couldn’t send — safe to try again</p>
                <ul className="rounded-2xl border border-rose-100 divide-y divide-rose-50 max-h-56 overflow-y-auto" role="alert">
                  {failed.map((row, i) => (
                    <li key={`${row.user_id}-${row.document_type_id}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs">
                      <span className="min-w-0 truncate"><span className="font-semibold text-slate-700">{who(row.user_id)}</span> <span className="text-slate-400">· {typeName(row.document_type_id)}</span></span>
                      <span className="shrink-0 font-semibold text-rose-700 whitespace-nowrap">Not sent</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">Sending the same batch again will fill in only these — nobody is asked twice.</p>
              </section>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl shrink-0">
            <button type="button" onClick={reset} className={SECONDARY_BTN}>Ask for more</button>
            <button type="button" onClick={onClose} className={`${PRIMARY_BTN} sm:min-w-[120px]`}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // ── The form ────────────────────────────────────────────────────────────────
  const noTypes = types.length === 0;
  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-label="Ask many people for documents"
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiUserGroup className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">Ask many people for documents</h2>
              <p className="text-sm text-slate-500 mt-0.5 leading-relaxed break-words">
                Everyone you pick is asked for each kind you choose. Each request closes itself when the document arrives.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <div className="flex items-center">
              <label htmlFor="br-people" className={LABEL}>Who you’re asking</label>
              <FieldHelp
                surface="documents.request_bulk" field="user_ids" label="who you’re asking"
                className="mb-2" ariaLabel="How many people can I ask at once?"
              />
            </div>
            <PersonMultiSelect
              id="br-people"
              people={people}
              value={userIds}
              onChange={(next) => { setUserIds(next); setError(""); }}
              max={BULK_REQUEST_MAX_USERS}
              disabled={busy}
              loading={peopleStatus === "loading"}
              error={peopleStatus === "error" ? "Couldn’t load the list of people. Refresh the page and try again." : ""}
              placeholder="Search by name or employee code"
              aria-label="People you’re asking"
            />
            <p className={`text-[10px] mt-1 ${show("users") ? "font-semibold text-rose-600" : "text-slate-400"}`}>
              {show("users") || `${userIds.length} of up to ${BULK_REQUEST_MAX_USERS} chosen.`}
            </p>
          </div>

          <div>
            <label className={LABEL}>What you need from each</label>
            {noTypes ? (
              <p className="text-[11px] font-semibold text-fuchsia-700 mt-1">There’s no kind of document you can ask for yet.</p>
            ) : (
              <>
                {types.length > 6 && (
                  <input
                    type="text" value={typeQuery} disabled={busy}
                    onChange={(e) => setTypeQuery(e.target.value)}
                    placeholder="Filter kinds of document"
                    className={`${FIELD} mb-2`}
                    aria-label="Filter kinds of document"
                  />
                )}
                <div className="rounded-2xl border border-slate-100 max-h-52 overflow-y-auto divide-y divide-slate-50">
                  {visibleTypes.length === 0 ? (
                    <p className="px-3.5 py-3 text-xs text-slate-400">No kind matches “{typeQuery}”.</p>
                  ) : visibleTypes.map((t) => {
                    const checked = typeIds.includes(t.id);
                    const blocked = !checked && typesAtMax;
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${blocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-purple-50/40"}`}
                      >
                        <input
                          type="checkbox" checked={checked} disabled={busy || blocked}
                          onChange={() => toggleType(t.id)}
                          className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-200"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{t.name}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{groupLabel(t.group)}</span>
                      </label>
                    );
                  })}
                </div>
                <p className={`text-[10px] mt-1 ${show("types") || show("pairs") ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                  {show("types") || show("pairs")
                    || `${typeIds.length} of up to ${BULK_REQUEST_MAX_TYPES} chosen${pairs ? ` · ${pairs.toLocaleString("en-IN")} ${pairs === 1 ? "request" : "requests"} in all` : ""}.`}
                </p>
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 items-start">
            <div>
              <div className="flex items-center">
                <label htmlFor="br-due" className={LABEL}>Due by <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                <FieldHelp surface="documents.request_bulk" field="due_on" label="the due date" className="mb-2" />
              </div>
              <input
                id="br-due" type="date" value={dueOn} min={today} max={maxDue} disabled={busy}
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
              <p className={`text-[10px] mt-1 ${show("due") ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                {show("due")
                  || (dueOn
                    ? `Everyone gets until ${fmtDate(dueOn)} — the same date on every request.`
                    : defaultDueDays
                      ? `Left blank, everyone gets your organisation’s standard ${defaultDueDays} ${defaultDueDays === 1 ? "day" : "days"}.`
                      : "Left blank, everyone gets your organisation’s standard window.")}
              </p>
            </div>

            <div>
              <label htmlFor="br-note" className={LABEL}>Anything they should know <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
              <textarea
                id="br-note" rows={3} value={note} maxLength={REQUEST_NOTE_MAX} disabled={busy}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Please upload before your first payroll."
                className={`${FIELD} resize-none`}
              />
              <p className={`text-[10px] mt-1 ${problems.note ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                {problems.note || `Goes on every request. ${REQUEST_NOTE_MAX - note.length} characters left.`}
              </p>
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 leading-relaxed">
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-purple-500" />
            Anyone who already holds a document, or has already been asked, is skipped — you’ll see exactly who. Emails go out only if your organisation has request emails switched on in Document Settings.
          </p>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5" role="alert">
              <p className="flex items-start gap-2 text-xs font-semibold text-rose-700">
                <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" /><span>{error}</span>
              </p>
            </div>
          )}

          {overPairs && !error && (
            <p className="flex items-start gap-2 text-[11px] font-semibold text-rose-600" role="status">
              <HiExclamation className="w-4 h-4 shrink-0 mt-px" />{problems.pairs}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl shrink-0">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={busy || noTypes || (touched && !!firstProblem)} className={`${PRIMARY_BTN} sm:min-w-[180px]`}>
            {busy
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><HiClipboardList className="w-4 h-4" /> Send {pairs ? `${pairs.toLocaleString("en-IN")} ` : ""}{pairs === 1 ? "request" : "requests"}</>}
          </button>
        </div>
      </form>
    </div>
  );
}
