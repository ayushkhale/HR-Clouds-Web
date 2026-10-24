// ─────────────────────────────────────────────────────────────────────────────
// NotificationPanel — what drops out of the bell.
//
// ─── THIS IS A GLANCE, NOT THE ARCHIVE ─────────────────────────────────────
// Twelve rows, newest first, no filters, no paging. Every control that belongs
// to managing a backlog — category tabs, read/unread filters, pagination — is
// on the Notifications page, one click away at the bottom. A dropdown that
// grows filter tabs becomes a page in a box: slower to read, harder to reach,
// and it hides the one thing it is for, which is "what happened since I last
// looked".
//
// ─── WHY THE DAY HEADERS ARE THERE ─────────────────────────────────────────
// A bare reverse-chronological list gives no sense of scale — "3 hours ago"
// and "3 days ago" look identical at a glance. Today / Yesterday / a date,
// sticky as you scroll, answers "is this backlog or breaking news" without
// reading a single row.
//
// ─── ONE ROW, ONE OUTCOME ──────────────────────────────────────────────────
// Clicking a row marks it read and goes where it points. When it points
// nowhere this build understands — the event catalog grows screens the
// installed app has not heard of — it opens the record inspector instead of
// doing nothing. A row that looks clickable must always do something.
//
// ─── LAYERING ──────────────────────────────────────────────────────────────
// z-[60]: above the sticky top bar (z-20) and page content, below the toasts
// (z-[200]) and every dialog layer (z-[140]+). The inspector it raises is a
// sibling owned by the bell, not a child of this panel (§3 stacking).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HiBell, HiCheck, HiArrowRight, HiExclamationCircle, HiRefresh } from "react-icons/hi";
import { useNotifications } from "./NotificationsContext";
import { useCurrentWorkspace } from "../attendance/paths";
import { resolveNotificationTarget, NOTIFICATION_PATHS } from "./notificationTargets";
import { groupByDay, badgeLabel } from "./notificationMeta";
import { notificationErrorMessage } from "./notificationErrors";
import NotificationRow, { NotificationSkeleton } from "./NotificationRow";
import PushOptInNudge from "./PushOptInNudge";

export default function NotificationPanel({ onClose, onInspect, anchorRef }) {
  const navigate = useNavigate();
  const workspace = useCurrentWorkspace();
  const { feed, unreadCount, unreadCapped, refreshFeed, markRead, markAllRead, dismiss } = useNotifications();
  const panelRef = useRef(null);

  // Opening the bell is the one moment the feed is certainly being looked at,
  // so it is read then rather than polled — only the count is polled.
  useEffect(() => { refreshFeed(); }, [refreshFeed]);

  // Escape closes, and a click anywhere outside closes — except on the bell
  // itself, which would otherwise close and immediately reopen.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onClose, anchorRef]);

  const openRow = (notification) => {
    if (!notification.isRead) markRead(notification.id);
    const target = resolveNotificationTarget(notification, workspace);
    if (target) {
      onClose();
      navigate(target.path);
      return;
    }
    onInspect(notification);
  };

  const allPath = NOTIFICATION_PATHS[workspace];
  const groups = groupByDay(feed.rows);
  const firstLoad = feed.loading && !feed.loaded;

  return (
    <>
      {/* A phone gets a dimmed backdrop so the sheet reads as a layer; from sm
          up the panel is a popover and a backdrop would be heavy-handed. */}
      <div className="fixed inset-0 z-[55] bg-slate-900/20 sm:hidden" aria-hidden="true" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        className="fixed left-3 right-3 top-[4.75rem] z-[60] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[25rem]
          bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] sm:max-h-[32rem] animate-slide-up"
      >
        <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
          <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5">
              {badgeLabel(unreadCount, unreadCapped)} new
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={refreshFeed}
              disabled={feed.loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition disabled:opacity-50 cursor-pointer"
              aria-label="Check for new notifications"
              title="Check for new notifications"
            >
              <HiRefresh className={`w-4 h-4 ${feed.loading ? "animate-spin" : ""}`} />
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:bg-purple-50 px-2 py-1.5 rounded-lg transition cursor-pointer"
              >
                <HiCheck className="w-3.5 h-3.5" /> Mark all as read
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {firstLoad ? (
            <NotificationSkeleton rows={4} />
          ) : feed.error ? (
            <div className="px-6 py-10 text-center" role="alert">
              <HiExclamationCircle className="w-8 h-8 text-rose-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600 mt-2 leading-relaxed">
                {notificationErrorMessage(feed.error)}
              </p>
              <button
                type="button"
                onClick={refreshFeed}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                <HiRefresh className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : feed.rows.length === 0 ? (
            <div className="px-8 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mx-auto">
                <HiBell className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mt-3">You’re all caught up</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Decisions on your requests, new payslips and work assigned to you show up here.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <h3 className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  {group.label}
                </h3>
                <ul className="divide-y divide-slate-50">
                  {group.items.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={() => openRow(notification)}
                      onDismiss={() => dismiss(notification.id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-white">
          <PushOptInNudge />
          {allPath && (
            <button
              type="button"
              onClick={() => { onClose(); navigate(allPath); }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-bold text-purple-700 hover:bg-purple-50 transition cursor-pointer"
            >
              See all notifications <HiArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </footer>
      </div>
    </>
  );
}
