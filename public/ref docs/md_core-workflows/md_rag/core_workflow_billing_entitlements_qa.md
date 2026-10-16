# HRMS Core Workflow Guide: Billing, Subscription Tiers & Feature Entitlements (Q&A)

This document provides a comprehensive, stateless Question & Answer guide to subscription plans, live plan pricing, member headcount limits, role capacity rules, automatic free tier provisioning, payment processing, and organization-scoped billing boundaries within the HRMS.

---

### Subscription Plans & Headcount Capacity Overview

In the HRMS, all subscription plans provide access to the core platform capabilities—including employee directory management, daily attendance tracking, leave policy configuration, and monthly payroll processing. Currently, the **primary difference between the subscription plans is the headcount capacity**—specifically the maximum number of **Employees**, **Managers**, and **HR Administrators** an organization is allowed to add. Every new organization begins with the **Free Plan**, which allows small teams to onboard up to 10 employees, 2 managers, and 1 HR administrator at zero cost forever. When an organization expands beyond these limits, it can seamlessly upgrade to the **Starter Plan** (supporting up to 20 employees, 5 managers, and 2 HR administrators at ₹49.00/month or ₹500.00/year) or the **Growth Plan** (supporting up to 300 employees, 10 managers, and 5 HR administrators at ₹99.00/month or ₹990.00/year with a 17% annual discount).

---

### Plan Comparisons & Role Allocation Rules

| Plan Name | Billing Cycle | Price (INR) | Max Employees Allowed | Max Managers Allowed | Max HR Admins Allowed | Total Seat Capacity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Free Plan** | Lifetime | **₹0.00** | **10 Employees** | **2 Managers** | **1 HR Admin** | **13 Total Members** |
| **Starter Monthly** | Monthly | **₹49.00 / month** | **20 Employees** | **5 Managers** | **2 HR Admins** | **27 Total Members** |
| **Starter Yearly** | Yearly | **₹500.00 / year** *(Save 17%)* | **20 Employees** | **5 Managers** | **2 HR Admins** | **27 Total Members** |
| **Growth Monthly** | Monthly | **₹99.00 / month** | **300 Employees** | **10 Managers** | **5 HR Admins** | **315 Total Members** |
| **Growth Yearly** | Yearly | **₹990.00 / year** *(Save 17%)* | **300 Employees** | **10 Managers** | **5 HR Admins** | **315 Total Members** |

---

### Core Plan Differences & Role Capacity (Q&A)

**Q: What is the main difference between the Free, Starter, and Growth subscription plans?**
**A:** Currently, the primary difference between the subscription plans is the headcount limit—specifically the maximum number of Employees, Managers, and HR Administrators you are permitted to add to your organization.

All plans grant access to the core HRMS functional suite, including employee profiles, attendance tracking, leave requests, and monthly payroll calculations. Upgrading from the Free Plan to Starter or Growth expands your organization's seat allocation so you can onboard larger teams and assign more supervisory and administrative roles.

---

**Q: Do different plans have completely different HRMS features, or is it purely a headcount limit?**
**A:** For everyday operations, the primary factor distinguishing the plans is the allowed headcount of employees, managers, and HR administrators.

Regardless of whether you are on Free, Starter, or Growth, your organization can set up salary components, run monthly payroll, configure leave types, and record daily attendance. Upgrading to a higher tier is required when your active team size exceeds the member caps of your current plan.

---

**Q: How do the employee headcount limits differ across the plans?**
**A:** Each plan defines a strict cap on the number of regular staff (employees) you can invite:

- **Free Plan:** Supports up to **10 Employees**. Ideal for startups, small clinics, or boutique firms.
- **Starter Plan:** Supports up to **20 Employees**. Perfect for growing teams and small businesses scaling past the 10-person mark.
- **Growth Plan:** Supports up to **300 Employees**. Designed for mid-sized companies, regional offices, and expanding enterprises.

---

**Q: Why are Managers and HR Administrators counted separately from regular Employees?**
**A:** The HRMS maintains separate quotas for each role category (`Max Employees`, `Max Managers`, and `Max HRs`) to preserve balanced administrative ratios and ensure proper governance.

