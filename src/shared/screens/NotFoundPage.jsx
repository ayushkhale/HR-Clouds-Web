// ─────────────────────────────────────────────────────────────────────────────
// NotFoundPage.jsx — the 404, framed as a "missing page report": Maya (the
// in-app assistant, our mascot) reports the page lost, a confused employee
// studies a map, and a search box finds the page they meant.
//
// Always a standalone purple-and-white page, with no sidebar or top bar, for
// everyone (user decision, 2026-10-01: Maya's report replaces the app shell).
// What the search covers depends on who is looking (NotFoundRoute decides):
// • signedIn — pages in their own workspace only: the full menu the sidebar
//   published to SidebarContext earlier in the visit (filtered to their
//   workspace, since it outlives the sidebar), else workspacePages() when the
//   404 is the first page they opened. Never another workspace's page — the
//   route gate would bounce it (CLAUDE.md §2).
// • signed out (or guest) — the public site (PUBLIC_PAGES).
//
// "Contact HR Support" goes to Company Profile for employees and managers,
// which lists their HR contacts; HR itself and visitors get HR Clouds support
// on /contact instead — sending HR to "contact HR" would be a loop.
// The requested address is shown with ids masked (CLAUDE.md §4).
// No ⓘ help: every element here is ordinary (CLAUDE.md §10).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HiSearch, HiArrowLeft, HiSupport, HiArrowRight, HiLocationMarker } from "react-icons/hi";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { dashboardPathForRole, workspaceForRole } from "../auth/permissions";
import { ORG_PATHS } from "../attendance/paths";
import { Reveal } from "../motion";
import { PUBLIC_PAGES, displayAddress, pagesInWorkspace, searchPages, workspacePages } from "./notFoundMeta";
import hrcloudsLogo from "../../assets/logo2.png";

const SEARCH_ID = "not-found-search";

export default function NotFoundPage({ signedIn = false }) {
  const { role } = useAuth();
  const { nav } = useSidebar() || {};
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const workspace = signedIn ? workspaceForRole(role) : null;
  const pages = useMemo(() => {
    if (!signedIn) return PUBLIC_PAGES;
    const published = pagesInWorkspace(nav?.items, workspace);
    return published.length ? published : workspacePages(workspace);
  }, [signedIn, nav, workspace]);
  const results = useMemo(() => searchPages(pages, query), [pages, query]);
  // Shown before anything is typed: the first few places in their own menu.
  const suggestions = useMemo(() => pages.filter((page) => page.label !== "Inbox").slice(0, 4), [pages]);

  const homePath = signedIn ? dashboardPathForRole(role) : "/";
  const support = signedIn && (workspace === "employee" || workspace === "manager")
    ? { to: ORG_PATHS[workspace].company, label: "Contact HR Support" }
    : { to: "/contact", label: "Contact HR Clouds Support" };

  const onSubmit = (event) => {
    event.preventDefault();
    if (results[0]) navigate(results[0].path);
  };

  const body = (
    <div className="w-full grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-center">
      {/* The report: Maya, the illustration and where they were heading */}
      <Reveal priority variant="scale" className="relative min-w-0">
        <div className="relative rounded-[28px] bg-gradient-to-br from-purple-600 via-violet-600 to-purple-800 p-6 sm:p-8 overflow-hidden shadow-xl shadow-purple-900/20">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-purple-300/20 blur-3xl pointer-events-none" />

          <div className="relative flex items-start gap-3">
            <img src="/maya_avatar.jpg" alt="Maya" className="w-12 h-12 rounded-2xl object-cover object-top ring-2 ring-white/40 shrink-0" />
            <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-lg">
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600">Missing page report</p>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                I checked every department and every floor, but this page isn’t anywhere. Tell me what you were after and I’ll point the way.
              </p>
            </div>
          </div>

          <LostEmployeeArt className="relative w-full max-w-md mx-auto mt-4" />

          <div className="relative mt-2 flex items-center justify-center gap-2 text-purple-100 text-xs">
            <HiLocationMarker className="w-4 h-4 shrink-0" />
            <span>Last seen heading to</span>
            <code className="px-2 py-0.5 rounded-md bg-white/15 text-white font-mono truncate max-w-[60%]">{displayAddress(pathname)}</code>
          </div>
        </div>
      </Reveal>

      {/* What to do about it */}
      <Reveal priority variant="riseSmall" delay={120} className="min-w-0">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-purple-600">Error 404</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">This page has gone missing</h1>
        <p className="mt-3 text-base text-slate-500 leading-relaxed">
          The link may be old, or the page may have moved. Search for it below, or head back to where you started.
        </p>

        <form onSubmit={onSubmit} className="mt-6" role="search">
          <label htmlFor={SEARCH_ID} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Search for a page</label>
          <div className="relative mt-1.5">
            <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400 pointer-events-none" />
            <input
              id={SEARCH_ID}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={signedIn ? "Try “payslips”, “leave” or “departments”" : "Try “pricing” or “sign in”"}
              autoComplete="off"
              className="w-full rounded-2xl border border-purple-200 bg-white pl-12 pr-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100"
            />
          </div>
        </form>

        <SearchResults query={query} results={results} suggestions={suggestions} />

        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <Link
            to={homePath}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-purple-600/25 hover:bg-purple-700 transition-colors"
          >
            <HiArrowLeft className="w-4 h-4" /> Find My Way Back
          </Link>
          <Link
            to={support.to}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-purple-200 bg-white px-6 py-3 text-sm font-bold text-purple-700 hover:border-purple-400 hover:bg-purple-50 transition-colors"
          >
            <HiSupport className="w-4 h-4" /> {support.label}
          </Link>
        </div>
      </Reveal>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F7FB] font-sans text-slate-800 flex flex-col">
      <header className="px-4 sm:px-8 py-5 max-w-7xl w-full mx-auto">
        <Link to={homePath} className="inline-block">
          <img src={hrcloudsLogo} alt="HR Clouds" className="h-10 w-auto object-contain" />
        </Link>
      </header>
      <main className="flex-1 flex items-start lg:items-center px-4 sm:px-8 pt-2 pb-12 max-w-7xl w-full mx-auto">{body}</main>
    </div>
  );
}

