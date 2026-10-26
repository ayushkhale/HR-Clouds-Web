// ─────────────────────────────────────────────────────────────────────────────
// MyTasksPage.jsx — The work somebody has been given (#249–#252).
//
// Mounted in ALL THREE workspaces under each one's own prefix (TASK_PATHS),
// because `/tasks/me` accepts every tenant role: HR admins and managers are
// given tasks like anyone else, and the route gate is exact, so each workspace
// needs its own mount rather than a widened one (CLAUDE.md §2).
//
// Traps:
//
// • THE DETAIL READ IS A WRITE. #250 stamps `first_viewed_at` the first time
//   the assignee opens it — which is the point of the feature. So the row opens
//   the dialog and the DIALOG does the read; nothing here prefetches a detail,
//   and the unread count in the tab labels would be a lie if it did.
//
// • "Not opened yet" IS A FILTER THE SERVER OWNS (`is_viewed`), not something
//   derived here, so it keeps working across pages.
//
// • AFTER ANY WRITE THE ROW IS RELOADED, NOT PATCHED. #251 and #252 return a
//   partial task (status, version, timestamps), and merging that over a list
//   row left `is_overdue` and the person summaries stale. One reload of the
//   page is cheaper than a wrong row.
//
// • EVERY DECISION EMITS `TASK` ON THE EVENT BUS (§7). Handing work in adds an
//   item to a reviewer's inbox, and the sidebar badge has no query cache to
//   invalidate, so it only clears or grows if the emit happens.
//
// • `view="overdue"` IS THE SAME PAGE, not a second one (14 Oct 2026). It pins
//   the server's `is_overdue` filter on and changes the heading, the blurb and
//   the empty state; everything else — tabs, search, columns, dialogs — is
//   identical, because it is the same list of the same work. It drops the Done
//   and Cancelled status tabs: the server defines overdue as past the deadline
//   AND not finished, so those two tabs could only ever return nothing, and
//   §5's "drop a column no row can fill" applies to a tab just as much.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiClipboardCheck, HiPlay, HiPause, HiUpload } from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import { tasksAPI } from "../api";
import { usePagedList } from "../attendance/usePagedList";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, Spinner, Toast, useToast } from "../attendance/ui";
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from "../attendance/events";
import { useTaskPaths } from "../attendance/paths";
import FeatureNotAvailable from "../components/FeatureNotAvailable";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import { isTaskFeatureDisabled, taskErrorMessage } from "../utils/taskErrors";
import TaskTable from "../tasks/TaskTable";
import TaskDetailDialog, { TaskFooterNote } from "../tasks/TaskDetailDialog";
import SubmitTaskDialog from "../tasks/SubmitTaskDialog";
import TaskFilterBar from "../tasks/TaskFilterBar";
import { TASK_STATUS_FILTERS, TERMINAL_TASK_STATUSES, canChangeOwnStatus, canSubmitTask, nextOwnStatus } from "../tasks/taskMeta";

const PAGE_HELP = { surface: "tasks.my_tasks", field: "page" };
const OVERDUE_HELP = { surface: "tasks.my_tasks", field: "is_overdue" };

// Everything the two views say differently, in one place, so a wording change
// can't land on one of them and miss the other.
const VIEWS = {
  all: {
    title: "My Tasks",
    help: PAGE_HELP,
    blurb: "Work your manager or HR has given you, with the nearest deadline first. Open one to read the brief and hand it in.",
    emptyTitle: "Nothing on your plate",
    emptyMessage: "Tasks appear here when your manager or HR gives you one. Nothing to do for now.",
    tabs: TASK_STATUS_FILTERS,
    params: {},
  },
  overdue: {
    title: "Overdue Tasks",
    help: OVERDUE_HELP,
    blurb: "Work that is past its deadline and still not handed in. Hand one in and it leaves this list.",
    emptyTitle: "Nothing overdue",
    emptyMessage: "Everything you’ve been given is either still inside its deadline or already handed in.",
    tabs: TASK_STATUS_FILTERS.filter((tab) => !TERMINAL_TASK_STATUSES.includes(tab.value)),
    params: { is_overdue: true },
  },
};
const COLUMN_HELP = {
  status: { surface: "tasks.my_tasks", field: "status" },
  deadline: { surface: "tasks.my_tasks", field: "due_date" },
};

