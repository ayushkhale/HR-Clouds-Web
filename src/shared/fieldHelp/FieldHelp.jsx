// ─────────────────────────────────────────────────────────────────────────────
// FieldHelp.jsx — the small ⓘ next to a confusing form field or a hard-to-read
// figure, column or status. Hover, keyboard focus or tap shows a one-line
// plain-English explanation; when the config says so, it also offers "Ask Maya
// about this", which opens Maya with a pre-written question in her input box.
// The user still presses Send — nothing is sent for them.
//
//   <div className="flex items-center">
//     <label htmlFor="bank-ifsc" className={labelCls}>IFSC code</label>
//     <FieldHelp surface="payroll.bank_details" field="ifsc_code" label="an IFSC code" className="mb-1.5" />
//   </div>
//   <th><span className="inline-flex items-center whitespace-nowrap">Effective <FieldHelp … /></span></th>
//
// Where it may go (these keep it from distorting the screen it's added to):
// • Beside a <label>, never inside it: a button inside a label becomes part of
//   the input's accessible name ("IFSC code What is an IFSC code?"). Match the
//   label's bottom margin with `className` so the ⓘ centres on the text.
// • Never inside another interactive element — a button, link, <summary>,
//   clickable card, a DetailSection's fold toggle or a FilterTabs tablist.
//   Nested controls are invalid and a click would fire both. Put it beside.
// • On the label, never on the number; in a column header, never per row. Group
//   label + ⓘ with `inline-flex items-center whitespace-nowrap` so the icon can
//   never wrap onto a line of its own and make the host taller.
// • `tone="onDark"` on purple surfaces (hero tiles, PageHeader): the default
//   slate icon disappears on purple-600. `size="sm"` for 10px labels.
// • `overlay` takes the ⓘ out of layout (zero width): it draws in the room the
//   host already has — cell or tile padding, the free end of a tab row —
//   instead of reserving 26px. Use it where a label or tab row sits so close to
//   its width that the ⓘ would push it onto another line (measured at 390px:
//   the PF row, "Standard deduction", "Pending hold", the document tab bars).
//   Not for right-aligned labels — there the icon would hang past the edge.
// • Page and tab help (phase 5, HR onboarding tier): a page's ⓘ sits beside
//   its <h1> via HelpLabel with the key `page`; a tab strip gets ONE ⓘ beside
//   it — outside any tablist or scroll container — keyed `tab.<open tab>`, so
//   it explains whichever tab is showing. Tabs with no entry show nothing.
// • How many: at most 4 per screen state for core entries (CLAUDE.md §10);
//   entries tagged `"tier": "onboarding"` are exempt from that cap but keep
//   once-per-concept and every rule above. See fieldHelpMeta.js for the tier.
//
// Why it's built this way (keep these — each one fixes a real failure):
// • Everything comes from fieldHelp.json via getFieldHelp(). No entry for this
//   surface, field or workspace → renders nothing, so wiring an ⓘ into a shared
//   component is safe in every workspace.
// • A toggletip, not a tooltip: the panel holds a button, so role="tooltip" is
//   wrong. It's a non-modal popover the keyboard can reach — Tab from the ⓘ
//   moves into it, Tab again carries on through the form.
// • Hover opens after a short delay and leaves a grace period so the pointer
//   can travel from the ⓘ to the link. A click, tap or keyboard focus "pins"
//   it: then only blur, an outside press or Escape closes it. Touch has no
//   hover, so tap is the only way in there.
// • Portalled to <body> and placed by usePopoverPosition, because the forms
//   live in scrolling modal bodies that would clip it. Its layer is set from
//   the dialog that hosts the ⓘ (fieldHelpLayer.js): z-155 over anything up to
//   z-150, and just above a higher host — the claim review (z-160) and the
//   z-170 document dialogs. The same host layer goes with an "Ask Maya", so
//   she opens above that dialog too.
// • Escape is taken in the capture phase and stopped: one Escape closes the
//   popover, never the form under it — several forms close on any Escape.
// • React bubbles portal events through the React tree, so a click on the
//   panel's text would reach a row's rowPreviewProps. Clicks stop at the panel
//   — only there: stopping the ⓘ's own click would also hide it from other
//   components' document-level "click outside" listeners.
// • The panel cancels mousedown so pressing its link doesn't blur the ⓘ first
//   (Safari doesn't focus buttons on click) and unmount the link mid-click.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HiInformationCircle, HiSparkles } from "react-icons/hi";
import usePopoverPosition from "../hooks/usePopoverPosition";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useMayaQueryLimit } from "../maya/useMayaQueryLimit";
import { askMaya } from "../maya/mayaBridge";
import { getFieldHelp } from "./fieldHelpMeta";
import { hostLayerOf, popoverLayerFor } from "./fieldHelpLayer";

