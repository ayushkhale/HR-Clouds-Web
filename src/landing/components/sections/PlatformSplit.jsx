import { Link } from "react-router-dom";
import { Reveal } from "../../../shared/motion";
import { PLATFORMS, PLAY_STORE_URL, PLATFORM_ICONS } from "../../appMeta";

/* ─────────────────────────────────────────────────────────────────────────────
   PlatformSplit — "one account, two places", answered before anyone asks it.

   A visitor who has just seen a phone in the hero needs to know in one glance
   that payroll still runs on a big screen, and an HR buyer needs to know their
   people get an app. Two cards, same shape, neither styled as the lesser one:
   the app card links to the store, the web card to sign-in (the Play badge
   itself belongs to the hero alone). The copy lives in appMeta (PLATFORMS) so
   the list can't drift from the hero's.

   Styling is deliberately Apple-ish, and the rules behind that are what keep
   it from drifting back into a generic feature grid:
     · one soft panel, no drop shadow — it separates itself from the white page
       by tone alone. The tint is purple, not neutral grey: the 3D icons that
       head the cards are saturated purple, and a colourless panel under them
       read as two unrelated things stuck together;
     · everything centred, with the product icon carrying the top of the card;
     · few, large type sizes and a lot of air, rather than many small ones;
     · the capability list is quiet (small, grey, evenly spaced) because it is
       scanned, not read;
     · one link per card, styled as text with a chevron, never a filled button.
   Hover lifts the card a touch and nothing else — no shadow bloom, no scale.
   ───────────────────────────────────────────────────────────────────────────── */

function PlatformCard({ platform, index }) {
  const icon = PLATFORM_ICONS[platform.id];
  const isApp = platform.id === "app";
  const href = isApp ? PLAY_STORE_URL : "/auth/login";
  const label = isApp ? "Download for Android" : "Open the web workspace";

  // The store link is external and may not exist yet; the web link is internal
  // and always does. Same shape either way, so the two cards end level.
  const action = isApp ? (
    PLAY_STORE_URL && (
      <a href={href} target="_blank" rel="noreferrer" className={LINK}>
        {label}
        <Chevron />
      </a>
    )
  ) : (
    <Link to={href} className={LINK}>
      {label}
      <Chevron />
    </Link>
  );

  return (
    <Reveal
      as="li"
      variant="rise"
      index={index}
      className="flex h-full flex-col items-center rounded-[2rem] bg-gradient-to-b from-purple-50 to-white ring-1 ring-purple-100 px-8 py-12 sm:px-12 sm:py-16 text-center transition-transform duration-300 ease-out hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/* The icon is the card's masthead, so it is large and unframed — a
          plate or a tinted tile behind it would halve its size. */}
      <img
        src={icon.src}
        alt=""
        width={450}
        height={450}
        className="h-24 w-24 sm:h-28 sm:w-28 object-contain"
      />

      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-purple-700">
        {platform.eyebrow}
      </p>
      <h3 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-primary-800">
        {platform.title}
      </h3>
      <p className="mt-4 max-w-md text-base sm:text-lg leading-relaxed text-primary-300">
        {platform.body}
      </p>

      {/* Capabilities as a quiet centred row, not a bulleted list: ticks and
          left-aligned rows turned this into a comparison table, which invites
          the reader to count features instead of picking a surface. */}
      <ul className="mt-8 flex flex-wrap justify-center gap-x-3 gap-y-2">
        {platform.points.map((point) => (
          <li
            key={point}
            className="rounded-full bg-white/80 ring-1 ring-purple-100 px-4 py-1.5 text-sm font-medium text-primary-400"
          >
            {point}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">{action}</div>
    </Reveal>
  );
}

const LINK =
  "group inline-flex items-center gap-1.5 text-lg font-medium text-purple-700 transition-colors duration-200 hover:text-purple-500";

function Chevron() {
  return (
    <span
      aria-hidden="true"
      className="text-xl leading-none transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transform-none"
    >
      ›
    </span>
  );
}

function PlatformSplit() {
  return (
    <section className="m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24 py-12 sm:py-16 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal
          as="h2"
          className="font-bold text-[2rem]/[2.5rem] text-primary-800 sm:text-4xl md:text-5xl/[3.5rem] tracking-tight"
        >
          One account,{" "}
          <span className="underline decoration-8 decoration-purple-500 underline-offset-2">
            two ways
          </span>{" "}
          to work
        </Reveal>
        <Reveal as="p" delay={110} className="mt-4 text-base sm:text-lg text-primary-300">
          Your team signs in once. What they see depends on where they are — not on buying anything.
        </Reveal>
      </div>

      <ul className="mt-10 sm:mt-14 grid gap-5 lg:grid-cols-2">
        {PLATFORMS.map((platform, i) => (
          <PlatformCard key={platform.id} platform={platform} index={i} />
        ))}
      </ul>
    </section>
  );
}

export default PlatformSplit;
