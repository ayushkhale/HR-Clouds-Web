// ─────────────────────────────────────────────────────────────────────────────
// ui/PersonSelect.jsx — choosing a colleague.
//
// NEVER A PLAIN SELECT OF PEOPLE (CLAUDE.md §4). A list of bare names loses the
// only thing that separates two colleagues called Priya, and a list of ids is
// the rule's whole reason for existing. This shows a face, a name and an
// employee code, over the ONE people source this app has
// (hooks/useDirectory.js → /organizations/directory).
//
// Rarely needed in the employee app — you don't normally pick other people —
// but it exists for a "share with" flow and for the manager phase, where it is
// used constantly. Written once now, so the manager app doesn't fork it.
//
// A name still loading reads "Loading…", never "Unknown" and never an id.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDirectorySearch } from '../hooks/useDirectory';
import { icons } from '../theme/icons';
import { color, gutter, space } from '../theme/tokens';
import { OptionSheet } from './Select';
import { PersonRow } from './PersonRow';
import { PickerBox, TextField } from './TextField';
import { Skeleton } from './Skeleton';

/**
 * @param {object} props
 * @param {{id: string, name: string}|null} props.value  the chosen person
 * @param {Function} props.onChange  receives the directory entry, or null
 */
export function PersonSelect({
  value,
  onChange,
  placeholder = 'Choose a colleague',
  title = 'Choose a colleague',
  invalid = false,
  disabled = false,
  registerFocus,
  style,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PickerBox
        value={value?.name}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        invalid={invalid}
        disabled={disabled}
        registerFocus={registerFocus}
        icon={icons.people}
        accessibilityLabel={value?.name ? `Chosen: ${value.name}` : placeholder}
        style={style}
      />
      {open ? (
        <PersonSheet
          title={title}
          onClose={() => setOpen(false)}
          onPick={(person) => {
            onChange(person);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The searchable list itself. Exported so a screen that IS a people list (the
 * directory, the org chart's drill-down) uses the same rows rather than its own.
 *
 * Search goes to the SERVER and is debounced inside useDirectorySearch — a
 * roster of thousands cannot be filtered client-side from page one.
 */
export function PersonSheet({ title, onClose, onPick }) {
  const dir = useDirectorySearch({ limit: 30 });

  return (
    <OptionSheet
      visible
      title={title}
      onClose={onClose}
      data={dir.rows}
      keyOf={(p) => p.id}
      emptyMessage={
        dir.search
          ? 'Nobody matches that name. Try fewer letters.'
          : 'No colleagues to show yet.'
      }
      header={(
        <View style={{ paddingHorizontal: gutter, paddingVertical: space[3] }}>
          <TextField
            kind="search"
            value={dir.search}
            onChangeText={dir.setSearch}
            placeholder="Search by name"
            left={<icons.search size={16} color={color.textMuted} />}
          />
          {dir.loading && !dir.rows.length ? <Skeleton type="rows" rows={4} /> : null}
        </View>
      )}
      renderRow={(person) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => onPick(person)}
          style={({ pressed }) => ({
            paddingHorizontal: gutter,
            paddingVertical: space[3],
            minHeight: 60,
            justifyContent: 'center',
            backgroundColor: pressed ? color.pressTint : 'transparent',
          })}
        >
          <PersonRow person={person} name={person.name} caption={person.code || person.department} />
        </Pressable>
      )}
    />
  );
}

export default PersonSelect;
