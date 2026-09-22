import React from "react";
import { Link, Navigate, Outlet, NavLink, useSearchParams } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import { safeRedirect } from "./redirect";
import hrcloudsLogo from "../assets/logo2.png";

// ── Left panel — Photo with right-fade blend ─────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-[#1a0b2e]">
      {/* Brand field. Replaced a <video> pointed at a Pexels download URL —
          that endpoint redirects rather than serving a file, so it rendered as
          a black rectangle and hotlinked a third party's bandwidth when it
          didn't. Drop a self-hosted mp4 in here if a moving background is
          wanted later. */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2b0f4d] via-[#4c1d95] to-[#1a0b2e]" />
      <div className="absolute -top-24 -left-24 w-[34rem] h-[34rem] rounded-full bg-purple-500/25 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-8rem] right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-fuchsia-500/20 blur-[110px] pointer-events-none" />

      {/* Top Left: Back arrow to landing page */}
      <Link
        to="/"
        className="absolute top-6 left-6 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-sm transition-all border border-white/10"
        title="Back to home"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

      {/* Bottom dark scrim — so tagline text stays readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(60,20,100,0.82) 0%, rgba(60,20,100,0.4) 28%, transparent 55%)",
        }}
      />

      {/* Bottom tagline */}
      <div className="relative z-10 mt-auto w-full px-10 pb-10">
        <p className="text-white font-bold text-2xl leading-snug mb-2">
          HR & Payroll,{" "}
          <span className="text-purple-300">simplified</span>
          <br />for modern Indian teams.
        </p>
        <p className="text-white/55 text-sm">
          Trusted by 100+ companies across India
        </p>

        {/* Carousel dots */}
        <div className="flex gap-1.5 mt-5">
          {[true, false, false, false].map((active, i) => (
            <span
              key={i}
              className={`block rounded-full transition-all ${
                active ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function AuthLayout() {
  const location = useLocation();
  const isLogin = location.pathname === "/auth/login";
  const isRegister = location.pathname === "/auth/register";
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading, getDashboardPath } = useAuth();

  // Persistent login: an already signed-in user skips the sign-in / sign-up forms.
  if (!isLoading && isAuthenticated && (isLogin || isRegister)) {
    return <Navigate to={safeRedirect(searchParams.get("redirect")) || getDashboardPath()} replace />;
  }

  return (
    <div className="min-h-screen flex font-sans bg-white">
      {/* Left — Purple branded panel */}
      <BrandPanel />

      {/* Right — White form panel */}
      <div className="flex flex-col w-full lg:w-[48%] px-8 sm:px-12 xl:px-16 py-8 min-h-screen">
        {/* Top: Logo + Sign In / Sign Up toggle */}
        <div className="flex items-center justify-between mb-auto pb-10">
          <Link to="/">
            <img src={hrcloudsLogo} alt="HR Clouds" className="h-10 w-auto object-contain" />
          </Link>

          {/* Show tab switcher only on login / register */}
          {(isLogin || isRegister) && (
            <div className="flex bg-gray-100 rounded-xl p-1 text-sm font-medium">
              <NavLink
                to="/auth/login"
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-lg transition-all ${isActive ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`
                }
              >
                Sign In
              </NavLink>
              <NavLink
                to="/auth/register"
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-lg transition-all ${isActive ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`
                }
              >
                Sign Up
              </NavLink>
            </div>
          )}
        </div>

        {/* Centered form area */}
        <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
          <Outlet />
        </div>

        {/* Footer */}
        <div className="mt-auto pt-10 text-center text-[11px] text-gray-400">
          <Link to="/legal/terms" className="text-purple-600 hover:underline">Terms & Conditions</Link>
          &nbsp;|&nbsp;
          <Link to="/legal/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
