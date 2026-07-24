import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./components/sections/Header";
import Navigation from "./components/sections/Navigation/Navigation";
import Footer from "./components/sections/Footer";

function LandingLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 overflow-x-hidden font-sans">
      {/* Sticky Header with Public Navigation */}
      <Header>
        <Navigation />
      </Header>

      {/* Main Content Area where Landing Pages render */}
      <main className="flex-grow pt-24">
        <Outlet />
      </main>

      {/* Public Footer */}
      <Footer />
    </div>
  );
}

export default LandingLayout;
