// ─────────────────────────────────────────────────────────────────────────────
// documentErrors.js — Typed error codes of the Documents module → plain,
// actionable messages. Source: phase1_implementation_plan.md §16.1 (the error
// register), phase2_implementation_plan.md §12 (R-36…R-75), the Phase 3 note
// (documents_phase3_acknowledgements_2026_09_24.md §5) and the per-endpoint
// errors in the api_analysis documents.
//
// Always branch on the code, never on the message. `DOCUMENT_NOT_FOUND` is the
// uniform denial for every `…/documents/:id` route (missing, other org, out of
// your team, confidential, not yours) — the wording must not guess which.
// Phase 4 adds a second uniform denial, `REQUEST_NOT_FOUND`, for every
// `…/document-requests/:id` route, and for a manager it also covers "somebody
// else raised it". The release note spells that one `DOCUMENT_NOT_FOUND`
// instead, so both codes are mapped and both read the same to the user.
//
// One code is overloaded across phases: `TEMPLATE_NOT_FOUND` means a blank
// company form in Phase 5 and a letter template in PDF Phase 1, which are
// different objects with different wording. The letter screens therefore call
// `letterErrorMessage()`, which re-reads that one code (and the renderer
// failures) and hands everything else to the map below.
//
// PDF Phase 2 overloads by CONTEXT rather than by code: the same renderer
// failures mean "the preview didn't draw" on a template screen and "no letter
// went out" on the issue screen, and those are not the same news. So the issue
// and reissue screens call `letterIssueErrorMessage()`, which re-answers the
// renderer and storage codes, spells out which fact or field was named, and
// always says whether anything was issued. Three predicates decide what a screen
// may do next, and they are NOT interchangeable: `isRenderInProgress` means
// repeat the SAME request, `isLetterIssueRetryable` means repeat it with a FRESH
// key, and `isRetryLimitExceeded` means stop and tell the person.
// ─────────────────────────────────────────────────────────────────────────────

const GONE = "This document isn't available any more. It may have been removed, or you may no longer have access to it. Refresh to see the latest.";

