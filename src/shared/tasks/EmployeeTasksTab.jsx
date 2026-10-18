// ─────────────────────────────────────────────────────────────────────────────
// EmployeeTasksTab.jsx — The work ONE person is carrying, on their own record:
// the Tasks tab of an employee profile, in the HR and the manager workspace.
// One component, one `viewer` prop (CLAUDE.md §2) — a manager promoted to HR
// gains reach, not a new screen.
//
// WHICH ENDPOINT, AND WHY NOT THE SAME ONE:
//   hr      → #266 `GET /tasks/hr` with `assignee_id`     — anyone in the org
//   manager → #257 `GET /tasks/manager/team-tasks` with `subordinate_id`
//             — validated against the reporting tree, so a person who is not
//             a direct report is a 403 (`CANNOT_ACCESS_OUTSIDE_HIERARCHY`),
//             which taskErrors words as "that person doesn't report to you".
// Both are "work this person was given, whoever gave it out" — NOT #256, which
// is "work I handed out" and would hide a task HR assigned them.
//
// THE COLUMN SHOWS WHO GAVE IT OUT, not who it's for: every row here belongs
// to the same person, so repeating their name six times would waste the one
// column that could answer "who is loading them up?".
//
// NO READ-RECEIPT COLUMN. `is_viewed` is only promised by #256, and a withheld
// field must not render as "N/A", so the column is gated on the endpoint rather
// than on the value (the rule TaskReviewScreen's header spells out).
//
// THE TWO COUNTS COME FROM ONE SUMMARY READ. "Waiting for review" and "Past
// deadline" are the only two things somebody opening a colleague's record acts
// on, and neither can be derived from the page in hand (a filtered list knows
// its own total and nothing else). `summary` (#257a / #266a, 2026-10-18)
// returns both in a single aggregation query — it replaced two `limit: 1`
// reads. If it fails the tiles are simply absent, never a dash (§5).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { HiClipboardList, HiExclamationCircle, HiInbox, HiPlus } from "react-icons/hi";
import FeatureNotAvailable from "../components/FeatureNotAvailable";
import { DetailSection } from "../components/DetailDialog";
import { usePagedList } from "../attendance/usePagedList";
import { EmptyState, ErrorState, FilterTabs, LoadingRows, Pagination, Toast, useToast } from "../attendance/ui";
import { ATTENDANCE_EVENTS, emitAttendanceChanged, useAttendanceChanged } from "../attendance/events";
import { isTaskFeatureDisabled, taskErrorMessage } from "../utils/taskErrors";
import TaskTable from "./TaskTable";
import TaskDetailDialog from "./TaskDetailDialog";
import TaskFilterBar from "./TaskFilterBar";
import TaskReviewActions from "./TaskReviewActions";
import AssignTaskDialog from "./AssignTaskDialog";
import { taskPlaneFor } from "./taskPlanes";
import { TASK_STATUS_FILTERS } from "./taskMeta";

const SURFACE = "tasks.employee_tasks";
const help = (field) => ({ surface: SURFACE, field });

/** The query key that narrows a reviewing list to one person, per endpoint. */
const SCOPE_KEY = { hr: "assignee_id", manager: "subordinate_id" };

const NO_FILTERS = { status: "", priority: "", category: "", search: "" };

