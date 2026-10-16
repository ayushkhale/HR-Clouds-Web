---
title: "Settings & Preferences — Employee Guide"
role: "employee"
module: "auth"
status: "partial"
ui_available: "none"
source_document: "Settings & Preferences.md"
last_verified: "2026-09-10"
tags: ["settings", "preferences", "account settings", "password", "change password", "forgot password", "reset password", "sign in", "login", "google sign-in", "switch organization", "sign out", "log out", "notification preferences", "language", "accessibility", "two-factor"]
---

# Settings & Preferences — Employee Guide

**Document Information**
Role: Employee · Module: Account & Settings · Availability: Partial · User interface: None dedicated · Last verified: 2026-09-10

> **Documentation basis:** This document describes verified system behavior for the
> Employee role in the Dakshi HRMS platform. At the time of writing, the platform is
> delivered as a backend API with a reference dashboard prototype; a full production
> user interface is not yet released. Where a screen or navigation path is described,
> it reflects the reference Employee Dashboard prototype. Where no screen exists, this
> document describes what the system does, not where to click.
> **Last verified against source:** 2026-09-10

## 1. What Settings & Preferences Does for an Employee

Settings & Preferences covers the account and sign-in choices an employee actually has: how they sign in, how they reset a forgotten password, and how they move between organizations they belong to. It is much narrower than a traditional settings screen. Most items an older settings page would promise — notification channels, working-hour and shift preferences, remote-work status, language and accessibility options — are not part of the platform today.

A second, important idea in this document is the difference between **your settings** and **your organization's settings**. A few things are genuinely yours to control (your password, your active organization). Many other settings that affect your day — leave rules, attendance rules, payroll timing — are controlled by your organization, not by you. This document explains both, so you know what you can change and what only your organization can.

## 2. Availability and Access for the Employee Role

Settings & Preferences is **partially available**. The account and sign-in actions below are available to every employee. The personalization features described in older documentation (notification preferences, working-hour/shift/remote preferences, language and accessibility settings) are **not available**.

Access:

- **Role:** the sign-in and account actions are available to the employee role.
- **Subscription entitlement:** none. Signing in, resetting a password, and switching organizations are not behind a subscription gate.
- **Active organization:** viewing feature data requires operating within an active organization; signing in and resetting a password do not.

**User interface:** none dedicated. There is no dedicated settings screen in the reference Employee Dashboard prototype. The sign-in, password-reset, and organization actions are available through the platform's authentication interface. The reference dashboard does provide a **Log Out** action.

## 3. Where to Find Settings & Preferences

There is no dedicated settings screen in the reference Employee Dashboard prototype. Sign-in, password reset, and organization switching are handled through the platform's authentication interface; the reference dashboard exposes only a **Log Out** action. A dedicated settings screen has not been released.

## 4. Account and Sign-In Settings Available to an Employee

| Setting / action | Status | Notes |
| --- | --- | --- |
| Sign in with email and password | Available | Standard sign-in |
| Sign in with Google | Available | Google sign-in is supported |
| Reset a forgotten password | Available | Verified by a one-time code; see Section 5 |
| Change password while signed in | Not available | Use the forgotten-password flow instead; see Section 5 |
| Switch between your organizations | Available | If you belong to more than one; see Section 6 |
| Sign out (Log Out) | Available | Ends the current session |
| Notification preferences | Not available | See Section 9 |
| Working hours / shift / remote-work preferences | Not available | See Section 9 |
| Language and accessibility settings | Not available | See Section 9 |
| Two-factor authentication toggle | Not available | See Section 9 |

## 5. Your Password: Resetting a Forgotten Password

The platform has **one** way to set a new password: the forgotten-password flow. There is no separate "change password" option inside your account.

To set a new password:

1. On the sign-in screen, choose **Forgot Password** and enter your email.
2. The system sends a **one-time verification code** (OTP) to your email.
3. Enter the code together with your new password to complete the reset.

Because there is no in-account change-password option, the way to **change** a password you still know is the same flow: sign out and use **Forgot Password** to set a new one.

Your new password must meet these rules:

- at least **8 characters**, and
- it must include an **uppercase letter, a lowercase letter, a number, and a special character**.

A password that does not meet these rules is rejected with "Password must contain uppercase, lowercase, number and special character". The verification code is a **6-digit** code; an incorrect or expired code is rejected and you can request a new one.

If you signed up with **Google**, you sign in through Google rather than with a platform password.

## 6. Switching Between Organizations

If you belong to more than one organization on the platform, you can **switch** the organization you are currently working in. Switching changes which organization's data you see and act on; it does not change your account. If you belong to only one organization, there is nothing to switch.

