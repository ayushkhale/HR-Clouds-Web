import { servicesStats } from "../../utils/constants";
import AnimateOnScroll from "../UI/AnimateOnScroll";

function ServicesHeroBanner() {
  const layerImage = "https://cdn3d.iconscout.com/3d/premium/thumb/layer-3d-illustration-download-in-png-blend-fbx-gltf-file-formats--design-work-graphic-decoration-web-development-pack-business-illustrations-4496045.png";

  return (
    <section className="pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 md:pb-28 overflow-hidden">
      <div className="m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
          
          {/* Left 3D Illustration Column */}
          <div className="w-full lg:w-2/5 flex justify-center lg:justify-start relative">
            <AnimateOnScroll animation="slide-up" className="relative w-full max-w-[20rem] sm:max-w-[24rem]">
              {/* Glowing background gradient blur under the image */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full blur-[60px] opacity-25 animate-pulse" />
              
              <img
                src={layerImage}
                alt="3D Layer Illustration"
                className="relative z-10 w-full h-auto object-contain hover:scale-105 transition-transform duration-500 animate-float"
              />
            </AnimateOnScroll>
          </div>

          {/* Right Content Column */}
          <div className="w-full lg:w-3/5 text-left">
            <AnimateOnScroll animation="slide-up" delay={150}>
              <h1 className="mb-6 font-bold text-3xl text-primary-800 sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4rem] xl:text-7xl/[5rem] tracking-tight">
                Everything You Need to{" "}
                <span className="bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent">
                  Run & Scale
                </span>{" "}
                Your Business
              </h1>
              <p className="text-primary-200 text-lg sm:text-xl max-w-2xl leading-relaxed mb-12">
                From HRMS to CRM, ERP to Accounting — streamline every department
                with our integrated cloud platform built for growing organizations.
              </p>

              {/* Stats row */}
              <div className="flex flex-wrap gap-8 sm:gap-12 md:gap-16">
                {servicesStats.map((stat) => (
                  <div key={stat.id}>
                    <p className="font-bold text-[2.5rem]/[3rem] text-purple-800 md:text-5xl tracking-tight">
                      {stat.value}
                    </p>
                    <p className="font-medium text-primary-800 text-lg">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </AnimateOnScroll>
          </div>

        </div>
      </div>
    </section>
  );
}

export default ServicesHeroBanner;