export const DOCUMENT_ERROR_MESSAGES = {
  // Access
  FEATURE_NOT_AVAILABLE: "Documents aren't enabled for this organisation. Ask your administrator to turn the Documents module on.",
  MISSING_ORG_CONTEXT: "Documents are only available inside an organisation. Switch to an organisation account to continue.",
  FORBIDDEN: "You don't have permission to do this for this person or document type.",
  DOCUMENT_NOT_FOUND: GONE,
  MANAGER_ROUTE_FOR_MANAGERS: "HR decides documents from the Verification Queue; recommendations are for managers.",

  // Catalog & types
  CATALOG_ENTRY_NOT_FOUND: "One of the chosen catalog documents no longer exists. Refresh the catalog and try again — nothing was activated.",
  CATALOG_ENTRY_INACTIVE: "One of the chosen catalog documents has been withdrawn from the platform. Unselect it and try again — nothing was activated.",
  DOCUMENT_TYPE_NOT_FOUND: "That document type couldn't be found. Refresh and choose another type.",
  DOCUMENT_TYPE_INACTIVE: "This document type has been switched off, so new files can't be added to it. Ask HR to reactivate it.",
  DOCUMENT_TYPE_CODE_EXISTS: "Your organisation already has a document type with this code. Choose a different code.",
  DOCUMENT_TYPE_CODE_RESERVED: "This code belongs to a standard catalog document. Activate it from the catalog, or choose a different code.",
  DOCUMENT_TYPE_FIELD_IMMUTABLE: "The code, statutory flag and origin of a document type can't be changed. Create a new type instead.",
  DOCUMENT_TYPE_PLANE_MISMATCH: "This document type is for organisation documents, not an employee's file.",
  DOCUMENT_TYPE_NO_USABLE_CONTENT_TYPE: "Choose at least one allowed file format.",
  DOCUMENT_TYPE_IN_USE: "Some documents of this type are still in progress, so it can't be switched off yet. Finish or remove them first.",

  // Upload
  DOCUMENT_CONTENT_TYPE_NOT_ALLOWED: "This file format isn't allowed for this document type. Check the allowed formats and choose another file.",
  DOCUMENT_TOO_LARGE: "This file is larger than this document type allows. Choose a smaller file.",
  DOCUMENT_EXPIRY_REQUIRED: "This document type needs an expiry date. Add one and try again.",
  DOCUMENT_ALREADY_EXISTS: "A live document of this type already exists. Open it and use Replace to upload a newer version.",
  DOCUMENT_NOT_AWAITING_UPLOAD: "This upload has already been finished or discarded. Refresh to see its current state.",
  DOCUMENT_OBJECT_NOT_FOUND: "The file didn't reach storage. Upload it again.",
  DOCUMENT_VERIFICATION_FAILED: "The stored file didn't match what was declared (size or format). Upload the file again.",
  DOCUMENT_STORAGE_UNAVAILABLE: "Document storage isn't reachable right now. Nothing was changed — try again in a moment.",
  INVALID_REFERENCE_URL: "Enter a secure link that starts with https:// (up to 1000 characters).",

  // Review
  DOCUMENT_NOT_PENDING_VERIFICATION: "This document has already been decided. The list has been refreshed.",
  // Shared with PDF Phase 4's #149 — a letter proposal hits the same rule, and
  // reads it through `proposalDecisionErrorMessage()` so it says "approve a
  // letter" rather than "verify a document".
  SELF_APPROVAL_NOT_ALLOWED: "Separate checker is on: you can't verify a document you uploaded or proposed. Another HR administrator must decide it.",
  RECOMMENDATION_SCOPE_STALE: "The manager who recommended this no longer manages this employee.",

  // Replace & delete
  DOCUMENT_NOT_REPLACEABLE: "Only an active or expired document can be replaced. Upload a new document instead.",
  REPLACE_ALREADY_IN_PROGRESS: "A newer version of this document is already being uploaded. Finish or discard it first.",
  DOCUMENT_VERSION_CONFLICT: "Someone else changed this document at the same time. Refresh and try again.",
  DOCUMENT_NOT_DELETABLE: "This document can't be deleted once verified. Statutory documents are always kept; for others, ask HR if a correction is needed.",

  // ── Org documents (Phase 2) ───────────────────────────────────────────────
  // Authoring a draft
  FLAG_CANNOT_BE_LOWERED: "This document type always requires acknowledgement or a signature, so that can't be switched off here. You can ask for more than the type requires, never less.",
  ACK_DUE_DAYS_REQUIRED: "Say how many days people get to acknowledge this — between 1 and 365.",
  EFFECTIVE_WINDOW_INVALID: "The end date is before the start date. Fix the dates and try again.",
  TARGET_DEPARTMENT_UNKNOWN: "One of the chosen departments no longer exists. Refresh and pick the audience again — nothing was saved.",
  TARGET_LOCATION_UNKNOWN: "One of the chosen locations no longer exists. Refresh and pick the audience again — nothing was saved.",
  TARGET_USER_UNKNOWN: "One of the chosen people is no longer an active member of this organisation. Remove them and try again.",
  IMMUTABLE_FIELD: "The document type can't be changed once the draft exists. Delete this draft and start a new one.",
  ORG_DOCUMENT_NOT_EDITABLE: "This document has already been published, so it can't be edited. Use Publish a new version to change it.",
  UPLOAD_NOT_FOUND: "The file didn't reach storage. Upload it again.",
  INVALID_FIELD_FOR_BACKEND: "A file name can only be set on an uploaded document, and a link only on a linked one. Refresh and try again.",

  // Lifecycle
  ORG_DOCUMENT_FILE_MISSING: "The server won't issue this document because it can't see its file. If you've already attached one, this is a fault on our side rather than anything you did — please report it; re-uploading won't help.",
  INVALID_STATUS_TRANSITION: "This document isn't in a state where that's possible any more. Refresh to see where it stands.",
  ORG_DOCUMENT_ALREADY_PUBLISHED: "Someone published this a moment ago. Refresh to see the live version.",
  ORG_DOCUMENT_DRAFT_EXISTS: "A new version of this document is already being drafted. Finish or delete that draft first.",
  ORG_DOCUMENT_NOT_REPLACEABLE: "Only a published document can get a new version.",
  ORG_DOCUMENT_NOT_A_PROPOSAL: "Only a manager's proposal can be declined. To withdraw a document you wrote yourself, delete the draft or retire the published version.",
  ORG_DOCUMENT_NOT_DELETABLE: "A published document can't be deleted — retire it instead, so the people who received it keep their copy.",
  PROPOSER_SCOPE_CHANGED: "The manager who proposed this no longer manages everyone it targets. You can still publish it, and that override is recorded.",

  // Recipients
  RECIPIENT_SET_TOO_LARGE: "This document would go to more people than can be issued at once. Narrow the audience and try again.",
  RECIPIENT_ALREADY_COMPLETED: "This person has already acknowledged or signed the document, so it can't be waived now.",

  // ── Acknowledging & signing (Phase 3) ─────────────────────────────────────
  ACKNOWLEDGEMENT_NOT_REQUIRED: "This document doesn't need to be acknowledged, so there's nothing to confirm. Refresh to see the latest.",
  SIGNATURE_NOT_REQUIRED: "This document doesn't need a signature, so there's nothing to sign. Refresh to see the latest.",
  RECIPIENT_WAIVED: "HR has excused you from this document, so it doesn't need anything from you.",
  ORG_DOCUMENT_NOT_ACTIONABLE: "This document isn't open for acknowledgement or signing right now — it has either not started yet or has ended. Ask HR if you think it should be.",
  // Deliberately generic: the server never says which name it expected.
  SIGNER_NAME_MISMATCH: "That name doesn't match the name on your profile. Type your first and last name, or your display name, exactly as your profile shows it.",
  SIGNATURE_PROVIDER_UNAVAILABLE: "Signing is switched off for now because your organisation has chosen a signing service that isn't connected yet. Nothing was recorded — please tell HR.",
  EXPORT_TOO_LARGE: "This report is too big to download in one go. Narrow it down with the filters and try again.",
  RECIPIENT_NOT_FOUND: "This person didn't receive this document.",

  // Manager proposals
  MANAGER_SINGLE_TARGET_REQUIRED: "A proposal is for one team member at a time. Choose exactly one person.",

  // ── Requests, checklists & automation (Phase 4) ───────────────────────────
  // The uniform denial for `…/document-requests/:id`: missing, another org's,
  // outside your team, or — for a manager — raised by somebody else.
  REQUEST_NOT_FOUND: "This request isn't available any more. It may have been cancelled or already met, or you may not have access to it. Refresh to see the latest.",
  REQUEST_NOT_OPEN: "This request has already been met or cancelled, so there's nothing left to do on it. Refresh to see where it stands.",
  DOCUMENT_ALREADY_PRESENT: "This person already has a valid document of this kind on file, so there's nothing to ask for. Open their file to see it, or ask them to replace it if it needs updating.",
  DUPLICATE_REQUEST: "This document has already been asked for and the request is still open. Open that request instead of raising a second one.",
  NOTHING_TO_REQUEST: "There's nothing outstanding on this checklist, so there's nothing to ask for.",
  TYPE_NOT_REQUESTABLE: "Managers can't ask for this kind of document — only HR can. Ask your HR team to request it.",
  // Also the answer when a signed-in HR or admin account has no employee
  // record of its own — see isNoEmployeeRecord below, which reads it as a fact
  // rather than as a failure.
  USER_NOT_FOUND: "That person is no longer an active member of this organisation.",

  // ── Templates, search, reports, exports & offboarding (Phase 5) ───────────
  // The uniform denial for every `…/templates/:id` route. On the employee
  // catalogue it also covers "not published", "hidden from employees" and "its
  // document type forbids it" — so the wording must not guess which.
  TEMPLATE_NOT_FOUND: "This form isn't available any more. It may have been replaced by a newer version or retired. Refresh to see the current forms.",
  TEMPLATE_NOT_DRAFT: "This form has already been published, so it can't be edited. Use “Publish a new version” to change it.",
  TEMPLATE_NOT_REPLACEABLE: "Only the live version of a form can get a new version.",
  TEMPLATE_NOT_ARCHIVABLE: "Only a live form can be retired. A draft can be deleted, and a replaced version is already out of the catalogue.",
  TEMPLATE_DRAFT_EXISTS: "A new version of this form is already being drafted. Finish or delete that draft first.",
  TEMPLATE_PUBLISH_CONFLICT: "Someone published a version of this form a moment ago. Refresh to see the live one.",
  TEMPLATE_NOT_DELETABLE: "Only a draft can be deleted. Retire the form instead — that takes it out of the catalogue but keeps the record.",
  TEMPLATE_FILE_NOT_UPLOADED: "The file didn't reach storage. Upload it again.",
  TEMPLATE_FILE_MISSING: "This form has no file or link yet, so there's nothing to publish or download. Add one first.",

  SEARCH_FILTER_REQUIRED: "Start with something to search on: a word from the title, a person, a kind of document, or a tag. Status, department and dates narrow a search down — they can't be the whole of one.",
  SEARCH_QUERY_TOO_SHORT: "Type at least two characters to search.",
  TAG_TOO_LONG: "One of the tags is too long. Keep each one under 64 characters.",
  TAG_INVALID: "A tag can only use lowercase letters, numbers, spaces, hyphens and underscores, and must start with a letter or number.",
  TOO_MANY_TAGS: "A document can hold up to 10 tags. Remove a few and try again.",
  PAGINATION_TOO_DEEP: "You've reached as far into these results as the search will go. Narrow the filters to find what you're after.",

  EXPORT_NOT_FOUND: "That export record couldn't be found.",
  EXPORT_LEDGER_UNAVAILABLE: "Downloads are recorded for audit before they're sent, and that record couldn't be written — so nothing was exported. Try again in a moment.",
  EXIT_PACK_TOO_LARGE: "This person has more documents than one pack can hold. Choose a narrower scope — their own documents, or company documents — and take two packs.",
  EXIT_DATE_IN_FUTURE: "Their last working day hasn't arrived yet. Wait until it has, or tick “do it anyway” if their paperwork is being closed early.",
  NOT_OFFBOARDING: "This person is still an active member of the organisation with no recorded exit, so there's nothing to close down. Record their exit first.",
  INVALID_SECTION: "That part of the page couldn't be loaded. Refresh and try again.",

  // ── Letterhead & letter templates (PDF Generation Phase 1) ────────────────
  // The two branding images. Both caps are the server's, and both are checked
  // twice — once on the claim, again on the stored object — so the second
  // refusal can arrive after the first one passed.
  FILE_TOO_LARGE: "This image is larger than the letterhead allows. A logo can be up to 512 KB and a signature up to 256 KB — open it in an image editor, crop the empty space around it and save it again.",
  UNSUPPORTED_MEDIA_TYPE: "Letterhead images have to be PNG or JPEG. A PDF or an SVG can't be placed on a letter.",
  UPLOAD_CLAIM_NOT_FOUND: "This upload took too long and its link has expired. Choose the image again — it only takes a moment.",
  TEMPLATE_DISABLED: "This letter is switched off for your organisation, so it can't be prepared with your saved wording. Switch it on first.",
  // Previews. None of these is anything the person did wrong, and all of them
  // are worth telling apart: two are worth retrying, one needs an administrator.
  PREVIEW_RATE_LIMITED: "Your organisation has made a lot of previews this hour, so previewing pauses until the next hour begins. Everything you've saved is safe.",
  PDF_RENDER_TIMEOUT: "The letter took too long to draw and was stopped. Try the preview again.",
  PDF_RENDERER_UNAVAILABLE: "The service that draws letters can't be reached right now. Nothing is wrong with your letterhead — try the preview again in a moment.",
  PDF_RENDERER_NOT_CONFIGURED: "Letter previews aren't switched on for this server yet. Everything you set up here is saved and will be used as soon as they are — ask your administrator to turn on letter rendering.",
  PDF_TEMPLATE_INVALID: "This letter couldn't be drawn from its template. That's a fault on our side rather than anything in your settings — please report it.",
  STORAGE_UNAVAILABLE: "Secure storage isn't reachable right now. Nothing was changed — try again in a moment.",

  // ── Issuing and reissuing letters (PDF Generation Phase 2) ──────────────
  // Nothing here is a dead end. Every one of these either names what to fix, or
  // says plainly that waiting a moment is the whole fix — because the thing HR
  // must never do is start clicking Issue again and wonder how many letters
  // they have just created.
  LETTER_TEMPLATE_UNKNOWN: "This letter isn't in the catalogue any more. Refresh the page to see the letters you can issue today.",
  LETTER_TEMPLATE_DISABLED: "This letter is switched off for your organisation, so it can't be issued. Switch it on in Letter Templates first.",
  LETTER_FIELD_UNKNOWN: "One of the details typed in isn't part of this letter, so nothing was issued. Refresh the page and fill it in again.",
  LETTER_FIELD_NOT_OVERRIDABLE: "That detail comes straight from the person's record and can't be typed in here. Correct it on their profile, then issue the letter.",
  LETTER_FACTS_MISSING: "This person's record is missing something the letter has to print, so nothing was issued. Fill it in on their profile and try again.",
  LETTER_NOT_REISSUABLE: "Only the letter that is currently in force can be reissued. This one has already been replaced by a newer version, or withdrawn — open the newest version and reissue that.",
  LETTER_REFERENCE_CONFLICT: "Two letters were numbered at the same moment. Nothing was issued and no number was used up — try again.",
  LETTER_REFERENCE_PATTERN_INVALID: "Your letter numbering pattern can't be used. Fix it in Document Settings, then issue the letter.",
  LETTER_REFERENCE_TOO_LONG: "Your letter numbering pattern produces a number longer than 64 characters. Shorten it in Document Settings, then issue the letter.",
  DOCUMENT_ORIGIN_GENERATED: "This is a letter your organisation issued, so a file can't be uploaded over it. Reissue it instead — that keeps the original on file and replaces it properly.",
  DOCUMENT_TYPE_NOT_ACTIVATED: "The kind of document this letter is filed under hasn't been switched on yet. Open Document Types → Catalog → We issue, switch it on, then issue the letter.",
  PDF_RENDER_IN_PROGRESS: "This letter is still being drawn. Give it a few seconds and try again — doing so won't create a second copy.",
  PDF_RETRY_LIMIT_EXCEEDED: "This letter has failed to draw several times, so it won't be tried again automatically. Nothing was issued — start it again from the beginning, and tell your administrator if it keeps failing.",
  PDF_TOO_LARGE: "The finished letter came out larger than 6 MB, which is too big to file. Shorten the wording you typed in, or ask your administrator to check the letterhead images.",
  DB_COMMIT_FAILED: "The letter was drawn but couldn’t be filed, so nothing was issued and no number was used up. Try again.",

  // ── Bulk, proposals and auto-issue (PDF Generation Phase 4, #143–#150) ─────
  // Every one of these happens BEFORE anything is drawn, so each says plainly
  // that nothing went out — the whole worry with a batch of two hundred is
  // "how many of those did I just send?".
  LETTER_BULK_DUPLICATE_SUBJECT: "Somebody appears twice in this list, so nothing was queued. Remove the repeat and send it again — one person can only be sent one copy per batch.",
  LETTER_BULK_TOO_MANY_SUBJECTS: "This batch has more people in it than your organisation allows at once, so nothing was queued. Send it in smaller batches, or raise the limit in Document Settings.",
  LETTER_BULK_VALIDATION_FAILED: "Some of these people can’t be sent this letter, so none of them were — a batch goes out whole or not at all. Take the ones listed below out and send the rest.",
  // PDF Phase 5. The one refusal here that is about the ORGANISATION rather
  // than about this batch, and the only one where trying again straight away
  // makes things worse: a retry spends another allowance even when it is the
  // very same batch. So the copy says wait, and the screen shows how long.
  LETTER_BULK_RATE_EXCEEDED: "Your organisation has started as many batches this hour as it allows, so nothing was queued. Nobody was sent anything twice — wait until the allowance refreshes, then send this batch again. HR can raise the hourly limit in Document Settings.",
  LETTER_PROPOSALS_DISABLED: "Your organisation hasn’t opened letter drafting to managers, so this can’t be sent to HR. Ask HR to switch it on in Document Settings.",
  LETTER_PROPOSAL_EXISTS: "You’ve already asked for this letter for this person and HR hasn’t decided yet. Wait for that one rather than raising a second.",
  LETTER_PROPOSAL_NOT_PENDING: "Somebody has already decided this one, so nothing changed. Refresh to see what was decided.",
  PROPOSAL_SCOPE_STALE: "This person no longer reports to whoever drafted the letter, so it wasn’t approved automatically. Check it still makes sense, then approve it anyway if it does.",

  // Settings
  SCAN_PROVIDER_NOT_CONFIGURED: "Virus scanning isn't available yet, so it can't be turned on.",
  INSUFFICIENT_CHECKERS: "Separate checker needs at least two active HR administrators. Add another HR administrator first.",
  SETTINGS_CONFLICT: "Separate checker and manager direct authority can't both be on — a manager's decision would count as their own approval. Turn one off.",
  SETTING_OUT_OF_RANGE: "One of the values is outside its allowed range.",
};

