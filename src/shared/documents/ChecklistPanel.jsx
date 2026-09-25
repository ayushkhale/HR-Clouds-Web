// ─────────────────────────────────────────────────────────────────────────────
// documents/ChecklistPanel.jsx — What one person is required to provide, and
// how much of it they have (#86 HR, #96 manager, #98 self).
//
// The list is derived, not stored: the server works out which kinds of document
// this person must hold from their department, location, employment type and
// job status, then classifies each against what they actually have. Every
// state and the score come straight from that read — nothing is recomputed
// here, because only the server knows today's IST date and the org's expiry
// reminder windows.
//
// What each audience can do from here:
//   hr      — ask for one missing item, or ask for everything outstanding in one
//             go (#81). The bulk action is the whole point of the screen.
//   manager — ask for one item, for the kinds their policy lets them ask for.
//             A confidential item shows its state but no link to the file.
//   self    — upload the thing that's missing. No requests to raise.
//
// Two things that must be said out loud rather than shown as a number:
//   · `profile_incomplete` — their profile has no department, location,
//     employment type or job status yet, so this is the smallest safe list and
//     will grow. A green 100% there would be a lie.
//   · the 99% cap — the score never rounds up to 100 while anything is
//     outstanding, so "99%" means "one thing left", not "nearly done".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiBadgeCheck, HiCheckCircle, HiClipboardCheck, HiClipboardList, HiExclamationCircle,
  HiInformationCircle, HiLockClosed, HiRefresh, HiUpload, HiUserCircle,
} from "react-icons/hi";
import { fmtDate } from "../attendance/dates";
import { documentErrorMessage, isNoEmployeeRecord, isNothingToRequest, isOutOfScope } from "../utils/documentErrors";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { ChecklistBar, ChecklistStateBadge, CompletenessRing } from "./requestUi";
import {
  CHECKLIST_BULK_MAX, bulkResultMessage, bulkResultOf, checklistOf, checklistStateMeta, countByState,
  isOutstanding, needsAction,
} from "./requestMeta";

const NO_ITEMS = [];

/** The one sentence that says where this person stands. */
function verdict({ completeness, profileIncomplete }, who, isSelf) {
  const { required, satisfied, percent, threshold, meets_threshold: met } = completeness;
  if (!required) {
    return profileIncomplete
      ? `Nothing is required of ${who} yet, because ${isSelf ? "your" : "their"} profile doesn't say which department, location or employment type ${isSelf ? "you're" : "they're"} in.`
      : `No document is required of ${who}. Mark a document type as required in Document Types to start tracking one.`;
  }
  const left = required - satisfied;
  if (met) return `Everything required is on file${threshold !== null && threshold < 100 ? ` — above the ${threshold}% your organisation asks for` : ""}.`;
  if (left <= 0) return `${percent}% — just short of the ${threshold ?? 100}% your organisation asks for.`;
  return `${left} of ${required} ${left === 1 ? "document is" : "documents are"} still outstanding.`;
}

