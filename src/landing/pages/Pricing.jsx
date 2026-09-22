import React, { useState } from "react";
import Pricing from "../components/Plans/Pricing";
import { HiChevronDown, HiCheck, HiMinus } from "react-icons/hi";
import pricingills from "../../assets/testimonials/pricingills.png";
import { PLANS, comparisonRows } from "../../shared/config/plans";
import GetStartedLink from "../../shared/components/GetStartedLink";
import { Reveal, RevealText, useParallax, HOVER } from "../../shared/motion";

// ─── Essential Feature Comparison ──────────────────────────────
// Rows come from the plan catalog so this table can never contradict the
// cards above it or the checkout. It previously listed an Enterprise tier
// that doesn't exist and omitted the Free plan that does.
const comparisonFeatures = comparisonRows();

// ─── Simplified FAQ ──────────────────────────────────────────
const faqs = [
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade or downgrade at any time from your account settings. Upgrades take effect immediately; downgrades apply at the start of the next billing cycle.",
  },
  {
    q: "How quickly can we get started?",
    a: "Every plan sets up instantly online — no credit card needed for the Free plan. Paid plans activate the moment payment clears, and our team helps import your roster at no extra cost.",
  },
  {
    q: "How does annual billing work?",
    a: "Annual plans are invoiced once per year and save you about 17% against paying monthly. You receive a single GST-compliant invoice at the start of each year.",
  },
  {
    q: "What happens if we exceed our employee limit?",
    a: "You'll receive an in-app notification when you're near the limit. You can upgrade your plan anytime — all your existing data carries over seamlessly.",
  },
  {
    q: "How fast is the onboarding and implementation process?",
    a: "Most standard setups take less than 48 hours. Our team assists with importing employee rosters, configuring leave policies, and setting up biometric integrations at zero extra cost.",
  },
  {
    q: "Are statutory compliance rules (PF, ESI, TDS) auto-updated?",
    a: "Yes! HR Clouds automatically updates tax slabs, PF ceilings, and statutory calculations to remain 100% compliant with the latest government regulations across India.",
  },
];

// ─── Comparison Cell ─────────────────────────────────────────
function CompCell({ value }) {
  if (value === true)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-purple-500/20">
        <HiCheck className="w-4 h-4 text-purple-300" />
      </span>
    );
  if (value === false)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7">
        <HiMinus className="w-4 h-4 text-white/20" />
      </span>
    );
  // A feature the plan grants but the product hasn't shipped yet reads as a
  // dated badge, never a tick — a tick would promise a screen that isn't there.
  if (value === "Coming soon")
    return (
      <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold uppercase tracking-wide text-white/55 whitespace-nowrap">
        Coming soon
      </span>
    );
  return <span className="text-xs sm:text-sm font-medium text-white/75 text-center">{value}</span>;
}