function SearchResults({ query, results, suggestions }) {
  if (!query.trim()) {
    if (!suggestions.length) return null;
    return (
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-400">Popular places</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="rounded-full border border-purple-100 bg-purple-50 px-3.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors"
            >
              {page.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!results.length) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-purple-200 bg-white px-4 py-3 text-sm text-slate-500">
        Nothing matches “{query.trim()}”. Try a shorter word, or use Find My Way Back below.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-purple-50 rounded-2xl border border-purple-100 bg-white shadow-sm overflow-hidden">
      {results.map((page) => (
        <li key={page.path}>
          <Link to={page.path} className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-purple-50 transition-colors">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800 truncate">{page.label}</span>
              {page.section && <span className="block text-xs text-slate-400 truncate">{page.section}</span>}
            </span>
            <HiArrowRight className="w-4 h-4 text-purple-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A confused employee holding a map beside a wandering trail — purple and white only. */
function LostEmployeeArt({ className = "" }) {
  return (
    <svg viewBox="0 0 400 300" className={className} role="img" aria-label="An employee looking at a map, unsure where the page went">
      {/* ground glow */}
      <ellipse cx="200" cy="262" rx="150" ry="18" fill="#FFFFFF" opacity="0.12" />

      {/* wandering dotted trail ending in a question pin */}
      <path d="M40 250 C 90 210, 60 170, 120 160 S 170 110, 140 80 S 250 40, 300 70" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
      <g transform="translate(300 32)">
        <path d="M0 0 C -14 0 -24 10 -24 24 C -24 42 0 62 0 62 C 0 62 24 42 24 24 C 24 10 14 0 0 0 Z" fill="#FFFFFF" />
        <text x="0" y="33" textAnchor="middle" fontSize="26" fontWeight="700" fill="#6D28D9" fontFamily="Inter, Arial, sans-serif">?</text>
      </g>

      {/* floating question marks */}
      <text x="250" y="128" fontSize="30" fontWeight="700" fill="#FFFFFF" opacity="0.85" fontFamily="Inter, Arial, sans-serif">?</text>
      <text x="272" y="104" fontSize="18" fontWeight="700" fill="#DDD6FE" fontFamily="Inter, Arial, sans-serif">?</text>

      {/* the employee */}
      <g transform="translate(150 118)">
        {/* legs */}
        <rect x="26" y="96" width="14" height="44" rx="7" fill="#3B0764" />
        <rect x="50" y="96" width="14" height="44" rx="7" fill="#3B0764" />
        <ellipse cx="31" cy="141" rx="12" ry="5" fill="#1E1033" />
        <ellipse cx="59" cy="141" rx="12" ry="5" fill="#1E1033" />
        {/* body */}
        <path d="M14 58 C 14 40, 30 32, 45 32 C 60 32, 76 40, 76 58 L 76 104 L 14 104 Z" fill="#FFFFFF" />
        <path d="M45 32 L 38 52 L 45 60 L 52 52 Z" fill="#C4B5FD" />
        {/* lanyard badge */}
        <rect x="52" y="64" width="14" height="18" rx="3" fill="#EDE9FE" stroke="#A78BFA" strokeWidth="1.5" />
        {/* head */}
        <circle cx="45" cy="16" r="20" fill="#EDE9FE" />
        <path d="M25 14 C 25 -2, 40 -8, 52 -4 C 62 -1, 67 6, 65 14 C 58 8, 46 6, 25 14 Z" fill="#3B0764" />
        {/* puzzled face */}
        <circle cx="38" cy="18" r="2.2" fill="#3B0764" />
        <circle cx="52" cy="18" r="2.2" fill="#3B0764" />
        <path d="M37 11 L 42 12" stroke="#3B0764" strokeWidth="2" strokeLinecap="round" />
        <path d="M49 10 L 55 8" stroke="#3B0764" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 27 C 43 25, 47 29, 51 26" fill="none" stroke="#3B0764" strokeWidth="2" strokeLinecap="round" />
        {/* scratching-head arm */}
        <path d="M70 50 C 86 36, 82 14, 66 8" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
        {/* map in the other hand */}
        <path d="M20 56 C 6 66, -2 74, -14 78" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
        <g transform="translate(-74 56) rotate(-8)">
          <path d="M0 6 L 22 0 L 44 6 L 66 0 L 66 52 L 44 58 L 22 52 L 0 58 Z" fill="#FFFFFF" />
          <path d="M22 0 L 22 52 M44 6 L 44 58" stroke="#DDD6FE" strokeWidth="2" />
          <path d="M8 40 C 18 30, 26 44, 36 30 S 52 24, 58 16" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
          <circle cx="58" cy="16" r="4" fill="#7C3AED" />
        </g>
      </g>
    </svg>
  );
}
