// ─────────────────────────────────────────────────────────────────────────────
// ui/PersonRow.jsx — avatar + name + employee code. Web ancestor: PersonCell.
//
// NEVER A UUID (CLAUDE.md §4). `employee_code` is the only identifier that
// reaches the screen, and only where an identifier is genuinely useful — a
// directory list, a row where two colleagues share a name.
//
// A name that hasn't resolved reads "Loading…", not "Unknown" and not the id.
// Pass the string that hooks/useDirectory.js `nameOf()` gave you; it already
// makes that distinction.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { employeeCode, personName } from '../lib/normalize';
import { color, space, text } from '../theme/tokens';
import { Avatar } from './Avatar';

/**
 * @param {object} props
 * @param {object} [props.person]
 * @param {string} [props.name]  an already-resolved name (from nameOf())
 * @param {string} [props.caption] a second line — designation, department
 * @param {number} [props.size]
 */
export function PersonRow({ person, name, caption, size = 36, right, onPhotoError, style }) {
  const label = name || personName(person, 'Loading…');
  const code = employeeCode(person);
  const sub = caption || code || null;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3] }, style]}>
      <Avatar person={person} size={size} onPhotoError={onPhotoError} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          numberOfLines={1}
          style={[text.bodyStrong, label === 'Loading…' && { color: color.textMuted }]}
        >
          {label}
        </Text>
        {sub ? <Text numberOfLines={1} style={text.small}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export default PersonRow;
