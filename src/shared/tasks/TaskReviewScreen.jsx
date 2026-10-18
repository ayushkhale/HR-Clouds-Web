// ─────────────────────────────────────────────────────────────────────────────
// TaskReviewScreen.jsx — The one screen behind BOTH review pages in BOTH
// reviewing workspaces: "Tasks I Assigned" and "All Tasks", for a manager and
// for HR. Four pages, one component, two props (CLAUDE.md §2).
//
//   scope="assigned" → #256, what this person handed out
//   scope="all"      → #257 for a manager (their reports) / #266 for HR (the
//                      whole organisation, plus a department filter)
//
// `viewer` picks the endpoints through taskPlanes.js and NOTHING else. The
// layout, the column order, the dialog shape and the wording are identical for
// a manager and for HR, because a manager who is promoted to HR must gain
// reach, not a new screen to learn. The only visible difference is the
// department filter, which exists because only #266 has one — a field hidden
// by a flag, never a forked screen.
//
// Traps:
//
// • READING A SUBORDINATE'S TASK MUST NOT TOUCH THE READ RECEIPT. #258/#267 are
//   separate endpoints from #250 precisely so a manager browsing the queue
//   can't make a task look as though the assignee had opened it. The plane
//   adapter owns that; never swap in `getMyTask` here "because it's the same
//   task".
//
// • "Opened" ONLY MAKES SENSE ON A LIST THE VIEWER ASSIGNED. #256 returns
//   `is_viewed`/`first_viewed_at`; the team and organisation reads don't
//   promise them, and a withheld field must not render as "N/A" (the documents
//   module's rule), so the column is gated on the scope rather than on the
//   value.
//
// • THE DECISIONS THEMSELVES LIVE IN TaskReviewActions, which is also the
//   footer of the Tasks tab on an employee record. It owns the `TASK` event
//   every decision must emit (§7) and the 412 reload; this screen only says so
//   and reloads its own page.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { HiClipboardList, HiPlus } from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import FeatureNotAvailable from "../components/FeatureNotAvailable";
import { organizationAPI } from "../api";
import { usePagedList } from "../attendance/usePagedList";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, Toast, useToast } from "../attendance/ui";
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from "../attendance/events";
import { listFrom } from "../attendance/normalize";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import { isTaskFeatureDisabled, taskErrorMessage } from "../utils/taskErrors";
import TaskTable from "./TaskTable";
import TaskDetailDialog from "./TaskDetailDialog";
import TaskFilterBar from "./TaskFilterBar";
import AssignTaskDialog from "./AssignTaskDialog";
import TaskReviewActions from "./TaskReviewActions";
import { taskPlaneFor } from "./taskPlanes";
import { TASK_STATUS_FILTERS } from "./taskMeta";

const SCOPES = {
  assigned: {
    title: "Tasks I Assigned",
    blurb: "Work you’ve handed out, and where each piece has got to. Open one to approve it, send it back or move its deadline.",
    person: "assignee",
    showOpened: true,
    surface: "tasks.assigned_tasks",
    emptyTitle: "You haven’t given out any tasks",
    emptyMessage: "Give somebody a task and it appears here with its deadline and progress.",
  },
  all: {
    title: "All Tasks",
    blurb: "Every task in your reach, whoever gave it out — so nothing sits unopened or past its deadline unnoticed.",
    person: "assignee",
    showOpened: false,
    surface: "tasks.all_tasks",
    emptyTitle: "No tasks to show",
    emptyMessage: "Tasks appear here as soon as somebody in your reach is given one.",
  },
};

/**
 * @param {object} props
 * @param {"manager"|"hr"} props.viewer
 * @param {"assigned"|"all"} props.scope
 * @param {string} [props.initialStatus]  the tab to open on — the inbox opens
 *   this screen on "in_review", which is the queue its count came from.
 */
