// ─────────────────────────────────────────────────────────────────────────────
// navigation/RootNavigator.jsx — auth stack ⇄ app tabs, and the splash.
//
// Three states, and only three:
//
//   isLoading            → nothing. The native splash is still up.
//   !isAuthenticated     → AuthStack (Login · Otp · ForgotPassword · SelectOrg)
//   isAuthenticated      → AppTabs
//
// plus one landing that is neither: WrongWorkspace, where the role gate puts
// somebody whose account isn't an employee account.
//
// ── NO LOGIN FLASH ───────────────────────────────────────────────────────────
//
// The splash is hidden only once `isLoading` is false. Hydrating the Keychain
// takes ~50ms with no network, but rendering before it finishes means a
// returning user sees the Login screen for those 50–200ms on every single
// launch — which reads as "it signed me out again", and people stop trusting
// the app to stay signed in. `onLayout` on the container, gated on isLoading,
// is the only correct moment: after hydration AND after the first frame is
// actually painted, so there is no white gap between splash and app either.
//
// ── THE SWITCH REMOUNTS, ON PURPOSE ──────────────────────────────────────────
//
// AuthStack and AppTabs are two <Stack.Screen>s in one root navigator, not two
// containers, so React Navigation animates between them and keeps one history.
// Signing out unmounts AppTabs entirely, which throws away every screen's
// local state — no previous person's leave balance lingering behind a
// half-rendered list. Signing in unmounts AuthStack, so the typed password
// isn't sitting in a mounted TextInput behind the tabs.
//
// ── ANDROID HARDWARE BACK IS NOT HANDLED HERE ────────────────────────────────
//
// It is already a chain, and every link of it is owned by the thing that
// should own it (20-design/03-navigation.md):
//
//   1. a toast          — ignores back (not dismissible, by design)
//   2. the top sheet    — RecordSheet's own BackHandler. Handlers fire LIFO,
//                         so the newest sheet answers first, one per press
//   3. a modal          — FormSheet's, after a dirty-form confirm
//   4. a pushed screen  — the native stack pops it
//   5. a non-first tab  — `backBehavior="firstRoute"` on the tab navigator
//                         switches to Home instead of exiting (AppTabs)
//   6. Home             — the OS default: exit
//
// Step 5 is the one people get wrong by hand-rolling a listener here. It is a
// one-word prop on the navigator that owns the tabs, it already does exactly
// the right thing, and a listener at this level would fire BEFORE the tab
// navigator's own and break steps 2–4. Don't add one.
//
// ── THE ROLE GATE'S LANDING ──────────────────────────────────────────────────
//
// WrongWorkspaceScreen is a REAL screen defined in this file, not a registry
// placeholder. The gate in AuthContext has already cleared the token by the
// time it renders, so there is nothing to sign out of — it is a dead end with
// one way forward: sign in as somebody else. It must never offer a "continue
// anyway", and it must never name a route in the app.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BootSplash from 'react-native-bootsplash';
import { useAuth } from '../state/AuthContext';
import { wrongWorkspaceCopy } from '../state/session';
import { icons } from '../theme/icons';
import { color, gutter, radius, space, text } from '../theme/tokens';
import { Button } from '../ui/Button';
import { AppTabs, headerOptions } from './AppTabs';
import { screenFor } from './screens';
import { clearPendingLink, linking, setLinkingAuthed } from './linking';

const Root = createNativeStackNavigator();
const Auth = createNativeStackNavigator();

/* ── The refusal screen ───────────────────────────────────────────────────── */

/**
 * Where a non-employee account lands. The copy comes from
 * `wrongWorkspaceCopy(role)` so the sentence names the role in words
 * ("HR Admin"), never the raw code (CLAUDE.md §4).
 */
function WrongWorkspaceScreen({ route, navigation }) {
  const { refusedRole, clearRefusal } = useAuth();
  const role = route?.params?.role || refusedRole;
  const { title, message } = wrongWorkspaceCopy(role);
  const Glyph = icons.locked || icons.info;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: gutter,
        gap: space[3],
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: color.brandSoftBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Glyph ? <Glyph size={28} color={color.brand} /> : null}
      </View>

      <Text accessibilityRole="header" style={[text.h1, { textAlign: 'center' }]}>
        {title}
      </Text>
      <Text style={[text.body, { textAlign: 'center', maxWidth: 320 }]}>
        {message}
      </Text>

      <View style={{ alignSelf: 'stretch', marginTop: space[2] }}>
        <Button
          title="Sign in as someone else"
          fullWidth
          onPress={() => {
            // The token is already gone — the gate cleared it before this
            // screen mounted. This only drops the refusal so the auth stack
            // shows Login again.
            clearPendingLink();
            clearRefusal();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          }}
        />
      </View>
    </View>
  );
}

