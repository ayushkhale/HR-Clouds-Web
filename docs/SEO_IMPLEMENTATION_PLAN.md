# SEO Implementation Plan — HR Clouds Marketing Site

**Scope:** the public marketing site only (`/`, `/about`, `/services`, `/pricing`, `/contact`, `/legal/*`). The signed-in product (`/dashboard/**`) and auth flows are explicitly **out of scope for indexing** and are handled here only to make sure they are *excluded* correctly.

**Constraint honoured throughout:** no visual redesign. Every change below is either invisible to a sighted user, or is a semantic/markup change that renders identically. Where a change has any visual consequence at all, it is called out explicitly and marked **⚠︎ visible**.

**Audience:** frontend engineers implementing this, plus whoever owns the Nginx config and the domain.

**Status of the codebase as audited:** branch `dev`, commit `03c9792`, 2026-09-23.

---

## 1. Executive summary

The site currently has **effectively no SEO layer at all**. It is a client-rendered SPA that ships a single `index.html` with one hardcoded `<title>` and one hardcoded `<meta name="description">` for all ten public routes. There is no `robots.txt`, no `sitemap.xml`, no canonical URL, no Open Graph or Twitter card data, and no structured data.

Beyond the missing layer, the audit found four issues that are actively harmful and should be fixed before anything else:

| # | Issue | Impact |
|---|---|---|
| **A** | `dist/ref docs/` — **104 internal engineering documents, 5 MB**, including `api_registry.md`, phase implementation plans and audit reports — is committed to the repo and rsync'd to the public web root. | Internal API surface, schema details and unreleased roadmap are publicly fetchable and indexable. **Security issue first, SEO issue second.** |
| **B** | `index.html` preloads `/logocolored.png` (**420 KB**) on every page. That file is used *only* by `DashboardSidebar.jsx` — never on the marketing site. | 420 KB of high-priority bandwidth wasted on every marketing pageview, competing with the real LCP image. |
| **C** | `/services` renders only the **active tab's 4 cards**; the other ~16 service descriptions are not in the DOM. | The richest keyword content on the site (20 HR/payroll module descriptions) is ~80% invisible to crawlers. |
| **D** | Every public route returns the same `<title>` — `"HrClouds - Cloud Based HRMS & Payroll"`. | All ten pages compete as duplicates; no page can rank for its own intent. Social shares of `/pricing` show homepage copy. |

The plan is sequenced so that the highest-impact, lowest-risk work lands first.

### What is *already* right

Worth stating, because it shapes the plan — these do **not** need work:

- **Every `<img>` on the landing site has an `alt` attribute** (verified across all 11 image tags). Decorative images correctly use `alt=""`.
- **Landmarks are correct** — `<header>`, `<nav>`, `<main>`, `<footer>` are all real elements.
- **All internal navigation uses React Router `<Link>`/`<NavLink>`**, which render real `<a href>` elements. Crawlers can follow them.
- **`RevealText` keeps words in the DOM** — it translates them, never removes them. The scroll animation system is not hiding text from crawlers.
- **The pricing FAQ content is always in the DOM** (it uses a `grid-rows-[0fr]→[1fr]` collapse, not conditional rendering), so it is ready for `FAQPage` structured data with no markup change.
- The bundle work already done (route-level code splitting, 2,844 KB → 429 KB entry chunk) is a significant Core Web Vitals asset. **Do not regress it.**

---

## 2. The central architectural decision: prerendering

### The problem

`src/main.jsx` calls `createRoot().render()`. The server sends `<div id="root"></div>` and nothing else. Everything a crawler needs — headings, copy, links, and any per-route `<title>` we add — exists only after JavaScript executes.

Googlebot *does* render JavaScript, so the site is not invisible to Google. But:

1. **Rendering is deferred and budgeted.** JS-rendered pages go into a render queue; indexing is slower and less reliable, particularly for a new domain with no crawl authority.
2. **Non-Google crawlers largely do not render JS.** Bing is inconsistent. More importantly, **every social and messaging unfurler is a pure HTML fetcher** — LinkedIn, Twitter/X, WhatsApp, Slack, Facebook. For a B2B SaaS product where pricing pages get shared into procurement email threads and Slack channels, a share preview that always says "HrClouds - Cloud Based HRMS & Payroll" regardless of the page is a direct commercial loss.
3. **`useEffect`-injected meta tags are invisible to all of the above.** Any client-side `<title>` solution fixes Google-eventually and fixes nothing else.

### The decision: **build-time prerendering via headless Chrome**

After the build, run each public route through headless Chrome, let the app render, and write the resulting HTML to `dist/<route>/index.html`. The SPA is untouched — it still boots and takes over on load. Crawlers get complete HTML immediately.

### Alternatives considered and rejected

