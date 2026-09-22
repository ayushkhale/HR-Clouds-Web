import { slugFor } from "./slug";
import GetStartedLink from "../../../shared/components/GetStartedLink";

function ServiceCard({ solution }) {
  const Icon = solution.icon;
  const comingSoon = Boolean(solution.comingSoon);

  return (
    <div
      id={slugFor(solution)}
      className="bg-primary-500 px-8 pt-8 pb-12 lg:pb-14 rounded-2xl relative overflow-hidden flex flex-col h-full border border-white/5 shadow-xl scroll-mt-28"
    >
      {/* Overlapping white transparent highlights matching pricing cards EXACTLY */}
      <div className="left-[-20%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />
      <div className="top-[30%] left-[30%] absolute bg-gradient-to-l from-white to-transparent opacity-20 blur-2xl rounded-[50%] w-[30rem] h-28 -rotate-45 pointer-events-none" />

      {/* Card content */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Icon container */}
        <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 transition-all duration-300 group-hover:bg-purple-600/20 group-hover:border-purple-500/30">
          <Icon className="w-7 h-7 text-white" />
        </div>

        {/* Title */}
        <div className="flex items-start gap-2 mb-3">
          <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            {solution.title}
          </h3>
          {comingSoon && (
            <span className="mt-1 shrink-0 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold uppercase tracking-wide text-white/60 whitespace-nowrap">
              Soon
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-white/70 text-sm leading-relaxed mb-8 flex-1">
          {solution.description}
        </p>

        {/* CTA — a module you can use today sends you to signup. One that isn't
            built yet says so plainly instead of offering a link to nowhere. */}
        {comingSoon ? (
          <div className="rounded-2xl border border-white/15 bg-white/5 py-3.5 text-center">
            <span className="text-white/50 font-bold text-sm">On the roadmap</span>
          </div>
        ) : (
          <div className="bg-gradient-to-b from-purple-500 to-purple-200 p-[.125rem] rounded-2xl drop-shadow-[0_0px_35px_rgba(139,92,246,0.25)] hover:drop-shadow-[0_0px_45px_rgba(139,92,246,0.35)] transition-all duration-200">
            <GetStartedLink
              className="block text-primary-500 py-3.5 w-full text-center rounded-2xl hover:bg-purple-600 hover:text-white transition-all duration-200 bg-gradient-to-t bg-purple-500 from-purple-500 to-purple-200 font-bold text-sm"
            >
              Get started
            </GetStartedLink>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServiceCard;
