import { FaCogs, FaFileInvoiceDollar } from "react-icons/fa";
import { HiOutlineDocumentReport } from "react-icons/hi";
import { BiTimeFive } from "react-icons/bi";
import { BsCart4, BsPeopleFill } from "react-icons/bs";
import { TbDeviceAnalytics, TbWorldWww } from "react-icons/tb";
import { MdOutlineAttachMoney, MdPeopleOutline } from "react-icons/md";
import { RiUserAddLine, RiLineChartLine } from "react-icons/ri";

const links = ["Company", "Solutions", "Resources", "Support"];

const reviewImgs = [
  {
    id: 1,
    name: "Aarav Mehta",
    image: new URL("../../assets/reviews/img-1.webp", import.meta.url),
  },
  {
    id: 2,
    name: "Sneha Iyer",
    image: new URL("../../assets/reviews/img-2.webp", import.meta.url),
  },
  {
    id: 3,
    name: "Rohan Nair",
    image: new URL("../../assets/reviews/img-3.webp", import.meta.url),
  },
  {
    id: 4,
    name: "Megha Kulkarni",
    image: new URL("../../assets/reviews/img-4.webp", import.meta.url),
  },
  {
    id: 5,
    name: "Vikram Sinha",
    image: new URL("../../assets/reviews/img-5.webp", import.meta.url),
  },
];

const appStatsImgs = [
  {
    id: 1,
    name: "@payroll_maven",
    description:
      "Switching to our platform streamlined our payroll process and eliminated compliance errors.",
    image: new URL("../../assets/appStats/img-1.webp", import.meta.url),
  },
  {
    id: 2,
    name: "@hr_transformer",
    description:
      "From onboarding to performance reviews, our HR processes are now 4x faster with full traceability.",
    image: new URL("../../assets/appStats/img-2.webp", import.meta.url),
  },
  {
    id: 3,
    name: "@peopleops_pro",
    description:
      "The dashboard insights have helped us cut attrition by 18% and improve team engagement significantly.",
    image: new URL("../../assets/appStats/img-3.webp", import.meta.url),
  },
];

const appStats = [
  {
    id: 1,
    value: "400+",
    description: "employees managed",
  },
  {
    id: 2,
    value: "60+",
    description: "businesses onboarded",
  },
  {
    id: 3,
    value: "95%",
    description: "customer satisfaction",
  },
];

const features = [
  {
    id: 1,
    name: "Payroll Automation",
    description: "Eliminate manual errors with smart, rule-based payroll processing.",
    icon: new URL("../../assets/features/engagement.svg", import.meta.url),
  },
  {
    id: 2,
    name: "Employee Self-Service",
    description: "Empower teams to manage their own profiles, leave, and payslips.",
    icon: new URL("../../assets/features/autonomy.svg", import.meta.url),
  },
  {
    id: 3,
    name: "Compliance Engine",
    description: "Stay audit-ready with in-built statutory compliance tracking.",
    icon: new URL("../../assets/features/free.svg", import.meta.url),
  },
  {
    id: 4,
    name: "Analytics & Insights",
    description: "Get actionable workforce insights with real-time HR analytics.",
    icon: new URL("../../assets/features/earn.svg", import.meta.url),
  },
];

const footerCols = [
  {
    id: 1,
    heading: "Company",
    links: [
      { name: "About Us", path: "/about" },
      { name: "Services & Modules", path: "/services" },
      { name: "Pricing Plans", path: "/pricing" },
    ],
  },
  {
    id: 2,
    heading: "HR Modules",
    links: [
      { name: "Payroll Automation", path: "/services" },
      { name: "Leave & Attendance", path: "/services" },
      { name: "Employee Onboarding", path: "/services" },
      { name: "Performance & OKRs", path: "/services" },
    ],
  },
  {
    id: 3,
    heading: "Support & Legal",
    links: [
      { name: "Help Center", path: "#" },
      { name: "Privacy Policy", path: "#" },
      { name: "Terms of Service", path: "#" },
      { name: "Statutory Guidelines", path: "#" },
    ],
  },
];

const footerSocials = [
  { id: 1, name: "LinkedIn", path: "#" },
  { id: 2, name: "Twitter", path: "#" },
  { id: 3, name: "Facebook", path: "#" },
];

const pricingCards = [
  {
    primary: true,
    mostPopular: false,
    program: "Starter",
    price: {
      monthly: "Free",
      annual: "Free",
    },
    subheading: "For small teams getting started",
    bullets: [
      "Up to 10 employees",
      "Basic Payroll & Leave",
      "Email Support",
      "Standard Reports",
    ],
    cta: "Try Free",
  },
  {
    primary: true,
    mostPopular: true,
    program: "Growth",
    price: {
      monthly: "₹99",
      annual: "₹999",
    },
    subheading: "Best for growing organizations",
    bullets: [
      "Up to 250 employees",
      "Advanced HRMS",
      "Priority Support",
      "Custom Workflows",
    ],
    cta: "Get Started",
  },
  {
    primary: true,
    mostPopular: false,
    program: "Enterprise",
    price: {
      monthly: "Contact Us",
      annual: "Custom",
    },
    subheading: "Tailored for large enterprises",
    bullets: [
      "Unlimited employees",
      "Dedicated Account Manager",
      "Enterprise-grade Security",
      "Custom Integrations",
    ],
    cta: "Talk to Sales",
  },
];

