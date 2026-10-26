// ─────────────────────────────────────────────────────────────────────────────
// NotificationBell — the bell in the top bar, its badge, and everything it
// raises.
//
// ─── THE BELL IS NOT THE APPROVALS TRAY ────────────────────────────────────
// Until now the top bar's bell opened the approvals Inbox — the queue of
// things waiting on YOUR DECISION. That is a different object from a
// notification, which is a record of something that already happened. They
// were sharing one icon because there was only one of them. Now there are two:
// the tray (HiInboxIn) keeps the approvals count, and the bell is the
// notification centre. Every role has a bell, including employees, who have no
// approvals queue at all.
//
// ─── THE BADGE IS A RED COUNT, LIKE EVERY OTHER COUNT ──────────────────────
// A red circle with a white number — the one shape every count wears across
// this product: the sidebar Inbox, each sidebar queue, the top-bar approvals
// tray. The bell used to be the lone purple holdout; it now matches them, so
// a person reads every count the same way (user decision, 2026-10-26, which
// overrode the earlier "purple, not red (§5)" choice — rose here is a count,
// not an alarm). It caps at 99+ because the server stops counting at 100 —
// printing a raw number past the cap would be a figure the contract told us
// not to trust.
//
// ─── WHEN THE ENGINE IS OFF, THE BELL IS GONE ──────────────────────────────
// Not greyed out, not showing an error: absent (§2). The kill switch is an ops
// decision, nothing in the app depends on the feed, and a disabled bell would
// invite somebody to file a bug about it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiBell } from "react-icons/hi";
import { useNotifications } from "./NotificationsContext";
import { badgeLabel, badgeTitle } from "./notificationMeta";
import { useCurrentWorkspace } from "../attendance/paths";
import { resolveNotificationTarget } from "./notificationTargets";
import NotificationPanel from "./NotificationPanel";
import NotificationInspector from "./NotificationInspector";

export default function NotificationBell() {
  const navigate = useNavigate();
  const workspace = useCurrentWorkspace();
  const { available, unreadCount, unreadCapped, markRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const [inspecting, setInspecting] = useState(null);
  const buttonRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const inspect = useCallback((notification) => {
    setOpen(false);
    setInspecting(notification);
  }, []);

  if (!available) return null;

  const badge = badgeLabel(unreadCount, unreadCapped);
  const target = inspecting ? resolveNotificationTarget(inspecting, workspace) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 sm:w-9 h-9 flex items-center justify-center text-slate-400 hover:text-purple-600 transition-colors relative cursor-pointer"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={badgeTitle(unreadCount, unreadCapped)}
        title={badgeTitle(unreadCount, unreadCapped)}
      >
        <HiBell className="w-5 h-5" />
        {badge && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[18px] text-center ring-2 ring-white tabular-nums"
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>

      {open && <NotificationPanel onClose={close} onInspect={inspect} anchorRef={buttonRef} />}

      {inspecting && (
        <NotificationInspector
          notification={inspecting}
          target={target}
          onOpenTarget={() => { setInspecting(null); navigate(target.path); }}
          onMarkRead={async () => {
            await markRead(inspecting.id);
            setInspecting((n) => (n ? { ...n, isRead: true, readAt: n.readAt || new Date().toISOString() } : n));
          }}
          onDismiss={async () => {
            await dismiss(inspecting.id);
            setInspecting(null);
          }}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  );
}