In any organization, managers hold approval authorities (such as approving leave and regularizations) and HR administrators hold financial and configuration controls (such as editing salary structures and approving payroll). Having distinct caps ensures that organizations maintain structured reporting lines without overloading administrative privileges.

---

**Q: What happens if our company has only 8 employees, but we need 3 Team Managers?**
**A:** You must upgrade to the **Starter Plan** because the Free Plan strictly caps managers at 2.

Even though your total employee count (8) is below the Free Plan's 10-employee limit, your managerial requirement (3) exceeds the Free Plan's limit of 2 managers. The Starter Plan permits up to 5 managers, allowing you to appoint your third manager immediately.

---

**Q: What should we do if our organization needs more than 2 HR Administrators?**
**A:** You must upgrade to the **Growth Plan**, which permits up to **5 HR Administrators**.

The Free Plan allows only 1 HR administrator, and the Starter Plan allows up to 2 HR administrators. If your organization operates across multiple locations or shifts and requires 3, 4, or 5 distinct HR administrators to manage operations, the Growth Plan provides the necessary administrative capacity.

---

**Q: How do I know which subscription plan my organization should choose?**
**A:** Choose your subscription plan based on your current active roster and planned hires:

1. **Choose Free Plan if:** Your total workforce is 10 or fewer employees, requires no more than 2 managers, and is managed by a single HR administrator.
2. **Choose Starter Plan if:** Your workforce is between 11 and 20 employees, or you require between 3 and 5 managers, or you need 2 HR administrators.
3. **Choose Growth Plan if:** Your workforce exceeds 20 employees (up to 300), or you require up to 10 managers, or you require up to 5 HR administrators.

---

**Q: How much do organizations save by selecting Yearly (Annual) Billing instead of Monthly Billing?**
**A:** Annual billing plans include a built-in **17% discount** compared to paying month-to-month:

- **Starter Plan:** Paying monthly costs ₹49.00 × 12 = ₹588.00 per year. The Starter Yearly plan costs **₹500.00 per year**, saving you ₹88.00 annually.
- **Growth Plan:** Paying monthly costs ₹99.00 × 12 = ₹1,188.00 per year. The Growth Yearly plan costs **₹990.00 per year**, saving you ₹198.00 annually.

Organizations with stable headcount benefit financially by choosing annual billing cycles.

---

**Q: Can an organization on the Free Plan still run complete monthly payroll?**
**A:** Yes. Core payroll processing is enabled on all subscription tiers, including the Free Plan.

Small organizations on the Free Plan can set up salary components, assign salary structures, and process monthly payroll runs for up to 10 employees without purchasing a paid subscription.

---

### Member & Headcount Limit Enforcement

**Q: What happens if I attempt to invite an 11th employee while on the Free Plan?**
**A:** The system will immediately intercept and block the invitation:

When an HR administrator or manager attempts to send an invitation that would exceed the active plan's headcount cap (e.g., inviting an 11th employee on the Free Plan, or a 21st employee on the Starter Plan), the system displays an alert: *"Employee limit reached for current subscription plan. Upgrade your plan to invite more members."* The invitation email is not sent until an administrator upgrades the subscription.

---

**Q: Can an organization upgrade its subscription plan at any time?**
**A:** Yes. An HR administrator can upgrade the company's subscription at any point from the **Billing & Subscriptions** section.

Upon selecting a higher tier (e.g., upgrading from Free to Starter, or Starter to Growth) and completing the checkout, the new member limits are applied instantly. The administrator can immediately resume sending invitations to new employees, managers, or HR personnel without any waiting period.

---

**Q: What happens to existing employee profiles if an organization downgrades its plan?**
**A:** If an organization chooses to downgrade to a plan with lower headcount limits, existing employee profiles are not automatically deleted.

However, the organization will be restricted from inviting new employees or reactivating past profiles until its total active headcount is brought within the new plan's limits.

---

### Automatic Free Tier Provisioning

