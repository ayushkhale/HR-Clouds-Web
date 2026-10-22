// ─────────────────────────────────────────────────────────────────────────────
// useSetupChecklist.js — The one reader of GET /organizations/setup-checklist,
// shared by the dashboard card and the full setup page.
//
// ─── THERE IS NO QUERY CACHE HERE ───────────────────────────────────────────
// The integration guide reaches for React Query and
// `invalidateQueries(['organization','setup-checklist'])`. This app has no
// query cache at all and no React Query dependency (§7), so the house pattern
// stands in for it:
//   · a request-token ref, so a slow first read can't overwrite a fast second;
//   · a read on mount — and navigating back to the dashboard or the setup page
//     remounts, which is exactly the moment the guide wanted an invalidation;
//   · ATTENDANCE_EVENTS.CONFIG, which the shift and policy writers already
//     emit, so creating a shift updates the checklist with no reload;
//   · a visibility re-read, for the tab that was left open while the work was
//     done in another one.
// Creating a department, a leave type or a salary component emits nothing, so
// those rely on the mount read and the explicit "Re-check now" — which is the
// honest story and why that button exists at all.
//
// ─── FOUR STATES, NOT A BOOLEAN ─────────────────────────────────────────────
// "loading" · "ready" · "unavailable" (not HR, or a server without this
// endpoint) · "error". A failed read must never read as "nothing left to set
// up" (§7), and the two surfaces want different things from the same failure:
// the dashboard card shows nothing at all, while the page — which somebody
// reached on purpose — says so plainly.
//
// `recheck` is NOT called on mount. It re-evaluates all 22 tasks against the
// domain tables and persists the result, so it belongs to a press.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { organizationAPI } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { isHRAdmin } from "../auth/permissions";
import { ATTENDANCE_EVENTS, useAttendanceChanged } from "../attendance/events";
import { normalizeChecklist } from "./setupChecklistMeta.js";

/** Below this, a re-read on tab focus is just noise. */
const STALE_AFTER_MS = 60_000;

export default function useSetupChecklist() {
  const { user, orgId } = useAuth();
  const isHR = isHRAdmin(user?.role);

  const [checklist, setChecklist] = useState(null);
  const [state, setState] = useState(isHR ? "loading" : "unavailable");
  const [error, setError] = useState(null);
  const [rechecking, setRechecking] = useState(false);
  const reqId = useRef(0);
  const loadedAt = useRef(0);

  const read = useCallback(async (recheck) => {
    if (!isHR) { setState("unavailable"); return null; }
    const id = ++reqId.current;
    try {
      const next = normalizeChecklist(await organizationAPI.getSetupChecklist({ recheck }));
      if (id !== reqId.current) return null;
      loadedAt.current = Date.now();
      if (!next) {
        // A 200 with no categories. Nothing to draw and nothing true to say,
        // so it is treated as a server that doesn't have this yet rather than
        // as a finished organisation.
        setState("unavailable");
        return null;
      }
      setChecklist(next);
      setError(null);
      setState("ready");
      return next;
    } catch (err) {
      if (id !== reqId.current) return null;
      // 403: this build is talking to a server where the endpoint isn't open to
      // this role. 404: it isn't deployed. Either way the feature is absent,
      // not broken (§2) — and absent is not an error anybody can act on.
      // Stamped on the failure path too, deliberately: against a server that
      // doesn't carry this endpoint, every tab focus would otherwise re-fire a
      // request that is never going to succeed.
      loadedAt.current = Date.now();
      setError(err);
      setState(err?.status === 403 || err?.status === 404 ? "unavailable" : "error");
      return null;
    }
    // `orgId` IS A REFETCH KEY. The endpoint takes no org param — it reads the
    // token — so the linter can't see the dependency and calls it unnecessary.
    // What makes it a dependency is that the ANSWER is per-organisation.
    // Today an org switch survives this anyway, because DashboardTopBar calls
    // `window.location.reload()` after switching (its own comment says it is
    // there to clear tenant-specific state). That line is one component away
    // and has "surely this is unnecessary" written all over it; if it ever
    // goes, this hook keeps showing the previous organisation's checklist
    // under the new organisation's name. One dependency is cheaper than that
    // bug, so it does not rely on a reload it doesn't control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHR, orgId]);

  // Cleared before the re-read, so a switch can't show one organisation's steps
  // under another's name for the length of a request.
  useEffect(() => {
    setChecklist(null);
    setState(isHR ? "loading" : "unavailable");
    setError(null);
    read(false);
  }, [read, isHR]);

  // Already-mounted selectors refresh on this kind, and so does the checklist:
  // creating a shift or an attendance policy is one of the steps it counts.
  useAttendanceChanged([ATTENDANCE_EVENTS.CONFIG], () => { read(false); });

  // The tab that was left open while the step was completed in another one.
  // Guarded on staleness so returning to the tab twice in a minute is free.
  useEffect(() => {
    if (!isHR) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - loadedAt.current < STALE_AFTER_MS) return;
      read(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isHR, read]);

  /**
   * The explicit re-check. Resolves to `{ before, after }` so the caller can
   * say what actually changed instead of "done" — the whole value of the
   * button is finding out whether the thing you just set up registered.
   */
  const recheck = useCallback(async () => {
    if (rechecking) return null;
    setRechecking(true);
    const before = checklist?.done ?? null;
    try {
      const after = await read(true);
      return after ? { before, after } : null;
    } finally {
      setRechecking(false);
    }
  }, [checklist, read, rechecking]);

  return {
    checklist,
    state,
    error,
    isHR,
    rechecking,
    reload: () => read(false),
    recheck,
  };
}
