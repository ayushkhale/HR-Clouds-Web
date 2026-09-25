// ─────────────────────────────────────────────────────────────────────────────
// documents/OffboardingDialog.jsx — Close down a leaver's paperwork in one
// transaction (#122).
//
// The dialog opens on a preview, not on a button. Nothing about offboarding can
// be undone — an archived document is not reactivated, it is re-uploaded — so
// the first thing on screen is what WOULD happen, counted from the live data,
// with nothing changed. That preview is a real dry run against the server, not
// an estimate assembled here.
//
// The sentence people need before they will press it is that signed things are
// safe: only what was still outstanding is waived, and an acknowledgement
// somebody actually gave is never touched. It is said before the button, not
// after.
//
// Two refusals are ordinary rather than exceptional, and both are handled in
// place: the person's last working day hasn't arrived (offer to go ahead
// anyway), and the person hasn't left at all (say so and stop).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiArchive, HiBell, HiCheckCircle, HiClipboardList, HiDocumentText, HiExclamationCircle,
  HiInformationCircle, HiLogout, HiShieldCheck, HiX,
} from "react-icons/hi";
import { fmtDate } from "../attendance/dates";
import { documentErrorMessage, exitDateInFuture, isNotOffboarding } from "../utils/documentErrors";
import {
  OFFBOARD_STEPS, offboardModeLabel, offboardResultOf, offboardSummary, offboardTriggerLabel,
} from "./offboardingMeta";
import { DANGER_BTN, FIELD, LABEL, SECONDARY_BTN } from "./ui";

const STEP_ICON = {
  archived_count: HiArchive,
  waived_count: HiShieldCheck,
  cancelled_count: HiClipboardList,
  notifications_skipped: HiBell,
};

const REASON_MAX = 500;

/**
 * @param {object} props
 * @param {string} props.subjectName
 * @param {(opts: object) => Promise} props.run   bound to documentsAPI.offboardDocuments
 * @param {(result: object) => void} [props.onDone]
 * @param {() => void} props.onClose
 */
