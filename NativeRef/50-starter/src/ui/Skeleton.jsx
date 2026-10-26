// ─────────────────────────────────────────────────────────────────────────────
// ui/Skeleton.jsx — the SHAPE of the content that is coming.
//
// Never a centred spinner. The web app replaced its spinners with these because
// a spinner tells you nothing and makes the screen jump when the real content
// lands at a different height. A skeleton holds the layout.
//
// TWO RULES:
//
//   1. A REFRESH OF ALREADY-LOADED DATA DOES NOT SHOW THIS. Keep the old rows
//      on screen and let the pull-to-refresh control do the talking. Replacing
//      a readable list with grey blocks every time a screen regains focus is
//      the single most common way a native app feels worse than its website.
//      Gate it on `loading && !data`, never on `loading`.
//
//   2. THE SKELETON MATCHES THE REAL LAYOUT. If the list has an avatar, the
//      skeleton has a circle. A generic three-bar block that doesn't match
//      causes exactly the jump it was meant to prevent.
//
// Under reduce-motion the pulse stops and the blocks go static grey — a
// breathing screen is the thing that setting is most often turned on for.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SKELETON } from '../theme/motion';
import { color, gutter, radius, space } from '../theme/tokens';

/** One grey block. Everything below is composed of these. */
export function SkeletonBlock({ width = '100%', height = 14, radius: r = radius.sm, style }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(reduced ? 0.75 : SKELETON.from);

  useEffect(() => {
    if (reduced) {
      pulse.value = 0.75;
      return;
    }
    pulse.value = withRepeat(
      withTiming(SKELETON.to, { duration: SKELETON.duration, easing: SKELETON.easing }),
      -1,
      true,
    );
  }, [reduced, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: color.borderSubtle },
        animated,
        style,
      ]}
    />
  );
}

const Line = (props) => <SkeletonBlock height={12} {...props} />;

function RowSkeleton({ avatar = true }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], paddingHorizontal: gutter }}>
      {avatar ? <SkeletonBlock width={36} height={36} radius={radius.full} /> : null}
      <View style={{ flex: 1, gap: 6 }}>
        <Line width="62%" />
        <Line width="38%" height={10} />
      </View>
      <SkeletonBlock width={56} height={18} radius={radius.full} />
    </View>
  );
}

function CardSkeleton() {
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle, padding: space[4], gap: space[3] }}>
      <Line width="34%" height={10} />
      <SkeletonBlock width="55%" height={26} />
      <Line width="80%" />
    </View>
  );
}

function TileRow() {
  return (
    <View style={{ flexDirection: 'row', gap: space[3] }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle, padding: space[4], gap: space[2] }}>
          <Line width="70%" height={10} />
          <SkeletonBlock width="45%" height={22} />
        </View>
      ))}
    </View>
  );
}

/**
 * @param {object} props
 * @param {'rows'|'card'|'tiles'|'dashboard'|'sheet'|'chart'} props.type
 * @param {number} [props.rows] for `type="rows"`
 */
export function Skeleton({ type = 'rows', rows = 5, avatar = true, style }) {
  // The whole block is one accessibility element saying one thing. Without
  // this, VoiceOver walks eighteen grey rectangles.
  const a11y = {
    accessible: true,
    accessibilityRole: 'progressbar',
    accessibilityLabel: 'Loading',
  };

  if (type === 'rows') {
    return (
      <View {...a11y} style={style}>
        {Array.from({ length: rows }).map((_, i) => <RowSkeleton key={i} avatar={avatar} />)}
      </View>
    );
  }

  if (type === 'card') return <View {...a11y} style={[{ paddingHorizontal: gutter }, style]}><CardSkeleton /></View>;

  if (type === 'tiles') return <View {...a11y} style={[{ paddingHorizontal: gutter }, style]}><TileRow /></View>;

  if (type === 'chart') {
    return (
      <View {...a11y} style={[{ paddingHorizontal: gutter }, style]}>
        <View style={{ backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.borderSubtle, padding: space[4], gap: space[3] }}>
          <Line width="40%" height={10} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2], height: 120 }}>
            {[0.5, 0.8, 0.35, 0.95, 0.6, 0.75, 0.45].map((h, i) => (
              <SkeletonBlock key={i} width={0} height={120 * h} style={{ flex: 1 }} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (type === 'sheet') {
    return (
      <View {...a11y} style={[{ gap: space[4], paddingHorizontal: gutter, paddingTop: space[2] }, style]}>
        <TileRow />
        <View style={{ gap: space[2] }}>
          <Line width="30%" height={10} />
          <Line width="100%" />
          <Line width="92%" />
          <Line width="64%" />
        </View>
      </View>
    );
  }

  // dashboard — the hero is already drawn by PageHeader, so this is what sits
  // under it: the punch card, two tiles, a chart.
  return (
    <View {...a11y} style={[{ gap: space[4], paddingHorizontal: gutter }, style]}>
      <CardSkeleton />
      <TileRow />
      <Skeleton type="chart" style={{ paddingHorizontal: 0 }} />
    </View>
  );
}

export default Skeleton;
