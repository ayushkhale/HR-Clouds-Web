// ─────────────────────────────────────────────────────────────────────────────
// documents/AttachmentLink.jsx — Opens the supporting document on a leave
// application, whichever of the two kinds it is (Phase 5, #128).
//
// A leave request's `document_url` is one of two very different things, and
// telling them apart is this component's whole job:
//
//   · a link somebody pasted in — an ordinary https address, opened as a link
//     the way it always was; or
//   · a reference to a document already in this portal, stored as the relative
//     path `/api/v1/documents/attachments/:id/view-url`.
//
// The second kind is not a link a browser can follow. It needs the session
// token, and the server decides at that moment whether the person asking is the
// applicant, their manager, or HR — one stored string, three different readers,
// each checked against the same rules that guard the document anywhere else.
// Anybody else gets the same flat "not found" as if it had never existed.
//
// So a plain anchor would break for exactly the attachments Phase 5 added. This
// resolves the path properly and shows the file in the module's own viewer.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiExternalLink, HiPaperClip } from "react-icons/hi";
import AttachmentViewerDialog from "../components/AttachmentViewerDialog";
import { documentsAPI } from "../api";
import { documentErrorMessage } from "../utils/documentErrors";
import { attachmentIdFromUrl } from "./attachmentBridge";

/**
 * @param {object} props
 * @param {string} props.url            the leave request's stored `document_url`
 * @param {string} [props.label]
 * @param {string} [props.className]    styling for the trigger, so each screen keeps its own look
 * @param {string} [props.contentType]  when the caller knows it, the viewer renders inline
 * @param {string} [props.fileName]
 */
export default function AttachmentLink({ url, label = "View attachment", className = "", contentType = "", fileName = "" }) {
  const [viewing, setViewing] = useState(false);
  const id = attachmentIdFromUrl(url);

  if (!url) return null;

  // A pasted external link behaves exactly as it always did.
  if (!id) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        <HiExternalLink className="w-3.5 h-3.5" /> {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setViewing(true)} className={className}>
        <HiPaperClip className="w-3.5 h-3.5" /> {label}
      </button>
      {viewing && (
        <AttachmentViewerDialog
          attachment={{ id, content_type: contentType, file_name: fileName || "Supporting document" }}
          getViewUrl={(attachmentId, params) => documentsAPI.getAttachmentViewUrl(attachmentId, params)}
          errorMessage={documentErrorMessage}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  );
}
