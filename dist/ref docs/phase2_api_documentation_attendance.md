# Attendance Module - Phase 2 API Documentation & Frontend Integration Guide

This document provides complete technical details for the Phase 2 (Policy & Shift Engine) APIs, including request/response payloads, business logic explanations, and comprehensive integration guides for Frontend Developers.

**Base URL**: `/api/v1/attendance/hr`  
**Headers Required**: 
- `Authorization: Bearer <token>`
**Required Roles**: `hr`, `admin`, or `super-admin`

---

## Expected Frontend Architecture (Pages)

To fully implement Phase 2 on the frontend (React/Next.js/Vue), the following **5 Pages/Views** are expected in the HR Dashboard:

1. **Attendance Settings / Policy Manager (`/hr/attendance/policies`)**
   - **View**: A list/table of all attendance policies.
   - **Action**: "Create New Policy" button opening a complex form (drawer or modal) to define grace periods, overtime rules, etc.
   - **Integration**: Uses `GET /policies`, `POST /policies`, `PUT /policies/:id`.
2. **Shift Management (`/hr/attendance/shifts`)**
   - **View**: A list of Shift Templates (Morning, Evening, Flexible).
   - **Action**: "Add Shift" form to define timings, buffer times, and shift types.
   - **Integration**: Uses `GET /shifts`, `POST /shifts`, `PUT /shifts/:id`, `DELETE /shifts/:id`.
3. **Shift Roster / Assignment (`/hr/attendance/roster`)**
   - **View**: A calendar or datagrid view mapping Employees to Shifts.
   - **Action**: Select an employee and assign them a shift effective from a specific date.
   - **Integration**: Uses `GET /shifts/assignments`, `POST /shifts/assign`, `GET /shifts`, `GET /rotations`.
4. **Holiday Calendar (`/hr/attendance/holidays`)**
   - **View**: A yearly calendar UI highlighting organizational holidays.
   - **Action**: "Add Holiday" modal (Date, Name, Type).
   - **Integration**: Uses `GET /holidays?year=YYYY`, `POST /holidays`, `PUT /holidays/:id`, `DELETE /holidays/:id`.
5. **Weekly Off Rules (`/hr/attendance/weekly-offs`)**
   - **View**: Matrix showing global weekends (e.g., Sat/Sun off) and shift-specific exceptions.
   - **Action**: "Add Exception Rule" form.
   - **Integration**: Uses `GET /weekly-offs`, `POST /weekly-offs`, `DELETE /weekly-offs/:id`.

---

## 1. Attendance Policies API

Policies dictate *how* punches are calculated (grace periods, half-day hour requirements, auto-checkout rules).

### 1.1 Create Policy
**Endpoint**: `POST /policies`  
**Frontend Use**: Submitted when the HR clicks "Save" on the New Policy Form.

**Request Payload:**
```json
{
  "name": "Standard Office Policy 2026",
  "is_default": true,
  "grace_minutes": 15,
  "late_threshold_minutes": 60,
  "half_day_min_hours": 4.5,
  "full_day_min_hours": 8.5,
  "overtime_enabled": true,
  "overtime_min_minutes": 60,
  "regularization_allowed": true,
  "regularization_window_days": 7
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Policy created successfully",
  "data": {
    "id": "uuid",
    "name": "Standard Office Policy 2026",
    "is_default": true,
    "..." : "..."
  }
}
```
**Frontend Implementation Tip**: If `is_default` is set to `true`, the backend automatically removes the default status from the previous default policy. The frontend does not need to handle this demotion manually. Just refresh the list after creation.

### 1.2 Get Policies
**Endpoint**: `GET /policies`  
**Frontend Use**: Called `onMount` of the Policy Manager page to populate the data table.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Policies fetched successfully",
  "data": [
    {
      "id": "uuid",
      "name": "Standard Office Policy 2026",
      "is_default": true,
      "is_active": true,
      "created_at": "2026-07-30T10:00:00Z"
    }
  ]
}
```

### 1.3 Get Policy By ID
**Endpoint**: `GET /policies/:id`  
**Frontend Use**: Fetch details of a specific policy for editing.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Policy fetched successfully",
  "data": {
    "id": "uuid",
    "name": "Standard Office Policy 2026",
    "is_default": true,
    "is_active": true,
    "grace_minutes": 15,
    "late_threshold_minutes": 60,
    "created_at": "2026-07-30T10:00:00Z"
  }
}
```

