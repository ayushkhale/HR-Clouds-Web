// ─────────────────────────────────────────────────────────────────────────────
// MyDevicesPage — the devices this person may clock in from. Mounted in all
// three workspaces under each one's own prefix (SELF_SERVICE_PAGES.devices):
// everybody punches, HR and managers included, so nobody is sent into the
// employee workspace to shut off a phone they just lost (CLAUDE.md §2).
//
// ─── TWO SCREENS, NO TABS (user decision, 22 Oct 2026) ─────────────────────
//
// This was one page with a `ScreenHeader`, a requirement panel and a
// `SegmentedTabs` strip under both of them. The user's verdict: "i see tabs
// below two cards that is not obviously looking good … if the screen is this
// device then show only this device and that's it, nothing else … why cards
// and tabs bullshit, just like my tasks, title and then list simple".
//
// So it is built like `MyTasksPage` and `FieldLocationsPage` (Client Sites)
// now, which is the house shape for a working list screen:
//
//     <h1> + one-line blurb          ·  the purple action button on the right
//     ─────────────────────────────────────────────────────────────────────
//     one white card: the list, or the one record
//
// Nothing else. No hero, no panel of state above the content, no on-page tab
// strip — THE SIDEBAR IS THE NAVIGATION. "My Registered Devices" already has
// its two entries (This device · All my devices) and they deep-link `?tab=`,
// so a second set of tabs on the page was the same choice offered twice. The
// `?tab=` param stays exactly as it was; only the strip is gone.
//
// Each screen now carries ITS OWN title, so sidebar label = <h1> = top bar
// title the way §2 requires. Both used to read "My Registered Devices", which
// matched neither sidebar entry.
//
// WHERE THE OLD PANELS WENT, rather than being dropped:
//  · The mode headline ("A registered device is required to clock in.") is the
//    first sentence of the BLURB, and the mode pill sits beside the <h1> with
//    the `effective_mode` ⓘ on it. Same two facts, no card.
//  · The slot meter is one small line under the button — "2 of 3 in use. You
//    can register one more." — which is where somebody asks the question it
//    answers. Three segment pills and a bordered tile were never worth the
//    room (and were unreadable crammed into the old header's right rail).
//  · The "waiting for HR" page alert is gone: on This device the record's own
//    status note says it, and on All my devices every row carries its badge.
//    It was the same sentence a third time.
//  · The lockout alert STAYS. It is the one state where attendance is already
//    broken for this person, and shipping a refused punch with no explanation
//    on screen is not "simple", it is a support ticket.
//
// ─── WHY "THIS DEVICE" IS THE DEFAULT ──────────────────────────────────────
// Almost every visit is about the machine in front of the person: register it,
// rename it, or find out why it was refused. A list of four names, three of
// which are old laptops, makes them work out which row they are sitting at
// before they can do anything (user decision, 16 Oct 2026).
//
// Nothing in the browser can say which registered device it is: a WebAuthn
// credential proves possession only during a ceremony. So the answer is the id
// remembered when a registration completed in THIS browser profile
// (`attendance/thisDevice.js`), and when it is missing — another browser, a
// cleared cache, a phone — the screen says so in one line and offers to
// register this one. It is a convenience, never a gate: the signature the
// server checks is what actually proves a punch.
//
// CONTRACT TRAPS
//  · Only ever as present as the server says. The page reads the device-trust
//    context, and with the feature off it says so plainly rather than offering
//    a registration that would fail. The sidebar entry follows the same rule
//    (§7), so an organisation that never switched this on sees no trace of it.
//  · Self-revoke takes NO reason (verified analysis §5 API 7 — the controller
//    writes `user_revoked` itself), unlike HR's revoke. So this is an awaited
//    window.confirm, not a ReasonDialog: asking for words the server throws
//    away would be theatre. It is also idempotent, and IRREVERSIBLE — the same
//    screen lock can never be registered again.
//  · A `pending` device is rendered differently from an `active` one because it
//    cannot clock in yet. Without that, people register, try to punch, get
//    refused, and register again in a loop.
//  · `last_used_at` / `last_ip` / `last_user_agent` are informational. They are
//    how somebody notices a device they don't recognise — not proof of
//    identity.
//  · Shut-off devices are never removed from the list, so it only grows. Live
//    devices sort to the top and the dead ones are muted, or a year of
//    replaced laptops buries the phone the person actually punches from.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiCollection, HiDesktopComputer, HiDeviceMobile, HiPencil, HiPlus,
  HiQuestionMarkCircle, HiRefresh, HiTrash,
} from "react-icons/hi";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailSection, DetailText, rowPreviewProps } from "../components/DetailDialog";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import { attendanceAPI } from "../api";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { listFrom } from "../attendance/normalize";
import { TONE_CLASSES } from "../attendance/enums";
import { EmptyState, ErrorState, InlineAlert, LoadingRows, Spinner, StatusBadge, Toast, useToast } from "../attendance/ui";
import { DANGER_BTN, FIELD, FIELD_INVALID, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../attendance/events";
import { refreshDeviceTrustContext, useDeviceTrustContext } from "../attendance/deviceTrust";
import {
  DEVICE_MODES, DEVICE_NAME_MAX, approvalLabel, deviceStatusNote, effectiveModeOf,
  enforceFromUpcoming, hasApprovalLabel, lastSeenFrom, platformLabel, suggestDeviceName,
} from "../attendance/deviceTrustMeta";
import { webauthnSupported } from "../attendance/webauthn";
import { forgetThisDevice, recallThisDevice, rememberThisDevice } from "../attendance/thisDevice";
import { useAuth } from "../contexts/AuthContext";
import RegisterDeviceDialog from "../attendance/RegisterDeviceDialog";

const SURFACE = "attendance.my_devices";

const platformIcon = (platform) => (platform === "web" ? HiDesktopComputer : HiDeviceMobile);

/**
 * The two screens. Each has its own title (= its sidebar entry = the top bar,
 * §2) and its own page ⓘ, because they answer different questions.
 */
const VIEWS = {
  this: {
    title: "This device",
    help: { surface: SURFACE, field: "this_device", label: "this page" },
    /** The second half of the blurb; the mode sentence is the first. */
    blurb: "This is the one you’re on — rename it, or shut it off if you no longer use it.",
  },
  all: {
    title: "All my devices",
    help: { surface: SURFACE, field: "all_devices", label: "this page" },
    blurb: "Every device you’ve registered, including any you’ve shut off.",
  },
};

/**
 * What the person reads for each mode — one pill and one sentence, and now
 * nothing else. Separate from `DEVICE_MODE_OPTIONS`, which is written for the
 * HR admin choosing the setting ("Off" is a switch position; "Not required" is
 * what it means to somebody clocking in).
 *
 * The tones are deliberately NOT the ones in that list, where `enforce` is
 * rose. Nothing has gone wrong when a device is required — that is the feature
 * working — and rose is reserved for errors and destructive actions (§5). On
 * means purple, watching means indigo, off means grey.
 */
const MODE_VIEW = {
  [DEVICE_MODES.ENFORCE]: {
    pill: "Required",
    tone: "purple",
    headline: "A registered device is required to clock in.",
  },
  [DEVICE_MODES.MONITOR]: {
    pill: "Watch only",
    tone: "blue",
    headline: "A registered device isn’t required yet.",
  },
  [DEVICE_MODES.OFF]: {
    pill: "Not required",
    tone: "slate",
    headline: "Your organisation doesn’t ask for a registered device.",
  },
};

/** Live devices first, each group newest-used first — see the header comment. */
const STATUS_ORDER = { active: 0, pending: 1, suspended: 2, revoked: 3 };
const sortDevices = (devices) => [...devices].sort((a, b) => {
  const rank = (d) => STATUS_ORDER[String(d?.status || "").toLowerCase()] ?? 9;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const when = (d) => String(d?.last_used_at || d?.registered_at || d?.created_at || "");
  return when(b).localeCompare(when(a));
});

/** Rename is one field, so it stays narrow (CLAUDE.md §3). Sits above the inspector. */
function RenameDeviceDialog({ device, busy, error, onSubmit, onClose }) {
  const [name, setName] = useState(device.device_name || "");
  const [attempted, setAttempted] = useState(false);
  const problem = name.trim() ? "" : "Give this device a name you’ll recognise later.";
  const shown = attempted && problem;

  const submit = (e) => {
    e.preventDefault();
    setAttempted(true);
    if (problem || busy) return;
    onSubmit(name.trim());
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Rename device" className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-purple-100">
          <h2 className="text-lg font-bold text-slate-800">Rename this device</h2>
          <p className="text-sm text-slate-500 mt-1">Only the name changes — it keeps working exactly as it does now.</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label htmlFor="rename-device" className={LABEL}>Name</label>
            <input
              id="rename-device"
              autoFocus
              value={name}
              maxLength={DEVICE_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!shown}
              className={`${FIELD} ${shown ? FIELD_INVALID : ""}`}
            />
            {shown && <p className="text-[11px] text-rose-600 font-semibold mt-1.5">{problem}</p>}
          </div>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Go back</button>
          <button type="submit" disabled={busy} className={PRIMARY_BTN}>{busy ? <><Spinner /> Saving…</> : "Save name"}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * The device's specification: a ruled list, label left and value right (user
 * decision, 21 Oct 2026).
 *
 * It used to be six facts in six bordered grey boxes. Read-only facts dressed
 * as disabled form fields read as inputs that won't accept you, and six of
 * them is most of what the screen shows — the boxes were the clutter, not the
 * facts. A hairline carries the same grouping for none of the weight.
 *
 * Two columns from `sm` up: this card is page-wide, and one column of six put
 * a value an entire screen away from its own label. Every row keeps its rule,
 * including the last — the list ends on a line at both widths rather than
 * losing one corner of it when the grid reflows.
 */
function SpecList({ items }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
      {items.map(({ label, value, help: hint }) => (
        <div key={label} className="flex items-baseline justify-between gap-5 py-2.5 border-b border-slate-100">
          <dt className="shrink-0 text-xs font-semibold text-slate-500">
            {hint ? <HelpLabel text={label} help={hint} /> : label}
          </dt>
          <dd className={`min-w-0 text-right text-sm break-words ${value === "N/A" ? "text-slate-400" : "text-slate-800 font-semibold"}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The one card on This device, while the list is still arriving (§5). */
function DeviceSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" aria-busy="true" aria-label="Loading this device">
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100 flex items-center gap-4">
        <span className="w-12 h-12 rounded-2xl bg-slate-100 animate-pulse shrink-0" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-4 w-44 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-64 max-w-full rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-5 py-2.5 border-b border-slate-100">
            <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-28 rounded bg-slate-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * THE WHOLE OF the This device screen: the machine the person is sitting at,
 * everything the server holds about it, and the three things they can do to
 * it. One card, because the screen is one record.
 *
 * `device` is null when this browser has no marker (see the header). That is a
 * normal state, not an error, and it has two different readings — nothing
 * registered at all, or nothing registered *here* — which must not be
 * confused: the old copy told somebody with no devices that theirs was "on the
 * All my devices tab", sending them to an empty table to look for a device
 * that never existed. It never guesses a row, because naming the wrong laptop
 * "this device" would have somebody shut off a machine they are still using.
 */
function ThisDeviceCard({
  device, inferred, canRegister, registerButton, busy, onRename, onRevoke, otherCount, onSeeAll,
}) {
  const dead = device?.status === "revoked";

  if (!device) {
    const nothingYet = otherCount === 0;
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 sm:px-6 py-12 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center">
          <HiQuestionMarkCircle className="w-7 h-7" />
        </span>
        <p className="text-base font-bold text-slate-800 mt-4">
          {nothingYet ? "You haven’t registered a device yet." : "This device isn’t registered here."}
        </p>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xl mx-auto">
          You’re on <span className="font-semibold text-slate-700">{suggestDeviceName()}</span>.{" "}
          {nothingYet
            ? canRegister
              ? "Register it with its screen lock or fingerprint and you’ll be able to clock in from here. It takes about a minute."
              : "Register the device you clock in from, from your phone — or ask HR to register one for you."
            : "We can’t match a browser to a registered device on its own, so if you registered this one somewhere else — or cleared this browser’s data since — it’s on your list under another name."}
        </p>
        {(canRegister || otherCount > 0) && (
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2.5 mt-6">
            {otherCount > 0 && (
              <button type="button" onClick={onSeeAll} className={SECONDARY_BTN}>
                <HiCollection className="w-4 h-4" />
                See {otherCount === 1 ? "the one I have" : `all ${otherCount} of mine`}
              </button>
            )}
            {canRegister && registerButton}
          </div>
        )}
      </div>
    );
  }

  const Icon = platformIcon(device.platform);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* The name is `text-lg` on its own truncating line: it is the one thing
          somebody came to read, and a 100-character device name must not be
          able to push the badge or the buttons off the card. */}
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${dead ? "bg-slate-50 border-slate-200 text-slate-400" : "bg-purple-50 border-purple-100 text-purple-600"}`}>
          <Icon className="w-6 h-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={`text-lg font-bold truncate ${dead ? "text-slate-500" : "text-slate-900"}`}>
            {device.device_name || "This device"}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <StatusBadge kind="device" status={device.status} />
            <span className="text-xs text-slate-500">
              {platformLabel(device.platform)} · {inferred ? "the device you’re most likely on" : "registered from this browser"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!dead && (
            <>
              <button type="button" onClick={onRename} className={SECONDARY_BTN}>
                <HiPencil className="w-4 h-4" /> Rename
              </button>
              <button type="button" onClick={onRevoke} disabled={busy} className={DANGER_BTN}>
                {busy ? <Spinner /> : <HiTrash className="w-4 h-4" />} Shut off
              </button>
            </>
          )}
          {dead && canRegister && registerButton}
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-4">
        {/* Only where the state has a consequence to explain. An active device
            already carries a "Ready" badge two lines above, so a full alert
            repeating it in other words was one more thing between the person
            and what they came to read (21 Oct 2026). Waiting-for-HR and
            shut-off both say something the badge cannot — that a punch from
            here will be refused — so they keep theirs. */}
        {device.status !== "active" && deviceStatusNote(device.status) && (
          <InlineAlert tone={dead ? "rose" : "amber"}>
            {deviceStatusNote(device.status)}
          </InlineAlert>
        )}

        <SpecList
          items={[
            { label: "Kind", value: platformLabel(device.platform) },
            {
              label: "Tied to this device",
              value: device.device_bound === true ? "Yes" : device.device_bound === false ? "No" : "N/A",
              help: { surface: SURFACE, field: "device_bound", label: "being tied to one device" },
            },
            { label: "Registered", value: fmtDateTime(device.registered_at || device.created_at) },
            { label: "Approved", value: device.approved_at ? fmtDateTime(device.approved_at) : "Not needed" },
            { label: "Last used", value: device.last_used_at ? fmtDateTime(device.last_used_at) : "Not yet used" },
            // The browser AND the address, as one line — `last_user_agent`
            // arrived on device rows on 22 Oct 2026, and a bare IP told nobody
            // anything they could act on. No ⓘ: this screen is at the cap
            // (this_device, effective_mode, device_bound) and `last_ip` has one
            // in the inspector (§10).
            { label: "Last seen from", value: lastSeenFrom(device) },
          ]}
        />

        {dead && device.revoke_reason && (
          <div>
            <p className={LABEL}>Why it was shut off</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {device.revoke_reason === "user_revoked" ? "You shut this device off yourself." : device.revoke_reason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * THE WHOLE OF the All my devices screen: one table, nothing above it. The
 * row opens the inspector (§3 — list → row → record inspector); there is no
 * View button, because opening is what the row does.
 */
function DevicesTable({ rows, thisId, inferredId, retiredCount, onOpen }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[620px]">
          <caption className="sr-only">Your registered devices. Open a row for its details.</caption>
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="px-6 py-3.5">Device</th>
              <th className="px-6 py-3.5">
                <HelpLabel text="State" help={{ surface: SURFACE, field: "status", size: "sm", label: "what a device’s state means" }} />
              </th>
              {/* No ⓘ on these two: a date under "Last used" is an ordinary
                  fact (§10), and the hint about spotting a device you no
                  longer recognise is the inspector's, where the row opens. */}
              <th className="px-6 py-3.5">Last used</th>
              <th className="px-6 py-3.5">Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((device) => {
              const preview = rowPreviewProps(() => onOpen(device), "Device details");
              const Icon = platformIcon(device.platform);
              // A device that can't clock in must not look like one that can —
              // the whole point of the row (see the header comment).
              const dead = device.status === "revoked";
              const waiting = device.status === "pending";
              // The one fact this table could not say, which used to send
              // people back to the other screen to work out which row they
              // were sitting at.
              const here = String(device.id) === thisId || String(device.id) === inferredId;
              return (
                <tr
                  key={device.id}
                  {...preview}
                  className={`${preview.className} ${waiting ? "bg-fuchsia-50/40" : dead ? "bg-slate-50/40" : ""}`}
                >
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${dead ? "bg-slate-100 text-slate-400" : "bg-purple-50 text-purple-600"}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`font-semibold truncate ${dead ? "text-slate-400" : "text-slate-800"}`}>
                            {device.device_name || "This device"}
                          </span>
                          {here && !dead && (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white whitespace-nowrap">
                              This device
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-slate-400 truncate">{platformLabel(device.platform)}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4"><StatusBadge kind="device" status={device.status} /></td>
                  <td className={`px-6 py-4 whitespace-nowrap ${dead ? "text-slate-400" : "text-slate-500"}`}>
                    {device.last_used_at ? fmtDateTime(device.last_used_at) : "Not yet used"}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap ${dead ? "text-slate-400" : "text-slate-500"}`}>
                    {fmtDate(device.registered_at || device.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {retiredCount > 0 && (
        <p className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 leading-relaxed">
          Devices you’ve shut off stay on this list as a record. They can’t be used to clock in, and the same screen lock can’t be registered again.
        </p>
      )}
    </>
  );
}

export default function MyDevicesPage() {
  const { ctx, loading: ctxLoading } = useDeviceTrustContext();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // The sidebar's two entries are the navigation; `?tab=` is how they pick a
  // screen. Unchanged from when the page had its own strip, so every existing
  // link and bookmark still lands where it did.
  const view = params.get("tab") === "all" ? "all" : "this";
  const copy = VIEWS[view];
  // The device registered from THIS browser, remembered at the one moment it
  // was known. State rather than a plain read so a registration or a shut-off
  // moves the screen without a reload.
  const [thisId, setThisId] = useState(() => recallThisDevice(user?.id));
  useEffect(() => { setThisId(recallThisDevice(user?.id)); }, [user?.id]);
  const [state, setState] = useState({ devices: [], loading: true, error: null });
  const [selected, setSelected] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);
  const [actionError, setActionError] = useState("");
  const { toast, showToast, clearToast } = useToast(6000);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getMyTrustedDevices();
      setState({ devices: listFrom(res, ["devices"]), loading: false, error: null });
    } catch (error) {
      setState({ devices: [], loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const devices = state.devices;
  const rows = useMemo(() => sortDevices(devices), [devices]);
  const active = devices.filter((d) => d.status === "active");
  const retired = devices.filter((d) => d.status === "revoked" || d.status === "suspended");
  const matchedThis = thisId ? devices.find((d) => String(d.id) === thisId) || null : null;
  // No marker to match (registered in another browser, storage cleared, or
  // registered before this browser started remembering) does NOT mean "no
  // device here": a single live web device is almost certainly the browser the
  // person is on, so show it rather than the false "not registered here" card
  // while the list plainly has one (16 Oct 2026). Two web devices is genuinely
  // ambiguous — we fall back to "we can't tell" only then. Display-only: nothing
  // is written, so the guess self-corrects the moment a second browser is added.
  const liveWeb = devices.filter((d) => {
    const platform = String(d.platform || "").toLowerCase();
    return (platform === "web" || platform === "") && (d.status === "active" || d.status === "pending");
  });
  const inferredThis = !matchedThis && liveWeb.length === 1 ? liveWeb[0] : null;
  const thisDevice = matchedThis || inferredThis;
  // A marker pointing at a row the list no longer has — deleted server-side, or
  // belonging to another account on a shared computer. Dropped, or it would pin
  // an empty record to the top of the screen for good.
  useEffect(() => {
    if (!thisId || state.loading || devices.length === 0) return;
    if (!devices.some((d) => String(d.id) === thisId)) {
      forgetThisDevice(user?.id, thisId);
      setThisId("");
    }
  }, [thisId, devices, state.loading, user?.id]);
  const mode = effectiveModeOf(ctx);
  const modeView = MODE_VIEW[ctx?.enabled === false ? DEVICE_MODES.OFF : mode] || MODE_VIEW[DEVICE_MODES.OFF];
  const enforceFrom = enforceFromUpcoming(ctx);
  const max = Number(ctx?.max_active_devices) || 0;
  // The list is the authority once it has arrived; until then the context's own
  // count keeps the meter from reading "0 of 2" for a second and alarming
  // somebody who has two.
  const used = devices.length ? active.length : Number(ctx?.my_active_device_count) || 0;
  // Gated on what the server returned: a build that can't register (an old
  // browser, an insecure address, or web registration switched off for the
  // organisation) has NO button, with a line saying why — never a button
  // that fails (CLAUDE.md §2, §7).
  const canRegister = ctx?.enabled !== false && ctx?.allow_platform_web !== false && webauthnSupported();
  // The one state where attendance is already broken for this person: a device
  // is required and they haven't got a working one.
  const blocked = mode === DEVICE_MODES.ENFORCE && !ctxLoading && !state.loading && active.length === 0;

  // The old slot meter, as the one line it always was. Under the button, where
  // "can I add another?" is asked.
  const slotsLine = useMemo(() => {
    if (ctxLoading || mode === DEVICE_MODES.OFF || max <= 0) return "";
    const left = Math.max(0, max - used);
    const consequence = used > max
      ? "Shut one off to get back within what your organisation allows."
      : left > 0
        ? `You can register ${left === 1 ? "one more" : `${left} more`}.`
        : "Registering another one replaces one of these for good.";
    // Not lower-cased: the labels start with real words — "HR approves each
    // device" became "hr approves each device".
    const approval = hasApprovalLabel(ctx?.registration_approval)
      ? ` New devices: ${approvalLabel(ctx.registration_approval)}.`
      : "";
    return `${used} of ${max} in use. ${consequence}${approval}`;
  }, [ctxLoading, mode, max, used, ctx?.registration_approval]);

  const registerButton = (
    <button type="button" onClick={() => { setActionError(""); setRegistering(true); }} className={PRIMARY_BTN}>
      <HiPlus className="w-4 h-4" /> Register this device
    </button>
  );

  const revoke = async (device) => {
    const last = active.length === 1 && device.status === "active";
    const consequence = last && mode === DEVICE_MODES.ENFORCE
      ? " This is your only working device, so you won’t be able to clock in until you register another one."
      : "";
    if (!(await window.confirm(`Shut off “${device.device_name}”? You won’t be able to clock in from it again, and the same screen lock can’t be registered a second time.${consequence}`))) return;
    setRowBusy(device.id);
    setActionError("");
    try {
      await attendanceAPI.revokeMyTrustedDevice(device.id);
      // A device of HR's own that was waiting for approval has just left their
      // queue, so the badge and the inbox card clear without a reload (§7).
      emitAttendanceChanged(ATTENDANCE_EVENTS.DEVICE, { entity: "trusted_device", action: "revoke" });
      // Still this machine, but no longer a device — the screen stops offering
      // buttons on it and offers to register instead.
      if (String(device.id) === thisId) { forgetThisDevice(user?.id, device.id); setThisId(""); }
      showToast("Device shut off. It can’t be used to clock in.");
      setSelected(null);
      await Promise.all([load(), refreshDeviceTrustContext()]);
    } catch (err) {
      setActionError(attendanceErrorMessage(err, "Couldn’t shut off this device."));
    } finally {
      setRowBusy(null);
    }
  };

  const rename = async (name) => {
    if (!renaming) return;
    setRowBusy(renaming.id);
    setActionError("");
    try {
      await attendanceAPI.renameTrustedDevice(renaming.id, { device_name: name });
      showToast("Name saved.");
      setRenaming(null);
      setSelected((s) => (s && s.id === renaming.id ? { ...s, device_name: name } : s));
      load();
    } catch (err) {
      setActionError(attendanceErrorMessage(err, "Couldn’t save the new name."));
    } finally {
      setRowBusy(null);
    }
  };

  const onRegistered = async (device) => {
    setRegistering(false);
    // The only moment anybody knows which registered device this browser is.
    if (device?.id) {
      rememberThisDevice(user?.id, device.id);
      setThisId(String(device.id));
      setParams({}, { replace: true });   // land on This device
    }
    showToast(device?.status === "pending"
      ? "Device registered. HR has to approve it before you can clock in from it."
      : "Device registered. You can clock in from it now.");
    // A `pending` device has just JOINED HR's approval queue, so the badge has
    // to grow by one without a reload — the same bus, the other direction.
    if (device?.status === "pending") {
      emitAttendanceChanged(ATTENDANCE_EVENTS.DEVICE, { entity: "trusted_device", action: "register" });
    }
    // The context is re-read inside completeDeviceRegistration — the count has
    // already moved by the time we get here, so only the list is refetched.
    await load();
  };

  const firstLoad = state.loading && devices.length === 0;

  return (
    <>
      <DashboardTopBar title={copy.title} />
      <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6">
        {/* Title and blurb left, the action right — the shape MyTasksPage and
            Client Sites use. Sidebar label = this h1 = the top bar title, in
            every workspace (§2). */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h1 className="text-2xl font-bold text-slate-900">
                <HelpLabel text={copy.title} help={copy.help} />
              </h1>
              {/* The mode, as a pill beside the title instead of a panel under
                  it. The ⓘ for what the organisation requires lives here —
                  one placement for one concept (§10). */}
              {!ctxLoading && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${TONE_CLASSES[modeView.tone] || TONE_CLASSES.slate}`}>
                  <HelpLabel
                    text={modeView.pill}
                    help={{ surface: SURFACE, field: "effective_mode", size: "sm", label: "what your organisation requires" }}
                  />
                </span>
              )}
            </div>
            {/* What the organisation asks for, then what this screen is. The
                screen's own half is always there — the mode sentence is only
                prefixed once the context has arrived, so a slow read leaves
                the blurb short rather than replacing it with "loading…". */}
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              {ctxLoading ? copy.blurb : `${mode === DEVICE_MODES.MONITOR && enforceFrom
                ? `A registered device becomes compulsory on ${fmtDate(enforceFrom)}, so register one before then.`
                : modeView.headline} ${copy.blurb}`}
            </p>
          </div>

          <div className="shrink-0 sm:text-right">
            <div className="flex items-center gap-2 sm:justify-end">
              {canRegister && registerButton}
              <button
                type="button"
                onClick={load}
                disabled={state.loading}
                aria-label="Refresh"
                title="Refresh"
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-purple-200 hover:text-purple-700 transition disabled:opacity-60"
              >
                <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
              </button>
            </div>
            {/* Why the button is missing, where the button would be — never a
                button that 403s, and never a missing one with no explanation
                (§2, §7). */}
            {!canRegister && ctx?.enabled !== false && (
              <p className="text-xs text-slate-500 mt-2 max-w-xs sm:ml-auto leading-relaxed">
                {ctx?.allow_platform_web === false
                  ? "Your organisation registers phones only. Open HR Clouds on your phone to register one."
                  : "This browser can’t register a device — it needs a secure (https) address and a recent version of Chrome, Edge, Safari or Firefox."}
              </p>
            )}
            {canRegister && slotsLine && (
              <p className="text-[11px] text-slate-500 mt-2 max-w-[260px] sm:ml-auto leading-relaxed">{slotsLine}</p>
            )}
          </div>
        </div>

        {actionError && <InlineAlert tone="rose">{actionError}</InlineAlert>}

        {/* The next punch is already refused. Fuchsia, not rose: nothing has
            failed yet, and the fix is one button away (§5). */}
        {blocked && (
          <InlineAlert tone="amber">
            <span className="block">You haven’t got a working device, so your next clock-in will be refused.</span>
            {canRegister
              ? <span className="block font-medium mt-0.5">Register this one with its screen lock or fingerprint — it takes about a minute.</span>
              : <span className="block font-medium mt-0.5">Register from your phone, or ask HR to register a device for you.</span>}
          </InlineAlert>
        )}

        {/* "Nothing on file" and "couldn’t load" are different answers (§7): a
            failed read must never say "you haven’t registered a device yet",
            which invites a second registration of one that already exists. */}
        {state.error && devices.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <ErrorState error={state.error} onRetry={load} fallback="Couldn’t load your devices." />
          </div>
        ) : view === "this" ? (
          firstLoad ? <DeviceSkeleton /> : (
            <ThisDeviceCard
              device={thisDevice}
              inferred={!matchedThis && !!inferredThis}
              canRegister={canRegister}
              registerButton={registerButton}
              busy={rowBusy === thisDevice?.id}
              onRename={() => { setActionError(""); setRenaming(thisDevice); }}
              onRevoke={() => revoke(thisDevice)}
              otherCount={devices.length}
              onSeeAll={() => setParams({ tab: "all" }, { replace: true })}
            />
          )
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {firstLoad ? (
              <div className="p-6"><LoadingRows rows={4} /></div>
            ) : devices.length === 0 ? (
              <EmptyState
                icon={HiDeviceMobile}
                title="No devices registered"
                message={canRegister
                  ? "Register the device you clock in from most. It takes a minute and uses its screen lock or fingerprint."
                  : "Nothing registered yet. Register from a phone, or ask HR to do it for you."}
                action={canRegister ? registerButton : null}
              />
            ) : (
              <div className={state.loading ? "opacity-60" : ""}>
                <DevicesTable
                  rows={rows}
                  thisId={thisId}
                  inferredId={inferredThis ? String(inferredThis.id) : ""}
                  retiredCount={retired.length}
                  onOpen={(device) => { setActionError(""); setSelected(device); }}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {selected && (
        <DetailDialog
          eyebrow="Attendance device"
          title={selected.device_name || "This device"}
          subtitle={platformLabel(selected.platform)}
          icon={platformIcon(selected.platform)}
          badge={<StatusBadge kind="device" status={selected.status} />}
          width="medium"
          onClose={() => setSelected(null)}
          footer={selected.status === "revoked" ? (
            <DetailFooterNote>This device is shut off for good, so there is nothing left to change on it.</DetailFooterNote>
          ) : (
            <>
              <button type="button" onClick={() => { setActionError(""); setRenaming(selected); }} className={SECONDARY_BTN}>
                <HiPencil className="w-4 h-4" /> Rename
              </button>
              <button type="button" onClick={() => revoke(selected)} disabled={rowBusy === selected.id} className={DANGER_BTN}>
                {rowBusy === selected.id ? <Spinner /> : <HiTrash className="w-4 h-4" />} Shut off
              </button>
            </>
          )}
        >
          <div className="space-y-4">
            {/* Shut off is pressed in the footer, so its refusal belongs here:
                the page-level alert sits behind this overlay, unread. */}
            {actionError && !renaming && <InlineAlert tone="rose">{actionError}</InlineAlert>}
            {deviceStatusNote(selected.status) && (
              <InlineAlert tone={selected.status === "active" ? "emerald" : selected.status === "revoked" ? "rose" : "amber"}>
                {deviceStatusNote(selected.status)}
              </InlineAlert>
            )}

            <DetailSection title="This device" collapsible={false}>
              <DetailGrid
                cols={3}
                items={[
                  { label: "Kind", value: platformLabel(selected.platform) },
                  {
                    label: "Tied to this device",
                    value: selected.device_bound === true ? "Yes" : selected.device_bound === false ? "No" : "N/A",
                    help: { surface: SURFACE, field: "device_bound", label: "being tied to one device" },
                  },
                  { label: "Registered", value: fmtDateTime(selected.registered_at || selected.created_at) },
                  { label: "Approved", value: selected.approved_at ? fmtDateTime(selected.approved_at) : "Not needed" },
                  {
                    label: "Last used",
                    value: selected.last_used_at ? fmtDateTime(selected.last_used_at) : "Not yet used",
                    help: { surface: SURFACE, field: "last_used_at", label: "the last-used time" },
                  },
                  {
                    label: "Last seen from",
                    value: lastSeenFrom(selected),
                    help: { surface: SURFACE, field: "last_ip", label: "the last network address" },
                  },
                ]}
              />
            </DetailSection>

            {selected.status === "revoked" && selected.revoke_reason && (
              <DetailSection title="Why it was shut off" collapsible={false}>
                <DetailText>
                  {selected.revoke_reason === "user_revoked" ? "You shut this device off yourself." : selected.revoke_reason}
                </DetailText>
              </DetailSection>
            )}
          </div>
        </DetailDialog>
      )}

      {/* Siblings of the inspector, never children (CLAUDE.md §3 stacking). */}
      {renaming && (
        <RenameDeviceDialog
          device={renaming}
          busy={rowBusy === renaming.id}
          error={actionError}
          onSubmit={rename}
          onClose={() => { setRenaming(null); setActionError(""); }}
        />
      )}

      {registering && (
        <RegisterDeviceDialog
          ctx={ctx}
          devices={devices}
          onRegistered={onRegistered}
          onClose={() => setRegistering(false)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
