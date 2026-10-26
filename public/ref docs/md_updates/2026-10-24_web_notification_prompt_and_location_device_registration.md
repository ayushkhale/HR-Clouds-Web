# Web Frontend Action Required: Browser Notification Permission, Device Registration & Location Request Setup

**Date:** 2026-10-24  
**Target:** Web Frontend Engineers (HRMS Web Portal / Dashboard)  
**Priority:** 🔴 High / Blocking Production Workflow  
**Related Endpoints:**
- `POST /api/v1/notifications/devices` (Register Browser Device)
- `DELETE /api/v1/notifications/devices/:id` (Unregister on Logout)
- `POST /api/v1/attendance/locations/live-ping` (Report GPS Coordinates)
- `POST /api/v1/hr/attendance/employees/:userId/locate` (HR Trigger)

---

## 1. What Is Happening & The Root Cause

### The Problem
When an employee is actively working and logged into the **Web Portal**, and an HR manager tries to verify their location using **"Locate Employee"**, the HR screen shows an error:
> ❌ *"Employee need to login on the mobile phone"*

### Why This Is Happening (Backend Reality)
1. **Login does NOT register a device:** Simply entering username/password and getting a JWT establishes an HTTP session, but it **does not register a push device** in the database `notification_devices` table.
2. **Backend check:** When HR triggers a location request, the backend checks:
   ```javascript
   devices = await notificationDeviceRepo.findActiveForUser(orgId, targetUserId);
   if (!devices || devices.length === 0) {
     throw new AppError(422, 'The employee has no device registered to receive the request', 'NO_ACTIVE_DEVICE');
   }
   ```
   Because the Web client never registered its browser push token, `devices` is empty. The backend responds with:  
   `HTTP 422: NO_ACTIVE_DEVICE` (`"The employee has no device registered to receive the request"`).
3. **Misleading Frontend Error Message:** The HR dashboard UI catches `NO_ACTIVE_DEVICE` and displays a hardcoded message telling HR that the employee must use a mobile phone.  
   **This is incorrect! Web browsers are 100% planned and supported to receive location requests and push notifications.**

---

## 2. User-Facing Explanatory Banner & Modal (Action Required)

Web users must be informed **why** notifications are necessary and **what will happen if they block or ignore them**.

### 2.1 Recommended In-App Banner UI (Show Post-Login / Dashboard)

Place a dismissible banner or soft-prompt modal on the employee's dashboard immediately after login if notification permission is `'default'` or `'denied'`.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔔 Enable Browser Notifications to Stay Verified & Connected                           [ Allow Now ]  │
│                                                                                                        │
│ HRMS requires browser notifications to verify on-duty location and send critical updates:              │
│  • Attendance & Location Verification: HR cannot confirm your on-duty location without notifications,  │
│    which will flag attendance anomalies and cause "No Active Device" errors.                           │
│  • Instant Work Updates: Receive real-time alerts for leave approvals, reimbursements, and tasks.      │
│  • Payroll: Get immediate alerts as soon as your monthly payslip is ready.                             │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Exact Message Copy to Display to Employees

#### Case 1: Permission is `'default'` (Prompting for the first time)
> **Title:** Enable Notifications for Attendance & Work Updates  
> **Body:**  
> *"HRMS uses browser notifications to verify your active on-duty location and deliver real-time alerts.  
> **If notifications remain disabled:**  
> 1. HR/Managers cannot verify your location, causing attendance verification flags and 'No Active Device' errors.  
> 2. You will miss immediate notices for leave request decisions and urgent task reassignments.  
> 3. Payslip availability alerts will not reach your desktop.  
> Please click **Allow Notifications** when your browser prompts you."*  
> **Buttons:** `[ 🔔 Allow Notifications ]` &nbsp;&nbsp; `[ Remind Me Later ]`

#### Case 2: Permission was `'denied'` (User previously clicked "Block")
> **Warning Alert:**  
> *"⚠️ **Notifications are blocked in your browser.**  
> HR will not be able to verify your location or approve remote/field attendance while notifications are blocked.  
> **To fix this:** Click the lock or tune icon (🔒) on the left of your browser address bar, set **Notifications** to **Allow**, and reload the page."*

---

## 3. Step-by-Step Technical Implementation for Web Developers

### Step 1: Prompt Permission & Register Push Token
When the user clicks `[ Allow Notifications ]`, request browser permission and register the token with the backend:

```javascript
// src/services/pushNotification.service.js

export async function requestWebPushPermissionAndRegister() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('Push messaging is not supported in this browser.');
    return;
  }

  // 1. Request Browser Permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('User dismissed or denied notification permission.');
    return;
  }

  // 2. Ensure Service Worker is registered
  const registration = await navigator.serviceWorker.ready;

  // 3. Subscribe to Web Push using server VAPID Public Key
  // (Or if using Firebase JS SDK: const token = await getToken(messaging, { vapidKey: '...' }))
  const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY; // from backend .env PUSH_WEBPUSH_VAPID_PUBLIC_KEY
  
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  // 4. Send subscription to the backend
  const pushToken = JSON.stringify(subscription);
  const response = await fetch('/api/v1/notifications/devices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('access_token')}`
    },
    body: JSON.stringify({
      platform: 'web',
      push_token: pushToken,
      device_name: `${getBrowserName()} on ${getOSName()}`,
      app_version: '1.0.0'
    })
  });

  const resData = await response.json();
  if (resData.success && resData.data?.id) {
    // SAVE this device ID locally to unregister upon logout!
    localStorage.setItem('hrms_push_device_id', resData.data.id);
    console.log('✅ Web push device successfully registered with backend.');
  }
}

