// ─────────────────────────────────────────────────────────────────────────────
// DocumentSearchPage.jsx — Find any employee document in the organisation
// without going person by person (#113), take the answer away as a spreadsheet
// (#114), and label what you found so you can pull the same set again (#121).
//
// The questions this exists for all have the same shape: "every expired medical
// licence in Operations", "everything tagged audit-2026", "what's still in
// review from last month". Before this, each of those meant opening profiles
// one at a time.
//
// Three things the screen has to be honest about, because the server is:
//
// · Results are deliberately thin. No ID numbers, not even masked, and no file
//   locations — a bulk read never discloses them. Open a document to see its
//   full record. The note under the filters says so, so nobody assumes the
//   column is missing by accident.
//
// · A CSV is recorded before it is sent. Every export writes an audit row
//   naming who took it and what filters they used, and if that record can't be
//   written the download is refused outright. Worth knowing before you press
//   it, not after.
//
// · Paging has a floor under it. The server measures `offset + limit` against
//   ten thousand and refuses past it, so the pager stops exactly where the
//   server does and says to narrow the filters instead.
//
// · It will not search on nothing. The server wants a word, a person, a kind of
//   document or a tag before it will run — status, department and dates only
//   narrow a search, they cannot be the whole of one. So this asks for one of
//   the four up front instead of opening on an error, which is what a plain
//   "load everything on mount" would have produced on every visit.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiAdjustments, HiCloudDownload, HiDocumentSearch, HiExclamationCircle, HiExternalLink,
  HiInformationCircle, HiRefresh, HiSearch, HiShieldCheck, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Pagination, PersonCell, Toast, useToast } from "../../../../shared/attendance/ui";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import MultiSelectDropdown from "../../../../shared/components/MultiSelectDropdown";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { fmtDate, todayYMD } from "../../../../shared/attendance/dates";
import { useTargetingOptions } from "../../../../shared/attendance/useTargetingOptions";
import { documentErrorMessage, exportTooLargeDetail, isExportLedgerDown } from "../../../../shared/utils/documentErrors";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import DocumentDetailDialog from "../../../../shared/documents/DocumentDetailDialog";
import { DOCUMENT_PLANES } from "../../../../shared/documents/documentPlanes";
import { DocStatusBadge, DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import { TagChips } from "../../../../shared/documents/phase5Ui";
import {
  SEARCH_PRIVACY_NOTE, SEARCH_Q_MIN, SEARCH_STATUS_OPTIONS, TAGS_MAX_PER_DOCUMENT,
  hasSearchAnchor, maxSearchPage, parseTags, searchResultOf, tagsOf,
} from "../../../../shared/documents/reportMeta";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 25;
const plane = DOCUMENT_PLANES.hr;

const BLANK = {
  q: "", type_id: "", user_id: "", department_id: "", status: [], tags: [],
  from_issued_on: "", to_issued_on: "", from_expires_on: "", to_expires_on: "",
};

/** Only the keys the server understands, and only the ones actually set. */
function toQuery(filters) {
  const query = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length) query[key] = value;
      return;
    }
    if (value) query[key] = value;
  });
  return query;
}

const countActive = (filters) =>
  Object.entries(filters).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : !!value)).length;