| Option | Verdict |
|---|---|
| **React Router v7 framework mode** (official SSR/prerender support — the installed router already supports it) | Rejected **for now**. It is the technically superior end state, but it requires restructuring all ~120 routes into a data-router config, adding a server runtime or a build adapter, and re-validating every auth guard and `useNavigate` call. That is a multi-week migration with real regression risk across the signed-in product, for a benefit the marketing site can get in two days. **Revisit if/when SSR is needed for logged-in pages.** |
| **`vite-react-ssg`** | Rejected. Lighter than full framework mode but still demands the route tree be restructured into its config format, and it is a third-party dependency in the critical build path. |
| **Dynamic rendering** (Nginx UA-sniffs crawlers → a prerender service) | Rejected. Google now classifies this as a workaround rather than a recommended pattern, it adds a paid runtime dependency and a cloaking risk, and it fixes nothing for real users. |
| **Client-side meta only** (`react-helmet-async` and stop there) | Rejected as a *complete* solution — it does not fix social unfurls or non-rendering crawlers. It is, however, **part** of this plan: the client-side layer is what the prerenderer captures. |
| **Do nothing; trust Googlebot's renderer** | Rejected. Leaves social previews, Bing and LLM/AI crawlers unserved, and accepts a slower, less reliable indexing path for a site with no existing authority. |

### Why a custom script rather than a plugin

`prerender-spa-plugin` and its Vite ports are unmaintained or Webpack-bound. The script we need is ~130 lines, has no hidden behaviour, and we control the wait condition precisely. The team already drives Chrome DevTools Protocol in this repo for UI verification, so the capability and the precedent both exist.

### The hydration question — read this before implementing

Prerendering introduces one genuine tradeoff. React 18 gives two mount modes:

- **`createRoot()` (current)** — React ignores the server HTML, builds its own tree and replaces the DOM. No hydration-mismatch errors ever. Cost: a brief replacement of already-painted content on mount.
- **`hydrateRoot()`** — React adopts the existing DOM. Faster and no replacement, but *any* markup difference between prerender time and runtime throws a mismatch and forces a full client re-render — sometimes with visible corruption.

**Recommendation: keep `createRoot()`.** The known mismatch sources in this codebase are real and non-trivial to eliminate:

- `Hero.jsx` renders `{new Date().getFullYear()}` — fine today, wrong on 1 January if the prerendered HTML is stale.
- `AuthContext` reads `localStorage` on mount; the prerenderer has no session, a returning user does.
- `useReducedMotion` and `useInView` resolve differently under headless Chrome than in a real viewport.

With `createRoot`, none of these matter — the prerendered HTML serves crawlers and first paint, then React takes over. The replacement is a single frame against identical CSS, so it is not perceptible in practice. **Verify this claim on a throttled connection during QA (§9) rather than assuming it.** Moving to `hydrateRoot` is a later optimisation, gated on eliminating the three sources above.

---

## 3. Phase 0 — Stop the bleeding (do this first, ~1 hour)

These are independent of everything else and should ship immediately.

### 0.1 Remove internal documentation from the public build — **critical**

`public/ref docs/` contains 104 files (5 MB): `api_registry.md`, `audit_verification_report.md`, payroll/leave/attendance phase implementation plans, API analyses, and code-review reports. Because Vite copies `public/` verbatim into `dist/`, and `dist/` is committed and rsync'd to the Nginx web root, **all of it is live**.

```bash
git rm -r --cached "public/ref docs"
mkdir -p docs/internal
git mv "public/ref docs" docs/internal/ref-docs   # keep them, outside public/
```

Add to `.gitignore`:
```
# Never ship internal engineering docs to the web root
public/ref docs/
```

Then rebuild so `dist/` no longer carries them, and confirm:
```bash
npx vite build && find dist -name "*.md" | wc -l   # must be 0
```

> **Assume these URLs were already crawled.** After deploy, submit a removal request in Google Search Console for the `ref docs/` prefix, and treat anything sensitive in `api_registry.md` as disclosed. **Ask the backend owner to review it** — that file documents internal endpoints.

### 0.2 Delete the wasted 420 KB preload

`index.html` line 6:
```html
<link rel="preload" href="/logocolored.png" as="image" />
```
`logocolored.png` is 420 KB and is referenced **only** in `src/shared/components/DashboardSidebar.jsx` — a signed-in screen. Every marketing visitor downloads it at high priority for nothing.

**Remove the line.** If a preload is wanted, it should target the actual LCP image per route, which differs per page — better handled by `fetchpriority="high"` on the image itself (§7.2).

### 0.3 Remove dead assets from `public/`

Neither of these is referenced anywhere in `src/`:

| File | Size |
|---|---|
| `public/logo.gif` | 1.0 MB |
| `public/sia_avatar.jpg` | 495 KB (byte-identical duplicate of `maya_avatar.jpg`) |

Combined with 0.1 and 0.2, `dist/` drops from **12 MB to roughly 5 MB**.

### 0.4 Add `robots.txt`

Create `public/robots.txt`:

```
User-agent: *
Allow: /$
Allow: /about
Allow: /services
Allow: /pricing
Allow: /contact
Allow: /legal/

# Product application — never index
Disallow: /dashboard
Disallow: /auth
Disallow: /onboarding
Disallow: /setup-organization
Disallow: /register-organization
Disallow: /invitation

Sitemap: https://hrclouds.in/sitemap.xml
```

