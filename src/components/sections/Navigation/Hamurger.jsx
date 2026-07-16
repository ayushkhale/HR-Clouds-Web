import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import hamburger from "../../../assets/hamburger.svg";
import { HiOutlineX } from "react-icons/hi";

const links = ["Home", "About", "Services", "Pricing"];

function Hamurger() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setOpen(!open);

  return (
    <div className="lg:hidden relative z-50">
      <button onClick={toggleMenu}>
        {open ? (
          <HiOutlineX className="w-6 h-6 text-primary-800" />
        ) : (
          <img
            src={hamburger}
            alt="Hamburger menu"
            className="w-6 h-6 transition-all duration-200 hover:-rotate-90"
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-60 bg-white shadow-lg rounded-lg p-5 space-y-4">
          {links.map((link) => {
            const slug = "/" + link.toLowerCase().replace(/\s+/g, "-");
            const path = slug === "/home" ? "/" : slug;
            const isActive = location.pathname === path;

            return (
              <Link
                key={link}
                to={path}
                onClick={() => setOpen(false)}
                className={`block text-base font-medium ${
                  isActive
                    ? "text-purple-800 font-semibold"
                    : "text-primary-800 hover:text-purple-800"
                }`}
              >
                {link}
              </Link>
            );
          })}

          <hr />

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setOpen(false); }}
            className="block text-left w-full text-base font-medium text-primary-800 hover:text-purple-800 cursor-pointer"
          >
            Sign in
          </button>

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setOpen(false); }}
            className="w-full px-4 py-2 rounded-md font-bold text-primary-800 text-sm bg-gradient-to-t from-purple-500 to-purple-200 hover:text-white cursor-pointer transition-all duration-200"
          >
            Get Started
          </button>
        </div>
      )}
    </div>
  );
}

export default Hamurger;
