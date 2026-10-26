// ─────────────────────────────────────────────────────────────────────────────
// ui/TabStrip.jsx — the sub-screen tab bar (Time, Profile, Payslips).
//
// Web ancestor: `ProfileTabStrip`, whose own header is a warning worth copying
// in full, because it records two failed attempts:
//
//   • `flex-wrap` grew the bar to THREE ROWS on a laptop.
//   • A bare scroll strip HID THE LAST TABS, and nobody knew they were there.
//
// So the web strip carries arrows, edge fades, and scroll-the-selected-tab-
// into-view. On a phone the arrows go (swiping a strip is natural; a 28pt arrow
// beside a 36pt tab is not) but THE FADES AND THE AUTO-SCROLL STAY. They are
// what tell you the strip continues.
//
//   DO NOT TURN THIS BACK INTO A WRAPPING ROW. (CLAUDE.md §5)
//
// Difference from FilterTabs: FilterTabs filters ONE list; this switches
// between sub-screens. Visually they are deliberately distinct — pills for a
// filter, an underline for navigation — so you can tell at a glance whether
// pressing will change the data or change the page.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { color, gutter, space, text } from '../theme/tokens';

const FADE_W = 24;

/**
 * @param {object} props
 * @param {Array<{value: string, label: string, count?: number}>} props.tabs
 * @param {string} props.value
 * @param {Function} props.onChange
 * @param {React.ReactNode} [props.help] the ⓘ for the OPEN tab, keyed
 *   `tab.<value>` in fieldHelp.json. Rendered outside the tablist.
 */
export function TabStrip({ tabs = [], value, onChange, help, style }) {
  const scroller = useRef(null);
  const offsets = useRef({});
  const [scrollX, setScrollX] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [viewW, setViewW] = useState(0);

  const scrollSelectedIntoView = useCallback(() => {
    const x = offsets.current[value];
    if (x != null && scroller.current) {
      scroller.current.scrollTo({ x: Math.max(0, x - 40), animated: true });
    }
  }, [value]);

  useEffect(() => { scrollSelectedIntoView(); }, [scrollSelectedIntoView]);

  const atStart = scrollX <= 2;
  const atEnd = scrollX + viewW >= contentW - 2;

  return (
    <View style={[{ borderBottomWidth: 1, borderBottomColor: color.borderSubtle }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, position: 'relative' }}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
            onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
            onContentSizeChange={(w) => setContentW(w)}
            contentContainerStyle={{ paddingHorizontal: gutter, gap: space[5] }}
            accessibilityRole="tablist"
          >
            {tabs.map((tab) => {
              const selected = tab.value === value;
              return (
                <Pressable
                  key={tab.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onLayout={(e) => { offsets.current[tab.value] = e.nativeEvent.layout.x; }}
                  onPress={() => onChange(tab.value)}
                  style={{
                    paddingVertical: space[3],
                    minHeight: 44,
                    justifyContent: 'center',
                    borderBottomWidth: 2,
                    // The indicator is the selected tab's own bottom border, so
                    // it can never drift out of sync with the label — a
                    // separately positioned bar did exactly that on the web.
                    borderBottomColor: selected ? color.brand : 'transparent',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[text.smallStrong, {
                      color: selected ? color.brand : color.textSecondary,
                    }]}
                  >
                    {Number.isFinite(tab.count) ? `${tab.label} (${tab.count})` : tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Edge fades. Not decoration — they are the only thing saying the
              strip continues, which is the bug the web version was fixing. */}
          {!atStart ? (
            <LinearGradient
              pointerEvents="none"
              colors={[color.bg, 'rgba(248,250,252,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: FADE_W }}
            />
          ) : null}
          {!atEnd && contentW > viewW ? (
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(248,250,252,0)', color.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FADE_W }}
            />
          ) : null}
        </View>

        {/* One ⓘ for the open tab, beside the strip — never inside the
            tablist (see FilterTabs rule 3). */}
        {help ? <View style={{ paddingRight: gutter, paddingLeft: space[1] }}>{help}</View> : null}
      </View>
    </View>
  );
}

export default TabStrip;