const testimonials = [
  {
    program: "growth",
    description:
      "HR Clouds reduced our monthly payroll processing time from 4 days to under 2 hours with 100% statutory compliance.",
    image: "https://images.pexels.com/photos/20642121/pexels-photo-20642121.jpeg?auto=compress&cs=tinysrgb&w=600",
    name: "Aarav Sharma",
    title: "HR Director, Mindworks India",
  },
  {
    program: "enterprise",
    description:
      "As a fast-growing startup, HR Clouds gave us seamless tools to scale our team and manage employee records effortlessly.",
    image: "https://images.pexels.com/photos/17293545/pexels-photo-17293545.jpeg?auto=compress&cs=tinysrgb&w=600",
    name: "Priya Patel",
    title: "COO, TechVeda Solutions",
  },
  {
    program: "starter",
    description:
      "Biometric integration and real-time attendance tracking saved us over 150 administrative hours every month.",
    image: "https://images.pexels.com/photos/28589307/pexels-photo-28589307.jpeg?auto=compress&cs=tinysrgb&w=600",
    name: "Rajesh Verma",
    title: "Head of Operations, MP Logistics",
  },
  {
    program: "growth",
    description:
      "Automated tax slab calculations and automated PDF payslip delivery eliminated our payroll errors entirely.",
    image: "https://images.pexels.com/photos/37574614/pexels-photo-37574614.jpeg?auto=compress&cs=tinysrgb&w=600",
    name: "Aditya Iyer",
    title: "Chief People Officer, Innovate Labs",
  },
  {
    program: "enterprise",
    description:
      "Managing multi-locational field teams and statutory filings across MP and Maharashtra is now 100% hassle-free.",
    image: "https://images.pexels.com/photos/938639/pexels-photo-938639.jpeg?auto=compress&cs=tinysrgb&w=600",
    name: "Vikramaditya Joshi",
    title: "VP Finance, Central Infra Group",
  },
];

