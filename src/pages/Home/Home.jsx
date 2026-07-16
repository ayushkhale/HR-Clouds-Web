import React from 'react';
import Hero from "../../components/sections/Hero";
import Dashboard from "../../components/sections/Dashboard";
import AppStatistics from "../../components/sections/AppStatistics";
import Testimonials from "../../components/sections/Testimonials/Testimonials";

const Home = () => {
  return (
    <>
      <Hero />
      <Dashboard />
      <AppStatistics />
      <Testimonials />
    </>
  );
};

export default Home;
