// ─────────────────────────────────────────────────────────────────────────────
// setupChecklistMeta.js — Everything the setup checklist knows that the server
// doesn't: where each step actually lives in THIS app, and what each step is
// called in words an HR who has never run payroll can read.
//
// ─── WHY THERE IS A ROUTE MAP AT ALL ────────────────────────────────────────
// The integration guide says "rely entirely on the returned `action_url`" and
// "zero hardcoded logic". Following that would give twenty-two buttons that all
// 404. The server returns its own URL space and NOT ONE of the 22 resolves in
// this app:
//
//     server                                    here
//     /dashboard/organization/profile        →  /dashboard/hr/company
//     /dashboard/organization/hierarchy      →  /dashboard/hr/org-chart
//     /dashboard/organization/locations      →  /dashboard/hr/attendance/locations
//     /dashboard/organization/employees/invite → /dashboard/hr/invites
//     /dashboard/leave/types                 →  /dashboard/hr/leaves/types
//     /dashboard/attendance/shifts/assign    →  /dashboard/hr/attendance/roster
//     /dashboard/payroll/salary-components   →  /dashboard/hr/payroll/components
//     /dashboard/payroll/salary-templates    →  /dashboard/hr/payroll/templates
//     /dashboard/payroll/salary-assign       →  /dashboard/hr/payroll/employee-structures
//     /dashboard/payroll/bank-accounts       →  /dashboard/hr/payroll/bank-verification
//     /dashboard/documents/templates         →  /dashboard/hr/documents/letter-templates
//
// Every HR route in this app is under `/dashboard/hr/`, and the segment names
// differ besides (`leaves` not `leave`, `components` not `salary-components`).
// So `task_key` is the contract we honour and `action_url` is IGNORED. Recorded
// here per §9: live behaviour beats the spec, and the deviation is written down
// so nobody "corrects" it back into a page of broken links.
//
// A task_key we don't know gets NO BUTTON rather than a guess — §2, a control
// that can't work is absent, not broken. `task_settings_saved` is the standing
// example: there is no task module in the settings hub and no settings endpoint
// in tasks.api.js, so that step has no screen in this build and says so.
//
// ─── AND WHY THE COPY IS OURS ───────────────────────────────────────────────
// The server's own titles and descriptions are written for someone who works
// in payroll — "geofence anchors", "late mark grace periods", "accrual rules",
// "CTC breakdown templates", "bank advice payout sheets". §6 says write for
// someone who doesn't. So each step is relabelled here, keyed by `task_key`,
// and the server's text is the fallback for a step added after this file.
// Each line says the CONSEQUENCE of leaving it undone, because that is the
// whole reason the checklist exists.
//
// Contract: `md_organization/7_org_setup_checklist_api.md`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiCalendar,
  HiClipboardCheck,
  HiClock,
  HiCurrencyRupee,
  HiFolderOpen,
  HiOfficeBuilding,
} from "react-icons/hi";
import { humanize } from "../attendance/enums";

/** HR is the only workspace this exists in, so the prefix is a constant. */
const H = "/dashboard/hr";

/**
 * The full checklist page. HR-only, so it is one path and not a per-workspace
 * map like ORG_PATHS — the endpoint behind it is HR_ONLY, so mounting it under
 * another workspace's prefix would be a screen that 403s (§2).
 */
export const ORG_SETUP_PATH = `${H}/setup`;

/**
 * `task_key` → the route in THIS app, or `null` where there is no screen for
 * it yet. Null is deliberate and must stay null: a wrong destination is worse
 * than none, because the person believes they have done the step.
 */
