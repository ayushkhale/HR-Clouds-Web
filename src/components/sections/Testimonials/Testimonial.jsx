import { TfiQuoteLeft } from "react-icons/tfi";

function Testimonial({ testimonial }) {
  return (
    <figure className="inline-block bg-white-shade mx-2 lg:mx-4 px-6 lg:px-8 py-6 lg:py-8 rounded-xl w-96">
      <blockquote className="text-wrap">
        <div className="flex justify-between items-start mb-2">
          <TfiQuoteLeft className="w-12 lg:w-14 h-12 lg:h-14 text-primary-500 overflow-visible stroke-[.02rem]" />
          <p className="bg-gradient-to-t from-purple-500 to-purple-200 px-3 py-1 rounded-md font-medium text-primary-500 text-sm tracking-tight">
            {testimonial.program}
          </p>
        </div>

        <p className="mb-6 lg:mb-8 font-medium text-primary-500 tracking-tight">
          {testimonial.description}
        </p>

        <div className="flex items-center gap-x-4">
          <img
            src={testimonial.image}
            alt={testimonial.name}
            className="rounded-full w-14 lg:w-16 h-14 lg:h-16"
          />
          <div>
            <cite className="font-semibold not-italic tracking-tight">
              {testimonial.name}
            </cite>
            <p className="text-primary-50 text-sm">{testimonial.title}</p>
          </div>
        </div>
      </blockquote>
    </figure>
  );
}

export default Testimonial;
