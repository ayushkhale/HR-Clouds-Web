// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterBatchDialog.jsx — How far a batch of letters has got
// (#144), and the one button that hurries it along (#147).
//
// This is data, not a form, so it is the house record inspector (CLAUDE.md §3)
// rather than a hand-rolled modal.
//
// The whole screen exists because #143 issues nothing while you wait: it
// queues, and a worker draws the letters over the following minutes. Four
// things follow from that:
//
//  · IT POLLS, AND IT STOPS. Every few seconds while the batch is moving, never
//    once it has finished, and never while the tab is in the background — a
//    forgotten tab must not poll a server all afternoon.
//
//  · LEAVING IS SAFE, AND IT SAYS SO. The commonest fear with a batch of two
//    hundred is that closing the window cancels it. It doesn't, and the panel
//    says as much rather than trapping anybody here.
//
//  · A FAILED ITEM IS NOT A FAILED BATCH. The ones that didn't draw are listed
//    with a reason each, because the fix is per person (a missing date of
//    joining, say) and the rest of the batch is already issued. Re-running the
//    whole batch is never the answer, and is never offered.
//
//  · WHO FAILED IS A NAME. The ledger gives a `subject_user_id` and nothing
//    else, so it is resolved through the roster and reads "Loading…" until it
//    is (CLAUDE.md §4).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiCheckCircle, HiClock, HiCollection, HiExclamationCircle, HiLightningBolt, HiRefresh, HiXCircle,
} from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailPill, DetailSection, DetailStats, DetailTable,
} from "../components/DetailDialog";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { fmtDateTime } from "../attendance/dates";
import { documentErrorMessage } from "../utils/documentErrors";
import { PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import {
  BATCH_POLL_IDLE_MS, BATCH_POLL_MS, batchFailureMessage, batchProgressOf, batchStateMeta, drainMessage,
  drainSummaryOf,
} from "./letterProposalMeta";

const FAILURE_PAGE = 50;

/**
 * @param {object} props
 * @param {object} props.api                     documentsAPI
 * @param {string} props.batchId                 the handle from #143 — never rendered
 * @param {string} [props.templateTitle]         which letter this batch is, in words
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onSettled]         the batch reached a terminal state
 * @param {(id: string) => void} [props.onMissing] the id no longer resolves (404)
 * @param {() => void} props.onClose
 */
export default function LetterBatchDialog({
  api, batchId, templateTitle = "", nameOf, showToast, onSettled, onMissing, onClose,
}) {
  const [state, setState] = useState({ progress: null, loading: true, error: null });
  const [draining, setDraining] = useState(false);

  const reqRef = useRef(0);
  // Reset on every mount, not just declared once: React 18 mounts, unmounts and
  // remounts an effect in development, and a flag only ever set to false on
  // cleanup stays false for the remount — leaving the panel on "Loading…" for
  // good while the reads underneath quietly succeed.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    const token = ++reqRef.current;
    try {
      const progress = batchProgressOf(await api.getLetterBatch(batchId, { limit: FAILURE_PAGE, offset: 0 }));
      if (!aliveRef.current || token !== reqRef.current) return progress;
      setState({ progress, loading: false, error: null });
      return progress;
    } catch (error) {
      if (aliveRef.current && token === reqRef.current) {
        setState((s) => ({ ...s, loading: false, error }));
        // A handle that no longer resolves is a batch this browser should stop
        // offering — it was cleared server-side, or belongs to another org.
        if (Number(error?.status) === 404) onMissing?.(batchId);
      }
      return null;
    }
  }, [api, batchId, onMissing]);

  useEffect(() => { load(); }, [load]);

  /**
   * The poll. One timer, rescheduled after each answer rather than an interval,
   * so a slow reply can never stack requests on top of each other. It pauses
   * with the tab (`visibilityState`) and ends for good once the batch settles.
   */
  const settledRef = useRef(false);
  useEffect(() => {
    let timer = null;
    let stopped = false;

    // A batch nobody has started drawing yet can't change in four seconds, so
    // it is asked about far less often than one that is actively rendering.
    const delay = () => (state.progress?.status === "queued" ? BATCH_POLL_IDLE_MS : BATCH_POLL_MS);

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        const progress = await load();
        if (progress?.terminal) {
          if (!settledRef.current) {
            settledRef.current = true;
            onSettled?.();
          }
          return;   // nothing will move again; the timer is not rescheduled
        }
      }
      if (!stopped) timer = setTimeout(tick, delay());
    };

    if (!state.progress?.terminal) timer = setTimeout(tick, delay());
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [load, state.progress?.status, state.progress?.terminal, onSettled]);

  /** #147 — draw what is waiting now instead of at the worker's next pass. */
  const prepareNow = async () => {
    if (draining) return;
    setDraining(true);
    try {
      const summary = drainSummaryOf(await api.runLetterRenderQueue({ batch_id: batchId }));
      showToast?.(drainMessage(summary));
      await load();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn’t start drawing these letters just now."));
    } finally {
      if (aliveRef.current) setDraining(false);
    }
  };

  const progress = state.progress;
  const meta = batchStateMeta(progress?.status);
  const counts = progress?.counts || { pending: 0, issued: 0, failed: 0, skipped: 0, total: 0 };
  const moving = !!progress && !progress.terminal;

  return (
    <DetailDialog
      eyebrow="Letters sent to many"
      title={templateTitle || "Batch of letters"}
      subtitle={progress?.createdAt ? `Started ${fmtDateTime(progress.createdAt)}` : undefined}
      icon={HiCollection}
      badge={progress ? (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate}`} title={meta.hint}>
          <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate} ${moving ? "animate-pulse" : ""}`} aria-hidden="true" />
          {meta.label}
        </span>
      ) : null}
      loading={state.loading && !progress}
      onClose={onClose}
      footer={(
        <>
          <DetailFooterNote>
            {moving
              ? "You can close this — the letters carry on being prepared without you."
              : counts.failed > 0
                ? "Issue the ones that were left out one at a time, once you’ve fixed what each needs."
                : "Every letter in this batch is on your register."}
          </DetailFooterNote>
          <button type="button" onClick={() => load()} disabled={state.loading} className={SECONDARY_BTN}>
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          {moving && (
            <button type="button" onClick={prepareNow} disabled={draining} className={PRIMARY_BTN}>
              <HiLightningBolt className="w-4 h-4" /> {draining ? "Starting…" : "Prepare them now"}
            </button>
          )}
          {!moving && (
            <button type="button" onClick={onClose} className={PRIMARY_BTN}>
              <HiCheckCircle className="w-4 h-4" /> Done
            </button>
          )}
        </>
      )}
    >
      {state.error && !progress ? (
        <p className="flex items-start gap-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
          <HiExclamationCircle className="w-5 h-5 shrink-0" />
          {Number(state.error?.status) === 404
            ? "This batch isn’t on the server any more, so there is nothing left to follow. Anything it issued is on your register."
            : documentErrorMessage(state.error, "Couldn’t check how far this batch has got.")}
        </p>
      ) : progress ? (
        <>
          <ProgressBar percent={progress.percent} moving={moving} settled={progress.settled} total={counts.total} />

          <DetailStats
            items={[
              { label: "People in this batch", value: counts.total, icon: HiCollection },
              { label: "Issued", value: counts.issued, icon: HiCheckCircle },
              { label: "Still to draw", value: counts.pending, icon: HiClock },
              { label: "Left out", value: counts.failed + counts.skipped, icon: HiXCircle },
            ]}
          />

          {state.error && (
            <p className="text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3.5 py-2.5" role="status">
              The last check didn’t get through, so these figures may be a moment behind.
            </p>
          )}

          {counts.failed + counts.skipped > 0 && (
            <DetailSection
              title={`Left out (${progress.failureTotal || progress.failures.length})`}
              icon={HiXCircle}
              collapsible={false}
            >
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                These didn’t go out. Everyone else in the batch has their letter. Fix what each one needs and issue those on their own — sending the batch again would give everybody else a second copy.
              </p>
              <DetailTable
                columns={[
                  {
                    header: "Person",
                    render: (row) => nameOf?.(row.subjectUserId, "") || "Loading…",
                  },
                  {
                    header: "Why it didn’t go out",
                    render: (row) => <span className="text-slate-700 leading-relaxed">{batchFailureMessage(row)}</span>,
                  },
                  {
                    header: "When",
                    render: (row) => (row.at ? fmtDateTime(row.at) : null),
                  },
                ]}
                rows={progress.failures}
                rowKey={(row, i) => row.id || row.subjectUserId || i}
                empty="Nothing was left out."
              />
              {progress.failureTotal > progress.failures.length && (
                <p className="text-[11px] text-slate-400 mt-2">
                  Showing the first {progress.failures.length} of {progress.failureTotal}.
                </p>
              )}
            </DetailSection>
          )}

          <DetailSection title="What happens next" icon={HiClock} defaultOpen={moving}>
            <p className="text-xs text-slate-600 leading-relaxed">
              {meta.hint}
              {moving && " Letters are drawn a few at a time in the background; “Prepare them now” starts that immediately rather than waiting for the next pass."}
            </p>
            {progress.completedAt && (
              <p className="text-xs text-slate-500 mt-2">Finished {fmtDateTime(progress.completedAt)}.</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <DetailPill tone="muted">Every letter is numbered as it is issued</DetailPill>
              <DetailPill tone="muted">Nobody is sent two copies</DetailPill>
            </div>
          </DetailSection>
        </>
      ) : null}
    </DetailDialog>
  );
}

/** How far through, as one bar. Indeterminate-looking while work is in flight. */
function ProgressBar({ percent, moving, settled, total }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-sm font-bold text-slate-800">
          {settled} of {total} {total === 1 ? "letter" : "letters"} finished
        </p>
        <p className="text-xs font-bold text-purple-600 tabular-nums">{percent}%</p>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full bg-purple-500 transition-[width] duration-500 ${moving ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(percent, percent > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}
