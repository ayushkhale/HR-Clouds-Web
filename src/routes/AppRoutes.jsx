import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import { canAccessWorkspace, dashboardPathForRole } from "../shared/auth/permissions";
import Skeleton from "../shared/components/Skeleton";
import DashboardLayout from "../shared/layouts/DashboardLayout";

// Landing Layout & Pages
import LandingLayout from "../landing/LandingLayout";
import Home from "../landing/pages/Home";
import About from "../landing/pages/About";
import Services from "../landing/pages/Services";
import PricingPage from "../landing/pages/Pricing";

// Auth Layout & Pages
import AuthLayout from "../auth/AuthLayout";
import LoginPage from "../auth/pages/LoginPage";
import RegisterPage from "../auth/pages/RegisterPage";
import OtpPage from "../auth/pages/OtpPage";
import ForgotPasswordPage from "../auth/pages/ForgotPasswordPage";
import SelectOrgPage from "../auth/pages/SelectOrgPage";

// Organization Registration (standalone layout)
import RegisterOrgPage from "../auth/pages/RegisterOrgPage";

// Invitation (standalone layout)
import InvitationAcceptPage from "../auth/pages/InvitationAcceptPage";

// Dashboards
import DashboardPage from "../roles/DashboardPage";
import GuestDashboard from "../roles/guest/screens/GuestDashboard";
import HRDashboard from "../roles/hr/screens/HRDashboard";
import EmployeesPage from "../roles/hr/screens/EmployeesPage";
import EmployeeProfilePage from "../roles/hr/screens/EmployeeProfilePage";
import DepartmentsPage from "../roles/hr/screens/DepartmentsPage";
import EmployeeDashboard from "../roles/employee/screens/EmployeeDashboard";
import EmployeeAttendancePage from "../roles/employee/screens/EmployeeAttendancePage";
import AttendanceRegularizationsPage from "../roles/employee/screens/AttendanceRegularizationsPage";
import AttendanceAnomaliesPage from "../roles/employee/screens/AttendanceAnomaliesPage";
import EmployeeOvertimePage from "../roles/employee/screens/EmployeeOvertimePage";
import EmployeeCompOffsPage from "../roles/employee/screens/EmployeeCompOffsPage";
import ManagerDashboard from "../roles/manager/screens/ManagerDashboard";
import ManagerRegularizationsPage from "../roles/manager/screens/ManagerRegularizationsPage";
import ManagerOvertimePage from "../roles/manager/screens/ManagerOvertimePage";
import ManagerTeamPage from "../roles/manager/screens/ManagerTeamPage";
import ManagerTeamHistoryPage from "../roles/manager/screens/ManagerTeamHistoryPage";
import ManagerTeamRosterPage from "../roles/manager/screens/ManagerTeamRosterPage";
import ManagerAnomaliesPage from "../roles/manager/screens/ManagerAnomaliesPage";
import ManagerApprovalsInbox from "../roles/manager/screens/ManagerApprovalsInbox";

// HR — Attendance
import HRAttendancePage from "../roles/hr/screens/HRAttendancePage";
import AttendancePoliciesPage from "../roles/hr/attendance/screens/AttendancePoliciesPage";
import AttendanceShiftsPage from "../roles/hr/attendance/screens/AttendanceShiftsPage";
import AttendanceRosterPage from "../roles/hr/attendance/screens/AttendanceRosterPage";
import AttendanceHolidaysPage from "../roles/hr/attendance/screens/AttendanceHolidaysPage";
import AttendanceWeeklyOffsPage from "../roles/hr/attendance/screens/AttendanceWeeklyOffsPage";
import AttendanceRegularizationsHRPage from "../roles/hr/attendance/screens/AttendanceRegularizationsHRPage";

// HR — Phase 5 & 6
import AttendanceLocationsPage from "../roles/hr/attendance/screens/AttendanceLocationsPage";
import AttendanceCompOffsPage from "../roles/hr/attendance/screens/AttendanceCompOffsPage";
import AttendanceCompOffPoliciesPage from "../roles/hr/attendance/screens/AttendanceCompOffPoliciesPage";
import AttendanceLockPeriodsPage from "../roles/hr/attendance/screens/AttendanceLockPeriodsPage";
import AttendanceReportsPage from "../roles/hr/attendance/screens/AttendanceReportsPage";
import BiometricDevicesPage from "../roles/hr/screens/BiometricDevicesPage";

// HR — Leave Management
import LeaveTypesPage from "../roles/hr/leaves/screens/LeaveTypesPage";
import LeavePoliciesPage from "../roles/hr/leaves/screens/LeavePoliciesPage";
import LeaveAutomationPage from "../roles/hr/leaves/screens/LeaveAutomationPage";
import HRLeaveRequestsPage from "../roles/hr/leaves/screens/HRLeaveRequestsPage";

// Employee — Leave
import LeaveDashboard from "../roles/employee/screens/LeaveDashboard";

// Manager — Leave
import ManagerLeavePage from "../roles/manager/screens/ManagerLeavePage";

// Manager — Phase 5
import ManagerCompOffsPage from "../roles/manager/screens/ManagerCompOffsPage";

