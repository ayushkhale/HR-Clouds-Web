import React from "react";
import ManagerQueuePage from "../components/ManagerQueuePage";

function ManagerRegularizationsPage() {
  return (
    <ManagerQueuePage
      type="regularization"
      title="Regularization Requests"
      description="Review attendance corrections requested by your reporting line. Approving recalculates the day."
    />
  );
}

export default ManagerRegularizationsPage;
