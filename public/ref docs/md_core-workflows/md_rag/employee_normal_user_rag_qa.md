# HRMS Employee Self-Service — Normal User Knowledge Base & RAG Q&A

> **Target Audience:** Normal Users / Employees across all departments and locations.  
> **Purpose:** Official semantic Q&A knowledge base for Employee Self-Service (ESS), answering everyday questions regarding attendance, leaves, salary, tax declarations, reimbursements, and company policies.  
> **Policy Note:** Specific quotas, grace periods, expense caps, and leave entitlements **depend entirely on your organization's HR policy**. Standard industry examples (such as 18 days of Privilege Leave or 15 minutes grace) are provided for illustration.

---

## Quick Navigation

1. [Account, Login & Profile Management](#1-account-login--profile-management)
2. [Daily Attendance, Clocking & Shifts](#2-daily-attendance-clocking--shifts)
3. [Attendance Regularization & Missing Punches](#3-attendance-regularization--missing-punches)
4. [Leave Applications, Quotas & Balances](#4-leave-applications-quotas--balances)
5. [Compensatory Offs (Comp Offs)](#5-compensatory-offs-comp-offs)
6. [Holidays & Company Calendar](#6-holidays--company-calendar)
7. [Salary, Payslips & Deductions (Payroll)](#7-salary-payslips--deductions-payroll)
8. [Income Tax, Regimes & Investment Proofs (TDS)](#8-income-tax-regimes--investment-proofs-tds)
9. [Expense Claims & Reimbursements](#9-expense-claims--reimbursements)
10. [Resignation, Notice Period & Exit Settlement](#10-resignation-notice-period--exit-settlement)
11. [Approvals, Requests & Manager Escalation](#11-approvals-requests--manager-escalation)

---

## 1. Account, Login & Profile Management

### Q: How do I log into the HRMS portal?
**A:** You can log in using your registered work email address and password. 
- Navigate to the HRMS login screen, enter your work email, and enter your secure password.
- If your company has enabled Multi-Factor Authentication (MFA) or Single Sign-On (SSO), complete the secondary authentication step (such as entering a one-time passcode sent to your email or authenticating via your company Google/Microsoft account).

### Q: What should I do if I forget my password?
**A:** Click on the **Forgot Password?** link on the login screen.
1. Enter your registered work email address.
2. The system will send a secure password reset link or a 6-digit verification code to your email.
3. Enter the code and set a new password that complies with company password security rules (minimum 8 characters, with uppercase, lowercase, numbers, and symbols).

### Q: Where can I view my Employee ID, official designation, and reporting manager?
**A:** You can view these details under your **Profile** or **My Info** section. Your profile displays:
- Official Employee Code / ID.
- Department, Designation, and Work Branch Location.
- Assigned Reporting Manager (the person who approves your leaves and attendance).
- Official Joining Date and current employment status (e.g., Active, On Probation).

### Q: How do I update my personal details (phone number, home address, emergency contacts)?
**A:** You can edit your personal details directly from your **Profile** page:
- Navigate to **Profile > Personal Details**.
- Update your contact number, residential address, or emergency contact information.
- Click **Save Changes**. Certain sensitive changes (like changing your legal name or date of birth) may require HR verification and supporting identity documents.

### Q: How do I update my bank account details for salary deposit?
**A:** Go to **Profile > Financial Details / Bank Information**:
- Enter your Account Holder Name, Bank Name, Account Number, and IFSC Code.
- Upload a copy of a cancelled cheque or bank passbook for verification.
- Once submitted, your request is routed to HR or the Payroll Admin for verification before the new bank details are activated for payroll disbursements.

---

## 2. Daily Attendance, Clocking & Shifts

### Q: How do I clock in and clock out every day?
**A:** You can record your attendance through the Self-Service Portal or Mobile App:
1. When you begin work, click the **Clock In** button on your dashboard. The system records your clock-in timestamp in UTC and converts it to your local time.
2. When you finish work, click **Clock Out**. The system computes your total active working hours for the day.

### Q: Why am I getting an error saying "Out of Allowed Location" when clocking in?
**A:** If your organization enforces Geofencing or IP Restrictions:
- You must be physically present within the designated office perimeter (geofence radius) or connected to your company office Wi-Fi / authorized VPN.
- If you are working remotely or on a client visit, request your manager or HR to enable "Remote Punch" permissions for your profile.

### Q: What happens if I clock in late? Is there a grace period?
**A:** Whether a grace period is allowed and how long it lasts **depends on your organization's attendance policy**.
- *For example:* An organization might configure a **15-minute grace period** for a 09:00 AM shift, meaning clocking in before 09:15 AM is considered on-time.
- If you arrive after the grace period, the system may automatically flag your punch as **Late Arrival**. In many organizations, multiple late arrivals in a month (e.g., more than 3 instances) can trigger a half-day deduction or require regularization.

### Q: How does attendance work for overnight shifts that cross midnight?
**A:** If you work a night shift (for example, starting at 10:00 PM and ending at 06:00 AM the next morning):
- The system automatically associates your entire shift with the date on which the shift **started**.
- It does not mark you absent for the second calendar date, and it accurately records your full shift duration without splitting it into two disconnected entries.

### Q: Where can I review my monthly attendance log and total working hours?
**A:** Go to **Attendance > My Attendance Log / Timesheet**. This view displays a calendar showing:
- Each day's status: **Present**, **Absent**, **Half-Day**, **On Leave**, or **Holiday**.
- First clock-in and last clock-out timestamps.
- Net working hours and anomaly alerts (such as missing clock-outs).

---

## 3. Attendance Regularization & Missing Punches

### Q: Why is my attendance showing as "Absent" even though I worked?
**A:** You may be marked Absent if:
1. You forgot to clock out at the end of your shift (system detects a **Missing Punch**).
2. You clocked in after the maximum permissible late threshold without an approved leave.
3. You had an unscheduled absence that was not covered by an approved leave request.
To fix this, you must submit an **Attendance Regularization** request.

### Q: How do I submit an Attendance Regularization request?
**A:** Follow these steps:
1. Navigate to **Attendance > Anomalies / Regularization**.
2. Locate the date that is marked Absent or Missing Punch.
3. Click **Request Regularization**.
4. Enter your actual Clock-In and Clock-Out times for that day.
5. Provide a valid reason (e.g., "Forgot to punch out," "Power outage," or "Official client visit").
6. Click **Submit**. Your request will be routed directly to your reporting manager for approval.

### Q: Is there a deadline to submit an attendance regularization?
**A:** Yes. The deadline **depends on your organization's policy**.
- *For example:* Many companies require regularizations to be submitted within **3 to 7 days** from the incident date, or before the monthly payroll cut-off date (e.g., 25th of the month). If you miss this window, the system locks the record, and only HR can make manual adjustments.

### Q: What happens after my manager approves my regularization?
**A:** Once approved:
- The attendance status on that date immediately updates to **Present** (or **Half-Day**, depending on hours worked).
- The anomaly flag is removed.
- Your payroll record is protected from unnecessary Loss of Pay (LOP) salary deductions.

---

## 4. Leave Applications, Quotas & Balances

### Q: How do I check my remaining leave balance?
**A:** Go to **Leaves > My Leave Balances / Wallet**:
- You will see a breakdown for each leave category (Privilege Leave / Earned Leave, Casual Leave, Sick Leave, etc.).
- The dashboard displays **Total Annual Quota**, **Total Accrued**, **Total Used**, **Leaves on Hold (Pending Approval)**, and your **Current Available Balance**.

### Q: How many leaves do I get in a year?
**A:** Your annual leave quota **depends entirely on your organization's policy and your employment contract**.
- *For example:* An organization might grant **18 days of Privilege/Earned Leave, 12 days of Sick Leave, and 10 days of Casual Leave** per calendar year.
- Another organization might operate on a consolidated Paid Time Off (PTO) model granting **20 or 24 days total**.
- If you joined mid-year (e.g., in July), your leaves will be calculated on a **pro-rata basis** for the remaining months of the year.

### Q: How do I apply for leave?
**A:** To submit a leave request:
1. Navigate to **Leaves > Apply for Leave**.
2. Select the **Leave Type** (e.g., Sick Leave, Casual Leave, Earned Leave).
3. Select the **Start Date** and **End Date**.
4. Choose whether it is a **Full Day** or **Half Day** (First Half or Second Half).
5. Enter the reason for your time off.
6. Attach a supporting document if mandatory (e.g., medical certificate).
7. Click **Submit**. Your request is placed in a pending state and sent to your manager.

### Q: Can I apply for a Half-Day leave?
**A:** Yes. When applying, toggle the **Half-Day** option and specify whether you will be absent during the **First Half** (morning session) or **Second Half** (afternoon session). The system will deduct exactly **0.5 days** from your leave balance.

### Q: What is the "Sandwich Rule"? Will weekends count against my leave balance?
**A:** Whether the Sandwich Rule applies **depends on your organization's leave policy**.
- The Sandwich Rule states that if public holidays or weekends fall between your leave days, they are also counted as leave.
- *For example:* If your company enables the Sandwich Rule for Casual Leave, and you apply for leave on Friday and the following Monday, the intervening weekend (Saturday and Sunday) will also be deducted from your leave balance, making it a **4-day deduction** instead of 2 days. If the rule is turned OFF, only 2 working days are deducted.

### Q: Why is the system asking me to upload a doctor's certificate for Sick Leave?
**A:** Organizations configure a **Document Threshold** for medical leaves:
- *For example:* If your organization sets a threshold of **2 days**, applying for 1 or 2 days of Sick Leave requires no document, but applying for **3 or more consecutive days** mandates attaching a medical certificate before you can submit.
- The system includes anti-smurfing protection: splitting a 3-day sickness into two separate requests (e.g., 2 days + 1 day) will still detect the continuous absence and require a document.

### Q: What happens if I apply for leave but my balance is zero?
**A:** The outcome **depends on your organization's policy**:
1. **Disallowed:** The system prevents submission with an "Insufficient Leave Balance" error.
2. **Negative Balance Allowed:** If your company permits a "Max Negative Balance" (e.g., allowing you to borrow up to **2 or 5 days**), you can take the leave now, and the deficit will be recovered as you accrue leaves in upcoming months.
3. **Leave Without Pay (LWP):** The system may automatically convert the excess days into unpaid leave (LWP), which will be reflected as a Loss of Pay deduction in that month's payroll.

### Q: What is a "phantom hold" on my leave balance?
**A:** When you submit a leave request, the requested days are immediately placed on **hold** (pending approval). Even though they are not permanently deducted until your manager approves, you cannot use those same days to apply for another overlapping leave. If your request is rejected or cancelled, the hold is instantly released back to your balance.

### Q: Can I carry forward my unused leaves into the new year?
**A:** Carry-forward rules **depend on your organization's HR policy**.
- Some organizations follow a "use-it-or-lose-it" policy with **0 carry-forward**.
- Others specify a **Max Carry Forward cap** (for example, a maximum of **5, 10, or 18 days** can roll over into January 1st). Any unused balance exceeding that cap will automatically lapse at year-end.

---

## 5. Compensatory Offs (Comp Offs)

### Q: What is a Comp Off and how do I earn one?
**A:** A Compensatory Off (Comp Off) is a credit earned when you work on a designated non-working day (such as a weekend or public holiday).
- Once your attendance on that weekend/holiday is approved and verified by your manager, the system credits **1.0 day** (or **0.5 day** for half-day work) to your Comp Off leave balance.

### Q: Do Comp Offs expire?
**A:** Yes. The validity window **depends on your organization's policy**.
- *For example:* An organization might configure Comp Offs to be valid for **30, 60, or 90 days** from the date they were earned. If not utilized within that timeframe, the system's automated daily job will expire the credit, and it will be removed from your balance.

### Q: How do I use my Comp Off balance?
**A:** Apply for time off just as you would for normal leave:
1. Go to **Leaves > Apply for Leave**.
2. Select **Comp Off** as the leave category.
3. Select your desired date.
4. The system automatically redeems your oldest non-expired Comp Off credit first.

---

## 6. Holidays & Company Calendar

### Q: Where can I view the company holiday list for the current year?
**A:** Navigate to **Attendance > Holiday Calendar** (or view the company calendar on your Dashboard). It lists all mandatory and optional/floating public holidays for the year.

### Q: Why do my colleagues in another city have a holiday today while my office is working?
**A:** The HRMS supports **Location-Specific and Department-Specific Holidays**.
- *For example:* An employee based in the Mumbai office might have a state holiday for *Ganesh Chaturthi*, while employees in the Delhi or Bangalore offices have a regular working day. Your calendar only displays holidays applicable to your assigned branch location.

### Q: What is an Optional / Floating Holiday and how do I take it?
**A:** Some companies offer a pool of optional holidays (e.g., 2 floating holidays per year chosen from a list of regional festivals):
- Select the floating holiday from the list and apply in advance.
- Once approved by your manager, it is treated as a paid holiday.

---

## 7. Salary, Payslips & Deductions (Payroll)

### Q: When is monthly salary processed, and when can I download my payslip?
**A:** Salary processing cycles **depend on your organization's schedule** (commonly between the 28th and the 1st of every month).
- Once HR finalizes and pays the monthly payroll run, you will receive an automated email/app notification.
- You can instantly view and download your payslip as a PDF from **Payroll > My Payslips**.

### Q: What is the difference between my Gross Salary and Net Take-Home Salary?
**A:**
- **Gross Salary:** The total earnings agreed in your employment package before any deductions (Basic + HRA + Special Allowance + other allowances).
- **Net Salary (Take-Home):** The actual amount credited to your bank account:
  $$\text{Net Salary} = \text{Gross Earnings} - (\text{Statutory Deductions} + \text{TDS / Tax} + \text{Other Deductions})$$

### Q: Why is my salary lower than usual this month?
**A:** A salary deduction usually occurs due to one or more of the following:
1. **Loss of Pay (LOP):** Unapproved absences, missing attendance punches that were not regularized, or approved Leave Without Pay (LWP).
2. **Income Tax (TDS):** Higher tax deductions if your projected annual earnings crossed taxable slabs or if you haven't submitted your investment proofs.
3. **Loan / Advance EMI:** Scheduled monthly recovery for an employee salary advance or company loan.
4. **Mid-Month Joining:** If you joined mid-month, your salary is prorated for the exact days you worked.

### Q: How is Loss of Pay (LOP) calculated?
**A:** LOP deductions follow standard payroll proration:
$$\text{Payable Gross} = \text{Monthly Gross} \times \frac{\text{Total Month Days} - \text{LOP Days}}{\text{Total Month Days}}$$
*For example:* In a 30-day month, if you have 2 days of unapproved absence (LOP), you are paid for 28 days ($\frac{28}{30}$ of your monthly components).

### Q: What are Provident Fund (PF) and ESI deductions?
**A:** These are statutory government-mandated welfare programs:
- **Provident Fund (EPF):** In India, 12% of your PF-applicable basic wage is deducted as your retirement contribution, matched by your employer (split into EPF and Pension Fund EPS). Organizations may cap the calculation at the statutory ₹15,000 ceiling or calculate on actual basic pay.
- **Employee State Insurance (ESI):** For employees with gross monthly earnings up to ₹21,000, 0.75% is deducted for medical and disability benefits (with 3.25% contributed by the employer).
- **Professional Tax (PT):** A state-level tax (typically ₹150 to ₹300 per month depending on your state and salary slab).

---

## 8. Income Tax, Regimes & Investment Proofs (TDS)

### Q: What is the difference between the Old and New Tax Regimes?
**A:**
- **New Tax Regime (Default):** Offers lower tax slab rates but disallows most exemptions and deductions (except the standard ₹50,000/₹75,000 deduction).
- **Old Tax Regime:** Higher tax slab rates, but allows claiming deductions under Section 80C (PPF, ELSS, Life Insurance up to ₹1.5 Lakhs), Section 80D (Health Insurance), HRA (House Rent Allowance), and home loan interest.

### Q: How do I select my preferred Tax Regime?
**A:** Go to **Payroll > Tax Declaration / Regime Selection**:
- Choose either the **New Regime** or **Old Regime**.
- You can typically make or change this selection at the beginning of the financial year (April/May) or upon joining.

### Q: How and when do I submit my investment proofs?
**A:**
1. **Initial Declaration (Start of Year):** In April/May, enter your planned investments for the year so estimated monthly TDS is minimized.
2. **Proof Submission (Year-End Verification):** Around December/January, HR opens the proof submission window:
   - Go to **Payroll > Tax Declarations > Upload Proofs**.
   - Upload receipts, policy certificates, and rent agreements/PAN for HRA.
   - Once verified by the Finance/Payroll team, your final tax liability is adjusted for January, February, and March payrolls.

---

## 9. Expense Claims & Reimbursements

### Q: What expenses can I claim for reimbursement?
**A:** Eligible categories **depend on your organization's expense policy**. Common categories include:
- Official travel, flights, train tickets, and fuel/cab fares.
- Client entertainment and official business meals.
- Monthly broadband / mobile phone bills for remote work.
- Books, certifications, or professional development materials.

### Q: How do I submit an expense reimbursement claim?
**A:** Follow these steps:
1. Navigate to **Expenses / Reimbursements > New Claim**.
2. Select the **Expense Category** (e.g., Travel, Meals, Internet).
3. Enter the invoice date, total amount spent, and currency.
4. Upload clear copies of receipts, tax invoices, or bills.
5. Provide a brief business justification and click **Submit**.

### Q: When and how do I receive my reimbursement payment?
**A:** Once your manager and Finance/HR approve your claim:
- In most organizations, approved reimbursements are paid out along with your regular monthly salary as a non-taxable reimbursement line on your payslip.
- In some organizations, finance processes expense payouts as a separate mid-month direct bank transfer.

---

## 10. Resignation, Notice Period & Exit Settlement

### Q: Can I take leaves while serving my notice period?
**A:** This **depends on your organization's exit policy**.
- *For example:* Some companies strictly forbid all paid leaves during notice period (cap = 0 days). Others allow a limited allowance (e.g., maximum **2 days** of Casual Leave for emergencies, but 0 days of Privilege Leave).
- The system automatically blocks leave requests that exceed the configured notice period cap.

### Q: What happens to leaves I had scheduled for the future if I resign?
**A:** When HR enters your last working date into the system, all approved future leaves scheduled *after* your last working day are **automatically cancelled and removed** from the attendance calendar.

### Q: When will I receive my Full & Final (F&F) settlement?
**A:** The Full & Final settlement is processed by HR and Finance in the pay cycle following your last working day (typically within **30 to 45 days** of exit, depending on company policy). It includes:
- Prorated salary for days worked in your final month.
- Encashment of eligible unused privilege leaves (as per company policy).
- Gratuity payout (if eligible after 5+ years of continuous service).
- Less any recoveries for notice buyout, unreturned assets, or outstanding salary advance balances.

---

## 11. Approvals, Requests & Manager Escalation

### Q: Who approves my leave, regularization, and expense requests?
**A:** All employee self-service requests route automatically to your **direct reporting manager** as configured in your profile hierarchy.

### Q: What happens if my manager is on leave or does not respond to my request?
**A:** If a request remains pending beyond a certain timeframe, or if your manager has left the company:
- The system automatically **escalates** the pending request to the Next-Level Approver or to the central **HR Administration** queue.
- HR Administrators have org-wide authority to review, approve, or reject pending requests to prevent operational delays.

### Q: Can I cancel a leave request after submitting it?
**A:**
- **If Pending Approval:** Yes, you can cancel it immediately. Any hold on your leave balance is released instantly.
- **If Approved (Future Date):** Yes, you can cancel it with one click before the leave date arrives, and your balance is instantly refunded.
- **If Approved (Date Already Passed):** Cancelling a past leave requires manager approval to verify you actually reported to work before your leave balance can be refunded.
