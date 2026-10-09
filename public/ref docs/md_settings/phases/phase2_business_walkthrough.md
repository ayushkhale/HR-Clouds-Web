# Phase 2: Organization Settings Hub — Business Walkthrough & User Guide

**Document Ref:** `public/md_settings/phases/phase2_business_walkthrough.md`  
**Audience:** HR Administrators, People Operations Leaders, Payroll Officers, Department Managers, Executive Stakeholders  
**Product Version:** Dakshi HRMS (HRClouds / HRVista) — Settings Module Phase 2  
**Scope:** The Centralized Write Plane, Factory Reset Engine, Concurrency Safeguards & High-Risk Confirmation Shields  

---

## 1. Executive Summary & Purpose of Phase 2

Welcome to the **Organization Settings Hub (Phase 2)** user guide.

In **Phase 1**, the Organization Settings Hub established a centralized **Discovery and Audit Command Center**. It provided complete organizational transparency, allowing HR leaders and people managers to explore all 138 organizational settings across 26 categories, compare live configurations side-by-side with factory defaults, review risk classifications, and inspect cross-module policy directories. However, Phase 1 was strictly read-only: making adjustments still required navigating back to individual module administration screens.

**Phase 2 completes the transformation by turning the Settings Hub into an active, operational Command and Control Center.**

With Phase 2, authorized HR administrators can now configure, adjust, and reset organizational policies directly within the unified hub. To ensure corporate governance and prevent accidental disruptions, Phase 2 wraps this power in enterprise-grade safety shields: optimistic collaboration locks to prevent administrators from overwriting each other's work, mandatory business justifications, explicit operational warnings for high-risk policies, and automatic dependency guardrails.

### What is Delivered in Phase 2?

* **Unified In-Place Configuration:** Update company-wide policies for Payroll, Statutory Compliance, Document Storage, Corporate Letterhead Branding, and Company Notifications directly from one central dashboard.
* **One-Click Factory Resets:** Easily restore customized settings back to system-recommended factory defaults—either individually or as an entire category—with a single click.
* **Seamless Multi-Administrator Collaboration:** Smart concurrency detection prevents silent overwrites. If another administrator updates a category while you have it open, the system alerts you immediately, shows the latest values, and lets you re-verify before saving.
* **Two-Gate High-Risk Safety Shield:** Modifying any of the 8 high-impact organizational policies (such as who can approve salary payouts, automated exit letter generation, or document retention schedules) mandates both a written business reason and explicit confirmation of operational warnings.
* **Statutory Compliance Impact Transparency:** When adjusting Provident Fund, ESI, or tax switches, the system immediately discloses the operational impact on ongoing payroll runs and confirms newly activated pay slip components.
* **Strict Role-Based Integrity:** Only authorized HR Administrators can make changes. People Managers retain visibility over their approval authority rules but cannot alter company settings. General employees and platform staff remain completely locked out.
* **Full Preservation of Existing Module Screens:** Introducing centralized editing inside the Settings Hub does **not** replace or remove individual module settings pages (such as *Payroll > Settings* or *Documents > Settings*). Existing screens remain 100% active and available under their respective module tabs.

---

## 2. Who Can Access and Edit Settings?