> ⚠️ **Decision needed:** confirm the production origin. `hello@hrclouds.in` implies `hrclouds.in`, but the dev deploy targets `development.hrclouds.in`. Every URL in this plan derives from one value — see §4.1.

> **`Disallow` is not `noindex`.** A disallowed URL can still appear in results if it is linked from elsewhere. The `noindex` tag in §5.4 is what actually keeps app routes out; `robots.txt` just saves crawl budget.

### 0.5 Stop committing `.env`

`.env` is tracked in git (`git ls-files .env` confirms it). It does not reach `dist/`, so this is not a live-site exposure, and `VITE_*` values are inlined into the client bundle by design — they are public by nature. But the commit history shows a key rotation (`bfa634c chore: rotate DocMind chatbot API key`), which means the old value is still in history.

Not an SEO item; flagged because it surfaced during the audit. Add `.env` to `.gitignore`, commit `.env.example` with empty values, and confirm with the backend owner that no genuinely secret value has ever lived in this file.

---

## 4. Phase 1 — The metadata layer

### 4.1 Site configuration — one source of truth

The codebase already establishes a strong pattern: `plans.js` and `company.js` are single sources of truth that downstream code reads rather than duplicating. **Follow it.**

Create **`src/shared/config/site.js`**:

```js
// ─────────────────────────────────────────────────────────────────────────────
// site.js — canonical identity of the public website.
//
// Every absolute URL the site emits (canonical tags, Open Graph, sitemap,
// JSON-LD) derives from SITE_URL. It is defined once here so a domain change
// is a one-line edit and cannot leave half the metadata pointing at the old
// origin.
// ─────────────────────────────────────────────────────────────────────────────

/** No trailing slash. Overridable per-environment so preview builds don't
 *  claim to be canonical for production URLs. */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://hrclouds.in"
).replace(/\/$/, "");

export const SITE_NAME = "HR Clouds";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og/default.png`;
export const TWITTER_HANDLE = ""; // empty → the tag is omitted entirely

/** Absolute URL for a route path. */
export const absoluteUrl = (path = "/") =>
  `${SITE_URL}${path === "/" ? "" : path}`;
```

Add `VITE_SITE_URL` to `.env` and `.env.example`.

### 4.2 The route metadata table

Create **`src/shared/seo/routeMeta.js`** — the one place that answers "what is this page called and what is it about". The sitemap generator and the prerenderer both read from it, so a new public route cannot be added and silently forgotten.

```js
/* Titles: ≤ 60 chars so they don't truncate in results.
   Descriptions: 140–160 chars, written to earn the click, not to stuff keywords.
   Each page targets ONE intent — no two pages compete for the same query. */

export const ROUTE_META = {
  "/": {
    title: "HR Clouds — HRMS & Payroll Software for Indian Teams",
    description:
      "Run payroll, attendance and leave in one place. Automated PF, ESI and TDS compliance built for Indian businesses. Free for teams up to 10.",
    priority: 1.0,
    changefreq: "weekly",
  },
  "/services": {
    title: "HR & Payroll Modules — Attendance, Leave, Compliance",
    description:
      "Biometric attendance, geo-fenced check-in, multi-level leave policies, payroll automation and statutory compliance — every HR Clouds module explained.",
    priority: 0.9,
    changefreq: "monthly",
  },
  "/pricing": {
    title: "Pricing — HR Clouds HRMS & Payroll Plans from ₹49/month",
    description:
      "Transparent per-workspace pricing. Free plan for up to 10 employees, Starter at ₹49/month, Growth at ₹99/month. No per-seat surprises.",
    priority: 0.9,
    changefreq: "monthly",
  },
  "/about": {
    title: "About HR Clouds — Built for Indian HR & Payroll",
    description:
      "Why we built an HRMS around Indian statutory compliance, and the team behind it.",
    priority: 0.6,
    changefreq: "yearly",
  },
  "/contact": {
    title: "Contact HR Clouds — Talk to Our Team",
    description:
      "Questions about payroll compliance, migration or pricing? Reach the HR Clouds team directly.",
    priority: 0.6,
    changefreq: "yearly",
  },
  "/legal/privacy": {
    title: "Privacy Policy — HR Clouds",
    description:
      "How HR Clouds collects, processes and protects personal data under the DPDP Act 2023.",
    priority: 0.3, changefreq: "yearly",
  },
  "/legal/terms": {
    title: "Terms of Service — HR Clouds",
    description: "The terms governing use of the HR Clouds platform.",
    priority: 0.3, changefreq: "yearly",
  },
  "/legal/cookies": {
    title: "Cookie Policy — HR Clouds",
    description: "Which cookies HR Clouds sets, why, and how to control them.",
    priority: 0.3, changefreq: "yearly",
  },
  "/legal/statutory": {
    title: "Statutory Guidelines — PF, ESI & TDS | HR Clouds",
    description:
      "How HR Clouds handles Indian statutory obligations: provident fund, ESI, professional tax and TDS.",
    priority: 0.5, changefreq: "yearly",
  },
};

