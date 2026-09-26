// ─────────────────────────────────────────────────────────────────────────────
// documents/portfolioMeta.js — "Document Home" (Phase 5, #126): one read
// that gathers the four places a person's paperwork actually lives.
//
// The endpoint is built around two decisions that this file exists to respect.
//
// 1. No item carries a signed link. Each one has an `access.path` — the
//    endpoint to call at the moment somebody clicks. That is why a page of
//    sixty items costs nothing to render and writes nothing to the audit trail:
//    opening a document is a deliberate act, and only that is recorded. So
//    `accessCall()` below turns a path into the call to make, and nothing here
//    resolves a URL up front.
//
// 2. Every section fails on its own. If payroll is having a bad morning the
//    other three still arrive, and the payroll one comes back
//    `{ available: false, reason }`. A section that isn't available is a note in
//    its own card, never an error page — the person came here for their
//    passport, and the passport is right there.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE_URL } from "../api/client";
import { humanizeCode } from "./documentMeta";

/** The four sections, in the order they are shown. */
export const PORTFOLIO_SECTIONS = [
  {
    key: "my_documents",
    title: "My documents",
    blurb: "Everything you've uploaded, or HR has uploaded for you — ID, certificates, proofs.",
    linkLabel: "Open my documents",
    emptyTitle: "Nothing uploaded yet",
    emptyMessage: "Anything you add to your file will appear here.",
  },
  {
    key: "org_documents",
    title: "Company documents",
    blurb: "Policies, handbooks and letters your organisation has issued to you.",
    linkLabel: "Open company documents",
    emptyTitle: "Nothing issued to you",
    emptyMessage: "Company policies addressed to you will appear here.",
  },
  {
    key: "templates",
    title: "Forms to fill in",
    blurb: "Blank company forms you can download, complete and send back.",
    linkLabel: "Browse all forms",
    emptyTitle: "No forms published",
    emptyMessage: "Your HR team hasn't published any blank forms yet.",
  },
  {
    key: "payroll",
    title: "Payslips & tax",
    blurb: "Your monthly payslips and annual tax statements.",
    linkLabel: "Open my payslips",
    emptyTitle: "No payslips yet",
    emptyMessage: "Payslips appear here once a pay run is finalised.",
  },
];

export const PORTFOLIO_SECTION_KEYS = PORTFOLIO_SECTIONS.map((s) => s.key);
/** #126 caps each section at 100. */
export const PORTFOLIO_SECTION_LIMIT_MAX = 100;

/** Why a section has nothing to show, said as a fact rather than an error. */
const SECTION_REASONS = {
  NOT_ENTITLED: "Your organisation isn't using this part of HR Clouds.",
  UNAVAILABLE: "This part is having trouble right now. Everything else on this page is up to date — try again in a moment.",
};
export const sectionReasonMessage = (reason) => SECTION_REASONS[reason] || SECTION_REASONS.UNAVAILABLE;

const EMPTY_SECTION = { available: false, reason: "UNAVAILABLE", items: [], hasMore: false };

/**
 * #126 → all four sections, always present and always the same shape, so no
 * card has to guard for a section the server left out.
 */
export function portfolioOf(res) {
  const data = res?.data ?? res ?? {};
  const raw = data.sections || {};
  const sections = Object.fromEntries(PORTFOLIO_SECTION_KEYS.map((key) => {
    const section = raw[key];
    if (!section) return [key, EMPTY_SECTION];
    return [key, {
      available: section.available !== false,
      reason: section.reason || null,
      items: Array.isArray(section.items) ? section.items : [],
      hasMore: section.has_more === true,
    }];
  }));
  return {
    sections,
    generatedAt: data.generated_at || null,
    // What the person actually has to do something about, across every section.
    actionCount: Object.values(sections).reduce(
      (sum, section) => sum + section.items.filter((item) => item?.requires_action).length,
      0,
    ),
  };
}

/** What a person is being asked to do with an item, in their own words. */
const ACTIONS = {
  acknowledge: { label: "Read & confirm", blurb: "You need to open this and confirm you've read it." },
  sign: { label: "Sign", blurb: "You need to open this and sign it." },
  view: { label: "Open", blurb: "You haven't opened this yet." },
  upload: { label: "Upload", blurb: "A copy of this is still needed." },
  replace: { label: "Upload again", blurb: "This needs a fresh copy." },
};
export const itemActionMeta = (action) =>
  ACTIONS[action] || { label: humanizeCode(action) || "Action needed", blurb: "This still needs something from you." };

// ── Turning `access.path` into a call ───────────────────────────────────────
// The paths the server sends are full API routes ("/api/v1/documents/…"),
// while every client function here is written relative to the API base. The
// base is read rather than assumed, so pointing the app at a differently
// mounted API doesn't silently break every link on this page.
const BASE_PATH = (() => {
  try {
    return new URL(API_BASE_URL, "http://localhost").pathname.replace(/\/+$/, "");
  } catch {
    return "/api/v1";
  }
})();

/** "/api/v1/documents/…" → "/documents/…", ready for `request()`. */
export function relativeApiPath(path) {
  const value = String(path || "").trim();
  if (!value.startsWith("/")) return "";
  return BASE_PATH && value.startsWith(`${BASE_PATH}/`) ? value.slice(BASE_PATH.length) : value;
}

/**
 * How to open one item.
 *  - `signed`  the path answers `{ url }`; fetch it, then follow the URL.
 *  - `file`    the path streams the file itself; download it with the session
 *              token (payslips and Form 16 work this way).
 * Returns null for an item with no usable path, and the caller hides the button.
 */
export function accessCall(item) {
  const path = relativeApiPath(item?.access?.path);
  if (!path) return null;
  const kind = item?.access?.kind || "";
  const mode = kind.startsWith("payroll") || /\.(pdf|csv)$|\/pdf$/.test(path) ? "file" : "signed";
  return { mode, path, kind, fileName: suggestedFileName(item) };
}

/**
 * The link out of a signed-URL reply. The three endpoints this page calls do
 * not agree on the key — a document answers `view_url`, a template answers
 * `url` — so all of them are read rather than branching on which it was.
 */
export const signedUrlOf = (res) => {
  const data = res?.data ?? res ?? {};
  return data.view_url || data.url || data.download_url || "";
};

/** A sensible name for a downloaded file, since the server's own name wins anyway. */
function suggestedFileName(item) {
  const title = String(item?.title || "document").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return /\.[a-z0-9]{2,5}$/i.test(title) ? title : `${title}.pdf`;
}

/** Items that need something doing, first; everything else keeps server order. */
export function actionFirst(items = []) {
  return [...items].sort((a, b) => Number(!!b?.requires_action) - Number(!!a?.requires_action));
}
