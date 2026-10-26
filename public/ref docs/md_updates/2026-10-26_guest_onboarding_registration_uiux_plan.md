# Guest onboarding & organisation registration — UI/UX implementation plan (2026-10-26)

**Status: plan only. Nothing in this document has been implemented.**

The three screens a brand-new customer meets between signing up and reaching a
workspace:

| Screen | File | Route(s) |
|---|---|---|
| Guest Dashboard | `src/roles/guest/screens/GuestDashboard.jsx` | `/dashboard/guest`, `/onboarding`, `/setup-organization` |
| Plan selection (step 1) | `src/auth/pages/RegisterOrgPage.jsx` lines 355–524 | `/register-organization` |
| Organisation details (step 2) | `src/auth/pages/RegisterOrgPage.jsx` lines 527–706 | same route, same component |

---

## 0. The untouchable list

Everything below is **presentation only**. These are explicitly out of bounds and
no work item in this plan modifies them:

- `handleSubmit()` — the guard order, the `planSource !== "live"` refusal, the
  payload (`{ plan_code, ...form }`), the free-plan vs paid-plan branch.
- `openRazorpay()` — script loading, `ENV.RAZORPAY_KEY_ID`, the options object,
  `handler`, `prefill`, `theme`, `modal.ondismiss`.
- `organizationAPI.initiateRegistration` / `verifyPayment` call sites, bodies and
  response handling, including the `PENDING_ORG_KEY` sessionStorage handshake.
- `usePlanCatalog()`, `plansFromCatalog()`, `planCodeFor()`, `variantFor()`,
  `limitsFor()` — the catalogue, its normalisation and its `source` semantics.
- `readPlanIntent` / `clearPlanIntent` and the parked-choice effects.
- The guest-only route guard's **decisions** (where it sends people). Work item
  B-1 changes only what is painted while that decision is still being made.
- `login()`, `getDashboardPath()`, token handling.

Two defects found during review **live inside that boundary**. They are written
up in §7 as findings with recommended fixes and are deliberately left
unimplemented, pending a decision.

---

## 1. The journey as it is today

```
  marketing pricing card ──┐
   (GetStartedLink parks    │   signed out → /auth/register → OTP
    tier + cycle in         │   signed in  → /register-organization?plan=…&billing=…
    sessionStorage)         │
                            ▼
  sign-up ──► OTP ──► role = guest ──► /dashboard/guest  (Guest Dashboard)
                                              │
                        ┌─────────────────────┴──────────────────────┐
                        ▼                                            ▼
            "Create New Organization"                  "Need Help? Contact Support"
                        │                                   (mailto: — dead end)
                        ▼
            /register-organization
                  step 1  plan cards + monthly/yearly toggle
                        │   (skipped entirely when a plan intent was parked)
                        ▼
                  step 2  organisation details form
                        │
            ┌───────────┴────────────┐
            ▼                        ▼
      free plan                  paid plan
      login(res) → success    Razorpay modal → verify → login(res) → success
            └───────────┬────────────┘
                        ▼
                  success screen (1.5 s) → HR dashboard
```

Two things about this map matter for the findings below:

1. **Step 1 and step 2 are the same URL.** Browser Back from step 2 leaves the
   flow entirely rather than returning to the plan cards.
2. **The guest dashboard and the registration page were built separately.** They
   disagree about the step count, the colour ramp and the typography scale, and
   neither matches the in-app billing screens that the same person sees twenty
   minutes later.

---

## 2. Findings

Severity: **P1** = a new customer is misled, blocked or excluded. **P2** = visible
quality or consistency defect. **P3** = polish.

### A. Journey and information architecture

**A-1 (P1) — The step counters contradict each other.**
`GuestDashboard.jsx:46` says `Onboarding • Step 2 of 2`. Pressing its primary
button lands on `RegisterOrgPage.jsx:359`, which says `Step 1 of 2`, and that is
followed by another `Step 2 of 2` at line 531. A customer is told they are
finishing, then restarted, then told they are finishing again. There is no
shared definition of what the steps are.

