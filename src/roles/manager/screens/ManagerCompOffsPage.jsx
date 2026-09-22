import React from "react";
import ManagerQueuePage from "../components/ManagerQueuePage";
import { DICTIONARY } from "../../../shared/config/dictionary";

function ManagerCompOffsPage() {
  return (
    <ManagerQueuePage
      type="compoff"
      title={DICTIONARY.TERMS.COMP_OFF}
      description="Earned leave days from team members who worked on holidays or weekly offs. Approving credits their leave balance."
    />
  );
}

export default ManagerCompOffsPage;
