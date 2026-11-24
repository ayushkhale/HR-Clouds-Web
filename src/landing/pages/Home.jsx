import React from 'react';
import Hero from "../components/sections/Hero";
import PlatformSplit from "../components/sections/PlatformSplit";
import Dashboard from "../components/sections/Dashboard";
import AppStatistics from "../components/sections/AppStatistics";
import Testimonials from "../components/sections/Testimonials/Testimonials";

/* The homepage leads with the app and lands on the web workspace, in that
   order: phone in the hero → what each surface is for → the desktop product →
   proof → voices.

   Order trap: Dashboard must stay directly above AppStatistics. The two share
   the same dark colour and meet with no seam; anything slipped between them
   leaves a band of primary-500 floating on the page. */
const Home = () => {
  return (
    <>
      <Hero />
      <PlatformSplit />
      <Dashboard />
      <AppStatistics />
      <Testimonials />
    </>
  );
};

export default Home;
