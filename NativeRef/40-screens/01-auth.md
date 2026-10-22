# 01 · Auth — Login · Otp · ForgotPassword · SelectOrg · WrongWorkspace

Five screens, outside the tab bar, in their own stack. Phase 2 — the first
thing you build after the shell, because nothing else can be tested signed out.

The whole flow is in `state/AuthContext.jsx` already. These screens **call it
and render what it says**; none of them talks to `authAPI` directly except
ForgotPassword, which is the one flow AuthContext doesn't own (it starts no
session).

---

## Login

### 1 · What it's for

Getting into the app with a work email (or employee code) and a password. For
most people this screen is seen once and never again — the session survives a
reboot — so it must be fast and forgiving, not clever.

### 2 · Web ancestor

`src/auth/Login.jsx`. What **not** to port: the marketing panel beside the
form, the "remember me" checkbox (a native session is remembered by default),
and the password-strength meter (that belongs on a reset, not a sign-in).

### 3 · Data

| Call | Via | Blocks paint |
|---|---|---|
| `login({ identifier, password })` | `useAuth().login()` | no — on press |
| `googleAuth({ idToken })` | `useAuth().loginWithGoogle()` | no — optional, Phase 8 |

`login()` returns `{ ok, needsOrg, refused }`:

- `ok` → AuthContext flips `isAuthenticated` and **RootNavigator swaps the
  stack for you**. Do not navigate. A `navigate('AppTabs')` here races the
  unmount and crashes.
- `needsOrg` → `navigate('SelectOrg')`. The selection token is already in
  context; never put it in params.
- `refused` → `navigate('WrongWorkspace')`. The gate already cleared the token.
- all false → a bad credential. Show the error inline.

### 4 · Layout

```
Screen (scroll, no header, keyboardShouldPersistTaps="handled")
  logo                               48pt, centred, marginTop 48
  h1    "Sign in"
  small "Use the email your workplace knows you by."
  ── InlineAlert tone="rose"          only when there is an error
  ── InlineAlert tone="blue"          only when sessionExpired
  Field  "Email or employee code"  → TextField kind="email"
  Field  "Password"               → TextField kind="password" (eye toggle)
  LinkButton "Forgot your password?"            right-aligned
  Button primary fullWidth "Sign in"            loading while in flight
  ── divider "or"                    Phase 8 only
  Button outline fullWidth "Continue with Google"
  caption, centred: the app version from react-native-config
```

`TextField kind="email"` already sets `autoCapitalize="none"`,
`autoComplete="username"`, `keyboardType="email-address"` and
`textContentType="username"` — which is what makes the OS password manager
offer to fill it. An employee code in an email field is fine; the backend takes
either in `identifier`.

### 5 · States

| State | What shows |
|---|---|
| Idle | the form, no red |
| Submitting | `Button loading` — label stays, spinner beside it |
| Bad credentials | `InlineAlert` rose: "That email or password didn't match. Check them and try again." Both boxes red, password cleared, focus back on password |
| Rate-limited (429) | the button **disabled** with `disabledReason` "Too many tries — wait a minute", and a live countdown. This is the one case §11 allows a dead button: pressing cannot fix it |
| Offline | rose alert "You're offline. Connect and try again." The button stays live |
| `sessionExpired` from context | an indigo alert above the form: "Your session ended. Sign in to carry on." Shown once; `acknowledgeExpiry()` on first keystroke |
| Account locked / deactivated (403) | rose alert with the server's mapped message, and no retry |

### 6 · Actions

**Sign in** — §11 applies even here, with only two boxes:

```js
const problems = {};
if (!identifier.trim()) problems.identifier = 'Enter your email or employee code.';
if (!password) problems.password = 'Enter your password.';
if (focusFirstProblem(problems, idFor)) return;   // reveals, reddens, travels
```

No email-format regex. An employee code is a valid `identifier` and a regex
would reject it — the server decides.

**Forgot your password?** → `navigate('ForgotPassword', { identifier })`, so the
person doesn't retype what they just typed.

