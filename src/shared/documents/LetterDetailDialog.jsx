// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterDetailDialog.jsx — Everything about one letter the company has
// issued, opened by clicking its row in the register (#141 detail, #59 the one
// recipient, #60 the version chain, #58 the history).
//
// The house record inspector, composed from DetailDialog — not a hand-rolled
// modal. Actions live in the footer, never in the row behind it.
//
// What this screen is FOR, and what shapes it:
//
//  · A letter is evidence. Somebody will open this because a bank, an embassy or
//    a tribunal has asked a question about a document the company signed. So the
//    order is: what it is, who has it and what they have done with it, then the
//    proof that the file is the one that was drawn — and only then the plumbing.
//
//  · The reference number is the first thing on screen, because it is the only
//    thing anybody quotes.
//
//  · The version chain is the whole story of a correction, so it is read from
//    #60 and shown as one line per version with its own number. An older version
//    keeps its number for ever; saying so here is what stops somebody "tidying
//    up" a superseded letter.
//
//  · The provenance block (#141 `generation`) is folded away by default. It
//    matters enormously and almost never — the checksum and the renderer version
//    answer "is this file the one you issued?" and nothing else.
//
//  · IDs NEVER APPEAR. The artifact id, the input hash and the group id are
//    machine facts; the two hashes are shown because a checksum IS the evidence
//    and has no human form, and they are labelled as such. Everything else is a
//    name, a date or a count.
//
// Withdrawing (#49) is offered here rather than only in Organisation Documents,
// because somebody who has just read a letter's history is exactly the person
// who needs it. Reissuing is the other way out and the one to prefer: withdrawal
// leaves the person with nothing, a reissue leaves them with a corrected letter.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiBadgeCheck, HiBan, HiCheckCircle, HiClock, HiCollection, HiDocumentText, HiDownload,
  HiExclamationCircle, HiEye, HiFingerPrint, HiLockClosed, HiRefresh, HiUser, HiUserGroup,
} from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText,
} from "../components/DetailDialog";
import AttachmentViewerDialog from "../components/AttachmentViewerDialog";
import ReasonDialog from "../components/ReasonDialog";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { documentErrorMessage, isOrgDocumentStale } from "../utils/documentErrors";
import { arrayPayload, contentTypeLabel, formatBytes, humanizeCode } from "./documentMeta";
import { triggerDownload } from "./documentUpload";
import { DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { OrgStatusBadge, RecipientStateBadge } from "./orgUi";
import { orgAuditActionLabel, orgDisplayStatus, orgStatusMeta, recipientStateMeta, rosterPayload } from "./orgDocumentMeta";
import { canReissueLetter, generationOf, reissueBlocker } from "./letterIssueMeta";

/** A coloured notice at the top — the one thing to know before reading on. */
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
 * @param {object} props.letter                the register row (opens instantly)
 * @param {object} props.api                   documentsAPI
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {Map} [props.types]                  type id → type, for the kind of document
 * @param {(msg: string, type?: string) => void} [props.showToast]
 * @param {() => void} [props.onChanged]       the register should re-read
 * @param {(letter: object) => void} [props.onReissue]
 * @param {() => void} props.onClose
 */
export default function LetterDetailDialog({
  letter: initial, api, nameOf, types, showToast, onChanged, onReissue, onClose,
}) {
  const id = initial?.id;
  const [doc, setDoc] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [roster, setRoster] = useState({ rows: [], loading: true });
  const [versions, setVersions] = useState({ rows: [], loading: true });
  const [audit, setAudit] = useState({ rows: [], loading: true });
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [dialogError, setDialogError] = useState("");

  // ── The letter ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = (await api.getLetter(id))?.data ?? null;
      // Merged, so a field the row carried survives a narrower projection.
      setDoc((cur) => ({ ...(cur || {}), ...(fresh || {}) }));
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => { load(); }, [load]);

  /** The one recipient (#59). A letter always has exactly one, which is the point. */
  const loadRoster = useCallback(async () => {
    if (!id) return;
    setRoster((r) => ({ ...r, loading: true }));
    try {
      const { rows } = rosterPayload(await api.getOrgRecipients(id, { limit: 5 }));
      setRoster({ rows, loading: false });
    } catch {
      // Context, not the point of the screen: a failure leaves the card out.
      setRoster({ rows: [], loading: false });
    }
  }, [api, id]);

  const groupId = doc?.document_group_id;
  const loadVersions = useCallback(async () => {
    if (!groupId) { setVersions({ rows: [], loading: false }); return; }
    setVersions((v) => ({ ...v, loading: true }));
    try {
      const rows = arrayPayload(await api.getOrgGroupVersions(groupId));
      setVersions({ rows, loading: false });
    } catch {
      setVersions({ rows: [], loading: false });
    }
  }, [api, groupId]);

  const loadAudit = useCallback(async () => {
    if (!id) return;
    setAudit((a) => ({ ...a, loading: true }));
    try {
      setAudit({ rows: arrayPayload(await api.getOrgAuditLogs(id)), loading: false });
    } catch {
      setAudit({ rows: [], loading: false });
    }
  }, [api, id]);

  useEffect(() => { loadRoster(); loadAudit(); }, [loadRoster, loadAudit]);
  useEffect(() => { loadVersions(); }, [loadVersions]);

  const refreshAll = useCallback(async () => {
    await load();
    loadRoster();
    loadVersions();
    loadAudit();
    onChanged?.();
  }, [load, loadRoster, loadVersions, loadAudit, onChanged]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const download = async () => {
    setBusy("download");
    try {
      const url = ((await api.orgGetViewUrl(id, { disposition: "attachment" }))?.data ?? {})?.view_url;
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
      loadAudit();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn’t prepare the download."), "error");
    } finally {
      setBusy("");
    }
  };

  const withdraw = async (reason) => {
    setBusy("retire");
    setDialogError("");
    try {
      await api.retireOrgDocument(id, reason);
      setWithdrawing(false);
      showToast?.("Withdrawn. The person it was issued to keeps their copy, marked as no longer in force.");
      await refreshAll();
    } catch (err) {
      setDialogError(documentErrorMessage(err, "Couldn’t withdraw this letter."));
      if (isOrgDocumentStale(err)) { setWithdrawing(false); refreshAll(); }
    } finally {
      setBusy("");
    }
  };

  // ── Reading the record ─────────────────────────────────────────────────────
  const status = orgDisplayStatus(doc);
  const statusMeta = orgStatusMeta(status);
  const generation = generationOf(doc);
  const typeName = types?.get?.(doc?.document_type_id)?.name || "";
  const subjectId = Array.isArray(doc?.included_users) && doc.included_users.length === 1 ? doc.included_users[0] : "";
  const subjectFromRoster = roster.rows[0]?.user_id || "";
  const who = nameOf ? nameOf(subjectId || subjectFromRoster, "A colleague") : "A colleague";
  const recipient = roster.rows[0] || null;

  const chain = useMemo(() => {
    const rows = Array.isArray(versions.rows) ? [...versions.rows] : [];
    rows.sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
    return rows;
  }, [versions.rows]);

  const canReissue = canReissueLetter(doc);
  const blocker = reissueBlocker(doc);

  const stats = [
    { label: "Status", value: statusMeta.label, icon: HiCheckCircle, hint: statusMeta.hint },
    { label: "Version", value: `v${doc?.version || 1}`, icon: HiCollection, hint: chain.length > 1 ? `${chain.length} versions in all` : "The only version" },
    { label: "Issued to", value: who, icon: HiUser },
    { label: "File", value: `${contentTypeLabel(doc?.content_type || "application/pdf")} · ${formatBytes(doc?.size_bytes)}`, icon: HiDocumentText },
  ];

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = [];
  let footerNote = "";

  footer.push(
    <button key="view" type="button" onClick={() => setViewing({ ...doc, content_type: doc?.content_type || "application/pdf" })} className={SECONDARY_BTN}>
      <HiEye className="w-4 h-4" /> Read it
    </button>,
  );
  footer.push(
    <button key="dl" type="button" onClick={download} disabled={!!busy} className={SECONDARY_BTN}>
      <HiDownload className="w-4 h-4" /> {busy === "download" ? "Preparing…" : "Download"}
    </button>,
  );
  if (doc?.status === "published") {
    footer.push(
      <button key="retire" type="button" onClick={() => { setDialogError(""); setWithdrawing(true); }} disabled={!!busy} className={DANGER_BTN}>
        <HiBan className="w-4 h-4" /> Withdraw
      </button>,
    );
  }
  if (canReissue && onReissue) {
    footer.push(
      <button key="reissue" type="button" onClick={() => onReissue(doc)} disabled={!!busy} className={PRIMARY_BTN}>
        <HiCollection className="w-4 h-4" /> Reissue
      </button>,
    );
    footerNote = "Reissuing keeps this copy on file and issues a corrected one with its own number.";
  } else if (blocker) {
    footerNote = blocker;
  }

  return (
    <>
      <DetailDialog
        eyebrow={doc?.reference_number || typeName || "Letter"}
        icon={HiDocumentText}
        title={doc?.title || "Letter"}
        subtitle={[
          `Version ${doc?.version || 1}`,
          doc?.published_at ? `Issued ${fmtDate(doc.published_at)}` : null,
        ].filter(Boolean).join(" · ")}
        badge={<OrgStatusBadge status={status} />}
        loading={loading}
        onClose={onClose}
        footer={<>{footerNote && <DetailFooterNote>{footerNote}</DetailFooterNote>}{footer}</>}
      >
        {loadError && (
          <Banner tone="rose" icon={HiExclamationCircle} title="Couldn’t load the full details">
            {documentErrorMessage(loadError, "This letter couldn’t be read. Refresh the register and try again.")}
          </Banner>
        )}

        {doc?.status === "superseded" && (
          <Banner tone="slate" icon={HiCollection} title="A newer version has replaced this">
            It is kept exactly as it went out, with its own reference number, so there is always a record of what was actually issued. Nothing about it can be changed.
          </Banner>
        )}
        {doc?.status === "retired" && (
          <Banner tone="slate" icon={HiBan} title="Withdrawn">
            {doc.retirement_reason || "This letter is no longer in force."}
            {doc.retired_at ? `\n\nWithdrawn ${fmtDateTime(doc.retired_at)}.` : ""}
          </Banner>
        )}
        {doc?.status === "published" && (
          <Banner tone="violet" icon={HiBadgeCheck} title="Live">
            {`This is the letter that counts${doc.reference_number ? `, and ${doc.reference_number} is the number to quote` : ""}. Whoever it was issued to can open and download it from their portal at any time.`}
          </Banner>
        )}

        <DetailStats items={stats} />

        <DetailSection title="The letter" icon={HiDocumentText} collapsible={false}>
          <DetailGrid
            items={[
              ["Reference number", doc?.reference_number || null],
              ["Kind of document", typeName || null],
              ["Issued to", who],
              ["Date on the letter", generation?.pinned_date ? fmtDate(generation.pinned_date) : doc?.published_at ? fmtDate(doc.published_at) : null],
              ["Published", doc?.published_at ? fmtDateTime(doc.published_at) : null],
              ["Published by", doc?.published_by ? (nameOf ? nameOf(doc.published_by, "HR") : "HR") : null],
              ["File name", doc?.file_name || null],
              ["Who can see it", doc?.is_confidential ? "You and the person it is about" : "Anyone your document rules allow"],
              ["Asked to confirm they’ve read it", doc?.requires_acknowledgement
                ? (doc.acknowledgement_due_days
                  ? `Yes, within ${doc.acknowledgement_due_days} ${doc.acknowledgement_due_days === 1 ? "day" : "days"}`
                  : "Yes")
                : "No"],
              ["Signature", doc?.requires_signature ? "Required" : "Not required"],
            ]}
          />
          {doc?.is_confidential && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 mt-3">
              <HiLockClosed className="w-3.5 h-3.5" /> Hidden from everyone except you and the person it is about.
            </p>
          )}
        </DetailSection>

        {recipient && (
          <DetailSection
            title="What they have done with it"
            icon={HiUserGroup}
            action={<RecipientStateBadge state={recipient.state} />}
          >
            <DetailGrid
              cols={3}
              items={[
                ["Where they’re at", recipientStateMeta(recipient.state).label],
                ["First opened", recipient.first_viewed_at ? fmtDateTime(recipient.first_viewed_at) : "Not opened yet"],
                ["Acknowledged", recipient.signed_at || recipient.acknowledged_at
                  ? fmtDateTime(recipient.signed_at || recipient.acknowledged_at)
                  : (doc?.requires_acknowledgement || doc?.requires_signature) ? "Not yet" : "Not required"],
              ]}
            />
            {recipient.waived_reason && (
              <div className="mt-3"><DetailText label="Why they were excused">{recipient.waived_reason}</DetailText></div>
            )}
          </DetailSection>
        )}

        {chain.length > 1 && (
          <DetailSection
            title={`Version history (${chain.length})`}
            icon={HiCollection}
            action={<DetailPill tone="muted">Older versions are kept for good</DetailPill>}
          >
            <DetailTable
              columns={[
                { header: "Version", render: (row) => `v${row.version || 1}` },
                { header: "Reference number", render: (row) => row.reference_number || null },
                { header: "Status", render: (row) => <OrgStatusBadge status={orgDisplayStatus(row)} /> },
                { header: "Issued", render: (row) => (row.published_at ? fmtDate(row.published_at) : null) },
              ]}
              rows={chain}
              empty="Only this version exists."
            />
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Every version keeps the number it was issued under. A replaced letter is never renumbered or removed — that is what makes the file worth anything as evidence.
            </p>
          </DetailSection>
        )}

        {audit.rows.length > 0 && (
          <DetailSection title={`History (${audit.rows.length})`} icon={HiClock} defaultOpen={false}>
            <ul className="space-y-2.5">
              {audit.rows.map((row, index) => (
                <li key={row.id || index} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-300 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{orgAuditActionLabel(row.action)}</p>
                    <p className="text-[11px] text-slate-400">
                      {[row.created_at ? fmtDateTime(row.created_at) : "", row.actor_id ? (nameOf ? nameOf(row.actor_id, "HR") : "HR") : ""].filter(Boolean).join(" · ")}
                    </p>
                    {row.reason && <p className="text-[11px] text-slate-600 mt-0.5 italic break-words">“{row.reason}”</p>}
                  </div>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {generation && (
          <DetailSection
            title="Proof this file is the one that was issued"
            icon={HiFingerPrint}
            defaultOpen={false}
            action={<DetailPill tone="muted">For audits</DetailPill>}
          >
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Every letter is fingerprinted when it is drawn. If anyone ever asks whether a PDF is genuinely the one your organisation issued, this is the answer: the fingerprint below is computed from the file’s own contents and cannot be reproduced by editing it.
            </p>
            <DetailGrid
              cols={3}
              items={[
                ["Template used", generation.template_code ? humanizeCode(generation.template_code) : null],
                ["Template version", generation.template_version ? `Version ${generation.template_version}` : null],
                ["Drawn", generation.generated_at ? fmtDateTime(generation.generated_at) : null],
                ["Took", Number.isFinite(Number(generation.render_ms)) ? `${(Number(generation.render_ms) / 1000).toFixed(1)}s` : null],
                ["Size", formatBytes(generation.size_bytes ?? doc?.size_bytes)],
                ["Kept as", generation.retention_class === "record" ? "A permanent record" : humanizeCode(generation.retention_class) || null],
              ]}
            />
            <div className="mt-3 space-y-2">
              <Fingerprint label="File fingerprint (SHA-256)" value={doc?.checksum_sha256 || generation.content_hash} />
              <Fingerprint label="Fingerprint of what it was drawn from" value={generation.input_hash} />
            </div>
          </DetailSection>
        )}

        {!generation && !loading && (
          <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 leading-relaxed">
            <HiRefresh className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
            The record of how this letter was drawn isn’t available. The letter itself is unaffected — you can still read it, download it and reissue it.
          </p>
        )}
      </DetailDialog>

      {/* Siblings of the record inspector, never children: z-[165] and z-[170]
          over z-[140]. */}
      {viewing && (
        <AttachmentViewerDialog
          attachment={viewing}
          getViewUrl={api.orgGetViewUrl}
          errorMessage={documentErrorMessage}
          onClose={() => { setViewing(null); loadAudit(); }}
        />
      )}

      {withdrawing && (
        <ReasonDialog
          title="Withdraw this letter"
          description={
            <>
              The person it was issued to keeps their copy and can still read it, marked as no longer in force. Its reference number is never reused.
              <br /><br />
              <span className="font-semibold text-slate-700">
                If the letter is simply wrong, reissue it instead — that leaves them with a corrected letter rather than none.
              </span>
            </>
          }
          label="Why it is being withdrawn"
          placeholder="e.g. Issued to the wrong person; a correct letter has been sent separately."
          confirmLabel="Withdraw letter"
          tone="danger"
          minLength={10}
          maxLength={500}
          busy={busy === "retire"}
          error={dialogError}
          onSubmit={withdraw}
          onClose={() => { if (busy !== "retire") setWithdrawing(false); }}
        />
      )}
    </>
  );
}

/**
 * A hash, shown as evidence rather than as an id.
 *
 * The one deliberate exception to "never show an id": a checksum has no human
 * form, and it is the whole point of an audit block — an auditor compares this
 * string against one they computed themselves. It is labelled as a fingerprint,
 * not as an identifier, and nothing in the product asks anybody to type it.
 */
function Fingerprint({ label, value }) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[11px] font-mono text-slate-600 break-all bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 mt-1">{text}</p>
    </div>
  );
}
