// ─────────────────────────────────────────────────────────────────────────────
// ui/ReasonPrompt.jsx — a confirm that collects one reason.
//
// Web ancestor: ReasonDialog. The cases: cancelling a leave request,
// withdrawing a correction, cancelling a claim — anything where the API wants
// a `reason` and the person is about to undo something.
//
// ── IT IS NOT A FORM AND NOT A RECORD SHEET ──────────────────────────────────
//
// One field. It stays NARROW on purpose (CLAUDE.md §3: "single-field confirms,
// reason prompts and person pickers stay narrow"). The four-or-more-fields
// gridding rule does not apply to it, and widening it to match the forms around
// it was explicitly rejected on the web.
//
// ── IT SITS ABOVE A RECORD SHEET ─────────────────────────────────────────────
//
//   RecordSheet 140 < AttachmentViewer 165 < ReasonPrompt 170 < Toast 200
//
// RENDER IT AS A SIBLING of the RecordSheet, never as a child:
//
//   {selected && <RecordSheet … />}
//   {asking && <ReasonPrompt … />}      ← sibling
//
// A child inherits the sheet's clipping and its backdrop and ends up trapped
// behind it. Both own their own Modal, which is also what makes Android back
// close the topmost one first.
//
// ── THE REASON IS USUALLY REQUIRED, AND THE BUTTON STILL STAYS LIVE ─────────
//
// §11 applies here as much as anywhere: an empty required reason is a plain
// hint until the first press and an error after it. The Confirm button does not
// go grey — pressing it is what tells the person what is missing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, Text, View,
} from 'react-native';
import { color, elevate, gutter, layer, radius, space, text } from '../theme/tokens';
import { Button } from './Button';
import { TextField } from './TextField';
import { FieldError } from './InlineAlert';

/**
 * @param {object} props
 * @param {string} props.title        "Cancel this leave request?"
 * @param {string} [props.message]    the CONSEQUENCE, in plain words
 * @param {string} [props.label]      the field's label
 * @param {boolean} [props.required]  default true
 * @param {string} [props.confirmText] what will happen — not "OK"
 * @param {boolean} [props.destructive]
 * @param {Function} props.onConfirm  (reason: string) => Promise|void
 * @param {Function} props.onCancel
 * @param {boolean} [props.busy]      keeps the button live-looking but blocked
 */
export function ReasonPrompt({
  title,
  message,
  label = 'Reason',
  placeholder = 'Say briefly why',
  required = true,
  confirmText = 'Confirm',
  destructive = false,
  maxLength = 500,
  onConfirm,
  onCancel,
  busy = false,
}) {
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);

  const problem = required && !reason.trim() ? 'Please say why — your manager sees this.' : null;
  const error = attempted ? problem : null;

  const submit = () => {
    if (busy) return;
    // The press does the checking. Nothing goes out from an unfinished form.
    if (problem) {
      setAttempted(true);
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView
        style={{ flex: 1, zIndex: layer.reasonPrompt }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={onCancel}
          style={{
            flex: 1,
            backgroundColor: color.backdrop,
            justifyContent: 'center',
            paddingHorizontal: gutter,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={[{
              // Narrow, on purpose. See the header.
              width: '100%',
              maxWidth: 400,
              alignSelf: 'center',
              backgroundColor: color.surface,
              borderRadius: radius.lg,
              padding: space[4],
              gap: space[3],
            }, elevate('lg')]}
          >
            <Text accessibilityRole="header" style={text.h2}>{title}</Text>
            {message ? <Text style={text.small}>{message}</Text> : null}

            <View style={{ gap: 6 }}>
              <Text style={text.label}>
                {label}
                {required ? <Text style={{ color: color.danger.fg }}> *</Text> : null}
              </Text>
              <TextField
                value={reason}
                onChangeText={setReason}
                placeholder={placeholder}
                multiline
                maxLength={maxLength}
                invalid={!!error}
                autoFocus
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </View>

            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button title="Go back" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
              <Button
                title={confirmText}
                variant={destructive ? 'danger' : 'primary'}
                loading={busy}
                onPress={submit}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default ReasonPrompt;
