// ─────────────────────────────────────────────────────────────────────────────
// LetterTemplatesPage.jsx — The standard letters the company can issue, each one
// switched on or off and each carrying the wording that never changes between
// copies. PDF Generation Phase 1 (#135 catalog, #136/#137 setup, #138 preview).
//
// The catalog is the platform's, not the organisation's: HR cannot add a letter,
// only decide which of the standard ones it uses and what its own defaults are.
// So this is a short, complete list rather than a paged search, read in one call
// and filtered in the browser.
//
// Four things this screen has to get right:
//
//  · A letter the platform has WITHDRAWN (`is_orphaned`) is still shown. The
//    organisation configured it once, and silently dropping it would leave
//    "where did our experience letter go?" unanswerable. It cannot be opened
//    (#136 answers 404) or drawn, so its row has no actions at all — not a
//    disabled button — and says why in plain words.
//  · A letter's preview and its letterhead are the same page. A letterhead with
//    no signatory or logo makes every preview look broken for a reason that is
//    on another screen, so what is missing is said here, with the link.
//  · Nothing tells us in advance whether the server can draw PDFs at all
//    (#134/#138 answer 503 when the renderer isn't configured; the other seven
//    endpoints are unaffected). So previews are offered until one comes back
//    saying otherwise, and from then on the screen stops offering them and says
//    why. Everything else on the page keeps working.
//  · A save returns the new config, so the one row is patched in place rather
//    than re-reading the catalog.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBadgeCheck, HiCog, HiExclamation, HiExternalLink, HiEye, HiInformationCircle,
  HiMail, HiPaperAirplane, HiRefresh,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { documentsAPI } from "../../../../shared/api";
import { FilterTabs, Toast, useToast } from "../../../../shared/attendance/ui";
import { TONE_CLASSES, TONE_DOT } from "../../../../shared/attendance/enums";
import { isRendererNotConfigured, letterErrorMessage } from "../../../../shared/utils/documentErrors";
import { DocEmptyState, DocErrorState, SECONDARY_BTN } from "../../../../shared/documents/ui";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import LetterPreviewDialog from "../../../../shared/documents/LetterPreviewDialog";
import LetterTemplateConfigDialog from "../../../../shared/documents/LetterTemplateConfigDialog";
import {
  brandingOf, canConfigureLetter, letterAudience, letterCannotIssue, letterPurpose, letterStateMeta,
  letterConfigOf, letterTemplateOf, letterTemplatesOf, letterTitle, letterTypeResultOf, letterheadGaps,
  LETTER_ISSUANCE_BLOCKED_NOTE, previewUsesSavedFields,
} from "../../../../shared/documents/letterMeta";

const BRANDING_PATH = "/dashboard/hr/documents/letterhead";
const LETTERS_PATH = "/dashboard/hr/documents/letters";

