// ─────────────────────────────────────────────────────────────────────────────
// documents/OrgRecipientsSection.jsx — Who received a published document and
// where each of them has got to (#59), with what HR can do about it:
//
//   Top up (#60)   — add people who now match the audience that was frozen at
//                    publish. It never removes anyone, and a second run adds 0.
//   Excuse (#61)   — take one person off the hook, with a reason on the record.
//                    Refused once they have acknowledged or signed.
//   Proof (#78)    — open one person's permanent acknowledgement / signature.
//                    Clicking a finished row opens it.
//
// A document that asks for an acknowledgement or signature is tracked by the
// server's `compliance` block — done / waiting / overdue / excused, judged on
// today's IST date. One that asks for nothing is tracked by who has opened it.
//
// The roster can be long, so it pages; the tallies cover the whole roster.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiBan, HiRefresh, HiShieldCheck, HiUserGroup } from "react-icons/hi";
import { DetailPill, DetailSection, rowPreviewProps } from "../components/DetailDialog";
import ReasonDialog from "../components/ReasonDialog";
import { Pagination, PersonCell } from "../attendance/ui";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { documentErrorCode, documentErrorMessage } from "../utils/documentErrors";
import { SECONDARY_BTN } from "./ui";
import { ComplianceBar, ComplianceStateBadge, CompletionBar, DueChip, RecipientStateBadge } from "./orgUi";
import { EvidenceDialog } from "./ComplianceDialogs";
import { canWaiveRecipient, compliancePercent, recipientStateMeta, rosterPayload } from "./orgDocumentMeta";
import { asksForSomething, complianceStateMeta, percentLabel } from "./complianceMeta";

const PAGE = 25;

/** The deadline, and how it stands today (server-derived `days_remaining`). */
function DueCell({ row }) {
  if (!row?.due_on) return <span className="text-xs text-slate-400">No deadline</span>;
  const done = ["completed", "waived"].includes(row.compliance_state) || ["acknowledged", "signed", "waived"].includes(row.state);
  return (
    <div className="leading-tight space-y-0.5">
      <p className={`text-xs font-semibold ${row.compliance_state === "overdue" ? "text-rose-600" : "text-slate-700"}`}>{fmtDate(row.due_on)}</p>
      <DueChip daysRemaining={row.days_remaining} done={done} className="!text-[10px]" />
    </div>
  );
}

