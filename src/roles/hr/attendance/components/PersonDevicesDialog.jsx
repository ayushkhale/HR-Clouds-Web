// ─────────────────────────────────────────────────────────────────────────────
// PersonDevicesDialog.jsx — everything we hold about ONE person's attendance
// devices, and the five decisions HR can take on each of them.
//
// WHY IT FETCHES ON OPEN. The list behind it is a join of the device inventory
// onto the people directory, which is a summary by design (how many, what
// state, last used). The decisions need the real rows — a device approved by a
// colleague two minutes ago must not still offer Approve — so opening a person
// re-reads that person's devices with `user_id`, the one filter the contract
// documents for this endpoint. One request per dialog, never per row (§7).
//
// It is also the fallback for a server whose inventory rows carry no owner: the
// summary in the list cannot be built without `user_id`, but this read is
// filtered BY `user_id`, so the person's real devices always arrive here.
//
// EVERY ACTION IS GUARDED SERVER-SIDE. Two admins deciding the same device at
// once gets the loser a 409 DEVICE_INVALID_STATE_TRANSITION, which is not a
// failure to report in red — it means somebody else already dealt with it, so
// we say that and re-read. Buttons are rendered only on a status they are legal
// from (`deviceDecisionsFor`), so one never appears where it would 409.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiDesktopComputer, HiDeviceMobile, HiExternalLink, HiUser } from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailText,
} from "../../../../shared/components/DetailDialog";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import GenderAvatar from "../../../../shared/components/GenderAvatar";
import { attendanceAPI } from "../../../../shared/api";
import { fmtDateTime } from "../../../../shared/attendance/dates";
import { listFrom } from "../../../../shared/attendance/normalize";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../../../../shared/attendance/events";
import {
  DEVICE_REASON_MAX, DEVICE_REASON_MIN, deviceStatusNote, lastSeenFrom,
  platformLabel, summariseDevices,
} from "../../../../shared/attendance/deviceTrustMeta";
import {
  DEVICE_DECISIONS, deviceDecisionFailure, deviceDecisionsFor, runDeviceDecision,
} from "../../../../shared/attendance/deviceDecisions";
import { EmptyState, InlineAlert, LoadingRows, Spinner, StatusBadge } from "../../../../shared/attendance/ui";
import { DANGER_BTN, SECONDARY_BTN } from "../../../../shared/documents/ui";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import DeviceActivityLog from "./DeviceActivityLog";

const SURFACE = "attendance.employee_devices";
const help = (field, extra) => ({ surface: SURFACE, field, ...extra });

const platformIcon = (platform) => (String(platform || "").toLowerCase() === "web" ? HiDesktopComputer : HiDeviceMobile);
const statusTone = (status) => (status === "active" ? "emerald" : status === "revoked" ? "rose" : "amber");

/**
 * @param {object} props
 * @param {object} props.person        directory entry: { id, name, code, email, department, designation, role, photo, gender }
 * @param {() => void} props.onClose
 * @param {() => void} props.onChanged fires after any decision, so the list behind refreshes
 * @param {(message: string) => void} props.showToast
 */
