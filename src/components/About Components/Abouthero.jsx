import React from "react";
import aboutillsu3d from "../../assets/testimonials/aboutillsu3d.png";
import AnimateOnScroll from "../UI/AnimateOnScroll";

const Abouthero = () => {
  return (
    <section className="relative m-auto pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 md:pb-28 max-w-[90rem] overflow-hidden">
      {/* Soft purple glow behind text */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[45rem] h-[25rem] bg-purple-300 opacity-10 rounded-full blur-[140px] z-0 pointer-events-none" />

      <div className="relative z-10 px-4 sm:px-8 md:px-16 xl:px-24 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8 w-full">
        
        {/* Left Content Side */}
        <div className="w-full lg:w-3/5 text-left">
          <AnimateOnScroll animation="slide-up">
            <h1 className="font-bold text-4xl text-primary-800 sm:text-5xl lg:text-6xl/[4.5rem] xl:text-7xl/[5.5rem] tracking-tight mb-6">
              Why Us? What Makes Us{" "}
              <span className="bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent">
                Stand Out
              </span>
            </h1>
            <p className="text-gray-500 max-w-2xl text-lg sm:text-xl leading-relaxed mb-12">
              We build software that scales with your ambition. By removing manual
              administrative tasks, HR Clouds frees up your team to focus on talent
              development, culture cultivation, and data-driven organizational growth.
            </p>

            {/* Three core pillars as cards below text */}
            <div className="grid gap-4 sm:grid-cols-3 max-w-2xl lg:max-w-full">
              <div className="bg-purple-50/60 p-5 rounded-2xl border border-purple-100/60">
                <h3 className="font-bold text-primary-800 text-base mb-1.5">People First</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Designed to put employee experience and productivity at the center.</p>
              </div>
              <div className="bg-purple-50/60 p-5 rounded-2xl border border-purple-100/60">
                <h3 className="font-bold text-primary-800 text-base mb-1.5">Automated Flows</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Say goodbye to spreadsheets with self-running workflows.</p>
              </div>
              <div className="bg-purple-50/60 p-5 rounded-2xl border border-purple-100/60">
                <h3 className="font-bold text-primary-800 text-base mb-1.5">Smart Insights</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Real-time dashboards and analytics to guide organizational decisions.</p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>

        {/* Right 3D Illustration Column */}
        <div className="w-full lg:w-2/5 flex justify-center lg:justify-end relative">
          <AnimateOnScroll animation="slide-up" delay={200} className="relative w-full max-w-[20rem] sm:max-w-[24rem]">
            {/* Glowing background gradient blur under the image */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full blur-[60px] opacity-25 animate-pulse" />
            
            <img
              src={aboutillsu3d}
              alt="3D About Torus Illustration"
              className="relative z-10 w-full h-auto object-contain hover:scale-105 transition-transform duration-500 animate-float"
            />
          </AnimateOnScroll>
        </div>

      </div>
    </section>
  );
};

export default Abouthero;
