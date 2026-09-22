// ─────────────────────────────────────────────────────────────────────────────
// DocumentTypesPage.jsx — What documents this organisation accepts (#1–#9).
//
// A fresh organisation has no document types (R-11): HR activates standard
// ones from the platform catalog (PAN, Aadhaar, passport, degree…) or creates
// custom ones. Two tabs:
//   Our document types — the org's set: edit policy, deactivate / reactivate
//   Catalog            — browse, preview the defaults, activate in bulk
//                        (idempotent: re-activating reports "already active")
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiCheck, HiCollection, HiLockClosed, HiPlus, HiRefresh, HiSearch, HiShieldCheck, HiSparkles, HiTemplate, HiX } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { documentErrorMessage } from "../../../../shared/utils/documentErrors";
import { DOC_GROUPS, arrayPayload, formatBytes, formatList, groupLabel } from "../../../../shared/documents/documentMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import { invalidateDocumentTypes } from "../../../../shared/documents/useDocumentTypes";
import DocumentTypeFormDialog from "../DocumentTypeFormDialog";

const TYPE_API = {
  create: documentsAPI.createType,
  update: documentsAPI.updateType,
  deactivate: documentsAPI.deactivateType,
  activate: documentsAPI.activateType,
};

const yes = (v) => (v ? "Yes" : "No");

function Chip({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-600 border-slate-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    fuchsia: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Permission chips for a type row. */
function Permissions({ t }) {
  const chips = [];
  if (t.is_confidential) chips.push(<Chip key="c" tone="purple"><HiLockClosed className="w-3 h-3" /> Confidential</Chip>);
  if (t.employee_can_upload) chips.push(<Chip key="eu">Employee uploads</Chip>);
  if (t.manager_can_view && !t.is_confidential) chips.push(<Chip key="mv">Manager views</Chip>);
  if (t.manager_can_request && !t.is_confidential) chips.push(<Chip key="mr">Manager uploads</Chip>);
  return <div className="flex flex-wrap gap-1">{chips.length ? chips : <span className="text-xs text-slate-400">HR only</span>}</div>;
}

/* ── Catalog entry preview (#2) ───────────────────────────────────────────── */
function CatalogPreview({ code, selected, onToggle, onClose }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    documentsAPI.getCatalogEntry(code).then((res) => alive && setEntry(res?.data ?? res)).catch((err) => alive && setError(err));
    return () => { alive = false; };
  }, [code]);

  return (
    <DetailDialog
      eyebrow="Catalog document"
      icon={HiCollection}
      title={entry?.name || code}
      subtitle={entry ? `${groupLabel(entry.group)}${entry.country_code ? ` · ${entry.country_code}` : " · Any country"}` : ""}
      badge={entry?.is_statutory ? <DetailPill>Statutory</DetailPill> : null}
      loading={!entry && !error}
      onClose={onClose}
      footer={entry && !entry.is_activated && entry.is_active !== false ? (
        <button type="button" onClick={() => { onToggle(code); onClose(); }} className={selected ? SECONDARY_BTN : PRIMARY_BTN}>
          {selected ? <><HiX className="w-4 h-4" /> Unselect</> : <><HiCheck className="w-4 h-4" /> Select to activate</>}
        </button>
      ) : null}
    >
      {error ? <DocErrorState error={error} fallback="Couldn't load this catalog entry." /> : entry && (
        <>
          {entry.description && <p className="text-sm text-slate-600 leading-relaxed">{entry.description}</p>}
          <DetailSection title="Defaults copied when you activate it" icon={HiTemplate}>
            <DetailGrid
              cols={3}
              items={[
                ["Code", entry.code],
                ["Confidential", yes(entry.default_is_confidential)],
                ["Needs verification", yes(entry.default_requires_verification)],
                ["Employees can upload", yes(entry.default_employee_can_upload)],
                ["Employees can view", yes(entry.default_employee_can_view)],
                ["Employees can delete", yes(entry.default_employee_can_delete)],
                ["Managers can view", yes(entry.default_manager_can_view)],
                ["Managers can upload", yes(entry.default_manager_can_request)],
                ["Several copies", yes(entry.default_allows_multiple)],
                ["Tracks expiry", entry.default_has_expiry ? `Yes — reminders ${(entry.default_expiry_reminder_days || []).join(", ")} days before` : "No"],
                ["Largest file", formatBytes(entry.default_max_file_size_bytes)],
                ["Formats", formatList(entry.default_allowed_content_types || [])],
                ["Kept for", entry.default_retention_days ? `${entry.default_retention_days} days` : null],
              ]}
            />
            <p className="text-[11px] text-slate-500 mt-3">You can change everything except the code and statutory flag after activating.</p>
          </DetailSection>
        </>
      )}
    </DetailDialog>
  );
}

