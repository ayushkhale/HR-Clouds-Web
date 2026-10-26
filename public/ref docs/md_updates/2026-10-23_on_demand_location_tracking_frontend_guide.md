# Frontend Integration Guide: On-Demand Employee Location Tracking

**Date:** 2026-10-23
**Status:** Implemented (backend) — corrected against shipped code
**Module:** Attendance / On-Demand Location Tracking
**Target Environments:** Web Portal (React / SPA) & Mobile App (React Native / Android / iOS)

> **Correction note (2026-10-23).** This guide was first written from the draft spec. It has now
> been reconciled with the code that shipped. The route paths, status codes, request bodies and the
> result-delivery mechanism below are the **authoritative** ones — the earlier draft got several
> wrong (see §7). `public/md_system/ATTENDANCE_API_CONTRACT.md` §14 is the canonical contract; this
> guide is the frontend-facing companion.

---

## 1. Executive Summary & Design Decisions

HR (and, for their own direct reports, managers) can request the live physical location of an
employee during an active shift. The request wakes the employee's registered device over push; the
device reports its coordinates back over a plain authenticated POST; the requester reads the result
by **polling**.

### Key Design Principles
1. **Push wakes the device; the device reports back; the requester polls the result.** There is no
   SSE/WebSocket leg — the result is read with a short poll on `GET .../location-requests/:requestId`.
2. **Nothing is "verified".** The server can only test *plausibility* of a reported fix. Label the
   result **"Reported"**, never "Verified Live". A fix can come back flagged (see `spoof_flagged`).
3. **Device registration is a hard prerequisite.** A locate against an employee with no active push
   device returns `422 NO_ACTIVE_DEVICE`. The client **must** register its push device first
   (§2.1) — nothing works without it.
4. **Mobile:** silent-data push → the app reads GPS in the background and posts the fix (0 taps).
5. **Web:** browsers cannot read GPS from a background Service Worker. The push shows a notification
   with a **`[📍 Share Location]`** action; clicking it focuses/opens the app, which reads
   `navigator.geolocation.getCurrentPosition()` and posts the fix.
6. **Feature gating:** the whole feature sits behind the existing `attendance.geofencing` org
   feature **and** a server kill switch (`ATTENDANCE_LOCATION_TRACKING_ENABLED`) **and** a per-org
   `enabled` policy flag. All three must be on, or the locate endpoints reject (see §2.3 errors).

---

## 2. API Contracts & Endpoints

All paths are under `/api/v1`. All requests require `Authorization: Bearer <token>`. All responses
use the standard envelope `{ "success": boolean, "message": string, "data": … }`; error bodies are
`{ "success": false, "message": string, "errorCode": string, ... }`.

### 2.1 Register a push device (prerequisite — do this at login) 🔴

Without an active device, every locate against this user fails with `422 NO_ACTIVE_DEVICE`.

* **Method / Path:** `POST /api/v1/notifications/devices`
* **Request body:**
```json
{
  "platform": "android",            // "android" | "ios" | "web"
  "push_token": "<FCM token or serialised Web Push subscription JSON>",
  "device_name": "Pixel 8",         // optional, ≤100 chars
  "app_version": "3.4.1"            // optional, ≤50 chars
}
```
`push_token` is 1–8192 chars: an FCM registration token on mobile, or the JSON-serialised
`PushSubscription` on web.
* **Response (201 Created):**
```json
{
  "success": true,
  "message": "Device registered",
  "data": {
    "id": "…", "platform": "android", "device_name": "Pixel 8",
    "app_version": "3.4.1", "is_active": true,
    "last_seen_at": "…", "last_push_at": null, "created_at": "…"
  }
}
```
Re-registering the same token (same device) upserts — it does not create duplicates. The token and
its hash are never returned.
* **Other device endpoints:** `GET /api/v1/notifications/devices` (list my active devices),
  `DELETE /api/v1/notifications/devices/:id` (de-register on logout).

---

### 2.2 Trigger a location request (HR / Manager)

* **Method / Path (HR):** `POST /api/v1/attendance/hr/employees/:userId/locate`
* **Method / Path (Manager):** `POST /api/v1/attendance/manager/team/member/:userId/locate`
  * HR can locate any active member. A manager can locate only their own direct reports (anyone
    else is `404 EMPLOYEE_NOT_FOUND`). **`admin` / `super-admin` cannot locate anyone** — those are
    platform roles with no tenant data access.
