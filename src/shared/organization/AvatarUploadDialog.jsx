// ─────────────────────────────────────────────────────────────────────────────
// organization/AvatarUploadDialog.jsx — Change your profile photo: choose a
// picture, frame it in the circle, save. Opened from the camera button on the
// avatar in My Profile (every workspace — the endpoint is self-only and open
// to every tenant role).
//
// A form, not a record inspector (CLAUDE.md §3 excludes pickers and forms from
// DetailDialog), and a single-purpose one, so it stays narrow.
//
// The three screens it moves through:
//   choose  — drop zone / file picker, with what's accepted spelled out
//   frame   — drag to position, slider (or +/−, arrow keys) to zoom; a small
//             live preview shows it at the size it appears in the top bar
//   saving  — the three steps of the upload, named in plain words
// A failure drops back to "frame" with the picture still in place, so trying
// again is one click — the handshake starts over (see avatarUpload.js).
//
// Nothing is uploaded until Save: choosing and framing are local. The object
// URL made for the preview is revoked when the picture changes or the dialog
// closes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiCamera, HiX, HiPhotograph, HiMinus, HiPlus, HiRefresh, HiCheck, HiExclamationCircle } from "react-icons/hi";
import GenderAvatar from "../components/GenderAvatar";
import { AVATAR_TYPES, avatarFileProblem, avatarUploadMessage, cropAvatar, loadImage, uploadAvatar } from "./avatarUpload";

