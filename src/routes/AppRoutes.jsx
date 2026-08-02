import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";

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
import EmployeeDashboard from "../roles/employee/screens/EmployeeDashboard";
import ManagerDashboard from "../roles/manager/screens/ManagerDashboard";

// HR — Attendance
import AttendancePoliciesPage from "../roles/hr/attendance/screens/AttendancePoliciesPage";
import AttendanceShiftsPage from "../roles/hr/attendance/screens/AttendanceShiftsPage";
import AttendanceRosterPage from "../roles/hr/attendance/screens/AttendanceRosterPage";
import AttendanceHolidaysPage from "../roles/hr/attendance/screens/AttendanceHolidaysPage";
import AttendanceWeeklyOffsPage from "../roles/hr/attendance/screens/AttendanceWeeklyOffsPage";

/* ─── Protected Route ────────────────────────────────────────────────────────
   Waits for auth hydration before deciding to render or redirect.
   Prevents the catch-all from firing during the first render tick.
──────────────────────────────────────────────────────────────────────────── */
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Auth still hydrating from localStorage — don't redirect yet
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
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

      {/* ─── DASHBOARDS (role-based) ─── */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard/guest" element={<ProtectedRoute><GuestDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/hr" element={<ProtectedRoute><HRDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/hr/employees" element={<ProtectedRoute><EmployeesPage /></ProtectedRoute>} />
      <Route path="/dashboard/hr/attendance/policies" element={<ProtectedRoute><AttendancePoliciesPage /></ProtectedRoute>} />
      <Route path="/dashboard/hr/attendance/shifts" element={<ProtectedRoute><AttendanceShiftsPage /></ProtectedRoute>} />
      <Route path="/dashboard/hr/attendance/roster" element={<ProtectedRoute><AttendanceRosterPage /></ProtectedRoute>} />
      <Route path="/dashboard/hr/attendance/holidays" element={<ProtectedRoute><AttendanceHolidaysPage /></ProtectedRoute>} />
      <Route path="/dashboard/hr/attendance/weekly-offs" element={<ProtectedRoute><AttendanceWeeklyOffsPage /></ProtectedRoute>} />
      <Route path="/dashboard/employee" element={<ProtectedRoute><EmployeeDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/manager" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />

      {/* ─── CATCH-ALL ─── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
