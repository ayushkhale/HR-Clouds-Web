# 05 · Release and the stores

---

## Identity, decided once

| | Value |
|---|---|
| iOS bundle id | `in.hrclouds.employee` |
| Android package | `in.hrclouds.employee` |
| Display name | **HR Clouds** |
| Keychain service | `in.hrclouds.employee.session` |

**The package name cannot be changed after the first upload.** Not on either
store. Decide it before the first build, and use the same string for the
Keychain service so a future manager app cannot read this app's token.

A separate manager app later means a **separate package** (`…​.manager`), not a
role switch inside this one. That is the mobile expression of "one role, one
workspace".

---

## Versioning

```
versionName / CFBundleShortVersionString   1.4.0     ← people see this
versionCode / CFBundleVersion              140       ← must always increase
```

`versionCode` increases on every upload, including a rejected one. Never reuse
a number; both stores refuse it and the error is unhelpful.

---

## Build variants

Two: **staging** and **production**, by `react-native-config` `.env` file. A
staging build gets a distinct name (`HR Clouds (Staging)`) and ideally a
distinct package suffix, so both can sit on one phone. Nobody should ever have
to guess which API a build on their phone is pointed at.

Everything in `.env` ships readable inside the APK. No secret goes there.

---

## Signing

**Android** — one upload keystore, generated once.

> **Lose it and you cannot update the app.** Back it up somewhere that is not
> the laptop it was made on and not the repo.

Enrol in **Play App Signing**, which makes a lost upload key recoverable by
Google. Do that on the first upload; it cannot be done retroactively without
support.

**iOS** — a distribution certificate and a provisioning profile from the
organisation's Apple Developer account. Use Xcode's automatic signing unless
there's a reason not to. The certificate expires annually and **the build stops
working at that point, silently**, so note the date.

Neither key goes in git. Neither.

---

## Release build checks

```bash
# Android
cd android && ./gradlew bundleRelease     # .aab for the store, not .apk
# iOS
# Xcode → Any iOS Device → Product → Archive
```

- [ ] `console.*` stripped (`babel-plugin-transform-remove-console`).
- [ ] Hermes on, both platforms.
- [ ] ProGuard/R8 on for Android, and **the release build actually tested** —
      minification breaks reflection-dependent libraries, and a crash that only
      exists in release is the worst kind to find after upload.
- [ ] Source maps uploaded to crash reporting, or a stack trace is useless.
- [ ] The app opens, signs in and punches **on the release build**, installed
      from the bundle, not from Metro.
- [ ] No staging API URL in a production build. Check it by looking, not by
      trusting the variant.

---

## Store listing

### Both stores

- **Name:** HR Clouds
- **Subtitle / short description:** "Attendance, leave and payslips for work."
- **Description:** what an employee does with it — clock in and out, request
  leave, see payslips, keep documents. Do not describe the HR or manager
  features; they are not in this app and a reviewer will look for them.
- **Screenshots:** Home with the punch card, Leave, a payslip, My Documents.
  The punch card first. No real names, no real salary — use seeded data where
  the numbers are plausible and the people are invented.
- **Support URL and privacy-policy URL** are mandatory on both stores.

### The two questions both reviewers ask

**1 · "Why does this app need location?"**

Answer in the listing in the same words the in-app prompt uses: it records
where a clock-in happened so attendance matches the work location, it is
requested at the moment of the first punch, and **the app works without it**.

Android additionally requires a **Data safety** declaration and a **Location
permission declaration** form. Because this app uses `WhenInUse`/foreground
location only, no background-location review video is needed — do not add
`ACCESS_BACKGROUND_LOCATION` and inherit that process for nothing.

**2 · "Who can sign in?"**

Both stores need a **working demo account** for an app behind a login. Provide
an employee account on staging with realistic seeded data: a month of
attendance, two payslips, a leave balance, a document to acknowledge. An app
whose demo account shows nine empty states gets rejected as non-functional.

Include a note: *this app is for employees; administrator accounts are served
by the web application*, so the reviewer isn't confused by WrongWorkspace if
they try something else.

### Apple-specific

- **Sign in with Apple** is required only if you offer another third-party
  social sign-in. If Google sign-in ships, Apple sign-in must too — which is a
  reason to keep Google out of v1 and launch with email and password.
- **Account deletion** (guideline 5.1.1(v)): an app with accounts must offer a
  way to delete the account **in the app**. An employee account belongs to the
  employer and the person cannot delete it — so Settings must carry a clear
  in-app path explaining that the account is managed by their employer, with
  the support contact. Say it in the listing too. An app that simply has no
  deletion affordance gets rejected.
- Age rating 4+, category Business.

### Google-specific

- **Data safety** form: declare location (collected, not shared, optional),
  personal info, financial info (payslips), and files. Say that data is
  encrypted in transit and that the account is managed by the employer.
- Target the current API level or the upload is refused.
- Internal testing track first, then closed, then production. Review on a new
  Play account can take days — do not plan a launch around a same-day review.

---

## Rollout

1. **Internal / TestFlight** — the team, one week, the whole QA pass
   ([04-testing-and-qa.md](04-testing-and-qa.md)).
2. **One pilot organisation** — a real one, 20–50 people, two weeks. This is
   the step that finds the things no device matrix does: a shift pattern you
   didn't model, a geofence configured oddly, a payroll month with an arrear.
3. **Staged rollout** — 10% → 50% → 100% on Android. iOS phased release.
4. Watch crash-free sessions and the punch success rate. A punch that fails is
   the only metric that must be near zero.

**Keep a kill switch** for the whole app's writes? No — but do keep the
server-driven capability gating the app already has: a feature the server stops
advertising becomes a hidden control, in a build already on people's phones,
with no release. That is what §7's "gate the UI on what the server returned"
buys you.

---

## After the first release

- The certificate expiry and the keystore backup both go in the team calendar.
- `dist/`-style committed build output does **not** apply here; the native app's
  artefacts are not in the repo.
- A new approval queue, a new screen, a new status: the field-help pass is part
  of that work, not a follow-up (CLAUDE.md §10).
