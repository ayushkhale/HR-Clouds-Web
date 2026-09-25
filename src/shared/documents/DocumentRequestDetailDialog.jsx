// ─────────────────────────────────────────────────────────────────────────────
// documents/DocumentRequestDetailDialog.jsx — One request, and the two things
// that can still be done to it: nudge (#85) and withdraw (#84 / #95).
//
// The HR plane re-reads the request on open (#83), because a list row can be a
// minute old and a nudge or a cancel is not something to fire at a stale row.
// The manager and self planes have no detail endpoint, so the row they were
// given IS the record — which is fine: the list projection and the detail
// projection are the same object.
//
// Nothing here ever "completes" a request. A request ends when a matching
// document is confirmed, inside that upload's own transaction, so this dialog
// only ever withdraws or chases.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiBan, HiBell, HiCheckCircle, HiClipboardList, HiExternalLink, HiInformationCircle, HiUser,
} from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailSection, DetailText } from "../components/DetailDialog";
import ReasonDialog from "../components/ReasonDialog";
import { fmtDate, fmtDateTime, todayYMD } from "../attendance/dates";
import { documentErrorMessage, isRequestStale } from "../utils/documentErrors";
import { DANGER_BTN, DocErrorState, SECONDARY_BTN } from "./ui";
import { RequestDueChip, RequestStatusBadge } from "./requestUi";
import { useAuth } from "../contexts/AuthContext";
import useDocumentSettings from "./useDocumentSettings";
import {
  CANCEL_REASON_MAX, CANCEL_REASON_MIN, REQUEST_MAX_REMINDERS, canCancelRequest, canRemindRequest,
  remindedToday, requestDisplayStatus, requesterRoleLabel,
} from "./requestMeta";

/**
 * @param {object} props
 * @param {object} props.request              the row that was clicked
 * @param {object} props.plane                REQUEST_PLANES entry
 * @param {Map} props.types                   id → document type, for the name
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {(message: string, tone?: string) => void} props.showToast
 * @param {() => void} props.onChanged        re-read the list behind the dialog
 * @param {(documentId: string, name: string) => void} [props.onOpenDocument]  show the document that met it
 * @param {() => void} props.onClose
 */
