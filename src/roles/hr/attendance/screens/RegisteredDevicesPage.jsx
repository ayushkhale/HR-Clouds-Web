// ─────────────────────────────────────────────────────────────────────────────
// RegisteredDevicesPage.jsx — "Registered Devices" (Setup › Organisation): WHO
// has a device, the settings that decide what a device is for, and the log of
// what those settings did. Registry #8, #14–#17.
//
// ─── WHY IT IS A PEOPLE LIST AND NOT A DEVICE LIST ─────────────────────────
// The inventory endpoint lists DEVICES, so the old screen could only ever say
// "here are 31 devices" — the question HR actually asks is "who can't clock in
// on Monday?", and nobody with no device appears in a list of devices at all
// (user decision, 16 Oct 2026). So this page starts from the PEOPLE directory
// and joins the inventory onto it: everybody shows, and having no device is a
// row you can see and filter for rather than an absence you have to infer.
//
// It follows the attendance directory deliberately (Employees / Managers / HR,
// search, one state filter, click a row for the detail) — HR already knows that
// screen, and a second layout for the same question would be a second thing to
// learn.
//
// ─── THE JOIN, AND WHAT HAPPENS IF THE SERVER WON'T HELP ───────────────────
// One bulk read (`limit: 100`, paged) grouped by `user_id` — never a request
// per row (§7). The documented response row omits `user_id` even though the
// table has it NOT NULL and `sanitizeDevice()` strips only the key material,
// so live rows are expected to carry it. If they don't, the page degrades
// honestly instead of lying: the people list still renders, the device columns
// say the owner is missing, and the per-person inspector is still exact because
// it re-reads filtered BY `user_id`. The deviation is recorded here so nobody
// "fixes" the fallback away.
//
// ─── COVERAGE IS STILL THE FIRST THING ─────────────────────────────────────
// Switching the mode to Required while half the organisation has no device
// locks that half out of clocking in — the most expensive mistake this screen
// can make — so the three numbers sit above the tabs, in every tab, and the
// Settings tab's own confirm quotes them back.
//
// No ids anywhere (§4): people come from `useEmployeeDirectory().activeOptions`
// — the NORMALIZED entries, whose `id` is the resolved user id — never the raw
// `activeRows` (see PeopleTab). The only identifier on screen is `employee_code`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiBriefcase, HiClipboardList, HiCog, HiDeviceMobile, HiRefresh, HiSearch,
  HiShieldCheck, HiUserGroup, HiUsers,
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
  COVERAGE_SAFE_PERCENT, DEVICE_PEOPLE_SCOPES, matchesDeviceScope, summariseDevices,
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
/* 100 per read × 30 = 3000 devices. A cap, not an expectation: a loop with no
   ceiling is one bad `total` away from hammering the API. */
const MAX_INVENTORY_PAGES = 30;

const SELECT = "px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition disabled:opacity-50";

/**
 * A coverage number. Three of them, same size, no sparkline — they are read
 * once. `tone="warn"` is fuchsia, not rose: coverage too low to enforce is a
 * warning, and rose is reserved for what has actually gone wrong (§5).
 */
