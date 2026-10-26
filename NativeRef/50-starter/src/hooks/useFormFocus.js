// ─────────────────────────────────────────────────────────────────────────────
// hooks/useFormFocus.js — the measured half of CLAUDE.md §11.
//
// The rules, the reasons and the `problems` contract are all in
// lib/formGuard.js — READ THAT FIRST. This file is only the part that needs
// React: remembering where each field ended up on screen, so a press on an
// unfinished form can travel to the first thing that needs answering.
//
// Why measured and not queried: there is no document here. A web form finds
// its first problem with `getElementById` + document order; a native form has
// to be told. Each Field reports its own `y` via onLayout and its input's
// focus() via registerFocus, and the guard sorts by `y`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef } from 'react';
import { hasProblems } from '../lib/formGuard';

/**
 * The form's focus registry.
 *
 * ```js
 * const scroller = useRef(null);
 * const focus = useFormFocus(scroller);
 *
 * <ScrollView ref={scroller}>
 *   <Field label="Date" error={show(problems.date)} register={focus.register('date')}>
 * </ScrollView>
 *
 * const send = async () => {
 *   if (busy) return;
 *   if (focus.focusFirstProblem(problems())) { setAttempted(true); return; }
 *   …
 * };
 * ```
 */
export function useFormFocus(scrollRef) {
  // key → { y, focus }. A ref, not state: registering during layout must not
  // re-render the form, or a long form re-renders once per field on mount.
  const entries = useRef({});

  /** Spread onto a Field. It reports that field's y and its input's focus(). */
  const register = useCallback((key) => ({
    onLayout: (e) => {
      const y = e?.nativeEvent?.layout?.y;
      if (Number.isFinite(y)) {
        entries.current[key] = { ...(entries.current[key] || {}), y };
      }
    },
    registerFocus: (fn) => {
      entries.current[key] = { ...(entries.current[key] || {}), focus: fn };
    },
  }), []);

  /**
   * Take the person to the first thing that needs them, and say whether the
   * form must not be sent.
   *
   * @param {Record<string,string>} problems  key → what is wrong with it
   * @returns {boolean} true when something is wrong, so the caller sends nothing
   */
  const focusFirstProblem = useCallback((problems) => {
    if (!hasProblems(problems)) return false;

    const found = Object.keys(problems)
      .map((key) => ({ key, ...(entries.current[key] || {}) }))
      .filter((e) => Number.isFinite(e.y))
      .sort((a, b) => a.y - b.y)[0];

    if (found) {
      // Scroll first, focus second. Focusing a TextInput also scrolls it into
      // view on both platforms, and that instant jump cuts an animated scroll
      // short halfway — so the scroll goes first and gets a beat to finish.
      scrollRef?.current?.scrollTo?.({ y: Math.max(0, found.y - 80), animated: true });
      if (typeof found.focus === 'function') setTimeout(() => found.focus(), 250);
    }

    // True even when nothing was found. A problem we can't point at is still a
    // problem, and sending anyway is how the 400 got in front of the person.
    return true;
  }, [scrollRef]);

  /** Forget everything — call it when a form is reset or reopened. */
  const reset = useCallback(() => { entries.current = {}; }, []);

  return { register, focusFirstProblem, reset };
}

