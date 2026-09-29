// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterProposalsScreen.jsx — Letter Proposals, for HR and for a
// manager. ONE screen, one layout, one vocabulary; the plane decides what is
// read and what may be done (CLAUDE.md §2).
//
//   HR      — every proposal in the organisation, and the decision (#148/#149/#150)
//   manager — the caller's own, and the asking (#145/#146)
//
// A manager may be promoted to HR, so the two must feel like one product: the
// same columns in the same order, the same words for the same states, the same
// row opening the same record inspector. Only the scope line under the title
// and the footer actions differ, and both differ because the job does.
//
// Two things here are not ordinary list plumbing:
//
//  · "NOT DEPLOYED" IS NOT "NOTHING WAITING". A server from before Phase 4
//    reads the word "proposals" as a letter id and answers 400 or 404. Both are
//    caught (`isProposalQueueMissing`) and shown as a calm explanation, because
//    "Couldn't load" on a screen for a feature the server has never had would
//    send somebody hunting a fault that doesn't exist.
//
//  · WHETHER A MANAGER MAY ASK AT ALL CANNOT BE KNOWN WITHOUT ASKING. The
//    setting that opens the path (#93) and the catalogue of letters (#135) are
//    both HR-only reads, so the button is offered only once the catalogue has
//    actually come back — never rendered hopefully and then 403'd (§2).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HiDocumentText, HiInbox, HiInformationCircle, HiMail, HiRefresh } from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { documentsAPI } from "../api";
import { rowPreviewProps } from "../components/DetailDialog";
import { FilterTabs, Pagination, Toast, useToast } from "../attendance/ui";
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from "../attendance/events";
import { fmtDate } from "../attendance/dates";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { isProposalQueueMissing } from "../utils/documentErrors";
import { DocEmptyState, DocErrorState, PRIMARY_BTN } from "./ui";
import { humanizeCode } from "./documentMeta";
import { letterTemplatesOf, letterTitle } from "./letterMeta";
import LetterProposalDetailDialog from "./LetterProposalDetailDialog";
import ProposeLetterDialog from "./ProposeLetterDialog";
import {
  LETTER_PROPOSAL_PLANES, PROPOSAL_STATUS_FILTERS, canRaiseProposal, proposalStateMeta, proposalsPayload,
} from "./letterProposalMeta";

const PAGE = 25;
const TITLE = "Letter Proposals";
const SETTINGS_PATH = "/dashboard/hr/documents/settings";

/**
 * @param {object} props
 * @param {"hr"|"manager"} props.plane
 * @param {object[]} props.people                roster for the picker and for names
 * @param {"idle"|"loading"|"ready"|"error"} [props.peopleStatus]
 * @param {(id: string, fallback?: string) => string} props.nameOf
 * @param {boolean} [props.embedded]             rendered inside the HR Inbox, without its own top bar
 */
