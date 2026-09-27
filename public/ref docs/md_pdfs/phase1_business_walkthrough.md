# Phase 1: PDF Generation Module (Letter Branding & Templates) — Business Walkthrough & User Guide

This document provides a comprehensive, user-facing business guide to **Phase 1 of the PDF Generation Module**. It explains how the automated document generation system operates, the business and compliance challenges it solves, and how Human Resources (HR) administrators configure corporate letterheads, upload official branding assets, manage letter templates, and preview print-ready corporate letters.

This guide is written in clear, non-technical business language for HRMS users, company leadership, and operational stakeholders. It describes the exact user experience, workflows, permissions, and safeguards implemented in Phase 1 without exposing internal source code or developer-only technical details.

---

## 🚀 What PDF Generation Phase 1 Provides

In modern enterprise operations, issuing official corporate letters—such as employment offers, experience certificates, and verification documents—is a critical, daily HR responsibility. Historically, HR teams relied on manual word processors, physical paper stationery, or disparate desktop tools. This created brand inconsistency, formatting errors, accidental disclosure of outdated company identifiers, and unrecorded document distribution.

**Phase 1 establishes the centralized, automated Letter Generation Core for the organization.** It delivers:

* **Official Organization Letterhead & Identity:** A dedicated administrative interface for HR to define and maintain the organization's official letterhead identity—including authorized signatories, registered office addresses, statutory corporate identifiers (CIN, GSTIN, PAN, TAN), contact channels, and brand styling colors.
* **Direct High-Resolution Branding Uploads:** High-security, direct-to-cloud upload capabilities for the official corporate logo and authorized signatory signature, ensuring pixel-perfect printing without image pixelation or distortion.
* **Standard Letter Template Catalog:** An out-of-the-box platform library of standard, legally compliant corporate letter templates:
  1. **Experience Letter (Service / Relieving Certificate)**
  2. **Appointment Letter (Employment Offer with Compensation Breakdown)**
  3. **Bonafide Letter (Formal Proof of Employment for Banks and Visas)**
* **Pre-Saved Organizational Defaults:** The ability for HR to pre-configure standard corporate defaults (such as default "Place of Issue", "HR Verification Contact Line", or "Offer Acceptance Notes") per template, eliminating repetitive data entry for HR staff.
* **Live Visual Test & Preview Engine:** A one-click preview engine that generates an instant, print-ready A4 PDF directly in the browser. This allows HR to visually inspect branding alignment, margin balances, and table formatting before rolling out templates for operational issuance.
* **Dual-Mode Letterhead Support (Digital vs. Pre-Printed Stationery):** Support for both fully digital PDF generation (rendering headers, logos, and signatures) and physical pre-printed stationery mode (leaving clean, unprinted margins so letters can be fed through office printers loaded with expensive embossed company paper).
* **Compliance & Safety Watermarking:** All draft previews automatically carry a prominent diagonal "PREVIEW" watermark, ensuring unissued drafts cannot be mistakenly circulated or accepted as official corporate instruments.

---

## 👥 Who Can Use Phase 1? (Role Access Matrix)

Phase 1 focuses on administrative governance, template configuration, and visual verification. Access is strictly controlled based on the user's role within the organization:

| Role | Access Level in Phase 1 | Business Responsibilities & Available Capabilities |
| :--- | :---: | :--- |
| **HR Administrator** | **Full Administrative Access** | Can configure company letterhead details, upload logos and signatures, activate/deactivate letter templates, save corporate field defaults, and generate live PDF previews. |
| **People Manager** | **No Access in Phase 1** | Managers cannot access letterhead or template configuration screens. *(In Phase 4, managers will gain the ability to request and recommend official letters for their direct reports).* |
| **Employee** | **No Access in Phase 1** | Employees cannot configure company branding. *(In Phase 2, employees will gain self-service access to view, download, and digitally acknowledge formal letters issued to them).* |
| **Platform Administrator / Super Admin** | **No Access** | Under strict privacy and tenant-isolation rules, platform administrators have no access to company letterheads or employee records. Document governance belongs exclusively to the employer's HR team. |

---

## 🔑 Key Business Concepts & Rules

To get the most out of Phase 1, HR administrators should understand the core business principles governing letter generation:

