// ─────────────────────────────────────────────────────────────────────────────
// NotificationPanel — what drops out of the bell.
//
// ─── THIS IS A GLANCE, NOT THE ARCHIVE ─────────────────────────────────────
// Twelve rows, newest first. Includes quick All/Unread filter tabs, unread badge,
// "Mark all as read" button, sticky date headers, and 1-click quick-open action.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
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
  const [filter, setFilter] = useState("all"); // "all" | "unread"

  // Opening the bell is the moment the feed is inspected; re-read then.
  useEffect(() => { refreshFeed(); }, [refreshFeed]);

  // Escape closes, and a click anywhere outside closes
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
    onInspect(notification);
  };

  const quickOpenRow = (notification) => {
    if (!notification.isRead) markRead(notification.id);
    const target = resolveNotificationTarget(notification, workspace);
    if (target) {
      onClose();
      navigate(target.path);
    } else {
      onInspect(notification);
    }
  };

  const allPath = NOTIFICATION_PATHS[workspace];
  const displayRows = filter === "unread" ? feed.rows.filter((r) => !r.isRead) : feed.rows;
  const groups = groupByDay(displayRows);
  const firstLoad = feed.loading && !feed.loaded;
  const unreadRowsCount = feed.rows.filter((r) => !r.isRead).length;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-[55] bg-slate-900/20 sm:hidden" aria-hidden="true" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        className="fixed left-3 right-3 top-[4.75rem] z-[60] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[25rem]
          bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[32rem] animate-slide-up"
      >
        {/* Header */}
        <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
                {badgeLabel(unreadCount, unreadCapped)} new
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={refreshFeed}
              disabled={feed.loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition disabled:opacity-50 cursor-pointer"
              aria-label="Refresh notifications"
              title="Refresh notifications"
            >
              <HiRefresh className={`w-4 h-4 ${feed.loading ? "animate-spin" : ""}`} />
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded-lg transition cursor-pointer"
                title="Mark all as read"
              >
                <HiCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
        </header>

        {/* Quick Filter Subheader (All / Unread) */}
        {feed.rows.length > 0 && (
          <div className="shrink-0 px-4 py-1.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
            <div className="inline-flex p-0.5 bg-slate-200/60 rounded-lg text-xs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  filter === "all"
                    ? "bg-white text-purple-700 shadow-xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                All ({feed.rows.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "unread"}
                onClick={() => setFilter("unread")}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  filter === "unread"
                    ? "bg-white text-purple-700 shadow-xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Unread ({unreadRowsCount})
              </button>
            </div>
          </div>
        )}

        {/* List Body */}
        <div className="flex-1 min-h-0 overflow-y-auto max-h-[26rem]">
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
              <p className="text-sm font-semibold text-slate-600 mt-3">No notifications yet</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Decisions on your requests, new payslips and work assigned to you show up here.
              </p>
            </div>
          ) : filter === "unread" && displayRows.length === 0 ? (
            <div className="px-8 py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-2">
                <HiCheck className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-800">You&apos;re all caught up</p>
              <p className="text-[11px] text-slate-500 mt-1">You have no unread notifications right now.</p>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-3 text-xs font-bold text-purple-700 hover:underline cursor-pointer"
              >
                View all notifications
              </button>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <h3 className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  {group.label}
                </h3>
                <ul className="divide-y divide-slate-100">
                  {group.items.map((notification) => {
                    const target = resolveNotificationTarget(notification, workspace);
                    return (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        onOpen={() => openRow(notification)}
                        onDismiss={() => dismiss(notification.id)}
                        onQuickOpen={target ? () => quickOpenRow(notification) : undefined}
                        quickOpenLabel={target ? target.label : undefined}
                      />
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* Footer */}
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
