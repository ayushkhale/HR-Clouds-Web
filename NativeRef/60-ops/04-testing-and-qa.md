# 04 · Testing and QA

No test framework is prescribed for v1. What **is** prescribed is the manual
pass below, because the failures that matter in this app are device failures —
a permission state, a timezone, a font scale — and no unit test catches them.

---

## The four devices

| Device | Why |
|---|---|
**A small Android**, 360×640, Android 11 | the real floor. If it works here it works |
**A current Android**, Android 14 | the Android 13+ permission model (media, notifications) |
**An iPhone with a notch**, iOS 16+ | safe-area insets, the `inactive` state |
**An old iPhone SE**, 375pt | the narrowest screen anybody will use |

A tablet pass is nice, not required — but the layouts must not break, so check
one at 1366-equivalent width once.

---

## The punch matrix — run this one every release

The punch card is the app. Every row is a real situation.

| # | Situation | Expected |
|---|---|---|
| 1 | Clock in, location granted | punch recorded, location noted, no notice unless geofenced |
| 2 | Clock in, location **denied** | **punch succeeds**, one sentence, Retry offered |
| 3 | Clock in, location **blocked** ("never ask again") | punch succeeds, **Open settings** offered, not Retry alone |
| 4 | Clock in, location services off | punch succeeds, Open settings |
| 5 | Clock in with GPS indoors (slow fix) | the 8s timeout fires, punch still succeeds |
| 6 | Clock in outside the geofence | **fuchsia** notice, punch succeeded, never rose, never rolled back |
| 7 | Clock in on an org with geofencing off | **nothing shown at all** (`evaluated: false`) |
| 8 | Clock in in airplane mode | fails clearly, **not queued**, button still live |
| 9 | Clock in twice (double-tap) | one punch; the second is state reconciliation → silent refresh |
| 10 | Clock in on web, then open the app | the app shows **working** (server state, not local) |
| 11 | Start break, background, return after 10 min | break minutes correct, clock not drifted |
| 12 | Clock out with a confirm, then cancel the confirm | **no API call fired** (the `await window.confirm` trap) |
| 13 | Hybrid contract | the work-mode toggle appears, remembers the last choice |
| 14 | Non-hybrid contract | **no toggle**, and nothing sends `work_mode` |
| 15 | `getMyFieldAssignments` fails | toggle hidden, punch still works |
| 16 | Night shift crossing midnight | the overnight carry-over is respected; the card doesn't reset at 00:00 |
| 17 | Cross local midnight with the app open | the card rolls over to the new day |
| 18 | Mock-location app running (Android) | punch succeeds, `metadata.mock_location` sent, nothing shown to the person |

Rows 2, 6, 7, 8 and 12 are the ones that regress. Row 7 especially: it is the
only row whose correct behaviour is *nothing happening*.

---

## Per-screen pass

For every screen, force all of these. The ones you cannot trigger naturally,
trigger by hand — throw from the api function, return `[]`, return `null`.

- [ ] **Loading** — a `Skeleton` shaped like the content, not a spinner.
- [ ] **Loaded**
- [ ] **Empty** — says what to do next, not "No data".
- [ ] **Empty filter** — reads differently from an empty list.
- [ ] **Couldn't load** — and it says "Couldn't load", never "Not set" or "0".
- [ ] **Offline**
- [ ] **Partial** — one card's read failed; the rest of the screen is fine.
- [ ] **Refreshing** — pull to refresh does **not** blank the screen.
- [ ] Any domain state in the screen's spec (no shift, no structure, payroll
      not run, window closed, feature off).

### Forms, every one

- [ ] Opens with **no red**.
- [ ] Pressing with everything empty: reveals, reddens, **and scrolls to the
      first problem in screen order**.
- [ ] The box is red, not just a red line of text under a normal-looking box.
- [ ] Every secondary API button (preview, recalculate) validates too.
- [ ] Nothing goes out from an unfinished form — watch the network panel.
- [ ] A dead button only where pressing cannot fix it (in flight, cooldown,
      feature off, lookup failed), and it always has a `disabledReason`.
- [ ] No field forces a scroll before the footer at 390pt.

---

## The sweep that catches house-rule breaches

Do this with your eyes, on a device, on every screen:

- [ ] **No ID anywhere.** No UUID, no raw enum, no `(#a3f2…)`, no id in a
      tooltip or a toast.
- [ ] **No dash.** Unknown → N/A. Unmeasured duration → 0m. No action → an
      empty cell, or no column.
- [ ] **No green, no amber, no orange, no blue, no teal.** Violet, fuchsia,
      indigo, purple, and rose **only** for errors, destructive actions,
      lateness and deductions.
- [ ] **No decimal day.** `2.5` never appears; it reads "2d and 1/2 d".
- [ ] **No raw error code or Joi message.** Everything through `*Errors.js`.
- [ ] **Header title = tab label = the screen's own heading**, word for word.
- [ ] Every row that looks tappable **is**, and every row that isn't **doesn't**.
- [ ] No View/eye/Review button in any row.

---

## Accessibility pass

- [ ] Largest font-scale step: nothing clipped, nothing overlapping, the tab
      bar still readable.
- [ ] VoiceOver and TalkBack: every control has a label; the punch state is
      announced on change; the live clock does **not** announce every second.
- [ ] Reduce motion on: no spring, no stagger, the skeleton still, sheets keep
      a shortened slide.
- [ ] Every tap target ≥ 44pt.
- [ ] Status is never colour alone — `StatusBadge` always carries a word.

---

## Timezone and locale

- [ ] Set the device to a different timezone and punch: the time shown is
      wall-clock, matching what the server recorded.
- [ ] Set the device date forward a day: the midnight rollover behaves.
- [ ] A 12-hour and a 24-hour device both render times sensibly.
- [ ] A device in a non-English locale: the app is still English (v1), and no
      number or date silently reformats with a different separator.

---

## Field-help pass

Per screen, from its spec's §7:

- [ ] Every ⓘ listed is present; nothing listed as "no field qualifies" has
      acquired one.
- [ ] ≤ 4 per screen state, once per concept.
- [ ] **No layout shift** at 390pt — measure with the ⓘ removed and present.
- [ ] Never inside another interactive element or a tab strip.
- [ ] Every hint has an Ask Maya question, and Maya **never auto-sends**.
- [ ] No ⓘ on attendance status / hours / effective / late / overtime, or
      dashboard counts (the 2026-10-01 decision).

---

## What a release candidate must survive

One pass through a real working day, on one device, in order:

1. Install fresh. Sign in. (No login flash on the second launch.)
2. Clock in. Start a break. End it. Clock out, confirming.
3. Request a correction for yesterday. Cancel it.
4. Apply for leave. Check the balance moved. Cancel it. Check it moved back.
5. Open last month's payslip. Download it. Share it.
6. Acknowledge a company document. **Watch the More badge clear without a
   reload.**
7. Upload a document from the camera.
8. Look yourself up in the Directory. Walk two levels of the Org Chart.
9. Sign out. **Look for the downloaded payslip with a file manager — it must
   be gone.**
10. Sign in as a **manager or HR account**: WrongWorkspace, with no way in.

Step 10 is not optional. It is the rule the backend will not enforce for you.
