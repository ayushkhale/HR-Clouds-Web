# Phase 6: Reporting — Frontend Requirements for Backend

This document outlines the frontend UI/UX requirements for the **Leave Reporting** phase (Phase 6), which is currently blocked pending backend API endpoints. The goal is to provide the backend team with a clear contract of what data the frontend needs to build a rich, convenient, and visually appealing reporting dashboard for HR and Managers.

## 1. Overview of Desired Frontend UI
For optimal user convenience, the frontend plans to implement:
- **Global Leave Summary Dashboard**: High-level metrics for HR (e.g., total leaves taken this month, most common leave types, average duration).
- **Employee Utilization Grid**: A paginated, tabular view showing every employee's total quota, consumed quota, and remaining balances across all leave types.
- **Export Capabilities**: Easy 1-click downloads for payroll processing or compliance (CSV/Excel).
- **Date Range & Department Filters**: Ability to filter the reports by specific date ranges (e.g., Q1, YTD) and demographic filters (department, location).

## 2. Requested API Endpoints & Data Contracts

### 2.1. GET `/leaves/reports/summary`
**Purpose**: Power the top-level metric cards and charts on the reporting dashboard.
**Query Params**: `start_date`, `end_date`, `department_id` (optional).
**Expected Response Shape**:
```json
{
  "success": true,
  "data": {
    "total_leaves_approved": 145,
    "total_days_consumed": 312.5,
    "total_lwp_days": 12.0,
    "leave_type_breakdown": [
      { "leave_type_id": "uuid", "name": "Annual Leave", "days_consumed": 200 },
      { "leave_type_id": "uuid", "name": "Sick Leave", "days_consumed": 112.5 }
    ],
    "monthly_trend": [
      { "month": "2024-01", "days_consumed": 45 },
      { "month": "2024-02", "days_consumed": 38 }
    ]
  }
}
```

### 2.2. GET `/leaves/reports/utilization`
**Purpose**: Power the detailed, paginated data grid showing per-employee balances.
**Query Params**: `page`, `limit`, `search` (employee name), `department_id` (optional), `year`.
**Expected Response Shape**:
```json
{
  "success": true,
  "data": {
    "total_records": 450,
    "page": 1,
    "limit": 50,
    "employees": [
      {
        "user_id": "uuid",
        "employee_name": "John Doe",
        "department": "Engineering",
        "balances": [
          {
            "leave_type_id": "uuid",
            "leave_type_name": "Annual Leave",
            "allocated": 20,
            "consumed": 5,
            "remaining": 15
          }
        ],
        "total_lwp_days_ytd": 2.5
      }
    ]
  }
}
```

### 2.3. GET `/leaves/reports/export`
**Purpose**: Provide a direct download link or binary stream for a CSV/Excel report.
**Query Params**: `start_date`, `end_date`, `format` (csv | xlsx).
**Expected Response**: A standard file download (e.g., `text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

## 3. UI/UX Justification for Backend Considerations
1. **Pagination & Meta**: To prevent the browser from freezing on large employee sets (500+), the `utilization` endpoint *must* be paginated and return `total_records` for the frontend pagination component.
2. **Aggregations on Backend**: The frontend *should not* fetch 10,000 raw leave requests and group them by month/type. The `summary` endpoint should return pre-aggregated data to keep the dashboard snappy and reduce payload sizes.
3. **LWP Isolation**: Loss of Pay (LWP) is critical for payroll. Highlighting `total_lwp_days` separately in both the summary and utilization endpoints allows the frontend to apply distinct warning colors (e.g., red) for payroll alerts.

Once these endpoints are available, the frontend can unblock Phase 6 and deliver the Reporting Dashboard.
