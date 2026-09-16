// ─────────────────────────────────────────────────────────────────────────────
// AttachmentUploadButton.jsx — A file picker that runs the full browser → S3 →
// confirm handshake for one file, showing a per-stage spinner and an inline
// error that stays until the next attempt. One upload at a time. Used by the
// claim editor, My Tax proofs and Year-End Part A.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { HiUpload, HiExclamationCircle } from "react-icons/hi";
import { ACCEPT_ATTR, ALLOWED_TYPES, fileProblem, uploadErrorMessage, uploadFile } from "../utils/payrollAttachments";

/**
 * @param {object} props
 * @param {(meta: {file_name, content_type, size_bytes}) => Promise} props.issue
 * @param {(attachmentId: string) => Promise} props.confirm
 * @param {string[]} [props.types]        allowed content types (default ALLOWED_TYPES)
 * @param {string}   [props.accept]       input accept attribute
 * @param {string}   [props.label]
 * @param {boolean}  [props.disabled]
 * @param {(attachment: object) => void} props.onUploaded
 */
export default function AttachmentUploadButton({ issue, confirm, types = ALLOWED_TYPES, accept = ACCEPT_ATTR, label = "Upload receipt", disabled = false, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const busyRef = useRef(false);

  const pick = () => {
    if (busy || disabled) return;
    inputRef.current?.click();
  };

  const onFile = async (file) => {
    if (!file || busyRef.current) return;
    setError("");
    const problem = fileProblem(file, types);
    if (problem) { setError(problem); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const attachment = await uploadFile({ issue, confirm, file });
      onUploaded?.(attachment);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={pick}
        disabled={busy || disabled}
        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy
          ? <><span className="inline-block w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> Uploading…</>
          : <><HiUpload className="w-3.5 h-3.5" /> {label}</>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }}
      />
      {error && (
        <span className="inline-flex items-start gap-1 text-[11px] font-semibold text-rose-600">
          <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </span>
      )}
    </div>
  );
}
