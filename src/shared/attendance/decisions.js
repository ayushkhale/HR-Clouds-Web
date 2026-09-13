// ─────────────────────────────────────────────────────────────────────────────
// attendance/decisions.js — One definition per decision type used by every
// approval surface (per-type manager pages, Approvals Inbox, HR overrides).
// Keeps remarks rules, notices, success copy and refresh events consistent.
// ─────────────────────────────────────────────────────────────────────────────

import { attendanceAPI } from "../api";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "./events.js";
import { DICTIONARY } from "../config/dictionary";

const TERM = DICTIONARY.TERMS.COMP_OFF;
const APPROVE = { key: "approve", label: "Approve", tone: "emerald" };
const REJECT = { key: "reject", label: "Reject", tone: "rose", requireRemarks: true };

export const DECISION_TYPES = {
  regularization: {
    label: "Regularization",
    event: ATTENDANCE_EVENTS.REGULARIZATION,
    listKeys: ["requests", "regularizations"],
    fetch: () => attendanceAPI.getManagerPendingRegularizations(),
    actions: [REJECT, APPROVE],
    notice: "Approving replaces the punches for that date with the requested times and recalculates the day. Locked payroll dates can't be changed.",
    run: (action, id, remarks) =>
      action === "approve"
        ? attendanceAPI.approveManagerRegularization(id, { remarks })
        : attendanceAPI.rejectManagerRegularization(id, { remarks }),
    success: { approve: "Regularization approved — the day has been recalculated.", reject: "Regularization rejected." },
  },
  overtime: {
    label: "Overtime",
    event: ATTENDANCE_EVENTS.OVERTIME,
    listKeys: ["requests", "overtime"],
    fetch: () => attendanceAPI.getManagerPendingOvertime(),
    actions: [REJECT, APPROVE],
    notice: "Approved overtime is counted for payroll in that period.",
    run: (action, id, remarks) =>
      action === "approve"
        ? attendanceAPI.approveManagerOvertime(id, { remarks })
        : attendanceAPI.rejectManagerOvertime(id, { remarks }),
    success: { approve: "Overtime approved.", reject: "Overtime rejected." },
  },
  compoff: {
    label: TERM,
    event: ATTENDANCE_EVENTS.COMPOFF,
    listKeys: ["comp_offs", "compOffs", "requests"],
    fetch: () => attendanceAPI.getManagerCompOffs(),
    actions: [REJECT, APPROVE],
    notice: `Approving credits this ${TERM.toLowerCase()} to the employee's leave balance, where it can be used until it expires.`,
    run: (action, id, remarks) =>
      action === "approve"
        ? attendanceAPI.approveManagerCompOff(id, { remarks })
        : attendanceAPI.rejectManagerCompOff(id, { remarks }),
    // Reject writes status `cancelled` (contract §2 C11) — say where it went.
    success: { approve: `${TERM} approved and credited to the leave balance.`, reject: `${TERM} rejected — it's now listed under Rejected / cancelled.` },
  },
  anomaly: {
    label: "Attendance flag",
    event: ATTENDANCE_EVENTS.ANOMALY,
    listKeys: ["anomalies"],
    fetch: () => attendanceAPI.getManagerAnomalies(),
    actions: [{ key: "resolve", label: "Mark resolved", tone: "purple", requireRemarks: true }],
    notice: "Resolving records your explanation against the flag. It does not change the attendance record itself.",
    run: (_action, id, remarks) => attendanceAPI.resolveManagerAnomaly(id, { remarks }),
    success: { resolve: "Flag resolved." },
  },
};

/** Execute a decision and notify every subscriber (lists, badge, dashboards). */
export async function runDecision(type, action, id, remarks) {
  const cfg = DECISION_TYPES[type];
  if (!cfg) throw new Error(`Unknown decision type: ${type}`);
  await cfg.run(action, id, remarks);
  emitAttendanceChanged(cfg.event, { action, id });
  return cfg.success[action] || "Done.";
}
