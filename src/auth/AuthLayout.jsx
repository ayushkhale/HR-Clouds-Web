import { useState, useEffect } from "react";
import { Link, Navigate, Outlet, NavLink, useSearchParams } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import { useReducedMotion } from "../shared/motion";
import { safeRedirect } from "./redirect";
import hrcloudsLogo from "../assets/logo2.png";

/* The brand video.
   Points at the CDN file directly rather than pexels.com/download/video/...,
   which is a redirect that sets cookies on every load.

   This is the 4K (2160x3840) rendition, 13MB. It is the sharpest the panel can
   look on a high-DPI display. It is also heavy for a login screen, so it is
   held behind the save-data check below and faded in only once it can play —
   the gradient carries the panel until then, and on a metered or slow
   connection the video is never requested at all. If first paint on the login
   screen ever needs to get cheaper, the same clip exists as
   `-hd_1080_1920_25fps.mp4` (2.7MB). */
const BRAND_VIDEO =
  "https://videos.pexels.com/video-files/8034431/8034431-uhd_2160_3840_25fps.mp4";

/* The dots under the tagline used to be four hard-coded pips with the first
   one permanently active — a carousel control for a carousel that did not
   exist. They now step through these. */
const TAGLINES = [
  { lead: "HR & Payroll,", accent: "simplified", tail: "for modern Indian teams.", sub: "Trusted by 100+ companies across India" },
  { lead: "Payroll that files", accent: "on time", tail: "every single month.", sub: "PF, ESI, professional tax and TDS, computed for you" },
  { lead: "Attendance,", accent: "without", tail: "the spreadsheet.", sub: "Shifts, leave, overtime and corrections in one place" },
  { lead: "Every document,", accent: "verified", tail: "and in one vault.", sub: "Role-scoped access, with confidential files kept private" },
];

const TAGLINE_MS = 6000;

// ── Left panel — Video with gradient underlay ────────────────────────────────
function BrandPanel() {
  const reducedMotion = useReducedMotion();
  const [videoReady, setVideoReady] = useState(false);
  const [slide, setSlide] = useState(0);

  // Hold on the first line when motion is reduced rather than swapping copy
  // out from under someone.
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => setSlide((i) => (i + 1) % TAGLINES.length), TAGLINE_MS);
    return () => clearInterval(id);
  }, [reducedMotion]);

  // A moving background is decoration, so it is not worth a single byte to
  // someone who asked for reduced motion, or to a connection the browser has
  // flagged as metered or slow.
  const saveData =
    typeof navigator !== "undefined" &&
    (navigator.connection?.saveData ||
      /2g/.test(navigator.connection?.effectiveType || ""));
  const showVideo = !reducedMotion && !saveData;

  return (
    <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-[#1a0b2e]">
      {/* Gradient underlay. Always painted, so the panel is on-brand from the
          first frame and stays that way if the video is slow, blocked or
          fails — no black rectangle while the network catches up. */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#2b0f4d] via-[#4c1d95] to-[#1a0b2e]" />
      <div className="absolute -top-24 -left-24 w-[34rem] h-[34rem] rounded-full bg-purple-500/25 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-8rem] right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-fuchsia-500/20 blur-[110px] pointer-events-none" />

      {showVideo && (
        <video
          src={BRAND_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          // Decorative: it carries no information the form needs, and it has
          // no audio track to announce.
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoReady(false)}
          // Pulled back off full saturation so the footage sits under the
          // purple grade below instead of fighting it — raw, it reads as warm
          // stock photography next to an otherwise violet product.
          style={{ filter: "saturate(0.8) contrast(1.06)" }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
            videoReady ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* Purple grade over the footage: ties it to the brand, and holds the
          contrast for the white tagline and the back button whatever frame
          happens to be on screen. */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#3b0f6b]/40 via-[#4c1d95]/20 to-[#1a0b2e]/55 pointer-events-none" />

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
            "linear-gradient(to top, rgba(26,11,46,0.92) 0%, rgba(43,15,77,0.6) 32%, transparent 62%)",
        }}
      />

      {/* Bottom tagline */}
      <div className="relative z-10 mt-auto w-full px-10 pb-10">
        {/* Fixed height for the copy block: the lines differ in length, and
            without a floor the dots below would jump as they cycle. */}
        <div className="relative h-[7.5rem]">
          {TAGLINES.map((t, i) => (
            <div
              key={i}
              aria-hidden={i !== slide}
              className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
                i === slide
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2 pointer-events-none"
              }`}
            >
              <p className="text-white font-bold text-2xl leading-snug mb-2">
                {t.lead} <span className="text-purple-300">{t.accent}</span>
                <br />
                {t.tail}
              </p>
              <p className="text-white/75 text-sm">{t.sub}</p>
            </div>
          ))}
        </div>

        {/* Real controls now — they show and set the current line. */}
        <div className="flex gap-1.5 mt-5">
          {TAGLINES.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlide(i)}
              aria-label={`Show message ${i + 1} of ${TAGLINES.length}`}
              aria-current={i === slide}
              className={`block rounded-full transition-[width,background-color] duration-300 ease-out hover:bg-white/70 ${
                i === slide ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"
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
        {/* Extra bottom clearance on small screens: the floating "Ask Maya"
            pill is fixed to the bottom-right and was sitting on top of the
            Privacy Policy link — the one people are being asked to read. */}
        <div className="mt-auto pt-10 pb-16 sm:pb-0 text-center text-[11px] text-gray-400">
          <Link to="/legal/terms" className="text-purple-600 hover:underline">Terms & Conditions</Link>
          &nbsp;|&nbsp;
          <Link to="/legal/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
