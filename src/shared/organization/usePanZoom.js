// ─────────────────────────────────────────────────────────────────────────────
// organization/usePanZoom.js — Drag, pinch, scroll and keyboard for the Org
// Chart canvas. The content is one element moved with a CSS transform, so the
// tree lays itself out with ordinary flexbox and nothing is re-measured per
// frame.
//
// Why it's built this way (each fixes a real failure mode):
// • Pointer capture starts only once a press has moved a few pixels. Capturing
//   on pointerdown retargets the click to the canvas, and the cards' own
//   buttons stopped opening anything.
// • After a drag, the click that ends it is swallowed in the capture phase —
//   otherwise letting go over a card opens that person.
// • Positions are read with offsetLeft/offsetTop, which ignore transforms. A
//   bounding rect read mid-animation returns an in-between value and centring
//   lands in the wrong place.
// • The wheel listener is attached natively with `passive: false`: React's
//   onWheel is passive, and without preventDefault a ctrl-scroll zooms the
//   whole browser page instead of the chart. Trackpad pinch arrives as
//   ctrl + wheel, so it gets the same zoom for free.
// • Embedded in a page (`wheelPans: false`), a plain vertical scroll is left
//   to the PAGE — the embedded-map rule. A canvas that ate every scroll made
//   the page impossible to scroll back up once it filled the window.
//   Horizontal swipes still pan (the page never scrolls sideways, and it stops
//   the trackpad's back-swipe). Full screen passes `wheelPans: true`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 1.75;
const DRAG_THRESHOLD = 5;
const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Offset of `el` inside `root`, in content pixels (transform-independent). */
export function offsetWithin(el, root) {
  let x = 0;
  let y = 0;
  let cur = el;
  while (cur && cur !== root) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent;
  }
  return { x, y, w: el?.offsetWidth || 0, h: el?.offsetHeight || 0 };
}

