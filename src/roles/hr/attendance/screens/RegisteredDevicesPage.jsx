// ─────────────────────────────────────────────────────────────────────────────
// RegisteredDevicesPage.jsx — "Registered Devices" (Setup › Organisation): WHO
// has a device, the settings that decide what a device is for, and the log of
// what those settings did. Registry #8, #14–#18.
//
// ─── WHY IT IS A PEOPLE LIST AND NOT A DEVICE LIST ─────────────────────────
// The inventory endpoint lists DEVICES, so the old screen could only ever say
// "here are 31 devices" — the question HR actually asks is "who can't clock in
// on Monday?", and nobody with no device appears in a list of devices at all
// (user decision, 16 Oct 2026). So this page starts from the PEOPLE directory
// and joins device data onto it: everybody shows, and having no device is a
// row you can see and filter for rather than an absence you have to infer.
//
// It follows the attendance directory deliberately (Employees / Managers / HR,
// search, one state filter, click a row for the detail) — HR already knows that
// screen, and a second layout for the same question would be a second thing to
// learn.
//
// ─── WHERE THE DEVICE HALF COMES FROM (changed 22 Oct 2026) ────────────────
// `GET /hr/device-trust/people` (API #18) returns ONE ROW PER PERSON with the
// counts already aggregated, including everybody who has nothing. That read
// replaced paging the whole device inventory: the old join pulled up to 30
// pages of 100 DEVICES to answer a question about PEOPLE, and silently stopped
// joining past 3000 devices. The roster is one row per head, so the ceiling is
// now the directory's rather than ours.
//
// It is NOT a second roster fetch in the sense §7 forbids: it carries no names,
// emails, photos or departments by design, only `user_id` and counts. Every
// person on screen is still rendered from `useEmployeeDirectory()`.
//
// The old inventory join survives as a FALLBACK for one case only — this build
// deployed against a server without API #18. A 404 there drops to `GET
// /hr/trusted-devices` grouped by `user_id` (which that endpoint has carried
// since the same delivery). If even that comes back with no owner on any row,
// the page degrades honestly instead of lying: the people list still renders,
// the device columns say the owner is missing, and the per-person inspector is
// still exact because it re-reads filtered BY `user_id`. Recorded here so
// nobody "fixes" the fallback away.
//
// ─── WHY GROUP COVERAGE IS COMPUTED HERE AND NOT READ ──────────────────────
// The coverage endpoint also sends `by_group`, and the role tabs deliberately
// do NOT use it. The fraction on a tab has to agree with the rows under it, and
// those rows are grouped by `workspaceForRole(person.role)` from the directory
// — if the server's grouping and ours ever disagreed, the tab would read 3/5
// over a list of six. One derived number beats two authoritative ones that can
// contradict each other on screen.
//
// ─── COVERAGE IS STILL THE FIRST THING ─────────────────────────────────────
// Switching the mode to Required while half the organisation has no device
// locks that half out of clocking in — the most expensive mistake this screen
// can make — so readiness sits above the tabs, in every tab, with the 95% gate
// drawn on the bar, and the Settings tab's own confirm quotes it back.
//
// No ids anywhere (§4): people come from `useEmployeeDirectory().activeOptions`
// — the NORMALIZED entries, whose `id` is the resolved user id — never the raw
// `activeRows` (see PeopleTab). The only identifier on screen is `employee_code`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiArrowNarrowRight, HiBriefcase, HiClipboardList, HiCog, HiDeviceMobile,
  HiRefresh, HiSearch, HiShieldCheck, HiUserGroup, HiUsers,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { attendanceAPI } from "../../../../shared/api";