### 1.4 Update Policy
**Endpoint**: `PUT /policies/:id`  
**Frontend Use**: Submitted from the Edit Policy form. All fields are optional; only send what changed.

**Request Payload:**
```json
{
  "grace_minutes": 20
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Policy updated successfully",
  "data": {
    "id": "uuid",
    "name": "Standard Office Policy 2026",
    "grace_minutes": 20
  }
}
```

### 1.5 Deactivate Policy
**Endpoint**: `PATCH /policies/:id/deactivate`  
**Frontend Use**: Clicked from the list view to delete/deactivate a policy. Returns a 400 error if it is the default policy.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Policy deactivated successfully",
  "data": {
    "id": "uuid",
    "is_active": false
  }
}
```

---

## 2. Shift Templates API

Shifts define *when* employees are expected to work.

### 2.1 Create Shift Template
**Endpoint**: `POST /shifts`  
**Frontend Use**: When HR defines a new working shift pattern. The form should have a dropdown for `type`: `fixed`, `flexible`, `split`, `night`, `rotational`.

**Request Payload (Fixed Shift):**
```json
{
  "name": "Morning Shift",
  "type": "fixed",
  "start_time": "09:00",
  "end_time": "18:00",
  "buffer_minutes_before": 30,
  "buffer_minutes_after": 15
}
```

**Request Payload (Flexible Shift):**
```json
{
  "name": "Dev Flexi-Shift",
  "type": "flexible",
  "min_hours": 8.5,
  "core_start_time": "11:00",
  "core_end_time": "15:00"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Shift created successfully",
  "data": { "id": "uuid", "name": "Morning Shift" }
}
```
**Frontend Implementation Tip**: The `start_time` and `end_time` must be in `HH:MM` 24-hour format. Use a standard TimePicker component. Show/hide the `min_hours` and `core_start_time` fields based on the selected `type`.

### 2.2 Get Shifts
**Endpoint**: `GET /shifts`  
**Frontend Use**: Returns an array of shifts for the Roster Dropdown or Shift Manager grid.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Shifts fetched successfully",
  "data": [
    {
      "id": "uuid",
      "name": "Morning Shift",
      "type": "fixed",
      "start_time": "09:00",
      "end_time": "18:00",
      "is_active": true
    }
  ]
}
```

### 2.3 Get Shift By ID
**Endpoint**: `GET /shifts/:id`  
**Frontend Use**: Fetch details of a single shift for editing.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Shift fetched successfully",
  "data": {
    "id": "uuid",
    "name": "Morning Shift",
    "type": "fixed",
    "start_time": "09:00",
    "end_time": "18:00"
  }
}
```

### 2.4 Update Shift Template
**Endpoint**: `PUT /shifts/:id`  
**Frontend Use**: Send updated shift parameters. Cannot update a deactivated shift.

**Request Payload:**
```json
{
  "start_time": "09:30"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Shift updated successfully",
  "data": { "id": "uuid", "start_time": "09:30" }
}
```

### 2.5 Delete Shift
**Endpoint**: `DELETE /shifts/:id`  
**Frontend Use**: Soft-deletes a shift. **Note:** Will return `400 Bad Request` if employees are currently actively assigned to this shift. The UI should display: "Cannot delete shift, currently in use."

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Shift deactivated successfully",
  "data": {
    "id": "uuid",
    "is_active": false
  }
}
```

### 2.6 Create Rotation Pattern
**Endpoint**: `POST /rotations`  
**Frontend Use**: HR creates a repeating shift cycle (e.g., 2 weeks Morning, 1 week Night).

**Request Payload:**
```json
{
  "name": "Production Cycle A",
  "rotation_cycle_days": 21,
  "start_reference_date": "2026-08-01T00:00:00.000Z",
  "entries": [
    {
      "shift_id": "morning_shift_uuid",
      "sequence_order": 1,
      "duration_days": 14
    },
    {
      "shift_id": "night_shift_uuid",
      "sequence_order": 2,
      "duration_days": 7
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Rotation pattern created successfully",
  "data": { "id": "uuid", "name": "Production Cycle A" }
}
```

### 2.7 Get Rotations
**Endpoint**: `GET /rotations`  
**Frontend Use**: Fetch all rotation patterns and their associated entries.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Rotation patterns fetched successfully",
  "data": [
    {
      "id": "uuid",
      "name": "Production Cycle A",
      "rotation_cycle_days": 21,
      "is_active": true,
      "entries": [
        {
          "shift_id": "morning_shift_uuid",
          "sequence_order": 1,
          "duration_days": 14
        }
      ]
    }
  ]
}
```

### 2.8 Delete Rotation
**Endpoint**: `DELETE /rotations/:id`  
**Frontend Use**: Soft-deletes a rotation pattern.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Rotation pattern deactivated successfully",
  "data": { "id": "uuid", "is_active": false }
}
```

