// ─────────────────────────────────────────────────────────────────────────────
// ui/Field.jsx — label + ⓘ + control + error, in the app's one arrangement.
//
// Every form field in the app is wrapped in this. It is what makes a correction
// request and a leave application look like the same product.
//
// ── THE ⓘ SITS BESIDE THE LABEL, NEVER INSIDE IT ─────────────────────────────
//
// Inside, it becomes part of the input's accessible name and the field
// announces itself as "Reason What is a reason? text field". So the label row
// is a `flexDirection: row` containing a <Text> and a <FieldHelp> as siblings,
// which is exactly the arrangement the web rule describes.
//
// ── AN INVALID BOX IS A RED BOX (CLAUDE.md §11.4) ────────────────────────────
//
// Not merely a red line of text under a box that still looks fine. `error`
// reddens the BORDER of the control through the `invalid` prop the controls
// below accept, and prints the message underneath. Both, every time.
//
// ── AND IT IS NOT RED BEFORE THE FIRST PRESS (§11.3) ────────────────────────
//
// This component does not know about `attempted` — on purpose. The screen
// decides, by passing `error={show(problems.reason)}` where
// `show = revealer(attempted)` from lib/formGuard.js. A Field is red when it
// is given an error and not before.
//
// ── `register` ───────────────────────────────────────────────────────────────
//
// Spread from `useFormFocus().register('reason')`. It reports this field's
// position so a press on an unfinished form can scroll to it, and hands the
// control's focus() to the guard. A field with a problem key and no register
// is still found — it just can't be travelled to.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { color, space, text } from '../theme/tokens';
import { FieldHelp } from './FieldHelp';
import { FieldError } from './InlineAlert';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {{surface: string, field: string}} [props.help]
 * @param {string} [props.error]  the message. Reddens the control too
 * @param {string} [props.hint]   a format or a range, shown when there's no error
 * @param {boolean} [props.required]
 * @param {object} [props.register]  from useFormFocus().register(key)
 * @param {boolean} [props.wide]  span both columns of a two-column form grid
 */
export function Field({
  label,
  help,
  error,
  hint,
  required = false,
  register,
  wide = false,
  children,
  style,
}) {
  // The control gets `invalid` so its border reddens — passing only the
  // message would leave a red sentence under a box that looks fine (§11.4).
  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
      invalid: !!error || children.props.invalid,
      registerFocus: register?.registerFocus || children.props.registerFocus,
    })
    : children;

  return (
    <View
      onLayout={register?.onLayout}
      style={[{ gap: 6, flexGrow: 1, flexBasis: wide ? '100%' : '44%' }, style]}
    >
      {/* Label row: Text and FieldHelp as SIBLINGS. See the header. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text style={[text.label, { flexShrink: 1 }]}>
          {label}
          {required ? <Text style={{ color: color.danger.fg }}> *</Text> : null}
        </Text>
        {help ? <FieldHelp {...help} /> : null}
      </View>

      {control}

      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <Text style={text.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * A read-only value styled like a field, for the HR-maintained things an
 * employee can see but not change (designation, joining date, PAN on file).
 *
 * It looks visibly different from an editable box on purpose: a grey box that
 * takes a tap and does nothing is worse than one that never invited the tap.
 */
export function ReadOnlyField({ label, value, help, style }) {
  return (
    <Field label={label} help={help} style={style}>
      <ReadOnlyValue value={value} />
    </Field>
  );
}

function ReadOnlyValue({ value }) {
  return (
    <View
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: space[3],
        backgroundColor: color.surfaceSubtle,
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: 12,
      }}
    >
      <Text style={[text.body, { color: color.textSecondary }]}>
        {/* "Not set" and "Couldn't load" are DIFFERENT (CLAUDE.md §7) — the
            caller passes the right one. "Not set" on a read that failed is how
            somebody ends up filling in a field that already had a value. */}
        {value === null || value === undefined || value === '' ? 'N/A' : value}
      </Text>
    </View>
  );
}

/**
 * The form's own grid. Four or more fields means GRIDDED, not a tall column
 * the person has to scroll (CLAUDE.md §3).
 *
 * Two columns for short fields (date, time, amount, toggle); `wide` on a Field
 * for the long ones (a person picker, a reason box). `max-w-md`-style cramping
 * is a bug, not a style — salary adjustments, leave payouts, exits, document
 * requests and attendance corrections were all fixed this way on the web.
 */
export function FormGrid({ children, style }) {
  return (
    <View
      style={[{
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: space[3],
        rowGap: space[4],
      }, style]}
    >
      {children}
    </View>
  );
}

export default Field;
