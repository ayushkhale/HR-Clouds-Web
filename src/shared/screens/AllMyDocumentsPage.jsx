// ─────────────────────────────────────────────────────────────────────────────
// AllMyDocumentsPage.jsx — "All my documents": everything to do with this
// person's employment, gathered from four places into one screen (#126).
// Mounted in every workspace, because everybody has a file.
//
// Before this, finding something meant knowing which menu it lived under: your
// own uploads in one place, the policies the company sent you in another, the
// blank claim form somewhere else again, and your payslips in a fourth. This is
// the page you give somebody who just wants their documents.
//
// Two things about the way it is built, both of which come straight from how
// the endpoint behaves:
//
// · Nothing here is a link until you click it. Every item carries the address
//   to call rather than a ready-made download, so opening this page signs
//   nothing, costs nothing and — importantly — records nothing. A document
//   read is written down only when somebody actually opens it, which is what
//   makes that record worth having.
//
// · Each section stands or falls alone. If payroll is down, the payroll card
//   says so and the other three are unaffected. A page like this must never be
//   all-or-nothing: the person came for their passport, and their passport is
//   right there.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiArrowRight, HiBadgeCheck, HiCash, HiCheckCircle, HiClipboardList, HiCloudDownload,
  HiDocumentText, HiExclamationCircle, HiFolderOpen, HiInformationCircle, HiOfficeBuilding,
  HiRefresh, HiTemplate,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { Toast, useToast } from "../attendance/ui";
import { useMyDocumentPaths } from "../attendance/paths";
import { request } from "../api/client";
import { downloadFile } from "../utils/download";
import { documentErrorMessage } from "../utils/documentErrors";
import { documentsAPI } from "../api";
import { fmtDate } from "../attendance/dates";
import { DocStatusBadge, DocEmptyState, DocErrorState, SECONDARY_BTN } from "../documents/ui";
import {
  PORTFOLIO_SECTIONS, accessCall, actionFirst, itemActionMeta, portfolioOf,
  sectionReasonMessage, signedUrlOf,
} from "../documents/portfolioMeta";
import { triggerDownload } from "../documents/documentUpload";

const SECTION_ICON = {
  my_documents: HiFolderOpen,
  org_documents: HiOfficeBuilding,
  templates: HiTemplate,
  payroll: HiCash,
};

const ITEM_ICON = {
  employee: HiDocumentText,
  org: HiOfficeBuilding,
  template: HiTemplate,
  payroll: HiCash,
};

