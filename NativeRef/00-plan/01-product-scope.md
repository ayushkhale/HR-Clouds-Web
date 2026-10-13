# 01 · Product scope — the employee app

## What this app is

The HR Clouds **employee workspace**, on a phone. One person, their own data:
their attendance, their leave, their pay, their documents, their organisation's
public pages. Nothing about anyone else.

It is not a companion app or a cut-down view. Every self-service capability the
web employee workspace has, the phone has — because an employee who can apply
for leave at a desk and not on a bus will conclude the app is broken.

**Manager comes later.** The architecture must make that an addition, not a
rewrite: see [02-architecture.md](02-architecture.md) § "Designing for the
manager app that doesn't exist yet".

---

## Surface inventory — the complete employee workspace

Taken from `DashboardSidebar.jsx` (the `employee` branch) and
`routes/AppRoutes.jsx` (the `/dashboard/employee/*` block). This is the whole
list; nothing else is mounted for an employee.

### MAIN

| Screen | Web route | Web file |
|---|---|---|
| Dashboard | `/dashboard/employee` | `roles/employee/screens/EmployeeDashboard.jsx` |

### MY TIME

| Screen | Web route | Web file |
|---|---|---|
| My Attendance | `/dashboard/employee/attendance` | `EmployeeAttendancePage.jsx` |
| My Leaves | `/dashboard/employee/leaves` | `LeaveDashboard.jsx` (1003 lines) |
| My Attendance Corrections | `…/attendance/regularizations` | `AttendanceRegularizationsPage.jsx` + `components/RegularizationCard.jsx` |
| My Overtime | `…/attendance/overtime` | `EmployeeOvertimePage.jsx` |
| My Flags | `…/attendance/anomalies` | `AttendanceAnomaliesPage.jsx` |
| My Earned Leave | `…/attendance/comp-offs` | `EmployeeCompOffsPage.jsx` |

### MY PAY

| Screen | Web route | Web file |
|---|---|---|
| My Salary & Bank | `…/payroll/my-salary` | `payroll/screens/MySalaryPage.jsx` |
| My Payslips | `…/payroll/my-payslips` | `MyPayslipsPage.jsx` (3 tabs: payslips · annual statement · Form 16) |
| My Claims & Benefits | `…/payroll/reimbursements` | `MyReimbursementsPage.jsx` (765 lines) |
| My Loans & Variable Pay | `…/payroll/loans` | `MyLoansAndAdvancesPage.jsx` |
| My Tax & Investments | `…/payroll/tax` | `MyTaxAndInvestmentsPage.jsx` |

### MY DOCUMENTS

| Screen | Web route | Web file |
|---|---|---|
| My Document Home | `…/documents/all` | `shared/screens/AllMyDocumentsPage.jsx` |
| My Personal Documents | `…/documents` | `shared/screens/MyDocumentsPage.jsx` |
| My Company Documents | `…/company-documents[/:id]` | `shared/screens/IssuedDocumentsPage.jsx` |
| My Document Requests | `…/document-requests` | `shared/screens/MyRequestsPage.jsx` |
| Blank Forms | `…/forms` | `shared/screens/FormsLibraryPage.jsx` |

