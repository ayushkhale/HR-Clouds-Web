// ─────────────────────────────────────────────────────────────────────────────
// NotFoundPage.jsx — the 404. One column, one message, one way out.
//
// Always a standalone purple-and-white page, with no sidebar or top bar, for
// everyone (user decision, 2026-10-01: the 404 replaces the app shell).
//
// It is deliberately BARE (user decision, 2026-10-09). It used to be a
// "missing page report": a purple gradient card holding Maya, a speech
// bubble, an illustrated lost employee, a dotted trail, floating question
// marks and the requested address — then a second column with the search,
// suggestion chips and two buttons. All of that is decoration around a person
// who is already lost, and it made the one useful control compete with a
// cartoon. Everything that wasn't the message or the way out is gone.
//
// What remains, in the order someone needs it: the code, what happened, the
// search that fixes it, and two links out. Don't re-add art here.
//
// The search is the only part that earns its place, so it keeps its full
// behaviour. What it covers depends on who is looking (NotFoundRoute decides):
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
// No ⓘ help: every element here is ordinary (CLAUDE.md §10).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HiSearch, HiArrowLeft, HiSupport, HiArrowRight } from "react-icons/hi";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { dashboardPathForRole, workspaceForRole } from "../auth/permissions";
import { ORG_PATHS } from "../attendance/paths";
import { Reveal } from "../motion";
import { PUBLIC_PAGES, pagesInWorkspace, searchPages, workspacePages } from "./notFoundMeta";
import hrcloudsLogo from "../../assets/logo2.png";

const SEARCH_ID = "not-found-search";

export default function NotFoundPage({ signedIn = false }) {
  const { role } = useAuth();
  const { nav } = useSidebar() || {};
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const workspace = signedIn ? workspaceForRole(role) : null;
  const pages = useMemo(() => {
    if (!signedIn) return PUBLIC_PAGES;
    const published = pagesInWorkspace(nav?.items, workspace);
    return published.length ? published : workspacePages(workspace);
  }, [signedIn, nav, workspace]);
  const results = useMemo(() => searchPages(pages, query), [pages, query]);

  const homePath = signedIn ? dashboardPathForRole(role) : "/";
  const support = signedIn && (workspace === "employee" || workspace === "manager")
    ? { to: ORG_PATHS[workspace].company, label: "Contact HR Support" }
    : { to: "/contact", label: "Contact Support" };

  const onSubmit = (event) => {
    event.preventDefault();
    if (results[0]) navigate(results[0].path);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 flex flex-col">
      <header className="px-6 sm:px-10 py-6">
        <Link to={homePath} className="inline-block">
          <img src={hrcloudsLogo} alt="HR Clouds" className="h-9 w-auto object-contain" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-24">
        <Reveal priority variant="riseSmall" className="w-full max-w-xl">
          <p className="text-[120px] sm:text-[160px] font-bold leading-[0.8] tracking-tighter text-purple-600">404</p>

          <h1 className="mt-8 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            This page has gone missing
          </h1>
          <p className="mt-3 text-base text-slate-500 leading-relaxed">
            The link may be old, or the page may have moved.
          </p>

          <form onSubmit={onSubmit} className="mt-8" role="search">
            <label htmlFor={SEARCH_ID} className="sr-only">Search for a page</label>
            <div className="relative">
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                id={SEARCH_ID}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={signedIn ? "Search for a page" : "Search the site"}
                autoComplete="off"
                className="w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition"
              />
            </div>
          </form>

          <SearchResults query={query} results={results} />

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to={homePath}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-purple-700 transition-colors"
            >
              <HiArrowLeft className="w-4 h-4" /> Back to home
            </Link>
            <Link
              to={support.to}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-600 hover:border-purple-300 hover:text-purple-700 transition-colors"
            >
              <HiSupport className="w-4 h-4" /> {support.label}
            </Link>
          </div>
        </Reveal>
      </main>
    </div>
  );
}

/** Results appear only once something is typed — nothing to scan before that. */
function SearchResults({ query, results }) {
  if (!query.trim()) return null;

  if (!results.length) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Nothing matches “{query.trim()}”. Try a shorter word.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
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
