# 03 · Offline, and the app lifecycle

## The offline policy, in one line

**Reads degrade. Writes refuse.** Nothing is ever queued.

---

## Why writes are never queued

It is tempting, and it is wrong for this app specifically.

A punch is a payroll and legal artefact. A punch queued at 9:02 and replayed at
9:41 when the signal returns is **a false record** with a server timestamp
forty minutes late — and in the meantime the person believes they are clocked
in and they are not. The same reasoning covers an acknowledgement (a compliance
record of *when* somebody read a policy), a leave cancellation (a balance moves)
and a claim submission (money).

So: a write with no connection shows **one sentence and a live Retry**.

```
You're offline. We haven't clocked you in — try again when you have signal.
[ Try again ]
```

The button stays live (§11): the person can fix this by walking ten feet.
`isOffline(err)` from `lib/errors` detects it; `OFFLINE_MESSAGE` is the one
string, declared once.

**This is a product decision, not a technical limitation.** Record it in the
header comment of any screen where somebody will be tempted to add a queue.

---

## What reads do offline

| Screen | Offline |
|---|---|
| Home / punch card | last known state + an indigo "this is what we last knew" line. Buttons visible, fail clearly |
| Attendance history | the last fetched page stays; no new pages |
| Holidays | fully usable from cache — it's the thing people check on a long weekend |
| Payslip list | the list stays; **downloads fail** (presigned URLs need the network anyway) |
| Directory | the cached roster is searchable; one line says so |
| Everything else | `ErrorState` with `kind: 'offline'` and a Retry |

`errorPresentation(err, domain)` returns `{ message, retryable, kind }` so
`ErrorState` renders the offline case differently from a server error — and
drops "Try again" for `kind: 'unavailable'`, where retrying cannot help.

There is **no persistent read cache** beyond what's in memory and the few
AsyncStorage preferences. A caching layer is deferred on purpose: every screen
is one call away from fresh, and a stale cached balance is worse than a spinner.

---

## The lifecycle, which matters more than offline

A phone app spends most of its life backgrounded, and the web app's
`document.visibilityState` has no equivalent — `hooks/useAppActive.js` is the
replacement.

```js
useOnAppActive(refresh);                 // fires ONLY on a transition into 'active'
useForegroundInterval(tick, 1000);       // polls only while foregrounded
const active = useAppActive();
```

**iOS has a third state, `inactive`** — a permission sheet, the app switcher,
an incoming call. `useAppActive` handles it explicitly, so a location prompt
closing does **not** count as a return from the background and does not fire a
refresh in the middle of a punch.

### Four refresh triggers, no poller

`useTodayAttendance` refreshes on:

1. the **event bus** — `emitAttendanceChanged` after any write,
2. **returning to the foreground** — `useOnAppActive`,
3. **local midnight** — a timer re-armed off `today?.date`,
4. **pull to refresh**.

Those four cover every real case. **A 30-second poll would be ~2,900 requests
per person per day** for a number that only changes when the person presses a
button — and on a phone that is battery, data and a backend bill.

Every poller that does exist checks `document.visibilityState`'s native
equivalent first. `useForegroundInterval` is the only way to write one.

### Local midnight, not UTC

The midnight timer re-arms off the server's `today.date`. A UTC rollover fires
at 5:30 a.m. IST and shows yesterday's card to the early shift.

### The live clock

`useLiveWorked` ticks **1s, only while clocked in and only while foregrounded**,
and reads `Date.now()` on every tick rather than incrementing a counter. An
incremented counter drifts by minutes across a screen lock, and the number it
drifts away from is somebody's pay.

---

## Token expiry across a sleep

A `setTimeout` does not fire reliably while a phone sleeps. A phone closed on
Friday and opened on Monday has an expired token and a timer that never ran.

`AuthContext` therefore re-checks expiry **on every return to the
foreground**, in addition to the timer, and any 401 from anywhere ends the
session through the client's session bus. One path, so no screen handles a 401
by itself.

`setTimeout` also overflows past ~24.8 days — `MAX_TIMER_MS` guards it, and
anything longer is caught by the foreground check.

---

## Stale responses

Every screen guards with a `cancelled` flag or a request token ref. Two
patterns, both already in the starter:

```js
// per-effect
let cancelled = false;  …  if (cancelled) return;  …  return () => { cancelled = true; };

// per-hook, when a param changes faster than responses arrive (the month stepper)
const token = ++tokenRef.current;  …  if (token !== tokenRef.current) return;
```

The month stepper is the case that bites: tap `‹` three times quickly and three
requests are in flight. Without a token, whichever answers last wins, and it
isn't necessarily the month on screen.

**Duplicate requests in dev are StrictMode**, not a bug. Don't "fix" them.

---

## Bulk writes

`settleWithLimit`, never a sequential await loop and never an unbounded
`Promise.all`. There is no bulk write in the employee app today; when one
arrives (acknowledging five documents at once), it uses the limiter.

**No request per row.** Use the bulk endpoint, and refresh **one row** after a
write rather than the whole list.

---

## App state and navigation

- **Never persist navigation state.** Restoring somebody into a half-filled
  claim form from last Tuesday is worse than starting fresh.
- Which tab they were on is React Navigation's own in-memory state and survives
  backgrounding, which is enough.
- An open sheet closes on navigation. That is deliberate.
- A list's page and filter are local state and reset on unmount. Also
  deliberate — a stale page 5 of a one-page filter was a web bug.

---

## Checklist

- [ ] Airplane mode: every screen shows an offline state, no crash, no spinner
      that never ends.
- [ ] A punch in airplane mode fails with one clear sentence and a live Retry,
      and is **not** queued.
- [ ] Background the app for 20 minutes and return: today's state refreshes
      once, the clock is correct, nothing polled while away.
- [ ] Cross local midnight with the app open: the card rolls over.
- [ ] Open a location prompt mid-punch: no spurious refresh (the iOS
      `inactive` case).
- [ ] Tap the month stepper five times fast: the list matches the month shown.
- [ ] Leave the app backgrounded past token expiry and return: one clean
      sign-out with "Your session ended", not a screen of failed calls.
