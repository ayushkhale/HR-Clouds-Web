# 02 · Permissions and native setup

Three permissions, one of them load-bearing. **None of them blocks the app.**

| Permission | Asked when | If refused |
|---|---|---|
| Location | the **first punch**, never at launch | the punch still sends, without coordinates |
| Camera | the first time a document is photographed | the Photos and Files pickers still work |
| Notifications | after the first successful punch, not at launch | everything works, nothing is pushed |

---

## Location — the only one that matters

The whole flow is already written: `lib/location.js`, with `GEO_STATUS` as its
vocabulary.

```js
const fix = await getPunchLocation({ prompt: true, timeout: 8000 });
await attendanceAPI.clockIn({ ...base, ...locationPayload(fix) });
```

### Eight outcomes, eight sentences, zero blocks

| `GEO_STATUS` | What the card says |
|---|---|
| `GRANTED` | nothing — the punch just works |
| `DENIED` | "Location is off, so this punch won't show where you were." + Retry |
| `BLOCKED` | the same, plus **Open settings** — asking again does nothing once it's "never ask again" |
| `COARSE_ONLY` | "Only your approximate location is available." Still sends it |
| `SERVICES_OFF` | "Location services are off on this phone." + Open settings |
| `TIMEOUT` | "We couldn't get a location in time." + Retry |
| `UNAVAILABLE` | "This phone couldn't give us a location." + Retry |
| `UNSUPPORTED` | silent — nothing to say |

**The punch sends in all eight cases.** The backend accepts a punch with no
coordinates and flags it, which is the correct outcome: somebody in a basement
car park at 9 a.m. needs to be clocked in, not taught about GPS.

### The permission rationale, in the person's words

Android requires a rationale on the second ask; write it for the person, not
the platform:

> **Why we ask for your location**
> It records where you punched in, so your attendance matches your work
> location. You can clock in without it — the punch is just marked as having
> no location.

### Native setup

**iOS** — `Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>So your clock-in records where you were. You can clock in without it.</string>
```

`WhenInUse` only. **Never `Always`**: background location triggers a separate
App Store review, and this app has no background location feature.

iOS 14+ can grant **reduced accuracy**. That is `COARSE_ONLY`, not a failure —
do not ask for temporary full accuracy on a punch. It is a prompt in the middle
of somebody clocking in, for a precision the geofence check tolerates.

**Android** — `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

Both, and request them together — fine-only on a device that grants coarse
gives you a denial where you'd have had a usable fix.

**No `ACCESS_BACKGROUND_LOCATION`.** It requires a Play Store declaration and
a review video, for a feature that doesn't exist.

Android reports **`pos.mocked`** on a faked fix. `locationPayload` passes it as
`metadata.mock_location` — inside `metadata`, because `stripUnknown` would
silently drop a top-level key that isn't in `clockInSchema`. Do not block the
punch on it; it is information for a manager.

---

## Camera and the photo pickers

Three sources in one row, named plainly: **Camera · Photos · Files**.

**iOS** — `NSCameraUsageDescription` ("To photograph a document you're
uploading") and `NSPhotoLibraryUsageDescription`. On iOS 14+ the **limited
photo library** is a normal outcome, not an error: the person picked two
photos, that is all you get.

**Android 13+** — `READ_MEDIA_IMAGES`, not `READ_EXTERNAL_STORAGE`. The
document picker (`Files`) needs **no permission at all** on any version; it
goes through the system picker. If you find yourself requesting storage
permission for a file picker, you're using the wrong picker.

**Resize before uploading.** A 12MP photo of a PAN card is 4–6MB and takes
forty seconds on mobile data, and the server may reject it after all that.
Resize to ~1600px on the long edge and re-encode at ~80% quality — a document
photo is still perfectly legible, and the upload takes two seconds.

---

## Notifications

Asked **after the first successful punch**, not at launch. A permission prompt
on the first screen is the single biggest cause of a permanent denial, and
notifications are the one permission you cannot re-ask for.

```
Want a reminder to clock out?
We'll nudge you at the end of your shift, and tell you when a payslip is ready
or HR needs a document.
[Not now]  [Yes, remind me]
```

Ask **that** in-app first and only call the OS prompt on "Yes" — a soft ask
costs nothing when refused, and the OS one is a single, final chance.

**iOS 12+ provisional authorization** is worth it here: notifications arrive
quietly in Notification Centre with no prompt at all, and the person promotes
them if they're useful.

Android 13+ needs `POST_NOTIFICATIONS` in the manifest and at runtime.

Phase 8. Until push is deployed, the Settings toggles are **absent**, not
disabled — a switch that promises something nothing sends is worse than no
switch.

---

## The rest of the native setup

| Library | Needs | Trap |
|---|---|---|
| `react-native-keychain` | nothing on iOS; nothing on Android | Keychain access on a device with no passcode falls back to less protection — don't assume `AFTER_FIRST_UNLOCK` means encrypted-at-rest everywhere |
| `react-native-geolocation-service` | the plist/manifest keys above | **not** `@react-native-community/geolocation`; this one actually honours the accuracy and timeout options on Android |
| `react-native-permissions` | the `Podfile` setup block listing **only** the permissions you use | listing a permission you don't use gets the app rejected for an undeclared use |
| `react-native-blob-util` | nothing | writes to the cache dir — which `clearDownloadCache()` must own |
| `react-native-file-viewer` | Android `FileProvider` + a `provider_paths.xml` | without the provider, opening a PDF throws `FileUriExposedException` on Android 7+ |
| `react-native-linear-gradient` | nothing | the purple hero. Not optional — a flat purple header is visibly not our product |
| `react-native-bootsplash` | its generate step, both platforms | the splash must be hidden **once**, from `RootNavigator`, or it stays up forever on a slow start |
| `react-native-config` | a `.env` per scheme/variant | everything in it ships readable inside the APK |
| `react-native-gesture-handler` | `GestureHandlerRootView` with `flex: 1` at the app root | miss it and every sheet gesture silently does nothing on Android, with no error |
| `react-native-safe-area-context` | the provider above navigation | the tab bar height and the sheet's bottom padding both read insets |

Install commands and versions: [00-plan/04-environment-setup.md](../00-plan/04-environment-setup.md).

---

## Reduce motion and the screen reader

`hooks/useReducedMotion.js` reads both OS settings **with change listeners** —
somebody turning reduce-motion on mid-session should not have to restart.

- Reduce motion → durations go to 0, no spring, no stagger, and the skeleton
  stops pulsing. **Sheets keep a shortened slide**: a modal that appears
  instantly with no transition is disorienting rather than calmer.
- Screen reader on → the ring's live clock stops announcing every second (a
  politeness nightmare), and the punch state is announced once per change.

Full rules: [20-design/06-accessibility.md](../20-design/06-accessibility.md).

---

## Checklist

- [ ] Location asked at the first punch, never at launch; all eight
      `GEO_STATUS` outcomes have been seen on a device.
- [ ] A punch with location denied **succeeds**.
- [ ] `BLOCKED` offers Open settings; `DENIED` offers Retry. They are
      different.
- [ ] No `Always` location, no background location, no storage permission for
      the file picker.
- [ ] Images resized before upload.
- [ ] Notifications soft-asked after a punch, and the section is absent until
      push ships.
- [ ] `GestureHandlerRootView` at the root with `flex: 1`.
- [ ] Android `FileProvider` configured; a PDF opens on Android 13 and 14.
- [ ] Reduce motion and TalkBack/VoiceOver both tried on a real device.
