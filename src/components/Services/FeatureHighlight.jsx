import { CiCircleCheck } from "react-icons/ci";
import { featureHighlights } from "../../utils/constants";
import payrollMock from "../../assets/payroll-mock.png";
import analyticsMock from "../../assets/analytics-mock.png";
import integrationMock from "../../assets/integration-mock.png";

const images = {
  1: payrollMock,
  2: analyticsMock,
  3: integrationMock,
};

function FeatureHighlight() {
  return (
    <section className="m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24 py-16 sm:py-20 xl:py-28">
      {/* Section heading */}
      <div className="text-center mb-16 sm:mb-20">
        <h2 className="font-bold text-[2rem]/[2.5rem] text-primary-500 sm:text-4xl md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight mb-4">
          Built for{" "}
          <span className="underline underline-offset-4 decoration-[6px] decoration-purple-500">
            Performance
          </span>
        </h2>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto">
          Powerful features designed to help your team work smarter, not harder.
        </p>
      </div>

      <div className="space-y-24 sm:space-y-32">
        {featureHighlights.map((feature, index) => {
          const isReversed = index % 2 !== 0;

          return (
            <div
              key={feature.id}
              className={`flex flex-col ${
                isReversed ? "lg:flex-row-reverse" : "lg:flex-row"
              } items-center gap-12 lg:gap-16 xl:gap-20`}
            >
              {/* Visual / Illustration side */}
              <div className="w-full lg:w-1/2">
                <div className="relative rounded-3xl overflow-hidden bg-gradient-to-t from-purple-500 to-purple-200 p-[2px] shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="bg-primary-500 rounded-[1.35rem] overflow-hidden flex items-center justify-center">
                    <img
                      src={images[feature.id]}
                      alt={feature.title}
                      className="w-full h-auto object-cover block hover:scale-[1.02] transition-transform duration-500"
                    />
                  </div>
                </div>
              </div>

              {/* Text side */}
              <div className="w-full lg:w-1/2">
                {/* Label pill matching testimonial badge gradient */}
                <span className="inline-block bg-gradient-to-t from-purple-500 to-purple-200 text-primary-500 text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full mb-6">
                  {feature.label}
                </span>

                <h3 className="font-bold text-2xl sm:text-3xl md:text-4xl text-primary-800 tracking-tight mb-5">
                  {feature.title}
                </h3>

                <p className="text-gray-500 text-base sm:text-lg leading-relaxed mb-8">
                  {feature.description}
                </p>

                {/* Bullet list */}
                <ul className="space-y-4">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <CiCircleCheck className="w-6 h-6 text-purple-500 stroke-1 flex-shrink-0 mt-0.5" />
                      <span className="text-primary-400 font-medium text-sm sm:text-base">
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FeatureHighlight;
