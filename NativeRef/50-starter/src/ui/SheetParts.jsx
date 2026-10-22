// ─────────────────────────────────────────────────────────────────────────────
// ui/SheetParts.jsx — the six things a RecordSheet is made of.
//
// Web ancestors, one for one: DetailStats · DetailSection · DetailGrid ·
// DetailTable · DetailText · DetailFooterNote.
//
// Reference implementation to copy the composition from: the salary history
// dialog in roles/hr/payroll/screens/EmployeeSalaryStructuresPage.jsx.
//
// ── THE PHONE CHANGES EXACTLY TWO NUMBERS ────────────────────────────────────
//
//   DetailGrid  max 4 columns → SheetGrid  MAX 2
//   DetailStats 4 across      → SheetStats 2 across
//
// Everything else is identical, deliberately: long or secondary sections start
// FOLDED with their total in the title, `collapsible={false}` pins one open,
// money splits Earnings / Deductions, and an empty value is "N/A" and never a
// dash.
//
// ── WHERE THE ⓘ GOES IN HERE ────────────────────────────────────────────────
//
// Every part takes a `help` — `{ surface, field }` — and passes it to
// <FieldHelp>, which renders NOTHING when the config has no entry for this
// workspace. So you can pass it liberally; the config decides.
//
//   • SheetSection → in the header's right-hand area. NEVER on the fold
//     toggle: one tap would collapse the section and open the popover.
//   • SheetTable   → on the COLUMN HEADER, never per row. Twenty rows means
//     twenty identical ⓘs explaining the same column.
//   • SheetGrid / SheetStats → on the item's label.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { displayValue } from '../lib/format';
import { icons } from '../theme/icons';
import { color, iconSize, radius, space, text } from '../theme/tokens';
import { FieldHelp } from './FieldHelp';

/* ─── SheetStats ──────────────────────────────────────────────────────────────
   The headline numbers, read before anything else. TWO ACROSS on a phone —
   four 11px captions in a 358pt row wrap to three lines each and stop being
   scannable, which is the whole point of them. */

/**
 * @param {object} props
 * @param {Array<{label: string, value: any, caption?: string, icon?: Function,
 *   help?: {surface: string, field: string}, tone?: string}>} props.items
 */
