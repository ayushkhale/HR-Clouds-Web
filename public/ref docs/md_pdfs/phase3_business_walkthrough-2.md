# Phase 3: PDF Generation Module (Payroll Documents) — Business Walkthrough

This guide explains, in plain business language, what Phase 3 of the PDF Generation module changes for HR administrators and employees. It covers the new way payroll documents are produced and delivered, what stays exactly the same, and how an organization safely adopts — and, if needed, rolls back — the new engine.

---

## What Phase 3 delivers

Phases 1 and 2 built the HTML letter pipeline and issued real corporate letters. **Phase 3 brings that same modern rendering to the three payroll documents employees care about most — the payslip, the annual salary statement, and the Form 16 Part B tax certificate — and adds a cache so bulk payslip downloads are fast.**

The important promise: **nothing an employee, manager or HR user sees changes until the organization opts in.** Every payroll PDF endpoint keeps its address, its download, and its behaviour. On the day Phase 3 ships, every organization is on the classic engine and behaves exactly as before.

## How a payslip is produced now

1. **Held vs released.** A payslip that HR is still reviewing (held) is always produced by the classic engine and is never cached — HR can download the review copy exactly as today.
2. **Released payslip.** Once a run is released to employees, each payslip becomes an immutable document. On the new engine, the first time it is downloaded it is rendered once and stored; every download after that is served instantly from storage, with no re-rendering.
3. **Warm-up on release.** With warm-up on (the default), releasing a run quietly renders its payslips in the background, so by the time HR downloads the whole run it is already prepared.

Employees and managers download their payslips exactly as before — the difference is speed, not steps.

## Bulk payslip download

When HR downloads all payslips for a run as a ZIP:

- **Classic engine:** unchanged — the ZIP streams as today.
- **New engine, already-prepared run:** the ZIP streams instantly from storage.
- **New engine, large not-yet-prepared run:** instead of making HR wait through thousands of live renders, the system accepts the request and prepares the payslips in the background. HR receives a "generation started" acknowledgement with a way to check progress, and downloads the complete ZIP once it is ready.

This keeps a big download honest — it never hangs the browser and never produces a silently incomplete archive.

## Two new HR tools

- **"Prepare payslip PDFs" (drain):** HR can trigger preparation for a run on demand — useful right after switching an organization to the new engine, so a recent run is warmed up before anyone downloads it. Safe to press repeatedly.
- **"Render status":** shows, for a run, how many payslips are ready, how many are still being prepared, and whether a full ZIP will now download. This is the progress signal behind the "generation started" acknowledgement above.

## Annual statement & Form 16

The annual salary statement and the Form 16 Part B are produced through the new engine when an organization opts in, printing exactly the same figures as before. They are always generated fresh (not cached), because they carry a "generated on today" date and are read far less often than payslips.

## Adopting the new engine safely

1. The organization turns on the new engine in payroll settings. (The system refuses if the rendering service is not configured, so an organization can never switch into a broken state.)
2. HR warms up a recent run and compares a downloaded payslip against the classic one, side by side.
3. The organization rolls forward run by run.

**One thing to communicate to employees:** a payslip produced by the new engine shows exactly the same numbers, names, dates and totals as before, but its typography and spacing look a little different. Anyone comparing an old download with a new one will notice the styling change — the content is identical.

## Rolling back

If anything looks wrong, HR flips the engine setting back to classic. It takes effect on the next download, needs no deployment, and needs no cleanup — a one-switch, deploy-free rollback. Stored payslip copies simply stop being read.

## What stays exactly the same

- Every payslip, annual statement and Form 16 download keeps its address, filename, permissions and audit trail.
- Held payslips are still HR-only review copies.
- Publishing a run behaves exactly as before (it simply also prepares the payslips in the background when the new engine is on).
- Employees only ever see their own documents; managers only their direct reports'; HR the whole organization — unchanged.