No event-bus emit: there is no inbox yet.

### 7 · Field help

**No field qualifies.** Email, password and "sign in" are the most ordinary
fields in software (CLAUDE.md §10, first row of the table). An ⓘ here is noise,
and the screen has no domain term on it at all.

### 8 · Traps

- **Never navigate on success.** RootNavigator's stack swap is the navigation.
- **The error must not name a field key.** A 400 from this endpoint can say
  `identifier is required`; map it through `authErrors` (`lib/errors`).
- **Don't trim the password.** Trailing spaces are legal characters and
  trimming silently breaks somebody's password manager entry.
- **`autoFocus` on a phone** opens the keyboard over the button on a 390pt
  screen. Focus the first field only if the form is empty, and let the scroll
  view handle the rest.

---

## Otp

### 1 · What it's for

Entering the six-digit code sent by email, during a password reset. (Login
itself does not use an OTP today — this screen exists for the reset flow and
is reused if OTP sign-in is ever turned on.)

### 3 · Data

| Call | Params | Note |
|---|---|---|
| `authAPI.verifyForgotPasswordOtp` | `{ identifier, otp, context, requestId, newPassword }` | verifies **and** sets the password in one call |
| `authAPI.resendOtp` | `{ identifier, context, requestId }` | **returns a NEW `requestId`** |

### 4 · Layout

```
Screen (no scroll, centred)
  h1    "Check your email"
  body  "We sent a 6-digit code to {maskedIdentifier}."
  six-box code input (one TextInput, boxes drawn)      autoComplete="one-time-code"
  FieldError                                            under the boxes
  Button primary fullWidth "Verify"
  LinkButton "Send it again"            disabled with a 30s countdown
  LinkButton "Use a different email"    → pop back to ForgotPassword
```

Mask the identifier as `a•••@company.com` — the full address is already known
to the person and a half-masked one confirms they typed the right thing.

### 5 · States

Idle · submitting · wrong code (boxes red, cleared, focus first) · **expired
code** (a distinct message: "That code has expired. Send a new one." — not
"wrong code", because the person typed it correctly) · resend cooldown ·
offline · too many attempts (button disabled, with the wait).

### 6 · Actions

**Verify** — blocked unless the code is exactly 6 digits AND the new password
passes its own rules. Both problems are shown at once.

**Send it again** — on success you **must replace the stored `requestId`**. The
old one is dead the moment resend succeeds; sending it back gives
"invalid request" and looks like the code is wrong.

### 7 · Field help

**No field qualifies.** A one-time code is ordinary and self-explaining, and
the screen's own body text already explains it.

### 8 · Traps

- One `TextInput` behind six drawn boxes, not six inputs. Six inputs break
  paste, break the OS autofill of an SMS/email code, and make backspace jump
  unpredictably.
- `autoComplete="one-time-code"` (iOS) / `autoComplete="sms-otp"` (Android) is
  what makes the keyboard offer the code. Without it people alt-tab to mail.
- The resend countdown must survive a re-render — keep the deadline, not the
  remaining seconds.

---

## ForgotPassword

### 1 · What it's for

Asking for a reset code, then setting a new password. Two steps, two screens
(this one and Otp), because asking for a new password before the code arrives
means typing it twice if the code never comes.

### 3 · Data

`authAPI.forgotPassword({ identifier })` → `{ context, requestId }` in `data`.
Carry both into `Otp` as params — they are not credentials, they are a
request handle, and they expire with the code.

### 4 · Layout

```
h1    "Reset your password"
body  "We'll email you a 6-digit code."
Field "Email or employee code"  → TextField kind="email"
Button primary fullWidth "Send the code"
LinkButton "Back to sign in"
```

### 5 · States

