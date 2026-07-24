import { useState } from "react";
import Toggle from "../../../shared/components/Toggle";
import PricingCard from "./PricingCard";
import { pricingCards } from "../../../shared/utils/constants";

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

        <div className="gap-8 grid md:grid-cols-2 lg:grid-cols-3 mt-12 w-full">
          {pricingCards.map((card, idx) => (
            <PricingCard key={idx} card={card} paymentPlan={paymentPlan} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
