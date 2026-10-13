// ─────────────────────────────────────────────────────────────────────────────
// HoverBlob.jsx — the small dark speech bubble the task tables use wherever a
// cell shows a SHORTENED form of something longer: a truncated title, a status
// chip whose chip text is the short label. Hover (or a tap) shows the whole
// thing in a bubble with a tail pointing back at the cell.
//
// It replaces the native `title=` attribute, which the browser renders in its
// own OS style after about half a second — slow, unstyled, and nothing like
// the rest of the app. The look matches the trend chart's tooltip so the app
// has one bubble language rather than several.
//
// Why it's built this way (each of these fixes a real failure mode):
//
// • PORTALLED AND `position: fixed`, NOT absolutely positioned in the cell.
//   The task tables live in `overflow-x-auto`, and CSS will not let a box
//   scroll on one axis and overflow on the other — setting `overflow-x: auto`
//   computes `overflow-y` to `auto` too. An in-flow bubble above the first row
//   would therefore be clipped, or would push a stray vertical scrollbar onto
//   the table. A portal to <body> can't be clipped by anything.
//
// • IT IS NOT THE ONLY COPY OF THE TEXT. The bubble is pointer-only — the
//   trigger is a plain <span> inside a row that is already the keyboard stop
//   (rowPreviewProps), and adding a tab stop per cell would make the table
//   tedious to walk. So the full text is ALSO rendered `sr-only` beside the
//   short one: a screen reader always reads it, with or without a pointer.
//   A hover-only tooltip on a non-focusable element hides the information
//   from everyone who doesn't use a mouse.
//
// • OPEN DELAY. Dragging the pointer down a column of twenty rows would
//   otherwise flash twenty bubbles. 150ms is the same delay the ⓘ popover uses.
//
// • z-[130] SITS UNDER DetailDialog (z-[140]). These bubbles belong to a table
//   that a dialog covers completely, so they can never need to be above one —
//   and the house stack (§3) must stay in order: DetailDialog 140 <
//   AttachmentViewer 165 < ReasonDialog 170 < toasts 200.
//
// • `pointer-events-none` on the bubble. It is drawn over the row it describes,
//   and a bubble that swallowed the click would stop the row opening.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 150;
const GAP = 8;
const EDGE = 8;

/** Place a content-sized bubble centred on the anchor, flipped up when it won't fit below. */
function useBlobPosition(open, anchorRef, bubbleRef) {
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    // Before the first paint the bubble has no box yet; 0 keeps it off-screen
    // for that one frame rather than flashing in the wrong place.
    const b = bubble ? bubble.getBoundingClientRect() : { width: 0, height: 0 };
    const below = window.innerHeight - a.bottom;
    const flip = below < b.height + GAP && a.top > below;
    const left = Math.max(EDGE, Math.min(a.left + a.width / 2 - b.width / 2, window.innerWidth - b.width - EDGE));
    setPos({
      left,
      top: flip ? a.top - b.height - GAP : a.bottom + GAP,
      flip,
      // Where the tail sits along the bubble, so it keeps pointing at the
      // anchor even when the bubble was pushed away from a viewport edge.
      tail: Math.max(10, Math.min(a.left + a.width / 2 - left, Math.max(10, b.width - 10))),
    });
  }, [anchorRef, bubbleRef]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    // Measured twice on purpose: the first pass has no bubble box to centre on.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return pos;
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.children  what the cell shows (the short form)
 * @param {string} props.text               the whole thing, for the bubble
 * @param {boolean} [props.srOnlyText]      also render `text` for screen readers
 *   (default true). Pass false when the surrounding cell already says it.
 */
export default function HoverBlob({ children, text, srOnlyText = true, className = "" }) {
  const anchorRef = useRef(null);
  const bubbleRef = useRef(null);
  const timer = useRef(null);
  const [open, setOpen] = useState(false);
  const pos = useBlobPosition(open, anchorRef, bubbleRef);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) return <span className={className}>{children}</span>;

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      ref={anchorRef}
      className={`inline-flex min-w-0 ${className}`}
      onPointerEnter={show}
      onPointerLeave={hide}
      // A tap opens the row, so the bubble must not linger over the next screen.
      onPointerCancel={hide}
    >
      {children}
      {srOnlyText && <span className="sr-only">{text}</span>}
      {open && createPortal(
        <div
          ref={bubbleRef}
          aria-hidden="true"
          style={{
            left: pos ? pos.left : -9999,
            top: pos ? pos.top : -9999,
            zIndex: 130,
            visibility: pos ? "visible" : "hidden",
          }}
          className="fixed pointer-events-none select-none max-w-[min(22rem,calc(100vw-16px))] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="relative rounded-xl border border-white/10 bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-white shadow-xl backdrop-blur-md">
            {text}
            <span
              aria-hidden="true"
              style={{ left: pos ? pos.tail : "50%" }}
              className={`absolute h-2 w-2 -translate-x-1/2 rotate-45 border-white/10 bg-slate-900/95 ${
                pos?.flip ? "-bottom-1 border-b border-r" : "-top-1 border-l border-t"
              }`}
            />
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
