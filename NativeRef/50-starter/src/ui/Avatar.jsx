// ─────────────────────────────────────────────────────────────────────────────
// ui/Avatar.jsx — a person's picture. Web ancestor: GenderAvatar.
//
// NEVER HAND-ROLL INITIALS OR A BARE <Image> (CLAUDE.md §5). The web app had
// several and they disagreed about everything: which field holds the photo,
// what happens when it 403s, whether two words or one, what colour.
//
// ── RESOLUTION ORDER, exactly the web's ──────────────────────────────────────
//   1. a real photo (`src`, or `avatar_url` / `photo_url` found on `person`)
//   2. the generic male / female illustration, from the person's gender
//   3. purple initials, when gender is unknown
//
// A photo that FAILS TO LOAD falls through to 2 or 3. It never shows a broken
// image box, and it never shows an empty circle.
//
// ── THE PRESIGNED-URL TRAP (T21) ─────────────────────────────────────────────
//
// `avatar_url` IS A PRESIGNED LINK THAT DIES IN ABOUT FIVE MINUTES. Three
// consequences, all of which have bitten the web app:
//
//   • Never cache it. Not in AsyncStorage, not in a module-level map, not in a
//     hook's state that outlives the screen. The name cache in
//     hooks/useDirectory.js deliberately drops it for this reason.
//   • A screen left open goes stale. `onPhotoError` is how the host refetches
//     the row that carries the URL — pass it on any screen somebody might
//     leave open (a dashboard, a long list).
//   • The same colleague showing a photo on one screen and initials on the
//     next is this bug, not a data problem.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { initials, personName } from '../lib/normalize';
import { icons } from '../theme/icons';
import { color, font, radius } from '../theme/tokens';

/**
 * Drop the two illustrations in at these paths (the web app's are in
 * `src/assets/`). Until they exist, gender resolves to initials, which is a
 * perfectly good fallback — so this file does not crash on a missing asset.
 */
const ART = {
  // male: require('../assets/avatar-male.png'),
  // female: require('../assets/avatar-female.png'),
};

const photoFrom = (person) =>
  person?.avatar_url || person?.photo_url || person?.profile_photo_url
  || person?.profile?.avatar_url || null;

const genderOf = (person) => {
  const g = String(person?.gender || person?.profile?.gender || '').trim().toLowerCase();
  if (g.startsWith('m')) return 'male';
  if (g.startsWith('f')) return 'female';
  return null;
};

/**
 * @param {object} props
 * @param {object} [props.person]  a row with a name and maybe a photo
 * @param {string} [props.src]     an explicit URL, overriding the person's
 * @param {number} [props.size]
 * @param {Function} [props.onPhotoError] refetch the row — see the header
 */
export function Avatar({ person, src, size = 36, onPhotoError, style }) {
  const url = src || photoFrom(person);
  const [failed, setFailed] = useState(false);

  // A new URL deserves a new attempt: the host refetched precisely because the
  // old one had expired, and staying failed would defeat that.
  useEffect(() => { setFailed(false); }, [url]);

  const name = personName(person, '');
  const gender = genderOf(person);
  const art = gender ? ART[gender] : null;
  const label = name ? `${name}’s photo` : 'Photo';

  const frame = {
    width: size,
    height: size,
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: color.brandSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={label}
        onError={() => {
          setFailed(true);
          onPhotoError?.();
        }}
        style={[frame, style]}
      />
    );
  }

  if (art) {
    return (
      <View style={[frame, style]}>
        <Image source={art} accessibilityLabel={label} resizeMode="cover" style={{ width: size, height: size }} />
      </View>
    );
  }

  const letters = initials(name);

  return (
    <View
      // The initials are a stand-in for a name the row already states, so they
      // are not announced again.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[frame, style]}
    >
      {letters ? (
        <Text
          style={{
            fontFamily: font.bold,
            fontSize: Math.max(10, Math.round(size * 0.36)),
            color: color.brandSoftFg,
          }}
        >
          {letters}
        </Text>
      ) : (
        // No name to take initials from — a person glyph, NOT a dash and NOT a
        // "?" (CLAUDE.md §5: never render a dash). This is what an unresolved
        // colleague looks like while their name is still loading.
        icons.profile
          ? <icons.profile size={Math.round(size * 0.6)} color={color.brandSoftBorder} />
          : null
      )}
    </View>
  );
}

export default Avatar;
