// ─────────────────────────────────────────────────────────────────────────────
// FormsLibraryPage.jsx — "Blank Forms": the blank company forms anybody
// can download and fill in (#111, #112). Mounted in every workspace, because
// everybody needs the claim sheet sooner or later.
//
// This is the only list in the Documents module that is identical for every
// person in the organisation. A form holds nobody's information — it is a blank
// sheet — so there is nothing here to scope to a team or to hide from a
// colleague, and the screen says so rather than leaving people to wonder.
//
// The catalogue only ever contains the live version of each form. Replaced and
// retired versions are not filtered out of this view; the server never sends
// them. That is the whole point: the form somebody downloads today cannot be
// last year's.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiCloudDownload, HiDocumentText, HiExternalLink, HiFolderOpen, HiInformationCircle,
  HiLink, HiRefresh, HiSearch, HiTemplate, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { Pagination, Toast, useToast } from "../attendance/ui";
import { useMyDocumentPaths } from "../attendance/paths";
import { documentErrorMessage } from "../utils/documentErrors";
import useDocumentTypes from "../documents/useDocumentTypes";
import { TEMPLATE_PLANES } from "../documents/templatePlanes";
import { triggerDownload } from "../documents/documentUpload";
import { contentTypeLabel, formatBytes } from "../documents/documentMeta";
import {
  isReferenceTemplate, templateDownloadOf, templateListOf,
} from "../documents/templateMeta";
import { DocEmptyState, DocErrorState, SECONDARY_BTN, SELECT } from "../documents/ui";

const PAGE = 24;
const plane = TEMPLATE_PLANES.self;

/** One form. The whole card is the download button — there is nothing else to do with it. */
function FormCard({ row, typeName, busy, onDownload }) {
  const reference = isReferenceTemplate(row);
  return (
    <button
      type="button"
      onClick={() => onDownload(row)}
      disabled={busy}
      className="group text-left bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col hover:border-purple-200 hover:shadow-md transition disabled:opacity-60"
    >
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-100 transition">
          {reference ? <HiLink className="w-5 h-5" /> : <HiDocumentText className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 leading-snug line-clamp-2">{row.title}</p>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {[typeName, reference ? "Opens a page elsewhere" : contentTypeLabel(row.content_type), reference ? "" : formatBytes(row.size_bytes)].filter((part) => part && part !== "N/A").join(" · ")}
          </p>
        </div>
      </div>

      {row.description && <p className="text-xs text-slate-500 mt-3 leading-relaxed line-clamp-3">{row.description}</p>}

      <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 group-hover:text-purple-800">
        {busy
          ? <><span className="inline-block w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> Getting it…</>
          : reference
            ? <><HiExternalLink className="w-3.5 h-3.5" /> Open the form</>
            : <><HiCloudDownload className="w-3.5 h-3.5" /> Download the form</>}
      </span>
    </button>
  );
}

export default function FormsLibraryPage() {
  const myPaths = useMyDocumentPaths();
  const { types, index } = useDocumentTypes("self");
  const { toast, showToast, clearToast } = useToast();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [typeId, setTypeId] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.list({
        q: query || undefined,
        type_id: typeId || undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      if (token !== reqRef.current) return;
      setState({ ...templateListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [query, typeId, page]);

  useEffect(() => { load(); }, [load]);

  /**
   * The link is signed fresh on every click and only lives a few minutes, so
   * nothing is cached here — and the download is followed in place rather than
   * opened in a tab, which Safari treats as a pop-up after an await.
   */
  const download = async (row) => {
    if (busy) return;
    setBusy(row.id);
    try {
      const { url } = templateDownloadOf(await plane.downloadUrl(row.id));
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn't get that form. Refresh and try again."), "error");
      // A 404 usually means a newer version was published while the page sat
      // open, so the list is re-read rather than left showing a dead card.
      if (err?.status === 404) load();
    } finally {
      setBusy("");
    }
  };

  // Only the types that actually have a form in the catalogue are offered, so
  // the filter can never produce an empty list on its own.
  const typeOptions = useMemo(() => {
    const present = new Set(state.rows.map((row) => row.document_type_id).filter(Boolean));
    return types.filter((t) => present.has(t.id));
  }, [types, state.rows]);

  const filtered = !!(query || typeId);
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));

  return (
    <>
      <DashboardTopBar title="Blank Forms" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Blank Forms</h1>
            <p className="text-sm text-slate-500 mt-1">
              Blank company forms to download, fill in and send back — claim sheets, declarations, nomination forms. These are always the current version, so you never have to check whether you’ve got the latest one.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <Link to={myPaths.documents} className={SECONDARY_BTN}>
              <HiFolderOpen className="w-4 h-4" /> My Documents
            </Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a form — try “claim” or “nomination”…" aria-label="Search forms"
              className="w-full h-10 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition"
            />
          </div>
          {typeOptions.length > 0 && (
            <select aria-label="Kind of form" value={typeId} onChange={(e) => { setTypeId(e.target.value); setPage(1); }} className={SELECT}>
              <option value="">Every kind</option>
              {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {filtered && (
            <button type="button" onClick={() => { setSearch(""); setQuery(""); setTypeId(""); setPage(1); }} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
              <HiX className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {state.error ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the forms." />
          </div>
        ) : state.loading && state.rows.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : state.rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
            <DocEmptyState
              icon={HiTemplate}
              title={filtered ? "Nothing matches" : "No forms yet"}
              message={filtered
                ? "Try a different word, or clear the filters to see everything."
                : "Your HR team hasn’t published any blank forms yet. When they do, they’ll all be here."}
            />
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${state.loading ? "opacity-60" : ""}`}>
              {state.rows.map((row) => (
                <FormCard
                  key={row.id}
                  row={row}
                  typeName={index.get(row.document_type_id)?.name || ""}
                  busy={busy === row.id}
                  onDownload={download}
                />
              ))}
            </div>
            {state.total > PAGE && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4">
                <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="form" />
              </div>
            )}
          </>
        )}

        <p className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-purple-400" />
          <span>
            These are blank forms — none of them contains anybody’s personal details, and everyone in the organisation sees exactly this list. Once you’ve filled one in, add it to{" "}
            <Link to={myPaths.documents} className="font-bold text-purple-600 hover:underline">My Documents</Link> or send it however your HR team asks.
          </span>
        </p>
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
