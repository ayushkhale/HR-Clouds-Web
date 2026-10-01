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
      // Only the properties that actually change — transition-all would also
      // animate layout properties and force work the compositor can't absorb.
      // z-[60] sits above every landing section (none go past z-50) but below
      // the Maya panel at z-[70] and well below the modal band at z-[100]+.
      // It used to be z-[100], level with dialogs, which is why an enlarged
      // chat window was painted over by the navbar.
      className={`fixed top-0 left-0 right-0 z-[60] transition-[padding,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
        scrolled 
          // No backdrop-blur here: the nav pill inside already blurs, and
          // stacking two backdrop filters produced a visible smear band.
          ? "py-3 bg-white/70 shadow-[0_4px_30px_rgba(0,0,0,0.04)] border-b border-white/40" 
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
