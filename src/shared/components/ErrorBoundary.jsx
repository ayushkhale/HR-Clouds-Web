// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary — the app's last line against a white screen.
//
// Every workspace screen is a lazy route (AppRoutes.jsx). Two things used to
// blank the whole app with nothing on screen and only a console error:
//   1. A render-time crash in a page (e.g. a ReferenceError) — React unmounts
//      the entire tree when nothing catches it.
//   2. A stale lazy chunk after a deploy: the open tab still asks for the old
//      hashed filename, which no longer exists, and the dynamic import rejects
//      with a ChunkLoadError.
// A boundary turns both into a recoverable page instead of a blank one.
//
// It sits INSIDE the router (App.jsx) and resets itself when the path changes,
// so navigating away from a broken page clears the error without a reload — the
// white-screen-on-navigation report. A fresh deploy's chunk failure is retried
// once automatically (a reload fetches the new filenames); a loop is prevented
// by a one-shot sessionStorage guard, after which the person gets a manual
// Reload button rather than an endless refresh.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { useLocation } from "react-router-dom";
import { HiExclamationCircle, HiRefresh, HiHome } from "react-icons/hi";

const RELOAD_GUARD = "hrclouds_chunk_reload";

// A stale-chunk failure, told apart from an ordinary crash: only this one is
// fixed by fetching the page again, so only this one auto-reloads.
function isChunkError(error) {
  if (!error) return false;
  const name = error.name || "";
  const message = error.message || "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  );
}

class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // A deploy swapped the chunk filenames under an open tab. Reload once to
    // fetch the new ones; the guard stops a reload loop if it wasn't that.
    if (isChunkError(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_GUARD)) {
          sessionStorage.setItem(RELOAD_GUARD, "1");
          window.location.reload();
          return;
        }
      } catch {
        /* storage blocked — fall through to the manual recovery screen */
      }
    }
    // Keep the trace: the boundary hides the crash from the user, not from us.
    console.error("Caught by ErrorBoundary:", error);
  }

  componentDidUpdate(prevProps) {
    // Moving to another page clears the error, so a single broken screen never
    // traps the person on it — they navigate away and the app recovers.
    if (this.state.error && prevProps.pathname !== this.props.pathname) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkError(error);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
          <span className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-5">
            <HiExclamationCircle className="w-7 h-7" />
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            {chunk ? "A new version is ready" : "This page hit a snag"}
          </h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {chunk
              ? "The app was updated while this tab was open. Reload to pick up the latest version."
              : "Something on this page stopped working. This usually clears up on its own — reload the page, or head back to your dashboard and try again."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-7">
            <button
              type="button"
              onClick={() => {
                try { sessionStorage.removeItem(RELOAD_GUARD); } catch { /* ignore */ }
                window.location.reload();
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 transition shadow-md shadow-purple-200"
            >
              <HiRefresh className="w-4 h-4" /> Reload page
            </button>
            <a
              href="/dashboard"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition"
            >
              <HiHome className="w-4 h-4" /> Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

// The boundary has to be a class (only a class can catch render errors), but it
// needs the current path to reset itself. This thin wrapper feeds it in.
export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundaryInner pathname={pathname}>{children}</ErrorBoundaryInner>;
}
