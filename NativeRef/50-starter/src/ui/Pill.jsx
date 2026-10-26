// ─────────────────────────────────────────────────────────────────────────────
// ui/Pill.jsx — a small label chip. Web ancestor: DetailPill.
//
// Purple only (CLAUDE.md §5). A pill is NOT a status: a status is a
// StatusBadge, which always carries a dot and a word. A pill is a tag — "Increment",
// "Every month", "Unpaid". If you find yourself passing a tone that means
// good/bad, you want StatusBadge.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { color, radius, space, text } from '../theme/tokens';

const VARIANTS = {
  soft: { backgroundColor: color.brandSoftBg, borderColor: color.brandSoftBg, color: color.brandSoftFg },
  solid: { backgroundColor: color.brand, borderColor: color.brand, color: color.textOnBrand },
  outline: { backgroundColor: 'transparent', borderColor: color.brandSoftBorder, color: color.brandSoftFg },
  muted: { backgroundColor: color.surfaceSubtle, borderColor: color.border, color: color.textSecondary },
};

export function Pill({ children, variant = 'soft', style, textStyle }) {
  const v = VARIANTS[variant] || VARIANTS.soft;
  return (
    <View
      style={[{
        alignSelf: 'flex-start',
        paddingHorizontal: space[2],
        paddingVertical: 3,
        borderRadius: radius.full,
        borderWidth: 1,
        backgroundColor: v.backgroundColor,
        borderColor: v.borderColor,
      }, style]}
    >
      <Text numberOfLines={1} style={[text.badge, { color: v.color }, textStyle]}>
        {children}
      </Text>
    </View>
  );
}

export default Pill;
