// ─────────────────────────────────────────────────────────────────────────────
// ui/MonthStepper.jsx — ‹ September 2026 ›
//
// Every month-scoped screen uses this one: attendance history, the calendar,
// payslips, the summary cards. One control, so "which month am I looking at?"
// is answered the same way everywhere.
//
// FORWARD IS DISABLED PAST THE CURRENT MONTH. Not hidden — disabled, because
// the person can see there is nothing ahead rather than wondering where the
// arrow went. `isFutureMonth()` decides, and it is the one case in this app
// where a dead button is correct: next month genuinely cannot be fetched, and
// no amount of pressing will change that (CLAUDE.md §11).
//
// Labels come from monthLabel() / monthLabelShort() in lib/dates.js — never
// from toLocaleDateString, which varies with the device's ICU build and would
// print a different month name on two phones.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { isFutureMonth, monthLabel, monthLabelShort, shiftMonth } from '../lib/dates';
import { icons } from '../theme/icons';
import { IconButton } from './Button';
import { color, space, text } from '../theme/tokens';

/**
 * @param {object} props
 * @param {number} props.year
 * @param {number} props.month  1-12, NOT a JS 0-11 month
 * @param {Function} props.onChange  ({ year, month }) =>
 * @param {boolean} [props.short]  "Sep 2026" where the row is tight
 */
export function MonthStepper({ year, month, onChange, short = false, style }) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const nextBlocked = isFutureMonth(next.year, next.month);
  const label = short ? monthLabelShort(year, month) : monthLabel(year, month);

  return (
    <View
      // One element with one label, so a screen reader announces the month
      // rather than walking two unlabelled arrows around a date.
      accessible
      accessibilityLabel={`Showing ${monthLabel(year, month)}`}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: space[1] }, style]}
    >
      <IconButton
        icon={icons.chevronLeft}
        accessibilityLabel={`Previous month, ${monthLabel(prev.year, prev.month)}`}
        onPress={() => onChange(prev)}
      />
      <Text style={[text.bodyStrong, { minWidth: short ? 72 : 118, textAlign: 'center' }]}>
        {label}
      </Text>
      <IconButton
        icon={icons.chevronRight}
        accessibilityLabel={
          nextBlocked
            ? 'Next month — not available yet'
            : `Next month, ${monthLabel(next.year, next.month)}`
        }
        accessibilityState={{ disabled: nextBlocked }}
        disabled={nextBlocked}
        onPress={nextBlocked ? undefined : () => onChange(next)}
        style={nextBlocked ? { opacity: 0.35 } : null}
      />
    </View>
  );
}

/** The same stepper for a payroll period string ("2026-09"). */
export function PeriodStepper({ period, onChange, short = false, style }) {
  const [y, m] = String(period || '').split('-');
  const year = Number(y);
  const month = Number(m);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return <Text style={[text.bodyStrong, { color: color.textMuted }]}>N/A</Text>;
  }
  return (
    <MonthStepper
      year={year}
      month={month}
      short={short}
      style={style}
      onChange={({ year: yy, month: mm }) => onChange(`${yy}-${String(mm).padStart(2, '0')}`)}
    />
  );
}

export default MonthStepper;
