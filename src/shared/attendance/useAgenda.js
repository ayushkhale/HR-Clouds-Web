// ─────────────────────────────────────────────────────────────────────────────
// attendance/useAgenda.js — Reads the forward schedule: the caller's own agenda
// and, for a manager, per-day coverage over their direct reports.
//
// ONE REQUEST, ONE WINDOW. The server composes every lane, so there is nothing
// to fan out and nothing to merge. Since 2026-10-22 the window is fixed at the
// next seven days (`AGENDA_WINDOW_DAYS`) — there is no picker left, so the
// `days` argument survives only as the one place the length is named.
//
// NOT CACHED ACROSS WINDOWS, ON PURPOSE. The backend holds no cache and sends
// no cache headers: an approval that lands while this page is open must show on
// the next read. So this hook keeps exactly one window in memory, and the
// app-wide event bus refetches it the moment anything that could move a future
// day succeeds — the local equivalent of invalidating a query key, which is how
// the integration guide phrases it for a stack we don't use.
//
// WHAT IS ON SCREEN STAYS ON SCREEN while a reload runs (`data` is kept, only
// `loading` flips). A refresh — pressed, or fired by the event bus after an
// approval — otherwise blanks the whole week and lands the reader back at the
// top of the page.
//
// FAILURE IS NOT SWALLOWED. Unlike the punch card's shift read, a failure here
// is reported: this page IS the schedule, so "couldn't load" must never render
// as "nothing scheduled" (CLAUDE.md §7).
//
// ONE LANE FAILING IS RECOVERED, NOT REPORTED (2026-10-22). The agenda composes
// its tasks lane from `GET /tasks/me` under `Promise.allSettled`, so that one
// query failing leaves `lanes.tasks: "unavailable"` and an otherwise valid
// page. But that source endpoint is one the employee may call themselves, and
// since the delivery added `due_from`/`due_to`/`sort=due_date` to it (§4.1) we
// can ask it the SAME question directly. So we do, and the panel shows the real
// deadlines. The apology is kept for when the retry fails too — an error a
// reader can do nothing about, in front of data we could have fetched, is the
// worst of both. Only this lane is recoverable: the other three have no
// employee-facing endpoint that answers a date window.
//
// AND THE LANE MAY NOT BE FAILING AT ALL. Every task endpoint is behind
// `requireFeature('tasks.access')` (registry #249), so a tenant without that
// entitlement gets a 403 inside the lane and `unavailable` out of it, where the
// honest answer is `excluded`. Our own read gets the same 403, which is how we
// tell the two apart: `absent` hides the lane, `failed` reports it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attendanceAPI } from "../api";
import { tasksAPI } from "../api/tasks.api.js";
import { isTaskFeatureDisabled } from "../utils/taskErrors.js";
import { normalizePaginated, unwrap } from "./normalize.js";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "./events.js";
import { DEFAULT_AGENDA_DAYS, agendaItemFromTaskRow, agendaRange } from "./agendaMeta.js";

/**
 * Anything that can change what a future day looks like. Leave and tasks are
 * the obvious two; a punch changes TODAY's `status_reason` from
 * `pending_clock_in`, and a config change can move a whole shift assignment.
 */
export const AGENDA_EVENT_KINDS = [
  ATTENDANCE_EVENTS.LEAVE,
  ATTENDANCE_EVENTS.TASK,
  ATTENDANCE_EVENTS.COMPOFF,
  ATTENDANCE_EVENTS.CONFIG,
  ATTENDANCE_EVENTS.PUNCH,
  ATTENDANCE_EVENTS.REGULARIZATION,
];

/**
 * Shared body of both reads: one in-flight request at a time, later responses
 * discarded, previous data kept while the next window loads.
 *
 * @param {(range: {from: string, to: string}) => Promise<unknown>} fetcher
 * @param {number} days window length; the range is always "today forward"
 * @param {{enabled?: boolean}} [options] `false` reads nothing — for a
 *   workspace the endpoint would refuse, where a 403 would tell us only what
 *   we already know (§2: a capability a role lacks is absent, not broken).
 */
