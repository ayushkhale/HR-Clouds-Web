// ─────────────────────────────────────────────────────────────────────────────
// ui/TextField.jsx — the text box, and the two pickers built on the same frame.
//
// `invalid` reddens the BORDER, not just a message underneath (CLAUDE.md
// §11.4). `registerFocus` hands focus() to the form guard so a press on an
// unfinished form can travel here. Both arrive automatically from <Field>.
//
// ── KEYBOARD CHOICES THAT MATTER ─────────────────────────────────────────────
//
// `kind` picks the keyboard, the autocomplete and the capitalisation together,
// because getting one right and the others wrong is worse than leaving all
// three alone. The named kinds are the ones this app actually asks for.
//
//   • AMOUNT uses `decimal-pad`, NOT `numeric`: on iOS `numeric` shows a
//     keyboard with no decimal point, so ₹1,234.50 cannot be typed at all.
//   • PAN / IFSC are `characters` + no autocorrect. Autocorrect on an IFSC
//     turns SBIN0001234 into something else entirely and the person cannot see
//     why it was rejected.
//   • EMAIL is `autoComplete="email"` + `autoCapitalize="none"`. A capitalised
//     first letter is the single commonest login failure on a phone.
//
// ── MULTILINE ────────────────────────────────────────────────────────────────
//
// A reason box is `multiline` with a real `maxLength` matching the API's, and
// it shows a counter only in the last 10% — a counter from character one reads
// as a limit you are about to hit.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { color, iconSize, radius, space, text } from '../theme/tokens';

const KINDS = {
  text: { autoCapitalize: 'sentences' },
  name: { autoCapitalize: 'words', autoComplete: 'name' },
  email: { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false, autoComplete: 'email' },
  password: { secureTextEntry: true, autoCapitalize: 'none', autoCorrect: false, autoComplete: 'password' },
  phone: { keyboardType: 'phone-pad', autoComplete: 'tel' },
  // decimal-pad, not numeric — see the header.
  amount: { keyboardType: 'decimal-pad', autoCorrect: false },
  integer: { keyboardType: 'number-pad', autoCorrect: false },
  code: { autoCapitalize: 'characters', autoCorrect: false, spellCheck: false },
  search: { autoCapitalize: 'none', autoCorrect: false, returnKeyType: 'search', clearButtonMode: 'while-editing' },
};

export function TextField({
  value,
  onChangeText,
  kind = 'text',
  placeholder,
  invalid = false,
  multiline = false,
  maxLength,
  registerFocus,
  editable = true,
  style,
  inputStyle,
  left,
  right,
  ...rest
}) {
  const ref = useRef(null);

  // Hand focus() to the form guard. The guard holds the function, not the ref,
  // so it never reaches into a component's internals.
  useEffect(() => {
    registerFocus?.(() => ref.current?.focus());
  }, [registerFocus]);

  const kindProps = KINDS[kind] || KINDS.text;
  const nearLimit = maxLength && typeof value === 'string' && value.length > maxLength * 0.9;

  return (
    <View style={{ gap: 4 }}>
      <View
        style={[{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: space[2],
          minHeight: multiline ? 96 : 44,
          paddingHorizontal: space[3],
          paddingVertical: multiline ? space[3] : 0,
          backgroundColor: editable ? color.surface : color.surfaceSubtle,
          borderWidth: 1,
          // The red border. Not a red sentence under a box that looks fine.
          borderColor: invalid ? color.danger.dot : color.border,
          borderRadius: radius.md,
        }, style]}
      >
        {left}
        <TextInput
          ref={ref}
          value={value == null ? '' : String(value)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.textMuted}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          // iOS puts multiline text in the vertical middle by default, which
          // looks like a rendering fault in a 96pt box.
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityState={{ disabled: !editable }}
          style={[
            text.body,
            { flex: 1, paddingVertical: multiline ? 0 : 10, minHeight: multiline ? 72 : undefined },
            inputStyle,
          ]}
          {...kindProps}
          {...rest}
        />
        {right}
      </View>

      {/* Only near the limit. A counter from character one reads as a warning. */}
      {nearLimit ? (
        <Text style={[text.caption, { alignSelf: 'flex-end' }]}>
          {value.length} / {maxLength}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The frame every PICKER shares — Select, TimeField, DateField, PersonSelect.
 * It looks exactly like a TextField so a form reads as one thing, but it is a
 * button: it opens something rather than taking a caret.
 */
export function PickerBox({
  value,
  placeholder = 'Choose…',
  onPress,
  invalid = false,
  icon: Icon,
  disabled = false,
  registerFocus,
  accessibilityLabel,
  style,
}) {
  useEffect(() => {
    // A picker can't take a caret, so "focus" is "open it". That is what the
    // form guard wants anyway: travel here and show the person the choice.
    registerFocus?.(() => { if (!disabled) onPress?.(); });
  }, [registerFocus, onPress, disabled]);

  const empty = value === null || value === undefined || value === '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: 44,
        paddingHorizontal: space[3],
        backgroundColor: disabled ? color.surfaceSubtle : pressed ? color.brandSoftBg : color.surface,
        borderWidth: 1,
        borderColor: invalid ? color.danger.dot : color.border,
        borderRadius: radius.md,
      }, style]}
    >
      {Icon ? <Icon size={iconSize.sm} color={color.textSecondary} /> : null}
      <Text
        numberOfLines={1}
        style={[text.body, { flex: 1, color: empty ? color.textMuted : color.textBody }]}
      >
        {empty ? placeholder : value}
      </Text>
    </Pressable>
  );
}

export default TextField;