export const TASK_ROUTES = Object.freeze({
  // ── Organisation ──
  org_profile_completed: `${H}/company`,
  department_created: `${H}/departments`,
  // Offices live under attendance because an office is a place a punch is
  // checked against — same page the sidebar calls "Office Locations".
  location_created: `${H}/attendance/locations`,
  employee_onboarded: `${H}/invites`,
  reporting_hierarchy_mapped: `${H}/org-chart`,

  // ── Time & attendance ──
  attendance_policy_created: `${H}/attendance/policies`,
  shift_template_created: `${H}/attendance/shifts`,
  // "Shift Management" in the sidebar: handing shifts out, not the templates.
  shift_assigned: `${H}/attendance/roster`,
  weekly_off_configured: `${H}/attendance/weekly-offs`,
  holiday_calendar_created: `${H}/attendance/holidays`,

  // ── Leave ──
  leave_type_created: `${H}/leaves/types`,
  leave_policy_created: `${H}/leaves/policies`,
  leave_policy_assigned: `${H}/leaves/assignments`,

  // ── Pay ──
  statutory_config_saved: `${H}/payroll/statutory`,
  salary_component_created: `${H}/payroll/components`,
  salary_structure_created: `${H}/payroll/templates`,
  salary_structure_assigned: `${H}/payroll/employee-structures`,
  // Where HR sees and checks the bank account on each person's record.
  employee_bank_account_added: `${H}/payroll/bank-verification`,
  payroll_settings_saved: `${H}/payroll/settings`,

  // ── Documents & letters ──
  document_type_created: `${H}/documents/types`,
  // The server calls this "Letter Template" and describes offer, appointment
  // and relieving letters — that is Letter Templates here, not the form library
  // at /documents/templates.
  document_template_created: `${H}/documents/letter-templates`,

  // ── Tasks ──
  // No screen: there is no `task` module in the settings hub (MODULE_TABS) and
  // tasks.api.js has no settings endpoint. Leave it null until one exists.
  task_settings_saved: null,
});

/**
 * House copy per step (§6). `title` is short enough to scan down a column;
 * `body` says what breaks while the step is undone.
 */
export const TASK_COPY = Object.freeze({
  org_profile_completed: {
    title: "Company details",
    body: "Your company’s name, address and tax numbers. They print on every payslip and letter you send out.",
  },
  department_created: {
    title: "A first department",
    body: "Departments are how people are grouped for approvals and reports. One is enough to begin.",
  },
  location_created: {
    title: "A first office",
    body: "Where people work from. A clock-in is checked against the office it belongs to, so there has to be one.",
  },
  employee_onboarded: {
    title: "A first team member",
    body: "Invite someone to join. Shifts, leave and salaries can’t be handed out until there is somebody to hand them to.",
  },
  reporting_hierarchy_mapped: {
    title: "Who reports to whom",
    body: "Without a reporting manager, a leave request or expense claim reaches nobody and waits for ever.",
  },

  attendance_policy_created: {
    title: "Attendance rules",
    body: "When somebody counts as late, and what makes a half day. Until this exists, no day is judged at all.",
  },
  shift_template_created: {
    title: "A work shift",
    body: "The hours a working day runs between. Time worked is measured against it.",
  },
  shift_assigned: {
    title: "Give people a shift",
    body: "Until somebody has a shift, their clock-ins can’t be turned into hours worked.",
  },
  weekly_off_configured: {
    title: "Weekly days off",
    body: "Which days of the week aren’t working days. Leave this and those days show up as absences.",
  },
  holiday_calendar_created: {
    title: "Company holidays",
    body: "Days the office is closed. They’re kept out of attendance and out of unpaid days.",
  },

  leave_type_created: {
    title: "Kinds of leave",
    body: "Casual, sick, earned — the kinds of leave your people can ask for.",
  },
  leave_policy_created: {
    title: "Leave rules",
    body: "How many days each kind of leave gives, and how much is kept for next year.",
  },
  leave_policy_assigned: {
    title: "Give people leave rules",
    body: "Nobody can request leave until a set of leave rules has been assigned to them.",
  },

  statutory_config_saved: {
    title: "PF, ESI and tax",
    body: "The deductions required by law. Without them a payroll run can’t work out what reaches the bank.",
  },
  salary_component_created: {
    title: "Salary building blocks",
    body: "The lines a salary is made of — basic, allowances and deductions.",
  },
  salary_structure_created: {
    title: "A salary template",
    body: "Those blocks combined into one full salary, ready to put on somebody.",
  },
  salary_structure_assigned: {
    title: "Put salaries on people",
    body: "Somebody with no salary on file is skipped by every payroll run, silently.",
  },
  employee_bank_account_added: {
    title: "Bank details",
    body: "Where the money goes. Without them the file your bank needs can’t be produced.",
  },
  payroll_settings_saved: {
    title: "Your pay cycle",
    body: "The dates each pay month runs between, and how a single day’s pay is worked out.",
  },

  document_type_created: {
    title: "Documents you collect",
    body: "What people are asked to upload — ID, qualifications, past payslips.",
  },
  document_template_created: {
    title: "Letter templates",
    body: "Offer, appointment and relieving letters, filled in from somebody’s own record.",
  },

  task_settings_saved: {
    title: "Task rules",
    body: "Attachment limits and overdue reminders for work handed out to your people.",
  },
});

