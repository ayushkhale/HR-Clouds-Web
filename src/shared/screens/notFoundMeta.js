// ─────────────────────────────────────────────────────────────────────────────
// notFoundMeta.js — What the 404 ("Lost page") screen searches, and how.
//
// Signed-in users search their own sidebar (the list DashboardSidebar publishes
// through SidebarContext), so every result is a page inside their workspace —
// the 404 must never offer a link the route gate would bounce (CLAUDE.md §2).
// Signed-out visitors search PUBLIC_PAGES below.
// ─────────────────────────────────────────────────────────────────────────────

import { isUuid } from "../attendance/normalize";
import { MY_DOCUMENT_PATHS, MY_PAY_PATHS, ORG_PATHS, SELF_SERVICE_BASE } from "../attendance/paths";
import { DICTIONARY } from "../config/dictionary";

/**
 * The pages every workspace has, built from the same path maps and labels the
 * sidebar uses. The 404 renders without the sidebar, so when nothing has
 * published the full menu yet (the 404 was the first page of the visit), this
 * is what the search falls back to — still only pages inside `workspace`.
 */
export function workspacePages(workspace) {
  const base = SELF_SERVICE_BASE[workspace];
  const pay = MY_PAY_PATHS[workspace];
  const docs = MY_DOCUMENT_PATHS[workspace];
  const org = ORG_PATHS[workspace];
  if (!base || !pay || !docs || !org) return [];
  const { REGULARIZATION, COMP_OFF } = DICTIONARY.TERMS;
  return [
    { label: "Dashboard", path: `/dashboard/${workspace}`, section: "Main" },
    { label: "My Attendance", path: base, section: "My Time" },
    { label: "My Leaves", path: pay.leaves, section: "My Time" },
    { label: `My ${REGULARIZATION}s`, path: `${base}/regularizations`, section: "My Time" },
    { label: "My Overtime", path: `${base}/overtime`, section: "My Time" },
    { label: "My Flags", path: `${base}/anomalies`, section: "My Time" },
    { label: `My ${COMP_OFF}`, path: `${base}/comp-offs`, section: "My Time" },
    { label: "My Salary & Bank", path: pay.salary, section: "My Pay" },
    { label: "My Payslips", path: pay.payslips, section: "My Pay" },
    { label: "My Claims & Benefits", path: pay.claims, section: "My Pay" },
    { label: "My Loans & Variable Pay", path: pay.loans, section: "My Pay" },
    { label: "My Tax & Investments", path: pay.tax, section: "My Pay" },
    { label: "My Document Home", path: docs.all, section: "My Documents" },
    { label: "My Personal Documents", path: docs.documents, section: "My Documents" },
    { label: "My Company Documents", path: docs.company, section: "My Documents" },
    { label: "My Document Requests", path: docs.requests, section: "My Documents" },
    { label: "Org Chart", path: org.chart, section: "Company" },
    { label: "Company Profile", path: org.company, section: "Company" },
    { label: "My Profile", path: "/dashboard/profile", section: "Account" },
  ];
}

/**
 * Only the menu entries that belong to `workspace` (or the shared /dashboard
 * pages every role has). The sidebar's published list outlives the sidebar in
 * SidebarContext, so this guards against ever offering another workspace's page.
 */
export function pagesInWorkspace(items, workspace) {
  const prefix = `/dashboard/${workspace}`;
  const shared = /^\/dashboard\/(profile|directory|documents)(\/|$)/;
  return (items || []).filter((item) => item.path === prefix || item.path?.startsWith(`${prefix}/`) || shared.test(item.path || ""));
}

/** The pages a signed-out visitor can open. `keywords` catch the words people type. */
export const PUBLIC_PAGES = [
  { label: "Home", path: "/", section: "HR Clouds", keywords: "start main landing" },
  { label: "About us", path: "/about", section: "HR Clouds", keywords: "company team mission story" },
  { label: "Services", path: "/services", section: "HR Clouds", keywords: "features payroll attendance leave documents" },
  { label: "Pricing", path: "/pricing", section: "HR Clouds", keywords: "plans price cost subscription" },
  { label: "Contact us", path: "/contact", section: "HR Clouds", keywords: "support help email phone sales" },
  { label: "Sign in", path: "/auth/login", section: "Account", keywords: "login log in account password" },
  { label: "Create an account", path: "/auth/register", section: "Account", keywords: "sign up register join" },
  { label: "Forgot password", path: "/auth/forgot-password", section: "Account", keywords: "reset password otp" },
  { label: "Privacy Policy", path: "/legal/privacy", section: "Legal", keywords: "data privacy" },
  { label: "Terms of Service", path: "/legal/terms", section: "Legal", keywords: "terms conditions" },
  { label: "Cookie Policy", path: "/legal/cookies", section: "Legal", keywords: "cookies" },
  { label: "Statutory Guidelines", path: "/legal/statutory", section: "Legal", keywords: "pf esi tax compliance law" },
];

/**
 * Rank `pages` against what was typed: a label that starts with the query
 * first, then a label containing it, then a match on the section or keywords.
 * Every word must match somewhere, so "leave policy" narrows rather than widens.
 */
export function searchPages(pages, query, limit = 6) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const page of pages) {
    const label = page.label.toLowerCase();
    const haystack = `${label} ${(page.section || "").toLowerCase()} ${(page.keywords || "").toLowerCase()}`;
    if (!words.every((word) => haystack.includes(word))) continue;
    const first = words[0];
    const score = label.startsWith(first) ? 0 : label.includes(first) ? 1 : 2;
    scored.push({ page, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.page.label.localeCompare(b.page.label))
    .slice(0, limit)
    .map(({ page }) => page);
}

/**
 * The address the person asked for, safe to print: database ids are masked
 * (CLAUDE.md §4 — no id reaches the screen, even inside a URL) and the query
 * string is dropped.
 */
export function displayAddress(pathname = "/") {
  const masked = pathname
    .split("/")
    .map((segment) => (isUuid(decodeURIComponentSafe(segment)) ? "…" : segment))
    .join("/");
  return masked.length > 64 ? `${masked.slice(0, 61)}…` : masked;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
