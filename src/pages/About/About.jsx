import React from "react";
import Abouthero from "../../components/About Components/Abouthero";
import AboutMission from "../../components/About Components/AboutMission";
import OurVision from "../../components/About Components/OurVision";
import OurTeam from "../../components/About Components/OurTeam";

const About = () => {
  return (
    <div className="overflow-x-hidden">
      <Abouthero />
      <AboutMission />
      <OurVision />
      <OurTeam />
    </div>
  );
};

export default About;
