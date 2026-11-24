import playBadge from "../../assets/app/google-play-badge.png";
import { PLAY_STORE_URL } from "../appMeta";

/* ─────────────────────────────────────────────────────────────────────────────
   StoreBadge — the official "Get it on Google Play" artwork, linked.

   Google's badge may not be redrawn or recoloured, so this is the real asset
   (src/assets/app/google-play-badge.png) rather than markup imitating it. It
   is sized by HEIGHT only; the width follows from the aspect ratio, which is
   what keeps the lockup legal and un-stretched. Intrinsic dimensions are
   declared so the row reserves its box before the file decodes.

   Traps:
   - The badge renders only when appMeta has a URL. No listing, no badge —
     never a button that goes nowhere.
   - It belongs in the hero and nowhere else. One place to download the app is
     the point; repeating the lockup down the page made it wallpaper rather
     than a call to action.
   ───────────────────────────────────────────────────────────────────────────── */

function StoreBadge({ className = "", height = "h-11 sm:h-12" }) {
  if (!PLAY_STORE_URL) return null;

  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Get HR Clouds on Google Play"
      className={`inline-block transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${className}`}
    >
      <img
        src={playBadge}
        alt="Get it on Google Play"
        width={3840}
        height={1138}
        className={`${height} w-auto`}
      />
    </a>
  );
}

export default StoreBadge;
