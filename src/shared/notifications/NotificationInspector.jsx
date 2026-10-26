// ─────────────────────────────────────────────────────────────────────────────
// NotificationInspector — the record inspector behind one notification (§3).
//
// Opened by the row on the Notifications page, and by a row in the bell panel
// that has nowhere to go. It is deliberately the ONLY place the whole message
// is shown: the row clamps to two lines, and a leave rejection carries the
// manager's own words, which is exactly the text somebody opens a notification
// to read in full.
//
// ─── WHAT IS NOT IN HERE, ON PURPOSE ───────────────────────────────────────
// · THE EVENT KEY. `leave.cancellation_requested` is a raw enum and never
//   reaches a screen (§4). It decides which page the footer button opens, and
//   that is the whole of its visible effect.
// · THE NOTIFICATION ID, and the entity id inside `metadata`. The id goes into
//   a URL and nowhere else — no "#8f3c…" suffix, no id row, no tooltip (§4).
// · ANY FIGURE RECOMPUTED FROM THE MESSAGE. The server interpolated the names,
//   dates and day counts; this screen renders that text and does not parse it.
//
// ─── WHY THE ACTIONS ARE ALL IN THE FOOTER ─────────────────────────────────
// §3: the row carries no View button and no action buttons, so Open, Mark as
// read and Clear all live here. "Open …" is first and is the primary, because
// the reason anyone opens a notification is to get to the thing it is about.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiCheck, HiExternalLink, HiTrash } from "react-icons/hi";
import DetailDialog, { DetailFooterNote } from "../components/DetailDialog";
import { DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import { fmtDateTime } from "../attendance/dates";
import { Spinner } from "../attendance/ui";
import { actorLabel, categoryLabel, categoryMeta } from "./notificationMeta";

/**
 * @param {{
 *   notification: object,
 *   target: { path: string, label: string } | null,
 *   onOpenTarget: () => void,
 *   onMarkRead: () => Promise<boolean>,
 *   onDismiss: () => Promise<boolean>,
 *   onClose: () => void,
 * }} props
 */
export default function NotificationInspector({
  notification, target, onOpenTarget, onMarkRead, onDismiss, onClose,
}) {
  const [busy, setBusy] = useState("");
  const { icon: Icon } = categoryMeta(notification.category);

  const run = async (kind, fn) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };

  const readAtDisplay = notification.isRead
    ? (notification.readAt ? fmtDateTime(notification.readAt) : "Just now")
    : "Not yet";

  return (
    <DetailDialog
      eyebrow={categoryLabel(notification.category)}
      title={notification.title}
      icon={Icon}
      width="compact"
      onClose={onClose}
      footer={
        <>
          {!target && (
            <DetailFooterNote>
              There’s no page to open for this one — everything it has to say is above.
            </DetailFooterNote>
          )}
          {!notification.isRead && (
            <button
              type="button"
              onClick={() => run("read", onMarkRead)}
              disabled={Boolean(busy)}
              className={SECONDARY_BTN}
            >
              {busy === "read" ? <Spinner className="w-4 h-4" /> : <HiCheck className="w-4 h-4" />}
              Mark as read
            </button>
          )}
          <button
            type="button"
            onClick={() => run("dismiss", onDismiss)}
            disabled={Boolean(busy)}
            className={DANGER_BTN}
            title="Permanently removes this notification. What it told you about isn’t affected."
            aria-label={`Delete notification: ${notification.title}`}
          >
            {busy === "dismiss" ? <Spinner className="w-4 h-4" /> : <HiTrash className="w-4 h-4" />}
            Delete
          </button>
          {target && (
            <button
              type="button"
              onClick={onOpenTarget}
              className={PRIMARY_BTN}
              aria-label={`Open: ${target.label}`}
            >
              <HiExternalLink className="w-4 h-4" /> {target.label}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Full notification description without redundant card headers */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 sm:p-5">
          <p className="text-[14px] sm:text-[15px] leading-relaxed text-slate-800 break-words whitespace-pre-wrap font-normal">
            {notification.message}
          </p>
        </div>

        {/* Clean, flat 3-column metadata summary card (non-input style) */}
        <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-4 sm:p-5">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/60 text-xs">
            {/* Column 1: WHO DID THIS */}
            <div className="min-w-0 sm:pr-4">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Who did this
              </dt>
              <dd className="text-xs sm:text-sm font-semibold text-slate-700 truncate" title={actorLabel(notification.actorName)}>
                {actorLabel(notification.actorName)}
              </dd>
            </div>

            {/* Column 2: WHEN */}
            <div className="min-w-0 pt-3 sm:pt-0 sm:px-4">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                When
              </dt>
              <dd className="text-xs sm:text-sm font-semibold text-slate-700">
                {fmtDateTime(notification.createdAt)}
              </dd>
            </div>

            {/* Column 3: YOU READ IT */}
            <div className="min-w-0 pt-3 sm:pt-0 sm:pl-4">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                You read it
              </dt>
              <dd className={`text-xs sm:text-sm font-semibold ${notification.isRead ? "text-slate-700" : "text-purple-600 font-bold"}`}>
                {readAtDisplay}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </DetailDialog>
  );
}
