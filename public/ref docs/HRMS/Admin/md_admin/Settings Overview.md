# **Settings Overview** 

This panel allows the SaaS owner to centrally manage branding, licensing, features, and data policies on a per-client basis. It equips owners with granular control across client workspaces. 

# **2. Branding Options for Client Panel** 

# **What should be configurable:** 

- **Logo** : Upload client-specific logos. 

- **Theme** : Customizable color palette, fonts, and layout. 

- **Subdomain** : Assign URLs like client.companyhrms.com. 

# **Why it matters:** 

- Reinforces client identity. 

- Enhances adoption through tailored UI/UX. 

- Simplifies multi-tenant deployment. 

# **Considerations:** 

- Support various image types/sizes. 

- Preview capability before publishing. 

- Lock branding options once live. 

- Audit trail of branding changes. 

# **3. License Expiry & Renewal Settings** 

# **Key components:** 

- **Expiry Date** : Set client subscription expiry. 

- : Automated reminders to admin and client. 

- **Notifications** 

- **Grace Period** : Define post-expiry access terms. 

- **Renewal** : Options for auto-renewal or billing integrations. 

# **Value-add:** 

- Maximizes renewal rates and revenue. 

- Prevents tenant lockouts due to non-payment. 

- Streamlines renewals via integrations with payment or subscription platforms (e.g., Stripe, Chargify). 

# **Best practices:** 

- Show license status prominently on dashboard. 

- Provide ready-to-send renewal emails. 

- Track licenses per module or tier. 

# **4. Feature Toggles (Module Control)** 

# **What admins can manage:** 

- Enable/disable features (e.g., Leaves, Payroll, Recruiting) per client. 

- Configure feature sets per license tier. 

- Include optional add-ons available for activation. 

# **Why use this:** 

- Tailors platform capabilities to client needs. 

- Enables tiered pricing strategies. 

- Limits exposure to untested modules or features. 

# **Implementation tips:** 

- Centralize toggles in an “Modules” panel. 

- Require data migration or disable UI/UX when a module is turned off. 

- Log changes to audit access patterns. 

# **5. Data Retention & Export Options** 

# **Control types:** 

- **Retention Policies** : Define how long data is kept (e.g., Payroll: 7 years). 

- **Auto-delete** : Scheduled purging of expired data. 

- **Manual export** : Allow CSV/PDF exports by admins. 

- **Bulk export** : Include archived or archived client data. 

# **Why it matters:** 

- Meets GDPR, ISO, and local compliance. 

- Empowers clients to manage their historical data. 

- Reduces storage costs and avoids data bloat. 

# **Best practices:** 

- Display expires-on dates for records. 

- Notify clients before deletion. 

- Allow retentions overrides when legally necessary. 

- Log all metadata exports and deletions. 

# **6. Access Management & Security Controls** 

# **What to include:** 

- **User roles** : Super-admin vs. client admin. 

- **Permissions matrix** : Control who can change settings. 

- **Multi-factor authentication (MFA)** . 

- **Session and login policies** . 

# **Why it’s critical:** 

- Enforces least-privilege principle. 

- Adds protection via MFA and session controls. 

# **Implementation tips:** 

- Show role-based access in settings UI. 

- Integrate third-party identity providers (SSO, OAuth). 

- Log admin actions in an audit trail. 

# **7. Audit & Logging** 

- Track and timestamp every admin action. 

- Provide an audit log viewer with search and filter. 

- Enable downloads of logs for compliance reviews. 

# **8. Monitoring & Alerts** 

- **Dashboard** highlights expiring licenses, inactive modules, or policy noncompliance. 

- **Alerts** via email/SMS/webhook for critical events (e.g., impending license expiry). 

- **Reports** scheduling: weekly snapshots per client. 

# **9. UI/UX & Usability** 

- **Dashboard layout** : Clean with tabs for Branding, Licensing, Modules, Data, Security, and Logs. 

- **Inline help** : Tooltips and contextual tips. 

- **Preview modes** for branding. 

- **Batch actions** : Enable/disable features for groups of clients. 

# **10. Technical Considerations** 

- **Multi-tenant architecture** : Isolate settings and data per client. 

- **Customizable metadata** : Allow adding client-specific fields. 

- **Config versioning** : Safely roll back changes. 

- **API-driven** : Provide REST endpoints for managing all settings for automation. 

- **Performance** : Ensure responsive UI and low latency for updates. 

# **11. Compliance & Legal** 

- Configure **data privacy options** (e.g., anonymization, consent management). 

- Include acceptance of terms-of-service and privacy policies. 

- Capture timestamped client approvals of policy changes. 

# **12. Suggested Enhancements** 

- **White-label themes** with CSS package uploads. 

- **Sandbox mode** : Clients can test features before enabling. 

- **Usage analytics** : If a module is unused for 90 days, suggest deactivation. 

- **Interactive wizards** for onboarding or setup. 

- **Audit log integrations** : Export logs to SIEM/Splunk. 

# **Summary Table** 

|**Setting**|**Purpose**|**Admin Control**|
|---|---|---|
|Branding Options|Customize client identity|Logo, theme, subdomain|
|License & Renewal|Manage subscriptions|Expiry, renewal, grace, billing|
|Feature Toggles|Enable modular access per client|Module on/of, tier-specifc|
|Data Retention &<br>Export|Manage data lifecycle and<br>compliance|Policies, exports, auto-delete|
|Access Management|Secure panel confguration|Roles, MFA, SSO, session<br>control|
|Audit & Monitoring|Log actions and alerts|Logs viewer, dashboard, alert<br>confg|



# **Relevant Best Practices & Industry Notes** 

- **Access Management** : Emphasize authentication, role-based permissions, and auditability to ensure correct user provisioning and security <u>vendr.com+2jumpcloud.com+2techtarget.com+2servicenow.com+4cisco.com+4kp mg.com+4medium.comtechtarget.com.</u> 

- **License Modules** : Enable SaaS providers to optimize usage by dynamically enabling/disabling modules per tenant. 

- **Data Retention** : Retain data only as long as legally required, and purge proactively to reduce compliance risks and storage consumption. 

