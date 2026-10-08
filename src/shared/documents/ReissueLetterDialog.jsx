// ─────────────────────────────────────────────────────────────────────────────
// documents/ReissueLetterDialog.jsx — Correct a letter that has already gone out
// (#142), reading the letter it replaces from #141 and the wording it accepts
// from #136.
//
// A form, not a record inspector: one panel, uppercase 11px labels, pinned
// footer.
//
// The whole point of this screen is that NOTHING IS OVERWRITTEN. The letter
// already in somebody's hands keeps its bytes, its reference number and its
// place on the register; it is marked as replaced, and a fresh version is issued
// beside it with its own number. That is stated plainly before the button,
// because "reissue" sounds like "edit" and it is the opposite of one.
//
// Four contract facts shape it:
//
//  · ONLY THE VERSION IN FORCE CAN BE REISSUED. Reissuing an already-replaced or
//    withdrawn letter is `409 LETTER_NOT_REISSUABLE`, and the race is real: two
//    administrators on the same letter means the second one loses. So the
//    refusal is handled in place — the dialog says which version is the live one
//    now rather than leaving a dead button.
//
//  · THERE IS NO DATE TO CHOOSE. #142 takes no `effective_date`: a reissue is
//    always dated today, so its number belongs to today's financial year and not
//    the original's. Offering a date box would be a lie about a legal document,
//    so the dialog says so instead.
//
//  · THE PERSON AND THE KIND OF LETTER CANNOT CHANGE. Both are read from the
//    letter being replaced. A different person or a different letter is a new
//    letter, which is Issue, not Reissue.
//
//  · THE FACTS ARE RE-READ FROM THE RECORD, TODAY. That is usually the reason for
//    reissuing at all — somebody's job title was corrected — so it is said out
//    loud rather than left as a surprise.
//
// A reason is optional to the API and required here. The audit line is the only
// lasting record of why a numbered company letter was replaced, and a blank one
// is worth nothing to whoever reads it in two years.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiArrowNarrowRight, HiCheckCircle, HiCollection, HiDownload, HiExclamationCircle, HiEye,
  HiInformationCircle, HiRefresh, HiX,
} from "react-icons/hi";
import AttachmentViewerDialog from "../components/AttachmentViewerDialog";
import { fmtDateTime } from "../attendance/dates";
import {
  documentErrorMessage, isLetterFieldRejected, isLetterNotReissuable, isLetterOutcomeUnknown,
  isRenderInProgress, isRendererNotConfigured, isRetryLimitExceeded, letterErrorFieldKey,
  letterIssueErrorMessage,
} from "../utils/documentErrors";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { triggerDownload } from "./documentUpload";
import { letterTemplateOf } from "./letterMeta";
import {
  generationOf, issuedLetterOf, keyForRetry, letterOverridableFields, newIdempotencyKey,
  onlyRequiredMissing, overrideProblems, overridesFromSaved, overridesPayload, refusedFields, reissueBlocker, rememberNotOverridable,
  supersededOf, wasReused,
} from "./letterIssueMeta";
import LetterOverrideFields, { LetterIssueReminder } from "./LetterOverrideFields";
import LetterFixLink from "./LetterFixLink";

const REASON_MAX = 500;
const REASON_MIN = 5;
const LETTERS_PATH = "/dashboard/hr/documents/letters";

/**
 * @param {object} props
 * @param {object} props.api                  documentsAPI
 * @param {string} props.letterId             the letter being replaced
 * @param {object} [props.letter]             the row already on screen, so the dialog opens instantly
 * @param {string} [props.subjectName]        who it is about, if the caller knows
 * @param {(letter: object, info: { reused: boolean, supersedes: object|null }) => void} [props.onReissued]
 * @param {() => void} [props.onRendererOff]
 * @param {() => void} props.onClose
 */