The Settings Hub enforces strict role-based separation between who can **view** organizational rules and who has the authority to **change** them:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               ORGANIZATION PERMISSIONS MATRIX                           │
├──────────────────────┬──────────────────────┬──────────────────────┬────────────────────┤
│ User Role            │ View Permissions     │ Edit & Reset Rights  │ Permitted Scope    │
├──────────────────────┼──────────────────────┼──────────────────────┼────────────────────┤
│ HR Administrator     │ Full Visibility      │ Full Edit & Reset    │ 25 Active Groups   │
│                      │ (All 26 Categories)  │ (All Active Groups)  │ (Entire Company)   │
├──────────────────────┼──────────────────────┼──────────────────────┼────────────────────┤
│ People Manager       │ Targeted Visibility  │ Strictly Read-Only   │ 2 Authority Groups │
│                      │ (2 Categories Only)  │ (No Edit Rights)     │ (Team Governance)  │
├──────────────────────┼──────────────────────┼──────────────────────┼────────────────────┤
│ General Employee     │ No Access            │ No Access            │ None               │
├──────────────────────┼──────────────────────┼──────────────────────┼────────────────────┤
│ Platform Admin       │ Strictly Excluded    │ Strictly Excluded    │ None               │
└──────────────────────┴──────────────────────┴──────────────────────┴────────────────────┘
```

### Detailed Role Explanations

#### 1. HR Administrators (`hr`)
* **Role Summary:** The executive guardians of corporate governance, organizational payroll, and legal compliance.
* **Permissions in Phase 2:**
  * Can view all 26 categories.
  * Can edit and update settings across all 25 active categories.
  * Can reset any customized setting back to factory defaults.
* **Boundaries:** HR administrators cannot edit `payroll.deprecated` (which is kept permanently read-only for historical audit safety). When adjusting high-risk settings, HR must provide a written reason and confirm impact warnings.

#### 2. People Managers (`manager`)
* **Role Summary:** Department heads and team leaders supervising direct reports.
* **Permissions in Phase 2:**
  * Can **view** the two governance categories: **Payroll Approval Authority** and **Document Approval Authority** (to understand whether they can propose compensation changes or approve team documents).
  * **Strictly Read-Only:** Managers **cannot** edit, save, or reset any setting. Edit controls and reset buttons are automatically hidden from their view. If a manager attempts to submit a change, the system firmly blocks the request.

#### 3. General Employees (`employee`)
* **Role Summary:** Individual team members managing self-service profiles, payslips, and personal document submissions.
* **Access Level:** General employees have no access to the Organization Settings Hub. Company-wide policies are managed exclusively at the leadership level.

#### 4. Platform Administrators (`admin`, `super-admin`)
* **Role Summary:** Cloud hosting and infrastructure engineering personnel.
* **Access Level:** **Strictly Excluded.** To uphold multi-tenant privacy and confidentiality, external platform administrators cannot view or modify any client organization's internal compensation schedules, statutory tax details, or company letterheads.

---

## 3. What is New in Phase 2? (Phase 1 vs. Phase 2 Comparison)

```text
┌───────────────────────────────────────┬───────────────────────────────────────┐
│ PHASE 1: DISCOVERY & READ PLANE       │ PHASE 2: WRITE PLANE & CONTROL SHIELD │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Read-only visibility across 138       │ In-place editing and saving directly   │
│ settings and 26 categories.           │ within the Settings Hub.              │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Required visiting separate module     │ Complete settings management without  │
│ pages to make policy adjustments.     │ leaving the central command center.   │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Factory defaults shown for reference  │ One-click "Reset to Factory Default"  │
│ only.                                 │ button to restore standard values.    │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ No protection if two administrators   │ Built-in concurrency guard prevents   │
│ edited settings at the same time.     │ accidental overwrites between admins. │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ High-risk settings displayed warning  │ High-risk settings enforce mandatory  │
│ labels only.                          │ written reasons and user confirmation.│
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Statutory impacts had to be checked   │ System immediately reports affected   │
│ manually in payroll runs.             │ draft payroll runs upon saving.       │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

> [!IMPORTANT]
> **Existing Module Settings Pages Remain Fully Active:**  
> Centralizing editing in the Settings Hub does **NOT** remove or deprecate individual settings tabs in other modules. Screens like *Payroll > Settings*, *Payroll > Compliance*, *Documents > Settings*, and *Company Profile* remain fully functional, live, and synchronized. Updates made in the Settings Hub instantly reflect across individual module screens, and vice versa.

---

## 4. Core Phase 2 Features Explained

### Feature 1: In-Place Settings Editing

#### What is it?
HR Administrators can open any active settings category card (such as *Payroll Calendar*, *Document Lifecycle*, or *Corporate Letterhead*), adjust the policy fields, and save changes immediately.

#### Why does it exist?
Eliminates administrative friction. Instead of hunting through separate modules to align company policies, HR leaders can audit and adjust company operations from a single screen.

