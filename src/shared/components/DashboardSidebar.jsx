import React, { useState, useEffect } from "react";

import { DICTIONARY } from "../config/dictionary";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { billingAPI } from "../api";
import OrgSwitcher from "./OrgSwitcher";
import { useDeviceTrustContext } from "../attendance/deviceTrust";
import { deviceTrustVisible } from "../attendance/deviceTrustMeta";
import { MY_DOCUMENT_PATHS, MY_PAY_PATHS, ORG_PATHS, SELF_SERVICE_BASE, TASK_PATHS } from "../attendance/paths";
import { useBadgeCounts } from "../hooks/useBadgeCounts";
import {
  HiTemplate,
  HiChatAlt2,
  HiCalendar,
  HiUserGroup,
  HiClock,
  HiOfficeBuilding,
  HiMail,
  HiClipboardList,
  HiChevronDown,
  HiChevronRight,
  HiViewGrid,
  HiQuestionMarkCircle,
  HiCog,
  HiExclamationCircle,
  HiGift,
  HiLocationMarker,
  HiLockClosed,
  HiDocumentReport,
  HiX,
  HiInboxIn,
  HiLightningBolt,
  HiCurrencyRupee,
  HiAdjustments,
  HiPlay,
  HiShieldCheck,
  HiDatabase,
  HiReceiptRefund,
  HiCreditCard,
  HiReceiptTax,
  HiHeart,
  HiScale,
  HiChartBar,
  HiCash,
  HiLogout,
  HiSwitchHorizontal,
  HiDocumentText,
  HiUserCircle,
  HiCloudDownload,
  HiFolderOpen,
  HiBadgeCheck,
  HiClipboardCheck,
  HiDocumentSearch,
  HiCollection,
  HiPaperAirplane,
  HiShare,
  HiLibrary,
  HiDeviceMobile,
  HiOutlineCalendar,
} from "react-icons/hi";