// Utility: convert VAPID base64 key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

---

### Step 2: Handle Incoming Location Request in Service Worker (`sw.js`)

> [!IMPORTANT]
> **Browser Security Limitation:** Modern browsers (Chrome, Edge, Firefox, Safari) strictly forbid background Service Workers from calling `navigator.geolocation` silently.  
> Therefore, when the backend sends a location request push (`action: 'REQUEST_LOCATION'`), the service worker must show an interactive desktop notification with a **`[📍 Share Location]`** button.

```javascript
// public/sw.js (Service Worker)

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  // A. Location Request Push from HR/Manager
  if (data.action === 'REQUEST_LOCATION' || data.type === 'LOCATION_REQUEST') {
    const requestId = data.requestId;
    event.waitUntil(
      self.registration.showNotification('HR Location Verification', {
        body: 'HR has requested your active location for attendance verification.',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `loc-req-${requestId}`,
        requireInteraction: true, // Keep notification on screen until user interacts
        data: {
          requestId: requestId,
          url: `${self.location.origin}/dashboard?sync_location=true&request_id=${requestId}`
        },
        actions: [
          { action: 'share_location', title: '📍 Share Location' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      })
    );
    return;
  }

  // B. Standard Engine Notification (Leave, Payroll, Tasks, etc.)
  if (data.type === 'NOTIFICATION') {
    const title = data.notification?.title || 'HRMS Notification';
    event.waitUntil(
      self.registration.showNotification(title, {
        body: data.notification?.body || '',
        icon: '/favicon.ico',
        data: { screen: data.screen, id: data.id }
      })
    );
  }
});

// When user clicks the notification or the [📍 Share Location] button:
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const { requestId, url } = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If HRMS tab is already open, focus it and trigger sync via postMessage
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'TRIGGER_LOCATION_SYNC', requestId });
          return client.focus();
        }
      }
      // 2. If no tab is open, open the dashboard with query params
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
```

---

### Step 3: Capture and Report Coordinates in the Web Client

In your root layout or dashboard hook (e.g. `useLocationSync.js`):

```javascript
// src/hooks/useLocationSync.js
import { useEffect } from 'react';

export function useLocationSync() {
  useEffect(() => {
    // 1. Listen for postMessage from Service Worker
    const handleMessage = (event) => {
      if (event.data?.type === 'TRIGGER_LOCATION_SYNC') {
        reportCurrentLocation(event.data.requestId);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // 2. Handle URL query param (if window was opened from closed state)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('sync_location') === 'true') {
      const requestId = urlParams.get('request_id');
      if (requestId) reportCurrentLocation(requestId);
    }

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);
}

async function reportCurrentLocation(requestId) {
  if (!navigator.geolocation) {
    console.error('Geolocation is not supported by this browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      try {
        const res = await fetch('/api/v1/attendance/locations/live-ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            requestId,
            latitude,
            longitude,
            accuracy: accuracy || 10.0
          })
        });

        const data = await res.json();
        if (data.success) {
          console.log('✅ Location successfully reported to HR.');
        }
      } catch (err) {
        console.error('Failed to post location coordinates:', err);
      }
    },
    (err) => {
      console.warn('User denied browser location permission:', err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
```

---

### Step 4: Fix Misleading Error Message on the HR Dashboard

In your HR management portal component where the **"Locate Employee"** button is handled:

```diff
  try {
    await api.post(`/api/v1/hr/attendance/employees/${userId}/locate`);
  } catch (error) {
-   if (error.errorCode === 'NO_ACTIVE_DEVICE') {
-     toast.error('Employee need to login on the mobile phone');
-   }
+   if (error.errorCode === 'NO_ACTIVE_DEVICE') {
+     toast.error(
+       'No active device registered for this employee. The employee must log in and enable notifications on their Web Portal or Mobile App.'
+     );
+   }
  }
```

---

### Step 5: De-register Device on Logout

Ensure your logout handler unregisters the device token to prevent orphaned push registrations:

```javascript
export async function logoutUser() {
  const deviceId = localStorage.getItem('hrms_push_device_id');
  if (deviceId) {
    try {
      await fetch(`/api/v1/notifications/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
      });
    } catch (e) {
      console.warn('Failed to unregister push device during logout:', e);
    } finally {
      localStorage.removeItem('hrms_push_device_id');
    }
  }

  localStorage.removeItem('access_token');
  window.location.href = '/login';
}
```

---

## 4. Verification Checklist for Web Frontend

- [ ] Show explanatory banner/modal to web employees post-login.
- [ ] Call `POST /api/v1/notifications/devices` when permission is granted.
- [ ] Verify `localStorage.setItem('hrms_push_device_id', data.id)` is stored.
- [ ] Add `sw.js` push handler for `REQUEST_LOCATION` showing desktop notification with `[📍 Share Location]`.
- [ ] Wire `POST /api/v1/attendance/locations/live-ping` on notification click.
- [ ] Replace HR UI error message from *"mobile phone only"* to *"enable notifications on Web or Mobile"*.
- [ ] Call `DELETE /api/v1/notifications/devices/:id` on user logout.
