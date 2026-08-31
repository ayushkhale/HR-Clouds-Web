# Attendance Module - Phase 5 API Documentation

This document outlines the APIs developed during Phase 5 of the Attendance Module. 

> **Important Note for Frontend Developers:**
> The primary focus for the current sprint is the **Locations (Geofencing)** and **Compensatory Offs (Comp Offs)** APIs. 
> The **Device, Hardware Mapping, and Webhook APIs** are included in this document for completeness, but they are reserved for **Future Use** (when physical biometric hardware integration begins).

---

## 1. Locations (Geofencing) APIs [MAIN FOCUS]

**Purpose:** 
These APIs allow HR to define physical office locations using GPS coordinates (Latitude and Longitude) and a radius (in meters). 
**Frontend Use Case:** 
When an employee uses the mobile app or web portal to "Clock In", the frontend sends the user's live GPS coordinates. The backend `ClockIn` engine will automatically compare the user's live coordinates against these HR-defined locations. If the user is outside the radius of all active locations, the system will flag the punch with a high-severity `out_of_bounds` anomaly.

### 1.1 Create a Location
- **Endpoint:** `POST /api/v1/attendance/hr/locations`
- **Headers:** `Authorization: Bearer <HR_JWT_TOKEN>`
- **Payload:**
```json
{
  "name": "Headquarters - Block A",
  "latitude": 28.704060,
  "longitude": 77.102493,
  "radius_meters": 100,
  "address": "New Delhi, India"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Location created successfully",
  "data": {
    "id": "uuid-...",
    "org_id": "uuid-...",
    "name": "Headquarters - Block A",
    "latitude": 28.704060,
    "longitude": 77.102493,
    "radius_meters": 100,
    "is_active": true
  }
}
```

### 1.2 Get All Locations
- **Endpoint:** `GET /api/v1/attendance/hr/locations`
- **Headers:** `Authorization: Bearer <HR_JWT_TOKEN>`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Locations fetched successfully",
  "data": [
    {
      "id": "uuid-...",
      "name": "Headquarters - Block A",
      "latitude": 28.704060,
      "longitude": 77.102493,
      "radius_meters": 100,
      "is_active": true
    }
  ]
}
```

### 1.3 Update a Location
- **Endpoint:** `PUT /api/v1/attendance/hr/locations/:id`
- **Headers:** `Authorization: Bearer <HR_JWT_TOKEN>`
- **Payload:** (All fields optional)
```json
{
  "radius_meters": 150
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": { ...updatedLocation }
}
```

### 1.4 Delete/Deactivate Location
- **Endpoint:** `DELETE /api/v1/attendance/hr/locations/:id`
- **Headers:** `Authorization: Bearer <HR_JWT_TOKEN>`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Location deleted successfully"
}
```

---

## 2. Compensatory Offs (Comp Offs) APIs [MAIN FOCUS]

**Purpose:**
When an employee works on a designated Holiday or Weekly Off, the calculation engine automatically creates a Comp Off record in the `earned` status. These APIs allow HR to review these records and explicitly `approve` or `reject` them.
**Frontend Use Case:**
The HR dashboard needs a queue/list view showing all `earned` comp offs. HR can click "Approve" (which sets a 90-day expiry date) or "Reject". Approved Comp Offs become balance that the employee can use in the Leave Module.

### 2.1 Get All Comp Offs (Filterable)
- **Endpoint:** `GET /api/v1/attendance/hr/comp-offs?status=earned`
- **Manager Endpoint:** `GET /api/v1/attendance/manager/comp-offs/pending`
- **Headers:** `Authorization: Bearer <HR_OR_MANAGER_JWT_TOKEN>`
- **Query Params:** `status` (earned, approved, rejected, expired, consumed)
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Comp offs fetched successfully",
  "data": [
    {
      "id": "uuid-...",
      "user_id": "uuid-...",
      "earned_date": "2026-08-01",
      "worked_type": "holiday",
      "worked_hours": "8.50",
      "status": "earned"
    }
  ]
}
```

### 2.2 Approve Comp Off
- **Endpoint:** `POST /api/v1/attendance/hr/comp-offs/:id/approve`
- **Manager Endpoint:** `POST /api/v1/attendance/manager/comp-offs/:id/approve`
- **Headers:** `Authorization: Bearer <HR_OR_MANAGER_JWT_TOKEN>`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Comp off approved",
  "data": {
    "id": "uuid-...",
    "status": "approved",
    "expiry_date": "2026-10-30T00:00:00.000Z" // +90 Days
  }
}
```

### 2.3 Reject Comp Off
- **Endpoint:** `POST /api/v1/attendance/hr/comp-offs/:id/reject`
- **Manager Endpoint:** `POST /api/v1/attendance/manager/comp-offs/:id/reject`
- **Headers:** `Authorization: Bearer <HR_OR_MANAGER_JWT_TOKEN>`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Comp off rejected",
  "data": {
    "status": "rejected"
  }
}
```

---

## 3. Hardware & Webhook APIs [FUTURE USE]

> **Notice:** The following APIs are built and fully functional but are intended for Phase 6+ when biometric physical hardware is integrated. Frontend developers do not need to integrate these into the main application right now.

### 3.1 Device Management
**Purpose:** Registering biometric scanners into the system. It generates an unrecoverable API Key for the hardware to use.

- **Register Device:** `POST /api/v1/attendance/hr/devices`
  - **Payload:** `{ "name": "Front Door Scanner", "type": "biometric", "serial_number": "SN12345", "location_id": "uuid-..." }`
  - **Response:** Returns an `api_key_plain`. This is the **only** time the key is ever shown. It must be copied and pasted into the physical hardware's settings.
- **List Devices:** `GET /api/v1/attendance/hr/devices`
- **Update Device:** `PUT /api/v1/attendance/hr/devices/:id`
- **Deactivate Device:** `DELETE /api/v1/attendance/hr/devices/:id`

### 3.2 Employee-to-Device Mapping
**Purpose:** Maps an employee's Database UUID to the hardware's internal Integer ID (e.g., ID `105`).

- **Create Mapping:** `POST /api/v1/attendance/hr/devices/:id/mappings`
  - **Payload:** `{ "user_id": "uuid-...", "device_employee_id": "105" }`
- **List Mappings:** `GET /api/v1/attendance/hr/devices/:id/mappings`
- **Delete Mapping:** `DELETE /api/v1/attendance/hr/devices/:deviceId/mappings/:mappingId`

### 3.3 Biometric Webhook (System API)
**Purpose:** The endpoint that the physical hardware calls when a user scans their fingerprint.

- **Endpoint:** `POST /api/v1/attendance/devices/webhook`
- **Authentication:** `Authorization: Bearer <API_KEY_PLAIN>` (Uses hardware API Key, NOT user JWT)
- **Payload:**
```json
{
  "device_id": "uuid-...",
  "device_employee_id": "105",
  "timestamp": "2026-08-04T09:00:00.000Z",
  "type": "clock_in"
}
```
- **Behavior:** Features a 60-second idempotency window to prevent duplicate records if a user scans their finger multiple times accidentally. Translates the hardware ID to the DB UUID and inserts directly into `attendance_logs`.
