import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

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
import EmployeeDashboard from "../roles/employee/screens/EmployeeDashboard";
import ManagerDashboard from "../roles/manager/screens/ManagerDashboard";

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
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/dashboard/guest" element={<GuestDashboard />} />
      <Route path="/dashboard/hr" element={<HRDashboard />} />
      <Route path="/dashboard/employee" element={<EmployeeDashboard />} />
      <Route path="/dashboard/manager" element={<ManagerDashboard />} />

      {/* ─── CATCH-ALL ─── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
