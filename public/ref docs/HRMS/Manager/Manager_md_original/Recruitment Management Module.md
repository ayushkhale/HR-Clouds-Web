# **Recruitment Management Module** 

# **1. Create & Post Job Openings** 

- **Form-based job creation** : Title, department, location, type (FT/PT), description, skills, qualifications, salary range, closing date. 

- **Rich-text job editor** : Allow formatting, media embeds (images/videos), and templates for consistency. 

- **Multi-channel publishing** : Post jobs to career page, external job boards (LinkedIn, Indeed), and social media with a single click. 

- **Draft & preview** : Save as draft, preview in public view, then publish. 

- **Analytics snapshot** : Quick stats (views, clicks, applications) on live posts— modeled after recruitment dashboards 

<u>budibase.com+14geckoboard.com+14themeforest.net+14.</u> 

# **2. Schedule Interviews & Assign Panels** 

- **Candidate calendar view** : List pending interviews with filters (role, status, date). 

- **Panel assignment** : Add interviewers (from user list), define roles (e.g. Technical, HR, Manager). 

- **Availability sync** : Integrate with Outlook/G™ Calendar to show and select availability. 

- **Automated invites** : Send calendar invites to candidates and panel members with interview details and prep materials. 

- **Interview templates** : Pre-plan formats (coding test, behavioral) and evaluation criteria. 

# **3. Track Candidate Progress** 

- **Kanban/Stage tracker** : Columns like Applied → Screened → Interview → Offer → Hired/Rejected. 

- **Candidate timeline** : View every step for each candidate: application date, screening, panel assignments, notes, outcomes. 

- **Activity log** : Record recruiter actions with timestamps for audit purposes. 

- **Alerts & reminders** : Notifications for unrated interviews, missed steps, upcoming 

- deadlines. 

# **4. Manage Offer Letters & Onboarding Documents** 

- **Offer letter generator** : Auto-fill templates with candidate name, role, salary, start date; allow versioning and approval. 

- **E-signature integration** : Embed tools like DocuSign or Adobe Sign for quick acceptance. 

- **Document portal** : Upload and track onboarding docs: offer letters, NDAs, policy acknowledgments, ID proofs. 

- **Onboarding checklist** : Assign tasks to candidates (submit documents, complete forms) and to HR (create IT accounts, schedule orientation). 

- **Status dashboard** : Track which docs are pending, complete, or overdue. 

# **Panel UI & Technical Notes** 

# **Dashboard Home** 

- Summary cards: Active jobs, candidates in pipeline, upcoming interviews, offers awaiting acceptance. 

- Calendar section: Interviews and onboarding events. 

- Quick action buttons: “Create Job”, “Schedule Interview”, “Generate Offer”. 

# **Navigation Menu** 

- **Recruitment** 

   - Jobs & Postings 

   - Candidates & Pipeline 

   - Interviews & Panels 

   - Offers & Onboarding 

# **Design Considerations** 

- **Responsive layout** : Full support for desktop, tablet, and mobile. 

- **Consistent theming** : Use cards, tables, modals, Kanban boards. 

- **Access control** : RBAC to restrict module access (e.g., only HR can generate offers). 

- **Audit & logs** : Maintain history of changes, emails sent, documents uploaded. 

- **Search & filter** : Filter candidates by job, stage, date, skills. 

- **Integrations** : Calendar, email (SMTP / G-Suite), e-signature, external job boards. 

# **Sample Wireframe: Candidate Tracker (Kanban)** 

# scss 

# CopyEdit 

- [ Applied ]  [ Phone Screen ]  [ Interview ]  [ Offer ]  [ Hired ] 

- John D.      • Alice B.         • Tim W.        • Mary P.        • Elliot S. 

- (Job A)        (Job B)           (Job C)        (Job D)         (Job E) 

- [→ Screen]    [→ Schedule]       [→ Panel]      [→ Send Offer]   [Archive] 

   - Drag & drop between stages to update status. 

   - Each candidate card shows photo, progress bar, key interviews or notes. 

# **Checklist for Implementation** 

|**Feature Area**|**Included? Notes**|
|---|---|
|Job Post Form & Editor|<br>Multi-channel posting + analytics|
|Interview Scheduler|<br>Calendar sync + panel assignments|
|Candidate Tracking View|<br>Kanban + activity logs|
|Ofer Letter Manager|<br>Templates + e-sign|
|Document & Onboarding|<br>Upload + checklist|



# **Feature Area Included? Notes** 

Email alerts for actions Notifications & Reminders Role-based Access Control Configurable permissions Integrations Calendar, email, job boards Audit Logs Action history per candidate 

# **Additional Inspiration & Templates** 

- Stackby’s Recruitment Tracker offers structured tables for jobs, candidates, clients, placements 

<u>themeforest.net+2stackby.com+2multipurposethemes.com+2recruitcrm.iothemef orest.net+4themeforest.net+4themeforest.net+4.</u> 

- Budibase’s Applicants Tracking Template includes both public job portal and admin panel UI <u>budibase.com.</u> 

- Customize a Bootstrap-based admin template (e.g., ArchitectUI or AdminLTE) with sections for postings, pipeline, interviews, and onboarding <u>dribbble.com+3colorlib.com+3creative-tim.com+3.</u> 

