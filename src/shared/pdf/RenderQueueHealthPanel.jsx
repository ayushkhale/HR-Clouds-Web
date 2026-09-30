// ─────────────────────────────────────────────────────────────────────────────
// RenderQueueHealthPanel.jsx — One readout for both PDF render queues:
// letters (#151, on Document Automation) and payslips (#221, on Payroll
// Automation). PDF Generation Phase 5.
//
// It is one component taking a `scope` rather than two screens, for the same
// reason a shared screen takes a `viewer` (CLAUDE.md §2): the two endpoints
// answer field for field, and an operator who learns to read one must not have
// to relearn the other. Only the noun and the fetcher differ.
//
// Why it lives on the automation pages instead of getting a sidebar entry: this
// is the sixth background job, read rather than run, and both automation pages
// already answer "what runs by itself, and is it working?". A monitor with its
// own nav item is a page nobody opens until something is wrong, and by then
// they don't know it exists.
//
// Three rules this panel follows that are easy to get wrong:
//
//  · IT DISAPPEARS RATHER THAN FAILING. A server without Phase 5 answers 404;
//    an organisation without the feature answers 403. Neither is news, so the
//    panel unmounts itself (`onUnavailable`) and the page looks exactly as it
//    did before Phase 5. Only a real failure is reported (§7).
//
//  · IT NEVER POLLS. The figures move on a fifteen-minute worker, so a poll
//    would be hundreds of reads per change, and this sits on a page people
//    leave open. One read on arrival, one per press of Refresh, and one after a
//    drain — which is the only moment the numbers are guaranteed to have moved.
//
//  · NO FIGURE IS DRAWN THAT THE SERVER DIDN'T SEND. An empty window reports
//    "nothing finished yet", not 0% (see renderHealthMeta's note 1), and a
//    queue with nothing in it reports N/A for the longest wait, never 0m —
//    because 0m would mean something IS waiting.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiChartBar, HiCheckCircle, HiChevronDown, HiClock, HiExclamationCircle,
  HiLightningBolt, HiPlay, HiRefresh,
} from "react-icons/hi";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import {
  backlogMeta, counterRows, failureRateMeta, HEALTH_WINDOW_DEFAULT, HEALTH_WINDOWS,
  healthWindowLabel, oldestWaitLabel, queueHealthOf, queueHealthUnavailable, rendererStateMeta,
} from "./renderHealthMeta";

