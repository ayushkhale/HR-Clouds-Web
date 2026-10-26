// ─────────────────────────────────────────────────────────────────────────────
// ui/Row.jsx — the pressable list row. The native `rowPreviewProps`.
//
// THE ROW IS THE ONLY WAY INTO A DETAIL (CLAUDE.md §3). The whole row opens the
// record sheet; there is no View button, no eye icon, no "Review" link. The web
// app deleted its `RowOpenButton` and does not miss it. A row's `actions` are
// REAL actions only — Approve, Cancel, Download — the things that do something
// other than show you what you can already see.
//
// ── WHAT THIS COMPONENT EXISTS TO PREVENT ────────────────────────────────────
//
// 1. A ROW THAT OPENS SOMETHING BUT ISN'T A BUTTON. The web rule is "don't
//    hand-roll onClick + cursor-pointer on a <tr> — that loses keyboard
//    access". The native equivalent is a <View> with an onTouchEnd, or a
//    Pressable with no accessibilityRole: TalkBack then reads the row's text
//    and gives no hint that it does anything. Hence the role and the label.
//
// 2. A DEAD PRESS. A row that opens nothing gets NO `onPress`, and then it
//    renders as plain content with no press feedback at all. A row that
//    highlights and then does nothing is worse than one that never offered.
//
// 3. AN INNER BUTTON THAT ALSO OPENS THE SHEET. On the web that is handled by
//    guards in `rowPreviewProps`; on native, children in `actions` are inside
//    their own Pressable and RN does not bubble a handled press, so a Download
//    button cannot also open the sheet. Keep actions in `actions` and this
//    stays true.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, gutter, space, text } from '../theme/tokens';
import { icons } from '../theme/icons';
import { displayValue } from '../lib/format';

/**
 * @param {object} props
 * @param {Function} [props.onPress]  OMIT for a row that opens nothing
 * @param {string} [props.accessibilityLabel] what opens — "Loan details"
 * @param {React.ReactNode} [props.left]  an Avatar, an icon tile
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle] ONE line. Everything else is in the sheet
 * @param {React.ReactNode} [props.value]  right-aligned, tabular
 * @param {React.ReactNode} [props.badge]  a StatusBadge or Pill
 * @param {React.ReactNode} [props.actions] REAL actions only
 * @param {boolean} [props.chevron]  default: shown when the row opens something
 */
export function Row({
  onPress,
  accessibilityLabel,
  left,
  title,
  subtitle,
  value,
  valueCaption,
  badge,
  actions,
  chevron,
  disabled = false,
  style,
}) {
  const opens = !!onPress && !disabled;
  const showChevron = chevron ?? (opens && !actions);
  const Chevron = icons.chevronRight;

  const body = (
    <>
      {left ? <View style={{ marginRight: space[3] }}>{left}</View> : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={text.bodyStrong}>{displayValue(title)}</Text>
        {subtitle ? (
          <Text numberOfLines={1} style={text.small}>{subtitle}</Text>
        ) : null}
        {badge ? <View style={{ marginTop: 4, flexDirection: 'row' }}>{badge}</View> : null}
      </View>

      {value !== undefined && value !== null ? (
        <View style={{ alignItems: 'flex-end', marginLeft: space[2] }}>
          <Text style={[text.bodyStrong, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
          {valueCaption ? <Text style={text.caption}>{valueCaption}</Text> : null}
        </View>
      ) : null}

      {actions ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], marginLeft: space[2] }}>
          {actions}
        </View>
      ) : null}

      {showChevron && Chevron ? (
        <Chevron size={16} color={color.textMuted} style={{ marginLeft: space[1] }} />
      ) : null}
    </>
  );

  const base = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space[3],
    paddingHorizontal: gutter,
    minHeight: 60,
    opacity: disabled ? 0.55 : 1,
  };

  // No onPress → a plain View. Not a Pressable with a no-op, which would still
  // announce itself as a button and still flash on touch.
  if (!opens) return <View style={[base, style]}>{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      // The hint, not the label: the label is the row's own text, which the
      // screen reader reads from the children. "Opens Loan details" tells
      // somebody what the press does without replacing what the row says.
      accessibilityHint={accessibilityLabel ? `Opens ${accessibilityLabel}` : 'Opens the details'}
      onPress={onPress}
      // The native equivalent of web's `hover:bg-purple-50/40`.
      style={({ pressed }) => [base, pressed && { backgroundColor: color.pressTint }, style]}
    >
      {body}
    </Pressable>
  );
}

/**
 * The trailing line under a list: how many there are, and whether more are
 * coming.
 *
 * `noun` exists for one specific reason: the dense attendance history endpoints
 * PAGINATE OVER CALENDAR DAYS, NOT RECORDS. A September page carries 30 entries
 * whether or not anybody punched, so "30 records" would be a lie — it is
 * "30 days". Pass the right noun. (10-api/05-contract-traps.md)
 */
export function ListFooter({
  page = 1,
  totalPages = 1,
  total = 0,
  loading = false,
  noun = 'record',
  onEndReachedHint = true,
  style,
}) {
  const more = page < totalPages;
  const label = total === 1 ? `1 ${noun}` : `${total} ${noun}s`;

  return (
    <View style={[{ paddingVertical: space[5], alignItems: 'center', gap: space[1] }, style]}>
      {loading && more ? (
        <Text style={text.caption}>Loading more…</Text>
      ) : (
        <Text style={text.caption}>{label}</Text>
      )}
      {more && !loading && onEndReachedHint ? (
        <Text style={text.caption}>Scroll for more</Text>
      ) : null}
    </View>
  );
}

export default Row;