When you first sign in and your account is linked to more than one organization, you select which organization to enter. After that, you can switch to another of your organizations without signing out and back in.

## 7. Settings Your Organization Controls That Affect You

Many settings shape your day but are **not yours to change** — your organization configures them, and you experience the result. Knowing they exist helps explain *why* the system behaves the way it does for you. You cannot see or edit these settings yourself; they are managed by your organization and are described here only so their effect is clear.

| Area | Examples of what your organization controls | Where you feel it |
| --- | --- | --- |
| Leave rules | Which leave types exist; annual quota; whether weekends between leave days are charged; whether long absences need a document; probation and notice-period limits; gender/marital eligibility for certain leave types | Applying for leave — see the Leave Management document |
| Attendance rules | Grace period for late arrival; regularization window; whether overtime is tracked; weekly-off days; the holiday calendar; your shift timing; location geofencing | Clocking in/out and regularizing — see the Attendance document |
| Payroll timing and tax | The pay cycle and pay day; currency; the financial-year start; the investment-declaration window and proof deadline; whether you may switch your tax regime | Payslips, declarations and tax — see the Payroll, Salary & Tax document |
| Reporting manager | Who your reporting manager is, and therefore who approves your leave | Approvals routing — see the Leave Management document |
| Feature availability | Whether attendance, leave, and payroll are included in the organization's plan | Whether those features work for you at all |

Two of these are worth calling out because employees often expect to control them:

- **Tax regime switching.** Whether you may change your own tax regime is an organization setting. If your organization does not allow it, an attempt is refused with "Employees are not allowed to switch tax regime". See the Payroll, Salary & Tax document.
- **Geofencing.** Your organization may define a location radius for clock-in. This is an organization setting, not a personal preference. A punch outside the radius may be flagged, but it does not block you from clocking in — see the Attendance document.

## 8. Signing Out

The reference Employee Dashboard provides a **Log Out** action that ends your current session. To sign back in, use your email and password or Google sign-in. Signing out is also the first step to changing a password you still know (Section 5).

## 9. Not Currently Available in Settings & Preferences

The following were described in older documentation but are **not available** in the platform:

- **Notification preferences** — there is no way to turn email, SMS, or push notifications on or off by category, and no Do-Not-Disturb hours. The platform does not send real-time notifications, so there is nothing to configure.
- **Working-hour, shift, and remote-work preferences** — an employee cannot set preferred working hours, choose a preferred shift, mark work-from-home days, or set an available/busy/offline status. Shifts and working-time rules are set by the organization (Section 7).
- **Geo-tagging as a personal preference** — location handling for attendance is an organization setting (geofencing), not a personal toggle.
- **Language selection** — the interface is not multi-language; there is no language picker.
- **Accessibility settings** — font-size, high-contrast, screen-reader, keyboard-navigation, and color-blind modes are not available as configurable settings.
- **Theme / dark mode** — there is no light/dark theme or display-preference switch.
- **Two-factor authentication (2FA) toggle** — there is no employee-facing setting to enable or disable two-factor authentication. (The one-time code used in the forgotten-password flow is part of that flow, not a 2FA setting you turn on.)
- **In-account change-password option** — password changes go through the forgotten-password flow (Section 5); there is no separate change-password setting.

## 10. Rules and Restrictions That Apply to Settings & Preferences

- The only way to set a new password is the **forgotten-password** flow; there is no in-account change-password option.
- A new password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.
- Organization switching is available only if you belong to more than one organization.
- The settings in Section 7 are controlled by your organization; you cannot view or change them yourself.
- Notification, working-hour/shift, language, accessibility, theme, and 2FA settings are not available.

## 11. Error and Non-Error Outcomes in Settings & Preferences

### The verification code was wrong or expired
When resetting a password, an incorrect or expired one-time code is rejected. Request a new code and enter the latest one; codes are 6 digits.

### The new password was rejected
If the new password does not meet the rules, the system reports "Password must contain uppercase, lowercase, number and special character". Choose a password of at least 8 characters that includes an uppercase letter, a lowercase letter, a number, and a special character.

### You cannot switch your tax regime
If your organization has not enabled employee regime switching, the attempt is refused with "Employees are not allowed to switch tax regime". This is an organization setting; contact HR. See the Payroll, Salary & Tax document.

## 12. When No Options Are Shown in Settings & Preferences

- If you belong to only one organization, there is no organization to switch to.
- If you signed up with Google, you sign in through Google and do not use a platform password.
- The personalization options in Section 9 do not appear because they are not part of the platform.

