import { useState } from "react";
import { Solutions } from "../../utils/constants";
import ServiceCard from "./ServiceCard";

const categories = [...new Set(Solutions.map((s) => s.category))];

function ServicesCategoryTabs() {
  const [active, setActive] = useState(categories[0] || "");

  const filtered = Solutions.filter((s) => s.category === active);

  return (
    <section className="m-auto max-w-[90rem] px-4 sm:px-8 md:px-16 xl:px-24 py-16 sm:py-20 xl:py-28">
      {/* Section heading */}
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="font-bold text-[2rem]/[2.5rem] text-primary-500 sm:text-4xl md:text-5xl xl:text-[3.5rem]/[4rem] tracking-tight mb-4">
          Explore Our{" "}
          <span className="underline underline-offset-4 decoration-[6px] decoration-purple-500">
            Solutions
          </span>
        </h2>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto">
          Choose from our comprehensive suite of products designed to streamline
          every aspect of your business operations.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap justify-center gap-3 mb-12">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActive(cat)}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              active === cat
                ? "bg-gradient-to-t from-purple-500 to-purple-200 text-primary-500 shadow-[0_4px_14px_rgba(139,92,246,0.25)] border-transparent"
                : "bg-white/60 backdrop-blur-sm border border-purple-200/60 text-gray-600 hover:text-purple-700 hover:border-purple-300 hover:bg-purple-50/40"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item, index) => (
          <ServiceCard solution={item} key={`${item.category}-${index}`} />
        ))}
      </div>
    </section>
  );
}

export default ServicesCategoryTabs;
