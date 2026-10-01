import aboutillsu3d from "../../../assets/testimonials/aboutillsu3d.png";
import { Reveal, RevealText, useParallax } from "../../../shared/motion";

const PILLARS = [
  { title: "Human-Centric", body: "Designed to put employee experience and productivity at the center." },
  { title: "100% Compliant", body: "Automatic statutory updates across PF, ESI, TDS, and state labor laws." },
  { title: "Scale Instantly", body: "From 10 employees to 10,000 without performance degradation." },
];

const Abouthero = () => {
  const artParallax = useParallax(32);

  return (
    <section className="relative m-auto pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 md:pb-28 max-w-[90rem] overflow-hidden">
      {/* Soft purple glow behind text */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[45rem] h-[25rem] bg-purple-300 opacity-10 rounded-full blur-[140px] z-0 pointer-events-none" />

      <div className="relative z-10 px-4 sm:px-8 md:px-16 xl:px-24 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8 w-full">
        
        {/* Left Content Side */}
        <div className="w-full lg:w-3/5 text-left">
          <div>
            <h1 className="font-bold text-4xl text-primary-800 sm:text-5xl lg:text-6xl/[4.5rem] xl:text-7xl/[5.5rem] tracking-tight mb-6">
              <RevealText as="span" text="Why Us? What Makes Us" delay={100} />{" "}
              <Reveal
                as="span"
                variant="riseSmall"
                delay={340}
                className="inline-block bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent"
              >
                Stand Out
              </Reveal>
            </h1>
            <Reveal as="p" delay={300} className="text-gray-500 max-w-2xl text-lg sm:text-xl leading-relaxed mb-12">
              We build software that scales with your ambition. By removing manual
              administrative tasks, HR Clouds frees up your team to focus on talent
              development, culture cultivation, and data-driven organizational growth.
            </Reveal>

            {/* Three core pillars as cards below text */}
            <div className="grid gap-4 sm:grid-cols-3 max-w-2xl lg:max-w-full">
              {PILLARS.map((pillar, i) => (
                <Reveal
                  key={pillar.title}
                  variant="rise"
                  index={i}
                  delay={380}
                  className="bg-purple-50/60 p-5 rounded-2xl border border-purple-100/60 transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-purple-300 hover:shadow-md motion-reduce:transform-none"
                >
                  <h4 className="font-bold text-primary-800 text-base mb-1">{pillar.title}</h4>
                  <p className="text-gray-500 text-sm leading-relaxed">{pillar.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* Right 3D Illustration Graphic Side */}
        <div className="w-full lg:w-2/5 flex justify-center items-center">
          <Reveal priority variant="scale" delay={200} duration={900}>
            <div
              ref={artParallax}
              style={{ transform: "translate3d(0, var(--parallax-y, 0px), 0)" }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-purple-400 opacity-20 blur-3xl rounded-full group-hover:opacity-30 transition-opacity duration-500" />
              <img
                src={aboutillsu3d}
                alt="HR Clouds 3D Work Illustration"
                className="relative z-10 w-full max-w-[28rem] h-auto object-contain hover:scale-105 transition-transform duration-500 drop-shadow-2xl outline-none focus:outline-none ring-0 transform-gpu motion-reduce:transform-none"
              />
            </div>
          </Reveal>
        </div>

      </div>
    </section>
  );
};

export default Abouthero;
