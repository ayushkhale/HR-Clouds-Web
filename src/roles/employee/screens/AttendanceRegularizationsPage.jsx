import React, { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import RegularizationCard from "../components/RegularizationCard";
import { attendanceAPI } from "../../../shared/api";
import { usePagedList } from "../../../shared/attendance/usePagedList";

function AttendanceRegularizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState("all");
  const initialDate = searchParams.get("date") || "";

  // The backend validates `status` but never applies it (contract §4.4 / §8.4),
  // so the list is fetched unfiltered and the status tabs filter the loaded page.
  const list = usePagedList(
    ({ page, limit }) => attendanceAPI.getMyRegularizations({ page, limit }),
    { limit: 20, keys: ["requests"] }
  );

  // Remove ?date= once the form has opened so a refresh doesn't reopen it.
  const consumePrefill = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("date");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return (
    <>
      <DashboardTopBar title="Attendance Regularizations" />
      <main className="p-4 sm:p-8 max-w-[1400px] w-full mx-auto flex-1 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Regularizations</h1>
          <p className="text-sm text-slate-500 mt-1">Request corrections for missed or wrong punches and track their approval.</p>
        </div>
        <RegularizationCard list={list} statusFilter={status} onStatusChange={setStatus} initialDate={initialDate} onPrefillConsumed={consumePrefill} />
      </main>
    </>
  );
}

export default AttendanceRegularizationsPage;
