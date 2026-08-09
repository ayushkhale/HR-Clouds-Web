# Phase 5: Locations, Devices, Comp Off & HR Workflows
**Frontend Integration & UI/UX Guide**

This document outlines the Phase 5 Attendance APIs, which focus on **HR-controlled configurations for physical attendance (Geofencing and Biometrics)** and **Compensatory Off tracking**. It is explicitly designed to empower HR managers to control and configure physical attendance parameters for their specific organization, bypassing the need for global IT Admin intervention. 

---

## 🧭 Global UI/UX Concepts for Phase 5

1. **HR Empowerment & Org Isolation:** Different organizations have wildly different rules for tracking physical attendance. Phase 5 shifts hardware and location configurations entirely to the HR domain. The UI must present these technical configurations (like Geofences and Biometric device IDs) in a user-friendly, non-technical way.
2. **Hardware & Physical Constraints:** Phase 5 introduces the physical reality of attendance. Employees clocking in from specific locations (Geofencing) or using hardware devices (Biometrics). The UI must handle the mapping of digital profiles to these physical constraints.
3. **Comp Offs as Currency:** Compensatory offs are earned by working on off-days. They act as a form of currency that expires over time and can be redeemed as leave. The UI needs to clearly show the lifecycle of this currency (Earned -> Approved -> Expired/Used).

---

## 📍 HR Workflows: Locations (Geofencing)

### 1. Manage Attendance Locations (CRUD)
**Endpoints:** 
* `GET /api/v1/attendance/hr/locations`
* `POST /api/v1/attendance/hr/locations`
* `PUT /api/v1/attendance/hr/locations/:id`
* `DELETE /api/v1/attendance/hr/locations/:id`

**What is this API & Why is it being used:**
This API allows HR to define geographical perimeters (geofences) where employees are authorized to use the mobile or web app to punch in. By keeping this under HR control, an HR manager for a construction company can dynamically add new job sites as "Locations" without waiting for a Super Admin.

**How Frontend Can Integrate:**
* **List View:** Fetch data via the `GET` endpoint and display it in a data table showing Location Name, Address, Coordinates, and Radius. 
* **Activation Toggle:** Provide a quick toggle switch in the list view. Toggling it sends a `PUT` request with `{ "is_active": boolean }` to instantly activate/deactivate a location.

**Suggested Design and UI/UX:**
* **Map Integration (Crucial):** When creating or editing a location, do not just provide sterile text inputs for Latitude and Longitude. Integrate an interactive map component (like Google Maps, Mapbox, or Leaflet). 
* **Interactive Radius:** Allow the HR manager to drop a pin to get the coordinates and use a slider to set the `radius_meters`. The map must draw a semi-transparent circle representing the geofence in real-time so HR visually understands the permitted area.

---

## 📠 HR Workflows: Biometric Devices

### 2. Manage Biometric Devices (CRUD)
**Endpoints:**
* `GET /api/v1/attendance/hr/devices`
* `POST /api/v1/attendance/hr/devices`
* `PUT /api/v1/attendance/hr/devices/:id`
* `DELETE /api/v1/attendance/hr/devices/:id`

**What is this API & Why is it being used:**
Integrates hardware punch clocks (fingerprint/face scanners) directly into the HRMS. Moving this to HR means local HR representatives at branch offices can register newly purchased scanners for their branch immediately.

**How Frontend Can Integrate:**
* Fetch devices and display them in a list. When registering a new device via the `POST` endpoint, the backend responds with a generated `api_key_plain`. The frontend MUST capture this response.

**Suggested Design and UI/UX:**
* **Data Table:** Show Device Name, Type (Face/Fingerprint/Card), Serial Number, Location (mapped to the Geofence), and a "Last Sync" timestamp.
* **Health Indicators:** If a device hasn't synced in 24 hours, pulse a Red dot next to it to alert HR it might be offline.
* **Secret Management (Critical):** Display the newly generated API Key **only once** to the HR manager in a secure, focus-trapped modal. Provide a "Copy to clipboard" button and a bold warning: "This key will never be shown again. Please copy it into the device's network configuration."

