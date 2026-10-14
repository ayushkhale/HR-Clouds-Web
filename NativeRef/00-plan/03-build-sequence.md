# 03 · Build sequence

Nine phases. Each one ends in something you can hold in your hand and show
someone. Don't start a phase until the previous one's acceptance list is all
true — the failures this order prevents are noted under each.

Estimates assume one developer working with the starter kit already pasted in.

---

## Phase 0 · Foundation (1–2 days)

**Build**

1. `npx @react-native-community/cli init HRCloudsEmployee` — see
   [04-environment-setup.md](04-environment-setup.md) for versions and the full
   dependency install.
2. Paste `50-starter/src/` into `src/`. Nothing in it imports a screen, so it
   compiles on its own.
3. Wire `App.jsx`: `GestureHandlerRootView` → `SafeAreaProvider` →
   `AuthProvider` → `ToastProvider` → `ConfirmProvider` → `NavigationContainer`
   → `RootNavigator`.
4. `src/config/env.js` + `.env.development` pointing at
   `https://development.hrclouds.in/api/v1`.
5. A throwaway `DebugScreen` with one button per api module that prints the raw
   response. This is the most valuable hour of the whole project.

**Acceptance**

- [ ] App launches on a real Android device and a real iPhone (not just
      simulators — location behaves differently).
- [ ] `tokens.js` colours render; a `<Button>`, `<Card>` and `<StatusBadge>`
      look like the web app side by side on the same screen.
- [ ] `DebugScreen` can hit `/attendance/holidays` with a hand-pasted token and
      print JSON.
- [ ] Hermes + New Architecture confirmed on (`console.log(global.HermesInternal)`,
      and `global.nativeFabricUIManager` is defined).

**Why first:** every later phase assumes `request()` throws the same error shape
the error modules expect. Prove that once, now.

---

## Phase 1 · Auth and the role gate (2–3 days)

**Build**

- `LoginScreen` — identifier + password, Google SSO button, "Forgot password".
- `OtpScreen` — 6 digits, resend with cooldown, carries `requestId` + `context`.
- `ForgotScreen` → OTP → new password.
- `SelectOrgScreen` — only when login answers `requires_org_selection`; uses the
  **selection token**, not the access token (`requestWithToken`).
- `AuthContext`: hydrate from Keychain on launch, decode the JWT for `role` /
  `orgId` / `exp`, expire on `exp` and on `SESSION_EXPIRED`, re-check on
  `AppState` → active.
- **The role gate** (house rules §1) and its `WrongWorkspaceScreen`.

**Acceptance**

- [ ] Sign in as an employee → lands on Home. Kill and relaunch → still signed
      in, no login flash.
- [ ] Sign in as HR / manager / admin → refused with the explanation screen,
      token cleared. **Test all four non-employee roles.**
- [ ] Wrong password shows "credentials" copy and does **not** sign you out of
      an existing session.
- [ ] Token past `exp` → login screen saying the session ended, not a blank
      screen or a spinner.
- [ ] Multi-org account can pick an org and the second org's data loads.
- [ ] A 401 from a data call (force one by corrupting the stored token) returns
      to login once, not in a loop.

**Why second:** the gate is cheapest to build before there are screens to leak
into, and every later phase needs a real token.

---

## Phase 2 · Home and the punch card (4–6 days)

The heart of the app. Budget real time for it.

**Build**

- `HomeScreen`: `PageHeader` (greeting + date), `PunchCard`, today's figures,
  this month's summary tiles, Recent days list (5 rows → `DayLogSheet`).
- `PunchCard` — port `roles/employee/components/AttendanceCard.jsx` faithfully.
  State comes from `/today`, **never re-derived**:
  `idle → working → done`, with `onBreak` inside `working`.
- Native location: `react-native-permissions` + `react-native-geolocation-service`,
  wrapped in `lib/location.js` with the exact `GEO_STATUS` contract from
  `shared/attendance/geolocation.js` — **never rejects**.
- Work-mode selector, **only for a hybrid contract**
  (`choosesWorkMode(contract.work_mode)`), from `/attendance/my-field-assignments`.
- Geofence outcome banner after a punch (`lib/geofence.js` → `geofenceNotice`).
  Four outcomes, **none of them rose**.
- The live running clock (`lib/liveHours.js`) and the progress ring (Reanimated).
- Notes field (max `PUNCH_NOTES_MAX`), optional, collapsed by default.
- `emitAttendanceChanged(PUNCH)` after every punch.

**Acceptance**

- [ ] Clock in with location granted → ring animates, timer runs, correct time
      shown from the server payload.
