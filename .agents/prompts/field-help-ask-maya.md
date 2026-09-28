# Task: Field help (ⓘ) with "Ask Maya" pre-filled questions — employee workspace pilot

Read `CLAUDE.md` and `.agents/rules/uirule.md` first. They are binding. This prompt only
adds to them.

## What we're building and why

People filling in forms get stuck on a few system-specific fields, such as tax section,
IFSC, regularisation "Worked from", or a confidential document. Maya, the RAG chatbot,
can explain these, but only if the question is precise, and people rarely ask precise
questions. So:

1. A **small ⓘ button** sits next to the label of *selected* confusing fields. There is
   no ⓘ on obvious fields like name, date, title or amount.
2. Hovering, focusing or tapping it shows a **short plain-English explanation**: what
   the field means and what input it expects.
3. When the field is configured for it, the popover also shows an **"Ask Maya"**
   link. Clicking it opens Maya with a **pre-written question already in her input
   box**. The question was written in advance so the RAG system can answer it well.
   The user only presses Send.
   **Never auto-send.** The user stays in control, and nothing is sent to the external
   chatbot without their click.
4. Everything is driven by **one JSON config file**. Adding, changing or disabling help
   for a field, or rolling it out to another workspace later, is a JSON edit, not a
   code change.

This is a **pilot in the employee workspace only**. It must still be production
quality: accessible, safe inside modals, and degrading to nothing when Maya is
unavailable.

## Current code you must understand before writing anything

- `src/shared/components/ChatbotWidget.jsx`: Maya's floating widget. It is
  **lazy-loaded once in `src/App.jsx`**, outside the routes. Its input state
  (`inputValue`, `textareaRef`) is local. It closes itself on every `pathname`
  change. It sits at **`z-[70]`**, and its Escape handler is a plain `window` keydown
  listener.
- `src/shared/hooks/useDocMindChat.js`: the RAG client (external DocMind API).
  `sendMessage`, `isLoading`/`isStreaming`, and `config.limits.maxQueryLength`.
  Missing `VITE_DOCMIND_API_KEY` means an error state.
- `src/shared/hooks/useMayaVisibility.js`: the user can **hide Maya entirely** from My
  Profile. When hidden, the widget returns `null`. It uses a window-event sync pattern
  that you should copy.
- `src/shared/hooks/usePopoverPosition.js`: the existing fixed, portalled positioning
  hook used by `PersonPicker` and `TimeField` so modal scroll bodies don't clip
  pop-ups. **Reuse it. Don't write another positioner.**
- `src/shared/layouts/DashboardLayout.jsx`: already resolves the workspace `role`.

### Traps found in the current forms (these decide the design)

- **Maya is under every form dialog.** The forms use z-60 (leave apply in
  `LeaveDashboard`), z-120 (`ClaimEditorDialog` in `MyReimbursementsPage`), z-140
  (`DetailDialog`, used for the bank details editor in `MySalaryPage`) and z-150
  (`DocumentUploadDialog`). If "Ask Maya" just opens the widget, it opens *behind* the
  form and looks broken.
- **Clicking where Maya would be closes the form.** `ClaimEditorDialog`,
  `DocumentUploadDialog` and `ReasonDialog` close on a backdrop `onMouseDown`. Maya must
  be on top, so the click lands on her and not on the backdrop.
- **An Escape pressed in Maya can close the form and lose what the user typed.**
  `ClaimEditorDialog` closes on *any* window Escape (`MyReimbursementsPage.jsx` ~L100).
  `DocumentUploadDialog` also listens for Escape. `DetailDialog` already ignores Escape
  when focus is outside its panel, but the others don't. Maya's Escape handling must
  run in the **capture phase** and `stopPropagation()` when focus is inside her panel.
  `ReasonDialog.jsx` ~L59–67 shows the house pattern.
- **Maya is lazy and may not be mounted yet**, so a plain window event fired before she
  mounts is lost.
- **Self-service screens mount in all three workspaces.** For example, `LeaveDashboard`
  is also routed under the HR and manager prefixes, and `DocumentUploadDialog` is
  shared. "Employee only" therefore has to be a **workspace gate in config**. A gate
  based on file location won't work.

## Architecture (follow this; justify in the header comment if you deviate)

### 1. Config: `src/shared/fieldHelp/fieldHelp.json`

Key by a **stable form id** and the **API payload field key**, never by the visible
label, because labels get reworded (see CLAUDE.md §6). Suggested shape:

```json
{
  "version": 1,
  "forms": {
    "payroll.tax_declaration": {
      "description": "Employee investment declaration rows — My Tax & Investments › Declarations",
      "workspaces": ["employee"],
      "fields": {
        "section": {
          "hint": "Which part of the income-tax law this saving falls under. It decides how much of it can reduce your tax.",
          "askMaya": {
            "enabled": true,
            "question": "Which income tax section should I choose when declaring an investment, and what counts under 80C, 80D, HRA and LTA?"
          }
        },
        "proof_reference": {
          "hint": "A link or reference number for the receipt that proves this payment. HR checks it before the saving counts.",
          "askMaya": { "enabled": false }
        }
      }
    }
  }
}
```

