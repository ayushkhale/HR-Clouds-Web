// ─────────────────────────────────────────────────────────────────────────────
// settings/settingsDock.js — The page-level register of unsaved settings cards,
// and the two helpers that let the page point at one.
//
// WHY THE REGISTER IS THE ONLY SAVE ON THE PAGE. A tab can hold eleven cards
// and the page scrolls. Someone who changes the payday, then scrolls down to
// read the exit rules, has a saved-looking page with an unsaved change two
// screens above them — and the only thing that knew about it was a footer they
// can no longer see. This is the page-level answer to "is my work in?", which
// no per-card control can give.
//
// The cards used to have their own Save as well, and with one card dirty that
// showed two identical Save buttons at once (user report, 2026-10-10). The
// card footers now point here instead. So this is no longer a convenience over
// the cards' saves — it IS the save — but nothing about the requests changed:
// still one per group, under that group's own ETag, for the reason below.
//
// WHY "SAVE ALL" IS NOT ONE REQUEST. It fires ONE REQUEST PER GROUP, because
// decision D-S4 is a property of the gateway, not of this UI: one request, one
// group, one transaction, under that group's own `If-Match`. There is no
// endpoint that writes two groups, and inventing a client-side "transaction"
// over several would be a lie about what happens when the third one 412s. So
// each card still owns its ETag, its gates and its errors, and a card that
// fails says so in place while the others go through.
//
// GATED CARDS ARE NOT BATCHED. A high-risk group needs a written reason, and
// three reason dialogs cannot open at once. Those cards are left out of the
// sweep and the first one is opened on its own, so the person answers one
// question at a time with the right card's warnings in front of them.
//
// This lives in a .js file rather than beside the dock component because the
// hook and the two helpers are not components, and `react-refresh` is right to
// object to mixing them (§8).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { settleWithLimit } from "../utils/promisePool";

/** The DOM id a settings group card carries, so the page can scroll to it. */
export const groupCardId = (key) => `settings-group-${String(key).replace(/[^a-z0-9]+/gi, "-")}`;

/** Bring a card into view — used by the dock, and by a search hit. */
export function revealGroupCard(key) {
  if (typeof document === "undefined") return;
  const node = document.getElementById(groupCardId(key));
  if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * The register itself.
 *
 * Cards call `register(key, entry)` when they go dirty and `register(key, null)`
 * when they go clean or unmount — so switching tabs takes a card's entry with
 * it, and the dock can never claim unsaved changes in a card that is no longer
 * on screen.
 *
 * `entry` is `{ key, label, count, gated, save, discard }`. `save` and
 * `discard` must be STABLE across renders (the card wraps them over a ref);
 * a fresh identity per render would re-register on every keystroke.
 */
export default function useDirtyCards() {
  const [cards, setCards] = useState({});
  const [saving, setSaving] = useState(false);

  const register = useCallback((key, entry) => {
    setCards((current) => {
      if (!entry) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      const prev = current[key];
      // The same facts means the same object, so typing in one card doesn't
      // re-render the dock on every character.
      if (prev && prev.count === entry.count && prev.label === entry.label && prev.gated === entry.gated) {
        return current;
      }
      return { ...current, [key]: entry };
    });
  }, []);

  const list = Object.values(cards);
  const total = list.reduce((n, c) => n + c.count, 0);

  const saveAll = useCallback(async () => {
    const pending = Object.values(cards);
    if (pending.length === 0) return;
    const gated = pending.filter((c) => c.gated);
    const plain = pending.filter((c) => !c.gated);

    setSaving(true);
    try {
      // Different groups are different transactions, so they can go together —
      // capped, because this is a bulk write and not a race (§7).
      if (plain.length > 0) await settleWithLimit(plain, (card) => card.save(), { concurrency: 3 });
    } finally {
      setSaving(false);
    }

    // One reason dialog at a time, with that card in view behind it.
    if (gated.length > 0) {
      revealGroupCard(gated[0].key);
      gated[0].save();
    }
  }, [cards]);

  const discardAll = useCallback(() => {
    Object.values(cards).forEach((card) => card.discard());
  }, [cards]);

  /* A full page unload is the one navigation React Router can't tell us about,
     and it is the one that loses the most: a closed tab takes every unsaved
     card with it. In-app navigation keeps the edits only while the cards are
     mounted, which is why the dock names them loudly instead. */
  useEffect(() => {
    if (total === 0) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [total]);

  return { cards: list, total, saving, register, saveAll, discardAll };
}
