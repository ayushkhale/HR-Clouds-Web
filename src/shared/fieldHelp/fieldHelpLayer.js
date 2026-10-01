// ─────────────────────────────────────────────────────────────────────────────
// fieldHelpLayer.js — how high the ⓘ popover and a raised Maya must sit to
// clear the dialog the ⓘ lives in.
//
// The employee forms all sit at z-150 or below, so phase 1 fixed the popover at
// z-155 and a raised Maya at z-160. Manager screens broke that: the claim
// review (ClaimDecisionDialog) is z-160 and the recommendation and document
// request dialogs are z-170, so a fixed layer rendered the popover — and Maya
// opened from it — *behind* the dialog that asked.
//
// Why relative to the host and not one global bump: a global z-180 would also
// put Maya over an AttachmentViewer (165) or ReasonDialog (170) opened after
// her, breaking the stack in CLAUDE.md §3. Relative to the host, both go only
// as high as the dialog that hosts the ⓘ needs — every employee host still
// resolves to the old 155/160.
//
// The host layer is the z-index of the *outermost* positioned ancestor that has
// one: a dialog nested inside another paints at its outer parent's layer, and
// the popover and Maya are portalled/mounted at the root, so that is the layer
// they compete with. Both stay below the toasts at z-200.
// ─────────────────────────────────────────────────────────────────────────────

export const POPOVER_LAYER = 155;
export const MAYA_RAISED_LAYER = 160;
const LAYER_CEILING = 199;

/** Root-level z-index of whatever positioned layer contains `el`; 0 when none. */
export function hostLayerOf(el) {
  let layer = 0;
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.position === "static") continue;
    const z = parseInt(style.zIndex, 10);
    if (Number.isFinite(z)) layer = z; // keeps overwriting, so the outermost wins
  }
  return layer;
}

const clamp = (n) => Math.min(LAYER_CEILING, n);

/** The popover's z-index for an ⓘ inside a layer at `hostLayer`. */
export const popoverLayerFor = (hostLayer = 0) => clamp(Math.max(POPOVER_LAYER, hostLayer + 5));

/** Maya's z-index when raised by an "Ask Maya" from a layer at `hostLayer`. */
export const mayaLayerFor = (hostLayer = 0) => clamp(Math.max(MAYA_RAISED_LAYER, hostLayer + 10));