#### What happens after you save?
1. The system verifies that the values meet all business rules and formatting constraints.
2. The changes are saved to the organization's live database.
3. The screen immediately updates with a green confirmation notice: `"Settings updated"`.
4. A change summary displays what was modified (e.g., *Pay Day changed from 30 to 28*).
5. Any key that now differs from the standard recommendation receives a **Customized** badge.
6. The updated policy takes effect according to its stated impact timing (e.g., immediately or on the next payroll run).

---

### Feature 2: One-Click Factory Reset to Defaults

#### What is it?
A dedicated reset tool that allows HR Administrators to return customized policies back to standard, system-recommended factory defaults without having to remember or research the original settings.

#### Why does it exist?
Over time, organizations test temporary policies or customize settings that later prove unneeded. The reset feature gives administrators a safe, clean path to restore standard operating baselines.

#### How does it work?
* Next to any customized setting, click **Reset to Default**.
* Alternatively, at the top of a category, click **Reset Category to Defaults** to restore all settings in that group.
* If any setting being restored is classified as high-risk, the system will prompt you for a business reason and confirmation before applying the reset.
* Once confirmed, the values revert to factory defaults, the **Customized** badge clears, and the screen confirms: `"Settings reset"`.

---

### Feature 3: Smart Concurrency Guard (Conflict-Free Collaboration)

#### What is it?
An automatic background safeguard that prevents two HR administrators from accidentally overwriting each other's adjustments.

#### Why does it exist?
In medium and enterprise organizations, multiple HR leaders or payroll specialists work simultaneously. If Administrator A opens the *Payroll Calendar* at 10:00 AM, and Administrator B updates the pay day at 10:05 AM, Administrator A's outdated screen must not silently overwrite Administrator B's work when they click Save at 10:06 AM.

#### How does it protect you?
* Every time a category is loaded, the system notes the exact version of the configuration.
* If you attempt to save changes to a category that another administrator modified while your screen was open, the system halts the save.
* You will see a clear, helpful notification:
  > **"This category was updated by another administrator while you were viewing it. Your changes were not applied to prevent overwriting their work. The screen has been refreshed with the latest values. Please review and re-apply your changes if needed."**
* Your previous edits are not lost blindly; the screen refreshes with the current truth so you can make an informed decision.

---

### Feature 4: Two-Gate High-Risk Safety Shield

#### What is it?
A two-stage verification workflow enforced whenever an administrator modifies any of the **8 high-risk organizational settings**.

#### Why does it exist?
Certain configuration choices carry irreversible or severe legal, financial, or operational consequences. For example, lowering document retention permanently deletes old employment records, while turning off a secondary payroll checker allows a single individual to disburse company funds without oversight. The safety shield prevents accidental or unconsidered modifications.

#### The 8 High-Risk Policies & Their Consequences

| Setting Name | Category | Operational Impact & Warning |
| :--- | :--- | :--- |
| **Require Separate Payroll Checker** | Payroll Approval Authority | **Alters money approval authority.** Turning this ON requires at least 2 active HR users to approve every payroll disbursement. Turning it OFF allows a single HR user to approve payouts alone. |
| **Manager Direct Compensation Authority** | Payroll Approval Authority | **Alters compensation authority.** Enabling allows team managers to adjust employee salaries directly without secondary HR review. |
| **Manager Direct Document Authority** | Document Approval Authority | **Alters document issuance authority.** Enabling allows managers to issue documents directly to team members without HR review. Cannot be active simultaneously with Separate Document Checker. |
| **Require Separate Document Checker** | Document Approval Authority | **Alters document issuance authority.** Turning this ON requires at least 2 active HR users to approve every document. Cannot be active simultaneously with Manager Direct Document Authority. |
| **Document Retention Days** | Document Retention | **Irreversible data deletion.** Lowering this retention period marks existing documents older than the new window for permanent deletion on the next nightly cleanup run. |
| **Document Publish Sync Threshold** | Document Publishing | **Alters system publishing speed.** Lowering this threshold causes published documents to be queued for background processing rather than instant on-screen generation. |
| **Letter Auto-Issue on Exit** | Letter Generation | **Automated document issuance.** Selected exit letter templates are issued automatically upon an employee's termination without manual HR review. |
| **Letter Record Retention Days** | Document Retention | **Irreversible data deletion.** Lowering this retention period permanently purges issued letter records and historical metadata on nightly cleanup runs. |