const OPEN_DELAY_MS = 150;
const CLOSE_GRACE_MS = 200;
const PANEL_W = 280;
const PANEL_H = 150; // expected height — only decides whether to flip above the ⓘ

// Only one field-help popover is open at a time, app-wide.
let closeActivePopover = null;

const isFocusVisible = (el) => {
  try { return el.matches(":focus-visible"); } catch { return true; }
};

// Resting colours clear WCAG's 3:1 for controls: slate-500 on white is 4.8:1
// (slate-400 was 2.6:1), purple-200 on purple-600 about 4:1.
const TONES = {
  default: { rest: "text-slate-500", active: "text-purple-600", cls: "hover:text-purple-600 focus-visible:text-purple-600 focus-visible:ring-purple-500/40" },
  onDark: { rest: "text-purple-200", active: "text-white", cls: "hover:text-white focus-visible:text-white focus-visible:ring-white/70" },
};
const ICON_SIZE = { md: "w-3.5 h-3.5", sm: "w-3 h-3" };

export default function FieldHelp({ surface, field, label, ariaLabel, className = "", tone = "default", size = "md", overlay = false }) {
  const workspace = useWorkspace();
  const help = getFieldHelp(surface, field, workspace);
  const mayaLimit = useMayaQueryLimit();

  const [open, setOpen] = useState(false);
  // Pinned = opened by click, tap or keyboard; the pointer leaving doesn't close it.
  const [pinned, setPinned] = useState(false);
  // z-index of the dialog this ⓘ sits in, read when the popover opens.
  const [hostLayer, setHostLayer] = useState(0);
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const askRef = useRef(null);
  const timers = useRef({ open: 0, close: 0 });
  // Set when focus is handed back to the ⓘ in code, so it doesn't reopen.
  const skipFocusOpen = useRef(false);

  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const hintId = `${baseId}-hint`;
  const pos = usePopoverPosition(open, anchorRef, { height: PANEL_H, minWidth: PANEL_W });
  const name = label || "this field";

  const clearTimers = useCallback(() => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
    setPinned(false);
  }, [clearTimers]);

  const show = useCallback((pin) => {
    clearTimers();
    if (closeActivePopover && closeActivePopover !== close) closeActivePopover();
    closeActivePopover = close;
    setHostLayer(hostLayerOf(anchorRef.current));
    setOpen(true);
    if (pin) setPinned(true);
  }, [clearTimers, close]);

  const focusAnchor = useCallback(() => {
    const el = anchorRef.current;
    if (!el || document.activeElement === el) return;
    // focus/focusin fire synchronously inside el.focus(), so the flag only
    // spans that call — a focus() that silently fails can't leave it stuck
    // and swallow the next real keyboard focus.
    skipFocusOpen.current = true;
    el.focus();
    skipFocusOpen.current = false;
  }, []);

  useEffect(() => {
    if (!open && closeActivePopover === close) closeActivePopover = null;
  }, [open, close]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.open);
      clearTimeout(t.close);
      if (closeActivePopover === close) closeActivePopover = null;
    };
  }, [close]);

  // Escape and outside presses, only while open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      const hadFocus = panelRef.current?.contains(document.activeElement) || document.activeElement === anchorRef.current;
      close();
      if (hadFocus) focusAnchor();
    };
    const onPointerDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, close, focusAnchor]);

  // No help for this field here (or the config entry went away while open).
  useEffect(() => {
    if (!help && open) close();
  }, [help, open, close]);

  if (!help) return null;
  const palette = TONES[tone] || TONES.default;
  // Only when Maya can take this exact question — never pre-fill one she'd cut off.
  const showAsk = !!help.question && help.question.length <= mayaLimit;

  const onPointerEnter = (e) => {
    if (e.pointerType === "touch") return;
    clearTimeout(timers.current.close);
    if (open) return;
    timers.current.open = setTimeout(() => show(false), OPEN_DELAY_MS);
  };

  const onPointerLeave = (e) => {
    if (e.pointerType === "touch") return;
    clearTimeout(timers.current.open);
    if (!open || pinned) return;
    timers.current.close = setTimeout(close, CLOSE_GRACE_MS);
  };

  const onAnchorClick = (e) => {
    e.preventDefault(); // never toggle or focus the labelled control
    if (open && pinned) close();
    else show(true);
  };

  const onAnchorFocus = (e) => {
    if (skipFocusOpen.current) return;
    if (isFocusVisible(e.currentTarget)) show(true);
  };

  const onAnchorKeyDown = (e) => {
    // Enter/Space activate the ⓘ; they must not also reach a row or form handler.
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    if (e.key === "Tab" && !e.shiftKey && open && askRef.current) {
      e.preventDefault();
      askRef.current.focus();
    }
  };

  const onAskKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      e.preventDefault();
      focusAnchor();
      return;
    }
    // Forward: put focus back on the ⓘ and let the browser's own Tab move on
    // from there, so the popover sits in the tab order right after its ⓘ.
    focusAnchor();
  };

  const onBlurWithin = (e) => {
    const next = e.relatedTarget;
    if (next && (anchorRef.current?.contains(next) || panelRef.current?.contains(next))) return;
    // A hover-opened popover isn't tied to focus; the pointer closes it.
    if (open && pinned) close();
  };

  const onAsk = () => {
    askMaya({ question: help.question, source: { surface, field }, layer: hostLayer });
    close();
  };

  return (
    <span className={`inline-flex shrink-0 align-middle ${overlay ? "w-0 overflow-visible" : ""} ${className}`}>
      <button
        ref={anchorRef}
        type="button"
        aria-label={ariaLabel || `What is ${name}?`}
        data-field-help=""
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={open ? hintId : undefined}
        onClick={onAnchorClick}
        onFocus={onAnchorFocus}
        onBlur={onBlurWithin}
        onKeyDown={onAnchorKeyDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className={`inline-flex shrink-0 items-center justify-center w-6 h-6 -my-1.5 ${overlay ? "-ml-1" : "ml-0.5"} rounded-full transition-colors focus:outline-none focus-visible:ring-2 ${palette.cls} ${open ? palette.active : palette.rest}`}
      >
        <HiInformationCircle className={ICON_SIZE[size] || ICON_SIZE.md} aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`About ${name}`}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onBlur={onBlurWithin}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, zIndex: popoverLayerFor(hostLayer) }}
          className="fixed max-w-[calc(100vw-16px)] rounded-xl border border-purple-100 bg-white p-3.5 shadow-xl text-left normal-case tracking-normal font-normal whitespace-normal animate-in fade-in zoom-in-95 duration-150"
        >
          <p id={hintId} className="text-[12.5px] leading-relaxed text-slate-600">{help.hint}</p>
          {showAsk && (
            <button
              ref={askRef}
              type="button"
              onClick={onAsk}
              onKeyDown={onAskKeyDown}
              className="mt-2 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-purple-700 transition-colors hover:bg-purple-50 hover:text-purple-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
            >
              <HiSparkles className="w-3.5 h-3.5" aria-hidden="true" /> Ask Maya about this
            </button>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}

/**
 * A label with its ⓘ glued to the last word, for data hosts (tile labels,
 * column headers, DetailGrid/DetailStats labels). The text still wraps as
 * before, but the icon can never land on a line of its own — which would make
 * the host taller. Without help for this workspace it returns the text
 * untouched, so shared components stay byte-for-byte the same elsewhere.
 *   help: { surface, field, label?, ariaLabel?, tone?, size?, overlay? }
 */
export function HelpLabel({ text, help }) {
  const workspace = useWorkspace();
  // Checked here too, so a label with no help in this workspace
  // keeps exactly its old DOM — no wrapper span around the last word.
  if (!help?.surface || !help?.field || !getFieldHelp(help.surface, help.field, workspace)) return text;
  const icon = <FieldHelp surface={help.surface} field={help.field} label={help.label || (typeof text === "string" ? text : undefined)} ariaLabel={help.ariaLabel} tone={help.tone} size={help.size} overlay={help.overlay} />;
  if (typeof text !== "string") return <>{text}{icon}</>;
  const cut = text.trimEnd().lastIndexOf(" ");
  const head = cut === -1 ? "" : text.slice(0, cut + 1);
  const last = cut === -1 ? text : text.slice(cut + 1);
  return <>{head}<span className="whitespace-nowrap">{last}{icon}</span></>;
}
