// ─────────────────────────────────────────────────────────────────────────────
// pushRegistration.js — turning browser alerts on and off for this computer.
//
// Four steps, in this order, and none of them is optional: ask the browser for
// permission → register the service worker → subscribe to Web Push → hand the
// subscription to the server's device registry. Stop at any step and the
// person has a switch that looks on and delivers nothing.
//
// ─── WHY THE SOFT PROMPT IS NOT NEGOTIABLE ─────────────────────────────────
// `Notification.requestPermission()` is a ONE-SHOT. A person who clicks Block
// can never be asked again by us — they have to go into browser site settings
// and find it themselves, which nobody does. Over 70% of unprompted requests
// are refused. So this module is only ever called from a control the person
// pressed, after we have said what the alerts are for. Nothing here fires on
// load, on login, or from an effect.
//
// ─── ABSENT, NOT BROKEN (§2) ───────────────────────────────────────────────
// Web Push needs a VAPID public key that has to match the server's private
// one. Without `VITE_PUSH_VAPID_PUBLIC_KEY` there is no way to subscribe, so
// `pushSupport()` reports `configured: false` and the UI shows no switch at
// all — rather than a button that asks for permission and then fails. Same for
// a browser without push (Safari before 16.4, any private window in Firefox).
//
// ─── THE LOGOUT STEP IS A SECURITY STEP, NOT HOUSEKEEPING ──────────────────
// A subscription is bound to the BROWSER, not to the person. Leave it
// registered when somebody signs out of a shared or company machine and the
// next person to use it receives the first person's leave decisions and
// payslip alerts on their lock screen. `releasePushDevice()` runs before the
// token is cleared, because the DELETE needs it.
//
// Contract: public/ref docs/md_notifications/frontend_fcm_and_notification_integration_guide.md §2–§4
// ─────────────────────────────────────────────────────────────────────────────

import { ENV } from "../../config/env";
import { notificationsAPI } from "../api";

const DEVICE_ID_KEY = "hrclouds_push_device_id";
const ENDPOINT_KEY = "hrclouds_push_endpoint";
const SW_URL = "/sw.js";

const read = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* Storage can be blocked. Alerts still work this session; the device row
       simply cannot be de-registered on sign-out from this browser. */
  }
};

/** The registry id of the device row this browser owns, if it has one. */
export const storedDeviceId = () => read(DEVICE_ID_KEY);

/**
 * What this browser can do, read fresh each time: permission changes from
 * browser settings without telling the page, so nothing here is cached.
 *
 * @returns {{ supported: boolean, configured: boolean, permission: "default"|"granted"|"denied"|"unsupported", registered: boolean }}
 */
export function pushSupport() {
  const supported = typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
  return {
    supported,
    configured: Boolean(ENV.PUSH_VAPID_PUBLIC_KEY),
    permission: supported ? Notification.permission : "unsupported",
    registered: Boolean(read(DEVICE_ID_KEY)),
  };
}

/** VAPID keys travel as base64url; `PushManager` wants raw bytes. */
function urlBase64ToUint8Array(base64) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Something a person recognises in a list of their own devices — "Chrome on
 * Windows", not a user-agent string. Deliberately coarse: the registry is for
 * telling your laptop from your phone, and a version number would only age.
 */
function deviceName() {
  const ua = navigator.userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
      : /Chrome\//.test(ua) ? "Chrome"
        : /Firefox\//.test(ua) ? "Firefox"
          : /Safari\//.test(ua) ? "Safari"
            : "Browser";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const os = /Win/i.test(platform) ? "Windows"
    : /Mac/i.test(platform) ? "macOS"
      : /Linux|X11/i.test(platform) ? "Linux"
        : /Android/i.test(ua) ? "Android"
          : /iPhone|iPad/i.test(ua) ? "iOS"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

async function readyWorker() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

/**
 * Ask for permission, subscribe, and register the subscription with the server.
 * Call this ONLY from a user gesture.
 *
 * @returns {Promise<{ ok: boolean, permission: string, reason?: string }>}
 *   `ok: false` with `permission: "denied"` is the one outcome the UI has to
 *   explain rather than retry — the browser will not ask again.
 */
export async function enableBrowserAlerts() {
  const support = pushSupport();
  if (!support.supported) return { ok: false, permission: "unsupported", reason: "This browser can’t show alerts." };
  if (!support.configured) return { ok: false, permission: support.permission, reason: "Browser alerts aren’t set up for this site yet." };

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      reason: permission === "denied"
        ? "Your browser is blocking alerts from this site. Turn them back on in its site settings, then try again."
        : "Alerts weren’t turned on.",
    };
  }

  const registration = await readyWorker();
  // An existing subscription is reused. Re-subscribing would mint a second
  // endpoint for the same browser and leave the first one registered and live.
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      // Chrome refuses a subscription without this, and a silent push would be
      // invisible to the person it is about — which is the whole objection to
      // silent pushes in the first place.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(ENV.PUSH_VAPID_PUBLIC_KEY),
    });
  }

  // The POST upserts on a hash of the token, so re-registering the same
  // browser returns the same row rather than a duplicate.
  const res = await notificationsAPI.registerDevice({
    platform: "web",
    push_token: JSON.stringify(subscription),
    device_name: deviceName(),
    app_version: "1.0.0",
  });
  const id = res?.data?.id || "";
  write(DEVICE_ID_KEY, id);
  write(ENDPOINT_KEY, subscription.endpoint || "");
  return { ok: true, permission: "granted" };
}

/**
 * Turn alerts off for this browser: drop the subscription, then the device row.
 * The order matters — once the subscription is gone the server would be sending
 * to a dead endpoint, so the row goes second and always, even if the DELETE
 * fails (the server retires an endpoint that rejects, but not quickly).
 */
export async function disableBrowserAlerts() {
  const id = read(DEVICE_ID_KEY);
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
  } catch {
    /* Nothing to unsubscribe from, or the browser refused. Still de-register. */
  }
  try {
    if (id) await notificationsAPI.deleteDevice(id);
  } catch {
    /* A 404 means it is already gone, which is the state we wanted. */
  }
  write(DEVICE_ID_KEY, "");
  write(ENDPOINT_KEY, "");
  return true;
}

/**
 * Sign-out. Identical to turning alerts off, but it must never throw and never
 * block the sign-out: a registry that is briefly wrong is a smaller problem
 * than a person who cannot leave. Call it BEFORE the token is cleared.
 */
export async function releasePushDevice() {
  try {
    await disableBrowserAlerts();
  } catch {
    write(DEVICE_ID_KEY, "");
    write(ENDPOINT_KEY, "");
  }
}
