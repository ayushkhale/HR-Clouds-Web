import React, { useState, useEffect, useRef } from "react";

const AnimateOnScroll = ({ children, animation = "slide-up", delay = 0, className = "" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  const delayStyle = delay ? { animationDelay: `${delay}ms` } : {};

  return (
    <div
      ref={ref}
      style={delayStyle}
      className={`${className} ${
        isVisible ? `animate-${animation} opacity-100` : "opacity-0 translate-y-6"
      } transition-all duration-700 ease-out`}
    >
      {children}
    </div>
  );
};

export default AnimateOnScroll;
