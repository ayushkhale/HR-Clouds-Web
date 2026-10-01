// useToast — one toast at a time. Each new toast resets the timer, so an older
// timeout can no longer hide a newer message early. Errors stay a little longer.
import { useCallback, useEffect, useRef, useState } from "react";

export default function useToast(duration = 5000) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const hideToast = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const showToast = useCallback((message, type = "success") => {
    clearTimeout(timer.current);
    setToast({ message, type, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), type === "error" ? duration + 3000 : duration);
  }, [duration]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, showToast, hideToast };
}
