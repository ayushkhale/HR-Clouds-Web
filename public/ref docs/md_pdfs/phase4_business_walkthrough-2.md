# Phase 4: PDF Generation Module (Bulk, Proposals & Auto-Issue) — Business Walkthrough

This guide explains, in plain business language, what Phase 4 of the PDF Generation module changes for HR administrators, managers and employees. It covers three new ways letters get issued, what stays exactly the same, and how an organization safely turns each one on.

---

## What Phase 4 delivers

Phase 2 let HR issue a corporate letter to **one** employee at a time. Phase 4 adds three ways to do more, without changing how a single letter is issued:

1. **Bulk issuance** — issue one letter template to many employees at once.
2. **Manager proposals** — let a line manager draft a letter for a direct report that HR then approves or rejects.
3. **Auto-issue on exit** — automatically hand a leaver their standard exit letters on their last working day.

The important promise, as in every phase: **nothing happens automatically until the organization opts in.** On the day Phase 4 ships, no organization bulk-issues, accepts proposals, auto-issues, or emails a letter until an HR administrator turns the relevant switch on.

## Bulk issuance

When HR needs to issue the same letter (say, a revised-policy acknowledgement) to a whole team or the whole company:

- HR picks a template and a list of employees. The system checks the list is within the organization's configured batch size (a safety ceiling so a mistake can't flood the queue).
- Because a large batch can't be produced instantly, the system **accepts** the request and prepares the letters in the background. HR gets a "batch started" acknowledgement with a way to check progress.
- The progress view shows how many letters are done, how many are still being prepared, and which ones failed and why — so HR can fix a handful of problem cases without redoing the batch.
- Re-submitting the same batch never creates a duplicate — the system recognises it and shows the existing batch instead.

## Manager proposals (draft → approve)

For organizations that want line managers involved in letter drafting:

- Once HR enables it, a **manager can propose** a letter for one of their direct reports — for example, an experience or relieving letter. A proposal is **not** a letter yet; it waits for HR.
- A manager only ever proposes for their own reports and only ever sees their own proposals.
- HR reviews a single queue of pending proposals and either **approves** (which issues the real letter) or **rejects** with a reason. If the organization requires a separate approver, the person who proposed a letter cannot be the one who approves it.
- A double-click on approve issues exactly one letter — never two.

This distributes the drafting workload to managers while keeping HR firmly in control of what actually gets issued.

## Auto-issue on exit

For organizations that want exit paperwork handled without a manual step:

- HR lists the standard exit templates (for example, a relieving letter and an experience letter). **Salary-bearing letters cannot be auto-issued** — an automatic, unreviewed letter must never state a salary.
- When an employee's last working day arrives, the system issues those letters automatically.
- This runs **after** the organization's normal offboarding tidy-up, so the leaver's letters are handled in the right order.
- If the system can't tell who was responsible for the exit record, it safely skips that person rather than guessing.

## What stays exactly the same

- A single letter is still issued exactly as in Phase 2 — same address, same behaviour.
- Employees and managers still read issued letters through the existing document views; the PDF is still downloaded through the existing secure download paths.
- Every letter is still confidential-by-default, still carries a unique reference number, and still leaves a full audit trail. An auto-issued letter records that it was a **system** action (no human actor) while still attributing who the exit was recorded by.
- Every permission boundary is unchanged: employees see only their own documents, managers only their reports', HR the whole organization.

## Turning it on safely

Each capability has its own switch in Document settings, all off by default:

- **Bulk size limit** — sets how many employees one batch may target.
- **Manager can propose letters** — turns the proposal path on.
- **Auto-issue on exit** — the list of exit templates to issue automatically (empty means off).
- **Notify on letter issued** — emails the employee when a letter is issued. **Kept off for now**, pending confirmation of where its "view your letter" link should point.

Turn one on, watch a small batch or a single proposal go through, and expand from there.
