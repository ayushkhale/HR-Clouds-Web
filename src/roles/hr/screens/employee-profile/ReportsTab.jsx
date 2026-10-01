import React from "react";
import EmployeeAttendanceReport from "../../../../shared/attendance/EmployeeAttendanceReport";

// Same report view and CSV as the HR Reports page (previously this tab read
// `clock_in`/`clock_out` while the page read `clock_in_time`, and recounted
// totals client-side).
export default function ReportsTab({ userId, employeeName }) {
  return (
    <div className="space-y-5">
      <h2 className="text-base font-bold text-slate-800">Attendance report</h2>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
        <EmployeeAttendanceReport key={userId} userId={userId} employeeLabel={employeeName} />
      </div>
    </div>
  );
}
