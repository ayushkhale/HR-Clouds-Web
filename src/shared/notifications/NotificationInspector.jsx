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
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailSection, DetailText,
} from "../components/DetailDialog";
import { DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import { fmtDateTime } from "../attendance/dates";
import { Spinner } from "../attendance/ui";
import { actorLabel, categoryLabel, categoryMeta } from "./notificationMeta";
import { CategoryPill } from "./NotificationRow";

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

  return (
    <DetailDialog
      eyebrow={categoryLabel(notification.category)}
      title={notification.title}
      subtitle={fmtDateTime(notification.createdAt)}
      icon={Icon}
      width="medium"
      badge={<CategoryPill category={notification.category} />}
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
            title="Clears it for good. What it told you about isn’t affected."
          >
            {busy === "dismiss" ? <Spinner className="w-4 h-4" /> : <HiTrash className="w-4 h-4" />}
            Clear
          </button>
          {target && (
            <button type="button" onClick={onOpenTarget} className={PRIMARY_BTN}>
              <HiExternalLink className="w-4 h-4" /> {target.label}
            </button>
          )}
        </>
      }
    >
      <DetailSection title="What happened" icon={Icon} collapsible={false}>
        <DetailText>{notification.message}</DetailText>
        <div className="mt-4">
          <DetailGrid
            cols={3}
            items={[
              {
                label: "Who did this",
                value: actorLabel(notification.actorName),
                // HR-only (onboarding tier): "The system" is a scheduled job,
                // not a person, and reads as a missing name until told.
                help: { surface: "notification.inbox", field: "actor_name", label: "who did this" },
              },
              { label: "When", value: fmtDateTime(notification.createdAt) },
              {
                label: "You read it",
                help: { surface: "notification.inbox", field: "read_at", label: "when you read it" },
                value: notification.isRead
                  ? (notification.readAt ? fmtDateTime(notification.readAt) : "Yes")
                  : "Not yet",
              },
            ]}
          />
        </div>
      </DetailSection>
    </DetailDialog>
  );
}