Rules:
- `hint` is required. Keep it to 1–2 sentences, under about 160 characters. Write it
  for someone who doesn't work in HR (§6): say the consequence, not the mechanism. Use
  `’` where the text reaches JSX.
- `askMaya` is optional. If it is absent or `enabled: false`, show the hint only. A
  field entry that exists with only a hint is valid.
- `workspaces` sits at the form level, with an optional per-field override. **The pilot
  sets only `["employee"]`.** Rolling out to manager and HR later is a config edit.
- A form or field **missing from the config renders nothing**. There's no placeholder
  ⓘ and no console noise in production.
- Questions are **static text. No interpolation of user data.** Maya is an external
  service, so no names, salaries or account numbers go into the pre-fill. Each
  question must be under `limits.maxQueryLength` (1000).
- Keep domain knowledge out of JSX (§1). The JSON is the single source.

Add `src/shared/fieldHelp/fieldHelpMeta.js` with:
- `getFieldHelp(formId, fieldKey, workspace)`, which returns `{ hint, question | null }`
  or `null`.
- A **dev-only validator** that runs once on import in `import.meta.env.DEV` and
  `console.warn`s about a missing hint, an overlong hint or question, an unknown
  workspace, or `askMaya.enabled` without a question. It must never throw, and it must
  never run in production builds.

### 2. Bridge: `src/shared/maya/mayaBridge.js` (plain module, no React)

- `askMaya({ question, source })` stores a **pending question** and dispatches
  `hrclouds:maya-ask`. The pending slot covers the case where the widget mounts later.
  `source` is `{ form, field }`, kept for future telemetry only. It is never displayed.
- `consumePendingQuestion()` is what the widget calls on mount and on the event.
- Availability: the widget calls `registerMaya(available)` on mount and unmount and when
  `hidden` changes. `useMayaAvailable()` is a tiny hook, using the same
  window-event pattern as `useMayaVisibility`, that `FieldHelp` reads.

### 3. `ChatbotWidget.jsx` changes (minimal; don't restyle it)

On an ask:
- Open the panel.
- Set `inputValue` to the question, **replacing** the current text. The click was
  explicit.
- Focus the textarea with the caret at the end, so Enter sends it.
- **Do not call `sendMessage`.**
- Keep the existing conversation.
- If Maya is streaming, still fill the input. The input stays disabled until the stream
  ends, as it does today.

While open because of an ask, **raise the widget above form dialogs.** Use `z-[160]`:
above z-150 forms, below `AttachmentViewerDialog` z-165 and `ReasonDialog` z-170. When
the panel closes, drop back to `z-[70]`. A normal FAB open keeps today's behaviour.
Update the z-index comment block in the widget.

Make Escape **capture-phase**: it closes Maya and calls `stopPropagation()` only when
focus is inside `#maya-chat-panel`, so the form underneath never sees it. Escape
elsewhere behaves as before.

`registerMaya(!hidden && hasApiKey)`. When unavailable, the Ask Maya link is
**absent** (§2: absent, not broken). The hint still shows.

### 4. `src/shared/fieldHelp/FieldHelp.jsx`: the ⓘ toggletip

Usage in a form:

```jsx
<label htmlFor="bank-ifsc" className={labelCls}>
  IFSC code <span className="text-rose-500">*</span>
  <FieldHelp form="payroll.bank_details" field="ifsc_code" />
</label>
```

- The icon is `HiInformationCircle` from `react-icons/hi` (hi only, §0). It is small
  (`w-3.5 h-3.5`), slate that turns purple on hover or focus, and aligned inline with
  the label text. Its hit area is at least 24×24.
- It is a **`<button type="button">`** with
  `aria-label="What is <label>?"`, `aria-expanded` and `aria-controls`. Call
  `preventDefault` and `stopPropagation` in the click handler so the click never
  focuses or toggles the labelled control, submits the form, or triggers
  `rowPreviewProps` on a table row. The tax declarations are rows in a table.
- **It is a toggletip, not a tooltip,** because the panel contains a link. So
  `role="tooltip"` is wrong. Use a non-modal popover (`role="dialog"` with
  `aria-label`, or a described region).
  - It opens on hover after about 150 ms, on keyboard focus, and on click or tap. Tap is
    the only way on touch screens.
  - It stays open while the pointer moves from the icon into the panel, with a grace
    delay of about 200 ms.
  - It closes on pointer leave, blur out of both icon and panel, outside click, or
    Escape. Escape here is capture-phase and stops propagation, so it closes the
    popover and not the form.
  - Only one popover is open at a time app-wide.
