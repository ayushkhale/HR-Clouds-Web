# Attendance Module Phase 2 - API Explanations (Frontend Guide)

This document is written specifically for Frontend Developers. While the standard API documentation gives you the JSON structures, this guide explains **WHY** each API exists, **WHAT** it is doing under the hood, and **HOW** it translates into the UI you are building.

---
 
### 1. Attendance Policies : 

### `Use Prefix /api/v1/attendance/hr` for all APIs in this section.

**Why we need this:** 
Every company has rules for attendance. For example, "Employees can be 15 minutes late" or "You must work 8 hours for a full day." The Policies API allows HR to define these rules dynamically so the backend engine knows exactly how to calculate "Late", "Half-day", or "Overtime" for every employee's punch.

### `POST /policies` (Create Policy)
- **What it does**: Saves a new rulebook into the database. If HR checks "Set as Default" (`is_default: true`), the backend will automatically remove the default status from the previous policy.
- **Frontend implication**: You are building a "Create Policy" form. It will have many number inputs (Grace Minutes, Late Threshold, etc.). You don't need to write logic to uncheck the old default policy; just send `is_default: true` and the backend handles the swap. Make sure to include toggles for features like `overtime_enabled` and `regularization_allowed`, and inputs for `half_day_min_hours` and `full_day_min_hours` to define punch calculation boundaries.

### `GET /policies` (List Policies)
- **What it does**: Fetches all policies created by this organization. 
- **Frontend implication**: You use this to populate the main table on the "Attendance Settings" page. It will show policy names, if they are active, and if they are the default.

### `GET /policies/:id` (Get Policy Details)
- **What it does**: Fetches the deep details (all the rules, thresholds, etc.) of a single policy.
- **Frontend implication**: When HR clicks "Edit" on a policy, you call this API to pre-fill your form with the existing data.

### `PUT /policies/:id` (Update Policy)
- **What it does**: Updates an existing policy. 
- **Frontend implication**: When HR clicks "Save Changes" on an edited policy, you send the updated fields here. The backend safely updates the rules for future attendance calculations.

### `PATCH /policies/:id/deactivate` (Deactivate Policy)
- **What it does**: Soft-deactivates a policy instead of deleting it.
- **Frontend implication**: We never fully delete policies because old attendance records rely on them. You build a "Deactivate" button. Once deactivated, this policy won't show up in dropdowns for assigning to new shifts, but historical records stay intact.

---

## 2. Shift Templates

**Why we need this:** 
Shifts define *when* an employee is supposed to be at work. Some employees work 9-to-5, others work night shifts, and some have flexible hours. Shifts must be created first before they can be assigned to employees.

### `POST /shifts` (Create Shift Template)
- **What it does**: Creates a reusable time template (e.g., "Morning Shift: 9 AM - 5 PM"). It supports fixed, flexible, night, and split shifts.
- **Frontend implication**: You build a form with TimePickers. The backend expects 24-hour time strings (`18:00`). If HR selects "Flexible" from a dropdown, you should hide start/end times and instead show "Minimum Hours Required." For fixed shifts, ensure you capture `buffer_minutes_before` and `buffer_minutes_after` to allow early check-ins without penalizing employees.

### `GET /shifts` (List Shifts)
- **What it does**: Retrieves all active shifts.
- **Frontend implication**: You use this twice: Once for the "Shift Management" data table, and again to populate the dropdowns in the "Shift Assignment / Roster" page.

### `GET /shifts/:id` (Get Shift Details)
- **What it does**: Retrieves all configurations for a specific shift.
- **Frontend implication**: Used to pre-fill the form when HR clicks "Edit Shift".

### `PUT /shifts/:id` (Update Shift)
- **What it does**: Modifies the timings or rules of a shift.
- **Frontend implication**: Submitted when HR saves edits. **Warning**: Changing a shift's timings will immediately affect all employees currently assigned to it starting the next day.

### `DELETE /shifts/:id` (Delete Shift)
- **What it does**: Attempts to soft-delete a shift.
- **Frontend implication**: The backend will reject this (400 Bad Request) if employees are currently actively working this shift. You need to catch this error and show a toast: "Cannot delete shift: Employees are currently assigned to it."

---

## 3. Rotations (Rotating Shifts)

**Why we need this:** 
Factories, hospitals, and support teams don't work the same shift every day. They rotate (e.g., 2 weeks Morning, 1 week Night). Instead of HR manually changing their shift every week, they create a "Rotation Pattern."

### `POST /rotations` (Create Rotation Pattern)
- **What it does**: Groups multiple shifts into a repeating cycle. It calculates exactly what shift an employee should be on based on a starting reference date.
- **Frontend implication**: You build a complex UI where HR can "Add a phase" (e.g., Phase 1: Morning Shift for 14 days, Phase 2: Night Shift for 7 days). You send this array of entries to the backend, which builds the mathematical cycle. Ensure you send `sequence_order` starting from 1 to define the order of phases, and a `start_reference_date` to anchor the rotation timeline.