function useAgendaRead(fetcher, days, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const token = useRef(0);
  const { from, to } = useMemo(() => agendaRange(days), [days]);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const id = ++token.current;
    // `data` is deliberately untouched — see the header.
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcher({ from, to });
      if (id !== token.current) return;
      setState({ data: unwrap(res) || null, loading: false, error: null });
    } catch (error) {
      if (id !== token.current) return;
      setState({ data: null, loading: false, error });
    }
  }, [enabled, fetcher, from, to]);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged(AGENDA_EVENT_KINDS, load);

  return { ...state, from, to, reload: load };
}

/**
 * How many recovered deadlines to ask for. The lane itself caps at 500 and
 * reports `truncated`; a week of one person's deadlines does not approach
 * either number, and a page of 100 is already more than this panel should list.
 */
const TASK_RECOVERY_LIMIT = 100;

/**
 * The caller's tasks with a deadline in the window, soonest first.
 *
 * The windowed form is the one the delivery documents (§4.1), and the one that
 * can answer the question in a single page. But the task controller validates
 * against a strict allow-list, so a deployment that predates those parameters
 * refuses the whole request rather than ignoring three of them — which is a
 * real possibility on the very build whose agenda lane is failing. Falling back
 * to the plain list and narrowing here costs one extra request in that case and
 * nothing at all otherwise; the caller filters by date either way, so the two
 * paths return the same thing.
 *
 * Both reads go through the api layer's allow-list, so neither can smuggle a
 * stray key into the query string.
 */
async function readTasksDueBetween(from, to) {
  const page = { page: 1, limit: TASK_RECOVERY_LIMIT };
  try {
    const res = await tasksAPI.getMyTasks({
      due_from: from, due_to: to, sort: "due_date", order: "ASC", ...page,
    });
    return normalizePaginated(res, ["tasks"], page).items;
  } catch (error) {
    // A refused PARAMETER is worth asking again without it. A refused FEATURE,
    // a dead session or a server fault is not — those must reach the caller
    // intact, because it tells them apart to decide what the reader sees.
    if (error?.status !== 400) throw error;
    const res = await tasksAPI.getMyTasks(page);
    return normalizePaginated(res, ["tasks"], page).items;
  }
}

/**
 * Reads the tasks lane directly when the agenda could not. Dormant otherwise —
 * `needed` false means no request at all, so the ordinary path stays one call.
 *
 * It reports STATES, not an error object: the panel has to tell "recovered"
 * from "still missing" from "this organisation has no tasks", and nothing here
 * can act on the error itself. The window comes from the agenda's own range, so
 * the two lists can never disagree about which week this is.
 */
function useTaskLaneRecovery({ needed, from, to, timezone }) {
  const [state, setState] = useState({ items: [], loading: false, failed: false, absent: false });
  const token = useRef(0);

  const load = useCallback(async () => {
    if (!needed || !from || !to) {
      setState({ items: [], loading: false, failed: false, absent: false });
      return;
    }
    const id = ++token.current;
    setState((s) => ({ ...s, loading: true, failed: false, absent: false }));
    try {
      const rows = await readTasksDueBetween(from, to);
      if (id !== token.current) return;
      const items = rows
        .map((row) => agendaItemFromTaskRow(row, timezone))
        .filter((item) => item && item.date >= from && item.date <= to);
      setState({ items, loading: false, failed: false, absent: false });
    } catch (error) {
      if (id !== token.current) return;
      // THE LIKELIEST ANSWER, AND THE REASON THIS BRANCH MATTERS. Every task
      // endpoint sits behind `requireFeature('tasks.access')`, so a tenant
      // without that entitlement makes the agenda's own tasks query throw 403
      // — and the lane reports `unavailable` when what it means is "this
      // organisation doesn't have tasks". Apologising for a feature nobody
      // bought is the broken button of §2. It is absence, and absence is
      // silent. Anything else is a genuine fault and is said out loud.
      setState({
        items: [],
        loading: false,
        failed: !isTaskFeatureDisabled(error),
        absent: isTaskFeatureDisabled(error),
      });
    }
  }, [needed, from, to, timezone]);

  useEffect(() => { load(); }, [load]);
  // The same bus the agenda listens to. Handing a task in or having its
  // deadline moved has to change this list too, or the recovered panel quietly
  // becomes the one stale thing on a page built to refresh itself.
  useAttendanceChanged(AGENDA_EVENT_KINDS, load);

  return { ...state, reload: load };
}

