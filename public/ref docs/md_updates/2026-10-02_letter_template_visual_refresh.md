# Letter Templates — Visual Refresh (change record)

**Date:** 2026-10-02
**Module:** Documents → PDF Generation (letter templates)
**Audience:** Frontend / API consumers
**Endpoints touched:** none. **Frontend action:** none required (one optional label change, §3).

---

## 1. What changed

All 15 letter templates, their shared partials and the branding preview page (#134) were restyled as a formal, ruled and boxed print document. The changes:

- a centred, uppercase document title;
- boxed fact grids;
- one inverted headline-figure block;
- inverted table headers;
- outlined stamps;
- an equal-column signature panel.

This is a **visual change**, plus one content addition: the letterhead now prints the org's saved contact details. No API changed:

| Area | Change |
| --- | --- |
| Endpoints, request and response bodies, headers | None |
| Template codes, field names, required / optional fields, `sample_data` | None |
| `current_version` | None (still `1`; the redesign is applied in place, as on 2026-09-30) |
| Error codes and validation | None |
| Branding settings API (request, response, validation) | None |
| Letter content from branding | **Contact details now print** (§3). The values are the ones HR already saves. |
| Letter wording | None (one sentence on the branding preview page changed; see §3) |

## 2. Effect on documents

**One-time deploy note (idempotency).** For orgs that have contact details set (on the branding row or the org profile), the letter's branding identity now includes those details. This only matters for an issue request sent **without** an `idempotency_key` whose retry lands on the other side of the deploy: the retry can create a second letter instead of returning the first. Requests that send an `idempotency_key`, as the frontend checklist recommends, are not affected. Orgs with no contact details keep exactly the same identity as before. After the deploy, editing the contact details correctly yields a new letter instead of returning the old one. Deploying outside office hours makes the window negligible.


- **Already-issued letters keep their stored PDF.** Nothing already issued changes.
- **Previews (#138), the branding preview (#134), new issues and re-issues** render in the new design from deploy onwards.
- Idempotency is unaffected. A retry of an issue that spans the deploy still returns the original letter.

## 3. Visible differences worth knowing

- **Statutory identifiers (CIN / GSTIN / PAN / TAN) moved.**
  - When `letterhead_enabled` is `true`, they now print in a strip directly under the letterhead instead of in the footer.
  - When `letterhead_enabled` is `false` (pre-printed stationery), they still print in the footer.
  - They appear exactly once in both cases.
- **Contact details in the letterhead.** The branding settings already accept `contact_email`, `contact_phone` and `website`, but until now letters never printed them. When the letterhead is enabled, they now print on one line under the registered address.
  - If the branding row has no phone or website, the organisation profile's `phone_number` and `website` are used instead. The address and PAN already work this way.
  - The website prints without `https://` and without a trailing slash.
  - Anything that is empty is left out. Nothing prints when the letterhead is off.
  - **UI suggestion:** in the branding settings screen, label these fields "Printed on letters".
- **Certificate frame.** Letters addressed "To Whom It May Concern" carry a thin double-rule frame around each page: experience letter, internship certificate, bonafide certificate, NOC and salary certificate. The frame only appears with the org's own letterhead, not on pre-printed stationery.
- **Per-letter emphasis.**
  - Date and designation pairs show a small "from > to" marker: joining → last working day, internship start → end, previous → new designation, previous → revised CTC.
  - The offer letter's "Valid Until" date is underlined in the accent colour.
  - The confirmation letter's "Confirmed" status prints in green.
- **Faint logo watermark.** When the letterhead is enabled and a logo is set, the logo also prints as a very faint watermark in the centre of each page.
- **Light accent colours are darkened automatically** wherever the accent colours text or sits behind white text (for example the headline-figure block or the table header). The stored `accent_color` is unchanged; rules and bars still use it as set. An org with a light accent such as `#FACC15` now gets readable letters, so HR may notice those letters look darker than the swatch.
- **Signature lines line up** in two- and three-column signature panels, even when the signatory name, designation or signature image is missing. Exception: if the "For {org name}" line needs more than two lines in its column, that column's signature line moves down to make room; the text never overprints.
- **Branding preview (#134) wording.** One sentence on the sample page now says where identifiers print: "Your registered identifiers, when set, appear under the letterhead, or in the footer when the letterhead is turned off." It used to say they appear in the footer. No other letter wording changed.
- **Page breaks.** A signature panel no longer starts a page on its own: the last part of the letter moves to the next page with it. Several letters that previously spilled onto a second page now fit on one, and no letter got longer.

## 4. Frontend checklist

- [ ] Nothing to change. The #138 preview `<iframe>` / `<object>` keeps working as before.
- [ ] Optional: if the branding settings screen describes where identifiers print, update the wording to "under the letterhead (or in the footer when the letterhead is off)".
