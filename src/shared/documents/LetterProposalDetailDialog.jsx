// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterProposalDetailDialog.jsx — One letter a manager has asked HR
// to issue (#145), and HR's decision on it (#149 approve / #150 turn down).
//
// The house record inspector (CLAUDE.md §3), shared by both workspaces: HR sees
// the same dialog a manager sees, with the two decision buttons in the footer.
// The manager's copy has the same everything and a note in place of the buttons,
// because parity is the point — the same job has to look like the same job.
//
// Three things this dialog is careful about:
//
//  · APPROVING ISSUES A REAL LETTER. It is not a tick on a workflow: the PDF is
//    drawn, a reference number is minted and it lands in somebody's portal, and
//    none of that can be undone. So it is confirmed first, in those words.
//
//  · "THEY DON'T REPORT TO THEM ANY MORE" IS A QUESTION, NOT A FAILURE. #149
//    answers 409 PROPOSAL_SCOPE_STALE when the manager who raised it no longer
//    manages the subject — a transfer, usually. The letter may well still be
//    right, so the refusal becomes a second, deliberate confirmation rather than
//    a dead end (`acknowledge_stale_scope`).
//
//  · TWO CLICKS ISSUE ONE LETTER. #149 has no client idempotency key by design;
//    it is keyed server-side on the proposal. Approving twice returns the same
//    letter with `reused: true`, and this dialog says so plainly rather than
//    reporting a second success that never happened.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  HiBadgeCheck, HiCheckCircle, HiExclamationCircle, HiInformationCircle, HiMail, HiUser, HiXCircle,
} from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailSection, DetailTable, DetailText,
} from "../components/DetailDialog";
import ReasonDialog from "../components/ReasonDialog";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { fmtDateTime } from "../attendance/dates";
import { documentErrorMessage, isProposalDecided, isProposalScopeStale } from "../utils/documentErrors";
import { DANGER_BTN, PRIMARY_BTN } from "./ui";
import { humanizeCode } from "./documentMeta";
import {
  DECISION_REASON_MAX, approvedLetterOf, isProposalPending, proposalDecisionErrorMessage, proposalStateMeta,
  proposalWasReused,
} from "./letterProposalMeta";

/**
 * @param {object} props
 * @param {object} props.proposal
 * @param {object} props.plane                   LETTER_PROPOSAL_PLANES entry
 * @param {(code: string) => string} props.letterNameOf
 * @param {(id: string, fallback?: string) => string} props.nameOf
 * @param {boolean} [props.isSelf]               the viewer raised this one
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onChanged]         a decision landed; lists refresh
 * @param {() => void} props.onClose
 */