const fetchMine = ({ from, to }) => attendanceAPI.getMyAgenda({ from, to });
const fetchTeam = ({ from, to }) => attendanceAPI.getTeamAgenda({ from, to });

/**
 * `{ employee, policy, weeklyOffPolicy, range, summary, lanes, days[] }` for
 * the caller.
 *
 * Every optional lane is requested (we render all four), so `include` is
 * omitted rather than spelled out — naming them would mean editing two places
 * every time a panel is added, and an unknown name there is a 400.
 */
export function useMyAgenda(days = DEFAULT_AGENDA_DAYS) {
  const agenda = useAgendaRead(fetchMine, days);
  const timezone = agenda.data?.range?.timezone || "";

  // Only fires when the server says the lane failed — see the header.
  const tasks = useTaskLaneRecovery({
    needed: agenda.data?.lanes?.tasks === "unavailable",
    from: agenda.from,
    to: agenda.to,
    timezone,
  });

  // Refresh means refresh everything the page is built from, including the
  // recovery read: pressing it while the lane is down and watching only the
  // part that already worked reload would be the one useless outcome.
  const reloadAgenda = agenda.reload;
  const reloadTasks = tasks.reload;
  const reload = useCallback(() => {
    reloadAgenda();
    reloadTasks();
  }, [reloadAgenda, reloadTasks]);

  return {
    ...agenda,
    reload,
    summary: agenda.data?.summary || null,
    lanes: agenda.data?.lanes || null,
    days: Array.isArray(agenda.data?.days) ? agenda.data.days : [],
    // ── v2, 2026-10-22 ──────────────────────────────────────────────────────
    // Who this schedule belongs to, and the two rule sets that shape it. All
    // three are OPTIONAL: an employee with no weekly-off rule gets
    // `weekly_off_policy: null`, and a tenant mid-deploy may send neither
    // policy. Every consumer hides its own panel on null rather than printing
    // a column of N/A (§7), which is also what let this page ship against v1.
    employee: agenda.data?.employee || null,
    policy: agenda.data?.attendance_policy || null,
    weeklyOffPolicy: agenda.data?.weekly_off_policy || null,
    // The zone every date in the payload is expressed in. Read it back from the
    // response rather than assuming the browser's — an employee on a Dubai
    // shift gets Asia/Dubai, and a day boundary off by one is the bug nobody
    // forgives on a schedule page.
    timezone,
    // ── The recovered tasks lane ────────────────────────────────────────────
    // `recoveredTasks` is empty whenever the lane is fine, so a consumer can
    // merge it unconditionally. `tasksUnrecoverable` is the only state that
    // still owes the reader an apology.
    recoveredTasks: tasks.items,
    tasksRecovering: tasks.loading,
    tasksUnrecoverable: tasks.failed,
    // The organisation's plan has no tasks at all — the lane is absent, and the
    // panel says nothing about deadlines it could never have had.
    tasksAbsent: tasks.absent,
  };
}

/**
 * Per-day coverage over the caller's DIRECT REPORTS.
 *
 * Scoped to direct reports for every role, HR included — the endpoint
 * deliberately does not widen to the organisation, so this must not be built
 * into an org-wide view (delivery §3). An HR admin with nobody reporting to
 * them correctly sees `team_size: 0`.
 */
export function useTeamAgenda({ enabled = true, days = DEFAULT_AGENDA_DAYS } = {}) {
  const agenda = useAgendaRead(fetchTeam, days, { enabled });
  return {
    ...agenda,
    teamSize: agenda.data?.team_size ?? null,
    maxTeamSize: agenda.data?.max_team_size ?? null,
    lanes: agenda.data?.lanes || null,
    days: Array.isArray(agenda.data?.days) ? agenda.data.days : [],
  };
}
