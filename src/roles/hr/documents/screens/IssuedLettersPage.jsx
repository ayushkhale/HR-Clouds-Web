// ─────────────────────────────────────────────────────────────────────────────
// IssuedLettersPage.jsx — The register of every letter this organisation has
// issued. PDF Generation Phase 2 (#140 list, #141 detail, #139 issue,
// #142 reissue), with the catalog (#135) for the letter filter.
//
// This is the permanent record of what the company has signed, so it reads as a
// register: one scannable row per letter, newest first, with the reference number
// in the first column because that is what anybody arriving here already has in
// their hand. The row opens the record inspector; everything else happens there
// or in the issue form.
//
// Five things this screen has to get right:
//
//  · PAGINATION IS `page` + `limit`, not the limit/offset every other document
//    list uses. Sending an offset here would silently re-serve page one, so the
//    shape is read through `lettersPayload()` and nothing else.
//
//  · A LETTER FILTER FOR A LETTER THIS ORG NEVER ACTIVATED IS AN EMPTY LIST, not
//    an error — the server short-circuits. So an empty register under a filter
//    says "none of these have been issued", never "something went wrong".
//
//  · NOTHING TELLS US IN ADVANCE WHETHER THE SERVER CAN DRAW PDFs. #139/#142
//    answer 503 when the renderer isn't wired up, and the register itself is
//    unaffected. So issuing is offered until the server says otherwise, and from
//    then on the screen stops offering it and says why — the register, the detail
//    and the downloads all keep working.
//
//  · THE REPLACED VERSIONS ARE PART OF THE RECORD. They are listed, not hidden,
//    with their own numbers — a register that quietly dropped what was superseded
//    would be useless as evidence. The default view shows everything and the tabs
//    narrow it.
//
//  · WHO A LETTER WENT TO IS A NAME, NEVER AN ID. #140 doesn't nest the person,
//    only `included_users`, so the name comes from the org roster and an unloaded
//    one reads "Loading…".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HiBadgeCheck, HiCollection, HiDocumentText, HiExclamation, HiExternalLink, HiInformationCircle,
  HiLockClosed, HiMail, HiRefresh, HiSearch, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { FilterTabs, Pagination, Toast, useToast } from "../../../../shared/attendance/ui";
import { fmtDate } from "../../../../shared/attendance/dates";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import { OrgStatusBadge } from "../../../../shared/documents/orgUi";
import { orgDisplayStatus } from "../../../../shared/documents/orgDocumentMeta";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import IssueLetterDialog from "../../../../shared/documents/IssueLetterDialog";
import LetterDetailDialog from "../../../../shared/documents/LetterDetailDialog";
import ReissueLetterDialog from "../../../../shared/documents/ReissueLetterDialog";
import { letterTemplatesOf, letterTitle, letterheadGaps, brandingOf } from "../../../../shared/documents/letterMeta";
import {
  LETTER_SORTS, LETTER_STATUS_FILTERS, letterRowParts, referenceSegments, lettersPayload, sortParams,
} from "../../../../shared/documents/letterIssueMeta";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 20;
const BRANDING_PATH = "/dashboard/hr/documents/letterhead";
const TEMPLATES_PATH = "/dashboard/hr/documents/letter-templates";

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