export default function TaskReviewScreen({ viewer = "manager", scope = "assigned", initialStatus = "" }) {
  const adapter = taskPlaneFor(viewer);
  const config = SCOPES[scope] || SCOPES.assigned;
  const isOrgScope = scope === "all" && viewer === "hr";

  const [filters, setFilters] = useState({ status: initialStatus, priority: "", category: "", search: "", department_id: "" });
  const [selected, setSelected] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [departments, setDepartments] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  // Only the organisation registry can filter by department (#266), so the
  // other three pages never send the key and never read the list.
  const query = useMemo(() => {
    const { department_id, ...rest } = filters;
    return isOrgScope && department_id ? { ...rest, department_id } : rest;
  }, [filters, isOrgScope]);

  const filterKey = JSON.stringify(query);
  const fetchPage = useCallback(
    ({ page, limit }) => (scope === "all" ? adapter.teamList : adapter.list)({ page, limit, ...query }),
    // `adapter` is derived from `viewer`, which is fixed for a mounted screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, viewer, filterKey]
  );
  const list = usePagedList(fetchPage, { limit: 20, keys: ["tasks"], filterKey });

  useAttendanceChanged([ATTENDANCE_EVENTS.TASK], list.reload);

  useEffect(() => {
    if (!isOrgScope) return undefined;
    let alive = true;
    organizationAPI.getDepartments()
      .then((res) => {
        if (!alive) return;
        setDepartments(listFrom(res, ["departments"]).map((d) => ({ id: d.id, name: d.name })).filter((d) => d.id && d.name));
      })
      // A department list that won't load simply means no department filter,
      // not a broken page: gate the control on what came back (§7).
      .catch(() => alive && setDepartments([]));
    return () => { alive = false; };
  }, [isOrgScope]);

  if (isTaskFeatureDisabled(list.error)) {
    return (
      <>
        <DashboardTopBar title={config.title} />
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1">
          <FeatureNotAvailable title="Tasks aren’t switched on" message={taskErrorMessage(list.error)} />
        </main>
      </>
    );
  }

  const help = (field) => ({ surface: config.surface, field });

  return (
    <>
      <DashboardTopBar title={config.title} />
      <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text={config.title} help={help("page")} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">{config.blurb}</p>
          </div>
          <button
            type="button"
            onClick={() => setAssigning(true)}
            className="inline-flex items-center gap-2 shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition"
          >
            <HiPlus className="w-4 h-4" /> Give out a task
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Two rows, not the usual tabs-left/search-right: seven sentence
              labels need the whole width to stay on one line (TaskFilterBar's
              header has the measurements). */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 space-y-3">
            <FilterTabs
              className="w-full"
              options={TASK_STATUS_FILTERS}
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
            />
            <TaskFilterBar
              filters={filters}
              onChange={setFilters}
              departments={isOrgScope && departments?.length ? departments : null}
              departmentHelp={help("department_id")}
            />
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn’t load these tasks." />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-6"><LoadingRows rows={5} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState icon={HiClipboardList} title={config.emptyTitle} message={config.emptyMessage} />
          ) : (
            <>
              <div className={list.loading ? "opacity-60" : ""}>
                <TaskTable
                  rows={list.items}
                  onOpen={setSelected}
                  person={config.person}
                  showOpened={config.showOpened}
                  help={{ status: help("status"), deadline: help("due_date"), opened: help("is_viewed") }}
                />
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
          plane={viewer}
          onClose={() => setSelected(null)}
          onChanged={list.reload}
          footer={({ task, onActionError }) => (
            <TaskReviewActions
              task={task}
              viewer={viewer}
              onActionError={onActionError}
              onDone={(message) => { showToast(message); setSelected(null); list.reload(); }}
            />
          )}
        />
      )}

      {assigning && (
        <AssignTaskDialog
          plane={viewer}
          onClose={() => setAssigning(false)}
          onCreated={() => {
            setAssigning(false);
            showToast("Task given out. They’ve been told about it.");
            emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { action: "create" });
            list.reload();
          }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
