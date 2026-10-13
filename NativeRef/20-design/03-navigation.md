# 03 · Navigation and tabs

React Navigation 7: one bottom tab bar, one native stack per tab, one auth
stack outside it all.

---

## The sidebar → tabs mapping

The web employee sidebar has five sections. Four become tabs; the fifth folds
into More.

| Web sidebar section | Becomes |
|---|---|
| MAIN → Dashboard | **Home** tab |
| MY TIME (6 items) | **Time** tab (5 items) + **Leave** tab (1 item, promoted) |
| MY PAY (5 items) | **Pay** tab |
| MY DOCUMENTS (4 items) | **More** → Documents |
| COMPANY (2 items) | **More** → Company |
| *(workspace-less)* Profile, Directory | **More** |

### Why Leave is promoted out of Time

On web it lives under MY TIME. It is the **second most-used employee action**
after punching, and burying it a level costs a tap every single time. Everything
else in MY TIME is checked occasionally, not used daily.

The *screen* is identical to the web screen — only its reachability improves, so
parity holds. This is the one deliberate divergence from the sidebar grouping,
and it is recorded here so nobody "fixes" it back.

---

## The tree

```
RootNavigator                                 (switches on AuthContext)
│
├── AuthStack                                 isAuthenticated === false
│   ├── Login
│   ├── Otp                        { identifier, context, requestId }
│   ├── ForgotPassword
│   ├── SelectOrg                  { selectionToken, organizations }
│   └── WrongWorkspace             { role }      ← the role gate's landing
│
└── AppTabs                                   isAuthenticated && role === 'employee'
    │
    ├── HomeTab          🏠 Home
    │   ├── Home
    │   └── DayLog                 { date }     (sheet-presented)
    │
    ├── TimeTab          🕐 Time
    │   └── Time                                TabStrip: Attendance · Corrections ·
    │       │                                   Overtime · Flags · Earned Leave
    │       ├── DayLog             { date }
    │       └── CorrectionForm     { date? }    (modal)
    │
    ├── LeaveTab         📅 Leave
    │   ├── Leave                               FilterTabs over requests + balance tiles
    │   ├── ApplyLeave                          (modal)
    │   └── Holidays
    │
    ├── PayTab           ₹ Pay
    │   ├── PayHome                             a menu of the five pay screens
    │   ├── Salary  ├── BankAccount (modal)
    │   ├── Payslips                            TabStrip: Payslips · Annual · Form 16
    │   ├── Claims  ├── ClaimForm (modal)
    │   ├── Loans
    │   └── Tax     ├── DeclarationForm (modal)
    │
    └── MoreTab          ⋯ More
        ├── More                                a grouped menu
        ├── DocumentsHome
        │   ├── MyDocuments  ├── UploadDocument (modal)
        │   ├── CompanyDocuments  ├── Acknowledge (modal)
        │   ├── DocumentRequests
        │   └── Forms
        ├── Company
        ├── OrgChart
        ├── Directory
        ├── Profile
        └── Settings
```

### Why PayTab opens on a menu, not a screen

Five pay screens with no natural default. Payslips is the most-used, but opening
straight into it hides the other four behind a strip the person has to notice.
A short menu of five cards — each with a one-line summary pulled from the data
("September · ₹87,432") — is both faster to scan and self-documenting.

Time, by contrast, **does** have a natural default (Attendance), so it opens
there with a `TabStrip` for the rest.

---

## The tab bar

```js
// navigation/tabs.employee.js — the tab set is DATA, so the manager app adds a file
export const EMPLOYEE_TABS = [
  { name: 'HomeTab',  label: 'Home',  icon: 'home',     stack: HomeStack },
  { name: 'TimeTab',  label: 'Time',  icon: 'clock',    stack: TimeStack },
  { name: 'LeaveTab', label: 'Leave', icon: 'calendar', stack: LeaveStack },
  { name: 'PayTab',   label: 'Pay',   icon: 'rupee',    stack: PayStack },
  { name: 'MoreTab',  label: 'More',  icon: 'dots',     stack: MoreStack, badge: 'inbox' },
];
```

| Property | Value |
|---|---|
| Height | 56 + bottom safe-area inset |
| Background | `color.surface`, hairline `color.border` top |
| Active | `color.brand` (purple-600), icon filled, label `smallStrong` |
| Inactive | `color.textMuted` (slate-400), icon outline, label `small` |
| Labels | **Always shown.** Icon-only tab bars make people guess |
| Badge | `color.danger` dot with a count, on More only |

**Five tabs is the maximum.** A sixth means the grouping is wrong.

### The badge

Only **More** carries one, and only for things that need the person's action:

- company documents awaiting acknowledgement
- document requests HR has made of them