### 1. The Letterhead Identity Model
Corporate letters must reflect legal and statutory authority. The system separates the **Letterhead** (the framing identity: logo, header, address, statutory numbers, signatory, footer) from the **Letter Body** (the template text and recipient details).
* Whenever a letter is generated, the system dynamically composites the active corporate letterhead around the letter text.
* Updating the letterhead in one central place instantly updates all future generated letters across the entire company.

### 2. Digital Letterhead vs. Pre-Printed Stationery Mode
Organizations handle paper distribution differently:
* **Digital Mode (Default):** The system composites the complete header, company logo, address lines, corporate identification numbers, and authorized signature directly onto the page. Ideal for digital distribution via email or employee portals.
* **Pre-Printed Stationery Mode:** Some organizations purchase physical, pre-printed stationery with gold-embossed crests or pre-printed headers. If HR disables letterhead branding, the system suppresses the digital header, logo, and footer, leaving a balanced blank margin at the top and bottom so the text aligns perfectly when fed through physical office printers.

### 3. Smart Fallbacks (Profile Inheritance)
To make setup fast and effortless, the letterhead configuration automatically inherits baseline company information (such as Registered Legal Name, Address, GST Number, PAN, and Corporate Website) from your organization's general profile. HR only needs to enter overrides if official letterhead text differs from basic billing details.

### 4. Mandatory Diagonal "PREVIEW" Watermark
In Phase 1, the system generates **sample visual previews only**. Every preview PDF rendered carries a prominent, diagonal, semi-transparent `PREVIEW` watermark across every page. This safeguard prevents test PDFs from being downloaded, emailed, or presented to banks, embassies, or government bodies as valid corporate certificates before formal issuance is unlocked in Phase 2.

### 5. Privacy by Design (Synthetic Sample Data)
To ensure complete confidentiality, Phase 1 previews utilize **synthetic sample data** (such as *"Asha Sample"*, Senior Software Engineer) rather than real employee records. This ensures HR administrators can test, redesign, and preview letter templates freely without exposing real employee salaries, dates, or personal facts to test environments.

---

## 🏢 1. Setting Up Company Letterhead & Branding

The **Letterhead & Branding** screen is the command center where HR establishes the visual and legal identity for all generated corporate letters.

---

