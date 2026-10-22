// ─────────────────────────────────────────────────────────────────────────────
// ui/Select.jsx — a choice from a list, and the toggle.
//
// A BOTTOM-SHEET PICKER, NOT A NATIVE DROPDOWN. The web app rejected a styled
// native <select> because it ignored the corner radius and the font; the native
// equivalents are worse — the iOS wheel is a modal of its own with a different
// visual language, and Android's dialog ignores every token we have.
//
// So: a PickerBox that looks exactly like a TextField, opening a sheet of rows.
// The same control, whatever is being chosen.
//
// NEVER A PLAIN LIST OF PEOPLE HERE (CLAUDE.md §4). People are chosen with
// PersonSelect, which shows a face, a name and an employee code. A select of
// names loses the only thing that distinguishes two colleagues called Priya.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { FlatList, Modal, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { icons } from '../theme/icons';
import {
  color, elevate, gutter, iconSize, radius, space, text,
} from '../theme/tokens';
import { PickerBox } from './TextField';
import { EmptyState } from './EmptyState';

/**
 * @param {object} props
 * @param {Array<{value: any, label: string, caption?: string, disabled?: boolean}>} props.options
 * @param {any} props.value
 * @param {Function} props.onChange
 * @param {string} [props.title]  the sheet's heading — "Choose a reason"
 */
export function Select({
  options = [],
  value,
  onChange,
  placeholder = 'Choose…',
  title = 'Choose',
  invalid = false,
  disabled = false,
  registerFocus,
  emptyMessage = 'Nothing to choose from.',
  style,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || null;
  const Check = icons.check;

  return (
    <>
      <PickerBox
        value={selected?.label}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        invalid={invalid}
        disabled={disabled}
        registerFocus={registerFocus}
        accessibilityLabel={selected ? `${title}: ${selected.label}` : placeholder}
        icon={icons.chevronDown}
        style={style}
      />

      <OptionSheet
        visible={open}
        title={title}
        onClose={() => setOpen(false)}
        emptyMessage={emptyMessage}
        data={options}
        renderRow={(opt) => {
          const isSelected = opt.value === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: !!opt.disabled }}
              disabled={opt.disabled}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingHorizontal: gutter,
                paddingVertical: space[3],
                minHeight: 52,
                opacity: opt.disabled ? 0.45 : 1,
                backgroundColor: pressed ? color.pressTint : 'transparent',
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={text.body}>{opt.label}</Text>
                {/* A disabled option says WHY in its caption. An option that
                    is simply greyed out invites a second and third tap. */}
                {opt.caption ? <Text style={text.caption}>{opt.caption}</Text> : null}
              </View>
              {isSelected && Check ? <Check size={iconSize.md} color={color.brand} /> : null}
            </Pressable>
          );
        }}
      />
    </>
  );
}

/**
 * The sheet the pickers share. Exported because PersonSelect and the work-mode
 * picker use the same frame — one sheet shape for every choice in the app.
 */
export function OptionSheet({
  visible,
  title,
  onClose,
  data = [],
  renderRow,
  header,
  emptyMessage = 'Nothing to choose from.',
  keyOf = (item, i) => String(item?.value ?? item?.id ?? i),
}) {
  const insets = useSafeAreaInsets();
  const Close = icons.close;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: color.backdrop }} />
        <View
          style={[{
            maxHeight: '75%',
            backgroundColor: color.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            overflow: 'hidden',
          }, elevate('lg')]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: gutter,
              paddingVertical: space[3],
              borderBottomWidth: 1,
              borderBottomColor: color.borderSubtle,
            }}
          >
            <Text accessibilityRole="header" style={[text.h3, { flex: 1 }]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              {Close ? <Close size={iconSize.md} color={color.textSecondary} /> : null}
            </Pressable>
          </View>

          {header}

          <FlatList
            data={data}
            keyExtractor={keyOf}
            renderItem={({ item }) => renderRow(item)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState title="Nothing here" message={emptyMessage} />}
            contentContainerStyle={{ paddingBottom: insets.bottom + space[4] }}
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * A switch with its label, for a boolean.
 *
 * The LABEL IS TAPPABLE as well as the switch. A 51×31 switch is a small
 * target next to a full-width row of text, and people aim at the words.
 */
export function Toggle({ label, caption, value, onValueChange, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 48,
        paddingVertical: space[2],
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? color.pressTint : 'transparent',
      }, style]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={text.body}>{label}</Text>
        {caption ? <Text style={text.caption}>{caption}</Text> : null}
      </View>
      <Switch
        value={!!value}
        onValueChange={onValueChange}
        disabled={disabled}
        // Android needs both; iOS uses trackColor.true only when on.
        trackColor={{ false: color.border, true: color.brandSoftBorder }}
        thumbColor={value ? color.brand : color.surface}
        ios_backgroundColor={color.border}
        // The row already announces itself as the switch — this would make
        // TalkBack read the label twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export default Select;
