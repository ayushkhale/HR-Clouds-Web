import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import RegularizationCard from "../components/RegularizationCard";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles } from "react-icons/hi";

function AttendanceRegularizationsPage({ role = "employee" }) {
  const [regularizations, setRegularizations] = useState([]);

  useEffect(() => {
    fetchRegularizations();
  }, []);

  const fetchRegularizations = async () => {
    try {
      const res = await attendanceAPI.getMyRegularizations();
      if (res.success) {
        setRegularizations(res.data?.requests || res.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Attendance Regularizations" />

        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto flex-1 space-y-6 lg:space-y-8">
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance Regularizations</h1>
              <p className="text-sm text-slate-500 mt-1">Submit requests to fix missing punches or correct attendance anomalies.</p>
            </div>
          </div>

          <div className="max-w-4xl">
            <RegularizationCard requests={regularizations} fetchRegularizations={fetchRegularizations} />
          </div>

        </main>
      </div>
    </div>
  );
}

export default AttendanceRegularizationsPage;
