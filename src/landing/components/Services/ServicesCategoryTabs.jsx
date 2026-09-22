import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Solutions } from "../../../shared/utils/constants";
import ServiceCard from "./ServiceCard";
import { slugFor } from "./slug";

const categories = [...new Set(Solutions.map((s) => s.category))];

// Only the active tab's cards are in the DOM, so a link like /services#payroll
// has to switch tabs before the target exists to scroll to.
const categoryForSlug = (slug) =>
  Solutions.find((s) => slugFor(s) === slug)?.category;

function ServicesCategoryTabs() {
  const { hash } = useLocation();
  const slug = hash.replace("#", "");
  const [active, setActive] = useState(
    () => categoryForSlug(slug) || categories[0] || ""
  );

  useEffect(() => {
    if (!slug) return;
    const category = categoryForSlug(slug);
    if (!category) return;
    setActive(category);
    // Wait for the tab switch to paint before scrolling to the card.
    const id = requestAnimationFrame(() => {
      document.getElementById(slug)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [slug]);

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
            aria-pressed={active === cat}
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
          <ServiceCard solution={item} key={slugFor(item) || `${item.category}-${index}`} />
        ))}
      </div>
    </section>
  );
}

export default ServicesCategoryTabs;
