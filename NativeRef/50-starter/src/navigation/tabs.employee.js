// ─────────────────────────────────────────────────────────────────────────────
// navigation/tabs.employee.js — THE TAB SET IS DATA.
//
// That is the whole point of this file. When the manager app arrives it adds
// `tabs.manager.js` beside this one and AppTabs reads whichever the session's
// workspace names. It does NOT add conditionals to this file, and it does not
// widen the role gate (state/session.js). One role, one workspace, one tab set.
//
// ── FIVE TABS IS THE MAXIMUM ─────────────────────────────────────────────────
//
// A sixth means the grouping is wrong. The web employee sidebar has five
// sections and 24 screens; they map onto five tabs as below.
//
// ── WHY LEAVE IS ITS OWN TAB ─────────────────────────────────────────────────
//
// On the web it sits under MY TIME. It is the SECOND MOST-USED employee action
// after punching, and burying it a level costs a tap every single time —
// whereas everything else under MY TIME is checked occasionally, not used
// daily.
//
// The SCREEN is identical to the web screen, so §2 parity holds: only its
// reachability improves. This is the one deliberate divergence from the sidebar
// grouping and it is recorded here so nobody "fixes" it back.
//
// ── WHY PayTab OPENS ON A MENU ───────────────────────────────────────────────
//
// Five pay screens with no natural default. Payslips is the most-used, but
// opening straight into it hides the other four behind a strip the person has
// to notice. A short menu of five cards, each with a one-line summary from the
// data ("September · ₹87,432"), is faster to scan and self-documenting.
//
// Time, by contrast, DOES have a natural default (Attendance), so it opens
// there with a TabStrip for the rest.
//
// ── THE TITLE RULE ───────────────────────────────────────────────────────────
//
// `title` here is the native header title AND the screen's own <h1> AND, for a
// tab root, the tab label. Those three must be the same words (CLAUDE.md §2).
// It is the fastest parity check there is, so the strings live here once rather
// than being typed per screen.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `presentation`:
 *   undefined → a pushed stack screen (native header, back chevron)
 *   'modal'   → a full-screen FormSheet (its own header with an X)
 *
 * A record being READ is not here at all: a RecordSheet is local state inside
 * the screen that owns the list, not a route. Routing a sheet means the list
 * behind it unmounts, and the master–detail illusion is the point of it.
 */
export const EMPLOYEE_TABS = [
  {
    name: 'HomeTab',
    label: 'Home',
    icon: 'dashboard',
    screens: [
      // No native header: PageHeader IS the header on this one screen.
      { name: 'Home', title: 'Home', headerShown: false },
      { name: 'DayLog', title: 'That day' },
    ],
  },
  {
    name: 'TimeTab',
    label: 'Time',
    icon: 'clock',
    screens: [
      // One screen with a TabStrip: Attendance · Corrections · Overtime ·
      // Flags · Earned Leave. Five stack screens would mean five headers and
      // five back presses for things people compare against each other.
      { name: 'Time', title: 'My Time' },
      { name: 'DayLog', title: 'That day' },
      { name: 'CorrectionForm', title: 'Request a correction', presentation: 'modal' },
      { name: 'OvertimeForm', title: 'Claim overtime', presentation: 'modal' },
      { name: 'EarnedLeaveForm', title: 'Use earned leave', presentation: 'modal' },
    ],
  },
  {
    name: 'LeaveTab',
    label: 'Leave',
    icon: 'calendar',
    screens: [
      { name: 'Leave', title: 'My Leave' },
      { name: 'ApplyLeave', title: 'Apply for leave', presentation: 'modal' },
      { name: 'Holidays', title: 'Holidays' },
    ],
  },
  {
    name: 'PayTab',
    label: 'Pay',
    icon: 'rupee',
    screens: [
      { name: 'PayHome', title: 'My Pay' },
      { name: 'Salary', title: 'My Salary' },
      { name: 'BankAccount', title: 'Bank account', presentation: 'modal' },
      { name: 'Payslips', title: 'Payslips' },
      { name: 'Claims', title: 'Claims & Benefits' },
      { name: 'ClaimForm', title: 'Make a claim', presentation: 'modal' },
      { name: 'Loans', title: 'Loans & Advances' },
      { name: 'Tax', title: 'Tax & Investments' },
      { name: 'DeclarationForm', title: 'Declare an investment', presentation: 'modal' },
    ],
  },
  {
    name: 'MoreTab',
    label: 'More',
    icon: 'menu',
    // The ONLY tab with a badge, and only for things needing the person's
    // ACTION: company documents awaiting acknowledgement, and document
    // requests HR has made of them.
    //
    // NOT for their own pending corrections or leave. Those are waiting on
    // somebody else, and a badge there nags about something they cannot act on.
    badge: 'inbox',
    screens: [
      { name: 'More', title: 'More' },
      { name: 'DocumentsHome', title: 'My Documents' },
      { name: 'MyDocuments', title: 'My Documents' },
      { name: 'UploadDocument', title: 'Upload a document', presentation: 'modal' },
      { name: 'CompanyDocuments', title: 'Company Documents' },
      { name: 'DocumentRequests', title: 'Document Requests' },
      { name: 'Forms', title: 'Forms & Templates' },
      { name: 'Company', title: 'Company Profile' },
      { name: 'OrgChart', title: 'Org Chart' },
      { name: 'Directory', title: 'Directory' },
      { name: 'Profile', title: 'My Profile' },
      { name: 'Settings', title: 'Settings' },
    ],
  },
];

/** Every screen name in the tab set, for the registry's dev-time check. */
export const EMPLOYEE_SCREEN_NAMES = EMPLOYEE_TABS
  .flatMap((tab) => tab.screens.map((s) => s.name));

/**
 * The tab set for a workspace. There is exactly one today, and the gate in
 * state/session.js guarantees nothing else reaches AppTabs — but this returns
 * `null` for an unknown workspace rather than defaulting to employee, because
 * "default to employee" is precisely how the web app once let HR walk the
 * employee tabs (CLAUDE.md §2).
 */
export function tabsForWorkspace(workspace) {
  if (workspace === 'employee') return EMPLOYEE_TABS;
  return null;
}
