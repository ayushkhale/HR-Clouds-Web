// ─────────────────────────────────────────────────────────────────────────────
// TemplateLibraryPage.jsx — The blank company forms HR publishes for everyone
// to download: claim sheets, declarations, nomination forms (#99–#110).
//
// This screen answers a problem that predates the software. Somebody asks for
// "the medical claim form", gets sent a copy from an old email, fills in last
// year's format, and the claim comes back rejected. The library exists so that
// there is exactly one live version of every form, and publishing a new one
// takes the old one out of circulation in the same breath.
//
// Two decisions shape the layout:
//   · Live forms are what this screen is for, so they lead. Drafts sit
//     underneath with what's left to do on them spelled out, because an
//     unpublished draft is invisible to everybody else and it is very easy to
//     forget that it never went live.
//   · Retired and replaced versions are filtered out by default rather than
//     removed. They are kept for audit, and "where did the 2025 sheet go?" has
//     to have an answer.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiCheckCircle, HiCloudDownload, HiDocumentAdd, HiDownload, HiExternalLink, HiEyeOff,
  HiInformationCircle, HiLink, HiPencilAlt, HiRefresh, HiSearch, HiTemplate, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { Pagination, Toast, useToast } from "../../../../shared/attendance/ui";
import { fmtDate } from "../../../../shared/attendance/dates";
import { documentErrorMessage, isTemplateStale } from "../../../../shared/utils/documentErrors";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { TEMPLATE_PLANES } from "../../../../shared/documents/templatePlanes";
import TemplateFormDialog from "../../../../shared/documents/TemplateFormDialog";
import TemplateDetailDialog from "../../../../shared/documents/TemplateDetailDialog";
import { TemplateStatusBadge } from "../../../../shared/documents/phase5Ui";
import { triggerDownload } from "../../../../shared/documents/documentUpload";
import {
  TEMPLATE_STATUS_FILTERS, canPublishTemplate, isReferenceTemplate, templateDownloadOf,
  templateListOf, templateNextStep, templateStorageLine,
} from "../../../../shared/documents/templateMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SELECT } from "../../../../shared/documents/ui";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const PAGE = 20;
const plane = TEMPLATE_PLANES.hr;

function Tile({ label, value, sub, icon: Icon, tone = "text-purple-500", onClick, active }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`text-left rounded-2xl border px-4 py-3.5 transition ${active ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100" : "bg-white border-slate-100 hover:border-purple-200 shadow-xs"}`}
    >
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} /><span className="text-[11px] font-semibold truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight leading-none mt-2 tabular-nums text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1 truncate">{sub}</p>}
    </button>
  );
}

