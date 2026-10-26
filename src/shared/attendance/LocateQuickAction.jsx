// ─────────────────────────────────────────────────────────────────────────────
// LocateQuickAction — the one-press "ask where they are" affordance that sits
// in an attendance list, for HR and for the manager alike.
//
// Both halves of it live here so the two tables can never drift: the cell HR
// presses and the cell a manager presses are the same component, and the
// dialog they raise is mounted the same way. The decision about whether the
// column exists at all is in `locateColumn.js` — read that header first.
//
// ─── WHY THE ROW STAYS CLICKABLE ──────────────────────────────────────────
// The row opens the day's log (§3). This button sits inside it, so the press
// stops propagating; `rowPreviewProps` guards inner buttons for the rows that
// use it, and these two tables hand-roll their row handler, which does not.
// ─────────────────────────────────────────────────────────────────────────────

import { HiLocationMarker } from "react-icons/hi";
import LocateDialog from "./LocateDialog";

/**
 * The cell itself. Renders the button when the row qualifies and an empty cell
 * when it doesn't — never a disabled button, which would read as "broken" for
 * someone who has simply not clocked in yet (§5: no action → empty cell).
 */
export function LocateCell({ column, row, name }) {
  if (!column.canAsk(row)) return <td className="px-5 py-3.5" />;
  return (
    <td className="px-5 py-3.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); column.ask(row, name); }}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-100 bg-purple-50/60 text-[11px] font-bold text-purple-700 hover:bg-purple-100 hover:border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-200 transition-colors"
        aria-label={name ? `Ask ${name} where they are` : "Ask where they are"}
        title="Ask this person’s phone where it is right now"
      >
        <HiLocationMarker className="w-3.5 h-3.5" />
        Ask
      </button>
    </td>
  );
}

/**
 * The dialog the cells raise. Mounted once per table, outside the `<table>`,
 * so it is a sibling of the rows rather than a child of one.
 */
export default function LocateDialogHost({ column }) {
  if (!column.target) return null;
  return (
    <LocateDialog
      userId={column.target.userId}
      name={column.target.name}
      person={column.target.row}
      viewer={column.viewer}
      onClose={column.close}
    />
  );
}