function CoverageTile({ field, label, value, caption, tone = "purple" }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs px-5 py-4">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        <HelpLabel text={label} help={help(field, { size: "sm" })} />
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone === "warn" ? "text-fuchsia-700" : "text-slate-900"}`}>{value}</p>
      {caption && <p className="text-xs text-slate-500 mt-1">{caption}</p>}
    </div>
  );
}

/* ─── The join ───────────────────────────────────────────────────────────── */

/**
 * Every registered device in the organisation, grouped by owner. One read per
 * 100 devices, refreshed on any device decision anywhere in the app.
 *
 * `ownerless` is true when devices came back but not one of them says whose it
 * is — the server stripped `user_id`. The page needs to know the difference
 * between "nobody has registered anything" and "we can't tell who owns what",
 * because the first is a fact and the second is our problem (§7).
 */
function useDeviceInventory() {
  const [state, setState] = useState({ byUser: new Map(), total: 0, ownerless: false, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const byUser = new Map();
      let total = 0;
      let owned = 0;
      for (let page = 1; page <= MAX_INVENTORY_PAGES; page += 1) {
        const res = await attendanceAPI.getTrustedDevices({ page, limit: 100 });
        const n = normalizePaginated(res, ["items", "devices"], { page, limit: 100 });
        total += n.items.length;
        n.items.forEach((device) => {
          const owner = device.user_id || device.employee_id || device.user?.id;
          if (!owner) return;
          owned += 1;
          const key = String(owner);
          if (!byUser.has(key)) byUser.set(key, []);
          byUser.get(key).push(device);
        });
        if (n.items.length < 100 || page >= n.totalPages) break;
      }
      setState({ byUser, total, ownerless: total > 0 && owned === 0, loading: false, error: null });
    } catch (error) {
      setState({ byUser: new Map(), total: 0, ownerless: false, loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged([ATTENDANCE_EVENTS.DEVICE], load);

  return { ...state, reload: load };
}

/* ─── The people tab ─────────────────────────────────────────────────────── */

/** What one person's devices add up to, as a line HR can scan. */
function DeviceCell({ summary, ownerless }) {
  if (ownerless) return <span className="text-xs text-slate-400 italic">Open to see</span>;
  if (summary.total === 0) return <span className="text-xs font-semibold text-slate-400">None yet</span>;
  const parts = [
    summary.active ? `${summary.active} ready` : "",
    summary.pending ? `${summary.pending} waiting` : "",
    summary.suspended ? `${summary.suspended} blocked` : "",
    summary.revoked ? `${summary.revoked} shut off` : "",
  ].filter(Boolean);
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-800">{summary.total === 1 ? "1 device" : `${summary.total} devices`}</p>
      <p className="text-[11px] font-semibold text-slate-500 truncate">{parts.join(" · ")}</p>
    </div>
  );
}

/**
 * The one word that answers "can this person clock in on Monday?". Purple when
 * yes, fuchsia when HR has something to do, slate when they simply haven't got
 * round to it — rose would say something has gone wrong, and nobody having
 * registered yet during a pilot has not (§5).
 */
function CoverState({ summary, ownerless }) {
  if (ownerless) return <span className="text-xs text-slate-400">N/A</span>;
  const view = summary.covered
    ? { label: "Can clock in", cls: "bg-purple-50 text-purple-700 border-purple-200" }
    : summary.pending > 0
      ? { label: "Waiting for you", cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" }
      : summary.total > 0
        ? { label: "Blocked", cls: "bg-rose-50 text-rose-700 border-rose-200" }
        : { label: "No device", cls: "bg-slate-50 text-slate-500 border-slate-200" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${view.cls}`}>
      {view.label}
    </span>
  );
}

