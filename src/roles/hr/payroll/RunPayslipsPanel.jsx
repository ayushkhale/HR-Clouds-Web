// ─────────────────────────────────────────────────────────────────────────────
// RunPayslipsPanel — payslip delivery for one payroll run (#167, #171, #172,
// #174, #175, #176, #181).
//
// Payslips are frozen at approval. Whether employees can *see* them is a
// separate switch: with "release on approval" off they sit held until HR
// publishes here. Emails are a queue — publishing marks them pending and the
// backend drains them; HR can force a batch or retry failures.
//
// The bank file is deliberately the last step: it only exists for a paid run.
//
// PDF Generation Phase 3 adds one branch to this panel, and only for an
// organisation that has switched to the new render engine (payroll setting #87,
// off everywhere by default). On the classic engine nothing below changes: the
// same buttons, the same ZIP, the same behaviour as before.
//
// On the new engine, released payslips are prepared once and kept, so:
//
//  · DOWNLOAD ALL MAY NOT HAND BACK A FILE. When a run has more unprepared
//    payslips than the organisation's threshold, #174 answers `202` — "I have
//    started preparing these" — with a batch to poll. That is a success, and
//    `response.ok` is true for it, so the download goes through `acceptJson`
//    (see shared/utils/download.js) or the browser would save the JSON as a
//    corrupt .zip. This panel then polls #220 and downloads for real once the
//    run is ready.
//  · PREPARE PDFS (#219) warms a run up on demand rather than waiting for the
//    quarter-hourly background job. Safe to press repeatedly.
//  · A HELD payslip is never prepared — it is drawn fresh on download, always by
//    the classic engine. #220 counts those as `uncacheable`, which is why
//    readiness is the server's `will_stream` and never `ready === total`.
//
// #219 and #220 were verified against the live API on 2026-09-28 and behave as
// documented. The bodyless-404 guard stays anyway: this app is deployed against
// more than one environment, and a server that has the settings but not yet the
// queue routes must hide the two tools rather than show a payroll error for
// something nobody did. The ZIP button keeps working either way.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { payrollAPI, payrollFiles } from "../../../shared/api";
import { downloadFile } from "../../../shared/utils/download";
import { isPayrollRouteMissing, payrollErrorMessage } from "../../../shared/utils/payrollErrors";
import { formatDate, formatMoney, formatPeriod } from "../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../shared/attendance/normalize";
import {
  EMAIL_MAX_ATTEMPTS, EMAIL_STATUS, EMAIL_STATUS_FILTERS, PAYSLIP_STATUS,
  PAYSLIP_STATUS_FILTERS, PAYSLIP_VISIBILITY_FILTERS, meta, payslipVisibility,
} from "./phase6Meta";
import {
  HiCash, HiCheckCircle, HiChevronLeft, HiChevronRight, HiDocumentDownload,
  HiExclamationCircle, HiEye, HiLightningBolt, HiMail, HiRefresh, HiSearch, HiUpload,
} from "react-icons/hi";
import {
  RENDER_POLL_MAX_TICKS, RENDER_POLL_MS, drainMessage, drainResultOf, enqueuedBatchOf,
  isFullyPrepared, renderPercent, renderStatusLine, renderStatusOf, serverIsClassic,
  stillPreparing, uncacheableNote, usesHtmlEngine, wasEnqueued,
} from "./pdfRenderMeta";
import { STATUS_CHIP } from "../../../shared/utils/statusChip";

const PAGE_SIZE = 25;
const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : formatMoney(v));

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />;
}

/**
 * How far along this run's payslip PDFs are (#220), and what that means for the
 * person who just pressed Download all.
 *
 * Counts are secondary. The headline is the only thing anybody needs: can I
 * download the lot right now, or am I waiting? Progress is shown only while
 * something is actually being prepared — a finished bar sitting at 100% for ever
 * is noise.
 */