export default function ReissueLetterDialog({
  api, letterId, letter: initial = null, subjectName = "", onReissued, onRendererOff, onClose,
}) {
  const [doc, setDoc] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [template, setTemplate] = useState(null);
  const [templateError, setTemplateError] = useState(null);

  const [reason, setReason] = useState("");
  const [values, setValues] = useState({});
  // See IssueLetterDialog: refusals live in state so the memo below invalidates.
  const [refused, setRefused] = useState([]);
  const [touched, setTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);   // { message, waiting, terminal }
  // The organisation's saved wording for this letter (#136 `config.saved_fields`).
  const [saved, setSaved] = useState(null);
  // An empty required box turns red only after Reissue has been pressed.
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState(null);     // { letter, reused, supersedes }
  const [viewing, setViewing] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const keyRef = useRef(newIdempotencyKey("reissue"));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(false);
  busyRef.current = busy;

  /**
   * Escape closes this form and goes no further.
   *
   * Capture phase with `stopPropagation`, because this dialog can sit over the
   * record inspector (z-140), whose own Escape listener would otherwise close the
   * dialog UNDERNEATH and leave this one floating over nothing. Ignored while a
   * letter is being drawn: a stray key must not look like it cancelled something
   * the server is already committing.
   */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busyRef.current) onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // ── The letter being replaced ──────────────────────────────────────────────
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    if (!letterId) return;
    const token = ++reqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = (await api.getLetter(letterId))?.data ?? null;
      if (token !== reqRef.current) return;
      // Merged, so a field the list row carried survives a narrower detail
      // projection rather than blanking on screen.
      setDoc((cur) => ({ ...(cur || {}), ...(fresh || {}) }));
    } catch (err) {
      if (token === reqRef.current) setLoadError(err);
    } finally {
      if (token === reqRef.current) setLoading(false);
    }
  }, [api, letterId]);

  useEffect(() => { load(); }, [load]);

  // ── What this kind of letter lets us type in ───────────────────────────────
  // The template code lives on the provenance block, which is the only place it
  // is recorded — a letter row itself doesn't name the template it came from.
  const code = generationOf(doc)?.template_code || "";

  const tplReq = useRef(0);
  const loadTemplate = useCallback(async (which) => {
    if (!which) return;
    const token = ++tplReq.current;
    setTemplateError(null);
    try {
      const data = letterTemplateOf(await api.getLetterTemplate(which));
      if (token === tplReq.current) {
        setTemplate(data.template);
        setSaved(data.config?.saved_fields || null);
      }
    } catch (err) {
      // Not fatal: a reissue with no overrides at all is perfectly valid, and it
      // is the common case. The boxes are simply left out, with a line saying so.
      if (token === tplReq.current) setTemplateError(err);
    }
  }, [api]);

  useEffect(() => { loadTemplate(code); }, [code, loadTemplate]);
  useEffect(() => { setRefused(refusedFields(code)); }, [code]);

  const fields = useMemo(() => (template ? letterOverridableFields(template, code, refused) : []), [template, code, refused]);

  // The new version starts from the organisation's saved wording, like a fresh
  // issue does — once per loaded template, never over what was typed.
  useEffect(() => {
    if (!template) return;
    setValues(overridesFromSaved(letterOverridableFields(template, code, refusedFields(code)), saved));
  }, [template, saved, code]);

  useEffect(() => {
    setValues((prev) => {
      const allowed = new Set(fields.map((f) => f.key));
      const next = {};
      Object.entries(prev).forEach(([key, value]) => { if (allowed.has(key)) next[key] = value; });
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [fields]);

  const trimmedReason = reason.trim();
  const problems = useMemo(() => {
    const out = overrideProblems(fields, values, saved);
    if (!trimmedReason) out._reason = "Say why this letter is being replaced — it is the only lasting record of it.";
    else if (trimmedReason.length < REASON_MIN) out._reason = "A few more words, so this reads sensibly to whoever checks it later.";
    else if (trimmedReason.length > REASON_MAX) out._reason = `Keep this under ${REASON_MAX} characters.`;
    return out;
  }, [fields, values, trimmedReason, saved]);

  const blocker = doc ? reissueBlocker(doc) : "";
  const ready = !!doc && !loading && !loadError && !blocker && Object.keys(problems).length === 0;
  const onlyMissingRequired = !!doc && !loading && !loadError && !blocker && onlyRequiredMissing(problems);

  // ── Reissue ────────────────────────────────────────────────────────────────
  const reissue = async ({ confirmed = false } = {}) => {
    setAttempted(true);
    if (!ready || busy) return;

    if (!confirmed) {
      const who = subjectName ? ` to ${subjectName}` : "";
      const ok = await window.confirm(
        `Replace ${doc.reference_number ? `letter ${doc.reference_number}` : `“${doc.title}”`}${who}?\n\n`
        + `The copy already issued stays on file for good, marked as replaced. A new version is issued in its place, with its own reference number, dated today and drawn from your records as they stand now.\n\n`
        + `Whoever it was issued to will see the new version in their portal.`,
      );
      if (!ok) return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const body = { reason: trimmedReason, idempotency_key: keyRef.current };
      const overrides = overridesPayload(fields, values);
      if (Object.keys(overrides).length) body.field_overrides = overrides;

      const res = await api.reissueLetter(letterId, body);
      const fresh = issuedLetterOf(res);
      if (!fresh?.id) {
        // The call succeeded but the reply didn't name the new version. Not
        // thrown: a throw would reach the retry path, and a retry with a fresh
        // key would mint a THIRD version of the same letter.
        setFailure({
          message: "The letter was replaced, but the reply didn’t say which version took over. Open the register to find it — don’t reissue it again.",
          waiting: false,
          terminal: true,
        });
        onReissued?.(fresh || {}, { reused: false, supersedes: null });
        return;
      }
      const info = { reused: wasReused(res), supersedes: supersededOf(res) };
      setResult({ letter: fresh, ...info });
      onReissued?.(fresh, info);
    } catch (err) {
      if (isRendererNotConfigured(err)) onRendererOff?.();

      if (isLetterFieldRejected(err)) {
        const rejected = letterErrorFieldKey(err);
        if (rejected) {
          rememberNotOverridable(code, rejected);
          setValues((prev) => {
            const next = { ...prev };
            delete next[rejected];
            return next;
          });
          setRefused(refusedFields(code));
        }
      }

      // Somebody else got there first. Re-read the letter so the dialog shows
      // what is true now — which is what turns the button off, rather than
      // leaving it there to fail again.
      if (isLetterNotReissuable(err)) load();

      keyRef.current = keyForRetry(keyRef.current, err, isRenderInProgress, "reissue");
      const unknown = isLetterOutcomeUnknown(err);
      setFailure({
        message: unknown
          ? "The server didn’t answer, so we can’t tell whether the replacement went out. Try again — if it did, you’ll be shown that same version rather than a third one."
          : letterIssueErrorMessage(err, "Couldn’t reissue this letter."),
        waiting: isRenderInProgress(err),
        terminal: isRetryLimitExceeded(err) || isLetterNotReissuable(err),
        unknown,
        err,
      });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const id = result?.letter?.id;
    if (!id || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const url = ((await api.orgGetViewUrl(id, { disposition: "attachment" }))?.data ?? {})?.view_url;
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
    } catch (err) {
      setDownloadError(documentErrorMessage(err, "Couldn’t prepare the download."));
    } finally {
      setDownloading(false);
    }
  };

  const title = result ? "Letter replaced" : "Reissue this letter";

  return (
    <>
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4"
        onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}
      >
        <div
          role="dialog" aria-modal="true" aria-label={title}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${result ? "bg-violet-50 text-violet-600" : "bg-purple-50 text-purple-600"}`}>
                {result ? <HiCheckCircle className="w-5 h-5" /> : <HiCollection className="w-5 h-5" />}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">{title}</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {result
                    ? "The old copy is kept on file, and the new one is in their portal."
                    : "Nothing is overwritten. The copy already issued is kept, and a corrected one is issued beside it."}
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
            {result ? (
              <ReissuedSummary result={result} downloadError={downloadError} />
            ) : loadError ? (
              <div className="text-center py-10">
                <HiExclamationCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 max-w-md mx-auto">
                  {letterIssueErrorMessage(loadError, "Couldn’t open this letter.")}
                </p>
                <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">
                  <HiRefresh className="w-4 h-4" /> Try again
                </button>
              </div>
            ) : !doc ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
                  <p className={LABEL}>The letter you are replacing</p>
                  <p className="text-sm font-bold text-slate-800 break-words">{doc.title || "This letter"}</p>
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2 mt-2.5">
                    <Pair label="Reference number" value={doc.reference_number} mono />
                    <Pair label="Version" value={doc.version ? `Version ${doc.version}` : "Version 1"} />
                    <Pair label="Issued" value={doc.published_at ? fmtDateTime(doc.published_at) : ""} />
                  </dl>
                </div>

                {blocker ? (
                  <p className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5 text-sm text-fuchsia-900 leading-relaxed" role="status">
                    <HiInformationCircle className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
                    <span>
                      <span className="font-bold">This letter can’t be reissued.</span> {blocker}{" "}
                      <Link to={LETTERS_PATH} onClick={() => onCloseRef.current?.()} className="font-bold text-fuchsia-700 hover:underline">
                        Open the register
                      </Link>{" "}
                      to find the version that is in force.
                    </span>
                  </p>
                ) : (
                  <>
                    <div>
                      <label htmlFor="rl-reason" className={LABEL}>Why it is being replaced</label>
                      <textarea
                        id="rl-reason" rows={3} value={reason} disabled={busy} maxLength={REASON_MAX}
                        onChange={(e) => { setReason(e.target.value); setTouched(true); }}
                        placeholder="e.g. The job title was corrected on their profile after the original went out."
                        className={`${FIELD} resize-y`}
                      />
                      <p className={`text-[11px] mt-1.5 leading-relaxed ${touched && problems._reason ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                        {(touched && problems._reason)
                          || "Kept on this letter’s history for good. Write it for somebody checking the file in two years’ time."}
                      </p>
                    </div>

                    {fields.length > 0 ? (
                      <div>
                        <p className={LABEL}>Change any of the wording</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed -mt-1 mb-3">
                          Boxes start from your saved wording. Leave one empty and the new version uses the standard wording, not whatever the old one said.
                        </p>
                        <LetterIssueReminder code={code} className="mb-3" />
                        <LetterOverrideFields
                          idPrefix="rl"
                          fields={fields}
                          values={values}
                          saved={saved}
                          problems={problems}
                          revealRequired={attempted}
                          disabled={busy}
                          gridClass="grid grid-cols-1 gap-4"
                          wideClass=""
                          onChange={(key, value) => { setValues((v) => ({ ...v, [key]: value })); setTouched(true); }}
                        />
                      </div>
                    ) : templateError ? (
                      <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
                        <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                        The wording boxes for this letter couldn’t be loaded, so it will be reissued with your standard wording. That is usually exactly what a correction needs.
                      </p>
                    ) : null}

                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3.5">
                      <p className="text-sm font-bold text-indigo-900">What will happen</p>
                      <ul className="text-xs text-indigo-800 mt-1.5 space-y-1 leading-relaxed list-disc pl-4">
                        <li>The copy already issued{doc.reference_number ? ` (${doc.reference_number})` : ""} is kept exactly as it is, marked as replaced.</li>
                        <li>A new version is issued with its own reference number, dated today — not the date on the old one.</li>
                        <li>It is redrawn from your records and letterhead as they stand right now, so any correction you have made since is picked up.</li>
                        <li>Whoever received it sees the new version in their portal, and can still open the old one from its history.</li>
                      </ul>
                    </div>
                  </>
                )}
              </>
            )}

            {failure && !result && (
              <div className={`rounded-2xl border px-4 py-3.5 ${failure.waiting ? "border-indigo-200 bg-indigo-50" : "border-rose-200 bg-rose-50"}`} role="alert">
                <div className="flex items-start gap-3">
                  {failure.waiting
                    ? <HiInformationCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    : <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${failure.waiting ? "text-indigo-900" : "text-rose-800"}`}>
                      {failure.waiting ? "Still being drawn" : failure.unknown ? "We don’t know whether it went out" : "Nothing was replaced"}
                    </p>
                    <p className={`text-sm mt-0.5 leading-relaxed ${failure.waiting ? "text-indigo-800" : "text-rose-700"}`}>{failure.message}</p>
                    <LetterFixLink err={failure.err} onNavigate={() => onCloseRef.current?.()} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            {result ? (
              <>
                <p className="mr-auto text-[11px] text-slate-500 max-w-xs leading-relaxed">
                  {result.reused
                    ? "Nothing new was created — this is the replacement that already existed."
                    : "Keep the new reference number. The old one still names the old copy."}
                </p>
                <button type="button" onClick={() => setViewing({ ...result.letter, content_type: "application/pdf" })} className={SECONDARY_BTN}>
                  <HiEye className="w-4 h-4" /> Read it
                </button>
                <button type="button" onClick={download} disabled={downloading} className={SECONDARY_BTN}>
                  <HiDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
                </button>
                <button type="button" onClick={() => onCloseRef.current?.()} className={PRIMARY_BTN}>
                  <HiCheckCircle className="w-4 h-4" /> Done
                </button>
              </>
            ) : (
              <>
                <p className="mr-auto text-[11px] text-slate-500 max-w-xs leading-relaxed">
                  {blocker
                    ? "Nothing can be done from here."
                    : problems._reason
                      ? "A reason is needed before a numbered letter can be replaced."
                      : "The new version is published the moment you confirm."}
                </p>
                <button type="button" onClick={() => onCloseRef.current?.()} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
                {!blocker && (
                  <button
                    type="button"
                    onClick={() => reissue({ confirmed: !!failure })}
                    disabled={(!ready && !onlyMissingRequired) || busy || failure?.terminal === true}
                    className={PRIMARY_BTN}
                  >
                    <HiCollection className="w-4 h-4" />
                    {busy ? "Drawing the new version…" : failure ? "Try again" : "Reissue letter"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {viewing && (
        <AttachmentViewerDialog
          attachment={viewing}
          getViewUrl={api.orgGetViewUrl}
          errorMessage={documentErrorMessage}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

function Pair({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`text-xs font-semibold text-slate-700 break-words ${mono ? "tabular-nums" : ""}`}>{value || "N/A"}</dd>
    </div>
  );
}

/** The old number beside the new one — the only pairing that matters afterwards. */
function ReissuedSummary({ result, downloadError }) {
  const letter = result.letter || {};
  const old = result.supersedes;

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border px-5 py-4 ${result.reused ? "border-indigo-200 bg-indigo-50/70" : "border-violet-200 bg-violet-50/70"}`}>
        <div className="flex items-start gap-3">
          {result.reused
            ? <HiInformationCircle className="w-6 h-6 text-indigo-600 shrink-0" />
            : <HiCheckCircle className="w-6 h-6 text-violet-600 shrink-0" />}
          <div className="min-w-0">
            <p className={`text-sm font-bold ${result.reused ? "text-indigo-900" : "text-violet-900"}`}>
              {result.reused ? "This letter had already been replaced" : "Replaced and published"}
            </p>
            <p className={`text-xs mt-1 leading-relaxed ${result.reused ? "text-indigo-800" : "text-violet-800"}`}>
              {result.reused
                ? "The same replacement was asked for twice, so you are looking at the one that already exists. No third version was created and no extra reference number was used."
                : "The new version is in their portal now. The one it replaces is kept on file exactly as it went out."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          {old && (
            <>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Replaced</p>
                <p className="text-sm font-semibold text-slate-500 line-through break-all tabular-nums">{old.reference_number || "N/A"}</p>
                <p className="text-[10px] text-slate-400">{old.version ? `Version ${old.version}` : ""}</p>
              </div>
              <HiArrowNarrowRight className="w-5 h-5 text-slate-300 shrink-0 hidden sm:block" />
            </>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Live now</p>
            <p className="text-lg font-bold text-slate-900 break-all tabular-nums">{letter.reference_number || "N/A"}</p>
            <p className="text-[10px] text-slate-400">
              {[letter.version ? `Version ${letter.version}` : "", letter.published_at ? fmtDateTime(letter.published_at) : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Pair label="Letter" value={letter.title} />
        <Pair label="Who can see it" value={letter.is_confidential ? "You and the person it is about" : "Anyone your document rules allow"} />
      </dl>

      {downloadError && (
        <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">{downloadError}</p>
      )}
    </div>
  );
}
