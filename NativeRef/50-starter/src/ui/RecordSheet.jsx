// ─────────────────────────────────────────────────────────────────────────────
// ui/RecordSheet.jsx — THE HOUSE STANDARD FOR EVERY POPUP THAT SHOWS DATA.
//
// Web ancestor: shared/components/DetailDialog.jsx, the record inspector. The
// rule is unchanged and it is absolute (CLAUDE.md §3):
//
//   NEVER HAND-ROLL A MODAL FOR DATA. Compose from this and the parts in
//   SheetParts.jsx. Every role, every module, every popup showing a record.
//
// The pattern it completes is list → row → record inspector:
//   1. the LIST is scannable rows — who, when, how much, what state
//   2. the ROW opens this (ui/Row.jsx). No View button, ever
//   3. THIS holds everything else
//
// ── WHAT GOES WHERE ──────────────────────────────────────────────────────────
//
//   eyebrow   10px uppercase purple, above the title — which kind of record
//   icon      in a purple-50 rounded square
//   title     through displayValue() — "N/A", never a dash
//   subtitle  the one-line summary (a date, an amount, a period)
//   badge     a StatusBadge, top right
//   children  SheetStats · SheetSection · SheetGrid · SheetTable · SheetText
//   footer    ACTIONS LIVE HERE, NOT ON THE ROW. Pinned above the safe area
//
// And when there are no actions, say WHY with a SheetFooterNote rather than
// leaving an empty footer: "Approved leave can't be changed. Ask your manager
// to cancel it for you."
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
//
// Forms, confirms, reason prompts and pickers are NOT record inspectors and do
// not use this. A form is a FormSheet; a confirm is useConfirm(); a reason is
// ReasonPrompt. The web app states this exclusion explicitly and it matters:
// the moment a form grows out of a record sheet it inherits snap points and a
// drag gesture, and a keyboard plus a draggable container is a fight.
//
// ── STACKING ─────────────────────────────────────────────────────────────────
//
//   RecordSheet 140 < AttachmentViewer 165 < ReasonPrompt 170 < Toast 200
//
// Render those as SIBLINGS of this, never as children — a child inherits this
// sheet's clipping and its backdrop, and ends up trapped behind it. The ⓘ and
// Maya portal out through a Modal for the same reason (ui/FieldHelp.jsx).
//
// Android back closes the TOPMOST sheet only, one press at a time. That falls
// out of each sheet owning its own Modal, so don't collapse them into one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayValue } from '../lib/format';
import {
  color, elevate, gutter, iconSize, radius, space, text,
} from '../theme/tokens';
import { icons } from '../theme/icons';
import { IconButton } from './Button';
import { Skeleton } from './Skeleton';

/**
 * @param {object} props
 * @param {boolean} [props.visible]   defaults to true — mount it conditionally
 *   (`{selected && <RecordSheet …/>}`), which is also what resets its scroll
 * @param {Function} props.onClose
 * @param {string} [props.eyebrow]
 * @param {Function} [props.icon]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.badge]
 * @param {boolean} [props.loading]   keeps the header, skeletons the body
 * @param {React.ReactNode} [props.footer]
 * @param {'tall'|'short'} [props.height]
 */
export function RecordSheet({
  visible = true,
  onClose,
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  badge,
  loading = false,
  footer,
  height = 'tall',
  children,
}) {
  const insets = useSafeAreaInsets();
  const Close = icons.close;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // The sheet keeps its slide even under reduce-motion (theme/motion.js):
      // appearing instantly reads as a glitch, and the slide is what says
      // where it came from.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* The backdrop. A press closes — the standard gesture, and the list
            stays visible behind it on purpose: 92% max height, never full
            screen, so you can see what you came from. */}
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: color.backdrop }}
        />

        <View
          style={[{
            maxHeight: height === 'tall' ? '92%' : '62%',
            backgroundColor: color.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            overflow: 'hidden',
          }, elevate('lg')]}
        >
          {/* The grab handle. Decorative: the backdrop and the close button are
              the real affordances, and announcing a handle helps nobody. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ alignItems: 'center', paddingTop: space[2] }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.border }} />
          </View>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space[3],
              paddingHorizontal: gutter,
              paddingTop: space[3],
              paddingBottom: space[3],
              borderBottomWidth: 1,
              borderBottomColor: color.borderSubtle,
              backgroundColor: color.surface,
            }}
          >
            {Icon ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: color.brandSoftBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={iconSize.md} color={color.brand} />
              </View>
            ) : null}

            <View style={{ flex: 1, gap: 2 }}>
              {eyebrow ? (
                <Text style={[text.badge, { color: color.brand, letterSpacing: 0.6, textTransform: 'uppercase' }]}>
                  {eyebrow}
                </Text>
              ) : null}
              <Text accessibilityRole="header" style={text.h2}>{displayValue(title)}</Text>
              {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
            </View>

            <View style={{ alignItems: 'flex-end', gap: space[2] }}>
              <IconButton icon={Close} accessibilityLabel="Close" onPress={onClose} />
              {badge}
            </View>
          </View>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          {loading ? (
            <Skeleton type="sheet" />
          ) : (
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: gutter,
                paddingTop: space[4],
                paddingBottom: space[6],
                gap: space[4],
              }}
              // A sheet's own scroll must not bounce on Android, where the glow
              // against the sheet's rounded top looks like a clipping bug.
              overScrollMode="never"
            >
              {children}
            </ScrollView>
          )}

          {/* ── Footer: ACTIONS, or the note saying why there are none ───── */}
          {footer ? (
            <View
              style={{
                paddingHorizontal: gutter,
                paddingTop: space[3],
                paddingBottom: space[3] + insets.bottom,
                borderTopWidth: 1,
                borderTopColor: color.borderSubtle,
                backgroundColor: color.surface,
                flexDirection: 'row',
                gap: space[2],
              }}
            >
              {footer}
            </View>
          ) : (
            <View style={{ height: insets.bottom }} />
          )}
        </View>
      </View>
    </Modal>
  );
}

export * from './SheetParts';
export default RecordSheet;