// §5: violet = good, fuchsia = worth a look, indigo = neutral information,
// rose = actually wrong, slate = nothing to say.
const TONE = {
  violet: { chip: "bg-violet-50 text-violet-700 border-violet-200", value: "text-violet-700" },
  fuchsia: { chip: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", value: "text-fuchsia-700" },
  indigo: { chip: "bg-indigo-50 text-indigo-700 border-indigo-200", value: "text-indigo-700" },
  rose: { chip: "bg-rose-50 text-rose-700 border-rose-200", value: "text-rose-700" },
  slate: { chip: "bg-slate-100 text-slate-600 border-slate-200", value: "text-slate-500" },
};

const tone = (key) => TONE[key] || TONE.slate;

// Kept here rather than imported from shared/documents/ui: this panel is
// mounted by payroll as well, and a payroll screen should not have to reach
// into the documents folder for a border radius.
const SELECT = "h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:border-purple-400 outline-none";

/** One figure, with its meaning under it. Never a bare number. */
function Tile({ label, value, valueTone = "slate", note, help }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 min-w-0">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        <HelpLabel text={label} help={help} />
      </p>
      <p className={`text-2xl font-bold mt-1.5 tabular-nums ${tone(valueTone).value}`}>{value}</p>
      {note && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {"letter"|"payslip"} props.scope
 * @param {string} props.noun                        plural, in the reader's words ("letters")
 * @param {string} props.title
 * @param {string} props.blurb
 * @param {(params: object) => Promise<object>} props.load   #151 or #221
 * @param {() => Promise<string>} [props.onDrain]    "prepare them now", returning a sentence
 * @param {string} [props.drainLabel]
 * @param {string} [props.drainConfirm]
 * @param {string} props.helpSurface                 fieldHelp surface id for the tiles
 * @param {(message: string, kind?: string) => void} [props.showToast]
 * @param {() => void} [props.onUnavailable]         this server hasn't got it — hide the panel
 * @param {(err: unknown, fallback: string) => string} props.errorMessage  the domain's *Errors.js
 */
export default function RenderQueueHealthPanel({
  scope, noun, title, blurb, load, onDrain, drainLabel = "Prepare them now", drainConfirm = "",
  helpSurface, showToast, onUnavailable, errorMessage,
}) {
  const [windowHours, setWindowHours] = useState(HEALTH_WINDOW_DEFAULT);
  const [health, setHealth] = useState(null);
  const [state, setState] = useState("loading");   // loading | ready | error
  const [error, setError] = useState(null);
  const [draining, setDraining] = useState(false);

  // A window change while the previous read is in flight must not be overwritten
  // by the older answer landing second.
  const reqRef = useRef(0);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  const refresh = useCallback(async (hours) => {
    const token = ++reqRef.current;
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const data = queueHealthOf(await load({ window_hours: hours }));
      if (token !== reqRef.current) return;
      setHealth(data);
      setError(null);
      setState("ready");
    } catch (err) {
      if (token !== reqRef.current) return;
      // Not deployed, or not this organisation's feature. Say nothing at all.
      if (queueHealthUnavailable(err)) { unavailableRef.current?.(); return; }
      setError(err);
      setState("error");
    }
  }, [load]);

  useEffect(() => { refresh(windowHours); }, [refresh, windowHours]);

  const drain = async () => {
    if (!onDrain || draining) return;
    if (drainConfirm && !(await window.confirm(drainConfirm))) return;
    setDraining(true);
    try {
      const message = await onDrain();
      if (message) showToast?.(message, "success");
      await refresh(windowHours);
    } catch (err) {
      showToast?.(errorMessage(err, `Couldn’t prepare the ${noun} waiting.`), "error");
    } finally {
      setDraining(false);
    }
  };

  const help = (field) => ({ surface: helpSurface, field, size: "sm" });

  if (state === "loading" && !health) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="h-5 w-56 bg-slate-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-slate-50 rounded-2xl animate-pulse" />)}
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert">
        <div className="flex items-start gap-3">
          <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-rose-800">{title}</h3>
            <p className="text-sm text-rose-700 mt-0.5 leading-relaxed">
              {errorMessage(error, `Couldn’t read how the ${noun} are getting on.`)}
            </p>
            <button type="button" onClick={() => refresh(windowHours)} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition">
              <HiRefresh className="w-4 h-4" /> Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  const renderer = rendererStateMeta(health.renderer, { noun });
  const backlog = backlogMeta(health.queue, { noun });
  const failure = failureRateMeta(health.failureRate, { windowHours: health.windowHours });
  const counters = counterRows(health.counters);
  const one = noun.replace(/s$/, "");

  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-xs p-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <HiChartBar className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-xl">{blurb}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${tone(renderer.tone).chip}`}>
            {renderer.key === "ready" ? <HiCheckCircle className="w-3.5 h-3.5" /> : <HiExclamationCircle className="w-3.5 h-3.5" />}
            {renderer.label}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${tone(backlog.tone).chip}`}>
            <HiClock className="w-3.5 h-3.5" />
            {backlog.headline}
          </span>
          <label className="sr-only" htmlFor={`rqh-${scope}-window`}>How far back to look</label>
          <select
            id={`rqh-${scope}-window`}
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
            className={SELECT}
          >
            {HEALTH_WINDOWS.map((w) => <option key={w.hours} value={w.hours}>{w.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => refresh(windowHours)}
            disabled={state === "loading"}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <HiRefresh className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <p className={`mt-4 text-xs leading-relaxed rounded-xl border px-3.5 py-2.5 ${tone(renderer.tone).chip}`}>
        {renderer.note}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
        <Tile
          label="Waiting to be drawn"
          value={health.queue.queued}
          valueTone={backlog.tone}
          note={backlog.note}
          help={help("queued")}
        />
        <Tile
          label="Longest wait"
          value={oldestWaitLabel(health.queue)}
          valueTone={backlog.tone}
          // Keyed on `queued`, not on `waiting`: a job a worker has already
          // picked up leaves the queue, so it has no wait left to measure.
          note={health.queue.queued === 0
            ? "Nothing is waiting, so there is no wait to measure."
            : `How long the ${one} at the front of the queue has been waiting.`}
          help={help("oldest_queued_age_seconds")}
        />
        <Tile
          label="Being drawn now"
          value={health.queue.claimed}
          valueTone="indigo"
          note={health.queue.claimed === 0
            ? "Nothing is in hand this moment."
            : "Picked up and in progress. These finish on their own."}
        />
        <Tile
          label={`Drawn in ${healthWindowLabel(health.windowHours).toLowerCase()}`}
          // A measured zero, not a missing figure — so it stays a number.
          value={health.failureRate.terminal}
          valueTone="slate"
          note={`Everything that finished, one way or the other, in ${healthWindowLabel(health.windowHours).toLowerCase()}.`}
        />
        <Tile
          label="Didn’t come out"
          value={health.failureRate.failed}
          valueTone={health.failureRate.failed > 0 ? "rose" : "violet"}
          note={health.failureRate.failed === 0
            ? "Nothing failed in this window."
            : "Each batch lists its own, and says why."}
        />
        <Tile
          label="Share that failed"
          value={failure.value}
          valueTone={failure.tone}
          note={failure.note}
          help={help("failure_rate")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        {onDrain && (
          <button type="button" onClick={drain} disabled={draining} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
            {draining ? <HiLightningBolt className="w-4 h-4 animate-pulse" /> : <HiPlay className="w-4 h-4" />}
            {draining ? "Preparing…" : drainLabel}
          </button>
        )}
        <p className="text-[11px] text-slate-500 leading-relaxed max-w-xl">
          <HiClock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 text-slate-400" />
          Whatever is waiting is drawn by itself within about fifteen minutes. The button is only for when you’d rather not wait — it never produces a second copy of anything.
        </p>
      </div>

      {counters.length > 0 && (
        <details className="mt-4 group">
          <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-500 uppercase tracking-wider list-none">
            <HiChevronDown className="w-3.5 h-3.5 transition group-open:rotate-180" />
            Technical counters
          </summary>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
            {health.countersNote
              || "Counted by whichever server answered, and started again from zero each time the platform is updated — so these are for a support conversation, not for a report. The figures above come from the records themselves."}
          </p>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {counters.map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-3 text-[11px] text-slate-500 border-b border-slate-50 py-1">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-slate-600">{row.name}</span>
                  {row.tags && <span className="text-slate-400"> · {row.tags}</span>}
                </span>
                <span className="tabular-nums font-bold text-slate-600 shrink-0">{row.value.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