export function SheetStats({ items = [], cols = 2, style }) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }, style]}>
      {items.filter(Boolean).map((item, i) => (
        <View
          key={item.label || i}
          style={{
            // `flexBasis` rather than `width`, so a third item wraps to a new
            // row at full-ish width instead of being squeezed.
            flexGrow: 1,
            flexBasis: cols === 1 ? '100%' : '45%',
            backgroundColor: color.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: color.borderSubtle,
            padding: space[3],
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {item.icon ? <item.icon size={iconSize.sm} color={color.brand} /> : null}
            <Text numberOfLines={2} style={[text.label, { flexShrink: 1 }]}>{item.label}</Text>
            {item.help ? <FieldHelp {...item.help} /> : null}
          </View>
          <Text style={[text.metric, { fontSize: 20, lineHeight: 24 }]}>
            {displayValue(item.value)}
          </Text>
          {/* A caption is for a qualifier ("left", "paid", "this month") — NOT
              a unit. formatDayCount() already carries its own unit, so a
              "days" caption beside it reads "2 Days and 1 Half Day days". */}
          {item.caption ? <Text style={text.caption}>{item.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/* ─── SheetSection ───────────────────────────────────────────────────────── */

/**
 * A titled card that folds.
 *
 * @param {object} props
 * @param {string} props.title  PUT THE TOTAL IN IT when the section is folded
 *   — "Deductions (₹17,568)". A folded section with no number gives the reader
 *   nothing to decide whether to open it.
 * @param {boolean} [props.defaultOpen]  `false` for long or secondary sections
 * @param {boolean} [props.collapsible]  `false` pins it open
 * @param {{surface: string, field: string}} [props.help]
 */
export function SheetSection({
  title,
  subtitle,
  defaultOpen = true,
  collapsible = true,
  help,
  right,
  children,
  style,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? icons.chevronUp : icons.chevronDown;
  const shown = collapsible ? open : true;

  return (
    <View
      style={[{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        overflow: 'hidden',
      }, style]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          paddingHorizontal: space[4],
          paddingVertical: space[3],
          backgroundColor: color.surfaceSubtle,
        }}
      >
        {/* The toggle is its own Pressable so the ⓘ beside it is NOT inside an
            interactive element. Tapping the ⓘ must not collapse the section. */}
        <Pressable
          accessibilityRole={collapsible ? 'button' : 'header'}
          accessibilityState={collapsible ? { expanded: open } : undefined}
          accessibilityHint={collapsible ? (open ? 'Collapses this section' : 'Expands this section') : undefined}
          disabled={!collapsible}
          onPress={() => setOpen((v) => !v)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 28 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={text.h3}>{title}</Text>
            {subtitle ? <Text style={text.caption}>{subtitle}</Text> : null}
          </View>
          {collapsible && Chevron ? <Chevron size={iconSize.sm} color={color.textSecondary} /> : null}
        </Pressable>

        {help ? <FieldHelp {...help} /> : null}
        {right}
      </View>

      {shown ? <View style={{ padding: space[4], gap: space[3] }}>{children}</View> : null}
    </View>
  );
}

/* ─── SheetGrid ───────────────────────────────────────────────────────────── */

const normalizeItem = (item) => (Array.isArray(item)
  ? { label: item[0], value: item[1] }
  : item);

/**
 * Label above value — the same look as a read-only form field, which is the
 * point: a record inspector should read like the form that produced it.
 *
 * MAX 2 COLUMNS on a phone. `wide: true` spans both — use it for an address,
 * a reason, a long name.
 *
 * @param {object} props
 * @param {Array<[string, any]|{label: string, value: any, help?: object, wide?: boolean}>} props.items
 */
export function SheetGrid({ items = [], cols = 2, style }) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }, style]}>
      {items.filter(Boolean).map(normalizeItem).map((item, i) => (
        <View
          key={item.label || i}
          style={{
            flexGrow: 1,
            flexBasis: item.wide || cols === 1 ? '100%' : '44%',
            gap: 3,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={[text.label, { flexShrink: 1 }]}>{item.label}</Text>
            {item.help ? <FieldHelp {...item.help} /> : null}
          </View>
          {/* displayValue keeps a real 0 and turns absence into "N/A" — a zero
              balance is a fact, and a dash is never rendered (CLAUDE.md §5). */}
          <Text style={text.body}>{displayValue(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

/* ─── SheetTable ─────────────────────────────────────────────────────────── */

/**
 * Line items: payslip components, loan instalments, declaration rows.
 *
 * IT SCROLLS HORIZONTALLY inside its own bordered box rather than squeezing
 * columns to fit. A money column compressed to 40pt wraps "₹1,23,456" over two
 * lines and the table stops being readable — the web version made the same
 * call for the same reason.
 *
 * @param {object} props
 * @param {Array<{header: string, render: Function, align?: 'left'|'right',
 *   width?: number, help?: object}>} props.columns
 * @param {Array<object>} props.rows
 * @param {string} [props.empty]  what "no rows" means, in words
 */
export function SheetTable({ columns = [], rows = [], empty = 'Nothing to show.', style }) {
  if (!rows.length) {
    return <Text style={[text.small, { color: color.textMuted }]}>{empty}</Text>;
  }

  return (
    <View
      style={[{
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: radius.md,
        overflow: 'hidden',
      }, style]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header row — the ⓘ lives here, once per column. */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: color.surfaceSubtle,
              borderBottomWidth: 1,
              borderBottomColor: color.border,
            }}
          >
            {columns.map((col, c) => (
              <View
                key={col.header || c}
                style={{
                  width: col.width || 120,
                  paddingHorizontal: space[3],
                  paddingVertical: space[2],
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                  gap: 2,
                }}
              >
                <Text style={text.label}>{col.header}</Text>
                {col.help ? <FieldHelp {...col.help} /> : null}
              </View>
            ))}
          </View>

          {rows.map((row, r) => (
            <View
              key={row?.id || r}
              style={{
                flexDirection: 'row',
                borderBottomWidth: r === rows.length - 1 ? 0 : 1,
                borderBottomColor: color.borderSubtle,
                backgroundColor: color.surface,
              }}
            >
              {columns.map((col, c) => {
                const content = col.render ? col.render(row, r) : null;
                return (
                  <View
                    key={c}
                    style={{
                      width: col.width || 120,
                      paddingHorizontal: space[3],
                      paddingVertical: space[2],
                      alignItems: col.align === 'right' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {typeof content === 'string' || typeof content === 'number' ? (
                      <Text style={[text.small, { color: color.textBody, fontVariant: ['tabular-nums'] }]}>
                        {displayValue(content)}
                      </Text>
                    ) : content ?? (
                      // An empty cell reads "N/A", muted. Never a dash, never
                      // blank — blank looks like a rendering failure.
                      <Text style={[text.small, { color: color.textMuted }]}>N/A</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── SheetText ──────────────────────────────────────────────────────────── */

/**
 * A reason or a note, as the person typed it. Line breaks are preserved
 * (`\n` renders), long unbroken words wrap rather than overflow, and an empty
 * one says so in words instead of leaving a gap.
 */
export function SheetText({ children, empty = 'No reason given.', style }) {
  const value = typeof children === 'string' ? children.trim() : children;
  if (!value) return <Text style={[text.small, { color: color.textMuted }]}>{empty}</Text>;
  return (
    <Text
      style={[text.body, {
        backgroundColor: color.surfaceSubtle,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        padding: space[3],
      }, style]}
    >
      {value}
    </Text>
  );
}

/* ─── SheetFooterNote ───────────────────────────────────────────────────── */

/**
 * SAYS WHY THERE ARE NO ACTIONS. This is not decoration — it is the difference
 * between a sheet that looks finished and one that looks broken.
 *
 *   <SheetFooterNote>Approved leave can’t be changed. Ask your manager to
 *   cancel it for you.</SheetFooterNote>
 *
 * Pass it as RecordSheet's `footer`. A sheet with neither actions nor a note
 * leaves the reader looking for the button.
 */
export function SheetFooterNote({ children, style }) {
  return (
    <Text style={[text.caption, { flex: 1, color: color.textSecondary }, style]}>
      {children}
    </Text>
  );
}

/**
 * Money, split the house way: Earnings on the left, Deductions on the right,
 * each with its own total in the heading. Never one long list — the two are
 * read against each other, and interleaving them hides which is which.
 */
export function SheetMoneySplit({ earnings, deductions, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: space[3] }, style]}>
      <View style={{ flex: 1 }}>{earnings}</View>
      <View style={{ flex: 1 }}>{deductions}</View>
    </View>
  );
}
