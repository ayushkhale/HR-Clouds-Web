import React, { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import { canAccessWorkspace, dashboardPathForRole } from "../shared/auth/permissions";
import Skeleton from "../shared/components/Skeleton";

// Landing Layout & Pages
import LandingLayout from "../landing/LandingLayout";
import Home from "../landing/pages/Home";
import About from "../landing/pages/About";
import Services from "../landing/pages/Services";
import PricingPage from "../landing/pages/Pricing";
import Contact from "../landing/pages/Contact";
import PrivacyPolicy from "../landing/pages/legal/PrivacyPolicy";
import TermsOfService from "../landing/pages/legal/TermsOfService";
import CookiePolicy from "../landing/pages/legal/CookiePolicy";
import StatutoryGuidelines from "../landing/pages/legal/StatutoryGuidelines";

// Auth Layout & Pages
import AuthLayout from "../auth/AuthLayout";
import LoginPage from "../auth/pages/LoginPage";
import RegisterPage from "../auth/pages/RegisterPage";
import OtpPage from "../auth/pages/OtpPage";
import ForgotPasswordPage from "../auth/pages/ForgotPasswordPage";
import SelectOrgPage from "../auth/pages/SelectOrgPage";

// Organization Registration (standalone layout)

// Invitation (standalone layout)

// Dashboards

// HR — Attendance

// HR — Phase 5 & 6

// HR — Leave Management

// Employee — Leave

// Manager — Leave

// Manager — Phase 5

// HR — Payroll

// Manager — Payroll

// Employee — Payroll

// Shared Screens

// Documents module (Phase 1 employee documents, Phase 2 org documents, Phase 3
// compliance, Phase 4 requests / checklists / emails / automation, Phase 5
// form templates / search / reports / export log / composed portfolio)

/* ─── Lazily-loaded workspace screens ──────────────────────────────────────
   The landing page used to ship the entire signed-in product in one 2.8MB
   chunk — every payroll screen, every dashboard, and Recharts — which a
   visitor had to download and parse before reading the homepage. Each of
   these is now its own chunk, fetched when its route is first visited.
──────────────────────────────────────────────────────────────────────── */
const DashboardLayout = lazy(() => import("../shared/layouts/DashboardLayout"));
const RegisterOrgPage = lazy(() => import("../auth/pages/RegisterOrgPage"));
const InvitationAcceptPage = lazy(() => import("../auth/pages/InvitationAcceptPage"));
const DashboardPage = lazy(() => import("../roles/DashboardPage"));
const GuestDashboard = lazy(() => import("../roles/guest/screens/GuestDashboard"));
const HRDashboard = lazy(() => import("../roles/hr/screens/HRDashboard"));
const HRInboxPage = lazy(() => import("../roles/hr/screens/HRInboxPage"));
const EmployeesPage = lazy(() => import("../roles/hr/screens/EmployeesPage"));
const InvitesPage = lazy(() => import("../roles/hr/screens/InvitesPage"));
const EmployeeProfilePage = lazy(() => import("../roles/hr/screens/EmployeeProfilePage"));
const DepartmentsPage = lazy(() => import("../roles/hr/screens/DepartmentsPage"));
const DepartmentDetailPage = lazy(() => import("../roles/hr/screens/DepartmentDetailPage"));
const EmployeeDashboard = lazy(() => import("../roles/employee/screens/EmployeeDashboard"));
const EmployeeAttendancePage = lazy(() => import("../roles/employee/screens/EmployeeAttendancePage"));
const AttendanceRegularizationsPage = lazy(() => import("../roles/employee/screens/AttendanceRegularizationsPage"));
const AttendanceAnomaliesPage = lazy(() => import("../roles/employee/screens/AttendanceAnomaliesPage"));
const EmployeeOvertimePage = lazy(() => import("../roles/employee/screens/EmployeeOvertimePage"));
const EmployeeCompOffsPage = lazy(() => import("../roles/employee/screens/EmployeeCompOffsPage"));
const ManagerDashboard = lazy(() => import("../roles/manager/screens/ManagerDashboard"));
const ManagerRegularizationsPage = lazy(() => import("../roles/manager/screens/ManagerRegularizationsPage"));
const ManagerOvertimePage = lazy(() => import("../roles/manager/screens/ManagerOvertimePage"));
const ManagerTeamPage = lazy(() => import("../roles/manager/screens/ManagerTeamPage"));
const ManagerTeamHistoryPage = lazy(() => import("../roles/manager/screens/ManagerTeamHistoryPage"));
const ManagerTeamRosterPage = lazy(() => import("../roles/manager/screens/ManagerTeamRosterPage"));
const ManagerMemberProfilePage = lazy(() => import("../roles/manager/screens/ManagerMemberProfilePage"));
const ManagerAnomaliesPage = lazy(() => import("../roles/manager/screens/ManagerAnomaliesPage"));
const ManagerApprovalsInbox = lazy(() => import("../roles/manager/screens/ManagerApprovalsInbox"));
const HRAttendancePage = lazy(() => import("../roles/hr/screens/HRAttendancePage"));
const AttendancePoliciesPage = lazy(() => import("../roles/hr/attendance/screens/AttendancePoliciesPage"));
const AttendanceShiftsPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceShiftsPage"));
const AttendanceRosterPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceRosterPage"));
const AttendanceHolidaysPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceHolidaysPage"));
const AttendanceWeeklyOffsPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceWeeklyOffsPage"));
const AttendanceRegularizationsHRPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceRegularizationsHRPage"));
const AttendanceLocationsPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceLocationsPage"));
const AttendanceCompOffsPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceCompOffsPage"));
const AttendanceCompOffPoliciesPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceCompOffPoliciesPage"));
const AttendanceLockPeriodsPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceLockPeriodsPage"));
const AttendanceReportsPage = lazy(() => import("../roles/hr/attendance/screens/AttendanceReportsPage"));
const BiometricDevicesPage = lazy(() => import("../roles/hr/screens/BiometricDevicesPage"));
const LeaveTypesPage = lazy(() => import("../roles/hr/leaves/screens/LeaveTypesPage"));
const LeavePoliciesPage = lazy(() => import("../roles/hr/leaves/screens/LeavePoliciesPage"));
const LeaveAutomationPage = lazy(() => import("../roles/hr/leaves/screens/LeaveAutomationPage"));
const HRLeaveRequestsPage = lazy(() => import("../roles/hr/leaves/screens/HRLeaveRequestsPage"));
const LeaveDashboard = lazy(() => import("../roles/employee/screens/LeaveDashboard"));
const ManagerLeavePage = lazy(() => import("../roles/manager/screens/ManagerLeavePage"));
const ManagerCompOffsPage = lazy(() => import("../roles/manager/screens/ManagerCompOffsPage"));
const PayrollComponentsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollComponentsPage"));
const PayrollTemplatesPage = lazy(() => import("../roles/hr/payroll/screens/PayrollTemplatesPage"));
const EmployeeSalaryStructuresPage = lazy(() => import("../roles/hr/payroll/screens/EmployeeSalaryStructuresPage"));
const PayrollApprovalsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollApprovalsPage"));
const PayrollSettingsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollSettingsPage"));
const PayrollRunDashboard = lazy(() => import("../roles/hr/payroll/screens/PayrollRunDashboard"));
const PayrollRunDetailPage = lazy(() => import("../roles/hr/payroll/screens/PayrollRunDetailPage"));
const PayrollAdjustmentsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollAdjustmentsPage"));
const PayrollBonusRulesPage = lazy(() => import("../roles/hr/payroll/screens/PayrollBonusRulesPage"));
const PayrollLoansPage = lazy(() => import("../roles/hr/payroll/screens/PayrollLoansPage"));
const TaxConfigurationsPage = lazy(() => import("../roles/hr/payroll/screens/TaxConfigurationsPage"));
const TaxDeclarationsPage = lazy(() => import("../roles/hr/payroll/screens/TaxDeclarationsPage"));
const YearEndClosurePage = lazy(() => import("../roles/hr/payroll/screens/YearEndClosurePage"));
const PayrollReimbursementsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollReimbursementsPage"));
const PayrollBenefitsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollBenefitsPage"));
const PayrollReportsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollReportsPage"));
const PayrollExportsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollExportsPage"));
const PayrollPayslipsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollPayslipsPage"));
const TeamPayrollReportsPage = lazy(() => import("../roles/manager/payroll/screens/TeamPayrollReportsPage"));
const BankVerificationPage = lazy(() => import("../roles/hr/payroll/screens/BankVerificationPage"));
const PayrollAuditLogPage = lazy(() => import("../roles/hr/payroll/screens/PayrollAuditLogPage"));
const PayrollEncashmentsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollEncashmentsPage"));
const PayrollExitsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollExitsPage"));
const PayrollArrearsPage = lazy(() => import("../roles/hr/payroll/screens/PayrollArrearsPage"));
const PayrollAutomationPage = lazy(() => import("../roles/hr/payroll/screens/PayrollAutomationPage"));
const TeamSalaryPage = lazy(() => import("../roles/manager/payroll/screens/TeamSalaryPage"));
const TeamPayslipsPage = lazy(() => import("../roles/manager/payroll/screens/TeamPayslipsPage"));
const ManagerAdjustmentsPage = lazy(() => import("../roles/manager/payroll/screens/ManagerAdjustmentsPage"));
const TeamReimbursementsPage = lazy(() => import("../roles/manager/payroll/screens/TeamReimbursementsPage"));
const TeamEncashmentsPage = lazy(() => import("../roles/manager/payroll/screens/TeamEncashmentsPage"));
const MySalaryPage = lazy(() => import("../roles/employee/payroll/screens/MySalaryPage"));
const MyPayslipsPage = lazy(() => import("../roles/employee/payroll/screens/MyPayslipsPage"));
const MyLoansAndAdvancesPage = lazy(() => import("../roles/employee/payroll/screens/MyLoansAndAdvancesPage"));
const MyTaxAndInvestmentsPage = lazy(() => import("../roles/employee/payroll/screens/MyTaxAndInvestmentsPage"));
const MyReimbursementsPage = lazy(() => import("../roles/employee/payroll/screens/MyReimbursementsPage"));
const DocumentsPage = lazy(() => import("../shared/screens/DocumentsPage"));
const MyProfilePage = lazy(() => import("../shared/screens/MyProfilePage"));
const DirectoryPage = lazy(() => import("../shared/screens/DirectoryPage"));
const MyDocumentsPage = lazy(() => import("../shared/screens/MyDocumentsPage"));
const IssuedDocumentsPage = lazy(() => import("../shared/screens/IssuedDocumentsPage"));
const MyRequestsPage = lazy(() => import("../shared/screens/MyRequestsPage"));
const AllMyDocumentsPage = lazy(() => import("../shared/screens/AllMyDocumentsPage"));
const FormsLibraryPage = lazy(() => import("../shared/screens/FormsLibraryPage"));
const DocumentVerificationPage = lazy(() => import("../roles/hr/documents/screens/DocumentVerificationPage"));
const EmployeeDocumentsPage = lazy(() => import("../roles/hr/documents/screens/EmployeeDocumentsPage"));
const DocumentTypesPage = lazy(() => import("../roles/hr/documents/screens/DocumentTypesPage"));
const DocumentSettingsPage = lazy(() => import("../roles/hr/documents/screens/DocumentSettingsPage"));
const OrgDocumentsPage = lazy(() => import("../roles/hr/documents/screens/OrgDocumentsPage"));
const DocumentCompliancePage = lazy(() => import("../roles/hr/documents/screens/DocumentCompliancePage"));
const DocumentRequestsPage = lazy(() => import("../roles/hr/documents/screens/DocumentRequestsPage"));
const DocumentEmailLogPage = lazy(() => import("../roles/hr/documents/screens/DocumentEmailLogPage"));
const DocumentAutomationPage = lazy(() => import("../roles/hr/documents/screens/DocumentAutomationPage"));
const TemplateLibraryPage = lazy(() => import("../roles/hr/documents/screens/TemplateLibraryPage"));
const DocumentSearchPage = lazy(() => import("../roles/hr/documents/screens/DocumentSearchPage"));
const ComplianceReportsPage = lazy(() => import("../roles/hr/documents/screens/ComplianceReportsPage"));
const DocumentExportsPage = lazy(() => import("../roles/hr/documents/screens/DocumentExportsPage"));
const TeamDocumentsPage = lazy(() => import("../roles/manager/documents/screens/TeamDocumentsPage"));
const OrgProposalsPage = lazy(() => import("../roles/manager/documents/screens/OrgProposalsPage"));
const TeamCompliancePage = lazy(() => import("../roles/manager/documents/screens/TeamCompliancePage"));
const TeamRequestsPage = lazy(() => import("../roles/manager/documents/screens/TeamRequestsPage"));

function CatchAll() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />;
}

