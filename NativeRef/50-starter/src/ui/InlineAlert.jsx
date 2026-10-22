// ─────────────────────────────────────────────────────────────────────────────
// ui/InlineAlert.jsx — a one-line notice inside a screen or a sheet.
//
// Tone names are the WEB'S names and render purple (theme/tokens.js `tone`):
// `emerald` is violet, `amber` is fuchsia, `blue`/`sky` are indigo. Only `rose`
// is red, and it is reserved: errors, destructive consequences, lateness,
// deductions. Nothing else. (CLAUDE.md §5)
//
// THE ONE THING PEOPLE GET WRONG HERE: a geofence result is `amber`, never
// `rose`. The punch SUCCEEDED — an out-of-bounds punch is a flag for a manager
// to look at, not a failure the employee just caused. A rose box under a
// successful clock-in reads as "we didn't record your attendance", and that is
// the single most alarming thing this screen can say. See lib/geofence.js.
//
// ACCESSIBILITY: rose announces itself (`alert`); everything else is polite
// (`status`), so a notice that is merely informative doesn't interrupt whatever
// the screen reader was reading.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { iconFor } from '../theme/icons';
import { color, iconSize, radius, space, text, toneOf } from '../theme/tokens';

const ICON_FOR_TONE = {
  rose: 'warn',
  amber: 'warn',
  emerald: 'ok',
  blue: 'info',
  sky: 'info',
  indigo: 'info',
  purple: 'info',
  slate: 'info',
};

export function InlineAlert({ tone = 'slate', children, icon, style }) {
  const t = toneOf(tone);
  const Icon = icon || iconFor(ICON_FOR_TONE[tone] || 'info');
  const isError = tone === 'rose';

  return (
    <View
      accessibilityRole={isError ? 'alert' : 'status'}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      style={[{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[2],
        padding: space[3],
        borderRadius: radius.md,
        borderWidth: 1,
        backgroundColor: t.bg,
        borderColor: t.border,
      }, style]}
    >
      {Icon ? <Icon size={iconSize.sm} color={t.fg} style={{ marginTop: 1 }} /> : null}
      <Text style={[text.small, { color: t.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** One rose line under a field. Wired to the `errors` map from lib/validation.js. */
export function FieldError({ children, style }) {
  if (!children) return null;
  return (
    <Text
      accessibilityRole="alert"
      style={[text.caption, { color: color.danger.fg, marginTop: 4 }, style]}
    >
      {children}
    </Text>
  );
}

export default InlineAlert;
