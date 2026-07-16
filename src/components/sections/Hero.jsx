import { reviewImgs } from "../../utils/constants";
import AnimateOnScroll from "../UI/AnimateOnScroll";

function Hero() {
  return (
    <section className="pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 md:pb-28 max-w-[90rem] m-auto px-4 sm:px-8 md:px-16 xl:px-24 overflow-hidden">
      <div className="flex flex-nowrap justify-between items-center md:gap-x-24 lg:gap-x-14">
        <AnimateOnScroll animation="slide-up" className="max-w-[50rem]">
          <h1 className="mb-16 sm:mb-4 font-bold text-3xl text-primary-800 sm:text-4xl md:text-5xl/[3.5rem] lg:text-6xl/[4rem] xl:text-7xl/[5rem] tracking-tight">
            We Help Simplify and Automate your{" "}
            <span className="bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent">
              HR & Payroll
            </span>
          </h1>
          <div className="flex sm:flex-row flex-col items-start sm:items-center gap-4">
            <ul className="flex">
              {reviewImgs.map((headshot) => (
                <li className="-mr-4 last:-mr-0" key={headshot.id}>
                  <img
                    src={headshot.image}
                    alt={headshot.name}
                    className="border-4 border-white rounded-full h-10 sm:h-12"
                  />
                </li>
              ))}
            </ul>
            <p className="font-medium text-primary-800 sm:text-lg">
              <span className="font-bold text-purple-800">100+</span> Corporates trust us in 2025
            </p>
          </div>
        </AnimateOnScroll>
        <AnimateOnScroll animation="slide-up" delay={200}>
          <figure>
            <div className="lg:flex justify-center items-center hidden xl:mr-8 rounded-full w-52 h-52 outline outline-1 outline-primary-800 animate-float">
              <div className="flex flex-col justify-center items-center bg-primary-800 rounded-full w-44 h-44">
                <p className="font-bold text-5xl text-white">24x7</p>
                <p className="font-bold text-white text-xl">Support</p>
              </div>
            </div>
          </figure>
        </AnimateOnScroll>
      </div>
    </section>
  );
}

export default Hero;
