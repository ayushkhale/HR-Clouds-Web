import { reviewImgs } from "../../../shared/utils/constants";
import { Reveal, RevealText, useParallax, STAGGER } from "../../../shared/motion";
import StoreBadge from "../StoreBadge";
import PhoneFrame from "../PhoneFrame";
import { HERO_PHONE_IMAGE, HERO_PHONE_SIZE } from "../../appMeta";

/* ─────────────────────────────────────────────────────────────────────────────
   Hero — the homepage leads with the app, not with the feature list.

   One CTA only: the Google Play badge. A second button beside it split the
   attention the app launch is meant to carry, and the web product already has
   Sign In and Get Started in the nav two inches above. The body copy is what
   says there is a web workspace too.

   Padding is deliberately tight. The handset is ~19rem tall and sets the
   section's height on its own; the generous top padding the old text-only
   hero needed left a dead band above the headline once the phone arrived.

   The headline splits in two so the gradient survives. RevealText masks the
   plain words one by one; the gradient phrase can't be split the same way —
   per-word spans would restart `bg-clip-text` on each word — so it reveals as
   a single masked unit, timed to land just after the last plain word.
   ───────────────────────────────────────────────────────────────────────────── */
const LEAD = "We Help Simplify and Automate your";
const GRADIENT_DELAY = LEAD.split(" ").length * STAGGER.tight;

function Hero() {
  // The handset drifts a little against the page as you scroll. The parallax
  // transform goes on a wrapper — PhoneFrame runs its own float transform.
  const phoneParallax = useParallax(28);

  return (
    <section className="pt-14 sm:pt-16 md:pt-20 pb-10 sm:pb-14 md:pb-16 max-w-[90rem] m-auto px-4 sm:px-8 md:px-16 xl:px-24 overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] items-center gap-y-10 lg:gap-x-12 xl:gap-x-20">
        <div className="max-w-[48rem]">
          <h1 className="mb-5 font-bold text-3xl text-primary-800 sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4rem] xl:text-[4.25rem]/[4.75rem] tracking-tight">
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

          <Reveal
            as="p"
            variant="riseSmall"
            delay={GRADIENT_DELAY + 80}
            className="max-w-lg text-sm sm:text-base text-primary-300"
          >
            Clock in, check a payslip or apply for leave from the app — and run payroll,
            documents and reporting on the web. One account, both places.
          </Reveal>

          {/* The badge and the trust line share one row: the proof sits where
              the eye already is after reading the CTA, and the hero loses a
              whole stacked block of height. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Reveal variant="riseSmall" delay={GRADIENT_DELAY + 160}>
              <StoreBadge />
            </Reveal>

            <div className="flex items-center gap-3">
              {/* Avatars deal themselves in, left to right. */}
              <ul className="flex">
                {reviewImgs.map((headshot, i) => (
                  <Reveal
                    as="li"
                    key={headshot.id}
                    variant="scale"
                    index={i}
                    stagger={70}
                    delay={GRADIENT_DELAY + 240}
                    className="-mr-3 last:-mr-0"
                  >
                    {/* Decorative trust signal — the names are stock, so announcing
                        them tells a screen-reader user nothing useful. */}
                    <img
                      src={headshot.image}
                      alt=""
                      className="border-[3px] border-white rounded-full h-9"
                    />
                  </Reveal>
                ))}
              </ul>
              <Reveal
                as="p"
                variant="riseSmall"
                delay={GRADIENT_DELAY + 320}
                className="text-sm font-medium text-primary-800"
              >
                <span className="font-bold text-purple-800">100+</span> Corporates trust us in{" "}
                {new Date().getFullYear()}
              </Reveal>
            </div>
          </div>
        </div>

        {/* The phone replaces the old 24/7 badge. It survives down to mobile —
            on a phone-first page, hiding the phone would be the odd choice.

            The supplied shot is a whole composition (handset + screen + the
            callout labels), so it renders plain and floats on its own. Only
            when there is no file does PhoneFrame draw its stand-in. */}
        {/* Source order keeps the headline first — it is the <h1>, and a
            screen reader or a crawler should meet it before the picture. On a
            narrow screen the grid reorders visually instead: the phone leads,
            because that is what the page is announcing. `order-none` at lg
            hands the row back to source order, text left, phone right. */}
        <Reveal
          variant="scale"
          delay={GRADIENT_DELAY + 100}
          className="order-first lg:order-none justify-self-center"
        >
          <div
            ref={phoneParallax}
            style={{ transform: "translate3d(0, var(--parallax-y, 0px), 0)" }}
          >
            {HERO_PHONE_IMAGE ? (
              <img
                src={HERO_PHONE_IMAGE}
                alt="The HR Clouds app on a phone"
                width={HERO_PHONE_SIZE.width}
                height={HERO_PHONE_SIZE.height}
                className="w-[16rem] sm:w-[19rem] lg:w-[21rem] xl:w-[24rem] h-auto animate-float motion-reduce:animate-none"
              />
            ) : (
              <PhoneFrame />
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default Hero;
