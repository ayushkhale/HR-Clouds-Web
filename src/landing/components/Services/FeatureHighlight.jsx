import { CiCircleCheck } from "react-icons/ci";
import { featureHighlights } from "../../../shared/utils/constants";
import ProductPreview from "../ProductPreview";
import { Reveal } from "../../../shared/motion";

/* These three panels were payroll-mock.png, analytics-mock.png and
   integration-mock.png — AI-generated images carrying "HRPayroll Pro" and
   "ApexHR" branding, dollar amounts, and logos for NetSuite, Salesforce and
   QuickBooks that this product does not integrate with. They render from the
   real design system now. The integrations highlight has no preview at all,
   because there is nothing yet to preview. */
const previewFor = { 1: "payroll", 2: "analytics" };

function FeatureHighlight() {
  return (
    <section className="m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24 py-16 sm:py-20 xl:py-28">
      {/* Section heading */}
      <div className="text-center mb-16 sm:mb-20">
        <Reveal as="h2" className="font-bold text-[2rem]/[2.5rem] text-primary-500 sm:text-4xl md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight mb-4">
          Built for{" "}
          <span className="underline underline-offset-4 decoration-[6px] decoration-purple-500">
            Performance
          </span>
        </Reveal>
        <Reveal as="p" delay={90} className="text-gray-500 text-lg max-w-2xl mx-auto">
          Powerful features designed to help your team work smarter, not harder.
        </Reveal>
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
              {/* Visual side */}
              <Reveal variant={isReversed ? "right" : "left"} className="w-full lg:w-1/2">
                <div className="relative rounded-3xl overflow-hidden bg-gradient-to-t from-purple-500 to-purple-200 p-[2px] shadow-lg hover:shadow-2xl transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-1 motion-reduce:transform-none">
                  <div className="bg-primary-500 rounded-[1.35rem] overflow-hidden flex items-center justify-center">
                    {previewFor[feature.id] ? (
                      <ProductPreview variant={previewFor[feature.id]} />
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
                        <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold uppercase tracking-wider text-white/60">
                          On the roadmap
                        </span>
                        <p className="text-white/50 text-sm max-w-xs leading-relaxed">
                          Prebuilt connectors are in development. The REST API is
                          available today for custom integrations.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>

              {/* Text side */}
              <div className="w-full lg:w-1/2">
                {/* Label pill matching testimonial badge gradient */}
                <Reveal
                  variant={isReversed ? "left" : "right"}
                  delay={120}
                  className="flex flex-wrap items-center gap-2 mb-6"
                >
                  <span className="inline-block bg-gradient-to-t from-purple-500 to-purple-200 text-primary-500 text-xs font-semibold tracking-wider uppercase px-4 py-1.5 rounded-full">
                    {feature.label}
                  </span>
                  {feature.comingSoon && (
                    <span className="inline-block px-3 py-1.5 rounded-full border border-purple-200 text-purple-600 text-[11px] font-bold uppercase tracking-wider">
                      Coming soon
                    </span>
                  )}
                </Reveal>

                <Reveal
                  as="h3"
                  delay={180}
                  className="font-bold text-2xl sm:text-3xl md:text-4xl text-primary-800 tracking-tight mb-5"
                >
                  {feature.title}
                </Reveal>

                <Reveal as="p" delay={240} className="text-gray-500 text-base sm:text-lg leading-relaxed mb-8">
                  {feature.description}
                </Reveal>

                <ul className="space-y-4">
                  {feature.bullets.map((bullet, idx) => (
                    <Reveal
                      as="li"
                      key={idx}
                      variant="riseSmall"
                      index={idx}
                      stagger={70}
                      delay={300}
                      className="flex items-center gap-3 text-primary-800 font-medium"
                    >
                      <CiCircleCheck className="w-6 h-6 stroke-purple-500 flex-shrink-0 text-purple-600" />
                      <span>{bullet}</span>
                    </Reveal>
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
