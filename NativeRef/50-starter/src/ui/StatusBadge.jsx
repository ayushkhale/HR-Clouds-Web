// ─────────────────────────────────────────────────────────────────────────────
// ui/StatusBadge.jsx — ONE badge, app-wide.
//
// The web app grew eight divergent status badges before they were unified, and
// the same status rendered amber on one screen and grey on another. This is the
// only one. Don't write a second.
//
// THREE RULES IT ENFORCES:
//
//   1. COLOUR NEVER CARRIES THE STATUS ALONE. Every badge has a dot AND a word.
//      About 1 in 12 men can't separate the violet/fuchsia pair reliably, and a
//      purple-only palette makes that worse, not better.
//
//   2. AN UNKNOWN STATUS DEGRADES, NEVER CRASHES AND NEVER LEAKS. statusMeta()
//      falls back to humanize() plus a slate tone, so a status the backend adds
//      next month reads "Partially approved", not "PARTIALLY_APPROVED" and not
//      a blank. (CLAUDE.md §4 — no raw enum reaches the screen.)
//
//   3. THE TONE COMES FROM lib/enums.js, NOT FROM THE CALLER. A screen that
//      picks its own colour is how "pending" became three colours on the web.
//      Pass `kind` + `status`; that is the whole API.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { statusMeta } from '../lib/enums';
import { radius, space, text, toneOf } from '../theme/tokens';

/**
 * @param {object} props
 * @param {'record'|'regularization'|'compoff'|'overtime'|'anomaly'|'severity'|'leave'} props.kind
 * @param {string} props.status  the raw API value — pass it through unchanged
 * @param {boolean} [props.long] the longer label where there is room for it
 * @param {boolean} [props.dense] 10px, for inside a dense row
 */
export function StatusBadge({ kind = 'record', status, long = false, dense = false, style }) {
  const meta = statusMeta(kind, status);
  const t = toneOf(meta.tone);
  const label = long ? meta.longLabel : meta.label;

  return (
    <View
      // One label for the whole badge: a screen reader reading the dot as a
      // separate element announces "image, Approved", which is noise.
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 5,
        paddingLeft: space[2],
        paddingRight: space[2] + 1,
        paddingVertical: dense ? 2 : 3,
        borderRadius: radius.full,
        borderWidth: 1,
        backgroundColor: t.bg,
        borderColor: t.border,
      }, style]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} />
      <Text numberOfLines={1} style={[text.badge, { color: t.fg, fontSize: dense ? 10 : 11 }]}>
        {label}
      </Text>
    </View>
  );
}

export default StatusBadge;