function PeopleTab({ inventory, onOpen }) {
  // activeOptions, NOT activeRows. `activeRows` are the raw API rows, whose
  // `.id` is the employee/role-record id and which carry `employee_code`,
  // `department_name`, `avatar_url` under their own names. The normalized
  // entries in `activeOptions` have `id` resolved to the USER id
  // (`user_id || user.id || employee_id || id`) and expose code/department/
  // gender/photo in one shape. Feeding a raw row's `.id` to the device filter
  // returned a stranger's devices, the events filter a stranger's history, and
  // the profile link a 404 "invalid uuid" — all one bug (fixed 16 Oct 2026).
  const { activeOptions, loading: dirLoading, error: dirError, reload } = useEmployeeDirectory();
  const [role, setRole] = useState("employee");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  // The list is filtered in the browser because it is a join: the device half
  // is already here in full, and asking the roster endpoint for a page of
  // people would page over the wrong half.
  const withDevices = useMemo(
    () => activeOptions.map((person) => ({
      person,
      group: workspaceForRole(person.role) || "employee",
      summary: summariseDevices(inventory.byUser.get(String(person.id)) || []),
    })),
    [activeOptions, inventory.byUser]
  );

  const counts = useMemo(() => {
    const out = { employee: 0, manager: 0, hr: 0 };
    withDevices.forEach((r) => { if (out[r.group] !== undefined) out[r.group] += 1; });
    return out;
  }, [withDevices]);

  const rows = useMemo(() => {
    const matches = withDevices.filter((r) => {
      if (r.group !== role) return false;
      if (!inventory.ownerless && !matchesDeviceScope(r.summary, scope)) return false;
      if (!search) return true;
      const hay = `${r.person.name} ${r.person.code} ${r.person.email} ${r.person.department} ${r.person.designation}`.toLowerCase();
      return hay.includes(search);
    });
    // Whoever HR has to act on first: waiting, then nobody-covered, then the rest.
    const rank = (r) => (r.summary.pending > 0 ? 0 : r.summary.covered ? 2 : 1);
    return matches.sort((a, b) => rank(a) - rank(b) || a.person.name.localeCompare(b.person.name));
  }, [withDevices, role, scope, search, inventory.ownerless]);

  useEffect(() => { setPage(1); }, [role, scope, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const loading = dirLoading || inventory.loading;
  const filtered = !!(search || scope);
  const roleLabel = (ROLE_TABS.find((t) => t.value === role) || ROLE_TABS[0]).label.toLowerCase();

  const roleOptions = ROLE_TABS.map((t) => ({ ...t, label: `${t.label} (${counts[t.value]})` }));

  return (
    <div className="space-y-4">
      {inventory.ownerless && (
        <InlineAlert tone="sky">
          The device list isn’t saying who each device belongs to, so the columns below are blank.
          Open a person to see their own devices — that still works.
        </InlineAlert>
      )}

      <div className="bg-white p-4 rounded-2xl shadow-2xs border border-slate-100 flex flex-col xl:flex-row justify-between gap-4">
        <FilterTabs options={roleOptions} value={role} onChange={setRole} />
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative sm:w-56">
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
          <select
            className={SELECT}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={inventory.ownerless}
            aria-label="Filter by what they have"
          >
            {DEVICE_PEOPLE_SCOPES.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-100 shadow-2xs rounded-2xl overflow-hidden">
        {dirError || inventory.error ? (
          <ErrorState
            error={dirError || inventory.error}
            onRetry={() => { reload(); inventory.reload(); }}
            fallback="Couldn’t load who has a device."
          />
        ) : loading && rows.length === 0 ? (
          <div className="p-6"><LoadingRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HiUsers}
            title={filtered ? "Nobody matches" : `No ${roleLabel}`}
            message={filtered
              ? `No ${roleLabel} match these filters. Try “Everyone”, or clear the search.`
              : `There are no ${roleLabel} in the organisation yet.`}
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
                    const preview = rowPreviewProps(() => onOpen(person), `${person.name}’s devices`);
                    return (
                      <tr
                        key={person.id}
                        {...preview}
                        className={`${preview.className} ${summary.pending > 0 ? "bg-fuchsia-50/40" : ""}`}
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
                        <td className="px-6 py-3.5"><DeviceCell summary={summary} ownerless={inventory.ownerless} /></td>
                        <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {inventory.ownerless ? "N/A" : summary.lastUsedAt ? fmtDateTime(summary.lastUsedAt) : "Not yet used"}
                        </td>
                        <td className="px-6 py-3.5"><CoverState summary={summary} ownerless={inventory.ownerless} /></td>
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
  const [coverageError, setCoverageError] = useState(null);
  const [person, setPerson] = useState(null);

  const inventory = useDeviceInventory();

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
    setCoverageError(null);
    try {
      setCoverage(unwrap(await attendanceAPI.getDeviceTrustCoverage()) || null);
    } catch (error) {
      // "Couldn't load", never "nobody covered" (§7) — the tiles say so.
      setCoverage(null);
      setCoverageError(error);
    }
  }, []);

  useEffect(() => { loadPolicy(); loadCoverage(); }, [loadPolicy, loadCoverage]);
  // A decision taken in the inspector changes how many people are covered.
  useAttendanceChanged([ATTENDANCE_EVENTS.DEVICE], loadCoverage);

  const coveragePercent = Number(coverage?.coverage_percentage);
  const coverageKnown = Number.isFinite(coveragePercent);
  const lowCoverage = coverageKnown && coveragePercent < COVERAGE_SAFE_PERCENT;
  const uncovered = coverage
    ? Math.max(0, Number(coverage.active_members || 0) - Number(coverage.enrolled_users || 0))
    : 0;

  const refreshAll = () => {
    loadPolicy();
    loadCoverage();
    inventory.reload();
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
            className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition"
          >
            <HiRefresh className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* ── How ready the organisation is. Above the tabs, so the number is
               in front of HR whichever tab they are reading. ────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CoverageTile
            field="enrolled_users"
            label="Have a device"
            value={coverageError ? "Couldn’t load" : coverage?.enrolled_users ?? "N/A"}
            caption="People with at least one device ready to use"
          />
          <CoverageTile
            field="active_members"
            label="Working here"
            value={coverageError ? "Couldn’t load" : coverage?.active_members ?? "N/A"}
            caption="Everyone who could be asked to clock in"
          />
          <CoverageTile
            field="coverage_percentage"
            label="Covered"
            value={coverageError ? "Couldn’t load" : coverageKnown ? `${coveragePercent}%` : "N/A"}
            caption={coverageKnown ? `${COVERAGE_SAFE_PERCENT}% or more before making it compulsory` : "Needed before making it compulsory"}
            tone={lowCoverage ? "warn" : "purple"}
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
          <PeopleTab inventory={inventory} onOpen={setPerson} />
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
              uncovered={uncovered}
              showToast={showToast}
            />
          )
        )}

        {tab === "activity" && <DeviceActivityLog />}

        {/* Somewhere to look when nothing is registered yet and HR wonders
            whether the page is broken. */}
        {tab === "people" && !inventory.loading && inventory.total === 0 && !inventory.error && (
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <HiDeviceMobile className="w-4 h-4 text-slate-400" />
            Nobody has registered a device yet. Each person does it themselves from
            <span className="font-semibold"> My Registered Devices</span> — it needs their own fingerprint or screen lock, so it can’t be done for them.
          </p>
        )}
      </main>

      {person && (
        <PersonDevicesDialog
          person={person}
          onClose={() => setPerson(null)}
          onChanged={() => { inventory.reload(); loadCoverage(); }}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
