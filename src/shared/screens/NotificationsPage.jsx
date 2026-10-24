// ─────────────────────────────────────────────────────────────────────────────
// NotificationsPage — the whole feed: filter it, read it, clear it.
//
// Mounted in all three workspaces under each one's own prefix
// (`NOTIFICATION_PATHS`). Every org role has an inbox — the endpoints are
// scoped to the caller and there is no manager or HR view of somebody else's —
// so this is one screen with no `viewer` prop and no role branches at all (§2).
// The only thing that differs between workspaces is where a row's "Open …"
// button goes, and notificationTargets.js owns that.
//
// ─── WHY A TABLE AND NOT A FEED OF CARDS (§3) ──────────────────────────────
// The bell panel is the feed. This page is the archive, and the questions
// asked of an archive are tabular ones: what, from which part of the product,
// from whom, when. Tall cards were rejected for exactly this. The first column
// carries the title with the message under it, because the message is the one
// column whose length is unpredictable and it is what makes a row scannable.
//
// ─── THE LIST AND THE BELL SHARE NO STATE, AND STAY IN STEP ANYWAY ─────────
// This page pages through the whole feed; the bell holds the newest twelve.
// Both subscribe to the store's change stream, so marking one read here moves
// the badge and the panel's copy without a refetch, and vice versa.
//
// ─── CONTRACT TRAPS ────────────────────────────────────────────────────────
// · AN UNKNOWN QUERY PARAMETER IS A 400, so filters go through the api
//   module's fixed four and nothing else.
// · `limit` IS CAPPED AT 50 server-side. 20 here, well under it.
// · MARK-ALL-READ IS WATERMARKED to the request moment: a notification that
//   lands mid-request stays unread. The store re-reads the badge rather than
//   assuming zero, so do not "fix" a badge that is 1 after clearing.
// · DISMISS IS A HARD DELETE. The business event it describes is audited by
//   its own module, so nothing is lost — but the notification does not come
//   back, which is why the inspector's footer says so.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiBell, HiVolumeOff, HiCheck, HiExclamationCircle, HiRefresh, HiTrash,
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
  CATEGORY_META, NOTIFICATION_CATEGORIES, actorLabel, categoryLabel, normalizeNotification, badgeLabel,
} from "../notifications/notificationMeta";
import { notificationErrorMessage } from "../notifications/notificationErrors";
import NotificationRow, {
  CategoryIcon, NotificationSkeleton, NotificationTime,
} from "../notifications/NotificationRow";
import NotificationInspector from "../notifications/NotificationInspector";
import PushOptInCard from "../notifications/PushOptInCard";
import { resolveNotificationTarget } from "../notifications/notificationTargets";

const SURFACE = "notification.inbox";
const PAGE_SIZE = 20;

