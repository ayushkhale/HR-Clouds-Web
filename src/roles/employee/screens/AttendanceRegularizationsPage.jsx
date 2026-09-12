import React, { useState, useEffect } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import RegularizationCard from "../components/RegularizationCard";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles } from "react-icons/hi";

function AttendanceRegularizationsPage() {
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
    <>
        <DashboardTopBar title="Attendance Regularizations" />

        <main className="p-6 sm:p-8 max-w-[1400px] w-full mx-auto flex-1 space-y-6 lg:space-y-8">
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance Regularizations</h1>
              <p className="text-sm text-slate-500 mt-1">Submit requests to fix missing punches or correct attendance anomalies.</p>
            </div>
          </div>

          <div className="w-full">
            <RegularizationCard requests={regularizations} fetchRegularizations={fetchRegularizations} />
          </div>

        </main>
    </>
  );
}

export default AttendanceRegularizationsPage;
