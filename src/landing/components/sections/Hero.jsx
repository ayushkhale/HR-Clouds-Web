import { reviewImgs } from "../../../shared/utils/constants";
import { Reveal, RevealText, useParallax, STAGGER } from "../../../shared/motion";

/* The headline splits in two so the gradient survives. RevealText masks the
   plain words one by one; the gradient phrase can't be split the same way —
   per-word spans would restart `bg-clip-text` on each word — so it reveals as
   a single masked unit, timed to land just after the last plain word. */
const LEAD = "We Help Simplify and Automate your";
const GRADIENT_DELAY = LEAD.split(" ").length * STAGGER.tight;

function Hero() {
  // The support badge drifts a little against the page as you scroll.
  const badgeParallax = useParallax(28);

  return (
    <section className="pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 md:pb-28 max-w-[90rem] m-auto px-4 sm:px-8 md:px-16 xl:px-24 overflow-hidden">
      <div className="flex flex-nowrap justify-between items-center md:gap-x-24 lg:gap-x-14">
        <div className="max-w-[50rem]">
          <h1 className="mb-16 sm:mb-4 font-bold text-3xl text-primary-800 sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4rem] xl:text-7xl/[5rem] tracking-tight">
            <RevealText as="span" text={LEAD} />{" "}
            <Reveal
              as="span"
              variant="riseSmall"
              delay={GRADIENT_DELAY}
              className="inline-block bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent"
            >
              HR &amp; Payroll
            </Reveal>
          </h1>

          <div className="flex sm:flex-row flex-col items-start sm:items-center gap-4">
            {/* Avatars deal themselves in, left to right. */}
            <ul className="flex">
              {reviewImgs.map((headshot, i) => (
                <Reveal
                  as="li"
                  key={headshot.id}
                  variant="scale"
                  index={i}
                  stagger={70}
                  delay={GRADIENT_DELAY + 120}
                  className="-mr-4 last:-mr-0"
                >
                  {/* Decorative trust signal — the names are stock, so announcing
                      them tells a screen-reader user nothing useful. */}
                  <img
                    src={headshot.image}
                    alt=""
                    className="border-4 border-white rounded-full h-10 sm:h-12"
                  />
                </Reveal>
              ))}
            </ul>
            <Reveal as="p" variant="riseSmall" delay={GRADIENT_DELAY + 260} className="font-medium text-primary-800 sm:text-lg">
              <span className="font-bold text-purple-800">100+</span> Corporates trust us in{" "}
              {new Date().getFullYear()}
            </Reveal>
          </div>
        </div>

        <Reveal variant="scale" delay={GRADIENT_DELAY + 80}>
          <figure
            ref={badgeParallax}
            style={{ transform: "translate3d(0, var(--parallax-y, 0px), 0)" }}
          >
            <div className="lg:flex justify-center items-center hidden xl:mr-8 rounded-full w-52 h-52 outline outline-1 outline-primary-800 animate-float motion-reduce:animate-none">
              <div className="flex flex-col justify-center items-center bg-primary-800 rounded-full w-44 h-44">
                <p className="font-bold text-5xl text-white">24/7</p>
                <p className="font-bold text-white text-xl">Support</p>
              </div>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

export default Hero;
