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
// • EVERY DECISION EMITS `TASK` (§7). The review queue is counted in the
//   sidebar badge and the inbox, and there is no query cache, so an approval
//   that doesn't emit leaves a stale number until F5.
//
// • A 412 MEANS SOMEBODY ELSE GOT THERE FIRST. Two managers can both be
//   looking at the same submission. The dialog reloads the record and keeps
//   itself open; the action dialog keeps what was typed.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiBan, HiCalendar, HiCheckCircle, HiClipboardList, HiPlus, HiRefresh, HiSwitchHorizontal,
} from "react-icons/hi";
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
import TaskDetailDialog, { TaskFooterNote } from "./TaskDetailDialog";
import TaskFilterBar from "./TaskFilterBar";
import AssignTaskDialog from "./AssignTaskDialog";
import {
  ApproveTaskDialog, CancelTaskDialog, ExtendDueDateDialog, ReassignTaskDialog, ReopenTaskDialog,
} from "./TaskReviewDialogs";
import { taskPlaneFor } from "./taskPlanes";
import { TASK_STATUS_FILTERS, isAwaitingReview, isTaskTerminal, reopenRule } from "./taskMeta";

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

/** Which dialog is open over the record inspector. */
const NO_ACTION = { kind: "", busy: false, error: "" };

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
  const [action, setAction] = useState(NO_ACTION);
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

  const closeAction = () => setAction(NO_ACTION);

  /**
   * Run one review action. `onActionError` comes from the record inspector so a
   * 412 reloads the record there and the message says what actually happened.
   */
  const runAction = (task, call, successMessage, onActionError) => async (payload) => {
    setAction((a) => ({ ...a, busy: true, error: "" }));
    try {
      await call(task.id, payload, task);
      showToast(successMessage);
      emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { id: task.id });
      closeAction();
      setSelected(null);
      list.reload();
    } catch (err) {
      setAction((a) => ({ ...a, busy: false, error: onActionError(err, "Couldn’t do that to this task.") }));
    }
  };

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
          onClose={() => { setSelected(null); closeAction(); }}
          onChanged={list.reload}
          footer={({ task, onActionError }) => (
            <TaskReviewFooter
              task={task}
              viewer={viewer}
              onPick={(kind) => setAction({ kind, busy: false, error: "" })}
              onActionError={onActionError}
              action={action}
              adapter={adapter}
              runAction={runAction}
              onCloseAction={closeAction}
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

/**
 * The record inspector's footer: the buttons this viewer may press, plus
 * whichever reason prompt is open. The prompts render here as SIBLINGS of the
 * footer rather than children of the inspector's body, so their z-170 layer
 * sits above the z-140 inspector (§3 stacking).
 */
function TaskReviewFooter({ task, viewer, onPick, onActionError, action, adapter, runAction, onCloseAction }) {
  const terminal = isTaskTerminal(task);
  const awaiting = isAwaitingReview(task);
  const canReopen = reopenRule(task, viewer).allowed;

  const BUTTON = "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50";
  const QUIET = `${BUTTON} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`;
  const OUTLINE = `${BUTTON} bg-white border border-purple-200 text-purple-700 hover:bg-purple-50`;
  const PRIMARY = `${BUTTON} text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200`;
  const DANGER = `${BUTTON} bg-white border border-rose-200 text-rose-700 hover:bg-rose-50`;

  return (
    <>
      <TaskFooterNote task={task} plane={viewer} />

      {!terminal && (
        <>
          <button type="button" onClick={() => onPick("cancel")} className={DANGER}>
            <HiBan className="w-4 h-4" /> Call it off
          </button>
          <button type="button" onClick={() => onPick("extend")} className={QUIET}>
            <HiCalendar className="w-4 h-4" /> Move the deadline
          </button>
          <button type="button" onClick={() => onPick("reassign")} className={QUIET}>
            <HiSwitchHorizontal className="w-4 h-4" /> Hand it over
          </button>
        </>
      )}

      {canReopen && (
        <button type="button" onClick={() => onPick("reopen")} className={OUTLINE}>
          <HiRefresh className="w-4 h-4" /> {awaiting ? "Send back for changes" : "Reopen the task"}
        </button>
      )}

      {awaiting && (
        <button type="button" onClick={() => onPick("approve")} className={PRIMARY}>
          <HiCheckCircle className="w-4 h-4" /> Approve
        </button>
      )}

      {action.kind === "approve" && (
        <ApproveTaskDialog
          task={task}
          busy={action.busy}
          error={action.error}
          onConfirm={runAction(task, adapter.approve, "Approved. They’ve been told.", onActionError)}
          onClose={onCloseAction}
        />
      )}
      {action.kind === "reopen" && (
        <ReopenTaskDialog
          task={task}
          plane={viewer}
          busy={action.busy}
          error={action.error}
          onConfirm={runAction(task, adapter.reopen, "Sent back with your notes.", onActionError)}
          onClose={onCloseAction}
        />
      )}
      {action.kind === "reassign" && (
        <ReassignTaskDialog
          task={task}
          plane={viewer}
          busy={action.busy}
          error={action.error}
          onConfirm={runAction(task, adapter.reassign, "Handed over. The new person has been told.", onActionError)}
          onClose={onCloseAction}
        />
      )}
      {action.kind === "cancel" && (
        <CancelTaskDialog
          task={task}
          busy={action.busy}
          error={action.error}
          onConfirm={runAction(task, adapter.cancel, "Task called off.", onActionError)}
          onClose={onCloseAction}
        />
      )}
      {action.kind === "extend" && (
        <ExtendDueDateDialog
          task={task}
          busy={action.busy}
          error={action.error}
          onConfirm={runAction(task, adapter.extend, "Deadline moved. They’ve been told.", onActionError)}
          onClose={onCloseAction}
        />
      )}
    </>
  );
}
