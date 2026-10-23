// ─────────────────────────────────────────────────────────────────────────────
// notifications.api.js — the push-device registry.
//
// WHY THIS IS ITS OWN MODULE AND NOT PART OF attendance.api.js. The registry is
// mounted at `/api/v1/notifications/*`, owned by the backend's notification
// module rather than attendance (implementation plan §B.2). Location checks are
// only its first consumer; anything else that ever needs to wake a device will
// register through exactly these three calls.
//
// ─── CONTRACT TRAPS ────────────────────────────────────────────────────────
// · REGISTRATION IS A HARD PREREQUISITE. With no active device for a person,
//   every locate against them is `422 NO_ACTIVE_DEVICE`. The mobile app does
//   this at login; the web does it when somebody opts in on My Location
//   Requests.
// · THE POST UPSERTS ON THE TOKEN. Re-registering the same browser or handset
//   returns the same row rather than a duplicate — the server keys on a hash of
//   `push_token`, which is globally unique, so a reassigned company phone moves
//   to its new owner instead of colliding.
// · THE TOKEN IS NEVER RETURNED. Neither `push_token` nor its hash comes back on
//   any read, so a device row cannot be matched to a live browser subscription
//   by comparing tokens. Match on `id`, which is what we store locally.
//
// Contract: public/ref docs/md_updates/2026-10-23_on_demand_location_tracking_frontend_guide.md §2.1
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

const seg = (value) => encodeURIComponent(String(value ?? ""));

export const notificationsAPI = {
  /**
   * Register (or re-register) this device so the server can wake it.
   * @param {{platform: "android"|"ios"|"web", push_token: string, device_name?: string, app_version?: string}} payload
   *   `push_token` is 1–8192 chars: an FCM registration token on mobile, or the
   *   JSON-serialised `PushSubscription` on web.
   * @returns `{ id, platform, device_name, app_version, is_active, last_seen_at,
   *   last_push_at, created_at }` — 201 on a new row, and on a repeat too.
   */
  registerDevice: (payload) => request("/notifications/devices", {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  /** This person's own active devices. Carries no token, by design. */
  listDevices: () => request("/notifications/devices"),

  /** De-register on sign-out or when somebody turns the browser answer off. */
  deleteDevice: (id) => request(`/notifications/devices/${seg(id)}`, { method: "DELETE" }),
};

export default notificationsAPI;
