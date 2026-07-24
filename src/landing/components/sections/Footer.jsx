import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaInstagram, FaYoutube, FaArrowRight } from "react-icons/fa";
import { FiSend } from "react-icons/fi";
import hrcloudsLogo from "../../../assets/logo2.png";

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
    heading: "Support & Legal",
    links: [
      { name: "Help Center", path: "#" },
      { name: "Privacy Policy", path: "#" },
      { name: "Terms of Service", path: "#" },
      { name: "Statutory Guidelines", path: "#" },
    ],
  },
];

const socialLinks = [
  { icon: <FaLinkedinIn />, href: "https://linkedin.com", label: "LinkedIn" },
  { icon: <FaTwitter />, href: "https://twitter.com", label: "Twitter" },
  { icon: <FaFacebookF />, href: "https://facebook.com", label: "Facebook" },
  { icon: <FaInstagram />, href: "https://instagram.com", label: "Instagram" },
];

function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <footer className="bg-primary-500 text-white relative overflow-hidden pt-20 pb-12">
      {/* Background Glow Accents */}
      <div className="left-[-10%] top-0 absolute bg-gradient-to-l from-white to-transparent opacity-10 blur-3xl rounded-[50%] w-[40rem] h-40 -rotate-45 pointer-events-none" />
      <div className="bottom-0 right-[-10%] absolute bg-gradient-to-r from-purple-500/20 to-transparent blur-3xl rounded-[50%] w-[35rem] h-40 pointer-events-none" />

      <div className="max-w-[90rem] mx-auto px-4 sm:px-8 md:px-16 xl:px-24">
        
        {/* Top Grid (Brand, Links, Newsletter) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 pb-16">
          
          {/* Brand Info (Span 2 cols on lg) */}
          <div className="lg:col-span-2 space-y-6">
            <Link to="/" className="inline-block">
              <img 
                src={hrcloudsLogo} 
                alt="HR Clouds" 
                className="h-14 sm:h-16 w-auto object-contain brightness-0 invert" 
              />
            </Link>
            <p className="text-gray-300 text-base leading-relaxed max-w-md font-light">
              Empowering organizations across India with automated payroll, ESI/PF statutory compliance engines, biometric attendance, and intelligent HR analytics.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-3 pt-2">
              {socialLinks.map((item, idx) => (
                <a
                  key={idx}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-purple-600 hover:scale-110 transition-all duration-300 border border-white/10"
                >
                  {item.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links (Columns 1 & 2) */}
          {footerCols.slice(0, 2).map((col, idx) => (
            <div key={idx} className="space-y-4">
              <h4 className="text-lg font-bold text-white tracking-wide">{col.heading}</h4>
              <ul className="space-y-3">
                {col.links.map((link, lIdx) => (
                  <li key={lIdx}>
                    <Link
                      to={link.path}
                      className="text-gray-300 hover:text-purple-300 transition-colors duration-200 text-sm flex items-center gap-2 group"
                    >
                      <span className="opacity-0 -ml-3 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200 text-xs">
                        ›
                      </span>
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter Box */}
          <div className="space-y-4">
            <h4 className="text-lg font-bold text-white tracking-wide">Stay Updated</h4>
            <p className="text-gray-300 text-sm font-light leading-relaxed">
              Subscribe to get latest HR compliance updates and feature announcements.
            </p>

            <form onSubmit={handleSubscribe} className="space-y-3">
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:bg-white/15 transition-all duration-200 pr-10"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-purple-500 to-purple-400 text-white rounded-lg hover:opacity-90 transition-opacity"
                  aria-label="Subscribe"
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
          <p>© {new Date().getFullYear()} HR Vista Soft Solutions LLP. All rights reserved.</p>
          
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
