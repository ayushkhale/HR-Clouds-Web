# 02 · Architecture

## Stack decision record

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Runtime | **React Native CLI (bare)**, RN 0.76+, Hermes, New Architecture on | Chosen by you. Full control over native modules (geolocation accuracy, background, file access). No Expo config-plugin indirection |
| Language | **JavaScript**, not TypeScript | Matches the web repo exactly, so `lib/` files port verbatim. If you want TS, convert `lib/` last — it is the only layer where types pay for themselves |
| Navigation | **React Navigation 7** — bottom tabs + native stacks | The only mature option; `native-stack` gives real platform headers and transitions |
| Styling | **StyleSheet + a token module** (`theme/tokens.js`) | See the decision below |
| Server state | **Hand-rolled hooks** (`usePagedList`, `useResource`) ported from web | Deliberate: the web app has no query cache and the whole refresh contract (`lib/events.js`) is built around that. Introducing React Query means two refresh mechanisms fighting. Revisit only if you also delete the event bus |
| Client state | React Context: `AuthContext`, `ToastContext`, `ConfirmContext` | Three contexts, no store. Nothing else is global |
| Charts | **react-native-gifted-charts** (SVG) | Employee app needs one bar chart and one pie chart. Victory/Skia are heavier than that need |
| Animation | **Reanimated 3** + the ported `theme/motion.js` tokens | Layout animations and the punch ring need the UI thread |
| Dates | The ported `lib/dates.js`, **no moment / dayjs / date-fns** | The web file is 250 lines of hard-won timezone correctness. Porting it is strictly safer than re-deriving it on a different library |

### Why StyleSheet + tokens, and not NativeWind

NativeWind would let you paste Tailwind class strings from web files, which is
tempting. It is not the recommendation, for three reasons:

1. On **bare** RN it adds a Babel transform, a Metro transformer and a CSS
   interop layer to your build. When it breaks, it breaks the whole bundle, and
   it is the first thing to break on an RN upgrade.
2. Most web classes don't survive the port anyway: `grid-cols-4`, `hover:`,
   `sm:`, `max-w-7xl`, `divide-y`, `backdrop-blur` have no or different native
   meaning. You would be pasting strings that silently do nothing — the worst
   failure mode for visual parity.
3. Tokens give you one place to change a colour, and you get autocomplete.

Instead, [20-design/08-tailwind-to-native-map.md](../20-design/08-tailwind-to-native-map.md)
is a mechanical lookup table: every Tailwind class used in the employee screens
→ its exact token / style object. Translating a web screen becomes a
find-and-replace, not a re-design.

If you still want NativeWind, the setup steps are in
[00-plan/04-environment-setup.md](04-environment-setup.md) § Optional. Keep
`theme/tokens.js` as the source of truth either way and feed it into the
Tailwind config, so one change still reaches everything.

---

## Repository layout