/** @param {{ view?: "all"|"overdue" }} props */
export default function MyTasksPage({ view = "all" }) {
  const copy = VIEWS[view] || VIEWS.all;
  const { taskId } = useParams();
  const navigate = useNavigate();
  const taskPaths = useTaskPaths();
  const listPath = (view === "overdue" ? taskPaths?.overdue : taskPaths?.mine) || null;

  const [filters, setFilters] = useState({ status: "", priority: "", category: "", search: "" });
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast, showToast, clearToast } = useToast();

  // `view` is in the key as well as the filters: the two views are separate
  // routes so the component remounts between them, but a shared key would
  // quietly serve one view's page 2 to the other if that ever changed.
  const filterKey = JSON.stringify({ view, ...filters });
  const list = usePagedList(
    ({ page, limit }) => tasksAPI.getMyTasks({ page, limit, ...filters, ...copy.params }),
    { limit: 20, keys: ["tasks"], filterKey }
  );

  // Somebody reassigning a task to me, or moving its deadline, changes this list.
  useAttendanceChanged([ATTENDANCE_EVENTS.TASK], list.reload);

  const reload = useCallback(() => list.reload(), [list]);

  // Deep link: opening /dashboard/*/my-tasks/:taskId opens the TaskDetailDialog
  useEffect(() => {
    if (!taskId) return;
    const found = list.items?.find((t) => t.id === taskId);
    if (found) {
      setSelected(found);
    } else {
      setSelected((curr) => (curr?.id === taskId ? curr : { id: taskId }));
    }
  }, [taskId, list.items]);

  const closeDetail = useCallback(() => {
    setSelected(null);
    reload();
    if (taskId && listPath) {
      navigate(listPath, { replace: true });
    }
  }, [taskId, listPath, navigate, reload]);

  const toggleStatus = async (task, onError) => {
    const target = nextOwnStatus(task);
    if (!target) return;
    setBusy(true);
    try {
      await tasksAPI.updateMyTaskStatus(task.id, target, task);
      showToast(target === "in_progress" ? "Marked as being worked on." : "Put back to not started.");
      emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { id: task.id, action: "status" });
      reload();
      setSelected(null);
      if (taskId && listPath) navigate(listPath, { replace: true });
    } catch (err) {
      const message = onError ? onError(err, "Couldn’t update this task.") : taskErrorMessage(err);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handIn = async (payload) => {
    const task = submitting;
    await tasksAPI.submitMyTask(task.id, payload, task);
    showToast("Handed in. Your reviewer has been told.");
    emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { id: task.id, action: "submit" });
    setSubmitting(null);
    setSelected(null);
    reload();
    if (taskId && listPath) navigate(listPath, { replace: true });
  };

  if (isTaskFeatureDisabled(list.error)) {
    return (
      <>
        <DashboardTopBar title={copy.title} />
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1">
          <FeatureNotAvailable
            title="Tasks aren’t switched on"
            message={taskErrorMessage(list.error)}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <DashboardTopBar title={copy.title} />
      <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
        <div>
          {/* Sidebar label = this h1 = the top bar title, in every workspace (§2). */}
          <h1 className="text-2xl font-bold text-slate-900">
            <HelpLabel text={copy.title} help={copy.help} />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{copy.blurb}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Two rows, not the usual tabs-left/search-right: seven sentence
              labels need the whole width to stay on one line (TaskFilterBar's
              header has the measurements). Same arrangement on all three task
              lists, so the review pages and this one match (§2). */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 space-y-3">
            <FilterTabs className="w-full" options={copy.tabs} value={filters.status} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
            <TaskFilterBar filters={filters} onChange={setFilters} />
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn’t load your tasks." />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-6"><LoadingRows rows={5} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={HiClipboardCheck}
              title={copy.emptyTitle}
              message={copy.emptyMessage}
            />
          ) : (
            <>
              <div className={list.loading ? "opacity-60" : ""}>
                <TaskTable rows={list.items} onOpen={setSelected} person="assigner" help={COLUMN_HELP} />
              </div>
              <div className="px-6 py-4 border-t border-slate-100">
                <Pagination page={list.page} totalPages={list.totalPages} total={list.total} limit={list.limit} onPageChange={list.setPage} disabled={list.loading} noun="task" />
              </div>
            </>
          )}
        </div>
      </main>

      {selected && (
        <TaskDetailDialog
          task={selected}
          plane="me"
          onClose={closeDetail}
          onChanged={reload}
          footer={({ task, onActionError }) => (
            <>
              <TaskFooterNote task={task} plane="me" />
              {canChangeOwnStatus(task) && (
                <button
                  type="button"
                  onClick={() => toggleStatus(task, onActionError)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 transition disabled:opacity-50"
                >
                  {busy ? <Spinner /> : nextOwnStatus(task) === "in_progress" ? <HiPlay className="w-4 h-4" /> : <HiPause className="w-4 h-4" />}
                  {nextOwnStatus(task) === "in_progress" ? "Start work" : "Put back to not started"}
                </button>
              )}
              {canSubmitTask(task) && (
                <button
                  type="button"
                  onClick={() => setSubmitting(task)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition"
                >
                  <HiUpload className="w-4 h-4" /> Hand in for review
                </button>
              )}
            </>
          )}
        />
      )}

      {/* A sibling of the record inspector, never a child (§3 stacking). */}
      {submitting && (
        <SubmitTaskDialog task={submitting} onSubmit={handIn} onClose={() => setSubmitting(null)} />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
