import React, { useState, useEffect } from "react";

function Header({ children }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        scrolled 
          ? "py-3 bg-white/50 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.04)] border-b border-white/40 supports-[backdrop-filter]:bg-white/40" 
          : "py-5 bg-transparent"
      }`}
    >
      <div className="max-w-[90rem] mx-auto px-4 sm:px-8 md:px-16 xl:px-24">
        {children}
      </div>
    </header>
  );
}

export default Header;
