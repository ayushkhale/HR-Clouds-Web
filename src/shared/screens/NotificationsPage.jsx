// ─────────────────────────────────────────────────────────────────────────────
// NotificationsPage — the whole feed: filter it, read it, clear it.
//
// Mounted in all three workspaces under each one's own prefix
// (`NOTIFICATION_PATHS`). Every org role has an inbox — the endpoints are
// scoped to the caller and there is no manager or HR view of somebody else's —
// so this is one screen with no `viewer` prop and no role branches at all (§2).
// The only thing that differs between workspaces is where a row's "Open …"
// button goes, and notificationTargets.js owns that.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiBell, HiVolumeOff, HiCheck, HiExclamationCircle, HiRefresh, HiTrash,
  HiExternalLink, HiArrowRight,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { rowPreviewProps } from "../components/DetailDialog";
import { notificationsAPI } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useCurrentWorkspace } from "../attendance/paths";
import { EmptyState, FilterTabs, Pagination, Toast, useToast } from "../attendance/ui";
import { PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../documents/ui";
import { useNotifications } from "../notifications/NotificationsContext";
import {
  CATEGORY_META, NOTIFICATION_CATEGORIES, actorLabel, categoryLabel, normalizeNotification,
} from "../notifications/notificationMeta";
import { notificationErrorMessage } from "../notifications/notificationErrors";
import NotificationRow, {
  CategoryIcon, CategoryPill, NotificationSkeleton, NotificationTime,
} from "../notifications/NotificationRow";
import NotificationInspector from "../notifications/NotificationInspector";
import PushOptInCard, { DesktopAlertsStatusToggle } from "../notifications/PushOptInCard";
import { resolveNotificationTarget } from "../notifications/notificationTargets";

const SURFACE = "notification.inbox";
const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();
  const workspace = useCurrentWorkspace();
  const {
    available, unreadCount, markRead, markAllRead, dismiss, subscribeChange,
  } = useNotifications();
  const { toast, showToast, clearToast } = useToast();

  const [readFilter, setReadFilter] = useState("all");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, totalPages: 1, loading: true, error: null });
  const [tabCounts, setTabCounts] = useState({ all: 0, unread: 0, read: 0 });
  const [selected, setSelected] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);

  // Guards late replies from overwriting newer ones (§7)
  const tokenRef = useRef(0);

  const load = useCallback(async () => {
    if (!available) return;
    const token = ++tokenRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await notificationsAPI.listNotifications({
        page,
        limit: PAGE_SIZE,
        is_read: readFilter === "all" ? undefined : readFilter === "read",
        category: category || undefined,
      });
      if (token !== tokenRef.current) return;
      const data = res?.data || {};
      const items = (data.items || []).map(normalizeNotification).filter(Boolean);
      const totalCount = Number(data.pagination?.total) || 0;
      const totalPgs = Math.max(1, Number(data.pagination?.total_pages) || 1);

      setState({
        rows: items,
        total: totalCount,
        totalPages: totalPgs,
        loading: false,
        error: null,
      });

      // Update tab counts based on current response
      setTabCounts((prev) => {
        if (readFilter === "all") {
          return {
            all: totalCount,
            unread: unreadCount,
            read: Math.max(0, totalCount - unreadCount),
          };
        }
        if (readFilter === "unread") {
          return {
            ...prev,
            unread: totalCount,
            read: Math.max(0, prev.all - totalCount),
          };
        }
        if (readFilter === "read") {
          return {
            ...prev,
            read: totalCount,
            all: Math.max(prev.all, totalCount + unreadCount),
          };
        }
        return prev;
      });
    } catch (error) {
      if (token !== tokenRef.current) return;
      setState({ rows: [], total: 0, totalPages: 1, loading: false, error });
    }
  }, [available, page, readFilter, category, unreadCount]);

  useEffect(() => { load(); }, [load]);

  // Keep state synchronized with external changes
  useEffect(() => subscribeChange((change) => {
    setState((s) => {
      if (change.kind === "dismiss") {
        const nextRows = s.rows.filter((r) => r.id !== change.id);
        const nextTotal = Math.max(0, s.total - 1);
        const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        return {
          ...s,
          rows: nextRows,
          total: nextTotal,
          totalPages: nextTotalPages,
        };
      }
      if (change.kind === "read_all") {
        return { ...s, rows: s.rows.map((r) => (r.isRead ? r : { ...r, isRead: true, readAt: change.readAt })) };
      }
      if (change.kind === "read") {
        return { ...s, rows: s.rows.map((r) => (r.id === change.id ? { ...r, isRead: true, readAt: r.readAt || change.readAt } : r)) };
      }
      if (change.kind === "unread") {
        return { ...s, rows: s.rows.map((r) => (r.id === change.id ? { ...r, isRead: false, readAt: null } : r)) };
      }
      return s;
    });
  }), [subscribeChange]);

  const changeFilter = (next) => {
    setPage(1);
    next();
  };

  const openRow = (notification) => {
    if (!notification.isRead) markRead(notification.id);
    setSelected({ ...notification, isRead: true, readAt: notification.readAt || new Date().toISOString() });
  };

  const quickOpenRow = (notification) => {
    if (!notification.isRead) markRead(notification.id);
    const target = resolveNotificationTarget(notification, workspace);
    if (target) {
      navigate(target.path);
    } else {
      openRow(notification);
    }
  };

  const onDismiss = async (notification) => {
    const ok = await dismiss(notification.id);
    if (!ok) showToast("Couldn’t clear that notification. Try again in a moment.", "error");
  };

  const onMarkAll = async () => {
    if (clearingAll) return;
    setClearingAll(true);
    const ok = await markAllRead();
    setClearingAll(false);
    if (ok) {
      showToast("Everything up to now is marked as read.");
      if (readFilter !== "all") load();
    } else {
      showToast("Couldn’t mark everything as read. Try again in a moment.", "error");
    }
  };

  const { rows, total, totalPages, loading, error } = state;
  const firstLoad = (loading && rows.length === 0) || authLoading;

  if (!available && !authLoading) {
    return (
      <>
        <DashboardTopBar title="Notifications" />
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1">
          <div className="bg-white border border-slate-100 rounded-3xl shadow-xs">
            <EmptyState
              icon={HiVolumeOff}
              title="Notifications aren’t switched on"
              message="Your organisation hasn’t turned this on. Nothing is being missed — decisions, payslips and assigned work still show up on the pages they belong to."
            />
          </div>
        </main>
      </>
    );
  }

  // Live count pills for tabs
  const allCount = readFilter === "all" ? total : (tabCounts.all || total);
  const unreadTabCount = unreadCount;
  const readTabCount = readFilter === "read" ? total : Math.max(0, allCount - unreadTabCount);

  const filterTabOptions = [
    { value: "all", label: `All (${allCount})` },
    { value: "unread", label: `Unread (${unreadTabCount})` },
    { value: "read", label: `Read (${readTabCount})` },
  ];

  return (
    <>
      <DashboardTopBar title="Notifications" />
      <main className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5 max-w-7xl w-full mx-auto flex-1">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              <HelpLabel text="Notifications" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Everything that has happened to your requests, your pay and your work, newest first. Select any notification to view its details or jump straight to the item.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <DesktopAlertsStatusToggle />

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className={SECONDARY_BTN}
              aria-label="Refresh notifications"
            >
              <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>

            {unreadCount > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onMarkAll}
                  disabled={clearingAll}
                  className={PRIMARY_BTN}
                  aria-label="Mark all notifications as read"
                >
                  <HiCheck className="w-4 h-4" /> Mark all as read
                </button>
                <FieldHelp surface={SURFACE} field="mark_all_read" label="marking everything as read" size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* Compact & Dismissible Desktop Alerts Banner */}
        <PushOptInCard />

        {/* Main Notifications Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl shadow-xs overflow-hidden">
          {/* Toolbar: Segmented Tabs (left) & Category Filter (right) */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
            <FilterTabs
              options={filterTabOptions}
              value={readFilter}
              onChange={(value) => changeFilter(() => setReadFilter(value))}
            />

            <div className="flex items-center gap-2">
              <label htmlFor="notification-category" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                Category:
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  id="notification-category"
                  value={category}
                  onChange={(e) => changeFilter(() => setCategory(e.target.value))}
                  className={SELECT}
                  aria-label="Filter notifications by category"
                >
                  <option value="">Everything</option>
                  {NOTIFICATION_CATEGORIES.map((value) => (
                    <option key={value} value={value}>{CATEGORY_META[value].label}</option>
                  ))}
                </select>
                <FieldHelp surface={SURFACE} field="category" label="these groups" size="sm" />
              </div>
            </div>
          </div>

          {/* Table / List Body */}
          {firstLoad ? (
            <div className="py-2 px-2 sm:px-4"><NotificationSkeleton rows={6} /></div>
          ) : error ? (
            <div className="px-6 py-12 text-center" role="alert">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 mx-auto">
                <HiExclamationCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mt-3 max-w-md mx-auto">
                {notificationErrorMessage(error)}
              </p>
              <button
                type="button"
                onClick={load}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                <HiRefresh className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={readFilter === "unread" ? HiCheck : HiBell}
              title={
                readFilter === "unread"
                  ? "You’re all caught up"
                  : category
                    ? `No notifications in ${categoryLabel(category)}`
                    : readFilter === "read"
                      ? "No read notifications"
                      : "No notifications yet"
              }
              message={
                readFilter === "unread"
                  ? "You have no unread notifications right now."
                  : category
                    ? "No notifications found for the selected filter."
                    : readFilter === "read"
                      ? "Notifications you have already reviewed will show up here."
                      : "Decisions on your requests, new payslips and work assigned to you will show up here."
              }
              action={
                readFilter !== "all" || category ? (
                  <button
                    type="button"
                    onClick={() => changeFilter(() => { setReadFilter("all"); setCategory(""); })}
                    className={SECONDARY_BTN}
                  >
                    Show all notifications
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              {/* 1. Mobile Feed (< 768px): Stacked touch-friendly cards */}
              <ul className="md:hidden divide-y divide-slate-100">
                {rows.map((notification) => {
                  const target = resolveNotificationTarget(notification, workspace);
                  return (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={() => openRow(notification)}
                      onDismiss={() => onDismiss(notification)}
                      onQuickOpen={target ? () => quickOpenRow(notification) : undefined}
                      quickOpenLabel={target ? target.label : undefined}
                    />
                  );
                })}
              </ul>

              {/* 2. Tablet Hybrid View (768px - 1023px): 2-column hybrid rows */}
              <div className="hidden md:block lg:hidden divide-y divide-slate-100">
                {rows.map((notification) => {
                  const target = resolveNotificationTarget(notification, workspace);
                  const preview = rowPreviewProps(() => openRow(notification), "Notification details");
                  return (
                    <div
                      key={notification.id}
                      {...preview}
                      className={`px-5 py-4 flex items-center justify-between gap-4 transition-colors relative ${
                        notification.isRead ? "bg-white hover:bg-slate-50/70" : "bg-purple-50/30 hover:bg-purple-50/50"
                      }`}
                    >
                      {/* Left border accent */}
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                          notification.isRead ? "bg-transparent" : "bg-purple-600"
                        }`}
                        aria-hidden="true"
                      />

                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <CategoryIcon category={notification.category} muted={notification.isRead} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-[13px] leading-snug truncate ${
                              notification.isRead ? "font-medium text-slate-700" : "font-bold text-slate-900"
                            }`}>
                              {notification.title}
                            </p>
                            {!notification.isRead && (
                              <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" aria-label="Unread" />
                            )}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <CategoryPill category={notification.category} />
                            <span className="text-[11px] text-slate-400 font-medium">·</span>
                            <span className="text-xs font-medium text-slate-600 truncate">
                              {actorLabel(notification.actorName)}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">·</span>
                            <NotificationTime iso={notification.createdAt} className="text-xs text-slate-500 font-medium" />
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {target && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              quickOpenRow(notification);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-50 border border-purple-200 transition cursor-pointer"
                            aria-label={target.label}
                            title={target.label}
                          >
                            <span>Open</span>
                            <HiArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDismiss(notification);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                          aria-label={`Delete notification: ${notification.title}`}
                          title="Delete notification"
                        >
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 3. Desktop Full 5-Column Table (≥ 1024px) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-sm table-fixed">
                  <caption className="sr-only">
                    Your notifications, newest first. Select any row to inspect its audit details or jump directly to the target.
                  </caption>
                  <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-6 py-3.5 w-[50%]">What happened</th>
                      <th className="px-5 py-3.5 w-[14%]">About</th>
                      <th className="px-5 py-3.5 w-[16%]">Who</th>
                      <th className="px-5 py-3.5 w-[12%]">When</th>
                      <th className="px-5 py-3.5 w-[8%] text-right pr-6"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rows.map((notification) => {
                      const target = resolveNotificationTarget(notification, workspace);
                      const preview = rowPreviewProps(() => openRow(notification), "Notification details");
                      return (
                        <tr
                          key={notification.id}
                          {...preview}
                          className={`${preview.className} border-l-4 transition-colors ${
                            notification.isRead
                              ? "bg-white hover:bg-slate-50/70 border-l-transparent"
                              : "bg-purple-50/30 hover:bg-purple-50/60 border-l-purple-600"
                          }`}
                        >
                          {/* Column 1: WHAT HAPPENED */}
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <CategoryIcon category={notification.category} muted={notification.isRead} />
                              <div className="min-w-0 flex-1">
                                <p className={`text-[13px] leading-snug flex items-center gap-2 ${
                                  notification.isRead ? "font-medium text-slate-700" : "font-bold text-slate-900"
                                }`}>
                                  <span className="truncate">{notification.title}</span>
                                  {!notification.isRead && (
                                    <span
                                      className="w-2 h-2 rounded-full bg-purple-600 shrink-0"
                                      aria-label="Unread"
                                      title="Unread notification"
                                    />
                                  )}
                                </p>
                                <p className="text-xs text-slate-600 leading-relaxed mt-0.5 line-clamp-2 max-w-xl">
                                  {notification.message}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Column 2: ABOUT */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <CategoryPill category={notification.category} />
                          </td>

                          {/* Column 3: WHO (with tiny initial avatar) */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px] flex items-center justify-center shrink-0 border border-purple-100">
                                {actorLabel(notification.actorName).charAt(0).toUpperCase()}
                              </span>
                              <span className="text-xs font-medium text-slate-700 truncate" title={actorLabel(notification.actorName)}>
                                {actorLabel(notification.actorName)}
                              </span>
                            </div>
                          </td>

                          {/* Column 4: WHEN */}
                          <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                            <NotificationTime iso={notification.createdAt} className="text-slate-500" />
                          </td>

                          {/* Column 5: ACTIONS */}
                          <td className="px-5 py-4 text-right pr-6 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 justify-end">
                              {target && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    quickOpenRow(notification);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition cursor-pointer"
                                  aria-label={target.label}
                                  title={target.label}
                                >
                                  <HiExternalLink className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDismiss(notification);
                                }}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                                aria-label={`Delete notification: ${notification.title}`}
                                title="Delete notification"
                              >
                                <HiTrash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination with aria-live */}
              <div aria-live="polite">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                  disabled={loading}
                  noun="notification"
                  className="px-5 sm:px-6 py-4 border-t border-slate-100"
                />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Detail Modal Overlay */}
      {selected && (
        <NotificationInspector
          notification={selected}
          target={resolveNotificationTarget(selected, workspace)}
          onOpenTarget={() => {
            const target = resolveNotificationTarget(selected, workspace);
            setSelected(null);
            if (target) navigate(target.path);
          }}
          onMarkRead={async () => {
            await markRead(selected.id);
            setSelected((n) => (n ? { ...n, isRead: true, readAt: n.readAt || new Date().toISOString() } : n));
          }}
          onDismiss={async () => {
            const ok = await dismiss(selected.id);
            setSelected(null);
            if (!ok) showToast("Couldn’t clear that notification. Try again in a moment.", "error");
          }}
          onClose={() => setSelected(null)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
