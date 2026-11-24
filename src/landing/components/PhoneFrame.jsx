/* ─────────────────────────────────────────────────────────────────────────────
   PhoneFrame — the floating phone that replaced the 24/7 badge in the hero.

   The real screenshot lands later, so the frame is drawn in markup and the
   image is optional: pass `src` from appMeta and it fills the screen; pass
   nothing and the same handset renders with a quiet placeholder inside it. The
   box is identical either way, so dropping the file in never reflows the hero
   (§5 — design the loading state, never a blank hole).

   Motion: `animate-float` sits on this node. Any parallax belongs on a wrapper
   — two transforms on one node silently discard each other.
   ───────────────────────────────────────────────────────────────────────────── */

function PhoneFrame({ src, alt = "The HR Clouds app on a phone", className = "", float = true }) {
  return (
    <div
      className={`relative mx-auto aspect-[9/19] w-[13.5rem] sm:w-[15rem] lg:w-[16rem] ${
        float ? "animate-float motion-reduce:animate-none" : ""
      } ${className}`}
    >
      {/* The glow behind the handset — purple, soft, and purely decorative. */}
      <div
        aria-hidden="true"
        className="absolute -inset-10 -z-10 rounded-full bg-gradient-to-t from-purple-300/50 to-purple-100/0 blur-3xl"
      />

      {/* Body: outer shell, then the screen inset, so the bezel reads as glass. */}
      <div className="h-full w-full rounded-[2.5rem] border border-white/60 bg-primary-800 p-[0.4rem] shadow-[0_30px_70px_-20px_rgba(30,27,34,0.55)]">
        <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-white">
          {/* Notch / speaker bar, drawn on top of whatever fills the screen. */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-primary-800"
          />

          {src ? (
            <img src={src} alt={alt} className="h-full w-full object-cover" />
          ) : (
            /* Placeholder: the shape of an app screen, not a grey box, so the
               hero already reads as a product before the shot exists. */
            <div className="flex h-full w-full flex-col gap-3 bg-gradient-to-b from-purple-50 to-white p-4 pt-10">
              <div className="h-20 rounded-2xl bg-gradient-to-t from-purple-500 to-purple-200" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 rounded-xl bg-purple-100" />
                <div className="h-16 rounded-xl bg-purple-100" />
              </div>
              <div className="flex-1 rounded-2xl bg-gray-100" />
              <div className="h-10 rounded-full bg-primary-800/90" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PhoneFrame;