/** One headline number. Absent when the count didn't load — never a dash (§5). */
function CountTile({ icon: Icon, label, value, tone = "purple" }) {
  const tones = {
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
  };
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <Icon className="w-5 h-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
        <p className="text-[11px] font-bold uppercase tracking-wider mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.userId          whose work this is
 * @param {string} [props.name]          their name, for the dialogs' copy
 * @param {"hr"|"manager"} [props.viewer]
 */
export default function EmployeeTasksTab({ userId, name = "", viewer = "hr" }) {
  const adapter = taskPlaneFor(viewer);
  const scopeKey = SCOPE_KEY[viewer] || SCOPE_KEY.manager;

  const [filters, setFilters] = useState(NO_FILTERS);
  const [selected, setSelected] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [counts, setCounts] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  const scoped = useMemo(() => ({ [scopeKey]: userId, ...filters }), [scopeKey, userId, filters]);
  const filterKey = JSON.stringify(scoped);

  const fetchPage = useCallback(
    ({ page, limit }) => adapter.teamList({ page, limit, ...scoped }),
    // `adapter` is derived from `viewer`, which is fixed for a mounted tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewer, filterKey],
  );
  const list = usePagedList(fetchPage, { limit: 10, keys: ["tasks"], filterKey, enabled: !!userId });

  // The two counts, re-read whenever anything in the module changes so a
  // decision taken in the dialog doesn't leave a stale number behind (§7). One
  // aggregation read (#257a / #266a), not a count per tile; a withheld or
  // failed figure stays null so its tile is absent rather than a dash (§5).
  const loadCounts = useCallback(() => {
    if (!userId || !adapter.summary) return undefined;
    let cancelled = false;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    adapter.summary({ [scopeKey]: userId })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        setCounts({ inReview: num(d.by_status?.in_review), overdue: num(d.overdue) });
      })
      .catch(() => { if (!cancelled) setCounts(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, scopeKey, userId]);

  useEffect(() => loadCounts(), [loadCounts]);

  // `list.reload` is stable; depending on `list` itself would resubscribe the
  // event listener below on every render.
  const reloadList = list.reload;
  const refresh = useCallback(() => { reloadList(); loadCounts(); }, [reloadList, loadCounts]);
  useAttendanceChanged([ATTENDANCE_EVENTS.TASK], refresh);

  const first = name ? name.split(" ")[0] : "them";

  if (isTaskFeatureDisabled(list.error)) {
    return <FeatureNotAvailable title="Tasks aren’t switched on" message={taskErrorMessage(list.error)} />;
  }

  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <DetailSection
        title="Tasks given to them"
        icon={HiClipboardList}
        help={help("page")}
        collapsible={false}
        action={adapter.create && (
          <button
            type="button"
            onClick={() => setAssigning(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition"
          >
            <HiPlus className="w-3.5 h-3.5" /> Give out a task
          </button>
        )}
      >
        {counts && (counts.inReview != null || counts.overdue != null) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {counts.inReview != null && (
              <CountTile icon={HiInbox} label="Waiting for your review" value={counts.inReview} />
            )}
            {counts.overdue != null && (
              <CountTile icon={HiExclamationCircle} label="Past their deadline" value={counts.overdue} tone="rose" />
            )}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          {/* Two rows, as on the full task lists: seven sentence labels need the
              whole width to stay on one line (TaskFilterBar's header). */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 space-y-3">
            <FilterTabs
              className="w-full"
              options={TASK_STATUS_FILTERS}
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
            />
            <TaskFilterBar filters={filters} onChange={setFilters} departments={null} />
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn’t load this person’s tasks." />
          ) : list.loading && list.items.length === 0 ? (
            <div className="p-5"><LoadingRows rows={4} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={HiClipboardList}
              title={filtered ? "No tasks match" : "No tasks yet"}
              message={filtered
                ? "Clear the filters to see everything they’ve been given."
                : adapter.create
                  ? `Nobody has given ${first} a task yet. Give out a task and it appears here with its deadline and progress.`
                  : `Nobody has given ${first} a task yet.`}
              className="py-10"
            />
          ) : (
            <>
              <div className={list.loading ? "opacity-60" : ""}>
                <TaskTable
                  rows={list.items}
                  onOpen={setSelected}
                  person="assigner"
                  help={{ status: help("status"), deadline: help("due_date") }}
                />
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <Pagination
                  page={list.page}
                  totalPages={list.totalPages}
                  total={list.total}
                  limit={list.limit}
                  onPageChange={list.setPage}
                  disabled={list.loading}
                  noun="task"
                />
              </div>
            </>
          )}
        </div>
      </DetailSection>

      {selected && (
        <TaskDetailDialog
          task={selected}
          plane={viewer}
          onClose={() => setSelected(null)}
          onChanged={refresh}
          footer={({ task, onActionError }) => (
            <TaskReviewActions
              task={task}
              viewer={viewer}
              onActionError={onActionError}
              onDone={(message) => { showToast(message); setSelected(null); refresh(); }}
            />
          )}
        />
      )}

      {assigning && (
        <AssignTaskDialog
          plane={viewer}
          assigneeId={userId}
          assigneeName={name}
          onClose={() => setAssigning(false)}
          onCreated={() => {
            setAssigning(false);
            showToast("Task given out. They’ve been told about it.");
            emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { action: "create" });
            refresh();
          }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