// Joi rejections name the offending field; the server text is more useful here.
const SERVER_MESSAGE_CODES = new Set(["VALIDATION_ERROR", "SETTING_OUT_OF_RANGE"]);

/** The typed code (`errorCode`; `code` kept for older envelopes). */
export function documentErrorCode(err) {
  return err?.data?.errorCode || err?.data?.code || null;
}

/**
 * @param {unknown} err  error thrown by request()
 * @param {string} [fallback]
 * @returns {string}
 */
export function documentErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = documentErrorCode(err);
  const serverMessage = typeof err?.data?.message === "string" ? err.data.message.trim() : "";

  if (err?.status === 401) return "Your session has expired. Please sign in again.";
  if (isFeatureNotDeployed(err)) {
    return "This part of Documents isn't available on your server yet. It arrives with the next update — nothing is wrong with your data.";
  }
  if (code && SERVER_MESSAGE_CODES.has(code) && serverMessage) return serverMessage.replace(/"/g, "");
  if (code && DOCUMENT_ERROR_MESSAGES[code]) return DOCUMENT_ERROR_MESSAGES[code];
  if (err?.status === 503) return DOCUMENT_ERROR_MESSAGES.DOCUMENT_STORAGE_UNAVAILABLE;
  if (err?.status >= 500) return "The server ran into a problem. Please try again shortly.";
  if (err?.status === 429) return "Too many requests. Please wait a moment and try again.";
  if (serverMessage) return serverMessage;
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(err?.message || "")) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  const message = typeof err?.message === "string" ? err.message : "";
  if (message && !/^Request failed: \d+$/.test(message)) return message;
  return fallback;
}

