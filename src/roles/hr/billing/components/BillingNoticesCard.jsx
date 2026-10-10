// ─────────────────────────────────────────────────────────────────────────────
// BillingNoticesCard.jsx — Who gets told about invoices and renewals, and how
// far ahead (settings #97 `billing_notification_emails` and #98
// `billing_reminder_lead_days`).
//
// They are written through PATCH /organizations/profile, the same partial
// endpoint as Edit company details, and they are deliberately NOT in that
// dialog. An HR admin asking "who gets our invoices?" looks on the billing
// page, not in the company's address and tax card — and these two are the only
// settings on that endpoint whose effect is a billing email. Same endpoint,
// right place.
//
// Contract traps:
//   · The PATCH is PARTIAL and refuses an empty body, so Save sends only the
//     array that actually changed and is disabled until one has.
//   · #97 takes at most 5 unique email addresses. #98 takes at most 4 unique
//     whole numbers from 1 to 90. Both caps are the server's, checked here so
//     a Joi sentence never reaches the screen (§6).
//   · An EMPTY `billing_reminder_lead_days` array is meaningful — it turns
//     reminders off. So an empty list is saved as `[]`, never dropped from the
//     payload, and the card says what the empty state does rather than looking
//     unfinished.
//   · These are reminders in ADDITION to the owner's own address, which always
//     gets them. Saying so stops an admin adding themselves twice.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { HiBell, HiCheck, HiMail, HiPlus, HiX } from "react-icons/hi";
import { settingsAPI } from "../../../../shared/api";
import { isPreconditionFailed, settingsErrorMessage } from "../../../../shared/utils/settingsErrors";

// The catalogue group that actually holds these two settings.
const GROUP = "billing.notifications";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";
import { Notice, PRIMARY_BTN, SECONDARY_BTN } from "./billingUi";

const SURFACE = "billing.notices";

// The server's caps (#97, #98).
const MAX_EMAILS = 5;
const MAX_LEAD_DAYS = 4;
const LEAD_DAY_MIN = 1;
const LEAD_DAY_MAX = 90;

// Deliberately permissive: the server is the authority on a deliverable
// address. This only catches a typo that obviously isn't one.
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const sameList = (a, b) =>
  a.length === b.length && a.every((item, i) => String(item) === String(b[i]));

/** The lead-day choices an admin actually wants, rather than a free number box. */
const LEAD_DAY_CHOICES = [1, 3, 7, 14, 30];

const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-slate-600";

/**
 * @param {object} props
 * @param {object} [props.profile]  GET /organizations/details `profile`
 * @param {(details: object) => void} props.onSaved  takes the refreshed payload
 * @param {(msg: string, type?: string) => void} props.showToast
 */
