import { RxCaretRight } from "react-icons/rx";
import { Link } from "react-router-dom";
import { appStats } from "../../../shared/utils/constants";
import { Reveal, useCountUp, HOVER } from "../../../shared/motion";

/* One stat, with its number ticking up the first time it's seen. The value is
   an authored string ("400+", "95%"), so useCountUp replays the leading number
   and keeps the suffix. */
function Stat({ stat, index }) {
  // The authored value is what renders; the hook only overwrites it while the
  // count runs, so the real figure is in the markup from first paint.
  const countRef = useCountUp(stat.value);

  return (
    <Reveal as="li" variant="rise" index={index} delay={120}>
      <p
        ref={countRef}
        // tabular-nums keeps every digit the same width, so the column doesn't
        // jitter as the number climbs.
        className="font-bold text-[2.5rem]/[3rem] text-purple-500 text-center sm:text-left md:text-5xl lg:text-6xl xl:text-7xl/[5rem] tracking-tight tabular-nums"
      >
        {stat.value}
      </p>
      <p className="md:mt-2 font-normal text-center text-lg text-white sm:text-left md:text-xl lg:text-2xl xl:text-[2rem]/[2.5rem]">
        {stat.description}
      </p>
    </Reveal>
  );
}

function AppStatistics() {
  return (
    <section className="bg-primary-500 -mt-[1px]">
      <div className="flex flex-col gap-y-12 sm:gap-y-16 md:gap-y-24 xl:gap-y-28 m-auto px-4 sm:px-8 md:px-16 xl:px-24 pt-10 md:pt-16 pb-16 sm:pb-24 md:pb-32 max-w-[90rem]">
        {/* Line-level reveal: the two halves of the headline arrive in reading
            order. Word-splitting is off the table here — the first line is a
            clipped gradient and would restart the ramp on every word. */}
        <div>
          <Reveal
            as="h2"
            className="bg-clip-text bg-gradient-to-t from-purple-500 to-purple-200 sm:font-bold text-3xl text-transparent sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4.6rem] xl:text-7xl/[5.6rem] tracking-tight"
          >
            Transform your HR
          </Reveal>
          <Reveal
            as="h2"
            delay={110}
            className="sm:font-bold text-3xl text-white sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4rem] xl:text-7xl/[5rem] tracking-tight"
          >
            with powerful insights &amp; automation.
          </Reveal>
        </div>

        {/* Stats and CTA */}
        <div className="flex sm:flex-row flex-col justify-between items-center sm:items-end gap-y-16">
          <ul className="flex sm:flex-row flex-col gap-8 lg:gap-16 xl:gap-24">
            {appStats.map((stat, i) => (
              <Stat key={stat.id} stat={stat} index={i} />
            ))}
          </ul>

          <Reveal variant="left" delay={200} className="flex items-center sm:items-end gap-4 md:gap-6">
            <p className="text-lg text-white md:text-xl lg:text-2xl xl:text-[2rem]/[2.5rem]">
              Explore <br className="sm:block hidden" /> More
            </p>
            <Link
              to="/services"
              aria-label="Explore HR tools"
              className={`group flex justify-center items-center bg-gradient-to-t from-purple-500 to-purple-200 mb-1 rounded-full w-8 sm:w-12 lg:w-16 h-8 sm:h-12 lg:h-16 shadow-md hover:shadow-lg ${HOVER.lift}`}
            >
              {/* The caret nudges in the direction it points on hover. */}
              <RxCaretRight className="group-hover:text-white w-12 h-12 text-primary-500 transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default AppStatistics;