export const isDocumentsDisabled = (err) => {
  const code = documentErrorCode(err);
  return code === "FEATURE_NOT_AVAILABLE" || code === "MISSING_ORG_CONTEXT";
};

export const isStaleRecommendation = (err) => documentErrorCode(err) === "RECOMMENDATION_SCOPE_STALE";
export const isAlreadyDecided = (err) => documentErrorCode(err) === "DOCUMENT_NOT_PENDING_VERIFICATION";

/** Publish refused because the proposing manager lost scope — HR may override (#47). */
export const isProposerScopeChanged = (err) => documentErrorCode(err) === "PROPOSER_SCOPE_CHANGED";

/** Publish refused because the draft has no confirmed file and no link (R-56). */
export const isFileMissing = (err) => documentErrorCode(err) === "ORG_DOCUMENT_FILE_MISSING";

/** Replace refused because a draft is already open; `details.document_id` points at it (#48). */
export const isDraftAlreadyOpen = (err) => documentErrorCode(err) === "ORG_DOCUMENT_DRAFT_EXISTS";
export const openDraftId = (err) => err?.data?.details?.document_id || null;

/** The audience resolved larger than the publish limit (#47). */
export function recipientLimitDetail(err) {
  if (documentErrorCode(err) !== "RECIPIENT_SET_TOO_LARGE") return null;
  const d = err?.data?.details || {};
  return { resolved: Number(d.resolved_count) || null, limit: Number(d.limit) || null };
}