export default function LetterProposalsScreen({ plane: planeKey, people = [], peopleStatus = "ready", nameOf, embedded = false }) {
  const plane = LETTER_PROPOSAL_PLANES[planeKey] || LETTER_PROPOSAL_PLANES.hr;
  const { toast, showToast, clearToast } = useToast();

  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [catalog, setCatalog] = useState({ rows: [], allowed: false, loaded: false });
  const [detail, setDetail] = useState(null);
  const [proposing, setProposing] = useState(false);
  // Set when the server says the organisation hasn't opened the path (#93).
  // Remembered for the session so the button isn't offered a second time.
  const [pathClosed, setPathClosed] = useState(false);

  // ── The list ───────────────────────────────────────────────────────────────
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = proposalsPayload(await plane.list({
        status: status || undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      }));
      if (token !== reqRef.current) return;
      setState({ rows: data.rows, total: data.total, loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, loading: false, error });
    }
  }, [plane, status, page]);

  useEffect(() => { load(); }, [load]);

  // A decision taken anywhere — this screen, another tab's inbox — moves this
  // list and the badge together (CLAUDE.md §7).
  useAttendanceChanged([ATTENDANCE_EVENTS.LETTER_PROPOSAL], load);

  /**
   * The catalogue, for two different jobs: turning a template code into the
   * letter's real title, and deciding whether "Ask for a letter" may be offered
   * at all. A refusal is not an error here — see the header.
   */
  const catalogRef = useRef(0);
  useEffect(() => {
    if (!plane.catalog) return;
    const token = ++catalogRef.current;
    plane.catalog()
      .then((res) => {
        if (token === catalogRef.current) setCatalog({ rows: letterTemplatesOf(res), allowed: true, loaded: true });
      })
      .catch(() => {
        if (token === catalogRef.current) setCatalog({ rows: [], allowed: false, loaded: true });
      });
  }, [plane]);

  const issuable = useMemo(
    () => catalog.rows.filter((row) => row.is_enabled && !row.is_orphaned),
    [catalog.rows],
  );

  /** A template code as the letter is actually called, or prettified when we can't know. */
  const letterNameOf = useCallback((code) => {
    const hit = catalog.rows.find((row) => row.code === code);
    return hit ? letterTitle(hit) : humanizeCode(code) || "Letter";
  }, [catalog.rows]);

  const mayPropose = !pathClosed && canRaiseProposal(plane, { ...catalog, rows: issuable });
  const notDeployed = !!state.error && isProposalQueueMissing(state.error);

  const afterDecision = useCallback(() => {
    load();
    emitAttendanceChanged(ATTENDANCE_EVENTS.LETTER_PROPOSAL, { plane: plane.key });
  }, [load, plane.key]);

  const onProposed = (res) => {
    setProposing(false);
    showToast("Sent to HR. You’ll see their decision here — nothing has reached your team member yet.");
    afterDecision();
    const created = res?.data?.proposal || res?.proposal;
    if (created?.id) setDetail(created);
  };

  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const isHr = plane.key === "hr";

  const body = (
    <main className={`flex-1 ${embedded ? "" : "p-4 sm:p-6 lg:p-8"} max-w-7xl w-full mx-auto space-y-6`}>
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{TITLE}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {isHr
                ? "Letters your managers have asked you to issue. Approving one issues the real letter; turning it down issues nothing."
                : "Letters you’ve asked HR to issue to someone on your team. HR decides — nothing reaches them until it is approved."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button" onClick={load} disabled={state.loading}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50"
              aria-label="Refresh" title="Refresh"
            >
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
            </button>
            {mayPropose && (
              <button type="button" onClick={() => setProposing(true)} className={PRIMARY_BTN}>
                <HiMail className="w-4 h-4" /> Ask for a letter
              </button>
            )}
          </div>
        </div>
      )}

      {notDeployed ? (
        <p className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 leading-relaxed" role="status">
          <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">Letter proposals aren’t available on your server yet.</span>{" "}
            They arrive with the next update. Nothing is wrong with your data, and letters can still be issued one at a time as usual.
          </span>
        </p>
      ) : (
        <>
          {!isHr && catalog.loaded && !mayPropose && !pathClosed && (
            <p className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-relaxed">
              <HiInformationCircle className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
              <span>
                <span className="font-bold">Your organisation hasn’t opened letter drafting to managers.</span>{" "}
                Ask HR to switch it on if you need to draft letters for your team — anything you’ve already asked for stays on this page.
              </span>
            </p>
          )}

          {pathClosed && (
            <p className="flex items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900 leading-relaxed" role="status">
              <HiInformationCircle className="w-5 h-5 text-fuchsia-500 shrink-0 mt-0.5" />
              <span>
                <span className="font-bold">Letter drafting has been switched off for managers.</span>{" "}
                Nothing you’ve already asked for is affected — HR can still decide it.
              </span>
            </p>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <FilterTabs
              className="shrink-0 self-start"
              options={PROPOSAL_STATUS_FILTERS}
              value={status}
              onChange={(next) => { setStatus(next); setPage(1); }}
            />
            {state.total > 0 && (
              <p className="text-xs text-slate-400">
                {state.total} {state.total === 1 ? "proposal" : "proposals"}{status ? " in this view" : ""}
              </p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            {state.error ? (
              <DocErrorState error={state.error} onRetry={load} fallback="Couldn’t load letter proposals." />
            ) : state.loading && state.rows.length === 0 ? (
              <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : state.rows.length === 0 ? (
              <DocEmptyState
                icon={status === "pending" ? HiInbox : HiDocumentText}
                title={emptyTitle(isHr, status)}
                message={emptyMessage(isHr, status)}
                action={mayPropose && status === "pending" ? (
                  <button type="button" onClick={() => setProposing(true)} className={PRIMARY_BTN}>
                    <HiMail className="w-4 h-4" /> Ask for a letter
                  </button>
                ) : null}
              />
            ) : (
              <div className={state.loading ? "opacity-60" : ""}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Letter</th>
                        <th className="px-5 py-3.5">For</th>
                        <th className="px-5 py-3.5">Asked for by</th>
                        <th className="px-5 py-3.5">Asked for</th>
                        <th className="px-5 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {state.rows.map((row) => {
                        const meta = proposalStateMeta(row.status);
                        return (
                          <tr
                            key={row.id}
                            {...rowPreviewProps(() => setDetail(row), "Open this proposal")}
                            className="hover:bg-purple-50/30 transition-colors cursor-pointer outline-none focus:bg-purple-50/40"
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                  <HiDocumentText className="w-4 h-4" />
                                </span>
                                <p className="font-semibold text-slate-800 truncate max-w-[220px]">{letterNameOf(row.template_code)}</p>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{nameOf(row.subject_user_id, "")}</p>
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">
                                {isHr ? nameOf(row.proposed_by, "") : "You"}
                              </p>
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="text-xs font-semibold text-slate-700">{row.created_at ? fmtDate(row.created_at) : "N/A"}</p>
                              {row.decided_at && <p className="text-[10px] text-slate-400">Decided {fmtDate(row.decided_at)}</p>}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate}`}
                                title={meta.hint}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
                                {meta.short}
                              </span>
                            </td>
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
                      totalPages={totalPages}
                      total={state.total}
                      limit={PAGE}
                      onPageChange={setPage}
                      disabled={state.loading}
                      noun="proposal"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {isHr && !embedded && (
            <p className="text-xs text-slate-400">
              Whether managers may draft letters at all is set in{" "}
              <Link to={SETTINGS_PATH} className="font-bold text-purple-600 hover:underline">Document Settings</Link>.
            </p>
          )}
        </>
      )}
    </main>
  );

  return (
    <>
      {!embedded && <DashboardTopBar title={TITLE} />}
      {body}

      {detail && (
        <LetterProposalDetailDialog
          proposal={detail}
          plane={plane}
          letterNameOf={letterNameOf}
          nameOf={nameOf}
          isSelf={!isHr}
          showToast={showToast}
          onChanged={afterDecision}
          onClose={() => setDetail(null)}
        />
      )}

      {proposing && (
        <ProposeLetterDialog
          api={documentsAPI}
          plane={plane}
          templates={issuable}
          people={people}
          peopleStatus={peopleStatus}
          onProposed={onProposed}
          onDisabled={() => setPathClosed(true)}
          onClose={() => setProposing(false)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

function emptyTitle(isHr, status) {
  if (status === "pending") return isHr ? "Nothing waiting on you" : "You haven’t asked for anything";
  if (status === "approved") return "Nothing has been issued this way yet";
  if (status === "rejected") return "Nothing has been turned down";
  return isHr ? "No proposals yet" : "You haven’t asked for anything";
}

function emptyMessage(isHr, status) {
  if (status === "approved") return "When a proposal is approved, the letter it issued is listed here and on the register.";
  if (status === "rejected") return "A proposal that is turned down stays here with the reason it was turned down.";
  return isHr
    ? "When a manager asks you to issue a letter for someone on their team, it waits here for your decision."
    : "Ask HR for a letter for someone on your team and it waits here until they decide.";
}
