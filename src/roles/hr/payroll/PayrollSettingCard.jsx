// ─────────────────────────────────────────────────────────────────────────────
// PayrollSettingCard.jsx — one card of payroll settings, in the shape the
// settings hub's cards have.
//
// ─── WHY THIS IS NOT `SettingsGroupForm` ───────────────────────────────────
// It looks like it and is meant to: same shell, same header, same shelves,
// same field grid, same tokens out of settingsText, same ⓘ wiring. Somebody
// who has used Settings should not be able to tell which component drew this
// (user, 15 Oct 2026: "we have to make the UI/UX of the payroll to the
// settings UI/UX").
//
// What it can't share is the MACHINERY. `SettingsGroupForm` is a form over the
// settings gateway: it holds its own edits, saves its own group with its own
// ETag through `settingsAPI`, handles 412 conflicts, and asks for a written
// reason when the catalogue marks a setting high-risk. Payroll Settings is one
// partial `PUT /payroll/hr/settings` for the whole page (registry #23) with no
// ETag, no per-group write and no reason gate. Driving that component from
// here would have meant inventing an etag and a group `writable` flag to get
// past its own guards — a lie about the contract, in a component eleven other
// cards depend on. So the layout is shared through the SAME PARTS (SettingInput,
// fieldShelves, fieldSpan, settingsText, settingsBlurbs) and the state stays
// where this page's save already is.
//
// This card therefore holds NO state: the page owns every value, the dirty
// set, the problems and which cards are open. That is also what makes one
// Discard put the whole page back.
//
// ─── WHAT IS DELIBERATELY NOT COPIED FROM THE HUB CARD ─────────────────────
//   · THE "CUSTOMISED" / "DEFAULT" PILL. The hub knows which settings are off
//     their shipped default because #244 tells it per group. This endpoint
//     doesn't, and a pill computed from defaults typed into our own catalogue
//     would be a guess about the server's column defaults (see
//     payrollSettingsCatalogue.js). "N unsaved" is the one status we can
//     stand behind.
//   · THE RISK MARK AND THE "needs a reason" ⓘ. Both describe the gateway's
//     gates. Nothing here asks for a written reason, so a rose mark promising
//     one would be false. The cautions still get read out — in the one confirm
//     before the save (see the page).
//   · "Last changed". #22 returns no `updated_at` for the singleton.
//   · A per-card footer Save. There is one save on this page and it is the
//     dock, for the reason the hub's own footer comment gives.
// ─────────────────────────────────────────────────────────────────────────────

import { HiChevronDown } from "react-icons/hi";
import FieldHelp from "../../../shared/fieldHelp/FieldHelp";
import { TONE_CLASSES } from "../../../shared/attendance/enums";
import {
  displaySettingValue, fieldShelves, fieldSpan, isSwitchControl, orderFields, rangeHint,
} from "../../../shared/settings/settingsMeta";
import { settingLabel } from "../../../shared/settings/settingsBlurbs";
import {
  BLURB, CARD_TITLE, FIELD_LABEL, META, SHELF_HEADING, TEXT,
} from "../../../shared/settings/settingsText";
import SettingInput from "../../../shared/settings/SettingInput";

import { payrollCardId, payrollFieldId } from "./payrollSettingsCatalogue";

const CARD = "bg-white rounded-2xl border shadow-xs overflow-hidden transition-all";