- **Portal it to `document.body`** and position it with `usePopoverPosition`. The z-index
  must beat the host dialog: `z-[155]` is above z-150 forms and below Maya's elevated
  z-160. It flips above the icon when there's no room below, and it is max about
  280 px wide.
- Visual: white card, `border-purple-100`, `shadow-xl`, `rounded-xl`, 12–13 px text.
  Purple only (§5). Set `normal-case` and `tracking-normal` explicitly, because label
  classes are `uppercase tracking-wider`.
- Ask Maya link: a small purple text button with a sparkle or chat icon from
  `react-icons/hi`, reading **"Ask Maya about this"**. On click: call
  `askMaya({ question, source })`, close the popover, and leave the form's own state
  untouched.
- Workspace comes from a new, tiny `WorkspaceContext`, provided by `DashboardLayout`
  from its resolved `role`. **Don't parse the URL** (CLAUDE.md §1). No config entry
  for the workspace means the component renders `null`.

## Pilot scope: the fields to wire

Wire **only these** (about 10 fields). Before writing each hint, read the field's actual
behaviour in code and in `public/ref docs/`. **Don't invent tax or payroll rules.** Keep
hints generic and durable, and leave FY-specific detail to Maya.

| Form id | Where | Field key | Ask Maya |
|---|---|---|---|
| `payroll.tax_declaration` | `MyTaxAndInvestmentsPage` › Declarations | `section`, `proof_reference` | section: yes |
| `payroll.tax_regime` | `MyTaxAndInvestmentsPage` › Regime | `regime_code` | yes |
| `payroll.bank_details` | `MySalaryPage` bank editor | `ifsc_code`, `account_type` | IFSC: no · type: yes |
| `attendance.regularization` | `roles/employee/components/RegularizationCard.jsx` | `work_mode` ("Worked from") | yes |
| `payroll.reimbursement_claim` | `MyReimbursementsPage` › `ClaimEditorDialog` | `category_id` | yes |
| `documents.upload` | `shared/documents/DocumentUploadDialog.jsx` | `document_number`, `is_confidential` | confidential: yes |
| `leaves.apply` | `LeaveDashboard` apply modal | `leave_type_id` | yes |

Confirm each field key against the real payload the form sends, and fix the table if
it's wrong. For shared components (`DocumentUploadDialog`, `LeaveDashboard`), the
workspace gate is what keeps them employee-only. Check that nothing shows under
`/dashboard/hr/*` or `/dashboard/manager/*`.

Write every question **as an employee would ask it, but precise**. Name the concept
and the decision the person is trying to make, so it retrieves well. For example:
"What is the difference between the old and new tax regime, and how do I decide which
one to choose for this financial year?" Don't write "regime?".

## Out of scope

- No backend changes, and no changes to `useDocMindChat`'s request shape.
- No ⓘ on obvious fields. Adding fields beyond the table needs sign-off.
- No manager or HR rollout (config only, later).
- No analytics pipeline. Keep `source` in the bridge so one can be added later.

## Definition of done

- [ ] The JSON config, meta and validator, bridge, `FieldHelp`, `WorkspaceContext` and
      widget changes are in, each non-trivial file with the house `─────` header
      comment. The header records why: pending-slot bridge, z-160 elevation,
      capture-phase Escape, no auto-send, no user data in questions.
- [ ] The 10 pilot fields are wired, and hints and questions are reviewed against code
      and ref docs.
- [ ] Manual checks in `npm run dev` for each pilot form, including the modal ones:
  - [ ] Hover, focus (Tab) and tap each open the hint.
  - [ ] The pointer can move into the popover and click Ask Maya.
  - [ ] Maya opens **above** the form with the question in her input and focus in the
        textarea. Nothing has been sent yet.
  - [ ] Enter sends it, and the answer streams.
  - [ ] Escape in Maya closes Maya only. The form and what the user typed survive.
  - [ ] Escape in the popover closes the popover only.
  - [ ] A click inside Maya never closes the form behind her.
  - [ ] With Maya hidden from My Profile, or with the API key removed, the hint shows
        and the Ask Maya link is absent.
  - [ ] The first click after a hard refresh works. This checks the lazy mount through
        the pending slot.
  - [ ] Nothing appears in the HR or manager workspaces on the shared screens.
  - [ ] Works at 1366 px and at phone width, and the popover stays on screen near the
        viewport edges.
- [ ] `npm run lint` adds no new errors in the files you touched, compared with the
      baseline.
- [ ] `npm run build` passes, then restore `dist/` as CLAUDE.md says
      (`git status --short dist/` is empty).
- [ ] Report: the files changed, the final config, anything in the spec or code that
      contradicted this prompt, and every hint or question you're unsure is factually
      right. List those for human review rather than guessing.
