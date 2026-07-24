import React from "react";
import Abouthero from "../components/About/Abouthero";
import AboutMission from "../components/About/AboutMission";
import OurVision from "../components/About/OurVision";
import OurTeam from "../components/About/OurTeam";

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