export default function BillingNoticesCard({ onSaved, onClose, showToast }) {
  // Loaded, not handed in — see this file's header for why the org profile
  // is not the source.
  const [loaded, setLoaded] = useState(null);   // { emails, days, etag }
  const [loadError, setLoadError] = useState("");

  const initialEmails = useMemo(() => loaded?.emails || [], [loaded]);
  const initialDays = useMemo(() => loaded?.days || [], [loaded]);

  const [emails, setEmails] = useState([]);
  const [days, setDays] = useState([]);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // One read of the group that actually holds these two settings (#245),
  // which also hands back the per-group ETag every write needs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await settingsAPI.getGroup(GROUP);
        if (cancelled) return;
        const values = res?.data?.values || {};
        const next = {
          emails: Array.isArray(values.billing_notification_emails) ? values.billing_notification_emails : [],
          // An absent key means "never set", which behaves as the server's
          // own default, so the card shows that rather than an empty list.
          days: Array.isArray(values.billing_reminder_lead_days) ? values.billing_reminder_lead_days.map(Number) : [7, 1],
          etag: res?.data?.etag || null,
        };
        setLoaded(next);
        setEmails(next.emails);
        setDays(next.days);
      } catch (err) {
        if (!cancelled) setLoadError(settingsErrorMessage(err, "We couldn’t read who gets your billing notices."));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const emailsChanged = !sameList(emails, initialEmails);
  const daysChanged = !sameList(days, initialDays);
  const dirty = emailsChanged || daysChanged;

  const addEmail = () => {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (!looksLikeEmail(value)) { setFieldError("That doesn’t look like an email address."); return; }
    if (emails.some((e) => e.toLowerCase() === value)) { setFieldError("That address is already on the list."); return; }
    if (emails.length >= MAX_EMAILS) { setFieldError(`You can add up to ${MAX_EMAILS} addresses.`); return; }
    setEmails([...emails, value]);
    setDraft("");
    setFieldError("");
  };

  const removeEmail = (value) => setEmails(emails.filter((e) => e !== value));

  const toggleDay = (day) => {
    setFieldError("");
    if (days.includes(day)) { setDays(days.filter((d) => d !== day)); return; }
    if (days.length >= MAX_LEAD_DAYS) { setFieldError(`You can pick up to ${MAX_LEAD_DAYS} reminders.`); return; }
    if (day < LEAD_DAY_MIN || day > LEAD_DAY_MAX) return;
    setDays([...days, day].sort((a, b) => b - a));
  };

  const reset = () => {
    setEmails(initialEmails);
    setDays(initialDays);
    setDraft("");
    setFieldError("");
    setError("");
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    try {
      // Only the array that changed. An empty `days` array is still sent —
      // it is how reminders are switched off.
      const values = {
        ...(emailsChanged ? { billing_notification_emails: emails } : {}),
        ...(daysChanged ? { billing_reminder_lead_days: days } : {}),
      };
      const res = await settingsAPI.updateGroup(GROUP, { values }, loaded?.etag);
      // The reply carries the saved values and a fresh ETag, so the card can
      // be edited again without a re-read.
      const saved = res?.data || {};
      setLoaded({
        emails: saved.values?.billing_notification_emails || emails,
        days: (saved.values?.billing_reminder_lead_days || days).map(Number),
        etag: saved.etag || loaded?.etag || null,
      });
      onSaved?.(saved);
      showToast?.("Saved. Billing notices will go to these addresses.");
    } catch (err) {
      // Somebody else changed them while this was open. Their edits stay on
      // screen; only the assumption that nobody else was editing is lost.
      setError(isPreconditionFailed(err)
        ? settingsErrorMessage(err)
        : settingsErrorMessage(err, "We couldn’t save that. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    // A FORM, so it is a plain dialog rather than a DetailDialog (§3 — a form
    // is not a record inspector), built to the house form-dialog shape: wide
    // and gridded rather than a narrow column nobody can fill in, capped at
    // the viewport, with the actions pinned to the bottom.
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      role="presentation"
      // Backdrop-close is the house behaviour (DetailDialog, ReasonDialog),
      // but NOT over unsaved edits: this is a form, and a stray click beside
      // it would throw away a list somebody had just typed. ReasonDialog
      // guards the same way on `busy`.
      onMouseDown={(e) => { if (e.target === e.currentTarget && !dirty && !saving) onClose?.(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-notices-title"
        className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <header className="flex items-center gap-2 px-6 sm:px-8 py-4 border-b border-slate-100 shrink-0">
          <HiBell className="w-4 h-4 text-purple-500" />
          <h2 id="billing-notices-title" className="text-sm font-bold text-slate-800">Billing notices</h2>
          <FieldHelp surface={SURFACE} field="billing_notification_emails" label="who gets billing emails" className="mb-0" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <HiX className="w-4 h-4" />
          </button>
        </header>

        <div className="px-6 sm:px-8 py-6 space-y-6 overflow-y-auto">
          {/* A failed read is NOT an empty list: saving over values we never
              saw would wipe whoever is already on it (§7). */}
          {loadError && <Notice tone="error">{loadError}</Notice>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Who ───────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <label htmlFor="billing-email" className={LABEL}>Also send invoices and renewal notices to</label>
          <p className="text-[11px] text-slate-500 mt-1 mb-2 leading-relaxed">
            Your own address always gets them. Add your accounts team here so they don’t have to ask you for an invoice.
          </p>

          {emails.length > 0 && (
            <ul className="flex flex-wrap gap-2 mb-2.5">
              {emails.map((email) => (
                <li key={email} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-xs text-purple-800 max-w-full">
                  <HiMail className="w-3 h-3 shrink-0 text-purple-500" />
                  <span className="truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="p-0.5 rounded-full text-purple-400 hover:text-purple-800 hover:bg-purple-100 shrink-0"
                    aria-label={`Remove ${email}`}
                  >
                    <HiX className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              id="billing-email"
              type="email"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setFieldError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
              placeholder="accounts@yourcompany.com"
              disabled={emails.length >= MAX_EMAILS}
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-purple-100 focus:border-purple-500 transition disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button type="button" onClick={addEmail} disabled={!draft.trim() || emails.length >= MAX_EMAILS} className={SECONDARY_BTN}>
              <HiPlus className="w-4 h-4" /> Add
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            {emails.length >= MAX_EMAILS
              ? `That’s the most we can send to (${MAX_EMAILS}).`
              : `${MAX_EMAILS - emails.length} more can be added.`}
          </p>
        </div>

        {/* ── When ──────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="flex items-center">
            <p id="lead-days-caption" className={LABEL}>Remind us before the plan ends</p>
            <FieldHelp surface={SURFACE} field="billing_reminder_lead_days" label="when reminders are sent" className="mb-0" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1 mb-2.5 leading-relaxed">
            Pick up to {MAX_LEAD_DAYS}. Choosing none switches renewal reminders off altogether.
          </p>
          <div role="group" aria-labelledby="lead-days-caption" className="flex flex-wrap gap-2">
            {LEAD_DAY_CHOICES.map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={on}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${on ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"}`}
                >
                  {day === 1 ? "1 day" : `${day} days`}
                </button>
              );
            })}
          </div>
          {/* A saved value that isn't one of the offered choices still shows,
              so editing the others can't silently drop it. */}
          {days.filter((d) => !LEAD_DAY_CHOICES.includes(d)).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {days.filter((d) => !LEAD_DAY_CHOICES.includes(d)).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-purple-600 text-white border-purple-600"
                >
                  {day} days
                </button>
              ))}
            </div>
          )}
          {days.length === 0 && (
            <p className="text-[11px] text-fuchsia-700 font-semibold mt-2">
              No reminders. You’ll only hear from us when a payment is taken.
            </p>
          )}
        </div>
      </div>

          {fieldError && <p className="text-[11px] font-semibold text-rose-600">{fieldError}</p>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>

        {/* Pinned, so a long email list never scrolls the actions away. Save
            still only appears once something has actually changed — the PATCH
            refuses an empty body. */}
        <footer className="flex flex-wrap items-center justify-end gap-3 px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/70 shrink-0">
          {dirty && loaded ? (
            <>
              <button type="button" onClick={reset} disabled={saving} className={SECONDARY_BTN}>Undo changes</button>
              <button type="button" onClick={save} disabled={saving} className={PRIMARY_BTN}>
                {saving
                  ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                  : <><HiCheck className="w-4 h-4" /> Save notices</>}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className={SECONDARY_BTN}>Close</button>
          )}
        </footer>
      </section>
    </div>
  );
}
