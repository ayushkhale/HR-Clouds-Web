// ─────────────────────────────────────────────────────────────────────────────
// documents/DocumentDetailDialog.jsx — Everything about one employee document,
// opened by clicking its row. The plane decides the actions:
//   hr      — view, verify / reject (#18/#19), replace (#20), delete (#21),
//             versions (#16) and the audit trail (#22)
//   manager — view, recommend verify / reject (#33, Tier B)
//   self    — view, replace (#41), delete (#42), versions (#39),
//             "upload again" after a rejection, finish or discard a draft
//
// The row opens instantly; the detail read then replaces it so a decision is
// never taken on a stale status. Every action refreshes the caller's list.
//
// Since Phase 5 every read also carries `tags` — HR's own labels for finding a
// document again later (#121). They are shown to whoever can see the document,
// because a tag is context rather than a secret, but only HR can change them.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiBan, HiCheck, HiClipboardCheck, HiClock, HiDocumentText, HiDownload, HiEye, HiLockClosed,
  HiRefresh, HiShieldCheck, HiTrash, HiUpload, HiUserCircle, HiCollection, HiExclamationCircle, HiHashtag,
} from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailText } from "../components/DetailDialog";
import AttachmentViewerDialog from "../components/AttachmentViewerDialog";
import ReasonDialog from "../components/ReasonDialog";
import { documentErrorMessage, isAlreadyDecided, isStaleRecommendation } from "../utils/documentErrors";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import {
  arrayPayload, auditActionLabel, canOpenFile, canReplace, contentTypeLabel, daysToExpiry, displayStatus, docStatusMeta,
  formatBytes, groupLabel, isReferenceDoc, isReviewable, selfDeleteRule, sourceLabel,
} from "./documentMeta";
import { DocStatusBadge, DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN, FIELD, LABEL } from "./ui";
import { TagChips } from "./phase5Ui";
import TagsDialog from "./TagsDialog";
import { supportsTags, tagsOf } from "./reportMeta";
import { triggerDownload } from "./documentUpload";
import { useAuth } from "../contexts/AuthContext";

const RECOMMENDATION_LABEL = { verify: "Recommends verifying", reject: "Recommends rejecting", none: "No recommendation" };

