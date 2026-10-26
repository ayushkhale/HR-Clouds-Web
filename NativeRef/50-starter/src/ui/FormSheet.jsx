// ─────────────────────────────────────────────────────────────────────────────
// ui/FormSheet.jsx — a form is a FULL-SCREEN MODAL, not a half-sheet.
//
// Web ancestor: the Create Attendance Policy dialog — `max-w-5xl`,
// `max-h-[92vh]`, uppercase 11px labels, pinned footer. That shape is the house
// standard for a big form, and this is its native translation.
//
// ── WHY FULL SCREEN AND NOT A BOTTOM SHEET ───────────────────────────────────
//
// A keyboard plus a draggable container is a fight. The sheet wants to be
// dragged, the keyboard wants to push it up, and the drag gesture competes with
// a scrolling body — so a half-sheet form ends up dismissing itself while
// somebody is typing in it. A full-screen modal has none of that.
//
// This is also why a RecordSheet is NOT a FormSheet: the web app's §3 lists
// forms, confirms, reason prompts and pickers as explicitly EXCLUDED from the
// record-inspector pattern. A form is not a record inspector.
//
// ── THE FOOTER IS PINNED, ALWAYS VISIBLE ─────────────────────────────────────
//
//   A FORM MUST NOT MAKE THE USER SCROLL TO FIND THE SUBMIT BUTTON.
//
// The body scrolls under the footer. On the web this was fixed on salary
// adjustments, leave payouts, exits, document requests and attendance
// corrections, all the same way.
//
// ── AND FOUR OR MORE FIELDS MEANS GRIDDED ────────────────────────────────────
//
// Use <FormGrid> (ui/Field.jsx) and let the short fields pair up two across;
// long ones (a reason box, a person picker) take `wide`. A tall single column
// of twelve boxes is the thing `max-w-md` was on the web — a bug, not a style.
//
// ── IT PASSES ITS SCROLLER TO THE FORM GUARD ─────────────────────────────────
//
// `children` is called with the scroll ref, so §11's "travel to the first
// problem" works without the screen plumbing a ref through:
//
//   <FormSheet …>
//     {(scrollRef) => {
//       const focus = useFormFocus(scrollRef);   // in the screen, not here
//       …
//     }}
//   </FormSheet>
//
// In practice the screen usually owns the ref and passes `scrollRef` in — both
// are supported, and `scrollRef` wins when given.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { icons } from '../theme/icons';
import { color, gutter, space, text } from '../theme/tokens';
import { IconButton } from './Button';

/**
 * @param {object} props
 * @param {boolean} [props.visible]
 * @param {string} props.title    the same words as the button that opened it
 * @param {string} [props.subtitle] what this form is for, in one line
 * @param {React.ReactNode} props.footer  pinned. Cancel left, the action right
 * @param {Function} props.onClose
 * @param {object} [props.scrollRef]  the screen's own ref, for the form guard
 */
export function FormSheet({
  visible = true,
  title,
  subtitle,
  footer,
  onClose,
  scrollRef,
  children,
}) {
  const insets = useSafeAreaInsets();
  const ownRef = useRef(null);
  const ref = scrollRef || ownRef;
  const Close = icons.close;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // A form is presented as a page, not as something floating over the
      // screen — and `pageSheet` on iOS gives the native swipe-to-dismiss that
      // people expect from a modal page.
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: color.bg }}
        // iOS needs the padding; Android's windowSoftInputMode="adjustResize"
        // in AndroidManifest already handles it, and doing both double-shifts
        // the footer off the top of the keyboard.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[2],
            paddingHorizontal: gutter,
            paddingTop: Platform.OS === 'ios' ? space[3] : insets.top + space[3],
            paddingBottom: space[3],
            backgroundColor: color.surface,
            borderBottomWidth: 1,
            borderBottomColor: color.borderSubtle,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={text.h2}>{title}</Text>
            {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
          </View>
          <IconButton icon={Close} accessibilityLabel="Close without saving" onPress={onClose} />
        </View>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <ScrollView
          ref={ref}
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingTop: space[4],
            paddingBottom: space[6],
            gap: space[4],
          }}
          keyboardShouldPersistTaps="handled"
          // Dismissing the keyboard on a drag is what people expect, and it is
          // what lets them see the pinned footer while scrolling.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {typeof children === 'function' ? children(ref) : children}
        </ScrollView>

        {/* ── Footer: PINNED. Never scrolled away from. ─────────────────── */}
        {footer ? (
          <View
            style={{
              flexDirection: 'row',
              gap: space[2],
              paddingHorizontal: gutter,
              paddingTop: space[3],
              paddingBottom: space[3] + insets.bottom,
              backgroundColor: color.surface,
              borderTopWidth: 1,
              borderTopColor: color.borderSubtle,
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * A step/section inside a long form. Same look as SheetSection but it does NOT
 * fold by default — a folded form hides the box that is stopping the submit,
 * which is the exact problem §11's "travel to the first problem" exists for.
 *
 * Fold a form section only when it is genuinely optional, and then never the
 * one holding a required field.
 */
export function FormSection({ title, caption, children, style }) {
  return (
    <View style={[{ gap: space[3] }, style]}>
      <View style={{ gap: 2 }}>
        <Text style={text.h3}>{title}</Text>
        {caption ? <Text style={text.small}>{caption}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default FormSheet;