// HR — Payroll
import PayrollComponentsPage from "../roles/hr/payroll/screens/PayrollComponentsPage";
import PayrollTemplatesPage from "../roles/hr/payroll/screens/PayrollTemplatesPage";
import EmployeeSalaryStructuresPage from "../roles/hr/payroll/screens/EmployeeSalaryStructuresPage";
import PayrollApprovalsPage from "../roles/hr/payroll/screens/PayrollApprovalsPage";
import PayrollSettingsPage from "../roles/hr/payroll/screens/PayrollSettingsPage";
import PayrollRunDashboard from "../roles/hr/payroll/screens/PayrollRunDashboard";
import PayrollRunDetailPage from "../roles/hr/payroll/screens/PayrollRunDetailPage";
import PayrollAdjustmentsPage from "../roles/hr/payroll/screens/PayrollAdjustmentsPage";
import PayrollBonusRulesPage from "../roles/hr/payroll/screens/PayrollBonusRulesPage";
import PayrollLoansPage from "../roles/hr/payroll/screens/PayrollLoansPage";
import TaxConfigurationsPage from "../roles/hr/payroll/screens/TaxConfigurationsPage";
import TaxDeclarationsPage from "../roles/hr/payroll/screens/TaxDeclarationsPage";
import YearEndClosurePage from "../roles/hr/payroll/screens/YearEndClosurePage";
import BenefitsAndReimbursementsPage from "../roles/hr/payroll/screens/BenefitsAndReimbursementsPage";
import PayrollReportsPage from "../roles/hr/payroll/screens/PayrollReportsPage";
import BankVerificationPage from "../roles/hr/payroll/screens/BankVerificationPage";
import PayrollAuditLogPage from "../roles/hr/payroll/screens/PayrollAuditLogPage";

// Manager — Payroll
import TeamSalaryPage from "../roles/manager/payroll/screens/TeamSalaryPage";
import TeamPayslipsPage from "../roles/manager/payroll/screens/TeamPayslipsPage";
import ManagerAdjustmentsPage from "../roles/manager/payroll/screens/ManagerAdjustmentsPage";
import TeamReimbursementsPage from "../roles/manager/payroll/screens/TeamReimbursementsPage";

// Employee — Payroll
import MySalaryPage from "../roles/employee/payroll/screens/MySalaryPage";
import MyPayslipsPage from "../roles/employee/payroll/screens/MyPayslipsPage";
import MyLoansAndAdvancesPage from "../roles/employee/payroll/screens/MyLoansAndAdvancesPage";
import MyTaxAndInvestmentsPage from "../roles/employee/payroll/screens/MyTaxAndInvestmentsPage";
import MyReimbursementsPage from "../roles/employee/payroll/screens/MyReimbursementsPage";

// Shared Screens
import DocumentsPage from "../shared/screens/DocumentsPage";
import MyProfilePage from "../shared/screens/MyProfilePage";
import DirectoryPage from "../shared/screens/DirectoryPage";

function CatchAll() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />;
}

/* ─── Protected Route ────────────────────────────────────────────────────────
   Waits for auth hydration before deciding to render or redirect.
   Prevents the catch-all from firing during the first render tick.
──────────────────────────────────────────────────────────────────────────── */
function ProtectedRoute({ children, workspace }) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    // Auth still hydrating from localStorage — don't redirect yet
    return <Skeleton type="app" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
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
    <Routes>
      {/* ─── PUBLIC LANDING WEBSITE ROUTES ─── */}
      <Route path="/" element={<LandingLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<Services />} />
        <Route path="pricing" element={<PricingPage />} />
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
        <Route path="/dashboard/hr/employees" element={<EmployeesPage />} />
        <Route path="/dashboard/hr/employees/:userId" element={<EmployeeProfilePage />} />
        <Route path="/dashboard/hr/departments" element={<DepartmentsPage />} />
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
        <Route path="/dashboard/hr/payroll/bonus-rules" element={<PayrollBonusRulesPage />} />
        <Route path="/dashboard/hr/payroll/loans" element={<PayrollLoansPage />} />
        <Route path="/dashboard/hr/payroll/bank-verification" element={<BankVerificationPage />} />
        <Route path="/dashboard/hr/payroll/audit-log" element={<PayrollAuditLogPage />} />
        <Route path="/dashboard/hr/payroll/statutory" element={<TaxConfigurationsPage />} />
        <Route path="/dashboard/hr/payroll/tax-declarations" element={<TaxDeclarationsPage />} />
        <Route path="/dashboard/hr/payroll/year-end" element={<YearEndClosurePage />} />
        <Route path="/dashboard/hr/payroll/benefits" element={<BenefitsAndReimbursementsPage />} />
        <Route path="/dashboard/hr/payroll/reports" element={<PayrollReportsPage />} />
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
        <Route path="/dashboard/manager/team/roster" element={<ManagerTeamRosterPage />} />
        <Route path="/dashboard/manager/team/anomalies" element={<ManagerAnomaliesPage />} />

        {/* Manager payroll */}
        <Route path="/dashboard/manager/payroll/team-salary" element={<TeamSalaryPage />} />
        <Route path="/dashboard/manager/payroll/team-payslips" element={<TeamPayslipsPage />} />
        <Route path="/dashboard/manager/payroll/adjustments" element={<ManagerAdjustmentsPage />} />
        <Route path="/dashboard/manager/payroll/reimbursements" element={<TeamReimbursementsPage />} />
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
  );
}

export default AppRoutes;
