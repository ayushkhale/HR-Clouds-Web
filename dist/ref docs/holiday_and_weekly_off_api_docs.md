# Holiday and Weekly Off Rules API Documentation

This document provides a comprehensive guide for frontend developers regarding the **Holidays** and **Weekly Offs** APIs. It covers why these APIs exist, how the backend multidimensional targeting engine works, and provides the exact REST API contracts (endpoints, payloads, and responses) required for integration.

---

## The Targeting Engine: How It Works

Both Holidays and Weekly Offs use a highly granular "Targeting Engine". Because a large organization might have different holidays for different locations, or different weekends for different shifts, the backend accepts multidimensional arrays to map out exactly who receives the rule.

### Targeting Arrays
When creating or updating a Holiday or Weekly Off, you will pass a set of targeting arrays:
- `target_departments` (Array of UUIDs)
- `target_locations` (Array of UUIDs)
- `target_employment_types` (Array of Strings)
- `target_job_statuses` (Array of Strings)
- `target_shifts` (Array of UUIDs) *(Only available for Weekly Offs)*
- `included_users` (Array of UUIDs - force include)
- `excluded_users` (Array of UUIDs - force exclude)

**Frontend Rule of Thumb:** 
- To target the entire organization globally, send all targeting arrays as **empty arrays (`[]`)**.
- To target specific segments, add the respective identifiers (UUIDs/Strings) to the arrays.

---

## 1. Holidays API (`/hr/attendance/holidays`)

### Why This Exists & Frontend Implications
The Attendance Engine must know the exact dates of public and company holidays. If an employee does not punch in on a registered holiday, the engine will correctly identify the day as a Holiday instead of marking them "Absent". 

**Frontend Workflow:**
- **Calendar UI**: The frontend should render a Yearly/Monthly Calendar UI fetching data via `GET /holidays`. 
- **Creation Modal**: When HR clicks "Add Holiday", open a modal with a DatePicker, Name input, Type dropdown (Public/Restricted), and a series of **Multi-Select Dropdowns** corresponding to the targeting arrays mentioned above (e.g., "Select Applicable Locations", "Select Applicable Departments").

### 1.1 Create Holiday
**Endpoint**: `POST /holidays`  
**Description**: Adds a specific date as a holiday for the organization or specific segments.

**Request Payload:**
```json
{
  "name": "Diwali",
  "date": "2026-11-08T00:00:00.000Z",
  "type": "public",
  "target_departments": [],
  "target_locations": ["loc-uuid-123", "loc-uuid-456"],
  "target_employment_types": [],
  "target_job_statuses": [],
  "included_users": [],
  "excluded_users": []
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Holiday created successfully",
  "data": { 
    "id": "uuid", 
    "name": "Diwali", 
    "date": "2026-11-08"
  }
}
```

### 1.2 Get Holidays
**Endpoint**: `GET /holidays?year=YYYY`  
**Description**: Fetches holidays. **Crucial**: Always pass the `?year=YYYY` query parameter to prevent the backend from returning a massive payload spanning decades, which could crash the browser.

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
      "target_departments": [],
      "target_locations": ["loc-uuid-123"],
      "target_employment_types": [],
      "target_job_statuses": [],
      "included_users": [],
      "excluded_users": [],
      "is_active": true
    }
  ]
}
```

### 1.3 Update Holiday
**Endpoint**: `PUT /holidays/:id`  

**Request Payload (All targeting arrays are optional for PUT):**
```json
{
  "name": "Deepavali",
  "target_locations": []
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

### 1.4 Delete Holiday
**Endpoint**: `DELETE /holidays/:id`  
**Description**: Soft deletes a holiday.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Holiday deleted successfully",
  "data": { "id": "uuid", "is_active": false }
}
```

---

## 2. Weekly Offs API (`/hr/attendance/weekly-offs`)

### Why This Exists & Frontend Implications
Just like holidays, the engine needs to know when weekends happen so it doesn't penalize employees for not punching in on a Sunday. 

However, many roles (e.g., Security, Support) do not have standard Saturday/Sunday weekends. The Weekly Offs API uses a **Priority-Based Rules System** to handle this.

**Frontend Workflow:**
- **Matrix View**: The frontend should build a view showing the global weekends (rules targeting `[]`) at the top, and a table of specific exceptions (rules targeting specific shifts/departments) below it.
- **Priority Logic**: The UI should allow HR to set a `priority` integer (e.g. 0 to 100). If an employee belongs to the Global rule (Priority: 0, Sunday Off) AND a Night Shift rule (Priority: 10, Monday Off), the engine will honor the higher priority (Monday Off) and ignore the lower one.
- **Day Mapping**: The backend accepts `days_of_week` as an array of integers (0 = Sunday, 1 = Monday ... 6 = Saturday). The frontend must map these integers to human-readable strings (e.g. Checkboxes for "Sun", "Mon", "Tue").

### 2.1 Create Weekly Off Rule
**Endpoint**: `POST /weekly-offs`  
**Description**: Defines which day(s) of the week are considered weekends using priority-based targeting.

**Request Payload (Global rule: Every Sunday is off):**
```json
{
  "name": "Global Sunday Off",
  "days_of_week": [0],
  "priority": 0,
  "target_departments": [],
  "target_locations": [],
  "target_employment_types": [],
  "target_job_statuses": [],
  "target_shifts": [],
  "included_users": [],
  "excluded_users": []
}
```

**Request Payload (Shift-specific Exception: Night shift gets Monday and Tuesday off):**
```json
{
  "name": "Night Shift Weekly Off",
  "days_of_week": [1, 2],
  "priority": 10,
  "target_departments": [],
  "target_locations": [],
  "target_employment_types": [],
  "target_job_statuses": [],
  "target_shifts": ["night_shift_uuid"],
  "included_users": [],
  "excluded_users": []
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Weekly off rule created successfully",
  "data": { "id": "uuid", "name": "Night Shift Weekly Off" }
}
```

### 2.2 Get Weekly Off Rules
**Endpoint**: `GET /weekly-offs`  

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly off rules fetched successfully",
  "data": [
    {
      "id": "uuid",
      "name": "Global Sunday Off",
      "days_of_week": [0],
      "priority": 0,
      "target_departments": [],
      "target_locations": [],
      "target_employment_types": [],
      "target_job_statuses": [],
      "target_shifts": [],
      "included_users": [],
      "excluded_users": [],
      "is_active": true
    }
  ]
}
```

### 2.3 Update Weekly Off Rule
**Endpoint**: `PUT /weekly-offs/:id`  

**Request Payload (All targeting arrays optional for PUT):**
```json
{
  "days_of_week": [1, 2],
  "priority": 15
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly off rule updated successfully",
  "data": { "id": "uuid", "days_of_week": [1, 2], "priority": 15 }
}
```

### 2.4 Delete Weekly Off Rule
**Endpoint**: `DELETE /weekly-offs/:id`  

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Weekly off rule deleted successfully",
  "data": { "id": "uuid", "is_active": false }
}
```
