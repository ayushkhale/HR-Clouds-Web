// ─────────────────────────────────────────────────────────────────────────────
// ui/Card.jsx — the app's one surface.
//
// Web ancestor: `bg-white rounded-3xl p-6 shadow-xs border border-slate-100`.
//
// Note what the web class list does NOT contain: a heavy shadow. The web app's
// elevation is `shadow-xs`, almost nothing, and the border does the separating.
// Resist making it heavier here — a native card with a real drop shadow looks
// like a different product next to the web app on the same desk.
//
// ANDROID: `elevation` renders nothing without a `backgroundColor` on the SAME
// view. theme/tokens.js `elevate()` handles the platform split; the background
// is set below, so always keep both on this view.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';
import { color, elevate, radius, space } from '../theme/tokens';

/**
 * @param {object} props
 * @param {'default'|'hero'|'flat'} [props.tone] `hero` is radius xl + more lift
 * @param {boolean} [props.padded]  `false` for a card that HOLDS a list — rows
 *   supply their own 16px gutter, and padding here double-insets them
 */
export function Card({ children, tone = 'default', padded = true, style, ...rest }) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: color.surface,
          borderRadius: tone === 'hero' ? radius.xl : radius.lg,
          borderWidth: 1,
          borderColor: color.borderSubtle,
          overflow: 'hidden',
        },
        tone !== 'flat' && elevate(tone === 'hero' ? 'md' : 'sm'),
        padded && { padding: space[4] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A card's own heading row — the 11px uppercase label plus optional right-hand
 * content (a MonthStepper, a "See all" link, an ⓘ).
 */
export function CardHeader({ children, right, style }) {
  return (
    <View
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[2],
        marginBottom: space[3],
      }, style]}
    >
      {children}
      {right}
    </View>
  );
}

export default Card;
