import React from "react";
import ManagerQueuePage from "../components/ManagerQueuePage";

function ManagerAnomaliesPage() {
  return (
    <ManagerQueuePage
      type="anomaly"
      topBarTitle="Team Attendance Flags"
      title="Attendance Flags"
      description="Punches the system flagged for your team — e.g. outside the office geofence or breaks over the policy limit. Resolve them with a note."
    />
  );
}

export default ManagerAnomaliesPage;
