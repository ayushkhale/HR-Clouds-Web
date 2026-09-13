import React from "react";
import ManagerQueuePage from "../components/ManagerQueuePage";
import { DICTIONARY } from "../../../shared/config/dictionary";

function ManagerCompOffsPage() {
  return (
    <ManagerQueuePage
      type="compoff"
      title={`${DICTIONARY.TERMS.COMP_OFF} Requests`}
      description="Compensatory days earned by team members who worked on holidays or weekly offs. Approving credits their leave balance."
    />
  );
}

export default ManagerCompOffsPage;