Idle · submitting · **sent** (navigate away, don't show a success screen) ·
unknown account — see the trap · offline · rate-limited.

### 6 · Actions

**Send the code** — `identifier` required; nothing else to check.

### 7 · Field help

**No field qualifies.**

### 8 · Traps

- **An unknown email must look identical to a known one.** The API answers 200
  either way, deliberately: telling a stranger which addresses exist is an
  account-enumeration hole. Don't "improve" the copy to say "no such account",
  and don't branch on a count in the response.
- The new password is set by the **verify** call, not by this one. There is no
  separate reset endpoint.

---

## SelectOrg

### 1 · What it's for

One person, more than one organisation. Pick which one this session is for.
Rare — most people never see it — but when it appears it must be obvious,
because getting it wrong means seeing somebody else's company.

### 3 · Data

Nothing is fetched. `useAuth().selection` already holds
`{ token, organizations[] }` from the login response.
`chooseOrganization(orgId)` spends the token.

### 4 · Layout

```
h1    "Choose a workspace"
small "Your account is in more than one organisation."
FlatList of Card rows:
  Avatar (org logo, or initials)   name                  →
                                   roleLabel(role) · caption
Button ghost fullWidth "Sign out"       bottom, pinned
```

Show the **role label in words** ("Employee", "HR Admin") under each name —
never the raw role, never the org id (§4). If an organisation's role isn't an
employee role, still list it: refusing it here would be a second gate in a
second place. Picking it lands on WrongWorkspace, which is the one place that
explains it.

### 5 · States

Idle · one tile submitting (that row shows a spinner, the others go
non-interactive) · **token expired** (a rose alert: "That took too long. Sign
in again." and a button back to Login — the selection token lives for seconds)
· offline · refused role (navigate to WrongWorkspace).

### 6 · Actions

**Pick an organisation** → `chooseOrganization(org.id)`. On `ok`, do nothing —
the stack swaps. On `refused`, go to WrongWorkspace.

### 7 · Field help

**No field qualifies.** The screen is three sentences and a list of names.

### 8 · Traps

- **The selection token is never persisted** and never put in route params. It
  lives in AuthContext state for the few seconds this screen is up
  (`state/session.js` header). A token in navigation state is a token in a
  crash report.
- Going back from here must return to **Login**, not into the app.

---

## WrongWorkspace

### 1 · What it's for

Telling somebody whose account isn't an employee account that this app isn't
for them, in a way that doesn't read as an error they caused.

**It is already built** — `navigation/RootNavigator.jsx` defines it, because a
registry placeholder here would say "this screen isn't built yet" to an HR
admin on day one.

### 3 · Data

None. `wrongWorkspaceCopy(role)` from `state/session.js` supplies both
sentences, naming the role in words.

### 4 · Layout

A centred lock glyph in a purple circle, `h1`, one body paragraph, and one
button: **"Sign in as someone else"**.

### 5 · States

One. There is nothing to load and nothing to fail.

### 6 · Actions

**Sign in as someone else** — drops the refusal, clears any held deep link,
resets the auth stack to Login. The token is already gone: the gate clears it
before this screen mounts.

### 7 · Field help

**No field qualifies**, and nothing on this screen may link anywhere into the
app.

### 8 · Traps

- **Never offer a way in.** No "continue anyway", no read-only mode, no
  "switch to employee view". The backend would allow it — every self-service
  endpoint accepts every tenant role — and that is exactly the hole this
  screen exists to close (CLAUDE.md §2, the 2026-10-01 incident).
- **No raw role on screen.** `roleLabel()` turns `hr` into "HR Admin"; an
  unknown role gets the generic sentence, not the code.
- Don't offer "open hrclouds.in" as a button. A web link out of a refusal
  screen is fine as *text* (people know what to do with a domain name), but a
  button that leaves the app on launch is how a store review fails.

---

## Field-help outcome for this spec

`auth.*` surfaces: **no entries, on purpose.** Every field across all five
screens is ordinary (email, password, one-time code) or is a name in a list.
CLAUDE.md §10's first row is explicit — ordinary fields never get an ⓘ — and
forcing one in would make the first screen of the app the noisiest.

The first real field help appears on Home, with work mode and the geofence
(see [02-home-and-punch.md](02-home-and-punch.md) §7).
