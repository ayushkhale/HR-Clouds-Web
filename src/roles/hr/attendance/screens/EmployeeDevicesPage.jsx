// ─────────────────────────────────────────────────────────────────────────────
// EmployeeDevicesPage.jsx — every device anybody in the organisation may clock
// in from, and the five decisions HR can take on one (registry #8–#13).
//
// IT IS THE APPROVAL QUEUE AS WELL AS THE INVENTORY. With the policy set to
// "HR approves each device", a new device sits in `pending` and cannot punch
// until it is approved here — so the page opens on that tab when anything is
// waiting, and every decision emits ATTENDANCE_EVENTS.DEVICE so the sidebar
// badge and the inbox card clear without a reload (CLAUDE.md §7).
//
// ─── THE CONTRACT TRAPS ────────────────────────────────────────────────────
// · REVOKED IS TERMINAL. There is no reinstate from it, ever, and the same
//   screen lock can never be registered again. So "Switch back on" exists only
//   on a suspended device, and the revoked inspector says why it has no
//   actions instead of showing a button that 409s (§2).
// · EVERY TRANSITION IS GUARDED SERVER-SIDE. Two admins deciding the same
//   device at once gets the loser a 409 DEVICE_INVALID_STATE_TRANSITION. That
//   is not a failure to report in red — it means somebody else already dealt
//   with it, so we say that and refresh the row.
// · Reject, revoke and suspend REQUIRE a reason of 3–500 characters; approve
//   and reinstate take no body at all. Asking for words the server discards
//   would be theatre, so only the three that store it ask.
// · THE EMPLOYEE COLUMN IS CONDITIONAL. The list is sanitised server-side and
//   an older build may not carry `user_id` on the row. Rather than print an id
//   (§4) or an empty column, the column appears only when the response has
//   one — and the person filter is how HR narrows to somebody either way.
//
// ─── WHAT THIS PAGE IS NOT, SINCE 16 OCT 2026 ──────────────────────────────
// It is the QUEUE. "Who has a device and who hasn't" is Registered Devices
// (Setup › Organisation), which starts from the people directory — a list of
// devices can never show somebody who has none. The device-kind and
// tied-to-one-device dropdowns went with that change: nobody triages by
// platform, and the two columns still say both at a glance.
//
// The five decisions live in `shared/attendance/deviceDecisions.js` because
// the person inspector on that page takes the same five. One table, so the
// two screens can't word the same decision differently.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { HiDesktopComputer, HiDeviceMobile, HiRefresh } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailSection, DetailText, rowPreviewProps,
} from "../../../../shared/components/DetailDialog";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import { PersonSelect } from "../../../../shared/components/PersonPicker";
import { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { attendanceAPI } from "../../../../shared/api";
import { useEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";
import { DEVICE_STATUS_FILTERS } from "../../../../shared/attendance/enums.js";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../../../../shared/attendance/events";
import {
  DEVICE_REASON_MAX, DEVICE_REASON_MIN, deviceStatusNote, platformLabel,
} from "../../../../shared/attendance/deviceTrustMeta";
import {
  DEVICE_DECISIONS, deviceDecisionFailure, deviceDecisionsFor, runDeviceDecision,
} from "../../../../shared/attendance/deviceDecisions";
import {
  EmptyState, ErrorState, FilterTabs, InlineAlert, LoadingRows, Pagination,
  Spinner, StatusBadge, Toast, useToast,
} from "../../../../shared/attendance/ui";
import { DANGER_BTN, SECONDARY_BTN } from "../../../../shared/documents/ui";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";

const SURFACE = "attendance.employee_devices";
const help = (field, extra) => ({ surface: SURFACE, field, ...extra });

const statusTone = (status) => (status === "active" ? "emerald" : status === "revoked" ? "rose" : "amber");

const DeviceIcon = (platform) => (String(platform || "").toLowerCase() === "web" ? HiDesktopComputer : HiDeviceMobile);

export default function EmployeeDevicesPage() {
  const { toast, showToast, clearToast } = useToast();
  const { nameOf, options: people, loading: peopleLoading } = useEmployeeDirectory();

  const [status, setStatus] = useState("pending");
  const [person, setPerson] = useState("");

  const [selected, setSelected] = useState(null);
  const [asking, setAsking] = useState(null);   // { key, device } while a reason is being written
  // { id, key } of the ONE decision in flight — the device AND which button.
  // Keyed on the device alone, every button on that device spun at once; the
  // press has to name the button so only it shows the spinner (16 Oct 2026).
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");

  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getTrustedDevices({
      page, limit,
      ...(status ? { status } : {}),
      ...(person ? { user_id: person } : {}),
    }),
    { limit: 20, keys: ["items"], filterKey: `${status}|${person}` }
  );

  // The row in the open inspector has to be the row the list is showing, or an
  // approved device keeps offering Approve until the dialog is closed.
  useEffect(() => {
    if (!selected) return;
    const fresh = list.items.find((d) => d.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [list.items, selected]);

  const showEmployee = useMemo(() => list.items.some((d) => d.user_id), [list.items]);
  const filtered = !!person;

  async function decide(key, device, reason) {
    if (busy) return;
    setBusy({ id: device.id, key });
    setActionError("");
    try {
      await runDeviceDecision(key, device.id, reason);
      emitAttendanceChanged(ATTENDANCE_EVENTS.DEVICE, { entity: "trusted_device", action: key });
      setAsking(null);
      setSelected(null);
      showToast(DEVICE_DECISIONS[key].done);
      list.reload();
    } catch (err) {
      const message = attendanceErrorMessage(err, deviceDecisionFailure(key));
      setActionError(message);
      // Somebody else got there first — the row is stale, not the request wrong.
      if (err?.status === 409) { setAsking(null); list.reload(); }
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

  return (
    <>
      <DashboardTopBar title="Employee Devices" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="Employee Devices" help={help("page", { label: "the Employee Devices page" })} />
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Approve the devices people clock in from, and shut off ones they no longer use.
            </p>
          </div>
          <button
            type="button"
            onClick={list.reload}
            className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition"
          >
            <HiRefresh className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <FilterTabs options={DEVICE_STATUS_FILTERS} value={status} onChange={setStatus} />
              <div className="lg:ml-auto w-full sm:w-64">
                <PersonSelect
                  people={people}
                  value={person}
                  onChange={(id) => setPerson(id || "")}
                  clearLabel="Everyone"
                  loading={peopleLoading}
                  aria-label="Filter by employee"
                />
              </div>
            </div>
            {status === "pending" && list.total > 0 && (
              <p className="text-xs text-slate-500">
                {list.total} {list.total === 1 ? "device is" : "devices are"} waiting for you. Nobody can clock in from a device until it is approved.
              </p>
            )}
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} fallback="Couldn’t load devices." />
          ) : list.loading ? (
            <div className="p-6"><LoadingRows rows={5} /></div>
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={HiDeviceMobile}
              title={status === "pending" ? "Nothing waiting" : "No devices here"}
              message={status === "pending" && !filtered
                ? "Nothing needs your approval. Devices appear here as people register them."
                : filtered || status
                  ? "Try a different filter."
                  : "Devices appear here as people register them."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[820px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      {showEmployee && <th className="px-6 py-3.5">Employee</th>}
                      <th className="px-6 py-3.5">Device</th>
                      <th className="px-6 py-3.5">Kind</th>
                      <th className="px-6 py-3.5">
                        <HelpLabel text="State" help={help("status", { size: "sm", label: "what a device’s state means" })} />
                      </th>
                      <th className="px-6 py-3.5">
                        <HelpLabel text="Tied to one device" help={help("device_bound", { size: "sm", label: "being tied to one device" })} />
                      </th>
                      <th className="px-6 py-3.5">Last used</th>
                      <th className="px-6 py-3.5">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {list.items.map((device) => {
                      const Icon = DeviceIcon(device.platform);
                      return (
                        <tr key={device.id} {...rowPreviewProps(() => { setActionError(""); setSelected(device); }, "Device details")}>
                          {showEmployee && (
                            <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">{nameOf(device.user_id)}</td>
                          )}
                          <td className="px-6 py-4 font-semibold text-slate-800">
                            <span className="flex items-center gap-2 min-w-0">
                              <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="truncate">{device.device_name || "Unnamed device"}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500">{platformLabel(device.platform)}</td>
                          <td className="px-6 py-4"><StatusBadge kind="device" status={device.status} /></td>
                          <td className="px-6 py-4 text-slate-500">
                            {device.device_bound === true ? "Yes" : device.device_bound === false ? "No" : "N/A"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                            {device.last_used_at ? fmtDateTime(device.last_used_at) : "Not yet used"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                            {fmtDate(device.registered_at || device.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t border-slate-100">
                <Pagination
                  page={list.page}
                  totalPages={list.totalPages}
                  total={list.total}
                  limit={list.limit}
                  onPageChange={list.setPage}
                  noun="device"
                />
              </div>
            </>
          )}
        </div>
      </main>

      {selected && (
        <DetailDialog
          eyebrow="Attendance device"
          title={selected.device_name || "Unnamed device"}
          subtitle={selected.user_id ? nameOf(selected.user_id) : platformLabel(selected.platform)}
          icon={DeviceIcon(selected.platform)}
          badge={<StatusBadge kind="device" status={selected.status} />}
          width="medium"
          onClose={() => setSelected(null)}
          footer={deviceDecisionsFor(selected.status).length === 0 ? (
            <DetailFooterNote>
              This device is shut off for good. It can’t be switched back on, and the same screen lock can’t be registered again.
            </DetailFooterNote>
          ) : (
            deviceDecisionsFor(selected.status).map(({ key, label, icon: Icon, tone }) => (
              <button
                key={key}
                type="button"
                onClick={() => start(key, selected)}
                disabled={busy?.id === selected.id}
                className={tone === "danger" ? DANGER_BTN : SECONDARY_BTN}
              >
                {busy?.id === selected.id && busy?.key === key ? <Spinner /> : <Icon className="w-4 h-4" />} {label}
              </button>
            ))
          )}
        >
          <div className="space-y-4">
            {actionError && <InlineAlert tone="rose">{actionError}</InlineAlert>}
            {deviceStatusNote(selected.status) && (
              <InlineAlert tone={statusTone(selected.status)}>{deviceStatusNote(selected.status)}</InlineAlert>
            )}

            <DetailSection title="This device" collapsible={false}>
              <DetailGrid
                cols={3}
                items={[
                  { label: "Kind", value: platformLabel(selected.platform) },
                  {
                    label: "Tied to one device",
                    value: selected.device_bound === true ? "Yes" : selected.device_bound === false ? "No" : "N/A",
                    help: help("device_bound", { label: "being tied to one device" }),
                  },
                  { label: "Registered", value: fmtDateTime(selected.registered_at || selected.created_at) },
                  { label: "Approved", value: selected.approved_at ? fmtDateTime(selected.approved_at) : "Not needed" },
                  { label: "Last used", value: selected.last_used_at ? fmtDateTime(selected.last_used_at) : "Not yet used" },
                  {
                    label: "Last seen from",
                    value: selected.last_ip || "N/A",
                    help: help("last_ip", { label: "the last network address" }),
                  },
                ]}
              />
            </DetailSection>

            {selected.revoke_reason && (
              <DetailSection title="Why it was shut off" collapsible={false}>
                <DetailText>{selected.revoke_reason}</DetailText>
              </DetailSection>
            )}
          </div>
        </DetailDialog>
      )}

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

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