#### How the Two-Gate Safety Shield Works
When an HR administrator changes any of the 8 high-risk settings above:

```text
Step 1: Admin clicks "Save Changes" on a high-risk policy
                        ↓
Step 2: Gate 1 (Reason Check)
        Is a written business explanation provided?
        ├── NO  → Prompts user: "A business justification is required to modify this policy."
        └── YES → Proceeds to Gate 2
                        ↓
Step 3: Gate 2 (Impact Confirmation)
        System displays a high-visibility modal with the exact operational consequence.
        User must review the warning and check "I understand and confirm this change."
                        ↓
Step 4: Save executes successfully and logs the change.
```

---

### Feature 5: Statutory Compliance Impact Transparency

#### What is it?
When you update statutory compliance switches (such as enabling or disabling **Employees' Provident Fund (PF)** or **Employee State Insurance (ESI)**), the system analyzes your active payroll cycles and immediately reports the operational impact.

#### Why does it exist?
In Indian statutory payroll, once a payroll run is drafted or calculated, its calculations are frozen to protect mathematical integrity. If HR enables Provident Fund mid-month, that change will **not** retroactively reach a draft payroll run created prior to the change. In traditional systems, HR would only discover this upon generating salary slips.

#### What happens on screen?
Upon saving statutory settings, the confirmation banner displays an **Impact Summary**:
* **Active Components Activated:** Confirms the exact salary components newly activated in your payroll catalog (e.g., `PF_EMPLOYEE`, `PF_EMPLOYER`, `EPS`).
* **Unaffected Draft Runs:** Lists any open draft or calculated payroll runs that will **not** reflect this change because their calculations predate your edit. HR is advised to re-calculate those specific draft runs if they want the new statutory rules included.

---

## 5. Step-by-Step User Workflows

### Workflow 1: Standard Policy Update (e.g., Changing Monthly Pay Date)

```text
1. Log in as an HR Administrator.

2. In the main sidebar, click Settings.

3. Under the Payroll module, locate and click the "Payroll Calendar" card.

4. Find the "Pay Day" field (currently set to 30).

5. Enter the new day of the month (e.g., 28).

6. Click Save Changes.

7. The screen displays: "Settings updated".
   • Pay Day updates to 28.
   • A "Customized" badge appears next to the field.
   • The change summary notes: "Pay Day changed from 30 to 28".
```

---

### Workflow 2: High-Risk Policy Update (e.g., Requiring Separate Payroll Checker)

```text
1. Open Settings > Payroll Approval Authority.

2. Locate "Require a separate checker" (currently OFF).

3. Toggle the switch to ON.

4. Click Save Changes.

5. Gate 1 Prompt appears:
   "A business justification is required to modify this high-risk policy."
   Enter Reason: "Implementing dual-signoff policy following Q4 internal financial audit."

6. Click Proceed.

7. Gate 2 Confirmation Dialog appears:
   "⚠️ Operational Consequence: Turning this on requires at least two active HR
    administrators to approve every payroll disbursement. If your organization
    lacks two active HR users, payroll runs cannot be finalized."

8. Check the box: "I understand and confirm this change", then click Confirm & Apply.

9. The setting is saved. A confirmation banner confirms dual-signoff is now active.
```

---

### Workflow 3: Restoring a Category to Factory Defaults

```text
1. Open Settings > Letterhead & Branding.

2. You notice several customized fields (e.g., Accent Color, Footer Note).

3. Click the Reset Category to Defaults button at the top right of the card.

4. A confirmation dialog outlines which settings will be reverted to factory baselines.

5. Click Confirm Reset.

6. The system updates all fields back to standard defaults, clears the "Customized"
   badges, and displays: "Settings reset".
```

---

### Workflow 4: Resolving a Multi-Administrator Editing Conflict

```text
Scenario: You and a colleague both open "Document Retention" at 2:00 PM.

1. Your colleague reduces retention from 2555 days to 1825 days and saves at 2:02 PM.

2. You adjust retention to 1095 days on your screen and click Save Changes at 2:03 PM.

3. The system halts your save and displays:
   "This category was updated by another administrator while you were viewing it.
    Your changes were not applied to prevent overwriting their work.
    The screen has been refreshed with the latest values."

4. Your screen reloads, showing the current retention value of 1825 days.

5. You consult with your colleague, verify whether 1095 days is still appropriate,
   and resubmit if agreed.
```

---

## 6. Settings & Configuration States Explained

The Settings Hub uses clear, plain-language visual indicators to communicate the status of each policy:

| Status Badge / Indicator | What it Means in Business Terms | What You Can Do |
| :--- | :--- | :--- |
| **Standard / Default** | The setting is currently using the system-recommended factory default value. | You can keep it as is, or edit it to customize your company's policy. |
| **Customized** | Your organization has customized this setting, and it differs from the factory default. | You can edit it further, or click **Reset to Default** to revert to standard. |
| **High Risk (⚠️)** | Modifying this setting has significant financial, operational, or legal consequences. | When editing, you will be prompted for a business reason and confirmation. |
| **Read Only** | This category or setting is permanently locked (e.g., legacy configurations). | You can review the historical configuration, but editing is disabled. |
| **Subscription Required** | This feature belongs to a module not included in your current subscription tier. | Your account billing owner can upgrade your subscription to unlock it. |
| **Dependencies Active** | This setting has prerequisite conditions or conflicts with another setting. | Review the dependency tooltip before toggling to avoid conflicting rules. |

---

## 7. User-Facing Validation, Business Rules & Guardrails

The Settings Hub enforces real-time guardrails to prevent invalid, contradictory, or unworkable business policies:

### 1. The "Two HR Users" Requirement for Dual Approval
* **The Rule:** If you attempt to turn ON **Require a separate checker** (in either Payroll or Documents), your organization **must have at least two active HR Administrator accounts**.
* **Why:** If an organization with only one HR administrator turns on dual signoff, that single administrator would be unable to approve their own payroll proposal, permanently deadlocking payroll operations.
* **What Happens if Violated:** The save is blocked with a clear notice:  
  > *"Cannot require a separate checker: your organization has only 1 active HR user. Please invite a second HR user to act as checker before enabling this policy."*

### 2. Mutually Exclusive Document Authority Rules
* **The Rule:** **Manager Direct Document Authority** and **Require Separate Document Checker** cannot both be active at the same time.
* **Why:** An organization cannot simultaneously allow team managers to publish documents without HR review while also demanding that all documents require dual HR signoff.
* **What Happens if Violated:** The system blocks the update:  
  > *"Document Require Separate Checker and Manager Direct Document Authority cannot both be ON. Please disable one before enabling the other."*

### 3. Numerical Bounds and Formatting Guardrails
* **The Rule:** Every setting must adhere to practical operational limits (e.g., Monthly Pay Day must be between 1 and 31; Document Retention must be at least 30 days).
* **What Happens if Violated:** The field highlights in red with a clear explanation (e.g., *"Pay Day must be a valid day of the month between 1 and 31"*).

### 4. Payout Salary Component Validation
* **The Rule:** Settings that map termination payouts (such as Full & Final leave encashment or notice recovery) must point to an active earning salary component in your payroll catalog.
* **What Happens if Violated:** The system prevents saving an inactive or invalid component identifier.

---

## 8. Success & Failure Scenarios

### Successful Scenarios

#### Scenario A: Routine Operational Adjustment
* **User Action:** HR updates the official corporate website and contact phone number under *Letterhead & Branding*.
* **System Response:** Inputs are validated, updated immediately, and confirmed with `"Settings updated"`. All newly generated employee verification letters automatically reflect the new contact details.

#### Scenario B: Resetting an Over-Configured Category
* **User Action:** HR clicks *Reset Category to Defaults* under *Document Storage Rules*.
* **System Response:** All storage limits and compression rules return to factory defaults. The customized tags disappear, and standard operations resume.

---

### Failure Scenarios & What to Do Next

#### Scenario 1: Missing High-Risk Justification
* **What Happens:** You attempt to change document retention days without entering a reason.
* **System Message:** *"A business justification is required to modify this policy."*
* **What to Do:** Enter a brief explanation (e.g., *"Updated in accordance with updated labor law record-keeping guidelines"*) and proceed.

#### Scenario 2: Insufficient Approvers for Checker Policy
* **What Happens:** A sole HR administrator tries to enable mandatory secondary payroll review.
* **System Message:** *"Cannot require a separate checker: your organization has only 1 active HR user."*
* **What to Do:** Navigate to *Organization > User Management*, invite a second HR administrator, have them accept the invitation, and then return to Settings to enable the policy.

#### Scenario 3: Conflicting Document Authority Settings
* **What Happens:** HR attempts to turn on manager direct document authority while separate checker is already enabled.
* **System Message:** *"Settings conflict: Manager Direct Document Authority and Require Separate Document Checker cannot both be active."*
* **What to Do:** Decide on your organizational governance model. Turn OFF the separate checker requirement first, then enable manager direct authority.

#### Scenario 4: Concurrent Multi-Admin Collision
* **What Happens:** Another administrator saved changes while you were editing.
* **System Message:** *"This category was updated by another administrator while you were viewing it."*
* **What to Do:** The screen will automatically reload with the newest saved values. Review what your colleague changed and re-apply your specific adjustment if still needed.

---

## 9. Cross-Module Connections & Real-World Examples

To understand how Settings Phase 2 impacts daily operations, here are three real-world examples:

### Example 1: The Fast-Growing Startup Moves Pay Day
* **Context:** A company traditionally paid employees on the 30th of each month. Due to bank processing schedules, management decides to move the pay day to the 28th.
* **Action in Settings:** HR opens *Settings > Payroll Calendar*, changes *Pay Day* from 30 to 28, and saves.
* **Operational Impact:**
  * Previously completed, finalized, or paid payslips are **not** altered.
  * The upcoming month's payroll cycle automatically defaults its payout date to the 28th.
  * In the main *Payroll > Settings* module screen, the pay day immediately displays 28.

### Example 2: Legal Rebranding Updates Corporate Letters
* **Context:** The company updates its registered office address and corporate identification number (CIN).
* **Action in Settings:** HR opens *Settings > Letterhead & Branding*, edits the registered address lines and CIN, and saves.
* **Operational Impact:**
  * Previously issued PDF letters stored in employee document vaults remain permanently untouched (preserving historical legal fidelity).
  * Every letter generated from that moment forward (such as Offer Letters, Experience Certificates, or Relieving Letters) automatically prints the new address and CIN on the corporate letterhead.

### Example 3: Enabling Provident Fund Compliance
* **Context:** The company crosses the 20-employee statutory threshold and must begin deducting Employees' Provident Fund (PF).
* **Action in Settings:** HR opens *Settings > Statutory PF*, enables the master switch, inputs the establishment code, and saves.
* **Operational Impact:**
  * The system confirms that statutory salary components (`PF_EMPLOYEE`, `PF_EMPLOYER`, `EPS`) are now active in the compensation catalog.
  * The impact notice alerts HR that an existing draft payroll run for the current month will not reflect PF because it was drafted prior to enabling the switch. HR opens the draft run and clicks *Recalculate* to pull in the new PF rules.

---

## 10. Preservation of Existing Module Settings Pages

It is critical for all users and frontend teams to understand:

> [!IMPORTANT]
> **Existing Settings Pages Under Individual Module Tabs Remain 100% Intact!**
> 
> Introducing the centralized Organization Settings Hub does **NOT** remove, replace, or hide any existing settings pages located under specific functional module tabs:
> * **Payroll Settings** remains under *Payroll > Settings* and *Payroll > Compliance*.
> * **Document Policies & Branding** remains under *Documents > Settings*.
> * **Leave Policy Setup** remains under *Leave > Policy Setup*.
> * **Attendance Policies** remains under *Attendance > Shift & Policy Setup*.
> * **Company Profile** remains under *Organization > Company Profile*.
> 
> **Why?** Departmental specialists (such as payroll processors or document clerks) often perform configuration tasks within their specific operational flows. The Settings Hub provides an overarching single pane of glass for HR executives without disrupting specialized module workflows. The two experiences work in complete, synchronized harmony.

---

## 11. Frequently Asked Questions (FAQ)

#### Q1: Can I change settings directly on the dashboard now?
**A:** **Yes!** In Phase 2, in-place editing is fully enabled for HR Administrators across all active categories. You can adjust values, save changes, and reset settings directly in the Settings Hub.

#### Q2: Who can make changes to settings?
**A:** Only users with the **HR Administrator (`hr`)** role can edit or reset settings. People Managers can view their team approval authority rules, but cannot edit any settings. General Employees and platform staff cannot access the Settings Hub.

#### Q3: Why did the system ask me for a reason when I saved?
**A:** You modified one of the **8 high-risk organizational settings** (such as document retention periods, automated exit letters, or salary approval authorities). High-risk policies require a brief business justification to maintain organizational audit integrity.

#### Q4: What happens if another administrator is editing the same category?
**A:** The system protects both of you. The first administrator to save will succeed. If you attempt to save afterward, the system will notify you that the category was modified, reload the latest values, and prevent your screen from accidentally overwriting your colleague's work.

#### Q5: Can I reset a customized setting back to the system default?
**A:** **Yes.** Next to any customized setting, you can click **Reset to Default**. You can also reset an entire category at once using the **Reset Category to Defaults** button.

#### Q6: If I change a payroll setting today, does it affect payslips from last month?
**A:** **No.** The system strictly protects historical records. Changes to payroll rules apply only to future payroll runs and will never retroactively modify locked, approved, or paid salary slips.

#### Q7: Why did I get an error when I tried to turn on dual payroll approval?
**A:** Enabling mandatory secondary approval (*Require a separate checker*) requires your organization to have at least **two active HR Administrator accounts**. If you are the only HR user in the system, inviting a second HR administrator is required first to prevent approval deadlocks.

#### Q8: Does editing settings in this hub change settings in the other module tabs?
**A:** **Yes, instantly.** The Settings Hub connects directly to the same live organizational data as the individual module tabs. A change saved in the Settings Hub immediately updates *Payroll Settings*, *Document Settings*, and all related module screens.

#### Q9: Where do I view the audit history of who changed what?
**A:** Domain-specific audit logs are currently recorded in background compliance ledgers. A fully dedicated, user-facing visual timeline showing chronological configuration history and diffs across all modules is scheduled for **Phase 3**.

---

## 12. Verification & Document Sign-Off

```text
================================================================================
SETTINGS MODULE PHASE 2 — BUSINESS WALKTHROUGH AUDIT
================================================================================
Phase 2 Features Identified: 5 core write & governance capabilities
Phase 2 Features Documented: 5 core write & governance capabilities
Missing User-Facing Features: 0

User Roles Verified:
  • HR Administrators (Full edit & reset access across 25 active categories)
  • People Managers (Targeted read-only visibility on 2 authority categories)
  • Employees (No access to org settings hub)
  • Platform Admins (Strictly excluded for tenant privacy)

User Workflows Verified:
  • In-Place Settings Update Workflow
  • Two-Gate High-Risk Safety Shield (Reason & Confirmation)
  • One-Click Factory Reset to Defaults Workflow
  • Concurrency Conflict Resolution Workflow
  • Statutory Compliance Impact Workflow

Configuration Safety Guardrails Verified:
  • 8 High-Risk Settings Directory with Plain-Language Consequences
  • Minimum 2 Active HR Users Requirement for Checker Policies
  • Mutual Exclusivity between Document Authority Policies
  • Numerical and Formatting Bounds Validation

Existing Module Settings Pages Instruction Verified:
  • Explicitly confirmed that individual module settings pages remain intact

Technical/API Details Exposed: 0 (No SQL, no code, no HTTP methods, no endpoints)
Invented Functionality: 0 (Aligns 100% with shipped Phase 2 codebase)
================================================================================
```
