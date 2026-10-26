// ─────────────────────────────────────────────────────────────────────────────
// ui/TimeField.jsx — a wall-clock time. And DateField, which is its twin.
//
// ── TWO ABSOLUTE RULES, BOTH FROM THE WEB APP'S SCARS ───────────────────────
//
// 1. NEVER A FREE-TEXT TIME BOX. The web rule is literally "never
//    `<input type="time">`", and a plain TextField is worse: people type
//    "9", "9.30", "9:30 am", "0930", "21:30" and every one of them has to be
//    parsed, half of them ambiguously. This opens the platform picker.
//
// 2. IT IS A WALL CLOCK, NEVER AN INSTANT. The value in and out is the string
//    `"HH:mm"` in 24-hour form, and it is NEVER timezone-converted. A shift
//    starts at 09:30 — that is a SCHEDULE, not a moment in time, and running
//    it through a Date in the device's zone is how an employee in a different
//    zone sees their own shift start an hour early.
//
//    The Date object below exists only to feed the picker, and only its
//    getHours()/getMinutes() are read back out. It never leaves this file.
//
// DateField emits `"YYYY-MM-DD"` via toLocalYMD() — NEVER `toISOString()`,
// which converts to UTC and so sends yesterday's date for anyone west of
// Greenwich after 00:00 local. That is a 400 on the endpoints that demand a
// strict date, and silently the wrong day on the ones that don't
// (10-api/05-contract-traps.md).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, View } from 'react-native';
import { fmtClockTime, parseYMDLocal, toLocalYMD, fmtDate } from '../lib/dates';
import { icons } from '../theme/icons';
import { color, elevate, gutter, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { PickerBox } from './TextField';

/** "HH:mm" → a throwaway Date for the picker. Today's date, their clock time. */
function dateFromHHMM(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  const d = new Date();
  d.setSeconds(0, 0);
  if (m) {
    d.setHours(Math.min(23, Number(m[1])), Math.min(59, Number(m[2])));
  } else {
    d.setHours(9, 0);
  }
  return d;
}

const hhmmFromDate = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * @param {object} props
 * @param {string} props.value  "HH:mm", 24-hour
 * @param {Function} props.onChange  receives "HH:mm"
 */
export function TimeField({
  value,
  onChange,
  placeholder = 'Choose a time',
  invalid = false,
  disabled = false,
  registerFocus,
  minuteInterval = 5,
  style,
}) {
  const [open, setOpen] = useState(false);

  const handle = (event, picked) => {
    // Android fires one event and dismisses itself; iOS fires continuously on
    // the spinner and needs to be closed by us.
    if (Platform.OS === 'android') setOpen(false);
    if (event?.type === 'dismissed' || !picked) return;
    onChange(hhmmFromDate(picked));
  };

  return (
    <>
      <PickerBox
        // Displayed in the house 12-hour format ("9:30 AM") because that is how
        // the web app shows a time; the VALUE stays 24-hour "HH:mm".
        value={value ? fmtClockTime(value, '') : ''}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        invalid={invalid}
        disabled={disabled}
        registerFocus={registerFocus}
        icon={icons.clock}
        accessibilityLabel={value ? `Time: ${fmtClockTime(value, '')}` : placeholder}
        style={style}
      />
      <PickerHost open={open} onClose={() => setOpen(false)}>
        <DateTimePicker
          value={dateFromHHMM(value)}
          mode="time"
          // `spinner` on iOS inside our own sheet; `clock` is Android's own
          // dialog, which it presents itself.
          display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
          minuteInterval={minuteInterval}
          // 24-hour follows the device setting on Android and the locale on
          // iOS. The VALUE is 24-hour either way — only the dial changes.
          onChange={handle}
        />
      </PickerHost>
    </>
  );
}

/**
 * Where the platform picker is drawn.
 *
 * ANDROID presents its own dialog, so the component is simply rendered and
 * Android does the rest. iOS renders INLINE — a bare <DateTimePicker> would
 * appear in the middle of the form, pushing fields apart, with no way to
 * dismiss it. So on iOS it gets a small sheet with a Done button.
 *
 * This asymmetry is the whole reason this wrapper exists. Don't "unify" it.
 */
function PickerHost({ open, onClose, children }) {
  if (!open) return null;
  if (Platform.OS !== 'ios') return children;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: color.backdrop }} />
        <View
          style={[{
            backgroundColor: color.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: gutter,
            paddingTop: space[2],
            paddingBottom: space[4],
          }, elevate('lg')]}
        >
          {children}
          <Button title="Done" variant="primary" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

/**
 * @param {object} props
 * @param {string} props.value  "YYYY-MM-DD"
 * @param {Function} props.onChange  receives "YYYY-MM-DD"
 * @param {string} [props.max]  "YYYY-MM-DD" — e.g. todayYMD() for a past-only date
 * @param {string} [props.min]
 */
export function DateField({
  value,
  onChange,
  placeholder = 'Choose a date',
  invalid = false,
  disabled = false,
  registerFocus,
  min,
  max,
  style,
}) {
  const [open, setOpen] = useState(false);

  const handle = (event, picked) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event?.type === 'dismissed' || !picked) return;
    // toLocalYMD, never toISOString. See the file header.
    onChange(toLocalYMD(picked));
  };

  return (
    <>
      <PickerBox
        value={value ? fmtDate(value, '') : ''}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        invalid={invalid}
        disabled={disabled}
        registerFocus={registerFocus}
        icon={icons.calendar}
        accessibilityLabel={value ? `Date: ${fmtDate(value, '')}` : placeholder}
        style={style}
      />
      <PickerHost open={open} onClose={() => setOpen(false)}>
        <DateTimePicker
          // parseYMDLocal, not `new Date(ymd)` — the latter parses as UTC
          // midnight and opens the picker on the previous day west of UTC.
          value={value ? parseYMDLocal(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          minimumDate={min ? parseYMDLocal(min) : undefined}
          maximumDate={max ? parseYMDLocal(max) : undefined}
          onChange={handle}
        />
      </PickerHost>
    </>
  );
}

export default TimeField;