export default function LetterProposalDetailDialog({
  proposal, plane, letterNameOf, nameOf, isSelf = false, showToast, onChanged, onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Set when the server says the proposer no longer manages this person. Holds
  // the question open rather than closing the dialog on a refusal.
  const [staleScope, setStaleScope] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState("");

  const meta = proposalStateMeta(proposal.status);
  const pending = isProposalPending(proposal);
  const canDecide = pending && !!plane.approve;

  const letterName = letterNameOf(proposal.template_code);
  const subject = nameOf(proposal.subject_user_id, "");
  const proposer = isSelf ? "You" : nameOf(proposal.proposed_by, "");
  const overrides = proposal.field_overrides && typeof proposal.field_overrides === "object"
    ? Object.entries(proposal.field_overrides)
    : [];

  const approve = async ({ acknowledgeStale = false } = {}) => {
    if (busy) return;

    if (!acknowledgeStale) {
      const ok = await window.confirm(
        `Approve and issue “${letterName}”${subject ? ` to ${subject}` : ""}?\n\n`
        + `The letter is drawn and published the moment you confirm: it gets an official reference number, appears in their portal straight away, and can’t be edited afterwards.`,
      );
      if (!ok) return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await plane.approve(proposal.id, acknowledgeStale ? { acknowledge_stale_scope: true } : {});
      const letter = approvedLetterOf(res);
      showToast?.(proposalWasReused(res)
        ? "This one had already been approved — the letter that exists is the one that was issued then, and no second copy was made."
        : `Approved · the letter${letter?.reference_number ? ` ${letter.reference_number}` : ""} is now in their portal`);
      onChanged?.();
      onClose();
    } catch (err) {
      if (isProposalScopeStale(err)) {
        setStaleScope(true);
        setError("");
      } else {
        setStaleScope(false);
        setError(proposalDecisionErrorMessage(err));
        // Somebody else decided it while this was open — the list behind is
        // wrong too, so it is refreshed even though nothing this person did
        // succeeded.
        if (isProposalDecided(err)) onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const reject = async (reason) => {
    if (busy) return;
    setBusy(true);
    setRejectError("");
    try {
      await plane.reject(proposal.id, { reason });
      showToast?.("Turned down · the manager who asked will see your reason");
      setRejecting(false);
      onChanged?.();
      onClose();
    } catch (err) {
      setRejectError(documentErrorMessage(err, "Couldn’t turn this one down."));
      if (isProposalDecided(err)) onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DetailDialog
        eyebrow="Letter proposal"
        title={letterName}
        subtitle={subject ? `For ${subject}` : undefined}
        icon={HiMail}
        badge={(
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate}`}
            title={meta.hint}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
            {meta.short}
          </span>
        )}
        onClose={onClose}
        footer={(
          <>
            <DetailFooterNote>
              {canDecide
                ? "Approving issues the letter to this person straight away. Turning it down issues nothing."
                : pending
                  ? "HR decides this one. Nothing has reached the employee."
                  : meta.hint}
            </DetailFooterNote>
            {canDecide && (
              <>
                <button type="button" onClick={() => setRejecting(true)} disabled={busy} className={DANGER_BTN}>
                  <HiXCircle className="w-4 h-4" /> Turn it down
                </button>
                <button type="button" onClick={() => approve()} disabled={busy} className={PRIMARY_BTN}>
                  <HiCheckCircle className="w-4 h-4" /> {busy ? "Issuing…" : "Approve and issue"}
                </button>
              </>
            )}
          </>
        )}
      >
        {pending && (
          <p className="flex items-start gap-2.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 leading-relaxed">
            <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              <span className="font-bold">No letter exists yet.</span>{" "}
              Nothing has been drawn, nothing has been numbered, and {subject || "the employee"} can’t see anything. That only happens if HR approves this.
            </span>
          </p>
        )}

        {staleScope && (
          <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3.5" role="alert">
            <div className="flex items-start gap-3">
              <HiExclamationCircle className="w-5 h-5 text-fuchsia-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-fuchsia-900">
                  {subject || "This person"} doesn’t report to {isSelf ? "you" : proposer || "the manager who asked"} any more
                </p>
                <p className="text-sm text-fuchsia-800 mt-0.5 leading-relaxed">
                  Nothing was issued. That often just means they’ve moved team since this was raised — if the letter is still right, issue it anyway.
                </p>
                <button type="button" onClick={() => approve({ acknowledgeStale: true })} disabled={busy} className={`${PRIMARY_BTN} mt-3`}>
                  <HiCheckCircle className="w-4 h-4" /> {busy ? "Issuing…" : "Issue it anyway"}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
            <HiExclamationCircle className="w-5 h-5 shrink-0" /> {error}
          </p>
        )}

        <DetailGrid
          cols={2}
          items={[
            { label: "Letter", value: letterName },
            { label: "For", value: subject || "Loading…" },
            { label: "Asked for by", value: proposer || "Loading…" },
            { label: "Asked for", value: proposal.created_at ? fmtDateTime(proposal.created_at) : null },
            ...(proposal.decided_at ? [
              { label: proposal.status === "approved" ? "Approved by" : "Turned down by", value: nameOf(proposal.decided_by, "") || "Loading…" },
              { label: "Decided", value: fmtDateTime(proposal.decided_at) },
            ] : []),
          ]}
        />

        {proposal.reason && <DetailText label="Why they asked for it">{proposal.reason}</DetailText>}
        {proposal.decision_note && (
          <DetailText label={proposal.status === "rejected" ? "Why it was turned down" : "Note from HR"}>
            {proposal.decision_note}
          </DetailText>
        )}

        {proposal.status === "approved" && (
          <p className="flex items-start gap-2.5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 leading-relaxed">
            <HiBadgeCheck className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <span>
              The letter was issued and is in {subject || "the employee"}’s portal. It is on the register of issued letters, under its own reference number.
            </span>
          </p>
        )}

        {overrides.length > 0 && (
          <DetailSection title="Wording they asked for" icon={HiUser} defaultOpen={pending}>
            <DetailTable
              columns={[
                { header: "Part of the letter", render: ([key]) => humanizeCode(key) },
                { header: "What it should say", render: ([, value]) => String(value ?? "") },
              ]}
              rows={overrides}
              rowKey={([key]) => key}
              empty="They didn’t change any wording."
            />
            {canDecide && (
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                This is what goes on the letter. If any of it is wrong, turn the proposal down and say why — the manager can raise it again with the wording corrected.
              </p>
            )}
          </DetailSection>
        )}
      </DetailDialog>

      {/* A sibling of the inspector, never a child (CLAUDE.md §3 stacking). */}
      {rejecting && (
        <ReasonDialog
          title="Turn down this letter"
          description={`${proposer || "The manager"} will see your reason. No letter is issued, and this can’t be undone.`}
          label="Why you’re turning it down"
          placeholder="Not eligible yet — still in their first three months"
          confirmLabel="Turn it down"
          tone="danger"
          maxLength={DECISION_REASON_MAX}
          busy={busy}
          error={rejectError}
          onSubmit={reject}
          onClose={() => { setRejecting(false); setRejectError(""); }}
        />
      )}
    </>
  );
}
