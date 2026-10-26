/* ─────────────────────────────────────────────────────────────────────────────
 * sw.js — HR Clouds service worker. Web Push only.
 *
 * This worker caches nothing and intercepts no requests. It exists for one
 * reason: a browser will not deliver a push message without one. Keep it that
 * way — the moment it starts caching, every deploy risks serving a stale app
 * shell, and this app already committed to `dist/` as its deployment.
 *
 * ─── THE TWO PAYLOAD SHAPES, AND WHY THE BRANCH IS LOAD-BEARING ────────────
 * The server sends two completely different things down the same channel:
 *
 *   { "type": "LOCATION_REQUEST", "requestId": …, "expiresAt": … }
 *       Somebody has asked where this person is, and only this person can
 *       answer. Shown, with a "Share my location" button on it.
 *
 *   { "type": "NOTIFICATION", "notification": { title, body }, screen, id, event_key }
 *       A visible alert from the notification engine. Shown, and tapping it
 *       opens the app at the right place.
 *
 * ─── DEVIATION FROM THE MOBILE CONTRACT, ON PURPOSE ────────────────────────
 * The mobile guide calls LOCATION_REQUEST a SILENT wake-up, and the first cut
 * of this file obeyed it. On the web it cannot be, for two independent
 * reasons, and the 2026-10-24 web guide says so outright:
 *
 *   1. A SERVICE WORKER MAY NOT READ GPS. Every current browser forbids
 *      `navigator.geolocation` outside a focused document, so there is nobody
 *      to answer a silent wake-up here. The phone can; this cannot.
 *   2. `userVisibleOnly: true` IS NOT OPTIONAL. Chrome will not grant a web
 *      push subscription without it, and then penalises — eventually revokes —
 *      a site that receives a push and shows nothing.
 *
 * So the web answers a location check the only way it can: it asks the person,
 * with the reason already on screen. That is not a weaker version of the phone
 * behaviour — it is the one this feature's own notice promises, and the subject
 * sees every request on their My Location Checks page either way.
 *
 * Web guide: md_updates/2026-10-24_web_notification_prompt_and_location_device_registration.md §3
 *
 * ─── WHY THE CLICK DOES NOT BUILD ITS OWN URL ──────────────────────────────
 * A service worker has no idea whether the person is signed in as an employee,
 * a manager or HR, and the same `screen` means a different page to each of them
 * (notificationTargets.js). The route gate in the app is exact, so a guessed
 * URL into the wrong workspace is a bounce to the dashboard and a lost click.
 * So the worker focuses an open tab and hands it the routing keys, or opens the
 * app with them in the query string, and the app — which knows the workspace —
 * decides where to go.
 *
 * Contract: public/ref docs/md_updates/2026-10-24_notification_inbox_apis_and_push_payload.md §3
 * ──────────────────────────────────────────────────────────────────────────── */

/* global self, clients */

const APP_ICON = "/logocolored.png";
// Where a click lands when nothing better can be worked out. /dashboard is the
// one address that is right for every role: it forwards to their own workspace.
const FALLBACK_URL = "/dashboard";

// A new worker takes over at once. There is no cached content to invalidate, so
// there is no reason to leave an old copy running until every tab closes.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    // A provider test ping, or a malformed send. Nothing to show.
    return null;
  }
}

/** Tell every open tab something arrived, so it can re-read the real record. */
async function broadcast(message) {
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(message));
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  if (!payload) return;

  // 1. A location check. Evaluated first because push proxies or FCM bridges
  //    often inject a top-level notification object. Only the person in front
  //    of the screen can answer it, so it is shown with the action that answers
  //    it. `requireInteraction` keeps it up for the 60-second window.
  const isLocationRequest =
    payload.type === "LOCATION_REQUEST" ||
    payload.action === "REQUEST_LOCATION" ||
    payload.data?.type === "LOCATION_REQUEST" ||
    payload.data?.action === "REQUEST_LOCATION";

  if (isLocationRequest) {
    const requestId =
      payload.requestId ||
      payload.request_id ||
      payload.data?.requestId ||
      payload.data?.request_id ||
      null;
    const expiresAt =
      payload.expiresAt ||
      payload.expires_at ||
      payload.data?.expiresAt ||
      payload.data?.expires_at ||
      null;

    event.waitUntil(Promise.all([
      self.registration.showNotification("Someone has asked where you are", {
        body: "Your workplace has asked this device to confirm your location. Only you can answer it.",
        icon: APP_ICON,
        badge: APP_ICON,
        tag: requestId ? `location-check-${requestId}` : "location-check",
        requireInteraction: true,
        data: { locationRequestId: requestId },
        actions: [
          { action: "share_location", title: "Share my location" },
          { action: "dismiss", title: "Not now" },
        ],
      }),
      // An open tab asks the person in a dialog instead, where the countdown
      // and the "what gets shared" line fit. `expiresAt` is forwarded so that
      // dialog can close itself rather than post into a dead request.
      broadcast({
        type: "LOCATION_REQUEST",
        requestId,
        expiresAt,
      }),
    ]));
    return;
  }

  // 2. A visible notification from the engine.
  if (payload.type === "NOTIFICATION" || payload.notification) {
    const data = {
      screen: payload.screen || payload.data?.screen || null,
      id: payload.id || payload.data?.id || null,
      event_key: payload.event_key || payload.data?.event_key || null,
    };
    const title = payload.notification?.title || "HR Clouds";
    const options = {
      body: payload.notification?.body || "",
      icon: APP_ICON,
      badge: APP_ICON,
      // One tag per event key collapses a repeat of the same kind of alert
      // rather than stacking five "payslip is ready" banners.
      tag: data.event_key || undefined,
      renotify: Boolean(data.event_key),
      data,
    };
    event.waitUntil(Promise.all([
      self.registration.showNotification(title, options),
      broadcast({ type: "NOTIFICATION_RECEIVED", data }),
    ]));
    return;
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // "Not now" is a real answer. The request simply expires, which is exactly
  // what the feature's notice says happens, so there is nothing else to do.
  if (event.action === "dismiss") return;

  const data = event.notification.data || {};
  const params = new URLSearchParams();
  if (data.locationRequestId) {
    // A location check needs a focused document to read GPS, so the click
    // always lands in the app — on the person's own location-checks page,
    // which is the one place that explains what is about to be shared.
    params.set("sync_location", "true");
    params.set("request_id", data.locationRequestId);
  } else {
    if (data.screen) params.set("n_screen", data.screen);
    if (data.id) params.set("n_id", data.id);
    if (data.event_key) params.set("n_event", data.event_key);
  }
  const query = params.toString();

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.location.origin));
    if (open) {
      // The tab is already signed in and knows the workspace; let it route.
      open.postMessage(data.locationRequestId
        ? { type: "TRIGGER_LOCATION_SYNC", requestId: data.locationRequestId }
        : { type: "NOTIFICATION_CLICK", data });
      return open.focus();
    }
    if (clients.openWindow) {
      return clients.openWindow(query ? `${FALLBACK_URL}?${query}` : FALLBACK_URL);
    }
    return undefined;
  })());
});
