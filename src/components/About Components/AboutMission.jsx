import React from "react";

const AboutMission = () => {
  const targetImage = "https://static.vecteezy.com/system/resources/previews/015/214/616/original/target-3d-illustration-icon-png.png";
  const pieChartImage = "https://cdn3d.iconscout.com/3d/premium/thumb/pie-chart-graph-3d-illustration-download-in-png-blend-fbx-gltf-file-formats--analytics-logo-pack-business-illustrations-4100763.png";

  return (
    <section className="bg-primary-500 py-16 sm:py-20 xl:py-28 relative overflow-hidden">
      {/* Decorative background glows matching homepage dark styling */}
      <div className="absolute top-[-10%] right-[-5%] w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-5%] w-[450px] h-[450px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 m-auto px-4 sm:px-8 md:px-16 xl:px-24 max-w-[90rem] flex flex-col gap-y-24 sm:gap-y-32">
        
        {/* Section Heading */}
        <div className="max-w-[50rem]">
          <h2 className="bg-clip-text bg-gradient-to-t from-purple-500 to-purple-200 font-bold text-3xl text-transparent sm:text-4xl md:text-5xl lg:text-6xl tracking-tight mb-4">
            Driven by Purpose
          </h2>
          <h3 className="font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-white tracking-tight leading-tight">
            Empowering businesses through smart HR tech.
          </h3>
        </div>

        {/* Our Mission - Text Left, Image Right (No border wrap) */}
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 xl:gap-24">
          <div className="w-full lg:w-3/5">
            <span className="inline-block bg-gradient-to-t from-purple-500 to-purple-200 text-primary-500 text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-6">
              Our Vision
            </span>
            <h4 className="text-white text-2xl sm:text-3xl font-bold mb-5 tracking-tight">
              Our Mission
            </h4>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed text-justify">
              Our mission is to revolutionize human resource management by providing a seamless blend of technology and empathy.
              We believe HR should be proactive, not reactive — helping businesses unlock their true potential by focusing on people-first solutions.
              From smart automation of tedious workflows to insightful analytics that drive decision-making, our platform is designed to empower every team, from startups to enterprises.
            </p>
          </div>
          <div className="w-full lg:w-2/5 flex justify-center">
            <div className="max-w-[16rem] w-full">
              <img
                src={targetImage}
                alt="3D Target Bullseye"
                className="w-full h-auto object-contain block hover:scale-105 transition-transform duration-300"
              />
            </div>
          </div>
        </div>

        {/* Company Background - Text Right, Image Left (No border wrap) */}
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-16 xl:gap-24">
          <div className="w-full lg:w-3/5">
            <span className="inline-block bg-gradient-to-t from-purple-500 to-purple-200 text-primary-500 text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-6">
              Our Journey
            </span>
            <h4 className="text-white text-2xl sm:text-3xl font-bold mb-5 tracking-tight">
              Company Background
            </h4>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed text-justify">
              Founded in 2022, our journey started with a simple idea: to bring clarity and control to HR operations through beautifully crafted software.
              Our team combines years of experience in software engineering, human resource consulting, and product design.
              Today, we serve companies across industries, equipping them with tools that adapt, scale, and evolve with their people.
            </p>
          </div>
          <div className="w-full lg:w-2/5 flex justify-center">
            <div className="max-w-[16rem] w-full">
              <img
                src={pieChartImage}
                alt="3D Pie Chart Analytics Graph"
                className="w-full h-auto object-contain block hover:scale-105 transition-transform duration-300"
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};

export default AboutMission;
