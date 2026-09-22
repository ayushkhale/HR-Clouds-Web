import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

const SidebarContext = createContext();

export function SidebarProvider({ children }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // The sidebar publishes its menu here so the top bar's page search and
  // notification bell use exactly the pages and inbox the sidebar shows.
  const [nav, setNavState] = useState({ items: [], inbox: null });
  const location = useLocation();

  const setNav = useCallback((next) => {
    setNavState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsMobileSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileSidebarOpen]);

  return (
    <SidebarContext.Provider value={{ isMobileSidebarOpen, toggleSidebar, closeSidebar, nav, setNav }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
