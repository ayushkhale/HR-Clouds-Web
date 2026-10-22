// ─────────────────────────────────────────────────────────────────────────────
// ui/PageHeader.jsx — the signature purple hero.
//
// Web ancestor: shared/components/PageHeader.jsx, whose header comment is a
// long warning about one bug. It is worth repeating, because the native version
// can reintroduce it in one line:
//
//   THE BANNER HAS A FIXED HEIGHT. It is not sized by its art, not by its
//   text, and not by an aspect ratio. On the web, sizing by WIDTH meant each
//   role's banner came out a different height depending on what shape image
//   somebody had dropped in — the employee's was 5rem shorter than HR's "for
//   no reason anybody chose". A workspace whose banner is visibly shorter
//   reads as the lesser product, and a manager who gets promoted to HR must
//   feel like they are in the same app (CLAUDE.md §2).
//
//   So: `minHeight: 132`, art letterboxed inside its box, and new header
//   information goes INSIDE this banner rather than above or below it.
//
// The gradient is the exact web one: #5B21B6 → #6328D7 → #4C1D95, left to
// right. Don't eyeball it; those three hexes are the brand.
//
// ONLY THE HOME SCREEN GETS ONE. Every other screen uses the native header plus
// a ScreenTitle, exactly as the web app does — a hero on every screen eats a
// third of a phone and says nothing new.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Image, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, elevate, iconSize, radius, space, text } from '../theme/tokens';

/**
 * @param {object} props
 * @param {string} [props.badgeText]  the small pill above the greeting
 * @param {Function} [props.badgeIcon] a component from theme/icons.js
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {any} [props.image]    decorative art — require()'d, not a URL
 * @param {React.ReactNode} [props.right]  used when there is no art
 */
export function PageHeader({
  badgeText,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  image,
  right,
  style,
}) {
  return (
    <LinearGradient
      colors={[color.heroFrom, color.heroVia, color.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[{
        minHeight: 132, // FIXED. See the header comment before changing it.
        borderRadius: radius.xl,
        padding: space[4],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        overflow: 'hidden',
      }, elevate('sm'), style]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        {badgeText ? (
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: radius.full,
              backgroundColor: color.heroBadgeBg,
              borderWidth: 1,
              borderColor: color.heroBadgeBorder,
            }}
          >
            {BadgeIcon ? <BadgeIcon size={iconSize.info} color={color.heroBadgeIcon} /> : null}
            <Text style={[text.badge, { color: color.textOnBrand }]}>{badgeText}</Text>
          </View>
        ) : null}

        {/* accessibilityRole="header" is what makes the screen reader's
            "next heading" gesture land here, the same job the web <h1> does. */}
        <Text accessibilityRole="header" style={[text.h1, { color: color.textOnBrand }]}>
          {title}
        </Text>

        {subtitle ? (
          <Text style={[text.small, { color: color.heroSubtitle }]}>{subtitle}</Text>
        ) : null}
      </View>

      {image ? (
        <Image
          source={image}
          // The art carries nothing the heading doesn't, so it is hidden from
          // screen readers rather than given a made-up description.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          // `contain` is the whole trick: a wide asset letterboxes inside this
          // fixed box instead of shrinking the banner.
          resizeMode="contain"
          style={{ width: 104, height: 104 }}
        />
      ) : right || null}
    </LinearGradient>
  );
}

/**
 * A chip for inside the hero — the shift, the work mode, a count. On the dark
 * gradient, so it has its own colours rather than reusing Pill's.
 *
 * This is where "new header information goes inside it" happens in practice.
 */
export function HeroChip({ icon: Icon, children, style }) {
  return (
    <View
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space[3],
        paddingVertical: 6,
        borderRadius: radius.full,
        backgroundColor: color.heroBadgeBg,
        borderWidth: 1,
        borderColor: color.heroBadgeBorder,
      }, style]}
    >
      {Icon ? <Icon size={iconSize.sm} color={color.heroBadgeIcon} /> : null}
      <Text style={[text.smallStrong, { color: color.textOnBrand }]}>{children}</Text>
    </View>
  );
}

export default PageHeader;
