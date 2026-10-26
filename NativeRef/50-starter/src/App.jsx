// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — the providers, in the only order that works.
//
// Copy this to the project root's App.jsx (or point index.js at it). It is the
// whole entry point: everything else is reached from RootNavigator.
//
// ── THE ORDER IS NOT ARBITRARY ───────────────────────────────────────────────
//
//   GestureHandlerRootView   outermost, and it MUST have flex:1. Without it
//                            every pan and swipe inside a sheet dies on
//                            Android, with no error — the gestures simply do
//                            nothing, which costs an afternoon to diagnose.
//   SafeAreaProvider         everything below reads insets: the tab bar's
//                            height, the sheet's bottom padding, the hero's
//                            top padding. It must sit above navigation.
//   ToastProvider            ABOVE navigation, so a toast survives a screen
//                            change. A toast mounted inside a screen vanishes
//                            mid-sentence when the write that triggered it
//                            navigates away — which is most of them.
//   ConfirmProvider          same reason: `await confirm()` must resolve even
//                            if the screen that asked has gone.
//   AuthProvider             owns the session and the role gate. Below the UI
//                            providers because signing out shows a toast.
//   RootNavigator            reads AuthContext and switches.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
//
// No query-cache provider, no redux store, no theme provider. There is no
// query cache in this app on purpose (10-api/01-api-overview.md): screens own
// their own loads and the event bus in lib/events.js is what keeps counts
// honest. The "theme" is a module of constants — `theme/tokens.js` — not
// context, because a token read in a StyleSheet at module scope cannot come
// from a hook, and one source beats two.
//
// No EmployeeDirectory provider either: the web app needs one because a roster
// read is expensive and shared, while here `hooks/useDirectory.js` is a
// module-level cache with the same guarantees and no tree position to get
// wrong. Both are "people come from ONE place" (CLAUDE.md §7).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './state/AuthContext';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmProvider';
import { RootNavigator } from './navigation/RootNavigator';
import { color } from './theme/tokens';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/*
          Dark content on the light app background. The purple hero is NOT a
          status-bar region — PageHeader sits below the inset, so a
          light-content bar here would be invisible on every other screen.
        */}
        <StatusBar barStyle="dark-content" backgroundColor={color.bg} />
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
