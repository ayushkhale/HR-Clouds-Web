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
// Payslip PDFs (PDF Generation Phase 3, and the HTML-only migration of
// 30 Sep 2026). There is one render engine now, so the tools below are no
// longer gated on an organisation setting — the server is the only gate:
//
//  · DOWNLOAD ALL MAY NOT HAND BACK A FILE. When a run has more unprepared
//    payslips than the organisation's threshold, #174 answers `202` — "I have
//    started preparing these" — with a batch to poll. That is a success, and
//    `response.ok` is true for it, so the download goes through `acceptJson`
//    (see shared/utils/download.js) or the browser would save the JSON as a
//    corrupt .zip. This panel then polls #220 and downloads for real once the
//    run is ready.
//  · WHOLE-RUN WORK MAY BE PAUSED. Ops can switch off every fan-out PDF call;
//    #174 and #219-with-a-run then answer `503 PDF_BULK_GENERATION_DISABLED`.
//    Nothing advertises that, so the first refusal is remembered for the session
//    (shared/pdf/bulkGeneration.js) and both buttons say "paused" instead of
//    failing again. Never retried automatically. Per-payslip downloads work.
//  · PREPARE PDFS (#219) warms a run up on demand. Safe to press repeatedly.
//  · A HELD payslip is never kept ready — it is drawn fresh on download, now in
//    the same layout as a released one. #220 counts those as `uncacheable`,
//    which is why readiness is the server's `will_stream` and never
//    `ready === total`.
//  · A single payslip PDF can now fail for renderer reasons (409/500/502/504);
//    `downloadRenderedPdf` retries a 409 "still being drawn" once by itself.
//
// The bank advice comes two ways: the CSV (#181) is THE file uploaded to the
// bank; the PDF (#223) is a signed, printable covering copy of the same rows
// with account numbers masked. The labels say which is which, because offering
// the PDF as though it could replace the CSV would get a payment run rejected.
//
// The bodyless-404 guard on #219/#220 stays: this app is deployed against more
// than one environment, and a server without the queue routes must hide the two
// tools rather than show a payroll error for something nobody did.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { payrollAPI, payrollFiles } from "../../../shared/api";
import { downloadFile } from "../../../shared/utils/download";
import { BANK_ADVICE_PDF_OVERRIDES, isPayrollRouteMissing, payrollErrorMessage } from "../../../shared/utils/payrollErrors";
import { downloadRenderedPdf } from "../../../shared/pdf/renderedPdf";
import { BULK_PAUSED_NOTE, markBulkGenerationAvailable, noteBulkRefusal, useBulkGenerationPaused } from "../../../shared/pdf/bulkGeneration";
import { formatDate, formatMoney, formatPeriod } from "../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../shared/attendance/normalize";
import {
  EMAIL_MAX_ATTEMPTS, EMAIL_STATUS, EMAIL_STATUS_FILTERS, PAYSLIP_STATUS,
  PAYSLIP_STATUS_FILTERS, PAYSLIP_VISIBILITY_FILTERS, meta, payslipVisibility,
} from "./phase6Meta";
import {
  HiCash, HiCheckCircle, HiChevronLeft, HiChevronRight, HiDocumentDownload, HiDocumentText,
  HiExclamationCircle, HiEye, HiInformationCircle, HiLightningBolt, HiMail, HiRefresh, HiSearch, HiUpload,
} from "react-icons/hi";
import {
  RENDER_POLL_MAX_TICKS, RENDER_POLL_MS, drainMessage, drainResultOf, enqueuedBatchOf,
  isFullyPrepared, renderPercent, renderStatusLine, renderStatusOf,
  stillPreparing, uncacheableNote, wasEnqueued,
} from "./pdfRenderMeta";
import { STATUS_CHIP } from "../../../shared/utils/statusChip";
import FieldHelp from "../../../shared/fieldHelp/FieldHelp";

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
function RenderStatusStrip({ status, batch, note, bulkPaused }) {
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
            {note || renderStatusLine(status, { bulkPaused }) || "Checking…"}
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

  // ── Payslip PDFs (#174 / #219 / #220) ─────────────────────────────
  const [renderStatus, setRenderStatus] = useState(null);
  // Learned from a 503 PDF_BULK_GENERATION_DISABLED, shared with every other
  // whole-set action in the app for the rest of the session.
  const bulkPaused = useBulkGenerationPaused();
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

  // ── The render queue and the async ZIP ──────────────────────────────────
  // No settings read any more: there is one engine, so the only thing that can
  // hide these tools is a server without the routes (bodyless 404).
  const queueReady = !queueMissing;

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

  const download = async (key, path, filename, { pdf = false, overrides = null } = {}) => {
    setBusy(key);
    setError("");
    try {
      await (pdf ? downloadRenderedPdf : downloadFile)(path, { filename });
      showToast("Download started.");
      loadDispatch();
    } catch (err) {
      const message = payrollErrorMessage(err, "Couldn't prepare that download", overrides);
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
      markBulkGenerationAvailable();
      if (!silent) showToast("Download started.");
      loadDispatch();
      if (queueReady) loadRenderStatus();
    } catch (err) {
      // A failure ends the wait: leaving the poller running would keep promising
      // a download that is no longer coming.
      setBatch(null);
      // The platform switch is a notice, not an error: nothing is wrong with
      // this run, and pressing again won't help. Never retried on its own.
      if (noteBulkRefusal(err)) {
        showToast("Downloading the whole run at once is paused for now. Download payslips one at a time from the list below.");
        return;
      }
      const message = payrollErrorMessage(err, "Couldn't prepare that download");
      setError(message);
      showToast(message, "error");
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
      } else if (noteBulkRefusal(err)) {
        showToast("Preparing a whole run at once is paused for now. Each payslip is prepared the first time it is downloaded.");
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
      await downloadRenderedPdf(payrollFiles.hrPayslipPdf(row.user_id, runId), {
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
          {/* Kept visible while paused — disabled, with the reason — so the
              action doesn't simply vanish and leave people hunting for it. */}
          <button
            type="button"
            onClick={() => downloadZip()}
            disabled={!!busy || !!batch || bulkPaused}
            title={bulkPaused ? BULK_PAUSED_NOTE : undefined}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "zip" || batch ? <Spinner /> : <HiDocumentDownload className="w-4 h-4" />}
            {batch ? "Preparing…" : "Download all (ZIP)"}
          </button>
          {queueReady && (
            <button
              type="button"
              onClick={preparePdfs}
              disabled={!!busy || !!batch || bulkPaused}
              title={bulkPaused ? BULK_PAUSED_NOTE : "Get this run's payslip PDFs ready now, so downloading them is instant"}
              className="px-3 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === "prepare" ? <Spinner /> : <HiLightningBolt className="w-4 h-4" />} Prepare PDFs
            </button>
          )}
          {isPaid && (
            <button type="button" onClick={() => download("bank", payrollFiles.hrBankAdvice(runId), `bank-advice-${run?.period_month || runId}.csv`)} disabled={!!busy} title="The NEFT file you upload to the bank" className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
              {busy === "bank" ? <Spinner /> : <HiCash className="w-4 h-4" />} Bank file (CSV)
            </button>
          )}
          {isPaid && (
            <button
              type="button"
              onClick={() => download("bankPdf", payrollFiles.hrBankAdvicePdf(runId), `bank-advice-${run?.period_month || runId}.pdf`, { pdf: true, overrides: BANK_ADVICE_PDF_OVERRIDES })}
              disabled={!!busy}
              title="A printable covering copy to sign and file — the same rows as the CSV, account numbers masked. Upload the CSV to the bank, not this."
              className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === "bankPdf" ? <Spinner /> : <HiDocumentText className="w-4 h-4" />} Bank advice (PDF)
            </button>
          )}
          {isPaid && <FieldHelp surface="payroll.run_payslips" field="bank_advice" label="the two bank advice files" />}
          <button type="button" onClick={backfill} disabled={!!busy} title="For a run approved before payslips existed — creates the frozen copies" className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-purple-700 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
            {busy === "backfill" ? <Spinner /> : <HiUpload className="w-4 h-4" />} Rebuild
          </button>
        </div>
      </div>

      {/* Whole-run work is paused on this server: said once, here, beside the
          two buttons it switched off. */}
      {bulkPaused && (
        <div className="px-5 py-3 border-b border-indigo-100 bg-indigo-50/60 flex items-start gap-2.5" role="status">
          <HiInformationCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-900 leading-relaxed">
            <span className="font-bold">Downloading or preparing the whole run at once is paused on this server for now.</span>{" "}
            Every payslip below still downloads on its own with its PDF button.
          </p>
        </div>
      )}

      {/* How far this run's payslip PDFs have got (#220). */}
      {queueReady && (renderStatus || batch || pollNote) && (
        <RenderStatusStrip status={renderStatus} batch={batch} note={pollNote} bulkPaused={bulkPaused} />
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