**A-2 (P1) — The second card is a dead end.**
"Join Existing Organization" (`GuestDashboard.jsx:106–141`) explains that an
invitation will arrive by email, and then its only action is
`mailto:support@hrclouds.in` labelled "Need Help? Contact Support". There is no
way to re-check, no "I have an invitation link", no route back to the marketing
site, and on a machine with no mail client configured the single control does
nothing at all.

**A-3 (P2) — Browser Back leaves the flow.**
Both registration steps live at `/register-organization`. Back from step 2 exits
to the guest dashboard, discarding the typed form. The in-page "Change Selected
Plan" control exists, but Back is what people press.

**A-4 (P2) — "Reload plans" is only on step 1, the error that demands it is only
on step 2.** When `planSource !== "live"`, `handleSubmit` (line 176) refuses and
says *"Reload the plans and try again"*. The only Reload control is in the step-1
banner (line 409). The reader is told to press something that is not on screen.

**A-5 (P3) — No way to compare plans from the guest dashboard.** The card
advertises plan features but offers no link to `/pricing`, so the only way to
compare is to enter the registration flow.

### B. Trust and payment-adjacent presentation

**B-1 (P1) — The page paints the wrong screen for a non-guest before
redirecting.** `/register-organization` is not wrapped in `ProtectedRoute`
(`AppRoutes.jsx:348`); the component guards itself in a `useEffect`
(`RegisterOrgPage.jsx:123–133`). During auth hydration `role` is `null`, so the
effect does nothing and the full plan picker renders for one or more frames to an
HR user who already has an organisation, then vanishes.

**B-2 (P1) — Hardcoded prices are shown as real ones while the live catalogue
loads.** `usePlanCatalog` opens with `plans: PLANS, source: "fallback",
loading: true`. The grid renders those three hardcoded cards at `opacity-60`
(line 427) — ₹49 / ₹99, a "Save X%" badge computed from them, and **live Select
Plan buttons**. When the real catalogue lands the numbers change under the
cursor. This is the exact "agreed to one number, met another" failure that
`usePlanCatalog`'s own header comment says the module exists to prevent; the
submit-time guard catches the *charge*, but not the *advertised figure*. CLAUDE.md
§5 also requires a skeleton here, not dimmed stale content.

**B-3 (P2) — A plan can be selected before the catalogue is known, and the form
then silently refuses.** Clicking during load sets `selectedTier` from the
fallback list. If the live catalogue has no such tier, `selectedPlan` is `null`
(line 137); step 2 renders "under the **.**" (line 537) and `handleSubmit`
returns at line 166 **with no message**. The button appears to do nothing.

**B-4 (P2) — The selected-plan summary prints a raw enum.** Line 548 renders
`{selectedPlan?.name} ({billing})` → "Starter (monthly)". CLAUDE.md §4 forbids a
raw enum on screen and §6 asks for a sentence. On a free lifetime plan it reads
"Free Plan (monthly)", which is wrong as well as ugly.

**B-5 (P3) — The success screen is not announced.** `RegisterOrgPage.jsx:285–314`
replaces the page and auto-navigates after 1.5 s with no `role="status"`, so a
screen-reader user is moved without being told why.

### C. Forms and validation (CLAUDE.md §11)

**C-1 (P1) — The submit button is disabled on a missing answer.**
`disabled={loading || !form.org_name}` (line 686). §11 is explicit: *"Disabled is
for what the person cannot fix by pressing. A missing answer is not one of
them."* There is no `problems` map, no `attempted` flag, no
`focusFirstProblem(problems, idFor)`.

**C-2 (P1) — Native browser validation is doing the work.** `required` on
org_name and size, `minLength={2}`, and `type="url"` on website produce the
browser's own grey bubbles, which look nothing like the app and are not
reachable by the app's error styling. Worse, `type="url"` **rejects
`company.com`** while the server performs no URI validation at all — the UI is
stricter than the contract and blocks a legitimate value with a popup we don't
control.

**C-3 (P1) — Two fields can exceed the server's limits with no client guard.**
Per `md_organization/1_org_registration_api.md` §1: `website` max 255,
`phone_number` max 20. Neither input carries a `maxLength`
(lines 629–635, 641–647). Over the limit, the server returns `VALIDATION_ERROR`,
which `organizationErrorMessage` deliberately maps to the caller's generic
fallback — so the customer reads *"We couldn't set up your organisation. Try
again."* and has no idea which box is at fault. This is precisely the scenario
§11.1 was written for.