/* ── Manager Tier-B recommendation ─────────────────────────────────────────── */
function RecommendDialog({ doc, subjectName, busy, error, onSubmit, onClose }) {
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const tooLong = note.trim().length > 500;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const options = [
    { value: "verify", label: "Recommend verifying", blurb: "The details match what you checked.", icon: HiCheck, on: "border-violet-400 bg-violet-50 ring-2 ring-violet-100", text: "text-violet-800" },
    { value: "reject", label: "Recommend rejecting", blurb: "Something is wrong or unreadable.", icon: HiBan, on: "border-rose-300 bg-rose-50 ring-2 ring-rose-100", text: "text-rose-700" },
  ];

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (choice && !tooLong && !busy) onSubmit(choice, note.trim() || null); }}
        role="dialog" aria-modal="true" aria-label="Recommend a decision"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Recommend a decision</h2>
          <p className="text-xs text-slate-500 mt-0.5">{doc?.title}{subjectName ? ` · ${subjectName}` : ""}. HR sees your recommendation and note before deciding.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Recommendation">
            {options.map((o) => {
              const active = choice === o.value;
              const Icon = o.icon;
              return (
                <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => setChoice(o.value)}
                  className={`text-left px-3.5 py-3 rounded-xl border transition ${active ? o.on : "border-slate-200 hover:border-purple-200"}`}>
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${active ? o.text : "text-slate-700"}`}><Icon className="w-4 h-4" /> {o.label}</span>
                  <span className="block text-[11px] text-slate-500 mt-1 leading-snug">{o.blurb}</span>
                </button>
              );
            })}
          </div>
          <div>
            <label htmlFor="rec-note" className={LABEL}>Note for HR <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
            <textarea id="rec-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Inspected the original certificate in our 1-on-1; details match." className={`${FIELD} resize-none`} />
            <p className={`text-[10px] mt-1 text-right ${tooLong ? "text-rose-600 font-semibold" : "text-slate-400"}`}>{note.trim().length}/500</p>
          </div>
          {error && <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={!choice || tooLong || busy} className={PRIMARY_BTN}>{busy ? "Sending…" : "Send recommendation"}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.doc           the list row (opens instantly)
 * @param {object} props.plane         DOCUMENT_PLANES entry
 * @param {Map}    [props.types]       type id → type
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {(msg: string, type?: string) => void} props.showToast
 * @param {() => void} props.onChanged
 * @param {(doc: object) => void} [props.onReplace]      open the replace upload
 * @param {(doc: object) => void} [props.onUploadAgain]  self: new upload of the same type after a rejection
 * @param {() => void} props.onClose
 */
export default function DocumentDetailDialog({ doc: initial, plane, types, nameOf, showToast, onChanged, onReplace, onUploadAgain, onClose }) {
  const [doc, setDoc] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState({ rows: [], loading: !!plane.versions, error: null });
  const [audit, setAudit] = useState({ rows: [], loading: !!plane.auditLogs, error: null });
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const { user } = useAuth();
  const id = initial?.id;
  const who = (userId, fallback) => {
    if (userId && userId === user?.id) return "You";
    return nameOf ? nameOf(userId, fallback) : fallback ?? "N/A";
  };
  const subjectName = plane.key === "self" ? "" : who(doc?.user_id, "This employee");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await plane.get(id);
      const fresh = res?.data ?? res;
      if (fresh?.id) setDoc((cur) => ({ ...cur, ...fresh }));
    } catch (err) {
      // A 404 here means it was removed or moved out of reach since the list loaded.
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

  const type = types?.get?.(doc?.document_type_id) || null;
  const status = displayStatus(doc);
  const statusMeta = docStatusMeta(status);
  const reference = isReferenceDoc(doc);
  const expiryDays = daysToExpiry(doc);

  const refreshAll = async () => {
    onChanged?.();
    await Promise.all([load(), loadVersions(), loadAudit()]);
  };

  // ── Actions ────────────────────────────────────────────────────────────
  const download = async () => {
    setBusy("download");
    try {
      const res = await plane.viewUrl(id, { disposition: "attachment" });
      const url = (res?.data ?? res)?.view_url;
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
      loadAudit();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't prepare the download."), "error");
    } finally {
      setBusy("");
    }
  };

  const verify = async () => {
    const rec = doc?.recommendation && doc.recommendation !== "none"
      ? `\n\nManager: ${RECOMMENDATION_LABEL[doc.recommendation]}${doc.recommendation_note ? ` — “${doc.recommendation_note}”` : ""}.`
      : "";
    const expired = expiryDays !== null && expiryDays < 0 ? "\n\nIts expiry date has passed, so it will be recorded as expired." : "";
    if (!(await window.confirm(`Verify “${doc.title}” for ${subjectName}?${rec}${expired}`))) return;
    setBusy("verify");
    const run = (acknowledge) => plane.verify(id, acknowledge ? { acknowledge_stale_recommendation: true } : {});
    try {
      try {
        await run(false);
      } catch (err) {
        if (!isStaleRecommendation(err)) throw err;
        const ok = await window.confirm(
          `The manager who recommended this (${who(doc.recommended_by, "a former manager")}) no longer manages ${subjectName}.\n\nVerify anyway? This override is recorded in the audit trail.`,
        );
        if (!ok) return;
        await run(true);
      }
      showToast?.("Document verified");
      await refreshAll();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't verify this document."), "error");
      if (isAlreadyDecided(err)) refreshAll();
    } finally {
      setBusy("");
    }
  };

  const reject = async (reason) => {
    setBusy("reject");
    setDialogError("");
    try {
      await plane.reject(id, reason);
      setRejecting(false);
      showToast?.("Document rejected — the employee can see your reason");
      await refreshAll();
    } catch (err) {
      setDialogError(documentErrorMessage(err, "Couldn't reject this document."));
      if (isAlreadyDecided(err)) { setRejecting(false); refreshAll(); }
    } finally {
      setBusy("");
    }
  };

  const recommend = async (recommendation, note) => {
    setBusy("recommend");
    setDialogError("");
    try {
      const res = await plane.recommend(id, { recommendation, note });
      const next = res?.data ?? res;
      setRecommending(false);
      // With "manager direct authority" ON the recommendation is the decision.
      if (next?.status && next.status !== "pending_verification") {
        showToast?.(next.status === "rejected" ? "Rejected — your organisation lets managers decide directly" : "Verified — your organisation lets managers decide directly");
      } else {
        showToast?.("Recommendation sent to HR");
      }
      await refreshAll();
    } catch (err) {
      setDialogError(documentErrorMessage(err, "Couldn't send the recommendation."));
      if (isAlreadyDecided(err)) { setRecommending(false); refreshAll(); }
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    const draft = doc.status === "pending_upload";
    const message = draft
      ? `Discard the unfinished upload “${doc.title}”?`
      : plane.key === "hr"
        ? `Delete “${doc.title}” from ${subjectName}'s file?\n\nIt disappears from every list but stays in the audit trail.`
        : `Delete “${doc.title}”?\n\nThis can't be undone from your side.`;
    if (!(await window.confirm(message))) return;
    setBusy("delete");
    try {
      await plane.remove(id);
      showToast?.(draft ? "Draft discarded" : "Document deleted");
      onChanged?.();
      onClose();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't delete this document."), "error");
    } finally {
      setBusy("");
    }
  };

  const finishDraft = async () => {
    setBusy("confirm");
    try {
      await plane.confirm(id);
      showToast?.("Upload finished");
      await refreshAll();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "The file still hasn't arrived. Discard this draft and upload again."), "error");
    } finally {
      setBusy("");
    }
  };

  // ── Footer ─────────────────────────────────────────────────────────────
  const reviewable = isReviewable(doc);
  const canView = canOpenFile(doc, plane.key);
  // Listed but unopenable: say so instead of leaving a button that would fail.
  const hiddenFromManager = plane.key === "manager" && !!doc?.is_confidential;
  const selfDelete = plane.key === "self" ? selfDeleteRule(doc) : null;
  const footer = [];
  let footerNote = "";

  if (canView) {
    footer.push(
      <button key="view" type="button" onClick={() => setViewing(doc)} className={SECONDARY_BTN}><HiEye className="w-4 h-4" /> {reference ? "Open link" : "View"}</button>,
    );
    if (!reference) footer.push(<button key="dl" type="button" onClick={download} disabled={!!busy} className={SECONDARY_BTN}><HiDownload className="w-4 h-4" /> {busy === "download" ? "Preparing…" : "Download"}</button>);
  }
  // Only once the detail read has come back, and only when it carried `tags`:
  // a server without them would answer this button with a 404.
  if (plane.updateTags && supportsTags(doc)) {
    footer.push(
      <button key="tags" type="button" onClick={() => setTagging(true)} disabled={!!busy} className={SECONDARY_BTN}>
        <HiHashtag className="w-4 h-4" /> {tagsOf(doc).length ? "Edit tags" : "Add tags"}
      </button>,
    );
  }
  if (doc?.status === "pending_upload" && plane.confirm) {
    footer.push(<button key="finish" type="button" onClick={finishDraft} disabled={!!busy} className={SECONDARY_BTN}><HiRefresh className="w-4 h-4" /> {busy === "confirm" ? "Checking…" : "Check upload again"}</button>);
  }
  if (plane.remove && doc?.status !== "deleted" && (plane.key === "hr" || selfDelete?.allowed)) {
    footer.push(<button key="del" type="button" onClick={remove} disabled={!!busy} className={DANGER_BTN} title={selfDelete?.note || undefined}><HiTrash className="w-4 h-4" /> {doc?.status === "pending_upload" ? "Discard" : "Delete"}</button>);
  }
  if (plane.replace && onReplace && canReplace(doc)) {
    footer.push(<button key="rep" type="button" onClick={() => onReplace(doc)} disabled={!!busy} className={SECONDARY_BTN}><HiUpload className="w-4 h-4" /> Upload new version</button>);
  }
  if (plane.key === "self" && doc?.status === "rejected" && onUploadAgain) {
    footer.push(<button key="again" type="button" onClick={() => onUploadAgain(doc)} className={PRIMARY_BTN}><HiUpload className="w-4 h-4" /> Upload a corrected copy</button>);
  }
  if (plane.verify && reviewable) {
    footer.push(
      <button key="rej" type="button" onClick={() => { setDialogError(""); setRejecting(true); }} disabled={!!busy} className={DANGER_BTN}><HiBan className="w-4 h-4" /> Reject</button>,
      <button key="ver" type="button" onClick={verify} disabled={!!busy} className={PRIMARY_BTN}><HiShieldCheck className="w-4 h-4" /> {busy === "verify" ? "Verifying…" : "Verify"}</button>,
    );
  }
  if (plane.recommend && reviewable) {
    footer.push(<button key="rec" type="button" onClick={() => { setDialogError(""); setRecommending(true); }} disabled={!!busy} className={PRIMARY_BTN}><HiClipboardCheck className="w-4 h-4" /> {doc?.recommendation && doc.recommendation !== "none" ? "Change recommendation" : "Recommend"}</button>);
  }
  if (plane.key === "manager" && !reviewable) footerNote = "Managers can view and recommend; HR verifies, replaces and deletes.";
  if (hiddenFromManager) footerNote = "This document is confidential — only HR and the employee can open the file.";
  if (plane.key === "self" && selfDelete?.note && selfDelete.allowed && doc?.status === "available") footerNote = selfDelete.note;
  if (plane.key === "self" && doc?.status === "pending_verification") footerNote = "In review. You can still delete it if you uploaded it by mistake.";

  const recommendation = doc?.recommendation && doc.recommendation !== "none" ? doc.recommendation : null;
  const hasReview = recommendation || doc?.recommended_by || doc?.approved_by || doc?.rejection_reason;

  return (
    <>
      <DetailDialog
        eyebrow={type?.name || "Document"}
        icon={HiDocumentText}
        title={doc?.title || "Document"}
        subtitle={[subjectName, `Version ${doc?.version || 1}`].filter(Boolean).join(" · ")}
        badge={<DocStatusBadge status={status} />}
        loading={loading}
        onClose={onClose}
        footer={<>{footerNote && <DetailFooterNote>{footerNote}</DetailFooterNote>}{footer}</>}
      >
        {status === "rejected" && doc?.rejection_reason && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-rose-800">Why it was rejected</p>
              <p className="text-sm text-rose-700 mt-0.5 whitespace-pre-wrap break-words">{doc.rejection_reason}</p>
            </div>
          </div>
        )}
        {(status === "expiring_soon" || status === "expired") && (
          <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${status === "expired" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800"}`}>
            <HiClock className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold">
              {status === "expired" ? `Expired on ${fmtDate(doc.expires_on)}.` : `Expires in ${expiryDays} ${expiryDays === 1 ? "day" : "days"} (${fmtDate(doc.expires_on)}).`}
              {canReplace(doc) && plane.replace ? " Upload the renewed copy as a new version." : ""}
            </p>
          </div>
        )}

        <DetailStats
          items={[
            { label: "Status", value: statusMeta.label, icon: HiShieldCheck, hint: statusMeta.hint },
            { label: "Version", value: `v${doc?.version || 1}`, icon: HiCollection },
            { label: "Expires", value: doc?.expires_on ? fmtDate(doc.expires_on) : "Never", icon: HiClock },
            { label: reference ? "Stored as" : "File", value: reference ? "External link" : `${contentTypeLabel(doc?.content_type)} · ${formatBytes(doc?.size_bytes)}`, icon: HiDocumentText },
          ]}
        />

        <DetailSection title="Document" icon={HiDocumentText}>
          <DetailGrid
            items={[
              ["Type", type?.name || null],
              ["Category", type?.group ? groupLabel(type.group) : null],
              ["Document number", doc?.document_number_last4 ? `•••• ${doc.document_number_last4}` : null],
              ["Issued on", doc?.issued_on ? fmtDate(doc.issued_on) : null],
              ["Expires on", doc?.expires_on ? fmtDate(doc.expires_on) : null],
              ["File name", reference ? "External link" : doc?.file_name],
              ["Added", sourceLabel(doc?.source)],
              ["Added by", doc?.uploaded_by ? who(doc.uploaded_by, plane.key === "self" ? "You" : "N/A") : null],
              ["Added on", doc?.created_at ? fmtDateTime(doc.created_at) : null],
              ["Received on", doc?.confirmed_at ? fmtDateTime(doc.confirmed_at) : null],
              ["Visibility", doc?.is_confidential ? "Confidential — HR and employee only" : "Standard"],
              ...(type?.is_statutory ? [["Statutory", "Yes — kept for compliance"]] : []),
            ]}
          />
          {doc?.is_confidential && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 mt-3"><HiLockClosed className="w-3.5 h-3.5" /> Hidden from managers.</p>
          )}
          {supportsTags(doc) && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tags</p>
              <TagChips
                tags={tagsOf(doc)}
                empty={<span className="text-xs text-slate-400">No tags. {plane.updateTags ? "Add one to find this again in a search." : ""}</span>}
              />
            </div>
          )}
        </DetailSection>

        {hasReview && (
          <DetailSection title="Review" icon={HiClipboardCheck}>
            <DetailGrid
              items={[
                ["Manager recommendation", recommendation ? RECOMMENDATION_LABEL[recommendation] : doc?.recommended_by ? "Recorded, then decided" : null],
                ["Recommended by", doc?.recommended_by ? who(doc.recommended_by, "A manager") : null],
                ["Recommended on", doc?.recommended_at ? fmtDateTime(doc.recommended_at) : null],
                ["Decided by", doc?.approved_by ? who(doc.approved_by, plane.key === "self" ? "HR" : "N/A") : null],
                ["Decided on", doc?.actioned_at ? fmtDateTime(doc.actioned_at) : null],
              ]}
              cols={3}
            />
            {doc?.recommendation_note && <div className="mt-4"><DetailText label="Manager's note">{doc.recommendation_note}</DetailText></div>}
            {doc?.rejection_reason && status !== "rejected" && <div className="mt-4"><DetailText label="Rejection reason">{doc.rejection_reason}</DetailText></div>}
          </DetailSection>
        )}

        {plane.versions && (
          <DetailSection title="Version history" icon={HiCollection} action={<DetailPill tone="muted">{versions.rows.length || 1} {versions.rows.length === 1 || !versions.rows.length ? "version" : "versions"}</DetailPill>}>
            {versions.loading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : versions.error ? (
              <p className="text-xs font-semibold text-rose-700">{documentErrorMessage(versions.error, "Couldn't load the version history.")}</p>
            ) : (
              <ol className="relative border-l-2 border-purple-100 ml-2 space-y-3">
                {(versions.rows.length ? versions.rows : [doc]).map((v) => {
                  const vStatus = displayStatus(v);
                  const current = v.id === doc?.id;
                  const viewable = !["pending_upload", "deleted"].includes(v.status);
                  return (
                    <li key={v.id} className="pl-5 relative">
                      <span className={`absolute -left-[9px] top-3 w-4 h-4 rounded-full border-2 border-white ${current ? "bg-purple-600" : "bg-purple-200"}`} />
                      <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${current ? "border-purple-200 bg-purple-50/50" : "border-slate-200 bg-white"}`}>
                        <span className="text-xs font-bold text-purple-700 w-8 shrink-0">v{v.version}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">{v.title}{current ? <span className="ml-2 text-[10px] font-bold text-purple-600">This one</span> : null}</p>
                          <p className="text-[11px] text-slate-500">{fmtDateTime(v.created_at)}{v.file_name ? ` · ${v.file_name}` : ""}</p>
                        </div>
                        <DocStatusBadge status={vStatus} />
                        {viewable && (
                          <button type="button" onClick={() => setViewing(v)} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50" aria-label={`View version ${v.version}`} title="View this version">
                            <HiEye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </DetailSection>
        )}

        {plane.auditLogs && (
          <DetailSection title="Audit trail" icon={HiUserCircle} defaultOpen={false} action={<DetailPill tone="muted">{audit.rows.length} {audit.rows.length === 1 ? "event" : "events"}</DetailPill>}>
            {audit.loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : audit.error ? (
              <p className="text-xs font-semibold text-rose-700">{documentErrorMessage(audit.error, "Couldn't load the audit trail.")}</p>
            ) : audit.rows.length === 0 ? (
              <p className="text-xs text-slate-400">No events recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {audit.rows.map((ev) => {
                  const from = ev.old_values?.status;
                  const to = ev.new_values?.status;
                  return (
                    <li key={ev.id} className="py-2.5 flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800">
                          {auditActionLabel(ev.action)}
                          {from && to && from !== to && <span className="font-semibold text-slate-500"> · {docStatusMeta(from).short} → {docStatusMeta(to).short}</span>}
                        </p>
                        <p className="text-[11px] text-slate-500">{who(ev.actor_id, "System")} · {fmtDateTime(ev.created_at)}{ev.ip_address ? ` · ${ev.ip_address}` : ""}</p>
                        {ev.reason && <p className="text-[11px] text-slate-600 mt-0.5 italic break-words">“{ev.reason}”</p>}
                      </div>
                    </li>
                  );
                })}
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
          onClose={() => { setViewing(null); loadAudit(); }}
        />
      )}

      {tagging && (
        <TagsDialog
          doc={doc}
          save={plane.updateTags}
          onDone={(tags) => {
            setTagging(false);
            setDoc((current) => ({ ...current, tags }));
            showToast?.(tags.length ? "Tags saved" : "Tags cleared");
            onChanged?.();
          }}
          onClose={() => setTagging(false)}
        />
      )}

      {rejecting && (
        <ReasonDialog
          title="Reject this document?"
          description={`“${doc.title}” for ${subjectName}. The employee sees exactly what you write here, so say what to fix.`}
          label="What's wrong"
          placeholder="e.g. The image is blurred — upload a clear colour scan of both sides."
          confirmLabel="Reject document"
          tone="danger"
          minLength={10}
          maxLength={500}
          busy={busy === "reject"}
          error={dialogError}
          onClose={() => { if (busy !== "reject") setRejecting(false); }}
          onSubmit={reject}
        />
      )}

      {recommending && (
        <RecommendDialog
          doc={doc}
          subjectName={subjectName}
          busy={busy === "recommend"}
          error={dialogError}
          onClose={() => setRecommending(false)}
          onSubmit={recommend}
        />
      )}
    </>
  );
}
