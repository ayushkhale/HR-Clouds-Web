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

import { useMemo, useState } from "react";
import { HiBell, HiCheck, HiMail, HiPlus, HiX } from "react-icons/hi";
import { organizationAPI } from "../../../../shared/api";
import { organizationErrorMessage } from "../../../../shared/utils/organizationErrors";
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
export default function BillingNoticesCard({ profile, onSaved, showToast }) {
  const initialEmails = useMemo(
    () => (Array.isArray(profile?.billing_notification_emails) ? profile.billing_notification_emails : []),
    [profile],
  );
  // The server's own default is [7, 1]; an absent key means "never set", which
  // behaves as that default, so the card shows it rather than an empty list.
  const initialDays = useMemo(() => {
    const raw = profile?.billing_reminder_lead_days;
    return Array.isArray(raw) ? raw.map(Number) : [7, 1];
  }, [profile]);

  const [emails, setEmails] = useState(initialEmails);
  const [days, setDays] = useState(initialDays);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      // Partial: only the array that changed. An empty `days` array is still
      // sent — it is how reminders are switched off.
      const payload = {
        ...(emailsChanged ? { billing_notification_emails: emails } : {}),
        ...(daysChanged ? { billing_reminder_lead_days: days } : {}),
      };
      const res = await organizationAPI.updateOrganizationProfile(payload);
      // The PATCH answers with the refreshed details payload, so there is no
      // second read and no stale card.
      onSaved?.(res?.data || null);
      showToast?.("Saved. Billing notices will go to these addresses.");
    } catch (err) {
      setError(organizationErrorMessage(err, "We couldn’t save that. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-5">
      <div className="flex items-center gap-2">
        <HiBell className="w-4 h-4 text-purple-500" />
        <h2 className="text-sm font-bold text-slate-800">Billing notices</h2>
        <FieldHelp surface={SURFACE} field="billing_notification_emails" label="who gets billing emails" className="mb-0" />
      </div>

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

      {dirty && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1 border-t border-slate-100">
          <button type="button" onClick={reset} disabled={saving} className={SECONDARY_BTN}>Undo changes</button>
          <button type="button" onClick={save} disabled={saving} className={PRIMARY_BTN}>
            {saving
              ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
              : <><HiCheck className="w-4 h-4" /> Save notices</>}
          </button>
        </div>
      )}
    </section>
  );
}