const FRAME = 256;
const MAX_ZOOM = 4;
const STEPS = [
  { key: "issue", label: "Getting a secure upload link" },
  { key: "put", label: "Sending your picture" },
  { key: "confirm", label: "Saving it to your profile" },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function AvatarUploadDialog({ profile, onClose, onSaved }) {
  const [phase, setPhase] = useState("choose"); // choose | frame | saving
  const [source, setSource] = useState(null); // { file, img, url }
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [stage, setStage] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const drag = useRef(null);
  const busy = phase === "saving";
  const busyRef = useRef(false);
  busyRef.current = busy;

  // Scale at zoom 1 is "cover": the short side exactly fills the circle.
  const base = source ? Math.max(FRAME / source.img.naturalWidth, FRAME / source.img.naturalHeight) : 1;
  const scale = base * zoom;
  const drawnW = source ? source.img.naturalWidth * scale : FRAME;
  const drawnH = source ? source.img.naturalHeight * scale : FRAME;

  const bound = useCallback((pos, w, h) => ({
    x: clamp(pos.x, FRAME - w, 0),
    y: clamp(pos.y, FRAME - h, 0),
  }), []);

  // Free the preview URL when the picture changes or the dialog goes away.
  useEffect(() => () => { if (source?.url) URL.revokeObjectURL(source.url); }, [source]);

  // Escape closes — but never mid-upload, where closing would hide a save in flight.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busyRef.current) onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  async function takeFile(file) {
    setError(null);
    const problem = avatarFileProblem(file);
    if (problem) { setError(problem); return; }
    try {
      const { img, url } = await loadImage(file);
      const s = Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight);
      setSource({ file, img, url });
      setZoom(1);
      setOffset({ x: (FRAME - img.naturalWidth * s) / 2, y: (FRAME - img.naturalHeight * s) / 2 });
      setPhase("frame");
    } catch (err) {
      setError(err.message);
    }
  }

  function changeZoom(next) {
    if (!source) return;
    const z = clamp(next, 1, MAX_ZOOM);
    const s1 = base * zoom;
    const s2 = base * z;
    // Zoom around the centre of the circle, so what you're looking at stays put.
    const cx = (FRAME / 2 - offset.x) / s1;
    const cy = (FRAME / 2 - offset.y) / s1;
    setZoom(z);
    setOffset(bound({ x: FRAME / 2 - cx * s2, y: FRAME / 2 - cy * s2 }, source.img.naturalWidth * s2, source.img.naturalHeight * s2));
  }

  const onPointerDown = (e) => {
    if (busy || !source) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOffset(bound({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }, drawnW, drawnH));
  };
  const onPointerUp = () => { drag.current = null; };
  const onFrameKey = (e) => {
    const step = e.shiftKey ? 24 : 6;
    const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (move) { e.preventDefault(); setOffset((o) => bound({ x: o.x + move[0], y: o.y + move[1] }, drawnW, drawnH)); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); changeZoom(zoom + 0.2); }
    else if (e.key === "-") { e.preventDefault(); changeZoom(zoom - 0.2); }
  };

  async function save() {
    if (!source) return;
    setError(null);
    setPhase("saving");
    setStage("issue");
    try {
      const file = await cropAvatar(source.img, { x: offset.x, y: offset.y, scale, frame: FRAME }, source.file);
      const updated = await uploadAvatar(file, setStage);
      onSaved(updated);
    } catch (err) {
      setError(avatarUploadMessage(err));
      setPhase("frame");
      setStage(null);
    }
  }

  const imgStyle = (k = 1) => ({
    position: "absolute",
    left: offset.x * k,
    top: offset.y * k,
    width: drawnW * k,
    height: drawnH * k,
    maxWidth: "none",
  });

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-dialog-title"
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-md flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiCamera className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h3 id="avatar-dialog-title" className="text-base font-bold text-slate-900">Change profile photo</h3>
              <p className="text-xs text-slate-500">Colleagues see it on the org chart, the directory and your profile.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) takeFile(f); }}
          />

          {phase === "choose" && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="w-12 h-12 rounded-full overflow-hidden bg-purple-50 shrink-0 text-base ring-2 ring-white shadow-sm">
                  <GenderAvatar person={profile} name={profile?.name || profile?.email} />
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">This is how you appear now. A clear, front-facing photo helps people recognise you.</p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) takeFile(f); }}
                className={`w-full flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-2xl border-2 border-dashed transition-colors outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                  dragOver ? "border-purple-500 bg-purple-50" : "border-purple-200 bg-purple-50/30 hover:bg-purple-50 hover:border-purple-300"
                }`}
              >
                <span className="w-14 h-14 rounded-2xl bg-white shadow-sm text-purple-600 flex items-center justify-center"><HiPhotograph className="w-7 h-7" /></span>
                <span className="text-sm font-bold text-slate-800">Choose a picture <span className="font-medium text-slate-500">or drop it here</span></span>
                <span className="text-xs text-slate-500">PNG, JPG or WebP. You’ll frame it next.</span>
              </button>
            </div>
          )}

          {(phase === "frame" || phase === "saving") && source && (
            <div className="flex flex-col items-center gap-5">
              <div
                className={`relative rounded-full overflow-hidden bg-slate-100 shadow-inner ring-4 ring-purple-100 touch-none select-none outline-none focus-visible:ring-purple-400 ${busy ? "opacity-70" : "cursor-grab active:cursor-grabbing"}`}
                style={{ width: FRAME, height: FRAME }}
                tabIndex={busy ? -1 : 0}
                role="img"
                aria-label="Your picture, framed. Drag or use the arrow keys to move it; plus and minus to zoom."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onFrameKey}
              >
                <img src={source.url} alt="" draggable={false} style={imgStyle()} />
              </div>

              {phase === "frame" && (
                <div className="w-full flex items-center gap-3">
                  <button type="button" onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Zoom out" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center shrink-0">
                    <HiMinus className="w-4 h-4" />
                  </button>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => changeZoom(Number(e.target.value))}
                    aria-label="Zoom"
                    className="flex-1 accent-purple-600"
                  />
                  <button type="button" onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center shrink-0">
                    <HiPlus className="w-4 h-4" />
                  </button>
                  {/* How it will look at top-bar size. */}
                  <span className="relative w-10 h-10 rounded-full overflow-hidden bg-slate-100 ring-2 ring-white shadow shrink-0" aria-hidden="true">
                    <img src={source.url} alt="" draggable={false} style={imgStyle(40 / FRAME)} />
                  </span>
                </div>
              )}

              {phase === "saving" && (
                <ol className="w-full space-y-2" aria-live="polite">
                  {STEPS.map((s, i) => {
                    const at = STEPS.findIndex((x) => x.key === stage);
                    const done = i < at;
                    const now = i === at;
                    return (
                      <li key={s.key} className={`flex items-center gap-3 text-sm ${done ? "text-slate-500" : now ? "text-slate-900 font-semibold" : "text-slate-400"}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-violet-100 text-violet-600" : now ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                          {done ? <HiCheck className="w-3.5 h-3.5" /> : now ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                        </span>
                        {s.label}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              <HiExclamationCircle className="w-5 h-5 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          {phase === "frame" && (
            <button type="button" onClick={() => inputRef.current?.click()} className="sm:mr-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors">
              <HiRefresh className="w-4 h-4" /> Choose another
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 sm:ml-auto">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={phase !== "frame"}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiCheck className="w-4 h-4" />}
            {busy ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
