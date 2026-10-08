// ─────────────────────────────────────────────────────────────────────────────
// documents/IssueLetterDialog.jsx — Issue one real, numbered letter to one
// person (#139), using the catalog (#135) and the chosen letter's own field
// list (#136).
//
// This is a form, not a record inspector, so it follows the big-form pattern:
// one panel, uppercase 11px labels, a pinned footer.
//
// It is also the most consequential form in the Documents module. Pressing the
// button here mints a legal reference number, renders a PDF that cannot be
// edited afterwards, and drops it into somebody's portal. Four things follow
// from that, and every one of them is deliberate:
//
//  · IT IS IMPOSSIBLE TO ISSUE TWO BY ACCIDENT. One idempotency key is minted
//    per attempt and held for the whole attempt, so a double-click, a slow
//    network or an impatient second press all land on the same key and produce
//    one letter. The key is only thrown away when the server records a failure —
//    see `keyForRetry()` in letterIssueMeta.js for why both halves of that rule
//    are load-bearing.
//
//  · WHAT IS TAKEN FROM THE PERSON'S RECORD IS SHOWN, READ-ONLY. #139 refuses an
//    override of a derived fact, so the form cannot offer those boxes — but
//    hiding them entirely leaves "why can't I fix the job title?" unanswered.
//    They are listed with the answer: correct it on their profile.
//
//  · CONFIDENTIALITY AND ACKNOWLEDGEMENT ARE NOT ASKED HERE. The walkthrough
//    mock-up shows two tick boxes for them; the contract has no such fields, and
//    #139 rejects an unknown key outright. Both are frozen onto the letter from
//    the organisation's settings (#85/#86) at the moment it is issued, so they
//    are stated as facts with a link to where they are changed. A tick box that
//    silently did nothing would be worse than no tick box.
//
//  · A SUCCESSFUL ISSUE DOES NOT JUST CLOSE. The reference number is the one
//    thing HR needs to write down or quote, and it exists nowhere until this
//    moment, so the dialog stays open on a confirmation that shows it, with the
//    PDF one click away.
//
// The last screen also tells the truth about an idempotent replay: when the
// server answers `reused: true` no second letter was created, and saying
// "issued" there would have somebody believe two went out.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBadgeCheck, HiCalendar, HiCheckCircle, HiDocumentText, HiDownload, HiExclamationCircle,
  HiEye, HiInformationCircle, HiLockClosed, HiMail, HiPaperAirplane, HiRefresh, HiUser, HiX,
} from "react-icons/hi";
import AttachmentViewerDialog from "../components/AttachmentViewerDialog";
import { PersonSelect } from "../components/PersonPicker";
import { fmtDate, fmtDateTime, todayYMD } from "../attendance/dates";
import { departmentName, employeeCode } from "../attendance/normalize";
import {
  documentErrorMessage, isLetterFieldRejected, isLetterOutcomeUnknown, isRenderInProgress,
  isRendererNotConfigured, isRetryLimitExceeded, letterErrorFieldKey, letterIssueErrorMessage,
} from "../utils/documentErrors";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { triggerDownload } from "./documentUpload";
import { humanizeCode } from "./documentMeta";
import useDocumentSettings from "./useDocumentSettings";
import { letterTemplateOf, letterTemplatesOf, letterTitle } from "./letterMeta";
import {
  issueDateMax, issueDateMin, issueDateNote, issueDateProblem, issuedLetterOf, keyForRetry,
  letterFactFields, letterOverridableFields, newIdempotencyKey, onlyRequiredMissing, overrideProblems,
  overridesFromSaved, overridesPayload, refusedFields, rememberNotOverridable, wasReused,
} from "./letterIssueMeta";
import LetterOverrideFields, { LetterIssueReminder } from "./LetterOverrideFields";
import LetterFixLink from "./LetterFixLink";

const SETTINGS_PATH = "/dashboard/hr/documents/settings";
const TEMPLATES_PATH = "/dashboard/hr/documents/letter-templates";