/** The routes that get prerendered and listed in the sitemap. */
export const PUBLIC_ROUTES = Object.keys(ROUTE_META);
```

> **Copy review required.** These titles and descriptions are a first draft written from the existing page content. They carry commercial weight and the pricing figures must stay in sync with `plans.js`. Marketing should review before launch.

### 4.3 The `<Seo>` component

**Recommendation: build it in-house (~70 lines), do not add `react-helmet-async`.**

Rationale, consistent with the precedent set by the motion system (which rejected Framer Motion for the same reason): `react-helmet-async` is ~6 KB gzip plus a provider, and we need exactly one behaviour — set tags on mount, restore on unmount. React 18 has no native metadata hoisting (React 19 does), so something is needed, but not a library.

Create **`src/shared/seo/Seo.jsx`**:

```jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE_NAME, DEFAULT_OG_IMAGE, TWITTER_HANDLE, absoluteUrl } from "../config/site";
import { ROUTE_META } from "./routeMeta";

/* ─────────────────────────────────────────────────────────────────────────────
   Seo — writes the document head for the current route.

   Deliberately not react-helmet-async. This needs to do one thing: set a known
   set of tags on mount and leave the head clean on unmount. That is ~70 lines
   against ~6 KB gzip plus a context provider.

   Tags are marked data-seo so this only ever touches its own output and can
   never strip a tag authored in index.html.

   Note on prerendering: these writes happen in an effect, i.e. AFTER React
   mounts. That is fine — the prerenderer captures the DOM once the app has
   settled, so the tags are in the shipped HTML. It would NOT be fine for a
   live crawler that doesn't run JS, which is exactly why §6 exists.
──────────────────────────────────────────────────────────────────────────── */

function setTag(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(attrs.rel ? "link" : "meta");
    el.setAttribute("data-seo", "");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function Seo({ title, description, image, type = "website", noindex = false, jsonLd }) {
  const { pathname } = useLocation();
  const meta = ROUTE_META[pathname] || {};

  const resolvedTitle = title || meta.title || `${SITE_NAME} — HRMS & Payroll`;
  const resolvedDesc = description || meta.description || "";
  const canonical = absoluteUrl(pathname);
  const ogImage = image || DEFAULT_OG_IMAGE;

  useEffect(() => {
    document.title = resolvedTitle;

    setTag('meta[name="description"]', { name: "description", content: resolvedDesc });
    setTag('link[rel="canonical"]', { rel: "canonical", href: canonical });
    setTag('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    });

    // Open Graph — what LinkedIn, WhatsApp, Slack and Facebook read.
    setTag('meta[property="og:title"]',       { property: "og:title", content: resolvedTitle });
    setTag('meta[property="og:description"]', { property: "og:description", content: resolvedDesc });
    setTag('meta[property="og:url"]',         { property: "og:url", content: canonical });
    setTag('meta[property="og:type"]',        { property: "og:type", content: type });
    setTag('meta[property="og:image"]',       { property: "og:image", content: ogImage });
    setTag('meta[property="og:site_name"]',   { property: "og:site_name", content: SITE_NAME });
    setTag('meta[property="og:locale"]',      { property: "og:locale", content: "en_IN" });

    setTag('meta[name="twitter:card"]',        { name: "twitter:card", content: "summary_large_image" });
    setTag('meta[name="twitter:title"]',       { name: "twitter:title", content: resolvedTitle });
    setTag('meta[name="twitter:description"]', { name: "twitter:description", content: resolvedDesc });
    setTag('meta[name="twitter:image"]',       { name: "twitter:image", content: ogImage });
    if (TWITTER_HANDLE) {
      setTag('meta[name="twitter:site"]', { name: "twitter:site", content: TWITTER_HANDLE });
    }
  }, [resolvedTitle, resolvedDesc, canonical, ogImage, type, noindex]);

  // Structured data gets its own effect: it's removed on unmount so a stale
  // graph can never outlive the page that declared it.
  useEffect(() => {
    if (!jsonLd) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo", "");
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => script.remove();
  }, [jsonLd]);

  return null;
}

export default Seo;
```

**Wiring:** add `<Seo />` as the first child of each public page component. For most pages that is one line with no props — the component reads `ROUTE_META` by pathname:

```jsx
// src/landing/pages/Home.jsx
const Home = () => (
  <>
    <Seo jsonLd={homeJsonLd} />
    <Hero />
    ...
  </>
);
```

---

## 5. Phase 2 — Structured data (JSON-LD)

Create **`src/shared/seo/schema.js`**. Build the graph from existing config so it cannot drift from what users see.

### 5.1 Organization + WebSite (site-wide, emitted on `/`)

```js
import { COMPANY } from "../config/company";
import { SITE_URL, SITE_NAME, absoluteUrl } from "../config/site";

export const organizationSchema = () => {
  const org = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: COMPANY.legalName,
    url: SITE_URL,
    logo: `${SITE_URL}/og/logo.png`,
    email: COMPANY.supportEmail,
  };
  // Only emit what's actually configured — an empty sameAs array or a blank
  // address is worse than the field being absent.
  const profiles = Object.values(COMPANY.social).filter(Boolean);
  if (profiles.length) org.sameAs = profiles;
  if (COMPANY.registeredAddress) {
    org.address = { "@type": "PostalAddress", streetAddress: COMPANY.registeredAddress, addressCountry: "IN" };
  }
  return org;
};
```

### 5.2 SoftwareApplication with live pricing (emitted on `/` and `/pricing`)

This is the highest-value schema for a SaaS product — it drives pricing-aware rich results. **Build the offers from `plans.js`**, which already mirrors the backend catalog:

```js
import { PLANS } from "../config/plans";

export const softwareApplicationSchema = () => ({
  "@type": "SoftwareApplication",
  name: "HR Clouds",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Human Resource Management Software",
  operatingSystem: "Web",
  offers: PLANS.flatMap((plan) =>
    [plan.monthly, plan.yearly]
      // free's monthly and yearly are the same object — don't emit it twice
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .map((variant) => ({
        "@type": "Offer",
        name: `${plan.name} (${variant.billingCycle})`,
        price: String(variant.amount),
        priceCurrency: "INR",
        url: absoluteUrl("/pricing"),
      }))
  ),
});
```

> ⚠️ **Do not add `aggregateRating` or `Review` schema.** The testimonials in `constants.js` are placeholder content with stock headshots (`Hero.jsx` even documents this: *"the names are stock"*). Emitting review markup for fabricated testimonials is a structured-data policy violation and risks a manual action against the whole domain. Add rating schema only when real, attributable customer reviews exist.

### 5.3 FAQPage on `/pricing`

`src/landing/pages/Pricing.jsx` already holds a `faqs` array and renders every answer into the DOM. Map that same array into `FAQPage` schema — no markup change, no duplicated copy:

```js
export const faqSchema = (faqs) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});
```

> The schema text must match the visible answer. Since both read the same array, this holds by construction — keep it that way.

### 5.4 BreadcrumbList on inner pages

Straightforward two-level breadcrumbs (`Home → Pricing`, `Home → Legal → Privacy Policy`). No visible breadcrumb UI is required for the markup to be valid, so this stays invisible.

### 5.5 Keeping the app out of the index

The `noindex` prop on `<Seo>` exists for this. Add `<Seo noindex />` to:

- `AuthLayout.jsx` (covers all `/auth/*`)
- `DashboardLayout.jsx` (covers all `/dashboard/*`)
- `RegisterOrgPage.jsx`, `InvitationAcceptPage.jsx`, `GuestDashboard.jsx`

This matters more than `robots.txt`: invitation-accept URLs carry tokens and must never be indexed.

---

## 6. Phase 3 — The prerender pipeline

### 6.1 The script

Create **`scripts/prerender.mjs`**. Add `puppeteer` as a `devDependency` (build-time only — it never reaches the bundle).

```js
/* ─────────────────────────────────────────────────────────────────────────────
   prerender.mjs — turns the SPA build into real HTML for each public route.

   Runs after `vite build`:
     1. serve dist/ locally
     2. visit each route in PUBLIC_ROUTES with headless Chrome
     3. wait for the app to actually render (not just for network idle)
     4. write the settled DOM to dist/<route>/index.html

   The SPA is unchanged — it still boots and takes over. This only means a
   crawler or an unfurler that never runs JS still gets the whole page.

   Motion note: the reveal system starts elements at opacity 0 and transitions
   them in. We force prefers-reduced-motion in the prerenderer, which the
   motion primitives respect by rendering the final state directly — so the
   captured HTML has no opacity-0 content in it.
──────────────────────────────────────────────────────────────────────────── */