function Pill({ tone = "slate", children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[tone] || TONE_CLASSES.slate}`}>
      {children}
    </span>
  );
}

/**
 * The leave types a payout covers, as toggles over the org's real types.
 *
 * The setting is stored as a list of short CODES. Typing them by hand meant
 * knowing them by heart, and a typo saved silently and then paid out nothing.
 * If the types can't be read, the plain code box comes back rather than an
 * empty list — "couldn't load" must not look like "there are none".
 */
function LeaveTypePicker({ id, codes, types, disabled, onChange }) {
  // A type with no code can't be stored in this setting, so it isn't offered —
  // a toggle for it would save an empty string into the list.
  const options = (types || []).filter((t) => String(t?.code || "").trim());
  const chosen = (codes || []).map((c) => String(c).toUpperCase());
  const toggle = (code) => {
    const up = String(code).toUpperCase();
    onChange(chosen.includes(up) ? chosen.filter((c) => c !== up) : [...chosen, up]);
  };
  // A saved code with no active leave type behind it — the type was renamed,
  // deactivated, or typed in by hand before this was a picker. It still counts
  // at settlement time, so it is shown rather than hidden: a setting nobody
  // can see is one nobody can fix.
  const orphans = chosen.filter((c) => !options.some((t) => String(t.code).toUpperCase() === c));

  if (options.length === 0) {
    return (
      <>
        <input
          id={id}
          type="text"
          value={chosen.join(", ")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))}
          placeholder="EL"
          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition"
        />
        <p className={`mt-1.5 ${META}`}>Short codes, separated by commas — for example EL, PL.</p>
      </>
    );
  }
  return (
    <div id={id}>
      <div className="flex flex-wrap gap-2">
        {options.map((t) => {
          const code = String(t.code).toUpperCase();
          const on = chosen.includes(code);
          return (
            <button
              key={t.id || code}
              type="button"
              onClick={() => toggle(code)}
              disabled={disabled}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition disabled:opacity-50 ${on ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}
            >
              {t.name || code}
            </button>
          );
        })}
        {orphans.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            disabled={disabled}
            aria-pressed
            title="No active leave type uses this code any more. Click to remove it."
            className="px-3 py-1.5 rounded-xl border border-fuchsia-300 bg-fuchsia-50 text-xs font-bold text-fuchsia-700 transition hover:border-fuchsia-400 disabled:opacity-50"
          >
            {code} · not in use
          </button>
        ))}
      </div>
      <p className={`mt-1.5 ${META}`}>
        {chosen.length === 0
          ? "Nothing is paid out until you pick at least one."
          : "Only these are paid out; every other balance is lost on the last day."}
      </p>
    </div>
  );
}

/* The shelves a card is read in: the ones it declared, or the ones its keys
   imply. A declared shelf wins because two of them would otherwise be headed
   with a word §6 has banned — `fieldShelves` would read "Encashment" off the
   leaver keys, and this product says Leave Payout (see the catalogue). */
function shelvesOf(group, fields) {
  if (!group.shelves) {
    const shelves = fieldShelves(fields);
    // A single unlabelled shelf is a card too small to shelve; `lead` only
    // means anything where there IS a heading for a switch to govern, so the
    // flat case is re-ordered here with the card's own `lead`.
    if (shelves.length === 1 && !shelves[0].label) {
      return [{ ...shelves[0], rows: orderFields(fields, { lead: group.lead }) }];
    }
    return shelves;
  }
  const byKey = new Map(fields.map((entry) => [entry.key, entry]));
  return group.shelves
    .map((shelf) => ({
      ...shelf,
      // Only the fields this server actually stores, in the shelf's own order
      // — and a shelf whose master switch it declares first keeps it there.
      rows: orderFields(shelf.keys.map((key) => byKey.get(key)).filter(Boolean), { lead: Boolean(shelf.label) }),
    }))
    .filter((shelf) => shelf.rows.length > 0);
}

/**
 * @param {object}   props.group        one group from PAYROLL_SETTING_GROUPS,
 *                                      already resolved against the server
 * @param {object}   props.values       the page's form state
 * @param {object}   props.problems     §11: payload key → what is wrong
 * @param {boolean}  props.attempted    has Save been pressed on this form yet
 * @param {string[]} props.dirtyKeys    the keys waiting to be saved
 * @param {object}   props.records      { leaveTypes, earnings, deductions }
 * @param {string[]} props.lockedKeys   settings the PERSON can’t make ready —
 *                                      a paused server feature, not a blank box
 * @param {object}   props.notes        key → one line under its control, for
 *                                      the same case
 */
export default function PayrollSettingCard({
  group, values, problems = {}, attempted = false, dirtyKeys = [], open, onToggle,
  onChange, saving = false, records = {}, surface = "settings.hub", flash = false,
  lockedKeys = [], notes = {},
}) {
  const fields = group.fields || [];
  const dirty = new Set(dirtyKeys);
  const locked = new Set(lockedKeys);
  const dirtyCount = fields.filter((entry) => dirty.has(entry.key)).length;
  const bodyId = `${payrollCardId(group.key)}-body`;
  const Icon = group.icon;
  // What the card is set to, while it is folded. Settings are read far more
  // often than they are changed, so a folded card still answers the question.
  const summary = (group.summary?.(values || {}) || []).filter(Boolean).join(" · ");

  return (
    <section
      id={payrollCardId(group.key)}
      className={`${CARD} h-full scroll-mt-24 ${
        dirtyCount > 0
          ? "border-fuchsia-300 ring-2 ring-fuchsia-50"
          : flash
            ? "border-purple-300 ring-4 ring-purple-100"
            : "border-slate-100"
      }`}
    >
      <header className={`flex items-start gap-1 pr-2 ${open ? "border-b border-slate-100" : ""}`}>
        <button
          type="button"
          onClick={() => onToggle(group.key)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex-1 min-w-0 flex items-start gap-3 px-5 py-4 text-left rounded-2xl hover:bg-slate-50/70 transition-colors"
        >
          <span className="shrink-0 w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 inline-flex items-center justify-center">
            {Icon && <Icon className="w-[18px] h-[18px]" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className={`${CARD_TITLE} truncate`}>{group.label}</span>
              {dirtyCount > 0 && <Pill tone="amber">{dirtyCount} unsaved</Pill>}
            </span>
            {group.blurb && (
              <span className={`block ${BLURB} mt-1 ${open ? "" : "line-clamp-1"}`}>{group.blurb}</span>
            )}
            {/* The summary is for the folded card only: open, the controls
                themselves say it, and two answers to one question is how a
                reader comes to distrust both. */}
            {!open && summary && (
              <span className={`block ${META} mt-1.5`}>{summary}</span>
            )}
          </span>
          <HiChevronDown
            aria-hidden="true"
            className={`shrink-0 w-4 h-4 mt-1 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </header>

      {/* Behind the shutter, and NOT unmounted: a box the person is being sent
          to by §11 has to exist before it can be focused, and the page opens
          the card in the same press. */}
      <div id={bodyId} className={open ? "" : "hidden"}>
        <div className="px-5 py-4 space-y-4">
          {shelvesOf(group, fields).map((shelf, shelfIndex) => (
            <section key={shelf.key} className={shelf.label && shelfIndex > 0 ? "pt-3 border-t border-slate-100" : ""}>
              {shelf.label && <h4 className={`${SHELF_HEADING} mb-3`}>{shelf.label}</h4>}
              <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5 items-start">
                {shelf.rows.map((entry) => {
                  const id = payrollFieldId(entry.key);
                  const name = settingLabel(entry);
                  const value = (values || {})[entry.key];
                  const edited = dirty.has(entry.key);
                  // A hint until the first press, an error after it (§11.3).
                  const problem = attempted ? problems[entry.key] || "" : "";
                  const asSwitch = isSwitchControl(entry) && !entry.readOnly;
                  /* DISABLED IS FOR WHAT PRESSING CAN’T FIX (§11): a feature
                     this server has switched off, not an unanswered box. The
                     note beside it says which, because a dead control with no
                     reason is indistinguishable from a broken one. */
                  const off = saving || locked.has(entry.key);
                  const note = notes[entry.key];
                  const range = rangeHint(entry);
                  // Everything the catalogue knows about the field is in the
                  // hub's own entry for it; only the handful of settings with
                  // an HR-onboarding line of their own override the surface.
                  const helpSurface = entry.help || surface;

                  const labelRow = (
                    <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1">
                      {asSwitch
                        ? <span id={`${id}-label`} className={FIELD_LABEL}>{name}</span>
                        : <label htmlFor={id} className={FIELD_LABEL}>{name}</label>}
                      {/* Beside the label in a flex row, never inside it
                          (§10's wiring rule), and one per field. */}
                      <FieldHelp
                        surface={helpSurface}
                        field={entry.key}
                        label={name}
                        extra={range ? `Allowed: ${range}.` : ""}
                        size="sm"
                        className="mb-0"
                      />
                      {edited && <Pill tone="amber">Unsaved</Pill>}
                    </div>
                  );

                  let control;
                  if (entry.readOnly) {
                    // One legal value. Shown, because "are we monthly?" is a
                    // real question — but a select with one option is a
                    // control that does nothing.
                    control = (
                      <span className={`block text-sm font-bold ${TEXT.value}`}>
                        {displaySettingValue(value, entry)}
                      </span>
                    );
                  } else if (entry.control === "leaveTypes") {
                    control = (
                      <LeaveTypePicker
                        id={id}
                        codes={value}
                        types={records.leaveTypes}
                        disabled={off}
                        onChange={(v) => onChange(entry.key, v)}
                      />
                    );
                  } else if (entry.control === "component") {
                    // The org's own salary lines. The stored value is a UUID,
                    // so the names have to be handed in — §4 forbids the id
                    // reaching the screen, and nobody could pick one anyway.
                    const rows = entry.componentType === "deduction"
                      ? records.deductions || []
                      : records.earnings || [];
                    control = (
                      <SettingInput
                        id={id}
                        entry={entry}
                        value={value}
                        disabled={off}
                        invalid={Boolean(problem)}
                        options={rows.map((c) => ({
                          value: c.id,
                          label: c.code ? `${c.name} (${c.code})` : c.name,
                        }))}
                        emptyLabel={entry.emptyLabel || "Not set"}
                        onChange={(v) => onChange(entry.key, v)}
                      />
                    );
                  } else {
                    control = (
                      <SettingInput
                        id={id}
                        entry={entry}
                        value={value}
                        disabled={off}
                        invalid={Boolean(problem)}
                        labelledBy={asSwitch ? `${id}-label` : undefined}
                        onChange={(v) => onChange(entry.key, entry.numeric && v !== "" && v !== null ? Number(v) : v)}
                      />
                    );
                  }

                  return (
                    <div
                      key={entry.key}
                      className={`min-w-0 ${fieldSpan(entry)} ${
                        edited ? "-mx-2 px-2 py-2 rounded-xl bg-fuchsia-50/50" : ""
                      }`}
                    >
                      {asSwitch ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">{labelRow}</div>
                          {control}
                        </div>
                      ) : (
                        <>
                          {labelRow}
                          <div className="mt-1.5 w-full min-w-0">{control}</div>
                        </>
                      )}
                      {/* The red box says WHICH box; this says what to type in
                          it. Only after a press, and only on the box it is
                          about (§11). */}
                      {problem && (
                        <p className="mt-1.5 text-xs font-bold text-rose-600 leading-relaxed">{problem}</p>
                      )}
                      {/* Not a hint about what the setting does — that is the
                          ⓘ’s job (§10). This is why the control is off. */}
                      {!problem && note && (
                        <p className={`mt-1.5 ${META} leading-relaxed`}>{note}</p>
                      )}
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
