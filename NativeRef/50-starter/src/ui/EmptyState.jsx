// ─────────────────────────────────────────────────────────────────────────────
// ui/EmptyState.jsx — nothing here, and what to do about it.
//
// TWO RULES, both from the web app (CLAUDE.md §6: "empty states say what to do
// next"):
//
//   1. IT SAYS WHAT TO DO NEXT. "No earned leave yet" alone leaves the person
//      wondering whether it's broken. The message explains how days get here.
//
//   2. "NONE YET" AND "NONE MATCH THIS FILTER" ARE DIFFERENT STATES, worded
//      differently, and the second one offers a way to clear the filter.
//      Showing "You haven't applied for any leave" to somebody who has simply
//      filtered to Rejected is the bug this prop pair exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { color, iconSize, radius, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  /** true when a filter or search is narrowing the list — changes the copy. */
  filtered = false,
  onClearFilter,
  style,
}) {
  const Glyph = Icon || (filtered ? icons.search : icons.info);

  return (
    <View
      style={[{
        alignItems: 'center',
        paddingVertical: space[10],
        paddingHorizontal: space[6],
        gap: space[2],
      }, style]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.full,
          backgroundColor: color.brandSoftBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space[1],
        }}
      >
        {Glyph ? <Glyph size={iconSize.lg} color={color.brand} /> : null}
      </View>

      <Text style={[text.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[text.small, { textAlign: 'center', maxWidth: 320 }]}>{message}</Text>
      ) : null}
      {action ? <View style={{ marginTop: space[3] }}>{action}</View> : null}
      {filtered && onClearFilter && !action ? (
        <View style={{ marginTop: space[3] }}>{onClearFilter}</View>
      ) : null}
    </View>
  );
}

export default EmptyState;