import { preview } from "vite";
import puppeteer from "puppeteer";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PUBLIC_ROUTES } from "../src/shared/seo/routeMeta.js";

const DIST = new URL("../dist/", import.meta.url).pathname;

// `preview` serves the built dist/ — the same bytes Nginx will serve.
const server = await preview({ preview: { port: 4180, strictPort: true } });

const browser = await puppeteer.launch({ headless: "new" });

for (const route of PUBLIC_ROUTES) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto(`http://localhost:4180${route}`, { waitUntil: "networkidle0" });

  // networkidle0 is not "rendered". Wait for content React actually produced.
  await page.waitForFunction(
    () => document.querySelector("#root")?.children.length > 0 &&
          document.title !== "",
    { timeout: 15000 }
  );

  const html = await page.content();

  // Fail loudly rather than shipping an empty shell.
  if (!html.includes('<div id="root">') || html.includes('<div id="root"></div>')) {
    throw new Error(`Prerender produced an empty shell for ${route}`);
  }

  const out = route === "/" ? join(DIST, "index.html")
                            : join(DIST, route, "index.html");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");
  console.log(`  prerendered ${route} → ${out.replace(DIST, "dist/")} (${(html.length / 1024).toFixed(1)} KB)`);
  await page.close();
}

await browser.close();
server.httpServer.close();
```

Wire it into `package.json`:

```json
"scripts": {
  "build": "vite build && node scripts/prerender.mjs && node scripts/generate-sitemap.mjs",
  "build:spa": "vite build"
}
```

> **Note on the deploy model:** this repo commits `dist/` and the GitHub Action only rsyncs it — it never runs a build. So the prerender runs on the developer's machine at `npm run build`, and the prerendered HTML is committed like the rest of `dist/`. That works, but it makes "did you run the real build?" a review concern. **Recommended follow-up (not blocking): move the build into CI** so `dist/` is generated by the Action rather than committed. That is a deploy-pipeline change, so it needs the DevOps owner's sign-off.

### 6.2 Sitemap generation

Create **`scripts/generate-sitemap.mjs`**, reading `ROUTE_META` so it can never fall out of sync with the routes that exist:

```js
import { writeFile } from "node:fs/promises";
import { ROUTE_META } from "../src/shared/seo/routeMeta.js";

