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
 * @param {React.ReactNode} [props.rightContent]  used when there is no art
 */
function PageHeader({ badgeText, badgeIcon: BadgeIcon, title, subtitle, image, rightContent }) {
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
          className="relative z-10 shrink-0 h-28 sm:h-40 md:h-48 w-auto max-w-[9rem] sm:max-w-[13rem] md:max-w-[16rem] object-contain object-bottom drop-shadow-2xl sm:mr-8 md:mr-16 -mb-6 sm:-mb-8"
        />
      ) : rightContent ? (
        <div className="relative z-10 flex shrink-0 w-full sm:w-auto">{rightContent}</div>
      ) : null}
    </div>
  );
}

export default PageHeader;
