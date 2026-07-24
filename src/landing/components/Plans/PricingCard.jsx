import { CiCircleCheck } from "react-icons/ci";

function PricingCard({ card, paymentPlan }) {
  const pclass = {
    container: "pb-12 lg:pb-14",
    bulletColor: "stroke-purple-500",
    cta: "bg-gradient-to-t bg-purple-500 from-purple-500 to-purple-200",
    ctaWrapper:
      "bg-gradient-to-b from-purple-500 to-purple-200 p-[.125rem] rounded-2xl \
      drop-shadow-[0_0px_35px_rgba(139,92,246,0.25)] hover:drop-shadow-[0_0px_45px_rgba(139,92,246,0.35)]",
  };

  const price = card.price[paymentPlan];
  const priceDisplay = price;
  const hidePlanPeriod = price === "Free" || price === "Contact Us" || price === "Custom";
  const paymentPlanText = hidePlanPeriod
    ? ""
    : paymentPlan === "monthly"
    ? "per month"
    : "per year";

  return (
    <div
      className={`bg-primary-500 px-8 pt-8 rounded-2xl relative overflow-hidden ${pclass.container}`}
    >
      {/* Gradient Tags and Highlights */}
      {card.mostPopular && (
        <>
          <div className="top-0 right-0 z-10 absolute bg-gradient-to-b from-purple-500 to-purple-200 py-[.125rem] rounded-tr-2xl rounded-bl-2xl">
            <p className="bg-purple-500 bg-gradient-to-t from-purple-500 to-purple-200 px-4 py-2 rounded-tr-xl rounded-bl-2xl text-xs text-white">
              most popular
            </p>
          </div>
          <div className="left-[-20%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45" />
          <div className="top-[30%] left-[30%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45" />
        </>
      )}

      {/* Plan Name */}
      <p className="opacity-80 mb-12 px-6 py-2 border rounded-2xl max-w-min text-sm text-white capitalize">
        {card.program}
      </p>

      {/* Price */}
      <div className="flex items-end gap-x-2 mb-2">
        <p className="font-bold text-4xl sm:text-5xl lg:text-[4rem]/[4rem] text-white">
          {priceDisplay}
        </p>
        <span className="text-white text-sm pb-1">{paymentPlanText}</span>
      </div>

      <p className="opacity-80 mb-8 text-sm text-white">{card.subheading}</p>

      {/* Bullets */}
      <ul className="space-y-4 mb-10">
        {card.bullets.map((bullet, idx) => (
          <li key={idx} className="flex items-center gap-x-3 text-white/90 text-sm">
            <CiCircleCheck className={`w-6 h-6 flex-shrink-0 ${pclass.bulletColor}`} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <div className={pclass.ctaWrapper}>
        <button
          type="button"
          className={`w-full py-3 text-center rounded-[.875rem] font-bold text-sm text-primary-500 hover:text-white transition-all duration-200 ${pclass.cta}`}
        >
          {card.cta}
        </button>
      </div>
    </div>
  );
}

export default PricingCard;
