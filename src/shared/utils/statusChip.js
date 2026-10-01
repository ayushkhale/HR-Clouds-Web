// ─────────────────────────────────────────────────────────────────────────────
// statusChip.js — The one shape a status takes on screen, for places that
// can't use <StatusBadge> (attendance/ui.jsx) because their tones come from
// their own *Meta maps.
//
// Payroll drew its statuses as square UPPERCASE tags ("APPROVED") while
// attendance and documents used a rounded pill with a coloured dot
// ("• Approved"), so the same word looked different from one screen to the
// next. This is StatusBadge's shape; the dot takes the chip's own text colour,
// so every existing tone map keeps working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_CHIP =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap " +
  "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:opacity-60";
