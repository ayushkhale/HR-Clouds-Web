// ─────────────────────────────────────────────────────────────────────────────
// ScreenHeader.jsx — the QUIET heading for an ordinary working screen.
//
// ─── WHY THIS EXISTS BESIDE PageHeader ─────────────────────────────────────
// `PageHeader` is the signature purple hero, and it stays exactly that: the
// thing a DASHBOARD opens with, identical in every workspace (§5). It was
// never meant to top every screen in the product. Putting it on a setup
// checklist and a device list filled a third of both pages with saturated
// purple before a single word of the actual work, and the house palette stops
// reading as purple at all once everything is (user decision, 21 Oct 2026).
//
// So this is the same INFORMATION in a quiet frame: white card, slate type,
// purple kept for the one icon tile, the eyebrow and the figures that matter.
// Colour is spent on what the reader should look at rather than on the
// furniture around it. Use `PageHeader` for a dashboard and this everywhere
// else; a screen does not need its own third style.
//
// ─── THE RIGHT-HAND SIDE ───────────────────────────────────────────────────
// `rightContent` is for figures that belong to the heading — a readiness
// ring, a slot meter — and the actions that change them. It sits on a hairline
// divider on a wide screen and stacks underneath on a narrow one. Because the
// card is light, anything in it uses NORMAL tones: an ⓘ in here is a default
// `FieldHelp`, never `tone="onDark"` (§10).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {React.ComponentType} [props.icon]    one glyph for the screen, in a tinted tile
 * @param {string} [props.eyebrow]              the small line above the title
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]    one sentence, what the screen is for
 * @param {React.ReactNode} [props.badge]       live state beside the title (a tone pill)
 * @param {React.ReactNode} [props.rightContent] figures and their actions
 */
export default function ScreenHeader({ icon: Icon, eyebrow, title, subtitle, badge, rightContent }) {
  return (
    <header className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
      <div className="min-w-0 flex-1 flex items-start gap-4">
        {Icon && (
          <span className="shrink-0 w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center" aria-hidden="true">
            <Icon className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600 mb-0.5">{eyebrow}</p>
          )}
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-slate-500 leading-relaxed mt-1 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </div>

      {rightContent && (
        <div className="shrink-0 w-full lg:w-auto lg:pl-8 lg:border-l lg:border-slate-100">
          {rightContent}
        </div>
      )}
    </header>
  );
}