const Solutions = [
  // Core HR & Onboarding
  {
    category: "Core HR & Onboarding",
    icon: RiUserAddLine,
    title: "Paperless Onboarding",
    description: "Automate candidate data collection, digital offer letters, and instant document uploads.",
    link: "/services#onboarding",
  },
  {
    category: "Core HR & Onboarding",
    icon: BsPeopleFill,
    title: "Employee Profiles & Directory",
    description: "Centralize employee data, roles, departments, and reporting hierarchies in one secure digital vault.",
    link: "/services#directory",
  },
  {
    category: "Core HR & Onboarding",
    icon: FaCogs,
    title: "Self-Service Portal (ESS)",
    description: "Empower staff to update personal profiles, request leave, and download tax forms without HR bottleneck.",
    link: "/services#ess",
  },
  {
    category: "Core HR & Onboarding",
    icon: HiOutlineDocumentReport,
    title: "Document Vault & Verification",
    description: "Digitally store contracts, ID proofs, and compliance paperwork with granular access permissions.",
    link: "/services#vault",
  },

  // Time & Attendance
  {
    category: "Time & Attendance",
    icon: BiTimeFive,
    title: "Biometric & Geo-Fenced Tracking",
    description: "Capture accurate check-ins from office biometrics or mobile devices with GPS verification.",
    link: "/services#attendance",
  },
  {
    category: "Time & Attendance",
    icon: BsCart4,
    title: "Leave & Holiday Management",
    description: "Configure multi-level leave policies, approval workflows, and regional holiday calendars easily.",
    link: "/services#leave",
  },
  {
    category: "Time & Attendance",
    icon: FaCogs,
    title: "Shift & Roster Scheduling",
    description: "Create rotating shifts, assign weekly rosters, and manage overtime rules with automated alerts.",
    link: "/services#shifts",
  },
  {
    category: "Time & Attendance",
    icon: TbDeviceAnalytics,
    title: "Regularization Workflows",
    description: "Allow employees to submit missed punch requests with instant manager notifications and tracking.",
    link: "/services#regularization",
  },

  // Payroll & Compliance
  {
    category: "Payroll & Compliance",
    icon: MdOutlineAttachMoney,
    title: "Automated Salary Processing",
    description: "Calculate gross-to-net pay with automated deductions, bonuses, and pro-rata adjustments in clicks.",
    link: "/services#payroll",
  },
  {
    category: "Payroll & Compliance",
    icon: FaFileInvoiceDollar,
    title: "Statutory Compliance (PF, ESI, TDS)",
    description: "Stay audit-ready with auto-generated statutory deduction reports and GST/TDS tax summaries.",
    link: "/services#compliance",
  },
  {
    category: "Payroll & Compliance",
    icon: HiOutlineDocumentReport,
    title: "One-Click Payslip Distribution",
    description: "Auto-generate secure PDF payslips and email them directly or publish to employee dashboards.",
    link: "/services#payslips",
  },
  {
    category: "Payroll & Compliance",
    icon: RiLineChartLine,
    title: "Reimbursements & Expense Claims",
    description: "Digitize expense claim approvals, receipt verification, and direct payroll reimbursement.",
    link: "/services#expenses",
  },

  // Performance & Culture
  {
    category: "Performance & Culture",
    icon: RiLineChartLine,
    title: "OKR & Goal Tracking",
    description: "Set company-wide, departmental, and individual objectives with real-time milestone tracking.",
    link: "/services#okr",
  },
  {
    category: "Performance & Culture",
    icon: BsPeopleFill,
    title: "360° Appraisal Reviews",
    description: "Run structured quarterly or annual performance reviews with self, peer, and manager feedback.",
    link: "/services#appraisals",
  },
  {
    category: "Performance & Culture",
    icon: MdPeopleOutline,
    title: "Continuous Feedback & Recognition",
    description: "Foster positive culture with peer badges, shout-outs, and instant manager praise.",
    link: "/services#feedback",
  },
  {
    category: "Performance & Culture",
    icon: TbWorldWww,
    title: "Training & Skill Development",
    description: "Track employee certifications, upskilling modules, and learning plans across teams.",
    link: "/services#training",
  },

  // Workforce Analytics
  {
    category: "Workforce Analytics",
    icon: TbDeviceAnalytics,
    title: "Real-Time HR Dashboards",
    description: "Visualize headcount metrics, attendance trends, and payroll costs across branches instantly.",
    link: "/services#dashboards",
  },
  {
    category: "Workforce Analytics",
    icon: RiLineChartLine,
    title: "Attrition & Retention Insights",
    description: "Analyze turnover rates, exit interview feedback, and department retention risks proactively.",
    link: "/services#retention",
  },
  {
    category: "Workforce Analytics",
    icon: HiOutlineDocumentReport,
    title: "Custom Report Builder",
    description: "Design custom reports with drag-and-drop columns and export cleanly to Excel, CSV, or PDF.",
    link: "/services#reports",
  },
  {
    category: "Workforce Analytics",
    icon: FaCogs,
    title: "Audit & Security Logs",
    description: "Maintain complete traceability with role-based access controls and detailed user action audit trails.",
    link: "/services#audit",
  },
];

const servicesStats = [
  { id: 1, value: "5", label: "Core Suites", description: "Onboarding, Payroll, Attendance, Performance & Analytics" },
  { id: 2, value: "20+", label: "Modules", description: "Comprehensive end-to-end HR coverage" },
  { id: 3, value: "99.9%", label: "Uptime", description: "Enterprise-grade AWS cloud reliability" },
  { id: 4, value: "24/7", label: "Support", description: "Dedicated SLA & account management" },
];

const featureHighlights = [
  {
    id: 1,
    label: "HRMS",
    title: "Smart Payroll & Attendance Engine",
    description:
      "Eliminate manual calculations and compliance headaches. Our intelligent payroll system auto-calculates salaries, handles tax deductions, and integrates seamlessly with biometric attendance tracking.",
    bullets: [
      "Auto-calculate salaries with statutory compliance",
      "Biometric & geo-fenced attendance integration",
      "One-click payslip generation & distribution",
      "Leave balance automation with approval workflows",
    ],
    gradient: "from-purple-600 to-indigo-600",
  },
  {
    id: 2,
    label: "Analytics",
    title: "Advanced Workforce Analytics",
    description:
      "Make data-driven HR decisions with real-time dashboards that visualize attrition trends, engagement scores, and workforce demographics in beautiful, actionable insights.",
    bullets: [
      "Real-time workforce health dashboards",
      "Predictive attrition & retention analytics",
      "Custom report builder with export options",
      "Department-wise performance benchmarking",
    ],
    gradient: "from-indigo-600 to-purple-600",
  },
  {
    id: 3,
    label: "Integration",
    title: "Seamless Platform Integration",
    description:
      "Connect HR Clouds with your existing tools effortlessly. Our platform integrates with popular accounting software, communication tools, and third-party apps through robust APIs.",
    bullets: [
      "Pre-built integrations with Tally, Zoho & more",
      "REST API for custom integrations",
      "Single sign-on (SSO) support",
      "Automated data sync across platforms",
    ],
    gradient: "from-purple-600 to-pink-500",
  },
];

export {
  links,
  reviewImgs,
  appStatsImgs,
  appStats,
  features,
  footerCols,
  footerSocials,
  pricingCards,
  testimonials,
  Solutions,
  servicesStats,
  featureHighlights,
};
