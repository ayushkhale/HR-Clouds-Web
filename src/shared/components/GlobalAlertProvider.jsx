import React, { useState, useEffect } from "react";

export function GlobalAlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [confirms, setConfirms] = useState([]);

  useEffect(() => {
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    
    // Override window.alert
    window.alert = (message) => {
      setAlerts((prev) => [...prev, String(message)]);
    };

    // Override window.confirm as an async function
    window.confirm = (message) => {
      return new Promise((resolve) => {
        setConfirms((prev) => [
          ...prev, 
          { message: String(message), resolve }
        ]);
      });
    };

    return () => {
      // Restore original alert and confirm on unmount
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    };
  }, []);

  const closeAlert = () => {
    setAlerts((prev) => prev.slice(1));
  };

  const resolveConfirm = (result) => {
    if (confirms.length > 0) {
      confirms[0].resolve(result);
      setConfirms((prev) => prev.slice(1));
    }
  };

  return (
    <>
      {children}

      {/* Alert Modal */}
      {alerts.length > 0 && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-10 sm:pt-16 bg-black/20 backdrop-blur-sm transition-opacity">
          <div className="bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl shadow-2xl rounded-[14px] w-full max-w-[320px] overflow-hidden animate-in fade-in slide-in-from-top-10 duration-300">
            <div className="p-6 text-center min-h-[90px] flex items-center justify-center">
              <p className="text-gray-900 dark:text-gray-100 text-[14px] font-medium leading-relaxed">
                {alerts[0]}
              </p>
            </div>
            <div className="border-t border-gray-300/50 dark:border-gray-700/50">
              <button
                onClick={closeAlert}
                className="w-full py-3.5 text-[#007AFF] font-semibold text-[16px] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors focus:outline-none"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirms.length > 0 && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-10 sm:pt-16 bg-black/20 backdrop-blur-sm transition-opacity">
          <div className="bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl shadow-2xl rounded-[14px] w-full max-w-[320px] overflow-hidden animate-in fade-in slide-in-from-top-10 duration-300">
            <div className="p-6 text-center min-h-[90px] flex items-center justify-center">
              <p className="text-gray-900 dark:text-gray-100 text-[14px] font-medium leading-relaxed">
                {confirms[0].message}
              </p>
            </div>
            <div className="border-t border-gray-300/50 dark:border-gray-700/50 flex">
              <button
                onClick={() => resolveConfirm(false)}
                className="flex-1 py-3.5 border-r border-gray-300/50 dark:border-gray-700/50 text-[#007AFF] font-semibold text-[16px] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors focus:outline-none"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className="flex-1 py-3.5 text-[#007AFF] font-semibold text-[16px] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors focus:outline-none"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
