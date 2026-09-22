import { useState } from "react";
import Toggle from "../../../shared/components/Toggle";
import PricingCard from "./PricingCard";
import { PLANS, bestYearlySavingPct } from "../../../shared/config/plans";
import { Reveal } from "../../../shared/motion";

function Pricing() {
  const [billing, setBilling] = useState("monthly");
  const saving = bestYearlySavingPct();

  function handlePaymentPlanChange() {
    setBilling((plan) => (plan === "monthly" ? "yearly" : "monthly"));
  }

  return (
    <section className="m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-8 max-w-[90rem]">
      <div className="flex flex-col items-center">
        <Reveal
          as="h2"
          className="mb-6 font-bold text-[2rem]/[2.5rem] text-primary-500 md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight text-center"
        >
          Flexible plans for every HR scale<span className="text-purple-500">.</span>
        </Reveal>
        <Reveal delay={100} className="flex items-center gap-x-4">
          <p className="text-primary-500 xl:text-lg tracking-tight">Monthly</p>
          <Toggle
            handleToggle={handlePaymentPlanChange}
            toggleLabel="Toggle between monthly and annual plans"
          />
          <p className="text-primary-500 xl:text-lg tracking-tight">
            Annual
            {saving > 0 && (
              <span className="ml-2 align-middle text-[11px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                save {saving}%
              </span>
            )}
          </p>
        </Reveal>

        <div className="gap-8 grid md:grid-cols-2 lg:grid-cols-3 mt-12 w-full items-stretch">
          {PLANS.map((plan, i) => (
            // Cards deal in left to right; the popular one is not singled out
            // by timing, only by its existing badge.
            <Reveal key={plan.tier} variant="rise" index={i} delay={140} className="h-full">
              <PricingCard plan={plan} billing={billing} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