/** The document moved on under us and the screen should re-read it. */
export const isOrgDocumentStale = (err) =>
  ["INVALID_STATUS_TRANSITION", "ORG_DOCUMENT_ALREADY_PUBLISHED", "ORG_DOCUMENT_NOT_EDITABLE", "RECIPIENT_ALREADY_COMPLETED"].includes(documentErrorCode(err));

// ── Phase 3 ─────────────────────────────────────────────────────────────────
/** The recipient's state moved under us (excused, or the document stopped being open). Re-read, don't retry. */
export const isComplianceStale = (err) =>
  ["RECIPIENT_WAIVED", "ORG_DOCUMENT_NOT_ACTIONABLE", "ACKNOWLEDGEMENT_NOT_REQUIRED", "SIGNATURE_NOT_REQUIRED"].includes(documentErrorCode(err));

export const isSignerNameMismatch = (err) => documentErrorCode(err) === "SIGNER_NAME_MISMATCH";

/** 404 on an evidence read (#75 / #78) just means nothing has been recorded yet. */
export const isNoEvidence = (err) => err?.status === 404 && documentErrorCode(err) === "DOCUMENT_NOT_FOUND";

/** #77 refused because the filters match too many rows. */
export function exportTooLargeDetail(err) {
  if (documentErrorCode(err) !== "EXPORT_TOO_LARGE") return null;
  const d = err?.data?.details || {};
  return { rows: Number(d.row_count) || null, max: Number(d.max_rows) || null };
}

/** #79 answers 403 when the organisation has turned team document visibility off. */
export const isTeamVisibilityOff = (err) => err?.status === 403 && (documentErrorCode(err) === "FORBIDDEN" || !documentErrorCode(err));

/**
 * #8 deactivate refused because work of this type is still open. `details` is
 * an open-ended map of counters (`open_employee_documents`, `open_org_documents`,
 * and later `open_document_requests`), so every numeric key is read.
 * Returns a sentence like "2 employee documents and 1 organisation document are
 * still open", or null for any other error.
 */
const OPEN_WORK_LABELS = {
  open_employee_documents: ["employee document waiting for upload or checking", "employee documents waiting for upload or checking"],
  open_org_documents: ["organisation document still in draft", "organisation documents still in draft"],
  open_document_requests: ["document request still open", "document requests still open"],
};
export function typeInUseSummary(err) {
  if (documentErrorCode(err) !== "DOCUMENT_TYPE_IN_USE") return null;
  const details = err?.data?.details || {};
  const parts = Object.entries(details)
    .map(([key, value]) => [key, Number(value)])
    .filter(([, n]) => Number.isFinite(n) && n > 0)
    .map(([key, n]) => {
      const [one, many] = OPEN_WORK_LABELS[key] || [key.replace(/^open_/, "").replace(/_/g, " ").replace(/s$/, ""), key.replace(/^open_/, "").replace(/_/g, " ")];
      return `${n} ${n === 1 ? one : many}`;
    });
  if (!parts.length) return DOCUMENT_ERROR_MESSAGES.DOCUMENT_TYPE_IN_USE;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `This type can't be switched off yet: ${list}. Finish, reject or delete those first — documents that are already done never block this.`;
}

// ── Phase 4 ─────────────────────────────────────────────────────────────────
/**
 * #80 / #93 refused because an open request already exists.
 * `details.request_id` points at it, so the screen can offer to open that one
 * instead of leaving the user to hunt for it.
 */
export function duplicateRequestId(err) {
  if (documentErrorCode(err) !== "DUPLICATE_REQUEST") return null;
  return err?.data?.details?.request_id || null;
}

/** A live document of this type already exists, so there is nothing to ask for. */
export const isDocumentAlreadyPresent = (err) => documentErrorCode(err) === "DOCUMENT_ALREADY_PRESENT";

/** #81 refused because the checklist has nothing outstanding — good news, not an error. */
export const isNothingToRequest = (err) => documentErrorCode(err) === "NOTHING_TO_REQUEST";

/**
 * The request moved on under us (met, cancelled, or no longer ours to see).
 * Re-read the list; retrying the same call will fail the same way.
 */
export const isRequestStale = (err) =>
  ["REQUEST_NOT_OPEN", "REQUEST_NOT_FOUND"].includes(documentErrorCode(err));

/**
 * A `/employees/:userId/...` read or write refused for scope. The manager
 * planes answer 403 here (rather than the 404 used for `/:id` routes), so the
 * screen can say plainly that the person isn't on their team.
 */
export const isOutOfScope = (err) => err?.status === 403 && documentErrorCode(err) === "FORBIDDEN";

/** #93 refused because this kind of document is HR's to ask for, not a manager's. */
export const isTypeNotRequestable = (err) => documentErrorCode(err) === "TYPE_NOT_REQUESTABLE";

/**
 * A checklist read (#86 / #96 / #98) answered "no such employee".
 *
 * On the self plane this is NOT a fault: an HR or administrator account that was
 * never set up as an employee has no employee record, so there is nothing for a
 * required-document checklist to be about. Verified against the live API — HR
 * and manager accounts without an employee profile get 404 USER_NOT_FOUND from
 * `/documents/me/checklist`, while `/documents/me/document-requests` answers an
 * ordinary empty list. The screen must say so plainly instead of telling
 * somebody they are no longer an active member of their own organisation.
 */
export const isNoEmployeeRecord = (err) => err?.status === 404 && documentErrorCode(err) === "USER_NOT_FOUND";

// ── Phase 5 ─────────────────────────────────────────────────────────────────
/**
 * #104 refused because a draft is already open in this template's group. The
 * server hands back which one, so the screen can offer to open it rather than
 * leaving somebody to hunt through the list. The key has been seen as both
 * `template_id` and `draft_id`, so both are read.
 */