---

## 3. Shift Assignments (The Roster) API

This connects Employees to Shifts.

### 3.1 Assign Shift to Employee
**Endpoint**: `POST /shifts/assign`  
**Frontend Use**: From the Roster view. HR selects an employee, a shift, and an "Effective From" date.

**Request Payload:**
```json
{
  "user_id": "employee_uuid_here",
  "shift_id": "shift_uuid_here",
  "effective_from": "2026-08-01T00:00:00.000Z"
}
```
*(Note: You can pass `rotation_pattern_id` instead of `shift_id` if assigning a rotating cycle).*

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Shift assigned successfully",
  "data": {
    "id": "assignment_uuid",
    "user_id": "employee_uuid",
    "shift_id": "shift_uuid",
    "effective_from": "2026-08-01",
    "effective_to": null
  }
}
```
**Frontend Implementation Tip**: The Backend handles historical overlaps! If John was assigned "Morning Shift" from Jan 1st forever (`effective_to: null`), and you assign him "Night Shift" effective Aug 1st, the backend automatically sets the end date of the Morning Shift to July 31st. The frontend does **not** need to manually cap old assignments.

### 3.2 Get Shift Assignments
**Endpoint**: `GET /shifts/assignments`  
**Frontend Use**: Called to fetch the roster data, including complete nested user profiles and shift template details.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Shift assignments fetched successfully",
  "data": [
    {
      "id": "fc9df1dc-51f5-4e6a-869f-dafae13da025",
      "org_id": "f176b360-911b-4037-a9ee-663180f53ece",
      "user_id": "da0b164d-8b3c-4d7f-a576-6c2f2781e5c9",
      "shift_id": "1ac83800-920d-408c-8f30-2579c0501f68",
      "rotation_pattern_id": null,
      "effective_from": "2026-08-01",
      "effective_to": null,
      "assigned_by": "fe3887c1-3754-4768-b9cc-b45d8ea01b3e",
      "created_at": "2026-08-01T03:46:25.066Z",
      "updated_at": "2026-08-01T03:46:25.066Z",
      "user": {
        "id": "da0b164d-8b3c-4d7f-a576-6c2f2781e5c9",
        "identifier": "john.doe@example.com",
        "identifier_type": "email",
        "status": "active",
        "profile": {
          "id": "8f3f3f5f-6b42-4f43-852b-006a2ccd685b",
          "org_id": "f176b360-911b-4037-a9ee-663180f53ece",
          "user_id": "da0b164d-8b3c-4d7f-a576-6c2f2781e5c9",
          "first_name": "John",
          "last_name": "Doe",
          "display_name": "John Doe",
          "phone": "8319963447",
          "avatar_url": null,
          "metadata": {},
          "created_by": null,
          "updated_by": null,
          "created_at": "2026-08-01T02:45:08.638Z",
          "updated_at": "2026-08-01T02:45:08.638Z"
        },
        "employee_profile": {
          "id": "e3fc5382-3841-479c-922f-0ed65b2378e1",
          "user_id": "da0b164d-8b3c-4d7f-a576-6c2f2781e5c9",
          "org_id": "f176b360-911b-4037-a9ee-663180f53ece",
          "employee_code": "emp-102",
          "department": "General",
          "designation": null,
          "joining_date": null,
          "manager_id": null,
          "work_location": "indore",
          "employment_type": null,
          "created_at": "2026-08-01T02:45:08.893Z",
          "updated_at": "2026-08-01T02:45:08.893Z",
          "deleted_at": null
        },
        "manager_profile": null,
        "hr_profile": null
      },
      "shift": {
        "id": "1ac83800-920d-408c-8f30-2579c0501f68",
        "org_id": "f176b360-911b-4037-a9ee-663180f53ece",
        "name": "Morning Shift",
        "type": "fixed",
        "start_time": "10:30:00",
        "end_time": "18:30:00",
        "min_hours": null,
        "core_start_time": null,
        "core_end_time": null,
        "split_start_time_2": null,
        "split_end_time_2": null,
        "timezone": "Asia/Kolkata",
        "is_overnight": false,
        "buffer_minutes_before": 15,
        "buffer_minutes_after": 15,
        "is_active": true,
        "policy_id": null,
        "created_by": "fe3887c1-3754-4768-b9cc-b45d8ea01b3e",
        "updated_by": "fe3887c1-3754-4768-b9cc-b45d8ea01b3e",
        "created_at": "2026-08-01T03:40:05.977Z",
        "updated_at": "2026-08-01T03:40:05.977Z"
      },
      "rotation_pattern": null
    }
  ]
}
```

