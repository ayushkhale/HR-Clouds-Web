# Web: the notification centre, and a browser that can answer a location check

**Date:** 2026-10-24
**Target:** whoever touches notifications, the top bar or live location next
**Status:** shipped on `dev`

Two things landed together because they turned out to be one thing. The
notification engine needed a front end; live location needed a registered
device; and a browser becomes a registered device by subscribing to Web Push.
Doing either one alone would have left the other broken.

Sources this implements:

- `md_notifications/notification_api_contract.md`
- `md_notifications/frontend_fcm_and_notification_integration_guide.md`
- `md_notifications/notification_event_catalog.md`
- `md_notifications/notification_rollout_runbook.md`
- `md_updates/2026-10-24_notification_inbox_apis_and_push_payload.md`
- `md_updates/2026-10-24_web_notification_prompt_and_location_device_registration.md`

---

## 1. What a person sees

| Surface | Where | What it is |
|---|---|---|
| Bell + badge | Top bar, every signed-in screen | Unread count, capped at `99+` |
| Bell panel | Under the bell | Newest 12, grouped Today / Yesterday / date; click goes to the thing itself |
| Notifications page | `/dashboard/{employee,manager,hr}/notifications` | The archive: filters, paging, row → record inspector |
| Desktop alerts | Opt-in, per browser | Title and one line; never an amount or anyone's reason |
| Location request | Anywhere, when asked | A dialog with the reason and one "Share my location" press |

The bell used to open the **approvals Inbox**. It no longer does — approvals
moved to `HiInboxIn` beside it and kept their dot. They are different objects:
the tray is what waits on your decision, the bell is what already happened.
Don't merge them back.

---

## 2. Structure

```
src/shared/notifications/
  NotificationsContext.jsx   the one store: badge, first page, every write
  notifications API          -> shared/api/notifications.api.js
  notificationMeta.js        categories, normalisation, day buckets, badge text
  notificationTargets.js     screen/event/category -> a URL IN THE VIEWER'S WORKSPACE
  notificationErrors.js      code -> plain words; the 503 and 404 predicates
  NotificationBell.jsx       bell + badge, owns the panel and the inspector
  NotificationPanel.jsx      the dropdown
  NotificationRow.jsx        one row, shared by the panel and the page's phone layout
  NotificationInspector.jsx  the DetailDialog record inspector
  NotificationDeepLink.jsx   a tapped desktop alert -> the right page
  pushRegistration.js        permission -> service worker -> subscribe -> device registry
  useBrowserAlerts.js        the five states the UI has to render
  PushOptInCard/Nudge/Prompt the page card, the panel line, the post-login prompt
  LocationRequestResponder.jsx  takes the GPS fix and posts it
src/shared/screens/NotificationsPage.jsx
public/sw.js                 Web Push only: caches nothing, intercepts nothing
```

One store, because the badge is on every screen, the panel opens from every
screen and the page is mounted three times. Without a single owner that is
three pollers and three counts that disagree after a read. There is no query
cache in this app, so the owner is explicit and every write broadcasts.

---

## 3. Decisions that are settled, not pending

**Polling, not sockets.** nginx buffers here and auth is Bearer-only, so SSE
cannot carry the token. `unread-count` is a capped index-only scan built to be
polled: every 60 s, and only while the tab is in front.

**The kill switch latches.** One `503 FEATURE_DISABLED` and the bell, the
sidebar entry and the page are gone for the session. No toast, no retry loop,
no error screen. Ops turning the engine off is not an incident the user needs
to hear about.

**Deep links never leave the viewer's workspace.** `metadata.screen` is written
once for every recipient of an event, and the recipients are in different
workspaces — `LeaveRequestDetail` means the manager's queue to a manager, HR's
list to HR, and nothing to the employee who raised it. So a screen name maps to
a *function of the workspace*. A workspace with no such page gets `null` and no
button, never a cross-workspace URL the exact route gate would bounce.

**An unknown screen or event is normal.** The catalog grows. Unknown falls
through to the category, then to no button, and the row still opens its
inspector. Treating it as an error would break the app on every backend ship.

**No ids anywhere.** The notification id and `metadata.id` go into a URL and
nowhere else — not a label, not a tooltip, not the inspector.

---

## 4. The service worker deviates from the mobile contract, on purpose

