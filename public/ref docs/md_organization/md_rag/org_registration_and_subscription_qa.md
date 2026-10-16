# HR & Organization Administrator Guide: Organization Registration & Subscription Plans (Q&A)

This document provides a comprehensive, stateless guide to creating a new company organization in the HRMS, configuring company profile information, selecting subscription tiers, processing payments, and understanding user limits.

---

### Organization Registration & Setup

**Q: What is Organization Registration in the HRMS?**
**A:** Organization Registration is the onboarding process that allows an authorized company representative to establish their company as an independent, secure workspace (tenant) in the HRMS.

When you register an organization, the system provisions dedicated company settings, an official company profile, initial role hierarchies, and a primary subscription workspace.

---

**Q: Who is eligible to register a new organization in the HRMS?**
**A:** Any newly registered user who holds an active account with a guest status can initiate the creation of a new organization.

Once you complete the registration and subscription process, your account is automatically elevated to the official Human Resources (HR) Administrator role for that organization.

---

**Q: What information is required to register an organization?**
**A:** When registering your organization, you provide the following company details:
- **Company Name:** The official legal or business name of your company (required).
- **Organization Alias:** A familiar short name or acronym used across internal dashboards.
- **Industry:** The operational sector of your business (such as Information Technology, Healthcare, Manufacturing, or Retail).
- **Company Size:** The approximate headcount range of your workforce (such as 1–10, 11–50, 51–200, etc.).
- **Website:** The official corporate web address.
- **Phone Number:** The primary corporate contact phone number.
- **Tax Identification (GST & PAN):** Government registration numbers (such as GSTIN and Company PAN) for business invoicing and tax compliance.
- **Subscription Plan Code:** The specific tier you are selecting for your company.

---

### Free Plans vs. Paid Subscription Plans

**Q: How does registration differ between a Free Plan and a Paid Plan?**
**A:** The registration workflow adapts depending on the selected plan type:
- **Free Plan:** Activation is immediate. Because no financial transaction is required, the system instantly sets your organization status to "Active", creates your subscription, assigns you the HR Administrator role, and generates your HR dashboard access credentials.
- **Paid Plan:** Activation requires payment verification. The system provisions your organization profile in a "Pending" state and generates a secure checkout order through the payment gateway (Razorpay). Your organization is activated as soon as payment is confirmed.

---

**Q: What happens immediately after a Free Plan registration is submitted?**
**A:** For a Free Plan, the system executes the following automated steps within seconds:
1. Activates your organization workspace.
2. Creates an active organization subscription record.
3. Automatically assigns you the top-level **HR Administrator** role.
4. Generates a unique HR employee identification code (for example, `HR-A1B2C3`).
5. Creates your administrative profile under Human Resources.
6. Replaces your temporary guest session with full HR administrative access credentials, directing you straight to the HR Management Dashboard.

---

### Payment Processing & Verification (Paid Plans)

**Q: How do payments work for Paid Subscription Plans?**
**A:** When you select a paid plan, the system opens a secure Razorpay payment window displaying the plan amount and currency. You can complete the payment using credit/debit cards, UPI, net banking, or corporate corporate payment options.

---

**Q: What happens when a payment is completed successfully?**
**A:** Once your payment is completed:
1. The payment gateway returns an encrypted payment confirmation and transaction identifier.
2. The HRMS cryptographically verifies the authenticity of the transaction to prevent tampering or fraud.
3. Upon verification, the system marks the transaction as successful, activates your organization, creates your subscription, promotes your account to HR Administrator, and issues your new administrative login credentials.

---

**Q: What happens if my internet disconnects right after my card is charged?**
**A:** The HRMS payment system is built with automated idempotency safeguards:
- If a network interruption occurs after you are charged by the payment gateway, your payment record is preserved.
- When your browser reconnects or retries the payment verification step, the system detects the completed transaction, safely skips duplicate processing without double-charging, and seamlessly finalizes your organization activation.

---

**Q: What should I do if my payment fails or is declined?**
**A:** If your payment is declined by your bank or payment gateway:
- The system logs the attempt and leaves your organization in the pending state without charging you.
- You will see an error notification explaining that the payment could not be completed.
- You can simply retry the payment using an alternate payment method or card.

---

### Subscription Tiers & Member Limits

**Q: What are Subscription Member Limits?**
**A:** Every subscription plan has defined capacity thresholds designed for different organization sizes:
- **Maximum Employees:** The total number of staff holding the Employee role who can belong to your organization simultaneously.
- **Maximum Managers:** The allowed number of users who can hold the Manager role.
- **Maximum HR Administrators:** The allowed number of users who can hold the HR role.

Certain premium or enterprise tiers offer unlimited capacity for these roles.

---

**Q: What happens when an organization reaches its plan limit?**
**A:** The system automatically checks your active member count whenever an administrator or manager attempts to send an invitation:
- If your organization has already reached the maximum allowed employees or managers under your current plan, the system blocks the invitation with a "Limit Exceeded" alert.
- To invite additional team members, an HR Administrator must upgrade the organization's subscription plan to a tier with higher capacity.