export function existingTemplateDraftId(err) {
  if (documentErrorCode(err) !== "TEMPLATE_DRAFT_EXISTS") return null;
  const d = err?.data?.details || {};
  return d.template_id || d.draft_id || d.id || null;
}

/** The template moved on under us. Re-read it; retrying the same call fails the same way. */
export const isTemplateStale = (err) =>
  ["TEMPLATE_NOT_DRAFT", "TEMPLATE_NOT_REPLACEABLE", "TEMPLATE_NOT_ARCHIVABLE", "TEMPLATE_PUBLISH_CONFLICT", "TEMPLATE_NOT_DELETABLE"]
    .includes(documentErrorCode(err));

/** The template has nothing to publish or download yet (#103 / #110 / #112). */
export const isTemplateFileMissing = (err) =>
  ["TEMPLATE_FILE_MISSING", "TEMPLATE_FILE_NOT_UPLOADED"].includes(documentErrorCode(err));

/**
 * An export was refused because the audit ledger couldn't record it. This is
 * the one refusal worth spelling out: NOTHING was downloaded, so there is no
 * half-finished file anywhere, and trying again is the right response.
 */
export const isExportLedgerDown = (err) => documentErrorCode(err) === "EXPORT_LEDGER_UNAVAILABLE";

/** #123 refused because the pack would be over 500 items. */
export const isExitPackTooLarge = (err) => documentErrorCode(err) === "EXIT_PACK_TOO_LARGE";

/**
 * #122 refused because the last working day is still ahead. `details.effective_on`
 * is that date, which the dialog shows before offering to go ahead anyway.
 */
export function exitDateInFuture(err) {
  if (documentErrorCode(err) !== "EXIT_DATE_IN_FUTURE") return null;
  const d = err?.data?.details || {};
  return { effectiveOn: d.effective_on || d.last_working_day || null };
}

/** #122 refused because this person simply hasn't left. */
export const isNotOffboarding = (err) => documentErrorCode(err) === "NOT_OFFBOARDING";

/** #113 refused because the page asked for is past the server's depth limit. */
export const isPaginationTooDeep = (err) => documentErrorCode(err) === "PAGINATION_TOO_DEEP";

/**
 * The route isn't there at all — this part of the module hasn't been deployed
 * to the server the app is pointed at.
 *
 * Every real 404 from this API carries the JSON envelope (`{ success: false,
 * errorCode: ... }`). An unrouted path falls through to Express's own HTML
 * error page, so `request()` ends up with no parsed body at all. That absence
 * is the discriminator, and it is worth telling apart: "couldn't load the
 * forms" sends somebody hunting for a fault in their data, when the honest
 * answer is that their server is a release behind.
 */
export const isFeatureNotDeployed = (err) => err?.status === 404 && !err?.data;

/** #121 refused on the tags themselves, rather than on the document. */
export const isTagRejected = (err) =>
  ["TAG_TOO_LONG", "TAG_INVALID", "TOO_MANY_TAGS"].includes(documentErrorCode(err));

// ── Letterhead & letter templates (PDF Generation Phase 1, #130–#138) ───────
/**
 * A Joi rejection names the offending key: `"signatory_name" must not contain
 * < or >`. `documentErrorMessage` already strips the quotes; this also turns the
 * key itself into words, so nothing on screen reads like a column name. Only
 * snake_case tokens are touched, so `image/png` and `#1F2937` survive intact.
 */
function humaniseFieldKeys(text) {
  return String(text || "").replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (key) => key.replace(/_/g, " "));
}

/** The field a 422 PDF_DATA_INCOMPLETE named, in words, or "" when it named none. */
export function incompleteLetterField(err) {
  if (documentErrorCode(err) !== "PDF_DATA_INCOMPLETE") return "";
  const quoted = /"([a-z][a-z0-9_]*)"/i.exec(String(err?.data?.message || ""));
  return quoted ? quoted[1].replace(/_/g, " ") : "";
}

/**
 * Error text for the letterhead and letter-template screens.
 *
 * Two codes have to be read differently here. `TEMPLATE_NOT_FOUND` is mapped
 * for Phase 5's blank forms ("this form has been retired"), which would be
 * baffling on a letter — here it means the platform has withdrawn the letter
 * from its catalog. And `PDF_DATA_INCOMPLETE` carries the name of the field that
 * came out empty, which is the whole value of the message, so it is rebuilt
 * around that name instead of being flattened to one sentence.
 */
export function letterErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = documentErrorCode(err);
  if (code === "TEMPLATE_NOT_FOUND") {
    return "This letter isn't in the catalogue any more. It may have been withdrawn or replaced — refresh to see the letters you can use.";
  }
  if (code === "PDF_DATA_INCOMPLETE") {
    const field = incompleteLetterField(err);
    return field
      ? `The letter needs ${field} and it came out blank, so it wasn't drawn. Fill that in and preview again.`
      : "One of the details this letter needs came out blank, so it wasn't drawn. Fill in the missing wording and preview again.";
  }
  return humaniseFieldKeys(documentErrorMessage(err, fallback));
}

/** The renderer isn't wired up on this server — the seven non-drawing endpoints still work. */
export const isRendererNotConfigured = (err) => documentErrorCode(err) === "PDF_RENDERER_NOT_CONFIGURED";

/** The hourly preview cap. Nothing was lost; waiting is the fix, not retrying. */
export const isPreviewRateLimited = (err) => documentErrorCode(err) === "PREVIEW_RATE_LIMITED";

/**
 * A preview failed on the way out rather than on anything HR typed: the renderer
 * was unreachable, timed out, or storage blinked. These are the ones where "Try
 * again" is honest advice, so the dialog offers it.
 */
export const isPreviewTransient = (err) =>
  ["PDF_RENDERER_UNAVAILABLE", "PDF_RENDER_TIMEOUT", "STORAGE_UNAVAILABLE"].includes(documentErrorCode(err));

