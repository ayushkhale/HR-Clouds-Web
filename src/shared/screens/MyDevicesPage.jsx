// ─────────────────────────────────────────────────────────────────────────────
// MyDevicesPage — the devices this person may clock in from, mounted in all
// three workspaces under each one's own prefix (SELF_SERVICE_PAGES.devices).
// Everybody punches, HR and managers included, so nobody is sent into the
// employee workspace to shut off a phone they just lost (CLAUDE.md §2).
//
// Only ever as present as the server says: the page reads the device-trust
// context, and with the feature off it says so plainly rather than offering a
// registration that would fail. The sidebar entry follows the same rule, so an
// organisation that has never switched this on sees no trace of it.
//
// WHAT THE LAYOUT IS FOR. Three questions, in the order people ask them:
//  1. "Do I have to do anything?" → the status panel, which states what the
//     organisation asks for right now and, in `monitor`, the date it starts
//     biting. One sentence, one pill, never a page of instructions.
//  2. "Can I add another one?" → the slot meter beside it. The cap and the
//     replace-one-to-add-one rule used to live only inside the registration
//     dialog, so people met them after committing to the fingerprint prompt.
//  3. "Is anything wrong?" → the call-outs under it: no working device while a
//     device is required, or one still waiting for HR. Both are states where
//     the next punch is refused, so they are on the page, not in a row badge
//     nobody reads.
// The table answers the fourth question ("which ones are mine?") and the row
// opens the inspector for the rest (§3 — list → row → record inspector).
//
// ─── WHY "THIS DEVICE" IS THE FIRST TAB ────────────────────────────────────
// Almost every visit is about the machine in front of the person: register it,
// rename it, or find out why it was refused. A list of four names, three of
// which are old laptops, makes them work out which row they are sitting at
// before they can do anything — so the device they are ON opens first, in
// full, with its buttons (user decision, 16 Oct 2026).
//
// Nothing in the browser can say which registered device it is: a WebAuthn
// credential proves possession only during a ceremony. So the answer is the id
// remembered when a registration completed in THIS browser profile
// (`attendance/thisDevice.js`), and when it is missing — another browser, a
// cleared cache, a phone — the tab says so in one line and offers to register
// this one. It is a convenience, never a gate: the signature the server checks
// is what actually proves a punch.
//
// CONTRACT TRAPS
//  · Self-revoke takes NO reason (verified analysis §5 API 7 — the controller
//    writes `user_revoked` itself), unlike HR's revoke. So this is an awaited
//    window.confirm, not a ReasonDialog: asking for words the server throws
//    away would be theatre. It is also idempotent, and IRREVERSIBLE — the same
//    screen lock can never be registered again.
//  · A `pending` device is rendered differently from an `active` one because it
//    cannot clock in yet. Without that, people register, try to punch, get
//    refused, and register again in a loop.
//  · `last_used_at` / `last_ip` are informational. They are how somebody
//    notices a device they don't recognise — not proof of identity.
//  · Shut-off devices are never removed from the list, so it only grows. Live
//    devices are sorted to the top and the dead ones are muted, or a year of
//    replaced laptops buries the phone the person actually punches from.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiDesktopComputer, HiDeviceMobile, HiPlus, HiRefresh, HiTrash, HiPencil,
  HiShieldCheck, HiShieldExclamation, HiEye, HiQuestionMarkCircle, HiCollection,
} from "react-icons/hi";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailSection, DetailText, rowPreviewProps } from "../components/DetailDialog";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { attendanceAPI } from "../api";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { listFrom } from "../attendance/normalize";
import { EmptyState, ErrorState, InlineAlert, LoadingRows, Spinner, StatusBadge, Toast, useToast } from "../attendance/ui";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { DANGER_BTN, FIELD, FIELD_INVALID, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "../documents/ui";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../attendance/events";
import { refreshDeviceTrustContext, useDeviceTrustContext } from "../attendance/deviceTrust";
import {
  DEVICE_MODES, DEVICE_NAME_MAX, approvalLabel, deviceModeMeta, deviceStatusNote,
  effectiveModeOf, enforceFromUpcoming, platformLabel, suggestDeviceName,
} from "../attendance/deviceTrustMeta";
import { webauthnSupported } from "../attendance/webauthn";
import { forgetThisDevice, recallThisDevice, rememberThisDevice } from "../attendance/thisDevice";
import { useAuth } from "../contexts/AuthContext";
import RegisterDeviceDialog from "../attendance/RegisterDeviceDialog";

const SURFACE = "attendance.my_devices";

const platformIcon = (platform) => (platform === "web" ? HiDesktopComputer : HiDeviceMobile);

/**
 * What the person reads for each mode. Separate from `DEVICE_MODE_OPTIONS`,
 * which is written for the HR admin choosing the setting ("Off" is a switch
 * position; "Not required" is what it means to somebody clocking in).
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
    icon: HiShieldCheck,
    headline: "A registered device is required to clock in.",
  },
  [DEVICE_MODES.MONITOR]: {
    pill: "Watch only",
    tone: "blue",
    icon: HiEye,
    headline: "A registered device isn’t required yet.",
  },
  [DEVICE_MODES.OFF]: {
    pill: "Not required",
    tone: "slate",
    icon: HiShieldExclamation,
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

/** The mode pill. Same shape as `StatusBadge`, from the same tone tables. */
function ModePill({ view }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[view.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[view.tone]}`} aria-hidden="true" />
      {view.pill}
    </span>
  );
}

/**
 * How many of the allowed devices are in use, as segments rather than a
 * percentage: the cap is 1–3 in practice, so a bar would read as "33%" of
 * nothing meaningful while three pills can be counted at a glance.
 *
 * Renders nothing when the cap is unknown — an older server, or the feature
 * off — rather than inventing a limit (§7).
 */
function SlotMeter({ used, max }) {
  if (!(max > 0)) return null;
  const left = Math.max(0, max - used);
  const over = Math.max(0, used - max);
  return (
    <div className="shrink-0 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 sm:min-w-[210px]">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Devices you can keep</p>
      <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums leading-none">
        {used} <span className="text-sm font-semibold text-slate-400">of {max} in use</span>
      </p>
      <div className="flex items-center gap-1 mt-2.5" aria-hidden="true">
        {Array.from({ length: Math.max(max, used) }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 min-w-[14px] rounded-full ${i < used ? "bg-purple-500" : "bg-slate-200"}`}
          />
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
        {over > 0
          ? "Shut one off to get back within what your organisation allows."
          : left > 0
            ? `You can register ${left === 1 ? "one more" : `${left} more`}.`
            : "Registering another one replaces one of these for good."}
      </p>
    </div>
  );
}

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
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
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

