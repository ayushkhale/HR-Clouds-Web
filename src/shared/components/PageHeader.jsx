// ─────────────────────────────────────────────────────────────────────────────
// PageHeader.jsx — The signature purple hero banner. Every role's dashboard
// opens with it, and it must be the SAME SIZE in every one of them: it is the
// first thing anybody sees, and a workspace whose banner is visibly shorter
// reads as the lesser product. (A manager can be promoted to HR — the two have
// to feel like one thing.)
//
// That is why the decorative art is sized by HEIGHT (`h-*`), not width.
// Sizing by width was the original bug: the height then fell out of whatever
// aspect ratio each role's asset happened to have, so at `md` HR's 4:3 render
// and the manager's square one both came to 12rem while the employee's 16:9
// photo came to 6.76rem — a banner 5rem shorter for no reason anybody chose.
// With a fixed box height and `object-contain`, a wide asset letterboxes inside
// the box instead of shrinking the banner, so the three stay identical whatever
// art is dropped in later. `max-w-*` stops a very wide asset eating the text.
//
// `imageAlign` is how a WIDE asset gets fixed. The default treatment assumes a
// cut-out character standing on its own baseline, which is why the art bleeds
// off the bottom edge. A letterboxed photo or scene has no baseline, so the
// bleed crops real picture and the art hangs low with dead space above it —
// which is what the employee banner looked like. `imageAlign="center"` drops
// the bleed and centres the art in its box instead, and takes the box height
// down one step to pay for the margin it no longer has, so the BANNER height is
// unchanged: 7rem − 1.5rem = 5.5rem, 10rem − 2rem = 8rem (sm:h-32), and
// 12rem − 2rem = 10rem (md:h-40). Change one of those numbers and you must
// change its partner, or this role's banner stops matching the others.
//
// New header information goes INSIDE this banner rather than above or below it,
// and at the same size in every role.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {string} [props.badgeText]   the small pill above the greeting
 * @param {React.ComponentType} [props.badgeIcon]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {string} [props.image]       decorative art, bled off the bottom edge
 * @param {"bottom"|"center"} [props.imageAlign]  "center" for a wide/letterboxed
 *   asset that has no baseline to stand on; keeps the banner the same height
 * @param {React.ReactNode} [props.rightContent]  used when there is no art
 */
function PageHeader({ badgeText, badgeIcon: BadgeIcon, title, subtitle, image, imageAlign = "bottom", rightContent }) {
  return (
    <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
      <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
      <div className="relative z-10 max-w-2xl space-y-1">
        {badgeText && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/20">
            {BadgeIcon && <BadgeIcon className="w-3 h-3 text-purple-200" />} {badgeText}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-purple-100/90 font-normal leading-relaxed">{subtitle}</p>
        )}
      </div>
      {image ? (
        // The art carries no information the heading doesn't, so it is hidden
        // from screen readers rather than given a made-up description.
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className={`relative z-10 shrink-0 w-auto max-w-[9rem] sm:max-w-[13rem] md:max-w-[16rem] object-contain drop-shadow-2xl sm:mr-8 md:mr-16 ${imageAlign === "center"
            ? "h-[5.5rem] sm:h-32 md:h-40 object-center"
            : "h-28 sm:h-40 md:h-48 object-bottom -mb-6 sm:-mb-8"
            }`}
        />
      ) : rightContent ? (
        <div className="relative z-10 flex shrink-0 w-full sm:w-auto">{rightContent}</div>
      ) : null}
    </div>
  );
}

export default PageHeader;
