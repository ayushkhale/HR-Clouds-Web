# 01 · Web file → native counterpart

When you're porting a screen and want to know "what is this on the native
side", look here. Left column is a path in the **web repo**
(`C:\Freelance Projects\HR Clouds\src\`), right column is this starter kit
(`NativeRef/50-starter/src/`).

**A blank right-hand cell means deliberately absent** — the reason is given.

---

## Infrastructure

| Web | Native | Note |
|---|---|---|
| `shared/api/client.js` | `api/client.js` | same envelope, same session bus; adds a 110s abort and `isNetworkError` |
| `shared/api/*.api.js` | `api/*.api.js` | **employee endpoints only.** HR/manager functions were dropped, not commented out |
| `shared/contexts/AuthContext.jsx` | `state/AuthContext.jsx` | plus the role gate and a foreground expiry re-check |
| `shared/auth/permissions.js` | `state/session.js` | `workspaceForRole`, `isEmployeeApp`, the Keychain |
| `localStorage` | `state/session.js` (Keychain) + AsyncStorage | split by sensitivity — [60-ops/01](../60-ops/01-storage-and-security.md) |
| `shared/attendance/events.js` | `lib/events.js` | same bus; two new kinds (`ACKNOWLEDGEMENT`, `DOCUMENT_REQUEST`) |
| `shared/attendance/normalize.js` | `lib/normalize.js` | `listFrom`, `unwrap`, `num`, `isUuid`, `personName` |
| `shared/attendance/enums.js` | `lib/enums.js` | `humanize`, tone keys, `WORK_MODES` |
| `shared/utils/formatUtils.js` | `lib/format.js` | `formatDayCount`, `displayValue`, money |
| `shared/attendance/dates.js` | `lib/dates.js` | wall-clock helpers; `toLocalYMD`, never `toISOString` |
| `shared/utils/formGuard.js` | `lib/formGuard.js` + `hooks/useFormFocus.js` | split: pure checks vs the measured scroll-and-focus |
| `shared/utils/download.js` | `api/files.js` | blob-util + file-viewer; `clearDownloadCache()` is new |
| `shared/utils/*Errors.js` | `lib/errors/index.js` | one dispatcher; handles `code` **and** `errorCode` |
| `shared/contexts/EmployeeDirectoryContext` | `hooks/useDirectory.js` | a module cache, not a provider — same "one people source" guarantee |
| `shared/attendance/useTodayAttendance.js` | `hooks/useTodayAttendance.js` | adds `useLiveWorked`, foreground gating, local-midnight re-arm |
| `shared/attendance/geolocation.js` | `lib/location.js` | same never-rejecting contract; adds `BLOCKED`, `SERVICES_OFF`, mock detection |
| `document.visibilityState` | `hooks/useAppActive.js` | handles iOS's third `inactive` state |
| `shared/motion/` | `theme/motion.js` | same tokens; Reanimated instead of CSS |
| Tailwind classes | `theme/tokens.js` | the map is [20-design/08](../20-design/08-tailwind-to-native-map.md) |
| `react-icons/hi` | `theme/icons.js` | the only file importing an icon package; v1→v2 name resolution |
| `shared/fieldHelp/fieldHelp.json` | `fieldHelp/fieldHelp.employee.json` | the employee slice of the same v2 file |
| `routes/AppRoutes.jsx` | `navigation/` | tabs + stacks instead of routes |
| `shared/attendance/paths.js` | `navigation/routes.js` | `useRouteTarget` returns `null` exactly as the path hooks do |
| — | `navigation/screens.js` | **new.** A registry so the app runs before all 24 screens exist |

---

## Components

| Web | Native | Note |
|---|---|---|
| `components/DetailDialog.jsx` | `ui/RecordSheet.jsx` + `ui/SheetParts.jsx` | `DetailGrid`'s 4 columns become **2** on a phone |
| `rowPreviewProps` | `ui/Row.jsx` | `onPress` + `accessibilityHint`; no `onPress` → a plain View |
| `components/PageHeader.jsx` | `ui/PageHeader.jsx` | the same three brand hexes, `minHeight: 132` fixed |
| `attendance/ui.jsx` `FilterTabs` | `ui/FilterTabs.jsx` | counts in labels |
| `ProfileTabStrip` | `ui/TabStrip.jsx` | scrolls horizontally, edge fades, auto-scroll-into-view. **Never wraps** |
| `MonthStepper` | `ui/MonthStepper.jsx` | forward disabled past the current month |
| `StatusBadge` | `ui/StatusBadge.jsx` | dot **and** word, always |
| `InlineAlert` | `ui/InlineAlert.jsx` | web tone names, purple output |
| `Skeleton` / `LoadingRows` | `ui/Skeleton.jsx` | Reanimated pulse; static under reduce-motion |
| `EmptyState` / `ErrorState` | `ui/EmptyState.jsx` / `ui/ErrorState.jsx` | the error branches on `errorPresentation()` |
| `GenderAvatar` | `ui/Avatar.jsx` | photo → gender art → initials → glyph. **Never a dash** |
| `PersonSelect` / `PersonMultiSelect` | `ui/PersonSelect.jsx` | a bottom sheet, never a native `<select>` |
| `TimeField` | `ui/TimeField.jsx` | `PickerHost`: bare on Android, modal + Done on iOS |
| `ReasonDialog` | `ui/ReasonPrompt.jsx` | stays narrow; a sibling of the sheet, never a child |
| `window.confirm` override | `ui/ConfirmProvider.jsx` | `await useConfirm()`; **throws** without a provider |
| `Toast` / `useToast` | `ui/Toast.jsx` | above navigation so it survives a screen change |
| `FieldHelp` / `HelpLabel` | `ui/FieldHelp.jsx` | a `Modal` popover so a sheet can't clip it |
| `AttachmentViewerDialog` | `ui/AttachmentViewer.jsx` | images inline, PDFs to the OS. **No webview, no PDF library** |
| big form dialogs | `ui/FormSheet.jsx` | full-screen modal, pinned footer. **A form is never a bottom sheet** |
| `Pagination` | `ui/Row.jsx`'s `ListFooter` | infinite scroll; `noun` because these endpoints page over calendar days |
| Recharts | `react-native-gifted-charts` | the bar chart ports; **the pie does not** (unreadable at 390pt) |
| `DashboardTopBar` | — | the native header does this; search moves to Directory |
| `RowOpenButton` | — | deleted on the web too. Rows open themselves |
| a generic `Modal` | — | deliberately absent. Pick `RecordSheet`, `FormSheet`, `useConfirm` or `ReasonPrompt` |

---

## Screens

| Web | Native | Spec |
|---|---|---|
| `auth/Login.jsx` | `features/auth/screens/LoginScreen` | [01-auth](../40-screens/01-auth.md) |
| `roles/employee/screens/EmployeeDashboard.jsx` | `features/home/screens/HomeScreen` | [02](../40-screens/02-home-and-punch.md) |
| `roles/employee/components/AttendanceCard.jsx` | `features/home/components/PunchCard` | [02](../40-screens/02-home-and-punch.md) |
| `EmployeeAttendancePage.jsx` | `features/attendance/screens/TimeScreen` (tab 1) | [03](../40-screens/03-time.md) |
| `DailyLogModal` (exported from it) | `features/attendance/screens/DayLogScreen` | [02](../40-screens/02-home-and-punch.md) |
| `AttendanceRegularizationsPage.jsx` | TimeScreen tab 2 + `CorrectionFormScreen` | [03](../40-screens/03-time.md) |
| `EmployeeOvertimePage.jsx` | TimeScreen tab 3 + `OvertimeFormScreen` | [03](../40-screens/03-time.md) |
| `AttendanceAnomaliesPage.jsx` | TimeScreen tab 4 ("Flags") | [03](../40-screens/03-time.md) |
| `EmployeeCompOffsPage.jsx` | TimeScreen tab 5 + `EarnedLeaveFormScreen` | [03](../40-screens/03-time.md) |
| `LeaveDashboard.jsx` | `features/leave/screens/LeaveScreen` | [04](../40-screens/04-leave.md) |
| `MySalaryPage.jsx` | `features/pay/screens/SalaryScreen` | [05](../40-screens/05-pay.md) |
| `MyPayslipsPage.jsx` | `features/pay/screens/PayslipsScreen` | [05](../40-screens/05-pay.md) |
| `MyReimbursementsPage.jsx` | `ClaimsScreen` + `ClaimFormScreen` | [05](../40-screens/05-pay.md) |
| `MyLoansAndAdvancesPage.jsx` | `features/pay/screens/LoansScreen` | [05](../40-screens/05-pay.md) |
| `MyTaxAndInvestmentsPage.jsx` | `TaxScreen` + `DeclarationFormScreen` | [05](../40-screens/05-pay.md) |
| `shared/screens/MyDocumentsPage.jsx` | `features/documents/screens/MyDocumentsScreen` | [06](../40-screens/06-documents.md) |
| `shared/screens/IssuedDocumentsPage.jsx` | `CompanyDocumentsScreen` | [06](../40-screens/06-documents.md) |
| `shared/screens/MyRequestsPage.jsx` | `DocumentRequestsScreen` | [06](../40-screens/06-documents.md) |
| `shared/screens/FormsLibraryPage.jsx` | `FormsScreen` | [06](../40-screens/06-documents.md) |
| `shared/screens/CompanyProfilePage.jsx` | `features/org/screens/CompanyScreen` | [07](../40-screens/07-org-and-profile.md) |
| `shared/screens/OrgChartPage.jsx` | `OrgChartScreen` | **drill-down, not a tree** — [07](../40-screens/07-org-and-profile.md) |
| `shared/screens/DirectoryPage.jsx` | `DirectoryScreen` | [07](../40-screens/07-org-and-profile.md) |
| `shared/screens/MyProfilePage.jsx` | `features/profile/screens/ProfileScreen` | [07](../40-screens/07-org-and-profile.md) |
| `legal/BrowserStoragePolicy.jsx` | `features/profile/screens/` | keep the file names; never "cookie"/"privacy" |
| — | `navigation/RootNavigator.jsx`'s `WrongWorkspaceScreen` | **new.** The role gate's landing |
| the whole marketing site | — | not in the app |
| every HR, manager and guest screen | — | not in this app. A manager app is a separate package |

---

## Concepts with no counterpart

| Web | Why there isn't one |
|---|---|
| React Router, URLs, query params as state | navigation state, and a list's filter is local on purpose |
| `useSearchParams` prefill (e.g. `?date=`) | route params do it, and there's no refresh to re-open a form |
| hover states | there is no hover. Press feedback replaces every one |
| `max-w-7xl` and "grid, don't narrow" | one column is the width. The rule becomes "don't make anyone scroll a form" |
| CSS `z-index` | `theme/tokens.js` `layer` + render order; each overlay owns a `Modal` |
| `window.confirm` | `useConfirm()` over `Alert.alert` |
| ad-blocker-sensitive file names | Metro bundles rather than serving per path — the convention is kept anyway |
| `dist/` committed to the repo | native artefacts aren't in the repo |