// ─── Simple Dropdown FAQ Item ────────────────────────────────
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 py-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left transition-colors duration-200"
        aria-expanded={open}
      >
        <span className={`font-bold text-base sm:text-lg pr-4 transition-colors duration-200 tracking-tight ${
          open ? "text-purple-700" : "text-primary-800 hover:text-purple-600"
        }`}>{q}</span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-[background-color,color,transform] duration-300 ease-out motion-reduce:transform-none ${
          open ? "bg-purple-100 text-purple-700 rotate-180" : "bg-gray-100 text-gray-500"
        }`}>
          <HiChevronDown className="w-4 h-4" />
        </div>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-gray-500 text-sm sm:text-base leading-relaxed pb-3 pl-1">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
const PricingPage = () => {
  const heroParallax = useParallax(30);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* HERO */}
      <section className="relative pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 md:pb-28 max-w-[90rem] m-auto overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[40rem] h-[28rem] bg-purple-200 opacity-20 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute top-10 right-0 w-[24rem] h-[20rem] bg-indigo-200 opacity-15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative px-4 sm:px-8 md:px-16 xl:px-24 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8 w-full">

          {/* Left Column: 3D Illustration Column */}
          <div className="w-full lg:w-2/5 flex justify-center lg:justify-start relative">
            <Reveal
              priority
              variant="scale"
              duration={900}
              className="relative w-full max-w-[22rem] sm:max-w-[26rem] lg:max-w-[28rem] flex justify-center"
            >
              <div
                ref={heroParallax}
                style={{ transform: "translate3d(0, var(--parallax-y, 0px), 0)" }}
                className="w-full flex justify-center"
              >
                <img
                  src={pricingills}
                  alt="3D Pricing Illustration"
                  className="relative z-10 w-full h-auto object-contain scale-110 animate-float motion-reduce:animate-none"
                />
              </div>
            </Reveal>
          </div>

          {/* Right Column: Text Content */}
          <div className="w-full lg:w-3/5 text-left">
            <h1 className="font-bold text-4xl sm:text-5xl lg:text-6xl/[4.5rem] xl:text-[4.5rem]/[5.5rem] text-primary-800 tracking-tight mb-6">
              <RevealText as="span" text="Plans That" delay={120} />{" "}
              <Reveal
                as="span"
                variant="riseSmall"
                delay={260}
                className="inline-block bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent"
              >
                Grow With You
              </Reveal>
            </h1>
            <Reveal as="p" delay={300} className="text-gray-500 text-lg sm:text-xl max-w-2xl leading-relaxed mb-12">
              Whether you&rsquo;re a 5-person startup or a 300-person organization, HR Clouds has
              a plan built around your scale — one unified platform covering HRMS, Payroll,
              Compliance, and Analytics. No hidden fees. No lock-ins.
            </Reveal>
            <div className="flex flex-wrap gap-3">
              {["✓  No credit card required", "✓  Instant digital setup", "✓  Cancel any time"].map((t, i) => (
                <Reveal
                  as="span"
                  key={t}
                  variant="riseSmall"
                  index={i}
                  stagger={80}
                  delay={380}
                  className="px-4 py-2 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs sm:text-sm font-medium"
                >
                  {t}
                </Reveal>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* PRICING CARDS */}
      <section className="max-w-[90rem] m-auto">
        <Pricing />
      </section>

      {/* FULL COMPARISON TABLE */}
      <section className="max-w-[90rem] m-auto px-4 sm:px-8 md:px-16 xl:px-24 py-16 sm:py-20">
        <div className="text-center mb-12">
          <Reveal
            as="span"
            variant="riseSmall"
            className="inline-block mb-3 px-4 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-sm font-semibold"
          >
            Compare Plans
          </Reveal>
          <RevealText
            as="h2"
            text="Everything you get, side by side"
            delay={80}
            className="font-bold text-3xl sm:text-4xl text-primary-800 tracking-tight mb-3"
          />
          <Reveal as="p" delay={220} className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
            A simplified breakdown of key features across all three plans to help you choose the right fit.
          </Reveal>
        </div>

        <Reveal variant="rise" duration={800} className="bg-primary-500 rounded-3xl overflow-hidden relative">
          <div className="absolute left-[-20%] top-0 bg-gradient-to-l from-white to-transparent opacity-10 blur-2xl rounded-[50%] w-[50rem] h-24 -rotate-12 pointer-events-none" />
          <div className="absolute top-[30%] left-[30%] bg-gradient-to-l from-white to-transparent opacity-10 blur-2xl rounded-[50%] w-[30rem] h-16 -rotate-45 pointer-events-none" />

          <div className="grid grid-cols-4 border-b border-white/10 px-4 sm:px-8 py-5 sticky top-0 bg-primary-500 z-10">
            <div className="text-white/40 text-xs font-bold uppercase tracking-widest">Feature</div>
            {PLANS.map(({ tier, name, popular }) => (
              <div key={tier} className="text-center">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${popular ? "bg-gradient-to-r from-purple-500 to-purple-300 text-white" : "bg-white/10 text-white/70"}`}>
                  {name}
                </span>
              </div>
            ))}
          </div>

          {comparisonFeatures.map((feat, idx) => (
            <Reveal
              key={feat.label}
              variant="riseSmall"
              // Capped so the tail of a long table isn't left waiting.
              delay={120 + Math.min(idx, 8) * 55}
              duration={500}
              className={`grid grid-cols-4 px-4 sm:px-8 py-4 items-center border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.06] ${
                idx % 2 === 0 ? "bg-white/[0.03]" : ""
              }`}
            >
              <span className="text-white/80 text-xs sm:text-sm font-medium">{feat.label}</span>
              {feat.values.map((value, col) => (
                <div key={PLANS[col].tier} className="flex justify-center">
                  <CompCell value={value} />
                </div>
              ))}
            </Reveal>
          ))}
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="max-w-[90rem] m-auto px-4 sm:px-8 md:px-16 xl:px-24 pb-20 pt-10">
        <div className="text-center mb-12">
          <Reveal as="h2" className="font-bold text-3xl sm:text-4xl text-primary-800 tracking-tight mb-4">
            Questions? We&rsquo;ve Got <span className="text-purple-600">Answers</span>
          </Reveal>
          <Reveal as="p" delay={90} className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
            Everything you need to know about our plans, pricing models, contract terms, and customized service levels.
          </Reveal>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 items-start">
          {faqs.map((faq, i) => (
            <Reveal key={faq.q} variant="riseSmall" index={i} stagger={70}>
              <FaqItem q={faq.q} a={faq.a} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="max-w-[90rem] m-auto px-4 sm:px-8 md:px-16 xl:px-24 pb-24">
        <Reveal variant="scale" duration={850} className="relative bg-primary-500 rounded-3xl overflow-hidden px-8 sm:px-14 py-14">
          <div className="absolute left-[-15%] top-0 bg-gradient-to-r from-white to-transparent opacity-10 blur-2xl rounded-[50%] w-[40rem] h-28 -rotate-12 pointer-events-none" />
          <div className="absolute top-[30%] left-[30%] bg-gradient-to-l from-white to-transparent opacity-10 blur-2xl rounded-[50%] w-[30rem] h-16 -rotate-45 pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-8">
            <div className="max-w-lg">
              <RevealText
                as="h2"
                text="Not sure which plan fits?"
                delay={120}
                className="font-bold text-white text-3xl sm:text-4xl tracking-tight mb-3"
              />
              <p className="text-white/70 text-sm sm:text-base leading-relaxed">
                Talk to our team — we&rsquo;ll walk you through every feature, answer your questions,
                and help you pick the right plan for your organization. No pressure, just clarity.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <GetStartedLink
                plan="free"
                className={`px-7 py-3.5 rounded-2xl font-bold text-sm text-primary-800 bg-gradient-to-t from-purple-500 to-purple-200 border border-purple-400/30 hover:text-white transition-colors duration-200 text-center cursor-pointer ${HOVER.lift}`}
              >
                Get Started Free
              </GetStartedLink>
              <a
                href="mailto:hello@hrclouds.in"
                className={`px-7 py-3.5 rounded-2xl font-semibold text-sm text-white/80 border border-white/20 hover:bg-white/10 transition-colors duration-200 text-center ${HOVER.lift}`}
              >
                Talk to Sales →
              </a>
            </div>
          </div>
        </Reveal>
      </section>

    </div>
  );
};

export default PricingPage;
