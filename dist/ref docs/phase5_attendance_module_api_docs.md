# Phase 5: Locations, Devices, & Comp Off APIs
**Frontend Integration & API Reference Guide**

This document outlines the Phase 5 Attendance APIs, which focus on **Locations (Geofencing)**, **Biometric Devices**, and **Compensatory Off Tracking**. It provides the technical details (endpoints, payloads) and UI/UX recommendations to help the Frontend team integrate seamlessly. 

*Note: As per organizational requirements, the configuration of physical attendance boundaries (Locations and Devices) has been shifted from global IT Admin control to local HR control. This ensures HR can manage their own org's physical parameters independently.*

---

## 📍 HR Workflows: Locations (Geofencing)

*Note: All endpoints below require the user to have an HR or Super-Admin role. They are mounted under the `/api/v1/attendance/hr/locations` namespace.*

### 1. Create a Location
**Endpoint:** `POST /api/v1/attendance/hr/locations`

**Why we have this API:**
Defines a geographical perimeter (geofence) where employees are allowed to clock in/out using their mobile app. Empowering HR to do this means they can instantly provision new branch offices or job sites.

**Request Payload:**
```json
{
  "name": "Head Office HQ",
  "address": "123 Business Park, Silicon Valley",
  "latitude": 37.3875,
  "longitude": -122.0575,
  "radius_meters": 150
}
```

**UI/UX Recommendations:**
* **Map Component:** Provide an interactive map (e.g., Google Maps API) for the user to drop a pin. Automatically populate the latitude and longitude fields. 
* **Radius Slider:** Allow the user to adjust the `radius_meters` and visually draw the geofence circle on the map in real-time. Do not force HR users to guess what "150 meters" looks like in the real world.

**Response:**
```json
{
  "success": true,
  "message": "Location created successfully",
  "data": {
    "id": "loc-uuid-123",
    "name": "Head Office HQ",
    "is_active": true
  }
}
```

### 2. View All Locations
**Endpoint:** `GET /api/v1/attendance/hr/locations`

**UI/UX Recommendations:**
* List all locations in a clean data table with toggle switches for quick activation/deactivation.

### 3. Update / Deactivate a Location
**Endpoint:** `PUT /api/v1/attendance/hr/locations/:id`

**Request Payload:**
```json
{
  "is_active": false
}
```

---

## 📠 HR Workflows: Biometric Devices

*Note: All endpoints below require the user to have an HR or Super-Admin role. They are mounted under the `/api/v1/attendance/hr/devices` namespace.*

### 4. Register a Biometric Device
**Endpoint:** `POST /api/v1/attendance/hr/devices`

**Why we have this API:**
Registers a physical hardware scanner (fingerprint/face) so it can push attendance logs to the HRMS.

**Request Payload:**
```json
{
  "name": "Front Desk Scanner",
  "type": "biometric_fingerprint",
  "serial_number": "ZK-998877",
  "location_id": "loc-uuid-123" 
}
```
*(Note: `location_id` is optional but recommended so we know where the device physically is).*

**Response:**
```json
{
  "success": true,
  "message": "Device registered. Keep this API Key secure.",
  "data": {
    "id": "dev-uuid-456",
    "api_key_plain": "att_dev_abc123xyz890", // ONLY SHOWN ONCE!
    "webhook_url": "https://api.company.com/v1/attendance/devices/webhook"
  }
}
```

**UI/UX Recommendations:**
* **One-time Secret:** Crucial! The `api_key_plain` must be displayed in a modal with a "Copy" button. Display a strong warning: "This key will never be shown again. Please copy it into the device configuration."

### 5. View Devices
**Endpoint:** `GET /api/v1/attendance/hr/devices`

**UI/UX Recommendations:**
* Show the `last_sync_at` timestamp. Highlight devices in Red if they haven't synced in over 24 hours (potential network issue).

### 6. Map Employee to Device
**Endpoint:** `POST /api/v1/attendance/hr/devices/:id/mappings`

**Why we have this API:**
Hardware devices track users by internal IDs (e.g., Enrollment Number "10"). The system must link "10" to the employee's `user_id`. Without this, the webhook fails because it doesn't know who "10" is.

**Request Payload:**
```json
{
  "user_id": "user-uuid-789",
  "device_employee_id": "10"
}
```

**UI/UX Recommendations:**
* Provide an auto-suggest search box to find the Employee by name/email, then input the Device ID number.
* Consider offering a CSV bulk upload option if there are hundreds of employees.

### 7. Receive Biometric Webhook (System Endpoint)
**Endpoint:** `POST /api/v1/attendance/devices/webhook`

**Why we have this API:**
Hardware devices call this endpoint to send punches. **The frontend never calls this.** It is isolated from the `hr` namespace because the device itself is authenticating via API Key, not an HR user token.

**Request Payload (Example from Device):**
```json
{
  "device_id": "dev-uuid-456",
  "device_employee_id": "10",
  "timestamp": "2026-08-01T09:00:00Z",
  "type": "clock_in"
}
```
*(Requires the `Authorization: Bearer <API_KEY>` header).*

---

## 🎁 HR Workflows: Compensatory Offs (Comp Offs)

*Note: All endpoints below require the user to have an HR role. They are mounted under the `/api/v1/attendance/hr/comp-offs` namespace.*

### 8. View Earned Comp Offs
**Endpoint:** `GET /api/v1/attendance/hr/comp-offs?status=earned`

**Why we have this API:**
When an employee works on a weekend or holiday, the system generates a `pending` (earned) Comp Off. HR must approve these before they can be redeemed for leave.

**UI/UX Recommendations:**
* Use a card or table view displaying Employee Name, Date Worked, Reason (Holiday vs Weekly Off), and Hours Worked.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "comp-uuid-999",
      "user": { "name": "Alice" },
      "earned_date": "2026-08-15",
      "worked_type": "holiday",
      "worked_hours": 8.5,
      "status": "earned"
    }
  ]
}
```

### 9. Approve / Reject Comp Off
**Endpoint:** `POST /api/v1/attendance/hr/comp-offs/:id/approve`
**Endpoint:** `POST /api/v1/attendance/hr/comp-offs/:id/reject`

**Why we have this API:**
Approving a comp off sets an `expiry_date` (based on org policy, e.g., expires in 90 days) and makes it available in the Leave Module.

**UI/UX Recommendations:**
* Support bulk select checkboxes to approve multiple at once.
* Upon approval, briefly show the expiration date to the HR manager so they are aware.

---

## 🚨 Standard Error Codes for Phase 5

| HTTP Status | App Error Code | Meaning | UI Action |
|-------------|----------------|---------|-----------|
| `400` | `INVALID_COORDINATES` | Latitude/Longitude format invalid | Highlight map/input fields |
| `409` | `MAPPING_ALREADY_EXISTS` | That employee is already mapped on this device | Alert: "Employee already enrolled on this scanner" |
| `401` | `UNAUTHORIZED_DEVICE` | Webhook API Key is missing or invalid | (Backend only) |
| `404` | `DEVICE_NOT_FOUND` | Webhook triggered for unregistered device | (Backend only) |
| `400` | `COMP_OFF_NOT_EARNED` | Trying to approve a comp-off not in earned state | Show toast error |