Not for: pending corrections or leave (those are *their* requests, waiting on
someone else — a badge there is nagging about something they can't act on).

It subscribes to `lib/events.js` and clears the moment an acknowledgement
succeeds, **without a reload**.

---

## Headers

Native stack headers (`@react-navigation/native-stack`) so the platform supplies
the back gesture, the title animation and the large-title behaviour on iOS.

| Screen kind | Header |
|---|---|
| Tab root (Home) | **No header.** `PageHeader` is the header |
| Tab root (Time, Leave, Pay, More) | Native header, title = tab label |
| Pushed screen | Native header, back chevron, title = the screen's name |
| Modal (`presentation: 'modal'`) | `FormSheet`'s own header with an X |
| Sheet | `RecordSheet`'s own header with an X |

```js
const headerOptions = {
  headerStyle: { backgroundColor: color.surface },
  headerShadowVisible: false,          // hairline border instead
  headerTitleStyle: text.h2,
  headerTintColor: color.brand,
  headerBackTitleVisible: false,       // iOS: chevron only
};
```

**The header title, the tab label and the screen's own `h1` must be the same
words.** That is house rule §2, and it is the fastest parity check there is.

---

## Modal vs sheet vs push — pick by what the thing *is*

| The thing is… | Presentation | Component |
|---|---|---|
| A record being read | Bottom sheet, 55% → 92% | `RecordSheet` |
| A form being filled | Full-screen modal | `FormSheet` |
| A confirm | Centred alert | `useConfirm()` |
| A reason prompt | Compact sheet | `ReasonPrompt` |
| A picker | Compact sheet | `Select` / `PersonSelect` |
| A new place in the app | Push | a stack screen |
| An attachment | Full-screen overlay | `AttachmentViewer` |

The one that gets confused: a **form is never a bottom sheet**. A sheet plus a
keyboard leaves about 40% of the screen for the form, the submit button ends up
under the keyboard, and people scroll looking for it. Full-screen modal with a
pinned footer, every time.

---

## Back behaviour

Android hardware back, in priority order:

1. A toast → ignored (toasts aren't dismissed by back)
2. The topmost **sheet** → closes that sheet only, one per press
3. A **modal** → closes it, **after** a confirm if the form is dirty
4. A pushed screen → pops
5. A tab root that isn't the first tab → **switches to Home**, doesn't exit
6. Home → the OS default (exit)

Step 5 matters: exiting the app from the Pay tab surprises people. One more
press from Home exits, which is the Android convention.

```js
// ui/RecordSheet.jsx — each sheet owns its own back handler, LIFO
useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    if (!isTopmost()) return false;    // let a higher layer take it
    onClose();
    return true;
  });
  return () => sub.remove();
}, [onClose]);
```

A **dirty form** must confirm before discarding:

> Discard this request? · Your correction hasn't been sent.
> [Keep editing] [Discard]

---

## Deep links

```js
// navigation/linking.js
export const linking = {
  prefixes: ['hrclouds://', 'https://hrclouds.in/app'],
  config: {
    screens: {
      AppTabs: {
        screens: {
          MoreTab: {
            screens: {
              CompanyDocuments: 'company-documents/:documentId',
              DocumentRequests: 'document-requests',
            },
          },
          LeaveTab:  { screens: { Leave: 'leaves' } },
          TimeTab:   { screens: { Time: 'attendance' } },
          PayTab:    { screens: { Payslips: 'payslips' } },
          HomeTab:   { screens: { Home: 'home' } },
        },
      },
    },
  },
};
```

`company-documents/:documentId` is the one that matters: transactional emails
and push notifications both point an employee at a specific issued document.
The web contract (2026-10-08) deep-links to
`/dashboard/employee/company-documents/:id`.

**Rules for a link that arrives while signed out:** store the intent, run the
auth flow, then navigate — don't drop the person on Home having forgotten what
they tapped. And run it through the role gate first: a link cannot be a way into
the app for a non-employee.

Associated domains / app links come later; register the custom scheme in Phase 6
when push lands.

---

## Navigating in code

```js
// Inside a tab — plain push
navigation.navigate('DayLog', { date: row.date });

// Across tabs — name the tab AND the screen, or you land on the tab's root
navigation.navigate('PayTab', { screen: 'Payslips' });

// After a write that should land somewhere else
navigation.navigate('LeaveTab', { screen: 'Leave' });
emitAttendanceChanged(ATTENDANCE_EVENTS.LEAVE);
```

### The equivalent of the web's path hooks

The web app builds every link through `useMyPayPaths()`, `useMyDocumentPaths()`
and `useOrgPaths()`, which return **`null`** for a workspace with no such pages
— never another workspace's links. Keep that discipline:

```js
// navigation/routes.js
export const ROUTES = {
  employee: {
    attendance: ['TimeTab', 'Time'],
    leaves:     ['LeaveTab', 'Leave'],
    payslips:   ['PayTab', 'Payslips'],
    documents:  ['MoreTab', 'MyDocuments'],
    // …
  },
};

export function useRouteTarget(key) {
  const { workspace } = useAuth();
  return ROUTES[workspace]?.[key] ?? null;   // null → the caller hides the link
}
```

A `null` means **hide the link**, exactly as the web adapters do. Never fall
back to another workspace's destination, and never hardcode a route name in a
shared component.

---

## State that survives navigation

| State | Lives in | Survives |
|---|---|---|
| Session | `AuthContext` + Keychain | App restart |
| Which tab | React Navigation | Backgrounding |
| Open sheet | Local `useState` | Nothing — a sheet closes on navigation |
| List page / filter | Local `useState` in the screen | Nothing. Deliberate: a stale page 5 of a filter with one page is a web bug this app shouldn't inherit |
| Last work mode | AsyncStorage | App restart |
| Directory cache | Module-level store, keyed by token | Until sign-out or org switch |
| Today's attendance | `useTodayAttendance` | Refetched on `AppState` → active |

**Never persist navigation state.** Restoring someone into a half-filled claim
form from last Tuesday is worse than starting fresh.

---

## Launch sequence

```
splash (bootsplash)
  └─ AuthContext hydrates from Keychain        ~50ms, no network
       ├─ no token            → AuthStack / Login
       ├─ token past exp      → AuthStack / Login  ("Your session ended")
       └─ valid token
            ├─ decode role
            │    ├─ role !== 'employee' → clear token → WrongWorkspace
            │    └─ role === 'employee' → AppTabs / Home
            └─ hydrateProfile() in the background (for the name)
```

**No login flash.** Hide the splash only once `AuthContext.isLoading` is false —
otherwise a returning user sees the Login screen for 200 ms on every launch,
which reads as having been signed out.

```jsx
useEffect(() => { if (!isLoading) BootSplash.hide({ fade: true }); }, [isLoading]);
```
