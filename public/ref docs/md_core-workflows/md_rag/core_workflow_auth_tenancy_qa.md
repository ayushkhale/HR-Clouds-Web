# HRMS Core Workflow Guide: Authentication, Multi-Tenancy & Account Security (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to user authentication, multi-tenancy, organization switching, account registration, session security, and access revocation within the HRMS.

---

### Understanding Multi-Tenancy & User Identity

**Q: What does Multi-Tenancy mean in the HRMS?**
**A:** Multi-Tenancy means that a single installation of the HRMS securely hosts multiple independent companies (organizations), allowing users to access different company workspaces using a single set of login credentials.

In this architecture, your personal user account (identified by your email address) is your global identity. That single identity can be associated with one or multiple organizations. Each organization operates in total isolation with its own employee rosters, departments, leave policies, attendance rules, and payroll configurations.

---

**Q: Can I have different roles in different organizations with the same login email?**
**A:** Yes. The HRMS separates your personal user identity from your company-specific roles.

For example, you could be registered as an HR Administrator in Company A, while also being an Employee or Team Manager in Company B under the exact same email address and password. When you access Company A, you have full HR administrative privileges for Company A only; when you access Company B, your access is strictly limited to your employee or manager role in Company B.

---

**Q: How does the system ensure data privacy between different organizations?**
**A:** The HRMS enforces strict tenant isolation boundaries on every single action and request.

Whenever you perform an action—such as viewing employee profiles, checking attendance, or reviewing payroll—the system binds your request strictly to the active organization you are currently logged into. It is impossible for users in Organization A to see, search, or access records belonging to Organization B, even if a user belongs to both companies.

---

### The Login Experience & Organization Selection

**Q: How does the login process work if I belong to only one organization?**
**A:** If your email address is associated with only one organization, the login process takes you directly into your company workspace:

1. You enter your registered email address and password on the Login screen.
2. The system verifies your credentials and confirms your active company membership.
3. You are immediately directed to your organization's dashboard with your assigned role permissions.

---

**Q: How does login work if I belong to multiple organizations?**
**A:** If your email address is linked to two or more organizations, the system presents an **Organization Picker** screen immediately after you enter your valid email and password:

1. You enter your login credentials.
2. The system identifies that you hold active memberships in multiple organizations and displays a list of your companies along with your assigned role in each (for example: "Acme Corp - HR" and "Beta Logistics - Employee").
3. You select the organization workspace you want to enter for your current working session.
4. The system opens the dashboard for the selected company.

---

**Q: How do I switch between organizations without logging out?**
**A:** You can switch between organizations at any time using the **Switch Organization** option located in your user profile menu at the top of the screen.

When you select "Switch Organization," the system displays your list of affiliated companies. Clicking a different company instantly transitions your active workspace to that organization. The system securely refreshes your session permissions to match your role in the new company without requiring you to re-type your password.

---

**Q: What should I do if a company I belong to does not appear on my Organization Picker list?**
**A:** If an organization does not appear on your selection screen, it typically indicates one of three situations:

- **Pending Invitation:** The company invited you, but you have not yet clicked the verification link in your invitation email to accept membership.
- **Deactivated Account:** An HR administrator at that organization has temporarily deactivated or archived your profile.
- **Different Email Address:** The organization may have sent your invitation to a different corporate or personal email address than the one you are currently logged into.

Contact the HR department of the organization to confirm the status of your employee account.

---

### Account Registration & Verification

**Q: How do new users register for an HRMS account?**
**A:** Users typically join the HRMS in one of two ways:

1. **Company Invitation:** An HR administrator or manager invites you via email. You click the invitation link, verify your details, and set a password to activate your account.
2. **Direct Self-Registration (Tenant Creator):** If you are registering a brand-new organization, you complete the Signup form with your name, work email, and password. The system sends a One-Time Password (OTP) to your email for verification.

---

**Q: Why does the system say "Account Pending Verification" when I try to log in?**
**A:** This message occurs when an account was created via self-registration, but the email verification step has not yet been completed.

To prevent unauthorized registrations and verify that you own the email address, the system requires entering the 6-digit OTP sent to your inbox during signup. An account in "Pending Verification" status cannot access the system until the OTP is successfully validated.

---

**Q: What should I do if my verification OTP expires or does not arrive?**
**A:** Verification OTPs are time-sensitive and expire after a defined duration (typically 10 minutes) for security reasons.

If your OTP expires or does not appear in your inbox:
1. Check your spam, junk, or promotional email folders.
2. Return to the verification screen and click **"Resend OTP."**
3. Wait for the new code to arrive, enter the fresh 6-digit OTP, and confirm your account.

---

**Q: Can I log in using Google Single Sign-On (SSO)?**
**A:** Yes. If your organization has enabled Google Authentication, you can click "Sign in with Google" on the login screen.

The system verifies your Google identity and checks whether your Google email address matches an active account in the HRMS. If a match is found, you are logged in automatically without needing to enter a separate HRMS password.

---

### Password Management & Recovery

**Q: How do I reset my password if I forget it?**
**A:** You can reset your password using the **Forgot Password** feature on the login screen:

1. Click "Forgot Password?" on the login page.
2. Enter your registered email address and submit.
3. The system sends a secure password reset OTP to your email inbox.
4. Enter the received OTP along with your new password.
5. Once submitted, your password is updated immediately, and you can log in with your new credentials.

---

**Q: What password requirements does the HRMS enforce?**
**A:** To safeguard company and personal financial data, the system requires secure passwords meeting standard complexity rules:

- Minimum length (typically at least 8 characters).
- A mix of uppercase letters, lowercase letters, numbers, and special symbols.
- Passwords cannot match common, easily guessable words or previously compromised sequences.

---

### Session Security & Immediate Access Revocation

**Q: What happens when an HR administrator deactivates an employee's account?**
**A:** When an HR administrator deactivates, suspends, or offboards an employee, their access to that organization is revoked **immediately**.

The HRMS checks your active organization membership status on every single action you take in the application. Unlike systems that allow a user to keep working until their temporary browser token expires hours later, the HRMS instantly terminates company access the moment HR clicks "Deactivate." Any subsequent click by the employee in that company workspace will be denied with an access revoked alert.

---

**Q: If my account in Organization A is deactivated, can I still access Organization B?**
**A:** Yes. Because your user identity is global while memberships are organization-specific, being deactivated in Organization A has zero effect on your account in Organization B.

You can continue logging into Organization B, accessing your profile, and performing your duties normally. Organization A simply disappears from your Organization Picker list.

---

**Q: Why did the system log me out with a "Session Expired" alert?**
**A:** The HRMS enforces session timeouts to protect sensitive payroll, attendance, and employee data from unauthorized access on unattended devices.

If you leave your computer inactive for an extended period, or if your authentication session reaches its maximum security duration, the system automatically ends the active session. You simply need to re-enter your password to resume your work safely.

---

**Q: What should I do if the system displays an "Invalid Credentials" error?**
**A:** The "Invalid Credentials" error indicates that the email and password combination entered does not match the records in the system.

To resolve this:
- Verify that your email address is spelled correctly without extra spaces.
- Ensure that the Caps Lock key is not accidentally turned on.
- If you cannot recall your password, click "Forgot Password" to initiate an OTP-based password reset.
