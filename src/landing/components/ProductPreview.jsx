import { TREND_COLORS } from "../../shared/attendance/dayStatus";
import { useInView, useReducedMotion, EASE_ENTER } from "../../shared/motion";

/* ─────────────────────────────────────────────────────────────────────────────
   ProductPreview — an honest picture of the actual product.

   The marketing pages used to show four AI-generated PNGs. They carried other
   companies' branding ("HRPayroll Pro", "ApexHR"), dollar amounts, integrations
   we don't have, a recruitment module we haven't built, and visible typos
   ("Shotlisted Candidates", "Cadidates", "Donor Chart").

   This renders in the round instead: real module names from the sidebar, real
   figures in rupees, and the same purple series colours the in-app charts use.
   Nothing here claims a screen that doesn't exist, and because it's markup it
   can never drift out of date behind a binary.

   Decorative by contract — every instance is aria-hidden and the caller
   supplies the accessible description.
──────────────────────────────────────────────────────────────────────────── */

const MODULES = ["Dashboard", "Employees", "Attendance", "Leave", "Payroll", "Documents"];

const inr = (n) => `₹${n.toLocaleString("en-IN")}`;

/* ─── Chrome ─── */

function Shell({ title, active, children }) {
  return (
    <div className="flex w-full h-full bg-[#0f0a1f] text-white">
      {/* Sidebar */}
      <div className="hidden sm:flex flex-col w-[26%] max-w-[150px] border-r border-white/10 py-3 px-2.5 shrink-0">
        <div className="flex items-center gap-1.5 px-1.5 mb-4">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-400 to-fuchsia-500 shrink-0" />
          <span className="font-bold text-[10px] tracking-tight truncate">HR Clouds</span>
        </div>
        <div className="space-y-0.5">
          {MODULES.map((m) => (
            <div
              key={m}
              className={`px-1.5 py-1 rounded text-[9px] truncate ${
                m === active ? "bg-purple-600/40 text-white font-semibold" : "text-white/45"
              }`}
            >
              {m}
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
          <span className="font-bold text-[11px] tracking-tight truncate">{title}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[8px] text-white/40 hidden sm:inline">Sep 2026</span>
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-500" />
          </div>
        </div>
        <div className="flex-1 p-2.5 space-y-2.5 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function Tiles({ items }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
      {items.map(({ label, value, tone }) => (
        <div key={label} className="rounded-lg bg-white/[0.06] border border-white/10 px-2 py-1.5 min-w-0">
          <p className="text-[7px] uppercase tracking-wider text-white/40 truncate">{label}</p>
          <p className={`font-bold text-[13px] leading-tight truncate ${tone || "text-white"}`}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* Attendance bars — the same three series, and the same colours, as the real
   Team Performance chart. */
const DAYS = [
  { present: 88, leave: 7, absent: 5 },
  { present: 91, leave: 5, absent: 4 },
  { present: 84, leave: 11, absent: 5 },
  { present: 93, leave: 4, absent: 3 },
  { present: 79, leave: 14, absent: 7 },
  { present: 90, leave: 6, absent: 4 },
  { present: 86, leave: 9, absent: 5 },
  { present: 94, leave: 3, absent: 3 },
  { present: 82, leave: 12, absent: 6 },
  { present: 89, leave: 7, absent: 4 },
];

function AttendanceChart() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView({ threshold: 0.4, skip: reduced });
  const grown = reduced || inView;

  return (
    <div ref={ref} className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[9px] font-semibold text-white/70 truncate">Team Performance</span>
        <div className="flex items-center gap-2 shrink-0">
          {[
            ["Present", TREND_COLORS.present],
            ["On leave", TREND_COLORS.on_leave],
            ["Absent", TREND_COLORS.absent],
          ].map(([label, color]) => (
            <span key={label} className="flex items-center gap-1 text-[7px] text-white/45 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-sm" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end justify-between gap-[3px] h-16">
        {DAYS.map((d, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end gap-[1px] min-w-0 origin-bottom"
            style={{
              // scaleY rather than height: it composites on the GPU and can't
              // reflow the row of ten bars on every frame.
              transform: grown ? "scaleY(1)" : "scaleY(0)",
              transition: reduced
                ? undefined
                : `transform 620ms ${EASE_ENTER} ${i * 45}ms`,
            }}
          >
            <div style={{ height: `${d.absent}%`, background: TREND_COLORS.absent }} className="rounded-sm" />
            <div style={{ height: `${d.leave}%`, background: TREND_COLORS.on_leave }} className="rounded-sm" />
            <div style={{ height: `${d.present}%`, background: TREND_COLORS.present }} className="rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Rows({ head, rows }) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/10 overflow-hidden">
      <div className="flex px-2.5 py-1.5 border-b border-white/10 gap-2">
        {head.map((h, i) => (
          <span
            key={h}
            className={`text-[7px] uppercase tracking-wider text-white/35 truncate ${i === 0 ? "flex-1" : "w-14 text-right shrink-0"}`}
          >
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r[0]} className="flex px-2.5 py-1 gap-2 border-b border-white/5 last:border-0">
          {r.map((cell, i) => (
            <span
              key={i}
              className={`text-[8px] truncate ${
                i === 0 ? "flex-1 text-white/70" : "w-14 text-right shrink-0 text-white/50"
              }`}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Variants ─── */

function DashboardView() {
  return (
    <Shell title="Dashboard" active="Dashboard">
      <Tiles
        items={[
          { label: "Employees", value: "248" },
          { label: "Present today", value: "231", tone: "text-violet-300" },
          { label: "On leave", value: "12" },
          { label: "Pending approvals", value: "6", tone: "text-fuchsia-300" },
        ]}
      />
      <AttendanceChart />
      <Rows
        head={["Pending approval", "Days", "Status"]}
        rows={[
          ["Casual leave — Priya Nair", "2", "Pending"],
          ["Attendance correction — Rohit Menon", "1", "Pending"],
          ["Earned leave — Ananya Rao", "3", "Pending"],
        ]}
      />
    </Shell>
  );
}

function PayrollView() {
  return (
    <Shell title="Payroll — September 2026" active="Payroll">
      <Tiles
        items={[
          { label: "Gross payout", value: inr(4280000) },
          { label: "Employees paid", value: "248", tone: "text-violet-300" },
          { label: "PF + ESI", value: inr(312400) },
          { label: "TDS", value: inr(186900) },
        ]}
      />
      <Rows
        head={["Component", "Employees", "Amount"]}
        rows={[
          ["Basic salary", "248", inr(2140000)],
          ["House rent allowance", "248", inr(856000)],
          ["Special allowance", "231", inr(742000)],
          ["Overtime", "38", inr(94500)],
          ["Provident fund", "248", `-${inr(256800)}`],
        ]}
      />
      <div className="rounded-lg bg-purple-600/15 border border-purple-400/25 px-2.5 py-1.5">
        <p className="text-[8px] text-purple-200">
          Run locked · Payslips issued to 248 employees
        </p>
      </div>
    </Shell>
  );
}

function AnalyticsView() {
  return (
    <Shell title="Reports" active="Attendance">
      <Tiles
        items={[
          { label: "Avg hours / day", value: "8h 18m" },
          { label: "On-time arrivals", value: "92%", tone: "text-violet-300" },
          { label: "Leave used", value: "64%" },
          { label: "Overtime hours", value: "412" },
        ]}
      />
      <AttendanceChart />
      <Rows
        head={["Department", "Headcount", "Present"]}
        rows={[
          ["Engineering", "112", "96%"],
          ["Operations", "64", "91%"],
          ["Finance", "28", "94%"],
          ["Human Resources", "19", "98%"],
        ]}
      />
    </Shell>
  );
}

const VIEWS = {
  dashboard: DashboardView,
  payroll: PayrollView,
  analytics: AnalyticsView,
};

/**
 * @param {"dashboard"|"payroll"|"analytics"} variant
 * @param {boolean} framed  wrap in a device bezel (used for the hero)
 */
function ProductPreview({ variant = "dashboard", framed = false, className = "" }) {
  const View = VIEWS[variant] || DashboardView;

  const screen = (
    <div
      aria-hidden="true"
      className={`w-full overflow-hidden ${framed ? "" : "rounded-[1.35rem]"} ${className}`}
      style={{ aspectRatio: "4 / 3" }}
    >
      <View />
    </div>
  );

  if (!framed) return screen;

  return (
    <div className="w-full rounded-[1.5rem] sm:rounded-[2rem] bg-[#1a1626] p-2 sm:p-3 shadow-2xl ring-1 ring-white/10">
      <div className="rounded-[1rem] sm:rounded-[1.25rem] overflow-hidden">{screen}</div>
    </div>
  );
}

export default ProductPreview;
