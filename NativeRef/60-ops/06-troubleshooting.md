# 06 · Troubleshooting

Symptom → cause → fix. The ones you will actually hit, roughly in the order a
new React Native project hits them.

---

## Build and tooling

**Metro starts, the app shows a red screen: "Unable to resolve module …"**
A new dependency was installed while Metro was running. Metro caches the module
map. `npx react-native start --reset-cache`. If it persists, the package is
genuinely missing — `npm i` again and check it's in `package.json`, not just
`node_modules`.

**Android build fails on a `:app:mergeDexRelease` or a duplicate class**
Two libraries pulling different versions of the same transitive dependency.
`cd android && ./gradlew app:dependencies` to find it; pin with a
`resolutionStrategy` in `android/build.gradle`.

**iOS build fails right after adding a library**
`cd ios && pod install`. Every native dependency needs it. If it still fails:
`pod deintegrate && pod install`, and as a last resort delete
`ios/Pods`, `ios/Podfile.lock` and `~/Library/Caches/CocoaPods`.

**The build works on your machine and fails on a colleague's**
Node version, JDK version, or a stale `android/.gradle`. Pin the Node version
in `.nvmrc` and the JDK in the setup doc; both are in
[00-plan/04-environment-setup.md](../00-plan/04-environment-setup.md).

**A release build crashes on launch; the debug build is fine**
R8/ProGuard. Check `android/app/proguard-rules.pro` for a missing `-keep` for
whichever library uses reflection. Always test the release build before
uploading — this is why.

---

## The app runs but something is invisibly wrong

**Every gesture inside a sheet does nothing on Android. No error.**
`GestureHandlerRootView` is missing, or it has no `flex: 1`. It must wrap the
whole app, outermost, in `App.jsx`. This costs an afternoon if you don't know
it.

**The splash screen never goes away**
`BootSplash.hide()` was never reached — usually because `RootNavigator`
returned `null` for `isLoading` and the `onLayout` that hides it is inside the
tree that didn't render. `RootNavigator` guards this with both `onReady` and
`onLayout`; if you changed it, restore both.

**A white flash on every navigation**
The React Navigation theme's `background` is still the default white. `navTheme`
in `RootNavigator.jsx` sets it to `color.bg`; a screen that sets its own
background but is pushed over a white container still flashes.

**The tab bar sits under the home indicator / is cut off**
`SafeAreaProvider` is not above the navigator, or the tab bar height isn't
`56 + insets.bottom`.

**A `<Component />` renders nothing and there's no error**
An icon that didn't resolve. `theme/icons.js` tries the Heroicons v1 name then
the v2 name and logs unresolved ones in `__DEV__` — check that log. Rendering
`<undefined />` is silent.

**Text is clipped on one device only**
Font scaling. Test at the largest step. Fix with `numberOfLines` plus
`adjustsFontSizeToFit` on a metric, or by letting the row grow — never by
hard-coding a height.

---

## Auth

**The Login screen flashes for 200ms on every launch**
The splash is being hidden before `isLoading` is false. It must be hidden
**after**.

**Signed in, and then immediately signed out**
The role gate refused the account. Check the decoded role: anything other than
`employee` is refused, by design, and lands on WrongWorkspace. If an employee
account is being refused, the token's `role` claim is not what you expect — log
`workspaceForRole(role)`, not the token.

**A 401 loop: every screen fails and nothing signs out**
A screen is catching its own 401 instead of letting it reach the session bus.
Never handle a 401 locally; `api/client.js` emits and `AuthContext` ends the
session.

**"Your session ended" appears in the middle of a working day**
The token's `exp` is shorter than you think, there's no refresh in play, or the
device clock is wrong. Check `tokenExpiresAt(token)` against the server's clock,
not the phone's.

**A deep link signs the person in and then lands on Home, forgetting the link**
`setLinkingAuthed(true)` isn't being called, or the link arrived more than five
minutes before sign-in and expired (`linking.js`, by design). `peekPendingLink()`
in dev tells you which.

---

## API