/** One row inside a section card. */
function PortfolioItem({ item, busy, onOpen }) {
  const Icon = ITEM_ICON[item.source] || HiDocumentText;
  const action = item.requires_action ? itemActionMeta(item.action) : null;
  const openable = !!accessCall(item);

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${item.requires_action ? "bg-fuchsia-50/40" : ""}`}>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.requires_action ? "bg-white text-fuchsia-600" : "bg-purple-50 text-purple-600"}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
        <p className="text-[11px] text-slate-400 truncate">
          {[
            item.issued_on ? `Issued ${fmtDate(item.issued_on)}` : "",
            item.expires_on ? `Expires ${fmtDate(item.expires_on)}` : "",
          ].filter(Boolean).join(" · ") || (item.source === "template" ? "Blank form" : "")}
        </p>
      </div>
      {action ? (
        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 text-[10px] font-bold text-fuchsia-700 whitespace-nowrap" title={action.blurb}>
          <HiExclamationCircle className="w-3 h-3" /> {action.label}
        </span>
      ) : item.status ? (
        <span className="hidden sm:inline-flex"><DocStatusBadge status={item.status} /></span>
      ) : null}
      {openable && (
        <button
          type="button"
          onClick={() => onOpen(item)}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1.5 rounded-lg disabled:opacity-50 shrink-0"
        >
          {busy
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            : <HiCloudDownload className="w-3.5 h-3.5" />}
          Open
        </button>
      )}
    </li>
  );
}

/** One of the four cards. A section that isn't available says why and stops. */
function SectionCard({ meta, section, to, busyId, onOpen }) {
  const Icon = SECTION_ICON[meta.key] || HiDocumentText;
  const items = useMemo(() => actionFirst(section.items), [section.items]);
  const needsAction = items.filter((item) => item.requires_action).length;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden flex flex-col">
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800 truncate">{meta.title}</h2>
            {needsAction > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-100 text-fuchsia-700 shrink-0">{needsAction} to do</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{meta.blurb}</p>
        </div>
      </div>

      {!section.available ? (
        <div className="px-5 pb-5">
          <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
            <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
            {sectionReasonMessage(section.reason)}
          </p>
        </div>
      ) : items.length === 0 ? (
        <DocEmptyState icon={Icon} title={meta.emptyTitle} message={meta.emptyMessage} />
      ) : (
        <ul className="divide-y divide-slate-50 border-t border-slate-100">
          {items.map((item) => (
            <PortfolioItem key={`${item.source}-${item.id}`} item={item} busy={busyId === `${item.source}-${item.id}`} onOpen={onOpen} />
          ))}
        </ul>
      )}

      {to && (
        <div className="mt-auto px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <Link to={to} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800">
            {meta.linkLabel} <HiArrowRight className="w-3.5 h-3.5" />
          </Link>
          {section.hasMore && <span className="text-[11px] text-slate-400 ml-2">More than fits here.</span>}
        </div>
      )}
    </section>
  );
}

export default function AllMyDocumentsPage() {
  const myPaths = useMyDocumentPaths();
  const { toast, showToast, clearToast } = useToast();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [busyId, setBusyId] = useState("");

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getMyComposedDocuments();
      if (token !== reqRef.current) return;
      setState({ data: portfolioOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ data: null, loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Opening an item is the moment its link is signed and its read is recorded.
   * Two shapes of endpoint: one answers with a signed URL to follow, the other
   * streams the file itself (payslips and Form 16).
   */
  const open = async (item) => {
    const call = accessCall(item);
    if (!call || busyId) return;
    setBusyId(`${item.source}-${item.id}`);
    try {
      if (call.mode === "file") {
        await downloadFile(call.path, { filename: call.fileName });
      } else {
        const url = signedUrlOf(await request(call.path));
        if (!url) throw new Error("No link came back.");
        triggerDownload(url);
      }
    } catch (err) {
      showToast(documentErrorMessage(err, "Couldn't open that. Refresh and try again."), "error");
      // A 404 usually means it moved on while the page sat open — a policy
      // replaced, a form retired. Re-read rather than leave a dead row.
      if (err?.status === 404) load();
    } finally {
      setBusyId("");
    }
  };

  const portfolio = state.data;
  const sectionLink = {
    my_documents: myPaths.documents,
    org_documents: myPaths.company,
    templates: myPaths.forms,
    payroll: null,
  };
  const actionCount = portfolio?.actionCount || 0;

  return (
    <>
      <DashboardTopBar title="All My Documents" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">All My Documents</h1>
            <p className="text-sm text-slate-500 mt-1">
              Everything to do with your employment in one place — what you’ve uploaded, what the company has issued to you, the blank forms you can fill in, and your payslips.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            <Link to={myPaths.requests} className={SECONDARY_BTN}>
              <HiClipboardList className="w-4 h-4" /> What’s asked of me
            </Link>
          </div>
        </div>

        {actionCount > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5">
            <HiExclamationCircle className="w-5 h-5 text-fuchsia-600 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-fuchsia-900">
              {actionCount} {actionCount === 1 ? "thing needs" : "things need"} something from you — marked below. Most are a policy to read and confirm, or a document to re-upload.
            </p>
          </div>
        )}

        {state.error ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
            <DocErrorState error={state.error} onRetry={load} fallback="Couldn't load your documents." />
          </div>
        ) : state.loading && !portfolio ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 ${state.loading ? "opacity-60" : ""}`}>
            {PORTFOLIO_SECTIONS.map((meta) => (
              <SectionCard
                key={meta.key}
                meta={meta}
                section={portfolio.sections[meta.key]}
                to={sectionLink[meta.key]}
                busyId={busyId}
                onOpen={open}
              />
            ))}
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
          <HiBadgeCheck className="w-4 h-4 shrink-0 mt-px text-purple-400" />
          <span>
            Nothing on this page is downloaded until you press Open — that keeps it quick, and it means the record of who read a document is only ever written when somebody really did.{" "}
            {portfolio?.generatedAt && <span className="inline-flex items-center gap-1"><HiCheckCircle className="w-3 h-3" /> Up to date as of {new Date(portfolio.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.</span>}
          </span>
        </p>
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