function DashboardSidebar({ role = "guest" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, orgId, organizations } = useAuth();
  const { isMobileSidebarOpen, closeSidebar, setNav } = useSidebar();
  // One read behind all three badges below (#278), polled once for the whole
  // app and refreshed by every decision. The HR sidebar used to fire thirteen
  // count requests of its own on mount, which is why it could only afford to
  // do it once a minute and drifted from the page it linked to.
  const { counts: queueCounts, sidebar: badges, isUnavailable } = useBadgeCounts({ enabled: role === "hr" || role === "manager" });
  const inboxCount = badges.inboxTotal;
  // `null` is "couldn't read it", and an unavailable queue is hidden outright
  // rather than shown as a confident 0 (§2).
  const unverifiedBankCount = isUnavailable("bank_verification") ? null : badges.unverifiedBanks;
  const pendingDocsCount = isUnavailable("document_verification") ? null : badges.documentVerificationQueue;

  // Device Trust (15 Oct 2026): "My Registered Devices" only exists where the
  // feature is on, or where this person already has a device to shut off — an
  // organisation that never switched it on sees no trace of it (§7). Guests are
  // outside the organisation, so nothing is read for them.
  const { ctx: deviceCtx } = useDeviceTrustContext({ enabled: role !== "guest" });
  const showMyDevices = deviceTrustVisible(deviceCtx);
  // An older server has no device-trust endpoints at all — its context read
  // 404s, and HR's two screens would have nothing to show but an error. The
  // feature merely being OFF is different: switching it on is what Device
  // Checks is for, so those links stay.
  const showDeviceAdmin = deviceCtx?.absent !== true;

  const [paymentsDue, setPaymentsDue] = useState(false);
  const [paymentsDismissed, setPaymentsDismissed] = useState(false);

  useEffect(() => {
    if (location.pathname === "/dashboard/hr/billing/payments") {
      setPaymentsDismissed(true);
    }
  }, [location.pathname]);

  // Not a count, and nothing else reads it: how close the subscription is to
  // its due date, which puts a dot on Billing.
  useEffect(() => {
    if (role !== "hr") return undefined;
    let alive = true;
    billingAPI.getSubscription().then((res) => {
      if (!alive) return;
      const sub = res?.data?.subscription;
      if (!sub) return;
      const days = sub.days_remaining != null ? Number(sub.days_remaining) : null;
      const isDue = (days !== null && days <= 7) || sub.status === "in_grace" || sub.status === "past_due";
      setPaymentsDue(Boolean(isDue));
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [role]);

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  // ── Building blocks ──────────────────────────────────────────────────────
  // `nested`: also active on child routes (an employee profile, a payroll run).
  const link = (label, path, icon, extra = {}) => {
    // A `?tab=` link (the device sub-tabs) shares its pathname with its sibling,
    // so matching on pathname alone would light both. Match the full path, and
    // treat the default tab as active on the bare path so landing with no query
    // still highlights it (mirrors the page's own default tab).
    const { defaultTab, ...rest } = extra;
    const q = path.indexOf("?");
    const active = q === -1
      ? location.pathname === path || (!!rest.nested && location.pathname.startsWith(`${path}/`))
      : location.pathname + location.search === path
        || (location.pathname === path.slice(0, q) && !location.search && !!defaultTab);
    return { label, path, icon, ...rest, active };
  };
  // A numbered step inside a workflow section. Payroll uses steps rather than
  // dropdowns on purpose: it is monthly work, and hiding it behind another
  // click would make the most-used part of the menu the slowest to reach.
  const step = (number, text) => ({ heading: text, step: number });
  // A third-level dropdown (Setup → Time, Me → My Pay). For areas that are set
  // up once or visited now and then, where grouping beats a long flat list.
  const group = (label, icon, items) => ({ group: label, icon, items });
  const COMP_OFF = DICTIONARY.TERMS.COMP_OFF;
  const REGULARIZATION = DICTIONARY.TERMS.REGULARIZATION;
  const ENCASHMENT = DICTIONARY.TERMS.ENCASHMENT;
  const inboxBadge = { badge: inboxCount > 0 ? inboxCount : null };
  /**
   * The number waiting in one queue, on the link that opens it — the same
   * figure its Inbox card and its own page header show, from the same read
   * (#278). Three badges used to carry this and the other nine queues were
   * silent, so a claim could sit for a day with nothing on the menu to say so
   * unless you opened the Inbox.
   *
   * Nothing is ever a 0: a quiet queue wears no badge, and one this role or
   * this organisation does not have is absent from the snapshot and wears
   * nothing either (§2 — absent, not broken).
   */
  const queueBadge = (key) => {
    if (isUnavailable(key)) return {};
    const n = Number(queueCounts[key]);
    return n > 0 ? { badge: n } : {};
  };

  // Notifications has no sidebar entry (user decision, 2026-10-26): the bell in
  // the top bar is the only way in, and its panel's "See all notifications"
  // link reaches the full page. A menu tab beside it was a second door to the
  // same place.

  // Self-service pages mount in every workspace under that workspace's prefix,
  // and every one of them starts with "My": that word is what tells an HR user
  // they are looking at their own leave rather than the organisation's. The
  // employee sidebar is exactly these three groups, so what a person sees
  // about themselves reads the same in every role. Blank Forms is left out on
  // purpose — a form belongs to nobody — and lives on My Document Home.
  const selfService = (workspace) => {
    const base = SELF_SERVICE_BASE[workspace];
    const pay = MY_PAY_PATHS[workspace];
    const docs = MY_DOCUMENT_PATHS[workspace];
    const tasks = TASK_PATHS[workspace];
    return {
      // Where a person registers the device they clock in from — its own
      // "My Registered Devices" dropdown (not inside My Time), holding the two
      // entries This device / All my devices (user decision, 16 Oct 2026).
      // THESE TWO ENTRIES ARE THE NAVIGATION: the page dropped its own tab
      // strip on 22 Oct 2026 and reads `?tab=` straight from these links, so a
      // screen is reached once, from here, and not twice. It still defaults to
      // This device, so a locked-out person lands on the one that matters even
      // if they click the group rather than an entry.
      devices: `${base}/devices`,
      // Work somebody has been GIVEN, which every role is — including HR, whose
      // own page sits here beside their leave and payslips rather than in the
      // organisation-wide Tasks section below.
      //
      // TWO entries, so this behaves like every other "My …" group instead of
      // the one flat link in the menu (user decision, 14 Oct 2026 — a single
      // item renders as a bold link, not a dropdown). They are the two pages
      // the API can actually give a person about their own work: the whole list,
      // and the one cut the page's own status tabs can't make, `is_overdue`.
      // Statuses deliberately did NOT become sidebar entries: the page already
      // has a tab per status, and duplicating them here would leave the sidebar
      // highlighting "Waiting for review" while the open tab said "All".
      tasks: [
        link("My Tasks", tasks.mine, HiClipboardCheck),
        link("Overdue Tasks", tasks.overdue, HiExclamationCircle),
      ],
      time: [
        link("My Attendance", base, HiClock),
        // Where this person may clock in from — their office and any client
        // sites. Read-only; the assign controls are HR/manager-only, so an
        // employee reaches it here too (16 Oct 2026). One entry covers all three
        // workspaces because the employee menu reuses this same `time` array.
        // The hours they're expected to work and the rules their attendance is
        // graded by. Sits directly under My Attendance because it is the answer
        // to every "why was I marked late / absent" that page raises
        // (21 Oct 2026). Read-only; the policy and shift editors are HR-only,
        // so one entry serves all three workspaces.
        link("My Schedule & Rules", `${base}/my-schedule`, HiOutlineCalendar),
        link("My Work Locations", `${base}/my-locations`, HiLocationMarker),
        // Who has asked where this person is, and the notice they accept once
        // (23 Oct 2026). Beside My Work Locations because it answers the same
        // question in the present tense. One entry for all three workspaces:
        // an HR admin can be located by another HR admin, so everybody needs it.
        link("My Location Checks", `${base}/location-checks`, HiShieldCheck),
        link("My Leaves", pay.leaves, HiCalendar),
        link(`My ${REGULARIZATION}s`, `${base}/regularizations`, HiClipboardList),
        link("My Overtime", `${base}/overtime`, HiLightningBolt),
        link("My Flags", `${base}/anomalies`, HiExclamationCircle),
        link(`My ${COMP_OFF}`, `${base}/comp-offs`, HiGift),
      ],
      pay: [
        link("My Salary & Bank", pay.salary, HiCurrencyRupee),
        link("My Payslips", pay.payslips, HiDocumentReport),
        link("My Claims & Benefits", pay.claims, HiReceiptRefund),
        link("My Loans & Variable Pay", pay.loans, HiAdjustments),
        link("My Tax & Investments", pay.tax, HiScale),
      ],
      documents: [
        link("My Document Home", docs.all, HiCollection),
        link("My Personal Documents", docs.documents, HiFolderOpen),
        link("My Company Documents", docs.company, HiOfficeBuilding),
        link("My Document Requests", docs.requests, HiClipboardList),
      ],
    };
  };
  const meSection = (workspace) => {
    const me = selfService(workspace);
    return {
      title: "ME",
      icon: HiUserCircle,
      defaultCollapsed: true,
      items: [
        group("My Time", HiClock, me.time),
        group("My Tasks", HiClipboardCheck, me.tasks),
        group("My Pay", HiCurrencyRupee, me.pay),
        group("My Documents", HiFolderOpen, me.documents),
        ...(showMyDevices ? [group("My Registered Devices", HiDeviceMobile, [
          link("This device", `${me.devices}?tab=this`, HiDeviceMobile, { defaultTab: true }),
          link("All my devices", `${me.devices}?tab=all`, HiCollection),
        ])] : []),
      ],
    };
  };

  // The organisation itself — who reports to whom, and the company's own
  // details. Every role reads the same two pages (the endpoints return the
  // whole org to all of them), so the section is identical in each workspace
  // and sits in the same place: last before Me, after the work sections.
  // Billing is the one entry in here that is NOT in every workspace, and not
  // by choice: every billing endpoint but the plan catalogue is gated HR_ONLY
  // and refuses platform admins too, so a manager has no billing page rather
  // than a broken one (§2 — a capability a role lacks is absent, not broken).
  // Work this person HANDS OUT and reviews (Task module #255–#267). One helper
  // for both reviewing workspaces, so the two entries can't drift apart: a
  // manager and HR see the same labels in the same order, and only the reach of
  // the data behind them differs (§2). An employee has no such section at all —
  // they review nobody.
  const tasksSection = (workspace) => ({
    title: "TASKS",
    icon: HiClipboardCheck,
    items: [
      link("Tasks I Assigned", TASK_PATHS[workspace].assigned, HiPaperAirplane),
      link("All Tasks", TASK_PATHS[workspace].all, HiClipboardList),
    ],
  });

  const companySection = (workspace) => ({
    title: "COMPANY",
    icon: HiLibrary,
    items: [
      link("Org Chart", ORG_PATHS[workspace].chart, HiShare),
      link("Company Profile", ORG_PATHS[workspace].company, HiLibrary),
      // Company Settings used to be a third entry here. It is now the gear in
      // the utility dock at the bottom of the sidebar, where a settings hub
      // belongs and where it is reachable with the COMPANY section collapsed —
      // which it is, most of the time. Two entry points to one hub meant the
      // one people found depended on which they happened to open.
      ...(workspace === "hr" ? [
        link("Plan & Billing", "/dashboard/hr/billing", HiCreditCard),
        link("Payments & Invoices", "/dashboard/hr/billing/payments", HiReceiptTax, {
          dot: paymentsDue && !paymentsDismissed,
          onClick: () => setPaymentsDismissed(true),
        }),
      ] : []),
    ],
  });

  // ── The three menus ──────────────────────────────────────────────────────
  // One shape for every role, so a manager promoted to HR gains menu items
  // rather than learning a new menu. Sections run in the same order in every
  // workspace — Main, ME, then the work: Setup, People/Organisation,
  // Time & Leave, Tasks, Payroll, the two document groups, Tax, Insights,
  // Company — and a role simply has fewer of them. Inside a section, items run
  // in the order the work is done, not alphabetically: the first item is the
  // thing you have to do first.
  //
  // ME SITS SECOND, directly under Dashboard and Inbox (user decision,
  // 14 Oct 2026). It used to be last, which put an HR admin's own payslip at
  // the bottom of the longest menu in the product. It is the one section every
  // role has and the one every role opens for themselves, so it goes where it
  // can be reached without scrolling — in all three workspaces, or the
  // promotion from manager to HR would move it (§2). It keeps
  // `defaultCollapsed`: expanded, its four groups would push the work
  // sections off the screen, which is the problem it was moved to solve.
  const getNavSections = () => {
    if (role === "guest") {
      return [
        {
          title: "MENU",
          icon: HiTemplate,
          items: [
            { label: "Dashboard", path: "/dashboard/guest", icon: HiTemplate, active: location.pathname === "/dashboard/guest" },
            { label: "Register Org", path: "/register-organization", icon: HiOfficeBuilding, active: location.pathname === "/register-organization" },
          ],
        },
        {
          title: "HELP & SUPPORT",
          icon: HiChatAlt2,
          items: [
            { label: "Check Invites", path: "/dashboard/guest", icon: HiMail },
            { label: "Support", path: "mailto:support@hrclouds.in", icon: HiChatAlt2, external: true },
          ],
        },
      ];
    }

    if (role === "hr") {
      const H = "/dashboard/hr";
      return [
        {
          title: "MAIN",
          flat: true,
          items: [
            link("Dashboard", H, HiViewGrid),
            link("Inbox", `${H}/inbox`, HiInboxIn, inboxBadge),
          ],
        },
        meSection("hr"),
        {
          // Done once, then rarely touched — so it stays collapsed, and each
          // area is its own dropdown listed in the order it has to be set up.
          title: "SETUP",
          icon: HiCog,
          defaultCollapsed: true,
          items: [
            // The index of this whole section: which of the 22 steps below are
            // done and which aren't. First, and not inside a group, because it
            // is what you read before you decide which group to open.
            link("Organisation setup", `${H}/setup`, HiClipboardCheck),
            // Departments first: they exist before anyone is invited into one.
            group("Organisation", HiOfficeBuilding, [
              link("Departments", `${H}/departments`, HiOfficeBuilding, { nested: true }),
              link("Office Locations", `${H}/attendance/locations`, HiLocationMarker),
              // Client sites sit beside offices: both are places a punch can be
              // checked against, and setting one up is the same kind of job.
              link("Client Sites", `${H}/attendance/field-locations`, HiLocationMarker),
              // Who may clock in from what. It belongs with the places a punch is
              // checked against rather than in Time, because it is about the
              // organisation's people and their devices, not about hours
              // (user decision, 16 Oct 2026 — it was "Device Checks" under Time).
              ...(showDeviceAdmin ? [link("Registered Devices", `${H}/attendance/registered-devices`, HiDeviceMobile)] : []),
              // Whether anyone may ask a colleague's phone where it is, and on
              // what terms (23 Oct 2026). Here rather than under Time for the
              // same reason as Registered Devices — it is a decision about
              // people and their phones, not about hours.
              link("Live Location Checks", `${H}/attendance/live-location`, HiShieldCheck),
            ]),
            // Which days are working days, then the hours on them and who works
            // them, then the rules applied to those hours, then what working an
            // off day earns. Shift Management (who works which shift) sits right
            // after Work Shifts: handing shifts out is setup, not a daily queue.
            group("Time", HiClock, [
              link("Weekly Offs", `${H}/attendance/weekly-offs`, HiTemplate),
              link("Holidays", `${H}/attendance/holidays`, HiCalendar),
              link("Work Shifts", `${H}/attendance/shifts`, HiClock),
              link("Shift Management", `${H}/attendance/roster`, HiUserGroup),
              link("Attendance Policies", `${H}/attendance/policies`, HiClipboardList),
              link(`${COMP_OFF} Policies`, `${H}/attendance/comp-off-policies`, HiGift),
            ]),
            group("Leave", HiCalendar, [
              link("Leave Types", `${H}/leaves/types`, HiClipboardList),
              link("Leave Policies", `${H}/leaves/policies`, HiTemplate),
              link("Leave Assignment", `${H}/leaves/assignments`, HiClipboardCheck),
              link("Leave Automation", `${H}/leaves/automation`, HiLightningBolt),
            ]),
            // Components are the building blocks, templates assemble them, and
            // statutory rates (PF/ESI/PT/TDS) are configuration like the rest.
            group("Pay", HiCurrencyRupee, [
              link("Salary Components", `${H}/payroll/components`, HiTemplate),
              link("Structure Templates", `${H}/payroll/templates`, HiDocumentReport),
              link("Tax & Legal Deductions", `${H}/payroll/statutory`, HiScale),
              link("Benefit Plans", `${H}/payroll/benefits`, HiHeart),
              link("Payroll Settings", `${H}/payroll/settings`, HiCog),
              link("Payroll Automation", `${H}/payroll/automation`, HiLightningBolt),
            ]),
            group("Documents", HiFolderOpen, [
              link("Document Types", `${H}/documents/types`, HiTemplate),
              link("Form Templates", `${H}/documents/templates`, HiCollection),
              link("Document Settings", `${H}/documents/settings`, HiCog),
              link("Document Automation", `${H}/documents/automation`, HiLightningBolt),
            ]),
            // Letterhead first: a letter without one looks unfinished.
            group("Letters", HiMail, [
              link("Letterhead & Branding", `${H}/documents/letterhead`, HiBadgeCheck),
              link("Letter Templates", `${H}/documents/letter-templates`, HiMail),
            ]),
          ],
        },
        {
          title: "PEOPLE",
          icon: HiUserGroup,
          items: [
            link("Invites", `${H}/invites`, HiMail),
            link(DICTIONARY.NAV.EMPLOYEES, `${H}/employees`, HiUserGroup, { nested: true }),
          ],
        },
        {
          title: "TIME & LEAVE",
          icon: HiClock,
          items: [
            link("Live Attendance", `${H}/attendance/directory`, HiClock),
            link("Leave Requests", `${H}/leaves/requests`, HiInboxIn, queueBadge("leaves")),
            link(`${REGULARIZATION}s`, `${H}/attendance/regularizations`, HiClipboardList, queueBadge("regularizations")),
            link(COMP_OFF, `${H}/attendance/comp-offs`, HiGift, queueBadge("compOffs")),
            // A queue only where the policy says HR approves each device; the
            // page is also the whole-organisation device inventory.
            ...(showDeviceAdmin ? [link("Employee Devices", `${H}/attendance/trusted-devices`, HiDeviceMobile, queueBadge("devices"))] : []),
          ],
        },
        tasksSection("hr"),
        {
          // The monthly cycle, in order. Lock Attendance sits right before the
          // run because that is when it happens; Employee Salaries and bank
          // details come first because nobody can be paid without them.
          title: "PAYROLL",
          icon: HiCurrencyRupee,
          items: [
            step(1, "Before the month"),
            link("Employee Salaries", `${H}/payroll/employee-structures`, HiCurrencyRupee),
            link("Bank Verification", `${H}/payroll/bank-verification`, HiShieldCheck, {
              badge: unverifiedBankCount > 0 ? unverifiedBankCount : null,
              dot: unverifiedBankCount > 0,
            }),
            step(2, "This month"),
            link("Salary Adjustments", `${H}/payroll/adjustments`, HiAdjustments),
            link("Bonus Rules", `${H}/payroll/bonus-rules`, HiGift),
            link("Claims", `${H}/payroll/reimbursements`, HiReceiptRefund, queueBadge("claims")),
            link("Loans & Advances", `${H}/payroll/loans`, HiCash, queueBadge("loans")),
            link(`${ENCASHMENT}s`, `${H}/payroll/encashments`, HiCash),
            link("Pay Differences", `${H}/payroll/arrears`, HiSwitchHorizontal),
            link("Exits & Final Pay", `${H}/payroll/exits`, HiLogout),
            step(3, "Close and pay"),
            link("Lock Attendance", `${H}/attendance/lock-periods`, HiLockClosed),
            link("Payroll Runs", `${H}/payroll/runs`, HiPlay, { nested: true }),
            link("Payslips & Documents", `${H}/payroll/payslips`, HiDocumentText),
            // Beside the documents it previews, and before a run rather than
            // after: the point is to catch a wrong letterhead while it still
            // costs nothing to fix.
            link("Document Previews", `${H}/payroll/document-previews`, HiDocumentText),
          ],
        },
        {
          // What the organisation collects from its people: ask, check what
          // came in, the vault itself, who is still missing something, search.
          title: "DOCUMENTS WE COLLECT",
          icon: HiFolderOpen,
          items: [
            link("Document Requests", `${H}/documents/requests`, HiClipboardList),
            link("Verification Queue", `${H}/documents/verification`, HiBadgeCheck, {
              badge: pendingDocsCount > 0 ? pendingDocsCount : null,
              dot: pendingDocsCount > 0,
            }),
            link("Employee Documents", `${H}/documents/employees`, HiFolderOpen),
            link("Document Compliance", `${H}/documents/compliance`, HiClipboardCheck),
            link("Find a Document", `${H}/documents/search`, HiDocumentSearch),
          ],
        },
        {
          // What it issues to them. Setting a letter up lives in Setup; issuing
          // one is daily work, so the register lives here.
          title: "DOCUMENTS WE ISSUE",
          icon: HiPaperAirplane,
          items: [
            link("Issued Letters", `${H}/documents/letters`, HiPaperAirplane),
            link("Letter Proposals", `${H}/documents/letter-proposals`, HiMail, queueBadge("letterProposals")),
            link("Organisation Documents", `${H}/documents/organisation`, HiOfficeBuilding),
          ],
        },
        {
          title: "TAX",
          icon: HiScale,
          items: [
            link("Tax Declarations", `${H}/payroll/tax-declarations`, HiDocumentText, queueBadge("declarations")),
            link("Year-End & Form 16", `${H}/payroll/year-end`, HiDocumentReport),
          ],
        },
        {
          title: "INSIGHTS",
          icon: HiChartBar,
          items: [
            link("Attendance Reports", `${H}/reports`, HiChartBar),
            link("Payroll Reports", `${H}/payroll/reports`, HiDocumentReport),
            link("Document Reports", `${H}/documents/reports`, HiChartBar),
            link("Payroll Exports", `${H}/payroll/exports`, HiCloudDownload),
            link("Document Exports", `${H}/documents/exports`, HiCloudDownload),
            link("Document Emails", `${H}/documents/notifications`, HiMail),
            link("Audit Log", `${H}/payroll/audit-log`, HiDatabase),
          ],
        },
        companySection("hr"),
      ];
    }

    if (role === "manager") {
      const M = "/dashboard/manager";
      // The HR menu with the organisation-wide parts removed: same sections,
      // same order, same labels for the same job.
      return [
        {
          title: "MAIN",
          flat: true,
          items: [
            link("Dashboard", M, HiViewGrid),
            link("Inbox", `${M}/requests/inbox`, HiInboxIn, inboxBadge),
          ],
        },
        meSection("manager"),
        {
          // Called ORGANISATION, not PEOPLE, because it holds the places as well
          // as the people: the team, plus the two kinds of location a manager
          // can look up. HR keeps PEOPLE (invites + employees) and files the
          // same two location pages under SETUP → Organisation, where HR also
          // creates them — the one place the two menus diverge, and only
          // because HR's half of this is setup work and the manager's is
          // reference (§2). Client Sites moved here out of TIME & LEAVE: it is
          // a place, not a request queue.
          title: "ORGANISATION",
          icon: HiUserGroup,
          items: [
            // Member profiles live under /team/member/, not /team/, because
            // /team/today and /team/history are separate sidebar entries.
            { ...link(DICTIONARY.NAV.EMPLOYEES, `${M}/team`, HiUserGroup), active: location.pathname === `${M}/team` || location.pathname.startsWith(`${M}/team/member/`) },
            // Both are the SAME screens HR gets, under this workspace's own
            // prefix. A manager registers and assigns client sites for their own
            // reports; office locations are read-only here because POST/PUT on
            // /organizations/locations are HR-only, so the page carries no Add
            // button rather than one that 403s.
            // Same order as HR's Setup › Organisation group: your own offices
            // first, then the third-party sites. A promotion must not reshuffle
            // the menu (§2).
            link("Office Locations", `${M}/attendance/locations`, HiLocationMarker),
            link("Client Sites", `${M}/attendance/field-locations`, HiLocationMarker),
          ],
        },
        {
          title: "TIME & LEAVE",
          icon: HiClock,
          items: [
            link("Live Attendance", `${M}/team/today`, HiClock),
            link("Attendance History", `${M}/team/history`, HiCalendar),
            link("Leave Requests", `${M}/requests/leaves`, HiInboxIn, queueBadge("leaves")),
            link(`${REGULARIZATION}s`, `${M}/requests/regularizations`, HiClipboardList, queueBadge("regularizations")),
            link("Overtime", `${M}/requests/overtime`, HiLightningBolt, queueBadge("overtime")),
            link("Flags", `${M}/team/anomalies`, HiExclamationCircle, queueBadge("anomalies")),
            link(COMP_OFF, `${M}/requests/comp-offs`, HiGift, queueBadge("compOffs")),
          ],
        },
        tasksSection("manager"),
        {
          title: "PAYROLL",
          icon: HiCurrencyRupee,
          items: [
            step(1, "Before the month"),
            link("Employee Salaries", `${M}/payroll/team-salary`, HiCurrencyRupee),
            step(2, "This month"),
            link("Salary Adjustments", `${M}/payroll/adjustments`, HiAdjustments),
            link("Claims & Benefits", `${M}/payroll/reimbursements`, HiReceiptRefund, queueBadge("claims")),
            link(`${ENCASHMENT}s`, `${M}/payroll/encashments`, HiCash),
            step(3, "Close and pay"),
            link("Payslips", `${M}/payroll/team-payslips`, HiDocumentText),
          ],
        },
        {
          title: "DOCUMENTS WE COLLECT",
          icon: HiFolderOpen,
          items: [
            link("Document Requests", `${M}/documents/requests`, HiClipboardList),
            link("Employee Documents", `${M}/documents`, HiFolderOpen),
            link("Document Compliance", `${M}/documents/compliance`, HiClipboardCheck),
          ],
        },
        {
          // A manager can't issue anything, only ask HR to: a company document
          // (#62–#69) or a letter (PDF Phase 4, #145/#146).
          title: "DOCUMENTS WE ISSUE",
          icon: HiPaperAirplane,
          forceDropdown: true,
          items: [
            link("Document Proposals", `${M}/documents/proposals`, HiPaperAirplane),
            link("Letter Proposals", `${M}/documents/letter-proposals`, HiMail, queueBadge("letterProposals")),
          ],
        },
        {
          title: "INSIGHTS",
          icon: HiChartBar,
          forceDropdown: true,
          items: [
            link("Payroll Reports", `${M}/payroll/reports`, HiDocumentReport),
          ],
        },
        companySection("manager"),
      ];
    }

    const me = selfService("employee");
    return [
      {
        title: "MAIN",
        flat: true,
        items: [
          link("Dashboard", "/dashboard/employee", HiViewGrid),
        ],
      },
      { title: "MY TIME", icon: HiClock, items: me.time },
      { title: "MY TASKS", icon: HiClipboardCheck, items: me.tasks },
      { title: "MY PAY", icon: HiCurrencyRupee, items: me.pay },
      { title: "MY DOCUMENTS", icon: HiFolderOpen, items: me.documents },
      // Same self-service entry HR and managers get from meSection: an employee
      // punches too, so they reach their own devices here rather than being sent
      // nowhere once it left My Time (16 Oct 2026). Gated on the feature being on.
      ...(showMyDevices ? [{ title: "My Registered Devices", icon: HiDeviceMobile, items: [
        link("This device", `${me.devices}?tab=this`, HiDeviceMobile, { defaultTab: true }),
        link("All my devices", `${me.devices}?tab=all`, HiCollection),
      ] }] : []),
      companySection("employee"),
    ];
  };

  const navSections = getNavSections();

  // Flat list of every page in this menu, for the top bar's search, plus the
  // inbox the bell opens. External links (mailto:) are left out.
  const navItems = navSections.flatMap((section) =>
    section.items.flatMap((item) => (item.group
      ? item.items.map((child) => ({ ...child, where: section.flat ? item.group : `${section.title} · ${item.group}` }))
      : [{ ...item, where: section.flat ? "" : section.title }]))
      .filter((item) => item.path && !item.external && !item.heading)
      .map((item) => ({ label: item.label, path: item.path, section: item.where })));
  const inboxPath = navItems.find((item) => item.label === "Inbox")?.path;
  const navKey = JSON.stringify(navItems);
  useEffect(() => {
    setNav({ items: JSON.parse(navKey), inbox: inboxPath ? { path: inboxPath, count: inboxCount } : null });
  }, [navKey, inboxPath, inboxCount, setNav]);

  // ── Open / closed state ──────────────────────────────────────────────────
  // Sections are open unless collapsed; `defaultCollapsed` ones (Setup, Me) and
  // every third-level group start closed. Whatever the person opens or closes
  // is remembered per workspace, so the menu looks the same after a reload.
  // Storage is a convenience only: private mode or blocked storage just means
  // the defaults come back.
  const sectionKey = (section) => `s:${section.title}`;
  const groupKey = (section, item) => `g:${section.title}/${item.group}`;

  // The current page's section and group are always open — on first paint (so
  // a deep link never flashes a collapsed menu), and again on every navigation
  // below. You can never land somewhere the menu hides.
  const activeTrail = navSections
    .flatMap((section) => section.items.flatMap((item) => {
      if (item.group) return item.items.some((child) => child.active) ? [sectionKey(section), groupKey(section, item)] : [];
      return item.active ? [sectionKey(section)] : [];
    }))
    .join("|");
  const trailOpen = (trail) => Object.fromEntries(trail ? trail.split("|").map((key) => [key, true]) : []);

  const storageKey = `hrc.sidebar.open.${role}`;
  const [openState, setOpenState] = useState(() => {
    let stored = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(storageKey) || "{}") || {};
    } catch {
      // Storage unavailable — start from the defaults.
    }
    return { ...stored, ...trailOpen(activeTrail) };
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(openState));
    } catch {
      // Storage unavailable — the menu still works, it just won't remember.
    }
  }, [storageKey, openState]);

  const isSectionOpen = (section) => openState[sectionKey(section)] ?? !section.defaultCollapsed;
  const isGroupOpen = (key) => openState[key] ?? false;
  const setOpen = (key, value) => setOpenState((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!activeTrail) return;
    setOpenState((prev) => (activeTrail.split("|").every((key) => prev[key]) ? prev : { ...prev, ...trailOpen(activeTrail) }));
  }, [activeTrail]);

  const closeOnMobile = () => { if (window.innerWidth < 1024) closeSidebar(); };

  // Tree keyboard support: ↑/↓ move between visible entries, → opens a closed
  // group (or steps into an open one), ← closes an open one or jumps to its
  // parent, Home/End go to the ends. Enter/Space work natively on the buttons.
  const onNavKeyDown = (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const nodes = [...e.currentTarget.querySelectorAll("[data-nav]")];
    const index = nodes.indexOf(document.activeElement);
    if (index === -1) return;
    const current = nodes[index];
    const expanded = current.getAttribute("aria-expanded");
    let target = null;
    if (e.key === "ArrowDown") target = nodes[index + 1] || nodes[0];
    else if (e.key === "ArrowUp") target = nodes[index - 1] || nodes[nodes.length - 1];
    else if (e.key === "Home") target = nodes[0];
    else if (e.key === "End") target = nodes[nodes.length - 1];
    else if (e.key === "ArrowRight") {
      if (expanded === "false") { e.preventDefault(); current.click(); return; }
      if (expanded === "true") target = nodes[index + 1];
    } else if (e.key === "ArrowLeft") {
      if (expanded === "true") { e.preventDefault(); current.click(); return; }
      const parent = current.dataset.navParent;
      target = parent ? nodes.find((node) => node.dataset.navId === parent) : null;
    }
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  // ── Rendering ────────────────────────────────────────────────────────────
  const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-purple-200";
  // Every count in this menu is the same pill, wherever it is drawn: a link, a
  // section of one, or a section header. `normal-case tracking-normal` is for
  // the header, which is uppercase and letter-spaced and would otherwise push
  // the digits apart inside the circle.
  const BADGE = "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center tabular-nums normal-case tracking-normal";
  const BADGE_TONE = "bg-rose-500 text-white";

  // The utility dock at the bottom. It gets the same active treatment as the
  // nav above it — a gear that stays grey while you are standing on the page
  // it opens makes the sidebar look like it has lost track of you.
  const UTILITY_LINK = `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors ${FOCUS}`;
  const UTILITY_LINK_ACTIVE = `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#F3E8FF] text-[#7E22CE] transition-colors ${FOCUS}`;
  // Active on the hub and on anything under it, so a future sub-route keeps
  // the gear lit rather than quietly dropping the highlight.
  const settingsBase = `/dashboard/${role}/settings`;
  const settingsActive = location.pathname === settingsBase
    || location.pathname.startsWith(`${settingsBase}/`);

  // `compact` = inside a third-level group: the group already shows the icon,
  // so its children are text only, which keeps the nesting readable.
  const renderLink = (item, parentKey, compact = false) => {
    const Icon = item.icon;
    const isActive = item.active;
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={(e) => {
          item.onClick?.(e);
          closeOnMobile();
        }}
        data-nav=""
        data-nav-parent={parentKey}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center justify-between gap-2 ${compact ? "px-3 py-2 rounded-lg" : "px-4 py-2.5 rounded-xl"} text-xs font-medium transition-all ${FOCUS} ${isActive
          ? "text-[#7E22CE] font-bold bg-[#F3E8FF]/60"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          {!compact && Icon && <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />}
          <span className="truncate">{item.label}</span>
        </span>
        {item.badge ? (
          <span className={`${item.badgeClass || BADGE_TONE} ${BADGE}`}>
            {item.badge}
          </span>
        ) : item.dot ? (
          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse" />
        ) : null}
      </Link>
    );
  };

  /**
   * What a whole section is waiting on, for its header. Most of the menu is
   * collapsed most of the time — it is the longest in the product — so without
   * this, a claim waiting inside a shut PAYROLL section is invisible until you
   * open it. Summed from the badges already on the links, so the header can
   * never claim something its children don't show.
   *
   * Drawn as the same pill as every other count in this menu — one shape for
   * one meaning. A quieter style for the header was tried and rejected: two
   * ways of writing "3 waiting" in one sidebar reads as two different things.
   */
  const sectionCount = (section) => section.items.reduce((sum, item) => {
    const children = item.group ? item.items : [item];
    return sum + children.reduce((n, child) => n + (Number(child.badge) || 0), 0);
  }, 0);

  const renderItem = (section, item) => {
    if (item.step) {
      // The number is a position in the payroll sequence (1 → 2 → 3), not a
      // count of anything. It used to sit in a round purple pill, which is
      // exactly how unread counts are drawn elsewhere — a reviewer read
      // "BEFORE THE MONTH ①" as one pending item (UI/UX review 2026-10-06,
      // Issue 11). Flat, same colour as the heading, with a separator: an
      // ordinal can't be mistaken for a badge.
      return (
        <p key={`step-${item.step}`} className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider first:pt-1">
          <span className="tabular-nums">Step {item.step}</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          {item.heading}
        </p>
      );
    }
    if (item.heading) {
      return (
        <p key={`heading-${item.heading}`} className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider first:pt-1">
          {item.heading}
        </p>
      );
    }
    if (item.group) {
      const key = groupKey(section, item);
      const open = isGroupOpen(key);
      const containsActive = item.items.some((child) => child.active);
      const Icon = item.icon;
      const panelId = `nav-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      return (
        <div key={key}>
          <button
            type="button"
            data-nav=""
            data-nav-id={key}
            data-nav-parent={sectionKey(section)}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => setOpen(key, !open)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${FOCUS} ${containsActive
              ? `text-[#7E22CE] font-bold ${open ? "" : "bg-[#F3E8FF]/60"}`
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
          >
            <span className="flex items-center gap-3">
              <Icon className={`w-4 h-4 ${containsActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
              {item.group}
            </span>
            <HiChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div id={panelId} role="group" aria-label={item.group} className="ml-6 mt-0.5 mb-1 pl-3 border-l-2 border-slate-100 space-y-0.5">
              {item.items.map((child) => renderLink(child, key, true))}
            </div>
          )}
        </div>
      );
    }
    return renderLink(item, section.flat ? undefined : sectionKey(section));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Container */}
      {/* `no-scrollbar` hides the sidebar's own scrollbar track without taking
          away its scrolling (CLAUDE.md §5). On a laptop-height window the menu
          overflows, and its native track sat right beside the main content's —
          two grey bars next to each other (UI/UX review 2026-10-06, Issue 13). */}
      <aside className={`fixed inset-y-0 left-0 z-50 lg:z-10 w-64 bg-white border-r border-slate-100 flex flex-col justify-between h-screen overflow-y-auto no-scrollbar transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0 font-sans ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        {/* Top Branding Logo */}
        <div>
          <div className="px-6 py-8 flex items-center justify-between lg:justify-center">
            <Link to="/">
              <img src="/logocolored.png" alt="HR Clouds" className="h-12 w-auto object-contain" />
            </Link>
            <button
              onClick={closeSidebar}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <HiX className="w-5 h-5" />
            </button>
          </div>

          {/* Multi-Org Switcher dropdown inside sidebar if orgs exist */}
          {organizations && organizations.length > 1 && (
            <div className="px-5 py-3 border-b border-slate-100">
              <OrgSwitcher organizations={organizations} currentOrgId={orgId} />
            </div>
          )}

          {/* Navigation Section */}
          <nav aria-label="Main" onKeyDown={onNavKeyDown} className="px-4 py-4 space-y-4">
            {navSections.map((section) => {
              // Headerless group (Dashboard + Inbox).
              if (section.flat) {
                return (
                  <div key={section.title} className="space-y-1">
                    {section.items.map((item) => renderItem(section, item))}
                  </div>
                );
              }

              const isSingle = section.items.length === 1 && !section.forceDropdown;

              // Single item section — render directly as a link
              if (isSingle) {
                const item = section.items[0];
                const Icon = item.icon || section.icon;
                const isActive = item.active;

                return (
                  <Link
                    key={section.title}
                    to={item.path}
                    onClick={closeOnMobile}
                    data-nav=""
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${FOCUS} ${isActive
                      ? "bg-[#F3E8FF] text-[#7E22CE] shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-purple-700"
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                    <span className="truncate">{item.label}</span>
                    {/* A section of one is drawn as its own link, so it has to
                        carry the badge itself — without this, a queue would go
                        silent the day its section lost its second entry. */}
                    {item.badge ? (
                      <span className={`${item.badgeClass || BADGE_TONE} ${BADGE} ml-auto`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              }

              // Multi-item section — render with collapsible header
              const isOpen = isSectionOpen(section);
              const key = sectionKey(section);
              const panelId = `nav-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
              const waiting = sectionCount(section);

              return (
                <div key={section.title} className="space-y-1">
                  {/* Section Header */}
                  <button
                    type="button"
                    data-nav=""
                    data-nav-id={key}
                    onClick={() => setOpen(key, !isOpen)}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? panelId : undefined}
                    title={waiting > 0 ? `${waiting} item${waiting === 1 ? "" : "s"} waiting in ${section.title.toLowerCase()}` : undefined}
                    className={`w-full flex items-center justify-between px-4 py-2 rounded-lg text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors ${FOCUS}`}
                  >
                    <span>{section.title}</span>
                    <span className="flex items-center gap-2">
                      {waiting > 0 && (
                        <span aria-label={`${waiting} waiting`} className={`${BADGE_TONE} ${BADGE}`}>
                          {waiting}
                        </span>
                      )}
                      {isOpen ? (
                        <HiChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <HiChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </span>
                  </button>

                  {/* Sub-items list */}
                  {isOpen && (
                    <div id={panelId} className="space-y-1 pl-2">
                      {section.items.map((item) => renderItem(section, item))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-4 pb-4 space-y-2">
          {/* The utility dock: help, the organisation's settings, and the
              person's own account — the three things that are never part of
              the work above them, so they sit outside the nav and stay put
              while it scrolls. Guests have none of these pages.

              THE GEAR IS COMPANY SETTINGS, and it used to be My Profile. A
              gear labelled "Settings" that opened one person's own profile is
              the wrong promise: every product puts the organisation's
              configuration behind that icon. The profile now carries its own
              name and the user icon, which also makes the sidebar label match
              the page's heading again (§2). */}
          {role !== "guest" && (
            <>
              <Link to="/dashboard/documents" onClick={closeOnMobile} className={UTILITY_LINK}>
                <HiQuestionMarkCircle className="w-5 h-5 text-slate-400" />
                <span>Help Center</span>
              </Link>
              {/* HR and the manager both read the hub; the server decides how
                  much of it they see, so this is one entry rather than a role
                  branch (§2). An employee has no settings to read, so for them
                  it is absent rather than a page that refuses them. */}
              {(role === "hr" || role === "manager") && (
                <Link
                  to={`/dashboard/${role}/settings`}
                  onClick={closeOnMobile}
                  aria-current={settingsActive ? "page" : undefined}
                  className={settingsActive ? UTILITY_LINK_ACTIVE : UTILITY_LINK}
                >
                  <HiCog className={`w-5 h-5 ${settingsActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                  <span>Settings</span>
                </Link>
              )}
              <Link
                to="/dashboard/profile"
                onClick={closeOnMobile}
                aria-current={location.pathname === "/dashboard/profile" ? "page" : undefined}
                className={location.pathname === "/dashboard/profile" ? UTILITY_LINK_ACTIVE : UTILITY_LINK}
              >
                <HiUserCircle className={`w-5 h-5 ${location.pathname === "/dashboard/profile" ? "text-[#7E22CE]" : "text-slate-400"}`} />
                <span>My Profile</span>
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default DashboardSidebar;
