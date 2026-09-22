import { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import GetStartedLink from "../../../../shared/components/GetStartedLink";
import { HiOutlineMenu, HiOutlineX } from "react-icons/hi";
import hrcloudsLogo from "../../../../assets/logo2.png";
import { HOVER, STAGGER, EASE_ENTER } from "../../../../shared/motion";

const links = [
  { name: "Home", path: "/" },
  { name: "About", path: "/about" },
  { name: "Services", path: "/services" },
  { name: "Pricing", path: "/pricing" },
];

/* Desktop nav item. The underline grows from the centre on hover and stays put
   when the route is active, so hovering previews the state the link leads to
   rather than inventing a separate effect. */
const navItem = ({ isActive }) =>
  `relative text-sm font-medium transition-colors duration-200 hover:text-purple-700 after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-full after:origin-center after:rounded-full after:bg-purple-600 after:transition-transform after:duration-300 after:ease-out motion-reduce:after:transition-none ${
    isActive
      ? "text-purple-800 font-semibold after:scale-x-100"
      : "text-gray-600 after:scale-x-0 hover:after:scale-x-100"
  }`;

function Navigation() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const panelRef = useRef(null);

  // Close the mobile menu on navigation — without this it stays open behind
  // the new page.
  useEffect(() => setOpen(false), [location.pathname]);

  // Escape closes it, and a click outside dismisses it, the way a menu should.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onPointer = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <nav className="flex items-center justify-between">
      {/* Logo */}
      <Link to="/" className="flex-shrink-0 group" aria-label="HR Clouds — home">
        <img
          src={hrcloudsLogo}
          alt="HR Clouds"
          className="h-14 sm:h-16 w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
        />
      </Link>

      {/* Desktop Menu - Glassmorphism Nav Pill */}
      <div className="hidden lg:flex items-center gap-8 bg-white/40 px-8 py-2.5 rounded-full border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.04)] backdrop-blur-md supports-[backdrop-filter]:bg-white/30 transition-shadow duration-300 hover:shadow-[0_6px_30px_rgba(0,0,0,0.07)]">
        {links.map((link) => (
          <NavLink key={link.name} to={link.path} className={navItem}>
            {link.name}
          </NavLink>
        ))}
      </div>

      {/* Action Buttons - Linked to Auth */}
      <div className="hidden lg:flex items-center gap-4">
        <Link
          to="/auth/login"
          className="text-sm font-semibold text-gray-700 hover:text-purple-700 transition-colors duration-200 px-3 py-2"
        >
          Sign In
        </Link>
        <GetStartedLink
          className={`px-6 py-2.5 text-sm font-bold text-primary-800 bg-gradient-to-t from-purple-500 to-purple-200 rounded-full shadow-md hover:shadow-[0_0_25px_rgba(139,92,246,0.35)] hover:text-white cursor-pointer transition-[transform,box-shadow,color] duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none`}
        >
          Get Started
        </GetStartedLink>
      </div>

      {/* Mobile Menu Button */}
      <div className="lg:hidden relative" ref={panelRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="text-2xl text-gray-800 z-50 p-2 relative transition-transform duration-200 active:scale-90 motion-reduce:transform-none"
        >
          {/* The two icons cross-fade and counter-rotate in place, so the
              button never jumps as the glyph swaps. */}
          <span className="relative block w-6 h-6">
            <HiOutlineMenu
              className={`absolute inset-0 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
                open ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
              }`}
            />
            <HiOutlineX
              className={`absolute inset-0 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
                open ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"
              }`}
            />
          </span>
        </button>

        {/* Mobile Menu Overlay — kept mounted so it can animate both ways, and
            made inert when closed so it takes no focus and no screen reader. */}
        <div
          id="mobile-nav"
          aria-hidden={!open}
          {...(open ? {} : { inert: "" })}
          style={{ transitionTimingFunction: EASE_ENTER }}
          className={`absolute top-14 right-0 w-[240px] origin-top-right bg-white/80 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] border border-white/50 rounded-2xl p-6 z-40 flex flex-col gap-5 transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
            open
              ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
              : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
          }`}
        >
          {links.map((link, i) => (
            <NavLink
              key={link.name}
              to={link.path}
              onClick={() => setOpen(false)}
              // Items cascade in behind the panel once it has opened.
              style={{
                transitionDelay: open ? `${120 + i * STAGGER.tight}ms` : "0ms",
                transitionTimingFunction: EASE_ENTER,
              }}
              className={({ isActive }) =>
                `block text-base transition-[color,opacity,transform] duration-300 motion-reduce:transition-none ${
                  open ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
                } ${
                  isActive
                    ? "text-purple-800 font-semibold"
                    : "text-gray-700 hover:text-purple-700"
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}

          <div className="h-px w-full bg-gray-200/50 my-2"></div>

          <Link
            to="/auth/login"
            onClick={() => setOpen(false)}
            className="w-full px-4 py-2 font-semibold text-center text-gray-700 hover:text-purple-700 text-sm rounded-xl transition-colors duration-200 block"
          >
            Sign In
          </Link>

          <GetStartedLink
            onNavigate={() => setOpen(false)}
            className={`w-full px-4 py-2 font-bold text-center text-primary-800 hover:text-white text-sm bg-gradient-to-t from-purple-500 to-purple-200 rounded-xl shadow-md cursor-pointer block ${HOVER.lift}`}
          >
            Get Started
          </GetStartedLink>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