```
hrclouds-employee/
├── android/                      native project (bare)
├── ios/                          native project (bare)
├── index.js                      entry: registers App, installs gesture handler
├── App.jsx                       providers + navigation root
├── app.config.js                 build-time env resolution (see § Environment)
└── src/
    ├── api/                      ONE FILE PER DOMAIN + client.js. No fetch elsewhere
    │   ├── client.js             request() · requestWithToken() · token helper · 401 bus
    │   ├── files.js              downloadFile() · fetchFileBlob() — binary only
    │   ├── auth.api.js
    │   ├── attendance.api.js     self-service only
    │   ├── leave.api.js          self-service only
    │   ├── payroll.api.js        /payroll/me/* only
    │   ├── documents.api.js      /documents/me/* + /documents/templates
    │   ├── organization.api.js   me · details · hierarchy · directory
    │   └── index.js              barrel — screens import from here
    │
    ├── lib/                      PURE LOGIC — ported from web, no React, no RN
    │                             (one exception: location.js, below)
    │   ├── normalize.js          isUuid · personName · unwrap · normalizePaginated
    │   ├── dates.js              every date/time/duration helper
    │   ├── format.js             formatDayCount · formatMoney · displayValue · …
    │   ├── enums.js              every status map, tone map, humanize()
    │   ├── geofence.js           work-mode vocabularies + punch outcomes
    │   ├── dayStatus.js          why a day has the status it has
    │   ├── liveHours.js          the running clock while clocked in
    │   ├── location.js          THE EXCEPTION — permissions + a punch fix.
    │   │                         Imports react-native; kept here because it
    │   │                         is the native half of geofence.js and the
    │   │                         two are read together
    │   ├── validation.js         pure form validators returning { errors, payload }
    │   ├── events.js             the app-wide refresh bus
    │   ├── promisePool.js        settleWithLimit
    │   └── errors/               one module per domain, code → human copy
    │       ├── attendanceErrors.js  leaveErrors.js
    │       └── payrollErrors.js     documentErrors.js
    │
    ├── theme/
    │   ├── tokens.js             colour · space · radius · shadow · type scale
    │   ├── motion.js             durations, easings, the house spring
    │   └── icons.js              one map: semantic name → icon component
    │
    ├── ui/                       CROSS-SCREEN PRIMITIVES. Nothing domain-specific
    │   ├── Screen.jsx            safe area + scroll + pull-to-refresh + gutter
    │   ├── PageHeader.jsx        the purple hero
    │   ├── Card.jsx  Button.jsx  Pill.jsx  Divider.jsx
    │   ├── StatusBadge.jsx       dot + label, driven by lib/enums tones
    │   ├── FilterTabs.jsx  TabStrip.jsx  MonthStepper.jsx
    │   ├── Row.jsx               the pressable list row
    │   ├── RecordSheet.jsx       + SheetSection/Grid/Stats/Table/Text/FooterNote
    │   ├── FormSheet.jsx         full-screen modal form shell, pinned footer
    │   ├── Field.jsx  TextField.jsx  TimeField.jsx  DateField.jsx  Select.jsx
    │   ├── PersonSelect.jsx  Avatar.jsx  PersonRow.jsx
    │   ├── EmptyState.jsx  ErrorState.jsx  Skeleton.jsx  Spinner.jsx
    │   ├── InlineAlert.jsx  FieldError.jsx
    │   ├── Toast.jsx             + ToastProvider
    │   ├── ConfirmProvider.jsx   awaitable confirm() and ReasonPrompt
    │   └── FieldHelp.jsx         the ⓘ + Ask Maya
    │
    ├── features/                 ONE FOLDER PER MODULE — screens live with their parts
    │   ├── auth/                 LoginScreen · OtpScreen · ForgotScreen · SelectOrgScreen
    │   ├── home/                 HomeScreen · PunchCard · TodaySummary · RecentDays
    │   ├── attendance/           AttendanceScreen · DayLogSheet · CorrectionsScreen ·
    │   │                         CorrectionFormSheet · FlagsScreen · OvertimeScreen ·
    │   │                         EarnedLeaveScreen · attendanceMeta.js
    │   ├── leave/                LeaveScreen · ApplyLeaveSheet · LeaveDetailSheet ·
    │   │                         BalanceTiles · HolidayList · leaveMeta.js
    │   ├── pay/                  SalaryScreen · BankSheet · PayslipsScreen ·
    │   │                         PayslipSheet · ClaimsScreen · ClaimFormSheet ·
    │   │                         LoansScreen · TaxScreen · DeclarationFormSheet · payMeta.js
    │   ├── documents/            DocumentsHomeScreen · MyDocumentsScreen ·
    │   │                         CompanyDocumentsScreen · RequestsScreen ·
    │   │                         FormsScreen · AcknowledgeSheet · UploadSheet · docMeta.js
    │   ├── org/                  OrgChartScreen · CompanyScreen · DirectoryScreen
    │   └── profile/              ProfileScreen · SettingsScreen · AboutScreen
    │
    ├── hooks/
    │   ├── usePagedList.js       paginated list state (ported)
    │   ├── useResource.js        single-shot fetch with cancel + retry
    │   ├── useTodayAttendance.js live /today + /shift (ported)
    │   ├── useAttendanceChanged.js  subscribe to the refresh bus
    │   ├── useDirectory.js       /organizations/directory, cached, name lookup
    │   ├── useToast.js  useConfirm.js
    │   └── useAppActive.js       AppState → boolean, for pollers
    │
    ├── state/
    │   ├── AuthContext.jsx       session, role gate, login/logout, org switch
    │   ├── session.js            workspaceForRole · isEmployeeApp · token storage
    │   └── secureStore.js        Keychain wrapper
    │
    ├── navigation/
    │   ├── RootNavigator.jsx     auth stack ⇄ app stack, driven by AuthContext
    │   ├── AppTabs.jsx           the five tabs
    │   ├── stacks.js             one stack per tab
    │   └── linking.js            deep links (company-document/:id, push payloads)
    │
    └── fieldHelp/
        ├── fieldHelp.employee.json   36 pre-written hints, generated from web
        └── fieldHelpMeta.js          getFieldHelp() + dev validator (ported)
```

