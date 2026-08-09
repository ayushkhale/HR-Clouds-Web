import React from "react";

function PageHeader({ badgeText, badgeIcon: BadgeIcon, title, subtitle, rightContent }) {
  return (
    <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
      <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
      <div className="relative z-10 max-w-2xl space-y-1">
        {badgeText && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
            {BadgeIcon && <BadgeIcon className="w-3 h-3 text-purple-200" />} {badgeText}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-purple-100/90 font-normal leading-relaxed">{subtitle}</p>
        )}
      </div>
      {rightContent && (
        <div className="relative z-10 flex shrink-0 w-full sm:w-auto">
          {rightContent}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