/**
 * House copy per category, and its icon. Same words the sidebar uses for the
 * same areas, so the checklist reads as a map of the product rather than a
 * second vocabulary — and "Payroll & Statutory" becomes "Pay", because
 * "statutory" is a word §6 retired.
 */
export const CATEGORY_META = Object.freeze({
  organization: {
    title: "Your organisation",
    tab: "Organisation",
    body: "The company’s own record, its offices and departments, and who reports to whom.",
    icon: HiOfficeBuilding,
  },
  attendance: {
    title: "Time & attendance",
    tab: "Attendance",
    body: "Working days and hours, the shifts people work, and the rules applied to a day.",
    icon: HiClock,
  },
  leave: {
    title: "Leave",
    tab: "Leave",
    body: "The kinds of leave people can take, how much they get, and who has been given them.",
    icon: HiCalendar,
  },
  payroll: {
    title: "Pay",
    tab: "Pay",
    body: "What a salary is made of, the deductions required by law, and where the money goes.",
    icon: HiCurrencyRupee,
  },
  document: {
    title: "Documents & letters",
    tab: "Documents",
    body: "What you collect from your people, and what you issue to them.",
    icon: HiFolderOpen,
  },
  task: {
    title: "Tasks",
    tab: "Tasks",
    body: "Rules for work you hand out, and reminders for work that runs late.",
    icon: HiClipboardCheck,
  },
});

const asBool = (value) => value === true || value === "true" || value === 1;

/**
 * 0–100, never NaN, never past the ends. The server sends a weighted figure
 * that need not equal completed/total, so it is RENDERED and not recomputed —
 * derived from the counts only when the key is missing altogether.
 */
