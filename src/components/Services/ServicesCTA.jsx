import { Link } from "react-router-dom";

function ServicesCTA() {
  return (
    <section className="m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24 py-16 sm:py-20 xl:py-28">
      <div className="relative bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 rounded-3xl overflow-hidden px-6 sm:px-12 md:px-16 py-16 sm:py-20 md:py-24">
        {/* Decorative circles */}
        <div className="absolute top-[-20%] right-[-5%] w-64 h-64 bg-white/10 rounded-full blur-xl" />
        <div className="absolute bottom-[-15%] left-[-3%] w-48 h-48 bg-white/5 rounded-full blur-lg" />
        <div className="absolute top-[20%] left-[40%] w-32 h-32 bg-white/5 rounded-full blur-md" />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <h2 className="font-bold text-white text-3xl sm:text-4xl md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight mb-6">
            Ready to transform your business?
          </h2>

          <p className="text-white/80 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Join 100+ companies that trust HR Clouds to simplify their
            operations. Get started in minutes, not months.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              className="px-8 py-3.5 bg-gradient-to-t from-purple-500 to-purple-200 text-primary-800 font-bold rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:drop-shadow-[0_0px_25px_rgba(255,184,76,0.3)] hover:text-white hover:-translate-y-0.5 transition-all duration-200 text-base cursor-pointer"
            >
              Get Started Free
            </button>
            <a
              href="mailto:hello@hrclouds.in"
              className="px-8 py-3.5 bg-transparent text-white font-semibold rounded-full border-2 border-white/40 hover:border-white/80 hover:bg-white/10 transition-all duration-200 text-base"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ServicesCTA;
