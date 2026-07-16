import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaInstagram, FaYoutube, FaArrowRight } from "react-icons/fa";
import { FiSend } from "react-icons/fi";
import hrcloudsLogo from "../../assets/logo2.png";

const footerCols = [
  {
    heading: "Company",
    links: [
      { name: "About Us", path: "/about" },
      { name: "Services & Modules", path: "/services" },
      { name: "Pricing Plans", path: "/pricing" },
    ],
  },
  {
    heading: "HR Modules",
    links: [
      { name: "Payroll Automation", path: "/services" },
      { name: "Leave & Attendance", path: "/services" },
      { name: "Employee Onboarding", path: "/services" },
      { name: "Performance & OKRs", path: "/services" },
    ],
  },
  {
    heading: "Platform & Security",
    links: [
      { name: "Compare Plans", path: "/pricing" },
      { name: "Enterprise Architecture", path: "/services" },
      { name: "Statutory Compliance", path: "/services" },
    ],
  },
];

const socialLinks = [
  { icon: FaFacebookF, url: "#", name: "Facebook", hoverColor: "hover:bg-blue-600 hover:shadow-blue-500/30" },
  { icon: FaTwitter, url: "#", name: "Twitter", hoverColor: "hover:bg-sky-500 hover:shadow-sky-500/30" },
  { icon: FaLinkedinIn, url: "#", name: "LinkedIn", hoverColor: "hover:bg-blue-700 hover:shadow-blue-700/30" },
  { icon: FaInstagram, url: "#", name: "Instagram", hoverColor: "hover:bg-gradient-to-tr hover:from-yellow-500 hover:via-pink-500 hover:to-purple-500 hover:shadow-pink-500/30" },
  { icon: FaYoutube, url: "#", name: "YouTube", hoverColor: "hover:bg-red-600 hover:shadow-red-500/30" },
];

function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 5000);
    }
  };

  return (
    <footer className="w-full bg-[#110f14] text-white pt-20 pb-8 relative overflow-hidden border-t border-white/5">
      {/* Decorative Gradient Background Glows */}
      <div className="absolute bottom-0 right-0 w-[40rem] h-[30rem] bg-purple-900/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-0 left-10 w-[20rem] h-[20rem] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[90rem] mx-auto px-4 sm:px-8 md:px-16 xl:px-24">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-12 lg:gap-8 pb-16">
          
          {/* Logo & Description Column (Spans 2 columns) */}
          <div className="lg:col-span-2 flex flex-col justify-start">
            <Link to="/" className="inline-block mb-6 group">
              <img 
                src={hrcloudsLogo} 
                alt="HR Clouds" 
                className="h-16 md:h-18 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02] brightness-0 invert" 
              />
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed mb-8 max-w-sm">
              Simplifying HR management and payroll processing for modern organizations. From onboarding to exit, all in one intelligent cloud workspace.
            </p>
            
            {/* Social Icons */}
            <div className="flex flex-wrap gap-3">
              {socialLinks.map(({ icon: Icon, url, name, hoverColor }) => (
                <a
                  key={name}
                  href={url}
                  aria-label={name}
                  className={`w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 transition-all duration-300 hover:text-white hover:border-transparent hover:-translate-y-1 hover:shadow-lg ${hoverColor}`}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          {footerCols.map((col) => (
            <div key={col.heading} className="lg:col-span-1">
              <h3 className="text-sm font-semibold tracking-wider uppercase text-white mb-6 relative inline-block after:content-[''] after:absolute after:left-0 after:bottom-[-6px] after:w-8 after:h-[2px] after:bg-purple-500">
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-y-3.5">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      to={link.path}
                      className="text-gray-400 text-sm hover:text-white hover:translate-x-1.5 transition-all duration-300 inline-block"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter Column (Spans 1 column) */}
          <div className="lg:col-span-1">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-white mb-6 relative inline-block after:content-[''] after:absolute after:left-0 after:bottom-[-6px] after:w-8 after:h-[2px] after:bg-purple-500">
              Newsletter
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-5">
              Subscribe to get the latest HR trends and guides.
            </p>
            <form onSubmit={handleSubscribe} className="relative flex flex-col gap-2">
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  aria-label="Subscribe"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white transition-colors duration-200"
                >
                  <FiSend className="w-4 h-4" />
                </button>
              </div>
              {subscribed && (
                <span className="text-xs text-green-400 font-medium animate-pulse">
                  Subscribed successfully!
                </span>
              )}
            </form>
          </div>

        </div>

        {/* Bottom Bar (Divider & Credits) */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} HR Clouds. All rights reserved.</p>
          


          <div className="flex gap-x-6">
            <a href="#" className="hover:text-white transition-colors duration-200">Privacy</a>
            <a href="#" className="hover:text-white transition-colors duration-200">Terms</a>
            <a href="#" className="hover:text-white transition-colors duration-200">Cookies</a>
          </div>
        </div>

      </div>
    </footer>
  );
}

export default Footer;