export default function OffboardingDialog({ subjectName = "this employee", run, onDone, onClose }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(null); // { kind: "future" | "active", effectiveOn }
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onCloseRef.current?.(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy]);

  /** The preview is the same call with `dry_run`, so it can never disagree with the real one. */
  const loadPreview = useCallback(async (withForce) => {
    setLoading(true);
    setError("");
    setBlocked(null);
    try {
      const res = await run({ dryRun: true, force: withForce });
      setPreview(offboardResultOf(res));
    } catch (err) {
      const future = exitDateInFuture(err);
      if (future) {
        setBlocked({ kind: "future", effectiveOn: future.effectiveOn });
      } else if (isNotOffboarding(err)) {
        setBlocked({ kind: "active" });
      } else {
        setError(documentErrorMessage(err, "Couldn't work out what would change."));
      }
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => { loadPreview(false); }, [loadPreview]);

  const execute = async () => {
    if (busy || !preview) return;
    const summary = offboardSummary(preview);
    const ok = await window.confirm(
      `Close down ${subjectName}'s paperwork?\n\n${summary || "Nothing is outstanding, so this will change nothing"}.\n\nThis can't be undone. Anything they already signed stays exactly as it is.`,
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const result = offboardResultOf(await run({ force, reason: reason.trim() || undefined }));
      setDone(result);
      onDone?.(result);
    } catch (err) {
      const future = exitDateInFuture(err);
      if (future) {
        setBlocked({ kind: "future", effectiveOn: future.effectiveOn });
      } else if (isNotOffboarding(err)) {
        setBlocked({ kind: "active" });
      } else {
        setError(documentErrorMessage(err, "Couldn't close down their paperwork. Nothing was changed."));
      }
    } finally {
      setBusy(false);
    }
  };

  const counts = done?.counts || preview?.counts || {};
  const nothingToDo = !!preview && preview.total === 0;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Close down their paperwork" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiLogout className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{done ? "Paperwork closed down" : "Closing down their paperwork"}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{subjectName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {done ? (
            <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3.5">
              <span className="w-9 h-9 rounded-xl bg-white text-violet-600 flex items-center justify-center shrink-0"><HiCheckCircle className="w-5 h-5" /></span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-violet-900">Done</p>
                <p className="text-xs text-violet-800 mt-0.5 leading-relaxed">
                  {offboardSummary(done) || "Nothing was left outstanding, so nothing needed changing."}
                  {done.mode ? ` (${offboardModeLabel(done.mode).toLowerCase()})` : ""}
                </p>
              </div>
            </div>
          ) : blocked?.kind === "active" ? (
            <div className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5">
              <HiInformationCircle className="w-5 h-5 text-fuchsia-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fuchsia-900">They haven’t left</p>
                <p className="text-xs text-fuchsia-800 mt-0.5 leading-relaxed">
                  {subjectName} is still an active member of the organisation with no recorded exit, so there is nothing to close down. Record their exit first, and this becomes available on its own — the nightly routine will even do it for you on their last working day.
                </p>
              </div>
            </div>
          ) : blocked?.kind === "future" ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5">
                <HiInformationCircle className="w-5 h-5 text-fuchsia-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fuchsia-900">Their last day hasn’t arrived yet</p>
                  <p className="text-xs text-fuchsia-800 mt-0.5 leading-relaxed">
                    {subjectName} leaves on {blocked.effectiveOn ? fmtDate(blocked.effectiveOn) : "a future date"}. Their paperwork is closed down automatically that night, so there is usually nothing to do here.
                    {" "}If their clearance is being finished early, you can go ahead now.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setForce(true); loadPreview(true); }}
                className={SECONDARY_BTN}
              >
                <HiExclamationCircle className="w-4 h-4" /> Do it before their last day
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5">
              <HiInformationCircle className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Nothing has changed yet</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  This is what would happen, counted from their file as it stands right now.
                  {preview?.trigger ? ` ${offboardTriggerLabel(preview.trigger)}` : ""}
                </p>
              </div>
            </div>
          )}

          {(preview || done) && (
            <ul className="space-y-2.5">
              {OFFBOARD_STEPS.map((step) => {
                const Icon = STEP_ICON[step.key] || HiDocumentText;
                const count = Number(counts[step.key]) || 0;
                return (
                  <li key={step.key} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${count > 0 ? "border-purple-200 bg-purple-50/40" : "border-slate-100 bg-white"}`}>
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${count > 0 ? "bg-white text-purple-600" : "bg-slate-50 text-slate-300"}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${count > 0 ? "text-slate-800" : "text-slate-400"}`}>{step.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{step.blurb}</p>
                    </div>
                    <span className={`text-lg font-bold tabular-nums shrink-0 ${count > 0 ? "text-purple-700" : "text-slate-300"}`}>{count}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {!done && preview && (
            <>
              {nothingToDo && (
                <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                  <HiCheckCircle className="w-4 h-4 text-violet-500 shrink-0 mt-px" />
                  There is nothing outstanding for {subjectName} — no live documents, no unsigned policies, nothing being asked of them and no queued email. Running this would change nothing, which is a perfectly good answer.
                </p>
              )}

              <div>
                <label htmlFor="offboard-reason" className={LABEL}>Why, for the record <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                <textarea
                  id="offboard-reason" rows={2} value={reason} maxLength={REASON_MAX} disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Resignation; final clearance completed on 30 September"
                  className={`${FIELD} resize-none`}
                />
                <p className="text-[10px] text-slate-400 mt-1">Kept in the audit trail beside what was changed.</p>
              </div>

              <p className="flex items-start gap-2 text-xs text-slate-600 bg-violet-50/60 border border-violet-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                <HiShieldCheck className="w-4 h-4 text-violet-600 shrink-0 mt-px" />
                <span>
                  <strong>Nothing they signed is touched.</strong> Every acknowledgement and signature stays exactly as it was recorded — that evidence is the whole point of having it. Only what was still outstanding is excused, and their documents are archived rather than deleted.
                </span>
              </p>
            </>
          )}

          {error && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5" role="alert">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {!done && force && !blocked && <p className="mr-auto text-[11px] font-semibold text-fuchsia-700">Going ahead before their last working day.</p>}
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>{done ? "Close" : "Cancel"}</button>
          {!done && preview && (
            <button type="button" onClick={execute} disabled={busy} className={DANGER_BTN}>
              {busy ? <span className="inline-block w-4 h-4 border-2 border-rose-200 border-t-rose-600 rounded-full animate-spin" /> : <HiLogout className="w-4 h-4" />}
              {busy ? "Closing down…" : "Close it down"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
