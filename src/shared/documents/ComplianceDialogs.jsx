// ─────────────────────────────────────────────────────────────────────────────
// documents/ComplianceDialogs.jsx — The three Phase 3 moments:
//
//   AcknowledgeDialog — "I have read this" (#73)
//   SignDialog        — type your name to sign (#74)
//   EvidenceDialog    — the permanent record of either: my own receipt (#75)
//                       or, for HR, one person's proof (#78)
//
// Acknowledging and signing are permanent — the server keeps no way to edit or
// delete them — so both ask for an explicit tick rather than firing on one
// click, and both say so before, not after.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import {
  HiBadgeCheck, HiCheckCircle, HiDocumentText, HiEye, HiFingerPrint, HiInformationCircle,
  HiPencilAlt, HiShieldCheck, HiX,
} from "react-icons/hi";
import DetailDialog, { DetailGrid, DetailSection, DetailStats } from "../components/DetailDialog";
import { organizationAPI } from "../api";
import { fmtDateTime } from "../attendance/dates";
import { documentErrorCode, documentErrorMessage, isNoEvidence, isSignerNameMismatch } from "../utils/documentErrors";
import { evidenceOf, shortFingerprint, signatureProviderLabel } from "./complianceMeta";
import { recipientStateMeta } from "./orgDocumentMeta";

const SIGNER_MIN = 2;
const SIGNER_MAX = 150;

/** The shell both action dialogs share — same look and layer as ReasonDialog. */
function ActionShell({ title, description, icon: Icon, busy, onClose, onSubmit, confirmLabel, canSubmit, children }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    // Capture, so Escape closes this and never the document preview under it.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (busy || !canSubmit) return;
    onSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>
              {description && <p className="text-sm text-slate-500 mt-0.5 leading-relaxed break-words">{description}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">{children}</div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            Not now
          </button>
          <button
            type="submit"
            disabled={busy || !canSubmit}
            className="sm:min-w-[170px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A tick box with its sentence — the explicit "yes, I mean it". */
function Consent({ checked, onChange, disabled, children }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${checked ? "border-purple-300 bg-purple-50/60" : "border-slate-200 bg-white hover:border-purple-200"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-200 shrink-0"
      />
      <span className="text-sm font-semibold text-slate-700 leading-relaxed">{children}</span>
    </label>
  );
}

/** Shown when the person is about to confirm something they haven't opened. */
function NotOpenedHint({ onReadFirst }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <HiInformationCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
      <div className="min-w-0 text-sm text-indigo-800">
        <p className="font-semibold">You haven’t opened this document yet.</p>
        <p className="mt-0.5">Please read it before you confirm.</p>
        {onReadFirst && (
          <button type="button" onClick={onReadFirst} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:underline">
            <HiEye className="w-3.5 h-3.5" /> Read it first
          </button>
        )}
      </div>
    </div>
  );
}

function InlineError({ children }) {
  if (!children) return null;
  return <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{children}</p>;
}

/**
 * @param {object} props
 * @param {object} props.doc                 the document being acknowledged
 * @param {boolean} [props.opened]           false while the recipient is still `pending`
 * @param {() => void} [props.onReadFirst]
 * @param {boolean} props.busy
 * @param {string} [props.error]
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onClose
 */
export function AcknowledgeDialog({ doc, opened = true, onReadFirst, busy, error, onSubmit, onClose }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <ActionShell
      title="Acknowledge this document"
      description={`“${doc?.title || "This document"}”${doc?.version > 1 ? ` · version ${doc.version}` : ""}`}
      icon={HiBadgeCheck}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
      confirmLabel="Acknowledge"
      canSubmit={agreed}
    >
      {!opened && <NotOpenedHint onReadFirst={onReadFirst} />}
      <Consent checked={agreed} onChange={setAgreed} disabled={busy}>
        I have read this document, I understand it, and I agree to follow it.
      </Consent>
      <p className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
        <HiShieldCheck className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
        Your acknowledgement is saved with today’s date and time and the exact version you are confirming. It is permanent — it can’t be changed or taken back later.
      </p>
      <InlineError>{error}</InlineError>
    </ActionShell>
  );
}

/**
 * The names on the signer's own profile, as guidance. This is their own
 * record, read from their own profile endpoint — the sign endpoint itself
 * never reveals what it expects.
 */
