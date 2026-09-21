import React from "react";
import ManagerQueuePage from "../components/ManagerQueuePage";

function ManagerOvertimePage() {
  return (
    <ManagerQueuePage
      type="overtime"
      title="Overtime"
      description="Review overtime recorded for your team. Approved overtime flows into payroll."
    />
  );
}

export default ManagerOvertimePage;
