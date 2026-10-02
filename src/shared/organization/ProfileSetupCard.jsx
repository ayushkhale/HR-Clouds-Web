// ─────────────────────────────────────────────────────────────────────────────
// ProfileSetupCard — "Finish setting up your profile", for an HR whose own
// staff record was never filled in.
//
// WHY IT EXISTS AT ALL. The person who registers an organisation is created
// before the organisation has any structure, so their own record has no joining
// date, office, department, job title, employment type, work mode, gender or
// marital status. Every other writer of those fields refuses a self-edit and a
// new org has one HR, so the record could not be completed by anyone. The
// blank that bites is the joining date: without it, that HR cannot be given a
// leave policy and is left out of every payroll run — silently, by rules that
// are working correctly.
//
// IT IS A SOFT GATE, AND THAT IS DELIBERATE. Nothing in the API is blocked on
// setup being complete, so this is a card that can be dismissed, never a modal
// with no way out. Dismissal lasts the session only: the consequences are
// permanent, so the reminder comes back next time rather than being silenced
// for good.
//
// IT RENDERS NOTHING unless it has a reason to. Not HR, setup complete, or the
// endpoint not deployed → no card, no error, no empty frame. The two endpoints
// are HR-only (403 for everyone else), so the role is checked before the call
// rather than the error being used as the test (CLAUDE.md §2: a capability a
// role lacks is absent, not broken).
//
// Contract: `md_organization/4_org_employee_api.md` §11.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HiArrowRight, HiSparkles, HiX } from "react-icons/hi";
import { organizationAPI } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { isHRAdmin } from "../auth/permissions";
import { refreshEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import ProfileSetupDialog from "./ProfileSetupDialog";
import { normalizeSetupStatus, setupFieldShort, setupSteps } from "./profileSetupMeta.js";

// Session, not local: see the header. Keyed so two accounts in one browser
// don't inherit each other's dismissal.
const dismissKey = (userId) => `hrc.profileSetup.dismissed.${userId || "me"}`;

/**
 * @param {object} props
 * @param {Function} [props.onToast]  how the host reports a save
 * @param {boolean} [props.dismissible]
 *   True on a dashboard, where this is one card among many and has to be
 *   escapable. False on My Profile, where the same blanks are visible a few
 *   rows below as locked, empty fields — hiding the only way to fill them from
 *   the one screen that shows them missing is how the original bug felt.
 */
export default function ProfileSetupCard({ className = "", onToast, dismissible = true }) {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || null;
  const isHR = isHRAdmin(user?.role);

  const [status, setStatus] = useState(null);
  // Three states, not a boolean: a failed read must not be mistaken for
  // "nothing to do here" (CLAUDE.md §7) — it just shows nothing and stays quiet.
  const [state, setState] = useState("loading");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissible) return false;
    try { return sessionStorage.getItem(dismissKey(userId)) === "1"; } catch { return false; }
  });
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!isHR) { setState("hidden"); return; }
    const id = ++reqId.current;
    try {
      const next = normalizeSetupStatus(await organizationAPI.getMySetupStatus());
      if (id !== reqId.current) return;
      setStatus(next);
      setState("ready");
    } catch {
      // A 403 means this build is talking to a server where the endpoint isn't
      // HR-only yet; a 404 means it isn't deployed. Either way there is nothing
      // useful to say, and a dashboard is the wrong place to say it.
      if (id === reqId.current) setState("hidden");
    }
  }, [isHR]);

  useEffect(() => { load(); }, [load]);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(dismissKey(userId), "1"); } catch { /* private mode */ }
  };

  const handleStatus = (next) => {
    const wrote = (next?.locked?.length || 0) > (status?.locked?.length || 0)
      || (next?.missing?.length ?? Infinity) < (status?.missing?.length ?? 0);
    setStatus(next);
    // Their own department, office and job title sit on the roster every other
    // screen reads, so a write makes the copy they hold wrong (CLAUDE.md §7).
    // Only on an actual write, though: re-reading the status after a 409
    // changes nothing, and refreshing re-pages the whole organisation.
    if (wrote) refreshEmployeeDirectory();
  };

  const unknown = status?.unknownMissing?.length || 0;
  // The last clause guards a server that says "not complete" while naming
  // nothing at all. There is no sentence that is both true and useful for that,
  // so the card stays away rather than inventing one.
  if (!isHR || state !== "ready" || !status || status.isComplete
    || (status.missing.length === 0 && unknown === 0)) return null;

  const steps = setupSteps(status);
  const remaining = status.missing.length + unknown;
  // The joining date is called out by name because it is the one blank with
  // consequences elsewhere, and those consequences look like bugs.
  const blocksPayroll = status.missing.includes("joining_date");
  // Nothing this build can offer a control for, but the record is still
  // incomplete: the only true thing to say is that someone else has to finish
  // it. No button, because there is nothing for one to do.
  const nothingSelfServable = status.missing.length === 0;

  return (
    <>
      {!dismissed && (
        <section className={`rounded-3xl border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-white shadow-2xs p-5 sm:p-6 ${className}`}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <HiSparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-900">Finish setting up your own profile</h2>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {blocksPayroll
                  ? "Your staff record is missing the day you joined, so leave and payroll can’t include you yet."
                  : `Your own staff record still has ${remaining === 1 ? "one detail" : `${remaining} details`} missing.`}
              </p>

              {steps.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {steps.map((step) => (
                    <li key={step.key} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white border border-slate-100 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800">{step.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.body}</p>
                      </div>
                      <Link to={step.to} className="inline-flex items-center gap-1.5 shrink-0 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3.5 py-2 rounded-xl transition">
                        {step.cta} <HiArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {status.missing.length > 0 && (
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  Still needed: {status.missing.map(setupFieldShort).join(", ")}.
                </p>
              )}

              {nothingSelfServable && (
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  The {unknown === 1 ? "detail" : "details"} still missing {unknown === 1 ? "isn’t" : "aren’t"} something
                  you can set yourself — another HR has to add {unknown === 1 ? "it" : "them"} to your record.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-4">
                {/* "what I can" and not "all": an office or department that
                    doesn't exist yet can't be picked, so those wait for a step
                    above. Saying so beats a select with nothing in it. */}
                {!nothingSelfServable && (
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
                  >
                    {steps.length > 0 ? "Fill in what I can" : "Fill these in"}
                  </button>
                )}
                {dismissible && (
                  <button type="button" onClick={dismiss} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl transition">
                    Not now
                  </button>
                )}
              </div>
            </div>
            {dismissible && (
              <button type="button" onClick={dismiss} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white transition" aria-label="Hide this reminder for now">
                <HiX className="w-4 h-4" />
              </button>
            )}
          </div>
        </section>
      )}

      {open && (
        <ProfileSetupDialog
          status={status}
          onStatus={handleStatus}
          onSaved={(message) => onToast?.(message)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
