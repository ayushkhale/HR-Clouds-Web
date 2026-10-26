// ─────────────────────────────────────────────────────────────────────────────
// navigation/AppTabs.jsx — the bottom tab bar and one native stack per tab.
//
// Built from `tabs.employee.js`, which is DATA. Nothing in this file names a
// screen or a tab; when the manager app arrives it supplies its own tab file
// and this renders it unchanged.
//
// ── WHY ONE STACK PER TAB AND NOT ONE SHARED STACK ───────────────────────────
//
// Each tab keeps its own history. Somebody three screens deep in Pay who taps
// Time and comes back expects to be where they left off — a shared stack loses
// that, and it also means the back gesture walks across unrelated screens.
//
// ── LABELS ARE ALWAYS SHOWN ──────────────────────────────────────────────────
//
// An icon-only tab bar makes people guess, and the guesses are wrong: a rupee
// glyph reads as "payments" (outgoing) at least as often as "my pay". Five
// short words cost 14pt of height and remove the guessing.
//
// ── ACTIVE IS SOLID, INACTIVE IS OUTLINE ─────────────────────────────────────
//
// Plus the colour change. Colour alone is not enough — it is the same reason
// StatusBadge always carries a word as well as a dot, and the inactive-outline
// convention is what both platforms already do.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabIcons, iconFor } from '../theme/icons';
import { color, font, text } from '../theme/tokens';
import { useAuth } from '../state/AuthContext';
import { ATTENDANCE_EVENTS, useAttendanceChanged } from '../lib/events';
import { documentsAPI } from '../api';
import { listFrom } from '../lib/normalize';
import { tabsForWorkspace } from './tabs.employee';
import { screenFor } from './screens';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** Header options, shared by every stack. The hairline replaces the shadow. */
const headerOptions = {
  headerStyle: { backgroundColor: color.surface },
  headerShadowVisible: false,
  headerTitleStyle: { fontFamily: font.bold, fontSize: 17, color: color.textPrimary },
  headerTintColor: color.brand,
  headerBackTitleVisible: false, // iOS: chevron only
};

/** One tab's stack, generated from its screen list. */
function makeStack(tab) {
  function TabStack() {
    return (
      <Stack.Navigator screenOptions={headerOptions}>
        {tab.screens.map((s) => (
          <Stack.Screen
            key={s.name}
            name={s.name}
            component={screenFor(s.name)}
            options={{
              // The header title, the tab label and the screen's own h1 are
              // the same words. That string lives in tabs.employee.js (§2).
              title: s.title,
              headerShown: s.headerShown !== false && s.presentation !== 'modal',
              presentation: s.presentation,
              // A modal form supplies its own header (FormSheet) with an X.
              ...(s.presentation === 'modal' ? { headerShown: false } : null),
            }}
          />
        ))}
      </Stack.Navigator>
    );
  }
  TabStack.displayName = `${tab.name}Stack`;
  return TabStack;
}

/**
 * The More badge: things waiting on the PERSON.
 *
 * Company documents they haven't acknowledged, plus document requests HR has
 * made of them. Not their own pending requests — see tabs.employee.js.
 *
 * It subscribes to the event bus, so an acknowledgement clears it WITHOUT A
 * RELOAD (CLAUDE.md §7). A queue whose decisions aren't emitted goes stale
 * until the app restarts.
 */
function useInboxCount() {
  const [count, setCount] = useState(0);

  const load = React.useCallback(async () => {
    try {
      const [issued, reqs] = await Promise.all([
        // `compliance_state` is the server's own word for "this one still
        // needs the employee" — asking for pending and overdue separately
        // would be two requests for one number.
        documentsAPI.getMyIssuedDocuments({ compliance_state: 'pending', limit: 50 }).catch(() => null),
        documentsAPI.getMyDocumentRequests({ status: 'pending', limit: 1 }).catch(() => null),
      ]);
      const ackCount = issued ? listFrom(issued, ['documents', 'issued_documents']).length : 0;
      // `limit: 1` keeps the payload tiny; the TOTAL is the number we want.
      // Both pagination spellings are checked — the two halves of the gateway
      // disagree (10-api/05-contract-traps.md).
      const reqCount = Number(
        reqs?.data?.pagination?.total
        ?? reqs?.data?.pagination?.total_count
        ?? reqs?.data?.total
        ?? 0,
      ) || 0;
      setCount(ackCount + reqCount);
    } catch {
      // A badge is never worth an error state. No number is better than a
      // wrong one, and the screens themselves report their own failures.
      setCount(0);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAttendanceChanged(
    [ATTENDANCE_EVENTS.ACKNOWLEDGEMENT, ATTENDANCE_EVENTS.DOCUMENT_REQUEST],
    load,
  );

  return count;
}

export function AppTabs() {
  const { workspace } = useAuth();
  const insets = useSafeAreaInsets();
  const inbox = useInboxCount();

  // `null` for an unknown workspace rather than a default. The gate upstream
  // means this can't happen — and if it ever does, an empty navigator is the
  // right failure, not somebody else's tabs (§2).
  const tabs = tabsForWorkspace(workspace);

  const stacks = useMemo(
    () => (tabs || []).map((tab) => ({ ...tab, Component: makeStack(tab) })),
    [tabs],
  );

  if (!tabs) return null;

  return (
    <Tab.Navigator
      // STEP 5 OF THE ANDROID BACK CHAIN, and it is one word rather than a
      // listener: back from a tab root that isn't Home switches to Home
      // instead of exiting. Exiting the app from the Pay tab surprises
      // people; one more press from Home exits, which is the convention.
      // It is the default in React Navigation 7 — written out because a
      // hand-rolled BackHandler in RootNavigator was the wrong fix for it,
      // and this is where someone will look (RootNavigator's header).
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false, // each stack draws its own header
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          backgroundColor: color.surface,
          borderTopWidth: 1,
          borderTopColor: color.border,
          // Android draws an elevation shadow on the tab bar by default, which
          // fights the hairline. One or the other.
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.2 },
        tabBarHideOnKeyboard: true,
      }}
    >
      {stacks.map((tab) => {
        const pair = tabIcons[tab.icon];
        return (
          <Tab.Screen
            key={tab.name}
            name={tab.name}
            component={tab.Component}
            options={{
              tabBarLabel: tab.label,
              tabBarAccessibilityLabel: tab.label,
              tabBarIcon: ({ focused, color: tint, size }) => {
                const Glyph = focused
                  ? (pair?.active || iconFor(tab.icon))
                  : (pair?.inactive || iconFor(tab.icon));
                return Glyph ? <Glyph size={size ?? 24} color={tint} /> : null;
              },
              ...(tab.badge === 'inbox' && inbox > 0
                ? {
                  tabBarBadge: inbox,
                  tabBarBadgeStyle: { backgroundColor: color.danger.dot, color: color.textOnBrand, fontFamily: font.bold, fontSize: 10 },
                }
                : null),
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}

export { headerOptions };
export default AppTabs;