The mobile guide calls `LOCATION_REQUEST` a **silent** wake-up. On the web it
cannot be:

1. **A service worker may not read GPS.** Every current browser forbids
   `navigator.geolocation` outside a focused document, so there is nobody to
   answer a silent wake-up here. The phone can; this cannot.
2. **`userVisibleOnly: true` is not optional.** Chrome will not grant a web
   push subscription without it, then penalises — eventually revokes — a site
   that receives a push and shows nothing.

So the web shows the request, with the reason, and sharing is a press. The
2026-10-24 web guide says the same. This is recorded in `public/sw.js`'s header
so nobody "corrects" it back.

The worker also does **not** build workspace URLs — it cannot know whether the
reader is an employee, a manager or HR. It focuses an open tab and posts it the
routing keys, or opens `/dashboard?n_screen=…&n_id=…&n_event=…` and lets the
app decide.

---

## 5. `NO_ACTIVE_DEVICE` was the frontend's fault

HR locating a web-only employee got *"Employee need to login on the mobile
phone"*. Wrong on both counts: the browser had simply never registered a push
device, and a browser is perfectly able to receive and answer these. The
message now names both routes, and `MyLocationChecksPage` tells the person
whether **this** browser can answer, with the switch right there if it can't.

The live-ping payload is snake_case: `request_id`, `latitude`, `longitude`,
`accuracy_meters`, `is_mock`, `captured_at`, `battery_level`. The web guide's
sample sends `{requestId, accuracy}`; the Joi schema refuses it, and the
implementation plan and the mobile guide agree against the sample, so the
sample is the thing that is wrong. `platform` is an enum of `android`/`ios`
with no `web`, and it is optional, so it is omitted rather than guessed into a
400. `captured_at` is `position.timestamp`, never `new Date()` — the server
marks a `stale_fix` otherwise.

---

## 6. Opting in

`requestPermission()` is **one-shot**: once somebody presses Block we can never
ask again. So nothing on this path fires from an effect, a login or a page
load — the native prompt is only ever raised by a press, after we have said
what the alerts are for. There are three places to say it:

- **`PushOptInPrompt`** — bottom-left, six seconds after a dashboard page
  settles, only if the browser has never been asked. "Not now" buys a week; a
  blocked browser is told once a month, because only the person can undo that.
- **`PushOptInCard`** — the Notifications page.
- **`PushOptInNudge`** — one line at the foot of the bell panel.

All three read `useBrowserAlerts`, so they cannot claim different things about
the same browser. With no `VITE_PUSH_VAPID_PUBLIC_KEY` in the build, all three
render nothing — absent, not broken.

**Sign-out de-registers the device before clearing the token.** A subscription
belongs to the browser, not the person. Leave it registered on a shared machine
and the next person receives the first one's payslip alerts on their lock
screen. The DELETE needs the token, hence the order.

---

## 7. Configuration

```bash
VITE_PUSH_VAPID_PUBLIC_KEY=   # must match the server's PUSH_WEBPUSH_VAPID_PUBLIC_KEY
```

Blank is a supported state and the one this build ships in: no key means no
subscription is possible, so the opt-in UI is absent. Setting it is all that is
needed to turn desktop alerts on — the inbox, the bell and the page work
without it.

---

## 8. ⓘ field help

Two new surfaces, both gated to `employee`, `manager` and `hr`:

| Surface | Fields |
|---|---|
| `notification.inbox` | `page`, `category`, `mark_all_read`; HR onboarding tier: `actor_name`, `read_at` |
| `notification.browser_alerts` | `push_enabled` |

Four on the Notifications page in its default state, which is the cap, plus the
two onboarding-tier entries that are exempt from it. Nothing on the bell panel:
a dropdown of recent events explains itself. `attendance.my_location_checks`
`fix_returned` was reworded — it said "your phone" and a browser answers now.

---

## 9. Where the next person will trip

- **An unknown query param is a 400.** No `stripUnknown` on this module. Add a
  filter to the api layer's fixed four or it will not reach the server.
- **PATCH takes no body.** `Joi.object({}).max(0)`.
- **Mark-all-read is watermarked.** A badge of 1 after clearing is correct, not
  a bug.
- **Dismiss is a hard delete,** and a second DELETE 404s. That is success.
- **A new approval queue must still emit `emitAttendanceChanged`.** The
  notification feed does not replace the inbox badge bus; they count different
  things.