export default function TemplateLibraryPage() {
  const { toast, showToast, clearToast } = useToast();
  const { types, index } = useDocumentTypes("hr");
  const { nameOf } = useEmployeeDirectory();

  const [filters, setFilters] = useState({ status: "published", type_id: "", q: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [tallies, setTallies] = useState({ published: null, draft: null });
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // { mode, template }
  const [busy, setBusy] = useState("");

  // The search box is debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.list({
        status: filters.status || undefined,
        type_id: filters.type_id || undefined,
        q: filters.q || undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      if (token !== reqRef.current) return;
      setState({ ...templateListOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  // Two `limit: 1` reads: the tile wants the count for a status, not for
  // whatever filter and page happen to be showing.
  const tallyRef = useRef(0);
  const loadTallies = useCallback(async () => {
    const token = ++tallyRef.current;
    const results = await Promise.allSettled(
      ["published", "draft"].map((status) => plane.list({ status, limit: 1 })),
    );
    if (token !== tallyRef.current) return;
    setTallies({
      published: results[0].status === "fulfilled" ? templateListOf(results[0].value).total : null,
      draft: results[1].status === "fulfilled" ? templateListOf(results[1].value).total : null,
    });
  }, []);

  useEffect(() => { loadTallies(); }, [loadTallies]);

  const refresh = useCallback(() => { load(); loadTallies(); }, [load, loadTallies]);
  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  const download = async (row) => {
    if (busy) return;
    setBusy(row.id);
    try {
      const { url } = templateDownloadOf(await plane.downloadUrl(row.id));
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn't open the file."), "error");
    } finally {
      setBusy("");
    }
  };

  const publish = async (row) => {
    if (busy) return;
    const ok = await window.confirm(
      `Publish “${row.title}”?\n\nEveryone in your organisation will be able to download it. If an earlier version of this form is live, it is replaced at the same moment.`,
    );
    if (!ok) return;
    setBusy(row.id);
    try {
      await plane.publish(row.id);
      showToast("Form published. Everyone can download it now.");
      refresh();
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn't publish the form."), "error");
      if (isTemplateStale(err)) refresh();
    } finally {
      setBusy("");
    }
  };

  const filtered = !!(filters.type_id || filters.q) || filters.status !== "published";
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const typeOptions = useMemo(() => types.filter((t) => t.is_active !== false), [types]);

  return (
    <>
      <DashboardTopBar title="Form Templates" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Form Templates</h1>
            <p className="text-sm text-slate-500 mt-1">
              The blank forms your people download and fill in — claim sheets, declarations, nomination forms. Publishing a new version takes the old one out of circulation the same second, so nobody ends up filling in last year’s sheet.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={refresh} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => setEditing({ mode: "create" })} className={PRIMARY_BTN}>
              <HiDocumentAdd className="w-4 h-4" /> New form
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            label="Live forms" value={tallies.published ?? "…"} sub="Everyone can download these"
            icon={HiCheckCircle} tone="text-violet-500"
            onClick={() => update({ status: filters.status === "published" ? "" : "published" })} active={filters.status === "published"}
          />
          <Tile
            label="Drafts" value={tallies.draft ?? "…"} sub={tallies.draft ? "Not visible to anyone yet" : "Nothing waiting"}
            icon={HiPencilAlt} tone="text-fuchsia-500"
            onClick={() => update({ status: filters.status === "draft" ? "" : "draft" })} active={filters.status === "draft"}
          />
          <div className="col-span-2 rounded-2xl border border-slate-100 bg-white shadow-xs px-4 py-3.5 flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiInformationCircle className="w-5 h-5" /></span>
            <p className="text-xs text-slate-500 leading-relaxed">
              Forms hold no personal information, so there is nothing to keep from anyone: every employee and manager sees the same list. That is also why nothing here is scoped to a team.{" "}
              <Link to="/dashboard/hr/documents/types" className="font-bold text-purple-600 hover:underline">Document types <HiExternalLink className="inline w-3 h-3" /></Link>
            </p>
          </div>
        </div>

        {tallies.draft > 0 && filters.status !== "draft" && (
          <button
            type="button"
            onClick={() => update({ status: "draft" })}
            className="w-full flex items-center gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-left hover:bg-fuchsia-100/60 transition"
          >
            <HiPencilAlt className="w-5 h-5 text-fuchsia-500 shrink-0" />
            <span className="text-sm font-semibold text-fuchsia-900 flex-1">
              {tallies.draft} {tallies.draft === 1 ? "form is" : "forms are"} still a draft, so nobody outside HR can see {tallies.draft === 1 ? "it" : "them"}.
            </span>
            <span className="text-xs font-bold text-fuchsia-700">Show {tallies.draft === 1 ? "it" : "them"}</span>
          </button>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…" aria-label="Search forms by name"
              className="w-full h-10 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition"
            />
          </div>
          <select aria-label="State" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={SELECT}>
            {TEMPLATE_STATUS_FILTERS.map((f) => <option key={f.value || "all"} value={f.value}>{f.label}</option>)}
          </select>
          <select aria-label="Filed under" value={filters.type_id} onChange={(e) => update({ type_id: e.target.value })} className={SELECT}>
            <option value="">Any type</option>
            {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {filtered && (
            <button type="button" onClick={() => { setSearch(""); update({ status: "published", type_id: "", q: "" }); }} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
              <HiX className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {state.error ? (
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the forms." />
          ) : state.loading && state.rows.length === 0 ? (
            <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : state.rows.length === 0 ? (
            <DocEmptyState
              icon={HiTemplate}
              title={filtered ? "Nothing matches" : "No forms published yet"}
              message={filtered
                ? "Try another state, type or search."
                : "Publish the forms people keep emailing HR for — the medical claim sheet, the PF nomination form, the conveyance claim. Each one becomes a single click for everybody in the organisation."}
              action={!filtered ? <button type="button" onClick={() => setEditing({ mode: "create" })} className={PRIMARY_BTN}><HiDocumentAdd className="w-4 h-4" /> Add the first form</button> : null}
            />
          ) : (
            <div className={state.loading ? "opacity-60" : ""}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[860px]">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Form</th>
                      <th className="px-5 py-3.5">State</th>
                      <th className="px-5 py-3.5">Version</th>
                      <th className="px-5 py-3.5">Added</th>
                      <th className="px-5 py-3.5 text-right">Downloads</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {state.rows.map((row) => {
                      const type = index.get(row.document_type_id);
                      const hidden = row.is_employee_visible === false;
                      const nextStep = templateNextStep(row);
                      return (
                        <tr
                          key={row.id}
                          {...rowPreviewProps(() => setDetail(row), `Open ${row.title}`)}
                          className="cursor-pointer outline-none transition-colors hover:bg-purple-50/30 focus:bg-purple-50/40"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                {isReferenceTemplate(row) ? <HiLink className="w-4 h-4" /> : <HiTemplate className="w-4 h-4" />}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate max-w-[320px]">{row.title}</p>
                                <p className="text-[11px] text-slate-400 truncate max-w-[320px]">
                                  {[type?.name, templateStorageLine(row), hidden ? "Hidden from employees" : ""].filter(Boolean).join(" · ")}
                                </p>
                                {nextStep && <p className="text-[11px] font-semibold text-fuchsia-700 truncate max-w-[320px] mt-0.5">{nextStep}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1.5">
                              <TemplateStatusBadge status={row.status} />
                              {hidden && row.status === "published" && <HiEyeOff className="w-3.5 h-3.5 text-slate-400" title="Published but hidden from employees" />}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-bold text-slate-600 tabular-nums">v{row.version}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                          <td className="px-5 py-3.5 text-right text-xs font-bold text-slate-600 tabular-nums">{Number(row.download_count) || 0}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                              {canPublishTemplate(row) && (
                                <button
                                  type="button" onClick={() => publish(row)} disabled={busy === row.id}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1.5 rounded-lg disabled:opacity-50"
                                >
                                  <HiCheckCircle className="w-3.5 h-3.5" /> Publish
                                </button>
                              )}
                              {(row.has_file || row.confirmed_at || row.reference_url) && (
                                <button
                                  type="button" onClick={() => download(row)} disabled={busy === row.id}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-purple-700 hover:bg-purple-50 px-2 py-1.5 rounded-lg disabled:opacity-50"
                                  aria-label={`Download ${row.title}`}
                                >
                                  {busy === row.id
                                    ? <span className="inline-block w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                                    : isReferenceTemplate(row) ? <HiExternalLink className="w-3.5 h-3.5" /> : <HiCloudDownload className="w-3.5 h-3.5" />}
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
              {state.total > PAGE && (
                <div className="px-5 py-4 border-t border-slate-100">
                  <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="form" />
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          A published form can’t be deleted, only replaced or retired — so there is always a record of what people were told to fill in and when. Drafts can be deleted freely. Each form keeps its own download count, which is a fair guide to whether anybody has actually found it.{" "}
          <Link to="/dashboard/hr/documents/exports" className="font-bold text-purple-600 hover:underline">Export log <HiDownload className="inline w-3 h-3" /></Link>
        </p>
      </main>

      {detail && (
        <TemplateDetailDialog
          template={detail}
          plane={plane}
          types={index}
          nameOf={nameOf}
          showToast={showToast}
          onChanged={refresh}
          onEdit={(row) => { setDetail(null); setEditing({ mode: "edit", template: row }); }}
          onReplace={(row) => { setDetail(null); setEditing({ mode: "replace", template: row }); }}
          onClose={() => setDetail(null)}
        />
      )}

      {editing && (
        <TemplateFormDialog
          mode={editing.mode}
          template={editing.template}
          types={typeOptions}
          plane={plane}
          onDone={(row, note) => {
            setEditing(null);
            showToast(note);
            refresh();
            if (row?.id) setDetail(row);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
