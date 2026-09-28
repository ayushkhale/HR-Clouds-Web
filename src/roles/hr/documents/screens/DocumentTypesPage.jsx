// ─────────────────────────────────────────────────────────────────────────────
// DocumentTypesPage.jsx — What documents this organisation accepts (#1–#9).
//
// A fresh organisation has no document types (R-11): HR activates standard
// ones from the platform catalog (PAN, Aadhaar, passport, degree…) or creates
// custom ones. Two tabs:
//   Our document types — the org's set: edit policy, deactivate / reactivate
//   Catalog            — browse, preview the defaults, activate in bulk
//                        (idempotent: re-activating reports "already active")
//
// CONTRACT TRAP (backend guidance, 28 Sep 2026 — md_updates/
// 2026-09-28_document_catalog_url_and_filters_guidance.md). #1 must be called
// with a CLEAN URL: no default query parameters, and never an empty value
// (`?plane=&q=` is a 400 waiting to happen). This page used to pin
// `plane=employee&activated=false` on, which broke two things at once:
//   · the 19 org-plane entries — every letter and policy the company ISSUES —
//     were invisible, so `experience_letter_issued` could not be activated and
//     issuing an experience letter died on 409 DOCUMENT_TYPE_NOT_ACTIVATED;
//   · anything already activated vanished from the catalog, which reads as
//     "somebody deleted it" rather than "it's already yours".
// So the catalog tab reads #1 once, unfiltered, and filters in memory. The list
// is small and unpaginated (54 rows today), the tabs get honest counts, search
// is instant, and there is no code path left that can send a default filter.
// Don't "optimise" this back into a request per filter change.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HiCheck, HiCog, HiCollection, HiLockClosed, HiPlus, HiRefresh, HiSearch, HiShieldCheck, HiSparkles, HiTemplate, HiX } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { documentsAPI } from "../../../../shared/api";
import { FilterTabs, Toast, useToast } from "../../../../shared/attendance/ui";
import { documentErrorMessage } from "../../../../shared/utils/documentErrors";
import { DOC_GROUPS, arrayPayload, formatBytes, formatList, groupLabel } from "../../../../shared/documents/documentMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import { invalidateDocumentTypes } from "../../../../shared/documents/useDocumentTypes";
import DocumentTypeFormDialog from "../DocumentTypeFormDialog";
import { isRequiredOfEveryone, mandatoryCriteria } from "../../../../shared/documents/requestMeta";

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

const isOrgType = (t) => t?.plane === "org";

/** Permission chips for a type row. An org type is issued, not collected. */
function Permissions({ t }) {
  const chips = [];
  if (t.is_confidential) chips.push(<Chip key="c" tone="purple"><HiLockClosed className="w-3 h-3" /> Confidential</Chip>);
  if (isOrgType(t)) {
    if (t.manager_can_request) chips.push(<Chip key="mp">Managers can propose</Chip>);
  } else {
    if (t.employee_can_upload) chips.push(<Chip key="eu">Employee uploads</Chip>);
    if (t.manager_can_view && !t.is_confidential) chips.push(<Chip key="mv">Manager views</Chip>);
    if (t.manager_can_request && !t.is_confidential) chips.push(<Chip key="mr">Manager uploads</Chip>);
  }
  return <div className="flex flex-wrap gap-1">{chips.length ? chips : <span className="text-xs text-slate-400">HR only</span>}</div>;
}

/* ── The two planes, in one vocabulary ────────────────────────────────────── */
// Both tabs on this page say the same two things about `plane`, because it is
// the distinction people get wrong: `experience_letter` is the one an employee
// uploads from their LAST job, `experience_letter_issued` is the one THIS
// company prints on exit. Only the second can be issued, and only once its
// type is active here.
const PLANES = [
  { value: "", label: "All", blurb: "Everything the platform ships with — what you collect from your people, and what you issue to them." },
  { value: "employee", label: "We collect", blurb: "Papers your people upload: proof of identity, qualifications, and documents from previous employers." },
  { value: "org", label: "We issue", blurb: "Letters and policies your company hands out — experience and relieving letters, appointment and offer letters, company policies. A letter can only be issued once its type is active here." },
];
const planeBlurb = (plane) => PLANES.find((p) => p.value === plane)?.blurb || "";