---

## 4. Holidays API

Manages organizational holidays. 

### 4.1 Create Holiday
**Endpoint**: `POST /holidays`  
**Frontend Use**: HR adds a holiday to the calendar.

**Request Payload:**
```json
{
  "name": "Diwali",
  "date": "2026-11-08T00:00:00.000Z",
  "type": "public" 
}
```
*(Types allowed: `public`, `optional`, `restricted`)*

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Holiday created successfully",
  "data": { "id": "uuid", "name": "Diwali", "date": "2026-11-08" }
}
```

### 4.2 Get Holidays
**Endpoint**: `GET /holidays?year=2026`  
**Frontend Use**: Called when the user navigates to the Holiday Calendar view. Always pass the `year` query parameter to avoid pulling a decade of holidays.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Holidays fetched successfully",
  "data": [
    {
      "id": "uuid",
      "name": "Diwali",
      "date": "2026-11-08",
      "type": "public",
      "is_active": true
    }
  ]
}
```

### 4.3 Update Holiday
**Endpoint**: `PUT /holidays/:id`  
**Frontend Use**: Edit an existing holiday's details.

**Request Payload:**
```json
{
  "name": "Deepavali"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Holiday updated successfully",
  "data": { "id": "uuid", "name": "Deepavali" }
}
```

### 4.4 Delete Holiday
**Endpoint**: `DELETE /holidays/:id`  
**Frontend Use**: Remove a holiday from the calendar.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Holiday deleted successfully",
  "data": { "id": "uuid", "is_active": false }
}
```

---

## 5. Weekly Offs API

Defines weekend rules (e.g., Saturday and Sunday are off).

### 5.1 Create Weekly Off Rule
**Endpoint**: `POST /weekly-offs`  
**Frontend Use**: HR configures standard off days.

**Request Payload (Global rule: Every Sunday is off):**
```json
{
  "day_of_week": 0,
  "effective_from": "2026-01-01T00:00:00.000Z"
}
```
*(Days: 0 = Sunday, 1 = Monday ... 6 = Saturday)*

**Request Payload (Shift-specific: Night shift gets Monday off):**
```json
{
  "shift_id": "night_shift_uuid",
  "day_of_week": 1,
  "effective_from": "2026-01-01T00:00:00.000Z"
}
```

**Frontend Implementation Tip**: Map the integers 0-6 to day names in the UI. If `shift_id` and `user_id` are both `null`, the backend interprets it as a global organizational weekly off.

### 5.2 Get Weekly Offs
**Endpoint**: `GET /weekly-offs`  
**Frontend Use**: Fetch existing weekly off rules.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly off rules fetched successfully",
  "data": [
    {
      "id": "uuid",
      "day_of_week": 0,
      "shift_id": null,
      "user_id": null,
      "is_active": true
    }
  ]
}
```

### 5.3 Update Weekly Off Rule
**Endpoint**: `PUT /weekly-offs/:id`  
**Frontend Use**: Update a specific weekly off rule.

**Request Payload:**
```json
{
  "day_of_week": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly off rule updated successfully",
  "data": { "id": "uuid", "day_of_week": 1 }
}
```

### 5.4 Delete Weekly Off Rule
**Endpoint**: `DELETE /weekly-offs/:id`  
**Frontend Use**: Remove a weekly off exception or rule.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly off rule deleted successfully",
  "data": { "id": "uuid", "is_active": false }
}
```

---

## General UI/UX Recommendations for Frontend Developers
1. **Timezones**: Send all dates (`effective_from`, `date`) as standard ISO strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). The backend will handle them correctly. Shift `start_time` and `end_time` are literal strings (`09:00`) tied to the `timezone` parameter (default `Asia/Kolkata`).
2. **Error Handling**: 
   - If an API returns `409 Conflict`, it usually means an overlap (e.g., "Holiday already exists on this date"). Display the exact `err.response.data.message` in a toast notification.
3. **Data Loading**: When loading the Shift Assignment (Roster) page, you must dispatch `GET /shifts`, `GET /rotations`, and a User list API simultaneously via `Promise.all` so you have all the necessary dropdown data ready.
