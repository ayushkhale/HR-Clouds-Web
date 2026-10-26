// ─────────────────────────────────────────────────────────────────────────────
// ui/Screen.jsx — the shell every screen sits in.
//
// It owns the four things that go wrong once per screen if each screen does
// them itself: safe areas, the 16px gutter, pull-to-refresh and the keyboard.
//
// ── THE ONE PROP TO GET RIGHT: `scroll` ──────────────────────────────────────
//
// `scroll={false}` WHEN THE CHILD IS A FlatList. A FlatList inside a
// ScrollView is given infinite height, so it renders every row at once:
// windowing is dead, `onEndReached` never fires, and a 200-row attendance
// history takes four seconds to appear and scrolls like treacle. React Native
// warns about it in dev and people routinely silence the warning instead of
// fixing it. Don't.
//
// Use `<Screen scroll>` for dashboards and detail pages (a column of cards),
// and `<Screen scroll={false}>` + a FlatList with `ListHeaderComponent` for
// every list. The list's own `refreshControl` then does the refreshing — which
// is why `onRefresh` here is wired only in the scroll case.
//
// ── SAFE AREAS ───────────────────────────────────────────────────────────────
//
// `edges` defaults to top+bottom, but a screen inside the tab navigator must
// NOT claim the bottom edge — the tab bar already sits there, and claiming it
// adds 34pt of dead space above the tabs on an iPhone. Pass
// `edges={['top']}` inside the tabs, or let `footer` handle it (it accounts
// for the inset itself).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, elevate, gutter, space } from '../theme/tokens';

export function Screen({
  children,
  /** `false` when the child is a FlatList/SectionList — see the header. */
  scroll = true,
  refreshing = false,
  onRefresh,
  /** Pinned above the safe area. For a form's submit, a punch button. */
  footer,
  /** `false` to run content to the screen edges (a full-bleed chart, a map). */
  gutters = true,
  edges = ['top', 'bottom'],
  /** Extra bottom padding so the last row clears a pinned footer. */
  contentStyle,
  background = color.bg,
  /** Avoid the keyboard. Off by default; FormSheet turns it on. */
  keyboard = false,
  style,
}) {
  const insets = useSafeAreaInsets();
  const padTop = edges.includes('top') ? insets.top : 0;
  const padBottom = edges.includes('bottom') && !footer ? insets.bottom : 0;

  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      // The spinner is the brand colour on both platforms — iOS takes a tint,
      // Android takes an array.
      tintColor={color.brand}
      colors={[color.brand]}
    />
  ) : undefined;

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        gutters && { paddingHorizontal: gutter },
        { paddingTop: space[4], paddingBottom: space[6] + padBottom },
        contentStyle,
      ]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      // Android's overscroll glow on a white background looks like a rendering
      // fault; iOS's bounce is expected and stays.
      overScrollMode={Platform.OS === 'android' ? 'never' : 'auto'}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, gutters && { paddingHorizontal: gutter }, contentStyle]}>
      {children}
    </View>
  );

  const content = (
    <View style={[{ flex: 1, backgroundColor: background, paddingTop: padTop }, style]}>
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: space[3] + (edges.includes('bottom') ? insets.bottom : 0) },
            elevate('md'),
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );

  if (!keyboard) return content;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // 'padding' is correct on iOS; on Android the window softInputMode in
      // AndroidManifest already resizes, and adding behaviour here double-shifts.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  );
}

/**
 * The screen's own `<h1>`. It must read EXACTLY the same as the tab label and
 * the native header title (CLAUDE.md §2: "sidebar label = page h1 = top bar
 * title"). Three near-synonyms for one screen is how people stop trusting the
 * navigation.
 *
 * Only the Home screen uses PageHeader (the purple hero) instead.
 */
export function ScreenTitle({ children, right, style }) {
  return (
    <View style={[styles.titleRow, style]}>
      <View style={{ flex: 1 }}>{children}</View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space[3],
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    marginBottom: space[4],
  },
});

export default Screen;