function useMyNames() {
  const [names, setNames] = useState([]);
  useEffect(() => {
    let alive = true;
    organizationAPI.getMyProfile()
      .then((res) => {
        const p = res?.data || {};
        const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        const list = [...new Set([full, p.display_name, p.name].map((n) => String(n || "").trim()).filter(Boolean))];
        if (alive) setNames(list);
      })
      .catch(() => { /* guidance only — the field works without it */ });
    return () => { alive = false; };
  }, []);
  return names;
}

/**
 * @param {object} props
 * @param {object} props.doc
 * @param {boolean} [props.opened]
 * @param {() => void} [props.onReadFirst]
 * @param {boolean} props.busy
 * @param {unknown} [props.error]            the raw error, so a name mismatch can sit under the field
 * @param {(name: string) => void} props.onSubmit
 * @param {() => void} props.onClose
 */
export function SignDialog({ doc, opened = true, onReadFirst, busy, error, onSubmit, onClose }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const names = useMyNames();

  useEffect(() => { if (opened) inputRef.current?.focus(); }, [opened]);

  const trimmed = name.trim().replace(/\s+/g, " ");
  const tooShort = trimmed.length < SIGNER_MIN;
  const mismatch = isSignerNameMismatch(error);
  const fieldProblem = touched && tooShort ? `Type at least ${SIGNER_MIN} characters.` : mismatch ? documentErrorMessage(error) : "";

  return (
    <ActionShell
      title="Sign this document"
      description={`“${doc?.title || "This document"}”${doc?.version > 1 ? ` · version ${doc.version}` : ""}`}
      icon={HiPencilAlt}
      busy={busy}
      onClose={onClose}
      onSubmit={() => { setTouched(true); if (!tooShort) onSubmit(trimmed); }}
      confirmLabel="Sign document"
      canSubmit={agreed && !tooShort}
    >
      {!opened && <NotOpenedHint onReadFirst={onReadFirst} />}

      <div>
        <label htmlFor="sign-name" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          Type your full name <span className="text-rose-500">*</span>
        </label>
        <input
          ref={inputRef}
          id="sign-name"
          type="text"
          autoComplete="name"
          spellCheck={false}
          value={name}
          maxLength={SIGNER_MAX}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={!!fieldProblem}
          aria-describedby="sign-name-help"
          placeholder="e.g. Asha Rao"
          className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-lg font-semibold italic text-slate-800 focus:bg-white outline-none transition ${fieldProblem ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100"}`}
        />
        <p id="sign-name-help" className={`text-[11px] mt-1.5 ${fieldProblem ? "font-semibold text-rose-600" : "text-slate-500"}`}>
          {fieldProblem || (names.length
            ? <>Type it the way your profile shows it: {names.map((n, i) => <span key={n}>{i > 0 ? " or " : ""}<span className="font-bold text-slate-700">{n}</span></span>)}.</>
            : "Use your first and last name, or your display name, exactly as your profile shows it.")}
        </p>
      </div>

      <Consent checked={agreed} onChange={setAgreed} disabled={busy}>
        I have read this document and I agree that typing my name here is my signature on it.
      </Consent>
      <p className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
        <HiShieldCheck className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
        Your signature is saved with the name you typed, today’s date and time, and the exact version you signed. It is permanent — it can’t be changed or taken back later. Signing also counts as acknowledging.
      </p>
      {!mismatch && <InlineError>{error ? documentErrorMessage(error, "Couldn't sign this document.") : ""}</InlineError>}
    </ActionShell>
  );
}

/** One labelled block of evidence. */
function EvidenceBlock({ title, icon, items }) {
  return (
    <DetailSection title={title} icon={icon}>
      <DetailGrid cols={2} items={items} />
    </DetailSection>
  );
}

/**
 * The permanent record. `load` is #75 (my own) or #78 (HR, one person).
 *
 * @param {object} props
 * @param {object} props.doc                 at least { title, version }
 * @param {() => Promise<unknown>} props.load
 * @param {string} [props.personName]        HR view: whose record this is
 * @param {"self"|"hr"} props.audience
 * @param {() => void} props.onClose
 */
export function EvidenceDialog({ doc, load, personName, audience, onClose }) {
  const [state, setState] = useState({ loading: true, evidence: null, error: null });

  useEffect(() => {
    let alive = true;
    load()
      .then((res) => alive && setState({ loading: false, evidence: evidenceOf(res), error: null }))
      .catch((error) => alive && setState({ loading: false, evidence: null, error }));
    return () => { alive = false; };
    // `load` is an inline arrow from the caller; the record is read once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ev = state.evidence;
  const ack = ev?.acknowledgement;
  const sig = ev?.signature;
  const checksum = sig?.content_checksum || ack?.content_checksum || null;
  const self = audience === "self";
  const version = ev?.version ?? doc?.version;

  let body;
  if (state.loading) {
    body = null;
  } else if (state.error) {
    const nothingYet = isNoEvidence(state.error);
    const notRecipient = documentErrorCode(state.error) === "RECIPIENT_NOT_FOUND";
    body = (
      <div className="flex flex-col items-center text-center gap-3 py-10 px-4">
        <span className="w-12 h-12 rounded-full bg-purple-50 text-purple-400 flex items-center justify-center"><HiDocumentText className="w-6 h-6" /></span>
        <p className="text-sm font-semibold text-slate-700 max-w-md">
          {nothingYet
            ? (self ? "You haven't acknowledged or signed this document yet, so there's no receipt." : `${personName || "This person"} hasn't acknowledged or signed this document yet.`)
            : notRecipient
              ? `${personName || "This person"} didn't receive this document.`
              : documentErrorMessage(state.error, "Couldn't load the record.")}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <DetailStats
          items={[
            { label: "Status", value: sig ? "Signed" : ack ? "Acknowledged" : ev?.recipientState ? recipientStateMeta(ev.recipientState).label : "N/A", icon: HiCheckCircle },
            { label: "Version", value: version ? `v${version}` : "N/A", icon: HiDocumentText },
            { label: sig ? "Signed on" : "Acknowledged on", value: fmtDateTime(sig?.signed_at || ack?.acknowledged_at), icon: HiBadgeCheck },
          ]}
        />

        {sig && (
          <EvidenceBlock
            title="Signature"
            icon={HiPencilAlt}
            items={[
              { label: "Name typed", value: sig.signer_name, wide: true },
              ["Signed on", fmtDateTime(sig.signed_at)],
              ["Version signed", sig.document_version ? `v${sig.document_version}` : null],
              ["How it was signed", signatureProviderLabel(sig.provider)],
              ["From network address", sig.ip_address || null],
              { label: "Record number", value: sig.id, mono: true, wide: true },
            ]}
          />
        )}

        {ack && (
          <EvidenceBlock
            title="Acknowledgement"
            icon={HiBadgeCheck}
            items={[
              ["Acknowledged on", fmtDateTime(ack.acknowledged_at)],
              ["Version acknowledged", ack.document_version ? `v${ack.document_version}` : null],
              ["From network address", ack.ip_address || null],
              { label: "Record number", value: ack.id, mono: true },
            ]}
          />
        )}

        {sig && !ack && (
          <p className="flex items-start gap-2 text-xs text-slate-500 px-1">
            <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
            Signing counts as acknowledging, so there is no separate acknowledgement.
          </p>
        )}

        <DetailSection title="File fingerprint" icon={HiFingerPrint} defaultOpen={!self}>
          {checksum ? (
            <>
              <p className="text-xs text-slate-600 leading-relaxed">
                A unique code worked out from the exact file {self ? "you" : "they"} {sig ? "signed" : "acknowledged"}. If the file is ever changed, its code changes too — so this proves which file it was.
              </p>
              <p className="mt-3 font-mono text-[11px] text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 break-all select-all" title={checksum}>{checksum}</p>
              <p className="text-[10px] text-slate-400 mt-1">Short form: {shortFingerprint(checksum)}</p>
            </>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              No fingerprint was recorded — this document is a link to a file kept somewhere else, so there was no file here to fingerprint. The version number above still records what was {sig ? "signed" : "acknowledged"}.
            </p>
          )}
        </DetailSection>

        <p className="flex items-start gap-2 text-xs text-slate-500 px-1">
          <HiShieldCheck className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
          This record is permanent. Nobody — not {self ? "you" : "the employee"}, a manager or HR — can change or delete it.
        </p>
      </>
    );
  }

  return (
    <DetailDialog
      eyebrow={self ? "Your receipt" : personName ? `Proof · ${personName}` : "Proof"}
      icon={HiShieldCheck}
      title={doc?.title || "Document"}
      subtitle={version ? `Version ${version}` : undefined}
      loading={state.loading}
      onClose={onClose}
    >
      {body}
    </DetailDialog>
  );
}