export default function IssuedLettersPage() {
  const [params, setParams] = useSearchParams();
  const { toast, showToast, clearToast } = useToast();
  // `index` is the id → type map; a row carries only `document_type_id`.
  const { index: typeIndexMap } = useDocumentTypes("hrOrg");
  const { rows: people, status: peopleStatus, nameOf } = useEmployeeDirectory();

  const [state, setState] = useState({ rows: [], total: 0, totalPages: 1, loading: true, error: null });
  const [tallies, setTallies] = useState({ live: null, replaced: null });
  const [catalog, setCatalog] = useState([]);
  const [letterhead, setLetterhead] = useState(null);
  const [rendererOff, setRendererOff] = useState(false);

  const [status, setStatus] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [subject, setSubject] = useState("");
  const [sort, setSort] = useState("published_at");
  const [reference, setReference] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [issueCode, setIssueCode] = useState("");
  const [reissuing, setReissuing] = useState(null);

  /**
   * Two deep links, read once and then cleared from the address bar so a refresh
   * doesn't reopen a dialog somebody has closed:
   *
   *   ?ref=ACME/BON/…   find that letter — how somebody arrives from an email
   *                      asking about a number
   *   ?issue=<code>     open the issue form on that letter — the shortcut from
   *                      Letter Templates, once a letter is switched on
   *
   * Both are handled in ONE effect. Two effects each calling setParams({}) would
   * race, and the second would wipe the first's parameter before it was read.
   */
  const initialRef = params.get("ref") || "";
  const initialIssue = params.get("issue") || "";
  useEffect(() => {
    if (!initialRef && !initialIssue) return;
    if (initialRef) {
      setReference(initialRef);
      setReferenceFilter(initialRef);
    }
    if (initialIssue) {
      setIssueCode(initialIssue);
      setIssuing(true);
    }
    setParams({}, { replace: true });
  }, [initialRef, initialIssue, setParams]);

  // #140 matches `reference_number` exactly, so there is nothing useful to send
  // while somebody is still typing one. Debounced, then sent whole.
  useEffect(() => {
    const id = setTimeout(() => { setReferenceFilter(reference.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [reference]);

  const query = useMemo(() => ({
    status: status || undefined,
    template_code: templateCode || undefined,
    subject_user_id: subject || undefined,
    reference_number: referenceFilter || undefined,
    page,
    limit: PAGE,
    ...sortParams(sort),
  }), [status, templateCode, subject, referenceFilter, page, sort]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = lettersPayload(await documentsAPI.getLetters(query));
      if (token !== reqRef.current) return;
      setState({ rows: data.rows, total: data.total, totalPages: data.totalPages, loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, totalPages: 1, loading: false, error });
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  // A page that no longer exists — rows withdrawn, or a narrower filter — answers
  // an empty list rather than an error, which would read as "no letters at all".
  // Stepping back to the last real page is the honest recovery. Guarded on
  // `total > 0` so a genuinely empty register doesn't loop.
  useEffect(() => {
    if (state.loading || state.error) return;
    if (state.total > 0 && page > state.totalPages) setPage(state.totalPages);
  }, [state.loading, state.error, state.total, state.totalPages, page]);

  /** The two numbers on the tiles, each a one-row read for its total. */
  const loadTallies = useCallback(async () => {
    const [live, replaced] = await Promise.allSettled([
      documentsAPI.getLetters({ status: "published", page: 1, limit: 1 }),
      documentsAPI.getLetters({ status: "superseded", page: 1, limit: 1 }),
    ]);
    const total = (r) => (r.status === "fulfilled" ? lettersPayload(r.value).total : null);
    setTallies({ live: total(live), replaced: total(replaced) });
  }, []);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  // The catalog names the letters, for the filter and the "nothing switched on"
  // notice. Context, so a failure leaves the filter out rather than the page.
  const catalogRef = useRef(0);
  const loadCatalog = useCallback(async () => {
    const token = ++catalogRef.current;
    try {
      const rows = letterTemplatesOf(await documentsAPI.getLetterTemplates());
      if (token === catalogRef.current) setCatalog(rows);
    } catch {
      if (token === catalogRef.current) setCatalog([]);
    }
  }, []);

  // The letterhead is the frame around every one of these letters, so what is
  // missing from it belongs on this screen too.
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

  useEffect(() => { loadCatalog(); loadLetterhead(); }, [loadCatalog, loadLetterhead]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);

  const issuable = useMemo(() => catalog.filter((row) => row.is_enabled && !row.is_orphaned), [catalog]);
  const gaps = useMemo(
    () => (letterhead ? letterheadGaps(letterhead.branding, letterhead.inherited) : []),
    [letterhead],
  );

  const tabs = LETTER_STATUS_FILTERS.map((option) => ({
    ...option,
    label: option.value === "published" && tallies.live !== null
      ? `${option.label} (${tallies.live})`
      : option.value === "superseded" && tallies.replaced !== null
        ? `${option.label} (${tallies.replaced})`
        : option.label,
  }));

  const filtered = !!(status || templateCode || subject || referenceFilter);
  const clearFilters = () => {
    setStatus("");
    setTemplateCode("");
    setSubject("");
    setReference("");
    setReferenceFilter("");
    setPage(1);
  };

  /** A letter that now exists: the register, the tiles and the tabs all move. */
  const onIssued = useCallback((letter, { reused }) => {
    refresh();
    showToast(reused
      ? "That letter had already been issued — nothing new was created."
      : `Letter issued${letter?.reference_number ? ` · ${letter.reference_number}` : ""}`);
  }, [refresh, showToast]);

  const onReissued = useCallback((letter, { reused }) => {
    setReissuing(null);
    setDetail(null);
    refresh();
    showToast(reused
      ? "That replacement already existed — nothing new was created."
      : `Replaced${letter?.reference_number ? ` · the new letter is ${letter.reference_number}` : ""}`);
  }, [refresh, showToast]);

  return (
    <>
      <DashboardTopBar title="Issued Letters" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Issued Letters</h1>
            <p className="text-sm text-slate-500 mt-1">
              Every letter your organisation has issued, with the number it was issued under. Nothing here is ever removed or renumbered.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button" onClick={refresh} disabled={state.loading}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50"
              aria-label="Refresh" title="Refresh"
            >
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <Link to={TEMPLATES_PATH} className={SECONDARY_BTN}>
              <HiBadgeCheck className="w-4 h-4" /> Letter Templates
            </Link>
            {!rendererOff && issuable.length > 0 && (
              <button type="button" onClick={() => { setIssueCode(""); setIssuing(true); }} className={PRIMARY_BTN}>
                <HiMail className="w-4 h-4" /> Issue a letter
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Tile
            label="Live"
            value={tallies.live === null ? "…" : tallies.live}
            sub="Letters that currently count"
            icon={HiBadgeCheck}
            tone="text-violet-500"
          />
          <Tile
            label="Older versions"
            value={tallies.replaced === null ? "…" : tallies.replaced}
            sub={tallies.replaced ? "Kept on file for good" : "None replaced yet"}
            icon={HiCollection}
            tone="text-fuchsia-500"
          />
        </div>

        {issuable.length === 0 && catalog.length > 0 && (
          <Link
            to={TEMPLATES_PATH}
            className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 hover:bg-fuchsia-100/60 transition"
          >
            <HiExclamation className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
            <span className="text-sm text-fuchsia-900 flex-1 leading-relaxed">
              <span className="font-bold">No letter is switched on yet.</span>{" "}
              Switch on the letters your organisation issues and you can start issuing them here.
            </span>
            <span className="text-xs font-bold text-fuchsia-700 shrink-0 mt-0.5 whitespace-nowrap">Set them up <HiExternalLink className="inline w-3 h-3" /></span>
          </Link>
        )}

        {gaps.length > 0 && (
          <Link
            to={BRANDING_PATH}
            className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 hover:bg-fuchsia-100/60 transition"
          >
            <HiExclamation className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
            <span className="text-sm text-fuchsia-900 flex-1 leading-relaxed">
              <span className="font-bold">Your letterhead is still missing {gaps.join(", ")}.</span>{" "}
              Every letter you issue prints without {gaps.length === 1 ? "it" : "them"} until you fill {gaps.length === 1 ? "it" : "them"} in — and an issued letter can’t be changed afterwards.
            </span>
            <span className="text-xs font-bold text-fuchsia-700 shrink-0 mt-0.5 whitespace-nowrap">Finish it <HiExternalLink className="inline w-3 h-3" /></span>
          </Link>
        )}

        {rendererOff && (
          <p className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 leading-relaxed" role="status">
            <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              <span className="font-bold">Letters can’t be drawn on this server yet, so none can be issued.</span>{" "}
              Everything already issued is unaffected and can still be read and downloaded — ask your administrator to turn on letter rendering.
            </span>
          </p>
        )}

        {/* Tabs left, the rest of the filters right — the house arrangement. */}
        {/* Side by side only when there is room for tabs and all four filters on
            one line (a 15" screen at 1536px); on a 14" laptop the filters sit
            on their own line under the tabs instead of splitting in two. */}
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
          {/* The tabs never shrink — squeezed, "Withdrawn" wrapped onto a second
              line on a 14" screen. The filters wrap instead. */}
          <FilterTabs className="shrink-0 self-start" options={tabs} value={status} onChange={(next) => { setStatus(next); setPage(1); }} />
          <div className="flex flex-wrap items-center 2xl:justify-end gap-2 min-w-0">
            <div className="relative">
              <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="Reference number"
                aria-label="Find a letter by its reference number"
                className="h-10 w-48 pl-9 pr-8 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              />
              {reference && (
                <button type="button" onClick={() => setReference("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" aria-label="Clear the reference number">
                  <HiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={templateCode}
              onChange={(e) => { setTemplateCode(e.target.value); setPage(1); }}
              className={SELECT}
              aria-label="Kind of letter"
            >
              <option value="">Every kind of letter</option>
              {catalog.map((row) => <option key={row.code} value={row.code}>{letterTitle(row)}</option>)}
            </select>
            <PersonSelect
              people={people}
              value={subject}
              onChange={(id) => { setSubject(id); setPage(1); }}
              clearLabel="Everyone"
              loading={peopleStatus === "loading"}
              className="w-52"
              aria-label="Letters issued to one person"
            />
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className={SELECT}
              aria-label="Order"
            >
              {LETTER_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {filtered && (
              <button type="button" onClick={clearFilters} className="h-10 px-3 text-xs font-bold text-purple-600 hover:bg-purple-50 rounded-xl">
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn’t load the register of issued letters." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={HiMail}
              title={filtered ? "No letter matches this" : "No letter has been issued yet"}
              message={filtered
                ? "Nothing in your register matches these filters. Clear them to see every letter."
                : "When you issue a letter it appears here for good, with the number it was issued under."}
              action={filtered
                ? <button type="button" onClick={clearFilters} className={SECONDARY_BTN}>Clear filters</button>
                : !rendererOff && issuable.length > 0
                  ? <button type="button" onClick={() => { setIssueCode(""); setIssuing(true); }} className={PRIMARY_BTN}><HiMail className="w-4 h-4" /> Issue a letter</button>
                  : null}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[880px]">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Reference number</th>
                      <th className="px-5 py-3.5">Letter</th>
                      <th className="px-5 py-3.5">Issued to</th>
                      <th className="px-5 py-3.5">Issued</th>
                      <th className="px-5 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {state.rows.map((row) => {
                      const { letter, person } = letterRowParts(row, nameOf);
                      const typeName = typeIndexMap.get(row.document_type_id)?.name || "";
                      return (
                        <tr
                          key={row.id}
                          {...rowPreviewProps(() => setDetail(row), `Open ${row.title || "this letter"}`)}
                          className="hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40"
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800 tabular-nums max-w-[240px]">
                              {row.reference_number
                                ? referenceSegments(row.reference_number).map((part, i) => <span key={i}><span className="whitespace-nowrap">{part}</span><wbr /></span>)
                                : "N/A"}
                            </p>
                            {row.version > 1 && <p className="text-[10px] text-slate-400">Version {row.version}</p>}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiDocumentText className="w-4 h-4" /></span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate max-w-[280px] flex items-center gap-1.5">
                                  <span className="truncate">{letter}</span>
                                  {row.is_confidential && <HiLockClosed className="w-3.5 h-3.5 text-purple-500 shrink-0" title="Only HR and the person it is about" />}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                                  {[typeName, row.requires_acknowledgement ? "Needs acknowledgement" : null].filter(Boolean).join(" · ") || "Company letter"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">
                              {person || (row.recipient_count > 1 ? `${row.recipient_count} people` : "1 person")}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-xs font-semibold text-slate-700">{row.published_at ? fmtDate(row.published_at) : "N/A"}</p>
                            {row.superseded_at && <p className="text-[10px] text-slate-400">Replaced {fmtDate(row.superseded_at)}</p>}
                          </td>
                          <td className="px-5 py-3.5"><OrgStatusBadge status={orgDisplayStatus(row)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.total > 0 && (
                <div className="px-5 py-4 border-t border-slate-100">
                  <Pagination
                    page={page}
                    totalPages={state.totalPages}
                    total={state.total}
                    limit={PAGE}
                    onPageChange={setPage}
                    disabled={state.loading}
                    noun="letter"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">
          What appears at the top and bottom of every letter is set in{" "}
          <Link to={BRANDING_PATH} className="font-bold text-purple-600 hover:underline">Letterhead &amp; Branding</Link>,
          and how letters are numbered in{" "}
          <Link to="/dashboard/hr/documents/settings" className="font-bold text-purple-600 hover:underline">Document Settings</Link>.
        </p>
      </main>

      {detail && (
        <LetterDetailDialog
          letter={detail}
          api={documentsAPI}
          nameOf={nameOf}
          types={typeIndexMap}
          showToast={showToast}
          onChanged={refresh}
          onReissue={(row) => { setDetail(null); setReissuing(row); }}
          onClose={() => setDetail(null)}
        />
      )}

      {issuing && (
        <IssueLetterDialog
          api={documentsAPI}
          people={people}
          peopleStatus={peopleStatus}
          templateCode={issueCode}
          onIssued={onIssued}
          onRendererOff={() => setRendererOff(true)}
          onClose={() => { setIssuing(false); setIssueCode(""); }}
        />
      )}

      {reissuing && (
        <ReissueLetterDialog
          api={documentsAPI}
          letterId={reissuing.id}
          letter={reissuing}
          subjectName={Array.isArray(reissuing.included_users) && reissuing.included_users.length === 1
            ? nameOf(reissuing.included_users[0], "")
            : ""}
          onReissued={onReissued}
          onRendererOff={() => setRendererOff(true)}
          onClose={() => setReissuing(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
