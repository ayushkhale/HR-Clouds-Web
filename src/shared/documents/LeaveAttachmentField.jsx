// ─────────────────────────────────────────────────────────────────────────────
// documents/LeaveAttachmentField.jsx — Attaching evidence to a leave
// application, without uploading it twice (Phase 5, the leave bridge).
//
// The thing this fixes is small and very common. Somebody is off sick, uploads
// the hospital discharge summary to their documents because HR asked them to,
// and then has to upload the same PDF again — to a different place, in a
// different format — to apply for the leave it was for. Their manager then has
// no way to see the first copy and has to ask for it by email.
//
// So the field offers what they already have. Picking one stores a reference,
// not a copy: the manager approving the leave opens the same document, checked
// against the same rules, and HR sees it as one file rather than two.
//
// Pasting a link still works, and has to — not everything lives in here, and a
// leave type that wants a certificate shouldn't be blocked because somebody
// hasn't uploaded it yet. The two are deliberately exclusive: a leave request
// carries one piece of evidence, and offering both at once would only raise
// the question of which one counts.
//
// Only documents in a state worth showing an approver are offered. A rejected
// or expired one is not evidence, and the server refuses it anyway.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { HiCheckCircle, HiClock, HiDocumentText, HiExternalLink, HiFolderOpen, HiRefresh } from "react-icons/hi";
import { documentsAPI } from "../api";
import { listPayload } from "./documentMeta";
import { fmtDate } from "../attendance/dates";

/** The two states a document can be in and still count as evidence (#128). */
const EVIDENCE_STATUSES = ["available", "pending_verification"];

const MODES = [
  { key: "portal", label: "From my documents", icon: HiFolderOpen },
  { key: "link", label: "Paste a link", icon: HiExternalLink },
];

/**
 * @param {object} props
 * @param {{ document_id?: string, document_url?: string }} props.value
 * @param {(next: { document_id: string, document_url: string }) => void} props.onChange
 * @param {boolean} [props.required]   the leave type asks for evidence at this length
 * @param {boolean} [props.disabled]
 */
export default function LeaveAttachmentField({ value, onChange, required = false, disabled = false }) {
  const [mode, setMode] = useState(value?.document_url ? "link" : "portal");
  const [state, setState] = useState({ rows: [], loading: true, error: false });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    documentsAPI.getMyDocuments({ status: EVIDENCE_STATUSES, limit: 100 })
      .then((res) => { if (alive) setState({ rows: listPayload(res).rows, loading: false, error: false }); })
      // Not being able to list them is not a reason to block the application:
      // the link box still works, and that is said rather than left blank.
      .catch(() => { if (alive) setState({ rows: [], loading: false, error: true }); });
    return () => { alive = false; };
  }, []);

  const options = useMemo(
    () => state.rows.filter((row) => EVIDENCE_STATUSES.includes(row.status)),
    [state.rows],
  );
  const chosen = options.find((row) => row.id === value?.document_id) || null;

  const pick = (id) => onChange({ document_id: id, document_url: "" });
  const paste = (url) => onChange({ document_id: "", document_url: url });

  const switchMode = (next) => {
    setMode(next);
    // The two are exclusive, so switching clears the other one rather than
    // leaving a value the server would have to choose between.
    onChange({ document_id: "", document_url: "" });
  };

  return (
    <div>
      <label htmlFor="leave-doc" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        Supporting Document{" "}
        <span className={`normal-case font-normal ${required ? "text-fuchsia-600 font-semibold" : "text-slate-400"}`}>
          {required ? "(your leave type asks for one at this length)" : "(optional)"}
        </span>
      </label>

      <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl mb-2" role="tablist" aria-label="How to attach">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key} type="button" role="tab" aria-selected={mode === m.key} disabled={disabled}
              onClick={() => switchMode(m.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${mode === m.key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {mode === "portal" ? (
        <>
          <select
            id="leave-doc"
            value={value?.document_id || ""}
            disabled={disabled || state.loading || options.length === 0}
            onChange={(e) => pick(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">
              {state.loading ? "Looking at your documents…" : options.length === 0 ? "You have nothing to attach yet" : "Choose one of your documents"}
            </option>
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}{row.issued_on ? ` — ${fmtDate(row.issued_on)}` : ""}
              </option>
            ))}
          </select>

          {chosen ? (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              {chosen.status === "available"
                ? <HiCheckCircle className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-px" />
                : <HiClock className="w-3.5 h-3.5 text-fuchsia-500 shrink-0 mt-px" />}
              <span>
                {chosen.status === "available"
                  ? "Already checked by HR. Whoever approves your leave can open it straight from the request."
                  : "Still waiting to be checked by HR. You can attach it now — your approver will see it as it stands."}
              </span>
            </p>
          ) : state.error ? (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-1.5">
              <HiRefresh className="w-3.5 h-3.5 shrink-0 mt-px" /> Couldn’t read your documents just now. Paste a link instead, or try again in a moment.
            </p>
          ) : !state.loading && options.length === 0 ? (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              <HiDocumentText className="w-3.5 h-3.5 shrink-0 mt-px" />
              Nothing in your documents can be attached yet. Add the certificate to My Documents first, or paste a link to it.
            </p>
          ) : (
            <p className="text-[10px] text-slate-400 mt-1.5">
              Attaching one you’ve already uploaded saves doing it twice — and your approver can open it without asking you for a copy.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="relative">
            <HiExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="leave-doc"
              type="url"
              value={value?.document_url || ""}
              disabled={disabled}
              onChange={(e) => paste(e.target.value)}
              placeholder="https://drive.google.com/file/..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            A link to your doctor’s note or certificate. Make sure whoever approves your leave can open it.
          </p>
        </>
      )}
    </div>
  );
}