import { fmtDateTime } from "../../../../shared/attendance/dates";
import { normalizePaginated, unwrap } from "../../../../shared/attendance/normalize";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../../../../shared/attendance/events";
import { useEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";
import { workspaceForRole } from "../../../../shared/auth/permissions";
import {
  COVERAGE_SAFE_PERCENT, COVERAGE_STATE_RANK, DEVICE_PEOPLE_SCOPES,
  EMPTY_DEVICE_SUMMARY, coverageStateOf, matchesDeviceScope, rosterSummary,
  summariseDevices,
} from "../../../../shared/attendance/deviceTrustMeta";
import {
  EmptyState, ErrorState, FilterTabs, InlineAlert, LoadingRows, Pagination,
  Toast, useToast,
} from "../../../../shared/attendance/ui";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import DeviceRegistrationSettings from "../components/DeviceRegistrationSettings";
import DeviceActivityLog from "../components/DeviceActivityLog";
import PersonDevicesDialog from "../components/PersonDevicesDialog";

const SURFACE = "attendance.device_checks";
const help = (field, extra) => ({ surface: SURFACE, field, ...extra });

const TABS = [
  { key: "people", label: "People", icon: HiUserGroup },
  { key: "settings", label: "Settings", icon: HiCog },
  { key: "activity", label: "Activity", icon: HiClipboardList },
];

/* The three workspaces, used as the role filter. `workspaceForRole` is reused
   rather than a fourth role→group map: admin and super-admin read as HR there,
   which is where HR expects to find them. */
const ROLE_TABS = [
  { value: "employee", label: "Employees", icon: HiUsers },
  { value: "manager", label: "Managers", icon: HiBriefcase },
  { value: "hr", label: "HR", icon: HiShieldCheck },
];

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
/* One row per PERSON, so this is a headcount ceiling and not a device one:
   100 × 50 = 5000 people. A cap, not an expectation — a loop with no ceiling is
   one bad `total` away from hammering the API. Hitting it is reported, never
   silently swallowed, because a person we failed to read would otherwise render
   as "No device". */
const ROSTER_LIMIT = 100;
const MAX_ROSTER_PAGES = 50;
/* The fallback path only. Devices, not people, hence the far shorter reach. */
const MAX_INVENTORY_PAGES = 30;

/** This build is newer than the server: API #18 isn't deployed there yet. */
const isMissingEndpoint = (error) => [404, 405, 501].includes(Number(error?.status));

/* ─── Readiness ──────────────────────────────────────────────────────────── */

/**
 * Coverage against the gate, as one glance. The 95% mark is drawn ON the bar
 * rather than written under it: "66% covered" means nothing without the number
 * it has to beat, and a line in the track answers "how much further?" without
 * arithmetic. Fuchsia below the gate, violet at or above it — rose is reserved
 * for what has actually gone wrong, and a pilot that hasn't finished has not (§5).
 */
function CoverageBar({ percent, low }) {
  const width = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="relative h-2 rounded-full bg-slate-100">
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${low ? "bg-fuchsia-500" : "bg-violet-500"}`}
        style={{ width: `${width}%` }}
      />
      <span
        className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-slate-400"
        style={{ left: `${COVERAGE_SAFE_PERCENT}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

/** A pulse shaped like the number it replaces, never a blank or a bare "N/A" (§5). */
const ValuePulse = ({ className = "h-7 w-20" }) => (
  <span className={`block rounded-lg bg-slate-100 animate-pulse ${className}`} />
);

/**
 * The hero: where the organisation stands against the one threshold that
 * matters, plus the plain-words verdict on whether the mode can be switched
 * today. It is two columns wide because the bar needs the room — three equal
 * tiles gave the headline metric the same weight as its own denominator.
 */
function ReadinessCard({ coverage, loading, error, percent, known, low }) {
  const enrolled = Number(coverage?.enrolled_users);
  const members = Number(coverage?.active_members);
  const haveBoth = Number.isFinite(enrolled) && Number.isFinite(members);

  return (
    <div className="sm:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-2xs px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          <HelpLabel text="Device readiness" help={help("coverage_percentage", { size: "sm", label: "how ready the organisation is" })} />
        </p>
        {known && (
          <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${low ? "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" : "bg-violet-50 text-violet-700 border-violet-200"}`}>
            {low ? "Too early to make it compulsory" : "Safe to make it compulsory"}
          </span>
        )}
      </div>

      {loading && !coverage ? (
        <div className="mt-2 space-y-3">
          <ValuePulse className="h-8 w-28" />
          <ValuePulse className="h-2 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className={`text-3xl font-bold tabular-nums ${low ? "text-fuchsia-700" : "text-slate-900"}`}>
              {error ? "Couldn’t load" : known ? `${percent}%` : "N/A"}
            </p>
            <p className="text-xs font-semibold text-slate-500 pb-1">
              {haveBoth
                ? `${enrolled} of ${members} ${members === 1 ? "person" : "people"} can clock in`
                : "Everyone who could be asked to clock in"}
            </p>
          </div>
          <div className="mt-3">
            <CoverageBar percent={known ? percent : 0} low={low} />
          </div>
          <p className="text-[11px] font-semibold text-slate-500 mt-2">
            The mark on the bar is {COVERAGE_SAFE_PERCENT}% — reach it before a registered device is compulsory.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One number HR acts on. The ⓘ sits in the heading and the only interactive
 * thing inside is the footer link, never the whole card: a help button nested
 * inside a button is one control as far as the keyboard is concerned (§10), and
 * a card that is mysteriously clickable all over still reads as a card.
 */
function ActionTile({ field, label, value, caption, actionLabel, loading, error, onAction }) {
  const count = Number(value);
  const live = Number.isFinite(count) && count > 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs px-5 py-4 flex flex-col">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        <HelpLabel text={label} help={help(field, { size: "sm" })} />
      </p>
      {loading && value === undefined ? (
        <div className="mt-1.5"><ValuePulse /></div>
      ) : (
        <p className={`mt-1.5 text-2xl font-bold tabular-nums ${live ? "text-fuchsia-700" : "text-slate-900"}`}>
          {error ? "Couldn’t load" : Number.isFinite(count) ? count : "N/A"}
        </p>
      )}
      <div className="mt-auto pt-1.5">
        {live && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-800 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-200"
          >
            {actionLabel} <HiArrowNarrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <p className="text-xs text-slate-500">{caption}</p>
        )}
      </div>
    </div>
  );
}

/* ─── The device half ────────────────────────────────────────────────────── */

/**
 * `Map<user_id, summary>` for everybody in the organisation, refreshed on any
 * device decision anywhere in the app.
 *
 * `mode` says which read answered: `"roster"` (API #18, one row per person) or
 * `"inventory"` (the API #8 fallback). `ownerless` can only ever be true in the
 * fallback — the roster is keyed by person by definition, so it cannot lose
 * track of who owns what. `truncated` means the page cap cut the read short and
 * some people have no summary; it is surfaced rather than hidden, because a
 * person we failed to read looks exactly like a person with no device.
 */
function useDevicePeople() {
  const [state, setState] = useState({
    byUser: new Map(), devices: 0, loading: true, error: null,
    mode: "roster", ownerless: false, truncated: false,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    // 1. The roster: one row per person, zero-device people included.
    try {
      const byUser = new Map();
      let devices = 0;
      let truncated = false;
      for (let page = 1; page <= MAX_ROSTER_PAGES; page += 1) {
        const res = await attendanceAPI.getDeviceTrustPeople({ page, limit: ROSTER_LIMIT });
        const n = normalizePaginated(res, ["items"], { page, limit: ROSTER_LIMIT });
        n.items.forEach((row) => {
          if (!row?.user_id) return;
          const summary = rosterSummary(row);
          devices += summary.total;
          byUser.set(String(row.user_id), summary);
        });
        if (n.items.length < ROSTER_LIMIT || page >= n.totalPages) break;
        if (page === MAX_ROSTER_PAGES) truncated = true;
      }
      setState({ byUser, devices, loading: false, error: null, mode: "roster", ownerless: false, truncated });
      return;
    } catch (error) {
      // A real failure is a real failure — only a server that has never heard
      // of the roster falls through to the old read.
      if (!isMissingEndpoint(error)) {
        setState({
          byUser: new Map(), devices: 0, loading: false, error,
          mode: "roster", ownerless: false, truncated: false,
        });
        return;
      }
    }

    // 2. Fallback: group the device inventory by owner (pre-API-#18 server).
    try {
      const grouped = new Map();
      let devices = 0;
      let owned = 0;
      let truncated = false;
      for (let page = 1; page <= MAX_INVENTORY_PAGES; page += 1) {
        const res = await attendanceAPI.getTrustedDevices({ page, limit: ROSTER_LIMIT });
        const n = normalizePaginated(res, ["items", "devices"], { page, limit: ROSTER_LIMIT });
        devices += n.items.length;
        n.items.forEach((device) => {
          const owner = device.user_id || device.employee_id || device.user?.id;
          if (!owner) return;
          owned += 1;
          const key = String(owner);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(device);
        });
        if (n.items.length < ROSTER_LIMIT || page >= n.totalPages) break;
        if (page === MAX_INVENTORY_PAGES) truncated = true;
      }
      const byUser = new Map();
      grouped.forEach((list, key) => byUser.set(key, summariseDevices(list)));
      setState({
        byUser, devices, loading: false, error: null, mode: "inventory",
        ownerless: devices > 0 && owned === 0, truncated,
      });
    } catch (error) {
      setState({
        byUser: new Map(), devices: 0, loading: false, error,
        mode: "inventory", ownerless: false, truncated: false,
      });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged([ATTENDANCE_EVENTS.DEVICE], load);

  return { ...state, reload: load };
}

/* ─── The people tab ─────────────────────────────────────────────────────── */

/* A dot per state reads faster than four words separated by middots, and it
   carries the same colour the badge and the status pills use. Revoked is slate,
   not rose: a device shut off months ago is history, not a problem (§5). */
const DEVICE_PARTS = [
  { key: "active", label: "ready", dot: "bg-violet-500" },
  { key: "pending", label: "waiting", dot: "bg-fuchsia-500" },
  { key: "suspended", label: "blocked", dot: "bg-rose-500" },
  { key: "revoked", label: "shut off", dot: "bg-slate-300" },
];

/** What one person's devices add up to, as a line HR can scan. */
function DeviceCell({ summary, ownerless }) {
  if (ownerless) return <span className="text-xs text-slate-400 italic">Open to see</span>;
  if (summary.total === 0) return <span className="text-xs font-semibold text-slate-400">None yet</span>;
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-800">
        {summary.total === 1 ? "1 device" : `${summary.total} devices`}
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
        {DEVICE_PARTS.filter((part) => summary[part.key] > 0).map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${part.dot}`} aria-hidden="true" />
            {summary[part.key]} {part.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The one word that answers "can this person clock in on Monday?". The states,
 * their colours and which filter bucket they belong to all come from
 * `coverageStateOf` — the same partition the server filters by — so the badge,
 * the filter counts and a server-side page can never tell different stories.
 */
function CoverState({ summary, ownerless }) {
  if (ownerless) return <span className="text-xs text-slate-400">N/A</span>;
  const view = coverageStateOf(summary);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${view.cls}`}>
      {view.label}
    </span>
  );
}

function PeopleTab({ people, role, onRole, scope, onScope, showToast }) {
  // activeOptions, NOT activeRows. `activeRows` are the raw API rows, whose
  // `.id` is the employee/role-record id and which carry `employee_code`,
  // `department_name`, `avatar_url` under their own names. The normalized
  // entries in `activeOptions` have `id` resolved to the USER id
  // (`user_id || user.id || employee_id || id`) and expose code/department/
  // gender/photo in one shape. Feeding a raw row's `.id` to the device filter
  // returned a stranger's devices, the events filter a stranger's history, and
  // the profile link a 404 "invalid uuid" — all one bug (fixed 16 Oct 2026).
  const { activeOptions, loading: dirLoading, error: dirError, reload } = useEmployeeDirectory();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Narrowed in the browser although the roster can do it server-side: the
  // people half is already here in full (the directory is a context every
  // screen shares), so filtering is instant and costs nothing, while a
  // round-trip per keystroke or per tab would not be. The server-side
  // `coverage`/`role`/`search` params stay available for whoever one day has to
  // page an organisation too large for the directory itself.
  const withDevices = useMemo(
    () => activeOptions.map((person) => ({
      person,
      group: workspaceForRole(person.role) || "employee",
      summary: people.byUser.get(String(person.id)) || EMPTY_DEVICE_SUMMARY,
    })),
    [activeOptions, people.byUser]
  );

  // Coverage per role group, derived here rather than read from `by_group` so
  // the fraction on a tab always matches the rows under it (see file header).
  const roleStats = useMemo(() => {
    const out = {
      employee: { total: 0, covered: 0 },
      manager: { total: 0, covered: 0 },
      hr: { total: 0, covered: 0 },
    };
    withDevices.forEach((row) => {
      const group = out[row.group];
      if (!group) return;
      group.total += 1;
      if (coverageStateOf(row.summary).key === "covered") group.covered += 1;
    });
    return out;
  }, [withDevices]);

  // Counts for the state filter, within the role tab that is open — a bucket
  // labelled "No device (3)" that shows nothing because those three are
  // managers is worse than no count at all. Search is deliberately excluded:
  // counts that moved on every keystroke would be unreadable.
  const scopeCounts = useMemo(() => {
    const out = { "": 0, none: 0, pending: 0, covered: 0, blocked: 0 };
    withDevices.forEach((row) => {
      if (row.group !== role) return;
      out[""] += 1;
      const bucket = coverageStateOf(row.summary).scope;
      if (out[bucket] !== undefined) out[bucket] += 1;
    });
    return out;
  }, [withDevices, role]);

  // One predicate, applied to the open role group for the list and to the other
  // two for the "they're over there" offer below — so the two can never drift.
  const matchesFilters = useCallback((row, group) => {
    if (row.group !== group) return false;
    if (!people.ownerless && !matchesDeviceScope(row.summary, scope)) return false;
    if (!search) return true;
    const hay = `${row.person.name} ${row.person.code} ${row.person.email} ${row.person.department} ${row.person.designation}`.toLowerCase();
    return hay.includes(search);
  }, [people.ownerless, scope, search]);

  const rows = useMemo(
    () => withDevices
      .filter((row) => matchesFilters(row, role))
      .sort((a, b) => {
        const byState = COVERAGE_STATE_RANK[coverageStateOf(a.summary).key]
          - COVERAGE_STATE_RANK[coverageStateOf(b.summary).key];
        return byState || a.person.name.localeCompare(b.person.name);
      }),
    [withDevices, role, matchesFilters]
  );

  // The readiness tiles count the whole organisation, but the list shows one
  // role group at a time — so "Show these people" could land on "Nobody
  // matches" while three managers sit one tab away. Rather than dead-end, the
  // empty state says where they are and goes there.
  const elsewhere = useMemo(() => {
    if (rows.length > 0) return [];
    return ROLE_TABS
      .filter((tab) => tab.value !== role)
      .map((tab) => ({ ...tab, count: withDevices.filter((row) => matchesFilters(row, tab.value)).length }))
      .filter((tab) => tab.count > 0);
  }, [rows.length, withDevices, role, matchesFilters]);

  useEffect(() => { setPage(1); }, [role, scope, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const loading = dirLoading || people.loading;
  // The scope filter is bypassed when we can't tell whose device is whose, so a
  // scope left over from before must not make the empty state blame a filter
  // that isn't being applied.
  const filtered = !!(search || (!people.ownerless && scope));
  const roleLabel = (ROLE_TABS.find((t) => t.value === role) || ROLE_TABS[0]).label.toLowerCase();

  // "Employees 3/5" — a headcount on its own never answered a question anybody
  // was asking on this screen, and the fraction answers "which group is behind?".
  const roleOptions = ROLE_TABS.map((tab) => {
    const stat = roleStats[tab.value] || { total: 0, covered: 0 };
    return {
      ...tab,
      label: (
        <span className="inline-flex items-center gap-1.5">
          {tab.label}
          <span className="font-bold tabular-nums opacity-60">
            {people.ownerless ? stat.total : `${stat.covered}/${stat.total}`}
          </span>
        </span>
      ),
    };
  });

  const scopeOptions = DEVICE_PEOPLE_SCOPES.map((option) => ({
    ...option,
    label: `${option.label} (${scopeCounts[option.value] ?? 0})`,
  }));

  return (
    <div className="space-y-4">
      {people.ownerless && (
        <InlineAlert tone="sky">
          The device list isn’t saying who each device belongs to, so the columns below are blank.
          Open a person to see their own devices — that still works.
        </InlineAlert>
      )}
      {people.truncated && (
        <InlineAlert tone="amber">
          There are more people here than this page can read in one go, so a few rows may say
          <span className="font-bold"> No device</span> when they have one. Search for somebody by name to check them.
        </InlineAlert>
      )}

      <div className="bg-white rounded-2xl shadow-2xs border border-slate-100 overflow-hidden">
        <div className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <FilterTabs options={roleOptions} value={role} onChange={onRole} />
          <div className="relative xl:w-64">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or code…"
              aria-label="Search people"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>
        </div>
        {/* The state filter is the point of the screen, so it is a visible strip
            with its counts showing rather than a dropdown that hides them. The
            ⓘ sits BESIDE the strip, never inside it (§10).

            It is absent, not disabled, when we can't tell whose device is whose:
            every count would read "No device" and every bucket would be a lie,
            and a control that can't do its job shouldn't be on screen (§2). */}
        {!people.ownerless && (
          <div className="px-4 pb-4 pt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider inline-flex items-center">
              <HelpLabel text="Show" help={help("coverage_state", { size: "sm", label: "what these groups mean" })} />
            </span>
            <FilterTabs options={scopeOptions} value={scope} onChange={onScope} />
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-100 shadow-2xs rounded-2xl overflow-hidden">
        {dirError || people.error ? (
          <ErrorState
            error={dirError || people.error}
            onRetry={() => { reload(); people.reload(); }}
            fallback="Couldn’t load who has a device."
          />
        ) : loading && rows.length === 0 ? (
          <div className="p-6"><LoadingRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HiUsers}
            title={filtered ? "Nobody matches" : `No ${roleLabel}`}
            message={!filtered
              ? `There are no ${roleLabel} in the organisation yet.`
              : elsewhere.length > 0
                ? `No ${roleLabel} match, but other people do.`
                : `No ${roleLabel} match these filters. Try “Everyone”, or clear the search.`}
            action={elsewhere.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {elsewhere.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => onRole(tab.value)}
                    className="px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 text-xs font-bold hover:bg-purple-100 transition inline-flex items-center gap-1.5"
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.count} in {tab.label}
                  </button>
                ))}
              </div>
            ) : undefined}
          />
        ) : (
          <>
            <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <table className="w-full text-left text-sm min-w-[820px]">
                <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-6 py-3.5">Employee</th>
                    <th className="px-6 py-3.5">Department</th>
                    <th className="px-6 py-3.5">
                      <HelpLabel text="Devices" help={help("devices", { size: "sm", label: "the devices column" })} />
                    </th>
                    <th className="px-6 py-3.5">
                      <HelpLabel text="Last used" help={help("last_used_at", { size: "sm" })} />
                    </th>
                    <th className="px-6 py-3.5">
                      <HelpLabel text="Can clock in" help={help("coverage_state", { size: "sm", label: "whether they can clock in" })} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shown.map(({ person, summary }) => {
                    const preview = rowPreviewProps(() => setSelected(person), `${person.name}’s devices`);
                    const needsYou = coverageStateOf(summary).key === "pending";
                    return (
                      <tr
                        key={person.id}
                        {...preview}
                        className={`${preview.className} ${needsYou ? "bg-fuchsia-50/40" : ""}`}
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 text-xs">
                              <GenderAvatar person={person.raw || person} gender={person.gender} name={person.name} src={person.photo} />
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 truncate max-w-[200px]" title={person.name}>{person.name}</p>
                              <p className="text-[11px] font-semibold text-slate-400 truncate">
                                {person.code || person.designation || person.email || "N/A"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <p className={`font-semibold ${person.department ? "text-slate-700" : "text-slate-400"}`}>
                            {person.department || "N/A"}
                          </p>
                        </td>
                        <td className="px-6 py-3.5"><DeviceCell summary={summary} ownerless={people.ownerless} /></td>
                        <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {people.ownerless ? "N/A" : summary.lastUsedAt ? fmtDateTime(summary.lastUsedAt) : "Not yet used"}
                        </td>
                        <td className="px-6 py-3.5"><CoverState summary={summary} ownerless={people.ownerless} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={rows.length}
                limit={PAGE_SIZE}
                onPageChange={setPage}
                disabled={loading}
                noun="person"
              />
            </div>
          </>
        )}
      </div>

      {selected && (
        <PersonDevicesDialog
          person={selected}
          onClose={() => setSelected(null)}
          onChanged={people.reload}
          showToast={showToast}
        />
      )}
    </div>
  );
}

/* ─── The page ───────────────────────────────────────────────────────────── */

export default function RegisteredDevicesPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "people";
  const { toast, showToast, clearToast } = useToast();

  const [policy, setPolicy] = useState(null);
  const [policyState, setPolicyState] = useState({ loading: true, error: null });
  const [coverage, setCoverage] = useState(null);
  const [coverageState, setCoverageState] = useState({ loading: true, error: null });
  // Lifted out of PeopleTab so the readiness tiles can drive the list: a number
  // HR is told to act on should be able to take them to the people behind it.
  const [role, setRole] = useState("employee");
  const [scope, setScope] = useState("");

  const people = useDevicePeople();

  const loadPolicy = useCallback(async () => {
    setPolicyState({ loading: true, error: null });
    try {
      setPolicy(unwrap(await attendanceAPI.getDeviceTrustPolicy()) || null);
      setPolicyState({ loading: false, error: null });
    } catch (error) {
      setPolicyState({ loading: false, error });
    }
  }, []);

  const loadCoverage = useCallback(async () => {
    setCoverageState({ loading: true, error: null });
    try {
      setCoverage(unwrap(await attendanceAPI.getDeviceTrustCoverage()) || null);
      setCoverageState({ loading: false, error: null });
    } catch (error) {
      // "Couldn't load", never "nobody covered" (§7) — the tiles say so.
      setCoverage(null);
      setCoverageState({ loading: false, error });
    }
  }, []);

  useEffect(() => { loadPolicy(); loadCoverage(); }, [loadPolicy, loadCoverage]);
  // A decision taken in the inspector changes how many people are covered.
  useAttendanceChanged([ATTENDANCE_EVENTS.DEVICE], loadCoverage);

  const coveragePercent = Number(coverage?.coverage_percentage);
  const coverageKnown = Number.isFinite(coveragePercent);
  const lowCoverage = coverageKnown && coveragePercent < COVERAGE_SAFE_PERCENT;
  // The server sends this outright since 22 Oct 2026; the subtraction is the
  // fallback for a server that doesn't, not the other way round (§7).
  const uncovered = Number.isFinite(Number(coverage?.uncovered_users))
    ? Number(coverage.uncovered_users)
    : coverage
      ? Math.max(0, Number(coverage.active_members || 0) - Number(coverage.enrolled_users || 0))
      : undefined;
  const pendingUsers = Number.isFinite(Number(coverage?.pending_users)) ? Number(coverage.pending_users) : undefined;
  const pendingDevices = Number.isFinite(Number(coverage?.pending_devices)) ? Number(coverage.pending_devices) : undefined;

  const refreshAll = () => {
    loadPolicy();
    loadCoverage();
    people.reload();
  };

  /** Send HR from a readiness number to the people it counted. */
  const focusList = (nextScope) => {
    setScope(nextScope);
    setParams({}, { replace: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <DashboardTopBar title="Registered Devices" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="Registered Devices" help={help("page", { label: "the Registered Devices page" })} />
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              See who has registered a device for clocking in, decide what a device is needed for, and read what those decisions have done.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition shrink-0"
          >
            <HiRefresh className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* ── How ready the organisation is. Above the tabs, so the number is
               in front of HR whichever tab they are reading. The readiness
               card is two columns wide: it carries the metric everything else
               is measured against, and the bar needs the width. ─────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ReadinessCard
            coverage={coverage}
            loading={coverageState.loading}
            error={coverageState.error}
            percent={coveragePercent}
            known={coverageKnown}
            low={lowCoverage}
          />
          <ActionTile
            field="uncovered_users"
            label="No working device"
            value={uncovered}
            caption="Everyone can clock in today"
            actionLabel={`Show ${uncovered === 1 ? "this person" : "these people"}`}
            loading={coverageState.loading}
            error={coverageState.error}
            onAction={() => focusList("none")}
          />
          <ActionTile
            field="pending_users"
            label="Waiting for you"
            value={pendingUsers}
            caption="Nothing needs your approval"
            actionLabel={pendingDevices
              ? `Decide ${pendingDevices === 1 ? "1 device" : `${pendingDevices} devices`}`
              : "Show who’s waiting"}
            loading={coverageState.loading}
            error={coverageState.error}
            onAction={() => focusList("pending")}
          />
        </div>

        {lowCoverage && uncovered > 0 && (
          <InlineAlert tone="amber">
            {uncovered} {uncovered === 1 ? "person has" : "people have"} no registered device. Leave this on
            <span className="font-bold"> Watch only</span> until they do — on <span className="font-bold">Required</span> they can’t clock in at all.
          </InlineAlert>
        )}

        {/* The ⓘ sits BESIDE the strip, never inside it: a help button inside a
            tablist is a third tab as far as the keyboard is concerned (§10). */}
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="Registered devices">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParams(key === "people" ? {} : { tab: key }, { replace: true })}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <FieldHelp surface={SURFACE} field={`tab.${tab}`} label={`the ${TABS.find((t) => t.key === tab)?.label} tab`} />
        </div>

        {tab === "people" && (
          <PeopleTab
            people={people}
            role={role}
            onRole={setRole}
            scope={scope}
            onScope={setScope}
            showToast={showToast}
          />
        )}

        {tab === "settings" && (
          policyState.error ? (
            <ErrorState
              error={policyState.error}
              onRetry={loadPolicy}
              fallback={attendanceErrorMessage(policyState.error, "Couldn’t load the device settings.")}
            />
          ) : (
            <DeviceRegistrationSettings
              policy={policy}
              loading={policyState.loading}
              error={policyState.error}
              onReload={loadPolicy}
              onSaved={(fresh) => { setPolicy(fresh); loadCoverage(); }}
              coverage={coverage}
              coverageKnown={coverageKnown}
              uncovered={uncovered || 0}
              showToast={showToast}
            />
          )
        )}

        {tab === "activity" && <DeviceActivityLog />}

        {/* Somewhere to look when nothing is registered yet and HR wonders
            whether the page is broken. */}
        {tab === "people" && !people.loading && people.devices === 0 && !people.error && (
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <HiDeviceMobile className="w-4 h-4 text-slate-400" />
            Nobody has registered a device yet. Each person does it themselves from
            <span className="font-semibold"> My Registered Devices</span> — it needs their own fingerprint or screen lock, so it can’t be done for them.
          </p>
        )}
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
