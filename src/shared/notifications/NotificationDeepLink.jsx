// ─────────────────────────────────────────────────────────────────────────────
// NotificationDeepLink — the half of "tapping a desktop alert opens the right
// page" that lives in the app rather than in the service worker.
//
// It renders nothing. It sits inside the router, next to NotificationsProvider,
// and handles the two ways a click arrives:
//
//   1. A TAB WAS ALREADY OPEN. The worker posts {type:"NOTIFICATION_CLICK"} to
//      it and focuses it. No reload, no query string — we route in place.
//   2. NO TAB WAS OPEN. The worker opened /dashboard?n_screen=…&n_id=…&n_event=…
//      because it cannot know the workspace (sw.js explains why). We read those
//      three, work out the destination, and strip them from the URL.
//
// ─── WHY THE CLICK SURVIVES A SIGN-IN ──────────────────────────────────────
// Case 2 usually lands on a signed-out app: the session expired while the tab
// was closed, so /dashboard bounces to the login screen and the query string is
// gone with it. Dropping the click there would make desktop alerts feel broken
// for exactly the people they are most useful to. So the routing keys are
// parked in sessionStorage the moment they are seen and spent once a workspace
// is known — which is after the redirect back in. sessionStorage, not local:
// the intent belongs to this tab and this sitting, and must not resurface
// tomorrow or for whoever signs in next on a shared machine.
//
// ─── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
// It never navigates to a path outside the viewer's workspace, because every
// destination comes from resolveNotificationTarget, which returns null rather
// than cross a workspace (§2). An unresolvable click is left where it landed —
// the dashboard, with the bell one press away — never an error.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCurrentWorkspace } from "../attendance/paths";
import { resolveNotificationTarget } from "./notificationTargets";

const PENDING_KEY = "hrclouds_pending_notification";
const PARAMS = ["n_screen", "n_id", "n_event"];

/** A worker payload or a query string, in the shape the resolver expects. */
function asNotification(data) {
  if (!data || (!data.screen && !data.event_key)) return null;
  return {
    eventKey: data.event_key || "",
    category: "",
    metadata: { screen: data.screen || null, id: data.id || null },
  };
}

function readPending() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePending(data) {
  try {
    if (data) sessionStorage.setItem(PENDING_KEY, JSON.stringify(data));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked). The in-tab case still
    // works; only the survives-a-sign-in case is lost, which is acceptable.
  }
}

export default function NotificationDeepLink() {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useCurrentWorkspace();

  // Navigating changes `location`, which would re-run the effect and re-read a
  // pending click we have already spent. One ref, cleared on nothing.
  const spending = useRef(false);

  const go = useCallback((data) => {
    const notification = asNotification(data);
    const target = notification && resolveNotificationTarget(notification, workspace);
    if (!target || target.path === location.pathname) return false;
    navigate(target.path);
    return true;
  }, [navigate, workspace, location.pathname]);

  // 1. An open tab: the worker speaks to it directly.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== "NOTIFICATION_CLICK") return;
      if (!workspace) { writePending(event.data.data); return; }
      go(event.data.data);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [go, workspace]);

  // 2. A cold open: the keys are in the URL. Park them, clean the URL
  //    immediately so a refresh or a shared link cannot replay the click, then
  //    spend them as soon as there is a workspace to resolve against.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (PARAMS.some((key) => params.has(key))) {
      spending.current = false;
      writePending({
        screen: params.get("n_screen"),
        id: params.get("n_id"),
        event_key: params.get("n_event"),
      });
      PARAMS.forEach((key) => params.delete(key));
      const query = params.toString();
      navigate(`${location.pathname}${query ? `?${query}` : ""}${location.hash}`, { replace: true });
      return;
    }

    if (!workspace || spending.current) return;
    const pending = readPending();
    if (!pending) return;
    spending.current = true;
    writePending(null);
    go(pending);
  }, [location.search, location.pathname, location.hash, navigate, workspace, go]);

  return null;
}
