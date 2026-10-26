# HRMS Authentication Module — User Knowledge Base & FAQs

This document is the official, user-facing knowledge base for authentication, account management, workspace access, and session security within the HRMS (Human Resource Management System) platform. It provides clear, stateless answers to common questions, workflows, validation rules, edge cases, and troubleshooting scenarios.

---

## 1. System Overview & Account Fundamentals

### Q: What is the purpose of the HRMS Authentication module?
**A:** The HRMS Authentication module manages user identity, account registration, secure login, password recovery, and multi-workspace access across the HRMS platform.

It ensures that only authorized individuals can access company HR services, employee records, attendance systems, and payroll data. The authentication system also supports multi-tenancy, allowing a single user account to participate in multiple company workspaces with distinct permissions (such as an Employee in one company and an HR Administrator in another).

---

### Q: What user roles exist in HRMS and what do they mean?
**A:** HRMS provides several distinct user roles, each determining what features and data a user can access within a workspace:

* **Guest:** A newly registered user who has verified their email but does not yet belong to an active organization workspace. Guests typically complete company setup, subscribe to plans, or accept organization invitations.
* **Employee:** Standard staff member access. Employees can log attendance, submit leave requests, view their own compensation and payslips, and manage their personal profile.
* **Manager:** Supervisory access. Managers have all standard employee privileges plus the ability to review and approve their team members' attendance, leaves, shift schedules, and reimbursements.
* **HR (Human Resources):** Administrative access for company personnel operations. HR users can manage company settings, employee onboarding, policies, payroll processing, and department structures.
* **Worker:** An operational role with authority positioned below system administrators and above company-level HR administrators for operational maintenance.
* **Admin / Super Admin:** Elevated administrative roles with platform-wide and system-level configuration management.

---

### Q: What are the different account statuses in HRMS and how do they affect access?
**A:** An HRMS user account can have one of five statuses, which directly dictate whether the user is permitted to sign in:

* **Pending Verification:** The account registration has been initiated, but the email verification code has not yet been submitted. The user cannot log in until verification is complete.
* **Active:** The account is in good standing. The user has verified their identity and can log in normally to all assigned organization workspaces.
* **Inactive:** The user account has been disabled. Sign-in attempts will be rejected until an administrator reactivates the account.
* **Suspended:** Access has been temporarily restricted due to policy enforcement, billing hold, or administrative review. The user cannot log in or perform actions while suspended.
* **Blocked:** The user account has been strictly restricted or banned. The user is completely prohibited from signing in or initiating new account registrations with that email address.

---

## 2. Account Registration & Initial Setup (Sign Up)

### Q: How do I create a new account in HRMS?
**A:** You can create an account by navigating to the HRMS Sign Up page, entering your valid work email address, and selecting **Continue with Email**.

Once submitted, the system generates a 6-digit verification code sent directly to your email inbox. You will be directed to the verification screen, where you must enter the 6-digit code and create a secure password. Once verified, your account is activated with initial Guest privileges, allowing you to set up a new company workspace or join an existing organization via invitation.

---

### Q: What are the password requirements when creating an HRMS account?
**A:** To ensure account security, your HRMS password must meet the following complexity criteria:

* Be at least **8 characters** long.
* Contain at least **one uppercase letter** (A–Z).
* Contain at least **one lowercase letter** (a–z).
* Contain at least **one numeric digit** (0–9).
* Contain at least **one special symbol or character** (such as @, #, $, %, !, &, or *).

If any of these requirements are not satisfied, the registration form will display an error and prevent submission until the password matches all criteria.

---

### Q: What happens if I attempt to sign up with an email address that is already registered?
**A:** If an active account already exists for that email address, the system will reject the signup request and notify you that the email is already registered.

In this scenario, you do not need to register again. Instead, navigate to the **Log in** page and sign in using your existing password or Google account. If you have forgotten your password, select **Forgot Password** on the login screen to recover access.

---

### Q: What happens if I try to sign up while my account is in a "Pending Verification" state?
**A:** If you previously began the registration process but closed the window before entering your verification code and password, submitting your email again on the Sign Up page will generate a fresh 6-digit verification code and email it to you.

You can then proceed directly to enter the newly dispatched verification code and choose your password to complete your account activation.

---

### Q: Can I sign up for HRMS if my previous account was suspended or blocked?
**A:** No, the system will actively reject the signup attempt and display an error message stating that the account is suspended or blocked.

Users with suspended or blocked accounts cannot re-register or bypass restrictions using the same email address. You must contact your company HR administrator or HRMS platform support to resolve the restriction on your account.

---

### Q: What profile information is automatically set up when I complete HRMS registration?
**A:** When you verify your registration code and create your password, HRMS automatically creates your initial profile.

Your initial first name and display name are automatically derived from the prefix of your email address (the characters preceding the `@` symbol). Once you enter an organization workspace or accept an invitation, you and your company HR administrator can update your full name, job title, department, and contact details from the Profile Management section.

---

## 3. Verification Codes (OTP) & Delivery

### Q: How long is an HRMS verification code valid?
**A:** Every verification code generated by HRMS is valid for **5 minutes (300 seconds)** from the moment it is issued.

If you attempt to enter the verification code after 5 minutes have elapsed, the system will reject it as expired. You must then click **Resend OTP** or restart the request to receive a fresh verification code.

---

### Q: How many digits are in the HRMS verification code?
**A:** All HRMS verification codes consist of exactly **6 numeric digits** (for example, `482910`).

The verification screen only accepts numeric characters and enforces an exact 6-digit length. Alphabetic letters and special characters are not accepted.

---

### Q: How do I request a new verification code if I did not receive one?
**A:** You can request a new verification code by clicking the **Resend OTP** button located on the verification screen.

The system will generate a new 6-digit code, deliver it to your registered email (or mobile number for password reset), and reset your 5-minute expiration timer. Any verification code previously issued for that session immediately becomes invalid and cannot be used.

---

### Q: Why is the "Resend OTP" button disabled or showing a countdown timer?
**A:** To protect user accounts and prevent system abuse, HRMS enforces a **60-second cooldown timer** between code requests.

When a code is sent, you must wait at least 60 seconds before you are allowed to request another one. During this interval, the resend option remains temporarily disabled or displays a countdown showing the remaining seconds. Once the timer reaches zero, the option becomes active again.

---

### Q: Is there a limit to how many times I can resend a verification code?
**A:** Yes, HRMS allows a maximum of **3 resend attempts** for an active verification request.

If you exceed the 3-attempt limit, the system will block further resend requests for that session. You will be instructed to restart the process by returning to the Sign Up or Forgot Password page and entering your details again.

---

### Q: What should I do if my HRMS verification code email does not arrive?
**A:** If your verification code does not appear in your inbox within a couple of minutes, follow these troubleshooting steps:

1. **Check Spam / Junk folders:** Automated emails are occasionally diverted by email filters. Look for emails sent from HRMS or HRClouds.
2. **Verify email spelling:** Confirm that you typed your email address correctly on the registration or login screen without typos.
3. **Wait for the 60-second cooldown:** Allow up to one minute for network and email server delivery.
4. **Use Resend OTP:** Once the 60-second timer completes, select **Resend OTP** to trigger a fresh delivery.
5. **Corporate firewall check:** If using a corporate email address, check with your company's IT department to ensure messages from the HRMS notification service are not quarantined.

---

## 4. Signing In & Authentication (Log In)

### Q: How do I log in to HRMS?
**A:** To log in to HRMS, visit the login page, enter your registered email address and password, and click **Log in**.

If your account is associated with a single organization workspace, you will be taken directly to your workspace dashboard according to your role (Employee, Manager, or HR). If you are a member of multiple organization workspaces, you will be prompted to select which workspace you wish to enter.

---

### Q: What error will I see if I enter the wrong email or password?
**A:** If you submit an incorrect email address or password, the system displays a general error message: **"Invalid credentials"**.

For security reasons, the system intentionally does not reveal whether the email or the password was the incorrect element. This prevents malicious actors from determining which email addresses are registered on the platform.

---

### Q: Can I log in with a password if I originally registered using Google?
**A:** No. If you created your account using Google Single Sign-On (SSO), your account does not have a local password configured.

Submitting the email and a password on the standard login form will produce an error stating that password login is not allowed for your account. You must log in by clicking the **Continue with Google** button.

---

### Q: Why am I unable to log in after entering the correct password?
**A:** If your credentials are correct but you cannot log in, your account may be in a non-active status:

* **Account Pending Verification:** You have not completed the initial email code verification. You must finish verifying your account.
* **Account Suspended or Blocked:** An administrator has restricted your access. You must contact your company HR administrator to restore your account.
* **No Active Workspaces:** If you belong to companies that have all been deactivated or suspended, the system will prevent login and notify you that no active workspaces are available.

---

### Q: What happens when an employee has multiple roles across different workspaces?
**A:** HRMS isolates permissions per workspace. Your role in one organization has no impact on your role in another.

For example, you can be assigned as an **HR Administrator** in Organization A and an **Employee** in Organization B under the exact same login email. When you log in and select Organization A, the application loads HR administrative tools and permissions. When you switch to Organization B, the interface switches to standard employee self-service features.

---

## 5. Multi-Organization Workspaces & Workspace Switching

### Q: Why am I prompted to select an organization after logging in?
**A:** You will see the **Select Workspace** screen whenever your login account is associated with two or more active company organizations.

Because permissions, attendance records, leave balances, and company data are strictly separated between organizations, the system requires you to choose which company workspace you want to access for your session.

---

### Q: How long do I have to pick an organization on the workspace selection screen?
**A:** The temporary authorization token granted for selecting an organization is valid for **10 minutes**.

If you remain on the organization selection screen for more than 10 minutes without making a selection, the temporary session will expire. You will be prompted to log in again with your email and password to start a new session.

---

### Q: Can I switch to another company workspace without logging out?
**A:** Yes. If you belong to multiple organizations, you can switch between them directly from within the application without signing out.

Open the workspace switcher in your application navigation bar, select your target organization from the list, and confirm the switch. The system will securely update your active session to the chosen workspace and refresh your dashboard with the appropriate permissions and data for that company.

---

### Q: What happens to my previous session when I switch organizations?
**A:** When you switch organizations, HRMS immediately revokes and invalidates your previous workspace session token.

This ensures strict security: once you transition to a new workspace, the prior session cannot be reused or hijacked. A new, secure session is established specifically for the selected workspace.

---

### Q: What happens if one of the companies I belong to gets suspended or deactivated?
**A:** When an organization is suspended or deleted by platform administrators, it is automatically filtered out from your available workspace options.

If you attempt to select or switch to a suspended organization, the system will block the request and display an error stating that the organization is not accessible. If all organizations associated with your account are suspended, you will be blocked from logging in until at least one organization is restored.

---

## 6. Password Recovery & Account Unlocking (Forgot Password)

### Q: How do I reset my forgotten password in HRMS?
**A:** You can reset your password by following these steps:

1. On the HRMS Login screen, click the **Forgot Password?** link.
2. Enter your registered email address or your registered 10-digit mobile phone number.
3. Click **Send Code**. HRMS will deliver a 6-digit reset code via email (or SMS for phone numbers).
4. Enter the 6-digit verification code on the reset screen.
5. Enter a new password that satisfies the complexity rules (minimum 8 characters with uppercase, lowercase, number, and special character).
6. Submit the form. Upon successful verification, your password is updated immediately and you can log in with your new credentials.

---

### Q: Can I reset my password using my mobile phone number?
**A:** Yes. The HRMS password reset feature supports both registered email addresses and registered 10-digit mobile phone numbers.

When you enter a 10-digit mobile number, HRMS automatically recognizes it as a phone identifier and dispatches the 6-digit reset code via SMS to your registered device.

---

### Q: Can an unverified account use the Forgot Password feature?
**A:** No. You can only reset passwords for accounts that have an **Active** status and have completed their initial registration verification.

If an account is still pending verification, the system will reject the password reset request with a message indicating that the account is not verified and that the initial registration must be completed first.

---

### Q: Does resetting my password unlock my account if it was locked?
**A:** Yes. If your account was locked due to excessive failed login attempts or security triggers, successfully completing the **Forgot Password** verification flow automatically unlocks your account.

The system clears the account lock and removes any temporary lockout timer, allowing you to log in immediately with your newly created password.

---

### Q: What happens if I request a new password reset code while an existing code is pending?
**A:** Whenever you submit a new password reset request, HRMS automatically cancels and invalidates all previous password reset codes issued for that email or phone number.

Only the latest 6-digit code sent to you will be accepted by the system. Any earlier codes you received will be rejected as invalid.

---

## 7. Google Single Sign-On (Google Authentication)

### Q: How does "Continue with Google" work in HRMS?
**A:** The **Continue with Google** feature allows you to sign in or create an HRMS account using your verified Google credentials.

When you click the Google button, you authenticate with Google's secure sign-in popup. Once authenticated, Google verifies your identity to HRMS:
* If you are a **new user**, HRMS automatically provisions an active account for you with initial Guest access, using your Google name and verified email.
* If you are an **existing user** who registered via Google, you are signed in immediately and directed to your workspace or workspace picker.

---

### Q: Can I use Google Sign-In if I originally created my account with an email and password?
**A:** No. For security and account-integrity reasons, HRMS strictly enforces authentication provider separation.

If you initially registered your account using an email address and password, you cannot later sign in using Google with that same email address. The system will reject the login and display an error stating that the email was registered using a different authentication method. You must continue to sign in using your email and password.

---

### Q: What happens if my Google email address is unverified?
**A:** HRMS will reject the authentication attempt if Google reports that the email address associated with the Google profile has not been verified.

You must verify your email address through your Google Account settings before you can use it to access HRMS.

---

### Q: What profile information does HRMS collect from my Google account?
**A:** When you register through Google Sign-In, HRMS only imports the basic profile information provided by Google:

* Your verified email address.
* Your first name (given name).
* Your last name (family name).
* Your full display name.

HRMS does not access your Google passwords, personal files, emails, contacts, or any other Google services.

---

## 8. Account Security, Statuses & Troubleshooting

### Q: How long does an HRMS login session stay active?
**A:** An authenticated HRMS session remains active for **72 hours (3 days)**.

The system also maintains a secure background refresh token valid for **7 days**. If you use the system regularly within the 7-day window, your session automatically maintains continuity. If you remain inactive past the session lifetime, your session will time out and you will be asked to log in again.

---

### Q: What happens if my company HR administrator deactivates my employee profile?
**A:** In HRMS, access permissions are verified in real time on every authenticated request.

If an HR administrator deactivates, suspends, or deletes your organization membership, your access to that company workspace is revoked immediately. Even if your browser still holds an active session, your next click will be blocked with a notification stating that your access to the organization has been deactivated.

---

### Q: How do I securely log out of HRMS?
**A:** You can securely log out by opening your profile menu in the upper-right corner of the application and clicking **Log Out**.

When you log out, HRMS actively invalidates your session token across the entire system. Once logged out, the previous session token cannot be reused, even if someone attempts to use browser history navigation.

---

### Q: What should I do if I get an "Organization selection required" error?
**A:** This message occurs if you belong to multiple organizations but attempt to navigate directly into a specific feature URL without completing the workspace selection step.

To resolve this, navigate to the HRMS workspace selection screen, click on the company workspace you wish to work in, and proceed to your dashboard.

---

### Q: What should I do if my account is suspended or blocked?
**A:** If you see a notification that your account has been suspended or blocked when trying to log in or register:

1. **Contact your HR Department:** In most cases, suspensions occur when an employment status changes, an account is deactivated upon departure, or an organization's subscription is under review. Your company HR administrator can view and modify your membership status.
2. **Contact Platform Support:** If you believe your account was blocked in error or if you are an independent account owner, reach out to HRMS Customer Support with your registered work email address for assistance.

---

### Q: Why do I receive an "Invalid or expired OTP" message when I typed the code correctly?
**A:** An "Invalid or expired OTP" error typically happens under one of these conditions:

* **Expired time window:** More than 5 minutes have elapsed since the code was issued.
* **A newer code was requested:** If you clicked "Resend OTP" multiple times, only the most recently issued code is valid. Any earlier codes are instantly deactivated.
* **Already consumed:** The code has already been successfully verified once and cannot be used a second time.
* **Typographical error:** The 6-digit sequence was mistyped.

To resolve this, click **Resend OTP** on the verification screen, wait for the latest email or SMS, and enter the newly received 6-digit code promptly.