export default function DocumentSearchPage() {
  const { toast, showToast, clearToast } = useToast();
  const { types, index } = useDocumentTypes("hr");
  const { rows: people, status: peopleStatus, nameOf } = useEmployeeDirectory();
  const { departmentOptions, loading: orgLoading } = useTargetingOptions();

  const [filters, setFilters] = useState(BLANK);
  const [text, setText] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: false, error: null, ran: false });
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Typing shouldn't fire a request per keystroke, and the rest of the filters
  // apply the moment they change.
  useEffect(() => {
    const timer = setTimeout(() => {
      // A single character is refused outright (SEARCH_QUERY_TOO_SHORT), so it
      // is never committed — the box simply keeps waiting for the second one.
      const next = text.trim();
      const committed = next.length >= SEARCH_Q_MIN ? next : "";
      setFilters((f) => (f.q === committed ? f : { ...f, q: committed }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const query = useMemo(() => toQuery(filters), [filters]);
  const active = countActive(filters);
  // Whether the server will even run this. Status, department and dates are
  // refinements; one of q / person / type / tag has to anchor the search.
  const anchored = hasSearchAnchor(filters);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    if (!anchored) {
      setState({ rows: [], total: 0, loading: false, error: null, ran: false });
      return;
    }
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.searchDocuments({ ...query, limit: PAGE, offset: (page - 1) * PAGE });
      if (token !== reqRef.current) return;
      setState({ ...searchResultOf(res), loading: false, error: null, ran: true });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error, ran: true });
    }
  }, [query, page, anchored]);

  useEffect(() => { load(); }, [load]);

  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const reset = () => { setText(""); setTagDraft(""); setFilters(BLANK); setPage(1); };

  const addTags = () => {
    const next = parseTags(tagDraft);
    if (!next.length) return;
    update({ tags: [...new Set([...filters.tags, ...next])].slice(0, TAGS_MAX_PER_DOCUMENT) });
    setTagDraft("");
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { filename } = await documentsAPI.exportDocumentSearch(query);
      showToast(`Downloaded ${filename}. It's recorded in the export log.`);
    } catch (err) {
      const tooLarge = exportTooLargeDetail(err);
      showToast(
        tooLarge
          ? `${(tooLarge.rows || state.total).toLocaleString("en-IN")} documents match — that's more than one spreadsheet can carry${tooLarge.max ? ` (the limit is ${tooLarge.max.toLocaleString("en-IN")})` : ""}. Narrow it by department, type or date and try again.`
          : isExportLedgerDown(err)
            ? "Nothing was exported. Downloads are recorded for audit before they're sent, and that record couldn't be written — try again in a moment."
            : documentErrorMessage(err, "Couldn't export these results."),
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  const today = todayYMD();
  const typeOptions = useMemo(() => types.filter((t) => (t.plane || "employee") === "employee"), [types]);
  // The server refuses to page past a fixed depth, so the last page offered is
  // the last one it will actually serve.
  const serverMax = maxSearchPage(PAGE);
  const totalPages = Math.min(serverMax, Math.max(1, Math.ceil((state.total || 0) / PAGE)));
  const cappedPaging = Math.ceil((state.total || 0) / PAGE) > serverMax;

  return (
    <>
      <DashboardTopBar title="Find a Document" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Find a Document</h1>
            <p className="text-sm text-slate-500 mt-1">
              Search every employee document in the organisation at once — by name, kind, person, department, state, tag or date. For an audit, filter it down and take the spreadsheet.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={exportCsv} disabled={exporting || state.loading || !anchored || !state.total} className={PRIMARY_BTN}>
              {exporting ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <HiCloudDownload className="w-4 h-4" />}
              {exporting ? "Preparing…" : "Export to spreadsheet"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search" value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Search by document title — “passport”, “degree”, “offer letter”…" aria-label="Search by title"
                minLength={SEARCH_Q_MIN}
                className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition"
              />
            </div>
            <div className="lg:w-60">
              <PersonSelect
                people={people}
                value={filters.user_id}
                onChange={(id) => update({ user_id: id })}
                placeholder="Anyone"
                clearLabel="Anyone"
                loading={peopleStatus === "loading"}
                aria-label="Whose document"
              />
            </div>
            <select aria-label="Kind of document" value={filters.type_id} onChange={(e) => update({ type_id: e.target.value })} className={SELECT}>
              <option value="">Any kind</option>
              {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}
              className={`${SECONDARY_BTN} !h-10 !py-0 shrink-0`}
            >
              <HiAdjustments className="w-4 h-4" /> {advanced ? "Fewer filters" : "More filters"}
            </button>
          </div>

          {advanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-1">
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">State</span>
                <MultiSelectDropdown
                  options={SEARCH_STATUS_OPTIONS}
                  value={filters.status}
                  onChange={(next) => update({ status: next })}
                  placeholder="Any state"
                />
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Department</span>
                <select aria-label="Department" value={filters.department_id} onChange={(e) => update({ department_id: e.target.value })} className={`${SELECT} w-full`} disabled={orgLoading}>
                  <option value="">Every department</option>
                  {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="tag-filter" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tags</label>
                <div className="flex items-center gap-2">
                  <input
                    id="tag-filter" type="text" value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTags(); } }}
                    placeholder="e.g. audit 2026" autoComplete="off"
                    disabled={filters.tags.length >= TAGS_MAX_PER_DOCUMENT}
                    className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none"
                  />
                  <button type="button" onClick={addTags} disabled={!tagDraft.trim()} className={`${SECONDARY_BTN} !h-10 !py-0 shrink-0`}>Add</button>
                </div>
                {filters.tags.length > 0 && (
                  <div className="mt-2">
                    <TagChips tags={filters.tags} onRemove={(tag) => update({ tags: filters.tags.filter((t) => t !== tag) })} />
                    <p className="text-[10px] text-slate-400 mt-1.5">Shows anything carrying any one of these tags.</p>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Issued between</span>
                <div className="flex items-center gap-2">
                  <input type="date" aria-label="Issued from" max={filters.to_issued_on || today} value={filters.from_issued_on} onChange={(e) => update({ from_issued_on: e.target.value })} className={`${SELECT} flex-1`} />
                  <input type="date" aria-label="Issued to" min={filters.from_issued_on || undefined} max={today} value={filters.to_issued_on} onChange={(e) => update({ to_issued_on: e.target.value })} className={`${SELECT} flex-1`} />
                </div>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expires between</span>
                <div className="flex items-center gap-2">
                  <input type="date" aria-label="Expires from" max={filters.to_expires_on || undefined} value={filters.from_expires_on} onChange={(e) => update({ from_expires_on: e.target.value })} className={`${SELECT} flex-1`} />
                  <input type="date" aria-label="Expires to" min={filters.from_expires_on || undefined} value={filters.to_expires_on} onChange={(e) => update({ to_expires_on: e.target.value })} className={`${SELECT} flex-1`} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">For “what expires this quarter”, the expiring report is quicker.</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <p className="flex items-start gap-1.5 text-[11px] text-slate-400 leading-relaxed pt-3">
              <HiShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-purple-400" /> {SEARCH_PRIVACY_NOTE}
            </p>
            {active > 0 && (
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline pt-3">
                <HiX className="w-3.5 h-3.5" /> Clear {active} {active === 1 ? "filter" : "filters"}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {!anchored ? (
            <DocEmptyState
              icon={HiSearch}
              title="What are you looking for?"
              message={`Start with a word from the document's title (at least ${SEARCH_Q_MIN} letters), a person, a kind of document, or a tag. Once you have, you can narrow it further by state, department or date.`}
            />
          ) : state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't run that search." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={HiDocumentSearch}
              title={active ? "Nothing matches" : "No documents yet"}
              message={active
                ? "Nothing in the organisation matches all of those at once. Try loosening one — the state and the date ranges are the usual culprits."
                : "Once people start adding documents, this searches every one of them at once."}
              action={active ? <button type="button" onClick={reset} className={SECONDARY_BTN}><HiX className="w-4 h-4" /> Clear the filters</button> : null}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <p className="text-xs font-semibold text-slate-600">
                  {state.total.toLocaleString("en-IN")} {state.total === 1 ? "document" : "documents"} found{active ? " with these filters" : " in the organisation"}
                </p>
                <p className="text-[11px] text-slate-400">Click a row for the full record.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[900px]">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Document</th>
                      <th className="px-5 py-3.5">Whose</th>
                      <th className="px-5 py-3.5">State</th>
                      <th className="px-5 py-3.5">Tags</th>
                      <th className="px-5 py-3.5">Issued</th>
                      <th className="px-5 py-3.5">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {state.rows.map((row) => {
                      const tags = tagsOf(row);
                      return (
                        <tr
                          key={row.id}
                          {...rowPreviewProps(() => setDetail(row), `Open ${row.title}`)}
                          className="cursor-pointer outline-none transition-colors hover:bg-purple-50/30 focus:bg-purple-50/40"
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800 truncate max-w-[260px]">{row.title}</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-[260px]">{row.document_type?.name || index.get(row.document_type?.id)?.name || "Document"}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <PersonCell
                              entity={{ name: row.owner?.name || nameOf(row.owner?.user_id, "An employee"), employee_code: row.owner?.employee_code }}
                              secondary={row.owner?.employee_code || undefined}
                            />
                          </td>
                          <td className="px-5 py-3.5"><DocStatusBadge status={row.status} /></td>
                          <td className="px-5 py-3.5">
                            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                              <TagChips
                                tags={tags.slice(0, 3)}
                                onPick={(tag) => !filters.tags.includes(tag) && update({ tags: [...filters.tags, tag] })}
                                empty={<span className="text-[11px] text-slate-300">—</span>}
                              />
                              {tags.length > 3 && <span className="text-[11px] text-slate-400 ml-1">+{tags.length - 3}</span>}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{row.issued_on ? fmtDate(row.issued_on) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{row.expires_on ? fmtDate(row.expires_on) : <span className="text-slate-300">Never</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {state.total > PAGE && (
                <div className="px-5 py-4 border-t border-slate-100 space-y-2">
                  <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="document" />
                  {cappedPaging && (
                    <p className="flex items-start gap-1.5 text-[11px] font-semibold text-fuchsia-700">
                      <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      This is as far as the search will page. To reach the rest, narrow it down — or export the whole set to a spreadsheet.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-purple-400" />
          <span>
            Every spreadsheet taken from here is logged with your name, the time and the filters you used — that record is what makes a bulk download auditable, and it can’t be switched off.{" "}
            <Link to="/dashboard/hr/documents/exports" className="font-bold text-purple-600 hover:underline">See the export log <HiExternalLink className="inline w-3 h-3" /></Link>
          </span>
        </p>
      </main>

      {detail && (
        <DocumentDetailDialog
          doc={detail}
          plane={plane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={load}
          onClose={() => setDetail(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
