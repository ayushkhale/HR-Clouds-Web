# Frontend Architecture & UI/UX Design Specification: Unified Organization Settings Dashboard

**Document Target:** `public/md_settings/frontend_settings_ui_ux_architecture.md`  
**Author:** Senior Frontend / Product Design Engineer  
**Status:** Approved Architectural Specification  
**Related Backend Specifications:**
* [org_settings_registry.md](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/public/md_settings/org_settings_registry.md) (114 Configuration Decisions)
* [implementation_plan.md](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/public/md_settings/implementation_plan.md) (Master Backend Plan)
* [phase1_implementation_plan.md](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/public/md_settings/phases/phase1_implementation_plan.md) (Read Plane & Catalog Contract)
* [phase2_implementation_plan.md](file:///c:/Users/91930/Desktop/Vs_Code/HRMS/public/md_settings/phases/phase2_implementation_plan.md) (Write Plane Contract)

---

## 1. Executive Summary & Problem Statement

### 1.1 The Challenge
In a comprehensive HRMS platform, company configuration spans **5 disparate domains**:
1. **Payroll** (cutoffs, paydays, overtime rules, loan caps, tax windows)
2. **Documents & Branding** (retention days, letterhead details, upload quotas, checkers)
3. **Organization & Billing** (billing notification recipients, reminder lead schedules)
4. **Attendance** (grace periods, late penalties, shifts, work weeks, biometric devices)
5. **Leave** (sandwich rules, doctor note thresholds, annual quotas, accrual cycles)

### 1.2 The Traditional "Failure Modes" in HRMS Frontends
Most HR software suffers from one of two bad user experience antipatterns:

* **Antipattern A: The Endless Form Labyrinth:**  
  Dumping all 138+ settings into a single giant form page with dozens of nested inputs. HR administrators are terrified of clicking "Save" because they do not know what side effects will trigger or what changed.
* **Antipattern B: The Scavenger Hunt:**  
  Scattering settings across 10 disconnected menus: HR has to navigate to *Leave $\rightarrow$ Types* to find the sandwich rule, then to *Attendance $\rightarrow$ Policies* to find the grace period, then to *Payroll $\rightarrow$ Settings* to configure payday, and to *Company $\rightarrow$ Profile* for branding. Configuration discovery is virtually zero.

### 1.3 The Core Design Philosophy: "Single Pane of Glass"
As a Senior Frontend Engineer, our mission is to build **one centralized `/dashboard/settings` experience** that achieves two goals simultaneously:
1. **Low Cognitive Load for HR:** Human-friendly language, visual chunking into clean cards, zero technical jargon, and immediate clarity on change impact.
2. **Architectural Purity Under the Hood:** Seamlessly bridging the backend's two distinct patterns—**Direct Key-Value Singleton Forms** (Payroll, Documents, Organization) and **Configuration Surface Hubs** (Attendance, Leave)—without confusing the user.

### 1.4 Non-Negotiable Constraint: Do Not Remove Existing Module Settings Pages
> [!IMPORTANT]
> **Preserve All Existing Module Settings Pages:**
> Introducing the centralized Organization Settings Dashboard (`/dashboard/settings`) does **NOT** remove, replace, or deprecate existing settings pages that currently exist within individual module sections.
> 
> * **Existing settings tabs remain intact:** Any settings pages already present under specific module tabs (e.g. *Payroll > Settings*, *Documents > Settings*, *Attendance > Policies*, *Leave > Policy Setup*) **must remain fully functional, accessible, and in place**.
> * **Coexistence Model:** The centralized `/dashboard/settings` hub serves as an umbrella discovery, audit, and global overview center ("single pane of glass"). It works in tandem with module-specific settings screens rather than destroying or hiding them. Users must still be able to manage settings directly within their respective module tabs if they navigate there.

---

## 2. Information Architecture & Navigation

The unified dashboard organizes all 114 organization decisions into **5 intuitive master tabs**, accompanied by a global settings search.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ⚙️ Company Settings                                        [ 🔍 Search any setting... (Cmd+K) ]       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [ 🏢 Company & Billing ]  [ 💳 Payroll ]  [ 📄 Documents & Branding ]  [ ⏰ Attendance ]  [ 🌴 Leave ]  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Domain Tab Responsibilities

| Tab Name | Scope & Mechanism | Typical HR Questions Answered |
| :--- | :--- | :--- |
| **🏢 Company & Billing** | **Direct Form Cards** (`organization_profiles`) | *"Where do monthly invoices get sent? When are renewal reminders sent?"* |
| **💳 Payroll** | **Direct Form Cards** (`payroll_settings`, `statutory_configs`) | *"When is cutoff day? What is our default tax regime? What are our PF rates?"* |
| **📄 Documents & Branding** | **Direct Form Cards** (`document_settings`, `document_letter_branding`) | *"What is our company letterhead? How long do we retain signed letters?"* |
| **⏰ Attendance & Shifts** | **Configuration Hub** (Surfaces $\rightarrow$ `attendance_policies`, etc.) | *"What is our company grace period? Where do I set shifts and weekend off-days?"* |
| **🌴 Leave & Holidays** | **Configuration Hub** (Surfaces $\rightarrow$ `leave_types`, templates) | *"Do we have the sandwich rule enabled? What leaves require a doctor's certificate?"* |

---

## 3. UI/UX Design System: The Two Component Patterns

To cleanly reflect the backend architecture while delivering a frictionless user experience, the frontend implements two distinct component patterns.

```text
                                  SETTINGS UI PATTERNS
                                           │
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
      PATTERN A: Direct Form Cards                       PATTERN B: Configuration Hubs
      (Payroll, Documents, Organization)                  (Attendance & Leave)
      ──────────────────────────────────                 ────────────────────────────────
      • Inline form inputs                               • Summary status badges
      • Per-card dirty tracking & "Save"                 • Deep links to dedicated managers
      • Concurrency guard (If-Match)                     • Visual policy previews
      • High-risk confirmation dialogs                   • Quick-action creation modals
```

---

### Pattern A: Direct Form Cards (For Singleton Stores)
Used for **Payroll**, **Documents**, and **Company/Billing**.

#### Card Structure:
* Each backend group (e.g., `payroll.calendar`, `documents.retention`, `statutory.pf`) renders as an isolated, self-contained **Visual Card**.
* **Isolated State & Submissions:** Each card maintains its own dirty state and its own **"Save Changes"** button. This directly fulfills Decision `D-S4` (*One Request $\rightarrow$ One Group $\rightarrow$ One Transaction*). HR can edit their Payday calendar without worrying about altering statutory settings.

#### Visual Wireframe: `Payroll Calendar & Cutoff`
```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 📅 Payroll Calendar & Cutoff Schedule                                                  │
│ Configure standard monthly payroll processing dates and cutoffs.                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  Pay Day                         Attendance Cutoff Day          Currency               │
│  ┌─────────────────────────┐     ┌────────────────────────┐     ┌──────────────────┐   │
│  │ 30th of the month    ▼  │     │ 25th of the month   ▼  │     │ INR - Indian R..▼│   │
│  └─────────────────────────┘     └────────────────────────┘     └──────────────────┘   │
│  💡 Employees receive salary on   💡 Attendance after this day   💡 Used in all         │
│     the 30th.                       rolls to next month.           salary slips.       │
│                                                                                        │
│  [ ] Pay day falls in the next calendar month (e.g. 5th of following month)           │
│                                                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ℹ️ Changes take effect on next payroll run (Nov 2026).             [ Discard ] [ Save ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Human-Centric UI Details:
1. **Friendly Conversational Pickers:** Instead of raw integer inputs (`25`, `30`), use descriptive dropdowns (*"25th of the month"*, *"Last day of the month"*).
2. **Contextual Impact Badges:** Display `effect_timing` from catalog metadata directly on the footer:
   * 🟢 *Immediate:* "Takes effect immediately."
   * 🟡 *Next Run:* "Takes effect on the next payroll run (Nov 2026)."
3. **Dirty State Indicator:** When an HR admin alters a value, the card highlights with a subtle amber border and the `[Save]` button enables with a pill badge: *"1 unsaved change"*.

---

### Pattern B: Configuration Hub & Surface Cards (For Multi-Policy Domains)
Used for **Attendance** and **Leave**.

Because an organization can have multiple attendance policies (e.g., Factory Shift vs. Tech Office) or multiple leave types (Sick vs. Casual), presenting a flat form would be technically inaccurate and misleading.

Instead, the UI renders **Configuration Hub Cards** powered by the catalog's `surfaces` array.

#### Visual Wireframe: `Attendance Settings Tab`
```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⏰ Attendance Settings & Company Policies                                               │
│ Manage attendance rules, work weeks, shifts, and check-in hardware.                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🕒 Punctuality & Attendance Policies                                [ Manage (2) ] │ │
│ │    Configures grace period, late penalty deduction, half-day hour cutoffs.         │ │
│ │                                                                                    │ │
│ │    Active Default Policy:                                                          │ │
│ │    • Grace Period: 15 minutes                                                      │ │
│ │    • Half-Day Cutoff: 4.0 hours  |  Full-Day: 8.0 hours                            │ │
│ │    • Correction Window: 7 days retroactively allowed                               │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📅 Weekly-Off & Rest Days (Work Week)                               [ Configure ]  │ │
│ │    Configures company weekends and department-targeted non-working days.           │ │
│ │                                                                                    │ │
│ │    Current Schedule: Saturday & Sunday Off (All Departments)                       │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔄 Shift Templates & Rotations                                      [ Manage (4) ] │ │
│ │    General Shift (9:00 AM - 6:00 PM), Night Shift (10:00 PM - 7:00 AM)             │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📱 Biometric Hardware & Field Geofences                             [ Manage ]     │ │
│ │    3 Active Devices | 2 Geofenced Locations                                        │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Why This Works for HR:
* **Zero Scavenger Hunt:** HR does not need to guess where shifts or grace periods live. They open "Settings $\rightarrow$ Attendance" and see the complete layout.
* **Instant Summary:** HR immediately sees the current active defaults without clicking through to sub-pages.
* **Seamless Navigation:** Clicking `[ Manage (2) ]` slides open a clean slide-over drawer or redirects directly to the dedicated policy editor `/dashboard/attendance/policies`.

---

## 4. Frontend State Management & API Integration

The frontend architecture is built on top of 4 backend API contracts:

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND DATA FLOW                                                                   │
│                                                                                      │
│ 1. Page Load   ──▶ GET /api/v1/settings/catalog (S-1) ──▶ Static Cache (ETag)        │
│ 2. Data Fetch  ──▶ GET /api/v1/settings         (S-3) ──▶ Normalized Store           │
│ 3. Group Save  ──▶ PUT /api/v1/settings/groups/:key (S-5)                            │
│                    Headers: If-Match: W/"<etag>"                                     │
│                    Body:    { values: { ... }, confirm: true, reason: "..." }        │
│ 4. Group Reset ──▶ POST /api/v1/settings/groups/:key/reset (S-6)                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Client-Side Normalized Store Structure
```typescript
interface SettingsState {
  catalogVersion: string;
  groups: Record<string, GroupMetadata>;
  values: Record<string, any>;             // Key-value store: { pay_day: 30, ... }
  initialValues: Record<string, any>;      // Baseline snapshot for dirty checking
  groupEtags: Record<string, string>;       // Per-group ETag tokens for concurrency
  surfaces: SurfaceDescriptor[];           // Policy directory pointers
  unavailableGroups: { key: string; reason: string }[];
  isSubmittingGroup: Record<string, boolean>;
}
```

### 4.2 Handling Optimistic Concurrency Control (`If-Match`)
To prevent two HR administrators from overwriting each other's settings:
1. When loading group data, the frontend stores the group's `etag` header (e.g., `W/"2026-10-09.1:2026-10-08T10:00:00.000Z"`).
2. When calling `PUT /api/v1/settings/groups/:groupKey`, the frontend passes this token in the `If-Match` request header.
3. **If another admin updated settings in the interim:**
   * Backend returns HTTP `412 Precondition Failed`.
   * Frontend displays a non-destructive conflict banner:
     > *"These settings were updated by another administrator just now. [Reload Latest Values] or [Review Differences]"*
   * HR's local edits are preserved in form state so their work is never lost.

---

## 5. Safeguards & High-Risk UX Design

Certain settings carry severe business or data-loss consequences if altered carelessly (e.g. Registry Entry #95: lowering document retention triggers irreversible permanent file deletion).

### 5.1 The High-Risk Confirmation Modal
Whenever a modified setting in a card is flagged as `risk: 'high'` in catalog metadata:
1. Clicking `[Save Changes]` does **not** immediately submit the request.
2. The UI intercepts the action and displays a **High-Risk Confirmation Modal**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Confirm High-Risk Configuration Change                                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ You are reducing Letter Record Retention Days from 365 days to 90 days.                │
│                                                                                        │
│ 🚨 WARNING: Lowering retention causes all letters deleted over 90 days ago to be        │
│    permanently and irreversibly purged from cloud storage on the next nightly run.    │
│                                                                                        │
│ Please enter a mandatory audit reason:                                                 │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Compliance audit requested 90-day GDPR purge                                       │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ [x] I understand this action cannot be undone.                                         │
│                                                                                        │
│                                            [ Cancel ]  [ Confirm & Apply (Save) ]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

3. When confirmed, the frontend automatically bundles the payload:
   ```json
   {
     "values": {
       "letter_record_retention_days": 90
     },
     "confirm": true,
     "reason": "Compliance audit requested 90-day GDPR purge"
   }
   ```

---

## 6. The "Quick-Search & Find" Feature (Command Palette)

With 114 settings across 5 modules, HR users often don't know which tab a setting lives in.

### UX Solution: Global Search Bar (`Cmd + K` / `Ctrl + K`)
The frontend indexes the catalog returned by `GET /api/v1/settings/catalog`:
* Searching *"grace"* immediately highlights:  
  $\rightarrow$ **Grace Period** in *Attendance $\rightarrow$ Attendance Policies* `[Jump to Policy]`
* Searching *"tax"* highlights:  
  $\rightarrow$ **Default Tax Regime** in *Payroll $\rightarrow$ Tax Administration* `[Jump to Card]`
* Searching *"sandwich"* highlights:  
  $\rightarrow$ **Sandwich Rule** in *Leave $\rightarrow$ Leave Types* `[Jump to Types]`

This eliminates all configuration anxiety for new HR administrators.

---

## 7. Frontend Engineering Implementation Checklist

```text
├── [Phase 1: Foundation]
│    ├── Setup /dashboard/settings layout with 5 Master Tabs
│    ├── Retain and preserve all existing module settings pages under their specific module tabs
│    ├── Implement Global Search (Cmd+K) over GET /api/v1/settings/catalog
│    ├── Build generic FormCard component with dirty tracking & per-card Save
│    └── Build generic SurfaceHubCard component with badge & deep link
│
├── [Phase 2: Domain Implementation]
│    ├── Payroll Tab: Render 11 form cards (Calendar, Loans, Payslips, PF, ESI...)
│    ├── Documents Tab: Render 10 form cards (Branding, Storage, Retention...)
│    ├── Organization Tab: Render Billing Notification form card
│    ├── Attendance Tab: Render 4 surface hub cards (Policies, Weekly-offs, Shifts...)
│    └── Leave Tab: Render 2 surface hub cards (Leave types, Policy templates...)
│
└── [Phase 3: Robustness & Polish]
     ├── Integrate If-Match ETag headers on all PUT requests
     ├── Implement 412 Concurrency Conflict recovery modal
     ├── Implement High-Risk Confirmation Modal with mandatory reason
     └── Add Reset to Documented Defaults button on all singleton cards
```

---

## 8. Summary & Deliverable Impact

By implementing this design:
1. **HR Administrators get an effortless, non-intimidating experience:** They have a single starting point for every setting in the company, with clear human labels, immediate feedback, and protection against accidental mistakes.
2. **The Frontend stays 100% architecturally clean:** We respect the backend's strict module boundaries—submitting single-group transactions for singletons while linking seamlessly to dedicated managers for multi-record policies.
3. **Zero Maintenance Burden:** If a new setting is added to the backend catalog, the frontend dynamically discovers it without needing manual UI code rewrites.