/* ── The auth stack ───────────────────────────────────────────────────────── */

/**
 * Headerless on purpose: each auth screen draws its own back affordance and
 * its own heading, because Login has no back to draw and the others need a
 * much larger heading than a native header title.
 *
 * `initialRouteName` jumps straight to WrongWorkspace when the gate refused
 * the stored session at launch, so a refused account never sees the Login
 * screen flash first.
 */
function AuthStack() {
  const { refusedRole, selection } = useAuth();

  return (
    <Auth.Navigator
      initialRouteName={refusedRole ? 'WrongWorkspace' : 'Login'}
      screenOptions={{ ...headerOptions, headerShown: false, animation: 'slide_from_right' }}
    >
      <Auth.Screen name="Login" component={screenFor('Login')} options={{ title: 'Sign in' }} />
      <Auth.Screen name="Otp" component={screenFor('Otp')} options={{ title: 'Verify' }} />
      <Auth.Screen
        name="ForgotPassword"
        component={screenFor('ForgotPassword')}
        options={{ title: 'Reset your password' }}
      />
      <Auth.Screen
        name="SelectOrg"
        component={screenFor('SelectOrg')}
        // The selection token lives in AuthContext state, never in params and
        // never on disk. The screen reads it from the context; routing it
        // through params would put a live credential in navigation state.
        initialParams={{ count: selection?.organizations?.length || 0 }}
        options={{ title: 'Choose a workspace' }}
      />
      <Auth.Screen
        name="WrongWorkspace"
        component={WrongWorkspaceScreen}
        options={{ title: 'This app is for employees', gestureEnabled: false }}
      />
    </Auth.Navigator>
  );
}

/* ── The container ────────────────────────────────────────────────────────── */

/**
 * The navigation theme. Its `background` is what shows during a transition and
 * behind a screen that hasn't painted yet — leave it at React Navigation's
 * default white and every push flashes white on the way in.
 */
const navTheme = {
  dark: false,
  colors: {
    primary: color.brand,
    background: color.bg,
    card: color.surface,
    text: color.textPrimary,
    border: color.border,
    notification: color.danger.dot,
  },
  // React Navigation 7 expects a `fonts` map; the native header is the only
  // thing that reads it, and headerTitleStyle already overrides that.
  fonts: {
    regular: { fontFamily: text.body.fontFamily, fontWeight: '400' },
    medium: { fontFamily: text.bodyStrong.fontFamily, fontWeight: '500' },
    bold: { fontFamily: text.h2.fontFamily, fontWeight: '700' },
    heavy: { fontFamily: text.h1.fontFamily, fontWeight: '800' },
  },
};

export function RootNavigator() {
  const { isAuthenticated, isLoading, refusedRole } = useAuth();
  const navigationRef = useNavigationContainerRef();
  const splashHidden = useRef(false);

  // Deep links wait for a session rather than being dropped — see linking.js.
  useEffect(() => { setLinkingAuthed(isAuthenticated); }, [isAuthenticated]);

  // A refused account's held link is dropped. The gate already stops it from
  // resolving (AppTabs never mounts), but it must not fire at the next person
  // to sign in on this phone.
  useEffect(() => { if (refusedRole) clearPendingLink(); }, [refusedRole]);

  const onReady = () => {
    // Belt and braces: `onLayout` below is the normal path. If the container
    // reports ready without ever laying out (it has happened on a cold Android
    // start under a slow debugger), the splash still comes down.
    if (!isLoading) hideSplash();
  };

  const hideSplash = () => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    BootSplash.hide({ fade: true }).catch(() => {});
  };

  if (isLoading) {
    // Deliberately nothing. The native splash is still covering the window,
    // and anything drawn here — a spinner, a logo — is a second loading state
    // on top of the one already on screen.
    return null;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      linking={linking}
      onReady={onReady}
      // Never persist navigation state: restoring somebody into a half-filled
      // claim form from last Tuesday is worse than starting fresh
      // (20-design/03-navigation.md).
      onStateChange={undefined}
    >
      <View style={{ flex: 1, backgroundColor: color.bg }} onLayout={hideSplash}>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <Root.Screen
              name="AppTabs"
              component={AppTabs}
              // No gesture out of the app shell. There is nothing behind it.
              options={{ gestureEnabled: false, animation: 'fade' }}
            />
          ) : (
            <Root.Screen
              name="AuthStack"
              component={AuthStack}
              options={{ gestureEnabled: false, animation: 'fade' }}
            />
          )}
        </Root.Navigator>
      </View>
    </NavigationContainer>
  );
}

export { WrongWorkspaceScreen, navTheme };
export default RootNavigator;
