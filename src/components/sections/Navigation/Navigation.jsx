import React, { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { HiOutlineMenu, HiOutlineX } from "react-icons/hi";
import hrcloudsLogo from "../../../assets/logo2.png";

const links = [
  { name: "Home", path: "/" },
  { name: "About", path: "/about" },
  { name: "Services", path: "/services" },
  { name: "Pricing", path: "/pricing" },
];

function Navigation() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setOpen(!open);

  return (
    <nav className="flex items-center justify-between">
      {/* Logo */}
      <Link to="/" className="flex-shrink-0">
        <img src={hrcloudsLogo} alt="HR Clouds" className="h-14 sm:h-16 w-auto object-contain" />
      </Link>

      {/* Desktop Menu - Glassmorphism Nav Pill */}
      <div className="hidden lg:flex items-center gap-8 bg-white/40 px-8 py-2.5 rounded-full border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.04)] backdrop-blur-md supports-[backdrop-filter]:bg-white/30">
        {links.map((link) => (
          <NavLink
            key={link.name}
            to={link.path}
            className={({ isActive }) =>
              `text-sm font-medium transition-all duration-200 hover:text-purple-700 ${
                isActive ? "text-purple-800 font-semibold drop-shadow-sm" : "text-gray-600"
              }`
            }
          >
            {link.name}
          </NavLink>
        ))}
      </div>

      {/* Action Buttons - Do not navigate anywhere */}
      <div className="hidden lg:flex items-center gap-5">
        <button 
          type="button" 
          onClick={(e) => e.preventDefault()} 
          className="text-sm font-medium text-gray-600 hover:text-purple-800 transition-colors cursor-pointer"
        >
          Sign In
        </button>
        <button 
          type="button"
          onClick={(e) => e.preventDefault()} 
          className="px-6 py-2.5 text-sm font-bold text-primary-800 bg-gradient-to-t from-purple-500 to-purple-200 rounded-full shadow-md hover:drop-shadow-[0_0px_25px_rgba(139,92,246,0.3)] hover:text-white hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
        >
          Get Started
        </button>
      </div>

      {/* Mobile Menu Button */}
      <div className="lg:hidden relative">
        <button onClick={toggleMenu} className="text-2xl text-gray-800 z-50 p-2 relative">
          {open ? <HiOutlineX /> : <HiOutlineMenu />}
        </button>

        {/* Mobile Menu Overlay */}
        {open && (
          <div className="absolute top-14 right-0 w-[240px] bg-white/80 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] border border-white/50 rounded-2xl p-6 z-40 flex flex-col gap-5">
            {links.map((link) => (
              <NavLink
                key={link.name}
                to={link.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block text-base transition-colors ${
                    isActive ? "text-purple-800 font-semibold" : "text-gray-700 hover:text-purple-700"
                  }`
                }
              >
                {link.name}
              </NavLink>
            ))}
            
            <div className="h-px w-full bg-gray-200/50 my-2"></div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block text-left text-base text-gray-700 hover:text-purple-800 cursor-pointer"
            >
              Sign In
            </button>
            
            <button 
              type="button" 
              onClick={() => setOpen(false)}
              className="w-full px-4 py-2 mt-1 font-bold text-primary-800 hover:text-white text-sm bg-gradient-to-t from-purple-500 to-purple-200 rounded-xl shadow-md cursor-pointer transition-all duration-200"
            >
              Get Started
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navigation;
