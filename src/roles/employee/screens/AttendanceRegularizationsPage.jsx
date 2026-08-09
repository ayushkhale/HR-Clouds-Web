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
          
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                REGULARIZATIONS
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-4">
                Regularizations
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/80 font-normal pt-2">
                Submit requests to fix missing punches or correct attendance anomalies.
              </p>
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
