# 01 · Storage and security

This app holds somebody's salary, their bank account and their government ID
numbers on a device that gets lost, shared and sold. Four storage layers, and
**what goes in which is not a judgement call**.

---

## The four layers

| Layer | What goes in it | What must never | Survives |
|---|---|---|---|
| **Keychain / Keystore** (`react-native-keychain`) | the access token, the refresh token | anything you'd be happy to lose | reboot, until sign-out |
| **AsyncStorage** | the last work mode, the last tab, a "seen this tip" flag | any token, any PII, any amount | reboot |
| **Memory only** (React state / module) | the multi-org `selection_token`, the directory cache, today's attendance | — | nothing |
| **Cache directory** | downloaded payslips and attachments | anything you don't clear on sign-out | until cleared |

```js
// state/session.js — the only file that touches the Keychain
const SERVICE = 'in.hrclouds.employee.session';
accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
```

`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, not `WHEN_UNLOCKED`: the session must
survive a reboot (people reboot and expect to still be signed in), and
`_THIS_DEVICE_ONLY` keeps it out of an iCloud Keychain backup, so restoring a
backup onto a new phone does not restore somebody's payroll session.

**The token is not bound to biometrics.** An optional app lock is a separate,
explicit Phase 8 feature — conflating the two means a fingerprint failure signs
somebody out of an app they need at 9 a.m.

---

## The selection token is never written down

A multi-org login returns a `selection_token` that lives for seconds. It stays
in `AuthContext` state and is dropped. Not AsyncStorage, not the Keychain, and
**not route params** — navigation state ends up in crash reports and state
snapshots.

---

## Sign-out clears five things

`clearSession()` is the only correct way to sign out, and it is already written:

```js
clearToken();                                  // 1. the in-memory token
Keychain.resetGenericPassword({ service });    // 2. the stored credential
AsyncStorage.multiRemove([...]);               // 3. cached preferences
clearDirectoryCache();                         // 4. the people cache (names, photos)
await clearDownloadCache();                    // 5. downloaded payslips
```

**Number five is the one people forget.** A payslip downloaded to the cache
directory is a PDF of somebody's salary sitting on a phone that the next person
to use it can open through any file manager. Clearing it is not paranoia, it is
the difference between a sign-out and a logout screen.

---

## PII never reaches a log

```js
// ✗ never
console.log('punch', { lat, lng, user });
console.log(err.response);                 // may carry the whole payload

// ✓
if (__DEV__) console.log('[punch] sent', { hasLocation: !!fix });
```

- No name, email, employee code, amount, bank detail, document number or
  coordinate in any `console.*`, in dev or production.
- **Strip `console.*` in release** (`babel-plugin-transform-remove-console`),
  so a forgotten one can't end up in a device log a support agent reads.
- Crash reporting: scrub the request body before it is attached. A 400 from
  the salary endpoint carries the salary.
- Document numbers are **masked to the last 4** on screen and never logged at
  all — the field help says they're stored securely, so make that true.

---

## Screens that must not appear in the app switcher

iOS and Android both snapshot the current screen when the app backgrounds, and
that snapshot is stored unencrypted. The payslip detail, the salary structure
and the bank-account form are the three that matter.

```js
// Android, once, in MainActivity: FLAG_SECURE while a sensitive screen is up
// iOS: react-native-privacy-snapshot, or an overlay on AppState 'inactive'
```

Phase 8, not Phase 2 — but decide it before the store submission, because
"screenshots of payroll data in the task switcher" is a question a security
review will ask.

---

## The network

- **HTTPS only.** No `NSAllowsArbitraryLoads`, no `cleartextTrafficPermitted`,
  not even for a local dev API — point dev at a tunnel instead.
- **No certificate pinning.** It breaks every time the certificate rotates, it
  is bypassed trivially on a rooted device, and the failure mode is "the app
  stopped working for everyone" during a renewal nobody told you about.
- The token goes in `Authorization: Bearer`, never in a query string — URLs are
  logged by every proxy in the path.
- `react-native-config` holds the API base URL. **It is not a secret store**:
  everything in `.env` is readable in the APK. No API key that matters goes
  there.

---

## Permissions are a privacy surface too

Location is requested **at the first punch**, never at launch, and the app
works without it ([02-permissions-and-native.md](02-permissions-and-native.md)).
The store listings must describe why, in the same words the in-app prompt uses.

---

## A 401 from anywhere ends the session

`api/client.js` emits on the session bus; `AuthContext` subscribes and calls
`endSession({ expired: true })`. One path, so there is no screen that handles a
401 by itself and leaves a dead token in the Keychain.

Expiry is also re-checked **on return to the foreground**, because a timer does
not fire reliably while a phone sleeps — a phone closed on Friday and opened on
Monday has an expired token and a `setTimeout` that never ran.

---

## Checklist before a release

- [ ] No token outside the Keychain; no PII in AsyncStorage.
- [ ] `clearSession()` clears all five things; verified by signing out and
      looking for a cached payslip with a file manager.
- [ ] `console.*` stripped in release; no PII in any remaining log line.
- [ ] Crash-report bodies scrubbed.
- [ ] HTTPS enforced on both platforms, no cleartext exception shipped.
- [ ] Document numbers masked everywhere they appear.
- [ ] Location requested at first use, with the same reason as the store
      listing.