**C-4 (P2) — `org_alias` is over-restricted.** UI `maxLength={50}` (line 589) vs
contract max 100.

**C-5 (P2) — `size` is marked required but the contract says optional.**
Line 608 shows a red asterisk and sets `required`. The server treats `size` as
optional (max 50 chars). Either the UI is imposing an undocumented rule or the
contract is stale — **this needs a product decision before anything changes**
(see §8).

**C-6 (P2) — No label is associated with its input.** All eight labels
(lines 564, 581, 594, 607, 626, 638, 650, 665) are bare `<label>` elements with
no `htmlFor`, and no input has an `id`. Clicking a label does not focus its
field, and a screen reader announces an unlabelled textbox.

**C-7 (P2) — The error is not announced.** Lines 678–682 render a plain `<p>`.
No `role="alert"`, no `aria-live`. A failed payment or a refused registration is
silent to assistive technology.

### D. Accessibility

**D-1 (P1) — Three buttons named "Select Plan".** Lines 485–498. A screen-reader
user tabbing the card grid hears "Select Plan, button" three times with no way to
tell which tier. Needs `aria-label={`Select ${plan.name}`}` or similar.

**D-2 (P2) — The billing toggle is not a toggle.** Lines 373–397 are two plain
`<button>`s with no `role="tablist"` / `role="tab"` / `aria-selected`, so the
active cycle is conveyed by colour alone. The in-app `PlanCatalogue.jsx`
`CycleToggle` (lines 66–93) already does this correctly — the registration picker
is the odd one out.

**D-3 (P1) — Focus and scroll are not managed between steps.** `setStep(2)` and
`setStep(1)` change the entire main region with no focus move and no scroll
reset. On a phone, pressing "Select Plan" on the third card leaves the viewport
part-way down a form whose heading is off-screen, with focus on a button that no
longer exists.

**D-4 (P2) — The step indicator carries no semantics.** It is a decorative pill.
No `aria-current`, no `<nav>`, nothing a screen reader can use to answer "where
am I".

**D-5 (P3) — Required markers are decorative asterisks.** `<span
className="text-rose-500">*</span>` with no `aria-hidden` and no `aria-required`
on the input.

**D-6 (P3) — The guest's own email can be unreadable.**
`GuestDashboard.jsx:126–128` puts it in a `truncate` box with no `title`, so a
long address is cut with no way to read it — on the one card whose whole purpose
is "ask your HR admin to invite *this* address".

### E. Responsiveness and layout

**E-1 (P2) — The plan grid is hardcoded to three columns.**
`grid-cols-1 md:grid-cols-3` (line 427) regardless of how many tiers the server
returns. A fourth tier leaves an orphan card alone on row two — the exact defect
`PlanCatalogue.jsx` documents in its header and solves with its `GRID` map
(lines 58–63). Four tiers are a plausible near-term catalogue change.

**E-2 (P2) — The step-2 form is `max-w-xl` with eight fields.** Line 528. CLAUDE.md
§3: *"A form dialog must not make the user scroll. Four or more fields means wide
and gridded."* It is not a dialog, but the reason holds — on a 1366×768 laptop
the submit button is below the fold, under a two-column grid squeezed into 36rem.
`max-w-3xl` would fit the same grid without scrolling.

**E-3 (P3) — Three stacked cards on mobile scroll the toggle away.** With the
cards stacked, the monthly/yearly control is off-screen by the second card, so
the price being compared can't be re-based without scrolling back up.

### F. Copy (CLAUDE.md §6)

**F-1 (P1) — We advertise a trial that does not exist.**
`GuestDashboard.jsx:83` promises *"Free Plan & 14-day trial options"*. The string
"trial" appears **nowhere else in `src/`** — not in `plans.js`, not in the
billing module, not in the API registry. There is a free plan; there is no trial.

