import React from "react";

const OurVision = () => {
  return (
    <section className="m-auto py-16 sm:py-20 xl:py-28 max-w-[90rem]">
      {/* Section Heading */}
      <div className="px-4 sm:px-8 md:px-16 xl:px-24 mb-12 sm:mb-16">
        <h2 className="font-bold text-[2rem]/[2.5rem] text-primary-500 sm:text-4xl md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight">
          Why{" "}
          <span className="underline underline-offset-4 decoration-[6px] decoration-purple-500">
            Choose
          </span>{" "}
          Us?
        </h2>
      </div>

      {/* Grid of Dark Glassmorphic Cards */}
      <div className="px-4 sm:px-8 md:px-16 xl:px-24 grid gap-8 sm:grid-cols-2">
        
        {/* Card 1 — Commitment to Quality */}
        <div className="bg-primary-500 px-8 py-10 rounded-2xl relative overflow-hidden flex flex-col justify-start border border-white/5 shadow-xl">
          {/* Overlapping white transparent highlights matching pricing cards exactly */}
          <div className="left-[-20%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
          <div className="top-[30%] left-[30%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
          
          <div className="relative z-10">
            <h3 className="text-white font-bold text-xl sm:text-2xl mb-4 tracking-tight">
              Commitment to Quality
            </h3>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed text-justify mb-4">
              Quality isn’t just a checkbox for us — it’s a culture that permeates
              every aspect of our work. From our design philosophy to backend
              architecture, we follow industry best practices, code reviews, and
              rigorous testing pipelines to ensure what we deliver stands the test
              of time. Our team believes in doing things once, and doing them right.
            </p>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed text-justify">
              Whether it's performance optimization, accessibility, or scalable
              architecture, we go the extra mile to exceed expectations. Every
              pixel, every API response, every interaction is crafted with precision,
              passion, and purpose.
            </p>
          </div>
        </div>

        {/* Card 2 — Scalability & Security */}
        <div className="bg-primary-500 px-8 py-10 rounded-2xl relative overflow-hidden flex flex-col justify-start border border-white/5 shadow-xl">
          {/* Overlapping white transparent highlights matching pricing cards exactly */}
          <div className="left-[-20%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
          <div className="top-[30%] left-[30%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
          
          <div className="relative z-10">
            <h3 className="text-white font-bold text-xl sm:text-2xl mb-4 tracking-tight">
              Scalability & Security First
            </h3>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed text-justify mb-4">
              We design software built to handle rapid growth. Our enterprise cloud
              architecture utilizes multi-tenant encryption, role-based access control,
              and strict data residency compliance (GDPR, ISO-aligned).
            </p>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed text-justify">
              With 99.99% uptime SLAs, daily automated backups, and 24/7 proactive monitoring,
              your organization’s most critical asset — its people data — is completely protected.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
};

export default OurVision;
