// ─────────────────────────────────────────────────────────────────────────────
// navigation/index.js — the barrel.
//
// Screens import `useRouteTarget` / `useGo` from here. Nothing imports
// `tabs.employee.js` directly except AppTabs and the dev checks — a screen
// that reads the tab table is a screen that will break when the manager app
// adds its own.
// ─────────────────────────────────────────────────────────────────────────────

export { RootNavigator, WrongWorkspaceScreen, navTheme } from './RootNavigator';
export { AppTabs, headerOptions } from './AppTabs';
export { ROUTES, ROUTE_KEYS, useRouteTarget, useGo, useRouteFor } from './routes';
export { linking, PREFIXES, setLinkingAuthed, clearPendingLink, peekPendingLink } from './linking';
export { screenFor, registerScreen } from './screens';
export { EMPLOYEE_TABS, EMPLOYEE_SCREEN_NAMES, tabsForWorkspace } from './tabs.employee';