/* ── Catalog entry preview (#2) ───────────────────────────────────────────── */
// #2 answers the platform's defaults only — it carries no `is_activated` /
// `org_type_id` — so every piece of activation state here comes from the list
// row we were opened from, never from `entry`.
function CatalogPreview({ row, selected, onToggle, onConfigure, onClose }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState(null);
  const { code } = row;
  useEffect(() => {
    let alive = true;
    documentsAPI.getCatalogEntry(code).then((res) => alive && setEntry(res?.data ?? res)).catch((err) => alive && setError(err));
    return () => { alive = false; };
  }, [code]);

  const active = !!row.is_activated;
  const withdrawn = row.is_active === false;
  const switchedOff = active && row.org_type_is_active === false;

  return (
    <DetailDialog
      eyebrow={row.plane === "org" ? "Catalog · we issue it" : "Catalog · we collect it"}
      icon={HiCollection}
      title={entry?.name || row.name || code}
      subtitle={`${groupLabel(row.group)}${row.country_code ? ` · ${row.country_code}` : " · Any country"}`}
      badge={row.is_statutory ? <DetailPill>Statutory</DetailPill> : null}
      loading={!entry && !error}
      onClose={onClose}
      footer={
        active && row.org_type_id ? (
          <button type="button" onClick={() => { onConfigure(row.org_type_id); onClose(); }} className={PRIMARY_BTN}>
            <HiCog className="w-4 h-4" /> Configure it
          </button>
        ) : withdrawn ? (
          <DetailFooterNote>The platform no longer offers this document, so it can’t be activated. Anything already filed under it stays where it is.</DetailFooterNote>
        ) : (
          <button type="button" onClick={() => { onToggle(code); onClose(); }} className={selected ? SECONDARY_BTN : PRIMARY_BTN}>
            {selected ? <><HiX className="w-4 h-4" /> Unselect</> : <><HiCheck className="w-4 h-4" /> Select to activate</>}
          </button>
        )
      }
    >
      {error ? <DocErrorState error={error} fallback="Couldn't load this catalog entry." /> : entry && (
        <>
          {active && (
            <p className="text-sm text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
              {switchedOff
                ? "This is already one of your document types, but it is switched off, so nothing can be filed under it. Open it to switch it back on."
                : "This is already one of your document types. The settings below are what it started from — open it to see what it is set to now."}
            </p>
          )}
          {entry.description && <p className="text-sm text-slate-600 leading-relaxed">{entry.description}</p>}
          <DetailSection title={active ? "What it started from" : "Defaults copied when you activate it"} icon={HiTemplate}>
            <DetailGrid
              cols={3}
              items={[
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
            <p className="text-xs text-slate-500 mt-3">Everything here can be changed after you activate it.</p>
          </DetailSection>
        </>
      )}
    </DetailDialog>
  );
}

/* ── Catalog tab ──────────────────────────────────────────────────────────── */
// Read once, filtered here. #1 is a small unpaginated list (54 rows today) and
// the backend guidance of 28 Sep 2026 is emphatic that the base call carries NO
// query string — `?plane=employee&activated=false` used to be pinned on, which
// hid every letter the company issues and everything already activated. One
// clean read makes that literally impossible, gives the tabs honest counts, and
// makes search instant instead of one request per keystroke. Re-read with the
// refresh button; activating already reloads through the parent.
function CatalogTab({ plane, onPlaneChange, onActivated, onConfigure, showToast }) {
  // `onActivated` reloads the org's list AND moves to it — activating is the
  // one action on this tab, and leaving somebody on the catalog afterwards
  // makes them hunt for what they just did.
  const [group, setGroup] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState(""); // "" | "active" | "inactive"
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [selected, setSelected] = useState(() => new Set());
  const [preview, setPreview] = useState(null);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = arrayPayload(await documentsAPI.getCatalog());
      rows.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name)));
      setState({ rows, loading: false, error: null });
    } catch (error) {
      setState({ rows: [], loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const planeCounts = useMemo(() => ({
    "": state.rows.length,
    employee: state.rows.filter((r) => r.plane === "employee").length,
    org: state.rows.filter((r) => r.plane === "org").length,
  }), [state.rows]);

  // Every other control counts within the chosen plane, so the numbers always
  // add up to what the tab promises.
  const inPlane = useMemo(() => state.rows.filter((r) => !plane || r.plane === plane), [state.rows, plane]);
  const activeCount = useMemo(() => inPlane.filter((r) => r.is_activated).length, [inPlane]);
  const countries = useMemo(() => [...new Set(inPlane.map((r) => r.country_code).filter(Boolean))].sort(), [inPlane]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().slice(0, 200);
    return inPlane.filter((r) => {
      if (group && r.group !== group) return false;
      if (country && r.country_code !== country) return false;
      if (status === "active" && !r.is_activated) return false;
      if (status === "inactive" && r.is_activated) return false;
      if (q && !`${r.name} ${r.code} ${r.description || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inPlane, group, country, status, query]);

  const filtered = !!(group || country || status || query.trim());
  const selectable = visible.filter((r) => !r.is_activated && r.is_active !== false);

  // The two planes are separate universes, so a selection doesn't survive a tab
  // change — activating something nobody can see any more is the kind of
  // surprise this page shouldn't have. The other filters keep it: the sticky
  // bar still says how many are picked, so nothing is hidden.
  useEffect(() => { setSelected(new Set()); }, [plane]);

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
      const count = (out.activated?.length || 0) + (out.reactivated?.length || 0);
      showToast(parts.length
        ? `${parts.join(", ")}${count ? ` — ${count === 1 ? "it is" : "they are"} now in your document types.` : ""}`
        : "Done");
      setSelected(new Set());
      invalidateDocumentTypes();
      // No catalog reload: `onActivated` moves to the org's list, so this tab
      // unmounts and would only be re-reading rows nobody is looking at.
      onActivated();
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn't activate these types."), "error");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <FilterTabs
          value={plane}
          onChange={onPlaneChange}
          options={PLANES.map((p) => ({ value: p.value, label: state.loading && !state.rows.length ? p.label : `${p.label} (${planeCounts[p.value] ?? 0})` }))}
        />
        <p className="text-xs text-slate-500 mt-2 max-w-3xl leading-relaxed">{planeBlurb(plane)}</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} placeholder="Search the catalog — e.g. passport, experience letter, PF" aria-label="Search the catalog" className={`${SELECT} w-full pl-9`} />
        </div>
        <select aria-label="Category" value={group} onChange={(e) => setGroup(e.target.value)} className={SELECT}>
          <option value="">All categories</option>
          {DOC_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        {countries.length > 0 && (
          <select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className={SELECT}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}>
          <option value="">All statuses ({inPlane.length})</option>
          <option value="active">Active ({activeCount})</option>
          <option value="inactive">Not activated ({inPlane.length - activeCount})</option>
        </select>
        <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh the catalog"><HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /></button>
      </div>

      {state.error ? (
        <div className="bg-white rounded-2xl border border-slate-100"><DocErrorState error={state.error} onRetry={load} fallback="Couldn't load the catalog." /></div>
      ) : state.loading && state.rows.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-36 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100">
          <DocEmptyState
            icon={HiCollection}
            title={filtered ? "Nothing matches" : "Nothing in this part of the catalog"}
            message={filtered ? "Try another search, category or status." : "The platform hasn’t published any documents here yet."}
            action={filtered ? <button type="button" onClick={() => { setGroup(""); setCountry(""); setStatus(""); setQuery(""); }} className={SECONDARY_BTN}><HiX className="w-4 h-4" /> Clear filters</button> : null}
          />
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${state.loading ? "opacity-60" : ""}`}>
          {visible.map((c) => {
            const active = c.is_activated;
            const switchedOff = active && c.org_type_is_active === false;
            const withdrawn = c.is_active === false;
            const picked = selected.has(c.code);
            return (
              <div key={c.id || c.code}
                {...rowPreviewProps(() => setPreview(c), `Preview ${c.name}`)}
                className={`relative text-left bg-white rounded-2xl border p-4 transition cursor-pointer outline-none focus:ring-2 focus:ring-purple-200 ${picked ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-100 hover:border-purple-200 shadow-xs"}`}>
                <div className="flex items-start gap-3">
                  {!active && !withdrawn ? (
                    <input type="checkbox" checked={picked} onChange={() => toggle(c.code)} aria-label={`Select ${c.name}`} className="mt-1 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 shrink-0" />
                  ) : (
                    <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? (switchedOff ? "bg-slate-200 text-slate-500" : "bg-violet-600 text-white") : "bg-slate-100 text-slate-400"}`}><HiCheck className="w-3 h-3" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">{c.name}</p>
                      {c.is_statutory && <Chip tone="purple"><HiShieldCheck className="w-3 h-3" /> Statutory</Chip>}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mt-0.5">{groupLabel(c.group)}{c.country_code ? ` · ${c.country_code}` : ""}</p>
                    {c.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{c.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {/* Status first, always present: with the catalog no longer
                          pinned to "not activated yet", it is the one thing a
                          card has to answer at a glance. */}
                      {withdrawn ? <Chip>No longer offered</Chip>
                        : active ? <Chip tone={switchedOff ? "slate" : "violet"}>{switchedOff ? "Active · switched off" : "Active"}</Chip>
                        : <Chip>Not activated</Chip>}
                      {!plane && <Chip>{c.plane === "org" ? "We issue it" : "We collect it"}</Chip>}
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
            {/* Adds to the selection: picks made under another filter stay picked. */}
            {selectable.some((r) => !selected.has(r.code)) && (
              <button type="button" onClick={() => setSelected((s) => new Set([...s, ...selectable.map((r) => r.code)]))} className="text-xs font-bold text-slate-300 hover:text-white px-2">Select all {selectable.length} shown</button>
            )}
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-bold text-slate-300 hover:text-white px-2">Clear</button>
            <button type="button" onClick={activate} disabled={activating} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-sm font-bold disabled:opacity-60">
              <HiSparkles className="w-4 h-4" /> {activating ? "Activating…" : `Activate ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {preview && <CatalogPreview row={preview} selected={selected.has(preview.code)} onToggle={toggle} onConfigure={onConfigure} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function DocumentTypesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "catalog" ? "catalog" : "ours";
  // The catalog's plane lives in the URL so another screen can send HR straight
  // to the half it needs — `?tab=catalog&plane=org` is where an experience or
  // relieving letter gets switched on before it can be issued.
  const catalogPlane = ["employee", "org"].includes(params.get("plane")) ? params.get("plane") : "";
  const setTab = (next, plane = "") =>
    setParams(next === "catalog" ? (plane ? { tab: "catalog", plane } : { tab: "catalog" }) : {}, { replace: true });
  const { toast, showToast, clearToast } = useToast();

  const [filters, setFilters] = useState({ plane: "", group: "", source: "", is_active: "" });
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
      // Newest first, so a type activated a moment ago is the first thing on
      // screen. Switched-off ones still sink to the bottom: they can't collect
      // anything, so they are history rather than the working list.
      rows.sort((a, b) =>
        (a.is_active === false) - (b.is_active === false)
        || Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)
        || String(a.name).localeCompare(String(b.name)));
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
  const requiredCount = state.rows.filter((t) => t.is_active !== false && t.is_mandatory).length;
  const unfiltered = !filters.plane && !filters.group && !filters.source && !filters.is_active && !search;

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

  // An already-activated catalog entry carries `org_type_id`; opening it is the
  // "Configure" half of the catalog, and it lands on the org's own list so the
  // person can see where the type actually lives afterwards.
  const openTypeById = async (orgTypeId) => {
    setTab("ours");
    try {
      const fresh = (await documentsAPI.getType(orgTypeId))?.data;
      if (fresh?.id) setEditing(fresh);
      else showToast("Couldn’t open that document type.", "error");
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn’t open that document type."), "error");
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
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Document Types</h1>
            <p className="text-sm text-slate-500 mt-1">
              What your organisation collects from its people, and what it issues to them.
              {!state.loading && !state.error && unfiltered && <span className="font-semibold text-slate-700"> {activeCount} active{requiredCount > 0 ? `, ${requiredCount} required` : ""}.</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
          <CatalogTab
            plane={catalogPlane}
            onPlaneChange={(plane) => setTab("catalog", plane)}
            onActivated={() => { load(); setTab("ours"); }}
            onConfigure={openTypeById}
            showToast={showToast}
          />
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code" aria-label="Search document types" className={`${SELECT} w-full pl-9`} />
              </div>
              <select aria-label="Kind" value={filters.plane} onChange={(e) => setFilters((f) => ({ ...f, plane: e.target.value }))} className={SELECT}>
                <option value="">Every kind</option>
                <option value="employee">We collect it</option>
                <option value="org">We issue it</option>
              </select>
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
                  message={unfiltered ? "Start from the catalog — PAN, Aadhaar, passport and more are ready to activate." : "Try another search or filter."}
                  action={unfiltered ? <button type="button" onClick={() => setTab("catalog")} className={PRIMARY_BTN}><HiCollection className="w-4 h-4" /> Browse the catalog</button> : null}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Document type</th>
                        <th className="px-5 py-3.5">Category</th>
                        <th className="px-5 py-3.5">Who can use it</th>
                        <th className="px-5 py-3.5">Rules</th>
                        <th className="px-5 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visible.map((t) => (
                        <tr key={t.id} {...rowPreviewProps(() => openType(t), `Edit ${t.name}`)} className={`hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40 ${t.is_active === false ? "opacity-60" : ""}`}>
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800 flex items-center gap-1.5">{t.name}{t.is_statutory && <HiShieldCheck className="w-4 h-4 text-purple-500" title="Required by law" />}</p>
                            {/* One muted line, not three. The code lives in the
                                form and the preview; on a list it is noise. */}
                            <p className="text-xs text-slate-400 mt-0.5">
                              {isOrgType(t) ? "We issue it" : "We collect it"} · {t.source === "custom" ? "Your own" : "Standard"}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-semibold text-slate-600">{groupLabel(t.group)}</td>
                          <td className="px-5 py-3.5"><Permissions t={t} /></td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {isOrgType(t) ? (
                                <>
                                  {t.requires_acknowledgement && <Chip tone="violet">Must be acknowledged</Chip>}
                                  {t.requires_signature && <Chip tone="fuchsia">Must be signed</Chip>}
                                  {!t.requires_acknowledgement && !t.requires_signature && <Chip>Read only</Chip>}
                                </>
                              ) : (
                                <>
                                  {t.is_mandatory && (
                                    <Chip tone="purple">
                                      {isRequiredOfEveryone(mandatoryCriteria(t)) ? "Required of everyone" : "Required of some"}
                                    </Chip>
                                  )}
                                  <Chip tone={t.requires_verification ? "violet" : "slate"}>{t.requires_verification ? "Verified by HR" : "No review"}</Chip>
                                  {t.has_expiry && <Chip tone="fuchsia">Expiry</Chip>}
                                  <Chip>{t.allows_multiple ? "Several" : "One per person"}</Chip>
                                </>
                              )}
                            </div>
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