- [ ] Clock in with location **denied** → explained, retryable, and a
      "Continue without location" that actually punches. Button is never
      disabled because of location.
- [ ] Airplane mode → clock in fails with a readable error and **nothing is
      queued**.
- [ ] Break start / end only appear in the right states.
- [ ] An overnight shift left open shows **yesterday's** date (contract §4.1 —
      `/today` returns that record with `date` = yesterday).
- [ ] Clock out → the day's figures come from the server's calculation, not
      from subtracting the two punch times.
- [ ] Background the app for 10 minutes and return → `/today` refetched
      (`AppState`), timer correct, no drift.
- [ ] Cross local midnight with the app open → the card rolls to the new day.
- [ ] A hybrid employee sees the mode toggle; an office/remote/field employee
      sees **nothing** there.
- [ ] An out-of-bounds punch shows an indigo/fuchsia note saying where it
      landed, **not** an error, and nothing rolls back.

**Traps:** re-deriving `phase` from clock times instead of `status`; blocking
the button on location; treating a geofence result as a failure; showing
`matched_location_id` instead of resolving it to a name.

---

## Phase 3 · The Time module (4–5 days)

**Build**

- `AttendanceScreen` — month stepper, summary tiles, day list, `DayLogSheet`
  (punches · sessions · breaks · flags), "Request a correction" from a day.
- `CorrectionsScreen` + `CorrectionFormSheet` (`lib/validation.js`,
  reason 5–1000 chars). Remember: the backend **validates but ignores** the
  `status` filter — fetch unfiltered and filter the loaded page client-side.
- `FlagsScreen` — `open` / `resolved` / `all`; records carry `is_resolved`,
  **not** `status` (use `anomalyStatusKey()`), and `anomalyLabel()` names the
  punch side so a clock-in and a clock-out flag aren't identical twins.
- `OvertimeScreen` — read-only; `page`/`limit` only, there is no status filter.
- `EarnedLeaveScreen` — summary + list; "Cancelled" means *rejected or
  cancelled* (there is no `rejected` state); `formatDayCount` for credits.
- A `TabStrip` inside the Time tab to switch between these five.

**Acceptance**

- [ ] Every status badge matches the web app's word and colour exactly.
- [ ] A correction submits, appears as Pending, and the tab badge updates with
      no reload (`emitAttendanceChanged(REGULARIZATION)`).
- [ ] Day counts anywhere read "1 Half Day", never "0.5".
- [ ] A month with no records shows an empty state that says what to do next.
- [ ] Stepping to a future month is impossible (`isFutureMonth`).
- [ ] A `geofence_unresolved` flag reads "No work location set up to check
      against" and is **not** worded as misconduct.

---

## Phase 4 · Leave (4–5 days)

**Build**

- `LeaveScreen`: balance tiles per leave type, FilterTabs over requests,
  request list → `LeaveDetailSheet`, upcoming holidays.
