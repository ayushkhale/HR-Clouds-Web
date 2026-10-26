// ─────────────────────────────────────────────────────────────────────────────
// attendance/DailyLogDialog.jsx — one day of one person's attendance, as the
// house record-inspector (CLAUDE.md §3). Extracted from the employee-profile
// Attendance tab so the Live Attendance lists (HR's AttendanceDirectory and the
// manager's TeamDirectoryTable) open the SAME dialog in place rather than
// sending the reader off to the profile screen for a single day's breakdown.
//
// `employeeRole` + `viewer` pick the read family (see memberAttendance.js): a
// manager always reads through the hierarchy-scoped team endpoints whatever the
// member's role, HR reads the family that matches the member (employees /
// managers / hrs). Everything else — layout, wording, sections — is identical
// across all three callers (§2).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { HiCalendar, HiCheckCircle, HiClock, HiCollection, HiExclamationCircle, HiPause, HiViewList } from "react-icons/hi";
import { memberAttendanceApi } from "./memberAttendance";
import LiveEffectiveHours from "./LiveEffectiveHours";
import { unwrap } from "./normalize";
import ShiftPolicyPanel from "./ShiftPolicyPanel";
import { anomalyLabel, anomalyStatusKey, humanize, statusMeta } from "./enums";
import { fmtDate, fmtMinutes, fmtTime } from "./dates";
import { DayStatusNote, EmptyState, ErrorState, LoadingRows } from "./ui";
import { PunchesSection, PunchPhotoViewer } from "./PunchDetails";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable } from "../components/DetailDialog";

const minutesOrZero = (v) => (Number(v) > 0 ? fmtMinutes(v) : "0m");

