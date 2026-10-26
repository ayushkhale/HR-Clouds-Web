// ─────────────────────────────────────────────────────────────────────────────
// ui/Divider.jsx — Divider and Spacer.
//
// Trivial components with a real job: they stop `marginBottom: 13` and
// `borderBottomColor: '#eee'` appearing in a screen file. Every gap in the app
// is a token (theme/tokens.js `space`), and these are how a screen asks for one
// without reaching for a literal.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';
import { color, gutter, space } from '../theme/tokens';

/**
 * A hairline rule. `inset` pulls it in to the content's left edge, which is
 * what a list wants — a full-bleed rule under an avatar row looks like a
 * section break rather than a row separator.
 */
export function Divider({ inset = false, style }) {
  return (
    <View
      // Decorative: a rule carries nothing to announce, and VoiceOver
      // stopping on it between every row is maddening.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height: 1, backgroundColor: color.borderSubtle },
        inset && { marginLeft: gutter },
        style,
      ]}
    />
  );
}

/** A gap. `size` is a key of `space` (4·8·12·16·20·24·32…), not a pixel count. */
export function Spacer({ size = 4, horizontal = false }) {
  const v = space[size] ?? size;
  return <View style={horizontal ? { width: v } : { height: v }} />;
}

export default Divider;