### 1.1 Managing Letterhead Details
* **Where to Find It:** Navigate to **HR Management > Document Settings > Letterhead & Branding**.
* **What You See:** A clean administrative form displaying current letterhead settings, corporate identifiers, signatory details, and upload boxes for the corporate logo and signature.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Letterhead & Corporate Branding Setup                                 │
├────────────────────────────────────────────────────────────────────────┤
│  [✓] Enable Digital Letterhead on Generated Letters                   │
│                                                                        │
│  Authorized Signatory:                                                 │
│  Full Name: [ Rajesh Sharma                              ]             │
│  Official Designation: [ Director of Human Resources     ]             │
│                                                                        │
│  Registered Corporate Address (Max 5 lines):                           │
│  Line 1: [ Tower B, 9th Floor, Tech Park                 ]             │
│  Line 2: [ Outer Ring Road, Bellandur                    ]             │
│  Line 3: [ Bengaluru, Karnataka 560103                   ]             │
│                                                                        │
│  Corporate Identifiers:                                                │
│  CIN:   [ U72200KA2020PTC123456 ]   GSTIN: [ 29ABCDE1234F1Z5 ]         │
│  PAN:   [ ABCDE1234F            ]   TAN:   [ BLRE12345F      ]         │
│                                                                        │
│  Contact Information:                                                  │
│  Email: [ hr@acme-corp.com      ]   Phone: [ +91 80 4123 4567 ]        │
│  Website: [ https://www.acme-corp.com                    ]             │
│                                                                        │
│  Visual Styling & Footer:                                              │
│  Brand Accent Color: [ #1E40AF ] (Deep Navy Blue)                      │
│  Footer Disclaimer:                                                    │
│  [ This is a computer-generated letter and requires an authorized ]    │
│  [ digital signature.                                             ]    │
│                                                                        │
│  [ Save Letterhead Changes ]               [ Preview Letterhead ]      │
└────────────────────────────────────────────────────────────────────────┘
```

* **Step-by-Step Workflow:**
  1. Open **Letterhead & Branding**.
  2. Ensure the **"Enable Digital Letterhead"** checkbox is checked (unless your company uses pre-printed stationery).
  3. Enter the **Authorized Signatory Name** and **Official Designation** (e.g., *"Rajesh Sharma"*, *"Director of Human Resources"*).
  4. Enter the **Registered Corporate Address** across up to 5 clear lines. Leave unnecessary lines blank.
  5. Enter the company's statutory identifiers: **CIN**, **GSTIN**, **Company PAN**, and **TAN**.
  6. Specify official contact details: **Contact Email**, **Phone Number**, and **Secure Website URL** (must begin with `https://`).
  7. Choose a **Brand Accent Color** matching your corporate branding (e.g., `#1E40AF` for Deep Navy Blue or `#0D9488` for Teal). This color is applied to decorative divider lines, table headers, and emphasis boxes.
  8. Enter an optional **Footer Disclaimer Note** (e.g., *"Confidential — Acme Technologies Pvt Ltd"*).
  9. Click **"Save Letterhead Changes"**.
* **What Happens Next:** The system immediately saves your settings. All future letter previews will reflect these details.
* **Important Guardrails:**
  * **No Code or Angle Brackets:** Text fields cannot contain HTML code, `<` or `>` characters. The system strictly rejects them to ensure visual safety and formatting stability.
  * **Secure Websites Only:** The website address must use secure `https://`. Standard `http://` addresses are rejected.
  * **Address Cap:** Registered address is capped at a maximum of 5 lines to prevent page header overflow.

---

### 1.2 Uploading Company Logo and Signatory Signature
Official letters require high-quality corporate branding and authorized signatures.

```
┌───────────────────────────────────┐     ┌───────────────────────────────────┐
│  Company Logo                     │     │  Authorized Signature             │
├───────────────────────────────────┤     ├───────────────────────────────────┤
│  [ Current Logo: crest_logo.png ] │     │  [ Current Signature: sign.png  ] │
│  Format: PNG / JPEG (Raster only) │     │  Format: PNG / JPEG (Raster only) │
│  Max Size: 512 KB                 │     │  Max Size: 256 KB                 │
│                                   │     │                                   │
│  [ Upload New Logo ]              │     │  [ Upload New Signature ]         │
└───────────────────────────────────┘     └───────────────────────────────────┘
```

* **Requirements for Official Images:**
  * **Company Logo:** Must be a raster image (**PNG** or **JPEG**). Maximum file size is **512 KB**. Transparent background PNGs are strongly recommended for crisp rendering.
  * **Authorized Signature:** Must be a raster image (**PNG** or **JPEG**). Maximum file size is **256 KB**. Cropped closely around the ink signature with a transparent background.
  * **Prohibited File Types:** Vector graphics (such as **SVG**) are strictly prohibited to prevent formatting corruption and security risks.
* **Step-by-Step Upload Workflow:**
  1. Under the Company Logo or Signature section, click **"Upload New File"**.
  2. Select your image file from your computer.
  3. The system directly transfers the image to high-security cloud storage.
  4. The system automatically inspects the uploaded file, verifies that it does not exceed the size limit, and confirms that it is a valid PNG or JPEG image.
  5. The UI updates immediately, displaying a green **"Asset Confirmed"** indicator and thumbnail preview.
* **What Can Go Wrong?**
  * If you select an SVG, PDF, or unsupported file type, the upload is rejected with a message stating that only PNG or JPEG images are permitted.
  * If the image exceeds 512 KB (logo) or 256 KB (signature), the system alerts you that the file is too large. Compress the image before uploading.

---

### 1.3 Testing Your Letterhead with a Live Preview
* **Purpose:** Verify that your logo, address lines, colors, and signatory block look balanced and professional before creating or sending real letters.
* **How to Run It:**
  1. On the **Letterhead & Branding** screen, click **"Preview Letterhead"**.
  2. The system compiles your branding identity into a sample A4 document and renders the PDF in a new browser tab or inline viewer.
  3. Inspect the document:
     * Check that the logo appears sharp and appropriately sized.
     * Confirm that the registered address lines and contact details wrap cleanly.
     * Verify that statutory numbers (CIN, GSTIN, PAN, TAN) are accurate.
     * Check that the brand accent color matches your company style guide.
     * Confirm the authorized signatory title and signature placement.
  4. Notice the prominent diagonal **"PREVIEW"** watermark across the center of the page.
* **Hourly Limit:** To ensure consistent performance for all administrators, preview generation is subject to an organization hourly quota (default: 60 previews per clock hour). If exceeded, simply wait for the next clock hour to continue previewing.

---

## 📜 2. Managing Letter Templates

Templates define the legal structure, paragraphs, tables, and signature blocks of corporate letters. In Phase 1, HR can browse standard templates, activate the ones needed, and pre-populate organization defaults.

---

### 2.1 The Standard Letter Catalog
Navigate to **HR Management > Document Settings > Letter Templates**.

The system provides three standard templates out-of-the-box:

| Template Code | Template Title | Business Purpose & Description | Standard Layout Structure |
| :--- | :--- | :--- | :--- |
| **`experience_letter`** | **Experience Letter** | Issued to departing or former employees certifying their tenure, designation, dates of service, and conduct. | Formal letterhead, date of issue, recipient name, service paragraph (joining date, exit date, designation, department), concluding conduct note, authorized signatory closing. |
| **`appointment_letter`** | **Appointment Letter** | Formal employment offer and appointment contract detailing position, joining date, annual CTC, and structured salary components. | Letterhead, reference number, employee designation, reporting manager, probation period, structured **Compensation Breakdown Table** (Basic Salary, HRA, Allowances, PF), acceptance note, signature closing. |
| **`bonafide_letter`** | **Bonafide Letter** | Official certificate confirming active employment, requested by employees for bank loans, credit cards, passport verifications, or foreign visa applications. | Letterhead, date of issue, employee identification code, active designation, specific declared purpose (e.g. visa application), official certification closing. |

---

### 2.2 Enabling or Disabling Templates
Not every company uses all three templates immediately. HR can control which templates are active:
1. Locate the template in the catalog table.
2. Toggle the **Enable / Disable** switch.
3. Click **"Save Changes"**.
* **What Happens:** When a template is disabled (`Inactive`), HR issuers cannot preview or issue that letter. Previews will clearly notify HR that the template has been deactivated by company policy.

---

### 2.3 Configuring Pre-Saved Corporate Defaults
In everyday HR operations, certain letter fields are identical for every employee in a particular office (for example, the *Place of Issue* is always "Bengaluru, India", or the *Verification Contact Line* always directs inquiries to "verifications@company.com").

Phase 1 allows HR to **pre-save these defaults once at the organizational level**, eliminating repetitive manual typing:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Configure Template: Experience Letter                                │
├────────────────────────────────────────────────────────────────────────┤
│  Template Status: [✓] Enabled for Organization                         │
│  Template Version: Version 1 (Latest)                                  │
│                                                                        │
│  Organization Pre-Saved Defaults:                                      │
│  These fields will be automatically filled whenever this letter is     │
│  prepared, saving time for HR staff.                                   │
│                                                                        │
│  Place Of Issue:                                                       │
│  [ Bengaluru, India                                            ]       │
│  (Max 80 characters)                                                   │
│                                                                        │
│  HR Contact / Verification Note:                                       │
│  [ For verification inquiries, email verifications@acme-corp.com ]     │
│  (Max 160 characters)                                                  │
│                                                                        │
│  [ Save Configuration ]                  [ Preview Letter Template ]   │
└────────────────────────────────────────────────────────────────────────┘
```

* **Step-by-Step Configuration:**
  1. Click **"Configure"** next to the desired template (e.g., *Experience Letter*).
  2. Review the **Form Fields** presented. The system displays exact descriptions and character limits.
  3. Enter your standardized company defaults in the available fields:
     * **Experience Letter:** Set default `Place of Issue` and `HR Contact Line`.
     * **Appointment Letter:** Set default `Place of Issue` and `Offer Reference Note`.
     * **Bonafide Letter:** Set default `Place of Issue`.
  4. Click **"Save Configuration"**.
* **Result:** Whenever a letter preview or issuance occurs, the system automatically pulls these pre-saved defaults.

---

### 2.4 Live Visual Preview of a Letter Template
* **Purpose:** Inspect the complete end-to-end letter layout—including your company letterhead, pre-saved defaults, and sample employee information—in print-ready A4 format.
* **How to Run It:**
  1. On the Template Configuration screen, click **"Preview Letter Template"**.
  2. The system blends three layers of information:
     $$\text{Sample Employee Facts} \quad + \quad \text{Saved Company Defaults} \quad + \quad \text{Active Letterhead Branding}$$
  3. The rendered PDF opens instantly in your browser viewer.
  4. Inspect the document:
     * **Page Balance:** Ensure the letter text sits comfortably between the company header and footer.
     * **Tables (Appointment Letter):** Confirm the compensation table columns, borders, and currency alignments look clean.
     * **Signatory:** Check the authorized signatory name, title, and signature at the bottom.
     * **Watermark:** Verify the semi-transparent diagonal **"PREVIEW"** watermark is present.
* **Optional: Testing with Ad-Hoc Overrides:**
  * HR administrators can test how a template behaves with custom text (e.g., test an unusually long job title or different branch city) without changing saved company defaults.
  * Enter temporary test values in the preview modal and click **"Generate Test Preview"**. The temporary values will appear on that specific PDF preview only.

---

## 🖨️ 3. Physical Pre-Printed Stationery Mode

Many organizations have physical pre-printed letterhead paper loaded into their physical office printers. Printing a document that already has digital headers and logos onto pre-printed stationery causes double-printing, misaligned text, and ruined paper.

Phase 1 provides complete support for **Pre-Printed Stationery Printing**:

### How to Enable Pre-Printed Stationery Mode:
1. Open **HR Management > Document Settings > Letterhead & Branding**.
2. Uncheck **"Enable Digital Letterhead on Generated Letters"**.
3. Click **"Save Letterhead Changes"**.

### What Happens When Pre-Printed Mode is Active:
* The system suppresses the digital corporate header, company logo, registered address, statutory numbers (CIN/GSTIN), and footer disclaimers.
* The system reserves **exact blank top and bottom margins** on the A4 page.
* When the letter is printed on physical company letterhead paper, the text begins cleanly below the embossed company crest and ends neatly above the pre-printed footer.

---

## 🛡️ 4. Security, Quality & Compliance Guardrails

Phase 1 incorporates several enterprise safeguards to ensure regulatory compliance and operational safety:

### 1. Mandatory Diagonal Watermark
* Every single preview PDF generated in Phase 1 carries a semi-transparent diagonal **"PREVIEW"** watermark across each page.
* **Why it matters:** This ensures draft previews cannot be circulated, emailed to candidates, or submitted to government bodies as official binding letters prior to formal issuance in Phase 2.

### 2. Zero Real Employee Data in Previews (Privacy by Design)
* Previews utilize synthetic sample data (e.g., *"Asha Sample"*).
* The preview system strictly rejects requests attempting to pass a real employee ID. This ensures complete privacy and zero data leakage during administrative testing.

### 3. Automatic Completeness Protection
* If any required field in a template is missing or blank, the system **refuses to generate the letter**.
* **Why it matters:** Word processors often leave embarrassing placeholders like `[Insert Employee Name]` or blank lines in issued contracts. Our system guarantees that no letter can ever be produced with missing mandatory facts.

### 4. Hourly Preview Rate Limiting
* To protect cloud infrastructure from runaway scripts or accidental double-clicking, organizations have an hourly preview limit (default: 60 previews per hour).
* Normal HR administrators previewing templates occasionally will never notice this limit; it acts as an automated safety net against abuse.

### 5. Sanitized Branding Inputs
* All branding fields and addresses strictly disallow script tags and HTML angle brackets (`<`, `>`).
* Accent colors are strictly validated to 6-digit hex format (e.g., `#1E40AF`), preventing styling corruption.

---

## 🔄 5. Statuses & Visual Indicators

When managing templates and letterheads, HR administrators will encounter the following user-facing statuses:

| Status Indicator | What It Means | Where You See It | Available Actions |
| :--- | :--- | :--- | :--- |
| **`Configured`** | Company letterhead information has been entered and saved. | Branding Setup Screen | Edit settings, Preview Letterhead, Upload new assets. |
| **`Default / Unconfigured`** | Letterhead is using default values inherited from the general company profile. | Branding Setup Screen | Enter specific letterhead overrides and save. |
| **`Logo Present`** | A valid corporate logo image is active in cloud storage. | Branding Media Section | View current logo thumbnail, Upload replacement logo. |
| **`Signature Present`** | An authorized signatory signature image is active in cloud storage. | Branding Media Section | View current signature thumbnail, Upload replacement signature. |
| **`Active / Enabled`** | The letter template is turned ON and available for preview and future issuance. | Template Catalog Table | Configure pre-saved fields, Preview template, Disable template. |
| **`Inactive / Disabled`** | The template is turned OFF for the organization by HR policy. | Template Catalog Table | Enable template, View configuration. Previews are blocked. |
| **`Orphaned / Discontinued`** | A template previously configured in the database has been retired or replaced in the system. | Template Catalog Table | Review historical settings. Cannot be generated. |

---

## 📖 6. Real-World Practical Scenarios

Here are step-by-step walkthroughs of common HR tasks in Phase 1:

---

### Scenario A: Setting Up Corporate Letterhead for the First Time
> **Context:** A newly onboarded company wants to set up its official letterhead so that HR can soon start issuing letters.

1. **Step 1 — Open Settings:** An HR administrator logs in, navigates to **Document Settings**, and opens **Letterhead & Branding**.
2. **Step 2 — Verify Inherited Details:** The administrator notices that the company legal name (*"Acme Technologies Pvt Ltd"*) and PAN (*"ABCDE1234F"*) are already filled in from the corporate profile.
3. **Step 3 — Add Signatory & Address:** The administrator enters the Vice President of HR as the official signatory (*"Priya Nair"*, *"VP - People & Culture"*), enters the 3-line office address in Bengaluru, and inputs the company's CIN and GSTIN numbers.
4. **Step 4 — Select Brand Theme:** The administrator selects `#0D9488` (Teal) to match the company's official corporate website palette.
5. **Step 5 — Upload Media:** The administrator uploads the company's crisp transparent logo (`acme_logo.png`, 140 KB) and Priya Nair's signature image (`priya_sign.png`, 45 KB). Both upload within seconds and display green confirmation badges.
6. **Step 6 — Test Print:** The administrator clicks **"Preview Letterhead"**. An A4 sample PDF opens immediately in the browser. The logo sits crisply in the top left, the address wraps cleanly, and the signature rests above Priya's printed designation. Letterhead setup is complete!

---

### Scenario B: Updating an Authorized Signatory upon Leadership Change
> **Context:** The previous Director of HR has relocated, and a new Head of People has taken over signatory authority.

1. **Step 1 — Open Branding:** HR navigates to **Letterhead & Branding**.
2. **Step 2 — Replace Text Details:** Update the signatory name to *"Amitabh Sen"* and designation to *"Head of People & Culture"*.
3. **Step 3 — Upload New Signature:** Click **"Upload New Signature"** under the signature section. Select Amitabh's signature image (`amitabh_sign.png`).
4. **Step 4 — Save & Verify:** Click **"Save Letterhead Changes"**. Then click **"Preview Letterhead"** to confirm that Amitabh's name, designation, and signature appear cleanly at the bottom of the sample letterhead.
5. **Result:** All future letters generated by any HR user will now automatically bear Amitabh's signature and title.

---

### Scenario C: Customizing and Previewing the Experience Letter
> **Context:** HR wants to ensure that all Experience Letters issued in India standardly display the Bengaluru office as the place of issue and provide the central verification email address.

1. **Step 1 — Open Template Catalog:** Navigate to **Letter Templates** and locate **Experience Letter**.
2. **Step 2 — Configure Pre-Saved Defaults:** Click **"Configure"**.
3. **Step 3 — Enter Defaults:**
   * In **Place Of Issue**, type: `Bengaluru, India`
   * In **HR Contact Line**, type: `For employment verification, contact verifications@acme-corp.com`
4. **Step 4 — Save:** Click **"Save Configuration"**.
5. **Step 5 — Run Visual Preview:** Click **"Preview Letter Template"**.
6. **Step 6 — Inspect Output:** The browser displays a complete Experience Letter with the company's Teal letterhead, synthetic sample employee details (*Asha Sample, Senior Software Engineer*), the pre-saved Bengaluru place of issue, the verification contact note, and a prominent diagonal **PREVIEW** watermark.

---

## ❓ 7. Frequently Asked Questions (FAQ)

### General Questions

#### Q1: What is the main difference between Phase 1 and Phase 2 of PDF Generation?
* **Phase 1 (Current):** Provides the administrative foundation. HR configures letterhead branding, uploads logos/signatures, manages the template catalog, pre-saves organizational defaults, and generates visual test previews. **No real letters are issued to employees yet.**
* **Phase 2 (Upcoming):** Unlocks formal letter issuance to specific employees, automatic reference numbering (e.g., `ACME/EXP/2026/001`), official document creation in the Documents Module, and employee self-service viewing/downloading in the employee portal.

#### Q2: Who has permission to configure letterheads and preview templates?
Only users with the **HR Administrator** role have permission. Employees, managers, and system administrators cannot access letter branding or template configuration screens.

#### Q3: Why does every preview PDF have a large diagonal "PREVIEW" watermark?
The watermark is an essential compliance safeguard. It visually marks the document as a non-binding test draft, preventing unissued sample documents from being mistakenly used as official legal certificates.

---

### Letterhead & Branding Questions

#### Q4: Why can't I upload an SVG file for my company logo?
SVG (Scalable Vector Graphics) files can contain embedded scripts that introduce severe security vulnerabilities and cause inconsistent rendering across different printer models. The system strictly enforces raster images (**PNG** or **JPEG**) to guarantee 100% visual consistency and enterprise-grade security.

#### Q5: What should I do if my logo or signature file is too large?
* The maximum size for a **Company Logo** is **512 KB**.
* The maximum size for an **Authorized Signature** is **256 KB**.
If your image file exceeds these limits, open it in an image editor, crop out unnecessary whitespace, resize it to standard document dimensions (e.g., 600px wide for logos), and re-save as a PNG or JPEG before uploading.

#### Q6: Our company prints letters on physically pre-printed letterhead paper. How should we configure the system?
Open **Letterhead & Branding** and turn **OFF** the toggle labeled **"Enable Digital Letterhead on Generated Letters"**. The system will suppress digital headers, logos, and footers, while reserving clean margins so the text prints perfectly on your physical stationery.

#### Q7: Can I change our brand accent color later?
Yes. You can update your hex accent color at any time in **Letterhead & Branding**. All future previews and generated letters will immediately use the updated color palette.

---

### Template & Preview Questions

#### Q8: Why does the preview show "Asha Sample" instead of a real employee from our company?
Phase 1 intentionally uses **synthetic sample data** to protect employee privacy and confidential salary data while HR administrators test and customize layouts. In Phase 2, formal issuance will allow you to generate letters for specific employees.

#### Q9: What happens if a required field is left blank in a template?
The system will refuse to generate the PDF and display a clear notification indicating which required field is missing. This prevents the system from ever creating an incomplete letter with missing dates or blank lines.

#### Q10: Why did I receive a "Preview rate limit reached" message?
Organizations have an hourly limit on preview generation (default: 60 previews per clock hour) to prevent runaway automated requests. If you encounter this, simply wait for the next hour to continue testing.

#### Q11: Can an employee or manager see the previews I generate?
No. Preview generation is entirely private to the HR administrator performing the action. Previews are streamed directly to your browser and are not saved to employee document records.

---

## 🔮 8. Looking Ahead to Phase 2

Phase 1 provides the solid, branded foundation your organization needs to generate beautiful, compliant corporate documents. 

**Here is what is coming next in Phase 2:**
1. **Direct Employee Issuance:** Select an employee and issue official letters with a single click.
2. **Automated Reference Numbering:** Sequential, tamper-proof corporate numbering (e.g., `ACME/EXP/2026/0042`).
3. **Documents Module Integration:** Issued letters will automatically appear in the employee's official document profile.
4. **Employee Self-Service Portal:** Employees can securely view, download, and digitally acknowledge their issued letters from their own dashboard.
5. **Maker-Checker Issuance Workflows:** Structured review workflows allowing HR managers to verify letters before final sign-off.
