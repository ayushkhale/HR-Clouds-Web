// ─────────────────────────────────────────────────────────────────────────────
// documents/BulkIssueLettersDialog.jsx — Queue one letter for many people at
// once (#143), using the catalog (#135) and the chosen letter's field list
// (#136).
//
// A form, so it follows the big-form pattern (CLAUDE.md §3): one wide panel,
// uppercase 11px labels, a pinned footer, nothing to scroll past.
//
// It is the single-issue form's sibling, and every difference between them
// comes from the same fact — this one queues work instead of doing it:
//
//  · IT PROMISES NOTHING ON RETURN. #143 answers 202 with a batch id; no letter
//    exists yet and none is numbered. So the confirmation is handed straight to
//    the batch inspector, which is where the outcome actually lives. Saying
//    "issued" here would be a lie for the next fifteen minutes.
//
//  · A BATCH IS ALL OR NOTHING ON THE WAY IN. If one person can't be sent this
//    letter, the server queues NOBODY (422 LETTER_BULK_VALIDATION_FAILED). That
//    is the one refusal worth spelling out person by person, because the fix is
//    to take those few out and send the rest — so the refusal is shown as a
//    list with a button that removes exactly them.
//
//  · THE CEILING IS THE ORGANISATION'S, NOT OURS. `letter_bulk_max_subjects`
//    (#91) is read from the settings and enforced in the picker, so nobody
//    assembles a list of three hundred and is refused at the end. When the
//    setting can't be read, the documented default stands in and the server
//    remains the authority.
//
//  · PICKING TWO HUNDRED PEOPLE ONE AT A TIME IS NOT A DESIGN. Whole departments
//    can be added in one go from the roster already loaded for the picker; the
//    picker itself is still there for the exceptions.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBadgeCheck, HiCalendar, HiDocumentText, HiExclamationCircle, HiInformationCircle, HiMail,
  HiPaperAirplane, HiRefresh, HiUserGroup, HiX,
} from "react-icons/hi";
import { PersonMultiSelect } from "../components/PersonPicker";
import FieldHelp from "../fieldHelp/FieldHelp";
import { departmentName } from "../attendance/normalize";
import { todayYMD } from "../attendance/dates";
import {
  bulkSubjectLimit, bulkValidationFailures, documentErrorMessage, isBulkValidationFailed,
  isRendererNotConfigured, letterIssueErrorMessage,
} from "../utils/documentErrors";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { letterTemplateOf, letterTemplatesOf, letterTitle } from "./letterMeta";
import {
  issueDateMax, issueDateMin, issueDateNote, issueDateProblem, letterOverridableFields, overrideProblems,
  overridesPayload, refusedFields,
} from "./letterIssueMeta";
import { BULK_MAX_SUBJECTS_FALLBACK, bulkBatchOf } from "./letterProposalMeta";

const TEMPLATES_PATH = "/dashboard/hr/documents/letter-templates";
const SETTINGS_PATH = "/dashboard/hr/documents/settings";

/** A titled block of the form, matching the single-issue dialog exactly. */
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
 * @param {object[]} props.people                the org roster
 * @param {"idle"|"loading"|"ready"|"error"} [props.peopleStatus]
 * @param {number} [props.maxSubjects]           the org's #91, when it is known
 * @param {string} [props.templateCode]          preselect one letter
 * @param {(batch: object, info: { templateCode: string, templateTitle: string }) => void} props.onQueued
 * @param {() => void} [props.onRendererOff]
 * @param {() => void} props.onClose
 */
