// ─────────────────────────────────────────────────────────────────────────────
// appMeta.js — everything the marketing site says about the mobile app.
//
// HR Clouds ships as two surfaces of one product: the web workspace (HR,
// managers, payroll, reporting) and the Android app (everyone, day to day).
// The homepage leads with the app now, so the store link, the phone shot and
// the platform copy live here rather than being typed on each section — one
// place to change when the listing goes live or iOS lands.
//
// Trap: PLAY_STORE_URL is the single source of the Play link — the hero badge
// reads it, so correct the package id here once and the badge follows. Set it
// to null and the badge disappears rather than pointing nowhere (§7 — gate the
// UI on what exists).
// ─────────────────────────────────────────────────────────────────────────────

import iconApp from "../assets/app/icon-app.png";
import iconBrowser from "../assets/app/icon-browser.png";

/**
 * The live Play Store listing (confirmed 24 Nov 2026). The share link's
 * `pcampaignid` tracking parameter is dropped deliberately — it tags the
 * install as coming from a Play share sheet, which would misattribute every
 * visitor who arrives from our own homepage.
 */
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.hrclouds";

/**
 * The phone shot in the hero, supplied by the client (24 Nov 2026).
 *
 * It lives in public/ and is referenced by URL, not imported: it is a 1.2 MB
 * composition that Vite would otherwise inline into the bundle graph for no
 * gain. It is also a finished picture — handset, app screen and callout
 * labels baked into one PNG — so the hero renders it plain, NOT inside
 * PhoneFrame, whose 9:19 box would crop it. Set this to null and the hero
 * falls back to PhoneFrame's drawn placeholder, same slot, no reflow.
 */
export const HERO_PHONE_IMAGE = "/herosideimg.png";

/** Intrinsic size of the shot above — declared so the hero reserves its box. */
export const HERO_PHONE_SIZE = { width: 1211, height: 1299 };

/**
 * The 3D icons that head the two platform cards, keyed by platform id. They
 * are rendered unframed at ~7rem, so they are art, not glyphs — swapping one
 * for a line icon would collapse the card's masthead. Both are square 450px
 * PNGs with transparent backgrounds, which is what lets them sit straight on
 * the grey panel.
 */
export const PLATFORM_ICONS = {
  app: { src: iconApp },
  web: { src: iconBrowser },
};

/** The two surfaces, side by side, so nobody wonders which one they need. */
export const PLATFORMS = [
  {
    id: "app",
    eyebrow: "Android app",
    title: "For everyone, every day",
    body: "Attendance, payslips, leave and approvals — the things people touch daily, built for a phone.",
    points: ["Clock in and out", "Payslips and tax", "Leave and comp-off"],
  },
  {
    id: "web",
    eyebrow: "Web workspace",
    title: "For running the whole thing",
    body: "Payroll runs, salary structures, documents, policies and reporting — the deep work HR does on a big screen.",
    points: ["Run payroll", "Salary and settlements", "Documents and letters"],
  },
];
