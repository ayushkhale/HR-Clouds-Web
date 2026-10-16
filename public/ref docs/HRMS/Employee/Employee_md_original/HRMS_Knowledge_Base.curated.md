# Dakshi HRMS — Employee Panel: Complete Knowledge Base

> **Compiled from:** 14 requirement documents (PDFs) in the Employee specification folder
> **Purpose:** Serve as the single source of truth for understanding, planning, and building the entire HRMS Employee Panel
> **Last Updated:** 2026-07-23

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Module Registry](#2-module-registry)
3. [Module Deep Dives](#3-module-deep-dives)
   - [3.1 Personal Dashboard](#31-personal-dashboard)
   - [3.2 Profile Management](#32-profile-management)
   - [3.3 Attendance & Time Tracking](#33-attendance--time-tracking)
   - [3.4 Leave Management](#34-leave-management)
   - [3.5 Payroll & Salary](#35-payroll--salary)
   - [3.6 Performance & Appraisal](#36-performance--appraisal)
   - [3.7 Training & Development](#37-training--development)
   - [3.8 Document Management](#38-document-management)
   - [3.9 Expense & Reimbursement](#39-expense--reimbursement)
   - [3.10 Communication & Collaboration](#310-communication--collaboration)
   - [3.11 Helpdesk & Support Tickets](#311-helpdesk--support-tickets)
   - [3.12 Settings & Preferences](#312-settings--preferences)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Inter-Module Dependencies](#5-inter-module-dependencies)
6. [Technology Stack Alignment](#6-technology-stack-alignment)
7. [Phased Build Roadmap](#7-phased-build-roadmap)

---

## 1. System Overview

**Dakshi HRMS** is a comprehensive Human Resource Management System designed as a self-service employee portal. The system transforms traditional HR functions into an automated, transparent, and mobile-first experience.

### Core Principles
- **Self-Service First** — Employees manage their own data; reduces HR queues and paperwork
- **Real-Time Everything** — Live dashboards, instant notifications, real-time status tracking
- **Policy-Driven Automation** — Business rules are configurable, not hardcoded
- **Mobile-First & Secure** — Cross-platform (Web, iOS, Android) with enterprise-grade security
- **Compliance Built-In** — GDPR, labor laws, statutory regulations baked into the platform

### Security & Compliance Standards
| Area | Specification |
|------|--------------|
| Encryption | 256-bit SSL/TLS for communication |
| Authentication | Multi-Factor Authentication (MFA) |
| Authorization | Role-Based Access Control (RBAC) |
| Data Privacy | GDPR compliant data handling |
| Legal | Adheres to labor laws — wage protection, employee privacy, grievance redressal |
| Backup | Regular automated backups with disaster recovery |

---

## 2. Module Registry

The Employee Panel consists of **12 functional modules** + 1 overarching dashboard:

| # | Module | Source Document | Priority | Status |
|---|--------|----------------|----------|--------|
| 1 | Personal Dashboard | `Personal Dashboard Features.pdf` | 🔴 Critical | Foundation |
| 2 | Profile Management | `🔧 Key Functions Under Profile Management.pdf` | 🔴 Critical | Foundation |
| 3 | Attendance & Time Tracking | `Attendance.pdf` | 🔴 Critical | Phase 1 |
| 4 | Leave Management | `Leave Management Module.pdf` | 🔴 Critical | Phase 1 |
| 5 | Payroll & Salary | `Payroll & Salary Module.pdf` | 🟠 High | Phase 2 |
| 6 | Performance & Appraisal | `Performance & Appraisal.pdf` | 🟠 High | Phase 2 |
| 7 | Training & Development | `Training & Development.pdf` | 🟡 Medium | Phase 3 |
| 8 | Document Management | `Document Management.pdf` | 🟡 Medium | Phase 2 |
| 9 | Expense & Reimbursement | `Expense & Reimbursement.pdf` | 🟡 Medium | Phase 3 |
| 10 | Communication & Collaboration | `Communication & Collaboration.pdf` | 🟡 Medium | Phase 3 |
| 11 | Helpdesk & Support Tickets | `Helpdesk & Support Tickets.pdf` | 🟢 Standard | Phase 4 |
| 12 | Settings & Preferences | `Settings & Preferences.pdf` | 🟢 Standard | Phase 1 |

Additionally referenced:
- `Core Functionalities of HRMS Services.pdf` — System-wide overview
- `Employee panel.pdf` — Panel-level feature summary

---

## 3. Module Deep Dives

### 3.1 Personal Dashboard

**Source:** `Personal Dashboard Features.pdf`

The landing page every employee sees after login. A customizable, real-time overview of their work life.

#### Features

| Feature | Description |
|---------|------------|
| **Quick Overview** | Today's attendance status, leave balance, upcoming holidays, pending tasks & deadlines |
| **Real-Time Notifications** | HR announcements, birthday/anniversary wishes, policy updates, reminders |
| **Customizable Widgets** | Drag-and-drop layout of modules (tasks, attendance, payroll). Dark/light mode toggle. Widget visibility preferences |
| **Calendar View** | Task deadlines, holidays, training schedules. Optional Outlook/Google Calendar sync |
| **Personalized Greetings** | Dynamic welcome message, motivational quote/tip of the day, weekly productivity stats |

#### Key Data Inputs (from other modules)
- Attendance status → from **Attendance Module**
- Leave balance → from **Leave Module**
- Upcoming holidays → from **Holiday Calendar** (shared)
- Pending tasks → from **Performance/Training** modules
- Announcements → from **Communication Module**
- Payslip status → from **Payroll Module**

---

### 3.2 Profile Management

**Source:** `🔧 Key Functions Under Profile Management.pdf`

Complete employee profile lifecycle management with HR approval workflows.

#### Core Functions

**1. Personal Information Management**
- Full name, DOB, gender, marital status, nationality
- Contact details: permanent/current address, phone (mobile + alternate), official/personal email
- All changes go through **HR approval workflow** before final submission

**2. Emergency Contact Management**
- Add/update emergency contacts with relationship, phone, address
- Mark primary emergency contact

**3. Document Upload & Management**
- Supported documents: Aadhar Card, PAN Card, Passport, educational certificates, professional certifications, resumes, experience letters, joining documents
- Auto-validation of document format
- Expiry alerts for time-bound documents (ID proofs, visas)

**4. Employment History & Role Tracking**
- Complete lifecycle: date of joining, past roles, departments, promotions, designations, transfers, reporting manager history
- Downloadable employment history report

**5. Profile Picture Upload**
- Professional photo used across internal tools and portals

**6. HR Approval Workflow**
- Employee changes → sent to HR/admin for approval → then committed

**7. Alerts & Notifications**
- Missing profile details reminders
- Document expiry/renewal alerts
- Profile completion status tracker

---

### 3.3 Attendance & Time Tracking

**Source:** `Attendance.pdf`

Real-time monitoring of employee presence, working hours, and attendance behavior.

#### Core Functions

**1. Multi-Mode Clock In/Out**
- **Biometric Devices** — fingerprint/face recognition
- **Web Portal** — secure login from office systems
- **Mobile App** — with GPS & geofencing support for field staff
- Real-time sync across all devices

**2. Attendance Dashboard**
- Daily, weekly, monthly summaries
- Total hours worked, late arrivals, early departures
- Working days, absences, holidays
- Color-coded visualization for trends

**3. Regularization Request System**
- Request types: missed punches, incorrect in/out times, half-day/full-day adjustments
- Routed to reporting manager or HR for approval
- Status tracking: pending → approved → rejected
- Full audit trail on all changes

**4. Real-Time Alerts**
- Missed attendance logs
- Approval pending notifications
- Shift changes or work-hour anomalies

**5. Payroll & Leave Integration**
- Attendance data → **Payroll Module** (pay calculation based on present days/hours)
- Attendance data → **Leave Module** (deduct or regularize leaves)

**6. Compliance & Policy Engine**
- Grace time, late-coming rules
- Overtime calculation
- Weekly offs and holiday rules
- Customizable shift rosters
- Auto-shift detection

---

### 3.4 Leave Management

**Source:** `Leave Management Module.pdf`

Complete leave lifecycle from application to approval with policy enforcement.

#### Core Functions

**1. Apply for Leave**
- Leave types: Casual Leave (CL), Sick Leave (SL), Paid Leave (PL)/Earned Leave (EL), Maternity/Paternity Leave, Compensatory Off, Work From Home (WFH)
- Upload supporting documents (e.g., medical certificates)
- Options: full day, half day, hourly leave
- Real-time leave balance preview before applying

**2. Leave Balance Tracking**
- Real-time balance per leave type
- Carry-forward and lapsed leave tracking
- Auto-update on approval/rejection
- HR visibility rules for leave encashment/pending leaves

**3. Leave Approval Workflow**
- Multi-level configurable: Team Lead → Department Head → HR
- Approvers see leave history, workload impact, alternatives
- Instant notification post approval/rejection

**4. Leave History Dashboard**
- Status tracking: Approved / Pending / Rejected / Cancelled
- Export for any date range
- Integrated remarks for each approval decision

**5. Holiday Calendar Integration**
- Company-wide and region-specific calendars
- Auto-rejection for overlapping non-working days (optional)
- HR can announce new/restricted holidays

**6. Policy Enforcement & Auto Rules**
- Max leaves per month/year
- Minimum notice period
- Sandwich rule (if applicable)
- Late application penalties, blocked periods
- System-based eligibility checker

**7. Notifications**
- Email/SMS/system alerts for: submission, approval/rejection, unused leave reminders
- Manager alerts for long leaves

---

### 3.5 Payroll & Salary

**Source:** `Payroll & Salary Module.pdf`

Employee-facing payroll transparency and self-service.

#### Core Functions

| Function | Details |
|----------|---------|
| **Payslip Access** | View/download monthly PDF payslips, annual salary slips, historical salary records |
| **Salary Structure** | Basic pay, HRA, special allowances, performance components, bonuses, incentives, overtime. Fixed vs variable breakdown |
| **Tax Information** | Monthly/annual TDS deductions, investment declaration status, tax saving projections, Form 16 download |
| **Deductions & Reimbursements** | PF, ESI, professional tax tracking. Reimbursement status (travel, phone, internet). Claim submission & tracking |
| **Loan & Advance Management** | Company loan/salary advance details, EMI schedule, pending balance, direct deduction status |
| **Bonus & Incentive Details** | Earned/upcoming bonuses, incentive structure linked to performance metrics |

#### Integration Points
- **Input from Attendance**: present days, working hours, overtime → salary calculation
- **Input from Leave**: approved leave days → leave deduction or encashment
- **Input from Expense**: approved reimbursements → salary addition

---

### 3.6 Performance & Appraisal

**Source:** `Performance & Appraisal.pdf`

Structured performance management with transparency and continuous feedback.

#### Core Functions

**1. Performance Review Dashboard**
- Past/current appraisal results
- Department-wise and individual metrics
- Historical trends and improvement areas
- Personalized KPIs set by manager or HR

**2. KPI & Goal Management**
- Track assigned KPIs with weightage
- Monitor progress: individual, team, company goals
- Due dates, milestones, automatic deadline reminders

**3. Manager & Peer Feedback**
- Direct manager/team lead feedback
- 360° feedback from peers, subordinates, cross-functional teams
- Highlighted strengths and improvement areas
- Periodic feedback session summaries

**4. Self-Assessment Portal**
- Submit self-evaluations per appraisal cycle
- Rate performance against KPIs/goals
- Supporting achievements and qualitative comments
- Track submission status with acknowledgment

**5. Appraisal Cycle Tracker**
- Ongoing, upcoming, past cycles
- Automated timeline notifications
- Status: Pending → Under Review → Completed
- Historical report access

**6. Recognition & Ratings**
- Rating bands with justification notes
- Downloadable performance reports
- Grading mapped to compensation/bonus models
- Links to internal rewards and recognition programs

**7. Dispute/Feedback Loop** *(Optional)*
- Raise queries/disputes on submitted appraisals
- Track resolution status with HR/reviewer
- Add clarifications, missed achievements, additional evidence

---

### 3.7 Training & Development

**Source:** `Training & Development.pdf`

Continuous learning, skill development, and certification tracking.

#### Core Functions

**1. Assigned Training Modules**
- Training assigned by HR or reporting managers
- Types: onboarding, soft skills, compliance, domain-specific, leadership
- Formats: video, PDF, interactive quizzes, SCORM packages

**2. Skill Development Programs**
- Organization-curated or third-party programs
- Progress tracking: skills, certifications, proficiency levels
- Personalized suggestions based on role, department goals, career path

**3. Progress & Completion Tracking**
- Real-time progress dashboard
- Module-wise: completion %, time spent, assessment scores
- Auto-reminders for incomplete courses/deadlines

**4. Feedback & Certification**
- Post-training feedback (content quality, trainer, delivery)
- View/download training certificates
- Certificates stored in employee profile for appraisals/compliance

**5. Training Calendar & Registration**
- Interactive calendar: upcoming sessions, webinars, workshops
- Filter by location, department, topic, trainer
- Self-registration with approval flow
- Integration with Zoom, Google Meet, MS Teams

**6. Notifications**
- Alerts for new trainings, deadlines, updates, certificate availability
- Customizable: email, SMS, dashboard

**7. Gamification & Leaderboard** *(Optional)*
- Points and badges for milestones
- Department/organization leaderboards

---

### 3.8 Document Management

**Source:** `Document Management.pdf`

Secure, centralized platform for all HR document handling.

#### Core Functions

**1. Centralized HR Document Access**
- Appointment letters, employment contracts, NDAs, company policies, promotion/increment letters
- Smart categorization by type or department

**2. Employee Document Uploads**
- Personal/statutory documents: PAN, Aadhar, educational certificates, experience letters, medical certificates
- HR gets real-time notifications for new uploads

**3. Digital Signature & Acknowledgment**
- E-signature on offer letters, NDAs, policy updates
- Acknowledgment tracking for policy compliance
- Legal validation: audit trail with timestamp, IP, user ID

**4. Automated Document Reminders**
- Expiry/renewal alerts (ID proofs, licenses)
- Pending acknowledgment reminders via email/SMS

**5. Downloadable Templates & Forms**
- HR-provided templates (reimbursement forms, leave formats)
- Upload-ready standard formats

**6. Role-Based Access Control**
- Access permissions by role (employee, HR, manager)
- Confidentiality for sensitive HR documents

---

### 3.9 Expense & Reimbursement

**Source:** `Expense & Reimbursement.pdf`

Financial workflow management for work-related expenses.

#### Core Functions

**1. Submit Expense Claims**
- Eligible expenses: travel, food, accommodation, communication, miscellaneous
- Upload: receipts, invoices, bills (PDF/JPEG/PNG)
- Category tagging (Travel, Meals, Accommodation, etc.)
- Custom remarks for specific charges

**2. Real-Time Tracking**
- Status pipeline: Submitted → Under Review → Approved/Rejected → Processed
- Email + in-app notifications per status change
- Historical records of all claims

**3. Multi-Currency Support**
- Multiple currency entries for global teams
- Automated currency conversion (real-time exchange rates)
- Local currency processing per company policy

**4. Department-Wise Approval Workflow**
- Customizable approval chains
- Department head/team lead notifications
- Auto-escalation for unapproved claims after deadline

**5. Policy Compliance & Automation**
- Built-in validation rules aligned with reimbursement policies
- Auto-flagging of non-compliant or duplicate claims
- Automated limits based on employee role/grade

**6. Reports & Audit Logs**
- Monthly/quarterly individual or department reports
- Full audit trail: submitted → reviewed → approved
- Downloadable summaries for tax/accounting

---

### 3.10 Communication & Collaboration

**Source:** `Communication & Collaboration.pdf`

Internal communication infrastructure for structured cross-org collaboration.

#### Core Functions

**1. Internal Chat & Messaging**
- One-on-one secure real-time messaging
- Group chats: department-based or project-specific
- Message history for reference
- File sharing: documents, images, links

**2. Company-Wide Announcements**
- Bulletin board: policy updates, holidays, events
- Push notifications: desktop and mobile
- Targeted messaging: segment-based (e.g., only Sales, only Remote staff)

**3. Surveys, Suggestion Box, & Feedback**
- Pulse surveys: satisfaction, stress, engagement checks
- Anonymous feedback submission
- Suggestion box: propose ideas, vote, track implementation
- Structured feedback forms for initiatives, trainings, events, policies

---

### 3.11 Helpdesk & Support Tickets

**Source:** `Helpdesk & Support Tickets.pdf`

Centralized service desk for HR, IT, and Admin support requests.

#### Core Functions

**1. Service Request Submission**
- Raise tickets from dashboard
- Categories: HR, IT, Admin, Payroll, Facilities
- Request types: ID card issuance, hardware problems, leave disputes, reimbursement delays
- Attachments: screenshots, documents

**2. Ticket Categorization & Prioritization**
- Auto/manual categorization
- Priority levels: Low, Medium, High, Critical
- Auto-routing to concerned department/team

**3. Real-Time Ticket Tracking**
- Status pipeline: Open → In Progress → Resolved → Closed
- Full communication logs visible
- Follow-up comments and additional info

**4. Communication with Support Teams**
- In-built messaging/chat per ticket
- Email + in-app notifications on status updates
- Escalation options if SLA breached

**5. SLA Tracking & Reporting**
- Pre-defined SLAs per query type
- Auto-escalation on SLA breach
- SLA compliance reports for support team evaluation

**6. Feedback & Closure**
- Resolution quality rating
- Mandatory feedback for critical/high-priority tickets
- Reopen option if issue persists

**7. Analytics & Reports**
- Department-wise ticket summary
- Average resolution time
- Monthly tickets raised/resolved

---

### 3.12 Settings & Preferences

**Source:** `Settings & Preferences.pdf`

Employee personalization and accessibility controls.

#### Core Functions

**1. Notification Preferences**
- Email alerts: toggle per category (attendance, approvals, announcements, payroll)
- SMS notifications: urgent updates (shift changes, leave approvals, emergencies)
- Push notifications: real-time in-app/mobile
- Category-wise preference settings
- Do Not Disturb mode: set quiet hours

**2. Working Hours, Shifts, & Remote Work**
- Preferred working hours (start/end time)
- Shift preferences: morning, evening, night (with auto-allocation option)
- Remote work status: WFH, hybrid, in-office schedule
- Real-time remote status: available / busy / offline
- Optional GPS tagging for remote check-ins

**3. Multi-Language & Accessibility**
- Language selection: multiple supported portal languages
- Text size & display: font size, contrast mode, brightness
- Screen reader compatibility for visually impaired users
- Keyboard-only navigation mode
- Color blind mode: optimized visual settings

---

## 4. Role-Based Access Control (RBAC)

Based on the existing EBT project's RBAC architecture (Node.js + Express + Sequelize + PostgreSQL + Redis), adapted for HRMS:

### Role Definitions

| Role Key | Display Name | `isSystemRole` | `priority` | Description |
|----------|-------------|:-:|:-:|-------------|
| `s-admin` | Super Admin | ✅ | 100 | Full system control. Manage organizations, all configurations |
| `admin` | Admin | ✅ | 90 | Organization-level administration. System settings, user management |
| `hr` | HR | ❌ | 70 | Full HR operations: policies, attendance mgmt, leave mgmt, payroll, appraisals, document control |
| `manager` | Manager | ❌ | 50 | Team oversight: approve regularizations/leaves, view team dashboards, performance reviews |
| `employee` | Employee | ❌ | 10 | Self-service: clock in/out, apply leave, view payslips, raise tickets, manage profile |
| `worker` | Worker | ✅ | 5 | System/background role for cron jobs, sync tasks, automated processes |

### Access Matrix by Module

| Module | Employee | Manager | HR | Admin | S-Admin |
|--------|:--------:|:-------:|:--:|:-----:|:-------:|
| Dashboard (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dashboard (team) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Profile (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Profile (others) | ❌ | 👁️ team | ✅ | ✅ | ✅ |
| Attendance (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Attendance (team) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Attendance policies | ❌ | ❌ | ✅ | ✅ | ✅ |
| Leave (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leave approvals | ❌ | ✅ team | ✅ | ✅ | ✅ |
| Leave policies | ❌ | ❌ | ✅ | ✅ | ✅ |
| Payroll (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payroll management | ❌ | ❌ | ✅ | ✅ | ✅ |
| Performance (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance (team review) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Training (browse/attend) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Training management | ❌ | ❌ | ✅ | ✅ | ✅ |
| Documents (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Documents (HR docs) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Expenses (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expense approvals | ❌ | ✅ team | ✅ | ✅ | ✅ |
| Communication | ✅ | ✅ | ✅ | ✅ | ✅ |
| Announcements (create) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Helpdesk (own tickets) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Helpdesk (manage) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Settings (own) | ✅ | ✅ | ✅ | ✅ | ✅ |
| System settings | ❌ | ❌ | ❌ | ✅ | ✅ |

### RBAC Architecture (Matching EBT Pattern)

```
Request Flow:
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│  Client   │───▶│ authenticate │───▶│  authorize   │───▶│  Controller│
│ (Bearer   │    │ (JWT verify, │    │ (role check  │    │  → Service │
│  Token)   │    │  Redis BL)   │    │  from array) │    │  → Repo    │
└──────────┘    └──────────────┘    └──────────────┘    └────────────┘

Token Payload:  { sub: userId, identifier, identifierType, role: "employee" }
Middleware:     authenticate → verifyToken → freeze req.user
Authorize:      authorize(['employee', 'manager', 'hr']) → check req.user.role
```

---

## 5. Inter-Module Dependencies

Understanding how modules connect is critical for build sequencing:

```
                    ┌─────────────────────┐
                    │   Personal Dashboard│ (consumes from ALL modules)
                    └──────────┬──────────┘
                               │ reads
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
    ▼                          ▼                          ▼
┌──────────┐          ┌──────────────┐          ┌───────────────┐
│ Profile  │          │  Attendance  │◄────────▶│    Leave       │
│ Mgmt     │          │  & Time      │          │   Management   │
└────┬─────┘          └──────┬───────┘          └───────┬───────┘
     │                       │                          │
     │ employee data         │ present days/hours       │ approved leaves
     │                       │ overtime                 │
     ▼                       ▼                          ▼
┌──────────┐          ┌──────────────┐          ┌───────────────┐
│ Document │          │   Payroll    │◄─────────│   Expense &   │
│ Mgmt     │          │   & Salary   │          │ Reimbursement │
└──────────┘          └──────────────┘          └───────────────┘
                             │
                             │ compensation data
                             ▼
                    ┌──────────────┐
                    │ Performance  │
                    │ & Appraisal  │
                    └──────┬───────┘
                           │ skill gaps
                           ▼
                    ┌──────────────┐
                    │  Training &  │
                    │ Development  │
                    └──────────────┘

Cross-cutting:
├── Communication & Collaboration ──▶ notifications to ALL modules
├── Helpdesk & Support Tickets ──▶ service layer for ALL modules
├── Settings & Preferences ──▶ personalization for ALL modules
└── Holiday Calendar ──▶ shared by Attendance, Leave, Payroll, Dashboard
```

### Dependency Table

| Module | Depends On | Feeds Into |
|--------|-----------|------------|
| **Dashboard** | Attendance, Leave, Payroll, Training, Communication, Holidays | — (display only) |
| **Profile** | — (foundational) | All modules (employee identity) |
| **Attendance** | Profile, Holidays, Shift/Policy config | Payroll, Leave, Dashboard |
| **Leave** | Profile, Holidays, Leave Policies | Payroll, Attendance, Dashboard |
| **Payroll** | Attendance, Leave, Expense | Dashboard, Tax/Compliance |
| **Performance** | Profile | Training (skill gaps), Payroll (bonus linkage) |
| **Training** | Profile, Performance | Profile (certifications), Performance |
| **Document Mgmt** | Profile | Compliance, Profile |
| **Expense** | Profile | Payroll |
| **Communication** | Profile | All modules (notifications) |
| **Helpdesk** | Profile | SLA reporting |
| **Settings** | Profile | All modules (preferences) |

---

## 6. Technology Stack Alignment

Based on the existing EBT project codebase analysis, the HRMS will follow the **exact same architectural patterns**:

### Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Runtime** | Node.js | JavaScript backend |
| **Framework** | Express.js | HTTP routing, middleware chain |
| **ORM** | Sequelize | PostgreSQL models, migrations, associations |
| **Database** | PostgreSQL | Primary data store, UUID PKs, JSONB for flexible fields |
| **Cache/Sessions** | Redis | Token blacklisting, session management, caching |
| **Auth** | JWT (jsonwebtoken) | Access + Refresh tokens, role in payload |
| **Password Hashing** | Argon2 | Via `argon2` npm package |
| **Validation** | Custom validators | Request validation layer |
| **Error Handling** | AppError class | Custom error class with status, errorCode, auto stack trace |
| **Configuration** | `config/default.json` + `.env` | JSON config file + env vars |

### Architectural Patterns (from EBT)

```
src/
├── app.js                              # Express app setup, CORS, middleware chain, module registration
├── server.js                           # HTTP server, DB/Redis init, graceful shutdown
├── common/
│   ├── middlewares/
│   │   ├── auth.middleware.js           # authenticate + authorize(roles[])
│   │   └── error.middleware.js          # Global error handler
│   └── utility/
│       ├── appError.utility.js          # Custom AppError(status, message, errorCode)
│       ├── jwt.utility.js              # generateAccessToken, generateRefreshToken, verify
│       ├── hash.password.utility.js    # hashPassword, verifyPassword (Argon2)
│       └── ...
├── infrastructure/
│   ├── database/
│   │   ├── connections.database.js     # Sequelize + Redis init with retry & monitoring
│   │   ├── models.index.js            # Auto-loads all *.model.js files, runs associations
│   │   ├── migrations/                # Sequelize migrations
│   │   └── seeders/                   # Seed data (roles, etc.)
│   ├── cache/redis.js                 # Redis client
│   └── ...
└── modules/
    └── _core/
        └── auth/
            ├── auth.index.js           # Module registration: app.use('/path', authenticate, authorize([...]), routes)
            ├── controllers/            # HTTP handlers (thin — delegate to services)
            ├── services/               # Business logic (transactions, validation, orchestration)
            ├── repositories/           # Data access (Sequelize queries)
            ├── models/                 # Sequelize model definitions
            ├── routes/                 # Express routers
            └── validators/             # Request validation schemas
```

**Key Pattern:** Each module follows `routes → controllers → services → repositories → models` with the `auth.middleware` applied at the route registration level in `{module}.index.js`.

---

## 7. Phased Build Roadmap

### Phase 0: Foundation (Week 1–2)
> Project scaffold, shared infrastructure, auth system

- [ ] Project initialization (npm init, folder structure, config files)
- [ ] Database setup: PostgreSQL + Sequelize + migrations infrastructure
- [ ] Redis setup: connections, retry logic, monitoring
- [ ] Auth module: signup, login (email+password, OTP), JWT, refresh tokens
- [ ] RBAC: roles table seeding (s-admin, admin, hr, manager, employee, worker)
- [ ] User & UserProfile models with role assignment
- [ ] authenticate + authorize middleware
- [ ] AppError, global error handler, response wrapper
- [ ] Settings & Preferences module (notification prefs, language, accessibility)

### Phase 1: Core HR Operations (Week 3–7)
> The modules employees and HR use daily

- [ ] **Profile Management** — personal info, emergency contacts, document uploads, employment history, HR approval workflow
- [ ] **Attendance & Time Tracking** — clock in/out (web), dashboard, regularization requests, approval workflow, policy engine, shift management, holiday calendar
- [ ] **Leave Management** — apply leave, balance tracking, multi-level approval, leave policies, holiday calendar integration
- [ ] **Personal Dashboard** — quick overview, notifications, calendar widget, customizable layout

### Phase 2: Financial & Growth (Week 8–11)
> Payroll, performance, documents

- [ ] **Payroll & Salary** — payslip access/download, salary structure view, tax info (TDS, Form 16), deductions, loan/advance tracking, bonus details
- [ ] **Performance & Appraisal** — KPI/goal management, self-assessment, manager/360° feedback, appraisal cycles, ratings
- [ ] **Document Management** — HR document access, employee uploads, e-signature, acknowledgment tracking, automated reminders

### Phase 3: Engagement & Finance (Week 12–15)
> Employee engagement and expense management

- [ ] **Expense & Reimbursement** — claim submission, receipt upload, category tagging, multi-currency, approval workflow, policy compliance, audit logs
- [ ] **Communication & Collaboration** — internal chat (1:1 + groups), announcement board, push notifications, surveys, suggestion box, anonymous feedback
- [ ] **Training & Development** — assigned modules, skill programs, progress tracking, certifications, training calendar, registration flow

### Phase 4: Support & Polish (Week 16–18)
> Support infrastructure and final polish

- [ ] **Helpdesk & Support Tickets** — ticket submission, categorization, SLA tracking, in-ticket chat, escalation, feedback, analytics
- [ ] Cross-module notification system consolidation
- [ ] Mobile responsiveness pass across all modules
- [ ] Performance optimization, caching strategy
- [ ] Security audit: RBAC review, input sanitization, rate limiting
- [ ] E2E testing, load testing, UAT

---

> **This document is the single reference for the entire HRMS Employee Panel build. All module implementations should be validated against the requirements documented here.**
