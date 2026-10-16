# HRMS Payroll Guide: Statutory Compliance, Tax Regimes & Investment Declarations (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to statutory deductions (Provident Fund, ESI, Professional Tax), Income Tax regimes, employee investment declarations, proof verification workflows, monthly TDS calculations, and Form 16 generation within the HRMS Payroll module.

---

### Statutory Deductions: PF, ESI & Professional Tax

**Q: What are Statutory Deductions in the HRMS Payroll module?**
**A:** Statutory Deductions are mandatory social security and government tax withholdings required by national and state labor laws.

The HRMS automatically calculates and withholds three primary statutory contributions:
- **Employee Provident Fund (EPF):** Retirement savings scheme for employees.
- **Employee State Insurance (ESI):** Medical and social security insurance scheme for eligible wage earners.
- **Professional Tax (PT):** State-level tax levied on salaried employees based on state-specific income slabs.

---

**Q: How does the system calculate Employee Provident Fund (PF)?**
**A:** When PF is enabled for the organization, the system computes employee and employer contributions on eligible PF wages (primarily Basic Pay and applicable allowances):

- **Employee Contribution:** 12% of the PF wage base, deducted directly from employee monthly salary.
- **Employer Contribution:** 12% total, split into the Employee Pension Scheme (EPS, 8.33%) and the Employee Provident Fund (EPF, 3.67%), along with statutory EDLI (0.5%) and administrative charges (0.5%).
- **Statutory Wage Ceiling:** By default, the statutory PF wage ceiling is capped at ₹15,000 per month. If an organization has enabled PF capping, the 12% deduction is calculated on a maximum of ₹15,000 (resulting in an employee deduction of ₹1,800/month). If an organization allows actual PF, contributions are calculated on the full basic salary.

---

**Q: How does Employee State Insurance (ESI) work in payroll?**
**A:** ESI applies to employees whose total monthly gross wages fall below the statutory threshold of ₹21,000 per month (or ₹25,000 for employees with disabilities):

- **Employee Contribution:** 0.75% of monthly gross wages, deducted from salary.
- **Employer Contribution:** 3.25% of monthly gross wages, contributed by the employer as part of total employment cost.

If an employee's gross monthly earnings exceed ₹21,000, ESI is automatically disabled for that employee (unless they were enrolled at the beginning of an ongoing contribution period, in which case coverage continues until the end of that contribution period per statutory guidelines).

---

**Q: How does Professional Tax (PT) work across different states?**
**A:** Professional Tax is governed by state-specific tax laws and is calculated using state-wise slab tables maintained in the Statutory Configuration settings.

Because each state defines its own tax brackets (for example, Karnataka, Maharashtra, Telangana, and West Bengal all have different salary slabs, exemption limits, and deduction frequencies), the payroll engine determines the employee's work location state and applies the corresponding PT slab for that month.

---

### Tax Regimes: Old vs. New Regime

**Q: What is the difference between the Old Tax Regime and the New Tax Regime?**
**A:** The HRMS supports both Indian income tax regimes:

- **Old Tax Regime:** Features higher slab tax rates but allows employees to claim a wide variety of personal tax exemptions and deductions (such as Section 80C up to ₹1,50,000, Section 80D medical insurance, House Rent Allowance / HRA exemptions, and Home Loan interest deductions under Section 24).
- **New Tax Regime:** Features lower, concessional slab tax rates and higher basic exemption thresholds, but disallows most personal investment exemptions (such as 80C, 80D, and HRA). It includes standard deduction and Section 87A tax rebates.

---

**Q: How do employees select or switch their Tax Regime?**
**A:** Employees can elect their preferred tax regime from the **My Payroll > Tax Planner** section.

On the Tax Planner screen, the system displays a side-by-side comparison showing projected annual tax liability under both the Old and New regimes based on the employee's salary and investment claims. Employees can toggle their selection and click "Save Regime." Once saved, the payroll engine immediately adjusts the monthly TDS calculation for upcoming payroll runs.

---

**Q: Can an employee switch tax regimes at any time during the year?**
**A:** Regime switching is permitted during the initial declaration window at the start of the financial year.