export default function DocumentRequestDetailDialog({
  request: initial, plane, types, nameOf, showToast, onChanged, onOpenDocument, onClose,
}) {
  const { user } = useAuth();
  const actorId = user?.id;
  // Only the HR plane has a nudge button at all, and only HR can read the
  // settings — so whenever the button is visible, this is populated.
  const { settings } = useDocumentSettings();
  // Verified live: #85 happily claims today's watermark and increments
  // `reminder_count` even when the overdue-notice setting is off, in which case
  // the enqueue is skipped and NO email is sent. Reporting "reminder queued"
  // there would be a plain untruth, so the toast says what actually happened.
  const overdueEmailsOn = settings ? settings.document_notify_request_overdue === true : null;
  const [request, setRequest] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const id = initial?.id;
  const today = todayYMD();

  // Only HR has a detail read; elsewhere the list row is the whole record.
  const reload = useCallback(async () => {
    if (!plane.get || !id) return;
    setLoading(true);
    try {
      const res = await plane.get(id);
      setRequest(res?.data ?? res);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [plane, id]);

  useEffect(() => { reload(); }, [reload]);

  const status = requestDisplayStatus(request);
  const type = types?.get?.(request?.document_type_id);
  const typeName = type?.name || "This document";
  const who = nameOf ? nameOf(request?.user_id, "the employee") : "the employee";
  const raisedByMe = !!actorId && request?.requested_by === actorId;
  const raisedBy = raisedByMe ? "you" : (nameOf ? nameOf(request?.requested_by, requesterRoleLabel(request?.requested_by_role)) : requesterRoleLabel(request?.requested_by_role));

  // A manager may only withdraw what they raised themselves; anything else is a
  // uniform 404, so the button is not offered rather than offered and refused.
  const mayCancel = !!plane.cancel && canCancelRequest(request) && (plane.canCancelOthers || raisedByMe);
  const mayRemind = !!plane.remind && canRemindRequest(request);
  const alreadyNudged = remindedToday(request, today);
  const reminders = Number(request?.reminder_count) || 0;
  const outOfNudges = reminders >= REQUEST_MAX_REMINDERS;

  const handle = async (key, run, done) => {
    setBusy(key);
    setDialogError("");
    try {
      const res = await run();
      done(res?.data ?? res);
      onChanged?.();
    } catch (err) {
      const message = documentErrorMessage(err, "Couldn't do that.");
      if (isRequestStale(err)) {
        // It moved on under us. Say so once, refresh, and close: retrying the
        // same call would fail the same way.
        showToast?.(message, "error");
        onChanged?.();
        onClose();
        return;
      }
      setDialogError(message);
      if (key === "cancel") return; // stays in the reason dialog so the text isn't lost
      showToast?.(message, "error");
    } finally {
      setBusy("");
    }
  };

  const nudge = () => handle("remind", () => plane.remind(id), (data) => {
    // A same-day repeat is a 200, not an error: the server protects people from
    // being emailed twice in a day, and says so plainly.
    if (data?.reminded === false) {
      showToast?.(`${who} has already been reminded today. They'll get the next one tomorrow if it's still outstanding.`);
    } else if (overdueEmailsOn === false) {
      showToast?.(`Recorded as reminded, but no email went out — overdue reminders are switched off in Document Settings.`, "error");
    } else {
      showToast?.(`Reminder queued for ${who}. It sends within about fifteen minutes.`);
    }
    if (data?.request) setRequest(data.request);
    else reload();
  });

  const withdraw = (reason) => handle("cancel", () => plane.cancel(id, reason), (data) => {
    setCancelling(false);
    showToast?.("Request withdrawn");
    if (data?.id) setRequest(data);
    else reload();
  });

  const grid = useMemo(() => {
    const items = [
      { label: "What was asked for", value: typeName },
      { label: "Asked of", value: who },
      { label: "Asked by", value: raisedBy },
      { label: "Asked on", value: fmtDate(request?.created_at) },
      { label: "Due by", value: fmtDate(request?.due_on) },
    ];
    if (status === "fulfilled") items.push({ label: "Met on", value: fmtDateTime(request?.fulfilled_at) });
    if (status === "cancelled") items.push({ label: "Withdrawn on", value: fmtDateTime(request?.cancelled_at) });
    if (plane.showsReminders) {
      items.push({ label: "Reminders sent", value: `${reminders} of ${REQUEST_MAX_REMINDERS}` });
    }
    if (plane.showsLastReminder) {
      items.push({ label: "Last reminder", value: request?.last_reminder_on ? fmtDate(request.last_reminder_on) : "None sent" });
    }
    return items;
  }, [typeName, who, raisedBy, request, status, plane.showsReminders, plane.showsLastReminder, reminders]);

  const footer = (
    <>
      {!mayCancel && !mayRemind && (
        <DetailFooterNote>
          {status === "fulfilled"
            ? "Met and closed. Nothing more is expected."
            : status === "cancelled"
              ? "Withdrawn. Kept here so there's a record of what was asked."
              : plane.key === "self"
                ? "Upload the document from My Documents and this closes itself."
                : "Nothing to do here — it's within its deadline."}
        </DetailFooterNote>
      )}
      {mayRemind && (
        <button
          type="button"
          onClick={nudge}
          disabled={!!busy || alreadyNudged || outOfNudges}
          title={outOfNudges
            ? `${who} has had all ${REQUEST_MAX_REMINDERS} reminders. Have a word instead.`
            : alreadyNudged
              ? `Already reminded today — the next one can go out tomorrow.`
              : overdueEmailsOn === false
                ? "Overdue reminders are switched off, so this would be recorded but no email would be sent."
                : undefined}
          className={SECONDARY_BTN}
        >
          <HiBell className="w-4 h-4" /> {busy === "remind" ? "Sending…" : alreadyNudged ? "Reminded today" : "Remind now"}
        </button>
      )}
      {mayCancel && (
        <button type="button" onClick={() => { setDialogError(""); setCancelling(true); }} disabled={!!busy} className={DANGER_BTN}>
          <HiBan className="w-4 h-4" /> Withdraw request
        </button>
      )}
    </>
  );

  return (
    <>
      <DetailDialog
        title={typeName}
        subtitle={`Asked of ${who}`}
        eyebrow="Document request"
        icon={HiClipboardList}
        badge={<RequestStatusBadge request={request} />}
        loading={loading}
        footer={footer}
        onClose={onClose}
      >
        {loadError ? (
          <DocErrorState error={loadError} onRetry={reload} fallback="Couldn't load this request." />
        ) : (
          <>
            {/* The one line that says what happens next, in the person's own terms. */}
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${status === "overdue" ? "border-rose-200 bg-rose-50" : status === "fulfilled" ? "border-violet-200 bg-violet-50/60" : status === "cancelled" ? "border-slate-200 bg-slate-50" : "border-fuchsia-200 bg-fuchsia-50/60"}`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${status === "fulfilled" ? "bg-white text-violet-600" : status === "overdue" ? "bg-white text-rose-600" : "bg-white text-purple-600"}`}>
                {status === "fulfilled" ? <HiCheckCircle className="w-5 h-5" /> : status === "cancelled" ? <HiBan className="w-5 h-5" /> : <HiClipboardList className="w-5 h-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">
                  {status === "fulfilled"
                    ? "Met — this closed itself"
                    : status === "cancelled"
                      ? "Withdrawn"
                      : status === "overdue"
                        ? "Past its deadline"
                        : "Waiting on the employee"}
                </p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  {status === "fulfilled"
                    ? `${who} uploaded a matching document, so nothing needed closing by hand.`
                    : status === "cancelled"
                      ? `${who} is no longer expected to provide this.`
                      : plane.key === "self"
                        ? "Upload this document from My Documents and this closes itself — there's nothing to tick off here."
                        : `${who} hasn't uploaded it yet. It closes itself the moment they do.`}
                </p>
                <div className="mt-1.5">
                  <RequestDueChip request={request} withDate fmt={fmtDate} />
                </div>
              </div>
              {status === "fulfilled" && request?.fulfilled_document_id && onOpenDocument && (
                <button
                  type="button"
                  onClick={() => onOpenDocument(request.fulfilled_document_id, typeName)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:underline"
                >
                  Open the document <HiExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* A fulfilled request whose document was later deleted keeps its
                record: the server clears the link but never the fulfilment. */}
            {status === "fulfilled" && !request?.fulfilled_document_id && (
              <p className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
                The document that met this has since been removed. The request stays met, because it was met at the time — but the requirement may be showing as outstanding again on the checklist.
              </p>
            )}

            <DetailSection title="Details" icon={HiUser} collapsible={false}>
              <DetailGrid items={grid} cols={3} />
            </DetailSection>

            {request?.note && (
              <DetailSection title="What they were told" icon={HiClipboardList}>
                <DetailText>{request.note}</DetailText>
              </DetailSection>
            )}

            {status === "cancelled" && request?.cancel_reason && (
              <DetailSection title="Why it was withdrawn" icon={HiBan}>
                <DetailText>{request.cancel_reason}</DetailText>
              </DetailSection>
            )}

            {plane.showsReminders && reminders > 0 && (
              <p className="flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
                <HiBell className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
                {reminders === 1 ? "One reminder has" : `${reminders} reminders have`} gone out.
                {plane.showsLastReminder && request?.last_reminder_on ? ` The last was on ${fmtDate(request.last_reminder_on)}.` : ""}
                {" "}At most one goes out a day, and at most {REQUEST_MAX_REMINDERS} in all.
              </p>
            )}
          </>
        )}
      </DetailDialog>

      {cancelling && (
        <ReasonDialog
          title="Withdraw this request?"
          description={`${who} stops being asked for ${typeName.toLowerCase()}, and the reminder emails stop straight away. The request stays on record with your reason.`}
          label="Why you're withdrawing it"
          placeholder="e.g. They brought the original in for us to check in person."
          confirmLabel="Withdraw request"
          tone="danger"
          minLength={CANCEL_REASON_MIN}
          maxLength={CANCEL_REASON_MAX}
          busy={busy === "cancel"}
          error={dialogError}
          onClose={() => { if (busy !== "cancel") { setCancelling(false); setDialogError(""); } }}
          onSubmit={withdraw}
        />
      )}
    </>
  );
}
