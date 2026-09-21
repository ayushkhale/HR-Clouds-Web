// ─────────────────────────────────────────────────────────────────────────────
// usePopoverPosition.js — where to put a portalled pop-up (people picker, time
// picker) so a modal's scrolling body never clips it. Fixed positioning under
// the anchor, flipped above it when there isn't room below, kept on screen,
// and re-measured on scroll and resize.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useLayoutEffect, useState } from "react";

/**
 * @param {boolean} open
 * @param {{ current: HTMLElement | null }} anchorRef
 * @param {{ height: number, minWidth?: number }} options expected panel height and minimum width
 * @returns {{ left: number, width: number, top?: number, bottom?: number } | null}
 */
export default function usePopoverPosition(open, anchorRef, { height, minWidth = 0 }) {
  const [pos, setPos] = useState(null);
  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, minWidth);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    const up = below < height + 16 && r.top > below;
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
  }, [anchorRef, height, minWidth]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return open ? pos : null;
}