**A field you sent is silently missing on the server**
`stripUnknown`. The field is not in that endpoint's schema, so it was dropped
without an error. This is **the** API trap in this product. Check the schema in
`public/ref docs/` (the web repo) before inventing a payload key — an accuracy
field on a punch was invented once and dropped silently; it belongs inside
`metadata`.

**An error message reads `field_overrides.custom_body is required`**
Our validation didn't run before the call. §11 — the press does the checking.
That string is a payload key and no person should ever see it.

**`err.code` is undefined but there clearly is an error code**
Payroll and documents use **`errorCode`**; attendance and leave use **`code`**.
`lib/errors`' `errorCode(err)` reads both. Don't reach into the error yourself.

**A PDF download produces a JSON parse error**
It went through `request()`, which is JSON-only. Use `downloadFile()`.

**An array query param arrives as one item, or duplicated**
`download.js` appends a one-item array once; the api layer's `qs()` repeats it.
Route array params through `repeatSingles()` rather than changing `download.js`.

**A file URL 403s, and it worked a minute ago**
Presigned, ~5 minute lifetime. Fetch a fresh URL on every open. Never cache
one from a list payload, including an `avatar_url`.

**A request hangs for two minutes and then fails**
The client aborts at 110s and the gateway cuts at 120s. If you're seeing 120s,
the abort isn't wired. Nothing in this app should take 110s — that's a server
problem to report, not a timeout to raise.

**The same colleague has a photo on one screen and initials on another**
Two roster sources. `useDirectory()` is the only one. A narrower `purpose`
drops `avatar_url`, and an unpaginated call stops at 100 people.

**A list's status filter does nothing**
For corrections, the backend validates `status` and **does not apply it**
(contract §4.4/§8.4). Fetch unfiltered and filter the loaded page.

---

## Attendance specifically

**The punch button does nothing**
The location promise never settled. `getPunchLocation` has an 8s timeout and
`lib/location.js` never rejects — if it hangs, something re-implemented the
location call without the timeout.

**"Already clocked in" shown as an error**
It isn't one. `isStateReconciliation(err)` → refresh and show nothing. The
person's view was stale.

**The worked clock drifts after a screen lock**
Something is incrementing a counter instead of reading `Date.now()` each tick.
`useLiveWorked` reads the clock; don't replace it with a counter.

**The card shows yesterday at 5:30 a.m.**
A UTC midnight rollover. The timer re-arms off `today?.date`, local.

**The card resets at midnight on a night shift**
The state is being derived locally from `clock_out_time` instead of read from
`today.status`. The server handles the overnight carry-over.

**End Break isn't offered to somebody who is on a break**
`today.breaks` was absent, not empty, and the code read an omission as fact.
`breaksKnown` distinguishes them; when breaks are unknown, show both buttons.

**A geofence miss shows a red error and the punch looks failed**
All four geofence outcomes are a 200/201. Fuchsia at most, never rose, never a
rollback. `evaluated: false` shows **nothing**.

---

## Badges and counts

**The More badge doesn't clear after acknowledging a document**
The write didn't emit. `emitAttendanceChanged(ATTENDANCE_EVENTS.ACKNOWLEDGEMENT)`
the moment it succeeds, and the kind must be listed in `INBOX_EVENT_KINDS` —
a new queue joins that list the day it is added, or the badge is stale until
a restart.

**The badge and the list disagree**
They're using different filters. Both read `compliance_state: 'pending'`.

---

## Performance

**A long list stutters while scrolling**
`FlatList` without `keyExtractor` stability, or a row that recreates a style
object on every render. Hoist styles; memoise rows.

**The app warms up slowly on Android**
Hermes off, or a huge synchronous read at launch. The only launch-time read is
the Keychain, which is ~50ms.

**Battery complaints**
A timer running in the background. Every interval goes through
`useForegroundInterval`, and the live clock stops when the app isn't active.

---

## When the spec and the server disagree

Trust the **live API**, fix the code, and **record the deviation in the file's
header comment** so the next person doesn't "correct" it back. That rule comes
from the web repo and it has earned its place twice over.