export default function usePanZoom({ viewportRef, contentRef, reducedMotion = false, wheelPans = true, onWheelHint }) {
  const [view, setViewState] = useState({ x: 0, y: 0, s: 1 });
  const [animating, setAnimating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const animTimer = useRef(0);

  const setView = useCallback((next, { animate = false } = {}) => {
    const resolved = typeof next === "function" ? next(viewRef.current) : next;
    const v = { x: resolved.x, y: resolved.y, s: clampScale(resolved.s) };
    viewRef.current = v;
    clearTimeout(animTimer.current);
    if (animate && !reducedMotion) {
      setAnimating(true);
      animTimer.current = setTimeout(() => setAnimating(false), 480);
    } else {
      setAnimating(false);
    }
    setViewState(v);
  }, [reducedMotion]);

  useEffect(() => () => clearTimeout(animTimer.current), []);

  /** Zoom by `factor` keeping the point (cx, cy) in viewport pixels still. */
  const zoomAt = useCallback((factor, cx, cy, opts) => {
    setView((v) => {
      const s = clampScale(v.s * factor);
      const k = s / v.s;
      return { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, s };
    }, opts);
  }, [setView]);

  const zoomBy = useCallback((factor) => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(factor, vp.clientWidth / 2, vp.clientHeight / 2, { animate: true });
  }, [viewportRef, zoomAt]);

  /** Whole chart in view, never above 100%. */
  const fit = useCallback((opts = { animate: true }) => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;
    const w = content.offsetWidth;
    const h = content.offsetHeight;
    if (!w || !h) return;
    const s = clampScale(Math.min((vp.clientWidth - 32) / w, (vp.clientHeight - 32) / h, 1));
    setView({ x: (vp.clientWidth - w * s) / 2, y: Math.max(16, (vp.clientHeight - h * s) / 2), s }, opts);
  }, [viewportRef, contentRef, setView]);

  /**
   * First view: readable rather than tiny. The top of the chart centred, at
   * the scale that fits the width — but never below 60%, where names stop
   * being legible; a wide org then opens on `topEl` (the company card) and is
   * panned from there.
   */
  const reset = useCallback((opts = { animate: false }, topEl = null) => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;
    const w = content.offsetWidth;
    const h = content.offsetHeight;
    const fitsAll = Math.min((vp.clientWidth - 32) / w, (vp.clientHeight - 32) / h, 1);
    if (fitsAll >= 0.6) { fit(opts); return; }
    const s = clampScale(Math.max(0.6, Math.min((vp.clientWidth - 32) / w, 1)));
    const top = topEl ? offsetWithin(topEl, content) : null;
    const x = top ? vp.clientWidth / 2 - (top.x + top.w / 2) * s : (vp.clientWidth - w * s) / 2;
    setView({ x, y: 16, s }, opts);
  }, [viewportRef, contentRef, fit, setView]);

  /** Bring the element with this anchor to the upper-middle of the canvas. */
  const centerOn = useCallback((anchorEl, { minScale = 0.85 } = {}) => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content || !anchorEl) return;
    const o = offsetWithin(anchorEl, content);
    const s = clampScale(Math.max(viewRef.current.s, minScale));
    setView({
      x: vp.clientWidth / 2 - (o.x + o.w / 2) * s,
      y: vp.clientHeight * 0.4 - (o.y + o.h / 2) * s,
      s,
    }, { animate: true });
  }, [viewportRef, contentRef, setView]);

  // ── Pointer: drag to pan, two fingers to pinch ───────────────────────────
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const suppressClick = useRef(false);

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A drag released outside the window never gets its click; don't let the
    // stale flag eat the next real one.
    if (pointers.current.size === 0) suppressClick.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    if (pointers.current.size === 1) {
      gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y, moved: false, id: e.pointerId };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = viewportRef.current.getBoundingClientRect();
      gesture.current = {
        kind: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
        start: v,
        moved: true,
      };
      setDragging(true);
    }
  }, [viewportRef]);

  const onPointerMove = useCallback((e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        g.moved = true;
        setDragging(true);
        try { viewportRef.current?.setPointerCapture(g.id); } catch { /* pointer already gone */ }
      }
      setView({ x: g.vx + dx, y: g.vy + dy, s: viewRef.current.s });
    } else if (g.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const s = clampScale(g.start.s * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist));
      const k = s / g.start.s;
      setView({ x: g.mid.x - (g.mid.x - g.start.x) * k, y: g.mid.y - (g.mid.y - g.start.y) * k, s });
    }
  }, [viewportRef, setView]);

  const endPointer = useCallback((e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      if (g?.moved) suppressClick.current = true;
      gesture.current = null;
      setDragging(false);
    } else if (g?.kind === "pinch") {
      // One finger lifted: carry on as a pan from where it is.
      const [[id, p]] = [...pointers.current.entries()];
      const v = viewRef.current;
      gesture.current = { kind: "pan", startX: p.x, startY: p.y, vx: v.x, vy: v.y, moved: true, id };
    }
  }, []);

  const onClickCapture = useCallback((e) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // ── Wheel: ctrl/⌘ + scroll (and trackpad pinch) zooms; scroll pans ──────
  const wheelOpts = useRef({ wheelPans, onWheelHint });
  wheelOpts.current = { wheelPans, onWheelHint };
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    const onWheel = (e) => {
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = vp.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - rect.left, e.clientY - rect.top);
      } else if (wheelOpts.current.wheelPans) {
        e.preventDefault();
        setView((v) => ({ x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit, s: v.s }));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        setView((v) => ({ x: v.x - e.deltaX * unit, y: v.y, s: v.s }));
      } else {
        wheelOpts.current.onWheelHint?.();
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [viewportRef, zoomAt, setView]);

  // ── Keyboard, when the canvas itself has focus ──────────────────────────
  const onKeyDown = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
    const step = e.shiftKey ? 240 : 80;
    const pan = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (pan) {
      e.preventDefault();
      setView((v) => ({ x: v.x + pan[0], y: v.y + pan[1], s: v.s }), { animate: true });
    } else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.2); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.2); }
    else if (e.key === "0") { e.preventDefault(); fit(); }
  }, [setView, zoomBy, fit]);

  return {
    view,
    setView,
    animating,
    dragging,
    zoomBy,
    fit,
    reset,
    centerOn,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onClickCapture,
      onKeyDown,
    },
  };
}
