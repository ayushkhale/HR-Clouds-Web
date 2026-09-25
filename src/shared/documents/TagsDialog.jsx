// ─────────────────────────────────────────────────────────────────────────────
// documents/TagsDialog.jsx — Put labels on a document so it can be found again
// (#121).
//
// Tags are the answer to a question the fixed fields can't handle: "everything
// we pulled for the March audit", "the visas legal is tracking". A document
// type is decided once and belongs to the organisation; a tag is a scratch note
// HR writes on the folder.
//
// The one thing this dialog has to be clear about is that saving REPLACES the
// whole set — the server does not merge. So the current tags are loaded into
// the editor, removing one really does remove it, and the footer says what will
// be saved rather than what was added.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiHashtag, HiInformationCircle, HiPlus, HiX } from "react-icons/hi";
import { documentErrorMessage } from "../utils/documentErrors";
import {
  TAGS_MAX_PER_DOCUMENT, TAG_MAX_LENGTH, normalizeTag, sameTags, tagProblem, tagsProblem,
} from "./reportMeta";
import { TagChips } from "./phase5Ui";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";

/**
 * @param {object} props
 * @param {object} props.doc                the document being tagged (`id`, `title`, `tags`)
 * @param {string[]} [props.suggestions]    tags already in use elsewhere, offered as one-click adds
 * @param {(id: string, tags: string[]) => Promise} props.save
 * @param {(tags: string[]) => void} props.onDone
 * @param {() => void} props.onClose
 */
export default function TagsDialog({ doc, suggestions = [], save, onDone, onClose }) {
  const original = useMemo(() => (Array.isArray(doc?.tags) ? doc.tags : []), [doc]);
  const [tags, setTags] = useState(original);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const pending = normalizeTag(draft);
  const pendingProblem = pending ? tagProblem(pending) : "";
  const duplicate = !!pending && tags.includes(pending);
  const full = tags.length >= TAGS_MAX_PER_DOCUMENT;

  const add = () => {
    if (!pending || pendingProblem || duplicate || full) return;
    setTags((current) => [...current, pending]);
    setDraft("");
    setError("");
  };

  const onKeyDown = (e) => {
    // Enter and comma both commit a tag; Backspace on an empty box takes the
    // last one off, which is how every tag field people already use behaves.
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
      return;
    }
    if (e.key === "Backspace" && !draft && tags.length) {
      setTags((current) => current.slice(0, -1));
    }
  };

  const setProblem = tagsProblem(tags);
  const dirty = !sameTags(tags, original);
  const unused = suggestions.filter((tag) => !tags.includes(tag)).slice(0, 12);

  const submit = async (e) => {
    e.preventDefault();
    if (saving || setProblem) return;
    // A tag left in the box is almost always meant to be saved, so it is
    // committed rather than silently dropped.
    const finalTags = pending && !pendingProblem && !duplicate && !full ? [...tags, pending] : tags;
    if (sameTags(finalTags, original)) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await save(doc.id, finalTags);
      onDone?.(finalTags);
    } catch (err) {
      setError(documentErrorMessage(err, "Couldn't save the tags."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Tags" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiHashtag className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">Tags</h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{doc?.title || "This document"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <span className={LABEL}>On this document</span>
            <div className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <TagChips
                tags={tags}
                onRemove={(tag) => setTags((current) => current.filter((t) => t !== tag))}
                empty={<span className="text-xs text-slate-400">No tags yet.</span>}
              />
            </div>
          </div>

          <div>
            <label htmlFor="tag-input" className={LABEL}>Add a tag</label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="tag-input"
                type="text"
                value={draft}
                maxLength={TAG_MAX_LENGTH}
                disabled={saving || full}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={full ? `That's all ${TAGS_MAX_PER_DOCUMENT}` : "e.g. audit 2026"}
                className={FIELD}
                autoComplete="off"
              />
              <button type="button" onClick={add} disabled={!pending || !!pendingProblem || duplicate || full || saving} className={`${SECONDARY_BTN} shrink-0 !px-3`} aria-label="Add this tag">
                <HiPlus className="w-4 h-4" />
              </button>
            </div>
            <p className={`text-[11px] mt-1.5 leading-relaxed ${pendingProblem || duplicate ? "font-semibold text-rose-600" : "text-slate-400"}`}>
              {pendingProblem
                || (duplicate ? "That tag is already on this document." : "")
                || (full ? `A document can hold ${TAGS_MAX_PER_DOCUMENT} tags. Remove one to add another.` : `Press Enter after each one. Lowercase letters, numbers, spaces, hyphens and underscores — up to ${TAGS_MAX_PER_DOCUMENT} tags.`)}
            </p>
          </div>

          {unused.length > 0 && (
            <div>
              <span className={LABEL}>Already used elsewhere</span>
              <TagChips tags={unused} onPick={(tag) => !full && setTags((current) => (current.includes(tag) ? current : [...current, tag]))} />
              <p className="text-[10px] text-slate-400 mt-1.5">Reusing a tag is what makes it worth having — the same word on twenty documents is a list you can pull.</p>
            </div>
          )}

          <p className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
            <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
            <span>Saving replaces every tag on this document with what’s above — it isn’t added to the existing ones. The change is recorded in the document’s history, with the old tags and the new.</span>
          </p>

          {(error || setProblem) && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5" role="alert">{error || setProblem}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="mr-auto text-[11px] text-slate-400">{dirty ? "Unsaved changes" : "Nothing changed yet"}</p>
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={saving || !!setProblem} className={PRIMARY_BTN}>
            {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <HiHashtag className="w-4 h-4" />}
            {saving ? "Saving…" : "Save tags"}
          </button>
        </div>
      </form>
    </div>
  );
}