/* ── Catalog tab ──────────────────────────────────────────────────────────── */
function CatalogTab({ onActivated, showToast }) {
  const [filters, setFilters] = useState({ group: "", country_code: "", q: "", activated: "false" });
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [selected, setSelected] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [activating, setActivating] = useState(false);

  // Debounce the free-text search so every keystroke isn't a request.
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => ({ ...f, q: query.trim().slice(0, 200) })), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Search fires as the user types; only the newest response may land.
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = arrayPayload(await documentsAPI.getCatalog({ ...filters, plane: "employee" }));
      if (id === reqRef.current) setState({ rows, loading: false, error: null });
    } catch (error) {
      if (id === reqRef.current) setState({ rows: [], loading: false, error });
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const countries = useMemo(() => [...new Set(state.rows.map((r) => r.country_code).filter(Boolean))].sort(), [state.rows]);
  const toggle = (code) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });

  const activate = async () => {
    const codes = [...selected];
    if (!codes.length) return;
    setActivating(true);
    try {
      const res = await documentsAPI.activateCatalogTypes(codes);
      const out = res?.data ?? res ?? {};
      const parts = [];
      if (out.activated?.length) parts.push(`${out.activated.length} activated`);
      if (out.reactivated?.length) parts.push(`${out.reactivated.length} reactivated`);
      if (out.already_active?.length) parts.push(`${out.already_active.length} already active`);
      showToast(parts.length ? `Done — ${parts.join(", ")}` : "Done");
      setSelected(new Set());
      invalidateDocumentTypes();
      onActivated();
      load();
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn't activate these types."), "error");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalog — e.g. passport, degree, PF" aria-label="Search the catalog" className={`${SELECT} w-full pl-9`} />
        </div>
        <select aria-label="Category" value={filters.group} onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))} className={SELECT}>
          <option value="">All categories</option>
          {DOC_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select aria-label="Country" value={filters.country_code} onChange={(e) => setFilters((f) => ({ ...f, country_code: e.target.value }))} className={SELECT}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Activation" value={filters.activated} onChange={(e) => setFilters((f) => ({ ...f, activated: e.target.value }))} className={SELECT}>
          <option value="false">Not activated yet</option>
          <option value="true">Already activated</option>
          <option value="">Everything</option>
        </select>
      </div>

      {state.error ? (
        <div className="bg-white rounded-2xl border border-slate-100"><DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the catalog." /></div>
      ) : state.loading && state.rows.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-36 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      ) : state.rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100">
          <DocEmptyState icon={HiCollection} title={filters.activated === "false" && !filters.q && !filters.group ? "Everything in the catalog is active" : "Nothing matches"} message={filters.activated === "false" && !filters.q && !filters.group ? "You've activated every standard document. Create a custom type for anything else." : "Try another search or category."} />
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${state.loading ? "opacity-60" : ""}`}>
          {state.rows.map((c) => {
            const active = c.is_activated;
            const withdrawn = c.is_active === false;
            const picked = selected.has(c.code);
            return (
              <div key={c.id || c.code}
                {...rowPreviewProps(() => setPreview(c.code), `Preview ${c.name}`)}
                className={`relative text-left bg-white rounded-2xl border p-4 transition cursor-pointer outline-none focus:ring-2 focus:ring-purple-200 ${picked ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-100 hover:border-purple-200 shadow-xs"}`}>
                <div className="flex items-start gap-3">
                  {!active && !withdrawn ? (
                    <input type="checkbox" checked={picked} onChange={() => toggle(c.code)} aria-label={`Select ${c.name}`} className="mt-1 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 shrink-0" />
                  ) : (
                    <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? (c.org_type_is_active === false ? "bg-slate-200 text-slate-500" : "bg-violet-600 text-white") : "bg-slate-100 text-slate-400"}`}><HiCheck className="w-3 h-3" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">{c.name}</p>
                      {c.is_statutory && <Chip tone="purple"><HiShieldCheck className="w-3 h-3" /> Statutory</Chip>}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mt-0.5">{groupLabel(c.group)}{c.country_code ? ` · ${c.country_code}` : ""}</p>
                    {c.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{c.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {active ? <Chip tone={c.org_type_is_active === false ? "slate" : "violet"}>{c.org_type_is_active === false ? "Activated · switched off" : "Active in your organisation"}</Chip> : withdrawn ? <Chip>Withdrawn</Chip> : null}
                      {c.default_has_expiry && <Chip tone="fuchsia">Tracks expiry</Chip>}
                      {c.default_is_confidential && <Chip tone="purple"><HiLockClosed className="w-3 h-3" /> Confidential</Chip>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 flex justify-center">
          <div className="flex items-center gap-3 bg-slate-900 text-white rounded-2xl shadow-2xl pl-5 pr-2 py-2">
            <span className="text-sm font-semibold">{selected.size} selected</span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-bold text-slate-300 hover:text-white px-2">Clear</button>
            <button type="button" onClick={activate} disabled={activating} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-sm font-bold disabled:opacity-60">
              <HiSparkles className="w-4 h-4" /> {activating ? "Activating…" : `Activate ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {preview && <CatalogPreview code={preview} selected={selected.has(preview)} onToggle={toggle} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function DocumentTypesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "catalog" ? "catalog" : "ours";
  const setTab = (next) => setParams(next === "catalog" ? { tab: "catalog" } : {}, { replace: true });
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ group: "", source: "", is_active: "" });
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [editing, setEditing] = useState(null); // type | "new"
  const [defaultVerification, setDefaultVerification] = useState(true);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = arrayPayload(await documentsAPI.getTypes(filters));
      rows.sort((a, b) => (a.is_active === false) - (b.is_active === false) || (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name)));
      if (id === reqRef.current) setState({ rows, loading: false, error: null });
    } catch (error) {
      if (id === reqRef.current) setState({ rows: [], loading: false, error });
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    documentsAPI.getSettings().then((res) => setDefaultVerification((res?.data ?? res)?.document_default_verification_required !== false)).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter((t) => `${t.name} ${t.code} ${t.description || ""}`.toLowerCase().includes(q));
  }, [state.rows, search]);

  const activeCount = state.rows.filter((t) => t.is_active !== false).length;
  const unfiltered = !filters.group && !filters.source && !filters.is_active && !search;

  // Open from the row at once, then re-read the type (#6) so the form starts
  // from the current policy if someone else changed it since the list loaded.
  const openType = async (row) => {
    setEditing(row);
    try {
      const fresh = (await documentsAPI.getType(row.id))?.data;
      if (fresh?.id && fresh.updated_at !== row.updated_at) setEditing((cur) => (cur?.id === fresh.id ? fresh : cur));
    } catch {
      // The row is at most one refresh old; keep it.
    }
  };

  const onSaved = (_type, message) => {
    setEditing(null);
    showToast(message);
    invalidateDocumentTypes();
    load();
  };

  return (
    <>
      <DashboardTopBar title="Document Types" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Document Types</h1>
            <p className="text-sm text-slate-500 mt-1">
              The documents your organisation collects, and the rules for each.
              {!state.loading && !state.error && unfiltered && <span className="font-semibold text-slate-700"> {activeCount} active.</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTab("catalog")} className={SECONDARY_BTN}><HiCollection className="w-4 h-4" /> Browse catalog</button>
            <button type="button" onClick={() => setEditing("new")} className={PRIMARY_BTN}><HiPlus className="w-4 h-4" /> Custom type</button>
          </div>
        </div>

        <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="Document types">
          {[["ours", "Our document types"], ["catalog", "Catalog"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${tab === key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "catalog" ? (
          <CatalogTab onActivated={load} showToast={showToast} />
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code" aria-label="Search document types" className={`${SELECT} w-full pl-9`} />
              </div>
              <select aria-label="Category" value={filters.group} onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))} className={SELECT}>
                <option value="">All categories</option>
                {DOC_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <select aria-label="Origin" value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className={SELECT}>
                <option value="">Catalog and custom</option>
                <option value="catalog">From the catalog</option>
                <option value="custom">Custom</option>
              </select>
              <select aria-label="Status" value={filters.is_active} onChange={(e) => setFilters((f) => ({ ...f, is_active: e.target.value }))} className={SELECT}>
                <option value="">Active and switched off</option>
                <option value="true">Active</option>
                <option value="false">Switched off</option>
              </select>
              <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh"><HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /></button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              {state.error ? (
                <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your document types." />
              ) : state.loading && state.rows.length === 0 ? (
                <div className="p-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : visible.length === 0 ? (
                <DocEmptyState
                  icon={HiTemplate}
                  title={unfiltered ? "No document types yet" : "Nothing matches"}
                  message={unfiltered ? "Start from the catalog — PAN, Aadhaar, passport, degree certificates and more are ready to activate in one click." : "Try another search or filter."}
                  action={unfiltered ? <button type="button" onClick={() => setTab("catalog")} className={PRIMARY_BTN}><HiCollection className="w-4 h-4" /> Browse the catalog</button> : null}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[900px]">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Document type</th>
                        <th className="px-5 py-3.5">Category</th>
                        <th className="px-5 py-3.5">Access</th>
                        <th className="px-5 py-3.5">Rules</th>
                        <th className="px-5 py-3.5">Files</th>
                        <th className="px-5 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visible.map((t) => (
                        <tr key={t.id} {...rowPreviewProps(() => openType(t), `Edit ${t.name}`)} className={`hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40 ${t.is_active === false ? "opacity-60" : ""}`}>
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800 flex items-center gap-1.5">{t.name}{t.is_statutory && <HiShieldCheck className="w-4 h-4 text-purple-500" title="Statutory" />}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{t.code} · {t.source === "custom" ? "Custom" : "Catalog"}</p>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-semibold text-slate-600">{groupLabel(t.group)}</td>
                          <td className="px-5 py-3.5"><Permissions t={t} /></td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              <Chip tone={t.requires_verification ? "violet" : "slate"}>{t.requires_verification ? "Verified by HR" : "No review"}</Chip>
                              {t.has_expiry && <Chip tone="fuchsia">Expiry</Chip>}
                              <Chip>{t.allows_multiple ? "Several" : "One per person"}</Chip>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-[11px] text-slate-500 leading-snug">
                            <p className="font-semibold text-slate-700">{formatBytes(t.max_file_size_bytes)}</p>
                            <p className="truncate max-w-[180px]">{formatList(t.allowed_content_types || [])}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            {t.is_active === false ? <Chip>Switched off</Chip> : <Chip tone="violet">Active</Chip>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {editing && (
        <DocumentTypeFormDialog
          key={editing === "new" ? "new" : `${editing.id}-${editing.updated_at}`}
          type={editing === "new" ? null : editing}
          defaultVerification={defaultVerification}
          api={TYPE_API}
          onSaved={onSaved}
          onClose={() => setEditing(null)}
        />
      )}
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
