import { servicesStats } from "../../utils/constants";

function ServicesStatsBanner() {
  return (
    <section className="relative bg-primary-500 overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute top-[-30%] right-[10%] w-[300px] h-[300px] bg-purple-600/15 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-20%] left-[20%] w-[250px] h-[250px] bg-indigo-600/10 rounded-full blur-[80px]" />

      <div className="relative z-10 m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24 py-16 sm:py-20 md:py-24">
        <div className="text-center mb-12">
          <h2 className="font-bold text-3xl sm:text-4xl md:text-5xl tracking-tight">
            <span className="bg-clip-text bg-gradient-to-t from-purple-500 to-purple-200 text-transparent">
              Trusted
            </span>{" "}
            <span className="text-white">by growing businesses</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
          {servicesStats.map((stat) => (
            <div key={stat.id} className="text-center">
              <p className="font-bold text-4xl sm:text-5xl md:text-6xl xl:text-7xl bg-clip-text bg-gradient-to-t from-purple-500 to-purple-200 text-transparent tracking-tight mb-2">
                {stat.value}
              </p>
              <p className="text-white font-semibold text-lg sm:text-xl mb-1">
                {stat.label}
              </p>
              <p className="text-white/50 text-sm">
                {stat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ServicesStatsBanner;