However, organizations typically freeze regime switching after a specified cutoff date (such as January 1st) to finalize annual tax calculations before financial year-end. Additionally, once HR executes "Financial Year Finalization," tax regimes for that closed financial year are permanently locked and cannot be modified.

---

### Employee Investment Declarations Workflow

**Q: What is an Investment Declaration in the HRMS?**
**A:** An Investment Declaration is an annual tax-planning submission where an employee reports intended and actual tax-saving investments to lower their monthly Tax Deducted at Source (TDS).

At the beginning of the financial year (April), employees submit estimated declarations. The tax engine uses these declared amounts to provide provisional tax relief throughout the year. Near the end of the financial year (January/February), employees submit actual documentary proofs (receipts, certificates) for HR verification.

---

**Q: What tax-saving categories can employees declare?**
**A:** Under the Old Tax Regime, employees can declare investments across several statutory sections:

- **Section 80C (up to ₹1,50,000):** Employee Provident Fund (automatically credited), Public Provident Fund (PPF), Equity Linked Savings Schemes (ELSS), Life Insurance premiums, National Savings Certificates (NSC), children's school tuition fees, and principal repayment on home loans.
- **Section 80D:** Health insurance premiums for self, spouse, dependent children, and parents (with higher limits for senior citizens).
- **Section 24(b):** Interest paid on housing loans for self-occupied property (up to ₹2,00,000 annually).
- **House Rent Allowance (HRA):** Monthly rent paid, landlord details, and landlord PAN.
- **Section 80CCD(1B):** Additional voluntary contributions to the National Pension System (NPS) up to ₹50,000.

---

**Q: What are the requirements for claiming House Rent Allowance (HRA) tax exemption?**
**A:** To claim HRA tax exemption, the employee must be living in rented accommodation and receiving HRA as part of their salary structure:

1. The employee inputs the monthly rent amount and rental address.
2. The employee provides the landlord's name.
3. If total annual rent paid exceeds ₹1,00,000, providing the **Landlord's Permanent Account Number (PAN)** is mandatory by law.
4. During proof submission, the employee must upload valid rent receipts or a registered rental agreement.

The tax engine automatically computes HRA exemption as the minimum of: actual HRA received, rent paid in excess of 10% of Basic Pay, or 50% (metro) / 40% (non-metro) of Basic Pay.

---

**Q: What are the different statuses of an Investment Declaration?**
**A:** An investment declaration transitions through four stages:

- **Draft:** The employee is adding or editing declaration lines. The tax engine uses draft figures for provisional TDS forecasts.
- **Submitted:** The employee has formally submitted the declaration and proofs to HR. The employee can no longer alter declared amounts unless HR reopens the declaration.
- **Verified:** HR administrators have reviewed the uploaded receipts and confirmed the approved amounts.
- **Partially Verified:** HR has accepted some items while reducing or rejecting others that lacked valid documentation.
- **Rejected:** HR has rejected the entire submission due to invalid or fraudulent documentation.

---

### Proof Submission & HR Verification Queue

**Q: How does HR review and verify employee investment proofs?**
**A:** HR administrators access the verification queue from **Payroll > Tax Declarations**:

1. HR opens a submitted declaration to inspect individual line items (for example, ₹1,50,000 under Section 80C).
2. HR reviews attached proof documents (such as insurance premium receipts or tuition fee invoices).
3. **Available Actions:**
   - **Verify:** Accept the claimed amount in full.
   - **Verify with Adjustment:** If an employee claimed ₹50,000 but the receipt proves only ₹35,000, HR inputs ₹35,000 as the verified amount.
   - **Reject Item:** Reject an individual invalid line item, setting its tax relief to zero.
   - **Reopen:** Return the entire declaration back to "Draft" status so the employee can upload a missing receipt.

---

**Q: What happens to an employee's monthly TDS after HR verifies their investment proofs?**
**A:** The moment HR clicks "Verify," the tax engine immediately updates the employee's tax calculation:

If HR verifies a higher exemption, the employee's projected annual tax liability drops, reducing their monthly TDS deduction and increasing their take-home pay. Conversely, if an employee claimed ₹1,50,000 in draft declarations but provided no proof, the unverified claim is dropped, increasing their tax liability and resulting in higher TDS deductions during the final months of the financial year.

---

### Monthly TDS Calculation & Tax Projections

**Q: How does the HRMS calculate monthly Income Tax (TDS) on salary?**
**A:** The system uses the official annualized projection method mandated by income tax authorities:

1. **Projected Annual Gross Salary:** The engine projects the employee's total annual earnings for all 12 months of the financial year.
2. **Less Standard Deduction:** Automatically subtracts the statutory standard deduction (for example, ₹50,000 or ₹75,000 depending on regime and applicable finance act).
3. **Less Verified Exemptions:** Subtracts verified HRA, 80C, 80D, and housing loan interest deductions.
4. **Tax Slab Computation:** Evaluates net taxable income against the active tax slabs and age brackets of the selected regime.
5. **Tax Rebates & Surcharges:** Applies Section 87A rebate if income is within eligible limits, then adds the mandatory 4% Health & Education Cess to determine total annual tax liability.
6. **Monthly Distribution:** Subtracts taxes already deducted in previous months of the financial year. The remaining tax liability is divided evenly by the remaining months of the year to determine the exact TDS amount for this month's payslip.

---

**Q: Why does an employee's TDS deduction sometimes spike mid-year?**
**A:** TDS spikes typically occur due to two common scenarios:

- **Mid-Year Salary Increment or Bonus:** When an employee receives a raise or performance bonus, their projected annual income jumps, potentially pushing them into a higher tax slab. Because the additional tax liability must be recovered across fewer remaining months in the year, monthly TDS increases.
- **Unverified Investment Declarations:** If an employee submitted provisional declarations at the start of the year but failed to provide proofs when the proof verification window closes, the engine removes the provisional exemption. The resulting accumulated tax difference must be recovered across the remaining months (typically January, February, and March).

---

**Q: What is the "Tax Projection" tab on the employee self-service dashboard?**
**A:** The Tax Projection tab provides a completely transparent, step-by-step mathematical breakdown of how an employee's TDS was calculated.

It displays annualized gross earnings, itemized deductions, slab-by-slab tax calculations, total annual tax liability, taxes deducted to date, and the exact remaining monthly TDS figure. This transparency enables employees to understand their tax calculations independently without contacting the HR helpdesk.

---

### Form 12B (Previous Employer Income) & Form 16

**Q: What is Form 12B, and why is it important for employees joining mid-year?**
**A:** Form 12B is a statutory declaration where an employee who joins a company mid-financial year declares the salary earned and income tax deducted at their previous organization.

If an employee does not declare previous employer income, the new employer's tax engine assumes the employee had zero prior earnings and applies basic slab exemptions a second time. At year-end, when the employee files their annual tax return, the tax department combines both incomes, resulting in a large unexpected tax liability and interest penalties. Recording Form 12B figures in the HRMS ensures that the correct tax slab is applied from day one.

---

**Q: What is Form 16, and what is the difference between Part A and Part B?**
**A:** Form 16 is the annual income tax certificate issued by employers to employees detailing total salary paid and tax withheld:

- **Part A:** Contains the employer's TAN, employee PAN, and a quarterly summary of tax deducted and deposited with the central government.
- **Part B:** A comprehensive annexure containing the complete breakdown of salary, allowances, statutory exemptions, Section 80C/80D deductions, total taxable income, and net tax payable.

---

**Q: What is Financial Year Finalization, and why does it lock tax records?**
**A:** Financial Year Finalization is the formal year-end accounting closure executed by HR after the final March payroll is paid.

Before finalizing, the system runs a pre-flight readiness check verifying that all 12 payroll months of the financial year are closed and paid. Finalization permanently locks all tax regimes, declaration proofs, and tax calculation snapshots for that year. Employees can then download their official, finalized Form 16 (Part B) tax certificates directly from their self-service dashboard. The system strictly prohibits issuing provisional Form 16 certificates before finalization to prevent filing inaccurate tax returns.