/** The saved wording couldn't be used because the letter is switched off (#138). */
export const isLetterTemplateDisabled = (err) => documentErrorCode(err) === "TEMPLATE_DISABLED";

/**
 * The upload handshake broke between the presign and the confirm. Both are
 * recoverable, and both need the FILE choosing again rather than the confirm
 * repeating — the claim is single-use and short-lived, and 409 means the bytes
 * never landed at all.
 */
export const isLetterUploadLost = (err) =>
  ["UPLOAD_CLAIM_NOT_FOUND", "UPLOAD_NOT_FOUND"].includes(documentErrorCode(err));

// ── Issuing and reissuing letters (PDF Generation Phase 2) ──────────────────
/**
 * Error text for the issue and reissue screens.
 *
 * Three codes are shared with the Phase 1 preview buttons and are worded for
 * them ("try the preview again", "letter previews aren't switched on"). On a
 * screen where somebody has just tried to issue a real, numbered letter to a
 * real person, that wording is at best confusing and at worst frightening — the
 * only question they have is "did it go out?". So those three are re-answered
 * here, and every one of them says that nothing was issued.
 *
 * Two codes name what is missing, and the name IS the message: which fact the
 * person's record lacks, and which detail may not be typed in. Both are rebuilt
 * around that name rather than flattened to one sentence.
 */
export function letterIssueErrorMessage(err, fallback = "Couldn’t issue this letter.") {
  const code = documentErrorCode(err);

  if (code === "PDF_RENDERER_NOT_CONFIGURED") {
    return "Letters can’t be drawn on this server yet, so nothing was issued. Ask your administrator to turn on letter rendering — everything you’ve set up is saved and will be used the moment they do.";
  }
  if (code === "PDF_RENDER_TIMEOUT") {
    return "The letter took too long to draw and was stopped, so nothing was issued and no number was used up. Try again.";
  }
  if (code === "PDF_RENDERER_UNAVAILABLE") {
    return "The service that draws letters can’t be reached right now, so nothing was issued. Nothing is wrong with your letterhead — try again in a moment.";
  }
  if (code === "STORAGE_UNAVAILABLE") {
    return "Secure storage isn’t reachable right now, so nothing was issued and no number was used up. Try again in a moment.";
  }
  if (code === "PDF_DATA_INCOMPLETE") {
    const missing = incompleteLetterFields(err);
    return missing.length
      ? `The letter needs ${listPhrase(missing)} and ${missing.length === 1 ? "it came" : "they came"} out blank, so nothing was issued. Fill ${missing.length === 1 ? "it" : "them"} in and issue it again.`
      : "One of the details this letter needs came out blank, so nothing was issued. Fill in the missing wording and issue it again.";
  }
  if (code === "LETTER_FACTS_MISSING") {
    const missing = missingLetterFacts(err);
    return missing.length
      ? `This person’s record is missing ${listPhrase(missing)}, and the letter has to print ${missing.length === 1 ? "it" : "them"}. Nothing was issued — fill ${missing.length === 1 ? "it" : "them"} in on their profile, then issue the letter.`
      : DOCUMENT_ERROR_MESSAGES.LETTER_FACTS_MISSING;
  }
  if (code === "LETTER_FIELD_NOT_OVERRIDABLE") {
    const field = letterErrorField(err);
    return field
      ? `“${field}” comes straight from this person’s record and can’t be typed in here. Correct it on their profile, then issue the letter.`
      : DOCUMENT_ERROR_MESSAGES.LETTER_FIELD_NOT_OVERRIDABLE;
  }
  if (code === "LETTER_FIELD_UNKNOWN") {
    const field = letterErrorField(err);
    return field
      ? `“${field}” isn’t part of this letter, so nothing was issued. It has been removed — issue the letter again.`
      : DOCUMENT_ERROR_MESSAGES.LETTER_FIELD_UNKNOWN;
  }
  return letterErrorMessage(err, fallback);
}