* **Request body:**
```json
{ "reason": "Client site visit verification" }
```
`reason` is a trimmed string, 10–255 chars. It is **required only when the org policy sets
`require_reason: true`** (otherwise optional). It is persisted and shown to the employee in their
own history, so write it for a human.
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Location requested",
  "data": {
    "request_id": "c7a8b42e-68e1-4562-b529-673c683b5f79",
    "status": "dispatched",
    "timeout_seconds": 60,
    "last_known_location": {
      "latitude": 28.613939,
      "longitude": 77.209021,
      "recorded_at": "2026-10-23T08:05:00.000Z",
      "is_stale": false
    }
  }
}
```
  * `status` is `"dispatched"` on success, or `"failed"` if no device could be woken at dispatch
    time (all push transports failed). Both are lowercase.
  * `last_known_location` may be `null` if the employee has never reported a fix. `is_stale` is
    `true` when the last fix is older than 15 minutes — render it as "last seen Xm ago", not as the
    live answer.
  * Keep the `request_id`; you poll it (§2.4) for the fresh fix.

#### 2.3 Locate error table (authoritative)

| HTTP | `errorCode` | When |
|---|---|---|
| `400` | `REASON_REQUIRED` | Policy requires a reason and none (or < 10 chars) was sent. |
| `403` | `LOCATION_TRACKING_DISABLED` | The org's policy has `enabled: false`. |
| `403` | `LOCATE_ROLE_NOT_ALLOWED` | The caller's role is not in the policy's `allowed_requester_roles`. |
| `404` | `EMPLOYEE_NOT_FOUND` | Target is out of the caller's scope, or not an active member. |
| `422` | `CANNOT_LOCATE_SELF` | Caller tried to locate themselves. |
| `422` | `EMPLOYEE_CONSENT_PENDING` | Policy is `acknowledgement` mode and the employee has not acknowledged yet. Body carries `acknowledgement_required: true`. |
| `422` | `EMPLOYEE_NOT_CLOCKED_IN` | Policy requires an open shift and the employee has none (overnight-safe lookup). |
| `422` | `NO_ACTIVE_DEVICE` | The employee has no registered device able to receive the request. |
| `429` | `LOCATE_COOLDOWN` | Same requester located the same employee within the cooldown window. Body carries `retry_after_seconds`. |
| `429` | `LOCATE_DAILY_CAP_REACHED` | The employee hit the per-day locate cap. |
| `429` | `LOCATE_RATE_LIMITED` | The org hit its hourly locate limit. `Retry-After` header set. |
| `503` | `FEATURE_DISABLED` | The server kill switch is off. |

> ⚠️ **`NO_ACTIVE_DEVICE` is `422`, not `404`.** (The earlier draft said 404.)

---

### 2.4 Poll the result (HR / Manager)

* **Method / Path (HR):** `GET /api/v1/attendance/hr/location-requests/:requestId`
* **Method / Path (Manager):** `GET /api/v1/attendance/manager/location-requests/:requestId`
  * HR may poll any request in the org; a manager may poll only requests they themselves raised
    (otherwise `404 LOCATION_REQUEST_NOT_FOUND`).
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Location request status",
  "data": {
    "request_id": "c7a8b42e-…",
    "status": "reported",
    "expires_at": "2026-10-23T08:13:35.000Z",
    "reason": "Client site visit verification",
    "location": {
      "latitude": 28.614120, "longitude": 77.209150,
      "accuracy_meters": 8.2, "captured_at": "2026-10-23T08:12:35.000Z",
      "in_bounds": true, "nearest_location_id": "…", "distance_meters": 5
    },
    "spoof_flagged": false
  }
}
```
* **Four terminal states for `status`:**
  * `dispatched` — woken, waiting for the fix. Keep polling.
  * `reported` — the fix is in `location`. Stop polling.
  * `timed_out` — the TTL elapsed with no fix (device unreachable / app swiped away / permission
    denied). Show "unreachable", not "evading".
  * `failed` — no device could be woken at dispatch time.
* **Poll cadence:** every ~2 s for the `timeout_seconds` window (≈60 s). `location` is `null` until
  `status === "reported"`.
* `spoof_flagged: true` means the reported fix tripped an anti-spoof heuristic (e.g. mock-location
  flag). Show a caution badge; do not drop the fix.

---

### 2.5 Ingest a location ping (employee client → backend)

The device posts its fix here after the push wakes it.

