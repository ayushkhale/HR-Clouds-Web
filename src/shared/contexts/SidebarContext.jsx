import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

const SidebarContext = createContext();

export function SidebarProvider({ children }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();

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
    <SidebarContext.Provider value={{ isMobileSidebarOpen, toggleSidebar, closeSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