### Where does a new file go?

| It is… | It goes in |
|---|---|
| a network call | `api/<domain>.api.js` |
| pure logic with no React | `lib/` |
| used by two or more features | `ui/` |
| used by one feature | that `features/<module>/` folder |
| a label, enum map, state machine or error copy | `features/<module>/<module>Meta.js` or `lib/enums.js` |
| a colour, size, radius, duration | `theme/` — **nowhere else** |

**One module → `features/<module>/`. Two or more → `ui/`,** taking a prop rather
than branching on the route.

---

## Data flow

```
 Screen
   │  calls a hook
   ▼
 hooks/usePagedList ──────────► api/attendance.api.js ──► api/client.js ──► fetch
   │   normalizePaginated()                                    │
   │                                                           ├─ 401 → SESSION_EXPIRED → AuthContext clears
   ▼                                                           └─ error → throw { message, status, data }
 { items, total, page, loading, error, setPage, reload }
   │
   ▼
 Row  ─press─►  RecordSheet
                   │ footer action
                   ▼
                api write  ──success──►  emitAttendanceChanged(kind)
                                               │
                        ┌──────────────────────┼───────────────────────┐
                        ▼                      ▼                       ▼
                   tab badge            home screen cards        any open list
                   (subscribed)            (subscribed)           (subscribed)
```

Four rules hold this together:

1. **A screen never calls `fetch`.** It calls a hook, which calls an api module.
2. **Every response goes through `unwrap()` / `normalizePaginated()`** before a
   screen sees it. Screens must never chain `data.data || data.records || data`.
3. **Every write that could change a count emits an event.** No query cache
   means no automatic invalidation. The bus is the invalidation.
4. **Every fetch is cancellable.** Out-of-order responses are discarded by
   request-token refs inside the hooks.

---

## Navigation shape

Five bottom tabs. The web app's three "ME" groups (My Time, My Pay, My
Documents) become three of them; the sidebar's MAIN becomes Home; COMPANY and
the workspace-less pages fold into More.

```
RootNavigator (switch on auth state)
├── AuthStack            Login → Otp → Forgot → SelectOrg
└── AppTabs
    ├── Home       🏠   HomeScreen  →  DayLogSheet
    ├── Time       🕐   AttendanceScreen (default)
    │                   ├─ Corrections  ├─ Flags
    │                   ├─ Overtime     └─ Earned Leave
    │                   (switched by a TabStrip inside the screen, not nested tabs)
    │                   → LeaveScreen is NOT here. See the note below
    ├── Leave      📅   LeaveScreen  →  ApplyLeaveSheet · LeaveDetailSheet · Holidays
    ├── Pay        ₹    PayHomeScreen → Salary · Payslips · Claims · Loans · Tax
    └── More       ⋯    DocumentsHome · Company · Org Chart · Directory ·
                        Profile · Settings · Sign out
```

**Why Leave is its own tab and not inside Time:** on web it sits under MY TIME,
but it is the single most-used employee action after punching. Burying it one
level costs a tap on every use. Everything else in MY TIME is checked
occasionally. This is the one deliberate divergence from the sidebar grouping,
and it does not break parity — the *screen* is identical, only its reachability
improves.

Full specification, including header rules, badge rules, back behaviour and deep
links: [20-design/03-navigation.md](../20-design/03-navigation.md).

---

## Designing for the manager app that doesn't exist yet

Everything a manager needs is **additive** if you hold four lines now:

1. **`viewer` prop on every shared screen** (§2 of the house rules), defaulting
   to `'employee'`. The manager build passes `'manager'`; the layout does not
   change.
