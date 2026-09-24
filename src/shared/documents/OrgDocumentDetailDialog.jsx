// ─────────────────────────────────────────────────────────────────────────────
// documents/OrgDocumentDetailDialog.jsx — Everything about one organisation
// document, opened by clicking its row. The plane decides the actions:
//
//   hr      — edit or delete a draft, publish it (#47), start the next version
//             (#48), withdraw a live one (#49), decline a manager's proposal
//             (#50), plus the recipient roster, version chain and audit trail
//   manager — read their own proposal and edit it while HR hasn't decided
//   self    — read a document issued to me; opening the file is what records
//             that I read it (#72). When it asks for more, acknowledge it (#73)
//             or sign it (#74), and afterwards open my receipt (#75)
//
// The row opens instantly and the detail read then replaces it, so an action is
// never taken against a status that has moved on since the list loaded.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiBan, HiBell, HiCalendar, HiCheckCircle, HiClock, HiCollection, HiDocumentText, HiDownload,
  HiExclamationCircle, HiEye, HiLockClosed, HiPencilAlt, HiPaperAirplane, HiTrash, HiUpload,
  HiUserCircle, HiUserGroup, HiBadgeCheck, HiShieldCheck,
} from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailText } from "../components/DetailDialog";
import AttachmentViewerDialog from "../components/AttachmentViewerDialog";
import ReasonDialog from "../components/ReasonDialog";
import { useAuth } from "../contexts/AuthContext";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import {
  documentErrorMessage, isComplianceStale, isDraftAlreadyOpen, isFileMissing, isOrgDocumentStale,
  isProposerScopeChanged, recipientLimitDetail,
} from "../utils/documentErrors";
import { arrayPayload, contentTypeLabel, formatBytes } from "./documentMeta";
import { triggerDownload } from "./documentUpload";
import { DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { OrgStatusBadge } from "./orgUi";
import OrgRecipientsSection from "./OrgRecipientsSection";
import { AcknowledgeDialog, EvidenceDialog, SignDialog } from "./ComplianceDialogs";
import { ackBlockOf, actionWindow, complianceStateMeta, dueLabel, hasEvidence, nextActionOf } from "./complianceMeta";
import {
  TARGET_DIMENSIONS, canDeleteOrg, canEditOrgDraft, canRejectProposal, canReplaceOrg,
  canRetire, describeAudience, documentTypeName, goesToEveryone, hasCriteria, hasRecipients,
  isProposal, isReference, orgAuditActionLabel, orgDisplayStatus, orgStatusMeta,
  publishBlocker, recipientStateMeta, targetLabel, targetingCriteria,
} from "./orgDocumentMeta";

/** A coloured notice at the top of the dialog — the one thing to know first. */
function Banner({ tone = "slate", icon: Icon, title, children }) {
  const tones = {
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    fuchsia: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      {Icon && <Icon className="w-5 h-5 shrink-0 mt-0.5" />}
      <div className="min-w-0">
        {title && <p className="text-sm font-bold">{title}</p>}
        <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{children}</div>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.doc                       the list row (opens instantly)
 * @param {object} [props.recipient]               self plane: my own recipient record
 * @param {object} props.plane                     ORG_PLANES entry
 * @param {Map} [props.types]                      type id → type
 * @param {(dimension: object, id: string) => string} [props.resolveTarget]
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {object[]} [props.people]                roster rows, for the recipient list
 * @param {(msg: string, type?: string) => void} props.showToast
 * @param {() => void} props.onChanged
 * @param {(doc: object) => void} [props.onEdit]
 * @param {(doc: object) => void} [props.onOpenDraft]   jump to an existing next-version draft
 * @param {"acknowledge"|"sign"|null} [props.initialAction]  self plane: open straight into that step
 * @param {() => void} props.onClose
 */
export default function OrgDocumentDetailDialog({
  doc: initial, recipient = null, plane, types, resolveTarget, nameOf, people = [],
  showToast, onChanged, onEdit, onOpenDraft, initialAction = null, onClose,
}) {
  const [doc, setDoc] = useState(initial);
  const [mine, setMine] = useState(recipient);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState({ rows: [], loading: !!plane.versions, error: null });
  const [audit, setAudit] = useState({ rows: [], loading: !!plane.auditLogs, error: null });
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState("");
  const [retiring, setRetiring] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [dialogError, setDialogError] = useState("");
  // Self plane, Phase 3: which confirm dialog is open, its error, the receipt.
  const [acting, setActing] = useState(null); // "acknowledge" | "sign" | null
  const [actError, setActError] = useState(null);
  const [receipt, setReceipt] = useState(false);

  const { user } = useAuth();
  const id = initial?.id;
  const who = (userId, fallback) => {
    if (userId && userId === user?.id) return "You";
    return nameOf ? nameOf(userId, fallback) : fallback ?? "N/A";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = (await plane.get(id))?.data ?? {};
      // The self plane answers with the recipient record and nests the document.
      const fresh = plane.key === "self" ? payload?.document : payload;
      if (plane.key === "self" && payload?.id) setMine(payload);
      // Merged, so the list row's fields survive a narrower detail projection —
      // but `confirmed_at` gates Publish, so it is taken from the server's
      // answer alone. Letting a stale value ride through the merge is what puts
      // an enabled Publish button in front of a draft with no file.
      if (fresh?.id) setDoc((cur) => ({ ...cur, ...fresh, confirmed_at: fresh.confirmed_at ?? null }));
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't refresh this document."), "error");
    } finally {
      setLoading(false);
    }
  }, [plane, id, showToast]);

  const loadVersions = useCallback(async () => {
    if (!plane.versions) return;
    setVersions((v) => ({ ...v, loading: true, error: null }));
    try {
      const rows = arrayPayload(await plane.versions(id)).sort((a, b) => (b.version || 0) - (a.version || 0));
      setVersions({ rows, loading: false, error: null });
    } catch (error) {
      setVersions({ rows: [], loading: false, error });
    }
  }, [plane, id]);

  const loadAudit = useCallback(async () => {
    if (!plane.auditLogs) return;
    setAudit((a) => ({ ...a, loading: true, error: null }));
    try {
      const rows = arrayPayload(await plane.auditLogs(id)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setAudit({ rows, loading: false, error: null });
    } catch (error) {
      setAudit({ rows: [], loading: false, error });
    }
  }, [plane, id]);

  useEffect(() => { load(); loadVersions(); loadAudit(); }, [load, loadVersions, loadAudit]);

  // #70/#71 nest the name; HR's reads carry only the id, so fall back.
  const typeName = documentTypeName(doc, types);
  const status = orgDisplayStatus(doc);
  const statusMeta = orgStatusMeta(status);
  const reference = isReference(doc);
  const criteria = targetingCriteria(doc);
  const orgWide = goesToEveryone(doc);
  // A list row carries only the summary; the detail read (#55) brings the real
  // criteria, so the per-dimension chips wait for it rather than showing blanks.
  const showCriteria = !orgWide && hasCriteria(doc);
  const proposal = isProposal(doc);

  const refreshAll = async () => {
    onChanged?.();
    await Promise.all([load(), loadVersions(), loadAudit()]);
  };

  const failed = (err, fallback) => {
    showToast?.(documentErrorMessage(err, fallback), "error");
    if (isOrgDocumentStale(err)) refreshAll();
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const download = async () => {
    setBusy("download");
    try {
      const url = ((await plane.viewUrl(id, { disposition: "attachment" }))?.data ?? {})?.view_url;
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
      // On the self plane the download is also the moment it counts as read.
      if (plane.key === "self") await load();
      loadAudit();
    } catch (err) {
      failed(err, "Couldn't prepare the download.");
    } finally {
      setBusy("");
    }
  };

  /** Publish, with the two refusals HR can actually answer handled in place. */
  const publish = async () => {
    const audience = orgWide ? "everyone in the organisation" : "the audience you chose";
    const days = Number(doc.acknowledgement_due_days) || 0;
    const ask = doc.requires_signature ? "sign" : "acknowledge";
    const ack = doc.requires_acknowledgement
      ? `\n\nEveryone who gets it will be asked to ${ask} it within ${days ? `${days} ${days === 1 ? "day" : "days"}` : "your organisation's default number of days"}.`
      : doc.requires_signature ? "\n\nEveryone who gets it will be asked to sign it (no deadline)." : "";
    const dated = doc.effective_from ? `\n\nIt comes into force on ${fmtDate(doc.effective_from)}.` : "";
    if (!(await window.confirm(`Publish “${doc.title}” to ${audience}?${dated}${ack}\n\nThe list of people is fixed at this moment and the document can't be edited afterwards.`))) return;

    setBusy("publish");
    const run = async (override) => plane.publish(id, override ? { override_scope_change: true } : {});
    try {
      let res;
      try {
        res = await run(false);
      } catch (err) {
        if (!isProposerScopeChanged(err)) throw err;
        const ok = await window.confirm(
          `${who(doc.proposed_by, "The manager")} who proposed this no longer manages everyone it targets.\n\nPublish anyway? The override is recorded in the audit trail.`,
        );
        if (!ok) return;
        res = await run(true);
      }
      const data = res?.data ?? res;
      const count = Number(data?.recipient_count ?? data?.document?.recipient_count) || 0;
      if (data?.already_published) showToast?.("This was already published.");
      else if ((data?.warnings || []).includes("ZERO_RECIPIENTS")) {
        showToast?.("Published, but nobody matched the audience. Check the targeting and top up once it's fixed.", "error");
      } else {
        showToast?.(`Published to ${count} ${count === 1 ? "person" : "people"}`);
      }
      await refreshAll();
    } catch (err) {
      const limit = recipientLimitDetail(err);
      if (limit) {
        showToast?.(`This would go to ${limit.resolved ?? "more"} people; at most ${limit.limit ?? "the limit"} can be issued at once. Narrow the audience and try again.`, "error");
      } else if (isFileMissing(err)) {
        // Two very different situations share this code, so re-read before
        // advising. A draft with no confirmed file is the user's to fix. A
        // draft that HAS one and is still refused is a server fault — pushing
        // that person into the upload screen would loop them through an upload
        // that already succeeded. (Confirmed against the dev API on
        // 2026-09-24: publish rejects org documents whose object is in S3,
        // confirmed and checksummed, and reference drafts with a live URL.)
        await load();
        setDoc((cur) => {
          const reallyMissing = !isReference(cur) && !cur?.confirmed_at;
          showToast?.(
            reallyMissing
              ? "The file never finished uploading. Open the draft and attach it again."
              : documentErrorMessage(err),
            "error",
          );
          if (reallyMissing && onEdit) onEdit(cur);
          return cur;
        });
      } else {
        failed(err, "Couldn't publish this document.");
      }
    } finally {
      setBusy("");
    }
  };

  const startNewVersion = async () => {
    if (!(await window.confirm(`Start a new version of “${doc.title}”?\n\nThe current version stays in force until you publish the new one. You'll get a fresh draft to edit.`))) return;
    setBusy("replace");
    try {
      const data = (await plane.replace(id, {}))?.data ?? {};
      const draft = data.document ?? data;
      showToast?.("New draft created — edit it and publish when you're ready");
      onChanged?.();
      if (draft?.id && onOpenDraft) onOpenDraft(draft);
      else await refreshAll();
    } catch (err) {
      if (isDraftAlreadyOpen(err)) {
        showToast?.("A newer version is already being drafted. Finish or delete that draft first.", "error");
        onChanged?.();
      } else {
        failed(err, "Couldn't start a new version.");
      }
    } finally {
      setBusy("");
    }
  };

  const retire = async (reason) => {
    setBusy("retire");
    setDialogError("");
    try {
      await plane.retire(id, reason);
      setRetiring(false);
      showToast?.("Withdrawn — the people who received it keep their copy, marked as no longer in force");
      await refreshAll();
    } catch (err) {
      setDialogError(documentErrorMessage(err, "Couldn't withdraw this document."));
      if (isOrgDocumentStale(err)) { setRetiring(false); refreshAll(); }
    } finally {
      setBusy("");
    }
  };

  const decline = async (reason) => {
    setBusy("reject");
    setDialogError("");
    try {
      await plane.reject(id, reason);
      setDeclining(false);
      showToast?.("Proposal declined — the manager can see your reason");
      await refreshAll();
    } catch (err) {
      setDialogError(documentErrorMessage(err, "Couldn't decline this proposal."));
      if (isOrgDocumentStale(err)) { setDeclining(false); refreshAll(); }
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    const what = doc.status === "rejected" ? "declined proposal" : "draft";
    if (!(await window.confirm(`Delete the ${what} “${doc.title}”?\n\nIt was never issued, so nobody loses anything. It stays in the audit trail.`))) return;
    setBusy("delete");
    try {
      await plane.remove(id);
      showToast?.(doc.status === "rejected" ? "Declined proposal deleted" : "Draft deleted");
      onChanged?.();
      onClose();
    } catch (err) {
      failed(err, "Couldn't delete this.");
    } finally {
      setBusy("");
    }
  };

  // ── Acknowledge / sign (self plane, Phase 3) ──────────────────────────────
  const settle = async (err) => {
    // Excused, closed, or the requirement changed while the dialog was open:
    // the fresh read shows where things stand, so close rather than retry.
    setActing(null);
    showToast?.(documentErrorMessage(err), "error");
    await load();
    onChanged?.();
  };

  const acknowledge = async () => {
    setBusy("acknowledge");
    setActError(null);
    try {
      const data = (await plane.acknowledge(id))?.data ?? {};
      setActing(null);
      showToast?.(data.already_acknowledged ? "You had already acknowledged this — nothing changed." : "Acknowledged. Your receipt is saved.");
      await load();
      onChanged?.();
    } catch (err) {
      if (isComplianceStale(err)) await settle(err);
      else setActError(err);
    } finally {
      setBusy("");
    }
  };

  const sign = async (name) => {
    setBusy("sign");
    setActError(null);
    try {
      const data = (await plane.sign(id, name))?.data ?? {};
      setActing(null);
      showToast?.(data.already_signed ? "You had already signed this — nothing changed." : "Signed. Your receipt is saved.");
      await load();
      onChanged?.();
    } catch (err) {
      if (isComplianceStale(err)) await settle(err);
      else setActError(err);
    } finally {
      setBusy("");
    }
  };

  // Where I stand, for the self plane. `mine` is my recipient record; the
  // document itself is `doc`, kept fresh by the detail read.
  const myRow = plane.key === "self" && mine ? { ...mine, document: { ...(mine.document || {}), ...doc } } : null;
  const myBlock = myRow ? ackBlockOf(myRow) : null;
  const myNext = myRow ? nextActionOf(myRow) : null;
  const myWindow = actionWindow(doc);
  const canAct = !!myNext && myWindow.open && !!plane[myNext];
  const myDone = myRow ? hasEvidence(myRow) : false;
  const opened = !!mine?.first_viewed_at || (mine?.state && mine.state !== "pending");

  // Asked to open straight into Acknowledge / Sign: wait for the fresh read so
  // the step is only offered if it is still due, then open it once.
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (autoStarted || loading || !initialAction) return;
    setAutoStarted(true);
    if (canAct && myNext === initialAction) setActing(initialAction);
  }, [autoStarted, loading, initialAction, canAct, myNext]);

  // ── Footer ─────────────────────────────────────────────────────────────────
  const openable = doc?.status !== "draft" || !!doc?.confirmed_at || reference;
  const footer = [];
  let footerNote = "";

  if (openable) {
    footer.push(
      <button key="view" type="button" onClick={() => setViewing(doc)} className={SECONDARY_BTN}>
        <HiEye className="w-4 h-4" /> {reference ? "Open link" : "Read it"}
      </button>,
    );
    if (!reference) {
      footer.push(
        <button key="dl" type="button" onClick={download} disabled={!!busy} className={SECONDARY_BTN}>
          <HiDownload className="w-4 h-4" /> {busy === "download" ? "Preparing…" : "Download"}
        </button>,
      );
    }
  }
  if (plane.update && canEditOrgDraft(doc) && onEdit) {
    footer.push(
      <button key="edit" type="button" onClick={() => onEdit(doc)} disabled={!!busy} className={SECONDARY_BTN}>
        <HiPencilAlt className="w-4 h-4" /> {!reference && !doc?.confirmed_at ? "Edit & attach file" : "Edit"}
      </button>,
    );
  }
  if (plane.remove && canDeleteOrg(doc)) {
    footer.push(
      <button key="del" type="button" onClick={remove} disabled={!!busy} className={DANGER_BTN}>
        <HiTrash className="w-4 h-4" /> Delete
      </button>,
    );
  }
  if (plane.reject && canRejectProposal(doc)) {
    footer.push(
      <button key="decline" type="button" onClick={() => { setDialogError(""); setDeclining(true); }} disabled={!!busy} className={DANGER_BTN}>
        <HiBan className="w-4 h-4" /> Decline
      </button>,
    );
  }
  if (plane.retire && canRetire(doc)) {
    footer.push(
      <button key="retire" type="button" onClick={() => { setDialogError(""); setRetiring(true); }} disabled={!!busy} className={SECONDARY_BTN}>
        <HiBan className="w-4 h-4" /> Withdraw
      </button>,
    );
  }
  if (plane.replace && canReplaceOrg(doc)) {
    footer.push(
      <button key="rep" type="button" onClick={startNewVersion} disabled={!!busy} className={SECONDARY_BTN}>
        <HiUpload className="w-4 h-4" /> {busy === "replace" ? "Creating…" : "New version"}
      </button>,
    );
  }
  if (plane.publish && doc?.status === "draft") {
    const blocked = publishBlocker(doc);
    footer.push(
      <button key="pub" type="button" onClick={publish} disabled={!!busy || !!blocked} title={blocked || undefined} className={PRIMARY_BTN}>
        <HiPaperAirplane className="w-4 h-4" /> {busy === "publish" ? "Publishing…" : "Publish"}
      </button>,
    );
    if (blocked) footerNote = blocked;
  }

  if (plane.myEvidence && myDone) {
    footer.push(
      <button key="receipt" type="button" onClick={() => setReceipt(true)} className={SECONDARY_BTN}>
        <HiShieldCheck className="w-4 h-4" /> View receipt
      </button>,
    );
  }
  if (canAct) {
    footer.push(
      <button key="act" type="button" onClick={() => { setActError(null); setActing(myNext); }} disabled={!!busy} className={PRIMARY_BTN}>
        {myNext === "sign" ? <HiPencilAlt className="w-4 h-4" /> : <HiBadgeCheck className="w-4 h-4" />}
        {myNext === "sign" ? "Sign document" : "Acknowledge"}
      </button>,
    );
  }

  if (plane.key === "manager") {
    footerNote = doc?.status === "draft"
      ? "HR reviews your proposal. You can keep editing it until they decide."
      : "Managers propose; HR issues, withdraws and declines.";
  }
  if (plane.key === "self") {
    if (canAct) footerNote = myNext === "sign" ? "Read it, then sign by typing your name." : "Read it, then confirm you've acknowledged it.";
    else if (myDone) footerNote = "Your receipt is permanent proof of what you did and when.";
    else footerNote = "Opening it records that you've read it.";
  }

  // ── Content ────────────────────────────────────────────────────────────────
  const audienceLine = describeAudience(doc, resolveTarget);
  const recipientCount = Number(doc?.recipient_count) || 0;

  const stats = plane.key === "self"
    ? [
      { label: "Status", value: statusMeta.label, icon: HiCheckCircle, hint: statusMeta.hint },
      myBlock?.state && (myBlock.required || myBlock.signatureRequired)
        ? { label: "Where you're at", value: complianceStateMeta(myBlock.state).label, icon: HiEye, hint: mine?.state ? recipientStateMeta(mine.state).label : "" }
        : { label: "Where you're at", value: mine?.state ? recipientStateMeta(mine.state).label : "N/A", icon: HiEye, hint: mine?.state ? recipientStateMeta(mine.state).hint : "" },
      { label: "To do by", value: myBlock?.dueOn ? fmtDate(myBlock.dueOn) : "No deadline", icon: HiClock, hint: myDone ? "" : dueLabel(myBlock?.daysRemaining) },
      { label: reference ? "Stored as" : "File", value: reference ? "External link" : `${contentTypeLabel(doc?.content_type)} · ${formatBytes(doc?.size_bytes)}`, icon: HiDocumentText },
    ]
    : [
      { label: "Status", value: statusMeta.label, icon: HiCheckCircle, hint: statusMeta.hint },
      { label: "Version", value: `v${doc?.version || 1}`, icon: HiCollection },
      { label: "Goes to", value: hasRecipients(doc) ? `${recipientCount} ${recipientCount === 1 ? "person" : "people"}` : orgWide ? "Everyone" : "Selected audience", icon: HiUserGroup },
      { label: reference ? "Stored as" : "File", value: reference ? "External link" : doc?.confirmed_at ? `${contentTypeLabel(doc?.content_type)} · ${formatBytes(doc?.size_bytes)}` : "Not attached yet", icon: HiDocumentText },
    ];

  return (
    <>
      <DetailDialog
        eyebrow={typeName || "Organisation document"}
        icon={HiDocumentText}
        title={doc?.title || "Document"}
        subtitle={[
          `Version ${doc?.version || 1}`,
          proposal && plane.key !== "self" ? `Proposed by ${who(doc.proposed_by, "a manager")}` : null,
        ].filter(Boolean).join(" · ")}
        badge={<OrgStatusBadge status={status} />}
        loading={loading}
        onClose={onClose}
        footer={<>{footerNote && <DetailFooterNote>{footerNote}</DetailFooterNote>}{footer}</>}
      >
        {doc?.status === "rejected" && doc?.rejection_reason && (
          <Banner tone="rose" icon={HiExclamationCircle} title="Why HR declined it">{doc.rejection_reason}</Banner>
        )}
        {doc?.status === "retired" && (
          <Banner tone="slate" icon={HiBan} title="Withdrawn">
            {doc.retirement_reason || "This document is no longer in force."}
            {doc.retired_at ? `\n\nWithdrawn ${fmtDateTime(doc.retired_at)} by ${who(doc.retired_by, "HR")}.` : ""}
          </Banner>
        )}
        {doc?.status === "superseded" && (
          <Banner tone="slate" icon={HiCollection} title="A newer version replaced this">
            Kept so the people who received this version still have what they were given.
          </Banner>
        )}
        {status === "scheduled" && (
          <Banner tone="indigo" icon={HiCalendar} title="Not in force yet">
            Published and visible to everyone who received it, and it comes into force on {fmtDate(doc.effective_from)}.
          </Banner>
        )}
        {status === "expired" && (
          <Banner tone="fuchsia" icon={HiClock} title="Past its end date">
            It stopped applying on {fmtDate(doc.effective_to)}. Publish a new version, or withdraw it to take it off the list.
          </Banner>
        )}
        {doc?.status === "published" && recipientCount === 0 && (
          <Banner tone="fuchsia" icon={HiExclamationCircle} title="Nobody received this">
            The audience matched no one when it was published. Check the audience below, then use Top up to issue it to the people who now match.
          </Banner>
        )}
        {doc?.status === "draft" && !reference && !doc?.confirmed_at && (
          <Banner tone="fuchsia" icon={HiUpload} title="The file hasn't arrived">
            This draft can’t be published until its file is in storage. Open Edit &amp; attach file to send it.
          </Banner>
        )}
        {myRow && myNext && myWindow.open && (
          myBlock?.isOverdue ? (
            <Banner tone="rose" icon={HiBell} title={`${dueLabel(myBlock.daysRemaining) || "Overdue"} — please ${myNext === "sign" ? "sign" : "acknowledge"} it now`}>
              {myBlock.dueOn ? `It was due on ${fmtDate(myBlock.dueOn)}. ` : ""}
              {myBlock.isBlocking ? "Your organisation treats overdue documents as a priority, so please do this before anything else." : "Read it, then use the button below."}
            </Banner>
          ) : (
            <Banner tone="indigo" icon={HiBell} title={myNext === "sign" ? "Your signature is needed" : "Please acknowledge this"}>
              {myBlock?.dueOn
                ? `Please ${myNext === "sign" ? "sign" : "acknowledge"} it by ${fmtDate(myBlock.dueOn)}${dueLabel(myBlock.daysRemaining) ? ` (${dueLabel(myBlock.daysRemaining).toLowerCase()})` : ""}.`
                : `Read it, then ${myNext === "sign" ? "sign it by typing your name" : "confirm you've read it"}. There's no deadline.`}
            </Banner>
          )
        )}
        {myRow && myNext && !myWindow.open && (
          <Banner tone="slate" icon={HiClock} title={myWindow.reason === "scheduled" ? "Not open yet" : "No longer open"}>
            {myWindow.reason === "scheduled"
              ? `You can ${myNext === "sign" ? "sign" : "acknowledge"} it from ${fmtDate(doc.effective_from)}, when it comes into force.`
              : myWindow.reason === "superseded"
                ? "A newer version replaced this one. Look for the new version in Company Documents."
                : "It's no longer in force, so it can't be acknowledged or signed. Ask HR if you think it should be."}
          </Banner>
        )}
        {myRow && mine?.state === "waived" && (
          <Banner tone="violet" icon={HiCheckCircle} title="HR excused you from this">
            Nothing more is needed from you for this document.
          </Banner>
        )}
        {myRow && myDone && (
          <Banner tone="violet" icon={HiShieldCheck} title={mine?.state === "signed" ? "You signed this" : "You acknowledged this"}>
            {myBlock?.signedAt || myBlock?.acknowledgedAt
              ? `On ${fmtDateTime(myBlock.signedAt || myBlock.acknowledgedAt)}. `
              : ""}Open your receipt to see the full record.
          </Banner>
        )}

        <DetailStats items={stats} />

        {doc?.description && (
          <DetailSection title="What this is about" icon={HiDocumentText}>
            <DetailText label="">{doc.description}</DetailText>
          </DetailSection>
        )}

        <DetailSection title="Details" icon={HiDocumentText}>
          <DetailGrid
            items={[
              ["Kind of document", typeName || null],
              ["In force from", doc?.effective_from ? fmtDate(doc.effective_from) : "As soon as it's published"],
              ["In force until", doc?.effective_to ? fmtDate(doc.effective_to) : "No end date"],
              ["Acknowledgement", doc?.requires_acknowledgement
                ? (doc.acknowledgement_due_days ? `Required within ${doc.acknowledgement_due_days} ${doc.acknowledgement_due_days === 1 ? "day" : "days"}` : "Required, within your organisation's default time")
                : "Not required"],
              ["Signature", doc?.requires_signature ? "Required — people type their name to sign" : "Not required"],
              ["File name", reference ? "External link" : doc?.file_name || null],
              ["Visibility", doc?.is_confidential ? "Confidential — HR and recipients only" : "Standard"],
              ...(plane.key === "self" ? [] : [
                ["Written by", doc?.created_by ? who(doc.created_by, "HR") : null],
                ["Created", doc?.created_at ? fmtDateTime(doc.created_at) : null],
                ["Published by", doc?.published_by ? who(doc.published_by, "HR") : null],
                ["Published", doc?.published_at ? fmtDateTime(doc.published_at) : null],
              ]),
            ]}
          />
          {doc?.is_confidential && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 mt-3">
              <HiLockClosed className="w-3.5 h-3.5" /> Hidden from everyone it wasn’t issued to.
            </p>
          )}
        </DetailSection>

        {/* The audience is HR's and the proposing manager's business, never the recipient's. */}
        {plane.key !== "self" && (
          <DetailSection
            title="Who gets it"
            icon={HiUserGroup}
            action={hasRecipients(doc) ? <DetailPill tone="muted">Fixed at publish</DetailPill> : <DetailPill tone="muted">Not fixed yet</DetailPill>}
          >
            <p className="text-sm font-semibold text-slate-700">{audienceLine}</p>
            {showCriteria && (
              <div className="mt-3 space-y-2">
                {TARGET_DIMENSIONS.map((dimension) => {
                  const ids = criteria[dimension.key] || [];
                  if (!ids.length) return null;
                  return (
                    <div key={dimension.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-36 shrink-0">{dimension.label}</span>
                      <span className="flex flex-wrap gap-1">
                        {ids.map((targetId) => (
                          <span key={targetId} className="inline-flex items-center px-2 py-0.5 rounded-md border border-purple-100 bg-purple-50 text-purple-700 text-[11px] font-semibold">
                            {targetLabel(doc, dimension, targetId, resolveTarget) || "No longer available"}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {!hasRecipients(doc) && (
              <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                The exact list of people is worked out when this is published. Until then it can still be changed.
              </p>
            )}
          </DetailSection>
        )}

        {plane.recipients && hasRecipients(doc) && (
          <OrgRecipientsSection
            doc={doc}
            plane={plane}
            people={people}
            nameOf={nameOf}
            showToast={showToast}
            onChanged={refreshAll}
          />
        )}

        {plane.versions && (
          <DetailSection
            title="Version history"
            icon={HiCollection}
            defaultOpen={false}
            action={<DetailPill tone="muted">{versions.rows.length || 1} {versions.rows.length === 1 || !versions.rows.length ? "version" : "versions"}</DetailPill>}
          >
            {versions.loading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : versions.error ? (
              <p className="text-xs font-semibold text-rose-700">{documentErrorMessage(versions.error, "Couldn't load the version history.")}</p>
            ) : (
              <ol className="relative border-l-2 border-purple-100 ml-2 space-y-3">
                {(versions.rows.length ? versions.rows : [doc]).map((v) => {
                  const current = v.id === doc?.id;
                  return (
                    <li key={v.id} className="pl-5 relative">
                      <span className={`absolute -left-[9px] top-3 w-4 h-4 rounded-full border-2 border-white ${current ? "bg-purple-600" : "bg-purple-200"}`} />
                      <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${current ? "border-purple-200 bg-purple-50/50" : "border-slate-200 bg-white"}`}>
                        <span className="text-xs font-bold text-purple-700 w-8 shrink-0">v{v.version}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {v.title}{current ? <span className="ml-2 text-[10px] font-bold text-purple-600">This one</span> : null}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {v.published_at ? `Issued ${fmtDate(v.published_at)}` : "Never issued"}
                            {Number(v.recipient_count) ? ` · ${v.recipient_count} ${Number(v.recipient_count) === 1 ? "person" : "people"}` : ""}
                          </p>
                        </div>
                        <OrgStatusBadge status={orgDisplayStatus(v)} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </DetailSection>
        )}

        {plane.auditLogs && (
          <DetailSection
            title="Audit trail"
            icon={HiUserCircle}
            defaultOpen={false}
            action={<DetailPill tone="muted">{audit.rows.length} {audit.rows.length === 1 ? "event" : "events"}</DetailPill>}
          >
            {audit.loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : audit.error ? (
              <p className="text-xs font-semibold text-rose-700">{documentErrorMessage(audit.error, "Couldn't load the audit trail.")}</p>
            ) : audit.rows.length === 0 ? (
              <p className="text-xs text-slate-400">No events recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {audit.rows.map((ev) => (
                  <li key={ev.id} className="py-2.5 flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">
                        {orgAuditActionLabel(ev.action)}
                        {Number(ev.new_values?.recipient_count) >= 0 && ev.action === "org_document.published" && (
                          <span className="font-semibold text-slate-500"> · {ev.new_values.recipient_count} recipients</span>
                        )}
                        {ev.new_values?.scope_override && <span className="font-semibold text-fuchsia-700"> · scope override</span>}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {who(ev.actor_id, "System")} · {fmtDateTime(ev.created_at)}{ev.ip_address ? ` · ${ev.ip_address}` : ""}
                      </p>
                      {ev.reason && <p className="text-[11px] text-slate-600 mt-0.5 italic break-words">“{ev.reason}”</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        )}
      </DetailDialog>

      {viewing && (
        <AttachmentViewerDialog
          attachment={viewing}
          getViewUrl={plane.viewUrl}
          errorMessage={documentErrorMessage}
          fetchReferences
          onClose={() => {
            setViewing(null);
            loadAudit();
            // #72 flips pending → viewed the first time, so re-read my own state.
            if (plane.key === "self") load();
          }}
        />
      )}

      {acting === "acknowledge" && (
        <AcknowledgeDialog
          doc={doc}
          opened={opened}
          onReadFirst={() => { setActing(null); setViewing(doc); }}
          busy={busy === "acknowledge"}
          error={actError ? documentErrorMessage(actError, "Couldn't record your acknowledgement.") : ""}
          onSubmit={acknowledge}
          onClose={() => { if (busy !== "acknowledge") setActing(null); }}
        />
      )}

      {acting === "sign" && (
        <SignDialog
          doc={doc}
          opened={opened}
          onReadFirst={() => { setActing(null); setViewing(doc); }}
          busy={busy === "sign"}
          error={actError}
          onSubmit={sign}
          onClose={() => { if (busy !== "sign") setActing(null); }}
        />
      )}

      {receipt && plane.myEvidence && (
        <EvidenceDialog doc={doc} audience="self" load={() => plane.myEvidence(id)} onClose={() => setReceipt(false)} />
      )}

      {retiring && (
        <ReasonDialog
          title="Withdraw this document?"
          description={`“${doc.title}” stops being in force. Everyone who received it keeps their copy, marked as withdrawn. This can't be undone — to bring it back you publish a new version.`}
          label="Why it's being withdrawn"
          placeholder="e.g. Replaced by the 2027 policy agreed at the January board meeting."
          confirmLabel="Withdraw document"
          tone="danger"
          minLength={10}
          maxLength={500}
          busy={busy === "retire"}
          error={dialogError}
          onClose={() => { if (busy !== "retire") setRetiring(false); }}
          onSubmit={retire}
        />
      )}

      {declining && (
        <ReasonDialog
          title="Decline this proposal?"
          description={`${who(doc.proposed_by, "The manager")} sees exactly what you write here, so say what would need to change. Nothing is issued to anyone.`}
          label="Why you're declining it"
          placeholder="e.g. The incidents aren't documented in the attendance record yet — add those first."
          confirmLabel="Decline proposal"
          tone="danger"
          minLength={10}
          maxLength={500}
          busy={busy === "reject"}
          error={dialogError}
          onClose={() => { if (busy !== "reject") setDeclining(false); }}
          onSubmit={decline}
        />
      )}
    </>
  );
}
