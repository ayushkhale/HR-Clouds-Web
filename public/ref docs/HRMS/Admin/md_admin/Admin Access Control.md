# **Admin Panel — Access Management** 

# **1. Admin Access Control Overview** 

The Super Admin (SaaS Owner) oversees and manages all client-company admin accounts, ensuring secure, role-based access to the HRMS modules. This includes granting, updating, and revoking permissions, enforcing login policies, and ensuring auditability across tenants. 

# **2. Assign Admin Access** 

# **Select Client Company** 

- Dropdown or auto-complete selector listing all active client companies under the SaaS umbrella. 

- Once selected, display current admins for that company, plus action buttons like “Add New Admin” and “Bulk Upload Admins”. 

# **Add New Admin** 

A form to onboard a new company-level admin: 

1. **Name** (required) 

2. **Email** (required; validated format) 

3. **Designation** (optional) 

4. **Role Permissions** (radio/group of checkboxes): 

   - **Full** : Access to all modules (HR + Payroll + Recruitment) 

# `o` **HR only** 

- **Payroll only** 

# `o` **Recruitment only** 

`o` _(Future-proof: ability to add custom or combination roles)_ 

5. **Status** : Active / Inactive toggle 

`o` _Inactive admins cannot log in but retain their configuration for reactivation._ 

6. **Two-Factor Authentication** : 

`o` Checkbox or toggle (Yes/No) enabling mandatory 2FA. 

- Option to select method (e.g., SMS, Authenticator App). 

# 7. **IP Whitelist (optional)** : 

`o` Input field(s) for specifying allowed IP addresses/ranges. 

- Helps enforce secure/geofenced logins. 

# 8. **Save / Cancel** buttons 

`o` On saving, send invitation email with one-time link to finish setup. 

# 9. **Audit Trail Logging** : 

`o` Log entry capturing Super Admin username, timestamp, and action details. 

# **3. View Admins (By Client Company)** 

Once a company is chosen, display its admins in a searchable list/table: 

# • **Columns** : 

- Name 

- Email 

- Designation 

`o` Role(s) 

`o` Status 

`o` 2FA-enabled (Yes/No) 

- Last login 

# • **Filters** : 

- Company (if managing several simultaneously) 

- Role Permissions 

- Status (Active / Inactive) 

- 2FA status 

# • **Bulk Actions** : 

# `o` Activate / Deactivate 

- Revoke 2FA 

- Re-invite/cancel pending invites 

# **4. Individual Admin Actions** 

Each admin row includes an “Actions” dropdown with: 

# **Revoke Access** 

- Immediately disables login. 

- Optionally archives the admin account for auditing. 

# **Reset Password** 

- Sends a secure one-time link via email. 

- Logs reset event in audit trail. 

# **Impersonate (“View As…”)** 

- Enable the Super Admin to log in as that admin for troubleshooting. 

- Must request password confirmation and log both start/end times with IP. 

# **Edit Admin** 

- Modify any settings: email, designation, role, 2FA, IP whitelist, status. 

# **Delete Admin** 

- Permanently remove admin access (if allowed)—use with caution. 

- Option to soft-archive for record-keeping. 

# **5. Audit & Compliance Features** 

- **Audit Log** : 

   - Detailed, timestamped record of all access control actions. 

   - Exportable CSV or PDF. 

- **Compliance Reporting** : 

   - Quick reports showing: 

      - Active vs. inactive admins 

      - 2FA adoption rates 

      - IP restriction enforcement 

      - Admin count per company 

# **6. Security Best Practices & Recommendations** 

- **Principle of Least Privilege** : Encourage assigning minimal role permissions; custom roles, if needed. 

- **Enforce 2FA** : Set policy requiring TFA for all active admins. 

- **IP Restriction** : Use whitelisting in higher-risk environments. 

- **Regular Review Cycles** : Prompt Super Admins monthly to review and revoke stale/inactive accounts. 

- **Login Monitoring & Alerts** : Notify Super Admin on unusual login patterns or failed attempts. 

- **Impersonation Safeguards** : Branding/banners + session auditing to ensure transparency. 

# **7. UX Flow Suggestions** 

1. **Dashboard → Access Control** entry shows summary (e.g., “42 admins across 5 companies”). 

2. **Select Company** → reveal onboarding form, table, quick-stats (active, inactive, needs 2FA). 

3. **Add New Admin** → inline form or modal with “Save” → confirmation modal + email 

sent. 

4. **Filter/Search** → typeahead filters for quick retrieval. 

5. **Action Dropdown** per row → context menu for key operations. 

6. **Logs & Reporting** → accessible via separate tab or menu within Access Management. 

# **8. Potential Enhancements** 

- **Bulk CSV Import** for large enterprises to onboard many admins. 

- **Customizable Admin Roles** beyond the default four. 

- **Integration with SSO/SCIM** for auto-provisioning and synchronization. 

- **Expiration Settings** to automatically deactivate temporary or contract admins. 

- **Mobile Admin App** for on-the-go configuration and access revocation. 

# **Summary** 

This comprehensive Access Management module empowers the SaaS Owner with: 

- Clear, role-based onboarding of client company admins 

- One-click controls for revoking, resetting, impersonating, or editing access 

- Security-conscious design with 2FA, IP whitelisting, and audit trails 

- Scalable features like role customization, bulk onboarding, SSO sync 

- A user-friendly and secure interface that aligns with compliance and best practices 