/** When they finished, if they have. */
function DoneCell({ row }) {
  const at = row.signed_at || row.acknowledged_at;
  if (!at) return <span className="text-xs text-slate-400">Not yet</span>;
  return (
    <div className="leading-tight">
      <p className="text-xs text-slate-700">{fmtDateTime(at)}</p>
      <p className="text-[10px] font-semibold text-purple-600 inline-flex items-center gap-1 mt-0.5">
        <HiShieldCheck className="w-3 h-3" /> {row.signed_at ? "Signed" : "Acknowledged"}
        {row.acknowledged_version && !row.signed_at ? ` v${row.acknowledged_version}` : ""}
      </p>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.doc
 * @param {object} props.plane                    ORG_PLANES.hr
 * @param {object[]} [props.people]               roster rows for PersonCell
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {(msg: string, type?: string) => void} props.showToast
 * @param {() => void} [props.onChanged]          recipient_count moved
 */
export default function OrgRecipientsSection({ doc, plane, people = [], nameOf, showToast, onChanged }) {
  const [state, setState] = useState({ rows: [], total: 0, counts: null, compliance: null, loading: true, error: null });
  // `kind` says which bar set it: the compliance verdict or the stored state.
  const [filter, setFilter] = useState({ kind: "", value: "" });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [waiving, setWaiving] = useState(null);
  const [proof, setProof] = useState(null);
  const [dialogError, setDialogError] = useState("");

  const id = doc?.id;
  // A document that asks for something is followed by compliance verdict; one
  // that doesn't is followed by stored state (opened or not).
  const tracked = asksForSomething(doc);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await plane.recipients(id, {
        compliance_state: filter.kind === "compliance" ? filter.value : undefined,
        state: filter.kind === "state" ? filter.value : undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      if (token !== reqRef.current) return;
      const data = res?.data ?? res;
      setState({ ...rosterPayload(res), compliance: data?.compliance || null, loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ rows: [], total: 0, counts: null, compliance: null, loading: false, error });
    }
  }, [plane, id, filter, page]);

  useEffect(() => { load(); }, [load]);

  const pickBy = (kind) => (value) => { setFilter(value ? { kind, value } : { kind: "", value: "" }); setPage(1); };

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await plane.syncRecipients(id);
      const added = Number((res?.data ?? res)?.added_count) || 0;
      showToast?.(added === 0
        ? "Nobody new matched — everyone who should have this already has it."
        : `${added} ${added === 1 ? "person was" : "people were"} added.${doc?.requires_acknowledgement ? " Their deadline is counted from today." : ""}`);
      await load();
      if (added > 0) onChanged?.();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't top up the audience."), "error");
    } finally {
      setBusy("");
    }
  };

  const waive = async (reason) => {
    setBusy("waive");
    setDialogError("");
    try {
      await plane.waiveRecipient(id, waiving.user_id, reason);
      setWaiving(null);
      showToast?.("Excused — nothing more is asked of them for this document");
      await load();
    } catch (err) {
      setDialogError(documentErrorMessage(err, "Couldn't excuse this person."));
      // They finished it while the dialog was open; the refreshed row says so.
      if (documentErrorCode(err) === "RECIPIENT_ALREADY_COMPLETED") { setWaiving(null); showToast?.(documentErrorMessage(err), "error"); load(); }
    } finally {
      setBusy("");
    }
  };

  const counts = state.counts;
  const compliance = state.compliance;
  const total = Number(compliance?.total ?? counts?.total ?? doc?.recipient_count) || 0;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const personOf = (userId) => people.find((p) => (p.user_id ?? p.id) === userId) || { name: nameOf?.(userId, "Employee") || "Employee" };
  const finished = (row) => ["acknowledged", "signed"].includes(row.state);
  const canProve = !!plane.recipientEvidence;
  const anyAction = !!plane.waiveRecipient && state.rows.some(canWaiveRecipient);

  // Headline pill.
  let headline;
  if (tracked && compliance) {
    headline = `${percentLabel(compliance.completion_rate)} done · ${total} ${total === 1 ? "person" : "people"}`;
  } else {
    const reached = compliancePercent(counts);
    headline = reached === null ? `${total} ${total === 1 ? "person" : "people"}` : `${reached}% of ${total} have opened it`;
  }
  const allDone = tracked ? Number(compliance?.completion_rate) === 100 : compliancePercent(counts) === 100;

  const emptyText = filter.value
    ? `Nobody is “${(filter.kind === "compliance" ? complianceStateMeta(filter.value) : recipientStateMeta(filter.value)).label.toLowerCase()}”.`
    : "Nobody received this document.";

  return (
    <>
      <DetailSection
        title="Who got it"
        icon={HiUserGroup}
        action={<DetailPill tone={allDone ? "soft" : "muted"}>{headline}</DetailPill>}
      >
        {state.error ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-rose-700">{documentErrorMessage(state.error, "Couldn't load the list of recipients.")}</p>
            <button type="button" onClick={load} className="text-xs font-bold text-purple-600 hover:underline">Try again</button>
          </div>
        ) : (
          <>
            {tracked && compliance
              ? <CompletionBar counts={compliance} active={filter.kind === "compliance" ? filter.value : ""} onPick={pickBy("compliance")} />
              : counts && <ComplianceBar counts={counts} active={filter.kind === "state" ? filter.value : ""} onPick={pickBy("state")} />}

            {tracked && compliance?.due_on_basis === "org_default" && (
              <p className="text-[11px] text-slate-500 mt-3">The deadline comes from your organisation’s default, because this document didn’t set its own.</p>
            )}

            {plane.syncRecipients && (
              <div className="flex flex-wrap items-center justify-between gap-3 mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                <p className="text-[11px] text-slate-600 leading-relaxed max-w-md">
                  People who joined or moved since this was published don’t get it automatically. Top up to add anyone who now fits the same audience.
                </p>
                <button type="button" onClick={sync} disabled={!!busy} className={SECONDARY_BTN}>
                  <HiRefresh className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} /> {busy === "sync" ? "Checking…" : "Top up"}
                </button>
              </div>
            )}

            {tracked && canProve && state.rows.some(finished) && (
              <p className="text-[11px] text-slate-500 mt-3">Click anyone who has finished to see their permanent proof.</p>
            )}

            <div className="mt-4 -mx-1 overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <tr>
                    <th className="px-1 py-2">Person</th>
                    <th className="px-1 py-2">Status</th>
                    <th className="px-1 py-2">Opened</th>
                    {tracked && <th className="px-1 py-2">Due</th>}
                    {tracked && <th className="px-1 py-2">Finished</th>}
                    {anyAction && <th className="px-1 py-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {state.loading && state.rows.length === 0 ? (
                    [0, 1, 2].map((i) => (
                      <tr key={i}><td colSpan={6} className="px-1 py-2"><div className="h-10 bg-slate-100 rounded-xl animate-pulse" /></td></tr>
                    ))
                  ) : state.rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-1 py-6 text-center text-xs text-slate-400">{emptyText}</td></tr>
                  ) : state.rows.map((row) => {
                    const clickable = canProve && finished(row);
                    const person = personOf(row.user_id);
                    return (
                      <tr
                        key={row.id}
                        className={`${state.loading ? "opacity-60" : ""} ${clickable ? "cursor-pointer hover:bg-purple-50/40 outline-none focus-visible:bg-purple-50" : ""}`}
                        {...(clickable ? rowPreviewProps(() => setProof(row), `Proof for ${person.name || "this person"}`) : {})}
                      >
                        <td className="px-1 py-2.5">
                          <PersonCell entity={person} />
                          {row.source === "sync" && <p className="text-[10px] text-slate-400 mt-0.5">Added later</p>}
                        </td>
                        <td className="px-1 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <RecipientStateBadge state={row.state} />
                            {tracked && row.compliance_state === "overdue" && <ComplianceStateBadge state="overdue" />}
                          </div>
                          {row.state === "waived" && row.waived_reason && (
                            <p className="text-[10px] text-slate-500 mt-1 italic max-w-[200px] truncate" title={row.waived_reason}>“{row.waived_reason}”</p>
                          )}
                        </td>
                        <td className="px-1 py-2.5">
                          {row.first_viewed_at
                            ? <span className="text-xs text-slate-600">{fmtDateTime(row.first_viewed_at)}</span>
                            : <span className="text-xs text-slate-400">Not yet</span>}
                        </td>
                        {tracked && <td className="px-1 py-2.5"><DueCell row={row} /></td>}
                        {tracked && <td className="px-1 py-2.5"><DoneCell row={row} /></td>}
                        {anyAction && (
                          <td className="px-1 py-2.5 text-right">
                            {canWaiveRecipient(row) && (
                              <button
                                type="button"
                                onClick={() => { setDialogError(""); setWaiving(row); }}
                                disabled={!!busy}
                                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                              >
                                <HiBan className="w-3.5 h-3.5" /> Excuse
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {state.total > PAGE && (
              <div className="mt-3">
                <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="person" />
              </div>
            )}
          </>
        )}
      </DetailSection>

      {waiving && (
        <ReasonDialog
          title="Excuse this person?"
          description={`${personOf(waiving.user_id).name || "This person"} will no longer be asked to ${doc?.requires_signature ? "sign" : doc?.requires_acknowledgement ? "acknowledge" : "read"} “${doc.title}”. The reason is kept on the record.`}
          label="Why they're excused"
          placeholder="e.g. On long-term leave until March; briefed separately on return."
          confirmLabel="Excuse them"
          tone="danger"
          minLength={10}
          maxLength={500}
          busy={busy === "waive"}
          error={dialogError}
          onClose={() => { if (busy !== "waive") setWaiving(null); }}
          onSubmit={waive}
        />
      )}

      {proof && (
        <EvidenceDialog
          doc={doc}
          audience="hr"
          personName={personOf(proof.user_id).name}
          load={() => plane.recipientEvidence(id, proof.user_id)}
          onClose={() => setProof(null)}
        />
      )}
    </>
  );
}