### `GET /rotations` (List Rotations)
- **What it does**: Retrieves all rotation patterns.
- **Frontend implication**: Used to populate a dropdown in the Roster UI. When HR assigns someone, they can either pick a single static Shift, OR a Rotation Pattern.

### `DELETE /rotations/:id` (Delete Rotation)
- **What it does**: Deletes the pattern. 
- **Frontend implication**: Similar to shifts, this will fail if people are actively assigned to it.

---

## 4. Shift Assignments (The Roster)

**Why we need this:** 
This is the bridge between Employees and Shifts. Creating a "Morning Shift" does nothing until you *assign* John to the Morning Shift.

### `POST /shifts/assign` (Assign Shift to Employee)
- **What it does**: Maps an employee to a Shift (or Rotation) starting from a specific date (`effective_from`). 
- **Frontend implication**: The magic here happens on the backend. If John is currently on the Morning Shift, and you assign him the Night Shift starting Next Monday, **you do not need to cap or close his Morning Shift**. The backend automatically finds his old assignment and sets its end date to Next Sunday. Just send the new assignment and the backend handles the timeline math! *(Note: You can pass `rotation_pattern_id` instead of `shift_id` if assigning a rotating cycle).*

### `GET /shifts/assignments` (List Assignments)
- **What it does**: Fetches the current roster of who is working what shift.
- **Frontend implication**: You use this to build the Calendar or Datagrid Roster view. It tells you exactly what shift every employee is assigned to today. *(Note: The response includes fully nested user profiles, employee codes, and shift details, so you do not need to make secondary API calls to render employee names or shift timings in your grid.)*

---

## 5. Holidays

**Why we need this:** 
If an employee doesn't punch in on a Holiday, the attendance engine shouldn't mark them as "Absent". The engine needs to know the exact dates of public/company holidays.

### `POST /holidays` (Create Holiday)
- **What it does**: Adds a specific date as a holiday for the entire organization.
- **Frontend implication**: A simple modal with a DatePicker, Name input (e.g., "Christmas"), and Type dropdown (Public, Restricted).

### `GET /holidays` (List Holidays)
- **What it does**: Fetches the holidays, usually filtered by year.
- **Frontend implication**: Used to render a Yearly Calendar UI. **Crucial**: Always pass `?year=YYYY` in your API call, otherwise the backend might return 10 years worth of holidays, crashing the browser.

### `PUT /holidays/:id` & `DELETE /holidays/:id` (Update/Delete Holiday)
- **What it does**: Modifies or removes a holiday.
- **Frontend implication**: Straightforward edit/delete functionality in the UI calendar.

---

## 6. Weekly Offs (Weekends)

**Why we need this:** 
Just like holidays, the engine needs to know when weekends happen so it doesn't penalize employees for not showing up on Sunday. However, some shifts (like Weekend Support) have Tuesday/Wednesday off instead of Saturday/Sunday.

### `POST /weekly-offs` (Create Weekly Off Rule)
- **What it does**: Defines which day(s) of the week are considered weekends. 
- **Frontend implication**: This API is highly flexible. 
  - If you send it **without** a `shift_id`, it applies to the whole company (e.g., Global Sunday Off).
  - If you send it **with** a `shift_id`, it acts as an exception (e.g., Night Shift gets Monday Off instead).
  - You pass the day as an integer (`0` for Sunday, `6` for Saturday). The frontend must map these numbers to readable text for the user.

### `GET /weekly-offs` (List Weekly Offs)
- **What it does**: Returns the matrix of weekends and exceptions.
- **Frontend implication**: You build a view showing the global weekends at the top, and a table of shift-specific exceptions below it.

### `PUT /weekly-offs/:id` & `DELETE /weekly-offs/:id` (Update/Delete Weekly Off)
- **What it does**: Modifies or removes a weekend rule.
- **Frontend implication**: If a company switches to a 5-day work week, HR will use this to add/delete the global Saturday rule.

---

## 7. General UI/UX Recommendations for Frontend Developers

1. **Timezones**: Send all dates (`effective_from`, `date`) as standard ISO strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). The backend will handle them correctly. Shift `start_time` and `end_time` are literal strings (`09:00`) tied to the `timezone` parameter (default `Asia/Kolkata`).
2. **Error Handling**: 
   - If an API returns `409 Conflict`, it usually means an overlap (e.g., "Holiday already exists on this date"). Display the exact `err.response.data.message` in a toast notification.
3. **Data Loading**: When loading the Shift Assignment (Roster) page, you must dispatch `GET /shifts`, `GET /rotations`, and a User list API simultaneously via `Promise.all` so you have all the necessary dropdown data ready.