export default function BulkIssueLettersDialog({
  api, people = [], peopleStatus = "ready", maxSubjects, templateCode = "",
  onQueued, onRendererOff, onClose,
}) {
  const [catalog, setCatalog] = useState({ rows: [], loading: true, error: null });
  const [code, setCode] = useState(templateCode);
  const [detail, setDetail] = useState({ data: null, loading: false, error: null });
  const [subjects, setSubjects] = useState([]);
  const [issuedOn, setIssuedOn] = useState(todayYMD());
  const [values, setValues] = useState({});

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);           // { message }
  const [rejected, setRejected] = useState([]);           // per-person refusals from a 422

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(false);
  busyRef.current = busy;

  // Escape closes this form and goes no further — captured, because this can
  // sit over the register's own listeners. Ignored while the batch is being
  // queued, so a stray key never looks like it cancelled a write.
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

  const issuable = useMemo(() => catalog.rows.filter((row) => row.is_enabled && !row.is_orphaned), [catalog.rows]);

  useEffect(() => {
    if (!code || catalog.loading) return;
    if (!issuable.some((row) => row.code === code)) setCode("");
  }, [code, issuable, catalog.loading]);

  // ── The chosen letter's own fields ─────────────────────────────────────────
  const detailReq = useRef(0);
  useEffect(() => {
    if (!code) { setDetail({ data: null, loading: false, error: null }); return; }
    const token = ++detailReq.current;
    setDetail({ data: null, loading: true, error: null });
    api.getLetterTemplate(code)
      .then((res) => { if (token === detailReq.current) setDetail({ data: letterTemplateOf(res), loading: false, error: null }); })
      .catch((error) => { if (token === detailReq.current) setDetail({ data: null, loading: false, error }); });
  }, [api, code]);

  const template = detail.data?.template || null;
  const fields = useMemo(
    () => (template ? letterOverridableFields(template, code, refusedFields(code)) : []),
    [template, code],
  );

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

  // ── The ceiling ────────────────────────────────────────────────────────────
  const ceiling = Number.isFinite(Number(maxSubjects)) && Number(maxSubjects) > 0
    ? Number(maxSubjects)
    : BULK_MAX_SUBJECTS_FALLBACK;

  // ── Whole departments, from the roster the picker already has ──────────────
  const departments = useMemo(() => {
    const groups = new Map();
    people.forEach((person) => {
      const id = person.user_id ?? person.id;
      const name = departmentName(person);
      if (!id || !name) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(id);
    });
    return [...groups.entries()]
      .map(([name, ids]) => ({ name, ids }))
      .filter((group) => group.ids.length > 1)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);

  const addDepartment = (ids) => {
    setSubjects((prev) => {
      const merged = [...new Set([...prev, ...ids])];
      // Stops at the ceiling rather than adding a list the server would refuse.
      return merged.slice(0, ceiling);
    });
    setFailure(null);
    setRejected([]);
  };

  const problems = useMemo(() => {
    const out = overrideProblems(fields, values);
    const dateProblem = issueDateProblem(issuedOn);
    if (dateProblem) out._date = dateProblem;
    return out;
  }, [fields, values, issuedOn]);

  const chosenRow = useMemo(() => issuable.find((row) => row.code === code) || null, [issuable, code]);
  const atCeiling = subjects.length >= ceiling;
  const ready = !!code && subjects.length > 0 && !detail.loading && !detail.error && Object.keys(problems).length === 0;

  // ── Queue it ───────────────────────────────────────────────────────────────
  const queue = async () => {
    if (!ready || busy) return;

    const ok = await window.confirm(
      `Send “${letterTitle(chosenRow)}” to ${subjects.length} ${subjects.length === 1 ? "person" : "people"}?\n\n`
      + `Each one gets their own numbered letter in their portal, and a letter can’t be edited once it is issued.\n\n`
      + `They are prepared in the background — you’ll be able to watch how far it has got.`,
    );
    if (!ok) return;

    setBusy(true);
    setFailure(null);
    setRejected([]);
    try {
      const body = { template_code: code, subject_user_ids: subjects };
      const overrides = overridesPayload(fields, values);
      if (Object.keys(overrides).length) body.field_overrides = overrides;
      if (issuedOn && issuedOn !== todayYMD()) body.effective_date = issuedOn;
      // Deliberately no `idempotency_key`: the server derives one from the
      // template, the people, the overrides and the date, which already
      // collapses a double submit into one batch. A key of ours would only
      // make two identical batches possible again.

      const batch = bulkBatchOf(await api.bulkIssueLetters(body));
      onQueued?.(batch, { templateCode: code, templateTitle: letterTitle(chosenRow) });
    } catch (err) {
      if (isRendererNotConfigured(err)) onRendererOff?.();
      if (isBulkValidationFailed(err)) setRejected(bulkValidationFailures(err));
      const limit = bulkSubjectLimit(err);
      setFailure({
        message: limit
          ? `This batch has ${subjects.length} people in it and your organisation allows ${limit} at a time. Nothing was queued — send it in smaller batches, or raise the limit in Document Settings.`
          : letterIssueErrorMessage(err, "Couldn’t queue these letters."),
      });
    } finally {
      setBusy(false);
    }
  };

  /** Take out exactly the people the server refused, and keep the rest. */
  const dropRejected = () => {
    const drop = new Set(rejected.map((row) => row.subjectUserId).filter(Boolean));
    setSubjects((prev) => prev.filter((id) => !drop.has(id)));
    setRejected([]);
    setFailure(null);
  };

  const nameOfPerson = (id) => people.find((p) => (p.user_id ?? p.id) === id)?.name || "";

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Send a letter to many people"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <HiUserGroup className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 truncate">Send a letter to many people</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                One letter, the same wording, a numbered copy each. They are prepared in the background.
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
          {catalog.error ? (
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
                A letter has to be switched on for your organisation before it can be issued to anybody.
              </p>
              <Link to={TEMPLATES_PATH} onClick={() => onCloseRef.current?.()} className={`${SECONDARY_BTN} mt-4`}>
                <HiBadgeCheck className="w-4 h-4" /> Go to Letter Templates
              </Link>
            </div>
          ) : (
            <>
              <Step n={1} title="Which letter" blurb="Everyone in this batch gets the same one.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {issuable.map((row) => {
                    const picked = row.code === code;
                    return (
                      <button
                        key={row.code}
                        type="button"
                        onClick={() => { setCode(row.code); setValues({}); setFailure(null); setRejected([]); }}
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

              {/* Who and when share one row: three stacked steps pushed this
                  form past a 1366×768 screen before a letter was even chosen,
                  and a form that scrolls before you start is a bug (§3). */}
              <Step
                n={2}
                title="Who it goes to, and when"
                blurb="Everything on each letter — name, job title, dates — is taken from that person’s own record."
              >
                <div className="grid lg:grid-cols-[minmax(0,1fr)_14rem] gap-x-6 gap-y-4 items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <label htmlFor="bl-people" className={`${LABEL} mb-0`}>People</label>
                    <FieldHelp
                      surface="documents.letter_bulk"
                      field="subject_user_ids"
                      label="who it goes to"
                      ariaLabel="How many people can be in one batch?"
                      size="sm"
                    />
                  </div>
                  <PersonMultiSelect
                    id="bl-people"
                    people={people}
                    value={subjects}
                    onChange={(next) => { setSubjects(next); setFailure(null); setRejected([]); }}
                    max={ceiling}
                    disabled={busy}
                    loading={peopleStatus === "loading"}
                    error={peopleStatus === "error" ? "Couldn’t load the list of people. Refresh the page and try again." : ""}
                    placeholder="Search by name or employee code"
                    aria-label="People this letter goes to"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <p className={`text-[11px] leading-relaxed ${atCeiling ? "font-semibold text-fuchsia-700" : "text-slate-500"}`}>
                      {subjects.length} of up to {ceiling} chosen
                      {atCeiling ? " — that is as many as your organisation allows in one batch. Send this one, then send the rest." : ""}
                    </p>
                    {subjects.length > 0 && (
                      <button type="button" onClick={() => setSubjects([])} disabled={busy} className="text-[11px] font-bold text-purple-600 hover:underline">
                        Clear everyone
                      </button>
                    )}
                  </div>

                  {departments.length > 0 && (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Add a whole team</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {departments.map((group) => (
                          <button
                            key={group.name}
                            type="button"
                            onClick={() => addDepartment(group.ids)}
                            disabled={busy || atCeiling}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-100 bg-purple-50 text-purple-700 text-[11px] font-semibold hover:bg-purple-100 disabled:opacity-50"
                          >
                            {group.name}
                            <span className="text-purple-400 tabular-nums">{group.ids.length}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor="bl-date" className={LABEL}>Date of issue</label>
                  <div className="relative">
                    <HiCalendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="bl-date" type="date" value={issuedOn} disabled={busy}
                      min={issueDateMin()} max={issueDateMax()}
                      onChange={(e) => setIssuedOn(e.target.value)}
                      className={`${FIELD} !pl-10`}
                    />
                  </div>
                  {problems._date ? (
                    <p className="text-[11px] font-semibold text-rose-600 mt-1.5">{problems._date}</p>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      {issueDateNote(issuedOn) || "Today. The same date goes on every letter in the batch."}
                    </p>
                  )}
                </div>
                </div>
              </Step>

              {code && (
                <Step
                  n={3}
                  title="What only you can say"
                  blurb="The same wording goes on every copy — anything that differs from person to person is taken from their record instead."
                >
                  {detail.error ? (
                    <p className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
                      <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
                      {documentErrorMessage(detail.error, "Couldn’t load what this letter asks for.")}
                    </p>
                  ) : detail.loading ? (
                    <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
                  ) : fields.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                      {fields.map((field) => (
                        <div key={field.key} className={field.long ? "lg:col-span-2" : ""}>
                          <label htmlFor={`bl-${field.key}`} className={LABEL}>{field.label}</label>
                          {field.long ? (
                            <textarea
                              id={`bl-${field.key}`} rows={2} value={values[field.key] ?? ""} disabled={busy}
                              maxLength={field.max}
                              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                              className={`${FIELD} resize-y`}
                            />
                          ) : (
                            <input
                              id={`bl-${field.key}`} type="text" value={values[field.key] ?? ""} disabled={busy}
                              maxLength={field.max}
                              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                              className={FIELD}
                            />
                          )}
                          <p className={`text-[10px] mt-1 leading-relaxed ${problems[field.key] ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                            {problems[field.key] || field.help || "The same on every letter in this batch."}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
                      <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                      There is nothing to type in for this letter — every word of it comes from each person’s record, your letterhead and the wording you saved in{" "}
                      <Link to={TEMPLATES_PATH} className="font-bold text-purple-600 hover:underline">Letter Templates</Link>.
                    </p>
                  )}
                </Step>
              )}
            </>
          )}

          {failure && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5" role="alert">
              <div className="flex items-start gap-3">
                <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-rose-800">Nothing was queued</p>
                  <p className="text-sm text-rose-700 mt-0.5 leading-relaxed">{failure.message}</p>

                  {rejected.length > 0 && (
                    <>
                      <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                        {rejected.map((row, i) => (
                          <li key={row.subjectUserId || i} className="text-xs text-rose-800">
                            <span className="font-bold">{nameOfPerson(row.subjectUserId) || "Someone in this list"}</span>
                            {" — "}
                            {row.reason || "can’t be sent this letter."}
                          </li>
                        ))}
                      </ul>
                      <button type="button" onClick={dropRejected} className={`${SECONDARY_BTN} mt-3`}>
                        Take {rejected.length === 1 ? "that person" : `those ${rejected.length}`} out and keep the rest
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="mr-auto text-[11px] text-slate-500 max-w-sm leading-relaxed">
            {!code
              ? "Choose which letter you are sending."
              : subjects.length === 0
                ? "Choose who it goes to."
                : Object.keys(problems).length
                  ? "Fix what is highlighted above."
                  : <>Each one is numbered as it is drawn. The limit is set in <Link to={SETTINGS_PATH} className="font-bold text-purple-600 hover:underline">Document Settings</Link>.</>}
          </p>
          <button type="button" onClick={() => onCloseRef.current?.()} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="button" onClick={queue} disabled={!ready || busy} className={PRIMARY_BTN}>
            <HiPaperAirplane className="w-4 h-4" />
            {busy ? "Queueing…" : `Send to ${subjects.length || 0} ${subjects.length === 1 ? "person" : "people"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