**F-2 (P1) — A fabricated email is presented as the customer's own.** Line 127
falls back to the literal `"user@company.com"` under the heading "Your registered
email address". This is reachable in practice: `applyStoredToken` rebuilds `user`
from the JWT, which carries only `{ id, role, orgId }`, and the profile read that
would supply the address is `authAPI.me()` → `GET /organizations/me`, whose
allowed roles are `super-admin, admin, hr, manager, employee` (api_registry #20)
— **not `guest`**. So on every reload of the guest dashboard that call 403s, logs
`Failed to fetch user profile`, and the card shows an invented address next to
the instruction "Ask your HR admin to invite this email."

**F-3 (P2) — Mixed spelling and register.** The screens say "Organization",
"Setup Your Workspace" (should be "Set up"), "Configure", while every error
string the same flow can produce says "organisation" (`organizationErrors.js`).
The in-app product uses the latter.

**F-4 (P3) — "Select a plan scale."** Line 369. Not a sentence anyone outside the
team would write; §6 asks for the consequence in plain words.

### G. Design-system drift (CLAUDE.md §5)

**G-1 (P2) — `gray-*` and `slate-*` are mixed in the same component.**
`GuestDashboard.jsx` is `bg-slate-50` with `border-gray-100`, `text-gray-500`,
`bg-gray-100`; the rest of the app is `slate`. `RegisterOrgPage` does the same.

**G-2 (P2) — Buttons are hand-rolled.** Every button in both screens writes its
own class string. `PRIMARY_BTN` / `SECONDARY_BTN` already exist in
`roles/hr/billing/components/billingUi.jsx`, and the plan cards in the same flow
are meant to look like one product with `PlanCatalogue.jsx` (which its header
says in so many words).

**G-3 (P3) — No house motion.** `shared/motion` (`Reveal`, `HOVER`,
`useReducedMotion`) and the `plan-card-enter` / `plan-sheen` classes in
`index.css` are used by the marketing pricing page and the in-app billing hero,
but not by the registration picker between them.

**G-4 (P3) — Notices are hand-rolled.** The plans-error banner (line 403) and the
submit error (line 678) each invent their own panel; `Notice` in `billingUi.jsx`
is the shape the rest of the money flow uses.

---

## 3. Proposed work, in order

Four phases. Each is independently shippable and independently revertible. Phase 1
is the one that must ship; phase 4 is optional polish.

### Phase 1 — Correctness of what the screen says (P1 copy + trust)

| # | Change | File | Risk |
|---|---|---|---|
| 1.1 | Delete the "14-day trial" claim; replace with a true line ("Free plan, no card needed"). | `GuestDashboard.jsx:83` | none |
| 1.2 | Replace the `"user@company.com"` fallback with an honest one — the address when known, `"Loading…"` while the session is hydrating, and a short "We couldn't read your email — sign out and back in" when it isn't. Add `title={email}` to the truncated box. | `GuestDashboard.jsx:27, 127` | none |
| 1.3 | One step model across both screens. Guest Dashboard becomes **Step 1 of 3** ("Choose how to start"), plan selection **Step 2 of 3**, details **Step 3 of 3**. Extract the labels to a tiny `onboardingSteps.js` meta so the two files cannot drift again. | both | none |
| 1.4 | Skeleton the plan grid while `plansLoading`, instead of dimmed hardcoded cards. Three card-shaped `animate-pulse` placeholders matching the real card's anatomy (tag strip, name, two-line description, price, button, bullets). The `plansError` banner and the `plans.length === 0` state stay exactly as they are. | `RegisterOrgPage.jsx:427` | low |
| 1.5 | Render `<Skeleton type="app" />` while `useAuth().isLoading`, so a non-guest never sees the picker before the existing guard redirects. The guard's logic is untouched. | `RegisterOrgPage.jsx:123` | low |
| 1.6 | Give the no-plan case a message. When `selectedPlan` is null on step 2, show "That plan is no longer on offer — pick another one" with a button back to step 1, rather than the current silent return. Uses the string already in `handleSubmit` line 180. | `RegisterOrgPage.jsx:166, 537` | low |
| 1.7 | Add a "Reload plans" action to the step-2 error when the message is the `planSource` refusal, calling the existing `reloadPlans()`. | `RegisterOrgPage.jsx:678` | low |
| 1.8 | Rewrite the plan summary line: "Starter · billed every month" / "Starter · billed every year" / "Free Plan · free for as long as you like", via a small helper beside `planPeriodLabel`. No raw `billing` enum on screen. | `RegisterOrgPage.jsx:548` | none |
| 1.9 | Spelling and register pass: "organisation", "Set up your workspace", and replace "Select a plan scale." | both | none |

### Phase 2 — Forms and validation (CLAUDE.md §11)

This is the largest item. **The payload and the API call do not change** — only
what happens before `organizationAPI.initiateRegistration` is reached, and what
the person is shown when it isn't.

| # | Change | File |
|---|---|---|
| 2.1 | Build a `problems` map keyed by payload key: `org_name` (required, 2–150), `website` (≤255), `phone_number` (≤20), `org_alias` (≤100), plus `size` **only if** §8-D1 confirms it is required. Empty map = sendable. | `RegisterOrgPage.jsx` |
| 2.2 | Add `attempted` state. First press on an unfinished form flips it, reddens the offending boxes, and calls `focusFirstProblem(problems, idFor)` from `shared/utils/formGuard.js`, returning on `true`. The form never opens in red. | same |
| 2.3 | **Re-enable the button.** `disabled={loading}` only — a cooldown/in-flight state, which §11 permits. Remove `!form.org_name`. | line 686 |
| 2.4 | Drop `required`, `minLength` and `type="url"`; `website` becomes `type="text"` with `inputMode="url"`, `phone_number` `type="tel"` with `maxLength={20}`. The same rules now live in `problems`, rendered in our own styling. | lines 567–675 |
| 2.5 | Add `id` to every input and `htmlFor` to every label; build the `idFor` map `focusFirstProblem` needs from the same source. | all 8 fields |
| 2.6 | Invalid boxes get the red treatment, not just red text under a normal-looking box (§11.4). | all 8 fields |
| 2.7 | `role="alert"` on the submit error. | line 678 |

**Explicitly preserved:** the `planSource !== "live"` refusal and the `!planCode`
refusal stay where they are, at the top of `handleSubmit`, ahead of the new
`problems` check — a price we can't verify outranks a missing phone number.

### Phase 3 — Accessibility and layout

| # | Change | File |
|---|---|---|
| 3.1 | `aria-label={`Select ${plan.name}`}` (or an sr-only suffix) on each plan button. | line 485 |
| 3.2 | Rebuild the billing toggle on the `CycleToggle` pattern from `PlanCatalogue.jsx:66–93` — `role="tablist"`, `role="tab"`, `aria-selected`. Same visual result, correct semantics, and the two pickers finally match. | lines 373–397 |
| 3.3 | On step change: scroll to top and move focus to the new step's heading (`tabIndex={-1}` + `ref.focus()`), both ways. | around `setStep` |
| 3.4 | Step indicator becomes a real indicator: `aria-current="step"` on the active pill, wrapped in a labelled `<nav>` or an `aria-label`-bearing list. | lines 358, 530 |
| 3.5 | `aria-hidden="true"` on the asterisks; `aria-required` on the fields that are. | all |
| 3.6 | `role="status"` on the success panel so the redirect is announced. | line 294 |
| 3.7 | Widen step 2 to `max-w-3xl` and keep the existing `sm:grid-cols-2` grid; org name and PAN stay full-width. No field moves between columns. | line 528 |
| 3.8 | Replace `md:grid-cols-3` with the literal-class `GRID` map from `PlanCatalogue.jsx`, keyed on `plans.length`. | line 427 |
| 3.9 | Make the billing toggle sticky on small screens (or repeat the cycle in each card's price caption) so a stacked list can still be re-based. | step 1 |

### Phase 4 — Design-system alignment (optional)

| # | Change |
|---|---|
| 4.1 | `gray-*` → `slate-*` throughout both screens. |
| 4.2 | Adopt `PRIMARY_BTN` / `SECONDARY_BTN` from `billingUi.jsx`; promote them to `shared/components/` if importing an HR-role file from `auth/` is judged wrong (recommended: move them, since both screens and the billing module use them). |
| 4.3 | Adopt `Notice` from `billingUi.jsx` for the plans-error banner and the submit error. |
| 4.4 | `plan-card-enter` on the plan cards (already reduced-motion-safe in `index.css`), and `Reveal` on the guest dashboard's two cards. |
| 4.5 | Give the guest dashboard a secondary "Compare plans" link to `/pricing`, and a "Back to home" affordance. |

---

## 4. Field help (CLAUDE.md §10)

**Current state: zero ⓘ help on all three screens, and it cannot currently
render there.** `FieldHelp` and `HelpLabel` resolve the workspace with
`useWorkspace()` (`FieldHelp.jsx:113, 350`), which is supplied by
`DashboardLayout`. These screens are outside that layout, so the context is
`null`, `getFieldHelp` returns `null` at its `!workspace` check, and every ⓘ
renders nothing. `FIELD_HELP_WORKSPACES` already lists `"guest"`
(`fieldHelpMeta.js:44`); no entry uses it yet.

**Step 4.0 (prerequisite).** Wrap both screens in
`<WorkspaceContext.Provider value="guest">`. This is the mechanism the context's
own header describes and changes nothing for any other screen. Maya is mounted
app-wide in `App.jsx:63` with no role gate, so "Ask Maya" works here already.

**The pass itself**, rated against §10's distance table. Most of this form is
ordinary — name, website, phone, alias, industry — and gets nothing, by rule.

| Surface | Key | Why it qualifies | Hint (draft, ≤160 chars) |
|---|---|---|---|
| `organization.registration` | `page` | Page help | "Creating your workspace: pick a plan, then tell us about your company. You can change the plan later." |
| `organization.registration` | `billing_cycle` | Ours — a setting we invented | "Paying for a year at once costs less than twelve monthly payments. You can switch later." |
| `organization.registration` | `size` | Derived — bounded by the plan's seat limit | "Used to set up your workspace. Your plan decides how many people you can add; the list only shows sizes it covers." |
| `organization.registration` | `gst_number` | Domain — compliance term | "Your company's GST registration number. It goes on the invoices we send you." |
| `organization.registration` | `company_pan_number` | Domain — compliance term | "Your company's PAN, not your own. It goes on the invoices we send you." |

That is 1 page hint + 4 field hints. §10's cap is 4 per screen state — the page
key is separate, and the four fields sit across two screen states (toggle on step
1, three fields on step 2), so the cap holds with room to spare. Every one gets
an Ask Maya question; `"enabled": false` is not an option.

Every entry is gated `"workspaces": ["guest"]`. The guest dashboard itself gets
**no ⓘ** — two explanatory cards with their own prose are exactly the
"screen already explains itself" case.

Settle the GST/PAN wording against `md_billing/` before writing it; if the
invoicing behaviour can't be confirmed from code or `public/ref docs/`, leave the
second sentence out rather than guess (§10 wording rule).

---

## 5. Edge cases and regression risks

| Risk | Where | Mitigation |
|---|---|---|
| The skeleton (1.4) hides the plans-error banner | step 1 | Banner and empty state render **above** the grid and are driven by `plansError` / `plans.length`, not by `plansLoading`. Keep that order; skeleton replaces the grid only. |
| The skeleton delays a parked-intent jump | step 1 → 2 | The parked-choice effect already waits for `!plansLoading` (line 115). Unchanged — the skeleton is what's on screen during that wait, which is an improvement. |
| `isLoading` skeleton (1.5) masks a genuinely broken session | `/register-organization` | `isLoading` is set false in one place, unconditionally, at the end of hydration (`AuthContext.jsx:116`). It cannot hang. |
| New validation blocks a submit the server would have accepted | phase 2 | Every rule is copied verbatim from `md_organization/1_org_registration_api.md` §1 and is **no stricter**. `website`'s `type="url"` is being *loosened*, not tightened. Record the contract as the source in the file header. |
| Re-enabling the button (2.3) allows a double-submit | phase 2 | `loading` still disables it for the whole in-flight period, exactly as today. The `problems` check is the first statement after the existing plan guards, so an unfinished form never reaches the API. |
| Adding `id`s collides with an existing id | phase 2 | Prefix every one (`reg-org-name`, `reg-website`, …). |
| Focus move (3.3) fights the parked-intent auto-jump to step 2 | phase 3 | Fire the focus effect on `step` change only after first paint, and let it run for the auto-jump too — landing focused on "Organisation Details" is correct in both cases. |
| Widening to `max-w-3xl` (3.7) reflows the grid | phase 3 | Same `sm:grid-cols-2`; only the container widens. Re-measure at 390, 768, 1366, 1920. |
| `GRID` map (3.8) with an unexpected tier count | phase 3 | Fall back to `GRID[3]`, as `PlanCatalogue` does. Tailwind cannot see composed class names — the map must hold literal strings. |
| Moving `PRIMARY_BTN` (4.2) breaks billing imports | phase 4 | Re-export from `billingUi.jsx` so no existing import path changes. |
| `WorkspaceContext` provider (4.0) leaks "guest" into a dashboard | §4 | The provider wraps only these two components, which never render inside `DashboardLayout`. |
| Motion added (4.4) on reduced-motion machines | phase 4 | `plan-card-enter` and `plan-sheen` are already neutralised under `prefers-reduced-motion` in `index.css`. |

---

## 6. Testing and validation

### 6.1 Automated

- `npm run lint`, compared against the recorded baseline for these files:
  - `GuestDashboard.jsx` — 1 error (`'React' is defined but never used`)
  - `RegisterOrgPage.jsx` — 1 error (same)
  - `RegisterPage.jsx` — 4 errors (untouched by this plan)

  No new errors. Watch `react/no-unescaped-entities` — use `’` in all new copy.
- `npm run build` clean.
- The dev-only `fieldHelpMeta.js` validator must log nothing for the new surface
  (it warns on a missing Ask Maya question, an unknown workspace, and an entry no
  workspace can see).

### 6.2 Payment-flow regression — the critical suite

Run **before and after**, and diff. Nothing in this plan should change a single
line of any of these:

1. **Free plan, happy path.** Pick Free → fill → Activate Workspace → confirm
   `initiateRegistration` body is `{ plan_code: "free", org_name, … }` →
   `login(res)` → success screen → HR dashboard.
2. **Paid plan, happy path.** Pick Starter monthly → Proceed to Payment →
   Razorpay test modal opens with the right amount, currency and
   `theme.color: "#7c3aed"` → pay → `verifyPayment` body carries all four keys
   including `org_id` → success → HR dashboard.
3. **Paid plan, modal dismissed.** `ondismiss` message appears; `loading` clears;
   `PENDING_ORG_KEY` still in sessionStorage. (See §7-1 — the known defect here
   must be **reproduced identically**, not accidentally fixed or worsened.)
4. **Mid-payment reload.** Reload with the Razorpay modal open, confirm
   `PENDING_ORG_KEY` is still read on the next verify.
5. **Verify fails.** Force a 500 on `verifyPayment`; the "Don't pay again"
   message must appear unchanged.
6. **Fallback catalogue.** Block `GET /billing/plans` and the public route; the
   asterisks, the footnote and the submit refusal must behave exactly as today,
   and the free plan must still be purchasable.
7. **Empty catalogue.** `plans: []` → "no plans on sale" message, no cards, no
   skeleton left spinning.
8. **Plan intent.** `/register-organization?plan=growth&billing=yearly` → lands
   on step 2 with Growth yearly; sessionStorage intent cleared once.
9. **Non-guest.** Sign in as HR, hit `/register-organization` → skeleton, then
   redirect to the HR dashboard. No flash of the picker.
10. **No token.** Clear storage, hit the route → redirect to `/auth/login`.

### 6.3 Form behaviour (phase 2)

- Empty form, first press: no red on arrival; after the press, org name is red,
  focused and scrolled into view, nothing sent (Network tab empty).
- 300-character website: blocked client-side with our own message; confirm no
  request leaves. Then shorten it and confirm the same value **is** accepted
  (proving we didn't tighten the rule).
- `company.com` with no scheme: accepted (today it is not).
- 25-digit phone: blocked with our message, not the server's.
- A field fixed after a failed press clears its red immediately.
- Submit with a server-side failure: `role="alert"` fires; the message comes from
  `organizationErrorMessage`, never a raw code.

### 6.4 Accessibility

- Keyboard-only run of the whole journey: guest dashboard → plan cards → toggle →
  step 2 → submit. No trap, visible focus throughout, Back control reachable.
- Screen reader (NVDA or VoiceOver): each plan button announces its tier; the
  cycle toggle announces its selected state; the step indicator announces the
  current step; the submit error is announced; the success panel is announced.
- Axe or Lighthouse on both screens: zero new violations; target no
  colour-contrast failures on the `text-gray-400` captions carried over.
- `prefers-reduced-motion: reduce`: no card animation, no sheen, no fade.

### 6.5 Responsive

Measure at **390**, **768**, **1366** and **1920**:

- No horizontal scroll at 390.
- Step 2's submit button visible without scrolling at 1366 after 3.7.
- Plan grid with 1, 2, 3 and 4 tiers (stub the catalogue) — no orphan card.
- Guest dashboard cards equal height at every breakpoint.
- The truncated email still readable via `title` / tap at 390.

---

## 7. Found inside the untouchable boundary — flagged, not fixed

Both are real. Both are payment-flow logic, so this plan does not touch them.

**7-1 — A dismissed payment can create a second organisation.**
`modal.ondismiss` (line 273) says *"Payment was cancelled. You can retry anytime
— your organization has been saved."* But the only control on screen is the
primary submit, which calls `initiateRegistration` again — and per the contract
(§1, step 4) that **creates another `organizations` row** and another pending
transaction. The reassurance is true; the only available action contradicts it.
*Recommended, after backend confirmation:* on dismiss, keep `org_id` and offer
"Retry payment" that re-opens Razorpay against the existing order, or ask the
backend for an idempotent initiate keyed on the pending org. Needs a decision
from whoever owns `onboarding.controller.js`.

**7-2 — A failed verify is not retried, though the contract says it is safe to.**
`md_organization/1_org_registration_api.md` §2 "Important Side Effects" states
the endpoint is idempotent and *"the frontend can safely retry this API"*. The
handler (line 256) instead shows a terminal "check your email" message. A single
bounded retry would recover most transient network failures before the customer
ever sees a scary message. Out of scope here; worth its own ticket.

**7-3 (minor, logic) — `sizesForPlan(selectedPlan, billing)`** (line 148) passes a
second argument the function ignores (line 31), so the dropdown filters on the
*tier's* (monthly) seat limit while the hint beneath it (line 621) uses
`selectedLimits`, the *variant's*. These agree today because no tier differs by
cycle. One line to fix, but it changes which sizes are offered, so it belongs
with C-5 in a single decision.

---

## 8. Open decisions needed before phase 2 starts

- **D1 — Is `size` required?** The contract says optional; the UI says required.
  Phase 2's `problems` map needs the answer. *Recommendation: keep it required in
  the UI* — it is the only input that makes the seat-limit guidance meaningful —
  and annotate the deviation in the file header per CLAUDE.md §9.
- **D2 — Is the step model 3 steps or 2?** Phase 1.3 proposes 3 (choose how to
  start → choose a plan → company details). If sign-up/OTP should count, it's 4.
  One answer, applied in one meta file.
- **D3 — Move `PRIMARY_BTN`/`SECONDARY_BTN` to `shared/components/`?** Phase 4.2
  needs an owner's call on whether `auth/` may import from `roles/hr/`.
  *Recommendation: move, re-export.*
- **D4 — Does 7-1 get a ticket now?** It is the highest-severity thing found, and
  it is the one thing this plan may not fix.

---

## 9. Suggested sequencing

| Phase | Scope | Ship with |
|---|---|---|
| 1 | 9 items, copy + trust + skeletons | the §4.0 workspace provider and the 5 field-help entries |
| 2 | §11 validation, 7 items | its own lint + §6.3 suite |
| 3 | a11y + layout, 9 items | §6.4 and §6.5 |
| 4 | design-system alignment, 5 items | optional; defer if D3 is unresolved |

Phases 1–3 together are the "production-ready" bar. Phase 4 is consistency work
that can follow.