function readinessOf(data, done, total) {
  const raw = data?.readiness_percentage;
  const pct = Number.isFinite(Number(raw)) && raw !== null && raw !== ""
    ? Number(raw)
    : total > 0 ? (done / total) * 100 : 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * One task, with our copy over the server's and its real destination resolved.
 * A step we have never heard of still renders: the server's own words, no
 * button, and it still counts towards the totals.
 */
function normalizeTask(raw, index) {
  const key = typeof raw?.task_key === "string" ? raw.task_key : "";
  const copy = TASK_COPY[key];
  // `key in` rather than a truthiness test: a known step whose route is
  // deliberately null must not fall through to "we've never heard of this".
  const known = key in TASK_ROUTES;
  return {
    key: key || `task-${index}`,
    // Never the raw key on screen (§4) — humanize() is the house prettifier.
    title: copy?.title || raw?.title || humanize(key) || "Setup step",
    body: copy?.body || raw?.description || "",
    isCore: asBool(raw?.is_core),
    isDone: asBool(raw?.is_completed),
    // Only when it is actually done: a stray timestamp on a pending step would
    // otherwise print "Done" under a clock icon.
    doneAt: asBool(raw?.is_completed) && raw?.completed_at ? raw.completed_at : null,
    route: known ? TASK_ROUTES[key] : null,
    known,
    order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : Number.MAX_SAFE_INTEGER,
    index,
  };
}

/** `order` first, then the order the server listed them in — never unstable. */
const byOrder = (a, b) => (a.order - b.order) || (a.index - b.index);

/**
 * The whole payload, flattened into exactly what the two surfaces render.
 * Returns `null` for a body that carries no categories at all, so a failed or
 * empty read can never be mistaken for "nothing left to set up" (§7).
 */
export function normalizeChecklist(payload) {
  const data = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : payload;
  if (!data || typeof data !== "object") return null;
  const rawCategories = Array.isArray(data.categories) ? data.categories : null;
  if (!rawCategories) return null;

  const categories = rawCategories
    .map((cat, catIndex) => {
      const key = typeof cat?.category_key === "string" ? cat.category_key : "";
      const meta = CATEGORY_META[key];
      const tasks = (Array.isArray(cat?.tasks) ? cat.tasks : [])
        .map(normalizeTask)
        .sort(byOrder);
      return {
        key: key || `category-${catIndex}`,
        title: meta?.title || cat?.category_title || humanize(key) || "Setup",
        // The tab bar splits one row six ways, so it gets a shorter name than
        // the panel heading: "Your organisation" and "Time & attendance" both
        // ran out of room and ellipsised, and a tab you cannot read is not a
        // map. The panel below still carries the full title.
        tab: meta?.tab || meta?.title || cat?.category_title || humanize(key) || "Setup",
        body: meta?.body || cat?.category_description || "",
        icon: meta?.icon || HiClipboardCheck,
        tasks,
        // Counted from the rows we actually drew, not from the server's own
        // `completed_tasks` — the two disagreeing would show a card reading
        // "3 of 5" above four ticks.
        done: tasks.filter((t) => t.isDone).length,
        total: tasks.length,
        order: tasks.length ? tasks[0].order : Number.MAX_SAFE_INTEGER,
        index: catIndex,
      };
    })
    // A category with nothing in it is an empty accordion — noise, not data.
    .filter((cat) => cat.total > 0)
    .sort(byOrder);

  const tasks = categories.flatMap((cat) => cat.tasks).sort(byOrder);
  // Categories present but not one task between them is the same nothing as a
  // response with no categories at all, so it gets the same answer. Returning
  // a 0-of-0 checklist instead would put the page on "Nothing done yet — work
  // through the steps above" with no steps above it, and would divide by zero
  // in each category's percentage.
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.isDone).length;
  const total = tasks.length;
  const core = tasks.filter((t) => t.isCore);
  const coreDone = core.filter((t) => t.isDone).length;
  const summary = data.summary && typeof data.summary === "object" ? data.summary : {};

  return {
    readiness: readinessOf(data, done, total),
    total,
    done,
    pending: total - done,
    coreTotal: core.length,
    coreDone,
    corePending: core.length - coreDone,
    // Trust the server's own verdicts where it gives them — they are what the
    // backend's "at least 1" engine decided — and fall back to the counts.
    isOperational: summary.is_operational != null
      ? asBool(summary.is_operational)
      : core.length > 0 && coreDone === core.length,
    isFullySetup: summary.is_fully_setup != null
      ? asBool(summary.is_fully_setup)
      : total > 0 && done === total,
    categories,
    tasks,
  };
}

/**
 * The one step to put in front of the person next: the earliest pending
 * must-do, then the earliest pending anything.
 *
 * Both passes skip steps with no screen — a card whose only button goes
 * nowhere is worse than one that offers the next step it CAN open, and the
 * skipped step is still listed on the full page with its own explanation.
 * `null` means every remaining step is unreachable from here, and the card
 * then points at the full list instead of showing a dead button (§11).
 */
export function nextStep(checklist) {
  const open = (checklist?.tasks || []).filter((t) => !t.isDone && t.route);
  return open.find((t) => t.isCore) || open[0] || null;
}
