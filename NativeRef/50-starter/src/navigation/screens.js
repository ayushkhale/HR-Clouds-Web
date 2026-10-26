// ─────────────────────────────────────────────────────────────────────────────
// navigation/screens.js — name → component.
//
// WHY A REGISTRY RATHER THAN DIRECT IMPORTS IN THE NAVIGATOR:
//
// You are going to build 24 screens over several weeks. Without this file the
// navigator doesn't compile until all 24 exist, so nothing runs until the end —
// which is the worst possible order to build a mobile app in. With it, the app
// RUNS ON DAY ONE: every route resolves, unbuilt ones render a Placeholder that
// says which file to create, and each screen goes live the moment you
// uncomment its line.
//
// HOW TO USE IT: build a screen, uncomment its require. That's the whole
// workflow. Delete the Placeholder machinery once all 24 are in — or keep it;
// it costs nothing in production and the manager app will want it again.
//
// The requires are deliberately NOT static `import`s: a static import of a file
// that doesn't exist is a Metro build failure, while a require inside a try is
// a Placeholder. That is the entire trick.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { EMPLOYEE_SCREEN_NAMES } from './tabs.employee';
import { color, gutter, space, text } from '../theme/tokens';

/**
 * Where each screen lives once you build it. The paths follow
 * 00-plan/02-architecture.md — `features/<module>/screens/<Name>.jsx`.
 *
 * Uncomment as you go. The comment beside each one is its build spec in
 * 40-screens/.
 */
const MODULES = {
  // ── Phase 2–3: the heart of the app (40-screens/02-home-and-punch.md) ─────
  // Home:            () => require('../features/home/screens/HomeScreen').default,
  // DayLog:          () => require('../features/attendance/screens/DayLogScreen').default,

  // ── Phase 4: time (40-screens/03-time.md) ────────────────────────────────
  // Time:            () => require('../features/attendance/screens/TimeScreen').default,
  // CorrectionForm:  () => require('../features/attendance/screens/CorrectionFormScreen').default,
  // OvertimeForm:    () => require('../features/attendance/screens/OvertimeFormScreen').default,
  // EarnedLeaveForm: () => require('../features/attendance/screens/EarnedLeaveFormScreen').default,

  // ── Phase 5: leave (40-screens/04-leave.md) ──────────────────────────────
  // Leave:           () => require('../features/leave/screens/LeaveScreen').default,
  // ApplyLeave:      () => require('../features/leave/screens/ApplyLeaveScreen').default,
  // Holidays:        () => require('../features/leave/screens/HolidaysScreen').default,

  // ── Phase 6: pay (40-screens/05-pay.md) ──────────────────────────────────
  // PayHome:         () => require('../features/pay/screens/PayHomeScreen').default,
  // Salary:          () => require('../features/pay/screens/SalaryScreen').default,
  // BankAccount:     () => require('../features/pay/screens/BankAccountScreen').default,
  // Payslips:        () => require('../features/pay/screens/PayslipsScreen').default,
  // Claims:          () => require('../features/pay/screens/ClaimsScreen').default,
  // ClaimForm:       () => require('../features/pay/screens/ClaimFormScreen').default,
  // Loans:           () => require('../features/pay/screens/LoansScreen').default,
  // Tax:             () => require('../features/pay/screens/TaxScreen').default,
  // DeclarationForm: () => require('../features/pay/screens/DeclarationFormScreen').default,

  // ── Phase 7: documents (40-screens/06-documents.md) ──────────────────────
  // DocumentsHome:    () => require('../features/documents/screens/DocumentsHomeScreen').default,
  // MyDocuments:      () => require('../features/documents/screens/MyDocumentsScreen').default,
  // UploadDocument:   () => require('../features/documents/screens/UploadDocumentScreen').default,
  // CompanyDocuments: () => require('../features/documents/screens/CompanyDocumentsScreen').default,
  // DocumentRequests: () => require('../features/documents/screens/DocumentRequestsScreen').default,
  // Forms:            () => require('../features/documents/screens/FormsScreen').default,

  // ── Phase 8: org and profile (40-screens/07-org-and-profile.md) ──────────
  // More:      () => require('../features/more/screens/MoreScreen').default,
  // Company:   () => require('../features/org/screens/CompanyScreen').default,
  // OrgChart:  () => require('../features/org/screens/OrgChartScreen').default,
  // Directory: () => require('../features/org/screens/DirectoryScreen').default,
  // Profile:   () => require('../features/profile/screens/ProfileScreen').default,
  // Settings:  () => require('../features/profile/screens/SettingsScreen').default,

  // ── Auth (40-screens/01-auth.md) ─────────────────────────────────────────
  // Login:          () => require('../features/auth/screens/LoginScreen').default,
  // Otp:            () => require('../features/auth/screens/OtpScreen').default,
  // ForgotPassword: () => require('../features/auth/screens/ForgotPasswordScreen').default,
  // SelectOrg:      () => require('../features/auth/screens/SelectOrgScreen').default,
};

// WrongWorkspace is NOT in the list above and must never be commented out: it
// is where the role gate lands somebody, and a Placeholder there would tell an
// HR admin "this screen isn't built yet" instead of "this app is for
// employees". It is a real component, inline, with no dependencies.
function WrongWorkspaceFallback() {
  return null; // replaced by the real screen in RootNavigator — see that file
}

/** What an unbuilt route renders: the file to create, and nothing else. */
function placeholderFor(name) {
  function Placeholder() {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: gutter, gap: space[2] }}>
        <Text style={text.label}>Not built yet</Text>
        <Text style={[text.h2, { textAlign: 'center' }]}>{name}</Text>
        <Text style={[text.small, { textAlign: 'center', maxWidth: 300 }]}>
          Create the screen, then uncomment `{name}` in navigation/screens.js.
          Its build spec is in NativeRef/40-screens/.
        </Text>
      </View>
    );
  }
  Placeholder.displayName = `Placeholder(${name})`;
  return Placeholder;
}

const cache = new Map();

/**
 * The component for a route name. Never throws, never returns undefined — a
 * missing screen is a Placeholder, so one unbuilt route can't take the
 * navigator down with it.
 */
export function screenFor(name) {
  if (cache.has(name)) return cache.get(name);

  let component;
  const loader = MODULES[name];
  if (loader) {
    try {
      component = loader();
    } catch (err) {
      // The file is named in the registry but doesn't exist (or threw on
      // import). Say which, loudly, and carry on — a typo'd path otherwise
      // shows up as a blank screen with no clue.
      if (__DEV__) console.error(`[screens] "${name}" failed to load:`, err?.message || err);
      component = null;
    }
  }

  const resolved = component || placeholderFor(name);
  cache.set(name, resolved);
  return resolved;
}

/** Called by RootNavigator to register the real WrongWorkspace screen. */
export function registerScreen(name, component) {
  if (component) cache.set(name, component);
}

if (__DEV__) {
  const missing = EMPLOYEE_SCREEN_NAMES.filter((n) => !MODULES[n]);
  if (missing.length) {
    console.log(
      `[screens] ${EMPLOYEE_SCREEN_NAMES.length - missing.length}/${EMPLOYEE_SCREEN_NAMES.length} built. `
      + `Still placeholders: ${missing.join(', ')}`,
    );
  }
}

export { WrongWorkspaceFallback };
