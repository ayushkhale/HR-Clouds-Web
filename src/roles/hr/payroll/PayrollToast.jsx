import { HiCheckCircle, HiExclamationCircle, HiX } from "react-icons/hi";

// Sits above DetailDialog (z-140) and ReasonDialog (z-170) so feedback is never hidden.
export default function PayrollToast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`fixed top-5 right-5 left-5 sm:left-auto sm:max-w-md z-[210] flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-purple-50 text-purple-800 border border-purple-200"}`}
    >
      {isError ? <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" /> : <HiCheckCircle className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss message" className="shrink-0">
        <HiX className="w-4 h-4 opacity-50 hover:opacity-100" />
      </button>
    </div>
  );
}