### 3. Device-Employee Mapping
**Endpoints:**
* `GET /api/v1/attendance/hr/devices/:id/mappings`
* `POST /api/v1/attendance/hr/devices/:id/mappings`
* `DELETE /api/v1/attendance/hr/devices/:id/mappings/:mappingId`

**What is this API & Why is it being used:**
A biometric device only knows an employee as an internal integer ID (e.g., Enrollment Number "1005"). The HRMS knows the employee as a UUID. This mapping allows HR to tell the system: "Employee 1005 on the Front Desk Scanner is actually Alice (UUID)".

**How Frontend Can Integrate:**
* When an HR user clicks on a specific device, fetch its mappings using the `GET` endpoint. Provide a form to `POST` new mappings.

**Suggested Design and UI/UX:**
* **Enrollment UI:** Inside the Device details page, provide a dedicated "Enrolled Employees" tab.
* **Mapping Form:** To add a mapping, the HR manager selects a User from an autocomplete dropdown (searching by name/email) and types in the `device_employee_id` (the number configured on the physical device).
* **Bulk Upload (Highly Recommended):** Provide a CSV template download and upload feature. Mapping 500 employees one-by-one is terrible UX; a CSV upload parsing `email, device_id` saves hours of HR time.

---

## 🎁 HR Workflows: Compensatory Offs (Comp Offs)

### 4. View Earned Comp Offs
**Endpoint:** `GET /api/v1/attendance/hr/comp-offs`

**What is this API & Why is it being used:**
When an employee clocks in on a Holiday or Weekly Off, the calculation engine automatically creates a pending Comp Off record (if org policy allows). HR needs to review these to prevent abuse.

**How Frontend Can Integrate:**
* Fetch a paginated list of comp-offs, allowing filtering by status (`earned`, `approved`, `expired`, `used`).

**Suggested Design and UI/UX:**
* **Inbox View:** Treat this like an approval inbox. Show Employee Name, Date Worked, Type (Holiday/Weekly Off), and Hours Worked.
* **Lifecycle Badges:** Clearly distinguish statuses using colors: `earned` (Orange - pending action), `approved` (Green - ready to use), `used` (Blue - consumed as leave), `expired` (Gray).

### 5. Approve / Reject / Cancel Comp Offs
**Endpoints:**
* `POST /api/v1/attendance/hr/comp-offs/:id/approve`
* `POST /api/v1/attendance/hr/comp-offs/:id/reject`

**What is this API & Why is it being used:**
Working on a weekend doesn't automatically grant a free leave; it requires formal HR approval to convert the "earned" time into an "approved" balance.

**How Frontend Can Integrate:**
* Trigger the approval/rejection endpoints via buttons on the Inbox view. Provide an optional remarks field in the payload.

**Suggested Design and UI/UX:**
* **Action Buttons:** Place prominent Approve/Reject buttons on each row. **Bulk approval checkboxes** are highly recommended so HR can clear the inbox quickly.
* **Expiry Notification:** When approving, immediately show a toast or inline message indicating when this Comp Off will expire (e.g., "Approved. Valid for 90 days") based on org policy.

---

## ⚙️ The Invisible Workflow: Biometric Webhook

**Endpoint:** `POST /api/v1/attendance/devices/webhook`

**What is this API & Why is it being used:**
This is the ingestion point for hardware devices pushing punch data over the internet. **The frontend UI never calls this.** It is a public-facing API protected by the device-specific API key generated in step 2.

**Developer/Integration Note:**
* The endpoint must be extremely fast.
* It must handle idempotency (devices often retry sending punches if networks are flaky).
* It parses the payload, uses `attendance_device_employee_mappings` to resolve the internal `device_employee_id` to a platform `user_id`, and writes to `attendance_logs` mimicking a mobile clock-in.

---

## 🚨 Standard Error Codes for Phase 5

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `400` | `INVALID_COORDINATES` | Latitude/Longitude format invalid | Highlight map/input fields |
| `409` | `MAPPING_ALREADY_EXISTS` | That employee is already mapped on this device | Alert: "Employee already enrolled on this scanner" |
| `404` | `DEVICE_NOT_FOUND` | Webhook triggered for unregistered device | (Backend only) Drop request |
| `403` | `COMP_OFF_EXPIRED` | Attempting to approve/use an expired comp-off | Show toast error |
