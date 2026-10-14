# NativeRef — HR Clouds Employee Mobile App

Everything needed to build the **employee-only** HR Clouds mobile app on
**React Native CLI (bare, no Expo)** without it looking, reading or behaving
like a different product from the web app.

This folder is reference material, not source. Nothing here is imported by
`hrclouds-web`; nothing here is built by `npm run build`. Copy what you need
into the new repo.

---

## Read in this order

| # | File | Why |
|---|---|---|
| 1 | [00-plan/01-product-scope.md](00-plan/01-product-scope.md) | What the app is, every screen it must have, what is deliberately out |
| 2 | [00-plan/05-house-rules.md](00-plan/05-house-rules.md) | The non-negotiables. Read before writing a single component |
| 3 | [00-plan/02-architecture.md](00-plan/02-architecture.md) | Folder layout, navigation, state, data flow |
| 4 | [00-plan/04-environment-setup.md](00-plan/04-environment-setup.md) | Bare RN CLI setup, dependency list, native wiring, env |
| 5 | [00-plan/03-build-sequence.md](00-plan/03-build-sequence.md) | Phase-by-phase order with acceptance criteria |
| 6 | [50-starter/](50-starter/) | Paste-ready theme, API client, ported logic, UI kit |
| 7 | [40-screens/00-index.md](40-screens/00-index.md) | Then build screens, one spec at a time |

Keep [00-plan/06-definition-of-done.md](00-plan/06-definition-of-done.md) open
while you work. A screen is not finished until every line on it is true.

---

## Folder map

```
NativeRef/
├── 00-plan/        scope · architecture · build order · setup · house rules · DoD
├── 10-api/         base URLs · envelope · every employee endpoint · payloads · errors · traps
├── 20-design/      tokens · component catalog · navigation · motion · mobile adaptations ·
│                   a11y · icon map · Tailwind→native class map
├── 30-domain/      wording dictionary · enums & statuses · formatting · attendance ·
│                   leave · pay · documents · ⓘ field help
├── 40-screens/     one build spec per screen group: data, layout, states, actions, help
├── 50-starter/     COPY-PASTE CODE: theme, api/, lib/, hooks/, state/, ui/, navigation/,
│                   fieldHelp/fieldHelp.employee.json (36 pre-written hints)
├── 60-ops/         storage & security · native permissions · offline & lifecycle ·
│                   testing · release · troubleshooting
└── 70-reference/   web file → native counterpart map · glossary
```

---

## The five things that will bite you if you skip the docs

1. **One role, one workspace.** This app signs in **employees only**. A manager,
   HR or admin token must be refused at the door with an explanation, not shown
   a half-working employee UI. The self-service APIs accept every tenant role,
   so the backend will *not* stop you.
   → [00-plan/05-house-rules.md](00-plan/05-house-rules.md) §1

2. **Never render an ID, never render a dash.** No UUID anywhere on screen.
   Unknown reads **N/A**; an unmeasured duration reads **0m**; a name that
   hasn't loaded reads **Loading…**.
   → [30-domain/03-formatting.md](30-domain/03-formatting.md)

3. **A day is whole or half, never a decimal.** `2.5` prints as
   **"2 Days and 1 Half Day"**. There is exactly one function for this and it
   is already written for you.
   → [50-starter/src/lib/format.js](50-starter/src/lib/format.js)

4. **Purple only.** Violet = success, fuchsia = pending/warning, indigo = info,
   rose = errors/destructive/lateness only. No green, amber, orange or blue
   anywhere, ever.
   → [20-design/01-design-tokens.md](20-design/01-design-tokens.md)

5. **ⓘ help ships with the screen, not after it.** 36 employee hints with their
   "Ask Maya" questions are already extracted and waiting in
   `50-starter/src/fieldHelp/fieldHelp.employee.json`. Wiring them is part of
   building the screen.
   → [30-domain/08-field-help.md](30-domain/08-field-help.md)

---

## Where the truth lives

| Question | Source of truth |
|---|---|
| What does this endpoint return? | `public/ref docs/` in the web repo — **beats any assumption** |
| What is this screen supposed to do? | The web screen itself (`src/roles/employee/…`), then `40-screens/` |
| What should this word be? | [30-domain/01-wording.md](30-domain/01-wording.md) → `DICTIONARY.TERMS` |
| What colour/size/radius? | [20-design/01-design-tokens.md](20-design/01-design-tokens.md) |
| Why is it built this strange way? | The header comment on the web file. Read it before "fixing" it |

The spec is occasionally wrong. When live behaviour contradicts it, trust the
live API, fix the code, and **write the deviation into the file's header
comment** so the next person doesn't correct it back.

---

Generated 2026-10-10 against `dev` @ `3284f4a`, from the live web source —
not from memory. Re-derive any section whose web counterpart has changed.
