import { useState } from "react";
import Toggle from "../UI/Toggle";
import PricingCard from "./PricingCard";
import { pricingCards } from "../../utils/constants";

function Pricing() {
  const [paymentPlan, setPaymentPlan] = useState("monthly");

  function handlePaymentPlanChange() {
    setPaymentPlan((plan) => (plan === "monthly" ? "annual" : "monthly"));
  }

  return (
    <section className="m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-8 max-w-[90rem]">
      <div className="flex flex-col items-center">
        <h2 className="mb-6 font-bold text-[2rem]/[2.5rem] text-primary-500 md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight text-center">
          Flexible plans for every HR scale<span className="text-purple-500">.</span>
        </h2>
        <div className="flex items-center gap-x-4">
          <p className="text-primary-500 xl:text-lg tracking-tight">Monthly</p>
          <Toggle
            handleToggle={handlePaymentPlanChange}
            toggleLabel="Toggle between monthly and annual plans"
          />
          <p className="text-primary-500 xl:text-lg tracking-tight">Annual</p>
        </div>

        <div className="gap-x-4 gap-y-4 grid grid-cols-1 pricing-break:grid-cols-2 xl:grid-cols-[32fr_34fr_32fr] my-10 lg:w-4/5 pricing-break:w-full xl:w-full">
          {pricingCards.map((card) => (
            <PricingCard
              card={card}
              key={card.program}
              paymentPlan={paymentPlan}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