/** "a, b and c" — used wherever a refusal names more than one thing. */
function listPhrase(items) {
  const parts = (items || []).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The field a `LETTER_FIELD_*` refusal named, in words, or "".
 *
 * The server sends `details.field`; the message quotes it too. Both are read,
 * because `details` is documented but a 422 raised further down the stack may
 * carry only the sentence.
 */
export function letterErrorField(err) {
  const raw = err?.data?.details?.field;
  if (typeof raw === "string" && raw.trim()) return raw.trim().replace(/_/g, " ");
  const quoted = /"([a-z][a-z0-9_]*)"/i.exec(String(err?.data?.message || ""));
  return quoted ? quoted[1].replace(/_/g, " ") : "";
}

/** The raw key a `LETTER_FIELD_*` refusal named (`purpose`), for dropping it from the form. */
export function letterErrorFieldKey(err) {
  const raw = err?.data?.details?.field;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const quoted = /"([a-z][a-z0-9_]*)"/i.exec(String(err?.data?.message || ""));
  return quoted ? quoted[1] : "";
}

/** The facts a 422 LETTER_FACTS_MISSING named, in words. `details.missing_facts`, else the sentence. */
export function missingLetterFacts(err) {
  if (documentErrorCode(err) !== "LETTER_FACTS_MISSING") return [];
  const listed = err?.data?.details?.missing_facts;
  if (Array.isArray(listed) && listed.length) {
    return listed.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim().replace(/_/g, " "));
  }
  // "Required letter facts are missing: employee_code, joining_date"
  const tail = /missing:\s*(.+)$/i.exec(String(err?.data?.message || ""));
  if (!tail) return [];
  return tail[1].split(/[,;]+/).map((f) => f.trim().replace(/[."']+$/, "").replace(/_/g, " ")).filter(Boolean);
}

/** The fields a 422 PDF_DATA_INCOMPLETE named, in words. `details.missing_fields`, else the sentence. */
export function incompleteLetterFields(err) {
  if (documentErrorCode(err) !== "PDF_DATA_INCOMPLETE") return [];
  const listed = err?.data?.details?.missing_fields;
  if (Array.isArray(listed) && listed.length) {
    return listed.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim().replace(/_/g, " "));
  }
  const one = incompleteLetterField(err);
  return one ? [one] : [];
}

/**
 * Another request under the same key is still drawing this letter (#139/#142).
 *
 * The ONLY safe response is to wait and repeat the SAME request: the key is what
 * stops a second letter being created, so a fresh key here would issue the
 * duplicate this code exists to prevent.
 */
export const isRenderInProgress = (err) => documentErrorCode(err) === "PDF_RENDER_IN_PROGRESS";

/** The reference number collided. Nothing was issued, no number was used — repeating is safe. */
export const isReferenceConflict = (err) => documentErrorCode(err) === "LETTER_REFERENCE_CONFLICT";

/** Too many failures under this key. Terminal for the key: the next attempt needs a fresh one. */
export const isRetryLimitExceeded = (err) => documentErrorCode(err) === "PDF_RETRY_LIMIT_EXCEEDED";

/** The letter to reissue isn't the one in force any more. */
export const isLetterNotReissuable = (err) => documentErrorCode(err) === "LETTER_NOT_REISSUABLE";

/** An upload was pointed at a generated letter (#45/#46/#48). Reissue is the way. */
export const isGeneratedOrigin = (err) => documentErrorCode(err) === "DOCUMENT_ORIGIN_GENERATED";

/**
 * Nothing was issued and the same request may safely be sent again, with a
 * FRESH key — the renderer or storage failed on the way out, or two numbers
 * collided. `PDF_RENDER_IN_PROGRESS` is deliberately NOT in this list: it is
 * also worth retrying, but only with the same key, which is a different rule.
 */
export const isLetterIssueRetryable = (err) =>
  ["PDF_RENDERER_UNAVAILABLE", "PDF_RENDER_TIMEOUT", "STORAGE_UNAVAILABLE", "LETTER_REFERENCE_CONFLICT", "DB_COMMIT_FAILED"]
    .includes(documentErrorCode(err));

/**
 * A refusal that named a field of the form, so the form can drop that field and
 * let the person try again in one click instead of guessing. See
 * `letterOverridableFields()` for why the frontend can be wrong about this.
 */
export const isLetterFieldRejected = (err) =>
  ["LETTER_FIELD_UNKNOWN", "LETTER_FIELD_NOT_OVERRIDABLE"].includes(documentErrorCode(err));

/**
 * The server never answered, so nobody can say whether the letter went out.
 *
 * `request()` only sets `status` when an HTTP response came back, so its absence
 * means the connection dropped, the network went, or a proxy gave up — possibly
 * AFTER the letter was issued and numbered. This is the one failure a screen must
 * not describe as "nothing was issued", and the one where the retry has to reuse
 * the same idempotency key (see `keyForRetry`).
 */
export const isLetterOutcomeUnknown = (err) => !Number.isFinite(Number(err?.status));

// ── Bulk, proposals and auto-issue (PDF Generation Phase 4, #143–#150) ───────

/** The batch was refused whole. Each entry names one person and why. */
export function bulkValidationFailures(err) {
  const raw = err?.data?.details?.failures ?? err?.data?.failures;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      subjectUserId: row?.subject_user_id || row?.user_id || "",
      code: row?.failure_code || row?.code || "",
      reason: row?.failure_reason || row?.reason || row?.message || "",
    }))
    .filter((row) => row.subjectUserId || row.reason);
}

/** Over `letter_bulk_max_subjects` — the ceiling, when the refusal names it. */
export function bulkSubjectLimit(err) {
  const raw = err?.data?.details?.max ?? err?.data?.details?.limit ?? err?.data?.details?.letter_bulk_max_subjects;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const isBulkValidationFailed = (err) => documentErrorCode(err) === "LETTER_BULK_VALIDATION_FAILED";
export const isBulkTooMany = (err) => documentErrorCode(err) === "LETTER_BULK_TOO_MANY_SUBJECTS";
/** #143's hourly ceiling on BATCHES (#96), distinct from #91's ceiling on people. */
export const isBulkRateLimited = (err) => documentErrorCode(err) === "LETTER_BULK_RATE_EXCEEDED";

/**
 * How long to wait after a 429, in seconds.
 *
 * The body is read first and the `Retry-After` header second: a proxy can drop
 * a header but never the payload, and both carry the same number. It counts
 * down to the top of the next clock hour, which is when the allowance refreshes
 * — it is a fixed window, not a rolling sixty minutes, so the wait is usually
 * well under an hour.
 *
 * Null when neither is present, which a screen shows as "shortly" rather than
 * inventing a number to count down from.
 */
export function retryAfterSeconds(err) {
  const raw = err?.data?.details?.retry_after_seconds ?? err?.data?.retry_after_seconds ?? err?.retryAfter;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}
export const isProposalsDisabled = (err) => documentErrorCode(err) === "LETTER_PROPOSALS_DISABLED";
export const isProposalDuplicate = (err) => documentErrorCode(err) === "LETTER_PROPOSAL_EXISTS";
export const isProposalDecided = (err) => documentErrorCode(err) === "LETTER_PROPOSAL_NOT_PENDING";
export const isSelfApproval = (err) => documentErrorCode(err) === "SELF_APPROVAL_NOT_ALLOWED";
/** The proposer no longer manages the subject. Clearable — see #149's `acknowledge_stale_scope`. */
export const isProposalScopeStale = (err) => documentErrorCode(err) === "PROPOSAL_SCOPE_STALE";

/**
 * This server doesn't have the proposal queue yet, as opposed to having it and
 * finding nothing in it.
 *
 * A server from before Phase 4 has no `/letters/proposals` route, so the word
 * "proposals" falls through to `/letters/:id` and comes back as a malformed id
 * (400) or a missing letter (404) — neither of which means what it says. Both
 * readings are "the feature isn't deployed", which a screen shows as an
 * explanation rather than as a failure, and a badge counts as zero rather than
 * as unknown.
 */
export const isProposalQueueMissing = (err) => {
  const status = Number(err?.status);
  if (status === 404) return true;
  return status === 400 && ["VALIDATION_ERROR", "", undefined].includes(documentErrorCode(err));
};
