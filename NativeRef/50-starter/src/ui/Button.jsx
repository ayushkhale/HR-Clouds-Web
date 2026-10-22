// ─────────────────────────────────────────────────────────────────────────────
// ui/Button.jsx — every button in the app.
//
// The seven variants below are lifted from the web `AttendanceCard` so the
// punch card reads identically on both. Don't add an eighth without deleting
// one: the web app's button styles were unified for exactly this reason.
//
// ── THREE RULES, ALL OF THEM EARNED ──────────────────────────────────────────
//
// 1. `loading` KEEPS THE LABEL. A button that swaps its text for a spinner
//    looks broken, and on a slow connection the person can no longer tell what
//    they pressed. Spinner to the left, label stays put.
//
// 2. DISABLED IS FOR WHAT THE PERSON CANNOT FIX BY PRESSING (CLAUDE.md §11):
//    a request already in flight, a cooldown, a feature that isn't deployed, a
//    lookup that wouldn't load. A MISSING ANSWER IS NOT ONE OF THEM. An
//    unfinished form keeps its button LIVE and validates on the press, because
//    a dead button cannot say which of twelve boxes it is waiting for. If you
//    pass `disabled`, pass `disabledReason` too — a dead button with no
//    explanation is the bug this rule exists to prevent.
//
// 3. 44pt MINIMUM TAP TARGET, always. `height` is the visual size; hitSlop
//    makes up the difference on the smaller variants. A 32pt button is a
//    design that fails on a phone in one hand on a train.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { pressStyle } from '../theme/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  HIT_SLOP, MIN_TAP, color, iconSize, palette, radius, space, text,
} from '../theme/tokens';

const VARIANTS = {
  /** The ONE main action on a screen. */
  primary: { bg: color.brand, pressedBg: color.brandPressed, fg: color.textOnBrand, border: color.brand },
  /** Secondary. */
  soft: { bg: color.brandSoftBg, pressedBg: color.brandSoftBorder, fg: color.brandSoftFg, border: color.brandSoftBg },
  /** Tertiary. */
  outline: { bg: color.surface, pressedBg: color.brandSoftBg, fg: color.brandSoftFg, border: palette.purple[300] },
  /** Cancel, dismiss, "not now". */
  ghost: { bg: 'transparent', pressedBg: color.surfaceSubtle, fg: color.textSecondary, border: 'transparent' },
  /**
   * Destructive AND clock-out. Clock out is `danger` on purpose: it is the one
   * irreversible thing on the punch card, and the web card makes it rose for
   * the same reason. Rose is reserved — never use it for emphasis.
   */
  danger: { bg: palette.rose[500], pressedBg: palette.rose[600], fg: color.textOnBrand, border: palette.rose[500] },
  /** Start break — quiet, because it isn't the main action. */
  breakStart: { bg: color.surface, pressedBg: palette.indigo[50], fg: palette.indigo[700], border: palette.indigo[100] },
  /** End break — the main action while on a break. */
  breakEnd: { bg: palette.indigo[600], pressedBg: palette.indigo[700], fg: color.textOnBrand, border: palette.indigo[600] },
};

const SIZES = {
  /** A screen's primary action, and the punch buttons. */
  lg: { height: 48, paddingHorizontal: space[5], fontSize: 14 },
  /** The default — sheet footers, inline actions. */
  md: { height: 44, paddingHorizontal: space[4], fontSize: 14 },
  /** Inside a row or a dense header. Needs the hitSlop to reach 44. */
  sm: { height: 36, paddingHorizontal: space[3], fontSize: 13 },
};

/**
 * @param {object} props
 * @param {string} props.title           the label. Never an icon alone — see IconButton
 * @param {Function} props.onPress
 * @param {keyof VARIANTS} [props.variant]
 * @param {keyof SIZES} [props.size]
 * @param {boolean} [props.loading]      shows a spinner, keeps the label, blocks the press
 * @param {boolean} [props.disabled]     ONLY for what a press can't fix — see rule 2
 * @param {string} [props.disabledReason] announced to a screen reader, and the
 *                                        thing you should also be showing on screen
 * @param {Function} [props.icon]        a component from theme/icons.js
 * @param {boolean} [props.fullWidth]
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  disabledReason,
  icon: Icon,
  iconRight = false,
  fullWidth = false,
  style,
  textStyle,
  ...rest
}) {
  const reduced = useReducedMotion();
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  // `loading` blocks the press without reading as disabled: the request is in
  // flight, which is the one case where a dead button is honest.
  const blocked = disabled || loading;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} style={{ marginRight: space[2] }} />
      ) : null}
      {Icon && !iconRight && !loading ? <Icon size={iconSize.md} color={v.fg} /> : null}
      <Text
        numberOfLines={1}
        style={[text.bodyStrong, { color: v.fg, fontSize: s.fontSize }, textStyle]}
      >
        {title}
      </Text>
      {Icon && iconRight ? <Icon size={iconSize.md} color={v.fg} /> : null}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      // The reason is read out, so a screen-reader user isn't left guessing at
      // a button that won't respond. It is NOT a substitute for saying it on
      // screen as well.
      accessibilityHint={disabled && disabledReason ? disabledReason : undefined}
      hitSlop={size === 'sm' ? HIT_SLOP : undefined}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: Math.max(s.height, size === 'sm' ? s.height : MIN_TAP),
          height: s.height,
          paddingHorizontal: s.paddingHorizontal,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: v.border,
          backgroundColor: pressed && !blocked ? v.pressedBg : v.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          opacity: disabled ? 0.6 : 1,
        },
        fullWidth && { alignSelf: 'stretch', width: '100%' },
        pressStyle(pressed && !blocked, reduced),
        style,
      ]}
      {...rest}
    >
      {content}
    </Pressable>
  );
}

/**
 * An icon with no label. ONLY for the universally understood ones — close,
 * back, refresh, the ⓘ — and it still needs an `accessibilityLabel`, which is
 * why that prop is required rather than optional.
 *
 * Anything a person might have to guess at gets a Button with a word in it.
 */
export function IconButton({ icon: Icon, accessibilityLabel, onPress, tone = 'slate', size = iconSize.md, style, ...rest }) {
  const fg = tone === 'onDark' ? color.textOnBrand : tone === 'brand' ? color.brand : color.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? color.surfaceSubtle : 'transparent',
        },
        style,
      ]}
      {...rest}
    >
      {Icon ? <Icon size={size} color={fg} /> : null}
    </Pressable>
  );
}

/**
 * A text-only action inside a sentence or a card header ("See all", "Change").
 * NOT for anything destructive and NOT for a form's submit — both need a real
 * button with a real target.
 */
export function LinkButton({ title, onPress, style, ...rest }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, style]}
      {...rest}
    >
      <Text style={[text.smallStrong, { color: color.brand }]}>{title}</Text>
    </Pressable>
  );
}

/** A footer's two-button row: ghost Cancel on the left, the real action right. */
export function ButtonRow({ children, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: space[2], alignItems: 'center' }, style]}>
      {children}
    </View>
  );
}

export default Button;
