import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiInformationCircle,
  HiX,
  HiArrowRight,
  HiShieldExclamation,
} from "react-icons/hi";

const ToastContext = createContext(null);

export const TOAST_EVENT = "hrclouds:toast";

/**
 * Global helper to trigger a toast from anywhere (even outside React tree).
 * @param {Object} options
 * @param {string} options.message - The toast message
 * @param {string} [options.title] - Optional title for the notification
 * @param {'success'|'error'|'info'|'warning'} [options.type='success']
 * @param {number} [options.duration] - Milliseconds before auto-dismiss (default: 5000, 7000 for error)
 * @param {Object} [options.action] - Optional action { label, to, onClick }
 */
export function showGlobalToast(options) {
  if (typeof window === "undefined") return;
  const detail = typeof options === "string" ? { message: options, type: "success" } : options;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export function useToastNotification() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: showGlobalToast,
      showSuccess: (message, opts) => showGlobalToast({ message, type: "success", ...opts }),
      showError: (message, opts) => showGlobalToast({ message, type: "error", ...opts }),
      showInfo: (message, opts) => showGlobalToast({ message, type: "info", ...opts }),
      showWarning: (message, opts) => showGlobalToast({ message, type: "warning", ...opts }),
    };
  }
  return ctx;
}

export function GlobalNotificationToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((item) => {
    const id = item.id || `toast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const type = item.type || "success";
    const duration = item.duration || (type === "error" ? 7000 : 5000);

    const newToast = {
      id,
      title: item.title,
      message: item.message || "",
      type,
      action: item.action, // { label, to, onClick }
      duration,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      // Keep at most 3 toasts visible at once, oldest dropped
      const next = [...prev, newToast];
      if (next.length > 3) return next.slice(next.length - 3);
      return next;
    });

    return id;
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail) {
        addToast(e.detail);
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [addToast]);

  const contextValue = {
    showToast: addToast,
    removeToast,
    showSuccess: (message, opts) => addToast({ message, type: "success", ...opts }),
    showError: (message, opts) => addToast({ message, type: "error", ...opts }),
    showInfo: (message, opts) => addToast({ message, type: "info", ...opts }),
    showWarning: (message, opts) => addToast({ message, type: "warning", ...opts }),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Floating notification container in top-right corner */}
      <aside
        aria-live="polite"
        aria-atomic="true"
        aria-label="Notifications"
        className="fixed top-5 right-5 sm:top-6 sm:right-6 z-[99999] flex flex-col gap-3 max-w-sm sm:max-w-md w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <NotificationToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

function NotificationToastItem({ toast, onClose }) {
  const { title, message, type, action, duration } = toast;
  const isError = type === "error";
  const isWarning = type === "warning";
  const isInfo = type === "info";

  const timerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    timerRef.current = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timerRef.current);
  }, [duration, onClose, paused]);

  // Color schemes strictly aligned with HR Clouds Purple palette (uirule.md)
  const styles = isError
    ? {
        border: "border-2 border-rose-200 ring-1 ring-rose-500/10",
        shadow: "shadow-2xl shadow-rose-950/10",
        iconBg: "bg-rose-50 text-rose-600 border border-rose-200",
        Icon: HiExclamationCircle,
        titleColor: "text-slate-900",
        barColor: "bg-rose-500",
        actionBtn: "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20",
      }
    : isWarning
    ? {
        border: "border-2 border-amber-200 ring-1 ring-amber-500/10",
        shadow: "shadow-2xl shadow-amber-950/10",
        iconBg: "bg-amber-50 text-amber-600 border border-amber-200",
        Icon: HiShieldExclamation,
        titleColor: "text-slate-900",
        barColor: "bg-amber-500",
        actionBtn: "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20",
      }
    : isInfo
    ? {
        border: "border-2 border-indigo-200 ring-1 ring-indigo-500/10",
        shadow: "shadow-2xl shadow-indigo-950/10",
        iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-200",
        Icon: HiInformationCircle,
        titleColor: "text-slate-900",
        barColor: "bg-indigo-500",
        actionBtn: "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20",
      }
    : {
        border: "border-2 border-purple-200 ring-1 ring-purple-500/10",
        shadow: "shadow-2xl shadow-purple-950/10",
        iconBg: "bg-purple-50 text-purple-600 border border-purple-200",
        Icon: HiCheckCircle,
        titleColor: "text-slate-900",
        barColor: "bg-purple-600",
        actionBtn: "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20",
      };

  const { Icon } = styles;

  return (
    <div
      role={isError ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative w-full bg-white rounded-2xl p-4 transition-all duration-300 ${styles.border} ${styles.shadow}`}
    >
      <div className="flex items-start gap-3.5">
        {/* Leading icon */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${styles.iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          {title ? (
            <h4 className={`text-xs sm:text-sm font-bold leading-snug mb-0.5 ${styles.titleColor}`}>
              {title}
            </h4>
          ) : (
            isError && (
              <h4 className="text-xs sm:text-sm font-bold leading-snug mb-0.5 text-slate-900">
                Action Required
              </h4>
            )
          )}
          <p className="text-xs text-slate-600 font-medium leading-relaxed break-words">
            {message}
          </p>

          {/* Optional Action (e.g. Register this device) */}
          {action && (
            <div className="mt-2.5">
              {action.to ? (
                <Link
                  to={action.to}
                  onClick={onClose}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${styles.actionBtn}`}
                >
                  <span>{action.label}</span>
                  <HiArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    action.onClick?.();
                    onClose();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${styles.actionBtn}`}
                >
                  <span>{action.label}</span>
                  <HiArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
        >
          <HiX className="w-4 h-4" />
        </button>
      </div>

      {/* Auto dismiss countdown bar */}
      <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${styles.barColor} transition-all`}
          style={{
            animation: `shrinkWidth ${duration}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      </div>

      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export default GlobalNotificationToastProvider;
