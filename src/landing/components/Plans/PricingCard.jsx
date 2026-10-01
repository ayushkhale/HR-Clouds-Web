import { CiCircleCheck } from "react-icons/ci";
import GetStartedLink from "../../../shared/components/GetStartedLink";
import { HOVER } from "../../../shared/motion";
import {
  formatPlanPrice,
  planPeriodLabel,
  planPriceCaption,
  planBullets,
} from "../../../shared/config/plans";

// Every tier sends the buyer to the same place — the org registration flow,
// which is where a plan is actually chosen and paid for. The tier is passed
// along so the picker can pre-select it.
const ctaLabel = (plan) => (plan.tier === "free" ? "Start free" : `Choose ${plan.name}`);

function PricingCard({ plan, billing }) {
  const pclass = {
    container: "pb-12 lg:pb-14",
    bulletColor: "stroke-purple-500",
    cta: "bg-gradient-to-t bg-purple-500 from-purple-500 to-purple-200",
    ctaWrapper:
      "bg-gradient-to-b from-purple-500 to-purple-200 p-[.125rem] rounded-2xl \
      drop-shadow-[0_0px_35px_rgba(139,92,246,0.25)] hover:drop-shadow-[0_0px_45px_rgba(139,92,246,0.35)]",
  };

  const price = formatPlanPrice(plan, billing);
  const period = planPeriodLabel(plan, billing);
  const bullets = planBullets(plan);

  return (
    <div
      className={`group/plan h-full bg-primary-500 px-8 pt-8 rounded-2xl relative overflow-hidden flex flex-col transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-2xl motion-reduce:transform-none motion-reduce:transition-none ${pclass.container}`}
    >
      {/* Gradient Tags and Highlights */}
      {plan.popular && (
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
      <p className="opacity-80 mb-10 px-6 py-2 border rounded-2xl max-w-min text-sm text-white capitalize whitespace-nowrap">
        {plan.name}
      </p>

      {/* Price */}
      <div className="flex items-end gap-x-2 mb-1">
        <p className="font-bold text-4xl sm:text-5xl lg:text-[4rem]/[4rem] text-white">
          {price}
        </p>
        <span className="text-white text-sm pb-1">{period}</span>
      </div>

      {/* Spells out what the price covers — a bare "₹49" used to leave people
          guessing whether it was per employee or for the whole workspace. */}
      <p className="opacity-70 mb-6 text-xs text-white">{planPriceCaption(plan)}</p>

      <p className="opacity-80 mb-8 text-sm text-white">{plan.description}</p>

      {/* Bullets */}
      <ul className="space-y-4 mb-10 flex-1">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-center gap-x-3 text-white/90 text-sm transition-colors duration-300 group-hover/plan:text-white">
            <CiCircleCheck className={`w-6 h-6 flex-shrink-0 ${pclass.bulletColor}`} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <div className={pclass.ctaWrapper}>
        <GetStartedLink
          plan={plan.tier}
          billing={billing}
          className={`block w-full py-3 text-center rounded-[.875rem] font-bold text-sm text-primary-500 hover:text-white transition-colors duration-200 ${HOVER.lift} ${pclass.cta}`}
        >
          {ctaLabel(plan)}
        </GetStartedLink>
      </div>
    </div>
  );
}

export default PricingCard;