/** A titled block of the form. Same look as the Create Attendance Policy sections. */
function Step({ n, title, blurb, children }) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">{n}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {blurb && <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{blurb}</p>}
        </div>
      </div>
      <div className="pl-0 sm:pl-[34px]">{children}</div>
    </section>
  );
}

/**
 * @param {object} props
 * @param {object} props.api                     documentsAPI
 * @param {object[]} props.people                the org roster, for the person picker
 * @param {"idle"|"loading"|"ready"|"error"} [props.peopleStatus]
 * @param {string} [props.templateCode]          preselect one letter
 * @param {string} [props.subjectUserId]         preselect one person
 * @param {(letter: object, info: { reused: boolean }) => void} [props.onIssued]
 *   called once per letter that now exists, so a register behind can refresh
 * @param {() => void} [props.onRendererOff]     the server can't draw letters at all
 * @param {() => void} props.onClose
 */
export default function IssueLetterDialog({
  api, people = [], peopleStatus = "ready", templateCode = "", subjectUserId = "",
  onIssued, onRendererOff, onClose,
}) {
  const { settings } = useDocumentSettings();

  const [catalog, setCatalog] = useState({ rows: [], loading: true, error: null });
  const [code, setCode] = useState(templateCode);
  const [detail, setDetail] = useState({ data: null, loading: false, error: null });
  const [subject, setSubject] = useState(subjectUserId);
  const [issuedOn, setIssuedOn] = useState(todayYMD());
  const [values, setValues] = useState({});
  const [touched, setTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);   // { message, retryable, waiting }
  const [result, setResult] = useState(null);     // { letter, reused }
  const [viewing, setViewing] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  // Fields the server has refused as an override for this letter. Held in state
  // rather than read out of the session memory inside the memo, so React can see
  // it change — a memo over hidden mutable state never invalidates, and the box
  // would stay on screen after the refusal that removed it.
  const [refused, setRefused] = useState([]);

  // One key per attempt. Held across an in-flight retry, replaced after a
  // recorded failure — the two rules that keep a double letter impossible
  // without making a deliberate second copy impossible too.
  const keyRef = useRef(newIdempotencyKey("issue"));
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

  // ── The catalog ────────────────────────────────────────────────────────────
  const catalogReq = useRef(0);
  const loadCatalog = useCallback(async () => {
    const token = ++catalogReq.current;
    setCatalog((c) => ({ ...c, loading: true, error: null }));
    try {
      const rows = letterTemplatesOf(await api.getLetterTemplates());
      if (token !== catalogReq.current) return;
      setCatalog({ rows, loading: false, error: null });
    } catch (error) {
      if (token === catalogReq.current) setCatalog({ rows: [], loading: false, error });
    }
  }, [api]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  /**
   * Only a letter that is switched on and still offered by the platform can be
   * issued: #139 answers 409 for a switched-off one and 404 for a withdrawn one.
   * A control that fails is worse than one that isn't there.
   */
  const issuable = useMemo(
    () => catalog.rows.filter((row) => row.is_enabled && !row.is_orphaned),
    [catalog.rows],
  );

  // A preselected letter that turns out not to be issuable is dropped rather
  // than left selected — otherwise the form looks ready and the server refuses.
  useEffect(() => {
    if (!code || catalog.loading) return;
    if (!issuable.some((row) => row.code === code)) setCode("");
  }, [code, issuable, catalog.loading]);

  // ── The chosen letter's own fields ─────────────────────────────────────────
  const detailReq = useRef(0);
  const loadDetail = useCallback(async (which) => {
    if (!which) { setDetail({ data: null, loading: false, error: null }); return; }
    const token = ++detailReq.current;
    setDetail({ data: null, loading: true, error: null });
    try {
      const data = letterTemplateOf(await api.getLetterTemplate(which));
      if (token !== detailReq.current) return;
      setDetail({ data, loading: false, error: null });
    } catch (error) {
      if (token === detailReq.current) setDetail({ data: null, loading: false, error });
    }
  }, [api]);

  useEffect(() => { loadDetail(code); }, [code, loadDetail]);
  // Whatever the server has already refused for THIS letter, so switching
  // between letters never carries one letter's refusals into another's form.
  useEffect(() => { setRefused(refusedFields(code)); }, [code]);

  const template = detail.data?.template || null;
  // `fields` is recomputed from the refusal memory, so a box the server has
  // already rejected for this letter never comes back.
  const fields = useMemo(() => (template ? letterOverridableFields(template, code, refused) : []), [template, code, refused]);
  const factFields = useMemo(() => (template ? letterFactFields(template, code) : []), [template, code]);
  // This organisation's saved wording for the letter (#137). It prefills the
  // matching boxes and, where a required box has one, satisfies it (§2.1).
  const saved = detail.data?.config?.saved_fields || null;
  // A required box left empty turns red only once Issue has been pressed.
  const [attempted, setAttempted] = useState(false);

  // A newly loaded letter starts from the saved wording — once per letter, so a
  // refusal that removes a box later doesn't reset what was typed.
  useEffect(() => {
    if (!template) return;
    setValues(overridesFromSaved(letterOverridableFields(template, code, refusedFields(code)), saved));
    setAttempted(false);
  }, [template, saved, code]);

  // Values for boxes that no longer exist are dropped, so a removed field can't
  // be sent from stale state.
  useEffect(() => {
    setValues((prev) => {
      const allowed = new Set(fields.map((f) => f.key));
      const next = {};
      Object.entries(prev).forEach(([key, value]) => { if (allowed.has(key)) next[key] = value; });
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [fields]);

  const problems = useMemo(() => {
    const out = overrideProblems(fields, values, saved);
    const dateProblem = issueDateProblem(issuedOn);
    // Prefixed so it can never collide with a template field key, which the
    // server's own pattern requires to start with a lowercase letter.
    if (dateProblem) out._date = dateProblem;
    return out;
  }, [fields, values, issuedOn, saved]);

  const chosenRow = useMemo(() => issuable.find((row) => row.code === code) || null, [issuable, code]);
  const person = useMemo(
    () => people.find((p) => (p.user_id ?? p.id) === subject) || null,
    [people, subject],
  );

  const ready = !!code && !!subject && !detail.loading && !detail.error && Object.keys(problems).length === 0;
  // Pressing Issue with only required boxes empty is allowed — it is what turns
  // those boxes red — so the button isn't dead while they are.
  const onlyMissingRequired = !!code && !!subject && !detail.loading && !detail.error && onlyRequiredMissing(problems);

  // ── Issue ──────────────────────────────────────────────────────────────────
  const issue = async ({ confirmed = false } = {}) => {
    setAttempted(true);
    if (!ready || busy) return;

    if (!confirmed) {
      const who = person?.name || "this person";
      const ok = await window.confirm(
        `Issue “${letterTitle(chosenRow)}” to ${who}?\n\n`
        + `It is published the moment you confirm: it gets an official reference number, appears in their portal straight away, and can’t be edited afterwards.\n\n`
        + `If something is wrong you can reissue it, which keeps this copy on file and replaces it with a corrected one.`,
      );
      if (!ok) return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const body = {
        template_code: code,
        subject_user_id: subject,
        idempotency_key: keyRef.current,
      };
      const overrides = overridesPayload(fields, values);
      if (Object.keys(overrides).length) body.field_overrides = overrides;
      // Left out when it is today: the server defaults to today, and sending it
      // anyway is one more value that can drift out of the ±365-day window if
      // the dialog is left open past midnight.
      if (issuedOn && issuedOn !== todayYMD()) body.effective_date = issuedOn;

      const res = await api.issueLetter(body);
      const letter = issuedLetterOf(res);
      if (!letter?.id) {
        // The call SUCCEEDED but the reply didn't name the letter, so it exists
        // and this screen can't show it. Deliberately not thrown: a throw would
        // land in the retry path below and a retry with a fresh key would issue
        // a second numbered letter. The register is the answer.
        setFailure({ message: "The letter was issued, but the reply didn’t say which one. Open the register to find it — don’t issue it again, or the person will end up with two.", retryable: false, waiting: false });
        onIssued?.(letter || {}, { reused: false });
        return;
      }
      const reused = wasReused(res);
      setResult({ letter, reused });
      onIssued?.(letter, { reused });
    } catch (err) {
      if (isRendererNotConfigured(err)) onRendererOff?.();

      // The server has named a field it will not accept. Remember it for the
      // session, drop the box, and say so — one more click issues the letter
      // instead of the person guessing which detail was the problem.
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

      keyRef.current = keyForRetry(keyRef.current, err, isRenderInProgress, "issue");
      const unknown = isLetterOutcomeUnknown(err);
      setFailure({
        message: unknown
          ? "The server didn’t answer, so we can’t tell whether the letter went out. Try again — if it did, you’ll be shown that same letter rather than a second one."
          : letterIssueErrorMessage(err, "Couldn’t issue this letter."),
        // In-progress is the one failure where trying again is the whole answer
        // and the same request is repeated; everything else that is worth
        // retrying now carries a fresh key.
        retryable: !isRetryLimitExceeded(err),
        waiting: isRenderInProgress(err),
        unknown,
        err,
      });
    } finally {
      setBusy(false);
    }
  };

  // ── After it is issued ─────────────────────────────────────────────────────
  const download = async () => {
    const id = result?.letter?.id;
    if (!id || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      // The letter is an org document, so its PDF comes from the ordinary signed
      // download (#57) — no endpoint in this phase hands one back.
      const url = ((await api.orgGetViewUrl(id, { disposition: "attachment" }))?.data ?? {})?.view_url;
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
    } catch (err) {
      setDownloadError(documentErrorMessage(err, "Couldn’t prepare the download."));
    } finally {
      setDownloading(false);
    }
  };

  /** Another letter, for somebody else: same kind and date, fresh person, fresh key. */
  const issueAnother = () => {
    setResult(null);
    setFailure(null);
    setSubject("");
    setValues(overridesFromSaved(fields, saved));
    setAttempted(false);
    setTouched(false);
    setDownloadError("");
    keyRef.current = newIdempotencyKey("issue");
  };

  // ── What is frozen onto the letter from the settings (#85 / #86) ────────────
  // `null` is a real answer for #86 ("whatever the document type says"), so
  // "not loaded yet" has to be a different value from it — otherwise a server
  // that has never been given a default reads "Loading…" for ever.
  const confidential = settings ? settings.letter_default_confidential !== false : null;
  const ackDefault = settings ? (settings.letter_requires_acknowledgement_default ?? null) : undefined;

  const title = result ? "Letter issued" : "Issue a letter";

  return (
    <>
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4"
        onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}
      >
        <div
          role="dialog" aria-modal="true" aria-label={title}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${result ? "bg-violet-50 text-violet-600" : "bg-purple-50 text-purple-600"}`}>
                {result ? <HiCheckCircle className="w-5 h-5" /> : <HiMail className="w-5 h-5" />}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">{title}</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {result
                    ? "It is published and in their portal. Keep the reference number — it is how this letter is quoted."
                    : "One letter, one person. It is published as soon as you confirm."}
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

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-7">
            {result ? (
              <IssuedSummary
                result={result}
                person={person}
                letterName={letterTitle(chosenRow)}
                downloadError={downloadError}
              />
            ) : catalog.error ? (
              <div className="text-center py-10">
                <HiExclamationCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 max-w-md mx-auto">
                  {documentErrorMessage(catalog.error, "Couldn’t load the letters you can issue.")}
                </p>
                <button type="button" onClick={loadCatalog} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">
                  <HiRefresh className="w-4 h-4" /> Try again
                </button>
              </div>
            ) : catalog.loading ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
            ) : issuable.length === 0 ? (
              <div className="text-center py-10 max-w-md mx-auto">
                <span className="w-12 h-12 rounded-full bg-fuchsia-50 text-fuchsia-500 flex items-center justify-center mx-auto mb-3"><HiMail className="w-6 h-6" /></span>
                <p className="text-sm font-bold text-slate-800">No letter is switched on yet</p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  A letter has to be switched on for your organisation before it can be issued. Switch on the ones you use, and they’ll appear here.
                </p>
                <Link to={TEMPLATES_PATH} onClick={() => onCloseRef.current?.()} className={`${SECONDARY_BTN} mt-4`}>
                  <HiBadgeCheck className="w-4 h-4" /> Go to Letter Templates
                </Link>
              </div>
            ) : (
              <>
                <Step n={1} title="Which letter" blurb="Only the letters your organisation has switched on can be issued.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {issuable.map((row) => {
                      const picked = row.code === code;
                      return (
                        <button
                          key={row.code}
                          type="button"
                          onClick={() => { setCode(row.code); setValues({}); setFailure(null); }}
                          aria-pressed={picked}
                          disabled={busy}
                          className={`text-left rounded-xl border px-4 py-3 transition disabled:opacity-60 ${picked ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
                        >
                          <span className="flex items-center gap-2">
                            <HiDocumentText className={`w-4 h-4 shrink-0 ${picked ? "text-purple-600" : "text-slate-400"}`} />
                            <span className="text-sm font-bold text-slate-800 truncate">{letterTitle(row)}</span>
                          </span>
                          <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                            {row.has_saved_fields ? "Your saved wording is filled in automatically." : "Uses the standard wording."}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Step>

                <Step n={2} title="Who it is for" blurb="Everything about them — their name, job title, dates — is taken from their record, exactly as it stands today.">
                  <div className="max-w-md">
                    <label htmlFor="il-person" className={LABEL}>Employee</label>
                    <PersonSelect
                      id="il-person"
                      people={people}
                      value={subject}
                      onChange={(id) => { setSubject(id); setFailure(null); }}
                      placeholder="Search by name or employee code"
                      loading={peopleStatus === "loading"}
                      error={peopleStatus === "error" ? "Couldn’t load the list of people. Refresh the page and try again." : ""}
                      disabled={busy}
                      aria-label="Employee the letter is for"
                    />
                  </div>
                  {person && <PersonFacts person={person} />}
                </Step>

                <Step n={3} title="Date on the letter" blurb="Printed on the letter, and the year its reference number belongs to.">
                  <div className="max-w-xs">
                    <label htmlFor="il-date" className={LABEL}>Date of issue</label>
                    <div className="relative">
                      <HiCalendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="il-date" type="date" value={issuedOn} disabled={busy}
                        min={issueDateMin()} max={issueDateMax()}
                        onChange={(e) => { setIssuedOn(e.target.value); setTouched(true); }}
                        className={`${FIELD} !pl-10`}
                      />
                    </div>
                    {problems._date ? (
                      <p className="text-[11px] font-semibold text-rose-600 mt-1.5">{problems._date}</p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                        {issueDateNote(issuedOn) || "Today. Change it only if the letter has to carry a different date."}
                      </p>
                    )}
                  </div>
                </Step>

                {code && (
                  <Step
                    n={4}
                    title="What only you can say"
                    blurb="The parts of this letter that change from one copy to the next. Everything else is taken from their record or from your saved wording."
                  >
                    {detail.error ? (
                      <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
                        <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
                        {documentErrorMessage(detail.error, "Couldn’t load what this letter asks for.")}
                      </p>
                    ) : detail.loading ? (
                      <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
                    ) : (
                      <>
                        <LetterIssueReminder code={code} className="mb-4" />
                        {fields.length > 0 ? (
                          <LetterOverrideFields
                            idPrefix="il"
                            fields={fields}
                            values={values}
                            saved={saved}
                            problems={problems}
                            revealRequired={attempted}
                            disabled={busy}
                            onChange={(key, value) => { setValues((v) => ({ ...v, [key]: value })); setTouched(true); }}
                            defaultHint={(field) => (field.known
                              ? "Optional — leave it empty to leave it out."
                              : field.required
                                ? "This normally appears on the letter. Leave it empty only if your saved wording covers it."
                                : "Leave it empty to use the standard wording.")}
                          />
                        ) : (
                          <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
                            <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                            There is nothing to type in for this letter — every word of it comes from their record, your letterhead and the wording you saved in{" "}
                            <Link to={TEMPLATES_PATH} className="font-bold text-purple-600 hover:underline">Letter Templates</Link>.
                          </p>
                        )}

                        {factFields.length > 0 && <FactList fields={factFields} />}
                      </>
                    )}
                  </Step>
                )}

                {code && subject && (
                  <Step n={5} title="How it will be filed" blurb="Set once for your whole organisation, not per letter.">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                      <SettingLine
                        icon={HiLockClosed}
                        label="Who can see it"
                        value={confidential === null
                          ? "Loading…"
                          : confidential
                            ? "Only you and the person it is about"
                            : "Anyone your document rules allow"}
                      />
                      <SettingLine
                        icon={HiBadgeCheck}
                        label="Asked to confirm they’ve read it"
                        value={ackDefault === undefined
                          ? "Loading…"
                          : ackDefault === true
                            ? "Yes — they’ll be asked to acknowledge it"
                            : ackDefault === false
                              ? "No"
                              : "Whatever this kind of letter is set to"}
                      />
                      <div className="px-4 py-2.5">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Change either of these in{" "}
                          <Link to={SETTINGS_PATH} className="font-bold text-purple-600 hover:underline">Document Settings</Link>
                          {" "}before you issue — a letter keeps whatever was set when it went out.
                        </p>
                      </div>
                    </div>
                  </Step>
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
                      {failure.waiting ? "Still being drawn" : failure.unknown ? "We don’t know whether it went out" : "Nothing was issued"}
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
                <p className="mr-auto text-[11px] text-slate-500 max-w-sm leading-relaxed">
                  {result.reused
                    ? "Nothing new was created — this is the letter that already existed."
                    : "The person it is about can see it in their portal now."}
                </p>
                <button type="button" onClick={() => setViewing({ ...result.letter, content_type: "application/pdf" })} className={SECONDARY_BTN}>
                  <HiEye className="w-4 h-4" /> Read it
                </button>
                <button type="button" onClick={download} disabled={downloading} className={SECONDARY_BTN}>
                  <HiDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
                </button>
                <button type="button" onClick={issueAnother} className={SECONDARY_BTN}>
                  <HiMail className="w-4 h-4" /> Issue another
                </button>
                <button type="button" onClick={() => onCloseRef.current?.()} className={PRIMARY_BTN}>
                  <HiCheckCircle className="w-4 h-4" /> Done
                </button>
              </>
            ) : (
              <>
                <p className="mr-auto text-[11px] text-slate-500 max-w-sm leading-relaxed">
                  {!code
                    ? "Choose which letter you are issuing."
                    : !subject
                      ? "Choose who it is for."
                      : Object.keys(problems).length
                        ? (onlyRequiredMissing(problems) ? "Fill in the details marked * above." : "Fix what is highlighted above.")
                        : touched
                          ? "Check it over — a letter can’t be edited once it is issued."
                          : "It is published the moment you confirm."}
                </p>
                <button type="button" onClick={() => onCloseRef.current?.()} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
                <button
                  type="button"
                  onClick={() => issue({ confirmed: !!failure })}
                  disabled={(!ready && !onlyMissingRequired) || busy || failure?.retryable === false}
                  className={PRIMARY_BTN}
                >
                  <HiPaperAirplane className="w-4 h-4" />
                  {busy ? "Drawing the letter…" : failure ? "Try again" : "Issue letter"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* A sibling of the form, never a child: its own Escape and backdrop must
          not reach the form underneath. */}
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

/** The one thing on screen worth reading twice. */
function IssuedSummary({ result, person, letterName, downloadError }) {
  const letter = result.letter || {};
  const reference = letter.reference_number || "";

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border px-5 py-4 ${result.reused ? "border-indigo-200 bg-indigo-50/70" : "border-violet-200 bg-violet-50/70"}`}>
        <div className="flex items-start gap-3">
          {result.reused
            ? <HiInformationCircle className="w-6 h-6 text-indigo-600 shrink-0" />
            : <HiCheckCircle className="w-6 h-6 text-violet-600 shrink-0" />}
          <div className="min-w-0">
            <p className={`text-sm font-bold ${result.reused ? "text-indigo-900" : "text-violet-900"}`}>
              {result.reused ? "This letter had already been issued" : "Issued and published"}
            </p>
            <p className={`text-xs mt-1 leading-relaxed ${result.reused ? "text-indigo-800" : "text-violet-800"}`}>
              {result.reused
                ? "The same letter was asked for twice, so you are looking at the one that already exists. No second copy was created and no second reference number was used."
                : "It is in the person’s portal now, and on your register for good."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <p className={LABEL}>Reference number</p>
        <p className="text-xl font-bold text-slate-900 tracking-tight break-all tabular-nums">{reference || "N/A"}</p>
        <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
          Quote this whenever anyone asks about the letter. It belongs to this copy only — a reissue gets its own.
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Fact label="Letter" value={letter.title || letterName} />
        <Fact label="For" value={person?.name || "N/A"} />
        <Fact label="Published" value={letter.published_at ? fmtDateTime(letter.published_at) : "Just now"} />
        <Fact label="Version" value={letter.version ? `Version ${letter.version}` : "Version 1"} />
        <Fact label="Who can see it" value={letter.is_confidential ? "You and the person it is about" : "Anyone your document rules allow"} />
        <Fact
          label="Asked to confirm they’ve read it"
          value={letter.requires_acknowledgement ? "Yes" : "No"}
        />
      </dl>

      {downloadError && (
        <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">{downloadError}</p>
      )}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="text-sm font-semibold text-slate-800 break-words">{value || "N/A"}</dd>
    </div>
  );
}

/**
 * What the record already says about the person, so a letter is never issued to
 * the wrong one. Read from the roster the picker uses — the same fields the
 * letter itself will print.
 */
function PersonFacts({ person }) {
  // Read through the shared normalisers, because a roster row's shape differs
  // between the list purposes: `department` is sometimes a string and sometimes
  // an object, and the joining date has three spellings in the wild.
  const joined = [person.date_of_joining, person.joining_date, person.doj]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find(Boolean);
  const items = [
    ["Employee code", employeeCode(person)],
    ["Job title", typeof person.designation === "string" ? person.designation : ""],
    ["Department", departmentName(person)],
    ["Joined", joined ? fmtDate(joined) : ""],
  ].filter(([, value]) => typeof value === "string" && value.trim());

  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <HiUser className="w-3.5 h-3.5" /> From their record
      </p>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-2">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] font-semibold text-slate-400 truncate">{label}</dt>
            <dd className="text-xs font-semibold text-slate-700 truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The parts of the letter that are read from the record and cannot be typed in.
 * Folded into one calm list rather than a row of disabled boxes: a disabled box
 * invites somebody to look for the switch that enables it.
 */
function FactList({ fields }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filled in from their record</p>
      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
        These can’t be typed in here, so a letter always matches your records. If one of them is wrong, correct it on the person’s profile and then issue the letter.
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {fields.map((field) => (
          <span key={field.key} className="inline-flex items-center px-2 py-0.5 rounded-md border border-purple-100 bg-purple-50 text-purple-700 text-[11px] font-semibold">
            {humanizeCode(field.key)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SettingLine({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-700">{label}</p>
        <p className="text-xs text-slate-600 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