const SITE_URL = process.env.VITE_SITE_URL || "https://hrclouds.in";
const today = new Date().toISOString().slice(0, 10);

const urls = Object.entries(ROUTE_META).map(([path, meta]) => `  <url>
    <loc>${SITE_URL}${path === "/" ? "/" : path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${meta.changefreq}</changefreq>
    <priority>${meta.priority}</priority>
  </url>`).join("\n");

await writeFile("dist/sitemap.xml",
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`, "utf8");
```

> `lastmod` set to the build date is a small lie — it claims every page changed whenever we deploy. The honest version derives it from `git log -1 --format=%cI -- <page file>`. Worth doing; listed as a refinement, not a blocker.

### 6.3 Nginx configuration

The current config is not in this repo, but a standard SPA fallback (`try_files $uri $uri/ /index.html`) will **not** correctly serve the prerendered files. It needs:

```nginx
location / {
    try_files $uri $uri/index.html /index.html;
}

# Hashed assets are immutable — cache hard.
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# HTML must revalidate, or a deploy won't reach returning visitors.
location ~* \.html$ {
    add_header Cache-Control "public, max-age=0, must-revalidate";
}

location = /sitemap.xml { add_header Cache-Control "public, max-age=3600"; }
location = /robots.txt  { add_header Cache-Control "public, max-age=3600"; }
```

Also required, and currently unverified — **confirm with whoever owns the server:**

1. **HTTPS with a permanent redirect** from `http://` and from the non-canonical `www`/apex variant. Pick one hostname and 301 the other. Split hostnames split ranking signals.
2. **`development.hrclouds.in` must not be indexable.** It runs the same build. Either HTTP basic auth or a server-level `add_header X-Robots-Tag "noindex, nofollow";` on that vhost. **A staging domain competing with production for the same content is a real and common ranking problem.**
3. **Gzip or Brotli on HTML, CSS, JS, SVG, JSON.**

---

## 7. Phase 4 — Crawlable content & semantics

These are markup-level. Each renders identically unless marked **⚠︎ visible**.

### 7.1 Make all service content crawlable — highest content-side ROI

`ServicesCategoryTabs.jsx:34` does `Solutions.filter((s) => s.category === active)`. With 5 categories × 4 services, **16 of 20 module descriptions are absent from the DOM**. This is the strongest commercial keyword content the site owns — "biometric attendance", "geo-fenced tracking", "statutory compliance", "payroll automation".

**Two options:**

**Option A (recommended, ~1 hour, zero visible change):** render all five category groups; hide the inactive ones with the `hidden` attribute instead of filtering them out. All copy lands in the prerendered HTML.

```jsx
{categories.map((cat) => (
  <div key={cat} hidden={cat !== active}>
    {Solutions.filter((s) => s.category === cat).map(...)}
  </div>
))}
```

> Google does index CSS-hidden content but may weight it lower than visible content. This is a strict improvement over "not present at all", and it preserves the tab UX exactly.

**Option B (higher ceiling, needs copy):** give each module its own indexable route — `/services/payroll-automation`, `/services/biometric-attendance` — reusing existing components. `slug.js` already generates slugs, and each `Solution` already has a title and description.

This is how a B2B SaaS site actually ranks: one page per commercial intent. But 20 pages of ~40 words each is thin content and could underperform or be treated as doorway pages. It needs ~300–500 words per module from someone who knows the product. **Recommend Option A now; schedule Option B as a content project.**

### 7.2 Fix heading hierarchy

Current state on `/`:

| Element | Current | Problem |
|---|---|---|
| `Hero.jsx:19` | `<h1>` | ✅ Correct |
| `Dashboard.jsx` | none | Fine — it's a figure with an `sr-only` caption |
| `AppStatistics.jsx:~44,51` | **two sibling `<h2>`s** | "Transform your HR" and "with powerful insights & automation." are one sentence split across two headings. A crawler sees two unrelated headings, and a screen reader announces two fragments. |
| `Features.jsx:8` | `<h3>` as the section title | Skips `<h2>` entirely. Items below are `<h4>`. |

**Fixes — both render identically:**

`AppStatistics.jsx` — one `<h2>` containing two styled `<span>`s. The existing `Reveal` line-level staggering is preserved by revealing the spans instead of the headings:

```jsx
<h2 className="...">
  <Reveal as="span" className="block bg-clip-text ...">Transform your HR</Reveal>
  <Reveal as="span" delay={110} className="block ...">with powerful insights &amp; automation.</Reveal>
</h2>
```
> Add `block` to keep the two-line layout the sibling block elements previously produced. Verify visually — this is the one change in §7 that touches layout.

`Features.jsx` — `<h3>` → `<h2>`, and the feature-card `<h4>` → `<h3>`. Font sizes are set by Tailwind classes, not by tag, so **the rendering is byte-identical**.

Then re-verify: `/about`, `/services` and `/pricing` each have exactly one `<h1>` (confirmed present), and no page skips a level.

### 7.3 The dead "Explore Features" button

`Features.jsx:14` renders `<button>Explore Features</button>` with **no `onClick`**. It looks interactive, does nothing, and offers no crawlable link.

Replace with a `<Link to="/services">` carrying the identical classes. **Renders identically**, fixes a broken user path, and adds an internal link to the page that most needs authority.

### 7.4 `lang="en"` → `lang="en-IN"`

`index.html` line 2. The product is India-specific (PF, ESI, TDS, INR, `en-IN` number formatting is already used in `useCountUp`). Signals regional relevance at zero cost.

### 7.5 Open Graph images

None exist. Social shares currently render as a bare link with no image. Create `public/og/default.png` at **1200×630**, plus per-page variants for `/` and `/pricing` if design has capacity. Wire via the `image` prop on `<Seo>`.

> This needs a designer. It is the single most visible-to-humans item in this plan — it is what a procurement lead sees when your pricing page is pasted into their Slack.

### 7.6 Internal linking

Currently the footer is doing nearly all the internal-linking work. Two cheap additions, both matching existing visual patterns:

- Link the four `Features.jsx` cards to their `/services#anchor` targets (the anchors already exist and `ServicesCategoryTabs` already handles hash → tab switching).
- The `/services` CTA and `/about` should link to `/pricing` in body copy, not only in the nav.

---

## 8. Phase 5 — Core Web Vitals

Substantial work is already done here — route-level code splitting took the entry chunk from 2,844 KB to 429 KB, `Reveal priority` fixed the LCP regression on `/pricing` (2,108 ms → 1,084 ms), and several oversized images were compressed. **Do not regress any of it.** Remaining items:

### 8.1 Remaining image work

| Item | Action |
|---|---|
| `/services` hero illustration is hotlinked from `cdn3d.iconscout.com` | **Self-host it.** It was measured as the slowest LCP element on the site at 1,588 ms, and it makes the page's LCP dependent on a third party's uptime and TTFB. |
| No `width`/`height` on `<img>` | Add intrinsic dimensions to every landing image. Prevents CLS. Invisible when the CSS already sizes them. |
| No `loading`/`fetchpriority` hints | `fetchpriority="high"` + `loading="eager"` on each page's LCP image; `loading="lazy"` on everything below the fold (team photos, testimonial avatars, feature icons). |
| PNG/JPG only | Serve WebP with PNG fallback via `<picture>`. Typically 25–35% smaller. **⚠︎ Verify no visual change** on the gradient-heavy illustrations. |

### 8.2 Font loading

`index.html` loads Manrope from Google Fonts via a **render-blocking** `<link rel="stylesheet">`. Two fixes:

- Add `&display=swap` — **already present**. ✅
- Self-host the font files, or at minimum preload the primary woff2. Removes a third-party round trip from the critical path and eliminates a DNS+TLS handshake before any text paints.

### 8.3 Budgets — enforce, don't hope

Add to the QA checklist and re-measure after every change:

| Metric | Target | Fail |
|---|---|---|
| LCP (mobile, 4× CPU throttle) | < 2.0 s | > 2.5 s |
| CLS | < 0.05 | > 0.1 |
| INP | < 200 ms | > 500 ms |
| Entry JS chunk | ≤ 450 KB | > 500 KB |

---

## 9. Verification & QA

Every item below is objectively checkable. **No item is "done" on inspection alone.**

### 9.1 Prerender output

```bash
npm run build

# Each public route must produce real HTML, not a shell.
for r in "" about services pricing contact legal/privacy; do
  f="dist/${r:+$r/}index.html"
  echo "$f: $(wc -c < "$f") bytes, title: $(grep -o '<title>[^<]*' "$f")"
done

# The homepage H1 must be in the raw HTML.
grep -c "Simplify and Automate" dist/index.html   # expect ≥ 1

# Pricing must carry its own title, not the homepage's.
grep -o "<title>[^<]*" dist/pricing/index.html    # expect the pricing title

# All 20 service descriptions crawlable after §7.1.
grep -c "Geo-Fenced" dist/services/index.html      # expect ≥ 1
```

### 9.2 Metadata correctness

- Every public route has exactly one `<title>`, one `<meta name="description">`, one `<link rel="canonical">`.
- No two routes share a title or description.
- Canonical URLs are absolute, use the production origin, and are self-referencing.
- `/auth/login` and `/dashboard/hr` emit `noindex, nofollow`.

### 9.3 Structured data

- Validate every page at **Google Rich Results Test** and **schema.org validator**.
- Zero errors. Warnings reviewed individually.
- `Offer` prices match what `/pricing` visibly displays (both read `plans.js`, so verify the binding, not just the output).
- **Confirm no `aggregateRating` or `Review` is emitted anywhere.**

### 9.4 Social previews

Test the live URL in each — these are pure HTML fetchers and are the real proof the prerender works:

- LinkedIn Post Inspector
- Facebook Sharing Debugger
- Paste the `/pricing` URL into Slack and WhatsApp and confirm the title, description and image are page-specific.

### 9.5 Crawl simulation

```bash
# What a non-JS crawler sees. Must be a full page.
curl -s https://hrclouds.in/pricing | grep -c "<h1"
```

Run **Screaming Frog** (or `wget --spider -r`) in *non-JS* mode across the site: expect zero 404s, zero redirect chains, zero orphan pages, and every public route reachable from `/` within three clicks.

### 9.6 Regressions to check explicitly

- **No visual change.** Screenshot every public route at 390 px, 768 px and 1440 px before and after; diff them. The only expected difference is `AppStatistics` (§7.2), which must be inspected by eye.
- **Motion still works.** The prerenderer forces `prefers-reduced-motion`; confirm the *shipped* site still animates for users who have not requested reduced motion. A prerendered final-state DOM being replaced by React must not leave reveals stuck.
- **The SPA still works.** Client-side navigation between all routes; deep-link directly to `/legal/cookies`; browser back/forward.
- **Auth guards intact.** `/dashboard/hr` while signed out still redirects to `/auth/login`.
- **No flash of replaced content** on a throttled connection (see §2 — this is the tradeoff to validate).

### 9.7 Post-launch

- Verify the domain in **Google Search Console**; submit `sitemap.xml`; same in **Bing Webmaster Tools**.
- Request removal of the `ref docs/` URLs (§0.1).
- Confirm `development.hrclouds.in` is not indexed: `site:development.hrclouds.in`.
- Watch Core Web Vitals in CrUX for 28 days post-launch.

---

## 10. Sequencing & effort

| Phase | Work | Effort | Risk | Depends on |
|---|---|---|---|---|
| **0** | Remove `ref docs`, kill the 420 KB preload, delete dead assets, `robots.txt` | 1 h | None | — |
| **1** | `site.js`, `routeMeta.js`, `<Seo>`, wire into 10 pages + `noindex` on app | 1 day | Low | Domain decision |
| **2** | JSON-LD (Organization, SoftwareApplication, FAQPage, Breadcrumb) | 0.5 day | Low | Phase 1 |
| **3** | Prerender script, sitemap generator, Nginx config | 1.5 days | **Medium** | Phase 1, server access |
| **4** | Services crawlability, headings, dead button, `lang`, internal links | 0.5 day | Low | — |
| **5** | Self-host the CDN image, dimensions, lazy/priority hints, fonts | 1 day | Low | — |
| **—** | OG images | Design | — | Designer |
| **—** | Per-module service pages (§7.1 Option B) | Content project | — | Copywriter |

**Engineering total: ~5 days.** Phases 0 and 4 are independent and can ship immediately. Phase 3 carries the only real risk and needs the QA in §9.6.

> Phase 3 is the one to be careful with. It changes what the server sends for every URL. Ship it to `development.hrclouds.in` first (with that host's `noindex` confirmed), run §9 in full there, then promote.

---

## 11. Decisions needed before implementation

These block specific items and are not the engineering team's to make:

1. **Canonical production origin** — `hrclouds.in` or `www.hrclouds.in`? Everything derives from this. *(Blocks: Phase 1)*
2. **Is `development.hrclouds.in` already indexed?** Check `site:development.hrclouds.in`. If yes, it needs `noindex` plus removal requests urgently. *(Blocks: nothing, but urgent)*
3. **Sign-off on the `ref docs` exposure** — the backend owner should review `api_registry.md` and decide whether anything in it requires a response beyond removal. *(Blocks: nothing; do the removal regardless)*
4. **Title/description copy review by marketing** (§4.2). *(Blocks: Phase 1 going live, not Phase 1 being built)*
5. **Designer capacity for OG images** (§7.5).
6. **Move the build into CI?** (§6.1) Committing a prerendered `dist/` works but is fragile. Needs the DevOps owner. *(Blocks: nothing)*
7. **`company.js` is still empty** — `registeredAddress`, `cin`, `gstin`, `grievanceOfficer` and all four social URLs. These were already flagged as launch-blocking for the legal pages under the DPDP Act. They are **also** SEO inputs: `Organization` schema omits `address` and `sameAs` without them, and `sameAs` profile links are a primary entity-verification signal for Google. *(Blocks: full value of Phase 2)*

---

## 12. Explicitly out of scope

- **Off-page SEO** — backlinks, directory listings (G2, Capterra, Software Suggest), PR. Not code.
- **A blog / content marketing engine.** This is what actually drives organic B2B SaaS traffic long-term ("how to calculate PF in India", "ESI compliance checklist"). It needs a CMS decision and a content budget, and should be scoped separately. The routing and `<Seo>` work here is a prerequisite for it, not a substitute.
- **Indexing any signed-in product surface.** Deliberately excluded.
- **Analytics instrumentation.** GA4/GSC linkage is measurement, not SEO implementation — but set up GSC before launch (§9.7).
- **`hydrateRoot` migration** (§2) — a later optimisation with its own prerequisites.