export default function PersonDevicesDialog({ person, onClose, onChanged, showToast }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ devices: [], loading: true, error: null });
  const [asking, setAsking] = useState(null);   // { key, device } while a reason is being written
  // { id, key } of the ONE decision in flight — the device AND which button.
  // Keyed on the device alone, every button on that device spun at once; the
  // press has to name the button so only it shows the spinner (16 Oct 2026).
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getTrustedDevices({ user_id: person.id, limit: 100 });
      setState({ devices: listFrom(res, ["items", "devices"]), loading: false, error: null });
    } catch (error) {
      setState({ devices: [], loading: false, error });
    }
  }, [person.id]);

  useEffect(() => { load(); }, [load]);

  const devices = state.devices;
  const summary = summariseDevices(devices);
  // First read: nothing is known yet, so the summary would read "0 ready to
  // use" — which is a claim, not a blank. Skeletons until it has arrived; the
  // dialog's own spinner line covers the re-reads after a decision.
  const firstLoad = state.loading && devices.length === 0;

  async function decide(key, device, reason) {
    if (busy) return;
    setBusy({ id: device.id, key });
    setActionError("");
    try {
      await runDeviceDecision(key, device.id, reason);
      emitAttendanceChanged(ATTENDANCE_EVENTS.DEVICE, { entity: "trusted_device", action: key });
      setAsking(null);
      showToast?.(DEVICE_DECISIONS[key].done);
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(attendanceErrorMessage(err, deviceDecisionFailure(key)));
      // Somebody else got there first — the row is stale, not the request wrong.
      if (err?.status === 409) { setAsking(null); load(); }
    } finally {
      setBusy(null);
    }
  }

  const start = (key, device) => {
    setActionError("");
    if (DEVICE_DECISIONS[key].reason) setAsking({ key, device });
    else decide(key, device);
  };

  const ask = asking ? DEVICE_DECISIONS[asking.key] : null;
  const subtitle = [person.department, person.designation].filter(Boolean).join(" · ") || person.email || "";

  return (
    <>
      <DetailDialog
        eyebrow="Attendance devices"
        title={person.name}
        subtitle={subtitle}
        icon={HiUser}
        width="wide"
        loading={state.loading && devices.length > 0}
        badge={
          <DetailPill tone={summary.covered ? "solid" : summary.pending > 0 ? "outline" : "muted"}>
            {summary.covered ? "Can clock in" : summary.pending > 0 ? "Waiting for you" : "No working device"}
          </DetailPill>
        }
        onClose={onClose}
        footer={
          <>
            <DetailFooterNote>
              {devices.length > 0
                ? "Each device has its own buttons above — a decision applies to that one device, not to the person."
                : "There is nothing to decide until this person registers a device themselves."}
            </DetailFooterNote>
            <button
              type="button"
              onClick={() => navigate(`/dashboard/hr/employees/${person.id}?tab=attendance`)}
              className={SECONDARY_BTN}
            >
              <HiExternalLink className="w-4 h-4" /> Open profile
            </button>
          </>
        }
      >
        <div className="space-y-6">
          {actionError && <InlineAlert tone="rose">{actionError}</InlineAlert>}

          {/* Who this is. The header carries the name; this carries the face and
              the identifier HR actually quotes, which is the employee code — an
              id never reaches the screen (§4). */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3.5">
            <span className="w-11 h-11 rounded-full overflow-hidden shrink-0 ring-2 ring-white shadow-xs">
              <GenderAvatar person={person.raw || person} gender={person.gender} name={person.name} src={person.photo} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{person.name}</p>
              <p className="text-[11px] font-semibold text-slate-500 truncate">
                {person.code ? `Code ${person.code}` : person.email || "N/A"}
              </p>
            </div>
          </div>

          {firstLoad && <LoadingRows rows={4} />}

          {!firstLoad && <DetailStats
            items={[
              { label: "Ready to use", value: summary.active, hint: summary.active ? "Can clock in now" : "Cannot clock in" },
              { label: "Waiting for you", value: summary.pending, hint: summary.pending ? "Needs a decision" : "Nothing waiting" },
              { label: "Blocked or shut off", value: summary.suspended + summary.revoked, hint: "Kept as a record" },
            ]}
          />}

          {state.error ? (
            <InlineAlert tone="rose">
              {attendanceErrorMessage(state.error, "Couldn’t load this person’s devices.")}
            </InlineAlert>
          ) : firstLoad ? null : devices.length === 0 ? (
            <EmptyState
              icon={HiDeviceMobile}
              title="No devices registered"
              message="This person hasn’t registered a device yet. They do it themselves from My Registered Devices — nobody can do it for them, because it needs their own fingerprint or screen lock."
            />
          ) : (
            devices.map((device, index) => {
              const Icon = platformIcon(device.platform);
              const decisions = deviceDecisionsFor(device.status);
              // One ⓘ per concept per screen (§10): with four devices listed,
              // the same two hints would be offered eight times. The first
              // card carries them; the fields mean the same on every card.
              const firstCard = index === 0;
              return (
                <DetailSection
                  key={device.id}
                  icon={Icon}
                  title={device.device_name || "Unnamed device"}
                  action={<StatusBadge kind="device" status={device.status} />}
                  // The newest is the one being decided on; older ones fold away.
                  defaultOpen={index === 0 || device.status === "pending"}
                >
                  <div className="space-y-4">
                    {deviceStatusNote(device.status) && (
                      <InlineAlert tone={statusTone(device.status)}>{deviceStatusNote(device.status)}</InlineAlert>
                    )}

                    <DetailGrid
                      cols={3}
                      items={[
                        { label: "Kind", value: platformLabel(device.platform) },
                        {
                          label: "Tied to one device",
                          value: device.device_bound === true ? "Yes" : device.device_bound === false ? "No" : "N/A",
                          help: firstCard ? help("device_bound", { label: "being tied to one device" }) : undefined,
                        },
                        { label: "Registered", value: fmtDateTime(device.registered_at || device.created_at) },
                        { label: "Approved", value: device.approved_at ? fmtDateTime(device.approved_at) : "Not needed" },
                        { label: "Last used", value: device.last_used_at ? fmtDateTime(device.last_used_at) : "Not yet used" },
                        {
                          // Browser and address in one cell: a seventh cell
                          // would have left an orphan on the third row, and
                          // "which browser" and "which address" answer the same
                          // question — is this the laptop I think it is?
                          label: "Last seen from",
                          value: lastSeenFrom(device),
                          help: firstCard ? help("last_ip", { label: "where it was last seen" }) : undefined,
                        },
                      ]}
                    />

                    {device.revoke_reason && (
                      <DetailText label="Why it was shut off">{device.revoke_reason}</DetailText>
                    )}

                    {decisions.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        This device is shut off for good. It can’t be switched back on, and the same screen lock can’t be registered again.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {decisions.map(({ key, label, icon: ActionIcon, tone }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => start(key, device)}
                            disabled={busy?.id === device.id}
                            className={tone === "danger" ? DANGER_BTN : SECONDARY_BTN}
                          >
                            {busy?.id === device.id && busy?.key === key ? <Spinner /> : <ActionIcon className="w-4 h-4" />} {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </DetailSection>
              );
            })
          )}

          {/* Folded: it is the answer to "why is this blocked?", asked after
              the devices themselves have been read. */}
          <DetailSection title="Recent device activity" defaultOpen={false}>
            <DeviceActivityLog userId={person.id} limit={6} />
          </DetailSection>
        </div>
      </DetailDialog>

      {/* A sibling of the inspector, never a child — it has to sit above it. */}
      {asking && ask && (
        <ReasonDialog
          title={ask.title}
          description={ask.description}
          label="Reason"
          placeholder="What should the record say?"
          confirmLabel={ask.label}
          tone={ask.tone || "primary"}
          minLength={DEVICE_REASON_MIN}
          maxLength={DEVICE_REASON_MAX}
          busy={busy?.id === asking.device.id}
          error={actionError}
          onSubmit={(reason) => decide(asking.key, asking.device, reason)}
          onClose={() => { setAsking(null); setActionError(""); }}
        />
      )}
    </>
  );
}