* **Method / Path:** `POST /api/v1/attendance/locations/live-ping`
* **Request body:**
```json
{
  "request_id": "c7a8b42e-…",
  "latitude": 28.614120,
  "longitude": 77.209150,
  "accuracy_meters": 8.2,
  "is_mock": false,
  "battery_level": 78,
  "captured_at": "2026-10-23T08:12:35.000Z",
  "platform": "android"
}
```
  * `request_id` (uuid), `latitude` (-90..90), `longitude` (-180..180),
    `accuracy_meters` (> 0, ≤ 100000), `captured_at` (ISO) are required.
  * `is_mock` (default false), `battery_level` (0–100), `platform` (`android`|`ios`|`web`) optional.
  * Always send `is_mock: true` when the OS reports a mock provider — the server records it; it does
    not reject on it.
* **Response (200 OK):** `{ "success": true, "message": "Location logged", "data": { "logged": true } }`
* **Idempotent:** re-posting the same `request_id` after success returns `{ logged: true }` again —
  safe to retry on a flaky network.
* **Errors:** `404 LOCATION_REQUEST_NOT_FOUND` (unknown/foreign request), `409 LOCATION_REQUEST_EXPIRED`
  (TTL elapsed or already in a terminal non-reported state).

---

### 2.6 Employee self-service: consent + "who located me"

* **Acknowledge the notice:** `POST /api/v1/attendance/locations/consent`
  * Body: `{ "version": "v1" }` (version optional). Returns `{ acknowledged_at, consent_version }`.
  * Required once when the org policy is in `acknowledgement` mode — until then every locate against
    this employee fails `422 EMPLOYEE_CONSENT_PENDING`.
* **My history:** `GET /api/v1/attendance/locations/mine?page=1&limit=20`
  * Returns who located the employee, when, why (`reason`), and the fix — but **not** the
    `spoof_flagged` verdict (the subject never sees which heuristic fired).

---

### 2.7 History reads (HR / Manager)

* **HR:** `GET /api/v1/attendance/hr/employees/:userId/location-history?page=1&limit=20`
* **Manager:** `GET /api/v1/attendance/manager/team/member/:userId/location-history?page=1&limit=20`
  (direct reports only). Each returns `{ pagination, requests[] }`; requester-facing rows include
  `spoof_flagged`.

---

### 2.8 Org policy (HR only)

* **Read:** `GET /api/v1/attendance/hr/location-policy` — returns the policy row; sets an `ETag`
  (weak, derived from `updated_at`).
* **Write:** `PUT /api/v1/attendance/hr/location-policy` — send only the keys you change; **requires
  an `If-Match` header** carrying the ETag from the read (missing → `428`, malformed → `400`, stale
  → `412 SETTINGS_PRECONDITION_FAILED`).
* **Knobs:** `enabled` (bool), `consent_mode` (`notice_only`|`acknowledgement`),
  `allowed_requester_roles` (array of `hr`/`manager`, ≥1), `require_clocked_in`, `require_reason`,
  `notify_employee` (bools), `request_ttl_seconds` (30–300), `cooldown_seconds` (0–86400),
  `max_requests_per_employee_per_day` (1–50), `log_retention_days` (7–730).

---

## 3. Web Client Implementation (No New UI Screen)

### Step 1: Service Worker (`public/service-worker.js`)

```javascript
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  if (data.action !== 'REQUEST_LOCATION') return;        // matches the backend data payload

  event.waitUntil(
    self.registration.showNotification('Location request', {
      body: 'Your workplace has requested your current location.',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `loc-req-${data.requestId}`,
      requireInteraction: true,
      data: {
        requestId: data.requestId,
        url: `${self.location.origin}/dashboard?sync_location=true&request_id=${data.requestId}`
      },
      actions: [
        { action: 'share_location', title: '📍 Share Location' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const { requestId, url } = event.notification.data;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        // Match on OUR origin, not a hard-coded "/dashboard" path.
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'TRIGGER_LOCATION_SYNC', requestId });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
```

### Step 2: Root-layout hook (`useLocationSync.ts`)