function RenderStatusStrip({ status, batch, note }) {
  const waiting = !!batch || stillPreparing(status) > 0;
  const percent = renderPercent(status);
  const ready = isFullyPrepared(status);
  const uncacheable = uncacheableNote(status);

  return (
    <div className={`px-5 py-3 border-b ${waiting ? "border-indigo-100 bg-indigo-50/60" : ready ? "border-violet-100 bg-violet-50/50" : "border-slate-100 bg-slate-50/60"}`}>
      <div className="flex items-start gap-2.5">
        {waiting
          ? <span className="mt-0.5 shrink-0"><Spinner /></span>
          : ready
            ? <HiCheckCircle className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
            : <HiDocumentDownload className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold ${waiting ? "text-indigo-900" : ready ? "text-violet-900" : "text-slate-700"}`}>
            {waiting
              ? "Getting this run's payslips ready"
              : ready
                ? "Payslips are ready to download"
                : "Payslip PDFs"}
          </p>
          <p className={`text-[11px] mt-0.5 leading-relaxed ${waiting ? "text-indigo-800" : "text-slate-600"}`}>
            {note || renderStatusLine(status) || "Checking…"}
            {waiting && !note && " You can leave this page — the download starts on its own when it's done."}
          </p>

          {waiting && percent !== null && (
            <div className="mt-2 flex items-center gap-2.5">
              <div className="h-1.5 flex-1 max-w-xs rounded-full bg-indigo-100 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-[10px] font-bold tabular-nums text-indigo-700 shrink-0">{percent}%</span>
            </div>
          )}

          {uncacheable && !note && <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{uncacheable}</p>}
        </div>
      </div>
    </div>
  );
}

export default function RunPayslipsPanel({ run, showToast }) {
  const runId = run?.id;
  const status = run?.status;
  const isPaid = status === "paid";
  const closed = status === "approved" || status === "paid";

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: null, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dispatch, setDispatch] = useState(null);

  // ── PDF Generation Phase 3 ────────────────────────────────────────
  // `settings` is read once, best-effort: if it can't be read the panel behaves
  // exactly as it did before Phase 3, which is the safe answer rather than a
  // degraded one.
  const [settings, setSettings] = useState(null);
  const [renderStatus, setRenderStatus] = useState(null);
  // Set only while a #174 call has been queued rather than answered with a file.
  const [batch, setBatch] = useState(null);
  const [pollNote, setPollNote] = useState("");
  // True once the server has no #219/#220 to answer with — the tools hide and
  // everything else keeps working.
  const [queueMissing, setQueueMissing] = useState(false);
  const pollTicks = useRef(0);
  // One automatic download per batch, however many times the poller says ready.
  const autoDownloaded = useRef(false);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", visible_to_employee: "", email_status: "" });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Typing shouldn't fire a request per keystroke; the index is server-filtered.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [filters, search]);

  const load = useCallback(async () => {
    if (!runId || !closed) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      if (search) params.q = search;
      const res = await payrollAPI.getRunPayslips(runId, params);
      const list = normalizePaginated(res, ["payslips", "records"], { page, limit: PAGE_SIZE });
      setRows(list.items);
      setPagination({ page: list.page, total: list.total, totalPages: list.totalPages });
    } catch (err) {
      setRows([]);
      setError(payrollErrorMessage(err, "Couldn't load the payslips for this run"));
    } finally {
      setLoading(false);
    }
  }, [runId, closed, page, filters, search]);

  const loadDispatch = useCallback(async () => {
    if (!runId || !closed) return;
    try {
      const res = await payrollAPI.getRunDispatchStatus(runId);
      setDispatch(res?.data || null);
    } catch {
      // The email queue is secondary; its absence must not blank the panel.
      setDispatch(null);
    }
  }, [runId, closed]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDispatch(); }, [loadDispatch]);

  // ── PDF Generation Phase 3: engine, queue and the async ZIP ──────────────
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getSettings()
      .then((res) => { if (!cancelled) setSettings(res?.data || null); })
      // Not readable? Then this organisation is treated as classic and the panel
      // is exactly what it was before Phase 3. Nothing to report to anyone.
      .catch(() => { if (!cancelled) setSettings(null); });
    return () => { cancelled = true; };
  }, []);

  const htmlEngine = usesHtmlEngine(settings);
  const queueReady = htmlEngine && !queueMissing;

  /**
   * #220. Returns the status so the poller can act on it without waiting for a
   * re-render, and swallows failures: this is a progress indicator, and losing
   * it must not take the panel down or interrupt a download.
   */
  const loadRenderStatus = useCallback(async (batchId) => {
    if (!runId || !closed) return null;
    try {
      const status = renderStatusOf(await payrollAPI.getPayslipRenderStatus(runId, batchId ? { batch_id: batchId } : undefined));
      setRenderStatus(status);
      return status;
    } catch (err) {
      if (isPayrollRouteMissing(err)) setQueueMissing(true);
      setRenderStatus(null);
      return null;
    }
  }, [runId, closed]);

  useEffect(() => {
    if (!queueReady) { setRenderStatus(null); return; }
    loadRenderStatus();
  }, [queueReady, loadRenderStatus]);

  // Withdrawn and replaced payslips are hidden for good, not "held" — Publish can't release them.
  const heldCount = useMemo(() => rows.filter((r) => payslipVisibility(r).held).length, [rows]);
  const counts = dispatch?.counts || {};
  const failedEmails = Number(counts.failed) || 0;
  const pendingEmails = (Number(counts.pending) || 0) + (Number(counts.sending) || 0);

  const act = async (key, fn, success) => {
    setBusy(key);
    setError("");
    try {
      const res = await fn();
      showToast(success(res?.data || {}));
      await Promise.all([load(), loadDispatch()]);
      // Releasing a run quietly queues its payslips for preparing (setting #88),
      // and rebuilding changes which payslips exist at all — so the readiness
      // counts are no longer what they were a moment ago.
      if (queueReady) loadRenderStatus();
    } catch (err) {
      const message = payrollErrorMessage(err, "That didn't work");
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy("");
    }
  };

  const publish = () => act(
    "publish",
    () => payrollAPI.publishRunPayslips(runId),
    (d) => (Number(d.payslips_published) > 0
      ? `${d.payslips_published} payslip${Number(d.payslips_published) === 1 ? "" : "s"} released to employees.`
      : "Every payslip in this run was already released."),
  );

  const backfill = () => act(
    "backfill",
    () => payrollAPI.backfillRunPayslips(runId),
    (d) => (Number(d.created ?? d.payslips_created) > 0
      ? `${d.created ?? d.payslips_created} payslip${Number(d.created ?? d.payslips_created) === 1 ? "" : "s"} rebuilt from this run.`
      : "Nothing to rebuild — every employee already has a frozen payslip."),
  );

  const sendEmails = () => act(
    "dispatch",
    () => payrollAPI.dispatchRunPayslips(runId, { include_failed: true }),
    (d) => `${d.sent ?? d.processed ?? 0} notification${(d.sent ?? d.processed) === 1 ? "" : "s"} sent.`,
  );

  const download = async (key, path, filename) => {
    setBusy(key);
    setError("");
    try {
      await downloadFile(path, { filename });
      showToast("Download started.");
      loadDispatch();
    } catch (err) {
      const message = payrollErrorMessage(err, "Couldn't prepare that download");
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy("");
    }
  };

  // ── Phase 3: the bulk ZIP, which may be queued instead of streamed ───────
  const zipName = `payslips-${run?.period_month || runId}.zip`;

  /**
   * #174. `acceptJson` is what keeps a `202` from being written to disk as a
   * corrupt archive — see the header and shared/utils/download.js.
   *
   * @param {boolean} [silent] true for the automatic download the poller fires
   *   once a queued run is ready; it must not report "Download started" over the
   *   message that says the wait is over.
   */
  const downloadZip = useCallback(async (silent = false) => {
    if (!silent) { setBusy("zip"); setError(""); }
    try {
      const result = await downloadFile(payrollFiles.hrRunPayslipsZip(runId), { filename: zipName, acceptJson: true });

      if (wasEnqueued(result)) {
        // Too many payslips still to prepare. Nothing was downloaded and nothing
        // is wrong; the run is being prepared and we watch it.
        const started = enqueuedBatchOf(result.data);
        pollTicks.current = 0;
        autoDownloaded.current = false;
        setBatch(started);
        setPollNote("");
        showToast(started.queued > 0
          ? `Preparing ${started.queued} payslip${started.queued === 1 ? "" : "s"}. The download starts on its own once they're ready.`
          : "Preparing this run's payslips. The download starts on its own once they're ready.");
        loadRenderStatus(started.batchId);
        return;
      }

      setBatch(null);
      setPollNote("");
      if (!silent) showToast("Download started.");
      loadDispatch();
      if (queueReady) loadRenderStatus();
    } catch (err) {
      const message = payrollErrorMessage(err, "Couldn't prepare that download");
      setError(message);
      showToast(message, "error");
      // A failure ends the wait: leaving the poller running would keep promising
      // a download that is no longer coming.
      setBatch(null);
    } finally {
      if (!silent) setBusy("");
    }
  }, [runId, zipName, showToast, loadDispatch, loadRenderStatus, queueReady]);

  /**
   * Watch a queued run until the server says a full ZIP will stream, then fetch
   * it once.
   *
   * Three things this has to get right:
   *  · `will_stream` is the server's verdict, never recomputed here — held
   *    payslips never become "ready" and a count-based test would poll for ever;
   *  · a hidden tab does not poll (nothing is lost; the next visible tick picks
   *    it up), so leaving the page open overnight costs nothing;
   *  · there is a ceiling. A queue that is genuinely stuck stops being polled
   *    and says so, instead of hammering the server until the tab is closed.
   */
  // Held in refs so the effect below can depend on the batch id alone. An
  // interval whose effect re-runs on every render is an interval that restarts
  // its own countdown and may never fire — and a poller that never fires is a
  // download that never arrives, with nothing on screen to say so.
  const pollRefs = useRef({});
  pollRefs.current = { loadRenderStatus, downloadZip, showToast };

  const batchId = batch?.batchId || "";
  useEffect(() => {
    if (!batch || !queueReady) return undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      // A hidden tab doesn't poll. Nothing is lost — the next visible tick picks
      // it up — and a page left open overnight costs the server nothing.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      pollTicks.current += 1;
      if (pollTicks.current > RENDER_POLL_MAX_TICKS) {
        if (cancelled) return;
        setBatch(null);
        setPollNote("These payslips are taking longer than expected, so we’ve stopped watching. Press Download all again — whatever was prepared is kept.");
        return;
      }
      const status = await pollRefs.current.loadRenderStatus(batchId);
      if (cancelled || !status) return;
      if (status.willStream && !autoDownloaded.current) {
        autoDownloaded.current = true;
        setBatch(null);
        setPollNote("");
        pollRefs.current.showToast("Ready — the ZIP is downloading now.");
        pollRefs.current.downloadZip(true);
      }
    };

    const timer = setInterval(tick, RENDER_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
    // `batch` itself is a dependency, not just its id: a 202 that came back
    // without a `batch_id` would otherwise leave `batchId` at "" and the poller
    // would never start. Plain state, only ever set by a real action, so it is
    // stable between renders.
  }, [batch, batchId, queueReady]);

  /** #219. Warms a run up on demand rather than waiting for the background job. */
  const preparePdfs = async () => {
    setBusy("prepare");
    setError("");
    try {
      const result = drainResultOf(await payrollAPI.runPayslipRender({ run_id: runId }));
      showToast(drainMessage(result));
      await loadRenderStatus(batch?.batchId);
    } catch (err) {
      if (isPayrollRouteMissing(err)) {
        setQueueMissing(true);
      } else {
        const message = payrollErrorMessage(err, "Couldn't prepare the payslip PDFs");
        setError(message);
        showToast(message, "error");
      }
    } finally {
      setBusy("");
    }
  };

  const downloadRowPdf = async (row) => {
    setBusy(`pdf-${row.payslip_id || row.user_id}`);
    try {
      await downloadFile(payrollFiles.hrPayslipPdf(row.user_id, runId), {
        params: row.version ? { version: row.version } : undefined,
        filename: `payslip-${row.employee_code || row.user_id}-${row.period_month || ""}.pdf`,
      });
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't download that payslip"), "error");
    } finally {
      setBusy("");
    }
  };

  if (!closed) {
    return (
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Payslips</h2>
        </div>
        <p className="px-5 py-8 text-sm text-slate-500 text-center">
          Payslips are created when the run is approved. Approve it to see them here.
        </p>
      </section>
    );
  }

  const period = formatPeriod(run?.period_month);

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-5 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Payslips &amp; delivery</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {pagination.total != null ? `${pagination.total} payslip${pagination.total === 1 ? "" : "s"} for ${period}` : `Payslips for ${period}`}
            {heldCount > 0 ? ` · ${heldCount} on this page held back` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={publish} disabled={!!busy} className="px-3 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-1.5 shadow-sm shadow-purple-200 disabled:opacity-50">
            {busy === "publish" ? <Spinner /> : <HiEye className="w-4 h-4" />} Release to employees
          </button>
          <button type="button" onClick={sendEmails} disabled={!!busy} title="Send queued notifications now, and retry failed ones" className="px-3 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "dispatch" ? <Spinner /> : <HiMail className="w-4 h-4" />} Send emails
          </button>
          <button type="button" onClick={() => downloadZip()} disabled={!!busy || !!batch} className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "zip" || batch ? <Spinner /> : <HiDocumentDownload className="w-4 h-4" />}
            {batch ? "Preparing…" : "Download all (ZIP)"}
          </button>
          {/* Only for an organisation on the new engine: on the classic one
              there is nothing to prepare, and #219 would answer zeros. */}
          {queueReady && (
            <button type="button" onClick={preparePdfs} disabled={!!busy || !!batch} title="Get this run's payslip PDFs ready now, so downloading them is instant" className="px-3 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
              {busy === "prepare" ? <Spinner /> : <HiLightningBolt className="w-4 h-4" />} Prepare PDFs
            </button>
          )}
          {isPaid && (
            <button type="button" onClick={() => download("bank", payrollFiles.hrBankAdvice(runId), `bank-advice-${run?.period_month || runId}.csv`)} disabled={!!busy} title="NEFT file for bulk upload to the bank" className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
              {busy === "bank" ? <Spinner /> : <HiCash className="w-4 h-4" />} Bank file (CSV)
            </button>
          )}
          <button type="button" onClick={backfill} disabled={!!busy} title="For a run approved before payslips existed — creates the frozen copies" className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-purple-700 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "backfill" ? <Spinner /> : <HiUpload className="w-4 h-4" />} Rebuild
          </button>
        </div>
      </div>

      {/* How far this run's payslip PDFs have got. Only ever shown on the new
          engine — on the classic one every payslip is drawn on download and
          there is no such thing as "ready".
          `serverIsClassic` is the second half of that: #220 reports
          `will_stream: false` on the classic engine even for a finished run, so
          if the settings we read at mount have since gone stale this would
          otherwise sit at "0 of 10 ready" for ever. The server's own answer wins. */}
      {queueReady && !serverIsClassic(renderStatus) && (renderStatus || batch || pollNote) && (
        <RenderStatusStrip status={renderStatus} batch={batch} note={pollNote} />
      )}

      {/* Email queue */}
      {dispatch && (
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email</span>
          {Object.entries(EMAIL_STATUS).map(([key, value]) => (
            <span key={key} className="text-xs text-slate-600">
              {value.label} <strong className="tabular-nums text-slate-800">{counts[key] ?? 0}</strong>
            </span>
          ))}
          {failedEmails > 0 && (
            <span className="text-xs font-semibold text-rose-700">
              {failedEmails} failed after up to {dispatch.max_attempts ?? EMAIL_MAX_ATTEMPTS} tries — the payslips are still released.
            </span>
          )}
          {pendingEmails > 0 && <span className="text-xs text-slate-500">{pendingEmails} waiting to go out.</span>}
        </div>
      )}

      {dispatch?.recent_failures?.length > 0 && (
        <ul className="px-5 py-3 border-b border-slate-100 space-y-1">
          {dispatch.recent_failures.slice(0, 3).map((f) => (
            <li key={f.payslip_id} className="text-[11px] text-rose-700 flex items-start gap-1.5">
              <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{f.last_error || "The email couldn't be delivered."}{f.retryable === false ? " This one won't be retried." : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Filters */}
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name or code…" className="w-full h-[38px] pl-9 pr-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-purple-400 outline-none" />
        </div>
        {[["status", PAYSLIP_STATUS_FILTERS], ["visible_to_employee", PAYSLIP_VISIBILITY_FILTERS], ["email_status", EMAIL_STATUS_FILTERS]].map(([key, options]) => (
          <select
            key={key}
            value={filters[key]}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="h-[38px] px-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-purple-400 outline-none"
          >
            {options.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
          </select>
        ))}
        <button type="button" onClick={() => { load(); loadDispatch(); }} disabled={loading} className="ml-auto h-[38px] px-3 text-xs font-bold text-slate-500 hover:text-purple-700 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50">
          <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="px-5 py-3 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{error}</p>}

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">Loading payslips…</div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-sm text-slate-500 text-center">
          No payslips match. A run approved before payslips existed has none until you use <b>Rebuild</b>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3 text-right">Gross</th>
                <th className="px-5 py-3 text-right">Net pay</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Employee sees it</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const slipStatus = meta(PAYSLIP_STATUS, row.status);
                const email = meta(EMAIL_STATUS, row.email_status);
                const key = row.payslip_id || `${row.user_id}-${row.version}`;
                return (
                  <tr key={key} className="hover:bg-purple-50/40 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{row.full_name || "N/A"}</p>
                      <p className="text-[11px] text-slate-400">{row.employee_code || "N/A"}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{row.department_name || "Unassigned"}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{money(row.gross_earnings)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-purple-700">{money(row.net_pay)}</td>
                    <td className="px-5 py-3">
                      <span className={`${STATUS_CHIP} ${slipStatus.pill}`}>v{row.version ?? 1} · {slipStatus.label}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {(() => {
                        const vis = payslipVisibility(row);
                        if (vis.visible) return row.published_at ? formatDate(row.published_at) : "Yes";
                        return <span className={`font-semibold ${vis.held ? "text-fuchsia-700" : "text-slate-500"}`}>{vis.label}</span>;
                      })()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`${STATUS_CHIP} ${email.pill}`}>{email.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => downloadRowPdf(row)}
                        disabled={!!busy}
                        className="px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition disabled:opacity-50"
                      >
                        {busy === `pdf-${row.payslip_id || row.user_id}` ? "…" : "PDF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.totalPages}{pagination.total != null ? ` · ${pagination.total} payslips` : ""}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40" aria-label="Previous page">
              <HiChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition disabled:opacity-40" aria-label="Next page">
              <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
