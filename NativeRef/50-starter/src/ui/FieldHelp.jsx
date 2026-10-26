// ─────────────────────────────────────────────────────────────────────────────
// ui/FieldHelp.jsx — the ⓘ.
//
// Ships with every new screen (CLAUDE.md §10) — not as a follow-up somebody
// has to ask for. Full rules: 30-domain/08-field-help.md.
//
//     <FieldHelp surface="payroll.bank_details" field="ifsc_code" />
//
// ── THE MOST IMPORTANT BEHAVIOUR: IT RENDERS NOTHING WHEN THERE IS NO ENTRY ──
//
// No entry for this surface, this field, or THIS WORKSPACE → `null`. Not a
// greyed icon, not an empty 14pt box. That is precisely what makes it safe to
// wire into a shared component by data key: the config decides where help
// appears, and a component used by three workspaces can carry an ⓘ that only
// one of them sees.
//
// It also means a missing hint costs nothing and shifts nothing, which is why
// `help` props can be passed liberally through SheetGrid, SheetStats and Field.
//
// ── IT IS A TOGGLETIP, NOT A TOOLTIP ────────────────────────────────────────
//
// There is no hover on a phone, so this opens on press and stays open until
// dismissed. It CONTAINS A BUTTON (Ask Maya), which is the other reason it
// can't be a tooltip: you have to be able to reach inside it.
//
// ── PLACEMENT RULES IT CANNOT ENFORCE FOR YOU ───────────────────────────────
//
//   • BESIDE a form label, in a `flex-direction: row` with it — never INSIDE
//     the label. Inside, it becomes part of the input's accessible name and
//     the field announces itself as "Reason What is a reason?".
//   • NEVER inside another interactive element: not in a tab, not in a row
//     that opens a sheet, not on a fold toggle. One tap would fire both.
//   • On a HEADER, never in a cell. Once per concept per screen. At most four
//     per screen state. Not where the screen already explains itself.
//   • NEVER on everyday data people read daily — dashboard counts, attendance
//     status/hours columns, live attendance, routine queue statuses. They were
//     removed as annoying (user decision, 2026-10-01).
//
// ── NO LAYOUT SHIFT ─────────────────────────────────────────────────────────
//
// `overlay` draws the icon in existing padding with zero layout width, for a
// label that would otherwise wrap. Measure at 390 and at the smallest device
// you support before shipping either mode.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { getFieldHelp } from '../fieldHelp/fieldHelpMeta';
import { useAuth } from '../state/AuthContext';
import { icons } from '../theme/icons';
import {
  HIT_SLOP, color, elevate, gutter, iconSize, layer, radius, space, text,
} from '../theme/tokens';
import { Button } from './Button';

/**
 * @param {object} props
 * @param {string} props.surface  e.g. "attendance.regularization" — names the
 *   DOMAIN, never the role
 * @param {string} props.field    the API payload/response KEY, never the label
 * @param {'default'|'onDark'} [props.tone]  `onDark` on the purple hero
 * @param {boolean} [props.overlay] zero-width — draws in existing padding
 * @param {Function} [props.onAskMaya] receives the static question string
 */
export function FieldHelp({ surface, field, tone = 'default', overlay = false, onAskMaya, style }) {
  const { workspace } = useAuth();
  const [open, setOpen] = useState(false);

  // The whole gate, in one line. `workspace` comes from the session, so an
  // entry written for `manager` never appears here even if the component is
  // shared (CLAUDE.md §2).
  const help = getFieldHelp(surface, field, workspace);
  if (!help) return null;

  const Info = icons.info;
  const fg = tone === 'onDark' ? color.heroBadgeIcon : color.textMuted;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        // The field's own label is NOT repeated here: it is already read out
        // by the control this sits beside, and repeating it makes the label
        // announce twice.
        accessibilityLabel="Help"
        accessibilityHint="Explains this field"
        accessibilityState={{ expanded: open }}
        hitSlop={HIT_SLOP}
        onPress={() => setOpen(true)}
        style={[
          overlay
            // Zero layout width: it draws into the padding beside the label
            // instead of pushing the label along and wrapping it.
            ? { width: 0, height: 0, alignItems: 'flex-start', justifyContent: 'center' }
            : { paddingHorizontal: 2 },
          style,
        ]}
      >
        <View style={overlay ? { position: 'absolute', left: 2, top: -7 } : null}>
          {Info ? <Info size={iconSize.info} color={fg} /> : null}
        </View>
      </Pressable>

      <HelpPopover
        visible={open}
        onClose={() => setOpen(false)}
        hint={help.hint}
        question={help.question}
        onAskMaya={onAskMaya}
      />
    </>
  );
}

/**
 * The popover.
 *
 * A Modal rather than an absolutely positioned view, for one specific reason:
 * an ⓘ inside a RecordSheet would otherwise be CLIPPED by the sheet's bounds
 * (`overflow: hidden` plus the sheet's own container). The web version portals
 * out of the dialog for exactly the same reason. A Modal is the native portal.
 *
 * Centred rather than anchored to the icon. Anchoring on a 390pt screen means
 * a popover that falls off one edge or covers the field it explains; the web
 * app's anchored popover needed four fallback positions and still clipped
 * inside a dialog.
 */
function HelpPopover({ visible, onClose, hint, question, onAskMaya }) {
  const Maya = icons.maya;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's back button closes the ⓘ, not the sheet behind it. That
      // ordering matters: the topmost thing closes first, one press at a time.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close help"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: color.backdrop,
          justifyContent: 'center',
          paddingHorizontal: gutter,
          zIndex: layer.fieldHelp,
        }}
      >
        {/* Stops a tap inside the card from closing it. */}
        <Pressable
          onPress={() => {}}
          style={[{
            backgroundColor: color.surface,
            borderRadius: radius.lg,
            padding: space[4],
            gap: space[3],
            maxWidth: 420,
            alignSelf: 'center',
            width: '100%',
          }, elevate('lg')]}
        >
          <Text accessibilityRole="header" style={text.label}>What this means</Text>
          <Text style={[text.body, { color: color.textBody }]}>{hint}</Text>

          {question ? (
            <View style={{ gap: space[2], borderTopWidth: 1, borderTopColor: color.borderSubtle, paddingTop: space[3] }}>
              {/* The question is STATIC and conceptual — never a name, an
                  amount or an id (CLAUDE.md §10). It is shown before it is
                  sent, because MAYA NEVER AUTO-SENDS: the person sees what
                  will be asked and chooses to ask it. */}
              <Text style={text.small}>{question}</Text>
              <Button
                title="Ask Maya"
                variant="soft"
                size="sm"
                icon={Maya}
                onPress={() => {
                  onClose();
                  onAskMaya?.(question);
                }}
              />
            </View>
          ) : null}

          <Button title="Got it" variant="ghost" size="sm" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * A label with its ⓘ attached, grouped so the icon can NEVER wrap onto its own
 * line and make the host a row taller. Use this on a `th`-equivalent, a tile
 * caption or a section heading.
 *
 * It renders the plain text when there is no entry — which is what makes it
 * safe to use on every column header in a shared table.
 */
export function HelpLabel({ text: label, surface, field, style: labelStyle, tone, numberOfLines = 1 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Text
        numberOfLines={numberOfLines}
        style={[text.label, tone === 'onDark' && { color: color.heroSubtitle }, labelStyle]}
      >
        {label}
      </Text>
      <FieldHelp surface={surface} field={field} tone={tone} />
    </View>
  );
}

export default FieldHelp;