/* ─── Protected Route ────────────────────────────────────────────────────────
   Waits for auth hydration before deciding to render or redirect.
   Prevents the catch-all from firing during the first render tick.
──────────────────────────────────────────────────────────────────────────── */
// Login URL that brings the user back to where they were after signing in.
const loginPathFrom = (location) =>
  `/auth/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

// Landing, auth and invitation pages don't need a session, so expiry leaves them alone.
const PUBLIC_PATH = /^\/(about|services|pricing|contact|legal|auth|invitation)?(\/|$)/;

/* ─── Session expiry ─────────────────────────────────────────────────────────
   When the session ends on its own (401 from the API or token past its expiry),
   send the user to login from any page that needs one, e.g. onboarding.
──────────────────────────────────────────────────────────────────────────── */
function SessionExpiryRedirect() {
  const { sessionExpired } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionExpired && !PUBLIC_PATH.test(location.pathname)) {
      navigate(loginPathFrom(location), { replace: true });
    }
  }, [sessionExpired, location, navigate]);

  return null;
}

function ProtectedRoute({ children, workspace }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // Auth still hydrating from localStorage — don't redirect yet
    return <Skeleton type="app" />;
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPathFrom(location)} replace />;
  }

  // Role dimension: keep signed-in users out of workspaces their role can't use
  // (e.g. an employee manually navigating to /dashboard/hr/*).
  // Only gate when the role is actually known — an unexpected/role-less token
  // would otherwise bounce to /dashboard and sit there forever. The backend
  // still authorizes every request, so failing open here is safe.
  if (workspace && role && !canAccessWorkspace(role, workspace)) {
    return <Navigate to={dashboardPathForRole(role)} replace />;
  }

  return children;
}

function AppRoutes() {
  
  return (
    <>
    <SessionExpiryRedirect />
    {/* A lazy route's chunk arrives after the click, so there is one frame with
        nothing to render. The app skeleton fills it — the same one the auth
        gate already uses, so a cold navigation and a slow auth check look the
        same rather than flashing two different loading states. */}
    <Suspense fallback={<Skeleton type="app" />}>
    <Routes>
      {/* ─── PUBLIC LANDING WEBSITE ROUTES ─── */}
      <Route path="/" element={<LandingLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<Services />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="contact" element={<Contact />} />

        {/* Legal — linked from the footer, the auth layout and the login page.
            Every one of these was an href="#" placeholder until now. */}
        <Route path="legal/privacy" element={<PrivacyPolicy />} />
        <Route path="legal/terms" element={<TermsOfService />} />
        <Route path="legal/cookies" element={<CookiePolicy />} />
        <Route path="legal/statutory" element={<StatutoryGuidelines />} />
      </Route>

      {/* ─── AUTHENTICATION ROUTES ─── */}
      <Route path="/auth" element={<AuthLayout />}>
        <Route index element={<Navigate to="/auth/login" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="otp" element={<OtpPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="select-org" element={<SelectOrgPage />} />
      </Route>

      {/* ─── ONBOARDING & SETUP WORKSPACE (Step 2) ─── */}
      <Route path="/onboarding" element={<GuestDashboard />} />
      <Route path="/setup-organization" element={<GuestDashboard />} />
      <Route path="/register-organization" element={<RegisterOrgPage />} />

      {/* ─── INVITATION ACCEPTANCE (standalone layout) ─── */}
      <Route path="/invitation/accept" element={<InvitationAcceptPage />} />

      {/* ─── STANDALONE DASHBOARDS (no sidebar shell) ─── */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard/guest" element={<ProtectedRoute><GuestDashboard /></ProtectedRoute>} />

      {/* ─── HR WORKSPACE ───
         The layout renders the sidebar once for the whole group, so navigating
         between these routes keeps its scroll position and expanded sections. */}
      <Route element={<ProtectedRoute workspace="hr"><DashboardLayout role="hr" /></ProtectedRoute>}>
        <Route path="/dashboard/hr" element={<HRDashboard />} />
        <Route path="/dashboard/hr/inbox" element={<HRInboxPage />} />
        <Route path="/dashboard/hr/employees" element={<EmployeesPage />} />
        <Route path="/dashboard/hr/employees/:userId" element={<EmployeeProfilePage />} />
        <Route path="/dashboard/hr/departments" element={<DepartmentsPage />} />
        <Route path="/dashboard/hr/departments/:departmentId" element={<DepartmentDetailPage />} />
        <Route path="/dashboard/hr/attendance/directory" element={<HRAttendancePage />} />
        <Route path="/dashboard/hr/attendance/policies" element={<AttendancePoliciesPage />} />
        <Route path="/dashboard/hr/attendance/shifts" element={<AttendanceShiftsPage />} />
        <Route path="/dashboard/hr/attendance/roster" element={<AttendanceRosterPage />} />
        <Route path="/dashboard/hr/attendance/regularizations" element={<AttendanceRegularizationsHRPage />} />
        <Route path="/dashboard/hr/attendance/holidays" element={<AttendanceHolidaysPage />} />
        <Route path="/dashboard/hr/attendance/weekly-offs" element={<AttendanceWeeklyOffsPage />} />
        <Route path="/dashboard/hr/attendance/locations" element={<AttendanceLocationsPage />} />
        <Route path="/dashboard/hr/attendance/comp-offs" element={<AttendanceCompOffsPage />} />
        <Route path="/dashboard/hr/attendance/comp-off-policies" element={<AttendanceCompOffPoliciesPage />} />
        <Route path="/dashboard/hr/attendance/lock-periods" element={<AttendanceLockPeriodsPage />} />
        <Route path="/dashboard/hr/attendance/devices" element={<BiometricDevicesPage />} />
        <Route path="/dashboard/hr/reports" element={<AttendanceReportsPage />} />
        {/* HR self-service attendance (all org roles may punch & request) */}
        <Route path="/dashboard/hr/my-attendance" element={<EmployeeAttendancePage />} />
        <Route path="/dashboard/hr/my-attendance/regularizations" element={<AttendanceRegularizationsPage />} />
        <Route path="/dashboard/hr/my-attendance/anomalies" element={<AttendanceAnomaliesPage />} />
        <Route path="/dashboard/hr/my-attendance/overtime" element={<EmployeeOvertimePage />} />
        <Route path="/dashboard/hr/my-attendance/comp-offs" element={<EmployeeCompOffsPage />} />
        <Route path="/dashboard/hr/leaves/requests" element={<HRLeaveRequestsPage />} />
        <Route path="/dashboard/hr/leaves/types" element={<LeaveTypesPage />} />
        <Route path="/dashboard/hr/leaves/policies" element={<LeavePoliciesPage />} />
        <Route path="/dashboard/hr/leaves/automation" element={<LeaveAutomationPage />} />

        {/* HR payroll */}
        <Route path="/dashboard/hr/payroll/components" element={<PayrollComponentsPage />} />
        <Route path="/dashboard/hr/payroll/templates" element={<PayrollTemplatesPage />} />
        <Route path="/dashboard/hr/payroll/employee-structures" element={<EmployeeSalaryStructuresPage />} />
        <Route path="/dashboard/hr/payroll/approvals" element={<PayrollApprovalsPage />} />
        <Route path="/dashboard/hr/payroll/settings" element={<PayrollSettingsPage />} />
        <Route path="/dashboard/hr/payroll/runs" element={<PayrollRunDashboard />} />
        <Route path="/dashboard/hr/payroll/runs/:runId" element={<PayrollRunDetailPage />} />
        <Route path="/dashboard/hr/payroll/adjustments" element={<PayrollAdjustmentsPage />} />
        <Route path="/dashboard/hr/payroll/encashments" element={<PayrollEncashmentsPage />} />
        <Route path="/dashboard/hr/payroll/exits" element={<PayrollExitsPage />} />
        <Route path="/dashboard/hr/payroll/arrears" element={<PayrollArrearsPage />} />
        <Route path="/dashboard/hr/payroll/automation" element={<PayrollAutomationPage />} />
        <Route path="/dashboard/hr/payroll/bonus-rules" element={<PayrollBonusRulesPage />} />
        <Route path="/dashboard/hr/payroll/loans" element={<PayrollLoansPage />} />
        <Route path="/dashboard/hr/payroll/bank-verification" element={<BankVerificationPage />} />
        <Route path="/dashboard/hr/payroll/audit-log" element={<PayrollAuditLogPage />} />
        <Route path="/dashboard/hr/payroll/statutory" element={<TaxConfigurationsPage />} />
        <Route path="/dashboard/hr/payroll/tax-declarations" element={<TaxDeclarationsPage />} />
        <Route path="/dashboard/hr/payroll/year-end" element={<YearEndClosurePage />} />
        <Route path="/dashboard/hr/payroll/reimbursements" element={<PayrollReimbursementsPage />} />
        <Route path="/dashboard/hr/payroll/benefits" element={<PayrollBenefitsPage />} />
        <Route path="/dashboard/hr/my-reimbursements" element={<MyReimbursementsPage />} />
        {/* HR self-service pay. `PUT /payroll/me/bank-account` is the only route
            that can create a bank account and it is self-scoped, so without this
            mount an HR user has no way to enter the account they are paid into. */}
        <Route path="/dashboard/hr/my-salary" element={<MySalaryPage />} />
        <Route path="/dashboard/hr/payroll/reports" element={<PayrollReportsPage />} />
        <Route path="/dashboard/hr/payroll/payslips" element={<PayrollPayslipsPage />} />
        <Route path="/dashboard/hr/payroll/exports" element={<PayrollExportsPage />} />

        {/* HR documents */}
        <Route path="/dashboard/hr/documents/verification" element={<DocumentVerificationPage />} />
        <Route path="/dashboard/hr/documents/employees" element={<EmployeeDocumentsPage />} />
        <Route path="/dashboard/hr/invites" element={<InvitesPage />} />
        <Route path="/dashboard/hr/documents/organisation" element={<OrgDocumentsPage />} />
        <Route path="/dashboard/hr/documents/compliance" element={<DocumentCompliancePage />} />
        <Route path="/dashboard/hr/documents/requests" element={<DocumentRequestsPage />} />
        <Route path="/dashboard/hr/documents/notifications" element={<DocumentEmailLogPage />} />
        <Route path="/dashboard/hr/documents/automation" element={<DocumentAutomationPage />} />
        <Route path="/dashboard/hr/documents/templates" element={<TemplateLibraryPage />} />
        <Route path="/dashboard/hr/documents/search" element={<DocumentSearchPage />} />
        <Route path="/dashboard/hr/documents/reports" element={<ComplianceReportsPage />} />
        <Route path="/dashboard/hr/documents/exports" element={<DocumentExportsPage />} />
        <Route path="/dashboard/hr/documents/types" element={<DocumentTypesPage />} />
        <Route path="/dashboard/hr/documents/settings" element={<DocumentSettingsPage />} />
        <Route path="/dashboard/hr/my-documents" element={<MyDocumentsPage />} />
        <Route path="/dashboard/hr/company-documents" element={<IssuedDocumentsPage />} />
        <Route path="/dashboard/hr/my-document-requests" element={<MyRequestsPage />} />
        <Route path="/dashboard/hr/my-documents/all" element={<AllMyDocumentsPage />} />
        <Route path="/dashboard/hr/forms" element={<FormsLibraryPage />} />
      </Route>

      {/* ─── MANAGER WORKSPACE ─── */}
      <Route element={<ProtectedRoute workspace="manager"><DashboardLayout role="manager" /></ProtectedRoute>}>
        <Route path="/dashboard/manager" element={<ManagerDashboard />} />
        <Route path="/dashboard/manager/attendance" element={<EmployeeAttendancePage />} />
        <Route path="/dashboard/manager/attendance/regularizations" element={<AttendanceRegularizationsPage />} />
        <Route path="/dashboard/manager/attendance/anomalies" element={<AttendanceAnomaliesPage />} />
        <Route path="/dashboard/manager/attendance/overtime" element={<EmployeeOvertimePage />} />
        <Route path="/dashboard/manager/attendance/comp-offs" element={<EmployeeCompOffsPage />} />
        <Route path="/dashboard/manager/requests/inbox" element={<ManagerApprovalsInbox />} />
        <Route path="/dashboard/manager/requests/regularizations" element={<ManagerRegularizationsPage />} />
        <Route path="/dashboard/manager/requests/overtime" element={<ManagerOvertimePage />} />
        <Route path="/dashboard/manager/requests/comp-offs" element={<ManagerCompOffsPage />} />
        <Route path="/dashboard/manager/requests/leaves" element={<ManagerLeavePage />} />
        <Route path="/dashboard/manager/team/today" element={<ManagerTeamPage />} />
        <Route path="/dashboard/manager/team/history" element={<ManagerTeamHistoryPage />} />
        <Route path="/dashboard/manager/team" element={<ManagerTeamRosterPage />} />
        <Route path="/dashboard/manager/team/member/:userId" element={<ManagerMemberProfilePage />} />
        {/* The page was called "Team Roster"; it is "Team" now, like HR's. */}
        <Route path="/dashboard/manager/team/roster" element={<Navigate to="/dashboard/manager/team" replace />} />
        <Route path="/dashboard/manager/team/anomalies" element={<ManagerAnomaliesPage />} />

        {/* Manager payroll */}
        <Route path="/dashboard/manager/payroll/team-salary" element={<TeamSalaryPage />} />
        <Route path="/dashboard/manager/payroll/team-payslips" element={<TeamPayslipsPage />} />
        <Route path="/dashboard/manager/payroll/reports" element={<TeamPayrollReportsPage />} />
        <Route path="/dashboard/manager/payroll/encashments" element={<TeamEncashmentsPage />} />
        <Route path="/dashboard/manager/payroll/adjustments" element={<ManagerAdjustmentsPage />} />
        <Route path="/dashboard/manager/payroll/reimbursements" element={<TeamReimbursementsPage />} />
        <Route path="/dashboard/manager/my-reimbursements" element={<MyReimbursementsPage />} />
        {/* Manager self-service pay — same reason as the HR mount above. */}
        <Route path="/dashboard/manager/my-salary" element={<MySalaryPage />} />
        {/* Manager documents */}
        <Route path="/dashboard/manager/documents" element={<TeamDocumentsPage />} />
        <Route path="/dashboard/manager/documents/proposals" element={<OrgProposalsPage />} />
        <Route path="/dashboard/manager/documents/compliance" element={<TeamCompliancePage />} />
        <Route path="/dashboard/manager/documents/requests" element={<TeamRequestsPage />} />
        <Route path="/dashboard/manager/my-documents" element={<MyDocumentsPage />} />
        <Route path="/dashboard/manager/company-documents" element={<IssuedDocumentsPage />} />
        <Route path="/dashboard/manager/my-document-requests" element={<MyRequestsPage />} />
        <Route path="/dashboard/manager/my-documents/all" element={<AllMyDocumentsPage />} />
        <Route path="/dashboard/manager/forms" element={<FormsLibraryPage />} />
      </Route>

      {/* ─── EMPLOYEE WORKSPACE ─── */}
      <Route element={<ProtectedRoute workspace="employee"><DashboardLayout role="employee" /></ProtectedRoute>}>
        <Route path="/dashboard/employee" element={<EmployeeDashboard />} />
        <Route path="/dashboard/employee/attendance" element={<EmployeeAttendancePage />} />
        <Route path="/dashboard/employee/attendance/regularizations" element={<AttendanceRegularizationsPage />} />
        <Route path="/dashboard/employee/attendance/anomalies" element={<AttendanceAnomaliesPage />} />
        <Route path="/dashboard/employee/attendance/overtime" element={<EmployeeOvertimePage />} />
        <Route path="/dashboard/employee/attendance/comp-offs" element={<EmployeeCompOffsPage />} />
        <Route path="/dashboard/employee/leaves" element={<LeaveDashboard />} />

        {/* Employee payroll */}
        <Route path="/dashboard/employee/payroll/my-salary" element={<MySalaryPage />} />
        <Route path="/dashboard/employee/payroll/my-payslips" element={<MyPayslipsPage />} />
        <Route path="/dashboard/employee/payroll/loans" element={<MyLoansAndAdvancesPage />} />
        <Route path="/dashboard/employee/payroll/tax" element={<MyTaxAndInvestmentsPage />} />
        <Route path="/dashboard/employee/payroll/reimbursements" element={<MyReimbursementsPage />} />
        <Route path="/dashboard/employee/documents" element={<MyDocumentsPage />} />
        <Route path="/dashboard/employee/company-documents" element={<IssuedDocumentsPage />} />
        <Route path="/dashboard/employee/document-requests" element={<MyRequestsPage />} />
        <Route path="/dashboard/employee/documents/all" element={<AllMyDocumentsPage />} />
        <Route path="/dashboard/employee/forms" element={<FormsLibraryPage />} />
      </Route>

      {/* ─── SHARED DASHBOARD PAGES (sidebar role comes from the signed-in user) ─── */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/dashboard/documents" element={<DocumentsPage />} />
        <Route path="/dashboard/profile" element={<MyProfilePage />} />
        <Route path="/dashboard/directory" element={<DirectoryPage />} />
      </Route>

      {/* ─── CATCH-ALL ─── */}
      <Route path="*" element={<CatchAll />} />
    </Routes>
    </Suspense>
    </>
  );
}

export default AppRoutes;
