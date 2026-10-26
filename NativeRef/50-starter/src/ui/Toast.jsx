// ─────────────────────────────────────────────────────────────────────────────
// ui/Toast.jsx — the app's one transient message.
//
// Mount <ToastProvider> once, at the root, ABOVE the navigator. Then anywhere:
//
//   const { showToast } = useToast();
//   showToast('Correction request sent', 'success');
//
// ── DECISIONS WORTH KEEPING ──────────────────────────────────────────────────
//
// • TOP OF THE SCREEN, not the bottom. The bottom is where the tab bar, the
//   punch button and every sheet footer live; a toast there covers the control
//   somebody just pressed and gets dismissed by the next tap.
//
// • ERRORS GET LONGER (6s vs 4s). An error has to be read and understood; a
//   success only has to be noticed. The web app's 3s error toast was measurably
//   too short for a two-line message.
//
// • ONE AT A TIME. A new toast replaces the old one. A stack of three is
//   unreadable on a phone and buries the most recent — which is the only one
//   anybody cares about.
//
// • A TOAST IS NOT ERROR HANDLING. A failed read belongs in ErrorState, where
//   it can offer Try again and stay on screen. A toast is for a WRITE that
//   succeeded or failed — something that happened because of a press, where
//   the screen itself already shows the result.
//
// • `accessibilityLiveRegion` is what makes TalkBack read it without the
//   person hunting for it. An error is assertive (it interrupts); a success is
//   polite (it waits its turn).
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { microTiming } from '../theme/motion';
import { icons } from '../theme/icons';
import { color, elevate, gutter, iconSize, layer, radius, space, text, toneOf } from '../theme/tokens';

const DURATIONS = { success: 4000, info: 4000, error: 6000 };
const TONES = { success: 'emerald', error: 'rose', info: 'blue' };
const GLYPHS = { success: 'ok', error: 'warn', info: 'info' };

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, kind, id }
  const timer = useRef(null);
  const counter = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((message, kind = 'info') => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setToast({ message: String(message), kind: TONES[kind] ? kind : 'info', id: counter.current });
    timer.current = setTimeout(() => setToast(null), DURATIONS[kind] || DURATIONS.info);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast: hide }}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onPress={hide} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onPress }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const y = useSharedValue(-24);
  const opacity = useSharedValue(0);

  useEffect(() => {
    y.value = withTiming(0, microTiming(reduced));
    opacity.value = withTiming(1, microTiming(reduced));
  }, [reduced, y, opacity]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  const t = toneOf(TONES[toast.kind]);
  const Glyph = icons[GLYPHS[toast.kind]];
  const isError = toast.kind === 'error';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          top: insets.top + space[2],
          left: gutter,
          right: gutter,
          zIndex: layer.toast,
        },
        animated,
      ]}
    >
      <Pressable
        accessibilityRole={isError ? 'alert' : 'status'}
        accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
        accessibilityLabel={toast.message}
        accessibilityHint="Tap to dismiss"
        onPress={onPress}
        style={[{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space[2],
          padding: space[3],
          borderRadius: radius.md,
          borderWidth: 1,
          backgroundColor: t.bg,
          borderColor: t.border,
        }, elevate('md')]}
      >
        {Glyph ? <Glyph size={iconSize.md} color={t.fg} /> : null}
        <Text style={[text.small, { flex: 1, color: t.fg }]}>{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // A no-op rather than a throw: a toast is never the point of a screen, and a
  // missing provider must not take the screen down with it. The dev warning
  // says what to fix.
  if (!ctx) {
    if (__DEV__) console.warn('[Toast] useToast() outside <ToastProvider> — nothing will be shown.');
    return { showToast: () => {}, hideToast: () => {} };
  }
  return ctx;
}

export default ToastProvider;
