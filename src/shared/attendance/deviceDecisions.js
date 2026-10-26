// ─────────────────────────────────────────────────────────────────────────────
// attendance/deviceDecisions.js — the five decisions HR can take on somebody
// else's device (registry #9–#13), in one place.
//
// Two screens take them now: the approval queue (Employee Devices, which is
// also an HR Inbox panel) and the person inspector on Registered Devices. They
// have to offer the same buttons, ask for the same words and say the same thing
// afterwards, so the table lives here rather than in either of them.
//
// WHY `from` MATTERS MORE THAN IT LOOKS. Every transition is guarded
// server-side: the update matches `status IN (:from)` and answers 409
// DEVICE_INVALID_STATE_TRANSITION when it matches nothing. So a button is only
// ever rendered on a status it is legal from — never shown and then refused
// (CLAUDE.md §2). `revoked` is terminal and appears in no `from` list, which is
// why a revoked device has no actions at all.
//
// `reason` marks the three the server STORES a reason for. Approve and
// reinstate take no body, so asking for words there would be theatre.
// ─────────────────────────────────────────────────────────────────────────────

import { HiBan, HiCheck, HiPlay, HiTrash, HiX } from "react-icons/hi";
import { attendanceAPI } from "../api";

export const DEVICE_DECISIONS = {
  approve: {
    label: "Approve", icon: HiCheck, from: ["pending"], reason: false,
    title: "Approve this device?",
    description: "The employee will be able to clock in from it straight away.",
    done: "Device approved. The employee can clock in from it now.",
  },
  reject: {
    label: "Reject", icon: HiX, from: ["pending"], reason: true, tone: "danger",
    title: "Reject this device?",
    description: "It can never be registered again, and the employee will have to register a different one. They see the reason you write.",
    done: "Device rejected.",
  },
  suspend: {
    label: "Block for now", icon: HiBan, from: ["active"], reason: true, tone: "danger",
    title: "Block this device for now?",
    description: "Punches from it are refused until you switch it back on. Use this while you look into something.",
    done: "Device blocked. You can switch it back on at any time.",
  },
  reinstate: {
    label: "Switch back on", icon: HiPlay, from: ["suspended"], reason: false,
    title: "Switch this device back on?",
    description: "The employee will be able to clock in from it again.",
    done: "Device switched back on.",
  },
  revoke: {
    label: "Shut off", icon: HiTrash, from: ["pending", "active", "suspended"], reason: true, tone: "danger",
    title: "Shut this device off for good?",
    description: "This cannot be undone, and the same screen lock can never be registered again. Use it when somebody leaves or loses a device.",
    done: "Device shut off.",
  },
};

const CALLS = {
  approve: (id) => attendanceAPI.approveTrustedDevice(id),
  reject: (id, reason) => attendanceAPI.rejectTrustedDevice(id, { reason }),
  suspend: (id, reason) => attendanceAPI.suspendTrustedDevice(id, { reason }),
  reinstate: (id) => attendanceAPI.reinstateTrustedDevice(id),
  revoke: (id, reason) => attendanceAPI.revokeTrustedDeviceAsHR(id, { reason }),
};

/** The decisions that are legal on a device in this state, in HR's reading order. */
export const deviceDecisionsFor = (status) => Object.entries(DEVICE_DECISIONS)
  .filter(([, d]) => d.from.includes(String(status || "").toLowerCase()))
  .map(([key, d]) => ({ key, ...d }));

/** Take one. The caller owns the toast, the event and the reload. */
export const runDeviceDecision = (key, id, reason) => CALLS[key](id, reason);

/** "Couldn’t approve this device." — the fallback when the server says nothing. */
export const deviceDecisionFailure = (key) =>
  `Couldn’t ${(DEVICE_DECISIONS[key]?.label || "change").toLowerCase()} this device.`;
