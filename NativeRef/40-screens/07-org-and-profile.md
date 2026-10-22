# 07 · Org and profile — More · Company · OrgChart · Directory · Profile · Settings

Phase 8, the last one. Web ancestors: `shared/screens/CompanyProfilePage.jsx`,
`OrgChartPage.jsx`, `DirectoryPage.jsx`, `MyProfilePage.jsx`.

---

# More

**For:** the tab-bar overflow — everything that isn't daily. It is a grouped
menu, and the only screen in the app that mentions signing out.

### Layout

```
PersonRow (self)   avatar · name · roleLabel · →Profile
──────────────────────────────────────────────────────
MY DOCUMENTS
  My Documents          12 on file
  Company Documents     2 need you            ← fuchsia
  Document Requests     1 waiting on you      ← fuchsia
  Forms & Templates
COMPANY
  Company Profile
  Org Chart
  Directory
ME
  My Profile
  Settings
──────────────────────────────────────────────────────
LinkButton (rose) "Sign out"
caption, centred: version · build number
```

Section labels are the web sidebar's own group names, so somebody who uses both
recognises the grouping (§2).

**Every destination comes from `useRouteTarget()`** — never a hardcoded
`navigate('MoreTab', { screen: … })`. A `null` hides the row. That is the whole
reason `navigation/routes.js` exists.

### Actions

**Sign out** — `await useConfirm()`:
> **Sign out?** · You'll need your password to get back in.

Then `useAuth().logout()`, which calls `clearSession()` — Keychain entry,
in-memory token, cached preferences, the directory cache **and the download
cache**. A payslip left in the cache directory is readable by the next person
to use the phone.

Do not navigate. RootNavigator swaps the stack.

### Field help

**No field qualifies.** It is a menu.

---

# Company

**For:** the facts about the organisation — legal name, addresses, registered
details, departments.

### Data

`organizationAPI.getOrganizationDetails()`

### Layout

```
Card   logo · legal name · trade name
SheetGrid-style blocks, 2 columns
  Registered address · Head office · Industry · Employees
SheetSection "Departments"   folded, a list with head counts
SheetSection "Registered details"  folded — GSTIN, PAN, CIN where present
```

### States

Loading · loaded · **a key absent** (that block is **hidden**, not "N/A" —
an absent key is a hidden feature, §7) · couldn't load · offline.

That distinction matters here because the registered details are optional per
org, and a grid of six "N/A"s reads as a broken screen.

### Actions

None. Read-only.

### Field help

**No field qualifies.** Addresses and a legal name are ordinary, and the
statutory identifiers are labelled by their own well-known names.

---

# OrgChart

**For:** who reports to whom.

### Data

`organizationAPI.getOrganizationHierarchy()` — one call, the whole tree.

### Layout — and the honest mobile adaptation

A pan-and-zoom tree at 390pt is unusable. **Drill down instead:**

```
Breadcrumb   Company › Engineering › Platform
PersonRow (the current node, large)   avatar · name · title
"Reports to"      1 × PersonRow         → tap: walk up
"Team" (6)        6 × PersonRow         → tap: walk down
```

One screen, one level, two directions. It answers "who is my skip-level" in
two taps, which is the only question anybody asks of an org chart on a phone.

### States

Loading · loaded · **no manager set** (the "Reports to" block is absent, not
"N/A") · a node with no team (the Team block absent) · couldn't load · offline.

### Actions

Tapping a person walks the tree. Tapping their name again opens their
directory entry (read-only).

### Field help

**No field qualifies.** Names and job titles.

### Traps

- **Names come from the hierarchy payload, resolved through `useDirectory`
  where only an id is sent.** `nameOf()` → "Loading…", then a name, never an
  id, never "not found" (§4).
- **Never a second roster fetch.** `useDirectory()` is the one people source;
  a narrower `purpose` drops `avatar_url` and an unpaginated call stops at 100
  people — which is how the same colleague gets a photo on one screen and
  initials on the next (§7).
- Avatars are presigned and die in ~5 minutes. `Avatar`'s `onPhotoError`
  falls back; **never cache a roster row's `avatar_url`** anywhere.

---

# Directory

**For:** finding a colleague's work contact details.

### Data

`organizationAPI.getDirectory({ search, department, page, limit })` — reached
through **`useDirectorySearch()`** (`hooks/useDirectory.js`), which debounces
300ms, searches server-side and accumulates pages.

`/organizations/employees` **403s for an employee.** The directory endpoint is
the employee-visible roster, and that difference is why there is one hook.

### Layout

```
TextField (search) pinned at the top        "Search by name or department"
FilterTabs by department, if there are few enough
FlatList of PersonRow
  avatar · name · job title · department          → tap: a RecordSheet
RecordSheet
  Avatar large · name · title · department
  SheetGrid  Work email · Work phone · Reports to · Location
  footer  [Email]  [Call]        ← only when the field is present
```

### States

Loading · searching (a spinner **in the field**, never a blanked list) ·
loaded · **no results** ("Nobody matches 'kuma'.") · empty directory ·
couldn't load · offline (what's cached is searchable; say so in one line).

### Actions

**Email** / **Call** — `Linking.openURL('mailto:'/'tel:')`, and each button is
**absent** when the field is absent. Never a button that opens a blank mail
draft.

### Field help

**No field qualifies.** A name, a title and a phone number are the most
ordinary fields there are.

