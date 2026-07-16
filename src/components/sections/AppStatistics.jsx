import { RxCaretRight } from "react-icons/rx";
import { Link } from "react-router-dom";
import { appStats, appStatsImgs } from "../../utils/constants";

function AppStatistics() {
  return (
    <section className="bg-primary-500 -mt-[1px]">
      <div className="flex flex-col gap-y-12 sm:gap-y-16 md:gap-y-24 xl:gap-y-28 m-auto px-4 sm:px-8 md:px-16 xl:px-24 pt-10 md:pt-16 pb-16 sm:pb-24 md:pb-32 max-w-[90rem]">
        <div>
          <h2 className="bg-clip-text bg-gradient-to-t from-purple-500 to-purple-200 sm:font-bold text-3xl text-transparent sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4.6rem] xl:text-7xl/[5.6rem] tracking-tight">
            Transform your HR
          </h2>
          <h2 className="sm:font-bold text-3xl text-white sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4rem] xl:text-7xl/[5rem] tracking-tight">
            with powerful insights & automation.
          </h2>
        </div>

        {/* Stats and CTA */}
        <div className="flex sm:flex-row flex-col justify-between items-center sm:items-end gap-y-16">
          <ul className="flex sm:flex-row flex-col gap-8 lg:gap-16 xl:gap-24">
            {appStats.map((stat) => (
              <li key={stat.id}>
                <p className="font-bold text-[2.5rem]/[3rem] text-purple-500 text-center sm:text-left md:text-5xl lg:text-6xl xl:text-7xl/[5rem] tracking-tight">
                  {stat.value}
                </p>
                <p className="md:mt-2 font-normal text-center text-lg text-white sm:text-left md:text-xl lg:text-2xl xl:text-[2rem]/[2.5rem]">
                  {stat.description}
                </p>
              </li>
            ))}
          </ul>

          <div className="flex items-center sm:items-end gap-4 md:gap-6">
            <p className="text-lg text-white md:text-xl lg:text-2xl xl:text-[2rem]/[2.5rem]">
              Explore <br className="sm:block hidden" /> More
            </p>
            <Link
              to="/services"
              aria-label="Explore HR tools"
              className="group flex justify-center items-center bg-gradient-to-t from-purple-500 to-purple-200 mb-1 rounded-full w-8 sm:w-12 lg:w-16 h-8 sm:h-12 lg:h-16 transition-all duration-200 shadow-md hover:scale-105"
            >
              <RxCaretRight className="group-hover:text-white w-12 h-12 text-primary-500 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AppStatistics;