const READ_TABS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();
  const workspace = useCurrentWorkspace();
  const {
    available, unreadCount, unreadCapped, markRead, markAllRead, dismiss, subscribeChange,
  } = useNotifications();
  const { toast, showToast, clearToast } = useToast();

  const [readFilter, setReadFilter] = useState("all");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, totalPages: 1, loading: true, error: null });
  const [selected, setSelected] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);

  // Guards a late reply from overwriting a newer one (§7): changing a filter
  // fires a request and the previous one may still be in flight.
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
      setState({
        rows: (data.items || []).map(normalizeNotification).filter(Boolean),
        total: Number(data.pagination?.total) || 0,
        totalPages: Math.max(1, Number(data.pagination?.total_pages) || 1),
        loading: false,
        error: null,
      });
    } catch (error) {
      if (token !== tokenRef.current) return;
      setState({ rows: [], total: 0, totalPages: 1, loading: false, error });
    }
  }, [available, page, readFilter, category]);

  useEffect(() => { load(); }, [load]);

  // A change made anywhere — this page, the bell panel, a row's own button —
  // is applied to the copy held here rather than re-read from the server.
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
      // The "Unread" tab is now a different list; the others only changed state.
      if (readFilter !== "all") load();
    } else {
      showToast("Couldn’t mark everything as read. Try again in a moment.", "error");
    }
  };

  const { rows, total, totalPages, loading, error } = state;
  const firstLoad = (loading && rows.length === 0) || authLoading;

  // The kill switch hides the bell and the sidebar link, so nobody arrives here
  // by clicking — only by a bookmark or a pasted URL. It is not "coming soon"
  // (it is built, and ops turned it off), so it gets a quiet card, not the
  // roadmap placeholder.
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

  return (
    <>
      <DashboardTopBar title="Notifications" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="Notifications" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Everything that has happened to your requests, your pay and your work, newest first. Opening one takes
              you to the thing it is about.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={load} disabled={loading} className={SECONDARY_BTN}>
              <HiRefresh className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {unreadCount > 0 && (
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={onMarkAll} disabled={clearingAll} className={PRIMARY_BTN}>
                  <HiCheck className="w-4 h-4" /> Mark all as read
                </button>
                <FieldHelp surface={SURFACE} field="mark_all_read" label="marking everything as read" size="sm" />
              </div>
            )}
          </div>
        </div>

        <PushOptInCard />

        <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
          {/* Tabs left, filter right — the house arrangement (§5). */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <FilterTabs
              options={READ_TABS.map((tab) => (
                tab.value === "unread" && unreadCount > 0
                  ? { ...tab, label: `Unread (${badgeLabel(unreadCount, unreadCapped)})` }
                  : tab
              ))}
              value={readFilter}
              onChange={(value) => changeFilter(() => setReadFilter(value))}
            />
            <div className="flex items-center gap-1.5">
              <label htmlFor="notification-category" className="sr-only">Filter by part of the product</label>
              <select
                id="notification-category"
                value={category}
                onChange={(e) => changeFilter(() => setCategory(e.target.value))}
                className={SELECT}
              >
                <option value="">Everything</option>
                {NOTIFICATION_CATEGORIES.map((value) => (
                  <option key={value} value={value}>{CATEGORY_META[value].label}</option>
                ))}
              </select>
              <FieldHelp surface={SURFACE} field="category" label="these groups" size="sm" />
            </div>
          </div>

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
              icon={HiBell}
              title={readFilter === "unread" ? "Nothing unread" : category ? `Nothing about ${categoryLabel(category).toLowerCase()} yet` : "You’re all caught up"}
              message={
                readFilter === "unread"
                  ? "You’ve read everything that has come in."
                  : "Decisions on your requests, new payslips and work assigned to you will show up here."
              }
              action={readFilter !== "all" || category ? (
                <button
                  type="button"
                  onClick={() => changeFilter(() => { setReadFilter("all"); setCategory(""); })}
                  className={SECONDARY_BTN}
                >
                  Show everything
                </button>
              ) : null}
            />
          ) : (
            <>
              {/* From lg up, the archive is a table. Below it, the same rows as
                  the bell panel renders — a four-column table on a phone is a
                  horizontal scroll nobody performs. */}
              <ul className="lg:hidden divide-y divide-slate-50">
                {rows.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onOpen={() => openRow(notification)}
                    onDismiss={() => onDismiss(notification)}
                  />
                ))}
              </ul>

              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Your notifications, newest first. Open a row for the whole message and where it leads.
                  </caption>
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-6 py-3.5">What happened</th>
                      <th className="px-6 py-3.5 w-40">About</th>
                      <th className="px-6 py-3.5 w-44">Who</th>
                      <th className="px-6 py-3.5 w-40">When</th>
                      <th className="px-6 py-3.5 w-16"><span className="sr-only">Clear</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rows.map((notification) => {
                      const preview = rowPreviewProps(() => openRow(notification), "Notification details");
                      return (
                      <tr
                        key={notification.id}
                        {...preview}
                        className={`${preview.className} ${notification.isRead ? "" : "bg-purple-50/30"}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <CategoryIcon category={notification.category} muted={notification.isRead} />
                            <div className="min-w-0">
                              <p className={`text-[13px] leading-snug flex items-center gap-2 ${notification.isRead ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>
                                <span className="truncate">{notification.title}</span>
                                {!notification.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" aria-label="Unread" />
                                )}
                              </p>
                              <p className="text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2 max-w-xl">
                                {notification.message}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                          {categoryLabel(notification.category)}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600 truncate">
                          {actorLabel(notification.actorName)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                          <NotificationTime iso={notification.createdAt} />
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDismiss(notification);
                            }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                            aria-label={`Clear “${notification.title}”`}
                            title="Clears it for good"
                          >
                            <HiTrash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

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
            </>
          )}
        </div>
      </main>

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