export default function DailyLogDialog({ userId, date, employeeRole, viewer = "hr", onClose }) {
  const [state, setState] = useState({ log: null, loading: true, error: null });
  // The enlarged punch photo — a sibling of DetailDialog (§3).
  const [viewPunch, setViewPunch] = useState(null);

  const load = useCallback(() => {
    if (!userId || !date) return;
    setState({ log: null, loading: true, error: null });
    memberAttendanceApi(employeeRole, viewer)
      .dailyLog(userId, date)
      .then((res) => setState({ log: unwrap(res) || null, loading: false, error: null }))
      .catch((error) => setState({ log: null, loading: false, error }));
  }, [userId, date, employeeRole, viewer]);

  useEffect(() => { load(); }, [load]);

  const { log, loading, error } = state;
  const sessions = Array.isArray(log?.sessions) ? log.sessions : [];
  const breaks = Array.isArray(log?.breaks) ? log.breaks : [];
  const anomalies = Array.isArray(log?.anomalies) ? log.anomalies : [];
  // The raw punches, each now carrying its location and photo (§2 of the
  // contract). The daily-log reads aren't list endpoints, so they never
  // truncate — the photos are always resolved here.
  const logs = Array.isArray(log?.logs) ? log.logs : (Array.isArray(log?.punches) ? log.punches : []);

  return (
    <>
    <DetailDialog
      eyebrow="Daily log"
      icon={HiCalendar}
      title={fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      subtitle={log?.shift?.name ? `Shift · ${log.shift.name}` : undefined}
      badge={log && <DetailPill tone="onDark">{statusMeta("record", log.status).label}</DetailPill>}
      onClose={onClose}
    >
      {loading ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <div className="bg-white rounded-2xl border border-purple-100"><ErrorState error={error} onRetry={load} fallback="Couldn't load the daily log." /></div>
      ) : !log ? (
        <div className="bg-white rounded-2xl border border-purple-100"><EmptyState title="No data" message="Nothing was recorded for this day." /></div>
      ) : (
        <>
          <DetailStats
            items={[
              { label: "Clock in", value: fmtTime(log.clock_in_time), icon: HiClock },
              { label: "Clock out", value: fmtTime(log.clock_out_time), icon: HiClock },
              { label: "Effective hours", value: <LiveEffectiveHours record={log} className="text-purple-800" />, icon: HiCheckCircle },
              { label: "Break time", value: minutesOrZero(log.break_duration_minutes), icon: HiPause },
            ]}
          />

          {/* Why this status — only when derived or not yet settled (2026-10-04). */}
          <DayStatusNote record={log} className="mt-1" />

          <DetailSection title="Day breakdown" icon={HiViewList}>
            <DetailGrid
              cols={5}
              items={[
                { label: "Late by", value: minutesOrZero(log.late_minutes) },
                { label: "Overtime", value: minutesOrZero(log.overtime_minutes) },
                ["Left early by", minutesOrZero(log.early_exit_minutes)],
                ["Work mode", log.work_mode ? humanize(log.work_mode) : null],
                ["Corrected", log.is_regularized ? "Yes" : "No"],
              ]}
            />
          </DetailSection>

          {/* Every punch, with the photo taken at it and where it landed. Added
              2026-10-22 — the same section the employee sees for their own day,
              so a manager or HR reviewing a late mark or an out-of-bounds flag
              sees exactly what the employee does (§2). */}
          <PunchesSection logs={logs} onViewPhoto={setViewPunch} />

          {/* The shift AND the rules it was judged by. This used to be the
              shift alone, so a manager looking at a late mark or a half day had
              to leave for the policy screen to find out what the thresholds
              were — the approval dialog beside it has shown both since it was
              written. Same component now, so they can't drift (2026-10-21).
              Folded by default: it is the context behind the figures above, not
              the answer somebody opened the day for (§3). */}
          {(log.shift || log.shift_snapshot || log.policy || log.policy_snapshot) && (
            <DetailSection title="Shift & rules that applied" icon={HiClock} defaultOpen={false}>
              <ShiftPolicyPanel source={log} viewer="other" emptyNote="The rules this day was judged by weren’t recorded with it." />
            </DetailSection>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DetailSection title={`Sessions (${sessions.length})`} icon={HiCollection}>
              <DetailTable
                rows={sessions}
                empty="No work sessions recorded."
                columns={[
                  { header: "#", render: (_, i) => i + 1 },
                  { header: "Started", render: (s) => fmtTime(s.opened_at || s.start_time) },
                  { header: "Ended", render: (s) => (s.closed_at || s.end_time ? fmtTime(s.closed_at || s.end_time) : <span className="font-bold text-purple-600">Active</span>) },
                  { header: "Status", render: (s) => <DetailPill tone={s.status === "open" ? "solid" : "soft"}>{humanize(s.status) || "N/A"}</DetailPill> },
                ]}
              />
            </DetailSection>

            <DetailSection title={`Breaks (${breaks.length})`} icon={HiPause}>
              <DetailTable
                rows={breaks}
                empty="No breaks taken."
                columns={[
                  { header: "#", render: (_, i) => i + 1 },
                  { header: "Started", render: (b) => fmtTime(b.start_time) },
                  { header: "Ended", render: (b) => (b.end_time ? fmtTime(b.end_time) : <span className="font-bold text-purple-600">Ongoing</span>) },
                  { header: "Duration", align: "right", render: (b) => minutesOrZero(b.duration_minutes) },
                ]}
              />
            </DetailSection>
          </div>

          <DetailSection title={`Flags (${anomalies.length})`} icon={HiExclamationCircle}>
            {anomalies.length === 0 ? (
              <p className="flex items-center gap-2 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                <HiCheckCircle className="w-4 h-4" /> No flags for this day.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {anomalies.map((a, i) => (
                  <div key={a.id || i} className="bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-purple-900">{anomalyLabel(a)}</p>
                      <div className="flex gap-1.5 shrink-0">
                        {a.severity && <DetailPill tone="outline">{humanize(a.severity)}</DetailPill>}
                        <DetailPill tone={anomalyStatusKey(a) === "resolved" ? "muted" : "solid"}>{humanize(anomalyStatusKey(a))}</DetailPill>
                      </div>
                    </div>
                    {a.description && <p className="text-xs text-slate-600 mt-1">{a.description}</p>}
                    {a.resolution_notes && <p className="text-[11px] text-purple-600 mt-1">Resolution: {a.resolution_notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </>
      )}
    </DetailDialog>
    {viewPunch && <PunchPhotoViewer punch={viewPunch} onClose={() => setViewPunch(null)} />}
    </>
  );
}
