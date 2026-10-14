# 50 · Starter kit

Paste `src/` into the new app's `src/`. Nothing in here imports a screen, so it
compiles on its own and you can verify it before writing any UI.

```bash
# from the new project root
cp -r "/c/Freelance Projects/HR Clouds/NativeRef/50-starter/src/." ./src/
```

---

## What's here

| Path | Status | Notes |
|---|---|---|
| `theme/tokens.js` | **complete** | Colour, type, space, radius, shadow, layer. The exact web values |
| `theme/motion.js` | **complete** | Durations, easings, the house spring |
| `theme/icons.js` | **stub** | The one file that imports an icon package. Fill in from [20-design/07-iconography.md](../20-design/07-iconography.md) |
| `lib/format.js` | **complete** | `formatDayCount` · `formatMoney` · `displayValue` · spoken variants. **Intl-free** |
| `lib/dates.js` | **complete** | The full web port. **Intl-free** for everything a user sees |
| `lib/normalize.js` | **complete** | `isUuid` · `personName` · `unwrap` · `normalizePaginated` |
| `lib/enums.js` | **complete** | Every status map, tone map, `statusMeta()` |
| `lib/events.js` | **complete** | The app-wide refresh bus |
| `lib/geofence.js` | **complete** | Work-mode vocabularies + the four punch outcomes |
| `lib/liveHours.js` | **complete** | The running clock while clocked in |
| `lib/location.js` | **complete** | Native geolocation that never rejects |
| `lib/validation.js` | **partial** | The correction validator. Add others as you build forms |
| `lib/promisePool.js` | **complete** | `settleWithLimit` |
| `lib/errors/*.js` | **complete** | Four domain modules, code → human copy |
| `api/client.js` | **complete** | `request()` · token cache · 401 bus · 110 s abort |
| `api/files.js` | **complete** | Binary download + blob fetch |
| `api/*.api.js` | **complete** | Six domains, employee endpoints only |
| `state/session.js` | **complete** | The role gate + Keychain |
| `state/AuthContext.jsx` | **complete** | Session lifecycle |
| `hooks/*` | **complete** | `usePagedList` · `useResource` · `useTodayAttendance` · `useDirectory` |
| `fieldHelp/fieldHelp.employee.json` | **complete** | **36 hints, 24 surfaces, generated from the web config** |
| `fieldHelp/fieldHelpMeta.js` | **complete** | `getFieldHelp()` + the dev validator |
| `ui/*` | **reference** | Representative implementations. Finish the set from [20-design/02-component-catalog.md](../20-design/02-component-catalog.md) |
| `navigation/*` | **reference** | Tab data + root navigator shape |

---

## Verify it in this order

```js
// 1. tokens resolve
import { color } from '@/theme/tokens';
console.log(color.brand);                 // '#9333ea'

// 2. formatters match the web app EXACTLY
import { formatDayCount, formatMoney } from '@/lib/format';
console.log(formatDayCount(2.5));         // '2 Days and 1 Half Day'
console.log(formatMoney(57559.4));        // '₹57,559.40'
console.log(formatMoney(1234567));        // '₹12,34,567'

// 3. dates are local, not UTC
import { todayYMD, parseYMDLocal } from '@/lib/dates';
console.log(todayYMD());                  // today, even at 01:00 IST

// 4. the role gate
import { isEmployeeApp } from '@/state/session';
console.log(isEmployeeApp('hr'));         // false

// 5. field help
import { getFieldHelp } from '@/fieldHelp/fieldHelpMeta';
console.log(getFieldHelp('payroll.bank_details', 'ifsc_code', 'employee'));

// 6. a real call (needs a token in the Keychain)
import { attendanceAPI } from '@/api';
attendanceAPI.getUpcomingHolidays().then(console.log);
```

Step 2 is the one that matters most. If `formatMoney(1234567)` doesn't print
`₹12,34,567`, stop and fix it before building a single pay screen.

---

## Dependencies the starter kit assumes

```
react-native-keychain                 state/session.js
@react-native-community/netinfo       ui/ErrorState.jsx
react-native-geolocation-service      lib/location.js
react-native-permissions              lib/location.js
react-native-blob-util                api/files.js
react-native-file-viewer              api/files.js
react-native-config                   config/env.js
@gorhom/bottom-sheet                  ui/RecordSheet.jsx
react-native-reanimated               ui/*, theme/motion.js
react-native-safe-area-context        ui/Screen.jsx
@react-navigation/*                   navigation/*
react-native-heroicons                theme/icons.js
```

Install order and native wiring: [00-plan/04-environment-setup.md](../00-plan/04-environment-setup.md).

---

## Things not to change

1. **`lib/format.js` and `lib/dates.js` avoid `Intl` on purpose.** Hermes's ICU
   support varies by RN version and build flags, so `toLocaleString` can give
   two devices different strings — and a payslip reading `₹1,234,567` on one
   phone and `₹12,34,567` on another is a support ticket. The verbosity is the
   feature.
2. **`lib/enums.js` keeps the historic tone names** (`emerald`, `amber`,
   `blue`). They render purple. A tone map ported from a web file keeps working
   because of this.
3. **`api/client.js`'s 401 rules.** The exception list and the
   "only-expire-the-token-we-sent" check are both there because of real bugs.
4. **The three-step upload.** Every `requestUpload → PUT → confirm` sequence
   needs all three. Step 3 is the one people drop.
5. **`normalizePaginated` never fabricates page counts** when the server sends
   no metadata. Making it "smarter" re-renders the same list on every page.

---

## Files you still have to write

The starter kit stops where the product starts:

- Every screen in `features/`
- The rest of `ui/` (the catalog lists them all)
- `theme/icons.js`'s actual imports
- Validators for the leave, claim, declaration and bank forms
- `navigation/linking.js`'s final deep-link config
- Push, biometrics and crash reporting (phases 6 and 8)