> Blank Forms is deliberately **not** in the sidebar on web ("a form belongs to
> nobody") — it is reached from My Document Home. Keep that: on mobile it is a
> card on the Documents home, not a tab.

### COMPANY

| Screen | Web route | Web file |
|---|---|---|
| Org Chart | `…/org-chart` | `shared/screens/OrgChartPage.jsx` |
| Company Profile | `…/company` | `shared/screens/CompanyProfilePage.jsx` |

### Workspace-less (signed-in, no prefix)

| Screen | Web route | Web file |
|---|---|---|
| My Profile | `/dashboard/profile` | `shared/screens/MyProfilePage.jsx` |
| Directory | `/dashboard/directory` | `shared/screens/DirectoryPage.jsx` |

### Auth

| Screen | Web route |
|---|---|
| Login (identifier + password, Google SSO) | `/login` |
| OTP (signup verify / forgot-password verify) | `/otp` |
| Forgot password | `/forgot-password` |
| Select organisation (multi-org login) | `/select-org` |

**24 screens.** Signup and organisation registration are **out of scope** — an
employee arrives by invitation, and the invitation-accept flow is a web link.

---

## Explicitly out of scope

| Thing | Why |
|---|---|
| Manager / HR / admin workspaces | Separate tab set or app. The route gate is exact, not cumulative |
| Approving anything | An employee approves nothing. No decision dialogs, no queues |
| Team data of any kind | No team attendance, no team balances, no colleague's documents |
| Org registration, Razorpay checkout, billing | HR-only, and `/billing/*` refuses non-HR |
| Company settings, policies, shift templates, holiday admin | HR-only configuration |
| Issuing letters, document proposals, verification queues | HR / manager planes |
| The marketing site, legal pages, pricing | Web only. Link out if ever needed |
| Guest workspace | Not a tenant role worth an app |

A capability the employee lacks is **absent, not broken**. Never render a
control that will 403.

---

## Modules and their backing API families

| Module | API base | Roles allowed | Notes |
|---|---|---|---|
| Auth | `/auth/*`, `/organizations/me` | public / self | Multi-org selection uses a short-lived selection token |
| Attendance self-service | `/attendance/*` (no `/hr`, no `/manager` segment) | every org role | Punch, today, history, summary, daily log, graph, trends, shift, holidays |
| Corrections / overtime / flags / earned leave | `/attendance/regularizations`, `/overtime/mine`, `/anomalies/mine`, `/comp-offs/mine` | every org role | |
| Leave | `/leaves/my-*`, `/leaves/request`, `/leaves/requests/:id` | every org role | |
| Pay | `/payroll/me/*` | every org role | Salary, payslips, tax, loans, claims, benefits, bank |
| Documents (personal) | `/documents/me/documents` | every org role | Upload / replace / delete own documents |
| Documents (company) | `/documents/me/hr-documents` | every org role | Read + **acknowledge** + **sign** |
| Document requests | `/documents/me/document-requests`, `/documents/me/checklist` | every org role | |
| Blank forms | `/documents/templates` | every org role | Published templates, download URL |
| Organisation | `/organizations/me`, `/organizations/details`, `/organizations/hierarchy`, `/organizations/directory` | every org role | |

**The one endpoint that will 403 for you:** `/organizations/employees` —
readable by HR and managers only. The web `EmployeeDirectoryContext` knows this
and reports `status: "unavailable"` for employees. In the native app, **do not
port the employee-directory store at all**; people come from
`/organizations/directory` and from names already embedded in each payload.
→ [10-api/05-contract-traps.md](../10-api/05-contract-traps.md) § T1

---

## Mobile-first capabilities the web app cannot have

These are the reason the app exists, and they should be built properly, not
bolted on.

| Capability | Where | Notes |
|---|---|---|
| **Real GPS punch** | Punch card | Native accuracy, permission flow, "precise location" on iOS 14+. See [60-ops/02-permissions-and-native.md](../60-ops/02-permissions-and-native.md) |
| One-tap punch from the home screen | Home tab, above the fold | No scrolling to clock in |
| Push: punch reminder, approval outcome, document to acknowledge | Phase 6 | Notifee + FCM / APNs |
| Camera upload for claim receipts and documents | Claims, Documents | `react-native-image-picker` into the same presigned-upload flow |
| Offline read of today's status and this month's attendance | Cache layer | Writes are **never** queued offline — see [60-ops/03-offline-and-lifecycle.md](../60-ops/03-offline-and-lifecycle.md) |
| Biometric app lock | Settings | Payslips and salary structure are on this device |
| Share / open payslip PDF in the OS viewer | Payslips | `blob-util` + `file-viewer`, never a webview |

---

## Success criteria for v1

1. An employee can clock in and out, with location, in under three taps from a
   cold launch.
2. Every screen in the inventory above exists and loads real data.
3. Nothing on any screen shows a UUID, a raw enum, a dash, or a decimal day.
4. A manager / HR / admin token is refused at sign-in with a clear explanation.
5. Every screen has had its ⓘ pass, or carries a recorded reason why no field
   qualifies.
6. Side by side with the web app on the same account, the two agree on every
   number and every word.