/* A read-only fact, styled like the inspector's so the page and the popup
   don't disagree about what a label looks like. */
const FACT_BOX = "min-h-10 flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2 text-sm";

function FactGrid({ items }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(({ label, value, help: hint }) => (
        <div key={label} className="min-w-0 flex flex-col">
          <dt className={LABEL}>{hint ? <HelpLabel text={label} help={hint} /> : label}</dt>
          <dd className={`${FACT_BOX} flex-1 ${value === "N/A" ? "text-slate-400" : "text-slate-800 font-semibold"}`}>
            <span className="min-w-0 break-words">{value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The machine the person is sitting at, in full — everything the server holds
 * about it and the three things they can do to it.
 *
 * `device` is null when this browser has no marker (see the header). That is a
 * normal state, not an error: it says what it can see of this browser, offers
 * to register it, and points at the list for the rest. It never guesses a row,
 * because naming the wrong laptop "this device" would have somebody shut off a
 * machine they are still using.
 */
function ThisDeviceCard({
  device, inferred, canRegister, registerButton, slotsText, busy, onRename, onRevoke,
}) {
  const Icon = device ? platformIcon(device.platform) : HiDesktopComputer;
  const dead = device?.status === "revoked";

  if (!device) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-start gap-4">
          <span className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
            <HiQuestionMarkCircle className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">This device isn’t registered here yet.</p>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-2xl">
              You’re on <span className="font-semibold text-slate-700">{suggestDeviceName()}</span>. We can’t match a browser
              to a registered device on its own, so if you registered this one from a different browser — or cleared this
              browser’s data since — it’s on the <span className="font-semibold text-slate-700">All my devices</span> tab instead.
            </p>
            {slotsText && <p className="text-xs text-slate-500 mt-2">{slotsText}</p>}
          </div>
          {canRegister && <div className="shrink-0">{registerButton}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${dead ? "bg-slate-50 border-slate-200 text-slate-400" : "bg-purple-50 border-purple-100 text-purple-600"}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className={`text-base font-bold truncate ${dead ? "text-slate-500" : "text-slate-900"}`}>
              {device.device_name || "This device"}
            </h3>
            <StatusBadge kind="device" status={device.status} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {platformLabel(device.platform)} · {inferred ? "the device you’re most likely on" : "registered from this browser"}
          </p>
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
        {deviceStatusNote(device.status) && (
          <InlineAlert tone={device.status === "active" ? "emerald" : dead ? "rose" : "amber"}>
            {deviceStatusNote(device.status)}
          </InlineAlert>
        )}

        <FactGrid
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
            { label: "Last seen from", value: device.last_ip || "N/A" },
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

        {!dead && slotsText && <p className="text-xs text-slate-500">{slotsText}</p>}
      </div>
    </div>
  );
}

/* The device in front of the person first, the record second. */
const TABS = [
  { key: "this", label: "This device", icon: HiDeviceMobile },
  { key: "all", label: "All my devices", icon: HiCollection },
];

export default function MyDevicesPage() {
  const { ctx, loading: ctxLoading } = useDeviceTrustContext();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "this";
  // The device registered from THIS browser, remembered at the one moment it
  // was known. State rather than a plain read so a registration or a shut-off
  // moves the panel without a reload.
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
  const pending = devices.filter((d) => d.status === "pending");
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
  // an empty panel to the top of the page for good.
  useEffect(() => {
    if (!thisId || state.loading || devices.length === 0) return;
    if (!devices.some((d) => String(d.id) === thisId)) {
      forgetThisDevice(user?.id, thisId);
      setThisId("");
    }
  }, [thisId, devices, state.loading, user?.id]);
  const mode = effectiveModeOf(ctx);
  const modeView = MODE_VIEW[ctx?.enabled === false ? DEVICE_MODES.OFF : mode] || MODE_VIEW[DEVICE_MODES.OFF];
  const modeMeta = deviceModeMeta(ctx?.enabled === false ? DEVICE_MODES.OFF : mode);
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

  const slotsLeft = max > 0 ? Math.max(0, max - used) : null;
  // The meter says this when it is on screen; this line is for the one state
  // it isn't (checks off, registering still possible) — never both at once.
  const slotsHint = max > 0
    ? (slotsLeft > 0
      ? `You can keep ${slotsLeft === 1 ? "one more device" : `${slotsLeft} more devices`}.`
      : "You’ve registered as many as your organisation allows — another one would replace one of these for good.")
    : "";

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
      // Still this machine, but no longer a device — the panel stops offering
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
      setParams({}, { replace: true });   // land on it
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

  return (
    <>
      <DashboardTopBar title="My Registered Devices" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="My Registered Devices" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              The computers and phones you’ve registered for clocking in. Registering one proves a punch came from a device you hold.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={load} disabled={state.loading} className={SECONDARY_BTN}>
              <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {canRegister && registerButton}
          </div>
        </div>

        {actionError && <InlineAlert tone="rose">{actionError}</InlineAlert>}

        {/* What the organisation currently asks for, and how much room is left.
            Shown from the context, so an organisation that hasn't switched this
            on reads "not required" rather than a page of instructions it
            doesn't need yet. */}
        {ctxLoading ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-5 animate-pulse" aria-busy="true" aria-label="Loading what your organisation requires">
            <div className="h-3.5 w-56 bg-slate-200 rounded" />
            <div className="h-3 w-80 bg-slate-100 rounded mt-3" />
            <div className="h-3 w-64 bg-slate-100 rounded mt-2" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${TONE_CLASSES[modeView.tone]}`}>
                  <modeView.icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <p className="text-sm font-bold text-slate-800">{modeView.headline}</p>
                    <ModePill view={modeView} />
                    {mode !== DEVICE_MODES.OFF && (
                      <FieldHelp surface={SURFACE} field="effective_mode" label="what your organisation requires" size="sm" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    {mode === DEVICE_MODES.MONITOR && enforceFrom
                      ? `We’re recording which punches come from a registered device. From ${fmtDate(enforceFrom)} it becomes compulsory, so register one before then.`
                      : modeMeta.hint}
                  </p>
                  {mode !== DEVICE_MODES.OFF && ctx?.registration_approval && (
                    <p className="text-xs text-slate-500 mt-2">
                      <span className="font-semibold text-slate-600">New devices:</span> {approvalLabel(ctx.registration_approval).toLowerCase()}.
                    </p>
                  )}
                </div>
              </div>
              {mode !== DEVICE_MODES.OFF && <SlotMeter used={used} max={max} />}
            </div>
          </div>
        )}

        {/* The next punch is already refused, so this comes before anything the
            person might browse. Fuchsia, not rose: nothing has failed yet, and
            the fix is one button away (§5). */}
        {blocked && (
          <InlineAlert tone="amber">
            <span className="block">You haven’t got a working device, so your next clock-in will be refused.</span>
            {canRegister
              ? <span className="block font-medium mt-0.5">Register this one with its screen lock or fingerprint — it takes about a minute.</span>
              : <span className="block font-medium mt-0.5">Register from your phone, or ask HR to register a device for you.</span>}
          </InlineAlert>
        )}

        {pending.length > 0 && (
          <InlineAlert tone="amber">
            {pending.length === 1
              ? "One device is waiting for HR to approve it. You can’t clock in from that device until they do — nothing more is needed from you."
              : `${pending.length} devices are waiting for HR to approve them. You can’t clock in from them until they do — nothing more is needed from you.`}
          </InlineAlert>
        )}

        {!canRegister && ctx?.enabled !== false && (
          <InlineAlert tone="sky">
            {ctx?.allow_platform_web === false
              ? "Your organisation registers phones only, so this computer can’t be registered here. Open HR Clouds on your phone to register it."
              : "This browser can’t register a device — it needs a secure (https) address and a recent version of Chrome, Edge, Safari or Firefox. Ask HR if you can’t get there."}
          </InlineAlert>
        )}

        {/* The ⓘ sits BESIDE the strip, never inside it: a help button inside a
            tablist is a third tab as far as the keyboard is concerned (§10). */}
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="My registered devices">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParams(key === "this" ? {} : { tab: key }, { replace: true })}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {/* Live devices only (active + pending), never the total that
                    includes shut-off records kept below — a person who shut both
                    of their old devices off was reading "2" here as "you still
                    have 2 devices" (16 Oct 2026). The table still lists the
                    shut-off ones under its own footnote. */}
                {key === "all" && active.length + pending.length > 0 && (
                  <span className="text-[11px] font-bold text-slate-400">{active.length + pending.length}</span>
                )}
              </button>
            ))}
          </div>
          <FieldHelp surface={SURFACE} field={`tab.${tab}`} label={`the ${TABS.find((t) => t.key === tab)?.label} tab`} />
        </div>

        {tab === "this" && (
          <ThisDeviceCard
            device={thisDevice}
            inferred={!matchedThis && !!inferredThis}
            canRegister={canRegister}
            registerButton={registerButton}
            slotsText={mode === DEVICE_MODES.OFF ? slotsHint : ""}
            busy={rowBusy === thisDevice?.id}
            onRename={() => { setActionError(""); setRenaming(thisDevice); }}
            onRevoke={() => revoke(thisDevice)}
          />
        )}

        {tab === "all" && (
          <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <HiDeviceMobile className="w-4 h-4 text-purple-600 shrink-0" />
              <h3 className="text-base font-bold text-slate-800">Registered devices</h3>
              {active.length > 0 && (
                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5">
                  {active.length} ready to use
                </span>
              )}
            </div>
            {state.error ? (
              <ErrorState error={state.error} onRetry={load} fallback="Couldn’t load your devices." />
            ) : state.loading && devices.length === 0 ? (
              <div className="p-6"><LoadingRows rows={3} /></div>
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
                        <th className="px-6 py-3.5">
                          <HelpLabel text="Last used" help={{ surface: SURFACE, field: "last_used_at", size: "sm", label: "the last-used time" }} />
                        </th>
                        <th className="px-6 py-3.5">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {rows.map((device) => {
                        const preview = rowPreviewProps(() => { setActionError(""); setSelected(device); }, "Device details");
                        const Icon = platformIcon(device.platform);
                        // A device that can't clock in must not look like one that
                        // can — the whole point of the row (see header comment).
                        const dead = device.status === "revoked";
                        const waiting = device.status === "pending";
                        return (
                          <tr
                            key={device.id}
                            {...preview}
                            className={`${preview.className} ${waiting ? "bg-fuchsia-50/40" : dead ? "bg-slate-50/40" : ""}`}
                          >
                            <td className="px-6 py-4">
                              <span className="flex items-start gap-2.5 min-w-0">
                                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${dead ? "text-slate-300" : "text-purple-400"}`} />
                                <span className="min-w-0">
                                  <span className={`block font-semibold truncate ${dead ? "text-slate-400" : "text-slate-800"}`}>
                                    {device.device_name || "This device"}
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
                {retired.length > 0 && (
                  <p className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 leading-relaxed">
                    Devices you’ve shut off stay on this list as a record. They can’t be used to clock in, and the same screen lock can’t be registered again.
                  </p>
                )}
              </>
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
                  { label: "Last used", value: selected.last_used_at ? fmtDateTime(selected.last_used_at) : "Not yet used" },
                  {
                    label: "Last seen from",
                    value: selected.last_ip || "N/A",
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