**Q: What happens when a new company registers on the HRMS?**
**A:** When a user registers a brand-new organization, the system automatically provisions a **Free Tier Subscription** immediately upon registration.

This instant provisioning allows the company to begin setting up departments, inviting initial team members (up to 10 employees, 2 managers, and 1 HR administrator), and configuring basic attendance rules immediately without requiring a credit card or payment upfront.

---

### Feature Entitlements & Gating Architecture

**Q: What is Feature Entitlement in the HRMS?**
**A:** Feature Entitlement is the automated security gatekeeper that verifies whether an organization is authorized to access a specific capability before executing an action.

Whenever a user attempts to open a section or trigger an operation, the system checks:
1. Does the organization have an active, non-expired subscription?
2. Is the requested feature enabled on the organization's active plan?

If both conditions are met, the action proceeds seamlessly. If a feature or role limit is exceeded, the system displays a descriptive notice explaining the restriction.

---

**Q: What is the "Fail-Closed" security rule for feature entitlements?**
**A:** The HRMS adheres to a strict fail-closed security principle to ensure data integrity and licensing compliance.

If a network interruption or temporary service issue occurs while checking an organization's subscription status, the system defaults to denying access to restricted operations rather than accidentally granting unauthorized access. Once the connection is restored, normal authorized access resumes immediately.

---

### Payment Processing & Subscription Renewals

**Q: How are subscription payments processed in the HRMS?**
**A:** The HRMS integrates with secure payment gateways (such as Razorpay) to process credit cards, debit cards, UPI, and corporate net banking.

When an administrator upgrades a plan:
1. The administrator selects the desired plan tier and billing cycle (Monthly or Annual).
2. The system initiates a secure checkout modal.
3. Upon successful payment authorization by the bank, the gateway sends a cryptographically signed confirmation to the HRMS.
4. The system validates the payment, updates the organization's subscription status, and instantly activates the expanded headcount limits.

---

**Q: How does the system prevent double-charging on payment retries?**
**A:** The system enforces strict payment idempotency using unique transaction identifiers.

When payment gateways transmit confirmation notices (webhooks), slow networks or gateway retries can sometimes send multiple notifications for the exact same transaction. The HRMS tracks every processed transaction identifier; if an identical confirmation is received a second time, the system recognizes the duplicate, safely acknowledges it, and ensures the organization's plan is not charged or credited twice.

---

### Organization-Scoped Billing Boundaries

**Q: If I am an HR Administrator in two different companies, does my paid subscription transfer between them?**
**A:** No. Subscription plans and headcount limits are strictly bound to the **organization**, not to your personal login account.

*Example:* If you manage Company A (which subscribes to the Growth Plan with 300 employee seats) and also manage Company B (which is on the Free Plan):
- When working within Company A, you have access to the 300-employee capacity.
- When you switch to Company B, your workspace is governed solely by Company B's Free Plan (10 employee cap). You cannot invite more than 10 employees in Company B unless Company B independently upgrades its subscription.

---

**Q: What happens if an organization's subscription renewal payment fails?**
**A:** When a scheduled subscription renewal fails (e.g., due to an expired corporate card or insufficient funds):

1. The system marks the subscription with a **Grace Period** status.
2. Organization administrators receive automated billing alerts notifying them to update their payment method.
3. During the grace period (typically a few days), core operations remain accessible to avoid business disruption.
4. If payment is not updated before the grace period ends, the workspace transitions to Free Tier restrictions (capping active seats at 10 employees) until payment clears.

---

**Q: What should an administrator do if money was deducted from the company bank account, but the subscription status did not update?**
**A:** If a banking payment cleared but the HRMS dashboard does not reflect the new subscription tier within 10 minutes:

1. Refresh the browser and check the **Billing & Subscriptions** section to confirm if the status updated.
2. Locate the **Payment Transaction ID** from your bank confirmation SMS or Razorpay payment receipt.
3. Open a support ticket with your organization name and the transaction ID.
4. Support can verify the payment reference with the gateway and manually synchronize your active subscription.