### Traps

- **Search server-side.** A client filter over page 1 finds 100 people and
  misses the 400 behind them.
- **Leavers are a filter, never a second read** — `activeRows` vs `rows`.
- No employee id, no user id, anywhere. `employee_code` is fine **if** it is
  genuinely useful here; on this screen it isn't, so leave it out.

---

# Profile

**For:** the person's own details, and the few they can change.

### Data

```js
organizationAPI.getMyProfile()
organizationAPI.updateMyProfile(…)        // personal details
organizationAPI.updateMyJobProfile(…)     // only if the org allows it
organizationAPI.requestAvatarUpload() / confirmAvatarUpload()
organizationAPI.getMySetupStatus()        // the "finish your profile" nudge
```

### Layout — a `TabStrip`, matching the web's `ProfileTabStrip`

```
Avatar (tap to change) · name · roleLabel · employee code
TabStrip   Personal · Job · Bank · Documents · Emergency
  Personal     editable: phone, address, emergency contact
  Job          read-only: title, department, manager, joined on, work mode
  Bank         → the BankAccount form (05-pay.md)
  Documents    → MyDocuments (06-documents.md)
  Emergency    editable
```

The strip **scrolls horizontally** with edge fades and auto-scrolls the
selected tab into view. Do not make it wrap — on the web a wrapped strip grew
to three rows on a laptop (§5).

**`employee_code` is the one identifier that may be shown**, because it is
genuinely useful: it is what payroll and HR ask for. A UUID never is.

### States

Loading · loaded · **setup incomplete** (a card at the top listing what's
missing, from `getMySetupStatus`) · editing · saving · a read-only org (the
edit control absent, with one line saying HR maintains these) · couldn't load ·
offline (read-only, with an indigo line).

### Actions

**Edit personal details** → a modal `FormSheet`, gridded. Validate before
calling; a phone number's shape only, never a strict format — international
numbers break every regex anybody writes.

**Change photo** → the three-step presigned upload
(`requestAvatarUpload` → PUT → `confirmAvatarUpload`), then
**`refreshEmployeeDirectory()`** equivalent: `clearDirectoryCache()`, so the
new photo appears everywhere rather than just here.

### Field help — 2 entries

```json
"profile.job": {
  "kind": "screen", "workspaces": ["employee"],
  "description": "My profile › Job tab (read-only employment facts)",
  "fields": {
    "work_mode": {
      "hint": "Where your contract says you work from. It decides whether you can choose office or remote when you punch in.",
      "askMaya": { "enabled": true, "question": "What does my work mode mean, and how does it affect clocking in and location checks?" }
    },
    "probation_end_date": {
      "hint": "The end of your wait after joining. Some leave types only start once it's passed.",
      "askMaya": { "enabled": true, "question": "What is the waiting period after joining, and which leave can I take before it ends?" }
    }
  }
}
```

**probation → "wait after joining"** (§6). Both fields are ours or domain, both
affect something the person will hit later. Name, phone, address and job title
are ordinary: no ⓘ.

### Traps

- **Never cache `avatar_url`.** Presigned, ~5 minutes.
- A profile save must re-read; some fields are HR-approved rather than applied.
- The setup nudge disappears when complete — it is not a permanent card.

---

# Settings

**For:** the handful of switches that are genuinely the person's.

### Layout

```
NOTIFICATIONS
  Toggle  Punch reminders
  Toggle  Approvals and documents
  Toggle  Payslip ready
APP
  Row     Language                 (only if more than one is shipped)
  Toggle  Reduce motion            ← reads the OS setting, overridable
  Row     Clear downloaded files        with the size
ABOUT
  Row     Version · build
  Row     Browser Storage Policy        → in-app, not a browser
  Row     Data Handling Policy
  LinkButton (rose) "Sign out"
```

Notification toggles are **local until push ships** (Phase 8) — a toggle that
promises something the backend doesn't send yet is worse than no toggle. If
push isn't deployed, the whole NOTIFICATIONS section is **absent**, not
disabled (§2).

**Clear downloaded files** → `clearDownloadCache()`, with the reclaimed size in
the toast. Worth surfacing: payslips accumulate.

### Legal pages

Named `BrowserStoragePolicy` and `DataHandlingPolicy` **in the source file
names**. Never "cookie", "ads", "advert", "tracking", "consent" or "privacy" in
a source file name — on the web, ad blockers dropped those module URLs and one
blocked static import blanked the entire app (CLAUDE.md §1, twice: 2026-10-01
and 2026-10-03). The rule costs nothing to keep here and the habit is what
matters; Metro bundles rather than serving per-path, so this is a convention,
not a live bug, in the native app.

### States

Loaded · a toggle saving · a toggle failed (it **reverts**, with a toast — a
switch that stays on while the server says off is a lie) · offline (toggles
disabled with a `disabledReason`).

### Field help

**No field qualifies.** Three notification switches and a version number.

---

## Field-help outcome for this spec

| Surface | Entries |
|---|---|
| `more.menu` · `org.company` · `org.chart` · `org.directory` · `settings` | **0** — every field is ordinary, a name, or a menu label |
| `profile.job` | **2 new** (`work_mode`, `probation_end_date`) |

Two new entries across six screens. Reported as such: the rest of the module is
names, addresses and switches, and §10's first row is explicit that those never
get an ⓘ.