## 13. Limitations of Settings & Preferences

- **No in-account change-password option** — password changes use the forgotten-password flow.
- **No notification, working-hour, shift, remote-status, language, accessibility, theme, or 2FA settings.**
- **Organization-level settings (leave, attendance, payroll, reporting) are not employee-editable.**
- **No dedicated settings screen** in the reference dashboard — only a Log Out action.

## 14. Related Employee Features

- **Profile Management** — personal details you *can* edit (name, phone, addresses, and more) live in your profile, not here; see the Profile Management document.
- **Leave Management** — the leave rules your organization controls are described there; see the Leave Management document.
- **Attendance & Time Tracking** — grace periods, regularization windows, shifts, and geofencing are described there; see the Attendance document.
- **Payroll, Salary & Tax** — the pay cycle, declaration window, and tax-regime rules are described there; see the Payroll, Salary & Tax document.

## 15. Terminology Used in Settings & Preferences

| Term | Definition | Also called |
| --- | --- | --- |
| Forgotten-password flow | Setting a new password by verifying a one-time code sent to your email | Reset password, forgot password |
| One-time code | A 6-digit code sent to your email to verify a password reset | OTP, verification code |
| Organization switch | Changing which organization you are currently working in | Switch organization |
| Google sign-in | Signing in through a Google account instead of a platform password | Sign in with Google |
| Log Out | Ending your current session | Sign out |
| Organization setting | A choice your organization controls that affects you | Org setting, policy |

## 16. Common Employee Questions About Settings & Preferences

### How do I change my password?
There is no separate change-password option while signed in. To set a new password, sign out, choose **Forgot Password** on the sign-in screen, enter your email, and verify the 6-digit code sent to you along with your new password. The new password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.

### I forgot my password. How do I reset it?
On the sign-in screen choose **Forgot Password**, enter your email, and you will receive a 6-digit code. Enter the code with your new password to finish. If the code expires, request a new one.

### Can I sign in with Google?
Yes. Google sign-in is supported. If you signed up with Google, you sign in through Google rather than with a platform password.

### How do I switch to my other organization?
If you belong to more than one organization, you can switch the one you are currently working in without signing out. If you belong to only one, there is nothing to switch.

### How do I change my notification settings?
Notification preferences are not available. The platform does not send real-time notifications, so there is nothing to turn on or off, and there is no Do-Not-Disturb setting.

### How do I set my working hours, shift, or work-from-home status?
These are not employee settings. Working-time rules and shifts are configured by your organization (see Section 7). There is no preferred-hours, preferred-shift, or remote-status setting for employees.

### How do I change the language or turn on accessibility or dark mode?
Language selection, accessibility settings (font size, high contrast, screen reader, keyboard navigation, color-blind mode), and a light/dark theme are not available.

### How do I turn on two-factor authentication?
There is no employee setting to turn two-factor authentication on or off. The one-time code used when resetting a password is part of that flow, not a setting you enable.

## 17. Known Documentation Corrections

| Previously stated | Verified reality |
| --- | --- |
| Manage email / SMS / push notification preferences by category | Notification preferences are not available; the platform does not send real-time notifications |
| Do Not Disturb hours | Not available |
| Set preferred working hours, preferred shift, and auto-allocation | Not available; working-time rules and shifts are set by the organization |
| Mark remote-work status (available/busy/offline), WFH/hybrid schedules | Not available |
| Geo-tagging as a personal preference | Location handling for attendance is an organization geofencing setting, not a personal toggle |
| Multi-language selection | Not available; the interface is not multi-language |
| Accessibility settings (font size, contrast, screen reader, keyboard nav, color-blind) | Not available |
| Theme / dark mode | Not available |
| Manager-approval-required settings | Not applicable; these personalization settings do not exist |
| In-account change-password | Not available; password changes use the forgotten-password flow |

## Verification Record

**Verified on:** 2026-09-10
**Verification basis:** Application authentication routes and the organization settings registry, cross-checked against the Leave, Attendance, and Payroll source code.

**Confirmed available:** Sign in with email/password, sign in with Google, reset a forgotten password via a 6-digit code, switch between organizations, and sign out.
**Confirmed unavailable:** In-account change-password, notification preferences, working-hour/shift/remote-work preferences, geo-tagging as a personal preference, language selection, accessibility settings, theme/dark mode, and a two-factor-authentication toggle.
**Available without a user interface:** Sign-in, password reset, and organization switching — there is no dedicated settings screen; the reference dashboard exposes only Log Out.
**Could not be verified (excluded from this document):** None.
