import Testimonial from "./Testimonial";
import { testimonials } from "../../../utils/constants";

function Testimonials() {
  return (
    <section className="m-auto py-12 sm:py-16 xl:py-24 max-w-[90rem]">
      <h2 className="px-4 sm:px-8 md:px-16 xl:px-24 pb-12 sm:pb-14 md:pb-16 font-bold text-[2rem]/[2.5rem] text-primary-500 sm:text-4xl md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight">
        Listen to what our{" "}
        <span className="underline underline-offset-2 decoration-8 decoration-purple-500">
          satisfied
        </span>{" "}
        <br className="sm:block hidden" />
        clients have to say
      </h2>

      <div className="relative">
        <div className="top-0 left-0 z-10 absolute bg-gradient-to-r from-white to-transparent sm:w-32 xl:w-64 h-full" />
        <div className="top-0 right-0 z-10 absolute bg-gradient-to-l from-white to-transparent sm:w-32 xl:w-64 h-full" />

        {/* TESTIMONIAL ROW 1 */}
        <div className="bg-white mb-4 lg:mb-6 whitespace-nowrap overflow-hidden">
          <div className="inline-block whitespace-nowrap animate-translate-x-reverse">
            {testimonials.slice(0, 4).map((testimonial) => (
              <Testimonial testimonial={testimonial} key={testimonial.name} />
            ))}
          </div>
          <div className="inline-block whitespace-nowrap animate-translate-x-reverse">
            {testimonials.slice(0, 4).map((testimonial) => (
              <Testimonial testimonial={testimonial} key={testimonial.name} />
            ))}
          </div>
        </div>
        
      </div>
    </section>
  );
}

export default Testimonials;