- `ApplyLeaveSheet` — a **full-screen form**, two-column grid where it fits:
  leave type, start, end, half-day toggle + first/second half, reason,
  attachment (either a pasted `document_url` **or** a `document_id` from the
  person's own documents — never both).
- Cancel: the backend decides by **date**, not status. Future leave cancels
  instantly and refunds; leave that has started goes to `cancellation_pending`
  and needs a manager. Read `response.message` for "pending manager approval"
  and show the right toast.
- `emitAttendanceChanged(LEAVE)` on submit and cancel.

**Acceptance**

- [ ] Balances agree with the web app to the half day.
- [ ] Applying for leave that overlaps a holiday or weekend produces the
      server's day count, not one you computed.
- [ ] A half-day request shows "1 Half Day" throughout.
- [ ] Cancelling future vs started leave produces two different, correct toasts.
- [ ] Every leave error is mapped copy (`leaveErrors.js`), never a Joi string.
- [ ] The three leave ⓘ surfaces (`leaves.apply`, `leaves.balances`,
      `leaves.request_detail`) are wired.

---

## Phase 5 · Pay (6–8 days — the biggest module)

Build in this order; each is independently shippable.

1. **Payslips** — list, `PayslipSheet` (earnings / deductions / net), **PDF
   download via `files.js`** opened in the OS viewer. Annual statement and
   Form 16 tabs. A held payslip is indistinguishable from one that doesn't
   exist — don't invent a "held" state.
2. **My Salary & Bank** — current structure, `SalaryStructurePanel` equivalent,
   revision history sheet, statutory breakdown, bank account form (`account_type`
   is exactly `savings` | `current`, lowercase — anything else is refused).
3. **Loans & Variable Pay** — loans with "Still to repay" and "monthly
   repayment", instalment schedule sheet, bonuses, adjustments.
4. **Tax & Investments** — summary ("Income tax so far"), projection, regime
   switch, declarations CRUD + submit, proof attachments, Form 16.
5. **Claims & Benefits** — categories, claim create / edit / submit / cancel,
   receipt upload (camera!), limits and headroom, benefits enrolment.

**Acceptance**

- [ ] Every money figure matches the web app **character for character**,
      including Indian grouping and the two-decimal rule
      (`₹57,559.40`, never `₹57,559.4`).
- [ ] A payslip PDF downloads and opens in the OS viewer; a 403 on a held
      payslip shows mapped copy.
- [ ] "Net Pay" never appears — it reads **what reaches the bank**.
      "Gross" reads **before deductions — not take-home**.
- [ ] A claim receipt taken with the camera uploads through the presigned flow
      and the claim submits.
- [ ] All 13 payroll ⓘ surfaces are wired.
- [ ] No screen shows a raw component code — `prettifyCode()` everywhere.

---

## Phase 6 · Documents (4–5 days)

**Build**

- `DocumentsHomeScreen` — the portfolio view, plus the Blank Forms card.
- `MyDocumentsScreen` — list, upload (presigned → confirm), replace, delete,
  versions, view URL → viewer.
- `CompanyDocumentsScreen` — issued documents, **acknowledge** (`{confirm:true}`)
  and **sign** (`{signer_name}`), evidence read-back.
- `RequestsScreen` — requests HR has made of you, plus your checklist; fulfil a
  request by uploading.
- `FormsScreen` — published blank templates, download URL.
- Deep link: `company-documents/:id` opens the right document (transactional
  emails and push both point here).

**Acceptance**

- [ ] Upload from camera, gallery and file picker all work.
- [ ] Acknowledging a document removes it from "needs acknowledgement" without
      a reload.
- [ ] A document type code never appears raw — `humanizeCode()`.
- [ ] A deep link from a cold start lands on the document, not on Home.

---

## Phase 7 · Org, profile, settings (2–3 days)

**Build**

- `CompanyScreen`, `OrgChartScreen` (a tree is hard on a phone — see
  [40-screens/07-org-and-profile.md](../40-screens/07-org-and-profile.md) for
  the recommended drill-down instead of a canvas), `DirectoryScreen` with search.
- `ProfileScreen` — tabs via `TabStrip`, avatar upload (presigned → confirm).
- `SettingsScreen` — biometric lock, notification toggles, Maya visibility,
  sign out, version, open the web app.

**Acceptance**

- [ ] Directory search finds a colleague and shows a photo, not initials, where
      one exists.
- [ ] Avatar upload survives the presigned link expiring mid-flow (retry path).
- [ ] Sign out clears the Keychain, the directory cache and any cached reads.

---

## Phase 8 · Hardening and polish (4–6 days)

- Every ⓘ pass completed and reported (all 24 surfaces).
- Empty, loading, error and offline states on **every** screen — walk the list.
- Reduce-motion and dynamic-type passes.
- Crash reporting (Sentry or Crashlytics) with PII scrubbing — see
  [60-ops/01-storage-and-security.md](../60-ops/01-storage-and-security.md).
- Biometric app lock.
- Performance: cold start under 2.5 s on a mid-range Android; no list drops
  below 55 fps.
- `60-ops/04-testing-and-qa.md` run end to end on four devices.

---

## Phase 9 · Release (2–3 days)

Follow [60-ops/05-release-and-store.md](../60-ops/05-release-and-store.md):
signing, ProGuard rules, store listings, privacy declarations (**location is the
sensitive one — declare the punch use case explicitly**), internal testing
track, then staged rollout.

---

## Running total

| Phase | Days |
|---|---|
| 0 Foundation | 1–2 |
| 1 Auth + gate | 2–3 |
| 2 Home + punch | 4–6 |
| 3 Time | 4–5 |
| 4 Leave | 4–5 |
| 5 Pay | 6–8 |
| 6 Documents | 4–5 |
| 7 Org + profile | 2–3 |
| 8 Hardening | 4–6 |
| 9 Release | 2–3 |
| **Total** | **33–46 working days** |

Roughly 7–9 weeks for one developer. The three places that overrun are the punch
card (location edge cases), Claims (upload + limits), and Tax (declarations).
Budget accordingly, and do not compress Phase 8 — it is where the app stops
feeling like a prototype.
