import React from "react";
import { Link, Outlet, NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";
import hrcloudsLogo from "../assets/logo2.png";

// ── Left panel — Photo with right-fade blend ─────────────────────────────────
function BrandPanel() {
  const VIDEO = "https://www.pexels.com/download/video/8034431/";

  return (
    <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-slate-900">
      {/* Full-cover background video */}
      <video
        src={VIDEO}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover object-center"
      />

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
          <a href="#" className="text-purple-600 hover:underline">Terms & Conditions</a>
          &nbsp;|&nbsp;
          <a href="#" className="text-purple-600 hover:underline">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