function StateBadge({ row }) {
  const meta = letterStateMeta(row);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone]}`}
      title={meta.hint}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function Tile({ label, value, sub, icon: Icon, tone = "text-purple-500" }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-xs px-4 py-3.5">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1 truncate">{sub}</p>}
    </div>
  );
}

export default function LetterTemplatesPage() {
  const { toast, showToast, clearToast } = useToast();
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [letterhead, setLetterhead] = useState(null);   // { branding, inherited } or null while unknown
  const [tab, setTab] = useState("");                   // "" | "enabled" | "disabled"
  const [configuring, setConfiguring] = useState(null); // the catalog row being set up
  const [previewing, setPreviewing] = useState(null);   // the catalog row being drawn
  // Set once the server says it has no renderer. Nothing else on the page
  // depends on it, so the rest keeps working.
  const [rendererOff, setRendererOff] = useState(false);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = letterTemplatesOf(await documentsAPI.getLetterTemplates());
      if (token !== reqRef.current) return;
      setState({ rows, loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], loading: false, error });
    }
  }, []);

  // The letterhead is read alongside, for the "finish your letterhead first"
  // strip. It is context, so a failure here leaves the strip out rather than
  // taking the catalog down with it.
  const brandingRef = useRef(0);
  const loadLetterhead = useCallback(async () => {
    const token = ++brandingRef.current;
    try {
      const next = brandingOf(await documentsAPI.getLetterBranding());
      if (token === brandingRef.current) setLetterhead(next);
    } catch {
      if (token === brandingRef.current) setLetterhead(null);
    }
  }, []);

  useEffect(() => { load(); loadLetterhead(); }, [load, loadLetterhead]);

  const counts = useMemo(() => ({
    all: state.rows.length,
    enabled: state.rows.filter((r) => r.is_enabled && !r.is_orphaned).length,
    disabled: state.rows.filter((r) => !r.is_enabled && !r.is_orphaned).length,
    withdrawn: state.rows.filter((r) => r.is_orphaned).length,
    // Switched on, but their document type isn't live — they will 409 at issue
    // (letter change record 2026-10-03 §1.4). Healed by a re-save (§1.5).
    cannotIssue: state.rows.filter(letterCannotIssue).length,
  }), [state.rows]);

  const visible = useMemo(() => {
    if (tab === "enabled") return state.rows.filter((r) => r.is_enabled && !r.is_orphaned);
    if (tab === "disabled") return state.rows.filter((r) => !r.is_enabled && !r.is_orphaned);
    return state.rows;
  }, [state.rows, tab]);

  const gaps = useMemo(
    () => (letterhead ? letterheadGaps(letterhead.branding, letterhead.inherited) : []),
    [letterhead],
  );

  /**
   * #137 answers with the saved config AND, since the 2026-10-03 change, the
   * `document_type` activation block — so only the one row changes, and its
   * "can be issued?" state updates in place without a re-read.
   *
   * `typeResult` is null when the letter was switched OFF (nothing was touched —
   * switching off never deactivates the type, §1.2), so `document_type_active`
   * is only ever written from a present block. `warn` is raised when the save
   * succeeded but the type couldn't be activated (an ops problem, §1.3).
   */
  const applySaved = (code, config, note, typeResult = null, { warn = false } = {}) => {
    setConfiguring(null);
    setState((s) => ({
      ...s,
      rows: s.rows.map((row) => (row.code === code ? {
        ...row,
        is_enabled: !!config?.is_enabled,
        pinned_version: config?.pinned_version ?? null,
        has_saved_fields: Object.keys(config?.saved_fields || {}).length > 0,
        ...(typeResult ? {
          document_type_active: typeResult.isActive,
          document_type_code: typeResult.code || row.document_type_code || null,
        } : {}),
      } : row)),
    }));
    if (note) showToast(note, warn ? "error" : "success");
  };

  /**
   * Switch a letter on in one click (#137 `is_enabled: true`). Since the
   * 2026-10-03 change this is a SINGLE step: enabling the letter also activates
   * the org document type it files into, in the same transaction — so the old
   * "now go and switch its type on too" caveat is gone.
   *
   * The same call heals a row that is already on but shows "can’t be issued yet"
   * (§1.5): re-sending `is_enabled: true` is idempotent and returns
   * `already_active` when nothing was needed. So the "Fix" action reuses it.
   *
   * #137 REPLACES the stored config, so the current one is read first (#136)
   * and echoed back: sending `is_enabled` alone could wipe saved wording or
   * unpin a version.
   */
  const [enabling, setEnabling] = useState("");
  const enableLetter = async (row, { heal = false } = {}) => {
    if (enabling) return;
    setEnabling(row.code);
    try {
      const { config } = letterTemplateOf(await documentsAPI.getLetterTemplate(row.code));
      const res = await documentsAPI.updateLetterTemplateConfig(row.code, {
        is_enabled: true,
        saved_fields: config?.saved_fields || {},
        pinned_version: config?.pinned_version ?? null,
      });
      const typeResult = letterTypeResultOf(res);
      const blocked = typeResult && !typeResult.isActive;
      const note = blocked
        ? `Saved. ${LETTER_ISSUANCE_BLOCKED_NOTE}`
        : heal
          ? `“${letterTitle(row)}” can be issued again.`
          : `“${letterTitle(row)}” is switched on and ready to issue.`;
      applySaved(row.code, letterConfigOf(res) || { ...config, is_enabled: true }, note, typeResult, { warn: !!blocked });
    } catch (err) {
      showToast(letterErrorMessage(err, "Couldn’t switch this letter on."), "error");
    } finally {
      setEnabling("");
    }
  };

  const onPreviewError = (err) => {
    if (isRendererNotConfigured(err)) setRendererOff(true);
  };

  const tabs = [
    { value: "", label: `All letters (${counts.all})` },
    { value: "enabled", label: `In use (${counts.enabled})` },
    { value: "disabled", label: `Switched off (${counts.disabled})` },
  ];

  return (
    <>
      <DashboardTopBar title="Letter Templates" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900"><HelpLabel text="Letter Templates" help={{ surface: "documents.letter_templates", field: "page", label: "the Letter Templates page" }} /></h1>
            <p className="text-sm text-slate-500 mt-1">
              The standard letters your company issues. Switch on the ones you use and save the wording that never changes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button" onClick={() => { load(); loadLetterhead(); }} disabled={state.loading}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50"
              aria-label="Refresh" title="Refresh"
            >
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <Link to={BRANDING_PATH} className={SECONDARY_BTN}>
              <HiBadgeCheck className="w-4 h-4" /> Letterhead &amp; Branding
            </Link>
            {/* Setting a letter up and issuing one are different jobs on
                different days, so this screen points at the register rather than
                trying to be it. */}
            <Link to={LETTERS_PATH} className={SECONDARY_BTN}>
              <HiPaperAirplane className="w-4 h-4" /> Issued Letters
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Tile label="In use" value={state.loading ? "…" : counts.enabled} sub="Ready to be prepared" icon={HiBadgeCheck} tone="text-violet-500" />
          <Tile label="Switched off" value={state.loading ? "…" : counts.disabled} sub={counts.disabled ? "Nobody can prepare these" : "Nothing switched off"} icon={HiCog} tone="text-fuchsia-500" />
        </div>

        {/* The letterhead is the frame around every one of these letters, so
            what is missing from it belongs on this screen too. */}
        {gaps.length > 0 && (
          <Link
            to={BRANDING_PATH}
            className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 hover:bg-fuchsia-100/60 transition"
          >
            <HiExclamation className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
            <span className="text-sm text-fuchsia-900 flex-1 leading-relaxed">
              <span className="font-bold">Your letterhead is still missing {gaps.join(", ")}.</span>{" "}
              Letters will print without {gaps.length === 1 ? "it" : "them"} until you fill {gaps.length === 1 ? "it" : "them"} in.
            </span>
            <span className="text-xs font-bold text-fuchsia-700 shrink-0 mt-0.5 whitespace-nowrap">Finish it <HiExternalLink className="inline w-3 h-3" /></span>
          </Link>
        )}

        {rendererOff && (
          <p className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 leading-relaxed" role="status">
            <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              <span className="font-bold">Letter previews aren’t switched on for this server yet.</span>{" "}
              Everything you set up here is saved and will be used the moment they are — ask your administrator to turn on letter rendering.
            </span>
          </p>
        )}

        {counts.cannotIssue > 0 && (
          <p className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 leading-relaxed" role="status">
            <HiExclamation className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <span>
              <span className="font-bold">
                {counts.cannotIssue === 1 ? "One switched-on letter can’t be issued yet." : `${counts.cannotIssue} switched-on letters can’t be issued yet.`}
              </span>{" "}
              The kind of document {counts.cannotIssue === 1 ? "it files" : "they file"} into isn’t active. Use <span className="font-semibold">Fix</span> on {counts.cannotIssue === 1 ? "the row" : "each row"} below to put {counts.cannotIssue === 1 ? "it" : "them"} right; if that doesn’t clear it, your administrator needs to set the document type up.
            </span>
          </p>
        )}

        {counts.withdrawn > 0 && (
          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 leading-relaxed">
            {counts.withdrawn === 1 ? "One letter you had set up is" : `${counts.withdrawn} letters you had set up are`} no longer offered by the platform. {counts.withdrawn === 1 ? "It is" : "They are"} still listed below, with your wording kept, but {counts.withdrawn === 1 ? "it" : "they"} can’t be prepared or previewed.
          </p>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <FilterTabs options={tabs} value={tab} onChange={setTab} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn’t load the letters." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : visible.length === 0 ? (
            <DocEmptyState
              icon={HiMail}
              title={tab ? "Nothing in this group" : "No letters available"}
              message={tab
                ? "Switch to All letters to see the rest."
                : "Your server hasn’t been given any standard letters yet. This list fills itself in — there is nothing for you to add."}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[820px]">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Letter</th>
                      <th className="px-5 py-3.5">State</th>
                      <th className="px-5 py-3.5">Your wording</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visible.map((row) => {
                      const openable = canConfigureLetter(row);
                      const meta = letterStateMeta(row);
                      const cannotIssue = letterCannotIssue(row);
                      // A withdrawn letter opens nothing and can't be drawn, so
                      // it gets a plain hover rather than the row-open props —
                      // which would promise a dialog that answers 404.
                      const open = openable ? rowPreviewProps(() => setConfiguring(row), `Set up ${letterTitle(row)}`) : {};
                      return (
                        <tr
                          key={row.code}
                          {...open}
                          className={openable
                            ? "cursor-pointer outline-none transition-colors hover:bg-purple-50/30 focus:bg-purple-50/40"
                            : "bg-slate-50/40"}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiMail className="w-4 h-4" /></span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate max-w-[340px]">{letterTitle(row)}</p>
                                <p className="text-[11px] text-slate-500 truncate max-w-[420px]">
                                  {letterPurpose(row.code) || letterAudience(row.code) || "A standard company letter."}
                                </p>
                                {!openable && <p className="text-[11px] font-semibold text-slate-500 mt-0.5 max-w-[420px]">{meta.hint}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StateBadge row={row} />
                              {cannotIssue && (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES.rose}`}
                                  title={LETTER_ISSUANCE_BLOCKED_NOTE}
                                >
                                  <HiExclamation className="w-3 h-3" aria-hidden="true" />
                                  Can’t be issued yet
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            {row.has_saved_fields ? (
                              <span className="font-semibold text-slate-700">Saved</span>
                            ) : openable ? (
                              <span className="text-slate-400">Standard wording</span>
                            ) : (
                              <span className="text-slate-400">N/A</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                              {/* A letter that will 409 at issue (its type isn't
                                  active) offers Fix, not Issue — a button that
                                  fails isn't an action (§3). Fix re-saves, which
                                  re-activates the type (§1.5). */}
                              {cannotIssue ? (
                                <button
                                  type="button" onClick={() => enableLetter(row, { heal: true })} disabled={!!enabling}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1.5 rounded-lg disabled:opacity-50"
                                >
                                  <HiBadgeCheck className="w-3.5 h-3.5" /> {enabling === row.code ? "Fixing…" : "Fix"}
                                </button>
                              ) : row.is_enabled && !row.is_orphaned && !rendererOff && (
                                <Link
                                  to={`${LETTERS_PATH}?issue=${encodeURIComponent(row.code)}`}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1.5 rounded-lg"
                                >
                                  <HiPaperAirplane className="w-3.5 h-3.5" /> Issue
                                </Link>
                              )}
                              {openable && !row.is_enabled && (
                                <button
                                  type="button" onClick={() => enableLetter(row)} disabled={!!enabling}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1.5 rounded-lg disabled:opacity-50"
                                >
                                  <HiBadgeCheck className="w-3.5 h-3.5" /> {enabling === row.code ? "Switching on…" : "Switch on"}
                                </button>
                              )}
                              {openable && !rendererOff && (
                                <button
                                  type="button" onClick={() => setPreviewing(row)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1.5 rounded-lg"
                                >
                                  <HiEye className="w-3.5 h-3.5" /> Preview
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">
          What appears at the top and bottom of every one of these pages is set in{" "}
          <Link to={BRANDING_PATH} className="font-bold text-purple-600 hover:underline">Letterhead &amp; Branding</Link>.
          Once a letter is switched on, you issue it from{" "}
          <Link to={LETTERS_PATH} className="font-bold text-purple-600 hover:underline">Issued Letters</Link>.
        </p>
      </main>

      {configuring && (
        <LetterTemplateConfigDialog
          row={configuring}
          api={documentsAPI}
          onSaved={(config, note, typeResult, opts) => applySaved(configuring.code, config, note, typeResult, opts)}
          onClose={() => setConfiguring(null)}
        />
      )}

      {previewing && (
        <LetterPreviewDialog
          title={letterTitle(previewing)}
          subtitle={letterAudience(previewing.code) || "Sample letter on your letterhead"}
          render={() => documentsAPI.previewLetterTemplate(previewing.code, {
            // Saved wording can only be merged for a letter that is switched on
            // — #138 refuses it otherwise — so a switched-off letter is drawn
            // from sample wording and the note below says so.
            use_saved_fields: previewUsesSavedFields(previewing),
          })}
          note={previewUsesSavedFields(previewing)
            ? ""
            : "This letter is switched off, so it was drawn with sample wording rather than yours."}
          onError={onPreviewError}
          onClose={() => setPreviewing(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
