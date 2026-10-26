// ─────────────────────────────────────────────────────────────────────────────
// ui/ErrorState.jsx — a read that failed.
//
// It branches on WHAT KIND of failure, because the three need different things:
//
//   • OFFLINE          → say so, offer Try again (it will work when signal is
//                        back), show no error detail
//   • NOT SWITCHED ON  → say so, and show NO retry button. A feature the org
//                        hasn't enabled cannot be retried into existence, and a
//                        button that does nothing is worse than no button
//   • A REAL ERROR     → the mapped message from the domain's error module,
//                        plus Try again
//
// All three decided in one place — lib/errors/index.js `errorPresentation()` —
// so two screens can't disagree about whether something is retryable.
//
// IT IS NOT "NOTHING ON FILE". A failed read must never render the empty state
// (CLAUDE.md §7): "No payslips yet" for a request that timed out is how
// somebody concludes they were not paid.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { errorPresentation } from '../lib/errors';
import { icons } from '../theme/icons';
import { color, iconSize, radius, space, text } from '../theme/tokens';
import { Button } from './Button';

export function ErrorState({
  error,
  onRetry,
  /** Say what couldn't be loaded — "Couldn’t load your attendance." */
  fallback = 'Couldn’t load this just now.',
  domain = 'attendance',
  compact = false,
  style,
}) {
  const { message, retryable, kind } = errorPresentation(error, domain, fallback);
  const Glyph = kind === 'unavailable' ? icons.info : icons.warn;
  const tint = kind === 'error' ? color.danger : color.neutral;

  return (
    <View
      accessibilityRole="alert"
      style={[{
        alignItems: 'center',
        paddingVertical: compact ? space[6] : space[10],
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
          backgroundColor: tint.bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space[1],
        }}
      >
        {Glyph ? <Glyph size={iconSize.lg} color={tint.fg} /> : null}
      </View>

      <Text style={[text.small, { textAlign: 'center', maxWidth: 320, color: color.textBody }]}>
        {message}
      </Text>

      {retryable && onRetry ? (
        <Button
          title="Try again"
          variant="soft"
          size="sm"
          icon={icons.refresh}
          onPress={onRetry}
          style={{ marginTop: space[3] }}
        />
      ) : null}
    </View>
  );
}

export default ErrorState;