/** One required document and where it stands. */
function ChecklistRow({ item, plane, isSelf, onRequest, onUpload, onOpenDocument, busy }) {
  const meta = checklistStateMeta(item.state);
  const alert = item.state === "expired";
  const days = Number(item.days_until_expiry);
  // The manager plane nulls `document_id` for a type it may not open, while
  // still reporting the state — so a missing link here means "withheld", not
  // "no document", and must not read as a broken row.
  const withheld = plane.key === "manager" && item.state !== "missing" && item.state !== "requested" && !item.document_id;

  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${alert ? "bg-rose-50/40" : ""}`}>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.counts ? "bg-violet-50 text-violet-600" : alert ? "bg-white text-rose-500 border border-rose-200" : "bg-slate-50 text-slate-400"}`}>
        {meta.counts ? <HiCheckCircle className="w-5 h-5" /> : alert ? <HiExclamationCircle className="w-5 h-5" /> : <HiClipboardList className="w-5 h-5" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{item.name}</span>
          {item.is_statutory && (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title="Required by law. It can never be deleted.">
              By law
            </span>
          )}
          {withheld && <HiLockClosed className="w-3.5 h-3.5 text-purple-500 shrink-0" title="You can see whether it's on file, but not the document itself." />}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {item.state === "expired"
            ? `Expired ${item.expires_on ? `on ${fmtDate(item.expires_on)}` : ""} — ${isSelf ? "upload the renewed copy" : "needs a renewed copy"}.`
            : item.state === "expiring"
              ? `Valid until ${fmtDate(item.expires_on)}${Number.isFinite(days) ? ` · ${days} ${days === 1 ? "day" : "days"} left` : ""}.`
              : item.state === "requested"
                ? `Already asked for. ${isSelf ? "Upload it to close the request." : "Waiting on them."}`
                : item.state === "pending_upload"
                  ? `An upload was started but the file never arrived.`
                  : item.state === "missing"
                    ? isSelf ? "Nothing on file yet." : "Nothing on file, and nobody has asked for it."
                    : item.expires_on ? `Valid until ${fmtDate(item.expires_on)}.` : meta.hint}
        </p>
      </div>

      <ChecklistStateBadge state={item.state} className="shrink-0" />

      <div className="flex items-center gap-2 shrink-0">
        {item.document_id && onOpenDocument && (
          <button type="button" onClick={() => onOpenDocument(item.document_id, item.name)} className="text-xs font-bold text-purple-600 hover:underline whitespace-nowrap" data-row-action>
            Open
          </button>
        )}
        {isSelf && onUpload && !meta.counts && (
          <button type="button" onClick={() => onUpload(item)} className={`${SECONDARY_BTN} !px-3 !py-1.5 !text-xs`} data-row-action>
            <HiUpload className="w-3.5 h-3.5" /> Upload
          </button>
        )}
        {!isSelf && onRequest && isOutstanding(item) && (
          <button type="button" onClick={() => onRequest(item)} disabled={!!busy} className={`${SECONDARY_BTN} !px-3 !py-1.5 !text-xs`} data-row-action>
            <HiClipboardList className="w-3.5 h-3.5" /> Ask for it
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * @param {object} props
 * @param {object} props.plane                   REQUEST_PLANES entry
 * @param {string} [props.userId]                required for hr / manager; ignored for self
 * @param {string} [props.subjectName]
 * @param {number} [props.refreshKey]            bump to re-read after an upload or a request
 * @param {(item: object) => void} [props.onRequestOne]     open the request dialog for this item
 * @param {(item: object) => void} [props.onUploadOne]      self plane: open the upload dialog
 * @param {(documentId: string, name: string) => void} [props.onOpenDocument]
 * @param {(message: string, tone?: string) => void} [props.showToast]
 * @param {() => void} [props.onRequestsChanged]  a bulk raise happened; refresh the request list too
 * @param {boolean} [props.compact]              inside a profile tab: no outer card chrome
 */
export default function ChecklistPanel({
  plane, userId = "", subjectName = "", refreshKey = 0, onRequestOne, onUploadOne, onOpenDocument,
  showToast, onRequestsChanged, compact = false,
}) {
  const isSelf = plane.key === "self";
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    if (!isSelf && !userId) return;
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.checklist(userId);
      if (token !== reqRef.current) return;
      setState({ data: checklistOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ data: null, loading: false, error });
    }
  }, [plane, userId, isSelf]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const data = state.data;
  // `checklistOf` always returns an array, but the fallback keeps its identity
  // stable while the first read is in flight so the memos below don't re-run.
  const items = data?.items ?? NO_ITEMS;
  const counts = useMemo(() => countByState(items), [items]);
  const outstanding = useMemo(() => items.filter(isOutstanding), [items]);
  const toDo = useMemo(() => items.filter(needsAction).length, [items]);
  const visible = filter ? items.filter((i) => i.state === filter) : items;
  const who = subjectName || (isSelf ? "you" : "this employee");

  /** #81 — one request per outstanding item, in one go. */
  const askForAll = async () => {
    if (!plane.bulkFromChecklist || busy) return;
    setBusy(true);
    try {
      const result = bulkResultOf(await plane.bulkFromChecklist(userId));
      showToast?.(bulkResultMessage(result));
      onRequestsChanged?.();
      load();
    } catch (err) {
      // "Nothing outstanding" is good news arriving as a 409, so it is said as
      // such rather than shown in red.
      if (isNothingToRequest(err)) {
        showToast?.(`Nothing outstanding for ${who} — everything required is on file or already asked for.`);
        load();
      } else {
        showToast?.(documentErrorMessage(err, "Couldn't raise the requests."), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className={compact ? "text-base font-bold text-slate-800" : "text-lg font-bold text-slate-800"}>Required documents</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {state.loading && !data ? "Loading…" : `Worked out from ${isSelf ? "your" : "their"} department, location, employment type and job status.`}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0">
        <button type="button" onClick={load} disabled={state.loading} className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh the checklist" title="Refresh">
          <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
        </button>
        {plane.bulkFromChecklist && (
          <button
            type="button"
            onClick={askForAll}
            disabled={busy || state.loading || outstanding.length === 0}
            title={outstanding.length === 0
              ? "Nothing is outstanding. Items already asked for aren't asked for twice."
              : `Raises ${outstanding.length} ${outstanding.length === 1 ? "request" : "requests"} — one per outstanding item.`}
            className={`${PRIMARY_BTN} !h-10 !py-0 !shadow-none`}
          >
            <HiClipboardList className="w-4 h-4" />
            {busy ? "Asking…" : outstanding.length > 0 ? `Ask for all ${outstanding.length}` : "Nothing to ask for"}
          </button>
        )}
      </div>
    </div>
  );

  // Two 404/403 answers are facts about the subject rather than faults, so they
  // read as notices. Anything else falls through to the error state below.
  //
  // A manager reading somebody who isn't theirs gets 403 FORBIDDEN.
  if (state.error && isOutOfScope(state.error)) {
    return (
      <div className="space-y-5">
        {header}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
          <DocEmptyState icon={HiLockClosed} title="Not on your team" message="You can only see the required documents of people who report to you. Ask HR if you need this." />
        </div>
      </div>
    );
  }

  // An account with no employee record of its own gets 404 USER_NOT_FOUND —
  // which is what happens when an HR or administrator login was never set up as
  // an employee. Nothing is required of it, and saying "no longer an active
  // member" on somebody's own page would be alarming and wrong.
  if (state.error && isNoEmployeeRecord(state.error)) {
    return (
      <div className="space-y-5">
        {header}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
          <DocEmptyState
            icon={HiUserCircle}
            title={isSelf ? "Nothing is required of you" : "No employee record"}
            message={isSelf
              ? "Your login isn’t set up as an employee record, so there’s no document checklist attached to it. Anything asked of you personally still appears under “Asked of me”."
              : `${who} doesn’t have an employee record, so there’s no list of required documents for them. That’s normal for an administrator login.`}
          />
        </div>
      </div>
    );
  }

  const body = state.error ? (
    <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the required documents." />
  ) : state.loading && !data ? (
    <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  ) : items.length === 0 ? (
    <DocEmptyState
      icon={HiBadgeCheck}
      title={data?.profileIncomplete ? "Nothing required yet" : "No required documents"}
      message={verdict(data || { completeness: {}, profileIncomplete: false }, who, isSelf)}
    />
  ) : visible.length === 0 ? (
    <DocEmptyState icon={HiClipboardCheck} title="Nothing in this state" message="Clear the filter to see the whole list." />
  ) : (
    <ul className="divide-y divide-slate-100">
      {visible.map((item) => (
        <ChecklistRow
          key={item.document_type_id}
          item={item}
          plane={plane}
          isSelf={isSelf}
          onRequest={onRequestOne}
          onUpload={onUploadOne}
          onOpenDocument={onOpenDocument}
          busy={busy}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      {header}

      {data && data.completeness.required > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-5 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <CompletenessRing completeness={data.completeness} />
          <div className="min-w-0 flex-1 w-full">
            <p className="text-sm font-bold text-slate-800">
              {data.completeness.meets_threshold
                ? "All required documents provided"
                : `${toDo} ${toDo === 1 ? "thing" : "things"} still to do`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{verdict(data, who, isSelf)}</p>
            <div className="mt-4">
              <ChecklistBar counts={counts} total={data.completeness.required} active={filter} onPick={setFilter} />
            </div>
            {/* The score never rounds up to 100 while anything is left, so 99%
                deserves a word — otherwise it looks like a rounding bug. */}
            {data.completeness.percent === 99 && !data.completeness.meets_threshold && (
              <p className="flex items-start gap-2 text-[11px] text-slate-500 mt-3 leading-relaxed">
                <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
                This stops at 99% until every single required document is on file, so a near-complete file can never look finished.
              </p>
            )}
          </div>
        </div>
      )}

      {data?.profileIncomplete && (
        <p className="flex items-start gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-xs text-fuchsia-900 leading-relaxed" role="status">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {isSelf ? "Your profile" : `${who}’s profile`} doesn’t have a department, location, employment type or job status yet, so this is the shortest list that can be right. It will grow once
            {isSelf ? " HR fills those in" : " those are filled in on their profile"} — so don’t treat a full score here as finished onboarding.
          </span>
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className={state.loading && data ? "opacity-60" : ""}>{body}</div>
      </div>

      {plane.bulkFromChecklist && outstanding.length > CHECKLIST_BULK_MAX && (
        <p className="text-[11px] text-slate-400">
          Asking for everything covers the first {CHECKLIST_BULK_MAX} outstanding items in one go. Run it again for the rest.
        </p>
      )}
    </div>
  );
}