2. **Plane adapters, not role branches.** When a capability differs by role,
   express it as a lookup table with `null` for "absent":
   ```js
   // features/documents/docMeta.js
   export const DOCUMENT_PLANES = {
     employee: { list: documentsAPI.getMyDocuments, upload: documentsAPI.myIssueUpload, teamList: null },
     manager:  { list: documentsAPI.getMyDocuments, upload: documentsAPI.myIssueUpload, teamList: documentsAPI.getTeamDocuments },
   };
   ```
   A `null` means the UI hides that control. Never `if (role === 'manager')` in
   a component.
3. **The tab set is data.** `navigation/AppTabs.jsx` reads a tab array from
   `navigation/tabs.<workspace>.js`. Adding the manager app adds a file.
4. **`lib/` and `api/` stay role-free.** `api/attendance.api.js` may gain
   `/attendance/manager/*` methods, but no api module ever asks who is calling.

What will *not* be additive, and so should not be attempted now: a single app
binary serving both roles with a runtime switch. Two tab sets behind one gate is
fine; a UI that reshapes itself based on a token claim is how the web app's
workspace leak happened.

---

## Environment and configuration

There is no `import.meta.env` in RN. Use `react-native-config` (`.env` files,
compiled into the native build) and resolve everything in **one module**, the
same way `src/config/env.js` does on web:

```js
// src/config/env.js
import Config from 'react-native-config';

const clean = (v, fb = '') => (typeof v === 'string' && v.trim() ? v.trim() : fb);
const cleanUrl = (v, fb = '') => clean(v, fb).replace(/\/+$/, '');

export const ENV = {
  MODE: Config.APP_ENV || 'development',
  IS_PRODUCTION: Config.APP_ENV === 'production',

  // Same two gateways the web app uses.
  API_BASE_URL: cleanUrl(
    Config.API_BASE_URL,
    Config.APP_ENV === 'production'
      ? 'https://api.hrclouds.in/api/v1'
      : 'https://development.hrclouds.in/api/v1',
  ),

  GOOGLE_WEB_CLIENT_ID: clean(Config.GOOGLE_WEB_CLIENT_ID),   // for @react-native-google-signin
  GOOGLE_IOS_CLIENT_ID: clean(Config.GOOGLE_IOS_CLIENT_ID),

  DOCMIND_API_KEY: clean(Config.DOCMIND_API_KEY),             // Maya
  DOCMIND_API_URL: cleanUrl(Config.DOCMIND_API_URL, 'https://api.codewithrishi.fun/api/public'),
};
```

Files: `.env.development`, `.env.production`, both **gitignored**;
`.env.example` committed. Never put a secret in here that matters — anything
compiled into the app is readable by anyone who downloads it. The DocMind key
is already client-side on web; treat it as public.

---

## Request lifecycle, in full

1. Screen mounts → hook fires → `api/<domain>.api.js` builds the path with
   `qs()` (drops `undefined` / `null` / `''`, so a cleared filter never becomes
   `?status=`, which is a 400).
2. `client.request()` attaches `Authorization: Bearer <token>` from the Keychain
   cache, `Content-Type: application/json`, and an `AbortController` with a
   **110 s** timeout (the gateway cuts at 120 s; we want our own error, not
   nginx's HTML 504).
3. Response body is parsed **only if** `content-type` is JSON. Gateway errors
   (413 / 429 / 502 / 504) return HTML; parsing those would mask the status.
4. `!response.ok` →
   - `401` → `handleUnauthorized()`: ignore for `/auth/*` (wrong password is not
     an expired session) and for the `NON_SESSION_401_CODES`
     (`INVALID_CREDENTIALS`, `LOGIN_NOT_ALLOWED`, `GOOGLE_TOKEN_INVALID`,
     `UNAUTHORIZED_DEVICE`) and any `API_KEY*` code. Otherwise clear the token
     and emit `SESSION_EXPIRED`, **only if the stored token is still the one the
     request was sent with** — a newer login must survive a late 401.
   - Throw `Error` with `.status`, `.data`, and `.retryAfter` (from the
     `Retry-After` header, when finite).
5. Screen catches and renders `<ErrorState error={e} onRetry={reload} />`, which
   maps the error through the domain's error module. **Never show `e.message`
   raw** unless the mapper falls through to it deliberately.
