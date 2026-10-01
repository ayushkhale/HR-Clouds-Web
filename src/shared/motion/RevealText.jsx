import { useInView } from "./useInView";
import { useReducedMotion } from "./useReducedMotion";
import { EASE_ENTER, STAGGER } from "./tokens";

/* ─────────────────────────────────────────────────────────────────────────────
   RevealText — word-by-word masked reveal for headlines.

   Each word sits in an overflow-hidden mask and slides up from below it, so
   the line appears to be written rather than faded in. Restrained by design:
   words, never characters, and only on headlines worth the emphasis.

   Takes a plain string, not JSX. That is a deliberate limit — several headings
   on this site wrap part of the text in a gradient `bg-clip-text` span, and
   splitting those into per-word spans would restart the gradient on every
   word. Those headings use <Reveal> at element or line level instead.

   The mask needs vertical slack or it clips descenders (g, y, p). The padding
   is cancelled by an equal negative margin, so the text box is unchanged and
   nothing shifts.
──────────────────────────────────────────────────────────────────────────── */

function RevealText({
  as: Tag = "h2",
  text,
  delay = 0,
  stagger = STAGGER.tight,
  duration = 650,
  className = "",
  ...rest
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView({ skip: reduced });

  if (reduced) {
    return (
      <Tag ref={ref} className={className} {...rest}>
        {text}
      </Tag>
    );
  }

  const words = String(text).split(" ");

  return (
    <Tag ref={ref} className={className} {...rest}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-hidden align-bottom pb-[0.14em] -mb-[0.14em]"
        >
          <span
            className="inline-block"
            style={{
              transform: inView ? "translate3d(0, 0, 0)" : "translate3d(0, 110%, 0)",
              transition: `transform ${duration}ms ${EASE_ENTER} ${delay + i * stagger}ms`,
              willChange: inView ? undefined : "transform",
            }}
          >
            {word}
            {/* Non-breaking space keeps the gap inside the mask, so words don't
                collapse together while they're translated. */}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}

export default RevealText;