```javascript
import { useEffect } from 'react';

export function useLocationSync() {
  useEffect(() => {
    const report = (requestId) => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await fetch('/api/v1/attendance/locations/live-ping', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              request_id: requestId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy_meters: pos.coords.accuracy,
              is_mock: false,
              captured_at: new Date(pos.timestamp).toISOString(),
              platform: 'web'
            })
          }).catch((e) => console.error('[LocationSync] post failed', e));
        },
        (err) => {
          // §8 of the spec promises a PERMISSION_DENIED path. The backend has no reject-ping
          // endpoint, so surface the denial to the user and let the request time out server-side.
          console.warn('[LocationSync] geolocation error', err.code, err.message);
          if (err.code === err.PERMISSION_DENIED) {
            // show a non-blocking toast: "Location permission is required to answer HR's request"
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    const onMessage = (e) => {
      if (e.data?.type === 'TRIGGER_LOCATION_SYNC' && e.data.requestId) report(e.data.requestId);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    const params = new URLSearchParams(window.location.search);
    if (params.get('sync_location') === 'true' && params.get('request_id')) {
      report(params.get('request_id'));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);
}
```

---

## 4. Mobile App Implementation (React Native / Android / iOS)

```javascript
import messaging from '@react-native-firebase/messaging';
import Geolocation from 'react-native-geolocation-service';
import notifee, { AndroidImportance } from '@notifee/react-native';

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  if (remoteMessage.data?.action !== 'REQUEST_LOCATION') return;
  const requestId = remoteMessage.data.requestId;

  await notifee.displayNotification({
    title: '📍 Location request',
    // "requested", not "verified" — nothing is verified until the fix comes back.
    body: 'Your workplace has requested your current location.',
    android: { channelId: 'attendance_channel', importance: AndroidImportance.HIGH, smallIcon: 'ic_notification' }
  });

  Geolocation.getCurrentPosition(
    async (pos) => {
      await fetch('https://api.yourdomain.com/api/v1/attendance/locations/live-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken()}` },
        body: JSON.stringify({
          request_id: requestId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
          is_mock: pos.mocked || false,     // always forward the OS mock flag
          captured_at: new Date(pos.timestamp).toISOString(),
          platform: 'android'
        })
      });
    },
    (error) => console.log('Location error:', error),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});
```

**iOS caveat:** Apple will not deliver silent push to an app the user force-quit. Those requests
time out — surface that as "unreachable".

---

## 5. HR / Manager Dashboard UI (Sender Side)

* **Button:** `[ 📍 Locate Employee ]` on the employee attendance view (HR), or on a direct report's
  card (manager).
* **Flow:**
  1. `POST …/locate` with `{ reason }`.
  2. If `last_known_location` comes back, drop a pin immediately with a **"Last reported: Xm ago
     (±Nm)"** badge — and `is_stale: true` ⇒ grey it out as stale, not current.
  3. **Poll** `GET …/location-requests/:request_id` every ~2 s until `status` leaves `dispatched`.
  4. On `reported`: move the pin to `location` and label it **"Reported: just now (±Nm)"** — never
     "Verified". If `spoof_flagged`, add a caution badge.
  5. On `timed_out` / `failed`: show "Employee unreachable" — not "evading".

---

## 6. Environment / ops prerequisites (backend)

The feature needs these set server-side before it will run (see `.env.example`):
`ATTENDANCE_LOCATION_TRACKING_ENABLED=true`, the `PUSH_FCM_*` and `PUSH_WEBPUSH_*` transport
credentials (the server refuses to boot with the switch on but transports unconfigured), and the
org feature `attendance.geofencing` enabled. Migrations `00081`–`00085` must be run. See the
rollout runbook: `public/md_attendance/new_implementations/on_demand_location_tracking_rollout_runbook.md`.

---

## 7. What changed from the first draft of this guide

| Draft said | Corrected to |
|---|---|
| `POST /api/v1/manager/employee/:id/locate` | `POST /api/v1/attendance/manager/team/member/:userId/locate` (and the HR path under `/attendance/hr/employees/:userId/locate`). |
| `NO_ACTIVE_DEVICE_FOUND` → `404` | `NO_ACTIVE_DEVICE` → `422`. |
| (no device registration step) | `POST /api/v1/notifications/devices` is a hard prerequisite (§2.1). |
| `status: "DISPATCHED"` | lowercase `"dispatched"` / `"failed"`. |
| "Subscribe to WebSocket or SSE `location_updates:<request_id>`" | **Poll** `GET …/location-requests/:requestId`; four terminal states (§2.4). |
| "Verified Live" | "Reported" — nothing is verified. |
| (no `reason` field) | `reason` in the locate body (required under `require_reason`). |
| Service worker matched `/dashboard` path | match on `self.location.origin`; added the `PERMISSION_DENIED` path. |
| (no consent / history / poll endpoints) | Added §2.4, §2.6, §2.7. |
